/**
 * FECH-DOCS-01 (Gabriel, 12/10/2026) — "Documentos do mês": o livro do campeiro.
 *
 * Os papéis que o campo manda no mês (mapa de rebanho, nascimentos, entradas, vendas, transferências, mortes) ficam guardados por
 * FAZENDA + MÊS. É CADASTRO DE ARQUIVO: nada aqui calcula, soma ou alimenta o motor.
 *
 * Este arquivo é o dono PURO do vocabulário, dos rótulos, dos textos e do leitor da linha (sem cast: peça torta = nulo). Quem fala
 * com o banco é `src/hooks/useDocumentosDoMes.ts`.
 *
 * ⚠ O VOCABULÁRIO É ESPELHO DECLARADO do CHECK `ck_pec_fech_doc_especie` (migration 20261027197100): quem mexer num confere o outro.
 */

export const ESPECIES_DO_DOCUMENTO = [
  'mapa_rebanho', 'nascimentos', 'entradas', 'vendas', 'transferencias', 'mortes', 'outro',
] as const;
export type EspecieDoDocumento = typeof ESPECIES_DO_DOCUMENTO[number];

export const ROTULO_DA_ESPECIE: Record<EspecieDoDocumento, string> = {
  mapa_rebanho: 'Mapa de rebanho',
  nascimentos: 'Nascimentos',
  entradas: 'Entradas',
  vendas: 'Vendas',
  transferencias: 'Transferências',
  mortes: 'Mortes',
  outro: 'Outro',
};

/** O arquivo solto nasce assim, com o nome que veio (o do WhatsApp); a linha abre em edição para o operador dizer o que é. */
export const ESPECIE_AO_NASCER: EspecieDoDocumento = 'outro';

export const BUCKET_PEC_DOCUMENTOS = 'pec-documentos';

export const CONVITE_DO_DOCUMENTO = 'Clique ou arraste o documento (PDF, JPG, PNG · até 10 MB)';
export const FRASE_SEM_DOCUMENTOS = 'Nenhum documento neste mês.';
export const FRASE_MOTIVO_OBRIGATORIO = 'Informe o motivo do cancelamento.';
export const FRASE_NOME_OBRIGATORIO = 'Informe o nome do documento.';
export const FRASE_DOCUMENTO_MUDOU = 'O documento mudou em outra tela. Feche e abra de novo.';
export const MOTIVO_SEM_FAZENDA = 'Selecione uma fazenda para ver os documentos do mês.';

export function ehEspecie(valor: unknown): valor is EspecieDoDocumento {
  return typeof valor === 'string' && ESPECIES_DO_DOCUMENTO.some(e => e === valor);
}

export interface DocumentoDoMes {
  id: string;
  especie: EspecieDoDocumento;
  nome: string;
  /** O caminho no bucket; nulo = a linha foi registrada e o arquivo não subiu ("sem arquivo"). */
  url: string | null;
  tamanhoBytes: number | null;
  uploadedEm: string;
  versao: number;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** A linha do banco, sem cast. Peça torta = nulo (a linha não entra na lista; nunca vira "outro" por palpite). */
export function lerDocumentoDoMes(linha: unknown): DocumentoDoMes | null {
  if (!ehObjeto(linha)) return null;
  const { id, especie, nome, url, tamanho_bytes: tamanho, uploaded_em: em, versao } = linha;
  if (typeof id !== 'string' || !id) return null;
  if (!ehEspecie(especie)) return null;
  if (typeof nome !== 'string' || !nome.trim()) return null;
  if (typeof em !== 'string' || !em) return null;
  if (typeof versao !== 'number' || !Number.isInteger(versao)) return null;
  if (url !== null && url !== undefined && typeof url !== 'string') return null;
  if (tamanho !== null && tamanho !== undefined && typeof tamanho !== 'number') return null;
  return {
    id, especie, nome, url: typeof url === 'string' && url ? url : null,
    tamanhoBytes: typeof tamanho === 'number' ? tamanho : null, uploadedEm: em, versao,
  };
}

export function lerDocumentosDoMes(linhas: readonly unknown[]): DocumentoDoMes[] {
  const lidos: DocumentoDoMes[] = [];
  for (const l of linhas) {
    const d = lerDocumentoDoMes(l);
    if (d) lidos.push(d);
  }
  return lidos;
}

/** `{cliente}/{fazenda}/{AAAA-MM}/{id}.{ext}` — a PRIMEIRA pasta é o cliente (é o que a policy do bucket confere), e a chave é o
 *  id da linha, nunca o nome do arquivo (o storage recusa acento na chave). */
export function caminhoDoDocumentoDoMes(clienteId: string, fazendaId: string, anoMes: string, id: string, extensao: string): string {
  return `${clienteId}/${fazendaId}/${anoMes}/${id}.${extensao}`;
}

const numero1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const numero0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "1,2 MB" · "340 KB" · "—" (tamanho desconhecido não é zero). */
export function textoDoTamanho(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1024 * 1024) return `${numero1.format(bytes / (1024 * 1024))} MB`;
  return `${numero0.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** O dia em que o arquivo entrou, "dd/mm", na data LOCAL de quem olha. Instante ilegível = "—". */
export function dataCurtaDoEnvio(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dataETamanho(doc: Pick<DocumentoDoMes, 'uploadedEm' | 'tamanhoBytes'>): string {
  return `${dataCurtaDoEnvio(doc.uploadedEm)} · ${textoDoTamanho(doc.tamanhoBytes)}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

/** '2026-10' -> 'out/2026'. Texto fora do formato volta como veio. */
export function mesPorExtenso(anoMes: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(anoMes);
  if (!m) return anoMes;
  return `${MESES[Number(m[2]) - 1]}/${m[1]}`;
}

export function tituloDosDocumentos(fazendaNome: string, anoMes: string): string {
  return `Documentos do mês — ${fazendaNome} · ${mesPorExtenso(anoMes)}`;
}

/** O rótulo do botão nas duas telas. `null` = ainda não se sabe (lendo, ou sem fazenda): "…" / "—", nunca um zero inventado. */
export function rotuloDoBotaoDeDocumentos(quantidade: number | null, semFazenda = false): string {
  if (semFazenda) return 'Documentos do mês · —';
  return `Documentos do mês · ${quantidade === null ? '…' : quantidade}`;
}
