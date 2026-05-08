/**
 * Agregadores financeiros oficiais do PC-100 (Etapa 2A).
 *
 * Funções puras Jan→Dez (number[12]) sobre `lancFin: FinanceiroLancamento[]`.
 * NÃO chamam Supabase, NÃO usam React, NÃO duplicam fonte:
 *   - Filtro base: status_transacao='realizado' + data_pagamento.ano = ano
 *   - Classificação: helpers literais de src/lib/financeiro/classificacao.ts
 *     (regra oficial por grupo_custo / macro_custo, não por catFluxo)
 *   - Acumulador: Σ Math.abs(valor)
 *
 * Não consumido por nenhum componente nesta etapa — preparação para 2B.
 *
 * Regras oficiais 1T26 (confirmadas):
 *   - Investimento em Bovinos é separado de Investimento Fazenda.
 *   - Desembolso Pec = CusteioPec com juros + Inv Fazenda Pec
 *     (Inv Bovinos NÃO entra em Desembolso Pec).
 *   - Saídas Totais = DesembolsoPec + DesembolsoAgri + InvBovinos +
 *     Amortizações + Dividendos. Dedução de Receitas é ajuste de
 *     entrada — não entra aqui.
 */
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
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
} from '@/lib/financeiro/classificacao';

type Predicate = (l: FinanceiroLancamento) => boolean;

function emptyMeses(): number[] {
  return Array(12).fill(0);
}

function addArrays(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

/**
 * Soma valores absolutos de lançamentos que satisfazem `predicate`,
 * agrupados por mês de `data_pagamento`. Aplica filtros base de saída
 * realizada do ano informado.
 */
export function agregaPorPredicado(
  lancFin: FinanceiroLancamento[],
  ano: number,
  predicate: Predicate,
): number[] {
  const out = emptyMeses();
  for (const l of lancFin) {
    if (!isFinRealizado(l)) continue;
    if (!isFinSaida(l)) continue;
    if (datePagtoAno(l) !== ano) continue;
    if (!predicate(l)) continue;
    const m = datePagtoMes(l);
    if (m && m >= 1 && m <= 12) {
      out[m - 1] += Math.abs(Number(l.valor) || 0);
    }
  }
  return out;
}

// ─── Atômicos (1 helper literal por bucket) ──────────────────────────

export function agregaCusteioPecSemJuros(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isCusteioProducaoPecuaria);
}

export function agregaJurosPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isJurosPecuaria);
}

export function agregaInvFazendaPec(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isInvestimentoFazendaPecuaria);
}

export function agregaCusteioAgriSemJuros(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isCusteioProducaoAgricultura);
}

export function agregaJurosAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isJurosAgricultura);
}

export function agregaInvFazendaAgri(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isInvestimentoFazendaAgricultura);
}

export function agregaInvBovinos(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isReposicaoBovinos);
}

export function agregaAmortizacoes(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isAmortizacao);
}

export function agregaDividendos(lancFin: FinanceiroLancamento[], ano: number): number[] {
  return agregaPorPredicado(lancFin, ano, isDividendoOuRetirada);
}

// ─── Derivados (somas de atômicos) ───────────────────────────────────

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
