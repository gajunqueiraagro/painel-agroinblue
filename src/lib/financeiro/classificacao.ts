/**
 * Classificação financeira centralizada — FONTE ÚNICA DE VERDADE.
 *
 * Toda classificação é baseada exclusivamente nos campos estruturais:
 * - tipo_operacao (Entrada/Saída)
 * - macro_custo
 * - centro_custo / subcentro / grupo_custo
 *
 * REGRA CRÍTICA: NÃO usar escopo_negocio — derivar tudo de centro_custo.
 *
 * REGRAS:
 * - status_transacao = "realizado" (único que entra no financeiro real)
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

/** Lançamento realizado (status_transacao = 'realizado')? */
export const isRealizado = (l: LancamentoClassificavel): boolean =>
  norm(l.status_transacao) === 'realizado';

/** @deprecated Use isRealizado. Alias mantido para compatibilidade. */
export const isConciliado = isRealizado;

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
// Derivado EXCLUSIVAMENTE de centro_custo / subcentro / grupo_custo
// ---------------------------------------------------------------------------

export type Escopo = 'pec' | 'agri' | 'outras';

/**
 * Determina escopo baseado EXCLUSIVAMENTE nos campos estruturais.
 * NÃO usa escopo_negocio (campo frequentemente incorreto nos dados importados).
 *
 * Regra: verificar centro_custo, subcentro e grupo_custo por keywords.
 */
export function getEscopo(l: LancamentoClassificavel): Escopo {
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);
  const grupo = norm(l.grupo_custo);

  // Agricultura: centro_custo contém "agri" ou subcentro começa com "agri/"
  const hasAgri =
    centro.includes('agri') ||
    sub.startsWith('agri/') || sub.startsWith('agri\\') ||
    grupo.includes('agri');
  if (hasAgri) return 'agri';

  // Pecuária: centro_custo contém "pecuári" / "pecuaria" / "pec"
  const hasPec =
    centro.includes('pecuári') || centro.includes('pecuaria') || centro.includes('pec') ||
    sub.startsWith('pec/') || sub.startsWith('pec\\') ||
    grupo.includes('pecuári') || grupo.includes('pecuaria');
  if (hasPec) return 'pec';

  return 'outras';
}

// ---------------------------------------------------------------------------
// Macro helpers
// ---------------------------------------------------------------------------

const normMacro = (l: LancamentoClassificavel) => norm(l.macro_custo);

/** Normalize macro_custo to canonical groups (handles both old and new plano de contas names) */
function canonicalMacro(l: LancamentoClassificavel): string {
  const m = normMacro(l);
  // Old names → keep as-is (already handled below)
  // New names → map to old canonical
  if (m === 'receita operacional') return 'receitas';
  if (m === 'entrada financeira' || m === 'outras entradas financeiras') return 'outras entradas financeiras';
  if (m === 'custeio produção' || m === 'custeio produtivo') return 'custeio produtivo';
  if (m === 'investimento' || m === 'investimento na fazenda') return 'investimento na fazenda';
  if (m === 'investimento em bovinos') return 'investimento em bovinos';
  if (m === 'deduções de receitas' || (m.includes('dedu') && m.includes('receita'))) return 'dedução de receitas';
  if (m === 'distribuição' || m === 'dividendos') return 'dividendos';
  if (m === 'saída financeira' || m.includes('amortiza')) return 'amortizações financeiras';
  if (m === 'transferências' || m === 'entre contas') return 'transferencias';
  return m;
}

function isAporte(l: LancamentoClassificavel): boolean {
  const macro = normMacro(l);
  const grupo = norm(l.grupo_custo);
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);
  return macro.includes('aporte')
    || grupo.includes('aporte') || grupo.includes('entradas de capital')
    || centro.includes('aporte')
    || sub.includes('aporte');
}

// ---------------------------------------------------------------------------
// ENTRADAS — Categorias do Dashboard
// ---------------------------------------------------------------------------

export type CategoriaEntrada =
  | 'Receitas Pecuárias'
  | 'Receitas Agricultura'
  | 'Outras Receitas'
  | 'Aportes Pessoais'
  | 'Captação Financ. Pec.'
  | 'Captação Financ. Agri.';

export const CATEGORIAS_ENTRADA: CategoriaEntrada[] = [
  'Receitas Pecuárias',
  'Receitas Agricultura',
  'Outras Receitas',
  'Aportes Pessoais',
  'Captação Financ. Pec.',
  'Captação Financ. Agri.',
];

/**
 * Classifica uma ENTRADA para exibição no Dashboard / drill-down.
 *
 * Receitas (macro_custo = "receitas"):
 *   → centro_custo contém Pecuária → Receitas Pecuárias
 *   → centro_custo contém Agri → Receitas Agricultura
 *   → else → Outras Receitas
 *
 * Outras Entradas (macro_custo ≠ "receitas"):
 *   → centro_custo contém Aporte → Aportes Pessoais
 *   → centro_custo contém Agri → Captação Financ. Agri.
 *   → centro_custo contém Pec ou Financiamento Pec → Captação Financ. Pec.
 *   → fallback → Aportes Pessoais
 */
