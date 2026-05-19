/**
 * buildBlocoResumoExecutivo.ts
 *
 * Camada de composição pura do Bloco 1 Executivo. Zero classificação:
 * todas as 15 agregações (REAL 2025 + META 2026) são delegadas a
 * agregadosFinanceiros.ts. Esta camada apenas:
 *   - Soma arrays mensais em totais escalares
 *   - Compõe séries gráficas e deltas
 *   - Calcula conciliação (banner) comparando soma de buckets vs total
 *     bruto absoluto do grid META
 *
 * Princípio "UMA regra, UM lugar": qualquer mudança em classificação
 * acontece em classificacao.ts. Qualquer mudança em pipeline de agregação
 * acontece em agregadosFinanceiros.ts. Aqui só visual.
 */

import type {
  BlocoResumoExecutivoData,
  LinhaExecutiva,
} from './blocoResumoExecutivoTypes';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import {
  agregaReceitaPec,
  agregaReceitaAgri,
  agregaOutrasReceitas,
  agregaEntradasFinanceiras,
  agregaCusteioPecSemJuros,
  agregaCusteioAgriSemJuros,
  agregaJurosPec,
  agregaJurosAgri,
  agregaInvFazendaPec,
  agregaInvFazendaAgri,
  agregaInvBovinos,
  agregaAmortizacaoPec,
  agregaAmortizacaoAgri,
  agregaDividendos,
  agregaDeducoes,
  agregaReceitaPecMeta,
  agregaReceitaAgriMeta,
  agregaOutrasReceitasMeta,
  agregaEntradasFinanceirasMeta,
  agregaCusteioPecSemJurosMeta,
  agregaCusteioAgriSemJurosMeta,
  agregaJurosPecMeta,
  agregaJurosAgriMeta,
  agregaInvFazendaPecMeta,
  agregaInvFazendaAgriMeta,
  agregaInvBovinosMeta,
  agregaAmortizacaoPecMeta,
  agregaAmortizacaoAgriMeta,
  agregaDividendosMeta,
  agregaDeducoesMeta,
} from '@/lib/painelConsultor/agregadosFinanceiros';

export interface BuildBlocoInput {
  lancFin2025: FinanceiroLancamento[];
  gridMeta2026: SubcentroGrid[];
  /** Saldo bancário consolidado Dez/N-1 — fonte oficial: planFin.saldoInicial. */
  saldoInicialMeta: number;
  /**
   * Saldo bancário consolidado Jan..Dez do ano anterior — fonte oficial
   * PC-100: pc100.caixaIndicador.serieAnoAnt.slice(1) (length 12).
   * Alimenta a linha REAL do gráfico de saldo acumulado.
   * Undefined/null → NaN[12] → linha vazia no Recharts (sem fallback).
   */
  caixaSaldoAnoAntMensal?: number[];
  /**
   * Lançamentos financeiros do ano corrente (2026). Quando presente,
   * popula `realAnoCorrente`, `deltaAnoCorrente` em cada LinhaExecutiva
   * e `serieRealAnoCorrente` no DTO — habilitando o modo Fechamento do
   * BlocoResumoExecutivo. Ausente → comportamento original preservado.
   */
  lancFin2026?: FinanceiroLancamento[];
  /**
   * Mês alvo do filtro (1..12). Quando presente, TODOS os totais escalares
   * de cada LinhaExecutiva (meta/real/realAnoCorrente) refletem Jan→mesAlvo
   * — comparação período vs mesmo período. Séries mensais (serieMeta /
   * serieReal / serieRealAnoCorrente) seguem sempre com 12 posições para o
   * gráfico. Ausente → totais anuais (modo Planejamento).
   */
  mesAlvo?: number;
  /**
   * Saldo bancário consolidado realizado Jan..Dez do ano corrente — fonte
   * oficial PC-100: pc100.caixaIndicador.serieAno.slice(1) (length 12).
   * Quando presente, alimenta diretamente `serieRealAnoCorrente` como
   * saldo absoluto (mesma semântica de `caixaSaldoAnoAntMensal`/`serieMeta`)
   * — encerra cálculo paralelo via lancFin2026 para a curva do gráfico.
   * Fonte única soberana — sem cálculo paralelo. Fluxos por categoria
   * (cards Total/tabelas) continuam vindo de `lancFin2026`.
   */
  caixaSaldoAnoCorrenteMensal?: number[];
}

