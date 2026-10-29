-- P153 (CONC-HISTORICO-01) — "Procurar no histórico": o movimento do banco sem nada em aberto acha como foi lançado antes.
-- FASE 0 `valores-20261028-1714-P153-fase0.md`; OK do Gabriel (28/10): ENCAIXE, D1 (o banco sem nome = campo vazio), D2 (descrição e
-- fornecedor cobrem também o realizado SEM extrato), D3 (depois do P159a publicado).
-- SÓ LEITURA. SECURITY INVOKER: a RLS do cliente vale; `tenant_ok` explícito recusa com 42501 (nunca devolve vazio).
-- Onde procurar (`p_onde`, qualquer subconjunto):
--   'banco'      o texto do banco JÁ CASADO com o lançamento (vínculo vivo; extrato não cancelado nem ignorado)
--   'descricao'  a descrição do lançamento
--   'fornecedor' o nome do fornecedor (`nome_norm`)
-- Só lançamento REALIZADO e não cancelado, com o pagamento no período. A busca ignora acento, cedilha e maiúscula (P134).
-- Ordem: o valor mais perto do movimento (`p_valor`, com sinal), depois o pagamento mais recente. Até 50 achados; `total` conta todos.
-- `resumo`: o fornecedor que mais aparece nos achados (quantas vezes e desde quando) — a faixa amarela da tela.
CREATE OR REPLACE FUNCTION public.fn_conciliacao_historico_buscar(
  p_cliente uuid, p_termo text, p_onde text[] DEFAULT ARRAY['banco', 'descricao', 'fornecedor'],
  p_de date DEFAULT NULL, p_ate date DEFAULT NULL, p_valor numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
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
    SELECT l.id, l.data_pagamento, l.descricao, l.favorecido_id, l.plano_conta_id, l.fazenda_id, l.conta_bancaria_id,
           CASE WHEN l.sinal = '-1' THEN -l.valor ELSE l.valor END va
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.status_transacao = 'realizado'
       AND (p_de IS NULL OR l.data_pagamento >= p_de) AND (p_ate IS NULL OR l.data_pagamento <= p_ate)
  ), b AS (
    -- o texto do banco casado com o lançamento: o do movimento mais recente, se houver mais de um
    SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, e.descricao banco
      FROM public.conciliacao_bancaria_itens i
      JOIN public.extrato_bancario_v2 e ON e.id = i.extrato_id
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
      LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id
  ), a AS (
    SELECT * FROM c WHERE casa_banco OR casa_desc OR casa_forn
  ), top AS (
    SELECT a.* FROM a
     ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(a.va - p_valor) END, a.data_pagamento DESC NULLS LAST, a.id
     LIMIT 50
  ), r AS (
    SELECT a.favorecido_id, a.fornecedor, count(*) n, min(a.data_pagamento) desde
      FROM a WHERE a.favorecido_id IS NOT NULL
     GROUP BY a.favorecido_id, a.fornecedor
     ORDER BY count(*) DESC, min(a.data_pagamento), a.favorecido_id
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'achados', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lancamento_id', t.id, 'data_pagamento', t.data_pagamento, 'banco', t.banco, 'descricao', t.descricao,
               'fornecedor_id', t.favorecido_id, 'fornecedor', t.fornecedor,
               'plano_conta_id', t.plano_conta_id, 'centro', p.centro_custo, 'subcentro', p.subcentro,
               'fazenda_id', t.fazenda_id, 'fazenda', fz.nome,
               'conta_bancaria_id', t.conta_bancaria_id, 'conta', coalesce(cb.nome_exibicao, cb.nome_conta),
               'valor', t.va,
               'onde', to_jsonb(array_remove(ARRAY[CASE WHEN t.casa_banco THEN 'banco' END, CASE WHEN t.casa_desc THEN 'descricao' END,
                                                   CASE WHEN t.casa_forn THEN 'fornecedor' END], NULL)))
             ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(t.va - p_valor) END, t.data_pagamento DESC NULLS LAST, t.id)
        FROM top t
        LEFT JOIN public.financeiro_plano_contas p ON p.id = t.plano_conta_id
        LEFT JOIN public.fazendas fz ON fz.id = t.fazenda_id
        LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = t.conta_bancaria_id), '[]'::jsonb),
    'resumo', (SELECT jsonb_build_object('fornecedor_id', r.favorecido_id, 'fornecedor', r.fornecedor, 'vezes', r.n, 'desde', r.desde) FROM r)
  ) INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric) TO authenticated;
