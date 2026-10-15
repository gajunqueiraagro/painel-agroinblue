-- OC-DOC-SAIDA-FAZENDA-01 (7f) — os documentos da saida da fazenda. Termina em RAISE 'OK'. Compara com `is distinct from`.
--   S1 a regra nos 3 tipos (abate so' NF; venda tudo menos gta/guia/declaracao; compra tudo), o CHECK e a ACL
--   S2 registrar (Teste, sintetico): nf_produtor so' no abate; gta/guia/declaracao no abate e na venda, recusados na compra
--   S3 os 17 documentos convertidos (3 nf_produtor, 9 guia, 5 gta) e os 3 componentes informativos
--   S4 o total documentado das 9 OCs = o medido no ensaio de 15/10
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; x jsonb; t text; oa uuid; ov uuid; oc uuid; e text; tot text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- S1
  if public._oc_documento_soma_no_valor('abate', 'nf_produtor') or public._oc_documento_soma_no_valor('abate', 'gta')
     or not public._oc_documento_soma_no_valor('abate', 'nf_principal')
     or public._oc_documento_soma_no_valor('venda', 'gta') or public._oc_documento_soma_no_valor('venda', 'guia')
     or public._oc_documento_soma_no_valor('venda', 'declaracao')
     or not public._oc_documento_soma_no_valor('venda', 'nf_principal') or not public._oc_documento_soma_no_valor('venda', 'outro')
     or not public._oc_documento_soma_no_valor('compra', 'nf_principal') or not public._oc_documento_soma_no_valor('compra', 'outro') then
    raise exception 'S1 regra'; end if;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'zoo_operacao_documentos_especie_check')) not like '%declaracao%'
     or has_function_privilege('anon', 'public._oc_documento_soma_no_valor(text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public._oc_documento_soma_no_valor(text, text)', 'EXECUTE')
     or (select md5(prosrc) from pg_proc where proname = 'oc_documento_registrar' and pronamespace = 'public'::regnamespace)
          is distinct from 'f3e2d13d8a0ced0cac40cedcaf76c40d' then
    raise exception 'S1 esquema'; end if;

  -- S2
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  x := public.oc_salvar_rascunho(null, k, null, jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'abate'));
  oa := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_rascunho(null, k, null, jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'venda'));
  ov := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_rascunho(null, k, null, jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'compra'));
  oc := (x->>'operacao_id')::uuid;
  foreach e in array array['nf_produtor', 'gta', 'guia', 'declaracao'] loop
    x := public.oc_documento_registrar(oa, k, jsonb_build_object('especie', e, 'numero', 'S2'));
  end loop;
  foreach e in array array['gta', 'guia', 'declaracao'] loop
    x := public.oc_documento_registrar(ov, k, jsonb_build_object('especie', e, 'numero', 'S2'));
  end loop;
  if (select count(*) from zoo_operacao_documentos where operacao_id = oa) is distinct from 4::bigint
     or (select count(*) from zoo_operacao_documentos where operacao_id = ov) is distinct from 3::bigint then
    raise exception 'S2 aceitos'; end if;
  t := null;
  begin perform public.oc_documento_registrar(ov, k, '{"especie": "nf_produtor"}'); exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Especie nf_produtor so existe no abate' then raise exception 'S2 nf_produtor na venda: %', t; end if;
  t := null;
  begin perform public.oc_documento_registrar(oc, k, '{"especie": "nf_produtor"}'); exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Especie nf_produtor so existe no abate' then raise exception 'S2 nf_produtor na compra: %', t; end if;
  foreach e in array array['gta', 'guia', 'declaracao'] loop
    t := null;
    begin perform public.oc_documento_registrar(oc, k, jsonb_build_object('especie', e)); exception when sqlstate 'P0001' then t := sqlerrm; end;
    if t is distinct from format('Especie %s so existe no abate e na venda', e) then raise exception 'S2 % na compra: %', e, t; end if;
  end loop;
  /* na venda a guia registrada com valor informativo nao soma no total da OC */
  x := public.oc_documento_registrar(ov, k, jsonb_build_object('especie', 'guia', 'numero', 'S2-valor', 'componentes',
         jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'informativo', 'valor', 377.85, 'ordem', 1))));
  if (select sum(valor_liquido) from vw_oc_documentos where operacao_id = ov) is distinct from 0::numeric then
    raise exception 'S2 a guia somou na venda'; end if;

  -- S3
  if (select string_agg(especie || ':' || n, ' ' order by especie) from (select especie, count(*) n from zoo_operacao_documentos
        where id in ('f7bd1855-e785-436c-998b-c1af6347563b', 'da5768b7-838b-45b8-aa5c-333d009275f2', '2466d8d2-6fd2-4a90-a88e-9b71dd5e51a9',
          '6c93850c-8ada-47b5-9ddd-1d4b70283e90', '7c42d801-2992-48e2-a6b5-f2aa2f0717bc', '15c6a4f9-42a4-4e71-8bb0-03e808b3075f',
          'ebf3fce8-4593-45a7-a479-9f711fdc576b', '259cb004-23f8-4ce2-b640-cc24f972d8ff', 'd03ded12-3a8b-4409-bef1-182697681cfe',
          '4f53e340-16da-4404-8b64-68949ac40eec', '1912022b-7981-4a13-83a8-0a7624febe62', '9de3f142-8f07-48fb-8899-0ede0e824bb1',
          '8824aa2a-9e32-4240-b08c-2d46f942c003', '43a5ce9e-90f7-451a-a28b-550e2e4f63eb', 'e0a2f381-7cd9-4916-8648-77635297a530',
          '2de539f9-6d46-4322-8c2a-f98818f4b1af', '7a8098bf-f0bb-46db-8c0f-4a4dd2fb1d9f') and not cancelado group by 1) a)
       is distinct from 'gta:5 guia:9 nf_produtor:3' then raise exception 'S3 especies'; end if;
  if (select count(*) from zoo_operacao_documento_componentes where natureza = 'informativo' and not cancelado and id in
       ('df80f114-11fd-4104-b62b-f316eefe720d', '6980755f-4e9a-4da8-ac3d-27a7512b02b5', 'af9448c0-80da-42d0-ac08-661c2009316d'))
       is distinct from 3::bigint then raise exception 'S3 componentes'; end if;

  -- S4
  select string_agg(left(operacao_id::text, 8) || '=' || total, ' ' order by operacao_id) into tot
    from (select operacao_id, sum(valor_liquido) total from vw_oc_documentos where not cancelado group by 1) q
   where left(operacao_id::text, 8) in ('02be1a41', '26967535', '2d39d7e9', '581d075c', '6336c7fc', '7f7de76f', '8dcafa8e', '96776ccb', 'b58bf556');
  if tot is distinct from '02be1a41=367783.40 26967535=110500 2d39d7e9=103006.06 581d075c=-42235 6336c7fc=147380.11 7f7de76f=171529.6 8dcafa8e=161313.6 96776ccb=265639.15 b58bf556=343059.2' then
    raise exception 'S4 total documentado: %', tot; end if;

  raise exception 'OK OC-DOC-SAIDA-FAZENDA-01: S1-S4';
end $teste$;
ROLLBACK;
