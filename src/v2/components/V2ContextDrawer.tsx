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
import { useCliente } from '@/contexts/ClienteContext';
import { secoesVisiveis } from '@/v2/lib/acessoTelas';
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
  /* UI-VARREDURA-01 L5 (Gabriel 03/11/2026, escala da AgriWebb): item de 12px e 28px de altura em TODO grupo (L5 v2) (o "compacto" da
     Produção deixou de existir: a escala nova já é a enxuta, e 28px é o piso do toque no celular).
     Ativo = o mesmo da lateral: fundo 16% + barra branca de 3px + negrito; hover discreto (7%).
     O item "em construção" não chega aqui: `secoesVisiveis` (o dono) já o tira do menu.
     ⚠ CORES DO DRAWER, nao os tokens claros do sistema: o painel e' navy com texto branco. */
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'relative w-full h-7 flex items-center gap-2 px-2.5 rounded-md text-left text-xs transition-colors duration-150',
        isActive
          ? "bg-white/[0.16] text-white font-semibold before:content-[''] before:absolute before:left-0 before:top-[6px] before:bottom-[6px] before:w-[3px] before:rounded-sm before:bg-white"
          : 'text-white/90 hover:bg-white/[0.07] hover:text-white',
        destacar && !isActive && 'font-semibold text-white',
      )}
    >
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
  /* ACESSOS-02a — o hook vem ANTES do `return` antecipado (regra dos hooks). */
  const { isAdmin, clienteAtual } = useCliente();
  if (!grupoAtivo) return null;
  const grupo = NAV_GRUPOS.find((g) => g.id === grupoAtivo);
  /* Produção: sem destaque de item (os cabecalhos de escopo organizam a lista). A densidade e' uma so' desde o L5. */
  const ehProducao = grupo?.id === 'rebanho';
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
          /* UI-VARREDURA-01 L5 v2: 200px (era 240) e fundo navy SÓLIDO, sem desfoque (a AgriWebb) */
          'absolute top-0 left-0 h-full w-[200px]',
          'bg-primary border-r border-white/10 shadow-xl z-50',
          'flex flex-col overflow-y-auto',
          'transition-transform duration-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {grupo && (
          <>
            {/* Cabeçalho do grupo */}
            {/* UI-VARREDURA-01 L5: o nome do grupo em sentence case, 14px, sem caixa alta nem espaçamento de letra */}
            <div className="px-3 pt-3 pb-1.5 shrink-0">
              <p className="text-[13px] font-semibold text-white">
                {grupo.label}
              </p>
            </div>

            {/* Seções e itens */}
            <nav className="flex-1 px-1.5 pb-3">
              {/* ⚠ `key` PELO INDICE: desde PR-NAV-PRODUCAO-01 existe secao SEM titulo, e
                  duas vazias colidiriam numa chave feita de `titulo`.
                  ⚠ SECAO SEM CABECALHO ganha um filete abaixo, que e' a linha que separa
                  ela do cabecalho seguinte — sem ele o item solto pareceria pertencer ao
                  grupo de baixo, que e' justamente o que o desenho quer evitar. */}
              {/* ACESSOS-02a — so' os itens que a pessoa acessa (`secoesVisiveis`, do dono); a secao sem item some. */}
              {secoesVisiveis(clienteAtual?.perfil ?? null, isAdmin, grupo).map((secao, i) => (
                <div key={`${secao.titulo}-${i}`} role="group"
                  aria-label={secao.titulo || undefined}
                  /* L5: as secoes separadas por UM filete + 8px (eram 20–24px de vazio) */
                  className={cn('pt-1.5 pb-1', i > 0 && 'mt-1 border-t border-white/[0.08]')}>
                  {secao.titulo && (
                    /* L5: título de seção pequeno e discreto: 10px (L5 v2), cor secundária, sentence case, sem espaçamento de letra */
                    <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-medium text-white/55 select-none">
                      {secao.titulo}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {secao.itens.map((item) => (
                      <DrawerItem
                        key={item.id}
                        item={item}
                        isActive={activeSection === item.id}
                        destaqueDesligado={ehProducao}
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
