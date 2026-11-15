/**
 * CHUVAS-ANALISE-01 F1 — as contas da tela Produção › Chuvas (análise), mock aprovado `ui-validar/chuvas-analise.html`
 * (Gabriel 12/11 14:20). Funções PURAS sobre as leituras de UMA fazenda (o `useChuvas` é o único leitor; nada se grava).
 *
 * ⚠ DIA SEM LANÇAMENTO NÃO É ZERO. Hoje o operador lança só o dia que choveu (4 lançamentos de 0 mm em 1.072, FASE 0 12/11)
 * e não existe "conferido até". Por isso:
 *   - depois do último lançamento ("lançado até") o mês é "—", nunca 0;
 *   - intervalos sem chuva (veranico, seca) são ENTRE CHUVAS LANÇADAS — é o que se sabe;
 *   - no dia a dia, "lançado sem chuva" é só o lançamento de 0 mm; o resto é "sem lançamento".
 * ⚠ MÉDIA HISTÓRICA = SÓ OS PERÍODOS COMPLETOS ANTERIORES DA PRÓPRIA FAZENDA (P6), no mesmo recorte do período de hoje.
 *   Sem nenhum, a média é `null` ("sem histórico") e a situação também — nunca 0.
 */

export interface Leitura { data: string; mm: number }

/** P1: ano civil (jan–dez do `ano`) ou ano-safra (jul do `ano` a jun do ano seguinte). */
export type ModoPeriodo = 'civil' | 'safra';
export interface Periodo { modo: ModoPeriodo; ano: number }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad = (n: number) => String(n).padStart(2, '0');
const am = (a: number, m: number) => `${a}-${pad(m)}`;

/** Os 12 meses do período, em ordem ('2026-01' … ou '2025-07' … '2026-06'). */
export function mesesDoPeriodo(p: Periodo): string[] {
  const m0 = p.modo === 'civil' ? 1 : 7;
  return Array.from({ length: 12 }, (_, i) => {
    const t = m0 - 1 + i;
    return am(p.ano + Math.floor(t / 12), (t % 12) + 1);
  });
}

/** "jan" · "jan/26" */
export const nomeMes = (anoMes: string, comAno = false) =>
  `${MESES[Number(anoMes.slice(5, 7)) - 1]}${comAno ? `/${anoMes.slice(2, 4)}` : ''}`;

/** O título do período: "2026" ou "safra 25/26". */
export const rotuloPeriodo = (p: Periodo) =>
  (p.modo === 'civil' ? String(p.ano) : `safra ${String(p.ano).slice(2)}/${String(p.ano + 1).slice(2)}`);

