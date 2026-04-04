/**
 * Painel do Consultor — ferramenta de gestão completa.
 * Abas: Valores Mensais | Médios do Mês | Acumulados | Média do Período
 * Cenários: Realizado | Previsto | Comparativo
 * Blocos colapsáveis: Rebanho, Produção, Financeiro no Caixa, Financeiro por Competência
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Download, ChevronDown } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { usePastos } from '@/hooks/usePastos';
import { formatPainel, type PainelFormatType } from '@/lib/calculos/formatters';
import {
  calcSaldoMensalAcumulado,
  calcResumoMovimentacoes,
  calcUA,
  calcAreaProdutivaPecuaria,
  calcSaldoPorCategoriaLegado,
} from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe, calcValorTotal } from '@/lib/calculos/economicos';
import { supabase } from '@/integrations/supabase/client';
import { isConciliado as isLancConciliado } from '@/lib/statusOperacional';
import { loadPesosPastosPorCategoria, resolverPesoOficial } from '@/hooks/useFechamentoCategoria';
import {
  isConciliado as isFinConciliado,
  isEntrada as isFinEntrada,
  isSaida as isFinSaida,
  classificarEntrada,
  classificarSaida,
  datePagtoMes,
  datePagtoAno,
} from '@/lib/financeiro/classificacao';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';

// ─── Constants ───
const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FILTRO = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

type ViewTab = 'mensal' | 'medio' | 'acumulado' | 'media_periodo';
type Cenario = 'realizado' | 'previsto' | 'comparativo';

interface Props {
  onBack: () => void;
  filtroGlobal?: { ano: string; mes: number };
}

// ─── Indicator row definition ───
interface IndicatorRow {
  bloco: string;
  indicador: string;
  format: PainelFormatType;
  /** Monthly raw values (12 items) */
  mensal: number[];
  /** Monthly average (value / divisor) */
  medio: number[];
  /** Accumulated up to month */
  acumulado: number[];
  /** Rolling average of the period */
  mediaPeriodo: number[];
}

