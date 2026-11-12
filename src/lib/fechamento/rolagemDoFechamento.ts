/**
 * FECH-ROLAGEM-02 (Chat 11/11 12:53, Pureza out/26) — a rolagem da tela do Fechamento de pastos.
 * (2) Depois de Salvar um pasto lá de baixo a tela voltava ao TOPO: o modal fecha → `loadFechamentos` liga o `loading` → a grade inteira
 *     virava "Carregando..." → a página encolhia e o navegador zerava a rolagem. O "Carregando..." é só da PRIMEIRA leitura do mês (nada
 *     daquele mês e daquela fazenda na mão); a releitura troca os cards no lugar, a página não encolhe e a rolagem fica onde estava.
 * (1) A linha "Cards | Mapa" (e a faixa "Sem desenho no mapa") fica PRESA logo abaixo do cabeçalho fixo: a altura dele é medida e
 *     vai na variável `--topo-do-fechamento`, que a linha usa como `top`.
 */
export const VAR_TOPO = '--topo-do-fechamento';
export const CLASSE_LINHA_PRESA = 'sticky top-[var(--topo-do-fechamento,0px)] z-10 bg-background';

interface CardDoMes { ano_mes: string; fazenda_id: string }

/** "Carregando..." no lugar dos cards SÓ quando ainda não há card nenhum deste mês desta fazenda (releitura = os cards ficam). */
export function soNaPrimeiraLeitura(loading: boolean, fechamentos: readonly CardDoMes[], anoMes: string, fazendaId: string | null | undefined): boolean {
  return loading && !fechamentos.some(f => f.ano_mes === anoMes && f.fazenda_id === fazendaId);
}

/** Mede o cabeçalho fixo e escreve a altura na variável do pai (sem render: o ResizeObserver acompanha a janela e a faixa que cresce). */
export function medirTopo(topo: HTMLElement | null): () => void {
  const area = topo?.parentElement;
  if (!topo || !area) return () => {};
  const medir = () => area.style.setProperty(VAR_TOPO, `${topo.offsetHeight}px`);
  medir();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(medir);
  ro.observe(topo);
  return () => ro.disconnect();
}
