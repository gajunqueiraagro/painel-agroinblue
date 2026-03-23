/**
 * Formatadores numéricos centralizados — padrão pt-BR.
 */

/**
 * Formata número com casas decimais e separador de vírgula (pt-BR).
 * Retorna '—' para valores nulos/undefined.
 */
export function formatNum(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(decimals).replace('.', ',');
}

/**
 * Formata número como moeda brasileira (R$).
 */
export function formatMoeda(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata número com locale pt-BR, ideal para tabelas financeiras.
 * Retorna '-' para zero, null ou NaN.
 */
export function fmtValor(v?: number | null): string {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
