-- P58 — `fn_conta_bancaria_efeito_conciliacao` (migration 20261028112320). Como `authenticated` (admin); TERMINA EM RAISE: nada fica.
-- T1 IGUALDADE com a regua da Conciliacao (`fn_conciliacao_status_ano`, ano a ano): em TODAS as contas ativas com inicio do cliente
--    Vera (o menor com historico: 6 contas), os meses conciliados e o ultimo mes sao os mesmos · T2 conta sem inicio: 0, sem ultimo ·
-- T3 outro tenant: 42501. Mutacao: tirar o corte "conta OU par com movimento" do filtro da interna, ou o "status = conciliado", derruba T1.
begin;
set local statement_timeout = '120s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE k uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; b record; v_old int; v_ult text; v_new jsonb; dif text := ''; ano int; n int := 0; e text;
BEGIN
  CREATE TEMP TABLE _st ON COMMIT DROP AS SELECT * FROM public.fn_conciliacao_status_ano(k, 2000) WHERE false;
  FOR ano IN SELECT generate_series((SELECT min(left(mes_inicio,4))::int FROM financeiro_contas_bancarias WHERE cliente_id = k AND ativa AND mes_inicio ~ '^\d{4}-\d{2}$'), extract(year from current_date)::int) LOOP
    INSERT INTO _st SELECT * FROM public.fn_conciliacao_status_ano(k, ano);
  END LOOP;
  FOR b IN SELECT * FROM financeiro_contas_bancarias WHERE cliente_id = k AND ativa AND mes_inicio ~ '^\d{4}-\d{2}$' LOOP
    SELECT count(*), max(s.ano_mes) INTO v_old, v_ult FROM _st s WHERE s.nivel = 'conta' AND s.conta_id = b.id AND s.status = 'conciliado' AND s.ano_mes >= b.mes_inicio;
    v_new := public.fn_conta_bancaria_efeito_conciliacao(b.id); n := n + 1;
    IF v_old <> (v_new->>'meses')::int OR v_ult IS DISTINCT FROM (v_new->>'ultimo') THEN dif := dif || format(' %s:%s/%s≠%s/%s', left(b.id::text, 8), v_old, v_ult, v_new->>'meses', v_new->>'ultimo'); END IF;
  END LOOP;
  IF n = 0 OR dif <> '' THEN RAISE EXCEPTION 'T1 (% contas):%', n, dif; END IF;
  -- T2
  IF (SELECT fn_conta_bancaria_efeito_conciliacao(id) FROM financeiro_contas_bancarias WHERE cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' LIMIT 1) IS NULL THEN RAISE EXCEPTION 'T2'; END IF;
  -- T3
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  BEGIN PERFORM fn_conta_bancaria_efeito_conciliacao((SELECT id FROM financeiro_contas_bancarias WHERE cliente_id = k LIMIT 1)); e := 'PASSOU';
  EXCEPTION WHEN others THEN e := sqlstate; END;
  IF e <> '42501' THEN RAISE EXCEPTION 'T3: %', e; END IF;
  RAISE EXCEPTION 'OK conta_bancaria_efeito_conciliacao (T1–T3, % contas iguais)', n;
END $t$;
rollback;
