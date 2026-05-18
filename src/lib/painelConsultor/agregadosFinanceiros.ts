/**
 * Agregadores financeiros oficiais do PC-100.
 *
 * Funções puras Jan→Dez (number[12]) que classificam itens via predicates literais
 * de `src/lib/financeiro/classificacao.ts` (regra única, fonte única).
 *
 * Suporta DOIS cenários através do agregador genérico AggregaSource<T>:
 *   - REALIZADO: input = FinanceiroLancamento[] (filtra status_transacao + tipo_operacao + ano de data_pagamento)
 *   - META: input = SubcentroGrid[] do planejamento (12 valores por linha, sem filtro de data/status)
 *
 * Princípio: UMA regra, UM lugar.
 *   - classificacao.ts permanece o cérebro único (predicates literais por macro/grupo/centro/subcentro/escopo).
 *   - agregadosFinanceiros.ts contém apenas o pipeline de agregação parametrizado por adapter.
 *   - Zero duplicação de regra de classificação entre Realizado e META.
 *
 * Regras oficiais 1T26 (confirmadas, válidas para os DOIS cenários):
 *   - Investimento em Bovinos é separado de Investimento Fazenda.
 *   - Desembolso Pec = CusteioPec com juros + Inv Fazenda Pec
 *     (Inv Bovinos NÃO entra em Desembolso Pec).
 *   - Saídas Totais = DesembolsoPec + DesembolsoAgri + InvBovinos +
 *     Amortizações + Dividendos. Dedução de Receitas é ajuste de
 *     entrada — não entra aqui.
 */
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import {
  isRealizado as isFinRealizado,
  isSaida as isFinSaida,
  isEntrada as isFinEntrada,
  isCusteioProducaoPecuaria,
  isCustoVariavelPecuaria,
  isCustoFixoPecuaria,
  isCusteioProducaoAgricultura,
  isJurosPecuaria,
  isJurosAgricultura,
  isInvestimentoFazendaPecuaria,
  isInvestimentoFazendaAgricultura,
  isReposicaoBovinos,
  isAmortizacao,
  isDividendoOuRetirada,
  isDeducaoReceitas,
  isReceitaPecuaria,
  isReceitaAgricola,
  isOutrasReceitas,
  isEntradaFinanceira,
  isAmortizacaoPecuaria,
  isAmortizacaoAgricultura,
  datePagtoMes,
  datePagtoAno,
  type LancamentoClassificavel,
} from '@/lib/financeiro/classificacao';

type Predicate = (l: LancamentoClassificavel) => boolean;

function emptyMeses(): number[] {
  return Array(12).fill(0);
}

