/**
 * Seção "Histórico Comparativo" — gráficos de linhas (até 3 anos).
 * v1: @ Produzidas acumuladas, UA/ha média acumulada, GMD acumulado.
 */

import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { HistoricoAnual, ComparacaoHistorica } from '@/hooks/useIndicadoresZootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  historico: HistoricoAnual[];
  comparacoesHistorico: {
    arrobasProduzidas: ComparacaoHistorica[];
    uaHaMedia: ComparacaoHistorica[];
    gmdAcumulado: ComparacaoHistorica[];
  };
  mesAtual: number;
}

const CORES = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))', 'hsl(var(--muted-foreground) / 0.4)'];

function buildChartData(
  historico: HistoricoAnual[],
  field: 'arrobasProduzidasAcum' | 'uaHaMedia' | 'gmdAcumulado',
  mesAtual: number,
) {
  const data: Record<string, unknown>[] = [];
  for (let m = 1; m <= 12; m++) {
    const point: Record<string, unknown> = { mes: MESES_COLS[m - 1]?.label?.substring(0, 3) || String(m) };
    historico.forEach(h => {
      const isMaisRecente = h.ano === Math.max(...historico.map(x => x.ano));
      const val = h.meses.find(x => x.mes === m)?.[field];
      // Null out future months only for the most recent year
      point[String(h.ano)] = (isMaisRecente && m > mesAtual) ? null : val;
    });
    data.push(point);
  }
  return data;
}

function VariacaoCards({ comparacoes, unidade, decimals = 1 }: { comparacoes: ComparacaoHistorica[]; unidade: string; decimals?: number }) {
  if (comparacoes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {comparacoes.map(c => {
        if (c.diferencaAbsoluta === null) return null;
        const positivo = c.diferencaAbsoluta > 0;
        const neutro = c.diferencaAbsoluta === 0;
        const Icon = positivo ? TrendingUp : neutro ? Minus : TrendingDown;
        return (
          <div
            key={c.anoComparativo}
            className={`text-xs px-2.5 py-1.5 rounded-md border ${
              positivo
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800'
                : neutro
                ? 'text-muted-foreground bg-muted border-border'
                : 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3" />
              {positivo ? '+' : ''}{formatNum(c.diferencaAbsoluta, decimals)} {unidade}
              {c.diferencaPercentual !== null && (
                <span className="opacity-70">
                  ({positivo ? '+' : ''}{formatNum(c.diferencaPercentual, 1)}%)
                </span>
              )}
              <span className="opacity-50">vs {c.anoComparativo}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HistoricoChart({
  titulo,
  historico,
  field,
  mesAtual,
  comparacoes,
  unidade,
  decimals = 1,
}: {
  titulo: string;
  historico: HistoricoAnual[];
  field: 'arrobasProduzidasAcum' | 'uaHaMedia' | 'gmdAcumulado';
  mesAtual: number;
  comparacoes: ComparacaoHistorica[];
  unidade: string;
  decimals?: number;
}) {
  const data = buildChartData(historico, field, mesAtual);
  const anosComDados = historico.filter(h => h.meses.some(m => m[field] !== null));

  if (anosComDados.length === 0) return null;

  const config: Record<string, { label: string; color: string }> = {};
  anosComDados.forEach((h, i) => {
    config[String(h.ano)] = { label: String(h.ano), color: CORES[i] || CORES[0] };
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{titulo}</h4>
        <ChartContainer config={config} className="aspect-[2/1] w-full">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" width={45} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="font-mono text-xs">
                      {formatNum(Number(value), decimals)} {unidade}
                    </span>
                  )}
                />
              }
            />
            {anosComDados.map((h, i) => (
              <Line
                key={h.ano}
                type="monotone"
                dataKey={String(h.ano)}
                stroke={CORES[i]}
                strokeWidth={i === 0 ? 2.5 : 1.5}
                strokeDasharray={i === 0 ? undefined : '5 3'}
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 5, strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ChartContainer>
        <VariacaoCards comparacoes={comparacoes} unidade={unidade} decimals={decimals} />
      </CardContent>
    </Card>
  );
}

export function HistoricoComparativo({ historico, comparacoesHistorico, mesAtual }: Props) {
  const temDados = historico.some(h => h.meses.length > 0);
  if (!temDados) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Histórico Comparativo</h3>
      <HistoricoChart
        titulo="@ Produzidas Acumuladas"
        historico={historico}
        field="arrobasProduzidasAcum"
        mesAtual={mesAtual}
        comparacoes={comparacoesHistorico.arrobasProduzidas}
        unidade="@"
      />
      <HistoricoChart
        titulo="UA/ha Média Acumulada"
        historico={historico}
        field="uaHaMedia"
        mesAtual={mesAtual}
        comparacoes={comparacoesHistorico.uaHaMedia}
        unidade="UA/ha"
        decimals={2}
      />
      <HistoricoChart
        titulo="GMD Acumulado"
        historico={historico}
        field="gmdAcumulado"
        mesAtual={mesAtual}
        comparacoes={comparacoesHistorico.gmdAcumulado}
        unidade="kg/dia"
        decimals={3}
      />
    </div>
  );
}
