/**
 * O MODELO COMERCIAL DE UMA CULTURA — como ela vira dinheiro.
 *
 * ⚠ ELE EXISTE PARA NÃO HAVER UM `if (cultura === 'mandioca')` ESPALHADO. A diferença entre o
 * amendoim e a mandioca não é de tela: é de NEGÓCIO. O amendoim colhe, estoca, classifica e
 * vende depois, com saca, aflatoxina e local de estoque; a mandioca industrial não estoca —
 * colheita, entrega e venda são o mesmo ato, em tonelada, e o preço sai do rendimento em amido.
 * Perguntar ao mapa é perguntar ao negócio; perguntar ao nome da cultura é adivinhar.
 * ⚠ CULTURA AINDA É TEXTO NO BANCO, com CHECK — o mapa vira coluna no AGRI-01b. Até lá ele é a
 * única fonte, e quem não estiver nele cai no modelo padrão (saca estocável), que é o que as
 * telas já faziam antes de ele existir. Cultura nova sem entrada aqui NÃO quebra; ela se comporta
 * como o amendoim, e é o comportamento certo para errar.
 */

/**
 * `saca_estocavel` — colhe, estoca, classifica e vende depois. Saca, local de estoque, quebra.
 * `entrega_direta_rendimento` — colheita = entrega = venda; tonelada, e o preço vem do
 *   rendimento em gramas de amido (R$/g × g × t).
 * `entrega_direta_peso` — colheita = entrega = venda; tonelada, preço por tonelada.
 */
export type ModeloComercial =
  'saca_estocavel' | 'entrega_direta_rendimento' | 'entrega_direta_peso';

const MODELOS: Record<string, ModeloComercial> = {
  amendoim: 'saca_estocavel',
  milho: 'saca_estocavel',
  soja: 'saca_estocavel',
  mandioca: 'entrega_direta_rendimento',
  cana: 'entrega_direta_peso',
};

/** ⚠ O PADRÃO É A SACA porque é o que todas as telas assumiam antes deste mapa. */
export function modeloDaCultura(cultura: string | null | undefined): ModeloComercial {
  return MODELOS[(cultura || '').trim().toLowerCase()] ?? 'saca_estocavel';
}

/**
 * A cultura NÃO estoca — colheita, entrega e venda são o mesmo ato.
 *
 * ⚠ É A PERGUNTA QUE O ESTOQUE DE GRÃOS FAZ, e a resposta certa é sumir da tela: uma cultura sem
 * estoque não tem saldo, não tem quebra e não tem local. Mostrá-la com tudo em zero seria
 * convidar o operador a procurar um grão que nunca esteve lá.
 */
export const ehEntregaDireta = (cultura: string | null | undefined): boolean =>
  modeloDaCultura(cultura) !== 'saca_estocavel';

/**
 * A cultura tem CLASSES de qualidade (grão bom, roça, aflatoxina)?
 *
 * ⚠ SÓ A SACA ESTOCÁVEL TEM. Na entrega direta a indústria pesa e mede o rendimento; não há
 * classificação a exibir, e as colunas "Sacas boas"/"Roça (sc)" e a Composição por qualidade
 * SOMEM — não viram "—". Traço significa "não sei"; aqui a resposta é "não se aplica".
 */
export const temClassesDeQualidade = (cultura: string | null | undefined): boolean =>
  modeloDaCultura(cultura) === 'saca_estocavel';
