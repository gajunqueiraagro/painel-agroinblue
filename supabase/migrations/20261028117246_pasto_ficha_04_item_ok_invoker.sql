-- PASTO-FICHA-01 · a interna `_fn_pasto_ficha_item_ok` passa a SECURITY INVOKER (trava SEG-DRE-TENANT-01, `guardaDeClienteNasMigrations.test.ts`).
-- Ela nasceu SECURITY DEFINER na 117230 com parâmetro de cliente e sem `tenant_ok`: a trava a reprova (a 117230 entrou no repositório só em
-- 08/11). Não há brecha hoje — `authenticated` não tem EXECUTE nela e a única chamadora é a `_fn_pasto_ficha_aplicar` (SECURITY DEFINER, que
-- roda dentro de escritores que conferem o `tenant_ok`) —, mas a definição tem de fechar por si: INVOKER, chamada de dentro da DEFINER,
-- roda com o dono dela (o mesmo resultado de hoje). Migration aplicada não se reescreve: a correção REDEFINE a função aqui.
SET LOCAL lock_timeout = '2s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public._fn_pasto_ficha_item_ok(uuid,text,uuid)'::regprocedure)) <> 'a9edfdfed15652ccf0c0d5756135af23' THEN
    RAISE EXCEPTION 'PASTO-FICHA-01 (117246): _fn_pasto_ficha_item_ok mudou desde a leitura — nada aplicado';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public._fn_pasto_ficha_item_ok(p_item uuid, p_lista text, p_cliente uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select p_item is null or exists (select 1 from public.catalogo_itens i
                                    where i.id = p_item and i.lista = p_lista and i.ativo and (i.cliente_id is null or i.cliente_id = p_cliente))
$function$;

REVOKE ALL ON FUNCTION public._fn_pasto_ficha_item_ok(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
