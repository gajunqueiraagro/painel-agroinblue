-- DRE-VARIACAO-EXPLICA-01 fatia 1a — teste da migration 20261028115300 (o agio e a serie mensal na fn_dre_pecuaria_patrimonio),
-- ATUALIZADO pela REBANHO-AGIO-PROVISORIO-01 (20261028115600, Gabriel 19/11): o ágio passou a ser ENCADEADO mês a mês (cada mês ao preço
-- do SEU início) e saiu da produção (vai para o mercado). O fixture ganhou o que o dado real tem — o fechamento validado de todo mês
-- (menos mar, que segue pelo cadastro para a V4) e a tabela de preços do início do mês da troca —; sem ele o gado "sumia" nos meses
-- sem dado e o ágio do mês da troca não tinha o preço do destino.
-- Roda como postgres com a 115290, a 115300 e a 115600 aplicadas; fixture sintetico no cliente Teste (43f32d07), 2030-12 a 2031-06
-- (sem dado nenhum); termina em RAISE 'OK…' (nada fica). O corpo e' pg_temp.teste_dre_agio(), o mesmo que o arquivo de mutacoes chama.
--
-- Fixture (uma fazenda):
--   fechamentos VALIDADOS: dez/30 100 Desmama M x 200 kg · jan 210 · fev 220 (R$ 14/kg) · abr 100 Garrotes x 275 · mai 290 · jun 300 (R$ 12/kg)
--   2031-03 reclassificacao: 100 Desmama M -> Garrotes a 250 kg; mar sem fechamento: o cadastro (desmama 100 x 220 → 0, garrotes 0 → 100 x 260)
--   tabela de precos de fev (o inicio de mar): Garrotes R$ 12/kg; cadastro de abr (o inicio): 100 Garrotes x 260 kg
--   Esperado: a producao de cada mes ao preco do seu inicio — jan 14.000 · fev 14.000 · mar 312.000 − 308.000 − agio = 54.000 ·
--   abr 18.000 · mai 18.000 · jun 12.000 = 130.000; agio (no destino, Garrotes, em mar) = 100 x 250 x (12 - 14) = -50.000, dentro do
--   efeito (360.000 − 410.000 = −50.000); o total segue 80.000 (= 360.000 − 280.000).
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
  values (c_faz, c_cli, '2030-12', 'desmama_m', 100, 200, 14, 280000), (c_faz, c_cli, '2031-01', 'desmama_m', 100, 210, 14, 294000),
         (c_faz, c_cli, '2031-02', 'desmama_m', 100, 220, 14, 308000), (c_faz, c_cli, '2031-04', 'garrotes', 100, 275, 12, 330000),
         (c_faz, c_cli, '2031-05', 'garrotes', 100, 290, 12, 348000), (c_faz, c_cli, '2031-06', 'garrotes', 100, 300, 12, 360000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2030-12', 'validado', 280000, 100), (c_faz, c_cli, '2031-01', 'validado', 294000, 100),
         (c_faz, c_cli, '2031-02', 'validado', 308000, 100), (c_faz, c_cli, '2031-04', 'validado', 330000, 100),
         (c_faz, c_cli, '2031-05', 'validado', 348000, 100), (c_faz, c_cli, '2031-06', 'validado', 360000, 100);
  insert into public.valor_rebanho_mensal (fazenda_id, cliente_id, ano_mes, categoria, preco_kg)
  values (c_faz, c_cli, '2031-02', 'garrotes', 12);
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-03-15', 'reclassificacao', 'desmama_m', 'garrotes', 100, 250, 'realizado', 'realizado');
  /* o cadastro de mar (sem fechamento validado) e o inicio de abr: o mes do meio da V4 sai dele, sem valor do mes */
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 0, 220, null),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'garrotes', 'Garrotes', 3, 0, 100, null, 260),
         (c_faz, c_cli, 2031, 4, '2031-04', 'realizado', 'garrotes', 'Garrotes', 3, 100, 100, 260, 275);

  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-01', '2031-06');
  select x into g from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'garrotes';
  select x into d from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'desmama_m';

  -- T1 o agio vai na categoria de DESTINO, ao preco do INICIO do mes da troca (garrote R$ 12 da tabela de fev, desmama R$ 14 do fechamento de fev)
  if (g->>'agio')::numeric is distinct from -50000.00 then raise exception 'T1 falhou: agio dos garrotes % (esperado -50000.00)', g->>'agio'; end if;
  if (d->>'agio')::numeric is distinct from 0 then raise exception 'T1 falhou: agio da desmama % (esperado 0: a origem nao leva)', d->>'agio'; end if;
  if (g->>'agio_sem_preco')::boolean then raise exception 'T1 falhou: garrotes sem preco'; end if;

  -- T2 as cabecas e arrobas reclassificadas (entrou no destino, saiu da origem)
  if (g->>'cab_reclass_entrada')::numeric is distinct from 100 or (d->>'cab_reclass_saida')::numeric is distinct from 100
     or (g->>'at_reclass_entrada')::numeric is distinct from 833.33 then
    raise exception 'T2 falhou: garrotes entrada % (% @), desmama saida %', g->>'cab_reclass_entrada', g->>'at_reclass_entrada', d->>'cab_reclass_saida'; end if;

  -- T3 o total (REBANHO-AGIO-PROVISORIO-01): agio -50.000 FORA da producao (vpb 130.000 = a soma dos meses) e DENTRO do efeito (-50.000);
  -- o total econômico segue 80.000
  if (r->'total'->>'agio')::numeric is distinct from -50000.00 or (r->'total'->>'troca_categoria')::numeric is distinct from -50000.00
     or (r->'total'->>'vpb')::numeric is distinct from 130000.00 or (r->'total'->>'efeito')::numeric is distinct from -50000.00
     or (r->'total'->>'vpb')::numeric + (r->'total'->>'efeito')::numeric is distinct from 80000.00 then
    raise exception 'T3 falhou: total agio % troca % vpb % efeito %', r->'total'->>'agio', r->'total'->>'troca_categoria', r->'total'->>'vpb', r->'total'->>'efeito'; end if;

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
