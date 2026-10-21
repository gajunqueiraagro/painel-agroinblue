/**
 * OC-CORRECOES-01 A · OC-TIPO-VENDA-01 — o tipo de venda da OC persiste (Gabriel 21/10: "ja coloquei mais de 5 vezes gado adulto;
 * salvo, fecho, nao persiste"). A OC ganhou a coluna `tipo_venda` (migration 20261028110620): o Salvar a manda, a carga a le, e com a
 * OC FECHADA a troca desmama <-> gado adulto vai por `oc_editar_dados_operacao` (e' classificacao: nao mexe em valor, cabeca, data nem
 * financeiro). BOITEL nao: tem planejamento proprio, e trocar de/para boitel segue pedindo reabrir.
 */

export type TipoVendaOC = 'desmama' | 'gado_adulto' | 'boitel';

/** O tipo na carga: o planejamento de boitel manda (como sempre); sem ele, a coluna da OC; o que nao for conhecido volta vazio. */
export function tipoVendaDaCarga(coluna: string | null | undefined, temPlanejamentoBoitel: boolean): TipoVendaOC | '' {
  if (temPlanejamentoBoitel) return 'boitel';
  return coluna === 'desmama' || coluna === 'gado_adulto' ? coluna : '';
}

/** Com a OC fechada: o campo destrava so' entre desmama e gado adulto (boitel fica travado, e nao se escolhe). */
export const tipoVendaEditavelComOCFechada = (atual: string): boolean => atual !== 'boitel';
