-- OC-VINCULAR-RECEBIMENTO-PARCIAL-01 — recebimento MENOR que a parcela nao encolhe o compromisso (Gabriel, 05/10/2026).
--
-- REGRAS DO GABRIEL (05/10): nunca arredondar, nunca engolir diferenca de qualquer tamanho (R$ 35,00 conta); o financeiro e'
--   soberano (recebimento pago nao muda de valor, pagamento nem conciliacao); mes fechado nao bloqueia ajuste de OC: avisa e
--   registra; o sistema explica, o operador decide; todo gesto nasce com o gesto contrario.
--
-- O DEFEITO (medido em 05/10/2026: 5 eventos `ajustar_valor_compromisso` com origem 'vinculo de lancamento', todos do Agnaldo)
--   `oc_vincular_lancamento`, parcela com titulo programado e valor diferente do recebimento: cancelava o titulo e a parte,
--   gravava o valor do recebimento na parcela e levava o compromisso para a soma das parcelas. 294.595 virou 200.000
--   (f74f95e5), 17.435 virou 17.400 (da9c27ee), 315.000 virou 298.000 (a2df4ec1). A `vw_oc_operacao_liquidacao` (base =
--   compromissos do lado) passava a dizer "quitada" com dinheiro faltando. E o `oc_desvincular_lancamento` encolhia de novo na
--   volta (a2df4ec1: 298.000 -> 50.000).
--
-- ESTADO ANTERIOR
--   oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)  md5(prosrc) = 0fd703b66307ad1bebfbc7dab53c668f
--   oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)                    md5(prosrc) = 6cbc7e2a1c3b9a3e2563d87085184d74
--
-- O QUE MUDA (so' corpos de funcao; nenhuma tabela, nenhum indice, nenhuma view, nenhum dado)
--   VINCULAR, recebimento V numa parcela de valor P (o saldo que ela representa):
--     V = P  -> como antes (o titulo programado e' substituido pelo recebimento; o compromisso fica igual).
--     V < P  -> NOVO: o compromisso MANTEM o valor; o recebimento ocupa a parcela (V); o saldo P − V (exato) vai para uma
--               parcela SEGUINTE com o mesmo vencimento, e o titulo programado e' REDUZIDO a P − V (mesmo id), nao cancelado.
--               Nenhum evento `ajustar_valor_compromisso`. Parcela ainda sem titulo: o saldo nasce 'prevista'.
--               O retorno ganha `parcial {lado, recebido, de, saldo, parcela_saldo{...}}` e a trilha guarda o mesmo.
--     V > P  -> NAO MUDA (o compromisso sobe para a soma), mas deixa de ser silencioso: aviso `recebido_acima_do_saldo`
--               {recebido, saldo, diferenca, compromisso_de, compromisso_para}. Os gestos de ajuste sao do PR seguinte.
--     Qualquer reducao que reste (parte sem titulo vivo) avisa `compromisso_reduzido`. Mes do rebanho fechado (P1 oficial no
--     mes para onde a competencia vai): aviso `mes_fechado`, gravado na trilha; nao bloqueia.
--     Compromisso que ja' existia EM ABERTO (sem parcela para o recebimento): o saldo dele e' valor − parcelas vivas; recebimento
--     menor cria a parcela do recebimento e deixa o resto numa parcela 'prevista' (sem titulo) — antes o compromisso encolhia.
--     Com varias parcelas vivas e UMA so' em aberto, o vinculo a escolhe sem perguntar (o segundo recebimento cai no saldo).
--     A trilha do vinculo guarda `parcela_valor_antes` e `parcela_status_antes`, para a volta.
--   DESVINCULAR = A VOLTA DO VINCULO (a OC volta ao estado de ANTES dele, lido da trilha do proprio vinculo):
--     item CRIADO pelo vinculo  -> como antes (a parcela sai; o que o vinculo criou e' cancelado).
--     SUBSTITUIU titulo programado -> o titulo e a parte dele sao REATIVADOS — o MESMO registro (so' se segue cancelado e sem
--       outra parte viva; senao a parcela volta a 'prevista', de onde se lanca de novo pela tela: recriar o titulo aqui seria um
--       segundo escritor de titulo de OC, cujo dono e' `oc_materializar_parcela`); a parcela volta ao valor de antes; o
--       compromisso NAO muda — salvo quando o proprio vinculo o tinha ajustado (recebido a mais): volta ao valor de antes, e so'
--       se ninguem mexeu nele depois. Antes: a parcela era cancelada e o compromisso cancelado ou reduzido (a2df4ec1: 298.000 ->
--       50.000; e ate' o vinculo de valor EXATO, desfeito, cancelava o compromisso inteiro).
--     PREENCHEU parcela prevista  -> ela volta a 'prevista' com o valor de antes.
--     parcela criada em compromisso que ja' existia -> a parcela sai, a programacao que o vinculo criou sai, o compromisso FICA
--       (valor e status de antes: 'aberto').
--     vinculo PARCIAL -> o valor volta ao saldo: (a) saldo intacto: o titulo volta ao valor cheio, a parte volta a' parcela de
--       origem e a parcela do saldo some; (b) saldo ja' consumido mas ha' outro em aberto: soma nele; (c) sem saldo em aberto:
--       a parcela volta a 'prevista'. Retorno e trilha ganham `devolucao_ao_saldo {modo, valor, saldo_de, saldo_para, titulo_id}`.
--     SEMPRE: `quantidade_parcelas` das partes ativas que ficam no grupo e' recalculada (fecha OC-DESVINCULAR-RENUMERA-01).
--     NAO MUDA: conta corrente (recebimento sem parcela) segue recusado por aqui — fila do PR 3 do OC-CC-ACOES-LINHA-02.
--   INTERNAS novas (fechadas): `_oc_titulo_em_aberto(uuid)` e `_oc_renumerar_parcelas_do_grupo(uuid)`.
--   NAO MUDA: `vw_oc_operacao_liquidacao` (a base ja' e' o compromisso do lado: com o compromisso inteiro ela passa a dizer
--   'parcial' sozinha); assinatura, retorno (jsonb), SECURITY DEFINER, search_path e ACL das duas RPCs.
--
-- PATCH GUARDADO POR md5 (origem, cada ancora exatamente 1x, destino).
--   md5 de destino: oc_vincular_lancamento 4bc44efe56c07f47cc49e783eb3fbdde · oc_desvincular_lancamento f568e7cbd3e876a0180cf6386d13ccf2

-- ── internas (nascem fechadas: so' postgres e service_role; quem as chama sao as RPCs SECURITY DEFINER do dono) ──
CREATE OR REPLACE FUNCTION public._oc_titulo_em_aberto(p_lancamento_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  -- titulo vivo que ainda e' so' PROMESSA: nao realizado, nao conciliado, sem liquidacao ativa. E' o unico que o vinculo
  -- parcial reduz e o unico a que o desvincular devolve valor — recebimento pago nunca muda de valor.
  SELECT EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 f
     WHERE f.id = p_lancamento_id AND f.cancelado IS NOT TRUE
       AND f.status_transacao NOT IN ('realizado', 'conciliado') AND f.conciliado_em IS NULL AND f.data_pagamento IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq WHERE lq.financeiro_lancamento_id = f.id AND lq.estornado IS NOT TRUE));
$f$;

CREATE OR REPLACE FUNCTION public._oc_renumerar_parcelas_do_grupo(p_parte_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $f$
DECLARE
  r public.zoo_operacao_partes; v_comp uuid; v_n int; v_max int;
BEGIN
  -- O GRUPO de uma parte de programacao: com lote, (operacao, lote, natureza, componente) — o mesmo do indice
  -- `zoo_operacao_partes_identidade_lote`; sem lote, o compromisso dela. A quantidade e' o numero de parcelas que o grupo TEM:
  -- as partes ativas + as parcelas vivas ainda sem parte (saldo 'prevista'). Nunca menor que a maior sequencia ativa (o CHECK
  -- `sequencia_parcela <= quantidade_parcelas`). So' escreve `quantidade_parcelas`; nao toca valor nem sequencia.
  SELECT * INTO r FROM public.zoo_operacao_partes WHERE id = p_parte_id;
  IF NOT FOUND OR r.origem <> 'programacao' OR r.programacao_parcela_id IS NULL THEN RETURN NULL; END IF;
  SELECT pr.compromisso_id INTO v_comp
    FROM public.zoo_operacao_parcelas_programacao pp JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
   WHERE pp.id = r.programacao_parcela_id;
  WITH grupo AS (
    SELECT pt.id, pt.sequencia_parcela
      FROM public.zoo_operacao_partes pt
      JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
      JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
     WHERE pt.operacao_id = r.operacao_id AND pt.cancelada = false AND pt.origem = 'programacao'
       AND pt.natureza = r.natureza AND pt.componente = r.componente
       AND ((r.lote_id IS NOT NULL AND pt.lote_id = r.lote_id) OR (r.lote_id IS NULL AND pr.compromisso_id = v_comp))
  ), soltas AS (
    SELECT pp.id
      FROM public.zoo_operacao_compromissos c
      JOIN public.zoo_operacao_programacoes pr ON pr.compromisso_id = c.id AND pr.status = 'ativa'
      JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id AND pp.status IN ('prevista', 'materializada', 'paga')
     WHERE c.operacao_id = r.operacao_id AND c.status <> 'cancelado' AND c.natureza = r.natureza AND c.componente = r.componente
       AND ((r.lote_id IS NOT NULL AND c.lote_id = r.lote_id) OR (r.lote_id IS NULL AND c.id = v_comp))
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes x WHERE x.programacao_parcela_id = pp.id AND x.cancelada = false)
  )
  SELECT (SELECT count(*) FROM grupo) + (SELECT count(*) FROM soltas), (SELECT coalesce(max(sequencia_parcela), 0) FROM grupo)
    INTO v_n, v_max;
  v_n := greatest(v_n, v_max, 1);
  UPDATE public.zoo_operacao_partes pt SET quantidade_parcelas = v_n, updated_at = now()
   WHERE pt.id IN (
     SELECT pt2.id FROM public.zoo_operacao_partes pt2
       JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt2.programacao_parcela_id
       JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
      WHERE pt2.operacao_id = r.operacao_id AND pt2.cancelada = false AND pt2.origem = 'programacao'
        AND pt2.natureza = r.natureza AND pt2.componente = r.componente
        AND ((r.lote_id IS NOT NULL AND pt2.lote_id = r.lote_id) OR (r.lote_id IS NULL AND pr.compromisso_id = v_comp)))
     AND pt.quantidade_parcelas IS DISTINCT FROM v_n;
  RETURN v_n;
END $f$;

REVOKE ALL ON FUNCTION public._oc_titulo_em_aberto(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_renumerar_parcelas_do_grupo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_titulo_em_aberto(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._oc_renumerar_parcelas_do_grupo(uuid) TO service_role;

DO $pv$
DECLARE
  v_src text; v_novo text; v_a text; v_b text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)'::regprocedure;
  IF md5(v_src) <> '0fd703b66307ad1bebfbc7dab53c668f' THEN
    RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pva1$  v_vinculado numeric; v_recebido numeric; v_restricao text; v_desc_grupo text;
BEGIN
$pva1$;
  v_b := $pvb1$  v_vinculado numeric; v_recebido numeric; v_restricao text; v_desc_grupo text;
  -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01
  v_parc_valor_antes numeric; v_saldo numeric; v_seq_saldo int; v_parc_saldo_id uuid; v_parcial jsonb; v_lado text;
  v_parc_status_antes text;
BEGIN
$pvb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 2
  v_a := $pva2$  ELSE
    IF v_parte_velha.id IS NOT NULL THEN
      IF v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE THEN
$pva2$;
  v_b := $pvb2$  ELSIF round(v_valor, 2) < round(v_parc.valor, 2)
        AND (v_parte_velha.id IS NULL OR (v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE)) THEN
    -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: RECEBIMENTO MENOR QUE A PARCELA. O compromisso MANTEM o valor; o recebimento ocupa a
    -- parcela (valor V) e o SALDO (P − V, exato, sem arredondar) segue numa parcela SEGUINTE com o MESMO vencimento. O titulo
    -- programado da parcela NAO e' cancelado: e' REDUZIDO ao saldo e passa a ser o titulo da parcela do saldo (mesmo id, mesma
    -- classificacao, mesmo vencimento). Parcela ainda sem titulo ('prevista'): o saldo nasce 'prevista', sem titulo.
    -- O lancamento vinculado nao muda de valor, pagamento nem conciliacao.
    v_parc_valor_antes := v_parc.valor;
    v_saldo := v_parc.valor - v_valor;
    SELECT greatest(
             (SELECT coalesce(max(pp.sequencia), 0) FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.programacao_id = v_prog_id),
             (SELECT coalesce(max(pt.sequencia_parcela), 0) FROM public.zoo_operacao_partes pt
               WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false AND pt.natureza = v_natureza
                 AND pt.componente = v_componente AND v_comp.lote_id IS NOT NULL AND pt.lote_id = v_comp.lote_id)) + 1
      INTO v_seq_saldo;
    INSERT INTO public.zoo_operacao_parcelas_programacao
      (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
    VALUES (v_cli, v_prog_id, v_seq_saldo, v_saldo, v_parc.vencimento, v_parc.conta_bancaria_id, v_parc.forma,
            CASE WHEN v_parte_velha.id IS NOT NULL THEN v_parc.status ELSE 'prevista' END)
    RETURNING id INTO v_parc_saldo_id;
    IF v_parte_velha.id IS NOT NULL THEN
      UPDATE public.financeiro_lancamentos_v2
         SET valor = v_saldo, updated_at = now(), updated_by = v_actor
       WHERE id = v_tit_velho.id;
      UPDATE public.zoo_operacao_partes
         SET programacao_parcela_id = v_parc_saldo_id, sequencia_parcela = v_seq_saldo,
             quantidade_parcelas = greatest(quantidade_parcelas, v_seq_saldo), valor = v_saldo, updated_at = now()
       WHERE id = v_parte_velha.id;
    END IF;
    v_parcial := jsonb_build_object(
      'recebido', v_valor, 'de', v_parc_valor_antes, 'saldo', v_saldo,
      'parcela_id', v_parc.id, 'parcela_status_antes', v_parc.status,
      'parcela_saldo_id', v_parc_saldo_id, 'parcela_saldo_sequencia', v_seq_saldo, 'vencimento', v_parc.vencimento,
      'parte_saldo_id', v_parte_velha.id, 'parte_saldo_sequencia_antes', v_parte_velha.sequencia_parcela,
      'parte_saldo_quantidade_antes', v_parte_velha.quantidade_parcelas, 'parte_saldo_valor_antes', v_parte_velha.valor,
      'titulo_saldo_id', v_tit_velho.id, 'titulo_valor_antes', v_tit_velho.valor);
    v_parc_acao := 'parcial';
    UPDATE public.zoo_operacao_parcelas_programacao
       SET valor = v_valor, status = 'materializada', updated_at = now()
     WHERE id = v_parc.id;
  ELSE
    v_parc_valor_antes := v_parc.valor; v_parc_status_antes := v_parc.status;
    IF v_parte_velha.id IS NOT NULL THEN
      IF v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE THEN
$pvb2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 3
  v_a := $pva3$    RETURNING * INTO v_parc;
    v_parc_acao := 'criada';
$pva3$;
  v_b := $pvb3$    RETURNING * INTO v_parc;
    v_parc_acao := 'criada';
    -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: o compromisso JA' EXISTIA (em aberto, sem parcela para este recebimento). O que ele
    -- ainda tinha a receber/pagar e' o SALDO (valor − parcelas vivas); recebimento MENOR deixa o resto numa parcela 'prevista'
    -- (sem titulo), e o compromisso mantem o valor. Igual ou maior: como antes (o aviso diz a diferenca).
    IF v_comp_acao IS NULL THEN
      SELECT v_comp.valor_total - coalesce(sum(pp.valor), 0) INTO v_parc_valor_antes
        FROM public.zoo_operacao_parcelas_programacao pp
       WHERE pp.programacao_id = v_prog_id AND pp.status IN ('prevista', 'materializada', 'paga') AND pp.id <> v_parc.id;
      IF round(v_valor, 2) < round(v_parc_valor_antes, 2) THEN
        v_saldo := v_parc_valor_antes - v_valor;
        SELECT greatest(v_seq,
                 (SELECT coalesce(max(pt.sequencia_parcela), 0) FROM public.zoo_operacao_partes pt
                   WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false AND pt.natureza = v_natureza
                     AND pt.componente = v_componente AND v_comp.lote_id IS NOT NULL AND pt.lote_id = v_comp.lote_id)) + 1
          INTO v_seq_saldo;
        INSERT INTO public.zoo_operacao_parcelas_programacao
          (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
        VALUES (v_cli, v_prog_id, v_seq_saldo, v_saldo, v_parc.vencimento, v_parc.conta_bancaria_id, NULL, 'prevista')
        RETURNING id INTO v_parc_saldo_id;
        v_parcial := jsonb_build_object(
          'recebido', v_valor, 'de', v_parc_valor_antes, 'saldo', v_saldo, 'parcela_criada', true,
          'parcela_id', v_parc.id, 'parcela_saldo_id', v_parc_saldo_id, 'parcela_saldo_sequencia', v_seq_saldo,
          'vencimento', v_parc.vencimento, 'parte_saldo_id', NULL, 'titulo_saldo_id', NULL);
        v_parc_acao := 'parcial';
      END IF;
    END IF;
$pvb3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 4
  v_a := $pva4$        IF v_n > 1 THEN
          SELECT jsonb_agg($pva4$;
  v_b := $pvb4$        -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: com varias parcelas vivas e UMA so' em aberto (as outras ja' recebidas/pagas),
        -- a parcela e' o saldo — escolher entre uma opcao nao e' escolha.
        IF v_n > 1 AND (SELECT count(*) FROM public.zoo_operacao_parcelas_programacao pp
                         WHERE pp.programacao_id = v_prog_id AND pp.status <> 'cancelada'
                           AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pa
                                            WHERE pa.programacao_parcela_id = pp.id AND pa.cancelada = false
                                              AND NOT public._oc_titulo_em_aberto(pa.financeiro_lancamento_id))) = 1 THEN
          SELECT pp.* INTO v_parc FROM public.zoo_operacao_parcelas_programacao pp
           WHERE pp.programacao_id = v_prog_id AND pp.status <> 'cancelada'
             AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pa
                              WHERE pa.programacao_parcela_id = pp.id AND pa.cancelada = false
                                AND NOT public._oc_titulo_em_aberto(pa.financeiro_lancamento_id))
           FOR UPDATE;
        ELSIF v_n > 1 THEN
          SELECT jsonb_agg($pvb4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 5
  v_a := $pva5$  RETURNING id INTO v_parte_id;
$pva5$;
  v_b := $pvb5$  RETURNING id INTO v_parte_id;
  IF v_parcial IS NOT NULL THEN
    v_qtd_parte := public._oc_renumerar_parcelas_do_grupo(v_parte_id);
  END IF;
$pvb5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 6
  v_a := $pva6$  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
$pva6$;
  v_b := $pvb6$  -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: o que o vinculo fez com o valor NUNCA e' silencioso.
  v_lado := CASE WHEN v_l.tipo_operacao LIKE '1-%' THEN 'receber' ELSE 'pagar' END;
  IF v_comp_acao = 'ajustado' THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
      'codigo', CASE WHEN round(v_soma, 2) > round(v_comp_valor_antes, 2) THEN 'recebido_acima_do_saldo' ELSE 'compromisso_reduzido' END,
      'lado', v_lado, 'recebido', v_valor, 'saldo', v_parc_valor_antes,
      'diferenca', abs(v_valor - coalesce(v_parc_valor_antes, v_valor)),
      'compromisso_de', v_comp_valor_antes, 'compromisso_para', round(v_soma, 2)));
  END IF;
  IF v_op.fazenda_id IS NOT NULL AND v_comp_nova IS NOT NULL
     AND (public._fn_status_pilares_fechamento(v_op.fazenda_id, to_char(v_comp_nova, 'YYYY-MM'))->'p1_mapa_pastos'->>'status') = 'oficial' THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'mes_fechado', 'mes', to_char(v_comp_nova, 'YYYY-MM')));
  END IF;
  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
$pvb6$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 6 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 7
  v_a := $pva7$      'titulo_substituido', v_tit_substituido,
      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
$pva7$;
  v_b := $pvb7$      'titulo_substituido', v_tit_substituido, 'parcial', v_parcial,
      'parcela_valor_antes', v_parc_valor_antes, 'parcela_status_antes', v_parc_status_antes,
      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
$pvb7$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 7 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 8
  v_a := $pva8$    'principal', CASE WHEN v_natureza = 'principal' THEN jsonb_build_object(
                 'acordado', round(v_base, 2), 'vinculado', round(v_vinculado, 2), 'recebido', round(v_recebido, 2)) END,
    'avisos', v_avisos);
$pva8$;
  v_b := $pvb8$    'principal', CASE WHEN v_natureza = 'principal' THEN jsonb_build_object(
                 'acordado', round(v_base, 2), 'vinculado', round(v_vinculado, 2), 'recebido', round(v_recebido, 2)) END,
    -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: recebido V de P; fica saldo P − V, na parcela seguinte (com o titulo reduzido, se havia)
    'parcial', CASE WHEN v_parcial IS NOT NULL THEN jsonb_build_object(
                 'lado', v_lado, 'recebido', v_valor, 'de', v_parc_valor_antes, 'saldo', v_saldo,
                 'parcela_saldo', jsonb_build_object('id', v_parc_saldo_id, 'sequencia', v_seq_saldo, 'quantidade', v_qtd_parte,
                     'vencimento', v_parc.vencimento, 'titulo_id', v_tit_velho.id, 'titulo_valor_antes', v_tit_velho.valor)) END,
    'avisos', v_avisos);
$pvb8$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento, ancora 8 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '4bc44efe56c07f47cc49e783eb3fbdde' THEN
    RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_vincular_lancamento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_vincular_lancamento(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$,
    pg_get_function_arguments('public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)'::regprocedure), v_novo);
END $pv$;

DO $pd$
DECLARE
  v_src text; v_novo text; v_a text; v_b text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)'::regprocedure;
  IF md5(v_src) <> '6cbc7e2a1c3b9a3e2563d87085184d74' THEN
    RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $pda1$  v_evento_vinculo uuid; v_restauro jsonb;
