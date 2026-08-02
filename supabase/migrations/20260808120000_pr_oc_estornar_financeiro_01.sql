-- PR-OC-ESTORNO-FINANCEIRO-01 — 3 writers GRANULARES do estorno financeiro da OC (modelo 3 níveis).
--   Reverte, folha→raiz e SEM coordenador, o que a materialização criou:
--     oc_estornar_materializacao  (parcela: título+parte; parcela materializada→PREVISTA — E1)
--     oc_cancelar_programacao     (parcelas previstas→canceladas; programação→cancelada; compromisso→ABERTO — E2)
--     oc_cancelar_compromisso     (compromisso aberto/programado sem efeitos→cancelado)
--   Append-only: NADA é deletado (título=cancelado=true, parte=cancelada=true, demais por status). Cada writer:
--   version-lock próprio + UM versao+1 por sucesso + motivo obrigatório + estorno_id opcional + evento próprio.
--   E3 BLOQUEIO DURO: materialização com título liquidado/conciliado, parcela paga, QUALQUER liquidação ativa
--   (manual ou automática) ou conciliação bancária ativa → P0001 (não desfaz pagamento/conciliação em cascata).
--   E5 RETOMÁVEL: oc_estornar_materializacao completa etapas faltantes de um estado parcialmente revertido
--   (título já cancelado→não regrava/não gera evento falso); cadeia inteira já revertida → P0001 idempotente.
--   Guard financeiro nativo guard_zoo_financeiro_cancelamento_realizado NÃO protege títulos OC
--   (movimentacao_rebanho_id NULL) → a proteção é feita aqui. Sem P1 no financeiro (P1 é só do zootécnico).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) ESTORNO DE UMA MATERIALIZAÇÃO (folha) — título+parte revertidos; parcela volta a 'prevista'.
CREATE OR REPLACE FUNCTION public.oc_estornar_materializacao(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer,
  p_programacao_id uuid, p_parcela_id uuid, p_motivo text, p_estorno_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_prog public.zoo_operacao_programacoes;
  v_parcela public.zoo_operacao_parcelas_programacao;
  v_parte public.zoo_operacao_partes;
  v_fl public.financeiro_lancamentos_v2;
  v_estorno_id uuid;
  v_tit_cancel_antes boolean; v_parte_cancel_antes boolean; v_parcela_status_antes text;
  v_feitas jsonb := '[]'::jsonb; v_ja jsonb := '[]'::jsonb;
  v_nova int;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  v_tem_acesso := (v_actor IS NOT NULL AND v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Estorno exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Operacao em rascunho' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_prog FROM public.zoo_operacao_programacoes WHERE id = p_programacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programacao % nao encontrada', p_programacao_id USING ERRCODE = 'P0001'; END IF;
  IF v_prog.status <> 'ativa' THEN
    RAISE EXCEPTION 'Programacao nao esta ativa (estado %).', v_prog.status USING ERRCODE = 'P0001'; END IF;
  -- pertence a esta OC (via compromisso)
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_compromissos c
                  WHERE c.id = v_prog.compromisso_id AND c.operacao_id = p_operacao_id AND c.cliente_id = p_cliente_id) THEN
    RAISE EXCEPTION 'Programacao pertence a outra operacao' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_parcela FROM public.zoo_operacao_parcelas_programacao
    WHERE id = p_parcela_id AND programacao_id = p_programacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela % nao encontrada nesta programacao', p_parcela_id USING ERRCODE = 'P0001'; END IF;

  -- parte materializada desta parcela (>=0; unica ativa por parcela). Pode já estar cancelada (estado parcial).
  SELECT * INTO v_parte FROM public.zoo_operacao_partes
    WHERE programacao_parcela_id = p_parcela_id AND cliente_id = p_cliente_id
    ORDER BY cancelada ASC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela sem parte materializada; nada a estornar' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_fl FROM public.financeiro_lancamentos_v2
    WHERE id = v_parte.financeiro_lancamento_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Titulo da parte nao encontrado' USING ERRCODE = 'P0001'; END IF;

  -- Identidade 1:1:1 (T12)
  IF round(abs(v_fl.valor)::numeric,2) <> round(v_parcela.valor::numeric,2)
     OR round(v_parte.valor::numeric,2) <> round(v_parcela.valor::numeric,2) THEN
    RAISE EXCEPTION 'Divergencia de identidade parte/parcela/titulo; estorno bloqueado' USING ERRCODE = 'P0001'; END IF;

  -- E3 — BLOQUEIO DURO (roda mesmo no caminho de conclusão parcial; nada é desfeito em cascata).
  IF v_fl.status_transacao IN ('realizado','conciliado')
     OR v_fl.conciliado_em IS NOT NULL
     OR v_parcela.status = 'paga'
     OR EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes l
                 WHERE l.financeiro_lancamento_id = v_fl.id AND l.estornado IS NOT TRUE)
     OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                 WHERE cbi.lancamento_id = v_fl.id AND cbi.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao.' USING ERRCODE = 'P0001'; END IF;

  v_tit_cancel_antes := coalesce(v_fl.cancelado,false);
  v_parte_cancel_antes := coalesce(v_parte.cancelada,false);
  v_parcela_status_antes := v_parcela.status;

  -- Idempotência total (E5): cadeia já revertida → P0001, sem nova versão/evento.
  IF v_tit_cancel_antes AND v_parte_cancel_antes AND v_parcela_status_antes IN ('prevista','cancelada') THEN
    RAISE EXCEPTION 'A materializacao ja esta estornada' USING ERRCODE = 'P0001'; END IF;

  v_estorno_id := coalesce(p_estorno_id, gen_random_uuid());

  -- Título ativo → cancelado (dispara auto-estorno de liq. automática [nenhuma, por E3] e desfaz-conciliação [nenhuma]).
  IF NOT v_tit_cancel_antes THEN
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,
           updated_at = now(), updated_by = v_actor
     WHERE id = v_fl.id;
    v_feitas := v_feitas || '["titulo_cancelado"]'::jsonb;
  ELSE v_ja := v_ja || '["titulo_ja_cancelado"]'::jsonb; END IF;

  -- Parte ativa → cancelada (libera o índice unico parcial da parcela; NÃO altera financeiro_lancamento_id).
  IF NOT v_parte_cancel_antes THEN
    UPDATE public.zoo_operacao_partes
       SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = p_motivo, updated_at = now()
     WHERE id = v_parte.id;
    v_feitas := v_feitas || '["parte_cancelada"]'::jsonb;
  ELSE v_ja := v_ja || '["parte_ja_cancelada"]'::jsonb; END IF;

  -- Parcela materializada → prevista (E1: programação segue válida; pode rematerializar).
  IF v_parcela_status_antes = 'materializada' THEN
    UPDATE public.zoo_operacao_parcelas_programacao SET status = 'prevista', updated_at = now() WHERE id = p_parcela_id;
    v_feitas := v_feitas || '["parcela_prevista"]'::jsonb;
  ELSE v_ja := v_ja || jsonb_build_array('parcela_'||v_parcela_status_antes); END IF;

  IF jsonb_array_length(v_feitas) = 0 THEN
    RAISE EXCEPTION 'A materializacao ja esta estornada' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'estornar_materializacao',
          jsonb_build_object('titulo', to_jsonb(v_fl), 'parte', to_jsonb(v_parte), 'parcela', to_jsonb(v_parcela)),
          jsonb_build_object('titulo_cancelado', true, 'parte_cancelada', true, 'parcela_status', 'prevista'),
          jsonb_build_object('estorno_id', v_estorno_id, 'motivo', p_motivo,
            'programacao_id', p_programacao_id, 'parcela_id', p_parcela_id, 'parte_id', v_parte.id, 'titulo_id', v_fl.id,
            'valor', v_parcela.valor, 'etapas_ja_concluidas', v_ja, 'etapas_executadas', v_feitas,
            'estado_anterior', jsonb_build_object('titulo_cancelado', v_tit_cancel_antes, 'parte_cancelada', v_parte_cancel_antes, 'parcela_status', v_parcela_status_antes),
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
          v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova, 'estorno_id', v_estorno_id,
    'programacao_id', p_programacao_id, 'parcela_id', p_parcela_id, 'parte_id', v_parte.id, 'titulo_id', v_fl.id,
    'valor', v_parcela.valor, 'etapas_executadas', v_feitas, 'etapas_ja_concluidas', v_ja);
