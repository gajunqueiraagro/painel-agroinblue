// EnriquecimentoRow — dumb. Linha ENXUTA (lado Sistema): só serve para localizar
// o lançamento → Data · Valor · Banco · Favorecido (+ indicador de Match).
// Colunas de largura fixa (alinhamento estável); só o texto interno faz ellipsis.
// Produto/Fazenda/Subcentro/Descrição vivem no painel da direita.
import { STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
}

const COLS = '10px 60px 90px minmax(0,1fr) minmax(0,1.2fr)';

export function EnriquecimentoRow({ row, selecionado, onSelecionar }: EnriquecimentoRowProps) {
  const meta = STATUS_META[row.status] ?? STATUS_META.sem_match;
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full text-left rounded-md border px-2 py-1.5 transition-colors ${
        selecionado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
      }`}
    >
      <div className="grid items-center gap-2 text-[11px]" style={{ gridTemplateColumns: COLS }}>
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} title={meta.label} />
        <span className="truncate text-muted-foreground tabular-nums" title={row.data}>{row.data}</span>
        <span className="truncate tabular-nums text-right" title={row.valor}>{row.valor}</span>
        <span className="truncate" title={row.banco}>{row.banco}</span>
        <span className="truncate" title={row.fornecedor}>{row.fornecedor}</span>
      </div>
    </button>
  );
}
