/**
 * Paginar até o fim — o laço que o PostgREST obriga, num lugar só.
 *
 * ⚠ O TETO É 1.000 E ELE NÃO AVISA. Um `select` sem `range` devolve no máximo mil linhas e
 * responde 200: quem não pagina mostra mil de quatro mil e diz que são todas. É o defeito
 * mais caro possível numa tela de conferência — o número está errado e a tela parece certa.
 *
 * ⚠ A CONTAGEM QUE DECIDE PARAR É A BRUTA, NUNCA A FILTRADA, e é por isso que `buscarLeva`
 * devolve as duas. O `fetchAllLancamentos` aplica um filtro residual sobre a leva antes de
 * acumular; se a decisão de parar olhasse o resultado do filtro, uma leva cheia que perdesse
 * uma linha para o filtro seria lida como "acabou" — e o resto da consulta sumiria em
 * silêncio, que é exatamente o que este módulo existe para impedir.
 */
export interface LevaPaginada<T> {
  /** O que entra no resultado — já filtrado, se o chamador filtra. */
  linhas: T[];
  /** Quantas o banco devolveu ANTES de qualquer filtro do chamador. */
  brutas: number;
}

export const TAMANHO_DA_LEVA = 1000;

export async function paginarTudo<T>(
  buscarLeva: (de: number, tamanho: number) => Promise<LevaPaginada<T>>,
  tamanhoDaLeva: number = TAMANHO_DA_LEVA,
): Promise<T[]> {
  const todos: T[] = [];
  let de = 0;
  for (;;) {
    const leva = await buscarLeva(de, tamanhoDaLeva);
    todos.push(...leva.linhas);
    if (leva.brutas < tamanhoDaLeva) break;
    de += tamanhoDaLeva;
  }
  return todos;
}
