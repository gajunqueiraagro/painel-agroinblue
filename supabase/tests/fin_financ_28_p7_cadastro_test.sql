-- FIN-FINANC-28 · PASSO 7 — o gerador do cronograma e o cadastro novo (financiamento e consorcio). Roda depois da 20261027200700;
-- termina em RAISE (nada fica). Admin simulado; sintetico no cliente Teste.
-- G1 SAC do mock: 1.800.000,00 a 10,5% a.a. anual, carencia ate' o 1o vencimento, 7 de principal = 8 linhas (1 so' juros 189.000,00;
--    principal 257.142,86 com juros 189.000,00 e depois 162.000,00 sobre o saldo); o principal fecha com o contratado ao centavo.
-- G2 Price: parcela constante (menos a ultima) e principal que fecha; G3 parcela unica; G4 personalizado que nao fecha recusa.
-- G5 consorcio do mock: carta 820.000,00 / 80 = 10.250,00 de fundo comum + 1.640,00 de taxa adm e fundo + 311,60 de seguro.
-- K1 criar (simulado) nao grava; K2 gravado: contrato, parcelas do gerador e os lancamentos do motor com o PLANO ESCOLHIDO
--    (principal 16020, juros 6040). K3 consorcio: natureza propria, a linha do consorcio, o plano "Consorcio a contemplar" no
--    principal, a descricao "Consórcio 002122/0457 · Parc 1/3" (a do FIN-LANC-DESCRICAO-CONTRATO-01), e o saldo fora do "liberado − amortizado".
--    Desde o FIN-CONSORCIO-02 o consorcio deste cadastro passa pelo escritor do consorcio (as chaves antigas traduzidas).
-- K4 recusas (o que falta; cadastro de outro cliente) e a guarda (outro usuario 42501; anon nao executa).
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_amort constant uuid := '0d42d354-926a-4a10-ab3a-f082adaef972';
  c_despfin constant uuid := '446178bd-ff5f-4fde-87ba-2ca7c0067de8';
  v_cred uuid; r jsonb; v_fin uuid; v_n int; v_ok boolean; v_plano_cons uuid; v_antes int;
