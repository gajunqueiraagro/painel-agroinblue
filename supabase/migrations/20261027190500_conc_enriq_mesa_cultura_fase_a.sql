-- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A — a Mesa do Enriquecer passa a conhecer CULTURA e FASE (so' banco; a tela e' o PR B).
--
-- POR QUE
-- O lancamento tem `cultura` e `fase` (CHECK de valor), o modal do Financeiro as grava, e a Mesa nao: nenhuma funcao do
-- Enriquecer as citava (apply_row, reverter_row, populate, precedencia, editar_proposto, split) e a view nao as expunha.
-- A planilha nao tem coluna de cultura, mas 125 das 509 linhas da 8d6efeb7 trazem a cultura no texto da Safra
-- ("Amendoim 2025/2026" 64, "Mandioca 2025/2026" 61), que se perdia ao resolver a safra (as duas sao apelidos de
-- "Safra 25/26 Lavoura"). Fase nao tem fonte na planilha.
--
-- O QUE MUDA (decisoes D1-D9 do Gabriel)
-- D1  `_fn_lancamento_cultura_fase_coerente` + gatilho BEFORE INSERT OR UPDATE `trg_zz_cultura_fase_coerente`: cultura so' em
--     agricultura, fase so' em pecuaria (o resto vira NULL). Dono UNICO da coerencia, para todo escritor. Dispara DEPOIS de
--     `trg_resolve_classificacao_plano` (que escreve `escopo_negocio`) e antes de `trg_zzz_materializar_dre_lcdpr` — a ordem
--     dos BEFORE e' a alfabetica do nome. Medido em 02/10: zero lancamentos incoerentes no proto (1.144 com cultura ou fase).
--     `culturaParaGravar`/`faseParaGravar` (src/lib/agri/rateioLancamento.ts) viram ESPELHO declarado.
-- D2  `_fn_culturas_lancamento()`: as seis de CULTURAS_LANCAMENTO (sem eucalipto) — espelho do front, usada pela validacao e
--     pela derivacao. Fase: cria/recria/engorda (o CHECK).
-- D3  editar_proposto aceita `cultura` e `fase` (vazio tira a proposta; valor fora da lista e' recusado).
-- D4  apply_row grava COALESCE(proposta, lancamento) nas duas (no conservador, COALESCE(lancamento, proposta), como os
--     vizinhos); o gatilho de D1 faz a coerencia com a atividade final.
-- D5  precedencia: `cultura` entra em `k_class` — no CRU a da planilha sobe a' proposta; no CLASSIFICADO ela sai do topo.
-- D6  `estado_anterior` guarda cultura e fase; reverter_row as devolve SO' quando a chave existe (linha aplicada antes deste
--     PR fica como esta': chave ausente nao e' NULL).
-- D7  `_fn_classificacao_cultura_da_planilha(texto da safra, safra resolvida)`: a cultura sai do TEXTO, como palavra
--     inteira, pela normalizacao unica (`_fn_normalizar_texto`), so' quando a safra resolvida e' de agricultura e o texto casa
--     com UMA cultura. Fase nunca se deriva. Mora em `update_proposto._planilha.cultura` (sem coluna nova). O populate a
--     grava; a precedencia a completa nas sessoes antigas (o Recasar a recalcula — D10).
-- D8  a view ganha NO FIM: lanc_cultura, lanc_fase, planilha_cultura, proposto_cultura, proposto_fase.
-- D9  split copia cultura e fase para os filhos, COALESCE(proposta, consolidado).
--
-- METODO: patch guardado por md5 de origem em cada funcao (ancoras contadas, destino conferido); CREATE OR REPLACE pelo
-- `pg_get_functiondef` com o corpo trocado — atributos e ACL ficam como estao. Nenhum UPDATE em dado de cliente.
--   editar_proposto   02984aadd0c2192da98c8ac43acda61d -> 8a5867379bd33018c8b865b78416fc20
--   apply_row         44dd24be1f81203b6a1d133fc9a5ac68 -> 85cc0df6d66ae1f9793cfc28f44f784d
--   reverter_row      05aec8a9a37b7e472cf4116680d84733 -> 763c5cf5e8c588d1da60e56a1bf8cd0a
--   precedencia_cru   64512c58d234e7f1b30872e96a63c07f -> 65bcb707b87f19e8d3f1363a99c2c0b4
--   split_substituir  dfe12957820f26d4192a5f7a56134be0 -> f964b0dd398b108dd944220c40354549
--   populate_staging  694ddc8baadae71b1d59de92a65c35b3 -> b62d8e0e1e28264a833e5867bfbe4f47
--   view (definicao)  41fd364c60c61b973f31261ef324805f -> efc468cb7a2c324b804a9c5b3af3f228
--   novas: _fn_culturas_lancamento 1c16c66e…, _fn_classificacao_cultura_da_planilha 6914bcce…,
--          _fn_lancamento_cultura_fase_coerente 69956e03…

