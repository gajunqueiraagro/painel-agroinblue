/**
 * V2ExecutivePreview — Sandbox isolado do ExecutiveSlide.
 *
 * PR3.3A: validar proporção 16:9, overflow, print, responsividade e
 * densidade visual ANTES de migrar blocos de produção.
 *
 * Rota: section='executive-preview' (V2Section em navGrupos.ts).
 * Acesso via URL: ?section=executive-preview ou via setSection programático.
 * Remover após validação final ou manter como storybook interno.
 *
 * ZERO dependência de hooks reais, banco, contextos de cliente/fazenda.
 */
import { ExecutiveSlide } from '@/v2/components/executive/ExecutiveSlide';
import { Badge } from '@/components/ui/badge';

// ─── Dados fake ──────────────────────────────────────────────────────────────

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const ROWS_TABELA = [
  { label: 'Saldo Início',  valores: [991,986,981,982,830,788,788,788,788,788,788,788], negrito: true },
  { label: '+ Nascimentos', valores: [0,2,0,0,0,0,0,0,0,0,0,0], cor: 'text-emerald-700' },
  { label: '+ Compras',     valores: [0,0,0,0,0,0,0,0,0,0,0,0], cor: 'text-emerald-700' },
  { label: '– Abates',      valores: [0,5,0,0,0,0,0,0,0,0,0,0], cor: 'text-red-600' },
  { label: '– Vendas',      valores: [3,0,0,149,42,0,0,0,0,0,0,0], cor: 'text-red-600' },
  { label: '– Mortes',      valores: [2,1,3,0,0,0,0,0,0,0,0,0], cor: 'text-red-600' },
  { label: 'Saldo Final',   valores: [986,981,982,830,788,788,788,788,788,788,788,788], negrito: true },
];

const CARDS_FAKE = [
  { label: 'Reposição',  valor: '0 cab',    delta: '—',      cor: 'text-sky-600' },
  { label: 'Desfrute',   valor: '8 cab',    delta: '+60%',   cor: 'text-emerald-600' },
  { label: 'Compras',    valor: '0 cab',    delta: '—',      cor: 'text-sky-600' },
  { label: 'Abates',     valor: '5 cab',    delta: '—',      cor: 'text-emerald-600' },
  { label: 'Vendas',     valor: '3 cab',    delta: '-25%',   cor: 'text-emerald-600' },
  { label: 'Mortes',     valor: '3 cab',    delta: '+200%',  cor: 'text-red-600' },
];

const DRE_LINHAS = [
  { label: 'Receita Pecuária',     real25: 7_100_000, meta26: 7_500_000, real26: 2_100_000 },
  { label: 'Receita Agricultura',  real25: 1_200_000, meta26: 1_400_000, real26: 400_000 },
  { label: 'Custeio Pecuária',     real25: -3_800_000, meta26: -4_000_000, real26: -1_100_000 },
  { label: 'Custeio Agricultura',  real25: -900_000, meta26: -1_000_000, real26: -280_000 },
  { label: 'Lucro Operacional',    real25: 3_600_000, meta26: 3_900_000, real26: 1_120_000, negrito: true },
  { label: 'Juros',                real25: -320_000, meta26: -350_000, real26: -90_000 },
  { label: 'Lucro Líquido',        real25: 3_280_000, meta26: 3_550_000, real26: 1_030_000, negrito: true },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtR(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL',
    maximumFractionDigits: 0 }).format(v);
}

