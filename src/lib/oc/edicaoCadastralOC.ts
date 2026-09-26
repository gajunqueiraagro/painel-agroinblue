/**
 * EDICAO CADASTRAL DA OC FECHADA — OC-EDITAR-CADASTRAL-01 (decisoes do Gabriel, 26/09/2026).
 *
 * Com a OC FECHADA so' os campos CADASTRAIS se editam — contraparte (comprador/fornecedor), observacoes e NF — e
 * eles vao por `oc_editar_dados_operacao`, que nao reabre nada e aceita a OC fechada. Todo o resto e' operacional
 * (valor, quantidade, data, competencia, fazenda, tipo de venda, boitel) e trava na tela ate' o Reabrir.
 *
 * ⚠ NUNCA MAIS `oc_salvar_rascunho` COM A OC FECHADA. Era o defeito: a venda e o abate mandavam o cabecalho sempre
 *   para o rascunho, que recusa "Negociacao fechada; reabra para editar" — so' a compra roteava pelo status. Caso real:
 *   venda boitel da0b8577 (RRCC, 29/07/2025), trocar o comprador exigiu reabrir a OC.
 * ⚠ A DATA SAIU DA LISTA (decisao a): ela vira competencia no Vincular, semeia o vencimento da previsao e decide o mes
 *   do P1. O filtro abaixo e a lista da RPC dizem a MESMA coisa, e a RPC recusa pelo nome o que vier a mais.
 */

/** As chaves que `oc_editar_dados_operacao` aceita — espelho de `v_permitidas` (migration 20261027155000). */
export const CAMPOS_CADASTRAIS_OC: ReadonlyArray<string> = ['contraparte_id', 'observacoes', 'numero_documento'];

export type CaminhoSalvarOC = 'nenhum' | 'editar_dados' | 'salvar_rascunho';

/** Por onde o Salvar do cabecalho grava, pelo status da operacao. Cancelada nao grava nada. */
export function caminhoDoSalvarOC(statusComercial: string | null | undefined): CaminhoSalvarOC {
  if (statusComercial === 'cancelada') return 'nenhum';
  if (statusComercial === 'fechada') return 'editar_dados';
  return 'salvar_rascunho';
}

/** So' as chaves cadastrais do que ficou sujo — nenhuma chave operacional chega ao banco pela OC fechada. */
export function soCadastrais(sujo: Readonly<Record<string, string | null>>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(sujo).filter(([k]) => CAMPOS_CADASTRAIS_OC.includes(k)));
}
