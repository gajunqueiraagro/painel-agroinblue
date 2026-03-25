/**
 * Módulo Financeiro — container principal com sub-abas.
 * Sub-aba padrão: Fluxo de Caixa (13 linhas + gráfico).
 */
import { useState, useMemo } from 'react';
import { ImportacaoFinanceira } from '@/components/financeiro/ImportacaoFinanceira';
import { DashboardFinanceiro } from '@/components/financeiro/DashboardFinanceiro';
import { RateioADMConferenciaView } from '@/components/financeiro/RateioADMConferencia';
import { AnaliseEconomica } from '@/components/financeiro/AnaliseEconomica';
import { FluxoFinanceiro } from '@/components/financeiro/FluxoFinanceiro';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { Loader2 } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type SubTab = 'fluxo' | 'dashboard' | 'analise' | 'rateio' | 'importacao';

interface Props {
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

export function FinanceiroCaixaTab({ lancamentosPecuarios = [], saldosIniciais = [], onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('fluxo');
  const { fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const {
    importacoes, lancamentos, centrosCusto, indicadores,
    rateioADM, rateioConferencia, fazendasSemRebanho, fazendaMapForImport,
    loading, confirmarImportacao, excluirImportacao, isGlobal, fazendaADM,
    totalLancamentosADM,
  } = useFinanceiro();

  // Local filter state (initialized from global)
  const [localAno, setLocalAno] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const [localMes, setLocalMes] = useState(filtroMesInicial || new Date().getMonth() + 1);

  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const zooOficial = useIndicadoresZootecnicos(
    fazendaId, anoAtual, mesAtual,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  // Available years from lancamentos
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(anoAtual));
    if (filtroAnoInicial) anos.add(filtroAnoInicial);
    lancamentos.forEach(l => {
      if (l.data_pagamento && l.data_pagamento.length >= 4) {
        anos.add(l.data_pagamento.substring(0, 4));
      }
      if (l.ano_mes && l.ano_mes.length >= 4) {
        anos.add(l.ano_mes.substring(0, 4));
      }
    });
    return Array.from(anos).sort().reverse();
  }, [lancamentos, anoAtual, filtroAnoInicial]);

  const tabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'fluxo', label: 'Fluxo', icon: '💰' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'analise', label: 'Análise', icon: '📈' },
    ...(fazendaADM ? [{ id: 'rateio' as SubTab, label: 'Rateio ADM', icon: '🏢' }] : []),
    { id: 'importacao', label: 'Importação', icon: '📥' },
  ];

  const gridCols = `grid-cols-${tabs.length}`;

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-20">
      {subTab !== 'fluxo' && (
        <div className="p-4 space-y-3">
          <div className={`grid ${gridCols} gap-1 bg-muted rounded-lg p-1`}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`py-2 px-2 rounded-md text-xs font-bold transition-colors touch-target ${
                  subTab === t.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'fluxo' && (
            <FluxoFinanceiro
              lancamentos={lancamentos}
              rateioADM={rateioADM}
              ano={Number(localAno)}
              mesAte={localMes}
              onAnoChange={setLocalAno}
              onMesChange={setLocalMes}
              anosDisponiveis={anosDisponiveis}
              onBack={onBack}
            />
          )}
          {subTab === 'dashboard' && (
            <div className="p-4">
              <DashboardFinanceiro
                lancamentos={lancamentos}
                indicadores={indicadores}
                lancamentosPecuarios={lancamentosPecuarios}
                saldosIniciais={saldosIniciais}
                rateioADM={rateioADM}
                isGlobal={isGlobal}
                fazendasSemArea={fazendasSemRebanho}
                pastos={pastos}
                categorias={categorias}
                fazendaId={fazendaId}
              />
            </div>
          )}
          {subTab === 'analise' && (
            <div className="p-4">
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
            </div>
          )}
          {subTab === 'rateio' && (
            <div className="p-4">
              <RateioADMConferenciaView
                conferencia={rateioConferencia}
                fazendasSemRebanho={fazendasSemRebanho}
                totalLancamentosADM={totalLancamentosADM}
              />
            </div>
          )}
          {subTab === 'importacao' && (
            <div className="p-4">
              <ImportacaoFinanceira
                importacoes={importacoes}
                centrosCusto={centrosCusto}
                fazendas={fazendaMapForImport}
                onConfirmar={confirmarImportacao}
                onExcluir={excluirImportacao}
              />
            </div>
          )}
        </>
      )}

      {/* Sub-tab switcher shown at bottom of fluxo view */}
      {subTab === 'fluxo' && (
        <div className="px-4 pb-4">
          <div className="flex gap-2 flex-wrap">
            {tabs.filter(t => t.id !== 'fluxo').map(t => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
