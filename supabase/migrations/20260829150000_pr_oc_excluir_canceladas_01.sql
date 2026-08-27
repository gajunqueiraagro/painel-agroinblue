-- PR-OC-EXCLUIR-CANCELADAS-01 — exclusao definitiva de operacao comercial CANCELADA.
--
--   PROPOSITO: cancelada sem sentido fica na Central para sempre. Esta e' a unica
--   operacao IRREVERSIVEL do dominio OC — cancelar tem reabrir, estorno tem refazer,
--   exclusao nao tem nada. Todo o desenho abaixo parte disso.
--
--   GRAFO MEDIDO, nao suposto. Sete tabelas referenciam zoo_operacoes_comerciais;
--   SEIS sao ON DELETE CASCADE e somem sozinhas ao apagar a raiz:
--     zoo_operacao_lotes · compromissos · documentos · liquidacoes · movimentacoes · partes
--   e, em cascata a partir dessas:
--     zoo_operacao_programacoes          (do compromisso)
--     zoo_operacao_parcelas_programacao  (da programacao)
--     zoo_operacao_documento_componentes (do documento)
--     zoo_operacao_documento_lotes       (do documento)
--   A UNICA que barra e' `zoo_operacao_eventos`, ON DELETE RESTRICT — por isso ela e' a
--   unica apagada explicitamente, e na MESMA transacao.
--   ⚠ NAO se apaga folha a folha. Ha dois RESTRICT internos (movimentacoes e
--   documento_lotes apontando para o LOTE) que so seriam problema se alguem tentasse
--   remover o lote antes da raiz. Apagando pela raiz, eles caem por cascata da operacao
--   antes de o lote ser tocado. Mexer na ordem so cria risco.
--
--   ⚠ NAO APAGA O DOMINIO. `financeiro_lancamentos_v2` e `lancamentos` tem historia
--   propria, conciliacao e auditoria, e NAO sao tocados: as FKs que apontam para eles
--   partem das tabelas-filhas da OC, entao some o VINCULO, nunca o lancamento. A
--   exclusao remove a camada da Operacao Comercial, so.
--
--   GUARD DE ZERO DEPENDENCIAS ATIVAS — o coracao desta RPC. Os tres primeiros
--   predicados sao ESPELHO VERBATIM de oc_cancelar (mov ativa / titulo ativo /
--   liquidacao nao estornada); o quarto (conciliacao bancaria viva) e' proprio, porque
--   cancelar nao precisava dele e apagar precisa. Diferenca deliberada: aqui se CONTA
--   em vez de usar EXISTS, para a mensagem dizer O QUE impede e QUANTOS — recusar sem
--   dizer o que prender obriga o operador a adivinhar.
--   Este guard roda EM RUNTIME, a cada chamada. Medi hoje que as 13 canceladas do proto
--   tem zero dependencia ativa; essa prova vale para hoje e a RPC nao pode confiar nela.
--
--   AUDITORIA — os eventos da operacao morrem com ela, por construcao: `dados_novos`
--   deles referencia ids que deixam de existir, e mante-los seria manter ponteiros
--   quebrados. O que NAO pode evaporar e' o registro de QUE se excluiu e POR QUE, entao
--   antes do DELETE grava-se uma linha em `public.audit_log`, que NAO tem FK para
--   zoo_operacoes_comerciais e por isso sobrevive. Escolhida por ser a tabela de
--   auditoria generica ja em uso no projeto (27.894 linhas, modulo 'compra' entre os
--   vigentes) — nenhuma tabela nova foi inventada para isto. O snapshot vai em
--   `dados_anteriores`, com a operacao inteira e a contagem do que foi removido.
--
--   ACESSO: ADMIN, e nao o `authenticated + tenant` das irmas. As irmas concedem a
--   qualquer usuario do cliente porque o estrago delas se desfaz; este nao se desfaz, e
--   ainda apaga a propria trilha de eventos. O GRANT continua em authenticated para o
--   PostgREST conseguir chamar e o usuario receber um erro legivel; quem recusa e' o
--   CORPO, com 42501. Assim, afrouxar o GRANT depois nao afrouxa a regra.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

