-- PR-CONC-ENRIQ-IMPORT-CUSTO-01 — testes P1–P4 + gatilhos (rodar DEPOIS da migration; tudo em ROLLBACK pelo RAISE final).
--
-- O "antigo" de cada funcao e' recriado em pg_temp: o `_det` pelo corpo integral (md5 bdc0026e), a precedencia e o populate
-- pelo patch INVERSO do corpo vivo (conferidos por md5: c30287e0 e b62d8e0e) — com as chamadas internas redirecionadas para
-- as copias antigas. Dados SINTETICOS (prefixo ZZT), no cliente da sessao mais recente com 200+ linhas; nenhuma sessao real
-- e' tocada (o populate escreve so' em duas sessoes novas, que o RAISE desfaz).
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '58s';

DO $antigos$
DECLARE v text;
BEGIN
  EXECUTE format('CREATE FUNCTION pg_temp.det_old(p_cliente_id uuid, p_texto text) RETURNS TABLE(id uuid, origem text) LANGUAGE plpgsql STABLE SET search_path TO public AS %L', $det$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_ids uuid[]; v_id uuid;
BEGIN
  IF v_alvo IS NULL THEN RETURN; END IF;
  -- 1. o apelido ensinado no de-para, so' entre os ATIVOS
  SELECT array_agg(f.id) INTO v_ids FROM financeiro_fornecedores f
   WHERE f.cliente_id = p_cliente_id AND f.ativo = true
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(f.aliases, '[]'::jsonb)) a
                  WHERE public._fn_normalizar_texto(a) = v_alvo);
  IF cardinality(v_ids) = 1 THEN id := v_ids[1]; origem := 'alias'; RETURN NEXT; RETURN; END IF;
  -- 2. o nome normalizado; o mais antigo desempata
  SELECT f.id INTO v_id FROM financeiro_fornecedores f
   WHERE f.cliente_id = p_cliente_id AND f.ativo = true AND public._fn_normalizar_texto(f.nome) = v_alvo
   ORDER BY f.created_at, f.id LIMIT 1;
  IF v_id IS NOT NULL THEN id := v_id; origem := 'cadastro'; RETURN NEXT; END IF;
END;
$det$);
  IF md5((SELECT prosrc FROM pg_proc WHERE proname = 'det_old' AND pronamespace = pg_my_temp_schema())) <> 'bdc0026e6945f5d1bd176d934cb2f947' THEN
    RAISE EXCEPTION 'det_old: corpo antigo divergente';
  END IF;
  EXECUTE $c$CREATE FUNCTION pg_temp.res_old(p_cliente_id uuid, p_texto text) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO public AS $f$
BEGIN
  RETURN (SELECT d.id FROM pg_temp.det_old(p_cliente_id, p_texto) d);
END;
$f$$c$;
  -- precedencia antiga = a de 2 argumentos viva, com o patch desfeito
  SELECT prosrc INTO v FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid,uuid[])'::regprocedure;
  IF md5(v) <> 'e532918e2b8018c698a2aa6d5a448682' THEN RAISE EXCEPTION 'precedencia viva nao e'' a do PR'; END IF;
  v := replace(v, $q$      FROM operador o
      LEFT JOIN forn fr ON fr.cliente_id = o.cliente_id AND fr.excel_fornecedor IS NOT DISTINCT FROM o.excel_fornecedor
  ), escopos AS (
$q$, $q$      FROM operador o
  ), escopos AS (
$q$);
  v := replace(v, $q$             'favorecido_id', COALESCE(o.pl0 ->> 'favorecido_id', fr.id::text),
$q$, $q$             'favorecido_id', COALESCE(o.pl0 ->> 'favorecido_id',
                                       public._fn_classificacao_resolver_fornecedor(o.cliente_id, o.excel_fornecedor)::text),
$q$);
  v := replace(v, $q$  ), forn AS MATERIALIZED (
    -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D2): uma resolucao por texto de fornecedor distinto, so' onde a planilha nao o trouxe
    -- (a mesma condicao do COALESCE abaixo); o resolvedor e' o de sempre
    SELECT d.cliente_id, d.excel_fornecedor,
           public._fn_classificacao_resolver_fornecedor(d.cliente_id, d.excel_fornecedor) AS id
      FROM (SELECT DISTINCT o.cliente_id, o.excel_fornecedor FROM operador o WHERE o.pl0 ->> 'favorecido_id' IS NULL) d
  ), planilha AS (
    -- fazenda e fornecedor pelos resolvedores (cobre a sessao antiga, que o populate de antes nao resolvia)
$q$, $q$  ), planilha AS (
    -- fazenda e fornecedor pelos resolvedores (cobre a sessao antiga, que o populate de antes nao resolvia)
$q$);
  v := replace(v, $q$     WHERE s.sessao_id = p_sessao_id AND NOT s.aplicado
       -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): o populate passa so' as linhas do lote; NULL = a sessao inteira (o Recasar)
       AND (p_staging_ids IS NULL OR s.staging_id = ANY (p_staging_ids))
