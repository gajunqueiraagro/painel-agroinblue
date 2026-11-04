import { LayoutDashboard, Layers, Target, MoreHorizontal, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { V2Section } from './V2Sidebar';
import { useCliente } from '@/contexts/ClienteContext';
import { nivelDaTela } from '@/v2/lib/acessoTelas';

/* UI-VARREDURA-01 L5 (Gabriel 03/11/2026, M3) — os três botões do meio apontavam para ids SEM tela ('financeiro', 'meta-cenario',
   'painel-anual') e caíam no placeholder. Agora vão para telas que existem, com o rótulo por extenso:
   Lançamentos → Produção › Lançar › Pecuária · Planejamento → Visão geral do planejamento · PC-100 → Executivo › PC-100. */
const TABS: { id: V2Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'lancamentos-zoot', label: 'Lançamentos', icon: Layers },
  { id: 'planejamento-home', label: 'Planejamento', icon: Target },
  { id: 'painel-consultor', label: 'PC-100', icon: ClipboardCheck },
  { id: 'configuracoes', label: 'Mais', icon: MoreHorizontal },
];

/* o botão aceso: a própria tela do botão; fora delas, nenhum dos três do meio (Home só na home) */
function getHighlighted(s: V2Section): V2Section | null {
  return TABS.some((t) => t.id === s) ? s : null;
}

export function V2MobileNav({ activeSection, onNavigate }: { activeSection: V2Section; onNavigate: (s: V2Section) => void }) {
  const highlighted = getHighlighted(activeSection);
  /* ACESSOS-02a — a barra do celular consulta o MESMO dono do menu: aba cuja tela a pessoa nao acessa nao aparece, e sem nenhuma
     aba a barra some. Para o admin nada muda. */
  const { isAdmin, clienteAtual } = useCliente();
  const tabs = TABS.filter(({ id }) => nivelDaTela(clienteAtual?.perfil ?? null, isAdmin, id) !== 'nao');
  if (tabs.length === 0) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card shadow-lg md:hidden" style={{ height: '64px', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex justify-around items-center h-16 w-full">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onNavigate(id)} className={cn('flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors', highlighted === id ? 'text-primary font-bold' : 'text-muted-foreground')}>
            <Icon className={cn('h-5 w-5', highlighted === id && 'scale-110')} />
            <span className="text-[10px] font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
