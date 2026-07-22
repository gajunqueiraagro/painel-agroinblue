-- PR-OC-DOC-MODEL-01 — Modelo de dados documental da Operação Comercial (sem React/FINV2/liquidação).
--   Reutiliza zoo_operacao_documentos como o DOCUMENTO em si (operação, espécie, número, série,
--   chave, emissão, url opcional, documento de origem, cancelamento lógico). NÃO grava valores
--   financeiros consolidados na tabela principal. Os fatos econômicos vão para a tabela filha
--   zoo_operacao_documento_componentes (tipo+natureza+valor). Vínculo N:N com lotes em
--   zoo_operacao_documento_lotes. valor_liquido é DERIVADO em view, nunca persistido.
--   Cancelamento é lógico (sem DELETE destrutivo). Complementar é novo documento apontando a origem.
-- NÃO aplicar por este PR (aplicação remota é etapa separada, sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) zoo_operacao_documentos — o DOCUMENTO (identidade fiscal + cancelamento lógico).
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.zoo_operacao_documentos
  ALTER COLUMN url DROP NOT NULL,
  ADD COLUMN especie             text NOT NULL DEFAULT 'outro',
  ADD COLUMN numero              text,
  ADD COLUMN serie               text,
  ADD COLUMN chave_acesso        text,
  ADD COLUMN data_emissao        date,
  ADD COLUMN documento_origem_id uuid,
  ADD COLUMN observacao          text,
  ADD COLUMN cancelado           boolean NOT NULL DEFAULT false,
  ADD COLUMN cancelado_em        timestamptz,
  ADD COLUMN cancelado_por       uuid,
  ADD COLUMN cancelado_motivo    text,
  ADD COLUMN versao              integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at          timestamptz,
  ADD COLUMN updated_by          uuid;

ALTER TABLE public.zoo_operacao_documentos
  ADD CONSTRAINT zoo_operacao_documentos_especie_check
    CHECK (especie IN ('nf_principal','nf_complementar','outro')),
  -- origem só é permitida em complementar; e nunca aponta para si mesmo
  ADD CONSTRAINT zoo_operacao_documentos_origem_especie_check
    CHECK (documento_origem_id IS NULL OR especie = 'nf_complementar'),
  ADD CONSTRAINT zoo_operacao_documentos_origem_self_check
    CHECK (documento_origem_id IS DISTINCT FROM id),
  -- alvo dos FKs compostos (tenant + operação safe)
  ADD CONSTRAINT zoo_operacao_documentos_id_operacao_cliente_uniq UNIQUE (id, operacao_id, cliente_id),
  -- complementar aponta para documento da MESMA operação e cliente
  ADD CONSTRAINT zoo_operacao_doc_origem_fk
    FOREIGN KEY (documento_origem_id, operacao_id, cliente_id)
    REFERENCES public.zoo_operacao_documentos (id, operacao_id, cliente_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_zoo_oc_doc_origem ON public.zoo_operacao_documentos (documento_origem_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) zoo_operacao_documento_componentes — fatos econômicos do documento.
--    Sem coluna por tributo: (tipo texto controlado) × (natureza CHECK) × (valor).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.zoo_operacao_documento_componentes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   uuid NOT NULL,
  operacao_id  uuid NOT NULL,
  documento_id uuid NOT NULL,
  tipo         text NOT NULL,                              -- catálogo/texto controlado (valor_bruto, funrural, frete, comissao, ...)
  natureza     text NOT NULL,
  valor        numeric NOT NULL,
  ordem        integer NOT NULL,
  descricao    text,
  cancelado    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_at   timestamptz,
  updated_by   uuid,
  CONSTRAINT zoo_oc_doc_comp_natureza_check
    CHECK (natureza IN ('acrescimo','desconto_comercial','retencao_sem_caixa','despesa_desembolso','informativo')),
  CONSTRAINT zoo_oc_doc_comp_valor_check CHECK (valor >= 0),
  CONSTRAINT zoo_oc_doc_comp_ordem_check CHECK (ordem >= 1),
  CONSTRAINT zoo_oc_doc_comp_ordem_uniq  UNIQUE (documento_id, ordem),
  CONSTRAINT zoo_oc_doc_comp_documento_fk
    FOREIGN KEY (documento_id, operacao_id, cliente_id)
    REFERENCES public.zoo_operacao_documentos (id, operacao_id, cliente_id) ON DELETE CASCADE
);
CREATE INDEX idx_zoo_oc_doc_comp_documento ON public.zoo_operacao_documento_componentes (documento_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) zoo_operacao_documento_lotes — N:N documento ↔ lote (tenant/operação safe).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.zoo_operacao_documento_lotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL,
  operacao_id      uuid NOT NULL,
  documento_id     uuid NOT NULL,
  operacao_lote_id uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  CONSTRAINT zoo_oc_doc_lote_uniq UNIQUE (documento_id, operacao_lote_id),
  CONSTRAINT zoo_oc_doc_lote_documento_fk
    FOREIGN KEY (documento_id, operacao_id, cliente_id)
    REFERENCES public.zoo_operacao_documentos (id, operacao_id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT zoo_oc_doc_lote_lote_fk
    FOREIGN KEY (operacao_lote_id, operacao_id, cliente_id)
    REFERENCES public.zoo_operacao_lotes (id, operacao_id, cliente_id) ON DELETE RESTRICT
);
CREATE INDEX idx_zoo_oc_doc_lote_documento ON public.zoo_operacao_documento_lotes (documento_id);
CREATE INDEX idx_zoo_oc_doc_lote_lote ON public.zoo_operacao_documento_lotes (operacao_lote_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS + grants (padrão OC child: SELECT tenant a authenticated; escrita só via RPC SECDEF).
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.zoo_operacao_documento_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoo_operacao_documento_lotes       ENABLE ROW LEVEL SECURITY;

CREATE POLICY zoo_oc_doc_comp_select ON public.zoo_operacao_documento_componentes FOR SELECT TO authenticated
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));
CREATE POLICY zoo_oc_doc_lote_select ON public.zoo_operacao_documento_lotes FOR SELECT TO authenticated
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

