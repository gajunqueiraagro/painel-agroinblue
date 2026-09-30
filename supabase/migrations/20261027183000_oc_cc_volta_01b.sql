-- OC-CC-VOLTA-01b — Ajuste de preco em TODOS os lotes (rateio por kg), nos dois sentidos, com volta pelo snapshot;
-- desconto rateado pelas entregas; entregas por kg; salvar lotes ressincroniza as entregas.
--
-- CASO (Gabriel, 30/09/2026): NJ af334f9c, 3 lotes de novilhas (132.010 / 56.330 / 29.670 kg) somando 1.015.000,00, recebido
-- 2.550.000,00. "+ Ajuste de preco" so' oferecia um lote, nascia vazio e so' baixava o preco.
--
-- REGRA DE COMPETENCIA: o DRE da venda/compra e' o valor de CADA ENTREGA na data da SUA saida. Nunca a primeira nem a ultima.
--
-- O QUE MUDA
--   _oc_ratear_por_kg (nova)       rateio de um total por kg; centavos no item de maior peso; soma exata.
--   _oc_entregas_snapshot (nova)   as entregas vivas da OC (parte, titulo, lote, data, cab, kg, valor) — snapshot e previa.
--   oc_sincronizar_entregas        lote FECHADO pelas saidas: o valor se distribui pelas entregas POR KG (cab x peso da saida),
--                                  a de maior peso leva os centavos. Lote aberto: como antes (parte da quantidade negociada).
--                                  Continua o UNICO escritor de entrega; nenhuma data muda. E' a segunda entrega de um lote que
--                                  passa a existir: toda entrega nascia com sequencia 1 e o indice `zoo_operacao_partes_identidade_lote`
--                                  recusava a segunda (nenhum lote do banco tem duas; um lote com duas saidas nao sincronizava).
--   oc_explicar_saldo              ajuste_preco: p_lote_id NULO = TODOS os lotes, o novo total rateado pelo peso negociado
--                                  (qtd x peso medio), centavos no lote de maior peso; valor positivo baixa, negativo sobe.
--                                  Snapshot de ANTES e de DEPOIS (lotes, lancamentos do rebanho, entregas) no evento; a
--                                  simulacao devolve a `previa`. desconto_comercial: um titulo e uma parte POR ENTREGA, por kg,
--                                  cada um na data da saida (chave `explicacao:<grupo>:<n>`). permuta / outra receita /
--                                  devolucao: na data informada (p_vencimento); sem ela, a da ultima entrega, como antes.
--   oc_desfazer_explicacao         ajuste com snapshot: RESTAURA o snapshot (criterio e valor de cada lote, lancamentos do
--                                  rebanho, entregas pela sincronizacao) e RECUSA se um lote mudou depois do ajuste, dizendo
--                                  qual e o que mudou. Ajuste antigo (sem snapshot): o delta de sempre. Desconto em grupo:
--                                  cancela o grupo inteiro.
--   oc_conta_corrente              `explicacoes` soma as partes de um grupo numa linha (o extrato segue linha a linha).
--   oc_salvar_lotes                conta corrente com entrega viva: ressincroniza as entregas e devolve a versao final
--                                  (b74cfd38: lote 66.500 x entrega 36.500).
--
-- NAO MUDA: recebimentos, liquidacoes, conciliacao, despesas, datas das entregas.
--
-- METODO: patch guardado por md5 (CLAUDE.md): cada corpo de origem conferido, cada ancora casando o numero exato de vezes, o
-- trecho do ajuste trocado inteiro sob o md5 do texto antigo, e o md5 de cada corpo resultante conferido. A funcao e' recriada
-- com os atributos lidos do catalogo (argumentos, retorno, linguagem, volatilidade, SECURITY DEFINER, search_path).
--   ANTES                              DEPOIS
--   oc_sincronizar_entregas  c0fe12bbba165d7578fbbe1fa75c2327  → 91cdb5f80bad3335c800afdb7291e8ae
--   oc_explicar_saldo        bd440c859c3220f4db27bc18cb2507e2  → 2557f40b5cbdeacb4d2a12d995692e0c
--   oc_desfazer_explicacao   fd6b5d6a544edb2f3294e3624e1de1cb  → 6bbca887970db9a89160a9efd3fa312e
--   oc_conta_corrente        21e1020399f1b9308f1a770282af9703  → 9e1a80a8c44b12409d5ddcafb01fa74c
--   oc_salvar_lotes          eac052cdb984db75d9828f605e6b825d  → 80de84d14ea2f3ee9db3cf26e7f0b54f

CREATE OR REPLACE FUNCTION public._oc_ratear_por_kg(p_total numeric, p_itens jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $fn$
  /* Rateio de `p_total` pelos `kg` de `p_itens` ([{id, kg}]): cada item arredondado ao centavo, e o de MAIOR peso (empate: o
     primeiro da lista) leva a diferenca, para a soma ser exatamente o total. Devolve [{id, kg, valor}] na ordem de entrada.
     Quem chama garante kg > 0 no total. */
  WITH i AS (
    SELECT t.e->>'id' AS id, (t.e->>'kg')::numeric AS kg, t.ord
      FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(e, ord)
  ), tot AS (
    SELECT sum(kg) AS kg_total FROM i
  ), r AS (
    SELECT i.id, i.kg, i.ord, round(p_total * i.kg / tot.kg_total, 2) AS bruto,
           row_number() OVER (ORDER BY i.kg DESC, i.ord) AS rk
      FROM i, tot
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kg', r.kg,
           'valor', CASE WHEN r.rk = 1 THEN round(p_total, 2) - (SELECT coalesce(sum(r2.bruto), 0) FROM r r2 WHERE r2.rk > 1)
                         ELSE r.bruto END)
           ORDER BY r.ord), '[]'::jsonb)
    FROM r;
