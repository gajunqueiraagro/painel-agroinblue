/**
 * Bloco 1: Indicadores Mensais — gráficos de coluna + linha + tabela histórica.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { isCusteioProdutivo, isSaida, somaAbs } from './analiseHelpers';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';
import type { IndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';

type Indicador = 'custo_cab' | 'custo_arroba' | 'desembolso_cab' | 'desembolso_arroba' | 'desembolso_total';

const INDICADORES: { id: Indicador; label: string }[] = [
  { id: 'custo_cab', label: 'Custo/cab' },
  { id: 'custo_arroba', label: 'Custo/@' },
  { id: 'desembolso_cab', label: 'Desemb./cab' },
  { id: 'desembolso_arroba', label: 'Desemb./@' },
  { id: 'desembolso_total', label: 'Desembolso' },
];

interface Props {
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>;
  rateioADM: RateioADM[];
  cabMediasMensais: { mes: number; media: number }[];
  arrobasProduzidasAcum: number | null;
  zoo: IndicadoresZootecnicos;
  anoFiltro: string;
  mesLimite: number;
  isGlobal: boolean;
}

export function IndicadoresMensais({
  lancConciliadosPorMes,
  rateioADM,
  cabMediasMensais,
  arrobasProduzidasAcum,
  zoo,
  anoFiltro,
  mesLimite,
  isGlobal,
}: Props) {
  const [indicador, setIndicador] = useState<Indicador>('custo_cab');

  // Calcula dados mensais
  const dados = useMemo(() => {
    const rows: {
      mes: number;
      mesLabel: string;
      desembolsoMes: number;
      desembolsoAcum: number;
      custoCabMes: number | null;
      custoCabAcum: number | null;
      custoArrobaMes: number | null;
      custoArrobaAcum: number | null;
      desembolsoCabMes: number | null;
      desembolsoCabAcum: number | null;
      desembolsoArrobaMes: number | null;
      desembolsoArrobaAcum: number | null;
      mediaMensal: number;
    }[] = [];

    let acumDesembolso = 0;
    let acumSaidas = 0;

    for (let m = 1; m <= mesLimite; m++) {
      const mesKey = String(m).padStart(2, '0');
      const lancs = lancConciliadosPorMes.get(mesKey) || [];

      const custeioProd = lancs.filter(l => isCusteioProdutivo(l) && isSaida(l));
      const desembolsoMes = somaAbs(custeioProd);

      const rateioMes = rateioADM
        .filter(r => r.anoMes === `${anoFiltro}-${mesKey}`)
        .reduce((s, r) => s + r.valorRateado, 0);

      const desembolsoMesTotal = desembolsoMes + rateioMes;

      const saidasMes = somaAbs(lancs.filter(isSaida));
      acumSaidas += saidasMes;
      acumDesembolso += desembolsoMesTotal;

      const cabMedia = cabMediasMensais.find(c => c.mes === m)?.media || 0;

      const custoCabMes = cabMedia > 0 ? desembolsoMesTotal / cabMedia : null;
      const cabMediaAcum = cabMediasMensais
        .filter(c => c.mes <= m)
        .reduce((s, c) => s + c.media, 0) / m;
      const mediaMensal = acumDesembolso / m;
      const custoCabAcum = cabMediaAcum > 0 ? mediaMensal / cabMediaAcum : null;

      const custoArrobaMes: number | null = null;
      const custoArrobaAcum = arrobasProduzidasAcum && arrobasProduzidasAcum > 0 && m === mesLimite
        ? acumDesembolso / arrobasProduzidasAcum
        : null;

      const desembolsoCabMes = cabMedia > 0 ? saidasMes / cabMedia : null;
      const desembolsoCabAcum = cabMediaAcum > 0 ? (acumSaidas / m) / cabMediaAcum : null;
      const desembolsoArrobaMes: number | null = null;
      const desembolsoArrobaAcum = arrobasProduzidasAcum && arrobasProduzidasAcum > 0 && m === mesLimite
        ? acumSaidas / arrobasProduzidasAcum
        : null;

      rows.push({
        mes: m,
        mesLabel: MESES_NOMES[m - 1],
        desembolsoMes: desembolsoMesTotal,
        desembolsoAcum: acumDesembolso,
        custoCabMes,
        custoCabAcum,
        custoArrobaMes,
        custoArrobaAcum,
        desembolsoCabMes,
        desembolsoCabAcum,
        desembolsoArrobaMes,
        desembolsoArrobaAcum,
        mediaMensal,
      });
    }

    return rows;
  }, [lancConciliadosPorMes, rateioADM, cabMediasMensais, arrobasProduzidasAcum, anoFiltro, mesLimite]);

  // Chart data for bar chart
  const barChartData = useMemo(() => {
    return dados.map(d => {
      let mensal: number | null = null;
      switch (indicador) {
        case 'custo_cab': mensal = d.custoCabMes; break;
        case 'custo_arroba': mensal = d.custoArrobaMes; break;
        case 'desembolso_cab': mensal = d.desembolsoCabMes; break;
        case 'desembolso_arroba': mensal = d.desembolsoArrobaMes; break;
        case 'desembolso_total': mensal = d.desembolsoMes; break;
      }
      return { mes: d.mesLabel, Mensal: mensal };
    });
  }, [dados, indicador]);

  // Line chart data (acumulado)
  const lineChartData = useMemo(() => {
    return dados.map(d => {
      let acum: number | null = null;
      switch (indicador) {
        case 'custo_cab': acum = d.custoCabAcum; break;
        case 'custo_arroba': acum = d.custoArrobaAcum; break;
        case 'desembolso_cab': acum = d.desembolsoCabAcum; break;
        case 'desembolso_arroba': acum = d.desembolsoArrobaAcum; break;
        case 'desembolso_total': acum = d.desembolsoAcum; break;
      }
      return { mes: d.mesLabel, Mensal: barChartData.find(b => b.mes === d.mesLabel)?.Mensal ?? null, Acumulado: acum };
    });
  }, [dados, indicador, barChartData]);

  const labelIndicador = INDICADORES.find(i => i.id === indicador)?.label || '';

  return (
    <div className="space-y-3">
      {/* Seletor de indicador */}
      <div className="flex flex-wrap gap-1">
        {INDICADORES.map(ind => (
          <button
            key={ind.id}
            onClick={() => setIndicador(ind.id)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
              indicador === ind.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {ind.label}
          </button>
        ))}
      </div>

      {/* Gráfico de colunas (mensal) + linha (acumulado) */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            {labelIndicador} — {anoFiltro}
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lineChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" width={60}
                  tickFormatter={v => typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : ''} />
                <Tooltip
                  formatter={(v: number) => formatMoeda(v)}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Mensal" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="Acumulado" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabela histórica */}
      <Card>
        <CardContent className="p-2">
          <div className="text-[10px] font-bold text-muted-foreground mb-1 px-1">
            Tabela Mensal — {anoFiltro}
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] px-2 py-1.5 sticky left-0 bg-background z-10">Indicador</TableHead>
                  {dados.map(d => (
                    <TableHead key={d.mes} className="text-[10px] px-2 py-1.5 text-right min-w-[60px]">
                      {d.mesLabel}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Desembolso mês</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono whitespace-nowrap tabular-nums">
                      {d.desembolsoMes > 0 ? formatNum(d.desembolsoMes / 1000, 0) + 'k' : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Desembolso acum.</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono whitespace-nowrap tabular-nums">
                      {d.desembolsoAcum > 0 ? formatNum(d.desembolsoAcum / 1000, 0) + 'k' : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Custo/cab mês</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono whitespace-nowrap tabular-nums">
                      {d.custoCabMes !== null ? formatMoeda(d.custoCabMes) : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Custo/cab acum.</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono whitespace-nowrap tabular-nums">
                      {d.custoCabAcum !== null ? formatMoeda(d.custoCabAcum) : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Média mensal</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono whitespace-nowrap tabular-nums">
                      {d.mediaMensal > 0 ? formatNum(d.mediaMensal / 1000, 0) + 'k' : '—'}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
