/**
 * BlocoMovimentacoesRebanhoFechamento.tsx — FASE 3 / PR3.1
 *
 * 6 cards de movimentação do rebanho no período (Jan→mesAlvo):
 * Reposição, Desfrute, Compras, Abates, Vendas, Mortes.
 *
 * Fonte: useMovimentacoesAgregadas (viewMode='periodo').
 * PR3.1 = estrutura básica (cards + cab + deltas vs Meta e vs Ano Ant).
 * PR3.2 = tabela DRE-like. PR3.3 = split dinâmica/econômica.
 * PR3.4 = gráficos Recharts. PR3.5 = drill via MovimentacaoHistoricoModal.
 */
import { useMemo } from 'react';
import {
  useMovimentacoesAgregadas,
  type TipoMov,
} from '@/v2/hooks/useMovimentacoesAgregadas';

interface Props {
  ano: number;
  mes: number;
  viewMode: 'mes' | 'periodo';
  isGlobal: boolean;
}

interface CardDef {
  tipo: TipoMov;
  label: string;
  /** true = queda é boa (despesa), false = alta é boa (receita) */
  ehDespesa: boolean;
  corValor: string;
}

const CARDS: CardDef[] = [
  { tipo: 'reposicao', label: 'Reposição',  ehDespesa: false, corValor: 'text-sky-600' },
  { tipo: 'desfrute',  label: 'Desfrute',   ehDespesa: false, corValor: 'text-emerald-600' },
  { tipo: 'compras',   label: 'Compras',    ehDespesa: false, corValor: 'text-sky-600' },
  { tipo: 'abates',    label: 'Abates',     ehDespesa: false, corValor: 'text-emerald-600' },
  { tipo: 'vendas',    label: 'Vendas',     ehDespesa: false, corValor: 'text-emerald-600' },
  { tipo: 'mortes',    label: 'Mortes',     ehDespesa: true,  corValor: 'text-red-600' },
];

function fmtCab(v: number | null): string {
  if (v === null || !isFinite(v)) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}

function calcDeltaPct(real: number | null, ref: number | null): number | null {
  if (real === null || ref === null || ref === 0) return null;
  return ((real - ref) / ref) * 100;
}

