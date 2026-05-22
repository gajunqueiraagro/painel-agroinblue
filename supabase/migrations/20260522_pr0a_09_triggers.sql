-- PR0.A · Mesa Operacional v2 · Triggers de defesa
-- Todas as triggers respeitam o setting app.mesa_v2_triggers_enforce.
-- Modo log = registra warning, NÃO bloqueia.
-- Modo enforce = bloqueia com RAISE EXCEPTION.
-- Modo off = bypass total.
-- Audit append-only é EXCEÇÃO: enforce desde dia 1, ignora setting.

-- =====================================================================
-- 1) Audit append-only (INSERT only, sem setting — enforce permanente)
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_bloqueia_mutacao_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conciliacao_audit_log é append-only. % proibido.', TG_OP
    USING ERRCODE = 'P0001',
          HINT = 'Audit trail não pode ser alterado nem deletado por design (princípio 8).';
END $$;

COMMENT ON FUNCTION fn_bloqueia_mutacao_audit() IS
'Mesa Operacional v2. Bloqueia UPDATE e DELETE em conciliacao_audit_log.
Enforcement permanente desde PR0.A (não respeita setting). Criada PR0.A.';

DROP TRIGGER IF EXISTS trg_audit_bloqueia_update ON conciliacao_audit_log;
CREATE TRIGGER trg_audit_bloqueia_update
  BEFORE UPDATE ON conciliacao_audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_mutacao_audit();

DROP TRIGGER IF EXISTS trg_audit_bloqueia_delete ON conciliacao_audit_log;
CREATE TRIGGER trg_audit_bloqueia_delete
  BEFORE DELETE ON conciliacao_audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_mutacao_audit();

-- =====================================================================
-- 2) Snapshot automático em conciliacao_bancaria_itens (sem setting)
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_snapshot_conciliacao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_extrato RECORD; v_lanc RECORD;
BEGIN
  SELECT id, valor, data_movimento, historico
    INTO v_extrato
  FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

  SELECT id, valor, data_pagamento, favorecido_id
    INTO v_lanc
  FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id;

  NEW.snapshot_extrato_valor     := v_extrato.valor;
  NEW.snapshot_extrato_data      := v_extrato.data_movimento;
  NEW.snapshot_historico_banco   := v_extrato.historico;
  NEW.snapshot_lancamento_valor  := v_lanc.valor;
  NEW.snapshot_lancamento_data   := v_lanc.data_pagamento;
  NEW.snapshot_favorecido_id     := v_lanc.favorecido_id;
  NEW.snapshot_flags_no_momento  := jsonb_build_object(
    'extrato_suspeita_valor',     COALESCE((SELECT flag_suspeita_valor FROM extrato_bancario_v2 WHERE id = NEW.extrato_id), false),
    'extrato_suspeita_fornecedor', COALESCE((SELECT flag_suspeita_fornecedor FROM extrato_bancario_v2 WHERE id = NEW.extrato_id), false),
    'lanc_editado_manual',         COALESCE((SELECT editado_manual FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id), false),
    'lanc_orfao_definitivo',       COALESCE((SELECT orfao_definitivo FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id), false)
  );
  NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());

  RETURN NEW;
END $$;

COMMENT ON FUNCTION fn_snapshot_conciliacao() IS
'Mesa Operacional v2. Preenche snapshots e aprovado_em no INSERT de conciliacao.
Preserva contexto histórico (princípio 9). Sem setting — sempre executa. Criada PR0.A.';

DROP TRIGGER IF EXISTS trg_snapshot_conciliacao ON conciliacao_bancaria_itens;
CREATE TRIGGER trg_snapshot_conciliacao
  BEFORE INSERT ON conciliacao_bancaria_itens
  FOR EACH ROW EXECUTE FUNCTION fn_snapshot_conciliacao();

