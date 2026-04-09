/**
 * Helpers for Tipo de Documento + Número do Documento.
 * Official document types and NF mask logic.
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

/** Infer tipo_documento from raw text (used in import) */
export function inferTipoDocumento(raw: string): TipoDocumento {
  const lower = raw.toLowerCase();
  if (lower.includes('nota') || lower.includes('nf')) return 'Nota Fiscal';
  if (lower.includes('recibo')) return 'Recibo';
  if (lower.includes('fatura')) return 'Fatura';
  if (lower.includes('contrato')) return 'Contrato';
  if (lower.includes('folha')) return 'Folha de Pagamento';
  return 'Outros';
}

/** Parse a raw document string from import into { tipo, numero } */
export function parseDocumentoImport(raw: string | null): { tipo: TipoDocumento; numero: string } | null {
  if (!raw || !raw.trim()) return null;
  const tipo = inferTipoDocumento(raw);
  const digits = raw.replace(/\D/g, '');
  const numero = digits ? (tipo === 'Nota Fiscal' ? digits.replace(/^0+/, '').slice(0, 9) : digits) : raw.replace(/^(nota\s*fiscal|nf|recibo|fatura|contrato|folha\s*de\s*pagamento)\s*/i, '').trim();
  return { tipo, numero };
}