function addArrays(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

// ─── Agregador genérico parametrizado por adapter ─────────────────────

/**
 * Adapter que conecta uma fonte de dados ao pipeline de agregação.
 *
 * - toClassificavel: extrai os campos que os predicates literais inspecionam
 *   (macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio).
 * - passesBase: filtros base do cenário
 *   (Realizado: status realizado + tipo saída + ano de data_pagamento; META: sempre true).
 * - forEachContribution: emite (mesIdx 0..11, valor positivo) para cada contribuição do item
 *   (Realizado: 1 emit por lançamento no datePagtoMes; META: 12 emits, um por mês do grid).
 */
export interface AggregaSource<T> {
  items: T[];
  toClassificavel(item: T): LancamentoClassificavel;
  passesBase(item: T): boolean;
  forEachContribution(item: T, emit: (mesIdx: number, valor: number) => void): void;
}

/**
 * Agrega valores absolutos por mês aplicando o predicate de classificação literal.
 * Pipeline único para qualquer fonte (Realizado/META) — a fonte se encarrega de
 * normalizar o item para o shape que os predicates esperam.
 */
export function agregaPorPredicadoGenerico<T>(
  source: AggregaSource<T>,
  predicate: Predicate,
): number[] {
  const out = emptyMeses();
  for (const item of source.items) {
    if (!source.passesBase(item)) continue;
    if (!predicate(source.toClassificavel(item))) continue;
    source.forEachContribution(item, (mesIdx, valor) => {
      if (mesIdx >= 0 && mesIdx < 12) {
        out[mesIdx] += valor;
      }
    });
  }
  return out;
}

// ─── Adapters ────────────────────────────────────────────────────────

/**
 * Adapter REALIZADO: contribuições a partir de FinanceiroLancamento.
 * Filtros base oficiais: realizado + saída + ano de data_pagamento === ano.
 * Cada lançamento contribui para UM mês (datePagtoMes), com valor = abs(valor).
 */
export function makeRealizadoSource(
  lancFin: FinanceiroLancamento[],
  ano: number,
): AggregaSource<FinanceiroLancamento> {
  return {
    items: lancFin,
    toClassificavel: (l) => l,
    passesBase: (l) => isFinRealizado(l) && isFinSaida(l) && datePagtoAno(l) === ano,
    forEachContribution: (l, emit) => {
      const m = datePagtoMes(l);
      if (m && m >= 1 && m <= 12) {
        emit(m - 1, Math.abs(Number(l.valor) || 0));
      }
    },
  };
}

/**
 * Adapter REALIZADO (entradas): equivalente a makeRealizadoSource mas
 * filtra pelo lado de entrada. Usado por agregadores de entrada do Bloco 1.
 */
export function makeRealizadoSourceEntrada(
  lancFin: FinanceiroLancamento[],
  ano: number,
): AggregaSource<FinanceiroLancamento> {
  return {
    items: lancFin,
    toClassificavel: (l) => l,
    passesBase: (l) => isFinRealizado(l) && isFinEntrada(l) && datePagtoAno(l) === ano,
    forEachContribution: (l, emit) => {
      const m = datePagtoMes(l);
      if (m && m >= 1 && m <= 12) {
        emit(m - 1, Math.abs(Number(l.valor) || 0));
      }
    },
  };
}

/**
 * Adapter META: contribuições a partir de SubcentroGrid (planejamento).
 * NÃO aplica filtro de status/data (META é planejamento, não tem essas dimensões).
 * NÃO aplica filtro isSaida (META já vem classificada por macro_custo via plano de contas).
 * Cada grid contribui para os 12 meses (meses[0..11]), com valor = abs(meses[i]).
 */
export function makeMetaSource(
  grid: SubcentroGrid[],
): AggregaSource<SubcentroGrid> {
  return {
    items: grid,
    toClassificavel: (g) => ({
      tipo_operacao: null,
      macro_custo: g.macro_custo,
      escopo_negocio: g.escopo_negocio,
      grupo_custo: g.grupo_custo,
      centro_custo: g.centro_custo,
      subcentro: g.subcentro,
      valor: 0,            // não usado pelos predicates (são puramente classificatórios por campos enum)
      status_transacao: null,
      data_pagamento: null,
      ano_mes: null,
    }),
    passesBase: (_g) => true,
    forEachContribution: (g, emit) => {
      for (let i = 0; i < 12; i++) {
        emit(i, Math.abs(g.meses[i] || 0));
      }
    },
  };
}

// ─── Função legada (retrocompatibilidade) ─────────────────────────────

/**
 * @deprecated Usar `agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), predicate)`.
 * Mantida para compatibilidade com callers existentes.
 */
export function agregaPorPredicado(
  lancFin: FinanceiroLancamento[],
  ano: number,
  predicate: Predicate,
): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), predicate);
}

// ─── Atômicos REALIZADO ──────────────────────────────────────────────

export function agregaCusteioPecSemJuros(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isCusteioProducaoPecuaria);
}

/** Marco 1.1.E — Custo Variável Pecuária separado (grupo_custo estrito). */
export function agregaCustoVariavelPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isCustoVariavelPecuaria);
}

/** Marco 1.1.E — Custo Fixo Pecuária separado (grupo_custo estrito). */
export function agregaCustoFixoPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isCustoFixoPecuaria);
}

export function agregaJurosPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isJurosPecuaria);
}

export function agregaInvFazendaPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isInvestimentoFazendaPecuaria);
}

export function agregaCusteioAgriSemJuros(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isCusteioProducaoAgricultura);
}

export function agregaJurosAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isJurosAgricultura);
}

export function agregaInvFazendaAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isInvestimentoFazendaAgricultura);
}

export function agregaInvBovinos(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isReposicaoBovinos);
}

export function agregaAmortizacoes(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isAmortizacao);
}

export function agregaDividendos(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isDividendoOuRetirada);
}

// ─── Atômicos REALIZADO — Bloco 1 Executivo ──────────────────────────

export function agregaReceitaPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSourceEntrada(lancFin, ano), isReceitaPecuaria);
}

export function agregaReceitaAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSourceEntrada(lancFin, ano), isReceitaAgricola);
}

export function agregaOutrasReceitas(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSourceEntrada(lancFin, ano), isOutrasReceitas);
}

export function agregaEntradasFinanceiras(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSourceEntrada(lancFin, ano), isEntradaFinanceira);
}

/**
 * Dedução de Receitas — ajuste de entrada. No banco aparece tanto como
 * entrada (sinal de redução) quanto como saída (alguns clientes legados),
 * portanto agregamos os dois lados e somamos.
 */
