/**
 * V2Sidebar — Etapa 5 do plano incremental
 *
 * Sidebar enxuta com 5 itens top-level:
 *   Visão Geral · Rebanho · Financeiro · Planejamento · Configurações
 *
 * Rebanho / Financeiro / Planejamento chamam onDrawerToggle(id) — toggle:
 *   - mesmo grupo → fecha (null)
 *   - outro grupo → troca conteúdo do drawer
 *
 * V2Section e NAV_GRUPOS são sourced de navGrupos.ts.
 * V2Section é re-exportado para manter compatibilidade com V2Index.
 */
import { ReactNode } from 'react';
import {
  LayoutDashboard, Beef, DollarSign, Target,
  Settings, LogOut, KeyRound, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlterarSenhaDialog } from '@/components/AlterarSenhaDialog';
import logo from '@/assets/logo.png';
import { NAV_GRUPOS, SECTION_TO_GROUP } from '@/v2/lib/navGrupos';

// Re-export V2Section para compatibilidade com V2Index e V2MobileNav
export type { V2Section } from '@/v2/lib/navGrupos';
import type { V2Section } from '@/v2/lib/navGrupos';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface V2SidebarProps {
  activeSection: V2Section;
  onNavigate: (s: V2Section) => void;
  drawerAtivo?: string | null;
  onDrawerToggle?: (id: string | null) => void;
  clienteSelector?: ReactNode;
  fazendaSelector?: ReactNode;
  className?: string;
}

// Ícones dos grupos (ordem idêntica ao NAV_GRUPOS)
const GRUPO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  rebanho:      Beef,
  financeiro:   DollarSign,
  planejamento: Target,
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function V2Sidebar({
  activeSection,
  onNavigate,
  drawerAtivo,
  onDrawerToggle,
  clienteSelector,
  fazendaSelector,
  className,
}: V2SidebarProps) {
  const { signOut } = useAuth();
  const activeGroup = SECTION_TO_GROUP[activeSection] ?? null;

  function handleGroup(groupId: string) {
    if (!onDrawerToggle) return;
    onDrawerToggle(drawerAtivo === groupId ? null : groupId);
  }

  return (
    <aside className={cn(
      'flex flex-col w-56 shrink-0 h-screen bg-primary text-primary-foreground overflow-hidden',
      className,
    )}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-primary-foreground/10 shrink-0">
        <img src={logo} alt="AgroInBlue" className="h-6 w-auto shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">Agroinblue</p>
          <p className="text-[9px] text-primary-foreground/50 leading-tight">Gestão Rural</p>
        </div>
      </div>

      {/* Seletores */}
      {(clienteSelector || fazendaSelector) && (
        <div className="px-3 py-2 border-b border-primary-foreground/10 space-y-1.5 shrink-0">
          {clienteSelector && (
            <div className="[&_button]:w-full [&_button]:text-xs [&_button]:h-7 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">
              {clienteSelector}
            </div>
          )}
          {fazendaSelector && (
            <div className="[&_button]:w-full [&_button]:text-xs [&_button]:h-7 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">
              {fazendaSelector}
            </div>
          )}
        </div>
      )}

      {/* Navegação — 5 itens top-level */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">

        {/* Visão Geral */}
        <button
          onClick={() => { onNavigate('home'); onDrawerToggle?.(null); }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left',
            activeSection === 'home'
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground',
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Visão Geral
        </button>

        {/* Grupos com drawer — Rebanho, Financeiro, Planejamento */}
        {NAV_GRUPOS.map((grupo) => {
          const Icon = GRUPO_ICONS[grupo.id] ?? Target;
          const isDrawerOpen  = drawerAtivo === grupo.id;
          const isGroupActive = activeGroup  === grupo.id;
          const isHighlighted = isDrawerOpen || isGroupActive;

          return (
            <button
              key={grupo.id}
              onClick={() => handleGroup(grupo.id)}
              className={cn(
                'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left',
                isHighlighted
                  ? 'bg-primary-foreground/15 text-primary-foreground'
                  : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground',
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                {grupo.label}
              </span>
              <ChevronRight className={cn(
                'h-3 w-3 shrink-0 transition-transform duration-200',
                isDrawerOpen && 'rotate-90',
              )} />
            </button>
          );
        })}

        {/* Configurações */}
        <button
          onClick={() => { onNavigate('configuracoes'); onDrawerToggle?.(null); }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left',
            activeSection === 'configuracoes'
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Configurações
        </button>

      </nav>

      {/* Rodapé */}
      <div className="shrink-0 border-t border-primary-foreground/10 px-2 py-2 flex items-center justify-end gap-0.5">
        <AlterarSenhaDialog
          trigger={
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
              title="Alterar Senha"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <Button
          variant="ghost" size="icon"
          onClick={signOut}
          className="h-7 w-7 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
          title="Sair"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>

    </aside>
  );
}
