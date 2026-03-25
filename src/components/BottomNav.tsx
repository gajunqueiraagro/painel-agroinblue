import { BarChart3, ArrowLeftRight, PlusCircle, TrendingUp, GitCompare, ClipboardList, Users, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'resumo' | 'movimentacao' | 'lancamentos' | 'financeiro' | 'evolucao' | 'evolucao_categoria' | 'fluxo_anual' | 'acessos' | 'analise' | 'analise_entradas' | 'analise_saidas' | 'desfrute' | 'cadastros' | 'chuvas' | 'pastos' | 'conciliacao' | 'fin_caixa' | 'zootecnico' | 'analise_economica';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'resumo', label: 'Resumo', icon: BarChart3 },
  { id: 'lancamentos', label: 'Lançar Reb.', icon: PlusCircle },
  { id: 'financeiro', label: 'Moviment.', icon: ArrowLeftRight },
  { id: 'fluxo_anual', label: 'Evol. Reb.', icon: TrendingUp },
  { id: 'fin_caixa', label: 'Financeiro', icon: DollarSign },
  { id: 'conciliacao', label: 'Conciliar', icon: GitCompare },
  { id: 'cadastros', label: 'Cadastros', icon: ClipboardList },
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
            <Icon className={cn('h-5 w-5', activeTab === id && 'scale-110')} />
            <span className="text-[10px] font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
