// Formatação pura de apresentação (Mesa Global de Enriquecimento).
export const fmtData = (s: string | null | undefined): string => {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export const fmtBRL = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtTexto = (s: string | null | undefined): string =>
  s === null || s === undefined || s === '' ? '—' : s;

export const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  exato:          { label: 'Exato',          cls: 'text-emerald-700', dot: 'bg-emerald-500' },
  ambiguo:        { label: 'Ambíguo',        cls: 'text-amber-700',   dot: 'bg-amber-500' },
  sem_match:      { label: 'Sem match',      cls: 'text-rose-700',    dot: 'bg-rose-500' },
  ja_classificado:{ label: 'Já classificado',cls: 'text-blue-700',    dot: 'bg-blue-500' },
  divergente:     { label: 'Divergente',     cls: 'text-amber-700',   dot: 'bg-amber-500' },
};
