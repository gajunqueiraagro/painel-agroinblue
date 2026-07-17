-- PR-PASTOS-VIGENCIA — Migração 1: pastos.data_fim
--
-- MOTIVACAO
-- ---------
-- `pastos` so tem `data_inicio`. Nao existe fim de vigencia, entao o unico proxy
-- e `ativo`, que e estado ATUAL e nao tem semantica temporal: desativar um pasto
-- hoje o removeria de todos os meses passados. `data_fim` da a metade que faltava
-- para a regra de intersecao mensal.
--
-- ADITIVA E CONSERVADORA
-- ----------------------
-- - Sem backfill: NULL = sem fim de vigencia conhecido. NAO inferir data_fim a
--   partir de `ativo` — sao conceitos distintos e a inferencia seria um chute
--   sobre historico real.
-- - Nenhum registro existente e alterado.
-- - Nao amplia grants nem RLS: coluna nova herda as policies da tabela.

ALTER TABLE public.pastos
  ADD COLUMN IF NOT EXISTS data_fim date NULL;

COMMENT ON COLUMN public.pastos.data_fim IS
  'Fim de vigencia do pasto (inclusivo). NULL = sem fim conhecido (vigente). Nao e derivado de `ativo`: `ativo` e estado atual, `data_fim` e historico. Usado com data_inicio na regra de intersecao mensal de fn_pastos_aplicaveis_mes.';

-- Coerencia minima do intervalo. NOT VALID: nao varre as linhas existentes (nao
-- ha data_fim preenchida ainda, logo nada a validar) e nao bloqueia a migracao.
-- Passa a valer para todo INSERT/UPDATE a partir daqui.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pastos'::regclass
       AND conname = 'pastos_vigencia_coerente_chk'
  ) THEN
    ALTER TABLE public.pastos
      ADD CONSTRAINT pastos_vigencia_coerente_chk
      CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT pastos_vigencia_coerente_chk ON public.pastos IS
  'data_fim nunca anterior a data_inicio. NOT VALID: aplica-se a novas escritas; nenhuma linha existente tem data_fim.';
