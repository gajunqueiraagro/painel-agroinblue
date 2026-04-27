/**
 * Painel do Consultor — PC-100 (modelo oficial de auditoria)
 *
 * Abas: Valores Mensais | Médios do Mês | Acumulados | Média do Período
 * Cenários: Realizado | Meta
 * Blocos colapsáveis por aba com indicadores oficiais.
 *
 * Regra de fonte: "Fechamento sempre vence."
 * Formatação: cab=inteiro, gmd=3 casas, padrao/med2=2 casas, money=R$
 *
 * REGRA CRÍTICA: Meta NUNCA faz fallback para Realizado.
 * Se não há fonte meta, a célula fica vazia.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useMetaGmd, type MetaGmdRow } from '@/hooks/useMetaGmd';
import { useSnapshotStatus, type SnapshotStatusValue } from '@/hooks/useSnapshotStatus';
import { SnapshotStatusBanner } from '@/components/SnapshotStatusBanner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ArrowLeft, Download, ChevronDown, Info, ClipboardCheck } from 'lucide-react';
import { useFazenda } from '@/contexts/FazendaContext';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useStatusPilares, BLOCO_PILAR_MAP, getPilarBadgeConfig, getPilarTooltipText, type StatusPilares as StatusPilaresType } from '@/hooks/useStatusPilares';
import { DivergenciaP1Dialog } from '@/components/DivergenciaP1Dialog';
import { ReabrirP1Dialog } from '@/components/ReabrirP1Dialog';
import { useFinanceiro, type FinanceiroLancamento } from '@/hooks/useFinanceiro';
import { usePlanejamentoFinanceiro, type SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { usePastos } from '@/hooks/usePastos';
import { useRebanhoOficial, indexByMes, type ZootMensal, type ZootCategoriaMensal, totalizarPorMes as totalizarViewPorMes } from '@/hooks/useRebanhoOficial';
import { CATEGORIAS } from '@/types/cattle';
import { formatPainel, type PainelFormatType } from '@/lib/calculos/formatters';
import {
  calcAreaProdutivaPecuaria,
} from '@/lib/calculos/zootecnicos';
import { supabase } from '@/integrations/supabase/client';
import {
  isRealizado as isFinRealizado,
  isEntrada as isFinEntrada,
  isSaida as isFinSaida,
  classificarEntrada,
  classificarSaida,
  datePagtoMes,
  datePagtoAno,
} from '@/lib/financeiro/classificacao';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import { CATALOGO_INDICADORES, getFonteStatusLabel, type FonteIndicador, type IndicadorMeta } from '@/lib/painelConsultor/indicadorCatalogo';
import { warnIndicadoresSemCatalogo } from '@/lib/painelConsultor/validarIndicadores';
import { agregaSnapshotsGlobal } from '@/lib/painelConsultor/consolidacaoGlobal';
import { useCliente } from '@/contexts/ClienteContext';

// ─── Constants ───
const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Trimester border: before Apr(3), Jul(6), Out(9)
const TRIM_BORDER_INDEXES = new Set([3, 6, 9]);

type ViewTab = 'mensal' | 'medio' | 'acumulado' | 'media_periodo';
type Cenario = 'realizado' | 'meta';

interface Props {
  onBack: () => void;
  onTabChange?: (tab: string) => void;
  filtroGlobal?: { ano: string; mes: number };
  metaConsolidacao?: MetaCategoriaMes[];
}

// ─── Row definition ───
interface Row {
  indicador: string;
  indicadorId?: string;  // maps to CATALOGO_INDICADORES
  format: PainelFormatType;
  valores: number[];     // 12 values
  noTotal?: boolean;     // true = total column stays blank (stock indicators)
}

interface Bloco {
  nome: string;
  rows: Row[];
}

// ─── Snapshot de peso validado ───
interface PesoSnapshot {
  cabecas: number[];    // 12 ou 13 valores
  pesoMedio: number[];
  arrobas: number[];
}

/**
 * Converte dados da view oficial (vw_zoot_categoria_mensal) para MetaCategoriaMes[].
 * Fonte única: elimina dependência do cálculo local useMetaConsolidacao.
 */
function viewToMetaCategoriaMes(rows: ZootCategoriaMensal[]): MetaCategoriaMes[] {
  return rows.map(r => {
    const catDef = CATEGORIAS.find(c => c.value === r.categoria_codigo);
    return {
      categoria: r.categoria_codigo as any,
      categoriaLabel: catDef?.label || r.categoria_nome,
      mes: String(r.mes).padStart(2, '0'),
      si: r.saldo_inicial,
      ee: r.entradas_externas,
      se: r.saidas_externas,
      ei: r.evol_cat_entrada,
      siInternas: r.evol_cat_saida,
      sf: r.saldo_final,
      cabMedias: (r.saldo_inicial + r.saldo_final) / 2,
      pesoInicial: r.peso_total_inicial,
      pesoEntradas: r.peso_entradas_externas + r.peso_evol_cat_entrada,
      pesoSaidas: r.peso_saidas_externas + r.peso_evol_cat_saida,
      gmd: r.gmd || 0,
      dias: r.dias_mes,
      producaoBio: r.producao_biologica,
      pesoTotalFinal: r.peso_total_final,
      pesoMedioFinal: r.peso_medio_final,
    };
  });
}


const TIPOS_DESFRUTE = new Set(['abate', 'venda', 'consumo']);

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
  desfruteCab: number[];
  desfrute_arr: number[];
}

