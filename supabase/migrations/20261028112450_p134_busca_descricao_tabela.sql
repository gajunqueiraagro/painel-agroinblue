-- P134 (complemento de 20261028112440) — o campo calculado `busca_descricao` tambem na TABELA `financeiro_lancamentos_v2`, para que o
-- plano de filtros da lista (`montarPlanoBaseV2`) siga UM SO' para tabela e view (o teste "a fonte unica de decisao e' mesmo unica"):
-- o Produto vai como `busca_descricao.imatch.<termo sem acento>` nos dois caminhos. Mesma regra (`_fn_normalizar_texto`), STABLE e
-- aberta na consulta; EXECUTE so' para `authenticated`.
CREATE OR REPLACE FUNCTION public.busca_descricao(r public.financeiro_lancamentos_v2)
 RETURNS text LANGUAGE sql STABLE
AS $function$ SELECT COALESCE(public._fn_normalizar_texto(r.descricao), '') $function$;
REVOKE ALL ON FUNCTION public.busca_descricao(public.financeiro_lancamentos_v2) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.busca_descricao(public.financeiro_lancamentos_v2) TO authenticated;
