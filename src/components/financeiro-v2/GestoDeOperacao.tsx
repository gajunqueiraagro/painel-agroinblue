/**
 * UM GESTO QUE ALTERA A OPERACAO COMERCIAL, OFERECIDO FORA DA TELA DELA — ACESSOS-02c.
 *
 * ⚠ ATALHO SOME, GESTO FICA APAGADO COM O MOTIVO (decisao do Gabriel, 04/10): quem nao pode alterar a operacao ve^ o botao
 *   DESABILITADO, com o motivo no `title` e escrito ao lado (10px) — o clique nao dispara. Quem pode ve^ o botao de sempre, sem
 *   frase nenhuma. Quem decide e' `usePodeAlterarOperacao`; este componente so' desenha.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function GestoDeOperacao({ podeAlterar, motivo, onClick, testId, children }: {
  podeAlterar: boolean;
  /** Por que o gesto esta' apagado — so' aparece com `podeAlterar` falso. */
  motivo: string;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <>
      {!podeAlterar && (
        <span className="text-[10px] leading-tight text-muted-foreground" data-testid={`${testId}-motivo`}>{motivo}</span>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-[22px] px-[9px] text-[10px] gap-1"
        disabled={!podeAlterar}
        title={podeAlterar ? undefined : motivo}
        onClick={podeAlterar ? onClick : undefined}
        data-testid={testId}
      >
        {children}
      </Button>
    </>
  );
}
