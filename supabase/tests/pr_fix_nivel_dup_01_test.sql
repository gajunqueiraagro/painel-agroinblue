-- pr_fix_nivel_dup_01_test.sql — suite do PR-FIX-NIVEL-DUP-01
--
-- Rodar SOMENTE em banco local descartavel, DEPOIS de aplicar
-- 20260818120000_pr_fix_nivel_dup_01.sql. Uma transacao encerrada em
-- RAISE EXCEPTION proposital: residuo zero.
--
-- ESCOPO DESTA SUITE: gates SQL reais, com valores literais esperados.
-- FORA DESTA SUITE, por natureza (registrado no relatorio, nao contabilizado aqui):
--   - prova mecanica de ausencia de `USING NULL` (grep sobre o arquivo, no runner);
--   - execucao do rollback_seguro.sql real (DDL, no runner, fora da transacao);
--   - cobertura de OFX/Enriquecimento/Conciliacao (estrutural, por codigo).
--
-- ARVORE REAL de classificar_nivel_duplicidade (migration 20260410150628):
--   _diff_count soma 1 por divergencia em: data_pagamento, valor(<=20%),
--   descricao, subcentro, numero_documento(so' se ambos preenchidos),
--   tipo_operacao, conta_bancaria. Valor com divergencia >20% soma 3 e marca
--   _valor_significant.
--   diff=0                          -> 'D1'
--   _valor_significant              -> 'LEGITIMO'
--   diff<=2 AND NOT _doc_diverge    -> 'D2'
--   diff<=3                         -> 'D3'
--   senao                           -> 'LEGITIMO'
-- DENTRO do loop do trigger, cliente/fazenda/data_pagamento/valor/tipo_operacao/
-- conta_bancaria ja sao IGUAIS por construcao do WHERE. Logo _diff_count so'
-- pode crescer por descricao, subcentro e documento — maximo 3 — e
-- _valor_significant e' INALCANCAVEL. D1, D2 e D3 sao todos alcancaveis;
-- 'LEGITIMO' vindo da funcao NAO e' alcancavel dentro do loop.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _r(gate text primary key, passou boolean, detalhe text) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION pg_temp.reg(g text, c boolean, d text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _r VALUES (g,c,d) ON CONFLICT (gate) DO UPDATE SET passou=excluded.passou, detalhe=excluded.detalhe;
  RAISE NOTICE '[%] % %', CASE WHEN c THEN 'PASS' ELSE 'FALHA' END, g, d;
END $$;

-- ══ G1 — estado pos-migration: coluna ═══════════════════════════════════════
DO $t$
DECLARE v_tipo text; v_nn boolean; v_def text;
BEGIN
  SELECT format_type(a.atttypid,a.atttypmod), a.attnotnull, pg_get_expr(d.adbin,d.adrelid)
    INTO v_tipo, v_nn, v_def FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='public.financeiro_lancamentos_v2'::regclass AND a.attname='nivel_duplicidade';
  PERFORM pg_temp.reg('G1.1 tipo = text',        v_tipo='text', coalesce(v_tipo,'?'));
  PERFORM pg_temp.reg('G1.2 nullable',           v_nn IS FALSE, coalesce(v_nn::text,'?'));
  PERFORM pg_temp.reg('G1.3 sem default',        v_def IS NULL, coalesce(v_def,'NULL'));
END $t$;

-- ══ G2 — funcao e trigger nominais ══════════════════════════════════════════
DO $t$
DECLARE v_oid oid := 'public.enforce_financeiro_lancamento_v2_unique_hash()'::regprocedure;
        v_md5 text; v_sec boolean; v_own text; v_sp text; v_ret text; v_args text; v_trg record;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)), p.prosecdef, pg_get_userbyid(p.proowner),
         coalesce(array_to_string(p.proconfig,','),'(NAO FIXADO)'),
         pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid)
    INTO v_md5, v_sec, v_own, v_sp, v_ret, v_args FROM pg_proc p WHERE p.oid=v_oid;
  PERFORM pg_temp.reg('G2.1 md5 = 01f23546174e9b2eb1c976cfac5a0695',
                      v_md5='01f23546174e9b2eb1c976cfac5a0695', coalesce(v_md5,'?'));
  PERFORM pg_temp.reg('G2.2 SECURITY INVOKER',  v_sec IS FALSE, coalesce(v_sec::text,'?'));
  PERFORM pg_temp.reg('G2.3 owner = postgres',  v_own='postgres', coalesce(v_own,'?'));
  PERFORM pg_temp.reg('G2.4 search_path=public',v_sp='search_path=public', coalesce(v_sp,'?'));
  PERFORM pg_temp.reg('G2.5 retorna trigger, zero args', v_ret='trigger' AND v_args='',
                      format('%s(%s)', v_ret, v_args));

  SELECT t.tgname, t.tgenabled, t.tgisinternal, t.tgtype, t.tgfoid, pg_get_triggerdef(t.oid) def
    INTO v_trg FROM pg_trigger t
   WHERE t.tgrelid='public.financeiro_lancamentos_v2'::regclass
     AND t.tgname='trg_financeiro_lancamento_v2_unique_hash';
  PERFORM pg_temp.reg('G2.6 trigger nominal presente, habilitado, nao interno',
    v_trg.tgname IS NOT NULL AND v_trg.tgenabled='O' AND NOT v_trg.tgisinternal,
    format('enabled=%s interno=%s', v_trg.tgenabled, v_trg.tgisinternal));
  PERFORM pg_temp.reg('G2.7 trigger BEFORE + ROW + INSERT + UPDATE',
    (v_trg.tgtype & 1)>0 AND (v_trg.tgtype & 2)>0 AND (v_trg.tgtype & 4)>0 AND (v_trg.tgtype & 16)>0,
    'tgtype='||v_trg.tgtype);
  PERFORM pg_temp.reg('G2.8 trigger aponta para a funcao exata', v_trg.tgfoid=v_oid,
    v_trg.tgfoid::regprocedure::text);
  PERFORM pg_temp.reg('G2.9 colunas vigiadas do UPDATE conferem',
    v_trg.def ~ 'UPDATE OF cliente_id, fazenda_id, data_pagamento, valor, tipo_operacao, conta_bancaria_id, cancelado, lote_importacao_id');
