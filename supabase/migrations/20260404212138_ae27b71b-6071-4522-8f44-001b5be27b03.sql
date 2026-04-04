CREATE TABLE IF NOT EXISTS public.valor_rebanho_fechamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  categoria text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  peso_medio_kg numeric NOT NULL DEFAULT 0,
  preco_kg numeric NOT NULL DEFAULT 0,
  valor_total_categoria numeric NOT NULL DEFAULT 0,
  fechado_em timestamp with time zone NULL,
  fechado_por uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valor_rebanho_fechamento_itens_unq UNIQUE (fazenda_id, ano_mes, categoria)
);

CREATE INDEX IF NOT EXISTS idx_valor_rebanho_fechamento_itens_fazenda_ano_mes
  ON public.valor_rebanho_fechamento_itens (fazenda_id, ano_mes);

CREATE INDEX IF NOT EXISTS idx_valor_rebanho_fechamento_itens_cliente
  ON public.valor_rebanho_fechamento_itens (cliente_id);

ALTER TABLE public.valor_rebanho_fechamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select"
ON public.valor_rebanho_fechamento_itens
FOR SELECT
TO authenticated
USING ((cliente_id IN ( SELECT public.get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)) OR public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_insert"
ON public.valor_rebanho_fechamento_itens
FOR INSERT
TO authenticated
WITH CHECK (((cliente_id IN ( SELECT public.get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)) OR public.is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_update"
ON public.valor_rebanho_fechamento_itens
FOR UPDATE
TO authenticated
USING ((cliente_id IN ( SELECT public.get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)) OR public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_delete"
ON public.valor_rebanho_fechamento_itens
FOR DELETE
TO authenticated
USING ((cliente_id IN ( SELECT public.get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)) OR public.is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_valor_rebanho_fechamento_itens_updated_at
BEFORE UPDATE ON public.valor_rebanho_fechamento_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();