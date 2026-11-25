-- PERFIL-PROPRIETARIO-MULTI-01 — lote 118820 (Code 4; Gabriel 25/11 16:35, REGRA DE PRODUTO para todos os clientes).
-- O D-P1 muda: um cliente pode ter MAIS DE UM Proprietário (ex.: Santa Rita = Tito e Rita).
--   1. sai o índice único `cliente_membros_um_proprietario` (118790);
--   2. sai do `_fn_membro_editar` a recusa "Este cliente já tem um Proprietário";
--   3. quem edita um acesso (e dá o perfil Proprietário): o admin do AGROinBLUE OU um Proprietário ATIVO do MESMO cliente do membro.
--      O resto da função fica igual: ninguém altera o próprio acesso; admin do AGROinBLUE não é editado por esta via.
-- O que o Proprietário já faz pelo 118790 (aprovar pagamentos, conectar o Open Finance, o fiscal) não muda.
-- ⚠ PATCH GUARDADO POR MD5: o corpo de hoje tem de ser o do 118790 (25bd7882…); cada trecho casa exatamente 1 vez.
set local lock_timeout = '2s';

drop index if exists public.cliente_membros_um_proprietario;

do $patch$
declare
  c_fn constant regprocedure := 'public._fn_membro_editar(uuid, uuid, text, text, text, uuid[], boolean)'::regprocedure;
  c_md5 constant text := '25bd7882567737526376db4b35df3a48';
  v_def text; v_md5 text; v_n int; r record; v_acl text; v_cfg text;
begin
  select md5(prosrc), pg_get_functiondef(oid), proacl::text, proconfig::text into v_md5, v_def, v_acl, v_cfg from pg_proc where oid = c_fn;
  if v_md5 is distinct from c_md5 then
    raise exception 'PERFIL-PROPRIETARIO-MULTI-01: _fn_membro_editar mudou desde a conferência (md5 %, esperava %)', v_md5, c_md5; end if;
  for r in select * from (values
    -- 3. quem gerencia: o admin ou um Proprietário ativo do cliente do membro (lido o membro antes; sem membro, recusa igual)
    ($$  IF p_autor IS NULL OR NOT public.is_admin_agroinblue(p_autor) THEN
    RAISE EXCEPTION 'Só o administrador do AGROinBLUE gerencia acessos por enquanto.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.cliente_membros WHERE id = p_membro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso não encontrado: recarregue a lista.' USING ERRCODE = 'P0001'; END IF;$$,
     $$  IF p_autor IS NULL THEN
    RAISE EXCEPTION 'Só o administrador do AGROinBLUE ou um Proprietário do cliente gerencia acessos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.cliente_membros WHERE id = p_membro_id;
  /* PERFIL-PROPRIETARIO-MULTI-01: o admin OU um Proprietário ATIVO do MESMO cliente do membro */
  IF NOT (public.is_admin_agroinblue(p_autor)
          OR (FOUND AND EXISTS (SELECT 1 FROM public.cliente_membros a WHERE a.user_id = p_autor AND a.cliente_id = v_m.cliente_id
                                                                        AND a.ativo AND a.perfil = 'proprietario'))) THEN
    RAISE EXCEPTION 'Só o administrador do AGROinBLUE ou um Proprietário do cliente gerencia acessos.' USING ERRCODE = '42501';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso não encontrado: recarregue a lista.' USING ERRCODE = 'P0001'; END IF;$$),
    -- 2. sem a recusa do segundo Proprietário
    ($$  IF p_perfil = 'proprietario' AND EXISTS (SELECT 1 FROM public.cliente_membros o WHERE o.cliente_id = v_m.cliente_id
                                                 AND o.id <> v_m.id AND o.ativo AND o.perfil = 'proprietario') THEN
    RAISE EXCEPTION 'Este cliente já tem um Proprietário: troque o perfil dele antes.' USING ERRCODE = 'P0001';
  END IF;
$$, '')
  ) x(de, para) loop
    v_n := (length(v_def) - length(replace(v_def, r.de, ''))) / length(r.de);
    if v_n <> 1 then raise exception 'PERFIL-PROPRIETARIO-MULTI-01: o trecho "%" casa % vez(es), esperava 1', left(r.de, 60), v_n; end if;
    v_def := replace(v_def, r.de, r.para);
  end loop;
  execute v_def;
  if (select md5(prosrc) from pg_proc where oid = c_fn) = c_md5 then raise exception 'PERFIL-PROPRIETARIO-MULTI-01: o corpo não mudou'; end if;
  if (select proacl::text from pg_proc where oid = c_fn) is distinct from v_acl or (select proconfig::text from pg_proc where oid = c_fn) is distinct from v_cfg then
    raise exception 'PERFIL-PROPRIETARIO-MULTI-01: a ACL ou a configuração da função mudou'; end if;
  if (select prosrc from pg_proc where oid = c_fn) like '%já tem um Proprietário%' then raise exception 'PERFIL-PROPRIETARIO-MULTI-01: a recusa ficou'; end if;
end $patch$;
