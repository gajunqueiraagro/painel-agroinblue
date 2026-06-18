-- Aplicada no proto via Management API; arquivo versiona o estado.
-- Causa raiz: o CHECK antigo de conta_resolvida_estrategia rejeitava 'alias'
-- (introduzida pela PR de aliases 7e8eaf0a), abortando o upsert do staging (23514).

ALTER TABLE public.mesa_lancamento_staging
  DROP CONSTRAINT IF EXISTS mesa_lancamento_staging_conta_resolvida_estrategia_check;

ALTER TABLE public.mesa_lancamento_staging
  ADD CONSTRAINT mesa_lancamento_staging_conta_resolvida_estrategia_check
  CHECK (
    conta_resolvida_estrategia IS NULL
    OR conta_resolvida_estrategia = ANY (
      ARRAY[
        'alias',
        'agencia_numero',
        'substring_exibicao',
        'substring_banco'
      ]
    )
  );
