/**
 * O PADRÃO DE TODO MENU ABERTO DO SISTEMA — UI-DROPDOWN-PADRAO-01 (A23 do docs/PADROES-UI.md); cor e medida no -fix1.
 *
 * Um dono só para o fundo, a fonte e a altura do item de qualquer menu: `Select`, `DropdownMenu`, `Command` (os combobox
 * com busca) e `SearchableSelect` importam daqui. Mudar o padrão é mudar ESTE arquivo — inclusive o realce.
 *
 * ⚠ NASCE DE DUAS QUEIXAS DO GABRIEL (02/10): "quando abro o drop-down o texto está muito grande" e "vi telas em que o
 *   fundo é preto e outras um cinza mais claro". Medido no proto: o item ia de 10px/22 (Select) a 12px/26 (DropdownMenu,
 *   fornecedor), e ainda 41 telas sobrescreviam o tamanho; e o fundo era TRANSLÚCIDO (zinc-950 a 55% + desfoque de fundo),
 *   então a cor que se via era a do que estava atrás — cinza sobre a página branca, quase preto sobre o navy.
 * ⚠ OPACO DE PROPÓSITO: sem alpha e sem blur, o mesmo `backgroundColor` em qualquer fundo.
 * ⚠ NENHUMA TELA SOBRESCREVE: classe de tamanho ou de altura no item de menu de uma tela é a segunda forma que este
 *   padrão existe para eliminar.
 */

/** O painel: borda, fundo e texto. OPACO. */
/* ⚠ UI-DROPDOWN-PADRAO-01-fix1 (Gabriel, 02/10 09:57): "é um cinza e não preto assim". O padrão antigo era
   zinc-950 a 55% + desfoque, que sobre a tela branca se via como cinza médio (~rgb(120,120,121)); o 01 fixou
   zinc-800 opaco (rgb(39,39,42)) e ficou quase preto. Agora zinc-600 (rgb(82,82,91)), OPACO como no 01, com o texto BRANCO
   (decisão do Gabriel, 02/10): medido, o zinc-500 só passava 4,5:1 com o branco, e o zinc-600 passa com todos os tons. */
export const MENU_PALETA = 'border-zinc-500/40 bg-zinc-600 text-white';

/** O item: 20px de altura mínima, 9,5px de texto (o piso da casa), uma linha. */
export const MENU_ITEM = 'min-h-[20px] px-2 py-[3px] text-[9.5px] leading-[14px]';

/** O rótulo de grupo / label do menu. */
export const MENU_ROTULO = 'text-[9.5px] font-medium text-zinc-200';

/**
 * O REALCE do item, num dono só (fix1): destacado/hover `zinc-700`, escolhido `zinc-700/60`. As variantes vêm ESCRITAS
 * POR EXTENSO porque o Tailwind só gera a classe que lê literal no código — `focus:${x}` montado em tempo de execução
 * não existiria no CSS.
 */
export const MENU_REALCE = 'bg-zinc-700';
export const MENU_REALCE_HOVER = 'hover:bg-zinc-700';
export const MENU_REALCE_FOCO = 'focus:bg-zinc-700';
export const MENU_REALCE_ABERTO = 'data-[state=open]:bg-zinc-700';
export const MENU_REALCE_SELECIONADO = 'data-[selected=true]:bg-zinc-700';
export const MENU_ESCOLHIDO = 'bg-zinc-700/60';
export const MENU_ESCOLHIDO_MARCADO = 'data-[state=checked]:bg-zinc-700/60';

/** Texto secundário dentro do menu (rótulo, "Nenhum resultado", atalho, contagem). `zinc-400` sumia no painel cinza. */
export const MENU_SECUNDARIO = 'text-zinc-200';

/** "Nenhum resultado" e afins: 9,5px, secundário. */
export const MENU_VAZIO = 'text-[9.5px] text-zinc-200';

/** O campo de busca dentro do menu: fundo zinc-700, texto branco, placeholder zinc-300, 9,5px. */
export const MENU_BUSCA = 'bg-zinc-700 text-[9.5px] text-white placeholder:text-zinc-300';
