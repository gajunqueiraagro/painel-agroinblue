-- OC-LOTE-FISICO-POS-SAIDA-01 (Gabriel, 14/10/2026): QUANTIDADE E PESO DO LOTE MUDAM DEPOIS DA SAIDA, E A SAIDA ACOMPANHA.
--   Substitui "quantidade e peso nao mudam depois do recebimento" (OC-VENDA-ENTREGAS-01a D1). So' `oc_salvar_lotes`, caminho B (lote
--   com saida ativa cuja quantidade OU peso medio mudou), no MESMO trecho que ja' propagava a CATEGORIA:
--   (a) conta as saidas ATIVAS do lote: nenhuma REGISTRADA (so' adotada) -> recusa, "corrigem em Lancar movimentacao"; 2 ou mais
--       ativas -> recusa, "estorne pela aba Entrega e registre de novo"; exatamente 1 registrada -> propaga.
--   (b) MES FECHADO: le o status do mes da DATA DA SAIDA pela MESMA interna do `guard_lancamento_mes_fechado_p1`
--       (`_fn_status_pilares_fechamento(fazenda, mes) #>> '{p1_mapa_pastos,status}' = 'oficial'`) e recusa com a MESMA frase dele.
--       ⚠ O guard so' cobre QUANTIDADE (campo estrutural); peso medio, peso total e valor passariam — esta checagem cobre os dois
--       pela mesma porta (decisao (a) do Gabriel, 14/10). Nenhuma segunda regra de "mes fechado".
--   (c) UPDATE da saida: quantidade, peso_medio_kg e peso_vivo_total por `_oc_conciliar_peso(qtd, peso, NULL)`; em VENDA e COMPRA
--       `valor_total` = ROUND(por_cabeca × qtd, 2), a regra de `oc_registrar_movimentacao` (por_cabeca de `_oc_valor_do_lote`, lido
--       com o lote ja' atualizado); no ABATE `valor_total` NAO e' tocado (e' de `_oc_sync_abate_lancamento`, proporcional a
--       quantidade / qtd_negociada, que ficam iguais).
--   (d) evento 'ajustar_fisico_apos_saida' {lote_id, ordem, saida_id, qtd_antes, qtd_depois, peso_antes, peso_depois}.
--   (e) a recusa antiga ("Quantidade e peso nao mudam") SAI.
--   (f) nada no fim: o `oc_sincronizar_entregas` de conta corrente e a versao lida ja' rodam DEPOIS do laco (a entrega da venda em
--       kg acompanha o peso).
-- PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
--   oc_salvar_lotes 3232b0a47ce8df3df64aaf480654cc83 -> 6ae8bdb902f32ed0a23f6e8ecf4f4c78
-- So' o corpo troca: ACL, SECURITY DEFINER e search_path preservados. Nenhum DDL em tabela, nenhum dado.

CREATE OR REPLACE FUNCTION pg_temp._oc_lote_fisico_01_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int; v_acl text; v_sec boolean; v_cfg text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.prosecdef, p.proconfig::text
    INTO STRICT v_src, v_def, v_acl, v_sec, v_cfg FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-LOTE-FISICO-POS-SAIDA-01: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-LOTE-FISICO-POS-SAIDA-01: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-LOTE-FISICO-POS-SAIDA-01: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-LOTE-FISICO-POS-SAIDA-01: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM p_destino
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_acl
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_sec
     OR (SELECT p.proconfig::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'OC-LOTE-FISICO-POS-SAIDA-01: %: destino, ACL, SECURITY ou search_path nao conferem depois da troca', p_nome; END IF;
END $patch$;

SELECT pg_temp._oc_lote_fisico_01_patch('oc_salvar_lotes', '3232b0a47ce8df3df64aaf480654cc83', '6ae8bdb902f32ed0a23f6e8ecf4f4c78', ARRAY[
$a$  v_vinc_mortos jsonb;
BEGIN$a$,
$b$  v_vinc_mortos jsonb;
  -- OC-LOTE-FISICO-POS-SAIDA-01: a saida que acompanha o lote
  v_n_reg int; v_n_ativas int; v_s_id uuid; v_s_faz uuid; v_s_data date; v_s_qtd int; v_s_peso numeric; v_s_mes text;
  v_nqtd int; v_npeso numeric; v_pj jsonb; v_pcab numeric;
BEGIN$b$,
$a$        RAISE EXCEPTION 'Lote % (ordem %) tem saida ativa: %. Quantidade e peso nao mudam (categoria e observacao podem); estorne ou desvincule a saida para alterar.',
          COALESCE(v_grav.categoria_negociada, 'sem categoria'), v_grav.ordem, v_saidas USING ERRCODE = 'P0001';$a$,
$b$        /* OC-LOTE-FISICO-POS-SAIDA-01 — quantidade e peso MUDAM depois da saida, e a saida acompanha (propagada no laco de baixo,
           junto da categoria). So' a saida REGISTRADA pela OC; uma so'; e nunca em mes fechado. */
        SELECT count(*) FILTER (WHERE m.origem = 'registrada'), count(*)
          INTO v_n_reg, v_n_ativas
          FROM public.zoo_operacao_movimentacoes m
          JOIN public.lancamentos l ON l.id = m.movimentacao_id
         WHERE m.operacao_lote_id = v_grav.id AND l.cancelado IS NOT TRUE;
        IF v_n_reg = 0 THEN
          RAISE EXCEPTION 'Lote % (ordem %) tem saída adotada (%): quantidade e peso dessa saída se corrigem em Lançar movimentação, não pela operação.',
            COALESCE(v_grav.categoria_negociada, 'sem categoria'), v_grav.ordem, v_saidas USING ERRCODE = 'P0001';
        END IF;
        IF v_n_ativas >= 2 THEN
          RAISE EXCEPTION 'Lote % (ordem %) tem % saídas ativas (%): estorne pela aba Entrega e registre de novo para alterar quantidade ou peso.',
            COALESCE(v_grav.categoria_negociada, 'sem categoria'), v_grav.ordem, v_n_ativas, v_saidas USING ERRCODE = 'P0001';
        END IF;
        -- o mes da saida: a MESMA leitura e a MESMA frase do guard_lancamento_mes_fechado_p1 (que nao cobre o peso)
        SELECT l.fazenda_id, l.data INTO v_s_faz, v_s_data
          FROM public.zoo_operacao_movimentacoes m
          JOIN public.lancamentos l ON l.id = m.movimentacao_id
         WHERE m.operacao_lote_id = v_grav.id AND m.origem = 'registrada' AND l.cancelado IS NOT TRUE;
        v_s_mes := substring(v_s_data::text, 1, 7);
        IF (public._fn_status_pilares_fechamento(v_s_faz, v_s_mes) #>> '{p1_mapa_pastos,status}') = 'oficial' THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', v_s_mes
            USING ERRCODE = 'P0001';
        END IF;$b$,
$a$           AND l.cancelado IS NOT TRUE AND l.categoria IS DISTINCT FROM v_lote->>'categoria_negociada';
      END IF;
    END LOOP;$a$,
$b$           AND l.cancelado IS NOT TRUE AND l.categoria IS DISTINCT FROM v_lote->>'categoria_negociada';
      END IF;

      -- OC-LOTE-FISICO-POS-SAIDA-01: quantidade e peso corrigidos descem para a saida REGISTRADA (a checagem de cima ja' garantiu
      -- que ha' exatamente uma e que o mes dela esta' aberto). `v_grav` e' o lote de ANTES desta gravacao.
      v_nqtd  := NULLIF(v_lote->>'qtd_negociada','')::int;
      v_npeso := NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric;
      IF v_nqtd IS DISTINCT FROM v_grav.qtd_negociada OR v_npeso IS DISTINCT FROM v_grav.peso_medio_negociado_kg THEN
        SELECT l.id, l.quantidade, l.peso_medio_kg INTO v_s_id, v_s_qtd, v_s_peso
          FROM public.zoo_operacao_movimentacoes m
          JOIN public.lancamentos l ON l.id = m.movimentacao_id
         WHERE m.operacao_lote_id = v_grav.id AND m.origem = 'registrada' AND l.cancelado IS NOT TRUE;
        IF FOUND THEN
          v_pj := public._oc_conciliar_peso(v_nqtd, v_npeso, NULL);
          IF v_op.tipo_operacao = 'abate' THEN
            -- no abate o valor da saida e' do acerto (`_oc_sync_abate_lancamento`): nao se toca
            UPDATE public.lancamentos
               SET quantidade = v_nqtd, peso_medio_kg = (v_pj->>'medio')::numeric, peso_vivo_total = (v_pj->>'total')::numeric
             WHERE id = v_s_id;
          ELSE
            -- a regra de `oc_registrar_movimentacao`: R$/cab do lote (ja' atualizado) × quantidade
            v_pcab := (public._oc_valor_do_lote(v_grav.id) ->> 'por_cabeca')::numeric;
            UPDATE public.lancamentos
               SET quantidade = v_nqtd, peso_medio_kg = (v_pj->>'medio')::numeric, peso_vivo_total = (v_pj->>'total')::numeric,
                   valor_total = CASE WHEN v_pcab IS NULL THEN NULL ELSE ROUND(v_pcab * v_nqtd, 2) END
             WHERE id = v_s_id;
          END IF;
          INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
          VALUES (p_cliente_id, p_operacao_id, 'ajustar_fisico_apos_saida',
                  jsonb_build_object('lote_id', v_grav.id, 'ordem', v_grav.ordem, 'saida_id', v_s_id,
                                     'qtd_antes', v_s_qtd, 'qtd_depois', v_nqtd, 'peso_antes', v_s_peso, 'peso_depois', v_npeso),
                  v_actor, 'rpc');
        END IF;
      END IF;
    END LOOP;$b$]);
