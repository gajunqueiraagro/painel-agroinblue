import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutGrid, CalendarDays } from 'lucide-react';

interface Props {
  ano: number;
  onBack: () => void;
  onSelectCategoria: () => void;
  onSelectMes: () => void;
}

export function ConsolidacaoHub({ ano, onBack, onSelectCategoria, onSelectMes }: Props) {
  return (
    <div className="w-full px-2 pb-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
        </Button>
        <h2 className="text-sm font-semibold text-orange-700">Consolidação Meta — {ano}</h2>
      </div>

      <div className="flex items-center justify-center gap-6 mt-8">
        <Card
          className="w-[260px] h-[200px] flex flex-col items-center justify-center gap-3 p-6 cursor-pointer border-orange-200 hover:border-orange-400 hover:shadow-lg transition-all duration-200 group"
          onClick={onSelectCategoria}
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
            <LayoutGrid className="h-6 w-6 text-orange-600" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Por Categoria</h3>
          <p className="text-[11px] text-muted-foreground text-center leading-snug">
            Visualizar evolução mensal consolidada por categoria
          </p>
        </Card>

        <Card
          className="w-[260px] h-[200px] flex flex-col items-center justify-center gap-3 p-6 cursor-pointer border-orange-200 hover:border-orange-400 hover:shadow-lg transition-all duration-200 group"
          onClick={onSelectMes}
        >
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
            <CalendarDays className="h-6 w-6 text-orange-600" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Por Mês</h3>
          <p className="text-[11px] text-muted-foreground text-center leading-snug">
            Visualizar todas as categorias dentro de um mês específico
          </p>
        </Card>
      </div>
    </div>
  );
}