BEGIN
$pda1$;
  v_b := $pdb1$  v_evento_vinculo uuid; v_restauro jsonb;
  -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01
  v_parcial jsonb; v_devolucao jsonb; v_ps public.zoo_operacao_parcelas_programacao; v_pts public.zoo_operacao_partes;
  v_ts public.financeiro_lancamentos_v2; v_qtd_grupo int;
  v_ev public.zoo_operacao_eventos; v_pa text; v_ca text; v_snap jsonb; v_valor_antes numeric; v_restaurou boolean := false;
BEGIN
$pdb1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento, ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 2
  v_a := $pda2$  -- 3. parcela, programacao, compromisso
  UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_parc.id;
  SELECT count(*), coalesce(sum(valor), 0) INTO v_vivas, v_soma
    FROM public.zoo_operacao_parcelas_programacao
   WHERE programacao_id = v_prog.id AND status IN ('prevista', 'materializada', 'paga');
  IF v_vivas = 0 THEN
$pda2$;
  v_b := $pdb2$  -- 3. parcela, programacao, compromisso
  -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: DESVINCULAR E' A VOLTA DO VINCULO — a OC volta ao estado de ANTES dele, lido da trilha do
  -- proprio vinculo (`vincular_lancamento` desta parte: o compromisso de antes, o titulo e a parte substituidos, a acao da parcela).
  --   · item CRIADO pelo vinculo (compromisso novo): como sempre — a parcela sai e o que o vinculo criou e' cancelado;
  --   · vinculo que SUBSTITUIU um titulo programado: o titulo e a parte dele sao REATIVADOS (o mesmo registro, se segue cancelado
  --     e sem outra parte viva; senao a parcela volta a 'prevista', de onde se lanca de novo pela tela), a parcela volta ao valor
  --     de antes e o compromisso NAO muda — salvo quando o proprio vinculo o tinha ajustado: ai' volta ao valor de antes;
  --   · vinculo que PREENCHEU uma parcela prevista: ela volta a 'prevista' com o valor de antes;
  --   · parcela criada num compromisso que ja' existia: a parcela sai e o compromisso fica (valor e status de antes);
  --   · vinculo PARCIAL (a trilha guarda `parcial`): o valor volta ao SALDO. Tres casos, do mais fiel ao mais geral:
  --   (a) o saldo daquele vinculo esta' como nasceu (parcela viva; com titulo: programado, sem liquidacao nem conciliacao):
  --       o titulo volta ao valor cheio (saldo + V), a parte dele volta para a parcela de origem e a parcela do saldo some;
  --   (b) esse saldo ja' foi consumido, mas a programacao tem OUTRO saldo com titulo em aberto: o valor e' somado a ele;
  --   (c) nao ha' saldo em aberto: a parcela volta a 'prevista' (a receber/a pagar, sem titulo), com o valor dela.
  SELECT e.* INTO v_ev FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = p_operacao_id AND e.acao = 'vincular_lancamento' AND e.detalhes->>'parte_id' = v_parte.id::text
   ORDER BY e.created_at DESC LIMIT 1;
  v_parcial := CASE WHEN jsonb_typeof(v_ev.detalhes->'parcial') = 'object' THEN v_ev.detalhes->'parcial' END;
  v_pa := v_ev.detalhes->>'parcela_acao'; v_ca := v_ev.detalhes->>'compromisso_acao';
  v_snap := CASE WHEN jsonb_typeof(v_ev.dados_anteriores->'compromisso') = 'object' THEN v_ev.dados_anteriores->'compromisso' END;
  v_comp_acao := 'mantido'; v_comp_valor_depois := v_comp.valor_total;
  IF v_parcial IS NOT NULL THEN
    SELECT * INTO v_ps FROM public.zoo_operacao_parcelas_programacao
     WHERE id = (v_parcial->>'parcela_saldo_id')::uuid AND programacao_id = v_prog.id
       AND status IN ('prevista', 'materializada') FOR UPDATE;
    IF v_ps.id IS NOT NULL THEN
      SELECT * INTO v_pts FROM public.zoo_operacao_partes WHERE programacao_parcela_id = v_ps.id AND cancelada = false FOR UPDATE;
      IF v_pts.id IS NOT NULL THEN
        SELECT * INTO v_ts FROM public.financeiro_lancamentos_v2 WHERE id = v_pts.financeiro_lancamento_id FOR UPDATE;
      END IF;
    END IF;
    IF v_ps.id IS NOT NULL AND (
         (v_pts.id IS NULL AND (v_parcial->>'parte_saldo_id') IS NULL)
         OR (v_pts.id IS NOT NULL AND v_pts.id::text = (v_parcial->>'parte_saldo_id') AND public._oc_titulo_em_aberto(v_ts.id))) THEN
      -- (a) restaura
      IF coalesce((v_parcial->>'parcela_criada')::boolean, false) THEN
        -- a parcela do recebimento e a do saldo nasceram no vinculo: as duas saem (a do saldo nunca teve parte)
        DELETE FROM public.zoo_operacao_parcelas_programacao WHERE id = v_ps.id;
        UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_parc.id;
        v_devolucao := jsonb_build_object('modo', 'parcela_removida', 'valor', v_parc.valor,
          'saldo_de', v_ps.valor, 'saldo_para', v_parc.valor + v_ps.valor, 'titulo_id', NULL);
      ELSE
      IF v_pts.id IS NOT NULL THEN
        UPDATE public.financeiro_lancamentos_v2
           SET valor = CASE WHEN (v_parcial->>'titulo_valor_antes')::numeric = v_ts.valor + v_parc.valor
                            THEN (v_parcial->>'titulo_valor_antes')::numeric ELSE v_ts.valor + v_parc.valor END,
               updated_at = now(), updated_by = v_actor WHERE id = v_ts.id;
        UPDATE public.zoo_operacao_partes
           SET programacao_parcela_id = v_parc.id, sequencia_parcela = v_parte.sequencia_parcela,
               quantidade_parcelas = greatest(quantidade_parcelas, v_parte.sequencia_parcela),
               valor = CASE WHEN (v_parcial->>'parte_saldo_valor_antes')::numeric = v_pts.valor + v_parc.valor
                            THEN (v_parcial->>'parte_saldo_valor_antes')::numeric ELSE v_pts.valor + v_parc.valor END,
               updated_at = now()
         WHERE id = v_pts.id;
      END IF;
      UPDATE public.zoo_operacao_parcelas_programacao
         SET valor = CASE WHEN (v_parcial->>'de')::numeric = v_parc.valor + v_ps.valor
                          THEN (v_parcial->>'de')::numeric ELSE v_parc.valor + v_ps.valor END,
             status = CASE WHEN v_pts.id IS NOT NULL THEN coalesce(v_parcial->>'parcela_status_antes', 'materializada') ELSE 'prevista' END,
             updated_at = now()
       WHERE id = v_parc.id;
      IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes x WHERE x.programacao_parcela_id = v_ps.id) THEN
        UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_ps.id;
      ELSE
        DELETE FROM public.zoo_operacao_parcelas_programacao WHERE id = v_ps.id;
      END IF;
      v_devolucao := jsonb_build_object('modo', 'restaurado', 'valor', v_parc.valor,
        'saldo_de', v_ps.valor, 'saldo_para', v_parc.valor + v_ps.valor, 'titulo_id', v_ts.id);
      END IF;
    ELSE
      -- (b) outro saldo com titulo em aberto na mesma programacao (o de maior sequencia)
      v_ps := NULL; v_pts := NULL; v_ts := NULL;
      SELECT pp.* INTO v_ps FROM public.zoo_operacao_parcelas_programacao pp
        JOIN public.zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
       WHERE pp.programacao_id = v_prog.id AND pp.id <> v_parc.id AND pp.status IN ('prevista', 'materializada')
         AND public._oc_titulo_em_aberto(pt.financeiro_lancamento_id)
       ORDER BY pp.sequencia DESC LIMIT 1 FOR UPDATE OF pp;
      IF v_ps.id IS NOT NULL THEN
        SELECT * INTO v_pts FROM public.zoo_operacao_partes WHERE programacao_parcela_id = v_ps.id AND cancelada = false FOR UPDATE;
        SELECT * INTO v_ts FROM public.financeiro_lancamentos_v2 WHERE id = v_pts.financeiro_lancamento_id FOR UPDATE;
        UPDATE public.financeiro_lancamentos_v2
           SET valor = v_ts.valor + v_parc.valor, updated_at = now(), updated_by = v_actor WHERE id = v_ts.id;
        UPDATE public.zoo_operacao_partes SET valor = v_pts.valor + v_parc.valor, updated_at = now() WHERE id = v_pts.id;
        UPDATE public.zoo_operacao_parcelas_programacao SET valor = v_ps.valor + v_parc.valor, updated_at = now() WHERE id = v_ps.id;
        UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_parc.id;
        v_devolucao := jsonb_build_object('modo', 'somado_ao_saldo', 'valor', v_parc.valor,
          'saldo_de', v_ps.valor, 'saldo_para', v_ps.valor + v_parc.valor, 'titulo_id', v_ts.id);
      ELSE
        -- (c) sem saldo em aberto: a parcela volta a ser "a receber/a pagar", sem titulo
        UPDATE public.zoo_operacao_parcelas_programacao SET status = 'prevista', updated_at = now() WHERE id = v_parc.id;
        v_devolucao := jsonb_build_object('modo', 'volta_a_prevista', 'valor', v_parc.valor,
          'saldo_de', 0, 'saldo_para', v_parc.valor, 'titulo_id', NULL);
      END IF;
    END IF;
  ELSIF v_ev.id IS NOT NULL AND v_ca IN ('ajustado', 'mantido') AND v_pa IN ('substituida', 'preenchida', 'criada') THEN
    -- vinculo COMUM num compromisso que ja' existia: a volta
    IF v_pa = 'criada' THEN
      UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_parc.id;
      v_devolucao := jsonb_build_object('modo', 'parcela_removida', 'valor', v_parc.valor, 'saldo_de', NULL, 'saldo_para', NULL, 'titulo_id', NULL);
    ELSE
      v_valor_antes := coalesce((v_ev.detalhes->>'parcela_valor_antes')::numeric,
                                (v_ev.dados_anteriores->'titulo_substituido'->>'valor')::numeric, v_parc.valor);
      IF v_pa = 'substituida' AND coalesce((v_ev.detalhes->'titulo_substituido'->>'ja_estava_cancelado')::boolean, false) IS FALSE THEN
        SELECT * INTO v_ts FROM public.financeiro_lancamentos_v2
         WHERE id = (v_ev.detalhes->'titulo_substituido'->>'titulo_id')::uuid FOR UPDATE;
        SELECT * INTO v_pts FROM public.zoo_operacao_partes
         WHERE id = (v_ev.detalhes->'titulo_substituido'->>'parte_id')::uuid FOR UPDATE;
        IF v_ts.id IS NOT NULL AND v_ts.cancelado IS TRUE AND v_pts.id IS NOT NULL AND v_pts.cancelada IS TRUE
           AND v_pts.programacao_parcela_id = v_parc.id
           AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes x WHERE x.financeiro_lancamento_id = v_ts.id AND x.cancelada = false) THEN
          -- ⚠ DESCANCELAR NAO TEM DONO GERAL: o gesto faz o UPDATE (o padrao do `fn_classificacao_desfazer_split`). O titulo e'
          --   a PROMESSA da propria OC (programado, sem pagamento): volta como estava, com o valor que tinha.
          UPDATE public.financeiro_lancamentos_v2
             SET cancelado = false, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL,
                 updated_at = now(), updated_by = v_actor
           WHERE id = v_ts.id;
          UPDATE public.zoo_operacao_partes
             SET cancelada = false, cancelada_em = NULL, cancelada_por = NULL, cancelada_motivo = NULL, updated_at = now()
           WHERE id = v_pts.id;
          v_restaurou := true;
        END IF;
      END IF;
      UPDATE public.zoo_operacao_parcelas_programacao
         SET valor = v_valor_antes,
             status = CASE WHEN v_restaurou THEN coalesce(v_ev.detalhes->>'parcela_status_antes', 'materializada') ELSE 'prevista' END,
             updated_at = now()
       WHERE id = v_parc.id;
      v_devolucao := jsonb_build_object('modo', CASE WHEN v_restaurou THEN 'titulo_restaurado' ELSE 'volta_a_prevista' END,
        'valor', v_valor_antes, 'saldo_de', 0, 'saldo_para', v_valor_antes, 'titulo_id', CASE WHEN v_restaurou THEN v_ts.id END);
    END IF;
    -- o compromisso: o valor so' volta se o PROPRIO vinculo o tinha ajustado e ninguem mexeu nele depois
    IF v_ca = 'ajustado' AND v_snap IS NOT NULL
       AND v_comp.valor_total = (v_ev.dados_novos->'compromisso'->>'valor_total')::numeric
       AND (v_snap->>'valor_total')::numeric <> v_comp.valor_total THEN
      v_comp_valor_depois := (v_snap->>'valor_total')::numeric; v_comp_acao := 'restaurado';
      UPDATE public.zoo_operacao_compromissos SET valor_total = v_comp_valor_depois, updated_at = now() WHERE id = v_comp.id;
    END IF;
  ELSE
  UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_parc.id;
  SELECT count(*), coalesce(sum(valor), 0) INTO v_vivas, v_soma
    FROM public.zoo_operacao_parcelas_programacao
   WHERE programacao_id = v_prog.id AND status IN ('prevista', 'materializada', 'paga');
  IF v_vivas = 0 THEN
