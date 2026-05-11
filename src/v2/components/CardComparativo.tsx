/**
 * CardComparativo.tsx
 *
 * Componente visual padrão único do cockpit anual.
 * Recebe ComparativoDuplo e renderiza:
 *   - Valor principal (META anual)
 *   - 2 deltas pequenos: vs ano fechado, vs mesmo período
 *
 * Sem cálculo. Sem lógica de domínio. Apenas renderização.
 * Refinamento de cores semânticas (subir-bom vs subir-ruim) ficará
 * para Marco 1.1.C ou 1.2 — neutro neste primeiro corte.
 */

import { cn } from '@/lib/utils';
import type { ComparativoDuplo, FormatoExibicao } from '@/v2/lib/planejamentoVisaoGeralTypes';

interface CardComparativoProps {
  titulo: string;
  dado: ComparativoDuplo;
  className?: string;
  /** Quando true, esconde o card se valor for null. Default: false. */
  hideQuandoVazio?: boolean;
}

function formatar(valor: number | null, formato: FormatoExibicao): string {
  if (valor == null || !Number.isFinite(valor)) return '—';
  switch (formato) {
    case 'moeda':
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
      }).format(valor);
    case 'numero':
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor);
    case 'percentual':
      return `${valor.toFixed(1).replace('.', ',')}%`;
    case 'arrobas':
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor)} @`;
    case 'kg':
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor)} kg`;
    case 'cabecas':
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor)} cab`;
    case 'hectares':
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(valor)} ha`;
    case 'ua_ha':
      return `${valor.toFixed(2).replace('.', ',')} UA/ha`;
    default:
      return String(valor);
  }
}

function formatarDelta(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1).replace('.', ',')}%`;
}

function corDelta(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return 'text-muted-foreground';
  if (Math.abs(delta) < 0.05) return 'text-muted-foreground';
  // Neutro neste corte — Marco 1.1.C decide se queremos cor semântica
  // baseada em "subir é bom" vs "subir é ruim" (Custos: subir = ruim).
  return delta > 0 ? 'text-emerald-700' : 'text-rose-700';
}

export function CardComparativo({ titulo, dado, className, hideQuandoVazio = false }: CardComparativoProps) {
  if (hideQuandoVazio && dado.valor == null) return null;

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-md p-3 flex flex-col gap-1.5 min-w-0',
        className,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {titulo}
      </div>

      <div className="text-lg font-bold text-foreground tabular-nums truncate">
        {formatar(dado.valor, dado.formato)}
      </div>

      <div className="flex flex-col gap-0.5 text-[10px] font-medium">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">vs ano fechado:</span>
          <span className={cn('tabular-nums', corDelta(dado.vsAnoFechado.delta))}>
            {formatarDelta(dado.vsAnoFechado.delta)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">vs mesmo período:</span>
          <span className={cn('tabular-nums', corDelta(dado.vsMesmoPeriodo.delta))}>
            {formatarDelta(dado.vsMesmoPeriodo.delta)}
          </span>
        </div>
      </div>
    </div>
  );
}
