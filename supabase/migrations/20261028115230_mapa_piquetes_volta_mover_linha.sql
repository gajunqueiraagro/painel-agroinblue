-- MAPA-CRIAR-PIQUETES-01 fatia 2b (o caminho de volta), 1/3 — MOVER A LINHA entre duas divisões do mesmo grupo (D5 b, Gabriel 02/11:
-- mover a linha muda a ÁREA OFICIAL das duas a partir de um mês aberto, num gesto só).
--   * `_fn_piquete_usos(pasto, desde)` (interna): o que já foi lançado num pasto a partir de um mês — fechamento, alocação, membro de
--     fechamento, movimentação, safra, bem do patrimônio, condição e infraestrutura ativa. Vazio = livre. Usada pelo juntar e pelo desfazer.
--   * `fn_piquetes_mover_linha(fazenda, gesto, mês, motivo, simular)`: o desenho pelo escritor de sempre (`fn_geometria_gravar` 'editar',
--     as duas divisões num gesto, com trilha e desfazer) e a área oficial das duas pela `fn_pasto_area_usar_mapa` (a mesma do "Usar a área
--     do mapa": trava de mês fechado, snapshot e valor do rebanho). A PRÉVIA é o próprio gesto feito e desfeito (ZP001): o que ela mostra é
--     o que grava.
CREATE OR REPLACE FUNCTION public._fn_piquete_usos(p_pasto uuid, p_desde date)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT array_remove(ARRAY[
    (SELECT format('fechamento de %s', to_char(to_date(max(fp.ano_mes) || '-01', 'YYYY-MM-DD'), 'MM/YYYY'))
       FROM public.fechamento_pastos fp WHERE fp.pasto_id = p_pasto AND fp.ano_mes >= to_char(p_desde, 'YYYY-MM') HAVING count(*) > 0),
    (SELECT format('%s alocação(ões) de lote no fechamento', count(*))
       FROM public.fechamento_alocacoes a WHERE a.pasto_id = p_pasto AND a.ano_mes >= to_char(p_desde, 'YYYY-MM') HAVING count(*) > 0),
    (SELECT format('fechamento P1 de %s', to_char(to_date(max(m.ano_mes) || '-01', 'YYYY-MM-DD'), 'MM/YYYY'))
       FROM public.fechamento_pastos_membros m WHERE m.pasto_id = p_pasto AND m.ano_mes >= to_char(p_desde, 'YYYY-MM') HAVING count(*) > 0),
    (SELECT format('%s movimentação(ões) de gado', count(*))
       FROM public.pasto_movimentacoes v WHERE p_pasto IN (v.pasto_id, v.pasto_origem_id, v.pasto_destino_id) AND v.data >= p_desde
     HAVING count(*) > 0),
    (SELECT format('%s área(s) de safra', count(*)) FROM public.agri_safra_area s WHERE s.pasto_id = p_pasto AND coalesce(s.ativo, true)
     HAVING count(*) > 0),
    (SELECT format('%s bem(ns) do patrimônio', count(*)) FROM public.patrimonio_bem_pastos b WHERE b.pasto_id = p_pasto AND b.desligado_em IS NULL
     HAVING count(*) > 0),
    (SELECT format('%s avaliação(ões) de condição', count(*)) FROM public.pasto_condicoes c WHERE c.pasto_id = p_pasto AND c.data_avaliacao >= p_desde
     HAVING count(*) > 0),
    (SELECT format('%s infraestrutura(s) ligada(s) (%s)', count(*), string_agg(i.nome, ', ' ORDER BY i.nome))
       FROM public.fazenda_infraestruturas i WHERE i.pasto_id = p_pasto AND coalesce(i.ativo, true) HAVING count(*) > 0)
  ], NULL)
$function$;
REVOKE ALL ON FUNCTION public._fn_piquete_usos(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_piquetes_mover_linha(p_fazenda_id uuid, p_gesto jsonb, p_mes date, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_cliente  uuid;
  v_mes      date := date_trunc('month', p_mes)::date;
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_alt      jsonb := coalesce(p_gesto->'alterar', '[]'::jsonb);
  ga public.fazenda_geometrias; gb public.fazenda_geometrias;
  pa public.pastos; pb public.pastos;
  v_soma_antes numeric; v_soma_depois numeric;
  v_geo jsonb; v_prev jsonb; v_area jsonb := NULL; v_res jsonb; v_log uuid;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = p_fazenda_id;
  IF v_cliente IS NULL OR NOT coalesce(public.tenant_ok(v_cliente), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a esta fazenda';
  END IF;
  IF jsonb_typeof(v_alt) IS DISTINCT FROM 'array' OR jsonb_array_length(v_alt) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mover a linha mexe em exatamente duas divisões. Nada foi gravado.';
  END IF;
  IF v_mes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escolha o mês a partir do qual a área nova vale. Nada foi gravado.';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Informe o motivo. Nada foi gravado.';
  END IF;
  SELECT * INTO ga FROM public.fazenda_geometrias WHERE id = (v_alt->0->>'id')::uuid AND fazenda_id = p_fazenda_id;
  SELECT * INTO gb FROM public.fazenda_geometrias WHERE id = (v_alt->1->>'id')::uuid AND fazenda_id = p_fazenda_id;
  IF ga.id IS NULL OR gb.id IS NULL OR ga.id = gb.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Uma das divisões não existe mais. Atualize a tela. Nada foi gravado.';
  END IF;
  SELECT * INTO pa FROM public.pastos WHERE id = ga.pasto_id;
  SELECT * INTO pb FROM public.pastos WHERE id = gb.pasto_id;
  IF pa.id IS NULL OR pb.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Os dois polígonos têm de ser divisões (ligados a um pasto). Nada foi gravado.';
  END IF;
  IF pa.grupo_id IS NULL OR pa.grupo_id IS DISTINCT FROM pb.grupo_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('%s e %s não são divisões do mesmo grupo: a linha só se move entre vizinhas do mesmo pasto. Nada foi gravado.', pa.nome, pb.nome);
  END IF;
  v_soma_antes := round(public._fn_area_geodesica_ha(ga.geojson) + public._fn_area_geodesica_ha(gb.geojson), 2);

  BEGIN
    -- 1) o desenho: as duas num gesto, pelo escritor de sempre (confere a versão que a tela leu; trilha; desfazer)
    v_geo := public.fn_geometria_gravar(p_fazenda_id,
               jsonb_build_object('acao', 'editar', 'motivo', format('mover a linha entre %s e %s: %s', pa.nome, pb.nome, v_motivo),
                                  'alterar', jsonb_build_array(
                                    jsonb_build_object('id', ga.id, 'versao', v_alt->0->'versao', 'geojson', v_alt->0->'geojson'),
                                    jsonb_build_object('id', gb.id, 'versao', v_alt->1->'versao', 'geojson', v_alt->1->'geojson'))), false);
    SELECT round(sum(public._fn_area_geodesica_ha(g.geojson)), 2) INTO v_soma_depois FROM public.fazenda_geometrias g WHERE g.id IN (ga.id, gb.id);
    -- 2) a área oficial das duas a partir do mês, pela regra do "Usar a área do mapa" (recusa = nada gravado)
    v_prev := public.fn_pasto_area_usar_mapa(ARRAY[pa.id, pb.id], v_mes, format('mover a linha entre %s e %s: %s', pa.nome, pb.nome, v_motivo), true);
    IF (v_prev->>'n_recusa')::int > 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('A área oficial não muda em %s: %s. Nada foi gravado.', to_char(v_mes, 'MM/YYYY'),
        (SELECT string_agg(i->>'nome' || ' — ' || (i->>'motivo'), '; ') FROM jsonb_array_elements(v_prev->'itens') i WHERE i->>'situacao' = 'recusa'));
    END IF;
    IF (v_prev->>'n_muda')::int > 0 THEN
      v_area := public.fn_pasto_area_usar_mapa(ARRAY[pa.id, pb.id], v_mes, format('mover a linha entre %s e %s: %s', pa.nome, pb.nome, v_motivo), false);
    END IF;

    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (v_cliente, p_fazenda_id, auth.uid(), 'cadastros', 'piquetes_mover_linha', 'pasto_grupos', pa.grupo_id,
            format('linha entre %s e %s movida; área oficial desde %s', pa.nome, pb.nome, to_char(v_mes, 'MM/YYYY')),
            jsonb_build_object('soma_ha', v_soma_antes),
            jsonb_build_object('gesto_id', v_geo->>'gesto_id', 'lote', v_area->>'lote', 'mes', v_mes, 'soma_ha', v_soma_depois, 'itens', v_prev->'itens'))
    RETURNING id INTO v_log;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular, 'mes', v_mes, 'gesto_id', v_geo->>'gesto_id', 'lote', v_area->>'lote',
      'itens', v_prev->'itens', 'soma_antes_ha', v_soma_antes, 'soma_depois_ha', v_soma_depois, 'dif_soma_ha', round(v_soma_depois - v_soma_antes, 2),
      'area_muda', (v_prev->>'n_muda')::int > 0, 'trilha_id', v_log,
      'frase', format('A linha entre %s e %s muda; a área oficial das duas vale a do mapa a partir de %s.', pa.nome, pb.nome, to_char(v_mes, 'MM/YYYY')));
    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZP001', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZP001' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.fn_piquetes_mover_linha(uuid, jsonb, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_piquetes_mover_linha(uuid, jsonb, date, text, boolean) TO authenticated;
