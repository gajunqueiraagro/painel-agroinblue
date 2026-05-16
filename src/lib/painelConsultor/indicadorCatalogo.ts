/**
 * Catálogo oficial de fonte por indicador — Painel do Consultor
 *
 * Cada indicador tem definição formal de origem para cada cenário.
 * Regra: Meta NUNCA faz fallback para Realizado.
 */

export type FonteTipo = 'fechamento' | 'operacional' | 'view_sql' | 'calculado' | 'financeiro_v2' | 'meta' | 'sem_fonte';
export type FonteStatus = 'fechada' | 'prevista' | 'operacional' | 'sem_fonte';

export interface FonteIndicador {
  fonte_tipo: FonteTipo;
  fonte_tabela: string;
  fonte_campo: string;
  regra_calculo: string;
  regra_prioridade: string;
  tela_origem: string;       // route path to navigate
  tela_label: string;        // friendly label
  permite_fallback: boolean;
  observacao?: string;
}

export interface IndicadorMeta {
  id: string;
  nome: string;
  aba: string;
  bloco: string;
  realizado: FonteIndicador;
  previsto: FonteIndicador;
}

const SEM_PREVISTO: FonteIndicador = {
  fonte_tipo: 'sem_fonte',
  fonte_tabela: '',
  fonte_campo: '',
  regra_calculo: 'Sem base meta configurada',
  regra_prioridade: 'Não há fonte meta — exibir vazio',
  tela_origem: '',
  tela_label: '',
  permite_fallback: false,
  observacao: 'Meta ainda não implementada para este indicador',
};

// ─── Previsto Zootécnico (fonte oficial: vw_zoot_fazenda_mensal cenario=meta) ───
const FONTE_ZOOT_VIEW_PREVISTO: FonteIndicador = {
  fonte_tipo: 'view_sql',
  fonte_tabela: 'vw_zoot_fazenda_mensal',
  fonte_campo: 'cenario = meta',
  regra_calculo: 'Dados de projeção/meta da view zootécnica oficial',
  regra_prioridade: '1. Meta oficial da view; 2. Vazio se não houver',
  tela_origem: '/fluxo-anual',
  tela_label: 'Fluxo Anual / Meta',
  permite_fallback: false,
  observacao: 'Mesma fonte usada no Fluxo Anual — cenario meta',
};

const FONTE_REBANHO_PREVISTO: FonteIndicador = {
  ...FONTE_ZOOT_VIEW_PREVISTO,
  fonte_campo: 'cabecas_inicio, cabecas_final, entradas, saidas (cenario=meta)',
  regra_calculo: 'Rebanho previsto da view zootécnica oficial',
};

const FONTE_PESO_PREVISTO: FonteIndicador = {
  fonte_tipo: 'meta',
  fonte_tabela: 'valor_rebanho_meta_validada',
  fonte_campo: 'cabecas, peso_medio_kg, arrobas_total',
  regra_calculo: 'Peso lido do snapshot validado na tela Valor do Rebanho META',
  regra_prioridade: '1. Snapshot validado META; 2. View zootécnica meta (fallback)',
  tela_origem: '/meta-preco',
  tela_label: 'Valor do Rebanho META',
  permite_fallback: true,
  observacao: 'Quando validado, peso vem da mesma tabela de snapshot do valor do rebanho',
};

// ─── Rebanho ───
const FONTE_REBANHO_REAL: FonteIndicador = {
  fonte_tipo: 'fechamento',
  fonte_tabela: 'fechamento_pastos + fechamento_pasto_itens',
  fonte_campo: 'quantidade (soma por pasto)',
  regra_calculo: 'Soma de cabeças por categoria no fechamento do mês',
  regra_prioridade: '1. Fechamento oficial; 2. Saldo por movimentações',
  tela_origem: '/fechamento',
  tela_label: 'Fechamento de Pastos',
  permite_fallback: true,
  observacao: 'Fechamento sempre vence',
};

// ─── Peso ───
const FONTE_PESO_REAL: FonteIndicador = {
  fonte_tipo: 'fechamento',
  fonte_tabela: 'valor_rebanho_realizado_validado',
  fonte_campo: 'cabecas, peso_medio_kg, arrobas_total',
  regra_calculo: 'Peso lido do snapshot validado na tela Valor do Rebanho',
  regra_prioridade: '1. Snapshot oficial validado; 2. Fechamento de pastos (fallback)',
  tela_origem: '/valor-rebanho',
  tela_label: 'Valor do Rebanho',
  permite_fallback: true,
  observacao: 'Peso e valor vêm da mesma tabela de snapshot validado',
};