function delta(real: number, ref: number): string {
  if (!ref) return '—';
  const d = ((real - ref) / Math.abs(ref)) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function corDelta(real: number, ref: number, ehDespesa = false): string {
  if (!ref) return 'text-muted-foreground';
  const positivo = real > ref;
  const bom = ehDespesa ? !positivo : positivo;
  return bom ? 'text-emerald-600' : 'text-red-600';
}

// ─── Slide components locais ─────────────────────────────────────────────────

function SlideResumoExecutivo() {
  return (
    <ExecutiveSlide
      title="Resumo Executivo"
      subtitle="Jan a Mar/2026 · NJ Pecuária · Global"
      badge={<Badge variant="outline">Slide 1 / 4</Badge>}
      footer="Gerado em 19/05/2026 · Agroinblue"
    >
      <div className="grid grid-cols-3 gap-4 h-full">
        <div className="col-span-2 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            No trimestre Jan–Mar/2026, a operação registrou receita pecuária de{' '}
            <span className="font-semibold text-foreground">R$ 2,1M</span>, com
            margem EBITDA de <span className="font-semibold text-emerald-600">28,7%</span>.
            O rebanho encerrou março com 982 cabeças, queda de 1% vs meta.
            Mortalidade acima do histórico — 3 mortes em março exige atenção.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[
              { label: 'Receita',    v: 'R$ 2,1M',  ok: true  },
              { label: 'EBITDA',     v: '28,7%',    ok: true  },
              { label: 'Rebanho',    v: '982 cab',  ok: false },
              { label: 'Mortes',     v: '6 cab',    ok: false },
            ].map(k => (
              <div key={k.label} className="bg-muted/40 rounded-lg p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</div>
                <div className={`text-xl font-bold tabular-nums ${k.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {k.v}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Alertas
          </div>
          {[
            { msg: 'Mortalidade acima da meta em Mar/26', tipo: 'erro' },
            { msg: 'Reposição zero no trimestre', tipo: 'aviso' },
            { msg: 'Receita 3% abaixo da meta', tipo: 'aviso' },
            { msg: 'EBITDA acima do histórico', tipo: 'ok' },
          ].map((a, i) => (
            <div key={i} className={`text-xs px-3 py-2 rounded-md border-l-2 ${
              a.tipo === 'erro'  ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-950/30' :
              a.tipo === 'aviso' ? 'bg-yellow-50 border-yellow-500 text-yellow-700 dark:bg-yellow-950/30' :
              'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/30'
            }`}>
              {a.msg}
            </div>
          ))}
        </div>
      </div>
    </ExecutiveSlide>
  );
}

function SlideTabelaGrande() {
  const mesFuturo = (m: number) => m > 3; // simulando mes=3
  return (
    <ExecutiveSlide
      title="Movimentações do Rebanho"
      subtitle="Jan a Mar/2026 · Entradas aumentam o saldo; saídas produtivas = desfrute; mortes = perda de estoque."
      badge={<Badge variant="outline">Slide 2 / 4</Badge>}
      footer="Fonte: lançamentos realizados · Período acumulado"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-muted/60 min-w-[110px]">
                Movimentação
              </th>
              {MESES.map((m, i) => (
                <th key={m} className={`text-right px-2 py-1.5 font-semibold min-w-[48px] ${
                  mesFuturo(i + 1) ? 'text-muted-foreground/40' : ''
                }`}>
                  {m}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-semibold min-w-[56px] border-l border-border/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS_TABELA.map((row, ri) => (
              <tr key={ri} className={row.negrito ? 'bg-muted/40 border-t border-border/40' : 'hover:bg-muted/20'}>
                <td className={`px-2 py-1 sticky left-0 ${row.negrito ? 'bg-muted/40 font-semibold' : 'bg-background'} ${row.cor ?? ''}`}>
                  {row.label}
                </td>
                {row.valores.map((v, mi) => (
                  <td key={mi} className={`text-right px-2 py-1 tabular-nums ${
                    mesFuturo(mi + 1) ? 'text-muted-foreground/30 bg-muted/10' :
                    row.cor ?? (row.negrito ? 'font-semibold' : '')
                  }`}>
                    {mesFuturo(mi + 1) || v === 0
                      ? <span className="text-muted-foreground/30">—</span>
                      : v.toLocaleString('pt-BR')}
                  </td>
                ))}
                <td className={`text-right px-2 py-1 tabular-nums border-l border-border/60 ${row.cor ?? (row.negrito ? 'font-semibold' : '')}`}>
                  {row.valores.slice(0, 3).reduce((s, v) => s + v, 0).toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {CARDS_FAKE.slice(0, 3).map(c => (
          <div key={c.label} className="bg-card border rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</div>
            <div className={`text-lg font-bold tabular-nums ${c.cor}`}>{c.valor}</div>
            <div className="text-[10px] text-muted-foreground">{c.delta}</div>
          </div>
        ))}
      </div>
    </ExecutiveSlide>
  );
}

function SlideDRE() {
  return (
    <ExecutiveSlide
      title="DRE — Resultado Econômico"
      subtitle="Jan a Mar/2026 · Comparativo Meta vs Realizado"
      badge={<Badge variant="outline">Slide 3 / 4</Badge>}
      footer="Fonte: financeiro_lancamentos_v2 · Regime de caixa"
    >
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted/60">
            <th className="text-left px-3 py-1.5 font-semibold min-w-[180px]">Linha</th>
            <th className="text-right px-3 py-1.5 font-semibold">Real 2025</th>
            <th className="text-right px-3 py-1.5 font-semibold">Meta 2026</th>
            <th className="text-right px-3 py-1.5 font-semibold">Real 2026</th>
            <th className="text-right px-3 py-1.5 font-semibold">Δ Ano Ant</th>
            <th className="text-right px-3 py-1.5 font-semibold">Δ Meta</th>
          </tr>
        </thead>
        <tbody>
          {DRE_LINHAS.map((row, i) => {
            const ehDespesa = row.real26 < 0;
            return (
              <tr key={i} className={row.negrito ? 'bg-muted/40 border-t border-b border-border/40' : 'hover:bg-muted/20'}>
                <td className={`px-3 py-1.5 ${row.negrito ? 'font-semibold' : ''}`}>{row.label}</td>
                <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">{fmtR(row.real25)}</td>
                <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">{fmtR(row.meta26)}</td>
                <td className={`text-right px-3 py-1.5 tabular-nums font-medium ${row.negrito ? 'font-semibold' : ''}`}>
                  {fmtR(row.real26)}
                </td>
                <td className={`text-right px-3 py-1.5 tabular-nums text-xs ${corDelta(row.real26, row.real25, ehDespesa)}`}>
                  {delta(row.real26, row.real25)}
                </td>
                <td className={`text-right px-3 py-1.5 tabular-nums text-xs ${corDelta(row.real26, row.meta26, ehDespesa)}`}>
                  {delta(row.real26, row.meta26)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ExecutiveSlide>
  );
}

function SlideCardsGrafico() {
  // Série fake de desfrute mensal
  const serieDesfrute = [18, 22, 15, 8, 0, 0, 0, 0, 0, 0, 0, 0];
  const maxVal = Math.max(...serieDesfrute, 1);

  return (
    <ExecutiveSlide
      title="Indicadores Zootécnicos"
      subtitle="Jan a Mar/2026 · Desfrute, reposição e mortalidade"
      badge={<Badge variant="outline">Slide 4 / 4</Badge>}
      footer="Fonte: lançamentos realizados · viewMode=periodo"
    >
      <div className="grid grid-cols-2 gap-4 h-full">
        {/* Cards */}
        <div className="grid grid-cols-2 gap-2 content-start">
          {CARDS_FAKE.map(c => (
            <div key={c.label} className="bg-card border rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{c.label}</div>
              <div className={`text-xl font-bold tabular-nums ${c.cor}`}>{c.valor}</div>
              <div className={`text-[10px] mt-1 ${c.delta.startsWith('+') ? 'text-emerald-600' : c.delta === '—' ? 'text-muted-foreground' : 'text-red-600'}`}>
                {c.delta} vs 2025
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico fake (barras SVG simples) */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Desfrute mensal (cab)
          </div>
          <div className="flex-1 flex items-end gap-1 pb-4 relative">
            {serieDesfrute.map((v, i) => {
              const futuro = i >= 3;
              const h = v > 0 ? Math.max((v / maxVal) * 100, 4) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-sm transition-all ${
                      futuro ? 'bg-muted/30' : 'bg-emerald-500/80'
                    }`}
                    style={{ height: `${h}%`, minHeight: v > 0 ? '4px' : '0' }}
                  />
                  <span className={`text-[9px] ${futuro ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}>
                    {MESES[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ExecutiveSlide>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function V2ExecutivePreview() {
  return (
    <div className="px-4 py-6 space-y-8 max-w-[1300px] mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">ExecutiveSlide — Preview Isolado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            PR3.3A · Sandbox de validação. Dados 100% fake. Sem produção.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Gerar PDF
        </button>
      </div>

      <SlideResumoExecutivo />
      <SlideTabelaGrande />
      <SlideDRE />
      <SlideCardsGrafico />
    </div>
  );
}
