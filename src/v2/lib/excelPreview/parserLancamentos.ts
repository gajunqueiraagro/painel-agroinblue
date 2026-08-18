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
  /**
   * Cabeçalho de plano de contas efetivamente encontrado na planilha, ou null.
   * null significa que NENHUMA linha terá subcentro resolvível — a tela avisa em
   * vez de deixar o operador descobrir isso pela prévia inteira em vermelho.
   */
  colunaPlanoDetectada: string | null;
  /** Linha do Excel (1-based) reconhecida como cabeçalho. null = nenhuma reconhecida. */
  linhaCabecalho: number | null;
  /** Quantas linhas do topo foram testadas em busca do cabeçalho. */
  linhasTestadas: number;
}

// ─── Cabeçalhos aceitos (tolerante a variações do cliente) ──────────
//
// EXPORTADOS de propósito: o gerador do modelo (modeloPlanilha.ts) usa o PRIMEIRO
// alias de cada lista como cabeçalho canônico. Assim o modelo que o operador baixa
// nunca diverge do que a tela sabe ler — a string existe em um lugar só.

export const COL_COMPETENCIA = ['Data de competência', 'Data de competencia', 'Competência', 'Competencia', 'Data_Competencia', 'Data'];
export const COL_VENCIMENTO = ['Data de vencimento', 'Vencimento', 'Data_Vencimento'];
export const COL_PAGAMENTO = ['Data de pagamento', 'Pagamento', 'Data_Pagamento'];
export const COL_VALOR = ['Valor', 'VALOR', 'Vl', 'Valor R$'];
export const COL_TIPO = ['Tipo de operação', 'Tipo de operacao', 'Tipo', 'Tipo_Operacao'];
// PR-IMPORT-EXCEL-LANC-02 — 'Conta' SAIU desta lista. Planilha em formato antigo traz
// coluna "Conta" com a conta BANCÁRIA ("cc-001 | bradesco"); ela era capturada aqui como
// se fosse plano de contas, o de-para bancário ficava vazio e 100% das linhas caíam com
// "conta do plano ainda não mapeada". Foi o que ocorreu na homologação. Nunca reintroduzir
// 'Conta' aqui: o termo é ambíguo entre os dois domínios.
export const COL_CONTA_PLANO = ['Conta (plano do cliente)', 'Plano de contas', 'Categoria', 'Classificação', 'Classificacao'];
export const COL_FAZENDA = ['Fazenda', 'FAZENDA', 'Unidade'];
export const COL_FORNECEDOR = ['Fornecedor', 'Favorecido', 'Beneficiário', 'Beneficiario'];
export const COL_CONTA_BANCARIA = ['Conta bancária', 'Conta bancaria', 'Banco', 'Cartão', 'Cartao', 'Conta_Bancaria'];
export const COL_DESCRICAO = ['Descrição', 'Descricao', 'Histórico', 'Historico', 'Produto'];
export const COL_DOCUMENTO = ['Documento', 'Nº Documento', 'Numero Documento', 'Número Documento', 'NF'];
export const COL_TIPO_DOCUMENTO = ['Tipo de documento', 'Tipo_Documento', 'Tipo Doc'];
export const COL_FORMA_PAGAMENTO = ['Forma de pagamento', 'Forma_Pagamento', 'Forma'];
export const COL_OBSERVACAO = ['Observação', 'Observacao', 'Obs', 'OBS', 'Observações', 'Observacoes'];
export const COL_STATUS = ['Status', 'STATUS', 'Situação', 'Situacao'];
export const COL_SAFRA = ['Safra', 'SAFRA'];

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

// ─── Localização da linha de cabeçalho ──────────────────────────────
//
// PR-IMPORT-EXCEL-LANC-03 — o parser NÃO pode assumir que o cabeçalho está na
// linha 1. O modelo gerado por modeloPlanilha.ts usa duas linhas: marcadores
// (OBRIGATÓRIA / opcional) na 1 e os cabeçalhos reais na 2. Lendo a primeira,
// nada casava e o arquivo voltava com 0 linhas — planilha certa, leitura errada.
//
// Solução: varrer o topo e adotar como cabeçalho a linha que casa com mais
// aliases conhecidos. Funciona com o modelo de duas linhas e com planilha que já
// traga cabeçalho na linha 1, sem precisar saber de antemão qual é o caso.

/** Quantas linhas do topo são testadas. */
const LINHAS_TESTADAS_CABECALHO = 5;
/** Abaixo disto a linha não é cabeçalho — é dado que por acaso bateu uma palavra. */
const MINIMO_ALIASES_CABECALHO = 3;

