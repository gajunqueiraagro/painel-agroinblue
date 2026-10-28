-- P128a (NOTA-JA-LANCADA, Gabriel 27/10/2026) — `fn_nota_ja_lancada` acha TODOS os irmaos da nota (migration 20261028113000). Fixture
-- SINTETICA no cliente Teste (um cadastro com CNPJ sintetico), nos moldes dos casos do briefing com outros valores:
--   A "pela soma" (o Somak): 500,00 + 250,00 + 250,00 juntados num parcelamento, sem numero nem chave; a nota 1.000,00 (nº 8001).
--   B o ruido da soma: 600,00 + 399,99 (999,99) juntados — nunca "pela soma" de uma nota de 1.000,00.
--   C o numero num DOCUMENTO anexado (o Racaforte/Ferri): solto de 300,00 sem `numero_documento`, com a NF "000.008.002" (e a chave) no clipe.
--   D o irmao que SOBRA: D1 com o nº 8003 + D2 sem nada, juntados (700,00); a nota 400,00 — D2 aparece so' 'parcelamento'.
--   E (migration 20261028113010) o irmao de OUTRO fornecedor: E1 com o nº 8004 + E2 juntados, E2 passado a outro cadastro — E2 nao volta.
--   F (113010) a ancora so' pelo VALOR: F1 450,00 + F2 juntados, sem numero; a nota 450,00 (nº 8005) acha F1 pelo valor — F2 nao volta.
-- Roda como `authenticated` (admin) e TERMINA EM RAISE: nada fica.
-- I1 A volta inteira 'soma', com `parcela_n` 1..3 · I2 B nao volta · I3 C 'documento' (+ 'chave'), `tem_esta_nota`, `documentos` = 1
-- I4 D1 'numero', D2 so' 'parcelamento' · I5 sem a chave, C volta sem `tem_esta_nota` · I6 E2 (outro fornecedor) fora · I7 F2 fora
-- Mutacao: tirar `por_soma` do achados0 derruba I1; trocar a soma exata por >= derruba I2; tirar `cand_doc` do testar/por_documento derruba
-- I3; tirar `por_parcelamento` do achados derruba I4; tirar o "mesmo fornecedor" derruba I6; deixar o valor ser ancora derruba I7.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_chave constant text := '50310955666777000363550010000080021000000017';
  faz uuid; pl uuid; fo uuid; outro uuid; a uuid[]; b uuid[]; c uuid; d uuid[]; e uuid[]; f uuid[]; r jsonb;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria'
    and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  if faz is null or pl is null then raise exception 'fixture: o Teste precisa de fazenda e conta pecuária de saída'; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Irmaos Sinteticos de Teste Ltda', '55.666.777/0003-63', true) returning id into fo;
  with x as (
    insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
        status_transacao, cenario, cancelado, plano_conta_id, favorecido_id, numero_documento)
    select c_cli, faz, '-1', '2-Saídas', v, g || ' sintetico ' || k, venc, venc, 'programado', 'realizado', false, pl, fo, nd
      from (values ('A', 1, 500.00, '2031-05-10'::date, null::text), ('A', 2, 250.00, '2031-06-10', null), ('A', 3, 250.00, '2031-07-10', null),
                   ('B', 1, 600.00, '2031-05-12', null), ('B', 2, 399.99, '2031-06-12', null),
                   ('C', 1, 300.00, '2031-05-14', null),
                   ('D', 1, 350.00, '2031-05-16', 'NF 8003'), ('D', 2, 350.00, '2031-06-16', null),
                   ('E', 1, 400.00, '2031-09-05', 'NF 8004'), ('E', 2, 400.00, '2031-10-05', null),
                   ('F', 1, 450.00, '2031-11-07', null), ('F', 2, 450.00, '2031-12-07', null)) v(g, k, v, venc, nd)
    returning id, descricao)
  select array_agg(id order by descricao) filter (where descricao like 'A %'), array_agg(id order by descricao) filter (where descricao like 'B %'),
         (array_agg(id) filter (where descricao like 'C %'))[1], array_agg(id order by descricao) filter (where descricao like 'D %'),
         array_agg(id order by descricao) filter (where descricao like 'E %'), array_agg(id order by descricao) filter (where descricao like 'F %')
    into a, b, c, d, e, f from x;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, a, null, false); if not (r->>'ok')::boolean then raise exception 'fixture A: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, b, null, false); if not (r->>'ok')::boolean then raise exception 'fixture B: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, d, null, false); if not (r->>'ok')::boolean then raise exception 'fixture D: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, e, null, false); if not (r->>'ok')::boolean then raise exception 'fixture E: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, f, null, false); if not (r->>'ok')::boolean then raise exception 'fixture F: %', r; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Outro Irmao Sintetico Ltda', '99.888.777/0001-10', true) returning id into outro;
  update public.financeiro_lancamentos_v2 set favorecido_id = outro where id = e[2];
  insert into public.financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, chave_acesso)
  values (c_cli, c, 'nf-sintetica.xml', 'nf', '000.008.002', c_chave);
  perform set_config('teste.ids', concat_ws(',', array_to_string(a, ';'), array_to_string(b, ';'), c, array_to_string(d, ';'),
    array_to_string(e, ';'), array_to_string(f, ';')), true);
