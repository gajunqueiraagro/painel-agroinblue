-- PR-FAZENDAS-RLS-INSERT-01 — `fazendas` ganha policy de INSERT.
--
-- O DEFEITO. A tabela tem RLS ativo e apenas DUAS policies, medidas em
-- pg_policies em 22/08/2026:
--   fazendas_select_tenant  SELECT  authenticated
--   fazendas_update_tenant  UPDATE  authenticated  (USING e WITH CHECK)
-- Sem policy de INSERT, o RLS NEGA POR PADRAO. Criar fazenda falhava com
-- "new row violates row-level security policy" em TODO o app — pela
-- FazendasList e pelo FazendaSetup — desde sempre.
--
-- O botao "+ Adicionar fazenda" que entrou em c9e6c755 nao criou o problema:
-- ele o tornou VISIVEL. Hoje esta na tela sem funcionar.
--
-- A EXPRESSAO E COPIA LITERAL do WITH CHECK de `fazendas_update_tenant`,
-- lida de pg_policies e conferida por md5 antes de ser escrita aqui
-- (536bb6a33e60bd4c71ac4c7908257bdd, 197 caracteres). Nao foi redigitada.
--
-- A REGRA que ela expressa: quem pode EDITAR a fazenda de um cliente pode
-- CRIAR fazenda nesse cliente. Admin Agroinblue passa por is_admin_agroinblue;
-- os demais, pela lista de clientes de get_user_cliente_ids.
--
-- Role `authenticated`, como as outras duas. NAO PUBLIC, NAO anon.
--
-- DELETE continua SEM policy, e e deliberado: excluir fazenda destruiria
-- fazenda_membros, fazenda_cadastros, pastos, lancamentos e fechamentos. O
-- mecanismo de tirar de circulacao e `status_operacional`, ja em uso — seis
-- fazendas "Administrativo" estao inativa hoje.
--
-- NADA A FAZER no trigger: `on_fazenda_created` chama
-- `auto_add_owner_as_membro`, que e SECURITY DEFINER e nao esbarra em RLS.

BEGIN;

/* INSERT em `fazendas` estava sem policy — RLS nega por padrao e criar
   fazenda falhava em todo o app desde sempre. O WITH CHECK espelha
   `fazendas_update_tenant`: quem pode editar a fazenda de um cliente pode
   criar fazenda nesse cliente. */
CREATE POLICY fazendas_insert_tenant ON public.fazendas
  FOR INSERT TO authenticated
  WITH CHECK (
(( SELECT is_admin_agroinblue(( SELECT auth.uid() AS uid)) AS is_admin_agroinblue) OR (cliente_id IN ( SELECT t.cliente_id
   FROM get_user_cliente_ids(( SELECT auth.uid() AS uid)) t(cliente_id))))
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (comentado)
--
-- Reversao total: a policy e nova, nao substitui nenhuma. Voltar deixa o
-- INSERT negado de novo — que era o estado anterior, com o botao na tela
-- sem funcionar.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS fazendas_insert_tenant ON public.fazendas;
--
-- COMMIT;