$pdb2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento, ancora 2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 3
  v_a := $pda3$    v_comp_acao := 'reduzido'; v_comp_valor_depois := round(v_soma, 2);
  END IF;
$pda3$;
  v_b := $pdb3$    v_comp_acao := 'reduzido'; v_comp_valor_depois := round(v_soma, 2);
  END IF;
  END IF;
  -- a programacao que o VINCULO criou e ficou sem parcela viva sai com ele; o compromisso volta ao status de antes
  IF v_comp_acao IN ('mantido', 'restaurado') AND v_snap IS NOT NULL THEN
    IF coalesce((v_ev.detalhes->>'programacao_criada')::boolean, false)
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_parcelas_programacao pp
                        WHERE pp.programacao_id = v_prog.id AND pp.status IN ('prevista', 'materializada', 'paga')) THEN
      UPDATE public.zoo_operacao_programacoes SET status = 'cancelada', updated_at = now() WHERE id = v_prog.id;
    END IF;
    UPDATE public.zoo_operacao_compromissos SET status = v_snap->>'status', updated_at = now()
     WHERE id = v_comp.id AND (v_snap->>'status') IN ('aberto', 'programado') AND status IS DISTINCT FROM (v_snap->>'status');
  END IF;
  -- OC-DESVINCULAR-RENUMERA-01: as partes ATIVAS que ficam no grupo passam a dizer a quantidade que ficou ("1 de 1", nao "1 de 3")
  v_qtd_grupo := public._oc_renumerar_parcelas_do_grupo(v_parte.id);
