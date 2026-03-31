/**
 * Cálculos econômicos / valor — camada central de indicadores financeiros do rebanho.
 *
 * IMPORTANTE: Este módulo trata da lógica econômica vinculada à operação pecuária
 * (competência do rebanho). NÃO representa o módulo financeiro de caixa futuro,
 * que terá sua própria camada de cálculo.
 *
 * Todas as funções são puras (sem side-effects, sem hooks React).
 */

import type { Lancamento, SaldoInicial } from '@/types/cattle';

// ---------------------------------------------------------------------------
// 1. calcArrobas — Conversão de peso para arrobas por lançamento
// ---------------------------------------------------------------------------

/**
 * Calcula o total de arrobas de um lançamento.
 *
 * Regras por tipo de movimentação:
 *
 * - **Abate**: peso de carcaça (kg) / 15 × quantidade
 *   Usa exclusivamente o peso de carcaça. Não usa pesoMedioArrobas como fallback
 *   porque o rendimento de carcaça é fundamental para o cálculo correto.
 *
 * - **Venda em pé**: peso vivo (kg) / 30 × quantidade
 *   Fallback: pesoMedioArrobas × quantidade (se peso em kg não informado)
 *
 * - **Consumo**: mesma regra de venda em pé (peso vivo / 30)
 *
 * - **Transferência saída**: mesma regra de venda em pé (peso vivo / 30)
 *
 * - **Demais tipos**: retorna null (não aplicável)
 *
 * @returns Total de arrobas ou null se dados insuficientes para o tipo
 */
export function calcArrobas(l: Lancamento): number | null {
  // Abate: carcaça / 15
  if (l.tipo === 'abate') {
    if (l.pesoCarcacaKg && l.pesoCarcacaKg > 0) {
      return (l.pesoCarcacaKg / 15) * l.quantidade;
    }
    return null; // Abate sem peso de carcaça = dado insuficiente
  }

  // Venda, Consumo, Transferência saída: peso vivo / 30
  if (l.tipo === 'venda' || l.tipo === 'consumo' || l.tipo === 'transferencia_saida') {
    if (l.pesoMedioKg && l.pesoMedioKg > 0) {
      return (l.pesoMedioKg / 30) * l.quantidade;
    }
    // Fallback: pesoMedioArrobas direto
    if (l.pesoMedioArrobas && l.pesoMedioArrobas > 0) {
      return l.pesoMedioArrobas * l.quantidade;
    }
    return null; // Sem base de peso
  }

  // Compra, Transferência entrada, Nascimento, Morte: peso vivo / 30
  if (l.tipo === 'compra' || l.tipo === 'transferencia_entrada' || l.tipo === 'nascimento' || l.tipo === 'morte') {
    if (l.pesoMedioKg && l.pesoMedioKg > 0) {
      return (l.pesoMedioKg / 30) * l.quantidade;
    }
    if (l.pesoMedioArrobas && l.pesoMedioArrobas > 0) {
      return l.pesoMedioArrobas * l.quantidade;
    }
    return null;
  }

  // Demais tipos (reclassificação)
  return null;
}

/**
 * Versão safe que retorna 0 em vez de null — para somatórios.
 */
export function calcArrobasSafe(l: Lancamento): number {
  return calcArrobas(l) ?? 0;
}

// ---------------------------------------------------------------------------
// 2. calcValorTotal — Valor total líquido efetivo de um lançamento
// ---------------------------------------------------------------------------

/**
 * Calcula o valor total líquido de um lançamento.
 *
 * Hierarquia de fontes:
 *
 * 1. **valor_total informado** (campo `valorTotal`):
 *    Se presente e > 0, é tratado como FONTE OFICIAL — representa o valor
 *    efetivamente recebido/pago na operação, já conferido pelo usuário.
 *
 * 2. **Valor calculado** (fallback quando valor_total não informado):
 *    - Abate: (arrobas × precoArroba) + bônus - descontos
 *      Bônus = bonusPrecoce + bonusQualidade + bonusListaTrace
 *      Descontos = descontoQualidade + descontoFunrural + outrosDescontos
 *    - Venda/Compra/Consumo/Transf.Saída: (arrobas × precoArroba) + acréscimos - deduções
 *    - Fallback final: precoMedioCabeca × quantidade
 *
 * 3. **Valor total final líquido**:
 *    O resultado desta função é o valor efetivo da operação.
 *    Para obter R$/líq @, use: calcValorTotal(l) / calcArrobas(l)
 *
 * @returns Valor total líquido ou 0 se sem dados
 */
