
-- 1. Tabela de importações zootécnicas
CREATE TABLE public.zoot_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  nome_arquivo text,
  hash_arquivo text,
  total_linhas integer DEFAULT 0,
  linhas_validas integer DEFAULT 0,
  linhas_erro integer DEFAULT 0,
  status text NOT NULL DEFAULT 'processado',
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelada_em timestamptz,
  cancelada_por uuid
);

ALTER TABLE public.zoot_importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem ver importações zoot"
  ON public.zoot_importacoes FOR SELECT
  TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

CREATE POLICY "Gestores e admins podem inserir importações zoot"
  ON public.zoot_importacoes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_agroinblue(auth.uid())
    OR (
      cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    )
  );

CREATE POLICY "Gestores e admins podem atualizar importações zoot"
  ON public.zoot_importacoes FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_agroinblue(auth.uid())
    OR (
      cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    )
  );

-- Index for duplicate detection by hash
CREATE INDEX idx_zoot_importacoes_hash ON public.zoot_importacoes (cliente_id, fazenda_id, hash_arquivo)
  WHERE status != 'excluido';

-- 2. Staging table for raw lines
CREATE TABLE public.zoot_importacoes_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.zoot_importacoes(id) ON DELETE CASCADE,
  linha_numero integer,
  linha jsonb,
  status text DEFAULT 'pendente',
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zoot_importacoes_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem ver staging zoot"
  ON public.zoot_importacoes_staging FOR SELECT
  TO authenticated
  USING (
    importacao_id IN (
      SELECT id FROM public.zoot_importacoes
      WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
    )
  );

CREATE POLICY "Gestores e admins podem inserir staging zoot"
  ON public.zoot_importacoes_staging FOR INSERT
  TO authenticated
  WITH CHECK (
    importacao_id IN (
      SELECT id FROM public.zoot_importacoes
      WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
        AND (
          public.is_admin_agroinblue(auth.uid())
          OR public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
        )
    )
  );

-- 3. Add lote_importacao_id to lancamentos
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS lote_importacao_id uuid REFERENCES public.zoot_importacoes(id);

-- 4. Add hash_linha to lancamentos for deduplication audit
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS hash_linha text;

-- Index for dedup queries
CREATE INDEX idx_lancamentos_hash_linha ON public.lancamentos (fazenda_id, hash_linha)
  WHERE cancelado = false;

CREATE INDEX idx_lancamentos_lote_importacao ON public.lancamentos (lote_importacao_id)
  WHERE lote_importacao_id IS NOT NULL;

-- 5. Function to cancel a zoot import (similar to financeiro pattern)
CREATE OR REPLACE FUNCTION public.cancel_zoot_importacao(_importacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_imp public.zoot_importacoes%ROWTYPE;
  v_cancelados integer := 0;
  v_closed_month text;
BEGIN
  SELECT * INTO v_imp FROM public.zoot_importacoes WHERE id = _importacao_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Importação zootécnica não encontrada.';
  END IF;

  -- Permission check
  IF NOT public.is_admin_agroinblue(auth.uid()) THEN
    IF NOT (
      v_imp.cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), v_imp.cliente_id) IN ('gestor_cliente'::public.perfil_acesso)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para cancelar esta importação.';
    END IF;
  END IF;

  IF v_imp.status = 'excluido' THEN
    RETURN jsonb_build_object('ok', true, 'already_cancelled', true, 'cancelled_rows', 0);
  END IF;

  -- Check for closed months (P1 oficial)
  SELECT DISTINCT substring(l.data, 1, 7) INTO v_closed_month
  FROM public.lancamentos l
  WHERE l.lote_importacao_id = _importacao_id
    AND COALESCE(l.cancelado, false) = false
    AND EXISTS (
      SELECT 1 FROM public.fechamento_pastos fp
      WHERE fp.fazenda_id = l.fazenda_id
        AND fp.ano_mes = substring(l.data, 1, 7)
        AND fp.status = 'fechado'
    )
  LIMIT 1;

  IF v_closed_month IS NOT NULL THEN
    RAISE EXCEPTION 'Mês % possui fechamento ativo. Reabra o período antes de excluir esta importação.', v_closed_month;
  END IF;

  -- Cancel all linked lancamentos
  UPDATE public.lancamentos
  SET cancelado = true,
      cancelado_em = now(),
      cancelado_por = auth.uid()
  WHERE lote_importacao_id = _importacao_id
    AND COALESCE(cancelado, false) = false;

  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  -- Mark import as excluded
  UPDATE public.zoot_importacoes
  SET status = 'excluido',
      cancelada_em = now(),
      cancelada_por = auth.uid()
  WHERE id = _importacao_id;

  RETURN jsonb_build_object('ok', true, 'already_cancelled', false, 'cancelled_rows', v_cancelados);
END;
$$;
