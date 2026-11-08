/**
 * MAPA-PIQUETE-SUBAREA-01 item 7 · C1 (Gabriel 08/11/2026, corte nov/26) — Reserva Legal, APP e Benfeitorias são ÁREA da fazenda: seguem no
 * cadastro (é ali que a soma com a matrícula mora: resumo de áreas, Áreas, Fazendas), mas a partir de 11/2026 saem do fechamento (sem card,
 * fora do conjunto do mês e do P1) e do mapa de pastos (nem pasto, nem "sem desenho"). Espelho de `_fn_pasto_e_area_da_fazenda` (117497):
 * mudar um sem o outro quebra o fechamento (o banco recusa o card).
 */
export const CORTE_AREA_DA_FAZENDA = '2026-11';
export const TIPOS_AREA_DA_FAZENDA: readonly string[] = ['reserva', 'app', 'benfeitorias'];

export function ehAreaDaFazendaNoMes(tipoUso: string | null | undefined, anoMes: string): boolean {
  return !!tipoUso && TIPOS_AREA_DA_FAZENDA.includes(tipoUso) && anoMes >= CORTE_AREA_DA_FAZENDA;
}

/** os pastos do fechamento/mapa no mês: sem a área da fazenda desde o corte */
export function semAreaDaFazenda<T extends { tipo_uso?: string | null }>(lista: readonly T[], anoMes: string): T[] {
  return lista.filter((p) => !ehAreaDaFazendaNoMes(p.tipo_uso, anoMes));
}
