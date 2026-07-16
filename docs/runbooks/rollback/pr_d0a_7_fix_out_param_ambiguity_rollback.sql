-- ROLLBACK R7 (Migração 7 — fix-forward de M3/M4). RUNBOOK DOCUMENTAL, NAO destrutivo.
--
-- A Migração 7 corrige um erro de RUNTIME (ERRCODE 42702: "column reference cliente_id is
--   ambiguous") em fn_cards_componentes_mes e fn_composicao_componentes_categoria_mes,
--   qualificando public.fazendas AS f. Ela NAO altera semantica.
--
-- POR QUE ESTE ROLLBACK NAO RESTAURA M3/M4:
--   * A versao anterior (M3/M4) estava QUEBRADA em runtime — recria-la reintroduziria o defeito.
--   * PROIBIDO restaurar a versao ambigua. Nao ha corpo "anterior valido" a recriar.
--
-- ROLLBACK FUNCIONAL DO D.0A (se necessario desfazer o contrato de leitura por completo):
--   Remover as SEIS funcoes na ordem R6 -> R1 (drops puros ja versionados), o que descarta
--   tambem a definicao corrigida por M7. NAO recriar corpos quebrados.
--     docs/runbooks/rollback/pr_d0a_6_fn_locais_sugeridos_mes_rollback.sql
--     docs/runbooks/rollback/pr_d0a_5_fn_pendencias_fechamento_mes_rollback.sql
--     docs/runbooks/rollback/pr_d0a_4_fn_composicao_componentes_categoria_mes_rollback.sql
--     docs/runbooks/rollback/pr_d0a_3_fn_cards_componentes_mes_rollback.sql
--     docs/runbooks/rollback/pr_d0a_2_fn_uso_operacional_mes_rollback.sql
--     docs/runbooks/rollback/pr_d0a_1_fn_natureza_patrimonial_fazenda_rollback.sql
--
-- Este arquivo, se executado, apenas emite um aviso e NAO faz nenhuma alteracao no schema.
DO $$ BEGIN
  RAISE NOTICE 'R7 e documental: a correcao M7 elimina erro de runtime 42702. Restaurar a versao ambigua de M3/M4 e PROIBIDO. Para desfazer o D.0A, aplicar R6->R1 (drops puros); nunca recriar corpos quebrados.';
END $$;
