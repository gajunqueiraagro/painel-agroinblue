/**
 * Helpers for Tipo de Documento + Número do Documento.
 * Official document types, NF mask logic, and smart import parsing.
 */

export const TIPOS_DOCUMENTO = [
  'Nota Fiscal',
  'Fatura',
  'Recibo',
  'Contrato',
  'Folha de Pagamento',
  'Outros',
] as const;

export type TipoDocumento = typeof TIPOS_DOCUMENTO[number];

/** Format NF number: 123456789 → 123.456.789, padded to 9 digits */
export function formatNFNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (!digits) return '';
  const padded = digits.padStart(9, '0');
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
}

/** Extract only digits from a raw NF string (e.g. "NF123456" → "123456") */
export function extractNFDigits(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
}

/** Format document for display: "Nota Fiscal 123.456.789" or "Recibo 4567" */
export function formatDocumento(tipo: string | null, numero: string | null): string {
  if (!numero && !tipo) return '-';
  const num = numero || '';
  const t = tipo || 'Outros';
  if (t === 'Nota Fiscal' && num) {
    return `NF ${formatNFNumber(num)}`;
  }
  return num ? `${t} ${num}` : t;
}

// ── Smart Import Parsing V2 ──

/**
 * Keywords mapped to TipoDocumento.
 * Order matters: more specific patterns first.
 */
const KEYWORD_MAP: { pattern: RegExp; tipo: TipoDocumento }[] = [
  { pattern: /nota\s*fiscal/i, tipo: 'Nota Fiscal' },
  { pattern: /\bnfe?\b/i, tipo: 'Nota Fiscal' },
  { pattern: /\bnfs\b/i, tipo: 'Nota Fiscal' },
  { pattern: /\bfatura\b/i, tipo: 'Fatura' },
  { pattern: /\bboleto\b/i, tipo: 'Fatura' },
  { pattern: /\brecibo\b/i, tipo: 'Recibo' },
  { pattern: /\bcomprovante\b/i, tipo: 'Recibo' },
  { pattern: /\bcontrato\b/i, tipo: 'Contrato' },
  { pattern: /\bfolha\b/i, tipo: 'Folha de Pagamento' },
  { pattern: /\bholerite\b/i, tipo: 'Folha de Pagamento' },
];

/**
 * Operational texts that are valid but NOT document types.
 * These should never generate alerts.
 */
const OPERATIONAL_TEXTS: RegExp[] = [
  /^manual$/i,
  /^saldo\s*caixa$/i,
  /^rateio/i,
  /^ajuste/i,
  /^transfer[eê]ncia/i,
  /^estorno/i,
  /^provis[aã]o/i,
];

function isOperationalText(text: string): boolean {
  const trimmed = text.trim();
  return OPERATIONAL_TEXTS.some(rx => rx.test(trimmed));
}

function detectTipoDocumento(text: string): TipoDocumento | null {
  for (const { pattern, tipo } of KEYWORD_MAP) {
    if (pattern.test(text)) return tipo;
  }
  return null;
}

/**
 * Conservative number extraction.
 * Only returns a number if it's a clean, contiguous block of digits
 * (possibly preceded/followed by spaces or keyword text).
 *
 * "NF 123456" → "123456"  ✓
 * "NF ABC123DEF" → null   ✗ (mixed, ambiguous)
 * "123456" → "123456"     ✓
 * "Recibo 4567" → "4567"  ✓
 */
function extractCleanNumber(text: string): string | null {
  // Remove known type keywords to isolate the rest
  let residual = text;
  for (const { pattern } of KEYWORD_MAP) {
    residual = residual.replace(pattern, '');
  }
  residual = residual.trim();

  if (!residual) return null;

  // Only accept if the residual is purely numeric (allowing leading zeros)
  if (/^\d+$/.test(residual)) return residual;

  // Also accept formats like "123.456.789" (NF formatted)
  const dotFormatted = residual.replace(/\./g, '');
  if (/^\d+$/.test(dotFormatted) && dotFormatted.length > 0) return dotFormatted;

  // If residual has mixed text+digits, do NOT extract — ambiguous
  return null;
}

export interface ParsedDocumentoV2 {
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  documentoOriginal: string;
  ambiguo: boolean;
}

/**
 * Smart document parser for import.
 *
 * Rules:
 * A) Empty → all null, no alert
 * B) Known type + clean number → fill both
 * C) Known type, no number → fill tipo only, no alert
 * D) Operational text → all null, no alert
 * E) Pure number → fill numero only
 * F) Ambiguous (type detected but mixed text/digits) → tipo filled, numero null, flag ambiguous
 */
