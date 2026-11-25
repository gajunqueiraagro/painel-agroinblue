-- CUSTO-FASE-01 F1 — teste do lote 118700 (fn_custo_por_fase + pec_custo_fase_regra). Roda como postgres DEPOIS da migration, na MESMA
-- transação, e termina em RAISE 'ENSAIO OK…' (nada fica no banco). Fixture sintético no cliente Teste (43f32d07), em 2031 (mês sem dado).
-- T1 invariante (sintético + real: NJ e Vera jan–out/26 e 2025) · T2 reprodução → cria (e a marcada vai para a fase dela) · T3 fase
-- marcada vai inteira · T4 sem base → "sem fase" · T5 uso do mês vazio entra pelo cadastro; divergência fora e listada · T6 base UA muda
-- só a divisão · T7 tenant (42501), anon sem EXECUTE, authenticated executa · T8 meta recusa · T9 reposição/juros/investimento/sem
-- fazenda fora e listados · M1–M4 mutações (cada uma derruba um T; a função volta conferida por md5).

create or replace function pg_temp.cf_fase(j jsonb, p_faz uuid, p_fase text, p_campo text) returns numeric language sql as $$
  select (g->>p_campo)::numeric from jsonb_array_elements(j->'fazendas') f, jsonb_array_elements(f->'fases') g
   where (f->>'fazenda_id')::uuid = p_faz and g->>'fase' = p_fase
$$;
create or replace function pg_temp.cf_faz(j jsonb, p_faz uuid) returns jsonb language sql as $$
  select f from jsonb_array_elements(j->'fazendas') f where (f->>'fazenda_id')::uuid = p_faz
$$;

