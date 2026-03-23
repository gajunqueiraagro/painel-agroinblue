/**
 * Hook central de indicadores zootécnicos.
 *
 * Orquestra dados de saldos, lançamentos, pastos e valor do rebanho,
 * delegando 100% dos cálculos à lib central (src/lib/calculos/*).
 *
 * A tela que consome este hook NÃO deve fazer nenhum cálculo próprio.
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';
import {
  calcSaldoPorCategoriaLegado,
  calcSaldoMensalAcumulado,
  calcResumoMovimentacoes,
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

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Estrutura de comparação para um indicador */
export interface Comparacao {
  valorAtual: number;
  valorComparativo: number;
  diferencaAbsoluta: number;
  diferencaPercentual: number | null; // null se base = 0
  tipo: 'mensal' | 'yoy';
  disponivel: boolean;
}

/** Flags de qualidade/consistência dos dados */
export interface QualidadeFlags {
  pesoMedioEstimado: boolean;
  gmdDisponivel: boolean;
  areaProdutivaEstimativa: boolean;
  valorRebanhoFechado: boolean;
}

export interface IndicadoresZootecnicos {
  // --- Estoque ---
  saldoFinalMes: number;
  pesoMedioRebanhoKg: number | null;

  // --- Lotação ---
  uaTotal: number;
  uaHa: number | null;
  areaProdutiva: number;

  // --- Arrobas (mês) ---
  arrobasSaidasMes: number;
  arrobasHaMes: number | null;

  // --- Arrobas (acumulado ano) ---
  arrobasSaidasAcumuladoAno: number;
  arrobasHaAcumuladoAno: number | null;

  // --- Desfrute (mês) ---
  desfruteCabecasMes: number | null;
  desfruteArrobasMes: number | null;

  // --- Desfrute (acumulado ano) ---
  desfruteCabecasAcumulado: number | null;
  desfruteArrobasAcumulado: number | null;

  // --- GMD ---
  gmdMes: number | null;
  gmdAcumulado: number | null;

  // --- Valor patrimonial ---
  valorRebanho: number | null;
  valorPorCabeca: number | null;
  valorPorHa: number | null;

  // --- Comparações ---
  comparacoes: {
    saldoFinalMes: Comparacao | null;
    uaHa: Comparacao | null;
    arrobasSaidasMes: Comparacao | null;
    arrobasHaMes: Comparacao | null;
    valorRebanho: Comparacao | null;
    pesoMedioRebanhoKg: Comparacao | null;
  };

  // --- Qualidade ---
  qualidade: QualidadeFlags;

  // --- Meta ---
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildComparacao(
  atual: number,
  comparativo: number | null | undefined,
  tipo: 'mensal' | 'yoy',
): Comparacao | null {
  if (comparativo === null || comparativo === undefined) return null;
  const diff = atual - comparativo;
  const pct = comparativo !== 0 ? (diff / Math.abs(comparativo)) * 100 : null;
  return {
    valorAtual: atual,
    valorComparativo: comparativo,
    diferencaAbsoluta: diff,
    diferencaPercentual: pct,
    tipo,
    disponivel: true,
  };
}

const TIPOS_SAIDA_DESFRUTE = ['abate', 'venda', 'consumo', 'transferencia_saida'];

function filterByAnoMes(lancs: Lancamento[], anoMes: string) {
  return lancs.filter(l => l.data.startsWith(anoMes));
}

function filterByAnoAteMes(lancs: Lancamento[], ano: number, mes: number) {
  const start = `${ano}-01-01`;
  const end = `${ano}-${String(mes).padStart(2, '0')}-31`;
  return lancs.filter(l => l.data >= start && l.data <= end);
}

function saidasDesfrute(lancs: Lancamento[]) {
  return lancs.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIndicadoresZootecnicos(
  fazendaId: string | undefined,
  ano: number,
  mes: number, // 1-12
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  pastos: Pasto[],
) {
  const [valorRebanhoData, setValorRebanhoData] = useState<{ total: number; fechado: boolean } | null>(null);
  const [loadingValor, setLoadingValor] = useState(false);

  // --- Load valor rebanho for the month ---
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  const loadValorRebanho = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') {
      setValorRebanhoData(null);
      return;
    }
    setLoadingValor(true);
    try {
      const [precosRes, fechRes] = await Promise.all([
        supabase
          .from('valor_rebanho_mensal')
          .select('categoria, preco_kg')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes),
        supabase
          .from('valor_rebanho_fechamento')
          .select('status')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMes)
          .maybeSingle(),
      ]);

