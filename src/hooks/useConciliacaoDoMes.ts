import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * useConciliacaoDoMes — os dados da tela de conciliação do extrato.
 * FIN-CONCIL-PORTAR-01, rodada 1. Portado do `AllinBlues/financas`
 * (`use-extrato.ts` / `extrato.repository.ts`), com a fonte trocada.
 *
 * ⚠ CLASSIFICAÇÃO VÍNCULO-FIRST, e é a regra que este arquivo existe para
 * garantir: `conciliado` NÃO é heurística — é a soma dos `valor_aplicado`
 * ATIVOS cobrindo o valor do movimento, com a tolerância de R$ 0,005. A tela
 * nunca adivinha grupo, e nenhum balde de sugestão vira vínculo.
 *
 * ⚠ OS TRÊS BALDES DE SUGESTÃO VÊM DE OUTRO LUGAR — match direto, provável e
 * ambíguo saem de `fn_sugestoes_extrato` (o motor portado, aplicado em 31/08), e
 * são carregados SOB DEMANDA por `useSugestoesDoMes`. Enquanto o operador não
 * pede, eles ficam AUSENTES na tela — e ausente não é zero: dizer "0 prováveis"
 * afirmaria que o motor olhou e não achou, quando ele ainda não olhou.
 *
 * ⚠ VIVO É O QUE NÃO FOI CANCELADO NEM IGNORADO. O Proto separa os dois de
 * propósito — cancelado é o movimento que não existe, ignorado é o que existe e
 * foi desconsiderado —, e colapsá-los num só perderia a distinção que o schema
 * faz. Ambos ficam fora da conciliação.
 */

export type SituacaoMovimento = 'conciliado' | 'parcial' | 'nao_conciliado';

export interface MovimentoConciliacao {
  id: string;
  data_movimento: string;
  descricao: string | null;
  documento: string | null;
  valor: number;
  valorConciliado: number;
  valorAberto: number;
  situacao: SituacaoMovimento;
  /**
   * O lançamento vinculado, quando há EXATAMENTE UM vínculo ativo.
   *
   * ⚠ `null` COM DOIS OU MAIS, e não "o primeiro": um movimento coberto por
   * vários lançamentos não tem "o" lançamento dele, e escolher um seria
   * arbitrário. A coluna ID do Excel do Enriquecer sai vazia nesse caso, e a
   * linha volta pelo caminho de criação em vez de atualizar o lançamento errado.
   */
  lancamentoId: string | null;
}

/**
 * Um candidato a vínculo, como `fn_candidatos_conciliacao` devolve.
 *
 * ⚠ OS NÚMEROS CHEGAM COMO `text` DA RPC — assinatura conferida em `pg_proc`:
 * `valor`, `ja_conciliado`, `saldo` e `delta_valor` são text, não numeric. A
 * função os serializa assim de propósito, para não perder casas no caminho.
 * Convertidos UMA vez, aqui na borda, e nunca reconvertidos adiante.
 */
export interface CandidatoConciliacao {
  id: string;
  descricao: string | null;
  favorecido: string | null;
  numeroDocumento: string | null;
  dataReferencia: string | null;
  valor: number;
  status: string | null;
  jaConciliado: number;
  /** Quanto do LANÇAMENTO ainda está livre — o teto do que se pode aplicar. */
  saldo: number;
  deltaValor: number;
  deltaDias: number | null;
  score: number | null;
  preMarcado: boolean;
  ambiguo: boolean;
  /** Já coberto por inteiro: aparece para auditoria, não é acionável. */
  indisponivel: boolean;
  motivoIndisponivel: string | null;
}

export interface VinculoDoMovimento {
  id: string;
  lancamentoId: string;
  valorAplicado: number;
  lancamentoDescricao: string | null;
  lancamentoData: string | null;
  lancamentoValor: number | null;
  favorecido: string | null;
  /**
   * PR-DESFAZER-GRUPO — o grupo a que este vínculo pertence; `null` = avulso.
   *
   * ⚠ SEM ELE A TELA NÃO SABIA O QUE ESTAVA OLHANDO. O desfazer unitário recusa
   * membro de grupo — e recusava sem que a tela pudesse dizer por quê, nem
   * oferecer a saída. O campo já existia na tabela; faltava vir no `select`.
   */
  grupoId: string | null;
}

