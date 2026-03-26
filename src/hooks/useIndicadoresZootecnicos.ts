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
import { loadPesosPastosPorCategoria, resolverPesoOficial, type OrigemPeso } from '@/hooks/useFechamentoCategoria';
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

/** Fonte do peso médio por categoria */
export type FontePeso = 'fechamento' | 'lancamento' | 'saldo_inicial' | 'nenhuma';

/** Detalhe de estoque por categoria */
export interface EstoqueCategoriaDetalhe {
  categoria: string;
  cabecas: number;
  pesoMedioKg: number | null;
  pesoTotalKg: number;
  fontePeso: FontePeso;
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
  estoqueFinalDetalhe: EstoqueCategoriaDetalhe[];
  estoqueInicialDetalhe: EstoqueCategoriaDetalhe[];
  baseCompleta: boolean;
}

/** Ponto de dados mensal para gráficos históricos */
export interface HistoricoMensal {
  mes: number;
  arrobasProduzidasAcum: number | null;
  uaHaMedia: number | null;
  gmdAcumulado: number | null;
  desfruteCabAcum: number | null;
  desfruteArrobAcum: number | null;
}

/** Série anual para gráficos históricos */
export interface HistoricoAnual {
  ano: number;
  meses: HistoricoMensal[];
}

/** Comparação histórica para cards de variação */
export interface ComparacaoHistorica {
  anoComparativo: number;
  valorAtual: number | null;
  valorComparativo: number | null;
  diferencaAbsoluta: number | null;
  diferencaPercentual: number | null;
}

export interface IndicadoresZootecnicos {
  // --- Estoque ---
  saldoFinalMes: number;
  pesoMedioRebanhoKg: number | null;

  // --- Lotação ---
  uaTotal: number;
  uaHa: number | null;
  uaHaMediaAno: number | null;
  areaProdutiva: number;

  // --- Arrobas saídas (mês) ---
  arrobasSaidasMes: number;
  arrobasHaMes: number | null;

  // --- Arrobas saídas (acumulado ano) ---
  arrobasSaidasAcumuladoAno: number;
  arrobasHaAcumuladoAno: number | null;

  // --- Arrobas produzidas ---
  arrobasProduzidasMes: number | null;
  arrobasProduzidasAcumulado: number | null;

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

  // --- Comparações (dual: mensal + anual para cada indicador) ---
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

