/**
 * buildBlocoResumoExecutivo.ts
 *
 * Função pura que monta BlocoResumoExecutivoData a partir de:
 *  - metaRows: linhas brutas de planejamento_financeiro (1 linha por mês,
 *    com `mes` 1..12 e `valor_planejado`). Schema sem `tipo_operacao`:
 *    inferimos entrada/saída por `macro_custo`.
 *  - realRows: linhas de financeiro_lancamentos_v2 do ano-1 (ano_mes
 *    'YYYY-MM', `valor`, `tipo_operacao` presente).
 *
 * Filtros já foram aplicados no hook (cancelado=false, sem_mov_caixa=false,
 * status_transacao='realizado', cenario='realizado', ano_mes LIKE '2025-%').
 */

import type {
  BlocoResumoExecutivoData,
  LinhaExecutiva,
} from './blocoResumoExecutivoTypes';

export interface MetaRowExec {
  macro_custo: string | null;
  grupo_custo: string | null;
  escopo_negocio: string | null;
  subcentro: string | null;
  mes: number;
  valor_planejado: number;
}

export interface RealRowExec {
  macro_custo: string | null;
  grupo_custo: string | null;
  escopo_negocio: string | null;
  tipo_operacao: string | null;
  subcentro: string | null;
  valor: number;
  ano_mes: string;
}

interface FiltroBase {
  macro_custo: string | null;
  grupo_custo: string | null;
  escopo_negocio: string | null;
  subcentro: string | null;
}

type Filtro = (r: FiltroBase) => boolean;

interface LinhaSpec {
  key: keyof BlocoResumoExecutivoData;
  label: string;
  filtro: Filtro;
}

const MACROS_ENTRADA: ReadonlySet<string> = new Set([
  'Receita Operacional',
  'Entrada Financeira',
]);

const isEntradaMeta = (macro: string | null): boolean =>
  !!macro && MACROS_ENTRADA.has(macro);

const isEntradaReal = (tipo: string | null, macro: string | null): boolean => {
  if (tipo && tipo.startsWith('1')) return true;
  if (tipo && tipo.startsWith('2')) return false;
  return isEntradaMeta(macro);
};

const grupoTemJuros = (g: string | null): boolean => !!g && /juros/i.test(g);

const SPEC_ENTRADAS: LinhaSpec[] = [
  {
    key: 'receitaPecuaria',
    label: 'Receita Pecuária',
    filtro: r => r.macro_custo === 'Receita Operacional' && r.escopo_negocio === 'pecuaria',
  },
  {
    key: 'receitaAgricultura',
    label: 'Receita Agricultura',
    filtro: r => r.macro_custo === 'Receita Operacional' && r.escopo_negocio === 'agricultura',
  },
  {
    key: 'outrasReceitas',
    label: 'Outras Receitas',
    filtro: r => r.macro_custo === 'Receita Operacional' && r.escopo_negocio === 'administrativo',
  },
  {
    key: 'entradasFinanceiras',
    label: 'Entradas Financeiras',
    filtro: r => r.macro_custo === 'Entrada Financeira',
  },
];

const SPEC_SAIDAS: LinhaSpec[] = [
  {
    key: 'custeioPecuaria',
    label: 'Custeio Pecuária',
    filtro: r =>
      r.macro_custo === 'Custeio Produção' &&
      r.escopo_negocio === 'pecuaria' &&
      !grupoTemJuros(r.grupo_custo),
  },
  {
    key: 'custeioAgricultura',
    label: 'Custeio Agricultura',
    filtro: r =>
      r.macro_custo === 'Custeio Produção' &&
      r.escopo_negocio === 'agricultura' &&
      !grupoTemJuros(r.grupo_custo),
  },
  {
    key: 'jurosPecuaria',
    label: 'Juros Pecuária',
    filtro: r =>
      r.macro_custo === 'Custeio Produção' &&
      r.escopo_negocio === 'pecuaria' &&
      grupoTemJuros(r.grupo_custo),
  },
  {
    key: 'jurosAgricultura',
    label: 'Juros Agricultura',
    filtro: r =>
      r.macro_custo === 'Custeio Produção' &&
      r.escopo_negocio === 'agricultura' &&
      grupoTemJuros(r.grupo_custo),
  },
  {
    key: 'investimentoPecuaria',
    label: 'Investimento Pecuária',
    filtro: r => r.macro_custo === 'Investimento na Fazenda' && r.escopo_negocio === 'pecuaria',
  },
  {
    key: 'investimentoAgricultura',
    label: 'Investimento Agricultura',
    filtro: r => r.macro_custo === 'Investimento na Fazenda' && r.escopo_negocio === 'agricultura',
  },
  {
    key: 'reposicaoBovinos',
    label: 'Reposição Bovinos',
    filtro: r => r.macro_custo === 'Investimento em Bovinos',
  },
  {
    key: 'amortizacaoPecuaria',
    label: 'Amortização Pecuária',
    filtro: r =>
      r.macro_custo === 'Saída Financeira' && r.subcentro === 'Amortização Financiamento Pecuária',
  },
  {
    key: 'amortizacaoAgricultura',
    label: 'Amortização Agricultura',
    filtro: r =>
      r.macro_custo === 'Saída Financeira' &&
      r.subcentro === 'Amortização Financiamento Agricultura',
  },
  {
    key: 'dividendos',
    label: 'Dividendos',
    filtro: r => r.macro_custo === 'Dividendos',
  },
  {
    key: 'deducoesReceita',
    label: 'Deduções de Receita',
    filtro: r => r.macro_custo === 'Deduções de Receitas',
  },
];

