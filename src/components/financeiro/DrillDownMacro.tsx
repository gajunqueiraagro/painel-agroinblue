import React, { useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Table, TableHeader, TableHead, TableRow, TableCell, TableBody,
} from '@/components/ui/table';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { AXIS_TICK_STYLE, GRID_PROPS, LEGEND_STYLE, StandardTooltip } from '@/lib/chartConfig';

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
interface DrillDownMacroProps {
  macro: string;
  lancamentos: FinanceiroLancamento[];
  filtros: { ano: number; meses: number[]; fazendaId?: string };
  onVoltar: () => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BAR_PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 220 70% 50%))',
  'hsl(var(--chart-3, 280 65% 55%))',
  'hsl(var(--chart-4, 30 80% 55%))',
  'hsl(var(--chart-5, 160 60% 45%))',
  'hsl(var(--destructive))',
  'hsl(var(--accent-foreground))',
  'hsl(var(--muted-foreground))',
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export default function DrillDownMacro({
  macro,
  lancamentos,
  filtros,
  onVoltar,
}: DrillDownMacroProps) {
  const isCusteio =
    macro.toLowerCase().includes('custeio produção') ||
    macro.toLowerCase().includes('custeio produtivo');

  const [tab, setTab] = useState<string>('pecuaria');
  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null);
  const [expandedCentro, setExpandedCentro] = useState<string | null>(null);

  /* ---------- base filter ---------- */
  const lancBase = useMemo(() => {
    const anoStr = String(filtros.ano);
    const mesesSet = new Set(filtros.meses);
    return lancamentos.filter((l) => {
      if ((l.macro_custo || '').trim() !== macro) return false;
      if ((l.status_transacao || '').toLowerCase().trim() !== 'realizado') return false;
      const am = l.ano_mes;
      if (!am || !am.startsWith(anoStr)) return false;
      const m = Number(am.substring(5, 7));
      if (!mesesSet.has(m)) return false;
      if (filtros.fazendaId && filtros.fazendaId !== '__global__' && l.fazenda_id !== filtros.fazendaId) return false;
      return true;
    });
  }, [lancamentos, macro, filtros]);

  /* ---------- escopo filter ---------- */
  const lancFiltrados = useMemo(() => {
    if (!isCusteio) return lancBase;
    const escopo = tab === 'pecuaria' ? 'pecuária' : 'agricultura';
    return lancBase.filter(
      (l) => (l.escopo_negocio || '').toLowerCase().trim() === escopo,
    );
  }, [lancBase, isCusteio, tab]);

  /* ---------- último mês ---------- */
  const ultimoMes = useMemo(
    () => Math.max(...filtros.meses),
    [filtros.meses],
  );

  /* ================================================================ */
  /*  CHART DATA                                                       */
  /* ================================================================ */
  const chartData = useMemo(() => {
    // group by month and by series key (grupo or centro)
    const useGrupo = !expandedGrupo;
    const serieKey = useGrupo ? 'grupo_custo' : 'centro_custo';
    const subset = useGrupo
      ? lancFiltrados
      : lancFiltrados.filter((l) => (l.grupo_custo || '(Sem grupo)') === expandedGrupo);

    const seriesSet = new Set<string>();
    const byMonth = new Map<number, Map<string, number>>();

    for (const l of subset) {
      const m = Number(l.ano_mes.substring(5, 7));
      const key = (l[serieKey] as string) || (useGrupo ? '(Sem grupo)' : '(Sem centro)');
      seriesSet.add(key);
      if (!byMonth.has(m)) byMonth.set(m, new Map());
      const mMap = byMonth.get(m)!;
      mMap.set(key, (mMap.get(key) || 0) + Math.abs(l.valor));
    }

    const series = Array.from(seriesSet).sort();
    const rows = filtros.meses
      .slice()
      .sort((a, b) => a - b)
      .map((m) => {
        const row: Record<string, string | number> = { mes: MONTH_LABELS[m - 1] };
        const mMap = byMonth.get(m);
        for (const s of series) row[s] = mMap?.get(s) || 0;
        return row;
      });

    return { rows, series };
  }, [lancFiltrados, filtros.meses, expandedGrupo]);

  /* ================================================================ */
  /*  TABLE DATA — hierarchical aggregation                            */
  /* ================================================================ */
  type HierNode = { nome: string; mes: number; acum: number; children?: HierNode[] };

  const tableData = useMemo(() => {
    const ultimoMesStr = `${filtros.ano}-${String(ultimoMes).padStart(2, '0')}`;

    // grupo level
    const gMap = new Map<string, { acum: number; mes: number; centros: Map<string, { acum: number; mes: number; subs: Map<string, { acum: number; mes: number }> }> }>();

    for (const l of lancFiltrados) {
      const g = l.grupo_custo || '(Sem grupo)';
      const c = l.centro_custo || '(Sem centro)';
      const s = l.subcentro || '(Sem subcentro)';
      const v = Math.abs(l.valor);
      const isMes = l.ano_mes === ultimoMesStr;

      if (!gMap.has(g)) gMap.set(g, { acum: 0, mes: 0, centros: new Map() });
      const gNode = gMap.get(g)!;
      gNode.acum += v;
      if (isMes) gNode.mes += v;

      if (!gNode.centros.has(c)) gNode.centros.set(c, { acum: 0, mes: 0, subs: new Map() });
      const cNode = gNode.centros.get(c)!;
      cNode.acum += v;
      if (isMes) cNode.mes += v;

      if (!cNode.subs.has(s)) cNode.subs.set(s, { acum: 0, mes: 0 });
      const sNode = cNode.subs.get(s)!;
      sNode.acum += v;
      if (isMes) sNode.mes += v;
    }

    const sortDesc = (a: HierNode, b: HierNode) => b.acum - a.acum;

    const result: HierNode[] = [];
    for (const [gNome, gData] of gMap) {
      const centros: HierNode[] = [];
      for (const [cNome, cData] of gData.centros) {
        const subs: HierNode[] = [];
        for (const [sNome, sData] of cData.subs) {
          subs.push({ nome: sNome, mes: sData.mes, acum: sData.acum });
        }
        subs.sort(sortDesc);
        centros.push({ nome: cNome, mes: cData.mes, acum: cData.acum, children: subs });
      }
      centros.sort(sortDesc);
      result.push({ nome: gNome, mes: gData.mes, acum: gData.acum, children: centros });
    }
    result.sort(sortDesc);
    return result;
  }, [lancFiltrados, filtros.ano, ultimoMes]);

  /* totals */
  const totalMes = useMemo(() => tableData.reduce((s, g) => s + g.mes, 0), [tableData]);
  const totalAcum = useMemo(() => tableData.reduce((s, g) => s + g.acum, 0), [tableData]);

  /* handlers */
  const toggleGrupo = useCallback((nome: string) => {
    setExpandedGrupo((prev) => (prev === nome ? null : nome));
    setExpandedCentro(null);
  }, []);
  const toggleCentro = useCallback((nome: string) => {
    setExpandedCentro((prev) => (prev === nome ? null : nome));
  }, []);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-base font-semibold text-foreground">{macro}</h2>
      </div>

      {isCusteio && (
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setExpandedGrupo(null); setExpandedCentro(null); }}>
          <TabsList>
            <TabsTrigger value="pecuaria">Pecuária</TabsTrigger>
            <TabsTrigger value="agricultura">Agricultura</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* ── Chart ── */}
      {chartData.series.length > 0 && (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="mes" tick={AXIS_TICK_STYLE} />
              <YAxis
                tick={AXIS_TICK_STYLE}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip
                content={<StandardTooltip isCurrency />}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              {chartData.series.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  stackId="a"
                  fill={BAR_PALETTE[i % BAR_PALETTE.length]}
                  radius={i === chartData.series.length - 1 ? [2, 2, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Nome</TableHead>
              <TableHead className="text-right w-[110px]">{MONTH_LABELS[ultimoMes - 1]}</TableHead>
              <TableHead className="text-right w-[110px]">Acum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* total row */}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell>Total {macro}</TableCell>
              <TableCell className="text-right">{fmt(totalMes)}</TableCell>
              <TableCell className="text-right">{fmt(totalAcum)}</TableCell>
            </TableRow>

            {tableData.map((grupo) => (
              <React.Fragment key={grupo.nome}>
                {/* Nível 1 — Grupo */}
                <TableRow
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => toggleGrupo(grupo.nome)}
                >
                  <TableCell className="pl-3">
                    <span className="inline-flex items-center gap-1">
                      {expandedGrupo === grupo.nome
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      <span className="font-medium">{grupo.nome}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fmt(grupo.mes)}</TableCell>
                  <TableCell className="text-right">{fmt(grupo.acum)}</TableCell>
                </TableRow>

                {expandedGrupo === grupo.nome && grupo.children?.map((centro) => (
                  <React.Fragment key={centro.nome}>
                    {/* Nível 2 — Centro */}
                    <TableRow
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => toggleCentro(centro.nome)}
                    >
                      <TableCell className="pl-8">
                        <span className="inline-flex items-center gap-1">
                          {expandedCentro === centro.nome
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          <span>{centro.nome}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{fmt(centro.mes)}</TableCell>
                      <TableCell className="text-right">{fmt(centro.acum)}</TableCell>
                    </TableRow>

                    {expandedCentro === centro.nome && centro.children?.map((sub) => (
                      /* Nível 3 — Subcentro */
                      <TableRow key={sub.nome} className="text-muted-foreground">
                        <TableCell className="pl-14">{sub.nome}</TableCell>
                        <TableCell className="text-right">{fmt(sub.mes)}</TableCell>
                        <TableCell className="text-right">{fmt(sub.acum)}</TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}

            {tableData.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  Nenhum lançamento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
