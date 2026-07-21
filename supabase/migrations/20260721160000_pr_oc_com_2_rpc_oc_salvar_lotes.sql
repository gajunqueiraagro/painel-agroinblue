-- PR-OC-COM-2 — RPC oc_salvar_lotes: cria/SUBSTITUI os lotes comerciais de uma operacao.
--   Escrita SOBERANA e UNICA em zoo_operacao_lotes (a tabela so concede SELECT a authenticated;
--   esta funcao e SECURITY DEFINER e escreve como owner). Estrategia REPLACE (apaga os lotes
--   atuais da operacao e reinsere o array), preservando a ordem informada.
--   NAO cria lancamentos, NAO toca Financeiro/FINV2, NAO mexe em movimentacoes.
--   Guardas: tenant + operacao; bloqueio em cancelada/fechada; lock otimista por versao.
--   Validacao controlada (P0001) de ordem/criterio/qtd/peso/valor antes de escrever; as CHECKs
--   do banco permanecem como ultima linha de defesa. Bump de versao/updated_* na operacao + evento.
-- NAO aplicar por este PR (aplicacao e etapa separada sob autorizacao).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.oc_salvar_lotes(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_lotes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_lote jsonb;
  v_ordem int; v_crit text; v_qtd int; v_peso numeric; v_valor numeric;
  v_ordens int[] := '{}';
  v_count int := 0;
BEGIN
  -- Acesso: admin global ou membro do cliente.
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;

  -- Operacao do tenant + lock.
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'fechada' THEN RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- Validacao controlada dos lotes (antes de qualquer escrita).
  FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
  LOOP
    v_ordem := NULLIF(v_lote->>'ordem','')::int;
    IF v_ordem IS NULL OR v_ordem < 1 THEN RAISE EXCEPTION 'Lote sem ordem valida (>=1)' USING ERRCODE = 'P0001'; END IF;
    IF v_ordem = ANY (v_ordens) THEN RAISE EXCEPTION 'Ordem % duplicada no payload de lotes', v_ordem USING ERRCODE = 'P0001'; END IF;
    v_ordens := array_append(v_ordens, v_ordem);
    v_crit := NULLIF(v_lote->>'criterio_valor','');
    IF v_crit IS NOT NULL AND v_crit NOT IN ('kg','cabeca','total') THEN
      RAISE EXCEPTION 'Criterio de valor invalido (lote ordem %): %', v_ordem, v_crit USING ERRCODE = 'P0001'; END IF;
    v_qtd := NULLIF(v_lote->>'qtd_negociada','')::int;
    IF v_qtd IS NOT NULL AND v_qtd <= 0 THEN RAISE EXCEPTION 'Quantidade do lote ordem % deve ser > 0', v_ordem USING ERRCODE = 'P0001'; END IF;
    v_peso := NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric;
    IF v_peso IS NOT NULL AND v_peso <= 0 THEN RAISE EXCEPTION 'Peso medio do lote ordem % deve ser > 0', v_ordem USING ERRCODE = 'P0001'; END IF;
    v_valor := NULLIF(v_lote->>'valor_informado','')::numeric;
    IF v_valor IS NOT NULL AND v_valor < 0 THEN RAISE EXCEPTION 'Valor informado do lote ordem % nao pode ser negativo', v_ordem USING ERRCODE = 'P0001'; END IF;
  END LOOP;

  -- REPLACE: apaga os lotes atuais da operacao e reinsere.
  DELETE FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id;
  FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
  LOOP
    INSERT INTO public.zoo_operacao_lotes (
      cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada,
      peso_medio_negociado_kg, criterio_valor, valor_informado, created_by, updated_by)
    VALUES (
      p_cliente_id, p_operacao_id, (v_lote->>'ordem')::int, NULLIF(v_lote->>'categoria_negociada',''),
      NULLIF(v_lote->>'qtd_negociada','')::int, NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric,
      NULLIF(v_lote->>'criterio_valor',''), NULLIF(v_lote->>'valor_informado','')::numeric, v_actor, v_actor);
    v_count := v_count + 1;
  END LOOP;

  -- Bump da operacao (updated_at/by + versao) e evento de auditoria. Sem tocar fisico/financeiro.
  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'salvar_lotes', p_lotes, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'lotes', v_count);
END;
$function$;

-- Grants minimos: execucao so por authenticated (escrita passa por aqui). anon/PUBLIC sem EXECUTE.
REVOKE ALL ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) TO authenticated;
