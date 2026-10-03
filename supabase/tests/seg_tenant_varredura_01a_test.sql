-- PR-SEG-TENANT-VARREDURA-01A — testes SINTETICOS, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027192400 (ou colado logo depois dela, na mesma transacao):
--   `supabase db query --linked -f supabase/tests/seg_tenant_varredura_01a_test.sql`
--
-- As 8 funcoes de escrita da Conciliacao que recebem id de linha so' atendem quem e' do cliente da linha:
--   fn_vincular_extrato_lancamento, fn_vincular_grupo_conciliacao, fn_desfazer_vinculo_extrato, fn_desfazer_grupo_conciliacao,
--   fn_espelho_casar, fn_espelho_casar_n1, fn_criar_lancamento_de_extrato, fn_reverter_desconsideracao_extrato.
-- Dois clientes reais (X = NJ, Y = Agnaldo), com contas, extratos e lancamentos SINTETICOS em jan/2031. Os usuarios sao
-- membros reais, simulados por `request.jwt.claims` + `SET LOCAL ROLE authenticated` — `cliente_membros` nao e' tocada:
--   ux = gestor so' da NJ · uy = gestor so' do Agnaldo · adm = admin AgroinBlue.
-- D1 travessia: ux com ids de Y -> 42501 "sem acesso a este registro" nas 8 (e na simulacao, que le'); id inexistente e id
--    nulo tambem 42501 (a recusa nao diz se a linha existe); nada escrito em Y.
-- D2 pedido misto: um id de X e um de Y no mesmo pedido (par, array, itens) -> 42501.
-- D3 criar: fazenda, fornecedor, safra e outra conta de OUTRO cliente -> 42501; do proprio cliente, grava.
-- E o caminho de sempre continua: ux em X, uy em Y e o admin em Y gravam; sem usuario, 42501.
set local statement_timeout = '120s';
set local lock_timeout = '3s';

create function pg_temp.conta(p_cli uuid, p_nome text) returns uuid language sql as $f$
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
  values (p_cli, p_nome, p_nome, 'cc', true) returning id $f$;
create function pg_temp.ext(p_cli uuid, p_conta uuid, p_v numeric) returns uuid language sql as $f$
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
  values (p_cli, p_conta, date '2031-01-05', p_v, case when p_v > 0 then 'credito' else 'debito' end, md5(random()::text), 'SINT SEG', 'SINT-' || gen_random_uuid())
  returning id $f$;
/* uma ENTRADA realizada em 05/01/2031 na conta (a direcao e a data casam com os extratos de credito acima) */
create function pg_temp.lan(p_cli uuid, p_conta uuid, p_v numeric) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao,
                                         data_pagamento, data_competencia, data_vencimento, cenario, descricao)
  values (p_cli, p_conta, '1-Entradas', '1', p_v, 'realizado', date '2031-01-05', date '2031-01-05', date '2031-01-05', 'realizado', 'SINT SEG')
  returning id $f$;
create function pg_temp.vin(p_cli uuid, p_e uuid, p_l uuid, p_ap numeric, p_grupo uuid default null) returns void language sql as $f$
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id, tipo_aprovacao)
  values (p_cli, p_e, p_l, p_ap, p_grupo, case when p_grupo is null then 'manual' else 'agrupamento_manual' end) $f$;
create function pg_temp.como(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', case when p_user is null then '{"role":"authenticated"}'
                    else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true) $f$;
/* a chamada, como `authenticated`: 'OK <retorno>' ou 'ERR <sqlstate> <mensagem>' (a escrita de uma chamada recusada se desfaz) */
create function pg_temp.ch(p_sql text) returns text language plpgsql as $f$
declare r text;
begin
  begin
    execute 'set local role authenticated';
    execute 'select (' || p_sql || ')::text' into r;
    execute 'reset role';
    return 'OK ' || coalesce(r, 'null');
  exception when others then
    execute 'reset role';
    return 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
