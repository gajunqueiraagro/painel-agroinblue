import { useState } from 'react';
import { ClienteSelector } from '@/components/ClienteSelector';
import { FazendaSelector } from '@/components/FazendaSelector';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { V2Sidebar, type V2Section } from './components/V2Sidebar';
import { V2FilterBar } from './components/V2FilterBar';
import { V2MobileNav } from './components/V2MobileNav';
import { V2ContextDrawer } from './components/V2ContextDrawer';
import { V2Home } from './pages/V2Home';
import { V2PainelConsultor } from './pages/V2PainelConsultor';
import { V2AuditoriaAnual } from './pages/V2AuditoriaAnual';
import { PainelConsultorTab } from '@/pages/PainelConsultorTab';
import { EvolucaoCategoriaTab } from '@/pages/EvolucaoCategoriaTab';
import { FechamentoTab } from '@/pages/FechamentoTab';
import { FinanceiroV2Tab } from '@/pages/FinanceiroV2Tab';
import { PastosTab } from '@/pages/PastosTab';
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

export default function V2Index() {
  const [section, setSection] = useState<V2Section>('home');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [drawerAtivo, setDrawerAtivo] = useState<string | null>(null);
  const { clientes } = useCliente();
  const { fazendas } = useFazenda();

  function renderContent() {
    if (section === 'home') return <V2Home ano={ano} mes={mes} />;
    if (section === 'painel-consultor') return <V2PainelConsultor ano={ano} mes={mes} />;
    if (section === 'auditoria-anual') return <V2AuditoriaAnual ano={ano} />;
    if (section === 'conciliacao') return (
      <ConciliacaoBancariaTab />
    );
    if (section === 'painel-financiamentos') return (
      <FinanciamentosPainelTab />
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
      <FinanceiroCaixaTab initialTab="importacao" hideInternalTabs />
    );
    if (section === 'rateio-adm') return (
      <FinanceiroCaixaTab initialTab="rateio" hideInternalTabs />
    );
    if (section === 'fluxo-caixa') return (
      <FinanceiroCaixaTab initialTab="fluxo" hideInternalTabs />
    );
    if (section === 'financeiro-dashboard') return (
      <FinanceiroCaixaTab initialTab="dashboard" hideInternalTabs />
    );
    if (section === 'pastos') return (
      <PastosTab />
    );
    if (section === 'financeiro-lanc') return (
      <FinanceiroV2Tab />
    );
    if (section === 'fechamento') return (
      <FechamentoTab />
    );
    if (section === 'evolucao-categoria') return (
      <EvolucaoCategoriaTab
        initialAno={ano}
        initialMes={mes === '0' ? undefined : mes.padStart(2, '0')}
      />
    );
    if (section === 'painel-anual') return (
      <PainelConsultorTab
        onBack={() => setSection('home')}
        filtroGlobal={{ ano, mes: parseInt(mes) || new Date().getMonth() + 1 }}
      />
    );
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
  }

  return (
    <div className="h-screen bg-background overflow-hidden">

      {/* ── Desktop: flex simples — drawer é overlay, não empurra layout ── */}
      <div className="hidden md:flex h-screen">
        <V2Sidebar
          activeSection={section}
          onNavigate={setSection}
          drawerAtivo={drawerAtivo}
          onDrawerToggle={setDrawerAtivo}
          clienteSelector={clienteSelector}
          fazendaSelector={fazendaSelector}
        />
        {/* Conteúdo principal — relative para ancorar o drawer overlay */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
          <V2FilterBar ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} showFazenda={false} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {renderContent()}
          </div>
          {/* Drawer overlay — absolute sobre o conteúdo, não desloca nada */}
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
        <V2FilterBar ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} showFazenda={false} />
        <div className="flex-1 min-h-0 overflow-y-auto pb-16">
          {renderContent()}
        </div>
        <V2MobileNav activeSection={section} onNavigate={setSection} />
      </div>

    </div>
  );
}
