-- PR-P1-GOV-REABERTURA-P0A — Teste transacional de fn_reabrir_p1_operacional.
-- Executar SOMENTE apos aplicar as 4 migrations. Roda em BEGIN...ROLLBACK:
--   NADA persiste. Fixture 100% sintetica (UUIDs gerados na transacao).
-- Santa Rita e referenciada apenas por NOME ('Santa Rita Agro') — nunca por ID.
--
-- FIXTURE x SCHEMA REAL:
--   - fazendas tem AFTER INSERT trigger auto_add_owner_as_membro, que insere em
--     fazenda_membros(NEW.id, NEW.owner_id, 'dono'); fazenda_membros.user_id tem FK
--     para auth.users(id). Uma fazenda sintetica dispararia esse trigger e falharia
--     (owner_id NULL viola NOT NULL; UUID sintetico viola a FK). Solucao: desabilitar
--     triggers durante o SETUP via session_replication_role='replica' (transacional,
--     revertido no ROLLBACK) e REABILITAR antes das chamadas da RPC, para que a RPC
--     exercite os triggers reais (guard bypass, invalidate AFTER UPDATE).
--   - cliente_membros NAO tem FK nem trigger -> membership sintetica e valida.
--   - get_user_cliente_ids filtra ativo=true e nao checa perfil -> autoriza.
--
-- Casos: T1 primeira execucao, T2 idempotencia, T3 (fazenda propria) no-op de mes
--   inelegivel com mes POSTERIOR ainda validado — prova que competencia arbitraria
--   nao quebra a cadeia.

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
  v_cli   uuid := gen_random_uuid();
  v_faz   uuid := gen_random_uuid();   -- T1/T2
  v_faz3  uuid := gen_random_uuid();   -- T3 (independente)
  v_user  uuid := gen_random_uuid();
  v_mes     text := '2020-01';  -- alvo T1/T2
  v_mes_seg text := '2020-02';  -- seguinte (cadeia) T1/T2
  v_alvo3   text := '2020-01';  -- alvo T3: SEM estado elegivel
  v_pos3    text := '2020-02';  -- posterior T3: validado, deve PERMANECER validado
  i int;
  r1 jsonb; r2 jsonb; r3 jsonb;
  v_t1 timestamptz;
  v_n int;
BEGIN
  -- ==== SETUP com triggers desabilitados (evita auto_add_owner_as_membro/FK auth.users) ====
  -- is_local=true: escopo TRANSACIONAL. Se uma excecao ocorrer antes do reset, o abort
  -- da transacao restaura automaticamente para o valor anterior — a sessao NUNCA fica em replica.
  PERFORM set_config('session_replication_role', 'replica', true);

  INSERT INTO clientes (id, nome) VALUES (v_cli, 'CLIENTE_TESTE_P0A');
  INSERT INTO fazendas (id, cliente_id, nome) VALUES
    (v_faz,  v_cli, 'FAZENDA_TESTE_P0A_T12'),
    (v_faz3, v_cli, 'FAZENDA_TESTE_P0A_T3');
  INSERT INTO cliente_membros (user_id, cliente_id, perfil, ativo)
    VALUES (v_user, v_cli, 'gestor_cliente', true);

  -- Fixture T1/T2 (v_faz): 64 cards fechado + P2 fechado + realizado validado (alvo e seguinte)
  FOR i IN 1..64 LOOP
    INSERT INTO fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
      VALUES (gen_random_uuid(), v_faz, v_cli, v_mes, 'fechado');
  END LOOP;
  INSERT INTO valor_rebanho_fechamento (fazenda_id, cliente_id, ano_mes, status)
    VALUES (v_faz, v_cli, v_mes, 'fechado');
  INSERT INTO valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status)
    VALUES (v_faz, v_cli, v_mes, 'validado'), (v_faz, v_cli, v_mes_seg, 'validado');

  -- Fixture T3 (v_faz3): alvo SEM qualquer estado; posterior validado.
  INSERT INTO valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status)
    VALUES (v_faz3, v_cli, v_pos3, 'validado');

  -- ==== REABILITAR triggers e impersonar usuario sintetico ====
  PERFORM set_config('session_replication_role', 'origin', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- Guard de fixture: garantir triggers reativados ANTES de qualquer RPC.
  IF current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'fixture insegura: session_replication_role nao restaurado para origin';
  END IF;

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
  -- Pre-condicao: v_faz3 tem posterior (v_pos3) validado e NENHUM estado no alvo (v_alvo3).
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
  -- nenhum efeito: posterior da fixture T3 continua validado; nada de log/cabecalho novo
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