CREATE OR REPLACE FUNCTION public.oc_excluir_definitivamente(
  p_operacao_id uuid,
  p_cliente_id uuid,
  p_motivo text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean;
  v_op public.zoo_operacoes_comerciais;
  v_mov_ativa int; v_titulo_ativo int; v_liq_ativa int; v_concil_ativa int;
  v_impedimentos text;
  v_n_lotes int; v_n_compromissos int; v_n_documentos int; v_n_liquidacoes int;
  v_n_movimentacoes int; v_n_partes int; v_n_eventos int;
  v_n_programacoes int; v_n_parcelas int; v_n_doc_comp int; v_n_doc_lotes int;
  v_removidos jsonb; v_snapshot jsonb;
BEGIN
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');

  -- 1) ACESSO — admin ou service_role. Ver cabecalho: nao basta ter o cliente.
  IF NOT (v_is_service OR (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor))) THEN
    RAISE EXCEPTION 'Exclusao definitiva e restrita a administrador.' USING ERRCODE = '42501'; END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Exclusao exige motivo' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;

  -- 2) SO CANCELADA. Sem excecao e sem parametro de forca: se um dia for preciso
  --    excluir outro estado, que se escreva outra frente e se discuta o porque.
  IF v_op.status_comercial IS DISTINCT FROM 'cancelada' THEN
    RAISE EXCEPTION 'Somente operacao CANCELADA pode ser excluida (estado atual: %).', v_op.status_comercial
      USING ERRCODE = 'P0001'; END IF;

  -- 3) GUARD DE DEPENDENCIA ATIVA. Contagens, nao booleanos — a mensagem diz quantos.
  SELECT count(*) INTO v_mov_ativa FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE;
  SELECT count(*) INTO v_titulo_ativo FROM public.zoo_operacao_partes p
    JOIN public.financeiro_lancamentos_v2 fl ON fl.id = p.financeiro_lancamento_id
   WHERE p.operacao_id = p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE;
  SELECT count(*) INTO v_liq_ativa FROM public.zoo_operacao_liquidacoes lq
   WHERE lq.operacao_id = p_operacao_id AND lq.estornado IS NOT TRUE;
  -- Conciliacao VIVA e' `desfeito_em IS NULL` — a tabela nao tem flag de status.
  SELECT count(*) INTO v_concil_ativa FROM public.conciliacao_bancaria_itens cbi
    JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id = cbi.lancamento_id
   WHERE p.operacao_id = p_operacao_id AND cbi.desfeito_em IS NULL;

  IF v_mov_ativa > 0 OR v_titulo_ativo > 0 OR v_liq_ativa > 0 OR v_concil_ativa > 0 THEN
    v_impedimentos := array_to_string(ARRAY[
      CASE WHEN v_mov_ativa    > 0 THEN v_mov_ativa    || ' movimentacao(oes) com lancamento zootecnico ativo' END,
      CASE WHEN v_titulo_ativo > 0 THEN v_titulo_ativo || ' titulo(s) financeiro(s) ativo(s)' END,
      CASE WHEN v_liq_ativa    > 0 THEN v_liq_ativa    || ' liquidacao(oes) nao estornada(s)' END,
      CASE WHEN v_concil_ativa > 0 THEN v_concil_ativa || ' conciliacao(oes) bancaria(s) ativa(s)' END], ', ');
    RAISE EXCEPTION 'Exclusao bloqueada: a operacao ainda tem efeitos ativos (%). Estorne esses efeitos antes de excluir.', v_impedimentos
      USING ERRCODE = 'P0001'; END IF;

  -- 4) CONTAGEM DO QUE SERA REMOVIDO, antes de remover. As quatro ultimas sao netas
  --    (cascata da cascata) e entram no retorno para o operador ver o alcance real.
  SELECT count(*) INTO v_n_lotes         FROM public.zoo_operacao_lotes         WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_compromissos  FROM public.zoo_operacao_compromissos  WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_documentos    FROM public.zoo_operacao_documentos    WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_liquidacoes   FROM public.zoo_operacao_liquidacoes   WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_movimentacoes FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_partes        FROM public.zoo_operacao_partes        WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_eventos       FROM public.zoo_operacao_eventos       WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_programacoes  FROM public.zoo_operacao_programacoes pr
    JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id WHERE c.operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_parcelas      FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
    JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id WHERE c.operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_doc_comp      FROM public.zoo_operacao_documento_componentes dc
    JOIN public.zoo_operacao_documentos d ON d.id = dc.documento_id WHERE d.operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_doc_lotes     FROM public.zoo_operacao_documento_lotes dl
    JOIN public.zoo_operacao_documentos d ON d.id = dl.documento_id WHERE d.operacao_id = p_operacao_id;

  v_removidos := jsonb_build_object(
    'zoo_operacao_lotes', v_n_lotes, 'zoo_operacao_compromissos', v_n_compromissos,
    'zoo_operacao_documentos', v_n_documentos, 'zoo_operacao_liquidacoes', v_n_liquidacoes,
    'zoo_operacao_movimentacoes', v_n_movimentacoes, 'zoo_operacao_partes', v_n_partes,
    'zoo_operacao_eventos', v_n_eventos, 'zoo_operacao_programacoes', v_n_programacoes,
    'zoo_operacao_parcelas_programacao', v_n_parcelas,
    'zoo_operacao_documento_componentes', v_n_doc_comp, 'zoo_operacao_documento_lotes', v_n_doc_lotes);

  -- 5) AUDITORIA QUE SOBREVIVE. Gravada ANTES do DELETE e em tabela sem FK para a
  --    operacao — ver cabecalho. Guarda a operacao inteira, o alcance e o motivo.
  v_snapshot := jsonb_build_object(
    'operacao', to_jsonb(v_op), 'removidos', v_removidos, 'motivo', btrim(p_motivo));
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
  VALUES (p_cliente_id, v_op.fazenda_id, v_actor, 'compra', 'excluir_operacao_definitivamente',
          'zoo_operacoes_comerciais', p_operacao_id, btrim(p_motivo), v_snapshot);

  -- 6) EVENTOS sao RESTRICT: unica remocao explicita, na MESMA transacao.
  DELETE FROM public.zoo_operacao_eventos WHERE operacao_id = p_operacao_id;

  -- 7) A RAIZ. As seis filhas e as quatro netas caem por CASCADE.
  DELETE FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id;

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'removidos', v_removidos);
END;
$function$;

COMMENT ON FUNCTION public.oc_excluir_definitivamente(uuid, uuid, text) IS
  'PR-OC-EXCLUIR-CANCELADAS-01: exclusao DEFINITIVA de operacao comercial cancelada. Restrita a admin/service_role. Exige status cancelada, motivo, e ZERO dependencias ativas (movimentacao com lancamento zootecnico vivo, titulo financeiro vivo, liquidacao nao estornada, conciliacao bancaria nao desfeita) — a mensagem de recusa nomeia o que impede e quantos. Apaga a camada da OC: seis filhas por CASCADE, quatro netas em cascata, e zoo_operacao_eventos explicitamente (RESTRICT). NAO apaga financeiro_lancamentos_v2 nem lancamentos. Grava auditoria em audit_log antes do DELETE, tabela sem FK para a operacao.';

-- Grants: o GRANT deixa o PostgREST chamar; quem recusa nao-admin e' o CORPO (42501).
REVOKE ALL ON FUNCTION public.oc_excluir_definitivamente(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oc_excluir_definitivamente(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_excluir_definitivamente(uuid, uuid, text) TO authenticated, service_role;
