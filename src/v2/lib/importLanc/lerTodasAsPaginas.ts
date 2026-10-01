/**
 * Lê uma lista grande do PostgREST INTEIRA — PR-CONC-EXCEL-SESSAO-E-DEPARA-01, pela regra "PAGINACAO DE LISTA GRANDE" do
 * CLAUDE.md: a primeira página com `count: 'exact'`, as demais em `Promise.all`.
 *
 * ⚠ SEM `count`, UMA PÁGINA SÓ, e de propósito: inventar o total pelo tamanho da primeira (`count ?? rows.length`)
 *   truncaria calado — que é o defeito que esta função existe para matar (os apelidos de 3.433 fornecedores do NJ lidos
 *   em UM select cortado em 1.000).
 */
export async function lerTodasAsPaginas<T>(
  pagina: (de: number, ate: number, contar: boolean) => Promise<{ data: T[] | null; count: number | null }>,
  tamanho = 1000,
): Promise<T[]> {
  const primeira = await pagina(0, tamanho - 1, true);
  const linhas = [...(primeira.data ?? [])];
  if (primeira.count === null) return linhas;
  const faltam = Math.max(0, Math.ceil(primeira.count / tamanho) - 1);
  const resto = await Promise.all(
    Array.from({ length: faltam }, (_v, i) => pagina((i + 1) * tamanho, (i + 2) * tamanho - 1, false)));
  for (const r of resto) linhas.push(...(r.data ?? []));
  return linhas;
}
