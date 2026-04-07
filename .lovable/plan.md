## Reestruturação: Cenário + Status Operacional

### Situação atual no banco
- 255 registros: `status_operacional='conciliado'`, `cenario='realizado'`
- 116 registros: `status_operacional='previsto'`, `cenario='meta'`
- Nenhum registro com `status_operacional='confirmado'`

### Mapeamento de migração
| Atual | Novo |
|-------|------|
| `conciliado` + `realizado` | `realizado` + `realizado` |
| `previsto` + `meta` | **NULL** + `meta` |
| `confirmado` (se houver) | `programado` + `realizado` |

---

### Fase 1 — Banco de dados (migration)
1. **Migrar dados**: `conciliado` → `realizado`, `confirmado` → `programado`, META → `status_operacional = NULL`
2. **Atualizar triggers**:
   - `auto_create_transferencia_entrada`: adaptar para novos valores
   - `sync_transferencia_update`: adaptar para novos valores
   - `guard_lancamento_mes_fechado_p1`: META = `cenario='meta'` (já funciona)
   - `validar_conciliacao_rebanho`: filtrar `status_operacional IS NOT NULL` ao invés de `!= 'previsto'`
   - `audit_trigger_lancamentos`: funciona sem mudança
3. **Criar CHECK constraint** (ou trigger de validação):
   - `cenario='meta'` → `status_operacional IS NULL`
   - `cenario='realizado'` → `status_operacional IN ('previsto','programado','agendado','realizado')`
4. **RLS para META**: Criar função `can_edit_meta()` que retorna `true` apenas para `admin_agroinblue`

---

### Fase 2 — Hooks e lógica (código)
1. **`statusOperacional.ts`**: Reestruturar completamente
   - Remover mapeamento `previsto/confirmado/conciliado`
   - Novos valores: `programado | realizado` (zoot) + `previsto | programado | agendado | realizado` (fin)
   - META não é status, é cenário
2. **`useLancamentos.ts`**: Atualizar insert/update para usar novos valores
3. **`useMetaConsolidacao.ts`**: Filtrar `cenario='meta'` (sem checar status)
4. **`useFechamento.ts`** e hooks de saldo: Filtrar `cenario='realizado' AND status_operacional='realizado'`
5. **Cálculos**: `isConciliado()` → `isRealizado()`, `isPrevisto()` → `isMeta()` (cenário)

---

### Fase 3 — UI e permissões (componentes)
1. **`LancamentosTab.tsx`**: Novo seletor de status com valores corretos por módulo
2. **Filtros de tela**: Zoot operacional = `cenario='realizado'`, META = `cenario='meta'`
3. **Permissão META no frontend**: Bloquear criação/edição/exclusão para perfis != `admin_agroinblue`
4. **Badges e labels**: Atualizar cores e textos
5. **Consolidação e painéis**: Validar que leitura está correta

---

### Valores finais por módulo

**Zootécnico operacional:**
- Programado: `cenario='realizado'`, `status_operacional='programado'`
- Realizado: `cenario='realizado'`, `status_operacional='realizado'`

**Financeiro operacional:**
- Previsto: `cenario='realizado'`, `status_operacional='previsto'`
- Programado: `cenario='realizado'`, `status_operacional='programado'`
- Agendado: `cenario='realizado'`, `status_operacional='agendado'`
- Realizado: `cenario='realizado'`, `status_operacional='realizado'`

**META (ambos módulos):**
- `cenario='meta'`, `status_operacional=NULL`

### Começo pela Fase 1 (migration) após aprovação.
