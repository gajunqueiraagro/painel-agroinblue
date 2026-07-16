-- PR-M9-AJUSTES-SUGERIDOS — Teste transacional de fn_ajustes_sugeridos_mes.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Fixture sintetica; IDENTIDADE real (admin global)
--   como owner_id/auth.uid(). Gates reais G1-G3 leem DADOS REAIS (SELECT-only; nao escrevem,
--   nao tocam Santa Rita/Producao) e resolvem dinamicamente (sem IDs de fazenda hardcoded).
--   Token run-unique. RAISE na forma USING ERRCODE=..., MESSAGE=... na funcao.

SELECT set_config('app.m9_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag   text := current_setting('app.m9_test_tag');
  v_user  uuid;
  v_stranger uuid := gen_random_uuid();
  v_cli   uuid := gen_random_uuid();
  v_faz   uuid := gen_random_uuid();
  v_mesA  text := '2020-03';   -- ajuste sem card
  v_mesB  text := '2020-04';   -- ajuste com card
  v_mesDup text := '2020-05';  -- ajuste com 2 cards (T8)
  v_p_aj uuid; v_p_norm uuid; v_p_inat uuid; v_p_noconc uuid; v_p_fut uuid;
  v_n int; v_ehaj boolean; v_tent text; v_nat text; v_sug boolean; v_uniq int;
  v_g_esperado int; v_g_ok int; v_g_sr int;
BEGIN
  SELECT cm.user_id INTO v_user FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;

  INSERT INTO public.clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_M9_'||v_tag);
  INSERT INTO public.fazendas (id, cliente_id, nome, owner_id) VALUES (v_faz, v_cli, 'FAZENDA_TESTE_M9_'||v_tag, v_user);

  -- pastos
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'AJUSTE_APTO_M9_'||v_tag, true, true, 'divergencia') RETURNING id INTO v_p_aj;      -- apto
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'NORMAL_M9_'||v_tag, true, true, 'recria') RETURNING id INTO v_p_norm;              -- normal (nao ajuste)
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'AJUSTE_INATIVO_M9_'||v_tag, false, true, 'divergencia') RETURNING id INTO v_p_inat; -- inativo
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'AJUSTE_NOCONC_M9_'||v_tag, true, false, 'divergencia') RETURNING id INTO v_p_noconc; -- sem conciliacao
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, data_inicio) VALUES
    (v_faz, v_cli, 'AJUSTE_FUTURO_M9_'||v_tag, true, true, 'divergencia', DATE '2020-06-01') RETURNING id INTO v_p_fut; -- vigencia futura

  -- cards: v_p_aj tem card em mesB e DOIS cards em mesDup
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p_aj, v_faz, v_cli, v_mesB, 'rascunho');
  -- T8: verificar se o schema permite 2 cards da mesma chave (pasto_id, ano_mes)
  SELECT count(*) INTO v_uniq FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
   WHERE n.nspname='public' AND cl.relname='fechamento_pastos' AND c.contype='u'
     AND pg_get_constraintdef(c.oid) ~ 'fechamento.*ano_mes|ano_mes.*pasto';
  IF v_uniq = 0 THEN
    INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p_aj, v_faz, v_cli, v_mesDup, 'rascunho');
    INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p_aj, v_faz, v_cli, v_mesDup, 'aberto');  -- 2o card (duplicidade permitida hoje)
  ELSE
    INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES (v_p_aj, v_faz, v_cli, v_mesDup, 'rascunho'); -- constraint impede 2; 1 card ja elimina a sugestao
    RAISE NOTICE 'T8 NOTA: constraint unique ja impede duplicidade; provando apenas que qualquer card elimina a sugestao';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ============ T1 — ajuste apto sem card -> 1 linha ============
  SELECT count(*) INTO v_n FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) WHERE pasto_id=v_p_aj;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 ajuste apto sem card retornou % (esperado 1)', v_n; END IF;
  -- e nao retorna nenhum outro pasto da fixture no mesA
  IF (SELECT count(*) FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA)) <> 1 THEN RAISE EXCEPTION 'T1 fn_ajustes mesA retornou linhas alem do apto'; END IF;
  RAISE NOTICE 'T1 OK';

  -- ============ T2 — ajuste com card no mes -> 0 linhas ============
  SELECT count(*) INTO v_n FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesB) WHERE pasto_id=v_p_aj;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T2 ajuste com card retornou % (esperado 0)', v_n; END IF;
  RAISE NOTICE 'T2 OK';

  -- ============ T3 — pasto normal nao aparece ============
  IF EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) WHERE pasto_id=v_p_norm) THEN RAISE EXCEPTION 'T3 pasto normal apareceu'; END IF;
  RAISE NOTICE 'T3 OK';

  -- ============ T4 — envelope do ajuste ============
  SELECT tipo_entidade, eh_ajuste, natureza_patrimonial, sugerir_no_fechamento
    INTO v_tent, v_ehaj, v_nat, v_sug
    FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) WHERE pasto_id=v_p_aj;
  IF v_tent <> 'ajuste_conciliacao' THEN RAISE EXCEPTION 'T4 tipo_entidade=%', v_tent; END IF;
  IF v_ehaj IS DISTINCT FROM true THEN RAISE EXCEPTION 'T4 eh_ajuste=%', v_ehaj; END IF;
  IF v_nat IS NOT NULL THEN RAISE EXCEPTION 'T4 natureza=% (esperado NULL)', v_nat; END IF;
  IF v_sug IS DISTINCT FROM true THEN RAISE EXCEPTION 'T4 sugerir_no_fechamento=% (esperado entra_conciliacao=true)', v_sug; END IF;
  RAISE NOTICE 'T4 OK';

  -- ============ T5 — ajuste inativo nao aparece ============
  IF EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) WHERE pasto_id=v_p_inat) THEN RAISE EXCEPTION 'T5 ajuste inativo apareceu'; END IF;
  RAISE NOTICE 'T5 OK';

  -- ============ T6 — ajuste entra_conciliacao=false nao aparece ============
  IF EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) WHERE pasto_id=v_p_noconc) THEN RAISE EXCEPTION 'T6 ajuste sem conciliacao apareceu'; END IF;
  RAISE NOTICE 'T6 OK';

  -- ============ T7 — ajuste com data_inicio futura ausente antes da vigencia ============
  IF EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) WHERE pasto_id=v_p_fut) THEN RAISE EXCEPTION 'T7 ajuste futuro apareceu antes da vigencia'; END IF;
  -- e presente a partir da vigencia (2020-06)
  IF NOT EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(v_faz, '2020-06') WHERE pasto_id=v_p_fut) THEN RAISE EXCEPTION 'T7 ajuste futuro ausente na competencia vigente'; END IF;
  RAISE NOTICE 'T7 OK';

  -- ============ T8 — duplicidade de card nao faz o ajuste reaparecer ============
  SELECT count(*) INTO v_n FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesDup) WHERE pasto_id=v_p_aj;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T8 ajuste com card(s) reapareceu (%) na competencia com duplicidade', v_n; END IF;
  RAISE NOTICE 'T8 OK';

  -- ============ T9 — disjuncao com fn_locais_sugeridos_mes ============
  IF EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA) a
             JOIN public.fn_locais_sugeridos_mes(v_faz, v_mesA) l ON l.pasto_id=a.pasto_id)
     THEN RAISE EXCEPTION 'T9 pasto aparece em fn_ajustes E fn_locais (nao disjunto)'; END IF;
  RAISE NOTICE 'T9 OK';

  -- ============ T10 — outro tenant -> 42501 ============
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  BEGIN PERFORM count(*) FROM public.fn_ajustes_sugeridos_mes(v_faz, v_mesA); RAISE EXCEPTION 'T10 outro tenant nao negado'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'T10 OK';

  -- ============ T11 — anon/PUBLIC sem EXECUTE ============
  IF has_function_privilege('anon', 'public.fn_ajustes_sugeridos_mes(uuid, text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.fn_ajustes_sugeridos_mes(uuid, text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T11 fn_ajustes exposta a anon/public'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_ajustes_sugeridos_mes(uuid, text)', 'EXECUTE')
     THEN RAISE EXCEPTION 'T11 fn_ajustes sem grant authenticated'; END IF;
  RAISE NOTICE 'T11 OK';

  -- ============ T12 — competencia invalida / NULL -> 22007 ============
  BEGIN PERFORM count(*) FROM public.fn_ajustes_sugeridos_mes(v_faz, '2020-13'); RAISE EXCEPTION 'T12 aceitou mes 13'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_ajustes_sugeridos_mes(v_faz, NULL); RAISE EXCEPTION 'T12 aceitou NULL'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  RAISE NOTICE 'T12 OK';

  -- ============ GATES REAIS (dados reais; exclui a fixture; resolucao dinamica) ============
  -- G1: toda divergencia real APTA e SEM card em 2026-07 e retornada por fn_ajustes (para sua fazenda).
  SELECT count(*) INTO v_g_esperado
    FROM public.pastos p
   WHERE coalesce(p.tipo_uso,'')='divergencia' AND p.ativo AND p.entra_conciliacao AND p.cliente_id <> v_cli
     AND (p.data_inicio IS NULL OR p.data_inicio <= DATE '2026-07-31')
     AND NOT EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.fazenda_id=p.fazenda_id AND fp.pasto_id=p.id AND fp.ano_mes='2026-07');
  SELECT count(*) INTO v_g_ok
    FROM (SELECT DISTINCT p.fazenda_id FROM public.pastos p
           WHERE coalesce(p.tipo_uso,'')='divergencia' AND p.ativo AND p.entra_conciliacao AND p.cliente_id <> v_cli) fz
    JOIN LATERAL public.fn_ajustes_sugeridos_mes(fz.fazenda_id, '2026-07') a ON true
   WHERE a.pasto_id IN (SELECT id FROM public.pastos WHERE cliente_id <> v_cli);
  IF v_g_ok <> v_g_esperado THEN RAISE EXCEPTION 'G1 fn_ajustes(2026-07) devolveu % de % ajustes reais sem card', v_g_ok, v_g_esperado; END IF;
  -- G1 especifico (Santa Rita, dinamico por nome, sem ID de fazenda hardcoded)
  SELECT count(*) INTO v_g_sr
    FROM public.pastos p JOIN LATERAL public.fn_ajustes_sugeridos_mes(p.fazenda_id, '2026-07') a ON a.pasto_id=p.id
   WHERE p.nome LIKE '%Diverg%ncia do Campeiro%' AND coalesce(p.tipo_uso,'')='divergencia'
     AND p.ativo AND p.entra_conciliacao AND p.cliente_id <> v_cli
     AND NOT EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.fazenda_id=p.fazenda_id AND fp.pasto_id=p.id AND fp.ano_mes='2026-07');
  RAISE NOTICE 'G1 OK (2026-07: % ajustes reais sem card devolvidos; % "Divergencia do Campeiro" sem card)', v_g_esperado, v_g_sr;

  -- G2: divergencia real COM card numa competencia -> fn_ajustes retorna 0 para aquele pasto/mes.
  IF EXISTS (
    SELECT 1 FROM public.fechamento_pastos fp JOIN public.pastos p ON p.id=fp.pasto_id
     WHERE coalesce(p.tipo_uso,'')='divergencia' AND p.cliente_id <> v_cli
       AND EXISTS (SELECT 1 FROM public.fn_ajustes_sugeridos_mes(fp.fazenda_id, fp.ano_mes) a WHERE a.pasto_id=fp.pasto_id))
     THEN RAISE EXCEPTION 'G2 fn_ajustes sugeriu um ajuste que JA tem card na competencia'; END IF;
  RAISE NOTICE 'G2 OK (nenhum ajuste com card foi sugerido)';

  -- G3: baseline informativo (volatil) — nao e assercao rigida.
  SELECT count(*) INTO v_n FROM public.pastos WHERE coalesce(tipo_uso,'')='divergencia' AND ativo AND entra_conciliacao AND cliente_id <> v_cli;
  RAISE NOTICE 'G3 baseline: % pastos divergencia reais aptos (informativo)', v_n;

  RAISE NOTICE 'FIM: T1..T12 + G1..G3 sem falha neste run';
END $fix$;

ROLLBACK;

-- POS-ROLLBACK — nada sintetico persiste (por token)
DO $post$
DECLARE v_tag text := current_setting('app.m9_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: cliente persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: fazenda persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.pastos WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: pasto persistiu'; END IF;
  RAISE NOTICE 'POS-ROLLBACK OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.m9_test_tag', '', false) AS run_tag_reset;
