-- IMPORTAR-ABATE-01 · D5 (Gabriel 07/11 08:49): o SENAR e' componente PROPRIO da OC de abate, nunca "funrural".
-- Caso: OC 5d255b74 (EXP, lote 6): o SENAR 0,2% (342,19) foi gravado no par `funrural` do `oc_salvar_abate` porque a RPC nao tinha o par
-- `senar`; o Resumo Fiscal e a DRE contavam SENAR como Funrural (o Funrural desse abate e' pela folha, nao retido).
-- O que muda (5 funcoes, patch por ancora DENTRO do banco: md5 do corpo de partida, cada ancora casa 1x, md5 do corpo de chegada antes e depois do EXECUTE):
--  - zoo_operacao_abate: senar_valor + senar_fonte ('pct' | 'reais'), como o funrural;
--  - oc_salvar_abate: o par `senar` (a mesma regra "valor sem fonte recusa");
--  - _oc_cc_valor_entrega_do_lote: bruto da entrega = liquido + Funrural + SENAR, e devolve o `senar`;
--  - oc_sincronizar_entregas: a deducao do SENAR com os mesmos pesos e o mesmo residuo da do Funrural (e sai junto na entrega cancelada);
--  - _oc_cc_deducao_sincronizar (o escritor unico da deducao): aceita 'senar' (descricao "SENAR retido · …", chave por componente);
--  - _oc_sync_abate_lancamento: o preco pelo liquido soma o SENAR na base.
-- Mesma conta do plano (Impostos e Despesas de Abates e Vendas): a DRE nao muda; muda o componente. Os dados ja' gravados NAO mudam aqui
-- (a reclassificacao das OCs com SENAR em `funrural` e' bloco proprio, com o GO do Gabriel). As grants ficam (CREATE OR REPLACE).
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.zoo_operacao_abate
  ADD COLUMN senar_valor numeric,
  ADD COLUMN senar_fonte text CHECK (senar_fonte = ANY (ARRAY['pct'::text, 'reais'::text]));
COMMENT ON COLUMN public.zoo_operacao_abate.senar_valor IS 'IMPORTAR-ABATE-01 (D5): SENAR retido do lote (R$ ou %, pela fonte); componente proprio, nunca funrural';
-- o componente no catalogo (a FK zoo_operacao_partes_componente_fk exige). O `senar_proape` ("SENAR/PROAPE", 20260720160000) existe e
-- nunca foi usado (0 partes, 0 documentos, nenhuma funcao): fica como esta' (decisao do Gabriel inativar ou nao).
INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ativo, ordem_exibicao, sistemico)
VALUES ('deducao', 'senar', 'SENAR', 'tributo', true, 21, true);

DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.oc_salvar_abate(uuid,uuid,integer,text,jsonb)'::regprocedure);
  IF md5(d) <> 'b2cf292b00d788030b3958c057f976d2' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: o corpo de oc_salvar_abate mudou desde a leitura: nada aplicado'; END IF;
  IF (length(d) - length(replace(d, $a$'outros_descontos','funrural'];$a$, ''))) / length($a$'outros_descontos','funrural'];$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora B1 de oc_salvar_abate nao casa 1x'; END IF;
  d := replace(d, $a$'outros_descontos','funrural'];$a$, $b$'outros_descontos','funrural','senar'];$b$);
  IF (length(d) - length(replace(d, $a$outros_descontos_valor, outros_descontos_fonte, funrural_valor, funrural_fonte,
      valor_base_override,$a$, ''))) / length($a$outros_descontos_valor, outros_descontos_fonte, funrural_valor, funrural_fonte,
      valor_base_override,$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora B2 de oc_salvar_abate nao casa 1x'; END IF;
  d := replace(d, $a$outros_descontos_valor, outros_descontos_fonte, funrural_valor, funrural_fonte,
      valor_base_override,$a$, $b$outros_descontos_valor, outros_descontos_fonte, funrural_valor, funrural_fonte, senar_valor, senar_fonte,
      valor_base_override,$b$);
  IF (length(d) - length(replace(d, $a$      (v_item->>'funrural_valor')::numeric, v_item->>'funrural_fonte',
$a$, ''))) / length($a$      (v_item->>'funrural_valor')::numeric, v_item->>'funrural_fonte',
$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora B3 de oc_salvar_abate nao casa 1x'; END IF;
  d := replace(d, $a$      (v_item->>'funrural_valor')::numeric, v_item->>'funrural_fonte',
$a$, $b$      (v_item->>'funrural_valor')::numeric, v_item->>'funrural_fonte',
      (v_item->>'senar_valor')::numeric, v_item->>'senar_fonte',
$b$);
  IF (length(d) - length(replace(d, $a$funrural_valor = EXCLUDED.funrural_valor, funrural_fonte = EXCLUDED.funrural_fonte,$a$, ''))) / length($a$funrural_valor = EXCLUDED.funrural_valor, funrural_fonte = EXCLUDED.funrural_fonte,$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora B4 de oc_salvar_abate nao casa 1x'; END IF;
  d := replace(d, $a$funrural_valor = EXCLUDED.funrural_valor, funrural_fonte = EXCLUDED.funrural_fonte,$a$, $b$funrural_valor = EXCLUDED.funrural_valor, funrural_fonte = EXCLUDED.funrural_fonte,
      senar_valor = EXCLUDED.senar_valor, senar_fonte = EXCLUDED.senar_fonte,$b$);
  IF md5(d) <> '1d3648f4569bbfcec455fc78dff71d1a' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: oc_salvar_abate depois do patch nao e'' o conferido'; END IF;
  EXECUTE d;
  IF md5(pg_get_functiondef('public.oc_salvar_abate(uuid,uuid,integer,text,jsonb)'::regprocedure)) <> '1d3648f4569bbfcec455fc78dff71d1a' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: oc_salvar_abate gravada difere do conferido'; END IF;
END $p$;

DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._oc_cc_valor_entrega_do_lote(uuid)'::regprocedure);
  IF md5(d) <> '258c50c1573d82e6735bdd75a6d1b770' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: o corpo de _oc_cc_valor_entrega_do_lote mudou desde a leitura: nada aplicado'; END IF;
  IF (length(d) - length(replace(d, $a$SELECT a.valor_liquido, a.funrural_valor, a.funrural_fonte INTO v_ab$a$, ''))) / length($a$SELECT a.valor_liquido, a.funrural_valor, a.funrural_fonte INTO v_ab$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora C1 de _oc_cc_valor_entrega_do_lote nao casa 1x'; END IF;
  d := replace(d, $a$SELECT a.valor_liquido, a.funrural_valor, a.funrural_fonte INTO v_ab$a$, $b$SELECT a.valor_liquido, a.funrural_valor, a.funrural_fonte, a.senar_valor, a.senar_fonte INTO v_ab$b$);
  IF (length(d) - length(replace(d, $a$      RETURN jsonb_build_object('bruto', v_ab.valor_liquido + coalesce(v_ab.funrural_valor, 0), 'liquido', v_ab.valor_liquido,
                                'funrural', coalesce(v_ab.funrural_valor, 0), 'qtd', v_l.qtd_negociada);$a$, ''))) / length($a$      RETURN jsonb_build_object('bruto', v_ab.valor_liquido + coalesce(v_ab.funrural_valor, 0), 'liquido', v_ab.valor_liquido,
                                'funrural', coalesce(v_ab.funrural_valor, 0), 'qtd', v_l.qtd_negociada);$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora C2 de _oc_cc_valor_entrega_do_lote nao casa 1x'; END IF;
  d := replace(d, $a$      RETURN jsonb_build_object('bruto', v_ab.valor_liquido + coalesce(v_ab.funrural_valor, 0), 'liquido', v_ab.valor_liquido,
                                'funrural', coalesce(v_ab.funrural_valor, 0), 'qtd', v_l.qtd_negociada);$a$, $b$      -- IMPORTAR-ABATE-01 (D5): o SENAR e' retencao propria, nunca "funrural"
      IF coalesce(v_ab.senar_valor, 0) <> 0 AND coalesce(v_ab.senar_fonte, 'reais') <> 'reais' THEN
        RAISE EXCEPTION 'Lote de ordem %: o SENAR do abate esta em %%; informe o SENAR em R$ no acerto do abate', v_l.ordem
          USING ERRCODE = 'P0001'; END IF;
      RETURN jsonb_build_object('bruto', v_ab.valor_liquido + coalesce(v_ab.funrural_valor, 0) + coalesce(v_ab.senar_valor, 0),
                                'liquido', v_ab.valor_liquido, 'funrural', coalesce(v_ab.funrural_valor, 0),
                                'senar', coalesce(v_ab.senar_valor, 0), 'qtd', v_l.qtd_negociada);$b$);
  IF (length(d) - length(replace(d, $a$RETURN jsonb_build_object('bruto', v_total, 'liquido', v_total, 'funrural', 0, 'qtd', v_l.qtd_negociada);$a$, ''))) / length($a$RETURN jsonb_build_object('bruto', v_total, 'liquido', v_total, 'funrural', 0, 'qtd', v_l.qtd_negociada);$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora C3 de _oc_cc_valor_entrega_do_lote nao casa 1x'; END IF;
  d := replace(d, $a$RETURN jsonb_build_object('bruto', v_total, 'liquido', v_total, 'funrural', 0, 'qtd', v_l.qtd_negociada);$a$, $b$RETURN jsonb_build_object('bruto', v_total, 'liquido', v_total, 'funrural', 0, 'senar', 0, 'qtd', v_l.qtd_negociada);$b$);
  IF md5(d) <> '34795a6c1af1fcc64f6285117a23e922' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: _oc_cc_valor_entrega_do_lote depois do patch nao e'' o conferido'; END IF;
  EXECUTE d;
  IF md5(pg_get_functiondef('public._oc_cc_valor_entrega_do_lote(uuid)'::regprocedure)) <> '34795a6c1af1fcc64f6285117a23e922' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: _oc_cc_valor_entrega_do_lote gravada difere do conferido'; END IF;
END $p$;

DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.oc_sincronizar_entregas(uuid,integer,boolean)'::regprocedure);
  IF md5(d) <> 'd336ca0d7ec321b9b426831a82f41249' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: o corpo de oc_sincronizar_entregas mudou desde a leitura: nada aplicado'; END IF;
  IF (length(d) - length(replace(d, $a$    v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.entrega_movimentacao_id, NULL, 'funrural', 0, NULL, NULL, NULL, v_actor);
    IF v_d IS NOT NULL THEN v_canceladas := v_canceladas || (v_d - 'acao'); END IF;
$a$, ''))) / length($a$    v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.entrega_movimentacao_id, NULL, 'funrural', 0, NULL, NULL, NULL, v_actor);
    IF v_d IS NOT NULL THEN v_canceladas := v_canceladas || (v_d - 'acao'); END IF;
$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora D1 de oc_sincronizar_entregas nao casa 1x'; END IF;
  d := replace(d, $a$    v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.entrega_movimentacao_id, NULL, 'funrural', 0, NULL, NULL, NULL, v_actor);
    IF v_d IS NOT NULL THEN v_canceladas := v_canceladas || (v_d - 'acao'); END IF;
$a$, $b$    v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.entrega_movimentacao_id, NULL, 'funrural', 0, NULL, NULL, NULL, v_actor);
    IF v_d IS NOT NULL THEN v_canceladas := v_canceladas || (v_d - 'acao'); END IF;
    -- IMPORTAR-ABATE-01 (D5): e o SENAR
    v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.entrega_movimentacao_id, NULL, 'senar', 0, NULL, NULL, NULL, v_actor);
    IF v_d IS NOT NULL THEN v_canceladas := v_canceladas || (v_d - 'acao'); END IF;
$b$);
  IF (length(d) - length(replace(d, $a$(ve.v->>'bruto')::numeric AS total_lote, (ve.v->>'funrural')::numeric AS funrural_lote,$a$, ''))) / length($a$(ve.v->>'bruto')::numeric AS total_lote, (ve.v->>'funrural')::numeric AS funrural_lote,$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora D2 de oc_sincronizar_entregas nao casa 1x'; END IF;
  d := replace(d, $a$(ve.v->>'bruto')::numeric AS total_lote, (ve.v->>'funrural')::numeric AS funrural_lote,$a$, $b$(ve.v->>'bruto')::numeric AS total_lote, (ve.v->>'funrural')::numeric AS funrural_lote,
             coalesce((ve.v->>'senar')::numeric, 0) AS senar_lote,$b$);
  IF (length(d) - length(replace(d, $a$             ELSE round(s.funrural_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS ded
$a$, ''))) / length($a$             ELSE round(s.funrural_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS ded
$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora D3 de oc_sincronizar_entregas nao casa 1x'; END IF;
  d := replace(d, $a$             ELSE round(s.funrural_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS ded
$a$, $b$             ELSE round(s.funrural_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS ded,
        -- IMPORTAR-ABATE-01 (D5): o SENAR do lote, com os MESMOS pesos e o mesmo residuo
        CASE WHEN coalesce(s.senar_lote, 0) <= 0 THEN 0
             WHEN s.cab_lote = s.qtd_negociada
             THEN CASE WHEN s.rk_kg = 1
                       THEN s.senar_lote - coalesce((SELECT sum(round(s2.senar_lote * s2.kg / s2.kg_lote, 2))
                                                       FROM s s2 WHERE s2.lote_id = s.lote_id AND s2.rk_kg > 1), 0)
                       ELSE round(s.senar_lote * s.kg / nullif(s.kg_lote, 0), 2) END
             ELSE round(s.senar_lote * s.cab / nullif(s.qtd_negociada, 0), 2) END AS ded_senar
$b$);
  IF (length(d) - length(replace(d, $a$      ELSIF v_d->>'acao' = 'cancelada' THEN v_canceladas := v_canceladas || (v_d - 'acao');
      END IF;
    END IF;
  END LOOP;$a$, ''))) / length($a$      ELSIF v_d->>'acao' = 'cancelada' THEN v_canceladas := v_canceladas || (v_d - 'acao');
      END IF;
    END IF;
  END LOOP;$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora D4 de oc_sincronizar_entregas nao casa 1x'; END IF;
  d := replace(d, $a$      ELSIF v_d->>'acao' = 'cancelada' THEN v_canceladas := v_canceladas || (v_d - 'acao');
      END IF;
    END IF;
  END LOOP;$a$, $b$      ELSIF v_d->>'acao' = 'cancelada' THEN v_canceladas := v_canceladas || (v_d - 'acao');
      END IF;
      -- IMPORTAR-ABATE-01 (D5): o SENAR retido e' a outra deducao filha da entrega (mesma conta, componente proprio)
      v_d := public._oc_cc_deducao_sincronizar(p_operacao_id, r.movimentacao_id, r.lote_id, 'senar', coalesce(r.ded_senar, 0), r.data,
               coalesce(r.fazenda_id, v_op.fazenda_id),
               format('%s %s %s', public._oc_cc_verbo(v_op.tipo_operacao), lpad(r.cab::text, greatest(3, length(r.cab::text)), '0'), public._oc_sigla_categoria(r.categoria)),
               v_actor);
      IF v_d->>'acao' = 'criada' THEN v_criadas := v_criadas || (v_d - 'acao');
      ELSIF v_d->>'acao' = 'atualizada' THEN v_atualizadas := v_atualizadas || (v_d - 'acao');
      ELSIF v_d->>'acao' = 'cancelada' THEN v_canceladas := v_canceladas || (v_d - 'acao');
      END IF;
    END IF;
  END LOOP;$b$);
  IF md5(d) <> '9a4c2051b9b67c5c2cfcd5d241691916' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: oc_sincronizar_entregas depois do patch nao e'' o conferido'; END IF;
  EXECUTE d;
  IF md5(pg_get_functiondef('public.oc_sincronizar_entregas(uuid,integer,boolean)'::regprocedure)) <> '9a4c2051b9b67c5c2cfcd5d241691916' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: oc_sincronizar_entregas gravada difere do conferido'; END IF;
END $p$;

DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._oc_cc_deducao_sincronizar(uuid,uuid,uuid,text,numeric,date,uuid,text,uuid)'::regprocedure);
  IF md5(d) <> '0d4e5872ccf51bb2523ee24f07890cca' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: o corpo de _oc_cc_deducao_sincronizar mudou desde a leitura: nada aplicado'; END IF;
  IF (length(d) - length(replace(d, $a$IF p_componente IS DISTINCT FROM 'funrural' THEN$a$, ''))) / length($a$IF p_componente IS DISTINCT FROM 'funrural' THEN$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora E1 de _oc_cc_deducao_sincronizar nao casa 1x'; END IF;
  d := replace(d, $a$IF p_componente IS DISTINCT FROM 'funrural' THEN$a$, $b$IF p_componente IS NULL OR p_componente NOT IN ('funrural', 'senar') THEN$b$);
  IF (length(d) - length(replace(d, $a$v_desc := 'Funrural retido · ' || p_descricao_entrega;$a$, ''))) / length($a$v_desc := 'Funrural retido · ' || p_descricao_entrega;$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora E2 de _oc_cc_deducao_sincronizar nao casa 1x'; END IF;
  d := replace(d, $a$v_desc := 'Funrural retido · ' || p_descricao_entrega;$a$, $b$v_desc := CASE p_componente WHEN 'senar' THEN 'SENAR retido · ' ELSE 'Funrural retido · ' END || p_descricao_entrega;$b$);
  IF md5(d) <> 'aea2dbf7b9b91cc16e47325935d622fe' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: _oc_cc_deducao_sincronizar depois do patch nao e'' o conferido'; END IF;
  EXECUTE d;
  IF md5(pg_get_functiondef('public._oc_cc_deducao_sincronizar(uuid,uuid,uuid,text,numeric,date,uuid,text,uuid)'::regprocedure)) <> 'aea2dbf7b9b91cc16e47325935d622fe' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: _oc_cc_deducao_sincronizar gravada difere do conferido'; END IF;
END $p$;

DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._oc_sync_abate_lancamento(uuid)'::regprocedure);
  IF md5(d) <> '3b2aa94146d38d74b341bc2bbffbd0d5' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: o corpo de _oc_sync_abate_lancamento mudou desde a leitura: nada aplicado'; END IF;
  IF (length(d) - length(replace(d, $a$AND COALESCE(a.desconto_qualidade_fonte,'reais') = 'reais' AND COALESCE(a.outros_descontos_fonte,'reais') = 'reais'$a$, ''))) / length($a$AND COALESCE(a.desconto_qualidade_fonte,'reais') = 'reais' AND COALESCE(a.outros_descontos_fonte,'reais') = 'reais'$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora F1 de _oc_sync_abate_lancamento nao casa 1x'; END IF;
  d := replace(d, $a$AND COALESCE(a.desconto_qualidade_fonte,'reais') = 'reais' AND COALESCE(a.outros_descontos_fonte,'reais') = 'reais'$a$, $b$AND COALESCE(a.desconto_qualidade_fonte,'reais') = 'reais' AND COALESCE(a.outros_descontos_fonte,'reais') = 'reais'
                                      AND COALESCE(a.senar_fonte,'reais') = 'reais'$b$);
  IF (length(d) - length(replace(d, $a$+ COALESCE(a.funrural_valor,0) + COALESCE(a.desconto_qualidade_valor,0)$a$, ''))) / length($a$+ COALESCE(a.funrural_valor,0) + COALESCE(a.desconto_qualidade_valor,0)$a$) <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: ancora F2 de _oc_sync_abate_lancamento nao casa 1x'; END IF;
  d := replace(d, $a$+ COALESCE(a.funrural_valor,0) + COALESCE(a.desconto_qualidade_valor,0)$a$, $b$+ COALESCE(a.funrural_valor,0) + COALESCE(a.senar_valor,0) + COALESCE(a.desconto_qualidade_valor,0)$b$);
  IF md5(d) <> 'c1d39c12ab09502c7da0e51dc005c7e2' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: _oc_sync_abate_lancamento depois do patch nao e'' o conferido'; END IF;
  EXECUTE d;
  IF md5(pg_get_functiondef('public._oc_sync_abate_lancamento(uuid)'::regprocedure)) <> 'c1d39c12ab09502c7da0e51dc005c7e2' THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: _oc_sync_abate_lancamento gravada difere do conferido'; END IF;
END $p$;
