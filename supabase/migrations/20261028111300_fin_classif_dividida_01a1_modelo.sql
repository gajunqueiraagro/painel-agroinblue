-- FIN-CLASSIF-DIVIDIDA-01a-1 (Gabriel 22/10/2026; mock aprovado 08h21; decisoes 09h41) — parte 1/4: o MODELO (tabelas).
-- O lancamento continua UMA linha (um pagamento, um vencimento, uma conciliacao); so' a CLASSIFICACAO ganha N partes (conta do plano e
-- tudo o que ela deriva — macro/grupo/centro/subcentro/escopo —, safra, cultura, fase, valor, %), soma = |valor do lancamento|.
-- UMA fonte de verdade: lancamento SEM divisao = 1 parte implicita (as colunas de hoje); dividido = `financeiro_lancamento_partes` + a
-- marca `classificacao_dividida`. Todo leitor que soma por classificacao passa a ler `vw_fin_classificacao_por_parte` (1 linha por
-- parte; a migracao dos leitores e' o 01a-2). Cada parte segue o bloco da SUA conta no DRE (`compoe_dre`/`gera_lcdpr` por parte, pela
-- mesma regra do `materializar_dre_lcdpr_from_plano`): "Investimento na Fazenda" continua no bloco proprio, como hoje.
-- Colunas de classificacao do lancamento dividido = as da MAIOR parte (quem so' mostra uma conta mostra a principal).

ALTER TABLE public.financeiro_lancamentos_v2 ADD COLUMN IF NOT EXISTS classificacao_dividida boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.financeiro_lancamentos_v2.classificacao_dividida IS
  'FIN-CLASSIF-DIVIDIDA-01a: a classificacao esta'' em financeiro_lancamento_partes (as colunas do lancamento = a maior parte).';

CREATE TABLE IF NOT EXISTS public.financeiro_lancamento_partes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  lancamento_id uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE CASCADE,
  ordem smallint NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),             -- em modulo; o sinal e' o do lancamento
  percentual numeric(12,8) NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  plano_conta_id uuid NOT NULL REFERENCES public.financeiro_plano_contas(id),
  macro_custo text, grupo_custo text, centro_custo text, subcentro text, escopo_negocio text,
  safra_id uuid, cultura text, fase text,
  compoe_dre boolean, gera_lcdpr boolean,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'nota', 'pai')),
  nota_itens jsonb,                                             -- origem 'nota': os itens (n_item) que formam a parte
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  UNIQUE (lancamento_id, ordem)
);
CREATE INDEX IF NOT EXISTS financeiro_lancamento_partes_cliente_idx ON public.financeiro_lancamento_partes (cliente_id);
ALTER TABLE public.financeiro_lancamento_partes ENABLE ROW LEVEL SECURITY;
CREATE POLICY partes_select_tenant ON public.financeiro_lancamento_partes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.financeiro_lancamento_partes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.financeiro_lancamento_partes FROM authenticated;   -- so' pelas RPCs

-- a trilha: cada dividir / voltar / reescalar, com o antes e o depois (o desfazer volta o "antes")
CREATE TABLE IF NOT EXISTS public.financeiro_lancamento_divisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  lancamento_id uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('dividir', 'dividir_nota', 'voltar', 'reescalar', 'pai', 'desfazer')),
  antes jsonb NOT NULL, depois jsonb NOT NULL,
  motivo text,
  financiamento_id uuid,
  criado_por uuid, criado_em timestamptz NOT NULL DEFAULT now(),
  desfeita_em timestamptz, desfeita_por uuid, desfeita_motivo text
);
CREATE INDEX IF NOT EXISTS financeiro_lancamento_divisoes_lanc_idx ON public.financeiro_lancamento_divisoes (lancamento_id, criado_em DESC);
ALTER TABLE public.financeiro_lancamento_divisoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY divisoes_select_tenant ON public.financeiro_lancamento_divisoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.financeiro_lancamento_divisoes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.financeiro_lancamento_divisoes FROM authenticated;

-- a parte segue o DRE da sua conta pela MESMA precedencia do `materializar_dre_lcdpr_from_plano`: transferencia fora; conta do plano com
-- compoe_dre FALSO vence; senao a matriz por macro; o plano so' de fallback. gera_lcdpr: o da conta; sem ele, o do lancamento.
CREATE OR REPLACE FUNCTION public._fn_fin_parte_flags(p_tipo text, p_plano uuid, p_lcdpr_lanc boolean)
RETURNS TABLE (compoe_dre boolean, gera_lcdpr boolean) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN p_tipo ILIKE '3-%' THEN false
              WHEN pc.compoe_dre IS FALSE THEN false
              ELSE coalesce(public.fn_compoe_dre_por_macro(p_tipo, pc.macro_custo), pc.compoe_dre) END,
         coalesce(pc.gera_lcdpr, p_lcdpr_lanc)
    FROM public.financeiro_plano_contas pc WHERE pc.id = p_plano
$$;
REVOKE ALL ON FUNCTION public._fn_fin_parte_flags(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
