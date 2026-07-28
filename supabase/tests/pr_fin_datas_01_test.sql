-- PR-FIN-DATAS-01 — teste ESTRUTURAL da coluna data_vencimento (financeiro_lancamentos_v2).
--   Valida o contrato aditivo por INSPEÇÃO DE CATÁLOGO (information_schema + pg_catalog),
--   sem depender de dados reais de cliente e sem escrever nada. BEGIN...ROLLBACK (no-op de escrita).
--   Requer aplicada: 20260729150000_pr_fin_datas_01_add_data_vencimento. Rodar SOMENTE no
--   PROTO (binbcdfbisgscrifztia). Falha ⇒ RAISE EXCEPTION (aborta a transação).
--   Cobre: (1) coluna existe; (2) data_type=date; (3) is_nullable=YES; (4) default NULL;
--   (5) sem índice específico p/ data_vencimento; (6) sem NOT NULL (attnotnull=false);
--   (7) sem backfill possível pela DDL (default NULL ⇒ registros novos/existentes ficam NULL);
--   (8) contrato das colunas vizinhas inalterado (competência/pagamento/ano_mes/status).

BEGIN;

DO $t$
DECLARE
  v_type    text;
  v_null    text;
  v_default text;
  v_notnull boolean;
  v_attnum  int;
  v_idx     int;
  v_cnt     int;
BEGIN
  -- (1) coluna existe
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

  -- (6) sem NOT NULL (pg_catalog) + captura attnum p/ checagem de índice
  SELECT a.attnotnull, a.attnum
    INTO v_notnull, v_attnum
    FROM pg_attribute a
    JOIN pg_class c   ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='financeiro_lancamentos_v2'
     AND a.attname='data_vencimento' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_notnull THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: coluna não pode ter NOT NULL nesta etapa';
  END IF;

  -- (5) nenhum índice inclui a coluna data_vencimento
  SELECT count(*) INTO v_idx
    FROM pg_index i
    JOIN pg_class c   ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='financeiro_lancamentos_v2'
     AND v_attnum = ANY (i.indkey::int[]);
  IF v_idx <> 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-01: não deveria existir índice sobre data_vencimento (achou %)', v_idx;
  END IF;

  -- (7) default NULL garante ausência de backfill: registros existentes com data_vencimento
  --     não-NULL só poderiam surgir de UPDATE/backfill (proibido nesta PR). Aqui verificamos
  --     que a coluna não foi populada por default (já coberto por (4)); a ausência de UPDATE é
  --     garantida pela DDL (o arquivo da migration não contém UPDATE — ver inspeção no relatório).
  --     Contagem informativa (não falha por dados de cliente): apenas registra se algo já foi populado.
  SELECT count(*) INTO v_cnt
    FROM public.financeiro_lancamentos_v2
   WHERE data_vencimento IS NOT NULL;
  RAISE NOTICE 'PR-FIN-DATAS-01: registros com data_vencimento preenchida = % (esperado 0 imediatamente após a migration)', v_cnt;

  -- (8) contrato das colunas vizinhas inalterado
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2'
     AND column_name='data_competencia' AND data_type='date' AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'PR-FIN-DATAS-01: contrato de data_competencia mudou'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2'
     AND column_name='data_pagamento' AND data_type='date' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'PR-FIN-DATAS-01: contrato de data_pagamento mudou'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2'
     AND column_name='ano_mes' AND data_type='text' AND is_nullable='NO';
  IF NOT FOUND THEN RAISE EXCEPTION 'PR-FIN-DATAS-01: contrato de ano_mes mudou'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2'
     AND column_name='status_transacao' AND data_type='text' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'PR-FIN-DATAS-01: contrato de status_transacao mudou'; END IF;

  RAISE NOTICE 'PR-FIN-DATAS-01: OK — coluna data_vencimento aditiva (date NULL, sem default/índice/NOT NULL); vizinhas intactas.';
END
$t$;

ROLLBACK;
