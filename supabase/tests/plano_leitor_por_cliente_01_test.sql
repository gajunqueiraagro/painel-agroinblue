-- PLANO-LEITOR-POR-CLIENTE-01 (passo 1) — quem procura conta do plano pelo nome olha o cliente.
-- Roda depois da 20261027195100, numa transacao que TERMINA EM RAISE (nada fica). Sintetico: o cliente Teste (T), um SEGUNDO
-- cliente criado na transacao (Y) e contas de plano sinteticas:
--   "SINT PLC Homonimo"  1-Entradas, em T (compoe_dre true, gera_lcdpr true) e em Y (false, false) — centros diferentes
--   "SINT PLC Global"    1-Entradas, global (true, true)
--   "SINT PLC So Do Y"   1-Entradas, so' em Y (true, true)
-- L0 a regra do dono (controle): T -> a de T, Y -> a de Y, quem nao tem -> a global, nome so' de Y -> nulo para T.
-- L1 PELO NOME, SEM CHAVE (lancamento 2-Saidas de macro Dividendos: o resolvedor o deixa sem chave; o gatilho pergunta em qualquer
--    tipo): o de T le^ a conta de T (gera_lcdpr true), o de Y a de Y (false); com a macro fora da matriz o compoe_dre segue o plano
--    de cada um (true / false).
-- L2 cliente sem conta com o nome cai na GLOBAL.   L3 nome que so' o OUTRO cliente tem: nada e' lido (gera_lcdpr fica nulo).
-- L4 PELA CHAVE: chave para conta de OUTRO cliente nao e' lida (compoe_dre nulo, nao o da conta alheia); a do proprio cliente, sim.
-- L5 "EXISTE?" da Mesa (fn_classificacao_apply_row): proposta com nome que so' Y tem e' tirada (o lancamento fica como estava);
--    com nome da global, grava.   L6 o desmembrar pergunta ao mesmo dono (lido do corpo — montar um desmembramento inteiro pede
--    extrato e vinculo; declarado).
-- L7 USUARIO COMUM (authenticated, nao admin, membro real simulado por jwt — `cliente_membros` nao e' tocada) grava lancamento sem
--    chave no cliente dele: nao recebe "permission denied" e o gatilho resolve a conta.
-- L8 o gatilho e' SECURITY DEFINER com search_path fixo, o dono segue FECHADO a authenticated, e o corpo so' escreve em NEW.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create function pg_temp.conta(p_cli uuid, p_sub text, p_centro text, p_dre boolean, p_lcdpr boolean) returns uuid language sql as $f$
  insert into financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo,
                                       ordem_exibicao, compoe_dre, gera_lcdpr)
  values (p_cli, '1-Entradas', 'SINT PLC', 'SINT PLC', p_centro, p_sub, 'administrativo', true, 99990, p_dre, p_lcdpr) returning id $f$;
