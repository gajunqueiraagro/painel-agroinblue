import { ReactNode } from 'react';
import { Wallet } from 'lucide-react';

interface Props {
  children: ReactNode;
}

export function BlocoVinculoFinanceiro({ children }: Props) {
  return (
    <section className="rounded-lg border-2 border-emerald-600 bg-white overflow-hidden flex flex-col h-full">
      <header className="bg-emerald-700 px-3 py-1.5 flex items-center gap-2 text-white">
        <Wallet className="w-3.5 h-3.5" />
        <h3 className="text-[13px] font-bold uppercase tracking-wide">
          2. Vínculo Financeiro
        </h3>
      </header>
      <div className="p-2.5 flex-1 flex flex-col">
        {children}
      </div>
    </section>
  );
}
