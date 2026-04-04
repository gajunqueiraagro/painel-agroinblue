/**
 * Painel do Consultor — PC-100 (modelo oficial de auditoria)
 *
 * Abas: Valores Mensais | Médios do Mês | Acumulados | Média do Período
 * Cenários: Realizado | Previsto | Comparativo
 * Blocos colapsáveis por aba com indicadores oficiais.
 *
 * Regra de fonte: "Fechamento sempre vence."
 * Formatação: cab=inteiro, med2=2 casas, gmd=3 casas, peso3=3 casas, money=R$
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

// ─── Row definition ───
interface Row {
  indicador: string;
  format: PainelFormatType;
  valores: number[]; // 12 values
}

interface Bloco {
  nome: string;
  rows: Row[];
}

// ─── Monthly raw data struct ───
interface MonthlyData {
  cabIni: number[];
  cabFin: number[];
  entradas: number[];
  saidas: number[];
  pesoTotalIni: number[];
  pesoTotalFin: number[];
  pesoMedioIni: number[];
  pesoMedioFin: number[];
  gmd: number[];
  arrobasProd: number[];
  prodKg: number[];
  areaProd: number;
  valorRebIni: number[];
  valorRebFin: number[];
  entFin: number[];
  saiFin: number[];
  recPec: number[];
  custOper: number[];
  resCaixa: number[];
  recPecComp: number[];
  resOper: number[];
  ebitda: number[];
  varValorReb: number[];
}

function buildMonthlyData(
  lancPec: Lancamento[],
  saldosIniciais: SaldoInicial[],
  lancFin: FinanceiroLancamento[],
  ano: number,
  areaProdutiva: number,
  pesosPorMes: Record<string, Record<string, number>>,
  valorRebanhoMes: number[],
): MonthlyData {
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

  const pesoIniMesCalc = (m: number) => {
    if (m === 1) return saldosIniciais.filter(s => s.ano === ano).reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
    return pesoFinKgArr[m - 2] ?? 0;
  };
  const pesoFinMesCalc = (m: number) => pesoFinKgArr[m - 1] ?? 0;
  const diasNoMes = (m: number): number => new Date(ano, m, 0).getDate();

  const entradasKgMes = (m: number) => lancMes(m).filter(l => tiposEntrada.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  const saidasKgMes = (m: number) => lancMes(m).filter(l => tiposSaida.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);

  // Financeiro helpers
  const concFin = lancFin.filter(l => isFinConciliado(l));
  const finDoAno = concFin.filter(l => datePagtoAno(l) === ano);
  const finDoMes = (m: number) => finDoAno.filter(l => datePagtoMes(l) === m);

  const entFinMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const saiFinMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const recPecMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === 'Receitas Pecuárias').reduce((s, l) => s + Math.abs(l.valor), 0);
  const deducMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Dedução de Receitas').reduce((s, l) => s + Math.abs(l.valor), 0);
  const desembPecMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Desemb. Produtivo Pec.').reduce((s, l) => s + Math.abs(l.valor), 0);

  // Build arrays
  const mk = (fn: (m: number) => number) => Array.from({ length: 12 }, (_, i) => fn(i + 1));

  const cabIni = mk(cabIniMes);
  const cabFin = mk(cabFinMes);
  const entradas = mk(entradasCabMes);
  const saidas = mk(saidasCabMes);
  const pesoTotalIni = mk(pesoIniMesCalc);
  const pesoTotalFin = mk(pesoFinMesCalc);
  const pesoMedioIni = mk(m => { const c = cabIniMes(m); return c > 0 ? pesoIniMesCalc(m) / c : 0; });
  const pesoMedioFin = mk(m => { const c = cabFinMes(m); return c > 0 ? pesoFinMesCalc(m) / c : 0; });

  const arrobasProd = mk(m => {
    const pFin = pesoFinMesCalc(m);
    const pIni = pesoIniMesCalc(m);
    if (pFin <= 0 || pIni <= 0) return 0;
    return (pFin - pIni - entradasKgMes(m) + saidasKgMes(m)) / 30;
  });
  const prodKg = arrobasProd.map(v => v * 30);

  const gmd = mk(m => {
    const rebMedio = (cabIniMes(m) + cabFinMes(m)) / 2;
    const dias = diasNoMes(m);
    if (rebMedio <= 0 || dias <= 0) return 0;
    return (pesoFinMesCalc(m) - pesoIniMesCalc(m) - entradasKgMes(m) + saidasKgMes(m)) / rebMedio / dias;
  });

  const valorRebFin = valorRebanhoMes;
  const valorRebIni = Array.from({ length: 12 }, (_, i) => i === 0 ? 0 : (valorRebanhoMes[i - 1] || 0));

  const entFinArr = mk(entFinMes);
  const saiFinArr = mk(saiFinMes);
  const recPecArr = mk(recPecMes);
  const custOperArr = mk(desembPecMes);
  const resCaixaArr = mk(m => entFinMes(m) - saiFinMes(m));
  const recPecCompArr = mk(recPecMes);
  const resOperArr = mk(m => recPecMes(m) - deducMes(m) - desembPecMes(m));
  const ebitdaArr = mk(m => recPecMes(m) - deducMes(m) - desembPecMes(m));
  const varValorRebArr = mk(m => {
    const atual = valorRebanhoMes[m - 1] || 0;
    const anterior = m === 1 ? 0 : (valorRebanhoMes[m - 2] || 0);
    return atual - anterior;
  });

  return {
    cabIni, cabFin, entradas, saidas,
    pesoTotalIni, pesoTotalFin, pesoMedioIni, pesoMedioFin,
    gmd, arrobasProd, prodKg, areaProd: areaProdutiva,
    valorRebIni, valorRebFin,
    entFin: entFinArr, saiFin: saiFinArr, recPec: recPecArr,
    custOper: custOperArr, resCaixa: resCaixaArr,
    recPecComp: recPecCompArr, resOper: resOperArr,
    ebitda: ebitdaArr, varValorReb: varValorRebArr,
  };
}

// ─── Build blocks for each tab ───
function cumSum(arr: number[]): number[] {
  const r: number[] = [];
  let acc = 0;
  for (const v of arr) { acc += v; r.push(acc); }
  return r;
}
function rollingAvg(arr: number[]): number[] {
  const r: number[] = [];
  let sum = 0, n = 0;
  for (const v of arr) { sum += v; n++; r.push(n > 0 ? sum / n : 0); }
  return r;
}

function buildBlocosForTab(d: MonthlyData, tab: ViewTab): Bloco[] {
  const r = (indicador: string, format: PainelFormatType, raw: number[]): Row => {
    let valores: number[];
    switch (tab) {
      case 'mensal': valores = raw; break;
      case 'medio': valores = raw; break;
      case 'acumulado': valores = cumSum(raw); break;
      case 'media_periodo': valores = rollingAvg(raw); break;
    }
    return { indicador, format, valores };
  };

  const cabMedia = d.cabIni.map((v, i) => (v + d.cabFin[i]) / 2);
  const uaMedia = cabMedia.map((v, i) => {
    const pm = d.pesoMedioFin[i];
    return pm > 0 ? (v * pm) / 450 : 0;
  });
  const lotUaHa = uaMedia.map(v => d.areaProd > 0 ? v / d.areaProd : 0);
  const arrHa = d.arrobasProd.map(v => d.areaProd > 0 ? v / d.areaProd : 0);
  const desfruteCab = d.saidas;
  const desfrute_arr = d.saidas.map((v, i) => {
    const pm = d.pesoMedioFin[i];
    return pm > 0 ? (v * pm) / 30 : 0;
  });
  const valorPorCab = d.valorRebFin.map((v, i) => {
    const c = d.cabFin[i];
    return c > 0 ? v / c : 0;
  });
  const valorPorArr = d.valorRebFin.map((v, i) => {
    const pf = d.pesoTotalFin[i];
    return pf > 0 ? v / (pf / 30) : 0;
  });

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho inicial (cab)', 'cab', d.cabIni),
            r('Rebanho final (cab)', 'cab', d.cabFin),
            r('Entradas no mês (cab)', 'cab', d.entradas),
            r('Saídas no mês (cab)', 'cab', d.saidas),
          ],
        },
        {
          nome: 'Peso',
          rows: [
            r('Peso total inicial (kg)', 'peso3', d.pesoTotalIni),
            r('Peso total final (kg)', 'peso3', d.pesoTotalFin),
            r('Peso total inicial (@)', 'peso3', d.pesoTotalIni.map(v => v / 30)),
            r('Peso total final (@)', 'peso3', d.pesoTotalFin.map(v => v / 30)),
            r('Peso médio inicial (kg/cab)', 'med2', d.pesoMedioIni),
            r('Peso médio final (kg/cab)', 'med2', d.pesoMedioFin),
          ],
        },
        {
          nome: 'Valor do Rebanho',
          rows: [
            r('Valor do rebanho inicial', 'money', d.valorRebIni),
            r('Valor do rebanho final', 'money', d.valorRebFin),
            r('Valor por cabeça final', 'money', valorPorCab),
            r('Valor por arroba final', 'money', valorPorArr),
          ],
        },
      ];
    case 'medio':
      return [
        {
          nome: 'Desempenho',
          rows: [
            r('GMD do mês (kg/cab/dia)', 'gmd', d.gmd),
            r('Peso médio do rebanho (kg/cab)', 'med2', d.pesoMedioFin),
            r('UA média do mês', 'med2', uaMedia),
            r('Lotação média (UA/ha)', 'med2', lotUaHa),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Arrobas produzidas no mês', 'peso3', d.arrobasProd),
            r('Produção em kg no mês', 'peso3', d.prodKg),
            r('Arrobas por hectare no mês', 'med2', arrHa),
            r('Desfrute no mês (cab)', 'cab', desfruteCab),
            r('Desfrute no mês (@)', 'peso3', desfrute_arr),
          ],
        },
        {
          nome: 'Estrutura',
          rows: [
            r('Área produtiva média (ha)', 'med2', Array(12).fill(d.areaProd)),
            r('Rebanho médio do mês (cab)', 'cab', cabMedia.map(Math.round)),
          ],
        },
      ];
    case 'acumulado':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Entradas acumuladas (cab)', 'cab', d.entradas),
            r('Saídas acumuladas (cab)', 'cab', d.saidas),
            r('Saldo acumulado do rebanho', 'cab', d.entradas.map((v, i) => v - d.saidas[i])),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Arrobas produzidas acum.', 'peso3', d.arrobasProd),
            r('Produção em kg acum.', 'peso3', d.prodKg),
            r('Arrobas/ha acum.', 'med2', arrHa),
            r('Desfrute acum. (cab)', 'cab', desfruteCab),
            r('Desfrute acum. (@)', 'peso3', desfrute_arr),
          ],
        },
        {
          nome: 'Financeiro no Caixa',
          rows: [
            r('Entradas financeiras acum.', 'money', d.entFin),
            r('Saídas financeiras acum.', 'money', d.saiFin),
            r('Receitas pecuárias acum.', 'money', d.recPec),
            r('Resultado caixa acum.', 'money', d.resCaixa),
          ],
        },
        {
          nome: 'Financeiro por Competência',
          rows: [
            r('Receita pecuária acum.', 'money', d.recPecComp),
            r('Resultado operacional acum.', 'money', d.resOper),
            r('EBITDA acum.', 'money', d.ebitda),
            r('Variação valor rebanho acum.', 'money', d.varValorReb),
          ],
        },
      ];
    case 'media_periodo':
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            r('GMD médio do período', 'gmd', d.gmd),
            r('Peso médio do período', 'med2', d.pesoMedioFin),
            r('UA média do período', 'med2', uaMedia),
            r('Lotação média do período', 'med2', lotUaHa),
          ],
        },
        {
          nome: 'Produção Média',
          rows: [
            r('Arrobas/ha média do período', 'med2', arrHa),
            r('Produção média mensal (@)', 'peso3', d.arrobasProd),
            r('Produção média mensal (kg)', 'peso3', d.prodKg),
            r('Desfrute médio do período', 'cab', desfruteCab),
          ],
        },
        {
          nome: 'Financeiro Médio',
          rows: [
            r('Receita média mensal', 'money', d.recPec),
            r('Resultado oper. médio mensal', 'money', d.resOper),
            r('EBITDA médio mensal', 'money', d.ebitda),
            r('Resultado caixa médio mensal', 'money', d.resCaixa),
          ],
        },
      ];
  }
}

// ─── Total logic ───
function totalForRow(row: Row, tab: ViewTab): number {
  if (tab === 'acumulado' || tab === 'media_periodo') {
    // last non-zero or last value
    return row.valores[11] ?? 0;
  }
  return row.valores.reduce((a, b) => a + b, 0);
}

// ─── Export ───
function exportToExcel(blocos: Bloco[], ano: number, fazendaNome: string, tab: ViewTab) {
  const filename = `Painel_Consultor_${fazendaNome.replace(/\s+/g, '_')}_${ano}.xlsx`;
  const sheetRows = blocos.flatMap(b =>
    b.rows.map(row => {
      const base: Record<string, string | number> = {
        Bloco: b.nome,
        Indicador: row.indicador,
      };
      MESES_LABELS.forEach((mes, i) => { base[mes] = row.valores[i] ?? 0; });
      base['Total'] = totalForRow(row, tab);
      return base;
    }),
  );
  const cols = [{ wch: 24 }, { wch: 30 }, ...Array(13).fill(null).map(() => ({ wch: 14 }))];
  triggerXlsxDownload({ filename, sheets: [{ name: 'Painel', rows: sheetRows, cols }] });
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
  const [openBlocos, setOpenBlocos] = useState<Record<string, boolean>>({});

  const anoNum = Number(ano);
  const anosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    s.add(String(new Date().getFullYear()));
    s.add(String(new Date().getFullYear() - 1));
    saldosIniciais.forEach(si => s.add(String(si.ano)));
    return Array.from(s).sort().reverse();
  }, [saldosIniciais]);

  const fazendaId = fazendaAtual?.id;

  // Load peso data
  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__' || categorias.length === 0) { setPesosPorMes({}); return; }
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
        ? fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id) : [fazendaId];
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

  const monthlyData = useMemo(() =>
    buildMonthlyData(lancPec, saldosIniciais, lancFin, anoNum, areaProdutiva, pesosPorMes, valorRebanhoMes),
    [lancPec, saldosIniciais, lancFin, anoNum, areaProdutiva, pesosPorMes, valorRebanhoMes],
  );

  const blocos = useMemo(() => buildBlocosForTab(monthlyData, viewTab), [monthlyData, viewTab]);

  // Default first block open
  useEffect(() => {
    if (blocos.length > 0) {
      setOpenBlocos(prev => {
        const next: Record<string, boolean> = {};
        blocos.forEach((b, i) => {
          next[b.nome] = prev[b.nome] !== undefined ? prev[b.nome] : i === 0;
        });
        return next;
      });
    }
  }, [blocos]);

  const fazendaNome = isGlobal ? 'Global' : (fazendaAtual?.nome || 'Fazenda');

  const handleExport = useCallback(() => {
    try { exportToExcel(blocos, anoNum, fazendaNome, viewTab); }
    catch { toast.error('Não foi possível exportar.'); }
  }, [blocos, anoNum, fazendaNome, viewTab]);

  const toggleBloco = (nome: string) => setOpenBlocos(prev => ({ ...prev, [nome]: !prev[nome] }));

  const VIEW_TABS: { id: ViewTab; label: string }[] = [
    { id: 'mensal', label: 'Valores Mensais' },
    { id: 'medio', label: 'Médios do Mês' },
    { id: 'acumulado', label: 'Acumulados' },
    { id: 'media_periodo', label: 'Média do Período' },
  ];

  // ─── Table render ───
  const renderBlocoTable = (blocoRows: Row[]) => (
    <div className="overflow-x-auto border rounded border-border/40">
      <table className="w-full text-[10px] border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '160px', minWidth: '160px' }} />
          {MESES_LABELS.map((_, i) => <col key={i} style={{ minWidth: '52px' }} />)}
          <col style={{ minWidth: '60px' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted border-b">
            <th className="sticky left-0 z-20 bg-muted text-left text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border-r border-border/30">Indicador</th>
            {MESES_LABELS.map(m => (
              <th key={m} className="text-right text-[9px] font-semibold uppercase tracking-wider px-0.5 py-0.5">{m}</th>
            ))}
            <th className="text-right text-[9px] font-bold uppercase tracking-wider px-0.5 py-0.5 border-l border-border/30">Total</th>
          </tr>
        </thead>
        <tbody>
          {blocoRows.map((row, idx) => {
            const tot = totalForRow(row, viewTab);
            return (
              <tr key={idx} className={`border-b border-border/20 hover:bg-muted/20 ${idx % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                <td className="sticky left-0 z-10 bg-card text-[10px] font-medium py-0.5 px-1.5 leading-tight truncate border-r border-border/20">
                  {row.indicador}
                </td>
                {row.valores.map((v, i) => (
                    <td key={i} className="text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px]">
                      {formatPainel(v, row.format)}
                    </td>
                ))}
                <td className="text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px] font-bold border-l border-border/20">
                  {formatPainel(tot, row.format)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-full mx-auto animate-fade-in pb-16 flex flex-col h-full">
      {/* ── Sticky toolbar + tabs ── */}
      <div className="sticky top-0 z-30 bg-background border-b border-border/40 px-2 pt-2 pb-0 space-y-1">
        {/* Toolbar */}
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
            {(['realizado', 'previsto'] as Cenario[]).map(c => (
              <button
                key={c}
                onClick={() => setCenario(c)}
                className={`px-2 text-[11px] font-semibold h-full transition-colors capitalize ${
                  cenario === c
                    ? c === 'realizado'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted text-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
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

        {/* View tabs */}
        <div className="flex gap-0 overflow-x-auto">
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
      </div>

      {/* ── Content: collapsible blocks ── */}
      <div className="px-2 space-y-1 mt-1 flex-1 overflow-auto">
        {blocos.map(b => (
          <Collapsible
            key={b.nome}
            open={openBlocos[b.nome] ?? false}
            onOpenChange={() => toggleBloco(b.nome)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1 bg-muted/60 rounded text-[11px] font-bold text-primary uppercase tracking-wider hover:bg-muted transition-colors">
              <span>{b.nome}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openBlocos[b.nome] ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-0.5">
              {renderBlocoTable(b.rows)}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
