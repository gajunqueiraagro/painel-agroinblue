-- FIN-VISAO-GERAL-01 PR 1 — prova do banco da Visao Geral. Numa transacao que TERMINA EM RAISE (nada fica): 'VG01 OK ...' ou
-- 'VG01 FALHOU: ...'. pg_temp.vg01(clientes) e' o teste (nulo = todos; o canal MCP corta em ~60 s, entao ele roda em duas metades e as
-- mutacoes so' na Vera — V7 e V8 rodam sempre). Clientes e usuarios REAIS do proto
-- (os mesmos do seg_tenant_varredura_01b2: ux = gestor so' da NJ, adm = admin AgroinBlue).
--   V1 grupos: nenhuma linha ativa de 1-/2- sem grupo; cada linha = fn_plano_grupo_fluxo; Juros fora do Custeio; a 1155 em Outras saídas;
--      V1b o usuario logado (role authenticated) grava linha nova no plano e ela nasce com o grupo
--   V2 INVARIANTE saldo_final = saldo_inicial + entradas - saidas e saldo_inicial = saldo_final do mes anterior, 2025-01..2026-12, em
--      (a) todas as contas de cada cliente, (b) cada conta sozinha, (c) o par de contas de uma transferencia realizada de 2026 — e o par
--      soma os saldos das duas sozinhas (a transferencia entre elas nao entra nem sai)
--   V3 o realizado da raiz do fn_vg_serie = as entradas e saidas do fn_vg_saldos, mes a mes ate' set/2026 (todas as contas e o par)
--   V4 meses fechados: saldo_final de cada conta = o da Conciliacao (saldos_v2); toda diferenca tem causa (o mes nao fecha nos proprios
--      numeros ou ha' quebra na cadeia de saldos ate' a ancora) — nenhuma sem explicacao
--   V5 a CPR (saldoEmCaixa.ts replicado: ancora em 6 meses, sem filtro de sem_movimentacao_caixa) em 30/09/2026 = fn_vg_saldos set/2026
--   V6 o Dashboard Financeiro (realizado por data_pagamento, 1-/2-, pelas partes) em set/2026 por grupo = fn_vg_serie com todas as contas
--      do cliente; a unica diferenca admitida e' o realizado SEM conta
--   V7 classificacao dividida: o Selluz (R$ 9.583,00, programado out/2026) dividido 8.528,00 Investimentos + 1.055,00 Custeio cai nos dois
--   V8 seguranca: o gestor da NJ le^ a NJ e recebe 42501 no Agnaldo; sem usuario, 42501; anon e PUBLIC sem EXECUTE
set local statement_timeout = '600s';

create function pg_temp.vg01(p_clis uuid[]) returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_lanc constant uuid := '789a79e1-6de9-4ba0-a7f3-01171049ffea';
  c_inv constant uuid := 'f4fec107-569a-42a1-b413-bf133474c7fa'; c_man constant uuid := 'cdf2efa2-5735-499f-8a85-5ae0b0d0123a';
  clis uuid[]; k uuid; c record; t record; f text[] := '{}'; n int; x text; a numeric; b numeric; i0 numeric; i1 numeric; m0 numeric; m1 numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  clis := coalesce(p_clis, ARRAY(SELECT id FROM clientes ORDER BY id));

  -- V1
  SELECT count(*) INTO n FROM financeiro_plano_contas WHERE ativo AND tipo_operacao IN ('1-Entradas','2-Saídas') AND grupo_fluxo IS NULL;
  IF n > 0 THEN f := f || format('V1 %s linhas ativas sem grupo', n); END IF;
  SELECT count(*) INTO n FROM financeiro_plano_contas WHERE grupo_fluxo IS DISTINCT FROM fn_plano_grupo_fluxo(tipo_operacao, macro_custo, grupo_custo);
  IF n > 0 THEN f := f || format('V1 %s linhas fora da regra', n); END IF;
  IF (SELECT string_agg(DISTINCT grupo_fluxo, ',') FROM financeiro_plano_contas WHERE grupo_custo LIKE 'Juros de Financiamento%') <> 'Juros'
     OR (SELECT grupo_fluxo FROM financeiro_plano_contas WHERE ordem_exibicao = 1155) <> 'Outras saídas'
     OR fn_plano_grupo_fluxo('2-Saídas', 'Custeio Produção', 'Custo Fixo Pecuária') <> 'Custeio' THEN f := f || 'V1 mapa'::text; END IF;
  -- V1b o usuario logado grava linha nova no plano e ela nasce com o grupo (o gatilho chama a regra com o privilegio dele)
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO financeiro_plano_contas (tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
    VALUES ('2-Saídas', 'Tributos', 'Tributos e Impostos', 'Ensaio', 'Ensaio VG01', 'administrativo', true, 99996) RETURNING grupo_fluxo INTO x;
    RESET ROLE;
    IF x IS DISTINCT FROM 'Impostos e deduções' THEN f := f || ('V1b grupo ' || coalesce(x, 'nulo')); END IF;
  EXCEPTION WHEN others THEN RESET ROLE; f := f || ('V1b ' || SQLSTATE || ' ' || SQLERRM); END;

  FOREACH k IN ARRAY clis LOOP
    -- V2a + V3 (todas as contas)
    SELECT count(*) INTO n FROM (SELECT s.*, lag(s.saldo_final) OVER (ORDER BY s.ano_mes) ant
      FROM fn_vg_saldos(k, '2025-01-01', '2026-12-31', NULL, '2026-10-22') s) z
     WHERE z.saldo_final <> z.saldo_inicial + z.entradas - z.saidas OR (z.ant IS NOT NULL AND z.saldo_inicial <> z.ant);
    IF n > 0 THEN f := f || format('V2a %s: %s meses', left(k::text, 8), n); END IF;
    IF (SELECT cardinality(contas_sem_ancora) FROM fn_vg_saldos(k, '2026-01-01', '2026-01-31', NULL, '2026-10-22')) = 0 THEN
      SELECT count(*) INTO n FROM fn_vg_saldos(k, '2025-01-01', '2026-09-30', NULL, '2026-10-22') s
        LEFT JOIN fn_vg_serie(k, '2025-01-01', '2026-09-30') e ON e.nivel = 'raiz' AND e.lado = 'entrada' AND e.ano_mes = s.ano_mes
        LEFT JOIN fn_vg_serie(k, '2025-01-01', '2026-09-30') d ON d.nivel = 'raiz' AND d.lado = 'saida' AND d.ano_mes = s.ano_mes
       WHERE s.entradas <> coalesce(e.realizado, 0) OR s.saidas <> coalesce(d.realizado, 0);
      IF n > 0 THEN f := f || format('V3 %s: %s meses', left(k::text, 8), n); END IF;
    END IF;
    -- V2b (cada conta sozinha)
    FOR c IN SELECT id FROM financeiro_contas_bancarias WHERE cliente_id = k AND ativa AND lower(coalesce(tipo_conta,'')) IN ('cc','inv','permuta') LOOP
      SELECT count(*) INTO n FROM (SELECT s.*, lag(s.saldo_final) OVER (ORDER BY s.ano_mes) ant
        FROM fn_vg_saldos(k, '2026-01-01', '2026-12-31', ARRAY[c.id], '2026-10-22') s) z
       WHERE z.saldo_final <> z.saldo_inicial + z.entradas - z.saidas OR (z.ant IS NOT NULL AND z.saldo_inicial <> z.ant);
      IF n > 0 THEN f := f || format('V2b conta %s: %s meses', left(c.id::text, 8), n); END IF;
    END LOOP;
    -- V2c + V3 (o par de uma transferencia de 2026)
    SELECT l.conta_bancaria_id o, l.conta_destino_id d INTO t FROM financeiro_lancamentos_v2 l
      JOIN financeiro_contas_bancarias co ON co.id = l.conta_bancaria_id JOIN financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
     WHERE l.cliente_id = k AND l.tipo_operacao LIKE '3-%' AND NOT l.cancelado AND l.status_transacao = 'realizado'
       AND l.data_pagamento >= '2026-01-01' AND lower(co.tipo_conta) IN ('cc','inv') AND lower(cd.tipo_conta) IN ('cc','inv')
       AND cardinality((SELECT s.contas_sem_ancora FROM fn_vg_saldos(k, '2026-01-01', '2026-01-31', ARRAY[l.conta_bancaria_id, l.conta_destino_id], '2026-10-22') s)) = 0
     ORDER BY l.data_pagamento DESC LIMIT 1;
    IF t.o IS NOT NULL THEN
      SELECT count(*) INTO n FROM fn_vg_saldos(k, '2026-01-01', '2026-12-31', ARRAY[t.o, t.d], '2026-10-22') p
        JOIN fn_vg_saldos(k, '2026-01-01', '2026-12-31', ARRAY[t.o], '2026-10-22') so ON so.ano_mes = p.ano_mes
        JOIN fn_vg_saldos(k, '2026-01-01', '2026-12-31', ARRAY[t.d], '2026-10-22') sd ON sd.ano_mes = p.ano_mes
       WHERE p.saldo_final <> p.saldo_inicial + p.entradas - p.saidas OR p.saldo_final <> so.saldo_final + sd.saldo_final;
      IF n > 0 THEN f := f || format('V2c %s: %s meses', left(k::text, 8), n); END IF;
      SELECT count(*) INTO n FROM fn_vg_saldos(k, '2026-01-01', '2026-09-30', ARRAY[t.o, t.d], '2026-10-22') s
        LEFT JOIN fn_vg_serie(k, '2026-01-01', '2026-09-30', ARRAY[t.o, t.d]) e ON e.nivel = 'raiz' AND e.lado = 'entrada' AND e.ano_mes = s.ano_mes
        LEFT JOIN fn_vg_serie(k, '2026-01-01', '2026-09-30', ARRAY[t.o, t.d]) d ON d.nivel = 'raiz' AND d.lado = 'saida' AND d.ano_mes = s.ano_mes
       WHERE s.entradas <> coalesce(e.realizado, 0) OR s.saidas <> coalesce(d.realizado, 0);
      IF n > 0 THEN f := f || format('V3 par %s: %s meses', left(k::text, 8), n); END IF;
    END IF;
  END LOOP;

  -- V4 meses fechados x Conciliacao, com a causa de cada diferenca
  WITH mv AS (
    SELECT c2.id conta, to_char(l.data_pagamento,'YYYY-MM') am,
           sum(CASE WHEN l.conta_destino_id = c2.id AND l.conta_bancaria_id IS DISTINCT FROM c2.id THEN abs(l.valor)
                    ELSE abs(l.valor) * CASE l.sinal::text WHEN '1' THEN 1 WHEN '-1' THEN -1 ELSE CASE WHEN l.tipo_operacao = '1-Entradas' THEN 1 ELSE -1 END END END) m
      FROM financeiro_lancamentos_v2 l JOIN financeiro_contas_bancarias c2 ON c2.id = l.conta_bancaria_id OR c2.id = l.conta_destino_id
     WHERE l.cliente_id = ANY (clis) AND NOT l.cancelado AND l.cenario = 'realizado' AND l.status_transacao = 'realizado'
       AND NOT coalesce(l.sem_movimentacao_caixa, false) AND l.data_pagamento IS NOT NULL GROUP BY 1, 2
  ), sv AS (
    SELECT DISTINCT ON (s.conta_bancaria_id, s.ano_mes) s.cliente_id, s.conta_bancaria_id conta, s.ano_mes, s.saldo_inicial si, s.saldo_final sf, s.status_mes
      FROM financeiro_saldos_bancarios_v2 s JOIN financeiro_contas_bancarias c2 ON c2.id = s.conta_bancaria_id
     WHERE s.cliente_id = ANY (clis) AND s.saldo_final IS NOT NULL AND lower(coalesce(c2.tipo_conta,'')) IN ('cc','inv','permuta')
     ORDER BY s.conta_bancaria_id, s.ano_mes, s.updated_at DESC
  ), sv2 AS (
    SELECT sv.*, round(coalesce(sv.si,0) + coalesce(mv.m,0), 2) = round(sv.sf, 2) fecha,
           lag(sv.sf) OVER (PARTITION BY sv.conta ORDER BY sv.ano_mes) sf_ant, lag(sv.ano_mes) OVER (PARTITION BY sv.conta ORDER BY sv.ano_mes) am_ant
      FROM sv LEFT JOIN mv ON mv.conta = sv.conta AND mv.am = sv.ano_mes
  ), alvo AS (
    SELECT s.*, v.saldo_final vg FROM sv2 s, LATERAL (SELECT * FROM fn_vg_saldos(s.cliente_id, to_date(s.ano_mes||'-01','YYYY-MM-DD'),
             to_date(s.ano_mes||'-01','YYYY-MM-DD'), ARRAY[s.conta], '2026-10-22')) v WHERE s.status_mes = 'fechado'
  )
  SELECT count(*), count(*) FILTER (WHERE round(a2.vg,2) = round(a2.sf,2)),
         count(*) FILTER (WHERE round(a2.vg,2) <> round(a2.sf,2) AND a2.fecha AND NOT EXISTS (
           SELECT 1 FROM sv2 x WHERE x.conta = a2.conta AND x.ano_mes > a2.ano_mes
              AND x.ano_mes <= (SELECT max(y.ano_mes) FROM sv2 y WHERE y.conta = a2.conta AND y.fecha)
              AND (NOT x.fecha OR x.sf_ant IS NULL OR round(coalesce(x.si,0),2) <> round(x.sf_ant,2)
                   OR x.am_ant <> to_char(to_date(x.ano_mes||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM'))))
    INTO n, a, b FROM alvo a2;
  IF b > 0 OR a = 0 THEN f := f || format('V4 fechados=%s iguais=%s sem_explicacao=%s', n, a, b); END IF;
  x := format('V4 %s/%s iguais', a, n);

  -- V5 CPR em 30/09/2026
  WITH contas AS (SELECT c2.id, c2.cliente_id, lower(coalesce(c2.tipo_conta,'')) tipo FROM financeiro_contas_bancarias c2
                   WHERE c2.cliente_id = ANY (clis) AND c2.ativa AND lower(coalesce(c2.tipo_conta,'')) IN ('cc','inv','permuta')),
  legs AS (
    SELECT kk.id conta, l.data_pagamento dia,
           CASE WHEN l.conta_destino_id = kk.id AND l.conta_bancaria_id IS DISTINCT FROM kk.id THEN abs(l.valor)
                ELSE abs(l.valor) * CASE l.sinal::text WHEN '1' THEN 1 WHEN '-1' THEN -1 ELSE CASE WHEN l.tipo_operacao = '1-Entradas' THEN 1
                     WHEN l.tipo_operacao LIKE '2-%' OR l.tipo_operacao LIKE '3-%' THEN -1 ELSE 0 END END END mov
      FROM financeiro_lancamentos_v2 l JOIN contas kk ON kk.id = l.conta_bancaria_id OR kk.id = l.conta_destino_id
     WHERE NOT l.cancelado AND l.cenario = 'realizado' AND l.status_transacao = 'realizado' AND l.data_pagamento BETWEEN '2026-03-01' AND '2026-09-30'
  ), cand AS (
    SELECT s.conta_bancaria_id conta, s.ano_mes, coalesce(s.saldo_data, (to_date(s.ano_mes||'-01','YYYY-MM-DD') + interval '1 month - 1 day')::date) pos,
           coalesce(s.saldo_inicial, 0) si, s.saldo_final sf, kk.tipo, s.updated_at
      FROM financeiro_saldos_bancarios_v2 s JOIN contas kk ON kk.id = s.conta_bancaria_id
     WHERE s.saldo_final IS NOT NULL AND s.ano_mes BETWEEN '2026-03' AND '2026-09'
  ), anc AS (
    SELECT DISTINCT ON (cc.conta) cc.conta, cc.pos, round(cc.sf, 2) valor FROM cand cc
     WHERE cc.tipo = 'permuta' OR round(cc.si + coalesce((SELECT sum(g.mov) FROM legs g WHERE g.conta = cc.conta
             AND to_char(g.dia,'YYYY-MM') = cc.ano_mes AND g.dia <= cc.pos), 0), 2) = round(cc.sf, 2)
     ORDER BY cc.conta, cc.ano_mes DESC, cc.updated_at DESC
  ), cpr AS (
    SELECT kk.cliente_id, round(sum(an.valor + coalesce((SELECT sum(g.mov) FROM legs g WHERE g.conta = an.conta AND g.dia > an.pos), 0)), 2) total
      FROM anc an JOIN contas kk ON kk.id = an.conta GROUP BY 1
  )
  SELECT count(*) FILTER (WHERE coalesce(cpr.total, 0) <> v.saldo_final) INTO n
    FROM unnest(clis) cl(id) LEFT JOIN cpr ON cpr.cliente_id = cl.id,
         LATERAL (SELECT * FROM fn_vg_saldos(cl.id, '2026-09-01', '2026-09-30', NULL, '2026-10-01')) v;
  IF n > 0 THEN f := f || format('V5 %s clientes diferem da CPR', n); END IF;

  -- V6 Dashboard Financeiro em set/2026 por grupo
  WITH dash AS (
    SELECT vv.cliente_id, CASE WHEN vv.tipo_operacao LIKE '1%' THEN 'entrada' ELSE 'saida' END lado,
           CASE WHEN vv.plano_conta_id IS NULL THEN 'Sem classificação' ELSE fn_plano_grupo_fluxo(vv.tipo_operacao, vv.macro_custo, vv.grupo_custo) END grupo,
           sum(abs(vv.valor)) tot, sum(abs(vv.valor)) FILTER (WHERE vv.conta_bancaria_id IS NULL AND vv.conta_destino_id IS NULL) sem_conta
      FROM vw_fin_classificacao_por_parte vv
     WHERE vv.cliente_id = ANY (clis) AND NOT vv.cancelado AND vv.cenario = 'realizado' AND vv.status_transacao = 'realizado'
       AND NOT coalesce(vv.sem_movimentacao_caixa, false) AND vv.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30'
       AND (vv.tipo_operacao LIKE '1%' OR vv.tipo_operacao LIKE '2%') GROUP BY 1, 2, 3
  ), ser AS (
    SELECT cl.id cliente_id, s.lado, s.grupo, s.realizado FROM unnest(clis) cl(id),
           LATERAL fn_vg_serie(cl.id, '2026-09-01', '2026-09-30', ARRAY(SELECT c2.id FROM financeiro_contas_bancarias c2 WHERE c2.cliente_id = cl.id)) s
     WHERE s.nivel = 'grupo'
  )
  SELECT count(*) FILTER (WHERE round(coalesce(d.tot,0) - coalesce(d.sem_conta,0), 2) <> round(coalesce(s.realizado,0), 2)) INTO n
    FROM dash d FULL JOIN ser s ON s.cliente_id = d.cliente_id AND s.lado = d.lado AND s.grupo = d.grupo;
  IF n > 0 THEN f := f || format('V6 %s linhas de grupo diferem do Dashboard', n); END IF;

  -- V7 classificacao dividida (Selluz)
  SELECT previsto INTO i0 FROM fn_vg_serie(c_nj, '2026-10-01', '2026-10-31') WHERE nivel = 'grupo' AND lado = 'saida' AND grupo = 'Investimentos';
  SELECT previsto INTO m0 FROM fn_vg_serie(c_nj, '2026-10-01', '2026-10-31') WHERE nivel = 'grupo' AND lado = 'saida' AND grupo = 'Custeio';
  PERFORM fn_lancamento_dividir(c_lanc, jsonb_build_array(jsonb_build_object('plano_conta_id', c_inv, 'valor', 8528),
            jsonb_build_object('plano_conta_id', c_man, 'valor', 1055)), 'VG01 ensaio Selluz', false);
  SELECT previsto INTO i1 FROM fn_vg_serie(c_nj, '2026-10-01', '2026-10-31') WHERE nivel = 'grupo' AND lado = 'saida' AND grupo = 'Investimentos';
  SELECT previsto INTO m1 FROM fn_vg_serie(c_nj, '2026-10-01', '2026-10-31') WHERE nivel = 'grupo' AND lado = 'saida' AND grupo = 'Custeio';
  IF i0 - i1 <> 1055 OR m1 - m0 <> 1055 THEN f := f || format('V7 investimentos %s->%s custeio %s->%s', i0, i1, m0, m1); END IF;

  -- V8 seguranca
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM count(*) FROM fn_vg_serie(c_nj, '2026-09-01', '2026-09-30'); EXCEPTION WHEN others THEN f := f || ('V8 membro nao le a NJ: ' || SQLERRM); END;
  BEGIN PERFORM count(*) FROM fn_vg_saldos(c_ag, '2026-09-01', '2026-09-30'); f := f || 'V8 saldos atravessou'::text; EXCEPTION WHEN others THEN
    IF SQLSTATE <> '42501' THEN f := f || ('V8 saldos ' || SQLSTATE); END IF; END;
  BEGIN PERFORM count(*) FROM fn_vg_serie(c_ag, '2026-09-01', '2026-09-30'); f := f || 'V8 serie atravessou'::text; EXCEPTION WHEN others THEN
    IF SQLSTATE <> '42501' THEN f := f || ('V8 serie ' || SQLSTATE); END IF; END;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN PERFORM count(*) FROM fn_vg_serie(c_nj, '2026-09-01', '2026-09-30'); f := f || 'V8 sem usuario leu'::text; EXCEPTION WHEN others THEN NULL; END;
  IF has_function_privilege('anon', 'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_vg_saldos(uuid,date,date,uuid[],date)', 'EXECUTE') THEN f := f || 'V8 anon executa'::text; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  IF cardinality(f) > 0 THEN RETURN 'FALHOU: ' || array_to_string(f, ' || '); END IF;
  RETURN 'OK (' || x || ')';
end $f$;

do $$ begin raise exception 'VG01 %', pg_temp.vg01(null); end $$;