export function calcValorTotal(l: Lancamento): number {
  // Fonte oficial: valor informado pelo usuário
  if (l.valorTotal && l.valorTotal > 0) return l.valorTotal;

  // Fallback calculado para abate
  if (l.tipo === 'abate' && l.precoArroba && l.pesoCarcacaKg) {
    const arrobas = (l.pesoCarcacaKg / 15) * l.quantidade;
    const bruto = arrobas * l.precoArroba;
    const bonus = (l.bonusPrecoce ?? 0) + (l.bonusQualidade ?? 0) + (l.bonusListaTrace ?? 0);
    const desc = (l.descontoQualidade ?? 0) + (l.descontoFunrural ?? 0) + (l.outrosDescontos ?? 0);
    return bruto + bonus - desc;
  }

  // Fallback calculado para venda, compra, consumo, transferência saída
  if (['venda', 'compra', 'consumo', 'transferencia_saida'].includes(l.tipo) && l.precoArroba && l.pesoMedioKg) {
    const arrobas = (l.pesoMedioKg / 30) * l.quantidade;
    const bruto = arrobas * l.precoArroba;
    return bruto + (l.acrescimos ?? 0) - (l.deducoes ?? 0);
  }

  // Fallback final: preço por cabeça
  if (l.precoMedioCabeca) return l.precoMedioCabeca * l.quantidade;

  return 0;
}

/**
 * Calcula o preço líquido por arroba.
 * R$/líq @ = valor total final / total arrobas
 *
 * @returns Preço líquido por arroba ou null se sem arrobas
 */
export function calcPrecoLiquidoArroba(l: Lancamento): number | null {
  const arrobas = calcArrobas(l);
  if (!arrobas || arrobas <= 0) return null;
  const valor = calcValorTotal(l);
  if (!valor) return null;
  return valor / arrobas;
}

// ---------------------------------------------------------------------------
// 3. Indicadores consolidados de um lançamento (para tabelas)
// ---------------------------------------------------------------------------

/**
 * Calcula todos os indicadores econômicos de um lançamento de uma vez.
 * Usado pelas tabelas de movimentações financeiras.
 *
 * NOTA: Esta é lógica econômica/competência do rebanho, não módulo financeiro de caixa.
 */
export function calcIndicadoresLancamento(l: Lancamento) {
  const pesoVivo = l.pesoMedioKg ?? 0;
  const pesoCarcaca = l.pesoCarcacaKg ?? 0;
  const qtd = l.quantidade;
  const isAbate = l.tipo === 'abate';

  const pesoArroba = isAbate
    ? (pesoCarcaca > 0 ? pesoCarcaca / 15 : 0)
    : (pesoVivo > 0 ? pesoVivo / 30 : 0);

  const pesoTotalKg = pesoVivo * qtd;
  const pesoTotalArrobas = pesoArroba * qtd;

  const rendimento = isAbate && pesoVivo > 0 && pesoCarcaca > 0
    ? (pesoCarcaca / pesoVivo) * 100
    : 0;

  const valorFinal = calcValorTotal(l);

  const liqArroba = pesoTotalArrobas > 0 ? valorFinal / pesoTotalArrobas : 0;
  const liqCabeca = qtd > 0 ? valorFinal / qtd : 0;
  const liqKg = pesoTotalKg > 0 ? valorFinal / pesoTotalKg : 0;

  return { pesoArroba, pesoTotalArrobas, pesoTotalKg, rendimento, valorFinal, liqArroba, liqCabeca, liqKg };
}

// ---------------------------------------------------------------------------
// 4. calcArrobasIniciais — Base de arrobas do saldo inicial
// ---------------------------------------------------------------------------

/**
 * Calcula o total de arrobas do saldo inicial de um ano.
 *
 * Fórmula: Σ(quantidade × pesoMedioKg / 30) para cada registro de saldo inicial.
 * Peso vivo dividido por 30 para converter em arrobas (animal vivo).
 *
 * @returns Total de arrobas ou 0 se sem dados de peso
 */
