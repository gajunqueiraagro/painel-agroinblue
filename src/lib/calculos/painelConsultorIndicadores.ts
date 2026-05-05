// Fórmulas oficiais PC-100 — fonte única de verdade para indicadores compartilhados
// entre o PainelConsultorTab e a V2Home (usePainelConsultorData).
// Não duplicar a fórmula em outros arquivos. Importar daqui.

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
