/**
 * SALVAR E, SO' SE SALVOU UM LANCAMENTO EXISTENTE, RELER AS FONTES DA TELA — DRE-MODAL-REFRESH-01.
 *
 * ⚠ E' A REGRA DO `onSave` DO EDITOR ABERTO PELO DRE, tirada do corpo da pagina para poder ser testada
 *   sem montar o `LancamentoV2Dialog` inteiro (nenhum teste da casa o monta):
 *     - salvou uma edicao (`ok` e `id`) -> rele DEPOIS da gravacao, nunca antes;
 *     - falhou -> nao rele: a tela continua mostrando o que o banco tem;
 *     - criou (sem `id`) -> nao rele, como sempre foi nesta tela.
 * ⚠ CANCELAR NEM CHEGA AQUI: fechar o editor e' o `onClose`, que so' limpa o estado.
 */
export async function salvarERecarregar(
  salvar: () => Promise<boolean>,
  id: string | null | undefined,
  recarregar: () => Promise<void>,
): Promise<boolean> {
  const ok = await salvar();
  if (ok && id) await recarregar();
  return ok;
}
