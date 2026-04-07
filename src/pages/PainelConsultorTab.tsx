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
import { usePastos } from '@/hooks/usePastos';
import { useZootMensal, indexByMes, type ZootMensal } from '@/hooks/useZootMensal';
import { useZootCategoriaMensal, totalizarPorMes as totalizarViewPorMes } from '@/hooks/useZootCategoriaMensal';
import { formatPainel, type PainelFormatType } from '@/lib/calculos/formatters';
import {
  calcAreaProdutivaPecuaria,
} from '@/lib/calculos/zootecnicos';
import { supabase } from '@/integrations/supabase/client';
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
import type { MetaCategoriaMes } from '@/hooks/useMetaConsolidacao';
import { triggerXlsxDownload } from '@/lib/xlsxDownload';
import { CATALOGO_INDICADORES, getFonteStatusLabel, type FonteIndicador, type IndicadorMeta } from '@/lib/painelConsultor/indicadorCatalogo';
import { useValorRebanhoMetaAno } from '@/hooks/useValorRebanhoMeta';

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

function buildMonthlyDataFromView(
  viewTotals: ReturnType<typeof totalizarViewPorMes>,
  viewRows: import('@/hooks/useZootCategoriaMensal').ZootCategoriaMensal[],
  lancFin: FinanceiroLancamento[],
  ano: number,
  areaProdutiva: number,
  valorRebanhoMes: number[],
): MonthlyData {
  const mk = (fn: (m: number) => number) => Array.from({ length: 12 }, (_, i) => fn(i + 1));
  const diasNoMes = (m: number): number => new Date(ano, m, 0).getDate();

  // Zootechnical data from official view
  const cabIni = mk(m => viewTotals[m]?.saldo_inicial ?? 0);
  const cabFin = mk(m => viewTotals[m]?.saldo_final ?? 0);
  const entradas = mk(m => (viewTotals[m]?.entradas_externas ?? 0) + (viewTotals[m]?.evol_cat_entrada ?? 0));
  const saidas = mk(m => (viewTotals[m]?.saidas_externas ?? 0) + (viewTotals[m]?.evol_cat_saida ?? 0));
  const pesoTotalIni = mk(m => viewTotals[m]?.peso_total_inicial ?? 0);
  const pesoTotalFin = mk(m => viewTotals[m]?.peso_total_final ?? 0);
  const pesoMedioIni = mk(m => { const c = cabIni[m - 1]; return c > 0 ? pesoTotalIni[m - 1] / c : 0; });
  const pesoMedioFin = mk(m => { const c = cabFin[m - 1]; return c > 0 ? pesoTotalFin[m - 1] / c : 0; });

  // GMD: weighted average from view rows
  const gmd = mk(m => {
    const mesRows = viewRows.filter(r => r.mes === m);
    const cabMedia = (cabIni[m - 1] + cabFin[m - 1]) / 2;
    if (cabMedia <= 0) return 0;
    // Use producao_biologica from view
    const prodBio = mesRows.reduce((s, r) => s + r.producao_biologica, 0);
    const dias = diasNoMes(m);
    return dias > 0 ? prodBio / cabMedia / dias : 0;
  });

  const arrobasProd = mk(m => (viewTotals[m]?.producao_biologica ?? 0) / 30);
  const prodKg = mk(m => viewTotals[m]?.producao_biologica ?? 0);

  // Financial data (kept as-is from useFinanceiro)
  const concFin = lancFin.filter(l => isFinConciliado(l));
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
  const recPecCompArr = mk(recPecMes);
  const resOperArr = mk(m => recPecMes(m) - deducMes(m) - desembPecMes(m));
  const ebitdaArr = mk(m => recPecMes(m) - deducMes(m) - desembPecMes(m));
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
            r('Reb. inicial (cab)', 'cab', d.cabIni, 'reb_inicial', true),
            r('Reb. final (cab)', 'cab', d.cabFin, 'reb_final', true),
            r('Entradas (cab)', 'cab', d.entradas, 'entradas_cab'),
            r('Saídas (cab)', 'cab', d.saidas, 'saidas_cab'),
          ],
        },
        {
          nome: 'Peso',
          rows: [
            r('Peso ini. (kg)', 'cab', d.pesoTotalIni, 'peso_ini_kg', true),
            r('Peso final (kg)', 'cab', d.pesoTotalFin, 'peso_fin_kg', true),
            r('Peso ini. (@)', 'cab', d.pesoTotalIni.map(v => Math.round(v / 30)), 'peso_ini_arr', true),
            r('Peso final (@)', 'cab', d.pesoTotalFin.map(v => Math.round(v / 30)), 'peso_fin_arr', true),
            r('Peso méd. ini.', 'med2', d.pesoMedioIni, 'peso_med_ini', true),
            r('Peso méd. final', 'med2', d.pesoMedioFin, 'peso_med_fin', true),
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
            r('GMD (kg/cab/dia)', 'gmd', d.gmd, 'gmd'),
            r('Peso méd. reb.', 'med2', d.pesoMedioFin, 'peso_med_reb'),
            r('UA média', 'med2', uaMedia, 'ua_media'),
            r('Lotação (UA/ha)', 'med2', lotUaHa, 'lotacao'),
          ],
        },
        {
          nome: 'Produção',
          rows: [
            r('@ produzidas', 'padrao', d.arrobasProd, 'arrobas_prod'),
            r('Produção (kg)', 'padrao', d.prodKg, 'prod_kg'),
            r('@/ha', 'med2', arrHa, 'arr_ha'),
            r('Desfrute (cab)', 'cab', desfruteCab, 'desfrute_cab'),
            r('Desfrute (@)', 'padrao', desfrute_arr, 'desfrute_arr'),
          ],
        },
        {
          nome: 'Estrutura',
          rows: [
            r('Área prod. (ha)', 'med2', Array(12).fill(d.areaProd), 'area_prod'),
            r('Reb. médio (cab)', 'cab', cabMedia.map(Math.round), 'reb_medio'),
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
    case 'media_periodo':
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            r('GMD médio período', 'gmd', d.gmd, 'gmd_medio'),
            r('Peso médio período', 'med2', d.pesoMedioFin, 'peso_medio_periodo'),
            r('UA média período', 'med2', uaMedia, 'ua_media_periodo'),
            r('Lotação média', 'med2', lotUaHa, 'lotacao_media'),
          ],
        },
        {
          nome: 'Produção Média',
          rows: [
            r('@/ha média período', 'med2', arrHa, 'arr_ha_media'),
            r('Prod. média (@)', 'padrao', d.arrobasProd, 'prod_media_arr'),
            r('Prod. média (kg)', 'padrao', d.prodKg, 'prod_media_kg'),
            r('Desfrute médio', 'cab', desfruteCab, 'desfrute_medio'),
          ],
        },
        {
          nome: 'Financeiro Médio',
          rows: [
            r('Receita média', 'money', d.recPec, 'receita_media'),
            r('Res. oper. médio', 'money', d.resOper, 'res_oper_medio'),
            r('EBITDA médio', 'money', d.ebitda, 'ebitda_medio'),
            r('Res. caixa médio', 'money', d.resCaixa, 'res_caixa_medio'),
          ],
        },
      ];
}
}

