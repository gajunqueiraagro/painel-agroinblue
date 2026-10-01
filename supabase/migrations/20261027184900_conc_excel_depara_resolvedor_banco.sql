-- PR-CONC-EXCEL-SESSAO-E-DEPARA-01 — o de-para do passo 1 classifica pelo RESOLVEDOR DO BANCO, nao pela memoria do front.
--
-- ⚠ FASE 0 (01/10): o passo 1 marcava "a resolver" textos que o banco resolve (Fgts, Luciana A. Martins, Banco Itau,
--   IMPORCATE..., Pedagio). Causa medida: o front lia os apelidos de fornecedor com UM select sem paginacao, e o
--   PostgREST corta em 1.000 linhas — o NJ tem 3.433 fornecedores (527 com apelido). Dois resolvedores, e o do front cego.
-- ⚠ UMA IMPLEMENTACAO SO': os resolvedores de fornecedor, fazenda e safra ganham a versao `_det` (id + origem 'alias' ou
--   'cadastro'), e as funcoes de sempre passam a devolver o `id` dela. A guarda abaixo compara as duas sobre TODO texto
--   real da staging ANTES de trocar, e aborta se uma divergir ou se o conjunto comparado for vazio.
-- ⚠ A RPC DE LEITURA `fn_classificacao_depara_resolver` responde o de-para (SECURITY DEFINER, STABLE, so' SELECT; ACL:
--   authenticated, sem anon). Subcentro pelo `fn_classificacao_resolver_contexto` (regra, composto, simples, plano); chave
--   COMPOSTA "conta ⟂ safra" so' conta como resolvida pelo apelido composto — como o front fazia: ela existe justamente
--   porque o simples nao serve para aquela safra.
-- ⚠ CONTA BANCARIA FICA NO FRONT (`resolverContaPorTexto`): o resolvedor do banco so' entende "cc-NNN |", e o do front (apelido,
--   nome, agencia+numero) e' o que hoje entrega `conta_origem_id` ao populate. Unificar e' a divida ja registrada
--   ("dois resolvedores de conta que discordam") — PR de banco proprio.

-- === 1. as versoes detalhadas ===
CREATE FUNCTION public._fn_classificacao_resolver_fornecedor_det(p_cliente_id uuid, p_texto text)
RETURNS TABLE(id uuid, origem text) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
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
$f$;

CREATE FUNCTION public._fn_classificacao_resolver_fazenda_det(p_cliente_id uuid, p_texto text)
RETURNS TABLE(id uuid, origem text) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_ids uuid[];
BEGIN
  IF v_alvo IS NULL THEN RETURN; END IF;
  -- 1. o apelido ensinado no de-para (resposta explicita do operador vence o cadastro)
  SELECT array_agg(f.id) INTO v_ids FROM fazendas f
   WHERE f.cliente_id = p_cliente_id
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(f.aliases, '[]'::jsonb)) a
                  WHERE public._fn_normalizar_texto(a) = v_alvo);
  IF cardinality(v_ids) = 1 THEN id := v_ids[1]; origem := 'alias'; RETURN NEXT; RETURN; END IF;
  -- 2. o cadastro: codigo de importacao, codigo, nome
  SELECT array_agg(f.id) INTO v_ids FROM fazendas f
   WHERE f.cliente_id = p_cliente_id
     AND (public._fn_normalizar_texto(f.codigo_importacao) = v_alvo OR public._fn_normalizar_texto(f.codigo) = v_alvo
          OR public._fn_normalizar_texto(f.nome) = v_alvo);
  IF cardinality(v_ids) = 1 THEN id := v_ids[1]; origem := 'cadastro'; RETURN NEXT; END IF;
END;
$f$;

CREATE FUNCTION public._fn_classificacao_resolver_safra_det(p_cliente_id uuid, p_texto text)
RETURNS TABLE(id uuid, origem text) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_alias uuid[]; v_ids uuid[];
BEGIN
  IF v_alvo IS NULL THEN RETURN; END IF;
  -- so' as ATIVAS: apelido que aponta para safra inativa (25/26-AMD) fica "(nao resolvido)", nunca vira safra morta
  SELECT array_agg(DISTINCT sf.id) INTO v_alias FROM financeiro_safras sf
   WHERE sf.cliente_id = p_cliente_id AND sf.ativa
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(sf.aliases) = 'array' THEN sf.aliases ELSE '[]'::jsonb END) a
                  WHERE public._fn_normalizar_texto(a) = v_alvo);
  SELECT array_agg(DISTINCT sf.id) INTO v_ids FROM financeiro_safras sf
   WHERE sf.cliente_id = p_cliente_id AND sf.ativa
     AND (public._fn_normalizar_texto(sf.nome) = v_alvo OR public._fn_normalizar_texto(sf.codigo) = v_alvo
          OR sf.id = ANY(COALESCE(v_alias, '{}'::uuid[])));
  IF cardinality(v_ids) = 1 THEN
    id := v_ids[1]; origem := CASE WHEN v_ids[1] = ANY(COALESCE(v_alias, '{}'::uuid[])) THEN 'alias' ELSE 'cadastro' END;
    RETURN NEXT;
  END IF;
