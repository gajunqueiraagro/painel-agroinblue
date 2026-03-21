import { useState, useCallback, useMemo } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { Header } from '@/components/Header';
import { ResumoTab } from './ResumoTab';
import { MovimentacaoTab } from './MovimentacaoTab';
import { LancamentosTab } from './LancamentosTab';
import { EvolucaoTab } from './EvolucaoTab';
import { EvolucaoCategoriaTab } from './EvolucaoCategoriaTab';
import { FluxoAnualTab } from './FluxoAnualTab';
import { FinanceiroTab, type SubAba } from './FinanceiroTab';
import { AcessosTab } from './AcessosTab';
import { AnaliseTab } from './AnaliseTab';
import { AnaliseEntradasTab } from './AnaliseEntradasTab';
import { AnaliseSaidasTab } from './AnaliseSaidasTab';
import { DesfrunteTab } from './DesfrunteTab';
import { CadastrosTab } from './CadastrosTab';
import { ChuvasTab } from './ChuvasTab';

import { SaldoInicialForm } from '@/components/SaldoInicialForm';
import { ExportMenu } from '@/components/ExportMenu';
import { FazendaSelector } from '@/components/FazendaSelector';
import { SyncStatus } from '@/components/SyncStatus';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';

const TITLES: Record<TabId, string> = {
  resumo: 'Controle de Rebanho',
  movimentacao: 'Fluxo Mensal',
  lancamentos: 'Lançamentos',
  financeiro: 'Movimentações',
  evolucao: 'Categorias por Mês',
  evolucao_categoria: 'Evolução por Categoria',
  fluxo_anual: 'Fluxo Anual',
  acessos: 'Acessos',
  analise: 'Análise Gráfica',
  analise_entradas: 'Análise de Entradas',
  analise_saidas: 'Análise de Saídas',
  desfrute: 'Desfrute',
  cadastros: 'Cadastros',
  chuvas: 'Chuvas',
};

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('resumo');
  const [subAbaFinanceiro, setSubAbaFinanceiro] = useState<SubAba | undefined>(undefined);
  const { user } = useAuth();
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, setSaldoInicial, loadData } = useLancamentos();
  const { pendingCount, syncing, online, syncQueue } = useOfflineSync(fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id, loadData);

  const papel = fazendaAtual?.papel;
  const isDono = fazendaAtual?.owner_id === user?.id;
  const isDonoOuGerente = isDono || papel === 'gerente';

  // In global mode, filter out internal transfers (transferencia_entrada and transferencia_saida)
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
    setActiveTab(tab);
  }, []);

  const headerTitle = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || TITLES[activeTab]);

  return (
    <div className="min-h-screen bg-background">
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      <Header
        title={headerTitle}
        rightAction={
          <div className="flex items-center gap-2">
            {activeTab === 'resumo' && !isGlobal && (
              <>
                <ExportMenu lancamentos={lancamentos} saldosIniciais={saldosIniciais} />
                {isDonoOuGerente && <SaldoInicialForm saldosIniciais={saldosIniciais} onSetSaldo={setSaldoInicial} />}
              </>
            )}
            {fazendas.length > 1 && <FazendaSelector />}
          </div>
        }
      />

      {activeTab === 'resumo' && <ResumoTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'movimentacao' && <MovimentacaoTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} />}
      {activeTab === 'lancamentos' && (
        <LancamentosTab
          lancamentos={lancamentosVisiveis}
          onAdicionar={isGlobal ? async () => {} : adicionarLancamento}
          onEditar={isGlobal ? async () => {} : editarLancamento}
          onRemover={isGlobal ? async () => {} : removerLancamento}
        />
      )}
      {activeTab === 'evolucao' && <EvolucaoTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} />}
      {activeTab === 'evolucao_categoria' && <EvolucaoCategoriaTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} />}
      {activeTab === 'fluxo_anual' && <FluxoAnualTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onNavigateToMovimentacao={navigateToMovimentacao} />}
      {activeTab === 'financeiro' && <FinanceiroTab lancamentos={lancamentosVisiveis} onEditar={isGlobal ? async () => {} : editarLancamento} onRemover={isGlobal ? async () => {} : removerLancamento} subAbaInicial={subAbaFinanceiro} />}
      {activeTab === 'acessos' && <AcessosTab />}
      {activeTab === 'analise' && <AnaliseTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'analise_entradas' && <AnaliseEntradasTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'analise_saidas' && <AnaliseSaidasTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'desfrute' && <DesfrunteTab lancamentos={isGlobal ? lancamentosVisiveis : lancamentos} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} isGlobal={isGlobal} />}
      {activeTab === 'cadastros' && <CadastrosTab />}

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

export default Index;
