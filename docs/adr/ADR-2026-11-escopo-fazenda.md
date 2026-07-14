# ADR-2026-11 — Escopo de fazenda
Status: ACEITO (14/07/2026) · Decide sobre: escopo de fazenda

## Contexto e evidências
`fazenda_membros` só `papel='dono'` (13 linhas, 1 user); ausência de linhas hoje é ambígua. `is_fazenda_member(_user_id,_fazenda_id)→boolean` existe.

## Decisão
- **`farm_scope ∈ {all, selected, none}`** = propriedade da relação usuário–cliente, armazenada em `cliente_membros.farm_scope` (ou estrutura 1:1 vinculada à membership se o desenho físico recomendar). **Não é capacidade independente.**
- `fazenda_membros` representa a lista **apenas quando `farm_scope='selected'`**.
- Defaults por perfil: `campo`→`selected` (lista vazia = **nenhum** acesso); `gestor_cliente`→`all`; `financeiro`→`all` (restrição por fazenda opcional, só para dados fazenda-scoped; operações banco-globais do cliente não somem); `leitura`→explícito, default seguro **`none`**; `admin_agroinblue`→independe de `farm_scope`.
- Deprecar `papel` como input de autorização.

## Invariantes
- **Ausência de linhas nunca é fonte soberana de significado** — `farm_scope` é sempre explícito.
- `campo` sem fazenda = acesso nenhum (não "todas").
- Operações banco-globais do cliente não desaparecem por restrição de fazenda.

## Consequências
**+** elimina semântica invisível. **−** backfill de `farm_scope` para memberships atuais.

## Alternativas consideradas
Semântica implícita por ausência de linhas — rejeitada (ambígua e invisível ao usuário).

## Riscos e limitações
Memberships legadas sem `farm_scope` → tratar como `none` seguro até backfill.

## Implicações para a Fase C
`SEC-IDENTIDADE-CONTRATOS-01` adiciona `farm_scope`; helper `current_user_fazendas(cliente_id)` / `current_user_can_access_fazenda(cliente_id, fazenda_id)`. Backfill por perfil.

## Referências cruzadas
ADR-2026-13 (farm_scope no motor, passo 6; helpers), ADR-2026-10 (defaults por perfil). Pacotes: `SEC-IDENTIDADE-CONTRATOS-01`, `SEC-RLS-ZOO-01`, `SEC-RLS-FIN-01`.
