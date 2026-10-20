-- ACESSOS-PERFIL-01 — prova da fonte unica do nome, do gatilho do login, do backfill e do "Editar acesso".
-- Sintetico (logins e membros criados aqui, tudo desfeito); termina em RAISE 'OK'. Clientes: Teste (43f32d07), NJ (f2d67cd4),
-- Santa Rita (77d37bbf). Usuarios reais usados so' como chamadores: o admin (7bd0b6ad) e o gestor de teste do NJ (9200e0d0).
--   P1 o gatilho de auth.users cria o perfil com o nome do user_metadata e o e-mail do login
--   P2 sem nome no user_metadata, o perfil nasce sem nome e o leitor devolve o e-mail; pessoa sem login = "usuário removido"
--   P3 nao vaza: o gestor do NJ nao recebe quem e' so' de outro cliente e nao esta' na trilha do NJ; outro cliente = 42501
--   P4 devolve o ex-membro e o admin quando estao na trilha; situacao certa
--   P5 o backfill e' idempotente: toda chamada do dono sobre os membros com login devolve 'nada'
--   P6 editar: simulacao nao grava; gravacao muda perfil, papel e fazendas e deixa a trilha com o autor; proprio acesso,
--      admin e e-mail de outro login recusados
--   P7 o resolver do snapshot da OC so' devolve o proprio nome (com usuario logado)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $t$
DECLARE
  c_teste  uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_nj     uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_sr     uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_faz    uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  u_admin  uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_nj     uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  u_a uuid := gen_random_uuid(); -- ex-membro do Teste, na trilha
  u_b uuid := gen_random_uuid(); -- sem nome no user_metadata, membro do Teste
  u_x uuid := gen_random_uuid(); -- so' da Santa Rita, fora da trilha do NJ
  u_z uuid := gen_random_uuid(); -- nunca teve login
  v_n int; v_r record; v_j jsonb; v_m uuid; v_ok boolean;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role)
  VALUES (u_a, 'sint.a.' || left(u_a::text, 8) || '@exemplo.test', '{"nome":"SINT Ana Exmembro"}', 'authenticated', 'authenticated'),
         (u_b, 'sint.b.' || left(u_b::text, 8) || '@exemplo.test', '{}', 'authenticated', 'authenticated'),
         (u_x, 'sint.x.' || left(u_x::text, 8) || '@exemplo.test', '{"nome":"SINT Xavier Outro"}', 'authenticated', 'authenticated');

  -- P1
  SELECT * INTO v_r FROM public.profiles WHERE user_id = u_a;
  IF NOT FOUND OR v_r.nome IS DISTINCT FROM 'SINT Ana Exmembro' OR v_r.email NOT LIKE 'sint.a.%' THEN
    RAISE EXCEPTION 'P1 gatilho: perfil % / %', v_r.nome, v_r.email; END IF;

  -- P2
  SELECT * INTO v_r FROM public.profiles WHERE user_id = u_b;
  IF NOT FOUND OR v_r.nome IS NOT NULL OR v_r.email NOT LIKE 'sint.b.%' THEN RAISE EXCEPTION 'P2 sem nome: %', v_r.nome; END IF;
  IF public._fn_nome_do_usuario(u_b) NOT LIKE 'sint.b.%' THEN RAISE EXCEPTION 'P2 leitor sem nome'; END IF;
  IF public._fn_nome_do_usuario(u_z) IS DISTINCT FROM 'usuário removido (' || left(u_z::text, 8) || ')' THEN
    RAISE EXCEPTION 'P2 removido: %', public._fn_nome_do_usuario(u_z); END IF;
  IF public.resolver_nome_usuario(u_a) IS DISTINCT FROM 'SINT Ana Exmembro' THEN RAISE EXCEPTION 'P2 resolver nao delega'; END IF;

  -- trilha e membros sinteticos
  INSERT INTO public.cliente_membros (user_id, cliente_id, perfil, ativo) VALUES (u_b, c_teste, 'financeiro', true) RETURNING id INTO v_m;
  INSERT INTO public.fazenda_membros (fazenda_id, user_id, papel) VALUES (c_faz, u_b, 'membro');
  INSERT INTO public.cliente_membros (user_id, cliente_id, perfil, ativo) VALUES (u_x, c_sr, 'financeiro', true);
  INSERT INTO public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, resumo)
  VALUES (c_teste, u_a, 'teste', 'sint', 'sint', 'SINT ACESSOS-PERFIL-01'),
         (c_teste, u_admin, 'teste', 'sint', 'sint', 'SINT ACESSOS-PERFIL-01');

  -- P3 (como o gestor do NJ)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_nj, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.fn_nomes_dos_autores(c_nj, ARRAY[u_x, u_a, u_z]);
  IF v_n <> 0 THEN RAISE EXCEPTION 'P3 vazou % pessoa(s) de fora do NJ', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.fn_nomes_dos_autores(c_nj, ARRAY[u_nj]);
  IF v_n <> 1 THEN RAISE EXCEPTION 'P3 o proprio membro sumiu'; END IF;
  v_ok := false;
  BEGIN PERFORM public.fn_nomes_dos_autores(c_sr, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P3 outro cliente nao recusou'; END IF;
  v_ok := false;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN PERFORM public.fn_nomes_dos_autores(c_teste, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P3 sem usuario nao recusou'; END IF;

  -- P4 (como o admin, no Teste)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.fn_nomes_dos_autores(c_teste, ARRAY[u_a, u_admin, u_x, u_z]);
  IF v_n <> 2 THEN RAISE EXCEPTION 'P4 esperava 2 (ex-membro e admin), veio %', v_n; END IF;
  SELECT situacao, nome INTO v_r FROM public.fn_nomes_dos_autores(c_teste, ARRAY[u_a]);
  IF v_r.situacao <> 'ex-membro' OR v_r.nome <> 'SINT Ana Exmembro' THEN RAISE EXCEPTION 'P4 ex-membro: %', v_r.situacao; END IF;
  SELECT situacao INTO v_r FROM public.fn_nomes_dos_autores(c_teste, ARRAY[u_admin]);
  IF v_r.situacao <> 'consultor' THEN RAISE EXCEPTION 'P4 admin: %', v_r.situacao; END IF;
  SELECT situacao, email INTO v_r FROM public.fn_nomes_dos_autores(c_teste, NULL) WHERE user_id = u_b;
  IF v_r.situacao <> 'membro ativo' OR v_r.email NOT LIKE 'sint.b.%' THEN RAISE EXCEPTION 'P4 lista do cliente: %', v_r.situacao; END IF;

  -- P5
  SELECT count(*) INTO v_n FROM (SELECT DISTINCT m.user_id FROM public.cliente_membros m JOIN auth.users u ON u.id = m.user_id
                                  WHERE m.user_id NOT IN (u_b, u_x)) q
   WHERE public._fn_perfil_garantir(q.user_id, 'SINT nunca sobrescreve', 'sint.nunca@exemplo.test')->>'acao' <> 'nada';
  IF v_n <> 0 THEN RAISE EXCEPTION 'P5 backfill nao idempotente: % mudariam', v_n; END IF;

  -- P6 editar
  v_j := public._fn_membro_editar(u_admin, v_m, 'SINT Bruno Editado', 'sint.b.' || left(u_b::text, 8) || '@exemplo.test',
                                  'gestor_cliente', ARRAY[c_faz], true);
  IF (v_j->>'simulado')::boolean IS NOT TRUE OR (v_j->'mudou'->>'perfil')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'P6 simulacao: %', v_j; END IF;
  IF (SELECT perfil FROM public.cliente_membros WHERE id = v_m) <> 'financeiro' THEN RAISE EXCEPTION 'P6 simulacao gravou'; END IF;
  v_j := public._fn_membro_editar(u_admin, v_m, 'SINT Bruno Editado', 'sint.b.' || left(u_b::text, 8) || '@exemplo.test',
                                  'gestor_cliente', ARRAY[c_faz], false);
  IF (SELECT perfil FROM public.cliente_membros WHERE id = v_m) <> 'gestor_cliente' THEN RAISE EXCEPTION 'P6 perfil nao gravou'; END IF;
  IF (SELECT nome FROM public.profiles WHERE user_id = u_b) <> 'SINT Bruno Editado' THEN RAISE EXCEPTION 'P6 nome nao gravou'; END IF;
  IF (SELECT papel FROM public.fazenda_membros WHERE user_id = u_b AND fazenda_id = c_faz) <> 'gerente' THEN RAISE EXCEPTION 'P6 papel'; END IF;
  SELECT count(*) INTO v_n FROM public.audit_log WHERE tabela_origem = 'cliente_membros' AND registro_id = v_m
     AND acao = 'editar_acesso' AND usuario_id = u_admin AND dados_anteriores->>'perfil' = 'financeiro'
     AND dados_novos->>'perfil' = 'gestor_cliente';
  IF v_n <> 1 THEN RAISE EXCEPTION 'P6 trilha: %', v_n; END IF;
  v_ok := false;
  BEGIN PERFORM public._fn_membro_editar(u_b, v_m, 'x', 'x@exemplo.test', 'financeiro', ARRAY[c_faz], true);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P6 nao admin passou'; END IF;
  v_ok := false;
  BEGIN PERFORM public._fn_membro_editar(u_admin, v_m, 'SINT', 'sint.a.' || left(u_a::text, 8) || '@exemplo.test',
                                         'financeiro', ARRAY[c_faz], true);
  EXCEPTION WHEN raise_exception THEN v_ok := SQLERRM LIKE 'Este e-mail já é login%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P6 e-mail de outro login passou'; END IF;
  v_ok := false;
  BEGIN PERFORM public._fn_membro_editar(u_admin, (SELECT id FROM public.cliente_membros WHERE user_id = u_admin AND cliente_id = c_teste),
                                         'SINT', 'x@exemplo.test', 'financeiro', ARRAY[c_faz], true);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P6 o proprio acesso passou'; END IF;

  -- P7 o resolver do snapshot da OC: com usuario logado, so' o proprio nome (20261027204400)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_nj, 'role', 'authenticated')::text, true);
  IF public.resolver_nome_usuario(u_nj) IS NULL THEN RAISE EXCEPTION 'P7 o proprio nome'; END IF;
  v_ok := false;
  BEGIN PERFORM public.resolver_nome_usuario(u_a);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'P7 resolver devolveu o nome de outra pessoa'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
ROLLBACK;
