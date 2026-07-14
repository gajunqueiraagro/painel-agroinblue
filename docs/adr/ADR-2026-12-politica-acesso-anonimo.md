# ADR-2026-12 — Política de acesso anônimo
Status: ACEITO (14/07/2026) · Decide sobre: política de acesso anônimo

## Contexto e evidências
`P0-RLS-TENANT-01` comprovado: anon (sem login) lê 7.893 lançamentos de 6 tenants, `cliente_membros` (8, 6 tenants) e `fazendas` (18); contraste — as 3 tabelas blindadas retornam 0 a anon (têm 2.742/2.778/8 linhas por admin). Grants full a anon nas tabelas; 8 views owner=postgres com `security_invoker` unset e anon SELECT; RPCs Forma A anon-executáveis. Incidente SEC-RPC-P0-01B: revogar `anon` foi no-op porque o acesso vinha de PUBLIC.

O fix-forward SEC-RPC-P0-01B2 foi posteriormente aplicado e validado no proto: nas 11 RPCs prioritárias, PUBLIC e anon perderam EXECUTE, enquanto authenticated, service_role e postgres foram preservados por grants explícitos. OID, definição e proconfig permaneceram inalterados. A superfície remanescente da Forma A permanece fora desse pacote e segue registrada em SEC-RPC-ACL-FROTA-01.

## Decisão
`anon` = **zero dado operacional**. Allowlist explícita e documentada só para: autenticação, conteúdo genuinamente público, config pública não-sensível. Toda tabela/view/RPC operacional: sem SELECT/EXECUTE anon; sem grant PUBLIC que resulte em anon. CI que falha ao detectar nova superfície anon fora da allowlist.

## Invariantes
- Nenhuma leitura/escrita operacional por anon.
- Exceções só na allowlist versionada e testada.
- **ACL auditada pela origem** (`proacl` + `aclexplode` + grants explícitos + membership de roles), **nunca só `has_function_privilege`** (lição B/B2: privilégio efetivo ≠ origem do privilégio).

## Consequências
**+** fecha a superfície anônima. **−** varredura por ondas de tabelas/views/RPCs.

## Alternativas consideradas
Confiar em filtro client-side — rejeitada (a prova mostrou vazamento efetivo por anon).

## Riscos e limitações
Revogar anon de algo usado sem login (não deve existir; validar por onda). `P0-RLS-TENANT-01`: **confirmado no proto, não corrigido; produção não periciada** — não presumir estado idêntico em produção.

## Implicações para a Fase C
Aplicado em cada `SEC-RLS-*`, `SEC-VIEWS-TENANT-01`, `SEC-RPC-ACL-FROTA-01`; gate anon=0.

## Referências cruzadas
ADR-2026-13 (RLS), ADR-2026-14 (views), ADR-2026-15 (rollout/gate de ACL). Pacotes: `SEC-RPC-ACL-FROTA-01`, `SEC-VIEWS-TENANT-01`.
