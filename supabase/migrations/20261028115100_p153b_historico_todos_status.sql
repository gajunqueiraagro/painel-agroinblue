-- P153b (Gabriel 29/10, D2 OK em 29/10) — "Procurar no histórico" acha TODOS os status, não só o realizado: o em aberto do período se
-- CASA (a tela oferece "Casar"), o passado se usa de modelo ("Criar igual"). A tela ganha as colunas Comp. · Venc. · Pgto. · Status e a
-- fazenda pelo CÓDIGO.
--
-- ESTADO ANTERIOR: fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric)  md5(prosrc) = fd36c0e5f37b4945805839343bfc8274
--   (P153, migrations 20261028115070/115080: só `status_transacao = 'realizado'`, período por `data_pagamento`).
--
-- O QUE MUDA (só o corpo; assinatura, SECURITY DEFINER, search_path, plan_cache_mode e ACL iguais; nenhum dado)
--   · todos os status vivos (`cancelado IS NOT TRUE`); o período e a ordem ("mais recente primeiro") pela data de referência =
--     pagamento, ou o vencimento de quem não foi pago;
--   · cada achado ganha `data_competencia`, `data_vencimento`, `status_transacao`, `conciliado` (vínculo vivo com extrato) e
--     `fazenda_codigo`; a CONTA passa a ser a do lado do lançamento (entrada: `conta_destino_id`; saída e transferência:
--     `conta_bancaria_id`) — antes a entrada vinha sem conta, porque o gatilho `trg_00_conta_por_direcao` a guarda no destino;
--   · o RESUMO da faixa amarela ("o fornecedor costuma ser Y, N vezes desde …") continua só com o que foi PAGO (realizado e
--     conciliado), como antes: o que costuma ser é o que aconteceu, não o previsto.
--   · continua: busca sem acento (`_fn_normalizar_texto`), os 3 lugares, LIMIT 50, o mais perto do valor primeiro quando há valor.

DO $mig$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_historico_buscar(uuid,text,text[],date,date,numeric)'::regprocedure)
     <> 'fd36c0e5f37b4945805839343bfc8274' THEN
    RAISE EXCEPTION 'P153b: fn_conciliacao_historico_buscar com corpo de origem inesperado';
  END IF;
