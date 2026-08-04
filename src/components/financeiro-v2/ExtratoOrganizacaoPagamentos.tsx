/**
 * ExtratoOrganizacaoPagamentos — PR-FIN-V2-ORGANIZACAO-PAGAMENTOS-01/02/04/05.
 *
 * 3ª view do modo "Analisar Fluxo": distribuição TEMPORAL das SAÍDAS DE CAIXA ao longo do mês,
 * em etapas de pagamento (janelas-orientação AGROinBLUE). NÃO cria verdade nova nem categoria:
 * só reorganiza `linhas` por data. Cada card é uma ETAPA (janela de datas), não uma natureza.
 *
 * Fonte: os mesmos `itens` derivados de `linhas` (mesma conta/mês/status/sinal do Extrato Gerencial).
 * Pagamento = mov < 0 (valor = abs). Etapas por DATA DO MOVIMENTO (first-match, sem sobreposição;
 * dia 5 conta na 1ª etapa). Pagamentos fora das etapas = "Demais períodos". Sem julgamento.
 *
 * PR-02 — despesa OPERACIONAL apenas: exclui transferências internas entre contas próprias
 * (tipo_operacao começando em '3-'). Tesouraria segue normal no Extrato/Fluxo/saldo (intocados).
 *
 * PR-04 — drill-down: clicar numa etapa abre drawer compacto com os lançamentos daquela saída
 * de caixa. Total do drawer = total do card por construção (mesma passada, mesma exclusão).
 *
 * PR-05 — cards deixam de representar categoria: passam a "Nª etapa de pagamentos" com
 * Saídas de caixa (R$) · nº de pagamentos · % das saídas do mês. Composição econômica por
 * plano de contas fica para uma 2ª camada futura (bloqueada hoje por baixa cobertura do plano).
 */
import { useEffect, useMemo, useState } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface ItemPag { id: string; data: string; mov: number; tipo: string; centro: string | null; produto: string | null; fornecedor: string; doc: string; }
const isTransferencia = (tipo: string) => tipo.startsWith('3-');

