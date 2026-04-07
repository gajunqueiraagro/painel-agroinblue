/**
 * Hub Preços de Mercado — 3 cards: Preços Reais, Preços Meta Anual, Em Construção.
 */
import { Card } from '@/components/ui/card';
import { DollarSign, Target, Construction, ArrowLeft } from 'lucide-react';
import type { TabId } from '@/components/BottomNav';

interface Props {
  onTabChange: (tab: TabId) => void;
  onBack?: () => void;
}

const items = [
  {
    id: 'preco_mercado' as TabId,
    title: 'Preços Reais de Mercado',
    subtitle: 'base*',
    desc: 'Referência histórica real — frigorífico, leilão e mercado',
    icon: DollarSign,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
  },
  {
    id: 'meta_preco' as TabId,
    title: 'Preços para Meta Anual',
    subtitle: '',
    desc: 'Base oficial do valor do rebanho META por categoria',
    icon: Target,
    color: 'text-orange-600',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
  {
    id: '__em_construcao__' as TabId,
    title: 'Em Construção',
    subtitle: '',
    desc: 'Módulo em desenvolvimento — futuras expansões',
    icon: Construction,
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
    border: 'border-muted',
  },
];

export function PrecosMercadoHubTab({ onTabChange, onBack }: Props) {
  return (
    <div className="w-full px-4 pt-2 animate-fade-in pb-24">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-[11px] text-primary hover:underline mb-2">
          <ArrowLeft className="h-3 w-3" />
          Voltar para Painel do Consultor
        </button>
      )}

      <p className="text-[11px] text-muted-foreground mb-3 px-1">
        Gerencie os preços de mercado e as referências de precificação.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {items.map(item => {
          const isDisabled = item.id === ('__em_construcao__' as TabId);
          return (
            <Card
              key={item.id}
              onClick={() => !isDisabled && onTabChange(item.id)}
              className={`transition-all ${
                isDisabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:shadow-md hover:border-primary/40 active:scale-[0.98]'
              } ${item.border}`}
            >
              <div className="flex flex-col items-center justify-center text-center gap-1.5 p-3 py-4">
                <div className={`rounded-xl p-3 ${item.bg}`}>
                  <item.icon className={`h-7 w-7 ${item.color}`} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-foreground leading-tight">{item.title}</h3>
                  {item.subtitle && (
                    <span className="text-[9px] text-muted-foreground italic">{item.subtitle}</span>
                  )}
                  <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{item.desc}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
