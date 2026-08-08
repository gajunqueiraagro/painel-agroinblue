-- 20260818120000_pr_fix_nivel_dup_01.sql
-- PR-FIX-NIVEL-DUP-01 — remove o impeditivo 22P02 no enforcement de duplicidade.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-08).
-- public.enforce_financeiro_lancamento_v2_unique_hash() declara
--     _best_nivel text := 'LEGITIMO';
-- e, ao detectar duplicata, executa
--     NEW.nivel_duplicidade := _best_nivel;   -- 'D1' | 'D2' | 'D3'
-- Em financeiro_lancamentos_v2 a coluna nivel_duplicidade esta como INTEGER no
-- proto, entao essa atribuicao levanta
--     SQLSTATE 22P02  invalid input syntax for type integer: "D1"
-- O caminho legitimo NAO falha: 'LEGITIMO' cai no ELSE e grava NULL. O defeito e'
-- LATENTE — dispara so' na deteccao de duplicata, e so' quando
-- lote_importacao_id IS NOT NULL e cancelado = false.
--
-- O REPO SEMPRE DECLAROU TEXT. A migration de origem
-- 20260410125456_b87534ca-ff24-4014-8ea6-f65d655059e5.sql grava, na linha 28:
--     ADD COLUMN IF NOT EXISTS nivel_duplicidade text DEFAULT NULL;
-- e nenhuma das 473 migrations converte para integer. O INTEGER do proto e'
-- DRIFT REMOTO. Todas as demais camadas ja esperam TEXT:
--   - public.classificar_nivel_duplicidade(...)   RETURNS text
--   - src/integrations/supabase/types.ts          nivel_duplicidade: string | null
--   - src/hooks/useFinanceiro.ts:728              'D1' | 'D2' | 'D3' | 'LEGITIMO'
-- Esta migration NAO redesenha contrato: RESTAURA a coluna ao tipo versionado.
--
-- ESCOPO. Somente o tipo da coluna. Funcao, trigger, owner, SECURITY INVOKER,
-- ACL, search_path, indices, constraints e policies ficam INTOCADOS — e isso e'
-- EXIGIDO nominalmente nos pre e pos-checks, nao apenas congelado.
--
-- IDEMPOTENTE. integer + zero nao-NULL -> converte. text -> no-op validado.
-- Qualquer outro estado -> aborta.
-- `USING NULL` e' PROIBIDO. A conversao usa `USING nivel_duplicidade::text`.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim: o contrato textual e' o da migration 20260410125456.
--   (b) Reutilizar? Sim: restaura o tipo original, sem inventar escala numerica.
--   (c) Fonte soberana? A migration versionada, nao o estado derivado do proto.
--   (d) Segunda forma? Nao. Um unico ALTER COLUMN TYPE.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz: encerra o drift nesta coluna. O contrato unico de
--       deduplicacao permanece aberto em PR-CONTRATO-DEDUP-01.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- N.0 PRE-CHECKS FATAIS ------------------------------------------------------------------------
DO $$
DECLARE
  MD5_AUTORIZADO constant text := '01f23546174e9b2eb1c976cfac5a0695';
  OWNER_ESPERADO constant text := 'postgres';
  SP_ESPERADO    constant text := 'search_path=public';
  TRG_NOME       constant text := 'trg_financeiro_lancamento_v2_unique_hash';
  v_oid oid; v_md5 text; v_owner text; v_sp text; v_secdef boolean;
  v_ret text; v_args text; v_acl text;
  v_tipo text; v_notnull boolean; v_default text; v_naonulos bigint; v_total bigint;
  v_trg record; v_ncon int; v_nidx int; v_ndep int;
