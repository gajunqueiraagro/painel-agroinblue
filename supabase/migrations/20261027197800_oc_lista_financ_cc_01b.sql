-- OC-LISTA-FINANC-CC-01b (Gabriel, 14/10/2026) — o lote do conta corrente passa a devolver, alem do topo e das contagens, dois
-- blocos ENXUTOS lidos do envelope do dono (`oc_conta_corrente`), para o Resumo/PDF e o ponto ambar da Central:
--   despesas   = o bloco `despesas` do dono, so' com {descricao, favorecido, valor, status, vencimento} (sem ids nem conta);
--                `valor` no sinal do dono (entrada +, saida −); `status` = o do lancamento;
--   programados = as linhas do dono com tipo 'recebimento' e status 'programado', so' com {data, valor}; `valor` = o
--                `mov_recebido` da linha, no sinal do banco (o mesmo do envelope; a tela aplica o lado da fazenda).
-- NENHUMA REGRA NOVA: so' selecao de campos do que o dono ja' devolve, na ordem dele. Topo do envelope e contagens iguais a
-- 20261027197700. So' FUNCAO (CREATE OR REPLACE, mesma assinatura e retorno): nenhum DDL em tabela, nenhum dado.
-- Retorno por OC: { modelo, envelope, docs_operacao, docs_financeiro, despesas, programados } — no modelo titulo, envelope nulo
-- e os dois blocos vazios ([]).

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
  v_cc jsonb;
  v_env jsonb;
  v_desp jsonb;
  v_prog jsonb;
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
    v_desp := '[]'::jsonb;
    v_prog := '[]'::jsonb;
    IF r.modelo_financeiro = 'conta_corrente' THEN
      v_cc := public.oc_conta_corrente(r.id);
      v_env := v_cc - 'linhas' - 'explicacoes' - 'despesas';
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'descricao', e -> 'descricao', 'favorecido', e -> 'favorecido', 'valor', e -> 'valor',
               'status', e -> 'status', 'vencimento', e -> 'vencimento') ORDER BY ord), '[]'::jsonb)
        INTO v_desp
        FROM jsonb_array_elements(COALESCE(v_cc -> 'despesas', '[]'::jsonb)) WITH ORDINALITY AS x(e, ord);
      SELECT COALESCE(jsonb_agg(jsonb_build_object('data', e -> 'data', 'valor', e -> 'mov_recebido') ORDER BY ord), '[]'::jsonb)
        INTO v_prog
        FROM jsonb_array_elements(COALESCE(v_cc -> 'linhas', '[]'::jsonb)) WITH ORDINALITY AS x(e, ord)
       WHERE e ->> 'tipo' = 'recebimento' AND e ->> 'status' = 'programado';
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
         WHERE p.operacao_id = r.id AND p.cancelada IS NOT TRUE AND p.financeiro_lancamento_id IS NOT NULL),
      'despesas', v_desp,
      'programados', v_prog
    ));
  END LOOP;
  RETURN v_out;
END;
$fn$;

COMMENT ON FUNCTION public.oc_conta_corrente_lote(uuid, uuid[]) IS
  'OC-LISTA-FINANC-CC-01/01b — o topo do envelope de oc_conta_corrente (sem linhas) por OC em conta corrente, nulo no modelo '
  'titulo; as contagens de documento; e os blocos enxutos despesas {descricao, favorecido, valor, status, vencimento} e '
  'programados {data, valor} lidos do envelope do dono. Sem regra propria. INVOKER + tenant_ok (42501).';

REVOKE ALL ON FUNCTION public.oc_conta_corrente_lote(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_conta_corrente_lote(uuid, uuid[]) TO authenticated, service_role;
