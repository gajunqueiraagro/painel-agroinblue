
-- 1. financeiro_importacoes
CREATE TABLE public.financeiro_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  total_linhas integer NOT NULL DEFAULT 0,
  total_validas integer NOT NULL DEFAULT 0,
  total_com_erro integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view fin_importacoes" ON public.financeiro_importacoes FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert fin_importacoes" ON public.financeiro_importacoes FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update fin_importacoes" ON public.financeiro_importacoes FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete fin_importacoes" ON public.financeiro_importacoes FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

-- 2. financeiro_lancamentos
CREATE TABLE public.financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.financeiro_importacoes(id) ON DELETE SET NULL,
  origem_dado text NOT NULL DEFAULT 'import_excel',
  data_realizacao date NOT NULL,
  data_pagamento date,
  ano_mes text NOT NULL,
  produto text,
  fornecedor text,
  valor numeric NOT NULL DEFAULT 0,
  status_transacao text,
  tipo_operacao text,
  conta_origem text,
  conta_destino text,
  macro_custo text,
  grupo_custo text,
  centro_custo text,
  subcentro text,
  nota_fiscal text,
  cpf_cnpj text,
  recorrencia text,
  forma_pagamento text,
  obs text,
  escopo_negocio text DEFAULT 'pecuaria',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view fin_lancamentos" ON public.financeiro_lancamentos FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert fin_lancamentos" ON public.financeiro_lancamentos FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update fin_lancamentos" ON public.financeiro_lancamentos FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete fin_lancamentos" ON public.financeiro_lancamentos FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

-- 3. financeiro_centros_custo
CREATE TABLE public.financeiro_centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  tipo_operacao text NOT NULL,
  macro_custo text NOT NULL,
  grupo_custo text NOT NULL,
  centro_custo text NOT NULL,
  subcentro text,
  codigo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_fin_centro_custo_hierarquia
  ON public.financeiro_centros_custo (fazenda_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, COALESCE(subcentro, ''));

ALTER TABLE public.financeiro_centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view fin_centros" ON public.financeiro_centros_custo FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert fin_centros" ON public.financeiro_centros_custo FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update fin_centros" ON public.financeiro_centros_custo FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete fin_centros" ON public.financeiro_centros_custo FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

-- 4. financeiro_fornecedores
CREATE TABLE public.financeiro_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cpf_cnpj text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view fin_fornecedores" ON public.financeiro_fornecedores FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert fin_fornecedores" ON public.financeiro_fornecedores FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update fin_fornecedores" ON public.financeiro_fornecedores FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete fin_fornecedores" ON public.financeiro_fornecedores FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

-- 5. financeiro_contas
CREATE TABLE public.financeiro_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome_conta text NOT NULL,
  banco text,
  tipo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view fin_contas" ON public.financeiro_contas FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert fin_contas" ON public.financeiro_contas FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update fin_contas" ON public.financeiro_contas FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete fin_contas" ON public.financeiro_contas FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

-- Trigger updated_at for financeiro_lancamentos
CREATE TRIGGER update_fin_lancamentos_updated_at
  BEFORE UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
