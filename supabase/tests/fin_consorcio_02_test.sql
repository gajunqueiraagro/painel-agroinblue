-- FIN-CONSORCIO-02 — o consorcio universal. Roda depois da 20261027203300; termina em RAISE (nada fica). Admin simulado; sintetico no
-- cliente Teste (o T10 so' SIMULA no cliente real: nada e' gravado).
-- T1 o gerador reproduz o caso do documento (4 faixas desde o FIN-CONSORCIO-03b: a ultima adiada leva os centavos do fundo comum; totais;
--    o aviso da reserva; o do fundo comum saiu porque agora fecha com a carta).
-- T2 outra administradora: taxa igual, transcorridas diluidas, INCC sem teto, seguro sobre o credito — 1 faixa, sem aviso.
-- T3 gravado pelo escritor: 80 parcelas, as 34 adiadas sem vencimento e sem lancamento; o principal em "Consorcio a contemplar".
-- T4 editar uma parcela (ajustada) e regerar mantendo (nada muda: recusa, FIN-CONSORCIO-04) / recalculando.  T5 reajuste limitado ao teto, e o desfazer devolve tudo.
-- T6 contemplacao data as adiadas (mes seguinte, mensal) e o desfazer as devolve sem vencimento e sem lancamento.
-- T7 devolucao numa parcela (e o desvincular).  T8 a guarda (outro usuario 42501).  T9 recusas.  T10 a conversao do 002122, simulada.
set local statement_timeout = '120s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_estorno constant uuid := 'f9459817-bfe8-4532-84ee-b04b744b88c4';
  c_regras constant jsonb := '{"carta":197607.98,"primeira_parcela":"2031-07-16","prazo_grupo":80,"ja_transcorridas":34,"transcorridas":"adiadas",
    "fundo_comum":{"modo":"pct_parcela","valor":1.1625},"taxa_adm":{"total_pct":13,"forma":"antecipada","pct_parcela":0.25,"primeiras":12},
    "fundo_reserva":{"modo":"pct_parcela","valor":0.0063,"total_pct":0.5},"seguro":{"modo":"valor","valor":0},
    "reajuste":{"indice":"preco_do_bem","teto_pct":5,"mes":7}}';
  v_cred uuid; v_lancs uuid[]; r jsonb; v_fin uuid; v_p5 uuid; v_op uuid; v_ok boolean; v_lanc uuid; v_vinc uuid; v_n int; v_cons uuid;
