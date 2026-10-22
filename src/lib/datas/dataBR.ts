/**
 * FIN-V2-DESEMPENHO-01c — a data como a tela escreve: dd/mm/aaaa (REGRA DE CORTE de 21/10: data sempre dd/mm/aaaa). Lê o começo ISO
 * ("2026-09-30" ou "2026-09-30T…"); vazio ou fora do formato = "—" (dado ausente, nunca uma data inventada).
 */
export function dataBR(iso: string | null | undefined): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
}
