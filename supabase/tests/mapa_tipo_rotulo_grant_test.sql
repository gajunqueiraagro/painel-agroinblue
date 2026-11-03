-- MAPA-TIPO-ROTULO-GRANT-01 · teste da 117140, como `authenticated` (claims de um membro real do cliente Teste 43f32d07), numa query só,
-- terminando em RAISE 'OK…' (nada fica). Gravação DIRETA na fazenda_geometrias (o caminho que o CHECK derrubava):
--   T1 UPDATE de nome · T2 INSERT de polígono · T3 o "Atualizar mapa" (`fn_mapa_fazenda_substituir`, SECURITY INVOKER) · T4 anon segue sem.
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_membro uuid; v_geo uuid; n int; r jsonb;
  quadrado constant jsonb := '{"type":"Polygon","coordinates":[[[-48.50,-15.95],[-48.49,-15.95],[-48.49,-15.94],[-48.50,-15.94],[-48.50,-15.95]]]}';
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  select g.id into strict v_geo from public.fazenda_geometrias g where g.fazenda_id = v_faz order by g.nome_original limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.fazenda_geometrias set nome_original = nome_original || ' (T1)' where id = v_geo;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 UPDATE não gravou (% linhas)', n; end if;

  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson) values (v_faz, c_cli, 'outra', 'TESTE-GRANT T2', quadrado);

  r := public.fn_mapa_fazenda_substituir(v_faz, jsonb_build_array(jsonb_build_object('nome_original', 'TESTE-GRANT T3', 'tipo', 'outra', 'geojson', quadrado)));
  if not exists (select 1 from public.fazenda_geometrias where fazenda_id = v_faz and nome_original = 'TESTE-GRANT T3') then raise exception 'T3 substituir: %', r; end if;

  execute 'reset role';
  if has_function_privilege('anon', 'public._fn_mapa_tipo_rotulo(text)', 'execute') or has_function_privilege('anon', 'public._fn_mapa_tipos_de_area()', 'execute') then
    raise exception 'T4 anon executa';
  end if;
  raise exception 'OK MAPA-TIPO-ROTULO-GRANT-01 117140: T1–T4 (UPDATE, INSERT e Atualizar mapa como authenticated; anon fechado)';
end $$;
