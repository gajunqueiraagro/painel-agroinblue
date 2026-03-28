/**
 * Classificação financeira centralizada — FONTE ÚNICA DE VERDADE.
 *
 * Toda classificação é baseada exclusivamente nos campos estruturais:
 * - tipo_operacao (Entrada/Saída)
 * - macro_custo
 * - escopo_negocio
 * - centro_custo / subcentro (apenas para aportes)
 *
 * NÃO é permitido classificar por nome exibido, texto livre ou heurística.
 *
 * REGRAS:
 * - status_transacao = "Conciliado"
 * - data_base = data_pagamento
 * - Entradas = tipo_operacao 1*
 * - Saídas = tipo_operacao 2*
 * - Transferências (3*) são excluídas
 */

// ---------------------------------------------------------------------------
// Interface mínima para classificação
// ---------------------------------------------------------------------------

export interface LancamentoClassificavel {
  tipo_operacao: string | null;
  macro_custo: string | null;
  escopo_negocio: string | null;
  grupo_custo?: string | null;
  centro_custo?: string | null;
  subcentro?: string | null;
  valor: number;
  status_transacao?: string | null;
  data_pagamento?: string | null;
}

// ---------------------------------------------------------------------------
// Normalizações
// ---------------------------------------------------------------------------

const norm = (v: string | null | undefined) => (v || '').toLowerCase().trim();

const normTipo = (v: string | null | undefined): string =>
  norm(v).replace(/[\s\-–—]/g, '');

// ---------------------------------------------------------------------------
// Status & Tipo Operação
// ---------------------------------------------------------------------------

/** Lançamento conciliado? */
export const isConciliado = (l: LancamentoClassificavel): boolean =>
  norm(l.status_transacao) === 'conciliado';

/** É entrada (tipo_operacao 1*) */
export const isEntrada = (l: LancamentoClassificavel): boolean => {
  const t = normTipo(l.tipo_operacao);
  return t.startsWith('1') || t.includes('entrada');
};

/** É saída (tipo_operacao 2*) */
export const isSaida = (l: LancamentoClassificavel): boolean => {
  const t = normTipo(l.tipo_operacao);
  return t.startsWith('2') || t.includes('saida') || t.includes('saída');
};

// ---------------------------------------------------------------------------
// Escopo (pecuária / agricultura / outras)
// ---------------------------------------------------------------------------

export type Escopo = 'pec' | 'agri' | 'outras';

/**
 * Determina escopo (pecuária vs agricultura) baseado nos campos estruturais.
 *
 * REGRA (auditoria 2026-03-28):
 * 1. Prioridade: centro_custo / subcentro / grupo_custo — se contém "agri" → agricultura
 * 2. Fallback: escopo_negocio (campo frequentemente incorreto nos dados importados)
 *
 * O campo escopo_negocio está como "pecuaria" em TODOS os lançamentos importados,
 * portanto NÃO pode ser a regra principal para distinguir Pec vs Agri.
 */
export function getEscopo(l: LancamentoClassificavel): Escopo {
  // 1. Verificar campos estruturais (fonte confiável)
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);
  const grupo = norm(l.grupo_custo);

  const hasAgri = centro.includes('agri') || sub.startsWith('agri/') || sub.startsWith('agri\\') || grupo.includes('agri');
  if (hasAgri) return 'agri';

  const hasPec = centro.includes('pec') || sub.startsWith('pec/') || sub.startsWith('pec\\') || grupo.includes('pecuári') || grupo.includes('pecuaria');
  if (hasPec) return 'pec';

  // 2. Fallback: escopo_negocio
  const e = norm(l.escopo_negocio);
  if (e.includes('agricul') || e.includes('agri')) return 'agri';
  if (e.includes('pecuári') || e.includes('pecuaria') || e.includes('pec')) return 'pec';

  return 'outras';
}

// ---------------------------------------------------------------------------
// Macro helpers
// ---------------------------------------------------------------------------

const normMacro = (l: LancamentoClassificavel) => norm(l.macro_custo);

function isAporte(l: LancamentoClassificavel): boolean {
  const macro = normMacro(l);
  const grupo = norm(l.grupo_custo);
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);
  return macro.includes('aporte')
    || grupo.includes('aporte')
    || centro.includes('aporte')
    || sub.includes('aporte');
}

