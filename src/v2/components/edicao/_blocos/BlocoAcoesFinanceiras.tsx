import { Wand2 } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

export function BlocoAcoesFinanceiras({ children }: Props) {
  return (
    <section className="rounded-lg border border-purple-200 dark:border-purple-900/60 overflow-hidden">
      <header className="bg-purple-500/10 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-900/60 px-4 py-2.5 flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-purple-700 dark:text-purple-300" />
        <h3 className="text-xs font-semibold text-purple-900 dark:text-purple-100 uppercase tracking-wide">
          4. Ações Financeiras
        </h3>
      </header>
      <div className="p-3 bg-card">
        {children ?? (
          <p className="text-xs text-muted-foreground italic">
            Sem ações disponíveis no momento.
          </p>
        )}
      </div>
    </section>
  );
}
