/**
 * Parser interno de extratos CSV (formato bancário brasileiro).
 *
 * Auto-detecta:
 *   - Delimitador (`;`, `,`, `\t`)
 *   - Cabeçalho via heurística por nome de coluna (data, hist/desc/memo, valor, doc)
 *
 * Formatos de data aceitos: 'DD/MM/YYYY', 'DD/MM/YY', 'YYYY-MM-DD'.
 * Formato de valor: 'R$ -1.234,56' ou '-1234.56' — vírgula ou ponto.
 *
 * Sem dependências externas. Mapeamento de colunas pode ser sobrescrito via opts.
 */
import type { MovimentoBruto } from './parseOFX';
export type { MovimentoBruto };

export interface ParseCsvOptions {
  delimiter?: ',' | ';' | '\t';
  /** Índices 0-based; quando omitidos, tenta detectar pelo cabeçalho. */
  colDataIdx?: number;
  colDescricaoIdx?: number;
  colValorIdx?: number;
  colDocumentoIdx?: number;
  /** Quando `true`, assume que não há linha de cabeçalho. */
  semCabecalho?: boolean;
}

function detectarDelimitador(linha: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const c of linha) {
    if (c in counts) counts[c]++;
  }
  // Maior contagem vence; default `;` (banco BR).
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? (sorted[0][0] as ',' | ';' | '\t') : ';';
}

function parseDataBR(s: string): string | null {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseValorBR(s: string): number | null {
  // Remove R$, espaços, sinais aceitáveis.
  let v = s.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  // Se contém vírgula, é formato BR ('1.234,56'). Senão US ('1234.56').
  if (v.includes(',')) {
    v = v.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitCSVLinha(linha: string, delim: string): string[] {
  // Suporte básico a aspas duplas (sem escape interno duplicado).
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === delim && !inQuote) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectarColunasPorHeader(header: string[]): {
  data: number;
  desc: number;
  valor: number;
  doc: number;
} {
  const norm = header.map((h) =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );
  return {
    data: norm.findIndex((h) => /\bdata\b|movim/.test(h)),
    desc: norm.findIndex((h) => /hist|descri|memo|titulo/.test(h)),
    valor: norm.findIndex((h) => /valor|amount|montante/.test(h)),
    doc: norm.findIndex((h) => /doc|num|cheq/.test(h)),
  };
}

export function parseCSV(content: string, opts: ParseCsvOptions = {}): MovimentoBruto[] {
  const linhas = content.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return [];

  const delim = opts.delimiter ?? detectarDelimitador(linhas[0]);

  let colData = opts.colDataIdx;
  let colDesc = opts.colDescricaoIdx;
  let colValor = opts.colValorIdx;
  let colDoc = opts.colDocumentoIdx;
  let dataStart = 0;

  if (!opts.semCabecalho && (colData == null || colDesc == null || colValor == null)) {
    const header = splitCSVLinha(linhas[0], delim);
    const detectado = detectarColunasPorHeader(header);
    if (colData == null) colData = detectado.data;
    if (colDesc == null) colDesc = detectado.desc;
    if (colValor == null) colValor = detectado.valor;
    if (colDoc == null) colDoc = detectado.doc;
    dataStart = 1;
  }

  // Fallback BB padrão: Data | Histórico | Documento | Valor | Saldo
  if (colData == null || colData < 0) colData = 0;
  if (colDesc == null || colDesc < 0) colDesc = 1;
  if (colValor == null || colValor < 0) colValor = 3;
  if (colDoc == null || colDoc < 0) colDoc = 2;

  const movimentos: MovimentoBruto[] = [];
  for (let i = dataStart; i < linhas.length; i++) {
    const cols = splitCSVLinha(linhas[i], delim);
    if (cols.length === 0) continue;

    const data = parseDataBR(cols[colData] ?? '');
    const valor = parseValorBR(cols[colValor] ?? '');
    if (!data || valor == null) continue;

    const descricao = (cols[colDesc] ?? '').trim();
    const documento = cols[colDoc] ? (cols[colDoc].trim() || null) : null;

    movimentos.push({
      data,
      valor,
      tipo: valor >= 0 ? 'credito' : 'debito',
      descricao,
      documento,
    });
  }

  return movimentos;
}
