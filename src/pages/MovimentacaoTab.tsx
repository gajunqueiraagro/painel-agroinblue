import { ArrowLeftRight, TrendingUp, Map, ChevronRight, Construction, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';

interface Props {
  onNavigate: (dest: 'tipos' | 'resumo') => void;
  onTabChange?: (tab: TabId) => void;
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

export function MovimentacaoTab({ onNavigate, onTabChange }: Props) {
  return (
    <div className="p-4 pb-24 w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Coluna 1 — Rebanho */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🐄 Rebanho</h2>
          <div className="space-y-2">
            <HubCard
              icon={ArrowLeftRight}
              title="Lista das Movimentações"
              description="Entradas, saídas e transferências"
              onClick={() => onNavigate('tipos')}
            />
            <HubCard
              icon={TrendingUp}
              title="Tela das Movimentações"
              description="Evolução do rebanho e categorias"
              onClick={() => onNavigate('resumo')}
            />
            <HubCard
              icon={DollarSign}
              title="Valor do Rebanho"
              description="Valoração do estoque e preços por categoria"
              onClick={() => onTabChange?.('valor_rebanho' as TabId)}
            />
          </div>
        </div>

        {/* Coluna 2 — Pastos */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🌿 Pastos</h2>
          <div className="space-y-2">
            <HubCard
              icon={Map}
              title="Mapa de Pastos"
              description="Visualização consolidada"
              onClick={() => onTabChange?.('mapa_pastos')}
              showArrow
            />
            <HubCard
              icon={Map}
              title="Mapa Geográfico"
              description="Mapa real com polígonos KML"
              onClick={() => onTabChange?.('mapa_geo_pastos')}
              showArrow
            />
          </div>
        </div>

        {/* Coluna 3 — Reservada */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🔧 Em construção</h2>
          <div className="space-y-2">
            <HubCard icon={Construction} title="Em construção" description="Em breve" disabled />
            <HubCard icon={Construction} title="Em construção" description="Em breve" disabled />
          </div>
        </div>
      </div>
    </div>
  );
}
