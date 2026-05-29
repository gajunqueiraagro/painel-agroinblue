import { ReactNode } from 'react';
import { DollarSign } from 'lucide-react';

interface Props {
  children: ReactNode;
}

export function BlocoVinculoFinanceiro({ children }: Props) {
  return (
    <section className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 overflow-hidden">
      <header className="bg-emerald-500/10 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 px-4 py-2.5 flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase tracking-wide">
          2. Vínculo Financeiro
        </h3>
      </header>
      <div className="p-3 bg-card">{children}</div>
    </section>
  );
}
