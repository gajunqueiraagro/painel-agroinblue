-- PR-P1-DATA-FIM-01 — testes de get_status_pilares_fechamento com filtro de vigencia.
--   Requer aplicada: 20260829140000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
--
--   T1..T4 usam fazenda SINTETICA, criada e desfeita no rollback: sao os quatro casos
--   da regra, isolados de qualquer dado real.
--   T5..T7 usam a Faz. Pureza REAL, que e' o caso que originou o PR.
SELECT set_config('app.p1df_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_faz uuid; v_pureza uuid;
  v_p_fim_antes uuid; v_p_fim_dentro uuid; v_p_ini_depois uuid; v_p_sem_datas uuid;
  v_st text; v_cnt int; v_mes text;
BEGIN
  v_tag := current_setting('app.p1df_tag');
  /* ⚠ O JOIN COM auth.users NAO E' DECORATIVO. `cliente_membros` nao tem FK para
     `auth.users`, entao ha admin ativo apontando para usuario que nao existe — MEDIDO
     no proto: 4 dos 6 registros com perfil='admin_agroinblue' e ativo=true sao orfaos.
     Sem o JOIN, o `ORDER BY cm.user_id LIMIT 1` pegava um deles e a fixture morria em
     23503 (fazendas_owner_id_fkey) antes de qualquer assercao rodar.
     PENDENCIA REGISTRADA, fora do escopo deste PR: auditar esses 4 registros. */
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido em auth.users'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- ===================== FIXTURE SINTETICA =====================
  -- Mes de referencia: 2026-03 (01/03 a 31/03).
  /* `codigo` e' NOT NULL sem default — conferido no schema; omiti-lo quebraria o insert.
     `owner_id` tambem e' obrigatorio na pratica, ainda que a coluna aceite NULL: o
     trigger `auto_add_owner_as_membro` insere em `fazenda_membros` usando NEW.owner_id,
     e la o user_id e' NOT NULL — sem owner o trigger grava NULL e estoura 23502. */
  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id)
    VALUES (v_cli, 'ZZ TESTE P1 '||v_tag, 'ZZ'||left(v_tag,6), v_admin) RETURNING id INTO v_faz;

  -- (a) encerrado ANTES do mes — nao esteve la nenhum dia
  INSERT INTO public.pastos (fazenda_id, nome, ativo, tipo_uso, data_inicio, data_fim)
    VALUES (v_faz, 'A fim antes', true, 'cria', DATE '2024-01-01', DATE '2026-02-28') RETURNING id INTO v_p_fim_antes;
  -- (b) encerrado DENTRO do mes — esteve la parte dele
  INSERT INTO public.pastos (fazenda_id, nome, ativo, tipo_uso, data_inicio, data_fim)
    VALUES (v_faz, 'B fim dentro', true, 'cria', DATE '2024-01-01', DATE '2026-03-15') RETURNING id INTO v_p_fim_dentro;
  -- (c) so comeca DEPOIS do mes
  INSERT INTO public.pastos (fazenda_id, nome, ativo, tipo_uso, data_inicio, data_fim)
    VALUES (v_faz, 'C inicio depois', true, 'cria', DATE '2026-04-01', NULL) RETURNING id INTO v_p_ini_depois;
  -- (d) sem limite nas duas pontas — conta como sempre contou
  INSERT INTO public.pastos (fazenda_id, nome, ativo, tipo_uso, data_inicio, data_fim)
    VALUES (v_faz, 'D sem datas', true, 'cria', NULL, NULL) RETURNING id INTO v_p_sem_datas;

  -- Cards do mes: TODOS em rascunho. Se um pasto fora de vigencia contar, o mes
  -- fica 'pendente'; se so contarem os vigentes, tambem fica 'pendente'. Por isso os
  -- testes T1..T4 fecham SELETIVAMENTE, um cenario por vez, em vez de olhar so o status.
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, ano_mes, status) VALUES
    (v_p_fim_antes,  v_faz, '2026-03', 'rascunho'),
    (v_p_fim_dentro, v_faz, '2026-03', 'rascunho'),
    (v_p_ini_depois, v_faz, '2026-03', 'rascunho'),
    (v_p_sem_datas,  v_faz, '2026-03', 'rascunho');

  -- ===================== T1 — encerrado ANTES nao conta =====================
  -- Fecha (b) e (d), os dois vigentes. (a) e (c) ficam em rascunho: se contassem, o
  -- status seria 'pendente'. Espera-se 'oficial'.
  UPDATE public.fechamento_pastos SET status='fechado'
   WHERE fazenda_id=v_faz AND ano_mes='2026-03' AND pasto_id IN (v_p_fim_dentro, v_p_sem_datas);
  v_st := public.get_status_pilares_fechamento(v_faz,'2026-03')->'p1_mapa_pastos'->>'status';
  IF v_st <> 'oficial' THEN
    RAISE EXCEPTION 'T1/T3 FAIL: com (a) fim-antes e (c) inicio-depois em rascunho, p1=% (esperado oficial)', v_st; END IF;

  -- ===================== T2 — encerrado DENTRO do mes CONTA =====================
  -- Reabre so (b): esteve vigente ate 15/03, entao ainda e exigido e o mes cai.
  UPDATE public.fechamento_pastos SET status='rascunho'
   WHERE fazenda_id=v_faz AND ano_mes='2026-03' AND pasto_id=v_p_fim_dentro;
  v_st := public.get_status_pilares_fechamento(v_faz,'2026-03')->'p1_mapa_pastos'->>'status';
  IF v_st <> 'pendente' THEN
    RAISE EXCEPTION 'T2 FAIL: (b) encerrado dentro do mes deveria contar; p1=% (esperado pendente)', v_st; END IF;

  -- ===================== T4 — sem datas CONTA, como sempre =====================
  UPDATE public.fechamento_pastos SET status='fechado'
   WHERE fazenda_id=v_faz AND ano_mes='2026-03' AND pasto_id=v_p_fim_dentro;
  UPDATE public.fechamento_pastos SET status='rascunho'
   WHERE fazenda_id=v_faz AND ano_mes='2026-03' AND pasto_id=v_p_sem_datas;
  v_st := public.get_status_pilares_fechamento(v_faz,'2026-03')->'p1_mapa_pastos'->>'status';
  IF v_st <> 'pendente' THEN
    RAISE EXCEPTION 'T4 FAIL: (d) sem datas deveria contar; p1=% (esperado pendente)', v_st; END IF;

  -- ===================== T4b — `_cards_no_mes` intacto =====================
  -- Mes sem card nenhum continua 'nao_iniciado', e mes so com card de pasto fora de
  -- vigencia NAO volta a 'nao_iniciado' — a contagem sem filtro nao foi tocada.
  v_st := public.get_status_pilares_fechamento(v_faz,'2026-09')->'p1_mapa_pastos'->>'status';
  IF v_st <> 'nao_iniciado' THEN RAISE EXCEPTION 'T4b FAIL: mes sem card p1=%', v_st; END IF;
  INSERT INTO public.fechamento_pastos (pasto_id, fazenda_id, ano_mes, status)
    VALUES (v_p_fim_antes, v_faz, '2026-09', 'rascunho');
  v_st := public.get_status_pilares_fechamento(v_faz,'2026-09')->'p1_mapa_pastos'->>'status';
  IF v_st <> 'pendente' THEN
    RAISE EXCEPTION 'T4b FAIL: mes com card so de pasto fora de vigencia deveria ser pendente, nao nao_iniciado; p1=%', v_st; END IF;

  -- ===================== FAZ. PUREZA (dado real) =====================
  SELECT f.id INTO v_pureza FROM public.fazendas f JOIN public.clientes c ON c.id=f.cliente_id
   WHERE c.nome='NJ Pecuária' AND f.nome='Faz. Pureza';
  IF v_pureza IS NULL THEN RAISE EXCEPTION 'fixture: Faz. Pureza nao encontrada'; END IF;

  -- T5 — os TRES meses que a correcao destrava. ⚠ O briefing previa apenas fevereiro;
  --   a varredura completa (741 combinacoes fazenda-mes) mostrou 2026-01, 02 e 03, os
  --   tres travados pelos mesmos IND.05/IND.06 em rascunho.
  FOREACH v_mes IN ARRAY ARRAY['2026-01','2026-02','2026-03'] LOOP
    v_st := public.get_status_pilares_fechamento(v_pureza, v_mes)->'p1_mapa_pastos'->>'status';
    IF v_st <> 'oficial' THEN
      RAISE EXCEPTION 'T5 FAIL: Pureza % deveria estar oficial apos a correcao, esta %', v_mes, v_st; END IF;
  END LOOP;

  -- T6 — NAO REGRIDE: meses que ja eram oficiais continuam oficiais.
  FOREACH v_mes IN ARRAY ARRAY['2026-06','2026-07'] LOOP
    v_st := public.get_status_pilares_fechamento(v_pureza, v_mes)->'p1_mapa_pastos'->>'status';
    IF v_st <> 'oficial' THEN
      RAISE EXCEPTION 'T6 FAIL: Pureza % regrediu, p1=%', v_mes, v_st; END IF;
  END LOOP;

  -- T7 — fazenda SEM pasto encerrado: resultado identico ao que a regra antiga daria.
  --   Compara o status da funcao com a contagem antiga (so `ativo`) recalculada aqui.
  --   Percorre todas as fazendas cujos pastos nao tem data_fim.
  SELECT count(*) INTO v_cnt FROM (
    SELECT fp.fazenda_id, fp.ano_mes,
           count(*) FILTER (WHERE p.ativo AND p.tipo_uso IS DISTINCT FROM 'divergencia') AS t_antigo,
           count(*) FILTER (WHERE p.ativo AND p.tipo_uso IS DISTINCT FROM 'divergencia' AND fp.status='fechado') AS f_antigo
      FROM public.fechamento_pastos fp
      JOIN public.pastos p ON p.id = fp.pasto_id
     WHERE fp.fazenda_id NOT IN (SELECT DISTINCT fazenda_id FROM public.pastos WHERE data_fim IS NOT NULL)
       AND fp.fazenda_id <> v_faz
     GROUP BY 1,2
  ) x
  WHERE (CASE WHEN x.t_antigo > 0 AND x.f_antigo = x.t_antigo THEN 'oficial' ELSE 'pendente' END)
        IS DISTINCT FROM (public.get_status_pilares_fechamento(x.fazenda_id, x.ano_mes)->'p1_mapa_pastos'->>'status');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'T7 FAIL: % combinacoes fazenda-mes SEM pasto encerrado mudaram de resultado', v_cnt; END IF;

  RAISE NOTICE 'PR-P1-DATA-FIM-01: T1..T7 PASS';
END $t$;

ROLLBACK;
