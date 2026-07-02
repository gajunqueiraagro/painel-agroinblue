// EnriquecimentoDetalhe — dumb. Painel principal (direita): tabela comparativa
// densa Sistema atual | Excel | Resultado. Identidade de coluna por título/borda
// (P0-6, sem fundo). "Resultado" é um badge largo — slot pronto para, no futuro
// (P0-9), receber select/autocomplete/input sem redesenhar a tela.
import { TOM_BADGE, STATUS_META } from './fmt';
import type { EnriqRowVM } from './types';
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { ResultadoSubcentroEditor } from './ResultadoSubcentroEditor';

export interface EnriquecimentoDetalheProps {
  row: EnriqRowVM | null;
  // PR-U2c-2A — data layer para os editores inline (consumidos a partir do U2c-2B).
  classificacoes?: ClassificacaoItem[];
  fornecedores?: FornecedorV2[];
  fazendas?: Fazenda[];
  clienteId?: string;
  onEditar?: (patch: Record<string, unknown>) => Promise<void>;
}

// Larguras FIXAS — "Resultado" é a mais larga (coração da tela).
const COLS = '68px minmax(0,1fr) minmax(0,1.05fr) minmax(0,1.75fr)';

export function EnriquecimentoDetalhe({ row, classificacoes, onEditar }: EnriquecimentoDetalheProps) {
  if (!row) {
    return (
      <div className="rounded-lg border bg-card p-4 text-[11px] text-muted-foreground text-center">
        Selecione um lançamento à esquerda para analisar e decidir.
      </div>
    );
  }
  const meta = STATUS_META[row.status] ?? STATUS_META.sem_match;
  const bloqueado = row.comparativo.some((c) => c.tom === 'bloqueio');

  return (
    <div className="rounded-lg border bg-card md:max-h-full md:overflow-y-auto">
      {/* Cabeçalho do lançamento: Match · Data · Valor */}
      <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/30">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.cls}`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {row.statusLabel}
        </span>
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground tabular-nums">{row.data}</span>
        <span className="text-[13px] font-bold tabular-nums">{row.valor}</span>
      </div>

      <div className="px-2 py-1">
        {/* Cabeçalhos fortes + identidade de coluna (P0-4 / P0-6) */}
        <div className="grid gap-x-2" style={{ gridTemplateColumns: COLS }}>
          <span />
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 border-t-2 border-slate-300 pt-0.5">Sistema atual</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 border-t-2 border-blue-300 pt-0.5">Excel</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 border-t-2 border-emerald-400 pt-0.5">Resultado</span>
        </div>

        {/* Linhas densas, estilo planilha (P0-7) */}
        <div className="divide-y divide-border/50 mt-0.5">
          {row.comparativo.map((c) => (
            <div key={c.campo} className="grid gap-x-2 items-center py-px" style={{ gridTemplateColumns: COLS }}>
              <span className="text-[10px] text-muted-foreground truncate" title={c.campo}>{c.campo}</span>
              <span className="text-[11px] truncate" title={c.sistema}>{c.sistema}</span>
              <span className="text-[11px] text-blue-700/90 truncate" title={c.excel}>{c.excel}</span>
              <div className="min-w-0">
                {c.campo === 'Subcentro' && onEditar && classificacoes ? (
                  // PR-U2c-2B — editor inline do Subcentro (fonte única). Desabilitado em linha aplicada.
                  <ResultadoSubcentroEditor
                    value={row.edicao.subcentro}
                    tipoOperacao={row.edicao.tipoOperacao}
                    classificacoes={classificacoes}
                    disabled={row.aplicado}
                    onEditar={onEditar}
                  />
                ) : (
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] max-w-full truncate ${TOM_BADGE[c.tom]}`}
                    title={c.resultado}
                  >
                    {c.resultado}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Resumo do que o Aplicar faria */}
        <div className="text-[10px] border-t border-dashed pt-1 mt-1">
          {bloqueado
            ? <span className="text-red-700">Bloqueado no Aplicar: subcentro proposto fora do plano oficial.</span>
            : row.mudaAlgo
              ? <span className="text-emerald-700">Ao Aplicar, os campos “grava” são atualizados no lançamento existente (nunca cria lançamento).</span>
              : <span className="text-muted-foreground">Nada muda: os campos já estão preenchidos/idênticos ao proposto.</span>}
        </div>

        {/* PR-U2b — proveniência da resolução (read-only, rastreabilidade). '—' em linhas sem _meta. */}
        <div className="text-[10px] text-muted-foreground pt-0.5" title="Como esta proposta foi resolvida (metadado)">
          Resolução: {row.proveniencia.origem ?? '—'}
          {row.proveniencia.tier && row.proveniencia.tier !== row.proveniencia.origem ? ` (${row.proveniencia.tier})` : ''}
          {row.proveniencia.motorVersion != null ? ` · motor v${row.proveniencia.motorVersion}` : ''}
        </div>
      </div>
    </div>
  );
}
