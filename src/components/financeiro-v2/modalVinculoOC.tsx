/**
 * AS PECAS COMUNS DOS DIALOGOS DE VINCULO DA OC — VINCULAR-LANC-OC-01 e OC-DESVINCULAR-01.
 *
 * ⚠ MOVIDAS, NAO REESCRITAS: sairam de `VincularOperacaoDialog.tsx` byte a byte (o selo, a secao e o
 * par rotulo/valor), para o "Desvincular" nascer com a mesma escala de modal da A18 sem copiar nada.
 * Os dois dialogos importam daqui; mudar uma peca muda os dois. So' o `export` foi acrescentado.
 */
import { cn } from '@/lib/utils';
import type { TomSelo } from '@/lib/oc/vincularLancamento';

export const TOM_SELO: Record<TomSelo, string> = {
  verde: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  ambar: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  vermelho: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
};

export function Selo({ tom, children, title }: { tom: TomSelo; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center rounded border px-1.5 py-px text-[10px] leading-tight whitespace-nowrap', TOM_SELO[tom])}>
      {children}
    </span>
  );
}

export function Secao({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-medium text-foreground">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function Par({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-muted-foreground leading-tight">{rotulo}</div>
      <div className="truncate text-[11px] leading-tight">{valor}</div>
    </div>
  );
}
