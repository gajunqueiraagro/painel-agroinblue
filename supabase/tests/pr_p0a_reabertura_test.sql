-- PR-P1-GOV-REABERTURA-P0A — Teste transacional de fn_reabrir_p1_operacional.
-- Executar SOMENTE apos aplicar as 4 migrations. Roda em BEGIN...ROLLBACK:
--   NADA persiste. Dados de negocio 100% sinteticos; apenas a IDENTIDADE e real.
-- Santa Rita e referenciada apenas por NOME ('Santa Rita Agro') — nunca por ID.
--
-- NOMES RUN-UNIQUE: um token aleatorio por execucao (gen_random_uuid) e guardado no
--   GUC de sessao app.p0a_test_tag ANTES do BEGIN (sobrevive ao ROLLBACK) e embutido
--   em todos os nomes sinteticos. Os asserts pos-rollback casam exatamente esse token,
--   sem depender de nomes genericos que eventualmente ja existam.
--
-- FIXTURE x SCHEMA REAL (triggers permanecem ATIVOS durante todo o teste):
--   - fazendas tem AFTER INSERT trigger auto_add_owner_as_membro, que insere em
--     fazenda_membros(NEW.id, NEW.owner_id, 'dono'); fazenda_membros.user_id e
--     fazendas.owner_id tem FK para auth.users(id). Por isso a fixture usa como
--     owner_id um USUARIO REAL ja existente e autorizado (admin global, selecionado
--     dinamicamente de cliente_membros x auth.users). O trigger cria o vinculo
--     naturalmente, sem desabilitar triggers e sem session_replication_role.
--   - fechamento_pastos.pasto_id tem FK para pastos(id): a fixture cria pastos
--     sinteticos e usa seus ids (nao gen_random_uuid avulso).
--   - cliente_membros.user_id NAO tem FK; como o usuario e admin global,
--     is_admin_agroinblue(uid)=true autoriza a RPC sem membership sintetica.
--   - NENHUMA linha de auth.users e criada, alterada ou excluida. Os vinculos criados
--     pelo trigger apontam SOMENTE para as fazendas sinteticas e somem no ROLLBACK.
--
-- Casos: T1 primeira execucao, T2 idempotencia, T3 (fazenda propria) no-op de mes
--   inelegivel com mes POSTERIOR ainda validado, T4 formato invalido (22007).

-- Token run-unique (autocommit, ANTES do BEGIN -> sobrevive ao ROLLBACK).
SELECT set_config('app.p0a_test_tag', replace(gen_random_uuid()::text, '-', ''), false) AS run_tag;

-- ============================================================================
-- BASELINE SANTA RITA — ANTES (fora de transacao; por nome, sem IDs)
-- ============================================================================
SELECT 'BASELINE_ANTES' AS marco,
  (SELECT count(*) FROM fechamento_pastos fp JOIN fazendas f ON f.id=fp.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND fp.ano_mes='2026-05' AND fp.status='fechado') AS cards_mai_fechado,
  (SELECT count(*) FROM fechamento_pastos fp JOIN fazendas f ON f.id=fp.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND fp.ano_mes='2026-06' AND fp.status='fechado') AS cards_jun_fechado,
  (SELECT string_agg(vf.ano_mes||':'||vf.status, ',' ORDER BY vf.ano_mes) FROM valor_rebanho_fechamento vf
     JOIN fazendas f ON f.id=vf.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND vf.ano_mes IN ('2026-05','2026-06')) AS p2fech,
  (SELECT string_agg(vr.ano_mes||':'||vr.status, ',' ORDER BY vr.ano_mes) FROM valor_rebanho_realizado_validado vr
     JOIN fazendas f ON f.id=vr.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND vr.ano_mes IN ('2026-05','2026-06')) AS p2val,
  (SELECT count(*) FROM fechamento_area_snapshot s JOIN fazendas f ON f.id=s.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND s.ano_mes >= DATE '2026-05-01' AND s.ano_mes < DATE '2026-07-01') AS snapshots;
-- Esperado: 64, 64, '2026-05:fechado,2026-06:fechado', '2026-05:validado,2026-06:validado', 0

BEGIN;

