-- FOLHA-ADMISSAO-01 (118690) — a admissão é a fonte da data da contratação. Roda como postgres DEPOIS da migration; termina em RAISE 'OK…'.
-- Fixture SINTÉTICA no cliente Teste (43f32d07): nomes e datas INVENTADOS. Usuário = um admin real (as claims).
-- A1 salário com data ANTIGA e FUTURA grava exato e a marca "salário" sai · A5 o pedido do cadastro não devolve a marca com salário gravado
-- A6 a prévia da admissão nova diz o que acompanha e nada move · A2 gravada: a 1ª linha de salário e a 1ª atuação acompanham, a 2ª fica,
-- com trilha · A3 admissão no 2º salário ou depois = recusa · A4 SEM admissão: o salário grava com a data dele e a admissão segue vazia
-- (o banco não inventa) · A7 admissão de vazia para uma data: a 1ª linha acompanha.
-- Mutações (voltam conferidas por md5): MA1 o salário sem tirar a marca → A1 · MA2 o cadastro sem mover a 1ª linha de salário → A2.

create or replace function pg_temp.checa_adm() returns text[] language plpgsql as $c$
declare
  f text[] := '{}'; T constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; faz uuid; fa uuid; fb uuid; r jsonb; v text;
  pec jsonb; agr jsonb;
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select id into faz from fazendas where cliente_id = T limit 1;
  if ADM is null or faz is null then return f || 'FIXTURE'::text; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  pec := jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'pecuaria', 'pct', 100));
  agr := jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'agricultura', 'pct', 100));
  insert into folha_funcionarios (cliente_id, nome, admissao, a_atualizar) values (T, 'Teodolino Admissao Sint', '2015-04-10', '{salario,cpf}') returning id into fa;
  insert into folha_funcionarios (cliente_id, nome, a_atualizar) values (T, 'Ursulino Semadmissao Sint', '{salario}') returning id into fb;

  -- A1
  perform fn_folha_salario_gravar(fa, '2015-04-10', 2000, 100, null, false);
  perform fn_folha_salario_gravar(fa, '2031-07-23', 2500, 100, 'reajuste futuro', false);
  select string_agg(desde::text, ',' order by desde) into v from folha_funcionario_salarios where funcionario_id = fa;
  if v is distinct from '2015-04-10,2031-07-23' or (select 'salario' = any(a_atualizar) from folha_funcionarios where id = fa) then f := f || ('A1 ' || coalesce(v, '∅')); end if;
  perform fn_folha_atuacao_gravar(fa, '2015-04-10', pec, false);
  perform fn_folha_atuacao_gravar(fa, '2031-07-23', agr, false);

  -- A5
  perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Teodolino Admissao Sint', 'admissao', '2015-04-10', 'a_atualizar', '["salario","cpf"]'::jsonb), false);
  if (select a_atualizar from folha_funcionarios where id = fa) is distinct from '{cpf}'::text[] then f := f || 'A5'::text; end if;

  -- A6
  r := fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Teodolino Admissao Sint', 'admissao', '2012-01-02', 'a_atualizar', '["cpf"]'::jsonb), true);
  if not (r->'acompanha' ? 'salario' and r->'acompanha' ? 'atuacao')
     or (select min(desde) from folha_funcionario_salarios where funcionario_id = fa) <> '2015-04-10' then f := f || ('A6 ' || coalesce(r::text, '∅')); end if;

  -- A2
  perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Teodolino Admissao Sint', 'admissao', '2012-01-02', 'a_atualizar', '["cpf"]'::jsonb), false);
  select string_agg(desde::text, ',' order by desde) into v from folha_funcionario_salarios where funcionario_id = fa;
  if v is distinct from '2012-01-02,2031-07-23' then f := f || ('A2 salário ' || coalesce(v, '∅')); end if;
  select string_agg(desde::text || ' ' || atividade, ',' order by desde) into v from folha_funcionario_atuacao where funcionario_id = fa;
  if v is distinct from '2012-01-02 pecuaria,2031-07-23 agricultura' then f := f || ('A2 atuação ' || coalesce(v, '∅')); end if;
  if (select count(*) from folha_trilha where cliente_id = T and acao = 'acompanhar a admissão'
        and registro_id in (fa, (select id from folha_funcionario_salarios where funcionario_id = fa and desde = '2012-01-02'))) <> 2 then f := f || 'A2 trilha'::text; end if;

  -- A3
  begin
    perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Teodolino Admissao Sint', 'admissao', '2031-07-23', 'a_atualizar', '["cpf"]'::jsonb), false);
    f := f || 'A3 gravou'::text;
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'A admissão (23/07/2031) cai no 2º salário%' then f := f || ('A3 ' || sqlerrm); end if;
  end;

  -- A4
  perform fn_folha_salario_gravar(fb, '2018-09-30', 1800, 100, null, false);
  if (select desde from folha_funcionario_salarios where funcionario_id = fb) <> '2018-09-30'
     or (select admissao from folha_funcionarios where id = fb) is not null
     or (select 'salario' = any(a_atualizar) from folha_funcionarios where id = fb) then f := f || 'A4'::text; end if;

  -- A7
  perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fb, 'nome', 'Ursulino Semadmissao Sint', 'admissao', '2018-06-01', 'a_atualizar', '[]'::jsonb), false);
  if (select desde from folha_funcionario_salarios where funcionario_id = fb) <> '2018-06-01' then f := f || 'A7'::text; end if;
  return f;
end $c$;

do $t$
declare f text[] := pg_temp.checa_adm();
begin
  if cardinality(f) > 0 then raise exception 'FALHOU FOLHA-ADMISSAO-01: %', f; end if;
  raise exception 'OK FOLHA-ADMISSAO-01';
end $t$;
