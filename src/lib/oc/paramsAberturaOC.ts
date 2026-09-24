/**
 * OS PARÂMETROS DE URL QUE ABREM UMA OPERAÇÃO COMERCIAL — OC-ABRIR-PERDE-ID-01.
 *
 * ⚠ FUNÇÃO PURA, FORA DO COMPONENTE, pelo mesmo motivo do `decidirHidratacao`: era regra
 * de navegação escrita dentro de um `useCallback` de 1.500 linhas de arquivo, sem como
 * exercitá-la. O defeito que a tirou de lá era invisível a todos os sete gates — a tela
 * simplesmente ia para o lugar errado, calada.
 *
 * ⚠ `oc_return` É A ORIGEM, NUNCA UMA CARONA. Até 24/09/2026 um valor já presente na URL
 * era PRESERVADO (`if (!p.get('oc_return'))`), e com isso ele sobrevivia a aberturas
 * seguintes: um `oc_return=lancamentos-zoot` gravado quando a venda nasceu em "Lançar
 * movimentação" continuava lá quando o operador, depois, clicava numa OC na Central. O
 * fecho lia esse valor e o mandava para "Lançar movimentação" — sem modal e sem toast,
 * porque `'lancamentos-zoot'` é seção conhecida e `'operacoes-comerciais'` cai no
 * fallback. Quem preserva de propósito (a volta do drill do Financeiro) passa o valor.
 */

export type ParamsAberturaOC = {
  ocId: string;
  /** Aba inicial do shell; ausente apaga o parâmetro. */
  aba?: string;
  tipo?: string;
  /** De ONDE veio o clique. Ausente apaga o parâmetro — nunca herda o que estava lá. */
  retorno?: string;
};

/**
 * Devolve a query string que abre a OC, partindo da atual.
 *
 * ⚠ PARTE DA ATUAL de propósito: os filtros da tela (`f_de`, `f_tipo`, …) atravessam a ida
 * e a volta sem que ninguém precise preservá-los, e é isso que faz o "voltar" devolver a
 * lista no mesmo recorte.
 *
 * ⚠ OS TRÊS TIPOS SÃO MUTUAMENTE EXCLUSIVOS, e a garantia é de quem ABRE: `oc_compra`,
 * `oc_venda` e `oc_abate` são lidos do MESMO query string, e dois ligados ao mesmo tempo
 * montariam dois shells no mesmo render.
 */
export function paramsAberturaOC(searchAtual: string, { ocId, aba, tipo = 'compra', retorno }: ParamsAberturaOC): URLSearchParams {
  const p = new URLSearchParams(searchAtual);

  if (tipo === 'venda') { p.set('oc_venda', '1'); p.delete('oc_compra'); p.delete('oc_abate'); }
  else if (tipo === 'abate') { p.set('oc_abate', '1'); p.delete('oc_compra'); p.delete('oc_venda'); }
  else { p.set('oc_compra', '1'); p.delete('oc_venda'); p.delete('oc_abate'); }

  p.set('oc_id', ocId);
  if (aba) p.set('oc_aba', aba); else p.delete('oc_aba');
  /* ⚠ SEMPRE ESCREVE OU SEMPRE APAGA — nunca "deixa como estava". É a linha inteira do
     defeito: o `else p.delete` é o que impede a carona. */
  if (retorno) p.set('oc_return', retorno); else p.delete('oc_return');

  return p;
}