-- os testes num lugar só: as mutações rodam os MESMOS testes e esperam que algum caia
create or replace function pg_temp.cf_testes(c uuid, f uuid) returns text language plpgsql as $$
declare j jsonb; u jsonb; fz jsonb; a numeric; v_ok text := ''; v_erro text; r record;
begin
  j := public.fn_custo_por_fase(c, '2031-01', '2031-03');
  fz := pg_temp.cf_faz(j, f);
  a := (fz->'dre'->>'adm')::numeric;
  if a is null or a <= 0 then raise exception 'T0 o fixture não tem administrativo rateado (adm %)', a; end if;

  -- T1 invariante no sintético: soma das fases + sem fase = DRE (variável 2.250 + fixo 400 + adm)
  if (fz->'dre'->>'variavel')::numeric <> 2250 or (fz->'dre'->>'fixo')::numeric <> 400 then raise exception 'T1 DRE do fixture %', fz->'dre'; end if;
  if abs((fz->>'diferenca')::numeric) >= 0.005 or not (j->'prova'->>'confere')::boolean then raise exception 'T1 invariante %', j->'prova'; end if;
  if (select sum((g->>'total')::numeric) from jsonb_array_elements(fz->'fases') g) + (fz->>'sem_fase')::numeric <> round(2650 + a, 2) then
    raise exception 'T1 soma arredondada %', fz; end if;
  v_ok := v_ok || 'T1 ok · ';

  -- T2 reprodução em branco (Sêmen 200) → cria; a marcada recria (Veterinário Reprodução 50) → recria
  if pg_temp.cf_fase(j, f, 'cria', 'reproducao') <> 200 or pg_temp.cf_fase(j, f, 'recria', 'reproducao') <> 0 then raise exception 'T2 reprodução %', fz->'fases'; end if;
  if pg_temp.cf_fase(j, f, 'recria', 'direto') <> 50 then raise exception 'T2 reprodução marcada recria %', fz->'fases'; end if;
  v_ok := v_ok || 'T2 ok · ';

  -- T3 marcada engorda (300, fev, mês sem cabeça de engorda) → engorda inteira
  if pg_temp.cf_fase(j, f, 'engorda', 'direto') <> 300 then raise exception 'T3 engorda marcada %', fz->'fases'; end if;
  v_ok := v_ok || 'T3 ok · ';

  -- T4 mar/31: só pasto de divergência → os 700 vão para "sem fase" com o motivo; nada vai para a fase vizinha
  if (fz->>'sem_fase')::numeric <> 700 then raise exception 'T4 sem fase %', fz->>'sem_fase'; end if;
  if not exists (select 1 from jsonb_array_elements(j->'sem_fase') s where s->>'ano_mes' = '2031-03' and (s->>'valor')::numeric = 700
                   and s->>'motivo' = 'nenhuma cabeça em cria, recria ou engorda no fechamento do mês') then raise exception 'T4 motivo %', j->'sem_fase'; end if;
  v_ok := v_ok || 'T4 ok · ';

  -- T5 rateado por cabeças: jan 1.000 × 60/30/10 + fev 400 × 50/50 (o pasto de uso vazio entra pelo cadastro = cria)
  if pg_temp.cf_fase(j, f, 'cria', 'rateado') <> 800 or pg_temp.cf_fase(j, f, 'recria', 'rateado') <> 500 or pg_temp.cf_fase(j, f, 'engorda', 'rateado') <> 100 then
    raise exception 'T5 rateado %', fz->'fases'; end if;
  if pg_temp.cf_fase(j, f, 'cria', 'cab_mes') <> 110 or pg_temp.cf_fase(j, f, 'recria', 'cab_mes') <> 80 or pg_temp.cf_fase(j, f, 'engorda', 'cab_mes') <> 10 then
    raise exception 'T5 cabeças-mês %', fz->'fases'; end if;
  if (select count(*) from jsonb_array_elements(j->'excluidos'->'cabecas_fora') x where (x->>'fazenda_id')::uuid = f and x->>'uso' = 'divergencia') <> 2
     or (select sum((x->>'cab')::int) from jsonb_array_elements(j->'excluidos'->'cabecas_fora') x where (x->>'fazenda_id')::uuid = f) <> 25 then
    raise exception 'T5 cabeças fora %', j->'excluidos'->'cabecas_fora'; end if;
  -- o administrativo pelas cabeças-mês do período: 110/80/10 de 200
  if abs(pg_temp.cf_fase(j, f, 'cria', 'adm') - round(a * 110 / 200, 2)) > 0.01 or abs(pg_temp.cf_fase(j, f, 'engorda', 'adm') - round(a * 10 / 200, 2)) > 0.01 then
    raise exception 'T5 adm % (DRE %)', fz->'fases', a; end if;
  v_ok := v_ok || 'T5 ok · ';

  -- T6 base UA: jan 40 / 16,667 / 10 UA, fev 22,2 / 22,2 → só a divisão muda; o total da fazenda e o sem fase ficam
  u := public.fn_custo_por_fase(c, '2031-01', '2031-03', 'realizado', 'ua');
  if pg_temp.cf_fase(u, f, 'recria', 'rateado') <> 450 or pg_temp.cf_fase(u, f, 'engorda', 'rateado') <> 150 or pg_temp.cf_fase(u, f, 'cria', 'rateado') <> 800 then
    raise exception 'T6 rateado UA %', pg_temp.cf_faz(u, f)->'fases'; end if;
  if pg_temp.cf_faz(u, f)->'dre' <> fz->'dre' or pg_temp.cf_faz(u, f)->>'sem_fase' <> fz->>'sem_fase' or not (u->'prova'->>'confere')::boolean then
    raise exception 'T6 totais UA × cabeças'; end if;
  v_ok := v_ok || 'T6 ok · ';

  -- T8 meta recusa; período ao contrário recusa
  begin perform public.fn_custo_por_fase(c, '2031-01', '2031-03', 'meta'); raise exception 'T8 meta passou';
  exception when sqlstate '22023' then null; end;
  begin perform public.fn_custo_por_fase(c, '2031-03', '2031-01'); raise exception 'T8 período passou';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok || 'T8 ok · ';

  -- T9 fora e listados: reposição 5.000 · juros 90 · investimento 800 · sem fazenda 0 (o banco recusa custo sem fazenda: _fn_trg_regra_fazenda_lancamento)
  if (j->'excluidos'->>'reposicao')::numeric <> 5000 or (j->'excluidos'->>'juros')::numeric <> 90 or (j->'excluidos'->>'investimento')::numeric <> 800
     or (j->'excluidos'->>'sem_fazenda')::numeric <> 0 then raise exception 'T9 excluídos %', j->'excluidos'; end if;
  v_ok := v_ok || 'T9 ok · ';
  return v_ok;
end $$;

do $t$
declare
  c uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_outro text := '9e07dfb1-27f1-4fd7-8f0e-605e4ed56e70';
  c_cat uuid := '160cc8d8-79e1-420e-9fec-e35e9e3b1e5f';
  f uuid; p_c uuid; p_r uuid; p_e uuid; p_d uuid; p_v uuid; fp uuid;
  v_ok text; v_real text := ''; v_mut text := ''; j jsonb; r record; t0 timestamptz; seg numeric; v_md5 text; v_def text; v_mutada text;