-- ═══ 1. as listas e a derivacao (D2, D7) ═════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_culturas_lancamento()
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $fn$
  -- ESPELHO de CULTURAS_LANCAMENTO (src/lib/agri/rateioLancamento.ts): as seis da lavoura; eucalipto e' silvicultura.
  SELECT ARRAY['amendoim','mandioca','soja','milho','cana','outras']
$fn$;
COMMENT ON FUNCTION public._fn_culturas_lancamento() IS
  'PR-CONC-ENRIQ-MESA-CULTURA-FASE-A: as culturas do lancamento de lavoura (espelho de CULTURAS_LANCAMENTO; sem eucalipto).';
REVOKE ALL ON FUNCTION public._fn_culturas_lancamento() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_culturas_lancamento() TO service_role;

CREATE FUNCTION public._fn_classificacao_cultura_da_planilha(p_texto text, p_safra_id uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  -- Sem palpite: so' com a safra resolvida de AGRICULTURA e o texto casando com UMA cultura, como palavra inteira.
  SELECT CASE WHEN count(*) = 1 THEN min(c) END
    FROM unnest(public._fn_culturas_lancamento()) AS c
   WHERE p_safra_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.financeiro_safras sf WHERE sf.id = p_safra_id AND sf.escopo_negocio = 'agricultura')
     AND COALESCE(public._fn_normalizar_texto(p_texto), '') ~ ('(^|[^a-z0-9])' || c || '([^a-z0-9]|$)')
$fn$;
COMMENT ON FUNCTION public._fn_classificacao_cultura_da_planilha(text, uuid) IS
  'PR-CONC-ENRIQ-MESA-CULTURA-FASE-A: a cultura que o texto da Safra da planilha nomeia (uma so'', palavra inteira), so'' em safra de agricultura.';
