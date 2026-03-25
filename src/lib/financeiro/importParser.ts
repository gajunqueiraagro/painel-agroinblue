/**
 * Parser para importação financeira — aba única EXPORT_APP_UNICO.
 */
import * as XLSX from 'xlsx';

// ── Types ──

export interface LinhaImportada {
  linha: number;
  anoMes: string;
  dataPagamento: string | null;
  valor: number;
  statusTransacao: string | null;
  fazenda: string | null;
  fazendaId: string | null;
  tipoOperacao: string | null;
  macroCusto: string | null;
  grupoCusto: string | null;
  centroCusto: string | null;
  subcentro: string | null;
  contaOrigem: string | null;
  contaDestino: string | null;
  fornecedor: string | null;
  produto: string | null;
  obs: string | null;
  escopoNegocio: string;
}

export interface SaldoBancarioImportado {
  linha: number;
  contaBanco: string;
  anoMes: string;
  saldoFinal: number;
  fazenda: string | null;
  fazendaId: string | null;
}

export interface ContaImportada {
  linha: number;
  contaId: string;
  contaLabel: string;
  banco: string | null;
  instrumento: string | null;
  agenciaConta: string | null;
  uso: string | null;
  fazenda: string | null;
  fazendaId: string | null;
}

export interface ResumoCaixaImportado {
  linha: number;
  anoMes: string;
  entradas: number;
  saidas: number;
  saldoFinalTotal: number;
  fazenda: string | null;
  fazendaId: string | null;
}

export interface ErroImportacao {
  linha: number;
  campo: string;
  mensagem: string;
  aba?: string;
}

export interface ResultadoParsing {
  lancamentos: LinhaImportada[];
  saldosBancarios: SaldoBancarioImportado[];
  contas: ContaImportada[];
  resumoCaixa: ResumoCaixaImportado[];
  erros: ErroImportacao[];
  totalLinhas: number;
}

// ── Helpers ──

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim();
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return null;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseValor(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/\s/g, '').replace(/R\$/, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseAnoMes(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return null;
}

function inferirEscopo(tipoOp: string | null, macro: string | null): string {
  const combined = `${tipoOp || ''} ${macro || ''}`.toLowerCase();
  if (combined.includes('agricul')) return 'agricultura';
  if (combined.includes('financ') || combined.includes('emprest') || combined.includes('juros')) return 'financeiro';
  return 'pecuaria';
}

// ── Column index mapping ──

const REQUIRED_COLUMNS = [
  'Tipo_Registro', 'AnoMes', 'Data_Ref', 'Conta', 'Fazenda',
  'Tipo', 'Grupo', 'Valor', 'Status', 'Produto',
  'Fornecedor', 'Macro_Custo', 'Grupo_Custo', 'Centro_Custo', 'Subcentro', 'Obs',
];

const MINIMUM_REQUIRED = ['Tipo_Registro', 'AnoMes', 'Fazenda', 'Valor'];

export interface ValidacaoEstrutura {
  valido: boolean;
  abasFaltando: string[];
  colunasFaltando: { aba: string; colunas: string[] }[];
}

function getHeaderRow(wb: XLSX.WorkBook, sheetName: string): string[] {
  if (!wb.SheetNames.includes(sheetName)) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  if (rows.length === 0) return [];
  return (rows[0] || []).map(c => String(c ?? '').trim());
}

function normalizeCol(s: string): string {
  return s.toLowerCase().replace(/[_\s]/g, '');
}

export function validarEstruturaExcel(file: ArrayBuffer): ValidacaoEstrutura {
  const wb = XLSX.read(file, { type: 'array' });
  const abasFaltando: string[] = [];
  const colunasFaltando: { aba: string; colunas: string[] }[] = [];

  if (!wb.SheetNames.includes('EXPORT_APP_UNICO')) {
    abasFaltando.push('EXPORT_APP_UNICO');
    return { valido: false, abasFaltando, colunasFaltando };
  }

  const headers = getHeaderRow(wb, 'EXPORT_APP_UNICO');
  const headersNorm = headers.map(normalizeCol);
  const missing = MINIMUM_REQUIRED.filter(col => !headersNorm.includes(normalizeCol(col)));
  if (missing.length > 0) {
    colunasFaltando.push({ aba: 'EXPORT_APP_UNICO', colunas: missing });
  }

  return { valido: abasFaltando.length === 0 && colunasFaltando.length === 0, abasFaltando, colunasFaltando };
}

// ── Build column index map from header row ──

function buildColMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeCol(headers[i]);
    // Map normalized name to known field
    for (const col of REQUIRED_COLUMNS) {
      if (normalizeCol(col) === norm) {
        map.set(col, i);
        break;
      }
    }
  }
  return map;
}

