/**
 * ChuvasGlobalView — visão comparativa entre fazendas (modo Global).
 *
 * Regra de produto: pluviometria é por estação/fazenda — em Global NUNCA
 * tratar como soma única. Esta tela mostra cada fazenda separadamente.
 *
 * Se um total agregado for exibido, é rotulado como "soma operacional dos
 * registros — não representa pluviometria oficial".
 *
 * Layout: cards superiores, gráfico horizontal comparativo, tabela.
 */
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useChuvas } from '@/hooks/useChuvas';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  totalAno,
  diasComChuva,
  maiorChuvaDia,
  maiorIntervaloSemChuva,
  comparativoAnoAnt,
} from '@/lib/chuvas/analitica';

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

interface Props {
  anoFiltro: number;
}

export function ChuvasGlobalView({ anoFiltro }: Props) {
  const { chuvas } = useChuvas();
  const { fazendas } = useFazenda();
  const ativas = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);

  const metricas = useMemo(() => {
    return ativas.map(f => {
      const acum = totalAno(chuvas, anoFiltro, f.id);
      const dias = diasComChuva(chuvas, anoFiltro, f.id);
      const maiorGap = maiorIntervaloSemChuva(chuvas, anoFiltro, f.id);
      const maiorDia = maiorChuvaDia(chuvas, anoFiltro, f.id);
      const comp = comparativoAnoAnt(chuvas, anoFiltro, f.id);
      return { fazenda: f, acum, dias, maiorGap, maiorDia, comp };
    });
  }, [ativas, chuvas, anoFiltro]);

  const insights = useMemo(() => {
    if (metricas.length === 0) return null;
    const maisChuvosa = metricas.reduce((a, b) => (b.acum > a.acum ? b : a));
    const maisSeca = metricas.reduce((a, b) => (b.acum < a.acum ? b : a));
    const maiorEstiagem = metricas.reduce((a, b) => {
      const da = a.maiorGap?.dias ?? 0;
      const db = b.maiorGap?.dias ?? 0;
      return db > da ? b : a;
    });
    const somaOp = metricas.reduce((s, m) => s + m.acum, 0);
    return { maisChuvosa, maisSeca, maiorEstiagem, somaOp };
  }, [metricas]);

  // Dados do gráfico horizontal — ordenado da maior → menor acumulada
  const chartData = useMemo(() => {
    return [...metricas]
      .sort((a, b) => b.acum - a.acum)
      .map(m => ({
        nome: m.fazenda.nome,
        mm: Math.round(m.acum * 10) / 10,
      }));
  }, [metricas]);

  if (ativas.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        Nenhuma fazenda ativa para este cliente.
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Cards superiores compactos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CardKpi
          label="Fazendas monitoradas"
          value={fmtInt(ativas.length)}
        />
        <CardKpi
          label="Mais chuvosa"
          value={insights?.maisChuvosa.fazenda.nome ?? '—'}
          sub={insights ? `${fmt(insights.maisChuvosa.acum)} mm` : ''}
          accent="emerald"
        />
        <CardKpi
          label="Mais seca"
          value={insights?.maisSeca.fazenda.nome ?? '—'}
          sub={insights ? `${fmt(insights.maisSeca.acum)} mm` : ''}
          accent="amber"
        />
        <CardKpi
          label="Maior estiagem"
          value={insights?.maiorEstiagem.fazenda.nome ?? '—'}
          sub={insights?.maiorEstiagem.maiorGap ? `${insights.maiorEstiagem.maiorGap.dias} dias sem chuva` : '—'}
          accent="rose"
        />
      </div>

      {/* Gráfico horizontal comparativo */}
      <div className="bg-card border border-border rounded-md px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Chuva acumulada {anoFiltro} (mm) — ordenado por fazenda
        </div>
        <div style={{ height: Math.max(60, chartData.length * 26) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
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
                width={110}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                formatter={(v: number) => [`${fmt(v)} mm`, 'Acum.']}
                contentStyle={{
                  fontSize: 11,
                  backgroundColor: 'hsl(var(--background) / 0.9)',
                  border: '1px solid hsl(var(--border) / 0.5)',
                  borderRadius: 6,
                  backdropFilter: 'blur(4px)',
                }}
              />
              <Bar dataKey="mm" fill="#1E3A5F" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela comparativa */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums leading-tight">
            <thead className="bg-[#1E3A5F] text-white">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold border border-[#24466B]">Fazenda</th>
                <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Acum. {anoFiltro}</th>
                <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Acum. {anoFiltro - 1}</th>
                <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Δ%</th>
                <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Dias c/ chuva</th>
                <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Maior estiagem</th>
                <th className="px-2 py-1.5 text-right font-semibold border border-[#24466B]">Maior chuva/dia</th>
              </tr>
            </thead>
            <tbody>
              {metricas.map(m => (
                <tr key={m.fazenda.id} className="border-b border-border/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/10">
                  <td className="px-2 py-1 font-medium border-r border-border/40">{m.fazenda.nome}</td>
                  <td className="px-2 py-1 text-right border-r border-border/40 font-medium">{fmt(m.acum)} mm</td>
                  <td className="px-2 py-1 text-right border-r border-border/40 text-muted-foreground">
                    {m.comp.totalAnoAnt > 0 ? `${fmt(m.comp.totalAnoAnt)} mm` : '—'}
                  </td>
                  <td className={`px-2 py-1 text-right border-r border-border/40 font-medium ${
                    m.comp.deltaPct == null ? 'text-muted-foreground'
                      : m.comp.deltaPct > 0 ? 'text-emerald-700 dark:text-emerald-300'
                      : m.comp.deltaPct < 0 ? 'text-rose-700 dark:text-rose-300'
                      : ''
                  }`}>
                    {m.comp.deltaPct != null
                      ? `${m.comp.deltaPct > 0 ? '+' : ''}${fmt(m.comp.deltaPct)}%`
                      : '—'}
                  </td>
                  <td className="px-2 py-1 text-right border-r border-border/40">{fmtInt(m.dias)}</td>
                  <td className="px-2 py-1 text-right border-r border-border/40">
                    {m.maiorGap ? `${m.maiorGap.dias} d (${fmtDataBR(m.maiorGap.inicio)} → ${fmtDataBR(m.maiorGap.fim)})` : '—'}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {m.maiorDia.data ? `${fmt(m.maiorDia.mm)} mm (${fmtDataBR(m.maiorDia.data)})` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Rodapé: soma operacional, NÃO pluviometria oficial */}
        {insights && (
          <div className="px-3 py-2 bg-muted/40 border-t border-border text-[10px] text-muted-foreground italic">
            Soma operacional dos registros: <span className="font-semibold text-foreground not-italic">{fmt(insights.somaOp)} mm</span>
            {' — não representa pluviometria oficial. Cada fazenda é uma estação independente.'}
          </div>
        )}
      </div>
    </div>
  );
}

interface CardKpiProps {
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald' | 'amber' | 'rose';
}

function CardKpi({ label, value, sub, accent }: CardKpiProps) {
  const accentCls = accent === 'emerald'
    ? 'border-emerald-200 dark:border-emerald-900/40'
    : accent === 'amber'
      ? 'border-amber-200 dark:border-amber-900/40'
      : accent === 'rose'
        ? 'border-rose-200 dark:border-rose-900/40'
        : 'border-border';

  return (
    <div className={`bg-card border ${accentCls} rounded-md p-2.5 flex flex-col gap-0.5 min-w-0`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      <div className="text-sm font-bold text-foreground truncate leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
