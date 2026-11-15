import { formatarDocumento, soDigitos } from '@/lib/fornecedores/fornecedorTexto';

/**
 * LIVRO-CAIXA-ONDA2 · I3 (Chat 13/11 00:40) — o documento numa TABELA que mostra pessoas: CNPJ inteiro formatado; CPF de pessoa física
 * com o começo e o fim escondidos (***.456.789-**), como no mock fiscal. Outro tamanho aparece como está; vazio = "".
 * Mora aqui (e não em fornecedorTexto.ts, alcançado por metade das telas) para o gate rápido medir só as telas fiscais.
 */
export function documentoNaTabela(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  return formatarDocumento(doc);
}