REVOKE ALL ON TABLE public.zoo_operacao_documento_componentes FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.zoo_operacao_documento_lotes       FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.zoo_operacao_documento_componentes TO authenticated;
GRANT SELECT ON TABLE public.zoo_operacao_documento_lotes       TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Helper interno — aplica componentes + lotes (validação + REPLACE). SECURITY DEFINER.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._oc_documento_aplicar(
  p_documento_id uuid, p_operacao_id uuid, p_cliente_id uuid, p_actor uuid, p_componentes jsonb, p_lotes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_c jsonb; v_l text; v_nat text; v_ordem int; v_ordens int[] := '{}';
  v_lote uuid; v_lotes uuid[] := '{}';
BEGIN
  -- Validação dos componentes (antes de qualquer escrita).
  FOR v_c IN SELECT value FROM jsonb_array_elements(COALESCE(p_componentes,'[]'::jsonb))
  LOOP
    v_nat := v_c->>'natureza';
    IF v_nat NOT IN ('acrescimo','desconto_comercial','retencao_sem_caixa','despesa_desembolso','informativo') THEN
      RAISE EXCEPTION 'Natureza invalida: %', v_nat USING ERRCODE='P0001'; END IF;
    IF NULLIF(v_c->>'tipo','') IS NULL THEN RAISE EXCEPTION 'Componente sem tipo' USING ERRCODE='P0001'; END IF;
    IF COALESCE((v_c->>'valor')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Valor do componente deve ser >= 0' USING ERRCODE='P0001'; END IF;
    v_ordem := NULLIF(v_c->>'ordem','')::int;
    IF v_ordem IS NULL OR v_ordem < 1 THEN RAISE EXCEPTION 'Componente sem ordem valida (>=1)' USING ERRCODE='P0001'; END IF;
    IF v_ordem = ANY (v_ordens) THEN RAISE EXCEPTION 'Ordem % duplicada nos componentes', v_ordem USING ERRCODE='P0001'; END IF;
    v_ordens := array_append(v_ordens, v_ordem);
  END LOOP;

  -- Validação dos lotes (pertencimento garantido pelo FK; aqui: duplicidade + existência).
  FOR v_l IN SELECT value FROM jsonb_array_elements_text(COALESCE(p_lotes,'[]'::jsonb))
  LOOP
    v_lote := NULLIF(v_l,'')::uuid;
    IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote vazio no vinculo' USING ERRCODE='P0001'; END IF;
    IF v_lote = ANY (v_lotes) THEN RAISE EXCEPTION 'Lote % repetido no vinculo', v_lote USING ERRCODE='P0001'; END IF;
    v_lotes := array_append(v_lotes, v_lote);
    IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes lo
                    WHERE lo.id=v_lote AND lo.operacao_id=p_operacao_id AND lo.cliente_id=p_cliente_id) THEN
      RAISE EXCEPTION 'Lote % invalido/alheio a operacao', v_lote USING ERRCODE='P0002'; END IF;
  END LOOP;

  -- REPLACE atômico.
  DELETE FROM public.zoo_operacao_documento_componentes WHERE documento_id = p_documento_id;
  DELETE FROM public.zoo_operacao_documento_lotes       WHERE documento_id = p_documento_id;

  INSERT INTO public.zoo_operacao_documento_componentes
    (cliente_id, operacao_id, documento_id, tipo, natureza, valor, ordem, descricao, created_by)
  SELECT p_cliente_id, p_operacao_id, p_documento_id,
         c->>'tipo', c->>'natureza', (c->>'valor')::numeric, (c->>'ordem')::int, NULLIF(c->>'descricao',''), p_actor
    FROM jsonb_array_elements(COALESCE(p_componentes,'[]'::jsonb)) c;

  INSERT INTO public.zoo_operacao_documento_lotes
    (cliente_id, operacao_id, documento_id, operacao_lote_id, created_by)
  SELECT p_cliente_id, p_operacao_id, p_documento_id, l::uuid, p_actor
    FROM jsonb_array_elements_text(COALESCE(p_lotes,'[]'::jsonb)) l;
END;
$$;
REVOKE ALL ON FUNCTION public._oc_documento_aplicar(uuid,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC — registrar documento com componentes e lotes (atômico).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_documento_registrar(
  p_operacao_id uuid, p_cliente_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_id uuid;
  v_especie text := COALESCE(NULLIF(p_payload->>'especie',''), 'outro');
  v_origem uuid := NULLIF(p_payload->>'documento_origem_id','')::uuid;
  v_nome text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id=p_operacao_id AND cliente_id=p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE='P0001'; END IF;
  IF v_especie NOT IN ('nf_principal','nf_complementar','outro') THEN
    RAISE EXCEPTION 'Especie invalida: %', v_especie USING ERRCODE='P0001'; END IF;

  -- Complementar: exige origem válida (mesma operação/cliente, ativa).
  IF v_especie = 'nf_complementar' THEN
    IF v_origem IS NULL THEN RAISE EXCEPTION 'Complementar exige documento_origem_id' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_documentos d
                    WHERE d.id=v_origem AND d.operacao_id=p_operacao_id AND d.cliente_id=p_cliente_id AND d.cancelado=false) THEN
      RAISE EXCEPTION 'Documento de origem % invalido/cancelado/alheio', v_origem USING ERRCODE='P0002'; END IF;
  ELSIF v_origem IS NOT NULL THEN
    RAISE EXCEPTION 'documento_origem_id so e permitido em nf_complementar' USING ERRCODE='P0001';
  END IF;

  v_nome := COALESCE(NULLIF(p_payload->>'nome',''), v_especie || COALESCE(' ' || NULLIF(p_payload->>'numero',''), ''));

  INSERT INTO public.zoo_operacao_documentos (
    cliente_id, operacao_id, nome, tipo, url, especie, numero, serie, chave_acesso, data_emissao,
    documento_origem_id, observacao, uploaded_em, uploaded_por, versao)
  VALUES (
    p_cliente_id, p_operacao_id, v_nome, NULLIF(p_payload->>'tipo',''), NULLIF(p_payload->>'url',''),
    v_especie, NULLIF(p_payload->>'numero',''), NULLIF(p_payload->>'serie',''), NULLIF(p_payload->>'chave_acesso',''),
    NULLIF(p_payload->>'data_emissao','')::date, v_origem, NULLIF(p_payload->>'observacao',''), now(), v_actor, 1)
  RETURNING id INTO v_id;

  PERFORM public._oc_documento_aplicar(v_id, p_operacao_id, p_cliente_id, v_actor,
                                       p_payload->'componentes', p_payload->'lotes');

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'documento_registrar',
          jsonb_build_object('documento_id', v_id, 'especie', v_especie), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'documento_id', v_id, 'especie', v_especie, 'versao', 1);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_documento_registrar(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_documento_registrar(uuid,uuid,jsonb) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC — editar documento ativo (header + substituição atômica de componentes/lotes).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_documento_editar(
  p_documento_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_doc public.zoo_operacao_documentos;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_doc FROM public.zoo_operacao_documentos WHERE id=p_documento_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento % nao encontrado', p_documento_id USING ERRCODE='P0002'; END IF;
  IF v_doc.cancelado THEN RAISE EXCEPTION 'Documento cancelado nao pode ser editado' USING ERRCODE='P0001'; END IF;
  IF v_doc.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_doc.versao USING ERRCODE='40001'; END IF;

  -- Atualiza header (campos presentes no payload; espécie/origem preservam coerência via CHECKs/FK).
  UPDATE public.zoo_operacao_documentos SET
    numero       = CASE WHEN p_payload ? 'numero' THEN NULLIF(p_payload->>'numero','') ELSE numero END,
    serie        = CASE WHEN p_payload ? 'serie' THEN NULLIF(p_payload->>'serie','') ELSE serie END,
    chave_acesso = CASE WHEN p_payload ? 'chave_acesso' THEN NULLIF(p_payload->>'chave_acesso','') ELSE chave_acesso END,
    data_emissao = CASE WHEN p_payload ? 'data_emissao' THEN NULLIF(p_payload->>'data_emissao','')::date ELSE data_emissao END,
    url          = CASE WHEN p_payload ? 'url' THEN NULLIF(p_payload->>'url','') ELSE url END,
    observacao   = CASE WHEN p_payload ? 'observacao' THEN NULLIF(p_payload->>'observacao','') ELSE observacao END,
    versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_documento_id;

  -- Substituição atômica de componentes e lotes (quando presentes no payload).
  IF (p_payload ? 'componentes') OR (p_payload ? 'lotes') THEN
    PERFORM public._oc_documento_aplicar(p_documento_id, v_doc.operacao_id, p_cliente_id, v_actor,
                                         COALESCE(p_payload->'componentes','[]'::jsonb),
                                         COALESCE(p_payload->'lotes','[]'::jsonb));
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, v_doc.operacao_id, 'documento_editar', jsonb_build_object('documento_id', p_documento_id), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'documento_id', p_documento_id, 'versao', v_doc.versao + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_documento_editar(uuid,uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_documento_editar(uuid,uuid,integer,jsonb) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPC — cancelar documento (lógico; preserva componentes/lotes).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_documento_cancelar(
  p_documento_id uuid, p_cliente_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_doc public.zoo_operacao_documentos;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_doc FROM public.zoo_operacao_documentos WHERE id=p_documento_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento % nao encontrado', p_documento_id USING ERRCODE='P0002'; END IF;
  IF v_doc.cancelado THEN RAISE EXCEPTION 'Documento ja cancelado' USING ERRCODE='P0001'; END IF;

  UPDATE public.zoo_operacao_documentos
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,
         versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_documento_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, v_doc.operacao_id, 'documento_cancelar',
          jsonb_build_object('documento_id', p_documento_id, 'motivo', p_motivo), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'documento_id', p_documento_id, 'cancelado', true);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_documento_cancelar(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_documento_cancelar(uuid,uuid,text) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- View de leitura consolidada — valor_liquido DERIVADO (nunca persistido).
--   valor_liquido = Σacrescimo − Σdesconto_comercial − Σretencao_sem_caixa − Σdespesa_desembolso.
--   informativo não altera o total. Subtotais por natureza expostos. Tenant-safe.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.vw_oc_documentos WITH (security_invoker = true) AS
SELECT
  d.cliente_id, d.operacao_id, d.id AS documento_id, d.especie, d.numero, d.serie,
  d.chave_acesso, d.data_emissao, d.url, d.documento_origem_id, d.observacao,
  d.cancelado, CASE WHEN d.cancelado THEN 'cancelado' ELSE 'ativo' END AS situacao,
  COALESCE(v.total_acrescimos, 0)          AS total_acrescimos,
  COALESCE(v.total_descontos_comerciais, 0) AS total_descontos_comerciais,
  COALESCE(v.total_retencoes_sem_caixa, 0)  AS total_retencoes_sem_caixa,
  COALESCE(v.total_despesas_desembolso, 0)  AS total_despesas_desembolso,
  COALESCE(v.total_acrescimos,0) - COALESCE(v.total_descontos_comerciais,0)
    - COALESCE(v.total_retencoes_sem_caixa,0) - COALESCE(v.total_despesas_desembolso,0) AS valor_liquido,
  COALESCE(cc.qtd_componentes, 0) AS qtd_componentes,
  COALESCE(ll.qtd_lotes, 0)       AS qtd_lotes
FROM public.zoo_operacao_documentos d
LEFT JOIN LATERAL (
  SELECT
    sum(valor) FILTER (WHERE natureza='acrescimo')          AS total_acrescimos,
    sum(valor) FILTER (WHERE natureza='desconto_comercial') AS total_descontos_comerciais,
    sum(valor) FILTER (WHERE natureza='retencao_sem_caixa') AS total_retencoes_sem_caixa,
    sum(valor) FILTER (WHERE natureza='despesa_desembolso') AS total_despesas_desembolso
  FROM public.zoo_operacao_documento_componentes c
  WHERE c.documento_id = d.id AND c.cancelado = false
) v ON true
LEFT JOIN LATERAL (SELECT count(*) AS qtd_componentes FROM public.zoo_operacao_documento_componentes c WHERE c.documento_id=d.id AND c.cancelado=false) cc ON true
LEFT JOIN LATERAL (SELECT count(*) AS qtd_lotes FROM public.zoo_operacao_documento_lotes l WHERE l.documento_id=d.id) ll ON true;

COMMENT ON VIEW public.vw_oc_documentos IS
  'PR-OC-DOC-MODEL-01: leitura documental consolidada. valor_liquido derivado = Σacrescimo − Σdesconto_comercial − Σretencao_sem_caixa − Σdespesa_desembolso (componentes nao cancelados; informativo = 0). Expoe subtotais por natureza + situacao (ativo|cancelado) + contagens. Tenant-safe (security_invoker).';

REVOKE ALL ON TABLE public.vw_oc_documentos FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_oc_documentos TO authenticated;
