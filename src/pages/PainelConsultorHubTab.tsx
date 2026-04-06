/**
 * Hub do Painel do Consultor — centraliza navegação do cenário Previsto/Meta
 * e acesso aos Dados de Auditoria.
 */
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardCheck, Table2, TrendingUp, DollarSign, ArrowLeftRight } from 'lucide-react';
import type { TabId } from '@/components/BottomNav';

interface Props {
  onTabChange: (tab: TabId) => void;
  onBack?: () => void;
}

const items = [
  {
    id: 'painel_consultor' as TabId,
    title: 'Dados de Auditoria',
    desc: 'Painel completo com indicadores mensais, comparativo meta vs realizado',
    icon: ClipboardCheck,
    color: 'text-primary',
    accent: 'border-primary/30 bg-primary/5',
  },
  {
    id: 'meta_consolidacao' as TabId,
    title: 'Consolidação por Categoria',
    desc: 'Saldo, peso e produção biológica por categoria/mês (somente leitura)',
    icon: Table2,
    color: 'text-violet-600',
    accent: '',
  },
  {
    id: 'meta_gmd' as TabId,
    title: 'GMD Previsto',
    desc: 'Defina o GMD meta por categoria e mês',
    icon: TrendingUp,
    color: 'text-emerald-600',
    accent: '',
  },
  {
    id: 'meta_preco' as TabId,
    title: 'Preços Previstos',
    desc: 'Preços de mercado para o cenário meta',
    icon: DollarSign,
    color: 'text-blue-600',
    accent: '',
  },
  {
    id: 'meta_movimentacoes' as TabId,
    title: 'Movimentações Previstas',
    desc: 'Registre compras, vendas, abates e reclassificações do cenário meta',
    icon: ArrowLeftRight,
    color: 'text-orange-600',
    accent: '',
  },
];

export function PainelConsultorHubTab({ onTabChange }: Props) {
  return (
    <div className="w-full px-4 animate-fade-in pb-24">
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Gerencie o cenário previsto e acesse os dados de auditoria do Painel do Consultor.
        </p>
        {items.map(item => (
          <Card
            key={item.id}
            className={`cursor-pointer hover:shadow-md transition-shadow ${item.accent}`}
            onClick={() => onTabChange(item.id)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${item.color}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
