/**
 * CardComparativo.tsx
 *
 * Componente visual padrão único do cockpit anual.
 * Recebe ComparativoDuplo e renderiza apenas:
 *   - Título uppercase
 *   - Valor principal (META anual)
 *
 * Marco 1.1-CLOSE — comparativos parciais foram removidos do render.
 * Os campos vsAnoFechado / vsMesmoPeriodo continuam no DTO mas não
 * são exibidos aqui. Comparativos voltam na tela 'Fechamento do
 * Período' a ser construída futuramente.
 *
 * Sem cálculo. Sem lógica de domínio. Apenas formatação e renderização.
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
    </div>
  );
}
