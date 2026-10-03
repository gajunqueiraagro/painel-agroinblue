-- PR-CONC-ENRIQ-IMPORT-ATOMICA-01 — a IMPORTACAO vira entidade do banco, com estado
--
-- POR QUE (FASE 0 do IMPORTACAO-MES, 03/10)
-- Nao existia "importacao" no banco: o id da sessao era um uuid gerado pela tela, as linhas entravam em lotes de 100, e
-- se um lote falhava os anteriores ficavam, nada marcava a sessao como incompleta, e clicar de novo criava outro uuid.
-- "Imp NN" e "mais recente" eram deduzidos da data de criacao das linhas e contavam a sessao pela metade: no NJ, quatro
-- importacoes de set/26 ficaram com 400 de 470 linhas (53ff65d5, 05f22626, eae81dda, 6d08260f) e a 6d08260f era a "mais
-- recente". E `fn_classificacao_excluir_sessao` recusava exclui-las por causa do 'ja_aplicado' HERDADO da memoria.
--
-- O QUE NASCE
-- D1. `classificacao_sessoes`: id (= o uuid que a tela ja' gera), cliente, criado_em/por, arquivo, linhas_esperadas,
--     status ('importando' | 'completa' | 'incompleta'), concluida_em. Linhas RECEBIDAS sao CONTADAS do staging, nunca
--     guardadas. Leitura pela RLS `tenant_ok`; escrita SO' pelas funcoes (o padrao de classificacao_blocos/_splits).
-- D2. `fn_classificacao_sessao_abrir(sessao, cliente, linhas_esperadas, arquivo)`: idempotente — chamar de novo com o mesmo
--     id nao duplica nem zera; numa incompleta (retomar) volta a 'importando'; numa completa nao faz nada; com outro numero
--     de linhas esperadas RECUSA (o arquivo nao e' o mesmo).
-- D3. `fn_classificacao_sessao_concluir(sessao)`: 'completa' SO' quando as linhas do staging = linhas_esperadas; senao
--     'incompleta', e devolve "N de M".
-- D5. A LEITURA e' a view `vw_classificacao_sessoes` (security_invoker): 'importando' ha' mais de 10 minutos sem linha nova
--     e' 'incompleta' (aba fechada no meio). Regra de leitura no dono, sem job.
-- D7. `fn_classificacao_excluir_sessao` (mesma assinatura): o 'ja_aplicado' HERDADO (aplicado = false) deixa de impedir.
--     Impedem: GRAVACAO feita na sessao (aplicado = true) e BLOCO CONFERIDO dela, com o motivo escrito ("3 blocos e 1
--     gravacao feitos nesta importacao."). Os casamentos manuais (resolvido_manual/_grupo, ambiguo_resolvido) NAO impedem,
--     mas a simulacao os CONTA (`resolvidos`) para a confirmacao dizer o que se perde. A sessao sai da tabela junto.
--       md5(prosrc) ANTES: 4e2dec30571e7ef7a953deefce75a02b — corpo pequeno (1.304 chars), reescrito INTEGRAL com a guarda
--       de origem; md5 DEPOIS: 5df4b0076626204e480a985f01a00ba7 (conferido no fim).
-- D8. Backfill: cada sessao_id do staging vira uma linha 'completa', linhas_esperadas NULO (legado), criado_em =
--     concluida_em = o MAIOR created_at das linhas — o mesmo carimbo que o seletor ja' mostrava, para nenhum rotulo mudar.
--     EXCECAO decidida pelo Gabriel: no NJ, 53ff65d5, 05f22626, eae81dda e 6d08260f entram 'incompleta' com 470 esperadas.
--
-- O POPULATE NAO MUDA (93e3eb6c): ele continua o unico escritor das linhas.

-- ═══════════════════ D1 — a tabela ═══════════════════
CREATE TABLE public.classificacao_sessoes (
  id               uuid PRIMARY KEY,
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  criado_por       uuid,
  arquivo          text,
  linhas_esperadas integer CHECK (linhas_esperadas IS NULL OR linhas_esperadas > 0),
  status           text NOT NULL DEFAULT 'importando' CHECK (status IN ('importando', 'completa', 'incompleta')),
  concluida_em     timestamptz
);
CREATE INDEX classificacao_sessoes_cliente_idx ON public.classificacao_sessoes (cliente_id, criado_em DESC);
ALTER TABLE public.classificacao_sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY classificacao_sessoes_select ON public.classificacao_sessoes FOR SELECT USING (tenant_ok(cliente_id));
REVOKE ALL ON TABLE public.classificacao_sessoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.classificacao_sessoes TO authenticated;

-- ═══════════════════ D5 — a leitura (a regra dos 10 minutos mora aqui) ═══════════════════
CREATE VIEW public.vw_classificacao_sessoes WITH (security_invoker = true) AS
SELECT s.id AS sessao_id,
       s.cliente_id,
       s.criado_em,
       s.criado_por,
       s.arquivo,
       s.linhas_esperadas,
       coalesce(st.n, 0)::integer AS linhas_recebidas,
       st.ultima_linha_em,
       CASE WHEN s.status = 'importando'
             AND coalesce(st.ultima_linha_em, s.criado_em) < now() - interval '10 minutes'
            THEN 'incompleta' ELSE s.status END AS status,
       s.status AS status_gravado,
       s.concluida_em
  FROM public.classificacao_sessoes s
  LEFT JOIN LATERAL (
    SELECT count(*) AS n, max(x.created_at) AS ultima_linha_em
      FROM public.financeiro_classificacao_staging x
     WHERE x.sessao_id = s.id) st ON true;
REVOKE ALL ON TABLE public.vw_classificacao_sessoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_classificacao_sessoes TO authenticated;

-- ═══════════════════ D2 — abrir (idempotente) ═══════════════════
CREATE FUNCTION public.fn_classificacao_sessao_abrir(
  p_sessao_id uuid, p_cliente_id uuid, p_linhas_esperadas integer, p_arquivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $fn$
DECLARE v_uid uuid; v_s public.classificacao_sessoes%ROWTYPE; v_rec integer;
BEGIN
  IF p_sessao_id IS NULL OR p_cliente_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id e p_cliente_id obrigatorios'; END IF;
  IF coalesce(p_linhas_esperadas, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_linhas', 'mensagem', 'A planilha nao tem linhas para importar.');
  END IF;
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem permissao para este cliente';
  END IF;

  SELECT * INTO v_s FROM public.classificacao_sessoes WHERE id = p_sessao_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.classificacao_sessoes (id, cliente_id, criado_por, arquivo, linhas_esperadas, status)
    VALUES (p_sessao_id, p_cliente_id, v_uid, nullif(btrim(p_arquivo), ''), p_linhas_esperadas, 'importando')
    RETURNING * INTO v_s;
  ELSE
    IF v_s.cliente_id <> p_cliente_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a importacao e'' de outro cliente';
    END IF;
    IF v_s.linhas_esperadas IS NOT NULL AND v_s.linhas_esperadas <> p_linhas_esperadas THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'arquivo_diferente', 'sessao_id', v_s.id,
        'linhas_esperadas', v_s.linhas_esperadas,
        'mensagem', format('Esta importacao foi aberta com %s linhas e o arquivo escolhido tem %s: escolha o mesmo arquivo.',
                           v_s.linhas_esperadas, p_linhas_esperadas));
    END IF;
    -- retomar: a incompleta (ou a 'importando' parada) volta a receber; a completa nao muda
    IF v_s.status <> 'completa' THEN
      UPDATE public.classificacao_sessoes
         SET status = 'importando', concluida_em = NULL,
             linhas_esperadas = coalesce(linhas_esperadas, p_linhas_esperadas)
       WHERE id = p_sessao_id
      RETURNING * INTO v_s;
    END IF;
  END IF;

  SELECT count(*) INTO v_rec FROM public.financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;
  RETURN jsonb_build_object('ok', true, 'sessao_id', v_s.id, 'status', v_s.status,
    'linhas_esperadas', v_s.linhas_esperadas, 'linhas_recebidas', v_rec);
END $fn$;
REVOKE ALL ON FUNCTION public.fn_classificacao_sessao_abrir(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_sessao_abrir(uuid, uuid, integer, text) TO authenticated, service_role;

-- ═══════════════════ D3 — concluir ═══════════════════
CREATE FUNCTION public.fn_classificacao_sessao_concluir(p_sessao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $fn$
DECLARE v_uid uuid; v_s public.classificacao_sessoes%ROWTYPE; v_rec integer; v_status text;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO v_s FROM public.classificacao_sessoes WHERE id = p_sessao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_nao_aberta',
      'mensagem', 'A importacao nao foi aberta: nada a concluir.');
  END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_s.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem permissao para este cliente';
  END IF;
  SELECT count(*) INTO v_rec FROM public.financeiro_classificacao_staging WHERE sessao_id = p_sessao_id;
  IF v_s.linhas_esperadas IS NULL THEN
    -- legado: nao ha' como saber o esperado; concluir nao muda o que o backfill disse
    RETURN jsonb_build_object('ok', true, 'sessao_id', v_s.id, 'status', v_s.status,
      'linhas_esperadas', NULL, 'linhas_recebidas', v_rec);
  END IF;
  v_status := CASE WHEN v_rec = v_s.linhas_esperadas THEN 'completa' ELSE 'incompleta' END;
  UPDATE public.classificacao_sessoes
     SET status = v_status, concluida_em = CASE WHEN v_status = 'completa' THEN now() END
   WHERE id = p_sessao_id;
  RETURN jsonb_build_object('ok', v_status = 'completa', 'sessao_id', v_s.id, 'status', v_status,
    'linhas_esperadas', v_s.linhas_esperadas, 'linhas_recebidas', v_rec,
    'mensagem', CASE WHEN v_status = 'completa' THEN NULL
                     ELSE format('%s de %s linhas chegaram.', v_rec, v_s.linhas_esperadas) END);
END $fn$;
REVOKE ALL ON FUNCTION public.fn_classificacao_sessao_concluir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_sessao_concluir(uuid) TO authenticated, service_role;

-- ═══════════════════ D7 — excluir: o herdado nao impede; gravacao e bloco impedem, com o motivo ═══════════════════
DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.proname = 'fn_classificacao_excluir_sessao' AND n.nspname = 'public') <> '4e2dec30571e7ef7a953deefce75a02b' THEN
    RAISE EXCEPTION 'fn_classificacao_excluir_sessao nao esta no corpo esperado. Migration abortada.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_classificacao_excluir_sessao(p_sessao_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $fn$
-- PR-CONC-ENRIQ-IMPORT-ATOMICA-01 (D7): o 'ja_aplicado' HERDADO da memoria (aplicado = false) nao e' trabalho desta
-- importacao e nao impede. Impedem so' a GRAVACAO feita nela (aplicado = true) e o BLOCO CONFERIDO dela (vivo, ou a linha
-- 'conferido_bloco'). Os casamentos manuais nao impedem, mas a simulacao os conta para a confirmacao dizer o que se perde.
DECLARE v_uid uuid; v_cli uuid; n_total int := 0; n_gravadas int := 0; n_linhas_bloco int := 0; n_blocos int := 0;
  n_resolvidos int := 0; n_apagadas int := 0; v_tem_sessao boolean; v_txt_blocos text; v_txt_grav text; v_txt text;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT cliente_id, count(*),
         count(*) FILTER (WHERE aplicado),
         count(*) FILTER (WHERE match_status = 'conferido_bloco'),
         count(*) FILTER (WHERE match_status IN ('resolvido_manual', 'resolvido_grupo', 'ambiguo_resolvido'))
    INTO v_cli, n_total, n_gravadas, n_linhas_bloco, n_resolvidos
    FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id GROUP BY cliente_id;
  SELECT true, coalesce(v_cli, s.cliente_id) INTO v_tem_sessao, v_cli FROM public.classificacao_sessoes s WHERE s.id = p_sessao_id;
  IF v_cli IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='sessao inexistente ou vazia'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cli IN (SELECT public.get_user_cliente_ids(v_uid))) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente'; END IF;
  SELECT count(*) INTO n_blocos FROM public.classificacao_blocos b WHERE b.sessao_id = p_sessao_id AND b.desfeito_em IS NULL;
  IF n_gravadas > 0 OR n_linhas_bloco > 0 OR n_blocos > 0 THEN
    -- o motivo, por extenso: "3 blocos e 1 gravação feitos nesta importação"
    IF n_blocos > 0 THEN
      v_txt_blocos := format('%s bloco%s', n_blocos, CASE WHEN n_blocos = 1 THEN '' ELSE 's' END);
    ELSIF n_linhas_bloco > 0 THEN   -- linha em bloco sem o registro do bloco (nao deveria existir; nunca some calada)
      v_txt_blocos := format('%s linha%s em bloco', n_linhas_bloco, CASE WHEN n_linhas_bloco = 1 THEN '' ELSE 's' END);
    END IF;
    IF n_gravadas > 0 THEN
      v_txt_grav := format('%s %s', n_gravadas, CASE WHEN n_gravadas = 1 THEN 'gravação' ELSE 'gravações' END);
    END IF;
    v_txt := concat_ws(' e ', v_txt_blocos, v_txt_grav) || ' ' ||
             CASE WHEN v_txt_blocos IS NOT NULL AND v_txt_grav IS NOT NULL THEN 'feitos'
                  WHEN v_txt_blocos IS NOT NULL THEN CASE WHEN greatest(n_blocos, n_linhas_bloco) = 1 THEN 'feito' ELSE 'feitos' END
                  ELSE CASE WHEN n_gravadas = 1 THEN 'feita' ELSE 'feitas' END END
             || ' nesta importação — ela não pode ser excluída.';
    RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_com_linhas_gravadas', 'linhas', n_total,
      'gravadas', n_gravadas, 'blocos', n_blocos, 'linhas_em_bloco', n_linhas_bloco, 'resolvidos', n_resolvidos,
      'simulado', p_simular, 'mensagem', v_txt);
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'linhas', n_total, 'gravadas', 0, 'resolvidos', n_resolvidos);
  END IF;
  DELETE FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id; GET DIAGNOSTICS n_apagadas = ROW_COUNT;
  DELETE FROM public.classificacao_sessoes WHERE id = p_sessao_id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'linhas', n_total, 'apagadas', n_apagadas, 'resolvidos', n_resolvidos);
