import type { ExcelLinhaNormalizada, MatchResult } from './types';

/**
 * Match Excel × OFX (totalmente em memória) — versão PR3.1.
 *
 * Mudanças vs PR2:
 *   - Pesos data: +30/+20/+10 (era +20/+12/+6)
 *   - Novo: bônus +10 / penalidade -30 por sinal coerente/incoerente
 *   - Faixas: ≥80 forte, 60-79 fraco, <60 nenhum (era ≥75/40-74/<40)
 *   - top 5 candidatos (era top 3) — alimenta "Outro OFX" no PR3.1
 */

export interface ExtratoMatcher {
  id: string;
  data_movimento: string;     // 'YYYY-MM-DD'
  valor: number;              // POSITIVO entrada / NEGATIVO saída — sinal importa
  descricao: string;
}

export function matchExcelLinha(
  excel: ExcelLinhaNormalizada,
  ofxLista: ExtratoMatcher[],
): MatchResult {
  const valorAlvo = excel.valorCentavos;
  const candidatos = ofxLista.filter(
    (e) => Math.round(Math.abs(Number(e.valor)) * 100) === valorAlvo,
  );

  if (candidatos.length === 0) {
    return {
      excelKey: excel.chaveLinha,
      ofxIdMatched: null,
      score: 0,
      faixa: 'nenhum',
      ofxIdCandidatos: [],
      detalheScore: {
        valorBate: false,
        diasDistancia: null,
        pontosData: 0,
        pontosNome: 0,
        similaridadeNome: 0,
        pontosConta: 0,
        pontosFazenda: 0,
      },
    };
  }

  const dataExcel = excel.dataPagamento ?? excel.dataCompetencia;

  const scored = candidatos.map((c) => {
    const dias = dataExcel ? diffDias(dataExcel, c.data_movimento) : null;

    // PR3.1: pesos de data aumentados — data exata + valor exato é evidência fortíssima
    const pontosData =
      dias === null ? 0 :
      Math.abs(dias) === 0 ? 30 :
      Math.abs(dias) <= 1 ? 20 :
      Math.abs(dias) <= 3 ? 10 :
      0;

    const sim = similaridadeNome(excel.fornecedor, c.descricao);
    const pontosNome = sim >= 0.7 ? 15 : 0;

    // PR3.1: verificação de sinal Excel ↔ OFX
    // Excel entrada (sinal='entrada') deve casar com OFX positivo (valor > 0).
    // Excel saída (sinal='saida') deve casar com OFX negativo (valor < 0).
    // Sinal desconhecido = neutro (sem bônus, sem penalidade).
    const ofxValor = Number(c.valor);
    const sinalCoerente =
      (excel.sinal === 'entrada' && ofxValor > 0) ||
      (excel.sinal === 'saida' && ofxValor < 0);
    const sinalIncoerente =
      (excel.sinal === 'entrada' && ofxValor < 0) ||
      (excel.sinal === 'saida' && ofxValor > 0);
    const pontosSinal = sinalCoerente ? 10 : sinalIncoerente ? -30 : 0;

    const pontosConta = 0;     // mantido — PR5 dicionário
    const pontosFazenda = 0;

    const score = Math.max(0, Math.min(100,
      50 + pontosData + pontosNome + pontosSinal + pontosConta + pontosFazenda,
    ));

    return {
      ofx: c,
      score,
      detalhe: { dias, pontosData, sim, pontosNome, pontosConta, pontosFazenda },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const melhor = scored[0];

  // PR3.1: novas faixas
  const faixa: MatchResult['faixa'] =
    melhor.score >= 80 ? 'forte' :
    melhor.score >= 60 ? 'fraco' :
    'nenhum';

  return {
    excelKey: excel.chaveLinha,
    ofxIdMatched: faixa === 'nenhum' ? null : melhor.ofx.id,
    score: melhor.score,
    faixa,
    ofxIdCandidatos: scored.slice(0, 5).map((x) => x.ofx.id),  // top 5 — pro "Outro OFX"
    detalheScore: {
      valorBate: true,
      diasDistancia: melhor.detalhe.dias,
      pontosData: melhor.detalhe.pontosData,
      pontosNome: melhor.detalhe.pontosNome,
      similaridadeNome: melhor.detalhe.sim,
      pontosConta: melhor.detalhe.pontosConta,
      pontosFazenda: melhor.detalhe.pontosFazenda,
    },
  };
}

/**
 * Bate todas as linhas de todos os lotes Excel contra a lista OFX do mês visualizado.
 * Retorna Map<excelKey, MatchResult> pra lookup O(1) na UI.
 */
export function matchTodosLotes(
  linhasExcel: ExcelLinhaNormalizada[],
  ofxLista: ExtratoMatcher[],
): Map<string, MatchResult> {
  const out = new Map<string, MatchResult>();
  linhasExcel.forEach((l) => {
    out.set(l.chaveLinha, matchExcelLinha(l, ofxLista));
  });
  return out;
}

function diffDias(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00').getTime();
  const db = new Date(b + 'T12:00:00').getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

/**
 * Similaridade barata sem libs externas.
 * Estratégia: normaliza (lowercase, remove acentos, remove pontuação),
 * compara tokens (set intersection / union), Jaccard simples.
 * Retorna 0..1.
 */
function similaridadeNome(a: string, b: string): number {
  const norm = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set<string>(na.split(' ').filter((t) => t.length >= 3));
  const tb = new Set<string>(nb.split(' ').filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = new Set<string>([...ta].filter((x) => tb.has(x)));
  const union = new Set<string>([...ta, ...tb]);
  return inter.size / union.size;
}
