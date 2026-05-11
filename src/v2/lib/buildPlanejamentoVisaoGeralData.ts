/**
 * buildPlanejamentoVisaoGeralData.ts
 *
 * Camada oficial pura do cockpit anual da Visão Geral Planejamento.
 *
 * Função pura, testável, sem hooks, sem queries. Recebe entradas crus
 * (painel PC-100 + grid planejamento_financeiro + saldoInicial) e devolve
 * PlanejamentoVisaoGeralDTO completo para a tela renderizar.
 *
 * REGRA SOBERANA: nada de cálculo no JSX. Tela apenas renderiza DTO.
 * Quando comparativo ano-1 não está disponível na fase atual, o campo
 * fica null e é registrado em DTO.warnings (sem fallback inventado).
 */

import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';

import type {
  PlanejamentoVisaoGeralDTO,
  Bloco1Macro,
  Bloco2Producao,
  Bloco3Custos,
  Bloco4Financeiro,
  Bloco5Rebanho,
  ComparativoDuplo,
  CentroCustoBloco,
  GrupoCustoBloco,
  SubcentroLinha,
  OrigemMetric,
  TipoSemantica,
  FormatoExibicao,
} from './planejamentoVisaoGeralTypes';

import {
  MACRO_RECEITAS,
  MACRO_ENTRADA_FINANCEIRA,
  GRUPO_RECEITA_PECUARIA,
  GRUPO_CUSTO_VARIAVEL_PEC,
  GRUPO_CUSTO_FIXO_PEC,
  ORDEM_CENTROS_CUSTO_VAR_PEC,
  ORDEM_CENTROS_CUSTO_FIXO_PEC,
  emptyComparativo,
} from './planejamentoVisaoGeralTypes';

// SubcentroGrid: shape vem do usePlanejamentoFinanceiro.buildGrid().
// Replicado aqui localmente para não acoplar arquivo de tipos a hook.
interface SubcentroGrid {
  macro_custo: string;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string;
  escopo_negocio: string;
  ordem_exibicao: number;
  meses: number[]; // 12 elementos
}

// ─── INPUT ────────────────────────────────────────────────────────────────────

export interface BuildPlanejamentoVisaoGeralInput {
  ano: number;
  mesAtual: number;           // 1..12
  escopo: 'global' | 'fazenda';
  fazendaId?: string;
  fazendaNome?: string;

  /**
   * PC-100 anual META com comparativos.
   * Chamar como: usePainelConsultorData({ ano, mes: 12, viewMode: 'periodo',
   *   carregarMeta: true, incluirComparativos: true })
   *
   * Importante: em viewMode='periodo' as séries serieMeta e serieAnoAnt vêm
   * com 13 elementos cumulativos: [NaN, jan_acum, fev_acum, ..., dez_acum].
   * Por isso lemos serie[12] para anual e serie[mesAtual] para Jan→mesAtual,
   * em vez de somar a série inteira.
   */
  painel: PainelConsultorDataResult | null;

  /**
   * Grid do planejamento_financeiro do ano corrente (META).
   * Chamar como: usePlanejamentoFinanceiro(ano, fazendaId).buildGrid()
   * Diferente do PC-100: meses[12] vem NÃO-cumulativo nativo.
   */
  grid: SubcentroGrid[];

  /** Saldo inicial bancário do ano META (snapshot Dez ano-1). */
  saldoInicial: number;
}

// ─── HELPERS NUMÉRICOS ────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? v : 0;
}

function sumAnual(serie?: number[]): number {
  if (!serie) return 0;
  return serie.reduce((acc, v) => acc + safeNum(v), 0);
}

function sumAcumMes(serie: number[] | undefined, mesAtual: number): number {
  if (!serie) return 0;
  const lim = Math.min(Math.max(mesAtual, 0), 12);
  return serie.slice(0, lim).reduce((acc, v) => acc + safeNum(v), 0);
}

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0 || !Number.isFinite(prev)) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/**
 * Lê valor pontual de uma série cumulativa do PC-100 (modo viewMode='periodo').
 *
 * O PC-100 retorna serieMeta/serieAnoAnt com 13 elementos em modo período:
 *   [NaN, jan_acum, fev_acum, ..., dez_acum]
 *
 * - Para valor anual:        serie[12]
 * - Para Jan→mesAtual:       serie[mesAtual]
 * - Para um mês específico:  serie[mes_1indexed]
 *
 * Retorna null se índice fora dos limites, série ausente ou valor inválido.
 */
