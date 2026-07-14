# ADR-2026-15 — Rollout anti-deny-all
Status: ACEITO (14/07/2026) · Decide sobre: rollout anti-deny-all

## Contexto e evidências
ADR-2026-04 (incidente deny-all histórico). Incidente SEC-RPC-P0-01B: `REVOKE ... FROM anon` foi no-op porque o acesso vinha de PUBLIC — **"privilégio efetivo não revela a origem do privilégio"**. Helpers SECDEF são o ponto de deny-all. Proto contém dados reais e é não-descartável.

O fix-forward B2 comprovou operacionalmente o gate definido neste ADR: a contenção foi validada por proacl e aclexplode, com retirada de PUBLIC/anon, preservação dos papéis autorizados e ausência de recriação das funções ou alteração de policies e triggers.

## Decisão
- **Ambiente separado de homologação (Opção A)**; sua criação é pacote próprio (`ENV-HOMOLOG-01`) **antes** de qualquer RLS.
- **Ordem de pacotes (fundação antes das policies):** `ENV-HOMOLOG-01` → `SEC-IDENTIDADE-CONTRATOS-01` (estruturas: capacidades, farm_scope, tabela admin — sem trocar policies) → `SEC-IDENTIDADE-HELPERS-01` (helpers current_user_* + ACL endurecida + testes) → `SEC-IDENTIDADE-ADMIN-01` (migração atômica da fonte do admin) → `SEC-MEMBROS-BASE-01` (RLS de `cliente_membros`) → `SEC-RLS-PILOTO-01` (piloto) → `SEC-RLS-CADASTROS/ZOO/FIN-01` → `SEC-VIEWS-TENANT-01` → `SEC-RPC-ACL-FROTA-01` → `SEC-AUDIT-CROSSTENANT-FINAL-01` → produção (perícia própria).
- **Piloto em duas etapas:** técnico vazio (`pasto_movimentacoes`) valida sintaxe/helpers/anon=0/não-membro=0/rollback; funcional com dado sintético (`pastos`/`pasto_condicoes`) só concluído quando: dono vê próprio tenant · não-membro não vê · anon não vê · campo vê só fazenda atribuída.
- **Rollback proporcional**: restaurar policy anterior **só em validação**; em produção, qualquer rollback que reabra acesso global = **último recurso com autorização explícita**; runbook fora de `supabase/migrations`; fix-forward preferencial. **Nunca `USING(true)` como rollback padrão.**

## Invariantes
- Nunca aplicar RLS em big-bang.
- **Canário anti-deny-all antes de cada avanço**: as 3 blindadas ainda retornam ao dono.
- Helpers nunca perdem EXECUTE de `authenticated` (deny-all trap).
- **Gate de ACL usa `proacl` + `aclexplode` + grants explícitos + membership de roles, nunca só `has_function_privilege`** (lição B/B2).
- Produção nunca reabre acesso global sem autorização explícita.

## Consequências
**+** risco de deny-all controlado; cada onda verificável. **−** rollout mais lento (por onda).

## Alternativas consideradas
`USING(true)` como rollback padrão (rejeitada — reabre o P0). Big-bang RLS (rejeitada). Dataset sintético no proto em vez de ambiente separado (rejeitada — proto tem dado real).

## Riscos e limitações
Onda 2 (`cliente_membros`) é a mais perigosa. Comportamento em produção não periciado. **Casos de teste obrigatórios (atores e escopos negativos):** autenticado sem membership; membership inativa; membership removida durante sessão; `auth.uid() IS NULL`; perfil desconhecido; override +; override −; `campo` `farm_scope=selected` lista vazia; `leitura` `farm_scope=none`; gestor tentando delegar capacidade não-delegável; remover último proprietário; remover último admin global; helper administrativo chamado por usuário comum; restauração de sessão após mudança de papel; e por onda: dono vê / não-membro=0 / anon=0.

## Implicações para a Fase C
Todos os pacotes `SEC-*` + `ENV-HOMOLOG-01` + `SEC-AUDIT-CROSSTENANT-FINAL-01`.

## Referências cruzadas
ADR-2026-04 (precedente), 08–14 (o que cada onda aplica), 12 (gate anon), 13 (helpers/ACL). Pacotes: todos os `SEC-*`, `ENV-HOMOLOG-01`.
