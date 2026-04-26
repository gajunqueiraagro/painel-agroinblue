/**
 * Hub Lançar Zootécnico — tela de ação rápida operacional
 * Layout: 3 colunas (Movimentações | Rebanho em Pastos | Chuvas).
 * Cada coluna: card manual + card por foto IA. Histórico vira link abaixo.
 */
import { TabId } from '@/components/BottomNav';
import { useFazenda } from '@/contexts/FazendaContext';
import { useRedirecionarPecuaria } from '@/hooks/useRedirecionarPecuaria';
import {
  Lock, AlertCircle,
  ArrowLeftRight, LayoutGrid, CloudRain, Camera, ClipboardList,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Props {
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal?: { ano: string; mes: number };
}

interface AcaoCard {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tab?: TabId;
  route?: string;
  disabled?: boolean;
}

interface Coluna {
  titulo: string;
  cards: AcaoCard[];
}

const COLUNAS: Coluna[] = [
  {
    titulo: 'Movimentações',
    cards: [
      {
        label: 'Lançar Movimentações',
        description: 'Manual — entradas, saídas e transferências',
        icon: ArrowLeftRight,
        tab: 'lancamentos',
      },
      {
        label: 'Lançar Movimentações por Foto',
        description: 'Extração automática via foto do caderno',
        icon: Camera,
        route: '/caderno-importacao',
      },
    ],
  },
  {
    titulo: 'Rebanho em Pastos',
    cards: [
      {
        label: 'Lançar Rebanho em Pastos',
        description: 'Manual — alocação e ajuste por pasto',
        icon: LayoutGrid,
        tab: 'fechamento',
      },
      {
        label: 'Lançar Rebanho em Pastos por Foto',
        description: 'Importar Mapa do Rebanho via IA',
        icon: Camera,
        tab: 'fechamento',
      },
    ],
  },
  {
    titulo: 'Chuvas',
    cards: [
      {
        label: 'Lançar Chuvas',
        description: 'Manual — registro climático',
        icon: CloudRain,
        tab: 'chuvas',
      },
      {
        label: 'Lançar Chuvas por Foto',
        description: 'Em breve',
        icon: Camera,
        disabled: true,
      },
    ],
  },
];

const HISTORICO_TAB: TabId = 'historico_importacoes_zoot';

export function LancarZooHubTab({ onTabChange, filtroGlobal }: Props) {
  const { isGlobal } = useFazenda();
  const { bloqueado } = useRedirecionarPecuaria();
  const navigate = useNavigate();

  if (bloqueado) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <span className="text-4xl">🐄</span>
        <p className="font-medium text-base">Esta fazenda não possui operação pecuária</p>
        <p className="text-sm">Selecione uma fazenda com pecuária para visualizar os dados zootécnicos.</p>
      </div>
    );
  }

  const ALLOWED_GLOBAL: TabId[] = ['fechamento_executivo'];

  const navTo = (item: AcaoCard) => {
    if (item.disabled) return;
    if (item.route) {
      if (isGlobal) {
        toast.info('Selecione uma fazenda para realizar lançamentos');
        return;
      }
      navigate(item.route);
      return;
    }
    const tab = item.tab!;
    if (isGlobal && !ALLOWED_GLOBAL.includes(tab)) {
      toast.info('Selecione uma fazenda para realizar lançamentos');
      return;
    }
    if (filtroGlobal) onTabChange(tab, filtroGlobal);
    else onTabChange(tab);
  };

  const isBlocked = (item: AcaoCard) => {
    if (item.disabled) return true;
    if (item.route) return isGlobal;
    return isGlobal && !ALLOWED_GLOBAL.includes(item.tab!);
  };

  const goHistorico = () => {
    if (isGlobal) {
      toast.info('Selecione uma fazenda para visualizar o histórico');
      return;
    }
    if (filtroGlobal) onTabChange(HISTORICO_TAB, filtroGlobal);
    else onTabChange(HISTORICO_TAB);
  };

  return (
    <div className="w-full animate-fade-in pb-20">
      {isGlobal && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Selecione uma fazenda para realizar lançamentos
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
        {COLUNAS.map(col => (
          <div key={col.titulo} className="flex flex-col gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5">
              {col.titulo}
            </h3>
            {col.cards.map(card => {
              const blocked = isBlocked(card);
              return (
                <button
                  key={card.label}
                  onClick={() => navTo(card)}
                  disabled={blocked}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 bg-card px-3 py-5 min-h-[140px] transition-all ${
                    blocked
                      ? 'border-border opacity-50 cursor-not-allowed'
                      : 'border-primary/20 hover:border-primary hover:shadow-md active:scale-[0.98] shadow-sm'
                  }`}
                >
                  <div className={`rounded-full p-3 ${blocked ? 'bg-muted' : 'bg-primary/10'}`}>
                    <card.icon className={`h-7 w-7 ${blocked ? 'text-muted-foreground' : 'text-primary'}`} />
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-semibold leading-tight ${blocked ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {card.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{card.description}</p>
                  </div>
                  {blocked && !card.disabled && <Lock className="h-3 w-3 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-border px-6 py-3">
        <button
          onClick={goHistorico}
          disabled={isGlobal}
          className={`flex items-center gap-2 text-sm transition-colors ${
            isGlobal ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          <span className="font-medium">Histórico de Importações</span>
          <span className="text-xs text-muted-foreground/70">— Auditoria e exclusão de lotes</span>
        </button>
      </div>
    </div>
  );
}
