-- FIN-VISAO-GERAL-01 PR 2 — a META ligada pelo plano_conta_id (a mesma doutrina dos lancamentos, DRE-CLASSIF-COPIA-01).
--
-- FASE 0 (22/10/2026): ninguem no banco grava planejamento_financeiro; os escritores sao do front — a tela de META do financeiro
-- (usePlanejamentoFinanceiro: upsert, copia de ano, apagar), o espelho das OCs (metaPlanejamentoMirror: compra/venda/abate) e o das
-- parcelas de financiamento (parcelaMirror). Todos gravam TEXTO (macro/grupo/centro/subcentro). As 2.164 linhas (6 clientes, 2026,
-- cenario meta) casam com EXATAMENTE uma linha ativa do plano (global ou do cliente): 0 sem par, 0 ambiguas.
--
-- O QUE MUDA:
--   · planejamento_financeiro.plano_conta_id (FK, NOT NULL depois do backfill) e' a CHAVE. macro/grupo/centro/subcentro viram COPIA
--     derivada do plano pelo gatilho (iguais as de hoje: o backfill nao muda nenhum texto).
--   · Enquanto os escritores gravam texto, o gatilho resolve a chave pelo texto (linha ativa, global ou do cliente) no INSERT e no
--     UPDATE que muda o texto; texto sem linha no plano e' recusado com frase pronta.
--   · escopo_negocio NAO e' sobrescrito: 202 linhas tem escopo diferente do plano (196 de Dividendos gravadas 'pecuaria', 6 de Entradas
--     de Capital gravadas 'administrativo') e telas de hoje leem essa coluna. A Visao Geral (fn_vg_meta) usa o escopo do PLANO.

ALTER TABLE public.planejamento_financeiro
  ADD COLUMN IF NOT EXISTS plano_conta_id uuid REFERENCES public.financeiro_plano_contas(id);

CREATE INDEX IF NOT EXISTS idx_planejamento_financeiro_plano ON public.planejamento_financeiro (plano_conta_id);

CREATE OR REPLACE FUNCTION public._fn_planejamento_plano_conta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  p public.financeiro_plano_contas;
BEGIN
  -- o texto mudou sem a chave mudar: o escritor de hoje manda texto, entao a chave e' resolvida de novo
  IF TG_OP = 'UPDATE' AND NEW.plano_conta_id IS NOT DISTINCT FROM OLD.plano_conta_id
     AND (NEW.macro_custo IS DISTINCT FROM OLD.macro_custo OR NEW.grupo_custo IS DISTINCT FROM OLD.grupo_custo
          OR NEW.centro_custo IS DISTINCT FROM OLD.centro_custo OR NEW.subcentro IS DISTINCT FROM OLD.subcentro) THEN
    NEW.plano_conta_id := NULL;
  END IF;

  IF NEW.plano_conta_id IS NULL THEN
    v_ids := ARRAY(
      SELECT pc.id FROM public.financeiro_plano_contas pc
       WHERE pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = NEW.cliente_id)
         AND pc.macro_custo = NEW.macro_custo AND pc.grupo_custo = NEW.grupo_custo
         AND pc.centro_custo = NEW.centro_custo AND pc.subcentro = NEW.subcentro);
    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'A meta "%" não existe no plano de contas deste cliente. Escolha uma conta do plano.',
        concat_ws(' › ', NEW.macro_custo, NEW.grupo_custo, NEW.centro_custo, NEW.subcentro) USING ERRCODE = '23503';
    ELSIF cardinality(v_ids) > 1 THEN
      RAISE EXCEPTION 'A meta "%" casa com mais de uma conta do plano. Corrija o plano antes de gravar.',
        concat_ws(' › ', NEW.macro_custo, NEW.grupo_custo, NEW.centro_custo, NEW.subcentro) USING ERRCODE = '23514';
    END IF;
    NEW.plano_conta_id := v_ids[1];
  END IF;

  SELECT * INTO p FROM public.financeiro_plano_contas WHERE id = NEW.plano_conta_id;
  IF p.cliente_id IS NOT NULL AND p.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    RAISE EXCEPTION 'A conta do plano escolhida é de outro cliente.' USING ERRCODE = '23503';
  END IF;
  NEW.macro_custo := p.macro_custo;
  NEW.grupo_custo := p.grupo_custo;
  NEW.centro_custo := p.centro_custo;
  NEW.subcentro := p.subcentro;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public._fn_planejamento_plano_conta() FROM PUBLIC, anon, authenticated;

-- roda antes de trg_planejamento_resolve_escopo (ordem alfabetica), que so' preenche o escopo quando vem nulo
CREATE OR REPLACE TRIGGER trg_planejamento_plano_conta
  BEFORE INSERT OR UPDATE ON public.planejamento_financeiro
  FOR EACH ROW EXECUTE FUNCTION public._fn_planejamento_plano_conta();

-- backfill pelo texto (o gatilho resolve; texto e escopo ficam como estao)
UPDATE public.planejamento_financeiro SET plano_conta_id = NULL, updated_at = updated_at WHERE plano_conta_id IS NULL;

ALTER TABLE public.planejamento_financeiro ALTER COLUMN plano_conta_id SET NOT NULL;

COMMENT ON COLUMN public.planejamento_financeiro.plano_conta_id IS
  'FIN-VISAO-GERAL-01 PR 2: a chave da meta no plano de contas. macro/grupo/centro/subcentro sao copia derivada (trg_planejamento_plano_conta).';
