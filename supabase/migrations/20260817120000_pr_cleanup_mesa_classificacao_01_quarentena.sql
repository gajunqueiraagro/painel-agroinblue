-- 20260817120000_pr_cleanup_mesa_classificacao_01_quarentena.sql
-- PR-CLEANUP-MESA-CLASSIFICACAO-01 — BLOCO 1: quarentena da UI legada (lado banco).
--
-- MOTIVO. A tela "Mesa de Classificação" saiu do menu, da rota e do link de transição
-- (mesmo PR, lado front: navGrupos.ts, V2Index.tsx, ConciliacaoBancariaTab.tsx). Com ela
-- fora de circulacao, desaparecem os UNICOS consumidores de escrita direta na staging.
--
-- PROVA DE FASE 0 (read-only no proto, 2026-08-08):
--   Escrita direta em financeiro_classificacao_staging existe em exatamente 2 pontos,
--   ambos dentro da tela legada:
--     src/v2/components/mesa/MesaClassificacaoTab.tsx:634   UPDATE aplicado/aplicado_em/
--                                                           aplicado_por/match_lancamento_id
--     src/v2/components/mesa/MesaClassificacaoTab.tsx:1101  UPDATE match_lancamento_id/match_status
--   O fluxo vigente (Conciliação Bancária → Importar Banco / Enriquecer / Conciliação) NAO
--   escreve direto: le pela view e pela lista de sessoes, e escreve exclusivamente por RPC
--   SECURITY DEFINER. Logo, authenticated nao precisa de nenhum privilegio de escrita aqui.
--
--   fn_classificacao_candidatos_ambiguo tinha como unico chamador de front o
--   MesaClassificacaoCandidatosDrawer, exclusivo da tela legada. Fica sem consumidor.
--
-- ESTA MIGRATION NAO DESTROI NADA. Sem DROP, sem DELETE, sem TRUNCATE. Apenas REVOKE.
-- As 37.390 linhas, 141 sessoes e 3 clientes seguem intactos e legiveis.
--
-- ORDEM DE APLICACAO. O front DEVE ir antes: enquanto a tela legada estiver alcancavel,
-- revogar UPDATE faz os dois pontos acima falharem com 42501 na cara do operador.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim — a transicao ja estava declarada no proprio codigo
--       (ConciliacaoBancariaTab.tsx: "Mesa de Classificação antiga segue acessível como
--       referência, discreta"). Esta migration conclui o que o front ja sinalizava.
--   (b) Reutilizar? Sim: menor privilegio por REVOKE, mesmo padrao das migrations
--       20260714120000_sec_rpc_p0_01b2 e 20260715170000_sec_rls_p0_as1.
--   (c) Fonte soberana? Inalterada: a staging segue sendo a fonte do Enriquecimento.
--   (d) Segunda forma? Nao. Nao cria tabela, funcao, view ou rota.
--   (e) Tela ou plataforma? Plataforma: remove privilegios sem consumidor.
--   (f) Divida? Reduz. Registra que os arquivos da tela legada continuam no repo em
--       quarentena (remocao fisica fica para PR-CLEANUP-MESA-CLASSIFICACAO-02).
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- Q.0 PRE-CHECKS FATAIS ---------------------------------------------------------------------
DO $$
DECLARE
  v_linhas bigint; v_sessoes bigint; v_clientes bigint;
  v_faltando text;
BEGIN
  IF to_regclass('public.financeiro_classificacao_staging') IS NULL THEN
    RAISE EXCEPTION 'QUARENTENA: tabela financeiro_classificacao_staging inexistente';
  END IF;

  -- authenticated precisa estar no estado amplo conhecido; se ja estiver contido, parar.
  SELECT string_agg(p, ',' ORDER BY p) INTO v_faltando
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   WHERE NOT pg_catalog.has_table_privilege('authenticated','public.financeiro_classificacao_staging',p);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'QUARENTENA: estado inicial divergente — authenticated ja nao tem: %', v_faltando;
  END IF;

  IF NOT pg_catalog.has_function_privilege(
           'authenticated','public.fn_classificacao_candidatos_ambiguo(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'QUARENTENA: authenticated ja nao tem EXECUTE em fn_classificacao_candidatos_ambiguo';
  END IF;

  -- congela volumetria para provar preservacao integral no pos-check
  SELECT count(*), count(DISTINCT sessao_id), count(DISTINCT cliente_id)
    INTO v_linhas, v_sessoes, v_clientes
    FROM public.financeiro_classificacao_staging;
  PERFORM set_config('app.quarentena_linhas',  v_linhas::text,  true);
  PERFORM set_config('app.quarentena_sessoes', v_sessoes::text, true);
  PERFORM set_config('app.quarentena_clientes',v_clientes::text,true);

  RAISE NOTICE 'QUARENTENA pre-checks OK: linhas=%, sessoes=%, clientes=%', v_linhas, v_sessoes, v_clientes;
END $$;


-- Q.1 Menor privilegio na staging: authenticated fica SOMENTE com SELECT -----------------------
-- REVOKE nominal (nao "REVOKE ALL") para que SELECT nunca deixe de existir nem por um instante.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
    ON TABLE public.financeiro_classificacao_staging
  FROM authenticated;

-- Q.2 RPC que ficou sem consumidor junto com a tela legada -------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) FROM authenticated;


-- Q.3 POS-CHECKS FATAIS ------------------------------------------------------------------------
DO $$
DECLARE
  v_sobrando text; v_linhas bigint; v_sessoes bigint; v_clientes bigint;
BEGIN
  IF NOT pg_catalog.has_table_privilege('authenticated','public.financeiro_classificacao_staging','SELECT') THEN
    RAISE EXCEPTION 'QUARENTENA: authenticated perdeu SELECT — o Enriquecimento quebraria';
  END IF;

  SELECT string_agg(p, ',' ORDER BY p) INTO v_sobrando
    FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   WHERE pg_catalog.has_table_privilege('authenticated','public.financeiro_classificacao_staging',p);
  IF v_sobrando IS NOT NULL THEN
    RAISE EXCEPTION 'QUARENTENA: authenticated ainda tem: %', v_sobrando;
  END IF;

  IF pg_catalog.has_function_privilege(
       'authenticated','public.fn_classificacao_candidatos_ambiguo(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'QUARENTENA: authenticated ainda executa fn_classificacao_candidatos_ambiguo';
  END IF;

  -- anon permanece sem nada
  IF pg_catalog.has_table_privilege('anon','public.financeiro_classificacao_staging','SELECT') THEN
    RAISE EXCEPTION 'QUARENTENA: anon ganhou SELECT — estado inesperado';
  END IF;

  -- service_role e postgres intocados
  IF NOT (pg_catalog.has_table_privilege('service_role','public.financeiro_classificacao_staging','SELECT')
      AND pg_catalog.has_table_privilege('service_role','public.financeiro_classificacao_staging','UPDATE')
      AND pg_catalog.has_table_privilege('service_role','public.financeiro_classificacao_staging','DELETE')) THEN
    RAISE EXCEPTION 'QUARENTENA: service_role foi afetado indevidamente';
  END IF;

  -- dado preservado integralmente
  SELECT count(*), count(DISTINCT sessao_id), count(DISTINCT cliente_id)
    INTO v_linhas, v_sessoes, v_clientes
    FROM public.financeiro_classificacao_staging;
  IF v_linhas::text   IS DISTINCT FROM current_setting('app.quarentena_linhas', true)
  OR v_sessoes::text  IS DISTINCT FROM current_setting('app.quarentena_sessoes', true)
  OR v_clientes::text IS DISTINCT FROM current_setting('app.quarentena_clientes', true) THEN
    RAISE EXCEPTION 'QUARENTENA: volumetria mudou (linhas=%, sessoes=%, clientes=%)',
                    v_linhas, v_sessoes, v_clientes;
  END IF;

  RAISE NOTICE 'QUARENTENA pos-checks OK: authenticated=SELECT apenas; candidatos_ambiguo sem EXECUTE; dados intactos (%, %, %).',
               v_linhas, v_sessoes, v_clientes;
END $$;


-- ==============================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter devolve a authenticated INSERT/UPDATE/DELETE/TRUNCATE na staging — inclusive
-- TRUNCATE, que NAO passa por RLS e apaga as 37.390 linhas dos 3 tenants.
-- So faz sentido em conjunto com a reversao do front (menu + rota + link).
-- ----------------------------------------------------------------------------------------------
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--    ON TABLE public.financeiro_classificacao_staging TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) TO authenticated;
--
-- DO $rb$
-- DECLARE v_faltando text;
-- BEGIN
--   SELECT string_agg(p, ',' ORDER BY p) INTO v_faltando
--     FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
--    WHERE NOT pg_catalog.has_table_privilege('authenticated','public.financeiro_classificacao_staging',p);
--   IF v_faltando IS NOT NULL THEN
--     RAISE EXCEPTION 'rollback QUARENTENA: authenticated ainda sem %', v_faltando;
--   END IF;
--   RAISE NOTICE 'rollback QUARENTENA OK: privilegios amplos restaurados. TRUNCATE REABERTO.';
-- END $rb$;
-- ==============================================================================================
