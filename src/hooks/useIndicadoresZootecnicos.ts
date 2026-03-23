/**
 * Hook central de indicadores zootécnicos.
 *
 * Orquestra dados de saldos, lançamentos, pastos e valor do rebanho,
 * delegando 100% dos cálculos à lib central (src/lib/calculos/*).
 *
 * Regras de comparação histórica:
 * - Indicadores estruturais/patrimoniais → YoY (mesmo mês do ano anterior)
 * - Indicadores mensais operacionais → vs mês anterior
 * - Indicadores acumulados → vs acumulado do ano anterior até o mesmo mês
 *
 * A tela que consome este hook NÃO deve fazer nenhum cálculo próprio.
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Lancamento, SaldoInicial } from '@/types/cattle';
import type { Pasto } from '@/hooks/usePastos';
import {
  calcSaldoPorCategoriaLegado,
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
  diferencaPercentual: number | null;
  tipo: 'mensal' | 'yoy' | 'acumulado_yoy';
  disponivel: boolean;
}

/** Flags de qualidade/consistência dos dados */
export interface QualidadeFlags {
  pesoMedioEstimado: boolean;
  gmdDisponivel: boolean;
  areaProdutivaEstimativa: boolean;
  valorRebanhoFechado: boolean;
}

/** Detalhe de um grupo de movimentações para abertura do GMD */
export interface GmdMovDetalhe {
  tipo: string;
  label: string;
  quantidade: number;
  pesoTotalKg: number;
}