// ─── Build blocos from vw_zoot_fazenda_mensal (for Meta cenário) ───
function buildBlocosFromZootMensal(rows: ZootMensal[], tab: ViewTab, valorRebanhoMetaMes?: number[], valorRebanhoMetaMesAnteriorOuDez?: number[], metaValorCabMes?: number[], metaPrecoArrMes?: number[]): Bloco[] {
  const byMes = indexByMes(rows);
  const get = (field: keyof ZootMensal): number[] =>
    Array.from({ length: 12 }, (_, i) => {
      const m = byMes[String(i + 1).padStart(2, '0')];
      return m ? (Number(m[field]) || 0) : 0;
    });

  const cabIni = get('cabecas_inicio');
  const cabFin = get('cabecas_final');
  const entradas = get('entradas');
  const saidas = get('saidas');
  const pesoIni = get('peso_inicio_kg');
  const pesoFin = get('peso_total_final_kg');
  const pesoMedFin = get('peso_medio_final_kg');
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

  const pesoMedIni = cabIni.map((c, i) => c > 0 ? pesoIni[i] / c : 0);
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
            r('Entradas fin. acum.', 'money', emptyMoney, 'ent_fin_acum'),
            r('Saídas fin. acum.', 'money', emptyMoney, 'sai_fin_acum'),
            r('Rec. pec. acum.', 'money', emptyMoney, 'rec_pec_acum'),
            r('Res. caixa acum.', 'money', emptyMoney, 'res_caixa_acum'),
          ],
        },
        {
          nome: 'Financeiro por Competência',
          rows: [
            r('Rec. pec. comp. acum.', 'money', emptyMoney, 'rec_pec_comp_acum'),
            r('Res. oper. acum.', 'money', emptyMoney, 'res_oper_acum'),
            r('EBITDA acum.', 'money', emptyMoney, 'ebitda_acum'),
            r('Var. valor reb.', 'money', emptyMoney, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo':
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            r('GMD médio período', 'gmd', gmd, 'gmd_medio'),
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
            r('Receita média', 'money', emptyMoney, 'receita_media'),
            r('Res. oper. médio', 'money', emptyMoney, 'res_oper_medio'),
            r('EBITDA médio', 'money', emptyMoney, 'ebitda_medio'),
            r('Res. caixa médio', 'money', emptyMoney, 'res_caixa_medio'),
          ],
        },
      ];
  }
}

