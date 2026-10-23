-- P62 (Gabriel 23/10/2026) — tipo_operacao "3-Transferência" (singular) fora do padrao "3-Transferências". MEDIDO no proto (23/10): 593
-- linhas no singular, 6 VIVAS e 587 canceladas; nenhuma nasce no singular desde 07/05/2026 (origem: importacao_incremental 512, migracao
-- 81); nenhum escritor de hoje grava o singular (o front so' le^ as duas grafias). As 6 vivas: um cliente, mar/2025, realizadas,
-- transferencia de conta para conta (origem ≠ destino), plano de transferencia, com grupo — transferencias DE VERDADE.
-- Corrige SO' as 6 vivas (pelos ids medidos E pela condicao). As canceladas ficam como estao (historico; a guarda as deixa passar).
-- Guarda: lancamento VIVO nunca no singular (CHECK; cancelado passa). Desfazer (se preciso), na mesma condicao:
--   UPDATE public.financeiro_lancamentos_v2 SET tipo_operacao = '3-Transferência' WHERE id IN (<os 6 abaixo>);  -- depois de DROP do CHECK
SET LOCAL lock_timeout = '2s';

DO $p62$
DECLARE n int;
BEGIN
  UPDATE public.financeiro_lancamentos_v2 SET tipo_operacao = '3-Transferências'
   WHERE tipo_operacao = '3-Transferência' AND NOT cancelado
     AND id IN ('88ce5cd3-61b9-4ddc-a1c3-a2fc557d4c80', '618bb276-f03d-45d3-9db9-56e5d90744e3', '4d0370f6-8682-4644-a51d-4e00ce8c2899',
                '92b6b613-96d2-4fbe-8904-8dfe9ad7b5df', '4a755b54-1660-4f82-bfda-0cc04837471d', '03885c54-e29c-4ee6-8144-4e7d3009a025');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE tipo_operacao = '3-Transferência' AND NOT cancelado) THEN
    RAISE EXCEPTION 'P62: apareceu outro lancamento vivo no singular (corrigidos %): medir antes de aplicar', n;
  END IF;
END $p62$;

ALTER TABLE public.financeiro_lancamentos_v2 ADD CONSTRAINT chk_transferencia_no_plural CHECK (cancelado OR tipo_operacao IS DISTINCT FROM '3-Transferência');
