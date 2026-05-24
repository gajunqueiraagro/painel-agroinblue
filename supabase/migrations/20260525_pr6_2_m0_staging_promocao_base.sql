-- ============================================================
-- PR6.2-M0 — Base estrutural para promoção real do staging
-- Data: 2026-05-25
--
-- Adiciona auditoria de resolução de conta no staging (Cenário 2)
-- + vínculo bilateral staging ↔ financeiro_lancamentos_v2
-- + trigger guard "staging promovido é terminal" (bloqueia conteúdo,
--   permite campos operacionais de controle de reversão)
--
-- Decisões: validarAprovacao soberano (PR6.1C) + resolverContaPorTexto
-- soberano (PR6.1D) preservados.
--
-- Sem backfill: os stagings existentes ficam com NULL nos novos
-- campos. Eles deverão ser regerados após deploy do PR6.2-M0.5
-- antes de qualquer tentativa de promoção real.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Auditoria de resolução de conta no staging (Cenário 2)
-- ============================================================

ALTER TABLE mesa_lancamento_staging
  ADD COLUMN conta_texto_excel text NULL,
  ADD COLUMN conta_resolvida_id uuid NULL
    REFERENCES financeiro_contas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN conta_resolvida_score integer NULL,
  ADD COLUMN conta_resolvida_estrategia text NULL
    CHECK (conta_resolvida_estrategia IS NULL OR
           conta_resolvida_estrategia IN (
             'agencia_numero',
             'substring_exibicao',
             'substring_banco'
           ));

COMMENT ON COLUMN mesa_lancamento_staging.conta_texto_excel IS
  'Texto raw da coluna Conta da linha Excel (para auditoria)';

COMMENT ON COLUMN mesa_lancamento_staging.conta_resolvida_id IS
  'Conta resolvida via resolverContaPorTexto(linha.raw.Conta).
   Cenário 2: RPC fn_promover_staging rejeita se diferente de
   conta_bancaria_id.';

COMMENT ON COLUMN mesa_lancamento_staging.conta_resolvida_score IS
  'Score da resolução: 100=agencia_numero, 70=substring_exibicao,
   40=substring_banco';

COMMENT ON COLUMN mesa_lancamento_staging.conta_resolvida_estrategia IS
  'Estratégia da camada que resolveu (sem fallback semântico)';

-- ============================================================
-- 2. Vínculo bilateral staging ↔ financeiro_lancamentos_v2
-- ============================================================

ALTER TABLE financeiro_lancamentos_v2
  ADD COLUMN staging_id uuid NULL
    REFERENCES mesa_lancamento_staging(staging_id) ON DELETE SET NULL;

COMMENT ON COLUMN financeiro_lancamentos_v2.staging_id IS
  'FK reverso para o staging que gerou este lançamento.
   Usado pela RPC de reversão (PR6.3).';

-- ============================================================
-- 3. Índices de lookup
-- ============================================================

CREATE INDEX idx_flv2_staging_id
  ON financeiro_lancamentos_v2(staging_id)
  WHERE staging_id IS NOT NULL;

CREATE INDEX idx_staging_conta_resolvida
  ON mesa_lancamento_staging(conta_resolvida_id)
  WHERE conta_resolvida_id IS NOT NULL;

-- ============================================================
-- 4. Trigger guard — staging promovido é terminal
--
-- BLOQUEIA alteração de campos de CONTEÚDO após promoção
-- (conta, fazenda, valor, datas, categorização, fornecedor).
--
-- PERMITE alteração de campos de CONTROLE OPERACIONAL
-- (status_promocao, lancamento_v2_id, erro_promocao,
--  promovido_em, promovido_por, updated_at) — usados pela
-- RPC de reversão (PR6.3) ou recovery operacional.
-- ============================================================

CREATE OR REPLACE FUNCTION guard_staging_promovido_terminal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Aplica apenas quando staging já foi promovido
  IF OLD.lancamento_v2_id IS NOT NULL
     AND OLD.status_promocao = 'promovido' THEN

    -- Bloquear alterações em campos de CONTEÚDO
    IF NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id
       OR NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.sinal IS DISTINCT FROM OLD.sinal
       OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao
       OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento
       OR NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
       OR NEW.ano_mes IS DISTINCT FROM OLD.ano_mes
       OR NEW.macro_custo IS DISTINCT FROM OLD.macro_custo
       OR NEW.grupo_custo IS DISTINCT FROM OLD.grupo_custo
       OR NEW.centro_custo IS DISTINCT FROM OLD.centro_custo
       OR NEW.subcentro IS DISTINCT FROM OLD.subcentro
       OR NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio
       OR NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id
       OR NEW.favorecido_nome_marcado_novo IS DISTINCT FROM OLD.favorecido_nome_marcado_novo
       OR NEW.produto IS DISTINCT FROM OLD.produto
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.observacao IS DISTINCT FROM OLD.observacao
       OR NEW.ofx_extrato_id IS DISTINCT FROM OLD.ofx_extrato_id
       OR NEW.conta_texto_excel IS DISTINCT FROM OLD.conta_texto_excel
       OR NEW.conta_resolvida_id IS DISTINCT FROM OLD.conta_resolvida_id
       OR NEW.conta_resolvida_score IS DISTINCT FROM OLD.conta_resolvida_score
       OR NEW.conta_resolvida_estrategia IS DISTINCT FROM OLD.conta_resolvida_estrategia
       OR NEW.origem_aprovacao IS DISTINCT FROM OLD.origem_aprovacao
       OR NEW.excel_key IS DISTINCT FROM OLD.excel_key
       OR NEW.sessao_id IS DISTINCT FROM OLD.sessao_id THEN
      RAISE EXCEPTION
        'mesa_lancamento_staging promovido é IMUTÁVEL em campos de conteúdo. Use RPC de reversão (PR6.3) para reverter promoção antes de alterar.';
    END IF;

    -- Permite alterações em campos de CONTROLE OPERACIONAL:
    --   status_promocao, lancamento_v2_id, erro_promocao,
    --   promovido_em, promovido_por, updated_at
    -- (são usados pela RPC de reversão e recovery)
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_staging_promovido_terminal
  BEFORE UPDATE ON mesa_lancamento_staging
  FOR EACH ROW
  EXECUTE FUNCTION guard_staging_promovido_terminal();

COMMENT ON FUNCTION guard_staging_promovido_terminal IS
  'Bloqueia mutação de campos de conteúdo em staging promovido.
   Permite atualização de status_promocao/lancamento_v2_id/
   erro_promocao via RPC oficial.';

COMMIT;
