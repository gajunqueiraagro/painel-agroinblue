-- 20260910171500_vw_lanc_doc_compoe_dre.sql
-- FIN-DRE-BADGE-01: acrescenta compoe_dre a vw_financeiro_lancamentos_v2_doc.
-- O modal de lancamento aberto pela lista do Financeiro chegava sem a flag e o badge
-- de DRE mostrava traco em lancamento intocado. Coluna no fim da lista (exigencia do
-- CREATE OR REPLACE VIEW); security_invoker preservado; grants preservados.
-- Corpo lido do banco (pg_get_viewdef) em 10/09/2026 e alterado em 1 linha.

CREATE OR REPLACE VIEW public.vw_financeiro_lancamentos_v2_doc
  WITH (security_invoker = true) AS
 SELECT id,
    cliente_id,
    fazenda_id,
    data_competencia,
    data_pagamento,
    data_vencimento,
    ano_mes,
    valor,
    sinal,
    tipo_operacao,
    status_transacao,
    cenario,
    descricao,
    macro_custo,
    grupo_custo,
    centro_custo,
    subcentro,
    escopo_negocio,
    observacao,
    documento,
    historico,
    numero_documento,
    tipo_documento,
    favorecido_id,
    conta_bancaria_id,
    conta_destino_id,
    origem_lancamento,
    origem_tipo,
    lote_importacao_id,
    financiamento_id,
    movimentacao_rebanho_id,
    safra_id,
    forma_pagamento,
    dados_pagamento,
    cancelado,
    conciliado_em,
    editado_manual,
    created_at,
    updated_at,
    EXTRACT(month FROM data_competencia)::smallint AS mes_competencia,
    EXTRACT(month FROM data_vencimento)::smallint AS mes_vencimento,
    EXTRACT(month FROM data_pagamento)::smallint AS mes_pagamento,
    EXTRACT(month FROM COALESCE(data_pagamento, data_vencimento))::smallint AS mes_financeira,
        CASE
            WHEN NULLIF(btrim(numero_documento), ''::text) IS NULL AND NULLIF(btrim(tipo_documento), ''::text) IS NULL THEN '-'::text
            WHEN COALESCE(NULLIF(btrim(tipo_documento), ''::text), 'Outros'::text) = 'Nota Fiscal'::text AND COALESCE(numero_documento, ''::text) <> ''::text THEN 'NF '::text ||
            CASE
                WHEN "left"(regexp_replace(COALESCE(numero_documento, ''::text), '\D'::text, ''::text, 'g'::text), 9) = ''::text THEN ''::text
                ELSE (((substr(lpad("left"(regexp_replace(COALESCE(numero_documento, ''::text), '\D'::text, ''::text, 'g'::text), 9), 9, '0'::text), 1, 3) || '.'::text) || substr(lpad("left"(regexp_replace(COALESCE(numero_documento, ''::text), '\D'::text, ''::text, 'g'::text), 9), 9, '0'::text), 4, 3)) || '.'::text) || substr(lpad("left"(regexp_replace(COALESCE(numero_documento, ''::text), '\D'::text, ''::text, 'g'::text), 9), 9, '0'::text), 7, 3)
            END
            WHEN COALESCE(numero_documento, ''::text) <> ''::text THEN (COALESCE(NULLIF(btrim(tipo_documento), ''::text), 'Outros'::text) || ' '::text) || numero_documento
            ELSE COALESCE(NULLIF(btrim(tipo_documento), ''::text), 'Outros'::text)
        END AS documento_formatado,
    compoe_dre
   FROM financeiro_lancamentos_v2 l;
