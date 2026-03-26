/**
 * Hub Lançar Zootécnico — reestruturado: Ação → Análise → Controle
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  ChevronRight, Lock, AlertCircle,
  ArrowLeftRight, LayoutGrid, CloudRain,
  TrendingUp, GitCompare, Map, Layers, DollarSign,
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

const ACOES_PRINCIPAIS = [
  {
    label: 'Lançar Movimentações',
    tab: 'lancamentos' as TabId,
    icon: ArrowLeftRight,
    description: 'Entradas, saídas e transferências',
  },
  {
    label: 'Lançar Rebanho em Pastos',
    tab: 'fechamento' as TabId,
    icon: LayoutGrid,
    description: 'Alocação e ajuste por pasto',
  },
  {
    label: 'Lançar Chuvas',
    tab: 'chuvas' as TabId,
    icon: CloudRain,
    description: 'Registro climático',
  },
];

const EVOLUCAO_REBANHO: GroupItem[] = [
  { label: 'Movimentações', tab: 'movimentacao', icon: ArrowLeftRight, description: 'Detalhamento por tipo de operação' },
  { label: 'Evolução do Rebanho', tab: 'fluxo_anual', icon: TrendingUp, description: 'Fluxo mensal e categorias' },
  { label: 'Evolução por Categoria', tab: 'evolucao_categoria', icon: Layers, description: 'Histórico por categoria' },
  { label: 'Valor do Rebanho', tab: 'valor_rebanho', icon: DollarSign, description: 'Valorização mensal do estoque' },
];

const EVOLUCAO_PASTOS: GroupItem[] = [
  { label: 'Mapa de Pastos', tab: 'mapa_pastos', icon: Map, description: 'Visualização consolidada' },
  { label: 'Resumo de Pastos', tab: 'resumo_pastos', icon: Layers, description: 'Indicadores por pasto' },
];

const CONCILIACAO_REBANHO: GroupItem[] = [
  { label: 'Conciliação de Categoria', tab: 'conciliacao_categoria', icon: GitCompare, description: 'Conferência por categoria' },
];

const CONCILIACAO_PASTOS: GroupItem[] = [
  { label: 'Conciliação de Pastos', tab: 'conciliacao', icon: GitCompare, description: 'Conferência pasto vs sistema' },
];

const BLOCKS: { title: string; emoji: string; items: GroupItem[] }[] = [
  { title: 'Evolução do Rebanho', emoji: '🐄', items: EVOLUCAO_REBANHO },
  { title: 'Evolução dos Pastos', emoji: '🌿', items: EVOLUCAO_PASTOS },
  { title: 'Conciliação Rebanho', emoji: '✅', items: CONCILIACAO_REBANHO },
  { title: 'Conciliação Pastos', emoji: '✅', items: CONCILIACAO_PASTOS },
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

  const disabledCls = isGlobal ? 'opacity-50 cursor-not-allowed' : '';

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
        {/* ── AÇÕES PRINCIPAIS ── */}
        <div className="grid grid-cols-3 gap-3">
          {ACOES_PRINCIPAIS.map(item => (
            <button
              key={item.tab}
              onClick={() => navTo(item.tab)}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 min-h-[120px] transition-colors ${isGlobal ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent active:bg-accent/80 shadow-sm'}`}
            >
              <div className={`rounded-full p-3 ${isGlobal ? 'bg-muted' : 'bg-primary/10'}`}>
                <item.icon className={`h-6 w-6 ${isGlobal ? 'text-muted-foreground' : 'text-primary'}`} />
              </div>
              <div className="text-center">
                <p className={`text-xs font-bold leading-tight ${isGlobal ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {item.label}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{item.description}</p>
              </div>
              {isGlobal && <Lock className="h-3 w-3 text-muted-foreground" />}
            </button>
          ))}
        </div>

        {/* ── BLOCOS DE ANÁLISE E CONTROLE ── */}
        {BLOCKS.map(block => (
          <Card key={block.title}>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                {block.emoji} {block.title}
              </h3>
              <div className="space-y-1">
                {block.items.map(item => (
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
