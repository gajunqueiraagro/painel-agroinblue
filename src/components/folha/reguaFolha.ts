/**
 * FOLHA-REGUA-01 (Gabriel 26/11 08:13, a régua dos mocks aprovados `financ-cronograma-ref` e `contas-bancarias-lista-ref`) — a régua da
 * FOLHA DE PAGAMENTO: tabela 10,5px · cabeçalho 10px · linha 20px · abas, botões e filtros 11px com 24px de altura · rótulo 10px e valor
 * 10,5px no painel · sem caixa alta · larguras fixas · nada cortado (fora de tabela nunca "…"; dentro, só com o inteiro no `title`).
 * ⚠ MORA NA FOLHA, não em `components/ui`: os tokens da casa (`regua-fontes`, `regua-tabela`) vestem telas já aprovadas e não mudam.
 * ⚠ SÓ APRESENTAÇÃO: nenhum estado, nenhum dado.
 */
import { cn } from '@/lib/utils';
import { TH_REGUA } from '@/components/ui/regua-tabela';

/** altura de aba, botão, filtro e campo */
export const ALTURA_F = 24;
export const FONTE_F = 11;
/** campo, gatilho de seletor e botão: 11px / 24px */
export const CONTROLE_F = 'h-[24px] py-0 text-[11px]';
/** o botão principal (navy da casa) e o de contorno, na régua */
export const BOTAO_F = 'h-[24px] rounded-md px-2 py-0 text-[11px] font-medium';
export const BOTAO_PRINCIPAL_F = cn(BOTAO_F, 'bg-primary text-primary-foreground hover:bg-primary/90');
export const BOTAO_CONTORNO_F = cn(BOTAO_F, 'border border-input bg-card text-foreground hover:bg-muted');
/** rótulo, nota e texto de apoio */
export const ROTULO_F = 'text-[10px]';
/** valor no painel do funcionário */
export const VALOR_F = 'text-[10.5px]';

export const TH_F = cn(TH_REGUA, 'text-[10px]');
export const LINHA_F = 'h-[20px]';
export const TD_F = 'h-[20px] px-1 py-0 text-[10.5px] leading-none';
export const TD_F_TEXTO = cn(TD_F, 'truncate');
export const TD_F_NUM = cn(TD_F, 'text-right tabular-nums whitespace-nowrap');
export const TD_F_DATA = cn(TD_F, 'tabular-nums whitespace-nowrap');
/** a linha do rodapé preso (navy), com o mesmo `colgroup` do corpo */
export const LINHA_RODAPE_F = 'h-[22px] text-[10.5px] font-semibold';
/** o selo de situação (pequeno, dentro da célula de 20px) */
export const SELO_F = 'inline-block rounded px-1.5 text-[9.5px] font-semibold leading-[15px] whitespace-nowrap';
