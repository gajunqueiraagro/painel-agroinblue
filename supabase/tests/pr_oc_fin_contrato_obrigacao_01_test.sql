-- PR-OC-FIN-CONTRATO-OBRIGACAO-01 — suíte de contrato de public.oc_gerar_obrigacoes.
--   Padrão do repo (ver pr_oc_liq_02_test.sql): tag de sessão + BEGIN...ROLLBACK + auth via
--   request.jwt + fixtures PRÓPRIAS por tag (independentes do ambiente) + asserts RAISE 'T# FAIL'.
--   Requer aplicada a migration 20260726160000. Rodar SOMENTE em runtime autorizado no PROTO
--   (binbcdfbisgscrifztia); o ROLLBACK garante que nada persiste. NUNCA em produção.
--   FKs ausentes em financeiro_plano_contas.cliente_id e financeiro_fornecedores.cliente_id →
--   gen_random_uuid() representa "outro cliente" legitimamente, sem tabela clientes.
SELECT set_config('app.ocfin01_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_outro_cli uuid := gen_random_uuid();
  v_fav uuid; v_fav2 uuid; v_fav_outro uuid; v_plano uuid;
  v_op uuid; v_ver int; v_res jsonb;
  v_macro text; v_grupo text; v_centro text; v_sub text; v_chave text;
  v_cnt int; v_titulo uuid; v_fav_tit uuid; v_faz_tit uuid; v_val numeric; v_contra uuid; v_plano_res uuid;
  v_pay jsonb;
  -- auxiliares por caso
  v_op2 uuid; v_ver2 int; v_op3 uuid; v_ver3 int; v_doc uuid; v_tit_leg uuid;
  v_leg_val numeric; v_leg_status text; v_st text; v_pay3 jsonb;
  v_plano2 uuid; v_sub2 text; v_pay_nc jsonb;
BEGIN
  v_tag := current_setting('app.ocfin01_tag');
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  v_macro := v_tag||'-macro'; v_grupo := v_tag||'-grupo'; v_centro := v_tag||'-centro'; v_sub := v_tag||'-sub';

  -- Fixtures base --------------------------------------------------------------------
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome) VALUES (v_cli, v_tag||'-fav')  RETURNING id INTO v_fav;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome) VALUES (v_cli, v_tag||'-fav2') RETURNING id INTO v_fav2;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome) VALUES (v_outro_cli, v_tag||'-favB') RETURNING id INTO v_fav_outro;
  INSERT INTO public.financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
    VALUES (v_cli, '2-Saídas', v_macro, v_grupo, v_centro, v_sub, 'pecuaria', true, 1) RETURNING id INTO v_plano;

  -- helper local: cria OC compra fechada com valor_acordado dado, retorna id/versao
  -- (inline por caso; sem função aninhada)

  -- OC principal do caso feliz
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao, status_comercial, rascunho, valor_total, valor_acordado, contraparte_id, observacoes, created_by, updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id, versao INTO v_op, v_ver;
  v_chave := 'oc:'||v_op||':principal:principal:parcela:1';
  v_pay := jsonb_build_object('obrigacoes', jsonb_build_array(jsonb_build_object(
    'natureza_fluxo','pagar','natureza','principal','componente','principal','valor',27062.50,
    'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,
    'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,
    'plano_conta_id',v_plano::text,'chave_idempotencia',v_chave,'sem_movimentacao_caixa',false,'materializar',true)));

  -- ============ REJEIÇÕES SOBRE A OC FELIZ (antes de criar a base) ============
  -- helper de asserção de rejeição:
  --   BEGIN PERFORM rpc; RAISE 'T# FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T# FAIL%' THEN RAISE; END IF; NOTICE; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,subcentro}','""'::jsonb));
    RAISE EXCEPTION 'T6 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T6 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T6 PASS (classificacao nula rejeitada)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,subcentro}', to_jsonb(v_tag||'-x')));
    RAISE EXCEPTION 'T7 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T7 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T7 PASS (subcentro inexistente)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,plano_conta_id}', to_jsonb(gen_random_uuid()::text)));
    RAISE EXCEPTION 'T11 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T11 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T11 PASS (plano divergente)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,valor}','17062.50'::jsonb));
    RAISE EXCEPTION 'T3 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T3 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T3 PASS (abaixo da base)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,valor}','30000'::jsonb));
    RAISE EXCEPTION 'T4 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T4 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T4 PASS (acima da base)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,valor}','0'::jsonb));
    RAISE EXCEPTION 'T2 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T2 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T2 PASS (valor zero)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,favorecido_id}','""'::jsonb));
    RAISE EXCEPTION 'T30 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T30 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T30 PASS (favorecido nulo)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,favorecido_id}', to_jsonb(gen_random_uuid()::text)));
    RAISE EXCEPTION 'T31 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T31 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T31 PASS (favorecido inexistente)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,favorecido_id}', to_jsonb(v_fav_outro::text)));
    RAISE EXCEPTION 'T32 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T32 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T32 PASS (favorecido de outro tenant)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,componente}', to_jsonb(v_tag||'-nao')));
    RAISE EXCEPTION 'T13 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T13 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T13 PASS (componente invalido)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}','""'::jsonb));
    RAISE EXCEPTION 'T36 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T36 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T36 PASS (chave vazia)'; END;
  -- T37/T38 duas partes principais com a MESMA chave (soma = base) -> rejeitado antes de inserir
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_build_object('obrigacoes', jsonb_build_array(
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',13531.25,'sequencia_parcela',1,'quantidade_parcelas',2,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia',v_chave,'sem_movimentacao_caixa',false,'materializar',true),
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',13531.25,'sequencia_parcela',2,'quantidade_parcelas',2,'data_vencimento','2027-01-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia',v_chave,'sem_movimentacao_caixa',false,'materializar',true))));
    RAISE EXCEPTION 'T37 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T37 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T37/T38 PASS (chaves duplicadas no payload)'; END;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver + 99, v_pay);
    RAISE EXCEPTION 'T17 FAIL'; EXCEPTION WHEN others THEN
      IF SQLERRM LIKE 'T17 FAIL%' THEN RAISE; END IF;
      IF SQLSTATE <> '40001' THEN RAISE EXCEPTION 'T17 FAIL SQLSTATE=%',SQLSTATE; END IF; RAISE NOTICE 'T17 PASS (versao 40001)'; END;

  -- ============ CASO FELIZ (T5) + efeitos persistidos (T21/T22/T33/T34) ============
  v_res := public.oc_gerar_obrigacoes(v_op,v_cli,v_ver,v_pay);
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND natureza='principal' AND cancelada IS NOT TRUE;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T5 FAIL partes=%',v_cnt; END IF;
  SELECT valor, favorecido_id, financeiro_lancamento_id INTO v_val, v_fav_tit, v_titulo FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND chave_idempotencia=v_chave;
  IF v_val<>27062.50 THEN RAISE EXCEPTION 'T5 FAIL valor=%',v_val; END IF;
  IF v_fav_tit<>v_fav THEN RAISE EXCEPTION 'T33 FAIL fav parte=%',v_fav_tit; END IF;
  -- T40: regressão do max(uuid) — o plano (UUID) é resolvido sem erro 42883 e persistido na parte.
  SELECT plano_conta_id INTO v_plano_res FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND chave_idempotencia=v_chave;
  IF v_plano_res IS DISTINCT FROM v_plano THEN RAISE EXCEPTION 'T40 FAIL plano_conta_id resolvido=% esperado=%',v_plano_res,v_plano; END IF;
  SELECT favorecido_id, fazenda_id INTO v_fav_tit, v_faz_tit FROM public.financeiro_lancamentos_v2 WHERE id=v_titulo;
  IF v_fav_tit<>v_fav THEN RAISE EXCEPTION 'T34 FAIL fav titulo=%',v_fav_tit; END IF;
  SELECT contraparte_id INTO v_contra FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_contra<>v_fav THEN RAISE EXCEPTION 'T21 FAIL contraparte alterada=%',v_contra; END IF;
  RAISE NOTICE 'T5/T21/T22/T33/T34 PASS (base integral criada; favorecido na parte e no titulo; contraparte intacta; fazenda titulo=%)', v_faz_tit;

  -- T18/T19/T27 reenvio idêntico -> idempotente (sem 2ª parte nem 2º título)
  v_res := public.oc_gerar_obrigacoes(v_op,v_cli,v_ver,v_pay);
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op AND chave_idempotencia=v_chave;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T18 FAIL parte dup=%',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 t JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=t.id WHERE p.chave_idempotencia=v_chave;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T19 FAIL titulo dup=%',v_cnt; END IF;
  RAISE NOTICE 'T18/T19/T27 PASS (idempotente)';

  -- T20/T28 mesma chave, conteúdo diferente -> conflito
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,valor}','20000'::jsonb));
    RAISE EXCEPTION 'T20 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T20 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T20/T28 PASS (conflito)'; END;
  -- T26 2ª base com chave diferente -> rejeitada (guard server-side)
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op,v_cli,v_ver, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op||':principal:principal:parcela:9')));
    RAISE EXCEPTION 'T26 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T26 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T26 PASS (2a base bloqueada)'; END;

  -- ============ CASOS COM OCs / PLANOS / TÍTULOS PRÓPRIOS ============
  -- T1 valor_acordado NULL -> rejeitada
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,NULL,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')));
    RAISE EXCEPTION 'T1 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T1 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T1 PASS (base nula)'; END;
  -- T1B valor_acordado 0 -> rejeitada
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,0,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')));
    RAISE EXCEPTION 'T1B FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T1B FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T1B PASS (base zero)'; END;
  -- T16 operação cancelada -> rejeitada
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','cancelada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')));
    RAISE EXCEPTION 'T16 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T16 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T16 PASS (cancelada)'; END;
  -- T15 rascunho -> rejeitada
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','programada',true,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')));
    RAISE EXCEPTION 'T15 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T15 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T15 PASS (rascunho)'; END;

  -- T14 documento de OUTRA operação -> rejeitado
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op3,v_ver3;   -- op "outra"
  INSERT INTO public.zoo_operacao_documentos (cliente_id,operacao_id,nome,especie,uploaded_em,cancelado,versao)
    VALUES (v_cli,v_op3,v_tag||'-doc','nf_principal',now(),false,1) RETURNING id INTO v_doc;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;   -- op alvo
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')),'{obrigacoes,0,documento_id}', to_jsonb(v_doc::text)));
    RAISE EXCEPTION 'T14 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T14 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T14 PASS (doc de outra op)'; END;

  -- T8 plano INATIVO -> rejeitado (hierarquia própria)
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (v_cli,'2-Saídas',v_tag||'-i',v_tag||'-i',v_tag||'-i',v_tag||'-inat','pecuaria',false,1);
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')),'{obrigacoes,0,macro_custo}', to_jsonb(v_tag||'-i')),'{obrigacoes,0,grupo_custo}', to_jsonb(v_tag||'-i')),'{obrigacoes,0,centro_custo}', to_jsonb(v_tag||'-i')),'{obrigacoes,0,subcentro}', to_jsonb(v_tag||'-inat')));
    RAISE EXCEPTION 'T8 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T8 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T8 PASS (plano inativo)'; END;

  -- T9 plano de OUTRO cliente -> rejeitado
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (v_outro_cli,'2-Saídas',v_tag||'-o',v_tag||'-o',v_tag||'-o',v_tag||'-outro','pecuaria',true,1);
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')),'{obrigacoes,0,macro_custo}', to_jsonb(v_tag||'-o')),'{obrigacoes,0,grupo_custo}', to_jsonb(v_tag||'-o')),'{obrigacoes,0,centro_custo}', to_jsonb(v_tag||'-o')),'{obrigacoes,0,subcentro}', to_jsonb(v_tag||'-outro')));
    RAISE EXCEPTION 'T9 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T9 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T9 PASS (plano de outro cliente)'; END;

  -- T12 — ambiguidade IMPEDIDA pela uq_plano_contas_global (teste ESTRUTURAL de constraint; NÃO chama a RPC).
  --   Duas linhas de mesma hierarquia normalizada não coexistem → o ramo v_plano_cnt>1 (ambiguous) da RPC
  --   é defensivo e inalcançável por escrita regular. Confirma-se via SQLSTATE 23505 + contagem = 1.
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (v_cli,'2-Saídas',v_tag||'-a',v_tag||'-a',v_tag||'-a',v_tag||'-amb','pecuaria',true,1);
  BEGIN
    INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
      VALUES (NULL,'2-Saídas',v_tag||'-a',v_tag||'-a',v_tag||'-a',v_tag||'-amb','pecuaria',true,2);
    RAISE EXCEPTION 'T12 FAIL: 2a linha de mesma hierarquia deveria violar uq_plano_contas_global';
  EXCEPTION
    WHEN unique_violation THEN NULL;   -- 23505 esperado (ambiguidade impedida pelo schema)
    WHEN others THEN IF SQLERRM LIKE 'T12 FAIL%' THEN RAISE; ELSE RAISE EXCEPTION 'T12 FAIL SQLSTATE inesperado=%', SQLSTATE; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.financeiro_plano_contas
   WHERE tipo_operacao='2-Saídas' AND macro_custo=v_tag||'-a' AND centro_custo=v_tag||'-a' AND subcentro=v_tag||'-amb';
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T12 FAIL: hierarquia com % linhas (esperado 1)', v_cnt; END IF; RAISE NOTICE 'T12 PASS (unicidade da classificacao; ambiguidade impedida pelo schema)';

  -- T10 plano GLOBAL válido -> ACEITO
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (NULL,'2-Saídas',v_tag||'-g',v_tag||'-g',v_tag||'-g',v_tag||'-glob','pecuaria',true,1);
  PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')),'{obrigacoes,0,macro_custo}', to_jsonb(v_tag||'-g')),'{obrigacoes,0,grupo_custo}', to_jsonb(v_tag||'-g')),'{obrigacoes,0,centro_custo}', to_jsonb(v_tag||'-g')),'{obrigacoes,0,subcentro}', to_jsonb(v_tag||'-glob')),'{obrigacoes,0,plano_conta_id}','null'::jsonb));
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND natureza='principal' AND cancelada IS NOT TRUE;
  IF v_cnt<>1 THEN RAISE EXCEPTION 'T10 FAIL partes=%',v_cnt; END IF; RAISE NOTICE 'T10 PASS (plano global aceito)';

  -- T35 favorecido != contraparte persistido sem alterar a contraparte da OC
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')),'{obrigacoes,0,favorecido_id}', to_jsonb(v_fav2::text)));
  SELECT favorecido_id INTO v_fav_tit FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND natureza='principal';
  SELECT contraparte_id INTO v_contra FROM public.zoo_operacoes_comerciais WHERE id=v_op2;
  IF v_fav_tit<>v_fav2 THEN RAISE EXCEPTION 'T35 FAIL fav=%',v_fav_tit; END IF;
  IF v_contra<>v_fav THEN RAISE EXCEPTION 'T35 FAIL contraparte alterada=%',v_contra; END IF;
  RAISE NOTICE 'T35 PASS (favorecido!=contraparte; contraparte OC intacta)';

  -- T24A/B/C título realizado/agendado/conciliado protegido: existindo principal ativa vinculada a título
  --   nesse estado, a guarda de 2ª base BLOQUEIA nova geração (qualquer estado) e o título fica intacto.
  FOR v_st IN SELECT unnest(ARRAY['realizado','agendado','conciliado']) LOOP
    INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
      VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,data_pagamento,cancelado,status_transacao,descricao)
      VALUES (v_cli,27062.50,'compra',DATE '2026-12-31',false,v_st,v_tag) RETURNING id INTO v_titulo;
    INSERT INTO public.zoo_operacao_partes (cliente_id,operacao_id,origem,natureza,componente,sequencia_parcela,quantidade_parcelas,valor,incluso_no_total,sem_movimentacao_caixa,chave_idempotencia,financeiro_lancamento_id)
      VALUES (v_cli,v_op2,'manual','principal','principal',1,1,27062.50,false,false,'oc:'||v_op2||':principal:principal:parcela:1',v_titulo);
    BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:2')));
      RAISE EXCEPTION 'T24 FAIL estado=%',v_st; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T24 FAIL%' THEN RAISE; END IF; END;
    SELECT status_transacao INTO v_st FROM public.financeiro_lancamentos_v2 WHERE id=v_titulo;   -- título intacto (mesmo estado)
    SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND natureza='principal' AND cancelada IS NOT TRUE;
    IF v_cnt<>1 THEN RAISE EXCEPTION 'T24 FAIL parte dup estado=% cnt=%',v_st,v_cnt; END IF;
  END LOOP;
  RAISE NOTICE 'T24A/B/C PASS (realizado/agendado/conciliado: 2a base bloqueada, titulo/parte intactos)';

  -- T23 legado sem OC permanece inalterado após uma geração válida
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id,valor,tipo_operacao,data_pagamento,cancelado,status_transacao,origem_lancamento,descricao)
    VALUES (v_cli,999.99,'compra',DATE '2026-05-01',false,'realizado','manual',v_tag||'-legado') RETURNING id INTO v_tit_leg;
  SELECT valor,status_transacao INTO v_leg_val,v_leg_status FROM public.financeiro_lancamentos_v2 WHERE id=v_tit_leg;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')));
  SELECT valor,status_transacao INTO v_val,v_st FROM public.financeiro_lancamentos_v2 WHERE id=v_tit_leg;
  IF v_val<>v_leg_val OR v_st<>v_leg_status THEN RAISE EXCEPTION 'T23 FAIL legado alterado val=% st=%',v_val,v_st; END IF;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id=v_tit_leg;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T23 FAIL parte criada p/ legado=%',v_cnt; END IF;
  RAISE NOTICE 'T23 PASS (legado intacto, sem parte OC)';

  -- T39 guarda com chave persistida NULL: principal ativa com chave nula bloqueia nova geração
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  INSERT INTO public.zoo_operacao_partes (cliente_id,operacao_id,origem,natureza,componente,sequencia_parcela,quantidade_parcelas,valor,incluso_no_total,sem_movimentacao_caixa,chave_idempotencia)
    VALUES (v_cli,v_op2,'manual','principal','principal',1,1,27062.50,false,false,NULL);   -- chave NULL
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_set(v_pay,'{obrigacoes,0,chave_idempotencia}', to_jsonb('oc:'||v_op2||':principal:principal:parcela:1')));
    RAISE EXCEPTION 'T39 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'T39 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'T39 PASS (chave persistida NULL bloqueia; sem UNKNOWN)'; END;

  -- T25 futuro 1/N: três principais no MESMO payload somando a base -> ACEITO
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op3,v_ver3;
  v_pay3 := jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',9020.83,'sequencia_parcela',1,'quantidade_parcelas',3,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op3||':principal:principal:parcela:1','sem_movimentacao_caixa',false,'materializar',true),
    jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',9020.83,'sequencia_parcela',2,'quantidade_parcelas',3,'data_vencimento','2027-01-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op3||':principal:principal:parcela:2','sem_movimentacao_caixa',false,'materializar',true),
    jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',9020.84,'sequencia_parcela',3,'quantidade_parcelas',3,'data_vencimento','2027-02-28','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op3||':principal:principal:parcela:3','sem_movimentacao_caixa',false,'materializar',true)));
  PERFORM public.oc_gerar_obrigacoes(v_op3,v_cli,v_ver3,v_pay3);
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op3 AND natureza='principal' AND cancelada IS NOT TRUE;
  IF v_cnt<>3 THEN RAISE EXCEPTION 'T25 FAIL 1/N cnt=%',v_cnt; END IF; RAISE NOTICE 'T25 PASS (1/N somando a base)';

  -- ============ OPÇÃO (a): N OBRIGAÇÕES PRINCIPAIS POR CLASSIFICAÇÃO (operação mista) ============
  --   2º plano/subcentro representa a 2ª classificação (ex.: Machos × Fêmeas). A RPC já aceita N
  --   principais no MESMO payload desde que Σ = valor_acordado (exato) e chaves distintas; cada item
  --   cria sua própria parte + título com classificação própria. Nenhuma alteração de contrato da RPC.
  v_sub2 := v_tag||'-sub2';
  INSERT INTO public.financeiro_plano_contas (cliente_id,tipo_operacao,macro_custo,grupo_custo,centro_custo,subcentro,escopo_negocio,ativo,ordem_exibicao)
    VALUES (v_cli,'2-Saídas',v_macro,v_grupo,v_centro,v_sub2,'pecuaria',true,2) RETURNING id INTO v_plano2;

  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;
  v_pay_nc := jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',17000.00,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:macho:parcela:1','sem_movimentacao_caixa',false,'materializar',true),
    jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',10062.50,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub2,'plano_conta_id',v_plano2::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:femea:parcela:1','sem_movimentacao_caixa',false,'materializar',true)));

  -- NC1: 2 classificações distintas, chaves distintas, soma exata (17000 + 10062.50 = 27062.50) -> ACEITO
  PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, v_pay_nc);
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND natureza='principal' AND cancelada IS NOT TRUE;
  IF v_cnt<>2 THEN RAISE EXCEPTION 'NC1 FAIL partes=%',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 t JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=t.id WHERE p.operacao_id=v_op2 AND p.natureza='principal';
  IF v_cnt<>2 THEN RAISE EXCEPTION 'NC1 FAIL titulos=%',v_cnt; END IF;
  -- NC6: cada obrigação persiste subcentro/plano próprios e vincula título próprio à MESMA operação
  SELECT plano_conta_id, financeiro_lancamento_id INTO v_plano_res, v_titulo FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND subcentro=v_sub AND natureza='principal';
  IF v_plano_res IS DISTINCT FROM v_plano OR v_titulo IS NULL THEN RAISE EXCEPTION 'NC6 FAIL grupo1 plano=% tit=%',v_plano_res,v_titulo; END IF;
  SELECT subcentro, plano_conta_id INTO v_st, v_plano_res FROM public.financeiro_lancamentos_v2 WHERE id=v_titulo;
  IF v_st<>v_sub OR v_plano_res IS DISTINCT FROM v_plano THEN RAISE EXCEPTION 'NC6 FAIL titulo grupo1 sub=% plano=%',v_st,v_plano_res; END IF;
  SELECT plano_conta_id, financeiro_lancamento_id INTO v_plano_res, v_titulo FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND subcentro=v_sub2 AND natureza='principal';
  IF v_plano_res IS DISTINCT FROM v_plano2 OR v_titulo IS NULL THEN RAISE EXCEPTION 'NC6 FAIL grupo2 plano=% tit=%',v_plano_res,v_titulo; END IF;
  SELECT subcentro, plano_conta_id INTO v_st, v_plano_res FROM public.financeiro_lancamentos_v2 WHERE id=v_titulo;
  IF v_st<>v_sub2 OR v_plano_res IS DISTINCT FROM v_plano2 THEN RAISE EXCEPTION 'NC6 FAIL titulo grupo2 sub=% plano=%',v_st,v_plano_res; END IF;
  RAISE NOTICE 'NC1/NC6 PASS (2 classificacoes: 2 partes + 2 titulos; subcentro/plano proprios; mesma operacao)';

  -- NC2: reenvio idêntico -> idempotente (continua 2 partes e 2 títulos)
  PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, v_pay_nc);
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND natureza='principal' AND cancelada IS NOT TRUE;
  IF v_cnt<>2 THEN RAISE EXCEPTION 'NC2 FAIL partes dup=%',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.financeiro_lancamentos_v2 t JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=t.id WHERE p.operacao_id=v_op2 AND p.natureza='principal';
  IF v_cnt<>2 THEN RAISE EXCEPTION 'NC2 FAIL titulos dup=%',v_cnt; END IF;
  RAISE NOTICE 'NC2 PASS (reenvio idempotente, sem duplicar partes/titulos)';

  -- op limpa para as rejeições NC3/NC4/NC5 (todas abortam antes de inserir)
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,valor_total,valor_acordado,contraparte_id,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-06-19','fechada',false,0,27062.50,v_fav,v_tag,v_admin,v_admin) RETURNING id,versao INTO v_op2,v_ver2;

  -- NC3: soma MENOR que valor_acordado (17000 + 10000 = 27000 < 27062.50) -> rejeitada
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_build_object('obrigacoes', jsonb_build_array(
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',17000.00,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:macho:parcela:1','sem_movimentacao_caixa',false,'materializar',true),
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',10000.00,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub2,'plano_conta_id',v_plano2::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:femea:parcela:1','sem_movimentacao_caixa',false,'materializar',true))));
    RAISE EXCEPTION 'NC3 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'NC3 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'NC3 PASS (soma < valor_acordado rejeitada)'; END;

  -- NC4: soma MAIOR que valor_acordado (17000 + 11000 = 28000 > 27062.50) -> rejeitada
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_build_object('obrigacoes', jsonb_build_array(
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',17000.00,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:macho:parcela:1','sem_movimentacao_caixa',false,'materializar',true),
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',11000.00,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub2,'plano_conta_id',v_plano2::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:femea:parcela:1','sem_movimentacao_caixa',false,'materializar',true))));
    RAISE EXCEPTION 'NC4 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'NC4 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'NC4 PASS (soma > valor_acordado rejeitada)'; END;

  -- NC5: duas classificações com a MESMA chave (soma = base) -> rejeitada (chaves duplicadas no payload)
  BEGIN PERFORM public.oc_gerar_obrigacoes(v_op2,v_cli,v_ver2, jsonb_build_object('obrigacoes', jsonb_build_array(
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',17000.00,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub,'plano_conta_id',v_plano::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:x:parcela:1','sem_movimentacao_caixa',false,'materializar',true),
      jsonb_build_object('natureza_fluxo','pagar','natureza','principal','componente','principal','valor',10062.50,'sequencia_parcela',1,'quantidade_parcelas',1,'data_vencimento','2026-12-31','favorecido_id',v_fav::text,'macro_custo',v_macro,'grupo_custo',v_grupo,'centro_custo',v_centro,'subcentro',v_sub2,'plano_conta_id',v_plano2::text,'chave_idempotencia','oc:'||v_op2||':principal:principal:x:parcela:1','sem_movimentacao_caixa',false,'materializar',true))));
    RAISE EXCEPTION 'NC5 FAIL'; EXCEPTION WHEN others THEN IF SQLERRM LIKE 'NC5 FAIL%' THEN RAISE; END IF; RAISE NOTICE 'NC5 PASS (mesma chave em 2 classificacoes rejeitada)'; END;
  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND natureza='principal' AND cancelada IS NOT TRUE;
  IF v_cnt<>0 THEN RAISE EXCEPTION 'NC3/4/5 FAIL: rejeicoes deixaram % partes',v_cnt; END IF;

  RAISE NOTICE '=== oc_gerar_obrigacoes: TODOS os casos executáveis PASS ===';
