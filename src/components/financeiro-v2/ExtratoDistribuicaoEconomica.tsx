/**
 * ExtratoDistribuicaoEconomica — PR-FIN-V2-DISTRIBUICAO-ECONOMICA-01.
 *
 * 4ª view do modo "Analisar Fluxo": "para onde foi o dinheiro?". Ranking das SAÍDAS DE CAIXA
 * por macro_custo do PLANO DE CONTAS OFICIAL. Classificação vem EXCLUSIVAMENTE do plano
 * (macro_custo resolvido de plano_conta_id) — nunca de descrição/produto/favorecido/centro cru.
 *
 * Fonte: os mesmos `itens` derivados de `linhas` (mesma conta/mês/status/sinal do Extrato).
 * Pagamento = mov < 0 (valor = abs). Exclui tesouraria (tipo_operacao '3-%'), consistente com a
 * Organização. Modelo HÍBRIDO: macro classificado + bucket explícito "Sem classificação" +
 * indicador de cobertura por valor. Nunca esconder ausência de plano.
 *
 * Decisões FASE 1: Folha aparece só como "dos quais Mão de Obra" dentro de Custeio (sem linha
 * própria, sem dupla contagem); Investimentos/Dividendos entram no ranking marcados como não
 * operacionais; Juros/Amortização respeitam o plano (sem agrupamento derivado).
 */
import { useEffect, useMemo, useState } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface ItemEcon {
  id: string; data: string; mov: number; tipo: string;
  produto: string | null; fornecedor: string; doc: string;
  macro: string | null; grupo: string | null; centroPlano: string | null;
}
const isTransferencia = (tipo: string) => tipo.startsWith('3-');
const SEM_CLASS = 'Sem classificação no plano';
const NAO_OPERACIONAL = new Set(['Investimento na Fazenda', 'Investimento em Bovinos', 'Dividendos']);
const COR_OPER = '#1e3a5f';
const COR_NAO_OPER = '#d97706';
const COR_SEM = '#94a3b8';
const COBERTURA_MIN = 0.6; // abaixo disto → banner de ranking parcial
const diaBR = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const corDoMacro = (macro: string) => (macro === SEM_CLASS ? COR_SEM : NAO_OPERACIONAL.has(macro) ? COR_NAO_OPER : COR_OPER);

