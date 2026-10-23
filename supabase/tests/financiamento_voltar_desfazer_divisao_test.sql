-- P72 — `fn_financiamento_voltar_uma_conta` e `fn_financiamento_divisao_desfazer` (migration 20261028112300). Sintetico no cliente
-- Teste, como `authenticated` (admin); TERMINA EM RAISE: nada fica. Uma compra parcelada de 4 × 100 na conta A, dividida pelo cadastro 70/30.
-- T1 voltar (simular nao grava; gravar): as 4 IGUAIS a' original (conta A inteira, sem partes, nao dividida) e o cadastro sem partes
-- T2 desfazer: as 4 voltam a 70/30 e o cadastro com as partes · T3 mes fechado numa parcela: recusa dizendo QUAL, e nenhuma muda
-- T4 uma parcela mexida sozinha: o desfazer pelo cadastro recusa dizendo qual · T5 motivo vazio · T6 anon nao executa.
-- Mutacao: tirar o EXCEPTION que nomeia a parcela derruba T3; nao zerar `classificacao_partes` derruba T1; o desfazer sem a
-- conferencia "mexida sozinha" derruba T4.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '90s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_a uuid; v_b uuid; v_fin uuid; e text; r jsonb; l uuid[]; v_estado text;
BEGIN
  select id into v_a from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao limit 1;
  select id into v_b from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='agricultura' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar_dividido(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT P72', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_a, 'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 400, 'total_parcelas', 4, 'data_primeira_parcela', '2031-03-10',
     'conta_bancaria_id', c_cta), jsonb_build_array(jsonb_build_object('plano_conta_id', v_b, 'percentual', 70), jsonb_build_object('plano_conta_id', v_a, 'percentual', 30)), 'sint');
  select array_agg(lancamento_id order by numero_parcela) into l from financiamento_parcelas where financiamento_id = v_fin;
  -- T1
  r := fn_financiamento_voltar_uma_conta(v_fin, v_a, 'volta tudo para A', true);
  IF (r->>'parcelas')::int <> 4 OR (select count(*) from financeiro_lancamento_partes where lancamento_id = any(l)) <> 8 THEN RAISE EXCEPTION 'T1 simular: %', r; END IF;
  r := fn_financiamento_voltar_uma_conta(v_fin, v_a, 'volta tudo para A', false);
  /* o teste roda numa transacao so' (o `criado_em` e' o mesmo `now()`): cada passo e' empurrado no tempo, como na tela (um gesto por vez) */
  reset role; update financeiro_lancamento_divisoes set criado_em = criado_em + interval '1 minute' where lancamento_id = any(l) and acao = 'voltar'; set local role authenticated;
  select string_agg(format('%s:%s:%s', x.plano_conta_id = v_a, x.classificacao_dividida, (select count(*) from financeiro_lancamento_partes p where p.lancamento_id = x.id)), ',' order by x.id)
    into v_estado from financeiro_lancamentos_v2 x where x.id = any(l);
  IF v_estado <> 't:f:0,t:f:0,t:f:0,t:f:0' THEN RAISE EXCEPTION 'T1: %', v_estado; END IF;
  IF (select classificacao_partes from financiamentos where id = v_fin) IS NOT NULL THEN RAISE EXCEPTION 'T1 cadastro com partes'; END IF;
  IF (select count(*) from financeiro_lancamento_divisoes where lancamento_id = any(l) and acao = 'voltar' and financiamento_id = v_fin) <> 4 THEN RAISE EXCEPTION 'T1 trilha'; END IF;
  -- T2
  r := fn_financiamento_divisao_desfazer(v_fin, 'errei', false);
  reset role; update financeiro_lancamento_divisoes set criado_em = criado_em + interval '2 minutes' where lancamento_id = any(l) and acao = 'desfazer'; set local role authenticated;
  select string_agg(format('%s:%s', x.classificacao_dividida, (select string_agg(p.valor::text, '+' order by p.ordem) from financeiro_lancamento_partes p where p.lancamento_id = x.id)), ',' order by x.id)
    into v_estado from financeiro_lancamentos_v2 x where x.id = any(l);
  IF v_estado <> 't:70.00+30.00,t:70.00+30.00,t:70.00+30.00,t:70.00+30.00' THEN RAISE EXCEPTION 'T2: %', v_estado; END IF;
  IF jsonb_array_length((select classificacao_partes from financiamentos where id = v_fin)) <> 2 THEN RAISE EXCEPTION 'T2 cadastro'; END IF;
  -- T3: o mes da parcela 3 fechado
  reset role;
  /* so' a parcela 3 noutra competencia (as 4 nascem na mesma): fechar o mes dela prova que a frase diz QUAL parcela */
  update financeiro_lancamentos_v2 set data_competencia = '2031-05-10' where id = l[3];
  insert into financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento) select c_cli, c_faz, ano_mes, 'fechado' from financeiro_lancamentos_v2 where id = l[3];
  set local role authenticated;
  BEGIN PERFORM fn_financiamento_voltar_uma_conta(v_fin, v_a, 'x', false); RAISE EXCEPTION 'T3 passou';
  EXCEPTION WHEN others THEN e := sqlerrm; END;
  IF e NOT LIKE 'Parcela 3/4, venc. 10/05/2031: % está fechado no Financeiro%Nada foi mudado nas parcelas.' THEN RAISE EXCEPTION 'T3: %', e; END IF;
  IF (select count(*) from financeiro_lancamentos_v2 where id = any(l) and classificacao_dividida) <> 4 THEN RAISE EXCEPTION 'T3 mudou'; END IF;
  reset role;
  delete from financeiro_fechamentos where cliente_id = c_cli and fazenda_id = c_faz and ano_mes = (select ano_mes from financeiro_lancamentos_v2 where id = l[3]);
  set local role authenticated;
  -- T4: a parcela 2 volta sozinha (pela funcao por lancamento): o desfazer pelo cadastro recusa
  PERFORM fn_lancamento_voltar_uma_conta(l[2], v_a, 'so esta', false);
  reset role; update financeiro_lancamento_divisoes set criado_em = criado_em + interval '3 minutes' where lancamento_id = l[2] and acao = 'voltar' and desfeita_em is null; set local role authenticated;
  BEGIN PERFORM fn_financiamento_divisao_desfazer(v_fin, 'x', true); RAISE EXCEPTION 'T4 passou';
  EXCEPTION WHEN others THEN e := sqlerrm; END;
  IF e <> 'Parcela 2/4, venc. 10/04/2031 foi mudada sozinha depois da divisão do cadastro: desfaça nela antes.' THEN RAISE EXCEPTION 'T4: %', e; END IF;
  -- T5
  BEGIN PERFORM fn_financiamento_voltar_uma_conta(v_fin, null, ' ', true); RAISE EXCEPTION 'T5 passou';
  EXCEPTION WHEN others THEN e := sqlerrm; END;
  IF e <> 'Diga o motivo.' THEN RAISE EXCEPTION 'T5: %', e; END IF;
  -- T6
  IF has_function_privilege('anon', 'public.fn_financiamento_voltar_uma_conta(uuid,uuid,text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_financiamento_divisao_desfazer(uuid,text,boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'T6 anon'; END IF;
  RAISE EXCEPTION 'OK financiamento_voltar_desfazer_divisao (T1–T6)';
END $t$;
rollback;