BEGIN
  ----------------------------------------------------------------- tabela
  IF to_regclass('public.financeiro_lancamentos_v2') IS NULL THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: tabela financeiro_lancamentos_v2 inexistente';
  END IF;

  ------------------------------------------------- CORRECAO 1 + 3: a FUNCAO
  -- assinatura EXATA por regprocedure; se nao existir, ::regprocedure ja levanta erro
  v_oid := 'public.enforce_financeiro_lancamento_v2_unique_hash()'::regprocedure;

  SELECT md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proconfig, ','), '(NAO FIXADO)'), p.prosecdef,
         pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid),
         coalesce(p.proacl::text, '(default)')
    INTO v_md5, v_owner, v_sp, v_secdef, v_ret, v_args, v_acl
    FROM pg_proc p WHERE p.oid = v_oid;

  IF v_md5 <> MD5_AUTORIZADO THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: md5 da funcao divergente. esperado=% obtido=%',
                    MD5_AUTORIZADO, v_md5;
  END IF;
  IF v_owner <> OWNER_ESPERADO THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: owner da funcao esperado=% obtido=%', OWNER_ESPERADO, v_owner;
  END IF;
  IF v_secdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: funcao deveria ser SECURITY INVOKER (prosecdef=false), obtido prosecdef=%', v_secdef;
  END IF;
  IF v_sp <> SP_ESPERADO THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: search_path da funcao esperado="%" obtido="%"', SP_ESPERADO, v_sp;
  END IF;
  IF v_ret <> 'trigger' THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: rettype da funcao esperado=trigger obtido=%', v_ret;
  END IF;
  IF v_args <> '' THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: funcao deveria ter zero argumentos, obtido="%"', v_args;
  END IF;
  PERFORM set_config('app.nd01_fn_acl',   v_acl,   true);
  PERFORM set_config('app.nd01_fn_owner', v_owner, true);
  PERFORM set_config('app.nd01_fn_sp',    v_sp,    true);

  ------------------------------------------------- CORRECAO 2: o TRIGGER nominal
  SELECT t.tgname, t.tgenabled, t.tgisinternal, t.tgtype, t.tgfoid,
         pg_get_triggerdef(t.oid) AS def
    INTO v_trg
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.financeiro_lancamentos_v2'::regclass
     AND t.tgname = TRG_NOME;

  IF v_trg.tgname IS NULL THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: trigger % ausente em financeiro_lancamentos_v2', TRG_NOME;
  END IF;
  IF v_trg.tgisinternal THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: trigger % e interno', TRG_NOME;
  END IF;
  IF v_trg.tgenabled <> 'O' THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: trigger % nao esta habilitado (tgenabled=%)', TRG_NOME, v_trg.tgenabled;
  END IF;
  IF v_trg.tgfoid <> v_oid THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: trigger % aponta para funcao %, esperado %',
                    TRG_NOME, v_trg.tgfoid::regprocedure, v_oid::regprocedure;
  END IF;
  -- tgtype: bit 0 = ROW, bit 1 = BEFORE, bit 2 = INSERT, bit 4 = UPDATE
  IF (v_trg.tgtype & 1) = 0 THEN RAISE EXCEPTION 'NIVEL-DUP-01: trigger % nao e FOR EACH ROW', TRG_NOME; END IF;
  IF (v_trg.tgtype & 2) = 0 THEN RAISE EXCEPTION 'NIVEL-DUP-01: trigger % nao e BEFORE', TRG_NOME; END IF;
  IF (v_trg.tgtype & 4) = 0 THEN RAISE EXCEPTION 'NIVEL-DUP-01: trigger % nao cobre INSERT', TRG_NOME; END IF;
  IF (v_trg.tgtype & 16) = 0 THEN RAISE EXCEPTION 'NIVEL-DUP-01: trigger % nao cobre UPDATE', TRG_NOME; END IF;
  -- colunas vigiadas do UPDATE, nominalmente
  IF v_trg.def !~ 'UPDATE OF cliente_id, fazenda_id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, cancelado, lote_importacao_id' THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: lista de colunas do UPDATE do trigger divergente: %', v_trg.def;
  END IF;
  PERFORM set_config('app.nd01_trg_def', v_trg.def, true);

  ------------------------------------------------- CORRECAO 4: a COLUNA
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    INTO v_tipo, v_notnull, v_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.financeiro_lancamentos_v2'::regclass
     AND a.attname = 'nivel_duplicidade' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: coluna nivel_duplicidade inexistente';
  END IF;
  IF v_tipo NOT IN ('integer','text') THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: ABORTADO — tipo inesperado "%". Esperado integer ou text.', v_tipo;
  END IF;
  IF v_notnull THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: coluna deveria ser nullable, obtido NOT NULL';
  END IF;
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: coluna deveria estar sem default, obtido "%"', v_default;
  END IF;

  SELECT count(*) INTO v_ncon FROM pg_constraint
   WHERE conrelid = 'public.financeiro_lancamentos_v2'::regclass
     AND 'nivel_duplicidade' = ANY (
         SELECT a.attname FROM pg_attribute a WHERE a.attrelid = conrelid AND a.attnum = ANY (conkey));
  IF v_ncon <> 0 THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: coluna tem % constraint(s) propria(s); conversao exigiria decisao humana', v_ncon;
  END IF;

  SELECT count(*) INTO v_nidx FROM pg_index i
   WHERE i.indrelid = 'public.financeiro_lancamentos_v2'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid = i.indrelid AND a.attname = 'nivel_duplicidade') = ANY (i.indkey::int[]);
  IF v_nidx <> 0 THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: % indice(s) dependem da coluna; conversao os reconstruiria', v_nidx;
  END IF;

  -- dependencias impeditivas (views, regras, generated columns) sobre a coluna
  SELECT count(*) INTO v_ndep FROM pg_depend d
   WHERE d.refobjid = 'public.financeiro_lancamentos_v2'::regclass
     AND d.refobjsubid = (SELECT a.attnum FROM pg_attribute a
                           WHERE a.attrelid = 'public.financeiro_lancamentos_v2'::regclass
                             AND a.attname = 'nivel_duplicidade')
     AND d.deptype IN ('n','a')
     AND d.classid = 'pg_rewrite'::regclass;
  IF v_ndep <> 0 THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: % dependencia(s) de rewrite (view/regra) sobre a coluna', v_ndep;
  END IF;

  EXECUTE 'SELECT count(*), count(nivel_duplicidade) FROM public.financeiro_lancamentos_v2'
     INTO v_total, v_naonulos;
  IF v_tipo = 'integer' AND v_naonulos > 0 THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: ABORTADO — coluna integer com % valores nao-NULL. '
                    'Nenhum dado foi tocado.', v_naonulos;
  END IF;

  ------------------------------------------------- congela para o pos-check
  PERFORM set_config('app.nd01_tipo_pre',     v_tipo,        true);
  PERFORM set_config('app.nd01_total_pre',    v_total::text, true);
  PERFORM set_config('app.nd01_naonulos_pre', v_naonulos::text, true);
  PERFORM set_config('app.nd01_tbl_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class
       WHERE oid='public.financeiro_lancamentos_v2'::regclass), true);
  PERFORM set_config('app.nd01_tbl_acl', (SELECT coalesce(relacl::text,'') FROM pg_class
       WHERE oid='public.financeiro_lancamentos_v2'::regclass), true);
  PERFORM set_config('app.nd01_idx', (SELECT coalesce(string_agg(indexdef, E'\n' ORDER BY indexname),'')
       FROM pg_indexes WHERE schemaname='public' AND tablename='financeiro_lancamentos_v2'), true);
  PERFORM set_config('app.nd01_con', (SELECT coalesce(string_agg(conname||':'||pg_get_constraintdef(oid), E'\n' ORDER BY conname),'')
       FROM pg_constraint WHERE conrelid='public.financeiro_lancamentos_v2'::regclass), true);
  PERFORM set_config('app.nd01_pol', (SELECT coalesce(string_agg(polname, ',' ORDER BY polname),'')
       FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass), true);

  RAISE NOTICE 'NIVEL-DUP-01 pre-checks OK: md5(fn)=% (autorizado), trigger % nominal, coluna %/nullable/sem default, 0 constraint, 0 indice, linhas=%, nao-nulos=%.',
               v_md5, TRG_NOME, v_tipo, v_total, v_naonulos;
