-- PASTO-AREA-OFICIAL-02a (116140) — a leitura da área de cada pasto por mês. Fixture SINTÉTICA na fazenda do cliente Teste (c2498ace):
-- pastos A (100 ha) e B (50 ha); o mês M-2 FECHADO por um P1 sintético com A congelado em 95 (≠ do cadastro, para provar a fonte); A muda
-- para 120 do mês atual em diante (pela RPC da 116120). Roda como `authenticated` (admin 7bd0b6ad; o de fora a91962cd). TERMINA EM RAISE.
--   L1  mês fechado: A = 95 (fonte 'fechado', a congelada, não o cadastro); B sem membro = 50 ('vigencia')
--   L2  mês aberto antes da mudança: A = 100; mês da mudança: A = 120 (o cadastro de hoje); tudo 'vigencia'
--   L3  uma ida dá o intervalo inteiro: 2 pastos × 3 meses
--   L4  recusas: intervalo invertido e mais de 36 meses (P0001); o usuário de fora e a fazenda que não existe (42501)
-- Mutações (ensaio): ML1 sem o congelado (só a vigência) derruba L1 · ML2 sem a vigência (só o cadastro) derruba L2.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  hoje date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  m2 text := to_char(hoje - interval '2 months', 'YYYY-MM');
  a uuid; b uuid; p1 uuid; snap uuid;
begin
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico mes A', 100, true, 'recria', 'ativo') returning id into a;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico mes B', 50, true, 'recria', 'ativo') returning id into b;
  insert into public.fechamento_p1 (fazenda_id, cliente_id, ano_mes) values (c_faz, c_cli, m2) returning id into p1;
  insert into public.fechamento_p1_snapshot (fechamento_p1_id, fazenda_id, cliente_id, ano_mes, status)
  values (p1, c_faz, c_cli, m2, 'vigente') returning id into snap;
  insert into public.fechamento_pastos_membros (snapshot_id, fechamento_p1_id, fazenda_id, cliente_id, ano_mes, pasto_id, nome_exibicao,
                                                area_considerada_ha, tipo_uso, entra_conciliacao, ativo_congelado)
  values (snap, p1, c_faz, c_cli, m2, a, 'Pasto sintetico mes A', 95, 'recria', true, true);
  perform set_config('teste.a', a::text, true); perform set_config('teste.b', b::text, true);
  perform set_config('teste.m2', m2, true);
  perform set_config('teste.m1', to_char(hoje - interval '1 month', 'YYYY-MM'), true);
  perform set_config('teste.m0', to_char(hoje, 'YYYY-MM'), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  a uuid := current_setting('teste.a')::uuid; b uuid := current_setting('teste.b')::uuid;
  m2 text := current_setting('teste.m2'); m1 text := current_setting('teste.m1'); m0 text := current_setting('teste.m0');
  faz uuid[] := array['c2498ace-8478-410c-a697-d3f2e2934d1f'::uuid];
  x record; n int;
begin
  perform public.fn_pasto_area_editar(a, 120, to_date(m0 || '-01', 'YYYY-MM-DD'), 'medido com GPS (sintetico)', false);
  -- L1
  select * into x from public.fn_pastos_area_do_mes(faz, m2, m0) where pasto_id = a and ano_mes = m2;
  if x.area_ha is distinct from 95 or x.fonte is distinct from 'fechado' then raise exception 'L1 A: % %', x.area_ha, x.fonte; end if;
  select * into x from public.fn_pastos_area_do_mes(faz, m2, m0) where pasto_id = b and ano_mes = m2;
  if x.area_ha is distinct from 50 or x.fonte is distinct from 'vigencia' then raise exception 'L1 B: % %', x.area_ha, x.fonte; end if;
  -- L2
  select * into x from public.fn_pastos_area_do_mes(faz, m2, m0) where pasto_id = a and ano_mes = m1;
  if x.area_ha is distinct from 100 or x.fonte is distinct from 'vigencia' then raise exception 'L2 A m-1: % %', x.area_ha, x.fonte; end if;
  select * into x from public.fn_pastos_area_do_mes(faz, m2, m0) where pasto_id = a and ano_mes = m0;
  if x.area_ha is distinct from 120 then raise exception 'L2 A mes atual: %', x.area_ha; end if;
  -- L3
  select count(*) into n from public.fn_pastos_area_do_mes(faz, m2, m0) where pasto_id in (a, b);
  if n <> 6 then raise exception 'L3: % linhas, esperadas 6', n; end if;
  -- L4
  begin
    perform * from public.fn_pastos_area_do_mes(faz, m0, m2);
    raise exception 'L4: intervalo invertido passou';
  exception when others then if sqlerrm not like 'Intervalo de meses inválido%' then raise exception 'L4 invertido: %', sqlerrm; end if;
  end;
  begin
    perform * from public.fn_pastos_area_do_mes(faz, '2020-01', '2023-01');
    raise exception 'L4: 37 meses passou';
  exception when others then if sqlerrm <> 'No máximo 36 meses por leitura.' then raise exception 'L4 36: %', sqlerrm; end if;
  end;
  begin
    perform * from public.fn_pastos_area_do_mes(array['00000000-0000-0000-0000-000000000000'::uuid], m2, m0);
    raise exception 'L4: fazenda inexistente passou';
  exception when insufficient_privilege then null;
  end;
end $t$;
reset role;

select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $s$
begin
  begin
    perform * from public.fn_pastos_area_do_mes(array['c2498ace-8478-410c-a697-d3f2e2934d1f'::uuid], current_setting('teste.m2'), current_setting('teste.m0'));
    raise exception 'L4: o de fora leu';
  exception when insufficient_privilege then null;
  end;
end $s$;
reset role;

do $fim$ begin raise exception 'OK pasto_area_do_mes (L1–L4)'; end $fim$;
rollback;
