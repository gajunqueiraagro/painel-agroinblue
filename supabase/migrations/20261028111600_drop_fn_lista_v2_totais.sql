-- OC-HOSPEDEIRO-LEVE-01 parte 0 (DROP autorizado pelo Gabriel) — `fn_lista_v2_totais` era a RPC de totais da lista da flag
-- LISTA_PAGINADA_V2, que saiu em FIN-V2-LISTA-FLAG-01 (9214ba31). Conferido antes: nenhum chamador no repo (so' o tipo gerado), nenhuma
-- funcao/view do banco a cita (prosrc/viewdef), nenhuma dependencia (pg_depend). A lista usa `fn_fin_v2_lista_pagina`.
DROP FUNCTION IF EXISTS public.fn_lista_v2_totais(uuid, uuid, text, daterange[], smallint[], boolean, boolean, uuid, uuid, text, text[], boolean,
  text, text, text, text, text, text, uuid, text, text, text);
