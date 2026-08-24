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
 * MEDIA ACUMULADA ate cada mes, ignorando mes sem valor — nulo, NaN ou ZERO.
 *
 * POR QUE ZERO NAO ENTRA. Area zero nao e area pequena: e mes sem fechamento.
 * Conta-lo no divisor rebaixaria a media como se a fazenda tivesse operado
 * zero hectare naquele mes. Medido na NJ em 24/08: com agosto zerado, a media
 * Jan-Ago caia de 4.861,42 para 4.253,74 ha.
 *
 * FONTE UNICA desta regra. Antes do PR-RAZAO-ESTOQUE-01 ela existia QUATRO
 * vezes — aqui dentro do `calcularArrHaAcumulado`, no `mediaAreaAcumulada12`
 * do `usePainelConsultorData`, no `mediaIgnorandoNulos` do
 * `PainelConsultorTab` e no `mediaAreaAcum12` do `useSeriePorFazenda`. Tres
 * consomem esta; a do PainelConsultorTab espera autorizacao (quarto arquivo).
 */
export function mediaIgnorandoZero(
  serie: (number | null | undefined)[],
  meses = 12,
): number[] {
  const out: number[] = [];
  let soma = 0;
  let n = 0;
  for (let i = 0; i < meses; i++) {
    const v = serie[i];
    if (v != null && Number.isFinite(v) && v > 0) { soma += v; n += 1; }
    out.push(n > 0 ? soma / n : NaN);
  }
  return out;
}

/**
 * RAZAO DE ESTOQUE ACUMULADA — media do numerador ÷ media da area.
 *
 * ⚠ NAO CONFUNDIR com `calcularArrHaAcumulado`. La o numerador SOMA, porque
 * producao e FLUXO: @ de janeiro mais @ de fevereiro sao @ do periodo. Aqui o
 * numerador e MEDIA, porque rebanho e peso sao ESTOQUE: somar o rebanho de
 * doze meses nao produz numero nenhum. O denominador e o mesmo nos dois — a
 * media da area.
 *
 * POR QUE NAO A MEDIA DAS RAZOES. Fazenda que perde area no meio do ano:
 *     Jan-Jun  500 UA em 1.000 ha -> 0,50
 *     Jul-Dez  500 UA em   200 ha -> 2,50
 *   media das razoes  (0,50x6 + 2,50x6)/12 = 1,50 UA/ha
 *   razao das medias  500 UA ÷ 600 ha      = 0,83 UA/ha   <- a verdade
 * O 1,50 aparece porque os meses de area pequena entram com o mesmo peso dos
 * de area grande, tendo cinco vezes menos hectare para representar.
 *
 * E o teste estrutural: media de razoes NAO comuta com agregacao, entao a
 * soma ponderada das fazendas nao reproduz o Global. Razao de agregados
 * reproduz — e e' o que permite a aba Por fazenda existir sem contradizer o
 * card ao lado.
 *
 * O mes so entra quando TEM AREA: e a area que define o conjunto de meses,
 * para que as duas medias corram sobre os mesmos meses.
 */
export function calcularRazaoEstoqueAcumulada(
  numerador: (number | null | undefined)[],
  areaMensal: (number | null)[],
  meses = 12,
): number[] {
  const out: number[] = [];
  let somaNum = 0;
  let somaArea = 0;
  let n = 0;
  for (let i = 0; i < meses; i++) {
    const area = areaMensal[i];
    if (area != null && Number.isFinite(area) && area > 0) {
      const v = numerador[i];
      somaNum += (v != null && Number.isFinite(v)) ? v : 0;
      somaArea += area;
      n += 1;
    }
    /* (somaNum/n) ÷ (somaArea/n) — os `n` se cancelam, mas a leitura e'
       media ÷ media, nao soma ÷ soma. */
    out.push(n > 0 && somaArea > 0 ? somaNum / somaArea : NaN);
  }
  return out;
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
  /* A media da area vem de `mediaIgnorandoZero` — mesma regra, uma
     implementacao so. O numerador continua SOMANDO, porque producao e fluxo,
     e soma sob a MESMA condicao da area: mes que nao entra no divisor nao
     entra no dividendo. */
  const areaMedia12 = mediaIgnorandoZero(areaProdMensal);
  const out: number[] = [];
  let somaArrobas = 0;

  for (let i = 0; i < 12; i++) {
    const area = areaProdMensal[i];
    const arr = arrobasProd[i];
    if (area != null && Number.isFinite(area) && area > 0) {
      if (arr != null && Number.isFinite(arr)) somaArrobas += arr;
    }
    const areaMedia = areaMedia12[i];
    out.push(Number.isFinite(areaMedia) && areaMedia > 0 ? somaArrobas / areaMedia : NaN);
  }
  return out;
}
