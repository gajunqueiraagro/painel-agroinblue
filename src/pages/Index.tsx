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
import { OperacaoHubTab } from './OperacaoHubTab';
import { PainelConsultorTab } from './PainelConsultorTab';
import { AnaliseEntradasTab } from './AnaliseEntradasTab';
import { AnaliseSaidasTab } from './AnaliseSaidasTab';
import { DesfrunteTab } from './DesfrunteTab';
import { CadastrosTab } from './CadastrosTab';
import { ConciliacaoTab } from './ConciliacaoTab';
import { FechamentoTab } from './FechamentoTab';
import { MapaPastosTab } from './MapaPastosTab';
import { MapaGeoPastosTab } from './MapaGeoPastosTab';
import { ResumoPastosTab } from './ResumoPastosTab';
import { AnaliseOperacionalTab } from './AnaliseOperacionalTab';
import { ValorRebanhoTab } from './ValorRebanhoTab';

import { ChuvasTab } from './ChuvasTab';
import { VisaoAnualZootecnicaTab } from './VisaoAnualZootecnicaTab';
import { FechamentoExecutivoTab } from './FechamentoExecutivoTab';
import { AnaliseConsultorTab } from './AnaliseConsultorTab';
import { PrecoMercadoTab } from './PrecoMercadoTab';
import { GraficosAnaliseTab } from './GraficosAnaliseTab';
import { FinanceiroV2Tab } from './FinanceiroV2Tab';
import { FinanceiroV2HubTab } from './FinanceiroV2HubTab';
import { FinV2ContasTab } from './FinV2ContasTab';
import { FinV2FornecedoresTab } from './FinV2FornecedoresTab';
import { FinV2PlanoContasTab } from './FinV2PlanoContasTab';
import { FinV2SaldosTab } from './FinV2SaldosTab';
import { ContratosTab } from './ContratosTab';
import { ConciliacaoBancariaTab } from './ConciliacaoBancariaTab';
import { ClienteSelector } from '@/components/ClienteSelector';
import { AuditoriaTab } from './AuditoriaTab';
import { ContaBoitelTab } from './ContaBoitelTab';
import { StatusFechamentosTab } from './StatusFechamentosTab';
import { FazendaSelector } from '@/components/FazendaSelector';
import { SyncStatus } from '@/components/SyncStatus';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Lancamento } from '@/types/cattle';

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
  analise: 'Operação',
  operacao_hub: 'Operação',
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
  
  analise_operacional: 'Análise Operacional',
  fechamento: 'Lançamento de Pasto',
  mapa_pastos: 'Mapa de Pastos',
  mapa_geo_pastos: 'Mapa Geográfico',
  resumo_pastos: 'Resumo de Pastos',
  visao_anual_zoo: 'Visão Anual Zootécnica',
  indicadores: 'Indicadores',
  evolucao_rebanho_hub: 'Evolução Rebanho',
  fechamento_executivo: 'Fechamento Executivo',
  analise_consultor: 'Análise do Consultor',
  preco_mercado: 'Preço de Mercado',
  graficos_analise: 'Gráficos',
  financeiro_v2: 'Financeiro v2',
  financeiro_v2_hub: 'Financeiro v2',
  fin_v2_contas: 'Contas Bancárias',
  fin_v2_fornecedores: 'Fornecedores',
  fin_v2_plano: 'Plano de Contas',
  fin_v2_saldos: 'Saldos Mensais',
  contratos: 'Contratos / Recorrências',
  conciliacao_bancaria: 'Conciliação Bancária',
  painel_consultor: 'Painel do Consultor',
  auditoria: 'Central de Auditoria',
  conta_boitel: 'Conta Boitel',
  status_fechamentos: 'Central de Fechamento',
};

