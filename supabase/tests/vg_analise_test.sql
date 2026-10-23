-- FIN-VISAO-GERAL-01 PR 4 — prova do banco do MODAL DE ANALISE (111942 fn_vg_analise). A tela nunca soma: tudo vem daqui.
-- Numa transacao que TERMINA EM RAISE (nada fica): 'VGAN OK' ou 'VGAN FALHOU: ...'. pg_temp.vgan() e' o teste; pg_temp.vgan_mut(p_so)
-- aplica cada MUTACAO num bloco que se desfaz e exige que o vgan falhe. Clientes REAIS do proto (NJ, Agnaldo), admin AgroinBlue,
-- p_hoje 23/10/2026, mes escolhido set/2026, periodo jan–dez/2026.
--   A1 o MESMO numero da fn_vg_serie_unidade (a conta da unidade e do criterio): nas tres tabelas (grupos da raiz; atividades do
--      Custeio; centros do Custeio › Pecuaria), criterios mes/media/acumulado, unidades R$ e R$/cab — todo no' que a serie_unidade
--      tem no mes escolhido (tolerancia 0,01: ela arredonda realizado e previsto separados)
--   A2 o ENSAIO do Gabriel: NJ set/2026 Custeio › Pecuaria R$/cab/mes com as contas do caixa (cc/inv/permuta) = R$ 106,56 e media
--      jan–set = R$ 103,00; no conjunto padrao (com os cartoes, P82) R$ 109,20 / 105,18; os KPIs do grafico = a linha do foco; a curva
--      da media do grafico em out/26 (com o previsto) = a media da fn_vg_serie_unidade
--   A3 = a Visao Geral: na aba da raiz, criterio mes, R$, cada grupo e o total = a celula de set/2026 da grade da fn_vg_tela, e os
--      grupos na mesma ordem da grade
--   A4 META: no' sem meta → meta, dif e % nulos (nunca zero); com meta → dif = valor − meta e % = dif / meta (do banco)
--   A5 UNIDADE so' onde vale: foco Pecuaria → cab/UA/@/ha valem; na raiz R$/cab e' nulo; as fatias do donut somam 100% (± 0,5)
--   A6 seguranca: 42501 no outro cliente e sem usuario; caminho fora da aba 22023; anon sem EXECUTE
set local statement_timeout = '600s';

