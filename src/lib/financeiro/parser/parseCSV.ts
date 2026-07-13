/**
 * Parser interno de extratos CSV (formato bancário brasileiro).
 *
 * Auto-detecta:
 *   - Delimitador (`;`, `,`, `\t`)
 *   - LAYOUT via cabeçalho (BUG-CSV-PARSE-VALOR-01):
 *       Layout A  →  Data | Histórico | Documento | Valor        (coluna única, signed)
 *       Layout B  →  Data | Histórico | Documento | Débito | Crédito
 *                     (Débito → valor NEGATIVO; Crédito → valor POSITIVO)
 *
 * Formatos de data aceitos: 'DD/MM/YYYY', 'DD/MM/YY', 'YYYY-MM-DD'.
 * Formato de valor: 'R$ -1.234,56' ou '-1234.56' — vírgula ou ponto.
 *
 * REGRA FINAL DO PARSER (BUG-CSV-PARSE-VALOR-01) — determinística, por COLUNA
 * monetária (nunca por descrição, nunca por posição):
 *   1+2. Valor EFETIVO igual a zero — seja 0/0,00 explícito, seja TODAS as colunas
 *        monetárias vazias — NÃO é movimentação financeira: a linha é IGNORADA e
 *        contabilizada em `linhasInformativas`. NUNCA se cria movimento de R$ 0,00.
 *   3. Coluna monetária preenchida mas ilegível/inconvertível, ou Débito e Crédito
 *      preenchidos (não-zero) na mesma linha (contraditório) → BLOQUEIA a importação
 *      inteira, informando linha + conteúdo.
 *   4. Layout sem "Valor" e sem o par "Débito"/"Crédito" → BLOQUEIA (CSV incompatível).
 *   Header: detectado por conteúdo (pula preâmbulos como "Extrato de: Ag ...").
 *
 * PROIBIDO: converter vazio em zero; usar descrição para decidir se é informativa;
 * fallback por posição fixa; pular em silêncio linha com valor monetário inválido.
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
  /** Layout B — índices das colunas Débito/Crédito (0-based). */
  colDebitoIdx?: number;
  colCreditoIdx?: number;
  /** Quando `true`, assume que não há linha de cabeçalho. */
  semCabecalho?: boolean;
}

/** Resultado do parse com a contabilização das linhas informativas (regra 2). */
export interface ResultadoParseCSV {
  movimentos: MovimentoBruto[];
  /** Números (1-based) das linhas datadas SEM valor efetivo (vazias ou zero) — ignoradas. */
  linhasInformativas: number[];
}

/** Erro de layout/valor — mensagem já legível para exibir direto na UI. */
export class CsvLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvLayoutError';
  }
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

/** Estado determinístico de uma célula monetária (regra 1/2/3). */
type CelulaValor =
  | { tipo: 'vazio' }
  | { tipo: 'numero'; valor: number }
  | { tipo: 'invalido'; bruto: string };

/**
 * Interpreta uma célula monetária. NUNCA devolve 0 por engano:
 *   - só espaços/R$ → 'vazio'      (o chamador trata vazio/zero como informativa)
 *   - '0' / '0,00' / '1.234,56'    → 'numero' (0 é número; efeito zero vira informativa no loop)
 *   - conteúdo não convertível     → 'invalido' (regra 3: bloqueia)
 */
