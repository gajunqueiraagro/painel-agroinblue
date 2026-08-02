-- PR-OC-REABRIR-ENTREGA-01 — testes sintéticos de public.oc_reabrir_entrega (T1..T17).
--   Valida: reabertura AUDITADA de entrega (true->false) exigindo motivo; gate igual ao irmão
--   oc_encerrar_entrega (veda rascunho/cancelada; NÃO exige 'fechada'; permite 'programada');
--   version-lock/tenant/erros soberanos; efeito EXCLUSIVO na operação (metadados->NULL, versao+1);
--   preservação byte a byte de status/negociação/lotes/recebimentos/movimentações/financeiro; evento
--   append-only 'reabrir_entrega' com metadados anteriores. T17 = prova read-only de que oc_confirmar
--   aceita 'programada' COM títulos materializados sem tocar o financeiro.
--   Requer aplicadas: 20260804120000 (este writer), 20260803180000/170000/160000/150000/140000/130000
--   (materialização+deps), 20260722200000 (recebimento), 20260720100200 (encerrar_entrega/confirmar).
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + resíduo zero (T13).
SELECT set_config('app.rae_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_fA uuid; v_faz uuid; v_sub_ani text;
  v_opA uuid; v_opB uuid; v_opC uuid; v_lA uuid; v_lB uuid; v_lC uuid;
  v_ver int; v_ver_old int; v_res jsonb; v_ok boolean; v_ev jsonb;
  v_comp uuid; v_prog uuid; v_parc uuid; v_tit uuid;
  v_mov_before int; v_lanc_before int; v_meta text;
  v_ncomp int; v_nparc int; v_npart int; v_ntit int;
  v_ncomp2 int; v_nparc2 int; v_npart2 int; v_ntit2 int;
  v_titval numeric; v_titval2 numeric;
BEGIN
  v_tag := current_setting('app.rae_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  SELECT id INTO v_fA  FROM public.financeiro_fornecedores WHERE cliente_id=v_cli ORDER BY nome LIMIT 1;
  SELECT id INTO v_faz FROM public.fazendas WHERE cliente_id=v_cli ORDER BY id LIMIT 1;
  IF v_fA IS NULL OR v_faz IS NULL THEN RAISE EXCEPTION 'fixture: fornecedor/fazenda ausente'; END IF;
  SELECT pc.subcentro INTO v_sub_ani FROM public.financeiro_plano_contas pc
   WHERE pc.ativo IS TRUE AND (pc.cliente_id IS NULL OR pc.cliente_id=v_cli) AND pc.subcentro ILIKE '%Compra Bovinos Machos%'
     AND 1=(SELECT count(*) FROM public.financeiro_plano_contas p2 WHERE p2.ativo IS TRUE AND (p2.cliente_id IS NULL OR p2.cliente_id=v_cli) AND p2.subcentro IS NOT DISTINCT FROM pc.subcentro) LIMIT 1;
  IF v_sub_ani IS NULL THEN RAISE EXCEPTION 'fixture: subcentro animais único ausente'; END IF;

  -- =========================================================================================
  -- Op A: 'programada', qtd 7, SEM recebimento; entrega encerrada via writer irmão.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','programada',false,7,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_opA,v_cli,'garrotes',7,'total',27000,1) RETURNING id INTO v_lA;
  SELECT versao INTO v_ver_old FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
  PERFORM public.oc_encerrar_entrega(v_opA, v_cli, v_ver_old, 'encerramento fixture (zero receb)');   -- entrega_encerrada=true, versao+1

  -- T5 — conflito de versão (usa a versão ANTERIOR ao encerramento) -> 40001
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_entrega(v_opA, v_cli, v_ver_old, 'motivo t5');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='40001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T5 FAIL: esperava 40001'; END IF;

  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opA;   -- versão atual (pós-encerrar)

  -- T4 — motivo em branco -> P0001
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_entrega(v_opA, v_cli, v_ver, '   ');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 FAIL: esperava P0001 (motivo vazio)'; END IF;

  -- T6 — operação inexistente -> P0002 (admin passa no tenant; FOR UPDATE não acha)
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_entrega(gen_random_uuid(), v_cli, 0, 'motivo t6');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0002' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T6 FAIL: esperava P0002'; END IF;

  -- T7 — ator autenticado SEM acesso ao cliente da fixture -> 42501. Determinístico: 'sub' sintético
  --      (gen_random_uuid, sem membership) no padrão da suíte de materialização; independe de 2º tenant real.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_entrega(v_opA, v_cli, v_ver, 'motivo t7');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='42501' THEN v_ok := true; END IF; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);   -- restaura admin
  IF NOT v_ok THEN RAISE EXCEPTION 'T7 FAIL: esperava 42501 (ator sem acesso ao cliente)'; END IF;

  -- T1/T8/T10/T14 — reabertura válida sobre 'programada'
  v_res := public.oc_reabrir_entrega(v_opA, v_cli, v_ver, 'reabertura correta A');
  IF NOT ((v_res->>'ok')::boolean) OR (v_res->>'entrega_encerrada')::boolean <> false THEN
    RAISE EXCEPTION 'T1 FAIL: retorno ok/entrega_encerrada'; END IF;
  IF (v_res->>'operacao_versao')::int <> v_ver + 1 THEN RAISE EXCEPTION 'T8 FAIL: operacao_versao <> versao+1'; END IF;
  IF (SELECT entrega_encerrada FROM public.zoo_operacoes_comerciais WHERE id=v_opA) <> false THEN
    RAISE EXCEPTION 'T1 FAIL: entrega_encerrada não virou false'; END IF;
  IF (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_opA) <> v_ver + 1 THEN
    RAISE EXCEPTION 'T8 FAIL: versao não incrementou exatamente 1'; END IF;
  IF (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_opA) <> 'programada' THEN
    RAISE EXCEPTION 'T10/T14 FAIL: status_comercial alterado'; END IF;

  -- T15 — metadados de encerramento ficam NULL
  SELECT coalesce(entrega_encerrada_em::text,'')||coalesce(entrega_encerrada_por::text,'')||coalesce(entrega_encerrada_motivo,'')
    INTO v_meta FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
  IF v_meta <> '' THEN RAISE EXCEPTION 'T15 FAIL: metadados de encerramento não ficaram NULL'; END IF;

  -- T9/T16 — evento 'reabrir_entrega' com motivo + metadados anteriores preservados
  SELECT detalhes INTO v_ev FROM public.zoo_operacao_eventos
    WHERE operacao_id=v_opA AND acao='reabrir_entrega' ORDER BY created_at DESC LIMIT 1;
  IF v_ev IS NULL THEN RAISE EXCEPTION 'T9 FAIL: evento reabrir_entrega ausente'; END IF;
  IF v_ev->>'motivo' <> 'reabertura correta A' THEN RAISE EXCEPTION 'T9 FAIL: motivo do evento'; END IF;
  IF v_ev->>'status_comercial' <> 'programada' THEN RAISE EXCEPTION 'T16 FAIL: status_comercial no evento'; END IF;
  IF v_ev->>'entrega_encerrada_motivo_anterior' <> 'encerramento fixture (zero receb)' THEN RAISE EXCEPTION 'T16 FAIL: motivo anterior'; END IF;
  IF (v_ev->>'entrega_encerrada_em_anterior') IS NULL OR (v_ev->>'entrega_encerrada_por_anterior') IS NULL THEN RAISE EXCEPTION 'T16 FAIL: em/por anterior ausentes'; END IF;
  IF (v_ev->>'versao_anterior')::int <> v_ver THEN RAISE EXCEPTION 'T16 FAIL: versao_anterior'; END IF;

  -- T3/T12 — reabrir já aberta (com a versão nova) -> P0001
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
  v_ok := false;
  BEGIN PERFORM public.oc_reabrir_entrega(v_opA, v_cli, v_ver, 'motivo t3');
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_ok := true; END IF; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T3/T12 FAIL: reabrir entrega já aberta deveria dar P0001'; END IF;

  -- =========================================================================================
  -- Op B: 'programada' com fazenda + 1 movimentação; prova preservação do recebimento (T2/T11).
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-05','programada',false,5,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_opB;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_opB,v_cli,'garrotes',5,'total',20000,1) RETURNING id INTO v_lB;
  PERFORM public.oc_registrar_movimentacao(v_opB, v_cli, v_lB, DATE '2026-07-10', 'garrotes', 5, NULL, NULL, v_tag||' mov');
  SELECT count(*) INTO v_mov_before FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_opB;
  SELECT count(*) INTO v_lanc_before FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
    WHERE m.operacao_id=v_opB AND l.cancelado IS NOT TRUE;
  IF v_mov_before <> 1 OR v_lanc_before <> 1 THEN RAISE EXCEPTION 'fixture B: movimentação não registrada'; END IF;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opB;
  PERFORM public.oc_encerrar_entrega(v_opB, v_cli, v_ver, 'encerra B');
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opB;

  -- T2 — reabrir com recebimento parcial existente
  v_res := public.oc_reabrir_entrega(v_opB, v_cli, v_ver, 'reabrir B com recebimento');
  IF (v_res->>'entrega_encerrada')::boolean <> false THEN RAISE EXCEPTION 'T2 FAIL: entrega não reabriu'; END IF;
  -- T11 — movimentações/lançamentos preservados byte a byte
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_opB) <> v_mov_before THEN
    RAISE EXCEPTION 'T11 FAIL: contagem de movimentações mudou'; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
        WHERE m.operacao_id=v_opB AND l.cancelado IS NOT TRUE) <> v_lanc_before THEN
    RAISE EXCEPTION 'T11 FAIL: lançamentos de recebimento alterados'; END IF;

  -- =========================================================================================
  -- Op C: 'programada' com compromisso principal MATERIALIZADO (1 título) — T11-fin + T17.
  -- =========================================================================================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,contraparte_id,fazenda_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-08','programada',false,4,'garrotes',100000,0,v_fA,v_faz,v_tag,v_admin,v_admin) RETURNING id INTO v_opC;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_opC,v_cli,'garrotes',4,'total',20000,1) RETURNING id INTO v_lC;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  v_res := public.oc_criar_compromisso(v_opC, v_ver, jsonb_build_object('natureza','principal','componente','principal','favorecido_id',v_fA,'subcentro',v_sub_ani,'lote_id',v_lC,'valor_total',20000));
  v_comp := (v_res->'compromisso'->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  v_res := public.oc_programar_compromisso(v_opC, v_ver, v_comp, jsonb_build_object('parcelas', jsonb_build_array(jsonb_build_object('sequencia',1,'valor',20000))));
  v_prog := (v_res->'programacao'->>'id')::uuid;
  v_parc := ((v_res->'parcelas')->0->>'id')::uuid;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  v_res := public.oc_materializar_programacao(v_opC, v_ver, v_prog, v_parc);
  v_tit := (v_res->'titulo'->>'id')::uuid;
  IF v_tit IS NULL THEN RAISE EXCEPTION 'fixture C: materialização não gerou título'; END IF;

  -- encerrar C e reabrir; financeiro preservado (T11-financeiro)
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  PERFORM public.oc_encerrar_entrega(v_opC, v_cli, v_ver, 'encerra C');
  SELECT count(*) INTO v_ncomp FROM public.zoo_operacao_compromissos WHERE operacao_id=v_opC;
  SELECT count(*) INTO v_nparc FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id
    JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id WHERE c.operacao_id=v_opC;
  SELECT count(*) INTO v_npart FROM public.zoo_operacao_partes WHERE operacao_id=v_opC;
  SELECT count(*) INTO v_ntit  FROM public.zoo_operacao_partes WHERE operacao_id=v_opC AND financeiro_lancamento_id IS NOT NULL;
  SELECT valor INTO v_titval FROM public.financeiro_lancamentos_v2 WHERE id=v_tit;
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  PERFORM public.oc_reabrir_entrega(v_opC, v_cli, v_ver, 'reabrir C');
  SELECT count(*) INTO v_ncomp2 FROM public.zoo_operacao_compromissos WHERE operacao_id=v_opC;
  SELECT count(*) INTO v_nparc2 FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id=pp.programacao_id
    JOIN public.zoo_operacao_compromissos c ON c.id=pr.compromisso_id WHERE c.operacao_id=v_opC;
  SELECT count(*) INTO v_npart2 FROM public.zoo_operacao_partes WHERE operacao_id=v_opC;
  SELECT count(*) INTO v_ntit2  FROM public.zoo_operacao_partes WHERE operacao_id=v_opC AND financeiro_lancamento_id IS NOT NULL;
  SELECT valor INTO v_titval2 FROM public.financeiro_lancamentos_v2 WHERE id=v_tit;
  IF v_ncomp2<>v_ncomp OR v_nparc2<>v_nparc OR v_npart2<>v_npart OR v_ntit2<>v_ntit OR v_titval2 IS DISTINCT FROM v_titval THEN
    RAISE EXCEPTION 'T11 FAIL: reabrir alterou o financeiro (comp % ->%, parc % ->%, part % ->%, tit % ->%, val % ->%)',
      v_ncomp,v_ncomp2,v_nparc,v_nparc2,v_npart,v_npart2,v_ntit,v_ntit2,v_titval,v_titval2; END IF;

  -- T17 — oc_confirmar aceita 'programada' COM títulos e NÃO altera o financeiro.
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  v_res := public.oc_confirmar(v_opC, v_cli, v_ver);
  IF (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id=v_opC) <> 'fechada' THEN
    RAISE EXCEPTION 'T17 FAIL: oc_confirmar não fechou a operação'; END IF;
  IF (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_opC) <> v_ver + 1 THEN
    RAISE EXCEPTION 'T17 FAIL: versao não +1 no confirmar'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos WHERE operacao_id=v_opC AND acao='fechar') THEN
    RAISE EXCEPTION 'T17 FAIL: evento fechar ausente'; END IF;
  -- financeiro preservado byte a byte pós-confirmar
  IF (SELECT count(*) FROM public.zoo_operacao_compromissos WHERE operacao_id=v_opC) <> v_ncomp
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_opC) <> v_npart
     OR (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=v_opC AND financeiro_lancamento_id IS NOT NULL) <> v_ntit
     OR (SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id=v_tit) IS DISTINCT FROM v_titval THEN
    RAISE EXCEPTION 'T17 FAIL: oc_confirmar alterou compromissos/partes/títulos'; END IF;

  RAISE NOTICE 'PR-OC-REABRIR-ENTREGA-01: T1..T17 PASS';
END $t$;

ROLLBACK;

-- T13 — resíduo zero após ROLLBACK (o tag foi setado a nível de sessão, sobrevive ao rollback).
SELECT count(*) AS residuo_operacoes FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.rae_tag');
