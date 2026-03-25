/**
 * Tela Econômica — visão de resultado.
 * Reutiliza AnaliseEconomica com navegação executiva.
 */
import { ArrowLeft } from 'lucide-react';
import { AnaliseEconomica } from '@/components/financeiro/AnaliseEconomica';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { usePastos } from '@/hooks/usePastos';
import { useFazenda } from '@/contexts/FazendaContext';
import { Loader2 } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

interface Props {
  lancamentosPecuarios: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack: () => void;
}

export function AnaliseEconomicaTab({ lancamentosPecuarios, saldosIniciais, onBack }: Props) {
  const { fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const { lancamentos, rateioADM, loading, isGlobal } = useFinanceiro();

  return (
    <div className="p-4 max-w-full mx-auto space-y-3 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-lg font-extrabold text-foreground">📊 Econômico</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <AnaliseEconomica
          lancamentos={lancamentos}
          lancamentosPecuarios={lancamentosPecuarios}
          saldosIniciais={saldosIniciais}
          rateioADM={rateioADM}
          isGlobal={isGlobal}
          pastos={pastos}
          categorias={categorias}
          fazendaId={fazendaId}
        />
      )}
    </div>
  );
}
