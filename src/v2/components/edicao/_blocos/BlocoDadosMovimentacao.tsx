import { ReactNode } from 'react';
import { ClipboardCheck } from 'lucide-react';

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function BlocoDadosMovimentacao({
  children,
  title = '1. Dados da Movimentação (Zootécnico)',
  subtitle,
}: Props) {
  return (
    <section className="rounded-lg border border-blue-200 dark:border-blue-900/60 overflow-hidden">
      <header className="bg-blue-500/10 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 px-4 py-2.5 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-blue-700 dark:text-blue-300" />
        <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wide">
          {title}
        </h3>
        {subtitle && <span className="text-[11px] text-blue-700/70 ml-auto">{subtitle}</span>}
      </header>
      <div className="p-4 bg-card">{children}</div>
    </section>
  );
}
