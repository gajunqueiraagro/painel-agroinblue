-- ============================================================================
-- P0-4 — View expõe lanc_fazenda_nome (nome real da fazenda DO LANÇAMENTO) para
-- preencher a coluna "Sistema Atual · Fazenda" na Mesa (hoje '—' no adapter).
-- +1 coluna ao final (CREATE OR REPLACE) + LEFT JOIN fazendas fzl. Aditiva/
-- retrocompat: lançamento sem fazenda → NULL. Read-only; nada operacional depende.
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview AS
 SELECT s.staging_id, s.sessao_id, s.cliente_id, s.match_status, s.aplicado, s.aplicado_em, s.aplicado_por, s.erro_apply, s.created_at, s.updated_at,
   s.excel_linha_origem, s.excel_data, s.excel_valor, s.excel_tipo_operacao, s.excel_conta_origem, s.excel_conta_destino, s.excel_subcentro, s.excel_fornecedor, s.excel_produto, s.excel_fazenda_codigo,
   l.id AS lanc_id, l.descricao AS lanc_descricao, l.observacao AS lanc_observacao, l.data_pagamento AS lanc_data_pagamento, l.data_competencia AS lanc_data_competencia, l.valor AS lanc_valor, l.sinal AS lanc_sinal, l.tipo_operacao AS lanc_tipo_operacao, l.status_transacao AS lanc_status, l.subcentro AS lanc_subcentro_atual, l.macro_custo AS lanc_macro_atual, l.grupo_custo AS lanc_grupo_atual, l.centro_custo AS lanc_centro_atual, l.plano_conta_id AS lanc_plano_conta_id_atual, l.favorecido_id AS lanc_favorecido_id_atual, fa.nome AS lanc_favorecido_nome_atual, l.conta_bancaria_id AS lanc_conta_bancaria_id, cb.nome_exibicao AS lanc_conta_bancaria_nome, l.conta_destino_id AS lanc_conta_destino_id, cd.nome_exibicao AS lanc_conta_destino_nome, l.fazenda_id AS lanc_fazenda_id,
   s.update_proposto ->> 'subcentro' AS proposto_subcentro, NULLIF(s.update_proposto ->> 'favorecido_id','')::uuid AS proposto_favorecido_id, fp.nome AS proposto_favorecido_nome,
   l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro') IS NOT NULL AS will_set_subcentro,
   l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id','') IS NOT NULL AS will_set_favorecido,
   l.id IS NOT NULL AND l.subcentro IS NULL AND (s.update_proposto ->> 'subcentro') IS NOT NULL OR l.id IS NOT NULL AND l.favorecido_id IS NULL AND NULLIF(s.update_proposto ->> 'favorecido_id','') IS NOT NULL AS will_change_anything,
   l.subcentro IS NOT NULL AND (s.update_proposto ->> 'subcentro') IS NOT NULL AND l.subcentro <> (s.update_proposto ->> 'subcentro') AS conflito_subcentro,
   (EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro','') AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id=s.cliente_id))) AS proposto_subcentro_existe_no_plano,
   NULLIF(s.update_proposto ->> 'subcentro','') IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM financeiro_plano_contas pc WHERE pc.subcentro = NULLIF(s.update_proposto ->> 'subcentro','') AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id=s.cliente_id))) AS will_create_subcentro_orfao,
   COALESCE(cb.nome_exibicao, sco.nome_exibicao, scd.nome_exibicao, NULLIF(s.excel_conta_origem,'-')) AS conta_filtro_nome,
   COALESCE(l.conta_bancaria_id, s.conta_origem_id, s.conta_destino_id) AS conta_filtro_id,
   s.excel_observacao, s.excel_documento,
   NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid AS proposto_fazenda_id, fzp.nome AS proposto_fazenda_nome,
   s.update_proposto ->> 'produto' AS proposto_produto, s.update_proposto ->> 'safra' AS proposto_safra, s.update_proposto ->> 'categoria' AS proposto_categoria,
   (l.id IS NOT NULL AND NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid IS NOT NULL AND NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid IS DISTINCT FROM l.fazenda_id) AS will_set_fazenda,
   s.update_proposto -> '_meta' ->> 'tier' AS proposto_tier, s.update_proposto -> '_meta' ->> 'origem_resolucao' AS proposto_origem_resolucao, s.update_proposto -> '_meta' ->> 'regra_id' AS proposto_regra_id, s.update_proposto -> '_meta' ->> 'alias_id' AS proposto_alias_id,
   NULLIF(s.update_proposto -> '_meta' ->> 'motor_version','')::int AS motor_version,
   s.update_proposto ->> 'macro_custo' AS proposto_macro,
   -- P0-4
   fzl.nome AS lanc_fazenda_nome
 FROM financeiro_classificacao_staging s
   LEFT JOIN financeiro_lancamentos_v2 l ON l.id=s.match_lancamento_id
   LEFT JOIN financeiro_contas_bancarias cb ON cb.id=l.conta_bancaria_id
   LEFT JOIN financeiro_contas_bancarias cd ON cd.id=l.conta_destino_id
   LEFT JOIN financeiro_contas_bancarias sco ON sco.id=s.conta_origem_id
   LEFT JOIN financeiro_contas_bancarias scd ON scd.id=s.conta_destino_id
   LEFT JOIN financeiro_fornecedores fa ON fa.id=l.favorecido_id
   LEFT JOIN financeiro_fornecedores fp ON fp.id=NULLIF(s.update_proposto ->> 'favorecido_id','')::uuid
   LEFT JOIN fazendas fzp ON fzp.id=NULLIF(s.update_proposto ->> 'fazenda_id','')::uuid
   LEFT JOIN fazendas fzl ON fzl.id=l.fazenda_id;