/* lancamento SEM chave: 2-Saidas de macro Dividendos (o unico texto fora do plano que o resolvedor aceita) */
create function pg_temp.lan(p_cli uuid, p_sub text) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento,
                                         cenario, descricao, subcentro, macro_custo, centro_custo)
  values (p_cli, '2-Saídas', '-1', 12.34, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT plc', p_sub, 'Dividendos', 'Dividendos')
  returning id $f$;

DO $t$
DECLARE
  c_t   constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_nj  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_ux  constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';   -- gestor so' da NJ (membro real)
  c_h   constant text := 'SINT PLC Homonimo';
  c_g   constant text := 'SINT PLC Global';
  c_sy  constant text := 'SINT PLC So Do Y';
  v_y uuid; a_t uuid; a_y uuid; a_g uuid; a_sy uuid;
  l_t uuid; l_y uuid; l_yg uuid; l_tsy uuid; l_k uuid; l_kk uuid; l_ux uuid;
  v_ses uuid := gen_random_uuid(); v_s1 uuid := gen_random_uuid(); v_s2 uuid := gen_random_uuid(); v_r jsonb; v_src text; v_txt text;
BEGIN
  INSERT INTO clientes (nome) VALUES ('SINT PLC cliente Y') RETURNING id INTO v_y;
  a_t  := pg_temp.conta(c_t, c_h, 'SINT PLC T', true, true);
  a_y  := pg_temp.conta(v_y, c_h, 'SINT PLC Y', false, false);
  a_g  := pg_temp.conta(NULL, c_g, 'SINT PLC G', true, true);
  a_sy := pg_temp.conta(v_y, c_sy, 'SINT PLC Y', true, true);

  -- ── L0: o dono ──────────────────────────────────────────────────────────────
  IF fn_plano_conta_do_texto(c_t, c_h, '1-Entradas') IS DISTINCT FROM a_t OR fn_plano_conta_do_texto(v_y, c_h, '1-Entradas') IS DISTINCT FROM a_y
     OR fn_plano_conta_do_texto(v_y, c_g, '1-Entradas') IS DISTINCT FROM a_g OR fn_plano_conta_do_texto(c_t, c_sy, '1-Entradas') IS NOT NULL THEN
    RAISE EXCEPTION 'L0: o dono nao respondeu a regra (cliente; na falta, global; de outro cliente, nunca)';
  END IF;

  -- ── L1: pelo nome, sem chave, cada cliente le^ a SUA conta ──────────────────
  l_t := pg_temp.lan(c_t, c_h);  l_y := pg_temp.lan(v_y, c_h);
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE id IN (l_t, l_y) AND plano_conta_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'L1: o lancamento de teste nasceu com chave (o cenario nao exercita a busca pelo nome)';
  END IF;
  IF (SELECT gera_lcdpr FROM financeiro_lancamentos_v2 WHERE id = l_t) IS DISTINCT FROM true THEN RAISE EXCEPTION 'L1: T nao leu a conta de T (gera_lcdpr)'; END IF;
  IF (SELECT gera_lcdpr FROM financeiro_lancamentos_v2 WHERE id = l_y) IS DISTINCT FROM false THEN RAISE EXCEPTION 'L1: Y nao leu a conta de Y (gera_lcdpr)'; END IF;
  -- a macro sai da matriz (so' a copia; texto e chave nao mudam -> o resolvedor nao mexe) e o compoe_dre passa a seguir o plano
  UPDATE financeiro_lancamentos_v2 SET macro_custo = 'SINT PLC' WHERE id IN (l_t, l_y);
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE id IN (l_t, l_y) AND plano_conta_id IS NULL AND macro_custo = 'SINT PLC') <> 2 THEN
    RAISE EXCEPTION 'L1: o cenario da macro fora da matriz nao se montou';
  END IF;
  IF (SELECT compoe_dre FROM financeiro_lancamentos_v2 WHERE id = l_t) IS DISTINCT FROM true THEN RAISE EXCEPTION 'L1: T nao leu o compoe_dre da conta de T'; END IF;
  IF (SELECT compoe_dre FROM financeiro_lancamentos_v2 WHERE id = l_y) IS DISTINCT FROM false THEN RAISE EXCEPTION 'L1: Y nao leu o compoe_dre da conta de Y'; END IF;

  -- ── L2: sem conta do cliente, a global ──────────────────────────────────────
  l_yg := pg_temp.lan(v_y, c_g);
  IF (SELECT gera_lcdpr FROM financeiro_lancamentos_v2 WHERE id = l_yg) IS DISTINCT FROM true THEN RAISE EXCEPTION 'L2: Y nao caiu na global'; END IF;

  -- ── L3: nome que so' o outro cliente tem ────────────────────────────────────
  l_tsy := pg_temp.lan(c_t, c_sy);
  IF (SELECT gera_lcdpr FROM financeiro_lancamentos_v2 WHERE id = l_tsy) IS NOT NULL THEN RAISE EXCEPTION 'L3: T leu a conta que so'' Y tem'; END IF;

  -- ── L4: pela chave ──────────────────────────────────────────────────────────
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento, cenario, descricao, plano_conta_id)
  VALUES (c_t, '1-Entradas', '1', 12.34, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT plc', a_y) RETURNING id INTO l_k;
  IF (SELECT compoe_dre FROM financeiro_lancamentos_v2 WHERE id = l_k) IS NOT NULL THEN RAISE EXCEPTION 'L4: a chave para conta de outro cliente foi lida'; END IF;
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento, cenario, descricao, plano_conta_id)
  VALUES (c_t, '1-Entradas', '1', 12.34, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT plc', a_t) RETURNING id INTO l_kk;
  IF (SELECT compoe_dre FROM financeiro_lancamentos_v2 WHERE id = l_kk) IS DISTINCT FROM true THEN RAISE EXCEPTION 'L4: a chave do proprio cliente nao foi lida'; END IF;

  -- ── L5: o "existe?" da Mesa ─────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  INSERT INTO financeiro_classificacao_staging
  SELECT (jsonb_populate_record(NULL::financeiro_classificacao_staging, to_jsonb(s) || jsonb_build_object(
     'staging_id', x.id, 'sessao_id', v_ses, 'cliente_id', c_t, 'excel_linha_origem', x.lin, 'match_status', 'exato',
     'match_lancamento_id', l_kk, 'match_lancamento_ids', NULL, 'aplicado', false, 'aplicado_em', NULL, 'estado_anterior', NULL,
     'erro_apply', NULL, 'casamento_meta', NULL, 'update_proposto', jsonb_build_object('subcentro', x.sub)))).*
    FROM (SELECT * FROM financeiro_classificacao_staging LIMIT 1) s,
         (VALUES (v_s1, 99001, c_sy), (v_s2, 99002, c_g)) AS x(id, lin, sub);
  IF (SELECT count(*) FROM financeiro_classificacao_staging WHERE sessao_id = v_ses) <> 2 THEN RAISE EXCEPTION 'L5: o cenario do staging nao se montou'; END IF;
  v_r := fn_classificacao_apply_row(v_s1, true);
  IF (SELECT subcentro FROM financeiro_lancamentos_v2 WHERE id = l_kk) IS DISTINCT FROM c_h THEN
    RAISE EXCEPTION 'L5: a Mesa aceitou nome que so'' o outro cliente tem (%).', v_r;
  END IF;
  v_r := fn_classificacao_apply_row(v_s2, true);
  IF (SELECT subcentro FROM financeiro_lancamentos_v2 WHERE id = l_kk) IS DISTINCT FROM c_g
     OR (SELECT plano_conta_id FROM financeiro_lancamentos_v2 WHERE id = l_kk) IS DISTINCT FROM a_g THEN
    RAISE EXCEPTION 'L5: a Mesa nao gravou o nome da global (%).', v_r;
  END IF;

  -- ── L6: o desmembrar pergunta ao mesmo dono (corpo) ─────────────────────────
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_split_substituir(uuid, uuid, uuid[])'::regprocedure;
  IF position('fn_plano_conta_do_texto(v_cliente, v_s.update_proposto->>''subcentro'', tp.tipo_operacao)' in v_src) = 0
     OR position('WHERE ativo = true AND subcentro = v_s.update_proposto->>''subcentro''' in v_src) > 0 THEN
    RAISE EXCEPTION 'L6: o desmembrar nao pergunta ao dono';
  END IF;

  -- ── L7: usuario comum, sem chave ────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_ux, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'set local role authenticated';
    INSERT INTO financeiro_lancamentos_v2 (cliente_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento,
                                           cenario, descricao, subcentro, macro_custo, centro_custo)
    VALUES (c_nj, '2-Saídas', '-1', 12.34, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT plc', c_g, 'Dividendos', 'Dividendos')
    RETURNING id INTO l_ux;
    EXECUTE 'reset role';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    EXECUTE 'reset role';
    RAISE EXCEPTION 'L7: o usuario comum nao gravou (%).', v_txt;
  END;
  IF (SELECT gera_lcdpr FROM financeiro_lancamentos_v2 WHERE id = l_ux) IS DISTINCT FROM true THEN RAISE EXCEPTION 'L7: o gatilho nao resolveu a conta para o usuario comum'; END IF;

  -- ── L8: SECURITY, ACL e "so' escreve em NEW" ────────────────────────────────
  IF NOT (SELECT prosecdef AND proconfig::text = '{search_path=public}' FROM pg_proc WHERE oid = 'public.materializar_dre_lcdpr_from_plano()'::regprocedure) THEN
    RAISE EXCEPTION 'L8: o gatilho nao e'' SECURITY DEFINER com search_path fixo';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_plano_conta_do_texto(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_plano_conta_do_texto(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'L8: o dono ficou aberto';
  END IF;
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.materializar_dre_lcdpr_from_plano()'::regprocedure;
  IF v_src ~* '\m(insert\s+into|update\s+\S+\s+set|delete\s+from|perform)\M' THEN RAISE EXCEPTION 'L8: o gatilho escreve fora de NEW'; END IF;
  IF 'x insert into t' !~* '\m(insert\s+into|update\s+\S+\s+set|delete\s+from|perform)\M' THEN RAISE EXCEPTION 'L8: o detector nao sabe achar'; END IF;

  RAISE EXCEPTION 'OK PLANO-LEITOR-POR-CLIENTE-01 passo 1: L0 a L8';
END
$t$;
