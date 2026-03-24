/**
 * Módulo Financeiro — container principal com sub-abas.
 * Fase 1: Importação + Dashboard + Rateio ADM v1.
 */
import { useState } from 'react';
import { ImportacaoFinanceira } from '@/components/financeiro/ImportacaoFinanceira';
import { DashboardFinanceiro } from '@/components/financeiro/DashboardFinanceiro';
import { RateioADMConferenciaView } from '@/components/financeiro/RateioADMConferencia';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { Loader2 } from 'lucide-react';

type SubTab = 'dashboard' | 'rateio' | 'importacao';

interface Props {
  cabMediaMes?: number;
  cabMediaAcum?: number;
  arrobasProduzidasAcum?: number;
}

export function FinanceiroCaixaTab({ cabMediaMes, cabMediaAcum, arrobasProduzidasAcum }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const {
    importacoes, lancamentos, centrosCusto, indicadores,
    rateioADM, rateioConferencia, fazendasSemArea,
    loading, confirmarImportacao, isGlobal, fazendaADM,
  } = useFinanceiro();

  const tabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    ...(fazendaADM ? [{ id: 'rateio' as SubTab, label: 'Rateio ADM', icon: '🏢' }] : []),
    { id: 'importacao', label: 'Importação', icon: '📥' },
  ];

  const gridCols = tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="p-4 max-w-full mx-auto space-y-3 animate-fade-in pb-20">
      {/* Sub-tabs */}
      <div className={`grid ${gridCols} gap-1 bg-muted rounded-lg p-1`}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`py-2 px-3 rounded-md text-xs font-bold transition-colors touch-target ${
              subTab === t.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'dashboard' && (
            <DashboardFinanceiro
              lancamentos={lancamentos}
              indicadores={indicadores}
              cabMediaMes={cabMediaMes}
              cabMediaAcum={cabMediaAcum}
              arrobasProduzidasAcum={arrobasProduzidasAcum}
              rateioADM={rateioADM}
              isGlobal={isGlobal}
              fazendasSemArea={fazendasSemArea}
            />
          )}
          {subTab === 'rateio' && (
            <RateioADMConferenciaView
              conferencia={rateioConferencia}
              fazendasSemArea={fazendasSemArea}
            />
          )}
          {subTab === 'importacao' && (
            <ImportacaoFinanceira
              importacoes={importacoes}
              centrosCusto={centrosCusto}
              onConfirmar={confirmarImportacao}
            />
          )}
        </>
      )}
    </div>
  );
}
