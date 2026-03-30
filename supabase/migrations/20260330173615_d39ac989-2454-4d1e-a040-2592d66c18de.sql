-- V2 financeiro: cancelar importação sem delete físico, preservar rastreabilidade e proteger histórico/importados

ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS editado_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hash_importacao text;

ALTER TABLE public.financeiro_importacoes_v2
  ADD COLUMN IF NOT EXISTS cancelada_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid;

CREATE OR REPLACE FUNCTION public.compute_financeiro_lancamento_v2_hash(
  _cliente_id uuid,
  _fazenda_id uuid,
  _data_competencia date,
  _data_pagamento date,
  _valor numeric,
  _tipo_operacao text,
  _conta_bancaria_id uuid,
  _descricao text,
  _favorecido_id uuid,
  _documento text,
  _nota_fiscal text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(concat_ws('|',
    coalesce(_cliente_id::text, ''),
    coalesce(_fazenda_id::text, ''),
    coalesce(coalesce(_data_pagamento, _data_competencia)::text, ''),
    coalesce(trim(lower(_tipo_operacao)), ''),
    coalesce(_valor::text, '0'),
    coalesce(_conta_bancaria_id::text, ''),
    coalesce(trim(lower(_descricao)), ''),
    coalesce(_favorecido_id::text, ''),
    coalesce(trim(lower(_documento)), ''),
    coalesce(trim(lower(_nota_fiscal)), '')
  ));
$$;

CREATE OR REPLACE FUNCTION public.set_financeiro_lancamento_v2_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL THEN
    NEW.hash_importacao := public.compute_financeiro_lancamento_v2_hash(
      NEW.cliente_id,
      NEW.fazenda_id,
      NEW.data_competencia,
      NEW.data_pagamento,
      NEW.valor,
      NEW.tipo_operacao,
      NEW.conta_bancaria_id,
      NEW.descricao,
      NEW.favorecido_id,
      NEW.documento,
      NEW.nota_fiscal
    );
  ELSE
    NEW.hash_importacao := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_financeiro_lancamento_v2_editado_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.lote_importacao_id IS NOT NULL
     AND COALESCE(OLD.editado_manual, false) = false
     AND (
       NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id OR
       NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id OR
       NEW.ano_mes IS DISTINCT FROM OLD.ano_mes OR
       NEW.data_competencia IS DISTINCT FROM OLD.data_competencia OR
       NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento OR
       NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao OR
       NEW.status_transacao IS DISTINCT FROM OLD.status_transacao OR
       NEW.descricao IS DISTINCT FROM OLD.descricao OR
       NEW.documento IS DISTINCT FROM OLD.documento OR
       NEW.historico IS DISTINCT FROM OLD.historico OR
       NEW.valor IS DISTINCT FROM OLD.valor OR
       NEW.sinal IS DISTINCT FROM OLD.sinal OR
       NEW.macro_custo IS DISTINCT FROM OLD.macro_custo OR
       NEW.centro_custo IS DISTINCT FROM OLD.centro_custo OR
       NEW.subcentro IS DISTINCT FROM OLD.subcentro OR
       NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio OR
       NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id OR
       NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id OR
       NEW.observacao IS DISTINCT FROM OLD.observacao OR
       NEW.nota_fiscal IS DISTINCT FROM OLD.nota_fiscal OR
       NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento OR
       NEW.dados_pagamento IS DISTINCT FROM OLD.dados_pagamento OR
       NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     ) THEN
    NEW.editado_manual := true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_financeiro_lancamento_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.origem_lancamento = 'importacao_historica'
     AND NOT public.is_admin_agroinblue(auth.uid()) THEN
    RAISE EXCEPTION 'Lançamentos históricos no V2 são somente leitura para perfis não-admin.';
  END IF;

  IF TG_OP = 'DELETE'
     AND OLD.lote_importacao_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamentos importados no V2 não podem ser removidos fisicamente; use cancelamento lógico da importação.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lote_importacao_id IS NOT NULL
     AND COALESCE(NEW.cancelado, false) = false
     AND NEW.hash_importacao IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.financeiro_lancamentos_v2 existing
       WHERE existing.cliente_id = NEW.cliente_id
         AND existing.hash_importacao = NEW.hash_importacao
         AND COALESCE(existing.cancelado, false) = false
         AND existing.lote_importacao_id IS NOT NULL
         AND existing.id <> COALESCE(NEW.id, gen_random_uuid())
     ) THEN
    RAISE EXCEPTION 'Duplicidade detectada no V2 para este lançamento importado.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_agroinblue(auth.uid())
    OR (
      _cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
      AND coalesce(_origem_lancamento, '') <> 'importacao_historica'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_financeiro_importacao_v2(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_agroinblue(auth.uid())
    OR (
      _cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    );
$$;

CREATE OR REPLACE FUNCTION public.cancel_financeiro_importacao_v2(_importacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_importacao public.financeiro_importacoes_v2%ROWTYPE;
  v_cancelados integer := 0;
BEGIN
  SELECT *
  INTO v_importacao
  FROM public.financeiro_importacoes_v2
  WHERE id = _importacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação V2 não encontrada.';
  END IF;

  IF NOT public.can_manage_financeiro_importacao_v2(v_importacao.cliente_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para cancelar esta importação.';
  END IF;

  IF v_importacao.status = 'cancelada' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_cancelled', true,
      'cancelled_rows', 0
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND COALESCE(l.cancelado, false) = false
      AND l.editado_manual = true
  ) THEN
    RAISE EXCEPTION 'Esta importação possui lançamentos editados manualmente e não pode ser cancelada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND COALESCE(l.cancelado, false) = false
      AND l.status_transacao = 'conciliado'
  ) THEN
    RAISE EXCEPTION 'Esta importação possui lançamentos conciliados e não pode ser cancelada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.financeiro_lancamentos_v2 l
    WHERE l.lote_importacao_id = _importacao_id
      AND l.origem_lancamento = 'importacao_historica'
      AND NOT public.is_admin_agroinblue(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Somente admin pode cancelar importações históricas no V2.';
  END IF;

  UPDATE public.financeiro_importacoes_v2
  SET status = 'cancelada',
      cancelada_em = now(),
      cancelada_por = auth.uid()
  WHERE id = _importacao_id;

  UPDATE public.financeiro_lancamentos_v2
  SET cancelado = true,
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE lote_importacao_id = _importacao_id
    AND COALESCE(cancelado, false) = false;

  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'already_cancelled', false,
    'cancelled_rows', v_cancelados
  );
END;
$$;

UPDATE public.financeiro_lancamentos_v2
SET hash_importacao = public.compute_financeiro_lancamento_v2_hash(
  cliente_id,
  fazenda_id,
  data_competencia,
  data_pagamento,
  valor,
  tipo_operacao,
  conta_bancaria_id,
  descricao,
  favorecido_id,
  documento,
  nota_fiscal
)
WHERE lote_importacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_v2_importacao_ativo
  ON public.financeiro_lancamentos_v2 (lote_importacao_id, cancelado);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_v2_hash_lookup
  ON public.financeiro_lancamentos_v2 (cliente_id, hash_importacao)
  WHERE lote_importacao_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_hash ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_hash
BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.set_financeiro_lancamento_v2_hash();

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_editado_manual ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_editado_manual
BEFORE UPDATE ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.mark_financeiro_lancamento_v2_editado_manual();

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_guard_update ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_guard_update
BEFORE UPDATE ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.guard_financeiro_lancamento_v2();

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_guard_delete ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_guard_delete
BEFORE DELETE ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.guard_financeiro_lancamento_v2();

DROP TRIGGER IF EXISTS trg_financeiro_lancamento_v2_unique_hash ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_financeiro_lancamento_v2_unique_hash
BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
FOR EACH ROW
EXECUTE FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash();

DROP POLICY IF EXISTS cliente_update ON public.financeiro_lancamentos_v2;
DROP POLICY IF EXISTS cliente_delete ON public.financeiro_lancamentos_v2;

CREATE POLICY cliente_update_v2_controlado
ON public.financeiro_lancamentos_v2
FOR UPDATE
TO authenticated
USING (public.can_manage_financeiro_lancamento_v2(cliente_id, origem_lancamento))
WITH CHECK (public.can_manage_financeiro_lancamento_v2(cliente_id, origem_lancamento));

CREATE POLICY cliente_delete_v2_controlado
ON public.financeiro_lancamentos_v2
FOR DELETE
TO authenticated
USING (
  public.can_manage_financeiro_lancamento_v2(cliente_id, origem_lancamento)
  AND lote_importacao_id IS NULL
);

DROP POLICY IF EXISTS cliente_update ON public.financeiro_importacoes_v2;
DROP POLICY IF EXISTS cliente_delete ON public.financeiro_importacoes_v2;

CREATE POLICY cliente_update_importacoes_v2_controlado
ON public.financeiro_importacoes_v2
FOR UPDATE
TO authenticated
USING (public.can_manage_financeiro_importacao_v2(cliente_id))
WITH CHECK (public.can_manage_financeiro_importacao_v2(cliente_id));