-- SEG-TENANT-VARREDURA-01C — nenhuma funcao do sistema no schema `public` e' executavel sem login; funcao nova nao nasce aberta.
--
-- POR QUE: o piloto abre com usuarias de cliente em dominio proprio. Medido em 04/10/2026: o papel `anon` (quem nem logou) tinha
-- EXECUTE em 118 das 441 funcoes do schema `public`, SEMPRE por heranca de PUBLIC (47 + 17 delas tambem por concessao direta a
-- `anon`): 3 SECURITY DEFINER chamaveis (`fn_recorrencia_cancelar`, `oc_ajustar_valor_compromisso`, `oc_salvar_abate`), 23 SECURITY
-- INVOKER chamaveis (eram 15 na contagem de 03/10), 57 funcoes de trigger e 35 de extensao. Nenhuma das 26 chamaveis gravava ou lia
-- dado de cliente sem usuario — as tres DEFINER recusam com 42501 no corpo e as INVOKER batem em "permission denied for table",
-- porque `anon` nao tem privilegio em tabela nenhuma do `public` —, mas a porta estava aberta e a lista crescia sozinha.
--
-- O QUE MUDA (so' permissoes; NENHUM corpo de funcao muda):
-- M1. REVOKE EXECUTE de PUBLIC e de `anon` nas 83 funcoes do sistema (3 + 23 + 57), nomeadas uma a uma abaixo.
-- M2. `authenticated` e `service_role` mantem exatamente o que tinham: as 83 eram executaveis pelos dois, em parte SO' por PUBLIC
--     (as tres DEFINER, por exemplo, nao tinham concessao direta a `authenticated`); cada uma e' re-concedida explicitamente.
-- M3. ALTER DEFAULT PRIVILEGES do papel `postgres` (o dono de toda funcao do sistema): funcao nova deixa de nascer com EXECUTE para
--     PUBLIC. ⚠ O padrao de PUBLIC e' GLOBAL do papel (nao existe revogar "so' neste schema": o padrao por schema so' ACRESCENTA),
--     entao vale para funcao que o `postgres` criar em qualquer schema. No `public` a funcao nova nasce so' com `postgres` e
--     `service_role`: QUEM A EXPOE A' TELA TEM DE DAR `GRANT EXECUTE … TO authenticated` NA PROPRIA MIGRATION.
--
-- EXCECAO NOMEADA — as 35 funcoes de EXTENSAO no schema `public` continuam executaveis por PUBLIC: `pg_trgm` (31) e `unaccent` (4).
-- Sao biblioteca (similaridade de texto e remocao de acento), puras, nao leem tabela; e pertencem ao `supabase_admin`, de quem o
-- `postgres` nao e' membro — medido: o REVOKE nelas nao da' erro e nao tem efeito, e `ALTER DEFAULT PRIVILEGES FOR ROLE
-- supabase_admin` e' recusado (42501). Nenhuma funcao e' chamada pela tela antes do login: nao ha' outra excecao.
--
-- IDEMPOTENTE: REVOKE e GRANT repetidos nao mudam nada. A guarda de origem aceita o estado medido (83 funcoes, md5 da lista) ou o
-- ja' aplicado (0); qualquer outro numero aborta — a lista abaixo e' explicita, e funcao nova aberta ficaria de fora calada.

DO $guarda$
DECLARE v_n int; v_h text;
BEGIN
  SELECT count(*), md5(string_agg(p.oid::regprocedure::text, E'\n' ORDER BY p.oid::regprocedure::text)) INTO v_n, v_h
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF NOT (v_n = 0 OR (v_n = 83 AND v_h = 'f44333c095a8460d92abde21890fd890')) THEN
    RAISE EXCEPTION 'funcoes do sistema abertas a anon: % (md5 %), esperado 83 (f44333c0…) ou 0. Migration abortada: refaca a lista.', v_n, v_h;
  END IF;
END $guarda$;

-- ═══ M1 + M2: fechar PUBLIC e anon, manter authenticated e service_role ═══
-- as 3 SECURITY DEFINER chamaveis
REVOKE EXECUTE ON FUNCTION public.fn_recorrencia_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_cancelar(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.oc_ajustar_valor_compromisso(uuid,uuid,integer,uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_ajustar_valor_compromisso(uuid,uuid,integer,uuid,numeric,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.oc_salvar_abate(uuid,uuid,integer,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_abate(uuid,uuid,integer,text,jsonb) TO authenticated, service_role;

-- as 23 SECURITY INVOKER chamaveis
REVOKE EXECUTE ON FUNCTION public._oc_valor_do_lote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_valor_do_lote(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.audit_modulo_from_lancamento_tipo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_modulo_from_lancamento_tipo(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.audit_resumo_lancamento(lancamentos) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_resumo_lancamento(lancamentos) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_zoot_importacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_zoot_importacao(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.classificar_nivel_duplicidade(date,numeric,text,uuid,uuid,text,text,text,date,numeric,text,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classificar_nivel_duplicidade(date,numeric,text,uuid,uuid,text,text,text,date,numeric,text,uuid,uuid,text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.compute_financeiro_lancamento_v2_hash(uuid,uuid,date,date,numeric,text,uuid,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_financeiro_lancamento_v2_hash(uuid,uuid,date,date,numeric,text,uuid,text,uuid,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_meta(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_meta(jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_conta(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_resolver_conta(uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_compoe_dre_por_macro(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_compoe_dre_por_macro(text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_conciliacao_cartoes(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_cartoes(uuid,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_diag_fechamento_sessao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diag_fechamento_sessao(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_dre_lavoura_historico(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_lavoura_historico(uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_expirar_stagings_antigos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_expirar_stagings_antigos() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_extrato_chave_doc(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_chave_doc(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_fornecedores_com_uso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedores_com_uso(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_gerar_codigo_conta(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_gerar_codigo_conta(uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_get_mesa_v2_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_mesa_v2_mode() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliar_financiamento(uuid,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reconciliar_financiamento(uuid,boolean,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_reconciliar_todos_financiamentos(uuid,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reconciliar_todos_financiamentos(uuid,boolean,boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_safra_sugerida(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_safra_sugerida(uuid,date,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_cache_ensure(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_zoot_cache_ensure(uuid,integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_cache_has_gap(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_zoot_cache_has_gap(uuid,integer) TO authenticated, service_role;

-- as 57 funcoes de trigger (nao se chamam direto; a porta fecha por regra, nao por risco)
REVOKE EXECUTE ON FUNCTION public.agri_local_estoque_default() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agri_local_estoque_default() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_chuvas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_trigger_chuvas() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_financeiro_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_trigger_financeiro_v2() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_lancamentos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_trigger_lancamentos() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.auto_add_owner_as_membro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_add_owner_as_membro() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.auto_create_transferencia_entrada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_create_transferencia_entrada() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_financeiro_lancamento_v2_unique_hash() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fin_classif_staging_set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_classif_staging_set_updated_at() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.financeiro_saldos_v2_apply_previous_extrato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_saldos_v2_apply_previous_extrato() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.financeiro_saldos_v2_normalize_round() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_saldos_v2_normalize_round() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.financeiro_saldos_v2_propagate_next_initial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_saldos_v2_propagate_next_initial() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_audit_conciliacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_conciliacao() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_bloqueia_delete_extrato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bloqueia_delete_extrato() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_bloqueia_mutacao_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bloqueia_mutacao_audit() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_cbi_desfazer_on_cancelamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cbi_desfazer_on_cancelamento() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_completar_categorias_saldo_inicial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_completar_categorias_saldo_inicial() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_guard_conciliacao_mes_fechado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_guard_conciliacao_mes_fechado() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_invalidar_snapshot_conjunto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_invalidar_snapshot_conjunto() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_lancamento_auto_derivar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_auto_derivar() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_normalizar_conta_por_direcao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_normalizar_conta_por_direcao() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_normalizar_nome_fornecedor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_normalizar_nome_fornecedor() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_propagar_saldo_dezembro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_propagar_saldo_dezembro() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_snapshot_conciliacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_snapshot_conciliacao() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_validate_fechamento_pasto_item() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_validate_fechamento_pasto_item() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_fechamento_pastos_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_fechamento_pastos_snapshot() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_financeiro_lancamento_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_financeiro_lancamento_v2() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_lancamento_mes_fechado_p1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_lancamento_mes_fechado_p1() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_meta_admin_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_meta_admin_only() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_pasto_itens_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_pasto_itens_snapshot() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_saldos_iniciais_mes_fechado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_saldos_iniciais_mes_fechado() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_staging_promovido_terminal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_staging_promovido_terminal() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_transferencia_conta_destino() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_transferencia_conta_destino() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_valor_rebanho_requer_p1_fechado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_valor_rebanho_requer_p1_fechado() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_zoo_financeiro_cancelamento_realizado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_zoo_financeiro_cancelamento_realizado() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.invalidate_snapshot_on_pasto_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invalidate_snapshot_on_pasto_change() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_editado_manual_on_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_editado_manual_on_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_financeiro_lancamento_v2_editado_manual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_financeiro_lancamento_v2_editado_manual() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.materializar_dre_lcdpr_from_plano() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materializar_dre_lcdpr_from_plano() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mesa_trg_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesa_trg_updated_at() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache_reclassificacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache_reclassificacao() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_escopo_planejamento_financeiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_escopo_planejamento_financeiro() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_boitel_planejamento_historico() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_boitel_planejamento_historico() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_financeiro_lancamento_v2_hash() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_financeiro_lancamento_v2_hash() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_lancamento_audit_fields() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lancamento_audit_fields() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_transferencia_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_transferencia_update() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_financiamento_parcelas_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_financiamento_parcelas_status() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_auto_codigo_conta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_auto_codigo_conta() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_fechamento_pasto_vigencia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_fechamento_pasto_vigencia() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_guard_lancamento_mes_fechado_p1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_guard_lancamento_mes_fechado_p1() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento_itens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento_itens() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache_fechamento() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache_saldos_iniciais() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache_saldos_iniciais() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trg_fn_invalidate_zoot_cache() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_cenario_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_cenario_status() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_lancamento_campos_por_tipo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_lancamento_campos_por_tipo() TO authenticated, service_role;

-- ═══ M3: funcao nova nao nasce aberta ═══
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ═══ guardas de destino ═══
DO $guarda$
DECLARE v_n int; v_h text; v_ext int;
BEGIN
  -- P1: nenhuma funcao do sistema executavel por anon (direto ou via PUBLIC)
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF v_n <> 0 THEN RAISE EXCEPTION 'ainda ha % funcao(oes) do sistema executavel(is) por anon', v_n; END IF;
  -- a excecao nomeada: so' as 35 de extensao (pg_trgm 31 + unaccent 4)
  SELECT count(*) INTO v_ext FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_ext <> 35 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e' JOIN pg_extension e ON e.oid = d.refobjid
                      WHERE n.nspname = 'public' AND e.extname IN ('pg_trgm', 'unaccent')) <> 35 THEN
    RAISE EXCEPTION 'excecao de extensao inesperada: % funcoes executaveis por anon', v_ext;
  END IF;
  -- P2: authenticated e service_role com o MESMO conjunto de antes
  SELECT count(*), md5(string_agg(p.oid::regprocedure::text, ',' ORDER BY p.oid::regprocedure::text)) INTO v_n, v_h
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_n <> 359 OR v_h <> 'a5fb70178994af1559d11fa95ec4bceb' THEN RAISE EXCEPTION 'authenticated mudou: % funcoes (md5 %)', v_n, v_h; END IF;
  SELECT count(*), md5(string_agg(p.oid::regprocedure::text, ',' ORDER BY p.oid::regprocedure::text)) INTO v_n, v_h
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_n <> 399 OR v_h <> 'd11c24b55b45d2a6cc187c46cec3b4dc' THEN RAISE EXCEPTION 'service_role mudou: % funcoes (md5 %)', v_n, v_h; END IF;
  -- P6: nenhum corpo mudou
  SELECT count(*), md5(string_agg(md5(p.prosrc), ',' ORDER BY p.oid::regprocedure::text)) INTO v_n, v_h
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';
  IF v_n <> 441 OR v_h <> 'e8aa344a16741e8fd7211f7d813c0721' THEN RAISE EXCEPTION 'corpo de funcao mudou: % funcoes (md5 %)', v_n, v_h; END IF;
  -- M3: o padrao global do postgres ja' nao da' EXECUTE a PUBLIC
  IF NOT EXISTS (SELECT 1 FROM pg_default_acl d WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f')
     OR EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) x
                 WHERE d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'f' AND d.defaclnamespace IN (0, 'public'::regnamespace)
                   AND (x.grantee = 0 OR x.grantee = 'anon'::regrole)) THEN
    RAISE EXCEPTION 'default privileges do postgres ainda abrem funcao nova a PUBLIC/anon';
  END IF;
END $guarda$;
