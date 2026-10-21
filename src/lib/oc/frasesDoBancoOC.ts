/**
 * AS FRASES DO BANCO QUE O MODO OC E O "DESFAZER" MOSTRAM NA TELA — OC-CC-MODAL-FINANCEIRO-01 (Gabriel, 13/10/2026).
 * O RAISE do banco e' escrito sem acento e no vocabulario das funcoes; aqui cada um vira a frase do operador.
 * ⚠ CASA PELA EXPRESSAO COMPLETA (do comeco ao fim do texto), NUNCA POR PEDACO SOLTO: um pedaco casaria outra recusa que
 *   so' compartilha palavras. Texto que o mapa nao conhece passa como veio.
 * ⚠ O BANCO E' A FONTE DA FRASE (OC-DESFAZER-PREVISTO-01b): as recusas de `oc_desfazer_compromisso` e dos donos que ele encadeia
 *   (cancelar programação/compromisso, estornar), do "Atualizar compromisso", de alterar parcela, salvar lotes, desvincular, ajustar
 *   valor, estornar recebimento e revalorar lote já chegam prontas — com acento, R$ e dd/mm/aaaa — e passam como vieram. AQUI fica
 *   só o que o banco ainda não escreve (`oc_lancar_pelo_modal`). Não duplicar a fonte.
 */
export const FRASES_DO_BANCO_OC: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Soma dos compromissos principais excede a base da operacao(?:$|[\s.:(,][\s\S]*$)/, 'A programação passa do valor da operação.'],
  [/^A classificacao escolhida nao e a que o plano resolve para "[\s\S]*"$/, 'Esta classificação não corresponde à conta desta operação.'],
  [/^Classificacao nao encontrada no plano de contas deste cliente$/, 'Classificação não encontrada no plano de contas deste cliente.'],
];

export function fraseDoBancoOC(mensagem: string): string {
  const texto = mensagem.trim();
  return FRASES_DO_BANCO_OC.find(([expressao]) => expressao.test(texto))?.[1] ?? mensagem;
}