  // --- Histórico (gráficos) ---
  historico: HistoricoAnual[];
  comparacoesHistorico: {
    arrobasProduzidas: ComparacaoHistorica[];
    uaHaMedia: ComparacaoHistorica[];
    gmdAcumulado: ComparacaoHistorica[];
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
  categorias?: { id: string; codigo: string; nome: string; ordem_exibicao: number }[],
  globalFazendaIds?: string[],
) {
  const [valorRebanhoData, setValorRebanhoData] = useState<{ total: number; fechado: boolean } | null>(null);
  const [valorRebanhoYoY, setValorRebanhoYoY] = useState<number | null>(null);
  const [valorRebanhoMoM, setValorRebanhoMoM] = useState<number | null>(null);
  const [loadingValor, setLoadingValor] = useState(false);
  // Pesos oficiais do fechamento de pasto (código→peso)
  const [pesoFechamentoMap, setPesoFechamentoMap] = useState<Record<string, number>>({});
  const [pesoFechamentoMesAntMap, setPesoFechamentoMesAntMap] = useState<Record<string, number>>({});
  const [pesoFechamentoYoYMap, setPesoFechamentoYoYMap] = useState<Record<string, number>>({});

  const isGlobal = fazendaId === '__global__';
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  // --- Load pesos do fechamento de pasto (mês atual + mês anterior) ---
  const loadPesosFechamento = useCallback(async () => {
    if (!categorias?.length) {
      setPesoFechamentoMap({});
      setPesoFechamentoMesAntMap({});
      setPesoFechamentoYoYMap({});
      return;
    }

    // Global mode: load from all fazendas and merge (weighted average)
    if (isGlobal) {
      const fids = globalFazendaIds || [];
      if (fids.length === 0) {
        setPesoFechamentoMap({});
        setPesoFechamentoMesAntMap({});
        setPesoFechamentoYoYMap({});
        return;
      }

      let mesAntAno = ano;
      let mesAntMes = mes - 1;
      if (mesAntMes < 1) { mesAntMes = 12; mesAntAno--; }
      const mesAntStr = `${mesAntAno}-${String(mesAntMes).padStart(2, '0')}`;
      const yoyStr = `${ano - 1}-${String(mes).padStart(2, '0')}`;

      try {
        const [atualResults, antResults, yoyResults] = await Promise.all([
          Promise.all(fids.map(fid => loadPesosPastosPorCategoria(fid, anoMes, categorias))),
          Promise.all(fids.map(fid => loadPesosPastosPorCategoria(fid, mesAntStr, categorias))),
          Promise.all(fids.map(fid => loadPesosPastosPorCategoria(fid, yoyStr, categorias))),
        ]);

        setPesoFechamentoMap(mergePesoMaps(atualResults));
        setPesoFechamentoMesAntMap(mergePesoMaps(antResults));
        setPesoFechamentoYoYMap(mergePesoMaps(yoyResults));
      } catch {
        setPesoFechamentoMap({});
        setPesoFechamentoMesAntMap({});
        setPesoFechamentoYoYMap({});
      }
      return;
    }

    if (!fazendaId) {
      setPesoFechamentoMap({});
      setPesoFechamentoMesAntMap({});
      setPesoFechamentoYoYMap({});
      return;
    }

    try {
      // Mês anterior
      let mesAntAno = ano;
      let mesAntMes = mes - 1;
      if (mesAntMes < 1) { mesAntMes = 12; mesAntAno--; }
      const mesAntStr = `${mesAntAno}-${String(mesAntMes).padStart(2, '0')}`;

      // YoY: mesmo mês do ano anterior
      const yoyStr = `${ano - 1}-${String(mes).padStart(2, '0')}`;

      const [mapAtual, mapAnt, mapYoY] = await Promise.all([
        loadPesosPastosPorCategoria(fazendaId, anoMes, categorias),
        loadPesosPastosPorCategoria(fazendaId, mesAntStr, categorias),
        loadPesosPastosPorCategoria(fazendaId, yoyStr, categorias),
      ]);
      setPesoFechamentoMap(mapAtual);
      setPesoFechamentoMesAntMap(mapAnt);
      setPesoFechamentoYoYMap(mapYoY);
    } catch {
      setPesoFechamentoMap({});
      setPesoFechamentoMesAntMap({});
      setPesoFechamentoYoYMap({});
    }
  }, [fazendaId, isGlobal, globalFazendaIds, anoMes, ano, mes, categorias]);

  useEffect(() => { loadPesosFechamento(); }, [loadPesosFechamento]);

  // --- Load valor rebanho (current + YoY) ---
  const loadValorRebanho = useCallback(async () => {
    if (!fazendaId) {
      setValorRebanhoData(null);
      setValorRebanhoYoY(null);
      setValorRebanhoMoM(null);
      return;
    }

    // Global mode: load and sum valor rebanho from all fazendas
    if (isGlobal) {
      const fids = globalFazendaIds || [];
      if (fids.length === 0) {
        setValorRebanhoData(null);
        setValorRebanhoYoY(null);
        setValorRebanhoMoM(null);
        return;
      }
      setLoadingValor(true);
      try {
        const anoMesYoY = `${ano - 1}-${String(mes).padStart(2, '0')}`;
        const [precosRes, fechRes, precosYoYRes, saldosDbRes] = await Promise.all([
          supabase.from('valor_rebanho_mensal').select('fazenda_id, categoria, preco_kg').in('fazenda_id', fids).eq('ano_mes', anoMes),
          supabase.from('valor_rebanho_fechamento').select('fazenda_id, status').in('fazenda_id', fids).eq('ano_mes', anoMes),
          supabase.from('valor_rebanho_mensal').select('fazenda_id, categoria, preco_kg').in('fazenda_id', fids).eq('ano_mes', anoMesYoY),
          supabase.from('saldos_iniciais').select('fazenda_id, ano, categoria, quantidade, peso_medio_kg').in('fazenda_id', fids),
        ]);

        // Build per-fazenda saldos iniciais
        const saldosByFaz = new Map<string, SaldoInicial[]>();
        saldosDbRes.data?.forEach((s: any) => {
          const arr = saldosByFaz.get(s.fazenda_id) || [];
          arr.push({ ano: s.ano, categoria: s.categoria, quantidade: s.quantidade, pesoMedioKg: s.peso_medio_kg ?? undefined });
          saldosByFaz.set(s.fazenda_id, arr);
        });

        // Current month — sum per fazenda
        if (precosRes.data && precosRes.data.length > 0) {
          const precosByFaz = new Map<string, Map<string, number>>();
          precosRes.data.forEach(p => {
            if (!precosByFaz.has(p.fazenda_id)) precosByFaz.set(p.fazenda_id, new Map());
            precosByFaz.get(p.fazenda_id)!.set(p.categoria, Number(p.preco_kg));
          });

          let totalGlobal = 0;
          for (const fid of fids) {
            const precoMap = precosByFaz.get(fid);
            if (!precoMap || precoMap.size === 0) continue;
            const lancsFaz = lancamentos.filter(l => l.fazendaId === fid);
            const saldosFaz = saldosByFaz.get(fid) || [];
            const saldoMap = calcSaldoPorCategoriaLegado(saldosFaz, lancsFaz, ano, mes);
            saldoMap.forEach((qtd, cat) => {
              const preco = precoMap.get(cat) || 0;
              const { valor: pesoKg } = resolverPesoOficial(cat, pesoFechamentoMap, saldosFaz, lancsFaz, ano, mes);
              totalGlobal += qtd * (pesoKg || 0) * preco;
            });
          }

          const allFechado = fechRes.data?.length === fids.length && fechRes.data.every(f => f.status === 'fechado');
          setValorRebanhoData({ total: totalGlobal, fechado: allFechado || false });
        } else {
          setValorRebanhoData(null);
        }

        // YoY
        if (precosYoYRes.data && precosYoYRes.data.length > 0) {
          const precosByFazYoY = new Map<string, Map<string, number>>();
          precosYoYRes.data.forEach(p => {
            if (!precosByFazYoY.has(p.fazenda_id)) precosByFazYoY.set(p.fazenda_id, new Map());
            precosByFazYoY.get(p.fazenda_id)!.set(p.categoria, Number(p.preco_kg));
          });
          let totalYoY = 0;
          for (const fid of fids) {
            const precoMap = precosByFazYoY.get(fid);
            if (!precoMap || precoMap.size === 0) continue;
            const lancsFaz = lancamentos.filter(l => l.fazendaId === fid);
            const saldosFaz = saldosByFaz.get(fid) || [];
            const saldoMap = calcSaldoPorCategoriaLegado(saldosFaz, lancsFaz, ano - 1, mes);
            saldoMap.forEach((qtd, cat) => {
              const preco = precoMap.get(cat) || 0;
              const pesoKg = getPesoMedioCatComPastos(cat, pesoFechamentoYoYMap, saldosFaz, lancsFaz, ano - 1, mes);
              totalYoY += qtd * (pesoKg || 0) * preco;
            });
          }
          setValorRebanhoYoY(totalYoY > 0 ? totalYoY : null);
        } else {
          setValorRebanhoYoY(null);
        }

        // MoM (previous month) - Global
        let mesAntAnoV = ano;
        let mesAntMesV = mes - 1;
        if (mesAntMesV < 1) { mesAntMesV = 12; mesAntAnoV--; }
        const anoMesMoMG = `${mesAntAnoV}-${String(mesAntMesV).padStart(2, '0')}`;
        const precosMoMResG = await supabase.from('valor_rebanho_mensal').select('fazenda_id, categoria, preco_kg').in('fazenda_id', fids).eq('ano_mes', anoMesMoMG);
        if (precosMoMResG.data && precosMoMResG.data.length > 0) {
          const precosByFazMoM = new Map<string, Map<string, number>>();
          precosMoMResG.data.forEach(p => {
            if (!precosByFazMoM.has(p.fazenda_id)) precosByFazMoM.set(p.fazenda_id, new Map());
            precosByFazMoM.get(p.fazenda_id)!.set(p.categoria, Number(p.preco_kg));
          });
          let totalMoM = 0;
          for (const fid of fids) {
            const precoMap = precosByFazMoM.get(fid);
            if (!precoMap || precoMap.size === 0) continue;
            const lancsFaz = lancamentos.filter(l => l.fazendaId === fid);
            const saldosFaz = saldosByFaz.get(fid) || [];
            const saldoMap = calcSaldoPorCategoriaLegado(saldosFaz, lancsFaz, mesAntAnoV, mesAntMesV);
            saldoMap.forEach((qtd, cat) => {
              const preco = precoMap.get(cat) || 0;
              const pesoKg = getPesoMedioCatComPastos(cat, pesoFechamentoMesAntMap, saldosFaz, lancsFaz, mesAntAnoV, mesAntMesV);
              totalMoM += qtd * (pesoKg || 0) * preco;
            });
          }
          setValorRebanhoMoM(totalMoM > 0 ? totalMoM : null);
        } else {
          setValorRebanhoMoM(null);
        }
      } catch {
        setValorRebanhoData(null);
        setValorRebanhoYoY(null);
        setValorRebanhoMoM(null);
      } finally {
        setLoadingValor(false);
      }
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

      // Current month value — usa hierarquia oficial de peso
      if (precosRes.data && precosRes.data.length > 0) {
        const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
        const precoMap = new Map(precosRes.data.map(p => [p.categoria, Number(p.preco_kg)]));
        let total = 0;
        saldoMap.forEach((qtd, cat) => {
          const preco = precoMap.get(cat) || 0;
          const { valor: pesoKg } = resolverPesoOficial(cat, pesoFechamentoMap, saldosIniciais, lancamentos, ano, mes);
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
          const pesoKg = getPesoMedioCatComPastos(cat, pesoFechamentoYoYMap, saldosIniciais, lancamentos, ano - 1, mes);
          totalYoY += qtd * (pesoKg || 0) * preco;
        });
        setValorRebanhoYoY(totalYoY > 0 ? totalYoY : null);
      } else {
        setValorRebanhoYoY(null);
      }

      // MoM value (previous month)
      let mesAntAnoN = ano;
      let mesAntMesN = mes - 1;
      if (mesAntMesN < 1) { mesAntMesN = 12; mesAntAnoN--; }
      const anoMesMoMN = `${mesAntAnoN}-${String(mesAntMesN).padStart(2, '0')}`;
      const precosMoMRes = await supabase
        .from('valor_rebanho_mensal')
        .select('categoria, preco_kg')
        .eq('fazenda_id', fazendaId)
        .eq('ano_mes', anoMesMoMN);
      if (precosMoMRes.data && precosMoMRes.data.length > 0) {
        const saldoMapMoM = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, mesAntAnoN, mesAntMesN);
        const precoMapMoM = new Map(precosMoMRes.data.map(p => [p.categoria, Number(p.preco_kg)]));
        let totalMoM = 0;
        saldoMapMoM.forEach((qtd, cat) => {
          const preco = precoMapMoM.get(cat) || 0;
          const pesoKg = getPesoMedioCatComPastos(cat, pesoFechamentoMesAntMap, saldosIniciais, lancamentos, mesAntAnoN, mesAntMesN);
          totalMoM += qtd * (pesoKg || 0) * preco;
        });
        setValorRebanhoMoM(totalMoM > 0 ? totalMoM : null);
      } else {
        setValorRebanhoMoM(null);
      }
    } catch {
      setValorRebanhoData(null);
      setValorRebanhoYoY(null);
      setValorRebanhoMoM(null);
    } finally {
      setLoadingValor(false);
    }
  }, [fazendaId, isGlobal, globalFazendaIds, anoMes, saldosIniciais, lancamentos, ano, mes, pesoFechamentoMap]);

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

