import { useLayoutEffect, useState } from 'react';

/**
 * PIQUETE-VIGENCIA-01 (gate a 918 px = 135% de 1240, Gabriel 06/11): a barra do polígono na Validação não cabia ao lado dos botões do
 * topo (com a lista aberta sobram ~390 px) — o nome sumia e Classificar/Apagar/Fechar saíam da barra, já antes do "Mudar mês de início".
 * A barra só vira COMPACTA quando a inteira não cabe; onde cabe, nada muda de lugar. A medida da inteira é a de quando ela estava inteira
 * (o nome sem corte, até o teto dele), e ela volta inteira assim que a largura livre der de novo.
 */

/** a largura que a barra INTEIRA pede: a que ela ocupa + o que falta ao nome cortado (até o teto do nome) */
export function larguraInteiraDaBarra(barra: { scrollWidth: number }, nome: { scrollWidth: number; clientWidth: number } | null, tetoDoNome: number): number {
  if (!nome) return barra.scrollWidth;
  return barra.scrollWidth + Math.max(0, Math.min(nome.scrollWidth, tetoDoNome) - nome.clientWidth);
}

/** a largura livre para a barra: a faixa do topo menos os botões da direita e o espaço entre os dois. Faixa SEM largura = ainda não desenhada
 *  (ou o jsdom dos testes): sem medida, a barra fica inteira (Infinity) — nunca compacta por engano */
export function larguraLivre(topo: { clientWidth: number }, botoes: { offsetWidth: number } | null, espaco: number): number {
  if (topo.clientWidth <= 0) return Number.POSITIVE_INFINITY;
  return topo.clientWidth - (botoes ? botoes.offsetWidth + espaco : 0);
}

export const cabeInteira = (livre: number, inteira: number): boolean => inteira <= livre + 0.5;

/** `chave` = o polígono em foco: trocou, a barra nasce inteira e se mede de novo */
export function useBarraQueCabe(chave: unknown, tetoDoNome = 260) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [inteira, setInteira] = useState<number | null>(null);
  const [compacta, setCompacta] = useState(false);
  useLayoutEffect(() => { setInteira(null); setCompacta(false); }, [chave]);
  useLayoutEffect(() => {
    if (!el) return;
    const topo = el.closest('[data-testid="validacao-topo"]');
    if (!(topo instanceof HTMLElement)) return;
    const medir = () => {
      const botoes = topo.querySelector('[data-cromo="botoes"]');
      const livre = larguraLivre(topo, botoes instanceof HTMLElement ? botoes : null, 8);
      if (!compacta) {
        const nome = el.querySelector('[data-testid="validacao-painel-nome"]');
        const w = larguraInteiraDaBarra(el, nome instanceof HTMLElement ? nome : null, tetoDoNome);
        setInteira(w);
        if (!cabeInteira(livre, w)) setCompacta(true);
      } else if (inteira != null && cabeInteira(livre, inteira)) {
        setCompacta(false);
      }
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(topo);
    return () => ro.disconnect();
  }, [el, compacta, inteira, tetoDoNome]);
  return { ref: setEl, compacta };
}
