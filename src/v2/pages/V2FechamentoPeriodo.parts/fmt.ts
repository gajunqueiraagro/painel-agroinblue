/**
 * Formatadores compartilhados pelos sub-componentes do V2FechamentoPeriodo.
 */

export function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function pct(v: number | null | undefined, dec = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(dec).replace('.', ',')}%`;
}

export function formatarPeriodo(ini: string, fim: string): string {
  // "YYYY-MM" → "Mmm/YY"
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [yi, mi] = ini.split('-').map(Number);
  const [yf, mf] = fim.split('-').map(Number);
  if (yi === yf) {
    return `${meses[mi - 1]} a ${meses[mf - 1]}/${String(yf).slice(-2)}`;
  }
  return `${meses[mi - 1]}/${String(yi).slice(-2)} a ${meses[mf - 1]}/${String(yf).slice(-2)}`;
}

export function classeDiferenca(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (v > 0.05) return 'dif-positiva';
  if (v < -0.05) return 'dif-negativa';
  return '';
}