$q$, $q$     WHERE s.sessao_id = p_sessao_id AND NOT s.aplicado
$q$);
  IF md5(v) <> 'c30287e0e2edfdbbdf484c998d5c76d7' THEN RAISE EXCEPTION 'precedencia antiga (inverso) com md5 %', md5(v); END IF;
  EXECUTE format('CREATE FUNCTION pg_temp.prec_old(p_sessao_id uuid) RETURNS integer LANGUAGE plpgsql SET search_path TO public AS %L',
                 replace(v, 'public._fn_classificacao_resolver_fornecedor(', 'pg_temp.res_old('));
  -- populate antigo = o vivo com o patch desfeito
  SELECT prosrc INTO v FROM pg_proc WHERE oid = 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure;
  IF md5(v) <> '93e3eb6cef55fdd7c9fdbf4576e0090b' THEN RAISE EXCEPTION 'populate vivo nao e'' o do PR'; END IF;
  v := replace(v, $q$  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): so' as linhas deste lote (as dos lotes anteriores ja' passaram por ela)
  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id, v_lote_ids);
$q$, $q$  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id);
$q$);
  v := replace(v, $q$    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING
    RETURNING staging_id INTO v_sid;
    -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): a linha entra no recorte da precedencia — a que ja' existia na sessao tambem,
    -- quando o conflito a pulou (era o que a precedencia sobre a sessao inteira fazia)
    IF v_sid IS NULL THEN
      SELECT s.staging_id INTO v_sid FROM financeiro_classificacao_staging s
       WHERE s.sessao_id = p_sessao_id AND s.excel_linha_origem = v_linha;
    END IF;
    IF v_sid IS NOT NULL THEN v_lote_ids := v_lote_ids || v_sid; END IF;
$q$, $q$    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;
$q$);
  v := replace(v, $q$    -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D2): o mesmo texto de fornecedor se resolve uma vez por chamada ('' = sem texto)
    IF v_forn_cache ? COALESCE(v_fornecedor_txt, '') THEN
      v_favorecido_id := NULLIF(v_forn_cache ->> COALESCE(v_fornecedor_txt, ''), '')::uuid;
    ELSE
      v_favorecido_id := public._fn_classificacao_resolver_fornecedor(p_cliente_id, v_fornecedor_txt);
      v_forn_cache := v_forn_cache || jsonb_build_object(COALESCE(v_fornecedor_txt, ''), COALESCE(v_favorecido_id::text, ''));
    END IF;
