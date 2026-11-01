-- MAPA-PIQUETES-03 (Gabriel 01/11/2026, opção A: as divisões continuam PASTOS + grupo; o mapa soma no grupo) — o ELO pai → grupo.
-- Até aqui "o grupo P7 nasceu do pasto P7" só estava na observação do pai e na trilha (`audit_log`, acao 'piquetes'). O mapa precisa dele
-- para tratar o pai (até o data_fim) e o grupo (desde o início dos piquetes) como UMA unidade, com o contorno do pai em todos os meses.
--   1) `pasto_grupos.pasto_origem_id` (o pasto que virou o grupo; nulo = grupo montado à mão pelo cadastro) — um pasto origina no máximo um grupo;
--   2) os grupos que já nasceram pela `fn_piquetes_concluir` recebem o elo pela trilha do gesto (01/11: P7 e P6 da Faz. Pureza);
--   3) a `fn_piquetes_concluir` passa a gravar o elo (o corpo é o da 20261028117070, conferido por md5 com o vigente, + 1 UPDATE).
-- `pasto_grupos` tem a escrita direta fechada (REVOKE, FECH-ROTACAO-01 fatia 2); a função é SECURITY DEFINER e grava o elo por dentro.

SET LOCAL lock_timeout = '2s';

ALTER TABLE public.pasto_grupos ADD COLUMN IF NOT EXISTS pasto_origem_id uuid REFERENCES public.pastos(id);
CREATE UNIQUE INDEX IF NOT EXISTS pasto_grupos_pasto_origem_uq ON public.pasto_grupos (pasto_origem_id) WHERE pasto_origem_id IS NOT NULL;
COMMENT ON COLUMN public.pasto_grupos.pasto_origem_id IS 'MAPA-PIQUETES-03: o pasto que virou este grupo (fn_piquetes_concluir); nulo = grupo montado no cadastro';

UPDATE public.pasto_grupos g SET pasto_origem_id = (a.dados_anteriores->'pai'->>'id')::uuid
  FROM public.audit_log a
 WHERE a.acao = 'piquetes' AND a.tabela_origem = 'pastos' AND (a.dados_novos->>'grupo_id')::uuid = g.id AND g.pasto_origem_id IS NULL;

CREATE OR REPLACE FUNCTION public.fn_piquetes_concluir(p_pasto_pai uuid, p_geometrias uuid[], p_mes date, p_simular boolean DEFAULT true)
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

  v_area_pai := public.fn_pasto_area_no_mes(pai.id, to_char(v_mes, 'YYYY-MM'));
  v_fim := (v_mes - interval '1 day')::date;
  SELECT coalesce(jsonb_agg(i ORDER BY i->>'nome'), '[]'::jsonb) INTO v_itens FROM jsonb_array_elements(v_itens) i;

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'mes', v_mes,
      'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'area_oficial_ha', v_area_pai, 'encerra_em', v_fim),
      'piquetes', v_itens, 'soma_ha', v_soma, 'dif_ha', round(v_soma - v_area_pai, 2),
      'dif_pct', CASE WHEN v_area_pai > 0 THEN round((v_soma - v_area_pai) / v_area_pai * 100, 1) END,
      'grupo', jsonb_build_object('nome', pai.nome, 'area_ha', v_soma),
      'frase', format('%s vira o grupo %s com %s piquetes (%s ha) a partir de %s; %s fica encerrado em %s.', pai.nome, pai.nome,
                      jsonb_array_length(v_itens), translate(to_char(v_soma, 'FM999G999G990D00'), ',.', '.,'), v_mm, pai.nome,
                      to_char(v_fim, 'DD/MM/YYYY')));
  END IF;

  -- 1) e 2): um pasto por polígono, com a área oficial do mês e o polígono ligado
  v_motivo := format('piquete de %s (grupo %s, desde %s)', pai.nome, pai.nome, v_mm);
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
          jsonb_build_object('lote', v_lote, 'mes', v_mes, 'grupo_id', v_grupo->>'grupo_id', 'pai_data_fim', v_fim,
                             'piquetes', (SELECT jsonb_agg(jsonb_build_object('pasto_id', n, 'geometria_id', (v_itens->(o::int - 1))->>'geometria_id',
                                                                               'nome', (v_itens->(o::int - 1))->>'nome',
                                                                               'area_ha', ((v_itens->(o::int - 1))->>'area_ha')::numeric))
                                            FROM unnest(v_novos) WITH ORDINALITY u(n, o))))
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'mes', v_mes, 'lote', v_lote, 'grupo_id', v_grupo->>'grupo_id',
    'pastos', to_jsonb(v_novos), 'pai_encerrado_em', v_fim, 'trilha_id', v_log);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_piquetes_concluir(uuid, uuid[], date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_concluir(uuid, uuid[], date, boolean) TO authenticated;
