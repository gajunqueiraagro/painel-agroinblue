-- PR-FIN-OC-COMPOSICAO-02 — Individualização das obrigações financeiras da OC por lote/categoria.
-- Elimina o agrupamento automático por sexo e o Produto genérico "compra principal".
-- Contrato temporal do PR-FIN-OC-CONTRATO-01 (data_vencimento/data_pagamento NULL/ano_mes por vencimento):
-- INTEGRALMENTE preservado. Writers legados: intocados. Escopo: estrutura + oc_gerar_obrigacoes + backfill OC.

-- ============================================================================
-- 1) ESTRUTURA — lote_id + FK COMPOSTA (garante lote da MESMA operação) + índice de identidade por lote.
-- ============================================================================
-- UNIQUE(id, operacao_id) permite a FK composta abaixo (id já é PK/único; par explícito p/ referência).
ALTER TABLE public.zoo_operacao_lotes
  ADD CONSTRAINT zoo_operacao_lotes_id_operacao_uk UNIQUE (id, operacao_id);

ALTER TABLE public.zoo_operacao_partes
  ADD COLUMN lote_id uuid;

-- FK COMPOSTA (lote_id, operacao_id) → garante estruturalmente que o lote pertence à mesma operação da parte
--   (impede parte da OC A vincular lote da OC B). NULL é permitido (componente geral da OC).
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_lote_fk
  FOREIGN KEY (lote_id, operacao_id) REFERENCES public.zoo_operacao_lotes(id, operacao_id);

-- Identidade ativa por lote: no máximo uma parte ativa por (operação, lote, natureza, componente, parcela).
CREATE UNIQUE INDEX zoo_operacao_partes_identidade_lote
  ON public.zoo_operacao_partes (operacao_id, lote_id, natureza, componente, sequencia_parcela)
  WHERE lote_id IS NOT NULL AND cancelada = false;

