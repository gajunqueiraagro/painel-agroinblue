import { ReactNode } from 'react';
import { LayoutDashboard, Layers, Target, Settings, LogOut, KeyRound, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlterarSenhaDialog } from '@/components/AlterarSenhaDialog';
import logo from '@/assets/logo.png';

export type V2Section = 'home' | 'financeiro' | 'rebanho' | 'movimentacoes' | 'indicadores' | 'meta-cenario' | 'meta-metas' | 'painel-consultor' | 'auditoria-anual' | 'painel-anual' | 'configuracoes';

const NAV: { label: string; icon: React.ComponentType<{ className?: string }>; directSection?: V2Section; items?: { id: V2Section; label: string }[]; }[] = [
  { label: 'Visão Geral', icon: LayoutDashboard, directSection: 'home' },
  { label: 'Operação', icon: Layers, items: [{ id: 'financeiro', label: 'Financeiro' }, { id: 'rebanho', label: 'Rebanho' }, { id: 'movimentacoes', label: 'Movimentações' }, { id: 'indicadores', label: 'Indicadores' }] },
  { label: 'Planejamento', icon: Target, items: [{ id: 'meta-cenario', label: 'Cenário META' }, { id: 'meta-metas', label: 'Metas Mensais' }, { id: 'painel-consultor', label: 'Painel Consultor' }, { id: 'auditoria-anual', label: 'Visão Anual — Auditoria' }, { id: 'painel-anual', label: 'Painel Consultor PC-100' }] },
  { label: 'Configurações', icon: Settings, directSection: 'configuracoes' },
];

function getActiveGroup(s: V2Section): string {
  if (s === 'home') return 'Visão Geral';
  if (['financeiro','rebanho','movimentacoes','indicadores'].includes(s)) return 'Operação';
  if (['meta-cenario','meta-metas','painel-consultor','auditoria-anual','painel-anual'].includes(s)) return 'Planejamento';
  return 'Configurações';
}

export interface V2SidebarProps { activeSection: V2Section; onNavigate: (s: V2Section) => void; clienteSelector?: ReactNode; fazendaSelector?: ReactNode; className?: string; }

export function V2Sidebar({ activeSection, onNavigate, clienteSelector, fazendaSelector, className }: V2SidebarProps) {
  const { signOut } = useAuth();
  const activeGroup = getActiveGroup(activeSection);
  return (
    <aside className={cn('flex flex-col w-56 shrink-0 h-screen bg-primary text-primary-foreground overflow-hidden', className)}>
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-primary-foreground/10 shrink-0">
        <img src={logo} alt="AgroInBlue" className="h-6 w-auto shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">Agroinblue</p>
          <p className="text-[9px] text-primary-foreground/50 leading-tight">Gestão Rural</p>
        </div>
      </div>
      {(clienteSelector || fazendaSelector) && (
        <div className="px-3 py-2 border-b border-primary-foreground/10 space-y-1.5 shrink-0">
          {clienteSelector && <div className="[&_button]:w-full [&_button]:text-xs [&_button]:h-7 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">{clienteSelector}</div>}
          {fazendaSelector && <div className="[&_button]:w-full [&_button]:text-xs [&_button]:h-7 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">{fazendaSelector}</div>}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV.map((group) => {
          const Icon = group.icon;
          const isGroupActive = activeGroup === group.label;
          if (group.directSection) {
            const isActive = activeSection === group.directSection || (group.label === 'Visão Geral' && isGroupActive);
            return (
              <button key={group.label} onClick={() => onNavigate(group.directSection!)} className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left', isActive ? 'bg-primary-foreground/15 text-primary-foreground' : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground')}>
                <Icon className="h-4 w-4 shrink-0" />{group.label}
              </button>
            );
          }
          return (
            <div key={group.label} className="pt-2 first:pt-0">
              <p className={cn('flex items-center gap-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest select-none', isGroupActive ? 'text-primary-foreground/80' : 'text-primary-foreground/35')}>
                <Icon className="h-3.5 w-3.5 shrink-0" />{group.label}
              </p>
              <div className="space-y-0.5">
                {(group.items ?? []).map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button key={item.id} onClick={() => onNavigate(item.id)} className={cn('w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 rounded-md text-xs transition-colors text-left', isActive ? 'bg-primary-foreground/15 text-primary-foreground font-medium' : 'text-primary-foreground/60 hover:bg-primary-foreground/10 hover:text-primary-foreground')}>
                      <ChevronRight className={cn('h-3 w-3 shrink-0', isActive && 'translate-x-0.5')} />{item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-primary-foreground/10 px-2 py-2 flex items-center justify-end gap-0.5">
        <AlterarSenhaDialog trigger={<Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10" title="Alterar Senha"><KeyRound className="h-3.5 w-3.5" /></Button>} />
        <Button variant="ghost" size="icon" onClick={signOut} className="h-7 w-7 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10" title="Sair"><LogOut className="h-3.5 w-3.5" /></Button>
      </div>
    </aside>
  );
}
