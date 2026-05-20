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
import { ExecutiveSlide } from '@/v2/components/executive/ExecutiveSlide';
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

export function fmtCab(v: number | null): string {
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

export const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export interface RowDef {
  label: string;
  tipo: TipoMov | null;
  sinal: 'entrada' | 'saida' | null;
}

export function buildLinhas(isGlobal: boolean): RowDef[] {
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

export function corSinal(sinal: 'entrada' | 'saida' | null): string {
  if (sinal === 'entrada') return 'text-emerald-700';
  if (sinal === 'saida')   return 'text-red-600';
  return 'font-semibold text-foreground';
}

/**
 * Gera frase executiva curta sobre a dinâmica do rebanho no período.
 * Regra simples (sem IA): compara entradas, saídas e variação líquida.
 * Tolerância 0.0001 para evitar ruído de ponto flutuante.
 */
function gerarFraseExecutiva(
  entradas: number | null,
  saidas: number | null,
  saldoIni: number,
  saldoFim: number,
  mortes: number | null,
): string {
  const variacao = saldoFim - saldoIni;
  const variacaoZero = Math.abs(variacao) < 0.0001;
  const e = entradas ?? 0;
  const s = saidas ?? 0;
  const m = mortes ?? 0;

  const semMov = variacaoZero && e === 0 && s === 0;
  if (semMov) {
    return 'Período sem movimentações registradas no rebanho.';
  }

  const fmt = (v: number) => Math.abs(Math.round(v)).toLocaleString('pt-BR');

  if (variacao < 0 && !variacaoZero) {
    const causaPrincipal = m > e
      ? 'mortes acima das entradas'
      : s > e * 2
        ? 'aumento de saídas produtivas'
        : 'ausência de reposição';
    return `O rebanho encerrou o período com redução líquida de ${fmt(variacao)} cabeças, puxada principalmente por ${causaPrincipal}.`;
  }

  if (variacao > 0 && !variacaoZero) {
    return `O rebanho encerrou o período com crescimento líquido de ${fmt(variacao)} cabeças — entradas superaram as saídas produtivas.`;
  }

  return `As entradas compensaram integralmente as saídas, mantendo estabilidade do estoque (${fmt(saldoFim)} cabeças).`;
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

  // Frase executiva — calculada antes do return para estabilidade.
  const fraseExec = gerarFraseExecutiva(
    porTipo['soma_entradas']?.mesAtual.cab ?? null,
    porTipo['soma_saidas']?.mesAtual.cab ?? null,
    saldoInicial[1] ?? 0,
    saldoFinal[mes] ?? 0,
    porTipo['mortes']?.mesAtual.cab ?? null,
  );

  return (
    <ExecutiveSlide
      title="Movimentações do Rebanho"
      subtitle={`Jan a ${String(mes).padStart(2, '0')}/${ano} · Narrativa executiva`}
      className="my-6"
      footer={`Fonte: lançamentos realizados · ${viewMode === 'periodo' ? 'Período acumulado' : 'Mês selecionado'} · Detalhe mês a mês na próxima prancha`}
    >
      <div className="flex flex-col gap-3 h-full">

        {/* ── FRASE EXECUTIVA ── */}
        <div className="bg-muted/30 border-l-4 border-primary rounded-r-md px-3 py-2 shrink-0">
          <p className="text-sm text-foreground leading-snug">
            {fraseExec}
          </p>
        </div>

        {/* ── TOPO — 5 indicadores executivos (responsivo) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 shrink-0">
          {([
            {
              label: 'Σ Entradas',
              valor:  porTipo['soma_entradas']?.mesAtual.cab ?? null,
              meta:   porTipo['soma_entradas']?.meta.cab ?? null,
              anoAnt: porTipo['soma_entradas']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-emerald-700',
              bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
              ehDespesa: false,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              // Σ Saídas = saídas produtivas (desfrute). NÃO é despesa.
              // Menos saída produtiva que a meta = ruim (vermelho).
              // Mais saída produtiva que a meta = bom (verde).
              label: 'Σ Saídas',
              valor:  porTipo['soma_saidas']?.mesAtual.cab ?? null,
              meta:   porTipo['soma_saidas']?.meta.cab ?? null,
              anoAnt: porTipo['soma_saidas']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-red-700',
              bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
              ehDespesa: false,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              label: 'Desfrute',
              valor:  porTipo['desfrute_pct']?.mesAtual.cab ?? null,
              meta:   porTipo['desfrute_pct']?.meta.cab ?? null,
              anoAnt: porTipo['desfrute_pct']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) =>
                v !== null && isFinite(v) ? `${v.toFixed(1)}%` : '—',
              cor: 'text-foreground',
              bg: 'bg-muted/40 border-border',
              ehDespesa: false,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              // Mortes: única métrica onde menor é melhor.
              label: 'Mortalidade',
              valor:  porTipo['mortes']?.mesAtual.cab ?? null,
              meta:   porTipo['mortes']?.meta.cab ?? null,
              anoAnt: porTipo['mortes']?.mesAnoAnt.cab ?? null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-red-600',
              bg: 'bg-muted/40 border-border',
              ehDespesa: true,
              modoComparativo: 'meta-anoant' as const,
            },
            {
              // Saldo Final: compara vs início do período, não vs meta.
              label: 'Saldo Final',
              valor:  saldoFinal[mes] ?? null,
              meta:   saldoInicial[1] ?? null,   // reutiliza slot 'meta' como referência de "início"
              anoAnt: null,
              fmt: (v: number | null) => `${fmtCab(v)} cab`,
              cor: 'text-foreground font-semibold',
              bg: 'bg-card border-border',
              ehDespesa: false,
              modoComparativo: 'inicio' as const,
            },
          ] as const).map(({ label, valor, meta, anoAnt, fmt, cor, bg, ehDespesa, modoComparativo }) => (
            <div key={label} className={`border rounded-lg px-2.5 py-2 ${bg}`}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                {label}
              </div>
              <div className={`text-base font-bold tabular-nums leading-tight ${cor}`}>
                {fmt(valor)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 space-y-0.5">
                {modoComparativo === 'inicio' ? (
                  <div>
                    vs início{' '}
                    <DeltaTag delta={calcDeltaPct(valor, meta)} ehDespesa={ehDespesa} />
                  </div>
                ) : (
                  <>
                    <div>
                      vs Meta{' '}
                      {meta !== null
                        ? <DeltaTag delta={calcDeltaPct(valor, meta)} ehDespesa={ehDespesa} />
                        : <span className="opacity-50">—</span>}
                    </div>
                    <div>
                      vs {ano - 1}{' '}
                      {anoAnt !== null
                        ? <DeltaTag delta={calcDeltaPct(valor, anoAnt)} ehDespesa={ehDespesa} />
                        : <span className="opacity-50">—</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── PAINÉIS NARRATIVOS — Entradas vs Saídas (cresce no espaço livre) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0">

          {/* LADO ESQUERDO — Entradas */}
          <div className="border border-emerald-200 dark:border-emerald-800 rounded-lg overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 border-b border-emerald-200 dark:border-emerald-800">
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                ↑ Entradas que aumentam o rebanho
              </span>
            </div>
            <div className="px-3 divide-y divide-border/20">
              {([
                { tipo: 'nascimentos' as TipoMov, label: 'Nascimentos' },
                { tipo: 'compras'     as TipoMov, label: 'Compras / Reposição' },
                ...(!isGlobal ? [{ tipo: 'transf_entradas' as TipoMov, label: 'Transf. Entrada' }] : []),
              ] as const).map(({ tipo, label }) => {
                const card   = porTipo[tipo];
                const real   = card?.mesAtual.cab ?? null;
                const anoAnt = card?.mesAnoAnt.cab ?? null;
                return (
                  <div key={tipo} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {fmtCab(real)} cab
                      </span>
                      <span className="text-[10px] text-muted-foreground w-14 text-right">
                        vs {ano - 1}{' '}
                        <DeltaTag delta={calcDeltaPct(real, anoAnt)} ehDespesa={false} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LADO DIREITO — Saídas */}
          <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
            <div className="bg-red-50 dark:bg-red-950/30 px-3 py-1.5 border-b border-red-200 dark:border-red-800">
              <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                ↓ Saídas que reduzem o rebanho
              </span>
            </div>
            <div className="px-3 divide-y divide-border/20">
              {([
                { tipo: 'abates'   as TipoMov, label: 'Abates',   ehDespesa: false },
                { tipo: 'vendas'   as TipoMov, label: 'Vendas',   ehDespesa: false },
                { tipo: 'consumos' as TipoMov, label: 'Consumo',  ehDespesa: false },
                { tipo: 'mortes'   as TipoMov, label: 'Mortes',   ehDespesa: true  },
                ...(!isGlobal ? [{ tipo: 'transf_saidas' as TipoMov, label: 'Transf. Saída', ehDespesa: false }] : []),
              ] as const).map(({ tipo, label, ehDespesa }) => {
                const card   = porTipo[tipo];
                const real   = card?.mesAtual.cab ?? null;
                const anoAnt = card?.mesAnoAnt.cab ?? null;
                const isMorte = tipo === 'mortes';
                return (
                  <div key={tipo} className="flex items-center justify-between py-1.5">
                    <span className={`text-xs ${isMorte ? 'text-red-600 font-medium' : 'text-foreground'}`}>
                      {label}{isMorte && real !== null && (real as number) > 0 ? ' ⚠' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold tabular-nums ${isMorte ? 'text-red-600' : 'text-foreground'}`}>
                        {fmtCab(real)} cab
                      </span>
                      <span className="text-[10px] text-muted-foreground w-14 text-right">
                        vs {ano - 1}{' '}
                        <DeltaTag delta={calcDeltaPct(real, anoAnt)} ehDespesa={ehDespesa} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </ExecutiveSlide>
  );
}