export function classificarEntrada(l: LancamentoClassificavel): CategoriaEntrada {
  const macro = canonicalMacro(l);
  const escopo = getEscopo(l);
  const grupo = norm(l.grupo_custo);

  // Receitas: macro_custo = "receitas"
  if (macro === 'receitas') {
    if (grupo.includes('rendimentos') || grupo.includes('outras receitas')) return 'Outras Receitas';
    if (escopo === 'agri' || grupo.includes('agri')) return 'Receitas Agricultura';
    if (escopo === 'pec' || grupo.includes('pecuári') || grupo.includes('pecuaria')) return 'Receitas Pecuárias';
    return 'Outras Receitas';
  }

  // Outras Entradas: macro_custo ≠ "receitas"
  if (isAporte(l)) return 'Aportes Pessoais';

  // Financiamentos/Captação — derivar do centro_custo
  if (escopo === 'agri') return 'Captação Financ. Agri.';
  if (escopo === 'pec') return 'Captação Financ. Pec.';

  // Anomalias: entrada com macro inesperado → fallback Aportes Pessoais
  return 'Aportes Pessoais';
}

// ---------------------------------------------------------------------------
// SAÍDAS — Categorias do Dashboard
// ---------------------------------------------------------------------------

export type CategoriaSaida =
  | 'Desemb. Produtivo Pec.'
  | 'Desemb. Produtivo Agri.'
  | 'Reposição Bovinos'
  | 'Dedução de Receitas'
  | 'Amortizações Fin. Pec.'
  | 'Amortizações Fin. Agri.'
  | 'Dividendos';

export const CATEGORIAS_SAIDA: CategoriaSaida[] = [
  'Desemb. Produtivo Pec.',
  'Desemb. Produtivo Agri.',
  'Reposição Bovinos',
  'Dedução de Receitas',
  'Amortizações Fin. Pec.',
  'Amortizações Fin. Agri.',
  'Dividendos',
];

/**
 * Classifica uma SAÍDA para exibição no Dashboard / drill-down.
 *
 * Desembolso Produtivo (macro = custeio produtivo ou investimento na fazenda):
 *   → centro_custo contém Agri → Desemb. Produtivo Agri.
 *   → else → Desemb. Produtivo Pec.
 *
 * Reposição Bovinos:
 *   → macro = "investimento em bovinos" OU centro_custo contém "reposição"
 *
 * Dedução de Receitas:
 *   → macro contém "dedução" + "receita"
 *
 * Amortizações:
 *   → macro = "amortizações financeiras" → Pec/Agri por centro_custo
 *
 * Dividendos:
 *   → macro = "dividendos" OU centro_custo = "dividendos"
 */
export function classificarSaida(l: LancamentoClassificavel): CategoriaSaida {
  const macro = canonicalMacro(l);
  const escopo = getEscopo(l);
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);

  // Dedução de Receitas
  if (macro === 'dedução de receitas') return 'Dedução de Receitas';
  if (centro.includes('dedução') || centro.includes('deducao') || centro.includes('deduções')) return 'Dedução de Receitas';

  // Dividendos
  if (macro === 'dividendos' || centro === 'dividendos' || sub.includes('dividendo')) return 'Dividendos';

  // Reposição Bovinos
  if (macro === 'investimento em bovinos' || centro.includes('reposição') || centro.includes('reposicao')) return 'Reposição Bovinos';

  // Amortizações Financeiras
  if (macro === 'amortizações financeiras') {
    return escopo === 'agri' ? 'Amortizações Fin. Agri.' : 'Amortizações Fin. Pec.';
  }

  // Desembolso Produtivo (Custeio Produtivo + Investimento na Fazenda)
  if (macro === 'custeio produtivo' || macro === 'investimento na fazenda') {
    return escopo === 'agri' ? 'Desemb. Produtivo Agri.' : 'Desemb. Produtivo Pec.';
  }

  // Fallback: classificar pelo escopo como desembolso
  return escopo === 'agri' ? 'Desemb. Produtivo Agri.' : 'Desemb. Produtivo Pec.';
}

// ---------------------------------------------------------------------------
// FLUXO DE CAIXA — Categorias agregadas
// ---------------------------------------------------------------------------

export type CategoriaFluxoEntrada = 'receitas' | 'captacao' | 'aportes';

/** Classifica entrada para o Fluxo de Caixa (agrupamento mais alto) */
export function classificarEntradaFluxo(l: LancamentoClassificavel): CategoriaFluxoEntrada {
  const macro = canonicalMacro(l);
  if (macro === 'receitas') return 'receitas';
  if (isAporte(l)) return 'aportes';
  if (macro && macro !== 'outras entradas financeiras') return 'aportes';
  return 'captacao';
}

export type CategoriaFluxoSaida = 'deducao' | 'desembolso' | 'reposicao' | 'amortizacoes' | 'dividendos';

/** Classifica saída para o Fluxo de Caixa (agrupamento mais alto) */
export function classificarSaidaFluxo(l: LancamentoClassificavel): CategoriaFluxoSaida {
  const macro = canonicalMacro(l);
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);

  if (macro === 'dedução de receitas') return 'deducao';
  if (centro.includes('dedução') || centro.includes('deducao') || centro.includes('deduções')) return 'deducao';

  if (macro === 'dividendos' || centro === 'dividendos' || sub.includes('dividendo')) return 'dividendos';

  if (macro === 'investimento em bovinos' || centro.includes('reposição') || centro.includes('reposicao')) return 'reposicao';

  if (macro === 'amortizações financeiras') return 'amortizacoes';

  return 'desembolso';
}

// ---------------------------------------------------------------------------
// DESEMBOLSO PRODUTIVO — usado nos indicadores econômicos
// ---------------------------------------------------------------------------

/** É Desembolso Produtivo (Custeio Produtivo + Investimento na Fazenda) */
export function isDesembolsoProdutivo(l: LancamentoClassificavel): boolean {
  const macro = canonicalMacro(l);
  return macro === 'custeio produtivo' || macro === 'investimento na fazenda';
}

/** É Receita operacional (macro_custo = "receitas") */
export function isReceita(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'receitas';
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