end $f$;

do $t$
declare
  c_x constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_y constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; uy constant uuid := '4b7e4456-113b-45d2-a00a-83b4d1c6380a';
  adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_recusa constant text := 'ERR 42501 sem acesso a este registro';
  cx uuid; cx2 uuid; cy uuid; fx uuid; fy uuid; forn_x uuid; forn_y uuid; safra_y uuid;
  ex1 uuid; ex2 uuid; ex3 uuid; ex4 uuid; ex_ign uuid; lx1 uuid; lx2 uuid; lx3 uuid;
  ey1 uuid; ey2 uuid; ey_conc uuid; ey_g uuid; ey_ign uuid; ey_livre uuid; ly1 uuid; ly_conc uuid; ly_g1 uuid; ly_g2 uuid; gy uuid := gen_random_uuid();
  v_out text := ''; a text; s text; k text; v_foto_y text; v_n int; v_g uuid;
  v_chamadas jsonb;
begin
  -- os usuarios sao o que o teste supoe (senao a prova nao prova)
  if (select count(*) from cliente_membros where user_id = ux and ativo) <> 1
     or not exists (select 1 from cliente_membros where user_id = ux and ativo and cliente_id = c_x and perfil::text <> 'admin_agroinblue')
     or (select count(*) from cliente_membros where user_id = uy and ativo) <> 1
     or not exists (select 1 from cliente_membros where user_id = uy and ativo and cliente_id = c_y and perfil::text <> 'admin_agroinblue')
     or not exists (select 1 from cliente_membros where user_id = adm and ativo and perfil::text = 'admin_agroinblue') then
    raise exception 'montagem: os usuarios de teste nao sao mais (membro so de X, membro so de Y, admin)';
  end if;

  -- ── montagem ──
  cx := pg_temp.conta(c_x, 'SINT SEG X'); cx2 := pg_temp.conta(c_x, 'SINT SEG X2'); cy := pg_temp.conta(c_y, 'SINT SEG Y');
  select id into fx from fazendas where cliente_id = c_x order by created_at, id limit 1;
  select id into fy from fazendas where cliente_id = c_y order by created_at, id limit 1;
  select id into forn_x from financeiro_fornecedores where cliente_id = c_x and ativo order by created_at, id limit 1;
  select id into forn_y from financeiro_fornecedores where cliente_id = c_y and ativo order by created_at, id limit 1;
  select id into safra_y from financeiro_safras where cliente_id = c_y order by id limit 1;
  ex1 := pg_temp.ext(c_x, cx, 100); ex2 := pg_temp.ext(c_x, cx, 200); ex3 := pg_temp.ext(c_x, cx, 50); ex4 := pg_temp.ext(c_x, cx, 60);
  ex_ign := pg_temp.ext(c_x, cx, 10); update extrato_bancario_v2 set status = 'ignorado', ignorado_em = now(), ignorado_motivo = 'sint' where id = ex_ign;
  lx1 := pg_temp.lan(c_x, cx, 100); lx2 := pg_temp.lan(c_x, cx, 120); lx3 := pg_temp.lan(c_x, cx, 80);
  ey1 := pg_temp.ext(c_y, cy, 100); ey2 := pg_temp.ext(c_y, cy, 30); ey_livre := pg_temp.ext(c_y, cy, 55);
  ly1 := pg_temp.lan(c_y, cy, 100);
  ey_conc := pg_temp.ext(c_y, cy, 40); ly_conc := pg_temp.lan(c_y, cy, 40); perform pg_temp.vin(c_y, ey_conc, ly_conc, 40);
  update extrato_bancario_v2 set status = 'conciliado' where id = ey_conc;
  ey_g := pg_temp.ext(c_y, cy, 70); ly_g1 := pg_temp.lan(c_y, cy, 40); ly_g2 := pg_temp.lan(c_y, cy, 30);
  perform pg_temp.vin(c_y, ey_g, ly_g1, 40, gy); perform pg_temp.vin(c_y, ey_g, ly_g2, 30, gy);
  update extrato_bancario_v2 set status = 'conciliado' where id = ey_g;
  ey_ign := pg_temp.ext(c_y, cy, 10); update extrato_bancario_v2 set status = 'ignorado', ignorado_em = now(), ignorado_motivo = 'sint' where id = ey_ign;
  if fx is null or fy is null or forn_x is null or forn_y is null or safra_y is null then raise exception 'montagem: falta cadastro real (fazenda, fornecedor ou safra)'; end if;

  -- a foto de Y: vinculos, status dos extratos e os lancamentos sinteticos
  select md5(coalesce((select string_agg(c.id::text || (c.desfeito_em is null)::text, ',' order by c.id) from conciliacao_bancaria_itens c where c.extrato_id in (select id from extrato_bancario_v2 where conta_bancaria_id = cy)), '')
          || '#' || (select string_agg(e.id::text || e.status || (e.ignorado_em is null)::text, ',' order by e.id) from extrato_bancario_v2 e where e.conta_bancaria_id = cy)
          || '#' || (select count(*)::text || coalesce(string_agg(l.id::text || l.valor::text || l.status_transacao || l.cancelado::text, ',' order by l.id), '') from financeiro_lancamentos_v2 l where l.cliente_id = c_y and (l.conta_destino_id = cy or l.conta_bancaria_id = cy)))
    into v_foto_y;

  -- ── D1: travessia — ux (membro so' de X) com ids de Y ──
  perform pg_temp.como(ux);
  v_chamadas := jsonb_build_object(
    'fn_vincular_extrato_lancamento', format('public.fn_vincular_extrato_lancamento(%L, %L, 100)', ey1, ly1),
    'fn_vincular_grupo_conciliacao', format('public.fn_vincular_grupo_conciliacao(%L, %L::uuid[], %L::numeric[], %L)', ey_g, array[ly_g1, ly_g2], array[40, 30], 't'),
    'fn_desfazer_vinculo_extrato', format('public.fn_desfazer_vinculo_extrato(%L, %L)', ey_conc, 't'),
    'fn_desfazer_grupo_conciliacao', format('public.fn_desfazer_grupo_conciliacao(%L, %L)', gy, 't'),
    'fn_espelho_casar', format('public.fn_espelho_casar(%L, %L::jsonb, false, %L)', ey1, jsonb_build_array(jsonb_build_object('lancamento_id', ly1, 'valor', 100)), 't'),
    'fn_espelho_casar (simulacao)', format('public.fn_espelho_casar(%L, %L::jsonb, true, %L)', ey1, jsonb_build_array(jsonb_build_object('lancamento_id', ly1, 'valor', 100)), 't'),
    'fn_espelho_casar_n1', format('public.fn_espelho_casar_n1(%L, %L::uuid[], false)', ly1, array[ey1, ey2]),
    'fn_espelho_casar_n1 (simulacao)', format('public.fn_espelho_casar_n1(%L, %L::uuid[], true)', ly1, array[ey1, ey2]),
    'fn_criar_lancamento_de_extrato', format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L)', ey_livre, fy),
    'fn_reverter_desconsideracao_extrato', format('public.fn_reverter_desconsideracao_extrato(%L)', ey_ign));
  for k, s in select key, value #>> '{}' from jsonb_each(v_chamadas) loop
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'D1 travessia % : %', k, a; end if;
  end loop;
  -- inexistente e nulo: a MESMA recusa (nao diz se a linha existe)
  for s in select unnest(array[
      format('public.fn_desfazer_vinculo_extrato(%L, %L)', gen_random_uuid(), 't'),
      format('public.fn_desfazer_grupo_conciliacao(%L, %L)', gen_random_uuid(), 't'),
      format('public.fn_vincular_extrato_lancamento(%L, %L, 1)', ex1, gen_random_uuid()),
      format('public.fn_vincular_grupo_conciliacao(%L, %L::uuid[], %L::numeric[], %L)', ex2, array[lx2, gen_random_uuid()], array[1, 1], 't'),
      format('public.fn_espelho_casar(%L, %L::jsonb, true, %L)', ex1, jsonb_build_array(jsonb_build_object('lancamento_id', gen_random_uuid(), 'valor', 1)), 't'),
      format('public.fn_espelho_casar_n1(%L, %L::uuid[], true)', lx1, array[ex1, gen_random_uuid()]),
      format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L)', gen_random_uuid(), fx),
      'public.fn_reverter_desconsideracao_extrato(NULL)',
      'public.fn_desfazer_vinculo_extrato(NULL, ''t'')',
      format('public.fn_vincular_extrato_lancamento(%L, NULL, 1)', ex1)]) loop
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'D1 inexistente/nulo: % -> %', s, a; end if;
  end loop;
  v_out := v_out || 'D1 ok (as 8 + as 2 simulacoes recusam ux em Y; 10 pedidos com id inexistente ou nulo, a mesma recusa); ';

  -- ── D2: pedido misto, como ux ──
  for s in select unnest(array[
      format('public.fn_vincular_extrato_lancamento(%L, %L, 100)', ex1, ly1),
      format('public.fn_vincular_extrato_lancamento(%L, %L, 100)', ey1, lx1),
      format('public.fn_vincular_grupo_conciliacao(%L, %L::uuid[], %L::numeric[], %L)', ex2, array[lx2, ly_g1], array[120, 80], 't'),
      format('public.fn_espelho_casar(%L, %L::jsonb, false, %L)', ex2, jsonb_build_array(jsonb_build_object('lancamento_id', lx2, 'valor', 120), jsonb_build_object('lancamento_id', ly_g1, 'valor', 80)), 't'),
      format('public.fn_espelho_casar(%L, %L::jsonb, true, %L)', ex2, jsonb_build_array(jsonb_build_object('lancamento_id', lx2, 'valor', 120), jsonb_build_object('lancamento_id', ly_g1, 'valor', 80)), 't'),
      format('public.fn_espelho_casar_n1(%L, %L::uuid[], false)', lx1, array[ex1, ey1]),
      format('public.fn_espelho_casar_n1(%L, %L::uuid[], false)', ly1, array[ex1, ex3])]) loop
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'D2 misto: % -> %', s, a; end if;
  end loop;
  v_out := v_out || 'D2 ok (7 pedidos com X e Y juntos — par, array e itens: recusados); ';

  -- ── D3: criar — os cadastros informados sao do cliente do extrato ──
  for k, s in select * from (values
      ('fazenda de Y', format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L)', ex3, fy)),
      ('fornecedor de Y', format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L, p_favorecido_id := %L)', ex3, fx, forn_y)),
      ('safra de Y', format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L, p_safra_id := %L)', ex3, fx, safra_y)),
      ('outra conta de Y', format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L, p_tipo_operacao := %L, p_outra_conta := %L)', ex3, fx, '3-Transferências', cy)),
      ('fornecedor inexistente', format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L, p_favorecido_id := %L)', ex3, fx, gen_random_uuid()))) v(k, s) loop
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'D3 %: %', k, a; end if;
  end loop;
  if exists (select 1 from conciliacao_bancaria_itens where extrato_id = ex3) then raise exception 'D3: a recusa escreveu'; end if;
  a := pg_temp.ch(format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L, p_favorecido_id := %L, p_descricao := %L)', ex3, fx, forn_x, 'SINT SEG criado'));
  if a not like 'OK {"ok": true%' or (select count(*) from financeiro_lancamentos_v2 l join conciliacao_bancaria_itens c on c.lancamento_id = l.id
        where c.extrato_id = ex3 and c.desfeito_em is null and l.cliente_id = c_x and l.favorecido_id = forn_x and l.valor = 50 and l.fazenda_id = fx) <> 1 then
    raise exception 'D3 criar com cadastro do proprio cliente: %', a;
  end if;
  a := pg_temp.ch(format('public.fn_criar_lancamento_de_extrato(p_extrato_id := %L, p_fazenda_id := %L, p_tipo_operacao := %L, p_outra_conta := %L)', ex4, fx, '3-Transferências', cx2));
  if a not like 'OK {"ok": true%' then raise exception 'D3 criar transferencia com a outra conta do proprio cliente: %', a; end if;
  v_out := v_out || 'D3 ok (fazenda, fornecedor, safra e outra conta de Y e fornecedor inexistente: recusados; do proprio cliente, grava — lancamento e transferencia); ';

  -- ── nada foi escrito em Y ──
  select md5(coalesce((select string_agg(c.id::text || (c.desfeito_em is null)::text, ',' order by c.id) from conciliacao_bancaria_itens c where c.extrato_id in (select id from extrato_bancario_v2 where conta_bancaria_id = cy)), '')
          || '#' || (select string_agg(e.id::text || e.status || (e.ignorado_em is null)::text, ',' order by e.id) from extrato_bancario_v2 e where e.conta_bancaria_id = cy)
          || '#' || (select count(*)::text || coalesce(string_agg(l.id::text || l.valor::text || l.status_transacao || l.cancelado::text, ',' order by l.id), '') from financeiro_lancamentos_v2 l where l.cliente_id = c_y and (l.conta_destino_id = cy or l.conta_bancaria_id = cy)))
    into a;
  if a <> v_foto_y then raise exception 'travessia: Y mudou'; end if;
  v_out := v_out || 'Y intacto (vinculos, status dos extratos e lancamentos: foto igual); ';

  -- ── o caminho de sempre: ux em X ──
  a := pg_temp.ch(format('public.fn_vincular_extrato_lancamento(%L, %L, 100)', ex1, lx1));
  if a not like 'OK {"ok": true%' or (select status from extrato_bancario_v2 where id = ex1) <> 'conciliado' then raise exception 'X vincular: %', a; end if;
  a := pg_temp.ch(format('public.fn_desfazer_vinculo_extrato(%L, %L)', ex1, 't'));
  if a <> 'OK nao_conciliado' then raise exception 'X desfazer vinculo: %', a; end if;
  a := pg_temp.ch(format('public.fn_espelho_casar(%L, %L::jsonb, true, %L)', ex1, jsonb_build_array(jsonb_build_object('lancamento_id', lx1, 'valor', 100)), 't'));
  if a not like 'OK {"ok": true%"simulado": true%' then raise exception 'X casar (simulacao): %', a; end if;
  a := pg_temp.ch(format('public.fn_espelho_casar(%L, %L::jsonb, false, %L)', ex1, jsonb_build_array(jsonb_build_object('lancamento_id', lx1, 'valor', 100)), 't'));
  if a not like 'OK {"ok": true%' or (select count(*) from conciliacao_bancaria_itens where extrato_id = ex1 and lancamento_id = lx1 and desfeito_em is null) <> 1 then
    raise exception 'X casar: %', a;
  end if;
  a := pg_temp.ch(format('public.fn_vincular_grupo_conciliacao(%L, %L::uuid[], %L::numeric[], %L)', ex2, array[lx2, lx3], array[120, 80], 't'));
  select count(*), min(grupo_id::text)::uuid into v_n, v_g from conciliacao_bancaria_itens where extrato_id = ex2 and desfeito_em is null;
  if a not like 'OK {"ok": true%' or v_n <> 2 or v_g is null then raise exception 'X vincular grupo: % (% vinculos)', a, v_n; end if;
  a := pg_temp.ch(format('public.fn_desfazer_grupo_conciliacao(%L, %L)', v_g, 't'));
  if a not like 'OK {"ok": true%"itens_desfeitos": 2%' or (select status from extrato_bancario_v2 where id = ex2) <> 'nao_conciliado' then raise exception 'X desfazer grupo: %', a; end if;
  a := pg_temp.ch(format('public.fn_espelho_casar_n1(%L, %L::uuid[], true)', lx2, array[ex2, ex_ign]));
  if a not like 'OK {"ok": %' then raise exception 'X casar n1 (simulacao) nao passou da guarda: %', a; end if;
  a := pg_temp.ch(format('public.fn_reverter_desconsideracao_extrato(%L)', ex_ign));
  if a <> 'OK nao_conciliado' then raise exception 'X reverter: %', a; end if;
  v_out := v_out || 'ux em X ok (vincular, desfazer, casar e simular, grupo e desfazer grupo, n1, reverter); ';

  -- ── uy em Y, o admin em Y e ninguem ──
  perform pg_temp.como(uy);
  a := pg_temp.ch(format('public.fn_vincular_extrato_lancamento(%L, %L, 100)', ey1, ly1));
  if a not like 'OK {"ok": true%' then raise exception 'uy em Y: %', a; end if;
  a := pg_temp.ch(format('public.fn_desfazer_vinculo_extrato(%L, %L)', ex1, 't'));
  if a <> c_recusa then raise exception 'uy em X (o sentido inverso): %', a; end if;
  perform pg_temp.como(adm);
  a := pg_temp.ch(format('public.fn_desfazer_vinculo_extrato(%L, %L)', ey_conc, 't'));
  if a <> 'OK nao_conciliado' then raise exception 'admin em Y: %', a; end if;
  a := pg_temp.ch(format('public.fn_desfazer_grupo_conciliacao(%L, %L)', gy, 't'));
  if a not like 'OK {"ok": true%' then raise exception 'admin em Y (grupo): %', a; end if;
  perform pg_temp.como(null);
  for s in select unnest(array[
      format('public.fn_desfazer_vinculo_extrato(%L, %L)', ex1, 't'),
      format('public.fn_vincular_extrato_lancamento(%L, %L, 80)', ex4, lx3),
      format('public.fn_espelho_casar(%L, %L::jsonb, true, %L)', ex2, jsonb_build_array(jsonb_build_object('lancamento_id', lx2, 'valor', 120)), 't'),
      format('public.fn_reverter_desconsideracao_extrato(%L)', ey_ign)]) loop
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'sem usuario: % -> %', s, a; end if;
  end loop;
  v_out := v_out || 'uy em Y grava e em X e'' recusado; admin em Y grava; sem usuario, recusado; ';

  -- ── assinatura, config e ACL como estavam ──
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
               and p.proname in ('fn_vincular_extrato_lancamento', 'fn_vincular_grupo_conciliacao', 'fn_desfazer_vinculo_extrato', 'fn_desfazer_grupo_conciliacao',
                                 'fn_espelho_casar', 'fn_espelho_casar_n1', 'fn_criar_lancamento_de_extrato', 'fn_reverter_desconsideracao_extrato')
               and (not p.prosecdef or p.proconfig is distinct from array['search_path=public']
                    or has_function_privilege('anon', p.oid, 'EXECUTE') or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                    or p.prosrc !~ 'PR-SEG-TENANT-VARREDURA-01A' or p.prosrc !~ 'public\.tenant_ok\(g_cli\[1\]\)'))
     or (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('fn_vincular_extrato_lancamento', 'fn_vincular_grupo_conciliacao', 'fn_desfazer_vinculo_extrato', 'fn_desfazer_grupo_conciliacao',
                             'fn_espelho_casar', 'fn_espelho_casar_n1', 'fn_criar_lancamento_de_extrato', 'fn_reverter_desconsideracao_extrato')) <> 8 then
    raise exception 'config/ACL/guarda: alguma das 8 nao esta como deveria';
  end if;
  v_out := v_out || 'as 8 com a guarda, SECURITY DEFINER, search_path e ACL de antes; ';

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
