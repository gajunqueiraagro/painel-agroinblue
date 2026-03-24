/**
 * Módulo Financeiro — container principal com sub-abas.
 * Fase 1: Importação + Dashboard.
 */
import { useState } from 'react';
import { ImportacaoFinanceira } from '@/components/financeiro/ImportacaoFinanceira';
import { DashboardFinanceiro } from '@/components/financeiro/DashboardFinanceiro';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { Loader2 } from 'lucide-react';

type SubTab = 'dashboard' | 'importacao';

interface Props {
  /** Cabeças médias do mês — do módulo zootécnico */
  cabMediaMes?: number;
  /** Cabeças médias acumulado */
  cabMediaAcum?: number;
  /** Arrobas produzidas acumulado */
  arrobasProduzidasAcum?: number;
}

export function FinanceiroCaixaTab({ cabMediaMes, cabMediaAcum, arrobasProduzidasAcum }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const { importacoes, lancamentos, centrosCusto, indicadores, rateioADM, loading, confirmarImportacao, isGlobal } = useFinanceiro();

  const tabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'importacao', label: 'Importação', icon: '📥' },
  ];

  return (
    <div className="p-4 max-w-full mx-auto space-y-3 animate-fade-in pb-20">
      {/* Sub-tabs */}
      <div className="grid grid-cols-2 gap-1 bg-muted rounded-lg p-1">
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
