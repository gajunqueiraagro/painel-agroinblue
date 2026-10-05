-- OC-VINCULAR-CANDIDATAS-01 — nada some da lista de candidatas sem motivo (Gabriel, 05/10/2026).
--
-- REGRA DA CASA: item que nao vale fica apagado com o motivo, nunca some; o sistema explica, o operador decide.
-- NASCE DO QUINTO DEFEITO DO DIA: o lancamento 65723b49 (Faz. Sta. Tereza) nao listava a OC a2df4ec1 (Faz. Sta. Maria), porque
--   `oc_candidatas_vinculo` filtrava `o.fazenda_id = v_l.fazenda_id`. Medido no OC-VINCULAR-INVENTARIO-01: 82 lancamentos avulsos
--   de 2026 com OC escondida pela fazenda (8 com a lista vazia so' por isso) e 304 com OC entre 61 e 90 dias (15 com a lista vazia).
--
-- ESTADO ANTERIOR (md5 do prosrc)
--   oc_candidatas_vinculo(uuid, integer)        70231c3021c1fb252836148a96673339   (leitura, INVOKER, STABLE)
--   oc_vincular_lancamento(...)                 4bc44efe56c07f47cc49e783eb3fbdde
--   _oc_vincular_recebimento(...)               3dc561975c337a2e446aff7256da782e
--   _oc_vinculo_compromisso_liquidado(uuid)     565d6aefdc66777d84f8d1883b24f6ef
--
-- O QUE MUDA
--   CANDIDATAS (o dono do que aparece e com que marca; a tela so' desenha):
--     · OUTRA FAZENDA deixa de ser filtro: a OC vem com `outra_fazenda` (as duas tem fazenda e nao e' a mesma);
--     · RASCUNHO deixa de ser filtro: vem com `rascunho` (a tela a desenha apagada, com o motivo);
--     · JANELA: entre `janela_dias` (60) e `limite_dias` (180) a OC vem com `fora_da_janela`; acima do limite, so' a contagem
--       `fora_do_limite`. Os dois numeros vao no retorno;
--     · OUTRO TIPO continua fora, mas contado: `outro_tipo {qtd, tipos}`;
--     · ORDEM: dentro da janela antes de fora; rascunho depois das que se pode escolher; mesma fazenda antes de outra; em cada grupo a de sempre (valor exato, pista da
--       descricao, distancia). Quem ja' aparecia continua na mesma ordem relativa, no topo;
--     · cancelada e de teste: fora, como antes.
--   COMPROMISSO LIQUIDADO (`_oc_vinculo_compromisso_liquidado`, um dono para a lista e para o vincular): com varias parcelas
--     TODAS pagas ele passa a contar como liquidado. Com zero ou uma parcela, o resultado de antes.
--   VINCULAR (`oc_vincular_lancamento` e `_oc_vincular_recebimento`): UMA ancora cada — o aviso `fazenda_diferente` gravado na
--     trilha quando a OC e o lancamento sao de fazendas diferentes. Nenhum dos dois recusava nem alterava a fazenda; continua assim.
--   NAO MUDA: assinaturas, retornos (jsonb, so' chaves a mais), linguagem, volatilidade, SECURITY, search_path e ACL.
--
-- PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); o corpo novo entra pela definicao de hoje (`pg_get_functiondef`).
--   destino: candidatas 05cbc9b2485d6399268baa106937d3fb · vincular d72b7db7bdef3626109346f44805fb56 · recebimento 76003144369c398fe230535b6f513910

-- ── o compromisso LIQUIDADO (um dono, lido pelo vincular e pela lista de candidatas) ──
-- Antes: "no maximo UMA parcela viva, e paga". Com varias parcelas TODAS pagas ele contava como livre: a lista o oferecia e o
-- vincular perguntava "qual parcela?" sem que nenhuma aceitasse. Agora: tem parcela viva e TODAS estao pagas. Com zero ou uma
-- parcela o resultado e' o de antes.
CREATE OR REPLACE FUNCTION public._oc_vinculo_compromisso_liquidado(p_compromisso_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH pp AS (
    SELECT pp.id
      FROM public.zoo_operacao_programacoes pr
      JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id AND pp.status <> 'cancelada'
     WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
  )
  SELECT (SELECT count(*) FROM pp) >= 1
     AND NOT EXISTS (
       SELECT 1 FROM pp
        WHERE NOT EXISTS (
         SELECT 1
           FROM public.zoo_operacao_partes pa
           JOIN public.financeiro_lancamentos_v2 f ON f.id = pa.financeiro_lancamento_id
          WHERE pa.programacao_parcela_id = pp.id AND pa.cancelada = false
            AND f.cancelado IS NOT TRUE
            AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL
                 OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL)
                 OR EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq WHERE lq.financeiro_lancamento_id = f.id AND lq.estornado IS NOT TRUE))));
$function$;

DO $pc$
DECLARE
  v_oid oid; v_src text; v_novo text; v_def text; v_a text; v_b text;
BEGIN
  SELECT p.oid, p.prosrc, pg_get_functiondef(p.oid) INTO v_oid, v_src, v_def FROM pg_proc p
   WHERE p.proname = 'oc_candidatas_vinculo' AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) <> '70231c3021c1fb252836148a96673339' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pca1$  v_cab jsonb; v_cands jsonb;