const ultimoDia = (anoMes: string) => {
  const a = Number(anoMes.slice(0, 4)); const m = Number(anoMes.slice(5, 7));
  return `${anoMes}-${pad(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
};

/** Dias entre duas datas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(b) - d(a)) / 86400000);
}
function somaDias(s: string, n: number): string {
  const t = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)) + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** O período anterior do mesmo modo. */
const anterior = (p: Periodo, k = 1): Periodo => ({ modo: p.modo, ano: p.ano - k });

/** Primeiro e último lançamento (qualquer mm). `null` sem nenhum. */
export function pontas(ls: readonly Leitura[]): { primeiro: string; ultimo: string } | null {
  if (ls.length === 0) return null;
  let a = ls[0].data; let b = ls[0].data;
  for (const l of ls) { if (l.data < a) a = l.data; if (l.data > b) b = l.data; }
  return { primeiro: a, ultimo: b };
}

/**
 * OS PERÍODOS COMPLETOS ANTERIORES (P6): terminaram antes do período de hoje e a fazenda já lançava no 1º mês deles
 * (o 1º lançamento até o fim do 1º mês). Ex.: Pureza lança desde 01/01/2023 → em 2026 civil: 2023, 2024, 2025; na safra
 * 26/27: 23/24, 24/25, 25/26 (a 22/23 começou antes do 1º lançamento).
 */
export function periodosDeHistorico(ls: readonly Leitura[], p: Periodo): Periodo[] {
  const pt = pontas(ls);
  if (!pt) return [];
  const out: Periodo[] = [];
  for (let k = 1; k <= 50; k++) {
    const q = anterior(p, k);
    const fim1 = ultimoDia(mesesDoPeriodo(q)[0]);
    if (pt.primeiro > fim1) break;
    out.push(q);
  }
  return out.reverse();
}

/** mm de cada mês do período; `null` no mês todo depois do último lançamento ("—": não lançado). */
export function chuvaPorMes(ls: readonly Leitura[], p: Periodo, lancadoAte: string | null): (number | null)[] {
  return mesesDoPeriodo(p).map(m => {
    if (lancadoAte == null || `${m}-01` > lancadoAte) return null;
    return arred(ls.reduce((s, l) => (l.data.startsWith(m) ? s + l.mm : s), 0));
  });
}

const arred = (n: number) => Math.round(n * 10) / 10;

/** A média de cada mês nos períodos de histórico; `null` sem histórico. */
export function mediaPorMes(ls: readonly Leitura[], hist: readonly Periodo[]): (number | null)[] {
  if (hist.length === 0) return Array.from({ length: 12 }, () => null);
  const somas = Array.from({ length: 12 }, () => 0);
  for (const q of hist) {
    const ms = mesesDoPeriodo(q);
    ms.forEach((m, i) => { somas[i] += ls.reduce((s, l) => (l.data.startsWith(m) ? s + l.mm : s), 0); });
  }
  return somas.map(s => arred(s / hist.length));
}

/** Acumulado mês a mês (para no primeiro `null`). */
export function acumulado(porMes: readonly (number | null)[]): (number | null)[] {
  let s = 0; let parou = false;
  return porMes.map(v => { if (parou || v == null) { parou = true; return null; } s = arred(s + v); return s; });
}

/** P3 — faixas FIXAS: abaixo de 85% · 85 a 115% · acima de 115%. `null` sem média. */
export type Situacao = 'abaixo' | 'dentro' | 'acima';
export function situacao(pct: number | null): Situacao | null {
  if (pct == null) return null;
  return pct < 85 ? 'abaixo' : pct <= 115 ? 'dentro' : 'acima';
}
export const ROTULO_SITUACAO: Record<Situacao, string> = { abaixo: 'Abaixo da média', dentro: 'Dentro da média', acima: 'Acima da média' };

/** A cor do mapa de calor (mês × % da média): 5 degraus do mock. */
export type Degrau = 'muito-abaixo' | 'abaixo' | 'dentro' | 'acima' | 'muito-acima';
export function degrau(pct: number | null): Degrau | null {
  if (pct == null) return null;
  return pct < 60 ? 'muito-abaixo' : pct < 85 ? 'abaixo' : pct <= 115 ? 'dentro' : pct <= 140 ? 'acima' : 'muito-acima';
}

/** (a ÷ b) × 100; `null` sem b. */
export const pctDe = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : (a / b) * 100);

/** Leituras de um intervalo fechado de datas. */
const entre = (ls: readonly Leitura[], de: string, ate: string) => ls.filter(l => l.data >= de && l.data <= ate);

/** Dias com chuva (mm > 0) no intervalo. */
export const diasComChuva = (ls: readonly Leitura[], de: string, ate: string) => entre(ls, de, ate).filter(l => l.mm > 0).length;

/** Maior chuva num dia do intervalo; `null` sem chuva. */
export function maiorChuva(ls: readonly Leitura[], de: string, ate: string): Leitura | null {
  let r: Leitura | null = null;
  for (const l of entre(ls, de, ate)) if (l.mm > 0 && (r == null || l.mm > r.mm)) r = l;
  return r;
}

/** A última chuva (mm > 0) até `ate`; `null` sem nenhuma. */
export function ultimaChuva(ls: readonly Leitura[], ate: string): Leitura | null {
  let r: Leitura | null = null;
  for (const l of ls) if (l.mm > 0 && l.data <= ate && (r == null || l.data > r.data)) r = l;
  return r;
}

/**
 * OS INTERVALOS ENTRE CHUVAS LANÇADAS (os dias de fora, sem as duas pontas) dentro de [de, ate].
 * ⚠ Só entre duas chuvas: o trecho depois da última chuva não é intervalo fechado — não se sabe se choveu.
 */
export interface Intervalo { de: string; ate: string; dias: number }
export function intervalosEntreChuvas(ls: readonly Leitura[], de: string, ate: string): Intervalo[] {
  const ch = entre(ls, de, ate).filter(l => l.mm > 0).map(l => l.data).sort();
  const out: Intervalo[] = [];
  for (let i = 1; i < ch.length; i++) {
    const dias = diasEntre(ch[i - 1], ch[i]) - 1;
    if (dias > 0) out.push({ de: somaDias(ch[i - 1], 1), ate: somaDias(ch[i], -1), dias });
  }
  return out;
}

/** P4 — VERANICO: 10 dias ou mais sem chuva lançada entre outubro e março (o intervalo começa nesses meses). */
export const ehMesChuvoso = (data: string) => { const m = Number(data.slice(5, 7)); return m >= 10 || m <= 3; };
export function veranicos(ls: readonly Leitura[], de: string, ate: string): Intervalo[] {
  return intervalosEntreChuvas(ls, de, ate).filter(i => i.dias >= 10 && ehMesChuvoso(i.de));
}
/** A maior sequência sem chuva lançada na SECA (o intervalo começa entre abril e setembro); `null` sem nenhuma. */
export function maiorSecaSemChuva(ls: readonly Leitura[], de: string, ate: string): Intervalo | null {
  let r: Intervalo | null = null;
  for (const i of intervalosEntreChuvas(ls, de, ate)) if (!ehMesChuvoso(i.de) && (r == null || i.dias > r.dias)) r = i;
  return r;
}

/** As datas do período: do 1º dia ao último dia do 12º mês. */
export function datasDoPeriodo(p: Periodo): { de: string; ate: string } {
  const ms = mesesDoPeriodo(p);
  return { de: `${ms[0]}-01`, ate: ultimoDia(ms[11]) };
}

/** A mesma janela no período anterior (para "2025 no mesmo período"). */
export function mesmaJanelaAntes(p: Periodo, ate: string, k = 1): { de: string; ate: string } {
  const fim = `${Number(ate.slice(0, 4)) - k}${ate.slice(4)}`;
  const ult = ultimoDia(fim.slice(0, 7));
  return { de: datasDoPeriodo(anterior(p, k)).de, ate: fim > ult ? ult : fim };
}

/** mm somados de um intervalo. */
export const somaMm = (ls: readonly Leitura[], de: string, ate: string) => arred(entre(ls, de, ate).reduce((s, l) => s + l.mm, 0));

/**
 * A MÉDIA HISTÓRICA DO ACUMULADO ATÉ A MESMA DATA (o card "Diferença para a média" e a situação P3): a média dos períodos
 * de histórico, cada um somado do início dele até o mesmo dia/mês de `ate`. `null` sem histórico.
 */
export function mediaAteAMesmaData(ls: readonly Leitura[], p: Periodo, hist: readonly Periodo[], ate: string): number | null {
  if (hist.length === 0) return null;
  const s = hist.reduce((acc, q) => { const j = mesmaJanelaAntes(p, ate, p.ano - q.ano); return acc + somaMm(ls, j.de, j.ate); }, 0);
  return arred(s / hist.length);
}

/** Dia a dia (os últimos `n` dias até `ate`): chuva lançada · lançado sem chuva · sem lançamento; e se cai num veranico. */
export type EstadoDia = 'chuva' | 'zero' | 'sem';
export interface Dia { data: string; mm: number | null; estado: EstadoDia; veranico: boolean }
export function diaADia(ls: readonly Leitura[], ate: string, n = 90): Dia[] {
  const de = somaDias(ate, -(n - 1));
  const por = new Map(entre(ls, de, ate).map(l => [l.data, l.mm]));
  const ver = veranicos(ls, somaDias(de, -60), ate);
  return Array.from({ length: n }, (_, i) => {
    const data = somaDias(de, i);
    const mm = por.get(data) ?? null;
    return {
      data, mm, estado: mm == null ? 'sem' : mm > 0 ? 'chuva' : 'zero',
      veranico: ver.some(v => data >= v.de && data <= v.ate),
    };
  });
}

/**
 * INÍCIO DAS CHUVAS (leitura da estação): a 1ª chuva de 20 mm ou mais a partir de 1º de setembro do ano da estação.
 * ⚠ O limiar de 20 mm é proposta (D-C da FASE 0), não está no mock.
 */
export const LIMIAR_INICIO_MM = 20;
export function inicioDasChuvas(ls: readonly Leitura[], anoDaEstacao: number, ate: string): Leitura | null {
  const de = `${anoDaEstacao}-09-01`;
  return [...entre(ls, de, ate)].sort((a, b) => a.data.localeCompare(b.data)).find(l => l.mm >= LIMIAR_INICIO_MM) ?? null;
}

/**
 * Início desta estação × o da anterior pelo DIA DO ANO (Chat 12/11 17:30: "02/10/2026 × 02/10/2025" é o mesmo dia, não 365 dias):
 * a data anterior vem um ano para a frente (29/02 vira 28/02) e conta os dias até a de agora. > 0 = mais tarde; < 0 = mais cedo.
 */
export function diferencaNoDiaDoAno(atual: string, anterior: string): number {
  const fim = `${Number(anterior.slice(0, 4)) + 1}${anterior.slice(4)}`;
  const ult = ultimoDia(fim.slice(0, 7));
  return diasEntre(fim > ult ? ult : fim, atual);
}
export const fraseDiaDoAno = (n: number) => (n === 0 ? 'mesmo dia' : `${Math.abs(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'} ${n < 0 ? 'mais cedo' : 'mais tarde'}`);

/** Chuva forte (50 mm ou mais num dia, mock). */
export const LIMIAR_FORTE_MM = 50;
export const chuvasFortes = (ls: readonly Leitura[], de: string, ate: string) =>
  entre(ls, de, ate).filter(l => l.mm >= LIMIAR_FORTE_MM).sort((a, b) => a.data.localeCompare(b.data));

/** O mês mais chuvoso e o mais seco do período, entre os meses LANÇADOS (sem os "—"). */
export function mesesExtremos(porMes: readonly (number | null)[], p: Periodo): { chuvoso: string; seco: string } | null {
  const ms = mesesDoPeriodo(p);
  const v = porMes.map((mm, i) => ({ mm, m: ms[i] })).filter((x): x is { mm: number; m: string } => x.mm != null);
  if (v.length < 2) return null;
  const chuvoso = v.reduce((a, b) => (b.mm > a.mm ? b : a));
  const seco = v.reduce((a, b) => (b.mm < a.mm ? b : a));
  return { chuvoso: chuvoso.m, seco: seco.m };
}