DO $fix$
DECLARE
  v_tag   text := current_setting('app.p0a_test_tag');  -- token run-unique
  v_user  uuid;                        -- IDENTIDADE REAL (admin global)
  v_cli   uuid := gen_random_uuid();
  v_faz   uuid := gen_random_uuid();   -- T1/T2
  v_faz3  uuid := gen_random_uuid();   -- T3 (independente)
  v_pasto uuid;
  v_mes     text := '2020-01';  -- alvo T1/T2
  v_mes_seg text := '2020-02';  -- seguinte (cadeia) T1/T2
  v_alvo3   text := '2020-01';  -- alvo T3: SEM estado elegivel
  v_pos3    text := '2020-02';  -- posterior T3: validado, deve PERMANECER validado
  i int;
  r1 jsonb; r2 jsonb; r3 jsonb;
  v_t1 timestamptz;
  v_n int;
  v_real_fm_before int;
BEGIN
  -- Selecionar um admin global REAL presente em auth.users (identidade da fixture).
  SELECT cm.user_id INTO v_user
  FROM cliente_membros cm
  WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=cm.user_id)
  ORDER BY cm.user_id
  LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'fixture: nenhum admin global valido (cliente_membros x auth.users) encontrado';
  END IF;

  -- Snapshot das memberships REAIS do usuario (para provar que nao sao alteradas).
  SELECT count(*) INTO v_real_fm_before FROM fazenda_membros WHERE user_id=v_user;

  -- ---- Fixture sintetica (triggers ATIVOS); nomes carregam o token run-unique ----
  INSERT INTO clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_P0A_'||v_tag);
  -- owner_id = usuario real -> auto_add_owner_as_membro cria fazenda_membros valido
  INSERT INTO fazendas (id, cliente_id, nome, owner_id) VALUES
    (v_faz,  v_cli, 'FAZENDA_TESTE_P0A_T12_'||v_tag, v_user),
    (v_faz3, v_cli, 'FAZENDA_TESTE_P0A_T3_'||v_tag,  v_user);

  -- T1/T2 (v_faz): 64 pastos sinteticos + 64 cards fechado (pasto_id respeita a FK)
  FOR i IN 1..64 LOOP
    INSERT INTO pastos (fazenda_id, cliente_id, nome)
      VALUES (v_faz, v_cli, 'PASTO_TESTE_P0A_'||v_tag||'_'||i) RETURNING id INTO v_pasto;
    INSERT INTO fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
      VALUES (v_pasto, v_faz, v_cli, v_mes, 'fechado');
  END LOOP;
  INSERT INTO valor_rebanho_fechamento (fazenda_id, cliente_id, ano_mes, status)
    VALUES (v_faz, v_cli, v_mes, 'fechado');
  INSERT INTO valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status)
    VALUES (v_faz, v_cli, v_mes, 'validado'), (v_faz, v_cli, v_mes_seg, 'validado');

  -- T3 (v_faz3): alvo SEM qualquer estado; posterior validado.
  INSERT INTO valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status)
    VALUES (v_faz3, v_cli, v_pos3, 'validado');

  -- Prova de identidade: o trigger vinculou o usuario APENAS as fazendas sinteticas,
  -- e as memberships reais preexistentes permanecem inalteradas.
  IF (SELECT count(*) FROM fazenda_membros WHERE user_id=v_user AND fazenda_id IN (v_faz, v_faz3)) <> 2
     THEN RAISE EXCEPTION 'fixture: trigger nao criou os 2 vinculos sinteticos esperados'; END IF;
  IF (SELECT count(*) FROM fazenda_membros WHERE user_id=v_user AND fazenda_id NOT IN (v_faz, v_faz3)) <> v_real_fm_before
     THEN RAISE EXCEPTION 'fixture: memberships REAIS do usuario foram alteradas'; END IF;

  -- Impersonar o mesmo usuario real (auth.uid()); admin global -> autoriza a RPC.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- ======================= T1 — primeira execucao =======================
  r1 := public.fn_reabrir_p1_operacional(v_faz, v_mes, 'teste T1');

  IF (r1->>'p2_realizados_alterados') <> '2' THEN RAISE EXCEPTION 'T1 p2_realizados_alterados=% (esperado 2)', r1->>'p2_realizados_alterados'; END IF;
  IF (r1->'meses_invalidados') <> '["2020-01","2020-02"]'::jsonb THEN RAISE EXCEPTION 'T1 meses_invalidados=%', r1->'meses_invalidados'; END IF;
  IF (r1->'estados_por_mes') <> '[{"ano_mes":"2020-01","status":"invalidado"},{"ano_mes":"2020-02","status":"cadeia_quebrada"}]'::jsonb
     THEN RAISE EXCEPTION 'T1 estados_por_mes=%', r1->'estados_por_mes'; END IF;
  IF (r1->>'p2_fechamento_aberto') <> 'true'  THEN RAISE EXCEPTION 'T1 p2_fechamento_aberto=%', r1->>'p2_fechamento_aberto'; END IF;
  IF (r1->>'cards_reabertos')      <> '64'    THEN RAISE EXCEPTION 'T1 cards_reabertos=%', r1->>'cards_reabertos'; END IF;
  IF (r1->>'logs_gravados')        <> '2'     THEN RAISE EXCEPTION 'T1 logs_gravados=%', r1->>'logs_gravados'; END IF;
  IF (r1->>'cabecalho_criado')     <> 'true'  THEN RAISE EXCEPTION 'T1 cabecalho_criado=%', r1->>'cabecalho_criado'; END IF;
  IF (r1->>'cabecalho_atualizado') <> 'false' THEN RAISE EXCEPTION 'T1 cabecalho_atualizado=%', r1->>'cabecalho_atualizado'; END IF;
  IF (r1->>'nenhuma_alteracao')    <> 'false' THEN RAISE EXCEPTION 'T1 nenhuma_alteracao=%', r1->>'nenhuma_alteracao'; END IF;

  SELECT reaberto_em INTO v_t1 FROM public.fechamento_p1 WHERE fazenda_id=v_faz AND ano_mes=v_mes;
  IF NOT EXISTS (SELECT 1 FROM public.fechamento_p1
                 WHERE fazenda_id=v_faz AND ano_mes=v_mes
                   AND status='reaberto' AND origem_legado=true AND versao=1 AND reaberto_em IS NOT NULL)
     THEN RAISE EXCEPTION 'T1 cabecalho invalido'; END IF;
  IF (SELECT status FROM valor_rebanho_realizado_validado WHERE fazenda_id=v_faz AND ano_mes=v_mes) <> 'invalidado'
     THEN RAISE EXCEPTION 'T1 realizado alvo != invalidado'; END IF;
  IF (SELECT status FROM valor_rebanho_realizado_validado WHERE fazenda_id=v_faz AND ano_mes=v_mes_seg) <> 'cadeia_quebrada'
     THEN RAISE EXCEPTION 'T1 realizado seguinte != cadeia_quebrada'; END IF;
  IF (SELECT status FROM valor_rebanho_fechamento WHERE fazenda_id=v_faz AND ano_mes=v_mes) <> 'aberto'
     THEN RAISE EXCEPTION 'T1 p2 fechamento != aberto'; END IF;
  IF (SELECT count(*) FROM fechamento_pastos WHERE fazenda_id=v_faz AND ano_mes=v_mes AND status='rascunho') <> 64
     THEN RAISE EXCEPTION 'T1 cards rascunho != 64'; END IF;
  IF (SELECT count(*) FROM fechamento_pastos WHERE fazenda_id=v_faz AND ano_mes=v_mes AND status='fechado') <> 0
     THEN RAISE EXCEPTION 'T1 ainda ha cards fechado'; END IF;

  RAISE NOTICE 'T1 OK';

  -- ======================= T2 — idempotencia (identica) =======================
  r2 := public.fn_reabrir_p1_operacional(v_faz, v_mes, 'teste T2');

  IF (r2->>'p2_realizados_alterados') <> '0'     THEN RAISE EXCEPTION 'T2 p2_realizados_alterados=%', r2->>'p2_realizados_alterados'; END IF;
  IF (r2->'meses_invalidados')        <> '[]'::jsonb THEN RAISE EXCEPTION 'T2 meses_invalidados=%', r2->'meses_invalidados'; END IF;
  IF (r2->'estados_por_mes')          <> '[]'::jsonb THEN RAISE EXCEPTION 'T2 estados_por_mes=%', r2->'estados_por_mes'; END IF;
  IF (r2->>'p2_fechamento_aberto')    <> 'false' THEN RAISE EXCEPTION 'T2 p2_fechamento_aberto=%', r2->>'p2_fechamento_aberto'; END IF;
  IF (r2->>'cards_reabertos')         <> '0'     THEN RAISE EXCEPTION 'T2 cards_reabertos=%', r2->>'cards_reabertos'; END IF;
  IF (r2->>'logs_gravados')           <> '0'     THEN RAISE EXCEPTION 'T2 logs_gravados=%', r2->>'logs_gravados'; END IF;
  IF (r2->>'cabecalho_criado')        <> 'false' THEN RAISE EXCEPTION 'T2 cabecalho_criado=%', r2->>'cabecalho_criado'; END IF;
  IF (r2->>'cabecalho_atualizado')    <> 'false' THEN RAISE EXCEPTION 'T2 cabecalho_atualizado=%', r2->>'cabecalho_atualizado'; END IF;
  IF (r2->>'nenhuma_alteracao')       <> 'true'  THEN RAISE EXCEPTION 'T2 nenhuma_alteracao=%', r2->>'nenhuma_alteracao'; END IF;
  IF (SELECT reaberto_em FROM public.fechamento_p1 WHERE fazenda_id=v_faz AND ano_mes=v_mes) <> v_t1
     THEN RAISE EXCEPTION 'T2 reaberto_em foi alterado (idempotencia quebrada)'; END IF;
  SELECT count(*) INTO v_n FROM fechamento_reaberturas_log WHERE fazenda_id=v_faz;
  IF v_n <> 2 THEN RAISE EXCEPTION 'T2 logs totais=% (esperado 2)', v_n; END IF;

  RAISE NOTICE 'T2 OK';

  -- ======================= T3 — mes inelegivel NAO quebra cadeia (fazenda independente) =======================
  IF (SELECT status FROM valor_rebanho_realizado_validado WHERE fazenda_id=v_faz3 AND ano_mes=v_pos3) <> 'validado'
     THEN RAISE EXCEPTION 'T3 pre-condicao: posterior deveria estar validado'; END IF;

  r3 := public.fn_reabrir_p1_operacional(v_faz3, v_alvo3, 'teste T3');

  IF (r3->>'p2_realizados_alterados') <> '0'     THEN RAISE EXCEPTION 'T3 p2_realizados_alterados=%', r3->>'p2_realizados_alterados'; END IF;
  IF (r3->'meses_invalidados')        <> '[]'::jsonb THEN RAISE EXCEPTION 'T3 meses_invalidados=%', r3->'meses_invalidados'; END IF;
  IF (r3->>'p2_fechamento_aberto')    <> 'false' THEN RAISE EXCEPTION 'T3 p2_fechamento_aberto=%', r3->>'p2_fechamento_aberto'; END IF;
  IF (r3->>'cards_reabertos')         <> '0'     THEN RAISE EXCEPTION 'T3 cards_reabertos=%', r3->>'cards_reabertos'; END IF;
  IF (r3->>'logs_gravados')           <> '0'     THEN RAISE EXCEPTION 'T3 logs_gravados=%', r3->>'logs_gravados'; END IF;
  IF (r3->>'cabecalho_criado')        <> 'false' THEN RAISE EXCEPTION 'T3 cabecalho_criado=%', r3->>'cabecalho_criado'; END IF;
  IF (r3->>'cabecalho_atualizado')    <> 'false' THEN RAISE EXCEPTION 'T3 cabecalho_atualizado=%', r3->>'cabecalho_atualizado'; END IF;
  IF (r3->>'nenhuma_alteracao')       <> 'true'  THEN RAISE EXCEPTION 'T3 nenhuma_alteracao=%', r3->>'nenhuma_alteracao'; END IF;
  -- CRITICO: o mes posterior PERMANECE validado (cadeia intacta)
  IF (SELECT status FROM valor_rebanho_realizado_validado WHERE fazenda_id=v_faz3 AND ano_mes=v_pos3) <> 'validado'
     THEN RAISE EXCEPTION 'T3 REGRESSAO: mes posterior deixou de ser validado (cadeia quebrada por mes inelegivel)'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_p1 WHERE fazenda_id=v_faz3 AND ano_mes=v_alvo3)
     THEN RAISE EXCEPTION 'T3 cabecalho criado para mes inelegivel'; END IF;
  IF EXISTS (SELECT 1 FROM fechamento_reaberturas_log WHERE fazenda_id=v_faz3)
     THEN RAISE EXCEPTION 'T3 log gravado para mes inelegivel'; END IF;

  RAISE NOTICE 'T3 OK';

  -- ======================= T4 — formato invalido rejeitado (SQLSTATE 22007) =======================
  BEGIN
    PERFORM public.fn_reabrir_p1_operacional(v_faz3, '2020-13', 'teste T4');
    RAISE EXCEPTION 'T4 deveria rejeitar ano_mes invalido';
  EXCEPTION
    WHEN SQLSTATE '22007' THEN
      NULL;  -- rejeicao esperada
  END;
  IF (SELECT status FROM valor_rebanho_realizado_validado WHERE fazenda_id=v_faz3 AND ano_mes=v_pos3) <> 'validado'
     THEN RAISE EXCEPTION 'T4 posterior deixou de ser validado'; END IF;
  IF EXISTS (SELECT 1 FROM public.fechamento_p1 WHERE fazenda_id=v_faz3)
     THEN RAISE EXCEPTION 'T4 cabecalho criado para formato invalido'; END IF;
  IF EXISTS (SELECT 1 FROM fechamento_reaberturas_log WHERE fazenda_id=v_faz3)
     THEN RAISE EXCEPTION 'T4 log gravado para formato invalido'; END IF;

  RAISE NOTICE 'T4 OK';
  RAISE NOTICE 'FIM: T1/T2/T3/T4 executados sem falha de assercao neste run';
