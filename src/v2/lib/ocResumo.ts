/**
 * O RESUMO DAS OPERAÇÕES COMERCIAIS — PR-OC-RESUMO-01.
 *
 * ⚠ NENHUM CÁLCULO PARALELO. "falta pagar" é `saldo_operacao`, "pago" é
 * `total_liquidado_valido` (que já soma dinheiro e permuta), "vence" é o par
 * `vencimento`/`saldo_titulo` da parcela. Somar isso aqui daria uma segunda régua: a tela do
 * resumo diria um número e a lista das OCs outro, para o mesmo mês, e ninguém saberia qual
 * está certo. As views decidem; este arquivo agrupa e ordena.
 *
 * ⚠ CINCO CONSULTAS, NUNCA POR LINHA. Tudo com `in (...ids)` sobre o recorte já filtrado da
 * lista. Um resumo de 200 operações que fizesse uma consulta por operação seriam 200
 * viagens — o N+1 que o [PERF-DB-01] proibiu.
 */
import { supabase } from '@/integrations/supabase/client';
import { verboOC, siglaCategoria } from '@/lib/financeiro/produtoOC';

export interface OcResumoLinha {
  operacao_id: string;
  data: string | null;
  descricao: string;
  fornecedor: string;
  tipo: string;
  qtdNegociada: number | null;
  qtdRecebida: number;
  /** A primeira data de movimentação; `n` diz quantas houve, para o " (+N)". */
  dataRecebimento: { primeira: string | null; n: number };
  valor: number;
  pago: number;
  faltaPagar: number;
  /**
   * O que a operação paga do OUTRO lado — OC-LIQ-SINAL-01 (B). Numa venda/abate: frete, Fundersul,
   * comissão, adiantamento do boitel, devolução ao comprador (as saídas). Numa compra: as entradas
   * (raras). `null` = a operação não tem compromisso — traço, não zero.
   */
  despesas: number | null;
  /** Já em português de operador — nunca o enum cru. */
  situacao: string;
  tomSituacao: TomSituacao;
}

export interface OcResumoParcela {
  operacao_id: string;
  vencimento: string | null;
  descricao: string;
  fornecedor: string;
  sequencia: number | null;
  totalParcelas: number;
  /** "entrou dd/mm" · "entrou X de Y" · "não entrou" — a resposta do gado nesta parcela. */
  gado: string;
  valor: number;
  situacao: string;
  tomSituacao: TomSituacao;
  diasVencida: number;
}

export interface OcResumoBloco {
  tipo: string;
  entrou: OcResumoLinha[];
  naoEntrou: OcResumoLinha[];
  /** Parcelas em aberto do LADO da operação (venda/abate: a receber; compra: a pagar). */
  faltaPagar: OcResumoParcela[];
  /**
   * Parcelas em aberto do OUTRO lado — OC-STATUS-LADO-01: frete, taxas, adiantamento, devolução numa
   * venda. Juntas com as do lado, a lista "Falta receber" somava o que a OC ainda paga ao que ela ainda
   * recebe.
   */
  despesasEmAberto: OcResumoParcela[];
}

export interface OcResumo {
  blocos: OcResumoBloco[];
  geradoEm: Date;
}

interface OpBase {
  id: string; tipo_operacao: string; data_operacao: string;
  contraparte_id: string | null; qtd_negociada: number | null;
  valor_acordado: number | null; valor_total: number | null;
  status_comercial: string;
}

/**
 * "Compra 024 DF" — a identidade canônica da operação.
 *
 * ⚠ REUSA `verboOC` E `siglaCategoria` de `@/lib/financeiro/produtoOC`, que se declara "único
 * ponto de verdade do formato". Reescrever o padrão aqui daria duas identidades para a mesma
 * compra: uma no título do compromisso, outra no resumo — e o operador que buscasse pelo
 * nome de uma não acharia a outra.
 *
 * ⚠ VÁRIOS LOTES SOMAM A QUANTIDADE E UNEM AS SIGLAS: "Compra 095 DM+DF". A quantidade é a
 * total porque é isso que a operação negociou; as siglas se acumulam porque esconder uma
 * faria duas compras diferentes terem o mesmo nome.
 *
 * ⚠ NUNCA UUID, NUNCA FAZENDA. A versão anterior usava os três primeiros caracteres do id —
 * que não identifica nada para quem opera e é justamente o que a regra da casa proíbe na
 * tela.
 */
