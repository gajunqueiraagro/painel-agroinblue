-- DRE-VARIACAO-EXPLICA-01 fatia 1a — teste da migration 20261028115300 (o agio e a serie mensal na fn_dre_pecuaria_patrimonio).
-- Roda como postgres com a 20261028115290 e a 20261028115300 aplicadas; fixture sintetico no cliente Teste (43f32d07), 2030-12 a 2031-06
-- (sem dado nenhum); termina em RAISE 'OK…' (nada fica). O corpo e' pg_temp.teste_dre_agio(), o mesmo que o arquivo de mutacoes chama.
--
-- Fixture (uma fazenda):
--   2030-12 fechamento VALIDADO: 100 Desmama M x 200 kg a R$ 14/kg (= 280.000)
--   2031-03 reclassificacao: 100 Desmama M -> Garrotes a 250 kg
--   2031-06 fechamento VALIDADO: 100 Garrotes x 300 kg a R$ 12/kg (= 360.000)
--   Esperado: vpb = 100 x 300 x 12 - 280.000 = 80.000; agio (no destino, Garrotes) = 100 x 250 x (12 - 14) = -50.000;
--   producao = vpb - agio = 130.000; meses de 2030-12 a 2031-06, os do meio pelo cadastro (v_mes null).
set local statement_timeout = '30s';
set local lock_timeout = '2s';

create function pg_temp.teste_dre_agio() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; g jsonb; d jsonb; m jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  insert into public.valor_rebanho_fechamento_itens (fazenda_id, cliente_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria)
  values (c_faz, c_cli, '2030-12', 'desmama_m', 100, 200, 14, 280000), (c_faz, c_cli, '2031-06', 'garrotes', 100, 300, 12, 360000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2030-12', 'validado', 280000, 100), (c_faz, c_cli, '2031-06', 'validado', 360000, 100);
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-03-15', 'reclassificacao', 'desmama_m', 'garrotes', 100, 250, 'realizado', 'realizado');
  /* o cadastro de mar (sem fechamento validado): 100 Garrotes a 260 kg — o mes do meio da V4 sai dele, sem valor do mes */
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'garrotes', 'Garrotes', 3, 100, 100, 260, 260);

  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-01', '2031-06');
  select x into g from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'garrotes';
  select x into d from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'desmama_m';

  -- T1 o agio vai na categoria de DESTINO, a preco de referencia (garrote R$ 12 do P1, desmama R$ 14 do P0)
  if (g->>'agio')::numeric is distinct from -50000.00 then raise exception 'T1 falhou: agio dos garrotes % (esperado -50000.00)', g->>'agio'; end if;
  if (d->>'agio')::numeric is distinct from 0 then raise exception 'T1 falhou: agio da desmama % (esperado 0: a origem nao leva)', d->>'agio'; end if;
  if (g->>'agio_sem_preco')::boolean then raise exception 'T1 falhou: garrotes sem preco'; end if;

  -- T2 as cabecas e arrobas reclassificadas (entrou no destino, saiu da origem)
  if (g->>'cab_reclass_entrada')::numeric is distinct from 100 or (d->>'cab_reclass_saida')::numeric is distinct from 100
     or (g->>'at_reclass_entrada')::numeric is distinct from 833.33 then
    raise exception 'T2 falhou: garrotes entrada % (% @), desmama saida %', g->>'cab_reclass_entrada', g->>'at_reclass_entrada', d->>'cab_reclass_saida'; end if;

  -- T3 o total: agio -50.000, e o vpb de hoje intacto (80.000) — a producao (vpb - agio) e' a tela que subtrai
  if (r->'total'->>'agio')::numeric is distinct from -50000.00 or (r->'total'->>'vpb')::numeric is distinct from 80000.00 then
    raise exception 'T3 falhou: total agio % vpb %', r->'total'->>'agio', r->'total'->>'vpb'; end if;

  -- T4 a serie da V4: 7 meses (2030-12 a 2031-06); as pontas pelo fechamento com o valor do mes; o meio pelo cadastro, sem valor do mes
  if jsonb_array_length(r->'meses') <> 7 then raise exception 'T4 falhou: % meses (esperado 7)', jsonb_array_length(r->'meses'); end if;
  select x into m from jsonb_array_elements(r->'meses') x where x->>'ano_mes' = '2031-06';
  if m->>'fonte' is distinct from 'fechamento' or (m->>'v_mes')::numeric is distinct from 360000.00 or (m->>'arrobas')::numeric is distinct from 1000.00 then
    raise exception 'T4 falhou: jun fonte % v_mes % arrobas %', m->>'fonte', m->>'v_mes', m->>'arrobas'; end if;
  select x into m from jsonb_array_elements(r->'meses') x where x->>'ano_mes' = '2031-03';
  if m->>'fonte' is distinct from 'cadastro' or m->'v_mes' is distinct from 'null'::jsonb or (m->>'arrobas')::numeric is distinct from 866.67 then
    raise exception 'T4 falhou: mar fonte % v_mes % arrobas % (esperado cadastro, null e 866.67)', m->>'fonte', m->'v_mes', m->>'arrobas'; end if;

  return 'T1–T4';
end $t$;

do $$
declare v text;
begin
  v := pg_temp.teste_dre_agio();
  raise exception 'OK dre_variacao_agio_01: % passaram (nada fica no banco)', v;
end $$;