BEGIN
$pca1$;
  v_b := $pcb1$  v_cab jsonb; v_cands jsonb;
  -- OC-VINCULAR-CANDIDATAS-01: nada some da lista sem motivo
  c_limite constant integer := 180;   -- alem da janela, a OC ainda aparece (marcada) ate' aqui; depois, so' a contagem
  v_fora_limite integer; v_outro jsonb;
BEGIN
$pcb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 2
  v_a := $pca2$           (o.fazenda_id IS NOT DISTINCT FROM v_l.fazenda_id) AS mesma_faz,
$pca2$;
  v_b := $pcb2$           (o.fazenda_id IS NOT DISTINCT FROM v_l.fazenda_id) AS mesma_faz,
           -- OUTRA FAZENDA: a OC e o lancamento tem fazenda, e nao e' a mesma (o que o filtro antigo tirava da lista)
           NOT (o.fazenda_id IS NULL OR v_l.fazenda_id IS NULL OR o.fazenda_id = v_l.fazenda_id) AS outra_faz,
$pcb2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 3
  v_a := $pca3$       AND o.rascunho IS NOT TRUE
       AND o.cancelado_em IS NULL AND o.status_comercial <> 'cancelada'
       AND o.is_teste IS NOT TRUE
       AND (o.fazenda_id IS NULL OR v_l.fazenda_id IS NULL OR o.fazenda_id = v_l.fazenda_id)
  ),
  filtradas AS (SELECT * FROM ocs WHERE dist <= p_janela_dias),
$pca3$;
  v_b := $pcb3$       -- OC-VINCULAR-CANDIDATAS-01: RASCUNHO e OUTRA FAZENDA deixaram de ser filtro — viram MARCA no retorno (`rascunho`,
       -- `outra_fazenda`); a tela desenha a de rascunho apagada com o motivo e a de outra fazenda com o selo. Cancelada e
       -- de teste continuam fora.
       AND o.cancelado_em IS NULL AND o.status_comercial <> 'cancelada'
       AND o.is_teste IS NOT TRUE
  ),
  -- a JANELA (p_janela_dias) deixou de cortar: entre ela e o limite a OC vem marcada `fora_da_janela`; acima do limite, so' conta
  filtradas AS (SELECT * FROM ocs WHERE dist <= c_limite),
