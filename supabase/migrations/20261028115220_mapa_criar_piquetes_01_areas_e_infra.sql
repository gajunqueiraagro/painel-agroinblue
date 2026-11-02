-- MAPA-CRIAR-PIQUETES-01 · 115220 (fatia 2a, Gabriel 02/11 08:20/08:27 — P1 benfeitoria "Praça de alimentação", P2 estrada "Corredor",
-- P3 gravar junto): a `fn_piquetes_criar` ganha `p_areas` ([{nome, tipo: benfeitoria|estrada, geojson}]) e `p_infra` ([{tipo, nome, ponto}])
-- e grava, no MESMO gesto e na mesma subtransação da prévia, as áreas internas pelo escritor e pela classificação de sempre
-- (`fn_geometria_gravar` + `fn_mapa_geometria_classificar`; a ligação ao pasto é pela posição, a regra da área cercada) e o cocho pelo
-- gravador do Code 6 (`fn_infra_salvar`, ligado ao pai — a unidade do mapa). O resto do corpo é o da 115210, inalterado.
-- A assinatura muda (2 parâmetros a mais, com padrão): a de 5 parâmetros sai antes (senão a chamada por nome fica ambígua no PostgREST).

SET LOCAL lock_timeout = '2s';

DROP FUNCTION public.fn_piquetes_criar(uuid, jsonb, date, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.fn_piquetes_criar(p_pasto_pai uuid, p_piquetes jsonb, p_mes date DEFAULT NULL, p_contorno jsonb DEFAULT NULL,
                                                   p_simular boolean DEFAULT true, p_areas jsonb DEFAULT '[]'::jsonb, p_infra jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pai        public.pastos;
  v_grupo    public.pasto_grupos;
  v_contorno public.fazenda_geometrias;
  v_criou_contorno boolean := false;
  e          jsonb;
  v_nome     text;
  v_nomes    text[] := '{}';
  v_pasto    uuid;
  v_area     numeric;
  v_soma     numeric := 0;
  v_itens    jsonb := '[]'::jsonb;
  v_r        jsonb;
  v_ids      uuid[] := '{}';
  v_pastos   uuid[] := '{}';
  v_gestos   jsonb := '[]'::jsonb;
  v_concluir jsonb;
  v_ligar    jsonb;
  v_res      jsonb;
  v_motivo   text;
  v_area_contorno numeric;
  v_areas    jsonb := '[]'::jsonb;
  v_infra    jsonb := '[]'::jsonb;
  v_id_area  uuid;
BEGIN
  SELECT * INTO pai FROM public.pastos WHERE id = p_pasto_pai;
  IF pai.id IS NULL OR NOT coalesce(public.tenant_ok(pai.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF jsonb_typeof(coalesce(p_piquetes, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_piquetes) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Faça pelo menos 2 divisões em %s. Nada foi gravado.', pai.nome);
  END IF;
  IF jsonb_array_length(p_piquetes) > 49 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'No máximo 49 divisões de uma vez. Nada foi gravado.';
  END IF;

  SELECT * INTO v_grupo FROM public.pasto_grupos WHERE pasto_origem_id = pai.id;
  SELECT * INTO v_contorno FROM public.fazenda_geometrias WHERE pasto_id = pai.id;
  IF v_contorno.id IS NULL AND p_contorno IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('O pasto %s não tem polígono: o contorno (a união das divisões) vai junto. Nada foi gravado.', pai.nome);
  END IF;

  -- cada divisão: nome (único no gesto), forma, e o vínculo pedido
  FOR e IN SELECT x FROM jsonb_array_elements(p_piquetes) x LOOP
    v_nome := btrim(coalesce(e->>'nome', ''));
    IF v_nome = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Uma das divisões não tem nome. Nada foi gravado.';
    END IF;
    IF lower(v_nome) = ANY (v_nomes) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Duas divisões se chamam "%s": renomeie uma. Nada foi gravado.', v_nome);
    END IF;
    v_nomes := v_nomes || lower(v_nome);
    v_area := public._fn_area_geodesica_ha(e->'geojson');
    IF v_area IS NULL OR v_area <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('A divisão "%s" não tem área. Nada foi gravado.', v_nome);
    END IF;
    v_pasto := nullif(e->>'pasto_id', '')::uuid;
    IF v_grupo.id IS NULL AND v_pasto IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('%s ainda não tem divisões no cadastro: "%s" nasce como pasto novo (ligar a pasto existente é só num grupo que já existe). Nada foi gravado.', pai.nome, v_nome);
    END IF;
    IF v_grupo.id IS NOT NULL AND v_pasto IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('%s já tem as divisões no cadastro: ligue "%s" a um pasto do grupo (divisão nova num grupo que já existe ainda não grava). Nada foi gravado.', pai.nome, v_nome);
    END IF;
    v_soma := v_soma + v_area;
    v_itens := v_itens || jsonb_build_object('nome', v_nome, 'area_ha', v_area, 'liga', CASE WHEN v_pasto IS NULL THEN 'novo' ELSE 'existente' END,
      'pasto_id', v_pasto);
  END LOOP;

  -- 115220 (fatia 2a, P1–P3): as áreas internas (praça = benfeitoria, corredor = estrada) e a infraestrutura (o cocho), no mesmo gesto
  IF jsonb_typeof(coalesce(p_areas, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_infra, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A praça, o corredor ou o cocho vieram fora do formato. Nada foi gravado.';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) x LOOP
    IF btrim(coalesce(e->>'nome', '')) = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Uma das áreas internas (praça ou corredor) não tem nome. Nada foi gravado.';
    END IF;
    IF coalesce(e->>'tipo', '') NOT IN ('benfeitoria', 'estrada') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('A área "%s" precisa ser benfeitoria (praça) ou estrada (corredor). Nada foi gravado.', btrim(e->>'nome'));
    END IF;
    IF coalesce(public._fn_area_geodesica_ha(e->'geojson'), 0) <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('A área "%s" não tem área. Nada foi gravado.', btrim(e->>'nome'));
    END IF;
  END LOOP;

  v_motivo := format('criar piquetes de %s', pai.nome);
  BEGIN
    -- 1) o contorno: o do pai fica; sem ele, a união das divisões ligada ao pai
    IF v_contorno.id IS NULL THEN
      v_r := public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'desenhar', 'motivo', v_motivo,
               'criar', jsonb_build_array(jsonb_build_object('nome_original', pai.nome, 'geojson', p_contorno, 'pasto_id', pai.id))), false);
      v_gestos := v_gestos || to_jsonb(v_r->>'gesto_id');
      SELECT * INTO v_contorno FROM public.fazenda_geometrias WHERE pasto_id = pai.id;
      v_criou_contorno := true;
    END IF;
    v_area_contorno := public._fn_area_geodesica_ha(v_contorno.geojson);

    -- 2) as divisões, cada uma um polígono próprio (sem classificação)
    FOR e IN SELECT x FROM jsonb_array_elements(p_piquetes) x LOOP
      v_r := public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'desenhar', 'motivo', v_motivo,
               'criar', jsonb_build_array(jsonb_build_object('nome_original', btrim(e->>'nome'), 'geojson', e->'geojson'))), false);
      v_gestos := v_gestos || to_jsonb(v_r->>'gesto_id');
      v_ids := v_ids || (v_r->'poligonos'->0->>'id')::uuid;
      v_pastos := v_pastos || nullif(e->>'pasto_id', '')::uuid;
    END LOOP;

    -- 2b) as áreas internas (pelo escritor e pela classificação de sempre) e a infraestrutura (pelo gravador do Code 6, ligada ao pai)
    FOR e IN SELECT x FROM jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) x LOOP
      v_r := public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'desenhar', 'motivo', v_motivo,
               'criar', jsonb_build_array(jsonb_build_object('nome_original', btrim(e->>'nome'), 'geojson', e->'geojson'))), false);
      v_gestos := v_gestos || to_jsonb(v_r->>'gesto_id');
      v_id_area := (v_r->'poligonos'->0->>'id')::uuid;
      PERFORM public.fn_mapa_geometria_classificar(v_id_area, e->>'tipo', NULL, v_motivo, false);
      v_areas := v_areas || jsonb_build_object('id', v_id_area, 'nome', btrim(e->>'nome'), 'tipo', e->>'tipo',
                                               'area_ha', public._fn_area_geodesica_ha(e->'geojson'));
    END LOOP;
    FOR e IN SELECT x FROM jsonb_array_elements(coalesce(p_infra, '[]'::jsonb)) x LOOP
      v_r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', pai.fazenda_id, 'tipo', e->>'tipo', 'nome', e->>'nome', 'pasto_id', pai.id,
               'geometria', jsonb_build_object('type', 'Point', 'coordinates', e->'ponto')), false, v_motivo);
      v_infra := v_infra || jsonb_build_object('id', v_r->>'id', 'tipo', e->>'tipo', 'nome', e->>'nome');
    END LOOP;

    -- 3) o cadastro
    IF v_grupo.id IS NULL THEN
      v_concluir := public.fn_piquetes_concluir(pai.id, v_ids, p_mes, p_simular);
    ELSE
      v_ligar := public.fn_piquetes_ligar(v_grupo.id,
        (SELECT jsonb_agg(jsonb_build_object('geometria_id', v_ids[k], 'pasto_id', v_pastos[k]) ORDER BY k) FROM generate_series(1, cardinality(v_ids)) k),
        p_simular);
    END IF;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular,
      'caso', CASE WHEN v_grupo.id IS NULL THEN 'novo' ELSE 'grupo_existente' END,
      'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome),
      'grupo', CASE WHEN v_grupo.id IS NOT NULL THEN jsonb_build_object('id', v_grupo.id, 'nome', v_grupo.nome) END,
      'contorno', jsonb_build_object('id', v_contorno.id, 'criado', v_criou_contorno, 'area_ha', v_area_contorno),
      'piquetes', v_itens, 'soma_ha', v_soma, 'dif_contorno_ha', round(v_soma - coalesce(v_area_contorno, 0), 2),
      'poligonos', to_jsonb(v_ids), 'gestos', v_gestos, 'concluir', v_concluir, 'ligar', v_ligar, 'areas', v_areas, 'infra', v_infra);
    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZG002', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZG002' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_piquetes_criar(uuid, jsonb, date, jsonb, boolean, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_criar(uuid, jsonb, date, jsonb, boolean, jsonb, jsonb) TO authenticated;
