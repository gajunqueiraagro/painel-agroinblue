-- PATR-01 · GUARDA DE CLIENTE — prova de que NENHUMA funcao do Patrimonio atende um usuario de outro cliente (resposta ao alerta do
-- `guardaDeClienteNasMigrations.test.ts` sobre a 20261028116060). Fixture SINTETICA no cliente Teste (43f32d07), criada pelo admin
-- (7bd0b6ad); as chamadas sao feitas como `authenticated` com as claims de um usuario de FORA do Teste (a91962cd). TERMINA EM RAISE.
--   G0  o usuario de fora e' de fora: nao e' admin e `tenant_ok(Teste)` = false (sem isso o teste nao prova nada)
--   G1  as 13 RPCs expostas, cada uma com ids/cliente REAIS do Teste e argumentos validos: todas recusam com 42501 (nunca vazio,
--       nunca outro erro — outro erro = a guarda nao foi a primeira coisa a agir, e o teste reprova)
--   G2  as 7 internas `_fn_patrimonio_*`: `authenticated` nao executa (42501 "permission denied")
--   G3  completude: o conjunto chamado em G1+G2 = TODAS as funcoes `fn_patrimonio_*`/`_fn_patrimonio_*`/`fn_investimentos_sem_bem`
--       do catalogo (funcao nova sem entrar aqui reprova)
--   G4  nada mudou no Teste depois das tentativas (bens, avaliacao, documento)
--   G5  controle: o admin, com as MESMAS chamadas, nao leva 42501 (a recusa de G1 e' do cliente, nao da chamada)
-- Mutacoes (ensaio local, ver o relatorio): MG1 tirar o tenant_ok da fn_patrimonio_lista derruba G1 · MG2 a
-- _fn_patrimonio_bem_do_usuario sem o tenant_ok derruba G1 · MG3 GRANT da _fn_patrimonio_vinculos a authenticated derruba G2 ·
-- MG4 funcao nova `fn_patrimonio_x` derruba G3.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- fixture (como o admin, pelas proprias RPCs) ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cat_maq uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'maquinas');
  cat_ter uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'terra');
  r jsonb; v_maq uuid; v_ter uuid;
begin
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico guarda', 'situacao', 'em_uso', 'em_uso_desde', '2022-03-01', 'atividade', 'pecuaria'), false);
  v_maq := (r->>'id')::uuid;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_ter,
         'descricao', 'Terra sintetica guarda', 'situacao', 'em_uso', 'em_uso_desde', '2019-01-01', 'atividade', 'compartilhado',
         'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 1000000, 'area_ha', 500), false);
  v_ter := (r->>'id')::uuid;
  r := public.fn_patrimonio_avaliacao_salvar(v_ter, '{"data":"2026-01-15","fonte":"ITR sintetico","base":"terra_nua","valor_ha":3000}', false);
  perform set_config('teste.av', r->>'id', true);
  r := public.fn_patrimonio_documento_registrar(v_maq, 'foto', 'foto sintetica', 'jpg', 'image/jpeg', 10);
  perform set_config('teste.doc', r->>'id', true);
  perform set_config('teste.maq', v_maq::text, true);
  perform set_config('teste.ter', v_ter::text, true);
  perform set_config('teste.versao', (select versao::text from public.patrimonio_bens where id = v_maq), true);
end $fx$;
reset role;

