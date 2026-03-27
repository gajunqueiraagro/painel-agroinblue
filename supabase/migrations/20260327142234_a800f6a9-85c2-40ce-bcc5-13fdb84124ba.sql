
-- Fase 2.3: Aplicar NOT NULL em todas as tabelas + índices para performance

-- NOT NULL constraints
ALTER TABLE public.fazendas ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_lancamentos ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_saldos_bancarios ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_resumo_caixa ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_importacoes ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_centros_custo ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_contas ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.financeiro_fornecedores ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.lancamentos ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.saldos_iniciais ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.pastos ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.fechamento_pastos ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.chuvas ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.valor_rebanho_mensal ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.valor_rebanho_fechamento ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.fazenda_cadastros ALTER COLUMN cliente_id SET NOT NULL;

-- Profiles: manter nullable pois novos usuários podem não ter cliente ainda
-- ALTER TABLE public.profiles ALTER COLUMN cliente_id SET NOT NULL;

-- Índices para performance em tabelas de alto volume
CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_cliente_id ON public.financeiro_lancamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cliente_id ON public.lancamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pastos_cliente_id ON public.pastos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fechamento_pastos_cliente_id ON public.fechamento_pastos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_chuvas_cliente_id ON public.chuvas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fazendas_cliente_id ON public.fazendas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_valor_rebanho_mensal_cliente_id ON public.valor_rebanho_mensal(cliente_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_saldos_bancarios_cliente_id ON public.financeiro_saldos_bancarios(cliente_id);
