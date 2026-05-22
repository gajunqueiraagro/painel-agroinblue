import type { ExcelLinhaNormalizada, MatchResult } from './types';

/**
 * Match Excel × OFX (totalmente em memória).
 *
 * Pesos (gate obrigatório: valor exato em centavos):
 *   valor exato (centavos)   = OBRIGATÓRIO (sem isso, score=0, faixa=nenhum)
 *   mesma data               = +20
 *   ±1 dia                   = +12
 *   ±3 dias                  = +6
 *   similaridade fornecedor >0.7  = +15
 *   mesma conta (texto OFX descrição contém Conta Excel) = +10 (PR5 fará dicionário)
 *   mesma fazenda                 = +3 (limitado nesse PR — sem de-para)
 *
 * Faixas:
 *   >= 75 → forte (azul)
 *   40-74 → fraco (amarelo)
 *   < 40  → nenhum (cinza)
 */

export interface ExtratoMatcher {
  id: string;
  data_movimento: string;     // 'YYYY-MM-DD'
  valor: number;              // positivo entrada / negativo saída
  descricao: string;
}

export function matchExcelLinha(
  excel: ExcelLinhaNormalizada,
  ofxLista: ExtratoMatcher[],
): MatchResult {
  const valorAlvo = excel.valorCentavos;
  // filtra candidatos com valor exato (em centavos absolutos)
  const candidatos = ofxLista.filter(
    e => Math.round(Math.abs(Number(e.valor)) * 100) === valorAlvo,
  );

  if (candidatos.length === 0) {
    return {
      excelKey: `${excel.loteId}:${excel.indiceLinha}`,
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

  // para cada candidato, calcular score completo
  const dataExcel = excel.dataPagamento ?? excel.dataCompetencia;
  const scored = candidatos.map(c => {
    const dias = dataExcel ? diffDias(dataExcel, c.data_movimento) : null;
    const pontosData =
      dias === null ? 0 :
      Math.abs(dias) === 0 ? 20 :
      Math.abs(dias) <= 1 ? 12 :
      Math.abs(dias) <= 3 ? 6 :
      0;

    const sim = similaridadeNome(excel.fornecedor, c.descricao);
    const pontosNome = sim >= 0.7 ? 15 : 0;

    // conta: o OFX não tem campo "conta" estruturado bom; PR2 pula este sinal
    // (PR5 vai fazer dicionário de conta texto → conta_bancaria_id)
    const pontosConta = 0;
    const pontosFazenda = 0;  // idem

    const score = 50  // gate de valor já vale base
      + pontosData
      + pontosNome
      + pontosConta
      + pontosFazenda;

    return {
      ofx: c,
      score: Math.min(score, 100),
      detalhe: { dias, pontosData, sim, pontosNome, pontosConta, pontosFazenda },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const melhor = scored[0];

  const faixa: MatchResult['faixa'] =
    melhor.score >= 75 ? 'forte' :
    melhor.score >= 40 ? 'fraco' :
    'nenhum';

  return {
    excelKey: `${excel.loteId}:${excel.indiceLinha}`,
    ofxIdMatched: faixa === 'nenhum' ? null : melhor.ofx.id,
    score: melhor.score,
    faixa,
    ofxIdCandidatos: scored.slice(0, 3).map(x => x.ofx.id),
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
  linhasExcel.forEach(l => {
    out.set(`${l.loteId}:${l.indiceLinha}`, matchExcelLinha(l, ofxLista));
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
  const ta = new Set(na.split(' ').filter(t => t.length >= 3));
  const tb = new Set(nb.split(' ').filter(t => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = new Set([...ta].filter(x => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return inter.size / union.size;
}
