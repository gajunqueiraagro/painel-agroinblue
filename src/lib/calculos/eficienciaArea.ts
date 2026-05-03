/**
 * Função central de indicadores de eficiência por área.
 * FONTE ÚNICA — nenhum outro arquivo deve recalcular lotUaHa ou arrHa.
 *
 * Nota: usa pesoMedioFin da view oficial (sem ajuste de snapshot P2).
 * Na Fase futura (Opção A), adicionar parâmetro opcional pesoSnap para
 * replicar exatamente o PC-100 em meses com P2 fechado.
 */

interface IndicadoresEficienciaAreaInput {
  cabIni: number[];
  cabFin: number[];
  pesoMedioFin: number[];
  arrobasProd: number[];
  areaProdMensal: number[];
}

interface IndicadoresEficienciaAreaResult {
  uaMedia: number[];
  lotUaHa: number[];
  arrHa: number[];
}

export function calcularIndicadoresEficienciaArea(
  input: IndicadoresEficienciaAreaInput,
): IndicadoresEficienciaAreaResult {
  const { cabIni, cabFin, pesoMedioFin, arrobasProd, areaProdMensal } = input;

  const uaMedia = cabIni.map((_, i) => {
    const cabMed = (cabIni[i] + cabFin[i]) / 2;
    const pm = pesoMedioFin[i];
    return cabMed > 0 && pm > 0 ? (cabMed * pm) / 450 : NaN;
  });

  const lotUaHa = uaMedia.map((v, i) =>
    (areaProdMensal[i] ?? 0) > 0 ? v / areaProdMensal[i] : NaN,
  );

  const arrHa = arrobasProd.map((v, i) =>
    (areaProdMensal[i] ?? 0) > 0 ? v / areaProdMensal[i] : NaN,
  );

  return { uaMedia, lotUaHa, arrHa };
}
