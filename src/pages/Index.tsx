import { useState, useCallback, useMemo } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { ZootecnicoTab } from './ZootecnicoTab';
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
import { ConciliacaoHubTab } from './ConciliacaoHubTab';
import { ValorRebanhoTab } from './ValorRebanhoTab';
import { ConciliacaoCategoriaTab } from './ConciliacaoCategoriaTab';

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
  zootecnico: 'Zootécnico',
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
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [subAbaFinanceiro, setSubAbaFinanceiro] = useState<SubAba | undefined>(undefined);
  const [lancamentosFromConciliacao, setLancamentosFromConciliacao] = useState(false);
  const { user } = useAuth();
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, setSaldoInicial, loadData } = useLancamentos();
  const { pendingCount, syncing, online, syncQueue } = useOfflineSync(fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id, loadData);

  // ── Filtro Global (ano + mês) ──
  const [filtroGlobal, setFiltroGlobal] = useState<FiltroGlobal>({
    ano: String(new Date().getFullYear()),
    mes: new Date().getMonth() + 1,
  });

  const handleFiltroChange = useCallback((f: Partial<FiltroGlobal>) => {
    setFiltroGlobal(prev => ({ ...prev, ...f }));
  }, []);

  const papel = fazendaAtual?.papel;
  const isDono = fazendaAtual?.owner_id === user?.id;
  const isDonoOuGerente = isDono || papel === 'gerente';

  const lancamentosVisiveis = useMemo(() => {
    if (!isGlobal) return lancamentos;
    return lancamentos.filter(l => l.tipo !== 'transferencia_entrada' && l.tipo !== 'transferencia_saida');
  }, [lancamentos, isGlobal]);

  const navigateToMovimentacao = useCallback((subAba: SubAba) => {
    setSubAbaFinanceiro(subAba);
    setActiveTab('financeiro');
  }, []);

  const handleTabChange = useCallback((tab: TabId) => {
    if (tab !== 'financeiro') setSubAbaFinanceiro(undefined);
    if (tab !== 'lancamentos') setLancamentosFromConciliacao(false);
    setActiveTab(tab);
  }, []);

  const goToResumo = useCallback(() => setActiveTab('resumo'), []);
  const goToZootecnico = useCallback(() => setActiveTab('zootecnico'), []);
  const goToConciliacaoCategoria = useCallback(() => setActiveTab('conciliacao_categoria'), []);
  const goToReclassFromConciliacao = useCallback(() => {
    setLancamentosFromConciliacao(true);
    setActiveTab('lancamentos');
  }, []);

  // Hide header for sub-screens that have their own back nav
  const isSubScreen = ['zootecnico', 'analise_economica', 'fin_caixa', 'valor_rebanho', 'conciliacao_categoria'].includes(activeTab);

  const headerTitle = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || TITLES[activeTab]);

  return (
    <div className="min-h-screen bg-background">
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      {!isSubScreen && (
        <Header
          title={headerTitle}
          rightAction={
            <div className="flex items-center gap-2">
              {fazendas.length > 1 && <FazendaSelector />}
            </div>
          }
        />
      )}

      {activeTab === 'resumo' && (
        <ResumoTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onTabChange={handleTabChange}
          filtroGlobal={filtroGlobal}
          onFiltroChange={handleFiltroChange}
        />
      )}
      {activeTab === 'zootecnico' && (
        <ZootecnicoTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToResumo}
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
      {activeTab === 'conciliacao' && <ConciliacaoHubTab />}
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
          filtroAnoInicial={filtroGlobal.ano}
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
