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
  Settings, ChevronRight,
  Briefcase, ShieldCheck, Folder,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';
import { useCliente } from '@/contexts/ClienteContext';
import { SECTION_TO_GROUP } from '@/v2/lib/navGrupos';
import { gruposVisiveis, nivelDaTela } from '@/v2/lib/acessoTelas';

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
  /** RESUMO-CLIENTES-01 — no "Resumo dos clientes" o menu do cliente some e entram as abas do painel. */
  menuDoPainel?: ReactNode;
}

// Ícones dos grupos (ordem idêntica ao NAV_GRUPOS)
const GRUPO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  rebanho:      Beef,
  financeiro:   DollarSign,
  planejamento: Target,
  validar:      ShieldCheck,
  executivo:    Briefcase,
  auditoria:    ShieldCheck,
  cadastros:    Folder,
};

/* UI-SIDEBAR-ESTREITA-01 — A LARGURA DA BARRA LATERAL E' UMA SO', AQUI (Gabriel 21/10/2026; era 176, e antes 208). Medida no Chromium
   com a Inter (12px/500): o maior item do menu e' "Planejamento" com o icone e a seta — 16 + 8 + 77,8 + 8 + 12 = 121,8px de conteudo —
   + 8 + 8 do botao + 6 + 6 da navegacao = 149,8; a linha do logo pede 10 + 44,3 + 8 + 75,1 ("Agroinblue", 14px/700) + 10 = 147,4.
   152px deixa 2,2px de folga no menu. Nome de cliente ou de fazenda maior que o seletor corta com "…" (nome inteiro no `title`).
   Quem precisa da largura da barra (a bancada do `check:ui-cortes`) le' esta constante; nenhuma tela calibra largura por ela. */
/* UI-VARREDURA-01 L5 v2 (Gabriel 03/11/2026 12:32: a lateral DIMINUI — nunca mais que os 152 de antes; alvo 140–148). Item 12px · 28px ·
   ícone 16 · 8px entre ícone e texto. Medido no Chromium com a Inter (12px/500): "Planejamento" = 77,8px; com o ícone, os dois espaços de
   8, a seta de 12 e o padding do botão (6 + 6): 133,8; + o da navegação (4 + 4) = 141,8. 144px deixa 2,2px de folga. A tela à direita
   ganha 8px (152 → 144). */
export const LARGURA_DA_LATERAL = 144;

/* UI-VARREDURA-01 L5 — o item da lateral, UM lugar só (eram três cópias). Ativo: fundo 16% + barra branca de 3px à esquerda + negrito;
   hover discreto (7%). O `before:` é a barra; ela não ocupa largura (absoluta), então ativar não empurra o texto. */
const ITEM_LATERAL = 'relative w-full h-7 flex items-center gap-2 px-1.5 rounded-md text-xs font-medium transition-colors text-left';
const ITEM_ATIVO = "bg-primary-foreground/[0.16] text-primary-foreground font-semibold before:content-[''] before:absolute before:left-0 before:top-[6px] before:bottom-[6px] before:w-[3px] before:rounded-sm before:bg-primary-foreground";
const ITEM_INATIVO = 'text-primary-foreground/80 hover:bg-primary-foreground/[0.07] hover:text-primary-foreground';
const ICONE_LATERAL = 'h-4 w-4 shrink-0';

// ─── Componente ───────────────────────────────────────────────────────────────

