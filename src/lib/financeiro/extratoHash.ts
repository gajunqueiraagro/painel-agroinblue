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
  /**
   * PR-CONC-IMPORT-BANCO-01B — a OCORRÊNCIA do mesmo conteúdo no arquivo (1 = a primeira). Dois movimentos IDÊNTICOS no
   * mesmo arquivo (dois "RENTAB.INVEST FACILCRED*" de 0,13 no mesmo dia) são dois movimentos: sem a ocorrência os dois
   * tinham o mesmo hash, o banco devolvia 23505 e o lote inteiro caía.
   * ⚠ A 1ª OCORRÊNCIA NÃO MUDA (o hash de sempre — medido: nenhum extrato gravado recalcula diferente); da 2ª em diante,
   *   o mesmo conteúdo + `|N`. Contada entre linhas de CONTEÚDO IDÊNTICO (o mesmo hash da 1ª), na ordem do arquivo —
   *   reimportar o mesmo arquivo dá os mesmos hashes e não duplica. Não confundir com o `seq_ocorrencia` da chave
   *   natural (conta+data+valor+documento), que continua como está.
   */
  ocorrencia?: number;
}

export async function hashMovimento(input: HashMovimentoInput): Promise<string> {
  const conteudo = [
    input.contaBancariaId,
    input.dataISO,
    input.valor.toFixed(2),
    normalizarTexto(input.descricao),
    normalizarTexto(input.documento),
  ];
  const partes = ((input.ocorrencia ?? 1) > 1 ? [...conteudo, String(input.ocorrencia)] : conteudo).join('|');

  const buffer = new TextEncoder().encode(partes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * PR-CONC-IMPORT-BANCO-01B — os hashes de um ARQUIVO inteiro, na ordem dele: cada movimento com a sua ocorrência entre os de
 * conteúdo idêntico (o mesmo hash da 1ª). É o único lugar que numera — a prévia e a gravação usam o que sai daqui.
 */
export async function hashesDoArquivo(
  contaBancariaId: string,
  movimentos: ReadonlyArray<{ data: string; valor: number; descricao: string | null | undefined; documento?: string | null }>,
): Promise<string[]> {
  const base = await Promise.all(movimentos.map((m) => hashMovimento({
    contaBancariaId, dataISO: m.data, valor: m.valor, descricao: m.descricao, documento: m.documento ?? '',
  })));
  const vistos = new Map<string, number>();
  return Promise.all(base.map((h, i) => {
    const ocorrencia = (vistos.get(h) ?? 0) + 1;
    vistos.set(h, ocorrencia);
    if (ocorrencia === 1) return h;
    const m = movimentos[i];
    return hashMovimento({
      contaBancariaId, dataISO: m.data, valor: m.valor, descricao: m.descricao, documento: m.documento ?? '', ocorrencia,
    });
  }));
}
