-- PARC-CONTRATO-01 (item 1) — `fn_financiamento_situacao(…, p_detalhe)`: o detalhe da tela do contrato.
-- Roda depois da 20261027194600, numa transacao que TERMINA EM RAISE (nada fica). Admin simulado; sintetico no cliente Teste.
-- D1 SEM p_detalhe o retorno nao tem chave nova, e COM ele as chaves de antes sao identicas, em TODO contrato de todo cliente
--    (a contagem comparada e' dita e nao pode ser zero); o lote continua = o dono sem detalhe.
-- D2 prazo: paga 3 dias antes / no dia / com atraso; nao paga vencida ha' N dias / vence em N dias — pelo HOJE recebido.
-- D3 competencia e conta do lancamento.  D4 NF ligada a's tres e boleto numa: documentos por parcela; cartoes com 1 nota que
--    confere, diferenca escrita quando nao confere, boletos e as contagens a vencer / vencido.  D5 documento cancelado nao conta.
-- D6 sem usuario: 42501 tambem com detalhe.
set local statement_timeout = '90s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_hoje constant date := date '2031-04-15';
  r record; v_n int := 0; v_dif int := 0; v_chave int := 0; v_tot int := 0;
  v_fin uuid; l1 uuid; l2 uuid; l3 uuid; v_nf uuid; v_bol uuid; j jsonb; p jsonb; c jsonb; v_conta text;
  c_novas constant text[] := array['competencia','conta_id','conta_nome','tipo_documento','numero_documento','prazo','documentos','boletos'];
  c_cart  constant text[] := array['a_vencer_qtde','vencido_qtde','notas_qtde','notas_valor','notas_diferenca','boletos'];
BEGIN
  -- D1
  FOR r IN select f.id, f.cliente_id from financiamentos f LOOP
    j := fn_financiamento_situacao(r.id, date '2026-10-07', true);
    p := fn_financiamento_situacao(r.id, date '2026-10-07');
    v_tot := v_tot + 1;
    IF p->'cartoes' ?| c_cart OR exists (select 1 from jsonb_array_elements(p->'parcelas') e where e ?| c_novas) THEN v_chave := v_chave + 1; END IF;
    IF jsonb_build_object('financiamento_id', j->'financiamento_id', 'natureza', j->'natureza', 'hoje', j->'hoje',
         'cartoes', (j->'cartoes') - c_cart,
         'parcelas', coalesce((select jsonb_agg(e - c_novas order by o) from jsonb_array_elements(j->'parcelas') with ordinality x(e, o)), '[]'::jsonb))
       IS DISTINCT FROM p THEN v_dif := v_dif + 1; END IF;
    IF p IS DISTINCT FROM (fn_financiamentos_situacao_lote(r.cliente_id, date '2026-10-07') -> r.id::text) AND v_tot <= 40 THEN
      RAISE EXCEPTION 'D1: o lote difere do dono sem detalhe no contrato %', r.id; END IF;
  END LOOP;
  IF v_tot = 0 THEN RAISE EXCEPTION 'D1: nenhum contrato comparado (conjunto vazio nao prova nada)'; END IF;
  IF v_chave <> 0 THEN RAISE EXCEPTION 'D1: % de % contratos tem chave nova SEM p_detalhe', v_chave, v_tot; END IF;
  IF v_dif <> 0 THEN RAISE EXCEPTION 'D1: % de % contratos mudam as chaves de antes COM p_detalhe', v_dif, v_tot; END IF;

  -- sintetico: 3 x 100,00 vencendo em 10/03, 10/04 e 10/05/2031
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT PARC-CONTRATO-01', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', (select id from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao limit 1),
     'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-03-10', 'conta_bancaria_id', c_cta));
  select lancamento_id into l1 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 1;
  select lancamento_id into l2 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 2;
  select lancamento_id into l3 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 3;
  select coalesce(nullif(nome_exibicao, ''), nome_conta) into v_conta from financeiro_contas_bancarias where id = c_cta;

  -- D2: nada pago; hoje 15/04 -> 1 e 2 vencidas ha' 36 e 5 dias, 3 vence em 25
  j := fn_financiamento_situacao(v_fin, c_hoje, true);
  IF (j->'parcelas'->0->'prazo', j->'parcelas'->1->'prazo', j->'parcelas'->2->'prazo') IS DISTINCT FROM
     ('{"tipo":"vencida","dias":36}'::jsonb, '{"tipo":"vencida","dias":5}'::jsonb, '{"tipo":"a_vencer","dias":25}'::jsonb) THEN
    RAISE EXCEPTION 'D2 nao pagas: % | % | %', j->'parcelas'->0->'prazo', j->'parcelas'->1->'prazo', j->'parcelas'->2->'prazo'; END IF;
  IF (j->'cartoes'->>'vencido_qtde', j->'cartoes'->>'a_vencer_qtde') IS DISTINCT FROM ('2', '1') THEN RAISE EXCEPTION 'D2 contagens: %', j->'cartoes'; END IF;
  -- o HOJE e' o recebido: em 10/04 a 2a vence HOJE (a vencer, 0 dias), nao esta' vencida
  j := fn_financiamento_situacao(v_fin, date '2031-04-10', true);
  IF j->'parcelas'->1->'prazo' IS DISTINCT FROM '{"tipo":"a_vencer","dias":0}'::jsonb THEN RAISE EXCEPTION 'D2 vence hoje: %', j->'parcelas'->1->'prazo'; END IF;
  -- pagas: 3 dias antes, no dia, 2 dias de atraso
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-03-07' where id = l1;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-04-10' where id = l2;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-05-12' where id = l3;
  j := fn_financiamento_situacao(v_fin, c_hoje, true);
  IF (j->'parcelas'->0->'prazo', j->'parcelas'->1->'prazo', j->'parcelas'->2->'prazo') IS DISTINCT FROM
     ('{"tipo":"antes","dias":3}'::jsonb, '{"tipo":"no_dia","dias":0}'::jsonb, '{"tipo":"atraso","dias":2}'::jsonb) THEN
    RAISE EXCEPTION 'D2 pagas: % | % | %', j->'parcelas'->0->'prazo', j->'parcelas'->1->'prazo', j->'parcelas'->2->'prazo'; END IF;
  IF (j->'cartoes'->>'vencido_qtde', j->'cartoes'->>'a_vencer_qtde') IS DISTINCT FROM ('0', '0') THEN RAISE EXCEPTION 'D2 contagens pagas: %', j->'cartoes'; END IF;

  -- D3
  IF (j->'parcelas'->0->>'competencia', j->'parcelas'->0->>'conta_id', j->'parcelas'->0->>'conta_nome') IS DISTINCT FROM ('2031-02-20', c_cta::text, v_conta)
     OR v_conta IS NULL THEN RAISE EXCEPTION 'D3: %', j->'parcelas'->0; END IF;

  -- D4: sem documento -> listas vazias, nota nula
  IF (j->'parcelas'->0->'documentos', j->'cartoes'->>'notas_qtde', j->'cartoes'->'notas_diferenca', j->'cartoes'->>'boletos') IS DISTINCT FROM ('[]'::jsonb, '0', 'null'::jsonb, '0') THEN
    RAISE EXCEPTION 'D4 vazio: % | %', j->'parcelas'->0->'documentos', j->'cartoes'; END IF;
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento)
    values (c_cli, l1, 'nf', 'nf', '5510', 300) returning id into v_nf;
  perform fin_documento_vincular(v_nf, c_cli, array[l2, l3]);
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento)
    values (c_cli, l2, 'boleto', 'boleto', 'B2', 100) returning id into v_bol;
  j := fn_financiamento_situacao(v_fin, c_hoje, true);
  IF (select count(*) from jsonb_array_elements(j->'parcelas') e where exists (select 1 from jsonb_array_elements(e->'documentos') d where d->>'id' = v_nf::text and d->>'especie' = 'nf' and d->>'numero' = '5510')) <> 3 THEN
    RAISE EXCEPTION 'D4: a NF nao esta nas tres parcelas: %', j->'parcelas'; END IF;
  IF (j->'parcelas'->0->>'boletos', j->'parcelas'->1->>'boletos', j->'parcelas'->2->>'boletos') IS DISTINCT FROM ('0', '1', '0') THEN RAISE EXCEPTION 'D4 boletos por parcela: %', j->'parcelas'; END IF;
  c := j->'cartoes';
  IF (c->>'notas_qtde', c->>'notas_valor', c->>'notas_diferenca', c->>'boletos') IS DISTINCT FROM ('1', '300.00', '0.00', '1') THEN RAISE EXCEPTION 'D4 cartoes: %', c; END IF;
  -- nota que NAO confere: a diferenca vem escrita, ao centavo (nota − soma das parcelas)
  update financeiro_lancamento_documentos set valor_documento = 300.01 where id = v_nf;
  c := fn_financiamento_situacao(v_fin, c_hoje, true)->'cartoes';
  IF c->>'notas_diferenca' IS DISTINCT FROM '0.01' THEN RAISE EXCEPTION 'D4 diferenca: %', c; END IF;
  -- nota SEM valor: nao comparavel (nulo), nunca zero
  update financeiro_lancamento_documentos set valor_documento = null where id = v_nf;
  c := fn_financiamento_situacao(v_fin, c_hoje, true)->'cartoes';
  IF (c->>'notas_qtde', c->'notas_valor', c->'notas_diferenca') IS DISTINCT FROM ('1', 'null'::jsonb, 'null'::jsonb) THEN RAISE EXCEPTION 'D4 sem valor: %', c; END IF;

  -- D5: cancelado nao conta
  update financeiro_lancamento_documentos set cancelado = true, cancelado_em = now(), cancelado_motivo = 'teste' where id = v_bol;
  j := fn_financiamento_situacao(v_fin, c_hoje, true);
  IF (j->'parcelas'->1->>'boletos', j->'cartoes'->>'boletos') IS DISTINCT FROM ('0', '0') THEN RAISE EXCEPTION 'D5: %', j->'cartoes'; END IF;

  -- D6
  perform set_config('request.jwt.claims', '', true);
  BEGIN perform fn_financiamento_situacao(v_fin, c_hoje, true); RAISE EXCEPTION 'D6: sem usuario devolveu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'OK parc_contrato_01_detalhe (D1-D6; % contratos comparados)', v_tot;
END $t$;
