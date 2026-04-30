import { useState } from 'react';
import { ClienteSelector } from '@/components/ClienteSelector';
import { FazendaSelector } from '@/components/FazendaSelector';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { V2Sidebar, type V2Section } from './components/V2Sidebar';
import { V2FilterBar } from './components/V2FilterBar';
import { V2MobileNav } from './components/V2MobileNav';
import { V2Home } from './pages/V2Home';

export default function V2Index() {
  const [section, setSection] = useState<V2Section>('home');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const { clientes } = useCliente();
  const { fazendas } = useFazenda();

  function renderContent() {
    if (section === 'home') return <V2Home ano={ano} mes={mes} />;
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
          {isPlan ? 'Módulo de planejamento — edição de META exclusiva nesta seção (Fase 2).' : 'Tela existente integrada aqui na Fase 2, sem modificação.'}
        </p>
        <div className="p-6 rounded-lg border border-dashed border-border text-center text-muted-foreground text-sm">
          Conteúdo integrado na Fase 2.
          <br />
          <span className="text-xs">Tela original continua em / sem alteração.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <V2Sidebar
        activeSection={section}
        onNavigate={setSection}
        clienteSelector={clientes.length > 1 ? <ClienteSelector /> : undefined}
        fazendaSelector={fazendas.length > 1 ? <FazendaSelector /> : undefined}
        className="hidden md:flex"
      />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <div className="md:hidden flex items-center justify-between px-3 py-2 bg-primary text-primary-foreground shrink-0 shadow-sm">
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
        <div className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          {renderContent()}
        </div>
        <V2MobileNav activeSection={section} onNavigate={setSection} />
      </div>
    </div>
  );
}
