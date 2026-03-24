/**
 * Dashboard financeiro — indicadores, rateio ADM e visão hierárquica.
 *
 * ARQUITETURA:
 * - Dados FINANCEIROS: filtrados localmente (conciliado + data pagamento)
 * - Dados ZOOTÉCNICOS: exclusivamente de useIndicadoresZootecnicos (fonte única)
 * - PROIBIDO: cálculo local de saldos, pesos, arrobas ou cabeças médias
 *
 * Regras de filtragem financeira:
 * - Status Transação = Conciliado
 * - Data base = Data Pagamento (YYYY-MM)
 * - Entradas = tipo_operacao começa com "1"
 * - Saídas = tipo_operacao começa com "2"
 */
import { useMemo, useState } from 'react';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown, TrendingUp, DollarSign, BarChart3, Building2, AlertTriangle, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_OPTIONS } from '@/lib/calculos/labels';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  type FinanceiroLancamento,
  type RateioADM,
} from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

// ---------------------------------------------------------------------------
// Helpers — correct classification
// ---------------------------------------------------------------------------

/** Conciliado check */
const isConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase() === 'conciliado';

/** Entrada = tipo_operacao starts with "1" */
const isEntrada = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('1');

/** Saída = tipo_operacao starts with "2" */
const isSaida = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('2');

/** Extract YYYY-MM from date string */
const datePagtoAnoMes = (l: FinanceiroLancamento): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
  /** Lançamentos pecuários COMPLETOS (com transferências) — para useIndicadoresZootecnicos */
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  rateioADM?: RateioADM[];
  isGlobal?: boolean;
  fazendasSemArea?: string[];
  /** Dados necessários para useIndicadoresZootecnicos */
  pastos?: Pasto[];
  categorias?: CategoriaRebanho[];
  fazendaId?: string;
}

// ---------------------------------------------------------------------------
// Audit table sub-component
// ---------------------------------------------------------------------------

