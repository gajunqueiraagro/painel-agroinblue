-- MAPA-TIPO-ROTULO-GRANT-01 (Gabriel 02/11 21:43, Agnaldo › Sta. Tereza: "Sem acesso a esta fazenda." para o admin). A 117120 trocou o CHECK
-- `fazenda_geometrias_tipo_check` (e o de `fazenda_geometria_classificacoes`) para `_fn_mapa_tipo_rotulo(tipo) is not null`; CHECK roda com
-- os privilégios de QUEM GRAVA e a função estava fechada para `authenticated` (117030; a `_fn_mapa_tipos_de_area`, que ela lê, na 117120):
-- toda gravação direta do usuário na tabela caía em 42501 "permission denied for function _fn_mapa_tipo_rotulo" (o renomear da lista, o
-- "Atualizar mapa" pela `fn_mapa_fazenda_substituir`, que é SECURITY INVOKER). As duas só devolvem o catálogo de rótulos dos tipos (nenhum dado
-- de cliente): EXECUTE para `authenticated` (a saída do FORN-FILIAL-01-FIX). anon segue sem.
grant execute on function public._fn_mapa_tipo_rotulo(text) to authenticated;
grant execute on function public._fn_mapa_tipos_de_area() to authenticated;
