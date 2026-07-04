# Runbook — Importação zootécnica em lote (tabela lancamentos)

## Antes de inserir
ALTER TABLE lancamentos DISABLE TRIGGER trg_invalidate_zoot_cache;
(demais triggers: avaliar conforme runbook de migração de cliente)

## Campos obrigatórios por linha
id, cliente_id, fazenda_id, data, tipo, categoria_id, categoria,
quantidade, peso_total, peso_medio_kg, valor_total, preco_unitario,
ano_mes, cenario='realizado', origem='importacao', cancelado=false,
status_operacional='realizado'  ← OBRIGATÓRIO (omissão gera
lançamento inválido).
Condicionais: comprador_fornecedor (origens/destinos), motivo
(mortes), abate_frigorifico (abates), rendimento (abates/vendas).

## Regra de arroba
carcaça/15 SOMENTE para abate; peso vivo/30 para todo o resto.

## Depois de inserir
ALTER TABLE lancamentos ENABLE TRIGGER trg_invalidate_zoot_cache;
Reconstruir cache (procedimento vigente):
SELECT fn_zoot_cache_rebuild('<cliente_id>'::uuid, <ano>);
NUNCA usar DELETE+INSERT FROM vw_zoot_categoria_mensal (view ~76s →
timeout / idle-in-transaction aborted no front).