    // Peso médio — usa hierarquia oficial (fechamento > lançamento > saldo_inicial)
    const itensParaPeso: { quantidade: number; pesoKg: number | null }[] = [];
    saldoMap.forEach((qtd, cat) => {
      if (qtd > 0) {
        const { valor } = resolverPesoOficial(cat, pesoFechamentoMap, saldosIniciais, lancamentos, ano, mes);
        itensParaPeso.push({ quantidade: qtd, pesoKg: valor });
      }
    });
    const pesoMedioRebanhoKg = calcPesoMedioPonderado(itensParaPeso);
    const pesoMedioEstimado = itensParaPeso.some(i => i.pesoKg === null);

    // Área / UA
    const areaProdutiva = calcAreaProdutivaPecuaria(pastos);
    const areaProdutivaEstimativa = pastos.filter(p => p.ativo && p.entra_conciliacao).length === 0;
    const uaTotal = calcUA(saldoFinalMes, pesoMedioRebanhoKg);
    const uaHa = calcUAHa(uaTotal, areaProdutiva);

    // UA/ha média do ano (jan até mês selecionado)
    const uaHaMensais: number[] = [];
    for (let m = 1; m <= mes; m++) {
      const sMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, m);
      const sFinal = Array.from(sMap.values()).reduce((s, v) => s + v, 0);
      const itensPeso = Array.from(sMap.entries())
        .filter(([, q]) => q > 0)
        .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCatComPastos(cat, pesoFechamentoMap, saldosIniciais, lancamentos, ano, m) }));
      const pm = calcPesoMedioPonderado(itensPeso);
      const ua = calcUA(sFinal, pm);
      const uah = calcUAHa(ua, areaProdutiva);
      if (uah !== null) uaHaMensais.push(uah);
    }
    const uaHaMediaAno = uaHaMensais.length > 0
      ? uaHaMensais.reduce((a, b) => a + b, 0) / uaHaMensais.length
      : null;

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

    // Peso final: soma por categoria usando hierarquia oficial
    const estoqueFinalDetalhe: EstoqueCategoriaDetalhe[] = [];
    let pesoFinalMes = 0;
    saldoMap.forEach((qtd, cat) => {
      const { valor: pesoMedio, origem } = resolverPesoOficial(cat, pesoFechamentoMap, saldosIniciais, lancamentos, ano, mes);
      const fonte = origemToFonte(origem);
      const pesoTotal = qtd * (pesoMedio || 0);
      pesoFinalMes += pesoTotal;
      if (qtd !== 0) {
        estoqueFinalDetalhe.push({ categoria: cat, cabecas: qtd, pesoMedioKg: pesoMedio, pesoTotalKg: pesoTotal, fontePeso: fonte });
      }
    });

    // Peso inicial: soma por categoria do mês anterior usando hierarquia oficial
    const estoqueInicialDetalhe: EstoqueCategoriaDetalhe[] = [];
    let pesoInicialMes = 0;
    const saldoMapAnterior = mes > 1
      ? calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1)
      : new Map<string, number>();
    const saldoAnterior = mes > 1
      ? Array.from(saldoMapAnterior.values()).reduce((s, v) => s + v, 0)
      : saldoInicialAno;

    if (mes > 1) {
      saldoMapAnterior.forEach((qtd, cat) => {
        const { valor: pesoMedio, origem } = resolverPesoOficial(cat, pesoFechamentoMesAntMap, saldosIniciais, lancamentos, ano, mes - 1);
        const fonte = origemToFonte(origem);
        const pesoTotal = qtd * (pesoMedio || 0);
        pesoInicialMes += pesoTotal;
        if (qtd !== 0) {
          estoqueInicialDetalhe.push({ categoria: cat, cabecas: qtd, pesoMedioKg: pesoMedio, pesoTotalKg: pesoTotal, fontePeso: fonte });
        }
      });
    } else {
      // Janeiro: usar saldos iniciais do ano
      saldosIniciais.filter(s => s.ano === ano).forEach(s => {
        const pesoMedio = s.pesoMedioKg ?? null;
        const pesoTotal = s.quantidade * (pesoMedio || 0);
        pesoInicialMes += pesoTotal;
        if (s.quantidade !== 0) {
          estoqueInicialDetalhe.push({ categoria: s.categoria, cabecas: s.quantidade, pesoMedioKg: pesoMedio, pesoTotalKg: pesoTotal, fontePeso: 'saldo_inicial' });
        }
      });
    }

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
      estoqueFinalDetalhe,
      estoqueInicialDetalhe,
      baseCompleta: pesoFinalMes > 0 && pesoInicialMes > 0 && cabMediaMes > 0,
    };

    // Arrobas produzidas mês (ganho líquido / 30)
    const arrobasProduzidasMes = (pesoFinalMes > 0 && pesoInicialMes > 0 && cabMediaMes > 0)
      ? ganhoLiquido / 30
      : null;

    // GMD acumulado
    const diasAcum = Array.from({ length: mes }, (_, i) => new Date(ano, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
    const pesoInicialAno = saldosIniciais
      .filter(s => s.ano === ano)
      .reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
    const pesoEntradasAcum = lancsAcum.filter(l => TIPOS_ENTRADA.includes(l.tipo))
      .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    const pesoSaidasAcum = lancsAcum.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte')
      .reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
    const cabMediaAcum = (saldoInicialAno + saldoFinalMes) / 2;
    const gmdAcumulado = calcGMD(pesoFinalMes, pesoInicialAno, pesoEntradasAcum, pesoSaidasAcum, diasAcum, cabMediaAcum);

    // Arrobas produzidas acumulado
    const ganhoLiquidoAcum = pesoFinalMes - pesoInicialAno - pesoEntradasAcum + pesoSaidasAcum;
    const arrobasProduzidasAcumulado = (pesoFinalMes > 0 && pesoInicialAno > 0 && cabMediaAcum > 0)
      ? ganhoLiquidoAcum / 30
      : null;

    // Valor patrimonial
    const valorRebanho = valorRebanhoData?.total ?? null;
    const valorPorCabeca = valorRebanho !== null && saldoFinalMes > 0 ? valorRebanho / saldoFinalMes : null;
    const valorPorHa = valorRebanho !== null && areaProdutiva > 0 ? valorRebanho / areaProdutiva : null;
    const valorRebanhoFechado = valorRebanhoData?.fechado ?? false;

    // ===== COMPARAÇÕES (dual: mensal + anual) =====

    // --- MoM: structural indicators (vs mês anterior) ---
    const compSaldoMoM = saldoAnterior > 0 ? buildComparacao(saldoFinalMes, saldoAnterior, 'mensal') : null;

    // Peso médio do mês anterior
    let pesoMedioAnterior: number | null = null;
    if (mes > 1) {
      pesoMedioAnterior = calcPesoMedioPonderado(
        Array.from(saldoMapAnterior.entries())
          .filter(([, q]) => q > 0)
          .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCatComPastos(cat, pesoFechamentoMesAntMap, saldosIniciais, lancamentos, ano, mes - 1) }))
      );
    } else {
      pesoMedioAnterior = calcPesoMedioPonderado(
        saldosIniciais.filter(s => s.ano === ano).map(s => ({ quantidade: s.quantidade, pesoKg: s.pesoMedioKg ?? null }))
      );
    }
    const compPesoMedioMoM = pesoMedioRebanhoKg !== null && pesoMedioAnterior !== null ? buildComparacao(pesoMedioRebanhoKg, pesoMedioAnterior, 'mensal') : null;

    // UA/ha do mês anterior
    const uaTotalAnt = calcUA(saldoAnterior, pesoMedioAnterior);
    const uaHaAnt = calcUAHa(uaTotalAnt, areaProdutiva);
    const compUaHaMoM = uaHa !== null && uaHaAnt !== null ? buildComparacao(uaHa, uaHaAnt, 'mensal') : null;

    // Valor rebanho MoM — calculated from valorRebanhoMoM state
    const compValorMoM = valorRebanho !== null && valorRebanhoMoM !== null ? buildComparacao(valorRebanho, valorRebanhoMoM, 'mensal') : null;

    // R$/cab MoM
    const valorPorCabecaAnt = valorRebanhoMoM !== null && saldoAnterior > 0 ? valorRebanhoMoM / saldoAnterior : null;
    const compValorPorCabecaMoM = valorPorCabeca !== null && valorPorCabecaAnt !== null ? buildComparacao(valorPorCabeca, valorPorCabecaAnt, 'mensal') : null;

    // --- YoY: estruturais/patrimoniais ---
    const anoAnt = ano - 1;
    const saldoMapYoY = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoAnt, mes);
    const saldoYoY = Array.from(saldoMapYoY.values()).reduce((s, v) => s + v, 0);
    const compSaldo = saldoYoY > 0 ? buildComparacao(saldoFinalMes, saldoYoY, 'yoy') : null;

    const pesoYoY = calcPesoMedioPonderado(
      Array.from(saldoMapYoY.entries())
        .filter(([, q]) => q > 0)
        .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCatComPastos(cat, pesoFechamentoYoYMap, saldosIniciais, lancamentos, anoAnt, mes) }))
    );
    const compPesoMedio = pesoMedioRebanhoKg !== null && pesoYoY !== null ? buildComparacao(pesoMedioRebanhoKg, pesoYoY, 'yoy') : null;

    const uaTotalYoY = calcUA(saldoYoY, pesoYoY);
    const uaHaYoY = calcUAHa(uaTotalYoY, areaProdutiva);
    const compUaHa = uaHa !== null && uaHaYoY !== null ? buildComparacao(uaHa, uaHaYoY, 'yoy') : null;

    // UA/ha média do ano anterior (YoY)
    const uaHaMensaisYoY: number[] = [];
    for (let m = 1; m <= mes; m++) {
      const sMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoAnt, m);
      const sFinal = Array.from(sMap.values()).reduce((s, v) => s + v, 0);
      const itensPeso2 = Array.from(sMap.entries())
        .filter(([, q]) => q > 0)
        .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCatComPastos(cat, pesoFechamentoYoYMap, saldosIniciais, lancamentos, anoAnt, m) }));
      const pm2 = calcPesoMedioPonderado(itensPeso2);
      const ua2 = calcUA(sFinal, pm2);
      const uah2 = calcUAHa(ua2, areaProdutiva);
      if (uah2 !== null) uaHaMensaisYoY.push(uah2);
    }
    const uaHaMediaAnoYoY = uaHaMensaisYoY.length > 0
      ? uaHaMensaisYoY.reduce((a, b) => a + b, 0) / uaHaMensaisYoY.length
      : null;
    const compUaHaMedia = uaHaMediaAno !== null && uaHaMediaAnoYoY !== null
      ? buildComparacao(uaHaMediaAno, uaHaMediaAnoYoY, 'acumulado_yoy')
      : null;

    // UA/ha méd. MoM (vs mês anterior: recalc média jan..mes-1)
    let compUaHaMediaMoM: Comparacao | null = null;
    if (mes > 1) {
      const uaHaMensaisAnt = uaHaMensais.slice(0, mes - 1);
      const uaHaMediaAnt = uaHaMensaisAnt.length > 0 ? uaHaMensaisAnt.reduce((a, b) => a + b, 0) / uaHaMensaisAnt.length : null;
      compUaHaMediaMoM = uaHaMediaAno !== null && uaHaMediaAnt !== null ? buildComparacao(uaHaMediaAno, uaHaMediaAnt, 'mensal') : null;
    }

    const compValor = valorRebanho !== null && valorRebanhoYoY !== null ? buildComparacao(valorRebanho, valorRebanhoYoY, 'yoy') : null;

    // R$/cab YoY
    const valorPorCabecaYoY = valorRebanhoYoY !== null && saldoYoY > 0 ? valorRebanhoYoY / saldoYoY : null;
    const compValorPorCabecaYoY = valorPorCabeca !== null && valorPorCabecaYoY !== null ? buildComparacao(valorPorCabeca, valorPorCabecaYoY, 'yoy') : null;

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

    // --- YoY for operational (same month last year) ---
    const anoMesYoYStr = `${anoAnt}-${String(mes).padStart(2, '0')}`;
    const saidasMesYoY = saidasDesfrute(filterByAnoMes(lancamentos, anoMesYoYStr));
    const arrobasMesYoY = saidasMesYoY.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const compArrobasMesYoY = arrobasMesYoY > 0 ? buildComparacao(arrobasSaidasMes, arrobasMesYoY, 'yoy') : null;
    const compArrobasHaMesYoY = arrobasMesYoY > 0 && areaProdutiva > 0 && arrobasHaMes !== null
      ? buildComparacao(arrobasHaMes, arrobasMesYoY / areaProdutiva, 'yoy')
      : null;

    // --- Acumulado YoY ---
    const lancsAcumYoY = filterByAnoAteMes(lancamentos, anoAnt, mes);
    const saidasAcumYoY = saidasDesfrute(lancsAcumYoY);
    const arrobasAcumYoY = saidasAcumYoY.reduce((s, l) => s + calcArrobasSafe(l), 0);
    const compArrobasAcum = arrobasAcumYoY > 0 ? buildComparacao(arrobasSaidasAcumuladoAno, arrobasAcumYoY, 'acumulado_yoy') : null;
    let compArrobasHaAcum: Comparacao | null = null;
    if (arrobasAcumYoY > 0 && areaProdutiva > 0 && arrobasHaAcumuladoAno !== null) {
      compArrobasHaAcum = buildComparacao(arrobasHaAcumuladoAno, arrobasAcumYoY / areaProdutiva, 'acumulado_yoy');
    }

    // @ produzidas acumulado YoY
    const saldoInicialAnoAnt = saldosIniciais.filter(s => s.ano === anoAnt).reduce((sum, s) => sum + s.quantidade, 0);
    const pesoInicialAnoAnt = saldosIniciais.filter(s => s.ano === anoAnt).reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
    const saldoMapYoYFinal = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, anoAnt, mes);
    const saldoFinalYoY = Array.from(saldoMapYoYFinal.values()).reduce((s, v) => s + v, 0);
    let pesoFinalYoY = 0;
    saldoMapYoYFinal.forEach((qtd, cat) => {
      const pk = getPesoMedioCatComPastos(cat, pesoFechamentoYoYMap, saldosIniciais, lancamentos, anoAnt, mes);
      pesoFinalYoY += qtd * (pk || 0);
    });
    const pesoEntradasAcumYoY = lancsAcumYoY.filter(l => TIPOS_ENTRADA.includes(l.tipo)).reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
    const pesoSaidasAcumYoY = lancsAcumYoY.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte').reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
    const ganhoLiqAcumYoY = pesoFinalYoY - pesoInicialAnoAnt - pesoEntradasAcumYoY + pesoSaidasAcumYoY;
    const cabMediaAcumYoY = (saldoInicialAnoAnt + saldoFinalYoY) / 2;
    const arrobasProduzidasAcumYoY = (pesoFinalYoY > 0 && pesoInicialAnoAnt > 0 && cabMediaAcumYoY > 0) ? ganhoLiqAcumYoY / 30 : null;
    const compArrobasProdAcum = arrobasProduzidasAcumulado !== null && arrobasProduzidasAcumYoY !== null
      ? buildComparacao(arrobasProduzidasAcumulado, arrobasProduzidasAcumYoY, 'acumulado_yoy')
      : null;

    // GMD mês YoY (mesmo mês do ano anterior — só se base confiável)
    const gmdMesYoY = computeGmdForPeriod(saldosIniciais, lancamentos, anoAnt, mes, pesoFechamentoYoYMap);
    const compGmdMes = gmdMes !== null && gmdMesYoY !== null ? buildComparacao(gmdMes, gmdMesYoY, 'yoy') : null;

    // GMD mês MoM (vs mês anterior)
    let compGmdMesMoM: Comparacao | null = null;
    if (mes > 1) {
      const gmdMesAnt = computeGmdForPeriod(saldosIniciais, lancamentos, ano, mes - 1, pesoFechamentoMesAntMap);
      compGmdMesMoM = gmdMes !== null && gmdMesAnt !== null ? buildComparacao(gmdMes, gmdMesAnt, 'mensal') : null;
    }

    // GMD acumulado YoY
    const diasAcumYoY = Array.from({ length: mes }, (_, i) => new Date(anoAnt, i + 1, 0).getDate()).reduce((a, b) => a + b, 0);
    const gmdAcumuladoYoY = calcGMD(pesoFinalYoY, pesoInicialAnoAnt, pesoEntradasAcumYoY, pesoSaidasAcumYoY, diasAcumYoY, cabMediaAcumYoY);
    const compGmdAcum = gmdAcumulado !== null && gmdAcumuladoYoY !== null ? buildComparacao(gmdAcumulado, gmdAcumuladoYoY, 'acumulado_yoy') : null;

    // Desfrute acumulado YoY
    const totalCabSaidasAcumYoY = saidasAcumYoY.reduce((s, l) => s + l.quantidade, 0);
    const desfruteCabAcumYoY = calcDesfrute(totalCabSaidasAcumYoY, saldoInicialAnoAnt);
    const compDesfruteCab = desfruteCabecasAcumulado !== null && desfruteCabAcumYoY !== null
      ? buildComparacao(desfruteCabecasAcumulado, desfruteCabAcumYoY, 'acumulado_yoy')
      : null;

    const arrobasIniYoY = calcArrobasIniciais(saldosIniciais, anoAnt);
    const desfruteArrobAcumYoY = calcDesfruteArrobas(arrobasAcumYoY, arrobasIniYoY);
    const compDesfruteArrob = desfruteArrobasAcumulado !== null && desfruteArrobAcumYoY !== null
      ? buildComparacao(desfruteArrobasAcumulado, desfruteArrobAcumYoY, 'acumulado_yoy')
      : null;

    // @ desfrutadas acum YoY
    const compArrobasDesfrutadas = arrobasAcumYoY > 0
      ? buildComparacao(arrobasSaidasAcumuladoAno, arrobasAcumYoY, 'acumulado_yoy')
      : null;

    // ===== HISTÓRICO (até 3 anos) =====
    const anosHistorico = [ano, ano - 1, ano - 2];
    const historico: HistoricoAnual[] = anosHistorico.map(a => {
      const meses: HistoricoMensal[] = [];
      const siAno = saldosIniciais.filter(s => s.ano === a);
      const saldoIniAno = siAno.reduce((sum, s) => sum + s.quantidade, 0);
      const pesoIniAno = siAno.reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
      const arrobasIniAno = calcArrobasIniciais(saldosIniciais, a);
      const uaHaAcumList: number[] = [];

      for (let m = 1; m <= mes; m++) {
        const sMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, a, m);
        const sFinal = Array.from(sMap.values()).reduce((s2, v) => s2 + v, 0);

        // UA/ha para este mês
        const iPeso = Array.from(sMap.entries())
          .filter(([, q]) => q > 0)
          .map(([cat, q]) => ({ quantidade: q, pesoKg: getPesoMedioCatComPastos(cat, a === ano ? pesoFechamentoMap : pesoFechamentoYoYMap, saldosIniciais, lancamentos, a, m) }));
        const pmH = calcPesoMedioPonderado(iPeso);
        const uaH = calcUA(sFinal, pmH);
        const uahH = calcUAHa(uaH, areaProdutiva);
        if (uahH !== null) uaHaAcumList.push(uahH);
        const uaHaMediaAteMes = uaHaAcumList.length > 0 ? uaHaAcumList.reduce((x, y) => x + y, 0) / uaHaAcumList.length : null;

        // Arrobas produzidas acumuladas até m
        const lancsAteMes = filterByAnoAteMes(lancamentos, a, m);
        let pesoFinalH = 0;
        sMap.forEach((qtd, cat) => {
          const pk = getPesoMedioCatComPastos(cat, a === ano ? pesoFechamentoMap : pesoFechamentoYoYMap, saldosIniciais, lancamentos, a, m);
          pesoFinalH += qtd * (pk || 0);
        });
        const pesoEntH = lancsAteMes.filter(l => TIPOS_ENTRADA.includes(l.tipo)).reduce((s2, l) => s2 + l.quantidade * (l.pesoMedioKg || 0), 0);
        const pesoSaiH = lancsAteMes.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte').reduce((s2, l) => s2 + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
        const glH = pesoFinalH - pesoIniAno - pesoEntH + pesoSaiH;
        const cabMediaH = (saldoIniAno + sFinal) / 2;
        const arrobasProduzidasAteMes = (pesoFinalH > 0 && pesoIniAno > 0 && cabMediaH > 0) ? glH / 30 : null;

        // GMD acumulado até m
        const diasAteMes = Array.from({ length: m }, (_, i) => new Date(a, i + 1, 0).getDate()).reduce((x, y) => x + y, 0);
        const gmdAteMes = calcGMD(pesoFinalH, pesoIniAno, pesoEntH, pesoSaiH, diasAteMes, cabMediaH);

        // Desfrute acumulado até m
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

    // Comparações históricas para cards de variação
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
  }, [lancamentos, saldosIniciais, pastos, ano, mes, anoMes, valorRebanhoData, valorRebanhoYoY, valorRebanhoMoM, loadingValor, pesoFechamentoMap, pesoFechamentoMesAntMap, pesoFechamentoYoYMap]);

  return indicadores;
}

