/**
 * Hub do Painel do Consultor — grid visual 3×2 de navegação.
 */
import { Card } from '@/components/ui/card';
import { ClipboardCheck, Table2, TrendingUp, DollarSign, ArrowLeftRight, CalendarCheck } from 'lucide-react';
import type { TabId } from '@/components/BottomNav';

interface Props {
  onTabChange: (tab: TabId) => void;
  onBack?: () => void;
}

const items = [
  {
    id: 'status_fechamentos' as TabId,
    title: 'Status do Mês',
    desc: 'Visão consolidada do status financeiro, zootécnico e econômico',
    icon: CalendarCheck,
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
  },
  {
    id: 'painel_consultor' as TabId,
    title: 'Dados de Auditoria',
    desc: 'Indicadores mensais, comparativo meta vs realizado',
    icon: ClipboardCheck,
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    id: 'meta_movimentacoes' as TabId,
    title: 'Movimentações Previstas',
    desc: 'Compras, vendas, abates e reclassificações meta',
    icon: ArrowLeftRight,
    color: 'text-orange-600',
    bg: 'bg-orange-500/10',
  },
  {
    id: 'meta_consolidacao' as TabId,
    title: 'Consolidação por Categoria',
    desc: 'Saldo, peso e produção biológica por categoria/mês',
    icon: Table2,
    color: 'text-violet-600',
    bg: 'bg-violet-500/10',
  },
  {
    id: 'meta_gmd' as TabId,
    title: 'GMD Meta',
    desc: 'GMD meta por categoria e mês',
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
  },
  {
    id: 'meta_preco' as TabId,
    title: 'Preços Meta',
    desc: 'Preços de mercado do cenário meta',
    icon: DollarSign,
    color: 'text-blue-600',
    bg: 'bg-blue-500/10',
  },
];

export function PainelConsultorHubTab({ onTabChange }: Props) {
  return (
    <div className="w-full px-4 pt-2 animate-fade-in pb-24">
      <p className="text-xs text-muted-foreground mb-4 px-1">
        Gerencie o cenário meta e acesse os dados de auditoria.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map(item => (
          <Card
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary/40 active:scale-[0.98]"
          >
            <div className="flex flex-col items-center justify-center text-center gap-2 p-4 min-h-[120px]">
              <div className={`rounded-xl p-2.5 ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground leading-tight">{item.title}</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{item.desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