type JanelaId = 'j1' | 'j2' | 'j3';
type BucketId = JanelaId | 'fora';
const JANELAS: { id: JanelaId; nome: string; faixa: string; ini: number; fim: number; cor: string }[] = [
  { id: 'j1', nome: '1ª etapa de pagamentos', faixa: '02–05', ini: 2, fim: 5, cor: '#3b82f6' },
  { id: 'j2', nome: '2ª etapa de pagamentos', faixa: '05–10', ini: 5, fim: 10, cor: '#22784a' },
  { id: 'j3', nome: '3ª etapa de pagamentos', faixa: '20–25', ini: 20, fim: 25, cor: '#d97706' },
];
const COR_FORA = '#94a3b8';
const pad2 = (n: number) => String(n).padStart(2, '0');
const diaBR = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export function ExtratoOrganizacaoPagamentos({ itens, ano, mes, contaNome, periodoLabel }: {
  itens: ItemPag[];
  ano: number;
  mes: number;
  contaNome: string;
  periodoLabel: string;
}) {
  const [drawer, setDrawer] = useState<BucketId | null>(null);
  const diasNoMes = useMemo(() => new Date(ano, mes, 0).getDate(), [ano, mes]);
  const janelaDoDia = (d: number): JanelaId | null => JANELAS.find((j) => d >= j.ini && d <= j.fim)?.id ?? null;

  const { buckets, totalGeral } = useMemo(() => {
    const b: Record<BucketId, { total: number; count: number; itens: ItemPag[] }> = {
      j1: { total: 0, count: 0, itens: [] },
      j2: { total: 0, count: 0, itens: [] },
      j3: { total: 0, count: 0, itens: [] },
      fora: { total: 0, count: 0, itens: [] },
    };
    let totalGeral = 0;
    for (const it of itens) {
      if (it.mov >= 0) continue; // só saídas de caixa (pagamentos)
      if (isTransferencia(it.tipo)) continue; // exclui tesouraria (transferência interna, tipo '3-%')
      const valor = Math.abs(it.mov);
      totalGeral += valor;
      const dd = Number(it.data.slice(8, 10));
      const key: BucketId = janelaDoDia(dd) ?? 'fora';
      b[key].total += valor;
      b[key].count += 1;
      b[key].itens.push(it);
    }
    return { buckets: b, totalGeral };
  }, [itens]);

  const pct = (v: number) => (totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0);

  const cards: { nome: string; faixa: string; cor: string; bucket: BucketId }[] = [
    ...JANELAS.map((j) => ({ nome: j.nome, faixa: j.faixa, cor: j.cor, bucket: j.id })),
    { nome: 'Demais períodos', faixa: 'fora das etapas', cor: COR_FORA, bucket: 'fora' },
  ];

  // Fecha o drawer com Esc.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const cardAberto = drawer ? cards.find((c) => c.bucket === drawer) ?? null : null;
  const itensAberto = useMemo(() => {
    if (!drawer) return [];
    return buckets[drawer].itens.slice().sort((a, b) =>
      a.data < b.data ? -1 : a.data > b.data ? 1 : Math.abs(b.mov) - Math.abs(a.mov));
  }, [drawer, buckets]);

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-lg border p-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold">Organização dos pagamentos</div>
        <div className="text-[9px] text-muted-foreground">Baseado nos compromissos selecionados · {contaNome} · {periodoLabel}</div>
      </div>

      {totalGeral === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
          Nenhuma saída de caixa no período (conforme filtros; transferências internas não contam).
        </div>
      ) : (
        <>
          {/* Calendário horizontal do mês — etapas destacadas por cor. */}
          <div className="flex flex-wrap gap-0.5">
            {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => {
              const j = JANELAS.find((x) => x.id === janelaDoDia(d));
              return (
                <div key={d} className="w-6 text-center text-[8px] py-0.5 rounded border"
                     style={j ? { background: `${j.cor}1f`, color: j.cor, borderColor: `${j.cor}55` } : { color: '#94a3b8', borderColor: '#e5e9f0' }}
                     title={j ? j.nome : 'Demais períodos'}>
                  {pad2(d)}
                </div>
              );
            })}
          </div>

          {/* Cards = ETAPAS de pagamento (janela temporal, não categoria) — clicáveis (drill-down). */}
          <div className="flex flex-wrap gap-1.5">
            {cards.map((c) => {
              const bk = buckets[c.bucket];
              return (
                <button key={c.bucket} type="button" onClick={() => setDrawer(c.bucket)}
                  className="rounded-md border p-2 flex-1 min-w-[160px] text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1"
                  style={{ borderColor: `${c.cor}55` }}>
                  <div className="text-[11px] font-semibold leading-tight uppercase tracking-wide" style={{ color: c.cor }}>{c.nome}</div>
                  <div className="text-[9px] text-muted-foreground">{c.faixa}</div>
                  <div className="text-[8px] uppercase tracking-wide text-muted-foreground mt-1">Saídas de caixa</div>
                  <div className="text-[14px] font-bold tabular-nums leading-tight">{formatMoeda(bk.total)}</div>
                  <div className="text-[10px] text-muted-foreground">{bk.count} pagamento{bk.count !== 1 ? 's' : ''}</div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-muted-foreground">{pct(bk.total)}% das saídas do mês</span>
                    <span className="text-[9px] font-medium shrink-0" style={{ color: c.cor }}>↗ detalhes</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-[9px] text-muted-foreground space-y-0.5">
            <div>Etapas por data de pagamento — <span className="font-semibold text-foreground">{formatMoeda(totalGeral)}</span> em saídas de caixa (orientação visual; o dia 5 conta na 1ª etapa).</div>
            <div>Total organizado: despesas operacionais. Transferências internas entre contas próprias não são consideradas.</div>
          </div>
        </>
      )}

      {/* Drawer de detalhamento — compacto, conferência operacional. */}
      {cardAberto && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative h-full w-[420px] max-w-[90vw] bg-white border-l shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: `${cardAberto.cor}55` }}>
              <div>
                <div className="text-[12px] font-semibold" style={{ color: cardAberto.cor }}>{cardAberto.nome} · {cardAberto.faixa}</div>
                <div className="text-[9px] text-muted-foreground">{contaNome} · {periodoLabel} · {itensAberto.length} pagamento{itensAberto.length !== 1 ? 's' : ''}</div>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="text-[13px] leading-none px-1.5 py-0.5 rounded hover:bg-muted" aria-label="Fechar">✕</button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead className="sticky top-0 bg-muted/60">
                  <tr>
                    {['Data', 'Descrição', 'Favorecido', 'Centro', 'Doc', 'Valor'].map((h, i) => (
                      <th key={h} className={`px-1.5 py-1 font-semibold uppercase text-[8px] ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensAberto.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{diaBR(it.data)}</td>
                      <td className="px-1.5 py-0.5 max-w-[110px] truncate" title={it.produto || '—'}>{it.produto || '—'}</td>
                      <td className="px-1.5 py-0.5 max-w-[90px] truncate" title={it.fornecedor || '—'}>{it.fornecedor || '—'}</td>
                      <td className="px-1.5 py-0.5 max-w-[80px] truncate text-muted-foreground" title={it.centro || '—'}>{it.centro || '—'}</td>
                      <td className="px-1.5 py-0.5 max-w-[70px] truncate text-muted-foreground" title={it.doc || '—'}>{it.doc || '—'}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums whitespace-nowrap">{formatMoeda(Math.abs(it.mov))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/30">
              <span className="text-[10px] text-muted-foreground">TOTAL DA ETAPA</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: cardAberto.cor }}>{formatMoeda(buckets[cardAberto.bucket].total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
