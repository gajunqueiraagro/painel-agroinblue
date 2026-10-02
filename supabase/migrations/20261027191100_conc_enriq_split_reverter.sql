-- PR-CONC-ENRIQ-SPLIT-REVERTER — o desmembramento ganha registro e caminho de volta, no molde do bloco N×M.
--
-- POR QUE
-- `fn_classificacao_split_substituir` cancela o consolidado, cria um filho por linha, marca as N linhas como aplicadas com
-- `estado_anterior` NULO e religa o extrato nos filhos. O elo filhos <-> consolidado vivia SO' no texto da observacao
-- ("[split: stg= consol= ofx= sessao=]") e, desde o AGRUP-2a, no `grupo_id`. Por isso o `reverter_row` responde
-- "nada a reverter" e nao havia como desfazer (a "tabela de blocos, PR 2b" nunca veio). O Gabriel exigiu o caminho de volta.
--
-- O QUE MUDA (decisoes do Gabriel, 02/10)
-- D1  `classificacao_splits` / `classificacao_split_itens`, no molde de `classificacao_blocos` / `_bloco_itens` (mesma RLS,
--     mesma ACL: authenticated so' le' pelo `tenant_ok`, escrita so' pelas funcoes). Por split: cliente, sessao,
--     consolidado, extrato, o grupo dos filhos, o VINCULO ORIGINAL do consolidado (id, tipo_aprovacao, valor) e quem/quando;
--     por item: a linha, o filho, o vinculo do filho e o `match_status`/`match_lancamento_id` que a linha tinha ANTES.
-- D2  `split_substituir` grava o registro na MESMA transacao (patch guardado por md5). Nada mais muda nela; o retorno ganha
--     `split_id`.
-- D3  `fn_classificacao_desfazer_split(p_staging_id, p_motivo, p_simular)`: qualquer linha do split desfaz o split inteiro —
--     cancela os filhos pelo dono (`fn_cancelar_lancamento_auditoria`, que desfaz o vinculo de cada um e recalcula o
--     extrato), descancela o consolidado (DESCANCELAR NAO TEM DONO GERAL: e' esta funcao, a dona do gesto, que o faz), religa
--     o consolidado pelo dono (`fn_vincular_extrato_lancamento`) e CARIMBA o `tipo_aprovacao` original no vinculo que o dono
--     devolveu (o mesmo padrao do `fn_extrato_conciliar_mes`: `ofx_cru` decide o `fn_extrato_desfazer_arquivo` e a marca
--     "cru" da tela), devolve as N linhas ao status e ao par de antes (nao aplicadas, sem estado_anterior, proposta intacta)
--     e marca o registro desfeito. `p_simular` faz tudo e desfaz (SQLSTATE 'CBSIM').
-- D4  Recusas com a frase: sem registro; ja' desfeito; motivo vazio (fora da simulacao); consolidado vivo; extrato cancelado
--     ou ignorado; linha que saiu do split por outro caminho; filho re-desmembrado; filho cancelado por outro caminho; filho
--     vinculado a OUTRO extrato; filho em grupo (IGNORANDO o grupo do proprio split); filho em bloco conferido; filho
--     gravado numa linha APLICADA de OUTRA importacao ("filho gravado na importacao de DD/MM HH:MI · reverta la' antes");
--     mes fechado do consolidado ou de algum filho.
-- D5  Filho editado depois de nascer nao impede: a resposta avisa ("K filhos foram editados; ...").
-- D6  Backfill SO' DE METADADO dos 15 desmembramentos antigos que se reconstroem inteiros (consolidado cancelado + todos os
--     filhos vivos + extrato + linhas + o vinculo original), pelo "consol=" da observacao (12 dos 15 nao tem `grupo_id`). O
--     par anterior das linhas e' INFERIDO do status (`sugestao_split` -> o consolidado; `sem_match` -> sem par), com
--     `par_inferido = true`. Ficam de fora (filhos ja' cancelados): 7cfad218 (4 de 5), 720ea2d4, add72c81, d0352371,
--     ec7b5153. Guardado por contagem (15 splits, 40 itens) e por md5 antes x depois de lancamentos, vinculos e staging.
-- D7  A view expoe no fim `split_id` (o registro VIVO da linha) e `split_desfeito`.
--
-- METODO: tabelas e funcao nova integrais; `split_substituir` e a view por patch guardado por md5 (origem, ancoras contadas,
-- destino). Nenhum UPDATE em dado de cliente.
--   fn_classificacao_split_substituir  f964b0dd398b108dd944220c40354549 -> 33f4da7b542784a16abf64b3ad3cbade
--   vw_classificacao_staging_preview   b041b03edbf792f2fc15abda63e1cf46 -> 82f6fe334feeae4024c96d0ef5b95de5

-- ═══ 1. o registro do desmembramento (D1) ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.classificacao_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  sessao_id uuid NOT NULL,
  consolidado_id uuid NOT NULL,
  extrato_id uuid NOT NULL,
  -- o grupo dos vinculos dos filhos (o desmembramento antigo pode nao ter)
  grupo_id uuid,
  -- o vinculo do consolidado ANTES do split: [{id, tipo_aprovacao, valor_aplicado}] — o que o desfazer recria
  vinculo_original jsonb NOT NULL,
  origem text NOT NULL CHECK (origem IN ('split', 'backfill')),
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  desfeito_por uuid,
  desfeito_em timestamptz,
  desfeito_motivo text,
  -- o vinculo que o desfazer criou para o consolidado
  vinculo_recriado_id uuid
);
CREATE INDEX classificacao_splits_sessao_idx ON public.classificacao_splits (sessao_id);
CREATE INDEX classificacao_splits_cliente_idx ON public.classificacao_splits (cliente_id);
CREATE INDEX classificacao_splits_consolidado_idx ON public.classificacao_splits (consolidado_id);

CREATE TABLE public.classificacao_split_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid NOT NULL REFERENCES public.classificacao_splits(id) ON DELETE CASCADE,
  staging_id uuid NOT NULL,
  filho_id uuid NOT NULL,
  vinculo_filho_id uuid,
  match_status_antes text,
  match_lancamento_id_antes uuid,
  -- backfill: o par anterior foi deduzido do status, nao gravado na hora
  par_inferido boolean NOT NULL DEFAULT false
);
CREATE INDEX classificacao_split_itens_split_idx ON public.classificacao_split_itens (split_id);
CREATE INDEX classificacao_split_itens_staging_idx ON public.classificacao_split_itens (staging_id);
CREATE INDEX classificacao_split_itens_filho_idx ON public.classificacao_split_itens (filho_id);

