/**
 * Matriz de Consolidação Global — Painel do Consultor
 *
 * Define como cada indicador deve ser agregado no modo Global (Σ fazendas).
 *
 * Regra absoluta:
 *   - NUNCA usar média simples entre fazendas
 *   - NUNCA somar médias ou percentuais
 *   - NUNCA fazer média de GMD individual por fazenda
 *   - Se denominador for zero → exibir vazio (NaN)
 *
 * Tipos de consolidação:
 *   soma:            Σ valores de todas as fazendas
 *   ponderado_cab:   Σ numerador / Σ cabeças (peso médio, valor/cab)
 *   ponderado_area:  Σ numerador / Σ área produtiva (lotação, @/ha, kg/ha)
 *   recalculado:     Fórmula customizada sobre base global (GMD, desfrute %)
 *   unitario:        Σ numerador / Σ denominador (custo/@, receita/@)
 */

export type TipoConsolidacao =
  | 'soma'
  | 'ponderado_cab'
  | 'ponderado_area'
  | 'recalculado'
  | 'unitario';

export interface ConsolidacaoRegra {
  indicadorId: string;
  tipo: TipoConsolidacao;
  /** Campo usado como numerador na ponderação (ex: 'peso_total_final') */
  numerador?: string;
  /** Campo usado como denominador na ponderação (ex: 'cabecas_final') */
  denominador?: string;
  /** Descrição da fórmula para auditoria */
  formula: string;
}

/**
 * Catálogo completo de regras de consolidação global.
 * Indexado por indicadorId do CATALOGO_INDICADORES.
 */
