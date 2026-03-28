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
import { EvolucaoRebanhoHubTab } from './EvolucaoRebanhoHubTab';
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
import { ClienteSelector } from '@/components/ClienteSelector';
import { SyncStatus } from '@/components/SyncStatus';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

export interface FiltroGlobal {
  ano: string;
  mes: number;
}

const TITLES: Record<TabId, string> = {
  resumo: 'Resumo Executivo',
  zootecnico: 'Status Zootécnico',
  zootecnico_hub: 'Zootécnico',
  lancar_zoo_hub: 'Lançamentos',
  visao_zoo_hub: 'Análises',
  lancar_fin_hub: 'Análise Operacional',
  visao_fin_hub: 'Visão Financeiro',
  movimentacao: 'Movimentações',
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
  const [movFiltroAno, setMovFiltroAno] = useState<string | undefined>(undefined);
  const [movFiltroMes, setMovFiltroMes] = useState<string | undefined>(undefined);
  const [movDrillLabel, setMovDrillLabel] = useState<string | undefined>(undefined);
  const [movBackTab, setMovBackTab] = useState<TabId | undefined>(undefined);
  const [lancamentosFromConciliacao, setLancamentosFromConciliacao] = useState(false);
  const [fechamentoFromConciliacao, setFechamentoFromConciliacao] = useState(false);
  const { user } = useAuth();
  const { canViewTab, canEdit, isReadOnly } = usePermissions();
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { clientes, clienteAtual } = useCliente();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, setSaldoInicial, loadData } = useLancamentos();
  const { pendingCount, syncing, online, syncQueue } = useOfflineSync(fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id, loadData);

  // Wrap edit actions based on permissions
  const noOp = async () => {};
  const canEditZoo = canEdit('zootecnico') && !isGlobal;
  const canEditFin = canEdit('financeiro') && !isGlobal;
  const wrappedAdicionar = canEditZoo ? adicionarLancamento : noOp;
  const wrappedEditar = canEditZoo ? editarLancamento : noOp;
  const wrappedRemover = canEditZoo ? removerLancamento : noOp;

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

  const navigateToMovimentacao = useCallback((subAba: SubAba, opts?: { ano?: string; mes?: string; label?: string; backTab?: TabId }) => {
    setSubAbaFinanceiro(subAba);
    setMovFiltroAno(opts?.ano);
    setMovFiltroMes(opts?.mes);
    setMovDrillLabel(opts?.label);
    setMovBackTab(opts?.backTab);
    setActiveTab('financeiro');
  }, []);

  // Tabs operacionais bloqueadas no modo Global
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao_categoria', 'conciliacao', 'lancamentos'];

  const handleTabChange = useCallback((tab: TabId, filtro?: { ano: string; mes: number }) => {
    if (isGlobal && BLOCKED_TABS_GLOBAL.includes(tab)) {
      toast.info('Selecione uma fazenda para acessar esta funcionalidade');
      return;
    }
    if (!canViewTab(tab)) {
      toast.info('Seu perfil não tem acesso a esta funcionalidade');
      return;
    }
    if (filtro) {
      setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    }
    if (tab !== 'financeiro') {
      setSubAbaFinanceiro(undefined);
      setMovFiltroAno(undefined);
      setMovFiltroMes(undefined);
      setMovDrillLabel(undefined);
      setMovBackTab(undefined);
    }
    if (tab !== 'lancamentos') setLancamentosFromConciliacao(false);
    if (tab !== 'fechamento') setFechamentoFromConciliacao(false);
    setActiveTab(tab);
  }, [isGlobal, canViewTab]);

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
    valor_rebanho: () => setActiveTab('fluxo_anual'),
    conciliacao_categoria: goToZootecnico,
    visao_anual_zoo: goToVisaoZooHub,
    analise_economica: goToVisaoFinHub,
    fin_caixa: goToLancarFinHub,
    fechamento: goToZootecnico,
    evolucao_rebanho_hub: goToLancarZooHub,
    fluxo_anual: () => setActiveTab('movimentacao'),
  };

  const clienteNomeHeader = clientes.length > 1 ? (clienteAtual?.nome || '') : '';
  const fazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || '');

  return (
    <div className="h-screen flex flex-col bg-background max-w-[1400px] mx-auto px-4 md:px-6">
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      <Header
        title={TITLES[activeTab]}
        clienteNome={clienteNomeHeader}
        fazendaNome={fazendaNome}
        periodo={undefined}
        onBack={subScreenBackMap[activeTab]}
        rightAction={
          <div className="flex flex-col gap-1">
            {clientes.length > 1 && <ClienteSelector />}
            {fazendas.length > 1 && <FazendaSelector />}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
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
        <VisaoZooHubTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'lancar_fin_hub' && (
        <LancarFinHubTab
          onTabChange={handleTabChange}
          filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }}
          lancamentosPecuarios={lancamentos}
          saldosIniciais={saldosIniciais}
        />
      )}
      {activeTab === 'visao_fin_hub' && (
        <VisaoFinHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}

      {/* Legacy hub kept for internal routing */}
      {activeTab === 'zootecnico_hub' && (
        <VisaoZooHubTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
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
      {activeTab === 'movimentacao' && (
        <MovimentacaoTab onNavigate={(dest) => {
          if (dest === 'tipos') setActiveTab('financeiro');
          if (dest === 'resumo') setActiveTab('fluxo_anual');
        }} />
      )}
      {activeTab === 'lancamentos' && (
        <LancamentosTab
          lancamentos={lancamentosVisiveis}
          onAdicionar={wrappedAdicionar as any}
          onEditar={wrappedEditar as any}
          onRemover={wrappedRemover as any}
          abaInicial={lancamentosFromConciliacao ? 'reclassificacao' : undefined}
          onBackToConciliacao={lancamentosFromConciliacao ? goToConciliacaoCategoria : undefined}
          dataInicial={lancamentosFromConciliacao ? `${filtroGlobal.ano}-${String(filtroGlobal.mes).padStart(2, '0')}-15` : undefined}
        />
      )}
      {activeTab === 'fluxo_anual' && <FluxoAnualTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onNavigateToMovimentacao={navigateToMovimentacao} onNavigateToValorRebanho={() => setActiveTab('valor_rebanho')} />}
      {activeTab === 'evolucao_rebanho_hub' && (
        <EvolucaoRebanhoHubTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onNavigateToMovimentacao={navigateToMovimentacao}
          onEditar={wrappedEditar as any}
          onRemover={wrappedRemover as any}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'financeiro' && (
        <FinanceiroTab
          lancamentos={lancamentosVisiveis}
          onEditar={wrappedEditar as any}
          onRemover={wrappedRemover as any}
          subAbaInicial={subAbaFinanceiro}
          filtroAnoInicial={movFiltroAno}
          filtroMesInicial={movFiltroMes}
          drillDownLabel={movDrillLabel}
          onBack={movBackTab ? () => setActiveTab(movBackTab) : undefined}
        />
      )}
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
      {activeTab === 'resumo_pastos' && <ResumoPastosTab onTabChange={handleTabChange} />}
      {activeTab === 'analise_operacional' && <AnaliseOperacionalTab onNavigateToMovimentacao={navigateToMovimentacao} />}
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
      </div>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

export default Index;
