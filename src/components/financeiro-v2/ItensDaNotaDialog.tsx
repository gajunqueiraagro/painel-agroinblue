/**
 * OS ITENS DA NOTA NUM MODAL — ITENS-NOTA-01. O caminho da aba Documentos da OC: a MESMA `ItensDaNota` do lancamento, num modal fixo
 * (a medida do mock, 1126x579; sem rolagem: a tabela rola dentro). Le^ o guardado pela chave.
 * DOC-NOTA-XML-PDF-01 — a aba Documentos do lancamento abre a nota SEM PDF aqui (o XML nunca cru): sem itens guardados, le^ o proprio
 * arquivo (`lerArquivo`) pelo MESMO leitor do "+ Da nota" — so' le^, nada e' gravado.
 */
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ItensDaNota } from './ItensDaNota';
import { lerItensGuardados, notaComItensDoArquivo } from '@/lib/financeiro/itensDaNotaBanco';
import type { NotaComItens } from '@/hooks/useItensDaNota';

export function ItensDaNotaDialog({ clienteId, chave, onClose, carregar = lerItensGuardados, lerArquivo }: {
  clienteId: string;
  chave: string;
  onClose: () => void;
  /** os bytes do XML da nota, para quando os itens ainda nao estao guardados */
  lerArquivo?: () => Promise<ArrayBuffer | null>;
  /** So' para teste/bancada. */
  carregar?: (clienteId: string, chaves: readonly string[]) => Promise<NotaComItens | null>;
}) {
  const [nota, setNota] = useState<NotaComItens | null | 'lendo'>('lendo');
  /* quem chama passa uma funcao nova a cada render: a leitura e' a da abertura (a nota nao muda com o modal aberto) */
  const lerArquivoRef = useRef(lerArquivo);
  lerArquivoRef.current = lerArquivo;
  const comArquivo = !!lerArquivo;
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const guardada = await carregar(clienteId, [chave]);
      const ler = lerArquivoRef.current;
      if (guardada || !ler) return guardada;
      const bytes = await ler();
      return bytes ? notaComItensDoArquivo(bytes) : null;
    })().then((n) => { if (vivo) setNota(n); }, () => { if (vivo) setNota(null); });
    return () => { vivo = false; };
  }, [clienteId, chave, carregar, comArquivo]);
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
              : <p className="text-[11px] text-muted-foreground">{comArquivo ? 'Os itens desta nota não puderam ser lidos.' : 'Esta nota ainda não tem itens guardados.'}</p>}
        </div>
        <div className="flex h-9 shrink-0 items-center justify-end border-t bg-card px-3">
          <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
