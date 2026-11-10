-- NOTAS-ITENS-LIVRO-CAIXA-01 fatia 2 — conserto da 20261028114130 (achado do Code 2 na conferência pós-aplicação, 05/11): as duas tabelas e a
-- visão nasceram com o privilégio PADRÃO do esquema para `authenticated` (arwdDxtm); o REVOKE de lá tirou só de PUBLIC/anon. INSERT, UPDATE e
-- DELETE já eram barrados pela RLS (só há política de SELECT), mas TRUNCATE não passa pela RLS. Volta ao padrão da casa (o da `nota_fiscal`,
-- `nota_fiscal_itens`, `fiscal_titulares`): `authenticated` só lê; escrita da exceção só pelas RPCs SECURITY DEFINER.
SET LOCAL lock_timeout = '2s';
REVOKE ALL ON public.fin_livro_caixa_regra, public.fin_livro_caixa_excecao, public.vw_fin_livro_caixa FROM authenticated;
GRANT SELECT ON public.fin_livro_caixa_regra, public.fin_livro_caixa_excecao, public.vw_fin_livro_caixa TO authenticated;
