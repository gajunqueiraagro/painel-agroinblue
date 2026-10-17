/**
 * FIN-FINANC-28 · P3-GRAFICO — O QUE FALTA PAGAR, mês a mês (compras parceladas) e ano a ano (financiamentos). Dono PURO, em
 * centavos inteiros, sobre a MESMA leitura que alimenta a lista e os cards: o lote (`fn_financiamentos_situacao_lote`), contrato a
 * contrato. Nenhuma consulta nova e nenhuma regra nova.
 *
 * ⚠ PARCELA EM ABERTO = A REGRA DO CARD "A PAGAR" (P3-FIX3): parcela que o banco não julgou 'paga', pelo que falta dela
 *   (`valorTotal − valorPago`, nunca negativo). É, parcela a parcela, o que os cartões `a_vencer` + `vencido` do dono somam —
 *   por isso a soma das colunas é o card, ao centavo.
 * ⚠ VENCIDA = vencimento antes de HOJE (a data local da tela), a mesma régua do cartão `vencido` (`data_vencimento < p_hoje`).
 *   Parcela sem vencimento não é vencida (o cartão a conta em "a vencer") e cai na coluna "s/ data".
 * ⚠ PRINCIPAL × JUROS NA PARCELA PARCIAL: o lote não diz qual lançamento da parcela foi pago, só quanto. O que falta é repartido
 *   na proporção principal / juros da parcela, e os juros são o RESTO (total − principal), para a soma fechar ao centavo. Medido em
 *   16/10: 0 parcelas 'parcial' com juros no proto.
 */
import type { SituacaoDoContrato } from './situacaoDoContrato';

const cent = (v: number) => Math.round(v * 100);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface ColunaDoCronograma {
  /** 'vencidas' | 'sem_data' | 'AAAA-MM' (mensal) | 'AAAA' (anual) */
  chave: string;
  tipo: 'vencidas' | 'sem_data' | 'periodo';
  /** o que falta pagar nesta coluna, em centavos */
  totalCent: number;
  principalCent: number;
  jurosCent: number;
  /** o que resta depois desta coluna (soma das colunas seguintes), em centavos */
  depoisCent: number;
}

export interface Cronograma {
  colunas: ColunaDoCronograma[];
  totalCent: number;
  vencidasCent: number;
  principalCent: number;
  jurosCent: number;
  /** a última coluna com valor ('AAAA-MM' ou 'AAAA'); nula sem nada em aberto */
  ultima: string | null;
}

interface Aberto { venc: string | null; totalCent: number; principalCent: number; jurosCent: number }

/** As parcelas em aberto de um conjunto de contratos — a regra do card "A pagar". */
export function parcelasEmAberto(situacoes: readonly (SituacaoDoContrato | null | undefined)[]): Aberto[] {
  const out: Aberto[] = [];
  for (const s of situacoes) {
    if (!s) continue;
    for (const p of s.parcelas) {
      if (p.situacao === 'paga') continue;
      const vt = cent(p.valorTotal);
      const falta = Math.max(vt - cent(p.valorPago), 0);
      if (falta === 0) continue;
      const vp = cent(p.valorPrincipal);
      const principal = vt > 0 ? Math.round((falta * vp) / vt) : falta;
      out.push({ venc: p.dataVencimento, totalCent: falta, principalCent: principal, jurosCent: falta - principal });
    }
  }
  return out;
}

const mesSeguinte = (am: string) => {
  const [a, m] = am.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};

function montar(abertos: readonly Aberto[], hoje: string, chaveDe: (venc: string) => string, primeira: string, proxima: (k: string) => string): Cronograma {
  const venc: ColunaDoCronograma = { chave: 'vencidas', tipo: 'vencidas', totalCent: 0, principalCent: 0, jurosCent: 0, depoisCent: 0 };
  const semData: ColunaDoCronograma = { chave: 'sem_data', tipo: 'sem_data', totalCent: 0, principalCent: 0, jurosCent: 0, depoisCent: 0 };
  const porChave = new Map<string, ColunaDoCronograma>();
  let ultima: string | null = null;
  for (const a of abertos) {
    let alvo: ColunaDoCronograma;
    if (!a.venc) alvo = semData;
    else if (a.venc < hoje) alvo = venc;
    else {
      const k = chaveDe(a.venc);
      if (!porChave.has(k)) porChave.set(k, { chave: k, tipo: 'periodo', totalCent: 0, principalCent: 0, jurosCent: 0, depoisCent: 0 });
      alvo = porChave.get(k)!;
      if (!ultima || k > ultima) ultima = k;
    }
    alvo.totalCent += a.totalCent; alvo.principalCent += a.principalCent; alvo.jurosCent += a.jurosCent;
  }
  const colunas: ColunaDoCronograma[] = [];
  if (venc.totalCent > 0) colunas.push(venc);
  if (ultima) {
    /* uma coluna por período, do atual até o último com valor — inclusive os vazios (o tempo não pula) */
    for (let k = primeira; k <= ultima; k = proxima(k)) {
      colunas.push(porChave.get(k) ?? { chave: k, tipo: 'periodo', totalCent: 0, principalCent: 0, jurosCent: 0, depoisCent: 0 });
    }
  }
  if (semData.totalCent > 0) colunas.push(semData);
  let total = 0; let principal = 0; let juros = 0;
  for (const c of colunas) { total += c.totalCent; principal += c.principalCent; juros += c.jurosCent; }
  let resta = total;
  for (const c of colunas) { resta -= c.totalCent; c.depoisCent = resta; }
  return { colunas, totalCent: total, vencidasCent: venc.totalCent, principalCent: principal, jurosCent: juros, ultima };
}

/** Mês a mês: a coluna "venc." e uma por mês, do mês de HOJE até a última parcela. */
export function cronogramaMensal(situacoes: readonly (SituacaoDoContrato | null | undefined)[], hoje: string): Cronograma {
  return montar(parcelasEmAberto(situacoes), hoje, (v) => v.slice(0, 7), hoje.slice(0, 7), mesSeguinte);
}

/** Ano a ano: a coluna "venc." e uma por ano, do ano de HOJE até o do último vencimento. */
export function cronogramaAnual(situacoes: readonly (SituacaoDoContrato | null | undefined)[], hoje: string): Cronograma {
  return montar(parcelasEmAberto(situacoes), hoje, (v) => v.slice(0, 4), hoje.slice(0, 4), (k) => String(Number(k) + 1));
}

/** "Ainda a pagar em jan/AA": o que vence a partir de 1º de janeiro do ano seguinte a HOJE (as vencidas não entram). */
export function aindaAPagarEmJaneiro(c: Cronograma, hoje: string): { rotulo: string; cent: number } {
  const ano = Number(hoje.slice(0, 4)) + 1;
  const desde = `${ano}-01`;
  let soma = 0;
  for (const col of c.colunas) if (col.tipo === 'periodo' && col.chave >= desde) soma += col.totalCent;
  return { rotulo: `jan/${String(ano).slice(2)}`, cent: soma };
}

/** "out/26" a partir de 'AAAA-MM'; o ano inteiro a partir de 'AAAA'. */
export function rotuloDoPeriodo(chave: string): string {
  if (chave.length === 7) return `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
  return chave;
}
export const mesAbreviado = (chave: string) => MESES[Number(chave.slice(5, 7)) - 1];

/** O número em cima da barra: milhares ("172k"); abaixo de mil, o valor inteiro; milhões com uma casa ("3,5 mi"). */
export function rotuloCompacto(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

/** R$ com milhar e 2 casas. */
export const reais = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
