-- SEC-RPC-TENANT-01B-A — teste do guard de tenant em fn_cancelar_lancamento_auditoria.
--   Requer a migration 20260728130000 aplicada. BEGIN...ROLLBACK; usuários fabricados + 2 clientes
--   reais. Simula `authenticated` via claim JWT (auth.uid()). Alvos escolhidos sem vínculo de
--   conciliação ativo e em mês aberto (cancelamento limpo). Rodar SOMENTE no PROTO. Não persiste.
BEGIN;

DO $t$
DECLARE
  v_cliA uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';  -- Vera Ligia Milani
  v_cliB uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';  -- NJ Pecuária
  v_userA uuid := gen_random_uuid(); v_admin uuid := gen_random_uuid();
  v_lanA uuid; v_lanB uuid; v_res jsonb; v_ok boolean; v_cnt int;
BEGIN
  INSERT INTO public.cliente_membros (user_id,cliente_id,perfil,ativo) VALUES
    (v_userA,v_cliA,'membro',true),(v_admin,v_cliA,'admin_agroinblue',true);

  SELECT id INTO v_lanA FROM public.financeiro_lancamentos_v2 x
   WHERE x.cliente_id=v_cliA AND coalesce(x.cancelado,false)=false
     AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id=x.id AND c.desfeito_em IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id=x.cliente_id AND f.fazenda_id=x.fazenda_id AND f.ano_mes=x.ano_mes AND f.status_fechamento='fechado')
   LIMIT 1;
  SELECT id INTO v_lanB FROM public.financeiro_lancamentos_v2 x
   WHERE x.cliente_id=v_cliB AND coalesce(x.cancelado,false)=false
     AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id=x.id AND c.desfeito_em IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id=x.cliente_id AND f.fazenda_id=x.fazenda_id AND f.ano_mes=x.ano_mes AND f.status_fechamento='fechado')
   LIMIT 1;
  IF v_lanA IS NULL OR v_lanB IS NULL THEN RAISE EXCEPTION 'fixture: exige lançamentos limpos em A e B'; END IF;

  -- ===== T1: userA cancela lançamento do PRÓPRIO cliente A -> PASS =====
  PERFORM set_config('request.jwt.claim.sub', v_userA::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.fn_cancelar_lancamento_auditoria(v_lanA, 'teste_01b_a_proprio');
  IF coalesce((v_res->>'ok')::boolean,false) <> true THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T1 FAIL: retorno %',v_res; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE id=v_lanA AND cancelado=true;
  IF v_cnt<>1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T1 FAIL: lançamento A não cancelado'; END IF;

  -- ===== T2: userA cancela lançamento do cliente B -> ERRO =====
  v_ok := false;
  BEGIN
    v_res := public.fn_cancelar_lancamento_auditoria(v_lanB, 'teste_01b_a_cross');
  EXCEPTION WHEN others THEN
    v_ok := (SQLERRM = 'Operação não autorizada para este cliente');
  END;
  IF NOT v_ok THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T2 FAIL: cancelamento cross-tenant NÃO bloqueado (res=%)',v_res; END IF;
  -- confirma que B permaneceu NÃO cancelado
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE id=v_lanB AND coalesce(cancelado,false)=true;
  IF v_cnt<>0 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T2 FAIL: lançamento B foi cancelado'; END IF;
  EXECUTE 'RESET ROLE';

  -- ===== T3: admin cancela lançamento de QUALQUER cliente (B) -> PASS =====
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.fn_cancelar_lancamento_auditoria(v_lanB, 'teste_01b_a_admin');
  IF coalesce((v_res->>'ok')::boolean,false) <> true THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T3 FAIL: admin retorno %',v_res; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE id=v_lanB AND cancelado=true;
  IF v_cnt<>1 THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'T3 FAIL: admin não cancelou B'; END IF;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '=== SEC-RPC-TENANT-01B-A: T1..T3 PASS ===';
END $t$;

ROLLBACK;  -- nada persiste
SELECT 'sec_rpc_tenant_01b_a_rolled_back' AS fim;
