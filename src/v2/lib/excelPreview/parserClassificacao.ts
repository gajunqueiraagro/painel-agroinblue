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
/* ⚠ O VOCABULARIO VEM DO PARSER NOVO, e nao e' copiado: `COL_*` sao os
   cabecalhos que o modelo novo aceita, ja exportados por
   `colunasLancamento` — modulo SEM IMPORTS, de proposito. Duplicar a lista
   aqui criaria o segundo lugar onde o
   formato e' descrito, e o dia em que o modelo ganhasse um alias os dois
   discordariam — exatamente o que `detectarTipoArquivo` evita importando
   `CUSTEIO_FORMAT`. O MECANISMO (localizar cabecalho) fica local de proposito:
   o briefing manda nao tocar no bloco de cima. */
import {
  COL_COMPETENCIA, COL_VALOR, COL_TIPO, COL_CONTA_PLANO, COL_FAZENDA,
  COL_FORNECEDOR, COL_CONTA_BANCARIA, COL_DESCRICAO, COL_DOCUMENTO, COL_OBSERVACAO,
} from '@/v2/lib/excelPreview/colunasLancamento';

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
  observacao: string | null;  // PR-MAP-0 — contexto p/ o motor (NJ etc.)
  documento: string | null;   // PR-MAP-0 — texto (preserva zeros à esquerda)
  // PR-DePara-Conta-Fase1: UUID resolvido pelo DE/PARA do operador na Mesa.
  // Preenchido só no enriquecimento pré-populate (não no parsing do Excel).
  conta_origem_id?: string | null;
  conta_destino_id?: string | null;
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

// PR-MAP-0 — lê a 1ª coluna não-vazia dentre os cabeçalhos aceitos (tolerante a variações).
function pickCol(raw: Record<string, unknown>, names: string[]): string | null {
  for (const n of names) {
    const v = trimOrNull(raw[n]);
    if (v !== null) return v;
  }
  return null;
}
/**
 * OS DOIS FORMATOS, POR CAMPO — o legado primeiro, o modelo novo em seguida.
 *
 * ⚠ A ORDEM E' PRECEDENCIA: `pickCol` devolve o primeiro alias nao-vazio, entao
 * uma planilha que por acaso tenha as duas colunas responde pela do legado.
 *
 * ⚠ "CONTA" NAO QUER DIZER A MESMA COISA NOS DOIS. No legado, `Conta` e' a conta
 * BANCARIA (vira `conta_origem`); no modelo novo, `Conta (plano do cliente)` e' o
 * PLANO (vira `subcentro`) e o banco se chama `Conta bancaria`. Mapear por
 * semelhanca de nome jogaria o plano do cliente na conta de origem. Nenhum dos
 * dois arrays do modelo novo contem `Conta` puro — conferido —, entao a
 * separacao se sustenta.
 */
/** Como `pickCol`, mas devolve a celula CRUA — data e valor precisam do serial
 *  do Excel e do numero, nao do texto. */
function pickBruto(raw: Record<string, unknown>, names: readonly string[]): unknown {
  for (const n of names) {
    const v = raw[n];
    if (v !== null && v !== undefined && String(v).trim() !== '') return v;
  }
  return null;
}

const DATA_COLS = ['Data_Ref', ...COL_COMPETENCIA];
const VALOR_COLS = ['Valor', ...COL_VALOR];
const TIPO_COLS = ['Tipo', ...COL_TIPO];
const SUBCENTRO_COLS = ['Subcentro', ...COL_CONTA_PLANO];
const FORNECEDOR_COLS = ['Fornecedor', ...COL_FORNECEDOR];
const PRODUTO_COLS = ['Produto', ...COL_DESCRICAO];
const CONTA_ORIGEM_COLS = ['Conta', ...COL_CONTA_BANCARIA];
const CONTA_DESTINO_COLS = ['Conta_Destino', 'Conta destino', 'Conta Destino'];
const FAZENDA_COLS = ['Fazenda', ...COL_FAZENDA];
const ANOMES_COLS = ['AnoMes', 'Ano_Mes', 'Ano/Mes'];
const OBS_COLS = ['Obs', 'OBS', 'Observação', 'Observacao', 'Observações', 'Observacoes', ...COL_OBSERVACAO];
const DOC_COLS = ['Documento', 'Documento_Numero', 'Nº Documento', 'Numero Documento', 'Número Documento', ...COL_DOCUMENTO];

/** Todo cabecalho que qualquer um dos dois formatos reconhece. */
const ALIASES_CONHECIDOS = new Set<string>([
  ...DATA_COLS, ...VALOR_COLS, ...TIPO_COLS, ...SUBCENTRO_COLS, ...FORNECEDOR_COLS,
  ...PRODUTO_COLS, ...CONTA_ORIGEM_COLS, ...CONTA_DESTINO_COLS, ...FAZENDA_COLS,
  ...ANOMES_COLS, ...OBS_COLS, ...DOC_COLS,
]);

/** Quantas linhas do topo podem ser cabecalho. O modelo novo poe um marcador
 *  ("OBRIGATORIA"/"opcional") na linha 1 e os cabecalhos na 2. */
const LINHAS_TESTADAS_CABECALHO = 5;
/** Abaixo disto nao e' cabecalho — e' dado que por acaso bateu uma palavra. */
const MINIMO_ALIASES_CABECALHO = 3;

const textoCelula = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Acha a linha de cabecalho entre as primeiras. Empate resolve pela PRIMEIRA:
 * se duas linhas reconhecem o mesmo tanto, a de cima e' o cabecalho.
 */