const ANO_REAL = 2025;
const ANO_CORRENTE = 2026;

// ─── Helpers de composição puros (sem classificação) ─────────────────

const sum12 = (arr: number[]): number => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += arr[i] ?? 0;
  return s;
};

// Soma os primeiros `n` meses (1..12) de um array mensal. Quando n
// indefinido, equivale a sum12. Usado para prorated totals no modo
// Fechamento — comparativo período vs mesmo período.
const sumUpTo = (arr: number[], n?: number): number => {
  const limite = Math.max(0, Math.min(12, n ?? 12));
  let s = 0;
  for (let i = 0; i < limite; i++) s += arr[i] ?? 0;
  return s;
};

const sumArrays = (...arrays: number[][]): number[] => {
  const out = new Array(12).fill(0);
  for (const a of arrays) for (let i = 0; i < 12; i++) out[i] += a[i] ?? 0;
  return out;
};

const subArrays = (a: number[], b: number[]): number[] =>
  a.map((v, i) => v - (b[i] ?? 0));

const calcDelta = (meta: number, real: number): number => {
  if (meta <= 0 && real <= 0) return 0;
  return (meta - real) / (real || 1);
};

// Delta do modo Fechamento: (realAnoCorrente − meta)/meta.
// Quando meta <= 0, retorna 0 (sem base para comparar).
const calcDeltaAnoCorrente = (realAnoCorrente: number, meta: number): number => {
  if (meta <= 0) return 0;
  return (realAnoCorrente - meta) / meta;
};

const makeLinha = (
  label: string,
  metaArr: number[],
  realArr: number[],
  realAnoCorrenteArr?: number[],
  mesAlvo?: number,
): LinhaExecutiva => {
  const meta = sumUpTo(metaArr, mesAlvo);
  const real = sumUpTo(realArr, mesAlvo);
  const base: LinhaExecutiva = { label, meta, real, delta: calcDelta(meta, real) };
  if (realAnoCorrenteArr) {
    const realAnoCorrente = sumUpTo(realAnoCorrenteArr, mesAlvo);
    base.realAnoCorrente = realAnoCorrente;
    base.deltaAnoCorrente = calcDeltaAnoCorrente(realAnoCorrente, meta);
  }
  return base;
};

// ─── Builder ─────────────────────────────────────────────────────────

