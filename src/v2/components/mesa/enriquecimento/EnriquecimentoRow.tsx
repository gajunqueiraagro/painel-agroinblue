// EnriquecimentoRow — dumb. Linha densa de largura FIXA (colunas alinham entre
// linhas; só o texto interno faz ellipsis). Componente próprio da Mesa de
// Enriquecimento. Só apresenta o VM pronto.
import type { ReactNode } from 'react';
import { TOM_CLS, STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoRowProps {
  row: EnriqRowVM;
  selecionado: boolean;
  onSelecionar: () => void;
}

// Templates FIXOS reutilizados por todas as linhas (alinhamento estável).
const L1 = '10px 58px 84px minmax(0,1fr) minmax(0,1fr)';
const L2 = '10px minmax(0,1.3fr) 64px minmax(0,1fr) minmax(0,1.5fr)';

function Cel({ children, title, cls }: { children: ReactNode; title?: string; cls?: string }) {
  return <span className={`truncate ${cls ?? ''}`} title={title}>{children}</span>;
}

export function EnriquecimentoRow({ row, selecionado, onSelecionar }: EnriquecimentoRowProps) {
  const meta = STATUS_META[row.status] ?? STATUS_META.sem_match;
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className={`w-full text-left rounded-md border px-2 py-1 transition-colors ${
        selecionado ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
      }`}
    >
      {/* Linha 1: Match · Data · Valor · Banco · Fornecedor */}
      <div className="grid items-center gap-2 text-[11px]" style={{ gridTemplateColumns: L1 }}>
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} title={meta.label} />
        <Cel title={row.data} cls="text-muted-foreground tabular-nums">{row.data}</Cel>
        <Cel title={row.valor} cls="tabular-nums text-right">{row.valor}</Cel>
        <Cel title={row.banco}>{row.banco}</Cel>
        <Cel title={row.fornecedor}>{row.fornecedor}</Cel>
      </div>
      {/* Linha 2: (vazio) · Subcentro · Fazenda · Produto · Descrição */}
      <div className="grid items-center gap-2 text-[10px] text-muted-foreground mt-0.5" style={{ gridTemplateColumns: L2 }}>
        <span />
        <Cel title={row.subcentro} cls={TOM_CLS[row.subcentroTom]}>{row.subcentro}</Cel>
        <Cel title={row.fazenda}>{row.fazenda}</Cel>
        <Cel title={row.produto}>{row.produto}</Cel>
        <Cel title={row.descricao}>{row.descricao}</Cel>
      </div>
    </button>
  );
}
