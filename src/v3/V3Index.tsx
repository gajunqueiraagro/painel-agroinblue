import { useState } from 'react';
import { V3Sidebar }    from './components/V3Sidebar';
import { V3TopBar }     from './components/V3TopBar';
import { V3PageShell }  from './components/V3PageShell';
import { V3WideScroll } from './components/V3WideScroll';
import { getV3PeriodoTipo } from './lib/v3PeriodoConfig';
import type { V3Section } from './lib/v3Sections';

// ── Página dummy — conteúdo puro, sem PageShell ───────────────────────────
function V3DummyPage({ ano, mes }: { ano: string; mes: string }) {
  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-bold">V3 — Página de validação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Filtros ativos: <strong>ano={ano}</strong> · <strong>mes={mes}</strong>
        </p>
      </div>

      {/* 3 cards em 2 colunas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0 [&>*]:min-w-0">
        {['Card A', 'Card B', 'Card C'].map(label => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="font-semibold">{label}</p>
            <p className="text-2xl font-black mt-1">R$ 0,00</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nenhum card deve ser cortado à direita
            </p>
          </div>
        ))}
      </div>

      {/* Loader centralizado no main */}
      <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          Loader centralizado no main (não na viewport inteira)
        </p>
      </div>

      {/* Tabela larga com 12 colunas */}
      <div>
        <p className="text-sm font-semibold mb-2">Tabela larga — scroll interno:</p>
        <V3WideScroll>
          <table className="min-w-[1200px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                    Col {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map(row => (
                <tr key={row} className="border-b border-border/50">
                  {Array.from({ length: 12 }, (_, col) => (
                    <td key={col} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {row}-{col + 1}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </V3WideScroll>
      </div>

      <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800 text-sm space-y-1">
        <p className="font-semibold">Critérios de aprovação:</p>
        <p>✅ Sidebar visível à esquerda</p>
        <p>✅ Conteúdo começa colado à sidebar</p>
        <p>✅ Filtros aparecem no topbar</p>
        <p>✅ 3 cards visíveis, nenhum cortado</p>
        <p>✅ Tabela larga tem scroll horizontal interno</p>
        <p>✅ Loader centralizado no main</p>
      </div>

    </div>
  );
}

// ── AppShell V3 ─────────────────────────────────────────────────────────────
export default function V3Index() {
  const [section, setSection] = useState<V3Section>('home');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));

  const periodoTipo = getV3PeriodoTipo(section);

  function renderContent() {
    // Fase 1: só dummy. Seções reais serão adicionadas após validação.
    return <V3DummyPage ano={ano} mes={mes} />;
  }

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* DESKTOP */}
      <div className="hidden md:flex h-full">
        <V3Sidebar activeSection={section} onNavigate={setSection} />
        <main className="flex-1 min-w-0 h-full flex flex-col">
          <V3TopBar
            periodoTipo={periodoTipo}
            ano={ano}
            mes={mes}
            onAnoChange={setAno}
            onMesChange={setMes}
          />
          <section className="flex-1 min-h-0 min-w-0 overflow-auto">
            <V3PageShell>
              {renderContent()}
            </V3PageShell>
          </section>
        </main>
      </div>
      {/* MOBILE */}
      <div className="flex flex-col items-center justify-center h-full md:hidden text-muted-foreground text-sm">
        V3 — mobile não implementado nesta fase
      </div>
    </div>
  );
}
