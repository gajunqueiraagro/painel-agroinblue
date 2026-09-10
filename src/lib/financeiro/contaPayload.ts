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
import { isTransferenciaTipo } from './v2Transferencia';

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

/**
 * O INVERSO DE `montarPayloadConta`: qual conta um lançamento MOSTRA — PR-EXPORT-FINANCEIRO-03.
 *
 * ⚠ ESTE MÓDULO SÓ SABIA ESCREVER, e por isso quem lia inventava. A convenção acima diz que
 * a entrada guarda a conta em `conta_destino_id`; quem lesse `conta_bancaria_id` direto veria
 * vazio em toda entrada — foi exatamente o que aconteceu na exportação do Financeiro, onde
 * 246 das 262 entradas de 2026 do NJ saíram sem conta. A regra de leitura mora aqui, ao lado
 * da de escrita, para as duas não poderem divergir.
 *
 * ⚠ TRANSFERÊNCIA TEM DUAS CONTAS E É ASSIM QUE ELA DEVE APARECER. Escolher uma das pontas
 * seria esconder metade do fato: "saiu do Itaú" e "entrou no Sicredi" são a mesma linha, e
 * quem confere extrato precisa das duas. Quem chama decide como junta os nomes.
 *
 * ⚠ DEVOLVE ID, NUNCA NOME. Este módulo não conhece o cadastro de contas — e não deve: o
 * chamador tem o mapa e sabe o que fazer quando o id não está nele (célula vazia, jamais o
 * UUID).
 */
export type ContasExibidas =
  | { forma: 'unica'; contaId: string | null }
  | { forma: 'par'; origemId: string | null; destinoId: string | null };

export function contasExibidasDoLancamento(
  tipo: string | null | undefined,
  contaBancariaId: string | null | undefined,
  contaDestinoId: string | null | undefined,
): ContasExibidas {
  if (isTransferenciaTipo(tipo)) {
    return { forma: 'par', origemId: contaBancariaId ?? null, destinoId: contaDestinoId ?? null };
  }
  if ((tipo || '').trim() === '1-Entradas') {
    /* ⚠ O FALLBACK NÃO É ZELO EXCESSIVO: 25 das 262 entradas de 2026 do NJ têm
       `conta_bancaria_id` e não `conta_destino_id` — linhas antigas, gravadas antes de o
       helper existir. Sem ele, essas 25 sairiam vazias por fidelidade a uma convenção que
       elas nunca seguiram. */
    return { forma: 'unica', contaId: contaDestinoId ?? contaBancariaId ?? null };
  }
  return { forma: 'unica', contaId: contaBancariaId ?? null };
}
