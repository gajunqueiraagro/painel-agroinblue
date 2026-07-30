-- PR-OC-CARLINHOS-01A — WRITER OFICIAL Financeiro -> Operacao Comercial (vinculo de titulo existente).
--
--   PROPOSITO (generico, NAO exclusivo do caso Carlinhos): dado um lancamento financeiro ja criado/
--   importado/conciliado (financeiro_lancamentos_v2) que ainda NAO possui vinculo com uma OC, esta RPC
--   vincula esse titulo EXISTENTE a uma obrigacao/parcela da Operacao Comercial. NENHUM lancamento
--   financeiro e criado ou alterado; o caixa NAO e duplicado; nao ha movimentacao animal nem documento.
--   O caso Carlinhos/Silvana e apenas a HOMOLOGACAO FUTURA deste fluxo (nao aplicado nesta migration).
--
--   MECANICA: insere UMA parte em zoo_operacao_partes referenciando o titulo (incluso_no_total=false,
--   origem='manual', valor=abs(titulo.valor)). O trigger vivo trg_oc_sync_liquidacao_parte
--   (PR-OC-FIN-LIQ-01A) chama a PONTE SOBERANA oc_sincronizar_liquidacao_de_financeiro(fid), que decide
--   liquidacao/valor/natureza/data/estorno/idempotencia. Esta RPC NAO duplica nenhuma regra da ponte.
--
--   AUTORIZACAO (NAO e admin-only): aceita (A) usuario autenticado com acesso ao cliente da OPERACAO
--   (get_user_cliente_ids); (B) admin AgroinBLUE; (C) service_role (auth.role()='service_role', mesmo com
--   auth.uid() NULL). anon nao tem grant; authenticated sem acesso ao cliente -> 42501. O cliente e SEMPRE
--   derivado da operacao (nunca do caller). Nao usar current_user/session_user (refletem o owner em
--   SECURITY DEFINER, nao o papel JWT).
--
--   INVARIANTES: tenant do titulo = tenant da OP; incluso_no_total FIXO false; origem FIXO 'manual';
--   valor = abs(titulo.valor); compatibilidade economica RIGIDA (tipo_operacao soberano '1-/2-/3-', sinal
--   confirmatorio; transferencia/neutro e tipo-x-sinal contraditorio => bloqueio); vinculos soberanos
--   incompativeis bloqueados (financiamento_id, movimentacao_rebanho_id, transferencia_grupo_id — 0 overlap
--   comprovado na base viva; contrato_id auditado e NAO bloqueado, apenas registrado); divergencia de
--   favorecido NAO bloqueia, exige confirmacao com motivo; UNIQUE global titulo_uniq preservado (titulo
--   ligado a parte cancelada => P0001, sem revinculo). Idempotente para re-chamada compativel.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao. NAO aplica dados do caso Carlinhos aqui.

