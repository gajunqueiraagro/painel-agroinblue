# ADR-2026-09 — Administração global e propriedade do cliente
Status: ACEITO (14/07/2026) · Decide sobre: administração global e propriedade do cliente

## Contexto e evidências
`is_admin_agroinblue(_user_id uuid DEFAULT auth.uid())→boolean` lê `cliente_membros.perfil='admin_agroinblue'` **sem filtro de cliente** → admin de 1 cliente = admin global. Tabela `admin_agroinblue`={1 user}, **não lida por nenhuma função, policy ou edge** (as edge autorizam por `get_user_perfil==='gestor_cliente'`). Não há conceito de proprietário. `perfil='admin_agroinblue'` não é atribuível pelo app (fora do allowlist de `criar-usuario` e do dropdown de AcessosTab).

## Decisão
- **`admin_agroinblue` (tabela) = fonte soberana de admin global**, com **estado soberano separado de log append-only**:
  - `admin_agroinblue` (estado atual): `user_id UNIQUE, ativo, updated_at` — uma linha por usuário; mutável só por processo restrito.
  - `admin_agroinblue_audit` (append-only): `user_id, evento (concessão|revogação|reativação|tentativa_bloqueada), motivo, ator, created_at` — **UPDATE e DELETE proibidos** (trigger imutável). O `motivo` pertence a cada evento, não à linha soberana.
- Helper zero-arg `current_user_is_admin()` — lê apenas a existência **ativa** de `auth.uid()` na tabela soberana; `false` para anon; não devolve a lista de admins.
- `is_owner(user,cliente)` = capacidade de titularidade (protege remoção, transfere titularidade, gere gestores); não atribuível por gestor comum.
- Transição atômica curta e observável (popular → validar → trocar helper → testar → desativar perfil), evitando duas autoridades ativas por período prolongado.

## Invariantes
- Admin global só pela tabela soberana; provisionamento do primeiro admin **exclusivamente por processo operacional privilegiado, fora da superfície comum da aplicação**; recuperação emergencial por procedimento controlado, **nunca endpoint público ou bypass permanente**.
- Reativação é nova transição auditada.
- Proteção do último admin ativo (não desativar/revogar o último).
- **O bypass do admin global concede apenas autorização de plataforma. Não altera nem materializa memberships, não cria vínculos permanentes, não modifica `farm_scope`. Operações que produzem registros de negócio exigem tenant de destino explícito e validado.** Admin "vê tudo" ≠ admin "é membro de tudo".
- Toda ação admin auditada (ator, cliente, fazenda, operação, motivo, antes/depois). Sem impersonação nesta fase.

## Consequências
**+** admin auditável, desacoplado de tenant; separação clara admin-plataforma × gestor-cliente. **−** transição precisa de janela sem duas fontes ativas.

## Alternativas consideradas
Manter perfil por-cliente como fonte (rejeitada — fonte frágil, escapa do tenant). Leitura dual permanente (rejeitada — prolonga duas autoridades).

## Riscos e limitações
Deny-all se o helper trocar antes de a tabela estar populada/validada; perder o único admin real na migração. Ambos são **gates de implementação** (Fase C), não decisões abertas.

## Implicações para a Fase C
Pacote `SEC-IDENTIDADE-ADMIN-01` (migração atômica isolada — afeta todas as policies que usam o bypass global). Canário anti-deny-all obrigatório.

## Referências cruzadas
ADR-2026-13 (`current_user_is_admin()` no motor de autorização, passo 2/3), ADR-2026-15 (rollout/canário), ADR-2026-10 (`is_owner` como capacidade). Pacote: `SEC-IDENTIDADE-ADMIN-01`.
