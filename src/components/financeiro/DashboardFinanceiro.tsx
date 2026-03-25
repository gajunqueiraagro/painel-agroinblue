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
 */
import { useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { calcValorTotal, calcArrobasSafe } from '@/lib/calculos/economicos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown, TrendingUp, Building2, AlertTriangle, ChevronDown, ChevronUp, Activity, BarChart3 } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_OPTIONS, MESES_NOMES } from '@/lib/calculos/labels';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import {
  type FinanceiroLancamento,
  type RateioADM,
  isDesembolsoProdutivo,
} from '@/hooks/useFinanceiro';
import { useIndicadoresZootecnicos } from '@/hooks/useIndicadoresZootecnicos';
import { useArrobasGlobal } from '@/hooks/useArrobasGlobal';
import { useFazenda } from '@/contexts/FazendaContext';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase() === 'conciliado';

const isEntrada = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('1');

const isSaida = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('2');

const datePagtoAnoMes = (l: FinanceiroLancamento): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

const normMacro = (l: FinanceiroLancamento) =>
  (l.macro_custo || '').toLowerCase().trim();

const normEscopo = (l: FinanceiroLancamento) =>
  (l.escopo_negocio || '').toLowerCase().trim();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
          <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>
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
  mesFiltro: string;
  isGlobal: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mesLabel = mesFiltro !== 'todos' ? mesFiltro : '12';

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
                <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>✅ Fonte: zootécnico oficial</div>
              </div>
            </div>
            <div className="border-t pt-1 font-bold">Resultado: {custoCabMes !== null ? formatMoeda(custoCabMes) : '—'}</div>
          </div>

          {/* Custo/cab acumulado */}
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Custo/cab acumulado (jan→mês {mesLabel})</div>
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
                <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>✅ Fonte: zootécnico oficial</div>
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
            <div className="font-bold text-xs">Custo/@ produzida (jan→mês {mesLabel})</div>
            <div className="text-muted-foreground">Fórmula: desembolso_acum ÷ arrobas_produzidas_acum</div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <span className="text-muted-foreground">Numerador:</span>
                <div className="font-mono font-bold">{formatMoeda(desembolsoAcum)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Denominador:</span>
                <div className="font-mono font-bold">{arrobasProduzidasAcum !== null ? `${formatNum(arrobasProduzidasAcum, 1)} @` : '—'}</div>
                <div className="text-muted-foreground" style={{ color: 'hsl(var(--primary))' }}>✅ Fonte: zootécnico oficial</div>
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
// Sub: Mobile Detalhe Entradas/Saídas (tabbed)
// ---------------------------------------------------------------------------

function MobileDetalheEntradaSaida({ ind }: { ind: any }) {
  const [entradaTab, setEntradaTab] = useState<'mes' | 'acum'>('mes');
  const [saidaTab, setSaidaTab] = useState<'mes' | 'acum'>('mes');

  return (
    <div className="space-y-2">
      {/* Entradas */}
      <Card className="bg-card/80">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Entradas</div>
            <div className="flex gap-1">
              {(['mes', 'acum'] as const).map(t => (
                <button key={t} onClick={() => setEntradaTab(t)}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${entradaTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
                  {t === 'mes' ? 'Mês' : 'Acumulado'}
                </button>
              ))}
            </div>
          </div>
          {ind.categoriasEntrada.map((cat: string) => (
            <div key={cat} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{cat}</span>
              <span className="font-mono font-bold">{formatMoeda((entradaTab === 'mes' ? ind.entradaDecomp.mes : ind.entradaDecomp.acum).get(cat) || 0)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Saídas */}
      <Card className="bg-card/80">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saídas</div>
            <div className="flex gap-1">
              {(['mes', 'acum'] as const).map(t => (
                <button key={t} onClick={() => setSaidaTab(t)}
                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${saidaTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
                  {t === 'mes' ? 'Mês' : 'Acumulado'}
                </button>
              ))}
            </div>
          </div>
          {ind.categoriasSaida.map((cat: string) => (
            <div key={cat} className="flex justify-between text-xs">
              <span className={`text-muted-foreground ${(cat === 'Reposição de Bovinos' || cat === 'Dedução de Receitas') ? 'italic' : ''}`}>{cat}</span>
              <span className="font-mono font-bold">{formatMoeda((saidaTab === 'mes' ? ind.saidaDecomp.mes : ind.saidaDecomp.acum).get(cat) || 0)}</span>
            </div>
          ))}
          <div className="text-[8px] text-muted-foreground italic">* Reposição e Dedução não entram no desembolso produtivo</div>
        </CardContent>
      </Card>
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
  const isMobile = useIsMobile();
  const { fazendas } = useFazenda();

  const fazendaIdsReais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__').map(f => f.id),
    [fazendas],
  );

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

  const periodoAlvo = useMemo(
    () => mesFiltro !== 'todos' ? `${anoFiltro}-${mesFiltro}` : anoFiltro,
    [anoFiltro, mesFiltro],
  );

  // =========================================================================
  // ZOOTÉCNICO — FONTE ÚNICA
  // =========================================================================
  const mesNum = mesFiltro !== 'todos' ? Number(mesFiltro) : new Date().getMonth() + 1;

  const zoo = useIndicadoresZootecnicos(
    fazendaId, Number(anoFiltro), mesNum,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  const arrobasGlobal = useArrobasGlobal(
    isGlobal, lancamentosPecuarios, saldosIniciais, categorias,
    Number(anoFiltro), mesNum, fazendaIdsReais,
  );

  const zooData = useMemo(() => {
    const anoNum = Number(anoFiltro);
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === anoNum)
      .reduce((sum, s) => sum + s.quantidade, 0);

    const saldoAnterior = zoo.gmdAberturaMes.estoqueInicialDetalhe.reduce((s, d) => s + d.cabecas, 0);
    const saldoFinalMes = zoo.saldoFinalMes;
    const cabMediaMes = (saldoAnterior > 0 || saldoFinalMes > 0) ? (saldoAnterior + saldoFinalMes) / 2 : null;

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

    const cabMediaAcum = rebanhosMensais.length > 0
      ? rebanhosMensais.reduce((s, rm) => s + rm.media, 0) / rebanhosMensais.length
      : null;

    const arrobasProduzidasAcum = isGlobal
      ? arrobasGlobal.somaArrobas
      : zoo.arrobasProduzidasAcumulado;

    return {
      cabMediaMes, cabMediaAcum, rebanhosMensais, arrobasProduzidasAcum,
      saldoAnterior, saldoFinalMes, saldoInicialAno,
      arrobasProduzidasMes: zoo.arrobasProduzidasMes,
      gmdAcumulado: zoo.gmdAcumulado,
    };
  }, [zoo, saldosIniciais, anoFiltro, mesFiltro, lancamentosPecuarios, isGlobal, arrobasGlobal.somaArrobas]);

  // =========================================================================
  // FINANCEIRO — filtros
  // =========================================================================

  const todosNoPeriodo = useMemo(() =>
    lancamentos.filter(l => {
      const am = datePagtoAnoMes(l);
      return am && am.startsWith(periodoAlvo);
    }), [lancamentos, periodoAlvo]);

  const filtrados = useMemo(() => todosNoPeriodo.filter(isConciliado), [todosNoPeriodo]);
  const entradasList = useMemo(() => filtrados.filter(isEntrada), [filtrados]);
  const saidasList = useMemo(() => filtrados.filter(isSaida), [filtrados]);

  // Rateio filtrado
  const rateioFiltrado = useMemo(() => rateioADM.filter(r => r.anoMes.startsWith(periodoAlvo)), [rateioADM, periodoAlvo]);
  const totalRateioFiltrado = useMemo(() => rateioFiltrado.reduce((s, r) => s + r.valorRateado, 0), [rateioFiltrado]);

  // Status audit
  const auditStatus = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const l of todosNoPeriodo) {
      const status = (l.status_transacao || '(vazio)').trim();
      const entry = map.get(status) || { count: 0, total: 0 };
      entry.count++;
      entry.total += Math.abs(l.valor);
      map.set(status, entry);
    }
    return Array.from(map.entries()).map(([status, v]) => ({ status, ...v })).sort((a, b) => b.total - a.total);
  }, [todosNoPeriodo]);

  // =========================================================================
  // INDICADORES CALCULADOS
  // =========================================================================

  const ind = useMemo(() => {
    const totalEntradas = entradasList.reduce((s, l) => s + Math.abs(l.valor), 0);
    const totalSaidas = saidasList.reduce((s, l) => s + Math.abs(l.valor), 0);
    const saidasComRateio = totalSaidas + totalRateioFiltrado;

    // --- Desembolso produtivo mês ---
    const desembolsoProdMesProprio = filtrados
      .filter(l => isDesembolsoProdutivo(l))
      .reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembolsoProdMes = desembolsoProdMesProprio + totalRateioFiltrado;

    // --- Desembolso produtivo acumulado ---
    const mesLimite = mesFiltro !== 'todos' ? Number(mesFiltro) : 12;
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

    const numMeses = mesFiltro !== 'todos' ? Number(mesFiltro) : 12;
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

    // --- Decomposição entradas ---
    const classifyEntrada = (l: FinanceiroLancamento) => {
      const macro = normMacro(l);
      const escopo = normEscopo(l);
      if (macro === 'receitas' && escopo === 'pecuaria') return 'Receitas Pecuárias';
      if (macro === 'receitas' && escopo === 'agricultura') return 'Receitas Agrícolas';
      if (macro === 'receitas') return 'Outras Receitas';
      return 'Outras Receitas';
    };

    const entradaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    const categoriasEntrada = ['Receitas Pecuárias', 'Receitas Agrícolas', 'Outras Receitas'];
    for (const cat of categoriasEntrada) { entradaDecomp.mes.set(cat, 0); entradaDecomp.acum.set(cat, 0); }

    for (const l of entradasList) {
      const cat = classifyEntrada(l);
      entradaDecomp.mes.set(cat, (entradaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }

    lancamentos.filter(l => {
      if (!isConciliado(l) || !isEntrada(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cat = classifyEntrada(l);
      entradaDecomp.acum.set(cat, (entradaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // --- Decomposição saídas ---
    const classifySaida = (l: FinanceiroLancamento) => {
      const macro = normMacro(l);
      const escopo = normEscopo(l);
      if (macro === 'custeio produtivo' && escopo === 'pecuaria') return 'Custeio Pecuário';
      if (macro === 'custeio produtivo' && escopo === 'agricultura') return 'Custeio Agrícola';
      if (macro === 'custeio produtivo') return 'Custeio Pecuário'; // default
      if (macro === 'investimento na fazenda' && escopo === 'pecuaria') return 'Investimento Pecuário';
      if (macro === 'investimento na fazenda' && escopo === 'agricultura') return 'Investimento Agrícola';
      if (macro === 'investimento na fazenda') return 'Investimento Pecuário';
      if (macro === 'investimento em bovinos') return 'Reposição de Bovinos';
      if (macro.includes('dedu') && macro.includes('receita')) return 'Dedução de Receitas';
      return 'Outros';
    };

    const categoriasSaida = ['Custeio Pecuário', 'Investimento Pecuário', 'Custeio Agrícola', 'Investimento Agrícola', 'Reposição de Bovinos', 'Dedução de Receitas'];
    const saidaDecomp = { mes: new Map<string, number>(), acum: new Map<string, number>() };
    for (const cat of categoriasSaida) { saidaDecomp.mes.set(cat, 0); saidaDecomp.acum.set(cat, 0); }

    for (const l of saidasList) {
      const cat = classifySaida(l);
      if (categoriasSaida.includes(cat)) saidaDecomp.mes.set(cat, (saidaDecomp.mes.get(cat) || 0) + Math.abs(l.valor));
    }

    lancamentos.filter(l => {
      if (!isConciliado(l) || !isSaida(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cat = classifySaida(l);
      if (categoriasSaida.includes(cat)) saidaDecomp.acum.set(cat, (saidaDecomp.acum.get(cat) || 0) + Math.abs(l.valor));
    });

    // --- Receitas Pecuárias por Competência ---
    const tiposReceitaComp = ['abate', 'venda', 'consumo'];
    const recPecCompetenciaMes = lancamentosPecuarios
      .filter(l => {
        if (!tiposReceitaComp.includes(l.tipo)) return false;
        const lAno = Number(l.data.substring(0, 4));
        const lMes = Number(l.data.substring(5, 7));
        if (mesFiltro === 'todos') return lAno === Number(anoFiltro);
        return lAno === Number(anoFiltro) && lMes === Number(mesFiltro);
      })
      .reduce((s, l) => s + calcValorTotal(l), 0);

    const recPecCompetenciaAcum = lancamentosPecuarios
      .filter(l => {
        if (!tiposReceitaComp.includes(l.tipo)) return false;
        const lAno = Number(l.data.substring(0, 4));
        const lMes = Number(l.data.substring(5, 7));
        return lAno === Number(anoFiltro) && lMes <= mesLimite;
      })
      .reduce((s, l) => s + calcValorTotal(l), 0);

    // --- Receitas Pecuárias por Caixa ---
    const recPecCaixaMes = entradasList
      .filter(l => normMacro(l) === 'receitas' && (normEscopo(l) === 'pecuaria' || !l.escopo_negocio))
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    const recPecCaixaAcum = lancamentos
      .filter(l => {
        if (!isConciliado(l) || !isEntrada(l)) return false;
        if (normMacro(l) !== 'receitas') return false;
        if (normEscopo(l) !== 'pecuaria' && l.escopo_negocio) return false;
        const am = datePagtoAnoMes(l);
        if (!am || !am.startsWith(anoFiltro)) return false;
        return Number(am.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + Math.abs(l.valor), 0);

    // --- Centro de custo (mês e acumulado) ---
    const ccMesMap = new Map<string, number>();
    const ccAcumMap = new Map<string, number>();

    for (const l of saidasList) {
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
    if (!isGlobal && totalRateioFiltrado > 0) {
      ccMesMap.set('Rateio ADM', totalRateioFiltrado);
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
      rateioMes: totalRateioFiltrado,
    };
  }, [entradasList, saidasList, filtrados, lancamentos, anoFiltro, mesFiltro, zooData, totalRateioFiltrado, rateioADM, lancamentosPecuarios, isGlobal]);

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

  const mesLimite = mesFiltro !== 'todos' ? Number(mesFiltro) : 12;

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

      <div className="text-[10px] text-muted-foreground bg-muted rounded-md px-2.5 py-1.5">
        Filtros: Status = Conciliado · Base = Data Pagamento · Entradas = 1-* · Saídas = 2-*
      </div>

      {/* ================================================================= */}
      {/* 1. CARDS PRINCIPAIS — Entradas e Saídas */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* ENTRADAS */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3 text-green-600" /> Entradas
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.totalEntradas)}</p>
              <span className="text-[10px] text-muted-foreground">por mês</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{entradasList.length} lançamentos</p>
            <p className="text-[10px] mt-1.5 pt-1.5 border-t border-border/50">
              <span className="text-muted-foreground">acumulado: </span>
              <span className="font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.entradasAcum)}</span>
            </p>
          </CardContent>
        </Card>

        {/* SAÍDAS */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3 w-3 text-red-600" /> Saídas
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.saidasComRateio)}</p>
              <span className="text-[10px] text-muted-foreground">por mês</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
              <p>próprio: {formatMoeda(ind.totalSaidas)} ({saidasList.length} lanç.)</p>
              {!isGlobal && ind.rateioMes > 0 && (
                <p className="text-amber-600 dark:text-amber-400">rateio ADM: {formatMoeda(ind.rateioMes)}</p>
              )}
            </div>
            <p className="text-[10px] mt-1.5 pt-1.5 border-t border-border/50">
              <span className="text-muted-foreground">acumulado: </span>
              <span className="font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.saidasAcum + (isGlobal ? 0 : ind.rateioAcumVal))}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 2. CARDS MENORES — Decomposição */}
      {/* ================================================================= */}
      {/* Mobile: tabbed detail blocks; Desktop: 2x2 grid */}
      {isMobile ? (
        <MobileDetalheEntradaSaida ind={ind} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {/* Entradas no mês */}
          <Card className="bg-card/80">
            <CardContent className="p-2.5 space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Entradas no mês</div>
              {ind.categoriasEntrada.map(cat => (
                <div key={cat} className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground truncate mr-2">{cat}</span>
                  <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(ind.entradaDecomp.mes.get(cat) || 0)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Saídas no mês */}
          <Card className="bg-card/80">
            <CardContent className="p-2.5 space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saídas no mês</div>
              {ind.categoriasSaida.map(cat => (
                <div key={cat} className="flex justify-between text-[10px]">
                  <span className={`text-muted-foreground truncate mr-2 ${(cat === 'Reposição de Bovinos' || cat === 'Dedução de Receitas') ? 'italic' : ''}`}>{cat}</span>
                  <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(ind.saidaDecomp.mes.get(cat) || 0)}</span>
                </div>
              ))}
              {(ind.categoriasSaida.includes('Reposição de Bovinos') || ind.categoriasSaida.includes('Dedução de Receitas')) && (
                <div className="text-[8px] text-muted-foreground italic">* não entram no desembolso produtivo</div>
              )}
            </CardContent>
          </Card>

          {/* Entradas acumulado */}
          <Card className="bg-card/80">
            <CardContent className="p-2.5 space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Entradas acumulado</div>
              {ind.categoriasEntrada.map(cat => (
                <div key={cat} className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground truncate mr-2">{cat}</span>
                  <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(ind.entradaDecomp.acum.get(cat) || 0)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Saídas acumulado */}
          <Card className="bg-card/80">
            <CardContent className="p-2.5 space-y-1">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saídas acumulado</div>
              {ind.categoriasSaida.map(cat => (
                <div key={cat} className="flex justify-between text-[10px]">
                  <span className={`text-muted-foreground truncate mr-2 ${(cat === 'Reposição de Bovinos' || cat === 'Dedução de Receitas') ? 'italic' : ''}`}>{cat}</span>
                  <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(ind.saidaDecomp.acum.get(cat) || 0)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. INDICADORES ECONÔMICOS — 2 colunas */}
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
              ano={Number(anoFiltro)}
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
              {/* Desembolso Produtivo acumulado — MESMO destaque que mês */}
              <div className="text-[10px] text-muted-foreground">Desembolso Prod. acumulado</div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.desembolsoAcum)}</p>
            </div>

            {/* Média mensal — destaque (logo após acumulado) */}
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

            {/* Custo/@ produzida — DESTAQUE MAIOR */}
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
              mesFiltro={mesFiltro}
              isGlobal={isGlobal}
            />
          </CardContent>
        </Card>
      </div>

      {/* ================================================================= */}
      {/* 5. GRÁFICO — Jan → Dez fixo */}
      {/* ================================================================= */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Entradas vs Saídas — {anoFiltro}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatMoeda(v)} />
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
      {/* 6. QUADRO CENTRO DE CUSTO — 2 colunas */}
      {/* ================================================================= */}
      {(ind.ccMes.length > 0 || ind.ccAcum.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <CentroCustoTable
            title="Desembolso por Centro — Mês"
            items={ind.ccMes}
            cabMedia={zooData.cabMediaMes}
          />
          <CentroCustoTable
            title="Média Mensal por Centro"
            items={ind.ccAcum}
            cabMedia={zooData.cabMediaAcum}
            numMeses={ind.numMeses}
            isMedia
          />
        </div>
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
                    Total no período: {todosNoPeriodo.length} · Usados (Conciliado): {filtrados.length}
                  </div>
                </CardContent>
              </Card>

              <AuditTable title="Entradas próprias (1-*)" lancamentos={entradasList} totalLabel="Total entradas" />
              <AuditTable title="Saídas próprias (2-*)" lancamentos={saidasList} totalLabel="Total saídas" />

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

// ---------------------------------------------------------------------------
// Sub: Centro de Custo Table
// ---------------------------------------------------------------------------

function CentroCustoTable({
  title,
  items,
  cabMedia,
  numMeses,
  isMedia,
}: {
  title: string;
  items: { nome: string; valor: number }[];
  cabMedia: number | null;
  numMeses?: number;
  isMedia?: boolean;
}) {
  const divisor = isMedia && numMeses && numMeses > 0 ? numMeses : 1;
  const displayItems = items.map(i => ({ ...i, valor: i.valor / divisor }));
  const total = displayItems.reduce((s, i) => s + i.valor, 0);

  return (
    <Card>
      <CardContent className="p-2">
        <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
          <BarChart3 className="h-3 w-3 inline mr-1" />{title}
        </div>
        <div className="space-y-px">
          {/* Total line */}
          <div className="flex items-center justify-between text-[9px] font-bold border-b pb-0.5 mb-0.5">
            <span>TOTAL</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono">{formatMoeda(total)}</span>
              <span className="text-muted-foreground w-8 text-right">100%</span>
              {cabMedia && cabMedia > 0 && (
                <span className="text-muted-foreground font-mono w-14 text-right text-[8px]">{formatMoeda(total / cabMedia)}/cab</span>
              )}
            </div>
          </div>
          {/* Items */}
          {displayItems.map(item => {
            const pct = total > 0 ? (item.valor / total) * 100 : 0;
            const isRateio = item.nome === 'Rateio ADM';
            return (
              <div key={item.nome} className={`flex items-center justify-between text-[9px] py-px ${isRateio ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                <span className="truncate mr-1.5 max-w-[90px]">{item.nome}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(item.valor)}</span>
                  <span className="text-muted-foreground w-8 text-right">{formatNum(pct, 1)}%</span>
                  {cabMedia && cabMedia > 0 && (
                    <span className="text-muted-foreground font-mono w-14 text-right text-[8px]">{formatMoeda(item.valor / cabMedia)}/cab</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
