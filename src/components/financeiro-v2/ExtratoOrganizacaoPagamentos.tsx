/**
 * ExtratoOrganizacaoPagamentos — PR-FIN-V2-ORGANIZACAO-PAGAMENTOS-01.
 *
 * 3ª view do modo "Analisar Fluxo": distribuição visual dos PAGAMENTOS (saídas) ao longo do mês,
 * pelas janelas-orientação AGROinBLUE. NÃO cria verdade nova nem categoria: só reorganiza `linhas`.
 *
 * Fonte: os mesmos `itens` derivados de `linhas` (mesma conta/mês/status/sinal do Extrato Gerencial).
 * Pagamento = mov < 0 (valor = abs). Janelas por DATA DO MOVIMENTO (first-match, sem sobreposição;
 * dia 5 conta na 1ª janela). Pagamentos fora das janelas = "Fora das janelas". Sem julgamento.
 *
 * PR-02 — despesa OPERACIONAL apenas: exclui transferências internas entre contas próprias
 * (tipo_operacao começando em '3-'). Tesouraria segue normal no Extrato/Fluxo/saldo (intocados).
 */
import { useMemo } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';

interface ItemPag { data: string; mov: number; tipo: string; centro: string | null; produto: string | null; fornecedor: string; }
const isTransferencia = (tipo: string) => tipo.startsWith('3-');

type JanelaId = 'j1' | 'j2' | 'j3';
const JANELAS: { id: JanelaId; label: string; nome: string; ini: number; fim: number; cor: string }[] = [
  { id: 'j1', label: '02–05', nome: 'Folha / Pessoal', ini: 2, fim: 5, cor: '#3b82f6' },
  { id: 'j2', label: '05–10', nome: 'Operação Fazenda', ini: 5, fim: 10, cor: '#22784a' },
  { id: 'j3', label: '20–25', nome: 'Extras / Apoio', ini: 20, fim: 25, cor: '#d97706' },
];
const COR_FORA = '#94a3b8';
const pad2 = (n: number) => String(n).padStart(2, '0');

export function ExtratoOrganizacaoPagamentos({ itens, ano, mes, contaNome, periodoLabel }: {
  itens: ItemPag[];
  ano: number;
  mes: number;
  contaNome: string;
  periodoLabel: string;
}) {
  const diasNoMes = useMemo(() => new Date(ano, mes, 0).getDate(), [ano, mes]);
  const janelaDoDia = (d: number): JanelaId | null => JANELAS.find((j) => d >= j.ini && d <= j.fim)?.id ?? null;

  const { buckets, totalGeral } = useMemo(() => {
    const mk = () => ({ total: 0, count: 0, centros: new Map<string, number>() });
    const b: Record<JanelaId | 'fora', { total: number; count: number; centros: Map<string, number> }> =
      { j1: mk(), j2: mk(), j3: mk(), fora: mk() };
    let totalGeral = 0;
    for (const it of itens) {
      if (it.mov >= 0) continue; // só pagamentos (saídas)
      if (isTransferencia(it.tipo)) continue; // exclui tesouraria (transferência interna, tipo '3-%')
      const valor = Math.abs(it.mov);
      totalGeral += valor;
      const dd = Number(it.data.slice(8, 10));
      const key: JanelaId | 'fora' = janelaDoDia(dd) ?? 'fora';
      b[key].total += valor;
      b[key].count += 1;
      const c = it.centro || 'Outros';
      b[key].centros.set(c, (b[key].centros.get(c) ?? 0) + valor);
    }
    return { buckets: b, totalGeral };
  }, [itens]);

  const pct = (v: number) => (totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0);
  const topCentro = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const cards: { label: string; nome: string; cor: string; bucket: JanelaId | 'fora' }[] = [
    ...JANELAS.map((j) => ({ label: j.label, nome: j.nome, cor: j.cor, bucket: j.id })),
    { label: 'Fora', nome: 'Fora das janelas', cor: COR_FORA, bucket: 'fora' },
  ];

  return (
    <div className="w-full max-w-[900px] mx-auto rounded-lg border p-2 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold">Organização dos pagamentos</div>
        <div className="text-[9px] text-muted-foreground">Baseado nos compromissos selecionados · {contaNome} · {periodoLabel}</div>
      </div>

      {totalGeral === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-muted-foreground">
          Nenhuma despesa operacional no período (conforme filtros; transferências internas não contam).
        </div>
      ) : (
        <>
          {/* Calendário horizontal do mês — janelas destacadas por cor. */}
          <div className="flex flex-wrap gap-0.5">
            {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => {
              const j = JANELAS.find((x) => x.id === janelaDoDia(d));
              return (
                <div key={d} className="w-6 text-center text-[8px] py-0.5 rounded border"
                     style={j ? { background: `${j.cor}1f`, color: j.cor, borderColor: `${j.cor}55` } : { color: '#94a3b8', borderColor: '#e5e9f0' }}
                     title={j ? j.nome : 'Fora das janelas'}>
                  {pad2(d)}
                </div>
              );
            })}
          </div>

          {/* Cards por janela + Fora. */}
          <div className="flex flex-wrap gap-1.5">
            {cards.map((c) => {
              const bk = buckets[c.bucket];
              return (
                <div key={c.bucket} className="rounded-md border p-2 flex-1 min-w-[150px]" style={{ borderColor: `${c.cor}55` }}>
                  <div className="text-[9px] text-muted-foreground">{c.label}</div>
                  <div className="text-[11px] font-semibold leading-tight">{c.nome}</div>
                  <div className="text-[14px] font-bold tabular-nums leading-tight" style={{ color: c.cor }}>{formatMoeda(bk.total)}</div>
                  <div className="text-[10px] text-muted-foreground">{pct(bk.total)}% · {bk.count} lançamento{bk.count !== 1 ? 's' : ''}</div>
                  <div className="text-[9px] text-muted-foreground truncate" title={topCentro(bk.centros)}>Principal centro: {topCentro(bk.centros)}</div>
                </div>
              );
            })}
          </div>

          <div className="text-[9px] text-muted-foreground space-y-0.5">
            <div>Distribuição de <span className="font-semibold text-foreground">{formatMoeda(totalGeral)}</span> por janela de data (orientação visual; o dia 5 conta na 1ª janela).</div>
            <div>Total organizado: despesas operacionais. Transferências internas entre contas próprias não são consideradas.</div>
          </div>
        </>
      )}
    </div>
  );
}
