/**
 * Parser e validador de importação financeira via Excel.
 */
import * as XLSX from 'xlsx';

export interface LinhaImportada {
  linha: number;
  dataRealizacao: string;
  dataPagamento: string | null;
  produto: string | null;
  fornecedor: string | null;
  valor: number;
  statusTransacao: string | null;
  codigoFazenda: string;
  tipoOperacao: string | null;
  contaOrigem: string | null;
  contaDestino: string | null;
  macroCusto: string | null;
  grupoCusto: string | null;
  centroCusto: string | null;
  subcentro: string | null;
  notaFiscal: string | null;
  cpfCnpj: string | null;
  recorrencia: string | null;
  formaPagamento: string | null;
  obs: string | null;
  anoMes: string;
  escopoNegocio: string;
  fazendaId: string | null; // resolved after validation
}

export interface ErroImportacao {
  linha: number;
  campo: string;
  mensagem: string;
}

export interface ResultadoParsing {
  linhasValidas: LinhaImportada[];
  erros: ErroImportacao[];
  totalLinhas: number;
}

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim();
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  // Handle Excel serial dates
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return null;
  }
  const s = String(val).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY
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
  // Try YYYY/MM
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return null;
}

/** Infere escopo_negocio a partir do tipo_operacao e macro_custo */
function inferirEscopo(tipoOp: string | null, macro: string | null): string {
  const combined = `${tipoOp || ''} ${macro || ''}`.toLowerCase();
  if (combined.includes('agricul')) return 'agricultura';
  if (combined.includes('financ') || combined.includes('emprest') || combined.includes('juros')) return 'financeiro';
  return 'pecuaria';
}

export function parseExcel(file: ArrayBuffer): ResultadoParsing {
  const wb = XLSX.read(file, { type: 'array' });
  // Use first sheet or "DADOS"
  const sheetName = wb.SheetNames.includes('DADOS') ? 'DADOS' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

  if (rows.length < 2) return { linhasValidas: [], erros: [], totalLinhas: 0 };

  // Skip header row
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''));
  const erros: ErroImportacao[] = [];
  const linhasValidas: LinhaImportada[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const linhaNum = i + 2; // 1-indexed + header

    const dataRealizacao = parseDate(r[0]);
    const dataPagamento = parseDate(r[1]);
    const valor = parseValor(r[4]);
    const codigoFazenda = str(r[6]);
    const anoMes = parseAnoMes(r[22]);

    // Validações obrigatórias
    if (!dataRealizacao) {
      erros.push({ linha: linhaNum, campo: 'Data Realização', mensagem: 'Data inválida ou ausente' });
    }
    if (valor === null) {
      erros.push({ linha: linhaNum, campo: 'Valor', mensagem: 'Valor inválido ou ausente' });
    }
    if (!codigoFazenda) {
      erros.push({ linha: linhaNum, campo: 'Codigo_Fazenda', mensagem: 'Código da fazenda é obrigatório' });
    }
    if (!anoMes) {
      erros.push({ linha: linhaNum, campo: 'AnoMes', mensagem: 'Competência inválida ou ausente (formato: AAAA-MM)' });
    }

    if (!dataRealizacao || valor === null || !codigoFazenda || !anoMes) continue;

    const tipoOp = str(r[7]);
    const macro = str(r[10]);

    linhasValidas.push({
      linha: linhaNum,
      dataRealizacao,
      dataPagamento,
      produto: str(r[2]),
      fornecedor: str(r[3]),
      valor,
      statusTransacao: str(r[5]),
      codigoFazenda,
      tipoOperacao: tipoOp,
      contaOrigem: str(r[8]),
      contaDestino: str(r[9]),
      macroCusto: macro,
      grupoCusto: str(r[11]),
      centroCusto: str(r[12]),
      subcentro: str(r[13]),
      notaFiscal: str(r[14]),
      cpfCnpj: str(r[16]),
      recorrencia: str(r[17]),
      formaPagamento: str(r[18]),
      obs: str(r[19]),
      anoMes,
      escopoNegocio: inferirEscopo(tipoOp, macro),
      fazendaId: null,
    });
  }

  return { linhasValidas, erros, totalLinhas: dataRows.length };
}

/** Mapeia codigo_fazenda → fazenda_id usando o cadastro de fazendas */
export interface FazendaCodigo {
  id: string;
  codigo_importacao: string;
}

export function validarEMapearFazendas(
  linhas: LinhaImportada[],
  fazendasCodigos: FazendaCodigo[],
  codigoAdm: string = 'ADM',
): ErroImportacao[] {
  const erros: ErroImportacao[] = [];
  const mapaCodigoPara = new Map<string, string>();
  for (const f of fazendasCodigos) {
    if (f.codigo_importacao) {
      mapaCodigoPara.set(f.codigo_importacao.toUpperCase().trim(), f.id);
    }
  }

  for (const l of linhas) {
    const cod = l.codigoFazenda.toUpperCase().trim();
    if (cod === codigoAdm.toUpperCase()) {
      // ADM = global/administrativo — will be stored with the current fazenda but marked
      l.fazendaId = '__adm__';
      continue;
    }
    const fId = mapaCodigoPara.get(cod);
    if (fId) {
      l.fazendaId = fId;
    } else {
      erros.push({
        linha: l.linha,
        campo: 'Codigo_Fazenda',
        mensagem: `Código "${l.codigoFazenda}" não encontrado no cadastro de fazendas`,
      });
    }
  }
  return erros;
}

/** Valida hierarquia de centros de custo contra dimensão oficial */
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
  if (centrosOficiais.length === 0) return []; // Sem dimensão cadastrada, pular validação

  const erros: ErroImportacao[] = [];
  const chaveSet = new Set(
    centrosOficiais.map(c =>
      [c.tipo_operacao, c.macro_custo, c.grupo_custo, c.centro_custo, c.subcentro || '']
        .map(s => s.toLowerCase().trim())
        .join('|')
    )
  );

  for (const l of linhas) {
    // Only validate if at least macro_custo is filled
    if (!l.macroCusto) continue;

    const chave = [
      l.tipoOperacao || '',
      l.macroCusto || '',
      l.grupoCusto || '',
      l.centroCusto || '',
      l.subcentro || '',
    ].map(s => s.toLowerCase().trim()).join('|');

    if (!chaveSet.has(chave)) {
      erros.push({
        linha: l.linha,
        campo: 'Centro de Custo',
        mensagem: `Hierarquia não cadastrada: ${l.macroCusto} > ${l.grupoCusto || '?'} > ${l.centroCusto || '?'} > ${l.subcentro || '-'}`,
      });
    }
  }

  return erros;
}
