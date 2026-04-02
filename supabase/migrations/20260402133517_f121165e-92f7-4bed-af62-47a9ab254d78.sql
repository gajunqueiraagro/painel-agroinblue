
-- 1. Criar tabela boitel_operacoes
CREATE TABLE public.boitel_operacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  fazenda_origem_id UUID NOT NULL REFERENCES public.fazendas(id),
  fazenda_destino_nome TEXT NOT NULL DEFAULT '',
  lote TEXT,
  numero_contrato TEXT,
  data_envio DATE,
  quantidade INTEGER NOT NULL DEFAULT 0,
  peso_inicial_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
  modalidade TEXT NOT NULL DEFAULT 'diaria' CHECK (modalidade IN ('diaria', 'arroba', 'parceria')),

  -- Inputs técnicos
  dias INTEGER NOT NULL DEFAULT 0,
  gmd NUMERIC(6,3) NOT NULL DEFAULT 0,
  rendimento_entrada NUMERIC(5,2) NOT NULL DEFAULT 50,
  rendimento_saida NUMERIC(5,2) NOT NULL DEFAULT 52,

  -- Custos
  custo_diaria NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo_arroba NUMERIC(10,2) NOT NULL DEFAULT 0,
  percentual_parceria NUMERIC(5,2) NOT NULL DEFAULT 0,
  custos_extras_parceria NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo_nutricao NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo_sanidade NUMERIC(10,2) NOT NULL DEFAULT 0,
  custo_frete NUMERIC(10,2) NOT NULL DEFAULT 0,
  outros_custos NUMERIC(10,2) NOT NULL DEFAULT 0,
  despesas_abate NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_venda_arroba NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Resultados (snapshot — salvar, não recalcular)
  faturamento_bruto NUMERIC(14,2) NOT NULL DEFAULT 0,
  faturamento_liquido NUMERIC(14,2) NOT NULL DEFAULT 0,
  receita_produtor NUMERIC(14,2) NOT NULL DEFAULT 0,
  custo_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  lucro_total NUMERIC(14,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.boitel_operacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem boitel do seu cliente"
  ON public.boitel_operacoes FOR SELECT
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

CREATE POLICY "Usuários criam boitel do seu cliente"
  ON public.boitel_operacoes FOR INSERT
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

CREATE POLICY "Usuários editam boitel do seu cliente"
  ON public.boitel_operacoes FOR UPDATE
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

CREATE POLICY "Usuários excluem boitel do seu cliente"
  ON public.boitel_operacoes FOR DELETE
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())));

-- Trigger updated_at
CREATE TRIGGER update_boitel_operacoes_updated_at
  BEFORE UPDATE ON public.boitel_operacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Adicionar boitel_id na tabela lancamentos (movimentação de rebanho)
ALTER TABLE public.lancamentos
  ADD COLUMN boitel_id UUID REFERENCES public.boitel_operacoes(id);

-- 3. Adicionar boitel_id na tabela financeiro_lancamentos_v2
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN boitel_id UUID REFERENCES public.boitel_operacoes(id);
