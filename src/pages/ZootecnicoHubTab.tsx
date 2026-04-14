/**
 * Hub Zootécnico — navegação organizada em 4 grupos.
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import {
  BarChart2, ClipboardList, Map, GitCompare,
  ChevronRight, PlusCircle, TrendingUp, CloudRain, Layers,
} from 'lucide-react';

interface Props {
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
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
    title: 'Painel',
    emoji: '📊',
    items: [
      { label: 'Indicadores e Status', tab: 'zootecnico', icon: BarChart2, description: 'KPIs, estoque, lotação e produção' },
      { label: 'Visão Anual', tab: 'visao_anual_zoo', icon: Layers, description: 'Status mensal consolidado do ano' },
    ],
  },
  {
    title: 'Rebanho',
    emoji: '🐄',
    items: [
      { label: 'Lançamentos', tab: 'lancamentos', icon: PlusCircle, description: 'Entradas, saídas e reclassificações' },
      { label: 'Evolução do Rebanho', tab: 'fluxo_anual', icon: TrendingUp, description: 'Fluxo mensal e categorias' },
      { label: 'Chuvas', tab: 'chuvas', icon: CloudRain, description: 'Registro de precipitação' },
    ],
  },
  {
    title: 'Pastos',
    emoji: '🌿',
    items: [
      { label: 'Lançamento de Pasto', tab: 'fechamento', icon: ClipboardList, description: 'Fechamento mensal dos pastos' },
      { label: 'Mapa de Pastos', tab: 'mapa_pastos', icon: Map, description: 'Visualização consolidada' },
      { label: 'Resumo de Pastos', tab: 'resumo_pastos', icon: Layers, description: 'Indicadores por pasto' },
    ],
  },
  {
    title: 'Conciliação',
    emoji: '✅',
    items: [
      { label: 'Fechamento de Pastos', tab: 'conciliacao', icon: GitCompare, description: 'Conferência pasto vs sistema' },
    ],
  },
];

export function ZootecnicoHubTab({ onTabChange, filtroGlobal }: Props) {
  const { fazendaAtual } = useFazenda();
  const { bloqueado } = useRedirecionarPecuaria();

  if (bloqueado) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <span className="text-4xl">🐄</span>
        <p className="font-medium text-base">Esta fazenda não possui operação pecuária</p>
        <p className="text-sm">Selecione uma fazenda com pecuária para visualizar os dados zootécnicos.</p>
      </div>
    );
  }

  const navTo = (tab: TabId) => {
    if (filtroGlobal) {
      onTabChange(tab, filtroGlobal);
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div className="w-full px-4 animate-fade-in pb-20">

      <div className="p-4 space-y-4">
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
