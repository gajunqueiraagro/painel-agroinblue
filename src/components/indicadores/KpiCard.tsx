import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Comparacao } from '@/hooks/useIndicadoresZootecnicos';
import { formatNum } from '@/lib/calculos/formatters';

interface KpiCardProps {
  label: string;
  valor: string;
  unidade?: string;
  compMensal?: Comparacao | null;
  compAnual?: Comparacao | null;
  estimado?: boolean;
  small?: boolean;
  semBase?: boolean;
  info?: string;
}

export function KpiCard({ label, valor, unidade, compMensal, compAnual, estimado, small, semBase, info }: KpiCardProps) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate flex items-center gap-0.5">
        {label}
        {info && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center justify-center shrink-0 rounded-full hover:bg-muted/60 transition-colors p-0.5" aria-label="Info">
                <Info className="h-2.5 w-2.5 text-muted-foreground/60 hover:text-primary" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-[260px] text-[11px] leading-relaxed p-3 whitespace-pre-line">
              {info}
            </PopoverContent>
          </Popover>
        )}
      </span>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`${small ? 'text-base' : 'text-xl'} font-bold leading-tight ${semBase ? 'text-muted-foreground' : 'text-foreground'}`}>
          {valor}
        </span>
        {unidade && <span className="text-xs text-muted-foreground">{unidade}</span>}
        {estimado && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-amber-500 cursor-help">*</span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Valor estimado — sem fechamento oficial</TooltipContent>
          </Tooltip>
        )}
      </div>
      <CompLine comp={compMensal} label="vs mês" />
      <CompLine comp={compAnual} label="vs ano ant." />
    </div>
  );
}

function CompLine({ comp, label }: { comp?: Comparacao | null; label: string }) {
  if (!comp?.disponivel) return null;

  const pct = comp.diferencaPercentual;
  if (pct === null) return null;

  const isPositive = pct > 0;
  const isZero = Math.abs(pct) < 0.05;

  const Icon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown;
  const colorClass = isZero
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';

  const pctStr = `${isPositive ? '+' : ''}${formatNum(pct, 1)}%`;

  return (
    <div className={`flex items-center gap-0.5 ${colorClass}`}>
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="text-[9px] font-medium whitespace-nowrap">{pctStr}</span>
      <span className="text-[9px] text-muted-foreground ml-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}
