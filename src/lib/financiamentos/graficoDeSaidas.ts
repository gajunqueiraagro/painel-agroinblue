/**
 * FIN-FINANC-28 · PASSO 4c — o gráfico "O que falta pagar" v2 (mock `docs/mocks/mock-grafico-a-pagar-v2.html`, md5 cb2c0e01…). Dono
 * PURO, em CENTAVOS INTEIROS, sobre o MESMO lote dos cards (`fn_financiamentos_situacao_lote`): nenhuma consulta nova.
 *
 * ⚠ CADA PARCELA CAI NO PERÍODO DO SEU VENCIMENTO, inteira, em segmentos: JÁ PAGO (o `valorPago` do lote; parcela paga sem valor
 *   pago gravado = o total dela, a regra do cartão "pago") · VENCIDO (o que falta, vencimento antes de HOJE) · A PAGAR (o que falta,
 *   de hoje em diante). O vencido fica no mês/ano em que venceu — a coluna "venc." à parte SAIU.
 * ⚠ ANUAL: o que falta da parcela reparte principal × juros na proporção dela (os juros são o RESTO), a regra herdada
 *   do `cronogramaEmAberto.ts` (que saiu no passo 4c); o vencido não reparte (é dinheiro atrasado, inteiro).
 * ⚠ PERÍODOS COMPLETOS: o mensal mostra anos civis inteiros (jan–dez) ou safras inteiras (jul–jun) do 1º ao último mês com parcela; o
 *   anual, anos ou safras inteiros. O tempo não pula: período vazio é coluna zerada.
 * ⚠ RECORTE DE VENCIMENTO (passo 4c A): com `intervalo`, só as parcelas com vencimento em [de, até] entram — a MESMA regra dos cards.
 */
import type { ParcelaDoContrato, SituacaoDoContrato } from './situacaoDoContrato';

const cent = (v: number) => Math.round(v * 100);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const LETRAS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export type BaseDoPeriodo = 'civil' | 'safra';
export interface IntervaloDeVencimento { de: string | null; ate: string | null }

/** a parcela está no intervalo de vencimento? (sem intervalo, sim; parcela sem vencimento só entra sem intervalo) */
export function noIntervalo(venc: string | null, i: IntervaloDeVencimento | null | undefined): boolean {
  if (!i || (!i.de && !i.ate)) return true;
  if (!venc) return false;
  if (i.de && venc < i.de) return false;
  if (i.ate && venc > i.ate) return false;
  return true;
}
/** o contrato aparece com o filtro de vencimento se tem QUALQUER parcela (paga ou não) com vencimento no intervalo */
export function temParcelaNoIntervalo(s: SituacaoDoContrato | null | undefined, i: IntervaloDeVencimento | null | undefined): boolean {
  if (!i || (!i.de && !i.ate)) return true;
  return !!s && s.parcelas.some((p) => noIntervalo(p.dataVencimento, i));
}

export interface ParcelaNoGrafico { venc: string | null; pagoCent: number; vencidoCent: number; aPagarCent: number; principalCent: number; jurosCent: number }

/** os segmentos de cada parcela: pago · vencido · a pagar (e, do a pagar, principal × juros) */
export function parcelasDoGrafico(situacoes: readonly (SituacaoDoContrato | null | undefined)[], hoje: string, intervalo?: IntervaloDeVencimento | null): ParcelaNoGrafico[] {
  const out: ParcelaNoGrafico[] = [];
  for (const s of situacoes) {
    if (!s) continue;
    for (const p of s.parcelas) {
      if (!noIntervalo(p.dataVencimento, intervalo)) continue;
      out.push(segmentos(p, hoje));
    }
  }
  return out;
}
function segmentos(p: ParcelaDoContrato, hoje: string): ParcelaNoGrafico {
  const vt = cent(p.valorTotal);
  const pago = p.situacao === 'paga' ? (cent(p.valorPago) > 0 ? cent(p.valorPago) : vt) : Math.max(cent(p.valorPago), 0);
  const falta = p.situacao === 'paga' ? 0 : Math.max(vt - pago, 0);
  const vencida = !!p.dataVencimento && p.dataVencimento < hoje;
  const aPagar = vencida ? 0 : falta;
  const principal = vt > 0 ? Math.round((aPagar * cent(p.valorPrincipal)) / vt) : aPagar;
  return { venc: p.dataVencimento, pagoCent: pago, vencidoCent: vencida ? falta : 0, aPagarCent: aPagar, principalCent: principal, jurosCent: aPagar - principal };
}

/** Os cards com o filtro de vencimento: as MESMAS parcelas (as do intervalo), mesma forma do `totaisDasCompras`. */
export function totaisNoIntervalo(ps: readonly ParcelaNoGrafico[]): { total: number; pago: number; emAberto: number; vencidas: number; aPagar: number; diferenca: number } {
  let pago = 0; let venc = 0; let aPagar = 0;
  for (const p of ps) { pago += p.pagoCent; venc += p.vencidoCent; aPagar += p.aPagarCent; }
  const total = pago + venc + aPagar;
  return { total: total / 100, pago: pago / 100, emAberto: (venc + aPagar) / 100, vencidas: venc / 100, aPagar: (total - pago) / 100, diferenca: 0 };
}

