-- =====================================================================
-- PR-FIN-LISTA-VENCIMENTO-03 — indice de vencimento por tenant
--
-- Este arquivo contem CREATE INDEX CONCURRENTLY e por isso NAO pode ser
-- envolvido em BEGIN/COMMIT nem no wrapper DO $WRAP$ da casa.
-- Provado nesta frente: o runner do Supabase CLI (start / migration up /
-- db push) NAO envolve o arquivo em transacao — o indice sai indisvalid=true.
--
-- IDEMPOTENTE E SEGURO EM AMBIENTE VIVO:
--   * o proto JA POSSUI este indice (criado na FASE 2A);
--   * IF NOT EXISTS evita recriacao;
--   * o bloco de validacao ao final aborta se o objeto existente divergir;
--   * NUNCA substituir por CREATE INDEX comum: em tabela viva isso pega
--     ACCESS EXCLUSIVE e bloqueia leitura e escrita.
-- =====================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flv2_venc_tenant
  ON public.financeiro_lancamentos_v2 (cliente_id, data_vencimento ASC NULLS LAST, id ASC)
  WHERE cancelado = false;

DO $$
DECLARE v_valid boolean; v_ready boolean; v_def text; v_opt text; v_cols text;
BEGIN
  SELECT x.indisvalid, x.indisready, pg_get_indexdef(x.indexrelid), x.indoption::text
    INTO v_valid, v_ready, v_def, v_opt
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_namespace n ON n.oid=i.relnamespace
   WHERE n.nspname='public' AND i.relname='idx_flv2_venc_tenant';

  IF v_valid IS NULL THEN
    RAISE EXCEPTION 'L3: indice idx_flv2_venc_tenant ausente apos a criacao';
  END IF;
  IF NOT v_valid OR NOT v_ready THEN
    RAISE EXCEPTION 'L3: indice INVALID (indisvalid=%, indisready=%). Remover com DROP INDEX CONCURRENTLY e reexecutar.', v_valid, v_ready;
  END IF;

  SELECT string_agg(a.attname, ',' ORDER BY k.ord) INTO v_cols
    FROM pg_index x
    JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=k.attnum
    JOIN pg_class i ON i.oid=x.indexrelid
    JOIN pg_namespace n ON n.oid=i.relnamespace
   WHERE n.nspname='public' AND i.relname='idx_flv2_venc_tenant';
  IF v_cols <> 'cliente_id,data_vencimento,id' THEN
    RAISE EXCEPTION 'L3: colunas divergentes no indice existente: %', v_cols;
  END IF;

  -- pg_get_indexdef NAO imprime "ASC NULLS LAST" (e o default normalizado).
  -- A conferencia correta e por indoption: bit 0 = DESC, bit 1 = NULLS FIRST.
  IF v_opt <> '0 0 0' THEN
    RAISE EXCEPTION 'L3: direcao/NULLs divergentes no indice existente (indoption=%)', v_opt;
  END IF;
  IF v_def NOT LIKE '%WHERE (cancelado = false)%' THEN
    RAISE EXCEPTION 'L3: predicado parcial divergente: %', v_def;
  END IF;

  RAISE NOTICE 'L3: indice idx_flv2_venc_tenant conferido e valido.';
END $$;
