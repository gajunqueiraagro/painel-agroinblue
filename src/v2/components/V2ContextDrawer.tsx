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

/* ⚠ `destaqueDesligado` — o grupo Produção NAO destaca item nenhum
   (PR-NAV-PRODUCAO-01, ajuste). Com cinco cabecalhos de escopo (Lançar, Pecuária,
   Agricultura, Silvicultura), a estrela e o peso forte competiam com eles: dois
   niveis de enfase disputando a mesma leitura, e o que organiza a lista e' o
   cabecalho, nao o item.
   ⚠ POR GRUPO, e nao global, porque o mecanismo continua valendo para quem vier.
   Hoje isso o torna inalcancavel: `primary` so existe nestes tres itens, todos em
   'rebanho'. Apagar o campo da config seria mais limpo — e' decisao do Gabriel, e
   ate ela chegar o campo fica onde esta. */
function DrawerItem({
  item,
  isActive,
  destaqueDesligado,
  onSelect,
}: {
  item: NavItem;
  isActive: boolean;
  destaqueDesligado: boolean;
  onSelect: (s: V2Section) => void;
}) {
  const isWrapper = item.status === 'needs-wrapper';
  const destacar = !!item.primary && !destaqueDesligado;
  /* ── AREA ANUNCIADA E AINDA NAO CONSTRUIDA (PR-NAV-PRODUCAO-01) ─────────────
     ⚠ NAO E' `<button disabled>`. Botao desabilitado sai do fluxo de foco e varios
     leitores de tela o pulam — o item ficaria invisivel para quem mais precisa da
     pista de que a area existe e esta por vir. Elemento nao interativo com
     `aria-disabled` continua sendo lido, e nao ha o que focar porque nao ha acao.
     ⚠ CORES DO DRAWER, nao os tokens claros do sistema: este painel e' `bg-primary/90`
     com texto branco. `text-muted-foreground` aqui seria cinza escuro sobre azul —
     ilegivel. A escala branca (/90, /65, /50, /45) e' a que ja existe no arquivo. */
  if (item.emConstrucao) {
    return (
      <div
        aria-disabled="true"
        title="Área ainda não disponível — em construção."
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs text-white/45 cursor-default select-none"
      >
        <span className="flex-1 truncate">{item.label}</span>
        <span className="shrink-0 text-[11px] text-white/50">em construção</span>
      </div>
    );
  }
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs transition-colors duration-150',
        isActive
          ? 'bg-white/[0.08] text-white font-semibold shadow-[inset_2px_0_0_0_hsl(var(--primary-foreground))]'
          : 'text-white/90 hover:bg-white/[0.06] hover:text-white',
        destacar && !isActive && 'font-semibold text-white',
      )}
    >
      {/* Sem estrela nao ha recuo fantasma a compensar: o icone ocupava um slot do
          flex, e quem nao o tinha ja comecava rente ao `px-3`. */}
      {destacar && (
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
          'bg-primary/90 backdrop-blur-sm border-r border-white/10 shadow-xl z-50',
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
              {/* ⚠ `key` PELO INDICE: desde PR-NAV-PRODUCAO-01 existe secao SEM titulo, e
                  duas vazias colidiriam numa chave feita de `titulo`.
                  ⚠ SECAO SEM CABECALHO ganha um filete abaixo, que e' a linha que separa
                  ela do cabecalho seguinte — sem ele o item solto pareceria pertencer ao
                  grupo de baixo, que e' justamente o que o desenho quer evitar. */}
              {grupo.drawer.map((secao, i) => (
                <div key={`${secao.titulo}-${i}`} role="group"
                  aria-label={secao.titulo || undefined}
                  className={secao.titulo ? undefined : 'pb-4 border-b border-white/10'}>
                  {secao.titulo && (
                    <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-white/65 select-none">
                      {secao.titulo}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {secao.itens.map((item) => (
                      <DrawerItem
                        key={item.id}
                        item={item}
                        isActive={activeSection === item.id}
                        destaqueDesligado={grupo.id === 'rebanho'}
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