      if (precosRes.data && precosRes.data.length > 0) {
        // Calculate total using saldo final × peso × preço
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const precoMap = new Map(precosRes.data.map(p => [p.categoria, Number(p.preco_kg)]));

        let total = 0;
        saldoMap.forEach((qtd, cat) => {
          const preco = precoMap.get(cat) || 0;
          // Need peso — use saldo inicial or lancamentos
          const pesoKg = getPesoMedioCat(cat, saldosIniciais, lancamentos, ano, mes);
          total += qtd * (pesoKg || 0) * preco;
        });

        setValorRebanhoData({
          total,
          fechado: fechRes.data?.status === 'fechado',
        });
      } else {
        setValorRebanhoData(null);
      }
    } catch {
      setValorRebanhoData(null);
    } finally {
      setLoadingValor(false);
    }
  }, [fazendaId, anoMes, saldosIniciais, lancamentos, ano, mes]);

  useEffect(() => { loadValorRebanho(); }, [loadValorRebanho]);

  // --- Compute all indicators ---
  const indicadores: IndicadoresZootecnicos = useMemo(() => {
    const loading = loadingValor;

    // Saldo final do mês (via calcSaldoPorCategoriaLegado — documentado como variante legada)
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
    const saldoFinalMes = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);

    // Saldo inicial do ano
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === ano)
      .reduce((sum, s) => sum + s.quantidade, 0);

    // Peso médio do rebanho (ponderado pelos saldos)
    const itensParaPeso: { quantidade: number; pesoKg: number | null }[] = [];
    saldoMap.forEach((qtd, cat) => {
      if (qtd > 0) {
        itensParaPeso.push({ quantidade: qtd, pesoKg: getPesoMedioCat(cat, saldosIniciais, lancamentos, ano, mes) });
      }
    });
    const pesoMedioRebanhoKg = calcPesoMedioPonderado(itensParaPeso);
    const pesoMedioEstimado = itensParaPeso.some(i => i.pesoKg === null);

    // Área produtiva
    const areaProdutiva = calcAreaProdutivaPecuaria(pastos);
    const areaProdutivaEstimativa = pastos.filter(p => p.ativo && p.entra_conciliacao).length === 0;

    // UA/ha
    const uaTotal = calcUA(saldoFinalMes, pesoMedioRebanhoKg);
    const uaHa = calcUAHa(uaTotal, areaProdutiva);

    // --- Arrobas do mês ---
    const lancsMes = filterByAnoMes(lancamentos, anoMes);
    const saidasMes = saidasDesfrute(lancsMes);
    const arrobasSaidasMes = saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const arrobasHaMes = areaProdutiva > 0 ? arrobasSaidasMes / areaProdutiva : null;

    // --- Arrobas acumulado ano ---
    const lancsAcum = filterByAnoAteMes(lancamentos, ano, mes);
    const saidasAcum = saidasDesfrute(lancsAcum);
    const arrobasSaidasAcumuladoAno = saidasAcum.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const arrobasHaAcumuladoAno = areaProdutiva > 0 ? arrobasSaidasAcumuladoAno / areaProdutiva : null;

    // --- Desfrute mês ---
    const totalCabSaidasMes = saidasMes.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabecasMes = calcDesfrute(totalCabSaidasMes, saldoInicialAno);
    const arrobasIni = calcArrobasIniciais(saldosIniciais, ano);
    const desfruteArrobasMes = calcDesfruteArrobas(arrobasSaidasMes, arrobasIni);

    // --- Desfrute acumulado ---
    const totalCabSaidasAcum = saidasAcum.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabecasAcumulado = calcDesfrute(totalCabSaidasAcum, saldoInicialAno);
    const desfruteArrobasAcumulado = calcDesfruteArrobas(arrobasSaidasAcumuladoAno, arrobasIni);

    // --- GMD ---
    const diasMes = new Date(ano, mes, 0).getDate();
    const pesoFinalMes = saldoFinalMes * (pesoMedioRebanhoKg || 0);
    // Peso inicial do mês = saldo do mês anterior × peso médio
    const saldoMapAnterior = mes > 1
      ? calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1)
      : new Map<string, number>();
    const saldoAnterior = mes > 1
      ? Array.from(saldoMapAnterior.values()).reduce((s, v) => s + v, 0)
      : saldoInicialAno;
    const pesoInicialMes = saldoAnterior * (pesoMedioRebanhoKg || 0); // simplificação: mesmo peso médio
    const pesoEntradasMes = lancsMes.filter(l => ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo))
      .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    const pesoSaidasMes = saidasMes.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
    const cabMediaMes = (saldoAnterior + saldoFinalMes) / 2;
    const gmdMes = calcGMD(pesoFinalMes, pesoInicialMes, pesoEntradasMes, pesoSaidasMes, diasMes, cabMediaMes);

    // GMD acumulado (jan→mês)
    const diasAcum = Array.from({ length: mes }, (_, i) => new Date(ano, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
    const pesoInicialAno = saldoInicialAno * (getPesoMedioInicial(saldosIniciais, ano) || 0);
    const pesoEntradasAcum = lancsAcum.filter(l => ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo))
      .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    const pesoSaidasAcum = saidasAcum.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
    const cabMediaAcum = (saldoInicialAno + saldoFinalMes) / 2;
    const gmdAcumulado = calcGMD(pesoFinalMes, pesoInicialAno, pesoEntradasAcum, pesoSaidasAcum, diasAcum, cabMediaAcum);

    // --- Valor patrimonial ---
    const valorRebanho = valorRebanhoData?.total ?? null;
    const valorPorCabeca = valorRebanho !== null && saldoFinalMes > 0 ? valorRebanho / saldoFinalMes : null;
    const valorPorHa = valorRebanho !== null && areaProdutiva > 0 ? valorRebanho / areaProdutiva : null;
    const valorRebanhoFechado = valorRebanhoData?.fechado ?? false;

    // --- Comparações (mês anterior) ---
    let compSaldo: Comparacao | null = null;
    let compUaHa: Comparacao | null = null;
    let compArrobasMes: Comparacao | null = null;
    let compArrobasHaMes: Comparacao | null = null;
    let compValor: Comparacao | null = null;
    let compPesoMedio: Comparacao | null = null;

    if (mes > 1) {
      const saldoAnt = Array.from(saldoMapAnterior.values()).reduce((s, v) => s + v, 0);
      compSaldo = buildComparacao(saldoFinalMes, saldoAnt, 'mensal');

      // UA/ha anterior
      const pesoAnt = calcPesoMedioPonderado(
        Array.from(saldoMapAnterior.entries())
          .filter(([, q]) => q > 0)
          .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCat(cat, saldosIniciais, lancamentos, ano, mes - 1) }))
      );
      const uaAnt = calcUA(saldoAnt, pesoAnt);
      const uaHaAnt = calcUAHa(uaAnt, areaProdutiva);
      if (uaHa !== null && uaHaAnt !== null) compUaHa = buildComparacao(uaHa, uaHaAnt, 'mensal');

      if (pesoMedioRebanhoKg !== null && pesoAnt !== null) compPesoMedio = buildComparacao(pesoMedioRebanhoKg, pesoAnt, 'mensal');

      // Arrobas mês anterior
      const mesAnt = String(mes - 1).padStart(2, '0');
      const anoMesAnt = `${ano}-${mesAnt}`;
      const saidasMesAnt = saidasDesfrute(filterByAnoMes(lancamentos, anoMesAnt));
      const arrobasAnt = saidasMesAnt.reduce((s, l) => s + calcArrobasSafe(l), 0);
      if (arrobasAnt > 0) compArrobasMes = buildComparacao(arrobasSaidasMes, arrobasAnt, 'mensal');
      if (arrobasAnt > 0 && areaProdutiva > 0 && arrobasHaMes !== null) {
        compArrobasHaMes = buildComparacao(arrobasHaMes, arrobasAnt / areaProdutiva, 'mensal');
      }
    }

    return {
      saldoFinalMes,
      pesoMedioRebanhoKg,
      uaTotal,
      uaHa,
      areaProdutiva,
      arrobasSaidasMes,
      arrobasHaMes,
      arrobasSaidasAcumuladoAno,
      arrobasHaAcumuladoAno,
      desfruteCabecasMes,
      desfruteArrobasMes,
      desfruteCabecasAcumulado,
      desfruteArrobasAcumulado,
      gmdMes,
      gmdAcumulado,
      valorRebanho,
      valorPorCabeca,
      valorPorHa,
      comparacoes: {
        saldoFinalMes: compSaldo,
        uaHa: compUaHa,
        arrobasSaidasMes: compArrobasMes,
        arrobasHaMes: compArrobasHaMes,
        valorRebanho: compValor,
        pesoMedioRebanhoKg: compPesoMedio,
      },
      qualidade: {
        pesoMedioEstimado,
        gmdDisponivel: gmdMes !== null || gmdAcumulado !== null,
        areaProdutivaEstimativa,
        valorRebanhoFechado,
      },
      loading,
    };
  }, [lancamentos, saldosIniciais, pastos, ano, mes, anoMes, valorRebanhoData, loadingValor]);

  return indicadores;
}

