-- CONC-FRASES-02 — nenhuma recusa da conciliacao 1:1, do grupo e do "Casar com o banco" sai crua. Dados reais do proto, admin simulado;
-- termina em RAISE 'OK' (nada gravado).
--   E1 (fonte) nas 4 funcoes: nenhum RAISE com literal que leve '%' cru, codigo `xxx_yyy:` ou palavra sem acento; toda recusa
--      `ok:false` do "Casar com o banco" leva a frase (`_fn_conc_frase_casar`)
--   E2 1:1 — extrato inexistente: 42501 com frase pronta + id no DETAIL; lancamento cancelado: frase com descricao/data/R$, id no DETAIL, linha no HINT;
--      lancamento ja' ligado: frase + HINT
--   E3 grupo — um lancamento so': frase com o caminho
--   E4 "Casar com o banco" — sem itens e extrato inexistente: `frase` pronta ao lado do codigo
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  n int; e text; m text; d text; h text; v_ext uuid; v_lan uuid; x uuid := gen_random_uuid(); r jsonb;
BEGIN
  -- E1
  SELECT count(*) INTO n
    FROM pg_proc p, regexp_split_to_table(p.prosrc, 'RAISE EXCEPTION\s+') WITH ORDINALITY t(s, k)
   WHERE p.pronamespace = 'public'::regnamespace AND k > 1
     AND p.proname IN ('fn_vincular_extrato_lancamento', 'fn_vincular_grupo_conciliacao', 'fn_espelho_casar', 'fn_espelho_casar_n1')
     AND (s ~ '\A''(?:(?!'').)*%'                                                       -- literal com % cru
          OR s ~ '\A''[a-z]+_[a-z_]+:'                                             -- codigo cru
          OR s ~* '\A(USING(?:(?!;).)*MESSAGE\s*=\s*)?(format\()?''(?:(?!'').)*(nao |lancamento|vinculo|competencia|ja possui|transferencia|extrato=)'
          OR s ~ '\A''sem acesso a este registro''');
  IF n <> 0 THEN RAISE EXCEPTION 'E1 % recusa(s) crua(s)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.proname IN ('fn_espelho_casar', 'fn_espelho_casar_n1')
     AND (length(p.prosrc) - length(replace(p.prosrc, 'jsonb_build_object(''ok'', false', ''))) / length('jsonb_build_object(''ok'', false')
      <> (length(p.prosrc) - length(replace(p.prosrc, '_fn_conc_frase_casar(', ''))) / length('_fn_conc_frase_casar(')
         + (length(p.prosrc) - length(replace(p.prosrc, '''motivo'', ''parcela_pos''', ''))) / length('''motivo'', ''parcela_pos''');  -- esta ja' trazia a frase
  IF n <> 0 THEN RAISE EXCEPTION 'E1 recusa do Casar com o banco sem frase'; END IF;

  -- E2 1:1, extrato inexistente
  SELECT id INTO v_lan FROM public.financeiro_lancamentos_v2 WHERE cancelado IS TRUE LIMIT 1;
  e := null;
  BEGIN PERFORM public.fn_vincular_extrato_lancamento(x, v_lan, 1, false);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS e = returned_sqlstate, m = message_text, d = pg_exception_detail; END;
  -- extrato que nao existe nao tem cliente: a guarda de acesso responde primeiro (42501), com a frase pronta e o id no DETAIL
  IF e IS DISTINCT FROM '42501' OR m <> 'Você não tem acesso a esta conta.' OR d <> x::text THEN RAISE EXCEPTION 'E2 extrato: % | % | %', e, m, d; END IF;

  -- E2 1:1, lancamento cancelado (extrato vivo do mesmo cliente)
  SELECT l.id, (SELECT ex.id FROM public.extrato_bancario_v2 ex WHERE ex.cliente_id = l.cliente_id AND ex.cancelado_em IS NULL
                 AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.extrato_id = ex.id AND c.desfeito_em IS NULL) LIMIT 1)
    INTO v_lan, v_ext
    FROM public.financeiro_lancamentos_v2 l WHERE l.cancelado IS TRUE AND l.descricao IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.extrato_bancario_v2 ex WHERE ex.cliente_id = l.cliente_id AND ex.cancelado_em IS NULL) LIMIT 1;
  e := null;
  BEGIN PERFORM public.fn_vincular_extrato_lancamento(v_ext, v_lan, 1, false);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS e = returned_sqlstate, m = message_text, d = pg_exception_detail, h = pg_exception_hint; END;
  IF e IS DISTINCT FROM 'P0001' OR m !~ '\AO lançamento ".*" \([0-9]{2}/[0-9]{2}/[0-9]{4}, R\$ [0-9.]+,[0-9]{2}\) está cancelado'
     OR d <> v_lan::text OR (h::jsonb->>'lancamento_id') <> v_lan::text THEN RAISE EXCEPTION 'E2 cancelado: % | % | % | %', e, m, d, h; END IF;

  -- E2 1:1, lancamento ja' ligado a outro extrato
  SELECT c.lancamento_id, (SELECT ex.id FROM public.extrato_bancario_v2 ex WHERE ex.cliente_id = c.cliente_id AND ex.id <> c.extrato_id
                             AND ex.cancelado_em IS NULL AND ex.conta_bancaria_id = (SELECT conta_bancaria_id FROM public.extrato_bancario_v2 WHERE id = c.extrato_id)
                             AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c2 WHERE c2.extrato_id = ex.id AND c2.desfeito_em IS NULL) LIMIT 1)
    INTO v_lan, v_ext
    FROM public.conciliacao_bancaria_itens c JOIN public.financeiro_lancamentos_v2 l ON l.id = c.lancamento_id AND l.cancelado IS NOT TRUE
   WHERE c.desfeito_em IS NULL AND c.grupo_id IS NULL AND abs(c.valor_aplicado) >= abs(l.valor) - 0.005
     AND NOT EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
                      AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado')
   LIMIT 1;
  IF v_ext IS NOT NULL THEN
    e := null;
    BEGIN PERFORM public.fn_vincular_extrato_lancamento(v_ext, v_lan, 1, false);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS e = returned_sqlstate, m = message_text, d = pg_exception_detail, h = pg_exception_hint; END;
    IF m !~ '(já está ligado|é da conta|passa do que ainda falta)' OR m ~ '(lancamento|vinculo|%)' THEN RAISE EXCEPTION 'E2 ja ligado: % | % | %', e, m, h; END IF;
  END IF;

  -- E3 grupo com um so'
  e := null;
  BEGIN PERFORM public.fn_vincular_grupo_conciliacao(v_ext, ARRAY[v_lan], ARRAY[1::numeric], 'teste');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS e = returned_sqlstate, m = message_text, d = pg_exception_detail; END;
  IF m <> 'O grupo precisa de pelo menos dois lançamentos (veio 1). Para um lançamento só, ligue direto.' THEN RAISE EXCEPTION 'E3 grupo: % | %', e, m; END IF;

  -- E4 Casar com o banco
  r := public.fn_espelho_casar(v_ext, '[]'::jsonb, true);
  IF r->>'motivo' <> 'sem_itens' OR r->>'frase' <> 'Marque ao menos um lançamento para casar.' THEN RAISE EXCEPTION 'E4 sem itens: %', r; END IF;
  -- extrato inexistente: a guarda de acesso responde primeiro (42501, frase pronta) — ou, se passar, a recusa traz a frase
  e := null; r := null;
  BEGIN r := public.fn_espelho_casar(x, jsonb_build_array(jsonb_build_object('lancamento_id', v_lan, 'valor', 1)), true);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS e = returned_sqlstate, m = message_text; END;
  IF NOT ((r->>'motivo' = 'extrato_nao_encontrado' AND r->>'frase' LIKE 'O movimento do banco escolhido não existe mais%')
          OR (e = '42501' AND m = 'Você não tem acesso a esta conta.')) THEN RAISE EXCEPTION 'E4 extrato: % | % | %', r, e, m; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
