-- OC-LISTA-FINANC-CC-01 (Gabriel, 14/10/2026) — o resumo do conta corrente de VARIAS OCs numa chamada, para a Central.
--
-- SO' FUNCAO (nenhum DDL em tabela, nenhum dado). A lista de OCs lia o Financeiro e o Pagto das views do modelo TITULO
-- (`vw_oc_operacao_compromissos_resumo`, `vw_oc_operacao_liquidacao`), que nao olham `modelo_financeiro`: numa OC em conta
-- corrente quitada ela dizia "S/ lanc." / "Parcial". Esta funcao NAO TEM REGRA PROPRIA: para cada OC em conta corrente ela
-- devolve o TOPO do envelope do dono (`oc_conta_corrente`), sem as linhas; para as do modelo titulo, envelope nulo. As duas
-- contagens de documento (o clipe da lista) vao juntas, para a lista fazer UMA chamada:
--   docs_operacao   = documentos vivos da OC (`zoo_operacao_documentos`, aba Documentos da operacao);
--   docs_financeiro = documentos vivos dos lancamentos da OC (parte viva), diretos ou ligados por `financeiro_documento_vinculos`.
--
-- SECURITY INVOKER, como o dono: a RLS das tabelas vale; `tenant_ok` recusa com 42501 (sem usuario tambem) em vez de lista vazia.
-- OC de outro cliente ou id que nao existe: fica fora do retorno.
-- Retorno: jsonb { "<operacao_id>": { "modelo": text, "envelope": jsonb | null, "docs_operacao": int, "docs_financeiro": int } }.
-- Medido (14/10, todas as OCs em conta corrente de um cliente, o dono chamado uma vez por OC): Agnaldo 36 em 244 ms, NJ 46 em
-- 232 ms, Santa Rita 64 em 180 ms.

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.oc_conta_corrente_lote(p_cliente_id uuid, p_operacao_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET plan_cache_mode = force_custom_plan
AS $fn$
DECLARE
  v_out jsonb := '{}'::jsonb;
  r record;
  v_env jsonb;
BEGIN
  IF p_cliente_id IS NULL OR NOT COALESCE(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_operacao_ids IS NULL OR cardinality(p_operacao_ids) = 0 THEN
    RETURN v_out;
  END IF;

  FOR r IN
    SELECT o.id, o.modelo_financeiro
      FROM public.zoo_operacoes_comerciais o
     WHERE o.cliente_id = p_cliente_id
       AND o.id = ANY (p_operacao_ids)
  LOOP
    v_env := NULL;
    IF r.modelo_financeiro = 'conta_corrente' THEN
      v_env := public.oc_conta_corrente(r.id) - 'linhas' - 'explicacoes' - 'despesas';
    END IF;
    v_out := v_out || jsonb_build_object(r.id::text, jsonb_build_object(
      'modelo', r.modelo_financeiro,
      'envelope', v_env,
      'docs_operacao', (
        SELECT count(*) FROM public.zoo_operacao_documentos d
         WHERE d.operacao_id = r.id AND d.cancelado IS NOT TRUE),
      'docs_financeiro', (
        SELECT count(DISTINCT doc.id)
          FROM public.zoo_operacao_partes p
          JOIN public.financeiro_lancamento_documentos doc
            ON doc.cancelado IS NOT TRUE
           AND (doc.lancamento_id = p.financeiro_lancamento_id
                OR doc.id IN (SELECT v.documento_id FROM public.financeiro_documento_vinculos v
                               WHERE v.lancamento_id = p.financeiro_lancamento_id))
         WHERE p.operacao_id = r.id AND p.cancelada IS NOT TRUE AND p.financeiro_lancamento_id IS NOT NULL)
    ));
  END LOOP;
  RETURN v_out;
END;
$fn$;

COMMENT ON FUNCTION public.oc_conta_corrente_lote(uuid, uuid[]) IS
  'OC-LISTA-FINANC-CC-01 — o topo do envelope de oc_conta_corrente (sem linhas) por OC em conta corrente, nulo no modelo titulo, '
  'e as contagens de documento da OC e dos lancamentos dela. Sem regra propria. INVOKER + tenant_ok (42501).';

REVOKE ALL ON FUNCTION public.oc_conta_corrente_lote(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_conta_corrente_lote(uuid, uuid[]) TO authenticated, service_role;