export function agregaDeducoes(lancFin: FinanceiroLancamento[], ano: number): number[] {
  const entrada = agregaPorPredicadoGenerico(makeRealizadoSourceEntrada(lancFin, ano), isDeducaoReceitas);
  const saida   = agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isDeducaoReceitas);
  return addArrays(entrada, saida);
}

/**
 * Dedução de Receitas — APENAS lado SAÍDA.
 *
 * Espelha exatamente o que o Dashboard (useFluxoCaixa.ts L281+L295) conta:
 * lançamentos com isSaida(l)=true AND isDeducaoReceitas(l)=true.
 *
 * Diferente de agregaDeducoes (que soma entrada + saída — útil para
 * relatórios que precisam do total conceitual incluindo lançamentos
 * legados marcados como entrada com sinal de redução).
 *
 * Use este atômico em agregaSaidasTotais (modelo Caixa puro) para garantir
 * paridade com Dashboard Financeiro.
 */
export function agregaDeducoesSaida(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isDeducaoReceitas);
}

export function agregaAmortizacaoPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isAmortizacaoPecuaria);
}

export function agregaAmortizacaoAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicadoGenerico(makeRealizadoSource(lancFin, ano), isAmortizacaoAgricultura);
}

// ─── Derivados REALIZADO (somas de atômicos) ─────────────────────────

export function agregaCusteioPecComJuros(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return addArrays(
    agregaCusteioPecSemJuros(lancFin, ano),
    agregaJurosPec(lancFin, ano),
  );
}

export function agregaCusteioAgriComJuros(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return addArrays(
    agregaCusteioAgriSemJuros(lancFin, ano),
    agregaJurosAgri(lancFin, ano),
  );
}

/** Desembolso Pec = Custeio Pec com juros + Inv Fazenda Pec (sem Inv Bovinos). */
export function agregaDesembolsoPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return addArrays(
    agregaCusteioPecComJuros(lancFin, ano),
    agregaInvFazendaPec(lancFin, ano),
  );
}

/** Desembolso Agri = Custeio Agri com juros + Inv Fazenda Agri. */
export function agregaDesembolsoAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return addArrays(
    agregaCusteioAgriComJuros(lancFin, ano),
    agregaInvFazendaAgri(lancFin, ano),
  );
}

/**
 * Saídas Totais oficiais — modelo Caixa puro.
 *
 *   DesembolsoPec + DesembolsoAgri + InvBovinos + Amortizações + Dividendos
 *   + Deduções de Receitas (lado saída).
 *
 * Espelho do Dashboard Financeiro (useFluxoCaixa.ts L324):
 *   totalSaidas = deducaoReceitas + desembolso + reposicao + amortizacoes + dividendos
 *
 * Modelo Caixa puro: tudo que SAI do caixa entra em "Saídas Totais".
 * Receita Pec continua bruta (sem desconto de dedução).
 */
export function agregaSaidasTotais(lancFin: FinanceiroLancamento[], ano: number): number[] {
  let out = agregaDesembolsoPec(lancFin, ano);
  out = addArrays(out, agregaDesembolsoAgri(lancFin, ano));
  out = addArrays(out, agregaInvBovinos(lancFin, ano));
  out = addArrays(out, agregaAmortizacoes(lancFin, ano));
  out = addArrays(out, agregaDividendos(lancFin, ano));
  out = addArrays(out, agregaDeducoesSaida(lancFin, ano));
  return out;
}

// ─── Atômicos META ───────────────────────────────────────────────────

export function agregaCusteioPecSemJurosMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isCusteioProducaoPecuaria);
}

export function agregaJurosPecMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isJurosPecuaria);
}

export function agregaInvFazendaPecMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isInvestimentoFazendaPecuaria);
}

export function agregaCusteioAgriSemJurosMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isCusteioProducaoAgricultura);
}

export function agregaJurosAgriMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isJurosAgricultura);
}

export function agregaInvFazendaAgriMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isInvestimentoFazendaAgricultura);
}

export function agregaInvBovinosMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isReposicaoBovinos);
}

export function agregaAmortizacoesMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isAmortizacao);
}

export function agregaDividendosMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isDividendoOuRetirada);
}

// ─── Atômicos META — Bloco 1 Executivo ───────────────────────────────

export function agregaReceitaPecMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isReceitaPecuaria);
}

export function agregaReceitaAgriMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isReceitaAgricola);
}

export function agregaOutrasReceitasMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isOutrasReceitas);
}

export function agregaEntradasFinanceirasMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isEntradaFinanceira);
}

export function agregaDeducoesMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isDeducaoReceitas);
}

/**
 * Versão META. makeMetaSource opera sobre SubcentroGrid (não tem sinal
 * de entrada/saída ambíguo como o realizado legado), portanto idêntico
 * a agregaDeducoesMeta na prática. Existe como apelido semântico para
 * deixar explícito o uso em agregaSaidasTotaisMeta (modelo Caixa puro).
 */
export function agregaDeducoesSaidaMeta(grid: SubcentroGrid[]): number[] {
  return agregaDeducoesMeta(grid);
}

export function agregaAmortizacaoPecMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isAmortizacaoPecuaria);
}

export function agregaAmortizacaoAgriMeta(grid: SubcentroGrid[]): number[] {
  return agregaPorPredicadoGenerico(makeMetaSource(grid), isAmortizacaoAgricultura);
}

// ─── Derivados META (somas de atômicos) ──────────────────────────────

export function agregaCusteioPecComJurosMeta(grid: SubcentroGrid[]): number[] {
  return addArrays(
    agregaCusteioPecSemJurosMeta(grid),
    agregaJurosPecMeta(grid),
  );
}

export function agregaCusteioAgriComJurosMeta(grid: SubcentroGrid[]): number[] {
  return addArrays(
    agregaCusteioAgriSemJurosMeta(grid),
    agregaJurosAgriMeta(grid),
  );
}

/** Desembolso Pec META = Custeio Pec com juros META + Inv Fazenda Pec META. */
export function agregaDesembolsoPecMeta(grid: SubcentroGrid[]): number[] {
  return addArrays(
    agregaCusteioPecComJurosMeta(grid),
    agregaInvFazendaPecMeta(grid),
  );
}

/** Desembolso Agri META = Custeio Agri com juros META + Inv Fazenda Agri META. */
export function agregaDesembolsoAgriMeta(grid: SubcentroGrid[]): number[] {
  return addArrays(
    agregaCusteioAgriComJurosMeta(grid),
    agregaInvFazendaAgriMeta(grid),
  );
}

/**
 * Saídas Totais META — modelo Caixa puro (espelho do agregaSaidasTotais
 * realizado, para o cenário planejado).
 *
 *   DesembolsoPec + DesembolsoAgri + InvBovinos + Amortizações + Dividendos
 *   + Deduções de Receitas META.
 */
export function agregaSaidasTotaisMeta(grid: SubcentroGrid[]): number[] {
  let out = agregaDesembolsoPecMeta(grid);
  out = addArrays(out, agregaDesembolsoAgriMeta(grid));
  out = addArrays(out, agregaInvBovinosMeta(grid));
  out = addArrays(out, agregaAmortizacoesMeta(grid));
  out = addArrays(out, agregaDividendosMeta(grid));
  out = addArrays(out, agregaDeducoesSaidaMeta(grid));
  return out;
}

// ─── Atômicos REALIZADO/META por subcentro (drilldown executivo) ───────
//
// Invariante: para cada mês m,
//   sum(Object.values(porSubcentro).map(s => s.meses[m])) === agregaX(...)[m]
// Filtros base e predicate são IDÊNTICOS aos do agregador escalar
// correspondente (reuso de makeRealizadoSource / makeRealizadoSourceEntrada
// / makeMetaSource + predicates de classificacao.ts).

export interface ComposicaoSubcentro {
  centro_custo: string;
  meses: number[]; // length 12
}

/**
 * Núcleo genérico: extrai composição por subcentro de uma fonte qualquer
 * filtrada por predicate. Retorna Record<subcentro, {centro_custo, meses[12]}>.
 * Lançamentos sem centro/subcentro: IGNORADOS + console.warn. Zero fallback.
 */
export function agregaPorSubcentroGenerico<T>(
  source: AggregaSource<T>,
  predicate: Predicate,
  contextLabel: string,
): Record<string, ComposicaoSubcentro> {
  const out: Record<string, ComposicaoSubcentro> = {};
  for (const item of source.items) {
    if (!source.passesBase(item)) continue;
    const classif = source.toClassificavel(item);
    if (!predicate(classif)) continue;

    const centro = classif.centro_custo;
    const sub = classif.subcentro;
    if (!centro || !sub) {
      console.warn('[' + contextLabel + '] lançamento sem centro/subcentro ignorado');
      continue;
    }

    if (!out[sub]) {
      out[sub] = { centro_custo: centro, meses: new Array(12).fill(0) };
    }
    source.forEachContribution(item, (mesIdx, valor) => {
      out[sub].meses[mesIdx] += valor;
    });
  }
  return out;
}

