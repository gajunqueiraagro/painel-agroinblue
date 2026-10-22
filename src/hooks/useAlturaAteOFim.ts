/**
 * TABELA-ALTURA-FIXA-01 (Gabriel, 22/10/2026: "a última linha ficar subindo… não teria como deixar a tabela padrão?") — a altura do
 * quadro de uma tabela vai do topo dele até o fim da janela, SEMPRE, com 5.303 linhas ou com nenhuma: cabeçalho, totais e a barra do
 * rodapé ficam no mesmo lugar e o espaço que sobra fica DENTRO do quadro. A altura depende só de onde o quadro começa (o que está
 * acima dele e a janela), nunca do número de linhas — antes era um `maxHeight` e o quadro encolhia junto com a lista.
 *   · o topo é medido com a página no início (soma a rolagem dos ancestrais), então rolar a página não muda a altura;
 *   · relê ao redimensionar a janela e quando o que está acima muda de altura (a faixa dos totais quebrando, um aviso aparecendo);
 *   · `minimo`: numa janela muito baixa o quadro não some (a página rola, como antes).
 */
import { useCallback, useLayoutEffect, useState } from 'react';

/** a altura do quadro: do topo dele (com a página no início) até o fim da janela, menos a folga; nunca abaixo do mínimo */
export function alturaAteOFim(topoNaPagina: number, alturaDaJanela: number, folga: number, minimo: number): number {
  return Math.max(minimo, Math.floor(alturaDaJanela - topoNaPagina - folga));
}

/** onde o elemento começa com tudo rolado para o início: a posição de agora + a rolagem de cada ancestral e da janela */
export function topoNaPagina(el: HTMLElement): number {
  let rolado = window.scrollY;
  for (let a = el.parentElement; a; a = a.parentElement) rolado += a.scrollTop;
  return el.getBoundingClientRect().top + rolado;
}

/** devolve o `ref` (de função: o quadro pode nascer depois, quando a lista chega) e a altura; desligado (`ativo` falso) = `undefined` */
export function useAlturaAteOFim({ ativo = true, folga = 8, minimo = 200 }: { ativo?: boolean; folga?: number; minimo?: number } = {}):
  { ref: (el: HTMLElement | null) => void; altura: number | undefined } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [altura, setAltura] = useState<number | undefined>(undefined);
  const medir = useCallback(() => {
    if (el) setAltura(alturaAteOFim(topoNaPagina(el), window.innerHeight, folga, minimo));
  }, [el, folga, minimo]);
  useLayoutEffect(() => {
    if (!ativo || !el) { setAltura(undefined); return; }
    medir();
    window.addEventListener('resize', medir);
    /* o que está acima muda de altura: observar o pai (a própria troca de altura do quadro relê o mesmo topo e não muda nada) */
    const pai = el.parentElement;
    const obs = typeof ResizeObserver === 'undefined' || !pai ? null : new ResizeObserver(medir);
    if (obs && pai) obs.observe(pai);
    return () => { window.removeEventListener('resize', medir); obs?.disconnect(); };
  }, [ativo, el, medir]);
  return { ref: setEl, altura };
}
