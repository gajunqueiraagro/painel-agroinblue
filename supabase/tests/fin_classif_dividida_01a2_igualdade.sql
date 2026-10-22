-- FIN-CLASSIF-DIVIDIDA-01a-2 — a impressao (md5) de TODOS os leitores migrados, para todos os clientes: DRE pecuaria (realizado e meta),
-- o "abrir a linha" por fazenda x bloco, rateio do mes, pendencias, e por safra: DRE lavoura, DRE agricola, painel de safra, rateio
-- detalhe; e o comparativo. Rodar ANTES e DEPOIS da troca (mesma transacao no ensaio): as duas impressoes tem de ser iguais.
CREATE OR REPLACE FUNCTION pg_temp.impressao_leitores() RETURNS TABLE (chave text, md5 text) LANGUAGE plpgsql AS $$
DECLARE c record; f record; s record; b text; q text; v text;
BEGIN
  FOR c IN SELECT DISTINCT l.cliente_id AS id FROM public.financeiro_lancamentos_v2 l LOOP
    FOR q IN SELECT unnest(ARRAY[
      format('public.fn_dre_pecuaria(%L, ''2025-01'', ''2026-12'', ''realizado'')', c.id),
      format('public.fn_dre_pecuaria(%L, ''2025-01'', ''2026-12'', ''meta'')', c.id),
      format('public.fn_rateio_admin_mes(%L, ''2025-01'', ''2026-12'')', c.id),
      format('public.fn_dre_sem_classificacao(%L, ''2025-01'', ''2026-12'')', c.id),
      format('public.fn_painel_safra_comparativo(%L, NULL)', c.id)]) LOOP
      chave := q; BEGIN EXECUTE format('SELECT md5(coalesce((SELECT array_agg(t::text ORDER BY t::text) FROM %s t)::text, ''''))', q) INTO md5;
      EXCEPTION WHEN OTHERS THEN md5 := 'erro: ' || SQLERRM; END; RETURN NEXT;
    END LOOP;
    FOR f IN SELECT z.id FROM public.fazendas z WHERE z.cliente_id = c.id LOOP
      FOR b IN SELECT DISTINCT pc.bloco_dre FROM public.financeiro_plano_contas pc WHERE pc.bloco_dre IS NOT NULL LOOP
        q := format('public.fn_dre_pecuaria_lancamentos(%L, %L, %L, NULL, ''2025-01'', ''2026-12'')', c.id, f.id, b);
        chave := q; BEGIN EXECUTE format('SELECT md5(coalesce((SELECT array_agg(t::text ORDER BY t::text) FROM %s t)::text, ''''))', q) INTO md5;
        EXCEPTION WHEN OTHERS THEN md5 := 'erro: ' || SQLERRM; END; RETURN NEXT;
      END LOOP;
    END LOOP;
    FOR s IN SELECT sf.id FROM public.financeiro_safras sf WHERE sf.cliente_id = c.id LOOP
      FOR q IN SELECT unnest(ARRAY[
        format('public.fn_dre_lavoura(%L, %L)', c.id, s.id),
        format('public.fn_dre_agricola_por_safra(%L, %L)', c.id, s.id),
        format('public.fn_painel_safra(%L, %L, NULL)', c.id, s.id),
        format('public.fn_painel_rateio_detalhe(%L, %L, NULL, ''grupo'', ''Custo Fixo Agricultura'')', c.id, s.id)]) LOOP
        chave := q; BEGIN EXECUTE format('SELECT md5(coalesce((SELECT array_agg(t::text ORDER BY t::text) FROM %s t)::text, ''''))', q) INTO md5;
        EXCEPTION WHEN OTHERS THEN md5 := 'erro: ' || SQLERRM; END; RETURN NEXT;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
