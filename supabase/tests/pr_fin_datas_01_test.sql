-- PR-FIN-DATAS-01 — teste ESTRUTURAL do contrato da coluna data_vencimento.
--   Valida EXCLUSIVAMENTE o contrato introduzido por esta PR em public.financeiro_lancamentos_v2,
--   por INSPEÇÃO DE CATÁLOGO (information_schema + pg_catalog), sem escrever nada.
--   BEGIN...ROLLBACK (no-op de escrita). Requer aplicada: a migration
--   20260729150000_pr_fin_datas_01_add_data_vencimento. Rodar SOMENTE no PROTO
--   (binbcdfbisgscrifztia). Falha ⇒ RAISE EXCEPTION (aborta a transação).
--
--   ESCOPO (só o que ESTA PR introduziu): (1) coluna existe; (2) data_type=date;
--   (3) is_nullable=YES; (4) column_default NULL; (5) attnotnull=false; (6) sem generated
--   expression; (7) sem índice que inclua a coluna; (8) sem constraint específica sobre a
--   coluna; (9) comentário semântico presente e distinguindo vencimento de data_pagamento e
--   data_competencia; (10) bloco transacional; (11) sucesso explícito.
--
--   FORA DE ESCOPO (removido de propósito): NÃO congela contratos de colunas vizinhas
--   (data_competencia, data_pagamento, ano_mes, status_transacao) — não foram criadas nem
--   alteradas por esta migration (cuja única DDL é ADD COLUMN + COMMENT); congelar a
--   nullability delas apenas trocaria um baseline histórico incorreto por outro baseline
--   ambiental, igualmente fora de escopo. Também NÃO valida estado de dados (contagem de
--   data_vencimento preenchida) como assertiva permanente: writers futuros poderão preencher
--   a coluna legitimamente; a comprovação de "0 imediatamente após a migration" fica no
--   relatório pós-aplicação, não no teste versionado.

BEGIN;

DO $t$
DECLARE
  v_type    text;
  v_null    text;
  v_default text;
  v_notnull boolean;
  v_gen     text;
  v_attnum  int;
  v_idx     int;
  v_con     int;
  v_comment text;
BEGIN
  -- (1) coluna existe + captura (2)(3)(4)
  SELECT data_type, is_nullable, column_default
    INTO v_type, v_null, v_default
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2'
     AND column_name='data_vencimento';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: coluna data_vencimento não existe';
  END IF;

  -- (2) tipo date
  IF v_type IS DISTINCT FROM 'date' THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: data_type esperado=date, obtido=%', v_type;
  END IF;

  -- (3) nullable = YES
  IF v_null IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: is_nullable esperado=YES, obtido=%', v_null;
  END IF;

  -- (4) sem default
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: column_default deveria ser NULL, obtido=%', v_default;
  END IF;

  -- (5) sem NOT NULL + (6) sem generated + captura attnum
  SELECT a.attnotnull, a.attgenerated, a.attnum
    INTO v_notnull, v_gen, v_attnum
    FROM pg_attribute a
    JOIN pg_class c   ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='financeiro_lancamentos_v2'
     AND a.attname='data_vencimento' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_notnull THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: coluna não pode ter NOT NULL nesta etapa';
  END IF;
  IF v_gen IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: coluna não pode ser generated (attgenerated=%)', v_gen;
  END IF;

  -- (7) nenhum índice inclui a coluna data_vencimento
  SELECT count(*) INTO v_idx
    FROM pg_index i
    JOIN pg_class c   ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='financeiro_lancamentos_v2'
     AND v_attnum = ANY (i.indkey::int[]);
  IF v_idx <> 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: não deveria existir índice sobre data_vencimento (achou %)', v_idx;
  END IF;

  -- (8) nenhuma constraint (check/unique/pk/fk) referencia a coluna data_vencimento
  SELECT count(*) INTO v_con
    FROM pg_constraint con
    JOIN pg_class c   ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='financeiro_lancamentos_v2'
     AND con.conkey IS NOT NULL AND v_attnum = ANY (con.conkey);
  IF v_con <> 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: não deveria existir constraint sobre data_vencimento (achou %)', v_con;
  END IF;

  -- (9) comentário semântico presente e distinguindo vencimento de data_pagamento/data_competencia
  --     (por PRESENÇA — robusto a pontuação/acentos/melhorias futuras de redação)
  v_comment := col_description('public.financeiro_lancamentos_v2'::regclass, v_attnum);
  IF v_comment IS NULL OR length(btrim(v_comment)) = 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: comentário semântico ausente em data_vencimento';
  END IF;
  IF position('data_pagamento' IN v_comment) = 0
     OR position('data_competencia' IN v_comment) = 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: comentário não distingue vencimento de data_pagamento/data_competencia';
  END IF;

  -- (11) sucesso explícito
  RAISE NOTICE 'PR-FIN-DATAS-01: OK — contrato de data_vencimento válido (date NULL, sem default/generated/índice/constraint; comentário semântico presente).';
END
$t$;

ROLLBACK;
