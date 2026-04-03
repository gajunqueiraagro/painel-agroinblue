
-- 1. Create boitel_lotes master table
CREATE TABLE public.boitel_lotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id),
  lote_codigo TEXT NOT NULL DEFAULT '',
  data_envio DATE,
  boitel_destino TEXT NOT NULL DEFAULT '',
  contrato_baia TEXT,
  quantidade_cab INTEGER NOT NULL DEFAULT 0,
  peso_saida_fazenda_kg NUMERIC NOT NULL DEFAULT 0,
  status_lote TEXT NOT NULL DEFAULT 'ativo' CHECK (status_lote IN ('ativo','encerrado','cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, fazenda_id, lote_codigo, data_envio)
);

ALTER TABLE public.boitel_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view boitel_lotes"
  ON public.boitel_lotes FOR SELECT TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Members can insert boitel_lotes"
  ON public.boitel_lotes FOR INSERT TO authenticated
  WITH CHECK (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Members can update boitel_lotes"
  ON public.boitel_lotes FOR UPDATE TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Members can delete boitel_lotes"
  ON public.boitel_lotes FOR DELETE TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE TRIGGER update_boitel_lotes_updated_at
  BEFORE UPDATE ON public.boitel_lotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create boitel_planejamento table
CREATE TABLE public.boitel_planejamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  boitel_lote_id UUID NOT NULL REFERENCES public.boitel_lotes(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL DEFAULT 1,
  modalidade TEXT NOT NULL DEFAULT 'diaria',
  dias INTEGER NOT NULL DEFAULT 90,
  gmd NUMERIC NOT NULL DEFAULT 0,
  rendimento_entrada NUMERIC NOT NULL DEFAULT 50,
  rendimento_saida NUMERIC NOT NULL DEFAULT 52,
  custo_diaria NUMERIC NOT NULL DEFAULT 0,
  custo_arroba NUMERIC NOT NULL DEFAULT 0,
  percentual_parceria NUMERIC NOT NULL DEFAULT 0,
  custos_extras_parceria NUMERIC NOT NULL DEFAULT 0,
  custo_nutricao NUMERIC NOT NULL DEFAULT 0,
  custo_sanidade NUMERIC NOT NULL DEFAULT 0,
  custo_frete NUMERIC NOT NULL DEFAULT 0,
  outros_custos NUMERIC NOT NULL DEFAULT 0,
  despesas_abate NUMERIC NOT NULL DEFAULT 0,
  preco_venda_arroba NUMERIC NOT NULL DEFAULT 0,
  faturamento_bruto NUMERIC NOT NULL DEFAULT 0,
  faturamento_liquido NUMERIC NOT NULL DEFAULT 0,
  receita_produtor NUMERIC NOT NULL DEFAULT 0,
  custo_total NUMERIC NOT NULL DEFAULT 0,
  lucro_total NUMERIC NOT NULL DEFAULT 0,
  possui_adiantamento BOOLEAN NOT NULL DEFAULT false,
  data_adiantamento DATE,
  pct_adiantamento_diarias NUMERIC NOT NULL DEFAULT 0,
  valor_adiantamento_diarias NUMERIC NOT NULL DEFAULT 0,
  valor_adiantamento_sanitario NUMERIC NOT NULL DEFAULT 0,
  valor_adiantamento_outros NUMERIC NOT NULL DEFAULT 0,
  valor_total_antecipado NUMERIC NOT NULL DEFAULT 0,
  adiantamento_observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(boitel_lote_id)
);

ALTER TABLE public.boitel_planejamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage boitel_planejamento"
  ON public.boitel_planejamento FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boitel_lotes bl WHERE bl.id = boitel_lote_id AND public.is_cliente_member(auth.uid(), bl.cliente_id)));

CREATE TRIGGER update_boitel_planejamento_updated_at
  BEFORE UPDATE ON public.boitel_planejamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create boitel_planejamento_historico table
