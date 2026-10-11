-- CONC-SPLIT-FILHO-CANCELADO-01 passo 2 — a trava do filho de desmembramento (F1–F7).
-- Roda como `postgres`, DEPOIS da migration 20261027196500, e TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Tudo sintetico no cliente Teste (43f32d07). Comparacoes com IS DISTINCT FROM.
-- O desmembramento e' montado PELA FUNCAO DE VERDADE (fn_classificacao_split_substituir): importacao, extrato, cru vinculado
-- como `ofx_cru` e uma sessao com as linhas em 'sugestao_split'.
-- F1 UPDATE direto de `cancelado` num filho de split vivo: P0001 com a frase (data, valor, N).
-- F2 fn_cancelar_lancamento_auditoria no filho: a mesma recusa, e nada muda (vinculo vivo, extrato conciliado).
-- F3 desfazer pelo dono passa: filhos cancelados, o cru de volta e religado, extrato conciliado.
-- F4 lancamento comum cancela normal.   F5 filho de split DESFEITO cancela normal (o split e' marcado desfeito a' mao: o
--    desfazer de verdade ja' cancela os filhos, entao nao sobra filho vivo de split desfeito por caminho nenhum).
-- F6 fn_split_do_lancamento: NULL no comum; no filho, os 3 filhos, `este`, soma dos vivos e desfazivel; outro cliente e sem
--    usuario = 42501.   F7 ACL.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
create function pg_temp.rec(p_sql text, p_comum boolean default false) returns text language plpgsql as $f$
declare v text;
begin
  if p_comum then execute 'set local role authenticated'; end if;
  execute p_sql into v;
  if p_comum then execute 'reset role'; end if;
  return 'PASSOU ' || coalesce(v, '');
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;
-- importacao + extrato + cru vinculado (ofx_cru) + sessao com as linhas, e o desmembramento pela funcao de verdade
create function pg_temp.split(p_valores numeric[]) returns jsonb language plpgsql as $f$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_imp uuid; v_ext uuid; v_cons uuid; v_ses uuid := gen_random_uuid(); v_cbi uuid; i int; v_stg uuid[] := '{}'; v_id uuid; r jsonb; v_pc record;
  v_soma numeric := (select sum(x) from unnest(p_valores) x);
begin
  select id, subcentro into v_pc from financeiro_plano_contas
   where ativo and cliente_id is null and escopo_negocio = 'pecuaria' and tipo_operacao = '2-Saídas' order by ordem_exibicao limit 1;
  insert into financeiro_importacoes_v2 (cliente_id, nome_arquivo) values (c_cli, 'SINT SPLIT TRAVA') returning id into v_imp;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, importacao_id, data_movimento, descricao, valor, tipo_movimento, hash_movimento)
  values (c_cli, c_cta, v_imp, '2026-10-05', 'SINT SPLIT TRAVA', -v_soma, 'debito', 'sint-split-' || gen_random_uuid()) returning id into v_ext;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_pagamento, valor, sinal,
    tipo_operacao, status_transacao, descricao, origem_lancamento)
  values (c_cli, c_faz, c_cta, '2026-10-05', '2026-10-05', v_soma, '-1', '2-Saídas', 'realizado', 'SINT SPLIT cru', 'extrato') returning id into v_cons;
  v_cbi := (fn_vincular_extrato_lancamento(v_ext, v_cons, v_soma, false) ->> 'cbi_id')::uuid;
  update conciliacao_bancaria_itens set tipo_aprovacao = 'ofx_cru' where id = v_cbi;
  for i in 1 .. array_length(p_valores, 1) loop
    v_id := gen_random_uuid();
    insert into financeiro_classificacao_staging (staging_id, sessao_id, cliente_id, match_status, match_lancamento_id, excel_linha_origem,
      excel_valor, excel_data, excel_tipo_operacao, conta_origem_id, update_proposto, aplicado)
    values (v_id, v_ses, c_cli, 'sugestao_split', v_cons, i, p_valores[i], '2026-10-05', '2-Saídas', c_cta,
      jsonb_build_object('subcentro', v_pc.subcentro, 'plano_conta_id', v_pc.id, 'fazenda_id', c_faz, 'observacao', 'linha ' || i), false);
    v_stg := v_stg || v_id;
  end loop;
  r := fn_classificacao_split_substituir(v_cons, v_ses, v_stg);
  if (r->>'ok') is distinct from 'true' then raise exception 'cenario: o desmembramento nao montou: %', r; end if;
  return jsonb_build_object('ext', v_ext, 'cons', v_cons, 'ses', v_ses, 'stg', to_jsonb(v_stg), 'split', r->>'split_id',
                            'filhos', (select jsonb_agg(i2.filho_id order by s.excel_linha_origem) from classificacao_split_itens i2
                                         join financeiro_classificacao_staging s on s.staging_id = i2.staging_id where i2.split_id = (r->>'split_id')::uuid));
