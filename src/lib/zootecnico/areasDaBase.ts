/**
 * A ÁREA ENTRE A SÉRIE E A BASE — gráficos da Evolução Patrimonial
 * (VALOR-REBANHO-GRAFICOS-BASE-01, 24/09/2026).
 *
 * A base é o valor do ponto "I" (o Início). A área pintada entre a série e essa horizontal
 * responde, sem que o olho tenha de medir, a única pergunta que a tela faz: o rebanho está
 * ACIMA ou ABAIXO de onde começou, e desde quando.
 *
 * ⚠ AUSÊNCIA NÃO É ZERO. Sem ponto "I" não há base — e sem base não há área nem linha de
 * referência. Pintar contra zero diria "o rebanho valia nada no começo", que é afirmação, não
 * ausência. Por isso `fracaoDaBase` é `null` e não 0 quando não há o que comparar.
 *
 * ⚠ MÊS ABERTO CORTA A ÁREA. Um `null` no meio da série não é ponte: os vizinhos de um buraco
 * não são vizinhos, e por isso `cruzamentos` só olha índices CONSECUTIVOS.
 */

/** Um ponto conta quando é número de verdade — `null`, `NaN` e `Infinity` ficam de fora. */
function definido(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

export type ResumoDaBase = {
  /**
   * Onde a série troca de lado, em índice FRACIONÁRIO: 1,5 é o meio do intervalo entre os
   * índices 1 e 2. Sai da interpolação linear entre os dois pontos vizinhos.
   */
  cruzamentos: number[];
  /** Soma de (valor − base) dos pontos acima dela. */
  alturaAcima: number;
  /** Soma de (base − valor) dos pontos abaixo dela. */
  alturaAbaixo: number;
  /**
   * Onde a cor troca dentro da caixa da área, de 0 (topo) a 1 (base da caixa) — o offset do
   * corte no gradiente vertical que pinta acima de azul e abaixo de vermelho.
   *
   * ⚠ ELE É CALCULÁVEL SEM O PIXEL porque o eixo Y é linear: a razão entre distâncias em
   * reais é a mesma razão em pixels, e a caixa da área vai exatamente de `max(série, base)` a
   * `min(série, base)`. Série inteira acima devolve 1 (tudo azul); inteira abaixo devolve 0.
   *
   * `null` quando não há ponto nenhum ou quando a área tem altura zero.
   */
  fracaoDaBase: number | null;
};

export function areasDaBase(valores: readonly (number | null | undefined)[], base: number): ResumoDaBase {
  const cruzamentos: number[] = [];
  let alturaAcima = 0;
  let alturaAbaixo = 0;
  let vMax = base;
  let vMin = base;
  let algum = false;

  for (const v of valores) {
    if (!definido(v)) continue;
    algum = true;
    if (v > base) alturaAcima += v - base;
    if (v < base) alturaAbaixo += base - v;
    if (v > vMax) vMax = v;
    if (v < vMin) vMin = v;
  }

  /* Percorre cada TRECHO de índices consecutivos com valor; um buraco encerra o trecho. */
  let i = 0;
  while (i < valores.length) {
    if (!definido(valores[i])) { i++; continue; }
    let fim = i;
    while (fim + 1 < valores.length && definido(valores[fim + 1])) fim++;

    let ladoAnterior = 0;
    for (let k = i; k <= fim; k++) {
      const d = (valores[k] as number) - base;
      const lado = d > 0 ? 1 : d < 0 ? -1 : 0;

      if (lado === 0) {
        /* Ponto EM CIMA da base: o cruzamento é o próprio ponto, e só há cruzamento se a série
           sair para o outro lado. Encostar e voltar não é cruzar. */
        const proximo = k + 1 <= fim ? Math.sign((valores[k + 1] as number) - base) : 0;
        if (proximo !== 0) {
          if (ladoAnterior !== 0 && proximo !== ladoAnterior) cruzamentos.push(k);
          ladoAnterior = proximo;
        }
        continue;
      }

      if (ladoAnterior !== 0 && lado !== ladoAnterior) {
        const a = (valores[k - 1] as number) - base;
        cruzamentos.push((k - 1) + a / (a - d));
      }
      ladoAnterior = lado;
    }
    i = fim + 1;
  }

  const fracaoDaBase = !algum || vMax === vMin ? null : (vMax - base) / (vMax - vMin);
  return { cruzamentos, alturaAcima, alturaAbaixo, fracaoDaBase };
}
