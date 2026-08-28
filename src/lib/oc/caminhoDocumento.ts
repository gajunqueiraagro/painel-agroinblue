/* Caminho do arquivo de documento da Operação Comercial — UM LUGAR SÓ.
 *
 * A política de Storage (`oc_doc_select/insert/update`, migration 20260903120000) compara
 * a PRIMEIRA PASTA do caminho com os clientes do usuário. Qualquer desvio — pasta a mais,
 * a menos, ordem trocada — faz a política NEGAR, e o erro chega como **"sem permissão"**,
 * não como "caminho errado". É a pista falsa mais cara de depurar nesta frente.
 *
 * Por isso o caminho nasce aqui e em nenhum outro lugar: se um dia o esquema mudar, muda
 * numa função só, e não em quantas telas tiverem aprendido a concatenar strings.
 */
export const BUCKET_OC_DOCUMENTOS = 'oc-documentos';

/** Extensões aceitas pelo bucket (`allowed_mime_types` em 20260903120000). */
const EXT_POR_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** 10 MB — o mesmo `file_size_limit` do bucket. Conferir aqui evita a viagem até o
 *  servidor só para levar um 413 de volta. */
export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024;

export function extensaoDoArquivo(file: File): string | null {
  return EXT_POR_MIME[file.type] ?? null;
}

/** `{cliente_id}/{operacao_id}/{documento_id}.{ext}` — contrato da política. */
export function caminhoDocumentoOC(
  clienteId: string, operacaoId: string, documentoId: string, extensao: string,
): string {
  return `${clienteId}/${operacaoId}/${documentoId}.${extensao}`;
}

/** Mensagem pronta quando o arquivo não serve; `null` quando serve.
 *  Falar antes de tentar é melhor que traduzir erro de servidor depois. */
export function motivoArquivoInvalido(file: File): string | null {
  if (!extensaoDoArquivo(file)) return 'Formato não aceito. Envie PDF, JPG ou PNG.';
  if (file.size > LIMITE_ARQUIVO_BYTES) {
    return `Arquivo de ${(file.size / 1024 / 1024).toFixed(1)} MB excede o limite de 10 MB.`;
  }
  return null;
}