export function buildBlocoResumoExecutivo(input: BuildBlocoInput): BlocoResumoExecutivoData {
  const {
    lancFin2025,
    gridMeta2026,
    saldoInicialMeta,
    caixaSaldoAnoAntMensal,
    lancFin2026,
    mesAlvo,
    caixaSaldoAnoCorrenteMensal,
  } = input;

  // 15 buckets REAL 2025 — number[12] cada
  const rReceitaPec    = agregaReceitaPec(lancFin2025, ANO_REAL);
  const rReceitaAgri   = agregaReceitaAgri(lancFin2025, ANO_REAL);
  const rOutrasRec     = agregaOutrasReceitas(lancFin2025, ANO_REAL);
  const rEntradasFin   = agregaEntradasFinanceiras(lancFin2025, ANO_REAL);
  const rCusteioPec    = agregaCusteioPecSemJuros(lancFin2025, ANO_REAL);
  const rCusteioAgri   = agregaCusteioAgriSemJuros(lancFin2025, ANO_REAL);
  const rJurosPec      = agregaJurosPec(lancFin2025, ANO_REAL);
  const rJurosAgri     = agregaJurosAgri(lancFin2025, ANO_REAL);
  const rInvPec        = agregaInvFazendaPec(lancFin2025, ANO_REAL);
  const rInvAgri       = agregaInvFazendaAgri(lancFin2025, ANO_REAL);
  const rRepoBov       = agregaInvBovinos(lancFin2025, ANO_REAL);
  const rAmortPec      = agregaAmortizacaoPec(lancFin2025, ANO_REAL);
  const rAmortAgri     = agregaAmortizacaoAgri(lancFin2025, ANO_REAL);
  const rDividendos    = agregaDividendos(lancFin2025, ANO_REAL);
  const rDeducoes      = agregaDeducoes(lancFin2025, ANO_REAL);

  // 15 buckets REAL 2026 (modo Fechamento) — number[12] cada.
  // Mesmas funções de agregação que REAL 2025; só muda o ano filtrado.
  const cReceitaPec    = lancFin2026 ? agregaReceitaPec(lancFin2026, ANO_CORRENTE)             : undefined;
  const cReceitaAgri   = lancFin2026 ? agregaReceitaAgri(lancFin2026, ANO_CORRENTE)            : undefined;
  const cOutrasRec     = lancFin2026 ? agregaOutrasReceitas(lancFin2026, ANO_CORRENTE)         : undefined;
  const cEntradasFin   = lancFin2026 ? agregaEntradasFinanceiras(lancFin2026, ANO_CORRENTE)    : undefined;
  const cCusteioPec    = lancFin2026 ? agregaCusteioPecSemJuros(lancFin2026, ANO_CORRENTE)     : undefined;
  const cCusteioAgri   = lancFin2026 ? agregaCusteioAgriSemJuros(lancFin2026, ANO_CORRENTE)    : undefined;
  const cJurosPec      = lancFin2026 ? agregaJurosPec(lancFin2026, ANO_CORRENTE)               : undefined;
  const cJurosAgri     = lancFin2026 ? agregaJurosAgri(lancFin2026, ANO_CORRENTE)              : undefined;
  const cInvPec        = lancFin2026 ? agregaInvFazendaPec(lancFin2026, ANO_CORRENTE)          : undefined;
  const cInvAgri       = lancFin2026 ? agregaInvFazendaAgri(lancFin2026, ANO_CORRENTE)         : undefined;
  const cRepoBov       = lancFin2026 ? agregaInvBovinos(lancFin2026, ANO_CORRENTE)             : undefined;
  const cAmortPec      = lancFin2026 ? agregaAmortizacaoPec(lancFin2026, ANO_CORRENTE)         : undefined;
  const cAmortAgri     = lancFin2026 ? agregaAmortizacaoAgri(lancFin2026, ANO_CORRENTE)        : undefined;
  const cDividendos    = lancFin2026 ? agregaDividendos(lancFin2026, ANO_CORRENTE)             : undefined;
  const cDeducoes      = lancFin2026 ? agregaDeducoes(lancFin2026, ANO_CORRENTE)               : undefined;

  // 15 buckets META 2026 — number[12] cada
  const mReceitaPec    = agregaReceitaPecMeta(gridMeta2026);
  const mReceitaAgri   = agregaReceitaAgriMeta(gridMeta2026);
  const mOutrasRec     = agregaOutrasReceitasMeta(gridMeta2026);
  const mEntradasFin   = agregaEntradasFinanceirasMeta(gridMeta2026);
  const mCusteioPec    = agregaCusteioPecSemJurosMeta(gridMeta2026);
  const mCusteioAgri   = agregaCusteioAgriSemJurosMeta(gridMeta2026);
  const mJurosPec      = agregaJurosPecMeta(gridMeta2026);
  const mJurosAgri     = agregaJurosAgriMeta(gridMeta2026);
  const mInvPec        = agregaInvFazendaPecMeta(gridMeta2026);
  const mInvAgri       = agregaInvFazendaAgriMeta(gridMeta2026);
  const mRepoBov       = agregaInvBovinosMeta(gridMeta2026);
  const mAmortPec      = agregaAmortizacaoPecMeta(gridMeta2026);
  const mAmortAgri     = agregaAmortizacaoAgriMeta(gridMeta2026);
  const mDividendos    = agregaDividendosMeta(gridMeta2026);
  const mDeducoes      = agregaDeducoesMeta(gridMeta2026);

  // Linhas individuais (escalares). mesAlvo proporciona Jan→mesAlvo
  // simétricamente em Real ano-1, Meta e Real ano corrente.
  const receitaPecuaria        = makeLinha('Receita Pecuária',        mReceitaPec,  rReceitaPec,  cReceitaPec,  mesAlvo);
  const receitaAgricultura     = makeLinha('Receita Agricultura',     mReceitaAgri, rReceitaAgri, cReceitaAgri, mesAlvo);
  const outrasReceitas         = makeLinha('Outras Receitas',         mOutrasRec,   rOutrasRec,   cOutrasRec,   mesAlvo);
  const entradasFinanceiras    = makeLinha('Entradas Financeiras',    mEntradasFin, rEntradasFin, cEntradasFin, mesAlvo);
  const custeioPecuaria        = makeLinha('Custeio Pecuária',        mCusteioPec,  rCusteioPec,  cCusteioPec,  mesAlvo);
  const custeioAgricultura     = makeLinha('Custeio Agricultura',     mCusteioAgri, rCusteioAgri, cCusteioAgri, mesAlvo);
  const jurosPecuaria          = makeLinha('Juros Pecuária',          mJurosPec,    rJurosPec,    cJurosPec,    mesAlvo);
  const jurosAgricultura       = makeLinha('Juros Agricultura',       mJurosAgri,   rJurosAgri,   cJurosAgri,   mesAlvo);
  const investimentoPecuaria   = makeLinha('Investimento Pecuária',   mInvPec,      rInvPec,      cInvPec,      mesAlvo);
  const investimentoAgricultura = makeLinha('Investimento Agricultura', mInvAgri,   rInvAgri,     cInvAgri,     mesAlvo);
  const reposicaoBovinos       = makeLinha('Reposição Bovinos',       mRepoBov,     rRepoBov,     cRepoBov,     mesAlvo);
  const amortizacaoPecuaria    = makeLinha('Amortização Pecuária',    mAmortPec,    rAmortPec,    cAmortPec,    mesAlvo);
  const amortizacaoAgricultura = makeLinha('Amortização Agricultura', mAmortAgri,   rAmortAgri,   cAmortAgri,   mesAlvo);
  const dividendos             = makeLinha('Dividendos',              mDividendos,  rDividendos,  cDividendos,  mesAlvo);
  const deducoesReceita        = makeLinha('Deduções de Receita',     mDeducoes,    rDeducoes,    cDeducoes,    mesAlvo);

  // Totais — soma de arrays mensais antes de reduzir a escalar
  const totalEntradasMetaArr = sumArrays(mReceitaPec, mReceitaAgri, mOutrasRec, mEntradasFin);
  const totalEntradasRealArr = sumArrays(rReceitaPec, rReceitaAgri, rOutrasRec, rEntradasFin);
  const totalSaidasMetaArr = sumArrays(
    mCusteioPec, mCusteioAgri, mJurosPec, mJurosAgri,
    mInvPec, mInvAgri, mRepoBov, mAmortPec, mAmortAgri,
    mDividendos, mDeducoes,
  );
  const totalSaidasRealArr = sumArrays(
    rCusteioPec, rCusteioAgri, rJurosPec, rJurosAgri,
    rInvPec, rInvAgri, rRepoBov, rAmortPec, rAmortAgri,
    rDividendos, rDeducoes,
  );

  const totalEntradasMeta = sumUpTo(totalEntradasMetaArr, mesAlvo);
  const totalEntradasReal = sumUpTo(totalEntradasRealArr, mesAlvo);
  const totalSaidasMeta = sumUpTo(totalSaidasMetaArr, mesAlvo);
  const totalSaidasReal = sumUpTo(totalSaidasRealArr, mesAlvo);

  // Totais REAL ano corrente — só calcula se lancFin2026 foi fornecido.
  const totalEntradasAnoCorrenteArr = lancFin2026
    ? sumArrays(cReceitaPec!, cReceitaAgri!, cOutrasRec!, cEntradasFin!)
    : undefined;
  const totalSaidasAnoCorrenteArr = lancFin2026
    ? sumArrays(
        cCusteioPec!, cCusteioAgri!, cJurosPec!, cJurosAgri!,
        cInvPec!, cInvAgri!, cRepoBov!, cAmortPec!, cAmortAgri!,
        cDividendos!, cDeducoes!,
      )
    : undefined;
  const totalEntradasAnoCorrente = totalEntradasAnoCorrenteArr ? sumUpTo(totalEntradasAnoCorrenteArr, mesAlvo) : undefined;
  const totalSaidasAnoCorrente = totalSaidasAnoCorrenteArr ? sumUpTo(totalSaidasAnoCorrenteArr, mesAlvo) : undefined;

  const totalEntradas: LinhaExecutiva = {
    label: 'Total Entradas',
    meta: totalEntradasMeta,
    real: totalEntradasReal,
    delta: calcDelta(totalEntradasMeta, totalEntradasReal),
    ...(totalEntradasAnoCorrente !== undefined && {
      realAnoCorrente: totalEntradasAnoCorrente,
      deltaAnoCorrente: calcDeltaAnoCorrente(totalEntradasAnoCorrente, totalEntradasMeta),
    }),
  };
  const totalSaidas: LinhaExecutiva = {
    label: 'Total Saídas',
    meta: totalSaidasMeta,
    real: totalSaidasReal,
    delta: calcDelta(totalSaidasMeta, totalSaidasReal),
    ...(totalSaidasAnoCorrente !== undefined && {
      realAnoCorrente: totalSaidasAnoCorrente,
      deltaAnoCorrente: calcDeltaAnoCorrente(totalSaidasAnoCorrente, totalSaidasMeta),
    }),
  };

  // Séries mensais — SALDO ACUMULADO (posição de caixa projetada).
  //
  // META 2026: parte do saldoInicialMeta (Dez/N-1, fonte oficial: tabela
  //   financeiro_saldos_bancarios_v2) e acumula (entradas - saídas) mês a mês.
  //   Reproduz a coluna "Saldo Acumulado" da tela Fluxo de Caixa META oficial.
  //   Futuro/projeção — não há saldo bancário registrado para META.
  //
  // REAL ano-1: saldo bancário consolidado oficial via PC-100
  //   (pc100.caixaIndicador.serieAnoAnt.slice(1)) — mesma fonte usada por
  //   LE Cap.1, ResumoTab, FechExecResumo, V2Home, AnaliseTrimestral e PC-100.
  //   Fonte única soberana — sem cálculo paralelo. NaN[12] quando indisponível.
  //
  // serieMetaLinear: mantido como array zerado por compatibilidade de tipo
  //   (BlocoResumoExecutivoData). Não é mais renderizado pelo componente —
  //   a linha tracejada "META linear" foi removida nesta revisão.
  const serieReal: number[] = caixaSaldoAnoAntMensal ?? Array(12).fill(NaN);
  const serieMeta = new Array(12).fill(0);
  let accMeta = saldoInicialMeta;
  for (let i = 0; i < 12; i++) {
    accMeta += (totalEntradasMetaArr[i] ?? 0) - (totalSaidasMetaArr[i] ?? 0);
    serieMeta[i] = accMeta;
  }
  const serieMetaLinear = new Array(12).fill(0);

  // serieRealAnoCorrente: prioriza fonte soberana PC-100 (saldo bancário
  // consolidado oficial via caixaSaldoAnoCorrenteMensal). Quando PC-100
  // indisponível, fallback ao acumulado puro de (E − S) sem saldo inicial
  // (compatibilidade — modo Planejamento ou contextos sem painel).
  const usandoPC100AnoCorrente = !!(
    caixaSaldoAnoCorrenteMensal && caixaSaldoAnoCorrenteMensal.length === 12
  );
  let serieRealAnoCorrente: number[] | undefined;
  if (usandoPC100AnoCorrente) {
    // Saldo absoluto — mesma semântica de serieReal (Real ano-1) e serieMeta.
    serieRealAnoCorrente = caixaSaldoAnoCorrenteMensal!;
  } else if (totalEntradasAnoCorrenteArr && totalSaidasAnoCorrenteArr) {
    // Fallback: acumulado puro (E−S) sem saldoInicial. Consumidor soma
    // saldoInicialMeta para obter saldo absoluto.
    serieRealAnoCorrente = new Array(12).fill(0);
    let accRC = 0;
    for (let i = 0; i < 12; i++) {
      accRC += (totalEntradasAnoCorrenteArr[i] ?? 0) - (totalSaidasAnoCorrenteArr[i] ?? 0);
      serieRealAnoCorrente[i] = accRC;
    }
  }

  // Saldo final de caixa no período (Jan→mesAlvo, ou Dez se ausente).
  // serieMeta já é saldo absoluto (acumulado a partir de saldoInicialMeta) —
  // basta indexar idxFinal.
  // serieRealAnoCorrente é absoluto quando vem do PC-100 (basta indexar);
  // é acumulado puro no fallback (somar saldoInicialMeta).
  const idxFinal = Math.max(0, Math.min(11, (mesAlvo ?? 12) - 1));
  const saldoCaixaFinalMeta = serieMeta[idxFinal] ?? 0;
  const saldoCaixaFinalReal = serieRealAnoCorrente
    ? (usandoPC100AnoCorrente
        ? (serieRealAnoCorrente[idxFinal] ?? 0)
        : saldoInicialMeta + (serieRealAnoCorrente[idxFinal] ?? 0))
    : undefined;

  // Conciliação: total absoluto bruto do grid vs soma dos 15 buckets META.
  // Detecta rows com macro/grupo que não caem em nenhum predicate oficial.
  // Sempre ano inteiro — conciliação é propriedade de classificação, não
  // de período (ignora mesAlvo).
  let totalBrutoMeta = 0;
  for (const g of gridMeta2026) {
    for (let i = 0; i < 12; i++) totalBrutoMeta += Math.abs(g.meses[i] || 0);
  }
  const somaBucketsMetaAnual = sum12(totalEntradasMetaArr) + sum12(totalSaidasMetaArr);
  const diferencaMeta = totalBrutoMeta - somaBucketsMetaAnual;
  const conciliado = Math.abs(diferencaMeta) < 1;

  return {
    receitaPecuaria,
    receitaAgricultura,
    outrasReceitas,
    entradasFinanceiras,
    totalEntradas,
    custeioPecuaria,
    custeioAgricultura,
    jurosPecuaria,
    jurosAgricultura,
    investimentoPecuaria,
    investimentoAgricultura,
    reposicaoBovinos,
    amortizacaoPecuaria,
    amortizacaoAgricultura,
    dividendos,
    deducoesReceita,
    totalSaidas,
    serieMeta,
    serieReal,
    serieMetaLinear,
    serieRealAnoCorrente,
    saldoCaixaFinalMeta,
    saldoCaixaFinalReal,
    conciliado,
    diferencaMeta,
  };
}
