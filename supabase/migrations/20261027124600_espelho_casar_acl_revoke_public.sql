-- AS DUAS FUNCOES DO ESPELHO DEIXAM DE SER ALCANCAVEIS POR `anon`.
--
-- ⚠ O QUE ESTAVA NO AR. Medido em 21/09/2026, durante a FASE 0 de outra frente:
--     fn_espelho_casar     acl: =X/postgres | postgres=X/postgres | service_role=X/postgres | authenticated=X/postgres
--     fn_espelho_casar_n1  acl: =X/postgres | postgres=X/postgres | service_role=X/postgres | authenticated=X/postgres
--   O `=X/postgres` sem papel a' esquerda e' EXECUTE para PUBLIC, e
--   `has_function_privilege('anon', ..., 'EXECUTE')` devolvia TRUE nas duas.
--
-- ⚠ E ELAS ESCREVEM NO FINANCEIRO. Sao SECURITY DEFINER: conciliam movimento bancario com
--   lancamento, promovem lancamento a 'realizado', gravam em `conciliacao_bancaria_itens` e mudam
--   `status` em `extrato_bancario_v2`. Rodando como dono, a RLS por tenant nao as segura — quem
--   chega na funcao ja' passou por cima dela. A ACL era a unica porta, e estava aberta.
--
-- ⚠ A CAUSA E' CONHECIDA E JA' COBROU DUAS VEZES: `CREATE OR REPLACE FUNCTION` em banco novo (ou
--   `CREATE` que nao encontra a funcao) nasce com o default do Postgres, que e' EXECUTE para
--   PUBLIC. Sem `REVOKE`/`GRANT` no rodape do arquivo, a funcao amanhece aberta. Em 21/09, mais
--   cedo, `agri_carga_mandioca_registrar` e `_corrigir` apareceram exatamente assim depois de uma
--   reaplicacao. Funcao nova desta casa nasce com os dois comandos; estas duas sao anteriores a'
--   regra.
--
-- ⚠ O CORPO NAO MUDOU, e isto foi conferido antes e depois: md5 do prosrc
--   `da53db4818c2ef6c0c1afd9deb315594` (fn_espelho_casar) e
--   `6bb6c7d3414df925a90e16aa8bb2af46` (fn_espelho_casar_n1), iguais nas duas medicoes. Esta
--   migration mexe SO' em permissao.
--
-- DEPOIS: `anon` = false, `authenticated` = true nas duas, conferido por has_function_privilege.
--
-- ⚠ E O PROBLEMA NAO ACABA AQUI. Varredura do schema `public` no mesmo dia: 226 funcoes SECURITY
--   DEFINER, 39 alcancaveis por `anon`. Destas, 26 sao funcoes de TRIGGER (retornam `trigger`, nao
--   sao invocaveis pelo PostgREST — o EXECUTE para PUBLIC nelas e' inofensivo e e' o default) e 13
--   sao RPC de verdade: 1 de leitura (`fin_documento_confronto`) e DOZE QUE ESCREVEM —
--     _oc_sync_abate_lancamento, fin_documento_cancelar, fin_documento_editar,
--     fin_documento_registrar, fn_criar_lancamento_de_extrato, fn_extrato_desfazer_arquivo,
--     fn_recorrencia_cancelar, fn_recorrencia_gerar, oc_ajustar_valor_compromisso,
--     oc_revalorar_lote, oc_salvar_abate, oc_salvar_boitel.
--   Sao a MESMA classe de brecha que este arquivo fecha, e ficam registradas aqui porque a lista
--   se perde se morar so' num relatorio. Nao foram tocadas: e' frente propria.
--
-- IDEMPOTENTE: rodar de novo repete o mesmo estado.

REVOKE ALL ON FUNCTION public.fn_espelho_casar(uuid, jsonb, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_espelho_casar_n1(uuid, uuid[], boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_espelho_casar(uuid, jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_espelho_casar_n1(uuid, uuid[], boolean, text) TO authenticated;
