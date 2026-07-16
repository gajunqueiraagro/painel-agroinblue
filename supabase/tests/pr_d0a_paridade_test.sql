-- PR-D0A-CONTRATOS-LEITURA — Teste de paridade dos 6 contratos de leitura.
-- Roda em BEGIN...ROLLBACK: NADA persiste. Fixture sintetica; IDENTIDADE real (admin global)
--   como owner_id/auth.uid(). Gates T6/T7/T8 leem DADOS REAIS (SELECT-only; nao escrevem,
--   nao tocam Santa Rita/Producao) e descobrem a fazenda/competencia dinamicamente (sem IDs
--   hardcoded). Token run-unique. RAISE na forma USING ERRCODE=..., MESSAGE=... nas funcoes.

SELECT set_config('app.d0a_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

BEGIN;

DO $fix$
DECLARE
  v_tag  text := current_setting('app.d0a_test_tag');
  v_user uuid;
  v_stranger uuid := gen_random_uuid();
  v_cli  uuid := gen_random_uuid();
  v_faz  uuid := gen_random_uuid();
  v_mes      text := '2020-03';
  v_cat_ok uuid;       -- categoria real, presente em categorias_rebanho COM codigo
  v_cat_orfa uuid;     -- categoria sintetica so em `categorias` (sem row em categorias_rebanho) -> codigo NULL
  v_p_fis1 uuid; v_p_fis2 uuid; v_p_zero uuid; v_p_div uuid; v_p_pec uuid;
  v_p_nc uuid; v_p_rasc uuid; v_p_aberto uuid;
  v_c_fis1 uuid; v_c_fis2 uuid; v_c_zero uuid; v_c_div uuid; v_c_pec uuid; v_c_rasc uuid; v_c_aberto uuid;
  v_rfaz uuid; v_rmes text;           -- fazenda/competencia REAL elegivel (T6/T8)
  v_n int; v_num numeric; v_num2 numeric; v_bool boolean; v_txt text;
BEGIN
  -- identidade real (admin global) para FK owner_id -> auth.users e trigger auto_add_owner
  SELECT cm.user_id INTO v_user FROM public.cliente_membros cm
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
   ORDER BY cm.user_id LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'fixture: sem admin global'; END IF;
  SELECT c.id INTO v_cat_ok FROM public.categorias c
   JOIN public.categorias_rebanho cr ON cr.id=c.id WHERE cr.codigo IS NOT NULL LIMIT 1;
  IF v_cat_ok IS NULL THEN RAISE EXCEPTION 'fixture: sem categoria com codigo'; END IF;

  INSERT INTO public.clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_D0A_'||v_tag);
  INSERT INTO public.fazendas (id, cliente_id, nome, owner_id) VALUES (v_faz, v_cli, 'FAZENDA_TESTE_D0A_'||v_tag, v_user);
  -- categoria orfa sintetica (so em `categorias`, sem row em categorias_rebanho -> codigo NULL na ponte)
  INSERT INTO public.categorias (nome, tipo) VALUES ('CATEGORIA_ORFA_D0A_'||v_tag, 'm') RETURNING id INTO v_cat_orfa;

  -- ================== FIXTURE ==================
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_FIS1_D0A_'||v_tag,   true, true,  'recria')      RETURNING id INTO v_p_fis1;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_FIS2_D0A_'||v_tag,   true, true,  'recria')      RETURNING id INTO v_p_fis2;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_ZERO_D0A_'||v_tag,   true, true,  'recria')      RETURNING id INTO v_p_zero;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_DIV_D0A_'||v_tag,    true, true,  'divergencia') RETURNING id INTO v_p_div;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_PEC_D0A_'||v_tag,    true, true,  'pecuaria')    RETURNING id INTO v_p_pec;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_NC_D0A_'||v_tag,     true, false, 'recria')      RETURNING id INTO v_p_nc;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_RASC_D0A_'||v_tag,   true, true,  'recria')      RETURNING id INTO v_p_rasc;
  INSERT INTO public.pastos (fazenda_id, cliente_id, nome, ativo, entra_conciliacao, tipo_uso) VALUES
    (v_faz, v_cli, 'PASTO_ABERTO_D0A_'||v_tag, true, true,  'recria')      RETURNING id INTO v_p_aberto;

  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_fis1,   v_faz, v_cli, v_mes, 'fechado')  RETURNING id INTO v_c_fis1;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_fis2,   v_faz, v_cli, v_mes, 'fechado')  RETURNING id INTO v_c_fis2;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_zero,   v_faz, v_cli, v_mes, 'fechado')  RETURNING id INTO v_c_zero;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_div,    v_faz, v_cli, v_mes, 'fechado')  RETURNING id INTO v_c_div;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_pec,    v_faz, v_cli, v_mes, 'fechado')  RETURNING id INTO v_c_pec;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_rasc,   v_faz, v_cli, v_mes, 'rascunho') RETURNING id INTO v_c_rasc;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) VALUES
    (v_p_aberto, v_faz, v_cli, v_mes, 'aberto')   RETURNING id INTO v_c_aberto;

  -- itens: fis1 = 1 linha v_cat_ok (UNIQUE(fechamento_id,categoria_id) proibe duplicata) + 1 linha categoria orfa (T5)
  INSERT INTO public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_total) VALUES
    (v_c_fis1, v_cat_ok,   15, 4500),   -- UMA linha por (card,categoria); UNIQUE(fechamento_id,categoria_id)
    (v_c_fis1, v_cat_orfa,  3,  900),
    (v_c_zero, v_cat_ok,    0,    0),   -- qtd=0 com linha (T2 possui_itens TRUE, qtd_total=0)
    (v_c_div,  v_cat_ok,    2,  600),   -- card divergencia (eh_ajuste TRUE)
    (v_c_pec,  v_cat_ok,    4, 1200);   -- pecuaria legado (natureza NULL)
  -- fis2: SEM itens (T2 possui_itens FALSE)

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ============================ T1 — componentes = cards fechado ============================
  SELECT count(*) INTO v_n FROM public.fn_cards_componentes_mes(v_faz, v_mes);
  IF v_n <> 5 THEN RAISE EXCEPTION 'T1 cards fechado=% (esperado 5: fis1/fis2/zero/div/pec)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.fn_cards_componentes_mes(v_faz, v_mes) WHERE pasto_id IN (v_p_rasc, v_p_aberto))
     THEN RAISE EXCEPTION 'T1 rascunho/aberto vazaram para componentes'; END IF;
  RAISE NOTICE 'T1 OK';

  -- ============================ T2 — possui_itens (EXISTS, nao count>0) ============================
  SELECT possui_itens, quantidade_total INTO v_bool, v_n
    FROM public.fn_cards_componentes_mes(v_faz, v_mes) WHERE pasto_id=v_p_zero;
  IF v_bool IS DISTINCT FROM true OR v_n <> 0 THEN RAISE EXCEPTION 'T2 zero: possui_itens=% qtd=% (esperado TRUE,0)', v_bool, v_n; END IF;
  SELECT possui_itens, quantidade_total INTO v_bool, v_n
    FROM public.fn_cards_componentes_mes(v_faz, v_mes) WHERE pasto_id=v_p_fis2;
  IF v_bool IS DISTINCT FROM false OR v_n <> 0 THEN RAISE EXCEPTION 'T2 fis2: possui_itens=% qtd=% (esperado FALSE,0)', v_bool, v_n; END IF;
  RAISE NOTICE 'T2 OK';

  -- ============================ T3 — cardinalidade soberana por card x categoria ============================
  -- UNIQUE(fechamento_id,categoria_id) garante no MAXIMO 1 linha fisica por (card,categoria).
  -- O contrato retorna exatamente 1 linha para (v_c_fis1,v_cat_ok) com quantidade=15 e peso_total_kg=4500.
  -- O GROUP BY categoria_id permanece defensivo e compativel com a cardinalidade soberana.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
                  WHERE n.nspname='public' AND cl.relname='fechamento_pasto_itens' AND c.contype='u'
                    AND pg_get_constraintdef(c.oid)='UNIQUE (fechamento_id, categoria_id)')
     THEN RAISE EXCEPTION 'T3 constraint UNIQUE(fechamento_id,categoria_id) ausente — premissa de cardinalidade invalida'; END IF;
  SELECT count(*), max(quantidade), max(peso_total_kg) INTO v_n, v_num, v_num2
    FROM public.fn_composicao_componentes_categoria_mes(v_faz, v_mes)
   WHERE fechamento_pasto_id=v_c_fis1 AND categoria_id=v_cat_ok;
  IF v_n <> 1 OR v_num <> 15 OR v_num2 <> 4500 THEN
    RAISE EXCEPTION 'T3 cardinalidade: count=% qtd=% peso=% (esperado 1/15/4500)', v_n, v_num, v_num2; END IF;
  RAISE NOTICE 'T3 OK';

  -- ============================ T4 — peso numeric integral; medio derivado (NULL se qtd=0) ============================
  SELECT peso_total_kg, peso_medio_kg INTO v_num, v_num2
    FROM public.fn_composicao_componentes_categoria_mes(v_faz, v_mes)
   WHERE fechamento_pasto_id=v_c_fis1 AND categoria_id=v_cat_ok;
  IF v_num <> 4500 THEN RAISE EXCEPTION 'T4 peso_total_kg=% (esperado 4500 integral)', v_num; END IF;
  IF v_num2 <> 300 THEN RAISE EXCEPTION 'T4 peso_medio_kg=% (esperado 300 = 4500/15)', v_num2; END IF;
  SELECT peso_medio_kg INTO v_num2
    FROM public.fn_composicao_componentes_categoria_mes(v_faz, v_mes)
   WHERE fechamento_pasto_id=v_c_zero AND categoria_id=v_cat_ok;
  IF v_num2 IS NOT NULL THEN RAISE EXCEPTION 'T4 peso_medio_kg qtd=0 nao e NULL: %', v_num2; END IF;
  RAISE NOTICE 'T4 OK';

  -- ============================ T5 — ponte LEFT JOIN: categoria orfa -> linha preservada, codigo NULL ============================
  SELECT count(*), max(categoria_codigo) INTO v_n, v_txt
    FROM public.fn_composicao_componentes_categoria_mes(v_faz, v_mes)
   WHERE fechamento_pasto_id=v_c_fis1 AND categoria_id=v_cat_orfa;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T5 linha da categoria orfa nao preservada (count=%)', v_n; END IF;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'T5 categoria_codigo orfa nao e NULL: %', v_txt; END IF;
  RAISE NOTICE 'T5 OK';

  -- ============================ T6 — GATE categorias_sem_codigo=0 (DADOS REAIS) ============================
  SELECT vf.fazenda_id, vf.ano_mes INTO v_rfaz, v_rmes
    FROM public.valor_rebanho_fechamento vf
    JOIN public.valor_rebanho_realizado_validado vr ON vr.fazenda_id=vf.fazenda_id AND vr.ano_mes=vf.ano_mes AND vr.status='validado'
   WHERE vf.status='fechado'
     AND vf.fazenda_id <> v_faz
     AND EXISTS (SELECT 1 FROM public.valor_rebanho_fechamento_itens i WHERE i.fazenda_id=vf.fazenda_id AND i.ano_mes=vf.ano_mes)
     AND EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.fazenda_id=vf.fazenda_id AND fp.ano_mes=vf.ano_mes AND fp.status='fechado')
   ORDER BY vf.fazenda_id, vf.ano_mes LIMIT 1;
  IF v_rfaz IS NULL THEN RAISE EXCEPTION 'T6/T8 sem fazenda real elegivel (P2 fechado+validado + cards fechado + itens P2)'; END IF;
  SELECT count(*) INTO v_n FROM public.fn_composicao_componentes_categoria_mes(v_rfaz, v_rmes) WHERE categoria_codigo IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T6 categorias_sem_codigo=% em dados reais (%/%). categoria_id orfaos: %', v_n, v_rfaz, v_rmes,
      (SELECT string_agg(DISTINCT categoria_id::text, ',') FROM public.fn_composicao_componentes_categoria_mes(v_rfaz, v_rmes) WHERE categoria_codigo IS NULL);
  END IF;
  RAISE NOTICE 'T6 OK (fazenda real %/%; categorias_sem_codigo=0)', v_rfaz, v_rmes;

  -- ============================ T7 — GATE naturezas_legadas=3 (DADOS REAIS, pecuaria->NULL) ============================
  SELECT count(*) INTO v_n
    FROM public.pastos p
    JOIN LATERAL public.fn_natureza_patrimonial_fazenda(p.fazenda_id) nat ON nat.pasto_id=p.id
   WHERE p.tipo_uso='pecuaria' AND nat.natureza_patrimonial IS NULL
     AND p.cliente_id <> v_cli;   -- exclui a fixture sintetica
  IF v_n <> 3 THEN RAISE EXCEPTION 'T7 naturezas_legadas=% (esperado 3: Arrendamento/P_24/P_25). Alguem criou novo pecuaria?', v_n; END IF;
  RAISE NOTICE 'T7 OK (pecuaria->NULL = 3 legados)';

  -- ============================ T8 — PARIDADE P2 BIDIRECIONAL por categoria (DADOS REAIS) ============================
  -- (a) nenhuma categoria so de um lado; (b) quantidade igual; (c) peso total igual (round 2, simetrico so no teste)
  WITH comp AS (
    SELECT c.categoria_codigo AS cod, round(sum(c.quantidade),2) AS q, round(sum(c.peso_total_kg),2) AS p
    FROM public.fn_composicao_componentes_categoria_mes(v_rfaz, v_rmes) c
    WHERE c.categoria_codigo IS NOT NULL
    GROUP BY c.categoria_codigo
  ), p2 AS (
    SELECT vi.categoria AS cod, round(sum(vi.quantidade),2) AS q, round(sum(vi.quantidade*vi.peso_medio_kg),2) AS p
    FROM public.valor_rebanho_fechamento_itens vi
    WHERE vi.fazenda_id=v_rfaz AND vi.ano_mes=v_rmes
    GROUP BY vi.categoria
  ), j AS (
    SELECT comp.q AS qc, comp.p AS pc, p2.q AS qp, p2.p AS pp
    FROM comp FULL OUTER JOIN p2 ON p2.cod=comp.cod
  )
  SELECT count(*) INTO v_n FROM j
   WHERE qc IS NULL OR qp IS NULL              -- (a) orfa de qualquer lado
      OR qc <> qp                              -- (b) quantidade diverge
      OR pc <> pp;                             -- (c) peso total diverge
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T8 paridade P2 FALHOU em %/% (% categorias divergentes): %', v_rfaz, v_rmes, v_n,
      (WITH comp AS (SELECT c.categoria_codigo AS cod, round(sum(c.quantidade),2) q, round(sum(c.peso_total_kg),2) p
                       FROM public.fn_composicao_componentes_categoria_mes(v_rfaz, v_rmes) c WHERE c.categoria_codigo IS NOT NULL GROUP BY c.categoria_codigo),
            p2 AS (SELECT vi.categoria AS cod, round(sum(vi.quantidade),2) q, round(sum(vi.quantidade*vi.peso_medio_kg),2) p
                     FROM public.valor_rebanho_fechamento_itens vi WHERE vi.fazenda_id=v_rfaz AND vi.ano_mes=v_rmes GROUP BY vi.categoria)
       SELECT string_agg(coalesce(comp.cod,p2.cod)||'(qc='||coalesce(comp.q::text,'-')||',qp='||coalesce(p2.q::text,'-')||',pc='||coalesce(comp.p::text,'-')||',pp='||coalesce(p2.p::text,'-')||')', '; ')
         FROM comp FULL OUTER JOIN p2 ON p2.cod=comp.cod
        WHERE comp.q IS NULL OR p2.q IS NULL OR comp.q<>p2.q OR comp.p<>p2.p);
  END IF;
  RAISE NOTICE 'T8 OK (paridade P2 bidirecional em %/%; quantidade+peso conferem)', v_rfaz, v_rmes;

  -- ============================ T9 — pendencias = rascunho+aberto; disjuncao com componentes ============================
  SELECT count(*) INTO v_n FROM public.fn_pendencias_fechamento_mes(v_faz, v_mes);
  IF v_n <> 2 THEN RAISE EXCEPTION 'T9 pendencias=% (esperado 2: rasc+aberto)', v_n; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fn_pendencias_fechamento_mes(v_faz, v_mes) pe
    JOIN public.fn_cards_componentes_mes(v_faz, v_mes) co ON co.pasto_id=pe.pasto_id)
    THEN RAISE EXCEPTION 'T9 pendencias e componentes se sobrepoem'; END IF;
  RAISE NOTICE 'T9 OK';

  -- ============================ T10 — sugeridos = fn_pastos_aplicaveis_mes; sugerir=entra_conciliacao ============================
  IF EXISTS (
      SELECT 1 FROM public.fn_locais_sugeridos_mes(v_faz, v_mes) s
      FULL OUTER JOIN public.fn_pastos_aplicaveis_mes(v_faz, v_mes) a ON a.pasto_id=s.pasto_id
      WHERE s.pasto_id IS NULL OR a.pasto_id IS NULL)
     THEN RAISE EXCEPTION 'T10 conjunto sugeridos <> fn_pastos_aplicaveis_mes'; END IF;
  IF EXISTS (SELECT 1 FROM public.fn_locais_sugeridos_mes(v_faz, v_mes)
              WHERE sugerir_no_fechamento IS DISTINCT FROM entra_conciliacao)
     THEN RAISE EXCEPTION 'T10 sugerir_no_fechamento <> entra_conciliacao'; END IF;
  IF EXISTS (SELECT 1 FROM public.fn_locais_sugeridos_mes(v_faz, v_mes) WHERE pasto_id IN (v_p_div, v_p_nc))
     THEN RAISE EXCEPTION 'T10 divergencia/nao-conciliacao vazaram para sugeridos'; END IF;
  RAISE NOTICE 'T10 OK';

  -- ============================ T11 — natureza (mapa classificacaoArea.ts); pecuaria->NULL ============================
  SELECT natureza_patrimonial INTO v_txt FROM public.fn_natureza_patrimonial_fazenda(v_faz) WHERE pasto_id=v_p_fis1;
  IF v_txt IS DISTINCT FROM 'pecuaria_produtiva' THEN RAISE EXCEPTION 'T11 recria natureza=% (esperado pecuaria_produtiva)', v_txt; END IF;
  SELECT natureza_patrimonial INTO v_txt FROM public.fn_natureza_patrimonial_fazenda(v_faz) WHERE pasto_id=v_p_div;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'T11 divergencia natureza=% (esperado NULL)', v_txt; END IF;
  SELECT natureza_patrimonial INTO v_txt FROM public.fn_natureza_patrimonial_fazenda(v_faz) WHERE pasto_id=v_p_pec;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'T11 pecuaria legado natureza=% (esperado NULL)', v_txt; END IF;
  RAISE NOTICE 'T11 OK (recria->pecuaria_produtiva; divergencia/pecuaria->NULL)';

  -- ============================ T12 — tenant: outro tenant -> 42501 em todas; grants ============================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger::text, 'role', 'authenticated')::text, true);
  BEGIN PERFORM count(*) FROM public.fn_natureza_patrimonial_fazenda(v_faz); RAISE EXCEPTION 'T12 natureza sem tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_uso_operacional_mes(v_faz, v_mes); RAISE EXCEPTION 'T12 uso sem tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_cards_componentes_mes(v_faz, v_mes); RAISE EXCEPTION 'T12 cards sem tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_composicao_componentes_categoria_mes(v_faz, v_mes); RAISE EXCEPTION 'T12 composicao sem tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_pendencias_fechamento_mes(v_faz, v_mes); RAISE EXCEPTION 'T12 pendencias sem tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_locais_sugeridos_mes(v_faz, v_mes); RAISE EXCEPTION 'T12 sugeridos sem tenant'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
  IF (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('fn_natureza_patrimonial_fazenda','fn_uso_operacional_mes','fn_cards_componentes_mes','fn_composicao_componentes_categoria_mes','fn_pendencias_fechamento_mes','fn_locais_sugeridos_mes'))
     THEN RAISE EXCEPTION 'T12 alguma funcao D0A exposta a anon/public'; END IF;
  IF (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('fn_natureza_patrimonial_fazenda','fn_uso_operacional_mes','fn_cards_componentes_mes','fn_composicao_componentes_categoria_mes','fn_pendencias_fechamento_mes','fn_locais_sugeridos_mes')) IS NOT TRUE
     THEN RAISE EXCEPTION 'T12 alguma funcao D0A sem grant authenticated'; END IF;
  RAISE NOTICE 'T12 OK';

  -- ============================ T13 — competencia invalida / NULL -> 22007 ============================
  BEGIN PERFORM count(*) FROM public.fn_uso_operacional_mes(v_faz, '2020-13'); RAISE EXCEPTION 'T13 uso aceitou mes 13'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_cards_componentes_mes(v_faz, NULL); RAISE EXCEPTION 'T13 cards aceitou NULL'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_composicao_componentes_categoria_mes(v_faz, 'abc'); RAISE EXCEPTION 'T13 composicao aceitou lixo'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_pendencias_fechamento_mes(v_faz, '2020-00'); RAISE EXCEPTION 'T13 pendencias aceitou mes 00'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.fn_locais_sugeridos_mes(v_faz, NULL); RAISE EXCEPTION 'T13 sugeridos aceitou NULL'; EXCEPTION WHEN SQLSTATE '22007' THEN NULL; END;
  RAISE NOTICE 'T13 OK';

  RAISE NOTICE 'FIM: T1..T13 sem falha de assercao neste run';
END $fix$;

ROLLBACK;

-- ============================ POS-ROLLBACK — nada sintetico persiste (por token) ============================
DO $post$
DECLARE v_tag text := current_setting('app.d0a_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM public.clientes WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: cliente persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.fazendas WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: fazenda persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.pastos WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: pasto persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM public.categorias WHERE nome LIKE '%'||v_tag) THEN RAISE EXCEPTION 'POS: categoria persistiu'; END IF;
  RAISE NOTICE 'POS-ROLLBACK OK: nada sintetico persistiu';
END $post$;

SELECT set_config('app.d0a_test_tag', '', false) AS run_tag_reset;
