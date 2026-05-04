-- Migration: fix_rls_delete_fechamento_pasto_itens
-- Data: 2026-05-04
-- Problema: tabela fechamento_pasto_itens tinha policies de SELECT/INSERT/UPDATE
--           mas NÃO tinha policy de DELETE para a role public.
--           Com RLS ativo, o DELETE via anon key retornava 204 silencioso mas
--           não removia nenhuma linha — causando erro 23505 (duplicate key)
--           no INSERT subsequente do salvarItens.
-- Escopo copiado: USING (true), TO public — idêntico à policy _update_open.
--           DELETE não usa WITH CHECK (não se aplica a esta operação).

CREATE POLICY "fechamento_pasto_itens_delete_open"
ON fechamento_pasto_itens
FOR DELETE
TO public
USING (true);
