-- FIN-VISAO-GERAL-01 PR 2 — prova do banco: meta pelo plano_conta_id, @ produzida, denominadores, valor por unidade e previsto vencido.
-- Numa transacao que TERMINA EM RAISE (nada fica): 'VG02 OK ...' ou 'VG02 FALHOU: ...'. pg_temp.vg02() e' o teste (NJ, rapido);
-- pg_temp.vg02_mut() aplica cada MUTACAO num bloco que se desfaz e exige que o vg02 falhe ('mutacoes mortas N/N').
-- Clientes e usuarios REAIS do proto: ux = gestor so' da NJ, adm = admin AgroinBlue. p_hoje fixo em 22/10/2026.
--   W1 meta: toda linha com chave e os textos = os do plano; texto fora do plano recusado (23503); fn_vg_meta raiz saida 2026 = soma
--      direta; ano sem meta nao devolve linha (nunca zero inventado)
--   W2 @: o fn_dre_pecuaria le a fn_pec_arrobas_produzidas; @ de cada fazenda x mes = round(kg / 30, 2) direto do cache
--   W3 denominadores (NJ, jan..out/2026): cab e UA de set/2026 pela conta direta no cache; area de set = snapshot; out sem snapshot = nulo;
--      area do periodo = media dos meses com area; @ do periodo = soma
--   W4 unidade: pecuaria Custeio set/2026 em R$/cab no mes = realizado / cab media (a mao); media = acumulado / 9 meses; R$/cab em no'
--      administrativo = nulo e unidade_valida falso; no' de agricultura aceita rs_ha_plant e recusa rs_cab; unidade invalida = 22023
--   W5 vencido: nenhum previsto antes de out/2026; previsto_vencido de out = soma direta dos vencidos (P79: vencimento antes de hoje); nos saldos, vencido so' em out,
--      dentro das saidas e o invariante fecha
--   W6 seguranca: o gestor da NJ recebe 42501 no Agnaldo nas 4 funcoes novas; sem usuario, 42501; anon sem EXECUTE nelas
set local statement_timeout = '600s';