CREATE OR REPLACE FUNCTION public.oc_adotar_titulo_financeiro(
  p_operacao_id uuid,
  p_financeiro_lancamento_id uuid,
  p_natureza text DEFAULT 'principal',
  p_componente text DEFAULT 'principal',
  p_sequencia_parcela integer DEFAULT 1,
  p_quantidade_parcelas integer DEFAULT 1,
  p_descricao text DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean;
  v_is_admin boolean;
  v_tem_acesso boolean;
  v_executor_role text;
  v_op public.zoo_operacoes_comerciais;
  v_f  public.financeiro_lancamentos_v2;
  v_parte public.zoo_operacao_partes;
  v_cli uuid;
  v_valor numeric;
  v_dir_por_tipo text;
  v_dir_por_sinal text;
  v_dir_titulo text;
  v_dir_esperada text;
  v_div_fav boolean;
  v_conf_div boolean;
  v_parte_id uuid;
  v_liq_id uuid;
BEGIN
  -- 1) AUTH — service_role, admin, OU usuario com acesso ao cliente da OPERACAO (cliente derivado da op).
  --    auth.role() e o helper Supabase ja usado no repo (RLS de storage); reconhece service_role mesmo
  --    com auth.uid() NULL. is_admin/get_user_cliente_ids so avaliam com v_actor != NULL.
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));

  -- 2) operacao FOR UPDATE — cliente DERIVADO da operacao; serializa adocoes concorrentes (a ponte relocka a MESMA linha).
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;

  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao para vincular titulo a esta Operacao Comercial (acesso ao cliente exigido)' USING ERRCODE = '42501';
  END IF;
  v_executor_role := CASE WHEN v_is_service THEN 'service_role'
                          WHEN v_is_admin  THEN 'authenticated_admin'
                          ELSE 'authenticated_cliente' END;

  IF v_op.rascunho OR v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao em rascunho/cancelada nao permite vinculo' USING ERRCODE = 'P0001';
  END IF;

  -- 3) titulo FOR UPDATE — impede corrida com baixa/cancelamento/mudanca de status/outro vinculo.
  SELECT * INTO v_f FROM public.financeiro_lancamentos_v2 WHERE id = p_financeiro_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Titulo % nao encontrado', p_financeiro_lancamento_id USING ERRCODE = 'P0002'; END IF;

  -- 4) tenant + integridade basica do titulo
  IF v_f.cliente_id IS DISTINCT FROM v_cli THEN
    RAISE EXCEPTION 'Titulo pertence a outro cliente (tenant divergente)' USING ERRCODE = 'P0001'; END IF;
  IF v_f.cancelado IS TRUE THEN
    RAISE EXCEPTION 'Titulo cancelado nao pode ser vinculado' USING ERRCODE = 'P0001'; END IF;
  v_valor := abs(v_f.valor);
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Titulo com valor invalido (%) para vinculo', v_f.valor USING ERRCODE = 'P0001'; END IF;

  -- 5) VINCULOS SOBERANOS INCOMPATIVEIS (bloqueio COMPROVADO: 0 overlap na base viva; ver relatorio).
  --    O titulo pertence a outro subsistema que ja detem o significado do caixa -> adotar duplicaria contagem.
  --    Auditado e NAO bloqueado: contrato_id (referencia comercial != posse exclusiva do caixa) -> so no evento.
  IF v_f.financiamento_id IS NOT NULL THEN
    RAISE EXCEPTION 'Titulo vinculado a financiamento nao pode ser adotado por OC' USING ERRCODE = 'P0001'; END IF;
  IF v_f.movimentacao_rebanho_id IS NOT NULL THEN
    RAISE EXCEPTION 'Titulo gerado por movimentacao de rebanho nao pode ser adotado por OC' USING ERRCODE = 'P0001'; END IF;
  IF v_f.transferencia_grupo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Titulo de transferencia entre contas nao pode ser adotado por OC' USING ERRCODE = 'P0001'; END IF;

  -- 6) COMPATIBILIDADE ECONOMICA (rigida). tipo_operacao e soberano ('1-'/'2-'/'3-'); sinal e confirmatorio
  --    (pode ser NULL). Transferencia/neutro e tipo-x-sinal contraditorio => bloqueio. Motivo nao contorna.
  v_dir_por_tipo := CASE left(COALESCE(v_f.tipo_operacao,''),2)
      WHEN '1-' THEN 'entrada' WHEN '2-' THEN 'saida' WHEN '3-' THEN 'transferencia' ELSE NULL END;
  v_dir_por_sinal := CASE v_f.sinal WHEN '1' THEN 'entrada' WHEN '-1' THEN 'saida' WHEN '0' THEN 'neutro' ELSE NULL END;
  IF v_dir_por_tipo = 'transferencia' OR v_dir_por_sinal = 'neutro' THEN
    RAISE EXCEPTION 'Titulo de transferencia/neutro nao possui sentido de compra ou venda' USING ERRCODE = 'P0001'; END IF;
  IF v_dir_por_tipo IN ('entrada','saida') AND v_dir_por_sinal IN ('entrada','saida')
     AND v_dir_por_tipo <> v_dir_por_sinal THEN
    RAISE EXCEPTION 'Titulo com tipo_operacao (%) e sinal (%) contraditorios entre si', v_f.tipo_operacao, v_f.sinal USING ERRCODE = 'P0001'; END IF;
  v_dir_titulo := COALESCE(
      CASE WHEN v_dir_por_tipo  IN ('entrada','saida') THEN v_dir_por_tipo  END,
      CASE WHEN v_dir_por_sinal IN ('entrada','saida') THEN v_dir_por_sinal END);
  IF v_dir_titulo IS NULL THEN
    RAISE EXCEPTION 'Sentido economico do titulo indefinido (tipo_operacao=%, sinal=%)', v_f.tipo_operacao, v_f.sinal USING ERRCODE = 'P0001'; END IF;
  v_dir_esperada := CASE v_op.tipo_operacao
      WHEN 'compra' THEN 'saida' WHEN 'venda' THEN 'entrada' WHEN 'abate' THEN 'entrada' ELSE NULL END;
  IF v_dir_esperada IS NULL THEN
    RAISE EXCEPTION 'Tipo de operacao (%) nao suportado para vinculo de titulo', v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF;
  IF v_dir_titulo IS DISTINCT FROM v_dir_esperada THEN
    RAISE EXCEPTION 'Sentido do titulo (%) incompativel com operacao % (esperado %)',
      v_dir_titulo, v_op.tipo_operacao, v_dir_esperada USING ERRCODE = 'P0001'; END IF;

  -- 7) catalogo natureza/componente + sequencia/quantidade
  IF NOT EXISTS (SELECT 1 FROM public.zoo_componentes_financeiros c WHERE c.natureza = p_natureza AND c.codigo = p_componente) THEN
    RAISE EXCEPTION 'Componente %/% inexistente no catalogo', p_natureza, p_componente USING ERRCODE = 'P0001'; END IF;
  IF p_quantidade_parcelas < 1 OR p_sequencia_parcela < 1 OR p_sequencia_parcela > p_quantidade_parcelas THEN
    RAISE EXCEPTION 'Sequencia/quantidade invalida (% de %)', p_sequencia_parcela, p_quantidade_parcelas USING ERRCODE = 'P0001'; END IF;

  -- 8) DIVERGENCIA DE FAVORECIDO — NAO bloqueia; exige confirmacao com motivo. IS DISTINCT FROM cobre nulos:
  --    ambos nulos => sem divergencia; um lado nulo e outro preenchido => divergencia.
  v_div_fav := (v_f.favorecido_id IS DISTINCT FROM v_op.contraparte_id);
  IF v_div_fav AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'O favorecido do lancamento e diferente da contraparte da Operacao Comercial. Confirme o vinculo informando o motivo.' USING ERRCODE = 'P0001';
  END IF;
  v_conf_div := (v_div_fav AND p_motivo IS NOT NULL AND btrim(p_motivo) <> '');

  -- 9) IDEMPOTENCIA (titulo_uniq global; qualquer parte ATIVA ou CANCELADA ligada ao titulo).
  SELECT * INTO v_parte FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id = p_financeiro_lancamento_id;
  IF FOUND THEN
    IF v_parte.cancelada THEN
      RAISE EXCEPTION 'Titulo % possui vinculo historico (parte cancelada %); revinculo exige writer proprio',
        p_financeiro_lancamento_id, v_parte.id USING ERRCODE = 'P0001';
    ELSIF v_parte.operacao_id IS DISTINCT FROM p_operacao_id THEN
      RAISE EXCEPTION 'Titulo % ja vinculado a outra operacao %', p_financeiro_lancamento_id, v_parte.operacao_id USING ERRCODE = 'P0001';
    ELSIF v_parte.natureza = p_natureza AND v_parte.componente = p_componente
          AND v_parte.sequencia_parcela = p_sequencia_parcela AND v_parte.quantidade_parcelas = p_quantidade_parcelas
          AND v_parte.incluso_no_total = false THEN
      SELECT id INTO v_liq_id FROM public.zoo_operacao_liquidacoes
        WHERE origem = 'financeiro' AND financeiro_lancamento_id = p_financeiro_lancamento_id AND estornado IS NOT TRUE;
      RETURN jsonb_build_object('ok', true, 'idempotente', true, 'operacao_id', p_operacao_id, 'parte_id', v_parte.id,
        'financeiro_lancamento_id', p_financeiro_lancamento_id, 'liquidacao_id', v_liq_id,
        'titulo_status', v_f.status_transacao, 'valor', v_parte.valor,
        'divergencia_favorecido', v_div_fav, 'confirmacao_divergencia_favorecido', v_conf_div);
    ELSE
      RAISE EXCEPTION 'Titulo % ja vinculado na operacao com atributos divergentes', p_financeiro_lancamento_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 10) INSERT da parte (dispara trg_oc_sync_liquidacao_parte -> ponte soberana). titulo_uniq e backstop de concorrencia (23505).
  INSERT INTO public.zoo_operacao_partes
    (cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
     incluso_no_total, origem, financeiro_lancamento_id, favorecido_id, plano_conta_id, data_vencimento,
     descricao, chave_idempotencia)
  VALUES
    (v_cli, p_operacao_id, p_natureza, p_componente, p_sequencia_parcela, p_quantidade_parcelas, v_valor,
     false, 'manual', p_financeiro_lancamento_id, v_f.favorecido_id, v_f.plano_conta_id, v_f.data_vencimento,
     COALESCE(p_descricao, v_f.descricao), 'adocao_titulo:' || p_financeiro_lancamento_id::text)
  RETURNING id INTO v_parte_id;

  -- 11) liquidacao criada pela PONTE (soberana) — apenas LEITURA para o retorno.
  SELECT id INTO v_liq_id FROM public.zoo_operacao_liquidacoes
    WHERE origem = 'financeiro' AND financeiro_lancamento_id = p_financeiro_lancamento_id AND estornado IS NOT TRUE;

  -- 12) evento de auditoria (usuario_id = auth.uid(); NULL em service_role puro — coluna nullable).
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'adotar_titulo_financeiro',
    jsonb_build_object(
      'executor_uid', v_actor, 'executor_role', v_executor_role,
      'operacao_id', p_operacao_id, 'parte_id', v_parte_id, 'financeiro_lancamento_id', p_financeiro_lancamento_id,
      'cliente_id', v_cli, 'valor', v_valor, 'status_transacao', v_f.status_transacao,
      'origem_lancamento', v_f.origem_lancamento, 'natureza', p_natureza, 'componente', p_componente,
      'sequencia_parcela', p_sequencia_parcela, 'quantidade_parcelas', p_quantidade_parcelas,
      'titulo_favorecido_id', v_f.favorecido_id, 'oc_contraparte_id', v_op.contraparte_id,
      'divergencia_favorecido', v_div_fav, 'confirmacao_divergencia_favorecido', v_conf_div,
      'contrato_id', v_f.contrato_id,
      'motivo', p_motivo, 'liquidacao_id', v_liq_id, 'nenhum_lancamento_financeiro_criado_ou_alterado', true),
    v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'idempotente', false, 'operacao_id', p_operacao_id, 'parte_id', v_parte_id,
    'financeiro_lancamento_id', p_financeiro_lancamento_id, 'liquidacao_id', v_liq_id,
    'titulo_status', v_f.status_transacao, 'valor', v_valor,
    'divergencia_favorecido', v_div_fav, 'confirmacao_divergencia_favorecido', v_conf_div);
END;
$function$;

-- Grants: writer oficial Financeiro -> OC. authenticated + service_role executam; o CORPO decide a
-- autorizacao por tenant (usuario sem acesso ao cliente da operacao -> 42501). anon sem grant.
REVOKE ALL ON FUNCTION public.oc_adotar_titulo_financeiro(uuid, uuid, text, text, integer, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oc_adotar_titulo_financeiro(uuid, uuid, text, text, integer, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_adotar_titulo_financeiro(uuid, uuid, text, text, integer, integer, text, text) TO authenticated, service_role;
