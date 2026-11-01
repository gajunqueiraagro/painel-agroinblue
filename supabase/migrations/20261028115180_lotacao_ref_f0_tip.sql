-- LOTACAO-REF-01 · F0 TIP (Gabriel 01/11/2026, D4: a TIP como fatia própria e ANTES da régua) — uma fonte só, no banco, para as
-- atividades da pecuária, e a TIP dentro dela. Antes, quatro funções tinham a lista escrita à mão; um pasto 'tip' sumiria em silêncio
-- da área pecuária, do DRE e do P2.
--   _fn_tipos_uso_com_rebanho() = cria, recria, engorda, tip            (o mês exige rebanho: o P2 se aplica)
--   _fn_tipos_uso_pecuaria()    = com_rebanho + vedado, reforma_pecuaria (a ÁREA pecuária: DRE, snapshot de área, natureza patrimonial)
-- As quatro funções passam a ler daqui (patch do corpo VIVO, guardado por md5; o resto do corpo não muda):
--   _fn_status_pilares_fechamento  IN ('cria','recria','engorda')                        → = ANY (_fn_tipos_uso_com_rebanho())
--   fn_dre_pecuaria                in ('cria',…,'reforma_pecuaria')                       → = ANY (_fn_tipos_uso_pecuaria())
--   fn_gerar_area_de_snapshot      IN ('cria',…,'reforma_pecuaria')                       → = ANY (_fn_tipos_uso_pecuaria())
--                                  NOT IN ('cria',…,'reforma_pecuaria', agricultura…)     → <> ALL (_fn_tipos_uso_pecuaria() || ARRAY[agricultura…])
--   fn_natureza_patrimonial_fazenda IN ('cria',…,'reforma_pecuaria')                      → = ANY (_fn_tipos_uso_pecuaria())
-- Enquanto nenhum pasto for 'tip', nenhuma conta muda (a única diferença das listas é 'tip'; NOT IN e <> ALL tratam o nulo igual).
-- O front (tiposUso.ts com teste de paridade, seletor, cores, as 5 listas escritas à mão) é a fatia seguinte.

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_tipos_uso_com_rebanho()
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog
AS $$ SELECT ARRAY['cria', 'recria', 'engorda', 'tip']::text[] $$;

CREATE OR REPLACE FUNCTION public._fn_tipos_uso_pecuaria()
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public
AS $$ SELECT public._fn_tipos_uso_com_rebanho() || ARRAY['vedado', 'reforma_pecuaria']::text[] $$;

REVOKE EXECUTE ON FUNCTION public._fn_tipos_uso_com_rebanho() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._fn_tipos_uso_pecuaria() FROM PUBLIC, anon;
-- constantes puras (sem dado): quem lê pela tela com SECURITY INVOKER também precisa
GRANT EXECUTE ON FUNCTION public._fn_tipos_uso_com_rebanho() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._fn_tipos_uso_pecuaria() TO authenticated, service_role;

DO $patch$
DECLARE
  d text; n int;
  c_lista5 constant text := $l$'cria','recria','engorda','vedado','reforma_pecuaria'$l$;
BEGIN
  -- 1. status dos pilares (o P2 se aplica = há pasto com rebanho)
  d := pg_get_functiondef('public._fn_status_pilares_fechamento(uuid,text)'::regprocedure);
  IF md5(d) <> '114bcb56fa0167ac4d062e2eb8c1aaf0' THEN RAISE EXCEPTION 'F0 TIP: _fn_status_pilares_fechamento mudou desde a prévia'; END IF;
  n := (length(d) - length(replace(d, $x$IN ('cria','recria','engorda');$x$, ''))) / length($x$IN ('cria','recria','engorda');$x$);
  IF n <> 1 THEN RAISE EXCEPTION 'F0 TIP: status dos pilares, esperava 1 lista, achou %', n; END IF;
  EXECUTE replace(d, $x$IN ('cria','recria','engorda');$x$, $x$= ANY (public._fn_tipos_uso_com_rebanho());$x$);

  -- 2. DRE pecuário (área pecuária do rateio)
  d := pg_get_functiondef('public.fn_dre_pecuaria(uuid,text,text,text)'::regprocedure);
  IF md5(d) <> '7ce654ca27a3ed4c41ee58ecb5775f25' THEN RAISE EXCEPTION 'F0 TIP: fn_dre_pecuaria mudou desde a prévia'; END IF;
  n := (length(d) - length(replace(d, 'in (' || c_lista5 || ')', ''))) / length('in (' || c_lista5 || ')');
  IF n <> 1 THEN RAISE EXCEPTION 'F0 TIP: DRE, esperava 1 lista, achou %', n; END IF;
  EXECUTE replace(d, 'in (' || c_lista5 || ')', '= ANY (public._fn_tipos_uso_pecuaria())');

  -- 3. snapshot de área (pecuária e o "resto")
  d := pg_get_functiondef('public.fn_gerar_area_de_snapshot(uuid)'::regprocedure);
  IF md5(d) <> 'd2bf6566db584932a66eda3a4193179d' THEN RAISE EXCEPTION 'F0 TIP: fn_gerar_area_de_snapshot mudou desde a prévia'; END IF;
  n := (length(d) - length(replace(d, 'IN (' || c_lista5 || ')), 0)', ''))) / length('IN (' || c_lista5 || ')), 0)');
  IF n <> 1 THEN RAISE EXCEPTION 'F0 TIP: snapshot (pecuária), esperava 1 lista, achou %', n; END IF;
  d := replace(d, 'IN (' || c_lista5 || ')), 0)', '= ANY (public._fn_tipos_uso_pecuaria())), 0)');
  n := (length(d) - length(replace(d, E'NOT IN (\n          ' || c_lista5 || E',\n          ''agricultura'',''eucalipto'',''reserva'',''app'',''benfeitorias'')', '')))
       / length(E'NOT IN (\n          ' || c_lista5 || E',\n          ''agricultura'',''eucalipto'',''reserva'',''app'',''benfeitorias'')');
  IF n <> 1 THEN RAISE EXCEPTION 'F0 TIP: snapshot (resto), esperava 1 lista, achou %', n; END IF;
  d := replace(d, E'NOT IN (\n          ' || c_lista5 || E',\n          ''agricultura'',''eucalipto'',''reserva'',''app'',''benfeitorias'')',
               E'<> ALL (public._fn_tipos_uso_pecuaria() || ARRAY[\n          ''agricultura'',''eucalipto'',''reserva'',''app'',''benfeitorias''])');
  EXECUTE d;

  -- 4. natureza patrimonial
  d := pg_get_functiondef('public.fn_natureza_patrimonial_fazenda(uuid)'::regprocedure);
  IF md5(d) <> '91330790e0c788d3be35b0984fd732f6' THEN RAISE EXCEPTION 'F0 TIP: fn_natureza_patrimonial_fazenda mudou desde a prévia'; END IF;
  n := (length(d) - length(replace(d, 'IN (' || c_lista5 || ')', ''))) / length('IN (' || c_lista5 || ')');
  IF n <> 1 THEN RAISE EXCEPTION 'F0 TIP: natureza, esperava 1 lista, achou %', n; END IF;
  EXECUTE replace(d, 'IN (' || c_lista5 || ')', '= ANY (public._fn_tipos_uso_pecuaria())');
END $patch$;
