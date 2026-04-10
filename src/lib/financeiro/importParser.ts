/**
 * Parser para importação financeira — aba única EXPORT_APP_UNICO.
 */
import * as XLSX from 'xlsx';

import { parseDocumentoImportV2, type TipoDocumento } from './documentoHelper';

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
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  documentoOriginal: string | null;
  /** Raw Excel cell values keyed by header name — for full preview */
  rawExcel?: Record<string, string>;
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
  /** Original Excel headers for full preview */
  excelHeaders?: string[];
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

function isTransferencia(tipo: string | null): boolean {
  if (!tipo) return false;
  const t = tipo.toLowerCase();
  return t.startsWith('3') || t.includes('transfer') || t.includes('resgate') || t.includes('aplicaç');
}

// ── Column index mapping ──

const REQUIRED_COLUMNS = [
  'Tipo_Registro', 'AnoMes', 'Data_Ref', 'Conta', 'Conta_Destino', 'Fazenda',
  'Tipo', 'Grupo', 'Valor', 'Status', 'Produto',
  'Fornecedor', 'Macro_Custo', 'Grupo_Custo', 'Centro_Custo', 'Subcentro', 'Obs',
  'Documento', 'Nota_Fiscal', 'NF', 'Tipo_Documento',
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
  const n = s.toLowerCase().replace(/[_\s]/g, '');
  // Aliases — keep Nota_Fiscal and NF as separate mapped columns
  if (n === 'notafiscal') return 'notafiscal';
  if (n === 'nf') return 'nf';
  if (n === 'tipodocumento') return 'tipodocumento';
  return n;
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
    return { lancamentos: [], saldosBancarios: [], contas: [], resumoCaixa: [], erros: [{ linha: 0, campo: 'Aba', mensagem: 'EXPORT_APP_UNICO não encontrada' }], totalLinhas: 0, excelHeaders: [] };
  }

  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  if (allRows.length < 2) {
    return { lancamentos: [], saldosBancarios: [], contas: [], resumoCaixa: [], erros: [], totalLinhas: 0, excelHeaders: [] };
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

    if (!tipoRegistro) {
      erros.push({ linha: linhaNum, campo: 'Tipo_Registro', mensagem: 'Tipo de registro ausente', aba: sheetName });
      continue;
    }

    const errPrefix = `[${tipoRegistro}]`;

    // Common fields
    const anoMes = parseAnoMes(col(r, colMap, 'AnoMes'));
    const valor = parseValor(col(r, colMap, 'Valor'));
    const tipo = str(col(r, colMap, 'Tipo'));
    const fazenda = str(col(r, colMap, 'Fazenda'));
    const conta = str(col(r, colMap, 'Conta'));

    if (tipoRegistro === 'LANCAMENTO') {
      // Required: Tipo_Registro, AnoMes, Data_Ref, Conta, Tipo, Valor, Status, Fazenda
      let hasError = false;
      const dataRef = parseDate(col(r, colMap, 'Data_Ref'));
      const status = (str(col(r, colMap, 'Status')) || '').toLowerCase().trim() || null;
      const contaDestino = str(col(r, colMap, 'Conta_Destino'));

      if (!anoMes) { erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: `${errPrefix} Competência inválida ou ausente`, aba: sheetName }); hasError = true; }
      if (!dataRef) { erros.push({ linha: linhaNum, campo: 'Data_Ref', mensagem: `${errPrefix} Data de referência ausente`, aba: sheetName }); hasError = true; }
      if (!conta) { erros.push({ linha: linhaNum, campo: 'Conta', mensagem: `${errPrefix} Conta (origem) ausente`, aba: sheetName }); hasError = true; }
      if (!tipo) { erros.push({ linha: linhaNum, campo: 'Tipo', mensagem: `${errPrefix} Tipo de operação ausente`, aba: sheetName }); hasError = true; }
      if (valor === null) { erros.push({ linha: linhaNum, campo: 'Valor', mensagem: `${errPrefix} Valor inválido ou ausente`, aba: sheetName }); hasError = true; }
      if (!status) { erros.push({ linha: linhaNum, campo: 'Status', mensagem: `${errPrefix} Status ausente`, aba: sheetName }); hasError = true; }
      if (!fazenda) { erros.push({ linha: linhaNum, campo: 'Fazenda', mensagem: `${errPrefix} Código da fazenda ausente`, aba: sheetName }); hasError = true; }

      // ── Validação obrigatória para transferências ──
      if (isTransferencia(tipo) && !hasError) {
        if (!contaDestino) {
          erros.push({ linha: linhaNum, campo: 'Conta_Destino', mensagem: `${errPrefix} Transferência sem conta destino. Preencha a coluna Conta_Destino`, aba: sheetName });
          hasError = true;
        }
        if (conta && contaDestino && conta.toLowerCase().trim() === contaDestino.toLowerCase().trim()) {
          erros.push({ linha: linhaNum, campo: 'Conta_Destino', mensagem: `${errPrefix} Conta origem e destino são iguais: "${conta}"`, aba: sheetName });
          hasError = true;
        }
      }

      if (hasError) continue;

      const macro = str(col(r, colMap, 'Macro_Custo'));

      // Parse documento: try Documento, Nota_Fiscal, or NF columns
      const rawDocumento = str(col(r, colMap, 'Documento')) || str(col(r, colMap, 'Nota_Fiscal')) || str(col(r, colMap, 'NF'));
      const rawTipoDocumento = str(col(r, colMap, 'Tipo_Documento'));

      let tipoDocFinal: string | null = null;
      let notaFiscalFinal: string | null = null;
      let docOriginal: string | null = rawDocumento;

      if (rawTipoDocumento) {
        // Tipo_Documento column provided explicitly — use it directly
        tipoDocFinal = rawTipoDocumento;
        if (rawDocumento) {
          const parsed = parseDocumentoImportV2(rawDocumento);
          notaFiscalFinal = parsed.numeroDocumento;
        }
      } else if (rawDocumento) {
        const parsed = parseDocumentoImportV2(rawDocumento);
        tipoDocFinal = parsed.tipoDocumento;
        notaFiscalFinal = parsed.numeroDocumento;
        docOriginal = parsed.documentoOriginal || rawDocumento;
      }

      // Build raw Excel record for preview
      const rawExcel: Record<string, string> = {};
      for (let hi = 0; hi < headers.length; hi++) {
        const hdr = headers[hi];
        const val = r[hi];
        rawExcel[hdr] = val != null && val !== '' ? String(val) : '';
      }

      lancamentos.push({
        linha: linhaNum,
        anoMes: anoMes!,
        dataPagamento: dataRef,
        valor: valor!,
        statusTransacao: status,
        fazenda,
        fazendaId: null,
        tipoOperacao: tipo,
        macroCusto: macro,
        grupoCusto: str(col(r, colMap, 'Grupo_Custo')),
        centroCusto: str(col(r, colMap, 'Centro_Custo')),
        subcentro: str(col(r, colMap, 'Subcentro')),
        contaOrigem: conta,
        contaDestino: isTransferencia(tipo) ? contaDestino : null,
        fornecedor: str(col(r, colMap, 'Fornecedor')),
        produto: str(col(r, colMap, 'Produto')),
        obs: str(col(r, colMap, 'Obs')),
        escopoNegocio: inferirEscopo(tipo, macro),
        tipoDocumento: tipoDocFinal,
        numeroDocumento: notaFiscalFinal,
        documentoOriginal: docOriginal,
        rawExcel,
      });

    } else if (tipoRegistro === 'SALDO') {
      // Required: Tipo_Registro, AnoMes, Conta, Tipo, Valor
      let hasError = false;
      if (!anoMes) { erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: `${errPrefix} Competência inválida ou ausente`, aba: sheetName }); hasError = true; }
      if (!conta) { erros.push({ linha: linhaNum, campo: 'Conta', mensagem: `${errPrefix} Conta bancária ausente`, aba: sheetName }); hasError = true; }
      if (!tipo) { erros.push({ linha: linhaNum, campo: 'Tipo', mensagem: `${errPrefix} Tipo ausente (ex: Saldo_Final)`, aba: sheetName }); hasError = true; }
      if (valor === null) { erros.push({ linha: linhaNum, campo: 'Valor', mensagem: `${errPrefix} Valor inválido ou ausente`, aba: sheetName }); hasError = true; }
      if (hasError) continue;

      saldosBancarios.push({
        linha: linhaNum,
        contaBanco: conta!,
        anoMes: anoMes!,
        saldoFinal: valor!,
        fazenda,
        fazendaId: null,
      });

    } else if (tipoRegistro === 'RESUMO') {
      // Required: Tipo_Registro, AnoMes, Tipo, Valor
      let hasError = false;
      if (!anoMes) { erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: `${errPrefix} Competência inválida ou ausente`, aba: sheetName }); hasError = true; }
      if (!tipo) { erros.push({ linha: linhaNum, campo: 'Tipo', mensagem: `${errPrefix} Tipo ausente (ex: Entradas, Saidas, Saldo_Final_Total)`, aba: sheetName }); hasError = true; }
      if (valor === null) { erros.push({ linha: linhaNum, campo: 'Valor', mensagem: `${errPrefix} Valor inválido ou ausente`, aba: sheetName }); hasError = true; }
      if (hasError) continue;

      // Group resumo by anoMes+fazenda — each row is one metric type
      const tipoNorm = (tipo || '').toLowerCase().replace(/[_\s]/g, '');
      const entradas = tipoNorm === 'entradas' ? valor! : 0;
      const saidas = tipoNorm === 'saidas' ? valor! : 0;
      const saldoFinal = (tipoNorm === 'saldofinaltotal' || tipoNorm === 'saldoinicialtotal') ? valor! : 0;

      resumoCaixa.push({
        linha: linhaNum,
        anoMes: anoMes!,
        entradas,
        saidas,
        saldoFinalTotal: saldoFinal,
        fazenda,
        fazendaId: null,
      });

    } else {
      erros.push({ linha: linhaNum, campo: 'Tipo_Registro', mensagem: `Tipo desconhecido: "${tipoRegistro}". Use LANCAMENTO, SALDO ou RESUMO`, aba: sheetName });
    }
  }

  return { lancamentos, saldosBancarios, contas: [], resumoCaixa, erros, totalLinhas: dataRows.length, excelHeaders: headers };
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
