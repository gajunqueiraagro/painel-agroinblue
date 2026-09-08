/**
 * As medidas da célula editável da Mesa, num lugar só — [133b-a].
 *
 * ⚠ ERAM SETE CÓPIAS de `h-6 text-[10px] px-2`, uma por editor, e o envelope pediu 22px e
 * 11px. Sete literais é sete chances de a próxima medida entrar em seis lugares — foi
 * exatamente o que aconteceu com as alturas do modal em 129d.
 *
 * ⚠ 10px EM TUDO — 133g item 4. A tabela tinha 11px nos valores e 10px só nas datas, e a
 * diferença de um pixel entre colunas vizinhas lê-se como desalinhamento, não como
 * hierarquia. O que distingue as colunas é a COR (azul = referência, cinza = gravado), e a
 * hierarquia mora fora da tabela — no topo de 14px e no cabeçalho do modal.
 * ⚠ O DROPDOWN CONTINUA EM 11px: ele não é a tabela; abre sobre ela e se lê com o olho
 * parado. O piso de 10px vale para o que está SEMPRE na tela.
 *
 * ⚠ 20px, NÃO 22 — 133d item 4. A linha da tabela caiu para 22px; um controle da mesma
 * altura da linha empurra a borda e a tabela cresce 2px por campo — 30px em quinze campos,
 * que é o que separa caber de rolar. O controle mora DENTRO da linha, nunca a define.
 */

/**
 * Trigger/input de um campo editável: 20px de altura, 10px, padding 0 6px.
 *
 * ⚠ O ÍCONE VEM JUNTO (`h-3 w-3`), e por descendente: o chevron do `Select` do design
 * system nasce em 16px e, num controle de 20px, ocupa a altura toda e come a largura do
 * valor. Trocá-lo no componente compartilhado mexeria em toda a aplicação — aqui a regra
 * fica presa à célula da Mesa, que é onde a densidade foi pedida.
 */
export const CELULA_EDITAVEL = 'h-5 px-1.5 py-0 text-[10px] [&_svg]:h-3 [&_svg]:w-3';

/**
 * O mesmo, para os componentes que só aceitam classe no wrapper e precisam alcançar o
 * botão interno (`ContaBancariaSelect`).
 */
export const CELULA_EDITAVEL_WRAPPER =
  '[&>button]:h-5 [&>button]:px-1.5 [&>button]:py-0 [&>button]:text-[10px] [&_svg]:h-3 [&_svg]:w-3';

/**
 * As três datas da tabela da Mesa — 133e adendo item 2: 10px nas TRÊS colunas, inclusive
 * dentro do campo.
 *
 * ⚠ 10px É O PISO, e as datas são onde ele se justifica: `dd/mm/aaaa` em `tabular-nums` é
 * um formato de largura fixa e leitura de relance — não é texto que se lê, é número que se
 * confere. O ícone de calendário do `DatePicker` compacto já é 12px e fica absoluto à
 * direita, então não come largura do valor.
 */
export const CELULA_EDITAVEL_DATA = 'h-5 pl-1.5 pr-6 py-0 text-[10px] tabular-nums';

/**
 * O gatilho compacto dos seletores da Mesa — 133g item 4: 10px, como o resto da tabela.
 *
 * ⚠ O `size="compact"` dos seletores compartilhados fixa 11px (é o padrão da casa fora da
 * Mesa); aqui a `className` vence pelo `twMerge`, e é ela que traz a tabela ao tamanho
 * único. Um dia em que o `size` mudar, esta constante continua mandando.
 */
export const GATILHO_TABELA = 'text-[10px]';

/** Item do dropdown — 11px, denso, para o menu não ficar maior que a tabela. */
export const ITEM_DROPDOWN = 'text-[11px] py-0.5';
