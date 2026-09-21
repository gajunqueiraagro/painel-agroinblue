/**
 * A CARGA DE MANDIOCA — as três RPCs que gravam, corrigem e cancelam.
 *
 * ⚠ TODA ESCRITA PASSA POR RPC, nenhuma por `insert` daqui. Uma carga de entrega direta não é só
 * uma linha de `agri_colheita`: ela nasce junto de até seis lançamentos financeiros (venda, ICMS,
 * Funrural, arranquio, frete, carregamento) e dos vínculos que os amarram por `papel`. Gravar a
 * colheita pela tela e os lançamentos "depois" deixaria a metade de fora no primeiro erro de rede.
 * ⚠ AS TRÊS FALAM DIALETOS DIFERENTES, e o front tem de saber disso:
 *   · `registrar` devolve o objeto da carga e NÃO traz `ok` — sucesso é não ter exceção;
 *   · `cancelar` devolve `{ok:false, travados[]}` quando algum lançamento já foi realizado ou
 *     conciliado, e aí NADA foi tocado;
 *   · `corrigir` é cancelar + registrar, então herda o `{ok:false}` do primeiro.
 * Ler `ok !== false` é o único teste que serve para as três.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LancamentoDaCarga } from '@/lib/agri/compromissosDaCarga';

/** Um lançamento que impede o cancelamento — já realizado ou conciliado. */
export interface LancamentoTravado {
  lancamento_id: string;
  descricao: string | null;
  status: string | null;
}

export interface RespostaCarga {
  ok: boolean;
  erro?: string;
  travados?: LancamentoTravado[];
  /** Só no sucesso de `registrar`/`corrigir`. */
  valorBruto?: number | null;
  toneladas?: number | null;
  servicosTotal?: number | null;
  icmsLancado?: boolean;
}

/**
 * Os três serviços que a carga paga por tonelada — PR-CARGA-MANDIOCA-COMPROMISSOS-01.
 *
 * ⚠ OS NOMES MUDARAM, e não é renomeação cosmética: cada um passou a ter SUBCENTRO PRÓPRIO.
 * 'arranquio' virou 'mao_obra' (13100 Diaristas e Empreita Lavoura) e 'carregamento' virou
 * 'trator' (13160 Serviços Mecanizados Terceirizados). Antes os dois caíam em 13110 porque a RPC
 * resolvia o plano com dois destinos para três serviços.
 * ⚠ E OS NOMES ANTIGOS AINDA EXISTEM NO BANCO — 42 lançamentos do backfill de 16/09. Enquanto a
 * reclassificação não roda (frente própria), a `proposta()` abaixo não acha o preço deles: ela
 * procura por `papel`, e 'arranquio' não está mais nesta lista. O campo abre em branco, que é o
 * que já acontece ao reabrir qualquer carga. O frete não muda de nome e segue propondo.
 */
export type TipoServico = 'frete' | 'trator' | 'mao_obra';

export const TIPOS_SERVICO: ReadonlyArray<{ tipo: TipoServico; rotulo: string }> = [
  { tipo: 'frete', rotulo: 'Frete' },
  { tipo: 'trator', rotulo: 'Trator' },
  { tipo: 'mao_obra', rotulo: 'Mão de obra' },
];

/**
 * O que a última carga desta área ensina para a próxima.
 *
 * ⚠ A CONTA ENTROU AQUI — PR-CARGA-MANDIOCA-COMPROMISSOS-01 — e não é palpite: é a conta que
 * pagou a carga anterior do mesmo talhão. O NJ tem dez contas correntes ativas; inferir por
 * qualquer outra regra erraria. Isto é PROPOSTA, no mesmo contrato dos preços: entra preenchida e
 * o operador confere antes de salvar.
 */
export interface PropostaDaUltimaCarga {
  servicos: PropostaServico[];
  contaId: string | null;
}

export interface ServicoDaCarga {
  tipo: TipoServico;
  fornecedor_id: string | null;
  /** R$ por tonelada — o que o prestador cobra, não o total da carga. */
  preco_t: number | null;
}