// ---------------------------------------------------------------------------
// ENTRADAS — Categorias do Dashboard
// ---------------------------------------------------------------------------

export type CategoriaEntrada =
  | 'Receitas Pecuárias'
  | 'Receitas Agrícolas'
  | 'Outras Receitas'
  | 'Aportes ou Outros'
  | 'Financiamentos Pecuária'
  | 'Financiamentos Agricultura';

export const CATEGORIAS_ENTRADA: CategoriaEntrada[] = [
  'Receitas Pecuárias',
  'Receitas Agrícolas',
  'Outras Receitas',
  'Aportes ou Outros',
  'Financiamentos Pecuária',
  'Financiamentos Agricultura',
];

/**
 * Classifica uma ENTRADA para exibição no Dashboard / drill-down.
 *
 * Receitas (macro_custo = "receitas"):
 *   → grupo_custo "Rendimentos e Outros" → Outras Receitas
 *   → Receitas Pecuárias / Agrícolas / Outras (por escopo)
 *
 * Outras Entradas (macro_custo ≠ "receitas"):
 *   → Aportes ou Outros (se macro/grupo/centro/subcentro contém "aporte")
 *   → Financiamentos Pecuária / Agricultura (por escopo)
 *
 * Anomalias (macro_custo inesperado como entrada):
 *   → Aportes ou Outros (fallback explícito, marcado para revisão)
 */
export function classificarEntrada(l: LancamentoClassificavel): CategoriaEntrada {
  const macro = normMacro(l);
  const escopo = getEscopo(l);
  const grupo = norm(l.grupo_custo);

  // Receitas: macro_custo = "receitas"
  if (macro === 'receitas') {
    // "Rendimentos e Outros" → Outras Receitas (não é receita operacional pecuária/agri)
    if (grupo.includes('rendimentos')) return 'Outras Receitas';
    if (escopo === 'agri') return 'Receitas Agrícolas';
    if (escopo === 'pec') return 'Receitas Pecuárias';
    return 'Outras Receitas';
  }

  // Outras Entradas: macro_custo ≠ "receitas"
  if (isAporte(l)) return 'Aportes ou Outros';
  if (escopo === 'agri') return 'Financiamentos Agricultura';

  // Anomalia: entrada com macro_custo inesperado (ex: "Custeio Produtivo", "Dividendos")
  // Fallback explícito: agrupa em Aportes ou Outros para não distorcer receitas
  if (macro && macro !== 'outras entradas financeiras') {
    return 'Aportes ou Outros';
  }

  return 'Financiamentos Pecuária';
}

// ---------------------------------------------------------------------------
// SAÍDAS — Categorias do Dashboard
// ---------------------------------------------------------------------------

export type CategoriaSaida =
  | 'Custeio Pecuário'
  | 'Investimentos Pecuária'
  | 'Custeio Agrícola'
  | 'Investimentos Agricultura'
  | 'Reposição de Bovinos'
  | 'Despesas com Reposição'
  | 'Dedução de Receitas'
  | 'Amortizações Pecuária'
  | 'Amortizações Agricultura'
  | 'Dividendos';

export const CATEGORIAS_SAIDA: CategoriaSaida[] = [
  'Custeio Pecuário',
  'Investimentos Pecuária',
  'Custeio Agrícola',
  'Investimentos Agricultura',
  'Reposição de Bovinos',
  'Despesas com Reposição',
  'Dedução de Receitas',
  'Amortizações Pecuária',
  'Amortizações Agricultura',
  'Dividendos',
];

/**
 * Classifica uma SAÍDA para exibição no Dashboard / drill-down.
 *
 * Desembolso Produtivo (macro_custo = custeio/investimento):
 *   → Custeio Pecuário/Agrícola (por escopo)
 *   → Investimentos Pecuária/Agricultura (por escopo)
 *
 * Outras Saídas (macro_custo ≠ custeio e ≠ investimento):
 *   → Reposição de Bovinos
 *   → Despesas com Reposição
 *   → Dedução de Receitas
 *   → Amortizações Pecuária / Agricultura (por escopo)
 *   → Dividendos
 */
