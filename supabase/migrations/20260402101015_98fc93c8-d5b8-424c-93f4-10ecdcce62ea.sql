
-- 1. Create audit_log table
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL,
  fazenda_id uuid,
  usuario_id uuid,
  modulo text NOT NULL,
  acao text NOT NULL,
  tabela_origem text NOT NULL,
  registro_id uuid,
  resumo text,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX idx_audit_log_cliente_created ON public.audit_log (cliente_id, created_at DESC);
CREATE INDEX idx_audit_log_modulo ON public.audit_log (modulo);
CREATE INDEX idx_audit_log_usuario ON public.audit_log (usuario_id);
CREATE INDEX idx_audit_log_fazenda ON public.audit_log (fazenda_id);

-- 2. Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only members of the same client can view
CREATE POLICY "cliente_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))
    OR is_admin_agroinblue(auth.uid())
  );

-- Insert allowed (for triggers running as SECURITY DEFINER)
CREATE POLICY "system_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE allowed (immutable audit trail)

-- 3. Helper function to determine module from lancamentos.tipo
CREATE OR REPLACE FUNCTION public.audit_modulo_from_lancamento_tipo(p_tipo text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_tipo IN ('compra') THEN 'compra'
    WHEN p_tipo IN ('abate') THEN 'abate'
    WHEN p_tipo IN ('venda', 'venda_pe') THEN 'venda'
    WHEN p_tipo IN ('transferencia_saida', 'transferencia_entrada') THEN 'transferencia'
    WHEN p_tipo IN ('consumo') THEN 'consumo'
    WHEN p_tipo IN ('morte') THEN 'morte'
    WHEN p_tipo IN ('nascimento') THEN 'nascimento'
    ELSE p_tipo
  END;
$$;

-- 4. Helper to build a short summary for lancamentos
CREATE OR REPLACE FUNCTION public.audit_resumo_lancamento(r public.lancamentos)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT concat_ws(' | ',
    initcap(replace(r.tipo, '_', ' ')),
    r.quantidade || ' cab',
    r.categoria,
    (SELECT f.nome FROM public.fazendas f WHERE f.id = r.fazenda_id LIMIT 1)
  );
$$;

-- 5. Trigger function for lancamentos
CREATE OR REPLACE FUNCTION public.audit_trigger_lancamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
  v_resumo text;
  v_old jsonb;
  v_new jsonb;
  v_modulo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criou';
    v_modulo := audit_modulo_from_lancamento_tipo(NEW.tipo);
    v_resumo := audit_resumo_lancamento(NEW);
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), v_modulo, v_acao, 'lancamentos', NEW.id, v_resumo, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Detect cancel
    IF NEW.cancelado = true AND OLD.cancelado = false THEN
      v_acao := 'cancelou';
    ELSE
      v_acao := 'editou';
    END IF;
    v_modulo := audit_modulo_from_lancamento_tipo(NEW.tipo);
    v_resumo := audit_resumo_lancamento(NEW);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.updated_by, auth.uid()), v_modulo, v_acao, 'lancamentos', NEW.id, v_resumo, v_old, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_modulo := audit_modulo_from_lancamento_tipo(OLD.tipo);
    v_resumo := audit_resumo_lancamento(OLD);
    v_old := to_jsonb(OLD);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
    VALUES (OLD.cliente_id, OLD.fazenda_id, auth.uid(), v_modulo, 'excluiu', 'lancamentos', OLD.id, v_resumo, v_old);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_lancamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_lancamentos();

-- 6. Trigger function for financeiro_lancamentos_v2
CREATE OR REPLACE FUNCTION public.audit_trigger_financeiro_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
  v_resumo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_resumo := concat_ws(' | ', initcap(NEW.tipo_operacao), 'R$ ' || round(NEW.valor::numeric, 2), NEW.descricao);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), 'financeiro', 'criou', 'financeiro_lancamentos_v2', NEW.id, v_resumo, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.cancelado = true AND OLD.cancelado = false THEN
      v_acao := 'cancelou';
    ELSE
      v_acao := 'editou';
    END IF;
    v_resumo := concat_ws(' | ', initcap(NEW.tipo_operacao), 'R$ ' || round(NEW.valor::numeric, 2), NEW.descricao);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.updated_by, auth.uid()), 'financeiro', v_acao, 'financeiro_lancamentos_v2', NEW.id, v_resumo, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_financeiro_v2
  AFTER INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_financeiro_v2();

-- 7. Trigger function for chuvas
CREATE OR REPLACE FUNCTION public.audit_trigger_chuvas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resumo text;
  v_fazenda_nome text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT f.nome INTO v_fazenda_nome FROM public.fazendas f WHERE f.id = NEW.fazenda_id LIMIT 1;
    v_resumo := concat_ws(' | ', 'Chuva', v_fazenda_nome, NEW.milimetros || ' mm', NEW.data);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), 'chuva', 'criou', 'chuvas', NEW.id, v_resumo, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT f.nome INTO v_fazenda_nome FROM public.fazendas f WHERE f.id = NEW.fazenda_id LIMIT 1;
    v_resumo := concat_ws(' | ', 'Chuva', v_fazenda_nome, NEW.milimetros || ' mm', NEW.data);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, COALESCE(NEW.created_by, auth.uid()), 'chuva', 'editou', 'chuvas', NEW.id, v_resumo, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT f.nome INTO v_fazenda_nome FROM public.fazendas f WHERE f.id = OLD.fazenda_id LIMIT 1;
    v_resumo := concat_ws(' | ', 'Chuva', v_fazenda_nome, OLD.milimetros || ' mm', OLD.data);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
    VALUES (OLD.cliente_id, OLD.fazenda_id, auth.uid(), 'chuva', 'excluiu', 'chuvas', OLD.id, v_resumo, to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_chuvas
  AFTER INSERT OR UPDATE OR DELETE ON public.chuvas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_chuvas();
