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
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-2 py-0.5 border-b bg-muted/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">
          Lançamentos do sistema
        </span>
        <span className="text-[9px] text-muted-foreground/70 tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-6">Nenhuma linha nesta sessão/filtro.</div>
      ) : (
        <div className="space-y-px p-1 max-h-[72vh] overflow-y-auto">
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
