-- FIN-FINANC-28 · TELA DO CONTRATO v3 — contrato encerrado nao tem "A resolver". Sintetico no Teste; termina em RAISE 'OK'.
--   E1 ativo com pendencias de dado: a_resolver tem cedula, credor sem documento e condicoes
--   E2 o mesmo contrato quitado: a_resolver vazio; o resto do retorno (liberacoes, condicoes) igual
--   E3 rolado e cancelado: vazio tambem
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  cred uuid; fin uuid; r jsonb; r2 jsonb; s text;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT CREDOR ENC', null, true) returning id into cred;
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, credor_id, taxa_juros_mensal)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT ENC', 'SINT-7711', 1000, 0, date '2026-01-10', date '2026-02-15', 1, 'ativo', cta, cred, 1)
  returning id into fin;
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values (k, fin, date '2026-01-12', 1000, 'fornecedor');

  r := public.fn_contrato_tela(fin, date '2026-06-01');
  IF not ((r -> 'a_resolver') @> '[{"chave":"sem_cedula"},{"chave":"credor_sem_documento"},{"chave":"condicoes"}]') THEN
    RAISE EXCEPTION 'E1: %', r -> 'a_resolver'; END IF;

  update financiamentos set status = 'quitado' where id = fin;
  r2 := public.fn_contrato_tela(fin, date '2026-06-01');
  IF jsonb_array_length(r2 -> 'a_resolver') <> 0 THEN RAISE EXCEPTION 'E2 vazio: %', r2 -> 'a_resolver'; END IF;
  IF (r2 - 'a_resolver') is distinct from (r - 'a_resolver') THEN RAISE EXCEPTION 'E2 resto mudou'; END IF;

  FOREACH s IN ARRAY array['rolado', 'cancelado'] LOOP
    update financiamentos set status = s where id = fin;
    r2 := public.fn_contrato_tela(fin, date '2026-06-01');
    IF jsonb_array_length(r2 -> 'a_resolver') <> 0 THEN RAISE EXCEPTION 'E3 %: %', s, r2 -> 'a_resolver'; END IF;
  END LOOP;
  RAISE EXCEPTION 'OK';
END $t$;
