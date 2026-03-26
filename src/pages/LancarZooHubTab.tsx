/**
 * Hub Operacional Zootécnico — telas de lançamento e operação de campo.
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import {
  PlusCircle, TrendingUp, ClipboardList, CloudRain,
  ChevronRight, GitCompare,
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
    title: 'Rebanho',
    emoji: '🐄',
    items: [
      { label: 'Lançar Rebanho', tab: 'lancamentos', icon: PlusCircle, description: 'Entradas, saídas e reclassificações' },
      { label: 'Movimentações', tab: 'financeiro', icon: GitCompare, description: 'Detalhamento por tipo de operação' },
      { label: 'Evolução do Rebanho', tab: 'fluxo_anual', icon: TrendingUp, description: 'Fluxo mensal e categorias' },
    ],
  },
  {
    title: 'Campo',
    emoji: '🌿',
    items: [
      { label: 'Lançamento de Pasto', tab: 'fechamento', icon: ClipboardList, description: 'Fechamento mensal dos pastos' },
      { label: 'Chuvas', tab: 'chuvas', icon: CloudRain, description: 'Registro de precipitação' },
    ],
  },
];

export function LancarZooHubTab({ onTabChange, filtroGlobal }: Props) {
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