$fn$;

CREATE OR REPLACE FUNCTION public._oc_entregas_snapshot(p_operacao_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$
  /* As entregas vivas da OC, como o snapshot e a previa as leem: o kg e' o da SAIDA (cab x peso medio; sem peso, o negociado). */
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'parte_id', pt.id, 'titulo_id', f.id, 'lote_id', pt.lote_id, 'lote_ordem', lo.ordem,
           'movimentacao_id', pt.entrega_movimentacao_id, 'data', f.data_competencia, 'cab', l.quantidade,
           'kg', round(coalesce(l.quantidade, 0) * coalesce(l.peso_medio_kg, lo.peso_medio_negociado_kg, 0), 3),
           'valor', f.valor)
         ORDER BY f.data_competencia, lo.ordem, pt.id), '[]'::jsonb)
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
    LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = pt.lote_id
    LEFT JOIN public.lancamentos l ON l.id = pt.entrega_movimentacao_id
   WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'entrega' AND pt.cancelada = false;
$fn$;

CREATE FUNCTION pg_temp.troca(p_src text, p_ancora text, p_novo text, p_vezes int, p_rotulo text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE n int;
BEGIN
  n := (length(p_src) - length(replace(p_src, p_ancora, ''))) / length(p_ancora);
  IF n <> p_vezes THEN RAISE EXCEPTION 'ancora % casa % vez(es), esperado %', p_rotulo, n, p_vezes; END IF;
  RETURN replace(p_src, p_ancora, p_novo);
END $f$;

CREATE FUNCTION pg_temp.troca_trecho(p_src text, p_ini text, p_fim text, p_md5 text, p_novo text, p_rotulo text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE i int; j int;
BEGIN
  IF (length(p_src) - length(replace(p_src, p_ini, ''))) / length(p_ini) <> 1 THEN RAISE EXCEPTION 'inicio de % nao casa 1x', p_rotulo; END IF;
  IF (length(p_src) - length(replace(p_src, p_fim, ''))) / length(p_fim) <> 1 THEN RAISE EXCEPTION 'fim de % nao casa 1x', p_rotulo; END IF;
  i := position(p_ini IN p_src); j := position(p_fim IN p_src);
  IF j <= i THEN RAISE EXCEPTION 'trecho % fora de ordem', p_rotulo; END IF;
  IF md5(substr(p_src, i, j - i)) <> p_md5 THEN
    RAISE EXCEPTION 'trecho % nao e o esperado (md5 %, esperado %)', p_rotulo, md5(substr(p_src, i, j - i)), p_md5; END IF;
  RETURN substr(p_src, 1, i - 1) || p_novo || substr(p_src, j);
END $f$;

-- Recria a funcao com o corpo novo e os atributos que o catalogo ja' tem. Recusa o que ela nao sabe reproduzir.
CREATE FUNCTION pg_temp.recria(p_nome text, p_src text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE p pg_proc; v_lang text; v_cfg text := ''; c text;
BEGIN
  SELECT * INTO p FROM pg_proc WHERE proname = p_nome AND pronamespace = 'public'::regnamespace;
  IF p.oid IS NULL THEN RAISE EXCEPTION 'funcao % ausente', p_nome; END IF;
  IF p.proisstrict OR p.proretset OR p.procost <> 100 OR p.proparallel <> 'u' OR p.proleakproof THEN
    RAISE EXCEPTION 'funcao % com atributo que a recriacao nao reproduz', p_nome; END IF;
  SELECT lanname INTO v_lang FROM pg_language WHERE oid = p.prolang;
  FOREACH c IN ARRAY coalesce(p.proconfig, '{}'::text[]) LOOP
    v_cfg := v_cfg || format(' SET %s TO %s', split_part(c, '=', 1),
      (SELECT string_agg(quote_literal(btrim(x)), ', ') FROM unnest(string_to_array(substr(c, strpos(c, '=') + 1), ',')) x));
  END LOOP;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE %s %s %s%s AS %L',
    p_nome, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), v_lang,
    CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_cfg, p_src);
END $f$;

DO $mig$
DECLARE
  v text; v_err text := '';
  c_md5_depois jsonb := jsonb_build_object(
    'oc_sincronizar_entregas', '91cdb5f80bad3335c800afdb7291e8ae', 'oc_explicar_saldo', '2557f40b5cbdeacb4d2a12d995692e0c',
    'oc_desfazer_explicacao', '6bbca887970db9a89160a9efd3fa312e', 'oc_conta_corrente', '9e1a80a8c44b12409d5ddcafb01fa74c', 'oc_salvar_lotes', '80de84d14ea2f3ee9db3cf26e7f0b54f');
  k text;
BEGIN
  ------------------------------------------------------------------------------------------------------------------------------
  -- oc_sincronizar_entregas — entregas de lote fechado por kg
  ------------------------------------------------------------------------------------------------------------------------------
  SELECT prosrc INTO v FROM pg_proc WHERE proname = 'oc_sincronizar_entregas' AND pronamespace = 'public'::regnamespace;
  IF md5(v) <> 'c0fe12bbba165d7578fbbe1fa75c2327' THEN RAISE EXCEPTION 'oc_sincronizar_entregas fora do corpo esperado (md5 %)', md5(v); END IF;
  v := pg_temp.troca(v, $a$             sum(l.quantidade) OVER (PARTITION BY lo.id) AS cab_lote,
             sum(l.quantidade) OVER (PARTITION BY lo.id ORDER BY l.data, l.id) AS cab_acum,
             row_number() OVER (PARTITION BY lo.id ORDER BY l.data DESC, l.id DESC) AS inv
$a$, $a$             sum(l.quantidade) OVER (PARTITION BY lo.id) AS cab_lote,
             sum(l.quantidade) OVER (PARTITION BY lo.id ORDER BY l.data, l.id) AS cab_acum,
             row_number() OVER (PARTITION BY lo.id ORDER BY l.data DESC, l.id DESC) AS inv,
             -- OC-CC-VOLTA-01b: o peso da saida (cab x peso medio da saida; sem peso na saida, o negociado)
             l.quantidade * coalesce(l.peso_medio_kg, lo.peso_medio_negociado_kg, 1) AS kg,
             sum(l.quantidade * coalesce(l.peso_medio_kg, lo.peso_medio_negociado_kg, 1)) OVER (PARTITION BY lo.id) AS kg_lote,
             row_number() OVER (PARTITION BY lo.id
                                ORDER BY l.quantidade * coalesce(l.peso_medio_kg, lo.peso_medio_negociado_kg, 1) DESC, l.data, l.id) AS rk_kg
$a$, 1, 'sinc.janelas');
  v := pg_temp.troca(v, $a$        -- por cabeca da quantidade NEGOCIADA; quando as saidas fecham o lote, a ultima leva o residuo e a soma e' o lote
        CASE WHEN s.cab_lote = s.qtd_negociada AND s.inv = 1
             THEN s.total_lote - coalesce((SELECT sum(round(s2.total_lote * s2.cab / s2.qtd_negociada, 2))
                                             FROM s s2 WHERE s2.lote_id = s.lote_id AND s2.inv > 1), 0)
             ELSE round(s.total_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS valor
$a$, $a$        -- OC-CC-VOLTA-01b (regra 2): quando as saidas FECHAM o lote, o valor do lote se distribui pelas entregas POR KG, cada
        -- uma na data da sua saida; a de maior peso leva os centavos e a soma e' o lote. Lote ainda aberto: a entrega vale a sua
        -- parte da quantidade NEGOCIADA, como antes (o kg do que falta sair ainda nao existe).
        CASE WHEN s.cab_lote = s.qtd_negociada
             THEN CASE WHEN s.rk_kg = 1
                       THEN s.total_lote - coalesce((SELECT sum(round(s2.total_lote * s2.kg / s2.kg_lote, 2))
                                                       FROM s s2 WHERE s2.lote_id = s.lote_id AND s2.rk_kg > 1), 0)
                       ELSE round(s.total_lote * s.kg / nullif(s.kg_lote, 0), 2) END
             ELSE round(s.total_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS valor
$a$, 1, 'sinc.valor');
  -- a SEGUNDA entrega de um lote: o indice `zoo_operacao_partes_identidade_lote` (operacao, lote, natureza, componente, sequencia)
  -- recusava — toda entrega nascia com sequencia 1, e um lote com duas saidas nao sincronizava. A nova numera depois da maior viva.
  v := pg_temp.troca(v, $a$  v_parte uuid;
$a$, $a$  v_parte uuid;
  v_seq int;
$a$, 1, 'sinc.declare');
  v := pg_temp.troca(v, $a$      RETURNING id INTO v_tit;
$a$, $a$      RETURNING id INTO v_tit;
      -- OC-CC-VOLTA-01b: um lote pode ter varias entregas (uma por saida); cada uma leva a sua sequencia, depois da maior viva
      SELECT coalesce(max(pt.sequencia_parcela), 0) + 1 INTO v_seq FROM public.zoo_operacao_partes pt
       WHERE pt.operacao_id = p_operacao_id AND pt.lote_id = r.lote_id AND pt.natureza = 'principal'
         AND pt.componente = 'entrega' AND pt.cancelada = false;
$a$, 1, 'sinc.seq');
  v := pg_temp.troca(v, $a$        v_cli, p_operacao_id, 'entrega', 'principal', 'entrega', 1, 1, r.valor, r.data,
$a$, $a$        v_cli, p_operacao_id, 'entrega', 'principal', 'entrega', v_seq, v_seq, r.valor, r.data,
$a$, 1, 'sinc.valores');
  PERFORM pg_temp.recria('oc_sincronizar_entregas', v);

  ------------------------------------------------------------------------------------------------------------------------------
  -- oc_explicar_saldo — ajuste em todos os lotes com snapshot e previa; desconto por entrega; data do fato
  ------------------------------------------------------------------------------------------------------------------------------
  SELECT prosrc INTO v FROM pg_proc WHERE proname = 'oc_explicar_saldo' AND pronamespace = 'public'::regnamespace;
  IF md5(v) <> 'bd440c859c3220f4db27bc18cb2507e2' THEN RAISE EXCEPTION 'oc_explicar_saldo fora do corpo esperado (md5 %)', md5(v); END IF;
  v := pg_temp.troca(v, $a$  v_tit uuid; v_parte uuid; v_x jsonb; v_ver int; v_nova int; v_ret jsonb; v_rotulo text;
$a$, $a$  v_tit uuid; v_parte uuid; v_x jsonb; v_ver int; v_nova int; v_ret jsonb; v_rotulo text;
  v_alvo jsonb; v_rateio jsonb; v_snap_antes jsonb; v_snap_depois jsonb; v_previa jsonb; v_criterio text; v_kg_total numeric;
  v_data date; v_i int; v_n int; v_grupo uuid; v_partes jsonb := '[]'::jsonb; v_tit_i uuid; v_parte_i uuid; r_e record;
$a$, 1, 'expl.declare');
  -- permuta / outra receita / devolucao: na data do fato informada (regra 4)
  v := pg_temp.troca(v, $a$    v_venc := CASE WHEN v_smc THEN v_ult ELSE p_vencimento END;
    v_pag := CASE WHEN v_smc THEN v_ult ELSE NULL END;
$a$, $a$    -- OC-CC-VOLTA-01b (regra 4): na data do fato que o operador informa (p_vencimento); sem ela, a da ultima entrega, como antes
    v_data := coalesce(p_vencimento, v_ult);
    v_venc := CASE WHEN v_smc THEN v_data ELSE p_vencimento END;
    v_pag := CASE WHEN v_smc THEN v_data ELSE NULL END;
$a$, 1, 'expl.datas');
  v := pg_temp.troca(v, $a$      v_cli, v_op.fazenda_id, v_valor, v_sinal, v_tipo_op, v_ult, v_pag, v_venc, to_char(v_ult, 'YYYY-MM'),
$a$, $a$      v_cli, v_op.fazenda_id, v_valor, v_sinal, v_tipo_op, v_data, v_pag, v_venc, to_char(v_data, 'YYYY-MM'),
$a$, 1, 'expl.titulo.datas');
  v := pg_temp.troca(v, $a$      v_actor, v_actor, public.fn_safra_sugerida(v_cli, v_ult, v_pc.escopo_negocio))
$a$, $a$      v_actor, v_actor, public.fn_safra_sugerida(v_cli, v_data, v_pc.escopo_negocio))
$a$, 1, 'expl.titulo.safra');
  v := pg_temp.troca(v, $a$'competencia', v_ult$a$, $a$'competencia', coalesce(v_data, v_ult)$a$, 2, 'expl.competencia');
  -- evento com o snapshot; retorno com a previa
  v := pg_temp.troca(v, $a$      'lote_total_anterior', v_total, 'lote_total_novo', v_novo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1),
    v_actor, 'rpc');