END $t$;

-- ══ FIXTURE ═════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _ctx(k text primary key, v text) ON COMMIT DROP;
DO $t$
DECLARE c uuid:=gen_random_uuid();
BEGIN
  INSERT INTO public.clientes(id,nome,slug,ativo) VALUES (c,'ZZ ND01','zz-nd01',true);
  INSERT INTO _ctx VALUES ('cli',c::text),('faz',gen_random_uuid()::text),
    ('conta',gen_random_uuid()::text),('lote',gen_random_uuid()::text),('fav',gen_random_uuid()::text);
END $t$;

-- ══ G3 — caminho legitimo COM lote (primeira linha do lote) ═════════════════
DO $t$
DECLARE c uuid:=(SELECT v FROM _ctx WHERE k='cli')::uuid; f uuid:=(SELECT v FROM _ctx WHERE k='faz')::uuid;
        b uuid:=(SELECT v FROM _ctx WHERE k='conta')::uuid; l uuid:=(SELECT v FROM _ctx WHERE k='lote')::uuid;
        fv uuid:=(SELECT v FROM _ctx WHERE k='fav')::uuid; v_niv text; v_id uuid; v_st text;
BEGIN
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id,fazenda_id,conta_bancaria_id,lote_importacao_id,data_pagamento,data_competencia,
     valor,tipo_operacao,descricao,favorecido_id,numero_documento,subcentro,cancelado)
  VALUES (c,f,b,l,DATE '2026-01-10',DATE '2026-01-10',100.00,'2-Saídas','ALFA',fv,'DOC1','SUB1',false)
  RETURNING id, nivel_duplicidade INTO v_id, v_niv;
  INSERT INTO _ctx VALUES ('base', v_id::text);
  PERFORM pg_temp.reg('G3 legitimo com lote: nivel IS NULL, sem erro', v_niv IS NULL, coalesce(v_niv,'NULL'));
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_st=RETURNED_SQLSTATE;
  PERFORM pg_temp.reg('G3 legitimo com lote: nivel IS NULL, sem erro', false, 'SQLSTATE '||v_st);
END $t$;

-- ══ G4 — D1 EXATO: duplicata exata, diff_count = 0 ══════════════════════════
DO $t$
DECLARE c uuid:=(SELECT v FROM _ctx WHERE k='cli')::uuid; f uuid:=(SELECT v FROM _ctx WHERE k='faz')::uuid;
        b uuid:=(SELECT v FROM _ctx WHERE k='conta')::uuid; l uuid:=(SELECT v FROM _ctx WHERE k='lote')::uuid;
        fv uuid:=(SELECT v FROM _ctx WHERE k='fav')::uuid; v_niv text; v_dup boolean; v_id uuid; v_st text;
