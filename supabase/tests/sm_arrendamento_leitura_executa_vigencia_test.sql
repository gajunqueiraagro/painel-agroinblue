-- SM-ARRENDAMENTO-ENCERRAR-01 — o papel do canal de leitura (`supabase_read_only_user`) lê a `vw_zoot_fazenda_mensal` e segue SEM escrita.
-- Roda como `postgres`, DEPOIS da migration 20261028115140, e TERMINA EM RAISE: nada fica no banco. Sucesso = a exceção final começa
-- com "OK". O `postgres` do Supabase não pode assumir esse papel (SET ROLE recusado), então a prova aqui é pelo CATÁLOGO; a prova viva
-- é o próprio canal de leitura lendo a view depois de aplicar (registrada no histórico, 30/10/2026).
-- L1 o papel de leitura tem EXECUTE na `fn_pasto_vigente_no_mes`; os outros papéis de leitura que não estavam no OK (pg_read_all_data,
--    supabase_etl_admin) e o anon continuam SEM — o GRANT foi só para ele.
-- L2 o papel lê a view e as tabelas por baixo dela (SELECT na view, em `pastos` e nas 5 fontes da `vw_zoot_categoria_mensal`).
-- L3 o papel segue sem escrita: sem INSERT/UPDATE/DELETE/TRUNCATE em `pastos`, `financeiro_lancamentos_v2` e `lancamentos`.
DO $teste$
declare
  c_fn constant text := 'public.fn_pasto_vigente_no_mes(boolean, date, date, text)';
  c_papel constant text := 'supabase_read_only_user';
  t text; p text;
begin
  -- L1
  if not has_function_privilege(c_papel, c_fn, 'execute') then raise exception 'L1 o papel de leitura não tem EXECUTE'; end if;
  if has_function_privilege('pg_read_all_data', c_fn, 'execute') or has_function_privilege('supabase_etl_admin', c_fn, 'execute')
     or has_function_privilege('anon', c_fn, 'execute') then
    raise exception 'L1 o EXECUTE foi além do papel de leitura';
  end if;

  -- L2
  foreach t in array array['public.vw_zoot_fazenda_mensal', 'public.vw_zoot_categoria_mensal', 'public.pastos', 'public.lancamentos',
                           'public.saldos_iniciais', 'public.categorias_rebanho', 'public.fechamento_pastos', 'public.fechamento_pasto_itens'] loop
    if not has_table_privilege(c_papel, t, 'select') then raise exception 'L2 o papel de leitura não lê %', t; end if;
  end loop;

  -- L3
  foreach t in array array['public.pastos', 'public.financeiro_lancamentos_v2', 'public.lancamentos'] loop
    foreach p in array array['insert', 'update', 'delete', 'truncate'] loop
      if has_table_privilege(c_papel, t, p) then raise exception 'L3 o papel de leitura tem % em %', p, t; end if;
    end loop;
  end loop;

  raise exception 'OK SM-ARRENDAMENTO-ENCERRAR-01 leitura: L1–L3';
end
$teste$;