export function classificarSaida(l: LancamentoClassificavel): CategoriaSaida {
  const macro = normMacro(l);
  const escopo = getEscopo(l);

  // Desembolso Produtivo
  if (macro === 'custeio produtivo') {
    return escopo === 'agri' ? 'Custeio Agrícola' : 'Custeio Pecuário';
  }
  if (macro === 'investimento na fazenda') {
    return escopo === 'agri' ? 'Investimentos Agricultura' : 'Investimentos Pecuária';
  }

  // Outras Saídas
  if (macro === 'investimento em bovinos') return 'Reposição de Bovinos';
  if (macro === 'despesas com reposição' || macro === 'despesas com reposicao') return 'Despesas com Reposição';
  if (macro === 'dedução de receitas' || macro === 'deducao de receitas') return 'Dedução de Receitas';
  if (macro === 'amortizações financeiras' || macro === 'amortizacoes financeiras') {
    return escopo === 'agri' ? 'Amortizações Agricultura' : 'Amortizações Pecuária';
  }
  if (macro === 'dividendos') return 'Dividendos';

  // Fallback: classificar pelo escopo como custeio
  return escopo === 'agri' ? 'Custeio Agrícola' : 'Custeio Pecuário';
}

// ---------------------------------------------------------------------------
// FLUXO DE CAIXA — Categorias agregadas
// ---------------------------------------------------------------------------

export type CategoriaFluxoEntrada = 'receitas' | 'captacao' | 'aportes';

/** Classifica entrada para o Fluxo de Caixa (agrupamento mais alto) */
export function classificarEntradaFluxo(l: LancamentoClassificavel): CategoriaFluxoEntrada {
  const macro = normMacro(l);
  if (macro === 'receitas') return 'receitas';
  if (isAporte(l)) return 'aportes';
  return 'captacao';
}

export type CategoriaFluxoSaida = 'deducao' | 'desembolso' | 'reposicao' | 'despesasReposicao' | 'amortizacoes' | 'dividendos';

/** Classifica saída para o Fluxo de Caixa (agrupamento mais alto) */
export function classificarSaidaFluxo(l: LancamentoClassificavel): CategoriaFluxoSaida {
  const macro = normMacro(l);
  if (macro === 'dedução de receitas' || macro === 'deducao de receitas') return 'deducao';
  if (macro === 'investimento em bovinos') return 'reposicao';
  if (macro === 'despesas com reposição' || macro === 'despesas com reposicao') return 'despesasReposicao';
  if (macro === 'amortizações financeiras' || macro === 'amortizacoes financeiras') return 'amortizacoes';
  if (macro === 'dividendos') return 'dividendos';
  return 'desembolso';
}

// ---------------------------------------------------------------------------
// DESEMBOLSO PRODUTIVO — usado nos indicadores econômicos
// ---------------------------------------------------------------------------

/** É Desembolso Produtivo (Custeio Produtivo + Investimento na Fazenda) */
export function isDesembolsoProdutivo(l: LancamentoClassificavel): boolean {
  const macro = normMacro(l);
  return macro === 'custeio produtivo' || macro === 'investimento na fazenda';
}

/** É Receita operacional (macro_custo = "receitas") */
export function isReceita(l: LancamentoClassificavel): boolean {
  return normMacro(l) === 'receitas';
}

// ---------------------------------------------------------------------------
// DATA HELPERS
// ---------------------------------------------------------------------------

export function datePagtoAnoMes(l: LancamentoClassificavel): string | null {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return l.data_pagamento.substring(0, 7);
}

export function datePagtoMes(l: LancamentoClassificavel): number | null {
  if (!l.data_pagamento || l.data_pagamento.length < 7) return null;
  return Number(l.data_pagamento.substring(5, 7));
}

export function datePagtoAno(l: LancamentoClassificavel): number | null {
  if (!l.data_pagamento || l.data_pagamento.length < 4) return null;
  return Number(l.data_pagamento.substring(0, 4));
}

/** Soma absoluta de valores */
export const somaAbs = (lancs: LancamentoClassificavel[]) =>
  lancs.reduce((s, l) => s + Math.abs(l.valor), 0);
