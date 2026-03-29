/**
 * Dashboard financeiro — 4 cards com drill-down em telas internas.
 *
 * Cards: Receitas Pecuária | Receitas Agricultura | Desembolso Pecuária | Desembolso Agricultura
 * Cada card abre uma tela de detalhe com botão de voltar.
 */
import { useMemo, useState } from 'react';
import { calcSaldoPorCategoriaLegado } from '@/lib/calculos/zootecnicos';
import { calcValorTotal, calcArrobasSafe } from '@/lib/calculos/economicos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TrendingDown, TrendingUp, Building2, AlertTriangle,
  ChevronDown, ChevronUp, ArrowLeft, BarChart3,
} from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_NOMES } from '@/lib/calculos/labels';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
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
  getEscopo,
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

const isConciliado = (l: FinanceiroLancamento) => isConciliadoCentral(l);
const isEntrada = (l: FinanceiroLancamento) => isEntradaCentral(l);
const isSaida = (l: FinanceiroLancamento) => isSaidaCentral(l);
const datePagtoAnoMes = (l: FinanceiroLancamento) => datePagtoAnoMesCentral(l);
const isDesembolsoProdutivo = (l: FinanceiroLancamento) => isDesembolsoProdutivoCentral(l);

// ---------------------------------------------------------------------------
// Props & Types
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
  ano: number;
  mesAte: number;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

interface RebanhoMedioMensal {
  mes: number;
  saldoInicio: number;
  saldoFim: number;
  media: number;
}

type DetailView = null | 'receitaPec' | 'receitaAgri' | 'desembPec' | 'desembAgri';

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
// Sub: Auditoria Receita Competência e Caixa
// ---------------------------------------------------------------------------

