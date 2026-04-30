import { LayoutDashboard, Layers, Target, MoreHorizontal, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V2Section } from './V2Sidebar';

const TABS: { id: V2Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'financeiro', label: 'Operação', icon: Layers },
  { id: 'meta-cenario', label: 'Plan.', icon: Target },
  { id: 'painel-anual', label: 'PC-100', icon: ClipboardCheck },
  { id: 'configuracoes', label: 'Mais', icon: MoreHorizontal },
];

function getHighlighted(s: V2Section): V2Section {
  if (['financeiro','rebanho','movimentacoes','indicadores'].includes(s)) return 'financeiro';
  if (['meta-cenario','meta-metas','painel-consultor'].includes(s)) return 'meta-cenario';
  if (s === 'configuracoes') return 'configuracoes';
  if (s === 'painel-anual') return 'painel-anual';
  return 'home';
}

export function V2MobileNav({ activeSection, onNavigate }: { activeSection: V2Section; onNavigate: (s: V2Section) => void }) {
  const highlighted = getHighlighted(activeSection);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card shadow-lg md:hidden" style={{ height: '64px', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex justify-around items-center h-16 w-full">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onNavigate(id)} className={cn('flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors', highlighted === id ? 'text-primary font-bold' : 'text-muted-foreground')}>
            <Icon className={cn('h-5 w-5', highlighted === id && 'scale-110')} />
            <span className="text-[10px] font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