export function parseDocumentoImportV2(raw: string | null): ParsedDocumentoV2 {
  // A) Empty
  if (!raw || !raw.trim()) {
    return { tipoDocumento: null, numeroDocumento: null, documentoOriginal: '', ambiguo: false };
  }

  const trimmed = raw.trim();

  // D) Operational text — accept silently
  if (isOperationalText(trimmed)) {
    return { tipoDocumento: null, numeroDocumento: null, documentoOriginal: trimmed, ambiguo: false };
  }

  const detectedTipo = detectTipoDocumento(trimmed);
  const cleanNumber = extractCleanNumber(trimmed);

  // B) Known type + clean number
  if (detectedTipo && cleanNumber) {
    return { tipoDocumento: detectedTipo, numeroDocumento: cleanNumber, documentoOriginal: trimmed, ambiguo: false };
  }

  // C) Known type, no clean number
  if (detectedTipo && !cleanNumber) {
    // Check if there are digits at all (mixed case = ambiguous)
    const hasDigits = /\d/.test(trimmed);
    return {
      tipoDocumento: detectedTipo,
      numeroDocumento: null,
      documentoOriginal: trimmed,
      ambiguo: hasDigits, // only flag if digits present but not extractable
    };
  }

  // E) Pure number (no type keyword)
  if (/^\d+$/.test(trimmed)) {
    return { tipoDocumento: null, numeroDocumento: trimmed, documentoOriginal: trimmed, ambiguo: false };
  }

  // F) Unrecognized text — not an error, just preserve
  return { tipoDocumento: null, numeroDocumento: null, documentoOriginal: trimmed, ambiguo: false };
}

// ── Legacy API (kept for backward compat) ──

/** @deprecated Use parseDocumentoImportV2 instead */
export function inferTipoDocumento(raw: string): TipoDocumento {
  return detectTipoDocumento(raw) || 'Outros';
}

/** @deprecated Use parseDocumentoImportV2 instead */
export function parseDocumentoImport(raw: string | null): { tipo: TipoDocumento; numero: string } | null {
  if (!raw || !raw.trim()) return null;
  const v2 = parseDocumentoImportV2(raw);
  return { tipo: v2.tipoDocumento || 'Outros', numero: v2.numeroDocumento || '' };
}

/* ── PARC-LIVRES-01 passo 3 — O DOCUMENTO DA LINHA, NUMA FUNÇÃO SÓ ─────────────────────────────────────────────────────────
   A coluna Doc. da lista, o resumo do modal e o topo da aba Documentos escrevem o MESMO texto, daqui. A NOTA FISCAL DA COMPRA
   (o documento NF do lançamento ou o ligado a ele — as N parcelas de um parcelado) vale para a linha que não tem número próprio:
   o parcelamento não grava `numero_documento` em cada parcela, e a parcela aparecia sem nota. */

/** O que a função precisa de cada documento (linha de `vw_lancamento_documentos`, que já traz os ligados). */
export interface DocumentoDaLinha { especie: string | null; numero: string | null; cancelado?: boolean | null }

const ESPECIES_NF: readonly string[] = ['nf', 'nf_principal', 'nf_complementar'];
const ehNF = (d: DocumentoDaLinha) => ESPECIES_NF.includes(d.especie ?? '');
const vivos = (docs: readonly DocumentoDaLinha[] | null | undefined) => (docs ?? []).filter((d) => !d.cancelado);

/** "NF 000.000.518": até 9 dígitos, com a máscara; número maior (ou sem dígito) vai como está. */
function numeroDeNF(numero: string): string {
  const digitos = numero.replace(/\D/g, '');
  return digitos.length > 0 && digitos.length <= 9 ? formatNFNumber(digitos) : numero.trim();
}

const PREFIXO_POR_TIPO: Readonly<Record<string, string>> = {
  'Nota Fiscal': 'NF', Recibo: 'Rec.', Fatura: 'Bol.', Boleto: 'Bol.', Comprovante: 'Comp.',
};
const PREFIXO_POR_ESPECIE: Readonly<Record<string, string>> = {
  nf: 'NF', nf_principal: 'NF', nf_complementar: 'NF', recibo: 'Rec.', boleto: 'Bol.', comprovante: 'Comp.',
};

/** PARC-CONTRATO-01 item 4 — o tipo GENÉRICO (sem tipo, ou tipo sem prefixo próprio) não leva prefixo na coluna: só o número.
 *  O tipo por extenso fica no `titulo` ("Documento 109122795412"). */
const SEM_PREFIXO = '';

/** O texto padronizado: "NF 000.000.000" · "Rec. XXX" · "Bol. XXX" · "Comp. XXX"; sem prefixo (o genérico), só o número. Sem número: ''. */
export function rotuloDoDocumento(prefixo: string, numero: string | null | undefined): string {
  const n = (numero ?? '').trim();
  /* "-" (e variações) é o "vazio" que as planilhas importadas trouxeram: não é número de documento. */
  if (!n || /^[-–—]+$/.test(n)) return '';
  if (!prefixo) return n;
  return `${prefixo} ${prefixo === 'NF' ? numeroDeNF(n) : n}`;
}

/** O `title`: com prefixo, o próprio rótulo; no genérico, "Documento N". */
const comTipo = (prefixo: string, rotulo: string) => (rotulo && !prefixo ? `Documento ${rotulo}` : rotulo);

