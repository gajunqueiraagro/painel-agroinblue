-- PR-OC-VENDA-REALIZADO-02F — a lista branca aceita `valor_total_diarias`.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831100705.
--
-- Quarta vez na mesma frente, e o motivo nao muda: esta RPC ENUMERA as colunas. Coluna
-- nova sem entrada aqui e' descartada EM SILENCIO, com a auditoria — que grava o payload
-- inteiro — ainda dizendo que gravou. Coluna e lista branca andam SEMPRE em par.
--
-- ⚠ SEM `COALESCE`, como os tres do 02E: a coluna e' nullable e sem default, e nulo e'
-- valor legitimo ("o acerto ainda nao chegou"). Forcar zero transformaria ausencia em
-- fato — "as diarias custaram zero" — que e' o oposto do que a coluna diz.
--
-- ⚠ RECONSTRUIDA A PARTIR DO REPOSITORIO: corpo de 20260831091711 (md5 b85e0a9a...,
-- 15110) com as TRES insercoes nos mesmos tres pontos de sempre, apos `acerto_papel`.
-- Conferido pelo oraculo — md5 b8ad6ab11945ec95083a5a37029071a9, 15382 caracteres, byte a
-- byte igual ao aplicado. As demais 38 colunas nao foram tocadas.

CREATE OR REPLACE FUNCTION public.oc_salvar_boitel(
  p_operacao_id      uuid,
  p_cliente_id       uuid,
  p_versao_esperada  integer,
  p_cenario          text,
  p_payload          jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op    public.zoo_operacoes_comerciais;
  v_row   public.zoo_operacao_boitel;
  v_faltando text[] := '{}';
BEGIN
  -- ── AUTORIZACAO — copiada de `oc_salvar_lotes`, palavra por palavra ──────────
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;

  IF p_cenario IS NULL OR p_cenario NOT IN ('projetado','realizado') THEN
    RAISE EXCEPTION 'Cenario invalido: % (esperado projetado ou realizado)', p_cenario USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;

  -- ⚠ SO OPERACAO DE VENDA. A OC nao guarda `tipo_venda` — nao ha coluna para isso em
  --   `zoo_operacoes_comerciais` (conferido nas 53 colunas). Entao "esta venda e' boitel"
  --   NAO e' um campo: e' a EXISTENCIA desta linha. O que da' para checar aqui e' o que
  --   esta' escrito na OC, e uma compra nunca tem planejamento de boitel.
  IF v_op.tipo_operacao IS DISTINCT FROM 'venda' THEN
    RAISE EXCEPTION 'Planejamento de boitel so existe em operacao de venda (esta e %)', COALESCE(v_op.tipo_operacao,'sem tipo')
      USING ERRCODE = 'P0001'; END IF;

  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
  -- ⚠ `fechada` recusa DE PROPOSITO, inclusive para o realizado. O fluxo do abate e'
  --   reabrir a OC e atualizar — a reabertura e' o gesto que registra que os numeros
  --   mudaram. Aceitar escrita em operacao fechada tiraria esse registro.
  IF v_op.status_comercial = 'fechada' THEN
    RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;

  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- ── UPSERT PELA CHAVE (operacao_id, cenario) ─────────────────────────────────
  -- ⚠ O PROJETADO NAO E TOCADO POR UMA CHAMADA DE REALIZADO, e isso nao depende de
  --   disciplina: `cenario` faz parte da chave do conflito. Uma chamada com
  --   'realizado' so' alcanca a linha 'realizado'. As duas linhas coexistem, e a
  --   existencia das duas E' o comparativo.
  -- ⚠ `CASE WHEN p_payload ? 'x'` PRESERVA o que nao veio no payload. Os quatro modais
  --   do 01B editam blocos diferentes da MESMA linha; sem isto, salvar Custos apagaria
  --   Desempenho.
  INSERT INTO public.zoo_operacao_boitel AS b (
    cliente_id, operacao_id, cenario,
    nome_boitel, lote_codigo, numero_contrato, data_envio,
    peso_saida_fazenda_kg, dias, gmd, quebra_viagem_pct,
    rendimento_entrada_pct, rendimento_saida_pct,
    modalidade_custo, custo_diaria, custo_nutricao, custo_sanidade, custo_frete,
    outros_custos, custo_oportunidade,
    preco_venda_arroba, despesas_abate,
    possui_adiantamento, data_adiantamento, valor_adiantamento_diarias,
    valor_adiantamento_sanitario, valor_adiantamento_outros, adiantamento_observacao,
    morte_quantidade, morte_valor_indenizacao,
    custo_frete_no_boitel, despesas_abate_no_boitel, custo_notas_envio, notas_envio_no_boitel, data_abate, outros_no_boitel, qtd_abatida, valor_total_abate, acerto_papel, valor_total_diarias,
    created_by, updated_by
  ) VALUES (
    p_cliente_id, p_operacao_id, p_cenario,
    NULLIF(p_payload->>'nome_boitel',''), NULLIF(p_payload->>'lote_codigo',''),
    NULLIF(p_payload->>'numero_contrato',''), NULLIF(p_payload->>'data_envio','')::date,
    NULLIF(p_payload->>'peso_saida_fazenda_kg','')::numeric, NULLIF(p_payload->>'dias','')::int,
    NULLIF(p_payload->>'gmd','')::numeric, NULLIF(p_payload->>'quebra_viagem_pct','')::numeric,
    NULLIF(p_payload->>'rendimento_entrada_pct','')::numeric, NULLIF(p_payload->>'rendimento_saida_pct','')::numeric,
    COALESCE(NULLIF(p_payload->>'modalidade_custo',''), 'diaria'),
    NULLIF(p_payload->>'custo_diaria','')::numeric, NULLIF(p_payload->>'custo_nutricao','')::numeric,
    NULLIF(p_payload->>'custo_sanidade','')::numeric, NULLIF(p_payload->>'custo_frete','')::numeric,
    NULLIF(p_payload->>'outros_custos','')::numeric, NULLIF(p_payload->>'custo_oportunidade','')::numeric,
    NULLIF(p_payload->>'preco_venda_arroba','')::numeric, NULLIF(p_payload->>'despesas_abate','')::numeric,
    COALESCE(NULLIF(p_payload->>'possui_adiantamento','')::boolean, false),
    NULLIF(p_payload->>'data_adiantamento','')::date,
    NULLIF(p_payload->>'valor_adiantamento_diarias','')::numeric,
    NULLIF(p_payload->>'valor_adiantamento_sanitario','')::numeric,
    NULLIF(p_payload->>'valor_adiantamento_outros','')::numeric,
    NULLIF(p_payload->>'adiantamento_observacao',''),
    NULLIF(p_payload->>'morte_quantidade','')::int, NULLIF(p_payload->>'morte_valor_indenizacao','')::numeric,
    COALESCE(NULLIF(p_payload->>'custo_frete_no_boitel','')::boolean, false),
    COALESCE(NULLIF(p_payload->>'despesas_abate_no_boitel','')::boolean, true),
    COALESCE(NULLIF(p_payload->>'custo_notas_envio','')::numeric, 0),
    COALESCE(NULLIF(p_payload->>'notas_envio_no_boitel','')::boolean, false),
    NULLIF(p_payload->>'data_abate','')::date,
    COALESCE(NULLIF(p_payload->>'outros_no_boitel','')::boolean, true),
    NULLIF(p_payload->>'qtd_abatida','')::integer,
    NULLIF(p_payload->>'valor_total_abate','')::numeric,
    NULLIF(p_payload->>'acerto_papel','')::numeric,
    NULLIF(p_payload->>'valor_total_diarias','')::numeric,
    v_actor, v_actor
  )
  ON CONFLICT (operacao_id, cenario) DO UPDATE SET
    nome_boitel        = CASE WHEN p_payload ? 'nome_boitel'        THEN NULLIF(p_payload->>'nome_boitel','')        ELSE b.nome_boitel END,
    lote_codigo        = CASE WHEN p_payload ? 'lote_codigo'        THEN NULLIF(p_payload->>'lote_codigo','')        ELSE b.lote_codigo END,
    numero_contrato    = CASE WHEN p_payload ? 'numero_contrato'    THEN NULLIF(p_payload->>'numero_contrato','')    ELSE b.numero_contrato END,
    data_envio         = CASE WHEN p_payload ? 'data_envio'         THEN NULLIF(p_payload->>'data_envio','')::date   ELSE b.data_envio END,
    peso_saida_fazenda_kg  = CASE WHEN p_payload ? 'peso_saida_fazenda_kg'  THEN NULLIF(p_payload->>'peso_saida_fazenda_kg','')::numeric  ELSE b.peso_saida_fazenda_kg END,
    dias               = CASE WHEN p_payload ? 'dias'               THEN NULLIF(p_payload->>'dias','')::int          ELSE b.dias END,
    gmd                = CASE WHEN p_payload ? 'gmd'                THEN NULLIF(p_payload->>'gmd','')::numeric       ELSE b.gmd END,
    quebra_viagem_pct  = CASE WHEN p_payload ? 'quebra_viagem_pct'  THEN NULLIF(p_payload->>'quebra_viagem_pct','')::numeric  ELSE b.quebra_viagem_pct END,
    rendimento_entrada_pct = CASE WHEN p_payload ? 'rendimento_entrada_pct' THEN NULLIF(p_payload->>'rendimento_entrada_pct','')::numeric ELSE b.rendimento_entrada_pct END,
    rendimento_saida_pct   = CASE WHEN p_payload ? 'rendimento_saida_pct'   THEN NULLIF(p_payload->>'rendimento_saida_pct','')::numeric   ELSE b.rendimento_saida_pct END,
    modalidade_custo   = CASE WHEN p_payload ? 'modalidade_custo'   THEN COALESCE(NULLIF(p_payload->>'modalidade_custo',''),'diaria') ELSE b.modalidade_custo END,
    custo_diaria       = CASE WHEN p_payload ? 'custo_diaria'       THEN NULLIF(p_payload->>'custo_diaria','')::numeric       ELSE b.custo_diaria END,
    custo_nutricao     = CASE WHEN p_payload ? 'custo_nutricao'     THEN NULLIF(p_payload->>'custo_nutricao','')::numeric     ELSE b.custo_nutricao END,
    custo_sanidade     = CASE WHEN p_payload ? 'custo_sanidade'     THEN NULLIF(p_payload->>'custo_sanidade','')::numeric     ELSE b.custo_sanidade END,
    custo_frete        = CASE WHEN p_payload ? 'custo_frete'        THEN NULLIF(p_payload->>'custo_frete','')::numeric        ELSE b.custo_frete END,
    outros_custos      = CASE WHEN p_payload ? 'outros_custos'      THEN NULLIF(p_payload->>'outros_custos','')::numeric      ELSE b.outros_custos END,
    custo_oportunidade = CASE WHEN p_payload ? 'custo_oportunidade' THEN NULLIF(p_payload->>'custo_oportunidade','')::numeric ELSE b.custo_oportunidade END,
    preco_venda_arroba = CASE WHEN p_payload ? 'preco_venda_arroba' THEN NULLIF(p_payload->>'preco_venda_arroba','')::numeric ELSE b.preco_venda_arroba END,
    despesas_abate     = CASE WHEN p_payload ? 'despesas_abate'     THEN NULLIF(p_payload->>'despesas_abate','')::numeric     ELSE b.despesas_abate END,
    possui_adiantamento = CASE WHEN p_payload ? 'possui_adiantamento' THEN COALESCE(NULLIF(p_payload->>'possui_adiantamento','')::boolean, false) ELSE b.possui_adiantamento END,
    data_adiantamento   = CASE WHEN p_payload ? 'data_adiantamento'   THEN NULLIF(p_payload->>'data_adiantamento','')::date   ELSE b.data_adiantamento END,
    valor_adiantamento_diarias   = CASE WHEN p_payload ? 'valor_adiantamento_diarias'   THEN NULLIF(p_payload->>'valor_adiantamento_diarias','')::numeric   ELSE b.valor_adiantamento_diarias END,
    valor_adiantamento_sanitario = CASE WHEN p_payload ? 'valor_adiantamento_sanitario' THEN NULLIF(p_payload->>'valor_adiantamento_sanitario','')::numeric ELSE b.valor_adiantamento_sanitario END,
    valor_adiantamento_outros    = CASE WHEN p_payload ? 'valor_adiantamento_outros'    THEN NULLIF(p_payload->>'valor_adiantamento_outros','')::numeric    ELSE b.valor_adiantamento_outros END,
    adiantamento_observacao      = CASE WHEN p_payload ? 'adiantamento_observacao'      THEN NULLIF(p_payload->>'adiantamento_observacao','')                ELSE b.adiantamento_observacao END,
    morte_quantidade        = CASE WHEN p_payload ? 'morte_quantidade'        THEN NULLIF(p_payload->>'morte_quantidade','')::int        ELSE b.morte_quantidade END,
    morte_valor_indenizacao = CASE WHEN p_payload ? 'morte_valor_indenizacao' THEN NULLIF(p_payload->>'morte_valor_indenizacao','')::numeric ELSE b.morte_valor_indenizacao END,
    custo_frete_no_boitel    = CASE WHEN p_payload ? 'custo_frete_no_boitel'    THEN COALESCE(NULLIF(p_payload->>'custo_frete_no_boitel','')::boolean, false)   ELSE b.custo_frete_no_boitel END,
    despesas_abate_no_boitel = CASE WHEN p_payload ? 'despesas_abate_no_boitel' THEN COALESCE(NULLIF(p_payload->>'despesas_abate_no_boitel','')::boolean, true) ELSE b.despesas_abate_no_boitel END,
    custo_notas_envio        = CASE WHEN p_payload ? 'custo_notas_envio'        THEN COALESCE(NULLIF(p_payload->>'custo_notas_envio','')::numeric, 0)           ELSE b.custo_notas_envio END,
    notas_envio_no_boitel    = CASE WHEN p_payload ? 'notas_envio_no_boitel'    THEN COALESCE(NULLIF(p_payload->>'notas_envio_no_boitel','')::boolean, false)   ELSE b.notas_envio_no_boitel END,
    data_abate               = CASE WHEN p_payload ? 'data_abate'               THEN NULLIF(p_payload->>'data_abate','')::date                                  ELSE b.data_abate END,
    outros_no_boitel         = CASE WHEN p_payload ? 'outros_no_boitel'         THEN COALESCE(NULLIF(p_payload->>'outros_no_boitel','')::boolean, true)         ELSE b.outros_no_boitel END,
    qtd_abatida              = CASE WHEN p_payload ? 'qtd_abatida'              THEN NULLIF(p_payload->>'qtd_abatida','')::integer                              ELSE b.qtd_abatida END,
    valor_total_abate        = CASE WHEN p_payload ? 'valor_total_abate'        THEN NULLIF(p_payload->>'valor_total_abate','')::numeric                        ELSE b.valor_total_abate END,
    acerto_papel             = CASE WHEN p_payload ? 'acerto_papel'             THEN NULLIF(p_payload->>'acerto_papel','')::numeric                             ELSE b.acerto_papel END,
    valor_total_diarias      = CASE WHEN p_payload ? 'valor_total_diarias'      THEN NULLIF(p_payload->>'valor_total_diarias','')::numeric                      ELSE b.valor_total_diarias END,
    updated_at = now(), updated_by = v_actor
  RETURNING * INTO v_row;

  -- ── A TRAVA DOS CINCO CAMPOS ─────────────────────────────────────────────────
  -- ⚠ VALIDA A LINHA RESULTANTE, e nao o payload. Como o payload pode trazer so' um
  --   bloco, checar o payload recusaria uma edicao valida de linha ja completa. O que
  --   importa e' o estado FINAL.
  -- ⚠ OS CINCO VALEM NOS DOIS CENARIOS. O briefing definiu o minimo "para o projetado
  --   existir", mas a razao — "sem os cinco nao ha resultado a calcular" — vale igual no
  --   realizado, e um realizado vazio faria o comparativo mostrar metade.
  -- ⚠ ISTO NAO IMPEDE O FLUXO MODAL A MODAL, e foi MEDIDO antes de apertar:
  --   (a) os quatro modais do 01B editam ESTADO LOCAL e uma gravacao escreve a linha —
  --       e' a forma que o simulador antigo ja tem (`handleSave` devolve ao pai, nao ao
  --       banco) e a mesma de `oc_salvar_lotes`, que recebe o array inteiro;
  --   (b) a venda na OC NAO tem autosave: `autoSalvarOC` so' dispara com `modoOCCompra`,
  --       e o `VendaModalShell` nao chama gravacao nenhuma ao trocar de aba. So' o botao
  --       grava;
  --   (c) os 10 registros reais tem os CINCO preenchidos, todos — a trava nao teria
  --       recusado nada do que o operador de fato gravou.
  --   O que ela impede e' persistir uma projecao pela metade e voltar amanha. Isso e' a
  --   regra de produto, nao efeito colateral.
  IF v_row.dias IS NULL OR v_row.dias <= 0                       THEN v_faltando := array_append(v_faltando, 'dias'); END IF;
  IF v_row.gmd IS NULL OR v_row.gmd <= 0                         THEN v_faltando := array_append(v_faltando, 'GMD'); END IF;
  IF v_row.rendimento_saida_pct IS NULL OR v_row.rendimento_saida_pct <= 0 THEN v_faltando := array_append(v_faltando, 'rendimento de saida'); END IF;
  IF v_row.custo_diaria IS NULL OR v_row.custo_diaria <= 0       THEN v_faltando := array_append(v_faltando, 'custo da diaria'); END IF;
  IF v_row.preco_venda_arroba IS NULL OR v_row.preco_venda_arroba <= 0 THEN v_faltando := array_append(v_faltando, 'preco de venda da @'); END IF;

  IF array_length(v_faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION '% do boitel incompleto. Falta %: sem esses campos nao ha resultado a calcular, e uma venda boitel sem valor entraria na DRE sem valor.',
      CASE v_row.cenario WHEN 'projetado' THEN 'Projetado' ELSE 'Realizado' END,
      array_to_string(v_faltando, ', ') USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'salvar_boitel',
          jsonb_build_object('cenario', p_cenario, 'payload', p_payload), v_actor, 'rpc');

  RETURN jsonb_build_object(
    'ok', true,
    'operacao_id', p_operacao_id,
    'versao', v_op.versao + 1,
    'cenario', v_row.cenario,
    'boitel_id', v_row.id,
    -- Quais cenarios existem depois desta chamada. E' o que diz a' tela se ha
    -- comparativo para mostrar.
    'cenarios', (SELECT COALESCE(jsonb_agg(cenario ORDER BY cenario), '[]'::jsonb)
                   FROM public.zoo_operacao_boitel WHERE operacao_id = p_operacao_id)
  );
END;
$function$;