$a$, $a$      'lote_total_anterior', v_total, 'lote_total_novo', v_novo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1)
      || CASE WHEN v_snap_antes IS NOT NULL THEN jsonb_build_object('criterio', v_criterio, 'snapshot_antes', v_snap_antes,
                                                                   'snapshot_depois', v_snap_depois) ELSE '{}'::jsonb END
      || CASE WHEN jsonb_array_length(v_partes) > 0 THEN jsonb_build_object('partes', v_partes) ELSE '{}'::jsonb END,
    v_actor, 'rpc');
$a$, 1, 'expl.evento');
  v := pg_temp.troca(v, $a$    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
$a$, $a$    'previa', v_previa,
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
$a$, 1, 'expl.retorno');
  -- o ramo do ajuste, trocado inteiro, mais o ramo novo do desconto antes do ELSE generico
  v := pg_temp.troca_trecho(v, $a$  IF p_tipo = 'ajuste_preco' THEN
$a$, $a$  ELSE
    IF p_tipo = 'desconto_comercial' THEN
$a$, 'f66c7a947ad443a757b06acc38b41e40', $a$  IF p_tipo = 'ajuste_preco' THEN
    -- OC-CC-VOLTA-01b — AJUSTE DE PRECO de UM lote (p_lote_id) ou de TODOS (p_lote_id NULO). Valor POSITIVO baixa o preco (a
    -- entrega cai), NEGATIVO sobe. Em "todos", o NOVO total rateia pelo peso negociado (qtd x peso medio), os centavos no lote de
    -- maior peso. Cada lote e' revalorado e as entregas seguem pela sincronizacao (o unico escritor de entrega), cada uma na data da
    -- sua saida. O snapshot de ANTES e de DEPOIS vai no evento: o desfazer restaura o de antes e recusa se o de depois mudou.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'lote_id', lo.id, 'ordem', lo.ordem, 'categoria', lo.categoria_negociada,
             'qtd', lo.qtd_negociada, 'peso', lo.peso_medio_negociado_kg,
             'kg', coalesce(lo.qtd_negociada, 0) * coalesce(lo.peso_medio_negociado_kg, 0),
             'criterio_valor', lo.criterio_valor, 'valor_informado', lo.valor_informado,
             'total', (public._oc_valor_do_lote(lo.id)->>'total')::numeric,
             'com_entrega', EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                                     WHERE pt.lote_id = lo.id AND pt.origem = 'entrega' AND pt.cancelada = false))
           ORDER BY lo.ordem), '[]'::jsonb)
      INTO v_alvo
      FROM public.zoo_operacao_lotes lo
     WHERE lo.operacao_id = p_operacao_id AND (p_lote_id IS NULL OR lo.id = p_lote_id);
    IF jsonb_array_length(v_alvo) = 0 THEN RAISE EXCEPTION 'Escolha o lote do ajuste de preco' USING ERRCODE = 'P0001'; END IF;
    SELECT e->>'ordem' INTO v_rotulo FROM jsonb_array_elements(v_alvo) e WHERE (e->>'com_entrega')::boolean IS NOT TRUE
     ORDER BY (e->>'ordem')::int LIMIT 1;
    IF v_rotulo IS NOT NULL THEN RAISE EXCEPTION 'Lote % sem entrega no financeiro', v_rotulo USING ERRCODE = 'P0001'; END IF;
    v_criterio := CASE WHEN p_lote_id IS NULL THEN 'todos_por_kg' ELSE 'lote' END;
    SELECT sum((e->>'total')::numeric), sum((e->>'kg')::numeric) INTO v_total, v_kg_total FROM jsonb_array_elements(v_alvo) e;
    v_novo := round(v_total - v_valor, 2);
    IF v_novo <= 0 THEN
      RAISE EXCEPTION 'O ajuste deixaria os lotes sem valor (atual %, ajuste %)', v_total, v_valor USING ERRCODE = 'P0001'; END IF;
    IF p_lote_id IS NULL THEN
      SELECT e->>'ordem' INTO v_rotulo FROM jsonb_array_elements(v_alvo) e WHERE NOT ((e->>'kg')::numeric > 0)
       ORDER BY (e->>'ordem')::int LIMIT 1;
      IF v_rotulo IS NOT NULL THEN
        RAISE EXCEPTION 'Lote % sem quantidade ou peso medio: o rateio de todos os lotes e'' pelo kg negociado', v_rotulo
          USING ERRCODE = 'P0001'; END IF;
      v_rateio := public._oc_ratear_por_kg(v_novo,
        (SELECT jsonb_agg(jsonb_build_object('id', e->>'lote_id', 'kg', (e->>'kg')::numeric) ORDER BY (e->>'ordem')::int)
           FROM jsonb_array_elements(v_alvo) e));
    ELSE
      v_rateio := jsonb_build_array(jsonb_build_object('id', p_lote_id, 'valor', v_novo));
    END IF;
    v_snap_antes := jsonb_build_object(
      'lotes', v_alvo,
      'lancamentos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'lote_id', m.operacao_lote_id, 'valor_total', l.valor_total)
                                                ORDER BY l.id)
                                 FROM public.zoo_operacao_movimentacoes m
                                 JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
                                WHERE m.operacao_id = p_operacao_id AND m.origem = 'registrada'
                                  AND m.operacao_lote_id IN (SELECT (e->>'lote_id')::uuid FROM jsonb_array_elements(v_alvo) e)),
                              '[]'::jsonb),
      'entregas', public._oc_entregas_snapshot(p_operacao_id));
    v_ver := v_op.versao;
    FOR r_e IN SELECT (x->>'id')::uuid AS lote_id, (x->>'valor')::numeric AS valor FROM jsonb_array_elements(v_rateio) x LOOP
      IF NOT (r_e.valor > 0) THEN RAISE EXCEPTION 'O rateio deixaria um lote sem valor' USING ERRCODE = 'P0001'; END IF;
      v_x := public.oc_revalorar_lote(p_operacao_id, v_cli, v_ver, r_e.lote_id, r_e.valor, 'Ajuste de preço: ' || btrim(p_motivo));
      v_ver := (v_x->>'operacao_versao')::int;
    END LOOP;
    v_x := public.oc_sincronizar_entregas(p_operacao_id, v_ver, false);
    v_snap_depois := jsonb_build_object(
      'lotes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'lote_id', lo.id, 'ordem', lo.ordem, 'categoria', lo.categoria_negociada, 'qtd', lo.qtd_negociada,
                   'peso', lo.peso_medio_negociado_kg, 'kg', coalesce(lo.qtd_negociada, 0) * coalesce(lo.peso_medio_negociado_kg, 0),
                   'criterio_valor', lo.criterio_valor, 'valor_informado', lo.valor_informado,
                   'total', (public._oc_valor_do_lote(lo.id)->>'total')::numeric) ORDER BY lo.ordem), '[]'::jsonb)
                  FROM public.zoo_operacao_lotes lo
                 WHERE lo.id IN (SELECT (e->>'lote_id')::uuid FROM jsonb_array_elements(v_alvo) e)),
      'entregas', public._oc_entregas_snapshot(p_operacao_id));
    v_previa := jsonb_build_object('criterio', v_criterio, 'total_antes', v_total, 'total_novo', v_novo,
      'lotes_antes', v_snap_antes->'lotes', 'lotes_depois', v_snap_depois->'lotes',
      'entregas_antes', v_snap_antes->'entregas', 'entregas_depois', v_snap_depois->'entregas');
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.tipo_operacao = public._oc_cc_direcao(v_op.tipo_operacao)
       AND pc.subcentro = CASE WHEN p_lote_id IS NULL THEN public._oc_cc_conta_principal(p_operacao_id)
                               ELSE public._oc_cc_conta_entrega(v_op.tipo_operacao, v_alvo->0->>'categoria') END;
    v_nat := CASE WHEN v_valor > 0 THEN 'deducao' ELSE 'acrescimo' END;
    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
      descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, lote_id,
      sem_movimentacao_caixa)
    VALUES (v_cli, p_operacao_id, 'explicacao', v_nat, 'ajuste_preco', 1, 1, abs(v_valor), v_ult, btrim(p_motivo), false,
      v_op.contraparte_id, v_pc.id, v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, p_lote_id, true)
    RETURNING id INTO v_parte;
  ELSIF p_tipo = 'desconto_comercial' THEN
    -- OC-CC-VOLTA-01b (regra 4) — O DESCONTO TAMBEM E' PRECO: rateia pelas ENTREGAS por kg (cab x peso medio da saida), cada parte
    -- na data da SUA saida (competencia e safra), os centavos na entrega de maior peso. Um titulo sem caixa e uma parte por entrega,
    -- ligadas pela chave `explicacao:<grupo>:<n>`: o extrato mostra cada parte na sua data, `oc_conta_corrente` as soma numa
    -- explicacao so', e o desfazer cancela o grupo inteiro. Antes: um titulo so', na data da ultima entrega.
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.ordem_exibicao = 5020 AND pc.tipo_operacao = '2-Saídas';
    IF v_pc.id IS NULL THEN RAISE EXCEPTION 'Conta da explicacao ausente do plano' USING ERRCODE = 'P0001'; END IF;
    v_nat := 'deducao'; v_rotulo := 'Desconto comercial';
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e->>'parte_id', 'kg', (e->>'kg')::numeric)
                              ORDER BY e->>'data', e->>'parte_id'), '[]'::jsonb),
           sum((e->>'kg')::numeric)
      INTO v_alvo, v_kg_total
      FROM jsonb_array_elements(public._oc_entregas_snapshot(p_operacao_id)) e;
    IF NOT (coalesce(v_kg_total, 0) > 0) THEN
      RAISE EXCEPTION 'Entregas sem peso: o desconto rateia pelo kg de cada entrega' USING ERRCODE = 'P0001'; END IF;
    v_rateio := public._oc_ratear_por_kg(v_valor, v_alvo);
    SELECT count(*) INTO v_n FROM jsonb_array_elements(v_rateio) x WHERE (x->>'valor')::numeric > 0;
    v_grupo := gen_random_uuid(); v_i := 0;
    FOR r_e IN
      SELECT (t.x->>'valor')::numeric AS valor, f.data_competencia AS data, f.fazenda_id
        FROM jsonb_array_elements(v_rateio) WITH ORDINALITY AS t(x, ord)
        JOIN public.zoo_operacao_partes pt ON pt.id = (t.x->>'id')::uuid
        JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
       WHERE (t.x->>'valor')::numeric > 0
       ORDER BY t.ord
    LOOP
      v_i := v_i + 1;
      INSERT INTO public.financeiro_lancamentos_v2 (
        cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
        favorecido_id, conta_bancaria_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
        macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, descricao, created_by, updated_by, safra_id)
      VALUES (
        v_cli, coalesce(r_e.fazenda_id, v_op.fazenda_id), r_e.valor, '-1', v_pc.tipo_operacao, r_e.data, r_e.data, r_e.data,
        to_char(r_e.data, 'YYYY-MM'), v_op.contraparte_id, NULL, 'operacao_comercial', 'oc:explicacao:' || p_tipo, 'realizado',
        v_op.cenario, true, v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, v_pc.id,
        v_rotulo || ' · ' || btrim(p_motivo), v_actor, v_actor, public.fn_safra_sugerida(v_cli, r_e.data, v_pc.escopo_negocio))
      RETURNING id INTO v_tit_i;
      INSERT INTO public.zoo_operacao_partes (
        cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
        descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
        financeiro_lancamento_id, sem_movimentacao_caixa, chave_idempotencia)
      VALUES (v_cli, p_operacao_id, 'explicacao', v_nat, p_tipo, v_i, v_n, r_e.valor, r_e.data, btrim(p_motivo), false,
        v_op.contraparte_id, v_pc.id, v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, v_tit_i, true,
        'explicacao:' || v_grupo || ':' || v_i)
      RETURNING id INTO v_parte_i;
      IF v_i = 1 THEN v_tit := v_tit_i; v_parte := v_parte_i; END IF;
      v_partes := v_partes || jsonb_build_object('parte_id', v_parte_i, 'titulo_id', v_tit_i, 'data', r_e.data, 'valor', r_e.valor);
    END LOOP;
    v_previa := jsonb_build_object('criterio', 'entregas_por_kg', 'partes', v_partes);