const TODOS_ALIASES: readonly string[] = [
  ...COL_COMPETENCIA, ...COL_VENCIMENTO, ...COL_PAGAMENTO, ...COL_VALOR, ...COL_TIPO,
  ...COL_CONTA_PLANO, ...COL_FAZENDA, ...COL_FORNECEDOR, ...COL_CONTA_BANCARIA,
  ...COL_DESCRICAO, ...COL_DOCUMENTO, ...COL_TIPO_DOCUMENTO, ...COL_FORMA_PAGAMENTO,
  ...COL_OBSERVACAO, ...COL_STATUS, ...COL_SAFRA,
];

const ALIASES_SET = new Set<string>(TODOS_ALIASES);

/** Texto da célula de cabeçalho, sem coerção além de trim. */
function textoCelula(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Quantos aliases conhecidos esta linha reconhece. */
function pontuarLinha(linha: readonly unknown[]): number {
  let n = 0;
  const vistos = new Set<string>();
  for (const c of linha) {
    const t = textoCelula(c);
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    if (ALIASES_SET.has(t)) n++;
  }
  return n;
}

/**
 * Escolhe a linha de cabeçalho entre as primeiras `LINHAS_TESTADAS_CABECALHO`.
 * Empate resolve pela PRIMEIRA — se duas linhas reconhecem o mesmo tanto, a de
 * cima é o cabeçalho e a de baixo já é dado.
 */
function localizarCabecalho(
  matriz: readonly (readonly unknown[])[],
): { indice: number; acertos: number } | null {
  let melhor: { indice: number; acertos: number } | null = null;
  const limite = Math.min(LINHAS_TESTADAS_CABECALHO, matriz.length);
  for (let i = 0; i < limite; i++) {
    const acertos = pontuarLinha(matriz[i] ?? []);
    if (acertos > (melhor?.acertos ?? 0)) melhor = { indice: i, acertos };
  }
  if (!melhor || melhor.acertos < MINIMO_ALIASES_CABECALHO) return null;
  return melhor;
}

/**
 * Monta o objeto da linha de dados usando os cabeçalhos localizados.
 * Cabeçalho repetido: a PRIMEIRA coluna vence — mesma precedência do pickCol,
 * que já lê o primeiro alias não-vazio.
 */
function linhaParaObjeto(
  cabecalhos: readonly string[],
  linha: readonly unknown[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  cabecalhos.forEach((cab, i) => {
    if (!cab || cab in out) return;
    out[cab] = linha[i] ?? null;
  });
  return out;
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
    colunaPlanoDetectada: null, linhaCabecalho: null, linhasTestadas: 0,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });

  if (!wb.SheetNames || wb.SheetNames.length === 0) return vazio('Arquivo Excel sem sheets');

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return vazio(`Sheet "${sheetName}" não encontrada`);

  // Matriz crua: header:1 devolve array-de-arrays, sem assumir onde está o cabeçalho.
  // raw: true preserva números (incl. serial date); defval: null mantém a posição das
  // células vazias, o que é essencial para o índice de coluna bater com o cabeçalho.
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const achado = localizarCabecalho(matriz);
  const linhasTestadas = Math.min(LINHAS_TESTADAS_CABECALHO, matriz.length);

  if (!achado) {
    return {
      rows: [], totalLinhas: 0, linhasValidas: 0, linhasComErro: 0,
      erros: [{
        linha: 0,
        motivo: `Nenhuma linha de cabeçalho reconhecida nas ${linhasTestadas} primeiras linhas `
          + `da aba "${sheetName}". É esperado ao menos ${MINIMO_ALIASES_CABECALHO} colunas conhecidas.`,
      }],
      nomeSheet: sheetName,
      colunaPlanoDetectada: null,
      linhaCabecalho: null,
      linhasTestadas,
    };
  }

  const cabecalhos = (matriz[achado.indice] ?? []).map(textoCelula);

  // Detecção pelo CABEÇALHO, não pelo conteúdo: uma planilha pode ter a coluna
  // presente e vazia nas primeiras linhas, e isso não é o mesmo que não ter a coluna.
  const colunaPlanoDetectada =
    COL_CONTA_PLANO.find((c) => cabecalhos.includes(c)) ?? null;

  const rows: LancamentoExcelRow[] = [];
  const erros: Array<{ linha: number; motivo: string }> = [];

  for (let k = achado.indice + 1; k < matriz.length; k++) {
    const linha = k + 1;   // Excel é 1-based; a matriz é 0-based.
    const { row, erro } = parseRow(linhaParaObjeto(cabecalhos, matriz[k] ?? []), linha);
    if (row) rows.push(row);
    else if (erro) erros.push({ linha, motivo: erro });
  }

  return {
    rows,
    totalLinhas: rows.length + erros.length,
    linhasValidas: rows.length,
    linhasComErro: erros.length,
    erros,
    nomeSheet: sheetName,
    colunaPlanoDetectada,
    linhaCabecalho: achado.indice + 1,
    linhasTestadas,
  };
}