-- as chamadas (o mesmo texto para o usuario de fora e para o controle do admin) -------------------------------------------------
create temp table fx_chamadas (nome text primary key, exposta boolean, sql text) on commit drop;
insert into fx_chamadas values
  ('fn_patrimonio_lista', true, $q$select count(*) from public.fn_patrimonio_lista('43f32d07-dba8-4670-900c-bf645440c04a', null, null)$q$),
  ('fn_patrimonio_depreciacao', true, $q$select count(*) from public.fn_patrimonio_depreciacao('43f32d07-dba8-4670-900c-bf645440c04a', null, null, 'mes')$q$),
  ('fn_investimentos_sem_bem', true, $q$select public.fn_investimentos_sem_bem('43f32d07-dba8-4670-900c-bf645440c04a', null, 20000)::text$q$),
  ('fn_patrimonio_bem_salvar', true, $q$select public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', '43f32d07-dba8-4670-900c-bf645440c04a', 'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'categoria_id', (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'maquinas'), 'descricao', 'Intruso sintetico', 'situacao', 'em_uso', 'em_uso_desde', '2022-03-01', 'atividade', 'pecuaria'), true)::text$q$),
  ('fn_patrimonio_bem_salvar#editar', true, $q$select public.fn_patrimonio_bem_salvar(jsonb_build_object('id', current_setting('teste.maq'), 'versao', current_setting('teste.versao')::int, 'descricao', 'Intruso sintetico'), true)::text$q$),
  ('fn_patrimonio_bem_lancamentos', true, $q$select count(*) from public.fn_patrimonio_bem_lancamentos(current_setting('teste.maq')::uuid)$q$),
  ('fn_patrimonio_parametros_mudar', true, $q$select public.fn_patrimonio_parametros_mudar(current_setting('teste.maq')::uuid, (date_trunc('month', now()) + interval '1 month')::date, 60, 10, 'motivo sintetico', true)::text$q$),
  ('fn_patrimonio_bem_ligar', true, $q$select public.fn_patrimonio_bem_ligar(current_setting('teste.maq')::uuid, '[]'::jsonb, false, true)::text$q$),
  ('fn_patrimonio_bem_desligar', true, $q$select public.fn_patrimonio_bem_desligar(current_setting('teste.maq')::uuid, '[{"lancamento_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb, 'motivo sintetico', true)::text$q$),
  ('fn_patrimonio_bem_pastos_salvar', true, $q$select public.fn_patrimonio_bem_pastos_salvar(current_setting('teste.maq')::uuid, '[]'::jsonb, true)::text$q$),
  ('fn_patrimonio_avaliacao_salvar', true, $q$select public.fn_patrimonio_avaliacao_salvar(current_setting('teste.ter')::uuid, '{"data":"2026-01-15","fonte":"x","base":"terra_nua","valor_ha":1}'::jsonb, true)::text$q$),
  ('fn_patrimonio_avaliacao_cancelar', true, $q$select public.fn_patrimonio_avaliacao_cancelar(current_setting('teste.av')::uuid, 'motivo sintetico')::text$q$),
  ('fn_patrimonio_documento_registrar', true, $q$select public.fn_patrimonio_documento_registrar(current_setting('teste.maq')::uuid, 'foto', 'intruso', 'jpg', null, null)::text$q$),
  ('fn_patrimonio_documento_remover', true, $q$select public.fn_patrimonio_documento_remover(current_setting('teste.doc')::uuid, 'motivo sintetico')::text$q$),
  ('_fn_patrimonio_vinculos', false, $q$select count(*) from public._fn_patrimonio_vinculos('43f32d07-dba8-4670-900c-bf645440c04a', null, null)$q$),
  ('_fn_patrimonio_serie', false, $q$select count(*) from public._fn_patrimonio_serie('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('teste.maq')::uuid, current_date)$q$),
  ('_fn_patrimonio_bem_do_usuario', false, $q$select (public._fn_patrimonio_bem_do_usuario(current_setting('teste.maq')::uuid)).id::text$q$),
  ('_fn_patrimonio_data_do_contrato', false, $q$select public._fn_patrimonio_data_do_contrato(null)::text$q$),
  ('_fn_patrimonio_hoje', false, $q$select public._fn_patrimonio_hoje()::text$q$),
  ('_fn_patrimonio_conta_investimento', false, $q$select public._fn_patrimonio_conta_investimento(null)::text$q$),
  ('_fn_patrimonio_meses', false, $q$select count(*) from public._fn_patrimonio_meses(current_date, current_date)$q$);
grant select on fx_chamadas to authenticated;

-- G3 completude (catalogo x lista) --------------------------------------------------------------------------------------------
do $g3$
declare v_falta text; v_sobra text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_falta
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname ~ '^_?fn_patrimonio_' or p.proname = 'fn_investimentos_sem_bem')
     and p.proname not in (select split_part(nome, '#', 1) from fx_chamadas);
  if v_falta is not null then raise exception 'G3: funcao do Patrimonio fora do teste da guarda: %', v_falta; end if;
  select string_agg(nome, ', ') into v_sobra from fx_chamadas c
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = split_part(c.nome, '#', 1));
  if v_sobra is not null then raise exception 'G3: chamada sem funcao no catalogo: %', v_sobra; end if;
end $g3$;

-- G0 + G1 + G2 como o usuario de FORA --------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $g1$
declare c record; v text; n_ok int := 0; falhas text := '';
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'G0: o usuario a91962cd tem acesso ao Teste — o teste nao prova nada';
  end if;
  for c in select * from fx_chamadas order by exposta desc, nome loop
    begin
      execute c.sql into v;
      falhas := falhas || format(E'\n  %s ATENDEU o usuario de fora (devolveu %s)', c.nome, coalesce(v, 'null'));
    exception
      when insufficient_privilege then n_ok := n_ok + 1;
      when others then falhas := falhas || format(E'\n  %s recusou com %s (%s), nao 42501', c.nome, sqlstate, sqlerrm);
    end;
  end loop;
  if falhas <> '' then raise exception 'G1/G2 (% de % recusaram com 42501):%', n_ok, (select count(*) from fx_chamadas), falhas; end if;
  if n_ok <> 21 then raise exception 'G1/G2: % recusas, esperadas 21', n_ok; end if;
end $g1$;
reset role;

-- G4 nada mudou -----------------------------------------------------------------------------------------------------------------
do $g4$
begin
  if exists (select 1 from public.patrimonio_bens where descricao = 'Intruso sintetico') then raise exception 'G4: o de fora gravou um bem'; end if;
  if (select descricao from public.patrimonio_bens where id = current_setting('teste.maq')::uuid) <> 'Trator sintetico guarda' then
    raise exception 'G4: o de fora mudou o bem';
  end if;
  if (select cancelado_em from public.patrimonio_avaliacoes where id = current_setting('teste.av')::uuid) is not null then
    raise exception 'G4: o de fora cancelou a avaliacao';
  end if;
  if (select cancelado_em from public.patrimonio_bem_documentos where id = current_setting('teste.doc')::uuid) is not null then
    raise exception 'G4: o de fora removeu o documento';
  end if;
  if exists (select 1 from public.patrimonio_bem_documentos where nome = 'intruso') then raise exception 'G4: o de fora registrou documento'; end if;
end $g4$;

-- G5 controle: o admin, as mesmas 14 chamadas expostas, nenhuma com 42501 ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $g5$
declare c record; v text; n int := 0; falhas text := '';
begin
  for c in select * from fx_chamadas where exposta order by nome loop
    begin
      execute c.sql into v; n := n + 1;
    exception
      when insufficient_privilege then falhas := falhas || format(E'\n  %s recusou o ADMIN (%s)', c.nome, sqlerrm);
      when others then n := n + 1;  -- recusa de regra (P0001 etc.) = passou da guarda
    end;
  end loop;
  if falhas <> '' then raise exception 'G5 controle:%', falhas; end if;
  if n <> 14 then raise exception 'G5: % chamadas do admin, esperadas 14', n; end if;
end $g5$;
reset role;

do $fim$ begin raise exception 'OK patr_01_guarda (G0–G5: 14 chamadas expostas + 7 internas recusam o usuario de fora)'; end $fim$;
rollback;