export interface ParametrosCarga {
  clienteId: string;
  safraAreaId: string;
  data: string;
  industriaId: string;
  nf: string | null;
  ticket: string | null;
  pesoBrutoKg: number;
  descontoKg: number;
  rendimentoG: number;
  precoG: number;
  servicos: ServicoDaCarga[];
  icms: number | null;
  funrural: number | null;
  observacao: string | null;
  /**
   * ⚠ A CONTA QUE PAGA — e sem ela o compromisso não existe para a conciliação.
   * Nenhum INSERT da RPC gravava conta; as cargas de hoje só têm porque um backfill as carimbou
   * em 17/09. `fn_extrato_conciliar_mes` escolhe candidatos por `conta_efetiva_id`: carga sem
   * conta some da conciliação sem erro nenhum. A RPC grava por direção — entrada no destino,
   * saída na origem.
   */
  contaId: string | null;
  /** Retido da venda, como o Funrural (dedução). */
  inss: number | null;
  /** Custo SOBRE O FRETE (13090), não dedução de venda — por isso não é `icms`. */
  icmsTransporte: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

/**
 * ⚠ O ESTREITAMENTO SEM `as` — a mesma regra de `usePainelSafra`. `Object.entries` aceita o
 * `object` que o `typeof` provou e devolve pares tipados, então a cópia nasce com a forma certa
 * por construção, em vez de por afirmação.
 */
function objeto(v: unknown): Record<string, unknown> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return {};
  const saida: Record<string, unknown> = {};
  for (const [k, valor] of Object.entries(v)) saida[k] = valor;
  return saida;
}

function lerTravados(v: unknown): LancamentoTravado[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => {
    const o = objeto(x);
    return {
      lancamento_id: String(o.lancamento_id ?? ''),
      descricao: o.descricao == null ? null : String(o.descricao),
      status: o.status == null ? null : String(o.status),
    };
  });
}

/** A resposta de qualquer uma das três, no mesmo idioma. */
function lerResposta(r: unknown): RespostaCarga {
  const o = objeto(r);
  /* ⚠ `ok` AUSENTE É SUCESSO, e não falta de resposta: `registrar` devolve a carga gravada sem
     envelope. Testar `o.ok === true` reprovaria toda gravação bem-sucedida. */
  if (o.ok === false) {
    return {
      ok: false,
      erro: o.motivo == null ? undefined : String(o.motivo),
      travados: lerTravados(o.travados),
    };
  }
  return {
    ok: true,
    valorBruto: num(o.valor_bruto),
    toneladas: num(o.toneladas),
    servicosTotal: num(o.servicos_total),
    icmsLancado: o.icms_lancado === true,
  };
}

const servicosParaRpc = (servicos: readonly ServicoDaCarga[]) => servicos
  /* ⚠ SÓ O QUE TEM PRESTADOR E PREÇO: a RPC pula preço zero, mas levanta exceção quando o
     `fornecedor_id` não resolve — mandar a linha vazia derrubaria a gravação inteira. */
  .filter(s => s.fornecedor_id && s.preco_t != null && s.preco_t > 0)
  .map(s => ({ tipo: s.tipo, fornecedor_id: s.fornecedor_id, preco_t: s.preco_t }));

