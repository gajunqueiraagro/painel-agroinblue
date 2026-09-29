-- FIN-DOC-ACL-01 — seguranca das 4 RPCs de documento do lancamento (29/09/2026).
--
-- POR QUE (medido na FASE 0 do FIN-NFE-PARCELAS-01 PR 2):
--   fin_documento_confronto(p_lancamento_id, p_cliente_id) era LANGUAGE sql, SECURITY DEFINER,
--   com EXECUTE para PUBLIC e SEM guarda nenhuma: anon, com dois uuids, lia o valor de um
--   lancamento de qualquer cliente. As tres de escrita (registrar, editar, cancelar) tambem
--   estavam com EXECUTE para PUBLIC; a guarda interna delas ja recusava anon (42501).
--
-- md5(pg_get_functiondef) ANTES:
--   fin_documento_registrar  cc674c8d465961df59048a465b6195ec
--   fin_documento_editar     53c71a77f8290efeb3797cadd23721be
--   fin_documento_cancelar   63b62da2d0ee0efd870ddf12a100ff6b
--   fin_documento_confronto  61d3740d4bf02c66ca168ac85cdf7e07
--   proacl das 4: {=X/postgres,postgres=X/postgres,service_role=X/postgres}
--
-- O QUE MUDA:
--   1. fin_documento_confronto ganha a guarda da casa — o MESMO trecho de fin_documento_registrar
--      (admin OU cliente em get_user_cliente_ids, 42501), precedido da recusa de sessao sem usuario.
--      Para caber a guarda, LANGUAGE sql -> plpgsql. Mesma assinatura, mesmo retorno (jsonb), mesmo
--      STABLE SECURITY DEFINER; o SELECT e' o de antes, byte a byte, dentro de RETURN (...).
--      search_path: pg_catalog, public.
--   2. As 4: REVOKE ALL de PUBLIC e de anon; GRANT EXECUTE para authenticated. service_role mantem o
--      grant explicito que ja tinha.
--      ⚠ O REVOKE VEM DEPOIS DO CREATE OR REPLACE, no mesmo arquivo (licao de 21/09): o replace nao
--      mexe na ACL de funcao existente, mas a ordem deixa a garantia independente disso.
--
-- O QUE NAO MUDA:
--   - Corpo das tres de escrita (so a ACL).
--   - A regra do confronto (soma dos documentos ativos, diferenca, tolerancia de 0,01). A mudanca de
--     regra (ratear pela compra) e' do FIN-NFE-PARCELAS-01 PR 2.
--   - Lancamento de outro cliente com o p_cliente_id do proprio usuario continua devolvendo NULL
--     (nenhuma linha), como antes — o filtro `l.cliente_id = p_cliente_id` ja isolava; o que faltava
--     era impedir de pedir o p_cliente_id alheio.
--   - Nenhuma tabela, view, policy, bucket ou tela.
--
-- CHAMADORES DO CONFRONTO (conferidos): o front, `useLancamentoDocumentos.ts:336` (authenticated), e,
-- dentro do banco, fin_documento_registrar/editar/cancelar (SECURITY DEFINER, com o auth.uid() do
-- mesmo usuario — a guarda passa). Nenhuma edge function nem service role o chama.

CREATE OR REPLACE FUNCTION public.fin_documento_confronto(p_lancamento_id uuid, p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: sessao sem usuario' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;

  RETURN (
  SELECT jsonb_build_object(
    'valor_lancamento',  l.valor,
    'valor_documentado', COALESCE(d.total, 0),
    'docs_ativos',       COALESCE(d.n, 0),
    'docs_com_valor',    COALESCE(d.n_valor, 0),
    'diferenca',         ROUND(COALESCE(d.total,0) - COALESCE(l.valor,0), 2),
    'confere',           (d.n_valor > 0 AND ABS(COALESCE(d.total,0) - COALESCE(l.valor,0)) <= 0.01))
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN (
    SELECT lancamento_id, SUM(valor_documento) total, COUNT(*) n, COUNT(valor_documento) n_valor
    FROM public.financeiro_lancamento_documentos
    WHERE lancamento_id = p_lancamento_id AND cliente_id = p_cliente_id AND cancelado = false
    GROUP BY lancamento_id
  ) d ON d.lancamento_id = l.id
  WHERE l.id = p_lancamento_id AND l.cliente_id = p_cliente_id
  );
END $function$;

REVOKE ALL ON FUNCTION public.fin_documento_confronto(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_confronto(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_confronto(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fin_documento_registrar(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_registrar(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_registrar(uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.fin_documento_editar(uuid, uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_editar(uuid, uuid, integer, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_editar(uuid, uuid, integer, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.fin_documento_cancelar(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_cancelar(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_cancelar(uuid, uuid, text) TO authenticated;
