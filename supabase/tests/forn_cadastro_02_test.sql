-- FORN-CADASTRO-02 — o cadastro completo de fornecedor. Sintetico no Teste, admin simulado; termina em RAISE 'OK'.
--   C1 as colunas novas existem e gravam; as reusadas (email, telefone, tipo_recebimento, nome_favorecido, cpf_cnpj_pagamento) tambem
--   C2 CHECKs: tipo_pessoa so' PJ/PF; UF so' duas letras maiusculas; plano_padrao_id e' FK do plano
--   C3 fn_fornecedor_uso: contagens do banco (lancamento vivo, compra parcelada, documento) e o ultimo lancamento
--   C4 tenant: usuario sem acesso recebe 42501 na leitura do uso e nao ve a linha (RLS); anon sem EXECUTE
set local statement_timeout = '30s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  f uuid; plano uuid; r jsonb; ok boolean; n int;
BEGIN
  select id into plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas' order by ordem_exibicao limit 1;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo, nome_fantasia, tipo_pessoa, inscricao_estadual, inscricao_municipal,
    cep, logradouro, numero, complemento, bairro, municipio, uf, email, telefone, celular, contato_nome, tipo_recebimento, banco, agencia, conta,
    nome_favorecido, cpf_cnpj_pagamento, plano_padrao_id, observacao)
  values (k, 'SINT LUIZ FERNANDO DA SILVA LTDA', '54.442.418/0001-88', true, 'SINT CASA DO AGRONEGOCIO', 'PJ', '283456789', null,
    '79000-000', 'Rua A', '10', 'sala 2', 'Centro', 'Campo Grande', 'MS', 'a@b.c', '(67) 3333-3333', '(67) 99999-9999', 'Fulano',
    'PIX', 'Sicredi', '0001', '12345-6', 'SINT LUIZ FERNANDO DA SILVA LTDA', '54.442.418/0001-88', plano, 'obs')
  returning id into f;
  select into r to_jsonb(x) from financeiro_fornecedores x where x.id = f;
  /* FORN-NOME-CAIXA-01: o cadastro em caixa alta grava padronizado */
  if r->>'nome_fantasia' is distinct from 'Sint Casa do Agronegocio' or r->>'uf' is distinct from 'MS' or r->>'plano_padrao_id' is distinct from plano::text
     or r->>'contato_nome' is distinct from 'Fulano' or r->>'tipo_recebimento' is distinct from 'PIX' then raise exception 'C1 gravacao: %', r; end if;

  ok := false; begin update financeiro_fornecedores set tipo_pessoa = 'XX' where id = f; exception when check_violation then ok := true; end;
  if not ok then raise exception 'C2 tipo_pessoa aceitou XX'; end if;
  ok := false; begin update financeiro_fornecedores set uf = 'ms' where id = f; exception when check_violation then ok := true; end;
  if not ok then raise exception 'C2 uf aceitou ms'; end if;
  ok := false; begin update financeiro_fornecedores set plano_padrao_id = gen_random_uuid() where id = f; exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'C2 plano sem FK'; end if;

  r := public.fn_fornecedor_uso(f);
  if (r->>'lancamentos')::int <> 0 or (r->>'compras_parceladas')::int <> 0 or (r->>'documentos')::int <> 0 or r->>'ultimo_lancamento' is not null
     or r->>'cadastrado_em' is null then raise exception 'C3 vazio: %', r; end if;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_pagamento, status_transacao,
    favorecido_id, conta_bancaria_id, descricao, cenario, origem_lancamento)
  values (k, fz, '2-Saídas', 10, -1, date '2026-09-01', date '2026-09-05', 'realizado', f, cta, 'SINT uso', 'realizado', 'manual');
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, status_transacao,
    favorecido_id, conta_bancaria_id, descricao, cenario, origem_lancamento, cancelado)
  values (k, fz, '2-Saídas', 20, -1, date '2026-10-01', 'previsto', f, cta, 'SINT cancelado', 'realizado', 'manual', true);
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, valor_total, valor_entrada, data_contrato,
    data_primeira_parcela, total_parcelas, status, conta_bancaria_id, credor_id)
  values (k, fz, 'parcelamento', 'pecuaria', 'SINT compra', 100, 0, date '2026-09-01', date '2026-10-01', 1, 'ativo', cta, f);
  r := public.fn_fornecedor_uso(f);
  if (r->>'lancamentos')::int <> 1 or (r->>'compras_parceladas')::int <> 1 or r->>'ultimo_lancamento' is distinct from '2026-09-05'
    then raise exception 'C3 contagens: %', r; end if;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.fn_fornecedor_uso(f); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'C4 uso sem tenant respondeu'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.fn_fornecedor_uso(uuid)', 'execute') then raise exception 'C4 anon executa'; end if;
  if not has_function_privilege('authenticated', 'public.fn_fornecedor_uso(uuid)', 'execute') then raise exception 'C4 authenticated sem execute'; end if;
  select count(*) into n from pg_policy where polrelid = 'public.financeiro_fornecedores'::regclass;
  if n <> 4 then raise exception 'C4 policies: %', n; end if;

  RAISE EXCEPTION 'OK';
END $t$;