ALTER TABLE public.classificacao_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classificacao_split_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY classificacao_splits_select ON public.classificacao_splits
  FOR SELECT TO authenticated USING (tenant_ok(cliente_id));
CREATE POLICY classificacao_split_itens_select ON public.classificacao_split_itens
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.classificacao_splits sp
                                             WHERE sp.id = classificacao_split_itens.split_id AND tenant_ok(sp.cliente_id)));
REVOKE ALL ON TABLE public.classificacao_splits, public.classificacao_split_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.classificacao_splits, public.classificacao_split_itens TO authenticated;
GRANT ALL ON TABLE public.classificacao_splits, public.classificacao_split_itens TO service_role;

-- ═══ 2. split_substituir grava o registro (D2) — patch guardado ════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text;
  a text; b text;
BEGIN
  v_oid := 'public.fn_classificacao_split_substituir(uuid,uuid,uuid[])'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> 'f964b0dd398b108dd944220c40354549' THEN
    RAISE EXCEPTION 'split_substituir nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  -- o CONCEITO: o vinculo dos filhos nasce num INSERT so' (o loop), e o retorno e' um so'
  IF (length(v_antes) - length(replace(v_antes, 'INSERT INTO conciliacao_bancaria_itens', ''))) / length('INSERT INTO conciliacao_bancaria_itens') <> 1
     OR (length(v_antes) - length(replace(v_antes, 'RETURN jsonb_build_object(' || chr(10) || '    ''ok'', true', '')))
        / length('RETURN jsonb_build_object(' || chr(10) || '    ''ok'', true') <> 1 THEN
    RAISE EXCEPTION 'split_substituir: o INSERT do vinculo ou o retorno de sucesso nao aparece exatamente 1x';
  END IF;
  v_novo := v_antes;
  -- (a) as variaveis
  a := $t$  v_comp date; v_faz uuid; v_mes text;
BEGIN$t$;
  b := $t$  v_comp date; v_faz uuid; v_mes text;
  -- PR-CONC-ENRIQ-SPLIT-REVERTER (D1/D2): o registro do desmembramento
  v_split uuid; v_antes_linhas jsonb; v_vinc_original jsonb;
