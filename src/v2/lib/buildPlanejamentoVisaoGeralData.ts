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
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import {
  type AgregadoZootCompResult,
  somaAnualMeses,
} from '@/lib/painelConsultor/agregadosZootCompetencia';
import {
  agregaOutrasReceitas,
  agregaInvFazendaPec,
  agregaJurosPec,
  agregaDeducoes,
  agregaCustoVariavelPec,
  agregaCustoFixoPec,
} from '@/lib/painelConsultor/agregadosFinanceiros';

import type {
  PlanejamentoVisaoGeralDTO,
  Bloco1Macro,
  Bloco2Producao,
  Bloco3Custos,
  Bloco3AnaliseEconomica,
  AnaliseEconomicaLinha,
  AnaliseEconomicaGrupo,
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

  /**
   * Marco 1.1.D — Extras da grade META, unidos ao grid base por subcentro.
   * Fontes adicionais expostas por usePlanejamentoFinanceiro que NÃO entram
   * no buildGrid() (são merged na tela de Fluxo de Caixa META):
   *  - lancamentosRebanho: lancamentos cenario=meta tipo=abate/venda/compra
   *  - lancamentosFinanciamento: financiamento_parcelas pendentes do ano
   *  - lancamentosNutricao: Cria/Recria/Engorda auto-calculado
   *  - lancamentosProjetos: meta_projetos_investimento
   */
  extrasGrid?: ExtrasGrid;

  /**
   * Fase 2 DRE Planejamento — agregadores zootécnicos por COMPETÊNCIA (data
   * do lançamento), pré-carregados no caller via useEffect/useState (mantém
   * este builder SYNC). Quando ausente (loading inicial), as 3 linhas
   * afetadas (Receita Pecuária, Reposição Bovinos, Deduções) retornam
   * valor=null. ZERO fallback para fonte caixa.
   */
  zootComp?: ZootCompPreload;

  /**
   * Marco 1.1.E — Camada de compatibilidade histórica REAL ano-1.
   * Array de financeiro_lancamentos_v2 do ano FECHADO (ano - 1) carregado
   * via `carregarLancFinAnoAntReal` no caller. Os agregadores oficiais
   * (`agregaOutrasReceitas`, `agregaInvFazendaPec`, `agregaJurosPec`)
   * classificam esse array em number[12] por linha-base.
   *
   * Aplica-se APENAS no caminho ano-1; META continua intocada. Linhas DRE
   * afetadas (vsAnoFechado sobrescrito quando lancFinAnoAnt está presente):
   *   - Outras Receitas
   *   - Investimento Fazenda Pec
   *   - Juros Pecuária (Passo 2 — pendente)
   * NÃO se aplica a Receita Pec, Reposição, Variação Estoque, Custeio total
   * (essas seguem zoot/PC-100 já definidos).
   */
  lancFinAnoAnt?: FinanceiroLancamento[];
}

/**
 * Resultados pré-carregados de agregadosZootCompetencia para o Bloco 3.
 * Carregados ASYNC no caller (V2PlanejamentoVisaoGeral) e passados como
 * parâmetro para manter este builder SYNC.
 *
 * Quando undefined (loading inicial) → as 3 linhas retornam valor=null.
 * Quando preenchido → valor anual = somaAnualMeses(meses),
 * origem='zoot_competencia'.
 *
 * Marco 1.1.E — campos *AnoAnt alimentam vsAnoFechado das mesmas 3 linhas
 * via chamada paralela dos mesmos agregadores com (ano - 1). Sem dado
 * → vsAnoFechado.valor = null (UI mostra '—'), sem fallback.
 */
export interface ZootCompPreload {
  receitaPec: AgregadoZootCompResult | null;
  deducoes: AgregadoZootCompResult | null;
  reposicaoBovinos: AgregadoZootCompResult;  // sem | null por convenção da função
  receitaPecAnoAnt: AgregadoZootCompResult | null;
  deducoesAnoAnt: AgregadoZootCompResult | null;
  reposicaoBovinosAnoAnt: AgregadoZootCompResult;
}

/** Tipo dos extras de grade — usado por helpers do BLOCO 1 (Marco 1.1.D). */
export type ExtrasGrid = {
  lancamentosRebanho: Map<string, number[]>;       // subcentro → meses[12]
  lancamentosFinanciamento: Map<string, number[]>;
  lancamentosNutricao: Map<string, number[]>;
  lancamentosProjetos: Map<string, number[]>;
};

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

// ─── HELPERS DE GRID + EXTRAS (Marco 1.1.D) ──────────────────────────────────

/**
 * Marco 1.1.D — Soma anual de subcentros por filtro macro/grupo,
 * unificando grid base (planejamento_financeiro) com as 4 Maps de extras
 * (rebanho, financiamento, nutrição, projetos) — exatamente como faz
 * a tela de Fluxo de Caixa META.
 *
 * Filtro recebe (row) do grid e retorna soma total. Para anual usar ate=12.
 * Para acumulado Jan→mesAtual usar ate=mesAtual.
 */
function somarGridEExtras(
  grid: SubcentroGrid[],
  extras: ExtrasGrid | undefined,
  filter: (row: SubcentroGrid) => boolean,
  ate: number = 12,
): number {
  let total = 0;
  // 1) Soma do grid base (planejamento_financeiro)
  for (const row of grid) {
    if (!filter(row)) continue;
    for (let i = 0; i < ate && i < row.meses.length; i++) {
      total += Number(row.meses[i]) || 0;
    }
  }
  // 2) Para cada Map de extras: somar APENAS os subcentros que passam no filter
  // — descobrimos os subcentros válidos via grid (lookup macro/grupo).
  if (extras) {
    const subcentrosValidos = new Set<string>();
    for (const row of grid) {
      if (filter(row)) subcentrosValidos.add(row.subcentro);
    }
    const maps = [
      extras.lancamentosRebanho,
      extras.lancamentosFinanciamento,
      extras.lancamentosNutricao,
      extras.lancamentosProjetos,
    ];
    for (const m of maps) {
      for (const [subcentro, meses] of m.entries()) {
        if (!subcentrosValidos.has(subcentro)) continue;
        for (let i = 0; i < ate && i < meses.length; i++) {
          total += Number(meses[i]) || 0;
        }
      }
    }
  }
  return total;
}