export function useCargaMandioca() {
  /**
   * Grava uma carga nova.
   *
   * ⚠ O ERRO DO BANCO VAI INTEIRO PARA A TELA — a RPC recusa por exceção nomeada ("peso bruto
   * obrigatorio", "talhao sem fazenda", "esta RPC e so para mandioca"), e essas frases dizem o que
   * corrigir. "Não foi possível salvar" manda o operador adivinhar.
   */
  const registrar = useCallback(async (p: ParametrosCarga): Promise<RespostaCarga> => {
    const { data, error } = await (supabase as any).rpc('agri_carga_mandioca_registrar', {
      p_cliente: p.clienteId,
      p_safra_area_id: p.safraAreaId,
      p_data: p.data,
      p_industria_id: p.industriaId,
      p_nf: p.nf,
      p_ticket: p.ticket,
      p_peso_bruto_kg: p.pesoBrutoKg,
      p_desconto_kg: p.descontoKg,
      p_rendimento_g: p.rendimentoG,
      p_preco_g: p.precoG,
      p_servicos: servicosParaRpc(p.servicos),
      p_icms: p.icms,
      p_funrural: p.funrural,
      p_observacao: p.observacao,
      p_conta_id: p.contaId,
      p_inss: p.inss,
      p_icms_transporte: p.icmsTransporte,
    });
    if (error) return { ok: false, erro: error.message };
    return lerResposta(data);
  }, []);

  /**
   * Cancela a carga inteira — TODAS as colheitas que a compõem.
   *
   * ⚠ A PRIMEIRA CHAMADA É O PORTÃO, e isso não é otimismo: as metades de uma carga apontam para
   * o MESMO lançamento de venda (é essa partilha que as agrupa na lista). `cancelar` só recusa por
   * lançamento ativo realizado ou conciliado; depois que a primeira passa, o lançamento partilhado
   * já está `cancelado=true` e as seguintes não têm mais o que travar. Então: se a primeira
   * recusa, NADA mudou — que é o que o §3 exige.
   */
  const cancelar = useCallback(async (
    ids: readonly string[], motivo: string,
  ): Promise<RespostaCarga> => {
    let primeira: RespostaCarga = { ok: true };
    for (const id of ids) {
      const { data, error } = await (supabase as any).rpc('agri_carga_mandioca_cancelar', {
        p_colheita_id: id, p_motivo: motivo,
      });
      if (error) return { ok: false, erro: error.message };
      const r = lerResposta(data);
      if (!r.ok) return r;
      primeira = r;
    }
    return primeira;
  }, []);

  /**
   * Corrige a carga — `_corrigir` na colheita principal, e as demais metades saem depois.
   *
   * ⚠ POR QUE AS DUAS COISAS: `agri_carga_mandioca_corrigir` recebe UM `p_colheita_id` e devolve
   * UMA carga nova. Numa carga do backfill, que tem duas metades, corrigir só a principal deixaria
   * a outra viva, apontando para um lançamento já cancelado — um valor fantasma na lista. E a
   * ordem importa: o `corrigir` é o portão (ele cancela antes de gravar e devolve `{ok:false}` sem
   * tocar em nada), e só depois que ele passa é que as metades restantes são baixadas.
   * ⚠ A CARGA VOLTA INTEIRA, EM UM TALHÃO SÓ. É a decisão do §1: a divisão por área do backfill
   * não se reproduz na tela, e reproduzi-la exigiria que o operador digitasse duas vezes o mesmo
   * romaneio.
   */
  const corrigir = useCallback(async (
    ids: readonly string[], p: ParametrosCarga,
  ): Promise<RespostaCarga> => {
    const [principal, ...resto] = ids;
    const { data, error } = await (supabase as any).rpc('agri_carga_mandioca_corrigir', {
      p_colheita_id: principal,
      p_safra_area_id: p.safraAreaId,
      p_data: p.data,
      p_industria_id: p.industriaId,
      p_nf: p.nf,
      p_ticket: p.ticket,
      p_peso_bruto_kg: p.pesoBrutoKg,
      p_desconto_kg: p.descontoKg,
      p_rendimento_g: p.rendimentoG,
      p_preco_g: p.precoG,
      p_servicos: servicosParaRpc(p.servicos),
      p_icms: p.icms,
      p_funrural: p.funrural,
      p_observacao: p.observacao,
      p_conta_id: p.contaId,
      p_inss: p.inss,
      p_icms_transporte: p.icmsTransporte,
    });
    if (error) return { ok: false, erro: error.message };
    const r = lerResposta(data);
    if (!r.ok || resto.length === 0) return r;
    const baixa = await cancelar(resto, 'metade substituída pela carga corrigida');
    /* ⚠ SE A BAIXA DAS METADES FALHAR, o erro aparece: a correção já gravou, e esconder isso
       deixaria a lista com uma carga a mais sem ninguém saber por quê. */
    if (!baixa.ok) return { ...baixa, erro: baixa.erro ?? 'A carga foi corrigida, mas uma metade antiga não pôde ser baixada.' };
    return r;
  }, [cancelar]);

  return { registrar, corrigir, cancelar };
}

/**
 * O CONTEXTO QUE A CARGA NOVA HERDA — a proposta de serviços e a trava do ICMS.
 *
 * ⚠ AS DUAS PERGUNTAS SÃO DO MESMO GESTO ("vou lançar uma carga"), e por isso moram juntas: abrir
 * o modal dispara uma leitura, não duas telas de espera.
 */
export interface PropostaServico {
  tipo: TipoServico;
  fornecedor_id: string;
  preco_t: number;
}

