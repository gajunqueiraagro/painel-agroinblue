/**
 * O MÊS DE UMA SESSÃO — o PREDOMINANTE entre as linhas dela (PR-CONC-EXCEL-SESSAO-E-DEPARA-01).
 *
 * ⚠ ERA O MÊS DA PRIMEIRA LINHA POR `staging_id` — um uuid, ou seja, SORTEADO. A planilha do NJ set/26 traz competências de
 *   oito meses (303 de set, 108 de ago, 41 de jul…), e a Imp 03 caiu em "2026-07": sumiu do seletor de setembro, e a tela
 *   ficou na Imp 02, sem as colunas novas (Gabriel, 01/10 05:08).
 * ⚠ EMPATE: o mês MAIS RECENTE — a planilha do mês traz o mês dela e os atrasados, nunca o contrário.
 */
export function mesPredominante(contagem: ReadonlyMap<string, number>): string | null {
  let melhor: string | null = null;
  let n = -1;
  for (const [mes, qt] of contagem) {
    if (qt > n || (qt === n && melhor !== null && mes > melhor)) { melhor = mes; n = qt; }
  }
  return melhor;
}
