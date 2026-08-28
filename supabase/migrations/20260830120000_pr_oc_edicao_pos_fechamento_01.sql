-- PR-OC-EDICAO-POS-FECHAMENTO-01 — editar os DADOS DA OPERACAO sem reabrir.
--
--   ⚠ CORPO IDENTICO AO APLICADO NO PROTO. Conferido por md5(prosrc):
--   ba017ed7d9f81a86fc4d096085085cb2. O corpo NAO leva comentarios internos porque
--   comentario dentro de $$...$$ entra no prosrc e quebraria essa igualdade — toda a
--   explicacao mora aqui no cabecalho, que fica de fora.
--
--   ⚠ LICAO DESTA MIGRATION, paga em runtime: `zoo_operacao_eventos.detalhes` e'
--   JSONB, nao text. A primeira versao gravava uma string ali e o CREATE PASSOU —
--   plpgsql so resolve tipos de dentro do corpo na EXECUCAO, entao o erro 42804 so
--   apareceu quando a suite rodou. REGRA daqui em diante: ao inserir em tabela de
--   evento/auditoria, CONFERIR O TIPO de cada coluna de destino antes de escrever;
--   nome de coluna nao diz tipo. `detalhes` parecia texto e era jsonb. Correcao:
--   jsonb_build_object('mensagem', ...).
--
--   O PROBLEMA QUE A RPC RESOLVE. Para receber animais a operacao precisa estar
--   'fechada' (AbaRecebimentoLotes exige). E 'fechada' faz `oc_salvar_rascunho`
--   recusar com "Negociacao fechada; reabra para editar". Resultado pratico: corrigir
--   o nome do fornecedor ou a data de uma compra ja recebida exigia REABRIR a
--   operacao — evento de ciclo, com efeito no financeiro — para trocar um texto.
--
--   O QUE ACEITA, e por que cada um e' seguro (medido na FASE 0, 28/08):
--     contraparte_id    o titulo financeiro NAO usa a contraparte. `oc_materializar_
--                       programacao` carimba `v_fav := v_comp.favorecido_id`, o
--                       favorecido do COMPROMISSO. Trocar a contraparte depois nao
--                       reescreve titulo nenhum — vale so para o que vier a seguir.
--                       Provado pelo T4 da suite.
--     data_operacao     ninguem a deriva retroativamente. Aparece apenas como ULTIMO
--                       termo de COALESCE em `oc_gerar_obrigacoes` e
--                       `oc_materializar_programacao`, lida NO ATO e gravada no
--                       titulo. As movimentacoes de recebimento tambem nao dependem
--                       dela: `zoo_operacao_movimentacoes` e' tabela de ligacao PURA,
--                       sem coluna de data.
--     observacoes       texto.
--     numero_documento  a nota fiscal. Nome REAL da coluna; nao existe `nota_fiscal`.
--
--   O QUE FICA DE FORA, e por que:
--     fazenda_id        os animais recebidos ja viraram lancamento de rebanho NA
--                       FAZENDA ORIGINAL. Mudar a operacao depois criaria divergencia
--                       entre a OC e o rebanho, sem nada que a reconcilie.
--     valores, lotes, status, cenario, tipo_operacao — base economica e ciclo, cada um
--                       com caminho proprio (oc_salvar_lotes, oc_confirmar, oc_reabrir).
--     CANCELADA         permanece imutavel, como nas irmas.
--
--   DECISOES DE DESENHO (eram comentarios internos; vieram para ca com o corpo limpo):
--   • AUTORIZACAO em tres camadas, no idioma de `oc_materializar_programacao`:
--     service_role, admin, acesso ao cliente.
--   • A LISTA BRANCA e' validada ANTES do SELECT ... FOR UPDATE: recusar chave
--     proibida nao precisa travar a linha nem tocar o banco.
--   • `v_permitidas` e' o contrato. Mexer nessa lista exige PR e teste.
--   • 'fechada' NAO recusa: e' exatamente o caso que esta RPC existe para atender.
--     'rascunho' e 'programada' entram junto para o front ter UM caminho so.
--   • Guard proprio para data vazia: `data_operacao` e' NOT NULL, e sem ele viria um
--     23502 cru, ilegivel na tela.
--   • Chave AUSENTE preserva o valor atual (padrao `CASE WHEN p_payload ? ...` das
--     irmas). Chave fora da lista NAO e' ignorada em silencio — estoura NOMEANDO a
--     chave, porque ignorar faria o front acreditar que gravou.
--   • `rascunho` NAO e' recalculado. `oc_salvar_rascunho` recalcula porque decide
--     completude de cadastro; numa operacao FECHADA esse recalculo poderia marcar
--     rascunho=true e quebrar o gating da tela e do `oc_confirmar`. Esta RPC corrige
--     dado, nao muda estado de completude.
--   • EM OPERACAO FECHADA, O EVENTO E' A AUDITORIA. Por isso `dados_anteriores` e
--     `dados_novos` levam o antes e o depois so das chaves TOCADAS — nao o payload
--     inteiro. Registrar campo intocado como se tivesse mudado seria ruido perigoso.
--
--   ⚠ NAO AFROUXAMOS `oc_salvar_rascunho`. Guarda clara vale mais que funcao
--   generica: la 'fechada' continua significando "reabra para editar", e a excecao
--   mora aqui, com lista fechada de campos e evento proprio.
--
--   Aplicada no PROTO (binbcdfbisgscrifztia) em 28/08, suite T1..T11 PASS com residuo
--   zero. NAO aplicar em producao.

