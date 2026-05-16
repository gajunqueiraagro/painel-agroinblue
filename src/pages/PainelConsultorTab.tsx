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
import {
  computePeriodGmd,
  rollingAvg,
} from '@/lib/calculos/painelConsultorIndicadores';
import {
  buildMonthlyDataFromView,
  type MonthlyData,
} from '@/lib/painelConsultor/buildMonthlyDataFromView';
import { useMetaGmd, type MetaGmdRow } from '@/hooks/useMetaGmd';
import { useSnapshotStatus, type SnapshotStatusValue } from '@/hooks/useSnapshotStatus';
import { useEndividamentoMensal, type EndividamentoSeries } from '@/hooks/useEndividamentoMensal';
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
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { usePlanejamentoFinanceiro, type SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import { usePastos } from '@/hooks/usePastos';
import { useRebanhoOficial, indexByMes, type ZootMensal, type ZootCategoriaMensal, totalizarPorMes as totalizarViewPorMes } from '@/hooks/useRebanhoOficial';
import { CATEGORIAS } from '@/types/cattle';
import { formatPainel, type PainelFormatType } from '@/lib/calculos/formatters';
import {
  calcAreaProdutivaPecuaria,
} from '@/lib/calculos/zootecnicos';
import { calcArrobasSafe, TIPOS_DESFRUTE_GLOBAL } from '@/lib/calculos/economicos';
import { supabase } from '@/integrations/supabase/client';
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

// ─── Build blocks for each tab ───
// cumSum acumulado com guarda NaN: se um mês vier NaN, o acumulado não morre
// a partir dali — continua usando o saldo anterior. Retorna número finito em
// todas as posições (zeros até o primeiro mês com valor finito).
const cumSum = (arr: number[]): number[] => {
  let s = 0;
  return arr.map(v => {
    if (Number.isFinite(v)) s += v;
    return s;
  });
};
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
  // Caixa (já existente)
  entradas: number[];
  saidas: number[];
  // DRE
  recOper: number[];    // macro 'Receita Operacional' APENAS (sem Entrada Financeira)
  custoProd: number[];
  outrasSaidas: number[]; // MACROS_SAIDA exceto 'Custeio Produção'
  // Resultados pré-calculados
  resOper: number[];    // recOper - custoProd
  resFinal: number[];   // resOper - outrasSaidas
  // manter recPec (compatibilidade Fase 1C)
  recPec: number[];
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
  const recOper      = z12();
  const outrasSaidas = z12();
  const resOper      = z12();
  const resFinal     = z12();

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

      if (macro === 'Receita Operacional') {
        recOper[i] += v;
        // Entrada Financeira NÃO entra em recOper (reservado DRE)
      }
      if (MACROS_SAIDA.has(macro) && macro !== 'Custeio Produção') {
        outrasSaidas[i] += v;
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    resOper[i]  = recOper[i] - custoProd[i];
    resFinal[i] = resOper[i] - outrasSaidas[i];
  }

  return { entradas, saidas, recPec, custoProd, recOper, outrasSaidas, resOper, resFinal };
}

interface SoberanoSerie12 {
  custeioPecSemJuros:   number[];
  jurosPec:             number[];
  custeioPecComJuros:   number[];
  investFazendaPec:     number[];
  desembolsoPec:        number[];
  custeioAgriSemJuros:  number[];
  jurosAgri:             number[];
  custeioAgriComJuros:  number[];
  investFazendaAgri:    number[];
  desembolsoAgri:       number[];
  investBovinos:        number[];
  amortizacoes:         number[];
  dividendos:           number[];
  saidasTotais:         number[];
}

/**
 * Bloco "Endividamento" — Realizado/Global, abas Valores Mensais e Acumulados.
 * Estoques (Dívida Inicial/Final) são mantidos como ponto-no-tempo (noTotal=true).
 * Fluxos (Captação, Amortização, Juros) acumulam em modo='acumulado'.
 */
function buildBlocoEndividamento(
  series: EndividamentoSeries,
  modo: 'mensal' | 'acumulado',
): Bloco {
  const cum = (arr: number[]): number[] => {
    const out: number[] = [];
    let acc = 0;
    for (const v of arr) { acc += v; out.push(acc); }
    return out;
  };
  const fluxo = (arr: number[]) => modo === 'acumulado' ? cum(arr) : arr;
  const estoque = (arr: number[]) => arr;

  return {
    nome: 'Endividamento',
    rows: [
      { indicador: 'Dívida Inicial Total', indicadorId: 'end_divida_inicial_total', format: 'money', valores: estoque(series.dividaInicialTotal), noTotal: true },
      { indicador: '→ Pecuária',           indicadorId: 'end_divida_inicial_pec',   format: 'money', valores: estoque(series.dividaInicialPec),   noTotal: true },
      { indicador: '→ Agricultura',        indicadorId: 'end_divida_inicial_agri',  format: 'money', valores: estoque(series.dividaInicialAgri),  noTotal: true },
      { indicador: 'Captação Total',       indicadorId: 'end_captacao_total',       format: 'money', valores: fluxo(series.captacaoTotal) },
      { indicador: '→ Pecuária',           indicadorId: 'end_captacao_pec',         format: 'money', valores: fluxo(series.captacaoPec) },
      { indicador: '→ Agricultura',        indicadorId: 'end_captacao_agri',        format: 'money', valores: fluxo(series.captacaoAgri) },
      { indicador: 'Amortização Total',    indicadorId: 'end_amortizacao_total',    format: 'money', valores: fluxo(series.amortizacaoTotal) },
      { indicador: '→ Pecuária',           indicadorId: 'end_amortizacao_pec',      format: 'money', valores: fluxo(series.amortizacaoPec) },
      { indicador: '→ Agricultura',        indicadorId: 'end_amortizacao_agri',     format: 'money', valores: fluxo(series.amortizacaoAgri) },
      { indicador: 'Juros Total',          indicadorId: 'end_juros_total',          format: 'money', valores: fluxo(series.jurosTotal) },
      { indicador: '→ Pecuária',           indicadorId: 'end_juros_pec',            format: 'money', valores: fluxo(series.jurosPec) },
      { indicador: '→ Agricultura',        indicadorId: 'end_juros_agri',           format: 'money', valores: fluxo(series.jurosAgri) },
      { indicador: 'Dívida Final Total',   indicadorId: 'end_divida_final_total',   format: 'money', valores: estoque(series.dividaFinalTotal), noTotal: true },
      { indicador: '→ Pecuária',           indicadorId: 'end_divida_final_pec',     format: 'money', valores: estoque(series.dividaFinalPec),   noTotal: true },
      { indicador: '→ Agricultura',        indicadorId: 'end_divida_final_agri',    format: 'money', valores: estoque(series.dividaFinalAgri),  noTotal: true },
    ],
  };
}