/**
 * Marco 1.1.D — Saldo mensal "líquido" do Fluxo de Caixa META:
 * receitas - saídas = saldo_mes[12].
 * Caixa Final = saldoInicial + Σ saldo_mes.
 *
 * Convenção: macros que entram positivo: 'Receita Operacional', 'Entrada Financeira'.
 * Macros que saem (subtraem): 'Custeio Produção', 'Investimento na Fazenda',
 * 'Investimento em Bovinos', 'Saída Financeira', 'Dividendos', 'Deduções de Receitas'.
 * Macro 'Transferências' NÃO entra (neutro).
 */
function calcularSaldoMensal(
  grid: SubcentroGrid[],
  extras: ExtrasGrid | undefined,
): number[] {
  const ENTRADAS_MACROS = new Set(['Receita Operacional', 'Entrada Financeira']);
  const SAIDAS_MACROS = new Set([
    'Custeio Produção', 'Investimento na Fazenda', 'Investimento em Bovinos',
    'Saída Financeira', 'Dividendos', 'Deduções de Receitas',
  ]);
  const saldoMes = new Array(12).fill(0);

  // 1) Grid base
  for (const row of grid) {
    if (!row.macro_custo) continue;
    const sign = ENTRADAS_MACROS.has(row.macro_custo) ? 1 :
                 SAIDAS_MACROS.has(row.macro_custo) ? -1 : 0;
    if (sign === 0) continue;
    for (let i = 0; i < 12; i++) {
      saldoMes[i] += sign * (Number(row.meses[i]) || 0);
    }
  }
  // 2) Extras (mapear subcentro → macro via grid lookup)
  if (extras) {
    const subToMacro = new Map<string, string>();
    for (const row of grid) {
      if (row.macro_custo && !subToMacro.has(row.subcentro)) {
        subToMacro.set(row.subcentro, row.macro_custo);
      }
    }
    const maps = [
      extras.lancamentosRebanho,
      extras.lancamentosFinanciamento,
      extras.lancamentosNutricao,
      extras.lancamentosProjetos,
    ];
    for (const m of maps) {
      for (const [subcentro, meses] of m.entries()) {
        const macro = subToMacro.get(subcentro);
        if (!macro) continue;
        const sign = ENTRADAS_MACROS.has(macro) ? 1 :
                     SAIDAS_MACROS.has(macro) ? -1 : 0;
        if (sign === 0) continue;
        for (let i = 0; i < 12 && i < meses.length; i++) {
          saldoMes[i] += sign * (Number(meses[i]) || 0);
        }
      }
    }
  }
  return saldoMes;
}

/**
 * Marco 1.1.D — Constrói ComparativoDuplo a partir de soma de grid+extras.
 * Anual = ate=12. Acum Jan→mesAtual = ate=mesAtual.
 * Comparativo vs ano-1 (serieAnoAnt) NÃO disponível na grade META;
 * fica null (Marco 1.1.E poderá adicionar via segundo buildGrid do ano-1).
 */
function buildComparativoGrid(
  grid: SubcentroGrid[],
  extras: ExtrasGrid | undefined,
  filter: (row: SubcentroGrid) => boolean,
  _mesAtual: number,
  origem: OrigemMetric,
  tipoSemantica: TipoSemantica,
  formato: FormatoExibicao,
): ComparativoDuplo {
  const anual = somarGridEExtras(grid, extras, filter, 12);
  return {
    valor: anual,
    origem,
    tipoSemantica,
    formato,
    // Marco 1.1.E: hook usePlanejamentoFinanceiro só lê cenario='meta'; não
    // existe grid REAL ano-1 disponível. PC-100 cobre apenas algumas linhas
    // (Receita Pec, Custeio Pec total, Variação Estoque) — tratadas no Bloco 3.
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };
}

/**
 * Constrói ComparativoDuplo a partir de array mensal [12] (origem competência zoot).
 *
 * Convenção:
 *  - meses === null            → GAP de cadastro (UI mostra placeholder)
 *  - meses === [12]            → dado real (zero ou positivo); anual = somaAnualMeses
 *  - mesesAnoAnt === null      → sem dado ano-1 (vsAnoFechado.valor = null)
 *  - mesesAnoAnt === [12]      → anual ano-1 = somaAnualMeses; delta % derivado
 *
 * vsMesmoPeriodo permanece null — agregadores zoot anuais não retornam
 * série Jan→mêsAtual.
 */