export function V2Sidebar({
  activeSection,
  onNavigate,
  drawerAtivo,
  onDrawerToggle,
  clienteSelector,
  fazendaSelector,
  className,
  menuDoPainel,
}: V2SidebarProps) {
  const { isAdmin, clienteAtual } = useCliente();
  /* ACESSOS-02a — o que se OFERECE vem de UM dono (`nivelDaTela`): grupo sem item visivel some, e os dois botoes soltos
     (Visão Geral, Configurações) somem para quem nao tem a tela. Para o admin nada muda. */
  const perfil = clienteAtual?.perfil ?? null;
  const veHome = nivelDaTela(perfil, isAdmin, 'home') !== 'nao';
  const veConfiguracoes = nivelDaTela(perfil, isAdmin, 'configuracoes') !== 'nao';
  const activeGroup = SECTION_TO_GROUP[activeSection] ?? null;

  function handleGroup(groupId: string) {
    if (!onDrawerToggle) return;
    onDrawerToggle(drawerAtivo === groupId ? null : groupId);
  }

  return (
    /* UI-SIDEBAR-ESTREITA-01: a largura e' `LARGURA_DA_LATERAL` (era 176, `w-44`). Texto que não cabe corta em UMA linha, com o nome
       inteiro no `title`. */
    <aside className={cn(
      'flex flex-col shrink-0 h-screen bg-primary text-primary-foreground overflow-hidden',
      className,
    )} style={{ width: LARGURA_DA_LATERAL }} data-testid="barra-lateral">

      {/* Logo */}
      <div className="flex items-center gap-1.5 px-2 py-2.5 border-b border-primary-foreground/10 shrink-0">
        <img src={logo} alt="AgroInBlue" className="h-5 w-auto shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight truncate">Agroinblue</p>
          <p className="text-[8.5px] text-primary-foreground/50 leading-tight">Gestão Rural</p>
        </div>
      </div>

      {/* Seletores */}
      {(clienteSelector || fazendaSelector) && (
        <div className="px-1 py-1.5 border-b border-primary-foreground/10 space-y-1 shrink-0">
          {/* `[&_button>span]:flex-1`: o nome fica colado ao icone; sem ele um nome curto ia para o meio do campo */}
          {clienteSelector && (
            <div className="[&_button>span]:flex-1 [&_button]:w-full [&_button]:min-w-0 [&_button]:text-[11px] [&_button]:h-[30px] [&_button]:px-1.5 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">
              {clienteSelector}
            </div>
          )}
          {/* UI-SIDEBAR-ESTREITA-01 — LUGAR RESERVADO: cliente com uma fazenda so' (e o Resumo dos clientes) nao tem seletor de fazenda;
              sem o lugar, trocar de cliente subia o menu inteiro 34px. A linha de 30px (L5) existe sempre que ha' o seletor de cliente. */}
          {fazendaSelector ? (
            <div className="[&_button]:w-full [&_button]:min-w-0 [&_button]:text-[11px] [&_button]:h-[30px] [&_button]:px-1.5 [&_button]:bg-primary-foreground/10 [&_button]:text-primary-foreground [&_button]:border-0">
              {fazendaSelector}
            </div>
          ) : clienteSelector ? <div className="h-[30px]" aria-hidden data-testid="lugar-do-seletor-de-fazenda" /> : null}
        </div>
      )}

      {/* Navegação — 5 itens top-level */}
      <nav className="flex-1 overflow-y-auto py-1.5 px-1">
        {menuDoPainel ?? (<>

        {/* Visão Geral */}
        {veHome && (
        <button
          onClick={() => { onNavigate('home'); onDrawerToggle?.(null); }}
          className={cn(ITEM_LATERAL, activeSection === 'home' ? ITEM_ATIVO : ITEM_INATIVO)}
        >
          <LayoutDashboard className={ICONE_LATERAL} />
          <span className="min-w-0 truncate" title="Visão geral">Visão geral</span>
        </button>
        )}

        {/* Grupos com drawer — Rebanho, Financeiro, Planejamento */}
        {/* ⚠ O GRUPO "Validar" SO' APARECE PARA O ADMIN — PR-VALIDAR-01. `isAdmin` ja'
            existe no `ClienteContext` (RPC `is_admin_agroinblue`, com cache por usuario),
            entao nao ha hook novo: o front ja sabia, faltava perguntar. */}
        {gruposVisiveis(perfil, isAdmin).map((grupo) => {
          const Icon = GRUPO_ICONS[grupo.id] ?? Target;
          const isDrawerOpen  = drawerAtivo === grupo.id;
          const isGroupActive = activeGroup  === grupo.id;
          const isHighlighted = isDrawerOpen || isGroupActive;

          return (
            <button
              key={grupo.id}
              onClick={() => handleGroup(grupo.id)}
              className={cn(ITEM_LATERAL, 'justify-between', isHighlighted ? ITEM_ATIVO : ITEM_INATIVO)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={ICONE_LATERAL} />
                <span className="min-w-0 truncate" title={grupo.label}>{grupo.label}</span>
              </span>
              <ChevronRight className={cn(
                'h-3 w-3 shrink-0 transition-transform duration-200',
                isDrawerOpen && 'rotate-90',
              )} />
            </button>
          );
        })}

        {/* Configurações */}
        {veConfiguracoes && (
        <button
          onClick={() => { onNavigate('configuracoes'); onDrawerToggle?.(null); }}
          className={cn(ITEM_LATERAL, activeSection === 'configuracoes' ? ITEM_ATIVO : ITEM_INATIVO)}
        >
          <Settings className={ICONE_LATERAL} />
          <span className="min-w-0 truncate" title="Configurações">Configurações</span>
        </button>
        )}
        </>)}

      </nav>

      {/* ⚠ O RODAPÉ SAIU — ACESSO-CONVITE-01 (D5). Ele guardava só a 🔑 do "Alterar senha" (o "Sair" já tinha ido para a
          `BarraSecao` no PR-BARRA-UNICA-01c). O "Trocar senha" foi para o mesmo lugar do Sair: a barra do topo existe no
          computador E no celular, e a sidebar só no computador. */}

    </aside>
  );
}