// ─── Valor do Rebanho (Realizado) ───
const FONTE_VALOR_REB_REAL: FonteIndicador = {
  fonte_tipo: 'fechamento',
  fonte_tabela: 'valor_rebanho_realizado_validado',
  fonte_campo: 'valor_total, valor_cabeca_medio, preco_arroba_medio',
  regra_calculo: 'Leitura direta do snapshot validado na tela Valor do Rebanho',
  regra_prioridade: '1. Snapshot oficial validado; 2. vazio se não houver validação',
  tela_origem: '/valor-rebanho',
  tela_label: 'Valor do Rebanho',
  permite_fallback: false,
  observacao: 'Fonte única auditável — persistida ao clicar Salvar e Fechar',
};

const FONTE_VALOR_REB_META_BASE: FonteIndicador = {
  fonte_tipo: 'meta',
  fonte_tabela: 'valor_rebanho_meta_validada',
  fonte_campo: 'valor_total, valor_cabeca_medio, preco_arroba_medio',
  regra_calculo: 'Leitura direta do snapshot validado na tela Valor do Rebanho META',
  regra_prioridade: '1. Snapshot oficial validado; 2. vazio se não houver validação',
  tela_origem: '/meta-preco',
  tela_label: 'Valor do Rebanho META',
  permite_fallback: false,
  observacao: 'Fonte única auditável — persistida ao clicar VALIDAR',
};

const FONTE_VALOR_REB_META_INICIAL: FonteIndicador = {
  ...FONTE_VALOR_REB_META_BASE,
  regra_calculo: 'Jan = Dez do ano anterior (realizado); Fev+ = valor_total validado do mês anterior',
};

const FONTE_VALOR_REB_META_FINAL: FonteIndicador = {
  ...FONTE_VALOR_REB_META_BASE,
  regra_calculo: 'Snapshot oficial do valor total validado no mês corrente',
};

const FONTE_VALOR_CAB_META_FINAL: FonteIndicador = {
  ...FONTE_VALOR_REB_META_BASE,
  regra_calculo: 'Snapshot oficial do valor/cab validado no mês corrente',
};

const FONTE_VALOR_ARR_META_FINAL: FonteIndicador = {
  ...FONTE_VALOR_REB_META_BASE,
  regra_calculo: 'Snapshot oficial do valor/@ validado no mês corrente',
};

// ─── Desempenho / Produção ───
const FONTE_ZOOT_VIEW_REAL: FonteIndicador = {
  fonte_tipo: 'view_sql',
  fonte_tabela: 'vw_zoot_fazenda_mensal',
  fonte_campo: 'gmd, peso_medio_final, ua_media, lotacao',
  regra_calculo: 'View oficial zootécnica mensal com hierarquia de fechamento',
  regra_prioridade: '1. Fechamento; 2. Fallback por movimentação; 3. Projeção meta',
  tela_origem: '/indicadores',
  tela_label: 'Indicadores Zootécnicos',
  permite_fallback: true,
};

// ─── Financeiro META (planejamento_financeiro) ───
const FONTE_META_PLANEJAMENTO: FonteIndicador = {
  fonte_tipo: 'meta',
  fonte_tabela: 'planejamento_financeiro',
  fonte_campo: 'valor_planejado por macro_custo/grupo_custo/mes',
  regra_calculo: 'Agregado por agregarGridMetaPainelConsultor no PainelConsultorTab. '
    + 'Entradas = macro Receita Operacional + Entrada Financeira. '
    + 'Saídas = macro Custeio Produção + Deduções + Dividendos + Investimentos + Saída Financeira. '
    + 'recPec = grupo Receita Pecuária (apenas Receita Operacional). '
    + 'ATENÇÃO: Entrada Financeira entra apenas em entradas/resCaixa, não em recPec nem DRE futura.',
  regra_prioridade: '1. planejamento_financeiro buildGrid com auto lines; 2. vazio se grid vazio',
  tela_origem: '/planejamento-financeiro',
  tela_label: 'Planejamento Financeiro',
  permite_fallback: false,
  observacao: 'Implementado na Fase 1C. DRE futura (Fase 1D) usará apenas macro Receita Operacional.',
};

// ─── Financeiro Caixa ───
const FONTE_FIN_CAIXA_REAL: FonteIndicador = {
  fonte_tipo: 'financeiro_v2',
  fonte_tabela: 'financeiro_lancamentos_v2',
  fonte_campo: 'valor (filtrado por status conciliado)',
  regra_calculo: 'Soma de lançamentos conciliados por data de pagamento',
  regra_prioridade: '1. Lançamentos conciliados no caixa',
  tela_origem: '/financeiro-v2',
  tela_label: 'Financeiro V2',
  permite_fallback: false,
};

// ─── Saldo Bancário Consolidado (estoque) ───
// Fonte oficial do indicador "Saldo Final de Caixa" do PC-100.
// Mesma cadeia já consumida por LE Cap.1, ResumoTab, FechExecResumo,
// V2Home, AnaliseTrimestral via pc100.caixaIndicador.
export const FONTE_SALDO_BANCARIO_V2: FonteIndicador = {
  fonte_tipo: 'financeiro_v2',
  fonte_tabela: 'financeiro_saldos_bancarios_v2',
  fonte_campo: 'saldo_final',
  regra_calculo: 'SUM(saldo_final) por (cliente_id, ano_mes) — estoque, foto do fim do mês',
  regra_prioridade: '1. Saldo bancário consolidado oficial via pc100.caixaIndicador',
  tela_origem: '/financeiro-v2',
  tela_label: 'Financeiro V2 / Saldos',
  permite_fallback: false,
  observacao: 'Estoque (foto do fim do mês). Não acumula. Aba "acumulado" do PC-100 deliberadamente não consome esta fonte.',
};

