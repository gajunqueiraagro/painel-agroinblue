/**
 * CPR-D1 (Gabriel 24/11/2026) — o "confirmar" dos vencidos da Contas a Pagar e Receber (lista do "Ver e confirmar"):
 *   - "Ainda vai acontecer" = o vencimento passa para HOJE pelo gravador de hoje (`editarLancamento`), SÓ a coluna do vencimento
 *     (`camposMudados`: nenhum outro campo é regravado); a trilha é a de todo UPDATE do lançamento. O desfazer é o mesmo gesto com o
 *     vencimento de antes.
 *   - "Não vai acontecer" = cancelar pela RPC de hoje (`fn_cancelar_lancamento_auditoria`) com o MOTIVO FIXO abaixo, e o desfazer é a
 *     `fn_lancamento_descancelar` (lote 118490, aplicado no proto em 24/11 com o aprovo do Gabriel), que só aceita esse motivo.
 * PURO.
 */
import type { LancamentoV2, LancamentoV2Form } from '@/hooks/useFinanceiroV2';
import { formDoLancamento } from '@/lib/conciliacao/semClassificacao';

/** O motivo do cancelamento do "Não vai acontecer" — o MESMO texto que a `fn_lancamento_descancelar` (118490) exige para desfazer. */
export const MOTIVO_NAO_VAI_ACONTECER_CPR = 'CPR: vencido não vai acontecer';

/** Por que o "Não vai acontecer" estaria desligado (o ⓘ ao lado); `null` = ligado (o lote 118490 está no banco). */
export const MOTIVO_NAO_VAI_DESLIGADO: string | null = null;

/** O form do "Ainda vai acontecer" (e do desfazer dele): o lançamento como está, com outro vencimento — e o UPDATE leva só ele. */
export function formDoNovoVencimentoCpr(l: LancamentoV2, vencimento: string): LancamentoV2Form {
  return { ...formDoLancamento(l), data_vencimento: vencimento, camposMudados: ['data_vencimento'] };
}
