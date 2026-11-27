-- CONC-SUGESTOES-V2 · conserto do 114420: a tabela nova nasceu com os privilégios padrão do Supabase (authenticated = arwdDxtm). A RLS (só
-- policy de SELECT) já barra INSERT/UPDATE/DELETE, mas TRUNCATE não passa pela RLS. Fica só a leitura para authenticated; a escrita segue só
-- pela fn_casar_parcela_com_motivo (SECURITY DEFINER, dona postgres).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.financiamento_parcela_ajustes FROM authenticated;
