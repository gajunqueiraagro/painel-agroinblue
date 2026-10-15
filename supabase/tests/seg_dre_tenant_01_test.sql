-- SEG-DRE-TENANT-01 — guarda de cliente nas 7 leituras SECURITY DEFINER da familia do DRE. Termina em RAISE 'OK'.
-- Compara com `is distinct from`. So' leitura (transacao revertida).
--   T1 esquema: os 7 corpos no md5 de destino, SECURITY DEFINER, `anon` sem EXECUTE, `authenticated` com; a interna fechada
--   T2 usuario do NJ (nj@agroinblue.app, gestor so' do NJ) no NJ: as 7 respondem, e o resultado = o do admin (a guarda nao muda nada)
--   T3 o mesmo usuario com a Vera e com o Agnaldo: 42501 nas 7 (inclusive `fn_painel_safra_entrega`, direta)
--   T4 sem usuario (JWT sem `sub`): 42501 nas 7
--   T5 admin: responde para a Vera e o Agnaldo
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('ensaio.sql', ARRAY[
  'select md5(public.fn_dre_pecuaria($1,''2025-01'',''2025-03'',''realizado'')::text)',
  'select md5(public.fn_dre_pecuaria_lancamentos($1,null,''venda'',null,''2025-01'',''2025-12'',''realizado'')::text)',
  'select md5(public.fn_dre_pecuaria_patrimonio($1,null,''2025-01'',''2025-12'')::text)',
  'select md5(public.fn_painel_rateio_detalhe($1,null,null,''admin'',null,''pecuaria'',''2025-01'',''2025-12'',''realizado'')::text)',
  'select md5(public.fn_painel_safra($1,$2,''mandioca'')::text)',
  'select md5(public.fn_painel_safra_comparativo($1,''mandioca'')::text)',
  'select md5(public.fn_painel_safra_entrega($1,$2,''mandioca'')::text)']::text, true);
SET LOCAL role authenticated;
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  c_agn constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2'; c_safra constant uuid := '55d99920-add0-4091-b1a7-0b0ce3faaedb';
  c_user_nj constant text := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; c_admin constant text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  q text[] := current_setting('ensaio.sql')::text[];
  i int; m text; m_adm text; e text; cli uuid;
begin
  -- T1
  if (select string_agg(p.proname || '=' || md5(p.prosrc), ',' order by p.proname) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_dre_pecuaria', 'fn_dre_pecuaria_lancamentos',
         'fn_dre_pecuaria_patrimonio', 'fn_painel_rateio_detalhe', 'fn_painel_safra', 'fn_painel_safra_comparativo', 'fn_painel_safra_entrega'))
     is distinct from 'fn_dre_pecuaria=d4f982af74f7dae403498d23aa185924,fn_dre_pecuaria_lancamentos=d4576910af99981e618c3d98fdd6524f,'
       || 'fn_dre_pecuaria_patrimonio=68558df0a488a2e28e64df1179574a62,fn_painel_rateio_detalhe=f6bda7a801d1c9e2f37e92922b1ed84a,'
       || 'fn_painel_safra=2b8d8149ed1dbf6ed9e455b3344e135f,fn_painel_safra_comparativo=c5abd2eacc56a7182abb3bd127efb9fd,'
       || 'fn_painel_safra_entrega=c16e9283563959ebc4ad0ceae8461663'
     or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_dre_pecuaria',
          'fn_dre_pecuaria_lancamentos', 'fn_dre_pecuaria_patrimonio', 'fn_painel_rateio_detalhe', 'fn_painel_safra',
          'fn_painel_safra_comparativo', 'fn_painel_safra_entrega')
          and (not p.prosecdef or has_function_privilege('anon', p.oid, 'EXECUTE') or not has_function_privilege('authenticated', p.oid, 'EXECUTE')))
     or has_function_privilege('authenticated', 'public._fn_exigir_tenant(uuid)', 'EXECUTE') then
    raise exception 'T1 esquema'; end if;

  for i in 1 .. array_length(q, 1) loop
    -- T2 o usuario do NJ no NJ = o admin no NJ
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    execute q[i] into m_adm using c_nj, c_safra;
    perform set_config('request.jwt.claims', json_build_object('sub', c_user_nj, 'role', 'authenticated')::text, true);
    execute q[i] into m using c_nj, c_safra;
    if m is null or m is distinct from m_adm then raise exception 'T2 chamada %: % x admin %', i, m, m_adm; end if;
    -- T3 o usuario do NJ com outro cliente
    foreach cli in array array[c_vera, c_agn] loop
      e := null;
      begin execute q[i] into m using cli, c_safra; exception when others then e := sqlstate; end;
      if e is distinct from '42501' then raise exception 'T3 chamada % cliente %: %', i, cli, coalesce(e, 'respondeu'); end if;
    end loop;
    -- T4 sem usuario
    perform set_config('request.jwt.claims', '{}', true);   -- sem `sub`: auth.uid() nulo
    e := null;
    begin execute q[i] into m using c_nj, c_safra; exception when others then e := sqlstate; end;
    if e is distinct from '42501' then raise exception 'T4 chamada %: %', i, coalesce(e, 'respondeu'); end if;
    -- T5 admin em outro cliente
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    foreach cli in array array[c_vera, c_agn] loop
      e := null;   -- responde (o valor pode ser nulo: a entrega de quem nao tem colheita na safra e' nula)
      begin execute q[i] into m using cli, c_safra; exception when others then e := sqlstate; end;
      if e is not null then raise exception 'T5 chamada % cliente %: %', i, cli, e; end if;
    end loop;
  end loop;

  raise exception 'OK SEG-DRE-TENANT-01: T1-T5';
end $teste$;
ROLLBACK;
