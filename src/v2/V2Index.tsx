import { useState, useEffect, useMemo } from 'react';
import { LancamentosTab } from '@/pages/LancamentosTab';
import { useLancamentos } from '@/hooks/useLancamentos';
import type { Lancamento } from '@/types/cattle';
import { usePermissions } from '@/hooks/usePermissions';
import { ClienteSelector } from '@/components/ClienteSelector';
import { FazendaSelector } from '@/components/FazendaSelector';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { V2Sidebar, type V2Section } from './components/V2Sidebar';
import { getPeriodoTipo } from './lib/periodoConfig';
import { V2FilterBar } from './components/V2FilterBar';
import { V2MobileNav } from './components/V2MobileNav';
import { V2ContextDrawer } from './components/V2ContextDrawer';
import { V2Home } from './pages/V2Home';
import { V2PainelConsultor } from './pages/V2PainelConsultor';
import { V2AuditoriaAnual } from './pages/V2AuditoriaAnual';
import { PainelConsultorTab } from '@/pages/PainelConsultorTab';
import { MetaPrecoTab } from '@/pages/MetaPrecoTab';
import { EvolucaoCategoriaTab } from '@/pages/EvolucaoCategoriaTab';
import { FechamentoTab } from '@/pages/FechamentoTab';
import { FinanceiroV2Tab } from '@/pages/FinanceiroV2Tab';
import { PastosTab } from '@/pages/PastosTab';
import { ChuvasTab } from '@/pages/ChuvasTab';
import { MapaPastosTab } from '@/pages/MapaPastosTab';
import { MapaGeoPastosTab } from '@/pages/MapaGeoPastosTab';
import { AuditoriaTecnicaTab } from '@/pages/AuditoriaTecnicaTab';
import { AuditoriaZootecnicaTab } from '@/pages/AuditoriaZootecnicaTab';
import { ResumoPastosTab } from '@/pages/ResumoPastosTab';
import { MetaGmdTab } from '@/pages/MetaGmdTab';
import { V2ZootWrapper } from './components/V2ZootWrapper';
import { ValorRebanhoTab } from '@/pages/ValorRebanhoTab';
import { EvolucaoTab } from '@/pages/EvolucaoTab';
import { FluxoAnualTab } from '@/pages/FluxoAnualTab';
import { FinanceiroTab } from '@/pages/FinanceiroTab';
import { IndicadoresTab } from '@/pages/IndicadoresTab';
import { FinanceiroCaixaTab } from '@/pages/FinanceiroCaixaTab';
import { DividendosTab } from '@/pages/DividendosTab';
import { FinV2PlanoContasTab } from '@/pages/FinV2PlanoContasTab';
import { FinV2SaldosTab } from '@/pages/FinV2SaldosTab';
import { FinV2ContasTab } from '@/pages/FinV2ContasTab';
import { FinV2FornecedoresTab } from '@/pages/FinV2FornecedoresTab';
import { ContratosTab } from '@/pages/ContratosTab';
import FinanciamentosListaPage from '@/pages/FinanciamentosListaPage';
import FinanciamentosPainelTab from '@/pages/FinanciamentosPainelTab';
import { ConciliacaoBancariaTab } from '@/pages/ConciliacaoBancariaTab';
import { V2Configuracoes } from './pages/V2Configuracoes';
import { V2Fazendas } from './pages/V2Fazendas';
import { ClientesTab } from '@/pages/ClientesTab';
import { AuditoriaTab } from '@/pages/AuditoriaTab';
import { toast } from 'sonner';

