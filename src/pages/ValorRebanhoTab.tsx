import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Save, Copy, Info, Lock, Unlock, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePastos } from '@/hooks/usePastos';
import { useValorRebanho, type SnapshotDetalheCategoria } from '@/hooks/useValorRebanho';
import { useValorRebanhoGlobal } from '@/hooks/useValorRebanhoGlobal';
import { usePrecoMercado } from '@/hooks/usePrecoMercado';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';
import { useRebanhoOficial, type ZootCategoriaMensal } from '@/hooks/useRebanhoOficial';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

type OrigemPeso = 'pastos' | 'lancamento' | 'saldo_inicial' | 'sem_base';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

interface LinhaTabelaValor {
  categoriaId: string;
  codigo: string;
  nome: string;
  saldo: number;
  pesoMedio: number;
  origemPeso: OrigemPeso;
  precoKg: number;
  valorCabeca: number;
  precoArroba: number;
  valorTotal: number;
  isSugerido: boolean;
}

interface HistoricoMes {
  valor: number;
  pesoKg: number;
}

interface MetricasExibicao {
  valor: number | null;
  cabecas: number | null;
  pesoTotalKg: number | null;
  pesoMedio: number | null;
  totalArrobas: number | null;
  precoArroba: number | null;
  valorCabeca: number | null;
  precoKg: number | null;
}

type FonteMes = 'live' | 'snapshot' | 'snapshot_incompleto';

const ORIGEM_LABEL: Record<OrigemPeso, string> = {
  pastos: 'Fechamento do mês',
  lancamento: 'Último lançamento',
  saldo_inicial: 'Saldo inicial do ano',
  sem_base: 'Sem dados',
};

