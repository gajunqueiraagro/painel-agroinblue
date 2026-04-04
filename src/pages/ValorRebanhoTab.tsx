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
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { usePrecoMercado } from '@/hooks/usePrecoMercado';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { MESES_COLS } from '@/lib/calculos/labels';
import { toast } from 'sonner';
import { useFechamentoCategoria, type OrigemPeso } from '@/hooks/useFechamentoCategoria';
import { useStatusZootecnico } from '@/hooks/useStatusZootecnico';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
  onBack?: () => void;
  filtroAnoInicial?: string;
  filtroMesInicial?: number;
}

const ORIGEM_LABEL: Record<OrigemPeso, string> = {
  pastos: 'Fechamento do mês',
  lancamento: 'Último lançamento',
  saldo_inicial: 'Saldo inicial do ano',
  sem_base: 'Sem dados',
};

const MAPA_PRECO_MERCADO: Record<string, { bloco: string; categoria: string; unidade: 'kg' | 'arroba' }> = {
  mamotes_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  desmama_m: { bloco: 'magro_macho', categoria: '200 kg média', unidade: 'kg' },
  garrotes:  { bloco: 'magro_macho', categoria: 'Garrotes 350 kg média', unidade: 'kg' },
  bois:      { bloco: 'frigorifico', categoria: 'Boi Gordo', unidade: 'arroba' },
  touros:    { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
  mamotes_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  desmama_f: { bloco: 'magro_femea', categoria: '200 kg média', unidade: 'kg' },
  novilhas:  { bloco: 'frigorifico', categoria: 'Novilha', unidade: 'arroba' },
  vacas:     { bloco: 'frigorifico', categoria: 'Vaca', unidade: 'arroba' },
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

/* ─── Variation helpers ─── */
function calcVariacao(atual: number, anterior: number): number | null {
  if (!anterior || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
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

/* ─── Mini sparkline chart ─── */
const CHART_LABELS = ['I', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

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
  const { fazendaAtual, isGlobal } = useFazenda();
  const { categorias } = usePastos();
  const fazendaId = fazendaAtual?.id;

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

  const statusZoo = useStatusZootecnico(fazendaId, Number(anoFiltro), Number(mesFiltro), lancamentos, saldosIniciais);
  const categoriasStatus = statusZoo.pendencias.find(p => p.id === 'categorias');
  const categoriasConciliadas = categoriasStatus?.status === 'fechado';
  const bloqueadoPorConciliacao = !categoriasConciliadas && !isGlobal && !statusZoo.loading;

  const {
    precos, loading, saving, salvarPrecos, loadPrecosMesAnterior,
    isFechado, isAdmin, reabrirFechamento,
  } = useValorRebanho(anoMes);

  const { itens: precosMercado, isValidado: mercadoValidado } = usePrecoMercado(anoMes);

  const precosSugeridos = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(MAPA_PRECO_MERCADO).forEach(([codigo, ref]) => {
      const item = precosMercado.find(p => p.bloco === ref.bloco && p.categoria === ref.categoria);
      if (!item || item.valor <= 0) return;
      const valorComAgio = item.valor * (1 + (item.agio_perc || 0) / 100);
      if (ref.unidade === 'arroba') {
        map[codigo] = valorComAgio / 30;
      } else {
        map[codigo] = valorComAgio;
      }
    });
    return map;
  }, [precosMercado]);

  const [precosLocal, setPrecosLocal] = useState<Record<string, number>>({});
  const [precosDisplay, setPrecosDisplay] = useState<Record<string, string>>({});
  const [sugestaoAplicada, setSugestaoAplicada] = useState(false);

  const resumoOficial = useFechamentoCategoria(
    fazendaId, Number(anoFiltro), Number(mesFiltro), lancamentos, saldosIniciais, categorias,
  );

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

  const allRows = useMemo(() => {
    return resumoOficial.rows.map(row => {
      const precoKg = precosLocal[row.categoriaCodigo] ?? 0;
      const valorTotal = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * precoKg;
      const valorCabeca = row.quantidadeFinal > 0 && row.pesoMedioFinalKg && precoKg > 0
        ? row.pesoMedioFinalKg * precoKg : 0;
      const arrobasLinha = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
      const precoArroba = arrobasLinha > 0 ? valorTotal / arrobasLinha : 0;
      return {
        categoriaId: row.categoriaId, codigo: row.categoriaCodigo, nome: row.categoriaNome,
        saldo: row.quantidadeFinal, pesoMedio: row.pesoMedioFinalKg || 0,
        origemPeso: row.origemPeso, precoKg, valorCabeca, precoArroba, valorTotal,
        isSugerido: categoriasComSugestao.has(row.categoriaCodigo),
      };
    });
  }, [resumoOficial.rows, precosLocal, categoriasComSugestao]);

  // Always show all categories in fixed order
  const rows = useMemo(() => {
    return ORDEM_CATEGORIAS_FIXA.map(codigo => {
      const existing = allRows.find(r => r.codigo === codigo);
      if (existing) return existing;
      const cat = categorias.find(c => c.codigo === codigo);
      return {
        categoriaId: cat?.id || codigo, codigo, nome: cat?.nome || codigo,
        saldo: 0, pesoMedio: 0, origemPeso: 'sem_base' as OrigemPeso,
        precoKg: precosLocal[codigo] ?? 0, valorCabeca: 0, precoArroba: 0, valorTotal: 0,
        isSugerido: false,
      };
    });
  }, [allRows, categorias, precosLocal]);

  const temEstimativa = rows.some(r => r.saldo > 0 && r.pesoMedio > 0 && r.origemPeso !== 'pastos');

  const totalRebanho = useMemo(() => allRows.reduce((sum, r) => sum + r.valorTotal, 0), [allRows]);
  const totalCabecas = useMemo(() => allRows.reduce((sum, r) => sum + r.saldo, 0), [allRows]);
  const pesoMedioGeral = useMemo(() => {
    const totalPeso = allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0);
    return totalCabecas > 0 ? totalPeso / totalCabecas : 0;
  }, [allRows, totalCabecas]);
  const valorMedioCabeca = totalCabecas > 0 ? totalRebanho / totalCabecas : 0;

  const precoMedioKg = useMemo(() => {
    const pesoTotal = allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio), 0);
    return pesoTotal > 0 ? totalRebanho / pesoTotal : 0;
  }, [allRows, totalRebanho]);

  const totalArrobas = useMemo(() => allRows.reduce((sum, r) => sum + (r.saldo * r.pesoMedio / 30), 0), [allRows]);
  const precoMedioArroba = totalArrobas > 0 ? totalRebanho / totalArrobas : 0;
  const mesLabel = MESES_COLS.find(m => m.key === mesFiltro)?.label || mesFiltro;

  const categoriasSemPreco = useMemo(() => {
    if (!isDezembro) return [];
    return allRows.filter(r => r.precoKg <= 0).map(r => r.nome);
  }, [allRows, isDezembro]);

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
    let aplicouSugestao = false;
    Object.entries(precosSugeridos).forEach(([codigo, valor]) => {
      if (!numMap[codigo] || numMap[codigo] <= 0) {
        const v = Number(valor.toFixed(4));
        numMap[codigo] = v;
        strMap[codigo] = v > 0 ? fmtKg(v) : '0,00';
        aplicouSugestao = true;
      }
    });
    setPrecosLocal(numMap);
    setPrecosDisplay(strMap);
    setSugestaoAplicada(aplicouSugestao);
  }, [precos, precosSugeridos]);

  /* ─── Compute historical data for variations and charts ─── */
  // We'll compute data for all months up to current using the same hooks approach
  // For now, generate chart data from available data (placeholder for months without data)
  const mesNum = Number(mesFiltro);
  const mesAnteriorKey = mesNum > 1 ? String(mesNum - 1).padStart(2, '0') : '12';
  const anoMesAnterior = mesNum > 1 ? `${anoFiltro}-${mesAnteriorKey}` : `${Number(anoFiltro) - 1}-12`;

  // Load previous month data for variations
  const resumoMesAnterior = useFechamentoCategoria(
    fazendaId, mesNum > 1 ? Number(anoFiltro) : Number(anoFiltro) - 1,
    mesNum > 1 ? mesNum - 1 : 12,
    lancamentos, saldosIniciais, categorias,
  );
  const { precos: precosMesAnterior } = useValorRebanho(anoMesAnterior);

  // Load January data for YTD variation
  const anoMesJan = `${anoFiltro}-01`;
  const resumoJan = useFechamentoCategoria(
    fazendaId, Number(anoFiltro), 1, lancamentos, saldosIniciais, categorias,
  );
  const { precos: precosJan } = useValorRebanho(anoMesJan);

  // Compute prev month totals
  const prevTotals = useMemo(() => {
    let valor = 0, cabecas = 0, pesoTotal = 0, arrobas = 0;
    resumoMesAnterior.rows.forEach(row => {
      const pk = precosMesAnterior.find(p => p.categoria === row.categoriaCodigo)?.preco_kg || 0;
      const vt = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * pk;
      valor += vt;
      cabecas += row.quantidadeFinal;
      pesoTotal += row.quantidadeFinal * (row.pesoMedioFinalKg || 0);
      arrobas += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
    });
    return {
      valor, cabecas,
      pesoMedio: cabecas > 0 ? pesoTotal / cabecas : 0,
      precoArroba: arrobas > 0 ? valor / arrobas : 0,
      valorCab: cabecas > 0 ? valor / cabecas : 0,
    };
  }, [resumoMesAnterior.rows, precosMesAnterior]);

  // Compute January totals
  const janTotals = useMemo(() => {
    let valor = 0, cabecas = 0, pesoTotal = 0, arrobas = 0;
    resumoJan.rows.forEach(row => {
      const pk = precosJan.find(p => p.categoria === row.categoriaCodigo)?.preco_kg || 0;
      const vt = row.quantidadeFinal * (row.pesoMedioFinalKg || 0) * pk;
      valor += vt;
      cabecas += row.quantidadeFinal;
      pesoTotal += row.quantidadeFinal * (row.pesoMedioFinalKg || 0);
      arrobas += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
    });
    return {
      valor, cabecas,
      pesoMedio: cabecas > 0 ? pesoTotal / cabecas : 0,
      precoArroba: arrobas > 0 ? valor / arrobas : 0,
      valorCab: cabecas > 0 ? valor / cabecas : 0,
    };
  }, [resumoJan.rows, precosJan]);

  // Variations
  const varValorMes = calcVariacao(totalRebanho, prevTotals.valor);
  const varValorAno = calcVariacao(totalRebanho, janTotals.valor);
  const varCabMes = calcVariacao(totalCabecas, prevTotals.cabecas);
  const varCabAno = calcVariacao(totalCabecas, janTotals.cabecas);
  const varPesoMes = calcVariacao(pesoMedioGeral, prevTotals.pesoMedio);
  const varPesoAno = calcVariacao(pesoMedioGeral, janTotals.pesoMedio);
  const varArrobaMes = calcVariacao(precoMedioArroba, prevTotals.precoArroba);
  const varArrobaAno = calcVariacao(precoMedioArroba, janTotals.precoArroba);
  const varCabValorMes = calcVariacao(valorMedioCabeca, prevTotals.valorCab);
  const varCabValorAno = calcVariacao(valorMedioCabeca, janTotals.valorCab);

  // Arrobas em estoque variations
  const prevArrobas = useMemo(() => {
    let arrobas = 0;
    resumoMesAnterior.rows.forEach(row => {
      arrobas += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
    });
    return arrobas;
  }, [resumoMesAnterior.rows]);
  const janArrobas = useMemo(() => {
    let arrobas = 0;
    resumoJan.rows.forEach(row => {
      arrobas += row.quantidadeFinal * (row.pesoMedioFinalKg || 0) / 30;
    });
    return arrobas;
  }, [resumoJan.rows]);
  const varArrobasEstoqueMes = calcVariacao(totalArrobas, prevArrobas);
  const varArrobasEstoqueAno = calcVariacao(totalArrobas, janArrobas);

  // Chart data: query valor_rebanho_fechamento + vw_zoot_fazenda_mensal for all months
  const [historicoPorMes, setHistoricoPorMes] = useState<Record<string, number>>({});
  const [zootPorMes, setZootPorMes] = useState<Record<number, { pesoTotalKg: number; cabecas: number }>>({});
  const mesAtualNum = new Date().getMonth() + 1;
  const anoAtualNum = new Date().getFullYear();

  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__') return;
    const fetchHistorico = async () => {
      const anoMeses = Array.from({ length: 12 }, (_, i) => `${anoFiltro}-${String(i + 1).padStart(2, '0')}`);
      const [vrRes, zootRes] = await Promise.all([
        supabase
          .from('valor_rebanho_fechamento')
          .select('ano_mes, valor_total')
          .eq('fazenda_id', fazendaId)
          .in('ano_mes', anoMeses),
        supabase
          .from('vw_zoot_fazenda_mensal' as any)
          .select('mes, peso_total_final_kg, cabecas_final')
          .eq('fazenda_id', fazendaId)
          .eq('ano', Number(anoFiltro))
          .eq('cenario', 'realizado'),
      ]);
      const map: Record<string, number> = {};
      (vrRes.data || []).forEach((d: any) => { map[d.ano_mes] = Number(d.valor_total) || 0; });
      setHistoricoPorMes(map);

      const zMap: Record<number, { pesoTotalKg: number; cabecas: number }> = {};
      ((zootRes.data as any[]) || []).forEach((d: any) => {
        zMap[d.mes] = { pesoTotalKg: Number(d.peso_total_final_kg) || 0, cabecas: Number(d.cabecas_final) || 0 };
      });
      setZootPorMes(zMap);
    };
    fetchHistorico();
  }, [fazendaId, anoFiltro]);

  // Determine if selected month is fechado (has valor_rebanho_fechamento)
  const mesSelecionadoFechado = !!historicoPorMes[anoMes] || isFechado;

  // Build 13-point fixed chart data (Ini, Jan–Dez)
  // Only show data up to the selected month — future months blank
  const buildChartData = useCallback((getValue: (mes: number) => number | null) => {
    return CHART_LABELS.map((label, idx) => {
      if (idx === 0) {
        return { label, value: getValue(0) };
      }
      const mes = idx;
      // Blank out months AFTER the selected month
      if (mes > mesNum) {
        return { label, value: null };
      }
      return { label, value: getValue(mes) };
    });
  }, [mesNum]);

  // VALOR DO REBANHO chart — fonte oficial: valor_rebanho_fechamento.valor_total
  // Para o mês selecionado: SEMPRE usar totalRebanho (= valor exibido no card)
  // Para outros meses: usar valor frozen da tabela valor_rebanho_fechamento
  const chartDataValor = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) {
        // "Ini" = valor de janeiro (frozen)
        return historicoPorMes[`${anoFiltro}-01`] ?? null;
      }
      // Mês selecionado: usar EXATAMENTE o valor do card (totalRebanho)
      if (mes === mesNum) {
        return totalRebanho > 0 ? totalRebanho : (historicoPorMes[`${anoFiltro}-${String(mes).padStart(2, '0')}`] ?? null);
      }
      // Outros meses: valor frozen oficial
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      return historicoPorMes[key] ?? null;
    });
  }, [buildChartData, historicoPorMes, anoFiltro, mesNum, totalRebanho]);

  // ARROBAS EM ESTOQUE chart — fonte: vw_zoot_fazenda_mensal (peso_total_final_kg / 30)
  // Para o mês selecionado sem dados no zoot, usar live totalArrobas
  const chartDataArrobas = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) {
        const z = zootPorMes[1];
        return z && z.pesoTotalKg > 0 ? z.pesoTotalKg / 30 : null;
      }
      // Mês selecionado: usar valor live (= card)
      if (mes === mesNum) {
        if (totalArrobas > 0) return totalArrobas;
        const z = zootPorMes[mes];
        return z && z.pesoTotalKg > 0 ? z.pesoTotalKg / 30 : null;
      }
      const z = zootPorMes[mes];
      if (z && z.pesoTotalKg > 0) return z.pesoTotalKg / 30;
      return null;
    });
  }, [buildChartData, zootPorMes, totalArrobas, mesNum]);

  // R$/@ MÉDIO chart — derivado: valor / arrobas
  // Para o mês selecionado, usar live precoMedioArroba (= card)
  const chartDataPrecoArroba = useMemo(() => {
    return buildChartData((mes) => {
      if (mes === 0) {
        const z = zootPorMes[1];
        const v = historicoPorMes[`${anoFiltro}-01`];
        if (z && z.pesoTotalKg > 0 && v) return v / (z.pesoTotalKg / 30);
        return null;
      }
      // Mês selecionado: usar valor live (= card)
      if (mes === mesNum) {
        if (precoMedioArroba > 0) return precoMedioArroba;
      }
      const key = `${anoFiltro}-${String(mes).padStart(2, '0')}`;
      const z = zootPorMes[mes];
      const v = historicoPorMes[key];
      if (z && z.pesoTotalKg > 0 && v) return v / (z.pesoTotalKg / 30);
      return null;
    });
  }, [buildChartData, zootPorMes, historicoPorMes, anoFiltro, precoMedioArroba, mesNum]);

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
    await salvarPrecos(items, totalRebanho);
  };

  const handleCopiarMesAnterior = async () => {
    const prev = await loadPrecosMesAnterior();
    if (prev.length === 0) { toast.info('Nenhum preço encontrado no mês anterior'); return; }
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

  const canEdit = !isFechado;
  const fazendaNome = fazendaAtual?.nome || '';

  if (isGlobal) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Selecione uma fazenda para ver o valor do rebanho.
      </div>
    );
  }

  return (
    <div className="p-2 w-full space-y-1.5 animate-fade-in pb-16">
      {/* Ano filter + actions + inline blocking alert */}
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

        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleCopiarMesAnterior} className="gap-1 h-7 text-xs px-2">
            <Copy className="h-3 w-3" /> Mês anterior
          </Button>
        )}

        {bloqueadoPorConciliacao && (
          <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium">
            <ShieldAlert className="h-3 w-3 shrink-0" />
            Bloqueado: divergências na Conciliação{categoriasStatus?.descricao && ` (${categoriasStatus.descricao})`}
          </span>
        )}

        {isFechado && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Lock className="h-3 w-3" /> Fechado
          </Badge>
        )}

        <div className="ml-auto flex gap-1.5">
          {isFechado && isAdmin && (
            <Button variant="outline" size="sm" onClick={reabrirFechamento} className="gap-1 h-7 text-xs px-2">
              <Unlock className="h-3 w-3" /> Reabrir
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={handleSalvar} disabled={saving || bloqueadoPorConciliacao} className="gap-1 h-7 text-xs px-3">
              <Save className="h-3 w-3" />
              {bloqueadoPorConciliacao ? 'Bloqueado' : saving ? 'Salvando...' : 'Salvar e Fechar'}
            </Button>
          )}
        </div>
      </div>

      {/* Month bar — green=fechado, red=aberto */}
      <div className="flex gap-0.5 bg-muted/30 rounded-md p-0.5 border">
        {MESES_SHORT.map(m => {
          const mesKey = `${anoFiltro}-${m.key}`;
          const isClosed = !!historicoPorMes[mesKey];
          const isSelected = mesFiltro === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMesFiltro(m.key)}
              className={`flex-1 text-center text-[11px] font-semibold py-1 rounded transition-colors
                ${isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
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

      {/* December alert — only missing prices (shown above table) */}
      {isDezembro && categoriasSemPreco.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] bg-destructive/10 text-destructive rounded px-2 py-0.5 border border-destructive/30">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span><strong>Dezembro — base anual:</strong> {categoriasSemPreco.length} categoria(s) sem preço: {categoriasSemPreco.join(', ')}.</span>
        </div>
      )}

      {/* Main content: table left + summary card right */}
      <div className="flex gap-3 items-start relative">
        {/* Overlay for unclosed months */}
        {!mesSelecionadoFechado && (
          <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[1px] rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-card border border-border shadow-lg rounded-lg px-4 py-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Rebanho e pasto ainda não fechados</span>
            </div>
          </div>
        )}

        {/* LEFT — Table */}
        <div className="flex-1 max-w-[50%] min-w-0 bg-card rounded-lg shadow-sm border overflow-x-auto">
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
              {rows.map((r, i) => (
                <tr key={r.codigo} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                  <td className="px-1.5 py-0.5 text-foreground text-[9.5px] italic whitespace-nowrap bg-primary/10">
                    {r.nome}
                  </td>
                  <td className="px-1.5 py-0.5 text-right text-foreground tabular-nums italic text-[9.5px]">
                    {r.saldo > 0 ? formatNum(r.saldo, 0) : '-'}
                  </td>
                  <td className="px-1.5 py-0.5 text-right tabular-nums italic text-[9.5px]">
                    {r.saldo > 0 && r.pesoMedio > 0 ? (
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
                    ) : '-'}
                  </td>
                  <td className="px-0.5 py-0.5 w-[60px]">
                    {r.saldo > 0 ? (
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
                            disabled={!canEdit}
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
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-primary/25">
                <td className="px-1.5 py-1 font-bold text-foreground text-[11px] italic bg-primary/30">TOTAL</td>
                <td className="px-1.5 py-1 text-right font-bold text-foreground tabular-nums italic text-[11px]">{formatNum(totalCabecas, 0)}</td>
                <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">{formatNum(pesoMedioGeral, 2)}</td>
                <td className="px-1 py-1 text-center text-foreground tabular-nums italic text-[11px] w-[60px]">
                  {precoMedioKg > 0 ? formatNum(precoMedioKg, 2) : ''}
                </td>
                <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">{precoMedioArroba > 0 ? formatMoeda(precoMedioArroba) : '-'}</td>
                <td className="px-1.5 py-1 text-right text-foreground tabular-nums italic text-[11px]">{formatMoeda(valorMedioCabeca)}</td>
                <td className="px-1.5 py-1 text-right font-bold text-foreground tabular-nums italic text-[11px]">{formatMoeda(totalRebanho)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Footer inside table area */}
          <div className="flex items-center justify-end px-1.5 py-0.5 border-t">
            <p className="text-[9px] text-muted-foreground">
              * Peso estimado
              {isDezembro && ' • Dez = base anual'}
            </p>
          </div>

          {(temSugestao || temEstimativa || dezembroCompleto) && (
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

        {/* RIGHT — Summary Card + Charts below */}
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-2.5">
              <div className="flex gap-3">
                {/* LEFT column — main value */}
                <div className="shrink-0">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                    Valor do Rebanho — {mesLabel}/{anoFiltro}
                  </p>
                  {fazendaNome && (
                    <p className="text-[9px] text-muted-foreground font-medium">{fazendaNome}</p>
                  )}
                  <p className="text-xl font-extrabold text-foreground leading-tight mt-0.5">{formatMoeda(totalRebanho)}</p>
                  <div className="flex flex-col gap-0 mt-0.5">
                    <VariacaoBadge valor={varValorMes} label="vs mês ant." showLabel />
                    <VariacaoBadge valor={varValorAno} label="vs ini. ano" showLabel />
                  </div>
                </div>
                {/* RIGHT column — indicators compact */}
                <div className="flex-1 min-w-0 text-[10px] ml-7">
                  <div className="grid grid-cols-[auto_70px_56px_56px] gap-x-2 items-center">
                    {/* Header */}
                    <span className="text-[8px] text-muted-foreground font-medium">Indicador</span>
                    <span className="text-[8px] text-muted-foreground font-medium text-right">Valor</span>
                    <span className="text-[8px] text-muted-foreground font-medium text-right">vs mês</span>
                    <span className="text-[8px] text-muted-foreground font-medium text-right">vs ano</span>
                    {/* Rows */}
                    {[
                      { label: 'Cabeças', value: formatNum(totalCabecas, 0), varMes: varCabMes, varAno: varCabAno },
                      { label: 'Peso médio', value: `${formatNum(pesoMedioGeral, 2)} kg`, varMes: varPesoMes, varAno: varPesoAno },
                      { label: 'R$/@ médio', value: precoMedioArroba > 0 ? formatMoeda(precoMedioArroba) : '—', varMes: varArrobaMes, varAno: varArrobaAno },
                      { label: 'R$/cab', value: formatMoeda(valorMedioCabeca), varMes: varCabValorMes, varAno: varCabValorAno },
                      { label: '@s estoque', value: formatNum(totalArrobas, 2), varMes: varArrobasEstoqueMes, varAno: varArrobasEstoqueAno },
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

          {/* Charts — inside right column, below card */}
          <div className="flex gap-3">
            <MiniChart data={chartDataValor} color="hsl(var(--primary))" title="Valor do Rebanho" />
            <MiniChart data={chartDataArrobas} color="hsl(142, 71%, 45%)" title="Arrobas em Estoque" />
            <MiniChart data={chartDataPrecoArroba} color="hsl(217, 91%, 60%)" title="R$/@ Médio" />
          </div>
        </div>
      </div>
    </div>
  );
}