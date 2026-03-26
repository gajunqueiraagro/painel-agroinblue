/**
 * Visão Zootécnica — mostra Indicadores diretamente + atalho Evolução do Rebanho.
 */
import { Card, CardContent } from '@/components/ui/card';
import { TabId } from '@/components/BottomNav';
import { IndicadoresZooTab } from './ZootecnicoTab';
import { TrendingUp, ChevronRight } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onTabChange: (tab: TabId, filtro?: { ano: string; mes: number }) => void;
  filtroGlobal?: { ano: string; mes: number };
}

const EVOLUCAO_ITEMS = [
  { label: 'Movimentações', description: 'Analítico de entradas e saídas' },
  { label: 'Evolução do Rebanho', description: 'Fluxo mensal e anual' },
  { label: 'Evolução por Categoria', description: 'Visão detalhada por categoria' },
  { label: 'Valor do Rebanho', description: 'Patrimônio e fechamento' },
];

export function VisaoZooHubTab({ lancamentos, saldosIniciais, onTabChange, filtroGlobal }: Props) {
  const handleNavigateEvolucao = () => {
    if (filtroGlobal) {
      onTabChange('evolucao_rebanho_hub', filtroGlobal);
    } else {
      onTabChange('evolucao_rebanho_hub');
    }
  };

  const noop = () => {};

  return (
    <div className="animate-fade-in">
      {/* Indicadores inline — sem back button próprio */}
      <IndicadoresZooTab
        lancamentos={lancamentos}
        saldosIniciais={saldosIniciais}
        onBack={noop}
        onTabChange={onTabChange}
        filtroAnoInicial={filtroGlobal?.ano}
        filtroMesInicial={filtroGlobal?.mes}
        hideBackButton
      />

      {/* Atalho Evolução do Rebanho */}
      <div className="max-w-lg mx-auto px-4 pb-20 -mt-16">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              🐄 Evolução do Rebanho
            </h3>
            <button
              onClick={handleNavigateEvolucao}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors group bg-muted/40 hover:bg-muted/70"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-foreground">Evolução do Rebanho</p>
                  <p className="text-[10px] text-muted-foreground truncate">Movimentações, evolução, valor e categorias</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
