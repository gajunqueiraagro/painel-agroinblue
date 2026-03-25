
-- Table for bank balance snapshots (EXPORT_SALDOS_BANCARIOS)
CREATE TABLE public.financeiro_saldos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.financeiro_importacoes(id) ON DELETE CASCADE,
  conta_banco text NOT NULL,
  ano_mes text NOT NULL,
  saldo_final numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, conta_banco, ano_mes)
);

ALTER TABLE public.financeiro_saldos_bancarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view saldos_bancarios"
  ON public.financeiro_saldos_bancarios FOR SELECT TO authenticated
  USING (public.is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can insert saldos_bancarios"
  ON public.financeiro_saldos_bancarios FOR INSERT TO authenticated
  WITH CHECK (public.is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can delete saldos_bancarios"
  ON public.financeiro_saldos_bancarios FOR DELETE TO authenticated
  USING (public.is_fazenda_member(auth.uid(), fazenda_id));

-- Table for cash summary (EXPORT_RESUMO_CAIXA)
CREATE TABLE public.financeiro_resumo_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.financeiro_importacoes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  entradas numeric NOT NULL DEFAULT 0,
  saidas numeric NOT NULL DEFAULT 0,
  saldo_final_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano_mes)
);

ALTER TABLE public.financeiro_resumo_caixa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view resumo_caixa"
  ON public.financeiro_resumo_caixa FOR SELECT TO authenticated
  USING (public.is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can insert resumo_caixa"
  ON public.financeiro_resumo_caixa FOR INSERT TO authenticated
  WITH CHECK (public.is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can delete resumo_caixa"
  ON public.financeiro_resumo_caixa FOR DELETE TO authenticated
  USING (public.is_fazenda_member(auth.uid(), fazenda_id));

-- Add new columns to financeiro_contas for EXPORT_CONTAS
ALTER TABLE public.financeiro_contas
  ADD COLUMN IF NOT EXISTS instrumento text,
  ADD COLUMN IF NOT EXISTS agencia_conta text,
  ADD COLUMN IF NOT EXISTS uso text;
