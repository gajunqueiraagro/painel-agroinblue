-- ACESSOS-PERFIL-01 (Gabriel 20/10/2026): o nome e o e-mail de todo usuario numa fonte so'; o acesso criado ja' nasce com eles;
-- "Editar acesso"; e os nomes na Auditoria.
--
-- MEDIDO ANTES (20/10, proto): `profiles` com 6 linhas, SEM indice nenhum (nem chave); nenhum gatilho em `auth.users`
-- (`handle_new_user` existia sem estar ligado); 10 usuarios distintos em `cliente_membros`, 7 com login, 3 orfaos (sem login);
-- 1 usuario com login e sem perfil (Financeiro do Agnaldo, criado em 20/10 pela tela). `criar-usuario` terminava num
-- `profiles.update({cliente_id})` — coluna que nao existe —, que falhava calado.
--
-- (1) `uq_profiles_user_id`: um perfil por usuario (o upsert precisa da unicidade).
-- (2) `handle_new_user` reescrito e LIGADO em `auth.users` (AFTER INSERT): o login novo nasce com perfil (nome do
--     `user_metadata.nome`, e-mail do login). Perfil que ja' exista nao perde nome nem e-mail preenchidos.
-- (3) `_fn_perfil_garantir(user, nome, email)`: o dono de "o perfil existe e tem nome e e-mail" — cria, ou preenche o que esta'
--     vazio; NUNCA sobrescreve nome preenchido. Usam: o gatilho, o backfill e a funcao `criar-usuario`.
-- (4) BACKFILL: todo usuario de `cliente_membros` com login ganha perfil / nome / e-mail que faltem (nome = `user_metadata.nome`;
--     sem ele, a parte antes do @, marcada para revisao). Orfaos (sem login) so' se listam. Trilha em
--     `acessos_perfil_01_backfill` (RLS ligada, sem acesso para a tela). Idempotente: a segunda vez nao toca nada.
-- (5) `_fn_nome_do_usuario(id)`: A REGRA DO NOME, uma so' — perfil.nome -> e-mail do perfil -> e-mail do login ->
--     "usuário removido (xxxxxxxx)". `resolver_nome_usuario` passa a DELEGAR a ela (o snapshot de nome da OC).
-- (6) `fn_nomes_dos_autores(cliente, ids)`: a leitura que as telas usam. Guarda de tenant (42501). Sem ids: os membros ativos
--     do cliente. Com ids: so' quem e' ou foi membro do cliente, o admin do AGROinBLUE, ou aparece na trilha DESTE cliente —
--     nunca uma pessoa de outro cliente que nao esteja na trilha deste. situacao: membro ativo | ex-membro | consultor | removido.
-- (7) `_fn_membro_editar(autor, membro, nome, email, perfil, fazendas, simular)`: o "Editar acesso", numa transacao — perfil
--     (nome, e-mail), `cliente_membros.perfil` e `fazenda_membros` (a regra de papel do `criar-usuario`), com a trilha em
--     `audit_log` (antes / depois, autor = quem chamou). Interna: so' a edge function `editar-membro` (service_role) a chama,
--     depois de conferir o chamador. Simulacao = gravacao (SQLSTATE 'MESIM').

SET LOCAL lock_timeout = '2s';

-- (1) ---------------------------------------------------------------------------------------------------------------------
DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ACESSOS-PERFIL-01: profiles tem user_id repetido — unificar antes';
  END IF;
END $guarda$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_user_id ON public.profiles (user_id);

