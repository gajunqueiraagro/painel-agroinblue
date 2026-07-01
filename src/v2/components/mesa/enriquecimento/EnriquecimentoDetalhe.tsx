// EnriquecimentoDetalhe — dumb. Painel comparativo READ-ONLY (coluna direita):
// Sistema atual · Excel proposto · Resultado. Só apresenta o VM; nenhuma regra.
import { fmtData, fmtBRL, fmtTexto } from './fmt';
import type { EnriqRowVM } from './types';

export interface EnriquecimentoDetalheProps {
  row: EnriqRowVM | null;
}

function ResultadoSubcentro({ row }: { row: EnriqRowVM }) {
  if (row.subcentroOrfao) return <span className="text-red-700">não grava (fora do plano)</span>;
  if (row.gravaSubcentro) return <span className="text-emerald-700">grava</span>;
  return <span className="text-muted-foreground">mantém</span>;
}

export function EnriquecimentoDetalhe({ row }: EnriquecimentoDetalheProps) {
  if (!row) {
    return (
      <div className="rounded-lg border bg-card p-4 text-[11px] text-muted-foreground text-center">
        Selecione uma linha à esquerda para ver o comparativo.
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold truncate" title={row.descricao ?? ''}>{fmtTexto(row.descricao)}</div>
        <div className="text-[11px] text-muted-foreground shrink-0">{fmtData(row.data)} · {fmtBRL(row.valor)}</div>
      </div>

      <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        Comparativo — o que o “Aplicar” faria (read-only)
      </div>
      <div className="grid gap-x-3 gap-y-1 text-[11px] items-baseline" style={{ gridTemplateColumns: '90px 1fr 1fr 1.1fr' }}>
        <div />
        <div className="font-semibold text-muted-foreground text-[10px]">Sistema atual</div>
        <div className="font-semibold text-muted-foreground text-[10px]">Excel proposto</div>
        <div className="font-semibold text-muted-foreground text-[10px]">Resultado</div>

        <div className="text-muted-foreground">Subcentro</div>
        <div className="truncate" title={fmtTexto(row.subcentroAtual)}>{fmtTexto(row.subcentroAtual)}</div>
        <div className="truncate font-mono text-[10px]" title={fmtTexto(row.subcentroProposto)}>{fmtTexto(row.subcentroProposto)}</div>
        <div><ResultadoSubcentro row={row} /></div>

        <div className="text-muted-foreground">Favorecido</div>
        <div className="truncate" title={fmtTexto(row.favorecidoAtual)}>{fmtTexto(row.favorecidoAtual)}</div>
        <div className="truncate" title={fmtTexto(row.favorecidoProposto)}>{fmtTexto(row.favorecidoProposto)}</div>
        <div>{row.gravaFavorecido ? <span className="text-emerald-700">grava</span> : <span className="text-muted-foreground">mantém</span>}</div>
      </div>

      <div className="text-[10px] border-t border-dashed pt-2">
        {row.subcentroOrfao
          ? <span className="text-red-700">Bloqueado no Aplicar: subcentro proposto fora do plano oficial.</span>
          : row.mudaAlgo
            ? <span className="text-emerald-700">Ao Aplicar, os campos “grava” são atualizados no lançamento existente (nunca cria lançamento).</span>
            : <span className="text-muted-foreground">Nada muda: os campos já estão preenchidos/idênticos ao proposto.</span>}
      </div>
    </div>
  );
}
