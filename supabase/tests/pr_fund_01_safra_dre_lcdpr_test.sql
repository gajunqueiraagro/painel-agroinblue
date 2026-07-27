-- PR-FUND-01 — suíte de contrato da fundação (escopo de Safra + compoe_dre/gera_lcdpr).
--   Requer a migration 20260727130000 aplicada. Padrão do repo: BEGIN...ROLLBACK + fixtures
--   por tag + asserts RAISE 'T# FAIL'. Rodar SOMENTE em runtime autorizado no PROTO; o ROLLBACK
--   garante que nada persiste. NUNCA em produção.
SELECT set_config('app.fund01_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_cli uuid; v_tag text := current_setting('app.fund01_tag');
  v_p_dtrue uuid; v_p_dfalse uuid; v_p_ltrue uuid; v_p_lfalse uuid; v_p_lnull uuid; v_p_byid uuid;
  v_cnt int; v_dre boolean; v_lcdpr boolean; v_id uuid; v_default text;
BEGIN
  SELECT cm.cliente_id INTO v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_cli IS NULL THEN RAISE EXCEPTION 'fixture: sem cliente admin'; END IF;

  -- T1 — as cinco colunas novas existem
  SELECT count(*) INTO v_cnt FROM information_schema.columns
   WHERE table_schema='public' AND (
     (table_name='financeiro_safras'        AND column_name='escopo_negocio') OR
     (table_name='financeiro_plano_contas'  AND column_name='compoe_dre')    OR
     (table_name='financeiro_plano_contas'  AND column_name='gera_lcdpr')    OR
     (table_name='financeiro_lancamentos_v2' AND column_name='compoe_dre')   OR
     (table_name='financeiro_lancamentos_v2' AND column_name='gera_lcdpr'));
  IF v_cnt<>5 THEN RAISE EXCEPTION 'T1 FAIL: colunas novas presentes=% (esperado 5)', v_cnt; END IF;
  RAISE NOTICE 'T1 PASS';

  -- Fixtures de plano (ativo=true), hierarquias/subcentros distintos (uq_plano_contas_global)
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (v_cli,'2-Saídas',v_tag||'-m',v_tag||'-g',v_tag||'-c',v_tag||'-dtrue','pecuaria',true,1) RETURNING id INTO v_p_dtrue;   -- compoe_dre default (true)
  -- T2 — plano sem indicação de DRE nasce compoe_dre=true e gera_lcdpr NULL
  SELECT compoe_dre, gera_lcdpr INTO v_dre, v_lcdpr FROM public.financeiro_plano_contas WHERE id=v_p_dtrue;
  IF v_dre IS NOT TRUE OR v_lcdpr IS NOT NULL THEN RAISE EXCEPTION 'T2 FAIL: plano default compoe_dre=% gera_lcdpr=%', v_dre, v_lcdpr; END IF;
  RAISE NOTICE 'T2 PASS';

  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,compoe_dre)
    VALUES (v_cli,'2-Saídas',v_tag||'-m',v_tag||'-g',v_tag||'-c',v_tag||'-dfalse','pecuaria',true,2,false) RETURNING id INTO v_p_dfalse;
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,gera_lcdpr)
    VALUES (v_cli,'2-Saídas',v_tag||'-m',v_tag||'-g',v_tag||'-c',v_tag||'-ltrue','pecuaria',true,3,true) RETURNING id INTO v_p_ltrue;
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,gera_lcdpr)
    VALUES (v_cli,'2-Saídas',v_tag||'-m',v_tag||'-g',v_tag||'-c',v_tag||'-lfalse','pecuaria',true,4,false) RETURNING id INTO v_p_lfalse;
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (v_cli,'2-Saídas',v_tag||'-m',v_tag||'-g',v_tag||'-c',v_tag||'-lnull','pecuaria',true,5) RETURNING id INTO v_p_lnull;   -- gera_lcdpr NULL
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao,compoe_dre,gera_lcdpr)
    VALUES (v_cli,'2-Saídas',v_tag||'-m',v_tag||'-g',v_tag||'-c',v_tag||'-byid','pecuaria',true,6,false,true) RETURNING id INTO v_p_byid;

  -- Helper: inserir lançamento por SUBCENTRO e devolver os flags materializados
  -- T3 — subcentro com compoe_dre=true → materializa TRUE
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,101,'2-Saídas',v_tag||'-dtrue',DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  SELECT compoe_dre INTO v_dre FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_dre IS NOT TRUE THEN RAISE EXCEPTION 'T3 FAIL: compoe_dre=%', v_dre; END IF; RAISE NOTICE 'T3 PASS';

  -- T4 — plano compoe_dre=false → lançamento FALSE
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,102,'2-Saídas',v_tag||'-dfalse',DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  SELECT compoe_dre INTO v_dre FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_dre IS NOT FALSE THEN RAISE EXCEPTION 'T4 FAIL: compoe_dre=%', v_dre; END IF; RAISE NOTICE 'T4 PASS';

  -- T5 — valor EXPLÍCITO no lançamento é preservado (true sobre plano false)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao,compoe_dre)
    VALUES (v_cli,103,'2-Saídas',v_tag||'-dfalse',DATE '2026-07-27',DATE '2026-07-27','programado',true) RETURNING id INTO v_id;
  SELECT compoe_dre INTO v_dre FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_dre IS NOT TRUE THEN RAISE EXCEPTION 'T5 FAIL: compoe_dre explícito não preservado=%', v_dre; END IF; RAISE NOTICE 'T5 PASS';

  -- T6 — plano gera_lcdpr=true → lançamento TRUE
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,104,'2-Saídas',v_tag||'-ltrue',DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  SELECT gera_lcdpr INTO v_lcdpr FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_lcdpr IS NOT TRUE THEN RAISE EXCEPTION 'T6 FAIL: gera_lcdpr=%', v_lcdpr; END IF; RAISE NOTICE 'T6 PASS';

  -- T7 — plano gera_lcdpr=false → lançamento FALSE
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,105,'2-Saídas',v_tag||'-lfalse',DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  SELECT gera_lcdpr INTO v_lcdpr FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_lcdpr IS NOT FALSE THEN RAISE EXCEPTION 'T7 FAIL: gera_lcdpr=%', v_lcdpr; END IF; RAISE NOTICE 'T7 PASS';

  -- T8 — plano gera_lcdpr NULL → lançamento NULL (não vira Não automaticamente)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,106,'2-Saídas',v_tag||'-lnull',DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  SELECT gera_lcdpr, compoe_dre INTO v_lcdpr, v_dre FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_lcdpr IS NOT NULL THEN RAISE EXCEPTION 'T8 FAIL: gera_lcdpr deveria ser NULL=%', v_lcdpr; END IF;
  IF v_dre IS NOT TRUE THEN RAISE EXCEPTION 'T8 FAIL: compoe_dre deveria ser true=%', v_dre; END IF;
  RAISE NOTICE 'T8 PASS';

  -- T9 — valor EXPLÍCITO de gera_lcdpr no lançamento é preservado (false sobre plano true)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao,gera_lcdpr)
    VALUES (v_cli,107,'2-Saídas',v_tag||'-ltrue',DATE '2026-07-27',DATE '2026-07-27','programado',false) RETURNING id INTO v_id;
  SELECT gera_lcdpr INTO v_lcdpr FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_lcdpr IS NOT FALSE THEN RAISE EXCEPTION 'T9 FAIL: gera_lcdpr explícito não preservado=%', v_lcdpr; END IF; RAISE NOTICE 'T9 PASS';

  -- T3b — prioridade de plano_conta_id (subcentro NULL): plano byid (compoe_dre=false, gera_lcdpr=true)
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,plano_conta_id,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,108,'2-Saídas',NULL,v_p_byid,DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  SELECT compoe_dre, gera_lcdpr INTO v_dre, v_lcdpr FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_dre IS NOT FALSE OR v_lcdpr IS NOT TRUE THEN RAISE EXCEPTION 'T3b FAIL: por plano_conta_id compoe=% lcdpr=%', v_dre, v_lcdpr; END IF; RAISE NOTICE 'T3b PASS (prioriza plano_conta_id)';

  -- T10 — UPDATE de lançamento com os dois campos NULL (legado simulado) NÃO materializa
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,subcentro,data_competencia,data_pagamento,status_transacao)
    VALUES (v_cli,109,'2-Saídas',v_tag||'-dtrue',DATE '2026-07-27',DATE '2026-07-27','programado') RETURNING id INTO v_id;
  UPDATE public.financeiro_lancamentos_v2 SET compoe_dre=NULL, gera_lcdpr=NULL WHERE id=v_id;   -- simula legado
  UPDATE public.financeiro_lancamentos_v2 SET observacao=v_tag||'-touch' WHERE id=v_id;          -- "toca" o registro
  SELECT compoe_dre, gera_lcdpr INTO v_dre, v_lcdpr FROM public.financeiro_lancamentos_v2 WHERE id=v_id;
  IF v_dre IS NOT NULL OR v_lcdpr IS NOT NULL THEN RAISE EXCEPTION 'T10 FAIL: UPDATE materializou legado compoe=% lcdpr=%', v_dre, v_lcdpr; END IF;
  RAISE NOTICE 'T10 PASS (UPDATE nao materializa)';

  -- T11 — SEM backfill: colunas do lançamento não têm default de banco (ADD COLUMN não backfilla os ~81k)
  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2' AND column_name='compoe_dre';
  IF v_default IS NOT NULL THEN RAISE EXCEPTION 'T11 FAIL: lancamento.compoe_dre tem default=%', v_default; END IF;
  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2' AND column_name='gera_lcdpr';
  IF v_default IS NOT NULL THEN RAISE EXCEPTION 'T11 FAIL: lancamento.gera_lcdpr tem default=%', v_default; END IF;
  RAISE NOTICE 'T11 PASS (sem default/backfill no lancamento)';

  -- T12 — Safras existentes preservadas: nenhuma safra com escopo_negocio (sem backfill); >=2 safras
  SELECT count(*) INTO v_cnt FROM public.financeiro_safras WHERE escopo_negocio IS NOT NULL;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T12 FAIL: % safras com escopo (esperado 0)', v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_safras;
  IF v_cnt<2 THEN RAISE EXCEPTION 'T12 FAIL: safras existentes=% (esperado >=2)', v_cnt; END IF;
  RAISE NOTICE 'T12 PASS (safras intactas, escopo NULL)';

  RAISE NOTICE '=== PR-FUND-01: T1..T12 (+T3b) PASS ===';
END $t$;

ROLLBACK;  -- T13: nada persiste
SELECT 'fund01_rolled_back' AS fim;
