/**
 * CPR-PERIODO-VENCIDOS-01 — O RECORTE DE CONTAS A PAGAR E RECEBER, num dono só.
 *
 * Função pura: decide o PERÍODO de cada atalho, em que BALDE cai cada conta e quanto somam os cartões e o total. A tela
 * só renderiza — Lista e Fluxo leem o MESMO resultado, dos MESMOS dados (antes os cartões somavam "o que a visão
 * carregou", e trocar Lista ↔ Fluxo mudava os dois números com o mesmo rótulo).
 *
 * ⚠ DATAS LOCAIS, SEMPRE EM TEXTO 'YYYY-MM-DD'. Nada de `toISOString()` (converte para UTC e anda um dia à noite): as
 *   contas de calendário usam `Date.UTC` só como aritmética de dias, nunca o relógio.
 * ⚠ CADA CONTA CAI EM EXATAMENTE UM BALDE, e nada se arredonda: os valores somam em CENTAVOS inteiros.
 */

export type AtalhoCpr = 'mes' | '30' | '60' | 'datas';
export interface PeriodoCpr { de: string; ate: string }

export const ATALHOS_CPR: { valor: AtalhoCpr; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: '30', rotulo: '30 dias' },
  { valor: '60', rotulo: '60 dias' },
  { valor: 'datas', rotulo: 'Escolher datas' },
];