$a$, 'expl.ajuste');
  PERFORM pg_temp.recria('oc_explicar_saldo', v);

  ------------------------------------------------------------------------------------------------------------------------------
  -- oc_desfazer_explicacao — restaura o snapshot; recusa lote mudado; desconto em grupo
  ------------------------------------------------------------------------------------------------------------------------------
  SELECT prosrc INTO v FROM pg_proc WHERE proname = 'oc_desfazer_explicacao' AND pronamespace = 'public'::regnamespace;
  IF md5(v) <> 'fd6b5d6a544edb2f3294e3624e1de1cb' THEN RAISE EXCEPTION 'oc_desfazer_explicacao fora do corpo esperado (md5 %)', md5(v); END IF;
  v := pg_temp.troca(v, $a$  v_total numeric; v_novo numeric; v_x jsonb; v_ver int; v_nova int; v_ret jsonb;
$a$, $a$  v_total numeric; v_novo numeric; v_x jsonb; v_ver int; v_nova int; v_ret jsonb;
  v_ev public.zoo_operacao_eventos; r_l record; v_mudou text; v_restaurado jsonb; v_grupo text;
$a$, 1, 'desf.declare');
  v := pg_temp.troca(v, $a$  IF v_pt.componente = 'ajuste_preco' THEN
    -- desfaz o delta: deducao devolve o valor ao lote, acrescimo o retira
$a$, $a$  -- OC-CC-VOLTA-01b — o ajuste gravado com snapshot volta pelo SNAPSHOT, nao por delta
  SELECT * INTO v_ev FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = p_operacao_id AND e.acao = 'explicar_saldo' AND e.detalhes->>'parte_id' = p_parte_id::text
     AND e.detalhes ? 'snapshot_antes'
   ORDER BY e.created_at DESC LIMIT 1;
  IF v_pt.componente = 'ajuste_preco' AND v_ev.id IS NOT NULL THEN
    -- (1) recusa se algum lote mudou depois do ajuste: restaurar por cima de uma edicao posterior a apagaria calada
    SELECT string_agg(format('lote %s (%s)', d->>'ordem', x.dif), '; ' ORDER BY (d->>'ordem')::int) INTO v_mudou
      FROM jsonb_array_elements(v_ev.detalhes->'snapshot_depois'->'lotes') d
      LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = (d->>'lote_id')::uuid
      CROSS JOIN LATERAL (SELECT concat_ws(', ',
          CASE WHEN lo.id IS NULL THEN 'foi excluído' END,
          CASE WHEN lo.id IS NOT NULL AND (public._oc_valor_do_lote(lo.id)->>'total')::numeric IS DISTINCT FROM (d->>'total')::numeric
               THEN format('valor %s → %s', translate(to_char((d->>'total')::numeric, 'FM999,999,990.00'), ',.', '.,'),
                           translate(to_char((public._oc_valor_do_lote(lo.id)->>'total')::numeric, 'FM999,999,990.00'), ',.', '.,')) END,
          CASE WHEN lo.id IS NOT NULL AND lo.qtd_negociada IS DISTINCT FROM (d->>'qtd')::int
               THEN format('quantidade %s → %s', d->>'qtd', lo.qtd_negociada) END,
          CASE WHEN lo.id IS NOT NULL AND lo.peso_medio_negociado_kg IS DISTINCT FROM (d->>'peso')::numeric
               THEN format('peso médio %s → %s kg', d->>'peso', lo.peso_medio_negociado_kg) END,
          CASE WHEN lo.id IS NOT NULL AND lo.categoria_negociada IS DISTINCT FROM d->>'categoria'
               THEN format('categoria %s → %s', d->>'categoria', lo.categoria_negociada) END) AS dif) x
     WHERE x.dif <> '';
    IF v_mudou IS NOT NULL THEN
      RAISE EXCEPTION 'Não dá para desfazer este ajuste de preço: % mudou depois dele. Desfazer devolveria valores que já não são os do ajuste; corrija o lote pela Negociação.', v_mudou
        USING ERRCODE = 'P0001'; END IF;
    -- (2) cada lote volta ao total de antes (revalorar leva compromisso aberto e valor acordado junto) e ao CRITERIO de antes
    v_ver := v_op.versao;
    FOR r_l IN SELECT (d->>'lote_id')::uuid AS lote_id, (d->>'total')::numeric AS total, d->>'criterio_valor' AS criterio,
                      (d->>'valor_informado')::numeric AS vi
                 FROM jsonb_array_elements(v_ev.detalhes->'snapshot_antes'->'lotes') d LOOP
      v_x := public.oc_revalorar_lote(p_operacao_id, v_op.cliente_id, v_ver, r_l.lote_id, r_l.total,
                                      'Desfazer ajuste de preço: ' || btrim(p_motivo));
      v_ver := (v_x->>'operacao_versao')::int;
      UPDATE public.zoo_operacao_lotes SET criterio_valor = r_l.criterio, valor_informado = r_l.vi, updated_at = now(), updated_by = v_actor
       WHERE id = r_l.lote_id AND (criterio_valor IS DISTINCT FROM r_l.criterio OR valor_informado IS DISTINCT FROM r_l.vi);
    END LOOP;
    -- (3) os lancamentos do rebanho voltam ao valor exato de antes (revalorar os recalcula por cabeca)
    UPDATE public.lancamentos l SET valor_total = (s->>'valor_total')::numeric
      FROM jsonb_array_elements(v_ev.detalhes->'snapshot_antes'->'lancamentos') s
     WHERE l.id = (s->>'id')::uuid AND l.cancelado IS NOT TRUE AND l.valor_total IS DISTINCT FROM (s->>'valor_total')::numeric;
    -- (4) as entregas pelo unico escritor delas
    v_x := public.oc_sincronizar_entregas(p_operacao_id, v_ver, false);
    SELECT sum((d->>'total')::numeric) INTO v_total FROM jsonb_array_elements(v_ev.detalhes->'snapshot_depois'->'lotes') d;
    SELECT sum((d->>'total')::numeric) INTO v_novo FROM jsonb_array_elements(v_ev.detalhes->'snapshot_antes'->'lotes') d;
    v_restaurado := public._oc_entregas_snapshot(p_operacao_id);
  ELSIF v_pt.componente = 'ajuste_preco' THEN
    -- ajuste gravado antes do OC-CC-VOLTA-01b (sem snapshot): desfaz o delta: deducao devolve o valor ao lote, acrescimo o retira
$a$, 1, 'desf.ajuste');
  v := pg_temp.troca(v, $a$  ELSIF v_pt.financeiro_lancamento_id IS NOT NULL THEN
$a$, $a$  ELSIF v_pt.chave_idempotencia LIKE 'explicacao:%' THEN
    -- OC-CC-VOLTA-01b — desconto rateado por entrega: um gesto desfaz o GRUPO inteiro (titulos sem caixa e partes)
    v_grupo := split_part(v_pt.chave_idempotencia, ':', 2);
    UPDATE public.financeiro_lancamentos_v2 f
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = btrim(p_motivo),
           updated_at = now(), updated_by = v_actor
      FROM public.zoo_operacao_partes g
     WHERE g.operacao_id = p_operacao_id AND g.cancelada = false AND g.chave_idempotencia LIKE 'explicacao:' || v_grupo || ':%'
       AND f.id = g.financeiro_lancamento_id AND f.cancelado IS NOT TRUE;
    UPDATE public.zoo_operacao_partes
       SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = btrim(p_motivo), updated_at = now()
     WHERE operacao_id = p_operacao_id AND cancelada = false AND chave_idempotencia LIKE 'explicacao:' || v_grupo || ':%'
       AND id <> p_parte_id;
  ELSIF v_pt.financeiro_lancamento_id IS NOT NULL THEN
$a$, 1, 'desf.grupo');
  v := pg_temp.troca(v, $a$      'titulo_id', v_pt.financeiro_lancamento_id, 'lote_total_anterior', v_total, 'lote_total_novo', v_novo,
$a$, $a$      'titulo_id', v_pt.financeiro_lancamento_id, 'lote_total_anterior', v_total, 'lote_total_novo', v_novo,
      'restaurou_snapshot', (v_ev.id IS NOT NULL AND v_pt.componente = 'ajuste_preco'), 'evento_ajuste_id', v_ev.id,
      'entregas_restauradas', v_restaurado, 'grupo', v_grupo,
$a$, 1, 'desf.evento');
  PERFORM pg_temp.recria('oc_desfazer_explicacao', v);

  ------------------------------------------------------------------------------------------------------------------------------
  -- oc_conta_corrente — o grupo do desconto e' uma explicacao so' no dialogo
  ------------------------------------------------------------------------------------------------------------------------------
  SELECT prosrc INTO v FROM pg_proc WHERE proname = 'oc_conta_corrente' AND pronamespace = 'public'::regnamespace;
  IF md5(v) <> '21e1020399f1b9308f1a770282af9703' THEN RAISE EXCEPTION 'oc_conta_corrente fora do corpo esperado (md5 %)', md5(v); END IF;
  v := pg_temp.troca(v, $a$    'explicacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'parte_id', a.parte_id, 'tipo', a.subtipo, 'lote_ordem', a.lote_ordem, 'conta_ordem', pc.ordem_exibicao,
        'conta', pc.subcentro, 'motivo', a.motivo, 'valor', a.intencao * op.s, 'status', a.status)
        ORDER BY a.data, a.parte_id)
      FROM acum a LEFT JOIN public.financeiro_plano_contas pc ON pc.id = a.plano_conta_id
      WHERE a.tipo = 'explicacao'), '[]'::jsonb))
