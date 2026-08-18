// ============================================================================
// parserLancamentos — PR-IMPORT-EXCEL-LANC-01. Parser do Excel de LANÇAMENTOS
// em vocabulário DO CLIENTE (plano de contas próprio).
//
// Distinção deliberada em relação aos dois parsers vizinhos:
//   · parserClassificacao — Excel que ENRIQUECE lançamento existente (staging).
//   · importParser        — Excel no formato AGROinBLUE (EXPORT_APP_UNICO).
//   · este                — Excel no vocabulário do cliente, que CRIA lançamento.
//
// Reusa parseDataRef e parseValorBR do parserClassificacao (fonte única de
// leitura de data e valor BR; não reescrever). Sheet: primeira do workbook.
//
// Função PURA: lê o arquivo, devolve linhas. NÃO resolve nada contra o banco,
// NÃO grava, NÃO decide o que entra — isso é do view/de-para.
// ============================================================================
import * as XLSX from 'xlsx';
import { parseDataRef, parseValorBR } from './parserClassificacao';

/** Tipos de operação aceitos na criação. '3-Transferências' é lido e rejeitado adiante. */
export const TIPO_ENTRADAS = '1-Entradas';
export const TIPO_SAIDAS = '2-Saídas';
export const TIPO_TRANSFERENCIAS = '3-Transferências';

/** Status aceitos na coluna opcional Status. Ausente/vazio → 'realizado' (decisão do briefing). */
export type StatusPlanilha = 'realizado' | 'previsto';

export interface LancamentoExcelRow {
  /** indiceLinha (0-based) + 2 — header é linha 1, dados começam em 2. */
  linha: number;

  // ── Obrigatórias ──
  data_competencia: string | null;   // 'YYYY-MM-DD'
  valor: number | null;              // sempre absoluto (positivo)
  tipo_operacao: string | null;      // normalizado p/ 1-Entradas | 2-Saídas | 3-Transferências
  conta_plano_texto: string | null;  // conta do plano DO CLIENTE → de-para de subcentro
  fazenda_texto: string | null;      // → de-para de fazenda
  fornecedor_texto: string | null;   // → de-para de fornecedor
  conta_bancaria_texto: string | null; // → de-para de conta bancária

  // ── Opcionais ──
  data_vencimento: string | null;
  data_pagamento: string | null;
  descricao: string | null;
  numero_documento: string | null;
  tipo_documento: string | null;
  forma_pagamento: string | null;
  observacao: string | null;
  status: StatusPlanilha | null;
  safra_texto: string | null;
}

export interface LancamentosParseResult {
  rows: LancamentoExcelRow[];
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  erros: Array<{ linha: number; motivo: string }>;
  nomeSheet: string | null;
}

// ─── Cabeçalhos aceitos (tolerante a variações do cliente) ──────────

const COL_COMPETENCIA = ['Data de competência', 'Data de competencia', 'Competência', 'Competencia', 'Data_Competencia', 'Data'];
const COL_VENCIMENTO = ['Data de vencimento', 'Vencimento', 'Data_Vencimento'];
const COL_PAGAMENTO = ['Data de pagamento', 'Pagamento', 'Data_Pagamento'];
const COL_VALOR = ['Valor', 'VALOR', 'Vl', 'Valor R$'];
const COL_TIPO = ['Tipo de operação', 'Tipo de operacao', 'Tipo', 'Tipo_Operacao'];
const COL_CONTA_PLANO = ['Conta', 'Conta (plano do cliente)', 'Plano de contas', 'Categoria', 'Classificação', 'Classificacao'];
const COL_FAZENDA = ['Fazenda', 'FAZENDA', 'Unidade'];
const COL_FORNECEDOR = ['Fornecedor', 'Favorecido', 'Beneficiário', 'Beneficiario'];
const COL_CONTA_BANCARIA = ['Conta bancária', 'Conta bancaria', 'Banco', 'Cartão', 'Cartao', 'Conta_Bancaria'];
const COL_DESCRICAO = ['Descrição', 'Descricao', 'Histórico', 'Historico', 'Produto'];
const COL_DOCUMENTO = ['Documento', 'Nº Documento', 'Numero Documento', 'Número Documento', 'NF'];
const COL_TIPO_DOCUMENTO = ['Tipo de documento', 'Tipo_Documento', 'Tipo Doc'];
const COL_FORMA_PAGAMENTO = ['Forma de pagamento', 'Forma_Pagamento', 'Forma'];
const COL_OBSERVACAO = ['Observação', 'Observacao', 'Obs', 'OBS', 'Observações', 'Observacoes'];
const COL_STATUS = ['Status', 'STATUS', 'Situação', 'Situacao'];
const COL_SAFRA = ['Safra', 'SAFRA'];

// ─── Helpers ────────────────────────────────────────────────────────

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/** Lê a 1ª coluna não-vazia dentre os cabeçalhos aceitos. Mesmo idioma do parserClassificacao. */
function pickCol(raw: Record<string, unknown>, names: string[]): string | null {
  for (const n of names) {
    const v = trimOrNull(raw[n]);
    if (v !== null) return v;
  }
  return null;
}

