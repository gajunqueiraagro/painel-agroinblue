-- FORN-LISTA-01 — a lista de Cadastros › Fornecedores (`fn_fornecedor_lista`).
-- Roda como `postgres`, DEPOIS da migration 20261027204720, e TERMINA EM RAISE: nada fica no banco. Sucesso = "OK ...".
-- Tudo sintetico no cliente Teste (43f32d07), num recorte pela busca "SINT FL".
-- L1 contagens por situacao (ativo, inativo, mesclado) e o recorte de cada filtro.
-- L2 a busca e' a busca unica (acha pela fantasia e pelo CNPJ sem mascara).
-- L3 ordem: lancamentos desc, ultimo uso desc (vazio por ultimo), razao social A-Z por padrao; lancamentos e ultimo uso = os de
--    `fn_fornecedor_uso` (vivos; max pagamento, senao competencia).
-- L4 `p_ids` restringe e a pagina corta; `documentos` traz o recorte inteiro da situacao.
-- L5 sem usuario e outro cliente: 42501; `anon` nao executa.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create function pg_temp.forn(p_nome text, p_fantasia text default null, p_doc text default null, p_ativo boolean default true) returns uuid language sql as $f$
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, municipio, uf)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_nome, p_fantasia, p_doc, p_ativo, 'Campo Grande', 'MS') returning id $f$;
create function pg_temp.lan(p_forn uuid, p_comp date, p_pgto date default null, p_cancelado boolean default false) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor,
      sinal, tipo_operacao, status_transacao, descricao, favorecido_id, cenario, cancelado)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
      p_comp, p_comp, p_pgto, 100, '-1', '2-Saídas', case when p_pgto is null then 'programado' else 'realizado' end, 'SINT FL lanc', p_forn, 'realizado', p_cancelado)
  returning id $f$;
create function pg_temp.rec(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'PASSOU';
exception when others then return sqlstate || ' ' || sqlerrm; end $f$;

do $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  a uuid := pg_temp.forn('SINT FL Alfa Comercio', 'Fantasia Zeta FL', '54.442.418/0001-88');
  b uuid := pg_temp.forn('SINT FL Beta Transportes', null, null);
  c uuid := pg_temp.forn('SINT FL Gama Pecas', null, '123.456.789-09');
  i uuid := pg_temp.forn('SINT FL Inativo', null, null, false);
  m uuid; v jsonb; t text; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  insert into financeiro_fornecedores (cliente_id, nome, ativo, fundido_em_id, fundido_em) values (c_cli, 'SINT FL Mesclado', false, a, now()) returning id into m;
  perform pg_temp.lan(b, '2026-09-01', '2026-09-05'); perform pg_temp.lan(b, '2026-08-01'); perform pg_temp.lan(b, '2026-10-01', null, true);
  perform pg_temp.lan(c, '2026-07-01');

  -- L1
  v := public.fn_fornecedor_lista(c_cli, 'SINT FL', 'ativos');
  if v->'contagens' is distinct from '{"ativos": 3, "inativos": 1, "mesclados": 1, "todos": 5}'::jsonb then raise exception 'L1 contagens: %', v->'contagens'; end if;
  if (v->>'total')::int <> 3 then raise exception 'L1 ativos total: %', v->>'total'; end if;
  if (public.fn_fornecedor_lista(c_cli, 'SINT FL', 'mesclados')->'itens'->0->>'dono_nome') is distinct from 'SINT FL Alfa Comercio' then
    raise exception 'L1 mesclado sem o dono'; end if;
  if (public.fn_fornecedor_lista(c_cli, 'SINT FL', 'inativos')->'itens'->0->>'id') is distinct from i::text then raise exception 'L1 inativos'; end if;

  -- L2
  v := public.fn_fornecedor_lista(c_cli, 'fantasia zeta', 'todos');
  if (v->>'total')::int <> 1 or v->'itens'->0->>'id' <> a::text then raise exception 'L2 fantasia: %', v->>'total'; end if;
  v := public.fn_fornecedor_lista(c_cli, '54442418', 'todos');
  if not exists (select 1 from jsonb_array_elements(v->'itens') x where x->>'id' = a::text) then raise exception 'L2 documento'; end if;

  -- L3
  v := public.fn_fornecedor_lista(c_cli, 'SINT FL', 'ativos', null, 'lancamentos', true);
  if v->'itens'->0->>'id' <> b::text or (v->'itens'->0->>'lancamentos')::int <> 2 then raise exception 'L3 lancamentos: %', v->'itens'->0; end if;
  if (v->'itens'->0->>'lancamentos')::int is distinct from (public.fn_fornecedor_uso(b)->>'lancamentos')::int
     or v->'itens'->0->>'ultimo_uso' is distinct from public.fn_fornecedor_uso(b)->>'ultimo_lancamento' then raise exception 'L3 espelho do uso'; end if;
  v := public.fn_fornecedor_lista(c_cli, 'SINT FL', 'ativos', null, 'ultimo_uso', true);
  if v->'itens'->0->>'ultimo_uso' <> '2026-09-05' or v->'itens'->2->>'id' <> a::text then raise exception 'L3 ultimo uso: %', v->'itens'; end if;
  v := public.fn_fornecedor_lista(c_cli, 'SINT FL', 'ativos');
  if v->'itens'->0->>'id' <> a::text or v->'itens'->2->>'id' <> c::text then raise exception 'L3 padrao A-Z'; end if;

  -- L4
  v := public.fn_fornecedor_lista(c_cli, 'SINT FL', 'ativos', array[b, c], 'razao_social', false, 1, 1);
  if (v->>'total')::int <> 2 or jsonb_array_length(v->'itens') <> 1 or v->'itens'->0->>'id' <> c::text then raise exception 'L4 ids/pagina: %', v; end if;
  if jsonb_array_length(v->'documentos') <> 3 then raise exception 'L4 documentos: %', v->'documentos'; end if;

  -- L5
  perform set_config('request.jwt.claims', '', true);
  t := pg_temp.rec(format('select public.fn_fornecedor_lista(%L)', c_cli));
  if t not like '42501%' then raise exception 'L5 sem usuario: %', t; end if;
  if has_function_privilege('anon', 'public.fn_fornecedor_lista(uuid, text, text, uuid[], text, boolean, integer, integer)', 'execute') then
    raise exception 'L5 anon executa'; end if;

  raise exception 'OK forn_lista_01 (L1–L5)';
end $t$;
rollback;
