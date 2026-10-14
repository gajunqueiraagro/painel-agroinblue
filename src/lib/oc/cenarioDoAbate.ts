/**
 * ABATE-PROJETADO-01c (Gabriel, 14/10/2026) — EM QUE CENARIO O ABATE ABRE.
 *
 * O abate em cenario Projetado e' previsao: a OC e' aberta antes de embarcar. Abrir sempre em 'realizado' (a regra antiga) mostrava
 * "a negociar" num abate que so' tinha o projetado, e escondia a previsao de quem a abriu para conferir.
 * A regra, nesta ordem: ha' linha REALIZADA -> 'realizado'; a data do abate e' FUTURA (e nao ha' realizado) -> 'projetado'; so' ha'
 * PROJETADO -> 'projetado'; senao 'realizado' (o abate novo de hoje, ou sem linha nenhuma).
 * Datas em texto 'AAAA-MM-DD', comparadas como texto; `hoje` e' a data LOCAL (`hojeLocal`), nunca `toISOString`.
 */
export type CenarioDoAbate = 'projetado' | 'realizado';

export function cenarioInicialDoAbate({ dataAbate, hoje, cenarios }: {
  dataAbate: string | null | undefined; hoje: string; cenarios: readonly string[];
}): CenarioDoAbate {
  if (cenarios.includes('realizado')) return 'realizado';
  if (dataAbate && dataAbate.slice(0, 10) > hoje) return 'projetado';
  if (cenarios.includes('projetado')) return 'projetado';
  return 'realizado';
}
