import { Settings } from 'lucide-react';
import { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

export function BlocoAcoesFinanceiras({ children }: Props) {
  return (
    <section className="rounded-lg border border-purple-300 bg-white overflow-hidden h-full">
      <header className="bg-purple-100 border-b border-purple-300 px-3 py-1.5 flex items-center gap-2 text-purple-900">
        <Settings className="w-3.5 h-3.5" />
        <h3 className="text-[13px] font-bold uppercase tracking-wide">
          4. Ações Financeiras
        </h3>
      </header>
      <div className="p-2">
        {children ?? (
          <p className="text-xs text-muted-foreground italic">
            Sem ações disponíveis no momento.
          </p>
        )}
      </div>
    </section>
  );
}