END;
$$;

-- 2) CANCELAR PROGRAMAÇÃO — só após as materializações estornadas; compromisso volta a 'aberto' (E2).
CREATE OR REPLACE FUNCTION public.oc_cancelar_programacao(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer,
  p_programacao_id uuid, p_motivo text, p_estorno_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais; v_prog public.zoo_operacao_programacoes; v_comp public.zoo_operacao_compromissos;
  v_estorno_id uuid; v_parc_cancel int; v_comp_reaberto boolean := false; v_nova int;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  v_tem_acesso := (v_actor IS NOT NULL AND v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN RAISE EXCEPTION 'Sem permissao nesta operacao' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Cancelamento exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Operacao em rascunho' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_prog FROM public.zoo_operacao_programacoes WHERE id = p_programacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programacao % nao encontrada', p_programacao_id USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = v_prog.compromisso_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programacao pertence a outra operacao' USING ERRCODE = 'P0001'; END IF;
  IF v_prog.status = 'cancelada' THEN RAISE EXCEPTION 'Programacao ja cancelada' USING ERRCODE = 'P0001'; END IF;   -- idempotente
  IF v_prog.status <> 'ativa' THEN
    RAISE EXCEPTION 'Programacao nao esta ativa (estado %); renegociacao tem fluxo proprio.', v_prog.status USING ERRCODE = 'P0001'; END IF;

  -- Guard: nenhuma materialização remanescente.
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_parcelas_programacao pp
              WHERE pp.programacao_id = p_programacao_id AND pp.status IN ('materializada','paga')) THEN
    RAISE EXCEPTION 'Estorne as materializacoes das parcelas antes de cancelar a programacao.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
              JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
              WHERE pp.programacao_id = p_programacao_id AND pt.cancelada IS NOT TRUE) THEN
    RAISE EXCEPTION 'Existe parte ativa vinculada a esta programacao; estorne a materializacao antes.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
              JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
              JOIN public.financeiro_lancamentos_v2 fl ON fl.id = pt.financeiro_lancamento_id
              WHERE pp.programacao_id = p_programacao_id AND fl.cancelado IS NOT TRUE) THEN
    RAISE EXCEPTION 'Existe titulo ativo vinculado a esta programacao; estorne a materializacao antes.' USING ERRCODE = 'P0001'; END IF;

  v_estorno_id := coalesce(p_estorno_id, gen_random_uuid());
  UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now()
   WHERE programacao_id = p_programacao_id AND status = 'prevista';
  GET DIAGNOSTICS v_parc_cancel = ROW_COUNT;
  UPDATE public.zoo_operacao_programacoes SET status = 'cancelada', updated_at = now() WHERE id = p_programacao_id;
  IF v_comp.status = 'programado' THEN
    UPDATE public.zoo_operacao_compromissos SET status = 'aberto', updated_at = now() WHERE id = v_comp.id;
    v_comp_reaberto := true;
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'cancelar_programacao', to_jsonb(v_prog),
          jsonb_build_object('estorno_id', v_estorno_id, 'motivo', p_motivo, 'programacao_id', p_programacao_id,
            'compromisso_id', v_comp.id, 'parcelas_canceladas', v_parc_cancel, 'compromisso_reaberto', v_comp_reaberto,
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
          v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova, 'estorno_id', v_estorno_id,
    'programacao_id', p_programacao_id, 'compromisso_id', v_comp.id, 'parcelas_canceladas', v_parc_cancel,
    'compromisso_reaberto', v_comp_reaberto);
