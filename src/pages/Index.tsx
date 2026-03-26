import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { IndicadoresZooTab } from './ZootecnicoTab';
import { StatusZootecnicoTab } from './StatusZootecnicoTab';
import { LancarZooHubTab } from './LancarZooHubTab';
import { VisaoZooHubTab } from './VisaoZooHubTab';
import { LancarFinHubTab } from './LancarFinHubTab';
import { VisaoFinHubTab } from './VisaoFinHubTab';
import { MovimentacaoTab } from './MovimentacaoTab';
import { LancamentosTab } from './LancamentosTab';
import { FluxoAnualTab } from './FluxoAnualTab';
import { FinanceiroTab, type SubAba } from './FinanceiroTab';
import { FinanceiroCaixaTab } from './FinanceiroCaixaTab';
import { AnaliseEconomicaTab } from './AnaliseEconomicaTab';
import { AcessosTab } from './AcessosTab';
import { AnaliseTab } from './AnaliseTab';
import { AnaliseEntradasTab } from './AnaliseEntradasTab';
import { AnaliseSaidasTab } from './AnaliseSaidasTab';
import { DesfrunteTab } from './DesfrunteTab';
import { CadastrosTab } from './CadastrosTab';
import { ConciliacaoTab } from './ConciliacaoTab';
import { FechamentoTab } from './FechamentoTab';
import { MapaPastosTab } from './MapaPastosTab';
import { ResumoPastosTab } from './ResumoPastosTab';
import { AnaliseOperacionalTab } from './AnaliseOperacionalTab';
import { ValorRebanhoTab } from './ValorRebanhoTab';
import { ConciliacaoCategoriaTab } from './ConciliacaoCategoriaTab';
import { ChuvasTab } from './ChuvasTab';
import { VisaoAnualZootecnicaTab } from './VisaoAnualZootecnicaTab';

import { FazendaSelector } from '@/components/FazendaSelector';
import { SyncStatus } from '@/components/SyncStatus';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';

export interface FiltroGlobal {
  ano: string;
  mes: number;
}

