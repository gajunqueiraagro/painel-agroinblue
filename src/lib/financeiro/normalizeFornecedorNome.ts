/**
 * Normaliza um nome de fornecedor pela MESMA regra do gatilho do banco (`fn_normalizar_nome_fornecedor`, que mantém
 * `financeiro_fornecedores.nome_normalizado`):
 *
 *   0. Tirar o ACENTO (o banco chama `unaccent` antes de tudo).
 *   1. Substituir tudo que não é [a-zA-Z0-9 ] por espaço.
 *   2. Colapsar espaços múltiplos em um único.
 *   3. Trim.
 *   4. UPPERCASE.
 *
 * ⚠ O PASSO 0 ENTROU NO FORN-SELETOR-PADRAO-01 fatia 2c (09/10/2026): sem ele "João" virava "JO O" aqui e "JOAO" no banco, e a
 *   busca de repetido por `nome_normalizado` nunca casava nome com acento (medido: 1.353 fornecedores nessa situação).
 * Usado no front para detectar repetido antes do insert (não há índice único de nome no banco: FORN-NOME-UNICO-BANCO-01).
 */
export function normalizeFornecedorNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
