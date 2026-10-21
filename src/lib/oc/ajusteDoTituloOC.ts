/**
 * OC-CORRECOES-01 C1 · OC-TITULO-AJUSTAR-01 — o TITULO DE OC EM ABERTO no modal do lancamento (Gabriel 21/10: o vencimento do
 * Receb. 3/3 da OC 0731374f nao mudava). Vencimento, conta e classificacao se ajustam no proprio modal enquanto o titulo esta' em
 * aberto (previsto | programado | agendado) e sem conciliacao; vao PRIMEIRO por `oc_titulo_ajustar` (lancamento + parte + parcela
 * da programacao + compromisso de parcela unica, com trilha na OC) e depois o gravador de sempre leva o resto (e os mesmos valores).
 * O valor segue a regra da OC (muda pela OC ou parcelando). Funcoes puras: a tela so' as chama.
 */

export const STATUS_DO_TITULO_EM_ABERTO: readonly string[] = ['previsto', 'programado', 'agendado'];

/** O titulo de OC se ajusta no modal? (em aberto e sem vinculo vivo com extrato) */
export function tituloOCAjustavel(status: string | null | undefined, casadoComExtrato: boolean): boolean {
  return !casadoComExtrato && STATUS_DO_TITULO_EM_ABERTO.includes((status ?? '').toLowerCase());
}

/** Por que o vencimento/classificacao do titulo de OC esta' travado, e onde mudar (nulo = nao esta'). */
export function motivoTituloOCTravado(status: string | null | undefined, casadoComExtrato: boolean): string | null {
  if (casadoComExtrato) return 'Conciliado com o extrato: desfaça a conciliação na Conferência para ajustar vencimento, conta e classificação.';
  if (!tituloOCAjustavel(status, false)) return 'Já realizado: para ajustar vencimento, conta e classificação, estorne o recebimento/pagamento primeiro.';
  return null;
}

export interface LinhaAntes {
  tipo_operacao?: string | null;
  data_vencimento?: string | null;
  conta_bancaria_id?: string | null;
  conta_destino_id?: string | null;
  plano_conta_id?: string | null;
}

/** O que mudou nos tres campos da OC, no formato de `oc_titulo_ajustar` (vazio = nada a ajustar pela OC). */
export function camposDoAjusteOC(antes: LinhaAntes, depois: LinhaAntes): Record<string, string | null> {
  const campos: Record<string, string | null> = {};
  const entrada = (antes.tipo_operacao ?? '').startsWith('1');
  if ((depois.data_vencimento || null) !== (antes.data_vencimento || null) && depois.data_vencimento) campos.data_vencimento = depois.data_vencimento;
  const contaAntes = (entrada ? antes.conta_destino_id : antes.conta_bancaria_id) || null;
  const contaDepois = (entrada ? depois.conta_destino_id : depois.conta_bancaria_id) || null;
  if (contaDepois !== contaAntes) campos.conta_bancaria_id = contaDepois;
  if (depois.plano_conta_id && depois.plano_conta_id !== (antes.plano_conta_id || null)) campos.plano_conta_id = depois.plano_conta_id;
  return campos;
}