// ---------------------------------------------------------------------------
// Helpers de peso (internos)
// ---------------------------------------------------------------------------

/**
 * Obtém peso médio de uma categoria usando dados disponíveis.
 * NOTA: Usa variante legada (código da categoria). Documentado para futura migração.
 */
function getPesoMedioCat(
  catCodigo: string,
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes: number,
): number | null {
  // 1. Último lançamento com peso no período
  const lancsAteMes = lancamentos.filter(
    l => l.categoria === catCodigo && l.data <= `${ano}-${String(mes).padStart(2, '0')}-31` && l.pesoMedioKg && l.pesoMedioKg > 0,
  );
  if (lancsAteMes.length > 0) {
    // Mais recente
    const sorted = [...lancsAteMes].sort((a, b) => b.data.localeCompare(a.data));
    return sorted[0].pesoMedioKg!;
  }

  // 2. Saldo inicial do ano
  const si = saldosIniciais.find(s => s.ano === ano && s.categoria === catCodigo);
  if (si?.pesoMedioKg && si.pesoMedioKg > 0) return si.pesoMedioKg;

  return null;
}

/** Peso médio ponderado do saldo inicial do ano (todas categorias). */
function getPesoMedioInicial(saldosIniciais: SaldoInicial[], ano: number): number | null {
  const itens = saldosIniciais
    .filter(s => s.ano === ano && s.quantidade > 0)
    .map(s => ({ quantidade: s.quantidade, pesoKg: s.pesoMedioKg ?? null }));
  return calcPesoMedioPonderado(itens);
}