/** Idem, preservando o valor CRU (número/Date) para as colunas de data e valor. */
function pickRaw(raw: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    const v = raw[n];
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  return null;
}

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normaliza o Tipo para o vocabulário canônico. Aceita as formas curtas que o
 * cliente costuma usar. Sem match → null (linha rejeitada no parse).
 */
export function normalizarTipoOperacao(v: string | null): string | null {
  if (!v) return null;
  const n = normalizarTexto(v);
  if (n.startsWith('1') || n.includes('entrada') || n === 'receita' || n === 'credito') return TIPO_ENTRADAS;
  if (n.startsWith('2') || n.includes('saida') || n === 'despesa' || n === 'debito') return TIPO_SAIDAS;
  if (n.startsWith('3') || n.includes('transfer')) return TIPO_TRANSFERENCIAS;
  return null;
}

/**
 * Normaliza a coluna Status. Ausente/vazia → null (o view assume 'realizado').
 * Valor não reconhecido → null também: a planilha não decide vocabulário novo.
 */
export function normalizarStatus(v: string | null): StatusPlanilha | null {
  if (!v) return null;
  const n = normalizarTexto(v);
  if (n === 'realizado' || n === 'pago' || n === 'liquidado') return 'realizado';
  if (n === 'previsto' || n === 'a pagar' || n === 'aberto') return 'previsto';
  return null;
}

// ─── Parse de uma linha ─────────────────────────────────────────────

function parseRow(
  raw: Record<string, unknown>,
  linha: number,
): { row: LancamentoExcelRow | null; erro: string | null } {
  const dataCompetencia = parseDataRef(pickRaw(raw, COL_COMPETENCIA));
  const valor = parseValorBR(pickRaw(raw, COL_VALOR));
  const tipoOperacao = normalizarTipoOperacao(pickCol(raw, COL_TIPO));

  // Linha inteiramente vazia não é erro — é o rodapé em branco da planilha.
  const temAlgo =
    dataCompetencia !== null ||
    valor !== null ||
    tipoOperacao !== null ||
    pickCol(raw, COL_CONTA_PLANO) !== null;
  if (!temAlgo) return { row: null, erro: null };

  const faltando: string[] = [];
  if (dataCompetencia === null) faltando.push('Data de competência');
  if (valor === null) faltando.push('Valor');
  if (tipoOperacao === null) faltando.push('Tipo de operação');
  if (faltando.length > 0) {
    return { row: null, erro: `Faltando ou ilegível: ${faltando.join(', ')}` };
  }

  return {
    row: {
      linha,
      data_competencia: dataCompetencia,
      valor,
      tipo_operacao: tipoOperacao,
      conta_plano_texto: pickCol(raw, COL_CONTA_PLANO),
      fazenda_texto: pickCol(raw, COL_FAZENDA),
      fornecedor_texto: pickCol(raw, COL_FORNECEDOR),
      conta_bancaria_texto: pickCol(raw, COL_CONTA_BANCARIA),
      data_vencimento: parseDataRef(pickRaw(raw, COL_VENCIMENTO)),
      data_pagamento: parseDataRef(pickRaw(raw, COL_PAGAMENTO)),
      descricao: pickCol(raw, COL_DESCRICAO),
      numero_documento: pickCol(raw, COL_DOCUMENTO),
      tipo_documento: pickCol(raw, COL_TIPO_DOCUMENTO),
      forma_pagamento: pickCol(raw, COL_FORMA_PAGAMENTO),
      observacao: pickCol(raw, COL_OBSERVACAO),
      status: normalizarStatus(pickCol(raw, COL_STATUS)),
      safra_texto: pickCol(raw, COL_SAFRA),
    },
    erro: null,
  };
}

// ─── API principal ──────────────────────────────────────────────────

export async function parseExcelLancamentos(file: File): Promise<LancamentosParseResult> {
  const vazio = (erro: string): LancamentosParseResult => ({
    rows: [], totalLinhas: 0, linhasValidas: 0, linhasComErro: 0,
    erros: [{ linha: 0, motivo: erro }], nomeSheet: null,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });

  if (!wb.SheetNames || wb.SheetNames.length === 0) return vazio('Arquivo Excel sem sheets');

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return vazio(`Sheet "${sheetName}" não encontrada`);

  // raw: true preserva números (incl. serial date) e strings sem coerção.
  // defval: null deixa célula vazia como null em vez de omitir a chave.
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true,
    defval: null,
  });

  const rows: LancamentoExcelRow[] = [];
  const erros: Array<{ linha: number; motivo: string }> = [];

  rawRows.forEach((raw, idx) => {
    const linha = idx + 2;
    const { row, erro } = parseRow(raw, linha);
    if (row) rows.push(row);
    else if (erro) erros.push({ linha, motivo: erro });
  });

  return {
    rows,
    totalLinhas: rows.length + erros.length,
    linhasValidas: rows.length,
    linhasComErro: erros.length,
    erros,
    nomeSheet: sheetName,
  };
}
