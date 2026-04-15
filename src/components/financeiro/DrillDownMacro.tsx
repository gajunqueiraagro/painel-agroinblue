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

const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};

const fmtCurrency = (v: number) =>
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

  const mesesSet = useMemo(() => new Set(filtros.meses), [filtros.meses]);
  const mesesOrdenados = useMemo(
    () => filtros.meses.slice().sort((a, b) => a - b),
    [filtros.meses],
  );

  /* ---------- base filter ---------- */
  const lancBase = useMemo(() => {
    const anoStr = String(filtros.ano);
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
  }, [lancamentos, macro, filtros, mesesSet]);

  /* ---------- escopo filter (sem acento) ---------- */
  const lancFiltrados = useMemo(() => {
    if (!isCusteio) return lancBase;
    const escopo = tab === 'pecuaria' ? 'pecuaria' : 'agricultura';
    return lancBase.filter(
      (l) => (l.escopo_negocio || '').toLowerCase().trim() === escopo,
    );
  }, [lancBase, isCusteio, tab]);

  /* ================================================================ */
  /*  CHART DATA — always Jan–Dec, zero for months without data        */
  /* ================================================================ */
  const chartData = useMemo(() => {
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
    // Always 12 months
    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row: Record<string, string | number> = { mes: MONTH_LABELS[i] };
      const mMap = byMonth.get(m);
      for (const s of series) row[s] = mMap?.get(s) || 0;
      return row;
    });

    return { rows, series };
  }, [lancFiltrados, expandedGrupo]);

  /* ================================================================ */
  /*  TABLE DATA — monthly columns                                     */
  /* ================================================================ */
  type MonthlyNode = {
    nome: string;
    meses: Record<number, number>;
    total: number;
    children?: MonthlyNode[];
  };

  const tableData = useMemo(() => {
    const gMap = new Map<string, {
      meses: Record<number, number>;
      centros: Map<string, {
        meses: Record<number, number>;
        subs: Map<string, Record<number, number>>;
      }>;
    }>();

    for (const l of lancFiltrados) {
      const g = l.grupo_custo || '(Sem grupo)';
      const c = l.centro_custo || '(Sem centro)';
      const s = l.subcentro || '(Sem subcentro)';
      const v = Math.abs(l.valor);
      const m = Number(l.ano_mes.substring(5, 7));

      if (!gMap.has(g)) gMap.set(g, { meses: {}, centros: new Map() });
      const gNode = gMap.get(g)!;
      gNode.meses[m] = (gNode.meses[m] || 0) + v;

      if (!gNode.centros.has(c)) gNode.centros.set(c, { meses: {}, subs: new Map() });
      const cNode = gNode.centros.get(c)!;
      cNode.meses[m] = (cNode.meses[m] || 0) + v;

      if (!cNode.subs.has(s)) cNode.subs.set(s, {});
      const sNode = cNode.subs.get(s)!;
      sNode[m] = (sNode[m] || 0) + v;
    }

    const buildNode = (nome: string, meses: Record<number, number>, children?: MonthlyNode[]): MonthlyNode => {
      const total = Object.values(meses).reduce((a, b) => a + b, 0);
      return { nome, meses, total, children };
    };

    const sortDesc = (a: MonthlyNode, b: MonthlyNode) => b.total - a.total;

    const result: MonthlyNode[] = [];
    for (const [gNome, gData] of gMap) {
      const centros: MonthlyNode[] = [];
      for (const [cNome, cData] of gData.centros) {
        const subs: MonthlyNode[] = [];
        for (const [sNome, sMeses] of cData.subs) {
          subs.push(buildNode(sNome, sMeses));
        }
        subs.sort(sortDesc);
        centros.push(buildNode(cNome, cData.meses, subs));
      }
      centros.sort(sortDesc);
      result.push(buildNode(gNome, gData.meses, centros));
    }
    result.sort(sortDesc);
    return result;
  }, [lancFiltrados]);

  /* totals per month */
  const totalMeses = useMemo(() => {
    const t: Record<number, number> = {};
    for (const g of tableData) {
      for (const m of mesesOrdenados) t[m] = (t[m] || 0) + (g.meses[m] || 0);
    }
    return t;
  }, [tableData, mesesOrdenados]);
  const grandTotal = useMemo(() => Object.values(totalMeses).reduce((a, b) => a + b, 0), [totalMeses]);

  /* handlers */
  const toggleGrupo = useCallback((nome: string) => {
    setExpandedGrupo((prev) => (prev === nome ? null : nome));
    setExpandedCentro(null);
  }, []);
  const toggleCentro = useCallback((nome: string) => {
    setExpandedCentro((prev) => (prev === nome ? null : nome));
  }, []);

  /* render monthly cells */
  const renderMesesCells = (meses: Record<number, number>) =>
    mesesOrdenados.map((m) => (
      <TableCell key={m} className="text-right whitespace-nowrap">
        {meses[m] ? fmtCompact(meses[m]) : '–'}
      </TableCell>
    ));

  const isEmpty = lancFiltrados.length === 0;

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

      {isEmpty ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Sem lançamentos no período.</p>
      ) : (
        <>
          {/* ── Chart — 200px, Jan–Dec ── */}
          {chartData.series.length > 0 && (
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="mes" tick={AXIS_TICK_STYLE} />
                  <YAxis
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v: number) =>
                      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip content={<StandardTooltip isCurrency />} />
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

          {/* ── Table — monthly columns ── */}
          <div className="overflow-x-auto">
            <Table className="w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px] sticky left-0 bg-muted/50 z-10">Nome</TableHead>
                  {mesesOrdenados.map((m) => (
                    <TableHead key={m} className="text-right w-[70px]">{MONTH_LABELS[m - 1]}</TableHead>
                  ))}
                  <TableHead className="text-right w-[80px]">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* total row */}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="sticky left-0 bg-muted/40 z-10">Total {macro}</TableCell>
                  {mesesOrdenados.map((m) => (
                    <TableCell key={m} className="text-right whitespace-nowrap">
                      {totalMeses[m] ? fmtCompact(totalMeses[m]) : '–'}
                    </TableCell>
                  ))}
                  <TableCell className="text-right whitespace-nowrap">{fmtCompact(grandTotal)}</TableCell>
                </TableRow>

                {tableData.map((grupo) => (
                  <React.Fragment key={grupo.nome}>
                    {/* Nível 1 — Grupo */}
                    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleGrupo(grupo.nome)}>
                      <TableCell className="pl-3 sticky left-0 bg-background z-10">
                        <span className="inline-flex items-center gap-1">
                          {expandedGrupo === grupo.nome
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          <span className="font-medium">{grupo.nome}</span>
                        </span>
                      </TableCell>
                      {renderMesesCells(grupo.meses)}
                      <TableCell className="text-right whitespace-nowrap font-medium">{fmtCompact(grupo.total)}</TableCell>
                    </TableRow>

                    {expandedGrupo === grupo.nome && grupo.children?.map((centro) => (
                      <React.Fragment key={centro.nome}>
                        {/* Nível 2 — Centro */}
                        <TableRow className="cursor-pointer hover:bg-muted/20" onClick={() => toggleCentro(centro.nome)}>
                          <TableCell className="pl-8 sticky left-0 bg-background z-10">
                            <span className="inline-flex items-center gap-1">
                              {expandedCentro === centro.nome
                                ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                              <span>{centro.nome}</span>
                            </span>
                          </TableCell>
                          {renderMesesCells(centro.meses)}
                          <TableCell className="text-right whitespace-nowrap">{fmtCompact(centro.total)}</TableCell>
                        </TableRow>

                        {expandedCentro === centro.nome && centro.children?.map((sub) => (
                          <TableRow key={sub.nome} className="text-muted-foreground">
                            <TableCell className="pl-14 sticky left-0 bg-background z-10">{sub.nome}</TableCell>
                            {renderMesesCells(sub.meses)}
                            <TableCell className="text-right whitespace-nowrap">{fmtCompact(sub.total)}</TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
