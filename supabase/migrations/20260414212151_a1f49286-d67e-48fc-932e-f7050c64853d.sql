ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;

UPDATE lancamentos
SET fazenda_origem = fazenda_destino,
    fazenda_destino = NULL
WHERE cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
  AND tipo = 'compra'
  AND cancelado = false
  AND fazenda_destino IS NOT NULL
  AND fazenda_destino != ''
  AND (fazenda_origem IS NULL OR fazenda_origem = '');

ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;