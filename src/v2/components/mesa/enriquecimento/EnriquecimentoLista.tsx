// EnriquecimentoLista — dumb. Coluna esquerda = SELECIONAR o lançamento.
// Cabeçalho "SISTEMA" + linhas enxutas (Data/Valor/Banco/Favorecido).
import { EnriquecimentoRow } from './EnriquecimentoRow';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoListaProps {
  rows: EnriqRowVM[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}

const COLS = '10px 60px 90px minmax(0,1fr) minmax(0,1.2fr)';

export function EnriquecimentoLista({ rows, selecionadoId, onSelecionar }: EnriquecimentoListaProps) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-2 py-1.5 border-b bg-muted/40">
        <div className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground">Sistema</div>
        <div className="grid items-center gap-2 text-[9px] uppercase tracking-wide text-muted-foreground/70 mt-0.5" style={{ gridTemplateColumns: COLS }}>
          <span />
          <span>Data</span>
          <span className="text-right">Valor</span>
          <span>Banco</span>
          <span>Favorecido</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-8">Nenhuma linha nesta sessão/filtro.</div>
      ) : (
        <div className="space-y-1 p-1.5 max-h-[62vh] overflow-y-auto">
          {rows.map((r) => (
            <EnriquecimentoRow
              key={r.id}
              row={r}
              selecionado={r.id === selecionadoId}
              onSelecionar={() => onSelecionar(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