function buildBlocosForTab(
  d: MonthlyData,
  tab: ViewTab,
  realValorCab?: number[],
  realPrecoArr?: number[],
  pesoSnap?: PesoSnapshot,
  dezPesoSnap?: number,
  soberano?: SoberanoSerie12,
  endividamento?: EndividamentoSeries,
  caixaSaldoMensal?: number[],
  saidasDesfruteCabMensal?: number[],
  pcd?: ReturnType<typeof usePainelConsultorData> | null,
): Bloco[] {
  // Saldo bancário consolidado (estoque) Jan..Dez — alimenta linha "Saldo Final de Caixa".
  // Fonte oficial: pc100.caixaIndicador.serieAno (length 13; slice(1) = Jan..Dez).
  // NaN[12] quando indisponível — renderiza '—'.
  const _saldoCaixaMes12: number[] = caixaSaldoMensal ?? Array(12).fill(NaN);
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
    ? d.cabFin.map((_, i) => {
        const c = pesoSnap!.cabecas[i];
        return c && c > 0 ? c : NaN;
      })
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
    return pm > 0 ? (v * pm) / 450 : NaN;
  });
  const lotUaHa = uaMedia.map((v, i) => (d.areaProdMensal[i] ?? 0) > 0 ? v / d.areaProdMensal[i] : NaN);
  const arrHa = d.arrobasProd.map((v, i) => (d.areaProdMensal[i] ?? 0) > 0 ? v / d.areaProdMensal[i] : NaN);
  // Custo/@prod acumulado: custeio acumulado / arrobas produzidas acumuladas no período
  const custoPorArrAcum = (() => {
    const custAcum = cumSum(d.custOper);
    const arrAcum = cumSum(d.arrobasProd);
    return custAcum.map((c, i) => arrAcum[i] > 0 ? c / arrAcum[i] : NaN);
  })();
  // Desfrute (cab.) oficial: APENAS abate + venda + consumo (TIPOS_DESFRUTE_GLOBAL).
  // Fonte: saidasDesfruteCabMensal vindo de lancPec filtrado. Sem fallback para
  // monthlyData.desfruteCab — se a série oficial não vier, mostra NaN/—.
  const desfruteCab = saidasDesfruteCabMensal ?? Array(12).fill(NaN);
  const desfrute_arr = d.desfrute_arr;
  const finEntradas = d.entFin;
  const finSaidas = d.saiFin;
  const finRecPec = d.recPec;
  const finResCaixa = d.resCaixa;
  // Use persisted snapshot values when available; fallback to calculation
  const valorPorCab = realValorCab && realValorCab.some(v => v > 0)
    ? d.valorRebFin.map((v, i) => realValorCab[i] || (cabFin[i] > 0 ? v / cabFin[i] : NaN))
    : d.valorRebFin.map((v, i) => { const c = cabFin[i]; return c > 0 ? v / c : NaN; });
  const valorPorArr = realPrecoArr && realPrecoArr.some(v => v > 0)
    ? d.valorRebFin.map((v, i) => realPrecoArr[i] || (pesoTotalFin[i] > 0 ? v / (pesoTotalFin[i] / 30) : NaN))
    : d.valorRebFin.map((v, i) => { const pf = pesoTotalFin[i]; return pf > 0 ? v / (pf / 30) : NaN; });

  // ─── Bloco "Financeiro Soberano (Auditoria)" ──────────────────────────
  // Visualização paralela ao bloco Financeiro (Caixa). Não substitui legado.
  // Cada série já vem como 12-array raw mensal — r() aplica a transformação
  // por aba (mensal/medio/acumulado/media_periodo) igual aos demais blocos.
  const blocoSoberano: Bloco | null = soberano
    ? {
        nome: 'Financeiro Soberano (Auditoria)',
        rows: [
          r('Custeio Pec. s/ juros',    'money', soberano.custeioPecSemJuros,  'sob_custeio_pec_sj'),
          r('Juros Pecuária',           'money', soberano.jurosPec,            'sob_juros_pec'),
          r('Custeio Pec. c/ juros',    'money', soberano.custeioPecComJuros,  'sob_custeio_pec_cj'),
          r('Invest. Fazenda Pec.',     'money', soberano.investFazendaPec,    'sob_inv_faz_pec'),
          r('Desembolso Pecuária',      'money', soberano.desembolsoPec,       'sob_desemb_pec'),
          r('Custeio Agri. s/ juros',   'money', soberano.custeioAgriSemJuros, 'sob_custeio_agri_sj'),
          r('Juros Agricultura',        'money', soberano.jurosAgri,           'sob_juros_agri'),
          r('Custeio Agri. c/ juros',   'money', soberano.custeioAgriComJuros, 'sob_custeio_agri_cj'),
          r('Invest. Fazenda Agri.',    'money', soberano.investFazendaAgri,   'sob_inv_faz_agri'),
          r('Desembolso Agricultura',   'money', soberano.desembolsoAgri,      'sob_desemb_agri'),
          r('Investimento em Bovinos',  'money', soberano.investBovinos,       'sob_inv_bov'),
          r('Amortizações',             'money', soberano.amortizacoes,        'sob_amort'),
          r('Dividendos / Retiradas',   'money', soberano.dividendos,          'sob_div'),
          r('Saídas Totais',            'money', soberano.saidasTotais,        'sob_saidas_totais'),
        ],
      }
    : null;

  // ─── Bloco "Endividamento" — Realizado/Global, Mensal e Acumulado ────
  // RPC fn_endividamento_mensal já retorna valores por mês (estoques + fluxos);
  // buildBlocoEndividamento aplica acumulação só nos fluxos quando modo='acumulado'.
  const blocoEndividamentoMensal: Bloco | null = endividamento
    ? buildBlocoEndividamento(endividamento, 'mensal')
    : null;
  const blocoEndividamentoAcum: Bloco | null = endividamento
    ? buildBlocoEndividamento(endividamento, 'acumulado')
    : null;

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho inicial (cab)', 'cab', cabIni, 'reb_inicial', true),
            r('Entradas (cab)', 'cab', d.entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', d.saidas, 'saidas_cab'),
            r('Rebanho final (cab)', 'cab', cabFin, 'reb_final', true),
            r('Rebanho médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção mensal (kg)', 'padrao', d.prodKg, 'prod_kg'),
            r('Arrobas produzidas', 'padrao', d.arrobasProd, 'arrobas_prod'),
            r('Arrobas/ha', 'med2', arrHa, 'arr_ha'),
            r('GMD (kg/cab/dia)', 'gmd', d.gmd, 'gmd'),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_mensal'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_mensal'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_mensal'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_mensal'),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_mensal'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        ...(blocoEndividamentoMensal ? [blocoEndividamentoMensal] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', d.valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCab, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArr, 'valor_arr_fin', true),
            r('Variação do Valor', 'money', d.varValorReb, 'var_valor_reb'),
          ],
        },
      ];

    case 'medio':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
            r('Peso méd. reb. (kg)', 'med2', pesoMedioFin, 'peso_med_reb', true),
            r('UA média', 'med2', uaMedia, 'ua_media', true),
            r('Lotação (UA/ha)', 'med2', lotUaHa, 'lotacao', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção média (kg)', 'padrao', d.prodKg, 'prod_kg_med'),
            r('Arrobas médias', 'padrao', d.arrobasProd, 'arrobas_prod_med'),
            r('Arrobas/ha média', 'med2', arrHa, 'arr_ha_med'),
            r('GMD médio', 'gmd', d.gmd, 'gmd_med', true),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_med'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_med'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_med'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_med'),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_med'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', d.valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCab, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArr, 'valor_arr_fin', true),
          ],
        },
      ];

    case 'acumulado':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Entradas Acumuladas (cab)', 'cab', d.entradas, 'entradas_acum'),
            r('Saídas Acumuladas (cab)', 'cab', d.saidas, 'saidas_acum'),
            r('Saldo Acumulado (cab)', 'cab', d.entradas.map((v, i) => v - d.saidas[i]), 'saldo_acum'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção acumulada (kg)', 'padrao', d.prodKg, 'prod_kg_acum'),
            r('Arrobas acumuladas', 'padrao', d.arrobasProd, 'arrobas_acum'),
            r('Arrobas/ha acumulado', 'med2', arrHa, 'arr_ha_acum'),
            r('Desfrute Acumulado (cab)', 'cab', desfruteCab, 'desfrute_acum_cab'),
            r('Desfrute Acumulado (@)', 'padrao', desfrute_arr, 'desfrute_acum_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_acum'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_acum'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_acum'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_acum'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        ...(blocoEndividamentoAcum ? [blocoEndividamentoAcum] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', d.valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCab, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArr, 'valor_arr_fin', true),
            r('Variação do Valor', 'money', d.varValorReb, 'var_valor_reb'),
          ],
        },
      ];

    case 'media_periodo': {
      const diasMes = Array.from({ length: 12 }, (_, i) => new Date(new Date().getFullYear(), i + 1, 0).getDate());
      const gmdPeriodo = computePeriodGmd(d.prodKg, cabMedia, diasMes);
      const rebMedioPeriodoVals = rollingAvg(cabMedia);
      return [
        {
          nome: 'Rebanho',
          rows: [
            { indicador: 'Rebanho médio período (cab)', format: 'cab', valores: rebMedioPeriodoVals.map(v => Math.round(v)), indicadorId: 'reb_medio_periodo', noTotal: true },
            r('Peso médio período (kg)', 'med2', pesoMedioFin, 'peso_medio_periodo', true),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo', true),
            r('Lotação média (UA/ha)', 'med2', lotUaHa, 'lotacao_media', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção média do período (@)', 'padrao', d.arrobasProd, 'prod_media_arr', true),
            r('Produção média do período (kg)', 'padrao', d.prodKg, 'prod_media_kg', true),
            r('Arrobas/ha período', 'med2', arrHa, 'arr_ha_media', true),
            { indicador: 'GMD do período', format: 'gmd', valores: gmdPeriodo, indicadorId: 'gmd_periodo', noTotal: true },
            r('Desfrute médio período (cab)', 'cab', desfruteCab, 'desfrute_cab_periodo', true),
            r('Desfrute médio período (@)', 'padrao', desfrute_arr, 'desfrute_arr_periodo', true),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_periodo'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_periodo'),
            r('Receita Pecuária', 'money', finRecPec, 'receita_media', true),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_medio', true),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_medio', true),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', d.valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCab, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArr, 'valor_arr_fin', true),
          ],
        },
      ];
    }

    default:
      return [];
}
}

