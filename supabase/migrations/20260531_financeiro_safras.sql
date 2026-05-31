-- Migration: 20260531_financeiro_safras.sql
-- PR-SAFRA-FINANCEIRA-DB (migration 254)
-- Cria dimensao economica de Safra (por cliente, NAO por fazenda) + FK no lancamento.
-- Sem backfill, sem inferencia por data, sem cultura/rateio/ano. Nao toca PC-100/DRE/Fluxo.
-- codigo/observacoes opcionais (NULL); UNIQUE(cliente_id,codigo) tolera multiplos NULL.

BEGIN;

CREATE TABLE IF NOT EXISTS public.financeiro_safras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  nome text NOT NULL,
  codigo text NULL,
  descricao text NULL,
  observacoes text NULL,
  ativa boolean NOT NULL DEFAULT true,
  ordem_exibicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_safras_cliente_nome_uk UNIQUE (cliente_id, nome),
  CONSTRAINT financeiro_safras_cliente_codigo_uk UNIQUE (cliente_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_financeiro_safras_cliente
  ON public.financeiro_safras (cliente_id);

ALTER TABLE public.financeiro_safras ENABLE ROW LEVEL SECURITY;
CREATE POLICY fs_sel ON public.financeiro_safras FOR SELECT USING (true);
CREATE POLICY fs_ins ON public.financeiro_safras FOR INSERT WITH CHECK (true);
CREATE POLICY fs_update ON public.financeiro_safras FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY fs_delete ON public.financeiro_safras FOR DELETE USING (true);

ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS safra_id uuid NULL
  REFERENCES public.financeiro_safras(id);

CREATE INDEX IF NOT EXISTS idx_financeiro_lancamentos_safra
  ON public.financeiro_lancamentos_v2 (safra_id);

COMMIT;