$pcb3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 4
  v_a := $pca4$             'acao_prevista', CASE WHEN p.n_parcelas > 1 THEN 'escolher_parcela'
                                   WHEN p.liquidado THEN 'recusar'$pca4$;
  v_b := $pcb4$             -- o compromisso LIQUIDADO tem um dono, o mesmo do vincular (`_oc_vinculo_compromisso_liquidado`): com varias
             -- parcelas TODAS pagas ele nao e' "escolher parcela" — nao ha' parcela que aceite.
             -- `diferenca_parcelas` = valor do compromisso − soma das parcelas vivas, ao centavo (nulo sem parcela; 0 quando bate);
             -- `pagas_com_diferenca` = todas pagas e a diferenca nao e' zero (R$ 0,01 ja' conta): nao e' "liquidado".
             'diferenca_parcelas', dp.dif, 'pagas_com_diferenca', dp.liq AND dp.dif <> 0,
             'acao_prevista', CASE WHEN dp.liq THEN 'recusar'
                                   WHEN p.n_parcelas > 1 THEN 'escolher_parcela'
                                   WHEN p.liquidado THEN 'recusar'$pcb4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 5
  v_a := $pca5$                            AND NOT (coalesce(p.n_parcelas, 0) <= 1 AND p.liquidado)), false) AS valor_exato,
           coalesce(bool_and(coalesce(p.n_parcelas, 0) <= 1 AND p.liquidado), false) AS todos_liquidados
      FROM public.zoo_operacao_compromissos c
      JOIN parc p ON p.compromisso_id = c.id
     GROUP BY c.operacao_id$pca5$;
  v_b := $pcb5$                            AND NOT dp.liq), false) AS valor_exato,
           -- "todos liquidados" SO' com diferenca ZERO em todos; todos pagos com alguma diferenca e' a marca propria, com o valor
           coalesce(bool_and(dp.liq) AND NOT bool_or(dp.liq AND dp.dif <> 0), false) AS todos_liquidados,
           coalesce(bool_and(dp.liq) AND bool_or(dp.liq AND dp.dif <> 0), false) AS pagas_com_dif,
           coalesce(sum(dp.dif) FILTER (WHERE dp.liq), 0) AS dif_parcelas
      FROM public.zoo_operacao_compromissos c
      JOIN parc p ON p.compromisso_id = c.id
      LEFT JOIN LATERAL (
        SELECT public._oc_vinculo_compromisso_liquidado(c.id) AS liq,
               -- AO CENTAVO: dinheiro nao tem fracao de centavo (ha' compromisso gravado com fracao: 6cf548a1, -0,000009)
               (SELECT round(c.valor_total - sum(pp2.valor), 2)
                  FROM public.zoo_operacao_programacoes pr2
                  JOIN public.zoo_operacao_parcelas_programacao pp2 ON pp2.programacao_id = pr2.id AND pp2.status <> 'cancelada'
                 WHERE pr2.compromisso_id = c.id AND pr2.status = 'ativa') AS dif
      ) dp ON true
     GROUP BY c.operacao_id$pcb5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 6
  v_a := $pca6$           'todos_liquidados', coalesce(cp.todos_liquidados, false),
$pca6$;
  v_b := $pcb6$           'todos_liquidados', coalesce(cp.todos_liquidados, false),
           'pagas_com_diferenca', coalesce(cp.pagas_com_dif, false), 'diferenca_parcelas', coalesce(cp.dif_parcelas, 0),
$pcb6$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 6 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 7
  v_a := $pca7$           'qtd', f.qtd_cab, 'eh_boitel', f.eh_boitel,
$pca7$;
  v_b := $pcb7$           'qtd', f.qtd_cab, 'eh_boitel', f.eh_boitel,
           'outra_fazenda', f.outra_faz, 'fora_da_janela', f.dist > p_janela_dias, 'rascunho', coalesce(f.rascunho, false),
$pcb7$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 7 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 8
  v_a := $pca8$         ORDER BY coalesce(cp.valor_exato, false) DESC,
$pca8$;
  v_b := $pcb8$         -- A ORDEM: dentro da janela antes de fora; a que se pode escolher antes da de rascunho; mesma fazenda antes de
         -- outra; e, em cada grupo, a de sempre — valor exato, pista da descricao, distancia. Quem ja' aparecia continua na
         -- MESMA ordem relativa, e no topo.
         ORDER BY (f.dist > p_janela_dias), coalesce(f.rascunho, false), f.outra_faz, coalesce(cp.valor_exato, false) DESC,
$pcb8$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 8 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 9
  v_a := $pca9$    INTO v_cands
    FROM filtradas f
$pca9$;
  v_b := $pcb9$    , (SELECT count(*) FROM ocs x WHERE x.dist > c_limite)
    INTO v_cands, v_fora_limite
    FROM filtradas f
$pcb9$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 9 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 10
  v_a := $pca10$  RETURN jsonb_build_object(
    'elegivel', true, 'lancamento', v_cab,
$pca10$;
  v_b := $pcb10$  -- OUTRO TIPO: OCs vivas do cliente, perto destas datas, de um tipo que o subcentro do lancamento NAO aceita mas que tem
  -- subcentro proprio da mesma natureza e direcao (recebimento em subcentro de venda x OC de abate). Continuam fora da lista; a
  -- tela diz quantas sao.
  SELECT jsonb_build_object('qtd', count(*), 'tipos', coalesce(jsonb_agg(DISTINCT o.tipo_operacao), '[]'::jsonb)) INTO v_outro
    FROM public.zoo_operacoes_comerciais o
   WHERE o.cliente_id = v_l.cliente_id AND o.rascunho IS NOT TRUE AND o.cancelado_em IS NULL
     AND o.status_comercial <> 'cancelada' AND o.is_teste IS NOT TRUE
     AND v_regra.natureza = 'principal'   -- so' o principal: na despesa "outro tipo" seria toda compra do periodo (ruido medido: 190 de 318)
     AND NOT (o.tipo_operacao = ANY (v_regra.tipos_oc))
     AND o.tipo_operacao IN (SELECT unnest(m.tipos_oc) FROM public._oc_vinculo_mapa() m
                              WHERE m.natureza = v_regra.natureza AND m.tipo_operacao = v_regra.tipo_operacao)
     AND least(abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - v_l.data_competencia),
               abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - coalesce(v_l.data_pagamento, v_l.data_competencia))) <= p_janela_dias;

  RETURN jsonb_build_object(
    'elegivel', true, 'lancamento', v_cab,
$pcb10$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 10 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 11
  v_a := $pca11$    'componente_sugerido', v_sug, 'janela_dias', p_janela_dias,
$pca11$;
  v_b := $pcb11$    'componente_sugerido', v_sug, 'janela_dias', p_janela_dias,
    'limite_dias', c_limite, 'fora_do_limite', coalesce(v_fora_limite, 0), 'outro_tipo', v_outro,
$pcb11$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo, ancora 11 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '05cbc9b2485d6399268baa106937d3fb' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  -- a definicao inteira (assinatura, linguagem, volatilidade, SECURITY, search_path) e' a de hoje: so' o corpo troca
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_candidatas_vinculo: corpo nao localizado na definicao'; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $pc$;

DO $pv$
DECLARE
  v_oid oid; v_src text; v_novo text; v_def text; v_a text; v_b text;
BEGIN
  SELECT p.oid, p.prosrc, pg_get_functiondef(p.oid) INTO v_oid, v_src, v_def FROM pg_proc p
   WHERE p.proname = 'oc_vincular_lancamento' AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) <> '4bc44efe56c07f47cc49e783eb3fbdde' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_vincular_lancamento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pva1$  v_lado := CASE WHEN v_l.tipo_operacao LIKE '1-%' THEN 'receber' ELSE 'pagar' END;