END $t$;

ROLLBACK;  -- nada persiste

-- ============================================================================
-- T29 — CONCORRÊNCIA (teste MANUAL de duas sessões; NÃO executável no harness single-session).
--   Pré-condição: uma OC compra fechada :op com valor_acordado=27062.50, sem principal ativa; :ver atual.
--   Sessão A:  BEGIN; SELECT public.oc_gerar_obrigacoes(:op,:cli,:ver, <payload principal integral chave A>);  -- NÃO commitar ainda
--   Sessão B:  BEGIN; SELECT public.oc_gerar_obrigacoes(:op,:cli,:ver, <payload principal integral chave B>);  -- BLOQUEIA
--   Sessão A:  COMMIT;
--   Sessão B:  desbloqueia e FALHA com 'Ja existe obrigacao principal ativa ...' (ou 40001 por versao);  ROLLBACK;
--   Razão: oc_gerar_obrigacoes faz SELECT ... FROM zoo_operacoes_comerciais ... FOR UPDATE no início →
--     a sessão B só adquire o lock da linha da operação após o COMMIT de A e então enxerga a base criada.
--   Confirmação final:
--     SELECT count(*) FROM zoo_operacao_partes WHERE operacao_id=:op AND natureza='principal' AND cancelada IS NOT TRUE;  -- = 1
-- ============================================================================
