-- Temporarily disable guards for closed months
ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;
ALTER TABLE lancamentos DISABLE TRIGGER trg_sync_transferencia_update;

-- Fix saídas Bom Retiro: UUID → nome
UPDATE lancamentos
SET fazenda_destino = 'Faz. Sta. Rita'
WHERE fazenda_id = '682419f9-8b70-4ae4-8aa6-5320ef40db97'
  AND tipo = 'transferencia_saida'
  AND cancelado = false
  AND data BETWEEN '2023-06-01' AND '2023-08-31'
  AND fazenda_destino = '161b905e-f14c-4a9b-965f-dd3c8f82dc74';

-- Fix entradas Sta. Rita: set fazenda_origem
UPDATE lancamentos
SET fazenda_origem = 'Faz. Bom Retiro'
WHERE fazenda_id = '161b905e-f14c-4a9b-965f-dd3c8f82dc74'
  AND tipo = 'transferencia_entrada'
  AND cancelado = false
  AND origem_registro = 'backfill_par'
  AND data BETWEEN '2023-06-01' AND '2023-08-31';

-- Also set fazenda_destino on entries to current farm name
UPDATE lancamentos
SET fazenda_destino = 'Faz. Sta. Rita'
WHERE fazenda_id = '161b905e-f14c-4a9b-965f-dd3c8f82dc74'
  AND tipo = 'transferencia_entrada'
  AND cancelado = false
  AND origem_registro = 'backfill_par'
  AND data BETWEEN '2023-06-01' AND '2023-08-31';

-- Re-enable triggers
ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;
ALTER TABLE lancamentos ENABLE TRIGGER trg_sync_transferencia_update;