create function pg_temp.vg02() returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  hoje constant date := '2026-10-22';
  f text[] := '{}'; n int; a numeric; b numeric; c numeric; r record; x text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  -- W1
  SELECT count(*) INTO n FROM planejamento_financeiro pf JOIN financeiro_plano_contas p ON p.id = pf.plano_conta_id
   WHERE (pf.macro_custo, pf.grupo_custo, pf.centro_custo, pf.subcentro) IS DISTINCT FROM (p.macro_custo, p.grupo_custo, p.centro_custo, p.subcentro);
  IF n > 0 THEN f := f || format('W1 %s metas com texto diferente do plano', n); END IF;
  BEGIN
    UPDATE planejamento_financeiro SET subcentro = 'VG02 conta que nao existe'
     WHERE id = (SELECT id FROM planejamento_financeiro WHERE cliente_id = c_nj AND cenario = 'meta' ORDER BY id LIMIT 1);
    f := f || 'W1 texto fora do plano gravou'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '23503' THEN f := f || ('W1 recusa ' || SQLSTATE); END IF; END;
  SELECT meta INTO a FROM fn_vg_meta(c_nj, '2026-01-01', '2026-12-31') WHERE nivel = 'raiz' AND lado = 'saida' AND ano_mes = '2026-09';
  SELECT round(sum(abs(pf.valor_planejado)), 2) INTO b FROM planejamento_financeiro pf JOIN financeiro_plano_contas p ON p.id = pf.plano_conta_id
   WHERE pf.cliente_id = c_nj AND pf.cenario = 'meta' AND pf.ano = 2026 AND pf.mes = 9 AND p.tipo_operacao = '2-Saídas';
  IF a IS DISTINCT FROM b THEN f := f || format('W1 meta set/26 %s <> %s', a, b); END IF;
  SELECT count(*) INTO n FROM fn_vg_meta(c_nj, '2024-01-01', '2024-12-31');
  IF n > 0 THEN f := f || format('W1 %s linhas de meta em 2024', n); END IF;

  -- W2
  IF position('fn_pec_arrobas_produzidas' in pg_get_functiondef('public.fn_dre_pecuaria(uuid,text,text,text)'::regprocedure)) = 0 THEN
    f := f || 'W2 DRE nao le a funcao'::text; END IF;
  SELECT count(*) INTO n FROM fn_pec_arrobas_produzidas(c_nj, '2026-01', '2026-09') x
    JOIN (SELECT fazenda_id, ano_mes, round(sum(producao_biologica) / 30.0, 2) ar FROM zoot_mensal_cache
           WHERE cliente_id = c_nj AND cenario = 'realizado' AND ano_mes BETWEEN '2026-01' AND '2026-09' GROUP BY 1, 2) z
      ON z.fazenda_id = x.fazenda_id AND z.ano_mes = x.ano_mes
   WHERE x.arrobas <> z.ar;
  IF n > 0 THEN f := f || format('W2 %s fazenda-mes com @ diferente', n); END IF;

  -- W3
  SELECT * INTO r FROM fn_vg_denominadores(c_nj, '2026-01-01', '2026-10-31') WHERE ano_mes = '2026-09';
  SELECT round(sum(si + sf) / 2.0, 2), sum(CASE WHEN sf > 0 THEN round((si + sf) / 2.0 * round(pf / sf, 2) / 450.0, 2) END) INTO a, b
    FROM (SELECT fazenda_id, sum(saldo_inicial) si, sum(saldo_final) sf, sum(peso_total_final) pf FROM zoot_mensal_cache
           WHERE cliente_id = c_nj AND cenario = 'realizado' AND ano_mes = '2026-09' GROUP BY 1) z;
  SELECT sum(area_produtiva_ha) INTO c FROM fechamento_area_snapshot WHERE cliente_id = c_nj AND ano_mes = '2026-09-01';
  IF r.cab_media IS DISTINCT FROM a OR r.ua_media IS DISTINCT FROM b OR r.ha_produtiva IS DISTINCT FROM c THEN
    f := f || format('W3 set/26 cab %s/%s ua %s/%s ha %s/%s', r.cab_media, a, r.ua_media, b, r.ha_produtiva, c); END IF;
  IF (SELECT ha_produtiva FROM fn_vg_denominadores(c_nj, '2026-01-01', '2026-10-31') WHERE ano_mes = '2026-10') IS NOT NULL THEN
    f := f || 'W3 out/26 sem snapshot tem area'::text; END IF;
  SELECT ha_produtiva, arrobas INTO a, b FROM fn_vg_denominadores(c_nj, '2026-01-01', '2026-10-31') WHERE ano_mes IS NULL;
  SELECT round(avg(h), 2) INTO c FROM (SELECT sum(area_produtiva_ha) h FROM fechamento_area_snapshot
     WHERE cliente_id = c_nj AND ano_mes BETWEEN '2026-01-01' AND '2026-10-01' GROUP BY ano_mes HAVING sum(area_produtiva_ha) > 0) s;
  IF a IS DISTINCT FROM c THEN f := f || format('W3 area do periodo %s <> %s', a, c); END IF;
  SELECT round(sum(producao_biologica) / 30.0, 2) INTO c FROM zoot_mensal_cache
   WHERE cliente_id = c_nj AND cenario = 'realizado' AND ano_mes BETWEEN '2026-01' AND '2026-10';
  IF b IS DISTINCT FROM c THEN f := f || format('W3 @ do periodo %s <> %s', b, c); END IF;

  -- W4
  SELECT u.realizado, u.denominador, u.valor_realizado INTO r FROM fn_vg_serie_unidade(c_nj, '2026-01-01', '2026-09-30', 'mes', 'rs_cab', p_hoje => hoje) u
   WHERE u.nivel = 'atividade' AND u.lado = 'saida' AND u.grupo = 'Custeio' AND u.atividade = 'pecuaria' AND u.ano_mes = '2026-09';
  SELECT sum(saldo_inicial + saldo_final) / 2.0 INTO a FROM zoot_mensal_cache WHERE cliente_id = c_nj AND cenario = 'realizado' AND ano_mes = '2026-09';
  IF r.valor_realizado IS NULL OR r.valor_realizado <> round(r.realizado / a, 2) THEN
    f := f || format('W4 R$/cab set/26 %s <> %s / %s', r.valor_realizado, r.realizado, a); END IF;
  SELECT u.valor_realizado INTO a FROM fn_vg_serie_unidade(c_nj, '2026-01-01', '2026-09-30', 'acumulado', 'rs_cab', p_hoje => hoje) u
   WHERE u.nivel = 'atividade' AND u.lado = 'saida' AND u.grupo = 'Custeio' AND u.atividade = 'pecuaria' AND u.ano_mes = '2026-09';
  SELECT u.valor_realizado INTO b FROM fn_vg_serie_unidade(c_nj, '2026-01-01', '2026-09-30', 'media', 'rs_cab', p_hoje => hoje) u
   WHERE u.nivel = 'atividade' AND u.lado = 'saida' AND u.grupo = 'Custeio' AND u.atividade = 'pecuaria' AND u.ano_mes = '2026-09';
  IF a IS NULL OR abs(b - a / 9) > 0.01 THEN f := f || format('W4 media %s <> acumulado %s / 9', b, a); END IF;
  SELECT count(*) INTO n FROM fn_vg_serie_unidade(c_nj, '2026-09-01', '2026-09-30', 'mes', 'rs_cab', p_hoje => hoje) u
   WHERE u.atividade = 'administrativo' AND (u.valor_realizado IS NOT NULL OR u.unidade_valida);
  IF n > 0 THEN f := f || format('W4 %s nos administrativos com R$/cab', n); END IF;
  SELECT count(*) INTO n FROM fn_vg_serie_unidade(c_nj, '2026-09-01', '2026-09-30', 'mes', 'rs', p_hoje => hoje) u
   WHERE u.atividade = 'agricultura' AND NOT ('rs_ha_plant' = ANY (u.unidades_validas) AND NOT 'rs_cab' = ANY (u.unidades_validas));
  IF n > 0 THEN f := f || format('W4 %s nos de agricultura com lista errada', n); END IF;
  BEGIN PERFORM count(*) FROM fn_vg_serie_unidade(c_nj, '2026-09-01', '2026-09-30', 'mes', 'rs_hectare'); f := f || 'W4 unidade invalida passou'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '22023' THEN f := f || ('W4 unidade ' || SQLSTATE); END IF; END;

  -- W5
  SELECT count(*) INTO n FROM fn_vg_serie(c_nj, '2026-01-01', '2026-12-31', p_hoje => hoje) WHERE ano_mes < '2026-10' AND (previsto <> 0 OR previsto_vencido <> 0);
  IF n > 0 THEN f := f || format('W5 %s nos com previsto antes do mes de hoje', n); END IF;
  SELECT sum(previsto_vencido) INTO a FROM fn_vg_serie(c_nj, '2026-01-01', '2026-12-31', p_hoje => hoje) WHERE nivel = 'raiz' AND ano_mes = '2026-10';
  SELECT round(sum(abs(l.valor)), 2) INTO b FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.cenario IS DISTINCT FROM 'meta' AND NOT coalesce(l.sem_movimentacao_caixa, false)
     AND l.status_transacao IN ('previsto', 'programado', 'agendado') AND coalesce(l.data_vencimento, l.data_competencia) < hoje  -- P79: vencido = antes de HOJE (a regra da CPR)
     -- as contas do caixa (a regra das funcoes) ou sem conta; o vencido em cartao/conta inativa nao entra (medido: R$ 5.749,11 no NJ)
     AND ((l.conta_bancaria_id IS NULL AND l.conta_destino_id IS NULL) OR EXISTS (SELECT 1 FROM financeiro_contas_bancarias k
          WHERE k.cliente_id = c_nj AND k.ativa AND lower(coalesce(k.tipo_conta, '')) IN ('cc', 'inv', 'permuta') AND k.id IN (l.conta_bancaria_id, l.conta_destino_id)));
  IF a IS DISTINCT FROM b THEN f := f || format('W5 serie vencido out %s <> %s', a, b); END IF;
  SELECT count(*) FILTER (WHERE s.ano_mes <> '2026-10' AND (s.entradas_vencidas <> 0 OR s.saidas_vencidas <> 0))
       + count(*) FILTER (WHERE s.entradas_vencidas > s.entradas OR s.saidas_vencidas > s.saidas)
       + count(*) FILTER (WHERE s.saldo_final <> s.saldo_inicial + s.entradas - s.saidas),
         sum(s.entradas_vencidas + s.saidas_vencidas) INTO n, a
    FROM fn_vg_saldos(c_nj, '2026-01-01', '2026-12-31', NULL, hoje) s;
  IF n > 0 OR a IS DISTINCT FROM b THEN f := f || format('W5 saldos %s quebras, vencido %s <> %s', n, a, b); END IF;
  SELECT sum(entradas_vencidas + saidas_vencidas) INTO a FROM fn_vg_saldos(c_nj, '2026-01-01', '2026-09-30', NULL, hoje);
  IF a <> 0 THEN f := f || 'W5 vencido entrou com o mes de hoje fora do periodo'::text; END IF;

  -- W6
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM count(*) FROM fn_vg_meta(c_ag, '2026-01-01', '2026-12-31'); f := f || 'W6 meta atravessou'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('W6 meta ' || SQLSTATE); END IF; END;
  BEGIN PERFORM count(*) FROM fn_vg_denominadores(c_ag, '2026-01-01', '2026-12-31'); f := f || 'W6 denominadores atravessou'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('W6 denominadores ' || SQLSTATE); END IF; END;
  BEGIN PERFORM count(*) FROM fn_vg_serie_unidade(c_ag, '2026-09-01', '2026-09-30'); f := f || 'W6 unidade atravessou'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('W6 unidade ' || SQLSTATE); END IF; END;
  BEGIN PERFORM count(*) FROM fn_pec_arrobas_produzidas(c_ag, '2026-01', '2026-12'); f := f || 'W6 arrobas atravessou'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('W6 arrobas ' || SQLSTATE); END IF; END;
  BEGIN PERFORM count(*) FROM fn_vg_denominadores(c_nj, '2026-09-01', '2026-09-30'); EXCEPTION WHEN others THEN f := f || ('W6 membro nao le a NJ: ' || SQLERRM); END;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN PERFORM count(*) FROM fn_vg_meta(c_nj, '2026-01-01', '2026-12-31'); f := f || 'W6 sem usuario leu'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('W6 sem usuario ' || SQLSTATE); END IF; END;
  SELECT string_agg(p, ', ') INTO x FROM unnest(ARRAY['public.fn_vg_meta(uuid,date,date,uuid[],text)',
      'public.fn_vg_denominadores(uuid,date,date,uuid[],uuid)', 'public.fn_pec_arrobas_produzidas(uuid,text,text)',
      'public.fn_vg_serie_unidade(uuid,date,date,text,text,uuid[],uuid[],uuid,text,date,text[],boolean)',
      'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)',
      'public._fn_planejamento_plano_conta()']) p
   WHERE has_function_privilege('anon', p, 'EXECUTE');
  IF x IS NOT NULL THEN f := f || ('W6 anon executa ' || x); END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  IF cardinality(f) > 0 THEN RETURN 'FALHOU: ' || array_to_string(f, ' || '); END IF;
  RETURN 'OK';