end $fx$;

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_chave constant text := '50310955666777000363550010000080021000000017';
  ids text[] := string_to_array(current_setting('teste.ids'), ',');
  a uuid[] := string_to_array(ids[1], ';')::uuid[]; b uuid[] := string_to_array(ids[2], ';')::uuid[];
  c uuid := ids[3]::uuid; d uuid[] := string_to_array(ids[4], ';')::uuid[];
  e uuid[] := string_to_array(ids[5], ';')::uuid[]; f uuid[] := string_to_array(ids[6], ';')::uuid[];
  todos uuid[] := a || b || c || d || e || f;
  r jsonb; t text;
  achou constant text := $q$select string_agg(format('%s:%s:%s:%s:%s', array_position($2, (x->>'id')::uuid), x->'por', coalesce(x->>'parcela_n', '-'),
      coalesce(x->>'tem_esta_nota', '-'), coalesce(x->>'documentos', '-')), ' ' order by array_position($2, (x->>'id')::uuid))
    from jsonb_array_elements($1) x where array_position($2, (x->>'id')::uuid) is not null$q$;
begin
  -- I1 e I2: a nota 1.000,00 (nº 8001, sem chave): A inteira pela soma; B (999,99) nao
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-05-01","valor_cent":100000}]', '8001', null, '55666777000363', array['Irmaos Sinteticos de Teste Ltda']);
  execute achou into t using r, todos;
  if t is distinct from '1:["soma"]:1:false:0 2:["soma"]:2:false:0 3:["soma"]:3:false:0' then raise exception 'I1/I2: %', t; end if;
  -- I3: a nota 300,00 (nº 8002, com a chave): C pelo documento e pela chave; a nota ja' esta' nele; 1 documento
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-05-14","valor_cent":30000}]', '8002', c_chave, '55666777000363', array['Irmaos Sinteticos de Teste Ltda']);
  execute achou into t using r, todos;
  if t is null or t !~ '^6:\[[^]]*"documento"[^]]*\]:-:true:1$' then raise exception 'I3: %', t; end if;
  -- I5: a mesma sem a chave: C pelo valor e pelo documento, sem `tem_esta_nota`
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-05-14","valor_cent":30000}]', '8002', null, '55666777000363', array['Irmaos Sinteticos de Teste Ltda']);
  execute achou into t using r, todos;
  if t is null or t !~ '^6:\[[^]]*"documento"[^]]*\]:-:false:1$' then raise exception 'I5: %', t; end if;
  -- I4: a nota 400,00 (nº 8003): D1 pelo numero, D2 so' por ser irmao do mesmo parcelamento
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-05-16","valor_cent":40000}]', '8003', null, '55666777000363', array['Irmaos Sinteticos de Teste Ltda']);
  execute achou into t using r, todos;
  if t is distinct from '7:["numero"]:1:false:0 8:["parcelamento"]:2:false:0' then raise exception 'I4: %', t; end if;
  -- I6: a nota 500,00 (nº 8004): E1 pelo numero; E2 (do mesmo parcelamento, OUTRO fornecedor) nao volta
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-09-05","valor_cent":50000}]', '8004', null, '55666777000363', array['Irmaos Sinteticos de Teste Ltda']);
  execute achou into t using r, todos;
  if t is distinct from '9:["numero"]:1:false:0' then raise exception 'I6: %', t; end if;
  -- I7: a nota 450,00 (nº 8005, que ninguem tem): F1 so' pelo valor; F2 (irmao) nao volta
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-11-07","valor_cent":45000}]', '8005', null, '55666777000363', array['Irmaos Sinteticos de Teste Ltda']);
  execute achou into t using r, todos;
  if t is distinct from '11:["valor"]:1:false:0' then raise exception 'I7: %', t; end if;
  raise exception 'OK p128a_nota_ja_lancada_irmaos (I1–I7)';
end $teste$;
rollback;
