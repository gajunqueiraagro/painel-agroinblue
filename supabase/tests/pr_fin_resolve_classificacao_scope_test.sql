-- PR-FIN-RESOLVE-SCOPE-01 — testes transacionais do escopo de resolve_classificacao_from_plano (T1..T17).
--   Valida: INSERT sempre validado; UPDATE só resolve/valida quando muda subcentro/tipo_operacao/
--   plano_conta_id/macro_custo (UPDATE OF + guard OLD x NEW); updates administrativos (status/data/
--   cancelado) NÃO bloqueiam nem reclassificam; ramos T1/T2/B1/T3 preservados; exceção Dividendos
--   preservada; interação de ordem resolve->zzz (compoe_dre) preservada; equivalente ao backfill
--   meta->previsto em linha órfã cancelada não bloqueia.
--
--   Requer aplicada: 20260801130000 (esta correção). BEGIN...ROLLBACK; NÃO persiste. Rodar SOMENTE no
--   PROTO (binbcdfbisgscrifztia). Fixtures: cliente/fazenda reais de teste (idem fin_flags_01a); o
--   PLANO é criado inline (subcentro sintético 'RS01 CANON') e desativado no meio do teste para simular
--   as linhas legadas com subcentro órfão — NÃO depende de IDs de classificação de produção.
--   lote_importacao_id NULL ⇒ hash NULL ⇒ sem colisão de unique_hash.
BEGIN;

DO $t$
DECLARE
  v_cli uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  v_faz uuid := '161b905e-f14c-4a9b-965f-dd3c8f82dc74';
  v_pc  uuid;                                   -- plano canônico sintético
  v_valid uuid; v_div_orphan uuid; v_t3 uuid; v_t10 uuid; v_tmp uuid; v_t12 uuid;
  v_zzz uuid; v_orphan uuid; v_bf uuid;
  v_sub text; v_m text; v_g text; v_c text;
  v_d boolean; v_l boolean; v_ok boolean; v_cnt int; v_st text;
  b_sub text; b_m text; b_g text; b_c text; b_d boolean; b_l boolean;
