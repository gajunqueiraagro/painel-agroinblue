-- REBANHO-AGIO-PROVISORIO-01 — teste da migration 20261028115600 (mudar de categoria não muda valor; o período = a soma dos meses).
-- Roda como postgres com a 115600 aplicada; fixture sintético no cliente Teste (43f32d07), 2030-12 a 2031-03 (sem dado nenhum);
-- termina em RAISE 'OK…' (nada fica). O corpo é pg_temp.teste_agio_prov(), o mesmo que o arquivo de mutações chama.
--
-- Fixture (uma fazenda, o cadastro de TODO mês, como no dado real):
--   2030-12 fechamento VALIDADO: 100 Desmama M x 200 kg a R$ 14/kg (= 280.000)
--   2031-01 cadastro: desmama 100 x 200 → 220 kg · 2031-02: 220 → 240 kg, e o fechamento VALIDADO de fev 100 x 240 a R$ 14 (= 336.000;
--     sem ele o DRE de fev não lista a fazenda — mês só com cadastro, de hoje — e o preço é o mesmo: nada muda na conta)
--   2031-03 reclassificação (15/03): 100 Desmama M → Garrotes a 250 kg; cadastro desmama 100 x 240 → 0, garrotes 0 → 100 x 260
--   2031-03 fechamento VALIDADO: 100 Garrotes x 260 kg a R$ 12/kg (= 312.000)
-- Esperado (à mão), mês a mês, cada um ao preço do SEU início:
--   jan: 100 x 20 kg x 14 = 28.000 · fev: 28.000 · mar: (312.000 − 336.000) − ágio, ágio = 25.000 kg x (12 − 14) = −50.000 → 26.000
--   período: produção 82.000 (= a soma), troca −50.000, mercado = 312.000 − (280.000 + 82.000) = −50.000; total 32.000 = 312.000 − 280.000
set local statement_timeout = '30s';
set local lock_timeout = '2s';