function interpretarValorCelula(s: string): CelulaValor {
  const bruto = s.trim();
  let v = bruto.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (v === '') return { tipo: 'vazio' };
  // Se contém vírgula, é formato BR ('1.234,56'). Senão US ('1234.56').
  if (v.includes(',')) {
    v = v.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return { tipo: 'invalido', bruto };
  return { tipo: 'numero', valor: n };
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

interface ColunasDetectadas {
  data: number;
  desc: number;
  doc: number;
  valor: number;   // -1 quando ausente
  debito: number;  // -1 quando ausente
  credito: number; // -1 quando ausente
}

function detectarColunasPorHeader(header: string[]): ColunasDetectadas {
  const norm = header.map((h) =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );
  return {
    data: norm.findIndex((h) => /\bdata\b|movim/.test(h)),
    desc: norm.findIndex((h) => /hist|descri|memo|titulo/.test(h)),
    doc: norm.findIndex((h) => /doc|num|cheq/.test(h)),
    // "valor" NÃO pode casar débito/crédito (senão confundiria layout B).
    valor: norm.findIndex((h) => /valor|amount|montante/.test(h) && !/deb|cred/.test(h)),
    debito: norm.findIndex((h) => /\bdeb/.test(h)),
    credito: norm.findIndex((h) => /\bcred/.test(h)),
  };
}

/**
 * Parser com relatório — retorna movimentos + linhas informativas ignoradas.
 * Lança `CsvLayoutError` nos casos de bloqueio (layout incompatível / valor inválido).
 */
export function parseCSVComRelatorio(content: string, opts: ParseCsvOptions = {}): ResultadoParseCSV {
  const linhas = content.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return { movimentos: [], linhasInformativas: [] };

  let delim = opts.delimiter ?? detectarDelimitador(linhas[0]);

  // ── Resolução de colunas: opts explícito > cabeçalho. NUNCA por posição fixa. ──
  let colData = opts.colDataIdx ?? -1;
  let colDesc = opts.colDescricaoIdx ?? -1;
  let colDoc = opts.colDocumentoIdx ?? -1;
  let colValor = opts.colValorIdx ?? -1;
  let colDebito = opts.colDebitoIdx ?? -1;
  let colCredito = opts.colCreditoIdx ?? -1;
  let dataStart = 0;
  let headerLido: string[] = [];

  const semIndicesValor =
    opts.colValorIdx == null && (opts.colDebitoIdx == null || opts.colCreditoIdx == null);

  if (!opts.semCabecalho) {
    // Procura a LINHA de cabeçalho — ignora preâmbulos ("Extrato de: Ag ... | Conta ...").
    // Header = linha que tem coluna "Data" E (coluna "Valor" OU par "Débito"/"Crédito").
    const MAX_SCAN = Math.min(linhas.length, 15);
    let headerIdx = -1;
    for (let h = 0; h < MAX_SCAN; h++) {
      const d = opts.delimiter ?? detectarDelimitador(linhas[h]);
      const cols = splitCSVLinha(linhas[h], d);
      const cand = detectarColunasPorHeader(cols);
      const temValorCol = cand.valor >= 0 || (cand.debito >= 0 && cand.credito >= 0);
      if (cand.data >= 0 && temValorCol) {
        headerIdx = h;
        headerLido = cols;
        delim = d;
        if (colData < 0) colData = cand.data;
        if (colDesc < 0) colDesc = cand.desc;
        if (colDoc < 0) colDoc = cand.doc;
        if (semIndicesValor) { colValor = cand.valor; colDebito = cand.debito; colCredito = cand.credito; }
        break;
      }
    }
    if (headerIdx < 0) {
      throw new CsvLayoutError(
        'CSV não compatível: não foi encontrada linha de cabeçalho com "Data" e ' +
          '"Valor" (ou "Débito"/"Crédito") nas primeiras linhas do arquivo.',
      );
    }
    dataStart = headerIdx + 1;
  }

  // ── Decisão de LAYOUT (sem fallback de posição) ──────────────────────────
  const temValor = colValor >= 0;
  const temDebCred = colDebito >= 0 && colCredito >= 0;
  const cabecalhosMsg = headerLido.length ? ` Cabeçalhos lidos: [${headerLido.join(' | ')}].` : '';

  if (colData < 0) {
    throw new CsvLayoutError(`CSV não compatível: coluna "Data" não encontrada.${cabecalhosMsg}`);
  }
  // Preferência: se há Débito E Crédito, é Layout B (mais específico que "Valor").
  const layout: 'A' | 'B' = temDebCred ? 'B' : 'A';
  if (layout === 'A' && !temValor) {
    throw new CsvLayoutError(
      'CSV não compatível: nenhuma coluna de valor reconhecida. ' +
        'Esperado "Valor" (layout A) ou "Débito" e "Crédito" (layout B).' +
        cabecalhosMsg,
    );
  }

  const movimentos: MovimentoBruto[] = [];
  const linhasInformativas: number[] = [];
  const errosValor: { linha: number; conteudo: string }[] = [];

  for (let i = dataStart; i < linhas.length; i++) {
    const cols = splitCSVLinha(linhas[i], delim);
    if (cols.length === 0) continue;

    const data = parseDataBR(colData >= 0 ? (cols[colData] ?? '') : '');
    // Linha sem data válida = cabeçalho repetido / subtotal / rodapé → não é movimento.
    if (!data) continue;

    const numLinha = i + 1; // 1-based p/ o operador
    const descricao = colDesc >= 0 ? (cols[colDesc] ?? '').trim() : '';
    const documento = colDoc >= 0 && cols[colDoc] ? (cols[colDoc].trim() || null) : null;

    // ── Resolução do valor conforme o layout (por conteúdo real das colunas) ──
    let valor: number | null = null; // null = sem valor monetário resolvido

    if (layout === 'A') {
      const cel = interpretarValorCelula(cols[colValor] ?? '');
      if (cel.tipo === 'invalido') {
        errosValor.push({ linha: numLinha, conteudo: `Valor="${cel.bruto}"` });
        continue;
      }
      if (cel.tipo === 'numero') valor = cel.valor; // signed; vazio permanece null
    } else {
      const cd = interpretarValorCelula(cols[colDebito] ?? '');
      const cc = interpretarValorCelula(cols[colCredito] ?? '');
      // regra 3 — qualquer lado ilegível bloqueia
      if (cd.tipo === 'invalido') { errosValor.push({ linha: numLinha, conteudo: `Débito="${cd.bruto}"` }); continue; }
      if (cc.tipo === 'invalido') { errosValor.push({ linha: numLinha, conteudo: `Crédito="${cc.bruto}"` }); continue; }
      const dNum = cd.tipo === 'numero';
      const cNum = cc.tipo === 'numero';
      // regra 3 — Débito e Crédito ambos preenchidos com número não-zero = contraditório
      if (dNum && cNum && cd.valor !== 0 && cc.valor !== 0) {
        errosValor.push({ linha: numLinha, conteudo: `Débito e Crédito simultâneos (${cd.valor} / ${cc.valor})` });
        continue;
      }
      if (dNum || cNum) {
        // Débito → negativo; Crédito → positivo. Lado vazio não contribui.
        // Math.abs blinda sinal já embutido. Pode resultar 0 (0,00 explícito).
        const deb = dNum ? Math.abs(cd.valor) : 0;
        const cred = cNum ? Math.abs(cc.valor) : 0;
        valor = cred - deb;
      }
    }

    // REGRA FINAL — valor EFETIVO igual a zero (0/0,00 explícito OU todas as colunas
    // monetárias vazias) NÃO é movimentação: ignora e contabiliza. Nunca cria R$ 0,00.
    if (valor == null || valor === 0) {
      linhasInformativas.push(numLinha);
      continue;
    }

    movimentos.push({
      data,
      valor,
      tipo: valor >= 0 ? 'credito' : 'debito',
      descricao,
      documento,
    });
  }

  // regra 3 — qualquer valor monetário inválido/contraditório bloqueia TUDO.
  if (errosValor.length > 0) {
    const amostra = errosValor
      .slice(0, 3)
      .map((e) => `linha ${e.linha}: ${e.conteudo}`)
      .join('; ');
    throw new CsvLayoutError(
      `Importação bloqueada: ${errosValor.length} linha(s) com valor monetário inválido ` +
        `(ex.: ${amostra}). Corrija o arquivo — nenhum movimento foi importado.`,
    );
  }

  return { movimentos, linhasInformativas };
}

/** Assinatura compatível: devolve apenas os movimentos (usa `parseCSVComRelatorio`). */
export function parseCSV(content: string, opts: ParseCsvOptions = {}): MovimentoBruto[] {
  return parseCSVComRelatorio(content, opts).movimentos;
}