// ---------------------------------------------------------------------------
// Helpers de peso (internos)
// ---------------------------------------------------------------------------

/** Merge multiple per-fazenda peso maps into a single global map (simple merge, first wins per category) */
function mergePesoMaps(maps: Record<string, number>[]): Record<string, number> {
  // For global: weighted merge — since each map is already weighted-average per fazenda,
  // we simply merge all entries. If same category appears in multiple fazendas,
  // we keep the average across them (good enough for global view).
  const acum: Record<string, { totalPeso: number; count: number }> = {};
  for (const map of maps) {
    for (const [cat, peso] of Object.entries(map)) {
      if (!acum[cat]) acum[cat] = { totalPeso: 0, count: 0 };
      acum[cat].totalPeso += peso;
      acum[cat].count += 1;
    }
  }
  const result: Record<string, number> = {};
  for (const [cat, { totalPeso, count }] of Object.entries(acum)) {
    result[cat] = totalPeso / count;
  }
  return result;
}

/** Mapeia OrigemPeso (do hook unificado) para FontePeso (do indicadores) */
function origemToFonte(origem: OrigemPeso): FontePeso {
  switch (origem) {
    case 'pastos': return 'fechamento';
    case 'lancamento': return 'lancamento';
    case 'saldo_inicial': return 'saldo_inicial';
    case 'sem_base': return 'nenhuma';
  }
}

