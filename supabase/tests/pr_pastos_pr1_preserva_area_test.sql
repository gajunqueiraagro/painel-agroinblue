-- PR-PASTOS-PR1 — Teste transacional da preservação da área histórica.
-- BEGIN...ROLLBACK: NADA persiste. Fixture 100% sintética; identidade = admin
-- global real (auth.uid via set_config). NAO toca Santa Rita, dados reais nem
-- Producao. Cobre os 6 gates funcionais do PR1.
--
--   G1 primeiro fechamento cria snapshot de area (versao 1, cadastro vigente);
--   G2 reexecucao direta NAO altera conteudo (area/versao/fechado_em iguais);
--   G3 alteracao posterior de fazenda_cadastros + reabertura + refechamento NAO
--      altera a area historica (usa cadastro ANTIGO, nao o novo);
--   G4 versao NAO sobe em reexecucao;
--   G5 fechado_em NAO muda;
--   G6 retorno traz area_preservada=true na reutilizacao; fluxo normal segue.

SELECT set_config('app.pr1_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_tag  text := current_setting('app.pr1_test_tag');
  v_user uuid;
  v_cli  uuid := gen_random_uuid();
  v_faz  uuid := gen_random_uuid();
  v_cat  uuid;
  v_mes  text := '2020-05';
  v_mes_date date := DATE '2020-05-01';
  v_pasto uuid; v_card uuid; i int;
  v_area1 uuid; v_area2 uuid; v_area3 uuid;
  v_pec1 numeric; v_ver1 int; v_fem1 timestamptz;
  v_pec3 numeric; v_ver3 int; v_fem3 timestamptz;
BEGIN
  SELECT cm.user_id INTO v_user FROM cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;
  SELECT id INTO v_cat FROM public.categorias LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'fixture: sem categoria'; END IF;

  INSERT INTO clientes (id, nome) VALUES (v_cli, 'CLIENTE_PR1_'||v_tag);
  INSERT INTO fazendas (id, cliente_id, nome, owner_id) VALUES (v_faz, v_cli, 'FAZ_PR1_'||v_tag, v_user);
  INSERT INTO fazenda_cadastros (fazenda_id, cliente_id, area_produtiva_ha, area_pecuaria_ha,
         area_agricultura_ha, area_total_ha, area_reserva_ha, area_benfeitorias_ha, area_outras_ha)
    VALUES (v_faz, v_cli, 1000, 800, 200, 1050, 30, 15, 5);

  FOR i IN 1..3 LOOP
    INSERT INTO pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso, area_produtiva_ha)
      VALUES (v_faz, v_cli, 'PASTO_PR1_'||v_tag||'_'||i, true, true, 'pecuaria', 10) RETURNING id INTO v_pasto;
    INSERT INTO fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
      VALUES (v_pasto, v_faz, v_cli, v_mes, 'fechado') RETURNING id INTO v_card;
    INSERT INTO fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_total)
      VALUES (v_card, v_cat, 10, 3000);
  END LOOP;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ===== G1: primeiro fechamento cria a area (cadastro vigente = 800) =====
  v_area1 := public.gerar_snapshot_area(v_faz, v_mes_date, v_user);
  SELECT area_pecuaria_ha, versao, fechado_em INTO v_pec1, v_ver1, v_fem1
    FROM public.fechamento_area_snapshot WHERE id=v_area1;
  IF v_pec1 <> 800 THEN RAISE EXCEPTION 'G1 FALHOU: area_pecuaria esperada 800, obtida %', v_pec1; END IF;
  IF v_ver1 <> 1 THEN RAISE EXCEPTION 'G1 FALHOU: versao inicial esperada 1, obtida %', v_ver1; END IF;

  -- ===== G2 + G4 + G5: reexecucao direta preserva (mesmo snapshot vigente) =====
  v_area2 := public.gerar_snapshot_area(v_faz, v_mes_date, v_user);
  IF v_area2 <> v_area1 THEN RAISE EXCEPTION 'G2 FALHOU: reexecucao criou nova linha de area'; END IF;
  IF (SELECT versao FROM public.fechamento_area_snapshot WHERE id=v_area1) <> v_ver1 THEN
    RAISE EXCEPTION 'G4 FALHOU: versao mudou em reexecucao direta';
  END IF;
  IF (SELECT fechado_em FROM public.fechamento_area_snapshot WHERE id=v_area1) <> v_fem1 THEN
    RAISE EXCEPTION 'G5 FALHOU: fechado_em mudou em reexecucao direta';
  END IF;

  -- ===== G3 (CRITICO): cadastro alterado + reabertura + refechamento =====
  -- Simula: administrador muda a area cadastral meses depois.
  UPDATE public.fazenda_cadastros SET area_pecuaria_ha = 999, area_produtiva_ha = 1200
   WHERE fazenda_id = v_faz AND cliente_id = v_cli;
  -- Reabre (dispara A8A -> invalida snapshot de conjunto) e refecha.
  UPDATE public.fechamento_pastos SET status='rascunho' WHERE fazenda_id=v_faz AND ano_mes=v_mes;
  UPDATE public.fechamento_pastos SET status='fechado'  WHERE fazenda_id=v_faz AND ano_mes=v_mes;
  -- Refechamento pela fachada (materializa novo conjunto, mas area deve ser preservada).
  v_area3 := public.gerar_snapshot_area(v_faz, v_mes_date, v_user);

  SELECT area_pecuaria_ha, versao, fechado_em INTO v_pec3, v_ver3, v_fem3
    FROM public.fechamento_area_snapshot WHERE id=v_area3;

  IF v_area3 <> v_area1 THEN RAISE EXCEPTION 'G3 FALHOU: refechamento criou nova linha de area'; END IF;
  IF v_pec3 <> 800 THEN
    RAISE EXCEPTION 'G3 FALHOU: area historica sobrescrita pelo cadastro atual (esperado 800, obtido %)', v_pec3;
  END IF;
  IF v_ver3 <> v_ver1 THEN
    RAISE EXCEPTION 'G3/G4 FALHOU: versao subiu no refechamento (%->%)', v_ver1, v_ver3;
  END IF;
  IF v_fem3 <> v_fem1 THEN
    RAISE EXCEPTION 'G3/G5 FALHOU: fechado_em mudou no refechamento';
  END IF;

  -- ===== G6: o retorno interno marca area_preservada=true na reutilizacao =====
  -- (chamada direta a fn interna sob o mesmo jwt admin; ok em teste)
  DECLARE v_snap uuid; v_diag jsonb;
  BEGIN
    SELECT s.id INTO v_snap FROM public.fechamento_p1_snapshot s
     WHERE s.fazenda_id=v_faz AND s.ano_mes=v_mes AND s.status='vigente';
    v_diag := public.fn_gerar_area_de_snapshot(v_snap);
    IF (v_diag->>'area_preservada')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'G6 FALHOU: area_preservada deveria ser true na reutilizacao (diag %)', v_diag;
    END IF;
  END;

  RAISE NOTICE 'PR1 G1..G6: PASS (area historica preservada; cadastro atual ignorado no refechamento)';
END $t$;

ROLLBACK;

SELECT set_config('app.pr1_test_tag', '', false) AS run_tag_reset;