function descricaoPadrao(
  op: OpBase,
  lotes: readonly { categoria: string; qtd: number }[],
): string {
  const qtdTotal = lotes.reduce((a, l) => a + l.qtd, 0) || (op.qtd_negociada ?? 0);
  const siglas = [...new Set(lotes.map((l) => siglaCategoria(l.categoria)).filter(Boolean))];
  const qtd3 = String(Math.max(0, Math.trunc(qtdTotal))).padStart(3, '0');
  const parte = siglas.length ? ` ${siglas.join('+')}` : '';
  return `${verboOC(op.tipo_operacao)} ${qtd3}${parte}`;
}

const dias = (deISO: string | null): number => {
  if (!deISO) return 0;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(`${deISO.slice(0, 10)}T00:00:00`);
  return Math.floor((hoje.getTime() - d.getTime()) / 86400000);
};

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/**
 * A cor da situação, como TOKEN e não como classe — PR-OC-RESUMO-02 item D/2.
 *
 * ⚠ TOKEN PORQUE SÃO TRÊS SAÍDAS. A mesma situação vira pílula na prévia, texto colorido no
 * PDF e string crua no Excel; se a cor nascesse em classe Tailwind, o PDF teria de traduzir
 * `bg-destructive` para RGB — e traduziria diferente no dia em que a paleta mudasse. O token
 * é a resposta; cada saída sabe pintá-lo.
 */
export type TomSituacao = 'ok' | 'parcial' | 'aberto' | 'vencido' | 'ausente';

export interface SituacaoLegivel { texto: string; tom: TomSituacao }

/**
 * O enum de liquidação em palavras — PR-OC-RESUMO-02 item D.
 *
 * ⚠ O PDF SAÍA COM "nao_liquidada" NA COLUNA SITUAÇÃO. Enum cru num documento que vai ao
 * contador não é densidade, é vazamento: o nome da constante do banco não é resposta para
 * ninguém fora do código.
 * ⚠ VENCIDA VENCE TUDO. Uma operação parcialmente paga com parcela vencida é, antes de mais
 * nada, uma pendência — e é isso que precisa saltar da folha.
 * ⚠ DUAS DA LISTA DO MOCK NÃO ENTRARAM, e é melhor dizer do que inventar: "entrou X de Y" já
 * é a coluna Gado da lista de parcelas (seria a mesma resposta em dois lugares), e "sinal
 * pago" não tem fonte — nada nas views distingue um sinal de uma parcela qualquer paga.
 */
export function situacaoDaOperacao(
  estado: string | null,
  valor: number,
  pago: number,
  proximoVencimento: string | null,
  diasVencida: number,
): SituacaoLegivel {
  if (diasVencida > 0) return { texto: `vencida há ${diasVencida} dias`, tom: 'vencido' };
  switch (estado) {
    case 'quitada': return { texto: 'paga', tom: 'ok' };
    case 'excedente': return { texto: 'paga a mais', tom: 'ok' };
    case 'parcial': {
      /* A porcentagem é do que já saiu do caixa sobre o negociado. Sem valor não há
         porcentagem — e "paga NaN%" seria pior que "paga em parte". */
      const pct = valor > 0 ? Math.round((pago / valor) * 100) : null;
      return { texto: pct === null ? 'paga em parte' : `paga ${pct}%`, tom: 'parcial' };
    }
    /* ⚠ `base_indefinida` É AUSÊNCIA, E O TRAÇO É A SENTINELA DA CASA: a view não soube dizer
       qual é a dívida, e afirmar "a pagar" seria inventar uma resposta que ela não deu. */
    case 'base_indefinida': return { texto: '—', tom: 'ausente' };
    default:
      return proximoVencimento
        ? { texto: `a pagar ${ddmm(proximoVencimento)}`, tom: 'aberto' }
        : { texto: 'a pagar', tom: 'aberto' };
  }
}