CREATE TABLE public.boitel_planejamento_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  boitel_lote_id UUID NOT NULL REFERENCES public.boitel_lotes(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  dados JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.boitel_planejamento_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view boitel_planejamento_historico"
  ON public.boitel_planejamento_historico FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boitel_lotes bl WHERE bl.id = boitel_lote_id AND public.is_cliente_member(auth.uid(), bl.cliente_id)));

CREATE POLICY "Members can insert boitel_planejamento_historico"
  ON public.boitel_planejamento_historico FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.boitel_lotes bl WHERE bl.id = boitel_lote_id AND public.is_cliente_member(auth.uid(), bl.cliente_id)));

-- 4. Create boitel_adiantamentos table
CREATE TABLE public.boitel_adiantamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  boitel_lote_id UUID NOT NULL REFERENCES public.boitel_lotes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('pago','recebido')),
  data DATE NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.boitel_adiantamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage boitel_adiantamentos"
  ON public.boitel_adiantamentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boitel_lotes bl WHERE bl.id = boitel_lote_id AND public.is_cliente_member(auth.uid(), bl.cliente_id)));

-- 5. Add boitel_lote_id columns to lancamentos and financeiro_lancamentos_v2
ALTER TABLE public.lancamentos ADD COLUMN boitel_lote_id UUID REFERENCES public.boitel_lotes(id);
ALTER TABLE public.financeiro_lancamentos_v2 ADD COLUMN boitel_lote_id UUID REFERENCES public.boitel_lotes(id);

-- 6. Migrate existing data
-- 6a. Create boitel_lotes from boitel_operacoes
INSERT INTO public.boitel_lotes (id, cliente_id, fazenda_id, lote_codigo, data_envio, boitel_destino, contrato_baia, quantidade_cab, peso_saida_fazenda_kg)
SELECT id, cliente_id, fazenda_origem_id, COALESCE(lote, ''), data_envio::date, fazenda_destino_nome, numero_contrato, quantidade, peso_inicial_kg
FROM public.boitel_operacoes;

-- 6b. Create boitel_planejamento from boitel_operacoes
INSERT INTO public.boitel_planejamento (boitel_lote_id, modalidade, dias, gmd, rendimento_entrada, rendimento_saida, custo_diaria, custo_arroba, percentual_parceria, custos_extras_parceria, custo_nutricao, custo_sanidade, custo_frete, outros_custos, despesas_abate, preco_venda_arroba, faturamento_bruto, faturamento_liquido, receita_produtor, custo_total, lucro_total, possui_adiantamento, data_adiantamento, pct_adiantamento_diarias, valor_adiantamento_diarias, valor_adiantamento_sanitario, valor_adiantamento_outros, valor_total_antecipado, adiantamento_observacao)
SELECT id, modalidade, dias, gmd, rendimento_entrada, rendimento_saida, custo_diaria, custo_arroba, percentual_parceria, custos_extras_parceria, custo_nutricao, custo_sanidade, custo_frete, outros_custos, despesas_abate, preco_venda_arroba, faturamento_bruto, faturamento_liquido, receita_produtor, custo_total, lucro_total, possui_adiantamento, data_adiantamento::date, pct_adiantamento_diarias, valor_adiantamento_diarias, valor_adiantamento_sanitario, valor_adiantamento_outros, valor_total_antecipado, adiantamento_observacao
FROM public.boitel_operacoes;

-- 6c. Update FK references in lancamentos
UPDATE public.lancamentos SET boitel_lote_id = boitel_id WHERE boitel_id IS NOT NULL;

-- 6d. Update FK references in financeiro_lancamentos_v2
UPDATE public.financeiro_lancamentos_v2 SET boitel_lote_id = boitel_id WHERE boitel_id IS NOT NULL;

-- 7. Create trigger to auto-save history on planejamento update
CREATE OR REPLACE FUNCTION public.save_boitel_planejamento_historico()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.boitel_planejamento_historico (boitel_lote_id, versao, dados)
  VALUES (OLD.boitel_lote_id, OLD.versao, to_jsonb(OLD));
  NEW.versao := OLD.versao + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_boitel_planejamento_historico
  BEFORE UPDATE ON public.boitel_planejamento
  FOR EACH ROW EXECUTE FUNCTION public.save_boitel_planejamento_historico();
