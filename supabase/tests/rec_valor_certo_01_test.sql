-- REC-VALOR-CERTO-01 — a recorrencia diz se o valor e' CERTO ou A CONFIRMAR (`tipo_valor`) e marca FOLHA (`folha`).
--
-- Roda como `postgres`, DEPOIS da migration 20261027193600, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
-- Cenario sintetico no cliente Teste (43f32d07): uma recorrencia com 4 ocorrencias futuras.
--
-- T1  a coluna `folha` existe, boolean NOT NULL DEFAULT false, com COMMENT; `valor_a_confirmar` NAO existe (a verdade e'
--     `tipo_valor`, cujo COMMENT traz o vocabulario da tela).
-- T2  regra nova nasce 'exato' e folha = false sem que o INSERT cite as colunas (e' o insert da tela de antes).
-- T3  como `authenticated` (o caminho da tela: UPDATE direto sob RLS), marcar 'estimado' + folha grava; e NENHUM lancamento
--     da recorrencia muda (md5 da linha inteira das 4 ocorrencias) — sao atributos da regra.
-- T4  o CHECK recusa vocabulario fora de ('exato','estimado') — inclusive 'variavel' e 'fixo'.
-- T5  gerar e propagar em SIMULACAO devolvem o MESMO json antes e depois de trocar tipo e folha.
-- T6  ACL e policies da tabela, e o corpo das funcoes da recorrencia, sao os medidos antes da migration.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_rec uuid; v_n int; v_e text; v_ok text := ''; v_a text; v_d text; v_ga jsonb; v_gd jsonb; v_pa jsonb; v_pd jsonb;
  v_tipo text; v_folha boolean; v_col record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- T1
  SELECT data_type, is_nullable, column_default INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'financeiro_recorrencias' AND column_name = 'folha';
  IF v_col.data_type IS DISTINCT FROM 'boolean' OR v_col.is_nullable <> 'NO' OR v_col.column_default <> 'false' THEN
    RAISE EXCEPTION 'T1 coluna folha: % % %', v_col.data_type, v_col.is_nullable, v_col.column_default; END IF;
  IF col_description('public.financeiro_recorrencias'::regclass, (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.financeiro_recorrencias'::regclass AND attname = 'folha')) NOT LIKE 'Folha de pagamento%' THEN
    RAISE EXCEPTION 'T1 folha sem COMMENT'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'financeiro_recorrencias'
              AND column_name = 'valor_a_confirmar') THEN RAISE EXCEPTION 'T1 valor_a_confirmar existe: segunda coluna para a mesma verdade'; END IF;
  IF col_description('public.financeiro_recorrencias'::regclass, (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.financeiro_recorrencias'::regclass AND attname = 'tipo_valor')) NOT LIKE '%"Valor certo"%"A confirmar"%' THEN
    RAISE EXCEPTION 'T1 COMMENT de tipo_valor sem o vocabulario da tela'; END IF;
  v_ok := v_ok || 'T1 ';

  -- T2
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim, forma_pagamento)
  VALUES (c_cli, 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'ENSAIO Valor certo', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
          'Dividendos Despesas Familiares', -1000, 10, '2026-11-01', '2026-11-10', '2027-02-01', 'Boleto')
  RETURNING id, tipo_valor, folha INTO v_rec, v_tipo, v_folha;
  IF v_tipo <> 'exato' OR v_folha THEN RAISE EXCEPTION 'T2 regra nova nasceu % / %', v_tipo, v_folha; END IF;
  PERFORM fn_recorrencia_gerar(v_rec, NULL, false);
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_rec AND NOT cancelado;
  IF v_n <> 4 THEN RAISE EXCEPTION 'SETUP: % ocorrencias (esperado 4)', v_n; END IF;
  v_ok := v_ok || 'T2 ';

  -- T5 (antes) e T3
  v_ga := fn_recorrencia_gerar(v_rec, NULL, true); v_pa := fn_recorrencia_propagar(v_rec, 'todos', true);
  SELECT md5(string_agg(md5(to_jsonb(l)::text), '|' ORDER BY l.id)) INTO v_a FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec;
  SET LOCAL ROLE authenticated;
  UPDATE financeiro_recorrencias SET tipo_valor = 'estimado', folha = true WHERE id = v_rec;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T3 o UPDATE da tela (authenticated, RLS) gravou % linha(s)', v_n; END IF;
  SELECT tipo_valor, folha INTO v_tipo, v_folha FROM financeiro_recorrencias WHERE id = v_rec;
  IF v_tipo <> 'estimado' OR NOT v_folha THEN RAISE EXCEPTION 'T3 ficou % / %', v_tipo, v_folha; END IF;
  SELECT md5(string_agg(md5(to_jsonb(l)::text), '|' ORDER BY l.id)) INTO v_d FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_rec;
  IF v_a IS DISTINCT FROM v_d THEN RAISE EXCEPTION 'T3 trocar tipo/folha alterou lancamento da recorrencia'; END IF;
  v_ok := v_ok || 'T3 ';

  -- T4
  FOREACH v_e IN ARRAY ARRAY['variavel', 'fixo', 'certo', ''] LOOP
    BEGIN
      UPDATE financeiro_recorrencias SET tipo_valor = v_e WHERE id = v_rec;
      RAISE EXCEPTION 'T4 o CHECK aceitou tipo_valor = "%"', v_e;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  v_ok := v_ok || 'T4 ';

  -- T5 (depois)
  v_gd := fn_recorrencia_gerar(v_rec, NULL, true); v_pd := fn_recorrencia_propagar(v_rec, 'todos', true);
  IF v_ga IS DISTINCT FROM v_gd THEN RAISE EXCEPTION 'T5 gerar mudou: % x %', v_ga, v_gd; END IF;
  IF v_pa IS DISTINCT FROM v_pd THEN RAISE EXCEPTION 'T5 propagar mudou: % x %', v_pa, v_pd; END IF;
  v_ok := v_ok || 'T5 ';

  -- T6
  IF (SELECT relacl::text FROM pg_class WHERE oid = 'public.financeiro_recorrencias'::regclass)
     <> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}' THEN
    RAISE EXCEPTION 'T6 ACL da tabela mudou'; END IF;
  IF (SELECT string_agg(polname::text, ',' ORDER BY polname) FROM pg_policy WHERE polrelid = 'public.financeiro_recorrencias'::regclass)
     <> 'recorr_insert,recorr_select,recorr_update' THEN RAISE EXCEPTION 'T6 policies mudaram'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_recorrencia_gerar') <> 'f1e0139104f7207c3d86216ba90966ba'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_recorrencia_propagar') <> '6a932aa9771cbfb81ae09bbef4572f57' THEN
    RAISE EXCEPTION 'T6 corpo do gerar/propagar mudou'; END IF;
  v_ok := v_ok || 'T6';

  RAISE EXCEPTION 'OK rec_valor_certo_01: %', v_ok;
END
$teste$;
