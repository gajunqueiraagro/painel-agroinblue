/**
 * Formatadores numéricos centralizados — padrão pt-BR.
 */

/**
 * Formata número com casas decimais e separador de vírgula (pt-BR).
 * Retorna '—' para valores nulos/undefined.
 */
export function formatNum(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined) return '—';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formata número como moeda brasileira (R$).
 */
export function formatMoeda(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata número com locale pt-BR, ideal para tabelas financeiras e econômicas.
 * Retorna '-' para zero, null ou NaN.
 * Uso: valores monetários, arrobas, pesos em tabelas.
 */
export function fmtValor(v?: number | null, decimals = 2): string {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Formata peso em quilogramas — ex: "450,00 kg"
 */
export function formatKg(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

/**
 * Formata arrobas — ex: "18,50 @"
 */
export function formatArroba(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @`;
}

/**
 * Formata percentual — ex: "52,3%"
 */
export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Formata quantidade de cabeças — ex: "1.250 cab"
 */
export function formatCabecas(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} cab`;
}