BEGIN
  -- T1
  r := fn_consorcio_cronograma(c_regras);
  IF r->>'recusa' is not null OR (r->>'parcelas')::int <> 80 OR jsonb_array_length(r->'faixas') <> 4
     OR (r->'faixas'->0->>'total')::numeric <> 2803.66 OR (r->'faixas'->0->>'ate')::int <> 12
     OR (r->'faixas'->1->>'total')::numeric <> 2890.84 OR (r->'faixas'->1->>'taxa_adm')::numeric <> 581.20 OR (r->'faixas'->1->>'ate')::int <> 46
     OR (r->'faixas'->2->>'total')::numeric <> 2716.49 OR (r->'faixas'->2->>'fundo_comum')::numeric <> 2704.04 OR not (r->'faixas'->2->>'adiada')::boolean
     OR (r->'faixas'->2->>'ate')::int <> 79 OR (r->'faixas'->3->>'fundo_comum')::numeric <> 2703.92 OR (r->'faixas'->3->>'ajuste_arredondamento')::numeric <> -0.12
     OR (r->'totais'->>'fundo_comum')::numeric <> 197607.98 OR (r->'totais'->>'taxa_adm')::numeric <> 25689.04
     OR (r->'totais'->>'fundo_reserva')::numeric <> 996.00 OR (r->'totais'->>'total')::numeric <> 224293.02
     OR r->'linhas'->46->>'vencimento' is not null OR r->'linhas'->45->>'vencimento' <> '2035-04-16' THEN RAISE EXCEPTION 'T1: %', r - 'linhas'; END IF;
  IF EXISTS (select 1 from jsonb_array_elements_text(r->'avisos') a where a like 'fundo comum:%')
     OR NOT (r->'avisos') @> '["reserva: 996,00 pelo % por parcela x 988,04 pelo % total"]'::jsonb THEN RAISE EXCEPTION 'T1 avisos: %', r->'avisos'; END IF;

  -- T2
  r := fn_consorcio_cronograma('{"carta":100000,"primeira_parcela":"2031-02-05","prazo_grupo":50,"ja_transcorridas":10,"transcorridas":"diluidas",
    "taxa_adm":{"total_pct":15,"forma":"igual"},"fundo_reserva":{"modo":"pct_total","valor":2},
    "seguro":{"modo":"pct_mes","valor":0.05,"base":"credito","inicio":"primeira"},"reajuste":{"indice":"INCC"}}'::jsonb);
  IF r->>'recusa' is not null OR (r->>'parcelas')::int <> 40 OR jsonb_array_length(r->'faixas') <> 1 OR (r->'faixas'->0->>'fundo_comum')::numeric <> 2500
     OR (r->'faixas'->0->>'taxa_adm')::numeric <> 375 OR (r->'faixas'->0->>'fundo_reserva')::numeric <> 50 OR (r->'faixas'->0->>'seguro')::numeric <> 50
     OR (r->'faixas'->0->>'total')::numeric <> 2975 OR jsonb_array_length(r->'avisos') <> 0 THEN RAISE EXCEPTION 'T2: %', r - 'linhas'; END IF;

  -- T3
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT ADMINISTRADORA CONSORCIO', true) returning id into v_cred;
  r := fn_consorcio_salvar(null, jsonb_build_object('cliente_id', c_cli, 'descricao', 'SINT CONS 02', 'credor_id', v_cred, 'grupo', '002122', 'cota', '1',
    'tipo_bem', 'Máquina agrícola', 'atividade', 'pecuaria', 'fazenda_id', c_faz, 'conta_bancaria_id', c_cta, 'data_adesao', '2031-06-19', 'regras', c_regras), false);
  IF r->>'recusa' is not null THEN RAISE EXCEPTION 'T3 recusa: %', r->>'recusa'; END IF;
  v_fin := (r->>'financiamento_id')::uuid;
  select id into v_cons from financeiro_plano_contas where cliente_id is null and subcentro = 'Consórcio a contemplar' and ativo;
  IF (select count(*) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') <> 80
     OR (select count(*) from financiamento_parcelas where financiamento_id = v_fin and adiada and data_vencimento is null and lancamento_id is null) <> 34
     OR (select count(*) from financiamento_parcelas where financiamento_id = v_fin and not adiada and lancamento_id is not null and lancamento_juros_id is not null) <> 46
     OR (select l.plano_conta_id from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.numero_parcela = 1) <> v_cons
     OR (select abs(l.valor) from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.numero_parcela = 1) <> 2309.64
     OR (select abs(l.valor) from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_juros_id where q.financiamento_id = v_fin and q.numero_parcela = 1) <> 494.02
     OR (select natureza from financiamentos where id = v_fin) <> 'consorcio' OR (select numero_contrato from financiamentos where id = v_fin) <> '002122 / 1' THEN
    RAISE EXCEPTION 'T3 gravado';
  END IF;
  r := fn_consorcio_tela(v_fin, '2031-01-01');
  IF jsonb_array_length(r->'faixas') <> 4 OR (r->'saldo'->>'fundo_comum_adiado')::numeric <> 91937.24
     OR (r->'parcelas'->79->>'ajuste_arredondamento')::numeric <> -0.12 OR (r->'faixas'->3->>'ajuste_arredondamento')::numeric <> -0.12 OR (r->'saldo'->>'carta')::numeric <> 197607.98
     OR (r->'parcelas'->79->>'situacao') <> 'adiada' OR (r->'parcelas'->0->>'situacao') <> 'a_vencer' THEN RAISE EXCEPTION 'T3 tela: %', r->'saldo'; END IF;

  -- T4
  select id into v_p5 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 5;
  perform fn_financiamento_parcelas_editar(v_fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', v_p5, 'valor_fundo_comum', 2000))), false);
  IF (select valor_fundo_comum from financiamento_parcelas where id = v_p5) <> 2000 OR not (select ajustada from financiamento_parcelas where id = v_p5)
     OR (select abs(l.valor) from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.id = v_p5) <> 2012.45 THEN
    RAISE EXCEPTION 'T4 editar';
  END IF;
  -- FIN-CONSORCIO-04: mantendo o ajuste, as outras 79 voltariam identicas — nada muda, o Regerar recusa
  v_ok := false;
  BEGIN perform fn_financiamento_parcelas_regerar(v_fin, 'manter_ajustes', false);
  EXCEPTION WHEN others THEN v_ok := sqlerrm like 'Nada muda%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T4 manter ajustes sem mudanca'; END IF;
  IF (select valor_fundo_comum from financiamento_parcelas where id = v_p5) <> 2000 THEN RAISE EXCEPTION 'T4 manter ajustes'; END IF;
  perform fn_financiamento_parcelas_regerar(v_fin, 'recalcular_todas', false);
  IF (select valor_fundo_comum from financiamento_parcelas where id = v_p5) <> 2297.19 OR (select ajustada from financiamento_parcelas where id = v_p5)
     OR (select count(*) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') <> 80 THEN RAISE EXCEPTION 'T4 recalcular'; END IF;

  -- T5
  r := fn_consorcio_reajustar(v_fin, 10, '2032-01-01', 'preco_do_bem', false);
  IF (r->>'pct_aplicado')::numeric <> 5 OR not (r->>'limitado_pelo_teto')::boolean OR (r->>'carta_depois')::numeric <> 207488.38
     OR (select valor_fundo_comum from financiamento_parcelas where financiamento_id = v_fin and data_vencimento = '2032-01-16') <> 2412.05
     OR (select valor_fundo_comum from financiamento_parcelas where financiamento_id = v_fin and data_vencimento = '2031-12-16') <> 2297.19
     OR (select max(valor_fundo_comum) from financiamento_parcelas where financiamento_id = v_fin and adiada) <> 2839.24
     OR (select max(faixa) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') < 4 THEN RAISE EXCEPTION 'T5 reajuste: %', r - 'antes' - 'depois'; END IF;
  perform fn_financiamento_parcelas_desfazer((r->>'operacao_id')::uuid, 'teste do desfazer', false);
  IF (select valor_total from financiamentos where id = v_fin) <> 197607.98 OR (select (regras->>'carta')::numeric from financiamento_consorcio where financiamento_id = v_fin) <> 197607.98
     OR (select valor_fundo_comum from financiamento_parcelas where financiamento_id = v_fin and data_vencimento = '2032-01-16') <> 2297.19
     -- FIN-CONSORCIO-03b: a ultima adiada (com os centavos do fundo comum) e' faixa propria: 4 faixas antes do reajuste e depois do desfazer
     OR (select max(faixa) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') <> 4 THEN RAISE EXCEPTION 'T5 desfazer'; END IF;

  -- T6
  r := fn_consorcio_contemplar(v_fin, '{"data":"2032-03-10","forma":"lance","lance_tipo":"embutido","lance_valor":20000,"carta_recebida":177607.98}'::jsonb, false);
  IF (r->>'adiadas_datadas')::int <> 34
     OR (select min(data_vencimento) from financiamento_parcelas where financiamento_id = v_fin and adiada) <> '2032-04-16'
     OR (select count(*) from financiamento_parcelas where financiamento_id = v_fin and adiada and lancamento_id is not null) <> 34
     OR not (select contemplado from financiamento_consorcio where financiamento_id = v_fin) THEN RAISE EXCEPTION 'T6 contemplar: %', r - 'antes' - 'depois'; END IF;
  select array_agg(x) into v_lancs from financiamento_parcelas q, unnest(array[q.lancamento_id, q.lancamento_juros_id]) x
   where q.financiamento_id = v_fin and q.adiada and x is not null;
  perform fn_financiamento_parcelas_desfazer((r->>'operacao_id')::uuid, 'teste do desfazer', false);
  IF (select count(*) from financiamento_parcelas where financiamento_id = v_fin and adiada and data_vencimento is null and lancamento_id is null) <> 34
     OR (select contemplado from financiamento_consorcio where financiamento_id = v_fin)
     OR coalesce(array_length(v_lancs, 1), 0) <> 34 OR exists (select 1 from financeiro_lancamentos_v2 l where l.id = any(v_lancs) and not l.cancelado) THEN
    RAISE EXCEPTION 'T6 desfazer';
  END IF;

  -- T7
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento,
    data_pagamento, cenario, descricao, plano_conta_id, conta_destino_id)
  values (c_cli, c_faz, '1-Entradas', '1', 89.71, 'realizado', '2031-06-23', '2031-06-23', '2031-06-23', 'realizado', 'SINT devolucao consorcio', c_estorno, c_cta)
  returning id into v_lanc;
  r := fn_consorcio_devolucao_vincular((select id from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 1), v_lanc, false);
  v_vinc := (r->>'vinculo_id')::uuid;
  IF ((fn_consorcio_tela(v_fin)->'parcelas'->0->>'devolvido')::numeric) <> 89.71 THEN RAISE EXCEPTION 'T7 devolucao'; END IF;
  perform fn_financiamento_parcela_desvincular(v_vinc, 'teste', false);
  IF (fn_consorcio_tela(v_fin)->'parcelas'->0->>'devolvido') is not null
     OR (select valor_total from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 1) <> 2803.66 THEN RAISE EXCEPTION 'T7 desvincular'; END IF;

  -- T8
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_ok := false; BEGIN perform fn_consorcio_tela(v_fin); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 tela de outro usuario'; END IF;
  v_ok := false; BEGIN perform fn_consorcio_salvar(null, jsonb_build_object('cliente_id', c_cli), true); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T8 salvar de outro usuario'; END IF;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF has_function_privilege('anon', 'public.fn_consorcio_salvar(uuid,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_consorcio_salvar_exec(uuid,jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'T8 acl'; END IF;

  -- T9
  r := fn_consorcio_cronograma('{"carta":1000,"primeira_parcela":"2031-01-01","prazo_grupo":10,"taxa_adm":{"total_pct":1,"forma":"antecipada","pct_parcela":0.5,"primeiras":3}}'::jsonb);
  IF r->>'recusa' not like '%passa da taxa total%' THEN RAISE EXCEPTION 'T9 antecipada: %', r->>'recusa'; END IF;
  r := fn_consorcio_salvar(null, jsonb_build_object('cliente_id', c_cli, 'regras', c_regras), true);
  IF r->>'recusa' not like 'Falta: descrição, administradora, conta de pagamento, fazenda%' THEN RAISE EXCEPTION 'T9 falta: %', r->>'recusa'; END IF;
  r := fn_consorcio_reajustar(v_fin, 3, '2099-01-01', null, true);
  IF r->>'recusa' is not null THEN RAISE EXCEPTION 'T9 adiadas tambem reajustam: %', r->>'recusa'; END IF;

  -- T10 a conversao do 002122 (Agnaldo), SIMULADA: nada gravado
  select count(*) into v_n from financiamentos where cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  r := fn_consorcio_salvar(null, jsonb_build_object('cliente_id', 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2', 'descricao', 'Consórcio John Deere 002122/1',
    'credor_id', 'd2b9be0d-21d6-4819-920e-12adb490ae41', 'grupo', '002122', 'cota', '1', 'tipo_bem', 'Máquina agrícola', 'atividade', 'pecuaria',
    'fazenda_id', '68f41ea0-3708-4423-b4b4-e42a3733c87a', 'conta_bancaria_id', '186a093b-0204-4164-95e3-0dd247457ffa', 'data_adesao', '2026-06-19',
    'regras', c_regras || '{"primeira_parcela":"2026-07-16"}'::jsonb), true);
  IF r->>'recusa' is not null OR not (r->>'simulado')::boolean OR (r->'cronograma'->'totais'->>'total')::numeric <> 224293.02
     OR (select count(*) from financiamentos where cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2') <> v_n THEN RAISE EXCEPTION 'T10: %', r; END IF;

  RAISE EXCEPTION 'FIN_CONSORCIO_02 OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'FIN_CONSORCIO_02 OK' THEN RAISE EXCEPTION 'OK'; END IF;
  RAISE;
END $t$;
