import { ArrowLeftRight, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  onNavigate: (dest: 'tipos' | 'resumo') => void;
}

function HubCard({ icon: Icon, title, description, onClick, disabled, showArrow }: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  showArrow?: boolean;
}) {
  return (
    <Card
      className={`${disabled ? 'opacity-60' : 'cursor-pointer hover:shadow-md active:scale-[0.98]'} transition-shadow h-[68px]`}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className="flex items-center gap-3 p-3 h-full">
        <div className={`h-9 w-9 rounded-lg ${disabled ? 'bg-muted/60' : 'bg-primary/10'} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${disabled ? 'text-muted-foreground' : 'text-primary'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`font-bold text-[13px] ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}>{title}</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        </div>
        {showArrow && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </CardContent>
    </Card>
  );
}

export function MovimentacaoTab({ onNavigate }: Props) {
  return (
    <div className="p-4 pb-24 w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Coluna 1 — Rebanho */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🐄 Rebanho</h2>
          <div className="space-y-2">
            <HubCard
              icon={ArrowLeftRight}
              title="Conferência de Lançamentos"
              description="Entradas, saídas e transferências detalhadas"
              onClick={() => onNavigate('tipos')}
            />
            <HubCard
              icon={TrendingUp}
              title="Conferência Mensal"
              description="Resumo mensal por categoria do rebanho"
              onClick={() => onNavigate('resumo')}
            />
          </div>
        </div>


      </div>
    </div>
  );
}