const TITLES: Record<TabId, string> = {
  resumo: 'Resumo Executivo',
  zootecnico: 'Status Zootécnico',
  zootecnico_hub: 'Zootécnico',
  lancar_zoo_hub: 'Lançar Zootécnico',
  visao_zoo_hub: 'Visão Zootécnico',
  lancar_fin_hub: 'Lançar Financeiro',
  visao_fin_hub: 'Visão Financeiro',
  movimentacao: 'Fluxo Mensal',
  lancamentos: 'Lançar Rebanho',
  financeiro: 'Movimentações',
  evolucao: 'Categorias por Mês',
  evolucao_categoria: 'Evolução por Categoria',
  fluxo_anual: 'Evolução Rebanho',
  acessos: 'Acessos',
  analise: 'Análise Gráfica',
  analise_entradas: 'Análise de Entradas',
  analise_saidas: 'Análise de Saídas',
  analise_economica: 'Econômico',
  desfrute: 'Desfrute',
  cadastros: 'Cadastros',
  chuvas: 'Chuvas',
  pastos: 'Pastos',
  conciliacao: 'Conciliação',
  fin_caixa: 'Financeiro',
  valor_rebanho: 'Valor do Rebanho',
  conciliacao_categoria: 'Conciliação de Categoria',
  analise_operacional: 'Análise Operacional',
  fechamento: 'Lançamento de Pasto',
  mapa_pastos: 'Mapa de Pastos',
  resumo_pastos: 'Resumo de Pastos',
  visao_anual_zoo: 'Visão Anual Zootécnica',
  indicadores: 'Indicadores',
  evolucao_rebanho_hub: 'Evolução Rebanho',
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [subAbaFinanceiro, setSubAbaFinanceiro] = useState<SubAba | undefined>(undefined);
  const [lancamentosFromConciliacao, setLancamentosFromConciliacao] = useState(false);
  const [fechamentoFromConciliacao, setFechamentoFromConciliacao] = useState(false);
  const { user } = useAuth();
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, setSaldoInicial, loadData } = useLancamentos();
  const { pendingCount, syncing, online, syncQueue } = useOfflineSync(fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id, loadData);

  const [filtroGlobal, setFiltroGlobal] = useState<FiltroGlobal>({
    ano: String(new Date().getFullYear()),
    mes: new Date().getMonth() + 1,
  });

  const handleFiltroChange = useCallback((f: Partial<FiltroGlobal>) => {
    setFiltroGlobal(prev => ({ ...prev, ...f }));
  }, []);

  const lancamentosVisiveis = useMemo(() => {
    if (!isGlobal) return lancamentos;
    return lancamentos.filter(l => l.tipo !== 'transferencia_entrada' && l.tipo !== 'transferencia_saida');
  }, [lancamentos, isGlobal]);

  const navigateToMovimentacao = useCallback((subAba: SubAba) => {
    setSubAbaFinanceiro(subAba);
    setActiveTab('financeiro');
  }, []);

  // Tabs operacionais bloqueadas no modo Global
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao_categoria', 'conciliacao', 'lancamentos'];

  const handleTabChange = useCallback((tab: TabId, filtro?: { ano: string; mes: number }) => {
    if (isGlobal && BLOCKED_TABS_GLOBAL.includes(tab)) {
      toast.info('Selecione uma fazenda para acessar esta funcionalidade');
      return;
    }
    if (filtro) {
      setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    }
    if (tab !== 'financeiro') setSubAbaFinanceiro(undefined);
    if (tab !== 'lancamentos') setLancamentosFromConciliacao(false);
    if (tab !== 'fechamento') setFechamentoFromConciliacao(false);
    setActiveTab(tab);
  }, [isGlobal]);

  const goToResumo = useCallback(() => setActiveTab('resumo'), []);
  const goToLancarZooHub = useCallback(() => setActiveTab('lancar_zoo_hub'), []);
  const goToVisaoZooHub = useCallback(() => setActiveTab('visao_zoo_hub'), []);
  const goToLancarFinHub = useCallback(() => setActiveTab('lancar_fin_hub'), []);
  const goToVisaoFinHub = useCallback(() => setActiveTab('visao_fin_hub'), []);
  const goToZootecnico = useCallback(() => setActiveTab('zootecnico'), []);
  const goToConciliacaoCategoria = useCallback(() => setActiveTab('conciliacao_categoria'), []);
  const goToReclassFromConciliacao = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setLancamentosFromConciliacao(true);
    setActiveTab('lancamentos');
  }, []);
  const goToFechamentoFromConciliacao = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setFechamentoFromConciliacao(true);
    setActiveTab('fechamento');
  }, []);

  // Sub-screens that need a back button
  const subScreenBackMap: Partial<Record<TabId, () => void>> = {
    zootecnico: goToVisaoZooHub,
    indicadores: goToVisaoZooHub,
    valor_rebanho: goToZootecnico,
    conciliacao_categoria: goToZootecnico,
    visao_anual_zoo: goToVisaoZooHub,
    analise_economica: goToVisaoFinHub,
    fin_caixa: goToLancarFinHub,
    fechamento: goToZootecnico,
  };

  const fazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || '');

  return (
    <div className="min-h-screen bg-background">
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      <Header
        title={TITLES[activeTab]}
        fazendaNome={fazendaNome}
        periodo={undefined}
        onBack={subScreenBackMap[activeTab]}
        rightAction={
          <div className="flex items-center gap-2">
            {fazendas.length > 1 && <FazendaSelector />}
          </div>
        }
      />

      {activeTab === 'resumo' && (
        <ResumoTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onTabChange={handleTabChange}
          filtroGlobal={filtroGlobal}
          onFiltroChange={handleFiltroChange}
        />
      )}

      {/* Hubs */}
      {activeTab === 'lancar_zoo_hub' && (
        <LancarZooHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'visao_zoo_hub' && (
        <VisaoZooHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'lancar_fin_hub' && (
        <LancarFinHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'visao_fin_hub' && (
        <VisaoFinHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}

      {/* Legacy hub kept for internal routing */}
      {activeTab === 'zootecnico_hub' && (
        <VisaoZooHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}

      {activeTab === 'zootecnico' && (
        <StatusZootecnicoTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToVisaoZooHub}
          onTabChange={handleTabChange}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'indicadores' && (
        <IndicadoresZooTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToVisaoZooHub}
          onTabChange={handleTabChange}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'movimentacao' && <MovimentacaoTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} />}
      {activeTab === 'lancamentos' && (
        <LancamentosTab
          lancamentos={lancamentosVisiveis}
          onAdicionar={isGlobal ? async () => {} : adicionarLancamento}
          onEditar={isGlobal ? async () => {} : editarLancamento}
          onRemover={isGlobal ? async () => {} : removerLancamento}
          abaInicial={lancamentosFromConciliacao ? 'reclassificacao' : undefined}
          onBackToConciliacao={lancamentosFromConciliacao ? goToConciliacaoCategoria : undefined}
          dataInicial={lancamentosFromConciliacao ? `${filtroGlobal.ano}-${String(filtroGlobal.mes).padStart(2, '0')}-15` : undefined}
        />
      )}
      {activeTab === 'fluxo_anual' && <FluxoAnualTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onNavigateToMovimentacao={navigateToMovimentacao} />}
      {activeTab === 'financeiro' && <FinanceiroTab lancamentos={lancamentosVisiveis} onEditar={isGlobal ? async () => {} : editarLancamento} onRemover={isGlobal ? async () => {} : removerLancamento} subAbaInicial={subAbaFinanceiro} />}
      {activeTab === 'acessos' && <AcessosTab />}
      {activeTab === 'analise' && <AnaliseTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} isGlobal={isGlobal} />}
      {activeTab === 'analise_entradas' && <AnaliseEntradasTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'analise_saidas' && <AnaliseSaidasTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'desfrute' && <DesfrunteTab lancamentos={isGlobal ? lancamentosVisiveis : lancamentos} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} isGlobal={isGlobal} />}
      {activeTab === 'cadastros' && <CadastrosTab />}
      {activeTab === 'chuvas' && <ChuvasTab />}
      {activeTab === 'fechamento' && (
        <FechamentoTab
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
          onBackToConciliacao={fechamentoFromConciliacao ? goToConciliacaoCategoria : undefined}
        />
      )}
      {activeTab === 'mapa_pastos' && <MapaPastosTab />}
      {activeTab === 'resumo_pastos' && <ResumoPastosTab />}
      {activeTab === 'analise_operacional' && <AnaliseOperacionalTab />}
      {activeTab === 'visao_anual_zoo' && (
        <VisaoAnualZootecnicaTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToVisaoZooHub}
          onTabChange={handleTabChange}
          filtroAnoInicial={filtroGlobal.ano}
        />
      )}
      {activeTab === 'conciliacao' && <ConciliacaoTab filtroAnoInicial={filtroGlobal.ano} filtroMesInicial={filtroGlobal.mes} />}
      {activeTab === 'valor_rebanho' && (
        <ValorRebanhoTab
          lancamentos={lancamentos}
          saldosIniciais={saldosIniciais}
          onBack={goToZootecnico}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'conciliacao_categoria' && (
        <ConciliacaoCategoriaTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToVisaoZooHub}
          onNavigateToReclass={goToReclassFromConciliacao}
          onNavigateToFechamento={goToFechamentoFromConciliacao}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'fin_caixa' && (
        <FinanceiroCaixaTab
          lancamentosPecuarios={lancamentos}
          saldosIniciais={saldosIniciais}
          onBack={goToLancarFinHub}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'analise_economica' && (
        <AnaliseEconomicaTab
          lancamentosPecuarios={lancamentos}
          saldosIniciais={saldosIniciais}
          onBack={goToVisaoFinHub}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

export default Index;
