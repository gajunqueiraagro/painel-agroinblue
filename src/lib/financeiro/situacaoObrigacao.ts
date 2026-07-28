// PR-FIN-DATAS-02 — Fonte ÚNICA, pura e determinística da SITUAÇÃO TEMPORAL de uma
//   obrigação financeira (eixo B: situação da obrigação), derivada de vencimento × liquidação
//   × data de referência. NÃO substitui status_transacao (eixo A: planejamento/maturidade),
//   nem conciliação (conciliado_em) nem cancelamento (cancelado). Sem consumidores nesta PR.
//
//   Núcleo 100% civil: opera SOMENTE com strings 'YYYY-MM-DD' validadas e compara por ordem
//   LEXICAL (para ISO zero-padded, lexical == cronológico). NÃO usa Date, date-fns, Date.now,
//   relógio do sistema nem timezone → determinístico e independente de fuso/máquina.
//   Liquidação parcial, cancelamento/estorno, metas e wrapper de "hoje" estão FORA de escopo.

/** Eixo B — situação temporal da obrigação (union fechada). */
export type SituacaoObrigacaoFinanceira =
  | 'sem_vencimento'
  | 'a_vencer'
  | 'vencido'
  | 'liquidado';

/**
 * Entrada nomeada (evita inversão acidental entre datas). Domínio usa `dataLiquidacao`
 * (o consumidor futuro mapeia data_pagamento → dataLiquidacao; a coluna do banco NÃO é
 * renomeada). Datas em 'YYYY-MM-DD'. `dataReferencia` é obrigatória e explícita.
 */
export interface DerivarSituacaoObrigacaoFinanceiraInput {
  dataVencimento?: string | null;
  dataLiquidacao?: string | null;
  dataReferencia: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida uma data civil ISO 'YYYY-MM-DD' SEM construir Date (evita interpretação UTC/local):
 *   formato exato, mês 01-12, dia compatível com o mês, fevereiro por ano bissexto
 *   (÷4, exceto ÷100, salvo ÷400). Ano 0000 é rejeitado (aceita 0001..9999).
 */
function isDataCivilValida(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const ano = Number(s.slice(0, 4));
  const mes = Number(s.slice(5, 7));
  const dia = Number(s.slice(8, 10));
  if (ano < 1) return false;                 // rejeita ano 0000
  if (mes < 1 || mes > 12) return false;
  if (dia < 1) return false;
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasNoMes[mes - 1];
}

/**
 * Normaliza uma data OPCIONAL: undefined/null/''/só-espaços → null; caso contrário aplica
 * trim e devolve a string (a validação de formato/calendário é responsabilidade do chamador
 * — aqui só distingue "ausente" de "presente"). Privado (não exportado).
 */
function normalizarDataOpcional(v?: string | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * Deriva a situação temporal da obrigação. Ordem interna obrigatória:
 *   (1) valida o objeto de entrada; (2) normaliza vencimento; (3) normaliza liquidação;
 *   (4) valida dataReferencia; (5) valida vencimento se presente; (6) valida liquidação se
 *   presente; (7) aplica precedência; (8) retorna a union.
 *
 * Precedência: liquidação presente → 'liquidado'; senão sem vencimento → 'sem_vencimento';
 *   senão vencimento >= referência → 'a_vencer'; senão → 'vencido'. Obrigação que vence NO
 *   dia da referência é 'a_vencer' (vencido só a partir do dia seguinte).
 *
 * Entradas inválidas (não vazias e fora de 'YYYY-MM-DD' civil) lançam Error — nunca são
 * silenciadas como 'sem_vencimento'. A validação ocorre ANTES da precedência (uma liquidação
 * válida não mascara um vencimento inválido).
 */
export function derivarSituacaoObrigacaoFinanceira(
  input: DerivarSituacaoObrigacaoFinanceiraInput,
): SituacaoObrigacaoFinanceira {
  // (1) objeto de entrada — defesa em runtime mesmo com TS proibindo
  if (input === undefined || input === null) {
    throw new Error('Entrada inválida: objeto de parâmetros ausente.');
  }

  // (2)(3) normalização de datas opcionais
  const vencimento = normalizarDataOpcional(input.dataVencimento);
  const liquidacao = normalizarDataOpcional(input.dataLiquidacao);

  // (4) data de referência — obrigatória e válida
  const referencia = typeof input.dataReferencia === 'string' ? input.dataReferencia.trim() : '';
  if (referencia === '' || !isDataCivilValida(referencia)) {
    throw new Error('Data de referência inválida: esperado YYYY-MM-DD.');
  }

  // (5)(6) validar as presentes ANTES de aplicar precedência
  if (vencimento !== null && !isDataCivilValida(vencimento)) {
    throw new Error('Data de vencimento inválida: esperado YYYY-MM-DD.');
  }
  if (liquidacao !== null && !isDataCivilValida(liquidacao)) {
    throw new Error('Data de liquidação inválida: esperado YYYY-MM-DD.');
  }

  // (7)(8) precedência — comparação LEXICAL de datas civis validadas
  if (liquidacao !== null) return 'liquidado';
  if (vencimento === null) return 'sem_vencimento';
  return vencimento >= referencia ? 'a_vencer' : 'vencido';
}
