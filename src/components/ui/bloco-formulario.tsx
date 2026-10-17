/**
 * UI-MODAL-BLOCOS-01 · A PRIMITIVA DO FORMULÁRIO EM BLOCOS (o padrão aprovado no cadastro de contrato, 5a24dee3, Gabriel 17/10/2026).
 *
 *  · `CorpoFormulario` — o corpo do modal em cinza claro (o `bg-muted` da casa).
 *  · `BlocoFormulario` — o bloco branco de borda fina com o título pequeno (11px/600, sentence case), a dica (10px cinza, corta com
 *    `title`) e uma ação opcional à direita. É o bloco da tela do contrato, movido para cá (`ContratoDeCredito` o importa).
 *  · `Rotulo` — o rótulo do campo: 10px cinza, sentence case, uma linha (corta com o texto inteiro no `title`); `*` quando obrigatório.
 *  · `REGUA_CAMPO` — a classe do campo e do gatilho do seletor: 28px de altura, texto de 11px. CampoMoeda/CampoPercentual/Input a
 *    recebem; nunca o campo sem classe (cairia no tamanho padrão).
 * ⚠ SÓ APRESENTAÇÃO: nenhum estado, nenhum dado.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const BLOCO_FORMULARIO = 'flex min-w-0 flex-col rounded-lg border bg-card px-2 pb-1.5 pt-1';
export const REGUA_ROTULO = 'mb-0.5 truncate text-[10px] leading-[13px] text-muted-foreground';
export const REGUA_CAMPO = 'h-7 text-[11px]';

export function TituloDoBloco({ nome, dica, acao }: { nome: string; dica?: string; acao?: ReactNode }) {
  return (
    <div className="mb-1 flex h-[22px] min-w-0 items-center gap-2">
      <h3 className="shrink-0 text-[11px] font-semibold text-foreground">{nome}</h3>
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={dica}>{dica ?? ''}</span>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

export function BlocoFormulario({ titulo, dica, acao, children, className, testId }: {
  titulo: string; dica?: string; acao?: ReactNode; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <section className={cn(BLOCO_FORMULARIO, className)} data-testid={testId}>
      <TituloDoBloco nome={titulo} dica={dica} acao={acao} />
      {children}
    </section>
  );
}

export function CorpoFormulario({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <div className={cn('bg-muted', className)} data-testid={testId}>{children}</div>;
}

export function Rotulo({ texto, obrig, className }: { texto: string; obrig?: boolean; className?: string }) {
  return <div className={cn(REGUA_ROTULO, className)} title={texto}>{texto}{obrig ? ' *' : ''}</div>;
}