function col(row: unknown[], colMap: Map<string, number>, name: string): unknown {
  const idx = colMap.get(name);
  if (idx === undefined) return null;
  return row[idx];
}

// ── Parse single sheet ──

export function parseExcel(file: ArrayBuffer): ResultadoParsing {
  const wb = XLSX.read(file, { type: 'array' });
  const erros: ErroImportacao[] = [];

  const sheetName = 'EXPORT_APP_UNICO';
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return { lancamentos: [], saldosBancarios: [], contas: [], resumoCaixa: [], erros: [{ linha: 0, campo: 'Aba', mensagem: 'EXPORT_APP_UNICO não encontrada' }], totalLinhas: 0 };
  }

  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  if (allRows.length < 2) {
    return { lancamentos: [], saldosBancarios: [], contas: [], resumoCaixa: [], erros: [], totalLinhas: 0 };
  }

  const headers = (allRows[0] || []).map(c => String(c ?? '').trim());
  const colMap = buildColMap(headers);
  const dataRows = allRows.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''));

  const lancamentos: LinhaImportada[] = [];
  const saldosBancarios: SaldoBancarioImportado[] = [];
  const resumoCaixa: ResumoCaixaImportado[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const linhaNum = i + 2;
    const tipoRegistro = (str(col(r, colMap, 'Tipo_Registro')) || '').toUpperCase();
    const anoMes = parseAnoMes(col(r, colMap, 'AnoMes'));
    const valor = parseValor(col(r, colMap, 'Valor'));
    const fazenda = str(col(r, colMap, 'Fazenda'));

    if (!tipoRegistro) {
      erros.push({ linha: linhaNum, campo: 'Tipo_Registro', mensagem: 'Tipo de registro ausente', aba: sheetName });
      continue;
    }
    if (!anoMes) erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: 'Competência inválida ou ausente', aba: sheetName });
    if (valor === null) erros.push({ linha: linhaNum, campo: 'Valor', mensagem: 'Valor inválido ou ausente', aba: sheetName });
    if (!fazenda) erros.push({ linha: linhaNum, campo: 'Fazenda', mensagem: 'Código da fazenda ausente', aba: sheetName });

    if (!anoMes || valor === null || !fazenda) continue;

    if (tipoRegistro === 'LANCAMENTO') {
      const tipoOp = str(col(r, colMap, 'Tipo'));
      const macro = str(col(r, colMap, 'Macro_Custo'));
      lancamentos.push({
        linha: linhaNum,
        anoMes,
        dataPagamento: parseDate(col(r, colMap, 'Data_Ref')),
        valor,
        statusTransacao: str(col(r, colMap, 'Status')),
        fazenda,
        fazendaId: null,
        tipoOperacao: tipoOp,
        macroCusto: macro,
        grupoCusto: str(col(r, colMap, 'Grupo_Custo')),
        centroCusto: str(col(r, colMap, 'Centro_Custo')),
        subcentro: str(col(r, colMap, 'Subcentro')),
        contaOrigem: str(col(r, colMap, 'Conta')),
        contaDestino: null,
        fornecedor: str(col(r, colMap, 'Fornecedor')),
        produto: str(col(r, colMap, 'Produto')),
        obs: str(col(r, colMap, 'Obs')),
        escopoNegocio: inferirEscopo(tipoOp, macro),
      });
    } else if (tipoRegistro === 'SALDO') {
      const conta = str(col(r, colMap, 'Conta'));
      if (!conta) {
        erros.push({ linha: linhaNum, campo: 'Conta', mensagem: 'Conta bancária obrigatória para SALDO', aba: sheetName });
        continue;
      }
      saldosBancarios.push({
        linha: linhaNum,
        contaBanco: conta,
        anoMes,
        saldoFinal: valor,
        fazenda,
        fazendaId: null,
      });
    } else if (tipoRegistro === 'RESUMO') {
      // Parse entradas/saidas/saldo from Obs or use valor
      const obsText = str(col(r, colMap, 'Obs')) || '';
      const entMatch = obsText.match(/Entradas\s*=\s*([\d.]+)/i);
      const saiMatch = obsText.match(/Saidas\s*=\s*([\d.]+)/i);
      const salMatch = obsText.match(/Saldo\s*=\s*([\d.]+)/i);

      resumoCaixa.push({
        linha: linhaNum,
        anoMes,
        entradas: entMatch ? parseFloat(entMatch[1]) : (valor > 0 ? valor : 0),
        saidas: saiMatch ? parseFloat(saiMatch[1]) : 0,
        saldoFinalTotal: salMatch ? parseFloat(salMatch[1]) : valor,
        fazenda,
        fazendaId: null,
      });
    } else {
      erros.push({ linha: linhaNum, campo: 'Tipo_Registro', mensagem: `Tipo desconhecido: "${tipoRegistro}". Use LANCAMENTO, SALDO ou RESUMO`, aba: sheetName });
    }
  }

  return { lancamentos, saldosBancarios, contas: [], resumoCaixa, erros, totalLinhas: dataRows.length };
}