export function useContextoCargaMandioca(safraAreaIds: readonly string[]) {
  /* Mesma chave estável do `useColheita`: o array muda de identidade a cada render. */
  const chave = [...safraAreaIds].sort().join(',');

  /**
   * Os serviços da ÚLTIMA carga da safra, em R$/t.
   *
   * ⚠ O PREÇO POR TONELADA É RECONSTITUÍDO (`valor / toneladas`), porque é assim que o banco o
   * guarda: a RPC grava `round(t * preco_t, 2)` e a coluna do preço não existe. Isto é PROPOSTA —
   * entra em âmbar num campo que o operador confere antes de salvar —, nunca um número exibido
   * como verdade. A diferença importa: proposta errada o operador corrige; total errado ele
   * acredita.
   * ⚠ E SÓ A ÚLTIMA, não uma média das anteriores: o que o arranquio custou na semana passada é
   * um preço que existiu; a média de seis semanas é um número que ninguém negociou.
   */
  const proposta = useCallback(async (): Promise<PropostaDaUltimaCarga> => {
    if (!chave) return { servicos: [], contaId: null };
    const db = supabase as any;
    const { data: ultima } = await db.from('agri_colheita')
      .select('id, toneladas')
      .in('safra_area_id', chave.split(','))
      .eq('ativo', true)
      .not('toneladas', 'is', null)
      .order('data_colheita', { ascending: false })
      .limit(1);
    const carga = (ultima ?? [])[0] as { id: string; toneladas: number | null } | undefined;
    if (!carga?.id || !carga.toneladas) return { servicos: [], contaId: null };

    const { data: elos } = await db.from('agri_colheita_lancamentos')
      .select('lancamento_id, papel')
      .eq('colheita_id', carga.id)
      .eq('ativo', true)
      .in('papel', TIPOS_SERVICO.map(s => s.tipo));
    const pares = (elos ?? []) as Array<{ lancamento_id: string; papel: string }>;
    if (pares.length === 0) return { servicos: [], contaId: null };

    const { data: lancs } = await db.from('financeiro_lancamentos_v2')
      .select('id, valor, favorecido_id, conta_efetiva_id')
      .in('id', pares.map(p => p.lancamento_id));
    const porId = new Map<string, { valor: number | null; favorecido_id: string | null }>();
    /* ⚠ A CONTA VEM DE `conta_efetiva_id`, a coluna GERADA que já resolve a direção: nas saídas ela
       é a origem, nas entradas o destino. Ler `conta_bancaria_id` direto devolveria nulo para a
       venda, e a última carga poderia propor "sem conta" só por ser uma entrada. */
    let conta: string | null = null;
    for (const l of (lancs ?? []) as Array<{ id: string; valor: number | null; favorecido_id: string | null; conta_efetiva_id: string | null }>) {
      porId.set(l.id, { valor: l.valor, favorecido_id: l.favorecido_id });
      if (!conta && l.conta_efetiva_id) conta = l.conta_efetiva_id;
    }

    const saida: PropostaServico[] = [];
    for (const par of pares) {
      const l = porId.get(par.lancamento_id);
      const tipo = TIPOS_SERVICO.find(s => s.tipo === par.papel)?.tipo;
      if (!tipo || !l?.favorecido_id || l.valor == null) continue;
      saida.push({
        tipo,
        fornecedor_id: l.favorecido_id,
        preco_t: Math.round((l.valor / carga.toneladas) * 100) / 100,
      });
    }
    return { servicos: saida, contaId: conta };
  }, [chave]);

  /**
   * A NF já tem ICMS lançado?
   *
   * ⚠ A MESMA PERGUNTA QUE A RPC FAZ, e de propósito: ela também checa antes de gravar e
   * simplesmente ignora o ICMS repetido. Sem esta leitura o operador digitaria 2.016,00 na segunda
   * carga da nota, a RPC descartaria em silêncio, e a tela teria mentido sobre o que gravou.
   * ⚠ POR `papel`, NUNCA PELA DESCRIÇÃO — o mesmo idioma do `useColheita`.
   */
  const icmsJaNaNota = useCallback(async (nf: string): Promise<boolean> => {
    if (!chave || !nf.trim()) return false;
    const db = supabase as any;
    const { data: cargas } = await db.from('agri_colheita')
      .select('id')
      .in('safra_area_id', chave.split(','))
      .eq('nf_produtor', nf.trim())
      .eq('ativo', true);
    const ids = ((cargas ?? []) as Array<{ id: string }>).map(c => c.id);
    if (ids.length === 0) return false;
    const { data: elos } = await db.from('agri_colheita_lancamentos')
      .select('colheita_id')
      .in('colheita_id', ids)
      .eq('papel', 'icms')
      .eq('ativo', true)
      .limit(1);
    return ((elos ?? []) as unknown[]).length > 0;
  }, [chave]);

  return { proposta, icmsJaNaNota };
}

