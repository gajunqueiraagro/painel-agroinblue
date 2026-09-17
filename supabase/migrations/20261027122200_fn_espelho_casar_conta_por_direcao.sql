-- ESPELHO — casar preenche a conta do lancamento POR DIRECAO (fn_espelho_casar, 1 extrato : N).
--
-- (a) No UPDATE que promove o lancamento a realizado, a conta do extrato entra na coluna da
--     DIRECAO, so quando ela esta vazia: sinal '-1' (saida) -> conta_bancaria_id; sinal '1'
--     (entrada) -> conta_destino_id. E o WHERE passa a disparar tambem quando so a conta falta.
--     E o que permite casar candidato SEM conta: antes ele virava realizado sem conta e sumia do
--     saldo de qualquer conta. Validacoes, soma/tolerancia 0,01, vinculo, grupo e retorno: iguais.
--
-- (b) ⚠ ESTA MIGRATION TAMBEM VERSIONA UMA VERSAO QUE NUNCA ESTEVE NO REPO. O repo tinha a
--     definicao de 20260909135144 (corpo md5 320d43b4ea2a18d85f8f4a0ed15a3eee, 3234), mas o banco
--     ja rodava outra — com a direcao por `tipo_operacao` (`v_dir`, motivo `direcao_indefinida`) e
--     o alvo COM sinal (`v_alvo := v_ext.valor`, soma `v_dir * v_val`) — corpo md5
--     b4f4860e99df692399d04682db56df3f, 3674. O texto abaixo parte dessa versao do banco.
--
-- Copiado do pg_get_functiondef do proto e conferido lendo este arquivo:
--   corpo (prosrc): md5 da53db4818c2ef6c0c1afd9deb315594, len 4074
--   definicao completa: md5 1e5c1790edcd86906d4b2ebeee80705c, len 4344

CREATE OR REPLACE FUNCTION public.fn_espelho_casar(p_extrato_id uuid, p_itens jsonb, p_simular boolean DEFAULT true, p_motivo text DEFAULT 'casado_no_espelho'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ext record; v_uid uuid := auth.uid(); v_agora timestamptz := now();
  v_item jsonb; v_lan record; v_soma numeric := 0; v_alvo numeric; v_n int := 0;
  v_ids uuid[] := '{}'; v_vals numeric[] := '{}'; v_r jsonb; v_lid uuid; v_val numeric; v_dir int;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id AND cancelado_em IS NULL;
  IF v_ext.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado'); END IF;
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado');
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_itens');
  END IF;
  v_alvo := v_ext.valor;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_lid := (v_item->>'lancamento_id')::uuid;
    SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = v_lid;
    IF v_lan.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_encontrado', 'lancamento_id', v_lid); END IF;
    IF v_lan.cliente_id <> v_ext.cliente_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'lancamento_id', v_lid); END IF;
    IF COALESCE(v_lan.cancelado, false) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado', 'lancamento_id', v_lid); END IF;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE lancamento_id = v_lid AND desfeito_em IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado', 'lancamento_id', v_lid);
    END IF;
    v_val := abs(COALESCE((v_item->>'valor')::numeric, v_lan.valor));
    IF v_val <= 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'valor_invalido', 'lancamento_id', v_lid); END IF;
    v_dir := CASE WHEN v_lan.tipo_operacao LIKE '1-%' THEN 1 WHEN v_lan.tipo_operacao LIKE '2-%' THEN -1 WHEN v_lan.tipo_operacao LIKE '3-%' THEN (CASE WHEN v_lan.conta_destino_id = v_ext.conta_bancaria_id THEN 1 WHEN v_lan.conta_bancaria_id = v_ext.conta_bancaria_id THEN -1 ELSE 0 END) ELSE 0 END;
    IF v_dir = 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'direcao_indefinida', 'lancamento_id', v_lid); END IF;
    v_ids := v_ids || v_lid; v_vals := v_vals || v_val; v_soma := v_soma + v_dir * v_val; v_n := v_n + 1;
  END LOOP;

  IF abs(v_soma - v_alvo) > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_nao_bate', 'no_extrato', v_alvo, 'soma', v_soma, 'diferenca', round(v_soma - v_alvo, 2));
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'no_extrato', v_alvo, 'soma', v_soma, 'itens', v_n, 'data_extrato', v_ext.data_movimento);
  END IF;

  FOR i IN 1..v_n LOOP
    UPDATE financeiro_lancamentos_v2
       SET valor = v_vals[i],
           data_pagamento = v_ext.data_movimento,
           status_transacao = 'realizado',
           conta_bancaria_id = CASE WHEN sinal = '-1' THEN COALESCE(conta_bancaria_id, v_ext.conta_bancaria_id) ELSE conta_bancaria_id END,
           conta_destino_id  = CASE WHEN sinal = '1'  THEN COALESCE(conta_destino_id,  v_ext.conta_bancaria_id) ELSE conta_destino_id  END,
           updated_by = v_uid, updated_at = v_agora
     WHERE id = v_ids[i]
       AND (valor IS DISTINCT FROM v_vals[i] OR data_pagamento IS DISTINCT FROM v_ext.data_movimento OR status_transacao IS DISTINCT FROM 'realizado'
            OR (sinal = '-1' AND conta_bancaria_id IS NULL)
            OR (sinal = '1'  AND conta_destino_id  IS NULL));
  END LOOP;

  IF v_n = 1 THEN
    PERFORM public.fn_vincular_extrato_lancamento(p_extrato_id, v_ids[1], v_vals[1]);
  ELSE
    PERFORM public.fn_vincular_grupo_conciliacao(p_extrato_id, v_ids, v_vals, p_motivo);
  END IF;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'no_extrato', v_alvo, 'soma', v_soma, 'itens', v_n, 'data_extrato', v_ext.data_movimento, 'ids', to_jsonb(v_ids));
END $function$;
