-- PR-OC-EXCLUIR-CANCELADAS-01 — testes de oc_excluir_definitivamente.
--   Requer aplicada: 20260829150000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
--
--   ⚠ T1 EXISTE PARA DECIDIR UMA DUVIDA REAL, nao so para marcar verde. Ha DUAS FKs
--   RESTRICT nao-deferiveis apontando para `zoo_operacao_lotes` (de movimentacoes e de
--   documento_lotes), e `zoo_operacao_movimentacoes.operacao_lote_id` e' NOT NULL —
--   toda movimentacao passa por uma delas. Apagando a raiz, a cascata precisa remover
--   as movimentacoes ANTES dos lotes; se a ordem de disparo dos gatilhos de integridade
--   for a inversa, o RESTRICT dispara e o DELETE inteiro falha. A fixture de T1 inclui
--   movimentacao COM lote de proposito: se este teste passar, a ordem e' segura; se
--   falhar com 23503, a exclusao precisa remover movimentacoes explicitamente antes.
SELECT set_config('app.ocxc_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text;
  v_lanc_cancelado uuid; v_lanc_ativo uuid; v_fin_cancelado uuid; v_fin_ativo uuid;
  v_opA uuid; v_opB uuid; v_opC uuid; v_opD uuid;
  v_loteA uuid; v_loteC uuid; v_compA uuid; v_progA uuid;
  v_res jsonb; v_cnt int; v_err text;
BEGIN
  v_tag := current_setting('app.ocxc_tag');
  SELECT cm.user_id INTO v_admin FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  /* Cliente escolhido por TER as quatro pecas de que a fixture precisa: lancamento
     zootecnico cancelado e ativo, e titulo financeiro cancelado e ativo. Escolher o
     cliente antes das pecas daria fixture quebrada em base diferente. */
  SELECT l.cliente_id INTO v_cli
    FROM public.lancamentos l
   WHERE EXISTS (SELECT 1 FROM public.lancamentos x WHERE x.cliente_id=l.cliente_id AND x.cancelado IS TRUE)
     AND EXISTS (SELECT 1 FROM public.lancamentos x WHERE x.cliente_id=l.cliente_id AND x.cancelado IS NOT TRUE)
     AND EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 f WHERE f.cliente_id=l.cliente_id AND f.cancelado IS TRUE)
     AND EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 f WHERE f.cliente_id=l.cliente_id AND f.cancelado IS NOT TRUE)
   LIMIT 1;
  IF v_cli IS NULL THEN RAISE EXCEPTION 'fixture: nenhum cliente com as quatro pecas'; END IF;

  SELECT id INTO v_lanc_cancelado FROM public.lancamentos WHERE cliente_id=v_cli AND cancelado IS TRUE LIMIT 1;
  SELECT id INTO v_lanc_ativo     FROM public.lancamentos WHERE cliente_id=v_cli AND cancelado IS NOT TRUE LIMIT 1;
  SELECT id INTO v_fin_cancelado  FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cli AND cancelado IS TRUE LIMIT 1;
  SELECT id INTO v_fin_ativo      FROM public.financeiro_lancamentos_v2 WHERE cliente_id=v_cli AND cancelado IS NOT TRUE LIMIT 1;

  -- ===================== OP A — cancelada, tudo inerte (o caso feliz) =====================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-05-01','cancelada',false,1000,0,'ZZ OCXC A '||v_tag,v_admin,v_admin) RETURNING id INTO v_opA;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_opA,v_cli,'garrotes',10,'total',1000,1) RETURNING id INTO v_loteA;
  -- movimentacao COM lote e lancamento CANCELADO: passa no guard e exercita o RESTRICT
  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id,operacao_id,operacao_lote_id,movimentacao_id)
    VALUES (v_cli,v_opA,v_loteA,v_lanc_cancelado);
  INSERT INTO public.zoo_operacao_compromissos (cliente_id,operacao_id,natureza,componente,valor_total)
    VALUES (v_cli,v_opA,'principal','principal',1000) RETURNING id INTO v_compA;
  INSERT INTO public.zoo_operacao_programacoes (cliente_id,compromisso_id,status)
    VALUES (v_cli,v_compA,'ativa') RETURNING id INTO v_progA;
  INSERT INTO public.zoo_operacao_parcelas_programacao (cliente_id,programacao_id,sequencia,valor,status)
    VALUES (v_cli,v_progA,1,1000,'prevista');
  INSERT INTO public.zoo_operacao_partes (cliente_id,operacao_id,natureza,valor,financeiro_lancamento_id)
    VALUES (v_cli,v_opA,'principal',1000,v_fin_cancelado);
  INSERT INTO public.zoo_operacao_eventos (cliente_id,operacao_id,acao) VALUES (v_cli,v_opA,'criar'),(v_cli,v_opA,'cancelar');

  -- ===================== T6 — motivo vazio recusa (antes de excluir de fato) ==========
  BEGIN
    v_res := public.oc_excluir_definitivamente(v_opA, v_cli, '   ');
    RAISE EXCEPTION 'T6 FAIL: aceitou motivo vazio';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%motivo%' THEN RAISE EXCEPTION 'T6 FAIL: mensagem inesperada: %', v_err; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T6 FAIL: operacao sumiu apos recusa'; END IF;

  -- ===================== T1 — exclui, e a cascata leva tudo =====================
  v_res := public.oc_excluir_definitivamente(v_opA, v_cli, 'cancelada por engano no teste');
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'T1 FAIL: envelope sem ok'; END IF;
  IF (v_res->'removidos'->>'zoo_operacao_eventos')::int <> 2 THEN
    RAISE EXCEPTION 'T1 FAIL: eventos removidos=%', v_res->'removidos'->>'zoo_operacao_eventos'; END IF;
  IF (v_res->'removidos'->>'zoo_operacao_parcelas_programacao')::int <> 1 THEN
    RAISE EXCEPTION 'T1 FAIL: parcelas (neta) removidas=%', v_res->'removidos'->>'zoo_operacao_parcelas_programacao'; END IF;

  SELECT count(*) INTO v_cnt FROM public.zoo_operacoes_comerciais WHERE id=v_opA;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T1 FAIL: operacao ainda existe'; END IF;
  SELECT (SELECT count(*) FROM public.zoo_operacao_lotes         WHERE operacao_id=v_opA)
       + (SELECT count(*) FROM public.zoo_operacao_compromissos  WHERE operacao_id=v_opA)
       + (SELECT count(*) FROM public.zoo_operacao_documentos    WHERE operacao_id=v_opA)
       + (SELECT count(*) FROM public.zoo_operacao_liquidacoes   WHERE operacao_id=v_opA)
       + (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_opA)
       + (SELECT count(*) FROM public.zoo_operacao_partes        WHERE operacao_id=v_opA)
       + (SELECT count(*) FROM public.zoo_operacao_eventos       WHERE operacao_id=v_opA) INTO v_cnt;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T1 FAIL: % linhas sobraram nas seis filhas + eventos', v_cnt; END IF;
  -- netas
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_programacoes WHERE id=v_progA;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T1 FAIL: programacao (neta) sobreviveu'; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id=v_progA;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T1 FAIL: parcela (neta) sobreviveu'; END IF;

  -- ===================== T5 — o dominio por baixo CONTINUA =====================
  SELECT count(*) INTO v_cnt FROM public.lancamentos WHERE id=v_lanc_cancelado;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T5 FAIL: lancamento zootecnico foi apagado junto'; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 WHERE id=v_fin_cancelado;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T5 FAIL: titulo financeiro foi apagado junto'; END IF;

  -- ===================== T7 — auditoria sobreviveu =====================
  SELECT count(*) INTO v_cnt FROM public.audit_log
   WHERE acao='excluir_operacao_definitivamente' AND registro_id=v_opA
     AND resumo='cancelada por engano no teste';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T7 FAIL: audit_log da exclusao=% (esperado 1)', v_cnt; END IF;

  -- ===================== T2 — operacao FECHADA recusa =====================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-05-02','fechada',false,500,0,'ZZ OCXC B '||v_tag,v_admin,v_admin) RETURNING id INTO v_opB;
  BEGIN
    v_res := public.oc_excluir_definitivamente(v_opB, v_cli, 'tentativa indevida');
    RAISE EXCEPTION 'T2 FAIL: aceitou operacao fechada';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%CANCELADA%' THEN RAISE EXCEPTION 'T2 FAIL: mensagem inesperada: %', v_err; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacoes_comerciais WHERE id=v_opB;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T2 FAIL: operacao fechada foi apagada'; END IF;

  -- ===================== T3 — movimentacao com lancamento ATIVO recusa ==========
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-05-03','cancelada',false,500,0,'ZZ OCXC C '||v_tag,v_admin,v_admin) RETURNING id INTO v_opC;
  INSERT INTO public.zoo_operacao_lotes (operacao_id,cliente_id,categoria_negociada,qtd_negociada,criterio_valor,valor_informado,ordem)
    VALUES (v_opC,v_cli,'garrotes',5,'total',500,1) RETURNING id INTO v_loteC;
  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id,operacao_id,operacao_lote_id,movimentacao_id)
    VALUES (v_cli,v_opC,v_loteC,v_lanc_ativo);
  BEGIN
    v_res := public.oc_excluir_definitivamente(v_opC, v_cli, 'tentativa com efeito vivo');
    RAISE EXCEPTION 'T3 FAIL: aceitou com movimentacao de lancamento ativo';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%zootecnico ativo%' THEN RAISE EXCEPTION 'T3 FAIL: mensagem nao nomeia o impedimento: %', v_err; END IF;
    IF v_err NOT LIKE '%1 movimentacao%' THEN RAISE EXCEPTION 'T3 FAIL: mensagem nao diz QUANTOS: %', v_err; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacoes_comerciais WHERE id=v_opC;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T3 FAIL: operacao foi apagada apesar da recusa'; END IF;

  -- ===================== T4 — titulo financeiro ATIVO recusa =====================
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_acordado,valor_total,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-05-04','cancelada',false,500,0,'ZZ OCXC D '||v_tag,v_admin,v_admin) RETURNING id INTO v_opD;
  INSERT INTO public.zoo_operacao_partes (cliente_id,operacao_id,natureza,valor,financeiro_lancamento_id)
    VALUES (v_cli,v_opD,'principal',500,v_fin_ativo);
  BEGIN
    v_res := public.oc_excluir_definitivamente(v_opD, v_cli, 'tentativa com titulo vivo');
    RAISE EXCEPTION 'T4 FAIL: aceitou com titulo financeiro ativo';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%titulo(s) financeiro%' THEN RAISE EXCEPTION 'T4 FAIL: mensagem nao nomeia o impedimento: %', v_err; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacoes_comerciais WHERE id=v_opD;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T4 FAIL: operacao foi apagada apesar da recusa'; END IF;

  RAISE NOTICE 'PR-OC-EXCLUIR-CANCELADAS-01: T1..T7 PASS';
END $t$;

ROLLBACK;