/** A situação de UMA parcela — a mesma família de palavras da operação. */
export function situacaoDaParcela(saldo: number, vencimento: string | null, diasVencida: number): SituacaoLegivel {
  if (diasVencida > 0) return { texto: `vencida há ${diasVencida} dias`, tom: 'vencido' };
  if (saldo <= 0.01) return { texto: 'paga', tom: 'ok' };
  return { texto: `vence ${ddmm(vencimento)}`, tom: 'aberto' };
}

export async function carregarResumoOC(
  clienteId: string,
  operacoes: readonly OpBase[],
  nomeContraparte: (id: string | null) => string,
): Promise<OcResumo> {
  const ids = operacoes.map((o) => o.id);
  if (ids.length === 0) return { blocos: [], geradoEm: new Date() };

  /* eslint-disable @typescript-eslint/no-explicit-any -- idioma documentado: as views não
     estão em types.ts (regeneração é frente própria). */
  const [rLotes, rLiq, rParc, rMov, rObr] = await Promise.all([
    (supabase as any).from('vw_oc_lotes_recebimento')
      .select('operacao_id, categoria_negociada, qtd_negociada, qtd_recebida').eq('cliente_id', clienteId).in('operacao_id', ids),
    (supabase as any).from('vw_oc_operacao_liquidacao')
      .select('operacao_id, valor_total, total_liquidado_valido, saldo_operacao, estado_liquidacao')
      .eq('cliente_id', clienteId).in('operacao_id', ids),
    (supabase as any).from('vw_oc_parcelas_materializacao')
      .select('operacao_id, compromisso_id, sequencia, valor, vencimento, saldo_titulo, status, titulo_status_transacao')
      .eq('cliente_id', clienteId).in('operacao_id', ids),
    (supabase as any).from('zoo_operacao_movimentacoes')
      .select('operacao_id, movimentacao_id').in('operacao_id', ids),
    /* ⚠ A SEXTA CONSULTA EXISTE PORQUE A QUINTA MENTE NO VALOR — PR-OC-RESUMO-02 item C.
       `vw_oc_operacao_liquidacao.valor_total` NÃO calcula nada: a view seleciona
       `o.valor_total` cru de `zoo_operacoes_comerciais` (conferido no `pg_get_viewdef`), e
       essa coluna denormalizada está em ZERO nas 14 operações do Agnaldo em ago→set —
       enquanto `valor_acordado` traz o número certo. Era por isso que a coluna Valor saía
       0,00 no PDF inteiro e "falta pagar" saía certo: o saldo vem de `_oc_base_divida_operacao`,
       que lê a dívida viva, e o valor vinha da coluna morta.
       ⚠ `obrigacao_total` É A FONTE, e ela confere: nas 14 operações medidas é idêntica ao
       `valor_acordado`, inclusive na Compra de 110 (R$ 315.000). Ela é a obrigação que a
       operação de fato gerou — a mesma que o Financeiro cobra. */
    (supabase as any).from('vw_oc_operacao_compromissos_resumo')
      .select('operacao_id, obrigacao_total, entrada_obrigacao, saida_obrigacao, entrada_liquidado, saida_liquidado')
      .eq('cliente_id', clienteId).in('operacao_id', ids),
  ]);

  /* ⚠ A DATA VEM NUMA SEGUNDA VIAGEM, e não num embed. A coluna é `movimentacao_id` (não
     `lancamento_id`) e a FK para `lancamentos` é COMPOSTA — `(movimentacao_id, cliente_id)`.
     Embed com chave composta exige a dica do nome da constraint no PostgREST, e um embed que
     falhasse voltaria `null` em silêncio: a coluna "data receb." mostraria "—" em toda linha
     e pareceria dado ausente em vez de consulta errada. Duas viagens certas valem mais que
     uma incerta. */
  const movIds = ((rMov.data ?? []) as { movimentacao_id: string | null }[])
    .map((m) => m.movimentacao_id).filter((x): x is string => !!x);
  const rLanc = movIds.length
    ? await (supabase as any).from('lancamentos').select('id, data').in('id', movIds)
    : { data: [] };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const dataPorMov = new Map(
    ((rLanc.data ?? []) as { id: string; data: string | null }[]).map((l) => [l.id, l.data]),
  );

  /* OC-STATUS-LADO-01: de que LADO e' cada parcela — pela conta do plano do compromisso dela, a mesma
     regra de `vw_oc_operacao_compromissos_resumo`. Duas viagens a mais, com `in`, nunca por linha. */
  const compIds = Array.from(new Set(((rParc.data ?? []) as { compromisso_id: string | null }[])
    .map((p) => p.compromisso_id).filter((x): x is string => !!x)));
  /* eslint-disable @typescript-eslint/no-explicit-any -- a view nao esta em types.ts */
  const rComp = compIds.length
    ? await (supabase as any).from('vw_oc_compromissos_resumo').select('compromisso_id, plano_conta_id').in('compromisso_id', compIds)
    : { data: [] };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const planoPorComp = new Map(((rComp.data ?? []) as { compromisso_id: string; plano_conta_id: string | null }[])
    .map((c) => [c.compromisso_id, c.plano_conta_id]));
  const planoIds = Array.from(new Set(Array.from(planoPorComp.values()).filter((x): x is string => !!x)));
  const rPlano = planoIds.length
    ? await supabase.from('financeiro_plano_contas').select('id, tipo_operacao').in('id', planoIds)
    : { data: [] };
  const dirPorPlano = new Map(((rPlano.data ?? []) as { id: string; tipo_operacao: string }[]).map((pc) => [pc.id, pc.tipo_operacao]));
  const direcaoDoCompromisso = (compromissoId: string | null): string | null => {
    const plano = compromissoId ? planoPorComp.get(compromissoId) : null;
    return plano ? (dirPorPlano.get(plano) ?? null) : null;
  };

  const lotes = (rLotes.data ?? []) as { operacao_id: string; categoria_negociada: string | null; qtd_negociada: number; qtd_recebida: number }[];
  const liq = (rLiq.data ?? []) as {
    operacao_id: string; valor_total: number; total_liquidado_valido: number;
    saldo_operacao: number; estado_liquidacao: string | null;
  }[];
  const parcelas = (rParc.data ?? []) as {
    operacao_id: string; compromisso_id: string | null; sequencia: number | null; valor: number; vencimento: string | null;
    saldo_titulo: number; status: string | null; titulo_status_transacao: string | null;
  }[];
  const movs = (rMov.data ?? []) as { operacao_id: string; movimentacao_id: string | null }[];
  const obrigacoes = (rObr.data ?? []) as ({ operacao_id: string } & LadosDaOperacao)[];
  const obrPorOp = new Map(obrigacoes.map((o) => [o.operacao_id, Number(o.obrigacao_total ?? 0)]));
  const ladosPorOp = new Map(obrigacoes.map((o) => [o.operacao_id, o]));

  /* Recebimento: a view é por LOTE; a operação soma os lotes dela. É contagem de cabeça,
     não de dinheiro — a regra que proíbe somar no React vale para valor, não para bicho. */
  const recebido = new Map<string, { negociada: number; recebida: number }>();
  for (const l of lotes) {
    const atual = recebido.get(l.operacao_id) ?? { negociada: 0, recebida: 0 };
    recebido.set(l.operacao_id, {
      negociada: atual.negociada + Number(l.qtd_negociada ?? 0),
      recebida: atual.recebida + Number(l.qtd_recebida ?? 0),
    });
  }

  /* Os lotes de cada operação, na ordem em que a view os devolve — é dela a ordenação. */
  const lotesPorOp = new Map<string, { categoria: string; qtd: number }[]>();
  for (const l of lotes) {
    if (!l.categoria_negociada) continue;
    const lista = lotesPorOp.get(l.operacao_id);
    const item = { categoria: l.categoria_negociada, qtd: Number(l.qtd_negociada ?? 0) };
    if (lista) lista.push(item); else lotesPorOp.set(l.operacao_id, [item]);
  }

  const liqPorOp = new Map(liq.map((l) => [l.operacao_id, l]));

  /* A data de entrada é a MENOR das movimentações; `n` conta quantas houve. */
  const datasMov = new Map<string, string[]>();
  for (const m of movs) {
    const d = m.movimentacao_id ? dataPorMov.get(m.movimentacao_id) : null;
    if (!d) continue;
    const lista = datasMov.get(m.operacao_id);
    if (lista) lista.push(d); else datasMov.set(m.operacao_id, [d]);
  }

  const parcPorOp = new Map<string, typeof parcelas>();
  for (const p of parcelas) {
    const lista = parcPorOp.get(p.operacao_id);
    if (lista) lista.push(p); else parcPorOp.set(p.operacao_id, [p]);
  }

  /**
   * O VALOR NEGOCIADO DA OPERAÇÃO — PR-OC-RESUMO-02 item C.
   *
   * ⚠ `??` NÃO SERVIA, E ESSE ERA O DEFEITO INTEIRO. `l?.valor_total ?? op.valor_acordado`
   * só cai para o segundo quando o primeiro é NULO; a view devolve ZERO, que é um número —
   * então o zero vencia e o fallback nunca era exercido. A pergunta certa não é "veio?", é
   * "veio com conteúdo?".
   * ⚠ A ORDEM É A DA SOBERANIA: a obrigação que a operação gerou; senão o valor acordado —
   * que é exatamente o que a coluna VALOR da lista de OC mostra (`valor_acordado ??
   * valor_total`), e as duas telas têm de dizer o mesmo número para a mesma compra.
   */
  const valorDaOperacao = (op: OpBase): number => {
    const obrigacao = obrPorOp.get(op.id) ?? 0;
    if (obrigacao > 0) return obrigacao;
    return Number(op.valor_acordado ?? op.valor_total ?? 0);
  };

  /** O vencimento em aberto mais próximo, e há quantos dias ele venceu (0 = não venceu). */
  const proximoEmAberto = (opId: string): { vencimento: string | null; diasVencida: number } => {
    const abertas = (parcPorOp.get(opId) ?? [])
      .filter((p) => Number(p.saldo_titulo ?? 0) > 0 && p.vencimento)
      .sort((a, b) => (a.vencimento ?? '') < (b.vencimento ?? '') ? -1 : 1);
    const v = abertas[0]?.vencimento ?? null;
    return { vencimento: v, diasVencida: Math.max(0, dias(v)) };
  };

  const linhaDe = (op: OpBase): OcResumoLinha => {
    const rec = recebido.get(op.id) ?? { negociada: 0, recebida: 0 };
    const l = liqPorOp.get(op.id);
    const ds = (datasMov.get(op.id) ?? []).sort();
    /* OC-LIQ-SINAL-01 (B): com compromisso, PELO LADO DA OC (`valoresPeloLado`); sem, o caminho de
       antes, que segue abaixo intacto. */
    const lado = valoresPeloLado(op.tipo_operacao, ladosPorOp.get(op.id));
    const valorAntigo = valorDaOperacao(op);
    const pagoAntigo = Number(l?.total_liquidado_valido ?? 0);
    const saldo = Number(l?.saldo_operacao ?? 0);
    /* ⚠ SALDO ZERO COM VALOR EM PÉ É SUSPEITA, NÃO RESPOSTA — item C. Quando a base da
       dívida não responde, "falta pagar 0,00" ao lado de "valor 315.000,00 · pago 0,00"
       diria que a operação está quitada. O que resta a pagar é então a subtração dos dois
       números que a tela mostra — e nunca menos que zero, porque pagar a mais não é dever
       negativo. Quando o saldo responde, ele manda: é a régua do banco. */
    const faltaAntiga = saldo !== 0 ? saldo : Math.max(0, valorAntigo - pagoAntigo);
    const valor = lado ? lado.valor : valorAntigo;
    const pago = lado ? lado.pago : pagoAntigo;
    const faltaPagar = lado ? lado.falta : faltaAntiga;
    const despesas = lado ? lado.despesas : null;
    const prox = proximoEmAberto(op.id);
    const sit = situacaoDaOperacao(l?.estado_liquidacao ?? null, valor, pago, prox.vencimento, prox.diasVencida);
    return {
      operacao_id: op.id,
      data: op.data_operacao,
      descricao: descricaoPadrao(op, lotesPorOp.get(op.id) ?? []),
      fornecedor: nomeContraparte(op.contraparte_id),
      tipo: op.tipo_operacao,
      qtdNegociada: op.qtd_negociada ?? (rec.negociada || null),
      qtdRecebida: rec.recebida,
      dataRecebimento: { primeira: ds[0] ?? null, n: ds.length },
      valor,
      pago,
      faltaPagar,
      despesas,
      situacao: sit.texto,
      tomSituacao: sit.tom,
    };
  };

  const porTipo = new Map<string, OpBase[]>();
  for (const op of operacoes) {
    const lista = porTipo.get(op.tipo_operacao);
    if (lista) lista.push(op); else porTipo.set(op.tipo_operacao, [op]);
  }

  const blocos: OcResumoBloco[] = [];
  porTipo.forEach((ops, tipo) => {
    const linhas = ops.map(linhaDe);
    const entrou = linhas.filter((l) => l.qtdRecebida > 0);
    const naoEntrou = linhas.filter((l) => l.qtdRecebida === 0);

    const emAberto: OcResumoParcela[] = [];
    const despesasEmAberto: OcResumoParcela[] = [];
    for (const op of ops) {
      const lista = (parcPorOp.get(op.id) ?? []).filter((p) => Number(p.saldo_titulo ?? 0) > 0);
      const total = (parcPorOp.get(op.id) ?? []).length;
      const rec = recebido.get(op.id) ?? { negociada: 0, recebida: 0 };
      const ds = (datasMov.get(op.id) ?? []).sort();
      const gado = rec.recebida === 0 ? 'não entrou'
        : rec.negociada > 0 && rec.recebida < rec.negociada ? `entrou ${rec.recebida} de ${rec.negociada}`
        : `entrou ${ddmm(ds[0] ?? null)}`;
      for (const p of lista) {
        const diasVencida = Math.max(0, dias(p.vencimento));
        /* ⚠ A SITUAÇÃO SAI DA MESMA FAMÍLIA DE PALAVRAS DA OPERAÇÃO, e não do
           `titulo_status_transacao` — que é o enum do título financeiro ('programado',
           'realizado') e responde outra pergunta que não a desta coluna. */
        const sit = situacaoDaParcela(Number(p.saldo_titulo ?? 0), p.vencimento, diasVencida);
        const destino = ehDoLadoDaOperacao(op.tipo_operacao, direcaoDoCompromisso(p.compromisso_id)) ? emAberto : despesasEmAberto;
        destino.push({
          operacao_id: op.id,
          vencimento: p.vencimento,
          descricao: descricaoPadrao(op, lotesPorOp.get(op.id) ?? []),
          fornecedor: nomeContraparte(op.contraparte_id),
          sequencia: p.sequencia,
          totalParcelas: total,
          gado,
          valor: Number(p.saldo_titulo ?? 0),
          situacao: sit.texto,
          tomSituacao: sit.tom,
          diasVencida,
        });
      }
    }
    /* ⚠ ORDENADA POR VENCIMENTO, sempre: a pergunta desta lista é "o que vence primeiro". */
    const porVencimento = (a: OcResumoParcela, b: OcResumoParcela) =>
      (a.vencimento ?? '') < (b.vencimento ?? '') ? -1 : (a.vencimento ?? '') > (b.vencimento ?? '') ? 1 : 0;
    emAberto.sort(porVencimento);
    despesasEmAberto.sort(porVencimento);

    blocos.push({ tipo, entrou, naoEntrou, faltaPagar: emAberto, despesasEmAberto });
  });

  /* Ordem fixa dos blocos — nunca a de chegada do banco. */
  const ORDEM = ['compra', 'venda', 'abate', 'boitel'];
  blocos.sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));

  return { blocos, geradoEm: new Date() };
}

