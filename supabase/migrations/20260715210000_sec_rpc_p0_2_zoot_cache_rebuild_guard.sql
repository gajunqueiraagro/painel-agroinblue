-- SEC-RPC-P0-PROTO-RUNTIME — Migration P0-2: fn_zoot_cache_rebuild (guard + grants)
-- UNICA funcao da frente com alteracao de CORPO. As demais 37 recebem apenas DCL.
-- Estado anterior: sem qualquer verificacao de identidade. Com EXECUTE para PUBLIC/anon,
--   qualquer chamador podia disparar rebuild de cache para um p_cliente_id arbitrario
--   (leitura de public.fazendas + refresh_zoot_cache por fazenda). p_cliente_id e
--   parametro controlavel pelo chamador e nao era validado contra o ator.
-- Guard adicionado ANTES de qualquer leitura operacional e antes do loop:
--   1) auth.uid() nulo  -> 42501 nao_autenticado
--   2) nao-admin e p_cliente_id fora de get_user_cliente_ids(uid) -> 42501 sem_permissao
--   O guard depende de public.is_admin_agroinblue e public.get_user_cliente_ids; ambas
--   sao resolvidas como postgres (owner) por esta funcao ser SECURITY DEFINER, logo
--   independem dos grants externos aplicados em P0-3.
-- PRESERVADOS byte a byte: assinatura, RETURNS void, LANGUAGE plpgsql, SECURITY DEFINER,
--   SET search_path, owner, o loop sobre public.fazendas e a chamada
--   PERFORM public.refresh_zoot_cache(v_fazenda.id, p_ano) -> overload (uuid, integer).
--   refresh_zoot_cache e seus overloads NAO sao tocados nesta frente.
-- CREATE OR REPLACE preserva owner e ACL vigente; por isso o revoke/grant e explicito.
-- Grants: revoke de PUBLIC/anon/authenticated/service_role e grant so a authenticated
--   (estado final explicito e idempotente, independente do ACL anterior).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_zoot_cache_rebuild(p_cliente_id uuid, p_ano integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_fazenda record;
    v_user_id uuid;
  BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'nao_autenticado'
        USING ERRCODE = '42501';
    END IF;

    IF NOT (
      public.is_admin_agroinblue(v_user_id)
      OR p_cliente_id IN (
        SELECT public.get_user_cliente_ids(v_user_id)
      )
    ) THEN
      RAISE EXCEPTION 'sem_permissao'
        USING ERRCODE = '42501';
    END IF;

    FOR v_fazenda IN
      SELECT id FROM public.fazendas WHERE cliente_id = p_cliente_id
    LOOP
      PERFORM public.refresh_zoot_cache(v_fazenda.id, p_ano);
    END LOOP;
  END;
  $function$;

REVOKE EXECUTE ON FUNCTION public.fn_zoot_cache_rebuild(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_cache_rebuild(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_cache_rebuild(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_cache_rebuild(uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_zoot_cache_rebuild(uuid, integer) TO authenticated;

COMMIT;