-- ============================================================================
-- 2) RPC oc_gerar_obrigacoes — aceitar/validar/gravar lote_id. Corpo PR-FIN-OC-CONTRATO-01 preservado
--    verbatim; adicionadas: (i) leitura v_lote; (ii) validações de lote; (iii) lote_id no INSERT da parte.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.oc_gerar_obrigacoes(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_esperada text;
  v_base_entrada boolean;
  v_item jsonb;
  v_natureza text; v_componente text; v_fluxo text;
  v_valor numeric; v_venc date; v_seq int; v_qtd int;
  v_incluso boolean; v_sem_caixa boolean; v_materializar boolean;
  v_doc_id uuid; v_doc_comp_id uuid; v_fav uuid; v_chave text;
  v_origem text; v_tipo_op text; v_sinal text; v_data_pag date;
  v_parte_id uuid; v_tit_id uuid; v_existente uuid;
  v_criadas jsonb := '[]'::jsonb;
  v_base numeric; v_soma_principal numeric;
  v_plano_tipo text; v_plano_cnt int; v_plano_resolved uuid; v_plano_informado uuid;
  v_ex_valor numeric; v_ex_nat text; v_ex_comp text;
  v_ex_seq int; v_ex_qtd int; v_ex_venc date; v_ex_fav uuid; v_ex_sub text; v_ex_lote uuid;  -- PR-FIN-OC-COMPOSICAO-02 (idempotência)
  v_chaves_principais text[];
  v_lote uuid;   -- PR-FIN-OC-COMPOSICAO-02
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.rascunho OR v_op.status_comercial='rascunho' THEN
    RAISE EXCEPTION 'Rascunho nao permite geracao de obrigacoes' USING ERRCODE='P0001'; END IF;
  IF v_op.status_comercial <> 'fechada' THEN
    RAISE EXCEPTION 'Somente operacoes fechadas geram obrigacoes (estado %)', v_op.status_comercial USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  v_esperada    := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagar' ELSE 'receber' END;
  v_base_entrada := (v_op.tipo_operacao IN ('venda','abate'));

  -- (a) COERÊNCIA DA BASE — sobre o CONJUNTO SUBMETIDO (soma das partes principais do payload).
  v_base := v_op.valor_acordado;
  v_soma_principal := COALESCE((
      SELECT SUM(COALESCE(NULLIF(e->>'valor','')::numeric, 0))
        FROM jsonb_array_elements(COALESCE(p_payload->'obrigacoes','[]'::jsonb)) e
       WHERE e->>'natureza' = 'principal'), 0);
  IF v_soma_principal > 0 THEN
    IF v_base IS NULL OR v_base <= 0 THEN
      RAISE EXCEPTION 'Base negociada ausente ou invalida (valor_acordado=%)', v_base USING ERRCODE='P0001'; END IF;
    IF v_soma_principal <> v_base THEN
      RAISE EXCEPTION 'A obrigacao principal (R$ %) deve corresponder ao valor integral negociado (R$ %)', v_soma_principal, v_base USING ERRCODE='P0001'; END IF;
  END IF;

  -- GUARDA SERVER-SIDE contra 2ª base obrigacional integral (sob o lock FOR UPDATE, serializa concorrência).
  IF v_soma_principal > 0 THEN
    v_chaves_principais := ARRAY(
      SELECT e->>'chave_idempotencia'
        FROM jsonb_array_elements(COALESCE(p_payload->'obrigacoes','[]'::jsonb)) e
       WHERE e->>'natureza' = 'principal' AND NULLIF(e->>'chave_idempotencia','') IS NOT NULL);
    IF EXISTS (
        SELECT 1 FROM public.zoo_operacao_partes pp
         WHERE pp.operacao_id = p_operacao_id
           AND pp.natureza = 'principal'
           AND pp.cancelada IS NOT TRUE
           AND (pp.chave_idempotencia IS NULL OR pp.chave_idempotencia <> ALL(v_chaves_principais))) THEN
      RAISE EXCEPTION 'Ja existe obrigacao principal ativa nesta operacao; saneamento necessario antes de gerar outra base integral' USING ERRCODE='P0001';
    END IF;
    IF COALESCE(array_length(v_chaves_principais, 1), 0) <> (SELECT count(DISTINCT c) FROM unnest(v_chaves_principais) c) THEN
      RAISE EXCEPTION 'Chaves de idempotencia principais duplicadas no payload' USING ERRCODE='P0001';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'obrigacoes','[]'::jsonb))
  LOOP
    v_natureza  := v_item->>'natureza';
    v_componente := v_item->>'componente';
    v_fluxo     := v_item->>'natureza_fluxo';
    v_valor     := COALESCE(NULLIF(v_item->>'valor','')::numeric, 0);
    v_venc      := NULLIF(v_item->>'data_vencimento','')::date;
    v_seq       := COALESCE(NULLIF(v_item->>'sequencia_parcela','')::int, 1);
    v_qtd       := COALESCE(NULLIF(v_item->>'quantidade_parcelas','')::int, 1);
    v_incluso   := COALESCE((v_item->>'incluso_no_total')::boolean, false);
    v_sem_caixa := COALESCE((v_item->>'sem_movimentacao_caixa')::boolean, false);
    v_materializar := COALESCE((v_item->>'materializar')::boolean, true);
    v_doc_id    := NULLIF(v_item->>'documento_id','')::uuid;
    v_doc_comp_id := NULLIF(v_item->>'documento_componente_id','')::uuid;
    v_fav       := NULLIF(v_item->>'favorecido_id','')::uuid;
    v_chave     := NULLIF(v_item->>'chave_idempotencia','');
    v_lote      := NULLIF(v_item->>'lote_id','')::uuid;   -- PR-FIN-OC-COMPOSICAO-02

    IF v_sem_caixa THEN v_materializar := false; END IF;

    IF v_fluxo IS NULL OR v_fluxo <> v_esperada THEN
      RAISE EXCEPTION 'natureza_fluxo % incompativel com tipo % (esperado %)', v_fluxo, v_op.tipo_operacao, v_esperada USING ERRCODE='P0001'; END IF;
    IF v_valor <= 0 THEN RAISE EXCEPTION 'Valor da obrigacao deve ser > 0' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.zoo_componentes_financeiros c
                   WHERE c.natureza=v_natureza AND c.codigo=v_componente AND c.ativo IS TRUE) THEN
      RAISE EXCEPTION 'Componente %/% inexistente ou inativo no catalogo', v_natureza, v_componente USING ERRCODE='P0001'; END IF;
    IF v_doc_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.zoo_operacao_documentos d
          WHERE d.id=v_doc_id AND d.operacao_id=p_operacao_id AND d.cliente_id=p_cliente_id) THEN
      RAISE EXCEPTION 'Documento % nao pertence a operacao %', v_doc_id, p_operacao_id USING ERRCODE='P0001'; END IF;

    -- PR-FIN-OC-COMPOSICAO-02 — LOTE: principal exige lote; lote (quando informado) deve ser da MESMA operação.
    IF v_natureza = 'principal' AND v_lote IS NULL THEN
      RAISE EXCEPTION 'Obrigacao principal exige lote_id (identidade por lote/categoria).' USING ERRCODE='P0001'; END IF;
    IF v_lote IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.zoo_operacao_lotes lo WHERE lo.id=v_lote AND lo.operacao_id=p_operacao_id) THEN
      RAISE EXCEPTION 'Lote % nao pertence a operacao %', v_lote, p_operacao_id USING ERRCODE='P0001'; END IF;

    -- FAVORECIDO obrigatório e do tenant (cliente ou global). Contraparte da OC é só default; nunca alterada.
    IF v_fav IS NULL THEN
      RAISE EXCEPTION 'Favorecido obrigatorio.' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.financeiro_fornecedores f
                    WHERE f.id = v_fav AND (f.cliente_id = p_cliente_id OR f.cliente_id IS NULL)) THEN
      RAISE EXCEPTION 'Favorecido nao pertence a este cliente ou nao existe.' USING ERRCODE='P0001'; END IF;

    -- (b) CLASSIFICAÇÃO OBRIGATÓRIA — resolução do UUID em DUAS ETAPAS (sem max(uuid)):
    --     (1) contagem decide none/ambiguous/ok; (2) somente quando count=1, seleciona o id único (LIMIT 1
    --         seguro pós-contagem). Predicados LITERALMENTE equivalentes entre count e resolução.
    v_plano_tipo := CASE v_fluxo WHEN 'pagar' THEN '2-Saídas' ELSE '1-Entradas' END;
    IF NULLIF(v_item->>'subcentro','') IS NULL THEN
      RAISE EXCEPTION 'Selecione uma classificacao financeira valida.' USING ERRCODE='P0001'; END IF;
    SELECT count(*) INTO v_plano_cnt
      FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE
       AND (pc.cliente_id IS NULL OR pc.cliente_id = p_cliente_id)
       AND pc.tipo_operacao = v_plano_tipo
       AND pc.macro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'macro_custo','')
       AND pc.grupo_custo IS NOT DISTINCT FROM NULLIF(v_item->>'grupo_custo','')
       AND pc.centro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'centro_custo','')
       AND pc.subcentro   IS NOT DISTINCT FROM NULLIF(v_item->>'subcentro','');
    IF v_plano_cnt = 0 THEN
      RAISE EXCEPTION 'A classificacao escolhida nao pertence a este cliente ou nao existe.' USING ERRCODE='P0001'; END IF;
    IF v_plano_cnt > 1 THEN
      RAISE EXCEPTION 'Ha mais de um plano aplicavel. Selecione o plano correto.' USING ERRCODE='P0001'; END IF;
    SELECT pc.id INTO v_plano_resolved
      FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE
       AND (pc.cliente_id IS NULL OR pc.cliente_id = p_cliente_id)
       AND pc.tipo_operacao = v_plano_tipo
       AND pc.macro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'macro_custo','')
       AND pc.grupo_custo IS NOT DISTINCT FROM NULLIF(v_item->>'grupo_custo','')
       AND pc.centro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'centro_custo','')
       AND pc.subcentro   IS NOT DISTINCT FROM NULLIF(v_item->>'subcentro','')
     LIMIT 1;
    v_plano_informado := NULLIF(v_item->>'plano_conta_id','')::uuid;
    IF v_plano_informado IS NOT NULL AND v_plano_informado <> v_plano_resolved THEN
      RAISE EXCEPTION 'O plano informado nao corresponde ao subcentro selecionado.' USING ERRCODE='P0001'; END IF;

    v_origem := CASE WHEN v_doc_id IS NOT NULL THEN 'documento' ELSE 'manual' END;
    v_chave  := COALESCE(v_chave, CASE WHEN v_doc_comp_id IS NOT NULL THEN 'doc_comp:'||v_doc_comp_id::text ELSE NULL END);

    -- (c) IDEMPOTÊNCIA — chave obrigatória; idêntico = idempotente; QUALQUER campo relevante divergente
    --     sob a mesma chave = conflito explícito (nunca overwrite silencioso). PR-FIN-OC-COMPOSICAO-02:
    --     compara valor, natureza, componente, sequencia_parcela, quantidade_parcelas, data_vencimento,
    --     favorecido_id, subcentro (classificação) e lote_id. (natureza/componente/lote/parcela também
    --     compõem a chave; comparados aqui como reforço.)
    IF v_chave IS NULL THEN
      RAISE EXCEPTION 'Chave de idempotencia ausente.' USING ERRCODE='P0001'; END IF;
    v_existente := NULL;
    SELECT id, valor, natureza, componente, sequencia_parcela, quantidade_parcelas, data_vencimento, favorecido_id, subcentro, lote_id
      INTO v_existente, v_ex_valor, v_ex_nat, v_ex_comp, v_ex_seq, v_ex_qtd, v_ex_venc, v_ex_fav, v_ex_sub, v_ex_lote
      FROM public.zoo_operacao_partes
     WHERE operacao_id=p_operacao_id AND chave_idempotencia=v_chave;
    IF v_existente IS NOT NULL THEN
      IF v_ex_valor <> v_valor OR v_ex_nat <> v_natureza OR v_ex_comp <> v_componente
         OR v_ex_seq  IS DISTINCT FROM v_seq
         OR v_ex_qtd  IS DISTINCT FROM v_qtd
         OR v_ex_venc IS DISTINCT FROM v_venc
         OR v_ex_fav  IS DISTINCT FROM v_fav
         OR v_ex_sub  IS DISTINCT FROM NULLIF(v_item->>'subcentro','')
         OR v_ex_lote IS DISTINCT FROM v_lote THEN
        RAISE EXCEPTION 'Conflito de idempotencia: a chave % ja existe com conteudo diferente', v_chave USING ERRCODE='P0001'; END IF;
      v_criadas := v_criadas || jsonb_build_object('parte_id', v_existente, 'idempotente', true);
      CONTINUE;
    END IF;

    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
      valor, data_vencimento, descricao, incluso_no_total, sem_movimentacao_caixa,
      documento_id, documento_componente_id, favorecido_id, chave_idempotencia,
      plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, lote_id)
    VALUES (
      p_cliente_id, p_operacao_id, v_origem, v_natureza, v_componente, v_seq, v_qtd,
      v_valor, v_venc, v_item->>'descricao', v_incluso, v_sem_caixa,
      v_doc_id, v_doc_comp_id, v_fav, v_chave,
      v_plano_resolved, v_item->>'macro_custo', v_item->>'grupo_custo',
      v_item->>'centro_custo', v_item->>'subcentro', v_lote)
    RETURNING id INTO v_parte_id;

    v_tit_id := NULL;
    IF v_materializar THEN
      IF v_fluxo = 'receber' THEN v_tipo_op := '1-Entradas'; v_sinal := '1';
      ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;
      -- PR-FIN-OC-CONTRATO-01 — v_data_pag é o VENCIMENTO resolvido (nunca nulo). Título nasce ABERTO:
      --   data_pagamento=NULL; data_vencimento=v_data_pag; ano_mes = mês do vencimento (data derivada).
      v_data_pag := COALESCE(v_venc, v_op.data_pagamento_prevista, v_op.data_operacao);

      INSERT INTO public.financeiro_lancamentos_v2 (
        cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
        favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
        macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
        descricao, created_by, updated_by
      ) VALUES (
        p_cliente_id, v_op.fazenda_id, v_valor, v_sinal, v_tipo_op,
        v_op.data_operacao, NULL::date, v_data_pag, to_char(v_data_pag,'YYYY-MM'),
        COALESCE(v_fav, v_op.contraparte_id), 'operacao_comercial',
        'oc:obrigacao:'||v_natureza||':'||v_componente, 'programado', v_op.cenario, false,
        v_item->>'macro_custo', v_item->>'grupo_custo', v_item->>'centro_custo', v_item->>'subcentro',
        v_plano_resolved,
        COALESCE(v_item->>'descricao', v_op.tipo_operacao||' '||v_componente), v_actor, v_actor
      ) RETURNING id INTO v_tit_id;

      UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=v_tit_id, updated_at=now() WHERE id=v_parte_id;
    END IF;

    v_criadas := v_criadas || jsonb_build_object('parte_id', v_parte_id, 'titulo_id', v_tit_id, 'materializado', (v_tit_id IS NOT NULL));
  END LOOP;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'gerar_obrigacao', jsonb_build_object('resultado', v_criadas), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'obrigacoes', v_criadas);
