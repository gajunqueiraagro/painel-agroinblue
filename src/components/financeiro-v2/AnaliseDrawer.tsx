/**
 * AnaliseDrawer — chassi visual compartilhado dos drawers da Análise Executiva.
 * PR-FIN-V2-ANALISE-DRAWERS-UX-01A.
 *
 * Responsabilidade: SOMENTE estrutura e comportamento comum (overlay, painel lateral direito,
 * largura padrão, header título/subtítulo, botão fechar, fechamento por ✕/clique-fora/Esc,
 * footer TOTAL). NENHUMA regra de negócio/cálculo/classificação — o corpo vem como `children`.
 */
import { useEffect, type ReactNode } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

export function AnaliseDrawer({ titulo, subtitulo, corAccent = '#1e3a5f', total, totalLabel = 'TOTAL', onClose, children }: {
  titulo: string;
  subtitulo: string;
  corAccent?: string;
  total: number;
  totalLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // ⚠ O PAINEL ANCORA NELE MESMO, NÃO NO PADDING DE UM PAI. A primeira tentativa deu o
    // respiro com `p-3` no invólucro e `h-full` no painel: topo e base ficaram, a DIREITA
    // continuou colada na janela. O recuo que se vê agora é do próprio painel — `inset-y-3`
    // e `right-3` —, e por isso não depende de ninguém acima dele na árvore.
    // ⚠ A ALTURA VEM DO PAR `top`/`bottom`, nunca de `h-full`: com `h-full` mais margem, o
    // painel mediria a TELA INTEIRA e o rodapé do TOTAL sairia por baixo. Com os dois lados
    // ancorados, a altura já nasce descontada, e o `flex-1 overflow-auto` do miolo é o que
    // mantém cabeçalho e rodapé visíveis com o conteúdo rolando entre eles.
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      {/* Solto das bordas, o painel deixa de ser um recorte da tela e vira uma peça — por isso
          borda e canto nos quatro lados, no lugar da `border-l` de quando ele colava.
          O `max-w` guarda o mesmo recuo dos dois lados em tela estreita.
          ⚠ OS SUBLINHADOS DO `calc` NÃO SÃO ENFEITE: o Tailwind os troca por espaço, e sem eles
          sai `calc(100vw-1.5rem)` — que é CSS INVÁLIDO (o `-` precisa de espaço dos dois lados)
          e o navegador DESCARTA a declaração em silêncio. Medido no CSS compilado: a regra
          existia na folha e o `max-width` computado era `none`. Erro escrito no PR-08. */}
      <div className="fixed inset-y-3 right-3 w-[560px] max-w-[calc(100vw_-_1.5rem)] bg-white border rounded-md shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Faixa superior de identidade (accent contextual, detalhe). */}
        <div className="h-[3px] shrink-0" style={{ background: corAccent }} />
        <div className="flex items-start justify-between gap-2 px-3 py-2 border-b bg-[#1e3a5f]/[0.04]">
          <div className="min-w-0">
            <div className="text-[13px] font-bold truncate text-[#1e3a5f]">{titulo}</div>
            <div className="text-[9px] text-muted-foreground truncate">{subtitulo}</div>
          </div>
          <button type="button" onClick={onClose} className="text-[13px] leading-none px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted shrink-0" aria-label="Fechar">✕</button>
        </div>

        <div className="flex-1 overflow-auto">{children}</div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t-2 bg-[#1e3a5f]/[0.05]" style={{ borderTopColor: corAccent }}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{totalLabel}</span>
          <span className="text-[14px] font-bold tabular-nums" style={{ color: corAccent }}>{formatMoeda(total)}</span>
        </div>
      </div>
    </div>
  );
}
