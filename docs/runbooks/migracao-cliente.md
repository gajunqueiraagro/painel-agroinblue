# Runbook — Migração de cliente PROD → proto

> Procedimento completo para migrar um cliente do banco de produção
> para o proto. Origem: Project Knowledge Abr/2026, limpo e
> atualizado. Credenciais NUNCA neste documento: acesso via Chrome
> MCP + Management API com token de sessão do dashboard.

## Pré-migração
1. Inventário completo no PROD — para cada tabela:
   SELECT COUNT(*) FROM <tabela> WHERE cliente_id = '<id>';
   Tabelas mínimas: fazendas, pastos, lancamentos, saldos_iniciais,
   fechamento_pastos, fechamento_pasto_itens, valor_rebanho_fechamento,
   valor_rebanho_fechamento_itens, valor_rebanho_mensal,
   financeiro_lancamentos_v2, financeiro_contas_bancarias,
   financeiro_saldos_bancarios, financeiro_saldos_bancarios_v2,
   financeiro_dividendos, financeiro_fornecedores, meta_gmd_mensal,
   chuvas, cliente_membros, pasto_geometrias, meta_preco_mercado,
   fazenda_cadastros, financeiro_contratos, fechamento_executivo,
   fechamento_reaberturas_log, analise_consultor,
   planejamento_financeiro.
2. Comparar schemas PROD vs PROTO antes de inserir — colunas extras
   causam erro 400/PGRST204. Sempre filtrar pelo schema do proto.

## Durante a migração
3. Desabilitar triggers INDIVIDUALMENTE (nunca DISABLE TRIGGER ALL —
   falha em system triggers, erro 42501). Antes de qualquer batch,
   LISTAR os triggers vigentes empiricamente:
   SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='lancamentos' AND NOT t.tgisinternal;
   Referência histórica (verificar sempre — a lista evolui):
   set_lancamento_audit, trg_audit_lancamentos,
   trg_auto_transferencia_entrada, trg_guard_lancamento_mes_fechado_p1,
   trg_guard_meta_admin_only, trg_invalidate_zoot_cache,
   trg_lancamento_auto_derivar, trg_sync_transferencia_update,
   trg_validate_cenario_status, trg_validate_lancamento_campos,
   update_lancamentos_updated_at. Em chuvas: trg_audit_chuvas.
4. Ordem de inserção (respeitar FK):
   clientes → fazendas (fix owner_id) → pastos →
   financeiro_contas_bancarias → cliente_membros → saldos_iniciais →
   lancamentos → chuvas → meta_gmd_mensal → fechamento_pastos →
   fechamento_pasto_itens → valor_rebanho_mensal →
   valor_rebanho_fechamento → valor_rebanho_fechamento_itens →
   financeiro_saldos_bancarios → financeiro_saldos_bancarios_v2 →
   financeiro_lancamentos_v2 → financeiro_dividendos →
   financeiro_fornecedores → demais.

## Pós-migração
5. Reabilitar TODOS os triggers (mesma lista, ENABLE).
6. Reconstruir cache zootécnico (procedimento vigente):
   SELECT fn_zoot_cache_rebuild('<cliente_id>'::uuid, <ano>);
   (um chamado por ano com dados). NUNCA reconstruir via
   DELETE+INSERT FROM vw_zoot_categoria_mensal no front — a view
   demora ~76s e causa timeout.
7. Fix categoria_id: lançamentos do PROD têm categoria como texto e
   categoria_id NULL. UPDATE mapeando pelo texto para os UUIDs da
   tabela categorias do proto (buscar os IDs vigentes no banco —
   não hardcodar).

## Armadilhas conhecidas (P1–P13, resumo)
- owner_id de fazendas não existe no proto igual ao PROD → apontar
  para o user admin do proto.
- chuvas: PROD tem colunas extras (observacao, created_by) →
  selecionar só colunas válidas.
- nivel_duplicidade é INTEGER no proto, texto "D1"/"D2" no PROD →
  converter não-numérico para NULL.
- trg_guard_meta_admin_only bloqueia INSERT → desabilitar antes.
- pasto_geometrias não tem cliente_id → filtrar via pasto_id IN (...).
- meta_preco_mercado: schema diverge (ano_mes,valor vs
  ano,mes,preco_arroba) → mapear campos.
- saldos_iniciais não tem preco_unitario → usar
  preco_kg = preco_cab / peso_medio.
- Dividendos são exclusivos por cliente — query sempre com
  cliente_id.
- RLS: query vazia pode ser policy bloqueando, não ausência de dado.
  Validar via anon key, nunca só pelo dashboard.

## Regras invioláveis
- Produção NUNCA recebe escrita.
- Escritas de teste: BEGIN/ROLLBACK.
- saldo_final do mês N = saldo_inicial do mês N+1 (rebanho e banco).
