// EnriquecimentoLista — dumb. Coluna esquerda = SELECIONAR o lançamento.
// Cabeçalho explícito + linhas densas (2 níveis) via EnriquecimentoRow.
import { EnriquecimentoRow } from './EnriquecimentoRow';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoListaProps {
  rows: EnriqRowVM[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}

export function EnriquecimentoLista({ rows, selecionadoId, onSelecionar }: EnriquecimentoListaProps) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden md:h-full md:flex md:flex-col md:min-h-0">
      <div className="px-2 py-0.5 border-b bg-muted/40 flex items-baseline justify-between md:shrink-0">
        <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">
          Lançamentos do sistema
        </span>
        <span className="text-[9px] text-muted-foreground/70 tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-6">Nenhuma linha nesta sessão/filtro.</div>
      ) : (
        <div className="space-y-px p-1 overflow-y-auto max-h-[60vh] md:max-h-none md:flex-1 md:min-h-0">
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
