-- Desabilitar trigger temporariamente
ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;

-- Backfill: copiar observacao → fazenda_destino para mortes sem motivo
UPDATE lancamentos
SET fazenda_destino = observacao
WHERE fazenda_id = '161b905e-f14c-4a9b-965f-dd3c8f82dc74'
  AND tipo = 'morte'
  AND cancelado = false
  AND (fazenda_destino IS NULL OR fazenda_destino = '')
  AND observacao IS NOT NULL
  AND observacao != '';

-- Reabilitar trigger
ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;