// ─── Build all indicators ───
function buildIndicators(
  lancPec: Lancamento[],
  saldosIniciais: SaldoInicial[],
  lancFin: FinanceiroLancamento[],
  ano: number,
  areaProdutiva: number,
  pesosPorMes: Record<string, Record<string, number>>,
  valorRebanhoMes: number[],
): IndicatorRow[] {
  const rows: IndicatorRow[] = [];

  // ═══ Zootécnico helpers ═══
  const { saldoInicioMes, saldoFinalAno, saldoInicialAno } = calcSaldoMensalAcumulado(saldosIniciais, lancPec, ano);

  const saldoFimMes = (m: number): number => {
    if (m >= 12) return saldoFinalAno;
    const next = String(m + 1).padStart(2, '0');
    return saldoInicioMes[next] ?? 0;
  };

  const lancAno = lancPec.filter(l => l.data.substring(0, 4) === String(ano) && isLancConciliado(l));
  const lancMes = (m: number) => {
    const prefix = `${ano}-${String(m).padStart(2, '0')}`;
    return lancAno.filter(l => l.data.startsWith(prefix));
  };

  const tiposEntrada = ['nascimento', 'compra', 'transferencia_entrada'];
  const tiposSaida = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

  const cabIniMes = (m: number) => {
    const k = String(m).padStart(2, '0');
    return m === 1 ? saldoInicialAno : (saldoInicioMes[k] ?? 0);
  };
  const cabFinMes = (m: number) => saldoFimMes(m);
  const cabMediaMes = (m: number) => (cabIniMes(m) + cabFinMes(m)) / 2;

  const entradasCabMes = (m: number) => {
    const resumo = calcResumoMovimentacoes(lancPec, `${ano}-${String(m).padStart(2, '0')}`);
    return resumo.totalEntradas;
  };
  const saidasCabMes = (m: number) => {
    const resumo = calcResumoMovimentacoes(lancPec, `${ano}-${String(m).padStart(2, '0')}`);
    return resumo.totalSaidas;
  };

  // Peso final per month
  const pesoFinKgArr = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const anoMes = `${ano}-${String(m).padStart(2, '0')}`;
    const pesosMap = pesosPorMes[anoMes] || {};
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancPec, ano, m);
    let total = 0;
    saldoMap.forEach((qtd, cat) => {
      const { valor: pesoMedio } = resolverPesoOficial(cat, pesosMap, saldosIniciais, lancPec, ano, m);
      total += qtd * (pesoMedio || 0);
    });
    return total;
  });

  const pesoIniMes = (m: number) => {
    if (m === 1) return saldosIniciais.filter(s => s.ano === ano).reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
    return pesoFinKgArr[m - 2] ?? 0;
  };
  const pesoFinMes = (m: number) => pesoFinKgArr[m - 1] ?? 0;
  const pesoMedioMes = (m: number) => { const c = cabFinMes(m); return c > 0 ? pesoFinMes(m) / c : 0; };
  const diasNoMes = (m: number): number => new Date(ano, m, 0).getDate();

  const entradasKgMes = (m: number) => lancMes(m).filter(l => tiposEntrada.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  const saidasKgMes = (m: number) => lancMes(m).filter(l => tiposSaida.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);

  const arrobasProduzidasMesFn = (m: number): number => {
    const pFin = pesoFinMes(m);
    const pIni = pesoIniMes(m);
    if (pFin <= 0 || pIni <= 0) return 0;
    return (pFin - pIni - entradasKgMes(m) + saidasKgMes(m)) / 30;
  };

  const gmdMesFn = (m: number): number => {
    const rebMedio = cabMediaMes(m);
    const dias = diasNoMes(m);
    if (rebMedio <= 0 || dias <= 0) return 0;
    return (pesoFinMes(m) - pesoIniMes(m) - entradasKgMes(m) + saidasKgMes(m)) / rebMedio / dias;
  };

  // ═══ Financeiro helpers ═══
  const concFin = lancFin.filter(l => isFinConciliado(l));
  const finDoAno = concFin.filter(l => datePagtoAno(l) === ano);
  const finDoMes = (m: number) => finDoAno.filter(l => datePagtoMes(l) === m);

  const entFinMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const saiFinMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const recPecMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === 'Receitas Pecuárias').reduce((s, l) => s + Math.abs(l.valor), 0);
  const deducMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Dedução de Receitas').reduce((s, l) => s + Math.abs(l.valor), 0);
  const desembPecMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Desemb. Produtivo Pec.').reduce((s, l) => s + Math.abs(l.valor), 0);

  // ─── Helper: create a full IndicatorRow from a monthly value function ───
  const mkRow = (
    bloco: string,
    indicador: string,
    fn: (m: number) => number,
    format: PainelFormatType = 'padrao',
    opts?: { acumMode?: 'sum' | 'avg'; medioDiv?: (m: number) => number },
  ): IndicatorRow => {
    const mensal = Array.from({ length: 12 }, (_, i) => fn(i + 1));
    const acumMode = opts?.acumMode ?? 'sum';

    // Medio: value / divisor (default = dias do mês for daily, or just the value)
    const medio = mensal.map((v, i) => {
      if (opts?.medioDiv) {
        const d = opts.medioDiv(i + 1);
        return d > 0 ? v / d : 0;
      }
      return v; // for items like GMD, peso medio already IS the average
    });

    // Acumulado
    const acumulado: number[] = [];
    if (acumMode === 'sum') {
      let acc = 0;
      for (const v of mensal) { acc += v; acumulado.push(acc); }
    } else {
      // rolling average
      let sum = 0, n = 0;
      for (const v of mensal) {
        if (v !== 0) { sum += v; n++; }
        acumulado.push(n > 0 ? sum / n : 0);
      }
    }

    // Média do período: rolling average
    const mediaPeriodo: number[] = [];
    let mpSum = 0, mpN = 0;
    for (const v of mensal) {
      if (v !== 0) { mpSum += v; mpN++; }
      mediaPeriodo.push(mpN > 0 ? mpSum / mpN : 0);
    }

    return { bloco, indicador, format, mensal, medio, acumulado, mediaPeriodo };
  };

  // ═══════════════════════════════════════════════
  // BLOCO: REBANHO
  // ═══════════════════════════════════════════════
  rows.push(mkRow('Rebanho', 'Rebanho inicial (cab)', cabIniMes, 'cab'));
  rows.push(mkRow('Rebanho', 'Rebanho final (cab)', cabFinMes, 'cab'));
  rows.push(mkRow('Rebanho', 'Rebanho médio (cab)', cabMediaMes, 'cab', { acumMode: 'avg' }));
  rows.push(mkRow('Rebanho', 'Entradas (cab)', entradasCabMes, 'cab'));
  rows.push(mkRow('Rebanho', 'Saídas (cab)', saidasCabMes, 'cab'));

  // ═══════════════════════════════════════════════
  // BLOCO: PRODUÇÃO
  // ═══════════════════════════════════════════════
  rows.push(mkRow('Produção', 'Área produtiva (ha)', () => areaProdutiva, 'padrao', { acumMode: 'avg' }));
  rows.push(mkRow('Produção', 'Arrobas produzidas (@)', arrobasProduzidasMesFn, 'padrao'));
  rows.push(mkRow('Produção', 'Arrobas por hectare (@/ha)', m => areaProdutiva > 0 ? arrobasProduzidasMesFn(m) / areaProdutiva : 0, 'padrao'));
  rows.push(mkRow('Produção', 'GMD (kg/cab/dia)', gmdMesFn, 'gmd', { acumMode: 'avg' }));
  rows.push(mkRow('Produção', 'Peso médio final (kg/cab)', pesoMedioMes, 'padrao', { acumMode: 'avg' }));
  rows.push(mkRow('Produção', 'Produção total (kg)', m => arrobasProduzidasMesFn(m) * 30, 'padrao'));

  // ═══════════════════════════════════════════════
  // BLOCO: FINANCEIRO NO CAIXA
  // ═══════════════════════════════════════════════
  rows.push(mkRow('Financeiro no Caixa', 'Entradas financeiras (R$)', entFinMes, 'money'));
  rows.push(mkRow('Financeiro no Caixa', 'Saídas financeiras (R$)', saiFinMes, 'money'));
  rows.push(mkRow('Financeiro no Caixa', 'Receitas pecuárias (R$)', recPecMes, 'money'));
  rows.push(mkRow('Financeiro no Caixa', 'Custos operacionais (R$)', desembPecMes, 'money'));
  rows.push(mkRow('Financeiro no Caixa', 'Resultado de caixa (R$)', m => entFinMes(m) - saiFinMes(m), 'money'));

  // ═══════════════════════════════════════════════
  // BLOCO: FINANCEIRO POR COMPETÊNCIA
  // ═══════════════════════════════════════════════
  rows.push(mkRow('Financeiro por Competência', 'Receita pecuária (R$)', recPecMes, 'money'));
  rows.push(mkRow('Financeiro por Competência', 'Variação valor rebanho (R$)', m => {
    const vrAtual = valorRebanhoMes[m - 1] || 0;
    const vrAnterior = m === 1 ? 0 : (valorRebanhoMes[m - 2] || 0);
    return vrAtual - vrAnterior;
  }, 'money'));
  rows.push(mkRow('Financeiro por Competência', 'Resultado operacional (R$)', m => {
    return recPecMes(m) - deducMes(m) - desembPecMes(m);
  }, 'money'));
  rows.push(mkRow('Financeiro por Competência', 'Margem (R$)', m => {
    const arrProd = arrobasProduzidasMesFn(m);
    if (arrProd <= 0) return 0;
    return (recPecMes(m) - desembPecMes(m)) / arrProd;
  }, 'money'));
  rows.push(mkRow('Financeiro por Competência', 'EBITDA (R$)', m => {
    return recPecMes(m) - deducMes(m) - desembPecMes(m);
  }, 'money'));

  return rows;
}

