/**
 * VISAO-GERAL-02 — os cinco cartões do topo da Visão Geral (mock aprovado, 03/11/2026). Cada cartão é um BOTÃO para a tela dona do
 * número ("Abrir … ›"), e o número chega pronto da fonte dessa tela. Escala da casa: nada de texto grande (valor a 16px, rótulo a 11px).
 * Sem valor = "—", nunca zero. O detalhe tem altura reservada (uma linha), então trocar de mês não empurra o "Abrir ›".
 */
import { cn } from '@/lib/utils';

export interface CartaoVG {
  id: string;
  titulo: string;
  valor: string | null;
  detalhe?: string | null;
  tomDetalhe?: 'neutro' | 'positivo' | 'negativo';
  abrir: string;
  onAbrir?: () => void;
}

export function CartoesDoTopo({ cartoes, carregando }: { cartoes: readonly CartaoVG[]; carregando?: boolean }) {
  return (
    <section aria-label="Resumo" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="vg-cartoes">
      {cartoes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={c.onAbrir}
          disabled={!c.onAbrir}
          data-testid={`vg-cartao-${c.id}`}
          className="text-left bg-card rounded-xl border border-border/40 px-3.5 py-3 hover:border-primary/40 transition-colors disabled:cursor-default"
        >
          <div className="text-[11px] text-muted-foreground truncate">{c.titulo}</div>
          <div className={cn('text-base font-semibold text-foreground tabular-nums mt-0.5 truncate', carregando && 'text-transparent animate-pulse bg-muted rounded')}>
            {c.valor ?? '—'}
          </div>
          <div className={cn('text-[11px] mt-0.5 h-4 truncate tabular-nums',
            c.tomDetalhe === 'negativo' ? 'text-amber-700' : c.tomDetalhe === 'positivo' ? 'text-emerald-700' : 'text-muted-foreground')}>
            {c.detalhe ?? ''}
          </div>
          <div className="text-[11px] text-primary mt-1.5">{c.abrir} ›</div>
        </button>
      ))}
    </section>
  );
}