create function pg_temp.teste_agio_prov() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; g jsonb; d jsonb; l jsonb; s numeric := 0; m text;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  insert into public.valor_rebanho_fechamento_itens (fazenda_id, cliente_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria)
  values (c_faz, c_cli, '2030-12', 'desmama_m', 100, 200, 14, 280000), (c_faz, c_cli, '2031-02', 'desmama_m', 100, 240, 14, 336000),
         (c_faz, c_cli, '2031-03', 'garrotes', 100, 260, 12, 312000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2030-12', 'validado', 280000, 100), (c_faz, c_cli, '2031-02', 'validado', 336000, 100),
         (c_faz, c_cli, '2031-03', 'validado', 312000, 100);
  insert into public.lancamentos (fazenda_id, cliente_id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg, cenario, status_operacional)
  values (c_faz, c_cli, '2031-03-15', 'reclassificacao', 'desmama_m', 'garrotes', 100, 250, 'realizado', 'realizado');
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 1, '2031-01', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 100, 200, 220),
         (c_faz, c_cli, 2031, 2, '2031-02', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 100, 220, 240),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'desmama_m', 'Desmama M', 2, 100, 0, 240, null),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'garrotes', 'Garrotes', 3, 0, 100, null, 260);

  -- T1 o mês da troca (modal): o ágio no DESTINO; a produção sem ele; o mercado do mês = a troca
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-03', '2031-03');
  select x into g from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'garrotes';
  select x into d from jsonb_array_elements(r->'categorias') x where x->>'categoria' = 'desmama_m';
  if (g->>'troca_categoria')::numeric is distinct from -50000.00 or (g->>'agio')::numeric is distinct from -50000.00
     or (d->>'troca_categoria')::numeric is distinct from 0 then
    raise exception 'T1 falhou: troca garrotes % (agio %), desmama % (esperado -50000, -50000, 0)', g->>'troca_categoria', g->>'agio', d->>'troca_categoria'; end if;
  if (r->'total'->>'vpb')::numeric is distinct from 26000.00 or (r->'total'->>'efeito')::numeric is distinct from -50000.00
     or (r->'total'->>'troca_categoria')::numeric is distinct from -50000.00 then
    raise exception 'T1 falhou: mar vpb % efeito % troca % (esperado 26000, -50000, -50000)', r->'total'->>'vpb', r->'total'->>'efeito', r->'total'->>'troca_categoria'; end if;

  -- T2 o período (modal) = a soma dos meses; o total econômico (fim − início) de sempre
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-01', '2031-03');
  if (r->'total'->>'vpb')::numeric is distinct from 82000.00 or (r->'total'->>'efeito')::numeric is distinct from -50000.00
     or (r->'total'->>'troca_categoria')::numeric is distinct from -50000.00
     or (r->'total'->>'v1_p1')::numeric - (r->'total'->>'v0')::numeric is distinct from 32000.00 then
    raise exception 'T2 falhou: período vpb % efeito % troca % v0 % v1_p1 % (esperado 82000, -50000, -50000, total 32000)',
      r->'total'->>'vpb', r->'total'->>'efeito', r->'total'->>'troca_categoria', r->'total'->>'v0', r->'total'->>'v1_p1'; end if;

  -- T3 o DRE dá o mesmo do modal, no mês e no período; o período = Σ dos 3 meses
  foreach m in array array['2031-01','2031-02','2031-03'] loop
    select x->'linhas' into l from jsonb_array_elements(public.fn_dre_pecuaria(c_cli, m, m, 'realizado')->'fazendas') x where (x->>'fazenda_id')::uuid = c_faz;
    s := s + (l->>'vpb_operacional')::numeric;
  end loop;
  if s is distinct from 82000.00 then raise exception 'T3 falhou: Σ dos meses no DRE % (esperado 82000)', s; end if;
  select x->'linhas' into l from jsonb_array_elements(public.fn_dre_pecuaria(c_cli, '2031-01', '2031-03', 'realizado')->'fazendas') x where (x->>'fazenda_id')::uuid = c_faz;
  if (l->>'vpb_operacional')::numeric is distinct from 82000.00 or (l->>'efeito_mercado')::numeric is distinct from -50000.00
     or (l->'patrimonio'->>'troca_categoria')::numeric is distinct from -50000.00 then
    raise exception 'T3 falhou: DRE período vpb % mercado % troca % (esperado 82000, -50000, -50000)',
      l->>'vpb_operacional', l->>'efeito_mercado', l->'patrimonio'->>'troca_categoria'; end if;

  -- T4 a meta não muda: sem troca de categoria no payload
  select x->'linhas' into l from jsonb_array_elements(public.fn_dre_pecuaria(c_cli, '2031-01', '2031-03', 'meta')->'fazendas') x where (x->>'fazenda_id')::uuid = c_faz;
  if l is not null and (l->'patrimonio'->>'troca_categoria')::numeric is distinct from 0 then
    raise exception 'T4 falhou: meta com troca %', l->'patrimonio'->>'troca_categoria'; end if;

  return 'T1–T4';
end $t$;

do $$
declare v text; n numeric;
begin
  v := pg_temp.teste_agio_prov();
  -- T5 quem a tela chama (authenticated) roda: as 2 funções são SECURITY DEFINER e os ajudantes fechados não barram
  set local role authenticated;
  n := (public.fn_dre_pecuaria_patrimonio('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '2031-01', '2031-03')->'total'->>'vpb')::numeric;
  if n is distinct from 82000.00 then raise exception 'T5 falhou: como authenticated vpb %', n; end if;
  begin
    perform public._fn_rebanho_producao_encadeada('43f32d07-dba8-4670-900c-bf645440c04a', null, '2031-01', '2031-03');
    raise exception 'T5 falhou: o ajudante abriu para authenticated';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise exception 'OK rebanho_agio_provisorio: % e T5 passaram (nada fica no banco)', v;
end $$;
