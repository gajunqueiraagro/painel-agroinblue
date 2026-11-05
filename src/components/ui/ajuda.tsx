/**
 * AJUDA ⓘ — a explicação curta e didática ao lado de um bloco, etapa ou termo técnico (REGRA NOVA do Gabriel, 05/11 10:31: "vale para
 * toda tela"). Na tela, SÓ o ícone; o texto mora no popover, em três partes: o que é · por que · como fazer.
 *
 * ⚠ UM COMPONENTE SÓ (não havia outro: o ⓘ com `title` solto de algumas telas e a `DicaDoMapa` — nome + 1 frase ao passar o mouse nos
 *   botões do mapa — não explicam). Tela nova que precisa explicar algo usa ESTE.
 * ⚠ NADA SE DESLOCA: o ícone tem 14px fixos e o popover é camada (Radix), por cima. Abre no clique e no Enter/Espaço; fecha no Esc e
 *   no clique fora (o Esc é do popover: o modal por baixo fica).
 */
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface TextoDaAjuda {
  /** O nome do que se explica (o título do popover e o rótulo acessível do ícone). */
  titulo: string;
  oQueE: ReactNode;
  porQue: ReactNode;
  comoFazer: ReactNode;
}

export function Ajuda({ titulo, oQueE, porQue, comoFazer, className, lado = 'bottom' }: TextoDaAjuda & {
  className?: string;
  lado?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Ajuda: ${titulo}`} data-testid="ajuda"
          className={cn('inline-flex h-[14px] w-[14px] flex-none items-center justify-center rounded-full border border-current text-[9px] font-semibold leading-none text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary', className)}>
          i
        </button>
      </PopoverTrigger>
      <PopoverContent side={lado} align="start" className="w-[300px] p-3 text-[11px] leading-[15px]" data-testid="ajuda-texto">
        <div className="mb-1.5 text-[12px] font-semibold text-primary">{titulo}</div>
        <dl className="space-y-1.5">
          <div><dt className="font-semibold">O que é</dt><dd className="text-foreground/85">{oQueE}</dd></div>
          <div><dt className="font-semibold">Por que</dt><dd className="text-foreground/85">{porQue}</dd></div>
          <div><dt className="font-semibold">Como fazer</dt><dd className="text-foreground/85">{comoFazer}</dd></div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
