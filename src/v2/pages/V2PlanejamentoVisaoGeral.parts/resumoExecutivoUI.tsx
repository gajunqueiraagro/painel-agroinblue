/**
 * resumoExecutivoUI — helpers de UI compartilhados entre BlocoResumoExecutivo
 * e ComposicaoFinanceira (PR-BOLETIM-2.1A). Movidos VERBATIM, sem alterar lógica.
 */

const fmtPct = (v: number): string => {
  const pct = v * 100;
  const sinal = pct >= 0 ? '+' : '';
  return `${sinal}${pct.toFixed(1)}%`;
};

export const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);

export function DeltaBadge({ delta, inverterSemantica = false }: { delta: number; inverterSemantica?: boolean }) {
  // inverterSemantica=true: usado em saídas no modo Fechamento, onde Real >
  // Meta (gastou mais do que planejado) é ruim — pinta de rose mesmo com
  // sinal positivo. Receitas mantêm comportamento padrão (positivo = bom).
  const positivo = delta >= 0;
  const bom = inverterSemantica ? !positivo : positivo;
  const cls = bom
    ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40'
    : 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40';
  return (
    <span
      className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${cls}`}
    >
      {fmtPct(delta)}
    </span>
  );
}