function buildMonthlyDataFromView(
  viewTotals: ReturnType<typeof totalizarViewPorMes>,
  viewRows: import('@/hooks/useZootCategoriaMensal').ZootCategoriaMensal[],
  lancFin: FinanceiroLancamento[],
  lancPec: Lancamento[],
  ano: number,
  areaProdutiva: number,
  valorRebanhoMes: number[],
  isGlobal = false,
): MonthlyData {
  const mk = (fn: (m: number) => number) => Array.from({ length: 12 }, (_, i) => fn(i + 1));
  const diasNoMes = (m: number): number => new Date(ano, m, 0).getDate();
  const mesPrefix = (m: number) => `${ano}-${String(m).padStart(2, '0')}`;

  // Zootechnical data from official view
  const cabIni = mk(m => viewTotals[m]?.saldo_inicial ?? 0);
  const cabFin = mk(m => viewTotals[m]?.saldo_final ?? 0);
  // REGRA OFICIAL: entradas/saídas = apenas fluxo externo real da fazenda
  // Evol. Cat. (reclassificação interna) NÃO entra nos indicadores de fluxo
  let entradas = mk(m => viewTotals[m]?.entradas_externas ?? 0);
  let saidas = mk(m => viewTotals[m]?.saidas_externas ?? 0);

  // ── GLOBAL: neutralizar transferências inter-fazendas ──
  // No nível Global, transferências entre fazendas do grupo são movimento interno
  // e não devem inflar entradas nem saídas do sistema.
  if (isGlobal) {
    const transferRealizado = lancPec.filter(l =>
      l.cenario !== 'meta' &&
      (l.tipo === 'transferencia_entrada' || l.tipo === 'transferencia_saida') &&
      l.data.startsWith(String(ano)),
    );
    const transfEntMes = mk(m =>
      transferRealizado
        .filter(l => l.tipo === 'transferencia_entrada' && l.data.startsWith(mesPrefix(m)))
        .reduce((s, l) => s + l.quantidade, 0),
    );
    const transfSaiMes = mk(m =>
      transferRealizado
        .filter(l => l.tipo === 'transferencia_saida' && l.data.startsWith(mesPrefix(m)))
        .reduce((s, l) => s + l.quantidade, 0),
    );
    entradas = entradas.map((v, i) => Math.max(0, v - transfEntMes[i]));
    saidas = saidas.map((v, i) => Math.max(0, v - transfSaiMes[i]));
  }
  const pesoTotalIni = mk(m => viewTotals[m]?.peso_total_inicial ?? 0);
  const pesoTotalFin = mk(m => viewTotals[m]?.peso_total_final ?? 0);
  const pesoMedioIni = mk(m => { const c = cabIni[m - 1]; return c > 0 ? pesoTotalIni[m - 1] / c : 0; });
  const pesoMedioFin = mk(m => { const c = cabFin[m - 1]; return c > 0 ? pesoTotalFin[m - 1] / c : 0; });

  // GMD: weighted average from view rows
  const gmd = mk(m => {
    const mesRows = viewRows.filter(r => r.mes === m);
    const cabMedia = (cabIni[m - 1] + cabFin[m - 1]) / 2;
    if (cabMedia <= 0) return 0;
    const prodBio = mesRows.reduce((s, r) => s + r.producao_biologica, 0);
    const dias = diasNoMes(m);
    return dias > 0 ? prodBio / cabMedia / dias : 0;
  });

  const arrobasProd = mk(m => (viewTotals[m]?.producao_biologica ?? 0) / 30);
  const prodKg = mk(m => viewTotals[m]?.producao_biologica ?? 0);

  // ── Desfrute: apenas abate + venda + consumo (REGRA OFICIAL) ──
  const desfruteLancs = lancPec.filter(l =>
    TIPOS_DESFRUTE.has(l.tipo) && l.cenario !== 'meta',
  );
  // mesPrefix already defined above
  const desfruteCab = mk(m => desfruteLancs
    .filter(l => l.data.startsWith(mesPrefix(m)))
    .reduce((s, l) => s + l.quantidade, 0));
  const desfrute_arr = mk(m => desfruteLancs
    .filter(l => l.data.startsWith(mesPrefix(m)))
    .reduce((s, l) => s + (l.quantidade * (l.pesoMedioKg || 0)) / 30, 0));

  // ── Receita pecuária por competência: valorTotal de abate+venda+consumo ──
  const recPecCompMes = (m: number) => desfruteLancs
    .filter(l => l.data.startsWith(mesPrefix(m)))
    .reduce((s, l) => s + Math.abs(l.valorTotal || 0), 0);

  // Financial data (kept as-is from useFinanceiro)
  const concFin = lancFin.filter(l => isFinRealizado(l));
  const finDoAno = concFin.filter(l => datePagtoAno(l) === ano);
  const finDoMes = (m: number) => finDoAno.filter(l => datePagtoMes(l) === m);

  const entFinMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const saiFinMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l)).reduce((s, l) => s + Math.abs(l.valor), 0);
  const recPecMes = (m: number) => finDoMes(m).filter(l => isFinEntrada(l) && classificarEntrada(l) === 'Receitas Pecuárias').reduce((s, l) => s + Math.abs(l.valor), 0);
  const deducMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Dedução de Receitas').reduce((s, l) => s + Math.abs(l.valor), 0);
  const desembPecMes = (m: number) => finDoMes(m).filter(l => isFinSaida(l) && classificarSaida(l) === 'Desemb. Produtivo Pec.').reduce((s, l) => s + Math.abs(l.valor), 0);

  // valorRebanhoMes has 13 elements: [0]=Dec prev year, [1]=Jan, ..., [12]=Dec
  const valorRebFin = valorRebanhoMes.slice(1);
  const valorRebIni = valorRebanhoMes.slice(0, 12);

  const entFinArr = mk(entFinMes);
  const saiFinArr = mk(saiFinMes);
  const recPecArr = mk(recPecMes);
  const custOperArr = mk(desembPecMes);
  const resCaixaArr = mk(m => entFinMes(m) - saiFinMes(m));
  const recPecCompArr = mk(recPecCompMes);
  const resOperArr = mk(m => recPecCompMes(m) - deducMes(m) - desembPecMes(m));
  const ebitdaArr = mk(m => recPecCompMes(m) - deducMes(m) - desembPecMes(m));
  const varValorRebArr = mk(m => {
    const atual = valorRebFin[m - 1] || 0;
    const anterior = valorRebIni[m - 1] || 0;
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
    desfruteCab, desfrute_arr,
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

/**
 * GMD médio do período acumulado (Jan → N).
 * Fórmula oficial:
 *   GMD período(N) = Σ producao_biologica(1..N)
 *                  ÷ média(cabMedia(1..N))
 *                  ÷ Σ dias(1..N)
 *
 * Retorna array de 12 posições, posição i = GMD acumulado de Jan até mês i+1.
 * Usa NaN quando não há rebanho médio ou dias acumulados (sem dado válido).
 */
function computePeriodGmd(prodBio: number[], cabMedia: number[], dias: number[]): number[] {
  const out: number[] = [];
  let prodAcc = 0;
  let cabSum = 0;
  let cabCount = 0;
  let diasAcc = 0;
  for (let i = 0; i < 12; i++) {
    const pb = Number(prodBio[i]);
    const cm = Number(cabMedia[i]);
    const d = Number(dias[i]) || 0;
    if (!isNaN(pb)) prodAcc += pb;
    if (!isNaN(cm) && cm > 0) { cabSum += cm; cabCount++; }
    diasAcc += d;
    const cabMediaPeriodo = cabCount > 0 ? cabSum / cabCount : 0;
    if (cabMediaPeriodo <= 0 || diasAcc <= 0) { out.push(NaN); continue; }
    out.push(prodAcc / cabMediaPeriodo / diasAcc);
  }
  return out;
}

/**
 * Dados financeiros META agregados do planejamento_financeiro.
 * Calculado por agregarGridMetaPainelConsultor. Uso exclusivo do PainelConsultorTab — não exportar.
 *
 * entradas  = macro 'Receita Operacional' + 'Entrada Financeira'
 * saidas    = macro 'Custeio Produção' + 'Deduções de Receitas' + 'Dividendos'
 *             + 'Investimento em Bovinos' + 'Investimento na Fazenda' + 'Saída Financeira'
 * recPec    = grupo 'Receita Pecuária' APENAS dentro de macro 'Receita Operacional'
 * custoProd = macro 'Custeio Produção'
 *
 * ATENÇÃO FASE 1D (DRE futura):
 *   'Entrada Financeira' entra APENAS nos indicadores de caixa (entradas, resCaixa).
 *   NÃO deve entrar em Receita Operacional da DRE nem em recPec.
 *   Na Fase 1D, receita operacional da DRE = apenas macro 'Receita Operacional'.
 */
interface FinMetaPainel {
  entradas: number[];
  saidas: number[];
  recPec: number[];
  custoProd: number[];
}

/**
 * Agrega o planejamento META em indicadores financeiros para o PainelConsultorTab.
 *
 * Fonte: planejamento_financeiro via usePlanejamentoFinanceiro.buildGrid()
 *
 * Auto lines aplicadas exatamente como em PlanejamentoFinanceiroTab:
 *   effectiveMeses[i] = g.meses[i] + autoMeses[i]
 *   Prioridade: lancNutricao > lancProjetos > lancFinanciamento > lancRebanho
 *
 * Classificação por macro_custo (strings reais do banco financeiro_plano_contas):
 *   MACROS_ENTRADA: 'Receita Operacional', 'Entrada Financeira'
 *   MACROS_SAIDA:   'Custeio Produção', 'Deduções de Receitas', 'Dividendos',
 *                   'Investimento em Bovinos', 'Investimento na Fazenda', 'Saída Financeira'
 *   Excluído: 'Transferências'
 *
 * IMPORTANTE — separação de escopos:
 *   'Entrada Financeira' entra em entradas e resCaixa (indicadores de caixa).
 *   NÃO entra em recPec nem custoProd.
 *   Na Fase 1D (DRE futura), receita operacional = apenas macro 'Receita Operacional'.
 *
 * Retorna null quando grid.length === 0 → NaN → '-' na UI.
 * Retorna zeros quando planejamento existe e soma for zero → R$ 0,00.
 * Não exportar.
 */
function agregarGridMetaPainelConsultor(
  grid: SubcentroGrid[],
  lancNutricao: Map<string, number[]>,
  lancFinanciamento: Map<string, number[]>,
  lancRebanho: Map<string, number[]>,
  lancProjetos: Map<string, number[]>,
): FinMetaPainel | null {
  if (grid.length === 0) return null;

  const MACROS_ENTRADA = new Set([
    'Receita Operacional',
    'Entrada Financeira',
  ]);
  const MACROS_SAIDA = new Set([
    'Custeio Produção',
    'Deduções de Receitas',
    'Dividendos',
    'Investimento em Bovinos',
    'Investimento na Fazenda',
    'Saída Financeira',
  ]);

  const z12 = (): number[] => new Array(12).fill(0);
  const entradas  = z12();
  const saidas    = z12();
  const recPec    = z12();
  const custoProd = z12();

  for (const g of grid) {
    const macro = g.macro_custo ?? '';
    const grupo = g.grupo_custo ?? '';

    // Auto lines — mesma lógica de PlanejamentoFinanceiroTab
    const autoMeses: number[] | undefined =
      lancNutricao.has(g.subcentro)        ? lancNutricao.get(g.subcentro)
      : lancProjetos.has(g.subcentro)      ? lancProjetos.get(g.subcentro)
      : lancFinanciamento.has(g.subcentro) ? lancFinanciamento.get(g.subcentro)
      : lancRebanho.has(g.subcentro)       ? lancRebanho.get(g.subcentro)
      : undefined;

    const effectiveMeses = autoMeses
      ? g.meses.map((v, i) => v + (autoMeses[i] || 0))
      : g.meses;

    for (let i = 0; i < 12; i++) {
      const v = effectiveMeses[i] || 0;
      if (MACROS_ENTRADA.has(macro)) {
        entradas[i] += v;
        // recPec: apenas 'Receita Operacional' com grupo 'Receita Pecuária'
        // 'Entrada Financeira' NÃO entra aqui (reservado DRE Fase 1D)
        if (macro === 'Receita Operacional' && grupo === 'Receita Pecuária') {
          recPec[i] += v;
        }
      } else if (MACROS_SAIDA.has(macro)) {
        saidas[i] += v;
        if (macro === 'Custeio Produção') custoProd[i] += v;
      }
      // 'Transferências' → excluído de ambos os lados
    }
  }

  return { entradas, saidas, recPec, custoProd };
}

function buildBlocosForTab(d: MonthlyData, tab: ViewTab, realValorCab?: number[], realPrecoArr?: number[], pesoSnap?: PesoSnapshot, dezPesoSnap?: number): Bloco[] {
  const r = (indicador: string, format: PainelFormatType, raw: number[], indicadorId?: string, noTotal?: boolean): Row => {
    let valores: number[];
    switch (tab) {
      case 'mensal': valores = raw; break;
      case 'medio': valores = raw; break;
      case 'acumulado': valores = cumSum(raw); break;
      case 'media_periodo': valores = rollingAvg(raw); break;
    }
    return { indicador, format, valores, indicadorId, noTotal };
  };

  // REGRA SOBERANA: snapshot validado SEMPRE vence sobre views para cabeças, peso e arrobas
  const hasSnap = pesoSnap && pesoSnap.arrobas.some(v => v > 0);

  // Cabeças: snapshot validado sobrescreve view quando disponível
  const hasCabSnap = hasSnap && pesoSnap!.cabecas.some(v => v > 0);
  const cabFin = hasCabSnap
    ? pesoSnap!.cabecas.map((c, i) => c > 0 ? c : d.cabFin[i])
    : d.cabFin;
  // Cab inicial: Dez do ano anterior vem do snapshot[0] do array de 13; Fev+ = cabFin do mês anterior
  const cabIni = hasCabSnap
    ? [d.cabIni[0], ...cabFin.slice(0, 11)]
    : d.cabIni;

  // Peso: snapshot validado sobrescreve view
  const pesoTotalFin = hasSnap
    ? pesoSnap!.arrobas.map(a => a * 30)
    : d.pesoTotalFin;
  const pesoTotalIni = hasSnap
    ? [(dezPesoSnap ?? d.pesoTotalIni[0]), ...pesoTotalFin.slice(0, 11)]
    : d.pesoTotalIni;
  const pesoMedioFin = hasSnap
    ? pesoSnap!.pesoMedio
    : d.pesoMedioFin;
  const pesoMedioIni = hasSnap
    ? [(dezPesoSnap != null && cabIni[0] > 0 ? dezPesoSnap / cabIni[0] : d.pesoMedioIni[0]), ...pesoMedioFin.slice(0, 11)]
    : d.pesoMedioIni;

  const cabMedia = cabIni.map((v, i) => (v + cabFin[i]) / 2);
  const uaMedia = cabMedia.map((v, i) => {
    const pm = pesoMedioFin[i];
    return pm > 0 ? (v * pm) / 450 : 0;
  });
  const lotUaHa = uaMedia.map(v => d.areaProd > 0 ? v / d.areaProd : 0);
  const arrHa = d.arrobasProd.map(v => d.areaProd > 0 ? v / d.areaProd : 0);
  // Custo/@prod acumulado: custeio acumulado / arrobas produzidas acumuladas no período
  const custoPorArrAcum = (() => {
    const custAcum = cumSum(d.custOper);
    const arrAcum = cumSum(d.arrobasProd);
    return custAcum.map((c, i) => arrAcum[i] > 0 ? c / arrAcum[i] : 0);
  })();
  const desfruteCab = d.desfruteCab;
  const desfrute_arr = d.desfrute_arr;
  // Use persisted snapshot values when available; fallback to calculation
  const valorPorCab = realValorCab && realValorCab.some(v => v > 0)
    ? d.valorRebFin.map((v, i) => realValorCab[i] || (cabFin[i] > 0 ? v / cabFin[i] : 0))
    : d.valorRebFin.map((v, i) => { const c = cabFin[i]; return c > 0 ? v / c : 0; });
  const valorPorArr = realPrecoArr && realPrecoArr.some(v => v > 0)
    ? d.valorRebFin.map((v, i) => realPrecoArr[i] || (pesoTotalFin[i] > 0 ? v / (pesoTotalFin[i] / 30) : 0))
    : d.valorRebFin.map((v, i) => { const pf = pesoTotalFin[i]; return pf > 0 ? v / (pf / 30) : 0; });

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Reb. inicial (cab)', 'cab', cabIni, 'reb_inicial', true),
            r('Reb. final (cab)', 'cab', cabFin, 'reb_final', true),
            r('Entradas (cab)', 'cab', d.entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', d.saidas, 'saidas_cab'),
          ],
        },
        {
          nome: 'Peso',
          rows: [
            r('Peso ini. (kg)', 'cab', pesoTotalIni, 'peso_ini_kg', true),
            r('Peso final (kg)', 'cab', pesoTotalFin, 'peso_fin_kg', true),
            r('Peso fin. cab (kg)', 'med2', pesoTotalFin.map((p, i) => cabFin[i] > 0 ? p / cabFin[i] : NaN), 'peso_fin_cab_kg', true),
            r('Peso ini. (@)', 'cab', pesoTotalIni.map(v => Math.round(v / 30)), 'peso_ini_arr', true),
            r('Peso final (@)', 'cab', pesoTotalFin.map(v => Math.round(v / 30)), 'peso_fin_arr', true),
            r('Peso méd. ini.', 'med2', pesoMedioIni, 'peso_med_ini', true),
            r('Peso méd. final', 'med2', pesoMedioFin, 'peso_med_fin', true),
          ],
        },
        {
          nome: 'Valor do Rebanho',
          rows: [
            r('Valor reb. inicial', 'moneyInt', d.valorRebIni, 'valor_reb_ini', true),
            r('Valor reb. final', 'moneyInt', d.valorRebFin, 'valor_reb_fin', true),
            r('Valor/cab final', 'money', valorPorCab, 'valor_cab_fin', true),
            r('Valor/@ final', 'money', valorPorArr, 'valor_arr_fin', true),
          ],
        },
      ];
    case 'medio':
      return [
        {
          nome: 'Desempenho',
          rows: [
            r('GMD (kg/cab/dia)', 'gmd', d.gmd, 'gmd', true),
            r('Peso méd. reb.', 'med2', pesoMedioFin, 'peso_med_reb', true),
            r('UA média', 'med2', uaMedia, 'ua_media', true),
            r('Lotação (UA/ha)', 'med2', lotUaHa, 'lotacao', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas', 'padrao', d.arrobasProd, 'arrobas_prod'),
            r('Produção (kg)', 'padrao', d.prodKg, 'prod_kg'),
            r('@/ha', 'med2', arrHa, 'arr_ha'),
            r('Custo/@prod', 'money', custoPorArrAcum, 'custo_arr_prod', true),
          ],
        },
        {
          nome: 'Estrutura',
          rows: [
            r('Área prod. (ha)', 'med2', Array(12).fill(d.areaProd), 'area_prod', true),
            r('Reb. médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
          ],
        },
      ];
    case 'acumulado':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Entradas acum. (cab)', 'cab', d.entradas, 'entradas_acum'),
            r('Saídas acum. (cab)', 'cab', d.saidas, 'saidas_acum'),
            r('Saldo acum. reb.', 'cab', d.entradas.map((v, i) => v - d.saidas[i]), 'saldo_acum'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas acum.', 'padrao', d.arrobasProd, 'arrobas_acum'),
            r('Produção kg acum.', 'padrao', d.prodKg, 'prod_kg_acum'),
            r('@/ha acum.', 'med2', arrHa, 'arr_ha_acum'),
            r('Desfrute acum. (cab)', 'cab', desfruteCab, 'desfrute_acum_cab'),
            r('Desfrute acum. (@)', 'padrao', desfrute_arr, 'desfrute_acum_arr'),
          ],
        },
        {
          nome: 'Financeiro no Caixa',
          rows: [
            r('Entradas fin. acum.', 'money', d.entFin, 'ent_fin_acum'),
            r('Saídas fin. acum.', 'money', d.saiFin, 'sai_fin_acum'),
            r('Rec. pec. acum.', 'money', d.recPec, 'rec_pec_acum'),
            r('Res. caixa acum.', 'money', d.resCaixa, 'res_caixa_acum'),
          ],
        },
        {
          nome: 'Financeiro por Competência',
          rows: [
            r('Rec. pec. comp. acum.', 'money', d.recPecComp, 'rec_pec_comp_acum'),
            r('Res. oper. acum.', 'money', d.resOper, 'res_oper_acum'),
            r('EBITDA acum.', 'money', d.ebitda, 'ebitda_acum'),
            r('Var. valor reb.', 'money', d.varValorReb, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo': {
      // Período acumulado: rebanho médio (média das cabMedia mensais) e GMD período correto.
      const diasMes = Array.from({ length: 12 }, (_, i) => new Date(new Date().getFullYear(), i + 1, 0).getDate());
      const gmdPeriodo = computePeriodGmd(d.prodKg, cabMedia, diasMes);
      const rebMedioPeriodoVals = rollingAvg(cabMedia);
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            { indicador: 'Rebanho médio período (cab)', format: 'cab', valores: rebMedioPeriodoVals.map(v => Math.round(v)), indicadorId: 'reb_medio_periodo', noTotal: true },
            { indicador: 'GMD médio período', format: 'gmd', valores: gmdPeriodo, indicadorId: 'gmd_medio', noTotal: true },
            r('Peso médio período', 'med2', pesoMedioFin, 'peso_medio_periodo', true),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo', true),
            r('Lotação média', 'med2', lotUaHa, 'lotacao_media', true),
          ],
        },
        {
          nome: 'Produção Média',
          rows: [
            r('@/ha média período', 'med2', arrHa, 'arr_ha_media', true),
            r('Prod. média (@)', 'padrao', d.arrobasProd, 'prod_media_arr', true),
            r('Prod. média (kg)', 'padrao', d.prodKg, 'prod_media_kg', true),
          ],
        },
        {
          nome: 'Financeiro Médio',
          rows: [
            r('Receita média', 'money', d.recPec, 'receita_media', true),
            r('Res. oper. médio', 'money', d.resOper, 'res_oper_medio', true),
            r('EBITDA médio', 'money', d.ebitda, 'ebitda_medio', true),
            r('Res. caixa médio', 'money', d.resCaixa, 'res_caixa_medio', true),
          ],
        },
      ];
    }
}
}

