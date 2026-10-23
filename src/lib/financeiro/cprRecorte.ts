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
  /** CPR-TRANSFERENCIAS-NO-FLUXO-01: a PONTA de uma transferência (posta por `pontasCpr`); ausente em conta a pagar / a receber. */
  ponta?: PontaCpr;
  /** a chave da LINHA na tela: o id, ou `id:ponta` (em "todas as contas" a transferência tem duas linhas com o mesmo id). */
  chave?: string;
}

/* ─── CPR-TRANSFERENCIAS-NO-FLUXO-01 — A TRANSFERÊNCIA TEM DUAS PONTAS (Gabriel, 09/10/2026) ─────────────────────────────
   A tela mostra o FLUXO da conta: tudo o que mexe no saldo. Uma transferência é SAÍDA na conta de origem (`conta_bancaria_id`)
   e ENTRADA na de destino (`conta_destino_id`). `pontasCpr` abre cada transferência nas duas pontas — duas linhas com o mesmo
   lançamento, cada uma com a SUA conta —, e daí em diante a ponta é uma linha como as outras: a saída é "a pagar", a entrada é
   "a receber" (`ehPagarCpr` / `ehReceberCpr`), a conta é a da ponta (`contaDaConta`). São DUAS grafias do tipo no banco
   ('3-Transferência' e '3-Transferências'): sempre pelo prefixo. A regra mora SÓ aqui; tela, gráfico, PDF e Excel só desenham. */
export type PontaCpr = 'saida' | 'entrada';
export const ehTransferenciaCpr = (c: Pick<ContaCpr, 'tipo_operacao'>) => (c.tipo_operacao ?? '').startsWith('3-');
/** A chave da linha (única na lista): `id`, ou `id:ponta` na ponta de transferência. */
export const chaveDaLinhaCpr = (c: Pick<ContaCpr, 'id' | 'chave'>): string => c.chave ?? c.id;
/** Abre cada transferência nas duas pontas (saída primeiro). Idempotente: linha que já é ponta passa como está. */
export function pontasCpr<T extends ContaCpr>(linhas: readonly T[]): T[] {
  const saida: PontaCpr = 'saida', entrada: PontaCpr = 'entrada';
  const out: T[] = [];
  for (const l of linhas) {
    if (!ehTransferenciaCpr(l) || l.ponta) { out.push(l); continue; }
    out.push({ ...l, ponta: saida, chave: `${l.id}:saida` });
    out.push({ ...l, ponta: entrada, chave: `${l.id}:entrada` });
  }
  return out;
}

/**
 * Os baldes — exatamente um por conta:
 *  'paga'            realizada, ou com data de pagamento (não é conta a pagar nem a receber: fica fora dos totais);
 *  'sem_vencimento'  em aberto, sem data de vencimento (grupo próprio, fora dos cartões do período);
 *  'vencido'         em aberto, vencimento ANTES de hoje — de qualquer idade, inclusive o que está entre "de" e ontem;
 *  'periodo'         em aberto, vencimento de max(de, hoje) até "até" (o dia de hoje é do período, não vencido);
 *  'antes_do_periodo' em aberto, entre hoje e um "de" FUTURO: não é listada, mas passa pelo saldo antes de o período começar;
 *  'fora'            em aberto, depois de "até".
 */
export type BaldeCpr = 'paga' | 'sem_vencimento' | 'vencido' | 'periodo' | 'antes_do_periodo' | 'fora';

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
  if (v < periodo.de) return 'antes_do_periodo';
  return 'fora';
}

/* ─── CPR-CONTA-01 — a conta de cada lançamento ─────────────────────────────────────────────────────────────────────────
   UMA regra, a da direção (a mesma do sistema inteiro): entrada → `conta_destino_id`; o resto → `conta_bancaria_id`.
   Medido em 05/10/2026 nos em aberto de todos os clientes: nunca os dois preenchidos, e a regra = `conta_efetiva_id` em 100%. */
export const SEM_CONTA = 'sem_conta';
/** `null` = todas as contas; um id = aquela conta; `SEM_CONTA` = os lançamentos sem conta definida. */
export type FiltroContaCpr = string | null;
export function contaDaConta(c: Pick<ContaCpr, 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id' | 'ponta'>): string | null {
  /* a ponta de ENTRADA de uma transferência mora na conta de destino; a de saída, na de origem */
  const entrada = ehTransferenciaCpr(c) ? c.ponta === 'entrada' : (c.tipo_operacao ?? '').startsWith('1-');
  return (entrada ? c.conta_destino_id : c.conta_bancaria_id) ?? null;
}
export function daContaCpr(c: Pick<ContaCpr, 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id' | 'ponta'>, filtro: FiltroContaCpr): boolean {
  if (filtro == null) return true;
  const conta = contaDaConta(c);
  return filtro === SEM_CONTA ? conta == null : conta === filtro;
}

/* ─── CPR-SALDO-DIA-01 — QUAL VENCIDO CONTA NO SALDO (D1/D2, Gabriel 06/10/2026) ─────────────────────────────────────────
   UMA função, lida pela lista e pelo gráfico. O vencido em aberto conta no saldo (sai/entra HOJE) quando o vencimento é
   POSTERIOR à última conciliação DA CONTA DA LINHA — a âncora que o cartão Caixa usa. Vencimento em mês já conciliado (≤ âncora),
   linha sem conta e conta sem âncora (cartão de crédito inclusive) NÃO contam: o saldo conferido com o banco já diz o que
   aconteceu ali; ficam à vista, e o operador corrige a data do lançamento para ele entrar na soma.
   ⚠ MORA AQUI, E NÃO EM fluxoPrevisto.ts: a regra depende da CONTA da linha e do balde — que são deste dono; o gráfico só desenha
     as linhas que este arquivo lhe entrega. */
