/**
 * Hub Operação — agrupamento de análises zootécnicas, financeiras e operacionais.
 * Acessível via card "Operação" no Resumo.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TabId } from '@/components/BottomNav';
import {
  ArrowLeft, ChevronRight, BarChart2, TrendingUp, DollarSign,
  PieChart, FileBarChart, Landmark, Activity, Target, Layers,
  LineChart, Wallet, Calculator,
} from 'lucide-react';

interface Props {
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  onBack: () => void;
  filtroGlobal?: { ano: string; mes: number };
}

interface GroupItem {
  label: string;
  tab: TabId;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const GROUPS: { title: string; emoji: string; items: GroupItem[] }[] = [
  {
    title: 'Visão Geral',
    emoji: '📊',
    items: [
      { label: 'Operação (Rebanho)', tab: 'analise', icon: PieChart, description: 'Saldo, composição, entradas e saídas' },
      { label: 'Indicadores Zootécnicos', tab: 'zootecnico', icon: BarChart2, description: 'KPIs, estoque, lotação e produção' },
      { label: 'Visão Anual Zootécnica', tab: 'visao_anual_zoo', icon: Layers, description: 'Status mensal consolidado do ano' },
    ],
  },
  {
    title: 'Rebanho',
    emoji: '🐄',
    items: [
      { label: 'Evolução do Rebanho', tab: 'fluxo_anual', icon: TrendingUp, description: 'Fluxo mensal e categorias' },
      { label: 'Movimentações', tab: 'movimentacao', icon: Activity, description: 'Entradas, saídas e transferências' },
      { label: 'Valor do Rebanho', tab: 'valor_rebanho', icon: Target, description: 'Valoração em @ e R$' },
      { label: 'Preço de Mercado', tab: 'preco_mercado', icon: LineChart, description: 'Referências de preço da arroba' },
    ],
  },
  {
    title: 'Financeiro',
    emoji: '💰',
    items: [
      { label: 'Dashboard Financeiro', tab: 'fin_caixa', icon: DollarSign, description: 'Fluxo de caixa e importação' },
      { label: 'Análise Econômica', tab: 'analise_economica', icon: Calculator, description: 'DRE, indicadores e margem' },
      { label: 'Análise Operacional', tab: 'analise_operacional', icon: Wallet, description: 'Indicadores financeiros e operacionais' },
    ],
  },
  {
    title: 'Relatórios',
    emoji: '📋',
    items: [
      { label: 'Gráficos de Análise', tab: 'graficos_analise', icon: FileBarChart, description: 'Gráficos comparativos detalhados' },
      { label: 'Fechamento Executivo', tab: 'fechamento_executivo', icon: Landmark, description: 'Relatório executivo do período' },
    ],
  },
];

export function OperacaoHubTab({ onTabChange, onBack, filtroGlobal }: Props) {
  const navTo = (tab: TabId) => {
    if (filtroGlobal) {
      onTabChange(tab, filtroGlobal);
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-20">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Operação</h1>
        </div>

        {GROUPS.map(group => (
          <Card key={group.title}>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                {group.emoji} {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map(item => (
                  <button
                    key={item.tab}
                    onClick={() => navTo(item.tab)}
                    className="w-full flex items-center justify-between bg-muted/40 hover:bg-muted/70 rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <item.icon className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
