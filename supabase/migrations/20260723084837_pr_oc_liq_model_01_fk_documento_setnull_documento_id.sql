-- PR-OC-LIQ-MODEL-01 — correção da FK documental (defeito detectado na homologação runtime).
--
-- Defeito: a FK zoo_operacao_partes_documento_fk foi criada (migration base 20260722233029)
-- com ON DELETE SET NULL sobre a FK COMPOSTA (documento_id, operacao_id, cliente_id). Como
-- operacao_id e cliente_id são NOT NULL, deletar um documento referenciado tentaria anular
-- também essas colunas → violação NOT NULL → falha estrutural (delete de documento vinculado
-- a uma obrigação abortaria).
--
-- Correção (PG15+): restringir o SET NULL a documento_id, preservando a FK composta
-- tenant-safe. Deletar o documento passa a anular SOMENTE documento_id (nullable).
--
-- Histórico preservado deliberadamente (sem squash na base).

ALTER TABLE public.zoo_operacao_partes DROP CONSTRAINT IF EXISTS zoo_operacao_partes_documento_fk;
ALTER TABLE public.zoo_operacao_partes ADD CONSTRAINT zoo_operacao_partes_documento_fk
  FOREIGN KEY (documento_id, operacao_id, cliente_id)
  REFERENCES public.zoo_operacao_documentos (id, operacao_id, cliente_id)
  ON DELETE SET NULL (documento_id);