REVOKE ALL ON FUNCTION public._fn_classificacao_cultura_da_planilha(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_cultura_da_planilha(text, uuid) TO service_role;

-- ═══ 2. o dono da coerencia (D1) ═════════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_lancamento_cultura_fase_coerente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Um custo de pecuaria nao tem cultura, e vice-versa; silvicultura e administrativo nao tem nenhum dos dois.
  IF NEW.cultura IS NOT NULL AND NEW.escopo_negocio IS DISTINCT FROM 'agricultura' THEN NEW.cultura := NULL; END IF;
  IF NEW.fase IS NOT NULL AND NEW.escopo_negocio IS DISTINCT FROM 'pecuaria' THEN NEW.fase := NULL; END IF;
  RETURN NEW;
END;
$fn$;
COMMENT ON FUNCTION public._fn_lancamento_cultura_fase_coerente() IS
  'PR-CONC-ENRIQ-MESA-CULTURA-FASE-A: cultura so'' em agricultura, fase so'' em pecuaria — dono unico da coerencia (o front espelha em culturaParaGravar/faseParaGravar).';
REVOKE ALL ON FUNCTION public._fn_lancamento_cultura_fase_coerente() FROM PUBLIC, anon, authenticated;
-- a ordem dos BEFORE e' a alfabetica: depois de trg_resolve_classificacao_plano (escopo_negocio), antes de trg_zzz_*
CREATE TRIGGER trg_zz_cultura_fase_coerente
  BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_lancamento_cultura_fase_coerente();

-- ═══ 3. as RPCs — patch guardado por md5 ════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text; v_def text;
  conta int;
  -- troca exatamente 1x (ou n vezes) e aborta se a ancora nao casar
  a text; b text;
BEGIN
  -- ── editar_proposto (D3)
  v_oid := 'public.fn_classificacao_editar_proposto(uuid,jsonb)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '02984aadd0c2192da98c8ac43acda61d' THEN
    RAISE EXCEPTION 'editar_proposto nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$    'tipo_documento','forma_pagamento'];$t$;
  b := $t$    'tipo_documento','forma_pagamento','cultura','fase'];$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'editar_proposto: ancora c_editaveis'; END IF;
  v_novo := replace(v_novo, a, b);
  a := $t$  IF array_length(v_aplicados, 1) IS NULL THEN$t$;
  b := $t$  -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D2/D3): cultura (a lista do Novo Lancamento, sem eucalipto) e fase (o CHECK).
  -- Vazio tira a proposta; valor fora da lista e' recusado e nao conta como aplicado.
  IF p_patch ? 'cultura' THEN
    IF NULLIF(trim(p_patch->>'cultura'), '') IS NULL THEN v_prop := v_prop - 'cultura'; v_aplicados := array_append(v_aplicados, 'cultura');
    ELSIF NOT (lower(trim(p_patch->>'cultura')) = ANY (public._fn_culturas_lancamento())) THEN
      v_rejeitados := v_rejeitados || jsonb_build_object('cultura', 'cultura_invalida');
    ELSE v_prop := v_prop || jsonb_build_object('cultura', lower(trim(p_patch->>'cultura'))); v_aplicados := array_append(v_aplicados, 'cultura'); END IF;
  END IF;
  IF p_patch ? 'fase' THEN
    IF NULLIF(trim(p_patch->>'fase'), '') IS NULL THEN v_prop := v_prop - 'fase'; v_aplicados := array_append(v_aplicados, 'fase');
    ELSIF NOT (lower(trim(p_patch->>'fase')) = ANY (ARRAY['cria','recria','engorda'])) THEN
      v_rejeitados := v_rejeitados || jsonb_build_object('fase', 'fase_invalida');
    ELSE v_prop := v_prop || jsonb_build_object('fase', lower(trim(p_patch->>'fase'))); v_aplicados := array_append(v_aplicados, 'fase'); END IF;
  END IF;

  IF array_length(v_aplicados, 1) IS NULL THEN$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'editar_proposto: ancora do nada_aplicado'; END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '8a5867379bd33018c8b865b78416fc20' THEN
    RAISE EXCEPTION 'editar_proposto: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;

  -- ── apply_row (D4, D6)
  v_oid := 'public.fn_classificacao_apply_row(uuid,boolean)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '44dd24be1f81203b6a1d133fc9a5ac68' THEN
    RAISE EXCEPTION 'apply_row nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$    'tipo_documento', v_lanc.tipo_documento, 'forma_pagamento', v_lanc.forma_pagamento));$t$;
  b := $t$    'tipo_documento', v_lanc.tipo_documento, 'forma_pagamento', v_lanc.forma_pagamento,
    -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D6): o reverter devolve as duas
    'cultura', v_lanc.cultura, 'fase', v_lanc.fase));$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'apply_row: ancora do estado_anterior'; END IF;
  v_novo := replace(v_novo, a, b);
  a := $t$      forma_pagamento = COALESCE(NULLIF(v_proposto->>'forma_pagamento',''), forma_pagamento),
      updated_at = now() WHERE id = v_lanc.id;$t$;
  b := $t$      forma_pagamento = COALESCE(NULLIF(v_proposto->>'forma_pagamento',''), forma_pagamento),
      -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D4): ausente = sistema, nunca apaga; a coerencia com a atividade e' do gatilho
      cultura = COALESCE(NULLIF(v_proposto->>'cultura',''), cultura),
      fase = COALESCE(NULLIF(v_proposto->>'fase',''), fase),
      updated_at = now() WHERE id = v_lanc.id;$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'apply_row: ancora do overwrite'; END IF;
  v_novo := replace(v_novo, a, b);
  a := $t$      forma_pagamento = COALESCE(forma_pagamento, NULLIF(v_proposto->>'forma_pagamento','')),
      updated_at = now() WHERE id = v_lanc.id;$t$;
  b := $t$      forma_pagamento = COALESCE(forma_pagamento, NULLIF(v_proposto->>'forma_pagamento','')),
      cultura = COALESCE(cultura, NULLIF(v_proposto->>'cultura','')),
      fase = COALESCE(fase, NULLIF(v_proposto->>'fase','')),
      updated_at = now() WHERE id = v_lanc.id;$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'apply_row: ancora do conservador'; END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '85cc0df6d66ae1f9793cfc28f44f784d' THEN
    RAISE EXCEPTION 'apply_row: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;

  -- ── reverter_row (D6)
  v_oid := 'public.fn_classificacao_reverter_row(uuid)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '05aec8a9a37b7e472cf4116680d84733' THEN
    RAISE EXCEPTION 'reverter_row nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$    numero_documento = CASE WHEN v_estado ? 'numero_documento' THEN v_estado->>'numero_documento' ELSE numero_documento END,$t$;
  b := $t$    numero_documento = CASE WHEN v_estado ? 'numero_documento' THEN v_estado->>'numero_documento' ELSE numero_documento END,
    -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D6): so' com a chave (linha aplicada antes do PR fica como esta')
    cultura = CASE WHEN v_estado ? 'cultura' THEN v_estado->>'cultura' ELSE cultura END,
    fase = CASE WHEN v_estado ? 'fase' THEN v_estado->>'fase' ELSE fase END,$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'reverter_row: ancora'; END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '763c5cf5e8c588d1da60e56a1bf8cd0a' THEN
    RAISE EXCEPTION 'reverter_row: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;

  -- ── precedencia do cru (D5, D7 nas sessoes antigas)
  v_oid := 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '64512c58d234e7f1b30872e96a63c07f' THEN
    RAISE EXCEPTION 'precedencia_cru nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$                                   'safra_id','tipo_documento','forma_pagamento'];$t$;
  b := $t$                                   'safra_id','tipo_documento','forma_pagamento',
                                   -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D5): a cultura da planilha, como a safra
                                   'cultura'];$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'precedencia_cru: ancora k_class'; END IF;
  v_novo := replace(v_novo, a, b);
  a := $t$    SELECT s.staging_id, s.cliente_id, s.update_proposto p, s.excel_fazenda_codigo, s.excel_fornecedor,$t$;
  b := $t$    SELECT s.staging_id, s.cliente_id, s.update_proposto p, s.excel_fazenda_codigo, s.excel_fornecedor, s.excel_safra,$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'precedencia_cru: ancora do base'; END IF;
  v_novo := replace(v_novo, a, b);
  a := $t$                                       public._fn_classificacao_resolver_fornecedor(b.cliente_id, b.excel_fornecedor)::text))) AS pl$t$;
  b := $t$                                       public._fn_classificacao_resolver_fornecedor(b.cliente_id, b.excel_fornecedor)::text),
             -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D7): a sessao importada antes do PR ganha a cultura no Recasar
             'cultura', COALESCE(b.pl0 ->> 'cultura',
                                 public._fn_classificacao_cultura_da_planilha(b.excel_safra, NULLIF(b.pl0 ->> 'safra_id', '')::uuid)))) AS pl$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'precedencia_cru: ancora do planilha'; END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '65bcb707b87f19e8d3f1363a99c2c0b4' THEN
    RAISE EXCEPTION 'precedencia_cru: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;

  -- ── split (D9)
  v_oid := 'public.fn_classificacao_split_substituir(uuid,uuid,uuid[])'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> 'dfe12957820f26d4192a5f7a56134be0' THEN
    RAISE EXCEPTION 'split_substituir nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$      safra_id, tipo_documento, forma_pagamento,
      origem_lancamento, created_by, sem_movimentacao_caixa$t$;
  b := $t$      safra_id, tipo_documento, forma_pagamento,
      cultura, fase,
      origem_lancamento, created_by, sem_movimentacao_caixa$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'split: ancora das colunas'; END IF;
  v_novo := replace(v_novo, a, b);
  a := $t$      COALESCE(NULLIF(v_s.update_proposto->>'forma_pagamento', ''), v_lan.forma_pagamento),
      'mesa_split', v_uid, false$t$;
  b := $t$      COALESCE(NULLIF(v_s.update_proposto->>'forma_pagamento', ''), v_lan.forma_pagamento),
      -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D9): COALESCE(proposta, consolidado); a coerencia e' do gatilho
      COALESCE(NULLIF(v_s.update_proposto->>'cultura', ''), v_lan.cultura),
      COALESCE(NULLIF(v_s.update_proposto->>'fase', ''), v_lan.fase),
      'mesa_split', v_uid, false$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'split: ancora dos valores'; END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> 'f964b0dd398b108dd944220c40354549' THEN
    RAISE EXCEPTION 'split: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;

  -- ── populate (D7)
  v_oid := 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '694ddc8baadae71b1d59de92a65c35b3' THEN
    RAISE EXCEPTION 'populate nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $t$           'forma_pagamento', public._fn_classificacao_forma_pagamento(v_forma_txt))));$t$;
  b := $t$           'forma_pagamento', public._fn_classificacao_forma_pagamento(v_forma_txt),
           -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D7): a cultura que o texto da Safra nomeia (fase nunca se deriva)
           'cultura', public._fn_classificacao_cultura_da_planilha(v_safra_txt, v_safra_id))));$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'populate: ancora do _planilha'; END IF;
  v_novo := replace(v_novo, a, b);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE replace(v_def, v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> 'b62d8e0e1e28264a833e5867bfbe4f47' THEN
    RAISE EXCEPTION 'populate: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;

-- ═══ 4. a view (D8) — colunas novas NO FIM, patch guardado por md5 ═══════════════════════════════════════════════════
DO $v$
DECLARE
  d text;
  a constant text := $a$l.cancelado AS lanc_cancelado
   FROM ($a$;
BEGIN
  d := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(d) <> '41fd364c60c61b973f31261ef324805f' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview nao esta na definicao esperada (md5 %). Migration abortada.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: a ancora do fim do SELECT nao casa exatamente 1x';
  END IF;
  d := replace(d, a, $b$l.cancelado AS lanc_cancelado,
    l.cultura AS lanc_cultura,
    l.fase AS lanc_fase,
    ((s.update_proposto -> '_planilha'::text) ->> 'cultura'::text) AS planilha_cultura,
    (s.update_proposto ->> 'cultura'::text) AS proposto_cultura,
    (s.update_proposto ->> 'fase'::text) AS proposto_fase
   FROM ($b$);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || d;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.vw_classificacao_staging_preview'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview perdeu security_invoker';
  END IF;
  IF md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass)) <> 'efc468cb7a2c324b804a9c5b3af3f228' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: definicao resultante inesperada (md5 %).',
      md5(pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass));
  END IF;
END $v$;
