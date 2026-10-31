/**
 * PATR-01 · PR B — peças pequenas do modal do bem: a régua das tabelas internas (a da casa, sem variante) e o pedido de motivo.
 */
import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { cn } from '@/lib/utils';

/** O cabeçalho navy preso das tabelas de dentro do modal (a régua da casa). */
export const TH_MODAL = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');
export const TH_MODAL_NUM = cn(TH_MODAL, 'text-right');
export const TD_MODAL = TD_REGUA;
export const TD_MODAL_TEXTO = TD_REGUA_TEXTO;
export const TD_MODAL_NUM = TD_REGUA_NUM;
/** O quadro da tabela interna: ocupa o resto do bloco e só ele rola (o modal não rola). */
export const QUADRO_MODAL = 'min-h-0 flex-1 overflow-x-hidden overflow-y-scroll rounded border bg-card';
/** O rodapé preso da tabela interna (dentro do mesmo scrollport). */
export const TFOOT_MODAL = 'sticky bottom-0 bg-primary text-primary-foreground font-semibold';

/** A linha de ações abaixo da tabela (links "+ …" à esquerda, informação à direita): altura fixa. */
export function Barra({ children }: { children: ReactNode }) {
  return <div className="mt-1 flex h-[22px] shrink-0 items-center gap-3 text-[10px]">{children}</div>;
}

export function Link({ children, onClick, disabled, title, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; testId?: string }) {
  return (
    <button type="button" className={cn('whitespace-nowrap text-[10px] font-medium text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline')}
      onClick={onClick} disabled={disabled} title={title} data-testid={testId}>{children}</button>
  );
}

/** Pede o motivo de um gesto contrário (desligar, cancelar, remover) — o banco recusa sem ele. */
export function PedirMotivo({ titulo, frase, rotuloDoBotao, aberto, aoFechar, aoConfirmar }: {
  titulo: string; frase: string; rotuloDoBotao: string; aberto: boolean; aoFechar: () => void; aoConfirmar: (motivo: string) => Promise<string | null>;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const confirmar = async () => {
    if (!motivo.trim()) { setErro('Informe o motivo.'); return; }
    setIndo(true);
    const e = await aoConfirmar(motivo.trim());
    setIndo(false);
    if (e) setErro(e); else { setMotivo(''); setErro(null); aoFechar(); }
  };
  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[176px] w-[420px] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="pedir-motivo">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{frase}</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 bg-muted p-2">
          <p className="text-[10px] text-muted-foreground">{frase}</p>
          <Input autoFocus value={motivo} onChange={e => { setMotivo(e.target.value); setErro(null); }} placeholder="motivo"
            className={cn(REGUA_CAMPO, erro && 'border-destructive')} onKeyDown={e => { if (e.key === 'Enter') void confirmar(); }} />
          <p className="h-[13px] text-[10px] text-destructive">{erro ?? ''}</p>
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] text-[11px]" disabled={indo} onClick={() => void confirmar()}>{rotuloDoBotao}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