// ─── Build blocos from vw_zoot_fazenda_mensal (for Meta cenário) ───
function buildBlocosFromZootMensal(rows: ZootMensal[], tab: ViewTab, valorRebanhoMetaMes?: number[], valorRebanhoMetaMesAnteriorOuDez?: number[], metaValorCabMes?: number[], metaPrecoArrMes?: number[], pesoSnap?: PesoSnapshot, dezRealizadoSnap?: { cabecas: number; pesoMedioKg: number; arrobas: number }, finMeta?: FinMetaPainel | null): Bloco[] {
  const byMes = indexByMes(rows);
  const get = (field: keyof ZootMensal): number[] =>
    Array.from({ length: 12 }, (_, i) => {
      const m = byMes[String(i + 1).padStart(2, '0')];
      return m ? (Number(m[field]) || 0) : 0;
    });

  const cabIniRaw = get('cabecas_inicio');
  const cabFin = get('cabecas_final');
  const entradas = get('entradas');
  const saidas = get('saidas');
  const pesoIniRaw = get('peso_inicio_kg');
  const pesoFinRaw = get('peso_total_final_kg');
  const pesoMedFinRaw = get('peso_medio_final_kg');

  // Override cabIni[0] (Jan) with Dec realizado validado
  const cabIni = [...cabIniRaw];
  if (dezRealizadoSnap && dezRealizadoSnap.cabecas > 0) {
    cabIni[0] = dezRealizadoSnap.cabecas;
  }

  // Snapshot validado de peso sobrescreve view quando disponível
  const hasSnap = pesoSnap && pesoSnap.cabecas.some(v => v > 0);
  const pesoFin = hasSnap ? pesoSnap!.cabecas.map((c, i) => c * (pesoSnap!.pesoMedio[i] || 0)) : pesoFinRaw;
  // Peso ini: Jan = Dez realizado validado; Fev+ = Meta final mês anterior
  const dezPesoKg = dezRealizadoSnap ? dezRealizadoSnap.arrobas * 30 : 0;
  const pesoIniJan = dezPesoKg > 0 ? dezPesoKg : pesoIniRaw[0];
  const pesoIni = hasSnap ? [pesoIniJan, ...pesoFin.slice(0, 11)] : pesoIniRaw;
  const pesoMedFin = hasSnap ? pesoSnap!.pesoMedio : pesoMedFinRaw;
  // GMD: usar NaN como sentinela quando meta não projetou ganho de peso
  // (gmd_numerador_kg=0 com rebanho presente = "sem projeção de GMD", não "GMD=0")
  const gmd = Array.from({ length: 12 }, (_, i) => {
    const m = byMes[String(i + 1).padStart(2, '0')];
    if (!m) return NaN;
    const gmdVal = Number(m.gmd_kg_cab_dia) || 0;
    const gmdNumerador = Number(m.gmd_numerador_kg) || 0;
    const temRebanho = Number(m.cabecas_inicio) > 0 || Number(m.cabecas_final) > 0;
    if (temRebanho && gmdNumerador === 0 && gmdVal === 0) return NaN;
    return gmdVal;
  });
  const uaMedia = get('ua_media');
  const areaProd = get('area_produtiva_ha');
  const lotacao = get('lotacao_ua_ha');

  // Peso médio ini: Jan = Dez realizado validado pesoMedioKg; Fev+ = meta final mês anterior
  const pesoMedIniJan = dezRealizadoSnap && dezRealizadoSnap.pesoMedioKg > 0
    ? dezRealizadoSnap.pesoMedioKg
    : (cabIni[0] > 0 ? pesoIni[0] / cabIni[0] : 0);
  const pesoMedIni = [pesoMedIniJan, ...pesoMedFin.slice(0, 11)];
  const cabMedia = cabIni.map((v, i) => (v + cabFin[i]) / 2);
  const gmdNum = get('gmd_numerador_kg');
  const arrobasProd = gmdNum.map((v, i) => {
    const temRebanho = cabIni[i] > 0 || cabFin[i] > 0;
    if (temRebanho && v === 0) return NaN;
    return v / 30;
  });
  const prodKg = gmdNum.map((v, i) => {
    const temRebanho = cabIni[i] > 0 || cabFin[i] > 0;
    if (temRebanho && v === 0) return NaN;
    return v;
  });
  const arrHa = arrobasProd.map((v, i) => areaProd[i] > 0 && !isNaN(v) ? v / areaProd[i] : NaN);
  const desfruteCab = saidas;
  const desfrute_arr = saidas.map((v, i) => pesoMedFin[i] > 0 ? (v * pesoMedFin[i]) / 30 : 0);

  const r = (indicador: string, format: PainelFormatType, raw: number[], indicadorId?: string, noTotal?: boolean): Row => {
    let valores: number[];
    switch (tab) {
      case 'mensal': valores = raw; break;
      case 'medio': valores = raw; break;
      case 'acumulado': valores = cumSum(raw); break;
      case 'media_periodo': valores = rollingAvg(raw); break;
    }
    return { indicador, format, valores, indicadorId, noTotal };
  };

  const emptyMoney = Array(12).fill(0);
  const nanArr: number[] = Array(12).fill(NaN);
  const noFinMeta = finMeta == null;

  // Séries financeiras META — NaN quando sem planejamento (renderiza '-')
  // Zero real quando planejamento existe e valor planejado for zero (renderiza R$ 0,00)
  const finEntradas = noFinMeta ? nanArr : finMeta.entradas;
  const finSaidas   = noFinMeta ? nanArr : finMeta.saidas;
  const finRecPec   = noFinMeta ? nanArr : finMeta.recPec;
  const finResCaixa = noFinMeta ? nanArr
    : finMeta.entradas.map((v, i) => v - finMeta!.saidas[i]);
  const finResOper  = noFinMeta ? nanArr
    : finMeta.recPec.map((v, i) => v - finMeta!.custoProd[i]);

  const vrm = valorRebanhoMetaMes || Array(12).fill(0);
  const vrmIni = valorRebanhoMetaMesAnteriorOuDez || Array(12).fill(0);
  const valorPorCabMeta = cabFin.map((c, i) => {
    if (metaValorCabMes && metaValorCabMes[i] > 0) return metaValorCabMes[i];
    return c > 0 && vrm[i] > 0 ? vrm[i] / c : 0;
  });
  const valorPorArrMeta = pesoFin.map((peso, i) => {
    if (metaPrecoArrMes && metaPrecoArrMes[i] > 0) return metaPrecoArrMes[i];
    const arrobas = peso > 0 ? peso / 30 : 0;
    return arrobas > 0 && vrm[i] > 0 ? vrm[i] / arrobas : 0;
  });

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Reb. inicial (cab)', 'cab', cabIni, 'reb_inicial', true),
            r('Reb. final (cab)', 'cab', cabFin, 'reb_final', true),
            r('Entradas (cab)', 'cab', entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', saidas, 'saidas_cab'),
          ],
        },
        {
          nome: 'Peso',
          rows: [
            r('Peso ini. (kg)', 'cab', pesoIni, 'peso_ini_kg', true),
            r('Peso final (kg)', 'cab', pesoFin, 'peso_fin_kg', true),
            r('Peso fin. cab (kg)', 'med2', hasSnap ? pesoSnap!.pesoMedio.map(v => v > 0 ? v : NaN) : pesoFin.map((p, i) => cabFin[i] > 0 ? p / cabFin[i] : NaN), 'peso_fin_cab_kg', true),
            r('Peso ini. (@)', 'cab', pesoIni.map(v => Math.round(v / 30)), 'peso_ini_arr', true),
            r('Peso final (@)', 'cab', pesoFin.map(v => Math.round(v / 30)), 'peso_fin_arr', true),
            r('Peso méd. ini.', 'med2', pesoMedIni, 'peso_med_ini', true),
            r('Peso méd. final', 'med2', pesoMedFin, 'peso_med_fin', true),
          ],
        },
        {
          nome: 'Valor do Rebanho',
          rows: [
            r('Valor reb. inicial', 'moneyInt', vrmIni, 'valor_reb_ini', true),
            r('Valor reb. final', 'moneyInt', vrm, 'valor_reb_fin', true),
            r('Valor/cab final', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor/@ final', 'money', valorPorArrMeta, 'valor_arr_fin', true),
          ],
        },
      ];
    case 'medio':
      return [
        {
          nome: 'Desempenho',
          rows: [
            r('GMD (kg/cab/dia)', 'gmd', gmd, 'gmd'),
            r('Peso méd. reb.', 'med2', pesoMedFin, 'peso_med_reb'),
            r('UA média', 'med2', uaMedia, 'ua_media'),
            r('Lotação (UA/ha)', 'med2', lotacao, 'lotacao'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas', 'padrao', arrobasProd, 'arrobas_prod'),
            r('Produção (kg)', 'padrao', prodKg, 'prod_kg'),
            r('@/ha', 'med2', arrHa, 'arr_ha'),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Estrutura',
          rows: [
            r('Área prod. (ha)', 'med2', areaProd, 'area_prod'),
            r('Reb. médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio'),
          ],
        },
      ];
    case 'acumulado':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Entradas acum. (cab)', 'cab', entradas, 'entradas_acum'),
            r('Saídas acum. (cab)', 'cab', saidas, 'saidas_acum'),
            r('Saldo acum. reb.', 'cab', entradas.map((v, i) => v - saidas[i]), 'saldo_acum'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas acum.', 'padrao', arrobasProd, 'arrobas_acum'),
            r('Produção kg acum.', 'padrao', prodKg, 'prod_kg_acum'),
            r('@/ha acum.', 'med2', arrHa, 'arr_ha_acum'),
            r('Desfrute acum. (cab)', 'cab', desfruteCab, 'desfrute_acum_cab'),
            r('Desfrute acum. (@)', 'padrao', desfrute_arr, 'desfrute_acum_arr'),
          ],
        },
        {
          nome: 'Financeiro no Caixa',
          rows: [
            r('Entradas fin. acum.', 'money', finEntradas, 'ent_fin_acum'),
            r('Saídas fin. acum.', 'money', finSaidas, 'sai_fin_acum'),
            r('Rec. pec. acum.', 'money', finRecPec, 'rec_pec_acum'),
            r('Res. caixa acum.', 'money', finResCaixa, 'res_caixa_acum'),
          ],
        },
        {
          nome: 'Financeiro por Competência',
          rows: [
            r('Rec. pec. comp. acum.', 'money', finRecPec, 'rec_pec_comp_acum'),
            r('Res. oper. acum.', 'money', finResOper, 'res_oper_acum'),
            r('EBITDA acum.', 'money', finResOper, 'ebitda_acum'),
            r('Var. valor reb.', 'money', emptyMoney, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo': {
      const diasMes = Array.from({ length: 12 }, (_, i) => {
        const m = byMes[String(i + 1).padStart(2, '0')];
        return m ? (Number(m.dias_mes) || new Date(new Date().getFullYear(), i + 1, 0).getDate()) : new Date(new Date().getFullYear(), i + 1, 0).getDate();
      });
      const gmdPeriodo = computePeriodGmd(prodKg, cabMedia, diasMes);
      const rebMedioPeriodoVals = rollingAvg(cabMedia);
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            { indicador: 'Rebanho médio período (cab)', format: 'cab', valores: rebMedioPeriodoVals.map(v => Math.round(v)), indicadorId: 'reb_medio_periodo', noTotal: true },
            { indicador: 'GMD médio período', format: 'gmd', valores: gmdPeriodo, indicadorId: 'gmd_medio', noTotal: true },
            r('Peso médio período', 'med2', pesoMedFin, 'peso_medio_periodo'),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo'),
            r('Lotação média', 'med2', lotacao, 'lotacao_media'),
          ],
        },
        {
          nome: 'Produção Média',
          rows: [
            r('@/ha média período', 'med2', arrHa, 'arr_ha_media'),
            r('Prod. média (@)', 'padrao', arrobasProd, 'prod_media_arr'),
            r('Prod. média (kg)', 'padrao', prodKg, 'prod_media_kg'),
            r('Desfrute médio', 'cab', desfruteCab, 'desfrute_medio'),
          ],
        },
        {
          nome: 'Financeiro Médio',
          rows: [
            r('Receita média', 'money', finRecPec, 'receita_media'),
            r('Res. oper. médio', 'money', finResOper, 'res_oper_medio'),
            r('EBITDA médio', 'money', finResOper, 'ebitda_medio'),
            r('Res. caixa médio', 'money', finResCaixa, 'res_caixa_medio'),
          ],
        },
      ];
    }
  }
}