// Helper compartilhado pelos builders META — monta o bloco "Financeiro Soberano
// (Auditoria)" usando o `r()` local de cada caller. Retorna null quando soberano
// é undefined. 14 linhas idênticas ao definido em buildBlocosForTab (Realizado).
function buildBlocoSoberano(
  soberano: SoberanoSerie12 | undefined,
  r: (indicador: string, format: PainelFormatType, raw: number[], indicadorId?: string, noTotal?: boolean) => Row,
): Bloco | null {
  if (!soberano) return null;
  return {
    nome: 'Financeiro Soberano (Auditoria)',
    rows: [
      r('Custeio Pec. s/ juros',    'money', soberano.custeioPecSemJuros,  'sob_custeio_pec_sj'),
      r('Juros Pecuária',           'money', soberano.jurosPec,            'sob_juros_pec'),
      r('Custeio Pec. c/ juros',    'money', soberano.custeioPecComJuros,  'sob_custeio_pec_cj'),
      r('Invest. Fazenda Pec.',     'money', soberano.investFazendaPec,    'sob_inv_faz_pec'),
      r('Desembolso Pecuária',      'money', soberano.desembolsoPec,       'sob_desemb_pec'),
      r('Custeio Agri. s/ juros',   'money', soberano.custeioAgriSemJuros, 'sob_custeio_agri_sj'),
      r('Juros Agricultura',        'money', soberano.jurosAgri,           'sob_juros_agri'),
      r('Custeio Agri. c/ juros',   'money', soberano.custeioAgriComJuros, 'sob_custeio_agri_cj'),
      r('Invest. Fazenda Agri.',    'money', soberano.investFazendaAgri,   'sob_inv_faz_agri'),
      r('Desembolso Agricultura',   'money', soberano.desembolsoAgri,      'sob_desemb_agri'),
      r('Investimento em Bovinos',  'money', soberano.investBovinos,       'sob_inv_bov'),
      r('Amortizações',             'money', soberano.amortizacoes,        'sob_amort'),
      r('Dividendos / Retiradas',   'money', soberano.dividendos,          'sob_div'),
      r('Saídas Totais',            'money', soberano.saidasTotais,        'sob_saidas_totais'),
    ],
  };
}

// ─── Build blocos from vw_zoot_fazenda_mensal (for Meta cenário) ───
function buildBlocosFromZootMensal(rows: ZootMensal[], tab: ViewTab, valorRebanhoMetaMes?: number[], valorRebanhoMetaMesAnteriorOuDez?: number[], metaValorCabMes?: number[], metaPrecoArrMes?: number[], pesoSnap?: PesoSnapshot, dezRealizadoSnap?: { cabecas: number; pesoMedioKg: number; arrobas: number }, finMeta?: FinMetaPainel | null, soberano?: SoberanoSerie12, arrobasSaidasMensal?: number[], caixaSaldoMensal?: number[], saidasDesfruteCabMensal?: number[], pcd?: ReturnType<typeof usePainelConsultorData> | null): Bloco[] {
  // Saldo bancário consolidado (estoque) Jan..Dez — alimenta "Saldo Final de Caixa".
  const _saldoCaixaMes12: number[] = caixaSaldoMensal ?? Array(12).fill(NaN);
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
    : (cabIni[0] > 0 ? pesoIni[0] / cabIni[0] : NaN);
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
  // Desfrute (cab.) oficial: APENAS abate + venda + consumo. NUNCA mortes ou
  // transferências. Fonte: saidasDesfruteCabMensal (calculado fora a partir de
  // lancPec/lancPecMeta filtrando TIPOS_DESFRUTE_GLOBAL). Sem fallback para
  // `saidas` — se a série oficial não existir, mostra NaN/— (NUNCA reintroduz
  // morte/transferência).
  const desfruteCab = saidasDesfruteCabMensal ?? Array(12).fill(NaN);
  // Desfrute @ vem pré-calculado por lançamento (calcArrobasSafe + TIPOS_DESFRUTE_GLOBAL).
  // abate: pesoCarcacaKg/15; venda/consumo: pesoMedioKg/30; exclui transferencia_saida.
  const desfrute_arr = arrobasSaidasMensal
    ? arrobasSaidasMensal.map(v => v > 0 ? v : NaN)
    : saidas.map((v, i) => pesoMedFin[i] > 0 ? (v * pesoMedFin[i]) / 30 : NaN);

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
  const finResOper = noFinMeta ? nanArr : finMeta.resOper;
  const finCustoProd    = noFinMeta ? nanArr : finMeta.custoProd;
  const finRecOper      = noFinMeta ? nanArr : finMeta.recOper;
  const finOutrasSaidas = noFinMeta ? nanArr : finMeta.outrasSaidas;
  const finResFinal     = noFinMeta ? nanArr : finMeta.resFinal;

  const vrm = valorRebanhoMetaMes || Array(12).fill(0);
  const vrmIni = valorRebanhoMetaMesAnteriorOuDez || Array(12).fill(0);
  const valorPorCabMeta = cabFin.map((c, i) => {
    if (metaValorCabMes && metaValorCabMes[i] > 0) return metaValorCabMes[i];
    return c > 0 && vrm[i] > 0 ? vrm[i] / c : NaN;
  });
  const valorPorArrMeta = pesoFin.map((peso, i) => {
    if (metaPrecoArrMes && metaPrecoArrMes[i] > 0) return metaPrecoArrMes[i];
    const arrobas = peso > 0 ? peso / 30 : NaN;
    return arrobas > 0 && vrm[i] > 0 ? vrm[i] / arrobas : NaN;
  });

  const diasMesPeriodo = Array.from({ length: 12 }, (_, i) => {
    const m = byMes[String(i + 1).padStart(2, '0')];
    return m ? (Number(m.dias_mes) || new Date(new Date().getFullYear(), i + 1, 0).getDate()) : new Date(new Date().getFullYear(), i + 1, 0).getDate();
  });
  const gmdPeriodo = computePeriodGmd(prodKg, cabMedia, diasMesPeriodo);
  const rebMedioPeriodoVals = rollingAvg(cabMedia);

  // Bloco "Financeiro Soberano (Auditoria)" — helper compartilhado
  const blocoSoberano = buildBlocoSoberano(soberano, r);

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho inicial (cab)', 'cab', cabIni, 'reb_inicial', true),
            r('Entradas (cab)', 'cab', entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', saidas, 'saidas_cab'),
            r('Rebanho final (cab)', 'cab', cabFin, 'reb_final', true),
            r('Rebanho médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção mensal (kg)', 'padrao', prodKg, 'prod_kg'),
            r('Arrobas produzidas', 'padrao', arrobasProd, 'arrobas_prod'),
            r('Arrobas/ha', 'med2', arrHa, 'arr_ha'),
            r('GMD (kg/cab/dia)', 'gmd', gmd, 'gmd'),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_mensal'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_mensal'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_mensal'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_mensal'),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_mensal'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', vrm, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
            r('Variação do Valor', 'money', emptyMoney, 'var_valor_reb'),
          ],
        },
      ];
    case 'medio':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
            r('Peso méd. reb. (kg)', 'med2', pesoMedFin, 'peso_med_reb', true),
            r('UA média', 'med2', uaMedia, 'ua_media', true),
            r('Lotação (UA/ha)', 'med2', lotacao, 'lotacao', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção média (kg)', 'padrao', prodKg, 'prod_kg_med'),
            r('Arrobas médias', 'padrao', arrobasProd, 'arrobas_prod_med'),
            r('Arrobas/ha média', 'med2', arrHa, 'arr_ha_med'),
            r('GMD médio', 'gmd', gmd, 'gmd_med', true),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_med'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_med'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_med'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_med'),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_med'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', vrm, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
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
            r('Produção acumulada (kg)', 'padrao', prodKg, 'prod_kg_acum'),
            r('Arrobas acumuladas', 'padrao', arrobasProd, 'arrobas_acum'),
            r('Arrobas/ha acumulado', 'med2', arrHa, 'arr_ha_acum'),
            r('Desfrute acum. (cab)', 'cab', desfruteCab, 'desfrute_acum_cab'),
            r('Desfrute acum. (@)', 'padrao', desfrute_arr, 'desfrute_acum_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_acum'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_acum'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_acum'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_acum'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', vrm, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
            r('Variação do Valor', 'money', emptyMoney, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo':
      return [
        {
          nome: 'Rebanho',
          rows: [
            { indicador: 'Rebanho médio período (cab)', format: 'cab', valores: rebMedioPeriodoVals.map(v => Math.round(v)), indicadorId: 'reb_medio_periodo', noTotal: true },
            r('Peso médio período (kg)', 'med2', pesoMedFin, 'peso_medio_periodo'),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo'),
            r('Lotação média (UA/ha)', 'med2', lotacao, 'lotacao_media'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção média do período (@)', 'padrao', arrobasProd, 'prod_media_arr', true),
            r('Produção média do período (kg)', 'padrao', prodKg, 'prod_media_kg', true),
            r('Arrobas/ha período', 'med2', arrHa, 'arr_ha_media', true),
            r('Desfrute médio período (cab)', 'cab', desfruteCab, 'desfrute_cab_periodo', true),
            r('Desfrute médio período (@)', 'padrao', desfrute_arr, 'desfrute_arr_periodo', true),
            { indicador: 'GMD do período', format: 'gmd', valores: gmdPeriodo, indicadorId: 'gmd_periodo', noTotal: true },
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_periodo'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_periodo'),
            r('Receita Pecuária', 'money', finRecPec, 'receita_media', true),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_medio', true),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_medio', true),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', vrm, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
          ],
        },
      ];
    default:
      return [];
  }
}

