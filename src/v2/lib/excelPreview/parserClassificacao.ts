/**
 * parserClassificacao — parser dedicado ao Excel de classificação
 * financeira (PR-M / PR-M2.1).
 *
 * Sheet alvo: 'EXPORT_APP_UNICO'. Se ausente, usa primeira sheet
 * do workbook. Schema esperado (headers, todos opcionais):
 *   Data_Ref · Conta · Conta_Destino · Fazenda · Tipo · Valor
 *   Produto · Fornecedor · Subcentro · AnoMes
 *
 * NÃO REUTILIZA parseExcelToLote (que é OFX-específico — exige
 * outras colunas, valida sinais e formatos diferentes). Aqui a
 * validação é mínima: linha é REJEITADA somente quando falta um
 * dos 4 campos obrigatórios:
 *   - Data_Ref (parseável em formato suportado)
 *   - Valor (numérico)
 *   - Tipo (não vazio)
 *   - Subcentro (não vazio)
 *
 * Saída: shape exato esperado pela RPC fn_classificacao_populate_staging
 * (PR-M). Sem adapter intermediário.
 */
import * as XLSX from 'xlsx';

export interface ClassificacaoExcelRow {
  /** indiceLinha (0-based) + 2 — header é linha 1, dados começam em 2. */
  linha: number;
  subcentro: string | null;
  fornecedor: string | null;
  produto: string | null;
  conta_origem: string | null;
  conta_destino: string | null;
  ano_mes: string | null;
  data: string | null;       // 'YYYY-MM-DD'
  valor: number | null;      // sempre absoluto (positivo)
  tipo_operacao: string | null;
  fazenda_codigo: string | null;
}

export interface ClassificacaoParseResult {
  rows: ClassificacaoExcelRow[];
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  erros: Array<{ linha: number; motivo: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Converte serial Excel para 'YYYY-MM-DD'. Usa XLSX.SSF.parse_date_code
 * que já trata o bug 1900-leap-year automaticamente.
 */
function lerSerialExcel(serial: number): string | null {
  // XLSX.SSF.parse_date_code retorna { y, m, d, H, M, S } ou null.
  const parts = XLSX.SSF.parse_date_code(serial);
  if (!parts || !parts.y || !parts.m || !parts.d) return null;
  return `${parts.y}-${pad2(parts.m)}-${pad2(parts.d)}`;
}

/**
 * Parseia Data_Ref em qualquer um dos 4 formatos suportados:
 *   a) string 'YYYY-MM-DD'
 *   b) string 'dd/MM/yyyy'
 *   c) Date object
 *   d) number serial Excel
 */
export function parseDataRef(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }

  if (typeof v === 'number') {
    return lerSerialExcel(v);
  }

  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    if (ISO_DATE_RE.test(s)) return s;
    const m = s.match(BR_DATE_RE);
    if (m) {
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      const ano = Number(m[3]);
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return `${ano}-${pad2(mes)}-${pad2(dia)}`;
    }
    return null;
  }

  return null;
}

/**
 * Parseia Valor em qualquer uma das 3 formas suportadas:
 *   a) number puro
 *   b) string BR ('1.234,56' | 'R$ 1.234,56' | '-R$ 1.234,56')
 *   c) qualquer outro → null
 *
 * Sempre retorna Math.abs (valor absoluto) — o sinal vive em
 * tipo_operacao (Entradas vs Saídas).
 */
export function parseValorBR(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return Math.abs(v);
  }

  if (typeof v === 'string') {
    let s = v.trim();
    if (!s) return null;
    // Normalização BR: remove 'R$', espaços e separador de milhar '.',
    // troca decimal ',' por '.'.
    s = s.replace(/R\$\s*/gi, '').replace(/\s+/g, '');
    s = s.replace(/\./g, '').replace(/,/g, '.');
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.abs(n);
  }

  return null;
}

function normalizeTipo(v: string | null): string | null {
  if (!v) return null;
  return v === '3-Transferência' ? '3-Transferências' : v;
}

// ─── Parser de linha ────────────────────────────────────────────────

interface ParseRowOutput {
  row: ClassificacaoExcelRow | null;
  erro: string | null;
}

function parseRow(
  raw: Record<string, unknown>,
  linha: number,
): ParseRowOutput {
  const dataRef = raw['Data_Ref'];
  const valor = raw['Valor'];
  const tipo = trimOrNull(raw['Tipo']);
  const subcentro = trimOrNull(raw['Subcentro']);

  // Validação mínima
  const dataIso = parseDataRef(dataRef);
  if (!dataIso) {
    return { row: null, erro: 'Data_Ref ausente ou em formato não suportado' };
  }
  const valorAbs = parseValorBR(valor);
  if (valorAbs === null) {
    return { row: null, erro: 'Valor ausente ou não-numérico' };
  }
  if (!tipo) {
    return { row: null, erro: 'Tipo vazio' };
  }
  if (!subcentro) {
    return { row: null, erro: 'Subcentro vazio' };
  }

  const anoMesRaw = trimOrNull(raw['AnoMes']);

  const row: ClassificacaoExcelRow = {
    linha,
    subcentro,
    fornecedor: trimOrNull(raw['Fornecedor']),
    produto: trimOrNull(raw['Produto']),
    conta_origem: trimOrNull(raw['Conta']),
    conta_destino: trimOrNull(raw['Conta_Destino']),
    ano_mes: anoMesRaw ?? dataIso.slice(0, 7),
    data: dataIso,
    valor: valorAbs,
    tipo_operacao: normalizeTipo(tipo),
    fazenda_codigo: trimOrNull(raw['Fazenda']),
  };

  return { row, erro: null };
}

// ─── API principal ──────────────────────────────────────────────────

export async function parseExcelClassificacao(
  file: File,
): Promise<ClassificacaoParseResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return {
      rows: [],
      totalLinhas: 0,
      linhasValidas: 0,
      linhasComErro: 0,
      erros: [{ linha: 0, motivo: 'Arquivo Excel sem sheets' }],
    };
  }

  const sheetName = wb.SheetNames.includes('EXPORT_APP_UNICO')
    ? 'EXPORT_APP_UNICO'
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  if (!ws) {
    return {
      rows: [],
      totalLinhas: 0,
      linhasValidas: 0,
      linhasComErro: 0,
      erros: [{ linha: 0, motivo: `Sheet "${sheetName}" não encontrada` }],
    };
  }

  // raw: true preserva números (incl. serial date) e strings sem
  // coerção. defval: null deixa células vazias como null em vez de
  // omitir a chave.
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true,
    defval: null,
  });

  const rows: ClassificacaoExcelRow[] = [];
  const erros: Array<{ linha: number; motivo: string }> = [];

  rawRows.forEach((raw, idx) => {
    const linha = idx + 2; // header é linha 1, dados começam em 2
    const { row, erro } = parseRow(raw, linha);
    if (row) {
      rows.push(row);
    } else if (erro) {
      erros.push({ linha, motivo: erro });
    }
  });

  return {
    rows,
    totalLinhas: rawRows.length,
    linhasValidas: rows.length,
    linhasComErro: erros.length,
    erros,
  };
}