// ─── Financeiro Soberano (Auditoria) — agregadores literais 1T26 ───
// Mesma fonte de FONTE_FIN_CAIXA_REAL (financeiro_lancamentos_v2 realizado),
// porém classificação por predicados literais oficiais
// (src/lib/financeiro/classificacao.ts + src/lib/painelConsultor/agregadosFinanceiros.ts).
// Usado pelo bloco visual "Financeiro Soberano (Auditoria)" do PainelConsultorTab.
const FONTE_FIN_SOBERANO_REAL: FonteIndicador = {
  fonte_tipo: 'financeiro_v2',
  fonte_tabela: 'financeiro_lancamentos_v2',
  fonte_campo: 'valor (status_transacao=realizado, cancelado=false, sem_movimentacao_caixa=false)',
  regra_calculo: 'Σ Math.abs(valor) por mês de data_pagamento, filtrado por predicados literais '
    + '(isCusteioProducaoPecuaria, isJurosPecuaria, isInvestimentoFazendaPecuaria etc.) — agregadosFinanceiros.ts',
  regra_prioridade: '1. Predicados literais oficiais por grupo_custo / macro_custo',
  tela_origem: '/v2/painel-consultor',
  tela_label: 'PC-100 / Financeiro Soberano',
  permite_fallback: false,
  observacao: 'Etapa 2C — bloco de auditoria visual. Caixa disponível (saldo) ainda em Etapa 2D.',
};

const FONTE_FIN_SOBERANO_META: FonteIndicador = {
  fonte_tipo: 'meta',
  fonte_tabela: 'planejamento_financeiro (via _finSoberano META)',
  fonte_campo: 'serieMeta dos indicadores soberanos (PCD)',
  regra_calculo: 'Σ Math.abs(grid.meses[i]) por mês — wrappers agrega*Meta(grid) usam os MESMOS predicados literais do Realizado (classificacao.ts: isCusteioProducaoPecuaria, isJurosPecuaria, isInvestimentoFazendaPecuaria etc.). PCD popula serieMeta no IndicadorFinanceiroShape via _finSoberano (gridMetaExterno).',
  regra_prioridade: '1. Grid META do planejamento_financeiro do ano corrente; 2. vazio (zeros) se cliente sem META configurada',
  tela_origem: '/planejamento-financeiro',
  tela_label: 'Planejamento Financeiro / META',
  permite_fallback: false,
  observacao: 'Camada A (PC-100 META). UMA regra de classificação para Realizado e Meta — predicates literais em classificacao.ts.',
};

// ─── Endividamento (Realizado, Global do cliente) ───
// Fonte: RPC fn_endividamento_mensal — agrega financiamento_parcelas JOIN financiamentos.
// NUNCA usa financeiro_lancamentos_v2 para este bloco.
const FONTE_ENDIVIDAMENTO_REAL: FonteIndicador = {
  fonte_tipo: 'calculado',
  fonte_tabela: 'financiamento_parcelas + financiamentos (via fn_endividamento_mensal)',
  fonte_campo: 'divida_inicial / captacao / amortizacao / juros / divida_final por mes (split pec/agri)',
  regra_calculo: 'D1 split por tipo_financiamento; D2 captação = (valor_total − valor_entrada) por data_contrato; '
    + 'D3 dívida = principal em aberto; D4 quitados participam do histórico; D5 fonte parcelas JOIN financiamentos; '
    + 'D6 cálculo server-side (não recalcular no front).',
  regra_prioridade: '1. RPC fn_endividamento_mensal (consolidado do cliente)',
  tela_origem: '/v2/painel-consultor',
  tela_label: 'PC-100 / Endividamento',
  permite_fallback: false,
  observacao: 'Sempre GLOBAL do cliente, mesmo com fazenda específica selecionada.',
};

// ─── Financeiro Competência ───
const FONTE_FIN_COMP_REAL: FonteIndicador = {
  fonte_tipo: 'financeiro_v2',
  fonte_tabela: 'financeiro_lancamentos_v2 + valor_rebanho_fechamento',
  fonte_campo: 'valor por competência + variação rebanho',
  regra_calculo: 'Receita - Dedução - Desembolso produtivo',
  regra_prioridade: '1. Lançamentos conciliados por competência',
  tela_origem: '/financeiro-v2',
  tela_label: 'Financeiro V2',
  permite_fallback: false,
};

