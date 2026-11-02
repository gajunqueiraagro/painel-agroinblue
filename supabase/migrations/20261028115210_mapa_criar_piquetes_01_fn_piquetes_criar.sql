-- MAPA-CRIAR-PIQUETES-01 · 115210 (Gabriel 01/11/2026: D2 GO para preparar; D1 = (b) às 18:00; caso do P6 da Pureza às 18:28)
-- `fn_piquetes_criar(pai, piquetes, mês, contorno, simular)` — o gesto "Criar piquetes" do mapa num lugar só, sem segunda fonte:
--   * o CONTORNO é o polígono do PAI e FICA (D1 b): se o pai não tem polígono, grava o `p_contorno` (a união das divisões, feita na tela)
--     ligado a ele, no mesmo gesto, pelo escritor `fn_geometria_gravar` (gesto desenhar);
--   * cada divisão vira um polígono próprio pelo mesmo escritor (furos incluídos: a área é a do banco, `_fn_area_geodesica_ha`, sem o furo);
--   * pai SEM grupo (caso novo): as divisões vão para a `fn_piquetes_concluir` do Code 4 (pastos novos, grupo com o elo `pasto_origem_id`,
--     pai encerrado) — nada disso se repete aqui;
--   * pai que JÁ originou um grupo (o P6: grupo com 6A e 6B sem polígono): cada divisão LIGA a um pasto do grupo (`pasto_id`) pela
--     `fn_piquetes_ligar` do Code 4 (117090; quem é membro, quem já tem desenho e o que fica sem desenho são regra DELA) — o pasto e o
--     histórico dele não mudam. Divisão NOVA num grupo que já existe é recusada (frente própria, se for o caso).
-- Simular = o gesto inteiro numa subtransação desfeita no fim (ZG002), com a prévia da `fn_piquetes_concluir` ou da `fn_piquetes_ligar` dentro.
-- `p_piquetes`: [{ "nome": text, "geojson": Polygon, "pasto_id": uuid | null }].

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_piquetes_criar(p_pasto_pai uuid, p_piquetes jsonb, p_mes date DEFAULT NULL, p_contorno jsonb DEFAULT NULL,
                                                   p_simular boolean DEFAULT true)
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
      'poligonos', to_jsonb(v_ids), 'gestos', v_gestos, 'concluir', v_concluir, 'ligar', v_ligar);
    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZG002', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZG002' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_piquetes_criar(uuid, jsonb, date, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_criar(uuid, jsonb, date, jsonb, boolean) TO authenticated;
