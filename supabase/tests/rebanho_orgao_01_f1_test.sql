-- REBANHO-ORGAO-01 · F1 · teste (roda como postgres; termina em RAISE 'OK…'; nada fica no banco). Fixture SINTÉTICO no cliente Teste: uma
-- fazenda nova de MS e os lançamentos dela. As RPCs rodam como `authenticated` (o admin do Teste); T2/T9 usam um gestor real de OUTRO cliente,
-- só para provar a recusa (42501) e o que a RLS deixa ver.
do $$
declare
  A uuid := '43f32d07-dba8-4670-900c-bf645440c04a';   -- cliente Teste
  ADM uuid; G uuid; GC uuid;
  FZ uuid; ET uuid;
  n1 uuid; n2 uuid; r1 uuid; m0 uuid; m1 uuid; c1 uuid; v1 uuid; vmeta uuid; vprog uuid; vcanc uuid; a1 uuid; mfora uuid; cp1 uuid;
  f jsonb; r jsonb; ok boolean; D uuid; vv int; n int;
begin
  select user_id into ADM from cliente_membros where cliente_id = A and perfil = 'admin_agroinblue' and ativo limit 1;
  select m2.user_id, m2.cliente_id into G, GC from cliente_membros m2
   where m2.ativo and m2.perfil = 'gestor_cliente' and m2.cliente_id <> A
     and not exists (select 1 from cliente_membros a where a.user_id = m2.user_id and a.perfil = 'admin_agroinblue')
     and (select count(*) from cliente_membros x where x.user_id = m2.user_id and x.ativo) = 1
   order by m2.user_id limit 1;
  if ADM is null or G is null then raise exception 'T0: sem admin do Teste ou sem gestor para provar'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- o fixture (como postgres, com o admin nas claims para as guardas do rebanho)
  insert into fazendas (cliente_id, nome, codigo, tem_pecuaria, owner_id) values (A, 'Fazenda Sintetica Orgao F1', 'ORGF1', true, ADM) returning id into FZ;
  insert into fazenda_cadastros (fazenda_id, cliente_id, estado) values (FZ, A, ' ms ');
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-01-01', 'nascimento', 'mamotes_f', 10, 'realizado', 'realizado') returning id into n1;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-07-01', 'nascimento', 'novilhas', 4, 'realizado', 'realizado') returning id into n2;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg, cenario, status_operacional) values
    (A, FZ, '2026-07-15', 'reclassificacao', 'novilhas', 'mamotes_m', 4, 30, 'realizado', 'realizado') returning id into r1;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-05-01', 'morte', 'vacas', 1, 'realizado', 'realizado') returning id into m0;      -- antes do desde
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-06-10', 'morte', 'vacas', 2, 'realizado', 'realizado') returning id into m1;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-08-01', 'consumo', 'garrotes', 1, 'realizado', 'realizado') returning id into c1;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-08-04', 'venda', 'bois', 60, 'realizado', 'realizado') returning id into v1;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario) values
    (A, FZ, '2026-08-05', 'venda', 'bois', 5, 'meta') returning id into vmeta;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-09-01', 'venda', 'bois', 7, 'realizado', 'programado') returning id into vprog;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional, cancelado) values
    (A, FZ, '2026-09-02', 'venda', 'bois', 8, 'realizado', 'realizado', true) returning id into vcanc;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, peso_medio_kg, cenario, status_operacional) values
    (A, FZ, '2026-09-10', 'ajuste_entrada', 'vacas', 1, 400, 'realizado', 'realizado') returning id into a1;
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-12-15', 'morte', 'vacas', 3, 'realizado', 'realizado') returning id into mfora;   -- depois do até
  insert into lancamentos (cliente_id, fazenda_id, data, tipo, categoria, quantidade, cenario, status_operacional) values
    (A, FZ, '2026-05-01', 'compra', 'garrotes', 9, 'realizado', 'realizado') returning id into cp1;  -- 3 dias antes do desde: entra (±10)
  delete from zoot_mensal_cache where fazenda_id = FZ;
  insert into zoot_mensal_cache (fazenda_id, cliente_id, ano, mes, cenario, ano_mes, categoria_codigo, ordem_exibicao, saldo_final) values
    (FZ, A, 2026, 10, 'realizado', '2026-10', 'vacas', 9, 40), (FZ, A, 2026, 11, 'realizado', '2026-11', 'vacas', 9, 50),
    (FZ, A, 2026, 11, 'realizado', '2026-11', 'touros', 5, 0), (FZ, A, 2026, 12, 'realizado', '2026-12', 'vacas', 9, 47),
    (FZ, A, 2026, 11, 'meta', '2026-11', 'vacas', 9, 999);
  select id into ET from orgao_etapas where uf = 'MS' and tipo = 'declaracao' and inicio = '2026-11-01';

  set local role authenticated;
  -- T1 os FATOS: só o realizado que aconteceu, a janela (desde, até], nascimentos/reclassificações desde sempre, a UF do cadastro
  f := fn_rebanho_orgao_fatos(A, '2026-05-04', '2026-11-30');
  if (select count(*) from jsonb_array_elements(f->'nascimentos') x where (x->>'fazenda_id')::uuid = FZ) <> 2 then raise exception 'T1a %', f->'nascimentos'; end if;
  if (select count(*) from jsonb_array_elements(f->'reclassificacoes') x where (x->>'id')::uuid = r1 and x->>'para' = 'mamotes_m') <> 1 then raise exception 'T1b'; end if;
  if (select array_agg((x->>'id')::uuid order by x->>'data') from jsonb_array_elements(f->'mortes_consumo') x where (x->>'fazenda_id')::uuid = FZ)
     is distinct from array[m1, c1] then raise exception 'T1c %', f->'mortes_consumo'; end if;
  if (select array_agg((x->>'id')::uuid order by x->>'data') from jsonb_array_elements(f->'movimentos') x where (x->>'fazenda_id')::uuid = FZ)
     is distinct from array[cp1, v1] then raise exception 'T1d (meta/programado/cancelado não entram) %', f->'movimentos'; end if;
  if (select x->>'sentido' from jsonb_array_elements(f->'movimentos') x where (x->>'id')::uuid = cp1) <> 'entrada' then raise exception 'T1e'; end if;
  if (select count(*) from jsonb_array_elements(f->'ajustes') x where (x->>'id')::uuid = a1 and x->>'sentido' = 'entrada') <> 1 then raise exception 'T1f'; end if;
  if (select jsonb_agg(x) from jsonb_array_elements(f->'rebanho_hoje') x where (x->>'fazenda_id')::uuid = FZ)
     <> jsonb_build_array(jsonb_build_object('fazenda_id', FZ, 'ano_mes', '2026-11', 'categoria', 'vacas', 'cab', 50)) then
    raise exception 'T1g (o mês até a data, só realizado, sem o zero) %', f->'rebanho_hoje';
  end if;
  if (select x->>'uf' from jsonb_array_elements(f->'fazendas') x where (x->>'id')::uuid = FZ) <> 'MS' then raise exception 'T1h'; end if;
  ok := false; begin perform fn_rebanho_orgao_fatos(A, '2026-11-30', '2026-11-30'); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T1i'; end if;

  -- T2 fora do tenant = 42501 (o gestor de outro cliente), nas leituras e nas escritas
  perform set_config('request.jwt.claims', json_build_object('sub', G, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_rebanho_orgao_fatos(A, '2026-05-04', '2026-11-30'); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T2a'; end if;
  ok := false; begin perform fn_rebanho_declaracao_gravar(FZ, ET, '{}'::jsonb, null, true); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T2b'; end if;
  ok := false; begin perform fn_egta_gravar_numero(A, jsonb_build_array(jsonb_build_object('numero', '123456', 'data', '2026-08-06', 'sentido', 'saida', 'cab', 60,
    'lancamento_id', v1)), true); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T2c'; end if;
  perform fn_rebanho_orgao_fatos(GC, '2026-05-04', '2026-11-30');   -- o do cliente dele lê
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- T3 gravar o rascunho: a prévia não grava; grava com trilha; o mesmo = nada; o editado muda a versão; versão velha 40001; campo e pasta
  r := fn_rebanho_declaracao_gravar(FZ, ET, jsonb_build_object('saldo', '{"F":[1,2,3,4]}'::jsonb, 'saldo_arquivo', A::text || '/orgao/x/saldo.pdf'), null, true);
  if exists (select 1 from rebanho_declaracoes where fazenda_id = FZ) or not (r->>'cria')::boolean then raise exception 'T3a %', r; end if;
  r := fn_rebanho_declaracao_gravar(FZ, ET, jsonb_build_object('saldo', '{"F":[1,2,3,4]}'::jsonb, 'saldo_arquivo', A::text || '/orgao/x/saldo.pdf'), null, false);
  D := (r->>'id')::uuid; vv := (r->>'versao')::int;
  if vv <> 1 or (select acao from rebanho_orgao_trilha where alvo_id = D) <> 'criada'
     or (select por from rebanho_orgao_trilha where alvo_id = D) <> ADM then raise exception 'T3b %', r; end if;
  r := fn_rebanho_declaracao_gravar(FZ, ET, jsonb_build_object('saldo', '{"F":[1,2,3,4]}'::jsonb), vv, false);
  if jsonb_array_length(r->'muda') <> 0 or (select count(*) from rebanho_orgao_trilha where alvo_id = D) <> 1 then raise exception 'T3c %', r; end if;
  r := fn_rebanho_declaracao_gravar(FZ, ET, jsonb_build_object('editados', '{"FZ":{"F":{"nascimentos":7}}}'::jsonb), vv, false);
  if (r->>'versao')::int <> 2 or (select depois->'editados'->'FZ'->'F'->>'nascimentos' from rebanho_orgao_trilha where alvo_id = D and acao = 'gravada') <> '7'
     or (select antes->'editados' from rebanho_orgao_trilha where alvo_id = D and acao = 'gravada') <> '{}'::jsonb then raise exception 'T3d %', r; end if;
  vv := 2;
  ok := false; begin perform fn_rebanho_declaracao_gravar(FZ, ET, '{"editados":{}}'::jsonb, 1, false); exception when sqlstate '40001' then ok := true; end;
  if not ok then raise exception 'T3e'; end if;
  ok := false; begin perform fn_rebanho_declaracao_gravar(FZ, ET, '{"status":"declarada"}'::jsonb, vv, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T3f'; end if;
  ok := false; begin perform fn_rebanho_declaracao_gravar(FZ, ET, jsonb_build_object('extrato_arquivo', GC::text || '/orgao/e.pdf'), vv, false);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T3g (pasta de outro cliente)'; end if;
  ok := false; begin perform fn_rebanho_declaracao_gravar(FZ, ET, jsonb_build_object('extrato_arquivo', A::text || '/orgao/../x.pdf'), vv, false);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T3h (..)'; end if;

  -- T4 declarar: a prévia não muda; declarar congela a proposta; depois, gravar e declarar de novo recusam
  r := fn_rebanho_declaracao_declarar(D, '{"total":10}'::jsonb, A::text || '/orgao/x/comprovante.pdf', vv, true);
  if (select status from rebanho_declaracoes where id = D) <> 'rascunho' then raise exception 'T4a'; end if;
  r := fn_rebanho_declaracao_declarar(D, '{"total":10}'::jsonb, A::text || '/orgao/x/comprovante.pdf', vv, false); vv := (r->>'versao')::int;
  if (select status <> 'declarada' or proposta <> '{"total":10}'::jsonb or declarada_por <> ADM from rebanho_declaracoes where id = D) then raise exception 'T4b'; end if;
  ok := false; begin perform fn_rebanho_declaracao_gravar(FZ, ET, '{"editados":{}}'::jsonb, vv, false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T4c'; end if;
  ok := false; begin perform fn_rebanho_declaracao_declarar(D, '{"total":11}'::jsonb, null, vv, false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T4d'; end if;

  -- T5 desfazer: sem motivo recusa; com motivo volta a rascunho e a trilha guarda a proposta congelada
  ok := false; begin perform fn_rebanho_declaracao_desfazer(D, '  ', false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T5a'; end if;
  r := fn_rebanho_declaracao_desfazer(D, 'errei a faixa', false);
  if (select status <> 'rascunho' or declarada_em is not null from rebanho_declaracoes where id = D)
     or (select antes->'proposta' from rebanho_orgao_trilha where alvo_id = D and acao = 'desfeita') <> '{"total":10}'::jsonb
     or (select motivo from rebanho_orgao_trilha where alvo_id = D and acao = 'desfeita') <> 'errei a faixa' then raise exception 'T5b'; end if;

  -- T6 eGTA: a prévia diz; grava; de novo = já estava; o mesmo nº em outra movimentação, o sentido errado, o programado e a meta recusam
  --    (tudo ou nada); os fatos mostram o nº na movimentação
  r := fn_egta_gravar_numero(A, jsonb_build_array(jsonb_build_object('numero', 'T-901', 'data', '2026-08-06', 'sentido', 'saida', 'cab', 60, 'lancamento_id', v1)), true);
  if jsonb_array_length(r->'grava') <> 1 or exists (select 1 from rebanho_egtas where lancamento_id = v1) then raise exception 'T6a %', r; end if;
  r := fn_egta_gravar_numero(A, jsonb_build_array(jsonb_build_object('numero', 'T-901', 'data', '2026-08-06', 'sentido', 'saida', 'cab', 60, 'lancamento_id', v1)), false);
  if (select count(*) from rebanho_egtas where lancamento_id = v1) <> 1 or not exists (select 1 from rebanho_orgao_trilha where alvo = 'egta' and acao = 'gravada')
    then raise exception 'T6b %', r; end if;
  r := fn_egta_gravar_numero(A, jsonb_build_array(jsonb_build_object('numero', 'T-901', 'data', '2026-08-06', 'sentido', 'saida', 'cab', 60, 'lancamento_id', v1)), false);
  if jsonb_array_length(r->'ja_estava') <> 1 or jsonb_array_length(r->'grava') <> 0 then raise exception 'T6c %', r; end if;
  r := fn_egta_gravar_numero(A, jsonb_build_array(
    jsonb_build_object('numero', 'T-902', 'data', '2026-05-01', 'sentido', 'entrada', 'cab', 9, 'lancamento_id', cp1),
    jsonb_build_object('numero', 'T-901', 'data', '2026-05-01', 'sentido', 'entrada', 'cab', 9, 'lancamento_id', cp1),
    jsonb_build_object('numero', 'T-903', 'data', '2026-08-06', 'sentido', 'entrada', 'cab', 60, 'lancamento_id', v1),
    jsonb_build_object('numero', 'T-904', 'data', '2026-09-01', 'sentido', 'saida', 'cab', 7, 'lancamento_id', vprog),
    jsonb_build_object('numero', 'T-905', 'data', '2026-08-05', 'sentido', 'saida', 'cab', 5, 'lancamento_id', vmeta)), true);
  if jsonb_array_length(r->'grava') <> 1 or jsonb_array_length(r->'recusa') <> 4 or (r->>'ok')::boolean then raise exception 'T6d %', r; end if;
  ok := false; begin perform fn_egta_gravar_numero(A, jsonb_build_array(
    jsonb_build_object('numero', 'T-902', 'data', '2026-05-01', 'sentido', 'entrada', 'cab', 9, 'lancamento_id', cp1),
    jsonb_build_object('numero', 'T-901', 'data', '2026-05-01', 'sentido', 'entrada', 'cab', 9, 'lancamento_id', cp1)), false);
  exception when sqlstate 'P0001' then ok := true; end;
  if not ok or exists (select 1 from rebanho_egtas where numero = 'T-902') then raise exception 'T6e (tudo ou nada)'; end if;
  f := fn_rebanho_orgao_fatos(A, '2026-05-04', '2026-11-30');
  if (select x->'egtas' from jsonb_array_elements(f->'movimentos') x where (x->>'id')::uuid = v1) <> '["T-901"]'::jsonb then raise exception 'T6f'; end if;

  -- T7 a trilha e as tabelas não se escrevem direto (nem a trilha se altera)
  ok := false; begin update rebanho_orgao_trilha set motivo = 'x' where alvo_id = D; exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T7a'; end if;
  ok := false; begin insert into rebanho_declaracoes (cliente_id, fazenda_id, etapa_id) values (A, FZ, ET); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T7b'; end if;
  ok := false; begin delete from rebanho_egtas where lancamento_id = v1; exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T7c'; end if;

  -- T9 a RLS: o gestor de outro cliente lê o calendário (global) e não lê nada do Teste
  perform set_config('request.jwt.claims', json_build_object('sub', G, 'role', 'authenticated')::text, true);
  select count(*) into n from orgao_etapas where uf = 'MS';
  if n <> 3 then reset role; raise exception 'T9a %', n; end if;
  if exists (select 1 from rebanho_declaracoes where cliente_id = A) or exists (select 1 from rebanho_egtas where cliente_id = A)
     or exists (select 1 from rebanho_orgao_trilha where cliente_id = A) then reset role; raise exception 'T9b'; end if;
  reset role;
  if (select count(*) from rebanho_orgao_trilha where alvo_id = D) <> 4 then raise exception 'T9c (criada, gravada, declarada, desfeita)'; end if;

  -- T8 as ACLs: nada para anon/PUBLIC; a interna fechada; RLS ligada nas 4
  if has_function_privilege('anon', 'fn_rebanho_orgao_fatos(uuid,date,date)', 'execute')
     or has_function_privilege('anon', 'fn_rebanho_declaracao_gravar(uuid,uuid,jsonb,integer,boolean)', 'execute')
     or has_function_privilege('anon', 'fn_rebanho_declaracao_declarar(uuid,jsonb,text,integer,boolean)', 'execute')
     or has_function_privilege('anon', 'fn_rebanho_declaracao_desfazer(uuid,text,boolean)', 'execute')
     or has_function_privilege('anon', 'fn_egta_gravar_numero(uuid,jsonb,boolean)', 'execute')
     or has_function_privilege('authenticated', '_fn_rebanho_orgao_arquivo_ok(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'fn_egta_gravar_numero(uuid,jsonb,boolean)', 'execute')
     or has_table_privilege('authenticated', 'orgao_etapas', 'insert') or has_table_privilege('anon', 'orgao_etapas', 'select')
     or has_table_privilege('authenticated', 'rebanho_declaracoes', 'update') or has_table_privilege('authenticated', 'rebanho_egtas', 'insert')
     or exists (select 1 from pg_class where oid in ('public.orgao_etapas'::regclass, 'public.rebanho_declaracoes'::regclass,
                'public.rebanho_egtas'::regclass, 'public.rebanho_orgao_trilha'::regclass) and not relrowsecurity)
     then raise exception 'T8'; end if;
  raise exception 'OK REBANHO-ORGAO-01 F1 T1–T9';
end $$;