// ─── Build blocos from MetaConsolidacao (validated consolidation) ───
function buildBlocosFromMetaConsolidacao(consolidacao: MetaCategoriaMes[], tab: ViewTab, areaProd: number, gmdMetaRows: MetaGmdRow[], valorRebanhoMetaMes?: number[], dezAnoAnteriorRealizado?: number, metaValorCabMes?: number[], metaPrecoArrMes?: number[], pesoSnap?: PesoSnapshot, dezRealizadoSnap?: { cabecas: number; pesoMedioKg: number; arrobas: number }, finMeta?: FinMetaPainel | null, soberano?: SoberanoSerie12, arrobasSaidasMensal?: number[], caixaSaldoMensal?: number[], saidasDesfruteCabMensal?: number[], pcd?: ReturnType<typeof usePainelConsultorData> | null): Bloco[] {
  // Saldo bancário consolidado (estoque) Jan..Dez — alimenta "Saldo Final de Caixa".
  const _saldoCaixaMes12: number[] = caixaSaldoMensal ?? Array(12).fill(NaN);
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
    return sf > 0 ? pesoFinRaw[i] / sf : NaN;
  });
  const pesoMedFin = hasSnap ? pesoSnap!.pesoMedio : pesoMedFinRaw;

  // Peso médio ini: Jan = Dez realizado validado pesoMedioKg; Fev+ = meta final mês anterior
  const pesoMedIniJan = dezRealizadoSnap && dezRealizadoSnap.pesoMedioKg > 0
    ? dezRealizadoSnap.pesoMedioKg
    : (cabIni[0] > 0 ? pesoIni[0] / cabIni[0] : NaN);
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

  const uaMedia = cabMedia.map((v, i) => pesoMedFin[i] > 0 ? (v * pesoMedFin[i]) / 450 : NaN);
  const lotacao = uaMedia.map(v => areaProd > 0 ? v / areaProd : NaN);
  const arrHa = arrobasProd.map(v => areaProd > 0 ? v / areaProd : NaN);
  // Desfrute (cab.) oficial: APENAS abate + venda + consumo. NUNCA mortes ou
  // transferências. Fonte: saidasDesfruteCabMensal (calculado fora a partir de
  // lancPec/lancPecMeta filtrando TIPOS_DESFRUTE_GLOBAL). Sem fallback para
  // `saidas` — se a série oficial não existir, mostra NaN/— (NUNCA reintroduz
  // morte/transferência).
  const desfruteCab = saidasDesfruteCabMensal ?? Array(12).fill(NaN);
  // Desfrute @ vem pré-calculado por lançamento (calcArrobasSafe + TIPOS_DESFRUTE_GLOBAL).
  // abate: pesoCarcacaKg/15; venda/consumo: pesoMedioKg/30; exclui transferencia_saida.
  const desfrute_arr = arrobasSaidasMensal
    ? arrobasSaidasMensal.map(v => v > 0 ? v : NaN)
    : saidas.map((v, i) => pesoMedFin[i] > 0 ? (v * pesoMedFin[i]) / 30 : NaN);

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
  const finResOper = noFinMeta ? nanArr : finMeta.resOper;
  const finCustoProd    = noFinMeta ? nanArr : finMeta.custoProd;
  const finRecOper      = noFinMeta ? nanArr : finMeta.recOper;
  const finOutrasSaidas = noFinMeta ? nanArr : finMeta.outrasSaidas;
  const finResFinal     = noFinMeta ? nanArr : finMeta.resFinal;

  // Valor do Rebanho META: lido do snapshot validado (valor_rebanho_meta_validada)
  const vrm = valorRebanhoMetaMes || Array(12).fill(0);
  const valorRebFin = vrm;
  // Valor reb. ini META: Jan = realizado Dez ano anterior, Fev+ = META final mês anterior
  const valorRebIni = [dezAnoAnteriorRealizado ?? 0, ...vrm.slice(0, 11)];
  const valorPorCabMeta = cabFin.map((c, i) => {
    // Prefer persisted valor_cabeca_medio, fallback to calculation
    if (metaValorCabMes && metaValorCabMes[i] > 0) return metaValorCabMes[i];
    return c > 0 && vrm[i] > 0 ? vrm[i] / c : NaN;
  });
  const arrobasEstoqueMeta = pesoFin.map(v => v / 30);
  const valorPorArrMeta = arrobasEstoqueMeta.map((a, i) => {
    // Prefer persisted preco_arroba_medio, fallback to calculation
    if (metaPrecoArrMes && metaPrecoArrMes[i] > 0) return metaPrecoArrMes[i];
    return a > 0 && vrm[i] > 0 ? vrm[i] / a : NaN;
  });
  const varValorRebMeta = valorRebFin.map((v, i) => v - valorRebIni[i]);

  const diasMesPeriodo = Array.from({ length: 12 }, (_, i) => {
    const row = consolidacao.find(c => c.mes === String(i + 1).padStart(2, '0'));
    return Number(row?.dias) || new Date(new Date().getFullYear(), i + 1, 0).getDate();
  });
  const gmdPeriodo = computePeriodGmd(prodBio, cabMedia, diasMesPeriodo);
  const rebMedioPeriodoVals = rollingAvg(cabMedia);

  // Bloco "Financeiro Soberano (Auditoria)" — helper compartilhado
  const blocoSoberano = buildBlocoSoberano(soberano, r);

  switch (tab) {
    case 'mensal':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho inicial (cab)', 'cab', cabIni, 'reb_inicial', true),
            r('Entradas (cab)', 'cab', entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', saidas, 'saidas_cab'),
            r('Rebanho final (cab)', 'cab', cabFin, 'reb_final', true),
            r('Rebanho médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção mensal (kg)', 'padrao', prodKgArr, 'prod_kg'),
            r('Arrobas produzidas', 'padrao', arrobasProd, 'arrobas_prod'),
            r('Arrobas/ha', 'med2', arrHa, 'arr_ha'),
            r('GMD (kg/cab/dia)', 'gmd', gmd, 'gmd'),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_mensal'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_mensal'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_mensal'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_mensal'),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_mensal'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
            r('Variação do Valor', 'money', varValorRebMeta, 'var_valor_reb'),
          ],
        },
      ];
    case 'medio':
      return [
        {
          nome: 'Rebanho',
          rows: [
            r('Rebanho médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio', true),
            r('Peso méd. reb. (kg)', 'med2', pesoMedFin, 'peso_med_reb', true),
            r('UA média', 'med2', uaMedia, 'ua_media', true),
            r('Lotação (UA/ha)', 'med2', lotacao, 'lotacao', true),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção média (kg)', 'padrao', prodKgArr, 'prod_kg_med'),
            r('Arrobas médias', 'padrao', arrobasProd, 'arrobas_prod_med'),
            r('Arrobas/ha média', 'med2', arrHa, 'arr_ha_med'),
            r('GMD médio', 'gmd', gmd, 'gmd_med', true),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_med'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_med'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_med'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_med'),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_med'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
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
            r('Produção acumulada (kg)', 'padrao', prodKgArr, 'prod_kg_acum'),
            r('Arrobas acumuladas', 'padrao', arrobasProd, 'arrobas_acum'),
            r('Arrobas/ha acumulado', 'med2', arrHa, 'arr_ha_acum'),
            r('Desfrute acum. (cab)', 'cab', desfruteCab, 'desfrute_acum_cab'),
            r('Desfrute acum. (@)', 'padrao', desfrute_arr, 'desfrute_acum_arr'),
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_acum'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_acum'),
            r('Receita Pecuária', 'money', finRecPec, 'rec_pec_acum'),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_acum'),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
            r('Variação do Valor', 'money', varValorRebMeta, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo':
      return [
        {
          nome: 'Rebanho',
          rows: [
            { indicador: 'Rebanho médio período (cab)', format: 'cab', valores: rebMedioPeriodoVals.map(v => Math.round(v)), indicadorId: 'reb_medio_periodo', noTotal: true },
            r('Peso médio período (kg)', 'med2', pesoMedFin, 'peso_medio_periodo'),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo'),
            r('Lotação média (UA/ha)', 'med2', lotacao, 'lotacao_media'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('Produção média do período (@)', 'padrao', arrobasProd, 'prod_media_arr', true),
            r('Produção média do período (kg)', 'padrao', prodKgArr, 'prod_media_kg', true),
            r('Arrobas/ha período', 'med2', arrHa, 'arr_ha_media', true),
            r('Desfrute médio período (cab)', 'cab', desfruteCab, 'desfrute_cab_periodo', true),
            r('Desfrute médio período (@)', 'padrao', desfrute_arr, 'desfrute_arr_periodo', true),
            { indicador: 'GMD do período', format: 'gmd', valores: gmdPeriodo, indicadorId: 'gmd_periodo', noTotal: true },
          ],
        },
        {
          nome: 'Financeiro (Caixa)',
          rows: [
            r('Entradas Financeiras', 'money', finEntradas, 'ent_fin_periodo'),
            r('Saídas Financeiras', 'money', finSaidas, 'sai_fin_periodo'),
            r('Receita Pecuária', 'money', finRecPec, 'receita_media', true),
            r('Resultado de Caixa', 'money', finResCaixa, 'res_caixa_medio', true),
            r('Saldo Final de Caixa', 'money', _saldoCaixaMes12, 'saldo_caixa_medio', true),
          ],
        },
        ...(blocoSoberano ? [blocoSoberano] : []),
        {
          nome: 'Patrimônio',
          rows: [
            r('Valor do Rebanho', 'moneyInt', valorRebFin, 'valor_reb_fin', true),
            r('Valor por Cabeça', 'money', valorPorCabMeta, 'valor_cab_fin', true),
            r('Valor por Arroba', 'money', valorPorArrMeta, 'valor_arr_fin', true),
          ],
        },
      ];
    default:
      return [];
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
function getCurrentMonthCutoff(anoNum: number, filtroMes?: number | null): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ano futuro: nada
  if (anoNum > currentYear) return 0;

  // filtro de mês explícito (1-12): vira autoridade
  if (filtroMes && filtroMes >= 1 && filtroMes <= 12) return filtroMes;

  // sem filtro: comportamento padrão (ano passado=12, ano corrente=mes atual)
  if (anoNum < currentYear) return 12;
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
  // useLancamentos() default cenario='realizado' — para arrobasSaidasMeta12 precisamos
  // de lançamentos META explicitamente. Sem isso o array fica sempre zerado e Desfrute(@) META vazio.
  const { lancamentos: lancPecMeta } = useLancamentos({ cenario: 'meta' });
  const { lancamentos: lancFin } = useFinanceiro();

  const ano = filtroGlobal?.ano || String(new Date().getFullYear());
  const [viewTab, setViewTab] = useState<ViewTab>('mensal');
  const [cenario, setCenario] = useState<Cenario>('realizado');
  const [valorRebanhoMes, setValorRebanhoMes] = useState<number[]>(Array(13).fill(0));
  const [openBlocos, setOpenBlocos] = useState<Record<string, boolean>>({});
  const [showDivP1, setShowDivP1] = useState(false);
  const [showReabrirP1, setShowReabrirP1] = useState(false);

  const anoNum = Number(ano);

  // usePlanejamentoFinanceiro movido para CIMA (A4) — necessário para materializar
  // gridMeta antes de chamar usePainelConsultorData. buildGridMeta passa a alimentar
  // o slot serieMeta dos 13 indicadores soberanos via gridMetaExterno (somente quando
  // cenario === 'meta', para evitar custo no Realizado).
  const fazendaId = fazendaAtual?.id;

  const {
    buildGrid: buildGridMeta,
    lancamentosNutricao: lancNutricaoMeta,
    lancamentosFinanciamento: lancFinanciamentoMeta,
    lancamentosRebanho: lancRebanhoMeta,
    lancamentosProjetos: lancProjetosMeta,
  } = usePlanejamentoFinanceiro(anoNum, fazendaId);

  // Materializa grid META para alimentar usePainelConsultorData (A4).
  // Gate: SOMENTE quando cenario === 'meta'. No Realizado, retorna undefined
  // — evita custo de buildGridMeta() e mantém slot serieMeta dos indicadores
  // soberanos como undefined (comportamento idêntico ao anterior).
  const gridMetaPara_PCD = useMemo<SubcentroGrid[] | undefined>(
    () => {
      if (cenario !== 'meta') return undefined;
      const grid = buildGridMeta?.() ?? [];
      return grid.length > 0 ? grid : undefined;
    },
    [cenario, buildGridMeta],
  );

  // ─── Indicadores financeiros SOBERANOS (Etapa 2C) — bloco "Financeiro Soberano (Auditoria)".
  // Consome usePainelConsultorData passando lancFin/lancPec já carregados (sem refetch).
  // viewMode='mes' garante que indicador.serieAno[1..12] seja RAW mensal — r() aplica
  // a transformação por aba (mensal/medio/acumulado/media_periodo) dentro de buildBlocosForTab.
  // gridMetaExterno (A4) alimenta o slot serieMeta nos 13 indicadores soberanos
  // — populado SOMENTE quando cenario === 'meta'.
  const pcdSoberano = usePainelConsultorData({
    ano: anoNum,
    mes: filtroGlobal?.mes || (new Date().getMonth() + 1),
    viewMode: 'mes',
    lancPecExterno: lancPec.length > 0 ? lancPec : undefined,
    lancFinExterno: lancFin.length > 0 ? lancFin : undefined,
    gridMetaExterno: gridMetaPara_PCD,
  });

  // ─── Endividamento (Realizado/Global do cliente) — RPC fn_endividamento_mensal ───
  const endividamento = useEndividamentoMensal(anoNum);

  // ─── Status dos pilares de governança (mês atual selecionado) ───
  const mesAtualRef = useMemo(() => {
    const m = filtroGlobal?.mes || new Date().getMonth() + 1;
    return `${ano}-${String(m).padStart(2, '0')}`;
  }, [ano, filtroGlobal?.mes]);
  const { status: statusPilares, refetch: refetchPilares } = useStatusPilares(fazendaId, mesAtualRef);
  const { rawFazenda: zootMeta, rawCategorias: viewCategoriasMeta } = useRebanhoOficial({ ano: anoNum, cenario: 'meta' });
  const { rows: gmdMetaRows } = useMetaGmd(ano);
  const { clienteAtual } = useCliente();

  // ─── Auditoria multi-ano de Custo Cab. R$/cab.mês (mesma fórmula oficial) ───
  // Bloco compacto para conferência cruzada com o gráfico histórico do modal.
  // NÃO é fonte paralela: usa o mesmo SQL/filtros/fórmula que usePainelConsultorData
  // aplica para o ano corrente, replicado para cada ano do range [-6, atual].
  const { statusArray: snapshotStatusArray, isComprometido: isSnapshotComprometido, getStatusByMonth } = useSnapshotStatus(anoNum);

  // Leitura oficial do Valor do Rebanho META validado (tabela valor_rebanho_meta_validada)
  const [valorRebanhoMetaMes, setValorRebanhoMetaMes] = useState<number[]>(Array(12).fill(0));
  const [metaValorCabMes, setMetaValorCabMes] = useState<number[]>(Array(12).fill(0));
  const [metaPrecoArrMes, setMetaPrecoArrMes] = useState<number[]>(Array(12).fill(0));
  const [metaPesoSnap, setMetaPesoSnap] = useState<PesoSnapshot>({ cabecas: Array(12).fill(0), pesoMedio: Array(12).fill(0), arrobas: Array(12).fill(0) });

  useEffect(() => {
    const cid = clienteAtual?.id;
    if (!cid) return;
    if (!isGlobal && (!fazendaId || fazendaId === '__global__')) return;

    const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);
    // Sem filtro de status — alinha com MetaPrecoTab (fonte oficial). O snapshot
    // é considerado autoritativo independente do status (ver auditoria meta).
    let q = supabase
      .from('valor_rebanho_meta_validada' as any)
      .select('ano_mes, valor_total, valor_cabeca_medio, preco_arroba_medio, cabecas, peso_medio_kg, arrobas_total')
      .eq('cliente_id', cid)
      .in('ano_mes', meses);
    if (!isGlobal) q = q.eq('fazenda_id', fazendaId);

    q.then(({ data, error }) => {
      if (error || !data) return;
      // Agregação por ano_mes — soma de fazendas validadas no Global; 1 só registro p/ Fazenda.
      const valor = Array(12).fill(0);
      const cab   = Array(12).fill(0);
      const arr   = Array(12).fill(0);
      const pTot  = Array(12).fill(0);   // peso_total ponderado p/ derivar peso_medio
      (data as any[]).forEach((row: any) => {
        const idx = meses.indexOf(row.ano_mes);
        if (idx < 0) return;
        const v   = Number(row.valor_total)     || 0;
        const c   = Number(row.cabecas)         || 0;
        const a   = Number(row.arrobas_total)   || 0;
        const pm0 = Number(row.peso_medio_kg)   || 0;
        valor[idx] += v;
        cab[idx]   += c;
        arr[idx]   += a;
        pTot[idx]  += pm0 * c;   // peso total estimado = peso_medio × cabecas
      });
      const pm  = pTot.map((pt, i)  => cab[i]  > 0 ? pt / cab[i]  : 0);
      const vcm = valor.map((v, i)  => cab[i]  > 0 ? v  / cab[i]  : 0);
      const vam = valor.map((v, i)  => arr[i]  > 0 ? v  / arr[i]  : 0);

      setValorRebanhoMetaMes(valor);
      setMetaValorCabMes(vcm);
      setMetaPrecoArrMes(vam);
      setMetaPesoSnap({ cabecas: cab, pesoMedio: pm, arrobas: arr });
    });
  }, [fazendaId, isGlobal, clienteAtual?.id, anoNum]);
  // FONTE OFICIAL: useRebanhoOficial (camada única obrigatória)
  const { rawCategorias: viewDataRealizado } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado', global: isGlobal });

  // Month cutoff: months > cutoff are blank
  const monthCutoff = useMemo(
    () => getCurrentMonthCutoff(anoNum, filtroGlobal?.mes),
    [anoNum, filtroGlobal?.mes]
  );

  // ── Leitura oficial do Valor do Rebanho REALIZADO validado ──
  const [realValorCabMes, setRealValorCabMes] = useState<number[]>(Array(13).fill(0));
  const [realPrecoArrMes, setRealPrecoArrMes] = useState<number[]>(Array(13).fill(0));
  const [realPesoSnap, setRealPesoSnap] = useState<PesoSnapshot>({ cabecas: Array(13).fill(0), pesoMedio: Array(13).fill(0), arrobas: Array(13).fill(0) });

  const clienteId = clienteAtual?.id;

  useEffect(() => {
    if (!fazendaId) {
      setValorRebanhoMes(Array(13).fill(0));
      setRealValorCabMes(Array(13).fill(0));
      setRealPrecoArrMes(Array(13).fill(0));
      setRealPesoSnap({ cabecas: Array(13).fill(0), pesoMedio: Array(13).fill(0), arrobas: Array(13).fill(0) });
      return;
    }
    (async () => {
      const dezAnoAnterior = `${anoNum - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      if (isGlobal) {
        // GLOBAL: ler view agregada no banco — sem cálculo no front
        if (!clienteId) {
          setValorRebanhoMes(Array(13).fill(NaN));
          setRealValorCabMes(Array(13).fill(NaN));
          setRealPrecoArrMes(Array(13).fill(NaN));
          setRealPesoSnap({ cabecas: Array(13).fill(NaN), pesoMedio: Array(13).fill(NaN), arrobas: Array(13).fill(NaN) });
          return;
        }
        const { data, error } = await supabase
          .from('vw_valor_rebanho_realizado_global_mensal' as any)
          .select('ano_mes, valor_total, valor_cabeca_medio, preco_arroba_medio, cabecas, peso_medio_kg, arrobas_total')
          .eq('cliente_id', clienteId)
          .in('ano_mes', todasMeses);
        if (error || !data?.length) {
          setValorRebanhoMes(Array(13).fill(NaN));
          setRealValorCabMes(Array(13).fill(NaN));
          setRealPrecoArrMes(Array(13).fill(NaN));
          setRealPesoSnap({ cabecas: Array(13).fill(NaN), pesoMedio: Array(13).fill(NaN), arrobas: Array(13).fill(NaN) });
          return;
        }
        const byMes = Object.fromEntries((data as any[]).map((r: any) => [r.ano_mes, r]));
        setValorRebanhoMes(todasMeses.map(m => byMes[m] ? Number(byMes[m].valor_total) : NaN));
        setRealValorCabMes(todasMeses.map(m => byMes[m] ? Number(byMes[m].valor_cabeca_medio) : NaN));
        setRealPrecoArrMes(todasMeses.map(m => byMes[m] ? Number(byMes[m].preco_arroba_medio) : NaN));
        setRealPesoSnap({
          cabecas: todasMeses.map(m => byMes[m] ? Number(byMes[m].cabecas) : NaN),
          pesoMedio: todasMeses.map(m => byMes[m] ? Number(byMes[m].peso_medio_kg) : NaN),
          arrobas: todasMeses.map(m => byMes[m] ? Number(byMes[m].arrobas_total) : NaN),
        });
        return;
      }

      // FAZENDA INDIVIDUAL: código original mantido sem alteração
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
      const validRows = (data as any[] || []).filter((row: any) => row.status === 'validado');
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
  }, [fazendaId, anoNum, fazendas, isGlobal, clienteId]);

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

  // F1C_DEBUG — remover após diagnóstico
  useEffect(() => {
    if (!isPrevisto) return;
    const _grid = buildGridMeta();
    console.log('F1C_DEBUG', {
      isPrevisto,
      anoNum,
      fazendaId,
      gridLength: _grid.length,
      finMetaPainel,
    });
    if (finMetaPainel) {
      console.log('F1C_SERIES', {
        entradas: finMetaPainel.entradas,
        saidas: finMetaPainel.saidas,
        recPec: finMetaPainel.recPec,
        custoProd: finMetaPainel.custoProd,
      });
    }
  }, [isPrevisto, anoNum, fazendaId, finMetaPainel, buildGridMeta]);

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

  // Série soberana 12-mensal por indicador para o bloco "Financeiro Soberano (Auditoria)".
  // Cada indicador.serieAno tem 13 posições; [0]=NaN contexto, [1..12]=Jan..Dez raw (porque
  // chamamos usePCD com viewMode='mes'). NaNs são neutralizados para 0 — coluna em branco
  // só aconteceria por loading; o bloco fica oculto até pcdSoberano.custeioPecIndicador existir.
  const soberanoSerie = useMemo<SoberanoSerie12 | undefined>(() => {
    // A5: slice12 cenario-aware. Em modo Meta, usa serieMeta (populada via gridMetaExterno em A4).
    // Quando serieMeta é undefined (cliente sem META configurada), retorna Array(12).fill(0) — zeros.
    // Meta NUNCA faz fallback para Realizado (regra do catálogo: permite_fallback: false).
    const slice12 = (ind: { serieAno: number[]; serieMeta?: number[] } | null | undefined) => {
      const serie = isPrevisto ? ind?.serieMeta : ind?.serieAno;
      return serie ? serie.slice(1, 13).map(v => (typeof v === 'number' && !isNaN(v) ? v : 0)) : Array(12).fill(0);
    };
    if (!pcdSoberano.custeioPecIndicador) return undefined;
    return {
      custeioPecSemJuros:  slice12(pcdSoberano.custeioPecIndicador),
      jurosPec:            slice12(pcdSoberano.jurosPecIndicador),
      custeioPecComJuros:  slice12(pcdSoberano.custeioPecComJurosIndicador),
      investFazendaPec:    slice12(pcdSoberano.investPecIndicador),
      desembolsoPec:       slice12(pcdSoberano.desembolsoPecIndicador),
      custeioAgriSemJuros: slice12(pcdSoberano.custeioAgriIndicador),
      jurosAgri:           slice12(pcdSoberano.jurosAgriIndicador),
      custeioAgriComJuros: slice12(pcdSoberano.custeioAgriComJurosIndicador),
      investFazendaAgri:   slice12(pcdSoberano.investAgriIndicador),
      desembolsoAgri:      slice12(pcdSoberano.desembolsoAgriIndicador),
      investBovinos:       slice12(pcdSoberano.investBovinosIndicador),
      amortizacoes:        slice12(pcdSoberano.amortizacoesIndicador),
      dividendos:          slice12(pcdSoberano.dividendosIndicador),
      saidasTotais:        slice12(pcdSoberano.saidasTotaisIndicador),
    };
  }, [
    pcdSoberano.custeioPecIndicador,
    pcdSoberano.jurosPecIndicador,
    pcdSoberano.custeioPecComJurosIndicador,
    pcdSoberano.investPecIndicador,
    pcdSoberano.desembolsoPecIndicador,
    pcdSoberano.custeioAgriIndicador,
    pcdSoberano.jurosAgriIndicador,
    pcdSoberano.custeioAgriComJurosIndicador,
    pcdSoberano.investAgriIndicador,
    pcdSoberano.desembolsoAgriIndicador,
    pcdSoberano.investBovinosIndicador,
    pcdSoberano.amortizacoesIndicador,
    pcdSoberano.dividendosIndicador,
    pcdSoberano.saidasTotaisIndicador,
    isPrevisto,
  ]);

  // ─── C4.2 — Bloco "ÁREAS — USO DO SOLO" (tab-aware) ───────────────────
  // Estoque mensal — NÃO acumula em viewMode='periodo'.
  // Tab Realizado → snapshots oficiais (areaPecuariaRealPorMes etc).
  // Tab Meta      → planejamento_area_meta (areaPecuariaMetaPorMes etc).
  // SEM fallback entre as duas fontes.
  const areaPecMetaPorMes   = pcdSoberano.areaPecuariaMetaPorMes    ?? Array(12).fill(null);
  const areaAgriMetaPorMes  = pcdSoberano.areaAgriculturaMetaPorMes ?? Array(12).fill(null);
  const areaTotalMetaPorMes = pcdSoberano.areaTotalMetaPorMes       ?? Array(12).fill(null);
  const areaPecRealPorMes   = pcdSoberano.areaPecuariaRealPorMes    ?? Array(12).fill(null);
  const areaAgriRealPorMes  = pcdSoberano.areaAgriculturaRealPorMes ?? Array(12).fill(null);
  const areaProdRealPorMes  = pcdSoberano.areaProdutivaRealPorMes   ?? Array(12).fill(null);

  // Tab ativa decide a fonte exibida. isPrevisto=true → Meta; false → Realizado.
  const areaPecAtiva   = isPrevisto ? areaPecMetaPorMes   : areaPecRealPorMes;
  const areaAgriAtiva  = isPrevisto ? areaAgriMetaPorMes  : areaAgriRealPorMes;
  const areaTotalAtiva = isPrevisto ? areaTotalMetaPorMes : areaProdRealPorMes;

  const isAreaVazia =
    areaPecAtiva.every(v => v == null) &&
    areaAgriAtiva.every(v => v == null) &&
    areaTotalAtiva.every(v => v == null);

  const blocoAreas: Bloco = useMemo(() => {
    const toNan = (arr: (number | null)[]): number[] => arr.map(v => v == null ? NaN : v);
    return {
      nome: 'ÁREAS — USO DO SOLO',
      rows: [
        { indicador: 'Área Pecuária (ha)',    format: 'padrao', valores: toNan(areaPecAtiva),   indicadorId: 'area_pec',   noTotal: true },
        { indicador: 'Área Agricultura (ha)', format: 'padrao', valores: toNan(areaAgriAtiva),  indicadorId: 'area_agri',  noTotal: true },
        { indicador: 'Área Total (ha)',       format: 'padrao', valores: toNan(areaTotalAtiva), indicadorId: 'area_total', noTotal: true },
      ],
    };
  }, [areaPecAtiva, areaAgriAtiva, areaTotalAtiva]);

  // @ produzidas METa — Σ por mês via calcArrobasSafe (abate/15 c/ carcaça,
  // venda/consumo/30) sobre lançamentos cenario='meta'. Filtro TIPOS_DESFRUTE_GLOBAL
  // (exclui transferencia_saida — convenção V2 Visão Geral Rebanho).
  const arrobasSaidasMeta12 = useMemo(() => {
    const arr = new Array(12).fill(0);
    const tiposSet = new Set<string>(TIPOS_DESFRUTE_GLOBAL);
    for (const l of lancPecMeta) {
      if (!tiposSet.has(l.tipo)) continue;
      const dataAno = Number(l.data.substring(0, 4));
      if (dataAno !== anoNum) continue;
      const mes = Number(l.data.substring(5, 7));
      if (mes < 1 || mes > 12) continue;
      arr[mes - 1] += calcArrobasSafe(l);
    }
    return arr;
  }, [lancPecMeta, anoNum]);

  // Desfrute em CABEÇAS — equivalente de `arrobasSaidasMeta12` porém somando
  // QUANTIDADE em vez de arrobas. Filtro idêntico: TIPOS_DESFRUTE_GLOBAL
  // (abate + venda + consumo) — exclui mortes, transferências, reclassificações
  // e nascimentos. Duas séries (real e meta) alimentam `saidasDesfruteCabMensal`
  // dos builders abaixo.
  const saidasDesfruteCabReal12 = useMemo(() => {
    const arr = new Array(12).fill(0);
    const tiposSet = new Set<string>(TIPOS_DESFRUTE_GLOBAL);
    for (const l of lancPec) {
      if (!tiposSet.has(l.tipo)) continue;
      const dataAno = Number(l.data.substring(0, 4));
      if (dataAno !== anoNum) continue;
      const mes = Number(l.data.substring(5, 7));
      if (mes < 1 || mes > 12) continue;
      arr[mes - 1] += Number(l.quantidade) || 0;
    }
    return arr;
  }, [lancPec, anoNum]);

  const saidasDesfruteCabMeta12 = useMemo(() => {
    const arr = new Array(12).fill(0);
    const tiposSet = new Set<string>(TIPOS_DESFRUTE_GLOBAL);
    for (const l of lancPecMeta) {
      if (!tiposSet.has(l.tipo)) continue;
      const dataAno = Number(l.data.substring(0, 4));
      if (dataAno !== anoNum) continue;
      const mes = Number(l.data.substring(5, 7));
      if (mes < 1 || mes > 12) continue;
      arr[mes - 1] += Number(l.quantidade) || 0;
    }
    return arr;
  }, [lancPecMeta, anoNum]);

  // Blocos: Realizado usa buildMonthlyData, Meta usa view oficial + snapshot validado
  const blocos = useMemo(() => {
    let result: Bloco[];
    if (isPrevisto) {
      // Valor reb. ini META: Jan = realizado Dez ano anterior, Fev+ = META final mês anterior
      const valorRebIniMeta = [valorRebanhoMes[0] ?? 0, ...valorRebanhoMetaMes.slice(0, 11)];

      // Dez realizado validado — snapshot base para Jan da META
      const dezSnap = realPesoSnap.arrobas[0] > 0
        ? { cabecas: realPesoSnap.cabecas[0], pesoMedioKg: realPesoSnap.pesoMedio[0], arrobas: realPesoSnap.arrobas[0] }
        : undefined;

      // Fonte oficial: view convertida para MetaCategoriaMes[]
      if (metaConsolidacaoView.length > 0) {
        result = buildBlocosFromMetaConsolidacao(metaConsolidacaoView, viewTab, areaProdutiva, gmdMetaRows, valorRebanhoMetaMes, valorRebanhoMes[0], metaValorCabMes, metaPrecoArrMes, metaPesoSnap, dezSnap, finMetaPainel, soberanoSerie, arrobasSaidasMeta12, pcdSoberano.caixaIndicador?.serieAno?.slice(1), saidasDesfruteCabMeta12, pcdSoberano);
      } else {
        // Fallback: dados de fazenda (vw_zoot_fazenda_mensal)
        result = buildBlocosFromZootMensal(zootMeta || [], viewTab, valorRebanhoMetaMes, valorRebIniMeta, metaValorCabMes, metaPrecoArrMes, metaPesoSnap, dezSnap, finMetaPainel, soberanoSerie, arrobasSaidasMeta12, pcdSoberano.caixaIndicador?.serieAno?.slice(1), saidasDesfruteCabMeta12, pcdSoberano);
      }
    } else {
      // Realizado: slice(1) removes Dec prev year index for 12-month arrays
      const realPesoSnap12: PesoSnapshot = {
        cabecas: realPesoSnap.cabecas.slice(1),
        pesoMedio: realPesoSnap.pesoMedio.slice(1),
        arrobas: realPesoSnap.arrobas.slice(1),
      };
      const dezArrobasKg = (realPesoSnap.arrobas[0] || 0) * 30;
      result = buildBlocosForTab(monthlyData, viewTab, realValorCabMes.slice(1), realPrecoArrMes.slice(1), realPesoSnap12, dezArrobasKg > 0 ? dezArrobasKg : undefined, soberanoSerie, endividamento.hasData ? endividamento.series : undefined, pcdSoberano.caixaIndicador?.serieAno?.slice(1), saidasDesfruteCabReal12, pcdSoberano);
    }

    // C4.1 — injetar bloco ÁREAS META logo APÓS "Financeiro Soberano (Auditoria)";
    // se Soberano ausente, antes de "Endividamento"; senão, no fim.
    const idxSob = result.findIndex(b => b.nome === 'Financeiro Soberano (Auditoria)');
    if (idxSob >= 0) {
      result = [...result.slice(0, idxSob + 1), blocoAreas, ...result.slice(idxSob + 1)];
    } else {
      const idxEnd = result.findIndex(b => b.nome === 'Endividamento');
      if (idxEnd >= 0) {
        result = [...result.slice(0, idxEnd), blocoAreas, ...result.slice(idxEnd)];
      } else {
        result = [...result, blocoAreas];
      }
    }
    return result;
  }, [isPrevisto, monthlyData, zootMeta, viewTab, metaConsolidacaoView, gmdMetaRows, areaProdutiva, valorRebanhoMetaMes, metaValorCabMes, metaPrecoArrMes, valorRebanhoMes, realValorCabMes, realPrecoArrMes, realPesoSnap, metaPesoSnap, finMetaPainel, soberanoSerie, endividamento.hasData, endividamento.series, blocoAreas, arrobasSaidasMeta12, saidasDesfruteCabReal12, saidasDesfruteCabMeta12, pcdSoberano]);

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
      <table className="text-[10px] border-collapse" style={{ tableLayout: 'fixed', minWidth: '1070px' }}>
        <colgroup>
          <col style={{ width: '180px', minWidth: '180px', maxWidth: '180px' }} />
          {MESES_LABELS.map((_, i) => <col key={i} style={{ width: '68px', minWidth: '68px' }} />)}
          {viewTab === 'mensal' && <col style={{ width: '70px', minWidth: '70px' }} />}
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
            const tot = (previstoSemFonte || row.noTotal) ? null : totalForRow(row, viewTab, isPrevisto ? 12 : monthCutoff);

            return (
              <tr key={idx} className={`border-b border-border/20 hover:bg-muted/20 ${idx % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                <td className="sticky left-0 z-20 bg-card text-[10px] font-medium py-0.5 px-1.5 leading-tight border-r border-border/30" title={row.indicador} style={{ boxShadow: '2px 0 4px -1px rgba(0,0,0,0.06)' }}>
                  <span className="truncate inline-block max-w-[170px] align-middle">{row.indicador}</span>
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
                        : ((isPrevisto || monthCutoff > 0) && tot !== null ? formatPainel(tot, row.format) : '')}
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
                  {b.nome === 'ÁREAS — USO DO SOLO' && isAreaVazia && (
                    <span className="inline-flex items-center text-[8px] font-semibold px-1.5 py-0 rounded-full border leading-relaxed normal-case tracking-normal bg-muted text-muted-foreground border-border/60">
                      Sem base validada
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openBlocos[b.nome] ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-0.5">
                {b.nome === 'Endividamento' && (
                  <div className="text-[11px] text-muted-foreground italic px-2 py-1">
                    Endividamento exibido em base GLOBAL do cliente.
                  </div>
                )}
                {b.nome === 'ÁREAS — USO DO SOLO' && (
                  <div className="text-[11px] text-muted-foreground italic px-2 py-1">
                    Realizado: snapshot oficial P1. Meta: planejamento oficial. Estoque mensal — não acumula no período.
                  </div>
                )}
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
