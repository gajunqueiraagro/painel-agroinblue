import { ArrowLeftRight, TrendingUp, Map, ChevronRight, Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';

interface Props {
  onNavigate: (dest: 'tipos' | 'resumo') => void;
  onTabChange?: (tab: TabId) => void;
}

export function MovimentacaoTab({ onNavigate, onTabChange }: Props) {
  return (
    <div className="p-4 pb-24 w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Coluna 1 — Movimentações */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🐄 Movimentações</h2>
          <div className="space-y-2">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
              onClick={() => onNavigate('tipos')}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[13px] text-foreground">Lista das Movimentações</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Entradas, saídas e transferências</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
              onClick={() => onNavigate('resumo')}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[13px] text-foreground">Tela das Movimentações</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Evolução do rebanho e categorias</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Coluna 2 — Pastos */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🌿 Pastos</h2>
          <div className="space-y-2">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
              onClick={() => onTabChange?.('mapa_pastos')}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Map className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[13px] text-foreground">Mapa de Pastos</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Visualização consolidada</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
              onClick={() => onTabChange?.('mapa_geo_pastos')}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Map className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[13px] text-foreground">Mapa Geográfico</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Mapa real com polígonos KML</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Coluna 3 — Reservada */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">🔧 Em construção</h2>
          <div className="space-y-2">
            <Card className="opacity-60">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                  <Construction className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[13px] text-muted-foreground">Em construção</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Em breve</p>
                </div>
              </CardContent>
            </Card>
            <Card className="opacity-60">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                  <Construction className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[13px] text-muted-foreground">Em construção</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Em breve</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
