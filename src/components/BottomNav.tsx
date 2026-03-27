import { LayoutDashboard, ArrowLeftRight, PenSquare, BarChart3, DollarSign, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

export type TabId = 'resumo' | 'movimentacao' | 'lancamentos' | 'financeiro' | 'evolucao' | 'evolucao_categoria' | 'fluxo_anual' | 'acessos' | 'analise' | 'analise_entradas' | 'analise_saidas' | 'desfrute' | 'cadastros' | 'chuvas' | 'pastos' | 'conciliacao' | 'fin_caixa' | 'zootecnico' | 'zootecnico_hub' | 'analise_economica' | 'valor_rebanho' | 'conciliacao_categoria' | 'analise_operacional' | 'resumo_pastos' | 'mapa_pastos' | 'fechamento' | 'visao_anual_zoo' | 'lancar_zoo_hub' | 'visao_zoo_hub' | 'lancar_fin_hub' | 'visao_fin_hub' | 'indicadores' | 'evolucao_rebanho_hub';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const allTabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'movimentacao', label: 'Movimentações', icon: ArrowLeftRight },
  { id: 'lancar_zoo_hub', label: 'Lançamentos', icon: PenSquare },
  { id: 'visao_zoo_hub', label: 'Análises', icon: BarChart3 },
  { id: 'fin_caixa', label: 'Financeiro', icon: DollarSign },
  { id: 'cadastros', label: 'Cadastros', icon: Settings },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { canViewTab } = usePermissions();
  const tabs = allTabs.filter(t => canViewTab(t.id));
  const getActiveId = (tab: TabId): TabId => {
    // Movimentações sub-screens
    const movTabs: TabId[] = ['movimentacao', 'fluxo_anual', 'evolucao_rebanho_hub', 'evolucao_categoria'];
    // Lançamentos sub-screens
    const lancarTabs: TabId[] = ['lancar_zoo_hub', 'lancamentos', 'fechamento', 'chuvas', 'conciliacao', 'conciliacao_categoria', 'valor_rebanho', 'mapa_pastos', 'resumo_pastos', 'financeiro'];
    // Análises sub-screens (unifica Visão Zoo + Visão Op.)
    const analiseTabs: TabId[] = ['visao_zoo_hub', 'zootecnico', 'zootecnico_hub', 'indicadores', 'visao_anual_zoo', 'analise', 'analise_entradas', 'analise_saidas', 'desfrute', 'evolucao', 'analise_operacional', 'pastos', 'lancar_fin_hub', 'visao_fin_hub', 'analise_economica'];
    // Financeiro sub-screens
    const finTabs: TabId[] = ['fin_caixa'];
    const cadTabs: TabId[] = ['cadastros', 'acessos'];
    if (movTabs.includes(tab)) return 'movimentacao';
    if (lancarTabs.includes(tab)) return 'lancar_zoo_hub';
    if (analiseTabs.includes(tab)) return 'visao_zoo_hub';
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