BEGIN
  -- G1
  r := fn_financiamento_cronograma(jsonb_build_object('sistema', 'sac', 'principal', 1800000, 'taxa_aa', 10.5, 'periodicidade', 'anual',
    'primeiro_vencimento', '2027-08-15', 'carencia_ate', '2027-08-15', 'n', 7));
  IF jsonb_array_length(r->'linhas') <> 8 OR (r->'linhas'->0->>'principal')::numeric <> 0 OR (r->'linhas'->0->>'juros')::numeric <> 189000
     OR (r->'linhas'->1->>'principal')::numeric <> 257142.86 OR (r->'linhas'->1->>'juros')::numeric <> 189000
     OR (r->'linhas'->2->>'juros')::numeric <> 162000 OR (r->>'principal_total')::numeric <> 1800000
     OR r->>'vencimento_final' <> '2034-08-15' OR (r->>'parcelas_so_juros')::int <> 1 THEN RAISE EXCEPTION 'G1: %', r; END IF;
  -- G2
  r := fn_financiamento_cronograma(jsonb_build_object('sistema', 'price', 'principal', 1000, 'taxa_aa', 12, 'periodicidade', 'mensal', 'primeiro_vencimento', '2031-02-10', 'n', 12));
  IF (r->>'principal_total')::numeric <> 1000 OR (r->'linhas'->0->>'total')::numeric <> (r->'linhas'->5->>'total')::numeric THEN RAISE EXCEPTION 'G2: %', r; END IF;
  -- G3
  r := fn_financiamento_cronograma(jsonb_build_object('sistema', 'bullet', 'principal', 500, 'taxa_aa', 10, 'periodicidade', 'anual', 'primeiro_vencimento', '2032-01-10'));
  IF jsonb_array_length(r->'linhas') <> 1 OR (r->'linhas'->0->>'principal')::numeric <> 500 OR (r->'linhas'->0->>'juros')::numeric <> 50 THEN RAISE EXCEPTION 'G3: %', r; END IF;
  -- G4
  r := fn_financiamento_cronograma(jsonb_build_object('sistema', 'livre', 'principal', 1000,
    'parcelas', jsonb_build_array(jsonb_build_object('vencimento', '2031-05-10', 'principal', 400, 'juros', 10))));
  IF r->>'recusa' not like '%não fecha com o valor contratado%' THEN RAISE EXCEPTION 'G4: %', r; END IF;
  -- G5
  r := fn_financiamento_cronograma(jsonb_build_object('modo', 'consorcio', 'carta', 820000, 'prazo', 80, 'taxa_adm_pct', 14, 'fundo_reserva_pct', 2,
    'seguro_pct_mes', 0.038, 'primeiro_vencimento', '2026-07-10'));
  IF jsonb_array_length(r->'linhas') <> 80 OR (r->'linhas'->0->>'principal')::numeric <> 10250 OR (r->'linhas'->0->>'juros')::numeric <> 1951.60
     OR (r->'linhas'->0->>'total')::numeric <> 12201.60 OR (r->>'principal_total')::numeric <> 820000 OR r->>'vencimento_final' <> '2033-02-10' THEN RAISE EXCEPTION 'G5: %', r; END IF;

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT BANCO SETE', true) returning id into v_cred;
  -- K1
  select count(*) into v_antes from financiamentos where cliente_id = c_cli;
  r := fn_financiamento_criar(jsonb_build_object('cliente_id', c_cli, 'natureza', 'financiamento', 'atividade', 'pecuaria', 'descricao', 'SINT P7 FIN',
    'credor_id', v_cred, 'numero_contrato', 'SINT-7777', 'data_contrato', '2031-01-10', 'valor_total', 1800000, 'fazenda_id', c_faz,
    'conta_bancaria_id', c_cta, 'plano_principal_id', c_amort, 'plano_juros_id', c_despfin, 'sistema', 'sac', 'taxa_aa', 10.5,
    'periodicidade', 'anual', 'primeiro_vencimento', '2032-01-10', 'carencia_ate', '2032-01-10', 'n', 7), true);
  IF r->>'simulado' <> 'true' OR r->'recusa' <> 'null'::jsonb OR (r->>'lancamentos')::int <> 15 THEN RAISE EXCEPTION 'K1: %', r; END IF;
  IF (select count(*) from financiamentos where cliente_id = c_cli) <> v_antes THEN RAISE EXCEPTION 'K1 a simulacao gravou'; END IF;
  -- K2
  r := fn_financiamento_criar(jsonb_build_object('cliente_id', c_cli, 'natureza', 'financiamento', 'atividade', 'pecuaria', 'descricao', 'SINT P7 FIN',
    'credor_id', v_cred, 'numero_contrato', 'SINT-7777', 'data_contrato', '2031-01-10', 'valor_total', 1800000, 'fazenda_id', c_faz,
    'conta_bancaria_id', c_cta, 'plano_principal_id', c_amort, 'plano_juros_id', c_despfin, 'sistema', 'sac', 'taxa_aa', 10.5,
    'periodicidade', 'anual', 'primeiro_vencimento', '2032-01-10', 'carencia_ate', '2032-01-10', 'n', 7), false);
  v_fin := (r->>'financiamento_id')::uuid;
  IF (select count(*) from financiamento_parcelas where financiamento_id = v_fin) <> 8
     OR (select sum(valor_principal) from financiamento_parcelas where financiamento_id = v_fin) <> 1800000
     OR (select sistema_amortizacao from financiamentos where id = v_fin) <> 'sac' OR (select vencimento_final from financiamentos where id = v_fin) <> '2039-01-10' THEN
    RAISE EXCEPTION 'K2 contrato/parcelas';
  END IF;
  IF (select count(*) from financeiro_lancamentos_v2 l join financiamento_parcelas q on q.lancamento_juros_id = l.id where q.financiamento_id = v_fin and l.plano_conta_id = c_despfin) <> 8
     OR (select count(*) from financeiro_lancamentos_v2 l join financiamento_parcelas q on q.lancamento_id = l.id where q.financiamento_id = v_fin and l.plano_conta_id = c_amort) <> 7 THEN
    RAISE EXCEPTION 'K2 o motor nao usou o plano escolhido';
  END IF;
  -- K3
  select id into v_plano_cons from financeiro_plano_contas where cliente_id is null and subcentro = 'Consórcio a contemplar' and ativo;
  r := fn_financiamento_criar(jsonb_build_object('cliente_id', c_cli, 'natureza', 'consorcio', 'atividade', 'pecuaria', 'descricao', 'SINT P7 CONS',
    'credor_id', v_cred, 'grupo', '002122', 'cota', '0457', 'valor_total', 3000, 'prazo', 3, 'taxa_adm_pct', 15, 'fundo_reserva_pct', 0, 'seguro_pct_mes', 0,
    'primeiro_vencimento', '2031-07-10', 'fazenda_id', c_faz, 'conta_bancaria_id', c_cta, 'plano_juros_id', c_despfin), false);
  v_fin := (r->>'financiamento_id')::uuid;
  IF (select natureza from financiamentos where id = v_fin) <> 'consorcio' OR (select numero_contrato from financiamentos where id = v_fin) <> '002122 / 0457'
     OR (select taxa_adm_pct from financiamento_consorcio where financiamento_id = v_fin) <> 15 THEN RAISE EXCEPTION 'K3 consorcio'; END IF;
  IF (select l.plano_conta_id from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.numero_parcela = 1) <> v_plano_cons
     OR (select l.descricao from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.numero_parcela = 1) <> 'Consórcio 002122/0457 · Parc 1/3'
     OR (select l.valor from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_juros_id where q.financiamento_id = v_fin and q.numero_parcela = 1) <> 150 THEN
    RAISE EXCEPTION 'K3 lancamentos do consorcio';
  END IF;
  IF (public._fn_financiamento_saldo(v_fin, '2031-12-31')->>'aplica_saldo')::boolean THEN RAISE EXCEPTION 'K3 o consorcio entrou no liberado − amortizado'; END IF;
  -- K4
  r := fn_financiamento_criar(jsonb_build_object('cliente_id', c_cli, 'natureza', 'financiamento', 'descricao', '', 'valor_total', 10), true);
  IF r->>'recusa' not like 'Falta: descrição, credor, conta de captação, nº do contrato, data do contrato, fazenda%' THEN RAISE EXCEPTION 'K4 falta: %', r; END IF;
  r := fn_financiamento_criar(jsonb_build_object('cliente_id', c_cli, 'natureza', 'parcelamento'), true);
  IF r->>'recusa' not like '%compra parcelada tem o formulário dela%' THEN RAISE EXCEPTION 'K4 parcelamento: %', r; END IF;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_ok := false;
  BEGIN perform fn_financiamento_criar(jsonb_build_object('cliente_id', c_cli), true); EXCEPTION WHEN sqlstate '42501' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'K4 outro usuario criou'; END IF;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF has_function_privilege('anon', 'public.fn_financiamento_criar(jsonb,boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'K4 anon'; END IF;

  RAISE EXCEPTION 'FIN_FINANC_28_P7 OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'FIN_FINANC_28_P7 OK' THEN RAISE EXCEPTION 'OK'; END IF;
  RAISE;
END $t$;
