/**
 * FISCAL onda 1 (a) — A PRÉVIA DE TODA GRAVAÇÃO DA TELA DE PRODUTORES (FIN-NJ-BRDE-01: nada grava sem a prévia do próprio banco).
 *
 * ⚠ O GESTO É UM SÓ, EM DOIS TEMPOS: `pedir(simular)` vai ao banco com `simular = true` → a prévia (frase, o que muda, avisos) abre aqui
 * → "Gravar" repete o MESMO pedido com `simular = false`. A recusa do banco fica na faixa do diálogo (nunca toast, UX-TOAST-01). Sem
 * mudança ("nada muda"), o Gravar fica apagado e diz por quê.
 * ⚠ TAMANHO FIXO (460 × 300): a lista da prévia rola dentro do lugar dela; nada muda de tamanho com a resposta.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { lerPrevia, type Previa } from '@/lib/fiscal/produtores';
import type { Resultado } from '@/lib/fiscal/produtoresApi';
import { useRelerProdutores } from '@/hooks/useProdutores';

export type Pedido = (simular: boolean) => Promise<Resultado<unknown>>;

/** O estado do gesto: quem chama dá o pedido; o hook cuida da prévia, da gravação e da releitura. */
export function useGestoComPrevia(nomes: ReadonlyMap<string, string>) {
  const reler = useRelerProdutores();
  const [aberto, setAberto] = useState<{ titulo: string; previa: Previa; pedido: Pedido; depois?: (r: unknown) => void } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  /** Pede a prévia. Devolve a frase da recusa (para quem chamou pôr no rodapé dele) ou null. */
  const previa = async (titulo: string, pedido: Pedido, depois?: (r: unknown) => void): Promise<string | null> => {
    setIndo(true);
    const r = await pedido(true);
    setIndo(false);
    if (!r.ok) return r.erro;
    setErro(null);
    setAberto({ titulo, previa: lerPrevia(r.dados, nomes), pedido, depois });
    return null;
  };
  const gravar = async () => {
    if (!aberto) return;
    setIndo(true);
    const r = await aberto.pedido(false);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    const depois = aberto.depois;
    setAberto(null);
    toast.success('Gravado.');
    void reler();
    depois?.(r.dados);
  };
  const dialogo = (
    <PreviaDoBanco aberto={aberto} erro={erro} indo={indo} aoFechar={() => { setAberto(null); setErro(null); }} aoGravar={() => void gravar()} />
  );
  return { previa, dialogo, indo };
}

function PreviaDoBanco({ aberto, erro, indo, aoFechar, aoGravar }: {
  aberto: { titulo: string; previa: Previa } | null; erro: string | null; indo: boolean; aoFechar: () => void; aoGravar: () => void;
}) {
  const p = aberto?.previa;
  return (
    <Dialog open={!!aberto} onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[300px] w-[460px] max-w-[calc(100vw-16px)] flex-col gap-0 overflow-hidden p-0 [&>button]:top-2 [&>button]:text-primary-foreground"
        data-testid="produtores-previa">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={aberto?.titulo}>{aberto?.titulo ?? ''}</DialogTitle>
          <DialogDescription className="sr-only">Prévia: nada foi gravado ainda.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 bg-muted p-2">
          <p className="shrink-0 text-[11px] font-semibold" data-testid="produtores-previa-frase">{p?.frase || 'Prévia'}</p>
          <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-card px-2 py-1">
            {(p?.linhas ?? []).map((l, i) => <p key={`l${i}`} className="text-[10px] leading-[15px]">{l}</p>)}
            {(p?.avisos ?? []).map((a, i) => <p key={`a${i}`} className="text-[10px] leading-[15px] text-amber-800">⚠ {a}</p>)}
            {p && !p.linhas.length && !p.avisos.length && <p className="text-[10px] text-muted-foreground">sem detalhes</p>}
          </div>
          <p className={cn('h-[13px] shrink-0 truncate text-[10px]', erro ? 'text-destructive' : 'text-muted-foreground')} title={erro ?? undefined}
            data-testid="produtores-previa-erro">{erro ?? 'nada foi gravado ainda'}</p>
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t bg-card px-3">
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] w-[72px] text-[11px]" disabled={indo || !!p?.nadaMuda} title={p?.nadaMuda ? 'nada muda: não há o que gravar' : undefined}
            onClick={aoGravar} data-testid="produtores-previa-gravar">{indo ? 'Gravando…' : 'Gravar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