/** A data da âncora (última posição conferida) de cada conta que entra no caixa: `contaId → 'YYYY-MM-DD'`. */
export type AncorasCpr = ReadonlyMap<string, string>;
/** As âncoras por conta, LIDAS do cartão Caixa (`SaldoEmCaixa.ancoraPorConta`, a mesma data que o cálculo usou) — nenhum espelho. */
export function ancorasDoCaixaCpr(ancoraPorConta: readonly { contaId: string; data: string }[] | null | undefined): Map<string, string> {
  return new Map((ancoraPorConta ?? []).map((a) => [a.contaId, a.data.slice(0, 10)]));
}
/* ⚠ CPR-AJUSTES-20-10 (regra DECIDIDA pelo Gabriel, 20/10/2026) — SUBSTITUI a D1/D2 do CPR-SALDO-DIA-01: TODO previsto, programado
   ou agendado VENCIDO que nao aconteceu conta no saldo de HOJE, tambem com vencimento anterior a' ultima conciliacao da conta. O
   balde "anteriores a' conciliacao · fora do saldo" deixou de existir. A marca abaixo so' diz QUAIS deles nao apareceram no extrato
   ja' conciliado (vencimento <= a ancora da conta da linha): eles entram hoje com o selo "vencido" e o aviso "confirme se ainda vai
   acontecer". O risco (o motivo do balde antigo): lancamento legado que ja' aconteceu por outro registro passa a tirar do saldo de
   hoje ate' o operador o cancelar ou corrigir a data. */
export function vencidoAnteriorAConciliacao(
  c: Pick<ContaCpr, 'data_vencimento' | 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id' | 'ponta'>, ancoras: AncorasCpr | undefined,
): boolean {
  const conta = contaDaConta(c);
  const ancora = conta ? ancoras?.get(conta) : undefined;
  const venc = (c.data_vencimento ?? '').slice(0, 10);
  return !!ancora && !!venc && venc <= ancora;
}

/**
 * CPR-AJUSTES-20-10 — A ORDEM DENTRO DO DIA (como extrato de banco, lido de cima para baixo): ENTRADAS primeiro, depois SAÍDAS,
 * cada grupo do MAIOR valor para o menor; o que nao e' nem um nem outro vem por ultimo. Empate: a chave da linha (estavel).
 */
export function ordenarDoDiaCpr<T extends ContaCpr>(linhas: readonly T[]): T[] {
  const lado = (l: T) => (ehReceberCpr(l) ? 0 : ehPagarCpr(l) ? 1 : 2);
  return [...linhas].sort((a, b) => {
    const d = lado(a) - lado(b);
    if (d !== 0) return d;
    const v = centavosDaConta(b) - centavosDaConta(a);
    if (v !== 0) return v;
    const p = chaveDaLinhaCpr(a), q = chaveDaLinhaCpr(b);
    return p < q ? -1 : p > q ? 1 : 0;
  });
}

/** Sai da conta: a conta a pagar e a ponta de SAÍDA de uma transferência. */
export const ehPagarCpr = (c: Pick<ContaCpr, 'tipo_operacao' | 'ponta'>) =>
  (c.tipo_operacao ?? '').startsWith('2-') || (ehTransferenciaCpr(c) && c.ponta === 'saida');
/** Entra na conta: a conta a receber e a ponta de ENTRADA de uma transferência. */
export const ehReceberCpr = (c: Pick<ContaCpr, 'tipo_operacao' | 'ponta'>) =>
  (c.tipo_operacao ?? '').startsWith('1-') || (ehTransferenciaCpr(c) && c.ponta === 'entrada');

/**
 * A PONTA QUE NÃO MEXE NO SALDO EM CAIXA: em "todas as contas" (e em "sem conta") o saldo é o do caixa inteiro, e a ponta de uma
 * transferência só o move quando a conta DELA entra no caixa (tem âncora). Ponta sem conta ou em conta sem saldo conferido aparece
 * na lista do dia, apagada, e NÃO soma — a outra ponta, sozinha, é o que sai do (ou entra no) caixa.
 * Com UMA conta escolhida a ponta é dela e conta como qualquer linha.
 * ⚠ P82 (Gabriel 23/10/2026 08h10) — "a compra do cartão é SAÍDA; o pagamento do cartão é TRANSFERÊNCIA". A ponta no CARTÃO do
 *   cliente (`cartoes`, do banco: `fn_cpr_cartoes`, a mesma regra da Visão Geral) conta como DENTRO: o pagamento da fatura (banco →
 *   cartão) tem as duas pontas e se anula; a saída é a compra no cartão, que já conta. Antes, a ponta do banco contava sozinha e a
 *   fatura em aberto saía DUAS vezes (NJ out/26: R$ 5.017,49).
 */
export function pontaForaDoCaixaCpr(
  c: Pick<ContaCpr, 'tipo_operacao' | 'conta_bancaria_id' | 'conta_destino_id' | 'ponta'>, filtro: FiltroContaCpr, ancoras: AncorasCpr | undefined,
  cartoes?: ReadonlySet<string>,
): boolean {
  if (!ehTransferenciaCpr(c) || (filtro != null && filtro !== SEM_CONTA)) return false;
  const conta = contaDaConta(c);
  return !conta || (!ancoras?.has(conta) && !cartoes?.has(conta));
}

/**
 * P82 — O SALDO DOS CARTÕES (a fatura em aberto, do banco: `fn_cpr_cartoes`) somado ao caixa da SÉRIE em "todas as contas": o cartão
 * entra no conjunto como na Visão Geral, e a série dá o mesmo número que ela. O cartão "Caixa" segue sem ele (cartão é limite, não
 * dinheiro). ⚠ O saldo de HOJE vale para o realizado do período: medido em 23/10/2026, a compra e o pagamento da fatura se anulam no
 * mesmo mês (o saldo conciliado dos cartões é zero mês a mês).
 */
