/**
 * FluxoCaixaTopImpactos — tabela enxuta do top 5 desvios vs Meta por subcentro.
 *
 * Componente puro: consome lista pronta de `ImpactoDesvio[]` do builder.
 * Cor da linha por `impacto` (favorável/desfavorável/neutro). Empty state
 * quando lista vazia.
 */

import { cn } from '@/lib/utils';
import type { ImpactoDesvio } from '@/v2/lib/fluxoCaixaModalTypes';

interface Props {
  impactos: ImpactoDesvio[];
}

function fmtBRLCurto(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}R$ ${(abs / 1e9).toFixed(1).replace('.', ',')}B`;
  if (abs >= 1e6) return `${sign}R$ ${(abs / 1e6).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1e3) return `${sign}R$ ${(abs / 1e3).toFixed(0)}K`;
  return `${sign}R$ ${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function fmtPct(d: number): string {
  if (!Number.isFinite(d)) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${Math.round(d)}%`;
}

const ROW_CLS: Record<ImpactoDesvio['impacto'], string> = {
  favoravel: 'bg-emerald-50/40 dark:bg-emerald-950/20',
  desfavoravel: 'bg-rose-50/40 dark:bg-rose-950/20',
  neutro: '',
};

const BADGE_NATUREZA: Record<ImpactoDesvio['natureza'], string> = {
  entrada: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900/60',
  saida: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900/60',
};

const BADGE_IMPACTO: Record<ImpactoDesvio['impacto'], string> = {
  favoravel: 'text-emerald-700 dark:text-emerald-300',
  desfavoravel: 'text-rose-700 dark:text-rose-300',
  neutro: 'text-muted-foreground',
};

const LABEL_IMPACTO: Record<ImpactoDesvio['impacto'], string> = {
  favoravel: 'favorável',
  desfavoravel: 'desfavorável',
  neutro: 'neutro',
};

export function FluxoCaixaTopImpactos({ impactos }: Props) {
  if (impactos.length === 0) {
    return (
      <div className="border border-border rounded-md p-4 text-center text-xs text-muted-foreground">
        Sem desvios materiais vs Meta no período.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_80px_100px_100px_100px_100px] gap-1 items-center px-3 py-1.5 bg-muted text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        <div>Subcentro</div>
        <div className="text-center">Natureza</div>
        <div className="text-right">Real</div>
        <div className="text-right">Meta</div>
        <div className="text-right">Δ</div>
        <div className="text-center">Impacto</div>
      </div>
      {impactos.map((imp) => (
        <div
          key={imp.subcentro}
          className={cn(
            'grid grid-cols-[minmax(0,1fr)_80px_100px_100px_100px_100px] gap-1 items-center px-3 py-1.5 border-b border-border/30 last:border-0 text-[11px]',
            ROW_CLS[imp.impacto],
          )}
        >
          <div className="truncate text-foreground" title={imp.subcentro}>
            {imp.subcentro}
          </div>
          <div className="text-center">
            <span
              className={cn(
                'inline-block text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                BADGE_NATUREZA[imp.natureza],
              )}
            >
              {imp.natureza === 'entrada' ? 'Entrada' : 'Saída'}
            </span>
          </div>
          <div className="text-right tabular-nums text-foreground">{fmtBRLCurto(imp.realPeriodo)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{fmtBRLCurto(imp.metaPeriodo)}</div>
          <div className="text-right tabular-nums">
            <div className="font-semibold text-foreground">{fmtBRLCurto(imp.deltaAbs)}</div>
            <div className="text-[10px] text-muted-foreground">{fmtPct(imp.deltaPct)}</div>
          </div>
          <div className={cn('text-center text-[10px] font-semibold uppercase tracking-wide', BADGE_IMPACTO[imp.impacto])}>
            {LABEL_IMPACTO[imp.impacto]}
          </div>
        </div>
      ))}
    </div>
  );
}