END $fix$;

ROLLBACK;

-- ============================================================================
-- POS-ROLLBACK — ausencia de qualquer linha sintetica DESTA execucao (por token)
-- ============================================================================
DO $post$
DECLARE v_tag text := current_setting('app.p0a_test_tag');
BEGIN
  IF EXISTS (SELECT 1 FROM clientes WHERE nome LIKE '%'||v_tag)
     THEN RAISE EXCEPTION 'POS-ROLLBACK: cliente sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM fazendas WHERE nome LIKE '%'||v_tag)
     THEN RAISE EXCEPTION 'POS-ROLLBACK: fazenda sintetica persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM pastos WHERE nome LIKE '%'||v_tag)
     THEN RAISE EXCEPTION 'POS-ROLLBACK: pasto sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM fazenda_membros fm JOIN fazendas f ON f.id=fm.fazenda_id WHERE f.nome LIKE '%'||v_tag)
     THEN RAISE EXCEPTION 'POS-ROLLBACK: fazenda_membros sintetico persistiu'; END IF;
  IF EXISTS (SELECT 1 FROM fechamento_p1)
     THEN RAISE EXCEPTION 'POS-ROLLBACK: fechamento_p1 nao esta vazia'; END IF;
  RAISE NOTICE 'POS-ROLLBACK OK: nenhuma linha sintetica persistiu; fechamento_p1 vazia';
