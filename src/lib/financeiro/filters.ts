/**
 * Filtros financeiros compartilhados — FONTE ÚNICA DE VERDADE.
 *
 * Usados pelo Dashboard Financeiro E pelo card Financeiro do Resumo.
 * Qualquer alteração aqui impacta ambos os módulos.
 *
 * Regras:
 * - Realizado: status_transacao (lowercase, trimmed) === 'realizado'
 * - Entrada: tipo_operacao começa com '1'
 * - Saída: tipo_operacao começa com '2'
 * - Data base: data_pagamento (YYYY-MM-DD ou YYYY-MM)
 *
 * Nomenclatura oficial: realizado | agendado | programado | meta
 */

export interface FinanceiroLancamentoBase {
  status_transacao: string | null;
  tipo_operacao: string | null;
  data_pagamento: string | null;
  valor: number;
  produto?: string | null;
}

const norm = (v: string | null | undefined) => (v || '').toLowerCase().trim();

/** Normaliza tipo_operacao removendo espaços, hífens e traços especiais */
const normTipo = (v: string | null | undefined): string =>
  norm(v).replace(/[\s\-–—]/g, '');

/** Lançamento realizado (status_transacao = 'realizado')? */
export const isRealizado = (l: FinanceiroLancamentoBase): boolean =>
  norm(l.status_transacao) === 'realizado';

/** @deprecated Use isRealizado. Alias mantido para compatibilidade. */
export const isConciliado = isRealizado;

/**
 * Lançamento de entrada — somente tipo_operacao 1*
 * 3-Transferência é movimentação interna e NÃO entra.
 */
export const isEntradaFinanceira = (l: FinanceiroLancamentoBase): boolean => {
  const tipo = normTipo(l.tipo_operacao);
  return tipo.startsWith('1') || tipo.includes('entrada');
};

/**
 * Lançamento de saída — somente tipo_operacao 2*
 * 3-Transferência é movimentação interna e NÃO entra.
 */
export const isSaidaFinanceira = (l: FinanceiroLancamentoBase): boolean => {
  const tipo = normTipo(l.tipo_operacao);
  return tipo.startsWith('2') || tipo.includes('saida') || tipo.includes('saída');
};

/** Extrai ano-mês (YYYY-MM) da data_pagamento */
export const datePagtoAnoMes = (l: FinanceiroLancamentoBase): string | null => {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
};

/**
 * Calcula entradas, saídas e saldo a partir de lançamentos financeiros brutos.
 *
 * @param lancamentos Lista de lançamentos (já filtrada por fazenda se necessário)
 * @param ano Ano de referência (ex: 2026)
 * @param mesAte Mês limite (1-12), filtra até esse mês inclusive
 * @returns Objeto com totais e metadados de auditoria
 */
export function calcFinanceiroFromLancamentos(
  lancamentos: FinanceiroLancamentoBase[],
  ano: number,
  mesAte: number,
) {
  const anoStr = String(ano);
  const mesesRange: string[] = [];
  for (let m = 1; m <= mesAte; m++) {
    mesesRange.push(`${anoStr}-${String(m).padStart(2, '0')}`);
  }

  // Filtrar: conciliado + data_pagamento dentro do período
  const conciliados = lancamentos.filter(l => {
    if (!isRealizado(l)) return false;
    const am = datePagtoAnoMes(l);
    if (!am) return false;
    return mesesRange.includes(am);
  });

  let totalEntradas = 0;
  let totalSaidas = 0;
  let qtdEntradas = 0;
  let qtdSaidas = 0;

  for (const l of conciliados) {
    if (isEntradaFinanceira(l)) {
      totalEntradas += Math.abs(l.valor);
      qtdEntradas++;
    } else if (isSaidaFinanceira(l)) {
      totalSaidas += Math.abs(l.valor);
      qtdSaidas++;
    }
  }

  const saldo = totalEntradas - totalSaidas;

  return {
    totalEntradas,
    totalSaidas,
    saldo,
    qtdLancamentos: conciliados.length,
    qtdEntradas,
    qtdSaidas,
    // Auditoria
    audit: {
      base: 'financeiro_lancamentos_v2',
      filtroStatus: 'realizado',
      filtroData: 'data_pagamento',
      classificacao: 'tipo_operacao: 1*=entrada, 2*=saída, 3*=transferência (resgate=entrada, aplicação=saída)',
      periodo: `${mesesRange[0]} a ${mesesRange[mesesRange.length - 1]}`,
      totalLancamentosFiltrados: conciliados.length,
    },
  };
}