$a$, $a$    'explicacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'parte_id', g.parte_id, 'tipo', g.subtipo, 'lote_ordem', g.lote_ordem, 'conta_ordem', g.conta_ordem,
        'conta', g.conta, 'motivo', g.motivo, 'valor', g.intencao * op.s, 'status', g.status)
        ORDER BY g.data, g.parte_id)
      FROM (
        -- OC-CC-VOLTA-01b: as partes de um grupo `explicacao:<grupo>:<n>` (desconto rateado por entrega) sao UMA explicacao
        SELECT (array_agg(a.parte_id ORDER BY a.data, a.parte_id))[1] AS parte_id, min(a.subtipo) AS subtipo,
               min(a.lote_ordem) AS lote_ordem, min(pc.ordem_exibicao) AS conta_ordem, min(pc.subcentro) AS conta,
               min(a.motivo) AS motivo, sum(a.intencao) AS intencao, min(a.status) AS status, min(a.data) AS data
          FROM acum a LEFT JOIN public.financeiro_plano_contas pc ON pc.id = a.plano_conta_id
          LEFT JOIN public.zoo_operacao_partes gp ON gp.id = a.parte_id
         WHERE a.tipo = 'explicacao'
         GROUP BY coalesce(CASE WHEN gp.chave_idempotencia LIKE 'explicacao:%' THEN split_part(gp.chave_idempotencia, ':', 2) END,
                           a.parte_id::text)) g), '[]'::jsonb))