-- (3) ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_perfil_garantir(p_user_id uuid, p_nome text, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nome  text := nullif(btrim(p_nome), '');
  v_email text := nullif(lower(btrim(p_email)), '');
  v_antes public.profiles%ROWTYPE;
  v_achou boolean;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'usuário obrigatório' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_antes FROM public.profiles WHERE user_id = p_user_id;
  v_achou := FOUND;
  IF NOT v_achou THEN
    INSERT INTO public.profiles (user_id, nome, email) VALUES (p_user_id, v_nome, v_email);
    RETURN jsonb_build_object('acao', 'criado', 'antes', NULL, 'depois', jsonb_build_object('nome', v_nome, 'email', v_email));
  END IF;
  IF (nullif(btrim(v_antes.nome), '') IS NULL AND v_nome IS NOT NULL)
     OR (nullif(btrim(v_antes.email), '') IS NULL AND v_email IS NOT NULL) THEN
    UPDATE public.profiles
       SET nome = coalesce(nullif(btrim(nome), ''), v_nome),
           email = coalesce(nullif(btrim(email), ''), v_email),
           updated_at = now()
     WHERE user_id = p_user_id;
    RETURN jsonb_build_object('acao', 'preenchido',
      'antes', jsonb_build_object('nome', v_antes.nome, 'email', v_antes.email),
      'depois', jsonb_build_object('nome', coalesce(nullif(btrim(v_antes.nome), ''), v_nome),
                                   'email', coalesce(nullif(btrim(v_antes.email), ''), v_email)));
  END IF;
  RETURN jsonb_build_object('acao', 'nada', 'antes', jsonb_build_object('nome', v_antes.nome, 'email', v_antes.email), 'depois', NULL);
END $$;
REVOKE ALL ON FUNCTION public._fn_perfil_garantir(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_perfil_garantir(uuid, text, text) TO service_role;

-- (2) ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._fn_perfil_garantir(NEW.id, NEW.raw_user_meta_data->>'nome', NEW.email);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- (4) ---------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acessos_perfil_01_backfill (
  user_id uuid PRIMARY KEY,
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  nome_do_email boolean NOT NULL,
  feito_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.acessos_perfil_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acessos_perfil_01_backfill FROM PUBLIC, anon, authenticated;

DO $backfill$
DECLARE
  r record;
  v_nome text;
  v_do_email boolean;
  v_res jsonb;
BEGIN
  FOR r IN
    SELECT DISTINCT u.id, u.email, nullif(btrim(u.raw_user_meta_data->>'nome'), '') AS meta_nome
      FROM public.cliente_membros m
      JOIN auth.users u ON u.id = m.user_id
     ORDER BY u.id
  LOOP
    v_do_email := r.meta_nome IS NULL;
    v_nome := coalesce(r.meta_nome, nullif(split_part(r.email, '@', 1), ''));
    v_res := public._fn_perfil_garantir(r.id, v_nome, r.email);
    IF v_res->>'acao' <> 'nada' THEN
      INSERT INTO public.acessos_perfil_01_backfill (user_id, acao, antes, depois, nome_do_email)
      VALUES (r.id, v_res->>'acao', v_res->'antes', v_res->'depois',
              v_do_email AND (v_res->'depois'->>'nome') IS NOT DISTINCT FROM v_nome
                         AND nullif(btrim(v_res->'antes'->>'nome'), '') IS NULL)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.cliente_membros m JOIN auth.users u ON u.id = m.user_id
              LEFT JOIN public.profiles p ON p.user_id = m.user_id
              WHERE p.user_id IS NULL OR nullif(btrim(p.nome), '') IS NULL OR nullif(btrim(p.email), '') IS NULL) THEN
    RAISE EXCEPTION 'ACESSOS-PERFIL-01: sobrou membro com login sem nome ou sem e-mail no perfil';
  END IF;
END $backfill$;

-- (5) ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_nome_do_usuario(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_user_id IS NULL THEN NULL ELSE coalesce(
    (SELECT nullif(btrim(p.nome), '') FROM public.profiles p WHERE p.user_id = p_user_id),
    (SELECT nullif(btrim(p.email), '') FROM public.profiles p WHERE p.user_id = p_user_id),
    (SELECT nullif(btrim(u.email), '') FROM auth.users u WHERE u.id = p_user_id),
    'usuário removido (' || left(p_user_id::text, 8) || ')') END
$$;
REVOKE ALL ON FUNCTION public._fn_nome_do_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_nome_do_usuario(uuid) TO service_role;

DO $resolver$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.resolver_nome_usuario(uuid)'::regprocedure))
     <> '4864bed5578af008154d81544cefbd5e' THEN
    RAISE EXCEPTION 'ACESSOS-PERFIL-01: resolver_nome_usuario fora do md5 de origem';
  END IF;
END $resolver$;
CREATE OR REPLACE FUNCTION public.resolver_nome_usuario(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(public._fn_nome_do_usuario(p_user_id), '(sem nome)');
$$;
REVOKE ALL ON FUNCTION public.resolver_nome_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_nome_usuario(uuid) TO service_role;

-- (6) ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_nomes_dos_autores(p_cliente_id uuid, p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (user_id uuid, nome text, email text, situacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este cliente' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH pedidos AS (
    SELECT DISTINCT x AS id FROM unnest(p_ids) AS x WHERE p_ids IS NOT NULL AND x IS NOT NULL
    UNION
    SELECT DISTINCT m.user_id FROM public.cliente_membros m
     WHERE p_ids IS NULL AND m.cliente_id = p_cliente_id AND m.ativo
  ),
  permitidos AS (
    SELECT q.id FROM pedidos q
     WHERE p_ids IS NULL
        OR EXISTS (SELECT 1 FROM public.cliente_membros m WHERE m.user_id = q.id AND m.cliente_id = p_cliente_id)
        OR public.is_admin_agroinblue(q.id)
        OR EXISTS (SELECT 1 FROM public.audit_log a WHERE a.usuario_id = q.id AND a.cliente_id = p_cliente_id)
        OR EXISTS (SELECT 1 FROM public.conciliacao_audit_log c WHERE c.actor_user_id = q.id AND c.cliente_id = p_cliente_id)
        OR EXISTS (SELECT 1 FROM public.zoo_operacao_eventos e WHERE e.usuario_id = q.id AND e.cliente_id = p_cliente_id)
        OR EXISTS (SELECT 1 FROM public.audit_log_movimentacoes am WHERE am.usuario_id = q.id AND am.cliente_id = p_cliente_id)
        OR EXISTS (SELECT 1 FROM public.fechamento_reaberturas_log fr WHERE fr.reaberto_por = q.id AND fr.cliente_id = p_cliente_id)
        OR EXISTS (SELECT 1 FROM public.financeiro_saldos_audit fs WHERE fs.usuario_id = q.id AND fs.cliente_id = p_cliente_id)
        OR EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.cliente_id = p_cliente_id
                    AND (l.created_by = q.id OR l.updated_by = q.id))
  )
  SELECT q.id,
         public._fn_nome_do_usuario(q.id),
         coalesce((SELECT nullif(btrim(p.email), '') FROM public.profiles p WHERE p.user_id = q.id),
                  (SELECT nullif(btrim(u.email), '') FROM auth.users u WHERE u.id = q.id)),
         CASE
           WHEN NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = q.id) THEN 'removido'
           WHEN public.is_admin_agroinblue(q.id) THEN 'consultor'
           WHEN EXISTS (SELECT 1 FROM public.cliente_membros m WHERE m.user_id = q.id AND m.cliente_id = p_cliente_id AND m.ativo)
             THEN 'membro ativo'
           ELSE 'ex-membro'
         END
    FROM permitidos q;
END $$;
REVOKE ALL ON FUNCTION public.fn_nomes_dos_autores(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nomes_dos_autores(uuid, uuid[]) TO authenticated, service_role;

-- (7) ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_membro_editar(
  p_autor uuid, p_membro_id uuid, p_nome text, p_email text, p_perfil text, p_fazenda_ids uuid[], p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m        public.cliente_membros%ROWTYPE;
  v_nome     text := nullif(btrim(p_nome), '');
  v_email    text := nullif(lower(btrim(p_email)), '');
  v_fazendas uuid[] := coalesce((SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_fazenda_ids) x WHERE x IS NOT NULL), '{}');
  v_login    text;
  v_antes    jsonb;
  v_depois   jsonb;
  v_ret      jsonb;
  v_papel    text;
BEGIN
  IF p_autor IS NULL OR NOT public.is_admin_agroinblue(p_autor) THEN
    RAISE EXCEPTION 'Só o administrador do AGROinBLUE gerencia acessos por enquanto.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.cliente_membros WHERE id = p_membro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso não encontrado: recarregue a lista.' USING ERRCODE = 'P0001'; END IF;
  IF v_m.user_id = p_autor THEN
    RAISE EXCEPTION 'Ninguém altera o próprio acesso por esta tela.' USING ERRCODE = '42501';
  END IF;
  IF v_m.perfil = 'admin_agroinblue' OR public.is_admin_agroinblue(v_m.user_id) THEN
    RAISE EXCEPTION 'Administrador do AGROinBLUE não é gerenciado por esta tela.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Informe o nome.' USING ERRCODE = 'P0001'; END IF;
  IF v_email IS NULL OR v_email !~ '^\S+@\S+\.\S+$' THEN RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = 'P0001'; END IF;
  IF p_perfil IS NULL OR p_perfil NOT IN ('gestor_cliente', 'financeiro', 'campo', 'leitura') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(v_fazendas) = 0 THEN RAISE EXCEPTION 'Marque ao menos uma fazenda.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_fazendas) x LEFT JOIN public.fazendas f ON f.id = x AND f.cliente_id = v_m.cliente_id
              WHERE f.id IS NULL) THEN
    RAISE EXCEPTION 'Fazenda de outro cliente na lista: recarregue a tela.' USING ERRCODE = 'P0001';
  END IF;
  SELECT lower(u.email) INTO v_login FROM auth.users u WHERE u.id = v_m.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este acesso não tem login (usuário removido).' USING ERRCODE = 'P0001'; END IF;
  IF v_email IS DISTINCT FROM v_login
     AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email AND u.id <> v_m.user_id) THEN
    RAISE EXCEPTION 'Este e-mail já é login de outra pessoa.' USING ERRCODE = 'P0001';
  END IF;

  v_antes := jsonb_build_object(
    'nome', (SELECT p.nome FROM public.profiles p WHERE p.user_id = v_m.user_id),
    'email', coalesce((SELECT p.email FROM public.profiles p WHERE p.user_id = v_m.user_id), v_login),
    'perfil', v_m.perfil,
    'fazendas', coalesce((SELECT jsonb_agg(fm.fazenda_id ORDER BY fm.fazenda_id) FROM public.fazenda_membros fm
                            JOIN public.fazendas f ON f.id = fm.fazenda_id AND f.cliente_id = v_m.cliente_id
                           WHERE fm.user_id = v_m.user_id), '[]'::jsonb));
  v_depois := jsonb_build_object('nome', v_nome, 'email', v_email, 'perfil', p_perfil, 'fazendas', to_jsonb(v_fazendas));
  v_ret := jsonb_build_object(
    'membro_id', v_m.id, 'user_id', v_m.user_id, 'cliente_id', v_m.cliente_id, 'antes', v_antes, 'depois', v_depois,
    'mudou', jsonb_build_object(
      'nome', (v_antes->>'nome') IS DISTINCT FROM v_nome,
      'email', v_login IS DISTINCT FROM v_email OR lower(v_antes->>'email') IS DISTINCT FROM v_email,
      'login', v_login IS DISTINCT FROM v_email,
      'perfil', v_m.perfil IS DISTINCT FROM p_perfil,
      'fazendas', (v_antes->'fazendas') IS DISTINCT FROM v_depois->'fazendas'));

  BEGIN
    INSERT INTO public.profiles (user_id, nome, email) VALUES (v_m.user_id, v_nome, v_email)
      ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email, updated_at = now();
    UPDATE public.cliente_membros SET perfil = p_perfil WHERE id = v_m.id;
    v_papel := CASE p_perfil WHEN 'gestor_cliente' THEN 'gerente' WHEN 'campo' THEN 'capataz' ELSE 'membro' END;
    DELETE FROM public.fazenda_membros fm
     USING public.fazendas f
     WHERE fm.fazenda_id = f.id AND f.cliente_id = v_m.cliente_id AND fm.user_id = v_m.user_id;
    INSERT INTO public.fazenda_membros (fazenda_id, user_id, papel)
      SELECT x, v_m.user_id, v_papel FROM unnest(v_fazendas) x;
    INSERT INTO public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                  dados_anteriores, dados_novos)
    VALUES (v_m.cliente_id, p_autor, 'acessos', 'editar_acesso', 'cliente_membros', v_m.id,
            'Acesso editado: ' || v_nome, v_antes, v_depois);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'MESIM'; END IF;
  EXCEPTION WHEN sqlstate 'MESIM' THEN
    RETURN v_ret || jsonb_build_object('simulado', true);
  END;
  RETURN v_ret || jsonb_build_object('simulado', false);
END $$;
REVOKE ALL ON FUNCTION public._fn_membro_editar(uuid, uuid, text, text, text, uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_membro_editar(uuid, uuid, text, text, text, uuid[], boolean) TO service_role;