export function ExtratoDistribuicaoEconomica({ itens, contaNome, periodoLabel }: {
  itens: ItemEcon[];
  contaNome: string;
  periodoLabel: string;
}) {
  const [drawer, setDrawer] = useState<string | null>(null);

  const { ranking, totalGeral, totalClass, folhaCusteio } = useMemo(() => {
    const map = new Map<string, { macro: string; total: number; count: number; itens: ItemEcon[] }>();
    let totalGeral = 0, totalClass = 0, folhaCusteio = 0;
    for (const it of itens) {
      if (it.mov >= 0) continue; // só saídas de caixa
      if (isTransferencia(it.tipo)) continue; // exclui tesouraria (tipo '3-%')
      const valor = Math.abs(it.mov);
      totalGeral += valor;
      if (it.macro) totalClass += valor;
      if (it.macro === 'Custeio Produção' && it.centroPlano === 'Mão de Obra') folhaCusteio += valor;
      const macro = it.macro ?? SEM_CLASS;
      const e = map.get(macro) ?? { macro, total: 0, count: 0, itens: [] };
      e.total += valor; e.count += 1; e.itens.push(it);
      map.set(macro, e);
    }
    // "Sem classificação" sempre por último; demais por valor desc.
    const ranking = [...map.values()].sort((a, b) =>
      a.macro === SEM_CLASS ? 1 : b.macro === SEM_CLASS ? -1 : b.total - a.total);
    return { ranking, totalGeral, totalClass, folhaCusteio };
  }, [itens]);

  const cobertura = totalGeral > 0 ? totalClass / totalGeral : 0;
  const maxTotal = useMemo(() => ranking.reduce((m, r) => Math.max(m, r.total), 0), [ranking]);
  const pct = (v: number) => (totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const aberto = drawer ? ranking.find((r) => r.macro === drawer) ?? null : null;
  const itensAberto = useMemo(() => {
    if (!aberto) return [];
    return aberto.itens.slice().sort((a, b) =>
      a.data < b.data ? -1 : a.data > b.data ? 1 : Math.abs(b.mov) - Math.abs(a.mov));
  }, [aberto]);

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-lg border p-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold">Distribuição econômica</div>
        <div className="text-[9px] text-muted-foreground">Classificação pelo plano de contas · {contaNome} · {periodoLabel}</div>
      </div>

      {totalGeral === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
          Nenhuma saída de caixa no período (conforme filtros; transferências internas não contam).
        </div>
      ) : (
        <>
          {/* Indicador de cobertura por valor — nunca esconder ausência de plano. */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground">Cobertura do plano:</span>
            <div className="flex-1 h-2 rounded bg-muted overflow-hidden max-w-[220px]">
              <div className="h-full" style={{ width: `${Math.round(cobertura * 100)}%`, background: cobertura >= COBERTURA_MIN ? COR_OPER : COR_NAO_OPER }} />
            </div>
            <span className="font-semibold tabular-nums">{Math.round(cobertura * 100)}%</span>
            <span className="text-muted-foreground">dos valores classificados</span>
          </div>
          {cobertura < COBERTURA_MIN && (
            <div className="text-[10px] rounded border px-2 py-1" style={{ borderColor: `${COR_NAO_OPER}66`, background: `${COR_NAO_OPER}12`, color: '#7c4a03' }}>
              Classificação insuficiente neste período — ranking parcial (só {Math.round(cobertura * 100)}% dos valores têm plano de contas).
            </div>
          )}

          {/* Ranking por macro. */}
          <div className="space-y-1">
            {ranking.map((r) => {
              const cor = corDoMacro(r.macro);
              const naoOper = NAO_OPERACIONAL.has(r.macro);
              return (
                <button key={r.macro} type="button" onClick={() => setDrawer(r.macro)}
                  className="w-full text-left rounded-md border p-1.5 hover:bg-muted/40 focus:outline-none focus:ring-1"
                  style={{ borderColor: `${cor}44` }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-semibold truncate" style={{ color: cor }}>{r.macro}</span>
                      {naoOper && <span className="text-[8px] px-1 rounded shrink-0" style={{ background: `${COR_NAO_OPER}1f`, color: COR_NAO_OPER }}>não operacional</span>}
                      {r.macro === SEM_CLASS && <span className="text-[8px] px-1 rounded shrink-0" style={{ background: `${COR_SEM}22`, color: '#475569' }}>sem plano</span>}
                    </div>
                    <div className="flex items-baseline gap-2 shrink-0">
                      <span className="text-[12px] font-bold tabular-nums" style={{ color: cor }}>{formatMoeda(r.total)}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct(r.total)}%</span>
                      <span className="text-[9px] text-muted-foreground w-16 text-right">{r.count} lanç.</span>
                      <span className="text-[9px] font-medium" style={{ color: cor }}>↗</span>
                    </div>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${maxTotal > 0 ? Math.round((r.total / maxTotal) * 100) : 0}%`, background: cor }} />
                  </div>
                  {r.macro === 'Custeio Produção' && folhaCusteio > 0 && (
                    <div className="text-[9px] text-muted-foreground mt-0.5">dos quais Mão de Obra (Folha): <span className="font-semibold text-foreground">{formatMoeda(folhaCusteio)}</span></div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[9px] text-muted-foreground space-y-0.5">
            <div>Total de saídas: <span className="font-semibold text-foreground">{formatMoeda(totalGeral)}</span> · reage a conta/mês/status · exclui tesouraria (transferências '3-%').</div>
            <div>Classificação exclusiva do plano de contas oficial (macro_custo). Investimentos e Dividendos são saída de caixa não operacional.</div>
          </div>
        </>
      )}

      {/* Drawer — detalhe do macro (grupo/centro/lançamentos). */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative h-full w-[460px] max-w-[92vw] bg-white border-l shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: `${corDoMacro(aberto.macro)}55` }}>
              <div>
                <div className="text-[12px] font-semibold" style={{ color: corDoMacro(aberto.macro) }}>{aberto.macro}</div>
                <div className="text-[9px] text-muted-foreground">{contaNome} · {periodoLabel} · {itensAberto.length} lançamento{itensAberto.length !== 1 ? 's' : ''}</div>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="text-[13px] leading-none px-1.5 py-0.5 rounded hover:bg-muted" aria-label="Fechar">✕</button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    {['Data', 'Grupo', 'Centro', 'Descrição', 'Valor'].map((h, i) => (
                      <th key={h} className={`px-1.5 py-1 font-semibold uppercase text-[8px] ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensAberto.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{diaBR(it.data)}</td>
                      <td className="px-1.5 py-0.5 max-w-[90px] truncate text-muted-foreground" title={it.grupo || '—'}>{it.grupo || '—'}</td>
                      <td className="px-1.5 py-0.5 max-w-[80px] truncate text-muted-foreground" title={it.centroPlano || '—'}>{it.centroPlano || '—'}</td>
                      <td className="px-1.5 py-0.5 max-w-[110px] truncate" title={it.produto || '—'}>{it.produto || '—'}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums whitespace-nowrap">{formatMoeda(Math.abs(it.mov))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/30">
              <span className="text-[10px] text-muted-foreground">TOTAL {aberto.macro === SEM_CLASS ? '(sem plano)' : ''}</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: corDoMacro(aberto.macro) }}>{formatMoeda(aberto.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