// ─── Áreas — bloco "Uso do Solo" (C4.1 / C4.2) ───────────────────────────
// Bloco aparece em AMBOS os tabs (Realizado e Meta), com fontes distintas.
// Estrutural/estoque mensal — NÃO acumula em viewMode='periodo'.
// SEM fallback entre as duas fontes (regra soberana).
const FONTE_AREA_META: FonteIndicador = {
  fonte_tipo: 'meta',
  fonte_tabela: 'planejamento_area_meta',
  fonte_campo: 'area_pecuaria_ha, area_agricultura_ha, area_total_ha (GENERATED)',
  regra_calculo: 'Estoque mensal; NÃO acumula em viewMode periodo. Global = soma das fazendas pec do cliente; Individual = valor da fazenda.',
  regra_prioridade: '1. planejamento_area_meta para o ano corrente; 2. null se mês não cadastrado',
  tela_origem: '/v2?section=areas-meta',
  tela_label: 'Áreas META',
  permite_fallback: false,
  observacao: 'Fonte estrutural mensal (área é estoque). Não acumula em período. Sem fallback ao realizado.',
};

const FONTE_AREA_REAL: FonteIndicador = {
  fonte_tipo: 'fechamento',
  fonte_tabela: 'fechamento_area_snapshot (via useSnapshotAreaAnual)',
  fonte_campo: 'area_pecuaria_ha, area_agricultura_ha, area_produtiva_ha',
  regra_calculo: 'Estoque mensal; NÃO acumula em viewMode periodo. Global = soma dos snapshots das fazendas pec ativas; Individual = snapshot da fazenda.',
  regra_prioridade: '1. Snapshot oficial P1 (fechamento de pastos); 2. null se mês sem snapshot',
  tela_origem: '/fechamento',
  tela_label: 'Fechamento de Pastos',
  permite_fallback: false,
  observacao: 'Snapshot oficial de área (fechamento P1). Sem fallback à META.',
};

/**
 * Catálogo completo — indexado por indicador_id.
 * Usado para tooltip, auditoria e regra de cenário.
 */
