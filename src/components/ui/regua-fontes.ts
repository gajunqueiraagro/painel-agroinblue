/**
 * UI-FONTES-REGUA-01 (Gabriel 25/11/2026 07:41, REGRA SOBERANA para telas NOVAS ou ALTERADAS) — a régua de fontes e alturas.
 *  · título do modal 13px;
 *  · abas, botões e texto de campo 11px com altura 26px (`CONTROLE`, `ALTURA_CONTROLE`, `FONTE_CONTROLE`);
 *  · rótulos, cabeçalhos de tabela e datas 10px (o `Rotulo` da casa já é 10px; `TH_FONTES`, `TD_FONTES_DATA`);
 *  · linha de tabela 11px / 24px (`TD_FONTES*`, `LINHA_FONTES`);
 *  · campo de data com largura FIXA que mostra a data inteira (`LARGURA_CAMPO_DATA` na célula, `CAMPO_DATA` no campo);
 *  · seletor mostra o nome inteiro: largura fixa pelo maior nome da lista (`larguraDoSeletor`).
 * ⚠ Os tokens antigos (`REGUA_CAMPO` 28px, `TH_REGUA` 9,5px, `TD_REGUA` 10px/19px) NÃO mudam: vestem telas já aprovadas.
 * ⚠ SÓ APRESENTAÇÃO: nenhum estado, nenhum dado.
 */
import { cn } from '@/lib/utils';
import { TH_REGUA } from '@/components/ui/regua-tabela';

export const ALTURA_CONTROLE = 26;
export const FONTE_CONTROLE = 11;
export const TITULO_MODAL = 'text-[13px] font-semibold';
/** campo, gatilho de seletor e botão */
export const CONTROLE = 'h-[26px] py-0 text-[11px]';
/** botão de ícone ao lado de um campo (o "+" e o lápis do seletor de favorecido): o quadrado da altura do controle */
export const QUADRADO_CONTROLE = 'h-[26px] w-[26px]';
/** texto de apoio (nota sob o bloco, rodapé, soma): o tamanho do rótulo */
export const TEXTO_ROTULO = 'text-[10px]';
export const TH_FONTES = cn(TH_REGUA, 'text-[10px]');
export const LINHA_FONTES = 'h-[24px]';
/** linha de tabela que carrega um controle de 26px (a atuação editável): 26 + 2 × 2px */
export const LINHA_COM_CONTROLE = 'h-[30px]';
export const TD_FONTES = 'h-[24px] px-1 py-0 text-[11px] leading-none';
export const TD_FONTES_TEXTO = cn(TD_FONTES, 'truncate');
export const TD_FONTES_NUM = cn(TD_FONTES, 'text-right tabular-nums whitespace-nowrap');
export const TD_FONTES_DATA = cn(TD_FONTES, 'text-[10px] tabular-nums whitespace-nowrap');
/** "00/00/0000" a 11px tabular (~59px) + 8px à esquerda + 32px do ícone + 2px de borda = 101px → 112px fixos */
export const LARGURA_DATA_PX = 112;
export const LARGURA_CAMPO_DATA = 'w-[112px]';
/** vai no `className` do `DatePicker` (é o input); a célula leva `LARGURA_CAMPO_DATA` */
export const CAMPO_DATA = 'h-[26px] py-0 pl-2 pr-8 text-[11px] tabular-nums';

let contexto: CanvasRenderingContext2D | null | undefined;
/** a largura do texto na fonte da página (canvas); sem canvas (teste), 0,6 × fonte por letra */
export function medirTexto(texto: string, fontePx: number = FONTE_CONTROLE): number {
  /* sem canvas (servidor, ou o jsdom dos testes, que não o implementa e reclama no console) → a conta de 0,6 × fonte por letra */
  if (contexto === undefined) contexto = typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent) ? null : document.createElement('canvas').getContext?.('2d') ?? null;
  if (!contexto) return texto.length * fontePx * 0.6;
  contexto.font = `400 ${fontePx}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  return contexto.measureText(texto).width;
}

/** o gatilho do `SearchableSelect`: 20px de padding + 14px do ✕ (lugar reservado) + 10px da seta + 2px de borda + 4px de folga */
export const ALEM_DO_NOME_SELETOR = 50;
/** a largura FIXA do seletor = o maior nome da lista + o que o gatilho tem além do nome (px inteiros) */
export function larguraDoSeletor(nomes: readonly string[], fontePx: number = FONTE_CONTROLE): number {
  const maior = nomes.reduce((m, n) => Math.max(m, medirTexto(n, fontePx)), 0);
  return Math.ceil(maior + ALEM_DO_NOME_SELETOR);
}
