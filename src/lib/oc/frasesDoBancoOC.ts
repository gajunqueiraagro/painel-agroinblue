/**
 * AS FRASES DO BANCO QUE O MODO OC E O "DESFAZER" MOSTRAM NA TELA — OC-CC-MODAL-FINANCEIRO-01 (Gabriel, 13/10/2026).
 * O RAISE do banco e' escrito sem acento e no vocabulario das funcoes; aqui cada um vira a frase do operador.
 * ⚠ CASA PELA EXPRESSAO COMPLETA (do comeco ao fim do texto), NUNCA POR PEDACO SOLTO: um pedaco casaria outra recusa que
 *   so' compartilha palavras. Texto que o mapa nao conhece passa como veio.
 * ⚠ O TEXTO DO RAISE NAO MUDA NO BANCO. RAISE novo nas RPCs `oc_lancar_pelo_modal` / `oc_desfazer_compromisso` (ou nos donos
 *   que elas encadeiam) entra AQUI no mesmo PR.
 */
export const FRASES_DO_BANCO_OC: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Soma dos compromissos principais excede a base da operacao(?:$|[\s.:(,][\s\S]*$)/, 'A programação passa do valor da operação.'],
  [/^A classificacao escolhida nao e a que o plano resolve para "[\s\S]*"$/, 'Esta classificação não corresponde à conta desta operação.'],
  [/^Classificacao nao encontrada no plano de contas deste cliente$/, 'Classificação não encontrada no plano de contas deste cliente.'],
  [/^Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao\.$/,
    'Este lançamento já foi pago ou conciliado. Desfaça o pagamento ou a conciliação no Financeiro antes.'],
  [/^Compromisso ja cancelado$/, 'Este lançamento já foi cancelado.'],
];

export function fraseDoBancoOC(mensagem: string): string {
  const texto = mensagem.trim();
  return FRASES_DO_BANCO_OC.find(([expressao]) => expressao.test(texto))?.[1] ?? mensagem;
}
