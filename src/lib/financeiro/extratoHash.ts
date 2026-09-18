/**
 * Hash determinístico de movimento bancário para detectar duplicatas na importação.
 *
 * Componentes (concatenados com '|'):
 *   conta_bancaria_id + data ISO + valor (2 casas) + descrição normalizada + documento normalizado
 *
 * Algoritmo: SHA-256 via Web Crypto API (assíncrono).
 *
 * Uso: chave de unicidade em `extrato_bancario_v2.hash_movimento`
 *      (combinado com `cliente_id` no UNIQUE INDEX `idx_extrato_v2_hash_unico`).
 *
 * Normalização da descrição/documento:
 *   - NFD + remover diacríticos
 *   - colapsar espaços
 *   - trim
 *   - UPPERCASE
 */

/**
 * A normalização da IDENTIDADE do movimento — NFD sem diacríticos, espaços colapsados, trim,
 * UPPERCASE.
 *
 * ⚠ PÚBLICA DESDE O PR-IMPORT-REIMPORTACAO-01, e por um motivo: a prévia passou a comparar
 * também pela CHAVE FRACA (conta+data+valor+descrição, sem o documento) para reconhecer
 * reimportação, e ela precisa normalizar a descrição EXATAMENTE como o hash normaliza. Uma
 * segunda cópia desta função faria as duas comparações discordarem no primeiro acento — e o
 * defeito apareceria como "movimento novo" onde havia reimportação.
 * ⚠ O CÁLCULO DO HASH NÃO MUDOU: só ganhou nome público o que já era usado aqui dentro.
 */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface HashMovimentoInput {
  contaBancariaId: string;
  dataISO: string;        // 'YYYY-MM-DD'
  valor: number;          // signed (negativo = débito)
  descricao: string | null | undefined;
  documento?: string | null;
}

export async function hashMovimento(input: HashMovimentoInput): Promise<string> {
  const partes = [
    input.contaBancariaId,
    input.dataISO,
    input.valor.toFixed(2),
    normalizarTexto(input.descricao),
    normalizarTexto(input.documento),
  ].join('|');

  const buffer = new TextEncoder().encode(partes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
