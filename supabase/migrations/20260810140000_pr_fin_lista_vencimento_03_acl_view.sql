-- =====================================================================
-- PR-FIN-LISTA-VENCIMENTO-03 · ACL da view de leitura da lista.
--
-- A migration da view (20260810132609) revoga PUBLIC, anon e service_role,
-- mas NAO revoga `authenticated`. O resultado no proto foi a view nascer com
-- os oito privilegios para `authenticated` e `postgres`, herdados das DEFAULT
-- PRIVILEGES do schema public — que concedem `arwdDxtm` a todos os papeis em
-- toda relacao nova.
--
-- A view e auto-atualizavel (relacao simples, uma tabela base), entao esses
-- privilegios sao vivos: daria para escrever atraves dela. Nao ha escalada de
-- privilegio — `authenticated` ja tem DML na tabela base, sob a mesma RLS —,
-- mas o contrato desta view e LEITURA, e superficie de escrita que ninguem
-- pediu nao deve existir.
--
-- Esta migration e SEPARADA de proposito. A da view permanece byte a byte
-- igual ao payload aprovado e aplicado, cujo SHA-256 esta gravado no wrapper
-- registrado em supabase_migrations. Corrigir o passado editando o arquivo
-- quebraria essa correspondencia; corrigir com uma migration nova preserva a
-- historia e ainda deixa o estado final certo num replay do zero.
--
-- NAO altera: dono, definicao, colunas da view, nem a ACL da RPC.
-- Idempotente: revogar o que ja foi revogado e conceder o que ja existe sao
-- no-ops, e os gates conferem o estado final, nao o caminho.
-- =====================================================================

BEGIN;

-- `postgres` entra no REVOKE junto dos demais. Revogar privilegio NAO mexe em
-- ownership: `postgres` continua dono e segue podendo recriar, alterar e
-- reconceder a view. O GRANT logo abaixo devolve o SELECT explicito, para que
-- a ACL fique nominal em vez de depender de privilegio implicito de dono.
REVOKE ALL ON public.vw_financeiro_lancamentos_v2_doc
  FROM PUBLIC, anon, service_role, authenticated, postgres;

GRANT SELECT ON public.vw_financeiro_lancamentos_v2_doc
  TO authenticated, postgres;

DO $$
DECLARE
  v_extra text;
  v_dono  text;
BEGIN
  -- ACL1 — nada alem de authenticated:SELECT e postgres:SELECT.
  --   Cobre num so gate os dois lados: privilegio a mais para quem pode ler
  --   (INSERT/UPDATE/DELETE/TRUNCATE/...) e qualquer papel indevido
  --   (PUBLIC, anon, service_role ou outro que apareca no futuro).
  SELECT string_agg(coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') || ':' || a.privilege_type,
                    ', ' ORDER BY coalesce(pg_get_userbyid(a.grantee), 'PUBLIC'), a.privilege_type)
    INTO v_extra
    FROM pg_class c, LATERAL aclexplode(c.relacl) a
   WHERE c.oid = 'public.vw_financeiro_lancamentos_v2_doc'::regclass
     AND NOT (coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') IN ('authenticated', 'postgres')
              AND a.privilege_type = 'SELECT');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'ACL1: privilegio nao previsto na view -> %', v_extra;
  END IF;

  -- ACL2 — e os dois papeis previstos precisam MESMO conseguir ler.
  IF NOT has_table_privilege('authenticated', 'public.vw_financeiro_lancamentos_v2_doc', 'SELECT') THEN
    RAISE EXCEPTION 'ACL2: authenticated sem SELECT na view';
  END IF;
  IF NOT has_table_privilege('postgres', 'public.vw_financeiro_lancamentos_v2_doc', 'SELECT') THEN
    RAISE EXCEPTION 'ACL2: postgres sem SELECT na view';
  END IF;

  -- ACL3 — o dono nao pode ter mudado. Trocar de dono mudaria quem a view
  --   representa perante a RLS em qualquer uso futuro sem security_invoker.
  SELECT pg_get_userbyid(c.relowner) INTO v_dono
    FROM pg_class c WHERE c.oid = 'public.vw_financeiro_lancamentos_v2_doc'::regclass;
  IF v_dono <> 'postgres' THEN
    RAISE EXCEPTION 'ACL3: dono da view mudou para %', v_dono;
  END IF;

  -- ACL4 — security_invoker segue ativo. Sem ele a RLS da tabela base deixaria
  --   de valer e a contencao de ACL nao adiantaria nada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.oid = 'public.vw_financeiro_lancamentos_v2_doc'::regclass
       AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'ACL4: view perdeu security_invoker';
  END IF;

  -- ACL5 — a RPC nao e alvo desta migration; confere que continua intacta.
  SELECT string_agg(coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') || ':' || a.privilege_type,
                    ', ' ORDER BY coalesce(pg_get_userbyid(a.grantee), 'PUBLIC'), a.privilege_type)
    INTO v_extra
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(p.proacl) a
   WHERE n.nspname = 'public' AND p.proname = 'fn_lista_v2_totais'
     AND NOT (coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') IN ('authenticated', 'postgres')
              AND a.privilege_type = 'EXECUTE');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'ACL5: ACL da RPC mudou -> %', v_extra;
  END IF;

  RAISE NOTICE 'ACL: view com SELECT apenas para authenticated e postgres; dono, security_invoker e RPC intactos.';
END $$;

COMMIT;
