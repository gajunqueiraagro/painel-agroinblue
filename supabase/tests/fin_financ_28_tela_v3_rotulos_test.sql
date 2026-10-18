-- FIN-FINANC-28 · TELA DO CONTRATO v3 — rotulos em portugues. Sintetico no Teste; termina em RAISE 'OK'.
--   R1 encargo IOF pago: item "Encargo · IOF" nos pagamentos e no historico
--   R2 liberacao em conta: evento "Liberação · em conta"; documento cedula: "Documento · Cédula · <nome>"
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  cred uuid; fin uuid; le uuid; r jsonb;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT CREDOR ROT', null, true) returning id into cred;
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, credor_id, taxa_juros_mensal)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT ROT', 'SINT-8811', 1000, 0, date '2026-01-10', date '2026-02-15', 1, 'ativo', cta, cred, 1)
  returning id into fin;
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values (k, fin, date '2026-01-12', 1000, 'conta');
  insert into financiamento_documentos (cliente_id, financiamento_id, especie, nome, storage_path) values (k, fin, 'cedula', 'SINT ced.pdf', 'x');
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_pagamento,
                                         status_transacao, conta_bancaria_id, cenario, origem_lancamento, favorecido_id)
  values (k, fz, '2-Saídas', 'SINT IOF', 38, date '2026-01-12', date '2026-01-12', 'realizado', cta, 'realizado', 'manual', cred) returning id into le;
  r := public.fn_contrato_encargo_vincular(fin, jsonb_build_array(jsonb_build_object('lancamento_id', le, 'papel', 'iof')), false);

  r := public.fn_contrato_tela(fin, date '2026-06-01');
  IF not ((r -> 'pagamentos') @> '[{"item":"Encargo · IOF"}]') or not ((r -> 'historico') @> '[{"evento":"Encargo · IOF"}]') THEN
    RAISE EXCEPTION 'R1: % %', r -> 'pagamentos', r -> 'historico'; END IF;
  IF not ((r -> 'historico') @> '[{"evento":"Liberação · em conta"}]') or not ((r -> 'historico') @> '[{"evento":"Documento · Cédula · SINT ced.pdf"}]') THEN
    RAISE EXCEPTION 'R2: %', r -> 'historico'; END IF;
  RAISE EXCEPTION 'OK';
END $t$;
