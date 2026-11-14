-- NOTAS-RECEITA-A1-01 · F2 — a guarda que faltou na `fn_fiscal_certificado_recusa_registrar` (113320): o teste da guarda de cliente nas
-- migrations (SEG-AGRI-TENANT-01) pede guarda também na SECURITY DEFINER que recebe só o id. Ela já era só service_role e a borda só a
-- chama DEPOIS de conferir quem pode; agora o banco confere de novo o AUTOR (admin AgroinBlue ou gestor DAQUELE cliente — D2), como a
-- `fn_fiscal_certificado_registrar`. Mesmo corpo, mais a guarda (42501). Nada mais muda.
set local lock_timeout = '2s';

create or replace function public.fn_fiscal_certificado_recusa_registrar(p_titular_id uuid, p_autor uuid, p_recusa text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.fiscal_titulares;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then return; end if;
  if p_autor is null or not (coalesce(public.is_admin_agroinblue(p_autor), false)
                             or coalesce(public.get_user_perfil(p_autor, t.cliente_id)::text = 'gestor_cliente', false)) then
    raise exception using errcode = '42501', message = 'Só o administrador do cliente sobe o certificado.';
  end if;
  insert into public.fiscal_certificados_trilha (cliente_id, titular_id, acao, autor, via, motivo)
  values (t.cliente_id, t.id, 'recusado_upload', p_autor, 'borda:fiscal-certificado-subir', left(coalesce(p_recusa, ''), 200));
end $$;
revoke all on function public.fn_fiscal_certificado_recusa_registrar(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_fiscal_certificado_recusa_registrar(uuid, uuid, text) to service_role;
