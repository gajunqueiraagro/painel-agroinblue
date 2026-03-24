/**
 * Dashboard financeiro — indicadores, rateio ADM e visão hierárquica.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingDown, TrendingUp, DollarSign, BarChart3, Building2, AlertTriangle } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_OPTIONS } from '@/lib/calculos/labels';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  type FinanceiroLancamento,
  type RateioADM,
  isDesembolsoProdutivo,
  isDesembolsoPecuaria,
  isReceita,
} from '@/hooks/useFinanceiro';

interface Props {
  lancamentos: FinanceiroLancamento[];
  indicadores: {
    resumoMensal: { anoMes: string; entradas: number; saidas: number; desembolsoProd: number; desembolsoPec: number; rateioADM?: number }[];
    totalDesembolsoProd: number;
    totalDesembolsoPec: number;
    totalReceitas: number;
    totalRateioADM?: number;
    porMacro: { nome: string; valor: number }[];
    porGrupo: { nome: string; valor: number }[];
    porCentro: { nome: string; valor: number }[];
  } | null;
  cabMediaMes?: number;
  cabMediaAcum?: number;
  arrobasProduzidasAcum?: number;
  rateioADM?: RateioADM[];
  isGlobal?: boolean;
  fazendasSemArea?: string[];
}

export function DashboardFinanceiro({ lancamentos, indicadores, cabMediaMes, cabMediaAcum, arrobasProduzidasAcum, rateioADM = [], isGlobal = false, fazendasSemArea = [] }: Props) {
  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      if (l.ano_mes) set.add(l.ano_mes.substring(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');

  const filtrados = useMemo(() => {
    return lancamentos.filter(l => {
      if (!l.ano_mes) return false;
      if (!l.ano_mes.startsWith(anoFiltro)) return false;
      if (mesFiltro !== 'todos' && l.ano_mes !== `${anoFiltro}-${mesFiltro}`) return false;
      return true;
    });
  }, [lancamentos, anoFiltro, mesFiltro]);

  // Rateio filtrado pelo período
  const rateioFiltrado = useMemo(() => {
    return rateioADM.filter(r => {
      if (!r.anoMes.startsWith(anoFiltro)) return false;
      if (mesFiltro !== 'todos' && r.anoMes !== `${anoFiltro}-${mesFiltro}`) return false;
      return true;
    });
  }, [rateioADM, anoFiltro, mesFiltro]);

  const totalRateioFiltrado = useMemo(
    () => rateioFiltrado.reduce((s, r) => s + r.valorRateado, 0),
    [rateioFiltrado],
  );

  // Indicadores filtrados
  const ind = useMemo(() => {
    if (!indicadores) return null;

    const entradas = filtrados.filter(isReceita).reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidas = filtrados.filter(l => !isReceita(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembolsoProd = filtrados.filter(isDesembolsoProdutivo).reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembolsoPec = filtrados.filter(isDesembolsoPecuaria).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Add rateio for per-fazenda view
    const saidasComRateio = saidas + totalRateioFiltrado;
    const desembolsoProdComRateio = desembolsoProd + totalRateioFiltrado;
    const desembolsoPecComRateio = desembolsoPec + totalRateioFiltrado;

    // Custo/cabeça acumulado
    const custoAcumPec = lancamentos
      .filter(l => l.ano_mes?.startsWith(anoFiltro) && isDesembolsoPecuaria(l))
      .reduce((s, l) => s + Math.abs(l.valor), 0);
    const rateioAcum = rateioADM
      .filter(r => r.anoMes.startsWith(anoFiltro))
      .reduce((s, r) => s + r.valorRateado, 0);
    const custoAcumTotal = custoAcumPec + rateioAcum;

    const custoCabMes = cabMediaMes && cabMediaMes > 0 ? desembolsoPecComRateio / cabMediaMes : null;
    const custoCabAcum = cabMediaAcum && cabMediaAcum > 0 ? custoAcumTotal / cabMediaAcum : null;
    const custoArrobaProd = arrobasProduzidasAcum && arrobasProduzidasAcum > 0 ? custoAcumTotal / arrobasProduzidasAcum : null;

    // Hierarquia macro
    const macroMap = new Map<string, number>();
    for (const l of filtrados) {
      if (!isDesembolsoProdutivo(l) || !l.macro_custo) continue;
      macroMap.set(l.macro_custo, (macroMap.get(l.macro_custo) || 0) + Math.abs(l.valor));
    }
    if (totalRateioFiltrado > 0) {
      macroMap.set('ADM (Rateio)', (macroMap.get('ADM (Rateio)') || 0) + totalRateioFiltrado);
    }
    const porMacro = Array.from(macroMap.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);

    return {
      entradas,
      saidas: saidasComRateio,
      desembolsoProd: desembolsoProdComRateio,
      desembolsoPec: desembolsoPecComRateio,
      custoCabMes,
      custoCabAcum,
      custoArrobaProd,
      porMacro,
      rateioADM: totalRateioFiltrado,
    };
  }, [filtrados, indicadores, lancamentos, anoFiltro, cabMediaMes, cabMediaAcum, arrobasProduzidasAcum, totalRateioFiltrado, rateioADM]);

  // Chart data
  const chartData = useMemo(() => {
    if (!indicadores) return [];
    return indicadores.resumoMensal
      .filter(r => r.anoMes.startsWith(anoFiltro))
      .map(r => ({
        mes: r.anoMes.substring(5),
        Entradas: r.entradas,
        Saídas: r.saidas,
        ...(r.rateioADM && r.rateioADM > 0 ? { 'Rateio ADM': r.rateioADM } : {}),
      }));
  }, [indicadores, anoFiltro]);

  if (lancamentos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-bold">Nenhum dado financeiro</p>
        <p className="text-sm">Importe um Excel na aba Importação para começar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Badge modo */}
      {isGlobal && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-md px-2.5 py-1.5 w-fit">
          <Building2 className="h-3.5 w-3.5" />
          Visão Global — lançamentos originais (sem rateio)
        </div>
      )}

      {/* Aviso fazendas sem área */}
      {!isGlobal && fazendasSemArea.length > 0 && (
        <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/30 rounded-md px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <span className="font-bold text-destructive">Rateio ADM incompleto:</span>{' '}
            {fazendasSemArea.join(', ')} sem área produtiva cadastrada.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-28 text-base font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mesFiltro} onValueChange={setMesFiltro}>
          <SelectTrigger className="flex-1 text-base font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {ind && (
        <>
          {/* Cards principais */}
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3 text-green-600" /> Entradas
                </div>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.entradas)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <TrendingDown className="h-3 w-3 text-red-600" /> Saídas
                </div>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.saidas)}</p>
                {ind.rateioADM > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    inclui {formatMoeda(ind.rateioADM)} rateio ADM
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Desemb. Produtivo</div>
                <p className="text-base font-bold">{formatMoeda(ind.desembolsoProd)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Desemb. Pecuária</div>
                <p className="text-base font-bold">{formatMoeda(ind.desembolsoPec)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Rateio ADM info card */}
          {!isGlobal && ind.rateioADM > 0 && rateioFiltrado.length > 0 && (
            <Card className="border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                  <Building2 className="h-3.5 w-3.5" /> Rateio ADM
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatNum(rateioFiltrado[0]?.percentualFazenda || 0, 1)}% da área produtiva
                  → <span className="font-bold text-foreground">{formatMoeda(ind.rateioADM)}</span> absorvido
                </p>
              </CardContent>
            </Card>
          )}

          {/* Indicadores cruzados */}
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Custo/cab mês</div>
                <p className="text-sm font-bold">{ind.custoCabMes !== null ? formatMoeda(ind.custoCabMes) : '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Custo/cab acum.</div>
                <p className="text-sm font-bold">{ind.custoCabAcum !== null ? formatMoeda(ind.custoCabAcum) : '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-1">Custo/@ prod.</div>
                <p className="text-sm font-bold">{ind.custoArrobaProd !== null ? formatMoeda(ind.custoArrobaProd) : '—'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Entradas vs Saídas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: number) => formatMoeda(v)}
                        labelFormatter={(l) => `Mês ${l}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Entradas" fill="hsl(120, 40%, 40%)" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Saídas" fill="hsl(0, 65%, 50%)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hierarquia macro */}
          {ind.porMacro.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Desembolso por Macro Custo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ind.porMacro.map(m => {
                    const pct = ind.desembolsoProd > 0 ? (m.valor / ind.desembolsoProd) * 100 : 0;
                    const isRateio = m.nome === 'ADM (Rateio)';
                    return (
                      <div key={m.nome}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className={`font-bold truncate mr-2 ${isRateio ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                            {m.nome}
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatMoeda(m.valor)} ({formatNum(pct, 1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isRateio ? 'bg-amber-500' : 'bg-primary'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