export function realizadoComCartoesCpr(realizado: RealizadoCpr | null, saldoCartoes: number): RealizadoCpr | null {
  if (!realizado || !saldoCartoes) return realizado;
  return {
    inicial: { ...realizado.inicial, saldo: realizado.inicial.saldo + saldoCartoes },
    dias: realizado.dias.map((d) => ({ ...d, saldo: d.saldo + saldoCartoes })),
  };
}

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
  /** CPR-AJUSTES-20-10b/c — os vencidos estão na lista e no total? Sempre que o período não está encerrado (eles mexem no saldo
   *  dele). No ENCERRADO os do período moram em `saemHoje`, depois do Fim do período, fora do rodapé. */
  vencidosNaLista: boolean;
  /** os vencidos entram no total do rodapé? Não no período futuro (estão antes do Caixa inicial, já dentro dele). */
  vencidosNoRodape: boolean;
  /** Vencidos em aberto, de qualquer idade — o cartão os mostra SEMPRE. */
  vencidos: SomaCpr & {
    maisAntiga: string | null; diasDaMaisAntiga: number | null; linhas: T[];
    /** CPR-AJUSTES-20-10: TODOS os vencidos em aberto contam no saldo de hoje (o nome ficou: "os que contam") … */
    contam: SomaCpr & { linhas: T[] };
    /** … e, DENTRO deles, os ANTERIORES À CONCILIAÇÃO (vencimento ≤ a âncora da conta): os que não apareceram no extrato já
     *  conciliado — entram hoje com o selo "vencido" e o aviso. `ancoras`: as datas de conciliação das contas deles (distintas). */
    anteriores: SomaCpr & { linhas: T[]; ancoras: string[] };
  };
  /**
   * CPR-AJUSTES-20-10c (Gabriel, 20/10/2026: a caixa que escondia os vencidos saiu) — PERÍODO ENCERRADO: os vencidos em aberto com
   * vencimento DENTRO do período. Não aconteceram; saem (ou entram) HOJE, depois do período — aparecem SEMPRE, num grupo depois do
   * "Fim do período", e NUNCA entram no rodapé nem no Saldo no fim (o encerrado mostra o que aconteceu). Os de vencimento ANTES do
   * início do período não são dele: ficam fora. Fora do encerrado, vazio.
   */
  saemHoje: SomaCpr & { linhas: T[] };
  /** Em aberto entre hoje e um "de" futuro: somadas no saldo, não listadas. */
  antesDoPeriodo: SomaCpr & { linhas: T[] };
  /** O período, sem os vencidos. `saldo` = a receber − a pagar. */
  periodoSoma: SomaCpr & { saldo: number; linhas: T[] };
  semVencimento: SomaCpr & { linhas: T[] };
  /** Pagas que a consulta trouxe (pílula "Realizado" ligada): aparecem na lista do dia, nunca nos totais. */
  pagas: T[];
  /** CPR-AJUSTES-20-10b — as pagas que a LISTA mostra: só as que vencem DENTRO do período (a busca traz também as de hoje até "de",
   *  e uma paga de hoje num período futuro abria um dia "hoje" fora do período) */
  pagasNoPeriodo: T[];
  /** Pontas de transferência do período em conta que NÃO entra no caixa (`pontaForaDoCaixaCpr`): na lista do dia, nunca nos totais. */
  foraDoCaixa: T[];
  /** OS CARTÕES DO TOPO — só CONTAS a pagar e a receber, SEM as pontas de transferência (os totais da lista e o saldo as incluem). */
  cartoes: {
    vencidos: SomaCpr; periodo: SomaCpr;
    /** os vencidos que CONTAM no saldo, só contas (sem as pontas) — o número do cartão "Vencidos que contam" da folha */
    vencidosContam: SomaCpr;
    /** CPR-PDF-ACABAMENTO-01: as contas EM ABERTO do período por status (centavos somados, em reais), dos dois lados … */
    porStatus: { pagar: Record<string, number>; receber: Record<string, number> };
    /** … e, à parte, as pontas de transferência em aberto do período (fora do número grande do cartão) */
    transferencias: SomaCpr;
  };
  /** O total do rodapé da lista, por segmento: vencidos (se contam no rodapé) + período. Em "ambos" é o líquido (receber − pagar). */
  total: Record<SegmentoCpr, LadoCpr>;
  /**
   * REC-VALOR-CERTO-02 — o total A PAGAR (e A RECEBER) do MESMO recorte do rodapé, repartido em CONFIRMADO e ESTIMADO, em
   * CENTAVOS inteiros: confirmado + estimado = total, ao centavo. "Estimado" é a conta cujo id está em `opcoes.estimadas` —
   * o conjunto que a regra única (`ocorrenciaEstimada`, `recorrenciasDoMes.ts`) julgou; este dono NÃO julga, só reparte.
   * Conta que não é de recorrência (ou sem o conjunto) é confirmada.
   */
  aPagarConfirmado: FatiaCpr; aPagarEstimado: FatiaCpr;
  aReceberConfirmado: FatiaCpr; aReceberEstimado: FatiaCpr;
}
/** Uma fatia em CENTAVOS inteiros. */
export interface FatiaCpr { valor: number; qtd: number }
/** A conta está estimada? Só pergunta ao conjunto que veio da regra única. */
export const contaEstimadaCpr = (c: Pick<ContaCpr, 'id'>, estimadas?: ReadonlySet<string>): boolean => !!estimadas && estimadas.has(c.id);

function somar<T extends ContaCpr>(linhas: readonly T[]): SomaCpr & { cPagar: number; cReceber: number } {
  let cPagar = 0, cReceber = 0, nPagar = 0, nReceber = 0;
  for (const l of linhas) {
    if (ehPagarCpr(l)) { cPagar += centavosDaConta(l); nPagar += 1; }
    else if (ehReceberCpr(l)) { cReceber += centavosDaConta(l); nReceber += 1; }
  }
  return { pagar: { valor: reais(cPagar), contas: nPagar }, receber: { valor: reais(cReceber), contas: nReceber }, cPagar, cReceber };
}

