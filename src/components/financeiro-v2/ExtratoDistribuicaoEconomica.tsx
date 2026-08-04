/**
 * ExtratoDistribuicaoEconomica — PR-FIN-V2-DISTRIBUICAO-ECONOMICA + DISTRIBUICAO-NEGOCIO-01.
 *
 * 4ª view do modo "Analisar Fluxo": "para onde foi o dinheiro?". Ranking das SAÍDAS DE CAIXA.
 * Toggle de dimensão (mesma tela, mesma lógica, só muda a chave de agregação):
 *   - "Por natureza"  → macro_custo (classificação econômica do plano, persistida no lançamento);
 *   - "Por negócio"   → escopo_negocio (persistido no lançamento; pecuária/agricultura/administrativo).
 *
 * Fonte SEMPRE persistida no lançamento (macro_custo / escopo_negocio) — nunca descrição/produto/
 * favorecido/centro cru/conta bancária. Exclui tesouraria (tipo '3-%'). Modelo híbrido: bucket
 * explícito "Sem classificação" + indicador de cobertura por valor. Nunca esconder ausência.
 *
 * Badges "não operacional" e linha "dos quais Mão de Obra" são conceitos de macro → só no modo natureza.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface ItemEcon {
  id: string; data: string; mov: number; tipo: string;
  produto: string | null; fornecedor: string; doc: string;
  macro: string | null; grupo: string | null; centroPlano: string | null;
  escopo: string | null;
}
type Dimensao = 'macro' | 'negocio';
const isTransferencia = (tipo: string) => tipo.startsWith('3-');
const NAO_OPERACIONAL = new Set(['Investimento na Fazenda', 'Investimento em Bovinos', 'Dividendos']);
const NEGOCIO_LABEL: Record<string, string> = {
  pecuaria: 'Pecuária', agricultura: 'Agricultura', administrativo: 'Administrativo', financeiro: 'Financeiro/Outros',
};
const COR_OPER = '#1e3a5f';
const COR_NAO_OPER = '#d97706';
const COR_SEM = '#94a3b8';
const COBERTURA_MIN = 0.6; // abaixo disto → banner de ranking parcial
const diaBR = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export function ExtratoDistribuicaoEconomica({ itens, contaNome, periodoLabel }: {
  itens: ItemEcon[];
  contaNome: string;
  periodoLabel: string;
}) {
  const [dimensao, setDimensao] = useState<Dimensao>('macro');
  const [drawer, setDrawer] = useState<string | null>(null);

  const SEM = dimensao === 'macro' ? 'Sem classificação no plano' : 'Sem classificação';
  const rotulo = (it: ItemEcon): string | null => {
    if (dimensao === 'macro') return it.macro;
    if (!it.escopo) return null;
    return NEGOCIO_LABEL[it.escopo] ?? (it.escopo.charAt(0).toUpperCase() + it.escopo.slice(1));
  };
  const ehNaoOper = (chave: string) => dimensao === 'macro' && NAO_OPERACIONAL.has(chave);
  const corDoBucket = (chave: string) => (chave === SEM ? COR_SEM : ehNaoOper(chave) ? COR_NAO_OPER : COR_OPER);

  const { ranking, totalGeral, totalClass, folhaCusteio } = useMemo(() => {
    const map = new Map<string, { chave: string; total: number; count: number; itens: ItemEcon[] }>();
    let totalGeral = 0, totalClass = 0, folhaCusteio = 0;
    for (const it of itens) {
      if (it.mov >= 0) continue; // só saídas de caixa
      if (isTransferencia(it.tipo)) continue; // exclui tesouraria (tipo '3-%')
      const valor = Math.abs(it.mov);
      totalGeral += valor;
      const classif = rotulo(it);
      if (classif) totalClass += valor;
      if (dimensao === 'macro' && it.macro === 'Custeio Produção' && it.centroPlano === 'Mão de Obra') folhaCusteio += valor;
      const chave = classif ?? SEM;
      const e = map.get(chave) ?? { chave, total: 0, count: 0, itens: [] };
      e.total += valor; e.count += 1; e.itens.push(it);
      map.set(chave, e);
    }
    // "Sem classificação" sempre por último; demais por valor desc.
    const ranking = [...map.values()].sort((a, b) =>
      a.chave === SEM ? 1 : b.chave === SEM ? -1 : b.total - a.total);
    return { ranking, totalGeral, totalClass, folhaCusteio };
  }, [itens, dimensao]);

  const cobertura = totalGeral > 0 ? totalClass / totalGeral : 0;
  const maxTotal = useMemo(() => ranking.reduce((m, r) => Math.max(m, r.total), 0), [ranking]);
  const pct = (v: number) => (totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const aberto = drawer ? ranking.find((r) => r.chave === drawer) ?? null : null;
  const itensAberto = useMemo(() => {
    if (!aberto) return [];
    return aberto.itens.slice().sort((a, b) =>
      a.data < b.data ? -1 : a.data > b.data ? 1 : Math.abs(b.mov) - Math.abs(a.mov));
  }, [aberto]);

  const trocarDimensao = (d: Dimensao) => { setDimensao(d); setDrawer(null); };
  const TABS: { k: Dimensao; l: string }[] = [{ k: 'macro', l: 'Por natureza' }, { k: 'negocio', l: 'Por negócio' }];

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-lg border p-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold">Distribuição econômica</div>
        <div className="text-[9px] text-muted-foreground">
          {dimensao === 'macro' ? 'Classificação pelo plano de contas' : 'Por negócio (escopo do lançamento)'} · {contaNome} · {periodoLabel}
        </div>
      </div>

      {/* Toggle de dimensão. */}
      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <button key={t.k} type="button" onClick={() => trocarDimensao(t.k)}
            className={`px-2 py-0.5 rounded-md border text-[11px] ${dimensao === t.k ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-muted-foreground'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {totalGeral === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
          Nenhuma saída de caixa no período (conforme filtros; transferências internas não contam).
        </div>
      ) : (
        <>
          {/* Indicador de cobertura por valor — nunca esconder ausência. */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground">{dimensao === 'macro' ? 'Cobertura do plano:' : 'Cobertura por negócio:'}</span>
            <div className="flex-1 h-2 rounded bg-muted overflow-hidden max-w-[220px]">
              <div className="h-full" style={{ width: `${Math.round(cobertura * 100)}%`, background: cobertura >= COBERTURA_MIN ? COR_OPER : COR_NAO_OPER }} />
            </div>
            <span className="font-semibold tabular-nums">{Math.round(cobertura * 100)}%</span>
            <span className="text-muted-foreground">dos valores classificados</span>
          </div>
          {cobertura < COBERTURA_MIN && (
            <div className="text-[10px] rounded border px-2 py-1" style={{ borderColor: `${COR_NAO_OPER}66`, background: `${COR_NAO_OPER}12`, color: '#7c4a03' }}>
              Classificação insuficiente neste período — ranking parcial (só {Math.round(cobertura * 100)}% dos valores classificados).
            </div>
          )}

          {/* Ranking — cards compactos (alta densidade, 2–3 por linha). */}
          <div className="flex flex-wrap gap-1.5">
            {ranking.map((r) => {
              const cor = corDoBucket(r.chave);
              const naoOper = ehNaoOper(r.chave);
              return (
                <button key={r.chave} type="button" onClick={() => setDrawer(r.chave)}
                  className="rounded-md border p-2 flex-1 min-w-[220px] text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1"
                  style={{ borderColor: `${cor}44` }}>
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[11px] font-semibold leading-tight truncate" style={{ color: cor }}>{r.chave}</span>
                    <span className="text-[9px] font-medium shrink-0" style={{ color: cor }}>↗</span>
                  </div>
                  {(naoOper || r.chave === SEM) && (
                    <div className="mt-0.5">
                      {naoOper && <span className="text-[8px] px-1 rounded" style={{ background: `${COR_NAO_OPER}1f`, color: COR_NAO_OPER }}>não operacional</span>}
                      {r.chave === SEM && <span className="text-[8px] px-1 rounded" style={{ background: `${COR_SEM}22`, color: '#475569' }}>{dimensao === 'macro' ? 'sem plano' : 'sem escopo'}</span>}
                    </div>
                  )}
                  <div className="text-[14px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: cor }}>{formatMoeda(r.total)}</div>
                  <div className="text-[10px] text-muted-foreground">{pct(r.total)}% das saídas · {r.count} lanç.</div>
                  <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${maxTotal > 0 ? Math.round((r.total / maxTotal) * 100) : 0}%`, background: cor }} />
                  </div>
                  {dimensao === 'macro' && r.chave === 'Custeio Produção' && folhaCusteio > 0 && (
                    <div className="text-[9px] text-muted-foreground mt-0.5 truncate">dos quais Mão de Obra (Folha): <span className="font-semibold text-foreground">{formatMoeda(folhaCusteio)}</span></div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-[9px] text-muted-foreground space-y-0.5">
            <div>Total de saídas: <span className="font-semibold text-foreground">{formatMoeda(totalGeral)}</span> · reage a conta/mês/status · exclui tesouraria (transferências '3-%').</div>
            <div>
              {dimensao === 'macro'
                ? 'Classificação exclusiva do plano de contas oficial (macro_custo). Investimentos e Dividendos são saída de caixa não operacional.'
                : 'Classificação por negócio (escopo_negocio) persistida no lançamento — soberana sobre a conta bancária.'}
            </div>
          </div>
        </>
      )}

      {/* Drawer — detalhe do bucket (grupo/centro/lançamentos). Mesmas colunas nas duas dimensões. */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative h-full w-[460px] max-w-[92vw] bg-white border-l shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: `${corDoBucket(aberto.chave)}55` }}>
              <div>
                <div className="text-[12px] font-semibold" style={{ color: corDoBucket(aberto.chave) }}>{aberto.chave}</div>
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
              <span className="text-[10px] text-muted-foreground">TOTAL {aberto.chave === SEM ? '(sem classificação)' : ''}</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: corDoBucket(aberto.chave) }}>{formatMoeda(aberto.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
