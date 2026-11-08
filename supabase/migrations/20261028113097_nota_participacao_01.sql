-- NOTA-ATUALIZA-PREVISTO-01 (R3, Gabriel 06/11/2026 17:32: "a Vera paga 70% dessa NF apenas") — a PARTICIPAÇÃO % do cliente numa nota.
-- A nota fica anexada INTEIRA; o lançamento vale participação × nota; a conferência documento × lançamento compara participação × nota
-- (bate, sem acusar diferença). O resto ("parte paga por outro") é só informativo na tela: não vira lançamento, nem DRE, nem caixa.
--
-- O QUE MUDA:
--   A. financeiro_lancamento_documentos.participacao_pct numeric(7,4) NOT NULL DEFAULT 100 (0 < % <= 100). Todo documento de hoje = 100.
--   B. fin_documento_participacao(p_cliente, p_documentos, p_participacao): guarda de acesso igual à do fin_documento_registrar; recusa documento
--      de outro cliente, cancelado ou inexistente (nada é gravado se um falhar). Marca updated_at/updated_by.
--   C. fin_documento_confronto: o valor de cada documento do LANÇAMENTO entra como valor × participação / 100 (o da OC segue igual: não tem a
--      coluna). Com 100% (todo documento de hoje), o resultado é o de antes, byte a byte. Remendo guardado pelo md5 da função publicada.
-- O QUE NÃO MUDA: fin_documento_registrar/editar/cancelar/vincular, a view, o fn_nota_completar (a tela manda p_valor_nota = participação × nota).
-- VOLTA: o remendo inverso no confronto (trocar v_para por v_de abaixo; devolve o md5 70e7c8dbb419f790c7c30779ba4363bc), DROP FUNCTION
--   fin_documento_participacao e DROP COLUMN participacao_pct.

-- ── A ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.financeiro_lancamento_documentos
  ADD COLUMN participacao_pct numeric(7,4) NOT NULL DEFAULT 100
  CONSTRAINT fin_lanc_doc_participacao_faixa CHECK (participacao_pct > 0 AND participacao_pct <= 100);
COMMENT ON COLUMN public.financeiro_lancamento_documentos.participacao_pct IS
  'NOTA-ATUALIZA-PREVISTO-01 — a parte (%) desta nota que o cliente paga. A nota fica inteira; o confronto usa valor_documento × participacao_pct / 100.';

-- ── B ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_documento_participacao(p_cliente uuid, p_documentos uuid[], p_participacao numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_ids uuid[];
  v_n int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: sessao sem usuario' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente USING ERRCODE='42501'; END IF;
  IF p_participacao IS NULL OR p_participacao <= 0 OR p_participacao > 100 THEN
    RAISE EXCEPTION USING MESSAGE = 'A participação vai de 1% a 100%.'; END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(coalesce(p_documentos, '{}'::uuid[])) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'Nenhum documento para a participação.'; END IF;

  UPDATE public.financeiro_lancamento_documentos d
     SET participacao_pct = round(p_participacao, 4), updated_at = now(), updated_by = v_actor
   WHERE d.id = ANY (v_ids) AND d.cliente_id = p_cliente AND d.cancelado IS NOT TRUE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION USING MESSAGE = format('%s de %s documentos não são deste cliente ou estão cancelados: nada foi gravado.',
      array_length(v_ids, 1) - v_n, array_length(v_ids, 1));
  END IF;
  RETURN jsonb_build_object('documentos', v_n, 'participacao', round(p_participacao, 4));
END
$function$;
REVOKE ALL ON FUNCTION public.fin_documento_participacao(uuid, uuid[], numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_participacao(uuid, uuid[], numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_participacao(uuid, uuid[], numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_documento_participacao(uuid, uuid[], numeric) TO service_role;

-- ── C ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $remendo$
DECLARE
  v_def text;
  v_de  constant text := 'SELECT DISTINCT ON (v.documento_id) v.documento_id, v.origem, v.especie, v.valor_documento AS valor, v.numero,';
  v_para constant text := 'SELECT DISTINCT ON (v.documento_id) v.documento_id, v.origem, v.especie, '
    || '/* NOTA-ATUALIZA-PREVISTO-01 — a parte da nota que o cliente paga (documento do lancamento; o da OC = 100) */ '
    || 'CASE WHEN v.valor_documento IS NULL THEN NULL ELSE round(v.valor_documento * coalesce((SELECT x.participacao_pct FROM public.financeiro_lancamento_documentos x '
    || 'WHERE x.id = v.documento_id AND v.origem = ''lancamento''), 100) / 100, 2) END AS valor, v.numero,';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fin_documento_confronto';
  IF md5(v_def) <> '70e7c8dbb419f790c7c30779ba4363bc' THEN
    RAISE EXCEPTION 'NOTA-PARTICIPACAO-01: fin_documento_confronto mudou desde a leitura (md5 %); nada gravado', md5(v_def); END IF;
  IF (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 THEN
    RAISE EXCEPTION 'NOTA-PARTICIPACAO-01: o trecho do remendo não está uma vez só no confronto; nada gravado'; END IF;
  EXECUTE replace(v_def, v_de, v_para);
END
$remendo$;