end $f$;

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_frase constant text := 'P0001 Este lançamento é parte do desmembramento do extrato de 05/10/2026 (R$ 1.000,00, 3 lançamentos). Cancelar por aqui deixaria o extrato parcial, sem como completar. Desfaça o desmembramento pela Mesa do Enriquecer.';
  a jsonb; b jsonb; f1 uuid; f2 uuid; f3 uuid; v_comum uuid; r jsonb; t text; v_ux uuid; v_md5 text;
begin
  select cm.user_id into v_ux from cliente_membros cm join auth.users u on u.id = cm.user_id
   where cm.ativo and cm.perfil = 'gestor_cliente' and cm.cliente_id is distinct from c_cli
     and not exists (select 1 from cliente_membros x where x.user_id = cm.user_id and (x.perfil = 'admin_agroinblue' or x.cliente_id = c_cli))
   order by cm.user_id limit 1;
  if v_ux is null then raise exception 'F0: sem usuario comum para a prova'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  a := pg_temp.split(array[500.00, 300.00, 200.00]::numeric[]);
  f1 := (a->'filhos'->>0)::uuid; f2 := (a->'filhos'->>1)::uuid; f3 := (a->'filhos'->>2)::uuid;
  if f1 is null or f2 is null or f3 is null then raise exception 'F0: filhos %', a; end if;
  select md5(string_agg(c::text, '|' order by c.id)) into v_md5 from conciliacao_bancaria_itens c where c.extrato_id = (a->>'ext')::uuid;

  -- ── F1 ──
  t := pg_temp.rec(format('update financeiro_lancamentos_v2 set cancelado = true where id = %L returning 1', f1));
  if t is distinct from c_frase then raise exception 'F1: %', t; end if;

  -- ── F2 ──
  t := pg_temp.rec(format('select fn_cancelar_lancamento_auditoria(%L, %L)::text', f2, 'tentativa'));
  if t is distinct from c_frase then raise exception 'F2: %', t; end if;
  if (select md5(string_agg(c::text, '|' order by c.id)) from conciliacao_bancaria_itens c where c.extrato_id = (a->>'ext')::uuid) is distinct from v_md5
     or (select status from extrato_bancario_v2 where id = (a->>'ext')::uuid) is distinct from 'conciliado'
     or exists (select 1 from financeiro_lancamentos_v2 where id in (f1, f2, f3) and cancelado) then raise exception 'F2: a recusa deixou rastro'; end if;

  -- ── F4 ──
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, cenario)
  values (c_cli, 'c2498ace-8478-410c-a697-d3f2e2934d1f', '131b8501-caf7-4964-b1b1-3f552ad2b75d', '2026-10-05', '2026-10-10', 77, '-1', '2-Saídas', 'programado', 'SINT comum', 'realizado')
  returning id into v_comum;
  t := pg_temp.rec(format('select fn_split_do_lancamento(%L)::text', v_comum));
  if t is distinct from 'PASSOU ' then raise exception 'F6 comum nao e'' nulo: %', t; end if;
  t := pg_temp.rec(format('select (fn_cancelar_lancamento_auditoria(%L, %L)->>%L)', v_comum, 'comum', 'ok'));
  if t is distinct from 'PASSOU true' or not (select cancelado from financeiro_lancamentos_v2 where id = v_comum) then raise exception 'F4: %', t; end if;

  -- ── F6 ──
  r := fn_split_do_lancamento(f2);
  if (r->>'split_id') is distinct from (a->>'split') or (r->>'total_filhos') is distinct from '3' or jsonb_array_length(r->'filhos') is distinct from 3
     or (select string_agg(x->>'lancamento_id', ',') from jsonb_array_elements(r->'filhos') x where (x->>'este')::boolean) is distinct from f2::text
     or (r->>'soma_vivos')::numeric is distinct from 1000 or (r->>'desfazivel') is distinct from 'true' or (r->'motivo_nao_desfazivel') is distinct from 'null'::jsonb
     or (r->'extrato'->>'valor')::numeric is distinct from -1000 or (r->'extrato'->>'data') is distinct from '2026-10-05'
     or (r->'extrato'->>'conta_nome') is null or (r->'importacao'->>'sessao_id') is distinct from (a->>'ses') or (r->'importacao'->>'criada_em') is null
     or (select string_agg((x->>'valor')::numeric::text, ',' ) from jsonb_array_elements(r->'filhos') x) is distinct from '500.00,300.00,200.00'
     then raise exception 'F6 filho: %', r; end if;
  if exists (select 1 from financeiro_lancamentos_v2 where id in (f1, f2, f3) and cancelado)
     or (select desfeito_em from classificacao_splits where id = (a->>'split')::uuid) is not null then raise exception 'F6: a simulacao gravou'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  t := pg_temp.rec(format('select fn_split_do_lancamento(%L)::text', f2), true);
  if t is distinct from '42501 sem acesso a este registro' then raise exception 'F6 outro cliente: %', left(t, 120); end if;
  perform set_config('request.jwt.claims', '', true);
  t := pg_temp.rec(format('select fn_split_do_lancamento(%L)::text', f2)) || pg_temp.rec(format('select fn_split_do_lancamento(%L)::text', gen_random_uuid()));
  if t is distinct from repeat('42501 sem acesso a este registro', 2) then raise exception 'F6 sem usuario: %', left(t, 120); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);

  -- ── F3 ──
  r := fn_classificacao_desfazer_split((a->'stg'->>0)::uuid, 'sintetico: desfazer pelo dono', false);
  if (r->>'ok') is distinct from 'true' then raise exception 'F3: o dono nao desfez: %', r; end if;
  if (select count(*) from financeiro_lancamentos_v2 where id in (f1, f2, f3) and cancelado) is distinct from 3
     or (select cancelado from financeiro_lancamentos_v2 where id = (a->>'cons')::uuid) is distinct from false
     or (select status from extrato_bancario_v2 where id = (a->>'ext')::uuid) is distinct from 'conciliado'
     or (select string_agg(c.lancamento_id::text || ':' || c.tipo_aprovacao, ',') from conciliacao_bancaria_itens c where c.extrato_id = (a->>'ext')::uuid and c.desfeito_em is null)
          is distinct from (a->>'cons') || ':ofx_cru'
     or coalesce(current_setting('app.split_escritor', true), 'off') is distinct from 'off' then raise exception 'F3: estado depois do desfazer'; end if;

  -- ── F5 ──
  b := pg_temp.split(array[60.00, 40.00]::numeric[]);
  update classificacao_splits set desfeito_em = now(), desfeito_por = c_adm, desfeito_motivo = 'sintetico' where id = (b->>'split')::uuid;
  t := pg_temp.rec(format('update financeiro_lancamentos_v2 set cancelado = true where id = %L returning 1', (b->'filhos'->>0)::uuid));
  if t is distinct from 'PASSOU 1' then raise exception 'F5: %', t; end if;
  if fn_split_do_lancamento((b->'filhos'->>1)::uuid) is not null then raise exception 'F5: split desfeito ainda responde'; end if;

  -- ── F7 ──
  select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'execute') || has_function_privilege('authenticated', p.oid, 'execute')
           || exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0), ' ' order by p.proname) into t
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_fn_split_vivo_do_lancamento', 'guard_split_filho_cancelar', 'fn_split_do_lancamento', 'fn_classificacao_desfazer_split');
  if t is distinct from '_fn_split_vivo_do_lancamento:falsefalsefalse fn_classificacao_desfazer_split:falsetruefalse fn_split_do_lancamento:falsetruefalse guard_split_filho_cancelar:falsefalsefalse'
     then raise exception 'F7 ACL: %', t; end if;

  raise exception 'OK — CONC-SPLIT-FILHO-CANCELADO-01 passo 2, a trava (F1–F7)';
end $teste$;
rollback;
