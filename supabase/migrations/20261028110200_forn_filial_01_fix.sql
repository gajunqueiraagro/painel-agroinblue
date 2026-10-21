-- FORN-FILIAL-01-FIX (Gabriel, 21/10/2026 14h47 — URGENTE): a 20261028110100 QUEBROU TODA GRAVACAO DE FORNECEDOR PELA TELA (criar, editar,
-- mesclar, inativar): "permission denied for function _fn_fornecedor_chave_documento". Dois pontos avaliavam a funcao COMO O USUARIO
-- (`authenticated`), que nao tinha EXECUTE nela:
--   (1) o gatilho `_trg_fornecedor_documento_ativo_unico` era SECURITY INVOKER (os outros gatilhos de fornecedor sao SECURITY DEFINER);
--   (2) o INDICE de expressao `ix_financeiro_fornecedores_chave_documento` (cliente_id, _fn_fornecedor_chave_documento(cpf_cnpj)) — a
--       manutencao do indice avalia a expressao com os privilegios de quem grava: so' trocar o gatilho NAO bastava (ensaiado).
-- CONSERTO: o gatilho vira SECURITY DEFINER (search_path fixo, mesmo corpo; sem EXECUTE para PUBLIC/anon/authenticated); e
-- `_fn_fornecedor_chave_documento(text)` — pura, IMMUTABLE, so' normaliza o texto do documento — ganha EXECUTE para `authenticated`
-- (anon segue sem), porque o indice a avalia em toda gravacao. A RPC INVOKER que tambem a chama (`_fn_fornecedor_mesclar_recusa`) e' interna,
-- chamada pelas SECURITY DEFINER do mesclar: nao muda.
-- VARREDURA da mesma classe (funcao/gatilho SECURITY INVOKER que chama funcao sem EXECUTE para `authenticated`), 21/10: so' este gatilho
-- falhava de verdade. `_fn_trilha_autor` (gatilho INVOKER do AUDIT-SEG-01, em 5 tabelas de trilha) chama `_fn_trilha_via` (sem EXECUTE)
-- so' quando a tabela e' `audit_log`, e ninguem grava `audit_log` como o usuario (as gravacoes diretas da tela vao para
-- `audit_log_movimentacoes` e `financeiro_saldos_audit`, onde o ramo nao roda) — nao falha hoje, fica registrado. `_oc_cc_conta_entrega`
-- (INVOKER, executavel por authenticated, chama `_oc_subcentro_abate` sem EXECUTE) nao e' chamada pela tela, so' por SECURITY DEFINER.
SET LOCAL lock_timeout = '2s';

ALTER FUNCTION public._trg_fornecedor_documento_ativo_unico() SECURITY DEFINER;
ALTER FUNCTION public._trg_fornecedor_documento_ativo_unico() SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public._trg_fornecedor_documento_ativo_unico() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._fn_fornecedor_chave_documento(text) TO authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_chave_documento(text) FROM PUBLIC, anon;
