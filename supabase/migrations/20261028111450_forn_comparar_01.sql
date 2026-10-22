-- NOTA-FORNECEDOR-COMPARAR-01 (Gabriel 22/10/2026 08h10) — atualizar o cadastro do fornecedor pela nota (ou pela Receita) SO' com o que o
-- operador MARCOU, depois de ver como esta' hoje e o que muda ("pode estar atualizando um errado e poluir todo o sistema").
--   `fn_fornecedor_atualizar_campos(fornecedor, campos, origem, referencia, simular)`: `campos` = {coluna: valor} so' das colunas da
--     lista (nome, fantasia, CNPJ/CPF, IE, endereco, CEP, cidade/UF); grava so' o que difere, e a TRILHA por campo (antes/depois) em
--     `fornecedor_campos_alteracoes`. As travas de sempre valem (o CNPJ de outro ativo nao grava — `_trg_fornecedor_documento_ativo_unico`;
--     o nome em caixa padronizada — `_fn_fornecedor_nome_caixa_trg`); a recusa volta em frase.
--   `fn_fornecedor_atualizar_campos_desfazer(alteracao, motivo, simular)`: volta SO' o campo que segue com o valor que a alteracao gravou
--     (o mexido depois fica, e e' contado).
-- SECURITY DEFINER, `tenant_ok` pelo cliente do cadastro; REVOKE de PUBLIC/anon; EXECUTE para `authenticated`.
-- (PARTE 1 de 2: a tabela da trilha. As funcoes estao na 20261028111451 — partida porque o canal recusa payload grande.)
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.fornecedor_campos_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fornecedor_id uuid NOT NULL REFERENCES public.financeiro_fornecedores(id),
  origem text NOT NULL CHECK (origem IN ('nota', 'receita', 'tela')),
  referencia text,
  -- {coluna: {antes, depois}}
  campos jsonb NOT NULL,
  feita_em timestamptz NOT NULL DEFAULT now(),
  feita_por uuid DEFAULT auth.uid(),
  desfeita_em timestamptz, desfeita_por uuid, desfeita_motivo text,
  CONSTRAINT fca_desfeita_coerente CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_fca_fornecedor ON public.fornecedor_campos_alteracoes (fornecedor_id, feita_em DESC);
ALTER TABLE public.fornecedor_campos_alteracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fca_select_tenant ON public.fornecedor_campos_alteracoes;
CREATE POLICY fca_select_tenant ON public.fornecedor_campos_alteracoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fornecedor_campos_alteracoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fornecedor_campos_alteracoes TO authenticated;
GRANT ALL ON public.fornecedor_campos_alteracoes TO service_role;
