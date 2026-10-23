-- P70 (Gabriel 23/10/2026) — prova do banco: "Conciliado até dd/mm · R$ x" (111940 fn_vg_conciliado, 111941 fn_vg_tela).
-- Numa transacao que TERMINA EM RAISE (nada fica): 'VGCO OK' ou 'VGCO FALHOU: ...'. pg_temp.vgco() e' o teste; pg_temp.vgco_mut(p_so)
-- aplica cada MUTACAO num bloco que se desfaz e exige que o vgco falhe. Clientes REAIS do proto (NJ, Agnaldo, Vera), admin AgroinBlue.
--   K1 a DATA e' a da fn_vg_saldos (a ancora mais antiga das contas escolhidas): no conjunto padrao e em cada conta ativa sozinha
--   K2 o SALDO na data = o da CONCILIACAO: em cada conta que tem o saldo conciliado gravado naquele dia (financeiro_saldos_bancarios_v2),
--      saldo_na_data = esse saldo; o saldo do conjunto = a soma das contas; e ha' conta com ancora DEPOIS da data e movimento entre as
--      duas (o caso que rola para tras) conferida
--   K3 a fn_vg_tela devolve o mesmo saldo (padrao e uma conta so'); com atividade (sem saldo) a data e o saldo vem nulos
--   K4 seguranca: 42501 no outro cliente e sem usuario; anon sem EXECUTE
set local statement_timeout = '600s';

create function pg_temp.vgco() returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  hoje constant date := '2026-10-23';
  f text[] := '{}'; c uuid; k uuid; d1 date; d2 date; sd numeric; cc jsonb; e jsonb; conc numeric; n_conf int := 0; n_rola int := 0;
  j jsonb; x text; uma uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  FOREACH c IN ARRAY ARRAY[c_nj, c_ag, c_vera] LOOP
    -- K1
    SELECT q.conciliado_ate, q.saldo, q.contas INTO d1, sd, cc FROM fn_vg_conciliado(c) q;
    SELECT max(s.conciliado_ate) INTO d2 FROM fn_vg_saldos(c, '2026-01-01', '2026-12-31', NULL, hoje) s;
    IF d1 IS DISTINCT FROM d2 OR d1 IS NULL THEN f := f || format('K1 %s padrao %s/%s', left(c::text, 4), d1, d2); END IF;
    FOR k IN SELECT b.id FROM financeiro_contas_bancarias b WHERE b.cliente_id = c AND b.ativa LOOP
      SELECT q.conciliado_ate INTO d1 FROM fn_vg_conciliado(c, ARRAY[k]) q;
      SELECT max(s.conciliado_ate) INTO d2 FROM fn_vg_saldos(c, '2026-01-01', '2026-12-31', ARRAY[k], hoje) s;
      IF d1 IS DISTINCT FROM d2 THEN f := f || format('K1 %s conta %s %s/%s', left(c::text, 4), left(k::text, 4), d1, d2); END IF;
    END LOOP;
    -- K2
    SELECT q.conciliado_ate INTO d1 FROM fn_vg_conciliado(c) q;
    IF sd IS DISTINCT FROM (SELECT round(sum((y ->> 'saldo_na_data')::numeric), 2) FROM jsonb_array_elements(cc) y) THEN
      f := f || format('K2 %s soma', left(c::text, 4)); END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(cc) LOOP
      SELECT s.saldo_final INTO conc FROM financeiro_saldos_bancarios_v2 s
       WHERE s.conta_bancaria_id = (e ->> 'conta')::uuid AND s.ano_mes = to_char(d1, 'YYYY-MM')
         AND coalesce(s.saldo_data, (to_date(s.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date) = d1
       ORDER BY s.updated_at DESC LIMIT 1;
      IF NOT FOUND THEN CONTINUE; END IF;
      n_conf := n_conf + 1;
      IF (e ->> 'ancora')::date > d1 AND (e ->> 'saldo_ancora')::numeric <> (e ->> 'saldo_na_data')::numeric THEN n_rola := n_rola + 1; END IF;
      IF round(conc, 2) IS DISTINCT FROM (e ->> 'saldo_na_data')::numeric THEN
        f := f || format('K2 %s conta %s %s <> conciliacao %s', left(c::text, 4), left(e ->> 'conta', 4), e ->> 'saldo_na_data', conc); END IF;
    END LOOP;
  END LOOP;
  IF n_conf < 20 OR n_rola < 1 THEN f := f || format('K2 poucas conferidas (%s, %s rolando)', n_conf, n_rola); END IF;
  -- K3
  j := fn_vg_tela(c_vera, '2026-01-01', '2026-12-31', NULL, NULL, NULL, NULL, hoje);
  IF (j ->> 'conciliado_saldo')::numeric IS DISTINCT FROM (SELECT q.saldo FROM fn_vg_conciliado(c_vera) q) THEN f := f || ('K3 vera ' || (j ->> 'conciliado_saldo')); END IF;
  SELECT (y ->> 'conta')::uuid INTO uma FROM fn_vg_conciliado(c_nj) q, jsonb_array_elements(q.contas) y
   WHERE (y ->> 'saldo_na_data')::numeric <> 0 ORDER BY (y ->> 'saldo_na_data')::numeric LIMIT 1;
  j := fn_vg_tela(c_nj, '2026-01-01', '2026-12-31', ARRAY[uma], NULL, NULL, NULL, hoje);
  IF (j ->> 'conciliado_saldo')::numeric IS DISTINCT FROM (SELECT q.saldo FROM fn_vg_conciliado(c_nj, ARRAY[uma]) q) THEN f := f || ('K3 nj uma conta ' || (j ->> 'conciliado_saldo')); END IF;
  j := fn_vg_tela(c_nj, '2026-01-01', '2026-12-31', NULL, NULL, NULL, 'pecuaria', hoje);
  IF j -> 'conciliado_saldo' <> 'null'::jsonb OR j -> 'conciliado_ate' <> 'null'::jsonb THEN f := f || 'K3 com atividade ha saldo'::text; END IF;
  -- K4
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM fn_vg_conciliado(c_ag); f := f || 'K4 outro cliente'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('K4 ' || SQLSTATE); END IF; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN PERFORM fn_vg_conciliado(c_nj); f := f || 'K4 sem usuario'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('K4 sem usuario ' || SQLSTATE); END IF; END;
  IF has_function_privilege('anon', 'public.fn_vg_conciliado(uuid,uuid[])', 'EXECUTE') THEN f := f || 'K4 anon executa'::text; END IF;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  IF cardinality(f) > 0 THEN RETURN 'FALHOU: ' || array_to_string(f, ' || '); END IF;
  RETURN format('OK (%s contas conferidas com a conciliacao, %s rolando para tras)', n_conf, n_rola);
end $f$;

create function pg_temp.vgco_mut(p_so int[] DEFAULT NULL) returns text language plpgsql as $f$
declare
  m record; d text; r text; vivas text[] := '{}'; total int := 0;
begin
  FOR m IN SELECT * FROM (VALUES
    ('M1 conciliado: sem rolar para tras ate a data', 'public.fn_vg_conciliado(uuid,uuid[])',
     'AND p.dia > d.dt AND p.dia <= a.data', 'AND false'),
    ('M2 conciliado: a ancora mais antiga de cada conta', 'public.fn_vg_conciliado(uuid,uuid[])',
     'ORDER BY f.conta, f.mes DESC', 'ORDER BY f.conta, f.mes'),
    ('M3 tela: o saldo do conjunto padrao, nao o escolhido', 'public.fn_vg_tela(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     'fn_vg_conciliado(p_cliente, p_contas)', 'fn_vg_conciliado(p_cliente, NULL)'),
    ('M4 tela: saldo com atividade', 'public.fn_vg_tela(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     '''conciliado_saldo'', CASE WHEN v_sem_saldo', '''conciliado_saldo'', CASE WHEN false')
  ) v(nome, fn, de, para) LOOP
    IF p_so IS NOT NULL AND NOT substr(m.nome, 2, position(' ' in m.nome) - 2)::int = ANY (p_so) THEN CONTINUE; END IF;
    total := total + 1;
    d := pg_get_functiondef(m.fn::regprocedure);
    IF position(m.de in d) = 0 THEN vivas := vivas || (m.nome || ' (trecho nao achado)'); CONTINUE; END IF;
    BEGIN
      EXECUTE replace(d, m.de, m.para);
      r := pg_temp.vgco();
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = r;
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      IF SQLERRM NOT LIKE 'FALHOU%' THEN vivas := vivas || m.nome; END IF;
    END;
  END LOOP;
  RETURN format('mutacoes mortas %s/%s', total - cardinality(vivas), total)
         || CASE WHEN cardinality(vivas) > 0 THEN ' — VIVAS: ' || array_to_string(vivas, ', ') ELSE '' END;
end $f$;

do $$ begin raise exception 'VGCO % | %', pg_temp.vgco(), pg_temp.vgco_mut(); end $$;
