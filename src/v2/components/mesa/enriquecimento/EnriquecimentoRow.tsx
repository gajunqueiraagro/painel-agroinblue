// EnriquecimentoRow — dumb. Linha densa do lado SISTEMA (localizar o lançamento).
// Linha 1: Match · Data · Banco · Valor (dominante, à direita).
// Linha 2: Favorecido. Largura fixa; só o texto interno faz ellipsis.
import { ESTADO_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
}

const COLS = '9px 52px minmax(0,1fr) 104px';

export function EnriquecimentoRow({ row, selecionado, onSelecionar }: EnriquecimentoRowProps) {
  // PR-U2d-1 — o selo é o ESTADO operacional; resolvidas (aplicado/nada) recuam (só visíveis em "Todas").
  const estadoMeta = ESTADO_META[row.estado];
  const dimmed = !selecionado && (row.estado === 'aplicado' || row.estado === 'nada');
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full text-left rounded border px-2 py-0.5 leading-tight transition-colors ${
        selecionado
          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
          : 'border-transparent bg-card hover:bg-muted/50'
      } ${dimmed ? 'opacity-45' : ''}`}
    >
      {/* Linha 1: Estado · Data · Banco · Valor (dominante) */}
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: COLS }}>
        <span className={`h-2 w-2 rounded-full ${estadoMeta.dot}`} title={estadoMeta.label} />
        <span className="truncate text-[10px] text-muted-foreground tabular-nums" title={row.data}>{row.data}</span>
        <span className="truncate text-[11px]" title={row.banco}>{row.banco}</span>
        <span className="truncate text-right text-[12px] font-bold tabular-nums" title={row.valor}>{row.valor}</span>
      </div>
      {/* Linha 2: selo do estado + Favorecido */}
      <div className="flex items-center gap-1" style={{ paddingLeft: 19 }}>
        <span className={`text-[9px] font-semibold shrink-0 ${estadoMeta.cls}`}>{estadoMeta.short}</span>
        <span className="truncate text-[10px] text-muted-foreground" title={row.fornecedor}>· {row.fornecedor}</span>
      </div>
    </button>
  );
}
