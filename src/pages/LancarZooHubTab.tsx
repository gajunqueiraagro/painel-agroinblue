/**
 * Hub Lançar Zootécnico — tela de ação rápida operacional
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import {
  Lock, AlertCircle,
  ArrowLeftRight, LayoutGrid, CloudRain, Upload, ShieldAlert,
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
  {
    label: 'Importar Histórico Zootécnico',
    tab: 'import_zoot_historico' as TabId,
    icon: Upload,
    description: 'Carga de dados desde 2020',
  },
  {
    label: 'Histórico de Importações',
    tab: 'historico_importacoes_zoot' as TabId,
    icon: Upload,
    description: 'Auditoria e exclusão de lotes',
  },
  {
    label: 'Auditoria Zootécnica',
    tab: 'auditoria_zoot' as TabId,
    icon: ShieldAlert,
    description: 'Identificar inconsistências na base',
  },
];

export function LancarZooHubTab({ onTabChange, filtroGlobal }: Props) {
  const { isGlobal } = useFazenda();
  useRedirecionarPecuaria();

  const ALLOWED_GLOBAL: TabId[] = ['fechamento_executivo'];

  const navTo = (tab: TabId) => {
    if (isGlobal && !ALLOWED_GLOBAL.includes(tab)) {
      toast.info('Selecione uma fazenda para realizar lançamentos');
      return;
    }
    if (filtroGlobal) {
      onTabChange(tab, filtroGlobal);
    } else {
      onTabChange(tab);
    }
  };

  const isBlocked = (tab: TabId) => isGlobal && !ALLOWED_GLOBAL.includes(tab);

  return (
    <div className="w-full px-4 animate-fade-in pb-20">
      {isGlobal && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Selecione uma fazenda para realizar lançamentos
          </p>
        </div>
      )}

      <div className="p-4 space-y-5">
        {/* ── AÇÕES PRINCIPAIS ── */}
        <div className="grid grid-cols-3 gap-2">
          {ACOES_PRINCIPAIS.map(item => {
            const blocked = isBlocked(item.tab);
            return (
              <button
                key={item.tab}
                onClick={() => navTo(item.tab)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 bg-card px-2 py-4 min-h-[130px] transition-all ${
                  blocked
                    ? 'border-border opacity-50 cursor-not-allowed'
                    : 'border-primary/20 hover:border-primary hover:shadow-md active:scale-[0.98] shadow-sm'
                }`}
              >
                <div className={`rounded-full p-3 ${blocked ? 'bg-muted' : 'bg-primary/10'}`}>
                  <item.icon className={`h-7 w-7 ${blocked ? 'text-muted-foreground' : 'text-primary'}`} />
                </div>
                <div className="text-center">
                  <p className={`text-sm font-semibold leading-tight ${blocked ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {item.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{item.description}</p>
                </div>
                {blocked && <Lock className="h-3 w-3 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
