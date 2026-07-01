// EnriquecimentoRow — dumb. Linha densa do lado SISTEMA (localizar o lançamento).
// Linha 1: Match · Data · Banco · Valor (dominante, à direita).
// Linha 2: Favorecido. Largura fixa; só o texto interno faz ellipsis.
import { STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
}

const COLS = '9px 52px minmax(0,1fr) 104px';

export function EnriquecimentoRow({ row, selecionado, onSelecionar }: EnriquecimentoRowProps) {
  const meta = STATUS_META[row.status] ?? STATUS_META.sem_match;
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full text-left rounded-md border px-2 py-1 transition-colors ${
        selecionado
          ? 'border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm'
          : 'border-transparent bg-card hover:bg-muted/50'
      }`}
    >
      {/* Linha 1: Match · Data · Banco · Valor (dominante) */}
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: COLS }}>
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} title={meta.label} />
        <span className="truncate text-[10px] text-muted-foreground tabular-nums" title={row.data}>{row.data}</span>
        <span className="truncate text-[11px]" title={row.banco}>{row.banco}</span>
        <span className="truncate text-right text-[13px] font-bold tabular-nums" title={row.valor}>{row.valor}</span>
      </div>
      {/* Linha 2: Favorecido */}
      <div className="truncate text-[11px] text-muted-foreground" style={{ paddingLeft: 19 }} title={row.fornecedor}>
        {row.fornecedor}
      </div>
    </button>
  );
}
