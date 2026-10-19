-- FIN-DOC-SOMA-01 — `fin_documento_confronto`, o dono do "Documentado" da aba Documentos do lancamento.
--   S1 NF + boleto iguais: a NF fecha com o lancamento, o boleto confere a' parte e NAO soma
--   S2 duas NFs: somam
--   S3 boleto diferente da NF: a NF fecha, o boleto difere; o lancamento nao confere
--   S4 NF inteira numa parcela de 3, sem vinculo: contra as parcelas do contrato (fecha); "Outro" com valor e' informativo
--   S5 NF parcelada (ligada a's parcelas) registrada duas vezes ("1234" e "000.001.234" com a chave): conta UMA vez, e volta em
--      `repetidas`; mesmo numero de OUTRO emitente cadastrado nao e' repeticao
--   S6 sem usuario: 42501
-- Sintetico no cliente Teste (tres parcelamentos de 3 x 100,00); termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_chave constant text := '50311211222333000181550010000012341000012345';
  v_faz uuid; v_plano uuid; fa uuid; fb uuid; c1 uuid; c2 uuid; c3 uuid;
  l1 uuid; l2 uuid; l3 uuid; m1 uuid; n1 uuid; n2 uuid; n3 uuid; v_doc uuid; r jsonb; msg text;
BEGIN
  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj) values (k, 'SINT DOC-SOMA Alfa', true, '11.222.333/0001-81') returning id into fa;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT DOC-SOMA Beta', true) returning id into fb;
  c1 := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', k, 'fazenda_id', v_faz, 'descricao', 'SINT doc-soma 1', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-02-10'));
  c2 := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', k, 'fazenda_id', v_faz, 'descricao', 'SINT doc-soma 2', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-02-10'));
  c3 := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', k, 'fazenda_id', v_faz, 'descricao', 'SINT doc-soma 3', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-02-10'));
  select lancamento_id into l1 from financiamento_parcelas where financiamento_id = c1 and numero_parcela = 1;
  select lancamento_id into l2 from financiamento_parcelas where financiamento_id = c1 and numero_parcela = 2;
  select lancamento_id into l3 from financiamento_parcelas where financiamento_id = c1 and numero_parcela = 3;
  select lancamento_id into m1 from financiamento_parcelas where financiamento_id = c2 and numero_parcela = 1;
  select lancamento_id into n1 from financiamento_parcelas where financiamento_id = c3 and numero_parcela = 1;
  select lancamento_id into n2 from financiamento_parcelas where financiamento_id = c3 and numero_parcela = 2;
  select lancamento_id into n3 from financiamento_parcelas where financiamento_id = c3 and numero_parcela = 3;

  -- S1 NF 100 + boleto 100
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id)
    values (k, l1, 'nf', 'nf', '000.000.101', 100, fa), (k, l1, 'bol', 'boleto', '1', 100, null);
  r := fin_documento_confronto(l1, k);
  if (r->>'valor_documentado')::numeric <> 100 or (r->>'confere')::boolean is not true then raise exception 'S1 confere: %', r; end if;
  if r->'fiscal'->>'base' is distinct from 'lancamento' or r->'fiscal'->>'situacao' is distinct from 'fecha' then raise exception 'S1 fiscal: %', r; end if;
  if jsonb_array_length(r->'pagamentos') <> 1 or (r->'pagamentos'->0->>'confere')::boolean is not true then raise exception 'S1 boleto: %', r; end if;

  -- S2 duas NFs 60 + 40
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id)
    values (k, l2, 'nf a', 'nf', '201', 60, fa), (k, l2, 'nf b', 'nf', '202', 40, fa);
  r := fin_documento_confronto(l2, k);
  if (r->>'valor_documentado')::numeric <> 100 or (r->'fiscal'->>'qtd')::int <> 2 or (r->>'confere')::boolean is not true then raise exception 'S2: %', r; end if;

  -- S3 NF 100 + boleto 90
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id)
    values (k, l3, 'nf', 'nf', '301', 100, fa), (k, l3, 'bol', 'boleto', '3', 90, null);
  r := fin_documento_confronto(l3, k);
  if r->'fiscal'->>'situacao' is distinct from 'fecha' or (r->>'confere')::boolean is not false then raise exception 'S3 confere: %', r; end if;
  if (r->'pagamentos'->0->>'diferenca')::numeric <> -10 or (r->'pagamentos'->0->>'confere')::boolean is not false then raise exception 'S3 boleto: %', r; end if;

  -- S4 NF 300 so' na parcela 1 do contrato 2 (sem vinculo) + "Outro" de 50
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id)
    values (k, m1, 'nf', 'nf', '401', 300, fa), (k, m1, 'outro', 'outro', 'x', 50, null);
  r := fin_documento_confronto(m1, k);
  if r->'fiscal'->>'base' is distinct from 'contrato' or (r->'fiscal'->>'base_valor')::numeric <> 300 or (r->'fiscal'->>'base_qtd')::int <> 3
     or r->'fiscal'->>'situacao' is distinct from 'fecha' or (r->>'confere')::boolean is not true then raise exception 'S4 contrato: %', r; end if;
  if (r->>'informativos')::int <> 1 or (r->>'valor_documentado')::numeric <> 300 then raise exception 'S4 outro: %', r; end if;

  -- S5 a NF da compra (300, ligada a's 3 parcelas) duas vezes, e o "5" de dois emitentes
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id)
    values (k, n1, 'nf', 'nf', '1234', 300, null) returning id into v_doc;
  insert into financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
    select v_doc, n1, x, k from unnest(array[n2, n3]) x;
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, chave_acesso, emitente_id)
    values (k, n1, 'nf de novo', 'nf', '000.001.234', 300, c_chave, null) returning id into v_doc;
  insert into financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
    select v_doc, n1, x, k from unnest(array[n2, n3]) x;
  r := fin_documento_confronto(n2, k);
  if r->'repetidas' is distinct from '[{"numero": "1234", "vezes": 2}]'::jsonb then raise exception 'S5 repetidas: %', r; end if;
  if (r->>'valor_documentado')::numeric <> 300 or r->'fiscal'->>'base' is distinct from 'grupo' or r->'fiscal'->>'situacao' is distinct from 'fecha'
     or (r->'fiscal'->>'qtd')::int <> 1 then raise exception 'S5 conta uma vez: %', r; end if;
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento, emitente_id, emitente_documento)
    values (k, l1, 'nf alfa 5', 'nf', '5', 10, fa, '11.222.333/0001-81'), (k, l1, 'nf beta 5', 'nf', '005', 20, fb, null);
  r := fin_documento_confronto(l1, k);
  if jsonb_array_length(r->'repetidas') <> 0 or (r->>'valor_documentado')::numeric <> 130 then raise exception 'S5 outro emitente: %', r; end if;

  -- S6 sem usuario
  perform set_config('request.jwt.claims', '', true);
  msg := null;
  begin r := fin_documento_confronto(l1, k); exception when others then msg := SQLSTATE; end;
  if msg is distinct from '42501' then raise exception 'S6 sem usuario: % / %', msg, r; end if;

  RAISE EXCEPTION 'OK';
END $t$;
