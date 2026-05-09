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
  isCusteioProducaoPecuaria,
  isCusteioProducaoAgricultura,
  isJurosPecuaria,
  isJurosAgricultura,
  isInvestimentoFazendaPecuaria,
  isInvestimentoFazendaAgricultura,
  isReposicaoBovinos,
  isAmortizacao,
  isDividendoOuRetirada,
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
 * Saídas Totais oficiais 1T26:
 *   DesembolsoPec + DesembolsoAgri + InvBovinos + Amortizações + Dividendos.
 * Dedução de Receitas é ajuste de entrada — NÃO entra.
 */
export function agregaSaidasTotais(lancFin: FinanceiroLancamento[], ano: number): number[] {
  let out = agregaDesembolsoPec(lancFin, ano);
  out = addArrays(out, agregaDesembolsoAgri(lancFin, ano));
  out = addArrays(out, agregaInvBovinos(lancFin, ano));
  out = addArrays(out, agregaAmortizacoes(lancFin, ano));
  out = addArrays(out, agregaDividendos(lancFin, ano));
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
 * Saídas Totais META 1T26: mesma fórmula do Realizado, sobre planejamento.
 *   DesembolsoPec + DesembolsoAgri + InvBovinos + Amortizações + Dividendos.
 */
export function agregaSaidasTotaisMeta(grid: SubcentroGrid[]): number[] {
  let out = agregaDesembolsoPecMeta(grid);
  out = addArrays(out, agregaDesembolsoAgriMeta(grid));
  out = addArrays(out, agregaInvBovinosMeta(grid));
  out = addArrays(out, agregaAmortizacoesMeta(grid));
  out = addArrays(out, agregaDividendosMeta(grid));
  return out;
}
