-- OC-DOC-VENDA-01 (ajuste) — `_oc_documento_nota_repetida` ganha a GUARDA DE CLIENTE propria (`tenant_ok`, 42501). Ela recebe o
-- cliente e roda como dono; mesmo sem EXECUTE para anon e authenticated (so' as funcoes do documento a chamam, e todas ja' guardam
-- o cliente), a regra do repo e' que nenhuma porta com parametro de cliente fique sem guarda (o detector
-- `guardaDeClienteNasMigrations` a apontava). Para quem chama hoje nada muda: a checagem e' a mesma que elas ja' fizeram. Mesmo corpo.
CREATE OR REPLACE FUNCTION public._oc_documento_nota_repetida(p_cliente_id uuid, p_chave text, p_ignorar uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object('documento_id', d.id, 'operacao_id', o.id, 'tipo_operacao', o.tipo_operacao,
             'rotulo', initcap(coalesce(o.tipo_operacao, 'operação')) || coalesce(' de ' || to_char(o.data_operacao, 'DD/MM/YYYY'), '')
                       || coalesce(' · ' || nullif(btrim(f.nome), ''), ''))
      FROM public.zoo_operacao_documentos d
      JOIN public.zoo_operacoes_comerciais o ON o.id = d.operacao_id
      LEFT JOIN public.financeiro_fornecedores f ON f.id = o.contraparte_id
     WHERE d.cliente_id = p_cliente_id AND d.cancelado = false
       AND length(regexp_replace(coalesce(p_chave, ''), '\D', '', 'g')) = 44
       AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = regexp_replace(p_chave, '\D', '', 'g')
       AND d.id IS DISTINCT FROM p_ignorar
     ORDER BY d.uploaded_em
     LIMIT 1);
END
$function$;

REVOKE ALL ON FUNCTION public._oc_documento_nota_repetida(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

DO $confere$
BEGIN
  IF position('tenant_ok' in pg_get_functiondef('public._oc_documento_nota_repetida(uuid, text, uuid)'::regprocedure)) = 0
     OR has_function_privilege('authenticated', 'public._oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'OC-DOC-VENDA-01 ajuste: a interna sem guarda ou exposta';
  END IF;
END $confere$;