function valorPonto(serie: number[] | undefined, idx: number): number | null {
  if (!serie || serie.length === 0) return null;
  const i = Math.min(Math.max(idx, 0), serie.length - 1);
  const v = serie[i];
  return v != null && Number.isFinite(v) ? v : null;
}

/**
 * Média simples de uma série mensal NÃO-cumulativa (Jan..Dez).
 * Para indicadores que vêm direto do painel sem passar pelo cumSum do PC-100,
 * tipicamente arrays de 12 elementos (não 13).
 *
 * Filtra NaN/null/undefined antes de computar.
 */
function mediaSerieMensal(serie: (number | null)[] | number[] | undefined, ate?: number): number | null {
  if (!serie) return null;
  const lim = ate ?? serie.length;
  const vals: number[] = [];
  for (let i = 0; i < Math.min(lim, serie.length); i++) {
    const v = serie[i];
    if (v != null && Number.isFinite(v as number)) vals.push(v as number);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

// ─── FÁBRICAS DE COMPARATIVO ──────────────────────────────────────────────────

/**
 * Comparativo para indicadores do PC-100 (qualquer tipo: acumulado, taxa, média).
 *
 * Funciona porque em viewMode='periodo' o PC-100 retorna serieMeta/serieAnoAnt
 * com pontos já calculados conforme a semântica do indicador:
 *   - Fluxos (receita, custo, arrobas): cumSum mês a mês
 *   - Taxas (custo R$/@, preço): ratio (Σ num) / (Σ den) acumulado
 *   - Médias (desfrute, lotação): valor por ponto representativo
 *
 * Lê ponto específico da série em vez de somar (essa era a causa raiz do
 * "Custeio Pec inflado" antes do fix).
 */
function buildComparativoPonto(
  serieMeta: number[] | undefined,
  serieAnoAnt: number[] | undefined,
  mesAtual: number,
  origem: OrigemMetric,
  tipoSemantica: TipoSemantica,
  formato: FormatoExibicao,
): ComparativoDuplo {
  const metaAnual = valorPonto(serieMeta, 12);
  const metaAcum = valorPonto(serieMeta, mesAtual);
  const anoAntAnual = valorPonto(serieAnoAnt, 12);
  const anoAntAcum = valorPonto(serieAnoAnt, mesAtual);

  return {
    valor: metaAnual,
    origem,
    tipoSemantica,
    formato,
    vsAnoFechado: { valor: anoAntAnual, delta: pctDelta(metaAnual, anoAntAnual) },
    vsMesmoPeriodo: { valor: anoAntAcum, delta: pctDelta(metaAcum, anoAntAcum) },
  };
}

/**
 * Comparativo para indicador de ESTOQUE (posição em momento específico).
 * Ex: cabeças inicial (Jan = idx 1), cabeças final (Dez = idx 12),
 *     peso médio final (Dez = idx 12).
 *
 * mesAlvo: 1 (início = Jan) ou 12 (final = Dez)
 */
function buildComparativoEstoquePonto(
  serieMeta: number[] | undefined,
  serieAnoAnt: number[] | undefined,
  mesAlvo: 1 | 12,
  mesAtual: number,
  origem: OrigemMetric,
  formato: FormatoExibicao,
): ComparativoDuplo {
  const metaAlvo = valorPonto(serieMeta, mesAlvo);
  const anoAntAlvo = valorPonto(serieAnoAnt, mesAlvo);
  const metaAtual = valorPonto(serieMeta, mesAtual);
  const anoAntAtual = valorPonto(serieAnoAnt, mesAtual);

  return {
    valor: metaAlvo,
    origem,
    tipoSemantica: 'estoque',
    formato,
    vsAnoFechado: { valor: anoAntAlvo, delta: pctDelta(metaAlvo, anoAntAlvo) },
    vsMesmoPeriodo: { valor: anoAntAtual, delta: pctDelta(metaAtual, anoAntAtual) },
  };
}

// ─── HELPERS DE GRID ──────────────────────────────────────────────────────────

/**
 * Soma série mensal de subcentros que passam pelo filtro.
 * Retorna array[12] (Jan..Dez META).
 */
function somarSerieGrid(grid: SubcentroGrid[], filtro: (r: SubcentroGrid) => boolean): number[] {
  const result = new Array(12).fill(0);
  for (const r of grid) {
    if (!filtro(r)) continue;
    for (let i = 0; i < 12; i++) result[i] += safeNum(r.meses[i]);
  }
  return result;
}

/**
 * Agrupa subcentros do grid por centro_custo, respeitando ordem oficial dos centros.
 *
 * BLOCO 3 do Marco 1.1.B: valorAnoAnt = null em todos os subcentros e nos totais
 * de centro. Comparativo ano-1 é responsabilidade do Marco 1.1.C/D
 * (precisa de 2ª chamada usePlanejamentoFinanceiro(ano-1) ou query a
 * financeiro_lancamentos_v2 cenário='realizado' agregada por subcentro).
 */
function agruparPorCentro(
  grid: SubcentroGrid[],
  grupoCusto: string,
  ordemOficialCentros: readonly string[],
  mesAtual: number,
): { centros: CentroCustoBloco[]; total: ComparativoDuplo } {
  const linhasGrupo = grid.filter(r => r.grupo_custo === grupoCusto);

  // Agrupa subcentros por centro
  const porCentro = new Map<string, SubcentroLinha[]>();
  for (const r of linhasGrupo) {
    const arr = porCentro.get(r.centro_custo) ?? [];
    const valorMeta = sumAnual(r.meses);
    arr.push({
      subcentro: r.subcentro,
      valorMeta,
      valorAnoAnt: null, // Marco 1.1.B: ano-1 do grid não disponível ainda
    });
    porCentro.set(r.centro_custo, arr);
  }

  // Ordena subcentros dentro de cada centro pela ordem_exibicao do plano
  for (const [centro, subs] of porCentro.entries()) {
    const ordensMap = new Map(linhasGrupo
      .filter(r => r.centro_custo === centro)
      .map(r => [r.subcentro, r.ordem_exibicao]));
    subs.sort((a, b) => (ordensMap.get(a.subcentro) ?? 9999) - (ordensMap.get(b.subcentro) ?? 9999));
  }

  // Monta CentroCustoBloco respeitando ORDEM_CENTROS_*
  const centros: CentroCustoBloco[] = [];
  for (let i = 0; i < ordemOficialCentros.length; i++) {
    const centro = ordemOficialCentros[i];
    const subs = porCentro.get(centro);
    if (!subs || subs.length === 0) continue;

    const totalCentro = subs.reduce((acc, s) => acc + s.valorMeta, 0);

    centros.push({
      centro,
      ordemOficial: i,
      total: {
        valor: totalCentro || null,
        origem: 'planejamento_financeiro',
        tipoSemantica: 'acumulado',
        formato: 'moeda',
        vsAnoFechado: { valor: null, delta: null },   // Marco 1.1.C/D
        vsMesmoPeriodo: { valor: null, delta: null },
      },
      subcentros: subs,
    });
  }

  // Total do grupo
  const totalGrupo = centros.reduce((acc, c) => acc + safeNum(c.total.valor), 0);

  return {
    centros,
    total: {
      valor: totalGrupo || null,
      origem: 'planejamento_financeiro',
      tipoSemantica: 'acumulado',
      formato: 'moeda',
      vsAnoFechado: { valor: null, delta: null },
      vsMesmoPeriodo: { valor: null, delta: null },
    },
  };
}

// ─── BLOCKS ───────────────────────────────────────────────────────────────────

function buildBloco1Macro(
  input: BuildPlanejamentoVisaoGeralInput,
  warnings: string[],
): Bloco1Macro {
  const { painel, grid, saldoInicial, mesAtual } = input;

  // Receitas Pecuária — origem PC-100 receitaPecIndicador
  const receitasPecuaria = painel?.receitaPecIndicador
    ? buildComparativoPonto(
        painel.receitaPecIndicador.serieMeta,
        painel.receitaPecIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Outras Receitas — do grid: macro='Receita Operacional' AND grupo != 'Receita Pecuária'
  const serieOutrasReceitas = somarSerieGrid(grid, r =>
    r.macro_custo === MACRO_RECEITAS && r.grupo_custo !== GRUPO_RECEITA_PECUARIA
  );
  warnings.push('outrasReceitas: vsAnoFechado e vsMesmoPeriodo = null (grid ano-1 não carregado no Marco 1.1.B)');
  const outrasReceitas: ComparativoDuplo = {
    valor: sumAnual(serieOutrasReceitas) || null,
    origem: 'planejamento_financeiro',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  // Entradas Financeiras — do grid: macro='Entrada Financeira'
  const serieEntradasFin = somarSerieGrid(grid, r =>
    r.macro_custo === MACRO_ENTRADA_FINANCEIRA
  );
  warnings.push('entradasFinanceiras: vsAnoFechado e vsMesmoPeriodo = null (grid ano-1 não carregado no Marco 1.1.B)');
  const entradasFinanceiras: ComparativoDuplo = {
    valor: sumAnual(serieEntradasFin) || null,
    origem: 'planejamento_financeiro',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  // Total Entradas = Receita Operacional + Entrada Financeira
  const totalEntradas: ComparativoDuplo = {
    valor: (safeNum(receitasPecuaria.valor) + safeNum(outrasReceitas.valor) + safeNum(entradasFinanceiras.valor)) || null,
    origem: 'misto',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  // Custeio Pecuária — PC-100 custeioPecIndicador (já agrega Custo Var + Fixo Pec, SEM juros)
  const custeioPecuaria = painel?.custeioPecIndicador
    ? buildComparativoPonto(
        painel.custeioPecIndicador.serieMeta,
        painel.custeioPecIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Custeio Agricultura — PC-100 custeioAgriIndicador
  const custeioAgricultura = painel?.custeioAgriIndicador
    ? buildComparativoPonto(
        painel.custeioAgriIndicador.serieMeta,
        painel.custeioAgriIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Investimentos Pecuária — PC-100 investPecIndicador
  const investimentosPecuaria = painel?.investPecIndicador
    ? buildComparativoPonto(
        painel.investPecIndicador.serieMeta,
        painel.investPecIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Investimentos Agricultura — PC-100 investAgriIndicador
  const investimentosAgricultura = painel?.investAgriIndicador
    ? buildComparativoPonto(
        painel.investAgriIndicador.serieMeta,
        painel.investAgriIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Reposição Bovinos — PC-100 investBovinosIndicador
  const reposicaoBovinos = painel?.investBovinosIndicador
    ? buildComparativoPonto(
        painel.investBovinosIndicador.serieMeta,
        painel.investBovinosIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Amortizações — PC-100 amortizacoesIndicador
  const amortizacoes = painel?.amortizacoesIndicador
    ? buildComparativoPonto(
        painel.amortizacoesIndicador.serieMeta,
        painel.amortizacoesIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Dividendos — PC-100 dividendosIndicador
  const dividendos = painel?.dividendosIndicador
    ? buildComparativoPonto(
        painel.dividendosIndicador.serieMeta,
        painel.dividendosIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Total Saídas — PC-100 saidasTotaisIndicador
  const totalSaidas = painel?.saidasTotaisIndicador
    ? buildComparativoPonto(
        painel.saidasTotaisIndicador.serieMeta,
        painel.saidasTotaisIndicador.serieAnoAnt,
        mesAtual, 'pc100', 'acumulado', 'moeda',
      )
    : emptyComparativo('pc100', 'acumulado', 'moeda');

  // Geração Operacional = Receita Operacional (Pec + Outras) − Custeio Produção (Pec + Agri, SEM juros, SEM investimentos)
  const geracaoOperacionalMeta = (safeNum(receitasPecuaria.valor) + safeNum(outrasReceitas.valor))
    - (safeNum(custeioPecuaria.valor) + safeNum(custeioAgricultura.valor));
  const geracaoOperacionalAnoAnt = (safeNum(receitasPecuaria.vsAnoFechado.valor) + 0 /* outrasReceitas ano-1 indisponível */)
    - (safeNum(custeioPecuaria.vsAnoFechado.valor) + safeNum(custeioAgricultura.vsAnoFechado.valor));
  warnings.push('geracaoOperacional: vsAnoFechado parcial (outrasReceitas ano-1 = 0). Resolver em Marco 1.1.C/D.');

  const geracaoOperacional: ComparativoDuplo = {
    valor: geracaoOperacionalMeta,
    origem: 'derivado',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: {
      valor: geracaoOperacionalAnoAnt,
      delta: pctDelta(geracaoOperacionalMeta, geracaoOperacionalAnoAnt),
    },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  // Geração Caixa = Total Entradas − Total Saídas
  const geracaoCaixaMeta = safeNum(totalEntradas.valor) - safeNum(totalSaidas.valor);
  const geracaoCaixaAnoAnt = 0 - safeNum(totalSaidas.vsAnoFechado.valor); // totalEntradas ano-1 indisponível
  warnings.push('geracaoCaixa: vsAnoFechado parcial (totalEntradas ano-1 = 0). Resolver em Marco 1.1.C/D.');

  const geracaoCaixa: ComparativoDuplo = {
    valor: geracaoCaixaMeta,
    origem: 'derivado',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: {
      valor: geracaoCaixaAnoAnt,
      delta: pctDelta(geracaoCaixaMeta, geracaoCaixaAnoAnt),
    },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  // Caixa Final = saldoInicial + Geração Caixa
  const caixaFinalMeta = saldoInicial + geracaoCaixaMeta;
  const caixaFinal: ComparativoDuplo = {
    valor: caixaFinalMeta,
    origem: 'misto',
    tipoSemantica: 'estoque',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },     // Marco 1.1.C/D
    vsMesmoPeriodo: { valor: null, delta: null },
  };
  warnings.push('caixaFinal: comparativos ano-1 indisponíveis no Marco 1.1.B (precisa saldoInicial ano-1).');

  return {
    receitasPecuaria, outrasReceitas, entradasFinanceiras, totalEntradas,
    custeioPecuaria, custeioAgricultura, investimentosPecuaria, investimentosAgricultura,
    reposicaoBovinos, amortizacoes, dividendos, totalSaidas,
    geracaoOperacional, geracaoCaixa,
    saldoInicial,
    caixaFinal,
  };
}

function buildBloco2Producao(
  input: BuildPlanejamentoVisaoGeralInput,
  warnings: string[],
): Bloco2Producao {
  const { painel, mesAtual } = input;
  if (!painel) {
    // Devolve estrutura vazia se painel não carregou ainda
    const empty = (formato: FormatoExibicao, sem: TipoSemantica): ComparativoDuplo =>
      emptyComparativo('pc100', sem, formato);
    return {
      cabecasInicial: empty('cabecas', 'estoque'),
      cabecasFinal: empty('cabecas', 'estoque'),
      pesoMedioFinal: empty('kg', 'estoque'),
      arrobasProduzidas: empty('arrobas', 'acumulado'),
      arrobasDesfrutadas: empty('arrobas', 'acumulado'),
      desfrutePct: empty('percentual', 'taxa'),
      lotacaoMedia: empty('ua_ha', 'media'),
      areaProdutivaMedia: empty('hectares', 'media'),
      custoArr: empty('moeda', 'taxa'),
      precoArr: empty('moeda', 'taxa'),
      margemArr: empty('moeda', 'taxa'),
      receitaCab: empty('moeda', 'taxa'),
      custoCab: empty('moeda', 'taxa'),
    };
  }

  // Estoque (cabecas e peso): serieMetaIndicador (cabecas) e serieMeta (pesoMedio)
  const cabSerieMeta = painel.cabecasIndicador?.serieMetaIndicador;
  const cabSerieAnoAnt = painel.cabecasIndicador?.serieAnoAnt;
  const pesoSerieMeta = painel.pesoMedioIndicador?.serieMeta;
  const pesoSerieAnoAnt = painel.pesoMedioIndicador?.serieAnoAnt;

  warnings.push('arrobasDesfrutadas: derivação receitaPec/precoArr requer divisão ponto-a-ponto de séries cumulativas — Marco 1.1.D');
  warnings.push('receitaCab: derivação receitaPec/cabecas requer divisão ponto-a-ponto — Marco 1.1.D');

  return {
    cabecasInicial: buildComparativoEstoquePonto(cabSerieMeta, cabSerieAnoAnt, 1, mesAtual, 'pc100', 'cabecas'),
    cabecasFinal: buildComparativoEstoquePonto(cabSerieMeta, cabSerieAnoAnt, 12, mesAtual, 'pc100', 'cabecas'),
    pesoMedioFinal: buildComparativoEstoquePonto(pesoSerieMeta, pesoSerieAnoAnt, 12, mesAtual, 'pc100', 'kg'),

    arrobasProduzidas: buildComparativoPonto(
      painel.arrobasIndicador?.serieMeta,
      painel.arrobasIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'acumulado', 'arrobas',
    ),

    // Derivação 2 séries cumulativas — Marco 1.1.D
    arrobasDesfrutadas: emptyComparativo('derivado', 'acumulado', 'arrobas'),

    desfrutePct: buildComparativoPonto(
      painel.desfruteIndicador?.serieMeta,
      painel.desfruteIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'taxa', 'percentual',
    ),

    lotacaoMedia: buildComparativoPonto(
      painel.uaHaIndicador?.serieMeta,
      painel.uaHaIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'media', 'ua_ha',
    ),

    // areaPecuariaMetaPorMes/areaPecuariaRealPorMes vêm mensais não-cumulativos direto do painel.
    // Não passam pelo cumSum do PC-100 — usar média simples local.
    areaProdutivaMedia: (() => {
      const metaAnual = mediaSerieMensal(painel.areaPecuariaMetaPorMes);
      const metaAcum = mediaSerieMensal(painel.areaPecuariaMetaPorMes, mesAtual);
      const anoAntAnual = mediaSerieMensal(painel.areaPecuariaRealPorMes);
      const anoAntAcum = mediaSerieMensal(painel.areaPecuariaRealPorMes, mesAtual);
      return {
        valor: metaAnual,
        origem: 'pc100',
        tipoSemantica: 'media',
        formato: 'hectares',
        vsAnoFechado: { valor: anoAntAnual, delta: pctDelta(metaAnual, anoAntAnual) },
        vsMesmoPeriodo: { valor: anoAntAcum, delta: pctDelta(metaAcum, anoAntAcum) },
      } as ComparativoDuplo;
    })(),

    custoArr: buildComparativoPonto(
      painel.custoArrIndicador?.serieMeta,
      painel.custoArrIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'taxa', 'moeda',
    ),

    precoArr: buildComparativoPonto(
      painel.precoArrIndicador?.serieMeta,
      painel.precoArrIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'taxa', 'moeda',
    ),

    margemArr: buildComparativoPonto(
      painel.margemArrIndicador?.serieMeta,
      painel.margemArrIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'taxa', 'moeda',
    ),

    // Derivação 2 séries cumulativas — Marco 1.1.D
    receitaCab: emptyComparativo('derivado', 'taxa', 'moeda'),

    custoCab: buildComparativoPonto(
      painel.custoCabIndicador?.serieMeta,
      painel.custoCabIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'taxa', 'moeda',
    ),
  };
}

function buildBloco3Custos(
  input: BuildPlanejamentoVisaoGeralInput,
  warnings: string[],
): Bloco3Custos {
  const { grid, mesAtual } = input;

  const cvp = agruparPorCentro(grid, GRUPO_CUSTO_VARIAVEL_PEC, ORDEM_CENTROS_CUSTO_VAR_PEC, mesAtual);
  const cfp = agruparPorCentro(grid, GRUPO_CUSTO_FIXO_PEC, ORDEM_CENTROS_CUSTO_FIXO_PEC, mesAtual);

  warnings.push('BLOCO 3: ano-1 detalhado por subcentro = null (precisa Marco 1.1.C/D)');

  return {
    custoVariavelPecuaria: { grupo: GRUPO_CUSTO_VARIAVEL_PEC, total: cvp.total, centros: cvp.centros },
    custoFixoPecuaria: { grupo: GRUPO_CUSTO_FIXO_PEC, total: cfp.total, centros: cfp.centros },
  };
}

function buildBloco4Financeiro(
  input: BuildPlanejamentoVisaoGeralInput,
  _warnings: string[],
): Bloco4Financeiro {
  const { painel, mesAtual } = input;
  const empty = (): ComparativoDuplo => emptyComparativo('pc100', 'acumulado', 'moeda');

  const fromIndicator = (ind: { serieMeta?: number[]; serieAnoAnt?: number[] } | null | undefined): ComparativoDuplo =>
    ind ? buildComparativoPonto(ind.serieMeta, ind.serieAnoAnt, mesAtual, 'pc100', 'acumulado', 'moeda') : empty();

  const juros = fromIndicator(painel?.jurosPecIndicador);
  const amortizacoes = fromIndicator(painel?.amortizacoesIndicador);
  const investimentosPecuaria = fromIndicator(painel?.investPecIndicador);
  const investimentosAgricultura = fromIndicator(painel?.investAgriIndicador);
  const reposicaoBovinos = fromIndicator(painel?.investBovinosIndicador);
  const dividendos = fromIndicator(painel?.dividendosIndicador);

  // Desembolso Total = soma dos 6 acima (campos .valor são pontuais, não cumulativos)
  const desembolsoMetaTotal = [juros, amortizacoes, investimentosPecuaria, investimentosAgricultura, reposicaoBovinos, dividendos]
    .reduce((acc, c) => acc + safeNum(c.valor), 0);
  const desembolsoAnoAntTotal = [juros, amortizacoes, investimentosPecuaria, investimentosAgricultura, reposicaoBovinos, dividendos]
    .reduce((acc, c) => acc + safeNum(c.vsAnoFechado.valor), 0);

  const desembolsoTotal: ComparativoDuplo = {
    valor: desembolsoMetaTotal || null,
    origem: 'derivado',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: { valor: desembolsoAnoAntTotal || null, delta: pctDelta(desembolsoMetaTotal, desembolsoAnoAntTotal) },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  return {
    juros,
    amortizacoes,
    investimentosPecuaria,
    investimentosAgricultura,
    reposicaoBovinos,
    dividendos,
    desembolsoTotal,
  };
}

function buildBloco5RebanhoStub(warnings: string[]): Bloco5Rebanho {
  warnings.push('BLOCO 5 (movimentação rebanho): STUB no Marco 1.1.B — implementar em Marco 1.1.D');
  const empty = (formato: FormatoExibicao = 'cabecas'): ComparativoDuplo =>
    emptyComparativo('derivado', 'acumulado', formato);
  const zeroSerie = () => new Array(12).fill(0);

  return {
    cards: {
      entradasAnimais: empty(),
      saidasAnimais: empty(),
      compras: empty(),
      vendas: empty(),
      mortes: empty(),
      transferencias: empty(),
    },
    seriesMensais: {
      cabecas: { meta: zeroSerie(), anoAnt: zeroSerie() },
      pesoMedio: { meta: zeroSerie(), anoAnt: zeroSerie() },
      pesoTotalKg: { meta: zeroSerie(), anoAnt: zeroSerie() },
      pesoTotalArr: { meta: zeroSerie(), anoAnt: zeroSerie() },
    },
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export function buildPlanejamentoVisaoGeralData(
  input: BuildPlanejamentoVisaoGeralInput,
): PlanejamentoVisaoGeralDTO {
  const warnings: string[] = [];

  const bloco1 = buildBloco1Macro(input, warnings);
  const bloco2 = buildBloco2Producao(input, warnings);
  const bloco3 = buildBloco3Custos(input, warnings);
  const bloco4 = buildBloco4Financeiro(input, warnings);
  const bloco5 = buildBloco5RebanhoStub(warnings);

  return {
    ano: input.ano,
    mesAtual: input.mesAtual,
    escopo: input.escopo,
    fazendaId: input.fazendaId,
    fazendaNome: input.fazendaNome,
    bloco1_macroExecutivo: bloco1,
    bloco2_producaoPecuaria: bloco2,
    bloco3_estruturaCustos: bloco3,
    bloco4_financeiroCapital: bloco4,
    bloco5_movimentacaoRebanho: bloco5,
    loading: false,
    warnings,
  };
}