BEGIN
  -- descricao, subcentro e documento IDENTICOS a base => diff_count = 0 => D1
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id,fazenda_id,conta_bancaria_id,lote_importacao_id,data_pagamento,data_competencia,
     valor,tipo_operacao,descricao,favorecido_id,numero_documento,subcentro,cancelado)
  VALUES (c,f,b,l,DATE '2026-01-10',DATE '2026-01-10',100.00,'2-Saídas','ALFA',fv,'DOC1','SUB1',false)
  RETURNING id, nivel_duplicidade, importado_duplicado INTO v_id, v_niv, v_dup;
  INSERT INTO _ctx VALUES ('d1', v_id::text);
  PERFORM pg_temp.reg('G4.1 duplicata exata: sem 22P02', true, 'insert concluido');
  PERFORM pg_temp.reg('G4.2 nivel = D1 EXATO (diff_count=0)', v_niv = 'D1', coalesce(v_niv,'NULL'));
  PERFORM pg_temp.reg('G4.3 importado_duplicado IS TRUE', v_dup IS TRUE, coalesce(v_dup::text,'NULL'));
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_st=RETURNED_SQLSTATE;
  PERFORM pg_temp.reg('G4.1 duplicata exata: sem 22P02', false, 'SQLSTATE '||v_st||' — DEFEITO PRESENTE');
  PERFORM pg_temp.reg('G4.2 nivel = D1 EXATO (diff_count=0)', false, 'nao executado');
  PERFORM pg_temp.reg('G4.3 importado_duplicado IS TRUE', false, 'nao executado');
END $t$;

-- ══ G5 — D2 EXATO: 1 divergencia (descricao), sem divergencia de documento ══
DO $t$
DECLARE c uuid:=(SELECT v FROM _ctx WHERE k='cli')::uuid; f uuid:=(SELECT v FROM _ctx WHERE k='faz')::uuid;
        b uuid:=(SELECT v FROM _ctx WHERE k='conta')::uuid; l uuid:=(SELECT v FROM _ctx WHERE k='lote')::uuid;
        fv uuid:=(SELECT v FROM _ctx WHERE k='fav')::uuid; v_niv text; v_st text;
BEGIN
  -- descricao DIFERENTE (+1); subcentro igual; documento IGUAL => doc_diverge=false
  -- diff_count = 1 <= 2 AND NOT doc_diverge => D2
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id,fazenda_id,conta_bancaria_id,lote_importacao_id,data_pagamento,data_competencia,
     valor,tipo_operacao,descricao,favorecido_id,numero_documento,subcentro,cancelado)
  VALUES (c,f,b,l,DATE '2026-01-10',DATE '2026-01-10',100.00,'2-Saídas','BETA',fv,'DOC1','SUB1',false)
  RETURNING nivel_duplicidade INTO v_niv;
  PERFORM pg_temp.reg('G5 nivel = D2 EXATO (diff=1, doc igual)', v_niv = 'D2', coalesce(v_niv,'NULL'));
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_st=RETURNED_SQLSTATE;
  PERFORM pg_temp.reg('G5 nivel = D2 EXATO (diff=1, doc igual)', false, 'SQLSTATE '||v_st);
END $t$;

-- ══ G6 — D3 EXATO: documento divergente (doc_diverge=true) ══════════════════
DO $t$
DECLARE c uuid:=(SELECT v FROM _ctx WHERE k='cli')::uuid; f uuid:=(SELECT v FROM _ctx WHERE k='faz')::uuid;
        b uuid:=(SELECT v FROM _ctx WHERE k='conta')::uuid; l uuid:=(SELECT v FROM _ctx WHERE k='lote')::uuid;
        fv uuid:=(SELECT v FROM _ctx WHERE k='fav')::uuid; v_niv text; v_st text;
BEGIN
  -- descricao igual, subcentro igual, documento DIFERENTE (+1, doc_diverge=true)
  -- diff_count = 1 mas doc_diverge => cai para o ramo diff<=3 => D3
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id,fazenda_id,conta_bancaria_id,lote_importacao_id,data_pagamento,data_competencia,
     valor,tipo_operacao,descricao,favorecido_id,numero_documento,subcentro,cancelado)
  VALUES (c,f,b,l,DATE '2026-01-10',DATE '2026-01-10',100.00,'2-Saídas','ALFA',fv,'DOC-OUTRO','SUB1',false)
  RETURNING nivel_duplicidade INTO v_niv;
  PERFORM pg_temp.reg('G6 nivel = D3 EXATO (doc_diverge=true)', v_niv = 'D3', coalesce(v_niv,'NULL'));
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_st=RETURNED_SQLSTATE;
  PERFORM pg_temp.reg('G6 nivel = D3 EXATO (doc_diverge=true)', false, 'SQLSTATE '||v_st);
END $t$;

-- ══ G7 — caminhos em que o trigger SAI CEDO (RETURN NEW antes do loop) ══════
DO $t$
DECLARE c uuid:=(SELECT v FROM _ctx WHERE k='cli')::uuid; f uuid:=(SELECT v FROM _ctx WHERE k='faz')::uuid;
        b uuid:=(SELECT v FROM _ctx WHERE k='conta')::uuid; l uuid:=(SELECT v FROM _ctx WHERE k='lote')::uuid;
        v_niv text; v_st text;