export function calcArrobasIniciais(saldosIniciais: SaldoInicial[], ano: number): number {
  return saldosIniciais
    .filter(s => s.ano === ano)
    .reduce((sum, s) => sum + s.quantidade * ((s.pesoMedioKg || 0) / 30), 0);
}

// ---------------------------------------------------------------------------
// 5. calcDesfrute — Indicadores de desfrute
// ---------------------------------------------------------------------------

/**
 * Tipos de movimentação que compõem o desfrute.
 *
 * - **Escopo Global**: abate + venda + consumo
 *   Ignora transferências internas pois o animal permanece no sistema global.
 *
 * - **Escopo Fazenda**: abate + venda + consumo + transferência saída
 *   Inclui transferências de saída porque o animal sai da fazenda em questão,
 *   mesmo que permaneça no sistema global.
 */
export const TIPOS_DESFRUTE_GLOBAL = ['abate', 'venda', 'consumo'] as const;
export const TIPOS_DESFRUTE_FAZENDA = ['abate', 'venda', 'consumo', 'transferencia_saida'] as const;

export const TIPOS_DESFRUTE_LABELS: Record<string, string> = {
  abate: 'Abate',
  venda: 'Venda em Pé',
  consumo: 'Consumo',
  transferencia_saida: 'Transf. Saída',
};

/**
 * Calcula o percentual de desfrute em cabeças.
 *
 * % Desfrute (cab) = totalDesfrutado / saldoInicialAno × 100
 *
 * @param totalDesfrutado - Total de cabeças desfrutadas no período
 * @param saldoInicialAno - Saldo inicial de cabeças no início do ano
 * @returns Percentual de desfrute ou null se saldo inicial = 0
 */
export function calcDesfrute(totalDesfrutado: number, saldoInicialAno: number): number | null {
  if (saldoInicialAno <= 0) return null;
  return (totalDesfrutado / saldoInicialAno) * 100;
}

/**
 * Calcula o percentual de desfrute em arrobas.
 *
 * % Desfrute (@) = arrobasDesfrutadas / arrobasIniciais × 100
 *
 * @param arrobasDesfrutadas - Total de arrobas desfrutadas no período
 * @param arrobasIniciais - Arrobas do saldo inicial (via calcArrobasIniciais)
 * @returns Percentual de desfrute ou null se arrobas iniciais = 0
 */
export function calcDesfruteArrobas(arrobasDesfrutadas: number, arrobasIniciais: number): number | null {
  if (arrobasIniciais <= 0) return null;
  return (arrobasDesfrutadas / arrobasIniciais) * 100;
}

// ---------------------------------------------------------------------------
// 6. calcGMD — Ganho Médio Diário
// ---------------------------------------------------------------------------

/**
 * Calcula o Ganho Médio Diário (GMD).
 *
 * GMD = (pesoFinal - pesoInicial - pesoEntradas + pesoSaidas) / (dias × cabMedia)
 *
 * Travas de segurança (retorna null se):
 * - pesoFinal <= 0 (dado insuficiente)
 * - pesoInicial <= 0 (dado insuficiente)
 * - dias <= 0 (período inválido)
 * - cabMedia <= 0 (rebanho vazio)
 * - resultado > 3.0 kg/dia (fora da faixa razoável para bovinos em pastejo)
 *
 * NOTA: Valores negativos são permitidos (indicam perda de peso no período).
 *
 * @returns GMD em kg/dia ou null se dados insuficientes ou resultado fora da faixa
 */
export function calcGMD(
  pesoFinal: number,
  pesoInicial: number,
  pesoEntradas: number,
  pesoSaidas: number,
  dias: number,
  cabMedia: number,
): number | null {
  if (pesoFinal <= 0) return null;
  if (pesoInicial <= 0) return null;
  if (dias <= 0) return null;
  if (cabMedia <= 0) return null;

  const gmd = (pesoFinal - pesoInicial - pesoEntradas + pesoSaidas) / (dias * cabMedia);

  // Faixa de segurança operacional (limite superior)
  if (gmd > 3.0) return null;

  return gmd;
}
