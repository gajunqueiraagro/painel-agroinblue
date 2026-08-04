/**
 * ExtratoMaioresCompromissos — PR-FIN-V2-MAIORES-COMPROMISSOS-01.
 *
 * 5ª view do modo "Analisar Fluxo": "Principais Custos e Compromissos" — quais compromissos
 * pressionam o caixa. Visão gerencial de CONCENTRAÇÃO (não é extrato nem lista de lançamentos).
 *
 * Agrupador ÚNICO = centro_custo PERSISTIDO no lançamento (limpo, ~100% cobertura). Favorecido
 * NUNCA classifica (cadastro fragmentado) — entra só como detalhe no drill. Fonte: os mesmos
 * `itens` derivados de `linhas`/`dadosOrg`. Só saídas (mov<0). Exclui tesouraria (tipo '3-%').
 *
 * Ranking Top 10 centros + "Demais" (cauda agregada, clicável). Drill: centro → favorecidos
 * (detalhe) → lançamentos. Total sempre fecha com as saídas.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface ItemCompromisso {
  id: string; data: string; mov: number; tipo: string;
  centroPlano: string | null; fornecedor: string; produto: string | null;
}
interface Bucket { chave: string; total: number; count: number; itens: ItemCompromisso[]; ehDemais?: boolean; }
const isTransferencia = (tipo: string) => tipo.startsWith('3-');
const SEM_CENTRO = 'Sem centro';
const TOP_N = 10;
const COR = '#1e3a5f';
const COR_DEMAIS = '#94a3b8';
const diaBR = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export function ExtratoMaioresCompromissos({ itens, contaNome, periodoLabel }: {
  itens: ItemCompromisso[];
  contaNome: string;
  periodoLabel: string;
}) {
  const [drawer, setDrawer] = useState<string | null>(null);

  const { linhas, totalGeral, top, demais } = useMemo(() => {
    const map = new Map<string, Bucket>();
    let totalGeral = 0;
    for (const it of itens) {
      if (it.mov >= 0) continue; // só saídas de caixa
      if (isTransferencia(it.tipo)) continue; // exclui tesouraria (tipo '3-%')
      const v = Math.abs(it.mov);
      totalGeral += v;
      const chave = it.centroPlano || SEM_CENTRO;
      const e = map.get(chave) ?? { chave, total: 0, count: 0, itens: [] };
      e.total += v; e.count += 1; e.itens.push(it);
      map.set(chave, e);
    }
    const ordenado = [...map.values()].sort((a, b) => b.total - a.total);
    const top = ordenado.slice(0, TOP_N);
    const cauda = ordenado.slice(TOP_N);
    const demais: Bucket | null = cauda.length
      ? {
          chave: `Demais (${cauda.length} centro${cauda.length !== 1 ? 's' : ''})`,
          total: cauda.reduce((s, x) => s + x.total, 0),
          count: cauda.reduce((s, x) => s + x.count, 0),
          itens: cauda.flatMap((x) => x.itens),
          ehDemais: true,
        }
      : null;
    const linhas = demais ? [...top, demais] : top;
    return { linhas, totalGeral, top, demais };
  }, [itens]);

  const topTotal = useMemo(() => top.reduce((s, r) => s + r.total, 0), [top]);
  const topPag = useMemo(() => top.reduce((s, r) => s + r.count, 0), [top]);
  const totalPag = useMemo(() => linhas.reduce((s, r) => s + r.count, 0), [linhas]);
  const maxTotal = linhas.length ? linhas[0].total : 0;
  const pct = (v: number) => (totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const aberto = drawer ? linhas.find((r) => r.chave === drawer) ?? null : null;
  const itensAberto = useMemo(() => {
    if (!aberto) return [];
    return aberto.itens.slice().sort((a, b) =>
      a.data < b.data ? -1 : a.data > b.data ? 1 : Math.abs(b.mov) - Math.abs(a.mov));
  }, [aberto]);
  // Mini-ranking do drawer: favorecidos (centro normal) ou centros da cauda (Demais). Só detalhe.
  const miniRank = useMemo(() => {
    if (!aberto) return [];
    const m = new Map<string, { k: string; total: number; count: number }>();
    for (const it of aberto.itens) {
      const k = aberto.ehDemais ? (it.centroPlano || SEM_CENTRO) : (it.fornecedor || '—');
      const e = m.get(k) ?? { k, total: 0, count: 0 };
      e.total += Math.abs(it.mov); e.count += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [aberto]);

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-lg border p-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold">Principais Custos e Compromissos</div>
        <div className="text-[9px] text-muted-foreground">Por centro de custo · {contaNome} · {periodoLabel}</div>
      </div>

      {totalGeral === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
          Nenhuma saída de caixa no período (conforme filtros; transferências internas não contam).
        </div>
      ) : (
        <>
          {/* Concentração: Top 10 x Demais. */}
          <div className="rounded-md border p-2 space-y-1">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
              <span>Top {Math.min(TOP_N, top.length)}: <span className="font-semibold text-foreground">{formatMoeda(topTotal)}</span> · <span className="font-semibold" style={{ color: COR }}>{pct(topTotal)}%</span> das saídas · {topPag} pagamento{topPag !== 1 ? 's' : ''}</span>
              {demais && <span>Demais: <span className="font-semibold text-foreground">{formatMoeda(demais.total)}</span> · {pct(demais.total)}% · {demais.count} pagamento{demais.count !== 1 ? 's' : ''}</span>}
            </div>
            <div className="flex h-2 rounded overflow-hidden bg-muted">
              <div className="h-full" style={{ width: `${pct(topTotal)}%`, background: COR }} title={`Top ${TOP_N}: ${pct(topTotal)}%`} />
              {demais && <div className="h-full" style={{ width: `${pct(demais.total)}%`, background: COR_DEMAIS }} title={`Demais: ${pct(demais.total)}%`} />}
            </div>
          </div>

          {/* Ranking dos compromissos (centros). */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase text-muted-foreground">
                  <th className="text-left py-0.5 font-semibold w-5">#</th>
                  <th className="text-left py-0.5 font-semibold">Compromisso</th>
                  <th className="text-right py-0.5 font-semibold">Valor</th>
                  <th className="text-right py-0.5 font-semibold w-12">%</th>
                  <th className="text-right py-0.5 font-semibold w-14">nº pag.</th>
                  <th className="w-4" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((r, i) => {
                  const cor = r.ehDemais ? COR_DEMAIS : COR;
                  return (
                    <tr key={r.chave} onClick={() => setDrawer(r.chave)} className="border-t cursor-pointer hover:bg-muted/40">
                      <td className="py-0.5 text-muted-foreground tabular-nums">{r.ehDemais ? '—' : i + 1}</td>
                      <td className="py-0.5">
                        <span className="font-medium" style={{ color: cor }}>{r.chave}</span>
                        <div className="mt-0.5 h-1 rounded bg-muted overflow-hidden max-w-[160px]">
                          <div className="h-full rounded" style={{ width: `${maxTotal > 0 ? Math.round((r.total / maxTotal) * 100) : 0}%`, background: cor }} />
                        </div>
                      </td>
                      <td className="text-right tabular-nums py-0.5 whitespace-nowrap">{formatMoeda(r.total)}</td>
                      <td className="text-right tabular-nums py-0.5 font-semibold" style={{ color: cor }}>{pct(r.total)}%</td>
                      <td className="text-right tabular-nums py-0.5 text-muted-foreground">{r.count}</td>
                      <td className="text-right text-[9px] font-medium" style={{ color: cor }}>↗</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td />
                  <td className="py-0.5">Total</td>
                  <td className="text-right tabular-nums py-0.5 whitespace-nowrap">{formatMoeda(totalGeral)}</td>
                  <td className="text-right tabular-nums py-0.5">100%</td>
                  <td className="text-right tabular-nums py-0.5 text-muted-foreground">{totalPag}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-[9px] text-muted-foreground">
            Agrupado por centro de custo (classificação persistida) · só saídas de caixa · exclui tesouraria (transferências '3-%'). Favorecidos aparecem apenas como detalhe no compromisso.
          </div>
        </>
      )}

      {/* Drawer: centro → favorecidos (detalhe) → lançamentos. */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative h-full w-[480px] max-w-[92vw] bg-white border-l shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: `${aberto.ehDemais ? COR_DEMAIS : COR}55` }}>
              <div>
                <div className="text-[12px] font-semibold" style={{ color: aberto.ehDemais ? COR_DEMAIS : COR }}>{aberto.chave}</div>
                <div className="text-[9px] text-muted-foreground">{contaNome} · {periodoLabel} · {formatMoeda(aberto.total)} · {aberto.count} pagamento{aberto.count !== 1 ? 's' : ''}</div>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="text-[13px] leading-none px-1.5 py-0.5 rounded hover:bg-muted" aria-label="Fechar">✕</button>
            </div>

            <div className="flex-1 overflow-auto">
              {/* Mini-ranking (detalhe): favorecidos, ou centros da cauda quando "Demais". */}
              <div className="px-3 py-2 border-b">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">{aberto.ehDemais ? 'Centros agregados' : 'Favorecidos (detalhe)'}</div>
                <div className="space-y-0.5 max-h-[160px] overflow-auto">
                  {miniRank.map((m) => (
                    <div key={m.k} className="flex items-baseline justify-between gap-2 text-[10px]">
                      <span className="truncate" title={m.k}>{m.k}</span>
                      <span className="tabular-nums whitespace-nowrap text-muted-foreground">{formatMoeda(m.total)} · {m.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lançamentos. */}
              <table className="w-full border-collapse text-[10px]">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    {['Data', 'Favorecido', 'Descrição', 'Valor'].map((h, i) => (
                      <th key={h} className={`px-1.5 py-1 font-semibold uppercase text-[8px] ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensAberto.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{diaBR(it.data)}</td>
                      <td className="px-1.5 py-0.5 max-w-[110px] truncate" title={it.fornecedor || '—'}>{it.fornecedor || '—'}</td>
                      <td className="px-1.5 py-0.5 max-w-[110px] truncate" title={it.produto || '—'}>{it.produto || '—'}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums whitespace-nowrap">{formatMoeda(Math.abs(it.mov))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/30">
              <span className="text-[10px] text-muted-foreground">TOTAL DO COMPROMISSO</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: aberto.ehDemais ? COR_DEMAIS : COR }}>{formatMoeda(aberto.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
