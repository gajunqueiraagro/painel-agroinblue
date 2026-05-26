/**
 * loteToClassificacao — adapter trivial entre o parser PR-M2
 * (parseExcelToLote → LoteExcel) e o shape esperado pela RPC
 * fn_classificacao_populate_staging do PR-M.
 *
 * Sem heurística, sem mutação. Apenas projeção campo-a-campo
 * preservando `raw.Conta`/`raw.Conta_Destino` (que o parser não
 * normaliza — vai bruto pro Excel como o operador escreveu) e
 * normalizando `Tipo` singular ('3-Transferência') → plural
 * ('3-Transferências').
 *
 * Sem dependência de React, supabase ou qualquer side effect.
 */
import type { LoteExcel } from './types';

export interface ClassificacaoRow {
  linha: number;
  subcentro: string | null;
  fornecedor: string | null;
  produto: string | null;
  conta_origem: string | null;
  conta_destino: string | null;
  ano_mes: string | null;
  data: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  fazenda_codigo: string | null;
}

function trimOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeTipo(v: string | null): string | null {
  if (!v) return null;
  // PR-M: parser preserva o Tipo bruto do Excel — pode vir singular.
  if (v === '3-Transferência') return '3-Transferências';
  return v;
}

export function loteExcelToClassificacaoRows(lote: LoteExcel): ClassificacaoRow[] {
  return lote.linhas.map((l) => ({
    // indiceLinha é 0-based; +2 = primeira linha de dados no XLSX (1-based, header é linha 1)
    linha: l.indiceLinha + 2,
    subcentro: trimOrNull(l.subcentro),
    fornecedor: trimOrNull(l.fornecedor),
    produto: trimOrNull(l.produto),
    // Conta/Conta_Destino vêm do raw — o parser preserva bruto.
    conta_origem: trimOrNull(l.raw.Conta),
    conta_destino: trimOrNull(l.raw.Conta_Destino),
    // ano_mes do Excel quando preenchido, senão derivado da data canônica.
    ano_mes: trimOrNull(l.raw.AnoMes) ?? (l.dataPagamento ? l.dataPagamento.slice(0, 7) : null),
    data: l.dataPagamento,
    // valorCentavos é SEMPRE positivo (sinal vive em campo separado).
    valor: l.valorCentavos / 100,
    tipo_operacao: normalizeTipo(trimOrNull(l.raw.Tipo)),
    fazenda_codigo: trimOrNull(l.fazendaTexto),
  }));
}
