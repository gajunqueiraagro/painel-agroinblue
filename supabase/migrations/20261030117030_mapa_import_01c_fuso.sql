-- MAPA-IMPORT-01c (c) — FUSO do pasto novo criado pelo import do mapa (PREPARADA na noite de 30/10/2026; NÃO APLICADA, NÃO ENSAIADA).
-- Na 117020 a data de início do pasto novo é `date_trunc('month', current_date)`: `current_date` é a data do BANCO (UTC). No último dia do
-- mês, depois das 21h de Brasília, o banco já está no mês seguinte e o pasto nasceria fora do mês corrente. Troca SÓ essa expressão por
-- `date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)`. O resto do corpo é o que está no banco (lido por
-- pg_get_functiondef em 30/10: md5(prosrc) a1642f4169ab07b518f105a0e6b3ce24 = o corpo da 117020), sem nenhuma outra mudança.
-- Assinatura igual (ACL igual), SECURITY INVOKER, conferência final de anon sem EXECUTE.

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_mapa_fazenda_substituir(p_fazenda_id uuid, p_poligonos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente uuid;
  v_total int := 0;
  v_criados int := 0;
  v_ordem int;
  v_pasto uuid;
  v_nome text;
  v_por_tipo jsonb;
  e record;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = p_fazenda_id;
  IF v_cliente IS NULL OR NOT coalesce(public.tenant_ok(v_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a esta fazenda' USING ERRCODE = '42501';
  END IF;
  IF p_poligonos IS NULL OR jsonb_typeof(p_poligonos) <> 'array' THEN
    RAISE EXCEPTION 'a lista de polígonos não veio' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(p.ordem_exibicao), 0) INTO v_ordem FROM public.pastos p WHERE p.fazenda_id = p_fazenda_id;

  DELETE FROM public.fazenda_geometrias WHERE fazenda_id = p_fazenda_id;

  FOR e IN SELECT x.item FROM jsonb_array_elements(p_poligonos) WITH ORDINALITY AS x(item, ord) ORDER BY x.ord LOOP
    IF e.item->>'tipo' = 'pasto_novo' THEN
      v_nome := btrim(coalesce(e.item->>'nome_original', ''));
      IF v_nome = '' THEN
        RAISE EXCEPTION 'pasto novo sem nome' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.pastos p
                  WHERE p.fazenda_id = p_fazenda_id
                    AND public._fn_normalizar_texto(p.nome) = public._fn_normalizar_texto(v_nome)) THEN
        RAISE EXCEPTION 'Já existe um pasto com o nome "%" nesta fazenda.', v_nome USING ERRCODE = '23505';
      END IF;
      v_ordem := v_ordem + 1;
      INSERT INTO public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, observacoes, ativo, data_inicio, data_fim,
                                 ordem_exibicao)
      VALUES (p_fazenda_id, v_cliente, v_nome, round(nullif(e.item->>'area_ha', '')::numeric, 2), 'recria', NULL, true,
              date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date, NULL, v_ordem)
      RETURNING id INTO v_pasto;
      v_criados := v_criados + 1;
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
      VALUES (p_fazenda_id, v_cliente, 'pasto', v_pasto, v_nome, e.item->'geojson', nullif(e.item->>'cor', ''));
    ELSE
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
      VALUES (p_fazenda_id, v_cliente, e.item->>'tipo', nullif(e.item->>'pasto_id', '')::uuid, e.item->>'nome_original', e.item->'geojson',
              nullif(e.item->>'cor', ''));
    END IF;
    v_total := v_total + 1;
  END LOOP;

  SELECT coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) INTO v_por_tipo
    FROM (SELECT g.tipo, count(*) AS n FROM public.fazenda_geometrias g WHERE g.fazenda_id = p_fazenda_id GROUP BY g.tipo) t;

  RETURN jsonb_build_object('total', v_total, 'por_tipo', v_por_tipo, 'pastos_criados', v_criados);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_mapa_fazenda_substituir(uuid, jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_mapa_fazenda_substituir(uuid, jsonb)', 'EXECUTE')
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_mapa_fazenda_substituir(uuid, jsonb)'::regprocedure)
     OR (SELECT p.prosrc NOT LIKE '%America/Sao_Paulo%' FROM pg_proc p WHERE p.oid = 'public.fn_mapa_fazenda_substituir(uuid, jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'MAPA-IMPORT-01c: a função não ficou como devia (ACL, SECURITY ou fuso). Nada foi gravado.';
  END IF;
  RAISE NOTICE 'MAPA-IMPORT-01c OK: pasto novo nasce no mês de Brasília; INVOKER; anon sem EXECUTE.';
END $$;
