/**
 * AS FORMAS DE PAGAMENTO DE UM LANÇAMENTO DO V2 — a coluna
 * `financeiro_lancamentos_v2.forma_pagamento`. PAR-01c.
 *
 * ⚠ NÃO É `formasPagamento.ts`, E A DIFERENÇA NÃO É COSMÉTICA. Aquele arquivo é da OC e serve
 * `zoo_operacao_parcelas_programacao.forma`: cinco itens, com **Cheque**. Este serve outra
 * coluna, de outra tabela, e tem oito — as quatro comuns, sem Cheque, mais Cartão, Débito,
 * Débito Automático e Outro. Duas colunas, dois vocabulários; fundi-los mudaria o que as duas
 * telas oferecem, e por isso são dois arquivos e não um.
 *
 * ⚠ NASCE DE UMA COLISÃO REAL, não de previsão: um PR tentou extrair "a lista de formas de
 * pagamento" e escreveu por cima do módulo da OC, porque os dois conceitos têm o mesmo nome em
 * português. O sufixo `V2` no arquivo é o que impede a próxima pessoa de repetir isso — ele
 * nomeia a TABELA que a lista serve, não uma versão.
 *
 * ⚠ ERAM TRÊS CÓPIAS INLINE EM `financeiro-v2`, e as três DIVERGEM (medido):
 *     LancamentoV2Dialog     8 itens  → `financeiro_lancamentos_v2.forma_pagamento`  (esta)
 *     ContratoDialog         6 itens  → `financeiro_contratos.forma_pagamento`       (sem Dinheiro, sem Débito)
 *     FornecedorFormDialog   7 itens  → `financeiro_fornecedores.tipo_recebimento`   (diz "Transferência Bancária")
 * Só a primeira entra aqui: as outras duas são de colunas diferentes e sair mudando o que elas
 * oferecem não é assunto deste módulo. Que elas devessem convergir é outra conversa — ver a nota
 * do vocabulário aberto abaixo.
 */

/**
 * As oito formas que a tela oferece, na ordem em que sempre apareceram.
 *
 * ⚠ SÃO TEXTOS, NÃO CÓDIGOS: a coluna é `text` livre, sem CHECK, e as linhas antigas trazem
 * exatamente estas grafias, com acento. Trocar por código curto exigiria migrar o que já está
 * gravado.
 *
 * ⚠ E ELA NÃO É O VOCABULÁRIO COMPLETO DA COLUNA — medido no proto em 18/09/2026. Dos 1.867
 * lançamentos com forma preenchida, **613 (33%) usam um texto que não está nesta lista**:
 * "Cartão de Credito" (260), "PIX/Transferência Bancária" (204), "Cartão de Crédito" (84, a
 * mesma coisa com acento), "Credito" (35), "Débito em Conta" (21) e "Cartão de Débito" (9).
 * "Dinheiro", que está aqui, tem ZERO linhas.
 * ⚠ QUEM MONTAR UM `<Select>` COM ELA PRECISA SABER DISSO: o Radix não tem item para um valor
 * gravado fora da lista, e o gatilho aparece VAZIO — a tela mostra ausência sobre um dado que
 * existe, que é exatamente o que as sentinelas proíbem. O módulo da OC já resolve isso
 * antepondo o valor gravado; o caminho do v2 ainda não. Frente própria, registrada.
 */
export const FORMAS_PAGAMENTO_V2 = [
  'PIX',
  'Cartão de crédito',
  'Boleto',
  'Débito Automático',
  'Débito',
  'Transferência',
  'Dinheiro',
  'Outro',
] as const;

/**
 * CARTAO-LANCAMENTO-01 (Gabriel 30/10 18:04, decisão 1) — o cartão GRAVA "Cartão de crédito" (rótulo = valor). As 4 grafias antigas
 * ('Cartão', 'Cartão de Crédito', 'Credito', 'Cartão de Credito') se juntam nele pela migration 20261028113110, que vai ao ar junto com o
 * push deste código; até lá, a linha antiga aparece no seletor como "valor atual" (`formaForaDaLista`). 'Débito' fica como está.
 */
export const FORMA_CARTAO_CREDITO = 'Cartão de crédito';

/**
 * O valor do item "Nenhuma".
 *
 * ⚠ EXISTE PORQUE O RADIX PROÍBE `value=""`: um `SelectItem` de string vazia quebra o
 * componente. A sentinela viaja só dentro do `Select`; quem grava converte para `null` — vazio
 * aqui significa "não informada", e o banco guarda ausência, não a palavra.
 */
export const FORMA_PAGAMENTO_V2_NENHUMA = '__none_fp__';

/**
 * P143 (Gabriel 29/10: "OK usar a mesma regra da Mesa (30/09) no Editar") — a forma GRAVADA que nao esta' na lista ("Cartão de Crédito",
 * "PIX/Transferência Bancária"…). Quem monta o `<Select>` a antepoe como opcao "valor atual": o gatilho mostra o dado que existe, nunca vazio.
 * Nada se normaliza (o legado e' frente propria). Nulo = vazia ou ja' na lista.
 */
export function formaForaDaLista(gravada: string | null | undefined): string | null {
  const v = gravada ?? '';
  if (v.trim() === '' || v === FORMA_PAGAMENTO_V2_NENHUMA) return null;
  return FORMAS_PAGAMENTO_V2.some((f) => f === v) ? null : v;
}
export const ROTULO_VALOR_ATUAL = 'valor atual';