END $mig$;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_historico_buscar(p_cliente uuid, p_termo text,
  p_onde text[] DEFAULT ARRAY['banco'::text, 'descricao'::text, 'fornecedor'::text], p_de date DEFAULT NULL::date,
  p_ate date DEFAULT NULL::date, p_valor numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_t text := coalesce(public._fn_normalizar_texto(p_termo), '');
  v_banco boolean := 'banco' = ANY (coalesce(p_onde, '{}'::text[]));
  v_desc boolean := 'descricao' = ANY (coalesce(p_onde, '{}'::text[]));
  v_forn boolean := 'fornecedor' = ANY (coalesce(p_onde, '{}'::text[]));
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_onde IS NULL OR NOT (p_onde <@ ARRAY['banco', 'descricao', 'fornecedor']) THEN
    RAISE EXCEPTION 'onde invalido: %', p_onde USING ERRCODE = '22023';
  END IF;
  IF length(v_t) < 2 OR NOT (v_banco OR v_desc OR v_forn) THEN
    RETURN jsonb_build_object('total', 0, 'achados', '[]'::jsonb, 'resumo', NULL);
  END IF;

  WITH l AS (
    -- P153b: todos os status vivos; a data de referencia e' o pagamento, ou o vencimento de quem nao foi pago
    SELECT l.id, l.data_pagamento, l.data_vencimento, l.data_competencia, l.status_transacao,
           coalesce(l.data_pagamento, l.data_vencimento) data_ref,
           l.descricao, l.favorecido_id, l.plano_conta_id, l.fazenda_id,
           CASE WHEN l.tipo_operacao LIKE '1-%' THEN coalesce(l.conta_destino_id, l.conta_bancaria_id) ELSE l.conta_bancaria_id END conta_id,
           CASE WHEN l.sinal = '-1' THEN -l.valor ELSE l.valor END va
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE
       AND (p_de IS NULL OR coalesce(l.data_pagamento, l.data_vencimento) >= p_de)
       AND (p_ate IS NULL OR coalesce(l.data_pagamento, l.data_vencimento) <= p_ate)
  ), b AS (
    -- o texto do banco casado com o lançamento: o do movimento mais recente, se houver mais de um
    SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, e.descricao banco
      FROM public.conciliacao_bancaria_itens i
      JOIN public.extrato_bancario_v2 e ON e.id = i.extrato_id AND e.cliente_id = p_cliente
     WHERE i.cliente_id = p_cliente AND i.desfeito_em IS NULL AND e.cancelado_em IS NULL AND e.status <> 'ignorado'
       AND i.lancamento_id IN (SELECT l.id FROM l)
     ORDER BY i.lancamento_id, e.data_movimento DESC, e.id
  ), c AS (
    SELECT l.*, b.banco, f.nome fornecedor,
           (v_banco AND b.banco IS NOT NULL AND strpos(coalesce(public._fn_normalizar_texto(b.banco), ''), v_t) > 0) casa_banco,
           (v_desc AND strpos(coalesce(public._fn_normalizar_texto(l.descricao), ''), v_t) > 0) casa_desc,
           (v_forn AND f.id IS NOT NULL AND strpos(coalesce(f.nome_norm, ''), v_t) > 0) casa_forn
      FROM l
      LEFT JOIN b ON b.lancamento_id = l.id
      LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id AND f.cliente_id = p_cliente
  ), a AS (
    SELECT * FROM c WHERE casa_banco OR casa_desc OR casa_forn
  ), top AS (
    SELECT a.* FROM a
     ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(a.va - p_valor) END, a.data_ref DESC NULLS LAST, a.id
     LIMIT 50
  ), r AS (
    -- a faixa amarela: o que COSTUMA ser e' o que foi pago (como antes do P153b)
    SELECT a.favorecido_id, a.fornecedor, count(*) n, min(a.data_pagamento) desde
      FROM a WHERE a.favorecido_id IS NOT NULL AND a.status_transacao IN ('realizado', 'conciliado')
     GROUP BY a.favorecido_id, a.fornecedor
     ORDER BY count(*) DESC, min(a.data_pagamento), a.favorecido_id
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'achados', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lancamento_id', t.id, 'data_pagamento', t.data_pagamento, 'data_vencimento', t.data_vencimento,
               'data_competencia', t.data_competencia, 'status_transacao', t.status_transacao,
               'conciliado', EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                                      WHERE ci.lancamento_id = t.id AND ci.cliente_id = p_cliente AND ci.desfeito_em IS NULL),
               'banco', t.banco, 'descricao', t.descricao,
               'fornecedor_id', t.favorecido_id, 'fornecedor', t.fornecedor,
               'plano_conta_id', t.plano_conta_id, 'centro', p.centro_custo, 'subcentro', p.subcentro,
               'fazenda_id', t.fazenda_id, 'fazenda', fz.nome, 'fazenda_codigo', fz.codigo,
               'conta_bancaria_id', t.conta_id, 'conta', coalesce(cb.nome_exibicao, cb.nome_conta),
               'valor', t.va,
               'onde', to_jsonb(array_remove(ARRAY[CASE WHEN t.casa_banco THEN 'banco' END, CASE WHEN t.casa_desc THEN 'descricao' END,
                                                   CASE WHEN t.casa_forn THEN 'fornecedor' END], NULL)))
             ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(t.va - p_valor) END, t.data_ref DESC NULLS LAST, t.id)
        FROM top t
        LEFT JOIN public.financeiro_plano_contas p ON p.id = t.plano_conta_id
        LEFT JOIN public.fazendas fz ON fz.id = t.fazenda_id AND fz.cliente_id = p_cliente
        LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = t.conta_id AND cb.cliente_id = p_cliente), '[]'::jsonb),
    'resumo', (SELECT jsonb_build_object('fornecedor_id', r.favorecido_id, 'fornecedor', r.fornecedor, 'vezes', r.n, 'desde', r.desde) FROM r)
  ) INTO v;
  RETURN v;
END;
$function$;

DO $conf$
DECLARE r record;
BEGIN
  SELECT p.oid, p.prosecdef, p.proconfig INTO r FROM pg_proc p
   WHERE p.oid = 'public.fn_conciliacao_historico_buscar(uuid,text,text[],date,date,numeric)'::regprocedure;
  IF NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
     OR NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig))
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = r.oid) <> 'd93e93a7a4e71098b5037621b763547b' THEN
    RAISE EXCEPTION 'P153b: fn_conciliacao_historico_buscar fora do esperado (secdef/ACL/config)';
  END IF;
END $conf$;