/** O total de uma lista, para a faixa do título e a linha de fechamento. */
export function totalLinhas(linhas: readonly OcResumoLinha[]) {
  return linhas.reduce((a, l) => ({
    n: a.n + 1,
    cab: a.cab + (l.qtdNegociada ?? 0),
    cabReceb: a.cabReceb + l.qtdRecebida,
    valor: a.valor + l.valor,
    pago: a.pago + l.pago,
    falta: a.falta + l.faltaPagar,
    despesas: a.despesas + (l.despesas ?? 0),
  }), { n: 0, cab: 0, cabReceb: 0, valor: 0, pago: 0, falta: 0, despesas: 0 });
}

/**
 * A PARCELA E' DO LADO DA OPERACAO? — OC-STATUS-LADO-01. Venda/abate: entrada; compra: saida. Direcao
 * desconhecida (compromisso sem conta do plano — zero casos medidos em 25/09/2026) fica no lado da
 * operacao, que e' onde ela sempre esteve.
 */
export function ehDoLadoDaOperacao(tipo: string, direcao: string | null): boolean {
  if (!direcao) return true;
  return direcao === (tipo === 'compra' ? '2-Saídas' : '1-Entradas');
}

/** Os totais por lado que `vw_oc_operacao_compromissos_resumo` devolve (o que o modal da OC já lê). */
export interface LadosDaOperacao {
  obrigacao_total: number | null;
  entrada_obrigacao: number | null;
  saida_obrigacao: number | null;
  entrada_liquidado: number | null;
  saida_liquidado: number | null;
}