$a$, 1, 'cc.explicacoes');
  PERFORM pg_temp.recria('oc_conta_corrente', v);

  ------------------------------------------------------------------------------------------------------------------------------
  -- oc_salvar_lotes — ressincroniza as entregas da conta corrente
  ------------------------------------------------------------------------------------------------------------------------------
  SELECT prosrc INTO v FROM pg_proc WHERE proname = 'oc_salvar_lotes' AND pronamespace = 'public'::regnamespace;
  IF md5(v) <> 'eac052cdb984db75d9828f605e6b825d' THEN RAISE EXCEPTION 'oc_salvar_lotes fora do corpo esperado (md5 %)', md5(v); END IF;
  v := pg_temp.troca(v, $a$  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
$a$, $a$  /* OC-CC-VOLTA-01b (regra 8) — SALVAR OS LOTES RESSINCRONIZA AS ENTREGAS da conta corrente: sem isto o lote dizia 66.500 e a
     entrega 36.500 (b74cfd38) ate' alguem clicar "Atualizar entregas". So' quando ja' ha' entrega viva e a OC nao ficou em rascunho;
     o escritor segue sendo `oc_sincronizar_entregas`, e a versao devolvida e' a final. */
  IF v_op.modelo_financeiro = 'conta_corrente' AND v_op.tipo_operacao IN ('venda', 'compra')
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_boitel b WHERE b.operacao_id = p_operacao_id)
     AND EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                  WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'entrega' AND pt.cancelada = false)
     AND NOT (SELECT o.rascunho FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id) THEN
    PERFORM public.oc_sincronizar_entregas(p_operacao_id, v_op.versao + 1, false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id,
                            'versao', (SELECT o.versao FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id),
$a$, 1, 'lotes.retorno');
  PERFORM pg_temp.recria('oc_salvar_lotes', v);

  ------------------------------------------------------------------------------------------------------------------------------
  -- os corpos resultantes, todos de uma vez
  ------------------------------------------------------------------------------------------------------------------------------
  FOR k IN SELECT jsonb_object_keys(c_md5_depois) LOOP
    SELECT prosrc INTO v FROM pg_proc WHERE proname = k AND pronamespace = 'public'::regnamespace;
    IF md5(v) <> c_md5_depois->>k THEN v_err := v_err || format(' %s=%s', k, md5(v)); END IF;
  END LOOP;
  IF v_err <> '' THEN RAISE EXCEPTION 'corpos resultantes inesperados:%', v_err; END IF;
END $mig$;

-- As SECURITY DEFINER recriadas mantem a ACL (CREATE OR REPLACE nao a toca); reafirmada. Helpers novos: so' de dentro das RPCs.
REVOKE ALL ON FUNCTION public.oc_sincronizar_entregas(uuid, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_explicar_saldo(uuid, integer, text, numeric, uuid, uuid, text, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_desfazer_explicacao(uuid, integer, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_conta_corrente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_sincronizar_entregas(uuid, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_explicar_saldo(uuid, integer, text, numeric, uuid, uuid, text, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_desfazer_explicacao(uuid, integer, uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_conta_corrente(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._oc_ratear_por_kg(numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_entregas_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_ratear_por_kg(numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._oc_entregas_snapshot(uuid) TO service_role;
