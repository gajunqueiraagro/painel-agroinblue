/**
 * Bloco 2: Receita, Custo e Margem.
 */
import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { isCusteioProdutivo, isReceitaMacro, isDeducaoReceita, isSaida, isEntrada, somaAbs } from './analiseHelpers';
import { calcArrobasSafe } from '@/lib/calculos/economicos';
import type { FinanceiroLancamento, RateioADM } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';

interface Props {
  lancConciliadosPorMes: Map<string, FinanceiroLancamento[]>;
  lancamentosPecuarios: Lancamento[];
  rateioADM: RateioADM[];
  arrobasProduzidasAcum: number | null;
  anoFiltro: string;
  mesLimite: number;
  isGlobal: boolean;
}

export function ReceitaCustoMargem({
  lancConciliadosPorMes,
  lancamentosPecuarios,
  rateioADM,
  arrobasProduzidasAcum,
  anoFiltro,
  mesLimite,
  isGlobal,
}: Props) {
  // Arrobas vendidas por mês (do módulo pecuário)
  const arrobasVendidasPorMes = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of lancamentosPecuarios) {
      if (!l.data.startsWith(anoFiltro)) continue;
      if (l.tipo !== 'abate' && l.tipo !== 'venda') continue;
      const m = Number(l.data.substring(5, 7));
      map.set(m, (map.get(m) || 0) + calcArrobasSafe(l));
    }
    return map;
  }, [lancamentosPecuarios, anoFiltro]);

  const dados = useMemo(() => {
    const rows: {
      mes: number;
      mesLabel: string;
      receita: number;
      receitaAcum: number;
      custo: number;
      custoAcum: number;
      margemTotal: number;
      margemTotalAcum: number;
      arrobasVendidas: number;
      arrobasVendidasAcum: number;
      receitaPorArroba: number | null;
      custoPorArroba: number | null;
      margemPorArroba: number | null;
    }[] = [];

    let acumReceita = 0;
    let acumCusto = 0;
    let acumArrobasVendidas = 0;

    for (let m = 1; m <= mesLimite; m++) {
      const mesKey = String(m).padStart(2, '0');
      const lancs = lancConciliadosPorMes.get(mesKey) || [];

      // Receita = macro_custo "Receitas" (entradas)
      const receitaMes = somaAbs(lancs.filter(l => isReceitaMacro(l)));
      // Deduções
      const deducoesMes = somaAbs(lancs.filter(l => isDeducaoReceita(l)));
      const receitaLiqMes = receitaMes - deducoesMes;

      // Custo = Custeio Produtivo (saídas) + rateio
      const custoMes = somaAbs(lancs.filter(l => isCusteioProdutivo(l) && isSaida(l)));
      const rateioMes = rateioADM
        .filter(r => r.anoMes === `${anoFiltro}-${mesKey}`)
        .reduce((s, r) => s + r.valorRateado, 0);
      const custoTotal = custoMes + rateioMes;

      acumReceita += receitaLiqMes;
      acumCusto += custoTotal;

      // Arrobas vendidas
      const arrobasVendMes = arrobasVendidasPorMes.get(m) || 0;
      acumArrobasVendidas += arrobasVendMes;

      const receitaPorArroba = arrobasVendMes > 0 ? receitaLiqMes / arrobasVendMes : null;
      const custoPorArroba = arrobasProduzidasAcum && arrobasProduzidasAcum > 0 && m === mesLimite
        ? acumCusto / arrobasProduzidasAcum
        : null;
      const margemPorArroba = receitaPorArroba !== null && custoPorArroba !== null
        ? receitaPorArroba - custoPorArroba
        : null;

      rows.push({
        mes: m,
        mesLabel: MESES_NOMES[m - 1],
        receita: receitaLiqMes,
        receitaAcum: acumReceita,
        custo: custoTotal,
        custoAcum: acumCusto,
        margemTotal: receitaLiqMes - custoTotal,
        margemTotalAcum: acumReceita - acumCusto,
        arrobasVendidas: arrobasVendMes,
        arrobasVendidasAcum: acumArrobasVendidas,
        receitaPorArroba,
        custoPorArroba,
        margemPorArroba,
      });
    }

    return rows;
  }, [lancConciliadosPorMes, rateioADM, arrobasVendidasPorMes, arrobasProduzidasAcum, anoFiltro, mesLimite]);

  const chartData = dados.map(d => ({
    mes: d.mesLabel,
    Receita: d.receita,
    Custo: d.custo,
    Margem: d.margemTotal,
  }));

  // Totais acumulados
  const totais = dados.length > 0 ? dados[dados.length - 1] : null;

  return (
    <div className="space-y-3">
      {/* Cards resumo */}
      {totais && (
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground">Receita líquida</div>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">
                {formatMoeda(totais.receitaAcum)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground">Custo produção</div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">
                {formatMoeda(totais.custoAcum)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground">Margem</div>
              <p className={`text-sm font-bold ${totais.margemTotalAcum >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoeda(totais.margemTotalAcum)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            Receita × Custo × Margem — {anoFiltro}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={55}
                  tickFormatter={v => (v / 1000).toFixed(0) + 'k'} />
                <Tooltip content={<StandardTooltip isCurrency />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Receita" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Custo" fill="hsl(0, 72%, 51%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Margem" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabela mensal */}
      <Card>
        <CardContent className="p-2">
          <div className="text-[10px] font-bold text-muted-foreground mb-1 px-1">
            Receita, Custo e Margem — {anoFiltro}
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] px-2 py-1.5 sticky left-0 bg-background z-10">Indicador</TableHead>
                  {dados.map(d => (
                    <TableHead key={d.mes} className="text-[10px] px-2 py-1.5 text-right min-w-[65px]">
                      {d.mesLabel}
                    </TableHead>
                  ))}
                  <TableHead className="text-[10px] px-2 py-1.5 text-right font-bold min-w-[70px]">Acum.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background text-green-700 dark:text-green-400">Receita líq.</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono">
                      {d.receita > 0 ? formatNum(d.receita / 1000, 0) + 'k' : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold">
                    {totais ? formatNum(totais.receitaAcum / 1000, 0) + 'k' : '—'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background text-red-600 dark:text-red-400">Custo prod.</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono">
                      {d.custo > 0 ? formatNum(d.custo / 1000, 0) + 'k' : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold">
                    {totais ? formatNum(totais.custoAcum / 1000, 0) + 'k' : '—'}
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Margem total</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className={`text-[10px] px-2 py-1 text-right font-mono font-bold ${d.margemTotal >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {d.receita > 0 || d.custo > 0 ? formatNum(d.margemTotal / 1000, 0) + 'k' : '—'}
                    </TableCell>
                  ))}
                  <TableCell className={`text-[10px] px-2 py-1 text-right font-mono font-bold ${totais && totais.margemTotalAcum >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {totais ? formatNum(totais.margemTotalAcum / 1000, 0) + 'k' : '—'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">@ vendidas</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono">
                      {d.arrobasVendidas > 0 ? formatNum(d.arrobasVendidas, 0) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold">
                    {totais && totais.arrobasVendidasAcum > 0 ? formatNum(totais.arrobasVendidasAcum, 0) : '—'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-[10px] px-2 py-1 font-bold sticky left-0 bg-background">Receita/@</TableCell>
                  {dados.map(d => (
                    <TableCell key={d.mes} className="text-[10px] px-2 py-1 text-right font-mono">
                      {d.receitaPorArroba !== null ? formatMoeda(d.receitaPorArroba) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="text-[10px] px-2 py-1 text-right font-mono font-bold">
                    {totais && totais.arrobasVendidasAcum > 0
                      ? formatMoeda(totais.receitaAcum / totais.arrobasVendidasAcum)
                      : '—'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
