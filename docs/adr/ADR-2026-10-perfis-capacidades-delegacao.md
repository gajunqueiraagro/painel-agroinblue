# ADR-2026-10 — Perfis, capacidades e teto de delegação
Status: ACEITO (14/07/2026) · Decide sobre: perfis, capacidades e teto de delegação

## Contexto e evidências
Enum `perfil_acesso` = {admin_agroinblue, gestor_cliente, financeiro, campo, leitura}; `financeiro`/`leitura` definidos mas 0 usos; `usePermissions` (front, visual) já consome os 5; `can_manage_financeiro_*` têm o padrão correto (`is_admin OR (cliente_id IN get_user_cliente_ids AND get_user_perfil IN (gestor_cliente,financeiro))`) mas são **advisory** (nenhuma policy os invoca).

## Decisão
Modelo **híbrido**: perfil base (enum) + capacidades por `(user,cliente)` + teto de delegação.
- Proprietário = `gestor_cliente` + `is_owner`. Consultor = múltiplas memberships (sem novo perfil).
- **Capacidades em tabela normalizada** (Alt B): `cliente_membro_capacidades(cliente_id, user_id, capacidade, permitido bool, atribuido_por, motivo, created_at, updated_at, UNIQUE(cliente_id,user_id,capacidade))`.
- `capacidade` ∈ **allowlist controlada**; `permitido=true/false` = override explícito (**positivo e negativo**); ausência de override → default do perfil; autoria = `auth.uid()`; alterações auditadas.
- **Delegabilidade = metadado da capacidade** (`delegável-por-gestor | só-proprietário | só-admin`), não texto livre.
- Allowlist inicial: `is_owner`, `can_reopen_periodo`, `can_close_financeiro`, `can_reopen_financeiro`, `can_manage_bank_accounts`, `can_manage_zoo_team`, `view_zoo/financeiro/patrimonio/endividamento/planejamento/auditoria/documents`.

## Invariantes
- Capacidade sempre com escopo (cliente ou fazenda) e autoria.
- Teto: ninguém concede capacidade que não possui ou não pode delegar; gestor comum não concede `admin_agroinblue`, `is_owner`, capacidade global ou acima do próprio nível.
- **O perfil `leitura` possui teto rígido de não mutação.** Overrides positivos **não podem** conceder capacidades de escrita, exclusão, aprovação, fechamento ou administração a uma membership cujo perfil-base seja `leitura`. Para permitir mutação, é obrigatória a **alteração explícita do perfil-base**, sujeita à autorização e auditoria correspondentes.
- **JSON proibido como fonte soberana de autorização.**

## Consequências
**+** exceções sem explosão de perfis; auditável; delegação controlada. **−** join adicional de capacidade nas policies.

## Alternativas consideradas
Colunas em `cliente_membros` (proliferação — rejeitada como fonte). Presets JSON (integridade/policy/auditoria difíceis — rejeitada como fonte soberana; permitido só como preset visual do front).

## Riscos e limitações
Policies mais complexas; defaults por perfil precisam ser codificados no helper de capacidade.

## Implicações para a Fase C
`SEC-IDENTIDADE-CONTRATOS-01` cria a tabela (sem trocar policies); `SEC-IDENTIDADE-HELPERS-01` cria `current_user_has_capability()`.

## Referências cruzadas
ADR-2026-09 (`is_owner`), ADR-2026-11 (escopo), ADR-2026-13 (capacidade no motor, passo 8; nunca amplia tenant/fazenda). Pacotes: `SEC-IDENTIDADE-CONTRATOS-01`, `SEC-IDENTIDADE-HELPERS-01`.
