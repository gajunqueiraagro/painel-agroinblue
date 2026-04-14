-- Desabilitar trigger temporariamente
ALTER TABLE lancamentos DISABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;

-- 1. Mortes: observacao → fazenda_destino
UPDATE lancamentos
SET fazenda_destino = observacao
WHERE cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
  AND tipo = 'morte'
  AND cancelado = false
  AND (fazenda_destino IS NULL OR fazenda_destino = '')
  AND observacao IS NOT NULL AND observacao != '';

-- 2. Consumos: comprador_fornecedor → fazenda_destino
UPDATE lancamentos
SET fazenda_destino = comprador_fornecedor
WHERE cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
  AND tipo = 'consumo'
  AND cancelado = false
  AND (fazenda_destino IS NULL OR fazenda_destino = '')
  AND comprador_fornecedor IS NOT NULL AND comprador_fornecedor != '';

-- 3. Abates: comprador_fornecedor → fazenda_destino
UPDATE lancamentos
SET fazenda_destino = comprador_fornecedor
WHERE cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
  AND tipo = 'abate'
  AND cancelado = false
  AND (fazenda_destino IS NULL OR fazenda_destino = '')
  AND comprador_fornecedor IS NOT NULL AND comprador_fornecedor != '';

-- 4. Vendas: comprador_fornecedor → fazenda_destino
UPDATE lancamentos
SET fazenda_destino = comprador_fornecedor
WHERE cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
  AND tipo = 'venda'
  AND cancelado = false
  AND (fazenda_destino IS NULL OR fazenda_destino = '')
  AND comprador_fornecedor IS NOT NULL AND comprador_fornecedor != '';

-- 5. Compras: comprador_fornecedor → fazenda_destino
UPDATE lancamentos
SET fazenda_destino = comprador_fornecedor
WHERE cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'
  AND tipo = 'compra'
  AND cancelado = false
  AND (fazenda_destino IS NULL OR fazenda_destino = '')
  AND comprador_fornecedor IS NOT NULL AND comprador_fornecedor != '';

-- Reabilitar trigger
ALTER TABLE lancamentos ENABLE TRIGGER trg_guard_lancamento_mes_fechado_p1;