END $post$;

-- Limpeza do token de sessao.
SELECT set_config('app.p0a_test_tag', '', false) AS run_tag_reset;

-- ============================================================================
-- BASELINE SANTA RITA — DEPOIS (fora de transacao; deve ser IDENTICO ao ANTES)
-- ============================================================================
SELECT 'BASELINE_DEPOIS' AS marco,
  (SELECT count(*) FROM fechamento_pastos fp JOIN fazendas f ON f.id=fp.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND fp.ano_mes='2026-05' AND fp.status='fechado') AS cards_mai_fechado,
  (SELECT count(*) FROM fechamento_pastos fp JOIN fazendas f ON f.id=fp.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND fp.ano_mes='2026-06' AND fp.status='fechado') AS cards_jun_fechado,
  (SELECT string_agg(vf.ano_mes||':'||vf.status, ',' ORDER BY vf.ano_mes) FROM valor_rebanho_fechamento vf
     JOIN fazendas f ON f.id=vf.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND vf.ano_mes IN ('2026-05','2026-06')) AS p2fech,
  (SELECT string_agg(vr.ano_mes||':'||vr.status, ',' ORDER BY vr.ano_mes) FROM valor_rebanho_realizado_validado vr
     JOIN fazendas f ON f.id=vr.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND vr.ano_mes IN ('2026-05','2026-06')) AS p2val,
  (SELECT count(*) FROM fechamento_area_snapshot s JOIN fazendas f ON f.id=s.fazenda_id JOIN clientes c ON c.id=f.cliente_id
     WHERE c.nome='Santa Rita Agro' AND s.ano_mes >= DATE '2026-05-01' AND s.ano_mes < DATE '2026-07-01') AS snapshots;