// ─── Build blocos from MetaConsolidacao (validated consolidation) ───
function buildBlocosFromMetaConsolidacao(consolidacao: MetaCategoriaMes[], tab: ViewTab, areaProd: number, gmdMetaRows: MetaGmdRow[], valorRebanhoMetaMes?: number[], dezAnoAnteriorRealizado?: number, metaValorCabMes?: number[], metaPrecoArrMes?: number[], pesoSnap?: PesoSnapshot, dezRealizadoSnap?: { cabecas: number; pesoMedioKg: number; arrobas: number }, finMeta?: FinMetaPainel | null): Bloco[] {
  // Aggregate across all categories per month
  const agg = (field: keyof MetaCategoriaMes): number[] =>
    Array.from({ length: 12 }, (_, i) => {
      const mesKey = String(i + 1).padStart(2, '0');
      return consolidacao
        .filter(c => c.mes === mesKey)
        .reduce((s, c) => s + (Number(c[field]) || 0), 0);
    });

  const cabIniRaw = agg('si');
  const cabFin = agg('sf');
  const entradas = agg('ee');
  const saidas = agg('se');
  const pesoIniRaw = agg('pesoInicial');
  const pesoFinRaw = agg('pesoTotalFinal');

  // Produção biológica: a view oficial (vw_zoot_categoria_mensal) já integra
  // meta_gmd_mensal no peso_total_final e producao_biologica. Leitura direta.
  const prodBio = agg('producaoBio');

  // Override cabIni[0] (Jan) with Dec realizado validado
  const cabIni = [...cabIniRaw];
  if (dezRealizadoSnap && dezRealizadoSnap.cabecas > 0) {
    cabIni[0] = dezRealizadoSnap.cabecas;
  }

  // A view já incorpora produção biológica META no peso_total_final.
  // Snapshot validado de peso sobrescreve consolidação quando disponível
  const hasSnap = pesoSnap && pesoSnap.cabecas.some(v => v > 0);
  const pesoFin = hasSnap ? pesoSnap!.cabecas.map((c, i) => c * (pesoSnap!.pesoMedio[i] || 0)) : pesoFinRaw;
  // Peso ini: Jan = Dez realizado validado; Fev+ = Meta final mês anterior
  const dezPesoKg = dezRealizadoSnap ? dezRealizadoSnap.arrobas * 30 : 0;
  const pesoIniJan = dezPesoKg > 0 ? dezPesoKg : pesoIniRaw[0];
  const pesoIni = hasSnap ? [pesoIniJan, ...pesoFin.slice(0, 11)] : pesoIniRaw;

  // Peso médio final = peso total final / SF (weighted across categories)
  const pesoMedFinRaw = Array.from({ length: 12 }, (_, i) => {
    const sf = cabFin[i];
    return sf > 0 ? pesoFinRaw[i] / sf : 0;
  });
  const pesoMedFin = hasSnap ? pesoSnap!.pesoMedio : pesoMedFinRaw;

  // Peso médio ini: Jan = Dez realizado validado pesoMedioKg; Fev+ = meta final mês anterior
  const pesoMedIniJan = dezRealizadoSnap && dezRealizadoSnap.pesoMedioKg > 0
    ? dezRealizadoSnap.pesoMedioKg
    : (cabIni[0] > 0 ? pesoIni[0] / cabIni[0] : 0);
  const pesoMedIni = [pesoMedIniJan, ...pesoMedFin.slice(0, 11)];
  const cabMedia = cabIni.map((v, i) => (v + cabFin[i]) / 2);

  // GMD: lido diretamente da view (producaoBio já é correto)
  const gmd = Array.from({ length: 12 }, (_, i) => {
    const cm = cabMedia[i];
    const mesNum = i + 1;
    const row = consolidacao.find(c => c.mes === String(mesNum).padStart(2, '0'));
    const dias = row?.dias || new Date(new Date().getFullYear(), mesNum, 0).getDate();
    if (cm <= 0 || dias <= 0) return 0;
    return prodBio[i] / (cm * dias);
  });

  // Arrobas produzidas = produção biológica / 30
  const arrobasProd = prodBio.map(v => v / 30);
  const prodKgArr = prodBio;

  const uaMedia = cabMedia.map((v, i) => pesoMedFin[i] > 0 ? (v * pesoMedFin[i]) / 450 : 0);
  const lotacao = uaMedia.map(v => areaProd > 0 ? v / areaProd : 0);
  const arrHa = arrobasProd.map(v => areaProd > 0 ? v / areaProd : 0);
  const desfruteCab = saidas;
  const desfrute_arr = saidas.map((v, i) => pesoMedFin[i] > 0 ? (v * pesoMedFin[i]) / 30 : 0);

  const r = (indicador: string, format: PainelFormatType, raw: number[], indicadorId?: string, noTotal?: boolean): Row => {
    let valores: number[];
    switch (tab) {
      case 'mensal': valores = raw; break;
      case 'medio': valores = raw; break;
      case 'acumulado': valores = cumSum(raw); break;
      case 'media_periodo': valores = rollingAvg(raw); break;
    }
    return { indicador, format, valores, indicadorId, noTotal };
  };

  const emptyMoney = Array(12).fill(0);
  const nanArr: number[] = Array(12).fill(NaN);
  const noFinMeta = finMeta == null;

  // Séries financeiras META — NaN quando sem planejamento (renderiza '-')
  // Zero real quando planejamento existe e valor planejado for zero (renderiza R$ 0,00)
  const finEntradas = noFinMeta ? nanArr : finMeta.entradas;
  const finSaidas   = noFinMeta ? nanArr : finMeta.saidas;
  const finRecPec   = noFinMeta ? nanArr : finMeta.recPec;
  const finResCaixa = noFinMeta ? nanArr
    : finMeta.entradas.map((v, i) => v - finMeta!.saidas[i]);
  const finResOper  = noFinMeta ? nanArr
    : finMeta.recPec.map((v, i) => v - finMeta!.custoProd[i]);

  // Valor do Rebanho META: lido do snapshot validado (valor_rebanho_meta_validada)
  const vrm = valorRebanhoMetaMes || Array(12).fill(0);
  const valorRebFin = vrm;
  // Valor reb. ini META: Jan = realizado Dez ano anterior, Fev+ = META final mês anterior
  const valorRebIni = [dezAnoAnteriorRealizado ?? 0, ...vrm.slice(0, 11)];
  const valorPorCabMeta = cabFin.map((c, i) => {
    // Prefer persisted valor_cabeca_medio, fallback to calculation
    if (metaValorCabMes && metaValorCabMes[i] > 0) return metaValorCabMes[i];
    return c > 0 && vrm[i] > 0 ? vrm[i] / c : 0;
  });
  const arrobasEstoqueMeta = pesoFin.map(v => v / 30);
  const valorPorArrMeta = arrobasEstoqueMeta.map((a, i) => {
    // Prefer persisted preco_arroba_medio, fallback to calculation
    if (metaPrecoArrMes && metaPrecoArrMes[i] > 0) return metaPrecoArrMes[i];
    return a > 0 && vrm[i] > 0 ? vrm[i] / a : 0;
  });
  const varValorRebMeta = valorRebFin.map((v, i) => v - valorRebIni[i]);

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Reb. inicial (cab)', 'cab', cabIni, 'reb_inicial', true),
            r('Reb. final (cab)', 'cab', cabFin, 'reb_final', true),
            r('Entradas (cab)', 'cab', entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', saidas, 'saidas_cab'),
          ],
        },
        {
          nome: 'Peso',
          rows: [
            r('Peso ini. (kg)', 'cab', pesoIni, 'peso_ini_kg', true),
            r('Peso final (kg)', 'cab', pesoFin, 'peso_fin_kg', true),
            r('Peso fin. cab (kg)', 'med2', hasSnap ? pesoSnap!.pesoMedio.map(v => v > 0 ? v : NaN) : pesoFin.map((p, i) => cabFin[i] > 0 ? p / cabFin[i] : NaN), 'peso_fin_cab_kg', true),
            r('Peso ini. (@)', 'cab', pesoIni.map(v => Math.round(v / 30)), 'peso_ini_arr', true),
            r('Peso final (@)', 'cab', pesoFin.map(v => Math.round(v / 30)), 'peso_fin_arr', true),
            r('Peso méd. ini.', 'med2', pesoMedIni, 'peso_med_ini', true),
            r('Peso méd. final', 'med2', pesoMedFin, 'peso_med_fin', true),
          ],
        },
        {
          nome: 'Valor do Rebanho',
          rows: [
            r('Valor reb. inicial', 'moneyInt', valorRebIni, 'valor_reb_ini', true),
            r('Valor reb. final', 'moneyInt', valorRebFin, 'valor_reb_fin', true),
            r('Valor/cab final', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor/@ final', 'money', valorPorArrMeta, 'valor_arr_fin', true),
          ],
        },
      ];
    case 'medio':
      return [
        {
          nome: 'Desempenho',
          rows: [
            r('GMD (kg/cab/dia)', 'gmd', gmd, 'gmd'),
            r('Peso méd. reb.', 'med2', pesoMedFin, 'peso_med_reb'),
            r('UA média', 'med2', uaMedia, 'ua_media'),
            r('Lotação (UA/ha)', 'med2', lotacao, 'lotacao'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas', 'padrao', arrobasProd, 'arrobas_prod'),
            r('Produção (kg)', 'padrao', prodKgArr, 'prod_kg'),
            r('@/ha', 'med2', arrHa, 'arr_ha'),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Estrutura',
          rows: [
            r('Área prod. (ha)', 'med2', Array(12).fill(areaProd), 'area_prod'),
            r('Reb. médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio'),
          ],
        },
      ];
    case 'acumulado':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Entradas acum. (cab)', 'cab', entradas, 'entradas_acum'),
            r('Saídas acum. (cab)', 'cab', saidas, 'saidas_acum'),
            r('Saldo acum. reb.', 'cab', entradas.map((v, i) => v - saidas[i]), 'saldo_acum'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas acum.', 'padrao', arrobasProd, 'arrobas_acum'),
            r('Produção kg acum.', 'padrao', prodKgArr, 'prod_kg_acum'),
            r('@/ha acum.', 'med2', arrHa, 'arr_ha_acum'),
            r('Desfrute acum. (cab)', 'cab', desfruteCab, 'desfrute_acum_cab'),
            r('Desfrute acum. (@)', 'padrao', desfrute_arr, 'desfrute_acum_arr'),
          ],
        },
        {
          nome: 'Financeiro no Caixa',
          rows: [
            r('Entradas fin. acum.', 'money', finEntradas, 'ent_fin_acum'),
            r('Saídas fin. acum.', 'money', finSaidas, 'sai_fin_acum'),
            r('Rec. pec. acum.', 'money', finRecPec, 'rec_pec_acum'),
            r('Res. caixa acum.', 'money', finResCaixa, 'res_caixa_acum'),
          ],
        },
        {
          nome: 'Financeiro por Competência',
          rows: [
            r('Rec. pec. comp. acum.', 'money', finRecPec, 'rec_pec_comp_acum'),
            r('Res. oper. acum.', 'money', finResOper, 'res_oper_acum'),
            r('EBITDA acum.', 'money', finResOper, 'ebitda_acum'),
            r('Var. valor reb.', 'money', varValorRebMeta, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo': {
      const diasMes = Array.from({ length: 12 }, (_, i) => {
        const row = consolidacao.find(c => c.mes === String(i + 1).padStart(2, '0'));
        return Number(row?.dias) || new Date(new Date().getFullYear(), i + 1, 0).getDate();
      });
      const gmdPeriodo = computePeriodGmd(prodBio, cabMedia, diasMes);
      const rebMedioPeriodoVals = rollingAvg(cabMedia);
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            { indicador: 'Rebanho médio período (cab)', format: 'cab', valores: rebMedioPeriodoVals.map(v => Math.round(v)), indicadorId: 'reb_medio_periodo', noTotal: true },
            { indicador: 'GMD médio período', format: 'gmd', valores: gmdPeriodo, indicadorId: 'gmd_medio', noTotal: true },
            r('Peso médio período', 'med2', pesoMedFin, 'peso_medio_periodo'),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo'),
            r('Lotação média', 'med2', lotacao, 'lotacao_media'),
          ],
        },
        {
          nome: 'Produção Média',
          rows: [
            r('@/ha média período', 'med2', arrHa, 'arr_ha_media'),
            r('Prod. média (@)', 'padrao', arrobasProd, 'prod_media_arr'),
            r('Prod. média (kg)', 'padrao', prodKgArr, 'prod_media_kg'),
            r('Desfrute médio', 'cab', desfruteCab, 'desfrute_medio'),
          ],
        },
        {
          nome: 'Financeiro Médio',
          rows: [
            r('Receita média', 'money', finRecPec, 'receita_media'),
            r('Res. oper. médio', 'money', finResOper, 'res_oper_medio'),
            r('EBITDA médio', 'money', finResOper, 'ebitda_medio'),
            r('Res. caixa médio', 'money', finResCaixa, 'res_caixa_medio'),
          ],
        },
      ];
    }
  }
}


