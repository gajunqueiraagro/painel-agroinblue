-- P82 (Gabriel 23/10/2026) — o seletor de Contas da Visao Geral marca como padrao (`no_caixa`) o MESMO conjunto das funcoes desde a
-- 111935: as contas cc/inv/permuta ativas E os cartoes ativos (a compra no cartao e' saida; o pagamento da fatura, transferencia dentro do
-- conjunto). Sem isto o seletor diria que o cartao esta' fora do padrao enquanto o banco o conta. Mesma assinatura: sem DROP.

CREATE OR REPLACE FUNCTION public.fn_vg_filtros(p_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'contas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(nullif(c.nome_exibicao, ''), c.nome_conta),
               'tipo', lower(coalesce(c.tipo_conta, '')), 'ativa', c.ativa,
               'no_caixa', c.ativa AND (lower(coalesce(c.tipo_conta, '')) IN ('cc', 'inv', 'permuta') OR public.fn_vg_eh_cartao(c.tipo_conta)))
             ORDER BY NOT c.ativa, lower(coalesce(c.tipo_conta, '')), c.ordem_exibicao NULLS LAST, coalesce(nullif(c.nome_exibicao, ''), c.nome_conta))
        FROM public.financeiro_contas_bancarias c WHERE c.cliente_id = p_cliente), '[]'::jsonb),
    'atividades', coalesce((
      SELECT jsonb_agg(e ORDER BY array_position(ARRAY['pecuaria', 'agricultura', 'silvicultura', 'administrativo'], e) NULLS LAST, e)
        FROM (SELECT DISTINCT l.escopo_negocio AS e FROM public.financeiro_lancamentos_v2 l
               WHERE l.cliente_id = p_cliente AND l.escopo_negocio IS NOT NULL AND NOT l.cancelado) x), '[]'::jsonb),
    'safras', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) ORDER BY s.data_inicio DESC NULLS LAST, s.nome)
        FROM public.financeiro_safras s WHERE s.cliente_id = p_cliente AND s.ativa), '[]'::jsonb));
END $function$;
