-- PR-CONC-MESA-CRU-EXCEL-PREVALECE-01 — na Mesa, o lancamento CRU recebe a planilha; o JA CLASSIFICADO mantem o sistema
-- (a divergencia fica visivel); o que a planilha nao resolve nunca esvazia o Resultado.
--
-- ⚠ REGRA DE PRODUTO (Gabriel, 30/09, soberana):
--   CRU = lancamento com origem 'extrato' ou 'ofx' E ainda NAO classificado (sem conta do plano), fora transferencia
--   (3-). No cru a planilha prevalece em Competencia, Data venc., Fazenda, Produto/descr., Fornecedor, Conta do plano,
--   Documento e Observacao; Data pgto, Valor, Conta bancaria e Tipo ficam do extrato (o apply_row ja os protege). Nos
--   outros, o sistema prevalece e a planilha vira so' a marca "planilha: X" na tela. Excel vazio nunca apaga.
-- ⚠ ONDE: FONTE UNICA NO BANCO, depois de o lancamento estar fixado. O populate NAO sabe o lancamento final — o
--   fn_classificacao_casar_sessao, que roda logo depois, zera o match da sessao e recasa tudo (FASE 0: 209 das 235
--   linhas com lancamento da 32c52f5c foram recasadas). Por isso a precedencia e' UMA funcao,
--   _fn_classificacao_precedencia_cru, chamada no FIM do casar e no FIM do populate (o ramo de heranca, que o casar nao
--   toca). Recasar uma sessao ja gravada (32c52f5c) aplica a regra sem reimportar.
-- ⚠ A LEITURA DA PLANILHA FICA GUARDADA EM `update_proposto._planilha` (subcentro, macro, grupo, centro, plano,
--   fornecedor, fazenda — resolvidos). A precedencia leva ao TOPO da proposta (o que o apply_row grava) so' no cru; no
--   classificado ela TIRA do topo as chaves de classificacao (o apply_row grava COALESCE(proposta, lancamento), entao
--   proposta ausente = sistema). A tela le `_planilha` pelas colunas novas da view para a marca e o contador.
-- ⚠ LINHA EDITADA A MAO (`_meta.origem_resolucao = 'manual'`) NAO E' TOCADA: o operador ja decidiu.
-- ⚠ PLANO ADMINISTRATIVO NO CRU FORCA A FAZENDA ADMINISTRATIVO (a regra de escopoDoSubcentro.ts); `_planilha` guarda a
--   fazenda que a planilha disse, para a marca.
-- ⚠ NORMALIZACAO UNICA: `_fn_normalizar_texto` = sem acento (unaccent), espacos colapsados, trim, minusculas — a mesma
--   de `normalizar` (src/v2/lib/importLanc/importLancamentosView.ts). Fazenda: apelido, depois codigo_importacao/codigo/
--   nome. Fornecedor (ativos): apelido, depois nome. Apelido que casa 2+ cadastros nao decide (ambiguo = nao resolvido).
-- ⚠ PATCHES GUARDADOS POR md5 (populate bc128ce3…, casar bf328f72…, viewdef 0d7b4b82…): cada ancora 1x, destino
--   conferido. A view ganha `security_invoker = true` (regra do CLAUDE.md para replace de view; ela estava sem).
-- ⚠ Todo UPDATE com WHERE (pg_safeupdate). As funcoes novas sao internas (sem EXECUTE para anon/authenticated); quem as
--   chama e' o populate e o casar, SECURITY DEFINER.

