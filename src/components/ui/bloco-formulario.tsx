/**
 * UI-MODAL-BLOCOS-01 · A PRIMITIVA DO FORMULÁRIO EM BLOCOS (padrão único do sistema — Gabriel 18/10/2026: "título na borda").
 *
 *  · `CorpoFormulario` — o corpo do modal em cinza claro (o `bg-muted` da casa), padding 8px; os blocos com 8px entre eles.
 *  · `BlocoFormulario` — o bloco branco de borda fina. O TÍTULO fica SOBRE a borda superior, como legenda de fieldset (11px/600,
 *    sentence case, fundo = o cinza do corpo, px-1, a 8px da esquerda); a dica (10px cinza, corta com `title`) segue o título e a ação
 *    (ex. "+ adicionar") fica na borda à direita. Não há faixa de título: o 1º rótulo começa 10px abaixo da borda (14px com ação, que é
 *    um botão de 20px centrado na borda). O mesmo bloco serve a tela do contrato, o cadastro e os modais de formulário.
 *  · `Rotulo` — o rótulo do campo: 10px cinza, sentence case, uma linha (corta com o texto inteiro no `title`), colado no campo (2px);
 *    `*` quando obrigatório. Na grade, 4px entre linhas (`GRADE_FORMULARIO`).
 *  · `REGUA_CAMPO` — a classe do campo e do gatilho do seletor: 28px de altura, texto de 11px. CampoMoeda/CampoPercentual/Input a
 *    recebem; nunca o campo sem classe (cairia no tamanho padrão).
 * ⚠ SÓ APRESENTAÇÃO: nenhum estado, nenhum dado. O fundo da legenda é `bg-muted`, que é o mesmo tom do `bg-background` das telas.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const BLOCO_FORMULARIO = 'relative flex min-w-0 flex-col rounded-lg border bg-card px-2 pb-1.5 pt-2.5';
/** o bloco cujo título tem ação (botão de 20px na borda): 4px a mais no topo para o botão não encostar no conteúdo */
export const BLOCO_FORMULARIO_COM_ACAO = 'relative flex min-w-0 flex-col rounded-lg border bg-card px-2 pb-1.5 pt-3.5';
export const REGUA_ROTULO = 'mb-0.5 truncate text-[10px] leading-[13px] text-muted-foreground';
export const REGUA_CAMPO = 'h-7 text-[11px]';
export const GRADE_FORMULARIO = 'grid items-start gap-x-3 gap-y-1';
/** o corpo: cinza, 8px de padding e 8px entre os blocos (a legenda de 14px cabe no vão) */
export const CORPO_FORMULARIO = 'flex flex-col gap-2 bg-muted p-2';

export function TituloDoBloco({ nome, dica, acao }: { nome: string; dica?: string; acao?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 -top-[7px] flex h-[14px] min-w-0 items-center justify-between gap-2" data-legenda="">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 bg-muted px-1">
        <h3 className="shrink-0 text-[11px] font-semibold leading-[14px] text-foreground">{nome}</h3>
        {dica && <span className="min-w-0 truncate text-[10px] leading-[14px] text-muted-foreground" title={dica}>{dica}</span>}
      </div>
      {acao && <div className="pointer-events-auto flex shrink-0 items-center bg-muted px-1">{acao}</div>}
    </div>
  );
}

export function BlocoFormulario({ titulo, dica, acao, children, className, testId }: {
  titulo: string; dica?: string; acao?: ReactNode; children: ReactNode; className?: string; testId?: string;
}) {
  return (
    <section className={cn(acao ? BLOCO_FORMULARIO_COM_ACAO : BLOCO_FORMULARIO, className)} data-testid={testId}>
      <TituloDoBloco nome={titulo} dica={dica} acao={acao} />
      {children}
    </section>
  );
}

export function CorpoFormulario({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return <div className={cn(CORPO_FORMULARIO, className)} data-testid={testId}>{children}</div>;
}

export function Rotulo({ texto, obrig, className }: { texto: string; obrig?: boolean; className?: string }) {
  return <div className={cn(REGUA_ROTULO, className)} title={texto}>{texto}{obrig ? ' *' : ''}</div>;
}