function getPesoMedioCatComPastos(
  catCodigo: string,
  pesosPastos: Record<string, number>,
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes: number,
): number | null {
  const { valor } = resolverPesoOficial(catCodigo, pesosPastos, saldosIniciais, lancamentos, ano, mes);
  return valor;
}

function getPesoMedioInicial(saldosIniciais: SaldoInicial[], ano: number): number | null {
  const itens = saldosIniciais
    .filter(s => s.ano === ano && s.quantidade > 0)
    .map(s => ({ quantidade: s.quantidade, pesoKg: s.pesoMedioKg ?? null }));
  return calcPesoMedioPonderado(itens);
}

/** Calcula GMD de um único mês para um ano específico (usado em YoY) */
function computeGmdForPeriod(
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes: number,
  pesosPastosMap: Record<string, number>,
): number | null {
  const saldoMap = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes);
  const saldoFinal = Array.from(saldoMap.values()).reduce((s, v) => s + v, 0);
  let pesoFinal = 0;
  saldoMap.forEach((qtd, cat) => {
    const pk = getPesoMedioCatComPastos(cat, pesosPastosMap, saldosIniciais, lancamentos, ano, mes);
    pesoFinal += qtd * (pk || 0);
  });

  let pesoInicial = 0;
  if (mes > 1) {
    const saldoMapAnt = calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1);
    saldoMapAnt.forEach((qtd, cat) => {
      const pk = getPesoMedioCatComPastos(cat, pesosPastosMap, saldosIniciais, lancamentos, ano, mes - 1);
      pesoInicial += qtd * (pk || 0);
    });
  } else {
    pesoInicial = saldosIniciais.filter(s => s.ano === ano).reduce((s, si) => s + si.quantidade * (si.pesoMedioKg || 0), 0);
  }

  if (pesoFinal <= 0 || pesoInicial <= 0) return null;

  const saldoIniAno = saldosIniciais.filter(s => s.ano === ano).reduce((sum, s) => sum + s.quantidade, 0);
  const saldoAnterior = mes > 1
    ? Array.from(calcSaldoPorCategoriaLegado(saldosIniciais, lancamentos, ano, mes - 1).values()).reduce((s, v) => s + v, 0)
    : saldoIniAno;

  const anoMesStr = `${ano}-${String(mes).padStart(2, '0')}`;
  const lancsMes = filterByAnoMes(lancamentos, anoMesStr);
  const entr = lancsMes.filter(l => TIPOS_ENTRADA.includes(l.tipo));
  const said = lancsMes.filter(l => TIPOS_SAIDA_DESFRUTE.includes(l.tipo) || l.tipo === 'morte');
  const pesoEnt = entr.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || 0), 0);
  const pesoSai = said.reduce((s, l) => s + l.quantidade * (l.pesoMedioKg || l.pesoCarcacaKg || 0), 0);
  const cabMedia = (saldoAnterior + saldoFinal) / 2;
  const dias = new Date(ano, mes, 0).getDate();

  return calcGMD(pesoFinal, pesoInicial, pesoEnt, pesoSai, dias, cabMedia);
}