-- ═══ normalizacao unica e resolvedores ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._fn_normalizar_texto(p_texto text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(lower(regexp_replace(btrim(public.unaccent(COALESCE(p_texto, ''))), '\s+', ' ', 'g')), '')
$function$;

CREATE OR REPLACE FUNCTION public._fn_classificacao_resolver_fazenda(p_cliente_id uuid, p_texto text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_ids uuid[];
BEGIN
  IF v_alvo IS NULL THEN RETURN NULL; END IF;
  -- 1. o apelido ensinado no de-para (resposta explicita do operador vence o cadastro)
  SELECT array_agg(f.id) INTO v_ids FROM fazendas f
   WHERE f.cliente_id = p_cliente_id
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(f.aliases, '[]'::jsonb)) a
                  WHERE public._fn_normalizar_texto(a) = v_alvo);
  IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
  -- 2. o cadastro: codigo de importacao, codigo, nome
  SELECT array_agg(f.id) INTO v_ids FROM fazendas f
   WHERE f.cliente_id = p_cliente_id
     AND (public._fn_normalizar_texto(f.codigo_importacao) = v_alvo OR public._fn_normalizar_texto(f.codigo) = v_alvo
          OR public._fn_normalizar_texto(f.nome) = v_alvo);
  IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public._fn_classificacao_resolver_fornecedor(p_cliente_id uuid, p_texto text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_ids uuid[];
BEGIN
  IF v_alvo IS NULL THEN RETURN NULL; END IF;
  -- 1. o apelido ensinado no de-para, so' entre os ATIVOS ("Banco do Brasil" -> "Banco do Brasil S.A. (001)")
  SELECT array_agg(f.id) INTO v_ids FROM financeiro_fornecedores f
   WHERE f.cliente_id = p_cliente_id AND f.ativo = true
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(f.aliases, '[]'::jsonb)) a
                  WHERE public._fn_normalizar_texto(a) = v_alvo);
  IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
  -- 2. o nome normalizado (o que o populate ja fazia, agora sem acento e com espacos colapsados); o mais antigo desempata,
  --    como o LIMIT 1 de antes
  RETURN (SELECT f.id FROM financeiro_fornecedores f
           WHERE f.cliente_id = p_cliente_id AND f.ativo = true AND public._fn_normalizar_texto(f.nome) = v_alvo
           ORDER BY f.created_at, f.id LIMIT 1);
END;
$function$;

