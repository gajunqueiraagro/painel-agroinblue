-- AUDIT-SEG-01 (Gabriel 20/10/2026) — parte 1, aplicavel a qualquer hora: so' funcoes, policies, GRANT/REVOKE e gatilhos nas
-- tabelas de TRILHA (que nao sao as tabelas quentes de negocio). Base: o relatorio da AUDITORIA-01 FASE 0 (20/10).
--
-- (1) A TRILHA E' IMUTAVEL: audit_log, audit_log_movimentacoes, fechamento_reaberturas_log, financeiro_saldos_audit e
--     zoo_operacao_eventos perdem UPDATE e DELETE para anon/authenticated (policy e privilegio) e ganham o gatilho
--     `_fn_trilha_imutavel` (BEFORE UPDATE OR DELETE), que recusa tambem quem passar pelas policies. So' o dono das funcoes
--     (postgres), service_role e supabase_admin passam — `oc_excluir_definitivamente` e `oc_limpar_operacao_teste` (SECURITY
--     DEFINER) apagam eventos da OC e continuam funcionando (isso e' do AUDIT-DELETE-01).
-- (2) O FRONT NUNCA ESCOLHE O AUTOR: o INSERT continua onde a tela ainda grava direto (audit_log_movimentacoes:
--     useLancamentos.ts:807, AbateFinanceiroPanel.tsx:281, CompraFinanceiroPanel.tsx:319, VendaFinanceiroPanel.tsx:580,
--     useBoitelOperacoes.ts:226/276/394; financeiro_saldos_audit: FinV2SaldosTab.tsx:438), e o gatilho `_fn_trilha_autor`
--     (BEFORE INSERT) sobrescreve o autor com auth.uid() e a data com now() sempre que ha' usuario logado ou o papel e'
--     anon/authenticated. Sem usuario e fora desses papeis (rotina do banco, service_role, backfill) o que veio fica.
-- (3) AUTOR VERDADEIRO nos gatilhos de trilha de financeiro_lancamentos_v2 e lancamentos: auth.uid(); nunca mais
--     COALESCE(NEW.updated_by|created_by, ...) — quem nao gravava updated_by herdava o editor anterior (o cancelamento saia com
--     o nome de quem editou antes). Sem usuario, o autor fica NULO. (A coluna `via` e o evento de criacao do financeiro sao
--     DDL em tabela quente: migration 20261028100100, depois das 20h.)
-- (4) conciliacao_audit_log LEGIVEL por membro do cliente (tenant_ok pelo cliente_id da linha; 0 linhas sem cliente em
--     20/10). Continua append-only (fn_bloqueia_mutacao_audit).

SET LOCAL lock_timeout = '2s';

-- ── (1) imutabilidade ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_trilha_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'A trilha de auditoria (%) não se altera nem se apaga. Nada foi gravado.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public._fn_trilha_imutavel() FROM PUBLIC, anon, authenticated;

-- ── (2) autor e data do INSERT ────────────────────────────────────────────────────────────────────────────────────────
-- TG_ARGV[0] = coluna do autor, TG_ARGV[1] = coluna da data.
CREATE OR REPLACE FUNCTION public._fn_trilha_autor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL OR current_user IN ('anon', 'authenticated') THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0], v_uid, TG_ARGV[1], now()));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._fn_trilha_autor() FROM PUBLIC, anon, authenticated;

DO $tabelas$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('audit_log', 'usuario_id', 'created_at'),
      ('audit_log_movimentacoes', 'usuario_id', 'created_at'),
      ('fechamento_reaberturas_log', 'reaberto_por', 'reaberto_em'),
      ('financeiro_saldos_audit', 'usuario_id', 'created_at'),
      ('zoo_operacao_eventos', 'usuario_id', 'created_at')) AS v(tabela, autor, data)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.tabela || '_update_tenant', t.tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.tabela || '_delete_tenant', t.tabela);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', t.tabela);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_trilha_imutavel ON public.%I', t.tabela);
    EXECUTE format('CREATE TRIGGER trg_trilha_imutavel BEFORE UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_imutavel()', t.tabela);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_trilha_autor ON public.%I', t.tabela);
    EXECUTE format('CREATE TRIGGER trg_trilha_autor BEFORE INSERT ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_autor(%L, %L)', t.tabela, t.autor, t.data);
  END LOOP;
