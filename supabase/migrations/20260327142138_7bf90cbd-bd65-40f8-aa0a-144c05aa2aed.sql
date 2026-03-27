
-- Fase 2.1: Adicionar cliente_id em todas as tabelas de dados
-- Nullable inicialmente para não quebrar nada

-- Financeiro
ALTER TABLE public.financeiro_lancamentos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.financeiro_saldos_bancarios ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.financeiro_resumo_caixa ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.financeiro_importacoes ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.financeiro_centros_custo ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.financeiro_contas ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.financeiro_fornecedores ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;

-- Zootécnico
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.saldos_iniciais ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.pastos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.fechamento_pastos ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.chuvas ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.valor_rebanho_mensal ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
ALTER TABLE public.valor_rebanho_fechamento ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;

-- Cadastros
ALTER TABLE public.fazenda_cadastros ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;

-- Profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;
