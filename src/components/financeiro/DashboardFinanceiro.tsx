/**
 * Dashboard financeiro inicial — indicadores e visão hierárquica.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingDown, TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_OPTIONS } from '@/lib/calculos/labels';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';

interface Props {
  lancamentos: FinanceiroLancamento[];
  indicadores: {
    resumoMensal: { anoMes: string; entradas: number; saidas: number; desembolsoProd: number; desembolsoPec: number }[];
    totalDesembolsoProd: number;
    totalDesembolsoPec: number;
    totalReceitas: number;
    porMacro: { nome: string; valor: number }[];
    porGrupo: { nome: string; valor: number }[];
    porCentro: { nome: string; valor: number }[];
  } | null;
  /** Cabeças médias do mês — do módulo zootécnico */
  cabMediaMes?: number;
  /** Cabeças médias acumulado — do módulo zootécnico */
  cabMediaAcum?: number;
  /** Arrobas produzidas acumulado — do módulo zootécnico */
  arrobasProduzidasAcum?: number;
}

export function DashboardFinanceiro({ lancamentos, indicadores, cabMediaMes, cabMediaAcum, arrobasProduzidasAcum }: Props) {
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

  // Indicadores filtrados
  const ind = useMemo(() => {
    if (!indicadores) return null;

    const isDesembolsoProdutivo = (l: FinanceiroLancamento) => {
      const escopo = (l.escopo_negocio || '').toLowerCase();
      const tipo = (l.tipo_operacao || '').toLowerCase();
      if (escopo === 'financeiro') return false;
      if (tipo === 'receita') return false;
      return true;
    };
    const isDesembolsoPec = (l: FinanceiroLancamento) =>
      isDesembolsoProdutivo(l) && (l.escopo_negocio || 'pecuaria') === 'pecuaria';
    const isReceita = (l: FinanceiroLancamento) => {
      const tipo = (l.tipo_operacao || '').toLowerCase();
      return tipo === 'receita' || l.valor < 0;
    };

    const entradas = filtrados.filter(isReceita).reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidas = filtrados.filter(l => !isReceita(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembolsoProd = filtrados.filter(isDesembolsoProdutivo).reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembolsoPec = filtrados.filter(isDesembolsoPec).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Custo/cabeça — acumulado coerente
    const custoAcumPec = lancamentos
      .filter(l => l.ano_mes?.startsWith(anoFiltro) && isDesembolsoPec(l))
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const custoCabMes = cabMediaMes && cabMediaMes > 0 ? desembolsoPec / cabMediaMes : null;
    const custoCabAcum = cabMediaAcum && cabMediaAcum > 0 ? custoAcumPec / cabMediaAcum : null;
    const custoArrobaProd = arrobasProduzidasAcum && arrobasProduzidasAcum > 0 ? custoAcumPec / arrobasProduzidasAcum : null;

    // Hierarquia
    const macroMap = new Map<string, number>();
    for (const l of filtrados) {
      if (!isDesembolsoProdutivo(l) || !l.macro_custo) continue;
      macroMap.set(l.macro_custo, (macroMap.get(l.macro_custo) || 0) + Math.abs(l.valor));
    }
    const porMacro = Array.from(macroMap.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);

    return {
      entradas,
      saidas,
      desembolsoProd,
      desembolsoPec,
      custoCabMes,
      custoCabAcum,
      custoArrobaProd,
      porMacro,
    };
  }, [filtrados, indicadores, lancamentos, anoFiltro, cabMediaMes, cabMediaAcum, arrobasProduzidasAcum]);

  // Dados para gráfico entradas vs saídas
  const chartData = useMemo(() => {
    if (!indicadores) return [];
    return indicadores.resumoMensal
      .filter(r => r.anoMes.startsWith(anoFiltro))
      .map(r => ({
        mes: r.anoMes.substring(5),
        Entradas: r.entradas,
        Saídas: r.saidas,
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

          {/* Indicadores cruzados com zootécnico */}
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

          {/* Gráfico entradas vs saídas */}
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

          {/* Visão por hierarquia */}
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
                    return (
                      <div key={m.nome}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-bold truncate mr-2">{m.nome}</span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatMoeda(m.valor)} ({formatNum(pct, 1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
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
