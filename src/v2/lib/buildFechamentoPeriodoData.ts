/**
 * buildFechamentoPeriodoData.ts — Builder puro do DTO de Fechamento do Período.
 *
 * Marco 2.2. Função pura, sem hooks, sem Supabase, sem async, sem side-effects.
 * Recebe dados já fetchados e retorna FechamentoPeriodoDTO único para a tela.
 *
 * Regras-chave:
 *   - Dados de input já vêm filtrados pelos hooks (status_transacao, cenario,
 *     cancelado, sem_movimentacao_caixa). NÃO refiltrar aqui.
 *   - FinanceiroLancamento campos usados: valor, ano_mes, tipo_operacao,
 *     macro_custo, grupo_custo, centro_custo, subcentro, cancelado.
 *   - MetaGridRow NÃO tem tipo_operacao — entradas/saídas via MACROS_ENTRADA / MACROS_SAIDA.
 *   - MetaGridRow.meses[idx] onde idx = 0..11 (Jan..Dez).
 *   - desembolsoPecuaria = custeioPecuaria + jurosFinanciamentoPec (juros FORA do custeio).
 *   - RebanhoMensal é agregado mensal — saldos por categoria ficam null.
 */

import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import {
  MACROS_ENTRADA,
  MACROS_SAIDA,
  type BuildFechamentoPeriodoInput,
  type Comparativo,
  type FechamentoPeriodoDTO,
  type MacroNode,
  type MetaGridRow,
  type RebanhoMensal,
  type SerieMensal,
  type SubcentroNode,
  type CentroNode,
  type GrupoNode,
  type IndicadorPecuaria,
  type MovCategoriaLinha,
} from '@/v2/types/fechamentoPeriodo';

// ─────────────────────────────────────────────────────────────
// HELPERS BÁSICOS
// ─────────────────────────────────────────────────────────────