/** Estrutura completa da abertura do cálculo do GMD */
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
  baseCompleta: boolean;
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
  gmdAberturaMes: GmdAbertura;

  // --- Valor patrimonial ---
  valorRebanho: number | null;
  valorPorCabeca: number | null;
  valorPorHa: number | null;

  // --- Comparações ---
  comparacoes: {
    // Estruturais → YoY
    saldoFinalMes: Comparacao | null;
    pesoMedioRebanhoKg: Comparacao | null;
    uaHa: Comparacao | null;
    valorRebanho: Comparacao | null;
    // Operacionais → vs mês anterior
    arrobasSaidasMes: Comparacao | null;
    arrobasHaMes: Comparacao | null;
    // Acumulados → vs acumulado ano anterior
    arrobasSaidasAcumuladoAno: Comparacao | null;
    arrobasHaAcumuladoAno: Comparacao | null;
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
  tipo: 'mensal' | 'yoy' | 'acumulado_yoy',
): Comparacao | null {
  if (comparativo === null || comparativo === undefined) return null;
  if (atual === 0 && comparativo === 0) return null;
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

/** Agrupa lançamentos por tipo, retornando quantidade total e peso total */
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
// Hook
// ---------------------------------------------------------------------------

export function useIndicadoresZootecnicos(
  fazendaId: string | undefined,
  ano: number,
  mes: number,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  pastos: Pasto[],
) {
  const [valorRebanhoData, setValorRebanhoData] = useState<{ total: number; fechado: boolean } | null>(null);
  const [valorRebanhoYoY, setValorRebanhoYoY] = useState<number | null>(null);
  const [loadingValor, setLoadingValor] = useState(false);

  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  // --- Load valor rebanho (current + YoY) ---
  const loadValorRebanho = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') {
      setValorRebanhoData(null);
      setValorRebanhoYoY(null);
      return;
    }
    setLoadingValor(true);
    try {
      const anoMesYoY = `${ano - 1}-${String(mes).padStart(2, '0')}`;
      const [precosRes, fechRes, precosYoYRes] = await Promise.all([
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
        supabase
          .from('valor_rebanho_mensal')
          .select('categoria, preco_kg')
          .eq('fazenda_id', fazendaId)
          .eq('ano_mes', anoMesYoY),
      ]);

      // Current month value
      if (precosRes.data && precosRes.data.length > 0) {
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const precoMap = new Map(precosRes.data.map(p => [p.categoria, Number(p.preco_kg)]));
        let total = 0;
        saldoMap.forEach((qtd, cat) => {
          const preco = precoMap.get(cat) || 0;
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

      // YoY value
      if (precosYoYRes.data && precosYoYRes.data.length > 0) {
        const saldoMapYoY = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano - 1, mes);
        const precoMapYoY = new Map(precosYoYRes.data.map(p => [p.categoria, Number(p.preco_kg)]));
        let totalYoY = 0;
        saldoMapYoY.forEach((qtd, cat) => {
          const preco = precoMapYoY.get(cat) || 0;
          const pesoKg = getPesoMedioCat(cat, saldosIniciais, lancamentos, ano - 1, mes);
          totalYoY += qtd * (pesoKg || 0) * preco;
        });
        setValorRebanhoYoY(totalYoY > 0 ? totalYoY : null);
      } else {
        setValorRebanhoYoY(null);
      }
    } catch {
      setValorRebanhoData(null);
      setValorRebanhoYoY(null);
    } finally {
      setLoadingValor(false);
    }
  }, [fazendaId, anoMes, saldosIniciais, lancamentos, ano, mes]);

  useEffect(() => { loadValorRebanho(); }, [loadValorRebanho]);

  // --- Compute all indicators ---
  const indicadores: IndicadoresZootecnicos = useMemo(() => {
    const loading = loadingValor;

    // ===== CURRENT PERIOD =====
    const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
    const saldoFinalMes = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
    const saldoInicialAno = saldosIniciais
      .filter(s => s.ano === ano)
      .reduce((sum, s) => sum + s.quantidade, 0);

    // Peso médio
    const itensParaPeso: { quantidade: number; pesoKg: number | null }[] = [];
    saldoMap.forEach((qtd, cat) => {
      if (qtd > 0) {
        itensParaPeso.push({ quantidade: qtd, pesoKg: getPesoMedioCat(cat, saldosIniciais, lancamentos, ano, mes) });
      }
    });
    const pesoMedioRebanhoKg = calcPesoMedioPonderado(itensParaPeso);
    const pesoMedioEstimado = itensParaPeso.some(i => i.pesoKg === null);

    // Área / UA
    const areaProdutiva = calcAreaProdutivaPecuaria(pastos);
    const areaProdutivaEstimativa = pastos.filter(p => p.ativo && p.entra_conciliacao).length === 0;
    const uaTotal = calcUA(saldoFinalMes, pesoMedioRebanhoKg);
    const uaHa = calcUAHa(uaTotal, areaProdutiva);

    // Arrobas mês
    const lancsMes = filterByAnoMes(lancamentos, anoMes);
    const saidasMes = saidasDesfrute(lancsMes);
    const arrobasSaidasMes = saidasMes.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const arrobasHaMes = areaProdutiva > 0 ? arrobasSaidasMes / areaProdutiva : null;

    // Arrobas acumulado
    const lancsAcum = filterByAnoAteMes(lancamentos, ano, mes);
    const saidasAcum = saidasDesfrute(lancsAcum);
    const arrobasSaidasAcumuladoAno = saidasAcum.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const arrobasHaAcumuladoAno = areaProdutiva > 0 ? arrobasSaidasAcumuladoAno / areaProdutiva : null;

    // Desfrute mês
    const totalCabSaidasMes = saidasMes.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabecasMes = calcDesfrute(totalCabSaidasMes, saldoInicialAno);
    const arrobasIni = calcArrobasIniciais(saldosIniciais, ano);
    const desfruteArrobasMes = calcDesfruteArrobas(arrobasSaidasMes, arrobasIni);

    // Desfrute acumulado
    const totalCabSaidasAcum = saidasAcum.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabecasAcumulado = calcDesfrute(totalCabSaidasAcum, saldoInicialAno);
    const desfruteArrobasAcumulado = calcDesfruteArrobas(arrobasSaidasAcumuladoAno, arrobasIni);

    // ===== GMD MÊS (com abertura) =====
    const diasMes = new Date(ano, mes, 0).getDate();
    const pesoFinalMes = saldoFinalMes * (pesoMedioRebanhoKg || 0);
    const saldoMapAnterior = mes > 1
      ? calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1)
      : new Map<string, number>();
    const saldoAnterior = mes > 1
      ? Array.from(saldoMapAnterior.values()).reduce((s, v) => s + v, 0)
      : saldoInicialAno;
    const pesoMedioAnterior = mes > 1
      ? calcPesoMedioPonderado(
          Array.from(saldoMapAnterior.entries())
            .filter(([, q]) => q > 0)
            .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCat(cat, saldosIniciais, lancamentos, ano, mes - 1) }))
        )
      : getPesoMedioInicial(saldosIniciais, ano);
    const pesoInicialMes = saldoAnterior * (pesoMedioAnterior || 0);

    const entradasMes = lancsMes.filter(l => TIPOS_ENTRADA.includes(l.tipo));
    const saidasGmdMes = lancsMes.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte');
    const pesoEntradasMes = entradasMes.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    const pesoSaidasMes = saidasGmdMes.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
    const cabMediaMes = (saldoAnterior + saldoFinalMes) / 2;
    const gmdMes = calcGMD(pesoFinalMes, pesoInicialMes, pesoEntradasMes, pesoSaidasMes, diasMes, cabMediaMes);

    const ganhoLiquido = pesoFinalMes - pesoInicialMes - pesoEntradasMes + pesoSaidasMes;
    const gmdAberturaMes: GmdAbertura = {
      pesoFinalEstoque: pesoFinalMes,
      pesoInicialEstoque: pesoInicialMes,
      pesoEntradas: pesoEntradasMes,
      pesoSaidas: pesoSaidasMes,
      ganhoLiquido,
      dias: diasMes,
      cabMedia: cabMediaMes,
      gmd: gmdMes,
      entradasDetalhe: agruparPorTipo(entradasMes),
      saidasDetalhe: agruparPorTipo(saidasGmdMes),
      baseCompleta: pesoFinalMes > 0 && pesoInicialMes > 0 && cabMediaMes > 0,
    };

    // GMD acumulado
    const diasAcum = Array.from({ length: mes }, (_, i) => new Date(ano, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
    const pesoInicialAno = saldoInicialAno * (getPesoMedioInicial(saldosIniciais, ano) || 0);
    const pesoEntradasAcum = lancsAcum.filter(l => TIPOS_ENTRADA.includes(l.tipo))
      .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    const pesoSaidasAcum = lancsAcum.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte')
      .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
    const cabMediaAcum = (saldoInicialAno + saldoFinalMes) / 2;
    const gmdAcumulado = calcGMD(pesoFinalMes, pesoInicialAno, pesoEntradasAcum, pesoSaidasAcum, diasAcum, cabMediaAcum);

    // Valor patrimonial
    const valorRebanho = valorRebanhoData?.total ?? null;
    const valorPorCabeca = valorRebanho !== null && saldoFinalMes > 0 ? valorRebanho / saldoFinalMes : null;
    const valorPorHa = valorRebanho !== null && areaProdutiva > 0 ? valorRebanho / areaProdutiva : null;
    const valorRebanhoFechado = valorRebanhoData?.fechado ?? false;

    // ===== COMPARAÇÕES =====

    // --- YoY: estruturais/patrimoniais ---
    const anoAnt = ano - 1;
    const saldoMapYoY = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoAnt, mes);
    const saldoYoY = Array.from(saldoMapYoY.values()).reduce((s, v) => s + v, 0);
    const compSaldo = saldoYoY > 0 ? buildComparacao(saldoFinalMes, saldoYoY, 'yoy') : null;

    const pesoYoY = calcPesoMedioPonderado(
      Array.from(saldoMapYoY.entries())
        .filter(([, q]) => q > 0)
        .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCat(cat, saldosIniciais, lancamentos, anoAnt, mes) }))
    );
    const compPesoMedio = pesoMedioRebanhoKg !== null && pesoYoY !== null ? buildComparacao(pesoMedioRebanhoKg, pesoYoY, 'yoy') : null;

    const uaTotalYoY = calcUA(saldoYoY, pesoYoY);
    const uaHaYoY = calcUAHa(uaTotalYoY, areaProdutiva);
    const compUaHa = uaHa !== null && uaHaYoY !== null ? buildComparacao(uaHa, uaHaYoY, 'yoy') : null;

    const compValor = valorRebanho !== null && valorRebanhoYoY !== null ? buildComparacao(valorRebanho, valorRebanhoYoY, 'yoy') : null;

    // --- MoM: operacionais ---
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

    // --- Acumulado YoY ---
    const lancsAcumYoY = filterByAnoAteMes(lancamentos, anoAnt, mes);
    const saidasAcumYoY = saidasDesfrute(lancsAcumYoY);
    const arrobasAcumYoY = saidasAcumYoY.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const compArrobasAcum = arrobasAcumYoY > 0 ? buildComparacao(arrobasSaidasAcumuladoAno, arrobasAcumYoY, 'acumulado_yoy') : null;
    let compArrobasHaAcum: Comparacao | null = null;
    if (arrobasAcumYoY > 0 && areaProdutiva > 0 && arrobasHaAcumuladoAno !== null) {
      compArrobasHaAcum = buildComparacao(arrobasHaAcumuladoAno, arrobasAcumYoY / areaProdutiva, 'acumulado_yoy');
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
      gmdAberturaMes,
      valorRebanho,
      valorPorCabeca,
      valorPorHa,
      comparacoes: {
        saldoFinalMes: compSaldo,
        pesoMedioRebanhoKg: compPesoMedio,
        uaHa: compUaHa,
        valorRebanho: compValor,
        arrobasSaidasMes: compArrobasMes,
        arrobasHaMes: compArrobasHaMes,
        arrobasSaidasAcumuladoAno: compArrobasAcum,
        arrobasHaAcumuladoAno: compArrobasHaAcum,
      },
      qualidade: {
        pesoMedioEstimado,
        gmdDisponivel: gmdMes !== null || gmdAcumulado !== null,
        areaProdutivaEstimativa,
        valorRebanhoFechado,
      },
      loading,
    };
  }, [lancamentos, saldosIniciais, pastos, ano, mes, anoMes, valorRebanhoData, valorRebanhoYoY, loadingValor]);

  return indicadores;
}

// ---------------------------------------------------------------------------
// Helpers de peso (internos)
// ---------------------------------------------------------------------------

function getPesoMedioCat(
  catCodigo: string,
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes: number,
): number | null {
  const lancsAteMes = lancamentos.filter(
    l => l.categoria === catCodigo && l.data <= `${ano}-${String(mes).padStart(2, '0')}-31` && l.pesoMedioKg && l.pesoMedioKg > 0,
  );
  if (lancsAteMes.length > 0) {
    const sorted = [...lancsAteMes].sort((a, b) => b.data.localeCompare(a.data));
    return sorted[0].pesoMedioKg!;
  }
  const si = saldosIniciais.find(s => s.ano === ano && s.categoria === catCodigo);
  if (si?.pesoMedioKg && si.pesoMedioKg > 0) return si.pesoMedioKg;
  return null;
}

function getPesoMedioInicial(saldosIniciais: SaldoInicial[], ano: number): number | null {
  const itens = saldosIniciais
    .filter(s => s.ano === ano && s.quantidade > 0)
    .map(s => ({ quantidade: s.quantidade, pesoKg: s.pesoMedioKg ?? null }));
  return calcPesoMedioPonderado(itens);
}