function AuditReceitaCompetenciaCaixa({
  lancPecuarios,
  lancamentosFinanceiros,
  ano,
  mesLimite,
  tipo,
}: {
  lancPecuarios: Lancamento[];
  lancamentosFinanceiros: FinanceiroLancamento[];
  ano: number;
  mesLimite: number;
  tipo: 'pec' | 'agri';
}) {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState<'competencia' | 'caixa'>('competencia');

  const dadosCompetencia = useMemo(() => {
    if (tipo === 'pec') {
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
      return { filtrados: filtrados.length, totalCabecas, totalArrobas, totalValor };
    }
    // Agricultura: competência by data_realizacao
    const catAlvo = 'Receitas Agricultura';
    const filtrados = lancamentosFinanceiros.filter(l => {
      if (!isConciliado(l) || !isEntrada(l)) return false;
      if (classificarEntradaCentral(l) !== catAlvo) return false;
      const dr = l.data_realizacao;
      if (!dr || dr.length < 7) return false;
      const lAno = Number(dr.substring(0, 4));
      const lMes = Number(dr.substring(5, 7));
      return lAno === ano && lMes <= mesLimite;
    });
    const totalValor = filtrados.reduce((s, l) => s + Math.abs(l.valor), 0);
    return { filtrados: filtrados.length, totalCabecas: null, totalArrobas: null, totalValor };
  }, [lancPecuarios, lancamentosFinanceiros, ano, mesLimite, tipo]);

  const dadosCaixa = useMemo(() => {
    const catAlvo = tipo === 'pec' ? 'Receitas Pecuárias' : 'Receitas Agricultura';
    const filtrados = lancamentosFinanceiros.filter(l => {
      if (!isConciliado(l) || !isEntrada(l)) return false;
      if (classificarEntradaCentral(l) !== catAlvo) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(String(ano))) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    });
    const totalValor = filtrados.reduce((s, l) => s + Math.abs(l.valor), 0);
    return { filtrados: filtrados.length, totalValor };
  }, [lancamentosFinanceiros, ano, mesLimite, tipo]);

  return (
    <div className="border-t pt-2 mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground w-full">
        🔍 Auditoria Receita Competência e Caixa
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1">
            {(['competencia', 'caixa'] as const).map(t => (
              <button key={t} onClick={() => setFiltro(t)}
                className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${filtro === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-muted'}`}>
                {t === 'competencia' ? 'Competência' : 'Caixa'}
              </button>
            ))}
          </div>
          {filtro === 'competencia' ? (
            <div className="bg-muted/50 rounded-md p-2 space-y-1 text-[10px]">
              <div className="font-bold text-xs">
                {tipo === 'pec' ? 'Receitas Pecuárias' : 'Receitas Agricultura'} por Competência (jan→mês {mesLimite})
              </div>
              {tipo === 'pec' && dadosCompetencia.totalCabecas !== null && (
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div>
                    <span className="text-muted-foreground">Cabeças:</span>
                    <div className="font-mono font-bold">{formatNum(dadosCompetencia.totalCabecas, 0)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Arrobas:</span>
                    <div className="font-mono font-bold">{formatNum(dadosCompetencia.totalArrobas!, 1)} @</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor total:</span>
                    <div className="font-mono font-bold">{formatMoeda(dadosCompetencia.totalValor)}</div>
                  </div>
                </div>
              )}
              {tipo === 'agri' && (
                <div className="mt-1">
                  <span className="text-muted-foreground">Valor total:</span>
                  <div className="font-mono font-bold">{formatMoeda(dadosCompetencia.totalValor)}</div>
                </div>
              )}
              <div className="text-muted-foreground mt-1">{dadosCompetencia.filtrados} lançamentos</div>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-md p-2 space-y-1 text-[10px]">
              <div className="font-bold text-xs">
                {tipo === 'pec' ? 'Receitas Pecuárias' : 'Receitas Agricultura'} por Caixa (jan→mês {mesLimite})
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground">Valor total:</span>
                <div className="font-mono font-bold">{formatMoeda(dadosCaixa.totalValor)}</div>
              </div>
              <div className="text-muted-foreground mt-1">{dadosCaixa.filtrados} lançamentos</div>
            </div>
          )}
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
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            <div className="font-bold text-xs">Desembolso Produtivo — Mês</div>
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
// Sub: Centro de Custo detail (inside desembolso detail views)
// ---------------------------------------------------------------------------

function CentroCustoDetalhe({
  ccMes,
  ccAcum,
  numMeses,
  cabMedia,
  unidadeSecundaria,
}: {
  ccMes: { nome: string; valor: number }[];
  ccAcum: { nome: string; valor: number }[];
  numMeses: number;
  cabMedia: number | null;
  unidadeSecundaria: string; // "R$/cab" or "R$/sacas"
}) {
  const [tab, setTab] = useState<'mes' | 'acum'>('mes');
  const items = tab === 'mes' ? ccMes : ccAcum;
  const divisor = tab === 'acum' && numMeses > 0 ? numMeses : 1;
  const displayItems = items.map(i => ({ ...i, valor: i.valor / divisor }));
  const total = displayItems.reduce((s, i) => s + i.valor, 0);

  if (items.length === 0) return null;

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
        <div className="flex items-center justify-between text-[10px] font-bold border-b pb-1 mb-1">
          <span className="text-red-600 dark:text-red-400">TOTAL</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-red-600 dark:text-red-400">{formatMoeda(total)}</span>
            <span className="text-muted-foreground">100%</span>
            {cabMedia && cabMedia > 0 && (
              <span className="text-muted-foreground font-mono text-[9px]">{formatMoeda(total / cabMedia)}/{unidadeSecundaria === 'R$/cab' ? 'cab' : 'sacas'}</span>
            )}
          </div>
        </div>
        {displayItems.map((item) => {
          const pct = total > 0 ? (item.valor / total) * 100 : 0;
          const isRateio = item.nome === 'Rateio ADM';
          return (
            <div key={item.nome} className={`flex items-center justify-between text-[10px] py-0.5 ${isRateio ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              <span className="truncate max-w-[40%] mr-1.5">{item.nome}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold whitespace-nowrap">{formatMoeda(item.valor)}</span>
                <span className="text-muted-foreground w-9 text-right">{formatNum(pct, 1)}%</span>
                {cabMedia && cabMedia > 0 && (
                  <span className="text-muted-foreground font-mono text-[9px] w-16 text-right">{formatMoeda(item.valor / cabMedia)}/{unidadeSecundaria === 'R$/cab' ? 'cab' : 'sacas'}</span>
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
  const [detailView, setDetailView] = useState<DetailView>(null);
  const { fazendas } = useFazenda();

  const fazendaIdsReais = useMemo(
    () => fazendas.filter(f => f.id !== '__global__').map(f => f.id),
    [fazendas],
  );

  const anoFiltro = String(ano);
  const mesLimite = mesAte;
  const mesNum = mesAte;
  const periodoMes = `${anoFiltro}-${String(mesAte).padStart(2, '0')}`;

  // =========================================================================
  // ZOOTÉCNICO
  // =========================================================================

  const zoo = useIndicadoresZootecnicos(
    fazendaId, ano, mesNum,
    lancamentosPecuarios, saldosIniciais, pastos, categorias,
  );

  const arrobasGlobal = useArrobasGlobal(
    isGlobal, lancamentosPecuarios, saldosIniciais, categorias,
    ano, mesNum, fazendaIdsReais,
  );

  const zooData = useMemo(() => {
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === ano)
      .reduce((sum, s) => sum + s.quantidade, 0);

    const saldoAnterior = zoo.gmdAberturaMes.estoqueInicialDetalhe.reduce((s, d) => s + d.cabecas, 0);
    const saldoFinalMes = zoo.saldoFinalMes;
    const cabMediaMes = (saldoAnterior > 0 || saldoFinalMes > 0) ? (saldoAnterior + saldoFinalMes) / 2 : null;

    const rebanhosMensais: RebanhoMedioMensal[] = [];
    for (let m = 1; m <= mesLimite; m++) {
      const saldoInicioMes = m === 1
        ? saldoInicialAno
        : Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, ano, m - 1).values()).reduce((s, v) => s + v, 0);
      const saldoFimMes = Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentosPecuarios, ano, m).values()).reduce((s, v) => s + v, 0);
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
  }, [zoo, saldosIniciais, ano, mesLimite, lancamentosPecuarios, isGlobal, arrobasGlobal.somaArrobas]);

  // =========================================================================
  // FINANCEIRO
  // =========================================================================

  const filtradosMes = useMemo(() =>
    lancamentos.filter(l => {
      if (!isConciliado(l)) return false;
      return datePagtoAnoMes(l) === periodoMes;
    }), [lancamentos, periodoMes]);

  const todosNoPeriodoMes = useMemo(() =>
    lancamentos.filter(l => datePagtoAnoMes(l) === periodoMes), [lancamentos, periodoMes]);

  const entradasListMes = useMemo(() => filtradosMes.filter(isEntrada), [filtradosMes]);
  const saidasListMes = useMemo(() => filtradosMes.filter(isSaida), [filtradosMes]);

  const rateioFiltradoMes = useMemo(() => rateioADM.filter(r => r.anoMes === periodoMes), [rateioADM, periodoMes]);
  const totalRateioMes = useMemo(() => rateioFiltradoMes.reduce((s, r) => s + r.valorRateado, 0), [rateioFiltradoMes]);

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
  // INDICADORES
  // =========================================================================

  const ind = useMemo(() => {
    // --- Receitas Pecuárias ---
    const isReceitaPec = (l: FinanceiroLancamento) => classificarEntradaCentral(l) === 'Receitas Pecuárias';
    const isReceitaAgri = (l: FinanceiroLancamento) => classificarEntradaCentral(l) === 'Receitas Agricultura';

    // Receitas Pec Caixa
    const recPecCaixaMes = entradasListMes.filter(isReceitaPec).reduce((s, l) => s + Math.abs(l.valor), 0);
    const recPecCaixaAcum = lancamentos.filter(l => {
      if (!isConciliado(l) || !isEntrada(l) || !isReceitaPec(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Receitas Agri Caixa
    const recAgriCaixaMes = entradasListMes.filter(isReceitaAgri).reduce((s, l) => s + Math.abs(l.valor), 0);
    const recAgriCaixaAcum = lancamentos.filter(l => {
      if (!isConciliado(l) || !isEntrada(l) || !isReceitaAgri(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Receitas Pec Competência
    const tiposReceitaComp = ['abate', 'venda', 'consumo'];
    const recPecCompetenciaMes = lancamentosPecuarios
      .filter(l => {
        if (!tiposReceitaComp.includes(l.tipo)) return false;
        return Number(l.data.substring(0, 4)) === ano && Number(l.data.substring(5, 7)) === mesAte;
      })
      .reduce((s, l) => s + calcValorTotal(l), 0);
    const recPecCompetenciaAcum = lancamentosPecuarios
      .filter(l => {
        if (!tiposReceitaComp.includes(l.tipo)) return false;
        return Number(l.data.substring(0, 4)) === ano && Number(l.data.substring(5, 7)) <= mesLimite;
      })
      .reduce((s, l) => s + calcValorTotal(l), 0);

    // Receitas Agri Competência (by data_realizacao)
    const recAgriCompetenciaMes = lancamentos.filter(l => {
      if (!isConciliado(l) || !isEntrada(l) || !isReceitaAgri(l)) return false;
      const dr = l.data_realizacao;
      if (!dr || dr.length < 7) return false;
      return Number(dr.substring(0, 4)) === ano && Number(dr.substring(5, 7)) === mesAte;
    }).reduce((s, l) => s + Math.abs(l.valor), 0);
    const recAgriCompetenciaAcum = lancamentos.filter(l => {
      if (!isConciliado(l) || !isEntrada(l) || !isReceitaAgri(l)) return false;
      const dr = l.data_realizacao;
      if (!dr || dr.length < 7) return false;
      return Number(dr.substring(0, 4)) === ano && Number(dr.substring(5, 7)) <= mesLimite;
    }).reduce((s, l) => s + Math.abs(l.valor), 0);

    // --- Desembolso Produtivo split by escopo ---
    const desembPecMesProprio = filtradosMes.filter(l => isDesembolsoProdutivo(l) && getEscopo(l) !== 'agri').reduce((s, l) => s + Math.abs(l.valor), 0);
    const desembAgriMesProprio = filtradosMes.filter(l => isDesembolsoProdutivo(l) && getEscopo(l) === 'agri').reduce((s, l) => s + Math.abs(l.valor), 0);

    const desembPecAcumProprio = lancamentos.filter(l => {
      if (!isConciliado(l) || !isDesembolsoProdutivo(l) || getEscopo(l) === 'agri') return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).reduce((s, l) => s + Math.abs(l.valor), 0);

    const desembAgriAcumProprio = lancamentos.filter(l => {
      if (!isConciliado(l) || !isDesembolsoProdutivo(l) || getEscopo(l) !== 'agri') return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).reduce((s, l) => s + Math.abs(l.valor), 0);

    // Rateio (applies to Pecuária by default since it's the main activity)
    const rateioAcumVal = rateioADM
      .filter(r => r.anoMes.startsWith(anoFiltro) && Number(r.anoMes.substring(5, 7)) <= mesLimite)
      .reduce((s, r) => s + r.valorRateado, 0);

    const desembPecMes = desembPecMesProprio + totalRateioMes;
    const desembPecAcum = desembPecAcumProprio + rateioAcumVal;
    const desembAgriMes = desembAgriMesProprio;
    const desembAgriAcum = desembAgriAcumProprio;

    // Total desembolso (for backward compat)
    const desembolsoAcum = desembPecAcum + desembAgriAcum;

    const numMeses = mesLimite;
    const mediaMensalPec = numMeses > 0 ? desembPecAcum / numMeses : 0;
    const mediaMensalAgri = numMeses > 0 ? desembAgriAcum / numMeses : 0;

    // --- Indicadores econômicos (Pecuária) ---
    const custoCabMes = zooData.cabMediaMes && zooData.cabMediaMes > 0
      ? desembPecMes / zooData.cabMediaMes : null;
    const custoCabAcum = zooData.cabMediaAcum && zooData.cabMediaAcum > 0 && numMeses > 0
      ? mediaMensalPec / zooData.cabMediaAcum : null;
    const custoArrobaProd = zooData.arrobasProduzidasAcum && zooData.arrobasProduzidasAcum > 0
      ? desembPecAcum / zooData.arrobasProduzidasAcum : null;

    // --- Centro de custo split by escopo ---
    const ccPecMesMap = new Map<string, number>();
    const ccPecAcumMap = new Map<string, number>();
    const ccAgriMesMap = new Map<string, number>();
    const ccAgriAcumMap = new Map<string, number>();

    for (const l of saidasListMes) {
      if (!isDesembolsoProdutivo(l)) continue;
      const cc = (l.centro_custo || 'Não classificado').trim();
      const escopo = getEscopo(l);
      if (escopo === 'agri') {
        ccAgriMesMap.set(cc, (ccAgriMesMap.get(cc) || 0) + Math.abs(l.valor));
      } else {
        ccPecMesMap.set(cc, (ccPecMesMap.get(cc) || 0) + Math.abs(l.valor));
      }
    }

    lancamentos.filter(l => {
      if (!isConciliado(l) || !isSaida(l) || !isDesembolsoProdutivo(l)) return false;
      const am = datePagtoAnoMes(l);
      if (!am || !am.startsWith(anoFiltro)) return false;
      return Number(am.substring(5, 7)) <= mesLimite;
    }).forEach(l => {
      const cc = (l.centro_custo || 'Não classificado').trim();
      const escopo = getEscopo(l);
      if (escopo === 'agri') {
        ccAgriAcumMap.set(cc, (ccAgriAcumMap.get(cc) || 0) + Math.abs(l.valor));
      } else {
        ccPecAcumMap.set(cc, (ccPecAcumMap.get(cc) || 0) + Math.abs(l.valor));
      }
    });

    // Rateio ADM into Pec centro de custo
    if (!isGlobal && totalRateioMes > 0) ccPecMesMap.set('Rateio ADM', totalRateioMes);
    if (!isGlobal && rateioAcumVal > 0) ccPecAcumMap.set('Rateio ADM', rateioAcumVal);

    const sortCC = (m: Map<string, number>) =>
      Array.from(m.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);

    return {
      recPecCompetenciaMes, recPecCompetenciaAcum,
      recPecCaixaMes, recPecCaixaAcum,
      recAgriCompetenciaMes, recAgriCompetenciaAcum,
      recAgriCaixaMes, recAgriCaixaAcum,
      desembPecMes, desembPecMesProprio, desembPecAcum, desembPecAcumProprio,
      desembAgriMes, desembAgriMesProprio, desembAgriAcum, desembAgriAcumProprio,
      rateioMes: totalRateioMes, rateioAcumVal,
      numMeses,
      mediaMensalPec, mediaMensalAgri,
      custoCabMes, custoCabAcum, custoArrobaProd,
      ccPecMes: sortCC(ccPecMesMap), ccPecAcum: sortCC(ccPecAcumMap),
      ccAgriMes: sortCC(ccAgriMesMap), ccAgriAcum: sortCC(ccAgriAcumMap),
      desembolsoAcum,
    };
  }, [entradasListMes, saidasListMes, filtradosMes, lancamentos, anoFiltro, mesLimite, zooData, totalRateioMes, rateioADM, lancamentosPecuarios, isGlobal, ano, mesAte]);

  // =========================================================================
  // GRÁFICO
  // =========================================================================
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { entradas: number; saidas: number }>();
    for (let m = 1; m <= 12; m++) monthMap.set(String(m).padStart(2, '0'), { entradas: 0, saidas: 0 });
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
        return { mes: MESES_NOMES[Number(mes) - 1] || mes, Entradas: v.entradas, Saídas: v.saidas, 'Saldo Acum.': saldoAcum };
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

  // =========================================================================
  // DETAIL VIEW: Receitas
  // =========================================================================
  if (detailView === 'receitaPec' || detailView === 'receitaAgri') {
    const isPec = detailView === 'receitaPec';
    const titulo = isPec ? 'Receitas Pecuárias' : 'Receitas Agricultura';
    const compMes = isPec ? ind.recPecCompetenciaMes : ind.recAgriCompetenciaMes;
    const compAcum = isPec ? ind.recPecCompetenciaAcum : ind.recAgriCompetenciaAcum;
    const caixaMes = isPec ? ind.recPecCaixaMes : ind.recAgriCaixaMes;
    const caixaAcum = isPec ? ind.recPecCaixaAcum : ind.recAgriCaixaAcum;

    return (
      <div className="space-y-4">
        <button
          onClick={() => setDetailView(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Dashboard
        </button>

        <div className="text-sm font-bold">{titulo}</div>

        <Card>
          <CardContent className="p-3 space-y-3">
            {/* Por Competência */}
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">por Competência</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-green-700 dark:text-green-400">{formatMoeda(compMes)}</span>
                <span className="text-[9px] text-muted-foreground">mês</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-foreground">{formatMoeda(compAcum)}</span>
                <span className="text-[9px] text-muted-foreground">acumulado</span>
              </div>
            </div>

            {/* Por Caixa */}
            <div className="border-t pt-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">por Caixa</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-green-700 dark:text-green-400">{formatMoeda(caixaMes)}</span>
                <span className="text-[9px] text-muted-foreground">mês</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-foreground">{formatMoeda(caixaAcum)}</span>
                <span className="text-[9px] text-muted-foreground">acumulado</span>
              </div>
            </div>

            {/* Auditoria */}
            <AuditReceitaCompetenciaCaixa
              lancPecuarios={lancamentosPecuarios}
              lancamentosFinanceiros={lancamentos}
              ano={ano}
              mesLimite={mesLimite}
              tipo={isPec ? 'pec' : 'agri'}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // DETAIL VIEW: Desembolso
  // =========================================================================
  if (detailView === 'desembPec' || detailView === 'desembAgri') {
    const isPec = detailView === 'desembPec';
    const titulo = isPec ? 'Desembolso Pecuária' : 'Desembolso Agricultura';
    const desembMes = isPec ? ind.desembPecMes : ind.desembAgriMes;
    const desembMesProprio = isPec ? ind.desembPecMesProprio : ind.desembAgriMesProprio;
    const desembAcum = isPec ? ind.desembPecAcum : ind.desembAgriAcum;
    const mediaMensal = isPec ? ind.mediaMensalPec : ind.mediaMensalAgri;
    const ccMes = isPec ? ind.ccPecMes : ind.ccAgriMes;
    const ccAcum = isPec ? ind.ccPecAcum : ind.ccAgriAcum;

    return (
      <div className="space-y-4">
        <button
          onClick={() => setDetailView(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para Dashboard
        </button>

        <div className="text-sm font-bold">{titulo}</div>

        <Card>
          <CardContent className="p-3 space-y-3">
            {/* Desembolso acumulado */}
            <div>
              <div className="text-[10px] text-muted-foreground">Desembolso Prod. acumulado</div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMoeda(desembAcum)}</p>
            </div>

            {/* Desembolso mês */}
            <div>
              <div className="text-[10px] text-muted-foreground">Desembolso Prod. mês</div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatMoeda(desembMes)}</p>
            </div>

            {isPec && (
              <>
                {/* Custo/cab mês */}
                <div>
                  <div className="text-[10px] text-muted-foreground">Custo/cab mês</div>
                  <p className="text-sm font-bold">{ind.custoCabMes !== null ? formatMoeda(ind.custoCabMes) : '—'}</p>
                  {zooData.cabMediaMes !== null && (
                    <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaMes, 0)} cab méd.</p>
                  )}
                </div>

                {/* Média mensal (DESTACADO) */}
                <div className="bg-muted/60 rounded-md p-2">
                  <div className="text-[10px] text-muted-foreground">Média mensal</div>
                  <p className="text-base font-extrabold text-red-600 dark:text-red-400">{formatMoeda(mediaMensal)}</p>
                </div>

                {/* Custo/cab acumulado */}
                <div>
                  <div className="text-[10px] text-muted-foreground">Custo/cab acumulado</div>
                  <p className="text-sm font-bold">{ind.custoCabAcum !== null ? formatMoeda(ind.custoCabAcum) : '—'}</p>
                  {zooData.cabMediaAcum !== null && (
                    <p className="text-[9px] text-muted-foreground">{formatNum(zooData.cabMediaAcum, 0)} cab méd.</p>
                  )}
                </div>

                {/* Custo/@ produzida (DESTACADO) */}
                <div className="bg-muted/60 rounded-md p-2">
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

                {/* Auditoria */}
                <AuditDesembolsoProdutivo
                  desembolsoMes={desembMesProprio}
                  rateioMes={ind.rateioMes}
                  desembolsoAcum={desembAcum}
                  rateioAcum={ind.rateioAcumVal}
                  numMeses={ind.numMeses}
                  mediaMensal={mediaMensal}
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
              </>
            )}

            {!isPec && (
              <>
                {/* Média mensal (DESTACADO) */}
                <div className="bg-muted/60 rounded-md p-2">
                  <div className="text-[10px] text-muted-foreground">Média mensal</div>
                  <p className="text-base font-extrabold text-red-600 dark:text-red-400">{formatMoeda(mediaMensal)}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Centro de Custo */}
        <CentroCustoDetalhe
          ccMes={ccMes}
          ccAcum={ccAcum}
          numMeses={ind.numMeses}
          cabMedia={isPec ? zooData.cabMediaAcum : null}
          unidadeSecundaria={isPec ? 'R$/cab' : 'R$/sacas'}
        />
      </div>
    );
  }

  // =========================================================================
  // MAIN VIEW — 4 cards
  // =========================================================================
  return (
    <div className="space-y-4">
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
        Filtros: Status = Conciliado · Base = Data Pagamento · Entradas = 1-* · Saídas = 2-*
      </div>

      {/* 4 CARDS — 2x2 */}
      <div className="grid grid-cols-2 gap-2">
        {/* Receitas Pecuária */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailView('receitaPec')}>
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">
              <TrendingUp className="h-3 w-3" /> Receitas Pecuária
            </div>
            <p className="text-lg font-extrabold text-green-700 dark:text-green-400">{formatMoeda(ind.recPecCaixaAcum)}</p>
            <p className="text-[9px] text-muted-foreground">acumulado caixa</p>
            <p className="text-xs font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.recPecCaixaMes)}</p>
            <p className="text-[9px] text-muted-foreground">mês caixa</p>
          </CardContent>
        </Card>

        {/* Receitas Agricultura */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailView('receitaAgri')}>
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">
              <TrendingUp className="h-3 w-3" /> Receitas Agricultura
            </div>
            <p className="text-lg font-extrabold text-green-700 dark:text-green-400">{formatMoeda(ind.recAgriCaixaAcum)}</p>
            <p className="text-[9px] text-muted-foreground">acumulado caixa</p>
            <p className="text-xs font-bold text-green-700 dark:text-green-400">{formatMoeda(ind.recAgriCaixaMes)}</p>
            <p className="text-[9px] text-muted-foreground">mês caixa</p>
          </CardContent>
        </Card>

        {/* Desembolso Pecuária */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailView('desembPec')}>
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
              <TrendingDown className="h-3 w-3" /> Desembolso Pecuária
            </div>
            <p className="text-lg font-extrabold text-red-600 dark:text-red-400">{formatMoeda(ind.desembPecAcum)}</p>
            <p className="text-[9px] text-muted-foreground">acumulado</p>
            <p className="text-xs font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.desembPecMes)}</p>
            <p className="text-[9px] text-muted-foreground">mês</p>
          </CardContent>
        </Card>

        {/* Desembolso Agricultura */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailView('desembAgri')}>
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
              <TrendingDown className="h-3 w-3" /> Desembolso Agricultura
            </div>
            <p className="text-lg font-extrabold text-red-600 dark:text-red-400">{formatMoeda(ind.desembAgriAcum)}</p>
            <p className="text-[9px] text-muted-foreground">acumulado</p>
            <p className="text-xs font-bold text-red-600 dark:text-red-400">{formatMoeda(ind.desembAgriMes)}</p>
            <p className="text-[9px] text-muted-foreground">mês</p>
          </CardContent>
        </Card>
      </div>

      {/* GRÁFICO */}
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

      {/* AUDITORIA */}
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
                    Total no período: {todosNoPeriodoMes.length} · Usados (Conciliado): {filtradosMes.length}
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
                    <span className="font-bold text-green-700 dark:text-green-400">{formatMoeda(entradasListMes.reduce((s, l) => s + Math.abs(l.valor), 0))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Saídas próprias</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{formatMoeda(saidasListMes.reduce((s, l) => s + Math.abs(l.valor), 0))}</span>
                  </div>
                  {ind.rateioMes > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-amber-600 dark:text-amber-400">+ Rateio ADM</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{formatMoeda(ind.rateioMes)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1 mt-1 flex justify-between text-xs">
                    <span className="font-bold">Total saídas + rateio</span>
                    <span className="font-bold">{formatMoeda(saidasListMes.reduce((s, l) => s + Math.abs(l.valor), 0) + ind.rateioMes)}</span>
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
