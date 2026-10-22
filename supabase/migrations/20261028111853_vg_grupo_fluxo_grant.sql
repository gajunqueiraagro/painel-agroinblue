-- FIN-VISAO-GERAL-01 PR 1 — o gatilho do grupo de analise (trg_plano_grupo_fluxo, 20261028111850) chama fn_plano_grupo_fluxo com o
-- privilegio de quem grava no plano. A funcao nasceu fechada (o padrao do schema: sem EXECUTE para authenticated) e o plano aceita
-- INSERT de authenticated (pela RLS): sem este GRANT, a linha nova gravada por um usuario logado era recusada com 42501 (medido em
-- ensaio, 22/10/2026). A funcao e' pura (texto -> texto), nao le^ dado nenhum; anon segue sem EXECUTE.
GRANT EXECUTE ON FUNCTION public.fn_plano_grupo_fluxo(text, text, text) TO authenticated;
