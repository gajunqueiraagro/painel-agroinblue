-- PR-OC-LIQ-MODEL-01 — Obrigação financeira da Operação Comercial.
-- A obrigação REUSA zoo_operacao_partes (E3: vínculo único operação↔FINV2).
-- Distingue origem (negociacao|documento|manual), acrescenta geração manual explícita
-- e idempotente a partir do documento, cancelamento lógico da obrigação e leitura de
-- saldo separando liquidação monetária de não-monetária.
-- Não altera schema de financeiro_lancamentos_v2 (apenas INSERT de títulos, espelho
-- verbatim de oc_sincronizar). Não toca conciliação/extrato/hooks/React.

BEGIN;

-- ============================================================================
-- 1. SCHEMA — zoo_operacao_partes (a OBRIGAÇÃO, estendida)
-- ============================================================================
ALTER TABLE public.zoo_operacao_partes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'negociacao',
  ADD COLUMN IF NOT EXISTS documento_id uuid,
  ADD COLUMN IF NOT EXISTS documento_componente_id uuid,
  ADD COLUMN IF NOT EXISTS favorecido_id uuid,
  ADD COLUMN IF NOT EXISTS sem_movimentacao_caixa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chave_idempotencia text,
  ADD COLUMN IF NOT EXISTS cancelada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid,
  ADD COLUMN IF NOT EXISTS cancelada_motivo text;

ALTER TABLE public.zoo_operacao_partes
  DROP CONSTRAINT IF EXISTS zoo_operacao_partes_origem_check;
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_origem_check
  CHECK (origem = ANY (ARRAY['negociacao'::text, 'documento'::text, 'manual'::text]));

-- FK composto tenant-safe da origem documental (documento pertence à operação/cliente).
-- NOTA HISTÓRICA: esta forma (SET NULL sobre a FK composta) tem defeito estrutural
-- corrigido na migration 20260723084837 — ver docs/specs. Preservada aqui verbatim como
-- o estado originalmente aplicado no Proto (sem squash).
ALTER TABLE public.zoo_operacao_partes
  DROP CONSTRAINT IF EXISTS zoo_operacao_partes_documento_fk;
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_documento_fk
  FOREIGN KEY (documento_id, operacao_id, cliente_id)
  REFERENCES public.zoo_operacao_documentos (id, operacao_id, cliente_id)
  ON DELETE SET NULL;

-- Identidade: negociação mantém a chave clássica; obrigação usa idempotência própria.
-- (identidade_uniq é UNIQUE CONSTRAINT, não índice avulso — remover via DROP CONSTRAINT.)
ALTER TABLE public.zoo_operacao_partes DROP CONSTRAINT IF EXISTS zoo_operacao_partes_identidade_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS zoo_operacao_partes_identidade_negociacao
  ON public.zoo_operacao_partes (operacao_id, natureza, componente, sequencia_parcela)
  WHERE origem = 'negociacao';
