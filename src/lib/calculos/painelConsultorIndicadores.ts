// Fórmulas oficiais PC-100 — fonte única de verdade para indicadores compartilhados
// entre o PainelConsultorTab e a V2Home (usePainelConsultorData).
// Não duplicar a fórmula em outros arquivos. Importar daqui.

interface CacheRowZoot {
  ano: number;
  mes: number;
  saldo_inicial?: number | null;
  saldo_final?: number | null;
  peso_total_final?: number | null;
  producao_biologica?: number | null;
  saidas_externas?: number | null;
  gmd?: number | null;
}

/**
 * Cabeças — média no período (Jan→upToMes) a partir de rows do zoot_mensal_cache.
 * Replica a fórmula oficial: para cada mês, cabMedia[m] = (Σ saldo_inicial + Σ saldo_final) / 2.
 * Retorna a média aritmética dos cabMedia[m] válidos (m=1..upToMes).
 */
export function cabecasMediaPeriodoFromRows(rows: CacheRowZoot[], upToMes: number): number | null {
  const monthMedias: number[] = [];
  for (let m = 1; m <= upToMes; m++) {
    const rowsM = rows.filter(r => r.mes === m);
    if (rowsM.length === 0) continue;
    const ini = rowsM.reduce((s, r) => s + (Number(r.saldo_inicial) || 0), 0);
    const fin = rowsM.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
    const cm = (ini + fin) / 2;
    if (cm > 0) monthMedias.push(cm);
  }
  return monthMedias.length > 0
    ? monthMedias.reduce((s, v) => s + v, 0) / monthMedias.length
    : null;
}

/**
 * Peso médio ponderado a partir de rows do zoot_mensal_cache: Σ peso_total_final / Σ saldo_final.
 * Use rowsMes (somente mês atual) para "mes" ou rowsPer (Jan→m) para "período" — mesma fórmula.
 */
export function pesoMedioPonderadoFromRows(rows: CacheRowZoot[]): number | null {
  const ptf = rows.reduce((acc, r) => acc + (Number(r.peso_total_final) || 0), 0);
  const sf  = rows.reduce((acc, r) => acc + (Number(r.saldo_final) || 0), 0);
  return sf > 0 ? ptf / sf : null;
}

/**
 * Média acumulada (Jan → N) — usada pelo PC-100 em "media_periodo".
 *
 *   rollingAvg(arr)[i] = Σ arr[0..i] / (i + 1)
 *
 * NaN propaga: se algum elemento for NaN, todos os índices subsequentes
 * ficam NaN. Comportamento idêntico ao PC-100; não filtrar NaN aqui.
 */
export function rollingAvg(arr: number[]): number[] {
  const r: number[] = [];
  let sum = 0, n = 0;
  for (const v of arr) { sum += v; n++; r.push(n > 0 ? sum / n : 0); }
  return r;
}

/**
 * GMD médio do período acumulado (Jan → N).
 * Fórmula oficial PC-100:
 *   GMD período(N) = Σ producao_biologica(1..N)
 *                  ÷ média(cabMedia(1..N))
 *                  ÷ Σ dias(1..N)
 *
 * Retorna array de 12 posições, posição i = GMD acumulado de Jan até mês i+1.
 * Usa NaN quando não há rebanho médio ou dias acumulados (sem dado válido).
 *
 * Usada pelo PainelConsultor e pela V2Home. Não duplicar.
 */
export function computePeriodGmd(prodBio: number[], cabMedia: number[], dias: number[]): number[] {
  const out: number[] = [];
  let prodAcc = 0;
  let cabSum = 0;
  let cabCount = 0;
  let diasAcc = 0;
  for (let i = 0; i < 12; i++) {
    const pb = Number(prodBio[i]);
    const cm = Number(cabMedia[i]);
    const d = Number(dias[i]) || 0;
    if (!isNaN(pb)) prodAcc += pb;
    if (!isNaN(cm) && cm > 0) { cabSum += cm; cabCount++; }
    diasAcc += d;
    const cabMediaPeriodo = cabCount > 0 ? cabSum / cabCount : 0;
    if (cabMediaPeriodo <= 0 || diasAcc <= 0) { out.push(NaN); continue; }
    out.push(prodAcc / cabMediaPeriodo / diasAcc);
  }
  return out;
}
