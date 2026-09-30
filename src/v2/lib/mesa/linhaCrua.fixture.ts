/**
 * PR-CONC-MESA-DIVERGENCIA-EXCEL-01 — a linha CRUA da view, completa, para testar o `toRowVM` inteiro.
 *
 * ⚠ GERADA DA INTERFACE (`ClassificacaoStagingPreviewRow`): nulo onde o tipo admite, falso nos booleanos. O teste
 *   sobrescreve só o que o caso precisa. Sem cast: é o tipo inteiro, campo a campo.
 */
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';

export function linhaCrua(sobre: Partial<ClassificacaoStagingPreviewRow> = {}): ClassificacaoStagingPreviewRow {
  return {
    staging_id: '', sessao_id: '', cliente_id: '', match_status: 'exato', aplicado: false, aplicado_em: null,
    aplicado_por: null, erro_apply: null, created_at: '', updated_at: '', excel_linha_origem: null, excel_data: null,
    excel_valor: null, excel_tipo_operacao: null, excel_conta_origem: null, excel_conta_destino: null,
    excel_subcentro: null, excel_fornecedor: null, excel_produto: null, excel_fazenda_codigo: null,
    excel_documento: null, lanc_id: null, lanc_descricao: null, lanc_observacao: null, lanc_data_pagamento: null,
    lanc_data_competencia: null, lanc_valor: null, lanc_sinal: null, lanc_tipo_operacao: null, lanc_status: null,
    lanc_subcentro_atual: null, lanc_macro_atual: null, lanc_grupo_atual: null, lanc_centro_atual: null,
    lanc_plano_conta_id_atual: null, lanc_favorecido_id_atual: null, lanc_favorecido_nome_atual: null,
    lanc_conta_bancaria_id: null, lanc_conta_bancaria_nome: null, revisado_em: null, revisado_por: null,
    lanc_conta_destino_id: null, lanc_conta_destino_nome: null, lanc_fazenda_id: null, proposto_subcentro: null,
    proposto_favorecido_id: null, proposto_favorecido_nome: null, will_set_subcentro: false,
    will_set_favorecido: false, will_change_anything: false, conflito_subcentro: false,
    proposto_subcentro_existe_no_plano: false, will_create_subcentro_orfao: false, conta_filtro_id: null,
    conta_filtro_nome: null, proposto_fazenda_id: null, proposto_fazenda_nome: null, proposto_produto: null,
    proposto_safra: null, proposto_categoria: null, will_set_fazenda: false, proposto_tier: null,
    proposto_origem_resolucao: null, proposto_regra_id: null, proposto_alias_id: null, motor_version: null,
    proposto_macro: null, lanc_fazenda_nome: null, lanc_numero_documento: null, proposto_numero_documento: null,
    lanc_data_vencimento: null, excel_data_pagamento: null, excel_data_vencimento: null, casamento_meta: null,
    match_lancamento_ids: null, lanc_safra_id: null, lanc_safra_codigo: null, proposto_safra_id: null,
    proposto_safra_codigo: null, proposto_data_competencia: null, proposto_data_vencimento: null,
    proposto_data_pagamento: null, proposto_conta_bancaria_id: null, proposto_observacao: null, lote_aplicavel: false,
    proposto_tipo_operacao: null, proposto_conta_destino_id: null,
    planilha_fazenda_id: null, planilha_fazenda_nome: null, planilha_favorecido_id: null, planilha_favorecido_nome: null,
    planilha_subcentro: null, lanc_origem_lancamento: null,
    proposto_tipo_documento: null, proposto_forma_pagamento: null, lanc_tipo_documento: null, lanc_forma_pagamento: null,
    excel_safra: null, excel_tipo_documento: null, excel_forma_pagamento: null, excel_status: null,
    planilha_safra_id: null, planilha_tipo_documento: null, planilha_forma_pagamento: null,
    ...sobre,
  };
}