BEGIN$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'split_substituir: ancora das variaveis'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (b) a foto ANTES da execucao: o estado de cada linha e o vinculo do consolidado
  a := $t$  -- ── EXECUÇÃO (atômica)$t$;
  b := $t$  -- PR-CONC-ENRIQ-SPLIT-REVERTER (D1): o que o desfazer precisa, fotografado ANTES de qualquer escrita — o status e o par
  -- de cada linha, e o vinculo do consolidado com o extrato (o tipo_aprovacao inclusive: `ofx_cru` tem comportamento).
  SELECT jsonb_object_agg(staging_id::text, jsonb_build_object('match_status', match_status, 'match_lancamento_id', match_lancamento_id))
    INTO v_antes_linhas FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  SELECT jsonb_agg(jsonb_build_object('id', id, 'tipo_aprovacao', tipo_aprovacao, 'valor_aplicado', valor_aplicado) ORDER BY created_at, id)
    INTO v_vinc_original FROM conciliacao_bancaria_itens WHERE lancamento_id = p_lancamento_id AND desfeito_em IS NULL;

  -- ── EXECUÇÃO (atômica)$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'split_substituir: ancora da execucao'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (c) o registro, depois dos vinculos dos filhos e antes do recompute do extrato
  a := $t$  -- Recompute do status do extrato UMA vez ao final$t$;
  b := $t$  -- PR-CONC-ENRIQ-SPLIT-REVERTER (D2): o registro, na MESMA transacao
  INSERT INTO classificacao_splits (cliente_id, sessao_id, consolidado_id, extrato_id, grupo_id, vinculo_original, origem, criado_por)
  VALUES (v_cliente, p_sessao_id, p_lancamento_id, v_extrato_id, v_grupo_id, COALESCE(v_vinc_original, '[]'::jsonb), 'split', v_uid)
  RETURNING id INTO v_split;
  INSERT INTO classificacao_split_itens (split_id, staging_id, filho_id, vinculo_filho_id, match_status_antes, match_lancamento_id_antes)
  SELECT v_split, s.staging_id, s.match_lancamento_id,
         (SELECT c.id FROM conciliacao_bancaria_itens c
           WHERE c.lancamento_id = s.match_lancamento_id AND c.grupo_id = v_grupo_id AND c.desfeito_em IS NULL LIMIT 1),
         v_antes_linhas -> s.staging_id::text ->> 'match_status',
         NULLIF(v_antes_linhas -> s.staging_id::text ->> 'match_lancamento_id', '')::uuid
    FROM financeiro_classificacao_staging s
   WHERE s.staging_id = ANY(p_staging_ids);

  -- Recompute do status do extrato UMA vez ao final$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'split_substituir: ancora do recompute'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (d) o retorno ganha o id do registro
  a := $t$    'status_extrato_final', v_status
  );$t$;
  b := $t$    'status_extrato_final', v_status,
    'split_id', v_split
  );$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'split_substituir: ancora do retorno'; END IF;
  v_novo := replace(v_novo, a, b);
  EXECUTE replace(pg_get_functiondef(v_oid), v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '33f4da7b542784a16abf64b3ad3cbade' THEN
    RAISE EXCEPTION 'split_substituir: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;

-- ═══ 3. desfazer o desmembramento (D3/D4/D5) ═══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public.fn_classificacao_desfazer_split(p_staging_id uuid, p_motivo text, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid; v_sp classificacao_splits%ROWTYPE; v_cons financeiro_lancamentos_v2%ROWTYPE; v_ext extrato_bancario_v2%ROWTYPE;
  v_txt text; v_n int; v_editados int; v_ret jsonb; v_r jsonb; v_cbi uuid; v_vinc jsonb; v_motivo text;
  v_ses uuid; v_rot text; v_fil uuid; v_mes text; v_status text;
  c_simular constant boolean := coalesce(p_simular, false);
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  -- o registro VIVO do split desta linha (o mais novo: refazer depois de desfazer cria outro)
  SELECT sp.* INTO v_sp FROM classificacao_split_itens si JOIN classificacao_splits sp ON sp.id = si.split_id
   WHERE si.staging_id = p_staging_id AND sp.desfeito_em IS NULL
   ORDER BY sp.criado_em DESC LIMIT 1;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM classificacao_split_itens si WHERE si.staging_id = p_staging_id) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'split_ja_desfeito', 'mensagem', 'Este desmembramento já foi desfeito.');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_registro', 'mensagem', 'desmembramento antigo · sem registro para desfazer');
  END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_sp.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao', 'mensagem', 'Sem permissão para este cliente.');
  END IF;
  IF NOT c_simular AND NULLIF(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio', 'mensagem', 'Escreva o motivo para desfazer o desmembramento.');
  END IF;

  -- ── o consolidado, o extrato e o vinculo original
  SELECT * INTO v_cons FROM financeiro_lancamentos_v2 WHERE id = v_sp.consolidado_id;
  IF NOT FOUND OR v_cons.cancelado IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'consolidado_vivo',
      'mensagem', 'O lançamento consolidado não está mais cancelado: o desmembramento não se desfaz.');
  END IF;
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = v_sp.extrato_id;
  IF NOT FOUND OR v_ext.cancelado_em IS NOT NULL OR v_ext.ignorado_em IS NOT NULL OR v_ext.status = 'ignorado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_indisponivel',
      'mensagem', 'A linha do extrato foi cancelada ou ignorada: o vínculo do consolidado não se refaz.');
  END IF;
  IF jsonb_array_length(coalesce(v_sp.vinculo_original, '[]'::jsonb)) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'vinculo_original_ambiguo',
      'mensagem', format('O consolidado tinha %s vínculos com o extrato: o desfazer não sabe recriar.', jsonb_array_length(coalesce(v_sp.vinculo_original, '[]'::jsonb))));
  END IF;

  -- ── as linhas: cada uma ainda gravada no seu filho
  SELECT string_agg(coalesce(s.excel_linha_origem::text, i.staging_id::text), ', ' ORDER BY s.excel_linha_origem) INTO v_txt
    FROM classificacao_split_itens i LEFT JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
   WHERE i.split_id = v_sp.id
     AND (s.staging_id IS NULL OR NOT s.aplicado OR s.match_lancamento_id IS DISTINCT FROM i.filho_id);
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_fora_do_split',
      'mensagem', format('A linha %s já não está gravada no lançamento do desmembramento: desfazer recusado.', v_txt));
  END IF;

  -- ── os filhos (a linha da planilha nomeia cada um)
  SELECT string_agg(s.excel_linha_origem::text, ', ' ORDER BY s.excel_linha_origem) INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
   WHERE i.split_id = v_sp.id
     AND EXISTS (SELECT 1 FROM classificacao_splits sp2 WHERE sp2.consolidado_id = i.filho_id AND sp2.desfeito_em IS NULL);
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_redesmembrado',
      'mensagem', format('O lançamento da linha %s foi desmembrado de novo: desfaça aquele desmembramento antes.', v_txt));
  END IF;
  SELECT string_agg(s.excel_linha_origem::text, ', ' ORDER BY s.excel_linha_origem) INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
    LEFT JOIN financeiro_lancamentos_v2 f ON f.id = i.filho_id
   WHERE i.split_id = v_sp.id AND (f.id IS NULL OR f.cancelado IS TRUE);
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_cancelado',
      'mensagem', format('O lançamento da linha %s já foi cancelado por outro caminho.', v_txt));
  END IF;
  SELECT string_agg(DISTINCT s.excel_linha_origem::text, ', ') INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
    JOIN conciliacao_bancaria_itens c ON c.lancamento_id = i.filho_id AND c.desfeito_em IS NULL
   WHERE i.split_id = v_sp.id AND c.extrato_id <> v_sp.extrato_id;
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_outro_extrato',
      'mensagem', format('O lançamento da linha %s está vinculado a outra linha do extrato: desvincule antes.', v_txt));
  END IF;
  -- ⚠ O GRUPO DO PROPRIO SPLIT NAO CONTA (ajuste 4 do Gabriel): so' outro grupo recusa
  SELECT string_agg(DISTINCT s.excel_linha_origem::text, ', ') INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
    JOIN conciliacao_bancaria_itens c ON c.lancamento_id = i.filho_id AND c.desfeito_em IS NULL
   WHERE i.split_id = v_sp.id AND c.grupo_id IS NOT NULL AND c.grupo_id IS DISTINCT FROM v_sp.grupo_id;
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_em_grupo',
      'mensagem', format('O lançamento da linha %s está num grupo ou bloco de conciliação: desfaça-o antes.', v_txt));
  END IF;
  SELECT string_agg(DISTINCT s.excel_linha_origem::text, ', ') INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
   WHERE i.split_id = v_sp.id
     AND EXISTS (SELECT 1 FROM financeiro_classificacao_staging z
                  WHERE z.match_status = 'conferido_bloco' AND i.filho_id = ANY(z.match_lancamento_ids));
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_em_bloco',
      'mensagem', format('O lançamento da linha %s está num bloco conferido: desfaça o bloco antes.', v_txt));
  END IF;
  -- ⚠ FILHO GRAVADO NUMA LINHA APLICADA DE OUTRA IMPORTACAO (ajuste 5 do Gabriel): a outra importacao gravou classificacao
  --   nele; desfazer aqui apagaria o que ela gravou. A linha NAO aplicada de outra importacao nao impede (o Recasar dela a
  --   resolve: o par vira par morto e a linha volta a ser livre).
  SELECT z.sessao_id INTO v_ses
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging z
      ON (z.match_lancamento_id = i.filho_id OR i.filho_id = ANY(z.match_lancamento_ids))
   WHERE i.split_id = v_sp.id AND z.sessao_id <> v_sp.sessao_id AND z.aplicado
   ORDER BY z.created_at LIMIT 1;
  IF v_ses IS NOT NULL THEN
    SELECT to_char(min(created_at) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') INTO v_rot
      FROM financeiro_classificacao_staging WHERE sessao_id = v_ses;
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_gravado_em_outra_importacao', 'sessao_id', v_ses,
      'mensagem', format('filho gravado na importação de %s · reverta lá antes', v_rot));
  END IF;
  -- mes fechado do consolidado ou de algum filho
  SELECT x.ano_mes INTO v_mes
    FROM financeiro_lancamentos_v2 x
   WHERE (x.id = v_sp.consolidado_id OR x.id IN (SELECT i.filho_id FROM classificacao_split_itens i WHERE i.split_id = v_sp.id))
     AND EXISTS (SELECT 1 FROM financeiro_fechamentos f
                  WHERE f.cliente_id = x.cliente_id AND f.fazenda_id = x.fazenda_id
                    AND f.ano_mes = x.ano_mes AND f.status_fechamento = 'fechado')
   ORDER BY x.ano_mes LIMIT 1;
  IF v_mes IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado', 'ano_mes', v_mes,
      'mensagem', format('O mês %s está fechado: reabra antes de desfazer o desmembramento.', v_mes));
  END IF;

  -- ── o resumo (e o aviso D5)
  SELECT count(*) INTO v_n FROM classificacao_split_itens WHERE split_id = v_sp.id;
  SELECT count(*) INTO v_editados
    FROM classificacao_split_itens i JOIN financeiro_lancamentos_v2 f ON f.id = i.filho_id
   WHERE i.split_id = v_sp.id AND f.updated_at > f.created_at + interval '1 second';
  v_ret := jsonb_build_object('ok', true, 'motivo', CASE WHEN c_simular THEN 'simulado' ELSE 'desfeito' END,
    'split_id', v_sp.id, 'linhas', v_n, 'consolidado_id', v_sp.consolidado_id, 'valor_consolidado', abs(v_cons.valor),
    'filhos', (SELECT jsonb_agg(i.filho_id ORDER BY i.filho_id) FROM classificacao_split_itens i WHERE i.split_id = v_sp.id),
    'editados', v_editados,
    'avisos', CASE WHEN v_editados > 0
                   THEN jsonb_build_array(format('%s filhos foram editados; as edições no lançamento se perdem', v_editados))
                   ELSE '[]'::jsonb END,
    'mensagem', format('desfaz: %s linhas voltam · R$ %s vira um só', v_n,
                       translate(to_char(abs(v_cons.valor), 'FM999,999,990.00'), ',.', '.,')));

  -- ── execucao (atomica; a simulacao faz tudo e desfaz)
  v_motivo := 'desfazer desmembramento: ' || coalesce(NULLIF(btrim(coalesce(p_motivo, '')), ''), '(simulação)');
  BEGIN
    -- 1) os filhos, pelo dono do cancelamento com motivo (desfaz o vinculo de cada um e recalcula o extrato)
    FOR v_fil IN SELECT i.filho_id FROM classificacao_split_itens i WHERE i.split_id = v_sp.id ORDER BY i.filho_id LOOP
      PERFORM public.fn_cancelar_lancamento_auditoria(v_fil, v_motivo);
    END LOOP;
    -- 2) o consolidado volta (DESCANCELAR NAO TEM DONO GERAL: esta funcao e' a dona do gesto)
    UPDATE financeiro_lancamentos_v2
       SET cancelado = false, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL,
           updated_at = now(), updated_by = v_uid
     WHERE id = v_sp.consolidado_id;
    -- 3) o vinculo do consolidado, pelo dono do vincular, e o tipo ORIGINAL carimbado no id que ele devolveu
    v_vinc := v_sp.vinculo_original -> 0;
    v_r := public.fn_vincular_extrato_lancamento(v_sp.extrato_id, v_sp.consolidado_id, (v_vinc ->> 'valor_aplicado')::numeric, false);
    v_cbi := (v_r ->> 'cbi_id')::uuid;
    v_status := v_r ->> 'novo_status_extrato';
    UPDATE conciliacao_bancaria_itens SET tipo_aprovacao = v_vinc ->> 'tipo_aprovacao'
     WHERE id = v_cbi AND tipo_aprovacao IS DISTINCT FROM (v_vinc ->> 'tipo_aprovacao');
    -- 4) as linhas voltam ao status e ao par de antes; a proposta fica
    UPDATE financeiro_classificacao_staging s
       SET match_status = i.match_status_antes, match_lancamento_id = i.match_lancamento_id_antes, match_lancamento_ids = NULL,
           aplicado = false, aplicado_em = NULL, aplicado_por = NULL, estado_anterior = NULL, updated_at = now()
      FROM classificacao_split_itens i
     WHERE i.split_id = v_sp.id AND s.staging_id = i.staging_id;
    -- 5) o registro fica, marcado desfeito
    UPDATE classificacao_splits
       SET desfeito_por = v_uid, desfeito_em = now(), desfeito_motivo = btrim(coalesce(p_motivo, '')), vinculo_recriado_id = v_cbi
     WHERE id = v_sp.id;
    IF c_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'CBSIM', MESSAGE = 'simulacao do desfazer: desfeita';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'CBSIM' THEN
      RETURN v_ret || jsonb_build_object('status_extrato', v_status);
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'banco_recusou', 'mensagem', 'O banco recusou: ' || SQLERRM);
  END;
  RETURN v_ret || jsonb_build_object('status_extrato', v_status, 'vinculo_recriado_id', v_cbi,
    'mensagem', format('Desmembramento desfeito: %s linhas voltaram e o lançamento voltou a ser um só.', v_n));
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_classificacao_desfazer_split(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_desfazer_split(uuid, text, boolean) TO authenticated, service_role;

-- ═══ 4. a view expoe o registro (D7) — patch guardado ═════════════════════════════════════════════════════════════════
DO $v$
DECLARE
  d text;
  a_col constant text := $a$END AS safra_fora_do_periodo$a$;
BEGIN
  d := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(d) <> 'b041b03edbf792f2fc15abda63e1cf46' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview nao esta na definicao esperada (md5 %). Migration abortada.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, a_col, ''))) / length(a_col) <> 1 OR right(d, 1) <> ';' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: a ancora da ultima coluna nao casa 1x';
  END IF;
  -- (a) as duas colunas no fim
  d := replace(d, a_col, a_col || $c$,
    spl.split_id,
    COALESCE(spl.split_desfeito, false) AS split_desfeito$c$);
  -- (b) o registro por LATERAL no fim (o `;` final sai e volta): uma linha agregada por staging, sempre
  d := left(d, length(d) - 1) || $j$
     LEFT JOIN LATERAL (SELECT (array_agg(sp.id ORDER BY sp.criado_em DESC) FILTER (WHERE sp.desfeito_em IS NULL))[1] AS split_id,
                               bool_or(sp.desfeito_em IS NOT NULL) AS split_desfeito
                          FROM classificacao_split_itens si JOIN classificacao_splits sp ON sp.id = si.split_id
                         WHERE si.staging_id = s.staging_id) spl ON true$j$;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || d;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.vw_classificacao_staging_preview'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview perdeu security_invoker';
  END IF;
  IF md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass)) <> '82f6fe334feeae4024c96d0ef5b95de5' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: definicao resultante inesperada (md5 %).',
      md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass));
  END IF;
