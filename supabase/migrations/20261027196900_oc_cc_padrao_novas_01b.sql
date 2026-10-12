-- OC-CC-PADRAO-NOVAS-01b (Gabriel, 12/10/2026): O GANCHO DA SAIDA. Em conta corrente, registrar / adotar / estornar / encerrar /
-- receber conforme / desvincular passam a SINCRONIZAR AS ENTREGAS no fim (antes, so' o "Atualizar entregas", a' mao), e as seis
-- devolvem a versao REAL da operacao (lida depois do gancho) — a tela a le^ no mesmo PR.
--   (1) _oc_cc_gancho_entregas(operacao): O UNICO lugar do gancho. So' age em venda/compra em conta corrente, fora de rascunho,
--       nao cancelada e sem boitel; chama o dono `oc_sincronizar_entregas` (nenhum calculo novo) e devolve
--       {versao, sincronizou, avisos, criadas, atualizadas, canceladas}.
--       ⚠ A SAIDA NUNCA E' RECUSADA POR CAUSA DO FINANCEIRO: recusa de regra do sincronizador (P0001: lote sem valor, categoria
--       sem conta no plano) NAO derruba o gesto — vira o aviso 'entregas_nao_sincronizadas' e a saida fica pendente, como hoje
--       (a aba mostra "saida sem entrega" com o "Atualizar entregas"). Conflito de versao e os demais erros propagam.
--       ⚠ MES FECHADO: o sincronizador nao olha mes fechado e nenhum gatilho do financeiro recusa por isso; o gancho AVISA
--       ('mes_fechado', pelo criterio do vincular: P1 oficial da fazenda no mes da entrega) e grava. Havendo aviso, fica o evento
--       'aviso_entregas' na trilha da OC.
--   (2) as seis funcoes chamam o gancho no fim e devolvem 'versao' = a gravada, mais 'entregas' = o retorno do gancho.
--       oc_registrar_movimentacao e oc_estornar_movimentacao nao devolviam versao: passam a devolver (chave nova no jsonb).
--       Nenhuma assinatura muda. Em OC titulo / boitel / rascunho o gancho nao age e a versao e' a de sempre.
-- Seis corpos por PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
--   oc_registrar_movimentacao   78d438c73c2bf6f09e5d5e8a111d4022 -> 6c4e0fcc31475d7f4e370a6deaa9ac8d
--   oc_adotar_movimentacao      5a260b0b4bd86f595c5f65fe97f69a9f -> 790f704c8f2d3b73ff5f44b5dc9c331b
--   oc_estornar_movimentacao    27a56ed50136669535e779a3fe88c9b4 -> 3c1eba11608ccd0e2675418f29001dec
--   oc_encerrar_entrega         4d05fe602e70a968f2476c2fb8e0ba2a -> f21e288aa736cb430be5dd570c870522
--   oc_receber_lotes            7a89fdc40895f21c0dd704893206aeb7 -> cb3e43db4f291518826eaac9129da751
--   oc_desvincular_movimentacao 9dc0a38f7413665a91d28250a6e87ea7 -> f6779beccea005c7bff7d20897f6d656
-- NENHUM DADO E' ALTERADO. ACL, SECURITY e search_path preservados (so' o corpo troca).