END;
$function$;

-- ============================================================================
-- 3) BACKFILL INEQUÍVOCO — títulos OC de UM único lote: vincular lote_id + Produto derivado.
--    Preserva id/valor/competência/vencimento/fornecedor/classificação/status/vínculo. NÃO altera valor.
--    Só títulos OC abertos, sem liquidação/conciliação, cuja operação tem EXATAMENTE 1 lote.
-- ============================================================================
DO $bf$
DECLARE
  r record;
  v_lote_id uuid; v_cat text; v_qtd numeric; v_sigla text; v_prod text;
BEGIN
  FOR r IN
    SELECT fl.id AS titulo_id, p.id AS parte_id, p.operacao_id, p.sequencia_parcela, p.quantidade_parcelas,
           p.natureza, p.componente
      FROM financeiro_lancamentos_v2 fl
      JOIN zoo_operacao_partes p ON p.financeiro_lancamento_id = fl.id
     WHERE fl.origem_lancamento='operacao_comercial' AND fl.cancelado=false
       AND p.cancelada = false AND p.lote_id IS NULL AND p.natureza='principal'
       AND fl.conciliado_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM financeiro_conciliacoes c WHERE c.lancamento_id=fl.id)
       AND NOT EXISTS (SELECT 1 FROM zoo_operacao_liquidacoes l WHERE l.financeiro_lancamento_id=fl.id AND l.estornado IS NOT TRUE)
       AND (SELECT count(*) FROM zoo_operacao_lotes lo WHERE lo.operacao_id=p.operacao_id) = 1
  LOOP
    SELECT lo.id, lo.categoria_negociada, lo.qtd_negociada
      INTO v_lote_id, v_cat, v_qtd
      FROM zoo_operacao_lotes lo WHERE lo.operacao_id=r.operacao_id;
    -- Sigla oficial por slug (idêntica ao mapa de produtoOC.ts); fallback compacto para não-mapeadas.
    v_sigla := CASE v_cat
      WHEN 'mamotes_m' THEN 'MM' WHEN 'mamotes_f' THEN 'MF'
      WHEN 'desmama_m' THEN 'DM' WHEN 'desmama_f' THEN 'DF'
      WHEN 'garrotes' THEN 'G' WHEN 'novilhas' THEN 'N'
      WHEN 'bois' THEN 'B' WHEN 'vacas' THEN 'V' WHEN 'touros' THEN 'T'
      ELSE upper(replace(v_cat,'_','')) END;
    v_prod := 'Compra '||lpad(trunc(COALESCE(v_qtd,0))::text,3,'0')||' '||v_sigla||
              ' — Parc. '||r.sequencia_parcela||'/'||r.quantidade_parcelas;
    UPDATE zoo_operacao_partes
       SET lote_id = v_lote_id,
           chave_idempotencia = 'oc:'||r.operacao_id||':'||v_lote_id||':'||r.natureza||':'||r.componente||':parcela:'||r.sequencia_parcela,
           updated_at = now()
     WHERE id = r.parte_id;
    UPDATE financeiro_lancamentos_v2 SET descricao = v_prod, updated_at = now() WHERE id = r.titulo_id;
  END LOOP;