create function pg_temp.vgan() returns text language plpgsql as $f$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  hoje constant date := '2026-10-23';
  f text[] := '{}'; crit text; uni text; cfg record; a jsonb; x jsonb; ref numeric; n_cmp int := 0; cx uuid[]; tela jsonb; k int;
  n_meta int := 0; n_sem int := 0; c uuid; su jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  -- A1
  FOREACH crit IN ARRAY ARRAY['mes', 'media', 'acumulado'] LOOP
    FOREACH uni IN ARRAY ARRAY['rs', 'rs_cab'] LOOP
      SELECT jsonb_object_agg(((ARRAY[s.grupo, s.atividade, s.centro, s.subcentro])[1:CASE s.nivel WHEN 'raiz' THEN 0 WHEN 'grupo' THEN 1
                              WHEN 'atividade' THEN 2 WHEN 'centro' THEN 3 ELSE 4 END])::text, s.valor_realizado + s.valor_previsto) INTO su
        FROM fn_vg_serie_unidade(c_nj, '2026-01-01', '2026-12-31', crit, uni, NULL, NULL, NULL, NULL, hoje) s
       WHERE s.lado = 'saida' AND s.ano_mes = '2026-09';
      FOR cfg IN SELECT * FROM (VALUES (NULL::text, '{}'::text[]), ('Custeio', ARRAY['Custeio']), ('Custeio', ARRAY['Custeio', 'pecuaria'])) v(aba, foco) LOOP
        a := fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', cfg.aba, cfg.foco, NULL, crit, uni, NULL, NULL, NULL, hoje);
        FOR x IN SELECT * FROM jsonb_array_elements((a #> '{foco,linhas}') || jsonb_build_array(a #> '{foco,total}')) LOOP
          IF NOT su ? (ARRAY(SELECT jsonb_array_elements_text(x -> 'caminho')))::text THEN CONTINUE; END IF;
          ref := (su ->> (ARRAY(SELECT jsonb_array_elements_text(x -> 'caminho')))::text)::numeric;
          n_cmp := n_cmp + 1;
          IF ref IS DISTINCT FROM (x ->> 'valor')::numeric AND (ref IS NULL OR (x ->> 'valor') IS NULL OR abs(ref - (x ->> 'valor')::numeric) > 0.01) THEN
            f := f || format('A1 %s %s %s: %s <> %s', crit, uni, x -> 'caminho', x ->> 'valor', ref); END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  IF n_cmp < 60 THEN f := f || format('A1 poucos comparados (%s)', n_cmp); END IF;
  -- A2
  cx := ARRAY(SELECT b.id FROM financeiro_contas_bancarias b WHERE b.cliente_id = c_nj AND b.ativa AND lower(coalesce(b.tipo_conta, '')) IN ('cc', 'inv', 'permuta'));
  a := fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', 'Custeio', ARRAY['Custeio', 'pecuaria'], NULL, 'mes', 'rs_cab', cx, NULL, NULL, hoje);
  IF (a #>> '{foco,total,valor}')::numeric IS DISTINCT FROM 106.56 OR (a #>> '{grafico,kpis,mes}')::numeric IS DISTINCT FROM 106.56
     OR (a #>> '{grafico,kpis,media}')::numeric IS DISTINCT FROM 103.00 THEN
    f := f || format('A2 caixa %s / kpis %s', a #>> '{foco,total,valor}', a #> '{grafico,kpis}'); END IF;
  a := fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', 'Custeio', ARRAY['Custeio', 'pecuaria'], NULL, 'media', 'rs_cab', cx, NULL, NULL, hoje);
  IF (a #>> '{foco,total,valor}')::numeric IS DISTINCT FROM 103.00 THEN f := f || ('A2 caixa media ' || (a #>> '{foco,total,valor}')); END IF;
  a := fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', 'Custeio', ARRAY['Custeio', 'pecuaria'], NULL, 'mes', 'rs_cab', NULL, NULL, NULL, hoje);
  IF (a #>> '{foco,total,valor}')::numeric IS DISTINCT FROM 109.20 OR (a #>> '{grafico,kpis,media}')::numeric IS DISTINCT FROM 105.18 THEN
    f := f || format('A2 padrao %s / %s', a #>> '{foco,total,valor}', a #>> '{grafico,kpis,media}'); END IF;
  -- a curva da media do grafico (out/26, com o previsto) = a media da fn_vg_serie_unidade
  IF coalesce(abs((SELECT (e ->> 'media')::numeric FROM jsonb_array_elements(a #> '{grafico,serie}') e WHERE e ->> 'am' = '2026-10') -
     (SELECT s.valor_realizado + s.valor_previsto FROM fn_vg_serie_unidade(c_nj, '2026-01-01', '2026-12-31', 'media', 'rs_cab', NULL, NULL, NULL, NULL, hoje) s
       WHERE s.nivel = 'atividade' AND s.lado = 'saida' AND s.grupo = 'Custeio' AND s.atividade = 'pecuaria' AND s.ano_mes = '2026-10')), 1) > 0.01 THEN
    f := f || ('A2 curva da media ' || (a #> '{grafico,serie}')::text); END IF;
  -- A3
  FOREACH c IN ARRAY ARRAY[c_nj, c_ag] LOOP
    tela := fn_vg_tela(c, '2026-01-01', '2026-12-31', NULL, NULL, NULL, NULL, hoje);
    k := 9;
    a := fn_vg_analise(c, '2026-01-01', '2026-12-31', '2026-09', 'saida', NULL, '{}', NULL, 'mes', 'rs', NULL, NULL, NULL, hoje);
    IF (a #>> '{tabela,total,valor}')::numeric IS DISTINCT FROM
       (SELECT (l -> 'valores' ->> (k - 1))::numeric FROM jsonb_array_elements(tela -> 'linhas') l WHERE l ->> 'chave' = 'saida:total::') THEN
      f := f || format('A3 %s total %s', left(c::text, 4), a #>> '{tabela,total,valor}'); END IF;
    FOR x IN SELECT * FROM jsonb_array_elements(a #> '{tabela,linhas}') LOOP
      ref := (SELECT (l -> 'valores' ->> (k - 1))::numeric FROM jsonb_array_elements(tela -> 'linhas') l WHERE l ->> 'chave' = 'saida:grupo:' || (x ->> 'grupo') || ':');
      IF coalesce(ref, 0) IS DISTINCT FROM (x ->> 'valor')::numeric THEN f := f || format('A3 %s %s %s <> %s', left(c::text, 4), x ->> 'grupo', x ->> 'valor', ref); END IF;
    END LOOP;
    -- e na MESMA ordem dos grupos da grade
    IF ARRAY(SELECT e ->> 'grupo' FROM jsonb_array_elements(a #> '{tabela,linhas}') WITH ORDINALITY q(e, o)
              WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(tela -> 'linhas') l WHERE l ->> 'chave' = 'saida:grupo:' || (e ->> 'grupo') || ':') ORDER BY o)
       IS DISTINCT FROM ARRAY(SELECT l ->> 'grupo' FROM jsonb_array_elements(tela -> 'linhas') WITH ORDINALITY q(l, o)
                               WHERE l ->> 'tipo' = 'grupo' AND l ->> 'lado' = 'saida' ORDER BY o) THEN
      f := f || format('A3 %s ordem dos grupos', left(c::text, 4)); END IF;
  END LOOP;
  -- A4 (todas as linhas das tres tabelas do NJ e do Agnaldo, R$ mes)
  FOREACH c IN ARRAY ARRAY[c_nj, c_ag] LOOP
    FOR cfg IN SELECT * FROM (VALUES (NULL::text, '{}'::text[]), ('Custeio', ARRAY['Custeio']), ('Custeio', ARRAY['Custeio', 'pecuaria'])) v(aba, foco) LOOP
      a := fn_vg_analise(c, '2026-01-01', '2026-12-31', '2026-09', 'saida', cfg.aba, cfg.foco, NULL, 'mes', 'rs', NULL, NULL, NULL, hoje);
      FOR x IN SELECT * FROM jsonb_array_elements(a #> '{foco,linhas}') LOOP
        IF x -> 'meta' = 'null'::jsonb THEN
          n_sem := n_sem + 1;
          IF x -> 'dif' <> 'null'::jsonb OR x -> 'pct' <> 'null'::jsonb OR x -> 'faixa' <> 'null'::jsonb THEN f := f || format('A4 sem meta com dif %s', x); END IF;
        ELSE
          n_meta := n_meta + 1;
          IF (x ->> 'dif')::numeric IS DISTINCT FROM round((x ->> 'valor')::numeric - (x ->> 'meta')::numeric, 2)
             OR ((x ->> 'meta')::numeric <> 0 AND abs((x ->> 'pct')::numeric - ((x ->> 'valor')::numeric - (x ->> 'meta')::numeric) / (x ->> 'meta')::numeric * 100) > 0.06) THEN
            f := f || format('A4 com meta %s', x); END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF n_sem = 0 THEN f := f || 'A4 nenhum no sem meta conferido'::text; END IF;
  -- A5
  a := fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', 'Custeio', ARRAY['Custeio', 'pecuaria'], NULL, 'mes', 'rs_cab', NULL, NULL, NULL, hoje);
  IF (SELECT array_agg(u ->> 'id' ORDER BY u ->> 'id') FROM jsonb_array_elements(a -> 'unidades') u WHERE (u ->> 'valida')::boolean)
     IS DISTINCT FROM ARRAY['rs', 'rs_arroba', 'rs_cab', 'rs_ha_pec', 'rs_ha_prod', 'rs_ua'] THEN f := f || ('A5 unidades ' || (a -> 'unidades')::text); END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(a #> '{tabela,linhas}') l WHERE l ->> 'rotulo' <> 'Pecuária' AND l -> 'valor' <> 'null'::jsonb) > 0 THEN
    f := f || 'A5 R$/cab fora da pecuaria'::text; END IF;
  a := fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', NULL, '{}', NULL, 'mes', 'rs_cab', NULL, NULL, NULL, hoje);
  IF a #> '{tabela,total,valor}' <> 'null'::jsonb THEN f := f || 'A5 R$/cab na raiz'::text; END IF;
  IF abs((SELECT sum((s ->> 'pct')::numeric) FROM jsonb_array_elements(a #> '{resumo,fatias}') s) - 100) > 0.5 THEN
    f := f || ('A5 fatias ' || (a #> '{resumo,fatias}')::text); END IF;
  -- A6
  BEGIN PERFORM fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida', 'Custeio', ARRAY['Juros'], NULL, 'mes', 'rs', NULL, NULL, NULL, hoje);
    f := f || 'A6 caminho fora da aba'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '22023' THEN f := f || ('A6 caminho ' || SQLSTATE); END IF; END;
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role', 'authenticated')::text, true);
  BEGIN PERFORM fn_vg_analise(c_ag, '2026-01-01', '2026-12-31', '2026-09', 'saida'); f := f || 'A6 outro cliente'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('A6 ' || SQLSTATE); END IF; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN PERFORM fn_vg_analise(c_nj, '2026-01-01', '2026-12-31', '2026-09', 'saida'); f := f || 'A6 sem usuario'::text;
  EXCEPTION WHEN others THEN IF SQLSTATE <> '42501' THEN f := f || ('A6 sem usuario ' || SQLSTATE); END IF; END;
  IF has_function_privilege('anon', 'public.fn_vg_analise(uuid,date,date,text,text,text,text[],text[],text,text,uuid[],uuid[],text,date,text[],boolean)', 'EXECUTE') THEN
    f := f || 'A6 anon executa'::text; END IF;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  IF cardinality(f) > 0 THEN RETURN 'FALHOU: ' || array_to_string(f[1:8], ' || '); END IF;
  RETURN format('OK (%s nos = serie_unidade; %s com meta, %s sem)', n_cmp, n_meta, n_sem);
end $f$;

create function pg_temp.vgan_mut(p_so int[] DEFAULT NULL) returns text language plpgsql as $f$
declare
  m record; d text; r text; vivas text[] := '{}'; total int := 0;
  fn constant text := 'public.fn_vg_analise(uuid,date,date,text,text,text,text[],text[],text,text,uuid[],uuid[],text,date,text[],boolean)';
begin
  FOR m IN SELECT * FROM (VALUES
    ('M1 media sem dividir pelos meses', 'CASE WHEN p_unidade = ''rs_arroba'' THEN 1 ELSE m.i END AS k_media', '1 AS k_media'),
    ('M2 o denominador do mes no lugar do do intervalo', 'ELSE nullif(avg(nullif(dn.dm, 0)) OVER w, 0) END AS d_acc', 'ELSE nullif(dn.dm, 0) END AS d_acc'),
    ('M3 sem meta vira zero', 'coalesce(s.q, 0) AS q, mt.meta', 'coalesce(s.q, 0) AS q, coalesce(mt.meta, 0) AS meta'),
    ('M4 unidade em todo no', 'CASE WHEN NOT p_unidade = ANY (n.uv) THEN NULL', 'CASE WHEN false THEN NULL'),
    ('M5 media do grafico sem o previsto', 'round(sum(c.re + c.pv) OVER w / d.k_media / d.d_acc, 2) END AS md_u', 'round(sum(c.re) OVER w / d.k_media / d.d_acc, 2) END AS md_u'),
    ('M6 grupos fora da ordem do banco', 'coalesce(array_position(v_ord, v.p[1]),', 'coalesce(NULL::int,')
  ) v(nome, de, para) LOOP
    IF p_so IS NOT NULL AND NOT substr(m.nome, 2, position(' ' in m.nome) - 2)::int = ANY (p_so) THEN CONTINUE; END IF;
    total := total + 1;
    d := pg_get_functiondef(fn::regprocedure);
    IF position(m.de in d) = 0 THEN vivas := vivas || (m.nome || ' (trecho nao achado)'); CONTINUE; END IF;
    BEGIN
      EXECUTE replace(d, m.de, m.para);
      r := pg_temp.vgan();
      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = r;
    EXCEPTION WHEN SQLSTATE 'P0099' THEN
      IF SQLERRM NOT LIKE 'FALHOU%' THEN vivas := vivas || m.nome; END IF;
    END;
  END LOOP;
  RETURN format('mutacoes mortas %s/%s', total - cardinality(vivas), total)
         || CASE WHEN cardinality(vivas) > 0 THEN ' — VIVAS: ' || array_to_string(vivas, ', ') ELSE '' END;
end $f$;

do $$ begin raise exception 'VGAN % | %', pg_temp.vgan(), pg_temp.vgan_mut(); end $$;
