import { useState, useCallback, useMemo } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { ZootecnicoTab } from './ZootecnicoTab';
import { ZootecnicoHubTab } from './ZootecnicoHubTab';
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
  resumo: 'Controle de Rebanho',
  zootecnico: 'Painel Zootécnico',
  zootecnico_hub: 'Zootécnico',
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
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [subAbaFinanceiro, setSubAbaFinanceiro] = useState<SubAba | undefined>(undefined);
  const [lancamentosFromConciliacao, setLancamentosFromConciliacao] = useState(false);
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

  const handleTabChange = useCallback((tab: TabId, filtro?: { ano: string; mes: number }) => {
    if (filtro) {
      setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    }
    if (tab !== 'financeiro') setSubAbaFinanceiro(undefined);
    if (tab !== 'lancamentos') setLancamentosFromConciliacao(false);
    if (tab !== 'fechamento') setFechamentoFromConciliacao(false);
    setActiveTab(tab);
  }, []);

  const goToResumo = useCallback(() => setActiveTab('resumo'), []);
  const goToZootecnicoHub = useCallback(() => setActiveTab('zootecnico_hub'), []);
  const goToZootecnico = useCallback(() => setActiveTab('zootecnico'), []);
  const goToConciliacaoCategoria = useCallback(() => setActiveTab('conciliacao_categoria'), []);
  const goToReclassFromConciliacao = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setLancamentosFromConciliacao(true);
    setActiveTab('lancamentos');
  }, []);
  const [fechamentoFromConciliacao, setFechamentoFromConciliacao] = useState(false);
  const goToFechamentoFromConciliacao = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setFechamentoFromConciliacao(true);
    setActiveTab('fechamento');
  }, []);

  // Sub-screens that need a back button
  const subScreenBackMap: Partial<Record<TabId, () => void>> = {
    zootecnico: goToZootecnicoHub,
    analise_economica: goToResumo,
    fin_caixa: goToResumo,
    valor_rebanho: goToZootecnico,
    conciliacao_categoria: goToZootecnico,
    visao_anual_zoo: goToZootecnicoHub,
  };

  const fazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || '');
  const mesLabel = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][filtroGlobal.mes] || '';
  const periodoLabel = `${mesLabel}/${filtroGlobal.ano}`;

  return (
    <div className="min-h-screen bg-background">
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      <Header
        title={TITLES[activeTab]}
        fazendaNome={fazendaNome}
        periodo={periodoLabel}
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
      {activeTab === 'zootecnico_hub' && (
        <ZootecnicoHubTab onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'zootecnico' && (
        <ZootecnicoTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToZootecnicoHub}
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
          onBack={goToZootecnico}
          onNavigateToReclass={goToReclassFromConciliacao}
          onNavigateToFechamento={goToFechamentoFromConciliacao}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'fin_caixa' && (
        <FinanceiroCaixaTab
          lancamentosPecuarios={lancamentos}
          saldosIniciais={saldosIniciais}
          onBack={goToResumo}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'analise_economica' && (
        <AnaliseEconomicaTab
          lancamentosPecuarios={lancamentos}
          saldosIniciais={saldosIniciais}
          onBack={goToResumo}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

export default Index;
