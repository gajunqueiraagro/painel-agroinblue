-- REVERTER O CANCELAMENTO DE UM MOVIMENTO — a volta que o cancelar nunca teve.
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO.
-- Copiada do pg_get_functiondef do proto e conferida lendo este arquivo:
--   corpo (prosrc):     md5 30a22fc0e42b3bdc5ff8698ebdcddda5, len 1605
--   definicao completa: md5 c50e44fba475117eea1f6e7bf06032af, len 1795
-- ⚠ ESTA CHEGOU INTEIRA: ao contrario da 20261027123100, ela nao tem comentario dentro do corpo,
-- entao nao havia o que se perder no caminho. O md5 bateu na primeira conferencia.
--
-- ⚠ ELA FOI APLICADA, e a decisao e do Gabriel: a volta entra junto com a ida, pelo argumento
-- abaixo. O arquivo continua destacavel em espirito — a funcao de cancelar nao depende dela.
--
-- POR QUE ELA VEM JUNTO: o PR que a motivou nasceu de uma via sem volta — "voce fazer no banco e
-- uma coisa; eu preciso que o SISTEMA me permita identificar se importei errado e arrumar". Dar
-- ao operador um botao que cancela e nao desfaz seria repetir o mesmo defeito um degrau adiante:
-- quem clicar na linha errada volta a depender de quem tem acesso ao banco. O IGNORAR ja tem a
-- sua volta (`fn_reverter_desconsideracao_extrato`), e esta funcao e o espelho dela — mesma
-- forma, mesmas guardas, outra coluna.
--
-- ⚠ RECUSA QUANDO O CANCELAMENTO VEIO DO DESFAZER POR ARQUIVO (`cancelado_motivo =
-- 'importacao_desfeita'`), e a recusa e o ponto: aquele ato cancelou o arquivo INTEIRO, e
-- ressuscitar uma linha isolada dele devolveria ao extrato um pedaco de uma importacao que o
-- operador declarou nao existir — o mes passaria a ter um movimento sem os irmaos. Quem desfez o
-- arquivo reimporta o arquivo, que e o caminho que ja existe e ja tem previa.

CREATE OR REPLACE FUNCTION public.fn_reverter_cancelamento_extrato(p_extrato_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ext extrato_bancario_v2%ROWTYPE;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin_agroinblue(v_uid) OR v_ext.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente.' USING ERRCODE = '42501';
  END IF;

  IF v_ext.cancelado_em IS NULL THEN
    RAISE EXCEPTION 'Este movimento nao esta cancelado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_ext.cancelado_motivo = 'importacao_desfeita' THEN
    RAISE EXCEPTION 'Este movimento saiu junto com a importacao inteira. Reimporte o arquivo para traze-lo de volta.'
      USING ERRCODE = '55006';
  END IF;

  UPDATE extrato_bancario_v2
     SET cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL
   WHERE id = p_extrato_id;

  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, importacao_id, ano_mes, motivo, payload_antes, payload_depois)
  VALUES
    ('movimento_cancelamento_revertido', v_uid, v_ext.cliente_id, p_extrato_id, v_ext.importacao_id,
     to_char(v_ext.data_movimento, 'YYYY-MM'), v_ext.cancelado_motivo,
     jsonb_build_object('cancelado_em', v_ext.cancelado_em, 'cancelado_por', v_ext.cancelado_por,
       'cancelado_motivo', v_ext.cancelado_motivo),
     jsonb_build_object('cancelado_em', NULL));

  RETURN jsonb_build_object('ok', true, 'extrato_id', p_extrato_id,
    'ano_mes', to_char(v_ext.data_movimento, 'YYYY-MM'));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_reverter_cancelamento_extrato(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reverter_cancelamento_extrato(uuid) TO authenticated;