END;
$f$;

REVOKE ALL ON FUNCTION public._fn_classificacao_resolver_fornecedor_det(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_resolver_fazenda_det(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_resolver_safra_det(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_resolver_fornecedor_det(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_resolver_fazenda_det(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_resolver_safra_det(uuid, text) TO service_role;

-- === 2. guarda: a versao detalhada devolve o MESMO id que a de sempre, em todo texto real ===
DO $guarda$
DECLARE v_n int; v_dif int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_fornecedor(uuid,text)'::regprocedure) <> '716565e4fa0a3ea022609b3b8530d800'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_fazenda(uuid,text)'::regprocedure) <> '3a88e032f50db80d286a149c3a70557b'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_safra(uuid,text)'::regprocedure) <> 'b63fd6bb666ad670822f43e1385623e3' THEN
    RAISE EXCEPTION 'resolvedores: corpo de origem divergente';
  END IF;
  WITH t AS (
    SELECT DISTINCT cliente_id, 'fornecedor' campo, excel_fornecedor texto FROM financeiro_classificacao_staging WHERE excel_fornecedor IS NOT NULL
    UNION SELECT DISTINCT cliente_id, 'fazenda', excel_fazenda_codigo FROM financeiro_classificacao_staging WHERE excel_fazenda_codigo IS NOT NULL
    UNION SELECT DISTINCT cliente_id, 'safra', excel_safra FROM financeiro_classificacao_staging WHERE excel_safra IS NOT NULL
    UNION SELECT DISTINCT cliente_id, 'safra', excel_observacao FROM financeiro_classificacao_staging WHERE excel_observacao IS NOT NULL
  )
  SELECT count(*),
         count(*) FILTER (WHERE (CASE t.campo
            WHEN 'fornecedor' THEN public._fn_classificacao_resolver_fornecedor(t.cliente_id, t.texto)
            WHEN 'fazenda' THEN public._fn_classificacao_resolver_fazenda(t.cliente_id, t.texto)
            ELSE public._fn_classificacao_resolver_safra(t.cliente_id, t.texto) END)
           IS DISTINCT FROM (CASE t.campo
            WHEN 'fornecedor' THEN (SELECT d.id FROM public._fn_classificacao_resolver_fornecedor_det(t.cliente_id, t.texto) d)
            WHEN 'fazenda' THEN (SELECT d.id FROM public._fn_classificacao_resolver_fazenda_det(t.cliente_id, t.texto) d)
            ELSE (SELECT d.id FROM public._fn_classificacao_resolver_safra_det(t.cliente_id, t.texto) d) END))
    INTO v_n, v_dif FROM t;
  IF v_n = 0 THEN RAISE EXCEPTION 'guarda: conjunto comparado VAZIO'; END IF;
  IF v_dif > 0 THEN RAISE EXCEPTION 'guarda: % de % textos divergem entre o resolvedor e a versao detalhada', v_dif, v_n; END IF;
  RAISE NOTICE 'guarda: % textos comparados, 0 divergencias', v_n;
END
$guarda$;

-- === 3. as de sempre passam a ser o id da detalhada (uma implementacao so') ===
CREATE OR REPLACE FUNCTION public._fn_classificacao_resolver_fornecedor(p_cliente_id uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
BEGIN
  -- PR-CONC-EXCEL-SESSAO-E-DEPARA-01: a regra mora em `_det` (que tambem diz se veio do apelido ou do cadastro)
  RETURN (SELECT d.id FROM public._fn_classificacao_resolver_fornecedor_det(p_cliente_id, p_texto) d);
END;
$f$;
CREATE OR REPLACE FUNCTION public._fn_classificacao_resolver_fazenda(p_cliente_id uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
BEGIN
  -- PR-CONC-EXCEL-SESSAO-E-DEPARA-01: a regra mora em `_det`
  RETURN (SELECT d.id FROM public._fn_classificacao_resolver_fazenda_det(p_cliente_id, p_texto) d);
END;
$f$;
CREATE OR REPLACE FUNCTION public._fn_classificacao_resolver_safra(p_cliente_id uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
BEGIN
  -- PR-CONC-EXCEL-SESSAO-E-DEPARA-01: a regra mora em `_det`
  RETURN (SELECT d.id FROM public._fn_classificacao_resolver_safra_det(p_cliente_id, p_texto) d);
END;
$f$;

-- === 4. a RPC de leitura do de-para ===
CREATE FUNCTION public.fn_classificacao_depara_resolver(p_cliente_id uuid, p_textos jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_user uuid; v_sep constant text := ' ' || chr(10178) || ' ';
  v_forn jsonb; v_faz jsonb; v_saf jsonb; v_sub jsonb := '{}'::jsonb; v_t text; v_conta text; v_safra text; v_m jsonb;
BEGIN
  BEGIN v_user := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user))) THEN
    RAISE EXCEPTION 'sem_permissao para cliente %', p_cliente_id;
  END IF;

  SELECT jsonb_object_agg(x.t, jsonb_build_object('valor', d.id, 'origem', d.origem, 'rotulo', f.nome)) INTO v_forn
    FROM jsonb_array_elements_text(COALESCE(p_textos -> 'fornecedor', '[]'::jsonb)) x(t)
    CROSS JOIN LATERAL public._fn_classificacao_resolver_fornecedor_det(p_cliente_id, x.t) d
    JOIN financeiro_fornecedores f ON f.id = d.id;
  SELECT jsonb_object_agg(x.t, jsonb_build_object('valor', d.id, 'origem', d.origem, 'rotulo', f.nome)) INTO v_faz
    FROM jsonb_array_elements_text(COALESCE(p_textos -> 'fazenda', '[]'::jsonb)) x(t)
    CROSS JOIN LATERAL public._fn_classificacao_resolver_fazenda_det(p_cliente_id, x.t) d
    JOIN fazendas f ON f.id = d.id;
  SELECT jsonb_object_agg(x.t, jsonb_build_object('valor', d.id, 'origem', d.origem, 'rotulo', s.nome)) INTO v_saf
    FROM jsonb_array_elements_text(COALESCE(p_textos -> 'safra', '[]'::jsonb)) x(t)
    CROSS JOIN LATERAL public._fn_classificacao_resolver_safra_det(p_cliente_id, x.t) d
    JOIN financeiro_safras s ON s.id = d.id;

  -- subcentro: o motor da Mesa (regra, composto, simples, plano). Chave composta so' resolve pelo composto.
  FOR v_t IN SELECT jsonb_array_elements_text(COALESCE(p_textos -> 'subcentro', '[]'::jsonb)) LOOP
    IF position(v_sep IN v_t) > 0 THEN
      v_conta := split_part(v_t, v_sep, 1); v_safra := split_part(v_t, v_sep, 2);
    ELSE
      v_conta := v_t; v_safra := NULL;
    END IF;
    v_m := public.fn_classificacao_resolver_contexto(p_cliente_id,
             jsonb_build_object('subcentro', v_conta, 'safra_texto', v_safra), true);
    IF (v_m ->> 'ok')::boolean AND (v_safra IS NULL OR v_m ->> 'tier' = 'alias_composto') THEN
      v_sub := v_sub || jsonb_build_object(v_t, jsonb_build_object('valor', v_m ->> 'subcentro',
        'origem', CASE WHEN v_m ->> 'tier' IN ('alias', 'alias_composto', 'regra') THEN 'alias' ELSE 'cadastro' END,
        'rotulo', v_m ->> 'subcentro'));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('fornecedor', COALESCE(v_forn, '{}'::jsonb), 'fazenda', COALESCE(v_faz, '{}'::jsonb),
                            'safra', COALESCE(v_saf, '{}'::jsonb), 'subcentro', v_sub);
END;
$f$;
REVOKE ALL ON FUNCTION public.fn_classificacao_depara_resolver(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_depara_resolver(uuid, jsonb) TO authenticated, service_role;

-- === conferencias ===
DO $conf$
BEGIN
  IF has_function_privilege('anon', 'public.fn_classificacao_depara_resolver(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_resolver_fornecedor_det(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_resolver_fazenda_det(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_resolver_safra_det(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL aberta numa funcao de PR-CONC-EXCEL-SESSAO-E-DEPARA-01';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_classificacao_depara_resolver(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated sem EXECUTE na RPC de leitura';
  END IF;
END
$conf$;
