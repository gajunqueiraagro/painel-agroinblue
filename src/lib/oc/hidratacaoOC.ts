/**
 * QUANDO HIDRATAR UMA OPERAÇÃO COMERCIAL — PR-OC-LISTA-03.
 *
 * ⚠ O GUARD EXISTE CONTRA HIDRATAÇÃO DUPLA CONCORRENTE, NÃO CONTRA A SEGUNDA ABERTURA — e
 * era essa a confusão. `LancamentosTab` guardava um único booleano (`ocHidratadoRef`): a
 * primeira abertura o punha em `true` e ele só voltava a `false` no caminho de FALHA
 * (`limparParamsOC`). Enquanto a aba permanecesse montada, qualquer abertura seguinte
 * batia no `if (ocHidratadoRef.current) return;` e morria em SILÊNCIO ABSOLUTO: sem toast,
 * sem modal, com `oc_compra=1&oc_id=...` presos na URL e a tela parada em Lançamentos.
 * O operador via exatamente "cliquei e não abriu".
 *
 * ⚠ SÃO DUAS PERGUNTAS, E O BOOLEANO RESPONDIA UMA SÓ: "há uma hidratação EM VOO?" (aí a
 * segunda chamada tem de desistir, ou seriam duas leituras concorrentes escrevendo o mesmo
 * estado) e "QUAL operação já está aberta?" (aí a resposta depende de qual se está pedindo).
 * Separadas, a proteção original fica intacta e a segunda abertura volta a acontecer.
 *
 * ⚠ FUNÇÃO PURA, FORA DO COMPONENTE, porque são TRÊS chamadores — compra, venda e abate —
 * e a regra escrita três vezes é a regra que diverge na primeira mudança. Foi assim que
 * `abrePorTipo` virou defeito no PR-OC-VENDA-REABRIR-01.
 */

export type DecisaoHidratacao =
  /** Já há uma hidratação em voo: desistir, senão duas leituras escrevem o mesmo estado. */
  | 'em_voo'
  /** É a MESMA operação que já está aberta: nada a fazer, e nada a dizer. */
  | 'ja_aberta'
  /** Outra operação, na mesma montagem da aba: avisar e hidratar. */
  | 'reabrir'
  /** Primeira abertura desta montagem. */
  | 'hidratar';

export function decidirHidratacao(
  emVoo: boolean,
  idHidratado: string | null,
  idPedido: string,
): DecisaoHidratacao {
  if (emVoo) return 'em_voo';
  if (idHidratado !== null && idHidratado === idPedido) return 'ja_aberta';
  if (idHidratado !== null) return 'reabrir';
  return 'hidratar';
}

/** As duas decisões que MANDAM SEGUIR. Uma pergunta só, para os três chamadores. */
export const vaiHidratar = (d: DecisaoHidratacao): boolean => d === 'reabrir' || d === 'hidratar';