const MAPA_PRECO_MERCADO: Record<string, { bloco: string; categoria: string; unidade: 'kg' | 'arroba' }> = {
  mamotes_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  desmama_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  garrotes: { bloco: 'magro_macho', categoria: 'Garrotes 350 kg média', unidade: 'kg' },
  bois: { bloco: 'frigorifico', categoria: 'Boi Gordo', unidade: 'arroba' },
  touros: { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
  mamotes_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  desmama_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  novilhas: { bloco: 'frigorifico', categoria: 'Novilha', unidade: 'arroba' },
  vacas: { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
};

const ORDEM_CATEGORIAS_FIXA = [
  'mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros',
  'mamotes_f', 'desmama_f', 'novilhas', 'vacas',
];

const MESES_SHORT = [
  { key: '01', label: 'Jan' }, { key: '02', label: 'Fev' }, { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' }, { key: '05', label: 'Mai' }, { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' }, { key: '08', label: 'Ago' }, { key: '09', label: 'Set' },
  { key: '10', label: 'Out' }, { key: '11', label: 'Nov' }, { key: '12', label: 'Dez' },
];

const CHART_LABELS = ['I', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function mapFonteToOrigem(fonte?: string): OrigemPeso {
  if (fonte === 'fechamento') return 'pastos';
  if (fonte === 'fallback_movimentacao') return 'lancamento';
  return 'sem_base';
}

interface ResumoOficialLike {
  rows: Array<{
    categoriaId: string;
    categoriaCodigo: string;
    categoriaNome: string;
    quantidadeFinal: number;
    pesoMedioFinalKg: number | null;
    origemPeso: OrigemPeso;
  }>;
}

function extractResumoFromView(
  viewData: ZootCategoriaMensal[] | undefined,
  mes: number,
): ResumoOficialLike {
  if (!viewData) return { rows: [] };
  const mesRows = viewData.filter(r => r.mes === mes);
  return {
    rows: mesRows.map(r => ({
      categoriaId: r.categoria_id,
      categoriaCodigo: r.categoria_codigo,
      categoriaNome: r.categoria_nome,
      quantidadeFinal: r.saldo_final,
      pesoMedioFinalKg: r.peso_medio_final,
      origemPeso: mapFonteToOrigem(r.fonte_oficial_mes),
    })),
  };
}

function calcVariacaoNullable(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function formatNumNullable(valor: number | null, casas: number) {
  return valor === null ? '—' : formatNum(valor, casas);
}

function formatMoedaNullable(valor: number | null) {
  return valor === null ? '—' : formatMoeda(valor);
}

function buildMetricsFromTotals(valor: number | null, cabecas: number | null, pesoTotalKg: number | null): MetricasExibicao {
  const pesoMedio = cabecas !== null && pesoTotalKg !== null
    ? (cabecas > 0 ? pesoTotalKg / cabecas : 0)
    : null;
  const totalArrobas = pesoTotalKg !== null ? pesoTotalKg / 30 : null;
  const precoArroba = valor !== null && totalArrobas !== null
    ? (totalArrobas > 0 ? valor / totalArrobas : 0)
    : null;
  const valorCabeca = valor !== null && cabecas !== null
    ? (cabecas > 0 ? valor / cabecas : 0)
    : null;
  const precoKg = valor !== null && pesoTotalKg !== null
    ? (pesoTotalKg > 0 ? valor / pesoTotalKg : 0)
    : null;

  return {
    valor,
    cabecas,
    pesoTotalKg,
    pesoMedio,
    totalArrobas,
    precoArroba,
    valorCabeca,
    precoKg,
  };
}

function aggregateMetricsFromTableRows(rows: LinhaTabelaValor[]): MetricasExibicao {
  if (rows.length === 0) return buildMetricsFromTotals(null, null, null);

  const cabecas = rows.reduce((sum, row) => sum + row.saldo, 0);
  const pesoTotalKg = rows.reduce((sum, row) => sum + (row.saldo * row.pesoMedio), 0);
  const valor = rows.reduce((sum, row) => sum + row.valorTotal, 0);

  return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
}

function aggregateMetricsFromSnapshotItems(items: SnapshotDetalheCategoria[]): MetricasExibicao | null {
  if (items.length === 0) return null;

  const cabecas = items.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
  const pesoTotalKg = items.reduce((sum, item) => {
    const quantidade = Number(item.quantidade) || 0;
    const pesoMedio = Number(item.peso_medio_kg) || 0;
    return sum + quantidade * pesoMedio;
  }, 0);
  const valor = items.reduce((sum, item) => sum + (Number(item.valor_total_categoria) || 0), 0);

  return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
}

function VariacaoBadge({ valor, label, showLabel }: { valor: number | null; label: string; showLabel?: boolean }) {
  if (valor === null) return null;
  const isPositive = valor > 0;
  const isNeutral = Math.abs(valor) < 0.1;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const color = isNeutral
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-destructive';

  const formattedVal = Math.abs(valor).toFixed(1).replace('.', ',');

  return (
    <span className={`inline-flex items-center gap-0.5 text-[8px] font-semibold tabular-nums ${color}`}>
      <Icon className="h-2.5 w-2.5" />
      {formattedVal}%
      {showLabel && <span className="font-normal text-muted-foreground ml-0.5">{label}</span>}
    </span>
  );
}

function MiniChart({ data, color, title }: { data: { label: string; value: number | null }[]; color: string; title: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 truncate">{title}</p>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={0} tickLine={false} axisLine={false} />
            <YAxis hide domain={['auto', 'auto']} />
            <RechartsTooltip
              contentStyle={{ fontSize: 10, padding: '2px 6px' }}
              labelStyle={{ fontSize: 9 }}
              formatter={(v: number) => [formatNum(v, 1), '']}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ValorRebanhoTab({ lancamentos, saldosIniciais, onBack, filtroAnoInicial, filtroMesInicial }: Props) {
  const { fazendaAtual, isGlobal, fazendas } = useFazenda();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

  // IDs de fazendas pecuárias (para Global)
  const fazendaIdsPecuaria = useMemo(
    () => fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false).map(f => f.id),
    [fazendas],
  );

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    anos.add(String(new Date().getFullYear()));
    lancamentos.forEach(l => { try { anos.add(l.data.substring(0, 4)); } catch {} });
    saldosIniciais.forEach(s => anos.add(String(s.ano)));
    return Array.from(anos).sort().reverse();
  }, [lancamentos, saldosIniciais]);

  const [anoFiltro, setAnoFiltro] = useState(filtroAnoInicial || String(new Date().getFullYear()));
  const mesAtual = filtroMesInicial ? String(filtroMesInicial).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
  const [mesFiltro, setMesFiltro] = useState(mesAtual);

  useEffect(() => {
    if (filtroAnoInicial) setAnoFiltro(filtroAnoInicial);
    if (filtroMesInicial) setMesFiltro(String(filtroMesInicial).padStart(2, '0'));
  }, [filtroAnoInicial, filtroMesInicial]);

  const anoMes = `${anoFiltro}-${mesFiltro}`;
  const isDezembro = mesFiltro === '12';

  // Regra temporal: mês atual, passado ou futuro
  const hoje = new Date();
  const mesAtualSistema = hoje.getMonth() + 1;
  const anoAtualSistema = hoje.getFullYear();
  const mesNumFiltro = Number(mesFiltro);
  const anoNumFiltro = Number(anoFiltro);
  const isMesFuturo = anoNumFiltro > anoAtualSistema || (anoNumFiltro === anoAtualSistema && mesNumFiltro > mesAtualSistema);
  const isMesAtual = anoNumFiltro === anoAtualSistema && mesNumFiltro === mesAtualSistema;

  const statusZoo = useStatusZootecnico(isGlobal ? undefined : fazendaId, Number(anoFiltro), Number(mesFiltro), lancamentos, saldosIniciais);
  const categoriasStatus = statusZoo.pendencias.find(p => p.id === 'categorias');
  const categoriasConciliadas = categoriasStatus?.status === 'fechado';
  const bloqueadoPorConciliacao = !categoriasConciliadas && !isGlobal && !statusZoo.loading;

  const {
    precos,
    saving,
    salvarPrecos,
    loadPrecosMesAnterior,
    isFechado,
    isAdmin,
    reabrirFechamento,
  } = useValorRebanho(anoMes);

  // Global hook — sempre chamado para manter ordem dos hooks
  const globalData = useValorRebanhoGlobal(
    isGlobal ? fazendaIdsPecuaria : [],
    lancamentos, saldosIniciais, categorias, anoFiltro, mesFiltro,
  );

  const { itens: precosMercado } = usePrecoMercado(anoMes);

  // Official source: view data (replaces useFechamentoCategoria)
  const { data: viewDataAnoAtual } = useZootCategoriaMensal({ ano: Number(anoFiltro), cenario: 'realizado' });
  const { data: viewDataAnoAnterior } = useZootCategoriaMensal({ ano: Number(anoFiltro) - 1, cenario: 'realizado' });

  const precosSugeridos = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(MAPA_PRECO_MERCADO).forEach(([codigo, ref]) => {
      const item = precosMercado.find(p => p.bloco === ref.bloco && p.categoria === ref.categoria);
      if (!item || item.valor <= 0) return;
      const valorComAgio = item.valor * (1 + (item.agio_perc || 0) / 100);
      map[codigo] = ref.unidade === 'arroba' ? valorComAgio / 30 : valorComAgio;
    });
    return map;
  }, [precosMercado]);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});

  const resumoOficial = useMemo(() => extractResumoFromView(viewDataAnoAtual, Number(mesFiltro)), [viewDataAnoAtual, mesFiltro]);

  const categoriasComSugestao = useMemo(() => {
    const set = new Set<string>();
    Object.keys(precosSugeridos).forEach(codigo => {
      const temPrecoSalvo = precos.some(p => p.categoria === codigo && p.preco_kg > 0);
      const precoAtual = precosLocal[codigo];
      const sugerido = precosSugeridos[codigo];
      if (!temPrecoSalvo && sugerido > 0 && precoAtual === sugerido) {
        set.add(codigo);
      }
    });
    return set;
  }, [precosSugeridos, precos, precosLocal]);

  const temSugestao = categoriasComSugestao.size > 0;

  const allRows = useMemo<LinhaTabelaValor[]>(() => {
    return resumoOficial.rows.map(row => {
      const precoKg = precosLocal[row.categoriaCodigo] ?? 0;
      const valorTotal = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      const valorCabeca = row.quantidadeFinal > 0 && row.pesoMedioFinalKg && precoKg > 0
        ? row.pesoMedioFinalKg * precoKg
        : 0;
      const arrobasLinha = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
      const precoArroba = arrobasLinha > 0 ? valorTotal / arrobasLinha : 0;

      return {
        categoriaId: row.categoriaId,
        codigo: row.categoriaCodigo,
        nome: row.categoriaNome,
        saldo: row.quantidadeFinal,
        pesoMedio: row.pesoMedioFinalKg || 0,
        origemPeso: row.origemPeso,
        precoKg,
        valorCabeca,
        precoArroba,
        valorTotal,
        isSugerido: categoriasComSugestao.has(row.categoriaCodigo),
      };
    });
  }, [resumoOficial.rows, precosLocal, categoriasComSugestao]);

  const liveRows = useMemo<LinhaTabelaValor[]>(() => {
    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const existing = allRows.find(r => r.codigo === codigo);
      if (existing) return existing;
      const cat = categorias.find(c => c.codigo === codigo);
      return {
        categoriaId: cat?.id || codigo,
        codigo,
        nome: cat?.nome || codigo,
        saldo: 0,
        pesoMedio: 0,
        origemPeso: 'sem_base' as OrigemPeso,
        precoKg: precosLocal[codigo] ?? 0,
        valorCabeca: 0,
        precoArroba: 0,
        valorTotal: 0,
        isSugerido: false,
      };
    });
  }, [allRows, categorias, precosLocal]);

  const temEstimativa = liveRows.some(r => r.saldo > 0 && r.pesoMedio > 0 && r.origemPeso !== 'pastos');
  const totalRebanhoLive = useMemo(() => liveRows.reduce((sum, r) => sum + r.valorTotal, 0), [liveRows]);
  const totalCabecasLive = useMemo(() => liveRows.reduce((sum, r) => sum + r.saldo, 0), [liveRows]);
  const pesoTotalKgLive = useMemo(() => liveRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0), [liveRows]);
  const metricasLiveSelecionado = useMemo(
    () => buildMetricsFromTotals(totalRebanhoLive, totalCabecasLive, pesoTotalKgLive),
    [totalRebanhoLive, totalCabecasLive, pesoTotalKgLive],
  );

  const categoriasSemPreco = useMemo(() => {
    if (!isDezembro) return [];
    return liveRows.filter(r => r.precoKg <= 0).map(r => r.nome);
  }, [liveRows, isDezembro]);

  const dezembroCompleto = isDezembro && categoriasSemPreco.length === 0;
  const fmtKg = (v: number) => v.toFixed(2).replace('.', ',');

  useEffect(() => {
    const numMap: Record<string, number> = {};
    const strMap: Record<string, string> = {};

    precos.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = v > 0 ? fmtKg(v) : '0,00';
    });

    Object.entries(precosSugeridos).forEach(([codigo, valor]) => {
      if (!numMap[codigo] || numMap[codigo] <= 0) {
        const v = Number(valor.toFixed(4));
        numMap[codigo] = v;
        strMap[codigo] = v > 0 ? fmtKg(v) : '0,00';
      }
    });

    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
  }, [precos, precosSugeridos]);

  const mesNum = Number(mesFiltro);
  const mesAnteriorKey = mesNum > 1 ? String(mesNum - 1).padStart(2, '0') : '12';
  const anoMesAnterior = mesNum > 1 ? `${anoFiltro}-${mesAnteriorKey}` : `${Number(anoFiltro) - 1}-12`;
  const anoMesDezAnterior = `${Number(anoFiltro) - 1}-12`;

  const resumoMesAnterior = useMemo(() => {
    const mesAnt = mesNum > 1 ? mesNum - 1 : 12;
    const data = mesNum > 1 ? viewDataAnoAtual : viewDataAnoAnterior;
    return extractResumoFromView(data, mesAnt);
  }, [viewDataAnoAtual, viewDataAnoAnterior, mesNum]);
  const { precos: precosMesAnterior } = useValorRebanho(anoMesAnterior);

  const resumoDezAnterior = useMemo(() => extractResumoFromView(viewDataAnoAnterior, 12), [viewDataAnoAnterior]);
  const { precos: precosDezAnterior } = useValorRebanho(anoMesDezAnterior);

  const metricasMesAnteriorLive = useMemo(() => {
    let valor = 0;
    let cabecas = 0;
    let pesoTotalKg = 0;

    resumoMesAnterior.rows.forEach(row => {
      const precoKg = precosMesAnterior.find(p => p.categoria === row.categoriaCodigo)?.preco_kg || 0;
      valor += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      cabecas += row.quantidadeFinal;
      pesoTotalKg += row.quantidadeFinal * (row.pesoMedioFinalKg || 0);
    });

    return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
  }, [resumoMesAnterior.rows, precosMesAnterior]);

  const metricasDezAnteriorLive = useMemo(() => {
    let valor = 0;
    let cabecas = 0;
    let pesoTotalKg = 0;

    resumoDezAnterior.rows.forEach(row => {
      const precoKg = precosDezAnterior.find(p => p.categoria === row.categoriaCodigo)?.preco_kg || 0;
      valor += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      cabecas += row.quantidadeFinal;
      pesoTotalKg += row.quantidadeFinal * (row.pesoMedioFinalKg || 0);
    });

    return buildMetricsFromTotals(valor, cabecas, pesoTotalKg);
  }, [resumoDezAnterior.rows, precosDezAnterior]);

  const [historicoPorMes, setHistoricoPorMes] = useState<Record<string, HistoricoMes>>({});
  const [historicoDetalhadoPorMes, setHistoricoDetalhadoPorMes] = useState<Record<string, SnapshotDetalheCategoria[]>>({});

  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__') {
      setHistoricoPorMes({});
      setHistoricoDetalhadoPorMes({});
      return;
    }

    const fetchHistorico = async () => {
      const anoMeses = [
        `${Number(anoFiltro) - 1}-12`,
        ...Array.from({ length: 12 }, (_, i) => `${anoFiltro}-${String(i + 1).padStart(2, '0')}`),
      ];

      try {
        const [fechamentoRes, itensRes] = await Promise.all([
          supabase
            .from('valor_rebanho_fechamento')
            .select('ano_mes, valor_total, peso_total_kg')
            .eq('fazenda_id', fazendaId)
            .eq('status', 'fechado')
            .in('ano_mes', anoMeses),
          supabase
            .from('valor_rebanho_fechamento_itens')
            .select('ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria')
            .eq('fazenda_id', fazendaId)
            .in('ano_mes', anoMeses),
        ]);

        if (fechamentoRes.error) throw fechamentoRes.error;
        if (itensRes.error) throw itensRes.error;

        const mapFechado: Record<string, HistoricoMes> = {};
        (fechamentoRes.data || []).forEach((item: any) => {
          mapFechado[item.ano_mes] = {
            valor: Number(item.valor_total) || 0,
            pesoKg: Number(item.peso_total_kg) || 0,
          };
        });

        const mapDetalhado: Record<string, SnapshotDetalheCategoria[]> = {};
        (itensRes.data || []).forEach((item: any) => {
          if (!mapDetalhado[item.ano_mes]) mapDetalhado[item.ano_mes] = [];
          mapDetalhado[item.ano_mes].push({
            categoria: item.categoria,
            quantidade: Number(item.quantidade) || 0,
            peso_medio_kg: Number(item.peso_medio_kg) || 0,
            preco_kg: Number(item.preco_kg) || 0,
            valor_total_categoria: Number(item.valor_total_categoria) || 0,
          });
        });

        setHistoricoPorMes(mapFechado);
        setHistoricoDetalhadoPorMes(mapDetalhado);
      } catch (error) {
        console.error('Erro ao carregar snapshots oficiais do valor do rebanho:', error);
        setHistoricoPorMes({});
        setHistoricoDetalhadoPorMes({});
      }
    };

    fetchHistorico();
  }, [fazendaId, anoFiltro, isFechado]);

  const getFrozen = useCallback((mesKey: string) => historicoPorMes[mesKey] ?? null, [historicoPorMes]);
  const getFrozenDetalhado = useCallback((mesKey: string) => historicoDetalhadoPorMes[mesKey] ?? [], [historicoDetalhadoPorMes]);

  const frozenSelecionado = getFrozen(anoMes);
  const mesSelecionadoFechado = isFechado || frozenSelecionado !== null;
  const frozenDetalhadoSelecionado = getFrozenDetalhado(anoMes);

  const fonteMes: FonteMes = !mesSelecionadoFechado
    ? 'live'
    : frozenDetalhadoSelecionado.length > 0
      ? 'snapshot'
      : 'snapshot_incompleto';

  // Snapshot rows: use OFFICIAL closure data (resumoOficial) for qty/weight,
  // snapshot only for pricing. This ensures consistency with Mapa do Rebanho / Painel.
  const snapshotRowsSelecionado = useMemo<LinhaTabelaValor[]>(() => {
    const itensPorCategoria = new Map(frozenDetalhadoSelecionado.map(item => [item.categoria, item]));
    const oficialPorCodigo = new Map(resumoOficial.rows.map(r => [r.categoriaCodigo, r]));

    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const snapshotItem = itensPorCategoria.get(codigo);
      const oficialRow = oficialPorCodigo.get(codigo);
      const cat = categorias.find(c => c.codigo === codigo);

      // Quantities and weights ALWAYS from fechamento_pasto_itens (official source)
      const saldo = oficialRow?.quantidadeFinal ?? 0;
      const pesoMedio = oficialRow?.pesoMedioFinalKg ?? 0;
      // Price from snapshot (user-entered)
      const precoKg = Number(snapshotItem?.preco_kg) || 0;
      const valorTotal = saldo * pesoMedio * precoKg;
      const arrobasLinha = saldo > 0 ? (saldo * pesoMedio) / 30 : 0;

      return {
        categoriaId: cat?.id || codigo,
        codigo,
        nome: cat?.nome || codigo,
        saldo,
        pesoMedio,
        origemPeso: oficialRow?.origemPeso ?? ('pastos' as OrigemPeso),
        precoKg,
        valorCabeca: saldo > 0 && pesoMedio > 0 ? pesoMedio * precoKg : 0,
        precoArroba: arrobasLinha > 0 ? valorTotal / arrobasLinha : 0,
        valorTotal,
        isSugerido: false,
      };
    });
  }, [frozenDetalhadoSelecionado, categorias, resumoOficial.rows]);

  // Build metrics for ANY month: physical data (qty/weight) ALWAYS from the view,
  // financial data (valor) from snapshot prices applied to view quantities.
  const buildFrozenMetrics = useCallback((mesKey: string): MetricasExibicao | null => {
    const snapshotDetalhado = historicoDetalhadoPorMes[mesKey] ?? [];
    const snapshotCabecalho = historicoPorMes[mesKey] ?? null;

    // Determine which view data to use based on the month's year
    const [keyAno, keyMes] = mesKey.split('-').map(Number);
    const viewData = keyAno === Number(anoFiltro) ? viewDataAnoAtual : viewDataAnoAnterior;
    const viewRows = (viewData || []).filter(r => r.mes === keyMes);

    // If no view data AND no snapshot, nothing to show
    if (viewRows.length === 0 && snapshotDetalhado.length === 0 && !snapshotCabecalho) return null;

    // Physical herd data ALWAYS from the official view
    const itensPorCategoria = new Map(snapshotDetalhado.map(item => [item.categoria, item]));
    let totalValor = 0;
    let totalCab = 0;
    let totalPesoKg = 0;

    if (viewRows.length > 0) {
      viewRows.forEach(row => {
        const precoKg = Number(itensPorCategoria.get(row.categoria_codigo)?.preco_kg) || 0;
        const pesoMedio = row.peso_medio_final || 0;
        totalCab += row.saldo_final;
        totalPesoKg += row.saldo_final * pesoMedio;
        totalValor += row.saldo_final * pesoMedio * precoKg;
      });
      return buildMetricsFromTotals(totalValor, totalCab, totalPesoKg);
    }

    // Fallback: if view has no data for this month, use snapshot (legacy closed months)
    const metricasDetalhadas = aggregateMetricsFromSnapshotItems(snapshotDetalhado);
    if (!snapshotCabecalho && !metricasDetalhadas) return null;

    return buildMetricsFromTotals(
      snapshotCabecalho?.valor ?? metricasDetalhadas?.valor ?? null,
      metricasDetalhadas?.cabecas ?? null,
      snapshotCabecalho?.pesoKg ?? metricasDetalhadas?.pesoTotalKg ?? null,
    );
  }, [historicoPorMes, historicoDetalhadoPorMes, anoFiltro, viewDataAnoAtual, viewDataAnoAnterior]);

  const metricasSelecionado = useMemo(() => {
    if (fonteMes === 'live') return metricasLiveSelecionado;
    if (fonteMes === 'snapshot_incompleto') return buildMetricsFromTotals(null, null, null);
    return buildFrozenMetrics(anoMes) ?? buildMetricsFromTotals(null, null, null);
  }, [fonteMes, metricasLiveSelecionado, buildFrozenMetrics, anoMes]);

  const metricasMesAnterior = useMemo(() => {
    if (fonteMes === 'live') return metricasMesAnteriorLive;
    return buildFrozenMetrics(anoMesAnterior);
  }, [fonteMes, metricasMesAnteriorLive, buildFrozenMetrics, anoMesAnterior]);

  const metricasInicioAno = useMemo(() => {
    if (fonteMes === 'live') return metricasDezAnteriorLive;
    return buildFrozenMetrics(anoMesDezAnterior);
  }, [fonteMes, metricasDezAnteriorLive, buildFrozenMetrics, anoMesDezAnterior]);

  const rowsExibicao = fonteMes === 'snapshot' ? snapshotRowsSelecionado : liveRows;
  const metricasTabela = useMemo(() => {
    if (fonteMes === 'snapshot') return aggregateMetricsFromTableRows(snapshotRowsSelecionado);
    if (fonteMes === 'live') return metricasLiveSelecionado;
    return buildMetricsFromTotals(null, null, null);
  }, [fonteMes, snapshotRowsSelecionado, metricasLiveSelecionado]);

  const valorRebanhoExibido = metricasSelecionado.valor;
  const pesoTotalKgExibido = metricasSelecionado.pesoTotalKg;
  const pesoMedioGeralExibido = metricasSelecionado.pesoMedio;
  const totalCabecasExibido = metricasSelecionado.cabecas;
  const totalArrobasExibido = metricasSelecionado.totalArrobas;
  const precoMedioArrobaExibido = metricasSelecionado.precoArroba;
  const valorMedioCabecaExibido = metricasSelecionado.valorCabeca;

  // (variações individuais movidas para bloco unificado abaixo)

  const buildChartData = useCallback((getValue: (mes: number) => number | null) => {
    return CHART_LABELS.map((label, idx) => {
      if (idx === 0) return { label, value: getValue(0) };
      const mes = idx;
      if (mes > mesNum) return { label, value: null };
      return { label, value: getValue(mes) };
    });
  }, [mesNum]);

  // Helper: get view-based physical metrics for a given month key
  const getViewMetricsForMonth = useCallback((mesKey: string): { cabecas: number; pesoKg: number } | null => {
    const [keyAno, keyMes] = mesKey.split('-').map(Number);
    const viewData = keyAno === Number(anoFiltro) ? viewDataAnoAtual : viewDataAnoAnterior;
    const viewRows = (viewData || []).filter(r => r.mes === keyMes);
    if (viewRows.length === 0) return null;
    let cabecas = 0;
    let pesoKg = 0;
    viewRows.forEach(r => {
      cabecas += r.saldo_final;
      pesoKg += r.saldo_final * (r.peso_medio_final || 0);
    });
    return { cabecas, pesoKg };
  }, [anoFiltro, viewDataAnoAtual, viewDataAnoAnterior]);

  const chartDataValor = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) {
        const dezKey = `${Number(anoFiltro) - 1}-12`;
        return buildFrozenMetrics(dezKey)?.valor ?? null;
      }
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && fonteMes === 'live') {
        return metricasLiveSelecionado.valor;
      }
      return buildFrozenMetrics(key)?.valor ?? null;
    });
  }, [buildChartData, anoFiltro, mesNum, fonteMes, metricasLiveSelecionado.valor, buildFrozenMetrics]);

  const chartDataArrobas = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) {
        const dezKey = `${Number(anoFiltro) - 1}-12`;
        const vm = getViewMetricsForMonth(dezKey);
        return vm ? vm.pesoKg / 30 : null;
      }
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && fonteMes === 'live') {
        return metricasLiveSelecionado.totalArrobas;
      }
      const vm = getViewMetricsForMonth(key);
      return vm ? vm.pesoKg / 30 : null;
    });
  }, [buildChartData, anoFiltro, mesNum, fonteMes, metricasLiveSelecionado.totalArrobas, getViewMetricsForMonth]);

  const chartDataPrecoArroba = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) {
        const dezKey = `${Number(anoFiltro) - 1}-12`;
        const metrics = buildFrozenMetrics(dezKey);
        return metrics?.precoArroba ?? null;
      }
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && fonteMes === 'live') {
        return metricasLiveSelecionado.precoArroba;
      }
      const metrics = buildFrozenMetrics(key);
      return metrics?.precoArroba ?? null;
    });
  }, [buildChartData, anoFiltro, mesNum, fonteMes, metricasLiveSelecionado.precoArroba, buildFrozenMetrics]);

  const handlePrecoChange = (codigo: string, value: string) => {
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setPrecosDisplay(prev => ({ ...prev, [codigo]: sanitized }));
    const num = parseFloat(sanitized.replace(',', '.'));
    setPrecosLocal(prev => ({ ...prev, [codigo]: isNaN(num) ? 0 : num }));
  };

  const handlePrecoBlur = (codigo: string) => {
    const num = precosLocal[codigo] || 0;
    setPrecosDisplay(prev => ({ ...prev, [codigo]: fmtKg(num) }));
  };

  const handleSalvar = async () => {
    if (bloqueadoPorConciliacao) {
      toast.error('Não é possível salvar. Existem categorias desconciliadas entre Pasto e Sistema.');
      return;
    }

    const items = Object.entries(precosLocal).map(([categoria, preco_kg]) => ({ categoria, preco_kg }));
    const snapshotDetalhado: SnapshotDetalheCategoria[] = liveRows.map(row => ({
      categoria: row.codigo,
      quantidade: row.saldo,
      peso_medio_kg: row.pesoMedio,
      preco_kg: row.precoKg,
      valor_total_categoria: row.valorTotal,
    }));

    await salvarPrecos(items, totalRebanhoLive, pesoTotalKgLive, snapshotDetalhado);
  };

  const handleCopiarMesAnterior = async () => {
    const prev = await loadPrecosMesAnterior();
    if (prev.length === 0) {
      toast.info('Nenhum preço encontrado no mês anterior');
      return;
    }

    const numMap: Record<string, number> = { ...precosLocal };
    const strMap: Record<string, string> = { ...precosDisplay };

    prev.forEach(p => {
      const v = Number(p.preco_kg) || 0;
      numMap[p.categoria] = v;
      strMap[p.categoria] = fmtKg(v);
    });

    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
    toast.success(`${prev.length} preços copiados do mês anterior`);
  };

  const canEdit = fonteMes === 'live' && !isMesFuturo;
  const tabelaUsaSnapshot = fonteMes === 'snapshot';
  const avisoSnapshotIncompleto = fonteMes === 'snapshot_incompleto';
  const fazendaNome = fazendaAtual?.nome || '';

  // ---------------------------------------------------------------------------
  // Unified data: Global vs Individual
  // ---------------------------------------------------------------------------

  const uRows = isGlobal ? globalData.rows : rowsExibicao;
  const uMetricas = isGlobal ? globalData.metricas : metricasSelecionado;
  const uMetricasMesAnt = isGlobal ? globalData.metricasMesAnterior : metricasMesAnterior;
  const uMetricasInicioAno = isGlobal ? globalData.metricasInicioAno : metricasInicioAno;
  const uFonteMes = isGlobal ? globalData.fonteMes : fonteMes;
  const uHistoricoPorMes = isGlobal ? globalData.historicoPorMes : historicoPorMes;
  const uCanEdit = isGlobal ? false : canEdit;
  const uTabelaUsaSnapshot = isGlobal
    ? (globalData.fonteMes === 'snapshot')
    : tabelaUsaSnapshot;
  const uAvisoSnapshotIncompleto = isGlobal
    ? (globalData.fonteMes === 'snapshot_incompleto')
    : avisoSnapshotIncompleto;
  const uFazendaNome = isGlobal ? '🌐 Global' : (fazendaAtual?.nome || '');
  const uMesFechado = isGlobal
    ? (globalData.fonteMes === 'snapshot' || globalData.fonteMes === 'snapshot_incompleto')
    : mesSelecionadoFechado;

  // Variações
  const uVarValorMes = calcVariacaoNullable(uMetricas.valor, uMetricasMesAnt?.valor ?? null);
  const uVarValorAno = calcVariacaoNullable(uMetricas.valor, uMetricasInicioAno?.valor ?? null);
  const uVarCabMes = calcVariacaoNullable(uMetricas.cabecas, uMetricasMesAnt?.cabecas ?? null);
  const uVarCabAno = calcVariacaoNullable(uMetricas.cabecas, uMetricasInicioAno?.cabecas ?? null);
  const uVarPesoMes = calcVariacaoNullable(uMetricas.pesoMedio, uMetricasMesAnt?.pesoMedio ?? null);
  const uVarPesoAno = calcVariacaoNullable(uMetricas.pesoMedio, uMetricasInicioAno?.pesoMedio ?? null);
  const uVarArrobaMes = calcVariacaoNullable(uMetricas.precoArroba, uMetricasMesAnt?.precoArroba ?? null);
  const uVarArrobaAno = calcVariacaoNullable(uMetricas.precoArroba, uMetricasInicioAno?.precoArroba ?? null);
  const uVarCabValorMes = calcVariacaoNullable(uMetricas.valorCabeca, uMetricasMesAnt?.valorCabeca ?? null);
  const uVarCabValorAno = calcVariacaoNullable(uMetricas.valorCabeca, uMetricasInicioAno?.valorCabeca ?? null);
  const uVarArrobasEstoqueMes = calcVariacaoNullable(uMetricas.totalArrobas, uMetricasMesAnt?.totalArrobas ?? null);
  const uVarArrobasEstoqueAno = calcVariacaoNullable(uMetricas.totalArrobas, uMetricasInicioAno?.totalArrobas ?? null);

  // Métricas da tabela
  const uMetricasTabela = isGlobal
    ? (uFonteMes === 'snapshot_incompleto' ? buildMetricsFromTotals(null, null, null) : (() => {
        const cabecas = uRows.reduce((s, r) => s + r.saldo, 0);
        const pesoTotalKg = uRows.reduce((s, r) => s + r.saldo * r.pesoMedio, 0);
        const valor = uRows.reduce((s, r) => s + r.valorTotal, 0);
        return buildMetricsFromTotals(cabecas > 0 ? valor : null, cabecas > 0 ? cabecas : null, cabecas > 0 ? pesoTotalKg : null);
      })())
    : metricasTabela;

  // Charts — global
  const uChartDataValor = useMemo(() => {
    if (!isGlobal) return chartDataValor;
    const dezKey = `${Number(anoFiltro) - 1}-12`;
    return CHART_LABELS.map((label, idx) => {
      if (idx === 0) return { label, value: uHistoricoPorMes[dezKey]?.valor ?? null };
      const mes = idx;
      if (mes > mesNum) return { label, value: null };
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && globalData.fonteMes === 'live') {
        return { label, value: uMetricas.valor };
      }
      return { label, value: uHistoricoPorMes[key]?.valor ?? null };
    });
  }, [isGlobal, chartDataValor, anoFiltro, mesNum, globalData.fonteMes, uMetricas.valor, uHistoricoPorMes]);

  const uChartDataArrobas = useMemo(() => {
    if (!isGlobal) return chartDataArrobas;
    const dezKey = `${Number(anoFiltro) - 1}-12`;
    return CHART_LABELS.map((label, idx) => {
      if (idx === 0) {
        const frozen = uHistoricoPorMes[dezKey];
        return { label, value: frozen ? frozen.pesoKg / 30 : null };
      }
      const mes = idx;
      if (mes > mesNum) return { label, value: null };
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && globalData.fonteMes === 'live') {
        return { label, value: uMetricas.totalArrobas };
      }
      const frozen = uHistoricoPorMes[key];
      return { label, value: frozen ? frozen.pesoKg / 30 : null };
    });
  }, [isGlobal, chartDataArrobas, anoFiltro, mesNum, globalData.fonteMes, uMetricas.totalArrobas, uHistoricoPorMes]);

  const uChartDataPrecoArroba = useMemo(() => {
    if (!isGlobal) return chartDataPrecoArroba;
    const dezKey = `${Number(anoFiltro) - 1}-12`;
    return CHART_LABELS.map((label, idx) => {
      if (idx === 0) {
        const frozen = uHistoricoPorMes[dezKey];
        return { label, value: frozen && frozen.pesoKg > 0 ? frozen.valor / (frozen.pesoKg / 30) : null };
      }
      const mes = idx;
      if (mes > mesNum) return { label, value: null };
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      if (mes === mesNum && globalData.fonteMes === 'live') {
        return { label, value: uMetricas.precoArroba };
      }
      const frozen = uHistoricoPorMes[key];
      return { label, value: frozen && frozen.pesoKg > 0 ? frozen.valor / (frozen.pesoKg / 30) : null };
    });
  }, [isGlobal, chartDataPrecoArroba, anoFiltro, mesNum, globalData.fonteMes, uMetricas.precoArroba, uHistoricoPorMes]);

  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  return (
    <div className="p-2 w-full space-y-1.5 animate-fade-in pb-16">
      <div className="flex gap-1.5 items-center flex-wrap">
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="w-20 h-7 text-xs font-bold">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map(a => (
              <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {uCanEdit && !isGlobal && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1 h-7 text-xs px-2">
            <Copy className="h-3 w-3" /> Mês anterior
          </Button>
        )}

        {bloqueadoPorConciliacao && !isGlobal && (
          <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium">
            <ShieldAlert className="h-3 w-3 shrink-0" />
            Bloqueado: divergências na Conciliação{categoriasStatus?.descricao && ` (${categoriasStatus.descricao})`}
          </span>
        )}

        {isMesFuturo && (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Futuro
          </Badge>
        )}

        {!isMesFuturo && uMesFechado && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Lock className="h-3 w-3" /> Fechado
            {isGlobal && ` (${globalData.fazendasFechadas}/${globalData.fazendasTotal})`}
          </Badge>
        )}

        {!isMesFuturo && !uMesFechado && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Info className="h-3 w-3" /> Live
          </Badge>
        )}

        {isGlobal && globalData.fonteMes === 'misto' && (
          <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Misto ({globalData.fazendasFechadas}/{globalData.fazendasTotal} fechadas)
          </Badge>
        )}

        <div className="ml-auto flex gap-1.5">
          {!isGlobal && !isMesFuturo && mesSelecionadoFechado && isAdmin && (
            <Button variant="outline" size="sm" onClick={reabrirFechamento} className="gap-1 h-7 text-xs px-2">
              <Unlock className="h-3 w-3" /> Reabrir
            </Button>
          )}
          {uCanEdit && !isGlobal && (
            <Button size="sm" onClick={handleSalvar} disabled={saving || bloqueadoPorConciliacao} className="gap-1 h-7 text-xs px-3">
              <Save className="h-3 w-3" />
              {bloqueadoPorConciliacao ? 'Bloqueado' : saving ? 'Salvando...' : 'Salvar e Fechar'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-0.5 bg-muted/30 rounded-md p-0.5 border">
        {MESES_SHORT.map(m => {
          const mesKey = `${anoFiltro}-${m.key}`;
          const isClosed = isGlobal ? !!uHistoricoPorMes[mesKey] : !!historicoPorMes[mesKey];
          const isSelected = mesFiltro === m.key;
          const mesN = Number(m.key);
          const isFuturo = anoNumFiltro > anoAtualSistema || (anoNumFiltro === anoAtualSistema && mesN > mesAtualSistema);
          return (
            <button
              key={m.key}
              onClick={() => setMesFiltro(m.key)}
              className={`flex-1 text-center text-[11px] font-semibold py-1 rounded transition-colors
                ${isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isFuturo
                    ? 'bg-muted/40 text-muted-foreground/50 cursor-default'
                    : isClosed
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {isMesAtual && !isMesFuturo && uFonteMes === 'live' && (
        <div className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-2 py-1 border border-amber-500/30">
          <Info className="h-3 w-3 shrink-0" />
          <span>Mês atual em andamento — valores parciais até o fechamento oficial.</span>
        </div>
      )}

      {uFonteMes === 'live' && !isMesFuturo && !isMesAtual && (
        <div className="flex items-center gap-1.5 text-[10px] bg-muted/40 text-muted-foreground rounded px-2 py-1 border">
          <Info className="h-3 w-3 shrink-0" />
          <span>{isGlobal ? 'Mês aberto: valores consolidados de todas as fazendas em cálculo live.' : 'Mês aberto: tabela, card e gráficos exibem cálculo live até o fechamento oficial.'}</span>
        </div>
      )}

      {uAvisoSnapshotIncompleto && (
        <div className="flex items-center gap-1.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-2 py-1 border border-amber-500/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{isGlobal
            ? 'Nem todas as fazendas possuem snapshot detalhado para este mês. Reabra e salve em cada fazenda individualmente.'
            : 'Mês fechado sem snapshot detalhado. Reabra e salve novamente para consolidar a base oficial.'}</span>
        </div>
      )}

      {uFonteMes === 'live' && isDezembro && !isGlobal && categoriasSemPreco.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] bg-destructive/10 text-destructive rounded px-2 py-0.5 border border-destructive/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span><strong>Dezembro — base anual:</strong> {categoriasSemPreco.length} categoria(s) sem preço: {categoriasSemPreco.join(', ')}.</span>
        </div>
      )}

      <div className="relative">
        {isMesFuturo && (
          <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-[1px] rounded-lg flex flex-col items-center justify-center gap-1.5">
            <Lock className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-muted-foreground">Mês ainda não aberto</p>
            <p className="text-[10px] text-muted-foreground/70">Apenas o mês vigente pode ser alimentado.</p>
          </div>
        )}
      <div className="flex flex-col lg:flex-row gap-3 items-start">
        <div className="w-full lg:flex-1 lg:max-w-[50%] min-w-0 bg-card rounded-lg shadow-sm border overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b bg-primary/15">
                <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider bg-primary/25">Categoria</th>
                <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Qtd</th>
                <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Peso</th>
                <th className="text-center px-1 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider w-[60px]">R$/kg</th>
                <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">R$/@</th>
                <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">R$/cab</th>
                <th className="text-center px-1.5 py-1 font-semibold text-foreground text-[10px] uppercase tracking-wider">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {uAvisoSnapshotIncompleto ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-[10px] text-muted-foreground">
                    {isGlobal
                      ? 'Nem todas as fazendas possuem snapshot detalhado. Reabra e salve em cada fazenda.'
                      : 'Mês fechado sem snapshot detalhado. Reabra e salve novamente para consolidar a base oficial.'}
                  </td>
                </tr>
              ) : (
                uRows.map((r, i) => (
                  <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="px-1.5 py-0.5 text-foreground text-[9.5px] italic whitespace-nowrap bg-primary/10">
                      {r.nome}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.saldo > 0 ? formatNum(r.saldo, 0) : '-'}
                    </td>
                    <td className="px-1.5 py-0.5 text-right tabular-nums italic text-[9.5px]">
                      {r.saldo > 0 && r.pesoMedio > 0 ? (
                        (uTabelaUsaSnapshot || isGlobal) ? (
                          <span className="text-foreground">{formatNum(r.pesoMedio, 2)}</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`cursor-help ${r.origemPeso === 'pastos' ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {formatNum(r.pesoMedio, 2)}
                                {r.origemPeso !== 'pastos' && ' *'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Fonte: {ORIGEM_LABEL[r.origemPeso]}
                            </TooltipContent>
                          </Tooltip>
                        )
                      ) : '-'}
                    </td>
                    <td className="px-0.5 py-0.5 w-[60px]">
                      {(uTabelaUsaSnapshot || isGlobal) ? (
                        <span className="block text-right text-[9.5px] italic text-foreground tabular-nums px-1">
                          {r.saldo > 0 && r.precoKg > 0 ? formatNum(r.precoKg, 2) : '-'}
                        </span>
                      ) : r.saldo > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={`h-5 text-right !text-[9px] leading-none tabular-nums italic px-1 w-full ${r.isSugerido ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                              placeholder="0,00"
                              value={precosDisplay[r.codigo] !== undefined ? precosDisplay[r.codigo] : fmtKg(r.precoKg)}
                              onChange={e => handlePrecoChange(r.codigo, e.target.value)}
                              onBlur={() => handlePrecoBlur(r.codigo)}
                              disabled={!uCanEdit}
                            />
                          </TooltipTrigger>
                          {r.isSugerido && (
                            <TooltipContent side="top" className="text-xs max-w-[200px]">
                              Preço sugerido pelo mercado. Edite se necessário.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      ) : (
                        <span className="block text-center text-[9.5px] italic text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.precoArroba > 0 ? formatMoeda(r.precoArroba) : '-'}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.valorCabeca > 0 ? formatMoeda(r.valorCabeca) : '-'}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                      {r.valorTotal > 0 ? formatMoeda(r.valorTotal) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-primary/25">
                <td className="px-1.5 py-1 font-bold text-foreground text-[11px] italic bg-primary/30">TOTAL</td>
                <td className="px-1.5 py-1 text-right font-bold text-foreground tabular-nums italic text-[11px]">{formatNumNullable(uMetricasTabela.cabecas, 0)}</td>
                <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">{formatNumNullable(uMetricasTabela.pesoMedio, 2)}</td>
                <td className="px-1 py-1 text-center text-foreground tabular-nums italic text-[11px] w-[60px]">
                  {formatNumNullable(uMetricasTabela.precoKg, 2)}
                </td>
                <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">{formatMoedaNullable(uMetricasTabela.precoArroba)}</td>
                <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">{formatMoedaNullable(uMetricasTabela.valorCabeca)}</td>
                <td className="px-1.5 py-1 text-right font-bold text-foreground tabular-nums italic text-[11px]">{formatMoedaNullable(uMetricasTabela.valor)}</td>
              </tr>
            </tfoot>
          </table>

          {uFonteMes === 'live' && !isGlobal && (
            <div className="flex items-center justify-end px-1.5 py-0.5 border-t">
              <p className="text-[9px] text-muted-foreground">
                * Peso estimado
                {isDezembro && ' • Dez = base anual'}
              </p>
            </div>
          )}

          {uFonteMes === 'live' && !isGlobal && (temSugestao || temEstimativa || dezembroCompleto) && (
            <div className="px-1.5 pb-1 space-y-0.5">
              {temSugestao && (
                <p className="text-[9px] text-amber-600 dark:text-amber-400">
                  ⚠ Preço de mercado sugerido. Valor definitivo após validação do fechamento.
                </p>
              )}
              {temEstimativa && (
                <p className="text-[9px] text-muted-foreground">
                  * Algumas categorias usam peso estimado (último lançamento ou saldo inicial).
                </p>
              )}
              {dezembroCompleto && (
                <p className="text-[9px] text-primary">
                  ✔ Base anual completa. Todas as categorias têm preço informado para dezembro.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="w-full lg:min-w-[200px] lg:flex-1 space-y-1.5">
          {uAvisoSnapshotIncompleto ? (
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {isGlobal ? 'Snapshot incompleto' : 'Mês fechado sem snapshot detalhado'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {isGlobal
                    ? 'Nem todas as fazendas possuem snapshot detalhado. Acesse cada fazenda individualmente para reabrir e salvar.'
                    : 'Reabra e salve novamente para consolidar a base oficial. Nenhum valor será exibido até que o snapshot completo seja gerado.'}
                </p>
              </CardContent>
            </Card>
          ) : (
          <>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-2.5">
              <div className="flex gap-3">
                <div className="shrink-0">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                    Valor do Rebanho — {mesLabel}/{anoFiltro}
                  </p>
                  {uFazendaNome && (
                    <p className="text-[9px] text-muted-foreground font-medium">{uFazendaNome}</p>
                  )}
                  <p className="text-xl font-extrabold text-foreground leading-tight mt-0.5">{formatMoedaNullable(uMetricas.valor)}</p>
                  <div className="flex flex-col gap-0 mt-0.5">
                    <VariacaoBadge valor={uVarValorMes} label="vs mês ant." showLabel />
                    <VariacaoBadge valor={uVarValorAno} label="vs ini. ano" showLabel />
                  </div>
                </div>

                <div className="flex-1 min-w-0 text-[10px] ml-7">
                  <div className="grid grid-cols-[auto_70px_56px_56px] gap-x-2 items-center">
                    <span className="text-[8px] text-muted-foreground font-medium">Indicador</span>
                    <span className="text-[8px] text-muted-foreground font-medium text-right">Valor</span>
                    <span className="text-[8px] text-muted-foreground font-medium text-right">vs mês</span>
                    <span className="text-[8px] text-muted-foreground font-medium text-right">vs ini. ano</span>

                    {[
                      { label: 'Cabeças', value: formatNumNullable(uMetricas.cabecas, 0), varMes: uVarCabMes, varAno: uVarCabAno },
                      { label: 'Peso médio', value: uMetricas.pesoMedio === null ? '—' : `${formatNum(uMetricas.pesoMedio, 2)} kg`, varMes: uVarPesoMes, varAno: uVarPesoAno },
                      { label: 'R$/@ médio', value: formatMoedaNullable(uMetricas.precoArroba), varMes: uVarArrobaMes, varAno: uVarArrobaAno },
                      { label: 'R$/cab', value: formatMoedaNullable(uMetricas.valorCabeca), varMes: uVarCabValorMes, varAno: uVarCabValorAno },
                      { label: '@s estoque', value: formatNumNullable(uMetricas.totalArrobas, 2), varMes: uVarArrobasEstoqueMes, varAno: uVarArrobasEstoqueAno },
                    ].map(ind => (
                      <React.Fragment key={ind.label}>
                        <span className="text-muted-foreground text-[9px] truncate">{ind.label}</span>
                        <span className="text-right font-semibold text-foreground tabular-nums">{ind.value}</span>
                        <span className="text-right"><VariacaoBadge valor={ind.varMes} label="" /></span>
                        <span className="text-right"><VariacaoBadge valor={ind.varAno} label="" /></span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <MiniChart data={uChartDataValor} color="hsl(var(--primary))" title="Valor do Rebanho" />
            <MiniChart data={uChartDataArrobas} color="hsl(142, 71%, 45%)" title="Arrobas em Estoque" />
            <MiniChart data={uChartDataPrecoArroba} color="hsl(217, 91%, 60%)" title="R$/@ Médio" />
          </div>
          </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