export interface DocDaLinha {
  /** O texto da coluna Doc. ('' = sem número de documento). */
  rotulo: string;
  /** O `title` da célula: o rótulo e, no genérico (sem prefixo), o tipo por extenso — "Documento 109122795412". '' sem número. */
  titulo: string;
  /** De onde veio: 'lancamento' = o Nº Documento do próprio lançamento; 'nota' = a NF ligada (a da compra); 'documento' = outro documento anexado. */
  origem: 'lancamento' | 'nota' | 'documento' | null;
  /** Há documento vivo (arquivo anexado ou NF da compra ligada): a lista desenha o clipe. */
  clipe: boolean;
  /** O `title` do clipe: "NF 000.000.518 · 1 boleto". '' sem documento. */
  resumo: string;
}

const PLURAL: Readonly<Record<string, [string, string]>> = {
  boleto: ['boleto', 'boletos'], recibo: ['recibo', 'recibos'], comprovante: ['comprovante', 'comprovantes'], outro: ['outro documento', 'outros documentos'],
};

/** "NF 000.000.518 · 1 boleto · 2 comprovantes" — as notas pelo número, o resto pela contagem. */
export function resumoDosDocumentos(docs: readonly DocumentoDaLinha[] | null | undefined): string {
  const lista = vivos(docs);
  const partes: string[] = [];
  const notas = lista.filter(ehNF);
  for (const n of notas) partes.push(rotuloDoDocumento('NF', n.numero) || 'NF sem número');
  for (const especie of ['boleto', 'recibo', 'comprovante', 'outro']) {
    const q = lista.filter((d) => !ehNF(d) && (PLURAL[d.especie ?? ''] ? d.especie === especie : especie === 'outro')).length;
    if (q > 0) partes.push(`${q} ${PLURAL[especie][q === 1 ? 0 : 1]}`);
  }
  return partes.join(' · ');
}

/**
 * O DOCUMENTO DE UMA LINHA. Ordem: (1) o Nº Documento do próprio lançamento, com o prefixo do tipo; (2) a nota fiscal ligada
 * (a da compra); (3) outro documento anexado que tenha número. O clipe não depende do número: basta haver documento vivo.
 */
export function docDaLinha(
  lancamento: { tipo_documento?: string | null; numero_documento?: string | null },
  docs: readonly DocumentoDaLinha[] | null | undefined,
): DocDaLinha {
  const lista = vivos(docs);
  const clipe = lista.length > 0;
  const resumo = resumoDosDocumentos(lista);
  const prefixoProprio = PREFIXO_POR_TIPO[lancamento.tipo_documento ?? ''] ?? SEM_PREFIXO;
  const proprio = rotuloDoDocumento(prefixoProprio, lancamento.numero_documento);
  if (proprio) return { rotulo: proprio, titulo: comTipo(prefixoProprio, proprio), origem: 'lancamento', clipe, resumo };
  const nota = lista.find((d) => ehNF(d) && (d.numero ?? '').trim() !== '');
  if (nota) {
    const r = rotuloDoDocumento('NF', nota.numero);
    return { rotulo: r, titulo: `${r} · nota da compra`, origem: 'nota', clipe, resumo };
  }
  const outro = lista.find((d) => (d.numero ?? '').trim() !== '');
  if (outro) {
    const prefixo = PREFIXO_POR_ESPECIE[outro.especie ?? ''] ?? SEM_PREFIXO;
    const r = rotuloDoDocumento(prefixo, outro.numero);
    return { rotulo: r, titulo: comTipo(prefixo, r), origem: 'documento', clipe, resumo };
  }
  return { rotulo: '', titulo: '', origem: null, clipe, resumo };
}

/* ── PARC-FECHA-02 item 1 — no PARCELADO o documento da compra tem UM dono ─────────────────────────────────────────────── */

/** A nota de uma compra parcelada é o registro de documento ligado às N parcelas; o "Tipo / Nº Documento" do topo não a grava. */
export const MOTIVO_TOPO_NO_PARCELADO = 'A nota desta compra fica em Documentos e vale para todas as parcelas.';

/**
 * O lançamento é a parcela de um PARCELAMENTO? Nasce de `fn_parcelamento_cadastrar` com `origem_tipo = 'parcela_principal'` e
 * SEM `origem_lancamento`; a parcela de financiamento com juros (do motor) leva `origem_lancamento = 'parcela_financiamento'`.
 */
export function ehParcelaDeParcelamento(l: { origem_tipo?: string | null; origem_lancamento?: string | null } | null | undefined): boolean {
  return !!l && l.origem_tipo === 'parcela_principal' && l.origem_lancamento !== 'parcela_financiamento';
}

/** O topo fica em LEITURA: no Novo lançamento parcelado e na parcela de parcelamento já gravada. Fora disso, como sempre. */
export function topoDoDocumentoTravado(e: { novo: boolean; modalidadeParcelada: boolean; lancamento?: { origem_tipo?: string | null; origem_lancamento?: string | null } | null }): boolean {
  return e.novo ? e.modalidadeParcelada : ehParcelaDeParcelamento(e.lancamento);
}
