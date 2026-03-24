/**
 * Módulo Financeiro — container principal com sub-abas.
 * Fase 1: Importação + Dashboard + Rateio ADM v1.
 *
 * Arquitetura: dados zootécnicos vêm exclusivamente de useIndicadoresZootecnicos.
 * Nenhum cálculo paralelo de saldos/pesos/arrobas é feito aqui.
 */
import { useState, useMemo } from 'react';
import { ImportacaoFinanceira } from '@/components/financeiro/ImportacaoFinanceira';
import { DashboardFinanceiro } from '@/components/financeiro/DashboardFinanceiro';
import { RateioADMConferenciaView } from '@/components/financeiro/RateioADMConferencia';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { Loader2 } from 'lucide-react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';

type SubTab = 'dashboard' | 'rateio' | 'importacao';

interface Props {
  /** Lançamentos pecuários COMPLETOS (incluindo transferências) — para cálculos zootécnicos */
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
}

export function FinanceiroCaixaTab({ lancamentosPecuarios = [], saldosIniciais = [] }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');
  const { fazendaAtual } = useFazenda();
  const { pastos, categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;
  const {
    importacoes, lancamentos, centrosCusto, indicadores,
    rateioADM, rateioConferencia, fazendasSemArea, fazendaMapForImport,
    loading, confirmarImportacao, excluirImportacao, isGlobal, fazendaADM,
  } = useFinanceiro();

  // Dados zootécnicos oficiais — FONTE ÚNICA
  // Nota: o hook recebe ano/mes dinâmicos, mas o Dashboard controla o período.
  // Passamos o hook com todos os meses possíveis; o Dashboard vai filtrar internamente.
  // Para o hook, usamos o ano/mês correntes como default.
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const zooOficial = useIndicadoresZootecnicos(
    fazendaId, anoAtual, mesAtual,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

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
              lancamentosPecuarios={lancamentosPecuarios}
              saldosIniciais={saldosIniciais}
              rateioADM={rateioADM}
              isGlobal={isGlobal}
              fazendasSemArea={fazendasSemArea}
              pastos={pastos}
              categorias={categorias}
              fazendaId={fazendaId}
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
              fazendas={fazendaMapForImport}
              onConfirmar={confirmarImportacao}
              onExcluir={excluirImportacao}
            />
          )}
        </>
      )}
    </div>
  );
}
