/**
 * dataAncora — âncora de data padronizada para matching de conciliação.
 *
 * PR-CONCIL-AGENDADO-01 (D1): a data de referência de um lançamento para
 * fins de matching OFX é SEMPRE
 *
 *   COALESCE(data_pagamento, data_vencimento, data_competencia)
 *
 * nos quatro funis de candidatos (import OFX, rematch on-demand,
 * fn_ws_candidatos_financeiros e ConciliarExtratoDialog). Este módulo é a
 * versão front dessa regra. Lib PURA: sem hooks, sem supabase, sem React.
 *
 * Motivação empírica: lançamentos `agendado` vivem em `data_vencimento`
 * (48/69 vivos no banco têm data_pagamento NULL) e eram invisíveis a
 * janelas ancoradas exclusivamente em data_pagamento.
 */

export interface ComDatasAncora {
  data_pagamento: string | null;
  data_vencimento: string | null;
  data_competencia: string | null;
}

/**
 * Âncora de data do lançamento (prioridade pagamento → vencimento →
 * competência). Retorna null apenas quando as três datas são nulas.
 */
export function dataAncoraLancamento(l: ComDatasAncora): string | null {
  return l.data_pagamento ?? l.data_vencimento ?? l.data_competencia ?? null;
}

/**
 * Filtro PostgREST equivalente a
 *   COALESCE(data_pagamento, data_vencimento, data_competencia)
 *     BETWEEN ini AND fim
 * para uso em supabase-js `.or(...)`.
 *
 * `ini`/`fim` em ISO 'YYYY-MM-DD'.
 *
 * Nota: múltiplas chamadas `.or()` na mesma query PostgREST geram
 * parâmetros `or=(...)` independentes que se combinam entre si com AND —
 * este filtro convive com o `.or()` de conta origem/destino já usado
 * pelos funis.
 */
export function orFiltroDataAncora(ini: string, fim: string): string {
  return (
    `and(data_pagamento.gte.${ini},data_pagamento.lte.${fim}),` +
    `and(data_pagamento.is.null,data_vencimento.gte.${ini},data_vencimento.lte.${fim}),` +
    `and(data_pagamento.is.null,data_vencimento.is.null,data_competencia.gte.${ini},data_competencia.lte.${fim})`
  );
}

/**
 * Filtro PostgREST equivalente a COALESCE(cenario,'realizado') <> 'meta'
 * (cenario diferente de 'meta' OU nulo) para uso em `.or(...)`.
 * `cenario` é coluna ANULÁVEL (default 'realizado') — `.neq('cenario','meta')`
 * excluiria silenciosamente registros com cenario NULL.
 */
export const OR_CENARIO_NAO_META = 'cenario.is.null,cenario.neq.meta';
