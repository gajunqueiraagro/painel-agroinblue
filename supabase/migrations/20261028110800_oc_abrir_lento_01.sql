-- OC-ABRIR-LENTO-01 (Gabriel 21/10/2026): o resumo do conta corrente da Central (oc_conta_corrente_lote) passava de 2 s
-- como authenticated no NJ (media 2,9 s e maximo 7,8 s no pg_stat_statements; o teto do papel e' 8 s -> o timeout do toast).
-- O gargalo: a contagem de documentos do financeiro (docs_financeiro) com OR entre o documento proprio do lancamento e o
-- ligado por financeiro_documento_vinculos, que impede indice (1,0 s das 59 OCs do NJ). Agora e' a UNIAO das duas origens,
-- pelos indices idx_fin_lanc_doc_lanc e idx_fin_doc_vinc_lancamento. MESMA regra (cancelado e' NOT NULL, IS NOT TRUE = false;
-- count distinct = count da uniao). Nada mais muda no corpo. Guarda por md5 de origem e de destino; ACL preservada pelo REPLACE.
set local lock_timeout = '2s';
do $g$
begin
  if md5((select prosrc from pg_proc where oid = 'public.oc_conta_corrente_lote(uuid,uuid[])'::regprocedure))
     not in ('b431d3de3340e4b0e1a3fc2a3d0ad924', 'a650089f384466d24759db29b991deb3') then
    raise exception 'oc_conta_corrente_lote: corpo de origem inesperado';
  end if;
end $g$;

CREATE OR REPLACE FUNCTION public.oc_conta_corrente_lote(p_cliente_id uuid, p_operacao_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
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
       WHERE e ->> 'tipo' = 'recebimento' AND e ->> 'status' IN ('programado', 'previsto');   -- ABATE-PROJETADO-01c: o previsto tambem falta receber
    END IF;
    v_out := v_out || jsonb_build_object(r.id::text, jsonb_build_object(
      'modelo', r.modelo_financeiro,
      'envelope', v_env,
      'docs_operacao', (
        SELECT count(*) FROM public.zoo_operacao_documentos d
         WHERE d.operacao_id = r.id AND d.cancelado IS NOT TRUE),
      'docs_financeiro', (   -- OC-ABRIR-LENTO-01: a uniao das duas origens (o proprio do lancamento e o ligado), pelos indices
        SELECT count(*) FROM (
          SELECT doc.id
            FROM public.zoo_operacao_partes p
            JOIN public.financeiro_lancamento_documentos doc
              ON doc.lancamento_id = p.financeiro_lancamento_id AND doc.cancelado = false
           WHERE p.operacao_id = r.id AND p.cancelada IS NOT TRUE AND p.financeiro_lancamento_id IS NOT NULL
          UNION
          SELECT doc.id
            FROM public.zoo_operacao_partes p
            JOIN public.financeiro_documento_vinculos v ON v.lancamento_id = p.financeiro_lancamento_id
            JOIN public.financeiro_lancamento_documentos doc ON doc.id = v.documento_id AND doc.cancelado = false
           WHERE p.operacao_id = r.id AND p.cancelada IS NOT TRUE AND p.financeiro_lancamento_id IS NOT NULL) u),
      'despesas', v_desp,
      'programados', v_prog
    ));
  END LOOP;
  RETURN v_out;
END;
$function$;

do $g$
begin
  if md5((select prosrc from pg_proc where oid = 'public.oc_conta_corrente_lote(uuid,uuid[])'::regprocedure)) <> 'a650089f384466d24759db29b991deb3' then
    raise exception 'oc_conta_corrente_lote: corpo de destino inesperado';
  end if;
  if has_function_privilege('anon', 'public.oc_conta_corrente_lote(uuid,uuid[])', 'execute')
     or not has_function_privilege('authenticated', 'public.oc_conta_corrente_lote(uuid,uuid[])', 'execute') then
    raise exception 'oc_conta_corrente_lote: ACL inesperada';
  end if;
end $g$;
