-- SM-ARRENDAMENTO-ENCERRAR-01 — `vw_zoot_fazenda_mensal`: a área (e a lotação) de cada linha é a dos pastos VIGENTES no mês.
-- Roda como `postgres`, DEPOIS da migration 20261028115130, e TERMINA EM RAISE: nada fica no banco. Sucesso = a exceção final começa
-- com "OK". Fixture SINTÉTICO no cliente Teste (43f32d07), na "Fazenda Teste Cana" (achada por consulta): um saldo inicial em 2031
-- (para a view ter linhas) e dois pastos — A (1.000 ha) vigente até 30/06/2031, B (500 ha) vigente de 01/09/2031 — além dos pastos que
-- a fazenda já tem (somados por consulta, sem número fixo).
-- C1 a área do mês: jun/2031 = base + A; jul/2031 = base; set/2031 = base + B (a vigência entra no mês; o fim sai no mês seguinte).
-- C2 a lotação de cada linha da fazenda = round(UA média ÷ área do mês, 2) (a fórmula de sempre, com a área nova).
-- C3 a view continua `security_invoker`.
-- C4 quem lê pela tela pode avaliar a regra: `authenticated` tem EXECUTE em `fn_pasto_vigente_no_mes` e, como `authenticated` (claims
--    de um admin real), a função responde o mês certo. A leitura da VIEW inteira como `authenticated` não entra aqui: ela já passava de
--    20 s com a definição ANTIGA (medido em 30/10/2026, 1 fazenda × 1 ano, via `tenant_ok`) — lentidão anterior, registrada à parte.
DO $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_faz uuid; v_cat uuid; v_base numeric; r record; v_n bigint; v_a numeric;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select id into strict v_cat from public.categorias_rebanho where codigo = 'garrotes';

  insert into public.saldos_iniciais (fazenda_id, cliente_id, categoria_id, categoria, ano, mes, quantidade, peso_total, peso_medio_kg)
  values (v_faz, c_cli, v_cat, 'garrotes', 2031, 1, 100, 30000, 300);
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo, entra_conciliacao, data_inicio, data_fim)
  values (v_faz, c_cli, 'SINT arrendamento A', 1000, 'recria', true, true, date '2020-01-01', date '2031-06-30'),
         (v_faz, c_cli, 'SINT pasto B', 500, 'recria', true, true, date '2031-09-01', null);

  select coalesce(sum(area_produtiva_ha), 0) into v_base from public.pastos
   where fazenda_id = v_faz and ativo and entra_conciliacao and nome not like 'SINT %'
     and (data_inicio is null or data_inicio <= date '2031-06-01') and data_fim is null;

  -- C1
  for r in select ano_mes, area_produtiva_ha from public.vw_zoot_fazenda_mensal
            where fazenda_id = v_faz and cenario = 'realizado' and ano_mes in ('2031-06', '2031-07', '2031-09') loop
    v_a := case r.ano_mes when '2031-06' then v_base + 1000 when '2031-07' then v_base else v_base + 500 end;
    if r.area_produtiva_ha is distinct from v_a then
      raise exception 'C1 %: área % (esperada %)', r.ano_mes, r.area_produtiva_ha, v_a;
    end if;
  end loop;
  select count(*) into v_n from public.vw_zoot_fazenda_mensal
   where fazenda_id = v_faz and cenario = 'realizado' and ano_mes in ('2031-06', '2031-07', '2031-09');
  if v_n <> 3 then raise exception 'C1 fixture: % linhas da view (esperadas 3)', v_n; end if;

  -- C2
  select count(*) into v_n from public.vw_zoot_fazenda_mensal
   where fazenda_id = v_faz and ano = 2031
     and lotacao_ua_ha is distinct from case when area_produtiva_ha > 0 and cabecas_final > 0
           then round((cabecas_inicio + cabecas_final)::numeric / 2.0 * (peso_total_final_kg / cabecas_final::numeric) / 450.0 / area_produtiva_ha, 2) end;
  if v_n <> 0 then raise exception 'C2 % linhas com a lotação fora da área do mês', v_n; end if;

  -- C3
  if not exists (select 1 from pg_class where oid = 'public.vw_zoot_fazenda_mensal'::regclass
                   and reloptions @> array['security_invoker=true']) then
    raise exception 'C3 a view perdeu o security_invoker';
  end if;

  -- C4
  if not has_function_privilege('authenticated', 'public.fn_pasto_vigente_no_mes(boolean, date, date, text)', 'execute') then
    raise exception 'C4 authenticated sem EXECUTE na fn_pasto_vigente_no_mes';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.fn_pasto_vigente_no_mes(true, date '2020-01-01', date '2031-06-30', '2031-07')
     or not public.fn_pasto_vigente_no_mes(true, date '2020-01-01', date '2031-06-30', '2031-06') then
    raise exception 'C4 authenticated: a regra do mês respondeu errado';
  end if;
  execute 'reset role';

  raise exception 'OK SM-ARRENDAMENTO-ENCERRAR-01: C1–C4 (base % ha; jun % · jul % · set %)', v_base, v_base + 1000, v_base, v_base + 500;
end
$teste$;