begin
  set local statement_timeout = '120s'; set local lock_timeout = '2s';
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ═══ o fixture (2031, cliente Teste) ═══
  insert into fazendas (cliente_id, nome, codigo, owner_id) values (c, 'CFT Ensaio custo por fase', 'CFT', c_admin::uuid) returning id into f;
  insert into pastos (fazenda_id, nome, tipo_uso) values (f, 'CFT cria', 'cria') returning id into p_c;
  insert into pastos (fazenda_id, nome, tipo_uso) values (f, 'CFT recria', 'recria') returning id into p_r;
  insert into pastos (fazenda_id, nome, tipo_uso) values (f, 'CFT engorda', 'engorda') returning id into p_e;
  insert into pastos (fazenda_id, nome, tipo_uso) values (f, 'CFT divergencia', 'divergencia') returning id into p_d;
  insert into pastos (fazenda_id, nome, tipo_uso) values (f, 'CFT vazio', 'cria') returning id into p_v;
  for r in select * from (values
      (p_c, '2031-01', 'cria', 60, 300), (p_r, '2031-01', 'recria', 30, 250), (p_e, '2031-01', 'engorda', 10, 450), (p_d, '2031-01', 'divergencia', 5, 300),
      (p_v, '2031-02', null, 50, 200), (p_r, '2031-02', 'recria', 50, 200),
      (p_d, '2031-03', 'divergencia', 20, 300)) x(pasto, am, uso, cab, pm) loop
    insert into fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status, tipo_uso_mes) values (r.pasto, f, c, r.am, 'fechado', r.uso) returning id into fp;
    insert into fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, peso_total) values (fp, c_cat, r.cab, r.pm, r.cab * r.pm);
  end loop;
  -- o rebanho do zoot (o DRE rateia o administrativo pelas cabeças médias dele)
  insert into zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_codigo, categoria_nome, ordem_exibicao,
                                 saldo_inicial, saldo_final, peso_medio_inicial, peso_medio_final)
  select f, c, extract(year from d)::int, extract(month from d)::int, to_char(d, 'YYYY-MM'), 'realizado', 'desmama_f', 'Desmama F', 1, 100, 100, 300, 300
    from generate_series(date '2030-12-01', date '2031-03-01', interval '1 month') d;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, plano_conta_id, valor, tipo_operacao, status_transacao, cenario,
                                         data_competencia, data_vencimento, descricao, fase)
  select c, x.faz, x.plano::uuid, x.valor, '2-Saídas', 'programado', 'realizado', x.dt::date, x.dt::date, 'ensaio custo por fase', x.fase
    from (values
      (f,    'fab50865-1fee-449c-be8e-4e99f0d2ca9c', 1000, '2031-01-10', null),       -- variável em branco → rateia (jan)
      (f,    'fa428773-78c9-4662-91ee-4cb8a6024457',  200, '2031-01-11', null),       -- Sêmen e IATF em branco → cria
      (f,    '85335d2f-7c76-4c19-8274-dfcc1ce8bdb5',   50, '2031-01-12', 'recria'),   -- Veterinário Reprodução marcada recria
      (f,    '126f80b9-482e-48cc-89e4-5f9b2a64b1f7',  400, '2031-02-10', null),       -- fixo em branco → rateia (fev, uso vazio = cadastro)
      (f,    'fab50865-1fee-449c-be8e-4e99f0d2ca9c',  300, '2031-02-11', 'engorda'),  -- marcada engorda, fev sem engorda
      (f,    'fab50865-1fee-449c-be8e-4e99f0d2ca9c',  700, '2031-03-10', null),       -- mar: só divergência → sem fase
      (f,    '62d390b5-1f05-4375-b998-55ab32e62d43', 5000, '2031-01-13', null),       -- reposição: fora
      (f,    '9b10cc50-858a-4fa4-94c9-337e8258f81f',  800, '2031-01-14', null),       -- investimento: fora
      (f,    '5d4a5c70-311d-4302-98f0-b2846d9738fc',   90, '2031-01-15', null),       -- juros: fora
      (f,    '47764d91-8b74-4eb0-b580-33e00424f2a2', 1200, '2031-01-17', null)        -- administrativo: o DRE rateia à fazenda
    ) x(faz, plano, valor, dt, fase);

  -- ═══ T1–T9 no fixture ═══
  v_ok := pg_temp.cf_testes(c, f);

  -- T7 tenant: outro usuário → 42501; anon sem EXECUTE; o admin como `authenticated` executa
  if has_function_privilege('anon', 'public.fn_custo_por_fase(uuid, text, text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_custo_por_fase(uuid, text, text, text, text)', 'execute') then raise exception 'T7 ACL'; end if;
  if has_table_privilege('authenticated', 'public.pec_custo_fase_regra', 'insert') or has_table_privilege('anon', 'public.pec_custo_fase_regra', 'select') then
    raise exception 'T7 ACL da regra'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_outro, 'role', 'authenticated')::text, true);
  begin perform public.fn_custo_por_fase(c, '2031-01', '2031-03'); raise exception 'T7 outro cliente passou';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.fn_custo_por_fase(c, '2031-01', '2031-03');
  if (select count(*) from public.pec_custo_fase_regra) <> 3 then raise exception 'T7 authenticated não lê a regra'; end if;
  reset role;
  if not (j->'prova'->>'confere')::boolean then raise exception 'T7 como authenticated'; end if;
  v_ok := v_ok || 'T7 ok · ';

  -- ═══ T1 no REAL: o invariante ao centavo e o tempo (B4 a: < 3 s por cliente-ano) ═══
  for r in select * from (values
      ('NJ jan–out/26', 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'::uuid, '2026-01', '2026-10'),
      ('Vera jan–out/26', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, '2026-01', '2026-10'),
      ('NJ 2025', 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'::uuid, '2025-01', '2025-12'),
      ('Vera 2025', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, '2025-01', '2025-12')) x(rot, cli, de, ate) loop
    t0 := clock_timestamp();
    j := public.fn_custo_por_fase(r.cli, r.de, r.ate);
    seg := round(extract(epoch from clock_timestamp() - t0)::numeric, 2);
    if not (j->'prova'->>'confere')::boolean
       /* a soma dos totais JÁ arredondados por fazenda pode diferir do total arredondado em até 1 centavo por fazenda (Vera: valores de 3 casas) */
       or abs((j->'prova'->>'dre_total')::numeric - (select sum((x->'dre'->>'total')::numeric) from jsonb_array_elements(j->'fazendas') x)) > 0.01 * jsonb_array_length(j->'fazendas')
       or (select bool_or(abs((x->>'ajuste_arredondamento')::numeric) > 0.03) from jsonb_array_elements(j->'fazendas') x) then
      raise exception 'T1 real % %', r.rot, j->'prova'; end if;
    if seg > 3 then raise exception 'T1 real % levou % s (B4 a pede < 3 s)', r.rot, seg; end if;
    v_real := v_real || format('%s: DRE %s = fases %s + sem fase %s (dif %s, ajuste %s, %s s) | ', r.rot, j->'prova'->>'dre_total',
      (select round(sum((g->>'total')::numeric), 2) from jsonb_array_elements(j->'fazendas') x, jsonb_array_elements(x->'fases') g),
      (select round(sum((x->>'sem_fase')::numeric), 2) from jsonb_array_elements(j->'fazendas') x),
      j->'prova'->>'diferenca', j->'prova'->>'ajuste_arredondamento', seg);
  end loop;

  -- ═══ MUTAÇÕES: cada uma troca UM trecho do corpo, os testes têm de cair, e o corpo volta conferido por md5 ═══
  select md5(prosrc), pg_get_functiondef(oid) into v_md5, v_def from pg_proc where oid = 'public.fn_custo_por_fase(uuid, text, text, text, text)'::regprocedure;
  for r in select * from (values
      ('M1 regra da reprodução desligada', $$r.regra = 'cria'$$, $$r.regra = 'xx'$$),
      ('M2 só o tipo_uso_mes, sem o cadastro', $$coalesce(nullif(fp.tipo_uso_mes, ''), pa.tipo_uso) uso$$, $$nullif(fp.tipo_uso_mes, '') uso$$),
      ('M3 fase marcada ignorada', $$case when l.fase in ('cria', 'recria', 'engorda') then l.fase end fase_marcada$$, $$null::text fase_marcada$$),
      ('M4 sem fase some', $$where coalesce((select m.wt from basem m where m.fazenda_id = r.fazenda_id and m.am = r.am), 0) = 0$$, $$where false$$)) m(rot, de, para) loop
    v_mutada := replace(v_def, r.de, r.para);
    if v_mutada = v_def then raise exception '% não achou o trecho', r.rot; end if;
    execute v_mutada;
    begin
      perform pg_temp.cf_testes(c, f);
      raise exception 'MUTACAO_SOBREVIVEU';
    exception when others then
      if sqlerrm = 'MUTACAO_SOBREVIVEU' then raise exception '% sobreviveu: nenhum teste caiu', r.rot; end if;
      v_mut := v_mut || format('%s → caiu: %s | ', r.rot, left(split_part(sqlerrm, ' ', 1) || ' ' || split_part(sqlerrm, ' ', 2), 40));
    end;
    execute v_def;
    if (select md5(prosrc) from pg_proc where oid = 'public.fn_custo_por_fase(uuid, text, text, text, text)'::regprocedure) <> v_md5 then
      raise exception '% o corpo não voltou', r.rot; end if;
  end loop;

  raise exception 'ENSAIO OK custo por fase · fixture: % · real: % · mutações: % · corpo md5 %', v_ok, v_real, v_mut, v_md5;
end $t$;
