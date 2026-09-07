/**
 * As medidas da célula editável da Mesa, num lugar só — [133b-a].
 *
 * ⚠ ERAM SETE CÓPIAS de `h-6 text-[10px] px-2`, uma por editor, e o envelope pediu 22px e
 * 11px. Sete literais é sete chances de a próxima medida entrar em seis lugares — foi
 * exatamente o que aconteceu com as alturas do modal em 129d.
 *
 * ⚠ 22px, NÃO 24: a linha da tabela tem 24px com `padding 3px`, então o controle precisa
 * caber DENTRO dos 18px úteis mais a folga do padding. Um controle de 24px dentro de uma
 * linha de 24px empurra a borda e a tabela cresce 2px por campo — 30px em quinze campos,
 * que é o que separava caber de rolar.
 */

/**
 * Trigger/input de um campo editável: 22px de altura, 11px, padding 1px 6px.
 *
 * ⚠ O ÍCONE VEM JUNTO (`h-3 w-3`), e por descendente: o chevron do `Select` do design
 * system nasce em 16px e, num controle de 22px, ocupa a altura toda e come a largura do
 * valor. Trocá-lo no componente compartilhado mexeria em toda a aplicação — aqui a regra
 * fica presa à célula da Mesa, que é onde a densidade foi pedida.
 */
export const CELULA_EDITAVEL = 'h-[22px] px-1.5 py-px text-[11px] [&_svg]:h-3 [&_svg]:w-3';

/**
 * O mesmo, para os componentes que só aceitam classe no wrapper e precisam alcançar o
 * botão interno (`ContaBancariaSelect`).
 */
export const CELULA_EDITAVEL_WRAPPER =
  '[&>button]:h-[22px] [&>button]:px-1.5 [&>button]:py-px [&>button]:text-[11px] [&_svg]:h-3 [&_svg]:w-3';

/** Item do dropdown — 11px, denso, para o menu não ficar maior que a tabela. */
export const ITEM_DROPDOWN = 'text-[11px] py-0.5';
