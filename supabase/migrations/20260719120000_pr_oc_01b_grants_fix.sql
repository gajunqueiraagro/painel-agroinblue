-- PR-OC-01B — Grants fix: privilégios mínimos de authenticated nas tabelas da Operação Comercial.
-- Os default privileges do schema public concederam ALL diretamente à role authenticated
--   (relacl arwdDxtm), além do contrato do PR-OC-01. Este PR remove os excedentes:
--   TRUNCATE (não é protegido por RLS), TRIGGER, REFERENCES e MAINTAIN nas 5 tabelas; e
--   UPDATE, DELETE em zoo_operacao_eventos (append-only => somente SELECT, INSERT).
-- Não altera policies/RLS, não concede nada, não toca a migration original já aplicada.

REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON TABLE
    public.zoo_operacoes_comerciais,
    public.zoo_operacao_movimentacoes,
    public.zoo_operacao_partes,
    public.zoo_operacao_documentos,
    public.zoo_operacao_eventos
  FROM authenticated;

REVOKE UPDATE, DELETE
  ON TABLE public.zoo_operacao_eventos
  FROM authenticated;