const Index = () => {
  const [activeTab, setActiveTabRaw] = useState<TabId>(() => {
    const saved = sessionStorage.getItem('agroinblue_active_tab');
    return (saved && saved in TITLES) ? saved as TabId : 'resumo';
  });
  const setActiveTab = useCallback((tab: TabId) => {
    sessionStorage.setItem('agroinblue_active_tab', tab);
    setActiveTabRaw(tab);
  }, []);
  const [subAbaFinanceiro, setSubAbaFinanceiro] = useState<SubAba | undefined>(undefined);
  const [movFiltroAno, setMovFiltroAno] = useState<string | undefined>(undefined);
  const [movFiltroMes, setMovFiltroMes] = useState<string | undefined>(undefined);
  const [movDrillLabel, setMovDrillLabel] = useState<string | undefined>(undefined);
  const [movBackTab, setMovBackTab] = useState<TabId | undefined>(undefined);
  const [lancamentosFromConciliacao, setLancamentosFromConciliacao] = useState(false);
  const [conciliacaoContext, setConciliacaoContext] = useState<{ ano: string; mes: string; contaId: string } | null>(null);
  const [fechamentoFromConciliacao, setFechamentoFromConciliacao] = useState(false);
  const [lancamentosFromFechamento, setLancamentosFromFechamento] = useState(false);
  const [lancamentosFromEvolCategoria, setLancamentosFromEvolCategoria] = useState(false);
  const [lancamentosFromFluxoAnual, setLancamentosFromFluxoAnual] = useState(false);
  const [abateParaEditar, setAbateParaEditar] = useState<Lancamento | null>(null);
  const [vendaParaEditar, setVendaParaEditar] = useState<Lancamento | null>(null);
  const [compraParaEditar, setCompraParaEditar] = useState<Lancamento | null>(null);
  const [editOriginTab, setEditOriginTab] = useState<TabId | null>(null);
  const [editOriginSubAba, setEditOriginSubAba] = useState<SubAba | undefined>(undefined);
  const [editOriginStatusFiltro, setEditOriginStatusFiltro] = useState<string | undefined>(undefined);
  const [editOriginAnoFiltro, setEditOriginAnoFiltro] = useState<string | undefined>(undefined);
  const [editOriginMesFiltro, setEditOriginMesFiltro] = useState<string | undefined>(undefined);
  const { user } = useAuth();
  const { canViewTab, canEdit, isReadOnly } = usePermissions();
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { clientes, clienteAtual } = useCliente();
  const { lancamentos, saldosIniciais, adicionarLancamento, editarLancamento, removerLancamento, countFinanceirosVinculados, setSaldoInicial, loadData } = useLancamentos();
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
  const BLOCKED_TABS_GLOBAL: TabId[] = ['fechamento', 'conciliacao', 'lancamentos'];

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
    if (tab !== 'lancamentos') {
      setLancamentosFromConciliacao(false);
      setLancamentosFromFechamento(false);
      setLancamentosFromEvolCategoria(false);
      setLancamentosFromFluxoAnual(false);
      setAbateParaEditar(null);
      setVendaParaEditar(null);
      setCompraParaEditar(null);
      setEditOriginTab(null);
      setEditOriginSubAba(undefined);
      setEditOriginStatusFiltro(undefined);
      setEditOriginAnoFiltro(undefined);
      setEditOriginMesFiltro(undefined);
    }
    if (tab !== 'fechamento') setFechamentoFromConciliacao(false);
    setActiveTab(tab);
  }, [isGlobal, canViewTab]);

  const goToResumo = useCallback(() => setActiveTab('resumo'), []);
  const goToLancarZooHub = useCallback(() => setActiveTab('lancar_zoo_hub'), []);
  const goToVisaoZooHub = useCallback(() => setActiveTab('visao_zoo_hub'), []);
  const goToLancarFinHub = useCallback(() => setActiveTab('lancar_fin_hub'), []);
  const goToVisaoFinHub = useCallback(() => setActiveTab('visao_fin_hub'), []);
  const goToZootecnico = useCallback(() => setActiveTab('zootecnico'), []);
  
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
  const goToReclassFromFechamento = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setLancamentosFromFechamento(true);
    setActiveTab('lancamentos');
  }, []);
  const goToFechamentoTab = useCallback(() => setActiveTab('fechamento'), []);
  const goToEvolucaoRebanhoHub = useCallback(() => setActiveTab('evolucao_rebanho_hub'), []);
  const goToReclassFromEvolCategoria = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setLancamentosFromEvolCategoria(true);
    setActiveTab('lancamentos');
  }, []);
  const goToFluxoAnual = useCallback(() => setActiveTab('fluxo_anual'), []);
  const goToReclassFromFluxoAnual = useCallback((filtro?: { ano: string; mes: number }) => {
    if (filtro) setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes });
    setLancamentosFromFluxoAnual(true);
    setActiveTab('lancamentos');
  }, []);

  const subScreenBackMap: Partial<Record<TabId, () => void>> = {
    // Resumo sub-screens
    operacao_hub: goToResumo,
    painel_consultor: goToResumo,
    status_fechamentos: goToResumo,
    analise: () => setActiveTab('operacao_hub'),
    analise_entradas: () => setActiveTab('analise'),
    analise_saidas: () => setActiveTab('analise'),
    desfrute: () => setActiveTab('analise'),
    // Lanç. Zoo sub-screens
    lancamentos: goToLancarZooHub,
    fechamento: goToLancarZooHub,
    chuvas: goToLancarZooHub,
    mapa_pastos: () => setActiveTab('movimentacao'),
    mapa_geo_pastos: () => setActiveTab('movimentacao'),
    resumo_pastos: goToLancarZooHub,
    // Lanç. Fin (V2) sub-screens
    financeiro_v2: () => setActiveTab('financeiro_v2_hub'),
    fin_v2_contas: () => setActiveTab('financeiro_v2_hub'),
    fin_v2_fornecedores: () => setActiveTab('financeiro_v2_hub'),
    fin_v2_plano: () => setActiveTab('financeiro_v2_hub'),
    fin_v2_saldos: () => setActiveTab('financeiro_v2_hub'),
    contratos: () => setActiveTab('financeiro_v2_hub'),
    conciliacao_bancaria: () => setActiveTab('financeiro_v2_hub'),
    conta_boitel: () => setActiveTab('financeiro_v2_hub'),
    // Zootécnico (analysis) sub-screens
    zootecnico: goToVisaoZooHub,
    indicadores: goToVisaoZooHub,
    visao_anual_zoo: goToVisaoZooHub,
    
    preco_mercado: goToVisaoZooHub,
    graficos_analise: goToVisaoZooHub,
    movimentacao: goToVisaoZooHub,
    fluxo_anual: goToVisaoZooHub,
    evolucao_rebanho_hub: goToVisaoZooHub,
    valor_rebanho: () => setActiveTab('fluxo_anual'),
    analise_operacional: goToVisaoZooHub,
    fechamento_executivo: goToVisaoZooHub,
    analise_consultor: goToVisaoZooHub,
    // Financeiro (analysis) sub-screens
    fin_caixa: () => setActiveTab('lancar_fin_hub'),
    analise_economica: () => setActiveTab('lancar_fin_hub'),
    visao_fin_hub: () => setActiveTab('lancar_fin_hub'),
    financeiro: () => setActiveTab('lancar_fin_hub'),
    // Cadastros sub-screens
    auditoria: () => setActiveTab('cadastros'),
  };

  const clienteNomeHeader = clientes.length > 1 ? (clienteAtual?.nome || '') : '';
  const fazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || '');

  return (
    <div className="h-screen flex flex-col bg-background max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8">
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      <Header
        title={TITLES[activeTab]}
        clienteNome={clienteNomeHeader}
        fazendaNome={fazendaNome}
        periodo={undefined}
        
        rightAction={
          <div className="flex flex-col gap-1">
            {clientes.length > 1 && <ClienteSelector />}
            {fazendas.length > 1 && <FazendaSelector />}
          </div>
        }
      />




      <div className={`flex-1 min-h-0 ${(activeTab === 'mapa_geo_pastos' || activeTab === 'mapa_pastos') ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      {activeTab === 'resumo' && (
        <ResumoTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onTabChange={handleTabChange}
          filtroGlobal={filtroGlobal}
          onFiltroChange={handleFiltroChange}
          onSetSaldo={canEditZoo ? setSaldoInicial : undefined}
        />
      )}
      {activeTab === 'operacao_hub' && (
        <OperacaoHubTab onTabChange={handleTabChange} onBack={() => setActiveTab('resumo')} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'painel_consultor' && (
        <PainelConsultorTab onBack={() => setActiveTab('resumo')} onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
      )}
      {activeTab === 'status_fechamentos' && (
        <StatusFechamentosTab
          ano={filtroGlobal.ano}
          mesSelecionado={filtroGlobal.mes}
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onSelectMes={(anoMes, destino) => {
            const [a, m] = anoMes.split('-');
            handleFiltroChange({ ano: a, mes: parseInt(m) });
            setActiveTab(destino as TabId);
          }}
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
        }} onTabChange={handleTabChange} />
      )}
      {activeTab === 'lancamentos' && (
        <LancamentosTab
          lancamentos={lancamentosVisiveis}
          onAdicionar={wrappedAdicionar as any}
          onEditar={wrappedEditar as any}
          onRemover={wrappedRemover as any}
          onCountFinanceiros={countFinanceirosVinculados}
          abaInicial={(lancamentosFromConciliacao || lancamentosFromFechamento || lancamentosFromEvolCategoria || lancamentosFromFluxoAnual) ? 'reclassificacao' : (abateParaEditar || vendaParaEditar) ? 'saida' : compraParaEditar ? 'entrada' : undefined}
          onBackToConciliacao={lancamentosFromConciliacao ? goToFechamentoTab : lancamentosFromFechamento ? goToFechamentoTab : lancamentosFromEvolCategoria ? goToEvolucaoRebanhoHub : lancamentosFromFluxoAnual ? goToFluxoAnual : undefined}
          dataInicial={(lancamentosFromConciliacao || lancamentosFromFechamento || lancamentosFromEvolCategoria || lancamentosFromFluxoAnual) ? `${filtroGlobal.ano}-${String(filtroGlobal.mes).padStart(2, '0')}-15` : undefined}
          backLabel={lancamentosFromFechamento ? 'Voltar para Lançamento de Pasto' : (lancamentosFromEvolCategoria || lancamentosFromFluxoAnual) ? 'Voltar para Evolução por Categoria' : undefined}
          abateParaEditar={abateParaEditar}
          vendaParaEditar={vendaParaEditar}
          compraParaEditar={compraParaEditar}
          onReturnFromEdit={editOriginTab ? () => {
            // Restore origin tab with saved filter context
            if (editOriginTab === 'financeiro') {
              setSubAbaFinanceiro(editOriginSubAba);
              setMovFiltroAno(editOriginAnoFiltro);
              setMovFiltroMes(editOriginMesFiltro);
            }
            setActiveTab(editOriginTab);
            setEditOriginTab(null);
            setEditOriginSubAba(undefined);
            setEditOriginStatusFiltro(undefined);
            setEditOriginAnoFiltro(undefined);
            setEditOriginMesFiltro(undefined);
            setAbateParaEditar(null);
            setVendaParaEditar(null);
            setCompraParaEditar(null);
          } : undefined}
        />
      )}
      {activeTab === 'fluxo_anual' && <FluxoAnualTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onNavigateToMovimentacao={navigateToMovimentacao} onNavigateToValorRebanho={() => setActiveTab('valor_rebanho')} onSetSaldo={canEditZoo ? setSaldoInicial : undefined} onNavigateToReclass={goToReclassFromFluxoAnual} />}
      {activeTab === 'evolucao_rebanho_hub' && (
        <EvolucaoRebanhoHubTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onNavigateToMovimentacao={navigateToMovimentacao}
          onEditar={wrappedEditar as any}
          onRemover={wrappedRemover as any}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
          onNavigateToReclass={goToReclassFromEvolCategoria}
          onEditarAbate={(l, ctx) => { setEditOriginTab('evolucao_rebanho_hub'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setAbateParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarVenda={(l, ctx) => { setEditOriginTab('evolucao_rebanho_hub'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setVendaParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarCompra={(l, ctx) => { setEditOriginTab('evolucao_rebanho_hub'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setCompraParaEditar(l); setActiveTab('lancamentos'); }}
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
          filtroStatusInicial={editOriginTab === 'financeiro' ? editOriginStatusFiltro : undefined}
          onEditarAbate={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setAbateParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarVenda={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setVendaParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarCompra={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setCompraParaEditar(l); setActiveTab('lancamentos'); }}
        />
      )}
      {activeTab === 'acessos' && <AcessosTab />}
      {activeTab === 'analise' && <AnaliseTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} isGlobal={isGlobal} />}
      {activeTab === 'analise_entradas' && <AnaliseEntradasTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'analise_saidas' && <AnaliseSaidasTab lancamentos={lancamentosVisiveis} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} />}
      {activeTab === 'desfrute' && <DesfrunteTab lancamentos={isGlobal ? lancamentosVisiveis : lancamentos} saldosIniciais={saldosIniciais} onTabChange={handleTabChange} isGlobal={isGlobal} />}
      {activeTab === 'cadastros' && <CadastrosTab onTabChange={handleTabChange} />}
      {activeTab === 'chuvas' && <ChuvasTab />}
      {activeTab === 'fechamento' && (
        <FechamentoTab
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
          onBackToConciliacao={fechamentoFromConciliacao ? goToVisaoZooHub : undefined}
          onNavigateToReclass={goToReclassFromFechamento}
          onNavigateToValorRebanho={() => setActiveTab('valor_rebanho')}
        />
      )}
      {activeTab === 'mapa_pastos' && <MapaPastosTab />}
      {activeTab === 'mapa_geo_pastos' && <MapaGeoPastosTab />}
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
      {activeTab === 'fechamento_executivo' && (
        <FechamentoExecutivoTab
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'analise_consultor' && (
        <AnaliseConsultorTab />
      )}
      {activeTab === 'preco_mercado' && (
        <PrecoMercadoTab
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
          onBack={goToVisaoZooHub}
        />
      )}
      {activeTab === 'graficos_analise' && (
        <GraficosAnaliseTab
          lancamentos={lancamentosVisiveis}
          saldosIniciais={saldosIniciais}
          onBack={goToVisaoZooHub}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'financeiro_v2' && (
        <FinanceiroV2Tab
          onBack={() => setActiveTab('financeiro_v2_hub')}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
      {activeTab === 'financeiro_v2_hub' && (
        <FinanceiroV2HubTab onTabChange={handleTabChange} />
      )}
      {activeTab === 'fin_v2_contas' && <FinV2ContasTab />}
      {activeTab === 'fin_v2_fornecedores' && <FinV2FornecedoresTab />}
      {activeTab === 'fin_v2_plano' && <FinV2PlanoContasTab />}
      {activeTab === 'fin_v2_saldos' && (
        <FinV2SaldosTab
          onNavigateToConciliacao={(ano, mes, contaId) => {
            setConciliacaoContext({ ano, mes, contaId });
            setActiveTab('conciliacao_bancaria');
          }}
        />
      )}
      {activeTab === 'contratos' && <ContratosTab />}
      {activeTab === 'conciliacao_bancaria' && (
        <ConciliacaoBancariaTab
          initialAno={conciliacaoContext?.ano}
          initialConta={conciliacaoContext?.contaId}
          initialMes={conciliacaoContext?.mes}
          onBack={conciliacaoContext ? () => {
            setConciliacaoContext(null);
            setActiveTab('fin_v2_saldos');
          } : undefined}
          onNavigateToLancamentos={(a, m) => {
            setFiltroGlobal({ ano: a, mes: m });
            setActiveTab('financeiro_v2');
          }}
        />
      )}
      {activeTab === 'auditoria' && <AuditoriaTab />}
      {activeTab === 'conta_boitel' && (
        <ContaBoitelTab onBack={() => setActiveTab('financeiro_v2_hub')} />
      )}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

export default Index;
