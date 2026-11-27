/**
 * NOTA-ABRIR-RAPIDO-01 (Gabriel 27/11 17:06) — o modal abre NO CLIQUE do "Lançar" (antes: segundos sem nada na tela enquanto o XML, o
 * fornecedor, a sugestão pelos itens e a "já lançada?" corriam). Mesmo tamanho e mesma faixa do Novo Lançamento (nada pula quando ele chega),
 * com a peça de carregamento da marca (`CarregandoAgroinblue`, a da abertura) e "Abrindo a nota…".
 */
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CarregandoAgroinblue } from '@/components/marca/LogoAgroinblue';

export function AbrindoANota({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="flex h-[calc(100vh-32px)] max-h-none max-w-5xl flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-2xl [&>button:last-child]:hidden"
        data-testid="abrindo-a-nota">
        <div className="flex h-9 shrink-0 items-center bg-primary px-4 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Novo Lançamento</DialogTitle>
        </div>
        <DialogDescription className="sr-only">Abrindo a nota da Receita no Novo Lançamento.</DialogDescription>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <CarregandoAgroinblue frase="Abrindo a nota…" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
