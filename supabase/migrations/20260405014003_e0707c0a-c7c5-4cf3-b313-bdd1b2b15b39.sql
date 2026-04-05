ALTER TABLE public.financeiro_lancamentos_v2
ADD COLUMN conta_destino_id uuid REFERENCES public.financeiro_contas_bancarias(id) DEFAULT NULL;