-- PR-MATERIALIZACAO-01 — 3o e ultimo writer comportamental: oc_materializar_programacao.
--
--   PROPOSITO: materializar UMA parcela 'prevista' de uma programacao ativa em:
--     (1) 1 PARTE (zoo_operacao_partes) — SNAPSHOT congelado do compromisso + vinculo ao titulo;
--     (2) 1 TITULO financeiro (financeiro_lancamentos_v2) 'programado' (aberto, data_pagamento NULL);
--     (3) parcela 'prevista' -> 'materializada'.
--   Contrato de IDENTIDADE 1:1:1 (titulo.valor = parte.valor = parcela.valor). NAO e teto/soma.
--
--   FORWARD-ONLY: NAO cancela, NAO estorna, NAO rematerializa, NAO edita titulo, NAO propaga alteracoes
--   futuras do compromisso (o snapshot e DEFINITIVO). Estorno/rematerializacao = frente propria.
--
--   FRONTEIRA: NAO cria compromisso/programacao/parcela; NAO liquida (titulo nasce 'programado', a ponte
--   oc_sincronizar_liquidacao_de_financeiro e inerte para status <> realizado/conciliado); NAO recalcula
--   base/tetos (o 2o teto ja foi imposto no PROGRAMACAO-01); NAO toca oc_gerar_obrigacoes.
--
--   CONTRATOS HERDADOS (verbatim dos writers homologados):
--     - bloco-mae do INSERT de titulo: 20260801120000_pr_fin_oc_composicao_02.sql:231-244 (mesmas colunas
--       e derivacoes; titulo nasce ABERTO: data_pagamento=NULL, data_vencimento=venc resolvido,
--       ano_mes=mes do vencimento; status_transacao='programado'; origem_lancamento='operacao_comercial';
--       origem_tipo='oc:obrigacao:'||natureza||':'||componente). Conta NAO e gravada no titulo (o
--       bloco-mae nao grava; conta e definida na baixa) — Decisao de Produto 5.
--     - INSERT de parte (snapshot): idioma de 20260801120000:210-221 + programacao_parcela_id + origem='programacao'.
--     - auth 3 camadas / FOR UPDATE / version lock (40001) / evento zoo_operacao_eventos / versao+1 + re-leitura:
--       20260803150000 (oc_criar_compromisso) e 20260803160000 (oc_programar_compromisso).
--     - ordem parte -> titulo -> vinculo (financeiro_lancamento_id): por causa dos triggers de liquidacao
--       (trg_oc_sync_liquidacao_parte so chama a ponte quando financeiro_lancamento_id IS NOT NULL).
--
--   NOTA (FATO fechado pelo Chat): resolve_classificacao_from_plano NAO altera plano_conta_id (soberano),
--   mas re-deriva macro/grupo/centro a partir do subcentro. O writer envia os campos do compromisso; o
--   trigger os confirma (hoje identicos, pois vem do mesmo plano). Comportamento aceito.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