END; $fn$;

DO $guarda$
DECLARE v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'fn_classificacao_excluir_sessao' AND n.nspname = 'public';
  IF v_md5 <> '5df4b0076626204e480a985f01a00ba7' THEN
    RAISE EXCEPTION 'corpo resultante inesperado (md5 %).', v_md5;
  END IF;
END $guarda$;

-- ═══════════════════ D8 — backfill das sessoes que ja' existem ═══════════════════
DO $backfill$
DECLARE
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_incompletas constant uuid[] := ARRAY[
    '53ff65d5-ac1c-4363-bd5f-01d6ff8533bc', '05f22626-46c4-473a-b0ce-2d3545081120',
    'eae81dda-5746-47bb-9e86-b4ec9cc36dc4', '6d08260f-d881-4019-a9ed-d9170f484007']::uuid[];
  v_esperadas int; v_n int;
BEGIN
  SELECT count(DISTINCT sessao_id) INTO v_esperadas FROM financeiro_classificacao_staging;
  INSERT INTO public.classificacao_sessoes (id, cliente_id, criado_em, criado_por, arquivo, linhas_esperadas, status, concluida_em)
  SELECT sessao_id, (array_agg(cliente_id))[1], max(created_at), NULL, NULL, NULL, 'completa', max(created_at)
    FROM financeiro_classificacao_staging GROUP BY sessao_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_esperadas THEN RAISE EXCEPTION 'backfill: % sessoes inseridas, % no staging', v_n, v_esperadas; END IF;

  -- as quatro do NJ que pararam em 400 de 470 (decisao do Gabriel)
  IF (SELECT count(*) FROM (SELECT sessao_id FROM financeiro_classificacao_staging
                             WHERE sessao_id = ANY (c_incompletas) AND cliente_id = c_nj
                             GROUP BY sessao_id HAVING count(*) = 400) x) <> 4 THEN
    RAISE EXCEPTION 'backfill: as quatro sessoes incompletas do NJ nao estao com 400 linhas cada';
  END IF;
  UPDATE public.classificacao_sessoes SET status = 'incompleta', linhas_esperadas = 470, concluida_em = NULL
   WHERE id = ANY (c_incompletas) AND cliente_id = c_nj;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 4 THEN RAISE EXCEPTION 'backfill: % incompletas marcadas, esperadas 4', v_n; END IF;
END $backfill$;