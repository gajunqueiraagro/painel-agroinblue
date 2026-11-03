-- MAPA-CRIAR-PIQUETES-01 fatia 2b (o caminho de volta), 2/3 — JUNTAR duas divisões vizinhas do mesmo grupo (D6 a, Gabriel 02/11: A absorve B).
--   * A fica: o polígono dela vira a união (vem da tela, `unirVarios`, como o contorno do concluir; o banco confere pela área: a união
--     tem de bater com a soma das duas, 1% com piso de 0,1 ha) e a área oficial de A passa a ser a da união a partir do mês.
--   * B sai: o polígono dela é removido no MESMO gesto 'unir' do escritor (trilha e desfazer do desenho); o pasto B encerra no mês anterior
--     (o histórico fica) e sai do grupo pelo escritor do grupo (`fn_pasto_grupo_salvar`).
--   * Recusas: mês fechado/snapshot/valor do rebanho (a trava de área, nas duas); B com qualquer coisa lançada do mês em diante
--     (`_fn_piquete_usos`); o grupo ficaria com uma divisão só (aí é "Desfazer piquetes").
--   * A prévia é o gesto feito e desfeito (ZP001).
CREATE OR REPLACE FUNCTION public.fn_piquetes_juntar(p_fica uuid, p_sai uuid, p_mes date, p_desenho jsonb, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  pa public.pastos; pb public.pastos; gr public.pasto_grupos;
  ga public.fazenda_geometrias; gb public.fazenda_geometrias;
  v_mes       date := date_trunc('month', p_mes)::date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_mm        text;
  v_motivo    text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_uniao     jsonb := p_desenho->'geojson';
  v_area_a numeric; v_area_b numeric; v_area_u numeric; v_oficial_a numeric; v_oficial_b numeric;
  v_frase text; v_usos text[]; v_ficam uuid[]; v_geo jsonb; v_grupo jsonb; v_lote uuid := gen_random_uuid(); v_log uuid; v_res jsonb;
  v_fim date;
BEGIN
  SELECT * INTO pa FROM public.pastos WHERE id = p_fica;
  SELECT * INTO pb FROM public.pastos WHERE id = p_sai;
  IF pa.id IS NULL OR pb.id IS NULL OR NOT coalesce(public.tenant_ok(pa.cliente_id), false) OR NOT coalesce(public.tenant_ok(pb.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF pa.id = pb.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escolha duas divisões diferentes. Nada foi gravado.';
  END IF;
  IF v_mes IS NULL OR v_mes > v_mes_atual THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Juntar vale do mês atual ou de um mês aberto antes dele. Nada foi gravado.';
  END IF;
  v_mm := to_char(v_mes, 'MM/YYYY');
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Informe o motivo. Nada foi gravado.';
  END IF;
  SELECT * INTO gr FROM public.pasto_grupos WHERE id = pa.grupo_id;
  IF gr.id IS NULL OR NOT gr.ativo OR pb.grupo_id IS DISTINCT FROM gr.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('%s e %s não são divisões do mesmo grupo. Nada foi gravado.', pa.nome, pb.nome);
  END IF;
  IF NOT public.fn_pasto_vigente_no_mes(pa.ativo, pa.data_inicio, pa.data_fim, to_char(v_mes, 'YYYY-MM'))
     OR NOT public.fn_pasto_vigente_no_mes(pb.ativo, pb.data_inicio, pb.data_fim, to_char(v_mes, 'YYYY-MM')) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('%s e %s têm de estar ativos em %s. Nada foi gravado.', pa.nome, pb.nome, v_mm);
  END IF;
  IF pb.data_inicio IS NOT NULL AND pb.data_inicio >= v_mes THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('%s começou em %s: juntar vale de um mês depois (ou use "Desfazer piquetes"). Nada foi gravado.', pb.nome, to_char(pb.data_inicio, 'MM/YYYY'));
  END IF;
  v_frase := coalesce(public._fn_pasto_area_trava(pa.id, pa.fazenda_id, v_mes), public._fn_pasto_area_trava(pb.id, pb.fazenda_id, v_mes));
  IF v_frase IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Não dá para juntar em %s: %s. Reabra o mês ou escolha um mês depois. Nada foi gravado.', v_mm, v_frase);
  END IF;
  v_usos := public._fn_piquete_usos(pb.id, v_mes);
  IF cardinality(v_usos) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('%s já tem, de %s em diante: %s. Nada foi gravado.', pb.nome, v_mm, array_to_string(v_usos, '; '));
  END IF;
  v_ficam := ARRAY(SELECT p.id FROM public.pastos p WHERE p.grupo_id = gr.id AND p.id <> pb.id);
  IF cardinality(v_ficam) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('O grupo %s ficaria com uma divisão só: use "Desfazer piquetes". Nada foi gravado.', gr.nome);
  END IF;

  SELECT * INTO ga FROM public.fazenda_geometrias WHERE pasto_id = pa.id;
  SELECT * INTO gb FROM public.fazenda_geometrias WHERE pasto_id = pb.id;
  IF ga.id IS NULL OR gb.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'As duas divisões precisam ter polígono no mapa. Nada foi gravado.';
  END IF;
  IF v_uniao IS NULL OR jsonb_typeof(v_uniao) <> 'object' OR v_uniao->>'type' IS DISTINCT FROM 'Polygon' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('A união de %s e %s tem de ser um polígono só (as duas são vizinhas?). Nada foi gravado.', pa.nome, pb.nome);
  END IF;
  v_area_a := public._fn_area_geodesica_ha(ga.geojson);
  v_area_b := public._fn_area_geodesica_ha(gb.geojson);
  v_area_u := public._fn_area_geodesica_ha(v_uniao);
  IF v_area_u IS NULL OR abs(v_area_u - (v_area_a + v_area_b)) > greatest((v_area_a + v_area_b) * 0.01, 0.1) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('A união (%s ha) não bate com a soma de %s e %s (%s ha): refaça. Nada foi gravado.',
                       translate(to_char(coalesce(v_area_u, 0), 'FM999G999G990D00'), ',.', '.,'), pa.nome, pb.nome,
                       translate(to_char(v_area_a + v_area_b, 'FM999G999G990D00'), ',.', '.,'));
  END IF;
  v_oficial_a := public.fn_pasto_area_no_mes(pa.id, to_char(v_mes, 'YYYY-MM'));
  v_oficial_b := public.fn_pasto_area_no_mes(pb.id, to_char(v_mes, 'YYYY-MM'));
  v_fim := (v_mes - interval '1 day')::date;

  BEGIN
    -- 1) o desenho: A vira a união e B sai, num gesto 'unir' do escritor (B solta o pasto antes: o índice "um polígono por pasto")
    v_geo := public.fn_geometria_gravar(pa.fazenda_id, jsonb_build_object('acao', 'unir',
               'motivo', format('juntar %s em %s: %s', pb.nome, pa.nome, v_motivo),
               'alterar', jsonb_build_array(jsonb_build_object('id', ga.id, 'versao', p_desenho->'versao_fica', 'geojson', v_uniao)),
               'remover', jsonb_build_array(jsonb_build_object('id', gb.id, 'versao', p_desenho->'versao_sai'))), false);
    -- 2) a área oficial de A a partir do mês = a da união
    PERFORM public._fn_pasto_area_gravar(pa.id, v_area_u, v_mes, 'mapa', format('juntou %s (desde %s): %s', pb.nome, v_mm, v_motivo),
                                         ga.id, v_area_u, v_lote);
    -- 3) B sai do grupo (escritor do grupo) e encerra no mês anterior; o histórico fica
    v_grupo := public.fn_pasto_grupo_salvar(gr.id, gr.fazenda_id, gr.nome, v_ficam, false);
    UPDATE public.pastos
       SET data_fim = v_fim,
           observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''), format('juntou-se a %s em %s', pa.nome, v_mm))
     WHERE id = pb.id;

    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (pa.cliente_id, pa.fazenda_id, auth.uid(), 'cadastros', 'piquetes_juntar', 'pasto_grupos', gr.id,
            format('%s juntou-se a %s a partir de %s (grupo %s)', pb.nome, pa.nome, v_mm, gr.nome),
            jsonb_build_object('fica', jsonb_build_object('id', pa.id, 'nome', pa.nome, 'area_oficial_ha', v_oficial_a, 'geometria_id', ga.id),
                               'sai', jsonb_build_object('id', pb.id, 'nome', pb.nome, 'area_oficial_ha', v_oficial_b, 'geometria_id', gb.id,
                                                         'data_fim', pb.data_fim, 'observacoes', pb.observacoes, 'grupo_id', gr.id)),
            jsonb_build_object('mes', v_mes, 'gesto_id', v_geo->>'gesto_id', 'lote', v_lote, 'area_uniao_ha', round(v_area_u, 2), 'sai_data_fim', v_fim))
    RETURNING id INTO v_log;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular, 'mes', v_mes, 'gesto_id', v_geo->>'gesto_id', 'lote', v_lote, 'trilha_id', v_log,
      'fica', jsonb_build_object('id', pa.id, 'nome', pa.nome, 'area_antes_ha', v_oficial_a, 'area_depois_ha', round(v_area_u, 2)),
      'sai', jsonb_build_object('id', pb.id, 'nome', pb.nome, 'area_antes_ha', v_oficial_b, 'encerra_em', v_fim),
      'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome, 'divisoes', cardinality(v_ficam)),
      'frase', format('%s absorve %s a partir de %s (%s ha); %s fica encerrado em %s e sai do grupo %s.', pa.nome, pb.nome, v_mm,
                      translate(to_char(v_area_u, 'FM999G999G990D00'), ',.', '.,'), pb.nome, to_char(v_fim, 'DD/MM/YYYY'), gr.nome));
    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZP001', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZP001' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.fn_piquetes_juntar(uuid, uuid, date, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_juntar(uuid, uuid, date, jsonb, text, boolean) TO authenticated;