const partes = (iso: string) => ({ a: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });
const p2 = (n: number) => String(n).padStart(2, '0');
const isoDe = (ms: number) => { const x = new Date(ms); return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`; };
const msDe = (iso: string) => { const { a, m, d } = partes(iso); return Date.UTC(a, m - 1, d); };

/** `iso` + n dias (calendário; sem fuso). */
export function somarDiasIso(iso: string, n: number): string { return isoDe(msDe(iso) + n * 86_400_000); }
/** Dias de `de` até `ate` (positivo = `ate` depois). */
export function diasEntre(de: string, ate: string): number { return Math.round((msDe(ate) - msDe(de)) / 86_400_000); }

/** O período de um atalho. "Este mês" = 1º ao último dia do mês de hoje; "30 dias" = hoje a hoje+30; "60 dias" = hoje a hoje+60. */
export function periodoDoAtalho(atalho: Exclude<AtalhoCpr, 'datas'>, hoje: string): PeriodoCpr {
  if (atalho === 'mes') {
    const { a, m } = partes(hoje);
    return { de: `${a}-${p2(m)}-01`, ate: isoDe(Date.UTC(a, m, 0)) };
  }
  return { de: hoje, ate: somarDiasIso(hoje, Number(atalho)) };
}

/** O que a função precisa de cada linha (a view entrega mais; aqui só o que decide). */
export interface ContaCpr {
  id: string;
  data_vencimento: string | null;
  data_pagamento?: string | null;
  status_transacao: string | null;
  tipo_operacao: string | null;
  valor: number | string | null;
  /** CPR-CONTA-01: os dois campos de conta do lançamento; quem vale é o da DIREÇÃO (`contaDaConta`). */
  conta_bancaria_id?: string | null;
  conta_destino_id?: string | null;
}

/**
 * Os baldes — exatamente um por conta:
 *  'paga'            realizada, ou com data de pagamento (não é conta a pagar nem a receber: fica fora dos totais);
 *  'sem_vencimento'  em aberto, sem data de vencimento (grupo próprio, fora dos cartões do período);
 *  'vencido'         em aberto, vencimento ANTES de hoje — de qualquer idade, inclusive o que está entre "de" e ontem;
 *  'periodo'         em aberto, vencimento de max(de, hoje) até "até" (o dia de hoje é do período, não vencido);
 *  'fora'            em aberto, mas depois de "até" (ou entre hoje e um "de" futuro).
 */
export type BaldeCpr = 'paga' | 'sem_vencimento' | 'vencido' | 'periodo' | 'fora';

const STATUS_PAGOS = new Set(['realizado', 'conciliado']);
export function contaEmAberto(c: Pick<ContaCpr, 'status_transacao' | 'data_pagamento'>): boolean {
  return !STATUS_PAGOS.has((c.status_transacao ?? '').toLowerCase()) && !c.data_pagamento;
}

export function baldeDaConta(c: ContaCpr, periodo: PeriodoCpr, hoje: string): BaldeCpr {
  if (!contaEmAberto(c)) return 'paga';
  const v = c.data_vencimento ? c.data_vencimento.slice(0, 10) : null;
  if (!v) return 'sem_vencimento';
  if (v < hoje) return 'vencido';
  if (v >= periodo.de && v <= periodo.ate) return 'periodo';
  return 'fora';
}

/* ─── CPR-CONTA-01 — a conta de cada lançamento ─────────────────────────────────────────────────────────────────────────
   UMA regra, a da direção (a mesma do sistema inteiro): entrada → `conta_destino_id`; o resto → `conta_bancaria_id`.
   Medido em 05/10/2026 nos em aberto de todos os clientes: nunca os dois preenchidos, e a regra = `conta_efetiva_id` em 100%. */
export const SEM_CONTA = 'sem_conta';
/** `null` = todas as contas; um id = aquela conta; `SEM_CONTA` = os lançamentos sem conta definida. */
export type FiltroContaCpr = string | null;
export function contaDaConta(c: Pick<ContaCpr, 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id'>): string | null {
  return ((c.tipo_operacao ?? '').startsWith('1-') ? c.conta_destino_id : c.conta_bancaria_id) ?? null;
}
export function daContaCpr(c: Pick<ContaCpr, 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id'>, filtro: FiltroContaCpr): boolean {
  if (filtro == null) return true;
  const conta = contaDaConta(c);
  return filtro === SEM_CONTA ? conta == null : conta === filtro;
}

export const ehPagarCpr = (c: Pick<ContaCpr, 'tipo_operacao'>) => (c.tipo_operacao ?? '').startsWith('2-');
export const ehReceberCpr = (c: Pick<ContaCpr, 'tipo_operacao'>) => (c.tipo_operacao ?? '').startsWith('1-');

/** O valor da conta em CENTAVOS inteiros, em módulo (a direção é do tipo, não do sinal). */
export function centavosDaConta(c: Pick<ContaCpr, 'valor'>): number {
  const n = Math.abs(Number(c.valor ?? 0));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
const reais = (centavos: number) => centavos / 100;

export interface LadoCpr { valor: number; contas: number }
export interface SomaCpr { pagar: LadoCpr; receber: LadoCpr }
export type SegmentoCpr = 'pagar' | 'receber' | 'ambos';

export interface RecorteCpr<T extends ContaCpr> {
  periodo: PeriodoCpr;
  hoje: string;
  incluirVencidos: boolean;
  /** Vencidos em aberto, de qualquer idade — o cartão os mostra SEMPRE; a caixa decide se entram na lista e no total. */
  vencidos: SomaCpr & { maisAntiga: string | null; diasDaMaisAntiga: number | null; linhas: T[] };
  /** O período, sem os vencidos. `saldo` = a receber − a pagar. */
  periodoSoma: SomaCpr & { saldo: number; linhas: T[] };
  semVencimento: SomaCpr & { linhas: T[] };
  /** Pagas que a consulta trouxe (pílula "Realizado" ligada): aparecem na lista do dia, nunca nos totais. */
  pagas: T[];
  /** O total do rodapé da lista, por segmento: vencidos (se ligados) + período. Em "ambos" é o líquido (receber − pagar). */
  total: Record<SegmentoCpr, LadoCpr>;
}

function somar<T extends ContaCpr>(linhas: readonly T[]): SomaCpr & { cPagar: number; cReceber: number } {
  let cPagar = 0, cReceber = 0, nPagar = 0, nReceber = 0;
  for (const l of linhas) {
    if (ehPagarCpr(l)) { cPagar += centavosDaConta(l); nPagar += 1; }
    else if (ehReceberCpr(l)) { cReceber += centavosDaConta(l); nReceber += 1; }
  }
  return { pagar: { valor: reais(cPagar), contas: nPagar }, receber: { valor: reais(cReceber), contas: nReceber }, cPagar, cReceber };
}

export function recortarCpr<T extends ContaCpr>(
  linhas: readonly T[], opcoes: { periodo: PeriodoCpr; hoje: string; incluirVencidos: boolean; conta?: FiltroContaCpr },
): RecorteCpr<T> {
  const { periodo, hoje, incluirVencidos } = opcoes;
  const porBalde: Record<BaldeCpr, T[]> = { paga: [], sem_vencimento: [], vencido: [], periodo: [], fora: [] };
  /* CPR-CONTA-01 — o filtro de conta entra AQUI, antes de tudo: cartões, grupos, total e gráfico leem o mesmo recorte. */
  for (const l of linhas) if (daContaCpr(l, opcoes.conta ?? null)) porBalde[baldeDaConta(l, periodo, hoje)].push(l);
  const porData = (a: T, b: T) => {
    const x = a.data_vencimento ?? '', y = b.data_vencimento ?? '';
    return x < y ? -1 : x > y ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  porBalde.vencido.sort(porData); porBalde.periodo.sort(porData);

  const sv = somar(porBalde.vencido), sp = somar(porBalde.periodo), ss = somar(porBalde.sem_vencimento);
  const maisAntiga = porBalde.vencido.length > 0 ? (porBalde.vencido[0].data_vencimento ?? '').slice(0, 10) : null;
  const vP = incluirVencidos ? sv.cPagar : 0, vR = incluirVencidos ? sv.cReceber : 0;
  const nVP = incluirVencidos ? sv.pagar.contas : 0, nVR = incluirVencidos ? sv.receber.contas : 0;
  return {
    periodo, hoje, incluirVencidos,
    vencidos: { pagar: sv.pagar, receber: sv.receber, maisAntiga, diasDaMaisAntiga: maisAntiga ? diasEntre(maisAntiga, hoje) : null, linhas: porBalde.vencido },
    periodoSoma: { pagar: sp.pagar, receber: sp.receber, saldo: reais(sp.cReceber - sp.cPagar), linhas: porBalde.periodo },
    semVencimento: { pagar: ss.pagar, receber: ss.receber, linhas: porBalde.sem_vencimento },
    pagas: porBalde.paga,
    total: {
      pagar: { valor: reais(vP + sp.cPagar), contas: nVP + sp.pagar.contas },
      receber: { valor: reais(vR + sp.cReceber), contas: nVR + sp.receber.contas },
      ambos: { valor: reais((vR + sp.cReceber) - (vP + sp.cPagar)), contas: nVP + nVR + sp.pagar.contas + sp.receber.contas },
    },
  };
}

/** A conta é do segmento? (em "ambos", toda conta a pagar ou a receber.) */
export function doSegmentoCpr(c: Pick<ContaCpr, 'tipo_operacao'>, segmento: SegmentoCpr): boolean {
  return segmento === 'ambos' ? (ehPagarCpr(c) || ehReceberCpr(c)) : segmento === 'pagar' ? ehPagarCpr(c) : ehReceberCpr(c);
}

/** O líquido de um conjunto, no sinal do segmento "ambos" (receber − pagar), em reais. Só contas EM ABERTO. */
export function liquidoEmAberto<T extends ContaCpr>(linhas: readonly T[]): number {
  let c = 0;
  for (const l of linhas) if (contaEmAberto(l)) c += ehReceberCpr(l) ? centavosDaConta(l) : ehPagarCpr(l) ? -centavosDaConta(l) : 0;
  return reais(c);
}

/**
 * O ramo temporal da consulta, no dialeto do PostgREST — UMA busca, igual nas duas visões:
 * período ∪ vencidos em aberto (de qualquer idade) ∪ sem vencimento. Os vencidos vêm SEMPRE (o cartão os mostra mesmo com a
 * caixa desligada); a caixa "Incluir vencidos" decide, em memória, se entram na lista e no total.
 * ⚠ O ramo dos vencidos pede "em aberto" na própria consulta: com a pílula Realizado ligada, um `lt.hoje` cru traria o
 *   histórico inteiro de pagos.
 */
export function ramoDaConsultaCpr(periodo: PeriodoCpr, hoje: string): string {
  return [
    `and(data_vencimento.gte.${periodo.de},data_vencimento.lte.${periodo.ate})`,
    `and(data_vencimento.lt.${hoje},status_transacao.in.(previsto,programado,agendado),data_pagamento.is.null)`,
    'data_vencimento.is.null',
  ].join(',');
}

/** "Vencidos · 12 contas · a mais antiga há 87 dias" — o cabeçalho do grupo do topo. */
export function tituloDoGrupoVencidos(contas: number, diasDaMaisAntiga: number | null): string {
  const n = `${contas} ${contas === 1 ? 'conta' : 'contas'}`;
  if (diasDaMaisAntiga == null) return `Vencidos · ${n}`;
  return `Vencidos · ${n} · a mais antiga há ${diasDaMaisAntiga} ${diasDaMaisAntiga === 1 ? 'dia' : 'dias'}`;
}

/** "Total a pagar · vencidos + período · 14 contas" — o rodapé fixo da lista. */
export function rotuloDoTotal(segmento: SegmentoCpr, incluirVencidos: boolean, contas: number): string {
  const que = segmento === 'pagar' ? 'Total a pagar' : segmento === 'receber' ? 'Total a receber' : 'Total líquido (a receber − a pagar)';
  return `${que} · ${incluirVencidos ? 'vencidos + período' : 'período, sem vencidos'} · ${contas} ${contas === 1 ? 'conta' : 'contas'}`;
}

/* ─── CPR-CONTA-01 — o resumo por conta (as opções do seletor e a faixa abaixo dos cartões) ───────────────────────────────
   O total A PAGAR de cada conta no recorte atual — vencidos (se a caixa está ligada) + período —, com a contagem; "sem conta"
   entra como uma conta (nunca escondida). Maior valor primeiro. A soma das contas é o `total.pagar` de "Todas", ao centavo:
   cada linha cai em exatamente uma conta. O `receber` de cada conta vai junto (conferência e conta só de recebimento). */
export interface ContaNoResumoCpr { conta: string; pagar: LadoCpr; receber: LadoCpr; vencidoPagar: LadoCpr }
export function resumoPorContaCpr<T extends ContaCpr>(
  linhas: readonly T[], opcoes: { periodo: PeriodoCpr; hoje: string; incluirVencidos: boolean },
): ContaNoResumoCpr[] {
  const chaves = new Set<string>();
  for (const l of linhas) {
    const b = baldeDaConta(l, opcoes.periodo, opcoes.hoje);
    if (b === 'periodo' || (b === 'vencido' && opcoes.incluirVencidos)) chaves.add(contaDaConta(l) ?? SEM_CONTA);
  }
  const lista = Array.from(chaves).map((conta) => {
    const r = recortarCpr(linhas, { ...opcoes, conta });
    return { conta, pagar: r.total.pagar, receber: r.total.receber, vencidoPagar: opcoes.incluirVencidos ? r.vencidos.pagar : { valor: 0, contas: 0 } };
  });
  return lista.sort((a, b) => (b.pagar.valor - a.pagar.valor) || (b.receber.valor - a.receber.valor) || (a.conta < b.conta ? -1 : 1));
}

/** A FAIXA "A pagar por conta" só desenha conta com total a pagar MAIOR QUE ZERO (o seletor continua com todas: ele filtra a
 *  pagar e a receber). O "+N" conta só as que a faixa desenharia. */
export function contasDaFaixaCpr(resumo: readonly ContaNoResumoCpr[]): ContaNoResumoCpr[] {
  return resumo.filter((c) => c.pagar.valor > 0);
}