function DeltaTag({ delta, ehDespesa }: { delta: number | null; ehDespesa: boolean }) {
  if (delta === null || !isFinite(delta)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const bom = ehDespesa ? delta < 0 : delta > 0;
  const cls = bom ? 'text-emerald-600' : 'text-red-600';
  const sinal = delta >= 0 ? '+' : '';
  return <span className={cls}>{sinal}{delta.toFixed(1)}%</span>;
}

const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface RowDef {
  label: string;
  tipo: TipoMov | null;
  sinal: 'entrada' | 'saida' | null;
}

function buildLinhas(isGlobal: boolean): RowDef[] {
  return [
    { label: 'Saldo Início',      tipo: null,             sinal: null },
    { label: 'Nascimentos',       tipo: 'nascimentos',    sinal: 'entrada' },
    { label: 'Compras',           tipo: 'compras',        sinal: 'entrada' },
    ...(!isGlobal ? [{ label: 'Transf. Entrada', tipo: 'transf_entradas' as TipoMov, sinal: 'entrada' as const }] : []),
    { label: 'Abates',            tipo: 'abates',         sinal: 'saida' },
    { label: 'Vendas',            tipo: 'vendas',         sinal: 'saida' },
    { label: 'Consumos',          tipo: 'consumos',       sinal: 'saida' },
    { label: 'Mortes',            tipo: 'mortes',         sinal: 'saida' },
    ...(!isGlobal ? [{ label: 'Transf. Saída', tipo: 'transf_saidas' as TipoMov, sinal: 'saida' as const }] : []),
    { label: 'Saldo Final',       tipo: null,             sinal: null },
  ];
}

function corSinal(sinal: 'entrada' | 'saida' | null): string {
  if (sinal === 'entrada') return 'text-emerald-700';
  if (sinal === 'saida')   return 'text-red-600';
  return 'font-semibold text-foreground';
}

export function BlocoMovimentacoesRebanhoFechamento({ ano, mes, viewMode, isGlobal }: Props) {
  const { loading, porTipo, saldoInicialAnual } = useMovimentacoesAgregadas({
    ano,
    mes,
    viewMode,
    isGlobal,
  });

  // Saldo chain — encadeia saldoInicialAnual com movimentos Jan→12
  const { saldoInicial, saldoFinal } = useMemo(() => {
    const si: number[] = [0];
    const sf: number[] = [0];
    let cur = saldoInicialAnual;
    for (let m = 1; m <= 12; m++) {
      const ent = porTipo['soma_entradas']?.seriesJanDez.cab.real[m] ?? 0;
      const sai = porTipo['soma_saidas']?.seriesJanDez.cab.real[m] ?? 0;
      si.push(cur);
      sf.push(cur + ent - sai);
      cur = cur + ent - sai;
    }
    return { saldoInicial: si, saldoFinal: sf };
  }, [saldoInicialAnual, porTipo]);

  // Sempre Jan→Dez. Meses > mesAlvo ficam visualmente vazios (cinza).
  const colunas = Array.from({ length: 12 }, (_, i) => i + 1);
  const linhas  = buildLinhas(isGlobal);

  if (loading) {
    return (
      <div className="my-6 p-4 text-sm text-muted-foreground">
        Carregando movimentações…
      </div>
    );
  }

  return (
    <section className="my-6 print:break-before-page">
      <h2 className="text-base font-semibold text-foreground mb-2">
        Movimentações do Rebanho — Jan a {String(mes).padStart(2, '0')}/{ano}
      </h2>

      <p className="text-sm text-muted-foreground mb-4">
        Entradas aumentam o saldo do rebanho; saídas produtivas representam o desfrute;
        mortes representam perda de estoque.
      </p>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-left px-2 py-1.5 font-semibold text-foreground sticky left-0 bg-muted/60 min-w-[110px]">
                Movimentação
              </th>
              {colunas.map(m => (
                <th key={m} className="text-right px-2 py-1.5 font-semibold text-foreground min-w-[52px]">
                  {MESES_CURTOS[m - 1]}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-semibold text-foreground min-w-[60px] border-l border-border/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((row, idx) => {
              const isSaldoInicio = row.label === 'Saldo Início';
              const isSaldoFinal  = row.label === 'Saldo Final';
              const isSaldo = isSaldoInicio || isSaldoFinal;

              return (
                <tr
                  key={idx}
                  className={isSaldo ? 'bg-muted/40 border-t border-b border-border/40' : 'hover:bg-muted/20'}
                >
                  <td className={`px-2 py-1 sticky left-0 ${isSaldo ? 'bg-muted/40' : 'bg-background'} ${corSinal(row.sinal)}`}>
                    {!isSaldo && (
                      <span className="mr-1 opacity-50">{row.sinal === 'entrada' ? '+' : '–'}</span>
                    )}
                    {row.label}
                  </td>
                  {colunas.map(m => {
                    const futuro = m > mes;
                    let v: number;
                    if (isSaldoInicio)     v = saldoInicial[m];
                    else if (isSaldoFinal)  v = saldoFinal[m];
                    else                    v = porTipo[row.tipo!]?.seriesJanDez.cab.real[m] ?? 0;
                    return (
                      <td
                        key={m}
                        className={`text-right px-2 py-1 tabular-nums ${futuro ? 'text-muted-foreground/30 bg-muted/10' : corSinal(row.sinal)}`}
                      >
                        {futuro || v === 0
                          ? <span className="text-muted-foreground/30">—</span>
                          : fmtCab(v)}
                      </td>
                    );
                  })}
                  <td className={`text-right px-2 py-1 tabular-nums border-l border-border/60 ${corSinal(row.sinal)}`}>
                    {(() => {
                      if (isSaldoInicio) return fmtCab(saldoInicial[1]);
                      if (isSaldoFinal)  return fmtCab(saldoFinal[mes]);
                      const tot = colunas
                        .filter(m => m <= mes)
                        .reduce((s, m) => s + (porTipo[row.tipo!]?.seriesJanDez.cab.real[m] ?? 0), 0);
                      return tot !== 0
                        ? fmtCab(tot)
                        : <span className="text-muted-foreground/40">—</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {CARDS.map(({ tipo, label, ehDespesa, corValor }) => {
          const card = porTipo[tipo];
          if (!card) return null;
          const real    = card.mesAtual.cab;
          const meta    = card.meta.cab;
          const anoAnt  = card.mesAnoAnt.cab;
          const dvsMeta   = calcDeltaPct(real, meta);
          const dvsAnoAnt = calcDeltaPct(real, anoAnt);
          return (
            <div key={tipo} className="bg-card border rounded-lg p-3 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {label}
              </span>
              <span className={`text-2xl font-bold tabular-nums ${corValor}`}>
                {fmtCab(real)}{' '}
                <span className="text-sm font-normal text-muted-foreground">cab</span>
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                <span>vs Meta <DeltaTag delta={dvsMeta} ehDespesa={ehDespesa} /></span>
                <span>vs {ano - 1} <DeltaTag delta={dvsAnoAnt} ehDespesa={ehDespesa} /></span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