interface V2LancamentosWrapperProps {
  /** Abate para abrir em modo edição (vindo da Conferência). */
  abateParaEditar?: Lancamento | null;
  /** Venda para abrir em modo edição (vindo da Conferência). */
  vendaParaEditar?: Lancamento | null;
  /** Callback chamado após cancelar/salvar edição vinda da Conferência. */
  onReturnFromEdit?: () => void;
}
function V2LancamentosWrapper({ abateParaEditar, vendaParaEditar, onReturnFromEdit }: V2LancamentosWrapperProps = {}) {
  const { isGlobal } = useFazenda();
  const { canEdit, canEditMeta } = usePermissions();
  const {
    lancamentos,
    adicionarLancamento,
    editarLancamento,
    removerLancamento,
    countFinanceirosVinculados,
    loadData,
  } = useLancamentos();
  const { loadData: metaLoadData } = useLancamentos('meta');

  const noOp = async (_id?: string) => { toast.error('Selecione uma fazenda específica para editar lançamentos.'); };
  const canEditZoo = canEdit('zootecnico') && !isGlobal;
  const canDeleteZoo = canEdit('zootecnico');

  const wrappedAdicionar = canEditZoo
    ? (async (lancamento: any) => {
        const result = await adicionarLancamento(lancamento);
        if (result && lancamento.statusOperacional === null) metaLoadData();
        return result;
      })
    : noOp;

  const wrappedEditar = canEditZoo
    ? (async (id: string, dados: any) => {
        await editarLancamento(id, dados);
        await Promise.all([loadData(), metaLoadData()]);
      })
    : noOp;

  const wrappedRemover = canDeleteZoo ? removerLancamento : noOp;

  const lancamentosVisiveis = useMemo(() => {
    // Inclui realizado + programado. Exclui somente meta (cenario='meta').
    const filtered = lancamentos.filter(l => l.cenario !== 'meta');
    if (!isGlobal) return filtered;
    return filtered.filter(l => l.tipo !== 'transferencia_entrada' && l.tipo !== 'transferencia_saida');
  }, [lancamentos, isGlobal]);

  return (
    <LancamentosTab
      lancamentos={lancamentosVisiveis}
      onAdicionar={wrappedAdicionar as any}
      onEditar={wrappedEditar as any}
      onRemover={wrappedRemover as any}
      onCountFinanceiros={countFinanceirosVinculados}
      abateParaEditar={abateParaEditar}
      vendaParaEditar={vendaParaEditar}
      onReturnFromEdit={onReturnFromEdit}
      abaInicial={(abateParaEditar || vendaParaEditar) ? 'saida' : undefined}
    />
  );
}

