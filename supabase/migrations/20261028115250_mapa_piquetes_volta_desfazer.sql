-- MAPA-CRIAR-PIQUETES-01 fatia 2b (o caminho de volta), 3/3 — DESFAZER OS PIQUETES (D7 a, Gabriel 02/11): só enquanto NENHUMA divisão tem
-- nada lançado (`_fn_piquete_usos`, desde sempre); volta tudo, nada se apaga do cadastro.
--   * Grupo que nasceu do concluir (trilha 'piquetes' do pai com este grupo):
--       - o pai volta a valer como era antes (data_fim e observações da trilha; a trava de área do mês dos piquetes vale para ele);
--       - as divisões ficam INATIVAS (nunca apagadas), com a frase do desfazer nas observações;
--       - o grupo é desativado pelo escritor dele e ganha o nome "<nome> (desfeito em dd/mm/aaaa hh:mi)" e perde o elo com o pai (o nome e o
--         elo são únicos: sem isso o pai não poderia virar piquetes de novo); o elo antigo fica na trilha.
--   * Grupo do caso P6 (só ligou desenhos a pastos que já existiam, trilha 'piquetes_ligar'): só os desenhos voltam a ficar soltos.
--   * Os polígonos: o que NASCEU no mesmo gesto que o ligou (a criação na trilha do mapa tem o mesmo instante da trilha do cadastro) sai
--     pelo escritor ('apagar', com motivo); o que já existia só volta a ficar sem classificação. Praça e corredor nascidos no mesmo gesto
--     também saem. O contorno do pai e a infraestrutura ligada ao pai ficam (o pai volta a valer).
--   * A prévia é o gesto feito e desfeito (ZP001).
CREATE OR REPLACE FUNCTION public.fn_piquetes_desfazer(p_grupo uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  gr public.pasto_grupos; pai public.pastos; p public.pastos; g public.fazenda_geometrias;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_conc   public.audit_log;
  v_modo   text;
  v_mes    date;
  v_pastos uuid[] := '{}';
  v_trilhas timestamptz[] := '{}';
  v_frase  text; v_usos text[]; v_recusas text[] := '{}';
  v_polis  jsonb := '[]'::jsonb;  -- {id, nome, pasto, destino: apagar|soltar}
  v_areas  jsonb := '[]'::jsonb;  -- praça/corredor que saem
  v_versao int; e jsonb; v_r jsonb; v_log uuid; v_res jsonb; v_sufixo text; v_x uuid;
BEGIN
  SELECT * INTO gr FROM public.pasto_grupos WHERE id = p_grupo;
  IF gr.id IS NULL OR NOT coalesce(public.tenant_ok(gr.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF NOT gr.ativo THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O grupo %s já está desativado. Nada foi gravado.', gr.nome);
  END IF;
  SELECT * INTO pai FROM public.pastos WHERE id = gr.pasto_origem_id;
  IF pai.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('O grupo %s não nasceu de um pasto: desfaça em "Grupos de pastejo". Nada foi gravado.', gr.nome);
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Informe o motivo. Nada foi gravado.';
  END IF;

  -- o modo: o concluir deste grupo (o mais recente), senão as ligações
  SELECT * INTO v_conc FROM public.audit_log a
   WHERE a.acao = 'piquetes' AND a.tabela_origem = 'pastos' AND a.registro_id = pai.id AND a.dados_novos->>'grupo_id' = gr.id::text
   ORDER BY a.created_at DESC LIMIT 1;
  IF v_conc.id IS NOT NULL THEN
    v_modo := 'criados';
    v_mes := (v_conc.dados_novos->>'mes')::date;
    v_pastos := ARRAY(SELECT (x->>'pasto_id')::uuid FROM jsonb_array_elements(v_conc.dados_novos->'piquetes') x);
    v_trilhas := ARRAY[v_conc.created_at];
    IF pai.data_fim IS DISTINCT FROM (v_conc.dados_novos->>'pai_data_fim')::date THEN
      v_recusas := v_recusas || format('o fim de %s mudou depois dos piquetes (era %s, está %s)', pai.nome,
        to_char((v_conc.dados_novos->>'pai_data_fim')::date, 'DD/MM/YYYY'), coalesce(to_char(pai.data_fim, 'DD/MM/YYYY'), 'sem fim'));
    END IF;
    IF pai.grupo_id IS NOT NULL THEN
      v_recusas := v_recusas || format('%s está em outro grupo', pai.nome);
    END IF;
    v_frase := public._fn_pasto_area_trava(pai.id, pai.fazenda_id, v_mes);
    IF v_frase IS NOT NULL THEN v_recusas := v_recusas || v_frase; END IF;
    FOR p IN SELECT * FROM public.pastos x WHERE x.id = ANY (v_pastos) ORDER BY x.nome LOOP
      v_usos := public._fn_piquete_usos(p.id, '0001-01-01'::date);
      IF cardinality(v_usos) > 0 THEN v_recusas := v_recusas || format('%s tem %s', p.nome, array_to_string(v_usos, ', ')); END IF;
    END LOOP;
  ELSE
    v_modo := 'ligados';
  END IF;
  -- as ligações deste grupo (caso P6, e as do criar num grupo que já existia)
  FOR e IN SELECT jsonb_build_object('l', l, 'em', a.created_at) FROM public.audit_log a, jsonb_array_elements(a.dados_novos->'ligacoes') l
            WHERE a.acao = 'piquetes_ligar' AND a.registro_id = gr.id LOOP
    v_x := (e->'l'->>'pasto_id')::uuid;
    IF NOT v_x = ANY (v_pastos) THEN v_pastos := v_pastos || v_x; END IF;
    IF NOT (e->>'em')::timestamptz = ANY (v_trilhas) THEN v_trilhas := v_trilhas || (e->>'em')::timestamptz; END IF;
  END LOOP;
  IF cardinality(v_recusas) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('Os piquetes de %s não se desfazem: %s. Nada foi gravado.', pai.nome, array_to_string(v_recusas, '; '));
  END IF;

  -- os polígonos das divisões: nasceu no mesmo instante da trilha que o ligou → sai; senão → volta a ficar solto
  FOR g IN SELECT * FROM public.fazenda_geometrias x WHERE x.pasto_id = ANY (v_pastos) ORDER BY x.nome_original LOOP
    v_polis := v_polis || jsonb_build_object('id', g.id, 'nome', g.nome_original, 'pasto_id', g.pasto_id,
      'destino', CASE WHEN EXISTS (SELECT 1 FROM public.fazenda_geometria_edicoes t
                                    WHERE t.geometria_id = g.id AND t.antes IS NULL AND t.em = ANY (v_trilhas)) THEN 'apagar' ELSE 'soltar' END);
  END LOOP;
  IF v_modo = 'ligados' AND jsonb_array_length(v_polis) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O grupo %s não tem desenho ligado por aqui: nada a desfazer.', gr.nome);
  END IF;
  -- praça e corredor nascidos no mesmo gesto
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome_original, 'tipo', x.tipo) ORDER BY x.nome_original), '[]'::jsonb) INTO v_areas
    FROM public.fazenda_geometrias x
   WHERE x.fazenda_id = pai.fazenda_id AND x.pasto_id IS NULL AND x.tipo IN ('benfeitoria', 'estrada')
     AND EXISTS (SELECT 1 FROM public.fazenda_geometria_edicoes t WHERE t.geometria_id = x.id AND t.antes IS NULL AND t.em = ANY (v_trilhas));
  -- infraestrutura ligada a um polígono que sai: recusa (mover antes)
  SELECT string_agg(format('%s (no polígono %s)', i.nome, gg.nome_original), ', ') INTO v_frase
    FROM public.fazenda_infraestruturas i JOIN public.fazenda_geometrias gg ON gg.id = i.geometria_id
   WHERE coalesce(i.ativo, true)
     AND (i.geometria_id IN (SELECT (y->>'id')::uuid FROM jsonb_array_elements(v_polis) y WHERE y->>'destino' = 'apagar')
          OR i.geometria_id IN (SELECT (y->>'id')::uuid FROM jsonb_array_elements(v_areas) y));
  IF v_frase IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('Há infraestrutura ligada a um polígono que sai: %s. Mude-a de lugar antes. Nada foi gravado.', v_frase);
  END IF;

  BEGIN
    -- 1) os desenhos: soltar todos (sem classificação); os nascidos no gesto saem pelo escritor
    FOR e IN SELECT * FROM jsonb_array_elements(v_polis) LOOP
      PERFORM public.fn_mapa_geometria_classificar((e->>'id')::uuid, 'outra', NULL, format('desfazer piquetes de %s: %s', pai.nome, v_motivo), false);
      IF e->>'destino' = 'apagar' THEN
        SELECT versao INTO v_versao FROM public.fazenda_geometrias WHERE id = (e->>'id')::uuid;
        v_r := public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'apagar',
                 'motivo', format('desfazer piquetes de %s: %s', pai.nome, v_motivo),
                 'remover', jsonb_build_array(jsonb_build_object('id', e->>'id', 'versao', v_versao))), false);
      END IF;
    END LOOP;
    FOR e IN SELECT * FROM jsonb_array_elements(v_areas) LOOP
      SELECT versao INTO v_versao FROM public.fazenda_geometrias WHERE id = (e->>'id')::uuid;
      v_r := public.fn_geometria_gravar(pai.fazenda_id, jsonb_build_object('acao', 'apagar',
               'motivo', format('desfazer piquetes de %s: %s', pai.nome, v_motivo),
               'remover', jsonb_build_array(jsonb_build_object('id', e->>'id', 'versao', v_versao))), false);
    END LOOP;

    IF v_modo = 'criados' THEN
      -- 2) o grupo: desativado pelo escritor dele; nome e elo liberados (são únicos), o antigo fica na trilha
      PERFORM public.fn_pasto_grupo_desativar(gr.id, false);
      v_sufixo := format(' (desfeito em %s)', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
      PERFORM set_config('app.pasto_grupo_escritor', '1', true);
      UPDATE public.pasto_grupos SET nome = left(gr.nome, 200) || v_sufixo, pasto_origem_id = NULL, updated_at = now() WHERE id = gr.id;
      PERFORM set_config('app.pasto_grupo_escritor', '', true);
      -- 3) as divisões ficam inativas (nunca apagadas)
      UPDATE public.pastos
         SET ativo = false,
             observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''),
                                     format('piquete desfeito em %s: %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), v_motivo))
       WHERE id = ANY (v_pastos);
      -- 4) o pai volta como era
      UPDATE public.pastos
         SET data_fim = (v_conc.dados_anteriores->'pai'->>'data_fim')::date,
             observacoes = v_conc.dados_anteriores->'pai'->>'observacoes'
       WHERE id = pai.id;
    END IF;

    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (gr.cliente_id, pai.fazenda_id, auth.uid(), 'cadastros', 'piquetes_desfeitos', 'pasto_grupos', gr.id,
            CASE WHEN v_modo = 'criados' THEN format('piquetes de %s desfeitos: %s volta a valer; %s divisões inativas', pai.nome, pai.nome, cardinality(v_pastos))
                 ELSE format('desenhos dos piquetes de %s soltos (%s)', pai.nome, jsonb_array_length(v_polis)) END,
            jsonb_build_object('grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome, 'pasto_origem_id', gr.pasto_origem_id),
                               'pai', jsonb_build_object('id', pai.id, 'data_fim', pai.data_fim, 'observacoes', pai.observacoes),
                               'trilha_piquetes', v_conc.id),
            jsonb_build_object('modo', v_modo, 'motivo', v_motivo, 'pastos', to_jsonb(v_pastos), 'poligonos', v_polis, 'areas', v_areas))
    RETURNING id INTO v_log;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular, 'modo', v_modo, 'trilha_id', v_log,
      'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'volta_a_valer', v_modo = 'criados',
                                'data_fim_depois', CASE WHEN v_modo = 'criados' THEN v_conc.dados_anteriores->'pai'->'data_fim' END),
      'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome, 'desativado', v_modo = 'criados'),
      'divisoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'fica_inativo', v_modo = 'criados') ORDER BY x.nome), '[]'::jsonb)
                     FROM public.pastos x WHERE x.id = ANY (v_pastos)),
      'poligonos', v_polis, 'areas', v_areas,
      'frase', CASE WHEN v_modo = 'criados'
                    THEN format('%s volta a ser um pasto só; as %s divisões ficam inativas (o cadastro não se apaga); %s polígono(s) saem do mapa e %s voltam a ficar sem classificação.',
                                pai.nome, cardinality(v_pastos),
                                (SELECT count(*) FROM jsonb_array_elements(v_polis) y WHERE y->>'destino' = 'apagar') + jsonb_array_length(v_areas),
                                (SELECT count(*) FROM jsonb_array_elements(v_polis) y WHERE y->>'destino' = 'soltar'))
                    ELSE format('Os %s desenhos ligados às divisões de %s voltam a ficar sem classificação; os pastos e o grupo ficam.', jsonb_array_length(v_polis), gr.nome) END);
    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZP001', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZP001' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.fn_piquetes_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_desfazer(uuid, text, boolean) TO authenticated;
