import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
/* FIN-V2-LISTA-VIRTUAL-01 (Gabriel 21/10/2026) — SÓ AS LINHAS À VISTA SÃO DESENHADAS. Com o NJ em Global (5.279 linhas) a
   tabela tinha ~150 mil nós, e cada gesto da página (abrir o modal, a trava de rolagem do Radix) recalculava estilo sobre todos.
   A linha tem ALTURA FIXA (`ALTURA_DA_LINHA`), então a janela é aritmética pura: as linhas acima e abaixo viram duas linhas
   espaçadoras com a altura delas, o scrollport rola o mesmo tanto, e o cabeçalho segue preso nele. Sem biblioteca: altura fixa
   numa `<table>` é uma conta, e as bibliotecas de janela pedem `div` absoluto (perderíamos o `colgroup` e o `sticky` do thead).
   Totais, contagens e seleção continuam sobre TODOS os lançamentos — eles não passam por aqui. */
export const ALTURA_DA_LINHA = 19;
export const FOLGA_DE_LINHAS = 15;
/* A janela anda em degraus de `PASSO_DA_JANELA` linhas: rolar uma linha não redesenha o corpo, só cruzar um degrau. */
export const PASSO_DA_JANELA = 10;
/** Quais linhas desenhar: as que cabem no scrollport a partir de onde o corpo começa, mais `folga` de cada lado, em degraus. */
/* A janela NÃO se prende ao total (o corpo prende na hora de desenhar): trocar o dado sem mudar a rolagem não redesenha duas vezes. */
export function janelaDasLinhas(rolado: number, alturaVisivel: number, folga = FOLGA_DE_LINHAS, altura = ALTURA_DA_LINHA): { inicio: number; fim: number } {
  const primeira = Math.floor(Math.max(0, rolado) / altura);
  const cabem = Math.ceil(Math.max(0, alturaVisivel) / altura) + 1;
  const inicio = Math.max(0, Math.floor((primeira - folga) / PASSO_DA_JANELA) * PASSO_DA_JANELA);
  const fim = Math.ceil((primeira + cabem + folga) / PASSO_DA_JANELA) * PASSO_DA_JANELA;
  return { inicio, fim };
}
/* Sem medida (teste, ou antes do layout) vale a altura da janela: nunca a lista inteira. */
const alturaDe = (el: HTMLElement | null) => (el?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0) || 800);

export const CorpoDaListaMemo = memo(function CorpoDaLista({ total, colunas, rolagem, desenhar }: {
  chave: readonly unknown[]; total: number; colunas: number; rolagem: RefObject<HTMLElement>;
  desenhar: (inicio: number, fim: number) => ReactNode;
}) {
  rendersDoCorpoDaLista.n++;
  const topoRef = useRef<HTMLTableRowElement>(null);
  const [janela, setJanela] = useState(() => janelaDasLinhas(0, alturaDe(null)));
  /* A janela atual, para só chamar o `setJanela` quando ela muda (o "set com o mesmo valor" ainda redesenha uma vez). */
  const janelaRef = useRef(janela);
  janelaRef.current = janela;
  useEffect(() => {
    const sc = rolagem.current;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const el = topoRef.current;
      /* Onde o corpo começa dentro do scrollport (o cabeçalho e o que vier antes da tabela). */
      const deslocamento = sc && el ? el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : 0;
      const nova = janelaDasLinhas((sc?.scrollTop ?? 0) - deslocamento, alturaDe(sc));
      const j = janelaRef.current;
      if (j.inicio !== nova.inicio || j.fim !== nova.fim) setJanela(nova);
    };
    const pedir = () => { if (!quadro) quadro = requestAnimationFrame(medir); };
    medir();
    sc?.addEventListener('scroll', pedir, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' && sc ? new ResizeObserver(pedir) : null;
    if (ro && sc) ro.observe(sc);
    return () => { sc?.removeEventListener('scroll', pedir); ro?.disconnect(); if (quadro) cancelAnimationFrame(quadro); };
  }, [rolagem, total]);
  const fim = Math.min(janela.fim, total);
  const inicio = Math.min(janela.inicio, fim);
  const espaco = (n: number, chave: string, ref?: RefObject<HTMLTableRowElement>) => (
    <tr ref={ref} key={chave} aria-hidden data-espaco-da-lista={chave} style={{ height: n * ALTURA_DA_LINHA }} className="!border-0">
      <td colSpan={colunas} className="espaco-da-lista" style={{ height: n * ALTURA_DA_LINHA }} />
    </tr>
  );
  return <>
    {espaco(inicio, 'antes', topoRef)}
    {desenhar(inicio, fim)}
    {espaco(total - fim, 'depois')}
  </>;
}, (a, b) => a.total === b.total && a.colunas === b.colunas && mesmaChaveDaLista(a.chave, b.chave));

/* FIN-MODAL-FAZENDA-TRAVA-01 — o "⋯" da linha. Fechado, é um botão comum; o primeiro clique (ou Enter/Espaço) monta o menu do
   Radix já aberto, e fechar o desmonta. Cada `DropdownMenu` montado registra um ouvinte de tecla no documento: montado em
   toda linha, cada tecla da tela (o fornecedor no modal, por exemplo) rodava milhares deles. Aparência e itens os de sempre. */
export function MenuDaLinhaSobDemanda({ itens }: { itens: () => ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const botao = (
    <Button variant="ghost" size="icon" className="h-4 w-4 rounded-sm" title="Ações" aria-haspopup="menu"
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