/**
 * OS COMPROMISSOS DA CARGA — a leitura da aba Financeiro (PR-CARGA-MANDIOCA-MODAL-OC-01, fase 1).
 *
 * ⚠ RECEBE OS IDS DA CARGA INTEIRA, não o da metade. Uma carga dividida entre talhões tem duas
 * colheitas, e os elos de venda, ICMS e Funrural podem estar ligados a apenas UMA delas — medido
 * na NF 9287581, em que `icms` e `funrural` pendiam só da metade IND.05. Ler por uma metade faria
 * o imposto sumir em metade das cargas.
 * ⚠ E POR ISSO O `lancamento_id` É DEDUPLICADO: a venda é UM lançamento apontado pelas DUAS
 * metades. Sem o `Map`, ela apareceria duas vezes e o total dobraria — o mesmo erro que a lista
 * de cargas já teve de corrigir uma vez.
 *
 * ⚠ SÓ LEITURA NESTA FASE. Nenhuma escrita, nenhum `valor_aplicado`: o status vem de
 * `status_transacao`, que o gatilho da conciliação já promove a 'realizado'.
 */
export function useCompromissosDaCarga(ids: readonly string[]) {
  const [linhas, setLinhas] = useState<LancamentoDaCarga[]>([]);
  const [carregando, setCarregando] = useState(false);
  /* Contador de recarga: depois de alterar um compromisso, o pago e o estado podem ter mudado. */
  const [versao, setVersao] = useState(0);
  /* Chave estável: o array muda de identidade a cada render, o texto não. */
  const chave = [...ids].sort().join(',');

  useEffect(() => {
    if (!chave) { setLinhas([]); return; }
    let vivo = true;
    setCarregando(true);
    void (async () => {
      const db = supabase as any;
      const { data: elos } = await db.from('agri_colheita_lancamentos')
        .select('lancamento_id, papel')
        .in('colheita_id', chave.split(','))
        .eq('ativo', true);
      const pares = (elos ?? []) as Array<{ lancamento_id: string; papel: string }>;
      const papelPorId = new Map<string, string>();
      for (const p of pares) papelPorId.set(p.lancamento_id, p.papel);
      if (papelPorId.size === 0) {
        if (vivo) { setLinhas([]); setCarregando(false); }
        return;
      }
      const { data: lancs } = await db.from('financeiro_lancamentos_v2')
        .select('id, valor, sinal, status_transacao, data_vencimento, favorecido_id, conta_efetiva_id, conciliado_em, cancelado')
        .in('id', [...papelPorId.keys()]);
      const vivos = ((lancs ?? []) as Array<{
        id: string; valor: number | null; sinal: string | null; status_transacao: string | null;
        data_vencimento: string | null; favorecido_id: string | null; conta_efetiva_id: string | null;
        conciliado_em: string | null; cancelado: boolean | null;
      }>).filter(x => x.cancelado !== true);

      /**
       * ⚠ QUANTO FOI APLICADO, por lançamento — a ÚNICA fonte de pagamento desta família.
       * Não há coluna "pago" nem status 'parcial': medido, os status de
       * `financeiro_lancamentos_v2` são previsto, agendado, programado, realizado e conciliado.
       * ⚠ E `status_transacao` NÃO SERVE para decidir: o gatilho
       * `trg_promover_lancamento_realizado_ao_conciliar` promove a 'realizado' já no primeiro
       * centavo conciliado, sem olhar valor — a fase 1 decidia por ele e mostrava "Pago" com
       * dinheiro faltando.
       * ⚠ CONSULTA PRÓPRIA, SEM EMBED: `conciliacao_bancaria_itens` não tem relacionamento
       * declarado com esta consulta e o PostgREST não o resolveria.
       */
      const { data: aplic } = await db.from('conciliacao_bancaria_itens')
        .select('lancamento_id, valor_aplicado, desfeito_em')
        .in('lancamento_id', vivos.map(x => x.id));
      const pagoPorId = new Map<string, number>();
      for (const a of (aplic ?? []) as Array<{ lancamento_id: string; valor_aplicado: number | null; desfeito_em: string | null }>) {
        if (a.desfeito_em) continue;
        pagoPorId.set(a.lancamento_id, (pagoPorId.get(a.lancamento_id) ?? 0) + (a.valor_aplicado ?? 0));
      }

      /* Nomes numa consulta própria, como o resto desta tela faz — o embed do PostgREST não
         resolve estes dois sem relacionamento declarado. */
      const idsForn = Array.from(new Set(vivos.map(x => x.favorecido_id).filter((x): x is string => !!x)));
      const idsConta = Array.from(new Set(vivos.map(x => x.conta_efetiva_id).filter((x): x is string => !!x)));
      const [forn, contas] = await Promise.all([
        idsForn.length
          ? db.from('financeiro_fornecedores').select('id, nome, nome_favorecido').in('id', idsForn)
          : Promise.resolve({ data: [] }),
        idsConta.length
          ? db.from('financeiro_contas_bancarias').select('id, nome_conta').in('id', idsConta)
          : Promise.resolve({ data: [] }),
      ]);
      const nomeForn = new Map<string, string>();
      for (const f of (forn.data ?? []) as Array<{ id: string; nome: string | null; nome_favorecido: string | null }>) {
        nomeForn.set(f.id, f.nome_favorecido || f.nome || '');
      }
      const nomeConta = new Map<string, string>();
      for (const c of (contas.data ?? []) as Array<{ id: string; nome_conta: string | null }>) {
        nomeConta.set(c.id, c.nome_conta ?? '');
      }

      if (!vivo) return;
      setLinhas(vivos.map(x => ({
        lancamentoId: x.id,
        papel: papelPorId.get(x.id) ?? '',
        valor: x.valor ?? 0,
        sinal: x.sinal ?? '-1',
        statusTransacao: x.status_transacao,
        dataVencimento: x.data_vencimento,
        favorecido: x.favorecido_id ? (nomeForn.get(x.favorecido_id) || null) : null,
        conta: x.conta_efetiva_id ? (nomeConta.get(x.conta_efetiva_id) || null) : null,
        contaId: x.conta_efetiva_id,
        pago: pagoPorId.get(x.id) ?? 0,
        conciliadoEm: x.conciliado_em,
        /* Vínculo VIVO, não histórico: `desfeito_em` já foi filtrado acima. */
        conciliado: pagoPorId.has(x.id),
      })));
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [chave, versao]);

  return { linhas, carregando, recarregar: () => setVersao(v => v + 1) };
}

/**
 * AJUSTE FINO DO COMPROMISSO — vencimento e conta, um lançamento por vez.
 *
 * ⚠ RPC PRÓPRIA, NÃO A DA OC. `oc_alterar_parcela_programacao` faz o mesmo, mas exige
 * `p_operacao_id`, confere `versao` e edita `zoo_operacao_parcelas_programacao`. A carga não tem
 * operação nem parcela: o compromisso dela é o próprio lançamento. O que se copiou daquela função
 * foi a GUARDA e o desenho de permissão — o corpo é outro.
 * ⚠ O ERRO DO BANCO VAI INTEIRO PARA A TELA: ele nomeia o motivo da recusa ("conciliado em
 * 01/09; estorne a conciliação para alterar"), e essa frase diz o que fazer. Um "não foi possível
 * salvar" mandaria o operador adivinhar.
 */
export function useAlterarCompromisso() {
  const [salvando, setSalvando] = useState(false);
  const alterar = useCallback(async (
    clienteId: string, lancamentoId: string,
    campos: { vencimento?: string | null; contaId?: string | null },
  ): Promise<{ ok: boolean; erro?: string }> => {
    setSalvando(true);
    try {
      const { data, error } = await (supabase as any).rpc('agri_compromisso_alterar_programacao', {
        p_cliente_id: clienteId,
        p_lancamento_id: lancamentoId,
        /* `undefined` não vai no corpo — a RPC usa o default NULL, que significa "não mexa neste
           campo" (ela aplica `coalesce`). Mandar null explícito seria o mesmo, mas dizer o que se
           quer mudar é mais honesto que mandar a linha inteira. */
        ...(campos.vencimento == null ? {} : { p_vencimento: campos.vencimento }),
        ...(campos.contaId == null ? {} : { p_conta_id: campos.contaId }),
      });
      if (error) return { ok: false, erro: error.message };
      return (data as { ok?: boolean } | null)?.ok === true
        ? { ok: true }
        : { ok: false, erro: 'A alteração não voltou confirmada.' };
    } finally {
      setSalvando(false);
    }
  }, []);
  return { alterar, salvando };
}