CREATE OR REPLACE FUNCTION public._oc_cc_gancho_entregas(p_operacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_x jsonb; v_avisos jsonb := '[]'::jsonb; v_sinc boolean := false; v_mes text;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('versao', NULL, 'sincronizou', false, 'avisos', v_avisos); END IF;
  IF v_op.modelo_financeiro = 'conta_corrente' AND v_op.tipo_operacao IN ('venda', 'compra')
     AND v_op.rascunho IS NOT TRUE AND v_op.status_comercial <> 'cancelada'
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_boitel b WHERE b.operacao_id = p_operacao_id) THEN
    BEGIN
      v_x := public.oc_sincronizar_entregas(p_operacao_id, v_op.versao, false);
      v_sinc := true;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      -- a saida nao e' recusada por causa do financeiro: fica pendente, com o motivo
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'entregas_nao_sincronizadas', 'motivo', SQLERRM));
    END;
    IF v_sinc AND v_op.fazenda_id IS NOT NULL THEN
      FOR v_mes IN
        SELECT DISTINCT left(e->>'data', 7)
          FROM jsonb_array_elements(coalesce(v_x->'criadas', '[]'::jsonb) || coalesce(v_x->'atualizadas', '[]'::jsonb)) e
         WHERE e->>'data' IS NOT NULL
         ORDER BY 1
      LOOP
        IF (public._fn_status_pilares_fechamento(v_op.fazenda_id, v_mes)->'p1_mapa_pastos'->>'status') = 'oficial' THEN
          v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'mes_fechado', 'mes', v_mes));
        END IF;
      END LOOP;
    END IF;
    IF jsonb_array_length(v_avisos) > 0 THEN
      INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
      VALUES (v_op.cliente_id, p_operacao_id, 'aviso_entregas', jsonb_build_object('avisos', v_avisos), auth.uid(), 'rpc');
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'versao', (SELECT o.versao FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id),
    'sincronizou', v_sinc, 'avisos', v_avisos,
    'criadas', coalesce(jsonb_array_length(v_x->'criadas'), 0),
    'atualizadas', coalesce(jsonb_array_length(v_x->'atualizadas'), 0),
    'canceladas', coalesce(jsonb_array_length(v_x->'canceladas'), 0));
END
$function$;
REVOKE ALL ON FUNCTION public._oc_cc_gancho_entregas(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp._oc_cc_01b_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO STRICT v_src, v_def FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01b: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01b: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01b: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01b: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $patch$;

SELECT pg_temp._oc_cc_01b_patch('oc_registrar_movimentacao', '78d438c73c2bf6f09e5d5e8a111d4022', '6c4e0fcc31475d7f4e370a6deaa9ac8d', ARRAY[
$a$  v_tipo_venda text;$a$,
$b$  v_tipo_venda text;
  v_g jsonb;$b$,
$a$  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'lote_id', p_lote_id, 'lancamento_id', v_lanc, 'movimentacao_id', v_link, 'valor_total', v_valor);$a$,
$b$  -- OC-CC-PADRAO-NOVAS-01b: em conta corrente a entrega nasce junto com a saida; a versao devolvida e' a gravada
  v_g := public._oc_cc_gancho_entregas(p_operacao_id);
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'lote_id', p_lote_id, 'lancamento_id', v_lanc, 'movimentacao_id', v_link, 'valor_total', v_valor,
                            'versao', (v_g->>'versao')::int, 'entregas', v_g);$b$]);

