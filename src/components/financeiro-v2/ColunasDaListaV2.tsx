/**
 * FIN-V2-COLUNAS-02 — as células novas da lista de Lançamentos Financeiros: "Vínc." (os selos de vínculo) e "Safra" em duas linhas.
 * Só desenham o que `colunasDaListaV2.ts` decide.
 *
 * · SELO DE VÍNCULO: 13px, cores CLARAS (fundo pastel + letra na cor do tipo + borda fina), o nome no `title`. Com destino, é um
 *   botão que abre a origem e PARA a propagação (a linha não abre); sem destino, só a marca. Os da OC mantêm os testids de sempre
 *   (`icone-oc` com acesso, `marca-oc` sem acesso — ACESSOS-02b).
 * · SAFRA: linha 1 a 9px (a da tabela), linha 2 a 7px cinza (`.safra-atividade`, exceção declarada no index.css); a linha da
 *   tabela não muda de altura.
 */
import type { MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import type { SafraNaLista, TipoVinculo, Vinculo } from '@/lib/financeiro/colunasDaListaV2';

const COR_SELO: Record<TipoVinculo, string> = {
  O: 'bg-[#fef3c7] text-[#b45309] border-[#fcd34d]',
  F: 'bg-[#e0f2fe] text-[#0369a1] border-[#7dd3fc]',
  R: 'bg-[#ede9fe] text-[#6d28d9] border-[#c4b5fd]',
  P: 'bg-[#dcfce7] text-[#15803d] border-[#86efac]',
};
const SELO = 'inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[3px] border font-semibold leading-none';

export function CelulaVinculos({ vinculos, abrir }: {
  vinculos: readonly Vinculo[];
  /** O gesto de abrir a origem, por tipo; ausente = só a marca. */
  abrir?: Partial<Record<TipoVinculo, () => void>>;
}) {
  return (
    <span className="flex items-center gap-[2px]" data-testid="vinculos-da-linha">
      {vinculos.map(v => {
        const gesto = abrir?.[v.tipo];
        const testid = v.tipo === 'O' ? (gesto ? 'icone-oc' : 'marca-oc') : `vinculo-${v.tipo}`;
        if (!gesto) {
          return <span key={v.tipo} data-testid={testid} title={v.titulo} aria-label={v.titulo} className={cn(SELO, COR_SELO[v.tipo])}>{v.tipo}</span>;
        }
        return (
          <button key={v.tipo} type="button" data-testid={testid} title={`${v.titulo} — clique para abrir`} aria-label={v.titulo}
            onClick={(e: MouseEvent) => { e.stopPropagation(); gesto(); }}
            className={cn(SELO, COR_SELO[v.tipo], 'cursor-pointer hover:brightness-95')}>
            {v.tipo}
          </button>
        );
      })}
    </span>
  );
}

export function CelulaSafra({ safra }: { safra: SafraNaLista }) {
  return (
    <span className="flex min-w-0 flex-col leading-none" title={safra.titulo} data-testid="safra-da-linha">
      <span className="flex items-center gap-[2px] whitespace-nowrap font-medium tabular-nums" data-testid="safra-linha1">
        <span data-testid="safra-periodo">{safra.periodo}</span>
        {safra.selo && <span className="safra-selo rounded-[2px] border px-[1px] font-semibold text-muted-foreground" data-testid="safra-selo">{safra.selo}</span>}
      </span>
      {safra.linha2 && <span className="safra-atividade truncate pr-0.5 font-normal text-muted-foreground" data-testid="safra-linha2">{safra.linha2}</span>}
    </span>
  );
}
