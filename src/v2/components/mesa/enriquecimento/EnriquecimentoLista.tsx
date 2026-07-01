// EnriquecimentoLista — dumb. Lista ampla (coluna esquerda) de EnriquecimentoRow.
import { EnriquecimentoRow } from './EnriquecimentoRow';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoListaProps {
  rows: EnriqRowVM[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}

export function EnriquecimentoLista({ rows, selecionadoId, onSelecionar }: EnriquecimentoListaProps) {
  if (rows.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground text-center py-8">
        Nenhuma linha nesta sessão/filtro.
      </div>
    );
  }
  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
      {rows.map((r) => (
        <EnriquecimentoRow
          key={r.id}
          row={r}
          selecionado={r.id === selecionadoId}
          onSelecionar={() => onSelecionar(r.id)}
        />
      ))}
    </div>
  );
}