// ─── Wrappers thin: um par (Real, Meta) por bucket do BlocoResumoExecutivo ───

// — ENTRADAS —

export function agregaReceitaPecPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSourceEntrada(lancFin, ano), isReceitaPecuaria, 'agregaReceitaPecPorSubcentro');
}
export function agregaReceitaPecPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isReceitaPecuaria, 'agregaReceitaPecPorSubcentroMeta');
}

export function agregaReceitaAgriPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSourceEntrada(lancFin, ano), isReceitaAgricola, 'agregaReceitaAgriPorSubcentro');
}
export function agregaReceitaAgriPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isReceitaAgricola, 'agregaReceitaAgriPorSubcentroMeta');
}

export function agregaOutrasReceitasPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSourceEntrada(lancFin, ano), isOutrasReceitas, 'agregaOutrasReceitasPorSubcentro');
}
export function agregaOutrasReceitasPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isOutrasReceitas, 'agregaOutrasReceitasPorSubcentroMeta');
}

export function agregaEntradasFinanceirasPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSourceEntrada(lancFin, ano), isEntradaFinanceira, 'agregaEntradasFinanceirasPorSubcentro');
}
export function agregaEntradasFinanceirasPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isEntradaFinanceira, 'agregaEntradasFinanceirasPorSubcentroMeta');
}

// — SAÍDAS —

export function agregaCusteioPecPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isCusteioProducaoPecuaria, 'agregaCusteioPecPorSubcentro');
}
export function agregaCusteioPecPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isCusteioProducaoPecuaria, 'agregaCusteioPecPorSubcentroMeta');
}

export function agregaCusteioAgriPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isCusteioProducaoAgricultura, 'agregaCusteioAgriPorSubcentro');
}
export function agregaCusteioAgriPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isCusteioProducaoAgricultura, 'agregaCusteioAgriPorSubcentroMeta');
}

export function agregaJurosPecPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isJurosPecuaria, 'agregaJurosPecPorSubcentro');
}
export function agregaJurosPecPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isJurosPecuaria, 'agregaJurosPecPorSubcentroMeta');
}

export function agregaJurosAgriPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isJurosAgricultura, 'agregaJurosAgriPorSubcentro');
}
export function agregaJurosAgriPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isJurosAgricultura, 'agregaJurosAgriPorSubcentroMeta');
}

export function agregaInvFazendaPecPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isInvestimentoFazendaPecuaria, 'agregaInvFazendaPecPorSubcentro');
}
export function agregaInvFazendaPecPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isInvestimentoFazendaPecuaria, 'agregaInvFazendaPecPorSubcentroMeta');
}

export function agregaInvFazendaAgriPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isInvestimentoFazendaAgricultura, 'agregaInvFazendaAgriPorSubcentro');
}
export function agregaInvFazendaAgriPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isInvestimentoFazendaAgricultura, 'agregaInvFazendaAgriPorSubcentroMeta');
}

export function agregaInvBovinosPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isReposicaoBovinos, 'agregaInvBovinosPorSubcentro');
}
export function agregaInvBovinosPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isReposicaoBovinos, 'agregaInvBovinosPorSubcentroMeta');
}

export function agregaAmortizacaoPecPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isAmortizacaoPecuaria, 'agregaAmortizacaoPecPorSubcentro');
}
export function agregaAmortizacaoPecPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isAmortizacaoPecuaria, 'agregaAmortizacaoPecPorSubcentroMeta');
}

export function agregaAmortizacaoAgriPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isAmortizacaoAgricultura, 'agregaAmortizacaoAgriPorSubcentro');
}
export function agregaAmortizacaoAgriPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isAmortizacaoAgricultura, 'agregaAmortizacaoAgriPorSubcentroMeta');
}

export function agregaDividendosPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isDividendoOuRetirada, 'agregaDividendosPorSubcentro');
}
export function agregaDividendosPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isDividendoOuRetirada, 'agregaDividendosPorSubcentroMeta');
}

export function agregaDeducoesPorSubcentro(lancFin: FinanceiroLancamento[], ano: number) {
  return agregaPorSubcentroGenerico(makeRealizadoSource(lancFin, ano), isDeducaoReceitas, 'agregaDeducoesPorSubcentro');
}
export function agregaDeducoesPorSubcentroMeta(grid: SubcentroGrid[]) {
  return agregaPorSubcentroGenerico(makeMetaSource(grid), isDeducaoReceitas, 'agregaDeducoesPorSubcentroMeta');
}
