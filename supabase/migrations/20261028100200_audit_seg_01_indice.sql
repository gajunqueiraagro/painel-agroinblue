-- AUDIT-SEG-01 (Gabriel 20/10/2026) — parte 3. ⚠ APLICAR SO' ANTES DAS 07h OU DEPOIS DAS 20h, FORA DE TRANSACAO
-- (CREATE INDEX CONCURRENTLY nao roda dentro de BEGIN/COMMIT nem pelo apply_migration, que embrulha em transacao).
-- A aba Auditoria do lancamento le' audit_log por (tabela_origem, registro_id) e hoje varre a tabela (145 MB em 20/10).
-- Se a criacao falhar no meio, o indice fica INVALID: DROP INDEX CONCURRENTLY e repetir.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_registro
  ON public.audit_log (tabela_origem, registro_id, created_at DESC);
