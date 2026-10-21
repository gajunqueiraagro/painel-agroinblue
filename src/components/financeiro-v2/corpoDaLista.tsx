import { memo, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/* FIN-MODAL-FAZENDA-TRAVA-01 — o corpo da lista, memoizado pela chave (comparação item a item, `Object.is`). `desenhar` muda
   a cada render do pai e NÃO conta: com a chave igual, as linhas desenhadas antes ficam. */
export const rendersDoCorpoDaLista = { n: 0 };
/* Em desenvolvimento o contador fica na janela, para medir no navegador quantas vezes a lista redesenha. */
if (import.meta.env.DEV && typeof window !== 'undefined') Reflect.set(window, '__rendersDoCorpoDaLista', rendersDoCorpoDaLista);
export function mesmaChaveDaLista(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
export const CorpoDaListaMemo = memo(function CorpoDaLista({ desenhar }: { chave: readonly unknown[]; desenhar: () => ReactNode }) {
  rendersDoCorpoDaLista.n++;
  return <>{desenhar()}</>;
}, (a, b) => mesmaChaveDaLista(a.chave, b.chave));

/* FIN-MODAL-FAZENDA-TRAVA-01 — o "⋯" da linha. Fechado, é um botão comum; o primeiro clique (ou Enter/Espaço) monta o menu do
   Radix já aberto, e fechar o desmonta. Cada `DropdownMenu` montado registra um ouvinte de tecla no documento: montado em
   toda linha, cada tecla da tela (o fornecedor no modal, por exemplo) rodava milhares deles. Aparência e itens os de sempre. */
export function MenuDaLinhaSobDemanda({ itens }: { itens: () => ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const botao = (
    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm" title="Ações" aria-haspopup="menu"
      onClick={aberto ? undefined : () => setAberto(true)}>
      <MoreHorizontal className="h-3 w-3" />
    </Button>
  );
  if (!aberto) return botao;
  return (
    <DropdownMenu open onOpenChange={(o) => { if (!o) setAberto(false); }}>
      <DropdownMenuTrigger asChild>{botao}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">{itens()}</DropdownMenuContent>
    </DropdownMenu>
  );
}

