/**
 * V2ContextDrawer — Drawer contextual overlay do shell /v2
 *
 * NÃO empurra layout. Posicionado como overlay absoluto sobre o conteúdo.
 * O componente pai deve ter `position: relative`.
 *
 * Animação: translate-x (-100% fechado → 0 aberto)
 * Backdrop: fixed bg-black/20 — clicar chama onClose()
 */
import { Star, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NAV_GRUPOS,
  type V2Section,
  type NavItem,
} from '@/v2/lib/navGrupos';

// ─── Props ────────────────────────────────────────────────────────────────────

interface V2ContextDrawerProps {
  grupoAtivo: string | null;
  activeSection: V2Section;
  onSelect: (section: V2Section) => void;
  onClose: () => void;
}

// ─── Item do drawer ───────────────────────────────────────────────────────────

function DrawerItem({
  item,
  isActive,
  onSelect,
}: {
  item: NavItem;
  isActive: boolean;
  onSelect: (s: V2Section) => void;
}) {
  const isWrapper = item.status === 'needs-wrapper';
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors duration-150',
        isActive
          ? 'bg-white/10 text-white font-semibold shadow-[inset_2px_0_0_0_hsl(var(--primary-foreground))]'
          : 'text-white/85 hover:bg-white/[0.06] hover:text-white',
        item.primary && !isActive && 'font-semibold text-white',
      )}
    >
      {item.primary && (
        <Star className="h-3 w-3 shrink-0 text-amber-400 fill-amber-400" />
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {isWrapper && (
        <Circle className="h-1.5 w-1.5 shrink-0 fill-white/40 text-white/40" />
      )}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function V2ContextDrawer({
  grupoAtivo,
  activeSection,
  onSelect,
  onClose,
}: V2ContextDrawerProps) {
  if (!grupoAtivo) return null;
  const grupo = NAV_GRUPOS.find((g) => g.id === grupoAtivo);
  const isOpen = !!grupoAtivo;

  return (
    <>
      {/* Backdrop — clicar fora fecha o drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer overlay — absolute sobre o conteúdo principal */}
      <div
        className={cn(
          'absolute top-0 left-0 h-full w-60',
          'bg-primary/95 backdrop-blur-sm border-r border-white/10 shadow-xl z-50',
          'flex flex-col overflow-y-auto',
          'transition-transform duration-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {grupo && (
          <>
            {/* Cabeçalho do grupo */}
            <div className="px-4 py-4 border-b border-white/10 shrink-0">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/85">
                {grupo.label}
              </p>
            </div>

            {/* Seções e itens */}
            <nav className="flex-1 py-4 px-2 space-y-6">
              {grupo.drawer.map((secao) => (
                <div key={secao.titulo}>
                  <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/55 select-none">
                    {secao.titulo}
                  </p>
                  <div className="space-y-0.5">
                    {secao.itens.map((item) => (
                      <DrawerItem
                        key={item.id}
                        item={item}
                        isActive={activeSection === item.id}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </>
        )}
      </div>
    </>
  );
}