$pdb3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento, ancora 3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 4
  v_a := $pda4$      'liquidacoes_estornadas', to_jsonb(v_liq_estornadas),
      'origem_de', v_l.origem_lancamento, 'origem_para', v_l_depois.origem_lancamento,
      'origem_tipo_de', v_l.origem_tipo,
$pda4$;
  v_b := $pdb4$      'liquidacoes_estornadas', to_jsonb(v_liq_estornadas),
      'devolucao_ao_saldo', v_devolucao, 'parcelas_do_grupo', v_qtd_grupo,
      'origem_de', v_l.origem_lancamento, 'origem_para', v_l_depois.origem_lancamento,
      'origem_tipo_de', v_l.origem_tipo,
$pdb4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento, ancora 4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 5
  v_a := $pda5$    'recebido', jsonb_build_object('de', v_recebido_antes, 'para', v_recebido_depois),
    'compromissos_total',$pda5$;
  v_b := $pdb5$    'recebido', jsonb_build_object('de', v_recebido_antes, 'para', v_recebido_depois),
    -- OC-VINCULAR-RECEBIMENTO-PARCIAL-01: o valor que volta ao saldo a receber/a pagar (nulo fora do vinculo parcial)
    'devolucao_ao_saldo', v_devolucao, 'parcelas_do_grupo', v_qtd_grupo,
    'lado', CASE WHEN v_l.tipo_operacao LIKE '1-%' THEN 'receber' ELSE 'pagar' END,
    'compromissos_total',$pdb5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento, ancora 5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> 'f568e7cbd3e876a0180cf6386d13ccf2' THEN
    RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: oc_desvincular_lancamento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_desvincular_lancamento(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$,
    pg_get_function_arguments('public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)'::regprocedure), v_novo);
END $pd$;

-- ── conferencia ──
DO $conf$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid, p.proname, md5(p.prosrc) m, p.prosecdef FROM pg_proc p
            WHERE p.proname IN ('oc_vincular_lancamento', 'oc_desvincular_lancamento') LOOP
    IF r.m NOT IN ('4bc44efe56c07f47cc49e783eb3fbdde', 'f568e7cbd3e876a0180cf6386d13ccf2') OR NOT r.prosecdef
       OR has_function_privilege('anon', r.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: % fora do esperado (md5 %)', r.proname, r.m; END IF;
  END LOOP;
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p WHERE p.proname IN ('_oc_titulo_em_aberto', '_oc_renumerar_parcelas_do_grupo') LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') OR has_function_privilege('authenticated', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: interna % com ACL aberta', r.proname; END IF;
  END LOOP;
END $conf$;
