-- MAPA-PIQUETES-03 (caso P6, Gabriel 01/11/2026 18:28) — LIGAR polígonos novos a divisões que JÁ existem.
-- O P6 da Pureza já virou o grupo P6 (6A, 6B, desde 11/2026) sem o desenho das divisões. A `fn_piquetes_concluir` não serve aqui: ela cria
-- os pastos e recusa o pai encerrado, o grupo existente e o nome já usado. Esta função é a irmã que só LIGA:
--  - recebe o grupo que nasceu de um pasto (`pasto_grupos.pasto_origem_id`, 20261028117080) e pares {geometria_id, pasto_id};
--  - cada pasto é membro ATIVO do grupo e ainda sem polígono; cada polígono é da mesma fazenda, sem classificação ('outra'), sem pasto e com área;
--  - a ligação é pelo escritor de sempre (`fn_mapa_geometria_classificar`, com a trilha dele);
--  - NÃO cria pasto, NÃO muda área oficial, vigência, grupo nem fechamento: a prévia mostra a área do desenho × a oficial só para conferir;
--  - simular primeiro (`p_simular` = true por padrão); uma linha no `audit_log` (acao 'piquetes_ligar') com os pares gravados.
CREATE OR REPLACE FUNCTION public.fn_piquetes_ligar(p_grupo uuid, p_ligacoes jsonb, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gr        public.pasto_grupos;
  pai       public.pastos;
  p         public.pastos;
  g         public.fazenda_geometrias;
  l         jsonb;
  v_geo     uuid;
  v_pasto   uuid;
  v_geos    uuid[] := '{}';
  v_pastos  uuid[] := '{}';
  v_area    numeric;
  v_oficial numeric;
  v_itens   jsonb := '[]'::jsonb;
  v_frase   text;
  v_mes     text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
  v_motivo  text;
  v_log     uuid;
  v_faltam  text;
BEGIN
  SELECT * INTO gr FROM public.pasto_grupos WHERE id = p_grupo;
  IF gr.id IS NULL OR NOT coalesce(public.tenant_ok(gr.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  SELECT * INTO pai FROM public.pastos WHERE id = gr.pasto_origem_id;
  IF pai.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('O grupo %s não nasceu de um pasto: ligue os polígonos pasto a pasto. Nada foi gravado.', gr.nome);
  END IF;
  IF p_ligacoes IS NULL OR jsonb_typeof(p_ligacoes) <> 'array' OR jsonb_array_length(p_ligacoes) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Escolha a divisão de %s de cada polígono. Nada foi gravado.', pai.nome);
  END IF;

  FOR l IN SELECT x FROM jsonb_array_elements(p_ligacoes) x LOOP
    v_geo := CASE WHEN jsonb_typeof(l->'geometria_id') = 'string' AND (l->>'geometria_id') ~* '^[0-9a-f-]{36}$' THEN (l->>'geometria_id')::uuid END;
    v_pasto := CASE WHEN jsonb_typeof(l->'pasto_id') = 'string' AND (l->>'pasto_id') ~* '^[0-9a-f-]{36}$' THEN (l->>'pasto_id')::uuid END;
    IF v_geo IS NULL OR v_pasto IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Escolha a divisão de %s de cada polígono. Nada foi gravado.', pai.nome);
    END IF;

    SELECT * INTO p FROM public.pastos WHERE id = v_pasto;
    IF p.id IS NULL OR p.grupo_id IS DISTINCT FROM gr.id OR p.id = pai.id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('Um dos pastos escolhidos não é divisão de %s. Atualize a tela. Nada foi gravado.', pai.nome);
    END IF;
    IF NOT coalesce(p.ativo, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('A divisão %s está inativa. Nada foi gravado.', p.nome);
    END IF;
    IF v_pasto = ANY (v_pastos) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('A divisão %s foi escolhida para dois polígonos. Nada foi gravado.', p.nome);
    END IF;
    SELECT format('A divisão %s já tem o polígono "%s". Desvincule lá antes. Nada foi gravado.', p.nome, o.nome_original) INTO v_frase
      FROM public.fazenda_geometrias o WHERE o.pasto_id = p.id LIMIT 1;
    IF v_frase IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
    END IF;

    SELECT * INTO g FROM public.fazenda_geometrias WHERE id = v_geo;
    IF g.id IS NULL OR g.cliente_id IS DISTINCT FROM gr.cliente_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Um dos polígonos não existe mais. Atualize a tela. Nada foi gravado.';
    END IF;
    IF g.fazenda_id IS DISTINCT FROM pai.fazenda_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O polígono "%s" é de outra fazenda: divisão e pasto têm de ser da mesma. Nada foi gravado.', g.nome_original);
    END IF;
    IF v_geo = ANY (v_geos) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O polígono "%s" foi escolhido duas vezes. Nada foi gravado.', g.nome_original);
    END IF;
    IF g.pasto_id IS NOT NULL THEN
      SELECT format('O polígono "%s" já está ligado ao pasto %s. Desvincule lá antes. Nada foi gravado.', g.nome_original, o.nome)
        INTO v_frase FROM public.pastos o WHERE o.id = g.pasto_id;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
    END IF;
    IF g.tipo IS DISTINCT FROM 'outra' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O polígono "%s" está marcado como %s: só polígono sem classificação vira divisão. Nada foi gravado.',
                         g.nome_original, public._fn_mapa_tipo_rotulo(g.tipo));
    END IF;
    v_area := public._fn_area_geodesica_ha(g.geojson);
    IF v_area IS NULL OR v_area <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O polígono "%s" não tem área. Nada foi gravado.', g.nome_original);
    END IF;

    v_oficial := public.fn_pasto_area_no_mes(p.id, v_mes);
    v_geos := v_geos || v_geo;
    v_pastos := v_pastos || v_pasto;
    v_itens := v_itens || jsonb_build_object('geometria_id', g.id, 'nome_poligono', g.nome_original, 'pasto_id', p.id, 'pasto', p.nome,
      'area_desenho_ha', round(v_area, 2), 'area_oficial_ha', v_oficial,
      'dif_ha', CASE WHEN v_oficial IS NOT NULL THEN round(v_area - v_oficial, 2) END);
  END LOOP;

  SELECT coalesce(jsonb_agg(i ORDER BY i->>'pasto'), '[]'::jsonb) INTO v_itens FROM jsonb_array_elements(v_itens) i;
  -- as divisões ativas que continuam sem desenho depois desta ligação (só informa)
  SELECT string_agg(m.nome, ', ' ORDER BY m.nome) INTO v_faltam
    FROM public.pastos m
   WHERE m.grupo_id = gr.id AND m.id <> pai.id AND coalesce(m.ativo, false) AND NOT (m.id = ANY (v_pastos))
     AND NOT EXISTS (SELECT 1 FROM public.fazenda_geometrias o WHERE o.pasto_id = m.id);

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'grupo_id', gr.id, 'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome),
      'ligacoes', v_itens, 'sem_desenho', v_faltam,
      'frase', format('%s %s de %s %s o desenho; nenhum pasto é criado e a área oficial não muda.',
                      CASE WHEN cardinality(v_pastos) = 1 THEN 'A divisão' ELSE format('As %s divisões', cardinality(v_pastos)) END,
                      (SELECT string_agg(i->>'pasto', ', ') FROM jsonb_array_elements(v_itens) i), pai.nome,
                      CASE WHEN cardinality(v_pastos) = 1 THEN 'ganha' ELSE 'ganham' END));
  END IF;

  v_motivo := format('divisão de %s (grupo %s): o desenho ligado depois', pai.nome, gr.nome);
  FOR l IN SELECT x FROM jsonb_array_elements(v_itens) x LOOP
    PERFORM public.fn_mapa_geometria_classificar((l->>'geometria_id')::uuid, 'pasto', (l->>'pasto_id')::uuid, v_motivo, false);
  END LOOP;

  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (gr.cliente_id, pai.fazenda_id, auth.uid(), 'cadastros', 'piquetes_ligar', 'pasto_grupos', gr.id,
          format('%s: %s divisão(ões) ganharam o desenho (%s)', pai.nome, cardinality(v_pastos),
                 (SELECT string_agg(i->>'pasto', ', ') FROM jsonb_array_elements(v_itens) i)),
          NULL, jsonb_build_object('grupo_id', gr.id, 'pai_id', pai.id, 'ligacoes', v_itens))
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'grupo_id', gr.id, 'ligacoes', v_itens, 'sem_desenho', v_faltam, 'trilha_id', v_log);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_piquetes_ligar(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_ligar(uuid, jsonb, boolean) TO authenticated;