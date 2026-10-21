-- FORN-BUSCA-UNICA-01 — GERADO por `node scripts/gerar-teste-busca-fornecedor.mjs` a partir de
-- `src/lib/fornecedores/buscaDeFornecedor.casos.json` (a lista UNICA de casos; a mesma roda contra a funcao da tela no vitest).
-- NAO EDITAR A MAO: mude o arquivo de casos e gere de novo. Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v uuid; ids jsonb := '{}'::jsonb; r jsonb; got text[];
BEGIN
  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  -- NORMALIZACAO (a mesma regra dos dois lados)
  if coalesce(public._fn_normalizar_texto('  Comércio   JERÊ '), '') is distinct from 'comercio jere' then raise exception 'N1 normalizacao de %: %', '  Comércio   JERÊ ', public._fn_normalizar_texto('  Comércio   JERÊ '); end if;
  if coalesce(public._fn_normalizar_texto('Ação Ñandu Ü Ç'), '') is distinct from 'acao nandu u c' then raise exception 'N2 normalizacao de %: %', 'Ação Ñandu Ü Ç', public._fn_normalizar_texto('Ação Ñandu Ü Ç'); end if;
  if coalesce(public._fn_normalizar_texto('Agrozetablue'), '') is distinct from 'agrozetablue' then raise exception 'N3 normalizacao de %: %', 'Agrozetablue', public._fn_normalizar_texto('Agrozetablue'); end if;
  if coalesce(public._fn_normalizar_texto(''), '') is distinct from '' then raise exception 'N4 normalizacao de %: %', '', public._fn_normalizar_texto(''); end if;
  if coalesce(public._fn_normalizar_texto('   '), '') is distinct from '' then raise exception 'N5 normalizacao de %: %', '   ', public._fn_normalizar_texto('   '); end if;
  if public._fn_fornecedor_busca_digitos('54.442.418/0001-88') is distinct from '54442418000188'::text then raise exception 'D1 digitos da busca de %: %', '54.442.418/0001-88', public._fn_fornecedor_busca_digitos('54.442.418/0001-88'); end if;
  if public._fn_fornecedor_busca_digitos('54442418') is distinct from '54442418'::text then raise exception 'D2 digitos da busca de %: %', '54442418', public._fn_fornecedor_busca_digitos('54442418'); end if;
  if public._fn_fornecedor_busca_digitos('544 424') is distinct from '544424'::text then raise exception 'D3 digitos da busca de %: %', '544 424', public._fn_fornecedor_busca_digitos('544 424'); end if;
  if public._fn_fornecedor_busca_digitos('12-3') is distinct from '123'::text then raise exception 'D4 digitos da busca de %: %', '12-3', public._fn_fornecedor_busca_digitos('12-3'); end if;
  if public._fn_fornecedor_busca_digitos('agro 1') is distinct from null::text then raise exception 'D5 digitos da busca de %: %', 'agro 1', public._fn_fornecedor_busca_digitos('agro 1'); end if;
  if public._fn_fornecedor_busca_digitos('') is distinct from null::text then raise exception 'D6 digitos da busca de %: %', '', public._fn_fornecedor_busca_digitos(''); end if;
  if public._fn_fornecedor_busca_doc('11.222.333/0001-81') is distinct from '11222333000181' then raise exception 'C1 digitos do documento de %: %', '11.222.333/0001-81', public._fn_fornecedor_busca_doc('11.222.333/0001-81'); end if;
  if public._fn_fornecedor_busca_doc('12.ABC.345/01DE-35') is distinct from '123450135' then raise exception 'C2 digitos do documento de %: %', '12.ABC.345/01DE-35', public._fn_fornecedor_busca_doc('12.ABC.345/01DE-35'); end if;
  if public._fn_fornecedor_busca_doc(null) is distinct from '' then raise exception 'C3 digitos do documento de %: %', null, public._fn_fornecedor_busca_doc(null); end if;
  -- FORNECEDORES (e o uso: N lancamentos vivos de cada um)
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq G F Rezendezeta Junqueira', 'Agrozetablue', '54.442.418/0001-88', true, '[]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('gf', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 2);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Agrozetablue Comercio', null, null, true, '[]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('agz', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 5);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Comercial Jerê', null, null, true, '[]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('jere', v);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Comercial Jere Alimentos', null, null, true, '[]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('jere2', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 3);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Dono Zetamesc', null, null, true, '["Sintq Antigo Nomezeta","11.444.777/0001-61"]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('dono', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 1);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Antigo Nomezeta', null, '11.444.777/0001-61', false, '[]'::jsonb, (ids->>'dono')::uuid, now(), null, null) returning id into v;
  ids := ids || jsonb_build_object('abs', v);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Inativo Zetamesc', null, null, false, '[]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('ina', v);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Filialzeta Produtos Agropecuarios', null, '11.222.333/0004-24', true, '[]'::jsonb, null, null, 'Três Lagoas', 'MS') returning id into v;
  ids := ids || jsonb_build_object('fil_tl', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 1);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Filialzeta Produtos Agropecuarios', null, '11.222.333/0038-73', true, '[]'::jsonb, null, null, 'Presidente Prudente', 'SP') returning id into v;
  ids := ids || jsonb_build_object('fil_pp', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 3);
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)
    values (k, 'Sintq Filialzeta Produtos Agropecuarios', null, null, true, '[]'::jsonb, null, null, null, null) returning id into v;
  ids := ids || jsonb_build_object('fil_sem', v);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v
      from generate_series(1, 2);
  -- BUSCAS (a ordem exata, so entre os fornecedores deste arquivo)
  r := public.fn_fornecedor_buscar(k, 'agrozetablue', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['gf', 'agz']::text[] then raise exception 'B1 % (%): %', 'fantasia acha a razao social (o caso AGROinBLUE); quem comeca com o termo vem antes do mais usado', 'agrozetablue', got; end if;
  r := public.fn_fornecedor_buscar(k, '  AGROZETABLUE ', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['gf', 'agz']::text[] then raise exception 'B2 % (%): %', 'caixa e espacos nao importam', '  AGROZETABLUE ', got; end if;
  r := public.fn_fornecedor_buscar(k, '54442418', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['gf']::text[] then raise exception 'B3 % (%): %', 'CNPJ so digitos (parte)', '54442418', got; end if;
  r := public.fn_fornecedor_buscar(k, '54.442.418/0001-88', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['gf']::text[] then raise exception 'B4 % (%): %', 'CNPJ com pontuacao', '54.442.418/0001-88', got; end if;
  r := public.fn_fornecedor_buscar(k, 'jere', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['jere2', 'jere']::text[] then raise exception 'B5 % (%): %', 'sem acento acha com acento; o mais usado primeiro', 'jere', got; end if;
  r := public.fn_fornecedor_buscar(k, 'Jerê', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['jere2', 'jere']::text[] then raise exception 'B6 % (%): %', 'com acento acha sem acento', 'Jerê', got; end if;
  r := public.fn_fornecedor_buscar(k, 'antigo nomezeta', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['dono']::text[] then raise exception 'B7 % (%): %', 'nome do absorvido acha quem ficou (apelido)', 'antigo nomezeta', got; end if;
  r := public.fn_fornecedor_buscar(k, '11444777', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['dono']::text[] then raise exception 'B8 % (%): %', 'documento do absorvido acha quem ficou (apelido documento)', '11444777', got; end if;
  r := public.fn_fornecedor_buscar(k, 'antigo nomezeta', 'todos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['dono', 'abs']::text[] then raise exception 'B9 % (%): %', 'pedindo todos, o absorvido aparece depois do ativo', 'antigo nomezeta', got; end if;
  r := public.fn_fornecedor_buscar(k, 'zetamesc', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['dono']::text[] then raise exception 'B10 % (%): %', 'inativo so quando o filtro pede', 'zetamesc', got; end if;
  r := public.fn_fornecedor_buscar(k, 'zetamesc', 'inativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['ina']::text[] then raise exception 'B11 % (%): %', 'so os inativos', 'zetamesc', got; end if;
  r := public.fn_fornecedor_buscar(k, 'zetamesc', 'todos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['dono', 'ina']::text[] then raise exception 'B12 % (%): %', 'todos: ativo primeiro', 'zetamesc', got; end if;
  r := public.fn_fornecedor_buscar(k, 'sintq g f', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['gf']::text[] then raise exception 'B13 % (%): %', 'busca de letras nao casa por documento', 'sintq g f', got; end if;
  r := public.fn_fornecedor_buscar(k, 'zzzqqqzeta', 'todos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from '{}'::text[] then raise exception 'B14 % (%): %', 'nada', 'zzzqqqzeta', got; end if;
  r := public.fn_fornecedor_buscar(k, 'filialzeta', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['fil_pp', 'fil_sem', 'fil_tl']::text[] then raise exception 'B15 % (%): %', 'FORN-FILIAL-01: o nome acha as tres filiais (mesma razao social), pela ordem do uso', 'filialzeta', got; end if;
  r := public.fn_fornecedor_buscar(k, 'filialzeta tres', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['fil_tl']::text[] then raise exception 'B16 % (%): %', 'FORN-FILIAL-01: nome + cidade acha so'' a filial daquela cidade', 'filialzeta tres', got; end if;
  r := public.fn_fornecedor_buscar(k, 'presidente prudente', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['fil_pp']::text[] then raise exception 'B17 % (%): %', 'FORN-FILIAL-01: a cidade sozinha acha a filial', 'presidente prudente', got; end if;
  r := public.fn_fornecedor_buscar(k, 'filialzeta sp', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['fil_pp']::text[] then raise exception 'B18 % (%): %', 'FORN-FILIAL-01: a UF entra na cidade', 'filialzeta sp', got; end if;
  r := public.fn_fornecedor_buscar(k, 'filialzeta campo', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from '{}'::text[] then raise exception 'B19 % (%): %', 'FORN-FILIAL-01: palavra fora do nome e da cidade nao casa', 'filialzeta campo', got; end if;
  r := public.fn_fornecedor_buscar(k, 'sintq g f', 'todos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['gf']::text[] then raise exception 'B20 % (%): %', 'FORN-FILIAL-01: so'' comeco de palavra conta (o ''g'' solto nao casa com ''lagoas'')', 'sintq g f', got; end if;
  r := public.fn_fornecedor_buscar(k, 'filialzeta pres pru', 'ativos', null, 0);
  select coalesce(array_agg(m.chave order by e.o), '{}'::text[]) into got
    from jsonb_array_elements(r->'itens') with ordinality e(x, o)
    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';
  if got is distinct from ARRAY['fil_pp']::text[] then raise exception 'B21 % (%): %', 'FORN-FILIAL-01: comeco da cidade casa (''pres pru'')', 'filialzeta pres pru', got; end if;
  RAISE EXCEPTION 'OK';
END $t$;
