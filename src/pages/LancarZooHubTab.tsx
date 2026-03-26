/**
 * Hub Operacional Zootécnico — telas de lançamento e operação de campo.
 * Global mode: blocks all launch screens with a message.
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  PlusCircle, TrendingUp, ClipboardList, CloudRain,
  ChevronRight, GitCompare, Lock, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

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
  const { isGlobal } = useFazenda();

  const navTo = (tab: TabId) => {
    if (isGlobal) {
      toast.info('Selecione uma fazenda para realizar lançamentos');
      return;
    }
    if (filtroGlobal) {
      onTabChange(tab, filtroGlobal);
    } else {
      onTabChange(tab);
    }
  };

  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-20">
      {isGlobal && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Selecione uma fazenda para realizar lançamentos
          </p>
        </div>
      )}
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
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors group ${isGlobal ? 'bg-muted/20 opacity-50 cursor-not-allowed' : 'bg-muted/40 hover:bg-muted/70'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <item.icon className={`h-4 w-4 shrink-0 ${isGlobal ? 'text-muted-foreground' : 'text-primary'}`} />
                      <div className="text-left min-w-0">
                        <p className={`text-sm font-semibold ${isGlobal ? 'text-muted-foreground' : 'text-foreground'}`}>{item.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                      </div>
                    </div>
                    {isGlobal ? (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                    )}
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
