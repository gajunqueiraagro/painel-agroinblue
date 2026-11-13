/**
 * FIN-FINANC-LAYOUT-03 (Gabriel 12/11, regra soberana de 29/10: "ordenação em toda tabela") — a ORDEM das tabelas do contrato
 * (Cronograma, Liberações, Pagamentos, Documentos, Histórico) e da lista de Financiamentos: um dono só.
 *  · o clique na coluna ativa inverte; noutra coluna começa na direção dela (data e texto: crescente);
 *  · vazio (nulo / '') vai SEMPRE para o fim, nas duas direções (nunca vira zero nem "a");
 *  · empate mantém a ordem que veio do banco (ordenação estável);
 *  · texto sem acento e sem caixa (pt-BR), com número dentro do texto em ordem de número ("Parcela 2" antes de "Parcela 10").
 * Só reordena as linhas: total e soma vêm prontos de quem os calcula e ficam no rodapé.
 */
export type Direcao = 'asc' | 'desc';
export interface Ordem<K extends string> { col: K; dir: Direcao }
export type ValorDeOrdem = string | number | null | undefined;

const comparador = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const vazio = (v: ValorDeOrdem): boolean => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

/** Compara dois valores de uma coluna na direção pedida; vazio sempre por último. */
export function compararValores(a: ValorDeOrdem, b: ValorDeOrdem, dir: Direcao): number {
  const va = vazio(a); const vb = vazio(b);
  if (va || vb) return va === vb ? 0 : va ? 1 : -1;
  const s = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : (a < b ? -1 : 1) * s;
  return comparador.compare(String(a), String(b)) * s;
}

/** As linhas na ordem pedida (cópia; a lista de entrada não muda). */
export function ordenarPor<T, K extends string>(linhas: readonly T[], ordem: Ordem<K>, valor: (linha: T, col: K) => ValorDeOrdem): T[] {
  return linhas
    .map((linha, i) => ({ linha, i, v: valor(linha, ordem.col) }))
    .sort((x, y) => compararValores(x.v, y.v, ordem.dir) || x.i - y.i)
    .map((x) => x.linha);
}

/** A ordem depois do clique na coluna `col`: a ativa inverte; outra começa na direção inicial dela. */
export function proximaOrdem<K extends string>(atual: Ordem<K>, col: K, inicial: Direcao = 'asc'): Ordem<K> {
  return atual.col === col ? { col, dir: atual.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: inicial };
}
