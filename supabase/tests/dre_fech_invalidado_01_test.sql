-- DRE-FECH-INVALIDADO-01 — teste da migration 20261028115290 (fn_dre_pecuaria e fn_dre_pecuaria_patrimonio so' leem item VALIDADO).
-- Roda como postgres; fixture sintetico no cliente Teste (43f32d07), ano 2031 (sem dado nenhum); termina em RAISE 'OK…' (nada fica).
-- O corpo dos testes e' a funcao pg_temp.teste_dre_fech_invalidado(), a mesma que o arquivo de mutacoes chama.
--
-- Fixture (Vacas, uma fazenda):
--   2031-01 fechamento VALIDADO:   100 cab x 400 kg a R$ 10/kg  (= 400.000)
--   2031-02 fechamento INVALIDADO: 100 cab x 400 kg a R$ 12/kg  (os itens ficam, como a BG set/26)
--   2031-03 sem fechamento
--   cadastro (zoot_mensal_cache) de fev e mar: 100 cab a 410 kg
set local statement_timeout = '20s';
set local lock_timeout = '2s';

create function pg_temp.teste_dre_fech_invalidado() returns text language plpgsql as $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; f jsonb; m text;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  insert into public.valor_rebanho_fechamento_itens (fazenda_id, cliente_id, ano_mes, categoria, quantidade, peso_medio_kg, preco_kg, valor_total_categoria)
  values (c_faz, c_cli, '2031-01', 'vacas', 100, 400, 10, 400000), (c_faz, c_cli, '2031-02', 'vacas', 100, 400, 12, 480000);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status, valor_total, cabecas)
  values (c_faz, c_cli, '2031-01', 'validado', 400000, 100), (c_faz, c_cli, '2031-02', 'invalidado', 480000, 100);
  insert into public.zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                        saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  values (c_faz, c_cli, 2031, 2, '2031-02', 'realizado', 'vacas', 'Vacas', 9, 100, 100, 410, 410),
         (c_faz, c_cli, 2031, 3, '2031-03', 'realizado', 'vacas', 'Vacas', 9, 100, 100, 410, 410);

  -- T1 o fechamento INVALIDADO nao e' a foto de P1: fev vem do cadastro (410 kg) ao preco de P0 (jan, R$ 10), nao do item (400 kg, R$ 12)
  r := public.fn_dre_pecuaria(c_cli, '2031-02', '2031-02', 'realizado');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f->'linhas'->>'p1_fonte' is distinct from 'cadastro' then raise exception 'T1 falhou: p1_fonte % (esperado cadastro)', f->'linhas'->>'p1_fonte'; end if;
  if (f->'linhas'->'patrimonio'->>'v_fim_p1')::numeric is distinct from 410000.00 then
    raise exception 'T1 falhou: v_fim_p1 % (esperado 410000.00)', f->'linhas'->'patrimonio'->>'v_fim_p1'; end if;
  if (f->'linhas'->>'vpb_operacional')::numeric is distinct from 10000.00 then
    raise exception 'T1 falhou: vpb % (esperado 10000.00)', f->'linhas'->>'vpb_operacional'; end if;

  -- T2 P0 sem fechamento VALIDADO (fev invalidado) = cadastro ao preco do ULTIMO validado (jan, R$ 10) — nunca zero, nunca o de fev
  r := public.fn_dre_pecuaria(c_cli, '2031-03', '2031-03', 'realizado');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f->'linhas'->>'p0_fonte' is distinct from 'cadastro' then raise exception 'T2 falhou: p0_fonte % (esperado cadastro)', f->'linhas'->>'p0_fonte'; end if;
  if (f->'linhas'->'patrimonio'->>'v_ini_p0')::numeric is distinct from 410000.00 then
    raise exception 'T2 falhou: v_ini_p0 % (esperado 410000.00 = 100 x 410 x 10)', f->'linhas'->'patrimonio'->>'v_ini_p0'; end if;

  -- T3 o modal le^ a mesma foto: fev do cadastro, mar comecando do cadastro ao preco de jan
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-02', '2031-02');
  if r->>'p1_fonte' is distinct from 'cadastro' or (r->'total'->>'v1_p1')::numeric is distinct from 410000.00 then
    raise exception 'T3 falhou: modal fev p1_fonte % v1_p1 %', r->>'p1_fonte', r->'total'->>'v1_p1'; end if;
  r := public.fn_dre_pecuaria_patrimonio(c_cli, c_faz, '2031-03', '2031-03');
  if r->>'p0_fonte' is distinct from 'cadastro' or (r->'total'->>'v0')::numeric is distinct from 410000.00 then
    raise exception 'T3 falhou: modal mar p0_fonte % v0 %', r->>'p0_fonte', r->'total'->>'v0'; end if;

  -- T4 o ramo da META tambem: cab_ini de mar nao conta o fechamento invalidado de fev
  r := public.fn_dre_pecuaria(c_cli, '2031-03', '2031-03', 'meta');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f is null then raise exception 'T4 falhou: a fazenda sumiu do DRE meta'; end if;
  if (f->'linhas'->'patrimonio'->>'cab_ini')::numeric is distinct from 0 then
    raise exception 'T4 falhou: cab_ini % (esperado 0)', f->'linhas'->'patrimonio'->>'cab_ini'; end if;

  -- T5 o mes VALIDADO segue sendo a foto: P0 de fev = jan (400 kg, R$ 10)
  r := public.fn_dre_pecuaria(c_cli, '2031-02', '2031-02', 'realizado');
  select x into f from jsonb_array_elements(r->'fazendas') x where x->>'fazenda_id' = c_faz::text;
  if f->'linhas'->>'p0_fonte' is distinct from 'fechamento' or (f->'linhas'->'patrimonio'->>'v_ini_p0')::numeric is distinct from 400000.00 then
    raise exception 'T5 falhou: p0_fonte % v_ini_p0 %', f->'linhas'->>'p0_fonte', f->'linhas'->'patrimonio'->>'v_ini_p0'; end if;

  return 'T1–T5';
end $t$;

do $$
declare v text;
begin
  v := pg_temp.teste_dre_fech_invalidado();
  raise exception 'OK dre_fech_invalidado_01: % passaram (nada fica no banco)', v;
end $$;
