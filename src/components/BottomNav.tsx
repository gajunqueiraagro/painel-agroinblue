import { BarChart3, ArrowLeftRight, PlusCircle, LayoutGrid, TrendingUp, CalendarRange, DollarSign, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'resumo' | 'movimentacao' | 'lancamentos' | 'financeiro' | 'evolucao' | 'evolucao_categoria' | 'fluxo_anual' | 'acessos' | 'analise' | 'analise_entradas' | 'analise_saidas' | 'desfrute';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'resumo', label: 'Resumo', icon: BarChart3 },
  { id: 'movimentacao', label: 'Fluxo', icon: ArrowLeftRight },
  { id: 'lancamentos', label: 'Lançar', icon: PlusCircle },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { id: 'evolucao', label: 'Cat/Mês', icon: LayoutGrid },
  { id: 'evolucao_categoria', label: 'Evolução', icon: TrendingUp },
  { id: 'fluxo_anual', label: 'Anual', icon: CalendarRange },
  { id: 'acessos', label: 'Acessos', icon: Users },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card shadow-lg">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
              activeTab === id
                ? 'text-primary font-bold'
                : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-6 w-6', activeTab === id && 'scale-110')} />
            <span className="text-xs font-semibold">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
