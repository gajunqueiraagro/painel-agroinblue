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
  ano_mes?: string | null;
  /** PR-FLUXO-SEM-CLASSIFICACAO: usado pelo helper isSemClassificacao. */
  plano_conta_id?: string | null;
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

  // Agricultura: centro_custo contém EXATAMENTE "agricultura" (não substring parcial)
  if (
    centro === 'agricultura' ||
    centro.startsWith('agricultura ') ||
    sub.startsWith('agricultura/') || sub.startsWith('agricultura\\') ||
    grupo === 'agricultura'
  ) return 'agri';

  // Pecuária: centro_custo/grupo_custo contém referências a pecuária
  // ou qualquer outro centro_custo que não seja explicitamente agricultura
  // → default é pecuária (NÃO agricultura)
  return 'pec';
}

// ---------------------------------------------------------------------------
// Macro helpers
// ---------------------------------------------------------------------------

const normMacro = (l: LancamentoClassificavel) => norm(l.macro_custo);

/**
 * Saída genuinamente sem classificação: nenhum campo do plano preenchido.
 * Separa o balde "Sem Classificação" no Fluxo em vez de cair em Pecuária.
 */
export function isSemClassificacao(l: LancamentoClassificavel): boolean {
  const vazio = (v: unknown) => !v || String(v).trim() === '';
  return (
    vazio(l.macro_custo) &&
    vazio(l.grupo_custo) &&
    vazio(l.centro_custo) &&
    vazio(l.subcentro) &&
    (l.plano_conta_id === null || l.plano_conta_id === undefined)
  );
}

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
  if (m === 'tributos') return 'tributos';
  return m;
}

/**
 * Detecta se é financiamento / capital de terceiros.
 * Baseado EXCLUSIVAMENTE na classificação estrutural do plano de contas:
 *   - centro_custo = "Financiamento"
 *   - subcentro = "Retorno de Empréstimos" (centro Capital, mas não é aporte)
 */
function isFinanciamento(l: LancamentoClassificavel): boolean {
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);
  return centro === 'financiamento'
    || sub === 'retorno de empréstimos' || sub === 'retorno de emprestimos';
}

/**
 * Detecta se é aporte pessoal / capital próprio.
 * Baseado EXCLUSIVAMENTE na classificação estrutural do plano de contas:
 *   - subcentro = "Aporte Pessoal" (centro Capital, grupo Entradas de Capital)
 */