SELECT pg_temp._oc_cc_01b_patch('oc_adotar_movimentacao', '5a260b0b4bd86f595c5f65fe97f69a9f', '790f704c8f2d3b73ff5f44b5dc9c331b', ARRAY[
$a$  v_link uuid;$a$,
$b$  v_link uuid;
  v_g jsonb;$b$,
$a$  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,$a$,
$b$  -- OC-CC-PADRAO-NOVAS-01b: em conta corrente a entrega nasce junto com a saida adotada; a versao devolvida e' a gravada
  v_g := public._oc_cc_gancho_entregas(p_operacao_id);
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', (v_g->>'versao')::int, 'entregas', v_g,$b$]);

SELECT pg_temp._oc_cc_01b_patch('oc_estornar_movimentacao', '27a56ed50136669535e779a3fe88c9b4', '3c1eba11608ccd0e2675418f29001dec', ARRAY[
$a$  v_op public.zoo_operacoes_comerciais;$a$,
$b$  v_op public.zoo_operacoes_comerciais;
  v_g jsonb;$b$,
$a$  RETURN jsonb_build_object('ok', true, 'movimentacao_id', p_movimentacao_id, 'estornado', true);$a$,
$b$  -- OC-CC-PADRAO-NOVAS-01b: em conta corrente a entrega da saida estornada e' cancelada junto; a versao devolvida e' a gravada
  v_g := public._oc_cc_gancho_entregas(v_link.operacao_id);
  RETURN jsonb_build_object('ok', true, 'movimentacao_id', p_movimentacao_id, 'estornado', true,
                            'operacao_id', v_link.operacao_id, 'versao', (v_g->>'versao')::int, 'entregas', v_g);$b$]);

SELECT pg_temp._oc_cc_01b_patch('oc_encerrar_entrega', '4d05fe602e70a968f2476c2fb8e0ba2a', 'f21e288aa736cb430be5dd570c870522', ARRAY[
$a$  v_soma numeric;$a$,
$b$  v_soma numeric;
  v_g jsonb;$b$,
$a$  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'entrega_encerrada', true);$a$,
$b$  -- OC-CC-PADRAO-NOVAS-01b: encerrar confere as entregas da conta corrente; a versao devolvida e' a gravada
  v_g := public._oc_cc_gancho_entregas(p_operacao_id);
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', (v_g->>'versao')::int, 'entrega_encerrada', true, 'entregas', v_g);$b$]);

SELECT pg_temp._oc_cc_01b_patch('oc_receber_lotes', '7a89fdc40895f21c0dd704893206aeb7', 'cb3e43db4f291518826eaac9129da751', ARRAY[
$a$  v_count int := 0;$a$,
$b$  v_count int := 0;
  v_g jsonb;$b$,
$a$  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'recebidos', v_count);$a$,
$b$  -- OC-CC-PADRAO-NOVAS-01b: cada registro ja' sincronizou as entregas; aqui so' se le^ a versao gravada (o gancho nao repete nada)
  v_g := public._oc_cc_gancho_entregas(p_operacao_id);
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', (v_g->>'versao')::int, 'recebidos', v_count, 'entregas', v_g);$b$]);

SELECT pg_temp._oc_cc_01b_patch('oc_desvincular_movimentacao', '9dc0a38f7413665a91d28250a6e87ea7', 'f6779beccea005c7bff7d20897f6d656', ARRAY[
$a$  v_op public.zoo_operacoes_comerciais;$a$,
$b$  v_op public.zoo_operacoes_comerciais;
  v_g jsonb;$b$,
$a$  RETURN jsonb_build_object('ok', true, 'operacao_id', v_op.id, 'versao', v_op.versao + 1,$a$,
$b$  -- OC-CC-PADRAO-NOVAS-01b: em conta corrente a entrega da saida desvinculada e' cancelada junto; a versao devolvida e' a gravada
  v_g := public._oc_cc_gancho_entregas(v_op.id);
  RETURN jsonb_build_object('ok', true, 'operacao_id', v_op.id, 'versao', (v_g->>'versao')::int, 'entregas', v_g,$b$]);

DROP FUNCTION pg_temp._oc_cc_01b_patch(text, text, text, text[]);

DO $confere$
begin
  if has_function_privilege('anon', 'public._oc_cc_gancho_entregas(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_cc_gancho_entregas(uuid)', 'EXECUTE') then
    raise exception 'OC-CC-PADRAO-NOVAS-01b: _oc_cc_gancho_entregas nao pode ser executavel pela tela';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('oc_registrar_movimentacao', 'oc_adotar_movimentacao', 'oc_estornar_movimentacao', 'oc_encerrar_entrega',
                                'oc_receber_lotes', 'oc_desvincular_movimentacao')
              and (has_function_privilege('anon', p.oid, 'EXECUTE') or not has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
    raise exception 'OC-CC-PADRAO-NOVAS-01b: ACL das seis funcoes mudou';
  end if;
end
$confere$;
