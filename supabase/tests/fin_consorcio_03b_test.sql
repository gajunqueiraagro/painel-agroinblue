-- FIN-CONSORCIO-03b — os centavos do fundo comum na última parcela do grupo que recebe o resto. Roda depois da 20261027203500; só lê
-- (o gerador é imutável); termina em RAISE "OK".
-- C1 o 002122 nos três modos (% por parcela, % total, R$): fecha 197.607,98, sem aviso do fundo comum, a 80 adiada com 2.703,92 e a
--    marca −0,12, faixa própria; total 224.293,02.
-- C2 diferença real (valor informado com transcorridas diluídas: falta 91.937,24) continua AVISO, sem ajuste.
-- C3 automático, adiadas: os +0,02 vão na última adiada. C4 diluídas: na última a pagar. C5 adesão: a linha da adesão fecha sem ajuste.
set local statement_timeout = '20s';
DO $t$
DECLARE
  b constant jsonb := '{"carta":197607.98,"primeira_parcela":"2026-07-18","prazo_grupo":80,"ja_transcorridas":34,"transcorridas":"adiadas",
    "taxa_adm":{"total_pct":13,"forma":"antecipada","pct_parcela":0.25,"primeiras":12},"fundo_reserva":{"modo":"pct_parcela","valor":0.0063},
    "seguro":{"modo":"pct_mes","valor":0,"base":"credito_e_taxas","inicio":"primeira"},"reajuste":{"indice":"nenhum"}}';
  m jsonb; r jsonb; v_aj jsonb;
BEGIN
  -- C1
  FOR m IN SELECT * FROM jsonb_array_elements('[{"modo":"pct_parcela","valor":1.1625},{"modo":"pct_total","valor":53.475},{"modo":"valor","valor":2297.19}]') LOOP
    r := fn_consorcio_cronograma(b || jsonb_build_object('fundo_comum', m));
    select jsonb_agg(l) into v_aj from jsonb_array_elements(r->'linhas') l where l ? 'ajuste_arredondamento';
    IF (r->'totais'->>'fundo_comum')::numeric <> 197607.98 OR (r->'totais'->>'total')::numeric <> 224293.02
       OR EXISTS (select 1 from jsonb_array_elements_text(r->'avisos') a where a like 'fundo comum:%')
       OR jsonb_array_length(v_aj) <> 1 OR (v_aj->0->>'numero')::int <> 80 OR (v_aj->0->>'fundo_comum')::numeric <> 2703.92
       OR (v_aj->0->>'ajuste_arredondamento')::numeric <> -0.12 OR not (v_aj->0->>'adiada')::boolean
       OR jsonb_array_length(r->'faixas') <> 4 OR (r->'faixas'->2->>'de')::int <> 47 OR (r->'faixas'->2->>'ate')::int <> 79
       OR (r->'faixas'->2->>'total')::numeric <> 2716.49 OR (r->'faixas'->3->>'de')::int <> 80 OR (r->'faixas'->3->>'total')::numeric <> 2716.37
       OR (r->'faixas'->3->>'ajuste_arredondamento')::numeric <> -0.12 OR (r->'faixas'->2->>'ajuste_arredondamento') is not null THEN
      RAISE EXCEPTION 'C1 %: %', m, r - 'linhas';
    END IF;
  END LOOP;

  -- C2
  r := fn_consorcio_cronograma(b || '{"fundo_comum":{"modo":"valor","valor":2297.19},"transcorridas":"diluidas"}');
  IF (r->'totais'->>'fundo_comum')::numeric <> 105670.74
     OR NOT (r->'avisos') @> '["fundo comum: 105.670,74 nas parcelas x 197.607,98 da carta (−91.937,24, arredondamento)"]'::jsonb
     OR EXISTS (select 1 from jsonb_array_elements(r->'linhas') l where l ? 'ajuste_arredondamento') THEN RAISE EXCEPTION 'C2: %', r - 'linhas'; END IF;

  -- C3
  r := fn_consorcio_cronograma(b || '{"fundo_comum":{"modo":"auto"}}');
  IF (r->'totais'->>'fundo_comum')::numeric <> 197607.98 OR (r->'linhas'->79->>'ajuste_arredondamento')::numeric <> -0.02
     OR (r->'linhas'->79->>'fundo_comum')::numeric <> 2470.08 THEN RAISE EXCEPTION 'C3: %', r - 'linhas'; END IF;

  -- C4
  r := fn_consorcio_cronograma(b || '{"fundo_comum":{"modo":"auto"},"transcorridas":"diluidas","ja_transcorridas":0,"prazo_grupo":81}');
  IF (r->'totais'->>'fundo_comum')::numeric <> 197607.98 OR (r->'linhas'->80->>'ajuste_arredondamento')::numeric <> 0.38
     OR (r->'linhas'->80->>'adiada')::boolean OR (r->'linhas'->79 ? 'ajuste_arredondamento') THEN RAISE EXCEPTION 'C4: %', r - 'linhas'; END IF;

  -- C5
  r := fn_consorcio_cronograma(b || '{"fundo_comum":{"modo":"auto"},"transcorridas":"adesao"}');
  IF (r->'totais'->>'fundo_comum')::numeric <> 197607.98 OR not (r->'linhas'->0->>'adesao')::boolean
     OR EXISTS (select 1 from jsonb_array_elements(r->'linhas') l where l ? 'ajuste_arredondamento') THEN RAISE EXCEPTION 'C5: %', r - 'linhas'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