export interface ColunaDoGrafico {
  /** 'AAAA-MM' (mensal) · 'AAAA' (anual civil) · 'AAAA/AA' (anual safra, ex. '2026/27') */
  chave: string;
  pagoCent: number; vencidoCent: number; aPagarCent: number; principalCent: number; jurosCent: number;
  /** a soma dos segmentos — o número em cima da coluna e o total do tooltip */
  totalCent: number;
  /** o eixo: a letra do mês ou o ano; `marcaAno` = começo de ano (ou de safra) — a linha tracejada e o ano embaixo */
  rotulo: string; marcaAno: string | null; rotuloLongo: string;
}
export interface GraficoDeSaidas {
  colunas: ColunaDoGrafico[];
  aPagarHojeCent: number; vencidoCent: number; principalCent: number; jurosCent: number;
  /** a última coluna com algo em aberto ('AAAA-MM' / ano); nula sem nada em aberto */
  ultima: string | null;
}

const vazia = (chave: string, rotulo: string, marcaAno: string | null, rotuloLongo: string): ColunaDoGrafico =>
  ({ chave, pagoCent: 0, vencidoCent: 0, aPagarCent: 0, principalCent: 0, jurosCent: 0, totalCent: 0, rotulo, marcaAno, rotuloLongo });
const somar = (c: ColunaDoGrafico, p: ParcelaNoGrafico) => {
  c.pagoCent += p.pagoCent; c.vencidoCent += p.vencidoCent; c.aPagarCent += p.aPagarCent; c.principalCent += p.principalCent; c.jurosCent += p.jurosCent;
  c.totalCent = c.pagoCent + c.vencidoCent + c.aPagarCent;
};
function resumo(colunas: ColunaDoGrafico[], ps: readonly ParcelaNoGrafico[], ultima: string | null): GraficoDeSaidas {
  let v = 0; let a = 0; let pr = 0; let j = 0;
  for (const p of ps) { v += p.vencidoCent; a += p.aPagarCent; pr += p.principalCent; j += p.jurosCent; }
  return { colunas, aPagarHojeCent: v + a, vencidoCent: v, principalCent: pr, jurosCent: j, ultima };
}

