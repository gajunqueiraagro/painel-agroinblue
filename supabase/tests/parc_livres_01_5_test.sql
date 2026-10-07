-- PARC-LIVRES-01 (passo 5) — o nome da parcela e' "Descricao i/N", com um dono.
-- Roda depois da 20261027194400, numa transacao que TERMINA EM RAISE (nada fica gravado). Sintetico no cliente Teste, admin simulado.
-- N1 o dono: `_fn_parcela_descricao`. N2 `_fn_parcela_renumerar`: so' o trecho do fim; forma nova, forma antiga, nome a' mao,
--    "12/3" nao e' "2/3". N3 nascimento nos dois modos (igual todo mes e parcelas livres). N4 edicao que muda o N: forma nova
--    acompanha, a acrescentada nasce na forma nova, a forma ANTIGA so' troca o "i/N", o nome a' mao fica, na paga so' o nome muda.
-- N5 `fn_parcelas_dos_lancamentos`: [numero, total] do contrato por lancamento; a cancelada fora; sem usuario 42501.
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v_fin uuid; v_fin2 uuid; v_txt text; v_r jsonb; v_j jsonb; v_msg text; v_cod text;
  p1 record; p2 record; p3 record; v_novo uuid;
BEGIN
  -- ── N1 ──
  IF _fn_parcela_descricao('Manutenção Cercas', 2, 3) <> 'Manutenção Cercas 2/3' THEN RAISE EXCEPTION 'N1: %', _fn_parcela_descricao('Manutenção Cercas', 2, 3); END IF;
  -- ── N2 ──
  IF _fn_parcela_renumerar('Manutenção Cercas 2/3', 2, 3, 2, 4) <> 'Manutenção Cercas 2/4' THEN RAISE EXCEPTION 'N2 nova'; END IF;
  IF _fn_parcela_renumerar('Manutenção Cercas - Parcela 2/3', 2, 3, 3, 5) <> 'Manutenção Cercas - Parcela 3/5' THEN RAISE EXCEPTION 'N2 antiga'; END IF;
  IF _fn_parcela_renumerar('Nome posto à mão', 2, 3, 2, 4) <> 'Nome posto à mão' THEN RAISE EXCEPTION 'N2 a mao'; END IF;
  IF _fn_parcela_renumerar('Compra 12/3', 2, 3, 2, 4) <> 'Compra 12/3' THEN RAISE EXCEPTION 'N2: "12/3" nao e'' "2/3"'; END IF;
  IF _fn_parcela_renumerar('Lote 2/3 do Zé', 2, 3, 2, 4) <> 'Lote 2/3 do Zé' THEN RAISE EXCEPTION 'N2: so'' o FIM do nome'; END IF;
  IF _fn_parcela_renumerar('2/3', 2, 3, 2, 4) <> '2/4' THEN RAISE EXCEPTION 'N2 sozinho'; END IF;
  IF _fn_parcela_renumerar(null, 2, 3, 2, 4) IS NOT NULL THEN RAISE EXCEPTION 'N2 nulo'; END IF;

  select id into v_faz from fazendas where cliente_id = c_cli order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;

  -- ── N3: nascimento, igual todo mes ──
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'SINT Manutenção Cercas', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-02-10'));
  select string_agg(l.descricao, ' | ' order by q.numero_parcela) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin;
  IF v_txt <> 'SINT Manutenção Cercas 1/3 | SINT Manutenção Cercas 2/3 | SINT Manutenção Cercas 3/3' THEN RAISE EXCEPTION 'N3 igual: %', v_txt; END IF;
  -- parcelas livres
  v_fin2 := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'SINT Livre', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'valor_total', 100,
     'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'data_vencimento', '2031-02-01', 'valor', 30), jsonb_build_object('numero', 2, 'data_vencimento', '2031-03-05', 'valor', 70))));
  select string_agg(l.descricao, ' | ' order by q.numero_parcela) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin2;
  IF v_txt <> 'SINT Livre 1/2 | SINT Livre 2/2' THEN RAISE EXCEPTION 'N3 livres: %', v_txt; END IF;

  -- ── N5: a leitura do "i/N" ──
  select q.id, q.lancamento_id, q.data_vencimento into p1 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 1;
  select q.id, q.lancamento_id, q.data_vencimento into p2 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 2;
  select q.id, q.lancamento_id, q.data_vencimento into p3 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 3;
  v_j := fn_parcelas_dos_lancamentos(c_cli);
  IF v_j -> p2.lancamento_id::text IS DISTINCT FROM '[2, 3]'::jsonb THEN RAISE EXCEPTION 'N5: parcela 2 = %', v_j -> p2.lancamento_id::text; END IF;
  IF (select count(*) from jsonb_object_keys(v_j) k where k in (select l.id::text from financeiro_lancamentos_v2 l where l.financiamento_id in (v_fin, v_fin2))) <> 5 THEN RAISE EXCEPTION 'N5: nao trouxe as 5 parcelas'; END IF;

  -- ── N4: a edicao muda o N (3 -> 4, acrescenta uma). p1 PAGA; p2 com nome a' mao; p3 na forma ANTIGA ──
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-02-10' where id = p1.lancamento_id;
  update financeiro_lancamentos_v2 set descricao = 'Nome posto à mão' where id = p2.lancamento_id;
  update financeiro_lancamentos_v2 set descricao = 'SINT Manutenção Cercas - Parcela 3/3' where id = p3.lancamento_id;
  v_r := fn_parcelamento_editar_parcelas(v_fin, jsonb_build_array(
           jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100),
           jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 100),
           jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 60),
           jsonb_build_object('data_vencimento', '2031-06-01', 'valor', 40)), 300);
  select string_agg(l.descricao, ' | ' order by q.numero_parcela) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.status <> 'cancelado';
  IF v_txt <> 'SINT Manutenção Cercas 1/4 | Nome posto à mão | SINT Manutenção Cercas - Parcela 3/4 | SINT Manutenção Cercas 4/4' THEN RAISE EXCEPTION 'N4: %', v_txt; END IF;
  IF (select (l.status_transacao, l.data_pagamento, l.valor, l.data_vencimento) from financeiro_lancamentos_v2 l where l.id = p1.lancamento_id)
     IS DISTINCT FROM ('realizado'::text, date '2031-02-10', 100::numeric, date '2031-02-10') THEN RAISE EXCEPTION 'N4: a paga mudou alem do nome'; END IF;
  -- tira a 2 (N 4 -> 3): os numeros descem e o "i/N" acompanha nas duas formas
  select q.id into v_novo from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 4 and q.status <> 'cancelado';
  v_r := fn_parcelamento_editar_parcelas(v_fin, jsonb_build_array(
           jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100),
           jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 60),
           jsonb_build_object('id', v_novo, 'data_vencimento', '2031-06-01', 'valor', 40)), 200);
  select string_agg(l.descricao, ' | ' order by q.numero_parcela) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.status <> 'cancelado';
  IF v_txt <> 'SINT Manutenção Cercas 1/3 | SINT Manutenção Cercas - Parcela 2/3 | SINT Manutenção Cercas 3/3' THEN RAISE EXCEPTION 'N4 retirada: %', v_txt; END IF;
  -- a leitura acompanha, e a cancelada sai
  v_j := fn_parcelas_dos_lancamentos(c_cli);
  IF v_j -> p3.lancamento_id::text IS DISTINCT FROM '[2, 3]'::jsonb OR v_j ? p2.lancamento_id::text THEN RAISE EXCEPTION 'N5 depois da edicao: % / cancelada presente %', v_j -> p3.lancamento_id::text, v_j ? p2.lancamento_id::text; END IF;

  -- sem usuario: 42501
  perform set_config('request.jwt.claims', '', true);
  BEGIN
    perform fn_parcelas_dos_lancamentos(c_cli);
    RAISE EXCEPTION 'N5: sem usuario devolveu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  RAISE EXCEPTION 'OK parc_livres_01_5 (N1-N5)';
END
$t$;
