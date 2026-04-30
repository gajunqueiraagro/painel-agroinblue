/**
 * V2ContextDrawer — Drawer contextual do shell /v2
 *
 * Renderiza o conteúdo do grupo ativo (Rebanho / Financeiro / Planejamento)
 * com seções e itens navegáveis.
 *
 * Comportamento:
 *   - grupoAtivo === null → não renderiza (largura 0 via grid no pai)
 *   - clicar em item ready → onSelect(section) + drawer fecha (controlado pelo pai)
 *   - clicar em item needs-wrapper → onSelect(section) que abre placeholder no conteúdo
 *   - item primary (Fechamento de Pastos) → destaque visual font-semibold + ícone
 *
 * Posicionamento: empurra o conteúdo via grid no pai (não flutua sobre nada).
 * Largura: 240px fixo quando aberto.
 *
 * NÃO importado por ninguém ainda — Etapa 2 do plano incremental.
 * Será montado no V2Index na Etapa 4.
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
  /** ID do grupo ativo ('rebanho' | 'financeiro' | 'planejamento' | null) */
  grupoAtivo: string | null;
  /** Section atualmente aberta no conteúdo — para highlight do item */
  activeSection: V2Section;
  /** Chamado ao clicar em qualquer item (ready ou needs-wrapper) */
  onSelect: (section: V2Section) => void;
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
        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left text-xs transition-colors',
        // estado ativo
        isActive
          ? 'bg-primary/8 text-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        // item principal (Fechamento de Pastos)
        item.primary && 'font-semibold text-foreground',
      )}
    >
      {/* Ícone de destaque para item primary */}
      {item.primary && (
        <Star className="h-3 w-3 shrink-0 text-amber-500 fill-amber-500" />
      )}

      <span className="flex-1 truncate">{item.label}</span>

      {/* Indicador discreto para needs-wrapper */}
      {isWrapper && (
        <Circle className="h-1.5 w-1.5 shrink-0 fill-muted-foreground/40 text-muted-foreground/40" />
      )}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function V2ContextDrawer({
  grupoAtivo,
  activeSection,
  onSelect,
}: V2ContextDrawerProps) {
  const grupo = NAV_GRUPOS.find((g) => g.id === grupoAtivo);

  return (
    <div className={`shrink-0 h-screen bg-background border-r border-border flex flex-col transition-all duration-200 ${
      grupo ? 'w-60 overflow-y-auto' : 'w-0 overflow-hidden'
    }`}>
      {grupo && (
        <>
          {/* Cabeçalho do grupo */}
          <div className="px-4 py-3.5 border-b border-border shrink-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {grupo.label}
            </p>
          </div>

          {/* Seções e itens */}
          <nav className="flex-1 py-2 px-2 space-y-3">
            {grupo.drawer.map((secao) => (
          <div key={secao.titulo}>
            {/* Título da seção */}
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
              {secao.titulo}
            </p>

            {/* Itens da seção */}
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
  );
}