END $$;


-- N.1 CONVERSAO CONDICIONAL IDEMPOTENTE ----------------------------------------------------------
DO $$
DECLARE
  v_tipo text := current_setting('app.nd01_tipo_pre', true);
  v_t0 timestamptz; v_ms numeric;
BEGIN
  IF v_tipo = 'text' THEN
    RAISE NOTICE 'NIVEL-DUP-01: coluna ja e text — NO-OP. Nada a converter.';
  ELSE
    v_t0 := clock_timestamp();
    -- CORRECAO 5: USING explicito. `USING NULL` e' PROIBIDO — o cast preserva
    -- qualquer valor existente (aqui a coluna esta comprovadamente vazia).
    ALTER TABLE public.financeiro_lancamentos_v2
      ALTER COLUMN nivel_duplicidade TYPE text
      USING nivel_duplicidade::text;
    v_ms := round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000, 1);
    RAISE NOTICE 'NIVEL-DUP-01: integer -> text CONVERTIDO em % ms (ACCESS EXCLUSIVE durante o rewrite).', v_ms;
  END IF;
END $$;


-- N.2 POS-CHECKS FATAIS --------------------------------------------------------------------------
DO $$
DECLARE
  MD5_AUTORIZADO constant text := '01f23546174e9b2eb1c976cfac5a0695';
  v_oid oid := 'public.enforce_financeiro_lancamento_v2_unique_hash()'::regprocedure;
  v_tipo text; v_notnull boolean; v_default text; v_total bigint; v_naonulos bigint;
  v_md5 text; v_acl text; v_owner text; v_sp text; v_secdef boolean;
