-- REBANHO-SEM-GADO-01 — teste da 118940 (quem entra no fechamento do rebanho de um mês). Roda como postgres; fixture SINTÉTICO no cliente
-- Teste (43f32d07): fazendas inventadas, pastos, lançamentos e o cache do mês. Termina em RAISE: nada fica.
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_vacas constant uuid := 'c67f09dc-1cd7-40e3-abe4-fa571156900e';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';   -- o dono da fazenda inventada (o gatilho põe o dono como membro)
  f_nada uuid; f_zera uuid; f_pasto uuid; f_gado uuid; s jsonb;
  n_reais int;
  p1 text; p2 text;
  st constant text := 'p1_mapa_pastos';
begin
  insert into fazendas (cliente_id, nome, codigo, owner_id) values (c_teste, 'SG Sem Nada', 'SG-NADA', u_admin) returning id into f_nada;
  insert into fazendas (cliente_id, nome, codigo, owner_id) values (c_teste, 'SG Zerou', 'SG-ZERA', u_admin) returning id into f_zera;
  insert into fazendas (cliente_id, nome, codigo, owner_id) values (c_teste, 'SG Só Pasto', 'SG-PASTO', u_admin) returning id into f_pasto;
  insert into fazendas (cliente_id, nome, codigo, owner_id) values (c_teste, 'SG Com Gado', 'SG-GADO', u_admin) returning id into f_gado;

  -- T1 sem pasto, sem saldo, sem movimento (a São João): fora do fechamento, os 2 pilares 'nao_aplicavel', em todo mês
  s := _fn_status_pilares_fechamento(f_nada, '2026-10');
  if s->st->>'status' <> 'nao_aplicavel' or s->'p2_valor_rebanho'->>'status' <> 'nao_aplicavel' then raise exception 'T1 FALHOU: %', s; end if;
  if (_fn_fazenda_rebanho_no_mes(f_nada, '2026-03')->>'no_fechamento')::boolean then raise exception 'T1 FALHOU: entrou em mar'; end if;
  -- a conta técnica de ajuste ('divergencia') não é pasto
  insert into pastos (fazenda_id, cliente_id, nome, tipo_uso, ativo) values (f_nada, c_teste, 'Ajuste', 'divergencia', true);
  if (_fn_fazenda_rebanho_no_mes(f_nada, '2026-10')->>'no_fechamento')::boolean then raise exception 'T1 FALHOU: a divergência contou como pasto'; end if;

  -- T2 zerou o gado em set (venda de tudo, sem pasto): set ENTRA (movimento), out SAI; nov volta com a compra (movimento)
  insert into lancamentos (fazenda_id, cliente_id, data, tipo, quantidade, categoria, cenario, status_operacional)
  values (f_zera, c_teste, '2026-09-15', 'venda', 5, 'vacas', 'realizado', 'realizado');
  insert into zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_id, categoria_codigo, saldo_inicial, saldo_final)
  values (f_zera, c_teste, 2026, 8, '2026-08', 'realizado', c_vacas, 'vacas', 5, 5), (f_zera, c_teste, 2026, 9, '2026-09', 'realizado', c_vacas, 'vacas', 5, 0);
  if not (_fn_fazenda_rebanho_no_mes(f_zera, '2026-09')->>'no_fechamento')::boolean then raise exception 'T2 FALHOU: o mês que zerou saiu'; end if;
  s := _fn_status_pilares_fechamento(f_zera, '2026-09');
  if s->'p2_valor_rebanho'->>'status' <> 'nao_aplicavel' then raise exception 'T2 FALHOU: pediu valor com saldo final 0 (%)', s; end if;
  s := _fn_status_pilares_fechamento(f_zera, '2026-10');
  if s->st->>'status' <> 'nao_aplicavel' or s->'p2_valor_rebanho'->>'status' <> 'nao_aplicavel' then raise exception 'T2 FALHOU: out devia sair (%)', s; end if;
  insert into lancamentos (fazenda_id, cliente_id, data, tipo, quantidade, categoria, cenario, status_operacional)
  values (f_zera, c_teste, '2026-11-10', 'compra', 3, 'vacas', 'realizado', 'realizado');
  if not (_fn_fazenda_rebanho_no_mes(f_zera, '2026-11')->>'no_fechamento')::boolean then raise exception 'T3 FALHOU: voltou gado e não voltou'; end if;
  -- lançamento META não conta (só o admin cria meta: os claims dele, como a tela faria)
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  insert into lancamentos (fazenda_id, cliente_id, data, tipo, quantidade, categoria, cenario, status_operacional)
  values (f_nada, c_teste, '2026-12-10', 'compra', 3, 'vacas', 'meta', null);
  if (_fn_fazenda_rebanho_no_mes(f_nada, '2026-12')->>'no_fechamento')::boolean then raise exception 'T3 FALHOU: a meta pôs no fechamento'; end if;

  -- T4 pasto cadastrado sem gado: ENTRA (o mapa de pastos segue o de hoje), mas o valor do rebanho não é pedido
  insert into pastos (fazenda_id, cliente_id, nome, tipo_uso, ativo) values (f_pasto, c_teste, 'Pasto 1', 'cria', true);
  s := _fn_status_pilares_fechamento(f_pasto, '2026-10');
  if s->st->>'status' <> 'nao_iniciado' or s->'p2_valor_rebanho'->>'status' <> 'nao_aplicavel' then raise exception 'T4 FALHOU: %', s; end if;
  -- pasto que só começa em dez não conta em out
  update pastos set data_inicio = '2026-12-01' where fazenda_id = f_pasto;
  if (_fn_fazenda_rebanho_no_mes(f_pasto, '2026-10')->>'no_fechamento')::boolean then raise exception 'T4 FALHOU: pasto fora da vigência contou'; end if;

  -- T5 com gado e o mês SEM linha no cache (nov sem cálculo ainda): herda o saldo de out → entra e o valor é 'nao_iniciado' (nunca "sem gado")
  insert into zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, ano_mes, cenario, categoria_id, categoria_codigo, saldo_inicial, saldo_final)
  values (f_gado, c_teste, 2026, 10, '2026-10', 'realizado', c_vacas, 'vacas', 40, 40),
         (f_gado, c_teste, 2026, 12, '2026-12', 'meta', c_vacas, 'vacas', 0, 0);
  s := _fn_status_pilares_fechamento(f_gado, '2026-11');
  if s->st->>'status' <> 'nao_iniciado' or s->'p2_valor_rebanho'->>'status' <> 'nao_iniciado' then raise exception 'T5 FALHOU: %', s; end if;
  if (_fn_fazenda_rebanho_no_mes(f_gado, '2026-11')->>'saldo_fim')::int <> 40 then raise exception 'T5 FALHOU: não herdou o saldo'; end if;

  -- T6 a fechada: o par de permissões (a regra é interna; a autoridade pública segue com a guarda)
  if has_function_privilege('authenticated', 'public._fn_fazenda_rebanho_no_mes(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public._fn_fazenda_rebanho_no_mes(uuid,text)', 'execute') then raise exception 'T6 FALHOU: a regra ficou aberta'; end if;

  -- T7 depois × antes nos clientes reais (2026, jan–nov): só a Faz. São João (Santa Rita) sai do fechamento — 11 meses-fazenda
  select count(*) into n_reais from fazendas f, generate_series(1, 11) g
   where f.status_operacional = 'ativa' and not f.eh_administrativa and f.cliente_id <> c_teste
     and (_fn_status_pilares_fechamento(f.id, to_char(make_date(2026, g, 1), 'YYYY-MM'))->'p1_mapa_pastos'->>'status') = 'nao_aplicavel';
  if n_reais <> 11 then raise exception 'T7 FALHOU: % meses-fazenda fora (esperado 11 = a São João)', n_reais; end if;

  raise exception 'OK REBANHO-SEM-GADO-01: T1–T7 verdes (nada fica)';
end $$;
