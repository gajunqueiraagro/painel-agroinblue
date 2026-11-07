/**
 * CHUVAS-LANCAR-01 (Gabriel 04/11/2026) — a URL sem os filtros de OUTRA tela (`f_*`: o `?f_tipo=abate` das Operações Comerciais) para as
 * telas que não leem filtro de URL (Chuvas). O resto da barra (`oc_*`, `safra`…) fica. `null` = não havia o que tirar (não troca nada).
 */
export function semFiltrosDeOutraTela(search: string): URLSearchParams | null {
  const p = new URLSearchParams(search);
  const filtros = [...p.keys()].filter((k) => k.startsWith('f_'));
  if (filtros.length === 0) return null;
  for (const k of filtros) p.delete(k);
  return p;
}