$pva1$;
  v_b := $pvb1$  v_lado := CASE WHEN v_l.tipo_operacao LIKE '1-%' THEN 'receber' ELSE 'pagar' END;
  -- OC-VINCULAR-CANDIDATAS-01: OC de OUTRA FAZENDA vincula (a lista a oferece, marcada); o vinculo NAO muda a fazenda do
  -- lancamento, e a trilha diz que as duas diferem.
  IF v_op.fazenda_id IS NOT NULL AND v_l.fazenda_id IS NOT NULL AND v_op.fazenda_id <> v_l.fazenda_id THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'fazenda_diferente',
      'operacao_fazenda_id', v_op.fazenda_id, 'operacao_fazenda', (SELECT fz.nome FROM public.fazendas fz WHERE fz.id = v_op.fazenda_id),
      'lancamento_fazenda_id', v_l.fazenda_id, 'lancamento_fazenda', (SELECT fz.nome FROM public.fazendas fz WHERE fz.id = v_l.fazenda_id)));
  END IF;
$pvb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_vincular_lancamento, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> 'd72b7db7bdef3626109346f44805fb56' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_vincular_lancamento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  -- a definicao inteira (assinatura, linguagem, volatilidade, SECURITY, search_path) e' a de hoje: so' o corpo troca
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: oc_vincular_lancamento: corpo nao localizado na definicao'; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $pv$;

