/**
 * Normaliza um nome de fornecedor seguindo a mesma lógica do trigger
 * `normalize_fornecedor_nome` no banco (migration 20260329212201):
 *
 *   1. Substituir tudo que não é [a-zA-Z0-9 ] por espaço.
 *   2. Colapsar espaços múltiplos em um único.
 *   3. Trim.
 *   4. UPPERCASE.
 *
 * Usado no front para detectar duplicatas antes do insert (que dispararia
 * o índice único `idx_financeiro_fornecedores_cliente_nome_norm_unique`).
 */
export function normalizeFornecedorNome(nome: string): string {
  return nome
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
