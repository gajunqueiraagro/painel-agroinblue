import { ReactNode } from 'react';
import { Beef } from 'lucide-react';

interface Props {
  children: ReactNode;
}

export function BlocoDadosMovimentacao({ children }: Props) {
  return (
    <section className="rounded-lg border-2 border-blue-600 bg-white overflow-visible flex flex-col h-full">
      <header className="bg-blue-700 px-3 py-1.5 flex items-center gap-2 text-white">
        <Beef className="w-3.5 h-3.5" />
        <h3 className="text-[13px] font-bold uppercase tracking-wide">
          1. Dados da Movimentação (Zootécnico)
        </h3>
      </header>
      <div className="p-2.5 flex-1 flex flex-col">
        {children}
      </div>
    </section>
  );
}