// ─── View data selector ───
function getViewData(row: IndicatorRow, view: ViewTab): number[] {
  switch (view) {
    case 'mensal': return row.mensal;
    case 'medio': return row.medio;
    case 'acumulado': return row.acumulado;
    case 'media_periodo': return row.mediaPeriodo;
  }
}

// ─── Export ───
function exportToExcel(
  indicators: IndicatorRow[],
  ano: number,
  fazendaNome: string,
  view: ViewTab,
) {
  const mesesHeaders = [...MESES_LABELS, 'Total'];
  const filename = `Painel_Consultor_${fazendaNome.replace(/\s+/g, '_')}_${ano}.xlsx`;

  const sheetRows = indicators.map(row => {
    const vals = getViewData(row, view);
    const base: Record<string, string | number> = {
      Bloco: row.bloco,
      Indicador: row.indicador,
    };
    MESES_LABELS.forEach((mes, i) => { base[mes] = vals[i] ?? 0; });
    base['Total'] = vals.reduce((a, b) => a + b, 0);
    return base;
  });

  const cols = [{ wch: 24 }, { wch: 30 }, ...mesesHeaders.map(() => ({ wch: 14 }))];

  triggerXlsxDownload({
    filename,
    sheets: [{ name: 'Painel', rows: sheetRows, cols }],
  });
}

