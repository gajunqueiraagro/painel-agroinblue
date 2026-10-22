-- ITENS-NOTA-01 (Gabriel, 21/10/2026; mock aprovado claude.ai/artifact/XEP27qurTx78MrDLqX9hEf) — etapa 1: GUARDAR E VER os itens da nota.
-- (PARTE 1 de 2: as tabelas e a RLS. As funcoes estao na 20261028110710 — a migration foi partida em duas porque o canal recusa payload grande.)
-- Os itens sao do DOCUMENTO FISCAL (a chave de 44 digitos, por cliente), nunca da parcela: um cabecalho `nota_fiscal` por (cliente, chave)
-- e os itens dele, lidos igual pelas N parcelas (o documento do lancamento e' LIGADO a todas) e pela aba Documentos da OC (mesma chave).
-- Nada de copia por parcela. A conta do lancamento continua a unica que vale para DRE e caixa (decisao do Gabriel): item nao tem conta.
--   `nota_fiscal`        o cabecalho: numero, serie, emissao, natureza, regime (CRT), emitente, os TOTAIS (centavos), a origem ('xml'|'pdf'),
--                        o XML ORIGINAL (quando a origem e' XML) e a prova da soma (liquidos dos itens = valor da nota).
--   `nota_fiscal_itens`  TODOS os campos do item: nItem, codigo, EAN, descricao, NCM, CEST, CFOP, CST/CSOSN, comercial e tributavel,
--                        produto/desconto/frete/seguro/outras (centavos; `rateado` = veio do total do PDF), ICMS, ST, FCP, IPI, PIS, COFINS,
--                        IBS/CBS (com cClassTrib), rastro (lote/validade), info adicional e o LIQUIDO.
-- Escrita SO' pela RPC `fn_nota_fiscal_gravar(cliente, nota, itens, simular, operacao)` (SECURITY DEFINER, `tenant_ok`): o XML SEMPRE manda
-- (uma nota guardada do XML nao e' trocada pela leitura de PDF; a do PDF e' trocada pela do XML). Leitura pela RLS do cliente.
-- BACKFILL com trilha: `nota_fiscal_operacoes` (a operacao guarda as chaves que ganhou) e `fn_nota_fiscal_desfazer(operacao, motivo,
-- simular)` (tira as notas que a operacao criou e ninguem trocou depois).
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.nota_fiscal_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('backfill', 'leitura')),
  feita_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  feita_por uuid,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  desfeita_em timestamptz, desfeita_por uuid, desfeita_motivo text,
  CONSTRAINT nota_fiscal_op_desfeita_chk CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL))
);

CREATE TABLE IF NOT EXISTS public.nota_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  chave_acesso text NOT NULL CHECK (chave_acesso ~ '^[0-9]{44}$'),
  origem text NOT NULL CHECK (origem IN ('xml', 'pdf')),
  numero text, serie text, emissao date, natureza text, regime text,
  emitente_documento text, emitente_nome text,
  totais jsonb NOT NULL,
  xml_original text,
  soma_cent bigint NOT NULL,
  nota_cent bigint NOT NULL,
  soma_confere boolean GENERATED ALWAYS AS (soma_cent = nota_cent) STORED,
  lido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  lido_por uuid,
  operacao_id uuid REFERENCES public.nota_fiscal_operacoes(id),
  CONSTRAINT nota_fiscal_chave_unica UNIQUE (cliente_id, chave_acesso)
);

CREATE TABLE IF NOT EXISTS public.nota_fiscal_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id uuid NOT NULL REFERENCES public.nota_fiscal(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  n_item int NOT NULL,
  codigo text, ean text, descricao text NOT NULL, ncm text, cest text, cfop text, cst text, csosn text,
  unidade text, quantidade numeric, unitario numeric, unidade_trib text, quantidade_trib numeric, unitario_trib numeric,
  produto_cent bigint NOT NULL, desconto_cent bigint NOT NULL DEFAULT 0, frete_cent bigint NOT NULL DEFAULT 0,
  seguro_cent bigint NOT NULL DEFAULT 0, outras_cent bigint NOT NULL DEFAULT 0, rateado boolean NOT NULL DEFAULT false,
  icms jsonb, icms_st jsonb, fcp jsonb, fcp_st jsonb, ipi jsonb, pis jsonb, cofins jsonb, ibs_cbs jsonb,
  rastro jsonb NOT NULL DEFAULT '[]'::jsonb, info_adicional text,
  liquido_cent bigint NOT NULL,
  CONSTRAINT nota_fiscal_itens_n_unico UNIQUE (nota_id, n_item)
);
CREATE INDEX IF NOT EXISTS nota_fiscal_itens_nota_idx ON public.nota_fiscal_itens (nota_id);

ALTER TABLE public.nota_fiscal_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_fiscal_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nota_fiscal_op_select ON public.nota_fiscal_operacoes;
CREATE POLICY nota_fiscal_op_select ON public.nota_fiscal_operacoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
DROP POLICY IF EXISTS nota_fiscal_select ON public.nota_fiscal;
CREATE POLICY nota_fiscal_select ON public.nota_fiscal FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
DROP POLICY IF EXISTS nota_fiscal_itens_select ON public.nota_fiscal_itens;
CREATE POLICY nota_fiscal_itens_select ON public.nota_fiscal_itens FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.nota_fiscal_operacoes, public.nota_fiscal, public.nota_fiscal_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.nota_fiscal_operacoes, public.nota_fiscal, public.nota_fiscal_itens TO authenticated;
