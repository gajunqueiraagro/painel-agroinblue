/**
 * UI-MODAL-BLOCOS-01 · A PRIMITIVA DO FORMULÁRIO EM BLOCOS (padrão único do sistema; CORREÇÃO do Gabriel 18/10/2026: o título volta
 * para DENTRO do bloco — o "título na borda" de 53c9434f foi reprovado).
 *
 *  · `CorpoFormulario` — o corpo do modal em cinza claro (o `bg-muted` da casa), padding 8px; 6px entre os blocos.
 *  · `BlocoFormulario` — o bloco branco de borda fina, padding 6px topo / 10px lados / 6px base. O TÍTULO fica DENTRO, numa linha de
 *    16px (11px/600, sentence case) com a linha fina COLADA embaixo e 4px até os rótulos; a dica (10px cinza, corta com `title`)
 *    segue o título e a ação (ex. "+ adicionar") fica na mesma linha, à direita, dentro do bloco. Sem fundo atrás do título e sem
 *    posicionamento absoluto. (UI-MODAL-BLOCOS-01 · LANCAMENTO COMPACTO, Gabriel 18/10/2026 15:45: era 18px de linha + 6px de vão,
 *    e o padding 6/12/8 — o "vão até o 1º rótulo" do print.)
 *  · `Rotulo` — o rótulo do campo: 10px cinza, sentence case, uma linha de 13px (corta com o texto inteiro no `title`), colado no
 *    campo (2px); `*` quando obrigatório. Na grade, 4px entre linhas (`GRADE_FORMULARIO`). ⚠ É BLOCO, NÃO INLINE: um `<label>` inline
 *    dentro de um div herda a caixa de linha do pai (16px/24px) e ocupa 24px — `REGUA_ROTULO` serve também ao `Label` da casa.
 *  · `REGUA_CAMPO` — a classe do campo e do gatilho do seletor: 28px de altura, texto de 11px.
 * ⚠ SÓ APRESENTAÇÃO: nenhum estado, nenhum dado.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const BLOCO_FORMULARIO = 'flex min-w-0 flex-col rounded-lg border bg-card px-2.5 pb-1.5 pt-1.5';
export const REGUA_ROTULO = 'mb-0.5 block truncate text-[10px] font-normal leading-[13px] text-muted-foreground';
export const REGUA_CAMPO = 'h-7 text-[11px]';
export const GRADE_FORMULARIO = 'grid items-start gap-x-3 gap-y-1';
/** o corpo: cinza, 8px de padding e 6px entre os blocos */
export const CORPO_FORMULARIO = 'flex flex-col gap-1.5 bg-muted p-2';

export function TituloDoBloco({ nome, dica, acao }: { nome: string; dica?: string; acao?: ReactNode }) {
  return (
    <div className="mb-1 flex min-h-[16px] min-w-0 items-center gap-2 border-b border-border/60" data-titulo-do-bloco="">
      <h3 className="shrink-0 text-[11px] font-semibold leading-[15px] text-foreground">{nome}</h3>
      {/* FIN-CONTRATO-TELA-FONTE-01 — a dica não corta com "…": rola dentro do lugar dela (`.uma-linha-que-rola`, UI-SEM-CORTE-01) */}
      <span className="uma-linha-que-rola min-w-0 flex-1 text-[10px] leading-[15px] text-muted-foreground" title={dica}>{dica ?? ''}</span>
      {acao && <div className="flex shrink-0 items-center">{acao}</div>}
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
  return <div className={cn(CORPO_FORMULARIO, className)} data-testid={testId}>{children}</div>;
}

export function Rotulo({ texto, obrig, className }: { texto: string; obrig?: boolean; className?: string }) {
  return <div className={cn(REGUA_ROTULO, className)} title={texto}>{texto}{obrig ? ' *' : ''}</div>;
}
