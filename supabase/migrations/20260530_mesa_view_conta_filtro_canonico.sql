-- Migration: 20260530_mesa_view_conta_filtro_canonico.sql
-- PR-MESA-VIEW-CONTA-CANONICO
-- Adiciona 2 colunas derivadas canonicas em vw_classificacao_staging_preview:
--   conta_filtro_nome / conta_filtro_id, via 2 LEFT JOINs em financeiro_contas_bancarias
--   por s.conta_origem_id / s.conta_destino_id (UUIDs persistidos pela migration 252).
-- Aditivo: colunas existentes intactas; nao recria a view do zero (def viva + 4 anchors).
-- Dry-run validado (rollback): distinct conta_filtro_nome = 6 grupos (5 contas + Sem conta);
--   Banco Brasil funde 141 casados + 19 sem-par = 160.

BEGIN;

CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview AS
 SELECT s.staging_id,
    s.sessao_id,
    s.cliente_id,
    s.match_status,
    s.aplicado,
    s.aplicado_em,
    s.aplicado_por,
    s.erro_apply,
    s.created_at,
    s.updated_at,
    s.excel_linha_origem,
    s.excel_data,
    s.excel_valor,
    s.excel_tipo_operacao,
    s.excel_conta_origem,
    s.excel_conta_destino,
    s.excel_subcentro,
    s.excel_fornecedor,
    s.excel_produto,
    s.excel_fazenda_codigo,
    l.id AS lanc_id,
    l.descricao AS lanc_descricao,
    l.observacao AS lanc_observacao,
    l.data_pagamento AS lanc_data_pagamento,
    l.data_competencia AS lanc_data_competencia,
    l.valor AS lanc_valor,
    l.sinal AS lanc_sinal,
    l.tipo_operacao AS lanc_tipo_operacao,
    l.status_transacao AS lanc_status,
    l.subcentro AS lanc_subcentro_atual,
    l.macro_custo AS lanc_macro_atual,
    l.grupo_custo AS lanc_grupo_atual,
    l.centro_custo AS lanc_centro_atual,
    l.plano_conta_id AS lanc_plano_conta_id_atual,
    l.favorecido_id AS lanc_favorecido_id_atual,
    fa.nome AS lanc_favorecido_nome_atual,
    l.conta_bancaria_id AS lanc_conta_bancaria_id,
    cb.nome_exibicao AS lanc_conta_bancaria_nome,
    l.conta_destino_id AS lanc_conta_destino_id,
    cd.nome_exibicao AS lanc_conta_destino_nome,
    l.fazenda_id AS lanc_fazenda_id,
    s.update_proposto ->> 'subcentro'::text AS proposto_subcentro,
    NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text)::uuid AS proposto_favorecido_id,
    fp.nome AS proposto_favorecido_nome,
    l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro'::text) IS NOT NULL AS will_set_subcentro,
    l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text) IS NOT NULL AS will_set_favorecido,
    l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro'::text) IS NOT NULL OR l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text) IS NOT NULL AS will_change_anything,
    l.subcentro IS NOT NULL AND (s.update_proposto ->> 'subcentro'::text) IS NOT NULL AND l.subcentro <> (s.update_proposto ->> 'subcentro'::text) AS conflito_subcentro,
    (EXISTS ( SELECT 1
           FROM financeiro_plano_contas pc
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo = true AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id))) AS proposto_subcentro_existe_no_plano,
    NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM financeiro_plano_contas pc
          WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro'::text, ''::text) AND pc.ativo = true AND (pc.cliente_id IS NULL OR pc.cliente_id = s.cliente_id))) AS will_create_subcentro_orfao,
    COALESCE(cb.nome_exibicao, sco.nome_exibicao, scd.nome_exibicao, NULLIF(s.excel_conta_origem, '-'::text)) AS conta_filtro_nome,
    COALESCE(l.conta_bancaria_id, s.conta_origem_id, s.conta_destino_id) AS conta_filtro_id
   FROM financeiro_classificacao_staging s
     LEFT JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
     LEFT JOIN financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
     LEFT JOIN financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
     LEFT JOIN financeiro_contas_bancarias sco ON sco.id = s.conta_origem_id
     LEFT JOIN financeiro_contas_bancarias scd ON scd.id = s.conta_destino_id
     LEFT JOIN financeiro_fornecedores fa ON fa.id = l.favorecido_id
     LEFT JOIN financeiro_fornecedores fp ON fp.id = NULLIF(s.update_proposto ->> 'favorecido_id'::text, ''::text)::uuid;;

COMMIT;