export const CONSOLIDACAO_GLOBAL: Record<string, ConsolidacaoRegra> = {
  // ─── Soma direta ───
  reb_inicial:      { indicadorId: 'reb_inicial',      tipo: 'soma', formula: 'Σ cabecas_inicio' },
  reb_final:        { indicadorId: 'reb_final',        tipo: 'soma', formula: 'Σ cabecas_final' },
  entradas_cab:     { indicadorId: 'entradas_cab',     tipo: 'soma', formula: 'Σ entradas' },
  saidas_cab:       { indicadorId: 'saidas_cab',       tipo: 'soma', formula: 'Σ saidas' },
  peso_ini_kg:      { indicadorId: 'peso_ini_kg',      tipo: 'soma', formula: 'Σ peso_total_inicial' },
  peso_fin_kg:      { indicadorId: 'peso_fin_kg',      tipo: 'soma', formula: 'Σ peso_total_final' },
  peso_ini_arr:     { indicadorId: 'peso_ini_arr',     tipo: 'soma', formula: 'Σ peso_total_inicial / 30' },
  peso_fin_arr:     { indicadorId: 'peso_fin_arr',     tipo: 'soma', formula: 'Σ peso_total_final / 30' },
  arrobas_prod:     { indicadorId: 'arrobas_prod',     tipo: 'soma', formula: 'Σ producao_biologica / 30' },
  prod_kg:          { indicadorId: 'prod_kg',          tipo: 'soma', formula: 'Σ producao_biologica' },
  area_prod:        { indicadorId: 'area_prod',        tipo: 'soma', formula: 'Σ area_produtiva_ha' },
  reb_medio:        { indicadorId: 'reb_medio',        tipo: 'soma', formula: 'Σ (cab_ini + cab_fin) / 2' },
  valor_reb_ini:    { indicadorId: 'valor_reb_ini',    tipo: 'soma', formula: 'Σ valor_total (mês anterior)' },
  valor_reb_fin:    { indicadorId: 'valor_reb_fin',    tipo: 'soma', formula: 'Σ valor_total' },
  ent_fin_acum:     { indicadorId: 'ent_fin_acum',     tipo: 'soma', formula: 'Σ entradas financeiras' },
  sai_fin_acum:     { indicadorId: 'sai_fin_acum',     tipo: 'soma', formula: 'Σ saídas financeiras' },
  rec_pec_acum:     { indicadorId: 'rec_pec_acum',     tipo: 'soma', formula: 'Σ receita pecuária' },
  res_caixa_acum:   { indicadorId: 'res_caixa_acum',   tipo: 'soma', formula: 'Σ resultado caixa' },
  rec_pec_comp_acum:{ indicadorId: 'rec_pec_comp_acum',tipo: 'soma', formula: 'Σ receita pecuária competência' },
  res_oper_acum:    { indicadorId: 'res_oper_acum',    tipo: 'soma', formula: 'Σ resultado operacional' },
  ebitda_acum:      { indicadorId: 'ebitda_acum',      tipo: 'soma', formula: 'Σ EBITDA' },
  var_valor_reb:    { indicadorId: 'var_valor_reb',    tipo: 'soma', formula: 'Σ variação valor rebanho' },
  entradas_acum:    { indicadorId: 'entradas_acum',    tipo: 'soma', formula: 'Σ entradas acumuladas' },
  saidas_acum:      { indicadorId: 'saidas_acum',      tipo: 'soma', formula: 'Σ saídas acumuladas' },
  saldo_acum:       { indicadorId: 'saldo_acum',       tipo: 'soma', formula: 'Σ (entradas - saídas)' },
  arrobas_acum:     { indicadorId: 'arrobas_acum',     tipo: 'soma', formula: 'Σ @ produzidas' },
  prod_kg_acum:     { indicadorId: 'prod_kg_acum',     tipo: 'soma', formula: 'Σ produção kg' },
  desfrute_acum_cab:{ indicadorId: 'desfrute_acum_cab',tipo: 'soma', formula: 'Σ desfrute (cab)' },
  desfrute_acum_arr:{ indicadorId: 'desfrute_acum_arr',tipo: 'soma', formula: 'Σ desfrute (@)' },
  ua_media:         { indicadorId: 'ua_media',         tipo: 'soma', formula: 'Σ UA média' },
  desfrute_cab:     { indicadorId: 'desfrute_cab',     tipo: 'soma', formula: 'Σ desfrute (cab)' },
  desfrute_arr:     { indicadorId: 'desfrute_arr',     tipo: 'soma', formula: 'Σ desfrute (@)' },
  desfrute_medio:   { indicadorId: 'desfrute_medio',   tipo: 'soma', formula: 'Σ desfrute (cab) médio' },
  receita_media:    { indicadorId: 'receita_media',    tipo: 'soma', formula: 'Σ receita média' },
  res_oper_medio:   { indicadorId: 'res_oper_medio',   tipo: 'soma', formula: 'Σ resultado operacional médio' },
  ebitda_medio:     { indicadorId: 'ebitda_medio',     tipo: 'soma', formula: 'Σ EBITDA médio' },
  res_caixa_medio:  { indicadorId: 'res_caixa_medio',  tipo: 'soma', formula: 'Σ resultado caixa médio' },

  // ─── Ponderado por cabeças ───
  peso_med_ini:     { indicadorId: 'peso_med_ini',     tipo: 'ponderado_cab', numerador: 'peso_total_inicial',  denominador: 'cabecas_inicio', formula: 'Σ peso_total_ini / Σ cabecas_ini' },
  peso_med_fin:     { indicadorId: 'peso_med_fin',     tipo: 'ponderado_cab', numerador: 'peso_total_final',   denominador: 'cabecas_final',  formula: 'Σ peso_total_fin / Σ cabecas_fin' },
  peso_fin_cab_kg:  { indicadorId: 'peso_fin_cab_kg',  tipo: 'ponderado_cab', numerador: 'peso_total_final',   denominador: 'cabecas_final',  formula: 'Σ peso_total_fin / Σ cabecas_fin' },
  peso_med_reb:     { indicadorId: 'peso_med_reb',     tipo: 'ponderado_cab', numerador: 'peso_total_final',   denominador: 'cabecas_final',  formula: 'Σ peso_total_fin / Σ cabecas_fin' },
  peso_medio_periodo:{ indicadorId: 'peso_medio_periodo', tipo: 'ponderado_cab', numerador: 'peso_total_final', denominador: 'cabecas_final', formula: 'rolling avg(Σ peso / Σ cab)' },

  // ─── Unitários econômicos ponderados ───
  valor_cab_fin:    { indicadorId: 'valor_cab_fin',    tipo: 'unitario', numerador: 'valor_total',    denominador: 'cabecas_final',   formula: 'Σ valor_total / Σ cabecas_fin' },
  valor_arr_fin:    { indicadorId: 'valor_arr_fin',    tipo: 'unitario', numerador: 'valor_total',    denominador: 'arrobas_total',   formula: 'Σ valor_total / Σ arrobas_total' },

  // ─── Recalculados com base global ───
  gmd:              { indicadorId: 'gmd',              tipo: 'recalculado', formula: 'Σ prod_bio / (Σ cab_medias × dias)' },
  gmd_medio:        { indicadorId: 'gmd_medio',        tipo: 'recalculado', formula: 'rolling avg(GMD global)' },

  // ─── Ponderado por área ───
  lotacao:          { indicadorId: 'lotacao',          tipo: 'ponderado_area', numerador: 'ua_total',         denominador: 'area_produtiva', formula: 'Σ UA / Σ área' },
  lotacao_media:    { indicadorId: 'lotacao_media',    tipo: 'ponderado_area', numerador: 'ua_total',         denominador: 'area_produtiva', formula: 'rolling avg(Σ UA / Σ área)' },
  arr_ha:           { indicadorId: 'arr_ha',           tipo: 'ponderado_area', numerador: 'arrobas_prod',     denominador: 'area_produtiva', formula: 'Σ @prod / Σ área' },
  arr_ha_media:     { indicadorId: 'arr_ha_media',     tipo: 'ponderado_area', numerador: 'arrobas_prod',     denominador: 'area_produtiva', formula: 'rolling avg(Σ @prod / Σ área)' },
  arr_ha_acum:      { indicadorId: 'arr_ha_acum',      tipo: 'ponderado_area', numerador: 'arrobas_prod',     denominador: 'area_produtiva', formula: 'cumsum(Σ @prod) / Σ área' },
  ua_media_periodo: { indicadorId: 'ua_media_periodo', tipo: 'soma', formula: 'rolling avg(Σ UA)' },
  prod_media_arr:   { indicadorId: 'prod_media_arr',   tipo: 'soma', formula: 'rolling avg(Σ @ prod)' },
  prod_media_kg:    { indicadorId: 'prod_media_kg',    tipo: 'soma', formula: 'rolling avg(Σ prod kg)' },
};

