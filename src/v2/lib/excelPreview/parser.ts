import * as XLSX from 'xlsx';
import { parse as parseDateFns, isValid as isValidDate, format as fmtDate } from 'date-fns';
import type { LoteExcel, ExcelLinhaRaw, ExcelLinhaNormalizada } from './types';

const SHEET_ESPERADO = 'EXPORT_APP_UNICO';

const COLUNAS_OBRIGATORIAS: (keyof ExcelLinhaRaw)[] = [
  'Tipo_Registro', 'AnoMes', 'Data_Competencia', 'Conta', 'Fazenda',
  'Tipo', 'Valor', 'Status', 'Subcentro',
];

/**
 * Lê um arquivo .xlsx e retorna LoteExcel em memória.
 * SEM persistência. SEM chamada de banco.
 */
export async function parseExcelToLote(file: File): Promise<LoteExcel> {
  const bytes = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const hashConteudo = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  // PR6.1B-1 — loteId determinístico derivado do hash do conteúdo (formato
  // UUID v4 8-4-4-4-12). Mesmo arquivo Excel = mesmo loteId sempre.
  // Reusa hashConteudo já calculado acima (sem duplicar SHA-256).
  const loteId =
    `${hashConteudo.slice(0, 8)}-${hashConteudo.slice(8, 12)}-` +
    `${hashConteudo.slice(12, 16)}-${hashConteudo.slice(16, 20)}-` +
    `${hashConteudo.slice(20, 32)}`;

  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  if (!wb.SheetNames.includes(SHEET_ESPERADO)) {
    return {
      loteId, nomeArquivo: file.name, tamanhoBytes: file.size,
      hashConteudo, parsedAt: new Date().toISOString(),
      totalLinhas: 0, linhasValidas: 0, linhasComErro: 0,
      erros: [`Sheet "${SHEET_ESPERADO}" não encontrada. Sheets presentes: ${wb.SheetNames.join(', ')}`],
      linhas: [],
    };
  }

  const sheet = wb.Sheets[SHEET_ESPERADO];
  const raw = XLSX.utils.sheet_to_json<ExcelLinhaRaw>(sheet, { raw: true, defval: null });

  // validar colunas
  const colunasPresentes = raw.length > 0 ? Object.keys(raw[0]) : [];
  const faltando = COLUNAS_OBRIGATORIAS.filter(c => !colunasPresentes.includes(c));
  const erros: string[] = [];
  if (faltando.length > 0) {
    erros.push(`Colunas obrigatórias ausentes: ${faltando.join(', ')}`);
  }

  const linhas: ExcelLinhaNormalizada[] = [];
  let linhasValidas = 0;
  let linhasComErro = 0;

  raw.forEach((r, idx) => {
    try {
      const dataPagamento = parseDataBR(r.Data_Ref);
      const dataCompetencia = parseDataBR(r.Data_Competencia);
      if (!dataCompetencia) {
        linhasComErro++;
        return;
      }
      const valorRaw = Number(r.Valor ?? 0);
      const valorCentavos = Math.round(Math.abs(valorRaw) * 100);

      // sinal
      let sinal: 'entrada' | 'saida' | 'desconhecido' = 'desconhecido';
      const tipo = (r.Tipo ?? '').toString().toLowerCase();
      if (tipo.includes('entrada') || tipo.startsWith('1-')) sinal = 'entrada';
      else if (tipo.includes('saída') || tipo.includes('saida') || tipo.startsWith('2-')) sinal = 'saida';

      // anoMes do filtro vs competência
      const competenciaForaDoMes = !!r.AnoMes
        && dataCompetencia.slice(0, 7) !== r.AnoMes;

      // float imprecisão (heurística)
      const valorStr = String(r.Valor ?? '');
      const impreciFloat = /\.\d{3,}(99|00)\d+$/.test(valorStr);

      linhas.push({
        loteId,
        loteNomeArquivo: file.name,
        indiceLinha: idx,
        dataPagamento,
        dataCompetencia,
        valorCentavos,
        sinal,
        contaTexto: (r.Conta ?? '').toString().trim(),
        fazendaTexto: (r.Fazenda ?? '').toString().trim(),
        fornecedor: (r.Fornecedor ?? '').toString().trim(),
        subcentro: (r.Subcentro ?? '').toString().trim(),
        produto: (r.Produto ?? '').toString().trim(),
        documento: r.Documento != null ? String(r.Documento) : '',
        observacao: (r.Obs ?? '').toString().trim(),
        flags: {
          semDataRef: dataPagamento === null,
          competenciaForaDoMes,
          tipoInconsistente: false,  // detectado depois com contexto do arquivo (pagar/receber)
          contaInvalida: (r.Conta ?? '').toString().trim() === '-',
          impreciFloat,
        },
        raw: r,
      });
      linhasValidas++;
    } catch (e) {
      linhasComErro++;
      erros.push(`Linha ${idx + 2}: ${(e as Error).message}`);
    }
  });

  // detectar Tipo inconsistente: se nomeArquivo contém "receber" e tipo='saida' → flag
  // (heurística — não bloqueante)
  const nomeLower = file.name.toLowerCase();
  if (nomeLower.includes('receber')) {
    linhas.forEach(l => {
      if (l.sinal === 'saida') l.flags.tipoInconsistente = true;
    });
  } else if (nomeLower.includes('pagar')) {
    linhas.forEach(l => {
      if (l.sinal === 'entrada') l.flags.tipoInconsistente = true;
    });
  }

  return {
    loteId,
    nomeArquivo: file.name,
    tamanhoBytes: file.size,
    hashConteudo,
    parsedAt: new Date().toISOString(),
    totalLinhas: raw.length,
    linhasValidas,
    linhasComErro,
    erros,
    linhas,
  };
}

function parseDataBR(s: string | null | undefined): string | null {
  if (!s) return null;
  // formatos esperados: 'dd/MM/yyyy' ou 'YYYY-MM-DD'
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const d = parseDateFns(str.slice(0, 10), 'dd/MM/yyyy', new Date());
    if (isValidDate(d)) return fmtDate(d, 'yyyy-MM-dd');
  }
  // tentar Date number serial Excel (raro nesse formato, mas defensivo)
  return null;
}
