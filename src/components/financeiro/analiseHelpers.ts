/**
 * Helpers compartilhados entre blocos da Análise Econômica.
 */
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';

/** macro_custo normalizado */
export const normMacro = (l: FinanceiroLancamento) =>
  (l.macro_custo || '').toLowerCase().trim();

/** tipo_operacao normalizado */
export const normTipo = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').toLowerCase().trim();

/** É saída (tipo_operacao começa com "2") */
export const isSaida = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('2');

/** É entrada (tipo_operacao começa com "1") */
export const isEntrada = (l: FinanceiroLancamento) =>
  (l.tipo_operacao || '').startsWith('1');

/** É Custeio Produtivo */
export const isCusteioProdutivo = (l: FinanceiroLancamento) =>
  normMacro(l) === 'custeio produtivo';

/** É Receita (macro_custo) */
export const isReceitaMacro = (l: FinanceiroLancamento) =>
  normMacro(l) === 'receitas';

/** É Dedução de Receita */
export const isDeducaoReceita = (l: FinanceiroLancamento) =>
  normMacro(l) === 'dedução de receitas';

/** É Amortização Financeira */
export const isAmortizacao = (l: FinanceiroLancamento) =>
  normMacro(l) === 'amortizações financeiras';

/** É Dividendo */
export const isDividendo = (l: FinanceiroLancamento) =>
  normMacro(l) === 'dividendos';

/** É Investimento */
export const isInvestimento = (l: FinanceiroLancamento) =>
  normMacro(l) === 'investimento na fazenda' || normMacro(l) === 'investimento em bovinos';

/** É Investimento em Bovinos (Reposição) — macro OU centro_custo */
export const isReposicaoBovinos = (l: FinanceiroLancamento) => {
  const macro = normMacro(l);
  const centro = (l.centro_custo || '').toLowerCase().trim();
  return macro === 'investimento em bovinos' || centro.includes('reposição') || centro.includes('reposicao');
};

/** É Conciliado */
export const isConciliado = (l: FinanceiroLancamento) =>
  (l.status_transacao || '').toLowerCase().trim() === 'realizado';

/** É Outras Entradas Financeiras */
export const isOutrasEntradas = (l: FinanceiroLancamento) =>
  normMacro(l) === 'outras entradas financeiras';

/** Soma absoluta de valores */
export const somaAbs = (lancs: FinanceiroLancamento[]) =>
  lancs.reduce((s, l) => s + Math.abs(l.valor), 0);
