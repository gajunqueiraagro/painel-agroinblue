/**
 * A RÉGUA DE TABELA DA CASA — FORN-01b (Gabriel, 21/10/2026: "a régua é a de Financeiro › Recorrências"). Um lugar só para as
 * classes da tabela de lista: Recorrências (a tela aprovada) e Cadastros › Fornecedores tiram daqui; a frente UI-TABELA-PADRAO-01
 * espalha para as outras listas. Não nasce variante por tela: quem precisar de outra coisa escreve o `className` por cima.
 *   · MEDIDO em Recorrências (bancada, 21/10): cabeçalho navy 22px renderizados (a classe dizia 19; a linha da tabela a 14px empurrava),
 *     9,5px/500; linha 19px, 10px; padding lateral 4px (`px-1`), vertical 0; barra do rodapé 23px (22 + a borda de cima), navy, 10px;
 *   · coluna secundária (documento, cidade, contador, data) a 9,5px — o piso da casa;
 *   · texto/nome: UMA linha, termina em "…" com o texto inteiro no `title` (regra de corte de 21/10 07h25); número, valor, data,
 *     CPF/CNPJ e contador nunca cortam (`whitespace-nowrap`, coluna dimensionada pelo conteúdo);
 *   · barra do rodapé presa no pé do quadro: navy, 22px, 10px (o "Total do mês" de Recorrências; a paginação de Fornecedores).
 * `TextoReservado`: o texto que muda com a seleção (contador, "Mostrando 1–50 de 2.356", "Página 1 de 48") ocupa SEMPRE a largura
 * do maior valor possível, com algarismos tabulares — trocar 50↔100, mudar de página, filtrar ou buscar não empurra o vizinho
 * (LEI DE ESTABILIDADE VISUAL, 13/09; espaço reservado, 09/10; o gate é o `check:ui-desloca`).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const REGUA_TABELA = { cabecalho: 22, linha: 19, rodape: 23 } as const;
/** o cabeçalho navy (a cor vem do `thead`/`TableHeader` com `bg-primary`) */
export const TH_REGUA = 'h-[22px] px-1 py-0 text-[9.5px] font-medium text-primary-foreground normal-case tracking-normal whitespace-nowrap';
/** a célula */
export const TD_REGUA = 'h-[19px] px-1 py-0 text-[10px] leading-none';
/** texto/nome: uma linha com "…"; quem usa põe o texto inteiro no `title` da célula */
export const TD_REGUA_TEXTO = cn(TD_REGUA, 'truncate');
/** número, valor, data, documento: nunca corta */
export const TD_REGUA_NUM = cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap');
/** coluna secundária: a fonte menor da régua */
export const SECUNDARIA_REGUA = 'text-[9.5px]';
/** o quadro: borda, cantos e fundo; o corpo rola dentro dele e a barra do rodapé fica presa no pé */
export const QUADRO_REGUA = 'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]';
/** a barra navy do pé do quadro */
export const RODAPE_REGUA = 'shrink-0 border-t bg-primary text-primary-foreground text-[10px]';

/** Texto com a largura do maior valor possível (`reserva`), algarismos tabulares; o valor de agora por cima, alinhado como pedir.
 *  A reserva é um `::before` invisível (`attr(data-reserva)`) na mesma célula da grade: ocupa a largura e fica fora do texto da página
 *  (leitor de tela, `textContent`, busca). */
export function TextoReservado({ texto, reserva, alinhar = 'esquerda', className, testid }: {
  texto: ReactNode; reserva: string; alinhar?: 'esquerda' | 'direita'; className?: string; testid?: string;
}) {
  return (
    <span className={cn('inline-grid whitespace-nowrap tabular-nums',
      'before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-reserva)]', className)} data-testid={testid} data-reserva={reserva}>
      <span className={cn('col-start-1 row-start-1', alinhar === 'direita' && 'text-right')}>{texto}</span>
    </span>
  );
}

/** A reserva de um número formatado em pt-BR com até `digitos` algarismos ("99.999" para 5). */
export const reservaDeNumero = (digitos: number): string => Number('9'.repeat(Math.max(1, digitos))).toLocaleString('pt-BR');
