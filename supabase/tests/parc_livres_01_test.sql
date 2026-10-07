-- PARC-LIVRES-01 (passo 1) — `fn_parcelamento_cadastrar` com a chave OPCIONAL `parcelas`.
-- Roda depois da 20261027194000, numa transacao que TERMINA EM RAISE (nada fica gravado). Parcelamentos SINTETICOS no cliente
-- Teste, com o admin simulado. Os valores do T2 sao os das sete duplicatas que motivaram o PR (so' numeros e datas).
-- T1 SEM a chave: o comportamento de sempre (iguais, mensais, a ultima com a sobra; dia que nao existe cai no fim do mes).
-- T2 COM a chave: grava EXATAMENTE a lista — parcela, lancamento programado, vencimento e valor de cada uma; soma = total.
-- T3 recusas (22023), todas sem gravar nada: soma diferente, numero repetido, numero faltando, valor zero, data vazia,
--    tres casas, total_parcelas que nao bate, lista vazia.
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v_base jsonb; v_id uuid; v_txt text; v_antes int; r record;
  c_somak constant jsonb := '[{"numero":1,"data_vencimento":"2026-05-23","valor":33000.00},{"numero":2,"data_vencimento":"2026-06-19","valor":12833.34},
    {"numero":3,"data_vencimento":"2026-07-17","valor":12833.34},{"numero":4,"data_vencimento":"2026-08-14","valor":12833.33},
    {"numero":5,"data_vencimento":"2026-09-11","valor":12833.33},{"numero":6,"data_vencimento":"2026-10-09","valor":12833.33},
    {"numero":7,"data_vencimento":"2026-11-06","valor":12833.33}]';
  v_caso text; v_lista jsonb; v_extra jsonb;