/** MENSAL: um mês por coluna, de jan (ou jul) do 1º bloco com parcela até dez (ou jun) do último. */
export function graficoMensal(ps: readonly ParcelaNoGrafico[], base: BaseDoPeriodo = 'civil'): GraficoDeSaidas {
  const meses = ps.filter((p) => p.venc).map((p) => p.venc!.slice(0, 7)).sort();
  if (meses.length === 0) return resumo([], ps, null);
  const ini = meses[0]; const fim = meses[meses.length - 1];
  const inicioDoBloco = (am: string) => { const a = +am.slice(0, 4); const m = +am.slice(5, 7); return base === 'civil' ? `${a}-01` : m >= 7 ? `${a}-07` : `${a - 1}-07`; };
  const fimDoBloco = (am: string) => { const a = +am.slice(0, 4); const m = +am.slice(5, 7); return base === 'civil' ? `${a}-12` : m >= 7 ? `${a + 1}-06` : `${a}-06`; };
  const prox = (am: string) => { const a = +am.slice(0, 4); const m = +am.slice(5, 7); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
  const colunas: ColunaDoGrafico[] = []; const por = new Map<string, ColunaDoGrafico>();
  for (let k = inicioDoBloco(ini); k <= fimDoBloco(fim); k = prox(k)) {
    const m = +k.slice(5, 7);
    const comecaBloco = base === 'civil' ? m === 1 : m === 7;
    const marca = comecaBloco ? (base === 'civil' ? k.slice(0, 4) : `${k.slice(2, 4)}/${String(+k.slice(2, 4) + 1).padStart(2, '0')}`) : null;
    const c = vazia(k, LETRAS[m - 1], marca, `${MESES[m - 1]}/${k.slice(2, 4)}`);
    colunas.push(c); por.set(k, c);
  }
  let ultima: string | null = null;
  for (const p of ps) {
    if (!p.venc) continue;
    const k = p.venc.slice(0, 7); somar(por.get(k)!, p);
    if (p.vencidoCent + p.aPagarCent > 0 && (!ultima || k > ultima)) ultima = k;
  }
  return resumo(colunas, ps, ultima);
}

/** ANUAL: um ano civil (ou uma safra jul–jun) por coluna, do 1º ao último com parcela. */
export function graficoAnual(ps: readonly ParcelaNoGrafico[], base: BaseDoPeriodo = 'civil'): GraficoDeSaidas {
  const chaveDe = (venc: string) => {
    const a = +venc.slice(0, 4); const m = +venc.slice(5, 7);
    return base === 'civil' ? String(a) : m >= 7 ? `${a}/${String((a + 1) % 100).padStart(2, '0')}` : `${a - 1}/${String(a % 100).padStart(2, '0')}`;
  };
  const chaves = ps.filter((p) => p.venc).map((p) => chaveDe(p.venc!)).sort();
  if (chaves.length === 0) return resumo([], ps, null);
  const ano = (k: string) => +k.slice(0, 4);
  const colunas: ColunaDoGrafico[] = []; const por = new Map<string, ColunaDoGrafico>();
  for (let a = ano(chaves[0]); a <= ano(chaves[chaves.length - 1]); a++) {
    const k = base === 'civil' ? String(a) : `${a}/${String((a + 1) % 100).padStart(2, '0')}`;
    const rot = base === 'civil' ? String(a) : `${String(a % 100).padStart(2, '0')}/${String((a + 1) % 100).padStart(2, '0')}`;
    const c = vazia(k, rot, null, base === 'civil' ? String(a) : `safra ${rot}`);
    colunas.push(c); por.set(k, c);
  }
  let ultima: string | null = null;
  for (const p of ps) {
    if (!p.venc) continue;
    const k = chaveDe(p.venc); somar(por.get(k)!, p);
    if (p.vencidoCent + p.aPagarCent > 0 && (!ultima || k > ultima)) ultima = k;
  }
  return resumo(colunas, ps, ultima);
}

/** O número curto: ≥ 1 mi "1,6 mi"; ≥ 10 mil "143k"; ≥ 1 mil "8,2k"; abaixo, o inteiro. */
export function rotuloCurto(cents: number): string {
  const v = cents / 100; const a = Math.abs(v);
  const um = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (a >= 1_000_000) return `${um(v / 1_000_000)} mi`;
  if (a >= 10_000) return `${Math.round(v / 1000)}k`;
  if (a >= 1000) return `${um(v / 1000)}k`;
  return String(Math.round(v));
}

/** A escala do eixo vertical: 4 ou 5 marcas redondas — o MENOR passo de 1, 2, 2,5 ou 5 × 10ⁿ que cobre o maior total em até 4
 *  intervalos (143 mil → 0 · 50k · 100k · 150k; 3,5 mi → 0 · 1 · 2 · 3 · 4 mi, os do mock). */
export function escalaDoEixo(maiorCent: number): number[] {
  const max = Math.max(maiorCent / 100, 1);
  const e0 = Math.floor(Math.log10(max)) - 2;
  for (let e = e0; e <= e0 + 4; e++) {
    for (const f of [1, 2, 2.5, 5]) {
      const passo = f * 10 ** e;
      const k = Math.ceil(max / passo);
      if (k <= 4) return Array.from({ length: Math.max(k, 3) + 1 }, (_, i) => Math.round(i * passo * 100));
    }
  }
  return [0, Math.round(max * 100)];
}

/** O tooltip da coluna: o que o número em cima soma, segmento a segmento (a mesma fonte). */
export function tooltipDaColuna(c: ColunaDoGrafico, anual: boolean): string {
  const r = (x: number) => `R$ ${(x / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return anual
    ? `${c.rotuloLongo}: pago ${r(c.pagoCent)} · vencido ${r(c.vencidoCent)} · principal a pagar ${r(c.principalCent)} · juros previstos ${r(c.jurosCent)}`
    : `${c.rotuloLongo}: pago ${r(c.pagoCent)} · vencido ${r(c.vencidoCent)} · a pagar ${r(c.aPagarCent)}`;
}

/** "Ainda a pagar em jan/AA": o a pagar dos meses a partir de 1º de janeiro do ano seguinte a HOJE (o vencido não entra). */
export function aindaAPagarEmJaneiroDoGrafico(g: GraficoDeSaidas, hoje: string): { rotulo: string; cent: number } {
  const ano = Number(hoje.slice(0, 4)) + 1; const desde = `${ano}-01`;
  let soma = 0;
  for (const c of g.colunas) if (c.chave.length === 7 && c.chave >= desde) soma += c.aPagarCent;
  return { rotulo: `jan/${String(ano).slice(2)}`, cent: soma };
}

export type TipoDoSegmento = 'pago' | 'vencido' | 'aPagar' | 'principal' | 'juros';
/** A pilha da coluna, de baixo para cima: cada segmento com o valor e onde ele começa (a soma dos de baixo). Zerados saem. */
export function pilhaDaColuna(c: ColunaDoGrafico, anual: boolean): { tipo: TipoDoSegmento; valorCent: number; baseCent: number }[] {
  const ordem: [TipoDoSegmento, number][] = anual
    ? [['pago', c.pagoCent], ['vencido', c.vencidoCent], ['principal', c.principalCent], ['juros', c.jurosCent]]
    : [['pago', c.pagoCent], ['vencido', c.vencidoCent], ['aPagar', c.aPagarCent]];
  const out: { tipo: TipoDoSegmento; valorCent: number; baseCent: number }[] = [];
  let base = 0;
  for (const [tipo, v] of ordem) { if (v > 0) out.push({ tipo, valorCent: v, baseCent: base }); base += Math.max(v, 0); }
  return out;
}
/** o maior total entre as colunas (a escala do eixo) */
export function maiorTotal(g: GraficoDeSaidas): number {
  let m = 0; for (const c of g.colunas) if (c.totalCent > m) m = c.totalCent;
  return m;
}
