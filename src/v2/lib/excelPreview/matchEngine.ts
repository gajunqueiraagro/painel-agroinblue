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

// detalheScore "vazio" tipado — mesmo objeto que o return de "sem candidatos" já usa hoje.
// Fonte única do fallback: nunca usar cast pra produzir o shape vazio.
const DETALHE_SCORE_VAZIO: MatchResult['detalheScore'] = {
  valorBate: false,
  diasDistancia: null,
  pontosData: 0,
  pontosNome: 0,
  similaridadeNome: 0,
  pontosConta: 0,
  pontosFazenda: 0,
};

// detalhe interno por candidato — o shape que o scoring (scored.map) produz.
// Diferente de MatchResult['detalheScore']: aqui é `dias`/`sim`, lá é `diasDistancia`/`similaridadeNome`.
type DetalheCand = {
  dias: number | null;
  pontosData: number;
  sim: number;
  pontosNome: number;
  pontosConta: number;
  pontosFazenda: number;
};

// Mapeia o detalhe interno do candidato -> detalheScore do MatchResult.
// Fonte única do mapeamento (substitui a montagem inline + o cast).
function detalheScoreDe(detalhe: DetalheCand): MatchResult['detalheScore'] {
  return {
    valorBate: true,
    diasDistancia: detalhe.dias,
    pontosData: detalhe.pontosData,
    pontosNome: detalhe.pontosNome,
    similaridadeNome: detalhe.sim,
    pontosConta: detalhe.pontosConta,
    pontosFazenda: detalhe.pontosFazenda,
  };
}

type ScoredCand = { ofx: ExtratoMatcher; score: number; detalhe: DetalheCand };

// Filtro de valor + scoring + sort — miolo que vivia em matchExcelLinha.
// NÃO exportar: é a fonte única do scoring, compartilhada por matchExcelLinha e matchTodosLotes.
function scoredCandidatos(
  excel: ExcelLinhaNormalizada,
  ofxLista: ExtratoMatcher[],
): ScoredCand[] {
  const valorAlvo = excel.valorCentavos;
  const candidatos = ofxLista.filter(
    (e) => Math.round(Math.abs(Number(e.valor)) * 100) === valorAlvo,
  );

  const dataExcel = excel.dataPagamento ?? excel.dataCompetencia;

  const scored: ScoredCand[] = candidatos.map((c) => {
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
  return scored;
}

// Wrapper fino — comportamento idêntico ao matchExcelLinha original
// (mesmo melhor, mesma faixa, mesmo detalheScore, mesmo return vazio).
export function matchExcelLinha(
  excel: ExcelLinhaNormalizada,
  ofxLista: ExtratoMatcher[],
): MatchResult {
  const scored = scoredCandidatos(excel, ofxLista);

  if (scored.length === 0) {
    return {
      excelKey: excel.chaveLinha,
      ofxIdMatched: null,
      score: 0,
      faixa: 'nenhum',
      ofxIdCandidatos: [],
      detalheScore: DETALHE_SCORE_VAZIO,
    };
  }

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
    detalheScore: detalheScoreDe(melhor.detalhe),
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

  // 1. matriz de scores: candidatos por linha (já filtrados por valor + ordenados desc)
  const porLinha = linhasExcel.map((l) => scoredCandidatos(l, ofxLista));

  // 2. pares elegíveis (>= 60 = limiar de 'fraco'; abaixo disso não é match)
  type Par = { i: number; ofxId: string; score: number };
  const pares: Par[] = [];
  porLinha.forEach((cands, i) =>
    cands.forEach((c) => {
      if (c.score >= 60) pares.push({ i, ofxId: c.ofx.id, score: c.score });
    }),
  );

  // 3. ordenação determinística: score desc → ofxId (estável; documento/horário entram na 01b) → ordem da linha
  pares.sort(
    (a, b) =>
      b.score - a.score ||
      a.ofxId.localeCompare(b.ofxId) ||
      a.i - b.i,
  );

  // 4. greedy 1:1 com consumo — INVARIANTE: cada ofxId no máximo uma vez
  const ofxUsado = new Set<string>();
  const atribuido = new Map<number, string>();
  for (const p of pares) {
    if (atribuido.has(p.i) || ofxUsado.has(p.ofxId)) continue;
    atribuido.set(p.i, p.ofxId);
    ofxUsado.add(p.ofxId);
  }

  // 5. MatchResult por linha, com faixa TIE-AWARE (empate real nunca vira 'forte')
  linhasExcel.forEach((l, i) => {
    const cands = porLinha[i];
    const ofxId = atribuido.get(i) ?? null;

    // sem candidatos de mesmo valor → idêntico ao return vazio de matchExcelLinha
    if (cands.length === 0) {
      out.set(l.chaveLinha, {
        excelKey: l.chaveLinha,
        ofxIdMatched: null,
        score: 0,
        faixa: 'nenhum',
        ofxIdCandidatos: [],
        detalheScore: DETALHE_SCORE_VAZIO,
      });
      return;
    }

    // tinha candidatos mas não recebeu atribuição (perdeu a vaga 1:1 ou todos < 60)
    if (ofxId === null) {
      out.set(l.chaveLinha, {
        excelKey: l.chaveLinha,
        ofxIdMatched: null,
        score: cands[0].score,
        faixa: 'nenhum',
        ofxIdCandidatos: cands.slice(0, 5).map((x) => x.ofx.id),
        detalheScore: detalheScoreDe(cands[0].detalhe),
      });
      return;
    }

    // atribuído 1:1
    const cell = cands.find((c) => c.ofx.id === ofxId)!;
    const topScore = cands[0].score;
    // ambiguidade real: >= 2 OFX distintos empatados no topo de score desta linha
    const ambiguo = cands.filter((c) => c.score === topScore).length >= 2;

    let faixa: MatchResult['faixa'] =
      cell.score >= 80 ? 'forte' : cell.score >= 60 ? 'fraco' : 'nenhum';
    if (ambiguo && faixa === 'forte') faixa = 'fraco'; // TRAVA: não afirmar certeza no empate

    out.set(l.chaveLinha, {
      excelKey: l.chaveLinha,
      ofxIdMatched: faixa === 'nenhum' ? null : ofxId,
      score: cell.score,
      faixa,
      ofxIdCandidatos: cands.slice(0, 5).map((x) => x.ofx.id),
      detalheScore: detalheScoreDe(cell.detalhe),
    });
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