END $tabelas$;

-- ── (3) autor verdadeiro nos gatilhos de trilha ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_trigger_financeiro_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
  v_resumo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_resumo := concat_ws(' | ', initcap(NEW.tipo_operacao), 'R$ ' || round(NEW.valor::numeric, 2), NEW.descricao);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, auth.uid(), 'financeiro', 'criou', 'financeiro_lancamentos_v2', NEW.id, v_resumo, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cancelado = true AND OLD.cancelado = false THEN v_acao := 'cancelou'; ELSE v_acao := 'editou'; END IF;
    v_resumo := concat_ws(' | ', initcap(NEW.tipo_operacao), 'R$ ' || round(NEW.valor::numeric, 2), NEW.descricao);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, auth.uid(), 'financeiro', v_acao, 'financeiro_lancamentos_v2', NEW.id, v_resumo, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.audit_trigger_lancamentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
  v_resumo text;
  v_old jsonb;
  v_new jsonb;
  v_modulo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criou';
    v_modulo := audit_modulo_from_lancamento_tipo(NEW.tipo);
    v_resumo := audit_resumo_lancamento(NEW);
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, auth.uid(), v_modulo, v_acao, 'lancamentos', NEW.id, v_resumo, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.cancelado = true AND OLD.cancelado = false THEN
      v_acao := 'cancelou';
    ELSE
      v_acao := 'editou';
    END IF;
    v_modulo := audit_modulo_from_lancamento_tipo(NEW.tipo);
    v_resumo := audit_resumo_lancamento(NEW);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (NEW.cliente_id, NEW.fazenda_id, auth.uid(), v_modulo, v_acao, 'lancamentos', NEW.id, v_resumo, v_old, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_modulo := audit_modulo_from_lancamento_tipo(OLD.tipo);
    v_resumo := audit_resumo_lancamento(OLD);
    v_old := to_jsonb(OLD);
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
    VALUES (OLD.cliente_id, OLD.fazenda_id, auth.uid(), v_modulo, 'excluiu', 'lancamentos', OLD.id, v_resumo, v_old);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- ── (4) conciliacao_audit_log legivel por membro do cliente ───────────────────────────────────────────────────────────
GRANT SELECT ON public.conciliacao_audit_log TO authenticated;
DROP POLICY IF EXISTS conciliacao_audit_log_select_tenant ON public.conciliacao_audit_log;
CREATE POLICY conciliacao_audit_log_select_tenant ON public.conciliacao_audit_log
  FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));

-- ── conferencia ───────────────────────────────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log','audit_log_movimentacoes','fechamento_reaberturas_log','financeiro_saldos_audit','zoo_operacao_eventos'] LOOP
    IF has_table_privilege('authenticated', format('public.%I', t), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', t), 'DELETE') THEN
      RAISE EXCEPTION 'AUDIT-SEG-01: % ainda aceita UPDATE/DELETE de authenticated', t;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', t), 'SELECT') THEN
      RAISE EXCEPTION 'AUDIT-SEG-01: % perdeu o SELECT de authenticated', t;
    END IF;
  END LOOP;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.audit_trigger_financeiro_v2'::regproc) ~* 'updated_by|created_by' THEN
    RAISE EXCEPTION 'AUDIT-SEG-01: audit_trigger_financeiro_v2 ainda le updated_by/created_by';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.audit_trigger_lancamentos'::regproc) ~* 'updated_by|created_by' THEN
    RAISE EXCEPTION 'AUDIT-SEG-01: audit_trigger_lancamentos ainda le updated_by/created_by';
  END IF;
END $confere$;
