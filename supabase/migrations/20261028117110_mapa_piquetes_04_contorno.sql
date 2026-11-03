-- MAPA-PIQUETES-04 (GO Gabriel 02/11/2026) — o CONTORNO DO PAI nasce no MESMO gesto.
-- Caso: P18, P25, P26, P28 (Pureza) viraram grupo pelo "É piquete de" da Validação (a `fn_piquetes_concluir` direto, com os polígonos do KMZ)
-- e o pai ficou sem polígono; o mapa (MAPA-PIQUETES-03) desenha a unidade pelo contorno do pai, então sumiram em todos os meses.
-- Backfill dos 4 feito à parte, pelo `fn_geometria_gravar` (um gesto por pai, trilha). Aqui a regra, nas duas portas do Code 4:
--  - `fn_piquetes_concluir(…, p_contorno jsonb DEFAULT NULL)`: pai sem polígono e sem contorno → recusa; com contorno (a união das divisões,
--    feita na tela pela `unirVarios`), a área tem de bater com a soma das divisões (1%, piso 0,1 ha) e ele é gravado ligado ao pai, no gesto;
--  - `fn_piquetes_ligar(…, p_contorno jsonb DEFAULT NULL)`: a mesma regra (o contorno tem de cobrir as divisões que se ligam agora).
-- O pai que JÁ tem polígono: o contorno fica (o `p_contorno` não é usado). Os corpos de partida são os da 117080 e da 117090 (md5 conferido
-- com o vigente: 6ab0fc4e… e 9f934f46…); a `fn_piquetes_criar` do Code 3 (115210) já grava o contorno antes e chama as duas com os
-- argumentos de hoje — continua igual (o argumento novo tem padrão). Assinatura nova → DROP da antiga (sem outra sobrecarga).
DROP FUNCTION public.fn_piquetes_concluir(uuid, uuid[], date, boolean);
DROP FUNCTION public.fn_piquetes_ligar(uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.fn_piquetes_concluir(p_pasto_pai uuid, p_geometrias uuid[], p_mes date, p_simular boolean DEFAULT true,
                                                     p_contorno jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pai        public.pastos;
  g          public.fazenda_geometrias;
  v_mes      date := date_trunc('month', p_mes)::date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_mm       text;
  v_ids      uuid[];
  v_id       uuid;
  v_area     numeric;
  v_nome     text;
  v_nomes    text[] := '{}';
  v_itens    jsonb := '[]'::jsonb;
  v_soma     numeric := 0;
  v_area_pai numeric;
  v_frase    text;
  v_novo     uuid;
  v_novos    uuid[] := '{}';
  v_grupo    jsonb;
  v_lote     uuid := gen_random_uuid();
  v_fim      date;
  v_log      uuid;
  v_motivo   text;
  v_contorno_id   uuid;
  v_area_contorno numeric;
  v_r        jsonb;
BEGIN
  SELECT * INTO pai FROM public.pastos WHERE id = p_pasto_pai;
  IF pai.id IS NULL OR NOT coalesce(public.tenant_ok(pai.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF v_mes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escolha o mês em que os piquetes começam. Nada foi gravado.';
  END IF;
  v_mm := to_char(v_mes, 'MM/YYYY');
  IF v_mes > v_mes_atual THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Os piquetes começam no mês atual ou num mês aberto antes dele. Nada foi gravado.';
  END IF;
  IF NOT public.fn_pasto_vigente_no_mes(pai.ativo, pai.data_inicio, pai.data_fim, to_char(v_mes, 'YYYY-MM')) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O pasto %s não está ativo em %s. Nada foi gravado.', pai.nome, v_mm);
  END IF;
  IF pai.data_inicio IS NOT NULL AND pai.data_inicio >= v_mes THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('O pasto %s começou em %s: os piquetes começam num mês depois. Nada foi gravado.', pai.nome, to_char(pai.data_inicio, 'MM/YYYY'));
  END IF;
  IF pai.grupo_id IS NOT NULL THEN
    SELECT format('O pasto %s está no grupo %s: tire-o de lá antes. Nada foi gravado.', pai.nome, o.nome) INTO v_frase
      FROM public.pasto_grupos o WHERE o.id = pai.grupo_id;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
  END IF;
  v_frase := public._fn_pasto_area_trava(pai.id, pai.fazenda_id, v_mes);
  IF v_frase IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('Os piquetes não começam em %s: %s. Reabra o mês ou escolha um mês depois. Nada foi gravado.', v_mm, v_frase);
  END IF;
  SELECT format('O pasto %s tem fechamento de %s (%s): os piquetes começam depois dele. Nada foi gravado.', pai.nome,
                to_char(to_date(fp.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'), fp.status)
    INTO v_frase FROM public.fechamento_pastos fp
   WHERE fp.pasto_id = pai.id AND fp.ano_mes >= to_char(v_mes, 'YYYY-MM') ORDER BY fp.ano_mes DESC LIMIT 1;
  IF v_frase IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_geometrias, '{}'::uuid[])) x WHERE x IS NOT NULL);
  IF cardinality(v_ids) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Marque pelo menos 2 polígonos como piquetes de %s. Nada foi gravado.', pai.nome);
  END IF;

  FOR v_id IN SELECT x FROM unnest(v_ids) x LOOP
    SELECT * INTO g FROM public.fazenda_geometrias WHERE id = v_id;
    IF g.id IS NULL OR g.cliente_id IS DISTINCT FROM pai.cliente_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Um dos polígonos não existe mais. Atualize a tela. Nada foi gravado.';
    END IF;
    IF g.fazenda_id IS DISTINCT FROM pai.fazenda_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O polígono "%s" é de outra fazenda: piquetes e pasto têm de ser da mesma. Nada foi gravado.', g.nome_original);
    END IF;
    IF g.pasto_id IS NOT NULL THEN
      SELECT format('O polígono "%s" já está ligado ao pasto %s. Desvincule lá antes. Nada foi gravado.', g.nome_original, p.nome)
        INTO v_frase FROM public.pastos p WHERE p.id = g.pasto_id;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
    END IF;
    IF g.tipo IS DISTINCT FROM 'outra' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O polígono "%s" está marcado como %s: só polígono sem classificação vira piquete. Nada foi gravado.',
                         g.nome_original, public._fn_mapa_tipo_rotulo(g.tipo));
    END IF;
    v_area := public._fn_area_geodesica_ha(g.geojson);
    IF v_area IS NULL OR v_area <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O polígono "%s" não tem área. Nada foi gravado.', g.nome_original);
    END IF;
    v_nome := btrim(coalesce(g.nome_original, ''));
    IF v_nome = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Um dos polígonos não tem nome: dê um nome a ele antes. Nada foi gravado.';
    END IF;
    IF lower(v_nome) = ANY (v_nomes) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Dois polígonos se chamam "%s": renomeie um antes. Nada foi gravado.', v_nome);
    END IF;
    v_nomes := v_nomes || lower(v_nome);
    SELECT format('Já existe o pasto %s nesta fazenda: renomeie o polígono antes. Nada foi gravado.', p.nome) INTO v_frase
      FROM public.pastos p WHERE p.fazenda_id = pai.fazenda_id AND lower(btrim(p.nome)) = lower(v_nome) AND coalesce(p.ativo, false) LIMIT 1;
    IF v_frase IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
    END IF;
    v_soma := v_soma + v_area;
    v_itens := v_itens || jsonb_build_object('geometria_id', g.id, 'nome', v_nome, 'area_ha', v_area);
  END LOOP;

  SELECT format('Já existe o grupo %s nesta fazenda. Nada foi gravado.', o.nome) INTO v_frase
    FROM public.pasto_grupos o WHERE o.fazenda_id = pai.fazenda_id AND lower(btrim(o.nome)) = lower(btrim(pai.nome));
  IF v_frase IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_frase;
  END IF;

  -- MAPA-PIQUETES-04: o contorno do pai (o desenho da unidade em todos os meses) nasce no MESMO gesto. O do pai fica; sem ele, vem a
  -- união das divisões (`p_contorno`, feita na tela pela `unirVarios`) e tem de bater com a soma delas (1%, piso 0,1 ha).
  SELECT x.id INTO v_contorno_id FROM public.fazenda_geometrias x WHERE x.pasto_id = pai.id LIMIT 1;
  IF v_contorno_id IS NULL THEN
    IF p_contorno IS NULL OR jsonb_typeof(p_contorno) <> 'object' OR p_contorno->>'type' IS DISTINCT FROM 'Polygon' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O pasto %s não tem polígono: o contorno (a união das divisões) vai junto. Nada foi gravado.', pai.nome);
    END IF;
    v_area_contorno := public._fn_area_geodesica_ha(p_contorno);
    IF v_area_contorno IS NULL OR v_area_contorno <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O contorno de %s não tem área. Nada foi gravado.', pai.nome);
    END IF;
    IF abs(v_area_contorno - v_soma) > greatest(v_soma * 0.01, 0.1) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O contorno de %s (%s ha) não bate com a soma das divisões (%s ha): refaça a união. Nada foi gravado.', pai.nome,
                         translate(to_char(v_area_contorno, 'FM999G999G990D00'), ',.', '.,'), translate(to_char(v_soma, 'FM999G999G990D00'), ',.', '.,'));
    END IF;
  ELSE
    SELECT public._fn_area_geodesica_ha(x.geojson) INTO v_area_contorno FROM public.fazenda_geometrias x WHERE x.id = v_contorno_id;
  END IF;

  v_area_pai := public.fn_pasto_area_no_mes(pai.id, to_char(v_mes, 'YYYY-MM'));
  v_fim := (v_mes - interval '1 day')::date;
  SELECT coalesce(jsonb_agg(i ORDER BY i->>'nome'), '[]'::jsonb) INTO v_itens FROM jsonb_array_elements(v_itens) i;

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'mes', v_mes,
      'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'area_oficial_ha', v_area_pai, 'encerra_em', v_fim),
      'piquetes', v_itens, 'soma_ha', v_soma, 'dif_ha', round(v_soma - v_area_pai, 2),
      'dif_pct', CASE WHEN v_area_pai > 0 THEN round((v_soma - v_area_pai) / v_area_pai * 100, 1) END,
      'grupo', jsonb_build_object('nome', pai.nome, 'area_ha', v_soma),
      'contorno', jsonb_build_object('id', v_contorno_id, 'criado', v_contorno_id IS NULL, 'area_ha', round(v_area_contorno, 2)),
      'frase', format('%s vira o grupo %s com %s piquetes (%s ha) a partir de %s; %s fica encerrado em %s.', pai.nome, pai.nome,
                      jsonb_array_length(v_itens), translate(to_char(v_soma, 'FM999G999G990D00'), ',.', '.,'), v_mm, pai.nome,
                      to_char(v_fim, 'DD/MM/YYYY')));
  END IF;

  -- 1) e 2): um pasto por polígono, com a área oficial do mês e o polígono ligado
  v_motivo := format('piquete de %s (grupo %s, desde %s)', pai.nome, pai.nome, v_mm);
  -- MAPA-PIQUETES-04: 0) o contorno do pai, se ele não tinha, pelo escritor de sempre (gesto desenhar, ligado ao pai)
  IF v_contorno_id IS NULL THEN
    v_r := public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'desenhar',
             'motivo', format('contorno de %s = união das divisões (grupo %s, desde %s)', pai.nome, pai.nome, v_mm),
             'criar', jsonb_build_array(jsonb_build_object('nome_original', pai.nome, 'pasto_id', pai.id, 'geojson', p_contorno))), false);
    SELECT x.id INTO v_contorno_id FROM public.fazenda_geometrias x WHERE x.pasto_id = pai.id LIMIT 1;
    IF v_contorno_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O contorno de %s não foi gravado. Nada foi gravado.', pai.nome);
    END IF;
  END IF;
  FOR v_id IN SELECT (i->>'geometria_id')::uuid FROM jsonb_array_elements(v_itens) i LOOP
    SELECT * INTO g FROM public.fazenda_geometrias WHERE id = v_id;
    SELECT (i->>'area_ha')::numeric, i->>'nome' INTO v_area, v_nome FROM jsonb_array_elements(v_itens) i WHERE (i->>'geometria_id')::uuid = v_id;
    PERFORM set_config('app.pasto_estrutura_escritor', '1', true);
    INSERT INTO public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso,
                               qualidade, lote_padrao, referencia_rebanho, situacao, estrutura, observacoes, ordem_exibicao)
    VALUES (pai.fazenda_id, pai.cliente_id, v_nome, v_area, v_area, true, pai.entra_conciliacao, v_mes, pai.tipo_uso,
            pai.qualidade, pai.lote_padrao, pai.referencia_rebanho, pai.situacao, pai.estrutura, format('piquete de %s', pai.nome),
            pai.ordem_exibicao)
    RETURNING id INTO v_novo;
    PERFORM set_config('app.pasto_estrutura_escritor', '', true);
    PERFORM public._fn_pasto_area_gravar(v_novo, v_area, v_mes, 'mapa', v_motivo, g.id, v_area, v_lote);
    PERFORM public.fn_mapa_geometria_classificar(g.id, 'pasto', v_novo, v_motivo, false);
    v_novos := v_novos || v_novo;
  END LOOP;

  -- 3) o grupo com o nome do pai, pelo escritor do Code 1
  v_grupo := public.fn_pasto_grupo_salvar(NULL, pai.fazenda_id, pai.nome, v_novos, false);
  -- MAPA-PIQUETES-03: o elo pai → grupo (o mapa trata o pai e o grupo como UMA unidade: o contorno do pai em todos os meses)
  UPDATE public.pasto_grupos SET pasto_origem_id = pai.id WHERE id = (v_grupo->>'grupo_id')::uuid;

  -- 4) o pai encerrado no mês anterior; o histórico dele fica
  UPDATE public.pastos
     SET data_fim = v_fim,
         observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''), format('virou o grupo %s em %s', pai.nome, v_mm))
   WHERE id = pai.id;

  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (pai.cliente_id, pai.fazenda_id, auth.uid(), 'cadastros', 'piquetes', 'pastos', pai.id,
          format('%s virou o grupo %s com %s piquetes a partir de %s', pai.nome, pai.nome, cardinality(v_novos), v_mm),
          jsonb_build_object('pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'data_fim', pai.data_fim, 'observacoes', pai.observacoes,
                                                       'area_oficial_ha', v_area_pai)),
          jsonb_build_object('lote', v_lote, 'mes', v_mes, 'grupo_id', v_grupo->>'grupo_id', 'pai_data_fim', v_fim, 'contorno_id', v_contorno_id,
                             'piquetes', (SELECT jsonb_agg(jsonb_build_object('pasto_id', n, 'geometria_id', (v_itens->(o::int - 1))->>'geometria_id',
                                                                               'nome', (v_itens->(o::int - 1))->>'nome',
                                                                               'area_ha', ((v_itens->(o::int - 1))->>'area_ha')::numeric))
                                            FROM unnest(v_novos) WITH ORDINALITY u(n, o))))
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'mes', v_mes, 'lote', v_lote, 'grupo_id', v_grupo->>'grupo_id',
    'pastos', to_jsonb(v_novos), 'pai_encerrado_em', v_fim, 'trilha_id', v_log, 'contorno_id', v_contorno_id);
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_piquetes_ligar(p_grupo uuid, p_ligacoes jsonb, p_simular boolean DEFAULT true, p_contorno jsonb DEFAULT NULL)
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
  v_soma    numeric := 0;
  v_contorno_id   uuid;
  v_area_contorno numeric;
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
    v_soma := v_soma + v_area;
    v_geos := v_geos || v_geo;
    v_pastos := v_pastos || v_pasto;
    v_itens := v_itens || jsonb_build_object('geometria_id', g.id, 'nome_poligono', g.nome_original, 'pasto_id', p.id, 'pasto', p.nome,
      'area_desenho_ha', round(v_area, 2), 'area_oficial_ha', v_oficial,
      'dif_ha', CASE WHEN v_oficial IS NOT NULL THEN round(v_area - v_oficial, 2) END);
  END LOOP;

  SELECT coalesce(jsonb_agg(i ORDER BY i->>'pasto'), '[]'::jsonb) INTO v_itens FROM jsonb_array_elements(v_itens) i;
  -- MAPA-PIQUETES-04: o contorno do pai fica; sem ele, vem junto (`p_contorno`, a união das divisões) e tem de cobrir as que se ligam agora
  SELECT x.id INTO v_contorno_id FROM public.fazenda_geometrias x WHERE x.pasto_id = pai.id LIMIT 1;
  IF v_contorno_id IS NULL THEN
    IF p_contorno IS NULL OR jsonb_typeof(p_contorno) <> 'object' OR p_contorno->>'type' IS DISTINCT FROM 'Polygon' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O pasto %s não tem polígono: o contorno (a união das divisões) vai junto. Nada foi gravado.', pai.nome);
    END IF;
    v_area_contorno := public._fn_area_geodesica_ha(p_contorno);
    IF v_area_contorno IS NULL OR v_area_contorno <= 0 OR v_area_contorno < v_soma - greatest(v_soma * 0.01, 0.1) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = format('O contorno de %s não cobre as divisões ligadas: refaça a união. Nada foi gravado.', pai.nome);
    END IF;
  ELSE
    SELECT public._fn_area_geodesica_ha(x.geojson) INTO v_area_contorno FROM public.fazenda_geometrias x WHERE x.id = v_contorno_id;
  END IF;
  -- as divisões ativas que continuam sem desenho depois desta ligação (só informa)
  SELECT string_agg(m.nome, ', ' ORDER BY m.nome) INTO v_faltam
    FROM public.pastos m
   WHERE m.grupo_id = gr.id AND m.id <> pai.id AND coalesce(m.ativo, false) AND NOT (m.id = ANY (v_pastos))
     AND NOT EXISTS (SELECT 1 FROM public.fazenda_geometrias o WHERE o.pasto_id = m.id);

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'grupo_id', gr.id, 'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome),
      'ligacoes', v_itens, 'sem_desenho', v_faltam,
      'contorno', jsonb_build_object('id', v_contorno_id, 'criado', v_contorno_id IS NULL, 'area_ha', round(v_area_contorno, 2)),
      'frase', format('%s %s de %s %s o desenho; nenhum pasto é criado e a área oficial não muda.',
                      CASE WHEN cardinality(v_pastos) = 1 THEN 'A divisão' ELSE format('As %s divisões', cardinality(v_pastos)) END,
                      (SELECT string_agg(i->>'pasto', ', ') FROM jsonb_array_elements(v_itens) i), pai.nome,
                      CASE WHEN cardinality(v_pastos) = 1 THEN 'ganha' ELSE 'ganham' END));
  END IF;

  v_motivo := format('divisão de %s (grupo %s): o desenho ligado depois', pai.nome, gr.nome);
  IF v_contorno_id IS NULL THEN
    PERFORM public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'desenhar',
              'motivo', format('contorno de %s = união das divisões (grupo %s)', pai.nome, gr.nome),
              'criar', jsonb_build_array(jsonb_build_object('nome_original', pai.nome, 'pasto_id', pai.id, 'geojson', p_contorno))), false);
    SELECT x.id INTO v_contorno_id FROM public.fazenda_geometrias x WHERE x.pasto_id = pai.id LIMIT 1;
    IF v_contorno_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O contorno de %s não foi gravado. Nada foi gravado.', pai.nome);
    END IF;
  END IF;
  FOR l IN SELECT x FROM jsonb_array_elements(v_itens) x LOOP
    PERFORM public.fn_mapa_geometria_classificar((l->>'geometria_id')::uuid, 'pasto', (l->>'pasto_id')::uuid, v_motivo, false);
  END LOOP;

  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (gr.cliente_id, pai.fazenda_id, auth.uid(), 'cadastros', 'piquetes_ligar', 'pasto_grupos', gr.id,
          format('%s: %s divisão(ões) ganharam o desenho (%s)', pai.nome, cardinality(v_pastos),
                 (SELECT string_agg(i->>'pasto', ', ') FROM jsonb_array_elements(v_itens) i)),
          NULL, jsonb_build_object('grupo_id', gr.id, 'pai_id', pai.id, 'ligacoes', v_itens, 'contorno_id', v_contorno_id))
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'grupo_id', gr.id, 'ligacoes', v_itens, 'sem_desenho', v_faltam, 'trilha_id', v_log,
    'contorno_id', v_contorno_id);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_piquetes_concluir(uuid, uuid[], date, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_concluir(uuid, uuid[], date, boolean, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_piquetes_ligar(uuid, jsonb, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_ligar(uuid, jsonb, boolean, jsonb) TO authenticated;