/**
 * O RESUMO LÊ PELO LADO DA OPERAÇÃO — OC-LIQ-SINAL-01 (B), a mesma leitura do modal da OC.
 *
 * ⚠ O DEFEITO: "Valor" era `obrigacao_total` e "Pago" era a soma de TODAS as liquidações — os dois
 *   lados somados como se fossem um. Numa venda de boitel com o adiantamento pago (Vera b58bf556) o
 *   resumo dizia "paga 14%" sem um real recebido; na c80ebe9e, Valor 113.140,29 e Pago 108.084,29
 *   numa venda de 102.311,46.
 * ⚠ O LADO VEM DA VIEW, que o resolve pela conta do plano de cada compromisso — a tela não decide de
 *   que lado cada coisa está. Venda/abate: o lado é ENTRADA; compra: SAÍDA. O outro lado vira
 *   "Despesas", numa coluna própria.
 * ⚠ SEM COMPROMISSO (`obrigacao_total` zero ou ausente) DEVOLVE `null`: o chamador segue o caminho de
 *   antes (valor acordado e a base da view), porque não há lado a ler.
 * ⚠ O ESTADO DA OC NÃO MUDA AQUI — isso é o OC-STATUS-LADO-01. Muda o que o resumo mostra.
 */
export function valoresPeloLado(tipo: string, l: LadosDaOperacao | undefined):
  { valor: number; pago: number; falta: number; despesas: number } | null {
  if (!l || !(Number(l.obrigacao_total ?? 0) > 0)) return null;
  const compra = tipo === 'compra';
  const valor = Number((compra ? l.saida_obrigacao : l.entrada_obrigacao) ?? 0);
  const pago = Number((compra ? l.saida_liquidado : l.entrada_liquidado) ?? 0);
  const despesas = Number((compra ? l.entrada_obrigacao : l.saida_obrigacao) ?? 0);
  /* Pagar a mais não é dever negativo — a mesma regra do caminho de antes. */
  const falta = Math.max(0, Math.round((valor - pago) * 100) / 100);
  return { valor, pago, falta, despesas };
}