CREATE UNIQUE INDEX IF NOT EXISTS zoo_operacao_partes_idempotencia_obrigacao
  ON public.zoo_operacao_partes (operacao_id, chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL;

COMMENT ON COLUMN public.zoo_operacao_partes.origem IS
  'Origem da parte/obrigação: negociacao (REPLACE pelas engines) | documento | manual (aditivo, idempotente).';
COMMENT ON COLUMN public.zoo_operacao_partes.sem_movimentacao_caixa IS
  'Retenção sem caixa=true nunca materializa título bancário (E3/decisão A).';

-- ============================================================================
-- 2. SCHEMA — zoo_operacao_liquidacoes: forma += compensacao (não monetária)
-- ============================================================================
ALTER TABLE public.zoo_operacao_liquidacoes
  DROP CONSTRAINT IF EXISTS zoo_operacao_liquidacoes_forma_check;
ALTER TABLE public.zoo_operacao_liquidacoes
  ADD CONSTRAINT zoo_operacao_liquidacoes_forma_check
  CHECK (forma = ANY (ARRAY['dinheiro'::text,'pix'::text,'transferencia'::text,
    'boleto'::text,'cheque'::text,'permuta'::text,'compensacao'::text,'outro'::text]));

-- ============================================================================
-- 3. ENGINE DE NEGOCIAÇÃO — _oc_aplicar_partes (verbatim + escopo origem='negociacao')
--    Mudanças cirúrgicas: DELETE e rollup de valor_total escopados a origem='negociacao';
--    INSERT grava origem='negociacao' explicitamente.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._oc_aplicar_partes(p_operacao_id uuid, p_cliente_id uuid, p_parcelas jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invalido text;
BEGIN
  -- Valida componentes contra o catálogo ATIVO antes de depender da FK.
  SELECT string_agg(DISTINCT (e->>'natureza') || '/' || COALESCE(e->>'componente','(nulo)'), ', ')
    INTO v_invalido
  FROM jsonb_array_elements(COALESCE(p_parcelas, '[]'::jsonb)) e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.zoo_componentes_financeiros c
    WHERE c.natureza = e->>'natureza' AND c.codigo = e->>'componente' AND c.ativo IS TRUE);
  IF v_invalido IS NOT NULL THEN
    RAISE EXCEPTION 'Componente(s) inexistente(s)/inativo(s) no catalogo: %', v_invalido USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND origem = 'negociacao';

  INSERT INTO public.zoo_operacao_partes (
    cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
    valor, data_vencimento, descricao, incluso_no_total, plano_conta_id,
    macro_custo, grupo_custo, centro_custo, subcentro)
  SELECT
    p_cliente_id, p_operacao_id, 'negociacao', x.natureza, x.componente,
    row_number() OVER (PARTITION BY x.natureza, x.componente ORDER BY x.ord),
    count(*)     OVER (PARTITION BY x.natureza, x.componente),
    x.valor, x.data_vencimento, x.descricao, x.incluso, x.plano_conta_id,
    x.macro, x.grupo, x.centro, x.subcentro
  FROM (
    SELECT
      e->>'natureza' AS natureza, e->>'componente' AS componente,
      COALESCE(NULLIF(e->>'valor','')::numeric, 0) AS valor,
      NULLIF(e->>'data_vencimento','')::date AS data_vencimento,
      e->>'descricao' AS descricao,
      COALESCE((e->>'incluso_no_total')::boolean, true) AS incluso,
      NULLIF(e->>'plano_conta_id','')::uuid AS plano_conta_id,
      e->>'macro_custo' AS macro, e->>'grupo_custo' AS grupo, e->>'centro_custo' AS centro, e->>'subcentro' AS subcentro,
      ord
    FROM jsonb_array_elements(COALESCE(p_parcelas, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
  ) x;

  -- Deriva os resumos das partes e grava na operação (fonte soberana = partes de NEGOCIAÇÃO).
  UPDATE public.zoo_operacoes_comerciais o
  SET valor_bruto = r.bruto, descontos = r.descontos, acrescimos = r.acrescimos,
      valor_total = r.bruto + r.acrescimos - r.descontos
  FROM (
    SELECT
      COALESCE(sum(valor) FILTER (WHERE natureza='principal' AND incluso_no_total), 0) AS bruto,
      COALESCE(sum(valor) FILTER (WHERE natureza='deducao'   AND incluso_no_total), 0) AS descontos,
      COALESCE(sum(valor) FILTER (WHERE natureza='acrescimo' AND incluso_no_total), 0) AS acrescimos
    FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND origem = 'negociacao'
  ) r
  WHERE o.id = p_operacao_id;
END;
$function$;

-- ============================================================================
-- 4. ENGINE DE SINCRONIZAÇÃO — oc_sincronizar (verbatim + escopo origem='negociacao')
--    5 escopos cirúrgicos (hash, proteção, cancelamento, reset de vínculo, loop de
--    materialização) para NÃO varrer obrigações documentais/manuais.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.oc_sincronizar(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_hash text;
  v_protegidos int;
  v_fazendas uuid[];
  v_fazenda uuid;
  v_multi boolean := false;
  v_base_entrada boolean;
  v_parte public.zoo_operacao_partes;
  v_tit_id uuid;
  v_tipo_op text;
  v_sinal text;
  v_data_pag date;
  v_status_fin text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação % não encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.status_comercial <> 'fechada' THEN
    RAISE EXCEPTION 'Só operações fechadas podem sincronizar (estado atual %)', v_op.status_comercial USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  SELECT md5(COALESCE(string_agg(
      natureza||'|'||componente||'|'||sequencia_parcela||'|'||COALESCE(valor::text,'')||'|'||
      COALESCE(data_vencimento::text,'')||'|'||COALESCE(grupo_custo,'')||'|'||COALESCE(subcentro,''),
      ';' ORDER BY natureza, componente, sequencia_parcela),''))
    INTO v_hash
    FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id AND origem='negociacao';

  IF v_op.status_financeiro='sincronizado' AND v_op.hash_financeiro_esperado IS NOT DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial', v_op.status_comercial, 'status_financeiro','sincronizado', 'idempotente', true);
  END IF;

  SELECT count(*) INTO v_protegidos
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id=pt.financeiro_lancamento_id
   WHERE pt.operacao_id=p_operacao_id
     AND pt.origem='negociacao'
     AND f.cancelado IS NOT TRUE
     AND (f.status_transacao IN ('realizado','agendado') OR f.conciliado_em IS NOT NULL);
  IF v_protegidos > 0 THEN
    UPDATE public.zoo_operacoes_comerciais
      SET status_financeiro='divergente', ultima_tentativa_em=now(),
          erro_sincronizacao=format('%s titulo(s) realizado/agendado/conciliado — sincronizacao bloqueada; ajuste pelo Financeiro Oficial', v_protegidos),
          updated_at=now(), updated_by=v_actor
    WHERE id=p_operacao_id;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    VALUES (p_cliente_id, p_operacao_id, 'sincronizar_divergente', jsonb_build_object('protegidos', v_protegidos), v_actor, 'rpc');
    RETURN jsonb_build_object('ok', false, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial', v_op.status_comercial, 'status_financeiro','divergente', 'motivo','titulos_realizados');
  END IF;

  SELECT array_agg(DISTINCT l.fazenda_id) INTO v_fazendas
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id=m.movimentacao_id AND l.cliente_id=m.cliente_id
   WHERE m.operacao_id=p_operacao_id;
  IF array_length(v_fazendas,1)=1 THEN v_fazenda := v_fazendas[1]; ELSE v_fazenda := NULL; v_multi := (array_length(v_fazendas,1) > 1); END IF;

  UPDATE public.financeiro_lancamentos_v2 f
    SET cancelado=true, cancelado_em=now(), cancelado_por=v_actor
    FROM public.zoo_operacao_partes pt
   WHERE pt.operacao_id=p_operacao_id AND pt.origem='negociacao' AND pt.financeiro_lancamento_id=f.id AND f.cancelado IS NOT TRUE;
  UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=NULL
   WHERE operacao_id=p_operacao_id AND origem='negociacao' AND financeiro_lancamento_id IS NOT NULL;

  v_base_entrada := (v_op.tipo_operacao IN ('venda','abate'));

  FOR v_parte IN SELECT * FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id AND origem='negociacao'
                 ORDER BY natureza, componente, sequencia_parcela
  LOOP
    IF (v_base_entrada AND v_parte.natureza <> 'deducao') OR ((NOT v_base_entrada) AND v_parte.natureza='deducao') THEN
      v_tipo_op := '1-Entradas'; v_sinal := '1';
    ELSE
      v_tipo_op := '2-Saídas'; v_sinal := '-1';
    END IF;
    v_data_pag := COALESCE(v_parte.data_vencimento, v_op.data_pagamento_prevista, v_op.data_operacao);

    INSERT INTO public.financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, ano_mes,
      favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario,
      macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
      descricao, created_by, updated_by
    ) VALUES (
      p_cliente_id, v_fazenda, COALESCE(v_parte.valor,0), v_sinal, v_tipo_op,
      v_op.data_operacao, v_data_pag, to_char(v_op.data_operacao,'YYYY-MM'),
      v_op.contraparte_id, 'operacao_comercial', 'oc:'||v_parte.natureza||':'||v_parte.componente, 'programado', v_op.cenario,
      v_parte.macro_custo, v_parte.grupo_custo, v_parte.centro_custo, v_parte.subcentro, v_parte.plano_conta_id,
      COALESCE(v_parte.descricao, v_op.tipo_operacao||' '||v_parte.componente), v_actor, v_actor
    ) RETURNING id INTO v_tit_id;

    UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=v_tit_id, updated_at=now() WHERE id=v_parte.id;
  END LOOP;

  v_status_fin := CASE WHEN v_multi THEN 'divergente' ELSE 'sincronizado' END;

  UPDATE public.zoo_operacoes_comerciais
    SET status_financeiro=v_status_fin,
        sincronizado_em=CASE WHEN v_multi THEN sincronizado_em ELSE now() END,
        ultima_tentativa_em=now(),
        erro_sincronizacao=CASE WHEN v_multi THEN 'multiplas fazendas nas movimentacoes; titulos gravados com fazenda_id nulo — classificar' ELSE NULL END,
        hash_financeiro_esperado=v_hash, versao=versao+1, updated_at=now(), updated_by=v_actor
  WHERE id=p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, CASE WHEN v_multi THEN 'sincronizar_multi_fazenda' ELSE 'sincronizar' END,
          jsonb_build_object('fazenda_id', v_fazenda, 'multi_fazenda', v_multi, 'hash', v_hash), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao+1,
    'status_comercial', v_op.status_comercial, 'status_financeiro', v_status_fin, 'multi_fazenda', v_multi);
END;
$function$;

-- ============================================================================
-- 5. RPC NOVA — oc_gerar_obrigacoes (geração manual, explícita, idempotente)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.oc_gerar_obrigacoes(
    p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
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

    -- Retenção sem caixa NUNCA materializa título bancário (decisão A).
    IF v_sem_caixa THEN v_materializar := false; END IF;

    -- Validações mínimas.
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

    v_origem := CASE WHEN v_doc_id IS NOT NULL THEN 'documento' ELSE 'manual' END;
    v_chave  := COALESCE(v_chave, CASE WHEN v_doc_comp_id IS NOT NULL THEN 'doc_comp:'||v_doc_comp_id::text ELSE NULL END);

    -- Idempotência: mesma (operacao, chave) => retorna a existente, sem duplicar.
    v_existente := NULL;
    IF v_chave IS NOT NULL THEN
      SELECT id INTO v_existente FROM public.zoo_operacao_partes
        WHERE operacao_id=p_operacao_id AND chave_idempotencia=v_chave;
    END IF;
    IF v_existente IS NOT NULL THEN
      v_criadas := v_criadas || jsonb_build_object('parte_id', v_existente, 'idempotente', true);
      CONTINUE;
    END IF;

    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
      valor, data_vencimento, descricao, incluso_no_total, sem_movimentacao_caixa,
      documento_id, documento_componente_id, favorecido_id, chave_idempotencia,
      plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro)
    VALUES (
      p_cliente_id, p_operacao_id, v_origem, v_natureza, v_componente, v_seq, v_qtd,
      v_valor, v_venc, v_item->>'descricao', v_incluso, v_sem_caixa,
      v_doc_id, v_doc_comp_id, v_fav, v_chave,
      NULLIF(v_item->>'plano_conta_id','')::uuid, v_item->>'macro_custo', v_item->>'grupo_custo',
      v_item->>'centro_custo', v_item->>'subcentro')
    RETURNING id INTO v_parte_id;

    v_tit_id := NULL;
    IF v_materializar THEN
      IF v_fluxo = 'receber' THEN v_tipo_op := '1-Entradas'; v_sinal := '1';
      ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;
      v_data_pag := COALESCE(v_venc, v_op.data_pagamento_prevista, v_op.data_operacao);

      INSERT INTO public.financeiro_lancamentos_v2 (
        cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, ano_mes,
        favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
        macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
        descricao, created_by, updated_by
      ) VALUES (
        p_cliente_id, v_op.fazenda_id, v_valor, v_sinal, v_tipo_op,
        v_op.data_operacao, v_data_pag, to_char(v_op.data_operacao,'YYYY-MM'),
        COALESCE(v_fav, v_op.contraparte_id), 'operacao_comercial',
        'oc:obrigacao:'||v_natureza||':'||v_componente, 'programado', v_op.cenario, false,
        v_item->>'macro_custo', v_item->>'grupo_custo', v_item->>'centro_custo', v_item->>'subcentro',
        NULLIF(v_item->>'plano_conta_id','')::uuid,
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
-- 6. RPC NOVA — oc_cancelar_obrigacao (cancelamento lógico, append-only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.oc_cancelar_obrigacao(
    p_parte_id uuid, p_cliente_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_parte public.zoo_operacao_partes;
  v_protegido boolean := false;
  v_tit_cancelado boolean := false;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo)='' THEN
    RAISE EXCEPTION 'Cancelamento exige motivo' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_parte FROM public.zoo_operacao_partes
    WHERE id=p_parte_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obrigacao % nao encontrada', p_parte_id USING ERRCODE='P0002'; END IF;
  IF v_parte.origem = 'negociacao' THEN
    RAISE EXCEPTION 'Partes de negociacao sao geridas pela negociacao, nao por cancelamento de obrigacao' USING ERRCODE='P0001'; END IF;
  IF v_parte.cancelada THEN RAISE EXCEPTION 'Obrigacao ja cancelada' USING ERRCODE='P0001'; END IF;

  -- Cancela o título FINV2 apenas se NÃO protegido (fato bancário imutável preservado).
  IF v_parte.financeiro_lancamento_id IS NOT NULL THEN
    SELECT (f.status_transacao IN ('realizado','agendado') OR f.conciliado_em IS NOT NULL)
      INTO v_protegido
      FROM public.financeiro_lancamentos_v2 f
     WHERE f.id=v_parte.financeiro_lancamento_id AND f.cancelado IS NOT TRUE;
    IF v_protegido IS TRUE THEN
      RAISE EXCEPTION 'Titulo vinculado esta realizado/agendado/conciliado — cancele pelo Financeiro Oficial' USING ERRCODE='P0001'; END IF;
    UPDATE public.financeiro_lancamentos_v2
      SET cancelado=true, cancelado_em=now(), cancelado_por=v_actor, cancelado_motivo=p_motivo
    WHERE id=v_parte.financeiro_lancamento_id AND cancelado IS NOT TRUE;
    v_tit_cancelado := FOUND;
  END IF;

  UPDATE public.zoo_operacao_partes
    SET cancelada=true, cancelada_em=now(), cancelada_por=v_actor, cancelada_motivo=p_motivo, updated_at=now()
  WHERE id=p_parte_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, v_parte.operacao_id, 'cancelar_obrigacao',
          jsonb_build_object('parte_id', p_parte_id, 'motivo', p_motivo, 'titulo_cancelado', v_tit_cancelado), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'parte_id', p_parte_id, 'cancelada', true, 'titulo_cancelado', v_tit_cancelado);
END;
$function$;

-- ============================================================================
-- 7. VIEWS — saldo com separação monetário/não-monetário + camada de obrigação
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_oc_titulos_liquidacao AS
 WITH titulos AS (
   SELECT DISTINCT pt.cliente_id, pt.operacao_id, pt.financeiro_lancamento_id AS titulo_id
     FROM public.zoo_operacao_partes pt
    WHERE pt.financeiro_lancamento_id IS NOT NULL AND pt.cancelada = false
 ), liq AS (
   SELECT l.operacao_id, l.financeiro_lancamento_id AS titulo_id,
          sum(l.valor) AS total_liquidado_valido,
          sum(l.valor) FILTER (WHERE l.forma NOT IN ('permuta','compensacao')) AS total_liquidado_monetario,
          sum(l.valor) FILTER (WHERE l.forma IN ('permuta','compensacao'))     AS total_liquidado_nao_monetario
     FROM public.zoo_operacao_liquidacoes l
    WHERE l.estornado = false AND l.financeiro_lancamento_id IS NOT NULL
    GROUP BY l.operacao_id, l.financeiro_lancamento_id
 )
 SELECT t.cliente_id, t.operacao_id, t.titulo_id,
    f.valor AS valor_titulo, f.cancelado AS titulo_cancelado,
    COALESCE(liq.total_liquidado_valido, 0::numeric)        AS total_liquidado_valido,
    f.valor - COALESCE(liq.total_liquidado_valido, 0::numeric) AS saldo_titulo,
        CASE
            WHEN f.cancelado IS TRUE THEN 'excedente_divergente'::text
            ELSE
            CASE public._oc_estado_liquidacao(f.valor, COALESCE(liq.total_liquidado_valido, 0::numeric))
                WHEN 'nao_iniciada'::text THEN 'nao_liquidado'::text
                WHEN 'liquidada'::text THEN 'quitado'::text
                WHEN 'excedente'::text THEN 'excedente_divergente'::text
                ELSE 'parcial'::text
            END
        END AS estado,
    COALESCE(liq.total_liquidado_monetario, 0::numeric)     AS total_liquidado_monetario,
    COALESCE(liq.total_liquidado_nao_monetario, 0::numeric) AS total_liquidado_nao_monetario
   FROM titulos t
     JOIN public.financeiro_lancamentos_v2 f ON f.id = t.titulo_id
     LEFT JOIN liq ON liq.operacao_id = t.operacao_id AND liq.titulo_id = t.titulo_id
  WHERE f.cancelado IS NOT TRUE OR COALESCE(liq.total_liquidado_valido, 0::numeric) > 0::numeric;

CREATE OR REPLACE VIEW public.vw_oc_operacao_liquidacao AS
 WITH liq AS (
   SELECT l.operacao_id, sum(l.valor) AS total_liquidado_valido,
          sum(l.valor) FILTER (WHERE l.forma NOT IN ('permuta','compensacao')) AS total_liquidado_monetario,
          sum(l.valor) FILTER (WHERE l.forma IN ('permuta','compensacao'))     AS total_liquidado_nao_monetario
     FROM public.zoo_operacao_liquidacoes l
    WHERE l.estornado = false
    GROUP BY l.operacao_id
 )
 SELECT o.cliente_id, o.id AS operacao_id, o.valor_total,
    COALESCE(liq.total_liquidado_valido, 0::numeric)        AS total_liquidado_valido,
    b.base - COALESCE(liq.total_liquidado_valido, 0::numeric) AS saldo_operacao,
        CASE public._oc_estado_liquidacao(b.base, COALESCE(liq.total_liquidado_valido, 0::numeric))
            WHEN 'nao_iniciada'::text THEN 'nao_liquidada'::text
            WHEN 'liquidada'::text THEN 'quitada'::text
            WHEN 'excedente'::text THEN 'excedente'::text
            WHEN 'base_indefinida'::text THEN 'base_indefinida'::text
            ELSE 'parcial'::text
        END AS estado_liquidacao,
    b.base, b.base_origem,
    COALESCE(liq.total_liquidado_monetario, 0::numeric)     AS total_liquidado_monetario,
    COALESCE(liq.total_liquidado_nao_monetario, 0::numeric) AS total_liquidado_nao_monetario
   FROM public.zoo_operacoes_comerciais o
     LEFT JOIN liq ON liq.operacao_id = o.id
     LEFT JOIN LATERAL public._oc_base_saldo_operacao(o.id) b(base, base_origem) ON true;

-- Camada de OBRIGAÇÃO (partes documento/manual): valor nominal, liquidado, saldo, estado.
CREATE OR REPLACE VIEW public.vw_oc_obrigacoes AS
 WITH liq AS (
   SELECT l.financeiro_lancamento_id AS titulo_id,
          sum(l.valor) AS liquidado,
          sum(l.valor) FILTER (WHERE l.forma NOT IN ('permuta','compensacao')) AS liquidado_monetario,
          sum(l.valor) FILTER (WHERE l.forma IN ('permuta','compensacao'))     AS liquidado_nao_monetario
     FROM public.zoo_operacao_liquidacoes l
    WHERE l.estornado = false AND l.financeiro_lancamento_id IS NOT NULL
    GROUP BY l.financeiro_lancamento_id
 )
 SELECT pt.cliente_id, pt.operacao_id, pt.id AS obrigacao_id, pt.origem,
    pt.documento_id, pt.natureza, pt.componente, pt.sequencia_parcela, pt.quantidade_parcelas,
    pt.valor AS valor_nominal, pt.data_vencimento, pt.favorecido_id,
    pt.sem_movimentacao_caixa, pt.cancelada, pt.financeiro_lancamento_id AS titulo_id,
    COALESCE(liq.liquidado, 0::numeric)               AS total_liquidado,
    COALESCE(liq.liquidado_monetario, 0::numeric)     AS total_liquidado_monetario,
    COALESCE(liq.liquidado_nao_monetario, 0::numeric) AS total_liquidado_nao_monetario,
    pt.valor - COALESCE(liq.liquidado, 0::numeric)    AS saldo_aberto,
        CASE
            WHEN pt.cancelada THEN 'cancelada'::text
            WHEN pt.sem_movimentacao_caixa AND pt.financeiro_lancamento_id IS NULL THEN 'sem_caixa'::text
            ELSE
            CASE public._oc_estado_liquidacao(pt.valor, COALESCE(liq.liquidado, 0::numeric))
                WHEN 'nao_iniciada'::text THEN 'nao_liquidada'::text
                WHEN 'liquidada'::text THEN 'quitada'::text
                WHEN 'excedente'::text THEN 'excedente'::text
                ELSE 'parcial'::text
            END
        END AS estado
   FROM public.zoo_operacao_partes pt
     LEFT JOIN liq ON liq.titulo_id = pt.financeiro_lancamento_id
  WHERE pt.origem <> 'negociacao';

-- ============================================================================
-- 8. GRANTS / SEGURANÇA
-- ============================================================================
REVOKE ALL ON FUNCTION public.oc_gerar_obrigacoes(uuid,uuid,integer,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_cancelar_obrigacao(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_gerar_obrigacoes(uuid,uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_cancelar_obrigacao(uuid,uuid,text) TO authenticated;

ALTER VIEW public.vw_oc_titulos_liquidacao SET (security_invoker = true);
ALTER VIEW public.vw_oc_operacao_liquidacao SET (security_invoker = true);
ALTER VIEW public.vw_oc_obrigacoes SET (security_invoker = true);
GRANT SELECT ON public.vw_oc_obrigacoes TO authenticated;

COMMIT;