function isAporte(l: LancamentoClassificavel): boolean {
  const sub = norm(l.subcentro);
  return sub === 'aporte pessoal';
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
  | 'Tributos'
  | 'Dividendos'
  | 'Sem Classificação';

export const CATEGORIAS_SAIDA: CategoriaSaida[] = [
  'Desemb. Produtivo Pec.',
  'Desemb. Produtivo Agri.',
  'Reposição Bovinos',
  'Dedução de Receitas',
  'Amortizações Fin. Pec.',
  'Amortizações Fin. Agri.',
  'Tributos',
  'Dividendos',
  'Sem Classificação',
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

  // Sem classificação — não mascarar em Pecuária
  if (isSemClassificacao(l)) return 'Sem Classificação';

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

  // Tributos — caminho próprio, NÃO reaproveita Desembolso/Dividendos/Amortizações.
  if (macro === 'tributos') return 'Tributos';

  // Fallback: tudo que não é agricultura vai para pecuária
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

export type CategoriaFluxoSaida = 'deducao' | 'desembolso' | 'reposicao' | 'amortizacoes' | 'tributos' | 'dividendos' | 'sem_classificacao';

/** Classifica saída para o Fluxo de Caixa (agrupamento mais alto) */
export function classificarSaidaFluxo(l: LancamentoClassificavel): CategoriaFluxoSaida {
  const macro = canonicalMacro(l);
  const centro = norm(l.centro_custo);
  const sub = norm(l.subcentro);

  if (isSemClassificacao(l)) return 'sem_classificacao';

  if (macro === 'dedução de receitas') return 'deducao';
  if (centro.includes('dedução') || centro.includes('deducao') || centro.includes('deduções')) return 'deducao';

  if (macro === 'dividendos' || centro === 'dividendos' || sub.includes('dividendo')) return 'dividendos';

  if (macro === 'investimento em bovinos' || centro.includes('reposição') || centro.includes('reposicao')) return 'reposicao';

  if (macro === 'amortizações financeiras') return 'amortizacoes';

  if (macro === 'tributos') return 'tributos';

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

/**
 * É Custeio Produção Pecuária = Custo Fixo Pec + Custo Variável Pec.
 *
 * Filtra por grupo_custo exato — fonte oficial do plano de contas (mesma regra
 * usada em useAnaliseTrimestral.ts:175-177). Filtro por macro_custo é insuficiente
 * porque "Custeio Produtivo" inclui também Juros Pec, Custo Fixo Agri e Custo
 * Variável Agri (e getEscopo só pega Agri quando centro_custo é literalmente
 * 'agricultura' — falha para 'Soja', 'Cana', etc.).
 *
 * NÃO inclui: Juros Financ. Pec., Custos Agri, Investimentos, Amortizações,
 *             Bovinos, Dividendos, Deduções.
 *
 * Usado como numerador em: Custeio Produção Pec., Custo Produtivo R$/@,
 * Custo Cab. R$/cab., Margem por @.
 */
export function isCusteioProducaoPecuaria(l: LancamentoClassificavel): boolean {
  return l.grupo_custo === 'Custo Fixo Pecuária'
      || l.grupo_custo === 'Custo Variável Pecuária';
}

/** Filtro estrito por `grupo_custo='Custo Variável Pecuária'`. Marco 1.1.E. */
export function isCustoVariavelPecuaria(l: LancamentoClassificavel): boolean {
  return l.grupo_custo === 'Custo Variável Pecuária';
}

/** Filtro estrito por `grupo_custo='Custo Fixo Pecuária'`. Marco 1.1.E. */
export function isCustoFixoPecuaria(l: LancamentoClassificavel): boolean {
  return l.grupo_custo === 'Custo Fixo Pecuária';
}

/** É Receita operacional (macro_custo = "receitas") */
export function isReceita(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'receitas';
}

// ---------------------------------------------------------------------------
// PC-100 / Fluxo de Caixa Executivo — classificadores oficiais por linha.
// Nomenclatura segue plano de contas. Filtros literais por grupo_custo
// (NUNCA por escopo_negocio) — mesmo padrão de isCusteioProducaoPecuaria.
// ---------------------------------------------------------------------------

/**
 * É Custeio Produção Agricultura = Custo Fixo Agri + Custo Variável Agri.
 * Espelha isCusteioProducaoPecuaria — sem incluir Juros.
 */
export function isCusteioProducaoAgricultura(l: LancamentoClassificavel): boolean {
  return l.grupo_custo === 'Custo Fixo Agricultura'
      || l.grupo_custo === 'Custo Variável Agricultura';
}

/** Juros Pecuária — entra em "Custeio Pec com Juros" e em "Desembolso Pec". */
export function isJurosPecuaria(l: LancamentoClassificavel): boolean {
  return l.grupo_custo === 'Juros Pecuária'
      || l.grupo_custo === 'Juros de Financiamento Pecuária';
}

/** Juros Agricultura — entra em "Custeio Agri com Juros" e em "Desembolso Agri". */
export function isJurosAgricultura(l: LancamentoClassificavel): boolean {
  return l.grupo_custo === 'Juros Agricultura'
      || l.grupo_custo === 'Juros de Financiamento Agricultura';
}

/** Macro Investimento na Fazenda (sem distinção de escopo). */
export function isInvestimentoFazenda(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'investimento na fazenda';
}

/** Investimento na Fazenda — Pecuária via grupo_custo literal oficial. */
export function isInvestimentoFazendaPecuaria(l: LancamentoClassificavel): boolean {
  return isInvestimentoFazenda(l) && l.grupo_custo === 'Investimento Pecuária';
}

/** Investimento na Fazenda — Agricultura via grupo_custo literal oficial. */
export function isInvestimentoFazendaAgricultura(l: LancamentoClassificavel): boolean {
  return isInvestimentoFazenda(l) && l.grupo_custo === 'Investimento Agricultura';
}

/** Investimento em Bovinos (linha "Reposição"/"Investimento em Bovinos" do PC-100). */
export function isReposicaoBovinos(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'investimento em bovinos';
}

/**
 * Amortização Financeira — APENAS saldo principal.
 * Juros financeiros NÃO entram aqui — caem em isJurosPecuaria/isJurosAgricultura
 * (grupo_custo='Juros Pecuária'/'Juros Agricultura' dentro do macro Custeio Produtivo).
 */
export function isAmortizacao(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'amortizações financeiras';
}

/**
 * Dividendo / Retirada — mesma linha por enquanto (macro 'dividendos' OU
 * centro_custo='Dividendos' legado). Refinar depois se houver separação oficial.
 */
export function isDividendoOuRetirada(l: LancamentoClassificavel): boolean {
  if (canonicalMacro(l) === 'dividendos') return true;
  return norm(l.centro_custo) === 'dividendos';
}

/**
 * Dedução de Receitas — predicado literal oficial.
 * Igualdade exata em canonicalMacro; sem heurística por contains/substring.
 */
export function isDeducaoReceitas(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'dedução de receitas';
}

/**
 * Tributos e Impostos — predicado literal oficial.
 *
 * SEPARADO de isDeducaoReceitas de proposito: deducao e AJUSTE DE RECEITA;
 * tributo e saida patrimonial e fiscal (ITR, taxas, IRPF, IRPJ). Somar os dois
 * numa linha so esconderia R$ 1,5 mi atras de um rotulo que diz outra coisa.
 *
 * canonicalMacro ja mapeia macro_custo='Tributos' -> 'tributos' (ver o mapa acima):
 * o literal nao foi adivinhado. Igualdade exata, sem heuristica por contains.
 *
 * Medido no proto em 2026-08-21: 171 lancamentos realizados nao cancelados,
 * R$ 1.511.524, TODOS com escopo_negocio='administrativo' e tipo_operacao='2-Saidas'.
 * Como nenhum e pecuaria ou agricultura, criar a categoria NAO move custo por hectare
 * nem custo por arroba.
 */
export function isTributos(l: LancamentoClassificavel): boolean {
  return canonicalMacro(l) === 'tributos';
}

// ---------------------------------------------------------------------------
// Bloco 1 Executivo — predicates atômicos por macro/escopo.
//
// Nenhum desses predicates checa isEntrada/isSaida. O sentido (entrada vs
// saída) é garantido upstream pelo adapter de fonte (makeRealizadoSource
// vs makeRealizadoSourceEntrada). Em META não há sentido — predicates
// classificam puramente por macro + escopo.
// ---------------------------------------------------------------------------

/**
 * Grupos oficiais de ENTRADA do plano de contas (financeiro_plano_contas).
 * Igualdade literal — mesmo padrão de isCusteioProducaoPecuaria.
 * NUNCA usar contains/substring/keyword: o texto do subcentro não é
 * fonte de classificação, o grupo_custo é.
 *
 * grupo_custo é escrito pelo trigger trg_resolve_classificacao_plano a
 * partir do plano; o front não grava esse campo.
 *
 * PR-CLASSIF-ENTRADA-GRUPO-01 — substituiu a antiga getEscopoReceita, que
 * varria grupo+centro+subcentro atrás de 'soja', 'milho', 'abates', 'fêmeas'.
 * As SAÍDAS já classificavam por grupo literal; as entradas eram a última
 * heurística por keyword. Medido no proto em 21/08/2026: existem só QUATRO
 * grupos de entrada, sem grafias divergentes, e keyword × literal deram
 * resultado IDÊNTICO em todas as combinações existentes — a troca não move
 * valor, só tira o texto livre do caminho da classificação.
 */
export const GRUPO_RECEITA_PECUARIA  = 'Receita Pecuária';
export const GRUPO_RECEITA_AGRICOLA  = 'Receita Agrícola';
export const GRUPO_OUTRAS_RECEITAS   = 'Outras Receitas';
export const GRUPO_ENTRADAS_CAPITAL  = 'Entradas de Capital';

export const isReceitaPecuaria = (l: LancamentoClassificavel): boolean =>
  l.grupo_custo === GRUPO_RECEITA_PECUARIA;

export const isReceitaAgricola = (l: LancamentoClassificavel): boolean =>
  l.grupo_custo === GRUPO_RECEITA_AGRICOLA;

export const isOutrasReceitas = (l: LancamentoClassificavel): boolean =>
  l.grupo_custo === GRUPO_OUTRAS_RECEITAS;

/**
 * Entrada financeira (Aportes + Captação Pec + Captação Agri).
 * canonicalMacro normaliza tanto "Entrada Financeira" quanto
 * "Outras Entradas Financeiras" para 'outras entradas financeiras'.
 */
export const isEntradaFinanceira = (l: LancamentoClassificavel): boolean =>
  canonicalMacro(l) === 'outras entradas financeiras';

/**
 * Entrada que não casa com nenhum grupo oficial de entrada.
 *
 * PRÉ-CONDIÇÃO: o caller já garantiu que é entrada (o adapter
 * makeRealizadoSourceEntrada filtra isEntrada). Este predicate apenas
 * detecta o resíduo.
 *
 * Existe para que nenhuma entrada desapareça do total sem aviso.
 *
 * Medido no proto em 21/08/2026: 3 lançamentos, todos do NJ, por DUAS causas
 * distintas — por isso o predicate testa ausência dos quatro grupos oficiais
 * em vez de procurar um caso específico:
 *   - 04/07/2026 R$ 2.513,27 — grupo 'Custo Fixo Pecuária' em 1-Entradas
 *     (rescisão lançada como entrada): classificado, mas em grupo de saída.
 *   - 05/08/2026 R$ 4.007,42 e 07/08/2026 R$ 1.650,00 — Pix de OFX com
 *     macro_custo e grupo_custo nulos: nunca enriquecidos.
 * Nenhum dos três mudou de lugar com este PR: os predicates antigos exigiam
 * isReceita(l) (canonicalMacro === 'receitas'), que já dava false para macro
 * 'Custeio Produção' ou null. Eram invisíveis antes; agora aparecem.
 * O mecanismo não tem piso — a linha é permanente, não um patch.
 */
export const isEntradaNaoClassificada = (l: LancamentoClassificavel): boolean =>
  !isReceitaPecuaria(l) &&
  !isReceitaAgricola(l) &&
  !isOutrasReceitas(l) &&
  !isEntradaFinanceira(l);

// Para Amortização, o plano de contas oficial coloca a distinção Pec/Agri
// no subcentro (não no grupo_custo, que é genérico 'Amortizações').
// Filtro por subcentro literal, mesmo princípio: nome do plano de contas oficial.
export const isAmortizacaoPecuaria = (l: LancamentoClassificavel): boolean =>
  isAmortizacao(l) && l.subcentro === 'Amortização Financiamento Pecuária';

export const isAmortizacaoAgricultura = (l: LancamentoClassificavel): boolean =>
  isAmortizacao(l) && l.subcentro === 'Amortização Financiamento Agricultura';

// ---------------------------------------------------------------------------
// CLASSIFICADOR SOBERANO OFICIAL — categoria única por saída
//
// Mutualidade exclusiva via cascata explícita. Ordem oficial aprovada:
//   1. deducao
//   2. dividendos
//   3. amortizacoes
//   4. reposicao (bovinos)
//   5. desembolso (fallback)
//
// Apenas predicados literais oficiais (igualdade exata em canonicalMacro
// e/ou centro_custo). NUNCA usar contains/substring/heurísticas implícitas.
//
// IMPORTANTE: este classificador NÃO substitui classificarSaidaFluxo nesta
// fase. É infraestrutura preparatória — nenhum consumidor está conectado
// ainda. O comportamento atual do sistema permanece inalterado.
// ---------------------------------------------------------------------------

export type CategoriaSaidaSoberana =
  | 'deducao'
  | 'dividendos'
  | 'amortizacoes'
  | 'reposicao'
  | 'desembolso';

/**
 * Classificador soberano oficial de saída financeira.
 *
 * Pré-condição: o caller deve ter validado que o lançamento é saída
 * (`isSaida(l)`); a função apenas categoriza. Lançamentos que não
 * satisfazem nenhum predicado caem em 'desembolso' (default literal).
 */
export function classificarSaidaFinanceiraOficial(
  l: LancamentoClassificavel,
): CategoriaSaidaSoberana {
  if (isDeducaoReceitas(l))   return 'deducao';
  if (isDividendoOuRetirada(l)) return 'dividendos';
  if (isAmortizacao(l))        return 'amortizacoes';
  if (isReposicaoBovinos(l))   return 'reposicao';
  return 'desembolso';
}

// ---------------------------------------------------------------------------
// DATA HELPERS
// ---------------------------------------------------------------------------

export function datePagtoAnoMes(l: LancamentoClassificavel): string | null {
  if (l.data_pagamento && l.data_pagamento.length >= 7) return l.data_pagamento.substring(0, 7);
  if (l.ano_mes) return l.ano_mes;
  return null;
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

/**
 * Ordem oficial dos centros de custo do grupo "Receita Pecuária".
 * Fonte: plano de contas (financeiro_plano_contas, ordem_exibicao 1010-1140).
 * REGRA: qualquer breakdown que apresente centros de Receita Pecuária
 * DEVE usar esta constante para ordenação. Centros fora desta lista
 * caem ao final em ordem alfabética com console.warn — não silenciar.
 */
export const ORDEM_CENTROS_RECEITA_PECUARIA = [
  'Abates',
  'Venda Peso Vivo',
  'Arrendamento',
  'Venda Geral',
  'Venda Insumos',
  'Venda Ativos',
] as const;

export type CentroReceitaPecuaria = (typeof ORDEM_CENTROS_RECEITA_PECUARIA)[number];

// ─── Ordens oficiais dos demais buckets do BlocoResumoExecutivo ───────
// Usadas pelo modal LinhaExecutivaExecutivoModal via ordemCentrosOficial.
// Quando um centro vier do banco fora dessa ordem, o builder cai em
// alfabético e dispara banner "Centros fora da ordem oficial" (não trava).

export const ORDEM_CENTROS_RECEITA_AGRICULTURA = [
  'Venda Produção', 'Venda Ativos',
] as const;

export const ORDEM_CENTROS_OUTRAS_RECEITAS = [
  'Financeiro', 'Outros',
] as const;

export const ORDEM_CENTROS_ENTRADAS_FINANCEIRAS = [
  'Capital', 'Financiamento',
] as const;

export const ORDEM_CENTROS_CUSTEIO_PECUARIA = [
  'Mão de Obra', 'Administração', 'Manutenção Fazenda',
  'Máquinas', 'Impostos', 'Outros',
  'Nutrição', 'Sanidade', 'Reprodução', 'Pastagem',
  'Identificação', 'Comercial', 'Transferências',
] as const;

export const ORDEM_CENTROS_CUSTEIO_AGRICULTURA = [
  'Mão de Obra', 'Administração', 'Manutenção Fazenda',
  'Máquinas', 'Impostos',
  'Insumos', 'Operações', 'Logística', 'Financeiro',
] as const;

export const ORDEM_CENTROS_JUROS_PECUARIA = [
  'Juros de Financiamento Pecuária',
] as const;

export const ORDEM_CENTROS_JUROS_AGRICULTURA = [
  'Juros de Financiamento Agricultura',
] as const;

export const ORDEM_CENTROS_INVESTIMENTO_PECUARIA = [
  'Infraestrutura', 'Máquinas', 'Pastagem', 'RH',
] as const;

export const ORDEM_CENTROS_INVESTIMENTO_AGRICULTURA = [
  'Infraestrutura', 'Máquinas', 'Solo', 'RH',
] as const;

export const ORDEM_CENTROS_REPOSICAO_BOVINOS = [
  'Compra de Bovinos',
] as const;

export const ORDEM_CENTROS_AMORTIZACAO_PECUARIA = [
  'Pecuária',
] as const;

export const ORDEM_CENTROS_AMORTIZACAO_AGRICULTURA = [
  'Agricultura',
] as const;

export const ORDEM_CENTROS_DIVIDENDOS = [
  'Dividendos',
] as const;

export const ORDEM_CENTROS_DEDUCOES_RECEITA = [
  'Ajustes', 'Impostos',
] as const;
