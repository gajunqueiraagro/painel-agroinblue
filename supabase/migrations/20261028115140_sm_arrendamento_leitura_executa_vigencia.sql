-- SM-ARRENDAMENTO-ENCERRAR-01 (OK do Gabriel 30/10/2026 20:18, "ok") — o canal de leitura volta a ler a `vw_zoot_fazenda_mensal`.
-- Desde a 20261028115130 a view chama `fn_pasto_vigente_no_mes` (security_invoker): quem lê precisa de EXECUTE na função. O papel do
-- canal SÓ DE LEITURA (`supabase_read_only_user`) não tinha e passou a receber 42501 ao ler a view. A função é pura (IMMUTABLE, só
-- compara datas; não lê tabela). SÓ este GRANT, SÓ para este papel (nenhum outro papel, nenhuma outra função); o papel continua sem
-- escrita (o teste prova).
GRANT EXECUTE ON FUNCTION public.fn_pasto_vigente_no_mes(boolean, date, date, text) TO supabase_read_only_user;
