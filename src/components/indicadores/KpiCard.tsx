import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Comparacao } from '@/hooks/useIndicadoresZootecnicos';
import { formatNum } from '@/lib/calculos/formatters';

interface KpiCardProps {
  label: string;
  valor: string;
  unidade?: string;
  comparacao?: Comparacao | null;
  estimado?: boolean;
  small?: boolean;
  semBase?: boolean;
}

const COMP_LABEL: Record<string, string> = {
  yoy: 'vs ano ant.',
  acumulado_yoy: 'vs acum. ant.',
  mensal: 'vs mês ant.',
};

export function KpiCard({ label, valor, unidade, comparacao, estimado, small, semBase }: KpiCardProps) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate">
        {label}
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
      {comparacao?.disponivel && <ComparacaoChip comp={comparacao} />}
    </div>
  );
}

function ComparacaoChip({ comp }: { comp: Comparacao }) {
  const isPositive = comp.diferencaAbsoluta > 0;
  const isZero = comp.diferencaAbsoluta === 0;

  const Icon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown;
  const colorClass = isZero
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';

  const diffStr = isPositive
    ? `+${formatNum(comp.diferencaAbsoluta, 1)}`
    : formatNum(comp.diferencaAbsoluta, 1);

  const pctStr = comp.diferencaPercentual !== null
    ? ` (${isPositive ? '+' : ''}${formatNum(comp.diferencaPercentual, 1)}%)`
    : '';

  return (
    <div className={`flex items-center gap-0.5 mt-0.5 ${colorClass}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="text-[10px] font-medium whitespace-nowrap">{diffStr}{pctStr}</span>
      <span className="text-[9px] text-muted-foreground ml-0.5 whitespace-nowrap">{COMP_LABEL[comp.tipo] ?? ''}</span>
    </div>
  );
}
