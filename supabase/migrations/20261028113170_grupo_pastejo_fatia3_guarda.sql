-- FECH-ROTACAO-01 · FATIA 3 · a guarda de cliente no corpo da fn_fechamento_pasto_salvar_com_alocacao · Code 1
-- A 20261028113160 criou a função SECURITY DEFINER que recebe só o id do card e deixou a guarda para as duas que ela chama
-- (fn_fechamento_pasto_salvar e fn_fechamento_alocacoes_salvar, que têm `_fn_exigir_tenant_das_linhas`). A regra da casa
-- (SEG-AGRI-TENANT-01, guardaDeClienteNasMigrations.test.ts) quer a guarda NO PRÓPRIO corpo — e migration aplicada não se reescreve:
-- esta redefine a função com a guarda pelo cliente da linha (molde 01A) como primeiro passo. O resto do corpo é o da 113160.
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(p_fechamento_id uuid, p_campos jsonb, p_itens jsonb, p_pasto_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_card     jsonb;
  v_aloc     jsonb;
  v_tipo     text;
BEGIN
  /* 0) a guarda pelo cliente do card (SEG-AGRI-TENANT-01), antes de qualquer coisa */
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(
    SELECT f.cliente_id FROM public.fechamento_pastos fp JOIN public.fazendas f ON f.id = fp.fazenda_id WHERE fp.id = p_fechamento_id)]);
  /* 1) o card (campos do mês + itens), com as travas dele (tenant, card fechado, P2, vedar quem recebe) */
  v_card := public.fn_fechamento_pasto_salvar(p_fechamento_id, p_campos, p_itens);
  IF p_pasto_ids IS NULL THEN
    RETURN v_card || jsonb_build_object('alocacao', NULL);
  END IF;
  /* 2) onde o lote do card esteve (lote '' = o card inteiro), com as travas do escritor da alocação */
  SELECT tipo_uso_mes INTO v_tipo FROM public.fechamento_pastos WHERE id = p_fechamento_id;
  IF v_tipo = 'vedado' AND cardinality(ARRAY(SELECT DISTINCT x FROM unnest(p_pasto_ids) x WHERE x IS NOT NULL)) > 1 THEN
    RAISE EXCEPTION 'O pasto está vedado neste mês: o lote dele não pode estar em outros pastos. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  v_aloc := public.fn_fechamento_alocacoes_salvar(p_fechamento_id, '', p_pasto_ids);
  RETURN v_card || jsonb_build_object('alocacao', v_aloc);
END $function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(uuid, jsonb, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(uuid, jsonb, jsonb, uuid[]) TO authenticated;
