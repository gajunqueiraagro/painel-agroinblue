/**
 * P132 — o agrupamento dos MENORES numa linha só se chama "Demais (N)", nunca "Outros": o plano tem um centro real chamado "Outros"
 * (Custeio Pecuária), e as duas linhas apareciam com o mesmo nome e a mesma chave do React. O centro real fica com o nome dele; a
 * linha agrupada tem chave própria (`CHAVE_DEMAIS`).
 */
export const CHAVE_DEMAIS = '__demais__';

export const rotuloDemais = (n: number): string => `Demais (${n})`;

/**
 * Os `topN` primeiros (já ordenados) + a linha "Demais (N)" com os outros, quando houver. `juntar` recebe o resto e o rótulo e devolve a
 * linha agrupada; a chave de cada linha sai de `chaveDe` (a agrupada é `CHAVE_DEMAIS`).
 */
export function agruparDemais<T>(
  ordenados: T[],
  topN: number,
  chaveDe: (item: T) => string,
  juntar: (resto: T[], rotulo: string) => T,
): Array<{ item: T; chave: string; agrupada: boolean }> {
  const top = ordenados.slice(0, topN).map((item) => ({ item, chave: chaveDe(item), agrupada: false }));
  const resto = ordenados.slice(topN);
  if (resto.length === 0) return top;
  return [...top, { item: juntar(resto, rotuloDemais(resto.length)), chave: CHAVE_DEMAIS, agrupada: true }];
}
