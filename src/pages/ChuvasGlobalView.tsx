/**
 * ChuvasGlobalView — visão executiva climática (modo Global).
 *
 * Regras de produto:
 *   • Pluviometria é por estação/fazenda. NUNCA somar mm como leitura oficial.
 *   • Fazenda monitorada = tem ≥ 1 registro de chuva > 0 no período filtrado.
 *     Administrativo (e quaisquer fazendas sem chuva) é excluído automaticamente
 *     dos rankings — não há filtro por nome, é definição por dado real.
 *   • Período de análise: 01/jan do ano → último dia do mês filtrado (inclusive),
 *     mesmo se o mês ainda estiver em andamento. Comparativo ano-1 usa MESMA janela.
 *   • Soma operacional no rodapé é informativa, NÃO pluviometria oficial.
 */
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useChuvas } from '@/hooks/useChuvas';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  totalPeriodo,
  maiorIntervaloEntreChuvasPeriodo,
  maiorChuvaDiaPeriodo,
  comparativoMesmoPeriodo,
} from '@/lib/chuvas/analitica';

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmt(n: number, dec = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtInt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function fmtDataBR(dataIso: string | null | undefined): string {
  if (!dataIso) return '—';
  const [y, m, d] = dataIso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtPct(pct: number | null): { texto: string; cor: string } {
  if (pct == null) return { texto: '—', cor: 'text-muted-foreground' };
  const sinal = pct >= 0 ? '+' : '';
  const cor = pct > 0
    ? 'text-emerald-700 dark:text-emerald-300'
    : pct < 0
      ? 'text-rose-700 dark:text-rose-300'
      : 'text-muted-foreground';
  return { texto: `${sinal}${fmt(pct)}%`, cor };
}

interface Props {
  anoFiltro: number;
  mesFiltro: number; // 1..12 — limite superior do período de análise
}

export function ChuvasGlobalView({ anoFiltro, mesFiltro }: Props) {
  const { chuvas } = useChuvas();
  const { fazendas } = useFazenda();
  const ativasContexto = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);

  // Métricas por fazenda — sempre no PERÍODO (01/jan → fim do mesFiltro)
  const metricas = useMemo(() => {
    return ativasContexto.map(f => {
      const acum = totalPeriodo(chuvas, anoFiltro, mesFiltro, f.id);
      const maiorIntervalo = maiorIntervaloEntreChuvasPeriodo(chuvas, anoFiltro, mesFiltro, f.id);
      const maiorDia = maiorChuvaDiaPeriodo(chuvas, anoFiltro, mesFiltro, f.id);
      const comp = comparativoMesmoPeriodo(chuvas, anoFiltro, mesFiltro, f.id);
      return { fazenda: f, acum, maiorIntervalo, maiorDia, comp };
    });
  }, [ativasContexto, chuvas, anoFiltro, mesFiltro]);

  // Fazenda monitorada = ≥ 1 registro de chuva > 0 no período.
  // Excluído automaticamente: Administrativo (sem dados de chuva) e qualquer
  // fazenda sem registros no período.
  const ativasComChuva = useMemo(() => metricas.filter(m => m.acum > 0), [metricas]);

  // Rankings (TOP 2)
  const topAcumuladas = useMemo(() =>
    [...ativasComChuva].sort((a, b) => b.acum - a.acum).slice(0, 2),
    [ativasComChuva]);

  const topMaiorChuva = useMemo(() =>
    [...ativasComChuva].sort((a, b) => b.maiorDia.mm - a.maiorDia.mm).slice(0, 2),
    [ativasComChuva]);

  const topMaiorIntervalo = useMemo(() =>
    [...ativasComChuva]
      .filter(m => m.maiorIntervalo.dias > 0)
      .sort((a, b) => b.maiorIntervalo.dias - a.maiorIntervalo.dias)
      .slice(0, 2),
    [ativasComChuva]);

  const somaOperacional = useMemo(() =>
    ativasComChuva.reduce((s, m) => s + m.acum, 0),
    [ativasComChuva]);

  // Gráfico — ordenado da maior → menor acumulada
  const chartData = useMemo(() =>
    [...ativasComChuva]
      .sort((a, b) => b.acum - a.acum)
      .map(m => ({ nome: m.fazenda.nome, mm: Math.round(m.acum * 10) / 10 })),
    [ativasComChuva]);

  const mesLabel = MESES_ABREV[mesFiltro - 1] ?? '';
  const periodoLabel = `${mesLabel}/${anoFiltro}`;

  if (ativasComChuva.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        Nenhuma fazenda com chuva registrada no período (Jan–{mesLabel}/{anoFiltro}).
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Linha 1 — 4 cards executivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Card 1 — Fazendas monitoradas */}
        <CardSingle
          label="Fazendas monitoradas"
          value={fmtInt(ativasComChuva.length)}
          sub={`Período Jan–${mesLabel}/${anoFiltro}`}
        />

        {/* Card 2 — Chuvas acumuladas (TOP 2 vs ano-1 mesmo período) */}
        <CardLista
          label="Chuvas acumuladas"
          itens={topAcumuladas.map(m => {
            const pct = fmtPct(m.comp.deltaPct);
            return {
              nome: m.fazenda.nome,
              valor: `${fmt(m.acum)} mm`,
              sub: `vs ${anoFiltro - 1}`,
              extra: pct.texto,
              extraCor: pct.cor,
            };
          })}
        />

        {/* Card 3 — Maior chuva/dia (TOP 2) */}
        <CardLista
          label="Maior chuva/dia"
          itens={topMaiorChuva
            .filter(m => m.maiorDia.data)
            .map(m => ({
              nome: m.fazenda.nome,
              valor: `${fmt(m.maiorDia.mm)} mm`,
              sub: fmtDataBR(m.maiorDia.data),
            }))}
        />

        {/* Card 4 — Maior intervalo entre chuvas registradas (TOP 2)
            Gap entre dois registros com mm > 0 — não infere dias secos por
            ausência de lançamento. */}
        <CardLista
          label="Maior intervalo entre chuvas"
          itens={topMaiorIntervalo.map(m => ({
            nome: m.fazenda.nome,
            valor: `${fmtInt(m.maiorIntervalo.dias)} dias`,
            sub: m.maiorIntervalo.inicio && m.maiorIntervalo.fim
              ? `${fmtDataBR(m.maiorIntervalo.inicio)} → ${fmtDataBR(m.maiorIntervalo.fim)}`
              : `Jan–${mesLabel}`,
          }))}
        />
      </div>

      {/* Linha 2 — Gráfico (~40%) + Tabela (~60%), compactos */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-2">
        {/* Gráfico horizontal — altura fixa, barSize controlado */}
        <div className="bg-card border border-border rounded-md px-3 py-2 flex flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Chuvas acumuladas até {periodoLabel} (mm)
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                barCategoryGap={6}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => fmt(v, 0)}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
                  width={120}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                  formatter={(v: number) => [`${fmt(v)} mm`, 'Acumulado']}
                  contentStyle={{
                    fontSize: 11,
                    backgroundColor: 'hsl(var(--background) / 0.9)',
                    border: '1px solid hsl(var(--border) / 0.5)',
                    borderRadius: 6,
                    backdropFilter: 'blur(4px)',
                  }}
                />
                <Bar dataKey="mm" fill="#1E3A5F" radius={[0, 3, 3, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela executiva simplificada (4 colunas) */}
        <div className="rounded-md border border-border bg-card overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-[11px] tabular-nums leading-tight table-fixed">
              <colgroup>
                <col style={{ width: '46%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead className="bg-[#1E3A5F] text-white">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold border border-[#24466B]">Fazenda</th>
                  <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Acum. {anoFiltro}</th>
                  <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Acum. {anoFiltro - 1}</th>
                  <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {[...ativasComChuva].sort((a, b) => b.acum - a.acum).map(m => {
                  const pct = fmtPct(m.comp.deltaPct);
                  return (
                    <tr key={m.fazenda.id} className="border-b border-border/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/10">
                      <td className="px-2 py-1 font-medium border-r border-border/40 truncate">{m.fazenda.nome}</td>
                      <td className="px-2 py-1 text-right border-r border-border/40 font-medium">{fmt(m.acum)} mm</td>
                      <td className="px-2 py-1 text-right border-r border-border/40 text-muted-foreground">
                        {m.comp.totalAnoAnt > 0 ? `${fmt(m.comp.totalAnoAnt)} mm` : '—'}
                      </td>
                      <td className={`px-2 py-1 text-right font-medium ${pct.cor}`}>
                        {pct.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Rodapé — soma operacional, NÃO pluviometria oficial */}
          <div className="px-3 py-2 bg-muted/40 border-t border-border text-[10px] text-muted-foreground italic">
            Soma operacional dos registros: <span className="font-semibold text-foreground not-italic">{fmt(somaOperacional)} mm</span>
            {' — não representa pluviometria oficial. Cada fazenda é uma estação independente.'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Cards executivos ────────────────────────────────────────────────

interface CardSingleProps {
  label: string;
  value: string;
  sub?: string;
}

function CardSingle({ label, value, sub }: CardSingleProps) {
  return (
    <div className="bg-card border border-border rounded-md p-2.5 flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      <div className="text-xl font-bold text-foreground leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

interface CardListaItem {
  nome: string;
  valor: string;
  sub?: string;
  extra?: string;
  extraCor?: string;
}

function CardLista({ label, itens }: { label: string; itens: CardListaItem[] }) {
  return (
    <div className="bg-card border border-border rounded-md p-2.5 flex flex-col gap-1 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      {itens.length === 0 && (
        <div className="text-xs text-muted-foreground">—</div>
      )}
      {itens.map((it, idx) => (
        <div key={idx} className={idx > 0 ? 'pt-1 border-t border-border/40' : ''}>
          <div className="text-[11px] font-medium text-foreground truncate">{it.nome}</div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-bold text-foreground tabular-nums truncate">{it.valor}</span>
            {it.extra && (
              <span className={`text-[10px] font-semibold tabular-nums ${it.extraCor ?? ''}`}>{it.extra}</span>
            )}
          </div>
          {it.sub && <div className="text-[9px] text-muted-foreground truncate">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