export function recortarCpr<T extends ContaCpr>(
  linhas: readonly T[],
  opcoes: { periodo: PeriodoCpr; hoje: string; conta?: FiltroContaCpr; ancoras?: AncorasCpr; estimadas?: ReadonlySet<string>;
    /** P82 — os cartões do cliente (do banco): a ponta neles conta como dentro do caixa */
    cartoes?: ReadonlySet<string> },
): RecorteCpr<T> {
  const { periodo, hoje } = opcoes;
  const porBalde: Record<BaldeCpr, T[]> = { paga: [], sem_vencimento: [], vencido: [], periodo: [], antes_do_periodo: [], fora: [] };
  /* CPR-CONTA-01 — o filtro de conta entra AQUI, antes de tudo: cartões, grupos, total e gráfico leem o mesmo recorte. */
  const filtro = opcoes.conta ?? null;
  const foraDoCaixa: T[] = [];
  for (const l of pontasCpr(linhas)) {
    if (!daContaCpr(l, filtro)) continue;
    const balde = baldeDaConta(l, periodo, hoje);
    /* a ponta em conta fora do caixa não passa pelo saldo: no período fica à vista (sem somar); antes dele, nem é listada.
       CPR-AJUSTES-20-10: a VENCIDA também não (agora todo vencido conta hoje; a ponta numa conta que não está no caixa, não — a
       outra ponta, a da conta do caixa, é a que mexe no saldo e aparece com o selo) */
    if ((balde === 'periodo' || balde === 'antes_do_periodo' || balde === 'vencido') && pontaForaDoCaixaCpr(l, filtro, opcoes.ancoras, opcoes.cartoes)) {
      if (balde === 'periodo') foraDoCaixa.push(l);
      continue;
    }
    porBalde[balde].push(l);
  }
  const porData = (a: T, b: T) => {
    const x = a.data_vencimento ?? '', y = b.data_vencimento ?? '';
    if (x !== y) return x < y ? -1 : 1;
    const p = chaveDaLinhaCpr(a), q = chaveDaLinhaCpr(b);
    /* mesma transferência: a saída antes da entrada; o resto, pelo id */
    if (a.id === b.id) return a.ponta === b.ponta ? 0 : a.ponta === 'saida' ? -1 : 1;
    return p < q ? -1 : p > q ? 1 : 0;
  };
  porBalde.vencido.sort(porData); porBalde.periodo.sort(porData);

  porBalde.antes_do_periodo.sort(porData);
  const sv = somar(porBalde.vencido), sp = somar(porBalde.periodo), ss = somar(porBalde.sem_vencimento);
  const contam = porBalde.vencido;
  const anteriores = porBalde.vencido.filter((l) => vencidoAnteriorAConciliacao(l, opcoes.ancoras));
  const ancorasDosAnteriores = Array.from(new Set(anteriores.map((l) => opcoes.ancoras?.get(contaDaConta(l) ?? '') ?? '').filter(Boolean))).sort();
  const sc = somar(contam), sa = somar(anteriores), sx = somar(porBalde.antes_do_periodo);
  const scc = somar(contam.filter((l) => !ehTransferenciaCpr(l)));
  const semPontas = (ls: readonly T[]) => ls.filter((l) => !ehTransferenciaCpr(l));
  const cv = somar(semPontas(porBalde.vencido)), cp = somar(semPontas(porBalde.periodo));
  const ct = somar(porBalde.periodo.filter((l) => ehTransferenciaCpr(l)));
  const stP = new Map<string, number>(), stR = new Map<string, number>();
  for (const l of semPontas(porBalde.periodo)) {
    const alvo = ehPagarCpr(l) ? stP : ehReceberCpr(l) ? stR : null;
    const st = (l.status_transacao ?? '').toLowerCase();
    if (alvo) alvo.set(st, (alvo.get(st) ?? 0) + centavosDaConta(l));
  }
  const emReais = (m: Map<string, number>) => Object.fromEntries(Array.from(m, ([k, v]) => [k, reais(v)]));
  const maisAntiga = porBalde.vencido.length > 0 ? (porBalde.vencido[0].data_vencimento ?? '').slice(0, 10) : null;
  /* CPR-AJUSTES-20-10b — VENCIDO QUE ENTRA NO SALDO APARECE SEMPRE: em todo período que não está encerrado o vencido em aberto
     tira (ou põe) do saldo de hoje — e por isso está SEMPRE na lista e no total do rodapé. CPR-AJUSTES-20-10c: no ENCERRADO (o
     vencido sai hoje, DEPOIS dele, e não mexe no saldo do período) os do período vão para `saemHoje`, sempre à vista. */
  const encerrado = periodo.ate < hoje;
  const vencidosNaLista = !encerrado;
  const saemHoje = encerrado
    ? porBalde.vencido.filter((l) => { const v = (l.data_vencimento ?? '').slice(0, 10); return v >= periodo.de && v <= periodo.ate; })
    : [];
  const sh = somar(saemHoje);
  /* CPR-AJUSTES-20-10b (correção do rodapé) — o total soma SÓ o que está DEPOIS da linha do Caixa inicial. No período FUTURO os
     vencidos (e o "entre hoje e de") vêm ANTES dela e já estão dentro do Caixa inicial previsto: somá-los de novo no rodapé contava
     duas vezes (Vera, nov/26: 160,83 a mais no a pagar). No período com hoje eles moram no dia de hoje, depois do Caixa inicial. */
  const vencidosNoRodape = vencidosNaLista && periodo.de <= hoje;
  const vP = vencidosNoRodape ? sv.cPagar : 0, vR = vencidosNoRodape ? sv.cReceber : 0;
  const nVP = vencidosNoRodape ? sv.pagar.contas : 0, nVR = vencidosNoRodape ? sv.receber.contas : 0;
  /* REC-VALOR-CERTO-02 — as MESMAS linhas do total do rodapé (vencidos, se contam nele, + período), repartidas pelo conjunto. */
  const fatias = { pc: { valor: 0, qtd: 0 }, pe: { valor: 0, qtd: 0 }, rc: { valor: 0, qtd: 0 }, re: { valor: 0, qtd: 0 } };
  for (const l of [...(vencidosNoRodape ? porBalde.vencido : []), ...porBalde.periodo]) {
    const est = contaEstimadaCpr(l, opcoes.estimadas);
    const f = ehPagarCpr(l) ? (est ? fatias.pe : fatias.pc) : ehReceberCpr(l) ? (est ? fatias.re : fatias.rc) : null;
    if (f) { f.valor += centavosDaConta(l); f.qtd += 1; }
  }
  return {
    periodo, hoje, vencidosNaLista, vencidosNoRodape,
    vencidos: {
      pagar: sv.pagar, receber: sv.receber, maisAntiga, diasDaMaisAntiga: maisAntiga ? diasEntre(maisAntiga, hoje) : null, linhas: porBalde.vencido,
      contam: { pagar: sc.pagar, receber: sc.receber, linhas: contam },
      anteriores: { pagar: sa.pagar, receber: sa.receber, linhas: anteriores, ancoras: ancorasDosAnteriores },
    },
    saemHoje: { pagar: sh.pagar, receber: sh.receber, linhas: saemHoje },
    antesDoPeriodo: { pagar: sx.pagar, receber: sx.receber, linhas: porBalde.antes_do_periodo },
    periodoSoma: { pagar: sp.pagar, receber: sp.receber, saldo: reais(sp.cReceber - sp.cPagar), linhas: porBalde.periodo },
    semVencimento: { pagar: ss.pagar, receber: ss.receber, linhas: porBalde.sem_vencimento },
    pagas: porBalde.paga,
    pagasNoPeriodo: porBalde.paga.filter((l) => { const v = (l.data_vencimento ?? '').slice(0, 10); return v >= periodo.de && v <= periodo.ate; }),
    foraDoCaixa,
    cartoes: {
      vencidos: { pagar: cv.pagar, receber: cv.receber }, periodo: { pagar: cp.pagar, receber: cp.receber },
      vencidosContam: { pagar: scc.pagar, receber: scc.receber },
      porStatus: { pagar: emReais(stP), receber: emReais(stR) }, transferencias: { pagar: ct.pagar, receber: ct.receber },
    },
    total: {
      pagar: { valor: reais(vP + sp.cPagar), contas: nVP + sp.pagar.contas },
      receber: { valor: reais(vR + sp.cReceber), contas: nVR + sp.receber.contas },
      ambos: { valor: reais((vR + sp.cReceber) - (vP + sp.cPagar)), contas: nVP + nVR + sp.pagar.contas + sp.receber.contas },
    },
    aPagarConfirmado: fatias.pc, aPagarEstimado: fatias.pe, aReceberConfirmado: fatias.rc, aReceberEstimado: fatias.re,
  };
}