/** A tolerância do dinheiro nesta tela — a mesma do briefing e do banco. */
export const TOL = 0.005;

/**
 * DESFAZER O GRUPO INTEIRO — `fn_desfazer_grupo_conciliacao`.
 *
 * ⚠ A RPC EXISTIA E NUNCA TEVE CALLER. Estava no banco e no `types.ts`,
 * `SECURITY DEFINER`, desfazendo todos os itens do grupo e recalculando o status
 * de cada extrato afetado — e nenhuma tela a chamava. O desfazer unitário
 * (`fn_desfazer_vinculo_extrato`) recusa membro de grupo, então o operador via
 * "desfazer bloqueado" sem nenhuma saída: cinco vínculos presos, e o único
 * caminho era o banco.
 *
 * ⚠ O GRUPO É A UNIDADE, e é por isso que não há "desfazer um do grupo": os N
 * vínculos foram criados juntos porque N lançamentos explicam UM movimento.
 * Tirar um deixaria o extrato parcialmente explicado por uma soma que ninguém
 * escolheu — e o status recalculado mentiria sobre uma decisão que não houve.
 */
export async function desfazerGrupo(
  grupoId: string, motivo = 'grupo_desfeito_na_estacao',
): Promise<{ ok: boolean; itensDesfeitos: number; erro: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_desfazer_grupo_conciliacao', {
    p_grupo_id: grupoId,
    p_motivo: motivo,
  });
  if (error) return { ok: false, itensDesfeitos: 0, erro: error.message };
  const r = (data ?? {}) as { ok?: boolean; itens_desfeitos?: number };
  return { ok: r.ok !== false, itensDesfeitos: Number(r.itens_desfeitos ?? 0), erro: null };
}

export interface ContagemBaldes {
  todos: number;
  conciliado: number;
  parcial: number;
  sem_vinculo: number;
  /* ⚠ NULOS ENQUANTO O MOTOR NÃO RODOU, e não zero: `null` diz "não perguntei",
     `0` diria "perguntei e não há". A tela imprime coisas diferentes para os
     dois, porque são respostas diferentes. */
  match_direto: number | null;
  provavel: number | null;
  ambiguo: number | null;
  sem_match: number | null;
}

/**
 * ⚠ O CONTADOR E A LISTA SAEM DO MESMO CAMPO — a regra que o original documenta
 * e o motivo de `fn_sugestoes_extrato` existir. Os três baldes de sugestão
 * contam o `estado` que a RPC devolveu; nada é recalculado aqui. Repetir o
 * predicado no front seria concordância por manutenção manual.
 * ⚠ E CONCILIADO/PARCIAL CONTINUAM SAINDO DO VÍNCULO, mesmo com o motor ligado:
 * a situação é a verdade do banco, e o score nunca define pendência.
 */
export function contarBaldes(
  movs: readonly MovimentoConciliacao[],
  sugestoes?: readonly { extratoId: string; estado: string }[] | null,
): ContagemBaldes {
  const c: ContagemBaldes = {
    todos: movs.length, conciliado: 0, parcial: 0, sem_vinculo: 0,
    match_direto: null, provavel: null, ambiguo: null, sem_match: null,
  };
  for (const m of movs) {
    if (m.situacao === 'conciliado') c.conciliado += 1;
    else if (m.situacao === 'parcial') c.parcial += 1;
    else c.sem_vinculo += 1;
  }
  if (sugestoes) {
    c.match_direto = 0; c.provavel = 0; c.ambiguo = 0; c.sem_match = 0;
    for (const s of sugestoes) {
      if (s.estado === 'match_direto') c.match_direto += 1;
      else if (s.estado === 'provavel') c.provavel += 1;
      else if (s.estado === 'ambiguo') c.ambiguo += 1;
      else if (s.estado === 'sem_match') c.sem_match += 1;
    }
  }
  return c;
}

/**
 * O rodapé — traduzido do `palco.ts` do original, com a condição adaptada ao
 * que o Proto sabe hoje.
 *
 * ⚠ "MÊS CONFERIDO" EXIGE ZERO EM ABERTO E ZERO PARCIAL. No original ele exige
 * também o resíduo do outro lado (lançamentos com saldo), porque um mês onde o
 * extrato fecha e o ledger sangra NÃO está conferido. Aqui esse resíduo ainda
 * não é medido — então a frase diz o que sabe, e não mais do que isso.
 */
