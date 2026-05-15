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
}

const ANO_REAL = 2025;

// ─── Helpers de composição puros (sem classificação) ─────────────────

const sum12 = (arr: number[]): number => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += arr[i] ?? 0;
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

const makeLinha = (label: string, metaArr: number[], realArr: number[]): LinhaExecutiva => {
  const meta = sum12(metaArr);
  const real = sum12(realArr);
  return { label, meta, real, delta: calcDelta(meta, real) };
};

// ─── Builder ─────────────────────────────────────────────────────────

export function buildBlocoResumoExecutivo(input: BuildBlocoInput): BlocoResumoExecutivoData {
  const { lancFin2025, gridMeta2026, saldoInicialMeta } = input;

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

  // Linhas individuais (escalares)
  const receitaPecuaria        = makeLinha('Receita Pecuária',        mReceitaPec,  rReceitaPec);
  const receitaAgricultura     = makeLinha('Receita Agricultura',     mReceitaAgri, rReceitaAgri);
  const outrasReceitas         = makeLinha('Outras Receitas',         mOutrasRec,   rOutrasRec);
  const entradasFinanceiras    = makeLinha('Entradas Financeiras',    mEntradasFin, rEntradasFin);
  const custeioPecuaria        = makeLinha('Custeio Pecuária',        mCusteioPec,  rCusteioPec);
  const custeioAgricultura     = makeLinha('Custeio Agricultura',     mCusteioAgri, rCusteioAgri);
  const jurosPecuaria          = makeLinha('Juros Pecuária',          mJurosPec,    rJurosPec);
  const jurosAgricultura       = makeLinha('Juros Agricultura',       mJurosAgri,   rJurosAgri);
  const investimentoPecuaria   = makeLinha('Investimento Pecuária',   mInvPec,      rInvPec);
  const investimentoAgricultura = makeLinha('Investimento Agricultura', mInvAgri,   rInvAgri);
  const reposicaoBovinos       = makeLinha('Reposição Bovinos',       mRepoBov,     rRepoBov);
  const amortizacaoPecuaria    = makeLinha('Amortização Pecuária',    mAmortPec,    rAmortPec);
  const amortizacaoAgricultura = makeLinha('Amortização Agricultura', mAmortAgri,   rAmortAgri);
  const dividendos             = makeLinha('Dividendos',              mDividendos,  rDividendos);
  const deducoesReceita        = makeLinha('Deduções de Receita',     mDeducoes,    rDeducoes);

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

  const totalEntradasMeta = sum12(totalEntradasMetaArr);
  const totalEntradasReal = sum12(totalEntradasRealArr);
  const totalSaidasMeta = sum12(totalSaidasMetaArr);
  const totalSaidasReal = sum12(totalSaidasRealArr);

  const totalEntradas: LinhaExecutiva = {
    label: 'Total Entradas',
    meta: totalEntradasMeta,
    real: totalEntradasReal,
    delta: calcDelta(totalEntradasMeta, totalEntradasReal),
  };
  const totalSaidas: LinhaExecutiva = {
    label: 'Total Saídas',
    meta: totalSaidasMeta,
    real: totalSaidasReal,
    delta: calcDelta(totalSaidasMeta, totalSaidasReal),
  };

  // Séries mensais — SALDO ACUMULADO (posição de caixa projetada).
  //
  // META 2026: parte do saldoInicialMeta (Dez/N-1, fonte oficial: tabela
  //   financeiro_saldos_bancarios_v2) e acumula (entradas - saídas) mês a mês.
  //   Reproduz a coluna "Saldo Acumulado" da tela Fluxo de Caixa META oficial.
  //
  // Real 2025: ainda não temos saldo inicial Dez/2024 disponível neste builder.
  //   A série representa "fluxo acumulado do ano" a partir de zero, não a
  //   posição absoluta de caixa. Comparação visual com META fica enviesada por
  //   offset, mas tendência relativa (slope mensal) permanece honesta.
  //   Backlog: expor saldoInicialReal para alinhar bases.
  //
  // serieMetaLinear: mantido como array zerado por compatibilidade de tipo
  //   (BlocoResumoExecutivoData). Não é mais renderizado pelo componente —
  //   a linha tracejada "META linear" foi removida nesta revisão.
  const serieMeta = new Array(12).fill(0);
  const serieReal = new Array(12).fill(0);
  let accMeta = saldoInicialMeta;
  let accReal = 0;
  for (let i = 0; i < 12; i++) {
    accMeta += (totalEntradasMetaArr[i] ?? 0) - (totalSaidasMetaArr[i] ?? 0);
    accReal += (totalEntradasRealArr[i] ?? 0) - (totalSaidasRealArr[i] ?? 0);
    serieMeta[i] = accMeta;
    serieReal[i] = accReal;
  }
  const serieMetaLinear = new Array(12).fill(0);

  // Conciliação: total absoluto bruto do grid vs soma dos 15 buckets META.
  // Detecta rows com macro/grupo que não caem em nenhum predicate oficial.
  let totalBrutoMeta = 0;
  for (const g of gridMeta2026) {
    for (let i = 0; i < 12; i++) totalBrutoMeta += Math.abs(g.meses[i] || 0);
  }
  const somaBucketsMeta = totalEntradasMeta + totalSaidasMeta;
  const diferencaMeta = totalBrutoMeta - somaBucketsMeta;
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
    conciliado,
    diferencaMeta,
  };
}