// ─── Build blocos from MetaConsolidacao (validated consolidation) ───
function buildBlocosFromMetaConsolidacao(consolidacao: MetaCategoriaMes[], tab: ViewTab, areaProd: number, valorRebanhoMetaMes?: number[], dezAnoAnteriorRealizado?: number, metaValorCabMes?: number[], metaPrecoArrMes?: number[]): Bloco[] {
  // Aggregate across all categories per month
  const agg = (field: keyof MetaCategoriaMes): number[] =>
    Array.from({ length: 12 }, (_, i) => {
      const mesKey = String(i + 1).padStart(2, '0');
      return consolidacao
        .filter(c => c.mes === mesKey)
        .reduce((s, c) => s + (Number(c[field]) || 0), 0);
    });

  const cabIni = agg('si');
  const cabFin = agg('sf');
  const entradas = agg('ee');
  const saidas = agg('se');
  const pesoIni = agg('pesoInicial');
  const pesoFin = agg('pesoTotalFinal');
  const prodBio = agg('producaoBio');

  // Peso médio final = peso total final / SF (weighted across categories)
  const pesoMedFin = Array.from({ length: 12 }, (_, i) => {
    const sf = cabFin[i];
    return sf > 0 ? pesoFin[i] / sf : 0;
  });

  const pesoMedIni = cabIni.map((c, i) => c > 0 ? pesoIni[i] / c : 0);
  const cabMedia = cabIni.map((v, i) => (v + cabFin[i]) / 2);

  // GMD: produção biológica / (cab média × dias)
  const gmd = Array.from({ length: 12 }, (_, i) => {
    const cm = cabMedia[i];
    const mesNum = i + 1;
    const ano = consolidacao.length > 0 ? new Date().getFullYear() : new Date().getFullYear();
    // Get dias from first matching row
    const row = consolidacao.find(c => c.mes === String(mesNum).padStart(2, '0'));
    const dias = row?.dias || new Date(ano, mesNum, 0).getDate();
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

  // Valor do Rebanho META: lido direto da tabela persistida (sem recalcular)
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
            r('Entradas fin. acum.', 'money', emptyMoney, 'ent_fin_acum'),
            r('Saídas fin. acum.', 'money', emptyMoney, 'sai_fin_acum'),
            r('Rec. pec. acum.', 'money', emptyMoney, 'rec_pec_acum'),
            r('Res. caixa acum.', 'money', emptyMoney, 'res_caixa_acum'),
          ],
        },
        {
          nome: 'Financeiro por Competência',
          rows: [
            r('Rec. pec. comp. acum.', 'money', emptyMoney, 'rec_pec_comp_acum'),
            r('Res. oper. acum.', 'money', emptyMoney, 'res_oper_acum'),
            r('EBITDA acum.', 'money', emptyMoney, 'ebitda_acum'),
            r('Var. valor reb.', 'money', varValorRebMeta, 'var_valor_reb'),
          ],
        },
      ];
    case 'media_periodo':
      return [
        {
          nome: 'Desempenho Médio',
          rows: [
            r('GMD médio período', 'gmd', gmd, 'gmd_medio'),
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
            r('Receita média', 'money', emptyMoney, 'receita_media'),
            r('Res. oper. médio', 'money', emptyMoney, 'res_oper_medio'),
            r('EBITDA médio', 'money', emptyMoney, 'ebitda_medio'),
            r('Res. caixa médio', 'money', emptyMoney, 'res_caixa_medio'),
          ],
        },
      ];
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

  // ─── Status dos pilares de governança (mês atual selecionado) ───
  const mesAtualRef = useMemo(() => {
    const m = filtroGlobal?.mes || new Date().getMonth() + 1;
    return `${ano}-${String(m).padStart(2, '0')}`;
  }, [ano, filtroGlobal?.mes]);
  const { status: statusPilares, refetch: refetchPilares } = useStatusPilares(fazendaId, mesAtualRef);
  const { data: zootMeta } = useZootMensal({ ano: anoNum, cenario: 'meta' });

  // Valor do Rebanho META persistido — leitura direta sem recalcular
  const { data: metaValData, getMonthlyValues: getMetaValues, loading: metaValLoading } = useValorRebanhoMetaAno(anoNum);
  const valorRebanhoMetaMes = useMemo(() => getMetaValues('valor_total'), [getMetaValues]);
  const metaCabecasMes = useMemo(() => getMetaValues('cabecas'), [getMetaValues]);
  const metaArrobasMes = useMemo(() => getMetaValues('arrobas_total'), [getMetaValues]);
  const metaValorCabMes = useMemo(() => getMetaValues('valor_cabeca_medio'), [getMetaValues]);
  const metaPrecoArrMes = useMemo(() => getMetaValues('preco_arroba_medio'), [getMetaValues]);
  // Official source: view data for Realizado (replaces buildMonthlyData local calcs)
  const { data: viewDataRealizado } = useZootCategoriaMensal({ ano: anoNum, cenario: 'realizado', global: isGlobal });

  // Month cutoff: months > cutoff are blank
  const monthCutoff = useMemo(() => getCurrentMonthCutoff(anoNum), [anoNum]);

  useEffect(() => {
    if (!fazendaId) { setValorRebanhoMes(Array(13).fill(0)); return; }
    (async () => {
      const dezAnoAnterior = `${anoNum - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${anoNum}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];
      const fazendaIds = fazendaId === '__global__'
        ? fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id) : [fazendaId];
      if (fazendaIds.length === 0) { setValorRebanhoMes(Array(13).fill(0)); return; }
      const { data, error } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .in('fazenda_id', fazendaIds)
        .in('ano_mes', todasMeses);
      if (error) { setValorRebanhoMes(Array(13).fill(0)); return; }
      const totais = new Map(todasMeses.map(mes => [mes, 0]));
      (data || []).forEach(row => {
        totais.set(row.ano_mes, (totais.get(row.ano_mes) || 0) + (Number(row.valor_total) || 0));
      });
      setValorRebanhoMes(todasMeses.map(mes => totais.get(mes) || 0));
    })();
  }, [fazendaId, anoNum, fazendas]);

  const areaProdutiva = useMemo(() => calcAreaProdutivaPecuaria(pastos), [pastos]);

  const viewTotals = useMemo(() => totalizarViewPorMes(viewDataRealizado || []), [viewDataRealizado]);

  const monthlyData = useMemo(() =>
    buildMonthlyDataFromView(viewTotals, viewDataRealizado || [], lancFin, anoNum, areaProdutiva, valorRebanhoMes),
    [viewTotals, viewDataRealizado, lancFin, anoNum, areaProdutiva, valorRebanhoMes],
  );

  const isPrevisto = cenario === 'meta';

  // REGRA: Meta em modo Global desabilitado — sem agregação oficial ainda
  const previstoGlobalBloqueado = isPrevisto && isGlobal;

  // Blocos: Realizado usa buildMonthlyData, Meta usa valor_rebanho_meta + vw_zoot_fazenda_mensal
  const blocos = useMemo(() => {
    if (previstoGlobalBloqueado) return [];
    if (isPrevisto) {
      // Fonte oficial do valor META é sempre a tabela persistida valor_rebanho_meta
      const valorRebIniMeta = [valorRebanhoMes[0] ?? 0, ...(valorRebanhoMetaMes || Array(12).fill(0)).slice(0, 11)];

      // Consolidação Meta valida os blocos zootécnicos; valor do rebanho vem sempre da base persistida
      if (metaConsolidacao && metaConsolidacao.length > 0) {
        return buildBlocosFromMetaConsolidacao(metaConsolidacao, viewTab, areaProdutiva, valorRebanhoMetaMes, valorRebanhoMes[0], metaValorCabMes, metaPrecoArrMes);
      }

      return buildBlocosFromZootMensal(zootMeta || [], viewTab, valorRebanhoMetaMes, valorRebIniMeta, metaValorCabMes, metaPrecoArrMes);
    }
    return buildBlocosForTab(monthlyData, viewTab);
  }, [isPrevisto, previstoGlobalBloqueado, monthlyData, zootMeta, viewTab, metaConsolidacao, areaProdutiva, valorRebanhoMetaMes, metaValorCabMes, metaPrecoArrMes, valorRebanhoMes]);

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
          <col style={{ width: '100px', minWidth: '100px' }} />
          {MESES_LABELS.map((_, i) => <col key={i} style={{ width: '54px', minWidth: '54px' }} />)}
          <col style={{ width: '60px', minWidth: '60px' }} />
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
            <th className="text-right text-[9px] font-bold uppercase tracking-wider px-0.5 py-0.5 border-l border-border/40 bg-muted/80">
              Total
            </th>
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
                  <span className="truncate inline-block max-w-[80px] align-middle">{row.indicador}</span>
                  <SourceInfoTooltip indicadorId={row.indicadorId} cenario={cenario} />
                </td>
                {row.valores.map((v, i) => {
                  const isFuture = !isPrevisto && (i + 1) > monthCutoff;
                  let cellContent = '';
                  let isSemBase = false;
                  if (previstoSemFonte) {
                    cellContent = '';  // sem base meta
                  } else if (isFuture) {
                    cellContent = '';  // mês futuro (only for Realizado)
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
                      }${previstoSemFonte ? ' text-muted-foreground/30' : ''}${isSemBase ? ' text-muted-foreground/50 italic' : ''}`}
                      title={isSemBase ? 'Meta não projetou este indicador' : undefined}
                    >
                      {cellContent}
                    </td>
                  );
                })}
                <td className={`text-right py-0.5 px-0.5 tabular-nums whitespace-nowrap text-[10px] font-bold border-l border-border/30 bg-muted/5${
                  previstoSemFonte || row.noTotal ? ' text-muted-foreground/30' : ''
                }`}>
                  {(previstoSemFonte || row.noTotal)
                    ? ''
                    : row.valores.some(v => isNaN(v))
                      ? '–'
                      : (monthCutoff > 0 && tot !== null ? formatPainel(tot, row.format) : '')}
                </td>
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
          {previstoGlobalBloqueado ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <span className="text-sm font-semibold text-muted-foreground">Meta indisponível no modo Global</span>
              <span className="text-xs text-muted-foreground/70 max-w-md">
                A base meta é registrada por fazenda individual.
                Selecione uma fazenda específica para visualizar o cenário Meta,
                ou alterne para o cenário Realizado.
              </span>
            </div>
          ) : blocos.map(b => (
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
