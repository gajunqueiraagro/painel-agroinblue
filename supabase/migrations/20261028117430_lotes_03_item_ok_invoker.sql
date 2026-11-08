-- LOTES-03 F1 (Gabriel 07/11/2026) — `_fn_lote_item_ok` é INTERNA: só as RPCs SECURITY DEFINER do lote a chamam, e elas já guardam o tenant
-- (`_fn_exigir_tenant_das_linhas`). Na 117410 ela nasceu SECURITY DEFINER com `p_cliente` e sem guarda no corpo; no banco já estava sem
-- EXECUTE para authenticated/anon, mas a regra é que a interna não seja exposta pelo texto (guardaDeClienteNasMigrations, o molde da PATR-01 116070).
-- Passa a SECURITY INVOKER (dentro das RPCs roda com o dono delas) e o EXECUTE sai também de authenticated. Corpo igual ao da 117410.
set local lock_timeout = '2s';

create or replace function public._fn_lote_item_ok(p_item uuid, p_tipo text, p_cliente uuid, p_vivo boolean)
returns boolean language sql stable security invoker set search_path to 'pg_catalog', 'public' as $$
  select p_item is null or exists (select 1 from public.rebanho_lote_cadastros c
                                    where c.id = p_item and c.tipo = p_tipo and c.cliente_id = p_cliente and (c.ativo or not p_vivo))
$$;
revoke all on function public._fn_lote_item_ok(uuid, text, uuid, boolean) from public, anon, authenticated;