function buildComparativoFromZootMeses(
  meses: number[] | null,
  mesesAnoAnt: number[] | null,
  origem: OrigemMetric,
  tipoSemantica: TipoSemantica,
  formato: FormatoExibicao,
): ComparativoDuplo {
  const valor = meses ? somaAnualMeses(meses) : null;
  const valorAnoAnt = mesesAnoAnt ? somaAnualMeses(mesesAnoAnt) : null;
  return {
    valor,
    origem,
    tipoSemantica,
    formato,
    vsAnoFechado: { valor: valorAnoAnt, delta: pctDelta(valor, valorAnoAnt) },
    vsMesmoPeriodo: { valor: null, delta: null },
  };
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

/**
 * Comparativo de FOTO/PONTO 0-indexed — para `painel.seriesMeta` cuja convenção
 * é Jan=[0]..Dez=[11] (diferente das séries dos indicadores agregados, que são
 * 1-indexed com 13 posições).
 *
 * Uso: cards de foto final (Rebanho Final META, Peso Médio Final META) que
 * precisam de `seriesMeta[11]` = Dez, NÃO da média do período entregue pelos
 * indicadores quando viewMode='periodo'.
 *
 * ano-ant: não disponível em `seriesMeta` (que é só META 2026); marcar null
 * para evitar fallback inventado misturando convenções de série. Card mostra
 * "— vs ano ant." sem comparativo.
 */
/**
 * Comparativo do card "Peso Médio Final META".
 *
 * Valor: prioriza snapshot validado (`pesoMedioFinMetaSnap`) — mesma fonte
 * usada pela tabela Rebanho META. Se ausente, usa view zoot ponderada
 * (`seriesMeta.pesoMedioFin[11]`). Snapshot pode divergir da view porque
 * representa o peso validado oficialmente vs cálculo pesoTotal/cab da view.
 *
 * Base "início ano": foto Dez ano-1 ponderada (`pesoMedioFinFotoAnoAnt`).
 * Delta = (valor - base) / base × 100.
 */
function buildComparativoPesoFinalMeta(
  snapMeta: number | null | undefined,
  viewMetaDez: number | null,
  baseInicioAno: number | null | undefined,
): ComparativoDuplo {
  const fromSnap = snapMeta != null && Number.isFinite(snapMeta) ? snapMeta : null;
  const fromView = viewMetaDez != null && Number.isFinite(viewMetaDez) ? viewMetaDez : null;
  const valor = fromSnap ?? fromView;
  const base = baseInicioAno != null && Number.isFinite(baseInicioAno) && baseInicioAno !== 0
    ? baseInicioAno
    : null;
  const delta = valor != null && base != null ? ((valor - base) / base) * 100 : null;
  return {
    valor,
    origem: 'pc100',
    tipoSemantica: 'estoque',
    formato: 'kg',
    vsAnoFechado: { valor: base, delta },
    vsMesmoPeriodo: { valor: null, delta: null },
  };
}

function buildComparativoEstoquePontoZeroIndexed(
  seriesMeta: number[] | undefined,
  idxZeroBased: number,
  origem: OrigemMetric,
  formato: FormatoExibicao,
  /**
   * Base oficial de comparação — REBANHO/PESO INICIAL REALIZADO do ano
   * (= fechamento de Dez ano-1). Fonte: indicator.serieAnoAnt[12]
   * (length 13, 1-based, [12]=Dez ano-1). Quando ausente ou inválida,
   * vsAnoFechado fica null e o card mostra "—".
   */
  baseInicioAno?: number | null,
): ComparativoDuplo {
  const v = seriesMeta && seriesMeta.length > idxZeroBased ? seriesMeta[idxZeroBased] : null;
  const valor = v != null && Number.isFinite(v) ? v : null;
  const base = baseInicioAno != null && Number.isFinite(baseInicioAno) && baseInicioAno !== 0
    ? baseInicioAno
    : null;
  const delta = valor != null && base != null ? ((valor - base) / base) * 100 : null;
  return {
    valor,
    origem,
    tipoSemantica: 'estoque',
    formato,
    vsAnoFechado: { valor: base, delta },
    vsMesmoPeriodo: { valor: null, delta: null },
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
      valorAnoAnt: null, // Marco 1.1.E: detalhamento por subcentro ano-1 sem fonte oficial REAL.
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
        vsAnoFechado: { valor: null, delta: null },   // Marco 1.1.E
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

/**
 * Marco 1.1.D — BLOCO 1 soberano via grade META (grid + 4 extras).
 *
 * Fonte oficial: usePlanejamentoFinanceiro (buildGrid + lancamentosRebanho
 * + lancamentosFinanciamento + lancamentosNutricao + lancamentosProjetos)
 * — mesma fonte do Fluxo de Caixa META. PC-100 NÃO é mais consultado aqui.
 *
 * Comparativo vs ano-1 (vsAnoFechado / vsMesmoPeriodo) fica null em todos
 * os campos — Marco 1.1.E vai adicionar via segundo buildGrid do ano-1.
 */
function buildBloco1Macro(
  grid: SubcentroGrid[],
  extras: ExtrasGrid | undefined,
  mesAtual: number,
  saldoInicial: number,
  zootComp?: ZootCompPreload,
  lancFinAnoAnt?: FinanceiroLancamento[],
  ano?: number,
): Bloco1Macro {
  // ENTRADAS
  // Fase 2 DRE: Receita Pecuária migra de fonte caixa (planejamento_financeiro)
  // para competência zoot (agregadosZootCompetencia). Sem fallback caixa.
  // Marco 1.1.E: vsAnoFechado vem do mesmo agregador chamado com (ano - 1).
  const receitasPecuaria = buildComparativoFromZootMeses(
    zootComp?.receitaPec?.meses ?? null,
    zootComp?.receitaPecAnoAnt?.meses ?? null,
    'zoot_competencia', 'acumulado', 'moeda',
  );
  const outrasReceitasBase = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === MACRO_RECEITAS
      && r.grupo_custo !== GRUPO_RECEITA_PECUARIA,
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  // Marco 1.1.E: vsAnoFechado de Outras Receitas vem do realizado financeiro
  // do ano-1 via agregaOutrasReceitas oficial (camada histórica). META intocada.
  const outrasReceitasAnoAnt = (lancFinAnoAnt && ano != null)
    ? somaAnualMeses(agregaOutrasReceitas(lancFinAnoAnt, ano - 1))
    : null;
  const outrasReceitas: ComparativoDuplo = {
    ...outrasReceitasBase,
    vsAnoFechado: {
      valor: outrasReceitasAnoAnt,
      delta: pctDelta(outrasReceitasBase.valor, outrasReceitasAnoAnt),
    },
  };
  const entradasFinanceiras = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === MACRO_ENTRADA_FINANCEIRA,
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  const totalEntradas = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === MACRO_RECEITAS
      || r.macro_custo === MACRO_ENTRADA_FINANCEIRA,
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );

  // SAÍDAS — Custeio Pec separado de juros (SEM juros), custeio agri, invest, dividendos
  const custeioPecuaria = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Custeio Produção'
      && (r.grupo_custo === 'Custo Fixo Pecuária'
       || r.grupo_custo === 'Custo Variável Pecuária'),
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  const custeioAgricultura = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Custeio Produção'
      && (r.grupo_custo === 'Custo Fixo Agricultura'
       || r.grupo_custo === 'Custo Variável Agricultura'),
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  const investimentosPecuariaBase = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Investimento na Fazenda'
      && r.escopo_negocio === 'pecuaria',
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  // Marco 1.1.E: vsAnoFechado de Investimento Fazenda Pec vem do realizado
  // financeiro ano-1 via agregaInvFazendaPec oficial (camada histórica).
  const investimentosPecuariaAnoAnt = (lancFinAnoAnt && ano != null)
    ? somaAnualMeses(agregaInvFazendaPec(lancFinAnoAnt, ano - 1))
    : null;
  const investimentosPecuaria: ComparativoDuplo = {
    ...investimentosPecuariaBase,
    vsAnoFechado: {
      valor: investimentosPecuariaAnoAnt,
      delta: pctDelta(investimentosPecuariaBase.valor, investimentosPecuariaAnoAnt),
    },
  };
  const investimentosAgricultura = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Investimento na Fazenda'
      && r.escopo_negocio === 'agricultura',
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  // Fase 2 DRE: Reposição Bovinos migra de fonte caixa para competência zoot.
  // Marco 1.1.E: vsAnoFechado vem do mesmo agregador chamado com (ano - 1).
  const reposicaoBovinos = buildComparativoFromZootMeses(
    zootComp?.reposicaoBovinos?.meses ?? null,
    zootComp?.reposicaoBovinosAnoAnt?.meses ?? null,
    'zoot_competencia', 'acumulado', 'moeda',
  );
  const amortizacoes = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Saída Financeira',
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  const dividendos = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Dividendos',
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );
  // Total Saídas = soma das 6 macros de saída (inclui Deduções de Receitas)
  const totalSaidas = buildComparativoGrid(
    grid, extras,
    r => r.macro_custo === 'Custeio Produção'
      || r.macro_custo === 'Investimento na Fazenda'
      || r.macro_custo === 'Investimento em Bovinos'
      || r.macro_custo === 'Saída Financeira'
      || r.macro_custo === 'Dividendos'
      || r.macro_custo === 'Deduções de Receitas',
    mesAtual, 'planejamento_financeiro', 'acumulado', 'moeda',
  );

  // RESULTADO
  const geracaoOperacional: ComparativoDuplo = {
    valor: safeNum(receitasPecuaria.valor) + safeNum(outrasReceitas.valor)
         - safeNum(custeioPecuaria.valor) - safeNum(custeioAgricultura.valor),
    origem: 'derivado',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  // Caixa Final = saldoInicial + Σ saldoMes (mensal: receitas − saídas)
  const saldoMensal = calcularSaldoMensal(grid, extras);
  const totalSaldoMes = saldoMensal.reduce((a, v) => a + v, 0);
  const geracaoCaixa: ComparativoDuplo = {
    valor: totalSaldoMes,
    origem: 'derivado',
    tipoSemantica: 'acumulado',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };
  const caixaFinal: ComparativoDuplo = {
    valor: saldoInicial + totalSaldoMes,
    origem: 'derivado',
    tipoSemantica: 'estoque',
    formato: 'moeda',
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };

  return {
    receitasPecuaria,
    outrasReceitas,
    entradasFinanceiras,
    totalEntradas,
    custeioPecuaria,
    custeioAgricultura,
    investimentosPecuaria,
    investimentosAgricultura,
    reposicaoBovinos,
    amortizacoes,
    dividendos,
    totalSaidas,
    geracaoOperacional,
    geracaoCaixa,
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
      cabecasFinal: empty('cabecas', 'estoque'),
      rebanhoMedio: empty('cabecas', 'media'),
      pesoMedioFinal: empty('kg', 'estoque'),
      valorRebanhoFinal: empty('moeda', 'estoque'),
      arrobasProduzidas: empty('arrobas', 'acumulado'),
      arrobasDesfrutadas: empty('arrobas', 'acumulado'),
      desfrutePct: empty('cabecas', 'acumulado'),
      lotacaoMedia: empty('ua_ha', 'media'),
      areaProdutivaMedia: empty('hectares', 'media'),
      custoArr: empty('moeda', 'taxa'),
      precoArr: empty('moeda', 'taxa'),
      margemArr: empty('moeda', 'taxa'),
      gmdMedio: empty('gmd', 'estoque'),
      custoCab: empty('moeda', 'taxa'),
    };
  }

  // Estoque (cabecas e peso): serieMetaIndicador (cabecas) e serieMeta (pesoMedio)
  const cabSerieMeta = painel.cabecasIndicador?.serieMetaIndicador;
  const cabSerieAnoAnt = painel.cabecasIndicador?.serieAnoAnt;
  const pesoSerieMeta = painel.pesoMedioIndicador?.serieMeta;
  const pesoSerieAnoAnt = painel.pesoMedioIndicador?.serieAnoAnt;

  warnings.push('cabecasFinal/pesoMedioFinal META: foto Dez. Comparativo vs INÍCIO DO ANO usa cabecasFinFotoAnoAnt / pesoMedioFinFotoAnoAnt (foto Dez ano-1 REALIZADO, independente de viewMode). Peso final META usa pesoMedioFinMetaSnap (snapshot validado, mesma fonte da tabela Rebanho META).');

  // Rebanho Final META: FOTO Dez (idx 11 em painel.seriesMeta.cabFin, 0-indexed).
  //   NÃO usar cabecasIndicador.serieMetaIndicador aqui — em viewMode='periodo'
  //   essa série retorna cabMediaAcumMeta (MÉDIA), não foto final.
  // Peso Médio Final META: idem — painel.seriesMeta.pesoMedioFin[11] (foto Dez).
  // Rebanho Médio META: este SIM é média do período. Consome
  //   painel.cabecasIndicador.serieMetaIndicador (= cabMediaAcumMeta em modo 'periodo').
  // Valor do Rebanho Final META: painel.valorRebanhoIndicador.serieMeta (length 13,
  //   1-based, [12]=Dez). Em Global retorna serieMeta vazia (limitação real:
  //   valor_rebanho_meta_validada só existe em Fazenda — L310 do PC-100).
  //   Comparativo "vs início ano" = painel.valorRebanhoIndicador.serieAno[0] (Dez ano-1
  //   REALIZADO, 1-based length 13 — L2028 do PC-100).
  // GMD Médio META: painel.gmdIndicador.serieMeta[12] (Dez META). Substitui o
  //   antigo card Receita/Cab que dependia de derivação Marco 1.1.D pendente.
  return {
    // Comparativo vs INÍCIO DO ANO (foto Dez ano-1 REALIZADO).
    //   - Cabeças: painel.cabecasFinFotoAnoAnt (= cabFinAnoAntSerie[12], foto)
    //   - Peso:    painel.pesoMedioFinFotoAnoAnt (= pesoMedioFinAnoAnt13[12], foto)
    // Não usar *Indicador.serieAnoAnt[12]: em viewMode='periodo' essa série
    // retorna média acumulada, não foto — causa bug do delta invertido.
    cabecasFinal: buildComparativoEstoquePontoZeroIndexed(
      painel.seriesMeta?.cabFin, 11, 'pc100', 'cabecas',
      painel.cabecasFinFotoAnoAnt,
    ),
    rebanhoMedio: buildComparativoPonto(cabSerieMeta, cabSerieAnoAnt, mesAtual, 'pc100', 'media', 'cabecas'),
    // Peso Final META: usa pesoMedioFinMetaSnap (snapshot validado, mesma
    // fonte da tabela Rebanho META). Quando ausente, cai para seriesMeta
    // (view zoot ponderada). Comparativo vs início ano usa foto Dez ano-1.
    pesoMedioFinal: buildComparativoPesoFinalMeta(
      painel.pesoMedioFinMetaSnap,
      painel.seriesMeta?.pesoMedioFin?.[11] ?? null,
      painel.pesoMedioFinFotoAnoAnt,
    ),
    valorRebanhoFinal: buildComparativoEstoquePontoZeroIndexed(
      painel.valorRebanhoIndicador?.serieMeta,
      12, // Dez (serieMeta length 13, 1-based)
      'pc100',
      'moeda',
      painel.valorRebanhoIndicador?.serieAno?.[0] ?? null, // Dez ano-1 realizado = serieAno[0]
    ),

    arrobasProduzidas: buildComparativoPonto(
      painel.arrobasIndicador?.serieMeta,
      painel.arrobasIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'acumulado', 'arrobas',
    ),

    // Consome fonte oficial PC-100: painel.desfruteArrIndicador (Σ arrobas
    // desfrutadas = abate+venda+consumo). Valor exibido = total anual META
    // via valorPonto(serieMeta, 12). Sem derivação receitaPec/precoArr.
    arrobasDesfrutadas: buildComparativoPonto(
      painel.desfruteArrIndicador?.serieMeta,
      painel.desfruteArrIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'acumulado', 'arrobas',
    ),

    // PC-100 desfruteIndicador é por design DESFRUTE (CAB.) — contagem acumulada
    // de animais (abate+venda+consumo) no período. NÃO é taxa percentual.
    // Espelhar a fonte oficial: formato 'cabecas', semântica 'acumulado'.
    desfrutePct: buildComparativoPonto(
      painel.desfruteIndicador?.serieMeta,
      painel.desfruteIndicador?.serieAnoAnt,
      mesAtual, 'pc100', 'acumulado', 'cabecas',
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

    gmdMedio: buildComparativoEstoquePontoZeroIndexed(
      painel.gmdIndicador?.serieMeta,
      12, // ANUAL: card sem filtro de mês — lê Dez (Jan-Dez acumulado/média) da série META do período
      'pc100',
      'gmd',
      painel.gmdIndicador?.serieAnoAnt?.[12] ?? null, // GMD acumulado/médio ano anterior (Dez)
    ),

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

  warnings.push('BLOCO 3: ano-1 detalhado por subcentro = null (Marco 1.1.E: sem fonte oficial REAL por subcentro)');

  return {
    custoVariavelPecuaria: { grupo: GRUPO_CUSTO_VARIAVEL_PEC, total: cvp.total, centros: cvp.centros },
    custoFixoPecuaria: { grupo: GRUPO_CUSTO_FIXO_PEC, total: cfp.total, centros: cfp.centros },
  };
}

// ─── BLOCO 3 — Análise Econômica META (DRE Pecuária) ───────────────────────
// Builder puro. Reutiliza Bloco1 (entradas/saídas via grid), Bloco3Custos
// (CustoVar/CustoFix Pec) e Bloco4Financeiro (juros). Adiciona dois cálculos:
//   - Deduções: buildComparativoGrid(macro='Deduções de Receitas')
//   - Variação Estoque Gado: serieMeta[12] - serieAno[0]  (META = final Dez META − inicial Jan = Dez ano-1)
//                            serieAnoAnt[12] - serieAnoAnt[0]  (Ano-1)
// Subtotais derivados via soma algébrica explícita.
// Convenção: valores POSITIVOS no DTO; sinal contábil aplicado no JSX.
function buildBloco3AnaliseEconomica(
  input: BuildPlanejamentoVisaoGeralInput,
  bloco1: Bloco1Macro,
  bloco3Custos: Bloco3Custos,
  bloco4: Bloco4Financeiro,
): Bloco3AnaliseEconomica {
  const { grid, extrasGrid, painel, mesAtual } = input;

  const mkLinha = (
    label: string,
    valor: number | null,
    valorAnoAnt: number | null,
  ): AnaliseEconomicaLinha => {
    const deltaRs =
      valor != null && Number.isFinite(valor) && valorAnoAnt != null && Number.isFinite(valorAnoAnt)
        ? valor - valorAnoAnt
        : null;
    const deltaPct =
      valor != null && Number.isFinite(valor) && valorAnoAnt != null && Number.isFinite(valorAnoAnt) && valorAnoAnt > 0
        ? ((valor - valorAnoAnt) / valorAnoAnt) * 100
        : null;
    return { label, valor, valorAnoAnt, deltaRs, deltaPct };
  };

  const soma = (...vs: (number | null)[]): number | null => {
    let acc: number | null = null;
    for (const v of vs) {
      if (v == null || !Number.isFinite(v)) continue;
      acc = (acc ?? 0) + v;
    }
    return acc;
  };

  const subt = (a: number | null, b: number | null): number | null =>
    a != null && Number.isFinite(a) && b != null && Number.isFinite(b) ? a - b : null;

  // Marco 1.1.E: soma ESTRITA — qualquer parcela null → resultado null.
  // Usada para derivados ano-1 onde parcelas faltantes não podem ser
  // mascaradas como zero (geraria número parcial enganoso na UI).
  const somaEstrita = (...vs: (number | null)[]): number | null => {
    let acc = 0;
    for (const v of vs) {
      if (v == null || !Number.isFinite(v)) return null;
      acc += v;
    }
    return acc;
  };

  // ─── 1. Faturamento ──────────────────────────────────────────
  const recPecMeta = bloco1.receitasPecuaria.valor;
  const recPecAnoAnt = bloco1.receitasPecuaria.vsAnoFechado.valor;
  const outRecMeta = bloco1.outrasReceitas.valor;
  const outRecAnoAnt = bloco1.outrasReceitas.vsAnoFechado.valor;
  const fatTotMeta = soma(recPecMeta, outRecMeta);
  // Marco 1.1.E: Outras Receitas ano-1 sem fonte oficial REAL → fatTotAnoAnt
  // estrito propaga null. Derivados encadeados (Receita Líquida etc.) seguem.
  const fatTotAnoAnt = somaEstrita(recPecAnoAnt, outRecAnoAnt);

  const faturamento: AnaliseEconomicaGrupo = {
    label: '1. Faturamento',
    total: mkLinha('Faturamento', fatTotMeta, fatTotAnoAnt),
    detalhes: [
      mkLinha('Receita Pecuária', recPecMeta, recPecAnoAnt),
      mkLinha('Outras Receitas', outRecMeta, outRecAnoAnt),
    ],
  };

  // ─── 2. (−) Deduções de Receita ──────────────────────────────
  // Fase 2 DRE: Deduções migra de fonte caixa para competência zoot
  // (agregadosZootCompetencia). Sem fallback caixa para META. Detalhe único = total.
  //
  // Marco 1.1.E (FIX 1) — Deduções ano-1 COMPOSTA:
  //   1) zoot REAL ano-1 (agregaDeducoesZootComp) — preferida
  //   2) fallback financeiro REAL ano-1 (agregaDeducoes em financeiro_lancamentos_v2)
  //      — só usado quando o cliente registrou deduções como lançamentos
  //      financeiros históricos sem cadastro zootécnico
  //   3) null se ambas vazias
  // Padrão de compatibilidade histórica: aplica APENAS em vsAnoFechado.valor;
  // META segue zoot puro (deducoesMeta intacto).
  const deducoesCD = buildComparativoFromZootMeses(
    input.zootComp?.deducoes?.meses ?? null,
    input.zootComp?.deducoesAnoAnt?.meses ?? null,
    'zoot_competencia', 'acumulado', 'moeda',
  );
  const deducoesMeta = deducoesCD.valor;
  const deducoesZootAnoAnt = deducoesCD.vsAnoFechado.valor;
  const deducoesFinAnoAnt = (input.lancFinAnoAnt && input.ano != null)
    ? somaAnualMeses(agregaDeducoes(input.lancFinAnoAnt, input.ano - 1))
    : null;
  const deducoesAnoAnt: number | null =
    deducoesZootAnoAnt != null && deducoesZootAnoAnt > 0
      ? deducoesZootAnoAnt
      : (deducoesFinAnoAnt != null && deducoesFinAnoAnt > 0
        ? deducoesFinAnoAnt
        : null);
  const deducoes: AnaliseEconomicaGrupo = {
    label: '2. (−) Deduções de Receita',
    total: mkLinha('Deduções', deducoesMeta, deducoesAnoAnt),
    detalhes: [mkLinha('Deduções totais', deducoesMeta, deducoesAnoAnt)],
  };

  // = Receita Líquida
  const recLiqMeta = subt(fatTotMeta, deducoesMeta);
  const recLiqAnoAnt = subt(fatTotAnoAnt, deducoesAnoAnt);
  const receitaLiquida = mkLinha('Receita Líquida', recLiqMeta, recLiqAnoAnt);

  // ─── 3. (−) Custeio Pecuária ─────────────────────────────────
  // Marco 1.1.E: Custeio Pec TOTAL ano-1 vem do PC-100 (custeioPecIndicador
  // .serieAnoAnt[12], regime CAIXA via financeiro_lancamentos_v2 REALIZADO).
  // PC-100 mantém autoridade no Total — não substituir mesmo com agregadores
  // disponíveis (pequenos deltas de arredondamento entre pipelines são
  // aceitos no Total; detalhe Var/Fix usa agregadores oficiais por grupo).
  //
  // FIX 2 — Custo Var/Fix ano-1 via agregadores oficiais por grupo_custo
  // ('Custo Variável Pecuária' / 'Custo Fixo Pecuária'). Aplica APENAS em
  // vsAnoFechado.valor; META intacta (custoVarMeta/custoFixMeta seguem do
  // bloco3Custos sobre o grid META).
  const custeioPecMeta = bloco1.custeioPecuaria.valor;
  const custeioPecAnoAnt = painel?.custeioPecIndicador?.serieAnoAnt?.[12] ?? null;
  const custoVarMeta = bloco3Custos.custoVariavelPecuaria.total.valor;
  const custoVarAnoAnt = (input.lancFinAnoAnt && input.ano != null)
    ? somaAnualMeses(agregaCustoVariavelPec(input.lancFinAnoAnt, input.ano - 1))
    : null;
  const custoFixMeta = bloco3Custos.custoFixoPecuaria.total.valor;
  const custoFixAnoAnt = (input.lancFinAnoAnt && input.ano != null)
    ? somaAnualMeses(agregaCustoFixoPec(input.lancFinAnoAnt, input.ano - 1))
    : null;

  const custeioPecuaria: AnaliseEconomicaGrupo = {
    label: '3. (−) Custeio Pecuária',
    total: mkLinha('Custeio Pecuária', custeioPecMeta, custeioPecAnoAnt),
    detalhes: [
      mkLinha('Custo Variável Pec', custoVarMeta, custoVarAnoAnt),
      mkLinha('Custo Fixo Pec', custoFixMeta, custoFixAnoAnt),
    ],
  };

  // = Resultado Bruto
  const resBrutoMeta = subt(recLiqMeta, custeioPecMeta);
  const resBrutoAnoAnt = subt(recLiqAnoAnt, custeioPecAnoAnt);
  const resultadoBruto = mkLinha('Resultado Bruto', resBrutoMeta, resBrutoAnoAnt);

  // ─── 4. (−) Investimento na Fazenda Pec ──────────────────────
  const invFazPecMeta = bloco1.investimentosPecuaria.valor;
  const invFazPecAnoAnt = bloco1.investimentosPecuaria.vsAnoFechado.valor;
  const investimentoFazendaPec = mkLinha(
    '4. (−) Investimento na Fazenda Pec',
    invFazPecMeta, invFazPecAnoAnt,
  );

  // = Resultado com Investimento
  const resInvMeta = subt(resBrutoMeta, invFazPecMeta);
  const resInvAnoAnt = subt(resBrutoAnoAnt, invFazPecAnoAnt);
  const resultadoComInvestimento = mkLinha(
    'Resultado com Investimento', resInvMeta, resInvAnoAnt,
  );

  // ─── 5. (−) Reposição de Bovinos ─────────────────────────────
  const reposMeta = bloco1.reposicaoBovinos.valor;
  const reposAnoAnt = bloco1.reposicaoBovinos.vsAnoFechado.valor;
  const reposicaoBovinos = mkLinha(
    '5. (−) Reposição de Bovinos', reposMeta, reposAnoAnt,
  );

  // ─── 6. (±) Variação do Estoque do Gado ──────────────────────
  // PC-100 valorRebanhoIndicador: 1-based length 13.
  //   META  = serieMeta[12]   − serieAno[0]      (final Dez META − inicial Jan = Dez ano-1)
  //   Ano-1 = serieAnoAnt[12] − serieAnoAnt[0]
  const safeIdx = (arr: number[] | null | undefined, idx: number): number | null => {
    if (!arr) return null;
    const v = arr[idx];
    if (v == null || !Number.isFinite(v)) return null;
    return v;
  };
  const serieAno    = painel?.valorRebanhoIndicador?.serieAno    ?? null;
  const serieAnoAnt = painel?.valorRebanhoIndicador?.serieAnoAnt ?? null;
  const serieMeta   = painel?.valorRebanhoIndicador?.serieMeta   ?? null;

  const finalMeta   = safeIdx(serieMeta, 12);
  const inicialMeta = safeIdx(serieAno, 0);
  const varMeta = subt(finalMeta, inicialMeta);

  const finalAnoAnt   = safeIdx(serieAnoAnt, 12);
  const inicialAnoAnt = safeIdx(serieAnoAnt, 0);
  const varAnoAnt = subt(finalAnoAnt, inicialAnoAnt);

  const variacaoEstoqueGado = mkLinha(
    '6. (±) Variação do Estoque do Gado', varMeta, varAnoAnt,
  );

  // = Resultado Operacional = ResComInv − Reposição + VariaçãoEstoque
  const resOpMeta =
    resInvMeta != null && reposMeta != null && varMeta != null
      ? resInvMeta - reposMeta + varMeta
      : null;
  const resOpAnoAnt =
    resInvAnoAnt != null && reposAnoAnt != null && varAnoAnt != null
      ? resInvAnoAnt - reposAnoAnt + varAnoAnt
      : null;
  const resultadoOperacional = mkLinha(
    'Resultado Operacional', resOpMeta, resOpAnoAnt,
  );

  // ─── 7. (−) Resultado Financeiro — só Juros Pec ──────────────
  const jurosMeta = bloco4.juros.valor;
  const jurosAnoAnt = bloco4.juros.vsAnoFechado.valor;
  const resultadoFinanceiro: AnaliseEconomicaGrupo = {
    label: '7. (−) Resultado Financeiro',
    total: mkLinha('Resultado Financeiro', jurosMeta, jurosAnoAnt),
    detalhes: [mkLinha('Juros Pecuária', jurosMeta, jurosAnoAnt)],
  };

  // = Resultado Antes dos Tributos
  const resAntesMeta = subt(resOpMeta, jurosMeta);
  const resAntesAnoAnt = subt(resOpAnoAnt, jurosAnoAnt);
  const resultadoAntesTributos = mkLinha(
    'Resultado Antes dos Tributos', resAntesMeta, resAntesAnoAnt,
  );

  // ─── 8 & 9 placeholders ──────────────────────────────────────
  const tributosPatrimoniais = null;
  const impostosSobreLucro = null;

  // = Lucro Líquido Planejado (= resAntes enquanto 8 e 9 forem null)
  const lucroLiquido = mkLinha(
    'Lucro Líquido Planejado', resAntesMeta, resAntesAnoAnt,
  );

  return {
    faturamento,
    deducoes,
    receitaLiquida,
    custeioPecuaria,
    resultadoBruto,
    investimentoFazendaPec,
    resultadoComInvestimento,
    reposicaoBovinos,
    variacaoEstoqueGado,
    resultadoOperacional,
    resultadoFinanceiro,
    resultadoAntesTributos,
    tributosPatrimoniais,
    impostosSobreLucro,
    lucroLiquido,
  };
}

function buildBloco4Financeiro(
  input: BuildPlanejamentoVisaoGeralInput,
  _warnings: string[],
): Bloco4Financeiro {
  const { painel, mesAtual, lancFinAnoAnt, ano } = input;
  const empty = (): ComparativoDuplo => emptyComparativo('pc100', 'acumulado', 'moeda');

  const fromIndicator = (ind: { serieMeta?: number[]; serieAnoAnt?: number[] } | null | undefined): ComparativoDuplo =>
    ind ? buildComparativoPonto(ind.serieMeta, ind.serieAnoAnt, mesAtual, 'pc100', 'acumulado', 'moeda') : empty();

  const jurosBase = fromIndicator(painel?.jurosPecIndicador);
  // Marco 1.1.E (Passo 2): override de vsAnoFechado para Juros Pec.
  // Override compensando usePainelConsultorData L2604 que força
  // serieAnoAnt: undefined em _finSoberano.jurosPec — sem isso, o ano-1
  // do Bloco 4 (e por cascata o jurosAnoAnt do DRE) fica null indefinidamente.
  // Fonte oficial: agregaJurosPec sobre financeiro_lancamentos_v2 ano-1
  // (mesma fonte usada em Outras Receitas e Invest Fazenda Pec no Passo 1).
  // Aplica APENAS em Real ano-1 — META segue PC-100 (jurosBase.valor intocado).
  // DRE pega via cascata de bloco4.juros.vsAnoFechado.valor — sem override
  // duplicado no Bloco 3. Camada de compatibilidade histórica, mesmo
  // princípio do Passo 1.
  const jurosAnoAntReal = (lancFinAnoAnt && ano != null)
    ? somaAnualMeses(agregaJurosPec(lancFinAnoAnt, ano - 1))
    : null;
  const juros: ComparativoDuplo = jurosAnoAntReal != null
    ? { ...jurosBase, vsAnoFechado: { valor: jurosAnoAntReal, delta: pctDelta(jurosBase.valor, jurosAnoAntReal) } }
    : jurosBase;

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

  // Marco 1.1.D — BLOCO 1 soberano via grid + extras (Fluxo de Caixa META).
  // Fase 2 DRE: zootComp opcional pluga Receita Pec + Reposição Bovinos
  // por competência zoot. Receita/Deduções/Reposição também carregam ano-1
  // via mesmo agregador com cenario='realizado' (em ZootCompPreload).
  // Marco 1.1.E: lancFinAnoAnt + ano destravam vsAnoFechado de Outras Receitas
  // e Investimento Fazenda Pec via agregadores financeiros oficiais.
  const bloco1 = buildBloco1Macro(
    input.grid, input.extrasGrid, input.mesAtual, input.saldoInicial,
    input.zootComp, input.lancFinAnoAnt, input.ano,
  );
  const bloco2 = buildBloco2Producao(input, warnings);
  const bloco3 = buildBloco3Custos(input, warnings);
  // TODO Marco 1.1.D-secondary: aplicar buildComparativoGrid também ao BLOCO 4
  // (Juros Pec, Amortizações, Invest Pec/Agri, Reposição Bovinos, Dividendos).
  // Por ora continua via PC-100 — pode mostrar valores que não batem com BLOCO 1.
  warnings.push('BLOCO 4 (Financeiro/Capital): ainda via PC-100. Migrar para grade META no Marco 1.1.D-secondary.');
  const bloco4 = buildBloco4Financeiro(input, warnings);
  const bloco3Analise = buildBloco3AnaliseEconomica(input, bloco1, bloco3, bloco4);
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
    bloco3_analiseEconomica: bloco3Analise,
    bloco4_financeiroCapital: bloco4,
    bloco5_movimentacaoRebanho: bloco5,
    loading: false,
    warnings,
  };
}
