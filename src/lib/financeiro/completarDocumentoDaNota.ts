/**
 * NOTA-ITENS-SALVAR-01 (Gabriel 18/11 10:04, a Selluz NF 3.240 do NJ) — vincular a nota lida a um lançamento que JÁ TEM o documento dela
 * (P167: o PDF de antes, sem chave) só ligava o documento: os itens se guardavam pela chave, mas o lançamento acha os itens pela chave DOS
 * DOCUMENTOS DELE — sem chave no documento, a aba Itens ficava vazia (e reimportar repetia). Regra (SSOT = a nota): o vincular com a nota lida
 * COMPLETA o documento que existe — só o que está VAZIO (chave, nº, emissão, valor); nunca troca o que foi digitado (P96a: o diferente é do
 * operador decidir). Pela porta de sempre (`fin_documento_editar`, versão esperada; a trilha do documento registra).
 */
import type { DocumentoDaParcela, GravadoresDaJuncao } from '@/lib/financeiro/juntarParcelas';

export interface NotaParaCompletar { chave: string | null; numero: string; emissao: string | null; totalCent: number }

const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const curto = (s: string | null | undefined) => digitos(s).replace(/^0+(?=\d)/, '');

/** O que falta no documento e a nota lida tem (só os vazios). `null` = nada a completar (ou o documento é de OUTRA nota). PURA. */
export function camposQueCompletamODocumento(doc: DocumentoDaParcela | undefined, nota: NotaParaCompletar): Record<string, string> | null {
  if (!doc || (doc.especie && doc.especie !== 'nf')) return null;
  const chave = digitos(nota.chave);
  if (chave.length !== 44 || digitos(doc.chave)) return null;
  /* o nº digitado diferente da nota: o documento é de outra nota (ou está errado) — nunca se troca sozinho */
  if (doc.numero && curto(doc.numero) !== curto(nota.numero)) return null;
  const campos: Record<string, string> = { chave_acesso: chave };
  if (!doc.numero && nota.numero) campos.numero = nota.numero;
  if (!doc.emissao && nota.emissao) campos.data_emissao = nota.emissao;
  if (doc.valorCent == null && nota.totalCent > 0) campos.valor_documento = (nota.totalCent / 100).toFixed(2);
  return campos;
}

/** Lê o documento (a versão de agora) e grava o que falta. Devolve a frase do que impediu, ou `null` (feito ou nada a fazer). */
export async function completarODocumentoDaNota(clienteId: string, documentoId: string, lancamentoId: string, nota: NotaParaCompletar,
  gj: Pick<GravadoresDaJuncao, 'documentos' | 'editarDocumento'>): Promise<string | null> {
  try {
    const doc = (await gj.documentos(clienteId, [lancamentoId])).find((d) => d.id === documentoId);
    const campos = camposQueCompletamODocumento(doc, nota);
    if (!doc || !campos) return null;
    await gj.editarDocumento(clienteId, doc.id, doc.versao, campos);
    return null;
  } catch (e) {
    return e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message ? e.message : 'o documento não foi completado';
  }
}
