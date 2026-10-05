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
import { aceitarArquivo, fraseDeFormatoNaoAceito, type RegraDeAceite, type TipoDeArquivo } from '@/lib/arquivo/aceitarArquivo';

export const BUCKET_OC_DOCUMENTOS = 'oc-documentos';

/** Extensões aceitas pelo bucket (`allowed_mime_types` em 20260903120000). */
const EXT_POR_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  /* FIN-NFE-XML-01b1/01d — o XML da NF-e, anexado ao documento NF. Os dois rotulos que o navegador usa. */
  'application/xml': 'xml',
  'text/xml': 'xml',
};

/** 10 MB — o mesmo `file_size_limit` do bucket. Conferir aqui evita a viagem até o
 *  servidor só para levar um 413 de volta. */
export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024;

/**
 * A REGRA DE ACEITE do arquivo de um documento da OC — UI-ARRASTAR-ARQUIVO-01a: PDF, JPG, PNG ou XML, até 10 MB. Quem julga
 * é `aceitarArquivo`. ⚠ O XML ENTRA (a OC o aceita desde o FIN-NFE-XML-01b1: o bucket `oc-documentos` tem `text/xml` e
 * `application/xml`, e o caminho sai com `.xml` pelo mapa acima), inclusive o `.xml` que o navegador entrega sem tipo.
 */
const TIPOS_DA_OC: readonly TipoDeArquivo[] = ['pdf', 'jpg', 'png', 'xml'];
export const REGRA_ARQUIVO_DA_OC: RegraDeAceite = {
  tipos: TIPOS_DA_OC,
  tamanhoMaxBytes: LIMITE_ARQUIVO_BYTES,
  frases: {
    tipo: fraseDeFormatoNaoAceito(TIPOS_DA_OC),
    tamanho: (f) => `Arquivo de ${((f?.size ?? 0) / 1024 / 1024).toFixed(1)} MB excede o limite de 10 MB.`,
  },
};

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
  /* DELEGA ao dono do aceite — UI-ARRASTAR-ARQUIVO-01a. */
  return aceitarArquivo([file], REGRA_ARQUIVO_DA_OC).motivo;
}
