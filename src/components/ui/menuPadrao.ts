/**
 * O PADRÃO DE TODO MENU ABERTO DO SISTEMA — UI-DROPDOWN-PADRAO-01 (A23 do docs/PADROES-UI.md).
 *
 * Um dono só para o fundo, a fonte e a altura do item de qualquer menu: `Select`, `DropdownMenu`, `Command` (os combobox
 * com busca) e `SearchableSelect` importam daqui. Mudar o padrão é mudar ESTE arquivo.
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
export const MENU_PALETA = 'border-zinc-700/40 bg-zinc-800 text-zinc-100';

/** O item: 22px de altura mínima, 10px de texto, uma linha. */
export const MENU_ITEM = 'min-h-[22px] px-2 py-1 text-[10px] leading-[14px]';

/** O rótulo de grupo / label do menu. */
export const MENU_ROTULO = 'text-[10px] font-medium text-zinc-400';
