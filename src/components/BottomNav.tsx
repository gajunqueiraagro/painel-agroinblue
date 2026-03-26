import { BarChart3, Beef, DollarSign, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'resumo' | 'movimentacao' | 'lancamentos' | 'financeiro' | 'evolucao' | 'evolucao_categoria' | 'fluxo_anual' | 'acessos' | 'analise' | 'analise_entradas' | 'analise_saidas' | 'desfrute' | 'cadastros' | 'chuvas' | 'pastos' | 'conciliacao' | 'fin_caixa' | 'zootecnico' | 'zootecnico_hub' | 'analise_economica' | 'valor_rebanho' | 'conciliacao_categoria' | 'analise_operacional' | 'resumo_pastos' | 'mapa_pastos' | 'fechamento' | 'visao_anual_zoo';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'resumo', label: 'Resumo', icon: BarChart3 },
  { id: 'zootecnico_hub', label: 'Zootécnico', icon: Beef },
  { id: 'fin_caixa', label: 'Financeiro', icon: DollarSign },
  { id: 'cadastros', label: 'Cadastros', icon: ClipboardList },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  // Highlight the parent tab for sub-screens
  const getActiveId = (tab: TabId): TabId => {
    const zooTabs: TabId[] = ['zootecnico', 'zootecnico_hub', 'lancamentos', 'fluxo_anual', 'chuvas', 'conciliacao', 'conciliacao_categoria', 'valor_rebanho', 'fechamento', 'mapa_pastos', 'resumo_pastos', 'analise_operacional', 'evolucao', 'evolucao_categoria', 'analise', 'analise_entradas', 'analise_saidas', 'desfrute', 'movimentacao', 'pastos'];
    const finTabs: TabId[] = ['fin_caixa', 'financeiro', 'analise_economica'];
    const cadTabs: TabId[] = ['cadastros', 'acessos'];
    if (zooTabs.includes(tab)) return 'zootecnico_hub';
    if (finTabs.includes(tab)) return 'fin_caixa';
    if (cadTabs.includes(tab)) return 'cadastros';
    return 'resumo';
  };

  const highlighted = getActiveId(activeTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card shadow-lg">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-target transition-colors',
              highlighted === id
                ? 'text-primary font-bold'
                : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', highlighted === id && 'scale-110')} />
            <span className="text-[10px] font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
