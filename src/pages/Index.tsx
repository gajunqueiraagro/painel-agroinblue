import { useState, useCallback, useMemo, useRef } from 'react';
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
import { PainelConsultorHubTab } from './PainelConsultorHubTab';
import { PrecosMercadoHubTab } from './PrecosMercadoHubTab';
import { MetaGmdTab } from './MetaGmdTab';
import { ConferenciaGmdTab } from './ConferenciaGmdTab';
import { MetaPrecoTab } from './MetaPrecoTab';
import { GraficosAnaliseTab } from './GraficosAnaliseTab';
import { MetaConsolidacaoTab } from './MetaConsolidacaoTab';
import { useMetaConsolidacao } from '@/hooks/useMetaConsolidacao';
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
import { AuditoriaDuplicidadeTab } from './AuditoriaDuplicidadeTab';
import { ContaBoitelTab } from './ContaBoitelTab';
import { StatusFechamentosTab } from './StatusFechamentosTab';
import { DividendosTab } from './DividendosTab';
import { FazendaSelector } from '@/components/FazendaSelector';
import { SyncStatus } from '@/components/SyncStatus';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useMetaGmd } from '@/hooks/useMetaGmd';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Lancamento } from '@/types/cattle';
import { filtrarPorCenario } from '@/lib/statusOperacional';
import { cn } from '@/lib/utils';
import ImportZootHistoricoTab from './ImportZootHistoricoTab';

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
  fin_v2_dividendos: 'Dividendos',
  conciliacao_bancaria: 'Conciliação Bancária',
  auditoria_duplicidade: 'Auditoria de Duplicidade',
  painel_consultor: 'Painel do Consultor',
  painel_consultor_hub: 'Painel do Consultor',
  auditoria: 'Central de Auditoria',
  conta_boitel: 'Conta Boitel',
  status_fechamentos: 'Central de Fechamento',
  meta_gmd: 'GMD Meta',
  meta_preco: 'Preços Meta',
  meta_movimentacoes: 'Movimentações Meta',
  meta_consolidacao: 'Consolidação Meta',
  precos_mercado_hub: 'Preços de Mercado',
  conferencia_gmd: 'Conferência de GMD',
  import_zoot_historico: 'Importação Zootécnica',
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
  const [movFiltroStatus, setMovFiltroStatus] = useState<string | undefined>(undefined);
  const [lancamentosFromConciliacao, setLancamentosFromConciliacao] = useState(false);
  const [conciliacaoContext, setConciliacaoContext] = useState<{ ano: string; mes: string; contaId: string } | null>(null);
  const [finV2Intensivo, setFinV2Intensivo] = useState(false);
  const [finV2DrillFilters, setFinV2DrillFilters] = useState<import('./FinanceiroV2Tab').FinV2DrillFilters | null>(null);
  const [fechamentoFromConciliacao, setFechamentoFromConciliacao] = useState(false);
  const [lancamentosFromFechamento, setLancamentosFromFechamento] = useState(false);
  const [lancamentosFromEvolCategoria, setLancamentosFromEvolCategoria] = useState(false);
  const [lancamentosFromFluxoAnual, setLancamentosFromFluxoAnual] = useState(false);
  const [metaLancAnoFiltro, setMetaLancAnoFiltro] = useState<string | undefined>(undefined);
  const [metaLancMesFiltro, setMetaLancMesFiltro] = useState<string | undefined>(undefined);
  const [metaLancAbaInicial, setMetaLancAbaInicial] = useState<'reclassificacao' | undefined>(undefined);
  const [abateParaEditar, setAbateParaEditar] = useState<Lancamento | null>(null);
  const [vendaParaEditar, setVendaParaEditar] = useState<Lancamento | null>(null);
  const [compraParaEditar, setCompraParaEditar] = useState<Lancamento | null>(null);
  const [transferenciaParaEditar, setTransferenciaParaEditar] = useState<Lancamento | null>(null);
  const [reclassParaEditar, setReclassParaEditar] = useState<Lancamento | null>(null);
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
  const { lancamentos: metaLancamentos, adicionarLancamento: metaAdicionar, editarLancamento: metaEditar, removerLancamento: metaRemover, loadData: metaLoadData } = useLancamentos('meta');
  const { pendingCount, syncing, online, syncQueue } = useOfflineSync(fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id, loadData);

  // Wrap edit actions based on permissions
  const noOp = async () => {};
  const canEditZoo = canEdit('zootecnico') && !isGlobal;
  const canEditFin = canEdit('financeiro') && !isGlobal;

  // Wrap adicionarLancamento to also reload meta data when a META record is saved
  const wrappedAdicionar = canEditZoo ? (async (lancamento: Omit<Lancamento, 'id'>) => {
    const result = await adicionarLancamento(lancamento);
    if (result && lancamento.statusOperacional === null) {
      metaLoadData();
    }
    return result;
  }) : noOp;

  // Wrap editarLancamento to also reload meta data when status changes
  const wrappedEditar = canEditZoo ? (async (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => {
    await editarLancamento(id, dados);
    if (dados.statusOperacional === null) {
      metaLoadData();
    }
  }) : noOp;

  const wrappedRemover = canEditZoo ? removerLancamento : noOp;

  const [filtroGlobal, setFiltroGlobal] = useState<FiltroGlobal>({
    ano: String(new Date().getFullYear()),
    mes: new Date().getMonth() + 1,
  });
  const metaGmd = useMetaGmd(filtroGlobal.ano);
  const metaLancamentosFiltrados = useMemo(() => filtrarPorCenario(metaLancamentos, 'meta'), [metaLancamentos]);
  // For consolidation: ALL meta records from both datasets, deduplicated by ID
  const todosMeta = useMemo(() => {
    const metaFromRealizado = lancamentos.filter(l => l.statusOperacional === 'previsto');
    const metaFromCenario = metaLancamentosFiltrados;
    const seen = new Set<string>();
    const result: Lancamento[] = [];
    for (const l of [...metaFromRealizado, ...metaFromCenario]) {
      if (!seen.has(l.id)) {
        seen.add(l.id);
        result.push(l);
      }
    }
    return result;
  }, [lancamentos, metaLancamentosFiltrados]);
  const metaConsolidacaoData = useMetaConsolidacao(saldosIniciais, todosMeta, metaGmd.rows, Number(filtroGlobal.ano));

  const handleFiltroChange = useCallback((f: Partial<FiltroGlobal>) => {
    setFiltroGlobal(prev => ({ ...prev, ...f }));
  }, []);

  const lancamentosVisiveis = useMemo(() => {
    if (!isGlobal) return lancamentos;
    return lancamentos.filter(l => l.tipo !== 'transferencia_entrada' && l.tipo !== 'transferencia_saida');
  }, [lancamentos, isGlobal]);

  // Merge realizado + meta for screens that need both cenários (Evolução, Fluxo Anual)
  const lancamentosTodosCenarios = useMemo(() => {
    const metaIds = new Set(metaLancamentos.map(l => l.id));
    // Avoid duplicates: realizado first, then meta records not already present
    const merged = [...lancamentosVisiveis];
    for (const ml of metaLancamentos) {
      if (!lancamentosVisiveis.some(l => l.id === ml.id)) {
        merged.push(ml);
      }
    }
    return merged;
  }, [lancamentosVisiveis, metaLancamentos]);

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
      setMovFiltroStatus(undefined);
    }
    if (tab !== 'lancamentos') {
      setLancamentosFromConciliacao(false);
      setLancamentosFromFechamento(false);
      setLancamentosFromEvolCategoria(false);
      setLancamentosFromFluxoAnual(false);
      setAbateParaEditar(null);
      setVendaParaEditar(null);
      setCompraParaEditar(null);
      setTransferenciaParaEditar(null);
      setEditOriginTab(null);
      setEditOriginSubAba(undefined);
      setEditOriginStatusFiltro(undefined);
      setEditOriginAnoFiltro(undefined);
      setEditOriginMesFiltro(undefined);
    }
    if (tab !== 'fechamento') setFechamentoFromConciliacao(false);
    if (tab !== 'financeiro_v2') { setFinV2Intensivo(false); setFinV2DrillFilters(null); }
    if (tab === 'conferencia_gmd' || tab === 'mapa_pastos') {
      gmdOriginRef.current = activeTab as TabId;
    }
    setActiveTab(tab);
  }, [isGlobal, canViewTab, activeTab]);

  const gmdOriginRef = useRef<TabId>('painel_consultor');
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
    painel_consultor_hub: goToVisaoZooHub,
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
    auditoria_duplicidade: () => setActiveTab('financeiro_v2_hub'),
    // Zootécnico (analysis) sub-screens
    zootecnico: goToVisaoZooHub,
    indicadores: goToVisaoZooHub,
    visao_anual_zoo: goToVisaoZooHub,
    
    preco_mercado: () => setActiveTab('precos_mercado_hub'),
    graficos_analise: goToVisaoZooHub,
    movimentacao: goToVisaoZooHub,
    fluxo_anual: goToVisaoZooHub,
    evolucao_rebanho_hub: goToVisaoZooHub,
    valor_rebanho: () => setActiveTab('fluxo_anual'),
    analise_operacional: goToVisaoZooHub,
    fechamento_executivo: goToVisaoZooHub,
    analise_consultor: goToVisaoZooHub,
    painel_consultor: () => setActiveTab('painel_consultor_hub'),
    meta_gmd: () => setActiveTab('painel_consultor_hub'),
    meta_preco: () => setActiveTab('precos_mercado_hub'),
    meta_consolidacao: () => setActiveTab('painel_consultor_hub'),
    meta_movimentacoes: () => setActiveTab('painel_consultor_hub'),
    precos_mercado_hub: () => setActiveTab('painel_consultor_hub'),
    conferencia_gmd: () => setActiveTab('painel_consultor'),
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
    <div className={cn("h-screen flex flex-col bg-background max-w-[1280px] mx-auto", finV2Intensivo ? "px-1" : "px-4 md:px-6 lg:px-8")}>
      <SyncStatus online={online} pendingCount={pendingCount} syncing={syncing} onSync={syncQueue} />
      {!finV2Intensivo && (
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
      )}


      <div className={`flex-1 min-h-0 ${finV2Intensivo ? 'overflow-hidden flex flex-col' : (activeTab === 'mapa_geo_pastos' || activeTab === 'mapa_pastos') ? 'overflow-hidden' : 'overflow-y-auto'}`}>
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
        <PainelConsultorTab onBack={() => setActiveTab('painel_consultor_hub')} onTabChange={handleTabChange} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} metaConsolidacao={metaConsolidacaoData} />
      )}
      {activeTab === 'conferencia_gmd' && (
        <ConferenciaGmdTab onBack={() => setActiveTab(gmdOriginRef.current)} filtroGlobal={{ ano: filtroGlobal.ano, mes: filtroGlobal.mes }} />
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
          abaInicial={(lancamentosFromConciliacao || lancamentosFromFechamento || lancamentosFromEvolCategoria || lancamentosFromFluxoAnual) ? 'reclassificacao' : reclassParaEditar ? 'reclassificacao' : (abateParaEditar || vendaParaEditar || transferenciaParaEditar) ? 'saida' : compraParaEditar ? 'entrada' : undefined}
          onBackToConciliacao={lancamentosFromConciliacao ? goToFechamentoTab : lancamentosFromFechamento ? goToFechamentoTab : lancamentosFromEvolCategoria ? goToEvolucaoRebanhoHub : lancamentosFromFluxoAnual ? goToFluxoAnual : undefined}
          dataInicial={(lancamentosFromConciliacao || lancamentosFromFechamento || lancamentosFromEvolCategoria || lancamentosFromFluxoAnual) ? `${filtroGlobal.ano}-${String(filtroGlobal.mes).padStart(2, '0')}-15` : undefined}
          backLabel={lancamentosFromFechamento ? 'Voltar para Lançamento de Pasto' : (lancamentosFromEvolCategoria || lancamentosFromFluxoAnual) ? 'Voltar para Evolução por Categoria' : undefined}
          abateParaEditar={abateParaEditar}
          vendaParaEditar={vendaParaEditar}
          compraParaEditar={compraParaEditar}
          transferenciaParaEditar={transferenciaParaEditar}
          reclassParaEditar={reclassParaEditar}
          onReturnFromEdit={editOriginTab ? async () => {
            await Promise.all([loadData(), metaLoadData()]);
            if (editOriginTab === 'financeiro') {
              setSubAbaFinanceiro(editOriginSubAba);
              setMovFiltroAno(editOriginAnoFiltro);
              setMovFiltroMes(editOriginMesFiltro);
              setMovFiltroStatus(editOriginStatusFiltro);
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
            setTransferenciaParaEditar(null);
            setReclassParaEditar(null);
          } : undefined}
        />
      )}
      {activeTab === 'fluxo_anual' && <FluxoAnualTab lancamentos={lancamentosTodosCenarios} saldosIniciais={saldosIniciais} onNavigateToMovimentacao={navigateToMovimentacao} onNavigateToValorRebanho={() => setActiveTab('valor_rebanho')} onSetSaldo={canEditZoo ? setSaldoInicial : undefined} onNavigateToReclass={goToReclassFromFluxoAnual} />}
      {activeTab === 'evolucao_rebanho_hub' && (
        <EvolucaoRebanhoHubTab
          lancamentos={lancamentosTodosCenarios}
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
          lancamentos={lancamentosTodosCenarios}
          onEditar={wrappedEditar as any}
          onRemover={wrappedRemover as any}
          subAbaInicial={subAbaFinanceiro}
          filtroAnoInicial={movFiltroAno}
          filtroMesInicial={movFiltroMes}
          drillDownLabel={movDrillLabel}
          onBack={movBackTab ? () => setActiveTab(movBackTab) : undefined}
          filtroStatusInicial={movFiltroStatus || (editOriginTab === 'financeiro' ? editOriginStatusFiltro : undefined)}
          onEditarAbate={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setAbateParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarVenda={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setVendaParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarCompra={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setCompraParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarTransferencia={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setTransferenciaParaEditar(l); setActiveTab('lancamentos'); }}
          onEditarReclass={(l, ctx) => { setEditOriginTab('financeiro'); if (ctx) { setEditOriginSubAba(ctx.subAba); setEditOriginStatusFiltro(ctx.statusFiltro); setEditOriginAnoFiltro(ctx.anoFiltro); setEditOriginMesFiltro(ctx.mesFiltro); } setReclassParaEditar(l); setActiveTab('lancamentos'); }}
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
          onNavigateToConferenciaGmd={(filtro) => { setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes }); handleTabChange('conferencia_gmd'); }}
          onNavigateToMapaPastos={(filtro) => { setFiltroGlobal({ ano: filtro.ano, mes: filtro.mes }); handleTabChange('mapa_pastos'); }}
        />
      )}
      {activeTab === 'mapa_pastos' && (
        <MapaPastosTab
          onBack={gmdOriginRef.current !== 'mapa_pastos' ? () => setActiveTab(gmdOriginRef.current) : undefined}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
        />
      )}
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
          onBack={() => { setFinV2DrillFilters(null); setActiveTab('financeiro_v2_hub'); }}
          filtroAnoInicial={filtroGlobal.ano}
          filtroMesInicial={filtroGlobal.mes}
          onIntensiveToggle={setFinV2Intensivo}
          drillFilters={finV2DrillFilters}
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
      {activeTab === 'fin_v2_dividendos' && <DividendosTab />}
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
      {activeTab === 'auditoria_duplicidade' && (
        <AuditoriaDuplicidadeTab onBack={() => setActiveTab('financeiro_v2_hub')} />
      )}
      {activeTab === 'conta_boitel' && (
        <ContaBoitelTab onBack={() => setActiveTab('financeiro_v2_hub')} />
      )}
      {activeTab === 'painel_consultor_hub' && (
        <PainelConsultorHubTab onTabChange={handleTabChange} onBack={goToVisaoZooHub} />
      )}
      {activeTab === 'meta_gmd' && (
        <MetaGmdTab onBack={() => setActiveTab('painel_consultor_hub')} />
      )}
      {activeTab === 'precos_mercado_hub' && (
        <PrecosMercadoHubTab onTabChange={handleTabChange} onBack={() => setActiveTab('painel_consultor_hub')} />
      )}
      {activeTab === 'meta_preco' && (
        <MetaPrecoTab onBack={() => setActiveTab('precos_mercado_hub')} />
      )}
      {activeTab === 'preco_mercado' && (
        <PrecoMercadoTab onBack={() => setActiveTab('precos_mercado_hub')} />
      )}
      {activeTab === 'meta_movimentacoes' && (
        <LancamentosTab
          lancamentos={metaLancamentosFiltrados}
          onAdicionar={canEditZoo ? (metaAdicionar as any) : noOp}
          onEditar={canEditZoo ? (metaEditar as any) : noOp}
          onRemover={canEditZoo ? (metaRemover as any) : noOp}
          onBackToConciliacao={() => {
            setMetaLancAnoFiltro(undefined);
            setMetaLancMesFiltro(undefined);
            setMetaLancAbaInicial(undefined);
            setActiveTab('painel_consultor_hub');
          }}
          backLabel="Voltar para Painel do Consultor"
          initialAnoFiltro={metaLancAnoFiltro}
          initialMesFiltro={metaLancMesFiltro}
          abaInicial={metaLancAbaInicial}
        />
      )}
      {activeTab === 'meta_consolidacao' && (
        <MetaConsolidacaoTab
          metaLancamentos={todosMeta}
          ano={Number(filtroGlobal.ano)}
          onBack={() => setActiveTab('painel_consultor_hub')}
          onNavigateToLancamentos={(anoVal, mesVal, catVal) => {
            setSubAbaFinanceiro(undefined);
            setMovFiltroAno(anoVal);
            setMovFiltroMes(mesVal);
            setMovFiltroStatus('meta');
            setMovBackTab('meta_consolidacao');
            setMovDrillLabel('Voltar para Consolidação');
            setActiveTab('financeiro');
          }}
          onNavigateToReclass={(mesVal) => {
            setMetaLancAbaInicial('reclassificacao');
            if (mesVal) {
              setMetaLancAnoFiltro(String(Number(filtroGlobal.ano)));
              setMetaLancMesFiltro(mesVal);
            }
            setActiveTab('meta_movimentacoes');
          }}
        />
      )}
      </div>
      {!finV2Intensivo && <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />}
    </div>
  );
};

export default Index;