// ─── Component ───

export function PainelConsultorTab({ onBack, filtroGlobal }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { lancamentos: lancPec, saldosIniciais } = useLancamentos();
  const { lancamentos: lancFin } = useFinanceiro();

  const [ano, setAno] = useState(filtroGlobal?.ano || String(new Date().getFullYear()));
  const [ateMes, setAteMes] = useState(filtroGlobal?.mes || new Date().getMonth() + 1);
  const [viewTab, setViewTab] = useState<ViewTab>('mensal');
  const [cenario, setCenario] = useState<Cenario>('realizado');
  const [pesosPorMes, setPesosPorMes] = useState<Record<string, Record<string, number>>>({});
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(Array(12).fill(0));
  const [openBlocos, setOpenBlocos] = useState<Record<string, boolean>>({
    'Rebanho': true,
    'Produção': false,
    'Financeiro no Caixa': false,
    'Financeiro por Competência': false,
  });

  const anoNum = Number(ano);
  const anosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    s.add(String(new Date().getFullYear()));
    s.add(String(new Date().getFullYear() - 1));
    saldosIniciais.forEach(si => s.add(String(si.ano)));
    return Array.from(s).sort().reverse();
  }, [saldosIniciais]);

  const fazendaId = fazendaAtual?.id;

  // Load peso data from fechamento_pastos
  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || categorias.length === 0) {
      setPesosPorMes({});
      return;
    }
    (async () => {
      const result: Record<string, Record<string, number>> = {};
      for (let m = 1; m <= 12; m++) {
        const anoMes = `${anoNum}-${String(m).padStart(2, '0')}`;
        result[anoMes] = await loadPesosPastosPorCategoria(fazendaId, anoMes, categorias);
      }
      setPesosPorMes(result);
    })();
  }, [fazendaId, anoNum, categorias]);

  // Load valor do rebanho
  useEffect(() => {
    if (!fazendaId) { setValorRebanhoMes(Array(12).fill(0)); return; }
    (async () => {
      const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);
      const fazendaIds = fazendaId === '__global__'
        ? fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id)
        : [fazendaId];

      if (fazendaIds.length === 0) { setValorRebanhoMes(Array(12).fill(0)); return; }

      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .in('fazenda_id', fazendaIds)
        .in('ano_mes', meses);

      if (error) { setValorRebanhoMes(Array(12).fill(0)); return; }

      const totais = new Map(meses.map(mes => [mes, 0]));
      (data || []).forEach(row => {
        totais.set(row.ano_mes, (totais.get(row.ano_mes) || 0) + (Number(row.valor_total) || 0));
      });
      setValorRebanhoMes(meses.map(mes => totais.get(mes) || 0));
    })();
  }, [fazendaId, anoNum, fazendas]);

  const areaProdutiva = useMemo(() => calcAreaProdutivaPecuaria(pastos), [pastos]);

  const indicators = useMemo(() =>
    buildIndicators(lancPec, saldosIniciais, lancFin, anoNum, areaProdutiva, pesosPorMes, valorRebanhoMes),
    [lancPec, saldosIniciais, lancFin, anoNum, areaProdutiva, pesosPorMes, valorRebanhoMes],
  );

  const fazendaNome = isGlobal ? 'Global' : (fazendaAtual?.nome || 'Fazenda');

  const handleExport = useCallback(() => {
    try {
      exportToExcel(indicators, anoNum, fazendaNome, viewTab);
    } catch {
      toast.error('Não foi possível exportar.');
    }
  }, [indicators, anoNum, fazendaNome, viewTab]);

  const toggleBloco = (bloco: string) => {
    setOpenBlocos(prev => ({ ...prev, [bloco]: !prev[bloco] }));
  };

  // Group indicators by bloco
  const blocos = useMemo(() => {
    const map = new Map<string, IndicatorRow[]>();
    indicators.forEach(row => {
      if (!map.has(row.bloco)) map.set(row.bloco, []);
      map.get(row.bloco)!.push(row);
    });
    return Array.from(map.entries());
  }, [indicators]);

  const VIEW_TABS: { id: ViewTab; label: string }[] = [
    { id: 'mensal', label: 'Valores Mensais' },
    { id: 'medio', label: 'Médios do Mês' },
    { id: 'acumulado', label: 'Acumulados' },
    { id: 'media_periodo', label: 'Média do Período' },
  ];

  const renderBlocoTable = (blocoRows: IndicatorRow[]) => {
    return (
      <div className="overflow-x-auto border rounded border-border/40">
        <table className="w-full text-[10px] border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            {MESES_LABELS.map((_, i) => <col key={i} />)}
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted border-b">
              <th className="sticky left-0 z-20 bg-muted text-left text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5">Indicador</th>
              {MESES_LABELS.map(m => (
                <th key={m} className="text-right text-[9px] font-semibold uppercase tracking-wider px-0.5 py-0.5">{m}</th>
              ))}
              <th className="text-right text-[9px] font-bold uppercase tracking-wider px-0.5 py-0.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {blocoRows.map((row, idx) => {
              const vals = getViewData(row, viewTab);
              const total = viewTab === 'mensal' || viewTab === 'acumulado'
                ? vals.reduce((a, b) => a + b, 0)
                : vals[ateMes - 1] || 0;

              return (
                <tr key={idx} className={`border-b border-border/20 hover:bg-muted/20 ${idx % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                  <td className="sticky left-0 z-10 bg-card text-[10px] font-medium py-0.5 px-1.5 leading-tight truncate">
                    {row.indicador}
                  </td>
                  {vals.map((v, i) => {
                    // Comparativo: color coding
                    let colorClass = '';
                    if (cenario === 'comparativo') {
                      if (v > 0) colorClass = 'text-emerald-600';
                      else if (v < 0) colorClass = 'text-red-500';
                    }
                    return (
                      <td key={i} className={`text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px] ${colorClass}`}>
                        {formatPainel(v, row.format)}
                      </td>
                    );
                  })}
                  <td className="text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px] font-bold">
                    {formatPainel(viewTab === 'mensal' ? vals.reduce((a, b) => a + b, 0) : vals[ateMes - 1] || 0, row.format)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-16">
      <div className="px-2 pt-2 space-y-1.5">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[72px] h-7 text-[11px] px-2 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(ateMes)} onValueChange={v => setAteMes(Number(v))}>
            <SelectTrigger className="w-[100px] h-7 text-[11px] px-2 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_FILTRO.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs">Até {m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Cenário toggle */}
          <div className="flex items-center rounded-md border border-border/50 overflow-hidden h-7">
            {(['realizado', 'previsto', 'comparativo'] as Cenario[]).map(c => (
              <button
                key={c}
                onClick={() => setCenario(c)}
                className={`px-2 text-[11px] font-semibold h-full transition-colors capitalize ${
                  cenario === c
                    ? c === 'realizado'
                      ? 'bg-emerald-600 text-white'
                      : c === 'comparativo'
                        ? 'bg-amber-500 text-white'
                        : 'bg-muted text-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {c === 'comparativo' ? 'Compar.' : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{fazendaNome} · {ano}</span>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-7 gap-1 text-[11px] px-2">
              <Download className="h-3 w-3" />
              Excel
            </Button>
          </div>
        </div>

        {/* ── View tabs ── */}
        <div className="flex gap-0 overflow-x-auto border-b border-border/40">
          {VIEW_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setViewTab(t.id)}
              className={`px-3 py-1 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                viewTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Collapsible blocks ── */}
        <div className="space-y-1 mt-1">
          {blocos.map(([blocoName, blocoRows]) => (
            <Collapsible
              key={blocoName}
              open={openBlocos[blocoName] ?? false}
              onOpenChange={() => toggleBloco(blocoName)}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1 bg-muted/60 rounded text-[11px] font-bold text-primary uppercase tracking-wider hover:bg-muted transition-colors">
                <span>{blocoName}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openBlocos[blocoName] ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-0.5">
                {renderBlocoTable(blocoRows)}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>
    </div>
  );
}