$q$, $q$    v_favorecido_id := public._fn_classificacao_resolver_fornecedor(p_cliente_id, v_fornecedor_txt);
$q$);
  v := replace(v, $q$  v_total int := 0; v_inseridos int := 0; v_counts jsonb := '{}'::jsonb;
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01: D2 (um texto de fornecedor, uma resolucao) e D3 (a precedencia so' das linhas do lote)
  v_forn_cache jsonb := '{}'::jsonb; v_sid uuid; v_lote_ids uuid[] := '{}'::uuid[];
$q$, $q$  v_total int := 0; v_inseridos int := 0; v_counts jsonb := '{}'::jsonb;
$q$);
  IF md5(v) <> 'b62d8e0e1e28264a833e5867bfbe4f47' THEN RAISE EXCEPTION 'populate antigo (inverso) com md5 %', md5(v); END IF;
  EXECUTE format('CREATE FUNCTION pg_temp.pop_old(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path TO public AS %L',
                 replace(replace(v, 'public._fn_classificacao_resolver_fornecedor(', 'pg_temp.res_old('),
                         'public._fn_classificacao_precedencia_cru(', 'pg_temp.prec_old('));
END
$antigos$;

DO $teste$
DECLARE
  v_cli uuid; v_ref uuid; r text := ''; x record; v_o text; v_n text; v_id uuid;
  v_sa uuid := gen_random_uuid(); v_sb uuid := gen_random_uuid(); v_rows jsonb; v_lote jsonb; i int; k int;
  ha text; hb text; na int; nb int; v_foto text[] := '{}'; v_agora text; v_p4 int := 0; a1 text; a2 text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  -- a sessao de referencia: a mais recente com 200+ linhas (so' fornece o FORMATO das linhas; nao e' tocada)
  SELECT s.sessao_id, s.cliente_id INTO v_ref, v_cli FROM financeiro_classificacao_staging s
   GROUP BY s.sessao_id, s.cliente_id HAVING count(*) >= 200 ORDER BY max(s.created_at) DESC LIMIT 1;

  -- ═══ P1 — resolvedor antigo x novo: nome exato, apelido, acento, caixa, pontuacao, vazio/NULL, nao resolvido, ambiguo, inativo
  INSERT INTO financeiro_fornecedores (cliente_id, nome, aliases, ativo) VALUES
    (v_cli, 'ZZT Ambiguo Um', '["ZZT apelido duplo"]', true), (v_cli, 'ZZT Ambiguo Dois', '["zzt APELIDO   duplo"]', true),
    (v_cli, 'ZZT Inativo Só', '["ZZT apelido do inativo"]', false), (v_cli, 'ZZT Ação Têxtil', '[]', true),
    (v_cli, 'ZZT Sem Apelido', NULL, true), (v_cli, 'ZZT Pontuação-Ltda.', '["", "  ", "ZZT Ap. com ponto"]', true);
  FOR x IN SELECT t FROM unnest(ARRAY['ZZT apelido duplo', 'ZZT Ambiguo Um', 'ZZT apelido do inativo', 'ZZT Inativo Só', 'zzt acao textil',
            'ZZT  AÇÃO   TÊXTIL', 'ZZT Sem Apelido', 'ZZT Pontuação-Ltda.', 'ZZT Pontuacao Ltda', 'ZZT Ap. com ponto', 'zzt ap. com ponto',
            'ZZT nunca existiu', '', '   ', NULL]) t LOOP
    SELECT string_agg(d.id::text || ':' || d.origem, ',') INTO v_o FROM pg_temp.det_old(v_cli, x.t) d;
    SELECT string_agg(d.id::text || ':' || d.origem, ',') INTO v_n FROM public._fn_classificacao_resolver_fornecedor_det(v_cli, x.t) d;
    IF v_o IS DISTINCT FROM v_n THEN RAISE EXCEPTION 'P1: "%" antigo % x novo %', x.t, v_o, v_n; END IF;
  END LOOP;
  -- a busca sabe achar: o ambiguo nao resolve pelo apelido, o inativo nao resolve, o acento e a caixa resolvem
  IF (SELECT count(*) FROM public._fn_classificacao_resolver_fornecedor_det(v_cli, 'ZZT apelido duplo')) <> 0
     OR (SELECT count(*) FROM public._fn_classificacao_resolver_fornecedor_det(v_cli, 'ZZT apelido do inativo')) <> 0
     OR (SELECT origem FROM public._fn_classificacao_resolver_fornecedor_det(v_cli, 'zzt acao textil')) IS DISTINCT FROM 'cadastro'
     OR (SELECT origem FROM public._fn_classificacao_resolver_fornecedor_det(v_cli, 'zzt ap. com ponto')) IS DISTINCT FROM 'alias' THEN
    RAISE EXCEPTION 'P1: algum caso conhecido nao deu o esperado';
  END IF;
  -- condicao 3: aliases NULL e vazio -> aliases_norm vazio (nunca NULL)
  IF (SELECT aliases_norm FROM financeiro_fornecedores WHERE nome = 'ZZT Sem Apelido' AND cliente_id = v_cli) IS DISTINCT FROM '{}'::text[]
     OR (SELECT aliases_norm FROM financeiro_fornecedores WHERE nome = 'ZZT Ação Têxtil' AND cliente_id = v_cli) IS DISTINCT FROM '{}'::text[]
     OR (SELECT aliases_norm FROM financeiro_fornecedores WHERE nome = 'ZZT Pontuação-Ltda.' AND cliente_id = v_cli) IS DISTINCT FROM ARRAY['zzt ap. com ponto'] THEN
    RAISE EXCEPTION 'P1: aliases_norm fora do esperado';
  END IF;
  r := r || E'P1 ok: 15 textos, antigo = novo; ambiguo e inativo nao resolvem; aliases NULL/vazio -> {}\n';

  -- ═══ P2 — o gatilho mantem o valor COMO O FRONT GRAVA (authenticated); renomear muda a resolucao na chamada seguinte
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO financeiro_fornecedores (cliente_id, nome, aliases, ativo) VALUES (v_cli, 'ZZT Front Ltda', '["ZZT Ápelido Front"]', true)
    RETURNING id INTO v_id;
  UPDATE financeiro_fornecedores SET nome = 'ZZT Front Renomeado' WHERE id = v_id;
  UPDATE financeiro_fornecedores SET aliases = '["ZZT outro apelido"]'::jsonb WHERE id = v_id;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF (SELECT nome_norm FROM financeiro_fornecedores WHERE id = v_id) IS DISTINCT FROM 'zzt front renomeado'
     OR (SELECT aliases_norm FROM financeiro_fornecedores WHERE id = v_id) IS DISTINCT FROM ARRAY['zzt outro apelido']
     OR public._fn_classificacao_resolver_fornecedor(v_cli, 'ZZT Front Ltda') IS NOT NULL
     OR public._fn_classificacao_resolver_fornecedor(v_cli, 'zzt front renomeado') IS DISTINCT FROM v_id
     OR public._fn_classificacao_resolver_fornecedor(v_cli, 'ZZT Ápelido Front') IS NOT NULL
     OR public._fn_classificacao_resolver_fornecedor(v_cli, 'ZZT Outro Apelido') IS DISTINCT FROM v_id THEN
    RAISE EXCEPTION 'P2: o gatilho nao manteve o valor ou a resolucao nao acompanhou';
  END IF;
  UPDATE financeiro_fornecedores SET ativo = false WHERE id = v_id;
  IF public._fn_classificacao_resolver_fornecedor(v_cli, 'zzt front renomeado') IS NOT NULL THEN RAISE EXCEPTION 'P2: inativo resolveu'; END IF;
  IF public._fn_fornecedor_norm_divergentes() <> 0 THEN RAISE EXCEPTION 'P2: divergencia no cadastro'; END IF;
  r := r || E'P2 ok: insert/update como authenticated mantem nome_norm/aliases_norm; renomear e trocar apelido mudam a resolucao; inativo sai\n';

  -- ═══ condicao 2 — os dois gatilhos BEFORE nao dependem um do outro: mesma linha nas duas ordens (tabela temporaria)
  CREATE TEMP TABLE _zzt_ordem_ab (LIKE public.financeiro_fornecedores INCLUDING DEFAULTS) ON COMMIT DROP;
  CREATE TEMP TABLE _zzt_ordem_ba (LIKE public.financeiro_fornecedores INCLUDING DEFAULTS) ON COMMIT DROP;
  CREATE TRIGGER a1 BEFORE INSERT OR UPDATE ON _zzt_ordem_ab FOR EACH ROW EXECUTE FUNCTION public._fn_fornecedor_norm_trg();
  CREATE TRIGGER a2 BEFORE INSERT OR UPDATE ON _zzt_ordem_ab FOR EACH ROW EXECUTE FUNCTION public.fn_normalizar_nome_fornecedor();
  CREATE TRIGGER a1 BEFORE INSERT OR UPDATE ON _zzt_ordem_ba FOR EACH ROW EXECUTE FUNCTION public.fn_normalizar_nome_fornecedor();
  CREATE TRIGGER a2 BEFORE INSERT OR UPDATE ON _zzt_ordem_ba FOR EACH ROW EXECUTE FUNCTION public._fn_fornecedor_norm_trg();
  INSERT INTO _zzt_ordem_ab (cliente_id, nome, aliases) VALUES (v_cli, 'ZZT Ordem-Ção  Ltda.', '["Ápelido Ç", ""]');
  INSERT INTO _zzt_ordem_ba (cliente_id, nome, aliases) VALUES (v_cli, 'ZZT Ordem-Ção  Ltda.', '["Ápelido Ç", ""]');
  SELECT (to_jsonb(t) - 'id')::text INTO a1 FROM _zzt_ordem_ab t;
  SELECT (to_jsonb(t) - 'id')::text INTO a2 FROM _zzt_ordem_ba t;
  IF a1 IS DISTINCT FROM a2 OR a1 NOT LIKE '%"nome_norm": "zzt ordem-cao ltda."%' OR a1 NOT LIKE '%"nome_normalizado": "ZZT ORDEM CAO LTDA"%' THEN
    RAISE EXCEPTION 'ordem dos gatilhos: % x %', a1, a2;
  END IF;
  r := r || E'gatilhos ok: as duas ordens dao a mesma linha (nome_norm e nome_normalizado cada um com a sua regra)\n';

  -- ═══ P3 / P4 — populate em 5 lotes de 50 (250 linhas no formato da sessao de referencia), antigo x novo
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('linha', excel_linha_origem, 'subcentro', excel_subcentro, 'fornecedor', excel_fornecedor,
    'produto', excel_produto, 'conta_origem', excel_conta_origem, 'conta_destino', excel_conta_destino, 'ano_mes', excel_ano_mes,
    'data', excel_data, 'valor', excel_valor, 'tipo_operacao', excel_tipo_operacao, 'fazenda_codigo', excel_fazenda_codigo,
    'observacao', excel_observacao, 'documento', excel_documento, 'safra', excel_safra, 'tipo_documento', excel_tipo_documento,
    'forma_pagamento', excel_forma_pagamento, 'status', excel_status, 'data_pagamento', excel_data_pagamento,
    'data_vencimento', excel_data_vencimento, 'conta_origem_id', conta_origem_id, 'conta_destino_id', conta_destino_id))
    ORDER BY excel_linha_origem) INTO v_rows
    FROM (SELECT * FROM financeiro_classificacao_staging WHERE sessao_id = v_ref ORDER BY excel_linha_origem LIMIT 250) s;
  FOR i IN 0..4 LOOP
    SELECT jsonb_agg(e.value) INTO v_lote FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(value, o) WHERE o > i * 50 AND o <= (i + 1) * 50;
    PERFORM pg_temp.pop_old(v_sa, v_cli, v_lote);
    PERFORM public.fn_classificacao_populate_staging(v_sb, v_cli, v_lote);
    FOR k IN 1..i LOOP
      SELECT md5(string_agg((to_jsonb(s) - 'staging_id' - 'sessao_id' - 'created_at' - 'updated_at')::text, E'\n' ORDER BY s.excel_linha_origem))
        INTO v_agora FROM financeiro_classificacao_staging s
       WHERE s.sessao_id = v_sb AND s.excel_linha_origem IN (SELECT (e.value ->> 'linha')::int FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(value, o)
                                                              WHERE o > (k - 1) * 50 AND o <= k * 50);
      IF v_agora IS DISTINCT FROM v_foto[k] THEN RAISE EXCEPTION 'P4: o lote % mudou depois do lote %', k, i + 1; END IF;
      v_p4 := v_p4 + 1;
    END LOOP;
    SELECT md5(string_agg((to_jsonb(s) - 'staging_id' - 'sessao_id' - 'created_at' - 'updated_at')::text, E'\n' ORDER BY s.excel_linha_origem))
      INTO v_agora FROM financeiro_classificacao_staging s
     WHERE s.sessao_id = v_sb AND s.excel_linha_origem IN (SELECT (e.value ->> 'linha')::int FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(value, o)
                                                            WHERE o > i * 50 AND o <= (i + 1) * 50);
    v_foto := v_foto || v_agora;
  END LOOP;
  SELECT count(*), md5(string_agg((to_jsonb(s) - 'staging_id' - 'sessao_id' - 'created_at' - 'updated_at')::text, E'\n' ORDER BY s.excel_linha_origem))
    INTO na, ha FROM financeiro_classificacao_staging s WHERE s.sessao_id = v_sa;
  SELECT count(*), md5(string_agg((to_jsonb(s) - 'staging_id' - 'sessao_id' - 'created_at' - 'updated_at')::text, E'\n' ORDER BY s.excel_linha_origem))
    INTO nb, hb FROM financeiro_classificacao_staging s WHERE s.sessao_id = v_sb;
  IF na = 0 OR na <> nb OR ha IS DISTINCT FROM hb THEN RAISE EXCEPTION 'P3: % linhas % x % linhas %', na, ha, nb, hb; END IF;
  -- a prova de que o P3 sabe achar: mexer numa linha do lado novo muda o md5
  UPDATE financeiro_classificacao_staging SET update_proposto = update_proposto || '{"_zzt": 1}'::jsonb
   WHERE sessao_id = v_sb AND excel_linha_origem = (SELECT min(excel_linha_origem) FROM financeiro_classificacao_staging WHERE sessao_id = v_sb);
  SELECT md5(string_agg((to_jsonb(s) - 'staging_id' - 'sessao_id' - 'created_at' - 'updated_at')::text, E'\n' ORDER BY s.excel_linha_origem))
    INTO v_agora FROM financeiro_classificacao_staging s WHERE s.sessao_id = v_sb;
  IF v_agora = ha THEN RAISE EXCEPTION 'P3: a comparacao nao enxerga mudanca'; END IF;
  r := r || format(E'P3 ok: %s x %s linhas, md5 %s identico (mutacao percebida) | P4 ok: %s comparacoes de lote anterior, 0 mudancas', na, nb, ha, v_p4);
  RAISE EXCEPTION 'IMPORT-CUSTO-01 TESTES OK (rollback)%', E'\n' || r;
END
$teste$;
ROLLBACK;

