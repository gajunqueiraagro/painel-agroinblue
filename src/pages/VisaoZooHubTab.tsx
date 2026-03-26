/**
 * Hub de Visão Zootécnica — telas de análise e gestão.
 * Global mode: hides operational conciliation items.
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  BarChart2, GitCompare, Layers, Map, ClipboardCheck,
  ChevronRight, Lock,
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
  blockedGlobal?: boolean;
}

const PAINEL: GroupItem[] = [
  { label: 'Status Zootécnico', tab: 'zootecnico', icon: ClipboardCheck, description: 'Pendências do mês + visão anual' },
  { label: 'Indicadores', tab: 'indicadores', icon: BarChart2, description: 'Estoque, produção, desempenho e gráficos' },
];

const CONCILIACAO: GroupItem[] = [
  { label: 'Conciliação de Categorias', tab: 'conciliacao_categoria', icon: GitCompare, description: 'Conferência por categoria', blockedGlobal: true },
  { label: 'Conciliação de Pastos', tab: 'conciliacao', icon: GitCompare, description: 'Conferência pasto vs sistema', blockedGlobal: true },
];

const PASTOS: GroupItem[] = [
  { label: 'Mapa de Pastos', tab: 'mapa_pastos', icon: Map, description: 'Visualização consolidada' },
  { label: 'Resumo de Pastos', tab: 'resumo_pastos', icon: Layers, description: 'Indicadores por pasto' },
];

export function VisaoZooHubTab({ onTabChange, filtroGlobal }: Props) {
  const { isGlobal } = useFazenda();

  const navTo = (item: GroupItem) => {
    if (isGlobal && item.blockedGlobal) {
      toast.info('Selecione uma fazenda para acessar esta funcionalidade');
      return;
    }
    if (filtroGlobal) {
      onTabChange(item.tab, filtroGlobal);
    } else {
      onTabChange(item.tab);
    }
  };

  const groups = [
    { title: 'Painel', emoji: '📊', items: PAINEL },
    { title: 'Conciliação', emoji: '✅', items: CONCILIACAO },
    { title: 'Pastos', emoji: '🌿', items: PASTOS },
  ];

  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-20">
      <div className="p-4 space-y-4">
        {groups.map(group => (
          <Card key={group.title}>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                {group.emoji} {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map(item => {
                  const blocked = isGlobal && item.blockedGlobal;
                  return (
                    <button
                      key={item.tab}
                      onClick={() => navTo(item)}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors group ${blocked ? 'bg-muted/20 opacity-50 cursor-not-allowed' : 'bg-muted/40 hover:bg-muted/70'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <item.icon className={`h-4 w-4 shrink-0 ${blocked ? 'text-muted-foreground' : 'text-primary'}`} />
                        <div className="text-left min-w-0">
                          <p className={`text-sm font-semibold ${blocked ? 'text-muted-foreground' : 'text-foreground'}`}>{item.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                        </div>
                      </div>
                      {blocked ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
