-- ACESSOS-SEM-LOGIN-TEXTO (Gabriel 24/11, decisão (A) da FASE 0 "usuário removido" nos Acessos da Vera): quem tem VÍNCULO ATIVO num cliente
-- mas não tem usuário no Auth deste ambiente (o proto é cópia da produção sem os logins: o 2290944b é o Gabriel da produção) aparece como
-- "sem login neste ambiente (id)" — NUNCA "usuário removido". "usuário removido (id)" fica só para quem não tem login E não tem vínculo
-- ativo em cliente nenhum (o autor antigo de uma trilha). A regra de leitura é a mesma: perfil (nome) → e-mail do perfil → e-mail do Auth.
-- Só muda o último texto de `_fn_nome_do_usuario` (a fonte de `fn_nomes_dos_autores` e de `resolver_nome_usuario`). Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if md5(pg_get_functiondef('public._fn_nome_do_usuario(uuid)'::regprocedure)) <> '845defd422b440863f7c5a223699db36' then
    raise exception 'ACESSOS-SEM-LOGIN-TEXTO: o corpo de _fn_nome_do_usuario não é o esperado: conferir.';
  end if;
end $$;

create or replace function public._fn_nome_do_usuario(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p_user_id is null then null else coalesce(
    (select nullif(btrim(p.nome), '') from public.profiles p where p.user_id = p_user_id),
    (select nullif(btrim(p.email), '') from public.profiles p where p.user_id = p_user_id),
    (select nullif(btrim(u.email), '') from auth.users u where u.id = p_user_id),
    case when exists (select 1 from public.cliente_membros m where m.user_id = p_user_id and m.ativo)
         then 'sem login neste ambiente (' || left(p_user_id::text, 8) || ')'
         else 'usuário removido (' || left(p_user_id::text, 8) || ')' end) end
$$;
