/**
 * RematchOnDemandPanel — preview operacional de rematch.
 *
 * Read-only. Estado local. Limpa ao trocar conta/mês.
 * NÃO cria vínculo. NÃO altera banco. Apenas sugere para revisão humana.
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  rematchOfxOnDemand,
  type RematchResultado,
} from '@/lib/financeiro/matchOfxOnDemand';

interface Props {
  clienteId: string;
  contaBancariaId: string;
  anoMes: string;
  contaLabel?: string;
  pendenciasCount: number;
}

function fmtDataBR(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function classificarResultado(r: RematchResultado):
  | { label: 'Match'; cls: string }
  | { label: 'Ambíguo'; cls: string }
  | { label: 'Agrupado'; cls: string }
  | { label: 'Parcial'; cls: string }
  | { label: 'Sem match'; cls: string } {
  if (r.candidatoMatch) {
    return {
      label: 'Match',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    };
  }
  if (r.ambiguo) {
    return { label: 'Ambíguo', cls: 'bg-amber-50 text-amber-700 border-amber-300' };
  }
  if (r.agrupado) {
    return { label: 'Agrupado', cls: 'bg-blue-50 text-blue-700 border-blue-300' };
  }
  if (r.semMatch) {
    return { label: 'Sem match', cls: 'bg-muted text-muted-foreground border-muted' };
  }
  return { label: 'Parcial', cls: 'bg-slate-50 text-slate-700 border-slate-300' };
}

export function RematchOnDemandPanel({
  clienteId,
  contaBancariaId,
  anoMes,
  contaLabel,
  pendenciasCount,
}: Props) {
  const [resultados, setResultados] = useState<RematchResultado[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Limpa estado ao trocar conta/mês
  useEffect(() => {
    setResultados(null);
    setErro(null);
    setExpandidos(new Set());
  }, [contaBancariaId, anoMes]);

  function toggleExpand(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRematch() {
    setLoading(true);
    setErro(null);
    try {
      const r = await rematchOfxOnDemand(supabase, {
        clienteId,
        contaBancariaId,
        anoMes,
      });
      setResultados(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao reprocessar matching';
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  // Resumo
  const resumo = resultados
    ? {
        total: resultados.length,
        match: resultados.filter((r) => r.candidatoMatch).length,
        ambiguo: resultados.filter((r) => r.ambiguo).length,
        agrupado: resultados.filter((r) => r.agrupado && !r.candidatoMatch).length,
        semMatch: resultados.filter((r) => r.semMatch).length,
      }
    : null;

  return (
    <div className="rounded-md border bg-card p-3 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold text-foreground">
            Reprocessar matching
          </div>
          <div className="text-[10px] text-muted-foreground">
            {contaLabel ? `${contaLabel} · ${anoMes}` : anoMes}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground">
          sugestão — não cria vínculo
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={loading || pendenciasCount === 0}
          onClick={handleRematch}
          title={pendenciasCount === 0 ? 'Sem pendências para reprocessar' : undefined}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Reprocessando…' : '🔄 Reprocessar matching'}
        </Button>
        {pendenciasCount > 0 && !resultados && (
          <span className="text-[11px] text-muted-foreground">
            {pendenciasCount} pendência(s) elegível(eis)
          </span>
        )}
      </div>

      {erro && (
        <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {erro}
        </div>
      )}

      {/* Resumo + lista */}
      {resultados && resumo && (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">
            {resumo.total} movimentos analisados ·{' '}
            <span className="text-emerald-700 font-medium">{resumo.match}</span> com match ·{' '}
            <span className="text-amber-700 font-medium">{resumo.ambiguo}</span> ambíguos ·{' '}
            <span className="text-blue-700 font-medium">{resumo.agrupado}</span> agrupados ·{' '}
            <span className="text-slate-700 font-medium">{resumo.semMatch}</span> sem match
          </div>

          <div className="text-[10px] text-muted-foreground italic">
            Sugestões de matching para {resumo.total} movimentos. Para criar o
            vínculo, use o fluxo de conciliação manual existente.
          </div>

          <div className="space-y-1 max-h-[50vh] overflow-auto pr-1">
            {resultados.map((r) => {
              const cls = classificarResultado(r);
              const isOpen = expandidos.has(r.ofx.id);
              const sinalValor = r.ofx.tipo_movimento === 'credito' ? r.ofx.valor : -r.ofx.valor;
              const descTrunc = (r.ofx.descricao ?? '').slice(0, 60);

              return (
                <div key={r.ofx.id} className="border rounded">
                  <button
                    type="button"
                    onClick={() => toggleExpand(r.ofx.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    {isOpen ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                    <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${cls.cls}`}>
                      {cls.label}
                      {r.candidatoMatch && ` · ${r.candidatoMatch.score}`}
                      {r.agrupado && !r.candidatoMatch && ` · ${r.agrupado.itens.length} itens`}
                    </Badge>
                    <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                      {fmtDataBR(r.ofx.data_movimento)}
                    </span>
                    <span
                      className={`text-[11px] tabular-nums font-medium shrink-0 ${
                        sinalValor < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatMoeda(sinalValor)}
                    </span>
                    <span className="text-[11px] truncate text-foreground" title={r.ofx.descricao ?? ''}>
                      {descTrunc}{(r.ofx.descricao?.length ?? 0) > 60 ? '…' : ''}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t bg-slate-50/40 px-2 py-2 space-y-2">
                      {/* Top 10 candidatos 1:1 */}
                      {r.candidatos1to1.length > 0 ? (
                        <div>
                          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase">
                            Top {Math.min(10, r.candidatos1to1.length)} candidatos 1:1
                          </div>
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left py-0.5">Data</th>
                                <th className="text-right py-0.5">Valor</th>
                                <th className="text-center py-0.5">Score</th>
                                <th className="text-left py-0.5">Descrição</th>
                                <th className="text-left py-0.5">Fazenda</th>
                                <th className="text-left py-0.5">Macro/Centro/Sub</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.candidatos1to1.map((c) => (
                                <tr key={c.lancamentoId} className="border-t border-slate-200">
                                  <td className="py-0.5 tabular-nums">{fmtDataBR(c.data)}</td>
                                  <td className="py-0.5 text-right tabular-nums">
                                    {formatMoeda(c.valor)}
                                  </td>
                                  <td className="py-0.5 text-center font-mono">{c.score}</td>
                                  <td
                                    className="py-0.5 truncate max-w-[160px]"
                                    title={c.descricao ?? ''}
                                  >
                                    {c.descricao ?? '—'}
                                  </td>
                                  <td className="py-0.5 truncate max-w-[100px]" title={c.fazenda ?? ''}>
                                    {c.fazenda ?? '—'}
                                  </td>
                                  <td
                                    className="py-0.5 truncate max-w-[180px]"
                                    title={[c.macroCusto, c.centroCusto, c.subcentro].filter(Boolean).join(' · ')}
                                  >
                                    {[c.macroCusto, c.centroCusto, c.subcentro].filter(Boolean).join(' · ') || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground italic">
                          Nenhum candidato 1:1 dentro da janela ±10 dias.
                        </div>
                      )}

                      {/* Grupo */}
                      {r.agrupado && (
                        <div>
                          <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase">
                            Agrupado · {r.agrupado.itens.length} lançamentos · soma {formatMoeda(r.agrupado.valorSomado)} · score {r.agrupado.score}
                          </div>
                          <ul className="text-[10px] space-y-0.5">
                            {r.agrupado.itens.map((c) => (
                              <li key={c.lancamentoId} className="flex gap-2">
                                <span className="tabular-nums">{fmtDataBR(c.data)}</span>
                                <span className="tabular-nums">{formatMoeda(c.valor)}</span>
                                <span className="truncate" title={c.descricao ?? ''}>
                                  {c.descricao ?? '—'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
