import { LayoutDashboard, PenSquare, BarChart3, DollarSign, Settings, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

export type TabId = 'resumo' | 'operacao_hub' | 'movimentacao' | 'lancamentos' | 'financeiro' | 'evolucao' | 'evolucao_categoria' | 'fluxo_anual' | 'acessos' | 'analise' | 'analise_entradas' | 'analise_saidas' | 'desfrute' | 'cadastros' | 'chuvas' | 'pastos' | 'conciliacao' | 'fin_caixa' | 'zootecnico' | 'zootecnico_hub' | 'analise_economica' | 'valor_rebanho' | 'conciliacao_categoria' | 'analise_operacional' | 'resumo_pastos' | 'mapa_pastos' | 'fechamento' | 'visao_anual_zoo' | 'lancar_zoo_hub' | 'visao_zoo_hub' | 'lancar_fin_hub' | 'visao_fin_hub' | 'indicadores' | 'evolucao_rebanho_hub' | 'fechamento_executivo' | 'analise_consultor' | 'preco_mercado' | 'graficos_analise' | 'financeiro_v2' | 'financeiro_v2_hub' | 'fin_v2_contas' | 'fin_v2_fornecedores' | 'fin_v2_plano' | 'fin_v2_saldos' | 'contratos' | 'conciliacao_bancaria';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const allTabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'lancar_zoo_hub', label: 'Lanç. Zoo.', icon: PenSquare },
  { id: 'financeiro_v2_hub', label: 'Lanç. Fin.', icon: DollarSign },
  { id: 'visao_zoo_hub', label: 'Zootécnico', icon: BarChart3 },
  { id: 'fin_caixa', label: 'Financeiro', icon: Wallet },
  { id: 'cadastros', label: 'Cadastro', icon: Settings },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { canViewTab } = usePermissions();
  const tabs = allTabs.filter(t => canViewTab(t.id));
  const getActiveId = (tab: TabId): TabId => {
    // Lanç. Zoo sub-screens
    const lancarZooTabs: TabId[] = ['lancar_zoo_hub', 'lancamentos', 'fechamento', 'chuvas', 'mapa_pastos', 'resumo_pastos'];
    // Lanç. Fin sub-screens (V2 operational)
    const lancarFinTabs: TabId[] = ['financeiro_v2_hub', 'financeiro_v2', 'fin_v2_contas', 'fin_v2_fornecedores', 'fin_v2_plano', 'fin_v2_saldos', 'contratos', 'conciliacao_bancaria'];
    // Zootécnico (analysis) sub-screens
    const zooTabs: TabId[] = ['visao_zoo_hub', 'zootecnico', 'zootecnico_hub', 'indicadores', 'visao_anual_zoo', 'conciliacao_categoria', 'conciliacao', 'preco_mercado', 'graficos_analise', 'movimentacao', 'fluxo_anual', 'evolucao_rebanho_hub', 'evolucao_categoria', 'evolucao', 'valor_rebanho', 'pastos', 'fechamento_executivo', 'analise_consultor', 'analise_operacional'];
    // Financeiro (analysis) sub-screens
    const finTabs: TabId[] = ['lancar_fin_hub', 'visao_fin_hub', 'fin_caixa', 'analise_economica', 'financeiro'];
    // Resumo sub-screens
    const resumoTabs: TabId[] = ['resumo', 'analise', 'analise_entradas', 'analise_saidas', 'desfrute'];
    // Cadastros
    const cadTabs: TabId[] = ['cadastros', 'acessos'];
    if (lancarZooTabs.includes(tab)) return 'lancar_zoo_hub';
    if (lancarFinTabs.includes(tab)) return 'financeiro_v2_hub';
    if (zooTabs.includes(tab)) return 'visao_zoo_hub';
    if (finTabs.includes(tab)) return 'lancar_fin_hub';
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
