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

  const arrHa = calcularArrHaMensal(arrobasProd, areaProdMensal);

  return { uaMedia, lotUaHa, arrHa };
}

/**
 * `@/ha` MENSAL. Extraida para que os consumidores que precisam SO dela —
 * como as tres linhas de `Arrobas/ha` do PainelConsultorTab — a chamem sem
 * arrastar `uaMedia` e `lotUaHa` junto, e sem escrever a divisao de novo.
 * `calcularIndicadoresEficienciaArea` passou a usa-la: a formula continua
 * existindo UMA vez.
 *
 * Area zero, nula ou ausente devolve NaN — nunca zero. Zero afirmaria
 * "nao produziu por hectare"; NaN diz "nao ha hectare".
 */
export function calcularArrHaMensal(
  arrobasProd: number[],
  areaProdMensal: (number | null)[],
): number[] {
  return arrobasProd.map((v, i) => {
    const area = areaProdMensal[i];
    return area != null && Number.isFinite(area) && area > 0 ? v / area : NaN;
  });
}

/**
 * `@/ha` ACUMULADO — Σ arrobas ÷ MEDIA da area, nunca Σ das razoes.
 *
 * POR QUE NAO SOMAR AS RAZOES. Fazenda que dobra de area no meio do ano e
 * nao dobra a producao:
 *     Jan–Jun  100 @ em 100 ha -> 1,0 @/ha por mes
 *     Jul–Dez  100 @ em 200 ha -> 0,5 @/ha por mes
 *   verdade:          1.200 @ / 150 ha medios = 8,0
 *   soma das razoes:  6 x 1,0 + 6 x 0,5       = 9,0   ← superestima
 * Os meses de area pequena entram com o mesmo peso dos de area grande, e
 * eles tinham menos hectare para "gastar". E o mesmo principio que ja
 * governa o peso medio e o GMD: RAZAO DE AGREGADOS, nao media de razoes.
 *
 * Medido no Proto (Jan–Jul/2026): onde a area nao varia o erro e zero; no
 * Raul Juliato, com 11% de variacao, a soma das razoes da 3,193 contra
 * 3,106 — 2,8% a mais.
 *
 * Mes sem area (zero, nulo ou NaN) NAO entra em nenhum dos dois
 * somatorios: nao ha como atribuir producao a hectare que nao existe, e
 * deixa-lo no divisor da media rebaixaria o denominador.
 *
 * Devolve 12 posicoes, 0=Jan, com o acumulado ATE cada mes. `NaN` onde
 * nao ha area — NaN, nunca zero: zero afirmaria "nao produziu por
 * hectare", que e diferente de "nao ha hectare".
 */
export function calcularArrHaAcumulado(
  arrobasProd: number[],
  areaProdMensal: (number | null)[],
): number[] {
  const out: number[] = [];
  let somaArrobas = 0;
  let somaArea = 0;
  let mesesComArea = 0;

  for (let i = 0; i < 12; i++) {
    const area = areaProdMensal[i];
    const arr = arrobasProd[i];
    if (area != null && Number.isFinite(area) && area > 0) {
      somaArea += area;
      mesesComArea += 1;
      if (arr != null && Number.isFinite(arr)) somaArrobas += arr;
    }
    const areaMedia = mesesComArea > 0 ? somaArea / mesesComArea : 0;
    out.push(areaMedia > 0 ? somaArrobas / areaMedia : NaN);
  }
  return out;
}
