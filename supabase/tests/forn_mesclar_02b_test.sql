-- FORN-MESCLAR-02b — mesclar N cadastros escolhendo os valores por campo; desfazer volta campos e referencias; sugestoes em componente.
--   R1 `fn_fornecedor_repetidos` junta no MESMO grupo A (sem CNPJ, mesmo nome de B), B e C (mesmo CNPJ) e D (mesmo nome de C): motivo
--      'documento'; o "Pec.3M-" fora
--   R2 simulacao com 3: o resultado leva os valores escolhidos; o subcentro de A, fora do plano, nao e' copiado; nada gravado
--   R3 escolher o subcentro fora do plano: recusa 'plano_fora'
--   R4 "Pec.3M-" com cadastro sem prefixo: recusa na simulacao e erro na gravacao
--   R5 gravar 3 numa operacao: campos escolhidos no que fica, referencias movidas, absorvidos inativos, apelidos
--   R6 desfazer: campos do que fica e referencias voltam, absorvidos reativados
--   R7 `fn_fornecedor_uso` tem recorrencias, financiamentos e operacoes
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  a uuid; b uuid; c uuid; d uuid; p uuid; v_fora uuid; v_faz uuid; v_plano uuid; v_fin uuid; v_l uuid; v_doc uuid; r jsonb; g jsonb; msg text; v_log uuid; x record;
BEGIN
  select id into v_fora from financeiro_plano_contas where not ativo limit 1;
  if v_fora is null then raise exception 'sem plano inativo para o teste'; end if;
  /* FORN-NOME-CAIXA-01 — os cadastros sinteticos nascem como escritos (o teste e' da mesclagem, nao da caixa do nome) */
  perform set_config('app.nome_caixa_escritor', 'on', true);
  insert into financeiro_fornecedores (cliente_id, nome, ativo, email, plano_padrao_id) values (k, 'SINT Luiz Mesclar da Silva', true, 'a@sint.br', v_fora) returning id into a;
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj, inscricao_estadual, email) values (k, 'SINT LUIZ MESCLAR DA SILVA LTDA', true, '54.442.418/0001-88', '284964700', 'b@sint.br') returning id into b;
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj, nome_fantasia, pix_tipo_chave, pix_chave) values (k, 'SINT Casa Mesclar', true, '54442418000188', 'Casa do Mesclar', 'cnpj', '54442418000188') returning id into c;
  /* D liga-se a C so' pelo nome: a corrente A–B–C–D so' fecha com o alcance transitivo */
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT Casa Mesclar Ltda', true) returning id into d;
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj) values (k, 'Pec.3M-SINT Luiz Mesclar da Silva', true, null) returning id into p;
  perform set_config('app.nome_caixa_escritor', 'off', true);

  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', k, 'fazenda_id', v_faz, 'descricao', 'SINT mesclar 02b', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'favorecido_id', a, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 200, 'total_parcelas', 2, 'data_primeira_parcela', '2031-02-10'));
  select lancamento_id into v_l from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 1;
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id)
    values (k, v_l, 'nf', 'nf', '77', 100, c) returning id into v_doc;

  -- R1
  select e into g from jsonb_array_elements(fn_fornecedor_repetidos(k)) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', b));
  if g is null or g->>'motivo' <> 'documento' or not (g->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', a), jsonb_build_object('id', c), jsonb_build_object('id', d)))
     or (g->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', p))) or (g->>'qtd')::int <> 4 then raise exception 'R1: %', g; end if;
  if g->'fornecedores'->0->>'cpf_cnpj' is null then raise exception 'R1 com documento primeiro: %', g; end if;

  -- R2
  r := fn_fornecedor_mesclar(b, array[a, c], true, jsonb_build_object('nome_fantasia', c, 'pagamento', c, 'email', a));
  if r->'recusa' is distinct from 'null'::jsonb or r->'resultado'->>'nome' <> 'SINT LUIZ MESCLAR DA SILVA LTDA' or r->'resultado'->>'nome_fantasia' <> 'Casa do Mesclar' then raise exception 'R2: %', r; end if;
  if r->'campos'->>'plano_padrao' <> b::text then raise exception 'R2 plano fora copiado: %', r->'campos'; end if;
  if (select nome_fantasia from financeiro_fornecedores where id = b) is not null or (select ativo from financeiro_fornecedores where id = a) is not true then raise exception 'R2 gravou'; end if;
  if (r->'por_tabela'->>'financeiro_lancamentos_v2.favorecido_id')::int < 1 or (r->'por_tabela'->>'financeiro_lancamento_documentos.emitente_id')::int <> 1 then raise exception 'R2 por_tabela: %', r->'por_tabela'; end if;

  -- R3
  r := fn_fornecedor_mesclar(b, array[a, c], true, jsonb_build_object('plano_padrao', a));
  if r->'recusa'->>'motivo' is distinct from 'plano_fora' then raise exception 'R3: %', r; end if;

  -- R4
  r := fn_fornecedor_mesclar(b, array[p], true);
  if r->'recusa'->>'motivo' is distinct from 'rateio_misto' then raise exception 'R4: %', r; end if;
  msg := null; begin r := fn_fornecedor_mesclar(b, array[p], false); exception when others then msg := SQLERRM; end;
  if msg not like '%não se mesclam%' then raise exception 'R4 gravacao: %', msg; end if;

  -- R5
  r := fn_fornecedor_mesclar(b, array[a, c], false, jsonb_build_object('razao_social', c, 'nome_fantasia', c, 'email', a, 'pagamento', c));
  v_log := (r->>'mesclagem_id')::uuid;
  select * into x from financeiro_fornecedores where id = b;
  if x.nome <> 'SINT Casa Mesclar' or x.nome_fantasia <> 'Casa do Mesclar' or x.email <> 'a@sint.br' or x.inscricao_estadual <> '284964700'
     or x.pix_chave <> '54442418000188' or x.plano_padrao_id is not null then raise exception 'R5 campos: %', row_to_json(x); end if;
  if not (x.aliases @> '["SINT Luiz Mesclar da Silva", "SINT LUIZ MESCLAR DA SILVA LTDA"]'::jsonb) then raise exception 'R5 apelidos: %', x.aliases; end if;
  if (select count(*) from financeiro_fornecedores where id in (a, c) and not ativo and fundido_em_id = b) <> 2 then raise exception 'R5 absorvidos'; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = v_l) <> b or (select emitente_id from financeiro_lancamento_documentos where id = v_doc) <> b then raise exception 'R5 referencias'; end if;

  -- R6
  r := fn_fornecedor_mesclagem_desfazer(v_log, 'teste 02b', false);
  select * into x from financeiro_fornecedores where id = b;
  if x.nome <> 'SINT LUIZ MESCLAR DA SILVA LTDA' or x.nome_fantasia is not null or x.email <> 'b@sint.br' or x.pix_chave is not null then raise exception 'R6 campos: %', row_to_json(x); end if;
  if (select count(*) from financeiro_fornecedores where id in (a, c) and ativo and fundido_em_id is null) <> 2 then raise exception 'R6 absorvidos'; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = v_l) <> a or (select emitente_id from financeiro_lancamento_documentos where id = v_doc) <> c then raise exception 'R6 referencias'; end if;

  -- R7
  r := fn_fornecedor_uso(a);
  if not (r ? 'recorrencias' and r ? 'financiamentos' and r ? 'operacoes' and r ? 'lancamentos') then raise exception 'R7: %', r; end if;

  RAISE EXCEPTION 'OK';
END $t$;