DO $pr$
DECLARE
  v_oid oid; v_src text; v_novo text; v_def text; v_a text; v_b text;
BEGIN
  SELECT p.oid, p.prosrc, pg_get_functiondef(p.oid) INTO v_oid, v_src, v_def FROM pg_proc p
   WHERE p.proname = '_oc_vincular_recebimento' AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) <> '3dc561975c337a2e446aff7256da782e' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: _oc_vincular_recebimento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pra1$                  'operacao', v_op.contraparte_id, 'lancamento', v_l.favorecido_id);
  END IF;
$pra1$;
  v_b := $prb1$                  'operacao', v_op.contraparte_id, 'lancamento', v_l.favorecido_id);
  END IF;
  -- OC-VINCULAR-CANDIDATAS-01: OC de outra fazenda — o vinculo nao muda a fazenda do lancamento; a trilha diz que diferem
  IF v_op.fazenda_id IS NOT NULL AND v_l.fazenda_id IS NOT NULL AND v_op.fazenda_id <> v_l.fazenda_id THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'fazenda_diferente',
      'operacao_fazenda_id', v_op.fazenda_id, 'operacao_fazenda', (SELECT fz.nome FROM public.fazendas fz WHERE fz.id = v_op.fazenda_id),
      'lancamento_fazenda_id', v_l.fazenda_id, 'lancamento_fazenda', (SELECT fz.nome FROM public.fazendas fz WHERE fz.id = v_l.fazenda_id)));
  END IF;
$prb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: _oc_vincular_recebimento, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '76003144369c398fe230535b6f513910' THEN
    RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: _oc_vincular_recebimento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  -- a definicao inteira (assinatura, linguagem, volatilidade, SECURITY, search_path) e' a de hoje: so' o corpo troca
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: _oc_vincular_recebimento: corpo nao localizado na definicao'; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $pr$;

-- ── conferencia ──
DO $conf$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid, p.proname, md5(p.prosrc) m, p.prosecdef, p.provolatile FROM pg_proc p
            WHERE p.proname IN ('oc_candidatas_vinculo', 'oc_vincular_lancamento', '_oc_vincular_recebimento', '_oc_vinculo_compromisso_liquidado') LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (r.proname <> '_oc_vincular_recebimento')
       OR r.prosecdef <> (r.proname IN ('oc_vincular_lancamento', '_oc_vincular_recebimento'))
       OR (r.proname = 'oc_candidatas_vinculo' AND (r.m <> '05cbc9b2485d6399268baa106937d3fb' OR r.provolatile <> 's'))
       OR (r.proname = 'oc_vincular_lancamento' AND r.m <> 'd72b7db7bdef3626109346f44805fb56')
       OR (r.proname = '_oc_vincular_recebimento' AND r.m <> '76003144369c398fe230535b6f513910') THEN
      RAISE EXCEPTION 'OC-VINCULAR-CANDIDATAS-01: % fora do esperado (md5 %)', r.proname, r.m; END IF;
  END LOOP;
END $conf$;
