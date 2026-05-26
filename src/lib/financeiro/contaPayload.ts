/**
 * contaPayload — helper soberano para montar o par
 * (conta_bancaria_id, conta_destino_id) em INSERTs/UPDATEs de
 * financeiro_lancamentos_v2 segundo a convenção oficial:
 *
 *   1-Entradas        → conta_destino_id (onde dinheiro chega)
 *   2-Saídas          → conta_bancaria_id (de onde dinheiro sai)
 *   3-Transferências  → AMBOS preenchidos (origem + destino)
 *
 * REGRA INVIOLÁVEL (PR-K): qualquer novo código que faça INSERT em
 * `financeiro_lancamentos_v2` deve montar conta_*_id via este helper.
 * Proibido construir o par inline. Veja PR-K para o histórico.
 *
 * Strings de tipo_operacao EXATAS — plural com S, acento em Saídas.
 */

export type TipoOperacaoFinanceira = '1-Entradas' | '2-Saídas' | '3-Transferências';

export interface ContaPayload {
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
}

/**
 * Monta o par (conta_bancaria_id, conta_destino_id) para um lançamento.
 *
 * - `tipo`: operação financeira (entrada/saída/transferência).
 * - `contaPrincipalId`: a conta única para entrada/saída; a conta de
 *   ORIGEM para transferência.
 * - `contaTransferenciaDestinoId`: só usado quando `tipo === '3-Transferências'`.
 *   Ignorado para os outros tipos.
 */
export function montarPayloadConta(
  tipo: TipoOperacaoFinanceira,
  contaPrincipalId: string | null,
  contaTransferenciaDestinoId?: string | null,
): ContaPayload {
  if (tipo === '3-Transferências') {
    return {
      conta_bancaria_id: contaPrincipalId,
      conta_destino_id: contaTransferenciaDestinoId ?? null,
    };
  }
  if (tipo === '1-Entradas') {
    return {
      conta_bancaria_id: null,
      conta_destino_id: contaPrincipalId,
    };
  }
  // 2-Saídas
  return {
    conta_bancaria_id: contaPrincipalId,
    conta_destino_id: null,
  };
}
