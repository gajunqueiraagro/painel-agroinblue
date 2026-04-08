/**
 * Dashboard financeiro — redesign completo.
 *
 * ARQUITETURA:
 * - Dados FINANCEIROS: filtrados localmente (conciliado + data pagamento)
 * - Dados ZOOTÉCNICOS: exclusivamente de useIndicadoresZootecnicos (fonte única)
 * - PROIBIDO: cálculo local de saldos, pesos, arrobas ou cabeças médias
 *
 * Data base financeira: data_pagamento (YYYY-MM)
 * Entradas = tipo_operacao starts with "1"
 * Saídas = tipo_operacao starts with "2"
 * Status = Conciliado
 *
 * FILTRO ÚNICO: recebe ano e mesAte via props do container (FinanceiroCaixaTab).
 */
import { useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { calcValorTotal, calcArrobasSafe } from '@/lib/calculos/economicos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown, TrendingUp, Building2, AlertTriangle, ChevronDown, ChevronUp, Activity, BarChart3 } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { StandardTooltip } from '@/lib/chartConfig';
import {
  type FinanceiroLancamento,
  type RateioADM,
} from '@/hooks/useFinanceiro';
import {
  isConciliado as isConciliadoCentral,
  isEntrada as isEntradaCentral,
  isSaida as isSaidaCentral,
  datePagtoAnoMes as datePagtoAnoMesCentral,
  classificarEntrada as classificarEntradaCentral,
  classificarSaida as classificarSaidaCentral,
  isDesembolsoProdutivo as isDesembolsoProdutivoCentral,
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA,
} from '@/lib/financeiro/classificacao';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { useFazenda } from '@/contexts/FazendaContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use centralized classification — FONTE ÚNICA DE VERDADE (src/lib/financeiro/classificacao.ts)
const isConciliado = (l: FinanceiroLancamento) => isConciliadoCentral(l);
const isEntrada = (l: FinanceiroLancamento) => isEntradaCentral(l);
const isSaida = (l: FinanceiroLancamento) => isSaidaCentral(l);
const datePagtoAnoMes = (l: FinanceiroLancamento) => datePagtoAnoMesCentral(l);
const isDesembolsoProdutivo = (l: FinanceiroLancamento) => isDesembolsoProdutivoCentral(l);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DrillDownPayload {
  categoria: string;
  tipo: 'entrada' | 'saida';
  periodo: 'mes' | 'acum';
}

interface Props {
  lancamentos: FinanceiroLancamento[];
  indicadores: any;
  lancamentosPecuarios?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  rateioADM?: RateioADM[];
  isGlobal?: boolean;
  fazendasSemArea?: string[];
  pastos?: Pasto[];
  categorias?: CategoriaRebanho[];
  fazendaId?: string;
  /** Ano do filtro — vem do container */
  ano: number;
  /** Mês limite (1-12) — vem do container */
  mesAte: number;
  /** Callback para drill-down nas categorias */
  onDrillDown?: (payload: DrillDownPayload) => void;
}

// ---------------------------------------------------------------------------
// Rebanho médio mensal type
// ---------------------------------------------------------------------------

interface RebanhoMedioMensal {
  mes: number;
  saldoInicio: number;
  saldoFim: number;
  media: number;
}

// ---------------------------------------------------------------------------
// Sub: AuditTable (expandable)
// ---------------------------------------------------------------------------

function AuditTable({ title, lancamentos: lancs, totalLabel }: { title: string; lancamentos: FinanceiroLancamento[]; totalLabel: string }) {
  const [open, setOpen] = useState(false);
  const total = lancs.reduce((s, l) => s + Math.abs(l.valor), 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full">
          <CardTitle className="text-sm">🔍 {title} ({lancs.length})</CardTitle>
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
                  <TableHead className="text-[10px] px-2 py-1.5">Macro</TableHead>
                  <TableHead className="text-[10px] px-2 py-1.5">Centro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-[10px] px-2 py-1">{l.data_pagamento || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 max-w-[120px] truncate">{l.produto || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 text-right font-mono">{formatMoeda(Math.abs(l.valor))}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1">{l.status_transacao || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.macro_custo || '-'}</TableCell>
                    <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.centro_custo || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t mt-2 pt-2 flex justify-between text-xs">
            <span className="font-bold">{lancs.length} lançamentos</span>
            <span className="font-bold">{totalLabel}: {formatMoeda(total)}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub: Receitas Pecuárias por Competência — Audit
// ---------------------------------------------------------------------------

function AuditReceitaCompetencia({
  lancPecuarios,
  ano,
  mesLimite,
}: {
  lancPecuarios: Lancamento[];
  ano: number;
  mesLimite: number;
}) {
  const [open, setOpen] = useState(false);

  const dados = useMemo(() => {
    const tiposReceita = ['abate', 'venda', 'consumo'];
    const filtrados = lancPecuarios.filter(l => {
      if (!tiposReceita.includes(l.tipo)) return false;
      const lAno = Number(l.data.substring(0, 4));
      const lMes = Number(l.data.substring(5, 7));
      return lAno === ano && lMes <= mesLimite;
    });
    const totalCabecas = filtrados.reduce((s, l) => s + l.quantidade, 0);
    const totalArrobas = filtrados.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const totalValor = filtrados.reduce((s, l) => s + calcValorTotal(l), 0);
    return { filtrados, totalCabecas, totalArrobas, totalValor };
  }, [lancPecuarios, ano, mesLimite]);

  return (
    <div className="border-t pt-2 mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground w-full">
        🔍 Auditoria Receita Competência
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 bg-muted/50 rounded-md p-2 space-y-1 text-[10px]">
          <div className="font-bold text-xs">Receitas Pecuárias por Competência (jan→mês {mesLimite})</div>
          <div className="text-muted-foreground">
            Fórmula: Σ calcValorTotal(l) para lançamentos de abate, venda e consumo do módulo pecuário
          </div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div>
              <span className="text-muted-foreground">Cabeças:</span>
              <div className="font-mono font-bold">{formatNum(dados.totalCabecas, 0)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Arrobas:</span>
              <div className="font-mono font-bold">{formatNum(dados.totalArrobas, 1)} @</div>
            </div>
            <div>
              <span className="text-muted-foreground">Valor total:</span>
              <div className="font-mono font-bold">{formatMoeda(dados.totalValor)}</div>
            </div>
          </div>
          <div className="text-muted-foreground mt-1">
            Critério: tipo ∈ [abate, venda, consumo] · ano = {ano} · mês ≤ {mesLimite}
          </div>
          <div style={{ color: 'hsl(var(--primary))' }}>
            ✅ Fonte: calcValorTotal (hierarquia: valor_total → cálculo por @ → preço/cab)
          </div>
          <div className="text-muted-foreground mt-1">{dados.filtrados.length} lançamentos pecuários</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Audit Desembolso Produtivo
// ---------------------------------------------------------------------------

function AuditDesembolsoProdutivo({
  desembolsoMes,
  rateioMes,
  desembolsoAcum,
  rateioAcum,
  numMeses,
  mediaMensal,
  custoCabMes,
  custoCabAcum,
  custoArrobaProd,
  cabMediaMes,
  cabMediaAcum,
  rebanhosMensais,
  arrobasProduzidasAcum,
  saldoAnterior,
  saldoFinalMes,
  mesFiltro,
  isGlobal: isG,
}: {
  desembolsoMes: number;
  rateioMes: number;
  desembolsoAcum: number;
  rateioAcum: number;
  numMeses: number;
  mediaMensal: number;
  custoCabMes: number | null;
  custoCabAcum: number | null;
  custoArrobaProd: number | null;
  cabMediaMes: number | null;
  cabMediaAcum: number | null;
  rebanhosMensais: RebanhoMedioMensal[];
  arrobasProduzidasAcum: number | null;
  saldoAnterior: number;
  saldoFinalMes: number;
  mesFiltro: number;
  isGlobal: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t pt-2 mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground w-full">
        🔍 Auditoria Desembolso Produtivo e Indicadores
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[10px]">
          {/* Desembolso mês */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Desembolso Produtivo — Mês</div>
            <div className="text-muted-foreground">
              Filtro: saídas conciliadas · macro_custo ∈ [Custeio Produtivo, Investimento na Fazenda]
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Saídas próprias:</span>
                <div className="font-mono font-bold">{formatMoeda(desembolsoMes)}</div>
              </div>
              {!isG && rateioMes > 0 && (
                <div>
                  <span className="text-muted-foreground">+ Rateio ADM:</span>
                  <div className="font-mono font-bold text-amber-600">{formatMoeda(rateioMes)}</div>
                </div>
              )}
            </div>
            <div className="border-t pt-1 font-bold">Total mês: {formatMoeda(desembolsoMes + rateioMes)}</div>
          </div>

          {/* Custo/cab mês */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/cab mês</div>
            <div className="text-muted-foreground">Fórmula: desembolso_mês ÷ cab_média_mês</div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Numerador:</span>
                <div className="font-mono font-bold">{formatMoeda(desembolsoMes + rateioMes)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Denominador:</span>
                <div className="font-mono font-bold">{cabMediaMes !== null ? formatNum(cabMediaMes, 1) : '—'}</div>
                <div className="text-muted-foreground">({formatNum(saldoAnterior, 0)} + {formatNum(saldoFinalMes, 0)}) ÷ 2</div>
                <div style={{ color: 'hsl(var(--primary))' }}>✅ Fonte: zootécnico oficial</div>
              </div>
            </div>
            <div className="border-t pt-1 font-bold">Resultado: {custoCabMes !== null ? formatMoeda(custoCabMes) : '—'}</div>
          </div>

          {/* Custo/cab acumulado */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/cab acumulado (jan→mês {mesFiltro})</div>
            <div className="text-muted-foreground">Fórmula: (desembolso_acum ÷ meses) ÷ rebanho_médio_acum</div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Desembolso acum:</span>
                <div className="font-mono font-bold">{formatMoeda(desembolsoAcum)}</div>
                <span className="text-muted-foreground">Nº meses:</span>
                <div className="font-mono font-bold">{numMeses}</div>
                <span className="text-muted-foreground">Média mensal:</span>
                <div className="font-mono font-bold">{formatMoeda(mediaMensal)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Rebanho médio acum:</span>
                <div className="font-mono font-bold">{cabMediaAcum !== null ? formatNum(cabMediaAcum, 1) : '—'}</div>
                <div className="text-muted-foreground">= média dos rebanhos médios mensais</div>
                <div style={{ color: 'hsl(var(--primary))' }}>✅ Fonte: zootécnico oficial</div>
              </div>
            </div>
            {rebanhosMensais.length > 0 && (
              <div className="border-t pt-1 mt-1">
                <div className="text-muted-foreground font-bold mb-1">Rebanho médio por mês:</div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                  {rebanhosMensais.map(rm => (
                    <div key={rm.mes} className="flex justify-between">
                      <span className="text-muted-foreground">M{rm.mes}:</span>
                      <span className="font-mono">{formatNum(rm.media, 0)} <span className="text-muted-foreground text-[8px]">({formatNum(rm.saldoInicio, 0)}+{formatNum(rm.saldoFim, 0)})/2</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t pt-1 font-bold">
              Resultado: {custoCabAcum !== null ? formatMoeda(custoCabAcum) : '—'}
              {custoCabAcum !== null && (
                <span className="font-normal text-muted-foreground ml-1">
                  = {formatMoeda(mediaMensal)} ÷ {cabMediaAcum !== null ? formatNum(cabMediaAcum, 1) : '—'}
                </span>
              )}
            </div>
          </div>

          {/* Custo/@ produzida */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/@ produzida (jan→mês {mesFiltro})</div>
            <div className="text-muted-foreground">Fórmula: desembolso_acum ÷ arrobas_produzidas_acum</div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Numerador:</span>
                <div className="font-mono font-bold">{formatMoeda(desembolsoAcum)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Denominador:</span>
                <div className="font-mono font-bold">{arrobasProduzidasAcum !== null ? `${formatNum(arrobasProduzidasAcum, 1)} @` : '—'}</div>
                <div style={{ color: 'hsl(var(--primary))' }}>✅ Fonte: zootécnico oficial</div>
              </div>
            </div>
            <div className="border-t pt-1 font-bold">Resultado: {custoArrobaProd !== null ? formatMoeda(custoArrobaProd) : '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Toggle button group
// ---------------------------------------------------------------------------

function ToggleGroup({ value, onChange }: { value: 'mes' | 'acum'; onChange: (v: 'mes' | 'acum') => void }) {
  return (
    <div className="flex gap-1">
      {(['mes', 'acum'] as const).map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${value === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
          {t === 'mes' ? 'Mês' : 'Acumulado'}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Unified Entradas/Saídas card with toggle
// ---------------------------------------------------------------------------

function CardEntradaSaidaToggle({ ind, isGlobal, onDrillDown }: { ind: any; isGlobal: boolean; onDrillDown?: (payload: DrillDownPayload) => void }) {
  const [entradaTab, setEntradaTab] = useState<'mes' | 'acum'>('mes');
  const [saidaTab, setSaidaTab] = useState<'mes' | 'acum'>('mes');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {/* Entradas em Caixa */}
      <Card>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400">
              <TrendingUp className="h-3.5 w-3.5" /> Entradas em Caixa
            </div>
            <ToggleGroup value={entradaTab} onChange={setEntradaTab} />
          </div>
          <p className="text-xl font-extrabold text-green-700 dark:text-green-400 text-right">
            {formatMoeda(entradaTab === 'mes' ? ind.totalEntradas : ind.entradasAcum)}
          </p>
          <div className="space-y-0.5 border-t border-border/50 pt-1.5">
            {ind.categoriasEntrada.map((cat: string) => (
              <div
                key={cat}
                className="flex justify-between text-xs italic cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                onClick={() => onDrillDown?.({ categoria: cat, tipo: 'entrada', periodo: entradaTab === 'mes' ? 'mes' : 'acum' })}
              >
                <span className="text-muted-foreground truncate max-w-[55%] mr-2">{cat}</span>
                <span className="font-mono font-semibold whitespace-nowrap text-green-600 dark:text-green-400">
                  {formatMoeda((entradaTab === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum).get(cat) || 0)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Saídas em Caixa */}
      <Card>
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
              <TrendingDown className="h-3.5 w-3.5" /> Saídas em Caixa
            </div>
            <ToggleGroup value={saidaTab} onChange={setSaidaTab} />
          </div>
          <p className="text-xl font-extrabold text-red-600 dark:text-red-400 text-right">
            {formatMoeda(saidaTab === 'mes' ? ind.saidasComRateio : (ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal)))}
          </p>
          <div className="space-y-0.5 border-t border-border/50 pt-1.5">
            {ind.categoriasSaida.map((cat: string) => (
              <div
                key={cat}
                className="flex justify-between text-xs italic cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                onClick={() => onDrillDown?.({ categoria: cat, tipo: 'saida', periodo: saidaTab === 'mes' ? 'mes' : 'acum' })}
              >
                <span className="text-muted-foreground truncate max-w-[55%] mr-2">{cat}</span>
                <span className="font-mono font-semibold whitespace-nowrap text-red-600 dark:text-red-400">
                  {formatMoeda((saidaTab === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum).get(cat) || 0)}
                </span>
              </div>
            ))}
            {/* Próprio / Rateio ADM */}
            <div className="border-t border-border/50 pt-1 mt-1 space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground font-semibold">Próprio</span>
                <span className="font-mono font-bold text-red-600 dark:text-red-400">
                  {formatMoeda(saidaTab === 'mes' ? ind.totalSaidas : ind.saidasAcum)}
                </span>
              </div>
              {!isGlobal && (saidaTab === 'mes' ? ind.rateioMes : ind.rateioAcumVal) > 0 && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-amber-600 dark:text-amber-400">Rateio ADM</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatMoeda(saidaTab === 'mes' ? ind.rateioMes : ind.rateioAcumVal)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="text-[8px] text-muted-foreground italic">* Reposição e Dedução não entram no desembolso produtivo</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Unified Centro de Custo with toggle
// ---------------------------------------------------------------------------

function CentroCustoUnificado({ ind, zooData }: { ind: any; zooData: any }) {
  const [tab, setTab] = useState<'mes' | 'acum'>('mes');
  const items = tab === 'mes' ? ind.ccMes : ind.ccAcum;
  const cabMedia = tab === 'mes' ? zooData.cabMediaMes : zooData.cabMediaAcum;
  const divisor = tab === 'acum' && ind.numMeses > 0 ? ind.numMeses : 1;
  const displayItems = items.map((i: any) => ({ ...i, valor: i.valor / divisor }));
  const total = displayItems.reduce((s: number, i: any) => s + i.valor, 0);

  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <BarChart3 className="h-3 w-3 inline mr-1" />Desembolso por Centro
          </div>
          <div className="flex gap-1">
            {(['mes', 'acum'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
                {t === 'mes' ? 'Mês' : 'Média'}
              </button>
            ))}
          </div>
        </div>
        {/* Total */}
        <div className="flex items-center justify-between text-[10px] font-bold border-b pb-1 mb-1">
          <span className="text-red-600 dark:text-red-400">TOTAL</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-red-600 dark:text-red-400">{formatMoeda(total)}</span>
            <span className="text-muted-foreground">100%</span>
            {cabMedia && cabMedia > 0 && (
              <span className="text-muted-foreground font-mono text-[9px]">{formatMoeda(total / cabMedia)}/cab</span>
            )}
          </div>
        </div>
        {/* Items */}
        {displayItems.map((item: any) => {
          const pct = total > 0 ? (item.valor / total) * 100 : 0;
          const isRateio = item.nome === 'Rateio ADM';
          return (
            <div key={item.nome} className={`flex items-center justify-between text-[10px] py-0.5 ${isRateio ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              <span className="truncate max-w-[40%] mr-1.5">{item.nome}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(item.valor)}</span>
                <span className="text-muted-foreground w-9 text-right">{formatNum(pct, 1)}%</span>
                {cabMedia && cabMedia > 0 && (
                  <span className="text-muted-foreground font-mono text-[9px] w-16 text-right">{formatMoeda(item.valor / cabMedia)}/cab</span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
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
  ano,
  mesAte,
  onDrillDown,
}: Props) {
  const [showAudit, setShowAudit] = useState(false);
  const isMobile = useIsMobile();
  const { fazendas } = useFazenda();

  const fazendaIdsReais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__').map(f => f.id),
    [fazendas],
  );

  // Use props instead of internal state
  const anoFiltro = String(ano);
  const mesLimite = mesAte;
  const mesNum = mesAte;

  // Period target for filtering
  const periodoMes = `${anoFiltro}-${String(mesAte).padStart(2, '0')}`;

  // =========================================================================
  // ZOOTÉCNICO — FONTE ÚNICA
  // =========================================================================

  const zoo = useIndicadoresZootecnicos(
    fazendaId, ano, mesNum,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  const arrobasGlobal = useArrobasGlobal(
    isGlobal, lancamentosPecuarios, saldosIniciais, categorias,
    ano, mesNum, fazendaIdsReais,
  );

  // FONTE OFICIAL: useRebanhoOficial para cabeças médias
  const rebanhoOf = useRebanhoOficial({ ano, cenario: 'realizado', global: isGlobal });

  const zooData = useMemo(() => {
    const saldoAnterior = zoo.gmdAberturaMes.estoqueInicialDetalhe.reduce((s, d) => s + d.cabecas, 0);
    const saldoFinalMes = zoo.saldoFinalMes;
    const cabMediaMes = (saldoAnterior > 0 || saldoFinalMes > 0) ? (saldoAnterior + saldoFinalMes) / 2 : null;

    const rebanhosMensais: RebanhoMedioMensal[] = [];
    for (let m = 1; m <= mesLimite; m++) {
      const faz = rebanhoOf.getFazendaMes(m);
      const saldoInicioMes = faz?.cabecasInicio ?? 0;
      const saldoFimMes = faz?.cabecasFinal ?? 0;
      const media = (saldoInicioMes + saldoFimMes) / 2;
      rebanhosMensais.push({ mes: m, saldoInicio: saldoInicioMes, saldoFim: saldoFimMes, media });
    }

    const cabMediaAcum = rebanhosMensais.length > 0
      ? rebanhosMensais.reduce((s, rm) => s + rm.media, 0) / rebanhosMensais.length
      : null;

    const arrobasProduzidasAcum = isGlobal
      ? arrobasGlobal.somaArrobas
      : zoo.arrobasProduzidasAcumulado;

    const saldoInicialAno = rebanhoOf.getFazendaMes(1)?.cabecasInicio ?? 0;

    return {
      cabMediaMes, cabMediaAcum, rebanhosMensais, arrobasProduzidasAcum,
      saldoAnterior, saldoFinalMes, saldoInicialAno,
      arrobasProduzidasMes: zoo.arrobasProduzidasMes,
      gmdAcumulado: zoo.gmdAcumulado,
    };
  }, [zoo, rebanhoOf.loading, rebanhoOf.getFazendaMes, mesLimite, isGlobal, arrobasGlobal.somaArrobas]);

  // =========================================================================
  // FINANCEIRO — filtros (mês selecionado)
  // =========================================================================

  const filtradosMes = useMemo(() =>
    lancamentos.filter(l => {
      if (!isConciliado(l)) return false;
      const am = datePagtoAnoMes(l);
      return am === periodoMes;
    }), [lancamentos, periodoMes]);

  const todosNoPeriodoMes = useMemo(() =>
    lancamentos.filter(l => {
      const am = datePagtoAnoMes(l);
      return am === periodoMes;
    }), [lancamentos, periodoMes]);

  const entradasListMes = useMemo(() => filtradosMes.filter(isEntrada), [filtradosMes]);
  const saidasListMes = useMemo(() => filtradosMes.filter(isSaida), [filtradosMes]);

  // Rateio filtrado (mês)
  const rateioFiltradoMes = useMemo(() => rateioADM.filter(r => r.anoMes === periodoMes), [rateioADM, periodoMes]);
  const totalRateioMes = useMemo(() => rateioFiltradoMes.reduce((s, r) => s + r.valorRateado, 0), [rateioFiltradoMes]);

  // Status audit
  const auditStatus = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const l of todosNoPeriodoMes) {
      const status = (l.status_transacao || '(vazio)').trim();
      const entry = map.get(status) || { count: 0, total: 0 };
      entry.count++;
      entry.total += Math.abs(l.valor);
      map.set(status, entry);
    }
    return Array.from(map.entries()).map(([status, v]) => ({ status, ...v })).sort((a, b) => b.total - a.total);
  }, [todosNoPeriodoMes]);

  // =========================================================================
  // INDICADORES CALCULADOS
  // =========================================================================

  const ind = useMemo(() => {
    const totalEntradas = entradasListMes.reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalSaidas = saidasListMes.reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidasComRateio = totalSaidas + totalRateioMes;

    // --- Desembolso produtivo mês ---
    const desembolsoProdMesProprio = filtradosMes
      .filter(l => isDesembolsoProdutivo(l))
      .reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembolsoProdMes = desembolsoProdMesProprio + totalRateioMes;

    // --- Desembolso produtivo acumulado ---
    const desembolsoProdAcumProprio = lancamentos
      .filter(l => {
        if (!isConciliado(l) || !isDesembolsoProdutivo(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const rateioAcumVal = rateioADM
      .filter(r => r.anoMes.startsWith(anoFiltro) && Number(r.anoMes.substring(5, 7)) <= mesLimite)
      .reduce((s, r) => s + r.valorRateado, 0);

    const desembolsoAcum = desembolsoProdAcumProprio + rateioAcumVal;

    const numMeses = mesLimite;
    const mediaMensal = numMeses > 0 ? desembolsoAcum / numMeses : 0;

    // --- Indicadores econômicos ---
    const custoCabMes = zooData.cabMediaMes && zooData.cabMediaMes > 0
      ? desembolsoProdMes / zooData.cabMediaMes : null;
    const custoCabAcum = zooData.cabMediaAcum && zooData.cabMediaAcum > 0 && numMeses > 0
      ? mediaMensal / zooData.cabMediaAcum : null;
    const custoArrobaProd = zooData.arrobasProduzidasAcum && zooData.arrobasProduzidasAcum > 0
      ? desembolsoAcum / zooData.arrobasProduzidasAcum : null;

    // --- Entradas acumuladas ---
    const entradasAcum = lancamentos
      .filter(l => {
        if (!isConciliado(l) || !isEntrada(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    // --- Saídas acumuladas ---
    const saidasAcum = lancamentos
      .filter(l => {
        if (!isConciliado(l) || !isSaida(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    // --- Decomposição entradas (usa classificação centralizada) ---
    const entradaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    const categoriasEntrada = [...CATEGORIAS_ENTRADA];
    for (const cat of categoriasEntrada) { entradaDecomp.mes.set(cat, 0); entradaDecomp.acum.set(cat, 0); }

    for (const l of entradasListMes) {
      const cat = classificarEntradaCentral(l);
      entradaDecomp.mes.set(cat, (entradaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }

    lancamentos.filter(l => {
      if (!isConciliado(l) || !isEntrada(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cat = classificarEntradaCentral(l);
      entradaDecomp.acum.set(cat, (entradaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // --- Decomposição saídas (usa classificação centralizada) ---
    const categoriasSaida = [...CATEGORIAS_SAIDA];
    const saidaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of categoriasSaida) { saidaDecomp.mes.set(cat, 0); saidaDecomp.acum.set(cat, 0); }

    for (const l of saidasListMes) {
      const cat = classificarSaidaCentral(l);
      saidaDecomp.mes.set(cat, (saidaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }

    lancamentos.filter(l => {
      if (!isConciliado(l) || !isSaida(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cat = classificarSaidaCentral(l);
      saidaDecomp.acum.set(cat, (saidaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // --- Receitas Pecuárias por Competência ---
    const tiposReceitaComp = ['abate', 'venda', 'consumo'];
    const recPecCompetenciaMes = lancamentosPecuarios
      .filter(l => {
        if (!tiposReceitaComp.includes(l.tipo)) return false;
        const lAno = Number(l.data.substring(0, 4));
        const lMes = Number(l.data.substring(5, 7));
        return lAno === ano && lMes === mesAte;
      })
      .reduce((s, l) => s + calcValorTotal(l), 0);

    const recPecCompetenciaAcum = lancamentosPecuarios
      .filter(l => {
        if (!tiposReceitaComp.includes(l.tipo)) return false;
        const lAno = Number(l.data.substring(0, 4));
        const lMes = Number(l.data.substring(5, 7));
        return lAno === ano && lMes <= mesLimite;
      })
      .reduce((s, l) => s + calcValorTotal(l), 0);

    // --- Receitas Pecuárias por Caixa (derivadas de centro_custo, não escopo_negocio) ---
    const normMacroLocal = (l: FinanceiroLancamento) => (l.macro_custo || '').toLowerCase().trim();
    const normCentroLocal = (l: FinanceiroLancamento) => (l.centro_custo || '').toLowerCase().trim();

    const isReceitaPec = (l: FinanceiroLancamento) => {
      if (normMacroLocal(l) !== 'receitas') return false;
      const centro = normCentroLocal(l);
      return centro.includes('pecuári') || centro.includes('pecuaria') || centro.includes('pec');
    };

    const recPecCaixaMes = entradasListMes
      .filter(isReceitaPec)
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const recPecCaixaAcum = lancamentos
      .filter(l => {
        if (!isConciliado(l) || !isEntrada(l)) return false;
        if (!isReceitaPec(l)) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    // --- Centro de custo (mês e acumulado) ---
    const ccMesMap = new Map<string, number>();
    const ccAcumMap = new Map<string, number>();

    for (const l of saidasListMes) {
      if (!isDesembolsoProdutivo(l)) continue;
      const cc = (l.centro_custo || 'Não classificado').trim();
      ccMesMap.set(cc, (ccMesMap.get(cc) || 0) + Math.abs(l.valor));
    }

    lancamentos.filter(l => {
      if (!isConciliado(l) || !isSaida(l) || !isDesembolsoProdutivo(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cc = (l.centro_custo || 'Não classificado').trim();
      ccAcumMap.set(cc, (ccAcumMap.get(cc) || 0) + Math.abs(l.valor));
    });

    // Add rateio as separate line
    if (!isGlobal && totalRateioMes > 0) {
      ccMesMap.set('Rateio ADM', totalRateioMes);
    }
    if (!isGlobal && rateioAcumVal > 0) {
      ccAcumMap.set('Rateio ADM', rateioAcumVal);
    }

    const ccMes = Array.from(ccMesMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
    const ccAcum = Array.from(ccAcumMap.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);

    return {
      totalEntradas, totalSaidas, saidasComRateio,
      entradasAcum, saidasAcum,
      desembolsoProdMes, desembolsoProdMesProprio, desembolsoAcum, desembolsoProdAcumProprio, rateioAcumVal,
      numMeses, mediaMensal,
      custoCabMes, custoCabAcum, custoArrobaProd,
      entradaDecomp, saidaDecomp, categoriasEntrada, categoriasSaida,
      recPecCompetenciaMes, recPecCompetenciaAcum,
      recPecCaixaMes, recPecCaixaAcum,
      ccMes, ccAcum,
      rateioMes: totalRateioMes,
    };
  }, [entradasListMes, saidasListMes, filtradosMes, lancamentos, anoFiltro, mesLimite, zooData, totalRateioMes, rateioADM, lancamentosPecuarios, isGlobal, ano, mesAte]);

  // =========================================================================
  // GRÁFICO — Jan → Dez fixo
  // =========================================================================
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { entradas: number; saidas: number }>();
    for (let m = 1; m <= 12; m++) {
      monthMap.set(String(m).padStart(2, '0'), { entradas: 0, saidas: 0 });
    }
    for (const l of lancamentos) {
      if (!isConciliado(l)) continue;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) continue;
      const m = am.substring(5);
      const entry = monthMap.get(m);
      if (!entry) continue;
      if (isEntrada(l)) entry.entradas += Math.abs(l.valor);
      if (isSaida(l)) entry.saidas += Math.abs(l.valor);
    }
    let saldoAcum = 0;
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => {
        saldoAcum += v.entradas - v.saidas;
        return {
          mes: MESES_NOMES[Number(mes) - 1] || mes,
          Entradas: v.entradas,
          Saídas: v.saidas,
          'Saldo Acum.': saldoAcum,
        };
      });
  }, [lancamentos, anoFiltro]);

  // =========================================================================
  // Empty state
  // =========================================================================
  if (lancamentos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
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

      {!isGlobal && fazendasSemArea && fazendasSemArea.length > 0 && (
        <div className="flex items-start gap-2 text-xs bg-destructive/5 border border-destructive/30 rounded-md px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            <span className="font-bold text-destructive">Rateio ADM incompleto:</span>{' '}
            {fazendasSemArea.join(', ')} sem rebanho cadastrado no período.
          </span>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground bg-muted rounded-md px-2.5 py-1.5">
        Filtros: Status = Realizado · Base = Data Pagamento · Entradas = 1-* · Saídas = 2-*
      </div>

      {/* ================================================================= */}
      {/* 1. CARDS ENTRADAS / SAÍDAS — com toggle Mês/Acumulado */}
      {/* ================================================================= */}
      <CardEntradaSaidaToggle ind={ind} isGlobal={isGlobal} onDrillDown={onDrillDown} />

      {/* ================================================================= */}
      {/* 2. INDICADORES ECONÔMICOS — 2 colunas */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* ESQUERDA — Receitas */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Receitas Pecuárias
            </div>

            {/* Por Competência */}
            <div>
              <div className="text-[10px] text-muted-foreground">por Competência</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.recPecCompetenciaMes)}</span>
                <span className="text-[9px] text-muted-foreground">mês</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-foreground">{formatMoeda(ind.recPecCompetenciaAcum)}</span>
                <span className="text-[9px] text-muted-foreground">acumulado</span>
              </div>
            </div>

            {/* Por Caixa */}
            <div className="border-t pt-2">
              <div className="text-[10px] text-muted-foreground">por Caixa</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.recPecCaixaMes)}</span>
                <span className="text-[9px] text-muted-foreground">mês</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-foreground">{formatMoeda(ind.recPecCaixaAcum)}</span>
                <span className="text-[9px] text-muted-foreground">acumulado</span>
              </div>
            </div>

            {/* Auditoria Receita Competência */}
            <AuditReceitaCompetencia
              lancPecuarios={lancamentosPecuarios}
              ano={ano}
              mesLimite={mesLimite}
            />
          </CardContent>
        </Card>

        {/* DIREITA — Desembolso Produtivo e Custos */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Desembolso & Custos
            </div>

            {/* Desembolso Produtivo mês */}
            <div>
              <div className="text-[10px] text-muted-foreground">Desembolso Prod. mês</div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.desembolsoProdMes)}</p>
            </div>

            {/* Custo/cab mês */}
            <div>
              <div className="text-[10px] text-muted-foreground">Custo/cab mês</div>
              <p className="text-sm font-bold">{ind.custoCabMes !== null ? formatMoeda(ind.custoCabMes) : '—'}</p>
              {zooData.cabMediaMes !== null && (
                <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaMes, 0)} cab méd.</p>
              )}
            </div>

            <div className="border-t pt-2">
              {/* Desembolso Produtivo acumulado */}
              <div className="text-[10px] text-muted-foreground">Desembolso Prod. acumulado</div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.desembolsoAcum)}</p>
            </div>

            {/* Média mensal */}
            <div className="bg-muted/60 rounded-md p-2">
              <div className="text-[10px] text-muted-foreground">Média mensal</div>
              <p className="text-base font-extrabold text-red-600 dark:text-red-400">{formatMoeda(ind.mediaMensal)}</p>
            </div>

            {/* Custo/cab acumulado */}
            <div>
              <div className="text-[10px] text-muted-foreground">Custo/cab acumulado</div>
              <p className="text-sm font-bold">{ind.custoCabAcum !== null ? formatMoeda(ind.custoCabAcum) : '—'}</p>
              {zooData.cabMediaAcum !== null && (
                <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaAcum, 0)} cab méd.</p>
              )}
            </div>

            {/* Custo/@ produzida */}
            <div>
              <div className="text-[10px] text-muted-foreground">Custo/@ produzida</div>
              <p className="text-base font-extrabold text-red-600 dark:text-red-400">{ind.custoArrobaProd !== null ? formatMoeda(ind.custoArrobaProd) : '—'}</p>
              {zooData.arrobasProduzidasAcum !== null && (
                <p className="text-[9px] text-muted-foreground">{formatNum(zooData.arrobasProduzidasAcum, 1)} @ produzidas</p>
              )}
            </div>

            {(zooData.cabMediaMes === null && zooData.cabMediaAcum === null && zooData.arrobasProduzidasAcum === null) && (
              <p className="text-[10px] text-muted-foreground italic">
                Dados zootécnicos insuficientes — cadastre saldos iniciais e lançamentos.
              </p>
            )}

            {/* Auditoria Desembolso */}
            <AuditDesembolsoProdutivo
              desembolsoMes={ind.desembolsoProdMesProprio}
              rateioMes={ind.rateioMes}
              desembolsoAcum={ind.desembolsoAcum}
              rateioAcum={ind.rateioAcumVal}
              numMeses={ind.numMeses}
              mediaMensal={ind.mediaMensal}
              custoCabMes={ind.custoCabMes}
              custoCabAcum={ind.custoCabAcum}
              custoArrobaProd={ind.custoArrobaProd}
              cabMediaMes={zooData.cabMediaMes}
              cabMediaAcum={zooData.cabMediaAcum}
              rebanhosMensais={zooData.rebanhosMensais}
              arrobasProduzidasAcum={zooData.arrobasProduzidasAcum}
              saldoAnterior={zooData.saldoAnterior}
              saldoFinalMes={zooData.saldoFinalMes}
              mesFiltro={mesAte}
              isGlobal={isGlobal}
            />
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 3. GRÁFICO — Jan → Dez fixo */}
      {/* ================================================================= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Entradas vs Saídas — {anoFiltro}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<StandardTooltip isCurrency />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="Entradas" fill="hsl(120, 40%, 40%)" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="Saídas" fill="hsl(0, 65%, 50%)" radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="Saldo Acum." stroke="hsl(210, 70%, 50%)" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* 4. QUADRO CENTRO DE CUSTO — card único com toggle */}
      {/* ================================================================= */}
      {(ind.ccMes.length > 0 || ind.ccAcum.length > 0) && (
        <CentroCustoUnificado ind={ind} zooData={zooData} />
      )}

      {/* ================================================================= */}
      {/* AUDITORIA — expandível */}
      {/* ================================================================= */}
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
                        const usado = s.status.toLowerCase() === 'realizado';
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
                    Total no período: {todosNoPeriodoMes.length} · Usados (Realizado): {filtradosMes.length}
                  </div>
                </CardContent>
              </Card>

              <AuditTable title="Entradas próprias (1-*)" lancamentos={entradasListMes} totalLabel="Total entradas" />
              <AuditTable title="Saídas próprias (2-*)" lancamentos={saidasListMes} totalLabel="Total saídas" />

              <Card className="bg-muted/50">
                <CardContent className="p-3 space-y-1">
                  <div className="text-xs font-bold mb-2">Resumo da composição</div>
                  <div className="flex justify-between text-xs">
                    <span>Entradas próprias</span>
                    <span className="font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.totalEntradas)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Saídas próprias</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.totalSaidas)}</span>
                  </div>
                  {ind.rateioMes > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-amber-600 dark:text-amber-400">+ Rateio ADM</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{formatMoeda(ind.rateioMes)}</span>
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
    </div>
  );
}
