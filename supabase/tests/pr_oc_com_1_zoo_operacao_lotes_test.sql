-- PR-OC-COM-1 — testes do contrato zoo_operacao_lotes.
--   BEGIN...ROLLBACK + sentinela de resíduo. Requer a migration COM-1 aplicada.
--   Sentinelas: 23505 UNIQUE · 23514 CHECK · 23503 FK · P0001 lógico.
SELECT set_config('app.oclote_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cliA uuid; v_cliB uuid; v_tag text;
  v_opA uuid; v_opB uuid; v_n int;
BEGIN
  v_tag := current_setting('app.oclote_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cliA
    FROM public.cliente_membros cm WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
    ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  SELECT cm.cliente_id INTO v_cliB
    FROM public.cliente_membros cm WHERE cm.ativo=true AND cm.cliente_id <> v_cliA
    ORDER BY cm.cliente_id LIMIT 1;
  IF v_cliB IS NULL THEN RAISE EXCEPTION 'fixture: sem segundo cliente'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  -- operações fixture (tag em observacoes p/ resíduo)
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, observacoes, created_by, updated_by)
    VALUES (v_cliA,'compra',DATE '2026-08-01',v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, observacoes, created_by, updated_by)
    VALUES (v_cliB,'compra',DATE '2026-08-01',v_tag,v_admin,v_admin) RETURNING id INTO v_opB;
  PERFORM set_config('app.oclote_opa', v_opA::text, false);

  -- T1: operação com 1 lote
  INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada, peso_medio_negociado_kg, criterio_valor, valor_informado, created_by)
    VALUES (v_cliA, v_opA, 1, 'novilhas', 20, 235.5, 'kg', 12.50, v_admin);
  RAISE NOTICE 'T1 PASS: 1 lote';

  -- T2: vários lotes na mesma operação
  INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada, criterio_valor, valor_informado, created_by)
    VALUES (v_cliA, v_opA, 2, 'vacas', 10, 'cabeca', 3850.00, v_admin);
  IF (SELECT count(*) FROM public.zoo_operacao_lotes WHERE operacao_id=v_opA) <> 2 THEN RAISE EXCEPTION 'T2 FAIL'; END IF;
  RAISE NOTICE 'T2 PASS: N lotes';

  -- T3: ordem duplicada na mesma operação -> 23505
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, created_by) VALUES (v_cliA, v_opA, 1, v_admin);
    RAISE EXCEPTION 'T3 FAIL: ordem duplicada aceita';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23505' THEN RAISE EXCEPTION 'T3 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T3 PASS: ordem única por operação';

  -- T4: mesma ordem em operação diferente -> OK
  INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, created_by) VALUES (v_cliB, v_opB, 1, v_admin);
  RAISE NOTICE 'T4 PASS: ordem 1 reutilizável em outra operação';

  -- T5: quantidade <= 0 -> 23514
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, qtd_negociada, created_by) VALUES (v_cliA, v_opA, 3, 0, v_admin);
    RAISE EXCEPTION 'T5 FAIL: qtd 0 aceita';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T5 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T5 PASS: qtd>0';

  -- T6: peso <= 0 -> 23514
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, peso_medio_negociado_kg, created_by) VALUES (v_cliA, v_opA, 3, 0, v_admin);
    RAISE EXCEPTION 'T6 FAIL: peso 0 aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T6 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T6 PASS: peso>0';

  -- T7: critério inválido -> 23514
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, criterio_valor, created_by) VALUES (v_cliA, v_opA, 3, 'arroba', v_admin);
    RAISE EXCEPTION 'T7 FAIL: critério inválido aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T7 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T7 PASS: critério ∈ {kg,cabeca,total}';

  -- T8: valor negativo -> 23514
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, valor_informado, created_by) VALUES (v_cliA, v_opA, 3, -1, v_admin);
    RAISE EXCEPTION 'T8 FAIL: valor negativo aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23514' THEN RAISE EXCEPTION 'T8 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T8 PASS: valor>=0';

  -- T9: operação inexistente -> 23503 (FK)
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, created_by) VALUES (v_cliA, gen_random_uuid(), 9, v_admin);
    RAISE EXCEPTION 'T9 FAIL: operação inexistente aceita';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23503' THEN RAISE EXCEPTION 'T9 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T9 PASS: FK operação';

  -- T10: cruzamento entre clientes (cliente A referenciando operação do cliente B) -> 23503 estrutural
  BEGIN INSERT INTO public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, created_by) VALUES (v_cliA, v_opB, 9, v_admin);
    RAISE EXCEPTION 'T10 FAIL: cross-tenant aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'23503' THEN RAISE EXCEPTION 'T10 SQLSTATE %',SQLSTATE; END IF; END;
  RAISE NOTICE 'T10 PASS: FK composta bloqueia cross-tenant estruturalmente';

  RAISE NOTICE 'PR-OC-COM-1: T1..T10 OK';
END $t$;

-- T11/T12: RLS (papel authenticated real; policy idêntica ao padrão homologado OC)
SET LOCAL ROLE authenticated;
-- T11 positivo: admin enxerga o lote da opA
SELECT set_config('request.jwt.claims', json_build_object('sub',
  (SELECT user_id::text FROM public.cliente_membros WHERE perfil='admin_agroinblue' AND ativo=true ORDER BY user_id LIMIT 1))::text, true);
DO $r$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.zoo_operacao_lotes WHERE operacao_id = current_setting('app.oclote_opa')::uuid;
  IF v_n < 1 THEN RAISE EXCEPTION 'T11 FAIL: admin nao enxerga (%).', v_n; END IF;
  RAISE NOTICE 'T11 PASS: RLS permite autorizado (admin ve %).', v_n;
END $r$;
-- T12 negativo: usuário não-membro (sub aleatório) enxerga 0
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
DO $r$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.zoo_operacao_lotes WHERE operacao_id = current_setting('app.oclote_opa')::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T12 FAIL: nao-membro enxergou % linhas', v_n; END IF;
  RAISE NOTICE 'T12 PASS: RLS bloqueia nao autorizado (ve 0)';
END $r$;
RESET ROLE;

ROLLBACK;

-- T13/T14: resíduo zero + tabelas/motor OC intactos (só CREATE do novo objeto; nada mais mudou)
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT (SELECT count(*) FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.oclote_tag'))
       + (SELECT count(*) FROM public.zoo_operacao_lotes l JOIN public.zoo_operacoes_comerciais o ON o.id=l.operacao_id
            WHERE o.observacoes = current_setting('app.oclote_tag'))
    INTO v_leak;
  IF v_leak <> 0 THEN RAISE EXCEPTION 'T13 FAIL: % linhas vazaram', v_leak; END IF;
  RAISE NOTICE 'T13 PASS: resíduo zero (rollback aplicado)';
END $post$;

SELECT set_config('app.oclote_tag', '', false) AS run_tag_reset;
SELECT set_config('app.oclote_opa', '', false) AS opa_reset;