function totalForRow(row: Row, tab: ViewTab, maxMonth: number): number {
  if (tab === 'acumulado' || tab === 'media_periodo') {
    const idx = Math.min(maxMonth - 1, 11);
    return row.valores[idx] ?? 0;
  }
  let sum = 0;
  for (let i = 0; i < maxMonth && i < 12; i++) sum += row.valores[i];
  return sum;
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
      base['Total'] = totalForRow(row, tab, 12);
      return base;
    }),
  );
  const cols = [{ wch: 24 }, { wch: 30 }, ...Array(13).fill(null).map(() => ({ wch: 14 }))];
  triggerXlsxDownload({ filename, sheets: [{ name: 'Painel', rows: sheetRows, cols }] });
}

// ─── Determine current month cutoff ───
function getCurrentMonthCutoff(anoNum: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (anoNum < currentYear) return 12;
  if (anoNum > currentYear) return 0;
  return currentMonth;
}

// ─── Source Info Tooltip ───
function SourceInfoTooltip({ indicadorId, cenario }: { indicadorId?: string; cenario: Cenario }) {
  if (!indicadorId) return null;
  const catalogMeta = CATALOGO_INDICADORES[indicadorId];

  if (!catalogMeta) return null;

  const fonte: FonteIndicador = cenario === 'realizado' ? catalogMeta.realizado : catalogMeta.previsto;
  const statusInfo = getFonteStatusLabel(fonte);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center justify-center h-3 w-3 ml-0.5 opacity-40 hover:opacity-100 transition-opacity">
          <Info className="h-2.5 w-2.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[280px] text-[10px] space-y-1 p-2">
        <div className="font-bold text-[11px]">{catalogMeta.nome}</div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Status:</span>
          <span className={`font-semibold ${statusInfo.color}`}>● {statusInfo.label}</span>
        </div>
        <div><span className="text-muted-foreground">Fonte:</span> {fonte.fonte_tipo === 'sem_fonte' ? 'Sem base meta configurada' : fonte.fonte_tabela}</div>
        {fonte.fonte_campo && <div><span className="text-muted-foreground">Campo:</span> {fonte.fonte_campo}</div>}
        <div><span className="text-muted-foreground">Regra:</span> {fonte.regra_calculo}</div>
        <div><span className="text-muted-foreground">Prioridade:</span> {fonte.regra_prioridade}</div>
        <div><span className="text-muted-foreground">Cenário:</span> {cenario}</div>
        {fonte.tela_label && (
          <div className="text-muted-foreground text-[9px] pt-0.5 border-t border-border/30">
            Tela origem: {fonte.tela_label}
          </div>
        )}
        {fonte.observacao && (
          <div className="text-muted-foreground/70 italic text-[9px]">{fonte.observacao}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Component ───
export function PainelConsultorTab({ onBack, onTabChange, filtroGlobal, metaConsolidacao }: Props) {
  const { fazendaAtual, fazendas, isGlobal } = useFazenda();
  const { pastos, categorias } = usePastos();
  const { lancamentos: lancPec, saldosIniciais } = useLancamentos();
  const { lancamentos: lancFin } = useFinanceiro();

  const [ano, setAno] = useState(filtroGlobal?.ano || String(new Date().getFullYear()));
  const [viewTab, setViewTab] = useState<ViewTab>('mensal');
  const [cenario, setCenario] = useState<Cenario>('realizado');
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(Array(13).fill(0));
  const [openBlocos, setOpenBlocos] = useState<Record<string, boolean>>({});
  const [showDivP1, setShowDivP1] = useState(false);
  const [showReabrirP1, setShowReabrirP1] = useState(false);

  const anoNum = Number(ano);
  const anosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    s.add(String(new Date().getFullYear()));
    s.add(String(new Date().getFullYear() - 1));
    saldosIniciais.forEach(si => s.add(String(si.ano)));
    return Array.from(s).sort().reverse();
  }, [saldosIniciais]);

  const fazendaId = fazendaAtual?.id;

  const {
    buildGrid: buildGridMeta,
    lancamentosNutricao: lancNutricaoMeta,
    lancamentosFinanciamento: lancFinanciamentoMeta,
    lancamentosRebanho: lancRebanhoMeta,
    lancamentosProjetos: lancProjetosMeta,
  } = usePlanejamentoFinanceiro(anoNum, fazendaId);

  // ─── Status dos pilares de governança (mês atual selecionado) ───
  const mesAtualRef = useMemo(() => {
    const m = filtroGlobal?.mes || new Date().getMonth() + 1;
    return `${ano}-${String(m).padStart(2, '0')}`;
  }, [ano, filtroGlobal?.mes]);
  const { status: statusPilares, refetch: refetchPilares } = useStatusPilares(fazendaId, mesAtualRef);
  const { rawFazenda: zootMeta, rawCategorias: viewCategoriasMeta } = useRebanhoOficial({ ano: anoNum, cenario: 'meta' });
  const { rows: gmdMetaRows } = useMetaGmd(ano);
  const { clienteAtual } = useCliente();
  const { statusArray: snapshotStatusArray, isComprometido: isSnapshotComprometido, getStatusByMonth } = useSnapshotStatus(anoNum);

  // Leitura oficial do Valor do Rebanho META validado (tabela valor_rebanho_meta_validada)
  const [valorRebanhoMetaMes, setValorRebanhoMetaMes] = useState<number[]>(Array(12).fill(0));
  const [metaValorCabMes, setMetaValorCabMes] = useState<number[]>(Array(12).fill(0));
  const [metaPrecoArrMes, setMetaPrecoArrMes] = useState<number[]>(Array(12).fill(0));
  const [metaPesoSnap, setMetaPesoSnap] = useState<PesoSnapshot>({ cabecas: Array(12).fill(0), pesoMedio: Array(12).fill(0), arrobas: Array(12).fill(0) });

  useEffect(() => {
    if (!fazendaId || fazendaId === '__global__') return;
    const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);
    supabase
      .from('valor_rebanho_meta_validada' as any)
      .select('ano_mes, valor_total, valor_cabeca_medio, preco_arroba_medio, cabecas, peso_medio_kg, arrobas_total')
      .eq('fazenda_id', fazendaId)
      .in('ano_mes', meses)
      .then(({ data, error }) => {
        if (error || !data) return;
        const vrm = Array(12).fill(0);
        const vcm = Array(12).fill(0);
        const vam = Array(12).fill(0);
        const cab = Array(12).fill(0);
        const pm = Array(12).fill(0);
        const arr = Array(12).fill(0);
        (data as any[]).forEach((row: any) => {
          const idx = meses.indexOf(row.ano_mes);
          if (idx >= 0) {
            vrm[idx] = Number(row.valor_total) || 0;
            vcm[idx] = Number(row.valor_cabeca_medio) || 0;
            vam[idx] = Number(row.preco_arroba_medio) || 0;
            cab[idx] = Number(row.cabecas) || 0;
            pm[idx] = Number(row.peso_medio_kg) || 0;
            arr[idx] = Number(row.arrobas_total) || 0;
          }
        });
        setValorRebanhoMetaMes(vrm);
        setMetaValorCabMes(vcm);
        setMetaPrecoArrMes(vam);
        setMetaPesoSnap({ cabecas: cab, pesoMedio: pm, arrobas: arr });
      });
  }, [fazendaId, anoNum]);
  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewDataRealizado } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado', global: isGlobal });

  // Month cutoff: months > cutoff are blank
  const monthCutoff = useMemo(() => getCurrentMonthCutoff(anoNum), [anoNum]);

  // ── Leitura oficial do Valor do Rebanho REALIZADO validado ──
  const [realValorCabMes, setRealValorCabMes] = useState<number[]>(Array(13).fill(0));
  const [realPrecoArrMes, setRealPrecoArrMes] = useState<number[]>(Array(13).fill(0));
  const [realPesoSnap, setRealPesoSnap] = useState<PesoSnapshot>({ cabecas: Array(13).fill(0), pesoMedio: Array(13).fill(0), arrobas: Array(13).fill(0) });

  useEffect(() => {
    if (!fazendaId) { setValorRebanhoMes(Array(13).fill(0)); return; }
    (async () => {
      const dezAnoAnterior = `${anoNum - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];
      const fazendaIds = fazendaId === '__global__'
        ? fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id) : [fazendaId];
      if (fazendaIds.length === 0) {
        setValorRebanhoMes(Array(13).fill(0));
        setRealValorCabMes(Array(13).fill(0));
        setRealPrecoArrMes(Array(13).fill(0));
        setRealPesoSnap({ cabecas: Array(13).fill(0), pesoMedio: Array(13).fill(0), arrobas: Array(13).fill(0) });
        return;
      }
      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado' as any)
        .select('ano_mes, valor_total, valor_cabeca_medio, preco_arroba_medio, cabecas, peso_medio_kg, arrobas_total, status')
        .in('fazenda_id', fazendaIds)
        .in('ano_mes', todasMeses);
      if (error) {
        // Fallback to old table if new one has no data yet
        const { data: oldData } = await supabase
          .from('valor_rebanho_fechamento')
          .select('ano_mes, valor_total')
          .in('fazenda_id', fazendaIds)
          .in('ano_mes', todasMeses);
        const totais = new Map(todasMeses.map(mes => [mes, 0]));
        (oldData || []).forEach(row => {
          totais.set(row.ano_mes, (totais.get(row.ano_mes) || 0) + (Number(row.valor_total) || 0));
        });
        setValorRebanhoMes(todasMeses.map(mes => totais.get(mes) || 0));
        setRealValorCabMes(Array(13).fill(0));
        setRealPrecoArrMes(Array(13).fill(0));
        setRealPesoSnap({ cabecas: Array(13).fill(0), pesoMedio: Array(13).fill(0), arrobas: Array(13).fill(0) });
        return;
      }
      // GOVERNANÇA: Apenas snapshots validados alimentam o Painel oficial
      const validRows = (data as any[] || []).filter((row: any) => row.status === 'validado');
      // Consolidação global: usar agregação oficial (2 camadas)
      const agg = agregaSnapshotsGlobal(validRows, todasMeses);
      setValorRebanhoMes(todasMeses.map(mes => agg.valorTotal.get(mes) || 0));
      setRealValorCabMes(todasMeses.map(mes => agg.valorCabeca.get(mes) || 0));
      setRealPrecoArrMes(todasMeses.map(mes => agg.precoArroba.get(mes) || 0));
      setRealPesoSnap({
        cabecas: todasMeses.map(mes => agg.cabecas.get(mes) || 0),
        pesoMedio: todasMeses.map(mes => agg.pesoMedio.get(mes) || 0),
        arrobas: todasMeses.map(mes => agg.arrobas.get(mes) || 0),
      });
    })();
  }, [fazendaId, anoNum, fazendas]);

  const areaProdutiva = useMemo(() => calcAreaProdutivaPecuaria(pastos), [pastos]);

  const viewTotals = useMemo(() => totalizarViewPorMes(viewDataRealizado || []), [viewDataRealizado]);

  const monthlyData = useMemo(() =>
    buildMonthlyDataFromView(viewTotals, viewDataRealizado || [], lancFin, lancPec, anoNum, areaProdutiva, valorRebanhoMes, isGlobal),
    [viewTotals, viewDataRealizado, lancFin, lancPec, anoNum, areaProdutiva, valorRebanhoMes, isGlobal],
  );

  const isPrevisto = cenario === 'meta';

  const finMetaPainel = useMemo<FinMetaPainel | null>(() => {
    if (!isPrevisto) return null;
    const grid = buildGridMeta();
    return agregarGridMetaPainelConsultor(
      grid,
      lancNutricaoMeta,
      lancFinanciamentoMeta,
      lancRebanhoMeta,
      lancProjetosMeta,
    );
  }, [isPrevisto, buildGridMeta, lancNutricaoMeta, lancFinanciamentoMeta,
      lancRebanhoMeta, lancProjetosMeta]);

  // META em modo Global agora é suportada: os hooks/views consultados já agregam
  // por cliente quando isGlobal=true. Se alguma fonte não agregar, a UI mostrará zeros
  // em vez de bloquear (mais transparente para o usuário).

  // Consolidação META baseada na VIEW OFICIAL (vw_zoot_categoria_mensal cenario='meta')
  // NUNCA usar cálculo local (useMetaConsolidacao) — a view é a fonte única de verdade
  const metaConsolidacaoView = useMemo(() =>
    viewCategoriasMeta && viewCategoriasMeta.length > 0
      ? viewToMetaCategoriaMes(viewCategoriasMeta)
      : [],
    [viewCategoriasMeta],
  );

  // Blocos: Realizado usa buildMonthlyData, Meta usa view oficial + snapshot validado
  const blocos = useMemo(() => {
    if (isPrevisto) {
      // Valor reb. ini META: Jan = realizado Dez ano anterior, Fev+ = META final mês anterior
      const valorRebIniMeta = [valorRebanhoMes[0] ?? 0, ...valorRebanhoMetaMes.slice(0, 11)];

      // Dez realizado validado — snapshot base para Jan da META
      const dezSnap = realPesoSnap.arrobas[0] > 0
        ? { cabecas: realPesoSnap.cabecas[0], pesoMedioKg: realPesoSnap.pesoMedio[0], arrobas: realPesoSnap.arrobas[0] }
        : undefined;

      // Fonte oficial: view convertida para MetaCategoriaMes[]
      if (metaConsolidacaoView.length > 0) {
        return buildBlocosFromMetaConsolidacao(metaConsolidacaoView, viewTab, areaProdutiva, gmdMetaRows, valorRebanhoMetaMes, valorRebanhoMes[0], metaValorCabMes, metaPrecoArrMes, metaPesoSnap, dezSnap, finMetaPainel);
      }

      // Fallback: dados de fazenda (vw_zoot_fazenda_mensal)
      return buildBlocosFromZootMensal(zootMeta || [], viewTab, valorRebanhoMetaMes, valorRebIniMeta, metaValorCabMes, metaPrecoArrMes, metaPesoSnap, dezSnap, finMetaPainel);
    }
    // Realizado: slice(1) removes Dec prev year index for 12-month arrays
    const realPesoSnap12: PesoSnapshot = {
      cabecas: realPesoSnap.cabecas.slice(1),
      pesoMedio: realPesoSnap.pesoMedio.slice(1),
      arrobas: realPesoSnap.arrobas.slice(1),
    };
    const dezArrobasKg = (realPesoSnap.arrobas[0] || 0) * 30;
    return buildBlocosForTab(monthlyData, viewTab, realValorCabMes.slice(1), realPrecoArrMes.slice(1), realPesoSnap12, dezArrobasKg > 0 ? dezArrobasKg : undefined);
  }, [isPrevisto, monthlyData, zootMeta, viewTab, metaConsolidacaoView, gmdMetaRows, areaProdutiva, valorRebanhoMetaMes, metaValorCabMes, metaPrecoArrMes, valorRebanhoMes, realValorCabMes, realPrecoArrMes, realPesoSnap, metaPesoSnap, finMetaPainel]);

  useEffect(() => {
    if (blocos.length > 0) {
      warnIndicadoresSemCatalogo(blocos);
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

  /**
   * REGRA CRÍTICA: No cenário "Meta", verificar se o indicador
   * tem fonte meta configurada. Se fonte_tipo === 'sem_fonte',
   * retornar string vazia — NUNCA copiar valor do Realizado.
   */

  const hasPrevistoSource = useCallback((indicadorId?: string): boolean => {
    if (!indicadorId) return false;
    const meta = CATALOGO_INDICADORES[indicadorId];
    if (!meta) return false;
    return meta.previsto.fonte_tipo !== 'sem_fonte';
  }, []);

  // ─── Table render ───
  const renderBlocoTable = (blocoRows: Row[]) => (
    <div className="overflow-x-auto border rounded border-border/40 -mx-2 sm:mx-0">
      <table className="text-[10px] border-collapse" style={{ tableLayout: 'fixed', minWidth: '780px' }}>
        <colgroup>
          <col style={{ width: '240px', minWidth: '240px' }} />
          {MESES_LABELS.map((_, i) => <col key={i} style={{ width: '54px', minWidth: '54px' }} />)}
          {viewTab === 'mensal' && <col style={{ width: '60px', minWidth: '60px' }} />}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted border-b">
            <th className="sticky left-0 z-20 bg-muted text-left text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border-r border-border/40" style={{ boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)' }}>
              Indicador
            </th>
            {MESES_LABELS.map((m, i) => (
              <th
                key={m}
                className={`text-right text-[9px] font-semibold uppercase tracking-wider px-0.5 py-0.5${
                  TRIM_BORDER_INDEXES.has(i) ? ' border-l border-border/30' : ''
                }`}
              >
                {m}
              </th>
            ))}
            {viewTab === 'mensal' && (
              <th className="text-right text-[9px] font-bold uppercase tracking-wider px-0.5 py-0.5 border-l border-border/40 bg-muted/80">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {blocoRows.map((row, idx) => {
            // REGRA: Meta sem fonte = toda linha vazia
            const previstoSemFonte = isPrevisto && !hasPrevistoSource(row.indicadorId);
            const tot = (previstoSemFonte || row.noTotal) ? null : totalForRow(row, viewTab, monthCutoff);

            return (
              <tr key={idx} className={`border-b border-border/20 hover:bg-muted/20 ${idx % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                <td className={`sticky left-0 z-10 text-[10px] font-medium py-0.5 px-1.5 leading-tight border-r border-border/30 ${idx % 2 !== 0 ? 'bg-muted/10' : 'bg-card'}`} title={row.indicador} style={{ boxShadow: '2px 0 4px -1px rgba(0,0,0,0.06)' }}>
                  <span className="truncate inline-block max-w-[220px] align-middle">{row.indicador}</span>
                  <SourceInfoTooltip indicadorId={row.indicadorId} cenario={cenario} />
                </td>
                {row.valores.map((v, i) => {
                  const isFuture = !isPrevisto && (i + 1) > monthCutoff;
                  const mesStatus = !isPrevisto ? getStatusByMonth(i + 1) : 'sem_snapshot';
                  const isSnapshotBloqueado = !isPrevisto && (mesStatus === 'invalidado' || mesStatus === 'cadeia_quebrada');
                  let cellContent = '';
                  let isSemBase = false;
                  let cellTitle: string | undefined;
                  if (previstoSemFonte) {
                    cellContent = '';  // sem base meta
                  } else if (isFuture) {
                    cellContent = '';  // mês futuro (only for Realizado)
                  } else if (isSnapshotBloqueado) {
                    cellContent = '⚠';
                    cellTitle = mesStatus === 'invalidado'
                      ? 'Snapshot invalidado — revalidar Valor do Rebanho'
                      : 'Cadeia quebrada — reconciliar mês anterior';
                  } else if (isNaN(v)) {
                    cellContent = '–';  // meta não projetou este indicador
                    isSemBase = true;
                  } else {
                    cellContent = formatPainel(v, row.format);
                  }
                  return (
                    <td
                      key={i}
                      className={`text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px]${
                        TRIM_BORDER_INDEXES.has(i) ? ' border-l border-border/20' : ''
                      }${previstoSemFonte ? ' text-muted-foreground/30' : ''}${isSemBase ? ' text-muted-foreground/50 italic' : ''}${
                        isSnapshotBloqueado ? ' text-destructive/60 bg-destructive/5' : ''
                      }`}
                      title={cellTitle ?? (isSemBase ? 'Meta não projetou este indicador' : undefined)}
                    >
                      {cellContent}
                    </td>
                  );
                })}
                {viewTab === 'mensal' && (
                  <td className={`text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px] font-bold border-l border-border/30 bg-muted/5${
                    previstoSemFonte || row.noTotal ? ' text-muted-foreground/30' : ''
                  }`}>
                    {(previstoSemFonte || row.noTotal)
                      ? ''
                      : row.valores.some(v => isNaN(v))
                        ? '–'
                        : (monthCutoff > 0 && tot !== null ? formatPainel(tot, row.format) : '')}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Meta banner when all rows have no source */}
      {isPrevisto && blocoRows.every(r => !hasPrevistoSource(r.indicadorId)) && (
        <div className="text-center text-[10px] text-muted-foreground py-2 bg-muted/20 border-t border-border/20">
          Sem base meta configurada para este bloco
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
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

            {/* Cenário toggle */}
            <div className="flex items-center rounded-md border border-border/50 overflow-hidden h-7">
              {(['realizado', 'meta'] as Cenario[]).map(c => (
                <button
                  key={c}
                  onClick={() => setCenario(c)}
                  className={`px-2 text-[11px] font-semibold h-full transition-colors ${
                    cenario === c
                      ? c === 'realizado'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-orange-500 text-white'
                      : 'bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {c === 'realizado' ? 'Realizado' : 'Meta'}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">{fazendaNome} · {ano}</span>
              {onTabChange && (
                <Button variant="outline" size="sm" onClick={() => onTabChange('status_fechamentos')} className="h-7 gap-1 text-[11px] px-2">
                  <ClipboardCheck className="h-3 w-3" />
                  Fechamentos
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExport} className="h-7 gap-1 text-[11px] px-2">
                <Download className="h-3 w-3" />
                Excel
              </Button>
              {onTabChange && (
                <Button variant="outline" size="sm" onClick={() => onTabChange('conferencia_gmd')} className="h-7 gap-1 text-[11px] px-2">
                  Conferir GMD
                </Button>
              )}
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

        {/* ── Snapshot governance banners ── */}
        {!isPrevisto && !isGlobal && (() => {
          const comprometidos = snapshotStatusArray
            .map((s, i) => ({ mes: i + 1, status: s }))
            .filter(m => m.status === 'invalidado' || m.status === 'cadeia_quebrada');
          if (comprometidos.length === 0) return null;
          const primeiro = comprometidos[0];
          const mesLabel = MESES_LABELS[primeiro.mes - 1] + '/' + ano;
          return (
            <div className="px-2 mt-1">
              <SnapshotStatusBanner
                status={primeiro.status}
                mesLabel={mesLabel}
                compact
                onRevalidar={primeiro.status === 'invalidado' && onTabChange ? () => onTabChange('valor_rebanho') : undefined}
                onIrMesAnterior={primeiro.status === 'cadeia_quebrada' && onTabChange ? () => onTabChange('valor_rebanho') : undefined}
              />
              {comprometidos.length > 1 && (
                <p className="text-[9px] text-muted-foreground mt-0.5 px-1">
                  +{comprometidos.length - 1} mês(es) afetado(s)
                </p>
              )}
            </div>
          );
        })()}

        {/* ── Content: collapsible blocks ── */}
        <div className="px-2 space-y-1 mt-1 flex-1 overflow-auto">
          {blocos.map(b => (
            <Collapsible
              key={b.nome}
              open={openBlocos[b.nome] ?? false}
              onOpenChange={() => toggleBloco(b.nome)}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1 bg-muted/60 rounded text-[11px] font-bold text-primary uppercase tracking-wider hover:bg-muted transition-colors">
                <span className="flex items-center gap-1.5">
                  {b.nome}
                  {!isGlobal && cenario === 'realizado' && (() => {
                    const pilarKey = BLOCO_PILAR_MAP[b.nome];
                    if (!pilarKey) return null;
                    const pilarInfo = statusPilares[pilarKey];
                    const badge = getPilarBadgeConfig(pilarInfo.status);
                    const tooltipText = getPilarTooltipText(pilarKey, pilarInfo);
                    const isP1Bloqueado = pilarKey === 'p1_mapa_pastos' && pilarInfo.status === 'bloqueado';
                    const isP1Oficial = pilarKey === 'p1_mapa_pastos' && pilarInfo.status === 'oficial';
                    const isClickable = isP1Bloqueado || isP1Oficial;
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`inline-flex items-center text-[8px] font-semibold px-1.5 py-0 rounded-full border leading-relaxed normal-case tracking-normal ${isClickable ? 'cursor-pointer' : 'cursor-help'} ${badge.className}`}
                            onClick={isP1Bloqueado ? (e) => { e.stopPropagation(); setShowDivP1(true); } : isP1Oficial ? (e) => { e.stopPropagation(); setShowReabrirP1(true); } : undefined}
                          >
                            {badge.label}
                            {(pilarInfo.modo_transitorio || pilarInfo.status === 'bloqueado') && (
                              <Info className="h-2.5 w-2.5 ml-0.5 opacity-60" />
                            )}
                          </span>
                        </TooltipTrigger>
                        {tooltipText && (
                          <TooltipContent side="top" className="text-[10px] max-w-[220px]">
                            {tooltipText}
                            {isP1Bloqueado && <span className="block mt-0.5 opacity-70">Clique para ver detalhes</span>}
                            {isP1Oficial && <span className="block mt-0.5 opacity-70">Clique para reabrir</span>}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })()}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openBlocos[b.nome] ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-0.5">
                {renderBlocoTable(b.rows)}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>

      {/* Modal de divergência P1 */}
      <DivergenciaP1Dialog
        open={showDivP1}
        onOpenChange={setShowDivP1}
        divergencias={
          ((statusPilares.p1_mapa_pastos.detalhe as Record<string, unknown> | undefined)?.divergencias as Array<{categoria: string; saldo_sistema: number; saldo_pastos: number; diferenca: number}>) || []
        }
        onIrMovimentacoes={onTabChange ? () => { setShowDivP1(false); onTabChange('lancamentos'); } : undefined}
        onIrMapaPastos={onTabChange ? () => { setShowDivP1(false); onTabChange('mapa_pastos'); } : undefined}
      />

      {/* Modal de reabertura P1 */}
      {fazendaId && (
        <ReabrirP1Dialog
          open={showReabrirP1}
          onOpenChange={setShowReabrirP1}
          fazendaId={fazendaId}
          anoMes={mesAtualRef}
          onReaberto={refetchPilares}
        />
      )}
    </TooltipProvider>
  );
}