// ── Fazenda resolution ──

export interface FazendaMap {
  id: string;
  nome: string;
  codigo: string;
}

export function resolverFazendas(
  lancamentos: LinhaImportada[],
  fazendas: FazendaMap[],
): ErroImportacao[] {
  const erros: ErroImportacao[] = [];
  const mapaCode = new Map<string, string>();
  for (const f of fazendas) {
    mapaCode.set(f.codigo.toLowerCase().trim(), f.id);
  }

  for (const l of lancamentos) {
    if (!l.fazenda) { l.fazendaId = null; continue; }
    const code = l.fazenda.toLowerCase().trim();
    const id = mapaCode.get(code);
    if (id) {
      l.fazendaId = id;
    } else {
      l.fazendaId = null;
      erros.push({ linha: l.linha, campo: 'Fazenda', mensagem: `Código "${l.fazenda}" não encontrado` });
    }
  }
  return erros;
}

/** Resolve fazenda for saldos and resumo too */
export function resolverFazendasExtras(
  saldos: SaldoBancarioImportado[],
  resumo: ResumoCaixaImportado[],
  fazendas: FazendaMap[],
): ErroImportacao[] {
  const erros: ErroImportacao[] = [];
  const mapaCode = new Map<string, string>();
  for (const f of fazendas) {
    mapaCode.set(f.codigo.toLowerCase().trim(), f.id);
  }

  for (const s of saldos) {
    if (!s.fazenda) continue;
    const id = mapaCode.get(s.fazenda.toLowerCase().trim());
    if (id) { s.fazendaId = id; }
    else { erros.push({ linha: s.linha, campo: 'Fazenda', mensagem: `Código "${s.fazenda}" não encontrado (SALDO)` }); }
  }

  for (const r of resumo) {
    if (!r.fazenda) continue;
    const id = mapaCode.get(r.fazenda.toLowerCase().trim());
    if (id) { r.fazendaId = id; }
    else { erros.push({ linha: r.linha, campo: 'Fazenda', mensagem: `Código "${r.fazenda}" não encontrado (RESUMO)` }); }
  }

  return erros;
}

/** Validate cost center hierarchy */
export interface CentroCustoOficial {
  tipo_operacao: string;
  macro_custo: string;
  grupo_custo: string;
  centro_custo: string;
  subcentro: string | null;
}

export function validarCentrosCusto(
  linhas: LinhaImportada[],
  centrosOficiais: CentroCustoOficial[],
): ErroImportacao[] {
  if (centrosOficiais.length === 0) return [];
  const erros: ErroImportacao[] = [];
  const chaveSet = new Set(
    centrosOficiais.map(c =>
      [c.tipo_operacao, c.macro_custo, c.grupo_custo, c.centro_custo, c.subcentro || '']
        .map(s => s.toLowerCase().trim()).join('|')
    )
  );

  for (const l of linhas) {
    if (!l.macroCusto) continue;
    const chave = [l.tipoOperacao || '', l.macroCusto || '', l.grupoCusto || '', l.centroCusto || '', l.subcentro || '']
      .map(s => s.toLowerCase().trim()).join('|');
    if (!chaveSet.has(chave)) {
      erros.push({
        linha: l.linha, campo: 'Centro de Custo',
        mensagem: `Hierarquia não cadastrada: ${l.macroCusto} > ${l.grupoCusto || '?'} > ${l.centroCusto || '?'}`,
      });
    }
  }
  return erros;
}