end $f$;

-- MUTACOES: cada uma troca UM trecho do corpo de uma funcao (o trecho tem de existir), roda o vg02 e desfaz (P0099). Viva = o vg02 passou.
create function pg_temp.vg02_mut() returns text language plpgsql as $f$
declare
  m record; d text; r text; vivas text[] := '{}'; total int := 0;
begin
  FOR m IN SELECT * FROM (VALUES
    ('M1 gatilho aceita texto fora do plano', 'public._fn_planejamento_plano_conta()', 'IF cardinality(v_ids) = 0 THEN', 'IF cardinality(v_ids) = -1 THEN'),
    ('M2 @ por 15', 'public.fn_pec_arrobas_produzidas(uuid,text,text)', 'round(sum(z.producao_biologica) / 30.0, 2)', 'round(sum(z.producao_biologica) / 15.0, 2)'),
    ('M3 area sem snapshot vira zero', 'public.fn_vg_denominadores(uuid,date,date,uuid[],uuid)', 'nullif(am_.hp, 0) AS hp', 'coalesce(am_.hp, 0) AS hp'),
    ('M4 UA por 400', 'public.fn_vg_denominadores(uuid,date,date,uuid[],uuid)', 'round(zf.pf / zf.sf, 2) / 450.0', 'round(zf.pf / zf.sf, 2) / 400.0'),
    ('M5 R$/cab valido em todo no', 'public.fn_vg_serie_unidade(uuid,date,date,text,text,uuid[],uuid[],uuid,text,date,text[],boolean)', 'ELSE ARRAY[''rs'', ''rs_ha_prod''] END', 'ELSE ARRAY[''rs'', ''rs_ha_prod'', ''rs_cab''] END'),
    ('M6 media sem dividir pelos meses', 'public.fn_vg_serie_unidade(uuid,date,date,text,text,uuid[],uuid[],uuid,text,date,text[],boolean)', 'THEN s.k::numeric', 'THEN 1::numeric'),
    ('M7 serie deixa o vencido no passado', 'public.fn_vg_serie(uuid,date,date,uuid[],uuid[],uuid,text,date,text[],boolean)', 'ELSE greatest(coalesce(v.data_vencimento, v.data_competencia), v_atual) END AS dia', 'ELSE coalesce(v.data_vencimento, v.data_competencia) END AS dia'),
    ('M8 saldos sem o vencido', 'public.fn_vg_saldos(uuid,date,date,uuid[],date,text[],boolean)', 'greatest(coalesce(l.data_vencimento, l.data_competencia), v_atual) BETWEEN v_ini AND v_fim_dia', 'coalesce(l.data_vencimento, l.data_competencia) BETWEEN greatest(v_atual, v_ini) AND v_fim_dia')
  ) v(nome, fn, de, para) LOOP
    total := total + 1;
    d := pg_get_functiondef(m.fn::regprocedure);
    IF position(m.de in d) = 0 THEN vivas := vivas || (m.nome || ' (trecho nao achado)'); CONTINUE; END IF;
    BEGIN
      EXECUTE replace(d, m.de, m.para);
      r := pg_temp.vg02();
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = r;
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      IF SQLERRM NOT LIKE 'FALHOU%' THEN vivas := vivas || m.nome; END IF;
    END;
  END LOOP;
  RETURN format('mutacoes mortas %s/%s', total - cardinality(vivas), total)
         || CASE WHEN cardinality(vivas) > 0 THEN ' — VIVAS: ' || array_to_string(vivas, ', ') ELSE '' END;
end $f$;

do $$ begin raise exception 'VG02 % | %', pg_temp.vg02(), pg_temp.vg02_mut(); end $$;