END $v$;

-- ═══ 5. backfill SO' DE METADADO dos 15 desmembramentos antigos (D6) ═══════════════════════════════════════════════════
DO $bf$
DECLARE
  v_md5_antes text; v_md5_depois text; n_sp int; n_it int; r record; v_ses uuid[]; v_grp uuid[]; v_vinc jsonb; v_filhos uuid[];
  v_split uuid; v_lin int;
BEGIN
  CREATE TEMP TABLE _bf_alvo (consolidado_id uuid, extrato_id uuid, n int) ON COMMIT DROP;
  INSERT INTO _bf_alvo VALUES
    ('087f1418-1ee3-4fe5-846f-acf911ea6d5f', '033eff33-6418-40ce-afb7-e2667af45c43', 2),
    ('0cbad0bb-87ce-406b-93b4-9635053b2336', '5212b353-f91e-4ac4-b52e-381eb4ce0308', 2),
    ('3fea113f-4964-48de-ba64-0dda6ebd9adb', '9f52c437-7b3b-4e54-95ed-354d9d124b7c', 3),
    ('4fbe40b1-2324-4d9f-b9ea-26293f9a845f', '8f47e373-3951-4185-a59d-c97e055bae0c', 4),
    ('55ca2021-834e-4fba-b8da-56b2dd119ed4', '02011cda-ca64-4519-836a-c044a7dd1f53', 2),
    ('6bcbc52d-35dd-409e-819a-507aaa97458a', 'bed307f6-f63b-47c0-9c54-bcbb7529c051', 2),
    ('aa2a62ed-b9e4-4835-b01f-2e9e518835bc', 'e0ad30f2-967c-4332-9f00-c4abf763b2ef', 2),
    ('b9ea676e-578c-4e77-bd81-18f5a292de34', 'ae941405-b994-41a9-8853-d34bff763a08', 3),
    ('c08fa075-6eb1-4d29-b915-400a12c1bc31', '18df1131-efc1-4188-8bd2-45e400e29a08', 3),
    ('c5118013-007c-4712-8d84-6b5e5adfe16c', 'c11b5b18-b552-4600-933d-26983b551f6d', 2),
    ('d47fdd8f-e400-4e81-ba8b-97120eecf0d9', 'fc9229f1-5be4-4f98-809c-2f2ea02ca56d', 5),
    ('d67ee7f6-7c76-4637-8567-9c8f21c6f4dc', 'fbe09a7d-ea09-4931-9fcf-b485859c4790', 3),
    ('dfd8ab98-c30a-45b4-a503-5164e32dd77b', '0fc3df2d-8ef5-4f88-ab52-6cac9d43309b', 2),
    ('e1dd5b9b-bbc2-4287-b078-ce66ab4edc37', '162b6da1-710d-440b-8ff0-c9875040333b', 2),
    ('e7d66018-580e-4c60-bade-d6364982e968', 'a4699176-7841-4a1f-a0a8-a93b451f6260', 3);
  -- os filhos de cada alvo: "consol=" da observacao, mesmo cliente
  CREATE TEMP TABLE _bf_filho ON COMMIT DROP AS
    SELECT a.consolidado_id, f.id AS filho_id, f.cancelado,
           substring(f.observacao from 'stg=([0-9a-f]{8})') AS stg
      FROM _bf_alvo a JOIN financeiro_lancamentos_v2 c ON c.id = a.consolidado_id
      JOIN financeiro_lancamentos_v2 f ON f.cliente_id = c.cliente_id AND f.origem_lancamento = 'mesa_split'
           AND substring(f.observacao from 'consol=([0-9a-f]{8})') = left(a.consolidado_id::text, 8);
  -- a foto de tudo o que o backfill NAO pode tocar
  SELECT md5(string_agg(t, '|' ORDER BY t)) INTO v_md5_antes FROM (
    SELECT to_jsonb(l)::text t FROM financeiro_lancamentos_v2 l
     WHERE l.id IN (SELECT consolidado_id FROM _bf_alvo UNION SELECT filho_id FROM _bf_filho)
    UNION ALL SELECT to_jsonb(c)::text FROM conciliacao_bancaria_itens c
     WHERE c.lancamento_id IN (SELECT consolidado_id FROM _bf_alvo UNION SELECT filho_id FROM _bf_filho)
    UNION ALL SELECT to_jsonb(s)::text FROM financeiro_classificacao_staging s
     WHERE s.match_lancamento_id IN (SELECT filho_id FROM _bf_filho)) x;

  FOR r IN SELECT a.*, c.cliente_id, c.cancelado, c.cancelado_em FROM _bf_alvo a JOIN financeiro_lancamentos_v2 c ON c.id = a.consolidado_id LOOP
    SELECT array_agg(filho_id) INTO v_filhos FROM _bf_filho WHERE consolidado_id = r.consolidado_id AND NOT cancelado;
    -- a sessao do split e' a das linhas do PROPRIO split (o "stg=" da observacao): outra importacao pode apontar para o filho
    -- (a e5e37afc reimportou as linhas do 4fbe40b1, nao aplicadas) e nao e' a dona do desmembramento
    SELECT array_agg(DISTINCT s.sessao_id) INTO v_ses FROM financeiro_classificacao_staging s
      JOIN _bf_filho b ON b.filho_id = s.match_lancamento_id AND b.consolidado_id = r.consolidado_id
     WHERE left(s.staging_id::text, 8) = b.stg;
    SELECT array_agg(DISTINCT c.grupo_id) FILTER (WHERE c.grupo_id IS NOT NULL) INTO v_grp
      FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = ANY(v_filhos) AND c.desfeito_em IS NULL;
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'tipo_aprovacao', c.tipo_aprovacao, 'valor_aplicado', c.valor_aplicado))
      INTO v_vinc FROM conciliacao_bancaria_itens c
     WHERE c.lancamento_id = r.consolidado_id AND c.extrato_id = r.extrato_id AND c.desfeito_motivo = 'lancamento_cancelado';
    SELECT count(*) INTO v_lin FROM financeiro_classificacao_staging s
      JOIN _bf_filho b ON b.filho_id = s.match_lancamento_id AND b.consolidado_id = r.consolidado_id
     WHERE s.aplicado AND left(s.staging_id::text, 8) = b.stg
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
                        WHERE c.lancamento_id = b.filho_id AND c.desfeito_em IS NULL AND c.extrato_id <> r.extrato_id);
    IF r.cancelado IS NOT TRUE OR coalesce(array_length(v_filhos, 1), 0) <> r.n
       OR (SELECT count(*) FROM _bf_filho WHERE consolidado_id = r.consolidado_id) <> r.n
       OR coalesce(array_length(v_ses, 1), 0) <> 1 OR coalesce(array_length(v_grp, 1), 0) > 1
       OR jsonb_array_length(coalesce(v_vinc, '[]'::jsonb)) <> 1 OR v_lin <> r.n THEN
      RAISE EXCEPTION 'backfill: o desmembramento do consolidado % nao se reconstroi inteiro (filhos %, sessoes %, grupos %, vinculos %, linhas %)',
        r.consolidado_id, array_length(v_filhos, 1), array_length(v_ses, 1), array_length(v_grp, 1),
        jsonb_array_length(coalesce(v_vinc, '[]'::jsonb)), v_lin;
    END IF;
    INSERT INTO classificacao_splits (cliente_id, sessao_id, consolidado_id, extrato_id, grupo_id, vinculo_original, origem, criado_por, criado_em)
    VALUES (r.cliente_id, v_ses[1], r.consolidado_id, r.extrato_id, v_grp[1], v_vinc, 'backfill', NULL, coalesce(r.cancelado_em, now()))
    RETURNING id INTO v_split;
    INSERT INTO classificacao_split_itens (split_id, staging_id, filho_id, vinculo_filho_id, match_status_antes, match_lancamento_id_antes, par_inferido)
    SELECT v_split, s.staging_id, s.match_lancamento_id,
           (SELECT c.id FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = s.match_lancamento_id AND c.desfeito_em IS NULL
             ORDER BY c.created_at LIMIT 1),
           s.match_status,
           CASE WHEN s.match_status = 'sugestao_split' THEN r.consolidado_id END,
           true
      FROM financeiro_classificacao_staging s
      JOIN _bf_filho b ON b.filho_id = s.match_lancamento_id AND b.consolidado_id = r.consolidado_id
     WHERE s.sessao_id = v_ses[1] AND left(s.staging_id::text, 8) = b.stg;
  END LOOP;

  SELECT count(*) INTO n_sp FROM classificacao_splits WHERE origem = 'backfill';
  SELECT count(*) INTO n_it FROM classificacao_split_itens i JOIN classificacao_splits sp ON sp.id = i.split_id WHERE sp.origem = 'backfill';
  IF n_sp <> 15 OR n_it <> 40 THEN
    RAISE EXCEPTION 'backfill: esperado 15 desmembramentos e 40 itens, veio % e %', n_sp, n_it;
  END IF;
  SELECT md5(string_agg(t, '|' ORDER BY t)) INTO v_md5_depois FROM (
    SELECT to_jsonb(l)::text t FROM financeiro_lancamentos_v2 l
     WHERE l.id IN (SELECT consolidado_id FROM _bf_alvo UNION SELECT filho_id FROM _bf_filho)
    UNION ALL SELECT to_jsonb(c)::text FROM conciliacao_bancaria_itens c
     WHERE c.lancamento_id IN (SELECT consolidado_id FROM _bf_alvo UNION SELECT filho_id FROM _bf_filho)
    UNION ALL SELECT to_jsonb(s)::text FROM financeiro_classificacao_staging s
     WHERE s.match_lancamento_id IN (SELECT filho_id FROM _bf_filho)) x;
  IF v_md5_depois IS DISTINCT FROM v_md5_antes OR v_md5_antes IS NULL THEN
    RAISE EXCEPTION 'backfill: lancamentos, vinculos ou staging mudaram (md5 % -> %)', v_md5_antes, v_md5_depois;
  END IF;
END $bf$;