-- =====================================================================
-- 3) Audit automático: registra criação/desfazimento de conciliação
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_audit_conciliacao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_cliente_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT cliente_id INTO v_cliente_id
    FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

    INSERT INTO conciliacao_audit_log (
      acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id,
      payload_depois
    ) VALUES (
      'conciliacao_criada', NEW.aprovado_por,
      v_cliente_id,
      NEW.extrato_id, NEW.lancamento_id, NEW.id,
      to_jsonb(NEW)
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' AND OLD.desfeito_em IS NULL AND NEW.desfeito_em IS NOT NULL THEN
    SELECT cliente_id INTO v_cliente_id
    FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

    INSERT INTO conciliacao_audit_log (
      acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id,
      payload_antes, payload_depois, motivo
    ) VALUES (
      'conciliacao_desfeita', NEW.desfeito_por,
      v_cliente_id,
      NEW.extrato_id, NEW.lancamento_id, NEW.id,
      to_jsonb(OLD), to_jsonb(NEW), NEW.desfeito_motivo
    );
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION fn_audit_conciliacao() IS
'Mesa Operacional v2. Registra criação/desfazimento de conciliação em
conciliacao_audit_log. Sem setting — sempre executa. Criada PR0.A.';

DROP TRIGGER IF EXISTS trg_audit_conciliacao ON conciliacao_bancaria_itens;
CREATE TRIGGER trg_audit_conciliacao
  AFTER INSERT OR UPDATE ON conciliacao_bancaria_itens
  FOR EACH ROW EXECUTE FUNCTION fn_audit_conciliacao();

-- =====================================================================
-- 4) Guard: conciliação em mês fechado (modo log/enforce/off)
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_guard_conciliacao_mes_fechado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_mode TEXT;
  v_cliente_id UUID;
  v_conta_id UUID;
  v_ano_mes TEXT;
  v_mes_fechado BOOLEAN;
BEGIN
  v_mode := fn_get_mesa_v2_mode();
  IF v_mode = 'off' THEN RETURN NEW; END IF;

  SELECT cliente_id, conta_bancaria_id, to_char(data_movimento,'YYYY-MM')
    INTO v_cliente_id, v_conta_id, v_ano_mes
  FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

  SELECT EXISTS (
    SELECT 1 FROM financeiro_saldos_bancarios_v2
    WHERE cliente_id = v_cliente_id
      AND conta_bancaria_id = v_conta_id
      AND ano_mes = v_ano_mes
      AND status_mes = 'fechado'
  ) INTO v_mes_fechado;

  IF v_mes_fechado THEN
    IF v_mode = 'log' THEN
      INSERT INTO conciliacao_audit_log (
        acao, cliente_id, extrato_id, lancamento_id, conciliacao_id, ano_mes, motivo
      ) VALUES (
        'warning_mes_fechado', v_cliente_id, NEW.extrato_id, NEW.lancamento_id,
        NEW.id, v_ano_mes,
        format('mode=log: conciliação em conta %s mês %s (FECHADO) — não bloqueado',
               v_conta_id::text, v_ano_mes)
      );
      RETURN NEW;
    ELSIF v_mode = 'enforce' THEN
      RAISE EXCEPTION 'Conciliação bloqueada: conta % mês % está fechado',
        v_conta_id, v_ano_mes
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION fn_guard_conciliacao_mes_fechado() IS
'Mesa Operacional v2. Verifica se a conta+mês do extrato está fechado.
Respeita setting app.mesa_v2_triggers_enforce: off / log / enforce.
Criada PR0.A em modo log.';

DROP TRIGGER IF EXISTS trg_guard_conciliacao_mes_fechado ON conciliacao_bancaria_itens;
CREATE TRIGGER trg_guard_conciliacao_mes_fechado
  BEFORE INSERT ON conciliacao_bancaria_itens
  FOR EACH ROW
  WHEN (NEW.desfeito_em IS NULL)
  EXECUTE FUNCTION fn_guard_conciliacao_mes_fechado();

-- =====================================================================
-- 5) Guard: DELETE físico em extrato_bancario_v2 (modo log/enforce/off)
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_bloqueia_delete_extrato()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_mode TEXT;
BEGIN
  v_mode := fn_get_mesa_v2_mode();
  IF v_mode = 'off' THEN RETURN OLD; END IF;

  IF v_mode = 'log' THEN
    INSERT INTO conciliacao_audit_log (
      acao, cliente_id, extrato_id, motivo, payload_antes
    ) VALUES (
      'warning_delete_extrato', OLD.cliente_id, OLD.id,
      'mode=log: DELETE físico em extrato_bancario_v2 — não bloqueado (use soft delete)',
      to_jsonb(OLD)
    );
    RETURN OLD;
  ELSIF v_mode = 'enforce' THEN
    RAISE EXCEPTION 'DELETE direto bloqueado em extrato_bancario_v2. Use fluxo de reversão.'
      USING ERRCODE = 'P0001',
            HINT = 'Princípio 10: banco independe do financeiro. Use cancelado_em.';
  END IF;

  RETURN OLD;
END $$;

COMMENT ON FUNCTION fn_bloqueia_delete_extrato() IS
'Mesa Operacional v2. Bloqueia DELETE físico em extrato_bancario_v2.
Princípio 10 da Constituição: banco independe do financeiro.
Respeita setting app.mesa_v2_triggers_enforce. Criada PR0.A em modo log.';

DROP TRIGGER IF EXISTS trg_bloqueia_delete_extrato ON extrato_bancario_v2;
CREATE TRIGGER trg_bloqueia_delete_extrato
  BEFORE DELETE ON extrato_bancario_v2
  FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_delete_extrato();
