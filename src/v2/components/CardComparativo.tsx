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
  /** Override de classes no <div> do valor principal — usado para cor de texto por categoria econômica. */
  valorClassName?: string;
  /** Quando true, esconde o card se valor for null. Default: false. */
  hideQuandoVazio?: boolean;
  /** Quando true, mostra linha "+X,X% vs ano ant." abaixo do valor (usa dado.vsAnoFechado.delta). */
  mostrarVsAnoAnt?: boolean;
  /**
   * Label do comparativo. Default 'ano ant.' (comportamento legado).
   * Cards de posição META (Rebanho Final, Peso Médio Final) usam
   * 'início ano' — comparam contra o rebanho/peso REALIZADO de Dez ano-1.
   */
  comparativoLabel?: string;
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
    case 'gmd':
      return valor.toFixed(3).replace('.', ',');
    default:
      return String(valor);
  }
}

function fmtDelta(d: number | null, label: string): { texto: string; cor: string } {
  if (d == null || !Number.isFinite(d)) {
    return { texto: `— vs ${label}`, cor: 'text-muted-foreground' };
  }
  const sinal = d >= 0 ? '+' : '';
  const positivo = d >= 0;
  return {
    texto: `${sinal}${d.toFixed(1).replace('.', ',')}% vs ${label}`,
    cor: positivo
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-rose-700 dark:text-rose-300',
  };
}

export function CardComparativo({ titulo, dado, className, valorClassName, hideQuandoVazio = false, mostrarVsAnoAnt = false, comparativoLabel = 'ano ant.' }: CardComparativoProps) {
  if (hideQuandoVazio && dado.valor == null) return null;

  const delta = mostrarVsAnoAnt ? fmtDelta(dado.vsAnoFechado.delta, comparativoLabel) : null;

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

      <div className={cn('text-lg font-bold text-foreground tabular-nums truncate', valorClassName)}>
        {formatar(dado.valor, dado.formato)}
      </div>

      {delta && (
        <div className={cn('text-[10px] font-medium tabular-nums truncate', delta.cor)}>
          {delta.texto}
        </div>
      )}
    </div>
  );
}
