
-- Tabela principal do financiamento
CREATE TABLE public.financiamentos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id              uuid REFERENCES public.fazendas(id),
  descricao               text NOT NULL,
  tipo_financiamento      text NOT NULL,
  credor_id               uuid REFERENCES public.financeiro_fornecedores(id),
  conta_bancaria_id       uuid REFERENCES public.financeiro_contas_bancarias(id),
  valor_total             numeric NOT NULL DEFAULT 0,
  valor_entrada           numeric NOT NULL DEFAULT 0,
  taxa_juros_mensal       numeric NOT NULL DEFAULT 0,
  total_parcelas          integer NOT NULL,
  data_contrato           date NOT NULL,
  data_primeira_parcela   date NOT NULL,
  plano_conta_captacao_id uuid REFERENCES public.financeiro_plano_contas(id),
  plano_conta_parcela_id  uuid REFERENCES public.financeiro_plano_contas(id),
  gerar_lancamento_captacao boolean NOT NULL DEFAULT false,
  observacao              text,
  status                  text NOT NULL DEFAULT 'ativo',
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Parcelas do financiamento
CREATE TABLE public.financiamento_parcelas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financiamento_id uuid NOT NULL REFERENCES public.financiamentos(id) ON DELETE CASCADE,
  cliente_id       uuid NOT NULL,
  numero_parcela   integer NOT NULL,
  data_vencimento  date NOT NULL,
  valor_principal  numeric NOT NULL DEFAULT 0,
  valor_juros      numeric NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'pendente',
  data_pagamento   date,
  lancamento_id    uuid REFERENCES public.financeiro_lancamentos_v2(id),
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.financiamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financiamento_parcelas ENABLE ROW LEVEL SECURITY;

-- Políticas para financiamentos
CREATE POLICY "Membros do cliente acessam financiamentos"
  ON public.financiamentos FOR SELECT
  TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros do cliente criam financiamentos"
  ON public.financiamentos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros do cliente editam financiamentos"
  ON public.financiamentos FOR UPDATE
  TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros do cliente excluem financiamentos"
  ON public.financiamentos FOR DELETE
  TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

-- Políticas para parcelas
CREATE POLICY "Membros do cliente acessam parcelas"
  ON public.financiamento_parcelas FOR SELECT
  TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros do cliente criam parcelas"
  ON public.financiamento_parcelas FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros do cliente editam parcelas"
  ON public.financiamento_parcelas FOR UPDATE
  TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros do cliente excluem parcelas"
  ON public.financiamento_parcelas FOR DELETE
  TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));
