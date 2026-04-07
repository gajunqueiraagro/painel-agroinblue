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
  ...FONTE_ZOOT_VIEW_PREVISTO,
  fonte_campo: 'peso_inicio_kg, peso_total_final_kg, peso_medio_final_kg (cenario=meta)',
  regra_calculo: 'Peso previsto da view zootécnica oficial',
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
  fonte_tabela: 'fechamento_pasto_itens',
  fonte_campo: 'peso_medio_kg × quantidade',
  regra_calculo: 'Peso total = Σ(categoria.quantidade × categoria.peso_medio_kg)',
  regra_prioridade: '1. Fechamento oficial; 2. Peso por categoria dos pastos',
  tela_origem: '/fechamento',
  tela_label: 'Fechamento de Pastos',
  permite_fallback: true,
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

  // ─── Médio > Estrutura ───
  'area_prod': { id: 'area_prod', nome: 'Área prod. (ha)', aba: 'medio', bloco: 'Estrutura', realizado: { ...FONTE_ZOOT_VIEW_REAL, fonte_tabela: 'pastos', fonte_campo: 'area_ha (onde entra_conciliacao=true)', tela_origem: '/pastos', tela_label: 'Mapa de Pastos' }, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'reb_medio': { id: 'reb_medio', nome: 'Reb. médio (cab)', aba: 'medio', bloco: 'Estrutura', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },

  // ─── Acumulado > Financeiro Caixa ───
  'ent_fin_acum': { id: 'ent_fin_acum', nome: 'Entradas fin. acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: SEM_PREVISTO },
  'sai_fin_acum': { id: 'sai_fin_acum', nome: 'Saídas fin. acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: SEM_PREVISTO },
  'rec_pec_acum': { id: 'rec_pec_acum', nome: 'Rec. pec. acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: SEM_PREVISTO },
  'res_caixa_acum': { id: 'res_caixa_acum', nome: 'Res. caixa acum.', aba: 'acumulado', bloco: 'Financeiro no Caixa', realizado: FONTE_FIN_CAIXA_REAL, previsto: SEM_PREVISTO },

  // ─── Acumulado > Financeiro Competência ───
  'rec_pec_comp_acum': { id: 'rec_pec_comp_acum', nome: 'Rec. pec. comp. acum.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_FIN_COMP_REAL, previsto: SEM_PREVISTO },
  'res_oper_acum': { id: 'res_oper_acum', nome: 'Res. oper. acum.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_FIN_COMP_REAL, previsto: SEM_PREVISTO },
  'ebitda_acum': { id: 'ebitda_acum', nome: 'EBITDA acum.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_FIN_COMP_REAL, previsto: SEM_PREVISTO },
  'var_valor_reb': { id: 'var_valor_reb', nome: 'Var. valor reb.', aba: 'acumulado', bloco: 'Financeiro por Competência', realizado: FONTE_VALOR_REB_REAL, previsto: SEM_PREVISTO },

  // ─── Média do Período ───
  'gmd_medio': { id: 'gmd_medio', nome: 'GMD médio período', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'peso_medio_periodo': { id: 'peso_medio_periodo', nome: 'Peso médio período', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'ua_media_periodo': { id: 'ua_media_periodo', nome: 'UA média período', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'lotacao_media': { id: 'lotacao_media', nome: 'Lotação média', aba: 'media_periodo', bloco: 'Desempenho Médio', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'arr_ha_media': { id: 'arr_ha_media', nome: '@/ha média período', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'prod_media_arr': { id: 'prod_media_arr', nome: 'Prod. média (@)', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'prod_media_kg': { id: 'prod_media_kg', nome: 'Prod. média (kg)', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_ZOOT_VIEW_REAL, previsto: FONTE_ZOOT_VIEW_PREVISTO },
  'desfrute_medio': { id: 'desfrute_medio', nome: 'Desfrute médio', aba: 'media_periodo', bloco: 'Produção Média', realizado: FONTE_REBANHO_REAL, previsto: FONTE_REBANHO_PREVISTO },
  'receita_media': { id: 'receita_media', nome: 'Receita média', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_CAIXA_REAL, previsto: SEM_PREVISTO },
  'res_oper_medio': { id: 'res_oper_medio', nome: 'Res. oper. médio', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_COMP_REAL, previsto: SEM_PREVISTO },
  'ebitda_medio': { id: 'ebitda_medio', nome: 'EBITDA médio', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_COMP_REAL, previsto: SEM_PREVISTO },
  'res_caixa_medio': { id: 'res_caixa_medio', nome: 'Res. caixa médio', aba: 'media_periodo', bloco: 'Financeiro Médio', realizado: FONTE_FIN_CAIXA_REAL, previsto: SEM_PREVISTO },

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
