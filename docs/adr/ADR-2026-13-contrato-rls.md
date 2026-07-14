# ADR-2026-13 — Contrato de RLS e motor de autorização
Status: ACEITO (14/07/2026) · Decide sobre: contrato de RLS e motor de autorização

## Contexto e evidências
RLS habilitada mas `USING(true)` nas operacionais (`financeiro_lancamentos_v2`, `lancamentos`, `fazendas`, `pasto_movimentacoes`; `cliente_membros` tem `true` OR `auth.uid()=user_id` → `true` vence). 3 blindadas corretas usam **subselect direto** em `cliente_membros`. Helpers reais: `is_admin_agroinblue(_user_id uuid DEFAULT auth.uid())→boolean`, `get_user_cliente_ids(_user_id uuid)→SETOF uuid`, `get_user_perfil(_user,_cliente)→perfil_acesso`, `is_cliente_member/is_fazenda_member→boolean` — todos SECDEF, `search_path=public`, owner postgres.

## Decisão
- **Helpers orientados ao ator atual** (derivam `auth.uid()`, sem `_user_id` arbitrário): `current_user_cliente_ids()→SETOF uuid`, `current_user_perfil(cliente_id)→perfil_acesso`, `current_user_is_admin()→boolean`, `current_user_has_capability(cliente_id, capacidade)→boolean`, `current_user_fazendas(cliente_id)→SETOF uuid`, `current_user_can_access_fazenda(cliente_id, fazenda_id)→boolean`, `current_user_is_owner(cliente_id)→boolean`. Retornam vazio/false para `auth.uid() IS NULL`; não inspecionam terceiros. Os helpers com `_user_id` param passam a **administrativos, restritos** (ex.: `admin_get_user_perfil(target_user_id, cliente_id)` com autorização admin interna).
- **SECURITY DEFINER endurecido**: objetos qualificados por schema; `search_path` fixo e mínimo (avaliar `SET search_path = pg_catalog, public` ou schema privado dedicado — `search_path=public` não é declarado seguro sem revisar quem cria objetos no schema); owner controlado; grants explícitos; **remoção de PUBLIC e anon**; allowlist para `authenticated`; corpo sem SQL dinâmico desnecessário; validação interna de `auth.uid()`; revisão por `proacl`/`aclexplode`.
- **Policies por comando** (não uma policy genérica):
  - `SELECT USING (current_user_is_admin() OR (cliente_id IN (SELECT current_user_cliente_ids()) [AND current_user_can_access_fazenda(cliente_id, fazenda_id) para fazenda-scoped]))`
  - `INSERT WITH CHECK (cliente_id IN (SELECT current_user_cliente_ids()) AND [current_user_can_access_fazenda(...) se fazenda-scoped] AND current_user_has_capability(cliente_id, <cap>))`
  - `UPDATE USING (<linha existente autorizada + fazenda>) WITH CHECK (<novo estado + tenant/fazenda>)`
  - `DELETE` conforme classificação (abaixo).
  Tabelas cliente-scoped (banco global) omitem o filtro de fazenda. Forma por conjunto: `fazenda_id IN (SELECT current_user_fazendas(cliente_id))`.
- **Uso de helper é dirigido, não universal**: consultas de pertencimento/administração/capacidade usam helper seguro quando necessário para evitar recursão, centralizar contrato ou isolar `cliente_membros`; **condições locais simples da própria linha** (coluna imutável × `auth.uid()`) podem ficar diretas, desde que não dupliquem autorização sensível; regras transacionais complexas → RPC autorizada.
- **As três tabelas atualmente blindadas permanecem como canários positivos.** Seus contratos de acesso devem ser **preservados** durante o rollout. Cada pacote poderá **manter a condição direta existente** ou migrá-la para helper **somente se houver necessidade técnica comprovada** — prevenção de recursão, centralização de uma regra sensível ou redução real de duplicação — e **após testes que demonstrem equivalência**. **Uniformidade isolada não justifica refatoração de policy segura.**
- **Classificação de DELETE por natureza:**
  - **Físico proibido** (usar cancelamento/inativação/reversão/status/RPC + auditoria): lançamentos oficiais, conciliações, fechamentos, patrimônio, movimentações zoo consolidadas, registros contábeis/auditáveis.
  - **Físico potencialmente permitido** (com capacidade + escopo corretos): rascunhos, staging não-promovido, temporários, arquivos regeneráveis, config sem histórico. Cada pacote de RLS classifica suas tabelas antes de definir a policy de DELETE.
- **Motor de autorização — fluxo canônico:**
  1. Se `auth.uid()` for nulo ou inválido, **negar**.
  2. Verificar `current_user_is_admin()`.
  3. Se for administrador global, aplicar o **bypass de plataforma** definido no ADR-09: **não** exigir membership nem `farm_scope`, mas **continuar exigindo tenant de destino explícito e validado** para operações de negócio, **além das regras específicas do recurso, que também se aplicam ao administrador**.
  4. Se **não** for administrador global, exigir **membership ativa**.
  5. Validar **tenant**.
  6. Validar **`farm_scope`**, quando o recurso for fazenda-scoped.
  7. Aplicar o **default do perfil**.
  8. Aplicar **overrides de capacidade**.
  9. Aplicar **regras específicas do recurso e validações do novo estado (WITH CHECK, mês fechado, invariantes de negócio)**.
  Para usuários **não administrativos**, a primeira negação encerra. **A capacidade nunca supera falha de identidade, membership, tenant ou fazenda.** O administrador global não precisa de membership, mas **não** ignora mês fechado, invariantes de negócio, `WITH CHECK` nem tenant de destino.

## Invariantes
- Enforcement de tenant/fazenda no banco, não no front.
- **Capacidades (passo 8) nunca ampliam escopo de tenant (passo 5) ou de fazenda (passo 6)** — só modulam dentro do escopo já autorizado.
- DELETE físico proibido em tabelas com histórico.
- `auth.uid() IS NULL` → helpers vazios/false → zero linhas.
- **Independentemente da estratégia do ADR-08, referências órfãs, usuários removidos ou identidades sem membership ativa nunca ampliam autorização.**
- Helper administrativo (com alvo explícito) nunca é helper genérico aberto.

## Consequências
**+** isolamento real; muda de camada sem cascata; contrato verificável. **−** helpers novos a criar/endurecer; as três blindadas permanecem como referência de comportamento correto e **podem ou não migrar** para helpers conforme decisão fundamentada do pacote correspondente.

## Alternativas consideradas
Policy genérica única (rejeitada — some com nuance por comando). Manter subselect direto em `cliente_membros` como padrão (avaliado — aceitável onde já correto; migração só com necessidade comprovada). Helpers com `_user_id` aberto para policies (rejeitada — permite inspecionar terceiros).

## Riscos e limitações
Recursão se helper não for definer; deny-all se helper perder EXECUTE de `authenticated`. Criação/ACL/SECDEF dos helpers e o canário são **provas de conformidade da Fase C**.

## Implicações para a Fase C
`SEC-IDENTIDADE-HELPERS-01` (helpers current_user_*), depois `SEC-MEMBROS-BASE-01` e `SEC-RLS-*`. Cada tabela classifica DELETE antes da policy.

## Referências cruzadas
ADR-2026-08 (identidade/órfã), 09 (admin no passo 2/3), 10 (capacidade no passo 8), 11 (farm_scope no passo 6), 12 (anon), 15 (rollout/gate ACL). Pacotes: `SEC-IDENTIDADE-HELPERS-01`, `SEC-MEMBROS-BASE-01`, `SEC-RLS-CADASTROS/ZOO/FIN-01`.