function localizarCabecalho(matriz: readonly (readonly unknown[])[]): number | null {
  let melhor: { indice: number; acertos: number } | null = null;
  const limite = Math.min(LINHAS_TESTADAS_CABECALHO, matriz.length);
  for (let i = 0; i < limite; i++) {
    const vistos = new Set<string>();
    let acertos = 0;
    for (const c of matriz[i] ?? []) {
      const t = textoCelula(c);
      if (!t || vistos.has(t)) continue;
      vistos.add(t);
      if (ALIASES_CONHECIDOS.has(t)) acertos++;
    }
    if (acertos > (melhor?.acertos ?? 0)) melhor = { indice: i, acertos };
  }
  return melhor && melhor.acertos >= MINIMO_ALIASES_CABECALHO ? melhor.indice : null;
}

/** Objeto da linha pelos cabecalhos localizados. Cabecalho repetido: a PRIMEIRA vence. */
function linhaParaObjeto(cabecalhos: readonly string[], linha: readonly unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  cabecalhos.forEach((cab, i) => {
    if (!cab || cab in out) return;
    out[cab] = linha[i] ?? null;
  });
  return out;
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
  const dataRef = pickBruto(raw, DATA_COLS);
  const valor = pickBruto(raw, VALOR_COLS);
  const tipo = pickCol(raw, TIPO_COLS);
  const subcentro = pickCol(raw, SUBCENTRO_COLS);

  // Validação mínima
  const dataIso = parseDataRef(dataRef);
  if (!dataIso) {
    return { row: null, erro: 'Data de competência ausente ou em formato não suportado' };
  }
  const valorAbs = parseValorBR(valor);
  if (valorAbs === null) {
    return { row: null, erro: 'Valor ausente ou não-numérico' };
  }
  if (!tipo) {
    return { row: null, erro: 'Tipo vazio' };
  }
  if (!subcentro) {
    /* ⚠ CONTINUA OBRIGATORIO, e a mensagem passou a nomear os dois formatos: no
       modelo novo esta coluna e' OPCIONAL (uma celula em branco significa "entra
       sem classificacao"), e aqui nao — a sessao existe para conferir uma
       classificacao que precisa ter chegado. Relaxar isso seria mudar a logica
       do legado, que este PR nao faz. */
    return { row: null, erro: 'Subcentro (ou "Conta (plano do cliente)") vazio' };
  }

  const anoMesRaw = pickCol(raw, ANOMES_COLS);

  const row: ClassificacaoExcelRow = {
    linha,
    subcentro,
    fornecedor: pickCol(raw, FORNECEDOR_COLS),
    produto: pickCol(raw, PRODUTO_COLS),
    conta_origem: pickCol(raw, CONTA_ORIGEM_COLS),
    conta_destino: pickCol(raw, CONTA_DESTINO_COLS),
    ano_mes: anoMesRaw ?? dataIso.slice(0, 7),
    data: dataIso,
    valor: valorAbs,
    tipo_operacao: normalizeTipo(tipo),
    fazenda_codigo: pickCol(raw, FAZENDA_COLS),
    observacao: pickCol(raw, OBS_COLS),
    documento: pickCol(raw, DOC_COLS),
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

  /* ⚠ TRES PREFERENCIAS, NESTA ORDEM: a aba do formato legado, a do modelo novo,
     e a primeira do arquivo. Cair direto na primeira faria um arquivo do modelo
     novo com aba de instrucoes na frente ser lido pela aba errada. */
  const sheetName = wb.SheetNames.find((n) => n === 'EXPORT_APP_UNICO')
    ?? wb.SheetNames.find((n) => n === 'Lançamentos' || n === 'Lancamentos')
    ?? wb.SheetNames[0];
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

  /* ⚠ MATRIZ CRUA, e nao `sheet_to_json` com chaves: aquele modo ASSUME que o
     cabecalho e' a linha 1, e o modelo novo o poe na 2 (a 1 traz o marcador
     "OBRIGATORIA"/"opcional"). Lido como antes, o arquivo novo daria uma
     planilha inteira de colunas chamadas "OBRIGATORIA" — e zero linha valida,
     com a mensagem errada.
     raw: true preserva numeros (incl. serial de data); defval: null mantem a
     POSICAO das celulas vazias, o que e' o que faz o indice bater com o
     cabecalho. */
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  const indiceCabecalho = localizarCabecalho(matriz);
  if (indiceCabecalho === null) {
    return {
      rows: [], totalLinhas: 0, linhasValidas: 0, linhasComErro: 0,
      erros: [{
        linha: 0,
        motivo: `Nenhuma linha de cabeçalho reconhecida nas ${Math.min(LINHAS_TESTADAS_CABECALHO, matriz.length)}`
          + ` primeiras linhas da aba "${sheetName}". São esperadas ao menos`
          + ` ${MINIMO_ALIASES_CABECALHO} colunas conhecidas de um dos dois formatos.`,
      }],
    };
  }

  const cabecalhos = (matriz[indiceCabecalho] ?? []).map(textoCelula);

  const rows: ClassificacaoExcelRow[] = [];
  const erros: Array<{ linha: number; motivo: string }> = [];

  for (let k = indiceCabecalho + 1; k < matriz.length; k++) {
    const linha = k + 1; // Excel é 1-based; a matriz é 0-based.
    /* ⚠ COLUNA DESCONHECIDA NAO E' ERRO: `ID (nao mexer)`, `Safra` e o que mais
       o modelo novo trouxer entram no objeto e simplesmente nao sao lidos. */
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
  };
}