BEGIN
  -- G7.1 SEM lote: lote_importacao_id IS NULL -> RETURN NEW imediato
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id,fazenda_id,conta_bancaria_id,data_pagamento,data_competencia,valor,tipo_operacao,
     descricao,numero_documento,subcentro,cancelado)
  VALUES (c,f,b,DATE '2026-01-10',DATE '2026-01-10',100.00,'2-Saídas','ALFA','DOC1','SUB1',false)
  RETURNING nivel_duplicidade INTO v_niv;
  PERFORM pg_temp.reg('G7.1 SEM lote: trigger sai cedo, nivel NULL', v_niv IS NULL, coalesce(v_niv,'NULL'));

  -- G7.2 CANCELADO: coalesce(cancelado,false)=true -> RETURN NEW imediato
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id,fazenda_id,conta_bancaria_id,lote_importacao_id,data_pagamento,data_competencia,
     valor,tipo_operacao,descricao,numero_documento,subcentro,cancelado)
  VALUES (c,f,b,l,DATE '2026-01-10',DATE '2026-01-10',100.00,'2-Saídas','ALFA','DOC1','SUB1',true)
  RETURNING nivel_duplicidade INTO v_niv;
  PERFORM pg_temp.reg('G7.2 CANCELADO: trigger sai cedo, nivel NULL', v_niv IS NULL, coalesce(v_niv,'NULL'));
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_st=RETURNED_SQLSTATE;
  PERFORM pg_temp.reg('G7.1 SEM lote: trigger sai cedo, nivel NULL', false, 'SQLSTATE '||v_st);
END $t$;

-- ══ G8 — UPDATE de coluna vigiada re-executa o trigger ══════════════════════
DO $t$
DECLARE v_id uuid:=(SELECT v FROM _ctx WHERE k='d1')::uuid; v_niv text; v_st text;
BEGIN
  UPDATE public.financeiro_lancamentos_v2 SET valor = 100.00 WHERE id = v_id
    RETURNING nivel_duplicidade INTO v_niv;
  PERFORM pg_temp.reg('G8 UPDATE de coluna vigiada: sem 22P02, nivel = D1', v_niv='D1', coalesce(v_niv,'NULL'));
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_st=RETURNED_SQLSTATE;
  PERFORM pg_temp.reg('G8 UPDATE de coluna vigiada: sem 22P02, nivel = D1', false, 'SQLSTATE '||v_st);
END $t$;

-- ══ G9 — lock REAL observado durante o ALTER TYPE ═══════════════════════════
DO $t$
DECLARE v_t0 timestamptz; v_ms numeric; v_lock text; v_n bigint;
BEGIN
  CREATE TEMP TABLE _perf(id serial, nivel_duplicidade integer);
  INSERT INTO _perf(nivel_duplicidade) SELECT NULL FROM generate_series(1,81593);
  SELECT count(*) INTO v_n FROM _perf;
  v_t0 := clock_timestamp();
  ALTER TABLE _perf ALTER COLUMN nivel_duplicidade TYPE text USING nivel_duplicidade::text;
  v_ms := round(extract(epoch FROM (clock_timestamp()-v_t0))*1000,1);
  -- ainda na MESMA transacao: o lock continua mantido, sem fallback
  SELECT mode INTO v_lock FROM pg_locks
   WHERE relation='_perf'::regclass AND mode='AccessExclusiveLock' AND granted LIMIT 1;
  PERFORM pg_temp.reg('G9.1 lock observado = AccessExclusiveLock (sem fallback)',
                      v_lock = 'AccessExclusiveLock', coalesce(v_lock,'(NAO OBSERVADO)'));
  PERFORM pg_temp.reg('G9.2 ALTER TYPE executado sobre 81.593 linhas', v_n = 81593,
                      format('%s linhas em %s ms — tabela SINTETICA simplificada, referencia local', v_n, v_ms));
  DROP TABLE _perf;
END $t$;

-- ══ RESULTADO ═══════════════════════════════════════════════════════════════
DO $t$
DECLARE v_tot int; v_ok int; v_bad text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE passou) INTO v_tot, v_ok FROM _r;
  SELECT string_agg(gate||' ('||detalhe||')', E'\n  ' ORDER BY gate) INTO v_bad FROM _r WHERE NOT passou;
  RAISE NOTICE '';
  RAISE NOTICE '════════ GATES SQL REAIS: %/% ════════', v_ok, v_tot;
  IF v_bad IS NOT NULL THEN RAISE NOTICE 'FALHARAM:%', E'\n  '||v_bad; END IF;
  IF v_ok <> v_tot THEN RAISE EXCEPTION 'SUITE VERMELHA: %/%', v_ok, v_tot; END IF;
  RAISE EXCEPTION 'SUITE VERDE (%/%). ROLLBACK proposital — residuo zero.', v_ok, v_tot;
END $t$;

ROLLBACK;
