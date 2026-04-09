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
