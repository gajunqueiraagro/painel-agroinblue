-- P82 (Gabriel 23/10/2026 08h10) — prova do banco: "a compra do cartao e' SAIDA; o pagamento do cartao e' TRANSFERENCIA" (111935..111937).
-- Numa transacao que TERMINA EM RAISE (nada fica): 'VGCA OK' ou 'VGCA FALHOU: ...'. pg_temp.vgca() e' o teste; pg_temp.vgca_mut(p_so)
-- aplica cada MUTACAO num bloco que se desfaz e exige que o vgca falhe. Clientes REAIS do proto (NJ, Agnaldo, Vera), admin AgroinBlue,
-- p_hoje 23/10/2026. "So' caixa" = as contas cc/inv/permuta escolhidas (o cartao FORA da selecao).
--   C1 a despesa aparece UMA vez, na compra: saidas de set/26 no padrao (cartao no conjunto) - saidas so' caixa = a soma direta das
--      compras no cartao realizadas em set/26 (NJ R$ 31.773,11); e nenhuma linha "Transferencias para outras contas" leva a fatura
--   C2 o pagamento da fatura e' so' transferencia: so' caixa, a coluna `cartao` de set/26 = a soma direta das transferencias banco ->
--      cartao realizadas no mes; no padrao, `cartao` e' zero em todo mes
--   C3 INVARIANTE: saldo_final = inicial + entradas - saidas - cartao em todo mes de 2026, no padrao e so' caixa, nos tres clientes; e a
--      tela so' caixa traz a linha "cartao" entre as saidas e o RESULTADO quando ha'
--   C4 a dupla contagem saiu: NJ out/26, o pagamento de fatura em aberto (R$ 5.017,49) nao tira do saldo do padrao — o saldo de out com
--      todos os status = o de "so' sem programado" (o pagamento e' programado) + as compras programadas de out
--   C5 fn_cpr_cartoes: os cartoes ativos do cliente e o saldo deles hoje = o saldo_final da fn_vg_saldos so' com eles
--   C6 seguranca: 42501 no outro cliente e sem usuario; anon sem EXECUTE em fn_cpr_cartoes e fn_vg_eh_cartao
set local statement_timeout = '600s';

create function pg_temp.vgca() returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  hoje constant date := '2026-10-23';
  f text[] := '{}'; n int; a numeric; b numeric; c uuid; cx uuid[]; ct uuid[]; j jsonb; x text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  FOREACH c IN ARRAY ARRAY[c_nj, c_ag, c_vera] LOOP
    cx := ARRAY(SELECT k.id FROM financeiro_contas_bancarias k WHERE k.cliente_id = c AND k.ativa AND lower(coalesce(k.tipo_conta, '')) IN ('cc', 'inv', 'permuta'));
    ct := ARRAY(SELECT k.id FROM financeiro_contas_bancarias k WHERE k.cliente_id = c AND fn_vg_eh_cartao(k.tipo_conta));
    -- C1
    SELECT (SELECT s.realizado FROM fn_vg_serie(c, '2026-09-01', '2026-09-30', NULL, NULL, NULL, NULL, hoje) s WHERE s.nivel = 'raiz' AND s.lado = 'saida')
         - coalesce((SELECT s.realizado FROM fn_vg_serie(c, '2026-09-01', '2026-09-30', cx, NULL, NULL, NULL, hoje) s WHERE s.nivel = 'raiz' AND s.lado = 'saida'), 0)
      INTO a;
    SELECT coalesce(round(sum(abs(l.valor)), 2), 0) INTO b FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = c AND NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND NOT coalesce(l.sem_movimentacao_caixa, false)
       AND l.status_transacao = 'realizado' AND l.tipo_operacao LIKE '2-%' AND l.conta_bancaria_id = ANY (ct)
       AND l.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30';
    IF coalesce(a, 0) IS DISTINCT FROM b THEN f := f || format('C1 %s compras no cartao set/26 %s <> %s', left(c::text, 4), a, b); END IF;
    -- C2
    SELECT s.cartao INTO a FROM fn_vg_saldos(c, '2026-09-01', '2026-09-30', cx, hoje) s;
    SELECT coalesce(round(sum(abs(l.valor)), 2), 0) INTO b FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = c AND NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND NOT coalesce(l.sem_movimentacao_caixa, false)
       AND l.status_transacao = 'realizado' AND l.tipo_operacao LIKE '3-%' AND l.conta_destino_id = ANY (ct) AND l.conta_bancaria_id = ANY (cx)
       AND l.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30';
    IF a IS DISTINCT FROM b THEN f := f || format('C2 %s fatura set/26 %s <> %s', left(c::text, 4), a, b); END IF;
    -- C3
    SELECT count(*) INTO n FROM fn_vg_saldos(c, '2026-01-01', '2026-12-31', NULL, hoje) s
     WHERE s.saldo_final <> s.saldo_inicial + s.entradas - s.saidas - s.cartao OR s.cartao <> 0;
    IF n > 0 THEN f := f || format('C3 %s padrao: %s meses', left(c::text, 4), n); END IF;
    SELECT count(*) INTO n FROM (SELECT s.*, lag(s.saldo_final) OVER (ORDER BY s.ano_mes) ant FROM fn_vg_saldos(c, '2026-01-01', '2026-12-31', cx, hoje) s) q
     WHERE q.saldo_final <> q.saldo_inicial + q.entradas - q.saidas - q.cartao OR (q.ant IS NOT NULL AND q.saldo_inicial <> q.ant);
    IF n > 0 THEN f := f || format('C3 %s so caixa: %s meses', left(c::text, 4), n); END IF;
    IF cardinality(ct) > 0 THEN
      j := fn_vg_tela(c, '2026-01-01', '2026-12-31', cx, NULL, NULL, NULL, hoje);
      SELECT string_agg(l ->> 'chave', ',' ORDER BY i) INTO x FROM jsonb_array_elements(j -> 'linhas') WITH ORDINALITY q(l, i)
       WHERE i >= (SELECT i2 FROM jsonb_array_elements(j -> 'linhas') WITH ORDINALITY q2(l2, i2) WHERE l2 ->> 'chave' = 'cartao') - 0;
      IF x IS DISTINCT FROM 'cartao,resultado,saldo_final' THEN f := f || format('C3 %s linha cartao na tela: %s', left(c::text, 4), x); END IF;
    END IF;
  END LOOP;
  -- C4
  SELECT s.saldo_final INTO a FROM fn_vg_saldos(c_nj, '2026-10-01', '2026-10-31', NULL, hoje) s;
  SELECT s.saldo_final INTO b FROM fn_vg_saldos(c_nj, '2026-10-01', '2026-10-31', NULL, hoje, '{previsto,agendado}') s;
  SELECT b - coalesce(round(sum(abs(l.valor)), 2), 0) INTO b FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND NOT coalesce(l.sem_movimentacao_caixa, false)
     AND l.status_transacao = 'programado' AND l.tipo_operacao LIKE '2-%' AND coalesce(l.data_vencimento, l.data_competencia) <= '2026-10-31';
  SELECT b + coalesce(round(sum(abs(l.valor)), 2), 0) INTO b FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND NOT coalesce(l.sem_movimentacao_caixa, false)
     AND l.status_transacao = 'programado' AND l.tipo_operacao LIKE '1-%' AND coalesce(l.data_vencimento, l.data_competencia) <= '2026-10-31';
  IF a IS DISTINCT FROM b THEN f := f || format('C4 NJ out/26 com a fatura em aberto %s <> %s', a, b); END IF;
  -- C5
  FOREACH c IN ARRAY ARRAY[c_nj, c_ag, c_vera] LOOP
    ct := ARRAY(SELECT k.id FROM financeiro_contas_bancarias k WHERE k.cliente_id = c AND k.ativa AND fn_vg_eh_cartao(k.tipo_conta) ORDER BY k.id);
    j := fn_cpr_cartoes(c, hoje);
    SELECT coalesce((SELECT s.saldo_final FROM fn_vg_saldos(c, '2026-10-01', hoje, ct, hoje, '{}') s), 0) INTO b;
    IF j -> 'ids' IS DISTINCT FROM to_jsonb(ct) OR (j ->> 'saldo')::numeric IS DISTINCT FROM (CASE WHEN cardinality(ct) = 0 THEN 0 ELSE b END) THEN
      f := f || format('C5 %s %s', left(c::text, 4), j); END IF;
  END LOOP;
  -- C6
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM fn_cpr_cartoes(c_ag, hoje); f := f || 'C6 cartoes de outro cliente'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('C6 ' || SQLSTATE); END IF; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN PERFORM fn_cpr_cartoes(c_nj, hoje); f := f || 'C6 sem usuario'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('C6 sem usuario ' || SQLSTATE); END IF; END;
  SELECT string_agg(p, ', ') INTO x FROM unnest(ARRAY['public.fn_cpr_cartoes(uuid,date)', 'public.fn_vg_eh_cartao(text)',
      'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)']) p WHERE has_function_privilege('anon', p, 'EXECUTE');
  IF x IS NOT NULL THEN f := f || ('C6 anon executa ' || x); END IF;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  IF cardinality(f) > 0 THEN RETURN 'FALHOU: ' || array_to_string(f, ' || '); END IF;
  RETURN 'OK';
end $f$;

create function pg_temp.vgca_mut(p_so int[] DEFAULT NULL) returns text language plpgsql as $f$
declare
  m record; d text; r text; vivas text[] := '{}'; total int := 0;
begin
  FOR m IN SELECT * FROM (VALUES
    ('M1 serie: a fatura com o cartao fora vira saida', 'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     'public.fn_vg_eh_cartao(c.tipo_conta));', 'public.fn_vg_eh_cartao(c.tipo_conta) AND false);'),
    ('M2 saldos: a fatura com o cartao fora vai para saidas', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'AS cf,', 'AND false AS cf,'),
    ('M3 saldos: o cartao fora do conjunto padrao', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'IN (''cc'', ''inv'', ''permuta'') OR public.fn_vg_eh_cartao(c.tipo_conta))', 'IN (''cc'', ''inv'', ''permuta''))'),
    ('M4 saldos: o saldo final sem o pagamento de cartao', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'sum(mm.ent - mm.sai - mm.car) OVER w,', 'sum(mm.ent - mm.sai) OVER w,'),
    ('M5 cpr: o saldo dos cartoes de fora', 'public.fn_cpr_cartoes(uuid,date)',
     '''saldo'', coalesce(v_saldo, 0)', '''saldo'', 0'),
    ('M6 serie: o cartao fora do conjunto padrao', 'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     'IN (''cc'', ''inv'', ''permuta'') OR public.fn_vg_eh_cartao(c.tipo_conta))', 'IN (''cc'', ''inv'', ''permuta''))')
  ) v(nome, fn, de, para) LOOP
    IF p_so IS NOT NULL AND NOT substr(m.nome, 2, position(' ' in m.nome) - 2)::int = ANY (p_so) THEN CONTINUE; END IF;
    total := total + 1;
    d := pg_get_functiondef(m.fn::regprocedure);
    IF position(m.de in d) = 0 THEN vivas := vivas || (m.nome || ' (trecho nao achado)'); CONTINUE; END IF;
    BEGIN
      EXECUTE replace(d, m.de, m.para);
      r := pg_temp.vgca();
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = r;
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      IF SQLERRM NOT LIKE 'FALHOU%' THEN vivas := vivas || m.nome; END IF;
    END;
  END LOOP;
  RETURN format('mutacoes mortas %s/%s', total - cardinality(vivas), total)
         || CASE WHEN cardinality(vivas) > 0 THEN ' — VIVAS: ' || array_to_string(vivas, ', ') ELSE '' END;
end $f$;

do $$ begin raise exception 'VGCA % | %', pg_temp.vgca(), pg_temp.vgca_mut(); end $$;