/** Gera ["2026-01", "2026-02", ...] entre inicio e fim inclusive (formato "YYYY-MM"). */
function getMeses(inicio: string, fim: string): string[] {
  const [yi, mi] = inicio.split('-').map(Number);
  const [yf, mf] = fim.split('-').map(Number);
  const result: string[] = [];
  let y = yi;
  let m = mi;
  while (y < yf || (y === yf && m <= mf)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
}

/** Desloca cada "YYYY-MM" um ano para trás. */
function getMesesAnoAnterior(meses: string[]): string[] {
  return meses.map(m => {
    const [y, mm] = m.split('-');
    return `${Number(y) - 1}-${mm}`;
  });
}

/** Extrai índice 0-11 de "2026-03" → 2. */
function mesIdxDe(ano_mes: string): number {
  return parseInt(ano_mes.split('-')[1], 10) - 1;
}

/** Monta Comparativo com todos os desvios. */
function mkComp(r: number | null, m: number | null, a: number | null): Comparativo {
  const desvioMeta = r != null && m != null ? r - m : null;
  const desvioMetaPct = desvioMeta != null && m != null && m !== 0
    ? (desvioMeta / Math.abs(m)) * 100
    : null;
  const desvioAnoAnt = r != null && a != null ? r - a : null;
  const desvioAnoAntPct = desvioAnoAnt != null && a != null && a !== 0
    ? (desvioAnoAnt / Math.abs(a)) * 100
    : null;
  return {
    realizado: r,
    meta: m,
    anoAnterior: a,
    desvioMeta,
    desvioMetaPct,
    desvioAnoAnt,
    desvioAnoAntPct,
  };
}

/** Soma a + b mesmo se algum for null (null + x = x; null + null = null). */
function nullableSum(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Subtração que respeita null em ambos os lados. */
function nullableSub(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) - (b ?? 0);
}

/**
 * Soma N valores nullable. Retorna null somente se TODOS forem null;
 * caso contrário, soma os não-null (tratando null como 0).
 */
function somaCompNullable(...vals: (number | null)[]): number | null {
  const validos = vals.filter((v): v is number => v != null);
  if (validos.length === 0) return null;
  return validos.reduce((a, b) => a + b, 0);
}

/** Divisão que retorna null se denominador inválido (null, 0, NaN). */
function safeDiv(num: number | null, den: number | null): number | null {
  if (num == null || den == null) return null;
  if (den === 0 || !Number.isFinite(den)) return null;
  return num / den;
}

// ─────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO META (entrada/saída via macro_custo)
// ─────────────────────────────────────────────────────────────

const isMetaEntrada = (row: MetaGridRow) =>
  row.macro_custo != null && (MACROS_ENTRADA as readonly string[]).includes(row.macro_custo);

const isMetaSaida = (row: MetaGridRow) =>
  row.macro_custo != null && (MACROS_SAIDA as readonly string[]).includes(row.macro_custo);

// ─────────────────────────────────────────────────────────────
// SOMAS FINANCEIRO + META
// ─────────────────────────────────────────────────────────────

/**
 * Soma valor de lançamentos financeiros num conjunto de meses,
 * aplicando filtro custom. Retorna null se NENHUM item matchar.
 */
function somaLanc(
  lancs: FinanceiroLancamento[],
  meses: string[],
  filtro: (l: FinanceiroLancamento) => boolean,
): number | null {
  const set = new Set(meses);
  let total = 0;
  let matched = false;
  for (const l of lancs) {
    if (!set.has(l.ano_mes)) continue;
    if (!filtro(l)) continue;
    total += Number(l.valor) || 0;
    matched = true;
  }
  return matched ? total : null;
}

/**
 * Soma META a partir de MetaGridRow[] para um conjunto de meses do período.
 * Retorna null se nenhum row+mês combinado tiver valor válido.
 */
function somaMeta(
  grid: MetaGridRow[],
  mesesPeriodo: string[],
  filtro: (row: MetaGridRow) => boolean,
): number | null {
  let total = 0;
  let matched = false;
  for (const row of grid) {
    if (!filtro(row)) continue;
    for (const m of mesesPeriodo) {
      const idx = mesIdxDe(m);
      const v = row.meses[idx];
      if (v != null && Number.isFinite(v)) {
        total += v;
        matched = true;
      }
    }
  }
  return matched ? total : null;
}

/** Série mensal para um indicador financeiro: realizado + meta + ano anterior. */
function serieLanc(
  meses: string[],
  realizados: FinanceiroLancamento[],
  mesesAnoAnt: string[],
  anoAnteriores: FinanceiroLancamento[],
  grid: MetaGridRow[],
  filtroLanc: (l: FinanceiroLancamento) => boolean,
  filtroMeta: (row: MetaGridRow) => boolean,
): SerieMensal[] {
  return meses.map((m, i) => {
    const mAnt = mesesAnoAnt[i];
    return {
      ano_mes: m,
      realizado: somaLanc(realizados, [m], filtroLanc),
      meta: somaMeta(grid, [m], filtroMeta),
      anoAnterior: somaLanc(anoAnteriores, [mAnt], filtroLanc),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// FILTROS DE NEGÓCIO
// ─────────────────────────────────────────────────────────────

const isCustoFixoPec = (l: FinanceiroLancamento) => l.grupo_custo === 'Custo Fixo Pecuária';
const isCustoVarPec  = (l: FinanceiroLancamento) => l.grupo_custo === 'Custo Variável Pecuária';
const isJurosPec     = (l: FinanceiroLancamento) => l.grupo_custo === 'Juros de Financiamento Pecuária';
const isCusteioPec   = (l: FinanceiroLancamento) => isCustoFixoPec(l) || isCustoVarPec(l);
const isReceitaPec   = (l: FinanceiroLancamento) =>
  l.grupo_custo === 'Receita Pecuária' && l.tipo_operacao === '1-Entradas';

const isMetaCustoFixoPec = (r: MetaGridRow) => r.grupo_custo === 'Custo Fixo Pecuária';
const isMetaCustoVarPec  = (r: MetaGridRow) => r.grupo_custo === 'Custo Variável Pecuária';
const isMetaJurosPec     = (r: MetaGridRow) => r.grupo_custo === 'Juros de Financiamento Pecuária';
const isMetaCusteioPec   = (r: MetaGridRow) => isMetaCustoFixoPec(r) || isMetaCustoVarPec(r);
const isMetaReceitaPec   = (r: MetaGridRow) => r.grupo_custo === 'Receita Pecuária';

// Investimento na Fazenda Pecuária — separado do custeio.
const isInvFazendaPec = (l: FinanceiroLancamento) =>
  l.tipo_operacao === '2-Saídas'
  && l.macro_custo === 'Investimento na Fazenda'
  && l.escopo_negocio === 'pecuaria';

const isMetaInvFazendaPec = (r: MetaGridRow) =>
  r.macro_custo === 'Investimento na Fazenda'
  && r.escopo_negocio === 'pecuaria';

// ─────────────────────────────────────────────────────────────
// REBANHO HELPERS
// ─────────────────────────────────────────────────────────────

/** Agrega RebanhoMensal de múltiplas fazendas para um mês: soma cabecas/ua/area, média ponderada de pesoMedioKg. */
function agregaRebanhoMes(rows: RebanhoMensal[], ano_mes: string): {
  cabecas: number | null;
  ua: number | null;
  pesoMedioKg: number | null;
  areaProdutivaPec: number | null;
  producaoBiologicaKg: number | null;
} | null {
  const filtered = rows.filter(r => r.ano_mes === ano_mes);
  if (filtered.length === 0) return null;

  let cabecas = 0;
  let cabecasMatched = false;
  let ua = 0;
  let uaMatched = false;
  let area = 0;
  let areaMatched = false;
  let prodBio = 0;
  let prodBioMatched = false;
  // Peso médio: média ponderada por cabecas
  let pesoSumCab = 0;
  let pesoSumCabXPeso = 0;

  for (const r of filtered) {
    if (r.cabecas != null && Number.isFinite(r.cabecas)) {
      cabecas += r.cabecas; cabecasMatched = true;
      if (r.pesoMedioKg != null && Number.isFinite(r.pesoMedioKg)) {
        pesoSumCab += r.cabecas;
        pesoSumCabXPeso += r.cabecas * r.pesoMedioKg;
      }
    }
    if (r.ua != null && Number.isFinite(r.ua)) { ua += r.ua; uaMatched = true; }
    if (r.areaProdutivaPec != null && Number.isFinite(r.areaProdutivaPec)) {
      area += r.areaProdutivaPec; areaMatched = true;
    }
    if (r.producaoBiologicaKg != null && Number.isFinite(r.producaoBiologicaKg)) {
      prodBio += r.producaoBiologicaKg; prodBioMatched = true;
    }
  }

  return {
    cabecas: cabecasMatched ? cabecas : null,
    ua: uaMatched ? ua : null,
    pesoMedioKg: pesoSumCab > 0 ? pesoSumCabXPeso / pesoSumCab : null,
    areaProdutivaPec: areaMatched ? area : null,
    producaoBiologicaKg: prodBioMatched ? prodBio : null,
  };
}

/** Soma producaoBiologicaKg em todos os meses do período / 30 = @ produzidas. */
function arrobasProduzidasPeriodo(rows: RebanhoMensal[], meses: string[]): number | null {
  const set = new Set(meses);
  let totalKg = 0;
  let matched = false;
  for (const r of rows) {
    if (!set.has(r.ano_mes)) continue;
    if (r.producaoBiologicaKg != null && Number.isFinite(r.producaoBiologicaKg)) {
      totalKg += r.producaoBiologicaKg; matched = true;
    }
  }
  return matched ? totalKg / 30 : null;
}

/** Soma arrobas dos lancamentosZoot (tipo in abate/venda) num conjunto de meses. */
function arrobasDesfrutadasPeriodo(
  lancs: BuildFechamentoPeriodoInput['lancamentosZoot'],
  meses: string[],
): number | null {
  const set = new Set(meses);
  let total = 0;
  let matched = false;
  for (const l of lancs) {
    if (l.tipo !== 'abate' && l.tipo !== 'venda') continue;
    const ym = l.data ? l.data.substring(0, 7) : '';
    if (!set.has(ym)) continue;
    const arr = (l.quantidade ?? 0) * (l.pesoMedioArrobas ?? 0);
    if (Number.isFinite(arr)) { total += arr; matched = true; }
  }
  return matched ? total : null;
}

/** Média simples de cabecas mensais no período (agregando fazendas no mês). */
function cabecasMediasPeriodo(rows: RebanhoMensal[], meses: string[]): number | null {
  const vals: number[] = [];
  for (const m of meses) {
    const ag = agregaRebanhoMes(rows, m);
    if (ag?.cabecas != null) vals.push(ag.cabecas);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

/** Média ponderada de pesoMedioKg por cabecas no período. */
function pesoMedioPeriodo(rows: RebanhoMensal[], meses: string[]): number | null {
  let sumCab = 0;
  let sumCabXPeso = 0;
  for (const m of meses) {
    const ag = agregaRebanhoMes(rows, m);
    if (ag?.cabecas != null && ag.cabecas > 0 && ag.pesoMedioKg != null) {
      sumCab += ag.cabecas;
      sumCabXPeso += ag.cabecas * ag.pesoMedioKg;
    }
  }
  return sumCab > 0 ? sumCabXPeso / sumCab : null;
}

/** Média de UA/ha = média mensal de (ua / area). */
function lotacaoMediaPeriodo(rows: RebanhoMensal[], meses: string[]): number | null {
  const vals: number[] = [];
  for (const m of meses) {
    const ag = agregaRebanhoMes(rows, m);
    if (ag?.ua != null && ag.areaProdutivaPec != null && ag.areaProdutivaPec > 0) {
      vals.push(ag.ua / ag.areaProdutivaPec);
    }
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

/** Média de áreaProdutivaPec no período. */
function areaProdutivaMediaPeriodo(rows: RebanhoMensal[], meses: string[]): number | null {
  const vals: number[] = [];
  for (const m of meses) {
    const ag = agregaRebanhoMes(rows, m);
    if (ag?.areaProdutivaPec != null) vals.push(ag.areaProdutivaPec);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

/** Preço médio @ no período — média ponderada por arrobas_total. */
function precoMedioArrobaPeriodo(
  rows: BuildFechamentoPeriodoInput['valorRebanho'],
  meses: string[],
): number | null {
  const set = new Set(meses);
  let sumArr = 0;
  let sumValor = 0;
  for (const r of rows) {
    if (!set.has(r.ano_mes)) continue;
    if (r.arrobas_total != null && r.valor_total != null
        && Number.isFinite(r.arrobas_total) && Number.isFinite(r.valor_total)) {
      sumArr += r.arrobas_total;
      sumValor += r.valor_total;
    }
  }
  return sumArr > 0 ? sumValor / sumArr : null;
}

/** Série mensal de precoMedioArroba (não-pondera dentro do mês — usa preco_arroba direto). */
function seriePrecoArroba(
  meses: string[],
  rows: BuildFechamentoPeriodoInput['valorRebanho'],
  mesesAnoAnt: string[],
  rowsAnoAnt: BuildFechamentoPeriodoInput['valorRebanho'],
  metaMeses: string[],
  // META não fornece preço — devolve null em meta
): SerieMensal[] {
  const byMes = new Map<string, number[]>();
  for (const r of rows) {
    if (r.preco_arroba != null && Number.isFinite(r.preco_arroba)) {
      const arr = byMes.get(r.ano_mes) ?? [];
      arr.push(r.preco_arroba);
      byMes.set(r.ano_mes, arr);
    }
  }
  const byMesAnt = new Map<string, number[]>();
  for (const r of rowsAnoAnt) {
    if (r.preco_arroba != null && Number.isFinite(r.preco_arroba)) {
      const arr = byMesAnt.get(r.ano_mes) ?? [];
      arr.push(r.preco_arroba);
      byMesAnt.set(r.ano_mes, arr);
    }
  }
  const mean = (vals: number[] | undefined) =>
    vals && vals.length > 0 ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
  // metaMeses não usado para preço META (não existe) — parâmetro mantido p/ paralelismo de série
  void metaMeses;
  return meses.map((m, i) => ({
    ano_mes: m,
    realizado: mean(byMes.get(m)),
    meta: null,
    anoAnterior: mean(byMesAnt.get(mesesAnoAnt[i])),
  }));
}

/** Série mensal de um indicador agregado de rebanho. */
function serieRebanho(
  meses: string[],
  rows: RebanhoMensal[],
  mesesAnoAnt: string[],
  rowsAnoAnt: RebanhoMensal[],
  rowsMeta: RebanhoMensal[],
  pick: (ag: NonNullable<ReturnType<typeof agregaRebanhoMes>>) => number | null,
): SerieMensal[] {
  return meses.map((m, i) => {
    const ag = agregaRebanhoMes(rows, m);
    const agAnt = agregaRebanhoMes(rowsAnoAnt, mesesAnoAnt[i]);
    const agMeta = agregaRebanhoMes(rowsMeta, m);
    return {
      ano_mes: m,
      realizado: ag ? pick(ag) : null,
      meta: agMeta ? pick(agMeta) : null,
      anoAnterior: agAnt ? pick(agAnt) : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// CABEÇALHO EXECUTIVO
// ─────────────────────────────────────────────────────────────

function buildCabecalho(
  input: BuildFechamentoPeriodoInput,
  meses: string[],
  mesesAnoAnt: string[],
): FechamentoPeriodoDTO['cabecalho'] {
  const {
    lancamentosRealizados, lancamentosAnoAnterior, metaGrid,
    rebanhoMensal, rebanhoMensalAnoAnterior, rebanhoMensalMeta,
    lancamentosZoot, lancamentosZootAnoAnterior,
    valorRebanho, valorRebanhoAnoAnterior,
    saldosBancarios, saldosBancariosAnoAnterior,
    periodoFim,
  } = input;
  const periodoFimAnoAnt = mesesAnoAnt[mesesAnoAnt.length - 1] ?? periodoFim;

  // Receita Pecuária
  const receitaPecR = somaLanc(lancamentosRealizados, meses, isReceitaPec);
  const receitaPecM = somaMeta(metaGrid, meses, isMetaReceitaPec);
  const receitaPecA = somaLanc(lancamentosAnoAnterior, mesesAnoAnt, isReceitaPec);
  const receitaPecuaria = mkComp(receitaPecR, receitaPecM, receitaPecA);

  // Custeio Pec (CF + CV)
  const custeioPecR = somaLanc(lancamentosRealizados, meses, isCusteioPec);
  const custeioPecM = somaMeta(metaGrid, meses, isMetaCusteioPec);
  const custeioPecA = somaLanc(lancamentosAnoAnterior, mesesAnoAnt, isCusteioPec);
  const custeioPecuaria = mkComp(custeioPecR, custeioPecM, custeioPecA);

  // Juros Pec
  const jurosR = somaLanc(lancamentosRealizados, meses, isJurosPec);
  const jurosM = somaMeta(metaGrid, meses, isMetaJurosPec);
  const jurosA = somaLanc(lancamentosAnoAnterior, mesesAnoAnt, isJurosPec);
  const jurosFinanciamentoPec = mkComp(jurosR, jurosM, jurosA);

  // Investimento na Fazenda Pec (escopo='pecuaria')
  const invFazR = somaLanc(lancamentosRealizados, meses, isInvFazendaPec);
  const invFazM = somaMeta(metaGrid, meses, isMetaInvFazendaPec);
  const invFazA = somaLanc(lancamentosAnoAnterior, mesesAnoAnt, isInvFazendaPec);
  const investimentosFazendaPec = mkComp(invFazR, invFazM, invFazA);

  // Desembolso = Custeio + Inv Fazenda + Juros (3 componentes, null somente se TODOS null)
  const desembolsoR = somaCompNullable(custeioPecR, invFazR, jurosR);
  const desembolsoM = somaCompNullable(custeioPecM, invFazM, jurosM);
  const desembolsoA = somaCompNullable(custeioPecA, invFazA, jurosA);
  const desembolsoPecuaria = mkComp(desembolsoR, desembolsoM, desembolsoA);

  // @ Produzidas
  const arrobasProdR = arrobasProduzidasPeriodo(rebanhoMensal, meses);
  const arrobasProdM = arrobasProduzidasPeriodo(rebanhoMensalMeta, meses);
  const arrobasProdA = arrobasProduzidasPeriodo(rebanhoMensalAnoAnterior, mesesAnoAnt);
  const arrobasProduzidas = mkComp(arrobasProdR, arrobasProdM, arrobasProdA);

  // @ Desfrutadas
  const arrobasDesfR = arrobasDesfrutadasPeriodo(lancamentosZoot, meses);
  const arrobasDesfA = arrobasDesfrutadasPeriodo(lancamentosZootAnoAnterior, mesesAnoAnt);
  const arrobasDesfrutadas = mkComp(arrobasDesfR, null, arrobasDesfA);

  // Custo R$/@ = desembolso / @ desfrutadas
  const custoArrR = safeDiv(desembolsoR, arrobasDesfR);
  const custoArrA = safeDiv(desembolsoA, arrobasDesfA);
  const custoRsArroba = mkComp(custoArrR, null, custoArrA);

  // Preço R$/@
  const precoArrR = precoMedioArrobaPeriodo(valorRebanho, meses);
  const precoArrA = precoMedioArrobaPeriodo(valorRebanhoAnoAnterior, mesesAnoAnt);

  // Margem R$/@ = preço - custo
  const margemR = (precoArrR != null && custoArrR != null) ? precoArrR - custoArrR : null;
  const margemA = (precoArrA != null && custoArrA != null) ? precoArrA - custoArrA : null;
  const margemRsArroba = mkComp(margemR, null, margemA);

  // Cabeças médias
  const cabMedR = cabecasMediasPeriodo(rebanhoMensal, meses);
  const cabMedM = cabecasMediasPeriodo(rebanhoMensalMeta, meses);
  const cabMedA = cabecasMediasPeriodo(rebanhoMensalAnoAnterior, mesesAnoAnt);
  const cabecasMedias = mkComp(cabMedR, cabMedM, cabMedA);

  // Lotação UA/ha
  const lotR = lotacaoMediaPeriodo(rebanhoMensal, meses);
  const lotM = lotacaoMediaPeriodo(rebanhoMensalMeta, meses);
  const lotA = lotacaoMediaPeriodo(rebanhoMensalAnoAnterior, mesesAnoAnt);
  const lotacaoUaHa = mkComp(lotR, lotM, lotA);

  // Caixa final = saldo_final do último mês, soma todas contas
  const caixaR = saldosBancarios
    .filter(s => s.ano_mes === periodoFim && s.saldo_final != null)
    .reduce<number | null>((acc, s) => (acc ?? 0) + (s.saldo_final ?? 0), null);
  const caixaA = saldosBancariosAnoAnterior
    .filter(s => s.ano_mes === periodoFimAnoAnt && s.saldo_final != null)
    .reduce<number | null>((acc, s) => (acc ?? 0) + (s.saldo_final ?? 0), null);
  const caixaFinal = mkComp(caixaR, null, caixaA);

  // Resultado período = Receita Pecuária − Desembolso Pec (escopo pecuária puro).
  // Antes misturava Receita Operacional total (incluía agri/outras) com desembolso
  // só pecuária — quebrava consistência com a linha "(=) Lucro Líquido" da DRE.
  const resultadoR = nullableSub(receitaPecR, desembolsoR);
  const resultadoM = nullableSub(receitaPecM, desembolsoM);
  const resultadoA = nullableSub(receitaPecA, desembolsoA);
  const resultadoPeriodo = mkComp(resultadoR, resultadoM, resultadoA);

  // Geração de caixa = todas entradas - todas saídas (exclui transferências)
  const isLancEntradaCaixa = (l: FinanceiroLancamento) => l.tipo_operacao === '1-Entradas';
  const isLancSaidaCaixa   = (l: FinanceiroLancamento) => l.tipo_operacao === '2-Saídas';
  const totalEntR = somaLanc(lancamentosRealizados, meses, isLancEntradaCaixa);
  const totalSaiR = somaLanc(lancamentosRealizados, meses, isLancSaidaCaixa);
  const totalEntA = somaLanc(lancamentosAnoAnterior, mesesAnoAnt, isLancEntradaCaixa);
  const totalSaiA = somaLanc(lancamentosAnoAnterior, mesesAnoAnt, isLancSaidaCaixa);
  const totalEntM = somaMeta(metaGrid, meses, isMetaEntrada);
  const totalSaiM = somaMeta(metaGrid, meses, isMetaSaida);
  const geracaoCaixaR = nullableSub(totalEntR, totalSaiR);
  const geracaoCaixaM = nullableSub(totalEntM, totalSaiM);
  const geracaoCaixaA = nullableSub(totalEntA, totalSaiA);
  const geracaoCaixa = mkComp(geracaoCaixaR, geracaoCaixaM, geracaoCaixaA);

  return {
    resultadoPeriodo,
    geracaoCaixa,
    caixaFinal,
    receitaPecuaria,
    custeioPecuaria,
    jurosFinanciamentoPec,
    investimentosFazendaPec,
    desembolsoPecuaria,
    custoRsArroba,
    margemRsArroba,
    arrobasProduzidas,
    arrobasDesfrutadas,
    cabecasMedias,
    gmd: mkComp(null, null, null), // null no Marco 2.2
    lotacaoUaHa,
  };
}

// ─────────────────────────────────────────────────────────────
// RESUMO MACRO — árvore tipo > macro > grupo
// ─────────────────────────────────────────────────────────────

type Triple = { r: number | null; m: number | null; a: number | null };

function emptyTriple(): Triple { return { r: null, m: null, a: null }; }

function addR(t: Triple, v: number | null) { if (v != null) t.r = (t.r ?? 0) + v; }
function addM(t: Triple, v: number | null) { if (v != null) t.m = (t.m ?? 0) + v; }
function addA(t: Triple, v: number | null) { if (v != null) t.a = (t.a ?? 0) + v; }

function buildResumoMacro(
  input: BuildFechamentoPeriodoInput,
  meses: string[],
  mesesAnoAnt: string[],
): FechamentoPeriodoDTO['resumoMacro'] {
  const { lancamentosRealizados, lancamentosAnoAnterior, metaGrid } = input;
  const mesesSet = new Set(meses);
  const mesesAntSet = new Set(mesesAnoAnt);

  // chave: "tipo|macro|grupo"
  // Para meta, tipo é derivado de MACROS_ENTRADA/SAIDA.
  type Bucket = { tipo: '1-Entradas' | '2-Saídas'; macro: string; grupo: string; triple: Triple };
  const buckets = new Map<string, Bucket>();

  const getBucket = (tipo: '1-Entradas' | '2-Saídas', macro: string, grupo: string): Bucket => {
    const key = `${tipo}|${macro}|${grupo}`;
    let b = buckets.get(key);
    if (!b) {
      b = { tipo, macro, grupo, triple: emptyTriple() };
      buckets.set(key, b);
    }
    return b;
  };

  // Realizado
  for (const l of lancamentosRealizados) {
    if (l.tipo_operacao !== '1-Entradas' && l.tipo_operacao !== '2-Saídas') continue;
    if (!mesesSet.has(l.ano_mes)) continue;
    const macro = l.macro_custo ?? 'Sem macro';
    const grupo = l.grupo_custo ?? 'Sem grupo';
    addR(getBucket(l.tipo_operacao as '1-Entradas' | '2-Saídas', macro, grupo).triple, Number(l.valor) || 0);
  }

  // Ano anterior
  for (const l of lancamentosAnoAnterior) {
    if (l.tipo_operacao !== '1-Entradas' && l.tipo_operacao !== '2-Saídas') continue;
    if (!mesesAntSet.has(l.ano_mes)) continue;
    const macro = l.macro_custo ?? 'Sem macro';
    const grupo = l.grupo_custo ?? 'Sem grupo';
    addA(getBucket(l.tipo_operacao as '1-Entradas' | '2-Saídas', macro, grupo).triple, Number(l.valor) || 0);
  }

  // META — agregar via meses[idx]
  for (const row of metaGrid) {
    const tipo: '1-Entradas' | '2-Saídas' | null =
      isMetaEntrada(row) ? '1-Entradas' :
      isMetaSaida(row) ? '2-Saídas' : null;
    if (tipo == null) continue;
    const macro = row.macro_custo ?? 'Sem macro';
    const grupo = row.grupo_custo ?? 'Sem grupo';
    let sum = 0;
    let matched = false;
    for (const m of meses) {
      const idx = mesIdxDe(m);
      const v = row.meses[idx];
      if (v != null && Number.isFinite(v)) { sum += v; matched = true; }
    }
    if (matched) addM(getBucket(tipo, macro, grupo).triple, sum);
  }

  // Construir árvore: agrupar buckets por (tipo, macro)
  const porTipo = new Map<'1-Entradas' | '2-Saídas', Map<string, Bucket[]>>();
  for (const b of buckets.values()) {
    if (!porTipo.has(b.tipo)) porTipo.set(b.tipo, new Map());
    const porMacro = porTipo.get(b.tipo)!;
    const arr = porMacro.get(b.macro) ?? [];
    arr.push(b);
    porMacro.set(b.macro, arr);
  }

  const buildTreeNivel = (
    nivel: 'macro' | 'grupo',
    label: string,
    triple: Triple,
    filhos: MacroNode[] = [],
  ): MacroNode => {
    const c = mkComp(triple.r, triple.m, triple.a);
    return {
      label,
      nivel,
      realizado: c.realizado,
      meta: c.meta,
      anoAnterior: c.anoAnterior,
      desvioMeta: c.desvioMeta,
      desvioMetaPct: c.desvioMetaPct,
      desvioAnoAnt: c.desvioAnoAnt,
      desvioAnoAntPct: c.desvioAnoAntPct,
      filhos,
    };
  };

  const buildBranch = (tipo: '1-Entradas' | '2-Saídas'): MacroNode[] => {
    const porMacro = porTipo.get(tipo);
    if (!porMacro) return [];
    const macros: MacroNode[] = [];
    const macroNames = Array.from(porMacro.keys()).sort();
    for (const macro of macroNames) {
      const grupos = porMacro.get(macro)!;
      const grupoNodes: MacroNode[] = [];
      const tripleMacro = emptyTriple();
      grupos.sort((a, b) => a.grupo.localeCompare(b.grupo));
      for (const g of grupos) {
        grupoNodes.push(buildTreeNivel('grupo', g.grupo, g.triple, []));
        addR(tripleMacro, g.triple.r);
        addM(tripleMacro, g.triple.m);
        addA(tripleMacro, g.triple.a);
      }
      macros.push(buildTreeNivel('macro', macro, tripleMacro, grupoNodes));
    }
    return macros;
  };

  const entradas = buildBranch('1-Entradas');
  const saidas = buildBranch('2-Saídas');

  const sumEntradas = (acc: Triple, n: MacroNode): Triple => ({
    r: nullableSum(acc.r, n.realizado),
    m: nullableSum(acc.m, n.meta),
    a: nullableSum(acc.a, n.anoAnterior),
  });
  const tEnt = entradas.reduce(sumEntradas, emptyTriple());
  const tSai = saidas.reduce(sumEntradas, emptyTriple());
  const totalEntradas = mkComp(tEnt.r, tEnt.m, tEnt.a);
  const totalSaidas = mkComp(tSai.r, tSai.m, tSai.a);
  const resultadoLiquido = mkComp(
    nullableSub(tEnt.r, tSai.r),
    nullableSub(tEnt.m, tSai.m),
    nullableSub(tEnt.a, tSai.a),
  );

  return { entradas, saidas, totalEntradas, totalSaidas, resultadoLiquido };
}

// ─────────────────────────────────────────────────────────────
// ANÁLISE PECUÁRIA
// ─────────────────────────────────────────────────────────────

function buildAnalisePecuaria(
  input: BuildFechamentoPeriodoInput,
  meses: string[],
  mesesAnoAnt: string[],
  cabecalho: FechamentoPeriodoDTO['cabecalho'],
): FechamentoPeriodoDTO['analisePecuaria'] {
  const {
    lancamentosRealizados, lancamentosAnoAnterior, metaGrid,
    rebanhoMensal, rebanhoMensalAnoAnterior, rebanhoMensalMeta,
    valorRebanho, valorRebanhoAnoAnterior,
  } = input;

  const ind = (label: string, unidade: string, comparativo: Comparativo, serie: SerieMensal[]): IndicadorPecuaria =>
    ({ label, unidade, comparativo, serie });

  const serieEmpty = (): SerieMensal[] =>
    meses.map(m => ({ ano_mes: m, realizado: null, meta: null, anoAnterior: null }));

  // Receita Pec
  const receitaPec = ind(
    'Receita Pecuária', 'R$',
    cabecalho.receitaPecuaria,
    serieLanc(meses, lancamentosRealizados, mesesAnoAnt, lancamentosAnoAnterior, metaGrid, isReceitaPec, isMetaReceitaPec),
  );

  // Custeio Pec
  const custeioPec = ind(
    'Custeio Pecuária', 'R$',
    cabecalho.custeioPecuaria,
    serieLanc(meses, lancamentosRealizados, mesesAnoAnt, lancamentosAnoAnterior, metaGrid, isCusteioPec, isMetaCusteioPec),
  );

  const jurosPec = ind(
    'Juros Financiamento Pec.', 'R$',
    cabecalho.jurosFinanciamentoPec,
    serieLanc(meses, lancamentosRealizados, mesesAnoAnt, lancamentosAnoAnterior, metaGrid, isJurosPec, isMetaJurosPec),
  );

  const invFazPec = ind(
    'Investimentos Fazenda Pec.', 'R$',
    cabecalho.investimentosFazendaPec,
    serieLanc(meses, lancamentosRealizados, mesesAnoAnt, lancamentosAnoAnterior, metaGrid, isInvFazendaPec, isMetaInvFazendaPec),
  );

  // Desembolso = soma série custeio + invFazenda + juros (null somente se TODOS null no mês)
  const desembolsoSerie: SerieMensal[] = meses.map((m, i) => ({
    ano_mes: m,
    realizado: somaCompNullable(custeioPec.serie[i].realizado, invFazPec.serie[i].realizado, jurosPec.serie[i].realizado),
    meta: somaCompNullable(custeioPec.serie[i].meta, invFazPec.serie[i].meta, jurosPec.serie[i].meta),
    anoAnterior: somaCompNullable(custeioPec.serie[i].anoAnterior, invFazPec.serie[i].anoAnterior, jurosPec.serie[i].anoAnterior),
  }));
  const desembolso = ind('Desembolso Pecuária', 'R$', cabecalho.desembolsoPecuaria, desembolsoSerie);

  // Cabeças médias
  const serieCab = serieRebanho(
    meses, rebanhoMensal, mesesAnoAnt, rebanhoMensalAnoAnterior, rebanhoMensalMeta,
    ag => ag.cabecas,
  );
  const cabecasMedias = ind('Cabeças Médias', 'cab', cabecalho.cabecasMedias, serieCab);

  // Arrobas produzidas — série derivada de producaoBiologicaKg/30
  const serieArrobasProd: SerieMensal[] = meses.map((m, i) => {
    const ag = agregaRebanhoMes(rebanhoMensal, m);
    const agAnt = agregaRebanhoMes(rebanhoMensalAnoAnterior, mesesAnoAnt[i]);
    const agMeta = agregaRebanhoMes(rebanhoMensalMeta, m);
    return {
      ano_mes: m,
      realizado: ag?.producaoBiologicaKg != null ? ag.producaoBiologicaKg / 30 : null,
      meta: agMeta?.producaoBiologicaKg != null ? agMeta.producaoBiologicaKg / 30 : null,
      anoAnterior: agAnt?.producaoBiologicaKg != null ? agAnt.producaoBiologicaKg / 30 : null,
    };
  });
  const arrobasProd = ind('Arrobas Produzidas', '@', cabecalho.arrobasProduzidas, serieArrobasProd);

  // Arrobas desfrutadas — série mensal a partir de lancamentosZoot
  const serieArrobasDesf: SerieMensal[] = meses.map((m, i) => ({
    ano_mes: m,
    realizado: arrobasDesfrutadasPeriodo(input.lancamentosZoot, [m]),
    meta: null,
    anoAnterior: arrobasDesfrutadasPeriodo(input.lancamentosZootAnoAnterior, [mesesAnoAnt[i]]),
  }));
  const arrobasDesf = ind('Arrobas Desfrutadas', '@', cabecalho.arrobasDesfrutadas, serieArrobasDesf);

  // Custo R$/@ — série = desembolso / arrobasDesf por mês
  const serieCustoArr: SerieMensal[] = meses.map((_, i) => ({
    ano_mes: meses[i],
    realizado: safeDiv(desembolsoSerie[i].realizado, serieArrobasDesf[i].realizado),
    meta: safeDiv(desembolsoSerie[i].meta, serieArrobasDesf[i].meta),
    anoAnterior: safeDiv(desembolsoSerie[i].anoAnterior, serieArrobasDesf[i].anoAnterior),
  }));
  const custoArroba = ind('Custo R$/@', 'R$/@', cabecalho.custoRsArroba, serieCustoArr);

  // Preço médio @
  const seriePrecoArr = seriePrecoArroba(meses, valorRebanho, mesesAnoAnt, valorRebanhoAnoAnterior, meses);
  const precoMedioR = precoMedioArrobaPeriodo(valorRebanho, meses);
  const precoMedioA = precoMedioArrobaPeriodo(valorRebanhoAnoAnterior, mesesAnoAnt);
  const precoMedioArroba = ind('Preço Médio @', 'R$/@', mkComp(precoMedioR, null, precoMedioA), seriePrecoArr);

  // Margem R$/@ — série = preco - custo
  const serieMargem: SerieMensal[] = meses.map((m, i) => ({
    ano_mes: m,
    realizado: (seriePrecoArr[i].realizado != null && serieCustoArr[i].realizado != null)
      ? seriePrecoArr[i].realizado! - serieCustoArr[i].realizado! : null,
    meta: null,
    anoAnterior: (seriePrecoArr[i].anoAnterior != null && serieCustoArr[i].anoAnterior != null)
      ? seriePrecoArr[i].anoAnterior! - serieCustoArr[i].anoAnterior! : null,
  }));
  const margemArroba = ind('Margem R$/@', 'R$/@', cabecalho.margemRsArroba, serieMargem);

  // Custo/cabeça/mês — série = desembolso / (cabecas) (mês é unitário)
  const serieCustoCab: SerieMensal[] = meses.map((m, i) => {
    const cab = serieCab[i].realizado;
    const cabM = serieCab[i].meta;
    const cabA = serieCab[i].anoAnterior;
    return {
      ano_mes: m,
      realizado: safeDiv(desembolsoSerie[i].realizado, cab),
      meta: safeDiv(desembolsoSerie[i].meta, cabM),
      anoAnterior: safeDiv(desembolsoSerie[i].anoAnterior, cabA),
    };
  });
  const custoCabR = safeDiv(cabecalho.desembolsoPecuaria.realizado,
    cabecalho.cabecasMedias.realizado != null && meses.length > 0
      ? cabecalho.cabecasMedias.realizado * meses.length : null);
  const custoCabM = safeDiv(cabecalho.desembolsoPecuaria.meta,
    cabecalho.cabecasMedias.meta != null && meses.length > 0
      ? cabecalho.cabecasMedias.meta * meses.length : null);
  const custoCabA = safeDiv(cabecalho.desembolsoPecuaria.anoAnterior,
    cabecalho.cabecasMedias.anoAnterior != null && meses.length > 0
      ? cabecalho.cabecasMedias.anoAnterior * meses.length : null);
  const custoCabecaMes = ind('Custo/Cabeça/Mês', 'R$', mkComp(custoCabR, custoCabM, custoCabA), serieCustoCab);

  // Receita/cabeça
  const serieReceitaCab: SerieMensal[] = meses.map((m, i) => ({
    ano_mes: m,
    realizado: safeDiv(receitaPec.serie[i].realizado, serieCab[i].realizado),
    meta: safeDiv(receitaPec.serie[i].meta, serieCab[i].meta),
    anoAnterior: safeDiv(receitaPec.serie[i].anoAnterior, serieCab[i].anoAnterior),
  }));
  const recCabR = safeDiv(cabecalho.receitaPecuaria.realizado, cabecalho.cabecasMedias.realizado);
  const recCabM = safeDiv(cabecalho.receitaPecuaria.meta, cabecalho.cabecasMedias.meta);
  const recCabA = safeDiv(cabecalho.receitaPecuaria.anoAnterior, cabecalho.cabecasMedias.anoAnterior);
  const receitaCabeca = ind('Receita/Cabeça', 'R$', mkComp(recCabR, recCabM, recCabA), serieReceitaCab);

  // Peso médio kg
  const seriePesoMedio = serieRebanho(
    meses, rebanhoMensal, mesesAnoAnt, rebanhoMensalAnoAnterior, rebanhoMensalMeta,
    ag => ag.pesoMedioKg,
  );
  const pesoMedR = pesoMedioPeriodo(rebanhoMensal, meses);
  const pesoMedM = pesoMedioPeriodo(rebanhoMensalMeta, meses);
  const pesoMedA = pesoMedioPeriodo(rebanhoMensalAnoAnterior, mesesAnoAnt);
  const pesoMedioKg = ind('Peso Médio', 'kg', mkComp(pesoMedR, pesoMedM, pesoMedA), seriePesoMedio);

  // Lotação UA/ha
  const serieLot: SerieMensal[] = meses.map((m, i) => {
    const ag = agregaRebanhoMes(rebanhoMensal, m);
    const agAnt = agregaRebanhoMes(rebanhoMensalAnoAnterior, mesesAnoAnt[i]);
    const agMeta = agregaRebanhoMes(rebanhoMensalMeta, m);
    return {
      ano_mes: m,
      realizado: (ag?.ua != null && ag.areaProdutivaPec && ag.areaProdutivaPec > 0) ? ag.ua / ag.areaProdutivaPec : null,
      meta: (agMeta?.ua != null && agMeta.areaProdutivaPec && agMeta.areaProdutivaPec > 0) ? agMeta.ua / agMeta.areaProdutivaPec : null,
      anoAnterior: (agAnt?.ua != null && agAnt.areaProdutivaPec && agAnt.areaProdutivaPec > 0) ? agAnt.ua / agAnt.areaProdutivaPec : null,
    };
  });
  const lotacao = ind('Lotação UA/ha', 'UA/ha', cabecalho.lotacaoUaHa, serieLot);

  // Área produtiva — média do período
  const serieArea = serieRebanho(
    meses, rebanhoMensal, mesesAnoAnt, rebanhoMensalAnoAnterior, rebanhoMensalMeta,
    ag => ag.areaProdutivaPec,
  );
  const areaR = areaProdutivaMediaPeriodo(rebanhoMensal, meses);
  const areaM = areaProdutivaMediaPeriodo(rebanhoMensalMeta, meses);
  const areaA = areaProdutivaMediaPeriodo(rebanhoMensalAnoAnterior, mesesAnoAnt);
  const areaProdutivaPec = ind('Área Produtiva Pec', 'ha', mkComp(areaR, areaM, areaA), serieArea);

  // GMD — null no Marco 2.2
  const gmd = ind('GMD', 'kg/dia', mkComp(null, null, null), serieEmpty());

  return {
    receitaPecuaria: receitaPec,
    custeioPecuaria: custeioPec,
    jurosFinanciamentoPec: jurosPec,
    investimentosFazendaPec: invFazPec,
    desembolsoPecuaria: desembolso,
    custoRsArroba: custoArroba,
    precoMedioArroba,
    margemRsArroba: margemArroba,
    custoCabecaMes,
    receitaCabeca,
    arrobasProduzidas: arrobasProd,
    arrobasDesfrutadas: arrobasDesf,
    cabecasMedias,
    pesoMedioKg,
    gmd,
    lotacaoUaHa: lotacao,
    areaProdutivaPec,
  };
}

// ─────────────────────────────────────────────────────────────
// ESTRUTURA DE CUSTOS — grupo > centro > subcentro (saídas)
// ─────────────────────────────────────────────────────────────

function buildEstruturaCustos(
  input: BuildFechamentoPeriodoInput,
  meses: string[],
  mesesAnoAnt: string[],
): FechamentoPeriodoDTO['estruturaCustos'] {
  const { lancamentosRealizados, lancamentosAnoAnterior, metaGrid } = input;
  const mesesSet = new Set(meses);
  const mesesAntSet = new Set(mesesAnoAnt);

  type SubBucket = { macro: string; grupo: string; centro: string; subcentro: string; ordem: number; triple: Triple };
  const subBuckets = new Map<string, SubBucket>();

  const getSubBucket = (macro: string, grupo: string, centro: string, subcentro: string, ordem: number): SubBucket => {
    const key = `${grupo}|${centro}|${subcentro}`;
    let b = subBuckets.get(key);
    if (!b) {
      b = { macro, grupo, centro, subcentro, ordem, triple: emptyTriple() };
      subBuckets.set(key, b);
    } else if (b.ordem === 9999 && ordem < 9999) {
      b.ordem = ordem;
    }
    return b;
  };

  // Realizado: tipo_operacao = '2-Saídas'
  for (const l of lancamentosRealizados) {
    if (l.tipo_operacao !== '2-Saídas') continue;
    if (!mesesSet.has(l.ano_mes)) continue;
    const macro = l.macro_custo ?? 'Sem macro';
    const grupo = l.grupo_custo ?? 'Sem grupo';
    const centro = l.centro_custo ?? 'Sem centro';
    const subcentro = l.subcentro ?? 'Sem subcentro';
    addR(getSubBucket(macro, grupo, centro, subcentro, 9999).triple, Number(l.valor) || 0);
  }

  // Ano anterior
  for (const l of lancamentosAnoAnterior) {
    if (l.tipo_operacao !== '2-Saídas') continue;
    if (!mesesAntSet.has(l.ano_mes)) continue;
    const macro = l.macro_custo ?? 'Sem macro';
    const grupo = l.grupo_custo ?? 'Sem grupo';
    const centro = l.centro_custo ?? 'Sem centro';
    const subcentro = l.subcentro ?? 'Sem subcentro';
    addA(getSubBucket(macro, grupo, centro, subcentro, 9999).triple, Number(l.valor) || 0);
  }

  // META — somente saídas
  for (const row of metaGrid) {
    if (!isMetaSaida(row)) continue;
    const macro = row.macro_custo ?? 'Sem macro';
    const grupo = row.grupo_custo ?? 'Sem grupo';
    const centro = row.centro_custo;
    const subcentro = row.subcentro;
    let sum = 0;
    let matched = false;
    for (const m of meses) {
      const idx = mesIdxDe(m);
      const v = row.meses[idx];
      if (v != null && Number.isFinite(v)) { sum += v; matched = true; }
    }
    const b = getSubBucket(macro, grupo, centro, subcentro, row.ordem_exibicao ?? 9999);
    if (matched) addM(b.triple, sum);
  }

  // Construir árvore: grupo > centro > subcentro
  const porGrupo = new Map<string, { macro: string; centros: Map<string, SubBucket[]>; triple: Triple; ordemMin: number }>();

  for (const b of subBuckets.values()) {
    if (!porGrupo.has(b.grupo)) {
      porGrupo.set(b.grupo, { macro: b.macro, centros: new Map(), triple: emptyTriple(), ordemMin: b.ordem });
    }
    const g = porGrupo.get(b.grupo)!;
    g.ordemMin = Math.min(g.ordemMin, b.ordem);
    const arr = g.centros.get(b.centro) ?? [];
    arr.push(b);
    g.centros.set(b.centro, arr);
    addR(g.triple, b.triple.r);
    addM(g.triple, b.triple.m);
    addA(g.triple, b.triple.a);
  }

  const grupos: GrupoNode[] = [];
  const totalGeralT = emptyTriple();

  const grupoEntries = Array.from(porGrupo.entries()).sort(([, a], [, b]) => a.ordemMin - b.ordemMin || 0);
  for (const [grupoName, g] of grupoEntries) {
    const centroNodes: CentroNode[] = [];
    const centroEntries = Array.from(g.centros.entries()).sort(([cA, subsA], [cB, subsB]) => {
      const oA = Math.min(...subsA.map(s => s.ordem));
      const oB = Math.min(...subsB.map(s => s.ordem));
      return oA - oB || cA.localeCompare(cB);
    });
    for (const [centroName, subs] of centroEntries) {
      const subNodes: SubcentroNode[] = subs
        .sort((a, b) => a.ordem - b.ordem || a.subcentro.localeCompare(b.subcentro))
        .map(s => {
          const c = mkComp(s.triple.r, s.triple.m, s.triple.a);
          return {
            subcentro: s.subcentro,
            realizado: c.realizado,
            meta: c.meta,
            anoAnterior: c.anoAnterior,
            desvioMeta: c.desvioMeta,
            desvioMetaPct: c.desvioMetaPct,
            desvioAnoAnt: c.desvioAnoAnt,
            desvioAnoAntPct: c.desvioAnoAntPct,
          } as SubcentroNode;
        });
      const tCentro = subs.reduce<Triple>((acc, s) => ({
        r: nullableSum(acc.r, s.triple.r),
        m: nullableSum(acc.m, s.triple.m),
        a: nullableSum(acc.a, s.triple.a),
      }), emptyTriple());
      const cCentro = mkComp(tCentro.r, tCentro.m, tCentro.a);
      centroNodes.push({
        centro_custo: centroName,
        realizado: cCentro.realizado,
        meta: cCentro.meta,
        anoAnterior: cCentro.anoAnterior,
        desvioMeta: cCentro.desvioMeta,
        desvioMetaPct: cCentro.desvioMetaPct,
        desvioAnoAnt: cCentro.desvioAnoAnt,
        desvioAnoAntPct: cCentro.desvioAnoAntPct,
        subcentros: subNodes,
      });
    }
    const cGrupo = mkComp(g.triple.r, g.triple.m, g.triple.a);
    grupos.push({
      grupo_custo: grupoName,
      macro_custo: g.macro,
      realizado: cGrupo.realizado,
      meta: cGrupo.meta,
      anoAnterior: cGrupo.anoAnterior,
      desvioMeta: cGrupo.desvioMeta,
      desvioMetaPct: cGrupo.desvioMetaPct,
      desvioAnoAnt: cGrupo.desvioAnoAnt,
      desvioAnoAntPct: cGrupo.desvioAnoAntPct,
      centros: centroNodes,
    });
    addR(totalGeralT, g.triple.r);
    addM(totalGeralT, g.triple.m);
    addA(totalGeralT, g.triple.a);
  }

  return {
    grupos,
    totalGeral: mkComp(totalGeralT.r, totalGeralT.m, totalGeralT.a),
  };
}

// ─────────────────────────────────────────────────────────────
// MOVIMENTAÇÃO DE REBANHO
// ─────────────────────────────────────────────────────────────

function buildMovRebanho(
  input: BuildFechamentoPeriodoInput,
  meses: string[],
): FechamentoPeriodoDTO['movRebanho'] {
  const { rebanhoMensal, rebanhoMensalMeta, lancamentosZoot, periodoInicio, periodoFim } = input;

  // Por categoria — somar quantidades por tipo
  type CatBuck = {
    compras: number; comprasMatched: boolean;
    nascimentos: number; nascimentosMatched: boolean;
    transferenciasEntrada: number; transferenciasEntradaMatched: boolean;
    vendas: number; vendasMatched: boolean;
    abates: number; abatesMatched: boolean;
    mortes: number; mortesMatched: boolean;
    consumos: number; consumosMatched: boolean;
    transferenciasSaida: number; transferenciasSaidaMatched: boolean;
  };
  const newBuck = (): CatBuck => ({
    compras: 0, comprasMatched: false,
    nascimentos: 0, nascimentosMatched: false,
    transferenciasEntrada: 0, transferenciasEntradaMatched: false,
    vendas: 0, vendasMatched: false,
    abates: 0, abatesMatched: false,
    mortes: 0, mortesMatched: false,
    consumos: 0, consumosMatched: false,
    transferenciasSaida: 0, transferenciasSaidaMatched: false,
  });
  const porCat = new Map<string, CatBuck>();
  const mesesSet = new Set(meses);

  for (const l of lancamentosZoot) {
    const ym = l.data ? l.data.substring(0, 7) : '';
    if (!mesesSet.has(ym)) continue;
    const cat = l.categoria as string;
    if (!cat) continue;
    if (!porCat.has(cat)) porCat.set(cat, newBuck());
    const b = porCat.get(cat)!;
    const q = Number(l.quantidade) || 0;
    switch (l.tipo) {
      case 'compra': b.compras += q; b.comprasMatched = true; break;
      case 'nascimento': b.nascimentos += q; b.nascimentosMatched = true; break;
      case 'transferencia_entrada': b.transferenciasEntrada += q; b.transferenciasEntradaMatched = true; break;
      case 'venda': b.vendas += q; b.vendasMatched = true; break;
      case 'abate': b.abates += q; b.abatesMatched = true; break;
      case 'morte': b.mortes += q; b.mortesMatched = true; break;
      case 'consumo': b.consumos += q; b.consumosMatched = true; break;
      case 'transferencia_saida': b.transferenciasSaida += q; b.transferenciasSaidaMatched = true; break;
      default: break;
    }
  }

  const porCategoria: MovCategoriaLinha[] = Array.from(porCat.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, b]) => {
      const tEntr = (b.comprasMatched ? b.compras : 0)
                  + (b.nascimentosMatched ? b.nascimentos : 0)
                  + (b.transferenciasEntradaMatched ? b.transferenciasEntrada : 0);
      const tSaid = (b.vendasMatched ? b.vendas : 0)
                  + (b.abatesMatched ? b.abates : 0)
                  + (b.mortesMatched ? b.mortes : 0)
                  + (b.consumosMatched ? b.consumos : 0)
                  + (b.transferenciasSaidaMatched ? b.transferenciasSaida : 0);
      const anyEntr = b.comprasMatched || b.nascimentosMatched || b.transferenciasEntradaMatched;
      const anySaid = b.vendasMatched || b.abatesMatched || b.mortesMatched || b.consumosMatched || b.transferenciasSaidaMatched;
      return {
        categoria: cat,
        saldoInicial: null,
        compras: b.comprasMatched ? b.compras : null,
        nascimentos: b.nascimentosMatched ? b.nascimentos : null,
        transferenciasEntrada: b.transferenciasEntradaMatched ? b.transferenciasEntrada : null,
        totalEntradas: anyEntr ? tEntr : null,
        vendas: b.vendasMatched ? b.vendas : null,
        abates: b.abatesMatched ? b.abates : null,
        mortes: b.mortesMatched ? b.mortes : null,
        consumos: b.consumosMatched ? b.consumos : null,
        transferenciasSaida: b.transferenciasSaidaMatched ? b.transferenciasSaida : null,
        totalSaidas: anySaid ? tSaid : null,
        saldoFinal: null,
        pesoMedioFinalKg: null,
        pesoTotalKg: null,
        pesoTotalArroba: null,
      };
    });

  // Resumo geral — cabecas inicial/final via RebanhoMensal agregado
  const agInicial = agregaRebanhoMes(rebanhoMensal, periodoInicio);
  const agFinal = agregaRebanhoMes(rebanhoMensal, periodoFim);

  // Total entradas/saidas — somar todos os lancamentosZoot do período
  let totalEntr = 0; let anyEntr = false;
  let totalSai = 0; let anySai = false;
  for (const l of lancamentosZoot) {
    const ym = l.data ? l.data.substring(0, 7) : '';
    if (!mesesSet.has(ym)) continue;
    const q = Number(l.quantidade) || 0;
    if (l.tipo === 'compra' || l.tipo === 'nascimento' || l.tipo === 'transferencia_entrada') {
      totalEntr += q; anyEntr = true;
    } else if (l.tipo === 'venda' || l.tipo === 'abate' || l.tipo === 'morte'
            || l.tipo === 'consumo' || l.tipo === 'transferencia_saida') {
      totalSai += q; anySai = true;
    }
  }

  // UA média
  let sumUa = 0; let countUa = 0;
  for (const m of meses) {
    const ag = agregaRebanhoMes(rebanhoMensal, m);
    if (ag?.ua != null) { sumUa += ag.ua; countUa += 1; }
  }
  const uaMedia = countUa > 0 ? sumUa / countUa : null;

  const serieCabecas = meses.map(m => {
    const ag = agregaRebanhoMes(rebanhoMensal, m);
    const agMeta = agregaRebanhoMes(rebanhoMensalMeta, m);
    return {
      ano_mes: m,
      cabecas: ag?.cabecas ?? null,
      ua: ag?.ua ?? null,
      meta: agMeta?.cabecas ?? null,
    };
  });

  return {
    resumo: {
      cabecasInicial: agInicial?.cabecas ?? null,
      cabecasFinal: agFinal?.cabecas ?? null,
      totalEntradas: anyEntr ? totalEntr : null,
      totalSaidas: anySai ? totalSai : null,
      pesoTotalFinalKg: null,
      pesoTotalFinalArroba: null,
      uaMedia,
    },
    porCategoria,
    serieCabecas,
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

/**
 * Builder puro — sem hooks, sem Supabase, sem side effects.
 * Recebe dados já fetchados e retorna o DTO do Fechamento do Período.
 */
export function buildFechamentoPeriodoData(
  input: BuildFechamentoPeriodoInput,
): FechamentoPeriodoDTO {
  const meses = getMeses(input.periodoInicio, input.periodoFim);
  const mesesAnoAnt = getMesesAnoAnterior(meses);

  const cabecalho = buildCabecalho(input, meses, mesesAnoAnt);
  const resumoMacro = buildResumoMacro(input, meses, mesesAnoAnt);
  const analisePecuaria = buildAnalisePecuaria(input, meses, mesesAnoAnt, cabecalho);
  const estruturaCustos = buildEstruturaCustos(input, meses, mesesAnoAnt);
  const movRebanho = buildMovRebanho(input, meses);

  // Flags
  const flags = {
    p1Oficial: meses.every(m => input.statusPilares.some(s => s.ano_mes === m && s.p1_oficial)),
    p2Oficial: meses.every(m => input.statusPilares.some(s => s.ano_mes === m && s.p2_oficial)),
    metaDisponivel: input.metaGrid.length > 0,
    anoAnteriorDisponivel: input.lancamentosAnoAnterior.length > 0,
    caixaDisponivel: input.saldosBancarios.some(s => s.ano_mes === input.periodoFim && s.saldo_final != null),
  };

  return {
    clienteId: input.clienteId,
    fazendaId: input.fazendaId ?? 'global',
    periodoInicio: input.periodoInicio,
    periodoFim: input.periodoFim,
    meses,
    geradoEm: new Date().toISOString(),
    flags,
    cabecalho,
    resumoMacro,
    analisePecuaria,
    estruturaCustos,
    movRebanho,
  };
}