-- ═══ a precedencia (fonte unica) ════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._fn_classificacao_precedencia_cru(p_sessao_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  k_class CONSTANT text[] := ARRAY['subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id','favorecido_id','fazenda_id'];
  n int;
BEGIN
  WITH base AS (
    SELECT s.staging_id, s.cliente_id, s.update_proposto p, s.excel_fazenda_codigo, s.excel_fornecedor,
           -- sessao antiga (sem `_planilha`): a leitura e' a que o populate pos no topo
           COALESCE(s.update_proposto -> '_planilha', jsonb_strip_nulls(jsonb_build_object(
             'subcentro', s.update_proposto -> 'subcentro', 'macro_custo', s.update_proposto -> 'macro_custo',
             'grupo_custo', s.update_proposto -> 'grupo_custo', 'centro_custo', s.update_proposto -> 'centro_custo',
             'plano_conta_id', s.update_proposto -> 'plano_conta_id', 'favorecido_id', s.update_proposto -> 'favorecido_id'))) pl0,
           (l.origem_lancamento IN ('extrato', 'ofx') AND l.subcentro IS NULL AND l.plano_conta_id IS NULL
             AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%') AS cru,
           -- Excel vazio nunca apaga: so' entra o que a planilha tem ("-" e' o vazio da planilha, como no `vazio()` do front)
           jsonb_strip_nulls(jsonb_build_object(
             'data_competencia', s.excel_data, 'data_vencimento', s.excel_data_vencimento,
             'numero_documento', NULLIF(NULLIF(btrim(s.excel_documento), ''), '-'),
             'observacao', NULLIF(NULLIF(btrim(s.excel_observacao), ''), '-'),
             'produto', NULLIF(NULLIF(btrim(s.excel_produto), ''), '-'))) AS excel
      FROM financeiro_classificacao_staging s
      JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
     WHERE s.sessao_id = p_sessao_id AND NOT s.aplicado
       AND COALESCE(s.update_proposto -> '_meta' ->> 'origem_resolucao', '') <> 'manual'
  ), planilha AS (
    -- fazenda e fornecedor pelos resolvedores (cobre a sessao antiga, que o populate de antes nao resolvia)
    SELECT b.*, b.pl0 || jsonb_strip_nulls(jsonb_build_object(
             'fazenda_id', COALESCE(b.pl0 ->> 'fazenda_id',
                                    public._fn_classificacao_resolver_fazenda(b.cliente_id, b.excel_fazenda_codigo)::text),
             'favorecido_id', COALESCE(b.pl0 ->> 'favorecido_id',
                                       public._fn_classificacao_resolver_fornecedor(b.cliente_id, b.excel_fornecedor)::text))) AS pl
      FROM base b
  ), topo AS (
    -- no cru, plano administrativo forca a fazenda Administrativo (a planilha continua em `_planilha`)
    SELECT pl.*, CASE
             WHEN pl.cru AND EXISTS (SELECT 1 FROM financeiro_plano_contas pc
                                      WHERE pc.id = NULLIF(pl.pl ->> 'plano_conta_id', '')::uuid
                                        AND pc.escopo_negocio = 'administrativo')
             THEN pl.pl || COALESCE((SELECT jsonb_build_object('fazenda_id', f.id) FROM fazendas f
                                      WHERE f.cliente_id = pl.cliente_id AND f.nome ILIKE '%administrat%'
                                      ORDER BY f.created_at, f.id LIMIT 1), '{}'::jsonb)
             ELSE pl.pl END AS pl_topo
      FROM planilha pl
  ), novo AS (
    SELECT t.staging_id, CASE
             WHEN t.cru THEN (t.p - k_class) || t.pl_topo || t.excel || jsonb_build_object('_planilha', t.pl)
             ELSE (t.p - k_class) || jsonb_build_object('_planilha', t.pl)
           END AS proposto
      FROM topo t
  )
  UPDATE financeiro_classificacao_staging s
     SET update_proposto = novo.proposto, updated_at = now()
    FROM novo
   WHERE s.staging_id = novo.staging_id AND s.update_proposto IS DISTINCT FROM novo.proposto;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_normalizar_texto(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_resolver_fazenda(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_resolver_fornecedor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_precedencia_cru(uuid) FROM PUBLIC, anon, authenticated;

-- ═══ populate: fazenda e fornecedor pelos resolvedores; `_planilha`; precedencia no fim ════════════════════════════
DO $patch$
DECLARE
  v_src text; v_novo text; n int; i int;
  anc text[] := ARRAY[
$p1o$    v_fazenda_id := NULL;
    IF v_fazenda_codigo IS NOT NULL THEN
      SELECT id INTO v_fazenda_id FROM fazendas WHERE cliente_id = p_cliente_id AND codigo_importacao = v_fazenda_codigo LIMIT 1;
    END IF;$p1o$,
$p2o$    v_favorecido_id := NULL;
    IF v_fornecedor_txt IS NOT NULL THEN
      SELECT id INTO v_favorecido_id FROM financeiro_fornecedores WHERE cliente_id = p_cliente_id AND ativo = true AND lower(trim(nome)) = lower(v_fornecedor_txt) LIMIT 1;
    END IF;$p2o$,
$p3o$      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id)) || jsonb_build_object('_meta', v_meta);$p3o$,
$p4o$  SELECT jsonb_object_agg(match_status, qt) INTO v_counts$p4o$];
  novos text[] := ARRAY[
$p1n$    -- PR-CONC-MESA-CRU-EXCEL-PREVALECE-01: o resolvedor unico (apelido do de-para, depois o cadastro)
    v_fazenda_id := public._fn_classificacao_resolver_fazenda(p_cliente_id, v_fazenda_codigo);$p1n$,
$p2n$    -- PR-CONC-MESA-CRU-EXCEL-PREVALECE-01: o resolvedor unico (apelido do de-para, depois o nome)
    v_favorecido_id := public._fn_classificacao_resolver_fornecedor(p_cliente_id, v_fornecedor_txt);$p2n$,
$p3n$      'centro_custo', v_plano_centro, 'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id)) || jsonb_build_object('_meta', v_meta)
      -- PR-CONC-MESA-CRU-EXCEL-PREVALECE-01: a leitura da planilha, a parte; quem a leva ao topo e' a precedencia
      || jsonb_build_object('_planilha', jsonb_strip_nulls(jsonb_build_object('subcentro', v_subcentro,
           'macro_custo', v_plano_macro, 'grupo_custo', v_plano_grupo, 'centro_custo', v_plano_centro,
           'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id, 'fazenda_id', v_fazenda_id)));$p3n$,
$p4n$  -- PR-CONC-MESA-CRU-EXCEL-PREVALECE-01: a precedencia cru x classificado (o ramo de heranca ja' tem o lancamento)
  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id);

  SELECT jsonb_object_agg(match_status, qt) INTO v_counts$p4n$];
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure;
  IF md5(v_src) <> 'bc128ce3b525c49e95633b7325988ae8' THEN
    RAISE EXCEPTION 'populate: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  FOR i IN 1..array_length(anc, 1) LOOP
    n := (length(v_novo) - length(replace(v_novo, anc[i], ''))) / length(anc[i]);
    IF n <> 1 THEN RAISE EXCEPTION 'populate: ancora % casou % vezes', i, n; END IF;
    v_novo := replace(v_novo, anc[i], novos[i]);
  END LOOP;
  IF md5(v_novo) <> 'e0061022a345488424f6cd5a446da031' THEN
    RAISE EXCEPTION 'populate: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) '
       || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS ' || quote_literal(v_novo);
END
$patch$;

-- ═══ casar: precedencia no fim ══════════════════════════════════════════════════════════════════════════════════════
DO $patch$
DECLARE
  v_src text; v_novo text; n int;
  a_old text := $c1o$  SELECT count(*) INTO n_sem FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND match_status = 'sem_match';$c1o$;
  a_new text := $c1n$  -- PR-CONC-MESA-CRU-EXCEL-PREVALECE-01: com o lancamento fixado, a precedencia cru x classificado
  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id);

  SELECT count(*) INTO n_sem FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND match_status = 'sem_match';$c1n$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure;
  IF md5(v_src) <> 'bf328f72b0cfdd781c108488c3dc9828' THEN
    RAISE EXCEPTION 'casar: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  n := (length(v_src) - length(replace(v_src, a_old, ''))) / length(a_old);
  IF n <> 1 THEN RAISE EXCEPTION 'casar: ancora casou % vezes', n; END IF;
  v_novo := replace(v_src, a_old, a_new);
  IF md5(v_novo) <> '6725e204e186454cab6e69eccef3a527' THEN
    RAISE EXCEPTION 'casar: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_casar_sessao(p_sessao_id uuid, p_ano_mes text) '
       || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS ' || quote_literal(v_novo);
END
$patch$;

-- ═══ a view: a leitura da planilha e a origem do lancamento, para a tela ═══════════════════════════════════════════
DO $view$
DECLARE
  v_def text; v_novo text; n int;
  a_old text := $v1o$    (NULLIF((s.update_proposto ->> 'conta_destino_id'::text), ''::text))::uuid AS proposto_conta_destino_id
   FROM$v1o$;
  a_new text := $v1n$    (NULLIF((s.update_proposto ->> 'conta_destino_id'::text), ''::text))::uuid AS proposto_conta_destino_id,
    (NULLIF(((s.update_proposto -> '_planilha'::text) ->> 'fazenda_id'::text), ''::text))::uuid AS planilha_fazenda_id,
    ( SELECT f.nome FROM fazendas f
          WHERE (f.id = (NULLIF(((s.update_proposto -> '_planilha'::text) ->> 'fazenda_id'::text), ''::text))::uuid)) AS planilha_fazenda_nome,
    (NULLIF(((s.update_proposto -> '_planilha'::text) ->> 'favorecido_id'::text), ''::text))::uuid AS planilha_favorecido_id,
    ( SELECT ff.nome FROM financeiro_fornecedores ff
          WHERE (ff.id = (NULLIF(((s.update_proposto -> '_planilha'::text) ->> 'favorecido_id'::text), ''::text))::uuid)) AS planilha_favorecido_nome,
    ((s.update_proposto -> '_planilha'::text) ->> 'subcentro'::text) AS planilha_subcentro,
    l.origem_lancamento AS lanc_origem_lancamento
   FROM$v1n$;
BEGIN
  v_def := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(v_def) <> '0d7b4b823818b0a605caaf9527606779' THEN
    RAISE EXCEPTION 'view: definicao de origem divergente (md5 %)', md5(v_def);
  END IF;
  n := (length(v_def) - length(replace(v_def, a_old, ''))) / length(a_old);
  IF n <> 1 THEN RAISE EXCEPTION 'view: ancora casou % vezes', n; END IF;
  v_novo := replace(v_def, a_old, a_new);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || v_novo;
END
$view$;

-- ═══ conferencias ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vw_classificacao_staging_preview'
                  AND reloptions::text ILIKE '%security_invoker=true%') THEN
    RAISE EXCEPTION 'view sem security_invoker';
  END IF;
  IF has_function_privilege('anon', 'public._fn_classificacao_precedencia_cru(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_precedencia_cru(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_resolver_fornecedor(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_resolver_fazenda(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_classificacao_casar_sessao(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL aberta numa funcao de PR-CONC-MESA-CRU-EXCEL-PREVALECE-01';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_classificacao_casar_sessao(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated perdeu o EXECUTE do populate ou do casar';
  END IF;
END
$conf$;