export function frameDoRodape(c: ContagemBaldes): string {
  if (c.todos === 0) return 'Nenhum movimento importado neste mês.';
  const emAberto = c.sem_vinculo;
  if (emAberto === 0 && c.parcial === 0) {
    return `Mês conferido · ${c.todos} movimento${c.todos === 1 ? '' : 's'} · nenhuma ação necessária.`;
  }
  const partes = [`${c.todos} movimento${c.todos === 1 ? '' : 's'}`];
  if (c.conciliado > 0) partes.push(`${c.conciliado} conciliado${c.conciliado === 1 ? '' : 's'}`);
  if (c.parcial > 0) partes.push(`${c.parcial} parcial${c.parcial === 1 ? '' : 'is'}`);
  if (emAberto > 0) partes.push(`${emAberto} a resolver`);
  return partes.join(' · ');
}

/** Primeiro dia do mês e primeiro dia do mês seguinte — fim EXCLUSIVO, como o resto do sistema. */
export function faixaDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const ini = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(mes === 12 ? ano + 1 : ano, mes === 12 ? 0 : mes, 1));
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

export function useConciliacaoDoMes(
  clienteId: string | null, contaId: string | null, ano: number, mes: number,
) {
  const [movimentos, setMovimentos] = useState<MovimentoConciliacao[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId || !contaId) { setMovimentos([]); return; }
    setLoading(true);
    try {
      const { inicio, fim } = faixaDoMes(ano, mes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora de types.ts
      const { data: linhas } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, data_movimento, descricao, documento, valor')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .is('cancelado_em', null)
        .is('ignorado_em', null)
        .gte('data_movimento', inicio)
        .lt('data_movimento', fim)
        .order('data_movimento');
      const movs: { id: string; data_movimento: string; descricao: string | null; documento: string | null; valor: number }[] = linhas ?? [];
      if (movs.length === 0) { setMovimentos([]); return; }

      /* ⚠ UMA CONSULTA PARA O CONJUNTO, nunca uma por linha: os vínculos vêm em
         lote pelos ids já carregados. É o mesmo cuidado que a Central declara
         no topo dela — zero N+1, requests fixos. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data: vinc } = await (supabase as any)
        .from('conciliacao_bancaria_itens')
        .select('extrato_id, valor_aplicado, lancamento_id')
        .in('extrato_id', movs.map(m => m.id))
        .is('desfeito_em', null);
      const aplicadoPorMov: Record<string, number> = {};
      /* `undefined` = nenhum vínculo; string = exatamente um; `null` = dois ou
         mais, e aí não há "o" lançamento do movimento. */
      const lancPorMov: Record<string, string | null> = {};
      for (const v of (vinc ?? []) as { extrato_id: string; valor_aplicado: number; lancamento_id: string }[]) {
        aplicadoPorMov[v.extrato_id] = (aplicadoPorMov[v.extrato_id] ?? 0) + Number(v.valor_aplicado ?? 0);
        lancPorMov[v.extrato_id] = v.extrato_id in lancPorMov ? null : v.lancamento_id;
      }

      setMovimentos(movs.map(m => {
        const valor = Number(m.valor ?? 0);
        const aplicado = aplicadoPorMov[m.id] ?? 0;
        const aberto = Math.abs(valor) - aplicado;
        /* A MESMA precedência da view do original: coberto vence, depois
           parcial, depois não conciliado. O fato manda; heurística nenhuma. */
        const situacao: SituacaoMovimento =
          aplicado <= TOL ? 'nao_conciliado'
          : aberto <= TOL ? 'conciliado'
          : 'parcial';
        return {
          id: m.id, data_movimento: m.data_movimento, descricao: m.descricao,
          documento: m.documento, valor,
          valorConciliado: aplicado, valorAberto: Math.max(0, aberto), situacao,
          lancamentoId: lancPorMov[m.id] ?? null,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [clienteId, contaId, ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);
  return { movimentos, loading, recarregar: carregar };
}

/** Os vínculos ATIVOS de um movimento — a tabela "Vínculos deste movimento". */
export type EstadoSugestao = 'match_direto' | 'provavel' | 'ambiguo' | 'sem_match';
/**
 * Uma linha de `fn_sugestoes_extrato` — o que o motor achou para um movimento.
 *
 * ⚠ O ESTADO E A SUGESTÃO SAEM DA MESMA LINHA, e é o que garante que o chip e a
 * coluna "Lançamento sugerido" do palco nunca discordem: um só `select`, um só
 * `map`. Ler o estado de um lugar e a sugestão de outro seria a divergência por
 * manutenção manual que a doutrina do original proíbe.
 * ⚠ `sugestaoValor` chega como `text` da RPC (conferido em `pg_proc`, B-28) —
 * convertido uma vez, aqui na borda.
 */
export interface SugestaoDoMes {
  extratoId: string;
  estado: string;
  /**
   * O id do LANÇAMENTO sugerido — B-22c.
   *
   * ⚠ A RPC sempre o devolveu (`sugestao_id`, conferido em `pg_proc`) e o `map`
   * o descartava: sem ele, a tela sabia QUE havia sugestão e não sabia QUAL, e
   * vincular em massa era impossível — cada linha teria de reabrir o motor de
   * candidatos para redescobrir o par que a RPC já tinha dito.
   */
  sugestaoId: string | null;
  sugestaoDescricao: string | null;
  sugestaoFavorecido: string | null;
  sugestaoValor: number | null;
}

/**
 * AS SUGESTÕES DO MÊS — `fn_sugestoes_extrato`, o motor portado.
 *
 * ⚠ SOB DEMANDA, E A MEDIÇÃO É QUE DECIDIU. A função chama o motor de candidatos
 * por LATERAL uma vez POR MOVIMENTO, e o custo cresce com o tamanho do mês.
 * Carregar automático ao abrir faria a tela parecer travada toda vez que alguém
 * só queria ver a lista.
 *
 * ⚠ O NÚMERO QUE ESTAVA ESCRITO AQUI ERA FALSO — "~91 ms por movimento, EXPLAIN
 * ANALYZE", com a autoridade do plano ao lado. Ele foi medido num mês pequeno e
 * citado depois como evidência de que o caminho escalava. A remedição de 01/09
 * deu ~6-8 s por movimento, e um mês de 190 movimentos simplesmente estourava em
 * timeout. Fica registrado porque a lição não é o número: é que um número errado
 * num comentário é pior que nenhum, porque vira argumento.
 *
 * ⚠ CORRIGIDO em 01/09, e não pela tela: índice em `transferencia_grupo_id`
 * (`idx_lanc_transf_grupo`, parcial) mais a janela de ±60 dias no WHERE de
 * `fn_candidatos_conciliacao` — os 190 movimentos passaram a responder em ~3,7 s.
 * O "sob demanda" continua por decisão de UX, não mais por impossibilidade.
 *
 * ⚠ O GARGALO NÃO É O QUE PARECIA. Medido no plano: 92% do tempo está num
 * `Bitmap Index Scan` sobre `idx_fin_lanc_v2_cliente` (30.460 linhas, 83,5 ms),
 * que o planejador cruza por `BitmapAnd` com o índice de conta — este, sim,
 * seletivo (1.378 linhas, 0,1 ms). Um índice COMPOSTO `(cliente_id,
 * conta_bancaria_id)` dispensaria o cruzamento. Índice é migration; enquanto ele
 * não vem, quem manda no custo é o operador.
 *
 * ⚠ ERRO NÃO VIRA TELA VAZIA: sem sugestões, os três baldes voltam a aparecer
 * como ausentes — que é o estado honesto de "o motor não respondeu".
 */
export function useSugestoesDoMes(
  clienteId: string | null, contaId: string | null, ano: number, mes: number,
) {
  const [sugestoes, setSugestoes] = useState<SugestaoDoMes[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  /* Trocar de mês/conta ZERA o que estava calculado: manter o placar do mês
     anterior sobre a lista do mês novo seria a pior mentira possível aqui. */
  useEffect(() => { setSugestoes(null); }, [clienteId, contaId, ano, mes]);

  const calcular = useCallback(async () => {
    if (!clienteId || !contaId) return;
    setCarregando(true);
    try {
      const { inicio, fim } = faixaDoMes(ano, mes);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_sugestoes_extrato', {
        p_cliente_id: clienteId, p_conta_bancaria_id: contaId, p_de: inicio, p_ate: fim,
      });
      if (error) { setSugestoes(null); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas da RPC, fora de types.ts
      setSugestoes((data ?? []).map((r: any) => ({
        extratoId: r.extrato_id,
        estado: r.estado,
        sugestaoId: r.sugestao_id ?? null,
        sugestaoDescricao: r.sugestao_descricao ?? null,
        sugestaoFavorecido: r.sugestao_favorecido ?? null,
        sugestaoValor: r.sugestao_valor == null ? null : Number(r.sugestao_valor),
      })));
    } finally {
      setCarregando(false);
    }
  }, [clienteId, contaId, ano, mes]);

  return { sugestoes, carregando, calcular };
}

/**
 * OS CANDIDATOS DE UM MOVIMENTO — `fn_candidatos_conciliacao`, o motor do trio.
 *
 * ⚠ UM MOVIMENTO, UMA CHAMADA. É a mesma função que `fn_sugestoes_extrato` roda
 * por LATERAL para o mês inteiro: para UM, o custo é o de abrir um diálogo; para
 * o mês, é a soma de todos. Por isso a estação chama direto a função de um só e
 * NUNCA a do mês — abrir um movimento não pode custar o extrato todo. (O custo
 * por movimento caiu para ~3,7 s no mês de 190 após a correção de 01/09; o
 * número de ~91 ms que constava aqui era ilusão de mês pequeno.)
 *
 * ⚠ A FUNÇÃO RECEBE SÓ O ID, e é assim que o original a usa: conta, data e
 * valor ela lê do próprio movimento. Reenviar daqui o que o banco já tem abriria
 * espaço para a tela discordar dele.
 */
export function useCandidatosDoMovimento(clienteId: string | null, extratoId: string | null) {
  const [candidatos, setCandidatos] = useState<CandidatoConciliacao[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId || !extratoId) { setCandidatos(null); return; }
    setCarregando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_candidatos_conciliacao', {
        p_cliente_id: clienteId, p_extrato_id: extratoId, p_limite: 50,
      });
      /* ⚠ ERRO NÃO VIRA LISTA VAZIA: `null` diz "não consegui perguntar" e a
         tela escreve isso; `[]` diria "perguntei e não há candidato", que é
         outra resposta. */
      if (error) { setCandidatos(null); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas da RPC, fora de types.ts
      setCandidatos((data ?? []).map((r: any) => ({
        id: r.id,
        descricao: r.descricao ?? null,
        favorecido: r.favorecido ?? null,
        numeroDocumento: r.numero_documento ?? null,
        dataReferencia: r.data_referencia ?? null,
        valor: Number(r.valor ?? 0),
        status: r.status ?? null,
        jaConciliado: Number(r.ja_conciliado ?? 0),
        saldo: Number(r.saldo ?? 0),
        deltaValor: Number(r.delta_valor ?? 0),
        deltaDias: r.delta_dias == null ? null : Number(r.delta_dias),
        score: r.score == null ? null : Number(r.score),
        preMarcado: r.pre_marcado === true,
        ambiguo: r.ambiguo === true,
        indisponivel: r.indisponivel === true,
        motivoIndisponivel: r.motivo_indisponivel ?? null,
      })));
    } finally {
      setCarregando(false);
    }
  }, [clienteId, extratoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { candidatos, carregando, recarregar: carregar };
}

/**
 * GRAVA A SELEÇÃO — e a RPC depende de QUANTOS foram marcados.
 *
 * ⚠ SÃO DUAS FUNÇÕES, NÃO UMA COM DOIS MODOS, e mandar tudo para a de grupo era
 * o defeito do B-28b: `fn_vincular_grupo_conciliacao` começa com
 * `IF v_n < 2 THEN RAISE EXCEPTION 'array_vazio: grupo exige >= 2 lancamentos'`
 * — lido no corpo dela, em `pg_proc`. Um único candidato marcado, que é o caso
 * mais comum da estação, batia nessa linha e nunca gravava.
 *
 * ⚠ AS DUAS NÃO SÃO A MESMA REGRA COM TAMANHOS DIFERENTES, e é por isso que a
 * tela precisa saber qual vai chamar (corpos lidos no banco):
 *   unitária — recusa se o extrato JÁ tem vínculo ativo
 *              (`extrato ja possui vinculo ativo`) e, desde a migration
 *              `b22fd273` (CONCIL-SOBRE-APLICACAO-01), EXIGE que o valor caiba
 *              nos DOIS lados, com tolerância 0,005:
 *              `sobre_aplicacao: … excede o aberto do movimento` e
 *              `… excede o saldo livre do lancamento`. Deixar PARCIAL continua
 *              valendo — o que ela passou a recusar é o EXCESSO, não a
 *              cobertura incompleta;
 *   grupo    — não olha vínculo existente do extrato, mas EXIGE
 *              `abs(total - abs(valor_do_extrato)) <= 0,005`
 *              (`soma_diverge`), contra o valor CHEIO do OFX e não contra o que
 *              falta. Aplicar em duas rodadas de grupo é impossível por
 *              construção, e fechar um parcial em grupo também — dívida aberta
 *              do lado do banco, não limite da tela.
 * `impedimento`, na estação, antecipa essas recusas para que o operador não as
 * descubra depois do clique. Ele não é a defesa: a defesa é o banco.
 *
 * ⚠ NO CAMINHO DE GRUPO, OS ARRAYS ANDAM EM PAR e a ordem é o que os liga —
 * `p_valores[i]` é o valor de `p_lancamentos[i]`. Saem da MESMA iteração.
 * Uma chamada, nunca um laço: emular o par-a-par do original trocaria a
 * atomicidade do banco por meio-vínculo em caso de erro.
 */
export async function vincularSelecao(
  extratoId: string,
  pares: readonly { lancamentoId: string; valor: number }[],
  motivo: string,
): Promise<{ ok: boolean; erro: string | null }> {
  /* A mensagem do Postgres nomeia o invariante violado; trocá-la por um texto
     genérico tiraria do operador a única pista útil. Os dois caminhos devolvem
     o erro do mesmo jeito, porque os dois levantam por `RAISE EXCEPTION`. */
  if (pares.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_vincular_extrato_lancamento', {
      p_extrato_id: extratoId,
      p_lancamento_id: pares[0].lancamentoId,
      /* ⚠ SEMPRE EXPLÍCITO. O default da função é `abs(valor_do_extrato)` — o
         valor do MOVIMENTO —, e o que se quer aplicar é o saldo livre do
         LANÇAMENTO. Omitir o parâmetro trocaria um pelo outro em silêncio. */
      p_valor_aplicado: pares[0].valor,
    });
    return { ok: !error, erro: error?.message ?? null };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_vincular_grupo_conciliacao', {
    p_extrato_id: extratoId,
    p_lancamentos: pares.map(p => p.lancamentoId),
    p_valores: pares.map(p => p.valor),
    p_motivo: motivo,
  });
  return { ok: !error, erro: error?.message ?? null };
}

export function useVinculosDoMovimento(extratoId: string | null) {
  const [vinculos, setVinculos] = useState<VinculoDoMovimento[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!extratoId) { setVinculos([]); return; }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data } = await (supabase as any)
        .from('conciliacao_bancaria_itens')
        .select('id, lancamento_id, valor_aplicado, grupo_id, financeiro_lancamentos_v2(descricao, data_pagamento, data_vencimento, data_competencia, valor, financeiro_fornecedores(nome))')
        .eq('extrato_id', extratoId)
        .is('desfeito_em', null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- linhas da view, fora de types.ts
      setVinculos((data ?? []).map((r: any) => {
        const l = r.financeiro_lancamentos_v2;
        return {
          id: r.id,
          lancamentoId: r.lancamento_id,
          valorAplicado: Number(r.valor_aplicado ?? 0),
          lancamentoDescricao: l?.descricao ?? null,
          /* A ÂNCORA DE DATA é a mesma do motor de candidatos: pagamento,
             vencimento, competência — nessa ordem. Escrever outra aqui faria a
             tabela dos vínculos e a dos candidatos mostrarem datas diferentes
             para o mesmo lançamento. */
          lancamentoData: l?.data_pagamento ?? l?.data_vencimento ?? l?.data_competencia ?? null,
          lancamentoValor: l?.valor == null ? null : Number(l.valor),
          favorecido: l?.financeiro_fornecedores?.nome ?? null,
          grupoId: r.grupo_id ?? null,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [extratoId]);

  useEffect(() => { carregar(); }, [carregar]);
  return { vinculos, loading, recarregar: carregar };
}

/** O vínculo ativo de um lançamento, como a lista precisa exibi-lo. */
export interface ConciliadoDoLancamento {
  /** Data do movimento bancário — a prova de que o dinheiro andou. */
  dataMovimento: string | null;
  descricaoMovimento: string | null;
  valorAplicado: number;
}

/**
 * OS LANÇAMENTOS CONCILIADOS DO CLIENTE — LANC-STATUS-CONCILIADO-01.
 *
 * ⚠ CONCILIADO É DERIVADO, NUNCA GRAVADO. Existe vínculo ativo em
 * `conciliacao_bancaria_itens` (`desfeito_em IS NULL`) → conciliado; não existe →
 * segue realizado. Não há campo digitável, e `conciliado_em` do legado NÃO é
 * fonte: está nulo em lançamentos comprovadamente vinculados.
 *
 * ⚠ A CONSULTA VAI PELO LADO PEQUENO, e a medição é que mandou: o NJ tem 30.542
 * lançamentos e 2.241 vínculos ativos; Santa Rita, 18.356 contra 558. Trazer os
 * VÍNCULOS e montar um `Set` custa uma consulta de poucos milhares de linhas;
 * mandar `IN (ids)` com trinta mil ids seria a mesma resposta por um caminho
 * absurdo — e uma consulta por linha seria o N+1 que [PERF-DB-01] já proibiu.
 *
 * ⚠ E É UMA CONSULTA SÓ POR CLIENTE, não por página: a lista carrega tudo em
 * lote e pagina no cliente, então um mapa completo é o que casa com ela. Trocar
 * de página não repergunta nada.
 */
export function useLancamentosConciliados(clienteId: string | null) {
  const [mapa, setMapa] = useState<ReadonlyMap<string, ConciliadoDoLancamento>>(new Map());
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!clienteId) { setMapa(new Map()); return; }
    setCarregando(true);
    (async () => {
      const PAGE = 1000;
      const m = new Map<string, ConciliadoDoLancamento>();
      for (let from = 0; ; from += PAGE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
        const { data, error } = await (supabase as any)
          .from('conciliacao_bancaria_itens')
          .select('lancamento_id, valor_aplicado, extrato_bancario_v2!inner(data_movimento, descricao, cliente_id)')
          .is('desfeito_em', null)
          .eq('extrato_bancario_v2.cliente_id', clienteId)
          .order('lancamento_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { console.error('[useLancamentosConciliados]', error); break; }
        const rows = (data ?? []) as Array<{
          lancamento_id: string; valor_aplicado: number | string | null;
          extrato_bancario_v2: { data_movimento: string | null; descricao: string | null } | null;
        }>;
        for (const r of rows) {
          if (!r.lancamento_id) continue;
          const e = r.extrato_bancario_v2;
          /* ⚠ UM LANÇAMENTO PODE TER MAIS DE UM VÍNCULO (parciais em movimentos
             diferentes). O mapa guarda o PRIMEIRO e soma os aplicados: o rótulo
             precisa de um movimento para nomear, e o valor precisa ser o total —
             mostrar só uma parte faria a evidência contradizer o lançamento. */
          const atual = m.get(r.lancamento_id);
          m.set(r.lancamento_id, {
            dataMovimento: atual?.dataMovimento ?? e?.data_movimento ?? null,
            descricaoMovimento: atual?.descricaoMovimento ?? e?.descricao ?? null,
            valorAplicado: (atual?.valorAplicado ?? 0) + Number(r.valor_aplicado ?? 0),
          });
        }
        if (rows.length < PAGE) break;
        if (from > 200_000) break; // salvaguarda anti-loop
      }
      if (!cancelado) { setMapa(m); setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [clienteId]);

  return { conciliados: mapa, carregando };
}