/** A conta é do segmento? (em "ambos", toda conta a pagar ou a receber.) */
export function doSegmentoCpr(c: Pick<ContaCpr, 'tipo_operacao' | 'ponta'>, segmento: SegmentoCpr): boolean {
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
 * período ∪ vencidos em aberto (de qualquer idade) ∪ sem vencimento. Os vencidos vêm SEMPRE (o cartão os mostra; o dono decide,
 * em memória, onde cada um mora na lista).
 * ⚠ O ramo dos vencidos pede "em aberto" na própria consulta: com a pílula Realizado ligada, um `lt.hoje` cru traria o
 *   histórico inteiro de pagos.
 */
export function ramoDaConsultaCpr(periodo: PeriodoCpr, hoje: string): string {
  /* com "de" FUTURO a busca começa em hoje: o que vence entre hoje e "de" passa pelo saldo antes de o período começar */
  const desde = periodo.de < hoje ? periodo.de : hoje;
  return [
    `and(data_vencimento.gte.${desde},data_vencimento.lte.${periodo.ate})`,
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

/* ─── CPR-CONTA-01 — o resumo por conta (as opções do seletor e a faixa abaixo dos cartões) ───────────────────────────────
   O total A PAGAR de cada conta no recorte atual — vencidos (se contam no rodapé) + período —, com a contagem; "sem conta"
   entra como uma conta (nunca escondida). Maior valor primeiro. A soma das contas é o `total.pagar` de "Todas", ao centavo:
   cada linha cai em exatamente uma conta. O `receber` de cada conta vai junto (conferência e conta só de recebimento).
   CPR-CAIXA-INICIAL-SEMPRE-01 — QUEM ENTRA NA LISTA: toda conta com QUALQUER linha no período — em aberto, PAGA (as que os
   status ligados trouxeram) ou ponta de transferência —, mais as dos vencidos que a lista mostra (no encerrado, os do grupo
   "Saem hoje"), mais a conta JÁ
   ESCOLHIDA (`contaEscolhida`), sempre. Num mês passado tudo é 'paga': sem isto o seletor não oferecia conta nenhuma. A conta
   que só tem pagas entra com a pagar e a receber ZERO (paga nunca soma) — a faixa "A pagar por conta" não a desenha.
   `comRealizado`: as contas com movimento REALIZADO no período, que a tela lê do dono do caixa (este arquivo não o importa):
   os dias realizados aparecem na lista com a pílula Realizado desligada, então a conta deles tem de estar no seletor. */
export interface ContaNoResumoCpr { conta: string; pagar: LadoCpr; receber: LadoCpr; vencidoPagar: LadoCpr }
export function resumoPorContaCpr<T extends ContaCpr>(
  linhas: readonly T[], opcoes: { periodo: PeriodoCpr; hoje: string; contaEscolhida?: FiltroContaCpr; comRealizado?: readonly string[] },
): ContaNoResumoCpr[] {
  const { periodo, hoje } = opcoes;
  const chaves = new Set<string>();
  for (const l of pontasCpr(linhas)) {
    const b = baldeDaConta(l, periodo, hoje);
    const venc = (l.data_vencimento ?? '').slice(0, 10);
    const noPeriodo = venc !== '' && venc >= periodo.de && venc <= periodo.ate;
    if (b === 'periodo' || (b === 'paga' && noPeriodo) || (b === 'vencido' && (periodo.ate >= hoje || noPeriodo))) chaves.add(contaDaConta(l) ?? SEM_CONTA);
  }
  for (const c of opcoes.comRealizado ?? []) chaves.add(c);
  if (opcoes.contaEscolhida != null) chaves.add(opcoes.contaEscolhida);
  const lista = Array.from(chaves).map((conta) => {
    const r = recortarCpr(linhas, { periodo, hoje, conta });
    return { conta, pagar: r.total.pagar, receber: r.total.receber, vencidoPagar: r.vencidosNaLista ? r.vencidos.pagar : { valor: 0, contas: 0 } };
  });
  return lista.sort((a, b) => (b.pagar.valor - a.pagar.valor) || (b.receber.valor - a.receber.valor) || (a.conta < b.conta ? -1 : 1));
}

/** A FAIXA "A pagar por conta" só desenha conta com total a pagar MAIOR QUE ZERO (o seletor continua com todas: ele filtra a
 *  pagar e a receber). O "+N" conta só as que a faixa desenharia. */
export function contasDaFaixaCpr(resumo: readonly ContaNoResumoCpr[]): ContaNoResumoCpr[] {
  return resumo.filter((c) => c.pagar.valor > 0);
}

/* ─── CPR-SALDO-DIA-01 — A SÉRIE DO SALDO (lista e gráfico leem a mesma conta) ───────────────────────────────────────────
   partida = saldo de hoje (o cartão Caixa) − vencidos a pagar que contam + vencidos a receber que contam;
   depois, "entre hoje e de" (se "de" é futuro) e cada DIA do período: saldo = anterior − a pagar + a receber, só contas EM
   ABERTO, dos DOIS lados (o saldo é da conta, não do segmento). Em centavos inteiros. Sem saldo de hoje (cartão de crédito, conta sem âncora): `null`. */
export interface PassoDoSaldoCpr { pagar: LadoCpr; receber: LadoCpr; saldo: number | null }
/**
 * CPR-PDF-ACABAMENTO-01 — O REALIZADO DO PERÍODO, como o dono do caixa o entrega (`realizadoDoCaixa`, saldoEmCaixa.ts: a mesma
 * âncora e a mesma régua do cartão Caixa). Este arquivo NÃO importa aquele: a tela passa o objeto, como já passa as âncoras.
 */
export interface RealizadoCpr {
  inicial: { data: string; saldo: number };
  dias: readonly { data: string; entradas: number; saidas: number; nEntradas: number; nSaidas: number; saldo: number }[];
}
export interface SerieDoSaldoCpr {
  /** o saldo de hoje (o cartão Caixa); `null` = não há (cartão de crédito, conta sem saldo conferido): os saldos ficam todos nulos */
  hoje: number | null;
  /** a data de hoje (a dobra entre o realizado e o projetado) */
  dataDeHoje: string;
  /**
   * CAIXA INICIAL: o saldo no fim do dia ANTERIOR ao início do período. Período que começa até hoje: o do dono do caixa
   * (realizado); que começa depois de hoje: o saldo projetado até a véspera. `null` = o dono não responde naquela data.
   */
  inicial: { data: string; saldo: number } | null;
  /** os dias REALIZADOS do período ANTES de hoje que tiveram movimento (a pagar = o que saiu, a receber = o que entrou) */
  realizados: (PassoDoSaldoCpr & { data: string })[];
  /** o realizado de HOJE (já está dentro do saldo de hoje); nulo sem o realizado ou com hoje fora do período */
  realizadoHoje: PassoDoSaldoCpr | null;
  /** tudo o que foi realizado no período até hoje: inicial + a receber − a pagar = o saldo de hoje (ou o do fim, no período encerrado) */
  totalRealizado: { pagar: LadoCpr; receber: LadoCpr };
  /** PERÍODO INTEIRO NO PASSADO ("até" antes de hoje): o saldo no fim e o mínimo saem do REALIZADO, nunca do caixa de hoje */
  encerrado: boolean;
  /** depois dos vencidos que contam (no período encerrado o saldo é nulo: os vencidos saem hoje, depois do período) */
  partida: PassoDoSaldoCpr;
  entreHojeEDe: PassoDoSaldoCpr | null;
  dias: (PassoDoSaldoCpr & { data: string })[];
  fim: number | null;
  /** o menor saldo da série SÓ NOS DIAS DE DENTRO DO PERÍODO (a véspera — a data do Caixa inicial — não concorre, nem o que
   *  acontece antes de um período futuro); `data` nula = já na partida (hoje). */
  menor: { valor: number; data: string | null } | null;
  /** TUDO o que a série projeta (vencidos que contam + entre hoje e "de" + período): hoje − a pagar + a receber = fim. */
  totalPagar: LadoCpr;
  totalReceber: LadoCpr;
}
export function serieDoSaldoCpr<T extends ContaCpr>(recorte: RecorteCpr<T>, saldoHoje: number | null, realizado?: RealizadoCpr | null): SerieDoSaldoCpr {
  const tem = saldoHoje != null && Number.isFinite(saldoHoje);
  const { periodo, hoje } = recorte;
  const encerrado = periodo.ate < hoje;
  const zero: LadoCpr = { valor: 0, contas: 0 };
  let menor: { valor: number; data: string | null } | null = null;
  let menorC = Number.POSITIVE_INFINITY;
  const ver = (centavos: number, data: string | null) => { if (centavos < menorC) { menorC = centavos; menor = { valor: reais(centavos), data }; } };

  /* ── o REALIZADO: do Caixa inicial até ontem (e hoje, à parte). Só com saldo em caixa e com o período começando até hoje. ── */
  const usa = tem && !!realizado && periodo.de <= hoje;
  const realizados: (PassoDoSaldoCpr & { data: string })[] = [];
  let realizadoHoje: PassoDoSaldoCpr | null = null;
  let rP = 0, rR = 0, rnP = 0, rnR = 0;
  let fimRealizado: number | null = null;
  if (usa && realizado) {
    /* R3: a véspera (o Caixa inicial) NÃO concorre ao Mínimo — só os dias de dentro do período */
    fimRealizado = realizado.inicial.saldo;
    for (const d of realizado.dias) {
      if (d.data < periodo.de || d.data > periodo.ate || d.data > hoje) continue;
      const passo: PassoDoSaldoCpr = { pagar: { valor: d.saidas, contas: d.nSaidas }, receber: { valor: d.entradas, contas: d.nEntradas }, saldo: d.saldo };
      rP += Math.round(d.saidas * 100); rR += Math.round(d.entradas * 100); rnP += d.nSaidas; rnR += d.nEntradas;
      fimRealizado = d.saldo;
      if (d.data === hoje) { realizadoHoje = passo; continue; }
      ver(Math.round(d.saldo * 100), d.data);
      if (d.nSaidas + d.nEntradas > 0) realizados.push({ ...passo, data: d.data });
    }
  }
  const totalRealizado = { pagar: { valor: reais(rP), contas: rnP }, receber: { valor: reais(rR), contas: rnR } };
  const hojeSaldo = tem ? reais(Math.round(saldoHoje * 100)) : null;

  /* ── PERÍODO ENCERRADO: nada é projetado. O fim é o último saldo realizado; os vencidos que contam saem HOJE, depois dele. ── */
  if (encerrado) {
    const s = somar(recorte.vencidos.contam.linhas);
    return {
      hoje: hojeSaldo, dataDeHoje: hoje, inicial: usa && realizado ? realizado.inicial : null, realizados, realizadoHoje: null, totalRealizado, encerrado,
      partida: { pagar: s.pagar, receber: s.receber, saldo: null }, entreHojeEDe: null, dias: [],
      fim: usa ? fimRealizado : null, menor: usa ? menor : null, totalPagar: zero, totalReceber: zero,
    };
  }

  let saldo = tem ? Math.round(saldoHoje * 100) : 0;
  let tP = 0, tR = 0, nP = 0, nR = 0;
  const passo = (linhas: readonly T[], data: string | null, concorre = true): PassoDoSaldoCpr => {
    const s = somar(linhas);
    saldo += s.cReceber - s.cPagar;
    tP += s.cPagar; tR += s.cReceber; nP += s.pagar.contas; nR += s.receber.contas;
    if (tem && concorre) ver(saldo, data);
    return { pagar: s.pagar, receber: s.receber, saldo: tem ? reais(saldo) : null };
  };
  /* R3: hoje só concorre ao Mínimo quando está DENTRO do período; "entre hoje e de" é antes dele, nunca concorre */
  const partida = passo(recorte.vencidos.contam.linhas, null, periodo.de <= hoje);
  const antes = recorte.antesDoPeriodo.linhas;
  const entreHojeEDe = antes.length > 0 ? passo(antes, (antes[antes.length - 1].data_vencimento ?? recorte.hoje).slice(0, 10), false) : null;
  const saldoNaVespera = saldo;
  /* período que começa DEPOIS de hoje: o Caixa inicial é o saldo projetado até a véspera */
  const inicial = usa && realizado ? realizado.inicial
    : (tem && periodo.de > hoje ? { data: somarDiasIso(periodo.de, -1), saldo: reais(saldo) } : null);
  const porDia = new Map<string, T[]>();
  for (const l of recorte.periodoSoma.linhas) {
    const d = (l.data_vencimento ?? '').slice(0, 10);
    const g = porDia.get(d); if (g) g.push(l); else porDia.set(d, [l]);
  }
  const dias = Array.from(porDia.keys()).sort().map((data) => ({ ...passo(porDia.get(data) ?? [], data), data }));
  /* período FUTURO sem conta nenhuma: o saldo é o do Caixa inicial o período inteiro — o Mínimo é ele, no primeiro dia */
  if (tem && menor == null) ver(saldoNaVespera, periodo.de);
  return {
    hoje: hojeSaldo, dataDeHoje: hoje, inicial, realizados, realizadoHoje, totalRealizado, encerrado,
    partida, entreHojeEDe, dias, fim: tem ? reais(saldo) : null, menor,
    totalPagar: { valor: reais(tP), contas: nP }, totalReceber: { valor: reais(tR), contas: nR },
  };
}

/**
 * CPR-AJUSTES-20-10b (correção do rodapé) — O RODAPÉ "Fim do período" TEM UM DONO e soma SÓ o que está DEPOIS da linha do Caixa
 * inicial, para valer, centavo a centavo, em tela, PDF e Excel:  Caixa inicial + A receber − A pagar = Saldo no fim.
 *   encerrado: o realizado do período (nada é projetado);
 *   com hoje: os dias realizados (de "de" até hoje, hoje inclusive) + os vencidos (no dia de hoje) + o em aberto do período;
 *   futuro: só o em aberto do período — vencidos e "entre hoje e de" vêm antes do Caixa inicial e já estão dentro dele.
 * Sem o realizado (sem saldo conferido), o em aberto da lista, como antes.
 */
export interface RodapeCpr { pagar: LadoCpr; receber: LadoCpr; contas: number; realizados: number; encerrado: boolean }
export function rodapeDoPeriodoCpr<T extends ContaCpr>(recorte: RecorteCpr<T>, serie: SerieDoSaldoCpr): RodapeCpr {
  const tr = serie.totalRealizado;
  if (serie.encerrado && serie.inicial) {
    return { pagar: tr.pagar, receber: tr.receber, contas: 0, realizados: tr.pagar.contas + tr.receber.contas, encerrado: true };
  }
  const comRealizado = serie.inicial != null && recorte.periodo.de <= recorte.hoje;
  const junta = (a: LadoCpr, r: LadoCpr): LadoCpr => (comRealizado
    ? { valor: reais(Math.round(a.valor * 100) + Math.round(r.valor * 100)), contas: a.contas + r.contas } : a);
  return {
    pagar: junta(recorte.total.pagar, tr.pagar), receber: junta(recorte.total.receber, tr.receber),
    contas: recorte.total.ambos.contas, realizados: comRealizado ? tr.pagar.contas + tr.receber.contas : 0, encerrado: false,
  };
}
/** O que o título do rodapé conta: "N contas", "N contas · M lançamentos realizados" ou, encerrado, "M lançamentos realizados". */
export function contagemDoRodapeCpr(r: Pick<RodapeCpr, 'contas' | 'realizados' | 'encerrado'>): string {
  const real = `${r.realizados} ${r.realizados === 1 ? 'lançamento realizado' : 'lançamentos realizados'}`;
  if (r.encerrado) return real;
  const abertas = `${r.contas} ${r.contas === 1 ? 'conta' : 'contas'}`;
  return r.realizados > 0 ? `${abertas} · ${real}` : abertas;
}

/**
 * CPR-AJUSTES-20-10 — O DIA DE HOJE NA LISTA: o realizado de hoje (já no caixa) + os vencidos que contam (saem / entram hoje) + o
 * que vence hoje — os totais da linha "Saldo em dd/mm/aaaa" de hoje, em centavos. A tela não soma: lê daqui.
 */
export function totaisDeHojeCpr(serie: SerieDoSaldoCpr): { pagar: LadoCpr; receber: LadoCpr } {
  const d = serie.dias.find((x) => x.data === serie.dataDeHoje);
  const lados = [serie.realizadoHoje, serie.partida, d].filter((x): x is PassoDoSaldoCpr => x != null);
  const junta = (k: 'pagar' | 'receber'): LadoCpr => ({
    valor: reais(lados.reduce((t, x) => t + Math.round(x[k].valor * 100), 0)),
    contas: lados.reduce((t, x) => t + x[k].contas, 0),
  });
  return { pagar: junta('pagar'), receber: junta('receber') };
}

/** As linhas EM ABERTO que o gráfico desenha — as MESMAS que a série soma: vencidos que contam + entre hoje e "de" + período. */
export function linhasDoSaldoCpr<T extends ContaCpr>(recorte: RecorteCpr<T>): T[] {
  return [...recorte.vencidos.contam.linhas, ...recorte.antesDoPeriodo.linhas, ...recorte.periodoSoma.linhas];
}

/* ─── CPR-EXPORT-01 — agregados que só a folha exportada mostra; nascem AQUI, em centavos ──────────────────────────── */
/** Uma semana do período (segunda a domingo, cortada em "de" e "até"): o que vence nela e o saldo no fim dela. */
export interface SemanaCpr { de: string; ate: string; pagar: number; receber: number; saldo: number | null }
/**
 * O resumo por semana, DA SÉRIE: soma os dias da série dentro de cada semana (centavos) e lê o saldo do último dia dela;
 * semana sem conta repete o saldo anterior. A primeira semana parte do saldo antes do período (partida, ou "entre hoje e de").
 */
export function resumoPorSemanaCpr(serie: SerieDoSaldoCpr, periodo: PeriodoCpr): SemanaCpr[] {
  if (!periodo.de || !periodo.ate || periodo.de > periodo.ate) return [];
  const semanas: SemanaCpr[] = [];
  /* o período parte do Caixa inicial quando ele existe; os dias REALIZADOS e os PROJETADOS andam na mesma régua */
  let corrente = serie.inicial ? serie.inicial.saldo : (serie.entreHojeEDe ?? serie.partida).saldo;
  /* hoje é a dobra: o que foi realizado hoje entra na semana, e o saldo passa a ser o de partida (caixa − vencidos que contam) */
  const dobra = !serie.encerrado && serie.dataDeHoje >= periodo.de && serie.dataDeHoje <= periodo.ate
    ? [{ data: serie.dataDeHoje, pagar: serie.realizadoHoje?.pagar ?? { valor: 0, contas: 0 }, receber: serie.realizadoHoje?.receber ?? { valor: 0, contas: 0 }, saldo: (serie.entreHojeEDe ?? serie.partida).saldo }]
    : [];
  const todos = [...serie.realizados, ...dobra, ...serie.dias];
  let ini = periodo.de;
  while (ini <= periodo.ate) {
    const dia = new Date(msDe(ini)).getUTCDay();                    // 0 = domingo
    const domingo = somarDiasIso(ini, (7 - dia) % 7);
    const fim = domingo < periodo.ate ? domingo : periodo.ate;
    let cP = 0, cR = 0;
    for (const d of todos) {
      if (d.data < ini || d.data > fim) continue;
      cP += Math.round(d.pagar.valor * 100); cR += Math.round(d.receber.valor * 100);
      corrente = d.saldo;
    }
    semanas.push({ de: ini, ate: fim, pagar: reais(cP), receber: reais(cR), saldo: corrente });
    ini = somarDiasIso(fim, 1);
  }
  return semanas;
}

/** A linha de uma conta no "Resumo por conta": caixa hoje − a pagar + a receber = saldo no fim (o que a série DELA consome). */
export interface SaldoDaContaCpr { conta: string; caixa: number | null; pagar: LadoCpr; receber: LadoCpr; fim: number | null }
/**
 * O saldo de cada conta no recorte: o MESMO recorte e a MESMA série, conta a conta. `caixaDe` devolve o saldo em caixa da conta
 * (o cartão Caixa dela) ou nulo (cartão de crédito, sem âncora, "sem conta"). Entram as contas com a pagar / a receber no
 * recorte e as que têm caixa diferente de zero; a zerada e sem movimento fica de fora. A soma de a pagar e de a receber das linhas é o total da série de "Todas".
 */
export function saldoPorContaCpr<T extends ContaCpr>(
  linhas: readonly T[],
  opcoes: { periodo: PeriodoCpr; hoje: string; ancoras?: AncorasCpr },
  caixaDe: (conta: string) => number | null,
  contasComCaixa: readonly string[] = [],
): SaldoDaContaCpr[] {
  const vistas = new Set<string>();
  const ordem: string[] = [];
  for (const l of pontasCpr(linhas)) {
    const b = baldeDaConta(l, opcoes.periodo, opcoes.hoje);
    if (b !== 'vencido' && b !== 'periodo' && b !== 'antes_do_periodo') continue;
    const c = contaDaConta(l) ?? SEM_CONTA;
    if (!vistas.has(c)) { vistas.add(c); ordem.push(c); }
  }
  for (const c of contasComCaixa) if (!vistas.has(c)) { vistas.add(c); ordem.push(c); }
  const linhasDe = ordem.map((conta) => {
    const s = serieDoSaldoCpr(recortarCpr(linhas, { ...opcoes, conta }), conta === SEM_CONTA ? null : caixaDe(conta));
    return { conta, caixa: s.hoje, pagar: s.totalPagar, receber: s.totalReceber, fim: s.fim };
  });
  /* só conta com caixa diferente de zero OU com a pagar / a receber no recorte: a zerada e sem movimento não diz nada, e tirá-la
     não muda soma nenhuma (ela só somava zeros) */
  return linhasDe
    .filter((x) => (x.caixa != null && Math.round(x.caixa * 100) !== 0) || x.pagar.contas > 0 || x.receber.contas > 0)
    .sort((a, b) => b.pagar.valor - a.pagar.valor || (a.conta < b.conta ? -1 : 1));
}
