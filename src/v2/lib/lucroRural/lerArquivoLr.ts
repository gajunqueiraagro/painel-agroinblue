// ============================================================================
// lerArquivoLr — FIN-LR-SYNC-01a. Leitor do xlsx de Contas a Pagar / Contas a
// Receber exportado do Lucro Rural.
//
// Função PURA: lê o arquivo e devolve as linhas CRUAS, com o cabeçalho do LR
// como chave ("Número", "CPF/CNPJ", "Data Vencimento"…), mais `_arquivo`,
// `_tipo_arquivo` e `_ordem`. NÃO resolve nada, NÃO compara, NÃO grava —
// quem compara é o banco (`fn_lr_sync_comparar`), que recebe estas linhas.
//
// Datas: célula de data do Excel vira 'AAAA-MM-DD' pelo número de série
// (`SSF.parse_date_code`, sem fuso — `cellDates` devolve o dia anterior a oeste
// de UTC); texto ("06/10/2026") passa como veio — o banco lê as duas formas.
// Número fica número (o banco lê em centavos). Sheet: a primeira do workbook.
// ============================================================================
import * as XLSX from 'xlsx';

export type TipoArquivoLr = 'pagar' | 'receber';

export type CelulaLr = string | number | boolean | null;

export interface LinhaLr {
  [coluna: string]: CelulaLr;
}

export type LeituraLr =
  | { ok: true; tipo: TipoArquivoLr; linhas: LinhaLr[]; linhaCabecalho: number }
  | { ok: false; motivo: string };

/** Colunas que todo arquivo do LR tem; sem elas a linha não é cabeçalho. */
const COLUNAS_OBRIGATORIAS: readonly string[] = ['Tipo', 'Número', 'Valor', 'Data Vencimento'];
const LINHAS_TESTADAS = 10;

function textoDoCabecalho(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Arredonda ao minuto: gravadores que derivam do JS deixam a data em 23:59:32 do dia anterior. */
function dataDoSerial(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(Math.round(serial * 1440) / 1440);
  if (!d) return null;
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

function celula(c: XLSX.CellObject | undefined): CelulaLr {
  if (!c || c.v === null || c.v === undefined) return null;
  if (c.t === 'n' && typeof c.v === 'number') {
    return c.z !== undefined && XLSX.SSF.is_date(c.z) ? dataDoSerial(c.v) : c.v;
  }
  if (typeof c.v === 'boolean' || typeof c.v === 'number') return c.v;
  const s = String(c.v).trim();
  return s === '' ? null : s;
}

/** O lado do arquivo sai do cabeçalho: o de receber tem "Cliente" / "Está Recebido?". */
export function tipoDoCabecalho(cabecalho: readonly string[]): TipoArquivoLr {
  return cabecalho.includes('Cliente') || cabecalho.includes('Está Recebido?') ? 'receber' : 'pagar';
}

export function lerArquivoLr(dados: ArrayBuffer, nomeArquivo: string): LeituraLr {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(dados, { type: 'array', cellNF: true });
  } catch {
    return { ok: false, motivo: 'Não foi possível ler o arquivo como planilha.' };
  }
  const nome = wb.SheetNames[0];
  const ws = nome ? wb.Sheets[nome] : undefined;
  if (!ws) return { ok: false, motivo: 'A planilha está vazia.' };

  const faixa = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  const matriz: CelulaLr[][] = [];
  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    const linha: CelulaLr[] = [];
    for (let c = faixa.s.c; c <= faixa.e.c; c++) linha.push(celula(ws[XLSX.utils.encode_cell({ r, c })]));
    matriz.push(linha);
  }
  let idxCab = -1;
  for (let i = 0; i < Math.min(LINHAS_TESTADAS, matriz.length); i++) {
    const nomes = (matriz[i] ?? []).map(textoDoCabecalho);
    if (COLUNAS_OBRIGATORIAS.every((c) => nomes.includes(c))) { idxCab = i; break; }
  }
  if (idxCab < 0) {
    return { ok: false, motivo: 'Cabeçalho do Lucro Rural não encontrado (Tipo, Número, Valor, Data Vencimento).' };
  }

  const cabecalho = (matriz[idxCab] ?? []).map(textoDoCabecalho);
  const tipo = tipoDoCabecalho(cabecalho);
  const linhas: LinhaLr[] = [];
  for (let i = idxCab + 1; i < matriz.length; i++) {
    const bruta = matriz[i] ?? [];
    const linha: LinhaLr = {};
    let temDado = false;
    cabecalho.forEach((col, j) => {
      if (!col) return;
      const v = bruta[j] ?? null;
      if (v !== null) temDado = true;
      linha[col] = v;
    });
    if (!temDado || linha['Valor'] === null || linha['Valor'] === undefined) continue;
    linha._arquivo = nomeArquivo;
    linha._tipo_arquivo = tipo;
    linha._ordem = linhas.length + 1;
    linhas.push(linha);
  }
  return { ok: true, tipo, linhas, linhaCabecalho: idxCab + 1 };
}
