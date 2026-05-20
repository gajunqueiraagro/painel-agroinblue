/**
 * ExecutiveSlide — wrapper visual padrão dos blocos do Fechamento Executivo.
 *
 * FASE 3 / PR3.2 — apenas o container. Sem uso em produção ainda. Próximos
 * PRs (3.3+) vão envolver blocos existentes (Movimentações, DRE, Fluxo,
 * Produção) neste wrapper para uniformizar a apresentação executiva/PDF.
 *
 * Características:
 *  - Proporção 16:9 reservada para apresentação/PDF (via `aspect-video`).
 *    No print/landscape, a proporção é respeitada via `print:aspect-[16/9]`.
 *  - Responsivo no web: o `aspect-video` mantém a proporção quando há
 *    largura, mas o conteúdo interno pode rolar (overflow-y-auto) se exceder.
 *  - Header com título, subtítulo opcional e badge opcional (à direita).
 *  - Footer opcional para metadados (cliente/fazenda/período).
 *  - Tokens shadcn (bg-card, border, text-foreground) para tema dark/light.
 *  - Print-safe: `print:break-inside-avoid` e `print:shadow-none`.
 *
 * Componente puro — nenhum hook, nenhum cálculo, nenhuma fonte de dados.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ExecutiveSlideProps {
  /** Título principal do slide. Renderizado no header. */
  title: string;
  /** Subtítulo opcional abaixo do título. Texto curto descritivo. */
  subtitle?: string;
  /** Badge opcional à direita do header (ex.: "Rebanho", "Caixa"). */
  badge?: ReactNode;
  /** Conteúdo principal do slide. Rola verticalmente se exceder. */
  children: ReactNode;
  /** Footer opcional (ex.: cliente / fazenda / período). */
  footer?: ReactNode;
  /** Classes extras aplicadas ao wrapper. */
  className?: string;
}

export function ExecutiveSlide({
  title,
  subtitle,
  badge,
  children,
  footer,
  className,
}: ExecutiveSlideProps) {
  return (
    <section
      className={cn(
        // Proporção 16:9 reservada para PDF/apresentação. Em telas estreitas
        // (mobile) o aspect-video ainda calcula a altura; conteúdo interno
        // pode rolar se ultrapassar.
        'aspect-video w-full max-w-[1280px] mx-auto',
        'bg-card border border-border rounded-lg shadow-sm overflow-hidden',
        'flex flex-col',
        // Print: preserva proporção, evita corte no meio do slide,
        // remove sombra (papel branco).
        'print:break-inside-avoid print:shadow-none print:max-w-full print:aspect-[16/9]',
        className,
      )}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-border">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground leading-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
        {badge && (
          <div className="shrink-0 flex items-center">
            {badge}
          </div>
        )}
      </header>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {children}
      </div>

      {/* Footer (opcional) */}
      {footer && (
        <footer className="shrink-0 px-6 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          {footer}
        </footer>
      )}
    </section>
  );
}
