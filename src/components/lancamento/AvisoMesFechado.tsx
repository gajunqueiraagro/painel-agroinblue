/**
 * ZOOT-MES-FECHADO-MODAL-01 (Gabriel, 15/10/2026) — A FAIXA DO "MÊS FECHADO", UMA PEÇA PARA TODO MODAL DE MOVIMENTAÇÃO.
 *
 * Mora logo ACIMA DOS BOTÕES, num lugar RESERVADO de 40px que existe sempre: o modal não muda de altura quando a faixa
 * aparece ou some. Duas linhas fixas de 18px — o P1 (Mapa de Pastos) primeiro, a trava master embaixo; as duas cabem juntas.
 * As frases vêm de `mesFechadoP1.ts` (`mesFechadoMotivo`, `travaMasterMotivo`), as MESMAS que travam o botão: a faixa não
 * calcula nada. Ao lado do P1, o gesto de reabrir que cada modal já tinha (`acaoP1`).
 * Usam: Nascimento, Morte, Compra, Venda, Abate e o formulário genérico (Transferência e Consumo).
 */
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** A frase do P1, ou nulo. */
  p1: string | null | undefined;
  /** A frase da trava master, ou nulo (só os fluxos que a trava master alcança a passam). */
  master?: string | null;
  /** O gesto de reabrir ao lado do P1 (o botão que o modal já tinha). */
  acaoP1?: ReactNode;
  className?: string;
}

const LINHA = 'flex h-[18px] min-w-0 items-center gap-2 text-[10px] leading-[18px] text-amber-900';

export function AvisoMesFechado({ p1, master, acaoP1, className }: Props) {
  const temAlgo = !!p1 || !!master;
  return (
    <div data-testid="aviso-mes-fechado" data-vazio={temAlgo ? undefined : ''}
      className={cn('h-10 shrink-0 overflow-hidden px-3 py-[2px]', temAlgo ? 'border-t border-amber-300 bg-amber-50' : 'bg-transparent', className)}>
      {p1 && (
        <div data-testid="aviso-mes-fechado-p1" className={LINHA}>
          <Lock className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium" title={p1}>{p1}</span>
          {acaoP1}
        </div>
      )}
      {master && (
        <div data-testid="aviso-mes-fechado-master" className={LINHA}>
          <Lock className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium" title={master}>{master}</span>
        </div>
      )}
    </div>
  );
}