BEGIN
  ----------------------------------------------------------------- coluna
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    INTO v_tipo, v_notnull, v_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='public.financeiro_lancamentos_v2'::regclass
     AND a.attname='nivel_duplicidade' AND a.attnum>0 AND NOT a.attisdropped;
  IF v_tipo <> 'text'   THEN RAISE EXCEPTION 'NIVEL-DUP-01: tipo final e "%", esperado text', v_tipo; END IF;
  IF v_notnull          THEN RAISE EXCEPTION 'NIVEL-DUP-01: coluna virou NOT NULL'; END IF;
  IF v_default IS NOT NULL THEN RAISE EXCEPTION 'NIVEL-DUP-01: coluna ganhou default "%"', v_default; END IF;

  ------------------------------------------------- funcao: md5 literal + antes x depois
  SELECT md5(pg_get_functiondef(p.oid)), coalesce(p.proacl::text,'(default)'),
         pg_get_userbyid(p.proowner), coalesce(array_to_string(p.proconfig,','),'(NAO FIXADO)'), p.prosecdef
    INTO v_md5, v_acl, v_owner, v_sp, v_secdef
    FROM pg_proc p WHERE p.oid = v_oid;
  IF v_md5 <> MD5_AUTORIZADO THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: md5 final da funcao esperado=% obtido=%', MD5_AUTORIZADO, v_md5;
  END IF;
  IF v_acl   IS DISTINCT FROM current_setting('app.nd01_fn_acl', true)   THEN RAISE EXCEPTION 'NIVEL-DUP-01: ACL da funcao mudou'; END IF;
  IF v_owner IS DISTINCT FROM current_setting('app.nd01_fn_owner', true) THEN RAISE EXCEPTION 'NIVEL-DUP-01: owner da funcao mudou'; END IF;
  IF v_sp    IS DISTINCT FROM current_setting('app.nd01_fn_sp', true)    THEN RAISE EXCEPTION 'NIVEL-DUP-01: search_path da funcao mudou'; END IF;
  IF v_secdef IS DISTINCT FROM false THEN RAISE EXCEPTION 'NIVEL-DUP-01: funcao deixou de ser SECURITY INVOKER'; END IF;

  ------------------------------------------------- trigger: definicao canonica
  IF (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
       WHERE t.tgrelid='public.financeiro_lancamentos_v2'::regclass
         AND t.tgname='trg_financeiro_lancamento_v2_unique_hash')
     IS DISTINCT FROM current_setting('app.nd01_trg_def', true) THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: definicao do trigger mudou';
  END IF;

  ------------------------------------------------- tabela: owner, ACL, idx, con, pol
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.financeiro_lancamentos_v2'::regclass)
     IS DISTINCT FROM current_setting('app.nd01_tbl_owner', true) THEN RAISE EXCEPTION 'NIVEL-DUP-01: owner da tabela mudou'; END IF;
  IF (SELECT coalesce(relacl::text,'') FROM pg_class WHERE oid='public.financeiro_lancamentos_v2'::regclass)
     IS DISTINCT FROM current_setting('app.nd01_tbl_acl', true) THEN RAISE EXCEPTION 'NIVEL-DUP-01: ACL da tabela mudou'; END IF;
  IF (SELECT coalesce(string_agg(indexdef, E'\n' ORDER BY indexname),'') FROM pg_indexes
       WHERE schemaname='public' AND tablename='financeiro_lancamentos_v2')
     IS DISTINCT FROM current_setting('app.nd01_idx', true) THEN RAISE EXCEPTION 'NIVEL-DUP-01: indices mudaram'; END IF;
  IF (SELECT coalesce(string_agg(conname||':'||pg_get_constraintdef(oid), E'\n' ORDER BY conname),'') FROM pg_constraint
       WHERE conrelid='public.financeiro_lancamentos_v2'::regclass)
     IS DISTINCT FROM current_setting('app.nd01_con', true) THEN RAISE EXCEPTION 'NIVEL-DUP-01: constraints mudaram'; END IF;
  IF (SELECT coalesce(string_agg(polname, ',' ORDER BY polname),'') FROM pg_policy
       WHERE polrelid='public.financeiro_lancamentos_v2'::regclass)
     IS DISTINCT FROM current_setting('app.nd01_pol', true) THEN RAISE EXCEPTION 'NIVEL-DUP-01: policies mudaram'; END IF;

  ------------------------------------------------- dado preservado
  EXECUTE 'SELECT count(*), count(nivel_duplicidade) FROM public.financeiro_lancamentos_v2'
     INTO v_total, v_naonulos;
  IF v_total::text IS DISTINCT FROM current_setting('app.nd01_total_pre', true) THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: volumetria mudou (% -> %)', current_setting('app.nd01_total_pre', true), v_total;
  END IF;
  IF v_naonulos::text IS DISTINCT FROM current_setting('app.nd01_naonulos_pre', true) THEN
    RAISE EXCEPTION 'NIVEL-DUP-01: contagem de nao-nulos mudou (% -> %)',
                    current_setting('app.nd01_naonulos_pre', true), v_naonulos;
  END IF;

  RAISE NOTICE 'NIVEL-DUP-01 pos-checks OK: tipo=text/nullable/sem default; md5(fn)=% literal; trigger, owner, ACL, search_path, SECDEF, indices, constraints e policies inalterados; linhas=%, nao-nulos=%.',
               v_md5, v_total, v_naonulos;
