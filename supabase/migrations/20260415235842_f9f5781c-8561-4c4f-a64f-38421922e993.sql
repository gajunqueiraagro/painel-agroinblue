
CREATE TABLE public.meta_projetos_investimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id uuid REFERENCES public.fazendas(id),
  ano integer NOT NULL,
  nome text NOT NULL,
  subcentro text NOT NULL,
  centro_custo text NOT NULL,
  grupo_custo text NOT NULL,
  macro_custo text NOT NULL DEFAULT 'Investimento na Fazenda',
  responsavel text,
  status text NOT NULL DEFAULT 'planejado',
  orcamento_total numeric(14,2) DEFAULT 0,
  jan numeric(14,2) DEFAULT 0,
  fev numeric(14,2) DEFAULT 0,
  mar numeric(14,2) DEFAULT 0,
  abr numeric(14,2) DEFAULT 0,
  mai numeric(14,2) DEFAULT 0,
  jun numeric(14,2) DEFAULT 0,
  jul numeric(14,2) DEFAULT 0,
  ago numeric(14,2) DEFAULT 0,
  "set" numeric(14,2) DEFAULT 0,
  "out" numeric(14,2) DEFAULT 0,
  nov numeric(14,2) DEFAULT 0,
  dez numeric(14,2) DEFAULT 0,
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índice para queries frequentes
CREATE INDEX idx_meta_projetos_inv_cliente_ano ON public.meta_projetos_investimento(cliente_id, ano);
CREATE INDEX idx_meta_projetos_inv_fazenda ON public.meta_projetos_investimento(fazenda_id);

-- RLS
ALTER TABLE public.meta_projetos_investimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem visualizar projetos"
  ON public.meta_projetos_investimento FOR SELECT
  TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

CREATE POLICY "Gestores e admins podem inserir projetos"
  ON public.meta_projetos_investimento FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_agroinblue(auth.uid())
    OR (
      cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    )
  );

CREATE POLICY "Gestores e admins podem editar projetos"
  ON public.meta_projetos_investimento FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_agroinblue(auth.uid())
    OR (
      cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    )
  );

CREATE POLICY "Gestores e admins podem excluir projetos"
  ON public.meta_projetos_investimento FOR DELETE
  TO authenticated
  USING (
    public.is_admin_agroinblue(auth.uid())
    OR (
      cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    )
  );

-- Trigger updated_at
CREATE TRIGGER update_meta_projetos_investimento_updated_at
  BEFORE UPDATE ON public.meta_projetos_investimento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
