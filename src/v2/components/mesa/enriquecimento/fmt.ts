// Formatação pura de apresentação (Mesa Global de Enriquecimento).
import type { EnriqTom, EnriqEstado } from './types';

export const TOM_CLS: Record<EnriqTom, string> = {
  neutro: 'text-muted-foreground',
  ok: 'text-emerald-700',
  muda: 'text-emerald-700',
  bloqueio: 'text-red-700',
  difere: 'text-amber-700',
};

// Badge do "Resultado" — slot que no futuro (P0-9) hospedará select/input/autocomplete.
export const TOM_BADGE: Record<EnriqTom, string> = {
  neutro: 'bg-muted text-muted-foreground border border-transparent',
  ok: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  muda: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  bloqueio: 'bg-red-50 text-red-700 border border-red-200',
  difere: 'bg-amber-50 text-amber-700 border border-amber-200',
};

export const fmtData = (s: string | null | undefined): string => {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export const fmtBRL = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtTexto = (s: string | null | undefined): string =>
  s === null || s === undefined || s === '' ? '—' : s;

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "2026-05" → "Mai/2026" (identifica o mês da importação sem ambiguidade). */
export const mesAbrev = (anoMes: string | null | undefined): string => {
  if (!anoMes) return '—';
  const m = /^(\d{4})-(\d{2})/.exec(anoMes);
  if (!m) return anoMes;
  const idx = parseInt(m[2], 10) - 1;
  return `${MESES_ABREV[idx] ?? m[2]}/${m[1]}`;
};

/** ISO "2026-07-01T09:15:..." → "01/07 09:15" (carimbo da importação). */
export const dataHoraCurta = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : '';
};

export const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  exato:          { label: 'Exato',          cls: 'text-emerald-700', dot: 'bg-emerald-500' },
  ambiguo:        { label: 'Ambíguo',        cls: 'text-amber-700',   dot: 'bg-amber-500' },
  sem_match:      { label: 'Sem match',      cls: 'text-rose-700',    dot: 'bg-rose-500' },
  ja_classificado:{ label: 'Já classificado',cls: 'text-blue-700',    dot: 'bg-blue-500' },
  divergente:     { label: 'Divergente',     cls: 'text-amber-700',   dot: 'bg-amber-500' },
  ambiguo_resolvido:{ label: 'Ambíguo resolvido', cls: 'text-teal-700', dot: 'bg-teal-500' },
  // PR-MESA-RESOLUCAO-01
  candidatos_proximos:{ label: 'Candidatos próximos', cls: 'text-violet-700', dot: 'bg-violet-500' },
  resolvido_manual: { label: 'Resolvido manual',   cls: 'text-cyan-700',   dot: 'bg-cyan-600' },
};

// PR-U2d-1 — selo do estado operacional (leitura principal na Lista e no Detalhe).
// `short` para a lista densa; `label` para o cabeçalho do Detalhe.
export const ESTADO_META: Record<EnriqEstado, { label: string; short: string; cls: string; dot: string }> = {
  pronto:      { label: 'Pronto para aplicar', short: 'Pronto',      cls: 'text-blue-700',         dot: 'bg-blue-500' },
  revisar:     { label: 'A revisar',           short: 'Revisar',     cls: 'text-amber-700',        dot: 'bg-amber-500' },
  aplicado:    { label: '✓ Aplicado',          short: '✓ Aplicado',  cls: 'text-emerald-700',      dot: 'bg-emerald-500' },
  sem_vinculo: { label: 'Sem vínculo',         short: 'Sem vínculo', cls: 'text-rose-700',         dot: 'bg-rose-400' },
  nada:        { label: 'Nada a fazer',        short: 'OK',          cls: 'text-muted-foreground',  dot: 'bg-muted-foreground/40' },
};