END $$;


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- FALHA FECHADA: se existir QUALQUER valor nao-NULL em nivel_duplicidade, o rollback ABORTA.
-- Nenhum D1/D2/D3 e' apagado automaticamente. `USING NULL` e' PROIBIDO tambem aqui.
-- Reverter reintroduz o defeito 22P02 na deteccao de duplicata.
-- ------------------------------------------------------------------------------------------------
-- DO $rb$
-- DECLARE v_tipo text; v_naonulos bigint;
-- BEGIN
--   SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo FROM pg_attribute a
--    WHERE a.attrelid='public.financeiro_lancamentos_v2'::regclass
--      AND a.attname='nivel_duplicidade' AND a.attnum>0 AND NOT a.attisdropped;
--   IF v_tipo <> 'text' THEN
--     RAISE EXCEPTION 'rollback NIVEL-DUP-01: tipo atual e "%", nada a reverter', v_tipo;
--   END IF;
--
--   EXECUTE 'SELECT count(nivel_duplicidade) FROM public.financeiro_lancamentos_v2' INTO v_naonulos;
--   IF v_naonulos > 0 THEN
--     RAISE EXCEPTION 'rollback NIVEL-DUP-01: ABORTADO — % valor(es) nao-NULL em '
--                     'nivel_duplicidade. Reverter para integer os destruiria. '
--                     'Decisao humana obrigatoria; nenhum dado foi tocado.', v_naonulos;
--   END IF;
--
--   ALTER TABLE public.financeiro_lancamentos_v2
--     ALTER COLUMN nivel_duplicidade TYPE integer USING nivel_duplicidade::integer;
--
--   RAISE NOTICE 'rollback NIVEL-DUP-01 OK: coluna de volta a integer. DEFEITO 22P02 REINTRODUZIDO.';
-- END $rb$;
-- ================================================================================================