/**
 * Para o modo Global, agrega snapshots de valor do rebanho
 * de múltiplas fazendas em valores consolidados corretos.
 *
 * Regras:
 *  - valor_total, cabecas, arrobas_total: soma
 *  - peso_medio_kg: ponderado = (Σ arrobas × 30) / Σ cabecas
 *  - valor_cabeca_medio: derivado = Σ valor_total / Σ cabecas
 *  - preco_arroba_medio: derivado = Σ valor_total / Σ arrobas
 */
export function agregaSnapshotsGlobal(
  rows: Array<{
    ano_mes: string;
    valor_total?: number;
    valor_cabeca_medio?: number;
    preco_arroba_medio?: number;
    cabecas?: number;
    peso_medio_kg?: number;
    arrobas_total?: number;
  }>,
  meses: string[],
): {
  valorTotal: Map<string, number>;
  cabecas: Map<string, number>;
  arrobas: Map<string, number>;
  pesoMedio: Map<string, number>;
  valorCabeca: Map<string, number>;
  precoArroba: Map<string, number>;
} {
  // Camada 1: soma direta
  const vtMap = new Map(meses.map(m => [m, 0]));
  const cabMap = new Map(meses.map(m => [m, 0]));
  const arrMap = new Map(meses.map(m => [m, 0]));

  for (const row of rows) {
    const mes = row.ano_mes;
    vtMap.set(mes, (vtMap.get(mes) || 0) + (Number(row.valor_total) || 0));
    cabMap.set(mes, (cabMap.get(mes) || 0) + (Number(row.cabecas) || 0));
    arrMap.set(mes, (arrMap.get(mes) || 0) + (Number(row.arrobas_total) || 0));
  }

  // Camada 2: derivados
  const pmMap = new Map<string, number>();
  const vcMap = new Map<string, number>();
  const paMap = new Map<string, number>();

  for (const mes of meses) {
    const cab = cabMap.get(mes) || 0;
    const arr = arrMap.get(mes) || 0;
    const vt = vtMap.get(mes) || 0;

    // Peso médio = peso total / cabeças = (arrobas × 30) / cabeças
    pmMap.set(mes, cab > 0 ? (arr * 30) / cab : 0);
    // Valor/cab = valor_total / cabeças
    vcMap.set(mes, cab > 0 ? vt / cab : 0);
    // Preço/@ = valor_total / arrobas
    paMap.set(mes, arr > 0 ? vt / arr : 0);
  }

  return {
    valorTotal: vtMap,
    cabecas: cabMap,
    arrobas: arrMap,
    pesoMedio: pmMap,
    valorCabeca: vcMap,
    precoArroba: paMap,
  };
}