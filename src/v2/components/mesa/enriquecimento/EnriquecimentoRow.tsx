// EnriquecimentoRow — dumb. Linha compacta da lista (coluna esquerda).
// Componente PRÓPRIO da Mesa de Enriquecimento (layout inspirado no MesaRowCompact,
// mas SEM compartilhar responsabilidade entre telas). Só apresenta o VM.
import { fmtData, fmtBRL, fmtTexto, STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
}

export function EnriquecimentoRow({ row, selecionado, onSelecionar }: EnriquecimentoRowProps) {
  const meta = STATUS_META[row.status] ?? STATUS_META.sem_match;
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full text-left rounded-md border px-2.5 py-1.5 transition-colors ${
        selecionado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
      }`}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} title={meta.label} />
        <span className="w-11 shrink-0 text-muted-foreground">{fmtData(row.data)}</span>
        <span className="flex-1 min-w-0 truncate" title={row.descricao ?? ''}>{fmtTexto(row.descricao)}</span>
        <span className="shrink-0 tabular-nums">{fmtBRL(row.valor)}</span>
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
        <span className="truncate" title={row.subcentroProposto ?? ''}>
          <span className="opacity-60">Subcentro:</span> {fmtTexto(row.subcentroProposto)}
        </span>
        <span className="ml-auto shrink-0">
          {row.aplicado
            ? <span className="text-blue-600">aplicado</span>
            : row.mudaAlgo
              ? <span className="text-emerald-600">muda</span>
              : <span className="opacity-60">sem mudança</span>}
        </span>
      </div>
    </button>
  );
}