export default function V2Index() {
  const [section, setSection] = useState<V2Section>('home');
  const mesAnterior = new Date().getMonth() === 0 ? 12 : new Date().getMonth();
  const anoMesAnterior = new Date().getMonth() === 0
    ? String(new Date().getFullYear() - 1)
    : String(new Date().getFullYear());
  const [ano, setAno] = useState(anoMesAnterior);
  const [mes, setMes] = useState(String(mesAnterior));
  const [viewMode, setViewMode] = useState<'mes' | 'periodo'>('mes');
  const [modo, setModo] = useState<'mes' | 'acum'>('mes');
  const [intensivo, setIntensivo] = useState(false);
  const [drawerAtivo, setDrawerAtivo] = useState<string | null>(null);
  // Estado para edição completa de Abate/Venda vinda da Conferência.
  // Quando setado, navega para `lancamentos-zoot` e abre LancamentosTab em edit mode.
  const [abateParaEditar, setAbateParaEditar] = useState<Lancamento | null>(null);
  const [vendaParaEditar, setVendaParaEditar] = useState<Lancamento | null>(null);
  const limparEdicaoAvancada = () => {
    setAbateParaEditar(null);
    setVendaParaEditar(null);
  };
  // Limpa estado de edição se sair da seção `lancamentos-zoot` por qualquer
  // motivo (menu, drawer, navegação direta) — evita criação normal travada
  // em modo edição.
  useEffect(() => {
    if (section !== 'lancamentos-zoot' && (abateParaEditar || vendaParaEditar)) {
      limparEdicaoAvancada();
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodoTipo = getPeriodoTipo(section);
  const { clientes, clienteAtual } = useCliente();
  const { fazendas, isGlobal } = useFazenda();
  const { canEditMeta } = usePermissions();

  useEffect(() => {
    if (!clienteAtual?.id) return;
    (async () => {
      const { data } = await supabase
        .from('fechamento_pastos')
        .select('ano_mes, fazendas!inner(status_operacional, tem_pecuaria)')
        .eq('cliente_id', clienteAtual.id)
        .eq('status', 'fechado')
        .eq('fazendas.status_operacional', 'ativa')
        .eq('fazendas.tem_pecuaria', true)
        .order('ano_mes', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.ano_mes) {
        const [a, m] = data.ano_mes.split('-');
        setAno(a);
        setMes(String(Number(m)));
      } else {
        const hoje = new Date();
        let mes = hoje.getMonth();
        let ano = hoje.getFullYear();
        if (mes === 0) { mes = 12; ano = ano - 1; }
        setAno(String(ano));
        setMes(String(mes));
      }
    })();
  }, [clienteAtual?.id]);

  function renderContent() {
    if (section === 'home') return <V2Home ano={ano} mes={mes} viewMode={viewMode} onViewModeChange={setViewMode} />;
    if (section === 'painel-consultor') return <V2PainelConsultor ano={ano} mes={mes} />;
    if (section === 'auditoria-anual') return <V2AuditoriaAnual ano={ano} />;
    if (section === 'conciliacao') return (
      <ConciliacaoBancariaTab />
    );
    if (section === 'painel-financiamentos') return (
      <FinanciamentosPainelTab filtroAnoInicial={Number(ano)} />
    );
    if (section === 'financiamentos') return (
      <FinanciamentosListaPage />
    );
    if (section === 'saldos-mensais') return (
      <FinV2SaldosTab />
    );
    if (section === 'dividendos') return (
      <DividendosTab />
    );
    if (section === 'plano-contas') return (
      <FinV2PlanoContasTab />
    );
    if (section === 'fornecedores') return (
      <FinV2FornecedoresTab />
    );
    if (section === 'contas-bancarias') return (
      <FinV2ContasTab />
    );
    if (section === 'contratos') return (
      <ContratosTab />
    );
    if (section === 'importacao-extratos') return (
      <FinanceiroCaixaTab initialTab="importacao" hideInternalTabs filtroAnoInicial={ano} filtroMesInicial={mes === '0' ? undefined : Number(mes)} />
    );
    if (section === 'rateio-adm') return (
      <FinanceiroCaixaTab initialTab="rateio" hideInternalTabs filtroAnoInicial={ano} filtroMesInicial={mes === '0' ? undefined : Number(mes)} />
    );
    if (section === 'fluxo-caixa') return (
      <FinanceiroCaixaTab initialTab="fluxo" hideInternalTabs filtroAnoInicial={ano} filtroMesInicial={mes === '0' ? undefined : Number(mes)} />
    );
    if (section === 'financeiro-dashboard') return (
      <FinanceiroCaixaTab initialTab="dashboard" hideInternalTabs filtroAnoInicial={ano} filtroMesInicial={mes === '0' ? undefined : Number(mes)} modo={modo} />
    );
    if (section === 'indicadores-zoot') return (
      <V2ZootWrapper>
        {({ lancamentos, saldosIniciais }) => (
          <IndicadoresTab
            lancamentos={lancamentos}
            saldosIniciais={saldosIniciais}
            anoInicial={ano}
            mesInicial={mes === '0' ? undefined : Number(mes)}
          />
        )}
      </V2ZootWrapper>
    );
    if (section === 'valor-rebanho') return (
      <V2ZootWrapper>
        {({ lancamentos, saldosIniciais }) => (
          <ValorRebanhoTab
            lancamentos={lancamentos}
            saldosIniciais={saldosIniciais}
            onBack={() => setSection('rebanho-home')}
            filtroAnoInicial={ano}
          />
        )}
      </V2ZootWrapper>
    );
    if (section === 'evolucao') return (
      <V2ZootWrapper>
        {({ lancamentos, saldosIniciais }) => (
          <EvolucaoTab
            lancamentos={lancamentos}
            saldosIniciais={saldosIniciais}
            initialAno={ano}
            ocultarFiltroAno
          />
        )}
      </V2ZootWrapper>
    );
    if (section === 'conferencia-lancamentos') return (
      <V2ZootWrapper>
        {({ lancamentosTodosCenarios, removerLancamento, editarLancamento }) => (
          <FinanceiroTab
            lancamentos={lancamentosTodosCenarios}
            filtroAnoInicial={ano}
            filtroMesInicial={undefined}
            filtroStatusInicial="realizado"
            onRemover={removerLancamento}
            onEditar={editarLancamento}
            onEditarAbate={(l) => {
              setAbateParaEditar(l);
              setVendaParaEditar(null);
              setSection('lancamentos-zoot');
            }}
            onEditarVenda={(l) => {
              setVendaParaEditar(l);
              setAbateParaEditar(null);
              setSection('lancamentos-zoot');
            }}
          />
        )}
      </V2ZootWrapper>
    );
    if (section === 'conferencia-mensal') return (
      <V2ZootWrapper>
        {({ lancamentos, saldosIniciais }) => (
          <FluxoAnualTab
            lancamentos={lancamentos}
            saldosIniciais={saldosIniciais}
            onNavigate={(targetSection, params) => {
              if (params?.mes !== undefined) setMes(String(params.mes));
              if (params?.ano !== undefined) setAno(params.ano);
              setSection(targetSection as V2Section);
            }}
          />
        )}
      </V2ZootWrapper>
    );
    if (section === 'meta-gmd') return (
      <MetaGmdTab initialAno={ano} ocultarFiltroAno />
    );
    if (section === 'resumo-pastos') return (
      <ResumoPastosTab />
    );
    if (section === 'auditoria-zoot') return (
      <AuditoriaZootecnicaTab />
    );
    if (section === 'auditoria-tecnica') return (
      <AuditoriaTecnicaTab />
    );
    if (section === 'mapa-geo-pastos') return (
      <MapaGeoPastosTab />
    );
    if (section === 'mapa-pastos') return (
      <MapaPastosTab
        filtroAnoInicial={ano}
        filtroMesInicial={mes === '0' ? undefined : Number(mes)}
      />
    );
    if (section === 'lancamentos-zoot') return (
      <V2LancamentosWrapper
        abateParaEditar={abateParaEditar}
        vendaParaEditar={vendaParaEditar}
        onReturnFromEdit={() => {
          limparEdicaoAvancada();
          setSection('conferencia-lancamentos');
        }}
      />
    );
    if (section === 'chuvas') return (
      <ChuvasTab anoInicial={ano} />
    );
    if (section === 'pastos') return (
      <PastosTab />
    );
    if (section === 'financeiro-lanc') return (
      <FinanceiroV2Tab onIntensiveToggle={setIntensivo} />
    );
    if (section === 'fechamento') return (
      <FechamentoTab
        filtroAnoInicial={ano}
        filtroMesInicial={mes === '0' ? undefined : Number(mes)}
        onNavigateToReclass={(filtro) => {
          if (filtro) { setAno(filtro.ano); setMes(String(filtro.mes)); }
          setSection('lancamentos-zoot');
        }}
        onNavigateToValorRebanho={(filtro) => {
          setAno(filtro.ano);
          setMes(String(filtro.mes));
          setSection('valor-rebanho');
        }}
        onNavigateToConferenciaGmd={(filtro) => {
          setAno(filtro.ano);
          setMes(String(filtro.mes));
          setSection('conferencia-mensal');
        }}
        onNavigateToMapaPastos={(filtro) => {
          setAno(filtro.ano);
          setMes(String(filtro.mes));
          setSection('resumo-pastos');
        }}
      />
    );
    if (section === 'evolucao-categoria') return (
      <EvolucaoCategoriaTab
        initialAno={ano}
        initialMes={mes === '0' ? undefined : mes.padStart(2, '0')}
        ocultarFiltrosPeriodo
      />
    );
    if (section === 'painel-anual') return (
      <PainelConsultorTab
        onBack={() => setSection('home')}
        filtroGlobal={{ ano, mes: parseInt(mes) || new Date().getMonth() + 1 }}
      />
    );
    if (section === 'meta-precos') {
      if (isGlobal) {
        return (
          <div className="px-4 py-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground">Preços META</h2>
            <div className="p-6 rounded-lg border border-dashed border-border text-center text-muted-foreground text-sm">
              Selecione uma fazenda específica para editar os preços da META.
            </div>
          </div>
        );
      }
      if (!canEditMeta) {
        return (
          <div className="px-4 py-6 space-y-3">
            <h2 className="text-base font-semibold text-foreground">Preços META</h2>
            <div className="p-6 rounded-lg border border-dashed border-border text-center text-muted-foreground text-sm">
              Sem permissão para editar META.
            </div>
          </div>
        );
      }
      return <MetaPrecoTab onBack={() => setSection('planejamento-home')} />;
    }
    if (section === 'configuracoes') return <V2Configuracoes onNavigate={setSection} />;
    if (section === 'config-clientes') return <ClientesTab />;
    if (section === 'config-bancario') return <FinV2ContasTab />;
    if (section === 'config-auditoria') return <AuditoriaTab />;
    if (section === 'config-fazendas') return <V2Fazendas />;

    // ── Placeholders "Em construção" (PR Reorganização Sidebar) ──
    // Rotas existem no menu mas ainda não têm componente dedicado.
    // Substituir pelo wrapper real numa PR posterior.
    const PLACEHOLDERS: Partial<Record<V2Section, string>> = {
      'lancamentos-meta-zoo': 'Lançamentos META Zoo',
      'lancamentos-meta-fin': 'Lançamentos META Fin',
      'dre-executivo':        'DRE Executivo',
      'divergencias':         'Divergências',
      'logs':                 'Logs',
      'validacoes':           'Validações',
    };
    if (PLACEHOLDERS[section]) {
      const titulo = PLACEHOLDERS[section]!;
      return (
        <div className="px-4 py-6 space-y-3 max-w-3xl mx-auto">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <p className="text-sm text-muted-foreground">Em construção — esta seção será implementada em breve.</p>
          <div className="p-8 rounded-lg border border-dashed border-border text-center text-muted-foreground text-sm">
            🚧 Tela em desenvolvimento.
            <br />
            <span className="text-xs">Reorganização da sidebar — fase preparatória.</span>
          </div>
        </div>
      );
    }
    const labels: Record<string, string> = {
      financeiro: 'Financeiro', rebanho: 'Rebanho',
      movimentacoes: 'Movimentações', indicadores: 'Indicadores',
      'meta-cenario': 'Cenário META', 'meta-metas': 'Metas Mensais',
      'painel-consultor': 'Painel Consultor', configuracoes: 'Configurações',
    };
    const isPlan = ['meta-cenario', 'meta-metas', 'painel-consultor'].includes(section);
    return (
      <div className="px-4 py-6 space-y-3">
        <h2 className="text-base font-semibold text-foreground">{labels[section] ?? section}</h2>
        <p className="text-sm text-muted-foreground">
          {isPlan
            ? 'Módulo de planejamento — edição de META exclusiva nesta seção (Fase 2).'
            : 'Tela existente integrada aqui na Fase 2, sem modificação.'}
        </p>
        <div className="p-6 rounded-lg border border-dashed border-border text-center text-muted-foreground text-sm">
          Conteúdo integrado na Fase 2.
          <br />
          <span className="text-xs">Tela original continua em / sem alteração.</span>
        </div>
      </div>
    );
  }

  const clienteSelector = clientes.length > 1 ? <ClienteSelector /> : undefined;
  const fazendaSelector = fazendas.length > 1 ? <FazendaSelector /> : undefined;

  function handleSelect(s: V2Section) {
    setSection(s);
    setDrawerAtivo(null);
    setIntensivo(false);
  }

  return (
    <div className="h-screen bg-background overflow-hidden">

      {/* ── Desktop: flex simples — drawer é overlay, não empurra layout ── */}
      <div className="hidden md:flex h-screen bg-background">
        {/* SIDEBAR */}
        {!intensivo && <V2Sidebar
          activeSection={section}
          onNavigate={setSection}
          drawerAtivo={drawerAtivo}
          onDrawerToggle={setDrawerAtivo}
          clienteSelector={clienteSelector}
          fazendaSelector={fazendaSelector}
        />}
        {/* MAIN */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {/* HEADER */}
          <div className="shrink-0">
            <V2FilterBar
              ano={ano}
              mes={mes}
              onAnoChange={setAno}
              onMesChange={setMes}
              tipo={periodoTipo}
              showFazenda={false}
              className="shrink-0"
              modo={section === 'financeiro-dashboard' ? modo : undefined}
              onModoChange={section === 'financeiro-dashboard' ? setModo : undefined}
            />
          </div>
          {/* SUB-NAV FINANCEIRO */}
          {['financeiro-dashboard', 'fluxo-caixa', 'rateio-adm', 'importacao-extratos'].includes(section) && (
            <div className="shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-border bg-background">
              <span className="text-[11px] font-bold text-foreground mr-2">Financeiro</span>
              {([
                { id: 'financeiro-dashboard', label: 'Dashboard' },
                { id: 'fluxo-caixa',          label: 'Fluxo de Caixa' },
                { id: 'rateio-adm',            label: 'Rateio ADM' },
                { id: 'importacao-extratos',   label: 'Importação' },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`px-2.5 py-0.5 rounded text-[11px] transition-colors ${
                    section === id
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* SCROLL */}
          <section className={intensivo
            ? "flex-1 min-h-0 w-full overflow-auto bg-background"
            : "flex-1 min-h-0 min-w-0 overflow-auto"
          }>
            <div className="w-full min-w-0">
              {renderContent()}
            </div>
          </section>
          {/* Drawer overlay */}
          <V2ContextDrawer
            grupoAtivo={drawerAtivo}
            activeSection={section}
            onSelect={handleSelect}
            onClose={() => setDrawerAtivo(null)}
          />
        </div>
      </div>

      {/* ── Mobile: layout original preservado, sem drawer ────────────── */}
      <div className="flex flex-col h-screen md:hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground shrink-0 shadow-sm">
          <span className="text-sm font-bold">Agroinblue</span>
          <div className="flex items-center gap-1">
            {clientes.length > 1 && (
              <div className="[&_button]:text-xs [&_button]:h-7 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">
                <ClienteSelector />
              </div>
            )}
            {fazendas.length > 1 && (
              <div className="[&_button]:text-xs [&_button]:h-7 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">
                <FazendaSelector />
              </div>
            )}
          </div>
        </div>
        <V2FilterBar ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} tipo={periodoTipo} showFazenda={false} />
        <div className="flex-1 min-h-0 min-w-0 overflow-auto pb-16">
          <div className="w-full min-w-0">
            {renderContent()}
          </div>
        </div>
        <V2MobileNav activeSection={section} onNavigate={setSection} />
      </div>

    </div>
  );
}
