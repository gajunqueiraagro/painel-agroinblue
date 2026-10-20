-- AUDIT-DELETE-01a (Gabriel 20/10/2026) — nada se apaga de verdade na conciliacao, no extrato, nos documentos, nos fornecedores e no
-- plano de contas. ⚠ APLICAR SO' ANTES DAS 07h OU DEPOIS DAS 20h (CREATE TRIGGER em extrato_bancario_v2 e
-- conciliacao_bancaria_itens, tabelas quentes). Ordem da noite: 20261028100100 -> esta -> 20261028100200 (o indice, fora de transacao).
-- Base: AUDITORIA-01 FASE 0 (20/10), item 2.4.
--
-- (1) SEM DELETE PARA A TELA: as policies de DELETE saem, `anon`/`authenticated` perdem o privilegio e o gatilho
--     `trg_sem_delete_direto` (BEFORE DELETE, `_fn_sem_delete_direto`) recusa quem nao e' o dono das funcoes (postgres,
--     service_role, supabase_admin). A cascata de FK (apagar um cliente pelo admin; lancamento -> documentos/vinculos/itens) roda
--     como o dono da tabela e passa — e fica na trilha. No extrato, o modo "log" do `fn_bloqueia_delete_extrato` e o
--     `app.mesa_v2_triggers_enforce` da sessao deixam de valer para o usuario: o gatilho novo recusa antes.
-- (2) TRILHA por gatilho em INSERT/UPDATE/DELETE (`trg_trilha_registro`, `_fn_trilha_registro`): audit_log com a linha antes e
--     depois, autor = auth.uid() (o `trg_trilha_autor` do AUDIT-SEG-01 garante) e o motivo de `app.motivo` no resumo. Linha sem
--     cliente (conta GLOBAL do plano) nao entra: audit_log.cliente_id e' obrigatorio e so' o admin/migration mexe nelas.
-- (3) OS GESTOS QUE SUBSTITUEM O DELETE DA TELA (SECURITY DEFINER, tenant pela linha, simulacao = gravacao com p_simular true por
--     padrao, motivo obrigatorio na gravacao):
--     · fn_conciliacao_item_desfazer(item, motivo, simular): marca desfeito_em/por/motivo (a coluna que ja' existia); a trilha da
--       conciliacao (fn_audit_conciliacao) registra junto.
--     · fn_fornecedor_excluir(fornecedor, motivo, simular): o fornecedor sai de uso (ativo = false), nunca e' apagado; com
--       lancamento vivo ou recorrencia ativa recusa com a frase de sempre ("mescle no cadastro certo").
--     Documentos ja' tinham o cancelar (fin_documento_cancelar); plano e vinculos nao tem DELETE na tela.

SET LOCAL lock_timeout = '2s';

-- ── (1) sem DELETE direto ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_sem_delete_direto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% não se apaga: use o gesto de cancelar ou desfazer da tela. Nada foi gravado.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public._fn_sem_delete_direto() FROM PUBLIC, anon, authenticated;

-- ── (2) trilha ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_trilha_registro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_cli uuid := (v_row->>'cliente_id')::uuid;
  v_motivo text := NULLIF(current_setting('app.motivo', true), '');
  v_acao text;
BEGIN
  IF v_cli IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  v_acao := CASE TG_OP WHEN 'INSERT' THEN 'criou' WHEN 'DELETE' THEN 'excluiu' ELSE 'editou' END;
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                dados_anteriores, dados_novos)
  VALUES (v_cli, (v_row->>'fazenda_id')::uuid, auth.uid(), 'financeiro', v_acao, TG_TABLE_NAME,
          COALESCE((v_row->>'id')::uuid, (v_row->>'documento_id')::uuid),
          CASE WHEN v_motivo IS NOT NULL THEN 'motivo: ' || v_motivo END,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public._fn_trilha_registro() FROM PUBLIC, anon, authenticated;

DO $tabelas$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['conciliacao_bancaria_itens', 'extrato_bancario_v2', 'financeiro_lancamento_documentos',
                           'financeiro_documento_vinculos', 'financeiro_fornecedores', 'financeiro_plano_contas'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE' LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sem_delete_direto ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_sem_delete_direto BEFORE DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public._fn_sem_delete_direto()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_trilha_registro ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_trilha_registro AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_registro()', t);
  END LOOP;
END $tabelas$;

-- ── (3) gestos ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_conciliacao_item_desfazer(p_item_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
BEGIN
  SELECT * INTO v_item FROM public.conciliacao_bancaria_itens WHERE id = p_item_id;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_item.cliente_id]);
  IF v_item.desfeito_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'recusa', jsonb_build_object('motivo', 'ja_desfeito',
      'frase', 'Este vínculo com o extrato já foi desfeito.'));
  END IF;
  IF NOT p_simular AND NULLIF(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo para desfazer o vínculo. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'item_id', v_item.id, 'extrato_id', v_item.extrato_id,
      'lancamento_id', v_item.lancamento_id);
  END IF;
  PERFORM set_config('app.motivo', btrim(p_motivo), true);
  UPDATE public.conciliacao_bancaria_itens
     SET desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = btrim(p_motivo)
   WHERE id = p_item_id;
  PERFORM set_config('app.motivo', '', true);
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'item_id', v_item.id, 'extrato_id', v_item.extrato_id,
    'lancamento_id', v_item.lancamento_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_item_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_item_desfazer(uuid, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_excluir(p_fornecedor_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_f record;
  v_uso jsonb;
BEGIN
  SELECT id, cliente_id, nome, ativo, fundido_em_id INTO v_f FROM public.financeiro_fornecedores WHERE id = p_fornecedor_id;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_f.cliente_id]);
  IF v_f.ativo IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'recusa', jsonb_build_object('motivo', 'ja_inativo',
      'frase', 'Este fornecedor já está fora de uso.'));
  END IF;
  v_uso := public._fn_fornecedor_prende_ativo(p_fornecedor_id);
  IF coalesce((v_uso->>'lancamentos')::int, 0) > 0 OR coalesce((v_uso->>'recorrencias')::int, 0) > 0 THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'uso', v_uso, 'recusa', jsonb_build_object('motivo', 'com_uso', 'frase', v_uso->>'frase'));
    END IF;
    RAISE EXCEPTION '% Nada foi gravado.', v_uso->>'frase' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_simular AND NULLIF(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo para excluir o fornecedor. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'fornecedor_id', v_f.id, 'uso', v_uso);
  END IF;
  PERFORM set_config('app.motivo', btrim(p_motivo), true);
  UPDATE public.financeiro_fornecedores SET ativo = false WHERE id = p_fornecedor_id;
  PERFORM set_config('app.motivo', '', true);
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'fornecedor_id', v_f.id);
END $$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_excluir(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_excluir(uuid, text, boolean) TO authenticated, service_role;

-- ── conferencia ───────────────────────────────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conciliacao_bancaria_itens', 'extrato_bancario_v2', 'financeiro_lancamento_documentos',
                           'financeiro_documento_vinculos', 'financeiro_fornecedores', 'financeiro_plano_contas'] LOOP
    IF has_table_privilege('authenticated', format('public.%I', t), 'DELETE') THEN
      RAISE EXCEPTION 'AUDIT-DELETE-01a: % ainda aceita DELETE de authenticated', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE') THEN
      RAISE EXCEPTION 'AUDIT-DELETE-01a: % ainda tem policy de DELETE', t;
    END IF;
  END LOOP;
END $confere$;
