-- PR-OC-VENDA-FIN-PREVISAO-01D — o ajuste de valor do compromisso ao REALIZADO.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. O arquiteto aplicou este SQL no Proto sob o
-- registro 20260830145315; este arquivo o guarda no repositorio, VERBATIM.
--
-- POR QUE ELA PRECISOU EXISTIR. Nao havia caminho oficial de ajustar o valor de um
-- compromisso: varrendo o `pg_proc`, apenas TRES funcoes faziam
-- `UPDATE zoo_operacao_compromissos SET` — `oc_cancelar_compromisso`,
-- `oc_cancelar_programacao` e `oc_programar_compromisso` — e as tres mexiam SO em
-- `status`. Nenhuma tocava `valor_total`.
--
-- ⚠ E AFROUXAR SO' A TELA NAO RESOLVERIA. O teto tambem vive no banco:
--
--     -- oc_programar_compromisso
--     IF round(v_soma_novo + v_soma_outras, 2) > round(v_comp.valor_total, 2) THEN
--       RAISE EXCEPTION 'Soma das parcelas (%) excede o valor do compromisso (%).'
--
-- Medido na homologacao de 30/08: o real de 591.613,96 contra um previsto de 565.217,00
-- era recusado pela RPC, nao so' pelo dialogo.
--
-- O REALIZADO E SOBERANO, NOS DOIS SENTIDOS — e os dois defeitos da homologacao eram o
-- mesmo, um de cada lado:
--   real MAIOR  -> bloqueado pelo teto (regra de previsao aplicada ao real);
--   real MENOR  -> a linha seguia cobrando "falta programar" a diferenca. Medido na
--                  b58bf556: adiantamento 96.783,50 previsto x 95.243,50 real (sobra
--                  1.540,00), frete 10.500,00 x 7.983,60 (2.516,40), adiantamento
--                  devolvido 96.783,50 x 96.769,50 (14,00). `saldo_a_programar` da view
--                  e' `valor_total - total_programado` e estava aritmeticamente certo —
--                  errada era a regua: quando o real chega, o previsto deixa de ser ela.
-- Com o valor ajustado ao real, o teto de programacao volta a vigiar o numero certo e a
-- sobra fantasma desaparece na origem, e nao por maquiagem de tela.
--
-- GUARDS: a familia de `oc_cancelar_compromisso` — acesso, versao esperada, rascunho,
-- operacao cancelada, status em (aberto, programado), novo_valor > 0 e motivo
-- obrigatorio. Idempotente quando o valor nao muda. Evento
-- 'ajustar_valor_compromisso' com valor_anterior/valor_novo. Devolve `operacao_versao`
-- (+1) — o front ENCADEIA por esse retorno, nunca pelo `ocApi.versao` do render.

CREATE OR REPLACE FUNCTION public.oc_ajustar_valor_compromisso(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_compromisso_id uuid, p_novo_valor numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais; v_comp public.zoo_operacao_compromissos;
  v_nova int;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  v_tem_acesso := (v_actor IS NOT NULL AND v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN RAISE EXCEPTION 'Sem permissao nesta operacao' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Ajuste de valor exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Operacao em rascunho' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compromisso % nao encontrado nesta operacao', p_compromisso_id USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status NOT IN ('aberto','programado') THEN
    RAISE EXCEPTION 'Compromisso % nao aceita ajuste de valor (status %)', p_compromisso_id, v_comp.status USING ERRCODE = 'P0001'; END IF;
  IF p_novo_valor IS NULL OR p_novo_valor <= 0 THEN
    RAISE EXCEPTION 'Novo valor deve ser maior que zero' USING ERRCODE = 'P0001'; END IF;
  IF round(p_novo_valor, 2) = round(v_comp.valor_total, 2) THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_op.versao,
      'compromisso_id', p_compromisso_id, 'valor_total', v_comp.valor_total); END IF;

  -- Sem teto da base aqui, de proposito: o gate da base vigia a CRIACAO por previsao;
  -- o ajuste e o REAL falando (realizado soberano, para cima e para baixo).
  -- O teto de programacao segue vigiando contra valor_total, que apos o ajuste e o real.
  -- A divergencia lote x compromisso que o ajuste do principal cria NAO se resolve aqui:
  -- e o territorio do REALIZADO-01 (lote revalora com o abate).
  UPDATE public.zoo_operacao_compromissos SET valor_total = round(p_novo_valor, 2), updated_at = now() WHERE id = p_compromisso_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'ajustar_valor_compromisso', to_jsonb(v_comp),
          jsonb_build_object('motivo', p_motivo, 'compromisso_id', p_compromisso_id,
            'valor_anterior', v_comp.valor_total, 'valor_novo', round(p_novo_valor, 2),
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
          v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova,
    'compromisso_id', p_compromisso_id, 'valor_anterior', v_comp.valor_total, 'valor_total', round(p_novo_valor, 2));
END;
$function$;
