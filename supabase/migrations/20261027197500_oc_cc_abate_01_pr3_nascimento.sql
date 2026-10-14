-- OC-CC-ABATE-01 PR 3 (Gabriel, 14/10/2026) — O ABATE NASCE EM CONTA CORRENTE.
--   O UNICO dono do modelo ao nascer, `_oc_modelo_ao_nascer(tipo, boitel)`, passa a mandar venda, compra E ABATE sem boitel para
--   'conta_corrente'; boitel e tipo desconhecido seguem 'titulo'. Quem grava e' `oc_salvar_rascunho` (intocado: ele ja' chama o dono
--   com `p_boitel` false), com o evento 'definir_modelo_financeiro'.
--   A MIGRACAO DOS ABATES EM TITULO NAO E' ESTE ARQUIVO: e' por RPC (`oc_migrar_para_conta_corrente`), uma OC por transacao.
-- SO' CREATE OR REPLACE DE FUNCAO: nenhum DDL em tabela, nenhum dado. ACL, IMMUTABLE e search_path preservados.
-- CORPO POR PATCH GUARDADO POR md5:
--   _oc_modelo_ao_nascer   c0e1056252382f4abbc5edf8b5604b4f -> d4bbf3204ddc9f8e8911e2d2c1578e11
--   oc_salvar_rascunho     51489be17b046424363d499e55dcd314 (conferido, NAO se toca)
-- Reexecutar sobre o corpo ja' trocado nao faz nada.
DO $m$
DECLARE
  c_origem   constant text := 'c0e1056252382f4abbc5edf8b5604b4f';
  c_destino  constant text := 'd4bbf3204ddc9f8e8911e2d2c1578e11';
  c_rascunho constant text := '51489be17b046424363d499e55dcd314';
  c_corpo    constant text := E'\n  -- O UNICO dono de "em que modelo financeiro esta OC nasce": venda, compra e abate em conta corrente; boitel em titulo (OC-CC-ABATE-01 PR 3).\n  select case when p_tipo in (''venda'', ''compra'', ''abate'') and coalesce(p_boitel, false) = false then ''conta_corrente'' else ''titulo'' end\n';
  v_oid oid := 'public._oc_modelo_ao_nascer(text, boolean)'::regprocedure;
  v_md5 text; v_acl text; v_vol "char"; v_sec boolean; v_cfg text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.oc_salvar_rascunho(uuid, uuid, integer, jsonb)'::regprocedure)
     IS DISTINCT FROM c_rascunho THEN
    RAISE EXCEPTION 'oc_salvar_rascunho fora do md5 esperado (%): conferir antes de aplicar', c_rascunho; END IF;

  SELECT md5(prosrc), proacl::text, provolatile, prosecdef, proconfig::text INTO v_md5, v_acl, v_vol, v_sec, v_cfg
    FROM pg_proc WHERE oid = v_oid;
  IF v_md5 = c_destino THEN
    RAISE NOTICE '_oc_modelo_ao_nascer ja esta no destino (%): nada a fazer', c_destino; RETURN; END IF;
  IF v_md5 IS DISTINCT FROM c_origem THEN
    RAISE EXCEPTION '_oc_modelo_ao_nascer fora da origem: % (esperado %)', v_md5, c_origem; END IF;
  IF md5(c_corpo) IS DISTINCT FROM c_destino THEN
    RAISE EXCEPTION 'o corpo novo nao bate com o destino declarado: %', md5(c_corpo); END IF;

  EXECUTE format($f$CREATE OR REPLACE FUNCTION public._oc_modelo_ao_nascer(p_tipo text, p_boitel boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, c_corpo);

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM c_destino
     OR (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT provolatile FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_vol
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_sec
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION '_oc_modelo_ao_nascer: destino, ACL, volatilidade, SECURITY ou search_path nao conferem depois da troca'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.oc_salvar_rascunho(uuid, uuid, integer, jsonb)'::regprocedure)
     IS DISTINCT FROM c_rascunho THEN
    RAISE EXCEPTION 'oc_salvar_rascunho mudou durante a migration'; END IF;
END $m$;
