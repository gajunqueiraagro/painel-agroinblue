/**
 * Hook central de indicadores zootécnicos.
 *
 * FONTE OFICIAL: usa exclusivamente as views vw_zoot_categoria_mensal
 * e vw_zoot_fazenda_mensal via useZootCategoriaMensal / useZootMensal.
 *
 * PROIBIDO: calcSaldoPorCategoriaLegado, resolverPesoOficial,
 * loadPesosPastosPorCategoria — qualquer recálculo por movimentações.
 *
 * Lancamentos são usados APENAS para:
 *   - arrobas de saída (abate, venda, consumo, transferência)
 *   - desfrute
 *   - detalhamento de movimentações por tipo
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto } from '@/hooks/usePastos';
import {
  calcPesoMedioPonderado,
  calcUA,
  calcUAHa,
  calcAreaProdutivaPecuaria,
} from '@/lib/calculos/zootecnicos';
import {
  calcArrobasSafe,
  calcDesfrute,
  calcDesfruteArrobas,
  calcArrobasIniciais,
  calcGMD,
} from '@/lib/calculos/economicos';
import { supabase } from '@/integrations/supabase/client';
import {
  useZootCategoriaMensal,
  groupByMes,
  type ZootCategoriaMensal,
} from '@/hooks/useZootCategoriaMensal';
import { useZootMensal, indexByMes } from '@/hooks/useZootMensal';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Comparacao {
  valorAtual: number;
  valorComparativo: number;
  diferencaAbsoluta: number;
  diferencaPercentual: number | null;
  tipo: 'mensal' | 'yoy' | 'acumulado_yoy';
  disponivel: boolean;
}

export interface QualidadeFlags {
  pesoMedioEstimado: boolean;
  gmdDisponivel: boolean;
  areaProdutivaEstimativa: boolean;
  valorRebanhoFechado: boolean;
}

export interface GmdMovDetalhe {
  tipo: string;
  label: string;
  quantidade: number;
  pesoTotalKg: number;
}

export type FontePeso = 'fechamento' | 'lancamento' | 'saldo_inicial' | 'nenhuma';

export interface EstoqueCategoriaDetalhe {
  categoria: string;
  cabecas: number;
  pesoMedioKg: number | null;
  pesoTotalKg: number;
  fontePeso: FontePeso;
}

export interface GmdAbertura {
  pesoFinalEstoque: number;
  pesoInicialEstoque: number;
  pesoEntradas: number;
  pesoSaidas: number;
  ganhoLiquido: number;
  dias: number;
  cabMedia: number;
  gmd: number | null;
  entradasDetalhe: GmdMovDetalhe[];
  saidasDetalhe: GmdMovDetalhe[];
  estoqueFinalDetalhe: EstoqueCategoriaDetalhe[];
  estoqueInicialDetalhe: EstoqueCategoriaDetalhe[];
  baseCompleta: boolean;
}

export interface HistoricoMensal {
  mes: number;
  arrobasProduzidasAcum: number | null;
  uaHaMedia: number | null;
  gmdAcumulado: number | null;
  desfruteCabAcum: number | null;
  desfruteArrobAcum: number | null;
}

export interface HistoricoAnual {
  ano: number;
  meses: HistoricoMensal[];
}

export interface ComparacaoHistorica {
  anoComparativo: number;
  valorAtual: number | null;
  valorComparativo: number | null;
  diferencaAbsoluta: number | null;
  diferencaPercentual: number | null;
}

export interface IndicadoresZootecnicos {
  saldoFinalMes: number;
  pesoMedioRebanhoKg: number | null;
  uaTotal: number;
  uaHa: number | null;
  uaHaMediaAno: number | null;
  areaProdutiva: number;
  arrobasSaidasMes: number;
  arrobasHaMes: number | null;
  arrobasSaidasAcumuladoAno: number;
  arrobasHaAcumuladoAno: number | null;
  arrobasProduzidasMes: number | null;
  arrobasProduzidasAcumulado: number | null;
  desfruteCabecasMes: number | null;
  desfruteArrobasMes: number | null;
  desfruteCabecasAcumulado: number | null;
  desfruteArrobasAcumulado: number | null;
  gmdMes: number | null;
  gmdAcumulado: number | null;
  gmdAberturaMes: GmdAbertura;
  valorRebanho: number | null;
  valorPorCabeca: number | null;
  valorPorHa: number | null;
  valorArrobaEstoqueFinal: number | null;
  comparacoes: {
    saldoFinalMes: { mensal: Comparacao | null; anual: Comparacao | null };
    pesoMedioRebanhoKg: { mensal: Comparacao | null; anual: Comparacao | null };
    uaHa: { mensal: Comparacao | null; anual: Comparacao | null };
    uaHaMediaAno: { mensal: Comparacao | null; anual: Comparacao | null };
    valorRebanho: { mensal: Comparacao | null; anual: Comparacao | null };
    arrobasSaidasMes: { mensal: Comparacao | null; anual: Comparacao | null };
    arrobasHaMes: { mensal: Comparacao | null; anual: Comparacao | null };
    arrobasSaidasAcumuladoAno: { mensal: Comparacao | null; anual: Comparacao | null };
    arrobasHaAcumuladoAno: { mensal: Comparacao | null; anual: Comparacao | null };
    arrobasProduzidasAcumulado: { mensal: Comparacao | null; anual: Comparacao | null };
    gmdMes: { mensal: Comparacao | null; anual: Comparacao | null };
    gmdAcumulado: { mensal: Comparacao | null; anual: Comparacao | null };
    desfruteCabecasAcumulado: { mensal: Comparacao | null; anual: Comparacao | null };
    desfruteArrobasAcumulado: { mensal: Comparacao | null; anual: Comparacao | null };
    arrobasDesfrutadasAcum: { mensal: Comparacao | null; anual: Comparacao | null };
    valorPorCabeca: { mensal: Comparacao | null; anual: Comparacao | null };
  };
  historico: HistoricoAnual[];
  comparacoesHistorico: {
    arrobasProduzidas: ComparacaoHistorica[];
    uaHaMedia: ComparacaoHistorica[];
    gmdAcumulado: ComparacaoHistorica[];
  };
  qualidade: QualidadeFlags;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildComparacao(
  atual: number,
  comparativo: number | null | undefined,
  tipo: 'mensal' | 'yoy' | 'acumulado_yoy',
): Comparacao | null {
  if (comparativo === null || comparativo === undefined) return null;
  if (atual === 0 && comparativo === 0) return null;
  const diff = atual - comparativo;
  const pct = comparativo !== 0 ? (diff / Math.abs(comparativo)) * 100 : null;
  return { valorAtual: atual, valorComparativo: comparativo, diferencaAbsoluta: diff, diferencaPercentual: pct, tipo, disponivel: true };
}

const TIPOS_SAIDA_DESFRUTE = ['abate', 'venda', 'consumo', 'transferencia_saida'];
const TIPOS_ENTRADA = ['nascimento', 'compra', 'transferencia_entrada'];

const LABELS_TIPO: Record<string, string> = {
  nascimento: 'Nascimentos',
  compra: 'Compras',
  transferencia_entrada: 'Transf. Entrada',
  reclassificacao_entrada: 'Reclass. Entrada',
  abate: 'Abates',
  venda: 'Vendas',
  consumo: 'Consumo',
  morte: 'Mortes',
  transferencia_saida: 'Transf. Saída',
  reclassificacao_saida: 'Reclass. Saída',
};

function filterByAnoMes(lancs: Lancamento[], anoMes: string) {
  return lancs.filter(l => l.data.startsWith(anoMes));
}

function filterByAnoAteMes(lancs: Lancamento[], ano: number, mes: number) {
  const end = `${ano}-${String(mes).padStart(2, '0')}-31`;
  return lancs.filter(l => l.data >= `${ano}-01-01` && l.data <= end);
}

function saidasDesfrute(lancs: Lancamento[]) {
  return lancs.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo));
}

function agruparPorTipo(lancs: Lancamento[]): GmdMovDetalhe[] {
  const map = new Map<string, { quantidade: number; pesoTotal: number }>();
  for (const l of lancs) {
    const entry = map.get(l.tipo) || { quantidade: 0, pesoTotal: 0 };
    entry.quantidade += l.quantidade;
    entry.pesoTotal += l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0);
    map.set(l.tipo, entry);
  }
  return Array.from(map.entries()).map(([tipo, d]) => ({
    tipo,
    label: LABELS_TIPO[tipo] || tipo,
    quantidade: d.quantidade,
    pesoTotalKg: d.pesoTotal,
  }));
}

// ---------------------------------------------------------------------------
// View data helpers
// ---------------------------------------------------------------------------

/** Get saldo final from view data for a specific month */
function viewSaldoFinal(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number {
  const cats = viewByMes[mes] || [];
  return cats.reduce((s, c) => s + c.saldo_final, 0);
}

/** Get saldo inicial from view data for a specific month */
function viewSaldoInicial(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number {
  const cats = viewByMes[mes] || [];
  return cats.reduce((s, c) => s + c.saldo_inicial, 0);
}

/** Get peso total final from view data */
function viewPesoTotalFinal(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number {
  const cats = viewByMes[mes] || [];
  return cats.reduce((s, c) => s + c.peso_total_final, 0);
}

/** Get peso total inicial from view data */
function viewPesoTotalInicial(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number {
  const cats = viewByMes[mes] || [];
  return cats.reduce((s, c) => s + c.peso_total_inicial, 0);
}

/** Get peso médio ponderado from view data */
function viewPesoMedio(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number | null {
  const cats = viewByMes[mes] || [];
  const totalCab = cats.reduce((s, c) => s + c.saldo_final, 0);
  const totalPeso = cats.reduce((s, c) => s + c.peso_total_final, 0);
  return totalCab > 0 ? totalPeso / totalCab : null;
}

/** Build stock detail per category from view */
function viewEstoqueDetalhe(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number, tipo: 'final' | 'inicial'): EstoqueCategoriaDetalhe[] {
  const cats = viewByMes[mes] || [];
  return cats
    .filter(c => (tipo === 'final' ? c.saldo_final : c.saldo_inicial) !== 0)
    .map(c => {
      const cab = tipo === 'final' ? c.saldo_final : c.saldo_inicial;
      const pesoMedio = tipo === 'final' ? c.peso_medio_final : c.peso_medio_inicial;
      const pesoTotal = tipo === 'final' ? c.peso_total_final : c.peso_total_inicial;
      return {
        categoria: c.categoria_codigo,
        cabecas: cab,
        pesoMedioKg: pesoMedio,
        pesoTotalKg: pesoTotal,
        fontePeso: (c.fonte_oficial_mes === 'fechamento' ? 'fechamento' : c.fonte_oficial_mes === 'projecao' ? 'saldo_inicial' : 'lancamento') as FontePeso,
      };
    });
}

/** Get peso entradas/saidas externas from view */
function viewPesoEntradas(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number {
  return (viewByMes[mes] || []).reduce((s, c) => s + c.peso_entradas_externas, 0);
}
function viewPesoSaidas(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number {
  return (viewByMes[mes] || []).reduce((s, c) => s + c.peso_saidas_externas, 0);
}

/** Compute GMD from view data for a single month */
function viewGmdMes(viewByMes: Record<number, ZootCategoriaMensal[]>, mes: number): number | null {
  const cats = viewByMes[mes] || [];
  if (cats.length === 0) return null;

  const pesoFinal = cats.reduce((s, c) => s + c.peso_total_final, 0);
  const pesoInicial = cats.reduce((s, c) => s + c.peso_total_inicial, 0);
  const pesoEnt = cats.reduce((s, c) => s + c.peso_entradas_externas, 0);
  const pesoSai = cats.reduce((s, c) => s + c.peso_saidas_externas, 0);
  const saldoIni = cats.reduce((s, c) => s + c.saldo_inicial, 0);
  const saldoFin = cats.reduce((s, c) => s + c.saldo_final, 0);
  const dias = cats[0]?.dias_mes || new Date(2000, mes, 0).getDate();
  const cabMedia = (saldoIni + saldoFin) / 2;

  if (pesoFinal <= 0 || pesoInicial <= 0 || cabMedia <= 0) return null;
  return calcGMD(pesoFinal, pesoInicial, pesoEnt, pesoSai, dias, cabMedia);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIndicadoresZootecnicos(
  fazendaId: string | undefined,
  ano: number,
  mes: number,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  pastos: Pasto[],
  categorias?: { id: string; codigo: string; nome: string; ordem_exibicao: number }[],
  globalFazendaIds?: string[],
) {
  const [valorRebanhoData, setValorRebanhoData] = useState<{ total: number; fechado: boolean } | null>(null);
  const [valorRebanhoYoY, setValorRebanhoYoY] = useState<number | null>(null);
  const [valorRebanhoMoM, setValorRebanhoMoM] = useState<number | null>(null);
  const [loadingValor, setLoadingValor] = useState(false);

  const isGlobal = fazendaId === '__global__';
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  // ── FONTE OFICIAL: views zootécnicas ──
  const { data: viewDataAno, isLoading: loadingViewAno } = useZootCategoriaMensal({ ano, cenario: 'realizado', global: isGlobal });
  const { data: viewDataAnoAnt, isLoading: loadingViewAnoAnt } = useZootCategoriaMensal({ ano: ano - 1, cenario: 'realizado', global: isGlobal });
  const { data: viewDataAno2, isLoading: loadingViewAno2 } = useZootCategoriaMensal({ ano: ano - 2, cenario: 'realizado', global: isGlobal });

  const viewByMesAno = useMemo(() => groupByMes(viewDataAno || []), [viewDataAno]);
  const viewByMesAnoAnt = useMemo(() => groupByMes(viewDataAnoAnt || []), [viewDataAnoAnt]);
  const viewByMesAno2 = useMemo(() => groupByMes(viewDataAno2 || []), [viewDataAno2]);

  const loadingView = loadingViewAno || loadingViewAnoAnt || loadingViewAno2;

  // --- Load valor rebanho EXCLUSIVELY from valor_rebanho_fechamento ---
  const loadValorRebanho = useCallback(async () => {
    if (!fazendaId) {
      setValorRebanhoData(null); setValorRebanhoYoY(null); setValorRebanhoMoM(null);
      return;
    }
    setLoadingValor(true);
    try {
      let mesAntAno = ano; let mesAntMes = mes - 1;
      if (mesAntMes < 1) { mesAntMes = 12; mesAntAno--; }
      const anoMesMoM = `${mesAntAno}-${String(mesAntMes).padStart(2, '0')}`;
      const anoMesYoY = `${ano - 1}-${String(mes).padStart(2, '0')}`;

      if (isGlobal) {
        const fids = globalFazendaIds || [];
        if (fids.length === 0) {
          setValorRebanhoData(null); setValorRebanhoYoY(null); setValorRebanhoMoM(null);
          setLoadingValor(false); return;
        }
        const [curRes, yoyRes, momRes] = await Promise.all([
          supabase.from('valor_rebanho_fechamento').select('fazenda_id, status, valor_total').in('fazenda_id', fids).eq('ano_mes', anoMes),
          supabase.from('valor_rebanho_fechamento').select('fazenda_id, status, valor_total').in('fazenda_id', fids).eq('ano_mes', anoMesYoY),
          supabase.from('valor_rebanho_fechamento').select('fazenda_id, status, valor_total').in('fazenda_id', fids).eq('ano_mes', anoMesMoM),
        ]);
        const curRows = curRes.data || [];
        const totalGlobal = curRows.reduce((s, r) => s + (Number(r.valor_total) || 0), 0);
        const allFechado = curRows.length === fids.length && curRows.every(r => r.status === 'fechado');
        setValorRebanhoData(totalGlobal > 0 ? { total: totalGlobal, fechado: allFechado } : null);
        setValorRebanhoYoY((yoyRes.data || []).reduce((s, r) => s + (Number(r.valor_total) || 0), 0) || null);
        setValorRebanhoMoM((momRes.data || []).reduce((s, r) => s + (Number(r.valor_total) || 0), 0) || null);
      } else {
        const [curRes, yoyRes, momRes] = await Promise.all([
          supabase.from('valor_rebanho_fechamento').select('status, valor_total').eq('fazenda_id', fazendaId).eq('ano_mes', anoMes).maybeSingle(),
          supabase.from('valor_rebanho_fechamento').select('status, valor_total').eq('fazenda_id', fazendaId).eq('ano_mes', anoMesYoY).maybeSingle(),
          supabase.from('valor_rebanho_fechamento').select('status, valor_total').eq('fazenda_id', fazendaId).eq('ano_mes', anoMesMoM).maybeSingle(),
        ]);
        const curTotal = Number(curRes.data?.valor_total) || 0;
        setValorRebanhoData(curTotal > 0 ? { total: curTotal, fechado: curRes.data?.status === 'fechado' } : null);
        setValorRebanhoYoY(Number(yoyRes.data?.valor_total) || null);
        setValorRebanhoMoM(Number(momRes.data?.valor_total) || null);
      }
    } catch {
      setValorRebanhoData(null); setValorRebanhoYoY(null); setValorRebanhoMoM(null);
    } finally {
      setLoadingValor(false);
    }
  }, [fazendaId, isGlobal, globalFazendaIds, anoMes, ano, mes]);

  useEffect(() => { loadValorRebanho(); }, [loadValorRebanho]);

  // --- Compute all indicators using OFFICIAL VIEW DATA ---
  const indicadores: IndicadoresZootecnicos = useMemo(() => {
    const loading = loadingValor || loadingView;

    // ===== SALDO/PESO FROM OFFICIAL VIEWS =====
    const saldoFinalMes = viewSaldoFinal(viewByMesAno, mes);
    const saldoInicialMes = viewSaldoInicial(viewByMesAno, mes);
    const pesoFinalMes = viewPesoTotalFinal(viewByMesAno, mes);
    const pesoInicialMes = viewPesoTotalInicial(viewByMesAno, mes);
    const pesoMedioRebanhoKg = viewPesoMedio(viewByMesAno, mes);

    // Saldo inicial do ano (= saldo_inicial do mês 1, from view)
    const saldoInicialAno = viewSaldoInicial(viewByMesAno, 1);
    // Saldo do mês anterior
    const saldoAnterior = mes > 1 ? viewSaldoFinal(viewByMesAno, mes - 1) : saldoInicialAno;

    // Área / UA
    const areaProdutiva = calcAreaProdutivaPecuaria(pastos);
    const areaProdutivaEstimativa = pastos.filter(p => p.ativo && p.entra_conciliacao).length === 0;
    const uaTotal = calcUA(saldoFinalMes, pesoMedioRebanhoKg);
    const uaHa = calcUAHa(uaTotal, areaProdutiva);

    // UA/ha média do ano (jan até mês selecionado) — from view
    const uaHaMensais: number[] = [];
    for (let m = 1; m <= mes; m++) {
      const ptf = viewPesoTotalFinal(viewByMesAno, m);
      const ua = ptf / 450;
      const uah = areaProdutiva > 0 ? ua / areaProdutiva : null;
      if (uah !== null) uaHaMensais.push(uah);
    }
    const uaHaMediaAno = uaHaMensais.length > 0
      ? uaHaMensais.reduce((a, b) => a + b, 0) / uaHaMensais.length
      : null;

    // Arrobas mês (saídas) — from lancamentos (movement-level data)
    const lancsMes = filterByAnoMes(lancamentos, anoMes);
    const saidasMes = saidasDesfrute(lancsMes);
    const arrobasSaidasMes = saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const arrobasHaMes = areaProdutiva > 0 && arrobasSaidasMes > 0 ? arrobasSaidasMes / areaProdutiva : null;

    // Arrobas acumulado (saídas)
    const lancsAcum = filterByAnoAteMes(lancamentos, ano, mes);
    const saidasAcum = saidasDesfrute(lancsAcum);
    const arrobasSaidasAcumuladoAno = saidasAcum.reduce((s, l) => s + calcArrobasSafe(l), 0);

    // Desfrute mês
    const totalCabSaidasMes = saidasMes.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabecasMes = calcDesfrute(totalCabSaidasMes, saldoInicialAno);
    const arrobasIni = calcArrobasIniciais(saldosIniciais, ano);
    const desfruteArrobasMes = calcDesfruteArrobas(arrobasSaidasMes, arrobasIni);

    // Desfrute acumulado
    const totalCabSaidasAcum = saidasAcum.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabecasAcumulado = calcDesfrute(totalCabSaidasAcum, saldoInicialAno);
    const desfruteArrobasAcumulado = calcDesfruteArrobas(arrobasSaidasAcumuladoAno, arrobasIni);

    // ===== GMD MÊS — from official view =====
    const diasMes = new Date(ano, mes, 0).getDate();
    const pesoEntView = viewPesoEntradas(viewByMesAno, mes);
    const pesoSaiView = viewPesoSaidas(viewByMesAno, mes);
    const cabMediaMes = (saldoInicialMes + saldoFinalMes) / 2;
    const gmdMes = calcGMD(pesoFinalMes, pesoInicialMes, pesoEntView, pesoSaiView, diasMes, cabMediaMes);

    const ganhoLiquido = pesoFinalMes - pesoInicialMes - pesoEntView + pesoSaiView;

    // Estoque detalhado from view
    const estoqueFinalDetalhe = viewEstoqueDetalhe(viewByMesAno, mes, 'final');
    const estoqueInicialDetalhe = viewEstoqueDetalhe(viewByMesAno, mes, 'inicial');

    // Entradas/saídas detalhadas from lancamentos (for GMD opening detail)
    const entradasMes = lancsMes.filter(l => TIPOS_ENTRADA.includes(l.tipo));
    const saidasGmdMes = lancsMes.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte');

    const gmdAberturaMes: GmdAbertura = {
      pesoFinalEstoque: pesoFinalMes,
      pesoInicialEstoque: pesoInicialMes,
      pesoEntradas: pesoEntView,
      pesoSaidas: pesoSaiView,
      ganhoLiquido,
      dias: diasMes,
      cabMedia: cabMediaMes,
      gmd: gmdMes,
      entradasDetalhe: agruparPorTipo(entradasMes),
      saidasDetalhe: agruparPorTipo(saidasGmdMes),
      estoqueFinalDetalhe,
      estoqueInicialDetalhe,
      baseCompleta: pesoFinalMes > 0 && pesoInicialMes > 0 && cabMediaMes > 0,
    };

    // Arrobas produzidas mês
    const arrobasProduzidasMes = (pesoFinalMes > 0 && pesoInicialMes > 0 && cabMediaMes > 0)
      ? ganhoLiquido / 30 : null;

    // GMD acumulado — from view (sum across months)
    const pesoInicialAno = viewPesoTotalInicial(viewByMesAno, 1);
    let pesoEntAcum = 0, pesoSaiAcum = 0;
    for (let m = 1; m <= mes; m++) {
      pesoEntAcum += viewPesoEntradas(viewByMesAno, m);
      pesoSaiAcum += viewPesoSaidas(viewByMesAno, m);
    }
    const diasAcum = Array.from({ length: mes }, (_, i) => new Date(ano, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
    const cabMediaAcum = (saldoInicialAno + saldoFinalMes) / 2;
    const gmdAcumulado = calcGMD(pesoFinalMes, pesoInicialAno, pesoEntAcum, pesoSaiAcum, diasAcum, cabMediaAcum);

    // Arrobas produzidas acumulado
    const ganhoLiquidoAcum = pesoFinalMes - pesoInicialAno - pesoEntAcum + pesoSaiAcum;
    const arrobasProduzidasAcumulado = (pesoFinalMes > 0 && pesoInicialAno > 0 && cabMediaAcum > 0)
      ? ganhoLiquidoAcum / 30 : null;

    // @/ha acumulado
    const arrobasHaAcumuladoAno = (arrobasProduzidasAcumulado !== null && areaProdutiva > 0)
      ? arrobasProduzidasAcumulado / areaProdutiva : null;

    // Valor patrimonial
    const valorRebanho = valorRebanhoData?.total ?? null;
    const valorPorCabeca = valorRebanho !== null && saldoFinalMes > 0 ? valorRebanho / saldoFinalMes : null;
    const valorPorHa = valorRebanho !== null && areaProdutiva > 0 ? valorRebanho / areaProdutiva : null;
    const valorRebanhoFechado = valorRebanhoData?.fechado ?? false;
    const arrobasEstoqueFinal = pesoFinalMes > 0 ? pesoFinalMes / 30 : 0;
    const valorArrobaEstoqueFinal = valorRebanho !== null && arrobasEstoqueFinal > 0
      ? valorRebanho / arrobasEstoqueFinal : null;

    // ===== COMPARAÇÕES =====

    // --- MoM ---
    const compSaldoMoM = saldoAnterior > 0 ? buildComparacao(saldoFinalMes, saldoAnterior, 'mensal') : null;
    const pesoMedioAnterior = mes > 1 ? viewPesoMedio(viewByMesAno, mes - 1)
      : calcPesoMedioPonderado(saldosIniciais.filter(s => s.ano === ano).map(s => ({ quantidade: s.quantidade, pesoKg: s.pesoMedioKg ?? null })));
    const compPesoMedioMoM = pesoMedioRebanhoKg !== null && pesoMedioAnterior !== null ? buildComparacao(pesoMedioRebanhoKg, pesoMedioAnterior, 'mensal') : null;

    const pesoTotalAnt = mes > 1 ? viewPesoTotalFinal(viewByMesAno, mes - 1) : 0;
    const uaTotalAnt = pesoTotalAnt / 450;
    const uaHaAnt = areaProdutiva > 0 ? uaTotalAnt / areaProdutiva : null;
    const compUaHaMoM = uaHa !== null && uaHaAnt !== null ? buildComparacao(uaHa, uaHaAnt, 'mensal') : null;

    const compValorMoM = valorRebanho !== null && valorRebanhoMoM !== null ? buildComparacao(valorRebanho, valorRebanhoMoM, 'mensal') : null;
    const valorPorCabecaAnt = valorRebanhoMoM !== null && saldoAnterior > 0 ? valorRebanhoMoM / saldoAnterior : null;
    const compValorPorCabecaMoM = valorPorCabeca !== null && valorPorCabecaAnt !== null ? buildComparacao(valorPorCabeca, valorPorCabecaAnt, 'mensal') : null;

    let compArrobasMes: Comparacao | null = null;
    let compArrobasHaMes: Comparacao | null = null;
    if (mes > 1) {
      const mesAntStr = `${ano}-${String(mes - 1).padStart(2, '0')}`;
      const saidasMesAnt = saidasDesfrute(filterByAnoMes(lancamentos, mesAntStr));
      const arrobasAnt = saidasMesAnt.reduce((s, l) => s + calcArrobasSafe(l), 0);
      if (arrobasAnt > 0) compArrobasMes = buildComparacao(arrobasSaidasMes, arrobasAnt, 'mensal');
      if (arrobasAnt > 0 && areaProdutiva > 0 && arrobasHaMes !== null) {
        compArrobasHaMes = buildComparacao(arrobasHaMes, arrobasAnt / areaProdutiva, 'mensal');
      }
    }

    // GMD mês MoM
    let compGmdMesMoM: Comparacao | null = null;
    if (mes > 1) {
      const gmdMesAnt = viewGmdMes(viewByMesAno, mes - 1);
      compGmdMesMoM = gmdMes !== null && gmdMesAnt !== null ? buildComparacao(gmdMes, gmdMesAnt, 'mensal') : null;
    }

    // UA/ha méd. MoM
    let compUaHaMediaMoM: Comparacao | null = null;
    if (mes > 1) {
      const uaHaMensaisAnt = uaHaMensais.slice(0, mes - 1);
      const uaHaMediaAnt = uaHaMensaisAnt.length > 0 ? uaHaMensaisAnt.reduce((a, b) => a + b, 0) / uaHaMensaisAnt.length : null;
      compUaHaMediaMoM = uaHaMediaAno !== null && uaHaMediaAnt !== null ? buildComparacao(uaHaMediaAno, uaHaMediaAnt, 'mensal') : null;
    }

    // --- YoY from view ano anterior ---
    const saldoYoY = viewSaldoFinal(viewByMesAnoAnt, mes);
    const compSaldo = saldoYoY > 0 ? buildComparacao(saldoFinalMes, saldoYoY, 'yoy') : null;

    const pesoYoY = viewPesoMedio(viewByMesAnoAnt, mes);
    const compPesoMedio = pesoMedioRebanhoKg !== null && pesoYoY !== null ? buildComparacao(pesoMedioRebanhoKg, pesoYoY, 'yoy') : null;

    const pesoTotalYoY = viewPesoTotalFinal(viewByMesAnoAnt, mes);
    const uaTotalYoY = pesoTotalYoY / 450;
    const uaHaYoY = areaProdutiva > 0 ? uaTotalYoY / areaProdutiva : null;
    const compUaHa = uaHa !== null && uaHaYoY !== null ? buildComparacao(uaHa, uaHaYoY, 'yoy') : null;

    // UA/ha média do ano anterior
    const uaHaMensaisYoY: number[] = [];
    for (let m = 1; m <= mes; m++) {
      const ptf = viewPesoTotalFinal(viewByMesAnoAnt, m);
      const ua = ptf / 450;
      const uah = areaProdutiva > 0 ? ua / areaProdutiva : null;
      if (uah !== null && ptf > 0) uaHaMensaisYoY.push(uah);
    }
    const uaHaMediaAnoYoY = uaHaMensaisYoY.length > 0
      ? uaHaMensaisYoY.reduce((a, b) => a + b, 0) / uaHaMensaisYoY.length : null;
    const compUaHaMedia = uaHaMediaAno !== null && uaHaMediaAnoYoY !== null
      ? buildComparacao(uaHaMediaAno, uaHaMediaAnoYoY, 'acumulado_yoy') : null;

    const compValor = valorRebanho !== null && valorRebanhoYoY !== null ? buildComparacao(valorRebanho, valorRebanhoYoY, 'yoy') : null;
    const valorPorCabecaYoY = valorRebanhoYoY !== null && saldoYoY > 0 ? valorRebanhoYoY / saldoYoY : null;
    const compValorPorCabecaYoY = valorPorCabeca !== null && valorPorCabecaYoY !== null ? buildComparacao(valorPorCabeca, valorPorCabecaYoY, 'yoy') : null;

    // Arrobas YoY
    const anoMesYoYStr = `${ano - 1}-${String(mes).padStart(2, '0')}`;
    const saidasMesYoY = saidasDesfrute(filterByAnoMes(lancamentos, anoMesYoYStr));
    const arrobasMesYoY = saidasMesYoY.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const compArrobasMesYoY = arrobasMesYoY > 0 ? buildComparacao(arrobasSaidasMes, arrobasMesYoY, 'yoy') : null;
    const compArrobasHaMesYoY = arrobasMesYoY > 0 && areaProdutiva > 0 && arrobasHaMes !== null
      ? buildComparacao(arrobasHaMes, arrobasMesYoY / areaProdutiva, 'yoy') : null;

    // Acumulado YoY
    const lancsAcumYoY = filterByAnoAteMes(lancamentos, ano - 1, mes);
    const saidasAcumYoY = saidasDesfrute(lancsAcumYoY);
    const arrobasAcumYoY = saidasAcumYoY.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const compArrobasAcum = arrobasAcumYoY > 0 ? buildComparacao(arrobasSaidasAcumuladoAno, arrobasAcumYoY, 'acumulado_yoy') : null;

    // @ produzidas acumulado YoY — from view
    const saldoInicialAnoAnt = viewSaldoInicial(viewByMesAnoAnt, 1);
    const pesoInicialAnoAnt = viewPesoTotalInicial(viewByMesAnoAnt, 1);
    const pesoFinalYoY = viewPesoTotalFinal(viewByMesAnoAnt, mes);
    let pesoEntAcumYoY = 0, pesoSaiAcumYoY = 0;
    for (let m = 1; m <= mes; m++) {
      pesoEntAcumYoY += viewPesoEntradas(viewByMesAnoAnt, m);
      pesoSaiAcumYoY += viewPesoSaidas(viewByMesAnoAnt, m);
    }
    const ganhoLiqAcumYoY = pesoFinalYoY - pesoInicialAnoAnt - pesoEntAcumYoY + pesoSaiAcumYoY;
    const saldoFinalYoY = viewSaldoFinal(viewByMesAnoAnt, mes);
    const cabMediaAcumYoY = (saldoInicialAnoAnt + saldoFinalYoY) / 2;
    const arrobasProduzidasAcumYoY = (pesoFinalYoY > 0 && pesoInicialAnoAnt > 0 && cabMediaAcumYoY > 0) ? ganhoLiqAcumYoY / 30 : null;
    const compArrobasProdAcum = arrobasProduzidasAcumulado !== null && arrobasProduzidasAcumYoY !== null
      ? buildComparacao(arrobasProduzidasAcumulado, arrobasProduzidasAcumYoY, 'acumulado_yoy') : null;

    let compArrobasHaAcum: Comparacao | null = null;
    if (arrobasHaAcumuladoAno !== null && arrobasProduzidasAcumYoY !== null && areaProdutiva > 0) {
      compArrobasHaAcum = buildComparacao(arrobasHaAcumuladoAno, arrobasProduzidasAcumYoY / areaProdutiva, 'acumulado_yoy');
    }

    const gmdMesYoY = viewGmdMes(viewByMesAnoAnt, mes);
    const compGmdMes = gmdMes !== null && gmdMesYoY !== null ? buildComparacao(gmdMes, gmdMesYoY, 'yoy') : null;

    // GMD acumulado YoY
    const diasAcumYoY = Array.from({ length: mes }, (_, i) => new Date(ano - 1, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
    const gmdAcumuladoYoY = calcGMD(pesoFinalYoY, pesoInicialAnoAnt, pesoEntAcumYoY, pesoSaiAcumYoY, diasAcumYoY, cabMediaAcumYoY);
    const compGmdAcum = gmdAcumulado !== null && gmdAcumuladoYoY !== null ? buildComparacao(gmdAcumulado, gmdAcumuladoYoY, 'acumulado_yoy') : null;

    // Desfrute acumulado YoY
    const totalCabSaidasAcumYoY = saidasAcumYoY.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabAcumYoY = calcDesfrute(totalCabSaidasAcumYoY, saldoInicialAnoAnt);
    const compDesfruteCab = desfruteCabecasAcumulado !== null && desfruteCabAcumYoY !== null
      ? buildComparacao(desfruteCabecasAcumulado, desfruteCabAcumYoY, 'acumulado_yoy') : null;

    const arrobasIniYoY = calcArrobasIniciais(saldosIniciais, ano - 1);
    const desfruteArrobAcumYoY = calcDesfruteArrobas(arrobasAcumYoY, arrobasIniYoY);
    const compDesfruteArrob = desfruteArrobasAcumulado !== null && desfruteArrobAcumYoY !== null
      ? buildComparacao(desfruteArrobasAcumulado, desfruteArrobAcumYoY, 'acumulado_yoy') : null;

    const compArrobasDesfrutadas = arrobasAcumYoY > 0
      ? buildComparacao(arrobasSaidasAcumuladoAno, arrobasAcumYoY, 'acumulado_yoy') : null;

    // ===== HISTÓRICO (up to 3 years) — from views =====
    const viewSets = [
      { a: ano, byMes: viewByMesAno },
      { a: ano - 1, byMes: viewByMesAnoAnt },
      { a: ano - 2, byMes: viewByMesAno2 },
    ];

    const historico: HistoricoAnual[] = viewSets.map(({ a, byMes: vbm }) => {
      const meses: HistoricoMensal[] = [];
      const saldoIniAno = viewSaldoInicial(vbm, 1);
      const pesoIniAno = viewPesoTotalInicial(vbm, 1);
      const arrobasIniAno = calcArrobasIniciais(saldosIniciais, a);
      const uaHaAcumList: number[] = [];
      const maxMes = a === ano ? mes : 12;

      for (let m = 1; m <= maxMes; m++) {
        const sFinal = viewSaldoFinal(vbm, m);
        const ptf = viewPesoTotalFinal(vbm, m);

        // UA/ha
        const ua = ptf / 450;
        const uah = areaProdutiva > 0 ? ua / areaProdutiva : null;
        if (uah !== null && ptf > 0) uaHaAcumList.push(uah);
        const uaHaMediaAteMes = uaHaAcumList.length > 0 ? uaHaAcumList.reduce((x, y) => x + y, 0) / uaHaAcumList.length : null;

        // Arrobas produzidas acumuladas
        let pesoEntH = 0, pesoSaiH = 0;
        for (let mm = 1; mm <= m; mm++) {
          pesoEntH += viewPesoEntradas(vbm, mm);
          pesoSaiH += viewPesoSaidas(vbm, mm);
        }
        const glH = ptf - pesoIniAno - pesoEntH + pesoSaiH;
        const cabMediaH = (saldoIniAno + sFinal) / 2;
        const arrobasProduzidasAteMes = (ptf > 0 && pesoIniAno > 0 && cabMediaH > 0) ? glH / 30 : null;

        // GMD acumulado
        const diasAteMes = Array.from({ length: m }, (_, i) => new Date(a, i + 1, 0).getDate()).reduce((x, y) => x + y, 0);
        const gmdAteMes = calcGMD(ptf, pesoIniAno, pesoEntH, pesoSaiH, diasAteMes, cabMediaH);

        // Desfrute
        const lancsAteMes = filterByAnoAteMes(lancamentos, a, m);
        const saidasAteMes = saidasDesfrute(lancsAteMes);
        const cabSaidasAteMes = saidasAteMes.reduce((s2, l) => s2 + l.quantidade, 0);
        const desfCabAteMes = calcDesfrute(cabSaidasAteMes, saldoIniAno);
        const arrobasSaidasAteMes = saidasAteMes.reduce((s2, l) => s2 + calcArrobasSafe(l), 0);
        const desfArrobAteMes = calcDesfruteArrobas(arrobasSaidasAteMes, arrobasIniAno);

        meses.push({
          mes: m,
          arrobasProduzidasAcum: arrobasProduzidasAteMes,
          uaHaMedia: uaHaMediaAteMes,
          gmdAcumulado: gmdAteMes,
          desfruteCabAcum: desfCabAteMes,
          desfruteArrobAcum: desfArrobAteMes,
        });
      }
      return { ano: a, meses };
    });

    function buildCompHistorico(field: keyof HistoricoMensal): ComparacaoHistorica[] {
      const atual = historico[0]?.meses[mes - 1]?.[field] as number | null;
      return historico.slice(1).filter(h => {
        const val = h.meses[mes - 1]?.[field] as number | null;
        return val !== null && val !== undefined;
      }).map(h => {
        const val = h.meses[mes - 1]?.[field] as number | null;
        return {
          anoComparativo: h.ano,
          valorAtual: atual,
          valorComparativo: val,
          diferencaAbsoluta: atual !== null && val !== null ? atual - val : null,
          diferencaPercentual: atual !== null && val !== null && val !== 0 ? ((atual - val) / Math.abs(val)) * 100 : null,
        };
      });
    }

    const comparacoesHistorico = {
      arrobasProduzidas: buildCompHistorico('arrobasProduzidasAcum'),
      uaHaMedia: buildCompHistorico('uaHaMedia'),
      gmdAcumulado: buildCompHistorico('gmdAcumulado'),
    };

    const pesoMedioEstimado = (viewByMesAno[mes] || []).some(c =>
      c.fonte_oficial_mes !== 'fechamento' && c.saldo_final > 0
    );

    return {
      saldoFinalMes,
      pesoMedioRebanhoKg,
      uaTotal,
      uaHa,
      uaHaMediaAno,
      areaProdutiva,
      arrobasSaidasMes,
      arrobasHaMes,
      arrobasSaidasAcumuladoAno,
      arrobasHaAcumuladoAno,
      arrobasProduzidasMes,
      arrobasProduzidasAcumulado,
      desfruteCabecasMes,
      desfruteArrobasMes,
      desfruteCabecasAcumulado,
      desfruteArrobasAcumulado,
      gmdMes,
      gmdAcumulado,
      gmdAberturaMes,
      valorRebanho,
      valorPorCabeca,
      valorPorHa,
      valorArrobaEstoqueFinal,
      comparacoes: {
        saldoFinalMes: { mensal: compSaldoMoM, anual: compSaldo },
        pesoMedioRebanhoKg: { mensal: compPesoMedioMoM, anual: compPesoMedio },
        uaHa: { mensal: compUaHaMoM, anual: compUaHa },
        uaHaMediaAno: { mensal: compUaHaMediaMoM, anual: compUaHaMedia },
        valorRebanho: { mensal: compValorMoM, anual: compValor },
        arrobasSaidasMes: { mensal: compArrobasMes, anual: compArrobasMesYoY },
        arrobasHaMes: { mensal: compArrobasHaMes, anual: compArrobasHaMesYoY },
        arrobasSaidasAcumuladoAno: { mensal: null, anual: compArrobasAcum },
        arrobasHaAcumuladoAno: { mensal: null, anual: compArrobasHaAcum },
        arrobasProduzidasAcumulado: { mensal: null, anual: compArrobasProdAcum },
        gmdMes: { mensal: compGmdMesMoM, anual: compGmdMes },
        gmdAcumulado: { mensal: null, anual: compGmdAcum },
        desfruteCabecasAcumulado: { mensal: null, anual: compDesfruteCab },
        desfruteArrobasAcumulado: { mensal: null, anual: compDesfruteArrob },
        arrobasDesfrutadasAcum: { mensal: null, anual: compArrobasDesfrutadas },
        valorPorCabeca: { mensal: compValorPorCabecaMoM, anual: compValorPorCabecaYoY },
      },
      historico,
      comparacoesHistorico,
      qualidade: {
        pesoMedioEstimado,
        gmdDisponivel: gmdMes !== null || gmdAcumulado !== null,
        areaProdutivaEstimativa,
        valorRebanhoFechado,
      },
      loading,
    };
  }, [lancamentos, saldosIniciais, pastos, ano, mes, anoMes, valorRebanhoData, valorRebanhoYoY, valorRebanhoMoM, loadingValor, loadingView, viewByMesAno, viewByMesAnoAnt, viewByMesAno2]);

  return indicadores;
}