function AuditTable({ title, lancamentos, totalLabel }: { title: string; lancamentos: FinanceiroLancamento[]; totalLabel: string }) {
  const [open, setOpen] = useState(false);
  const total = lancamentos.reduce((s, l) => s + Math.abs(l.valor), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full">
          <CardTitle className="text-sm">
            🔍 {title} ({lancamentos.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold">{formatMoeda(total)}</span>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <div className="overflow-auto max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] px-2 py-1.5">Data Pgto</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5">Produto</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5 text-right">Valor</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5">Status</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5">Tipo Op.</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5">Conta Origem</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5">Conta Destino</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-[10px] px-2 py-1">{l.data_pagamento || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 max-w-[120px] truncate">{l.produto || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 text-right font-mono">{formatMoeda(Math.abs(l.valor))}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1">{l.status_transacao || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1">{l.tipo_operacao || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.conta_origem || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.conta_destino || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t mt-2 pt-2 flex justify-between text-xs">
            <span className="font-bold">{lancamentos.length} lançamentos</span>
            <span className="font-bold">{totalLabel}: {formatMoeda(total)}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit sub-component for economic KPIs
// ---------------------------------------------------------------------------

interface RebanhoMedioMensal {
  mes: number;
  saldoInicio: number;
  saldoFim: number;
  media: number;
}

interface AuditEconomicoProps {
  saidasMes: number;
  rateioMes: number;
  desembolsoAcum: number;
  numMeses: number;
  gastoMedioMensal: number;
  custoCabMes: number | null;
  custoCabAcum: number | null;
  custoArrobaProd: number | null;
  // Zoo oficial
  cabMediaMes: number | null;
  cabMediaAcum: number | null;
  rebanhosMensais: RebanhoMedioMensal[];
  arrobasProduzidasAcum: number | null;
  saldoAnterior: number;
  saldoFinalMes: number;
  saldoInicialAno: number;
  arrobasProduzidasMesZoo: number | null;
  gmdAcumZoo: number | null;
  isGlobal: boolean;
  mesFiltro: string;
}

function AuditEconomico(p: AuditEconomicoProps) {
  const [open, setOpen] = useState(false);

  const mesLabel = p.mesFiltro !== 'todos' ? p.mesFiltro : '12';

  return (
    <div className="border-t pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        🔍 Auditoria dos indicadores econômicos
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[10px]">
          {/* Custo/cab mês */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/cab mês</div>
            <div className="text-muted-foreground">Fórmula: desembolso_mês ÷ cab_média_mês</div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Numerador:</span>
                <div className="font-mono font-bold">{formatMoeda(p.saidasMes + p.rateioMes)}</div>
                <div className="text-muted-foreground">
                  Saídas próprias: {formatMoeda(p.saidasMes)}
                  {p.rateioMes > 0 && <><br />+ Rateio ADM: {formatMoeda(p.rateioMes)}</>}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Denominador:</span>
                <div className="font-mono font-bold">{p.cabMediaMes !== null ? formatNum(p.cabMediaMes, 1) : '—'}</div>
                <div className="text-muted-foreground">
                  ({formatNum(p.saldoAnterior, 0)} + {formatNum(p.saldoFinalMes, 0)}) ÷ 2
                </div>
                <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>
                  ✅ Fonte: useIndicadoresZootecnicos (oficial)
                </div>
              </div>
            </div>
            <div className="border-t pt-1 font-bold">
              Resultado: {p.custoCabMes !== null ? formatMoeda(p.custoCabMes) : '—'}
            </div>
          </div>

          {/* Custo/cab acumulado — NOVA FÓRMULA */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/cab acumulado (jan→mês {mesLabel})</div>
            <div className="text-muted-foreground">
              Fórmula: (desembolso_acum ÷ meses) ÷ rebanho_médio_acum
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Desembolso acumulado:</span>
                <div className="font-mono font-bold">{formatMoeda(p.desembolsoAcum)}</div>
                <span className="text-muted-foreground">Nº meses:</span>
                <div className="font-mono font-bold">{p.numMeses}</div>
                <span className="text-muted-foreground">Gasto médio mensal:</span>
                <div className="font-mono font-bold">{formatMoeda(p.gastoMedioMensal)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Rebanho médio acumulado:</span>
                <div className="font-mono font-bold">{p.cabMediaAcum !== null ? formatNum(p.cabMediaAcum, 1) : '—'}</div>
                <div className="text-muted-foreground">
                  = média dos rebanhos médios mensais
                </div>
                <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>
                  ✅ Fonte: useIndicadoresZootecnicos (oficial)
                </div>
              </div>
            </div>
            {/* Detalhe mensal */}
            {p.rebanhosMensais.length > 0 && (
              <div className="border-t pt-1 mt-1">
                <div className="text-muted-foreground font-bold mb-1">Rebanho médio por mês:</div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                  {p.rebanhosMensais.map(rm => (
                    <div key={rm.mes} className="flex justify-between">
                      <span className="text-muted-foreground">M{rm.mes}:</span>
                      <span className="font-mono">{formatNum(rm.media, 0)} <span className="text-muted-foreground text-[8px]">({formatNum(rm.saldoInicio, 0)}+{formatNum(rm.saldoFim, 0)})/2</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t pt-1 font-bold">
              Resultado: {p.custoCabAcum !== null ? formatMoeda(p.custoCabAcum) : '—'}
              {p.custoCabAcum !== null && (
                <span className="font-normal text-muted-foreground ml-1">
                  = {formatMoeda(p.gastoMedioMensal)} ÷ {p.cabMediaAcum !== null ? formatNum(p.cabMediaAcum, 1) : '—'}
                </span>
              )}
            </div>
          </div>

          {/* Custo/@ produzida */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/@ produzida (jan→mês {mesLabel})</div>
            <div className="text-muted-foreground">Fórmula: desembolso_acum ÷ arrobas_produzidas_acum</div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Numerador:</span>
                <div className="font-mono font-bold">{formatMoeda(p.desembolsoAcum)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Denominador:</span>
                <div className="font-mono font-bold">{p.arrobasProduzidasAcum !== null ? `${formatNum(p.arrobasProduzidasAcum, 1)} @` : '—'}</div>
                <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>
                  ✅ Fonte: useIndicadoresZootecnicos (oficial)
                </div>
                <div className="text-muted-foreground">
                  Usa resolverPesoOficial (fechamento {'>'} lançamento {'>'} saldo_inicial)
                </div>
              </div>
            </div>
            <div className="border-t pt-1 font-bold">
              Resultado: {p.custoArrobaProd !== null ? formatMoeda(p.custoArrobaProd) : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardFinanceiro({
  lancamentos,
  indicadores,
  lancamentosPecuarios = [],
  saldosIniciais = [],
  rateioADM = [],
  isGlobal = false,
  fazendasSemArea = [],
  pastos = [],
  categorias = [],
  fazendaId,
}: Props) {
  const [showAudit, setShowAudit] = useState(false);

  const anosDisp = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => {
      if (l.data_pagamento) set.add(l.data_pagamento.substring(0, 4));
      if (l.ano_mes) set.add(l.ano_mes.substring(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [lancamentos]);

  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [mesFiltro, setMesFiltro] = useState('todos');

  // Build target period string: "YYYY-MM" or just "YYYY"
  const periodoAlvo = useMemo(
    () => mesFiltro !== 'todos' ? `${anoFiltro}-${mesFiltro}` : anoFiltro,
    [anoFiltro, mesFiltro],
  );

  // ===========================================================================
  // ZOOTÉCNICO — FONTE ÚNICA OFICIAL (useIndicadoresZootecnicos)
  // ===========================================================================
  const mesNum = mesFiltro !== 'todos' ? Number(mesFiltro) : new Date().getMonth() + 1;

  const zoo = useIndicadoresZootecnicos(
    fazendaId, Number(anoFiltro), mesNum,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  // Derived zoo values for economic indicators
  const zooData = useMemo(() => {
    const anoNum = Number(anoFiltro);
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade, 0);

    // Cab média mês: (saldo anterior + saldo final) / 2
    const saldoAnterior = zoo.gmdAberturaMes.estoqueInicialDetalhe.reduce((s, d) => s + d.cabecas, 0);
    const saldoFinalMes = zoo.saldoFinalMes;
    const cabMediaMes = (saldoAnterior > 0 || saldoFinalMes > 0) ? (saldoAnterior + saldoFinalMes) / 2 : null;

    // Rebanho médio mensal para cada mês jan→mesNum
    const mesLimite = mesFiltro !== 'todos' ? Number(mesFiltro) : 12;
    const rebanhosMensais: RebanhoMedioMensal[] = [];
    for (let m = 1; m <= mesLimite; m++) {
      const saldoInicioMes = m === 1
        ? saldoInicialAno
        : Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, anoNum, m - 1).values()).reduce((s, v) => s + v, 0);
      const saldoFimMes = Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, anoNum, m).values()).reduce((s, v) => s + v, 0);
      const media = (saldoInicioMes + saldoFimMes) / 2;
      rebanhosMensais.push({ mes: m, saldoInicio: saldoInicioMes, saldoFim: saldoFimMes, media });
    }

    // Cab média acumulada = média dos rebanhos médios mensais
    const cabMediaAcum = rebanhosMensais.length > 0
      ? rebanhosMensais.reduce((s, rm) => s + rm.media, 0) / rebanhosMensais.length
      : null;

    // Arrobas produzidas acumuladas — direto do hook oficial
    const arrobasProduzidasAcum = zoo.arrobasProduzidasAcumulado;

    return {
      cabMediaMes,
      cabMediaAcum,
      rebanhosMensais,
      arrobasProduzidasAcum,
      saldoAnterior,
      saldoFinalMes,
      saldoInicialAno,
      arrobasProduzidasMes: zoo.arrobasProduzidasMes,
      gmdAcumulado: zoo.gmdAcumulado,
    };
  }, [zoo, saldosIniciais, anoFiltro, mesFiltro, lancamentosPecuarios]);

  // ===========================================================================
  // FINANCEIRO — filtros de lançamentos
  // ===========================================================================

  // All lancamentos in the period (any status) — for audit
  const todosNoPeriodo = useMemo(() => {
    return lancamentos.filter(l => {
      const am = datePagtoAnoMes(l);
      if (!am) return false;
      return am.startsWith(periodoAlvo);
    });
  }, [lancamentos, periodoAlvo]);

  // Filter lancamentos: conciliado + data_pagamento in period
  const filtrados = useMemo(() => {
    return todosNoPeriodo.filter(l => isConciliado(l));
  }, [todosNoPeriodo]);

  // Split into entries and exits
  const entradasList = useMemo(() => filtrados.filter(isEntrada), [filtrados]);
  const saidasList = useMemo(() => filtrados.filter(isSaida), [filtrados]);

  // Status audit breakdown
  const auditStatus = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const l of todosNoPeriodo) {
      const status = (l.status_transacao || '(vazio)').trim();
      const entry = map.get(status) || { count: 0, total: 0 };
      entry.count++;
      entry.total += Math.abs(l.valor);
      map.set(status, entry);
    }
    return Array.from(map.entries())
      .map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [todosNoPeriodo]);

  // Rateio filtrado pelo período
  const rateioFiltrado = useMemo(() => {
    return rateioADM.filter(r => r.anoMes.startsWith(periodoAlvo));
  }, [rateioADM, periodoAlvo]);

  const totalRateioFiltrado = useMemo(
    () => rateioFiltrado.reduce((s, r) => s + r.valorRateado, 0),
    [rateioFiltrado],
  );

  // Indicadores financeiros + econômicos (usando zoo oficial)
  const ind = useMemo(() => {
    if (!indicadores) return null;

    const entradas = entradasList.reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidas = saidasList.reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidasComRateio = saidas + totalRateioFiltrado;

    // Desembolso acumulado (all months of the year up to selected month)
    const mesLimite = mesFiltro !== 'todos' ? Number(mesFiltro) : 12;
    const saidasAcum = lancamentos
      .filter(l => {
        if (!isConciliado(l)) return false;
        if (!isSaida(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        const lMes = Number(am.substring(5, 7));
        return lMes <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);
    const rateioAcum = rateioADM
      .filter(r => {
        if (!r.anoMes.startsWith(anoFiltro)) return false;
        const rMes = Number(r.anoMes.substring(5, 7));
        return rMes <= mesLimite;
      })
      .reduce((s, r) => s + r.valorRateado, 0);
    const desembolsoAcum = saidasAcum + rateioAcum;

    // Número de meses no acumulado
    const numMeses = mesFiltro !== 'todos' ? Number(mesFiltro) : 12;
    const mediaMenual = numMeses > 0 ? desembolsoAcum / numMeses : 0;

    // Indicadores econômicos — denominadores do zootécnico oficial
    const custoCabMes = zooData.cabMediaMes && zooData.cabMediaMes > 0
      ? saidasComRateio / zooData.cabMediaMes
      : null;
    // NOVA FÓRMULA: (gasto médio mensal) ÷ (rebanho médio acumulado)
    const custoCabAcum = zooData.cabMediaAcum && zooData.cabMediaAcum > 0 && numMeses > 0
      ? mediaMenual / zooData.cabMediaAcum
      : null;
    const custoArrobaProd = zooData.arrobasProduzidasAcum && zooData.arrobasProduzidasAcum > 0
      ? desembolsoAcum / zooData.arrobasProduzidasAcum
      : null;

    // Hierarquia macro (saídas only)
    const macroMap = new Map<string, number>();
    for (const l of saidasList) {
      if (!l.macro_custo) continue;
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
      saidas,
      saidasComRateio,
      desembolsoAcum,
      numMeses,
      mediaMenual,
      custoCabMes,
      custoCabAcum,
      custoArrobaProd,
      porMacro,
      rateioADM: totalRateioFiltrado,
    };
  }, [entradasList, saidasList, indicadores, lancamentos, anoFiltro, mesFiltro, zooData, totalRateioFiltrado, rateioADM]);

  // Chart data
  const chartData = useMemo(() => {
    const months = new Map<string, { entradas: number; saidas: number }>();
    for (const l of lancamentos) {
      if (!isConciliado(l)) continue;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) continue;
      const m = am.substring(5);
      const entry = months.get(m) || { entradas: 0, saidas: 0 };
      if (isEntrada(l)) entry.entradas += Math.abs(l.valor);
      if (isSaida(l)) entry.saidas += Math.abs(l.valor);
      months.set(m, entry);
    }
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, Entradas: v.entradas, Saídas: v.saidas }));
  }, [lancamentos, anoFiltro]);

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

      {/* Critério info */}
      <div className="text-[10px] text-muted-foreground bg-muted rounded-md px-2.5 py-1.5">
        Filtros: Status = Conciliado · Base = Data Pagamento · Entradas = 1-* · Saídas = 2-*
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
                <p className="text-[10px] text-muted-foreground">{entradasList.length} lançamentos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <TrendingDown className="h-3 w-3 text-red-600" /> Saídas
                </div>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.saidasComRateio)}</p>
                {!isGlobal && ind.rateioADM > 0 ? (
                  <div className="text-[10px] text-muted-foreground mt-0.5 space-y-0.5">
                    <p>Próprio: {formatMoeda(ind.saidas)} ({saidasList.length} lanç.)</p>
                    <p className="text-amber-600 dark:text-amber-400">+ Rateio ADM: {formatMoeda(ind.rateioADM)}</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">{saidasList.length} lançamentos</p>
                )}
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

          {/* Indicadores econômicos */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <Activity className="h-3.5 w-3.5" /> Indicadores Econômicos
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">Desembolso acumulado</div>
                  <p className="text-sm font-bold">{formatMoeda(ind.desembolsoAcum)}</p>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Média mensal</div>
                  <p className="text-sm font-bold">{formatMoeda(ind.mediaMenual)}</p>
                </div>
              </div>
              <div className="border-t pt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">Custo/cab mês</div>
                  <p className="text-sm font-bold">{ind.custoCabMes !== null ? formatMoeda(ind.custoCabMes) : '—'}</p>
                  {zooData.cabMediaMes !== null && (
                    <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaMes, 0)} cab méd.</p>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Custo/cab acum.</div>
                  <p className="text-sm font-bold">{ind.custoCabAcum !== null ? formatMoeda(ind.custoCabAcum) : '—'}</p>
                  {zooData.cabMediaAcum !== null && (
                    <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaAcum, 0)} cab méd.</p>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Custo/@ prod.</div>
                  <p className="text-sm font-bold">{ind.custoArrobaProd !== null ? formatMoeda(ind.custoArrobaProd) : '—'}</p>
                  {zooData.arrobasProduzidasAcum !== null && (
                    <p className="text-[9px] text-muted-foreground">{formatNum(zooData.arrobasProduzidasAcum, 1)} @ prod.</p>
                  )}
                </div>
              </div>
              {(zooData.cabMediaMes === null && zooData.cabMediaAcum === null && zooData.arrobasProduzidasAcum === null) && (
                <p className="text-[10px] text-muted-foreground italic">
                  Dados zootécnicos insuficientes — cadastre saldos iniciais e lançamentos para habilitar.
                </p>
              )}

              {/* Audit expandível dos indicadores econômicos */}
              <AuditEconomico
                saidasMes={ind.saidas}
                rateioMes={ind.rateioADM}
                desembolsoAcum={ind.desembolsoAcum}
                numMeses={ind.numMeses}
                gastoMedioMensal={ind.mediaMenual}
                custoCabMes={ind.custoCabMes}
                custoCabAcum={ind.custoCabAcum}
                custoArrobaProd={ind.custoArrobaProd}
                cabMediaMes={zooData.cabMediaMes}
                cabMediaAcum={zooData.cabMediaAcum}
                rebanhosMensais={zooData.rebanhosMensais}
                arrobasProduzidasAcum={zooData.arrobasProduzidasAcum}
                saldoAnterior={zooData.saldoAnterior}
                saldoFinalMes={zooData.saldoFinalMes}
                saldoInicialAno={zooData.saldoInicialAno}
                arrobasProduzidasMesZoo={zooData.arrobasProduzidasMes}
                gmdAcumZoo={zooData.gmdAcumulado}
                isGlobal={isGlobal}
                mesFiltro={mesFiltro}
              />
            </CardContent>
          </Card>

          {/* Auditoria de arrobas produzidas — Global vs Fazendas */}
          {isGlobal && (
            <AuditArrobasGlobal
              lancamentosPecuarios={lancamentosPecuarios}
              saldosIniciais={saldosIniciais}
              arrobasGlobalExibido={zooData.arrobasProduzidasAcum}
              anoFiltro={Number(anoFiltro)}
              mesFiltro={mesFiltro !== 'todos' ? Number(mesFiltro) : 12}
            />
          )}
          {/* Auditoria expandível */}
          {!isGlobal && (
            <div className="space-y-2">
              <button
                onClick={() => setShowAudit(!showAudit)}
                className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                🔍 Auditoria de lançamentos
                {showAudit ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showAudit && (
                <div className="space-y-3">
                  {/* Status audit breakdown */}
                  <Card className="border-dashed">
                    <CardContent className="p-3">
                      <div className="text-xs font-bold mb-2">📊 Lançamentos por Status no período</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] px-2 py-1.5">Status</TableHead>
                            <TableHead className="text-[10px] px-2 py-1.5 text-right">Qtde</TableHead>
                            <TableHead className="text-[10px] px-2 py-1.5 text-right">Total</TableHead>
                            <TableHead className="text-[10px] px-2 py-1.5 text-center">Usado?</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditStatus.map(s => {
                            const usado = s.status.toLowerCase() === 'conciliado';
                            return (
                              <TableRow key={s.status} className={usado ? 'bg-green-50 dark:bg-green-950/20' : 'opacity-60'}>
                                <TableCell className="text-[10px] px-2 py-1 font-bold">{s.status}</TableCell>
                                <TableCell className="text-[10px] px-2 py-1 text-right">{s.count}</TableCell>
                                <TableCell className="text-[10px] px-2 py-1 text-right font-mono">{formatMoeda(s.total)}</TableCell>
                                <TableCell className="text-[10px] px-2 py-1 text-center">{usado ? '✅' : '❌'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <div className="border-t mt-2 pt-2 text-[10px] text-muted-foreground">
                        Total no período: {todosNoPeriodo.length} lançamentos · Usados (Conciliado): {filtrados.length}
                      </div>
                    </CardContent>
                  </Card>

                  <AuditTable
                    title="Entradas próprias (1-*)"
                    lancamentos={entradasList}
                    totalLabel="Total entradas"
                  />
                  <AuditTable
                    title="Saídas próprias (2-*)"
                    lancamentos={saidasList}
                    totalLabel="Total saídas"
                  />

                  {/* Summary */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 space-y-1">
                      <div className="text-xs font-bold mb-2">Resumo da composição</div>
                      <div className="flex justify-between text-xs">
                        <span>Entradas próprias</span>
                        <span className="font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.entradas)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Saídas próprias</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.saidas)}</span>
                      </div>
                      {ind.rateioADM > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-amber-600 dark:text-amber-400">+ Rateio ADM</span>
                          <span className="font-bold text-amber-600 dark:text-amber-400">{formatMoeda(ind.rateioADM)}</span>
                        </div>
                      )}
                      <div className="border-t pt-1 mt-1 flex justify-between text-xs">
                        <span className="font-bold">Total saídas + rateio</span>
                        <span className="font-bold">{formatMoeda(ind.saidasComRateio)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

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
                    const pct = ind.saidasComRateio > 0 ? (m.valor / ind.saidasComRateio) * 100 : 0;
                    const isRateioItem = m.nome === 'ADM (Rateio)';
                    return (
                      <div key={m.nome}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className={`font-bold truncate mr-2 ${isRateioItem ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                            {m.nome}
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatMoeda(m.valor)} ({formatNum(pct, 1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isRateioItem ? 'bg-amber-500' : 'bg-primary'}`}
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