function calcDelta(meta: number, real: number): number {
  if (meta <= 0 && real <= 0) return 0;
  return (meta - real) / (real || 1);
}

function calcLinha(
  spec: LinhaSpec,
  metaRows: MetaRowExec[],
  realRows: RealRowExec[],
): LinhaExecutiva {
  let meta = 0;
  for (const r of metaRows) {
    if (spec.filtro(r)) meta += Math.abs(Number(r.valor_planejado) || 0);
  }
  let real = 0;
  for (const r of realRows) {
    if (spec.filtro(r)) real += Math.abs(Number(r.valor) || 0);
  }
  return { label: spec.label, meta, real, delta: calcDelta(meta, real) };
}

export function buildBlocoResumoExecutivo(
  metaRows: MetaRowExec[],
  realRows: RealRowExec[],
): BlocoResumoExecutivoData {
  const linhasEntrada = SPEC_ENTRADAS.map(s => calcLinha(s, metaRows, realRows));
  const linhasSaida = SPEC_SAIDAS.map(s => calcLinha(s, metaRows, realRows));

  // Totais brutos por lado (todos os macros) — base para conciliação.
  let totalEntradasMeta = 0;
  let totalEntradasReal = 0;
  let totalSaidasMeta = 0;
  let totalSaidasReal = 0;
  for (const r of metaRows) {
    const v = Math.abs(Number(r.valor_planejado) || 0);
    if (isEntradaMeta(r.macro_custo)) totalEntradasMeta += v;
    else totalSaidasMeta += v;
  }
  for (const r of realRows) {
    const v = Math.abs(Number(r.valor) || 0);
    if (isEntradaReal(r.tipo_operacao, r.macro_custo)) totalEntradasReal += v;
    else totalSaidasReal += v;
  }

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

  // Séries mensais (saldo líquido entrada - saída).
  const serieMeta = new Array(12).fill(0);
  const serieReal = new Array(12).fill(0);
  for (const r of metaRows) {
    const i = (r.mes ?? 0) - 1;
    if (i < 0 || i > 11) continue;
    const v = Math.abs(Number(r.valor_planejado) || 0);
    if (isEntradaMeta(r.macro_custo)) serieMeta[i] += v;
    else serieMeta[i] -= v;
  }
  for (const r of realRows) {
    const mStr = (r.ano_mes || '').split('-')[1];
    const m = parseInt(mStr, 10);
    if (!m || m < 1 || m > 12) continue;
    const i = m - 1;
    const v = Math.abs(Number(r.valor) || 0);
    if (isEntradaReal(r.tipo_operacao, r.macro_custo)) serieReal[i] += v;
    else serieReal[i] -= v;
  }
  const liquidoAnualMeta = totalEntradasMeta - totalSaidasMeta;
  const serieMetaLinear = new Array(12).fill(liquidoAnualMeta / 12);

  // Conciliação: 4 linhas-entrada + 11 linhas-saída devem casar com totais brutos.
  const somaLinhasEntradasMeta = linhasEntrada.reduce((s, l) => s + l.meta, 0);
  const somaLinhasSaidasMeta = linhasSaida.reduce((s, l) => s + l.meta, 0);
  const diferencaMeta = somaLinhasEntradasMeta - totalEntradasMeta;
  const diferencaSaidasMeta = somaLinhasSaidasMeta - totalSaidasMeta;
  const conciliado = Math.abs(diferencaMeta) < 1 && Math.abs(diferencaSaidasMeta) < 1;

  const byKey: Record<string, LinhaExecutiva> = {};
  SPEC_ENTRADAS.forEach((s, i) => {
    byKey[s.key as string] = linhasEntrada[i];
  });
  SPEC_SAIDAS.forEach((s, i) => {
    byKey[s.key as string] = linhasSaida[i];
  });

  return {
    receitaPecuaria: byKey.receitaPecuaria,
    receitaAgricultura: byKey.receitaAgricultura,
    outrasReceitas: byKey.outrasReceitas,
    entradasFinanceiras: byKey.entradasFinanceiras,
    totalEntradas,
    custeioPecuaria: byKey.custeioPecuaria,
    custeioAgricultura: byKey.custeioAgricultura,
    jurosPecuaria: byKey.jurosPecuaria,
    jurosAgricultura: byKey.jurosAgricultura,
    investimentoPecuaria: byKey.investimentoPecuaria,
    investimentoAgricultura: byKey.investimentoAgricultura,
    reposicaoBovinos: byKey.reposicaoBovinos,
    amortizacaoPecuaria: byKey.amortizacaoPecuaria,
    amortizacaoAgricultura: byKey.amortizacaoAgricultura,
    dividendos: byKey.dividendos,
    deducoesReceita: byKey.deducoesReceita,
    totalSaidas,
    serieMeta,
    serieReal,
    serieMetaLinear,
    conciliado,
    diferencaMeta,
  };
}