BEGIN
  select id into v_faz from fazendas where cliente_id = c_cli order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  v_base := jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'SINT parc-livres-01', 'tipo_operacao', '2-Saídas',
              'plano_conta_id', v_plano, 'data_competencia', '2031-01-31', 'intervalo_meses', 1);

  -- T1: sem a chave
  v_id := fn_parcelamento_cadastrar(v_base || jsonb_build_object('valor_total', 100, 'total_parcelas', 3, 'data_primeira_parcela', '2031-01-31'));
  select string_agg(format('%s|%s|%s', p.numero_parcela, p.data_vencimento, p.valor_total), ' ' order by p.numero_parcela) into v_txt
    from financiamento_parcelas p where p.financiamento_id = v_id;
  IF v_txt IS DISTINCT FROM '1|2031-01-31|33.33 2|2031-02-28|33.33 3|2031-03-31|33.34' THEN RAISE EXCEPTION 'T1: sem a chave mudou: %', v_txt; END IF;

  -- T2: a lista, exatamente
  v_id := fn_parcelamento_cadastrar(v_base || jsonb_build_object('valor_total', 110000.00, 'parcelas', c_somak));
  select string_agg(format('%s|%s|%s', p.numero_parcela, p.data_vencimento, p.valor_total), ' ' order by p.numero_parcela) into v_txt
    from financiamento_parcelas p where p.financiamento_id = v_id;
  IF v_txt IS DISTINCT FROM '1|2026-05-23|33000.00 2|2026-06-19|12833.34 3|2026-07-17|12833.34 4|2026-08-14|12833.33 5|2026-09-11|12833.33 6|2026-10-09|12833.33 7|2026-11-06|12833.33' THEN
    RAISE EXCEPTION 'T2: parcelas gravadas: %', v_txt; END IF;
  select f.total_parcelas, f.valor_total, f.data_primeira_parcela into r from financiamentos f where f.id = v_id;
  IF (r.total_parcelas, r.valor_total, r.data_primeira_parcela) IS DISTINCT FROM (7, 110000.00::numeric, date '2026-05-23') THEN
    RAISE EXCEPTION 'T2: contrato %', r; END IF;
  IF (select sum(p.valor_total) from financiamento_parcelas p where p.financiamento_id = v_id) <> 110000.00 THEN RAISE EXCEPTION 'T2: soma'; END IF;
  -- cada lancamento = a parcela dele: valor, vencimento, programado, sem pagamento, descricao "… i/7" (passo 5: "Descricao i/N")
  IF (select count(*) from financiamento_parcelas p join financeiro_lancamentos_v2 l on l.id = p.lancamento_id
       where p.financiamento_id = v_id and l.valor = p.valor_total and l.data_vencimento = p.data_vencimento
         and l.status_transacao = 'programado' and l.data_pagamento is null and l.financiamento_id = v_id
         and l.descricao = 'SINT parc-livres-01 ' || p.numero_parcela || '/7') <> 7 THEN
    RAISE EXCEPTION 'T2: lancamentos nao espelham as parcelas'; END IF;
  -- lista fora de ordem no array: quem manda e' o numero
  v_id := fn_parcelamento_cadastrar(v_base || jsonb_build_object('valor_total', 30, 'total_parcelas', 2, 'parcelas',
            '[{"numero":2,"data_vencimento":"2031-03-10","valor":20},{"numero":1,"data_vencimento":"2031-02-05","valor":10}]'::jsonb));
  select string_agg(format('%s|%s|%s', p.numero_parcela, p.data_vencimento, p.valor_total), ' ' order by p.numero_parcela) into v_txt
    from financiamento_parcelas p where p.financiamento_id = v_id;
  IF v_txt IS DISTINCT FROM '1|2031-02-05|10.00 2|2031-03-10|20.00' THEN RAISE EXCEPTION 'T2: ordem pelo numero: %', v_txt; END IF;

  -- T3: recusas, sem gravar nada
  select count(*) into v_antes from financiamentos where cliente_id = c_cli;
  FOR v_caso, v_lista, v_extra IN
    select * from (values
      ('soma diferente (12.333,33 no lugar de 12.833,33)', jsonb_set(c_somak, '{6,valor}', '12333.33'), '{"valor_total":110000.00}'::jsonb),
      ('numero repetido', jsonb_set(c_somak, '{6,numero}', '6'), '{"valor_total":110000.00}'),
      ('numero faltando', jsonb_set(c_somak, '{6,numero}', '8'), '{"valor_total":110000.00}'),
      ('valor zero', '[{"numero":1,"data_vencimento":"2031-01-10","valor":0},{"numero":2,"data_vencimento":"2031-02-10","valor":10}]', '{"valor_total":10}'),
      ('data vazia', '[{"numero":1,"data_vencimento":"","valor":5},{"numero":2,"data_vencimento":"2031-02-10","valor":5}]', '{"valor_total":10}'),
      ('tres casas (5,004 + 4,996: a soma em centavos fecha; quem recusa e'' a regra das casas)', '[{"numero":1,"data_vencimento":"2031-01-10","valor":5.004},{"numero":2,"data_vencimento":"2031-02-10","valor":4.996}]', '{"valor_total":10}'),
      ('total_parcelas nao bate', c_somak, '{"valor_total":110000.00,"total_parcelas":6}'),
      ('lista vazia', '[]', '{"valor_total":10}')
    ) x(caso, lista, extra)
  LOOP
    BEGIN
      perform fn_parcelamento_cadastrar(v_base || v_extra || jsonb_build_object('parcelas', v_lista));
      RAISE EXCEPTION 'T3 (%): passou', v_caso USING ERRCODE = 'P0001';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  IF (select count(*) from financiamentos where cliente_id = c_cli) <> v_antes THEN RAISE EXCEPTION 'T3: recusa gravou contrato'; END IF;
  -- a frase da soma diz os dois numeros
  BEGIN
    perform fn_parcelamento_cadastrar(v_base || jsonb_build_object('valor_total', 110000.00, 'parcelas', jsonb_set(c_somak, '{6,valor}', '12333.33')));
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%109.500,00%110.000,00%Nada foi gravado.%' THEN RAISE EXCEPTION 'T3: frase da soma: %', SQLERRM USING ERRCODE = 'P0001'; END IF;
  END;

  RAISE EXCEPTION 'OK parc_livres_01 (T1-T3)';
END $t$;
