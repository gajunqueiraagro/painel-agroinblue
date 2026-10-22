-- FIN-VISAO-GERAL-01 PR 1 — os GRUPOS DE ANALISE da Visao Geral no plano de contas (decisao do Gabriel, 22/10/2026).
--
-- A coluna financeiro_plano_contas.grupo_fluxo ja' existia e estava NULA em todas as 250 linhas (medido 22/10); nenhuma funcao a le^ e o
-- front so' a tem no types.ts. Passa a ser o grupo de analise do fluxo de caixa:
--   SAIDAS:   Custeio · Reposição de bovinos · Investimentos · Amortizações · Juros · Impostos e deduções · Dividendos · Outras saídas
--   ENTRADAS: Receitas operacionais · Entradas de capital e financiamento · Outras entradas
--   3-Transferências: sem grupo (a Visao Geral as trata a parte).
-- UMA regra (`fn_plano_grupo_fluxo`), usada pelo backfill e pelo gatilho: linha nova nasce com o grupo; mudar tipo/macro/grupo recalcula.
-- Linha ATIVA de 1-/2- sem grupo e' recusada (ck_plano_grupo_fluxo). O grupo pode ser trocado a mao numa linha (o gatilho so' preenche
-- quando vem nulo ou quando a classificacao muda), para o plano de um cliente apontar outro grupo sem mexer no codigo.
--
-- Fora da regra explicita (vao para "Outras saídas", reportado): a 1155 "Acerto de Boitel (despesas)" — 2-Saídas no macro "Receita
-- Operacional" (BOITEL-ABATE-PRODUTOR-01: as despesas do boitel na modalidade "abate em nome do produtor", liquidadas contra a venda).

CREATE OR REPLACE FUNCTION public.fn_plano_grupo_fluxo(p_tipo text, p_macro text, p_grupo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_tipo = '1-Entradas' THEN CASE
      WHEN p_macro = 'Receita Operacional' THEN 'Receitas operacionais'
      WHEN p_macro = 'Entrada Financeira' AND p_grupo = 'Entradas de Capital' THEN 'Entradas de capital e financiamento'
      ELSE 'Outras entradas' END
    WHEN p_tipo = '2-Saídas' THEN CASE
      WHEN p_grupo LIKE 'Juros de Financiamento%' THEN 'Juros'
      WHEN p_macro = 'Custeio Produção' AND (p_grupo LIKE 'Custo Fixo%' OR p_grupo LIKE 'Custo Variável%') THEN 'Custeio'
      WHEN p_macro = 'Investimento em Bovinos' THEN 'Reposição de bovinos'
      WHEN p_macro = 'Investimento na Fazenda' THEN 'Investimentos'
      WHEN p_macro = 'Saída Financeira' AND p_grupo = 'Amortizações' THEN 'Amortizações'
      WHEN p_macro IN ('Deduções de Receitas', 'Tributos') THEN 'Impostos e deduções'
      WHEN p_macro = 'Dividendos' THEN 'Dividendos'
      ELSE 'Outras saídas' END
    ELSE NULL END
$function$;

COMMENT ON FUNCTION public.fn_plano_grupo_fluxo(text, text, text) IS
  'FIN-VISAO-GERAL-01: o grupo de analise da Visao Geral de uma linha do plano (tipo, macro, grupo). Fonte unica do backfill e do gatilho.';

CREATE OR REPLACE FUNCTION public._fn_plano_grupo_fluxo_gatilho()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.grupo_fluxo := coalesce(NEW.grupo_fluxo, public.fn_plano_grupo_fluxo(NEW.tipo_operacao, NEW.macro_custo, NEW.grupo_custo));
  ELSIF NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao OR NEW.macro_custo IS DISTINCT FROM OLD.macro_custo
        OR NEW.grupo_custo IS DISTINCT FROM OLD.grupo_custo OR NEW.grupo_fluxo IS NULL THEN
    NEW.grupo_fluxo := public.fn_plano_grupo_fluxo(NEW.tipo_operacao, NEW.macro_custo, NEW.grupo_custo);
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._fn_plano_grupo_fluxo_gatilho() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_plano_grupo_fluxo
  BEFORE INSERT OR UPDATE ON public.financeiro_plano_contas
  FOR EACH ROW EXECUTE FUNCTION public._fn_plano_grupo_fluxo_gatilho();

-- o backfill: todas as linhas (globais e de cliente), pela mesma regra
UPDATE public.financeiro_plano_contas
   SET grupo_fluxo = public.fn_plano_grupo_fluxo(tipo_operacao, macro_custo, grupo_custo)
 WHERE grupo_fluxo IS DISTINCT FROM public.fn_plano_grupo_fluxo(tipo_operacao, macro_custo, grupo_custo);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plano_grupo_fluxo') THEN
    ALTER TABLE public.financeiro_plano_contas ADD CONSTRAINT ck_plano_grupo_fluxo
      CHECK (NOT (ativo IS TRUE AND tipo_operacao IN ('1-Entradas', '2-Saídas') AND grupo_fluxo IS NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.financeiro_plano_contas.grupo_fluxo IS
  'FIN-VISAO-GERAL-01: grupo de analise da Visao Geral (fn_plano_grupo_fluxo). Nulo so'' em 3-Transferências.';
