-- P79 (Gabriel 23/10/2026) — prova do banco: o FILTRO DE STATUS e os VENCIDOS da Visao Geral (migrations 111930..111933).
-- Numa transacao que TERMINA EM RAISE (nada fica): 'VGST OK' ou 'VGST FALHOU: ...'. pg_temp.vgst() e' o teste; pg_temp.vgst_mut() aplica
-- cada MUTACAO num bloco que se desfaz e exige que o vgst falhe ('mutacoes mortas N/N'). Clientes REAIS do proto (Agnaldo e Vera nas 16
-- combinacoes; NJ no padrao), admin AgroinBlue; p_hoje fixo em 23/10/2026.
--   S1 padrao = explicito: sem p_status/p_incluir_vencidos a tela e' a dos tres status com vencidos (os tres clientes)
--   S2 INVARIANTE para QUALQUER combinacao (8 subconjuntos de status x vencidos sim/nao): saldo_final = inicial + entradas - saidas em
--      todo mes, o inicial de um mes = o final do anterior, e o SALDO FINAL da tela = o da fn_vg_saldos com os MESMOS chips
--   S3 vencidos: desligar tira exatamente o vencido (saidas com - saidas sem = saidas_vencidas com; idem entradas), e sem vencidos a
--      marca e' zero
--   S4 nenhum status: a serie nao tem previsto nem vencido; os saldos nao tem previsto
--   S5 cada status sozinho: previsto(previsto) + previsto(programado) + previsto(agendado) = previsto(os tres), por lado e mes
--   S6 status fora dos tres (realizado, texto qualquer, nulo no meio): 22023
--   S7 a tela ecoa o que usou (status, incluir_vencidos)
--   S8 seguranca: o gestor da NJ recebe 42501 no Agnaldo; sem usuario, 42501; anon sem EXECUTE nas assinaturas novas
--   S9 IGUALDADE COM A CPR (111934): o saldo do fim de out/2026 da fn_vg_saldos = o da CPR replicada (cprRecorte.ts + saldoEmCaixa.ts:
--      caixa de hoje pelas ancoras + todo em aberto ate' 31/10 com os MESMOS status — vencidos inclusive —, a compra no cartao inclusive,
--      so' a ponta de transferencia fora do caixa de fora), nos tres clientes, com os tres status, so' agendado e nenhum
set local statement_timeout = '600s';

create function pg_temp.vgst() returns text language plpgsql as $f$
declare
  c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2'; c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  hoje constant date := '2026-10-23'; de constant date := '2026-01-01'; ate constant date := '2026-12-31';
  todos constant text[] := ARRAY['previsto', 'programado', 'agendado'];
  f text[] := '{}'; n int; c uuid; st text[]; vv boolean; j jsonb; x text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  -- S1
  FOREACH c IN ARRAY ARRAY[c_ag, c_vera, c_nj] LOOP
    IF fn_vg_tela(c, de, ate, NULL, NULL, NULL, NULL, hoje) IS DISTINCT FROM fn_vg_tela(c, de, ate, NULL, NULL, NULL, NULL, hoje, todos, true) THEN
      f := f || format('S1 %s padrao <> explicito', left(c::text, 4)); END IF;
  END LOOP;

  FOREACH c IN ARRAY ARRAY[c_ag, c_vera] LOOP
    FOR st IN SELECT ARRAY(SELECT t FROM unnest(todos) WITH ORDINALITY u(t, i) WHERE (k >> (i::int - 1)) & 1 = 1) FROM generate_series(0, 7) k LOOP
      FOREACH vv IN ARRAY ARRAY[true, false] LOOP
        -- S2
        SELECT count(*) INTO n FROM (
          SELECT s.saldo_inicial, s.entradas, s.saidas, s.saldo_final, lag(s.saldo_final) OVER (ORDER BY s.ano_mes) AS ant
            FROM fn_vg_saldos(c, de, ate, NULL, hoje, st, vv) s) q
         WHERE q.saldo_final <> q.saldo_inicial + q.entradas - q.saidas OR (q.ant IS NOT NULL AND q.saldo_inicial <> q.ant);
        IF n > 0 THEN f := f || format('S2 %s %s venc=%s: %s meses quebram', left(c::text, 4), st, vv, n); END IF;
        IF vv AND cardinality(st) IN (0, 3) OR (NOT vv AND cardinality(st) = 3) THEN
          j := fn_vg_tela(c, de, ate, NULL, NULL, NULL, NULL, hoje, st, vv);
          IF (SELECT l -> 'valores' FROM jsonb_array_elements(j -> 'linhas') l WHERE l ->> 'chave' = 'saldo_final')
             IS DISTINCT FROM (SELECT jsonb_agg(s.saldo_final ORDER BY s.ano_mes) FROM fn_vg_saldos(c, de, ate, NULL, hoje, st, vv) s) THEN
            f := f || format('S2 %s %s venc=%s: saldo da tela <> saldos', left(c::text, 4), st, vv); END IF;
          -- S7
          IF j -> 'status' IS DISTINCT FROM to_jsonb(st) OR (j ->> 'incluir_vencidos')::boolean IS DISTINCT FROM vv THEN
            f := f || format('S7 %s eco %s/%s', left(c::text, 4), j -> 'status', j -> 'incluir_vencidos'); END IF;
        END IF;
      END LOOP;
      -- S3
      SELECT count(*) INTO n FROM fn_vg_saldos(c, de, ate, NULL, hoje, st, true) a JOIN fn_vg_saldos(c, de, ate, NULL, hoje, st, false) b USING (ano_mes)
       WHERE a.saidas - b.saidas <> a.saidas_vencidas OR a.entradas - b.entradas <> a.entradas_vencidas
          OR b.saidas_vencidas <> 0 OR b.entradas_vencidas <> 0;
      IF n > 0 THEN f := f || format('S3 %s %s: %s meses', left(c::text, 4), st, n); END IF;
      SELECT count(*) INTO n FROM fn_vg_serie(c, de, ate, NULL, NULL, NULL, NULL, hoje, st, false) WHERE previsto_vencido <> 0;
      IF n > 0 THEN f := f || format('S3 %s %s: %s nos com vencido sem o chip', left(c::text, 4), st, n); END IF;
    END LOOP;
    -- S4
    SELECT count(*) INTO n FROM fn_vg_serie(c, de, ate, NULL, NULL, NULL, NULL, hoje, '{}', true) WHERE previsto <> 0 OR previsto_vencido <> 0;
    IF n > 0 THEN f := f || format('S4 %s: %s nos com previsto sem status', left(c::text, 4), n); END IF;
    SELECT count(*) INTO n FROM fn_vg_saldos(c, de, ate, NULL, hoje, '{}', true) WHERE com_previsto;
    IF n > 0 THEN f := f || format('S4 %s: %s meses com previsto nos saldos', left(c::text, 4), n); END IF;
    -- S5
    SELECT count(*) INTO n FROM (
      SELECT x1.lado, x1.ano_mes, sum(x1.previsto) AS uma FROM (
        SELECT * FROM fn_vg_serie(c, de, ate, NULL, NULL, NULL, NULL, hoje, '{previsto}', true) WHERE nivel = 'raiz'
        UNION ALL SELECT * FROM fn_vg_serie(c, de, ate, NULL, NULL, NULL, NULL, hoje, '{programado}', true) WHERE nivel = 'raiz'
        UNION ALL SELECT * FROM fn_vg_serie(c, de, ate, NULL, NULL, NULL, NULL, hoje, '{agendado}', true) WHERE nivel = 'raiz') x1
       GROUP BY 1, 2) a
      FULL JOIN (SELECT lado, ano_mes, previsto AS tres FROM fn_vg_serie(c, de, ate, NULL, NULL, NULL, NULL, hoje, todos, true) WHERE nivel = 'raiz') b
        USING (lado, ano_mes)
     WHERE coalesce(a.uma, 0) <> coalesce(b.tres, 0);
    IF n > 0 THEN f := f || format('S5 %s: %s lado-mes nao somam', left(c::text, 4), n); END IF;
  END LOOP;

  -- S9
  WITH cl(id) AS (SELECT unnest(ARRAY[c_ag, c_vera, c_nj])),
  comb(st) AS (SELECT unnest(ARRAY['{previsto,programado,agendado}', '{agendado}', '{}'])::text[]),
  contas AS (SELECT k.id, k.cliente_id, lower(coalesce(k.tipo_conta, '')) tipo FROM financeiro_contas_bancarias k JOIN cl ON cl.id = k.cliente_id
              WHERE k.ativa AND lower(coalesce(k.tipo_conta, '')) IN ('cc', 'inv', 'permuta')),
  legs AS (SELECT kk.id conta, l.data_pagamento dia,
             CASE WHEN l.conta_destino_id = kk.id AND l.conta_bancaria_id IS DISTINCT FROM kk.id THEN abs(l.valor)
                  ELSE abs(l.valor) * CASE l.sinal::text WHEN '1' THEN 1 WHEN '-1' THEN -1 ELSE CASE WHEN l.tipo_operacao = '1-Entradas' THEN 1
                       WHEN l.tipo_operacao LIKE '2-%' OR l.tipo_operacao LIKE '3-%' THEN -1 ELSE 0 END END END mov
        FROM financeiro_lancamentos_v2 l JOIN contas kk ON kk.id = l.conta_bancaria_id OR kk.id = l.conta_destino_id
       WHERE NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND l.status_transacao = 'realizado' AND NOT coalesce(l.sem_movimentacao_caixa, false)
         AND l.data_pagamento BETWEEN '2026-01-01' AND hoje),
  cand AS (SELECT s.conta_bancaria_id conta, s.ano_mes, coalesce(s.saldo_data, (to_date(s.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date) pos,
             coalesce(s.saldo_inicial, 0) si, s.saldo_final sf, kk.tipo, s.updated_at
        FROM financeiro_saldos_bancarios_v2 s JOIN contas kk ON kk.id = s.conta_bancaria_id WHERE s.saldo_final IS NOT NULL AND s.ano_mes BETWEEN '2026-04' AND '2026-10'),
  anc AS (SELECT DISTINCT ON (cc.conta) cc.conta, cc.pos, round(cc.sf, 2) valor FROM cand cc
       WHERE cc.tipo = 'permuta' OR round(cc.si + coalesce((SELECT sum(g.mov) FROM legs g WHERE g.conta = cc.conta AND to_char(g.dia, 'YYYY-MM') = cc.ano_mes AND g.dia <= cc.pos), 0), 2) = round(cc.sf, 2)
       ORDER BY cc.conta, cc.ano_mes DESC, cc.updated_at DESC),
  caixa AS (SELECT kk.cliente_id, sum(an.valor + coalesce((SELECT sum(g.mov) FROM legs g WHERE g.conta = an.conta AND g.dia > an.pos), 0)) saldo_hoje
        FROM anc an JOIN contas kk ON kk.id = an.conta GROUP BY 1),
  abertos AS (SELECT comb.st, l.cliente_id,
     sum(CASE WHEN l.tipo_operacao LIKE '1-%' THEN abs(l.valor) WHEN l.tipo_operacao LIKE '2-%' THEN -abs(l.valor)
              WHEN l.tipo_operacao LIKE '3-%' THEN (CASE WHEN l.conta_destino_id IN (SELECT conta FROM anc) THEN abs(l.valor) ELSE 0 END)
                                                - (CASE WHEN l.conta_bancaria_id IN (SELECT conta FROM anc) THEN abs(l.valor) ELSE 0 END) ELSE 0 END) liq
     FROM comb JOIN financeiro_lancamentos_v2 l ON l.status_transacao = ANY (comb.st)
     WHERE l.cliente_id IN (SELECT id FROM cl) AND NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND NOT coalesce(l.sem_movimentacao_caixa, false)
       AND l.data_vencimento IS NOT NULL AND l.data_vencimento <= '2026-10-31'
     GROUP BY 1, 2)
  SELECT string_agg(format('%s %s cpr %s vg %s', left(cl.id::text, 4), comb.st, round(caixa.saldo_hoje + coalesce(a.liq, 0), 2), v.saldo_final), '; ') INTO x
    FROM cl CROSS JOIN comb LEFT JOIN caixa ON caixa.cliente_id = cl.id LEFT JOIN abertos a ON a.st = comb.st AND a.cliente_id = cl.id,
         LATERAL (SELECT y.saldo_final FROM fn_vg_saldos(cl.id, '2026-10-01', '2026-10-31', NULL, hoje, comb.st, true) y) v
   WHERE round(caixa.saldo_hoje + coalesce(a.liq, 0), 2) IS DISTINCT FROM v.saldo_final;
  IF x IS NOT NULL THEN f := f || ('S9 VG <> CPR: ' || x); END IF;

  -- S6
  FOR x IN SELECT unnest(ARRAY['{realizado}', '{previsto,qualquer}', '{previsto,NULL}']) LOOP
    st := x::text[];
    BEGIN
      PERFORM fn_vg_tela(c_ag, de, ate, NULL, NULL, NULL, NULL, hoje, st, true);
      f := f || format('S6 %s aceito', st);
    EXCEPTION WHEN others THEN IF SQLSTATE <> '22023' THEN f := f || format('S6 %s deu %s', st, SQLSTATE); END IF; END;
  END LOOP;

  -- S8
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM fn_vg_tela(c_ag, de, ate, NULL, NULL, NULL, NULL, hoje, '{agendado}', false); f := f || 'S8 tela de outro cliente'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('S8 tela ' || SQLSTATE); END IF; END;
  BEGIN PERFORM * FROM fn_vg_saldos(c_ag, de, ate, NULL, hoje, '{agendado}', false); f := f || 'S8 saldos de outro cliente'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('S8 saldos ' || SQLSTATE); END IF; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN PERFORM * FROM fn_vg_serie(c_ag, de, ate, NULL, NULL, NULL, NULL, hoje, '{agendado}', false); f := f || 'S8 serie sem usuario'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('S8 sem usuario ' || SQLSTATE); END IF; END;
  SELECT string_agg(p, ', ') INTO x FROM unnest(ARRAY['public.fn_vg_status_validos(text[])',
      'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
      'public.fn_vg_serie_unidade(uuid,date,date,text,text,uuid[],uuid[],uuid,text,date,text[],boolean)',
      'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
      'public.fn_vg_tela(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)']) p
   WHERE has_function_privilege('anon', p, 'EXECUTE');
  IF x IS NOT NULL THEN f := f || ('S8 anon executa ' || x); END IF;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  IF cardinality(f) > 0 THEN RETURN 'FALHOU: ' || array_to_string(f, ' || '); END IF;
  RETURN 'OK';
end $f$;

-- MUTACOES: cada uma troca UM trecho do corpo de uma funcao (o trecho tem de existir), roda o vgst e desfaz (P0099). Viva = o vgst passou.
-- `p_so` (opcional): so' as mutacoes desses numeros — o canal do proto corta em ~60 s e o vgst leva ~8,5 s, entao la' roda em metades.
create function pg_temp.vgst_mut(p_so int[] DEFAULT NULL) returns text language plpgsql as $f$
declare
  m record; d text; r text; vivas text[] := '{}'; total int := 0;
begin
  FOR m IN SELECT * FROM (VALUES
    ('M1 serie ignora o status', 'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     'OR (v.status_transacao = ANY (v_status)', 'OR (v.status_transacao IN (''previsto'', ''programado'', ''agendado'')'),
    ('M2 saldos ignoram o chip Vencidos', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'AND (v_venc OR coalesce(l.data_vencimento, l.data_competencia) >= p_hoje)', 'AND (true OR coalesce(l.data_vencimento, l.data_competencia) >= p_hoje)'),
    ('M3 saldos marcam o vencido pelo mes', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'coalesce(l.data_vencimento, l.data_competencia) < p_hoje AS venc', 'coalesce(l.data_vencimento, l.data_competencia) < v_atual AS venc'),
    ('M4 tela nao repassa os chips aos saldos', 'public.fn_vg_tela(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     'p_contas, p_hoje, v_status, v_venc) x', 'p_contas, p_hoje) x'),
    ('M5 status invalido aceito', 'public.fn_vg_status_validos(text[])',
     'WHERE s IS NULL OR s NOT IN', 'WHERE false AND s NOT IN'),
    ('M6 saldos ignoram o status', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'OR (l.status_transacao = ANY (v_status)', 'OR (l.status_transacao IN (''previsto'', ''programado'', ''agendado'')'),
    ('M7 serie conta o vencido sem o chip', 'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     'AND (v_venc OR coalesce(v.data_vencimento, v.data_competencia) >= p_hoje)', 'AND (true OR coalesce(v.data_vencimento, v.data_competencia) >= p_hoje)'),
    ('M8 tela ecoa sempre vencidos ligado', 'public.fn_vg_tela(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)',
     '''incluir_vencidos'', v_venc,', '''incluir_vencidos'', true,'),
    ('M9 saldos deixam o cartao de fora', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
     'OR (NOT x.tr AND NOT EXISTS', 'OR (false AND NOT EXISTS')
  ) v(nome, fn, de, para) LOOP
    IF p_so IS NOT NULL AND NOT substr(m.nome, 2, position(' ' in m.nome) - 2)::int = ANY (p_so) THEN CONTINUE; END IF;
    total := total + 1;
    d := pg_get_functiondef(m.fn::regprocedure);
    IF position(m.de in d) = 0 THEN vivas := vivas || (m.nome || ' (trecho nao achado)'); CONTINUE; END IF;
    BEGIN
      EXECUTE replace(d, m.de, m.para);
      r := pg_temp.vgst();
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = r;
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      IF SQLERRM NOT LIKE 'FALHOU%' THEN vivas := vivas || m.nome; END IF;
    END;
  END LOOP;
  RETURN format('mutacoes mortas %s/%s', total - cardinality(vivas), total)
         || CASE WHEN cardinality(vivas) > 0 THEN ' — VIVAS: ' || array_to_string(vivas, ', ') ELSE '' END;
end $f$;

do $$ begin raise exception 'VGST % | %', pg_temp.vgst(), pg_temp.vgst_mut(); end $$;
