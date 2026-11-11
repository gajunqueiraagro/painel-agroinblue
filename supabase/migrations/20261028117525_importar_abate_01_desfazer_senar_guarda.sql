-- IMPORTAR-ABATE-01 · a `fn_oc_abate_reclassificar_senar_desfazer` (117505) ganha a guarda PRÓPRIA do admin (trava SEG-DRE-TENANT-01,
-- `guardaDeClienteNasMigrations.test.ts`: SECURITY DEFINER que recebe só o id da linha leva guarda). Achado em 10/11 ao trazer o arquivo da
-- 117505 para o repositório (onda 0). Não há brecha hoje — `authenticated` e `anon` não têm EXECUTE nela, e a única coisa que ela faz é chamar
-- a `fn_oc_abate_reclassificar_senar`, que já recusa quem não é admin (42501) —, mas a definição tem de fechar por si. Migration aplicada não se
-- reescreve: a correção REDEFINE a função aqui, com o corpo igual e a MESMA guarda da principal no topo.
SET LOCAL lock_timeout = '2s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.fn_oc_abate_reclassificar_senar_desfazer(uuid,text,boolean)'::regprocedure)) <> '2460c905f384bfb63ca243440bfe83f9' THEN
    RAISE EXCEPTION 'IMPORTAR-ABATE-01 (117525): fn_oc_abate_reclassificar_senar_desfazer mudou desde a leitura — nada aplicado';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_oc_abate_reclassificar_senar_desfazer(p_operacao_id uuid, p_motivo text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ev public.zoo_operacao_eventos;
  v_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_agroinblue(auth.uid()) THEN
    RAISE EXCEPTION 'Desfazer o SENAR: so'' o admin AgroinBlue' USING ERRCODE = '42501'; END IF;
  -- a ultima reclassificacao da OC que ainda nao foi desfeita
  SELECT * INTO v_ev FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = p_operacao_id AND e.acao = 'reclassificar_senar' AND NOT (e.detalhes ? 'desfaz')
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos d
                      WHERE d.operacao_id = p_operacao_id AND d.acao = 'reclassificar_senar' AND d.detalhes->>'desfaz' = e.id::text)
   ORDER BY e.created_at DESC LIMIT 1;
  IF v_ev.id IS NULL THEN
    RAISE EXCEPTION 'Desfazer o SENAR: esta OC nao tem reclassificacao a desfazer' USING ERRCODE = 'P0001'; END IF;
  v_res := public.fn_oc_abate_reclassificar_senar(p_operacao_id,
             (SELECT jsonb_agg(jsonb_build_object('ordem', x->'ordem', 'senar', x->'senar')) FROM jsonb_array_elements(v_ev.dados_anteriores->'lotes') x),
             p_motivo, p_simular, v_ev.id);   -- a trilha e' imutavel: o evento NOVO leva a marca 'desfaz'; o antigo fica como esta'
  RETURN v_res || jsonb_build_object('desfaz', v_ev.id);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_oc_abate_reclassificar_senar_desfazer(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