CREATE OR REPLACE FUNCTION public.oc_materializar_programacao(
  p_operacao_id uuid,
  p_versao_esperada integer,
  p_programacao_id uuid,
  p_parcela_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean; v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_prog public.zoo_operacao_programacoes;
  v_parcela public.zoo_operacao_parcelas_programacao;
  v_comp public.zoo_operacao_compromissos;
  v_qtd int;
  v_fluxo text; v_tipo_op text; v_sinal text;
  v_data_venc date; v_fav uuid;
  v_parte_id uuid; v_tit_id uuid;
  v_parte_row jsonb; v_tit_row jsonb; v_parcela_row jsonb;
  v_nova_versao integer;
BEGIN
  -- 1) AUTH 3 camadas (padrao oc_criar_compromisso / oc_programar_compromisso).
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));

  -- 2) operacao FOR UPDATE; cliente DERIVADO; version lock; estados.
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao para materializar nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501';
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho nao permite materializacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao permite materializacao' USING ERRCODE = 'P0001'; END IF;

  -- 3) programacao FOR UPDATE: pertence ao cliente; status='ativa'.
  SELECT * INTO v_prog FROM public.zoo_operacao_programacoes
    WHERE id = p_programacao_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programacao % nao encontrada nesta operacao', p_programacao_id USING ERRCODE = 'P0001'; END IF;
  IF v_prog.status <> 'ativa' THEN
    RAISE EXCEPTION 'Programacao nao esta ativa (estado %).', v_prog.status USING ERRCODE = 'P0001'; END IF;

  -- 4) parcela FOR UPDATE: pertence a programacao; status='prevista' (regra POSITIVA; o indice unico
  --    parcela_prog_ativa_uniq e apenas backstop estrutural de concorrencia, nao o caminho de rejeicao).
  SELECT * INTO v_parcela FROM public.zoo_operacao_parcelas_programacao
    WHERE id = p_parcela_id AND programacao_id = p_programacao_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela % nao encontrada nesta programacao', p_parcela_id USING ERRCODE = 'P0001'; END IF;
  IF v_parcela.status <> 'prevista' THEN
    RAISE EXCEPTION 'Somente parcela prevista pode ser materializada (estado %).', v_parcela.status USING ERRCODE = 'P0001'; END IF;

  -- 5) compromisso da programacao (fonte do SNAPSHOT): pertence a esta operacao; status='programado'.
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = v_prog.compromisso_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compromisso da programacao nao encontrado' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.operacao_id <> p_operacao_id THEN
    RAISE EXCEPTION 'Programacao pertence a outra operacao' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status <> 'programado' THEN
    RAISE EXCEPTION 'Compromisso deve estar programado para materializar (estado %).', v_comp.status USING ERRCODE = 'P0001'; END IF;

  -- 6) conta da parcela (se nao-nula): pertence ao tenant. Conta NAO e gravada no titulo (Decisao 5).
  IF v_parcela.conta_bancaria_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias cb
        WHERE cb.id = v_parcela.conta_bancaria_id AND cb.cliente_id = v_cli) THEN
    RAISE EXCEPTION 'Conta bancaria nao pertence a este cliente.' USING ERRCODE = 'P0001'; END IF;

  -- Derivados: N total de parcelas da programacao (quantidade_parcelas do snapshot); fluxo pelo tipo da
  -- operacao (compra=pagar; venda/abate=receber); vencimento resolvido (NUNCA nulo no titulo); favorecido.
  SELECT count(*) INTO v_qtd FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id = p_programacao_id;
  v_fluxo     := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagar' ELSE 'receber' END;
  v_data_venc := COALESCE(v_parcela.vencimento, v_op.data_pagamento_prevista, v_op.data_operacao);
  v_fav       := v_comp.favorecido_id;

  -- 7) INSERT PARTE (snapshot congelado do compromisso; financeiro_lancamento_id NULL por ora).
  --    Nenhum trigger depende de financeiro_lancamento_id neste momento (pre-auditoria item e).
  INSERT INTO public.zoo_operacao_partes (
    cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
    valor, data_vencimento, descricao, incluso_no_total,
    favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, lote_id,
    programacao_parcela_id)
  VALUES (
    v_cli, p_operacao_id, 'programacao', v_comp.natureza, v_comp.componente, v_parcela.sequencia, v_qtd,
    v_parcela.valor, v_data_venc, v_comp.descricao, false,
    v_fav, v_comp.plano_conta_id, v_comp.macro_custo, v_comp.grupo_custo, v_comp.centro_custo, v_comp.subcentro, v_comp.lote_id,
    p_parcela_id)
  RETURNING id INTO v_parte_id;

  -- 8) INSERT TITULO (bloco-mae verbatim de 20260801120000:231-244; valores do compromisso+parcela).
  IF v_fluxo = 'receber' THEN v_tipo_op := '1-Entradas'; v_sinal := '1';
  ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;

  INSERT INTO public.financeiro_lancamentos_v2 (
    cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
    favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
    macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
    descricao, created_by, updated_by
  ) VALUES (
    v_cli, v_op.fazenda_id, v_parcela.valor, v_sinal, v_tipo_op,
    v_op.data_operacao, NULL::date, v_data_venc, to_char(v_data_venc,'YYYY-MM'),
    COALESCE(v_fav, v_op.contraparte_id), 'operacao_comercial',
    'oc:obrigacao:'||v_comp.natureza||':'||v_comp.componente, 'programado', v_op.cenario, false,
    v_comp.macro_custo, v_comp.grupo_custo, v_comp.centro_custo, v_comp.subcentro,
    v_comp.plano_conta_id,
    COALESCE(v_comp.descricao, v_op.tipo_operacao||' '||v_comp.componente), v_actor, v_actor
  ) RETURNING id INTO v_tit_id;

  -- 9) UPDATE parte -> vinculo ao titulo (ordem parte -> titulo -> vinculo).
  UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id = v_tit_id, updated_at = now() WHERE id = v_parte_id;

  -- 10) UPDATE parcela -> materializada.
  UPDATE public.zoo_operacao_parcelas_programacao SET status = 'materializada', updated_at = now() WHERE id = p_parcela_id;

  -- re-leitura das linhas finais (para evento e retorno).
  SELECT to_jsonb(p)  INTO v_parte_row   FROM public.zoo_operacao_partes p              WHERE p.id = v_parte_id;
  SELECT to_jsonb(f)  INTO v_tit_row     FROM public.financeiro_lancamentos_v2 f        WHERE f.id = v_tit_id;
  SELECT to_jsonb(pp) INTO v_parcela_row FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.id = p_parcela_id;

  -- 11) evento auditavel (literal do padrao; acao='materializar_parcela'; dados_novos completo).
  --     'versao' = versao pos-incremento (v_op.versao+1, deterministico; confirmado pela re-leitura no passo 12).
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'materializar_parcela',
    jsonb_build_object(
      'operacao_id', p_operacao_id,
      'programacao_id', p_programacao_id,
      'programacao_parcela_id', p_parcela_id,
      'compromisso_id', v_comp.id,
      'parcela', v_parcela_row,
      'parte', v_parte_row,
      'titulo', v_tit_row,
      'versao', v_op.versao + 1),
    v_actor, 'rpc');

  -- 12) versao+1 + re-leitura (padrao oc_salvar_rascunho).
  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova_versao FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  -- 13) retorno.
  RETURN jsonb_build_object(
    'parcela', v_parcela_row, 'parte', v_parte_row, 'titulo', v_tit_row, 'operacao_versao', v_nova_versao);
END;
$function$;

-- Grants: writer comportamental. authenticated + service_role executam (o corpo autoriza por
-- tenant/admin/service). anon sem grant.
REVOKE ALL ON FUNCTION public.oc_materializar_programacao(uuid, integer, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oc_materializar_programacao(uuid, integer, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_materializar_programacao(uuid, integer, uuid, uuid) TO authenticated, service_role;