CREATE OR REPLACE FUNCTION public.oc_editar_dados_operacao(
  p_operacao_id     uuid,
  p_cliente_id      uuid,
  p_payload         jsonb,
  p_versao_esperada integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      uuid := auth.uid();
  v_is_service boolean;
  v_is_admin   boolean;
  v_tem_acesso boolean;
  v_op         public.zoo_operacoes_comerciais;
  v_novo       public.zoo_operacoes_comerciais;
  v_chave      text;
  v_antes      jsonb := '{}'::jsonb;
  v_depois     jsonb := '{}'::jsonb;
  v_permitidas text[] := ARRAY['contraparte_id','data_operacao','observacoes','numero_documento'];
BEGIN
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  v_tem_acesso := (v_actor IS NOT NULL AND p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload deve ser um objeto JSON' USING ERRCODE = 'P0001';
  END IF;

  FOR v_chave IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT (v_chave = ANY (v_permitidas)) THEN
      RAISE EXCEPTION 'Campo % nao pode ser editado por oc_editar_dados_operacao', v_chave
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002';
  END IF;

  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001';
  END IF;

  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao
      USING ERRCODE = '40001';
  END IF;

  IF p_payload ? 'data_operacao' AND NULLIF(p_payload->>'data_operacao','') IS NULL THEN
    RAISE EXCEPTION 'A data da operacao nao pode ficar vazia' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload ? 'contraparte_id'    THEN v_antes := v_antes || jsonb_build_object('contraparte_id',    to_jsonb(v_op.contraparte_id)); END IF;
  IF p_payload ? 'data_operacao'     THEN v_antes := v_antes || jsonb_build_object('data_operacao',     to_jsonb(v_op.data_operacao)); END IF;
  IF p_payload ? 'observacoes'       THEN v_antes := v_antes || jsonb_build_object('observacoes',       to_jsonb(v_op.observacoes)); END IF;
  IF p_payload ? 'numero_documento'  THEN v_antes := v_antes || jsonb_build_object('numero_documento',  to_jsonb(v_op.numero_documento)); END IF;

  UPDATE public.zoo_operacoes_comerciais SET
    contraparte_id   = CASE WHEN p_payload ? 'contraparte_id'   THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id   END,
    data_operacao    = CASE WHEN p_payload ? 'data_operacao'    THEN (p_payload->>'data_operacao')::date           ELSE data_operacao    END,
    observacoes      = CASE WHEN p_payload ? 'observacoes'      THEN NULLIF(p_payload->>'observacoes','')          ELSE observacoes      END,
    numero_documento = CASE WHEN p_payload ? 'numero_documento' THEN NULLIF(p_payload->>'numero_documento','')     ELSE numero_documento END,
    versao     = versao + 1,
    updated_at = now(),
    updated_by = v_actor
  WHERE id = p_operacao_id;

  SELECT * INTO v_novo FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  IF p_payload ? 'contraparte_id'    THEN v_depois := v_depois || jsonb_build_object('contraparte_id',    to_jsonb(v_novo.contraparte_id)); END IF;
  IF p_payload ? 'data_operacao'     THEN v_depois := v_depois || jsonb_build_object('data_operacao',     to_jsonb(v_novo.data_operacao)); END IF;
  IF p_payload ? 'observacoes'       THEN v_depois := v_depois || jsonb_build_object('observacoes',       to_jsonb(v_novo.observacoes)); END IF;
  IF p_payload ? 'numero_documento'  THEN v_depois := v_depois || jsonb_build_object('numero_documento',  to_jsonb(v_novo.numero_documento)); END IF;

  INSERT INTO public.zoo_operacao_eventos (
    cliente_id, operacao_id, acao, detalhes, dados_anteriores, dados_novos, usuario_id, origem)
  VALUES (
    p_cliente_id, p_operacao_id, 'editar_dados',
    jsonb_build_object('mensagem', 'Edicao de dados da operacao com status ' || v_op.status_comercial),
    v_antes, v_depois, v_actor, 'rpc');

  RETURN jsonb_build_object(
    'ok',               true,
    'operacao_id',      p_operacao_id,
    'versao',           v_novo.versao,
    'status_comercial', v_novo.status_comercial,
    'rascunho',         v_novo.rascunho,
    'valor_total',      v_novo.valor_total);
END;
$$;

-- ACL espelhada das irmas (oc_salvar_rascunho / oc_confirmar / oc_reabrir):
-- sem PUBLIC; execucao para authenticated e service_role.
REVOKE ALL ON FUNCTION public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer) IS
  'PR-OC-EDICAO-POS-FECHAMENTO-01: edita DADOS DA OPERACAO (contraparte_id, data_operacao, observacoes, numero_documento) sem reabrir, inclusive com status fechada. Lista branca com recusa nominal; cancelada e imutavel; guard de versao; evento editar_dados com diff antes/depois. NAO toca base economica, fazenda nem status.';
