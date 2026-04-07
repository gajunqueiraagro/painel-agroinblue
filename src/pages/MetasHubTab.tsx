/**
 * Hub de Metas — sub-abas GMD Meta, Preços Meta, Movimentações Meta e Consolidação.
 */
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, DollarSign, ArrowLeftRight, Table2 } from 'lucide-react';
import type { TabId } from '@/components/BottomNav';

interface Props {
  onTabChange: (tab: TabId) => void;
}

const items = [
  {
    id: 'meta_movimentacoes' as TabId,
    title: 'Movimentações Meta',
    desc: 'Registre compras, vendas, abates e reclassificações do cenário meta',
    icon: ArrowLeftRight,
    color: 'text-orange-600',
  },
  {
    id: 'meta_consolidacao' as TabId,
    title: 'Consolidação por Categoria',
    desc: 'Visualize saldo, peso e produção biológica por categoria/mês (somente leitura)',
    icon: Table2,
    color: 'text-violet-600',
  },
  {
    id: 'meta_gmd' as TabId,
    title: 'GMD Meta',
    desc: 'Defina o GMD meta por categoria e mês',
    icon: TrendingUp,
    color: 'text-emerald-600',
  },
  {
    id: 'meta_preco' as TabId,
    title: 'Preços Meta',
    desc: 'Preços de mercado para o cenário meta',
    icon: DollarSign,
    color: 'text-blue-600',
  },
];

export function MetasHubTab({ onTabChange }: Props) {
  return (
    <div className="w-full px-4 animate-fade-in pb-24">
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Configure as metas de desempenho e preços para alimentar o cenário "Meta" do Painel do Consultor.
        </p>
        {items.map(item => (
          <Card
            key={item.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
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