END;
$$;

-- 3) CANCELAR COMPROMISSO — só sem programação ativa e sem efeitos; 'aberto'/'programado'→'cancelado'.
CREATE OR REPLACE FUNCTION public.oc_cancelar_compromisso(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer,
  p_compromisso_id uuid, p_motivo text, p_estorno_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais; v_comp public.zoo_operacao_compromissos;
  v_estorno_id uuid; v_nova int;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  v_tem_acesso := (v_actor IS NOT NULL AND v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN RAISE EXCEPTION 'Sem permissao nesta operacao' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Cancelamento exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Operacao em rascunho' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compromisso % nao encontrado nesta operacao', p_compromisso_id USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'cancelado' THEN RAISE EXCEPTION 'Compromisso ja cancelado' USING ERRCODE = 'P0001'; END IF;   -- idempotente

  -- Guards: zero programação ativa; zero materialização/pagamento; zero parte/título ativo.
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_programacoes pr
              WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa') THEN
    RAISE EXCEPTION 'Cancele a programacao ativa antes de cancelar o compromisso.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_parcelas_programacao pp
              JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
              WHERE pr.compromisso_id = p_compromisso_id AND pp.status IN ('materializada','paga')) THEN
    RAISE EXCEPTION 'Existe parcela materializada/paga; estorne antes de cancelar o compromisso.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
              JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
              JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
              WHERE pr.compromisso_id = p_compromisso_id
                AND (pt.cancelada IS NOT TRUE OR EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 fl
                      WHERE fl.id = pt.financeiro_lancamento_id AND fl.cancelado IS NOT TRUE))) THEN
    RAISE EXCEPTION 'Existe parte/titulo ativo; estorne a materializacao antes de cancelar o compromisso.' USING ERRCODE = 'P0001'; END IF;

  v_estorno_id := coalesce(p_estorno_id, gen_random_uuid());
  UPDATE public.zoo_operacao_compromissos SET status = 'cancelado', updated_at = now() WHERE id = p_compromisso_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'cancelar_compromisso', to_jsonb(v_comp),
          jsonb_build_object('estorno_id', v_estorno_id, 'motivo', p_motivo, 'compromisso_id', p_compromisso_id,
            'status_anterior', v_comp.status, 'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
          v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova, 'estorno_id', v_estorno_id,
    'compromisso_id', p_compromisso_id, 'status', 'cancelado');
END;
$$;

-- Grants: RPCs públicas soberanas (UI autenticada + service_role). O controle fino é o guard interno.
REVOKE ALL ON FUNCTION public.oc_estornar_materializacao(uuid,uuid,integer,uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_estornar_materializacao(uuid,uuid,integer,uuid,uuid,text,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_cancelar_programacao(uuid,uuid,integer,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_cancelar_programacao(uuid,uuid,integer,uuid,text,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_cancelar_compromisso(uuid,uuid,integer,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_cancelar_compromisso(uuid,uuid,integer,uuid,text,uuid) TO authenticated, service_role;
