/**
 * GRAVAR A IE DA FAZENDA PELA NOTA — NOTA-FAZENDA-PELA-IE-01 (Gabriel 22/10/2026). O padrao do cadastro do fornecedor: campo · hoje · da
 * nota, a previa do banco (`fn_fazenda_gravar_ie` simulada), o segundo clique grava (trilha em `audit_log`; "Desfazer" no aviso). So' em IE
 * vazia — a gravada diferente nunca e' trocada pela nota (quem chama nem oferece; o banco recusa com a frase). Modal fixo.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QUADRO_REGUA, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { gravarIeDaFazenda } from '@/lib/financeiro/nfeConsultas';
import { cn } from '@/lib/utils';

export function GravarIeDaFazendaDialog({ clienteId, fazenda, ie, referencia, onGravada, onClose, gravar = gravarIeDaFazenda }: {
  clienteId: string;
  fazenda: { id: string; nome: string };
  ie: string;
  referencia: string | null;
  onGravada: (trilhaId: string | null) => void;
  onClose: () => void;
  /** So' para teste. */
  gravar?: typeof gravarIeDaFazenda;
}) {
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  useEffect(() => {
    let vivo = true;
    void gravar(fazenda.id, ie, referencia, true, clienteId).then((r) => { if (!vivo) return; if (r.ok === false) setErro(r.frase); else setPrevia(r.frase); });
    return () => { vivo = false; };
  }, [gravar, fazenda.id, ie, referencia, clienteId]);
  const ir = async () => {
    setGravando(true); setErro(null);
    try {
      const r = await gravar(fazenda.id, ie, referencia, false, clienteId);
      if (r.ok === false) { setErro(r.frase); return; }
      onGravada(r.trilhaId);
      onClose();
    } finally { setGravando(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(250px,95vh)] w-[min(520px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="gravar-ie-fazenda">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Gravar a IE na fazenda</DialogTitle>
          <DialogDescription className="sr-only">Grava a inscrição estadual do destinatário da nota no cadastro da fazenda.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className={cn(QUADRO_REGUA, 'h-auto')}>
            <table className="w-full table-fixed border-collapse">
              <colgroup><col style={{ width: 130 }} /><col /><col /></colgroup>
              <thead className="bg-primary"><tr>{['Campo', `Hoje (${fazenda.nome})`, 'Da nota'].map((h) => <th key={h} className={cn(TH_REGUA, 'text-left')} title={h}>{h}</th>)}</tr></thead>
              <tbody><tr data-testid="gravar-ie-linha">
                <td className={TD_REGUA_TEXTO}>Inscrição estadual</td>
                <td className={cn(TD_REGUA_TEXTO, 'text-muted-foreground')}>(vazia)</td>
                <td className={cn(TD_REGUA_TEXTO, 'font-semibold tabular-nums')}>{ie}</td>
              </tr></tbody>
            </table>
          </div>
          <p className="min-h-0 flex-1 text-[10px] text-muted-foreground" data-testid="gravar-ie-previa">{previa ?? (erro ? '' : 'Conferindo no banco…')}</p>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="gravar-ie-erro" title={erro ?? undefined}>{erro ? `⚠ ${erro}` : ''}</span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[150px] shrink-0 px-2.5 text-[10.5px]" disabled={!previa || !!erro || gravando}
            onClick={() => { void ir(); }} data-testid="gravar-ie-confirmar">{gravando ? 'Gravando…' : 'Gravar a IE'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
