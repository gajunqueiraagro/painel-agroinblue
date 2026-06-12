/**
 * tokens.ts — fonte única dos valores visuais do Boletim (Tailwind puro).
 * Cores/bordas/radius saem de tokens do tema já existentes (bg-card,
 * border-border, text-foreground…) — nada inventado, nada novo no index.css.
 * Consumido na FASE 2 pelos primitivos do Boletim.
 */
export const BOLETIM_TOKENS = {
  alturaPx: 499,
  // chrome do container
  container: 'h-full bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col',
  padding: 'p-4',
  // header
  headerWrap: 'flex items-start justify-between gap-3 pb-2 mb-3 border-b border-border',
  titulo: 'text-base font-semibold text-foreground leading-tight',
  subtitulo: 'text-xs text-muted-foreground leading-snug',
  // badge = SÓ formato/tipografia; a cor vem 100% do `tone` (TONE_CORES no Header).
  badge: 'text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap',
  // corpo
  corpo: 'flex-1 min-h-0 overflow-hidden',
} as const;

/** Semântica do badge — só muda a COR (formato/posição idênticos). */
export type BadgeTone = 'neutral' | 'operacional' | 'competencia' | 'financeiro' | 'auditoria';
