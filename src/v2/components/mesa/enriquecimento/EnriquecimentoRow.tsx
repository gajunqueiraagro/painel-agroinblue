// EnriquecimentoRow — dumb. Linha densa do lado SISTEMA (localizar o lançamento).
// Linha 1: Match · Data · Banco · Valor (dominante, à direita).
// Linha 2: Favorecido. Largura fixa; só o texto interno faz ellipsis.
import { ESTADO_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
  hideBanco?: boolean;   // U2 — sob filtro por conta, Banco é redundante
}

// U2 — com Banco: dot · data · banco · valor; sem Banco: dot · data · valor (preenche).
const COLS_BANCO = '8px 46px minmax(0,1fr) 92px';
const COLS_SEM   = '8px 46px minmax(0,1fr)';

export function EnriquecimentoRow({ row, selecionado, onSelecionar, hideBanco }: EnriquecimentoRowProps) {
  // PR-U2d-1 — o selo é o ESTADO operacional; resolvidas (aplicado/nada) recuam (só visíveis em "Todas").
  const estadoMeta = ESTADO_META[row.estado];
  const dimmed = !selecionado && (row.estado === 'aplicado' || row.estado === 'nada');
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full text-left rounded border px-1.5 py-px leading-tight transition-colors ${
        selecionado
          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
          : 'border-transparent bg-card hover:bg-muted/50'
      } ${dimmed ? 'opacity-45' : ''}`}
    >
      {/* Linha 1: Estado · Data · (Banco) · Valor (dominante). U3/U4 — fontes/altura menores. */}
      <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: hideBanco ? COLS_SEM : COLS_BANCO }}>
        <span className={`h-1.5 w-1.5 rounded-full ${estadoMeta.dot}`} title={estadoMeta.label} />
        <span className="truncate text-[9px] text-muted-foreground tabular-nums" title={row.data}>{row.data}</span>
        {!hideBanco && <span className="truncate text-[10px]" title={row.banco}>{row.banco}</span>}
        <span className="truncate text-right text-[11px] font-bold tabular-nums" title={row.valor}>{row.valor}</span>
      </div>
      {/* Linha 2: selo do estado + Favorecido (lista é localizador → pode truncar). */}
      <div className="flex items-center gap-1" style={{ paddingLeft: 15 }}>
        <span className={`text-[9px] font-semibold shrink-0 ${estadoMeta.cls}`}>{estadoMeta.short}</span>
        <span className="truncate text-[9px] text-muted-foreground" title={row.fornecedor}>· {row.fornecedor}</span>
      </div>
    </button>
  );
}
