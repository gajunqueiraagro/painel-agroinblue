-- 20260618_mesa_staging_ofx_promovido_uniq.sql
-- P1.1 — Guard DB anti-duplicação da Mesa.
-- Impede o mesmo OFX (ofx_extrato_id) ser promovido mais de uma vez.
-- Órfãos (ofx_extrato_id NULL) não são afetados.
-- Aplicada no proto via Management API; este arquivo versiona o estado.

CREATE UNIQUE INDEX IF NOT EXISTS mesa_staging_ofx_promovido_uniq
  ON public.mesa_lancamento_staging (ofx_extrato_id)
  WHERE status_promocao = 'promovido'
    AND ofx_extrato_id IS NOT NULL;