export const CATALOGO_INDICADORES: Record<string, IndicadorMeta> = {
  // ─── Mensal > Rebanho ───
  'reb_inicial': { id: 'reb_inicial', nome: 'Reb. inicial (cab)', aba: 'mensal', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'reb_final': { id: 'reb_final', nome: 'Reb. final (cab)', aba: 'mensal', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'entradas_cab': { id: 'entradas_cab', nome: 'Entradas (cab)', aba: 'mensal', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'saidas_cab': { id: 'saidas_cab', nome: 'Saídas (cab)', aba: 'mensal', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },

  // ─── Mensal > Peso ───
  'peso_ini_kg': { id: 'peso_ini_kg', nome: 'Peso ini. (kg)', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },
  'peso_fin_kg': { id: 'peso_fin_kg', nome: 'Peso final (kg)', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },
  'peso_fin_cab_kg': { id: 'peso_fin_cab_kg', nome: 'Peso fin. cab (kg)', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },
  'peso_ini_arr': { id: 'peso_ini_arr', nome: 'Peso ini. (@)', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },
  'peso_fin_arr': { id: 'peso_fin_arr', nome: 'Peso final (@)', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },
  'peso_med_ini': { id: 'peso_med_ini', nome: 'Peso méd. ini.', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },
  'peso_med_fin': { id: 'peso_med_fin', nome: 'Peso méd. final', aba: 'mensal', bloco: 'Peso', realizado: FONTE_PESO_REAL, previsto: FONTE_PESO_PREVISTO },

  // ─── Mensal > Valor do Rebanho ───
  'valor_reb_ini': { id: 'valor_reb_ini', nome: 'Valor reb. inicial', aba: 'mensal', bloco: 'Valor do Rebanho', realizado: FONTE_VALOR_REB_REAL, previsto: FONTE_VALOR_REB_META_INICIAL },
  'valor_reb_fin': { id: 'valor_reb_fin', nome: 'Valor reb. final', aba: 'mensal', bloco: 'Valor do Rebanho', realizado: FONTE_VALOR_REB_REAL, previsto: FONTE_VALOR_REB_META_FINAL },
  'valor_cab_fin': { id: 'valor_cab_fin', nome: 'Valor/cab final', aba: 'mensal', bloco: 'Valor do Rebanho', realizado: FONTE_VALOR_REB_REAL, previsto: FONTE_VALOR_CAB_META_FINAL },
  'valor_arr_fin': { id: 'valor_arr_fin', nome: 'Valor/@ final', aba: 'mensal', bloco: 'Valor do Rebanho', realizado: FONTE_VALOR_REB_REAL, previsto: FONTE_VALOR_ARR_META_FINAL },

  // ─── Médio > Desempenho ───
  'gmd': { id: 'gmd', nome: 'GMD (kg/cab/dia)', aba: 'medio', bloco: 'Desempenho', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'peso_med_reb': { id: 'peso_med_reb', nome: 'Peso méd. reb.', aba: 'medio', bloco: 'Desempenho', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'ua_media': { id: 'ua_media', nome: 'UA média', aba: 'medio', bloco: 'Desempenho', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'lotacao': { id: 'lotacao', nome: 'Lotação (UA/ha)', aba: 'medio', bloco: 'Desempenho', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },

  // ─── Médio > Produção ───
  'arrobas_prod': { id: 'arrobas_prod', nome: '@ produzidas', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'prod_kg': { id: 'prod_kg', nome: 'Produção (kg)', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'arr_ha': { id: 'arr_ha', nome: '@/ha', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'desfrute_cab': { id: 'desfrute_cab', nome: 'Desfrute (cab)', aba: 'medio', bloco: 'Produção', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'desfrute_arr': { id: 'desfrute_arr', nome: 'Desfrute (@)', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'custo_arr_prod': { id: 'custo_arr_prod', nome: 'Custo/@prod', aba: 'medio', bloco: 'Produção', realizado: FONTE_FIN_COMP_REAL, previsto: SEM_PREVISTO },

  // ─── Médio > Indicadores Econômicos ───
  // IDs consumidos pelo bloco "Indicadores Econômicos" do PainelConsultorTab
  // (4 linhas inseridas entre Produção e Financeiro (Caixa) — Realizado lê
  // serieAno, META lê serieMeta de pcd.{custoArr,precoArr,margemArr,custoCab}Indicador).
  'custo_arr':  { id: 'custo_arr',  nome: 'Custo Produtivo R$/@',    aba: 'medio', bloco: 'Indicadores Econômicos', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'preco_arr':  { id: 'preco_arr',  nome: 'Preço de Venda R$/@',     aba: 'medio', bloco: 'Indicadores Econômicos', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'margem_arr': { id: 'margem_arr', nome: 'Margem R$/@',             aba: 'medio', bloco: 'Indicadores Econômicos', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'custo_cab':  { id: 'custo_cab',  nome: 'Custo por Cabeça R$/cab', aba: 'medio', bloco: 'Indicadores Econômicos', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },

  // ─── Médio > Estrutura ───
  'area_prod': { id: 'area_prod', nome: 'Área prod. (ha)', aba: 'medio', bloco: 'Estrutura', realizado: { ...FONTE_ZOOT_VIEW_REAL, fonte_tabela: 'pastos', fonte_campo: 'area_ha (onde entra_conciliacao=true)', tela_origem: '/pastos', tela_label: 'Mapa de Pastos' }, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'reb_medio': { id: 'reb_medio', nome: 'Reb. médio (cab)', aba: 'medio', bloco: 'Estrutura', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },

  // ─── Acumulado > Financeiro Caixa ───
  'ent_fin_acum': { id: 'ent_fin_acum', nome: 'Entradas fin. acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'sai_fin_acum': { id: 'sai_fin_acum', nome: 'Saídas fin. acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'rec_pec_acum': { id: 'rec_pec_acum', nome: 'Rec. pec. acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'res_caixa_acum': { id: 'res_caixa_acum', nome: 'Res. caixa acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },

  // ─── Acumulado > Financeiro Competência ───
  'rec_pec_comp_acum': { id: 'rec_pec_comp_acum', nome: 'Rec. pec. comp. acum.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'res_oper_acum': { id: 'res_oper_acum', nome: 'Res. oper. acum.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'ebitda_acum': { id: 'ebitda_acum', nome: 'EBITDA acum.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'var_valor_reb': { id: 'var_valor_reb', nome: 'Var. valor reb.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_VALOR_REB_REAL, previsto: SEM_PREVISTO },

  // ─── Média do Período ───
  'reb_medio_periodo': {
    id: 'reb_medio_periodo', nome: 'Rebanho médio período (cab)', aba: 'media_periodo', bloco: 'Desempenho Médio',
    realizado: { ...FONTE_ZOOT_VIEW_REAL, regra_calculo: 'Média aritmética do rebanho médio mensal acumulado: para cada mês cab_média = (Reb. inicial + Reb. final) ÷ 2; depois média de Janeiro até o mês selecionado.', observacao: 'Média do rebanho de cada mês no período (Reb. inicial + Reb. final ÷ 2 por mês, média acumulada de Jan até o mês selecionado).' },
    previsto: { ...FONTE_ZOOT_VIEW_PREVISTO, regra_calculo: 'Mesma fórmula com cabIni/cabFin do cenário Meta.', observacao: 'Média do rebanho de cada mês no período (cenário META).' },
  },
  'gmd_medio': {
    id: 'gmd_medio', nome: 'GMD médio período', aba: 'media_periodo', bloco: 'Desempenho Médio',
    realizado: { ...FONTE_ZOOT_VIEW_REAL, regra_calculo: 'GMD acumulado = Σ produção biológica (Jan→N) ÷ rebanho médio período (Jan→N) ÷ Σ dias (Jan→N).', observacao: 'Soma das produções biológicas em kg dividida pelo rebanho médio do período e pelo total de dias do período.' },
    previsto: { ...FONTE_ZOOT_VIEW_PREVISTO, regra_calculo: 'Mesma fórmula no cenário Meta.', observacao: 'GMD período no cenário META — mesma fórmula da realizado.' },
  },
  'peso_medio_periodo': { id: 'peso_medio_periodo', nome: 'Peso médio período', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'ua_media_periodo': { id: 'ua_media_periodo', nome: 'UA média período', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'lotacao_media': { id: 'lotacao_media', nome: 'Lotação média', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'arr_ha_media': { id: 'arr_ha_media', nome: '@/ha média período', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'prod_media_arr': { id: 'prod_media_arr', nome: 'Prod. média (@)', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'prod_media_kg': { id: 'prod_media_kg', nome: 'Prod. média (kg)', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'desfrute_medio': { id: 'desfrute_medio', nome: 'Desfrute médio', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'receita_media': { id: 'receita_media', nome: 'Receita média', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'res_oper_medio': { id: 'res_oper_medio', nome: 'Res. oper. médio', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'ebitda_medio': { id: 'ebitda_medio', nome: 'EBITDA médio', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_COMP_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'res_caixa_medio': { id: 'res_caixa_medio', nome: 'Res. caixa médio', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'saldo_caixa_medio': { id: 'saldo_caixa_medio', nome: 'Saldo Final de Caixa', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_SALDO_BANCARIO_V2, previsto: SEM_PREVISTO },

  // — Mensal > Financeiro (Caixa) —
  'ent_fin_mensal': { id: 'ent_fin_mensal', nome: 'Entradas Financeiras Mensais', aba: 'mensal', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'sai_fin_mensal': { id: 'sai_fin_mensal', nome: 'Saídas Financeiras Mensais', aba: 'mensal', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'rec_pec_mensal': { id: 'rec_pec_mensal', nome: 'Receita Pecuária Mensal', aba: 'mensal', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'res_caixa_mensal': { id: 'res_caixa_mensal', nome: 'Resultado de Caixa Mensal', aba: 'mensal', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'saldo_caixa_mensal': { id: 'saldo_caixa_mensal', nome: 'Saldo Final de Caixa', aba: 'mensal', bloco: 'Financeiro (Caixa)', realizado: FONTE_SALDO_BANCARIO_V2, previsto: SEM_PREVISTO },

  // — Médio > Financeiro (Caixa) —
  'ent_fin_med': { id: 'ent_fin_med', nome: 'Entradas Financeiras Médias', aba: 'medio', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'sai_fin_med': { id: 'sai_fin_med', nome: 'Saídas Financeiras Médias', aba: 'medio', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'rec_pec_med': { id: 'rec_pec_med', nome: 'Receita Pecuária Média', aba: 'medio', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'res_caixa_med': { id: 'res_caixa_med', nome: 'Resultado de Caixa Médio', aba: 'medio', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'saldo_caixa_med': { id: 'saldo_caixa_med', nome: 'Saldo Final de Caixa', aba: 'medio', bloco: 'Financeiro (Caixa)', realizado: FONTE_SALDO_BANCARIO_V2, previsto: SEM_PREVISTO },

  // — Período > Financeiro (Caixa) —
  'ent_fin_periodo': { id: 'ent_fin_periodo', nome: 'Entradas Financeiras do Período', aba: 'media_periodo', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },
  'sai_fin_periodo': { id: 'sai_fin_periodo', nome: 'Saídas Financeiras do Período', aba: 'media_periodo', bloco: 'Financeiro (Caixa)', realizado: FONTE_FIN_CAIXA_REAL, previsto: FONTE_META_PLANEJAMENTO },

  // — Médio > Produção —
  'prod_kg_med': { id: 'prod_kg_med', nome: 'Produção Média (kg)', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'arrobas_prod_med': { id: 'arrobas_prod_med', nome: 'Arrobas Produzidas Médias', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'arr_ha_med': { id: 'arr_ha_med', nome: 'Arrobas por Hectare Médio', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'gmd_med': { id: 'gmd_med', nome: 'GMD Médio', aba: 'medio', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },

  // — Período > Produção —
  'desfrute_cab_periodo': { id: 'desfrute_cab_periodo', nome: 'Desfrute do Período (cab)', aba: 'media_periodo', bloco: 'Produção', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'desfrute_arr_periodo': { id: 'desfrute_arr_periodo', nome: 'Desfrute do Período (@)', aba: 'media_periodo', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'gmd_periodo': { id: 'gmd_periodo', nome: 'GMD do Período', aba: 'media_periodo', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },

  // ─── Acumulado > Rebanho ───
  'entradas_acum': { id: 'entradas_acum', nome: 'Entradas acum. (cab)', aba: 'acumulado', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'saidas_acum': { id: 'saidas_acum', nome: 'Saídas acum. (cab)', aba: 'acumulado', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'saldo_acum': { id: 'saldo_acum', nome: 'Saldo acum. reb.', aba: 'acumulado', bloco: 'Rebanho', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },

  // ─── Acumulado > Produção ───
  'arrobas_acum': { id: 'arrobas_acum', nome: '@ produzidas acum.', aba: 'acumulado', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'prod_kg_acum': { id: 'prod_kg_acum', nome: 'Produção kg acum.', aba: 'acumulado', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'arr_ha_acum': { id: 'arr_ha_acum', nome: '@/ha acum.', aba: 'acumulado', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'desfrute_acum_cab': { id: 'desfrute_acum_cab', nome: 'Desfrute acum. (cab)', aba: 'acumulado', bloco: 'Produção', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'desfrute_acum_arr': { id: 'desfrute_acum_arr', nome: 'Desfrute acum. (@)', aba: 'acumulado', bloco: 'Produção', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },

  // ─── DRE Planejamento (Fase 1D) ───
  'rec_oper_meta': {
    id: 'rec_oper_meta',
    nome: 'Receita Operacional (META)',
    aba: 'acumulado',
    bloco: 'DRE (Planejamento)',
    realizado: { fonte_tipo: 'sem_fonte', fonte_tabela: '', fonte_campo: '',
      regra_calculo: 'Não exibido no realizado', regra_prioridade: '',
      tela_origem: '', tela_label: '', permite_fallback: false },
    previsto: FONTE_META_PLANEJAMENTO,
  },
  'custo_prod_meta': {
    id: 'custo_prod_meta',
    nome: 'Custo de Produção (META)',
    aba: 'acumulado',
    bloco: 'DRE (Planejamento)',
    realizado: { fonte_tipo: 'sem_fonte', fonte_tabela: '', fonte_campo: '',
      regra_calculo: 'Não exibido no realizado', regra_prioridade: '',
      tela_origem: '', tela_label: '', permite_fallback: false },
    previsto: FONTE_META_PLANEJAMENTO,
  },
  'res_oper_meta': {
    id: 'res_oper_meta',
    nome: 'Resultado Operacional (META)',
    aba: 'acumulado',
    bloco: 'DRE (Planejamento)',
    realizado: { fonte_tipo: 'sem_fonte', fonte_tabela: '', fonte_campo: '',
      regra_calculo: 'Não exibido no realizado', regra_prioridade: '',
      tela_origem: '', tela_label: '', permite_fallback: false },
    previsto: FONTE_META_PLANEJAMENTO,
  },
  'outras_saidas_meta': {
    id: 'outras_saidas_meta',
    nome: 'Outras Saídas (META)',
    aba: 'acumulado',
    bloco: 'DRE (Planejamento)',
    realizado: { fonte_tipo: 'sem_fonte', fonte_tabela: '', fonte_campo: '',
      regra_calculo: 'Não exibido no realizado', regra_prioridade: '',
      tela_origem: '', tela_label: '', permite_fallback: false },
    previsto: FONTE_META_PLANEJAMENTO,
  },
  'res_final_meta': {
    id: 'res_final_meta',
    nome: 'Resultado Final (META)',
    aba: 'acumulado',
    bloco: 'DRE (Planejamento)',
    realizado: { fonte_tipo: 'sem_fonte', fonte_tabela: '', fonte_campo: '',
      regra_calculo: 'Não exibido no realizado', regra_prioridade: '',
      tela_origem: '', tela_label: '', permite_fallback: false },
    previsto: FONTE_META_PLANEJAMENTO,
  },

  // ─── Financeiro Soberano (Auditoria) — Etapa 2C ─────────────────────
  // Bloco renderizado em PainelConsultorTab (entre Financeiro Caixa e Patrimônio).
  // Usa os mesmos IDs nas 4 abas (mensal/medio/acumulado/media_periodo) — aba canônica = 'mensal'.
  'sob_custeio_pec_sj':   { id: 'sob_custeio_pec_sj',   nome: 'Custeio Pec. s/ juros',     aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_juros_pec':        { id: 'sob_juros_pec',        nome: 'Juros Pecuária',            aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_custeio_pec_cj':   { id: 'sob_custeio_pec_cj',   nome: 'Custeio Pec. c/ juros',     aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_inv_faz_pec':      { id: 'sob_inv_faz_pec',      nome: 'Invest. Fazenda Pec.',      aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_desemb_pec':       { id: 'sob_desemb_pec',       nome: 'Desembolso Pecuária',       aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_custeio_agri_sj':  { id: 'sob_custeio_agri_sj',  nome: 'Custeio Agri. s/ juros',    aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_juros_agri':       { id: 'sob_juros_agri',       nome: 'Juros Agricultura',         aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_custeio_agri_cj':  { id: 'sob_custeio_agri_cj',  nome: 'Custeio Agri. c/ juros',    aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_inv_faz_agri':     { id: 'sob_inv_faz_agri',     nome: 'Invest. Fazenda Agri.',     aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_desemb_agri':      { id: 'sob_desemb_agri',      nome: 'Desembolso Agricultura',    aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_inv_bov':          { id: 'sob_inv_bov',          nome: 'Investimento em Bovinos',   aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_amort':            { id: 'sob_amort',            nome: 'Amortizações',              aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_div':              { id: 'sob_div',              nome: 'Dividendos / Retiradas',    aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },
  'sob_saidas_totais':    { id: 'sob_saidas_totais',    nome: 'Saídas Totais',             aba: 'mensal', bloco: 'Financeiro Soberano (Auditoria)', realizado: FONTE_FIN_SOBERANO_REAL, previsto: FONTE_FIN_SOBERANO_META },

  // ─── Áreas — Uso do Solo (C4.2) ─────────────────────────────────────
  // Renderizado em PainelConsultorTab entre Financeiro Soberano e Endividamento.
  // Aba canônica = 'mensal' (visível em todas as 4 abas — auditoria estrutural).
  // Tab Realizado → FONTE_AREA_REAL (snapshot P1).
  // Tab Meta      → FONTE_AREA_META (planejamento_area_meta).
  // SEM fallback entre as duas fontes.
  'area_pec':   { id: 'area_pec',   nome: 'Área Pecuária (ha)',    aba: 'mensal', bloco: 'ÁREAS — USO DO SOLO', realizado: FONTE_AREA_REAL, previsto: FONTE_AREA_META },
  'area_agri':  { id: 'area_agri',  nome: 'Área Agricultura (ha)', aba: 'mensal', bloco: 'ÁREAS — USO DO SOLO', realizado: FONTE_AREA_REAL, previsto: FONTE_AREA_META },
  'area_total': { id: 'area_total', nome: 'Área Total (ha)',       aba: 'mensal', bloco: 'ÁREAS — USO DO SOLO', realizado: FONTE_AREA_REAL, previsto: FONTE_AREA_META },

  // ─── Endividamento — bloco PC-100 (Realizado/Global do cliente) ─────
  // Renderizado nas abas Valores Mensais e Acumulados — aba canônica = 'mensal'.
  // Fonte: RPC fn_endividamento_mensal. Fora de escopo da META.
  'end_divida_inicial_total': { id: 'end_divida_inicial_total', nome: 'Dívida Inicial Total', aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_divida_inicial_pec':   { id: 'end_divida_inicial_pec',   nome: '→ Pecuária',           aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_divida_inicial_agri':  { id: 'end_divida_inicial_agri',  nome: '→ Agricultura',        aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_captacao_total':       { id: 'end_captacao_total',       nome: 'Captação Total',       aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_captacao_pec':         { id: 'end_captacao_pec',         nome: '→ Pecuária',           aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_captacao_agri':        { id: 'end_captacao_agri',        nome: '→ Agricultura',        aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_amortizacao_total':    { id: 'end_amortizacao_total',    nome: 'Amortização Total',    aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_amortizacao_pec':      { id: 'end_amortizacao_pec',      nome: '→ Pecuária',           aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_amortizacao_agri':     { id: 'end_amortizacao_agri',     nome: '→ Agricultura',        aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_juros_total':          { id: 'end_juros_total',          nome: 'Juros Total',          aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_juros_pec':            { id: 'end_juros_pec',            nome: '→ Pecuária',           aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_juros_agri':           { id: 'end_juros_agri',           nome: '→ Agricultura',        aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_divida_final_total':   { id: 'end_divida_final_total',   nome: 'Dívida Final Total',   aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_divida_final_pec':     { id: 'end_divida_final_pec',     nome: '→ Pecuária',           aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
  'end_divida_final_agri':    { id: 'end_divida_final_agri',    nome: '→ Agricultura',        aba: 'mensal', bloco: 'Endividamento', realizado: FONTE_ENDIVIDAMENTO_REAL, previsto: SEM_PREVISTO },
};

/** Lookup by indicator name (display name) */
export function getIndicadorMeta(nome: string): IndicadorMeta | undefined {
  return Object.values(CATALOGO_INDICADORES).find(m => m.nome === nome);
}

/** Get fonte status label */
export function getFonteStatusLabel(fonte: FonteIndicador): { label: string; status: FonteStatus; color: string } {
  switch (fonte.fonte_tipo) {
    case 'fechamento':
      return { label: 'Fechado', status: 'fechada', color: 'text-emerald-600' };
    case 'meta':
      return { label: 'Meta validada', status: 'prevista', color: 'text-blue-600' };
    case 'operacional':
    case 'view_sql':
    case 'calculado':
    case 'financeiro_v2':
      return { label: 'Operacional', status: 'operacional', color: 'text-amber-600' };
    case 'sem_fonte':
      return { label: 'Sem fonte', status: 'sem_fonte', color: 'text-muted-foreground' };
    default:
      return { label: 'Desconhecido', status: 'sem_fonte', color: 'text-muted-foreground' };
  }
}
