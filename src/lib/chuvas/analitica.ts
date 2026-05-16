/**
 * chuvas/analitica.ts
 *
 * Helpers puros para análise pluviométrica. Operam sobre o array Chuva[]
 * carregado pelo useChuvas. Sem queries, sem efeitos, sem dependências.
 *
 * Convenção:
 *   - `data` é string ISO YYYY-MM-DD
 *   - `milimetros` é número >= 0
 *   - Em modo Global o hook traz registros de várias fazendas; filtrar por
 *     `fazendaId` mantém análise por estação (regra: pluviometria não soma).
 */
import type { Chuva } from '@/hooks/useChuvas';

export interface IntervaloSemChuva {
  inicio: string; // YYYY-MM-DD
  fim: string;    // YYYY-MM-DD (último dia sem chuva, inclusive)
  dias: number;
}

export interface MaiorChuvaDia {
  data: string | null;
  mm: number;
}

export interface ComparativoAnoAnt {
  totalAtual: number;
  totalAnoAnt: number;
  deltaMm: number;
  /** null quando totalAnoAnt = 0 (sem base para %). */
  deltaPct: number | null;
}

function filtrar(chuvas: Chuva[], ano: number, fazendaId?: string): Chuva[] {
  return chuvas.filter(c => {
    const y = parseInt(c.data.slice(0, 4), 10);
    if (y !== ano) return false;
    if (fazendaId && c.fazendaId !== fazendaId) return false;
    return true;
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDia(ano: number, mes1Based: number, dia: number): string {
  return `${ano}-${pad2(mes1Based)}-${pad2(dia)}`;
}

function diasNoAno(ano: number): number {
  return ((ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0) ? 366 : 365;
}

function fimDoMes(ano: number, mes1Based: number): number {
  // dia 0 do próximo mês = último dia do mês corrente
  return new Date(ano, mes1Based, 0).getDate();
}

/** Soma de mm de um ano (e opcionalmente uma fazenda). */
export function totalAno(chuvas: Chuva[], ano: number, fazendaId?: string): number {
  return filtrar(chuvas, ano, fazendaId).reduce((s, c) => s + c.milimetros, 0);
}

/** Soma de mm de um mês específico de um ano (e opcionalmente uma fazenda). */
export function totalMes(chuvas: Chuva[], ano: number, mes1Based: number, fazendaId?: string): number {
  return filtrar(chuvas, ano, fazendaId)
    .filter(c => parseInt(c.data.slice(5, 7), 10) === mes1Based)
    .reduce((s, c) => s + c.milimetros, 0);
}

/** Quantidade de dias distintos com mm > 0 no ano. */
export function diasComChuva(chuvas: Chuva[], ano: number, fazendaId?: string): number {
  const dias = new Set<string>();
  for (const c of filtrar(chuvas, ano, fazendaId)) {
    if (c.milimetros > 0) dias.add(c.data);
  }
  return dias.size;
}

/**
 * Dia com maior chuva no ano (somando registros do mesmo dia se houver
 * múltiplos — mas com fazendaId definido isso normalmente não acontece).
 */
export function maiorChuvaDia(chuvas: Chuva[], ano: number, fazendaId?: string): MaiorChuvaDia {
  const map = new Map<string, number>();
  for (const c of filtrar(chuvas, ano, fazendaId)) {
    map.set(c.data, (map.get(c.data) ?? 0) + c.milimetros);
  }
  let max = 0;
  let data: string | null = null;
  for (const [d, mm] of map) {
    if (mm > max) { max = mm; data = d; }
  }
  return { data, mm: max };
}

/**
 * Maior sequência de dias sem chuva no ano.
 *
 * Varre os 365/366 dias do ano em ordem. Considera "sem chuva" qualquer dia
 * que NÃO tem registro com mm > 0. Retorna o gap mais longo ou null se nunca
 * houve chuva (= ano inteiro seco; aí o "maior gap" é o próprio ano, mas
 * tecnicamente não há referência — retornamos null para evitar conclusão errada).
 *
 * fimDoAno (31/Dez) fecha um gap em andamento se o ano terminar sem chuva.
 */
export function maiorIntervaloSemChuva(chuvas: Chuva[], ano: number, fazendaId?: string): IntervaloSemChuva | null {
  const diasComMm = new Set<string>();
  for (const c of filtrar(chuvas, ano, fazendaId)) {
    if (c.milimetros > 0) diasComMm.add(c.data);
  }
  if (diasComMm.size === 0) return null; // sem referência de chuva — não retornar gap fake

  const total = diasNoAno(ano);
  let melhor: IntervaloSemChuva | null = null;
  let inicioGap: string | null = null;
  let diasGap = 0;

  // Iterar mês a mês para não tropeçar em timezone do Date.
  let diaCorrente = 0; // 0..total-1
  for (let mes = 1; mes <= 12; mes++) {
    const ultimo = fimDoMes(ano, mes);
    for (let dia = 1; dia <= ultimo; dia++) {
      diaCorrente++;
      const dStr = isoDia(ano, mes, dia);
      if (diasComMm.has(dStr)) {
        // fim de gap (se em andamento)
        if (inicioGap && diasGap > (melhor?.dias ?? 0)) {
          // último dia sem chuva = dia anterior
          const idxAnterior = diaCorrente - 1; // 1..total
          const dataFim = isoDiaPorIndice(ano, idxAnterior);
          melhor = { inicio: inicioGap, fim: dataFim, dias: diasGap };
        }
        inicioGap = null;
        diasGap = 0;
      } else {
        if (!inicioGap) inicioGap = dStr;
        diasGap++;
      }
    }
  }
  // Gap aberto no fim do ano
  if (inicioGap && diasGap > (melhor?.dias ?? 0)) {
    melhor = {
      inicio: inicioGap,
      fim: isoDia(ano, 12, 31),
      dias: diasGap,
    };
  }
  return melhor;
}

/** Converte índice 1-based do ano (1..365/366) para ISO YYYY-MM-DD. */
function isoDiaPorIndice(ano: number, idx1Based: number): string {
  let acum = 0;
  for (let m = 1; m <= 12; m++) {
    const ult = fimDoMes(ano, m);
    if (idx1Based <= acum + ult) {
      const dia = idx1Based - acum;
      return isoDia(ano, m, dia);
    }
    acum += ult;
  }
  return isoDia(ano, 12, 31); // fallback (não deve acontecer)
}

/** Comparativo absoluto/percentual de chuva acumulada vs ano anterior. */
export function comparativoAnoAnt(chuvas: Chuva[], ano: number, fazendaId?: string): ComparativoAnoAnt {
  const totalAtual = totalAno(chuvas, ano, fazendaId);
  const totalAnoAnt = totalAno(chuvas, ano - 1, fazendaId);
  const deltaMm = totalAtual - totalAnoAnt;
  const deltaPct = totalAnoAnt > 0 ? (deltaMm / totalAnoAnt) * 100 : null;
  return { totalAtual, totalAnoAnt, deltaMm, deltaPct };
}
