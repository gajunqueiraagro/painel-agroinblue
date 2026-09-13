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
    // ⚠ O RESPIRO É NO INVÓLUCRO, não no painel: com `padding` aqui, o `h-full` do painel passa
    // a medir a altura JÁ DESCONTADA, e ele encolhe em vez de vazar. Um `margin` no painel
    // deixaria o `h-full` medindo a tela inteira e empurraria o rodapé do TOTAL para fora.
    <div className="fixed inset-0 z-50 flex justify-end p-3" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      {/* Solto das bordas, o painel deixa de ser um recorte da tela e vira uma peça — por isso
          borda e canto nos quatro lados, no lugar da `border-l` de quando ele colava. */}
      <div className="relative h-full w-[560px] max-w-[92vw] bg-white border rounded-md shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
