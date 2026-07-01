// EnriquecimentoDetalhe — dumb. Painel comparativo READ-ONLY (coluna direita):
// Sistema atual | Excel | Resultado para todos os campos. Só apresenta o VM.
import { TOM_CLS, STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoDetalheProps {
  row: EnriqRowVM | null;
}

// Larguras FIXAS — "Excel" recebe mais espaço (subcentros longos legíveis).
const COLS = '80px minmax(0,1fr) minmax(0,1.3fr) 92px';

export function EnriquecimentoDetalhe({ row }: EnriquecimentoDetalheProps) {
  if (!row) {
    return (
      <div className="rounded-lg border bg-card p-4 text-[11px] text-muted-foreground text-center">
        Selecione uma linha à esquerda para ver o comparativo.
      </div>
    );
  }
  const meta = STATUS_META[row.status] ?? STATUS_META.sem_match;
  const bloqueado = row.comparativo.some((c) => c.tom === 'bloqueio');

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Cabeçalho: Match · Data · Valor */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.cls}`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {row.statusLabel}
        </span>
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground tabular-nums">{row.data}</span>
        <span className="text-[11px] font-semibold tabular-nums">{row.valor}</span>
      </div>

      {/* Cabeçalho da tabela */}
      <div className="grid gap-x-2 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold border-b pb-1" style={{ gridTemplateColumns: COLS }}>
        <span />
        <span>Sistema atual</span>
        <span>Excel</span>
        <span>Resultado</span>
      </div>

      {/* Linhas do comparativo */}
      <div className="space-y-0.5">
        {row.comparativo.map((c) => (
          <div key={c.campo} className="grid gap-x-2 text-[11px] items-baseline" style={{ gridTemplateColumns: COLS }}>
            <span className="text-muted-foreground truncate" title={c.campo}>{c.campo}</span>
            <span className="truncate" title={c.sistema}>{c.sistema}</span>
            <span className="truncate" title={c.excel}>{c.excel}</span>
            <span className={`truncate ${TOM_CLS[c.tom]}`} title={c.resultado}>{c.resultado}</span>
          </div>
        ))}
      </div>

      {/* Resumo do que o Aplicar faria */}
      <div className="text-[10px] border-t border-dashed pt-1.5">
        {bloqueado
          ? <span className="text-red-700">Bloqueado no Aplicar: subcentro proposto fora do plano oficial.</span>
          : row.mudaAlgo
            ? <span className="text-emerald-700">Ao Aplicar, os campos “grava” são atualizados no lançamento existente (nunca cria lançamento).</span>
            : <span className="text-muted-foreground">Nada muda: os campos já estão preenchidos/idênticos ao proposto.</span>}
      </div>
    </div>
  );
}
