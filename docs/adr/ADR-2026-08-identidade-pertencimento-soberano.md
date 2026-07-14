# ADR-2026-08 — Identidade, pertencimento e autoria histórica
Status: ACEITO (14/07/2026) · Decide sobre: identidade, pertencimento e autoria histórica

## Contexto e evidências
Perícia read-only (proto `binbcdfbisgscrifztia`). `auth.users`=1 usuário real. `profiles`=0 linhas, lida por 3 telas (useLancamentos, AcessosTab, AuditoriaTab), escrita apenas por `handle_new_user` — que **não está ligada a nenhum trigger** (0 triggers em `auth.users`). `cliente_membros`=8 linhas (4 user_ids), fonte de pertencimento; multi-tenant por usuário e papel-por-cliente comprovados. **Zero FKs de `public`→`auth` em todo o schema.** `auth.users` possui `deleted_at` (soft-delete) e `is_anonymous`. Órfãos apenas em `cliente_membros` (6 linhas / 3 user_ids); `fazenda_membros`, `admin_agroinblue`, `profiles` sem órfãos. **Os 3 user_ids órfãos são autores de ~14 mil registros de negócio** (`lancamentos.created_by`=5.444; `financeiro_lancamentos_v2.created_by`=8.795) — identidades históricas migradas, válidas.

## Decisão
- `auth.users` = âncora de autenticação.
- `cliente_membros` = fonte soberana de pertencimento (`user, cliente, perfil, ativo`).
- `profiles` = **espelho mínimo de exibição, nunca fonte de autorização**. Campos: `user_id, display_name, avatar_url, status, created_at, updated_at`. **E-mail não é espelhado em `public.profiles`** (dado pessoal, desatualiza, amplia superfície). Escrita pelo próprio usuário limitada a `display_name` e `avatar_url`; `status` só por fluxo administrativo server-side; `user_id`/timestamps/controle nunca pelo próprio. Leitura de e-mail (quando AcessosTab precisar): **somente por ator com capacidade nominal de gestão de acessos no tenant solicitado, ou admin global, via Edge Function tenant-scoped — nunca tabela pública aberta; a Edge nunca consulta tenant que o ator não possa administrar**. `handle_new_user` **não** é religada nesta fase.
- **Integridade — Alternativa B (por processo)**, endossada com evidência. Rejeitadas A (FK direta) e C (tabela espelho).
  - **Identidade operacional** (`cliente_membros.user_id`, `admin_agroinblue.user_id`, `fazenda_membros.user_id`): deve corresponder a um usuário autenticável; UUID compatível com `auth.users`, **integridade garantida por processo, não por FK** (edge validada na criação, job de detecção de órfãos, quarentena).
  - **Identidade histórica de autoria** (`created_by`, `updated_by`, `audit_actor`): identificadores históricos permanentes; não representam autorização; permanecem válidos mesmo após a remoção da identidade autenticável.

## Invariantes
- **Autorização ≠ autoria** (princípio fundante): um usuário pode perder autenticação, pertencimento e todo acesso e ainda ser o autor histórico legítimo de milhares de registros.
- **RLS nunca depende de `created_by`/`updated_by`/`audit_actor`.**
- Exclusão de usuário **nunca** apaga histórico de negócio.
- Quarentena (desativar membership, preservar `user_id`, nunca apagar) aplica-se **apenas a identidades operacionais órfãs**; **nunca** a registros históricos de autoria (preservados incondicionalmente).
- Identidade órfã, removida ou sem membership ativa **não amplia autorização**.

## Consequências
**+** fonte única de pertencimento; base para toda RLS; portabilidade entre ambientes preservada; autoria histórica intacta. **−** exige job de órfãos e quarentena; `profiles` precisa de população futura (fora desta fase).

## Alternativas consideradas
- **A — FK direta → auth.users:** rejeitada (falha com 6 órfãos; não resolve autoria por uuid solto; RESTRICT só bloqueia exclusão; rompe a convenção de 0 FKs a auth; frágil em dump/restore e clone de ambiente; soft-delete torna a semântica ambígua).
- **C — tabela pública espelho:** rejeitada (sobrepõe-se ao `profiles` mínimo; adiciona sincronização sem ganho distinto).

## Riscos e limitações
Comportamento empírico do hard-delete do GoTrue inferido de catálogo (`deleted_at` existe) + documentação; não executado. Os 3 órfãos exigem quarentena cuidadosa (preservar `created_by`).

## Implicações para a Fase C
Pacote `SEC-ORFAOS-QUARENTENA-01` (desativar as 6 memberships, preservar user_ids e autoria). Job/auditoria recorrente de órfãos. População futura de `profiles` (religar `handle_new_user` ou popular via edge) — decisão de fase posterior.

## Referências cruzadas
ADR-2026-09 (admin usa `admin_agroinblue.user_id` operacional), ADR-2026-13 (invariante de órfã; RLS não usa autoria), ADR-2026-15 (rollout). Pacotes: `SEC-ORFAOS-QUARENTENA-01`, `AUD-IDENTIDADE-ACESSOS-02`.
