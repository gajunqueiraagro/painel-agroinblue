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
import {
  useMovimentacoesAgregadas,
  type TipoMov,
} from '@/v2/hooks/useMovimentacoesAgregadas';

interface Props {
  ano: number;
  mes: number;
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

export function BlocoMovimentacoesRebanhoFechamento({ ano, mes, isGlobal }: Props) {
  const { loading, porTipo } = useMovimentacoesAgregadas({
    ano,
    mes,
    viewMode: 'periodo',
    isGlobal,
  });

  if (loading) {
    return (
      <div className="my-6 p-4 text-sm text-muted-foreground">
        Carregando movimentações…
      </div>
    );
  }

  return (
    <section className="my-6 print:break-before-page">
      <h2 className="text-base font-semibold text-foreground mb-3">
        Movimentações do Rebanho — Jan a {String(mes).padStart(2, '0')}/{ano}
      </h2>

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
            <div
              key={tipo}
              className="bg-card border rounded-lg p-3 flex flex-col gap-1"
            >
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {label}
              </span>

              <span className={`text-2xl font-bold tabular-nums ${corValor}`}>
                {fmtCab(real)}{' '}
                <span className="text-sm font-normal text-muted-foreground">cab</span>
              </span>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                <span>
                  vs Meta{' '}
                  <DeltaTag delta={dvsMeta} ehDespesa={ehDespesa} />
                </span>
                <span>
                  vs {ano - 1}{' '}
                  <DeltaTag delta={dvsAnoAnt} ehDespesa={ehDespesa} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
