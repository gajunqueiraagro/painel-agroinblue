-- PR-OC-MODEL-01 — Suíte dos três eixos. BEGIN...ROLLBACK: resíduo zero.
-- Requer partes 1-4 aplicadas. Fixture: admin + cliente com fazenda + fornecedor.
BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_faz uuid; v_forn uuid; v_bad uuid := gen_random_uuid();
  v_opB uuid; v_opD uuid; v_opE uuid; v_opF uuid;
  v_res jsonb; v_st jsonb; v_v int; v_liq_perm uuid; v_mesfechado boolean;
  fn_full jsonb;
BEGIN
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
      AND EXISTS (SELECT 1 FROM public.fazendas f WHERE f.cliente_id=cm.cliente_id)
      AND EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.cliente_id=cm.cliente_id)
    ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com fazenda+fornecedor'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  SELECT id INTO v_faz  FROM public.fazendas WHERE cliente_id=v_cli LIMIT 1;
  SELECT id INTO v_forn FROM public.financeiro_fornecedores WHERE cliente_id=v_cli LIMIT 1;

  -- payload comercial completo (venda) reutilizável
  fn_full := jsonb_build_object(
    'fazenda_id', v_faz::text, 'tipo_operacao','venda', 'data_operacao','2026-08-15',
    'contraparte_id', v_forn::text, 'tipo_precificacao','arroba_viva','preco_unitario',320,
    'qtd_negociada',100, 'categoria_negociada','bois', 'peso_medio_negociado_kg',540,
    'peso_negociado_soberano','medio', 'valor_acordado',300000);

  -- ══ opB: ciclo completo ══
  -- P1: rascunho incompleto
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object('tipo_operacao','venda','data_operacao','2026-08-15'));
  v_opB := (v_res->>'operacao_id')::uuid;
  IF (v_res->>'rascunho')::boolean <> true THEN RAISE EXCEPTION 'P1 deveria ser rascunho'; END IF;
  -- N: movimentar/liquidar/confirmar em rascunho -> P0001
  BEGIN v_res := public.oc_registrar_movimentacao(v_opB,v_cli,'2026-08-16','bois',10,540,NULL,NULL); RAISE EXCEPTION 'Nmov-rasc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nmov-rasc SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-16','natureza','recebimento','forma','pix','valor',1000)); RAISE EXCEPTION 'Nliq-rasc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nliq-rasc SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_confirmar(v_opB,v_cli,(SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_opB)); RAISE EXCEPTION 'Nconf-rasc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nconf-rasc SQLSTATE %',SQLSTATE; END IF; END;
  -- N: versão concorrente inválida
  BEGIN v_res := public.oc_salvar_rascunho(v_opB,v_cli,999,fn_full); RAISE EXCEPTION 'Nversao';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'40001' THEN RAISE EXCEPTION 'Nversao SQLSTATE %',SQLSTATE; END IF; END;

  -- P2: completar -> Programada (rascunho=false)
  v_res := public.oc_salvar_rascunho(v_opB, v_cli, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_opB), fn_full);
  v_v := (v_res->>'versao')::int;
  IF (v_res->>'rascunho')::boolean <> false OR (v_res->>'status_comercial')<>'programada' THEN RAISE EXCEPTION 'P2 %',v_res; END IF;

  -- P: liquidar sinal em Programada (antes de fechar) + movimentar em Programada (parcial)
  v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-16','natureza','recebimento','forma','pix','valor',50000,'descricao','sinal'));
  v_res := public.oc_registrar_movimentacao(v_opB,v_cli,'2026-08-17','bois',40,545,NULL,'1o embarque');
  v_st := public.oc_derivar_status(v_opB,v_cli);
  IF (v_st#>>'{comercial}')<>'programada' OR (v_st#>>'{animais,status_animais}')<>'parcial'
     OR (v_st#>>'{liquidacao,status_liquidacao}')<>'parcial' THEN RAISE EXCEPTION 'P-prog %',v_st; END IF;
  IF (v_st#>>'{liquidacao,base_origem}')<>'acordado' THEN RAISE EXCEPTION 'P-base-acordado %',v_st; END IF;

  -- P: fechar (não exige animais/financeiro)
  v_res := public.oc_confirmar(v_opB,v_cli,(SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=v_opB)); v_v:=(v_res->>'versao')::int;
  IF (v_res->>'status_comercial')<>'fechada' THEN RAISE EXCEPTION 'P-fechar %',v_res; END IF;

  -- P: liquidar por permuta APÓS fechar
  v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-22','natureza','recebimento','forma','permuta','valor',120000,
    'permuta_tipo_bem','caminhonete','permuta_descricao_bem','Hilux','permuta_valor_atribuido',120000));
  v_liq_perm := (v_res->>'liquidacao_id')::uuid;
  -- N: natureza incompatível (venda -> pagamento) ; permuta incompleta
  BEGIN v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-22','natureza','pagamento','forma','pix','valor',10)); RAISE EXCEPTION 'Nnat';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nnat SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-22','natureza','recebimento','forma','permuta','valor',10)); RAISE EXCEPTION 'Nperm';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE NOT IN ('P0001','23514') THEN RAISE EXCEPTION 'Nperm SQLSTATE %',SQLSTATE; END IF; END;

  -- N: encerrar com diferença SEM motivo (efetivo 40 <> 100)
  BEGIN v_res := public.oc_encerrar_entrega(v_opB,v_cli,v_v,NULL); RAISE EXCEPTION 'Nenc-motivo';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nenc-motivo SQLSTATE %',SQLSTATE; END IF; END;
  -- P: encerrar com diferença e motivo
  v_res := public.oc_encerrar_entrega(v_opB,v_cli,v_v,'restante nao embarcou'); v_v:=(v_res->>'versao')::int;
  v_st := public.oc_derivar_status(v_opB,v_cli);
  IF (v_st#>>'{animais,status_animais}')<>'concluido_com_diferenca' OR (v_st#>>'{animais,diferenca_quantidade}')<>'-60' THEN RAISE EXCEPTION 'P-enc %',v_st; END IF;
  -- N: movimentar após entrega encerrada
  BEGIN v_res := public.oc_registrar_movimentacao(v_opB,v_cli,'2026-08-18','bois',5,540,NULL,NULL); RAISE EXCEPTION 'Nmov-enc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nmov-enc SQLSTATE %',SQLSTATE; END IF; END;

  -- P: excedente (50k+120k=170k; + 140k = 310k > 300k)
  v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-23','natureza','recebimento','forma','dinheiro','valor',140000));
  v_st := public.oc_derivar_status(v_opB,v_cli);
  IF (v_st#>>'{liquidacao,status_liquidacao}')<>'excedente' THEN RAISE EXCEPTION 'P-exced %',v_st; END IF;
  -- P: estornar preservando; N: estorno duplicado
  v_res := public.oc_estornar_liquidacao(v_liq_perm,v_cli,'bem devolvido');
  IF (SELECT estornado FROM public.zoo_operacao_liquidacoes WHERE id=v_liq_perm) <> true THEN RAISE EXCEPTION 'P-estorno'; END IF;
  IF (SELECT valor FROM public.zoo_operacao_liquidacoes WHERE id=v_liq_perm) <> 120000 THEN RAISE EXCEPTION 'P-estorno valor apagado'; END IF;
  BEGIN v_res := public.oc_estornar_liquidacao(v_liq_perm,v_cli,'x'); RAISE EXCEPTION 'Nest-dup';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nest-dup SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_estornar_liquidacao(v_liq_perm,v_cli,NULL); RAISE EXCEPTION 'Nest-motivo';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nest-motivo SQLSTATE %',SQLSTATE; END IF; END;

  -- N: tenant diferente (op sob outro cliente -> negado/nao encontrado)
  BEGIN v_res := public.oc_registrar_liquidacao(v_opB,v_bad,jsonb_build_object('data','2026-08-23','natureza','recebimento','forma','pix','valor',1)); RAISE EXCEPTION 'Ntenant';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE NOT IN ('42501','P0002') THEN RAISE EXCEPTION 'Ntenant SQLSTATE %',SQLSTATE; END IF; END;

  -- P: cancelar comercial preserva fatos + inconsistência
  v_res := public.oc_cancelar(v_opB,v_cli,v_v,'distrato'); v_v:=(v_res->>'versao')::int;
  IF (v_res->>'status_comercial')<>'cancelada' OR (v_res->>'inconsistencia_operacional')::boolean<>true THEN RAISE EXCEPTION 'P-cancel %',v_res; END IF;
  IF (SELECT count(*) FROM public.zoo_operacao_movimentacoes WHERE operacao_id=v_opB)=0 THEN RAISE EXCEPTION 'cancel apagou movimentacoes'; END IF;
  -- N: movimentar/liquidar/sincronizar em cancelada
  BEGIN v_res := public.oc_registrar_movimentacao(v_opB,v_cli,'2026-08-19','bois',1,540,NULL,NULL); RAISE EXCEPTION 'Nmov-canc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nmov-canc SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_registrar_liquidacao(v_opB,v_cli,jsonb_build_object('data','2026-08-23','natureza','recebimento','forma','pix','valor',1)); RAISE EXCEPTION 'Nliq-canc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nliq-canc SQLSTATE %',SQLSTATE; END IF; END;
  BEGIN v_res := public.oc_sincronizar(v_opB,v_cli,v_v); RAISE EXCEPTION 'Nsinc-canc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nsinc-canc SQLSTATE %',SQLSTATE; END IF; END;

  -- ══ opD: base estimada->acordada->final + fechar-vazio + sincronizar ══
  v_res := public.oc_salvar_rascunho(NULL,v_cli,NULL, jsonb_build_object(
    'fazenda_id',v_faz::text,'tipo_operacao','compra','data_operacao','2026-08-15','contraparte_id',v_forn::text,
    'tipo_precificacao','cabeca','preco_unitario',3000,'qtd_negociada',10,'categoria_negociada','garrotes','valor_estimado',30000));
  v_opD := (v_res->>'operacao_id')::uuid; v_v:=(v_res->>'versao')::int;
  v_st := public.oc_derivar_status(v_opD,v_cli);
  IF (v_st#>>'{liquidacao,base_origem}')<>'estimado' THEN RAISE EXCEPTION 'D base estimado %',v_st; END IF;
  v_res := public.oc_salvar_rascunho(v_opD,v_cli,v_v,jsonb_build_object('valor_acordado',31000)); v_v:=(v_res->>'versao')::int;
  IF (public.oc_derivar_status(v_opD,v_cli)#>>'{liquidacao,base_origem}')<>'acordado' THEN RAISE EXCEPTION 'D base acordado'; END IF;
  -- adiciona composição final (principal incluído > 0) -> base 'final'
  v_res := public.oc_salvar_rascunho(v_opD,v_cli,v_v,jsonb_build_object('partes',jsonb_build_array(
    jsonb_build_object('natureza','principal','componente','principal','valor',31500)))); v_v:=(v_res->>'versao')::int;
  v_st := public.oc_derivar_status(v_opD,v_cli);
  IF (v_st#>>'{liquidacao,base_origem}')<>'final' OR (v_st#>>'{liquidacao,base}')<>'31500' THEN RAISE EXCEPTION 'D base final %',v_st; END IF;
  -- fechar sem animais e sincronizar (fechada); status animais nao_iniciado
  v_res := public.oc_confirmar(v_opD,v_cli,v_v); v_v:=(v_res->>'versao')::int;
  IF (v_res->>'status_comercial')<>'fechada' THEN RAISE EXCEPTION 'D fechar-vazio %',v_res; END IF;
  v_res := public.oc_sincronizar(v_opD,v_cli,v_v);
  IF (v_res->>'status_financeiro') NOT IN ('sincronizado','divergente') THEN RAISE EXCEPTION 'D sincronizar %',v_res; END IF;

  -- ══ opE: encerrar com IGUALDADE ══
  v_res := public.oc_salvar_rascunho(NULL,v_cli,NULL, jsonb_build_object(
    'fazenda_id',v_faz::text,'tipo_operacao','venda','data_operacao','2026-08-15','contraparte_id',v_forn::text,
    'tipo_precificacao','cabeca','preco_unitario',3000,'qtd_negociada',20,'categoria_negociada','bois','valor_acordado',60000));
  v_opE := (v_res->>'operacao_id')::uuid; v_v:=(v_res->>'versao')::int;
  v_res := public.oc_registrar_movimentacao(v_opE,v_cli,'2026-08-16','bois',20,540,NULL,NULL);
  v_res := public.oc_encerrar_entrega(v_opE,v_cli,v_v,NULL);  -- igual: motivo não exigido
  IF (public.oc_derivar_status(v_opE,v_cli)#>>'{animais,status_animais}')<>'concluido' THEN RAISE EXCEPTION 'E concluido'; END IF;

  -- ══ opF: base indefinida + sincronizar em rascunho + peso incoerente ══
  v_res := public.oc_salvar_rascunho(NULL,v_cli,NULL, jsonb_build_object(
    'fazenda_id',v_faz::text,'tipo_operacao','venda','data_operacao','2026-08-15','contraparte_id',v_forn::text,
    'tipo_precificacao','cabeca','preco_unitario',3000,'qtd_negociada',5,'categoria_negociada','bois'));
  v_opF := (v_res->>'operacao_id')::uuid;
  v_res := public.oc_registrar_liquidacao(v_opF,v_cli,jsonb_build_object('data','2026-08-16','natureza','recebimento','forma','pix','valor',5000));
  v_st := public.oc_derivar_status(v_opF,v_cli);
  IF (v_st#>>'{liquidacao,status_liquidacao}')<>'base_indefinida' OR (v_st#>'{liquidacao,saldo}')<>'null'::jsonb THEN RAISE EXCEPTION 'F base indefinida %',v_st; END IF;
  -- N: sincronizar rascunho técnico dedicado -> P0001
  v_res := public.oc_salvar_rascunho(NULL,v_cli,NULL,jsonb_build_object('tipo_operacao','venda','data_operacao','2026-08-15'));
  BEGIN v_res := public.oc_sincronizar((v_res->>'operacao_id')::uuid,v_cli,1); RAISE EXCEPTION 'Nsinc-rasc';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Nsinc-rasc SQLSTATE %',SQLSTATE; END IF; END;
  -- N: peso negociado incoerente (qtd 10, medio 500 => total ~5000; envia 9000)
  BEGIN v_res := public.oc_salvar_rascunho(NULL,v_cli,NULL,jsonb_build_object(
    'fazenda_id',v_faz::text,'tipo_operacao','venda','data_operacao','2026-08-15','qtd_negociada',10,
    'peso_medio_negociado_kg',500,'peso_total_negociado_kg',9000)); RAISE EXCEPTION 'Npeso';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'P0001' THEN RAISE EXCEPTION 'Npeso SQLSTATE %',SQLSTATE; END IF; END;

  -- N (informativo, dependente de competência): mês zootécnico fechado
  BEGIN
    v_res := public.oc_registrar_movimentacao(v_opE,v_cli,'2020-01-01','bois',1,500,NULL,'probe mes fechado');
    v_mesfechado := false;
  EXCEPTION WHEN OTHERS THEN v_mesfechado := true; END;
  RAISE NOTICE 'mes-fechado guard incidiu em 2020-01-01: %', v_mesfechado;

  RAISE NOTICE 'PR-OC-MODEL-01: suite OK (opB ciclo, opD base/sinc, opE igualdade, opF indefinida + negativos)';
END $t$;

ROLLBACK;