END
$bf$;

-- ============================================================================
-- 4) RE-SPLIT GOVERNADO DA OC a016cc36 (macho 75.350 = DM 34.100 + G 41.250; femea 36.800 = N).
--    ATÔMICO: qualquer divergência dos guards → RAISE (aborta a migration inteira).
-- ============================================================================
DO $rs$
DECLARE
  v_op  uuid := 'a016cc36-e9ff-4c70-8a8a-065defe74a27';
  v_lote_dm uuid; v_val_dm numeric; v_qtd_dm numeric;
  v_lote_g  uuid; v_val_g  numeric; v_qtd_g  numeric;
  v_lote_n  uuid; v_val_n  numeric; v_qtd_n  numeric;
  v_parte_macho uuid; v_tit_macho uuid; v_val_macho numeric;
  v_parte_femea uuid; v_tit_femea uuid; v_val_femea numeric;
  v_cli uuid;
  v_novo_tit_g uuid; v_novo_parte_g uuid;
  v_ativos int; v_partes_ativas int; v_soma numeric;
BEGIN
  -- PRECONDIÇÃO / IDEMPOTÊNCIA / SEGURANÇA EM AMBIENTE LIMPO — o re-split é específico do dado de teste
  --   a016cc36 (Proto). Em ambiente LIMPO/produção (OC ausente) ou já re-splitada (não há mais partes
  --   macho/femea), este bloco é NO-OP silencioso. Só prossegue quando a OC existe NO estado esperado
  --   (exatamente 2 partes principais ativas: uma 'macho' e uma 'femea'). Divergência de VALORES nesse
  --   estado válido continua abortando (RAISE) — integridade não é mascarada.
  SELECT cliente_id INTO v_cli FROM zoo_operacoes_comerciais WHERE id=v_op;
  IF v_cli IS NULL THEN
    RAISE NOTICE 'PR-FIN-OC-COMPOSICAO-02: a016cc36 ausente (ambiente limpo) — re-split nao aplicavel (no-op).';
    RETURN;
  END IF;
  IF NOT ( (SELECT count(*) FROM zoo_operacao_partes p WHERE p.operacao_id=v_op AND p.cancelada=false AND p.natureza='principal') = 2
           AND EXISTS (SELECT 1 FROM zoo_operacao_partes p WHERE p.operacao_id=v_op AND p.cancelada=false AND p.chave_idempotencia LIKE '%:macho:%')
           AND EXISTS (SELECT 1 FROM zoo_operacao_partes p WHERE p.operacao_id=v_op AND p.cancelada=false AND p.chave_idempotencia LIKE '%:femea:%') ) THEN
    RAISE NOTICE 'PR-FIN-OC-COMPOSICAO-02: a016cc36 fora do estado 2-titulos macho/femea (ja re-splitada?) — re-split no-op.';
    RETURN;
  END IF;

  -- Guard: exatamente 3 lotes esperados, com valores exatos.
  IF (SELECT count(*) FROM zoo_operacao_lotes WHERE operacao_id=v_op) <> 3 THEN
    RAISE EXCEPTION 'Re-split abortado: OC a016cc36 nao tem exatamente 3 lotes'; END IF;

  SELECT id, round((qtd_negociada*peso_medio_negociado_kg*valor_informado)::numeric,2), qtd_negociada
    INTO v_lote_dm, v_val_dm, v_qtd_dm FROM zoo_operacao_lotes WHERE operacao_id=v_op AND categoria_negociada='desmama_m';
  SELECT id, round((qtd_negociada*peso_medio_negociado_kg*valor_informado)::numeric,2), qtd_negociada
    INTO v_lote_g, v_val_g, v_qtd_g FROM zoo_operacao_lotes WHERE operacao_id=v_op AND categoria_negociada='garrotes';
  SELECT id, round((qtd_negociada*peso_medio_negociado_kg*valor_informado)::numeric,2), qtd_negociada
    INTO v_lote_n, v_val_n, v_qtd_n FROM zoo_operacao_lotes WHERE operacao_id=v_op AND categoria_negociada='novilhas';

  IF v_lote_dm IS NULL OR v_lote_g IS NULL OR v_lote_n IS NULL THEN
    RAISE EXCEPTION 'Re-split abortado: lotes DM/G/N esperados nao encontrados'; END IF;
  IF v_val_dm <> 34100 OR v_val_g <> 41250 OR v_val_n <> 36800 THEN
    RAISE EXCEPTION 'Re-split abortado: valores de lote divergem (DM=%, G=%, N=%)', v_val_dm, v_val_g, v_val_n; END IF;
  IF v_qtd_dm <> 10 OR v_qtd_g <> 10 OR v_qtd_n <> 10 THEN
    RAISE EXCEPTION 'Re-split abortado: quantidades de lote divergem (DM=%, G=%, N=%)', v_qtd_dm, v_qtd_g, v_qtd_n; END IF;

  -- Guard: 2 partes/títulos atuais (macho/femea) com valores exatos.
  SELECT id, financeiro_lancamento_id, valor INTO v_parte_macho, v_tit_macho, v_val_macho
    FROM zoo_operacao_partes WHERE operacao_id=v_op AND cancelada=false AND chave_idempotencia LIKE '%:macho:%';
  SELECT id, financeiro_lancamento_id, valor INTO v_parte_femea, v_tit_femea, v_val_femea
    FROM zoo_operacao_partes WHERE operacao_id=v_op AND cancelada=false AND chave_idempotencia LIKE '%:femea:%';
  IF v_parte_macho IS NULL OR v_parte_femea IS NULL THEN
    RAISE EXCEPTION 'Re-split abortado: partes macho/femea atuais nao encontradas'; END IF;
  IF v_val_macho <> 75350 OR v_val_femea <> 36800 THEN
    RAISE EXCEPTION 'Re-split abortado: valores atuais divergem (macho=%, femea=%)', v_val_macho, v_val_femea; END IF;
  IF (SELECT count(*) FROM zoo_operacao_partes WHERE operacao_id=v_op AND cancelada=false AND natureza='principal') <> 2 THEN
    RAISE EXCEPTION 'Re-split abortado: numero de partes principais ativas <> 2'; END IF;

  -- Guard: soma 112.150; sem liquidação/conciliação/pagamento efetivo nos 2 títulos.
  IF (v_val_macho + v_val_femea) <> 112150 THEN
    RAISE EXCEPTION 'Re-split abortado: soma atual <> 112150'; END IF;
  IF EXISTS (SELECT 1 FROM zoo_operacao_liquidacoes l WHERE l.operacao_id=v_op AND l.estornado IS NOT TRUE)
     OR EXISTS (SELECT 1 FROM financeiro_conciliacoes c WHERE c.lancamento_id IN (v_tit_macho, v_tit_femea))
     OR EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 fl WHERE fl.id IN (v_tit_macho, v_tit_femea) AND (fl.conciliado_em IS NOT NULL OR fl.data_pagamento IS NOT NULL)) THEN
    RAISE EXCEPTION 'Re-split abortado: existe liquidacao/conciliacao/pagamento efetivo'; END IF;

  -- (i) Novo título G — copia TODOS os campos do título macho, alterando só valor e descrição.
  INSERT INTO financeiro_lancamentos_v2 (
    cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
    favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
    macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, descricao, created_by, updated_by)
  SELECT cliente_id, fazenda_id, 41250, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
    favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
    macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, 'Compra 010 G — Parc. 1/1', created_by, updated_by
  FROM financeiro_lancamentos_v2 WHERE id=v_tit_macho
  RETURNING id INTO v_novo_tit_g;

  -- (ii) Nova parte G — copia da parte macho; valor/lote/chave/descrição próprios; vincula ao novo título.
  INSERT INTO zoo_operacao_partes (
    cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
    valor, data_vencimento, descricao, incluso_no_total, sem_movimentacao_caixa,
    favorecido_id, chave_idempotencia, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
    lote_id, financeiro_lancamento_id)
  SELECT cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
    41250, data_vencimento, 'Compra 010 G — Parc. 1/1', incluso_no_total, sem_movimentacao_caixa,
    favorecido_id, 'oc:'||v_op||':'||v_lote_g||':principal:principal:parcela:1', plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
    v_lote_g, v_novo_tit_g
  FROM zoo_operacao_partes WHERE id=v_parte_macho
  RETURNING id INTO v_novo_parte_g;

  -- (iii) Título/parte macho → DM (valor 34.100, Produto DM, lote DM, chave DM).
  UPDATE financeiro_lancamentos_v2 SET valor=34100, descricao='Compra 010 DM — Parc. 1/1', updated_at=now() WHERE id=v_tit_macho;
  UPDATE zoo_operacao_partes SET valor=34100, lote_id=v_lote_dm, descricao='Compra 010 DM — Parc. 1/1',
         chave_idempotencia='oc:'||v_op||':'||v_lote_dm||':principal:principal:parcela:1', updated_at=now()
   WHERE id=v_parte_macho;

  -- (iv) Título/parte femea → N (valor 36.800 mantido, Produto N, lote N, chave N).
  UPDATE financeiro_lancamentos_v2 SET descricao='Compra 010 N — Parc. 1/1', updated_at=now() WHERE id=v_tit_femea;
  UPDATE zoo_operacao_partes SET lote_id=v_lote_n, descricao='Compra 010 N — Parc. 1/1',
         chave_idempotencia='oc:'||v_op||':'||v_lote_n||':principal:principal:parcela:1', updated_at=now()
   WHERE id=v_parte_femea;

  -- Guards pós-condição.
  SELECT count(*) INTO v_ativos FROM financeiro_lancamentos_v2
    WHERE id IN (v_tit_macho, v_tit_femea, v_novo_tit_g) AND cancelado=false;
  SELECT count(*), COALESCE(sum(valor),0) INTO v_partes_ativas, v_soma FROM zoo_operacao_partes
    WHERE operacao_id=v_op AND cancelada=false AND natureza='principal';
  IF v_ativos <> 3 OR v_partes_ativas <> 3 OR v_soma <> 112150 THEN
    RAISE EXCEPTION 'Re-split pos-condicao falhou: titulos=%, partes=%, soma=%', v_ativos, v_partes_ativas, v_soma; END IF;

  -- Auditoria (trilha oficial zoo_operacao_eventos).
  INSERT INTO zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, origem)
  VALUES (v_cli, v_op, 'resplit_composicao',
    jsonb_build_object('macho', jsonb_build_object('titulo', v_tit_macho, 'valor', 75350),
                       'femea', jsonb_build_object('titulo', v_tit_femea, 'valor', 36800)),
    jsonb_build_object(
      'DM', jsonb_build_object('titulo', v_tit_macho, 'valor', 34100, 'lote', v_lote_dm),
      'G',  jsonb_build_object('titulo', v_novo_tit_g, 'valor', 41250, 'lote', v_lote_g),
      'N',  jsonb_build_object('titulo', v_tit_femea, 'valor', 36800, 'lote', v_lote_n),
      'soma', 112150, 'pr', 'PR-FIN-OC-COMPOSICAO-02'),
    'migration');
END
$rs$;
