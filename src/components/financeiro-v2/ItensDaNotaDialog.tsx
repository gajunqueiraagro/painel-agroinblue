/**
 * OS ITENS DA NOTA NUM MODAL — ITENS-NOTA-01. O caminho da aba Documentos da OC: a MESMA `ItensDaNota` do lancamento, num modal fixo
 * (a medida do mock, 1126x579; sem rolagem: a tabela rola dentro). Le^ o guardado pela chave.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ItensDaNota } from './ItensDaNota';
import { lerItensGuardados } from '@/lib/financeiro/itensDaNotaBanco';
import type { NotaComItens } from '@/hooks/useItensDaNota';

export function ItensDaNotaDialog({ clienteId, chave, onClose, carregar = lerItensGuardados }: {
  clienteId: string;
  chave: string;
  onClose: () => void;
  /** So' para teste/bancada. */
  carregar?: (clienteId: string, chaves: readonly string[]) => Promise<NotaComItens | null>;
}) {
  const [nota, setNota] = useState<NotaComItens | null | 'lendo'>('lendo');
  useEffect(() => {
    let vivo = true;
    void carregar(clienteId, [chave]).then((n) => { if (vivo) setNota(n); }).catch(() => { if (vivo) setNota(null); });
    return () => { vivo = false; };
  }, [clienteId, chave, carregar]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[min(579px,95vh)] w-[min(1126px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="itens-da-nota-dialog">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Itens da nota</DialogTitle>
          <DialogDescription className="sr-only">Os itens do documento fiscal, com os totais e a prova da soma.</DialogDescription>
        </div>
        <div className="min-h-0 flex-1 bg-muted p-2">
          {nota === 'lendo' ? <p className="text-[11px] text-muted-foreground">Lendo os itens…</p>
            : nota ? <ItensDaNota cabecalho={nota.cabecalho} lidos={nota.lidos} />
              : <p className="text-[11px] text-muted-foreground">Esta nota ainda não tem itens guardados.</p>}
        </div>
        <div className="flex h-9 shrink-0 items-center justify-end border-t bg-card px-3">
          <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