BEGIN
  -- ═════════ FIXTURE: plano canônico (ativo) ═════════
  INSERT INTO public.financeiro_plano_contas (macro_custo, grupo_custo, centro_custo, subcentro, tipo_operacao, ativo)
    VALUES ('Custeio Produção','RS Grupo','RS Centro','RS01 CANON','2-Saídas', true)
    RETURNING id INTO v_pc;

  -- ═════════ FASE A — plano ativo ═════════

  -- T1: INSERT válido com subcentro canônico ⇒ deriva macro/grupo/centro (T1).
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,status_transacao,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','RS01 CANON','previsto',10,'RS T1')
    RETURNING id, macro_custo, grupo_custo, centro_custo INTO v_valid, v_m, v_g, v_c;
  IF v_m IS DISTINCT FROM 'Custeio Produção' OR v_g IS DISTINCT FROM 'RS Grupo' OR v_c IS DISTINCT FROM 'RS Centro' THEN
    RAISE EXCEPTION 'T1 FAIL: macro=% grupo=% centro=%', v_m, v_g, v_c;
  END IF;

  -- T4: UPDATE apenas de status em linha válida ⇒ passa; classificação intacta.
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='realizado' WHERE id=v_valid;
  SELECT subcentro,macro_custo,grupo_custo,centro_custo INTO v_sub,v_m,v_g,v_c FROM public.financeiro_lancamentos_v2 WHERE id=v_valid;
  IF v_sub IS DISTINCT FROM 'RS01 CANON' OR v_m IS DISTINCT FROM 'Custeio Produção' OR v_g IS DISTINCT FROM 'RS Grupo' OR v_c IS DISTINCT FROM 'RS Centro' THEN
    RAISE EXCEPTION 'T4 FAIL: classificação mudou em update de status (sub=% macro=%)', v_sub, v_m;
  END IF;

  -- T6: UPDATE apenas de data_pagamento ⇒ passa; classificação intacta.
  UPDATE public.financeiro_lancamentos_v2 SET data_pagamento='2026-07-15' WHERE id=v_valid;
  SELECT macro_custo INTO v_m FROM public.financeiro_lancamentos_v2 WHERE id=v_valid;
  IF v_m IS DISTINCT FROM 'Custeio Produção' THEN RAISE EXCEPTION 'T6 FAIL: macro mudou (%)', v_m; END IF;

  -- T7: UPDATE apenas de cancelado ⇒ passa; classificação intacta.
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_valid;
  SELECT macro_custo INTO v_m FROM public.financeiro_lancamentos_v2 WHERE id=v_valid;
  IF v_m IS DISTINCT FROM 'Custeio Produção' THEN RAISE EXCEPTION 'T7 FAIL: macro mudou (%)', v_m; END IF;

  -- T2: INSERT com subcentro órfão e macro <> Dividendos ⇒ check_violation (mensagem preservada).
  v_ok := false;
  BEGIN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,macro_custo,valor,descricao)
      VALUES (v_cli,v_faz,'2-Saídas','RS01 ORPHAN','Custeio Produção',11,'RS T2');
  EXCEPTION WHEN others THEN
    v_ok := (SQLSTATE='23514' AND SQLERRM LIKE 'Subcentro%nao existe no plano%');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T2 FAIL: INSERT órfão não bloqueou como check_violation'; END IF;

  -- T3: INSERT com subcentro órfão e macro='Dividendos' ⇒ passa (exceção preservada).
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,macro_custo,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','RS01 ORPHAN','Dividendos',12,'RS T3')
    RETURNING id, subcentro, macro_custo INTO v_div_orphan, v_sub, v_m;
  IF v_sub IS DISTINCT FROM 'RS01 ORPHAN' OR v_m IS DISTINCT FROM 'Dividendos' THEN
    RAISE EXCEPTION 'T3 FAIL: Dividendos órfão não passou intacto (sub=% macro=%)', v_sub, v_m;
  END IF;

  -- T9: UPDATE real de plano_conta_id com subcentro NULL ⇒ dispara T3, deriva textos.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas',13,'RS T9') RETURNING id INTO v_t3;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id=v_pc WHERE id=v_t3;
  SELECT subcentro,macro_custo,grupo_custo,centro_custo INTO v_sub,v_m,v_g,v_c FROM public.financeiro_lancamentos_v2 WHERE id=v_t3;
  IF v_sub IS DISTINCT FROM 'RS01 CANON' OR v_m IS DISTINCT FROM 'Custeio Produção' THEN
    RAISE EXCEPTION 'T9 FAIL: T3 não derivou por plano_conta_id (sub=% macro=%)', v_sub, v_m;
  END IF;

  -- T10: UPDATE real de subcentro para canônico ⇒ dispara T1/T2, deriva.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas',14,'RS T10') RETURNING id INTO v_t10;
  UPDATE public.financeiro_lancamentos_v2 SET subcentro='RS01 CANON' WHERE id=v_t10;
  SELECT macro_custo,grupo_custo,centro_custo INTO v_m,v_g,v_c FROM public.financeiro_lancamentos_v2 WHERE id=v_t10;
  IF v_m IS DISTINCT FROM 'Custeio Produção' OR v_g IS DISTINCT FROM 'RS Grupo' OR v_c IS DISTINCT FROM 'RS Centro' THEN
    RAISE EXCEPTION 'T10 FAIL: derivação por subcentro (macro=% grupo=% centro=%)', v_m, v_g, v_c;
  END IF;

  -- T11: UPDATE real de subcentro para órfão, macro <> Dividendos ⇒ continua falhando.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','RS01 CANON',15,'RS T11') RETURNING id INTO v_tmp;
  v_ok := false;
  BEGIN
    UPDATE public.financeiro_lancamentos_v2 SET subcentro='RS01 ORPHAN' WHERE id=v_tmp;
  EXCEPTION WHEN others THEN
    v_ok := (SQLSTATE='23514' AND SQLERRM LIKE 'Subcentro%nao existe no plano%');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T11 FAIL: mudança de subcentro para órfão não bloqueou'; END IF;

  -- T12: UPDATE real de tipo_operacao ⇒ revalida e deriva (T2 por subcentro; plano só tem 2-Saídas).
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','RS01 CANON',16,'RS T12') RETURNING id INTO v_t12;
  UPDATE public.financeiro_lancamentos_v2 SET tipo_operacao='1-Entradas' WHERE id=v_t12;
  SELECT macro_custo INTO v_m FROM public.financeiro_lancamentos_v2 WHERE id=v_t12;
  IF v_m IS DISTINCT FROM 'Custeio Produção' THEN RAISE EXCEPTION 'T12 FAIL: tipo_operacao não revalidou (macro=%)', v_m; END IF;

  -- T13: UPDATE real de macro_custo em linha órfã removendo a isenção Dividendos ⇒ bloqueia (prova macro no guard).
  v_ok := false;
  BEGIN
    UPDATE public.financeiro_lancamentos_v2 SET macro_custo='Custeio Produção' WHERE id=v_div_orphan;
  EXCEPTION WHEN others THEN
    v_ok := (SQLSTATE='23514' AND SQLERRM LIKE 'Subcentro%nao existe no plano%');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T13 FAIL: retirar Dividendos de linha órfã não bloqueou'; END IF;

  -- T14: forma do writer fn_classificacao_apply_row (SET subcentro/macro/plano_conta_id) com subcentro órfão ⇒ bloqueia.
  v_ok := false;
  BEGIN
    UPDATE public.financeiro_lancamentos_v2
       SET subcentro='RS01 ORPHAN', macro_custo='Custeio Produção', plano_conta_id=NULL
     WHERE id=v_tmp;
  EXCEPTION WHEN others THEN
    v_ok := (SQLSTATE='23514' AND SQLERRM LIKE 'Subcentro%nao existe no plano%');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14 FAIL: forma apply_row com órfão não bloqueou'; END IF;

  -- T15: forma do INSERT de fn_promover_staging (subcentro órfão) ⇒ bloqueia (INSERT sempre validado).
  v_ok := false;
  BEGIN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,macro_custo,valor,descricao)
      VALUES (v_cli,v_faz,'2-Saídas','RS01 ORPHAN','Custeio Produção',17,'RS T15');
  EXCEPTION WHEN others THEN
    v_ok := (SQLSTATE='23514' AND SQLERRM LIKE 'Subcentro%nao existe no plano%');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T15 FAIL: forma promover_staging (INSERT órfão) não bloqueou'; END IF;

  -- T16: interação com trg_zzz_materializar_dre_lcdpr — ordem resolve->zzz; compoe_dre final correto.
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,valor,descricao)
    VALUES (v_cli,v_faz,'1-Entradas',18,'RS T16') RETURNING id, compoe_dre INTO v_zzz, v_d;
  IF v_d IS NOT NULL THEN RAISE EXCEPTION 'T16 pré FAIL: compoe_dre esperado NULL, veio %', v_d; END IF;
  UPDATE public.financeiro_lancamentos_v2 SET subcentro='RS01 CANON' WHERE id=v_zzz;
  SELECT macro_custo, compoe_dre INTO v_m, v_d FROM public.financeiro_lancamentos_v2 WHERE id=v_zzz;
  IF v_m IS DISTINCT FROM 'Custeio Produção' THEN RAISE EXCEPTION 'T16 FAIL: resolve não derivou macro (%)', v_m; END IF;
  IF v_d IS DISTINCT FROM true THEN RAISE EXCEPTION 'T16 FAIL: zzz não recalculou compoe_dre (esperado true, veio %)', v_d; END IF;

  -- Fixtures que virarão órfãs (subcentro canônico agora; plano será desativado):
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,status_transacao,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','RS01 CANON','meta',19,'RS T5/T8') RETURNING id INTO v_orphan;
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,fazenda_id,tipo_operacao,subcentro,status_transacao,gera_lcdpr,valor,descricao)
    VALUES (v_cli,v_faz,'2-Saídas','RS01 CANON','meta',true,20,'RS T17') RETURNING id INTO v_bf;

  -- ═════════ FASE B — desativa o plano (simula subcentro órfão nas linhas acima) ═════════
  UPDATE public.financeiro_plano_contas SET ativo=false WHERE id=v_pc;
  -- sanidade: 'RS01 CANON' agora sem plano ativo
  SELECT count(*) INTO v_cnt FROM public.financeiro_plano_contas WHERE ativo AND subcentro='RS01 CANON';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'FASE B FAIL: plano canônico ainda ativo (%)', v_cnt; END IF;

  -- ═════════ FASE C — linhas órfãs ═════════

  -- T5: UPDATE apenas de status em linha CANCELADA com subcentro órfão ⇒ passa; não reclassifica.
  UPDATE public.financeiro_lancamentos_v2 SET cancelado=true WHERE id=v_orphan;   -- cancelamento (admin)
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='previsto' WHERE id=v_orphan;  -- status-only: NÃO deve bloquear
  SELECT subcentro,macro_custo,grupo_custo,centro_custo,status_transacao INTO v_sub,v_m,v_g,v_c,v_st
    FROM public.financeiro_lancamentos_v2 WHERE id=v_orphan;
  IF v_st IS DISTINCT FROM 'previsto' THEN RAISE EXCEPTION 'T5 FAIL: status não mudou (%)', v_st; END IF;
  IF v_sub IS DISTINCT FROM 'RS01 CANON' OR v_m IS DISTINCT FROM 'Custeio Produção' OR v_g IS DISTINCT FROM 'RS Grupo' OR v_c IS DISTINCT FROM 'RS Centro' THEN
    RAISE EXCEPTION 'T5 FAIL: reclassificou linha órfã em update de status (sub=% macro=%)', v_sub, v_m;
  END IF;

  -- T8: full-row UPDATE com as 4 colunas soberanas repetindo os MESMOS valores (linha órfã) ⇒ passa (guard interno).
  UPDATE public.financeiro_lancamentos_v2
     SET subcentro='RS01 CANON', tipo_operacao='2-Saídas', plano_conta_id=NULL, macro_custo='Custeio Produção',
         descricao='RS T8 edit'
   WHERE id=v_orphan;
  SELECT subcentro,macro_custo INTO v_sub,v_m FROM public.financeiro_lancamentos_v2 WHERE id=v_orphan;
  IF v_sub IS DISTINCT FROM 'RS01 CANON' OR v_m IS DISTINCT FROM 'Custeio Produção' THEN
    RAISE EXCEPTION 'T8 FAIL: guard não evitou bloqueio/reescrita (sub=% macro=%)', v_sub, v_m;
  END IF;

  -- T17: equivalente ao backfill — UPDATE status='previsto' WHERE status='meta' em linha órfã ⇒
  --   não bloqueia; só status muda; classificação, compoe_dre e gera_lcdpr inalterados.
  SELECT subcentro,macro_custo,grupo_custo,centro_custo,compoe_dre,gera_lcdpr
    INTO b_sub,b_m,b_g,b_c,b_d,b_l FROM public.financeiro_lancamentos_v2 WHERE id=v_bf;
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao='previsto' WHERE id=v_bf AND status_transacao='meta';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T17 FAIL: ROW_COUNT=% (esperado 1)', v_cnt; END IF;
  SELECT subcentro,macro_custo,grupo_custo,centro_custo,compoe_dre,gera_lcdpr,status_transacao
    INTO v_sub,v_m,v_g,v_c,v_d,v_l,v_st FROM public.financeiro_lancamentos_v2 WHERE id=v_bf;
  IF v_st IS DISTINCT FROM 'previsto' THEN RAISE EXCEPTION 'T17 FAIL: status não mudou (%)', v_st; END IF;
  IF v_sub IS DISTINCT FROM b_sub OR v_m IS DISTINCT FROM b_m OR v_g IS DISTINCT FROM b_g OR v_c IS DISTINCT FROM b_c
     OR v_d IS DISTINCT FROM b_d OR v_l IS DISTINCT FROM b_l THEN
    RAISE EXCEPTION 'T17 FAIL: classificação/DRE/LCDPR mudaram (sub % / macro % / dre % / lcdpr %)', v_sub, v_m, v_d, v_l;
  END IF;

  RAISE NOTICE '=== PR-FIN-RESOLVE-SCOPE-01: T1..T17 PASS ===';
END $t$;

ROLLBACK;  -- nada persiste
SELECT 'pr_fin_resolve_classificacao_scope_rolled_back' AS fim;
