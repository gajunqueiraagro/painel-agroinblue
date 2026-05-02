import type { V3Section } from '../lib/v3Sections';

interface V3SidebarProps {
  activeSection: V3Section;
  onNavigate: (s: V3Section) => void;
}

const NAV: { section: V3Section; label: string }[] = [
  { section: 'home',                    label: 'Início' },
  { section: 'financeiro-dashboard',    label: 'Dashboard Financeiro' },
  { section: 'fluxo-caixa',             label: 'Fluxo de Caixa' },
  { section: 'conferencia-lancamentos', label: 'Conferência' },
  { section: 'valor-rebanho',           label: 'Valor Rebanho' },
  { section: 'mapa-pastos',             label: 'Mapa Pastos' },
];

export function V3Sidebar({ activeSection, onNavigate }: V3SidebarProps) {
  return (
    <aside className="w-56 shrink-0 h-full bg-primary text-primary-foreground flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-primary-foreground/10 shrink-0">
        <p className="text-sm font-bold">Agroinblue</p>
        <p className="text-[10px] text-primary-foreground/60">v3 · fase 1</p>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV.map(({ section, label }) => (
          <button
            key={section}
            onClick={() => onNavigate(section)}
            className={[
              'w-full text-left px-4 py-2 text-sm transition-colors',
              activeSection === section
                ? 'bg-primary-foreground/15 font-semibold'
                : 'hover:bg-primary-foreground/10',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
