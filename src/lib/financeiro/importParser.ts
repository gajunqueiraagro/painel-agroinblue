/**
 * Parser para importação financeira via Excel — 4 abas.
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

function getRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  if (!wb.SheetNames.includes(name)) return [];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  if (rows.length < 2) return [];
  return rows.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''));
}

// ── Sheet & column validation ──

const REQUIRED_SHEETS = ['EXPORT_LANCAMENTOS', 'EXPORT_SALDOS_BANCARIOS', 'EXPORT_CONTAS', 'EXPORT_RESUMO_CAIXA'] as const;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  EXPORT_LANCAMENTOS: ['AnoMes', 'Data Pagamento', 'Valor', 'Tipo Operação', 'Status Transação', 'Fazenda', 'Macro_Custo', 'Grupo_Custo'],
  EXPORT_SALDOS_BANCARIOS: ['Conta Banco', 'AnoMes', 'Saldo_Final'],
  EXPORT_CONTAS: ['Conta_ID', 'Conta_Label', 'Banco'],
  EXPORT_RESUMO_CAIXA: ['AnoMes', 'Entradas', 'Saidas', 'Saldo_Final_Total'],
};

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

export function validarEstruturaExcel(file: ArrayBuffer): ValidacaoEstrutura {
  const wb = XLSX.read(file, { type: 'array' });
  const abasFaltando: string[] = [];
  const colunasFaltando: { aba: string; colunas: string[] }[] = [];

  for (const sheet of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(sheet)) {
      abasFaltando.push(sheet);
      continue;
    }
    const headers = getHeaderRow(wb, sheet);
    const headersLower = headers.map(h => h.toLowerCase().replace(/[_\s]/g, ''));
    const required = REQUIRED_COLUMNS[sheet];
    const missing = required.filter(col => {
      const colNorm = col.toLowerCase().replace(/[_\s]/g, '');
      return !headersLower.includes(colNorm);
    });
    if (missing.length > 0) colunasFaltando.push({ aba: sheet, colunas: missing });
  }

  return { valido: abasFaltando.length === 0 && colunasFaltando.length === 0, abasFaltando, colunasFaltando };
}

// ── Parse all 4 sheets ──

export function parseExcel(file: ArrayBuffer): ResultadoParsing {
  const wb = XLSX.read(file, { type: 'array' });
  const erros: ErroImportacao[] = [];
  let totalLinhas = 0;

  // ── EXPORT_LANCAMENTOS ──
  // Also support legacy "DADOS" sheet
  const lancSheetName = wb.SheetNames.includes('EXPORT_LANCAMENTOS') ? 'EXPORT_LANCAMENTOS'
    : wb.SheetNames.includes('DADOS') ? 'DADOS' : wb.SheetNames[0];
  const lancRows = getRows({ ...wb, SheetNames: [lancSheetName], Sheets: { [lancSheetName]: wb.Sheets[lancSheetName] } } as XLSX.WorkBook, lancSheetName);
  
  // Re-get rows properly
  const lancRawRows = (() => {
    if (!wb.Sheets[lancSheetName]) return [];
    const ws = wb.Sheets[lancSheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    if (rows.length < 2) return [];
    return rows.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''));
  })();

  totalLinhas += lancRawRows.length;
  const lancamentos: LinhaImportada[] = [];

  for (let i = 0; i < lancRawRows.length; i++) {
    const r = lancRawRows[i];
    const linhaNum = i + 2;

    // Detect if this is legacy format (col 0 = Data Realização) or new format (col 0 = AnoMes)
    // New format: AnoMes is YYYY-MM pattern at col 0
    const col0 = str(r[0]);
    const isNewFormat = wb.SheetNames.includes('EXPORT_LANCAMENTOS');

    if (isNewFormat) {
      // New format: AnoMes, Data Pagamento, Valor, Status, Fazenda, TipoOp, Macro, Grupo, Centro, Subcentro, ContaOrig, ContaDest, Fornecedor, Produto, Obs
      const anoMes = parseAnoMes(r[0]);
      const dataPagamento = parseDate(r[1]);
      const valor = parseValor(r[2]);
      const fazenda = str(r[4]);

      if (!anoMes) erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: 'Competência inválida ou ausente', aba: 'EXPORT_LANCAMENTOS' });
      if (valor === null) erros.push({ linha: linhaNum, campo: 'Valor', mensagem: 'Valor inválido ou ausente', aba: 'EXPORT_LANCAMENTOS' });
      if (!fazenda) erros.push({ linha: linhaNum, campo: 'Fazenda', mensagem: 'Código da fazenda ausente', aba: 'EXPORT_LANCAMENTOS' });
      if (!anoMes || valor === null || !fazenda) continue;

      const tipoOp = str(r[5]);
      const macro = str(r[6]);
      lancamentos.push({
        linha: linhaNum, anoMes, dataPagamento, valor,
        statusTransacao: str(r[3]), fazenda, fazendaId: null,
        tipoOperacao: tipoOp, macroCusto: macro, grupoCusto: str(r[7]),
        centroCusto: str(r[8]), subcentro: str(r[9]),
        contaOrigem: str(r[10]), contaDestino: str(r[11]),
        fornecedor: str(r[12]), produto: str(r[13]), obs: str(r[14]),
        escopoNegocio: inferirEscopo(tipoOp, macro),
      });
    } else {
      // Legacy format: Data Realizacao(0), Data Pagamento(1), Produto(2), Fornecedor(3), Valor(4), Status(5), Fazenda(6), TipoOp(7), ContaOrig(8), ContaDest(9), Macro(10), Grupo(11), Centro(12), Subcentro(13), NF(14), Mes(15), CNPJ(16), Recorr(17), FormaPag(18), Obs(19), Ano(20), Mes(21), AnoMes(22)
      const dataRealizacao = parseDate(r[0]);
      const valor = parseValor(r[4]);
      const anoMes = parseAnoMes(r[22]);
      const fazenda = str(r[6]);

      if (!dataRealizacao) erros.push({ linha: linhaNum, campo: 'Data Realização', mensagem: 'Data inválida ou ausente', aba: 'DADOS' });
      if (valor === null) erros.push({ linha: linhaNum, campo: 'Valor', mensagem: 'Valor inválido ou ausente', aba: 'DADOS' });
      if (!anoMes) erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: 'Competência inválida ou ausente', aba: 'DADOS' });
      if (!fazenda) erros.push({ linha: linhaNum, campo: 'Fazenda', mensagem: 'Código da fazenda ausente', aba: 'DADOS' });
      if (!dataRealizacao || valor === null || !anoMes || !fazenda) continue;

      const tipoOp = str(r[7]);
      const macro = str(r[10]);
      lancamentos.push({
        linha: linhaNum, anoMes,
        dataPagamento: parseDate(r[1]), valor,
        statusTransacao: str(r[5]), fazenda, fazendaId: null,
        tipoOperacao: tipoOp, macroCusto: macro, grupoCusto: str(r[11]),
        centroCusto: str(r[12]), subcentro: str(r[13]),
        contaOrigem: str(r[8]), contaDestino: str(r[9]),
        fornecedor: str(r[3]), produto: str(r[2]), obs: str(r[19]),
        escopoNegocio: inferirEscopo(tipoOp, macro),
      });
    }
  }

  // ── EXPORT_SALDOS_BANCARIOS ──
  const saldoRows = getRows(wb, 'EXPORT_SALDOS_BANCARIOS');
  totalLinhas += saldoRows.length;
  const saldosBancarios: SaldoBancarioImportado[] = [];

  for (let i = 0; i < saldoRows.length; i++) {
    const r = saldoRows[i];
    const linhaNum = i + 2;
    const contaBanco = str(r[0]);
    const anoMes = parseAnoMes(r[1]);
    const saldoFinal = parseValor(r[2]);

    if (!contaBanco) erros.push({ linha: linhaNum, campo: 'Conta Banco', mensagem: 'Nome da conta ausente', aba: 'EXPORT_SALDOS_BANCARIOS' });
    if (!anoMes) erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: 'Competência inválida', aba: 'EXPORT_SALDOS_BANCARIOS' });
    if (saldoFinal === null) erros.push({ linha: linhaNum, campo: 'Saldo_Final', mensagem: 'Saldo inválido', aba: 'EXPORT_SALDOS_BANCARIOS' });
    if (!contaBanco || !anoMes || saldoFinal === null) continue;

    saldosBancarios.push({ linha: linhaNum, contaBanco, anoMes, saldoFinal, fazenda: null, fazendaId: null });
  }

  // ── EXPORT_CONTAS ──
  const contasRows = getRows(wb, 'EXPORT_CONTAS');
  totalLinhas += contasRows.length;
  const contas: ContaImportada[] = [];

  for (let i = 0; i < contasRows.length; i++) {
    const r = contasRows[i];
    const linhaNum = i + 2;
    const contaId = str(r[0]);
    const contaLabel = str(r[1]);

    if (!contaId) erros.push({ linha: linhaNum, campo: 'Conta_ID', mensagem: 'ID da conta ausente', aba: 'EXPORT_CONTAS' });
    if (!contaLabel) erros.push({ linha: linhaNum, campo: 'Conta_Label', mensagem: 'Nome da conta ausente', aba: 'EXPORT_CONTAS' });
    if (!contaId || !contaLabel) continue;

    contas.push({
      linha: linhaNum, contaId, contaLabel,
      banco: str(r[2]), instrumento: str(r[3]),
      agenciaConta: str(r[4]), uso: str(r[5]),
      fazenda: null, fazendaId: null,
    });
  }

  // ── EXPORT_RESUMO_CAIXA ──
  const resumoRows = getRows(wb, 'EXPORT_RESUMO_CAIXA');
  totalLinhas += resumoRows.length;
  const resumoCaixa: ResumoCaixaImportado[] = [];

  for (let i = 0; i < resumoRows.length; i++) {
    const r = resumoRows[i];
    const linhaNum = i + 2;
    const anoMes = parseAnoMes(r[0]);
    const entradas = parseValor(r[1]);
    const saidas = parseValor(r[2]);
    const saldoFinalTotal = parseValor(r[3]);

    if (!anoMes) erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: 'Competência inválida', aba: 'EXPORT_RESUMO_CAIXA' });
    if (entradas === null) erros.push({ linha: linhaNum, campo: 'Entradas', mensagem: 'Valor inválido', aba: 'EXPORT_RESUMO_CAIXA' });
    if (saidas === null) erros.push({ linha: linhaNum, campo: 'Saidas', mensagem: 'Valor inválido', aba: 'EXPORT_RESUMO_CAIXA' });
    if (saldoFinalTotal === null) erros.push({ linha: linhaNum, campo: 'Saldo_Final_Total', mensagem: 'Valor inválido', aba: 'EXPORT_RESUMO_CAIXA' });
    if (!anoMes || entradas === null || saidas === null || saldoFinalTotal === null) continue;

    resumoCaixa.push({ linha: linhaNum, anoMes, entradas, saidas, saldoFinalTotal, fazenda: null, fazendaId: null });
  }

  return { lancamentos, saldosBancarios, contas, resumoCaixa, erros, totalLinhas };
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
