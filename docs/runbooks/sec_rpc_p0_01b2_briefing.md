# BRIEFING — SEC-RPC-P0-01B2
## Fix-forward da contenção anônima via PUBLIC

Autocontido. Alvo exclusivo: proto `binbcdfbisgscrifztia` (agroinblue-proto). Produção `duttifnbxqtyyybjmouv` intocável. Sem CLI / `db push` / `migration up` / project link / `config.toml`. Apply somente por MCP `apply_migration` com `project_id` explícito. Fases separadas; regra de parada ao fim de cada uma.

> **Declaração de escopo (leia primeiro).**
> - `SEC-RPC-P0-01B` foi **aplicado** no proto e foi **no-op de segurança** (registrado, mantido no histórico — fix-forward, não revertido).
> - Causa: `anon` **herda** EXECUTE de **PUBLIC**; `REVOKE FROM anon` não removia nada.
> - `SEC-RPC-P0-01B2` é **fix-forward**: `REVOKE … FROM PUBLIC, anon` **somente nas 11** assinaturas prioritárias.
> - As ~62 funções da **Forma A** (PUBLIC + anon direto) **NÃO** são corrigidas neste pacote. Ficam na frente separada **`SEC-RPC-ACL-FROTA-01`** (triagem e normalização da frota SECURITY DEFINER exposta por PUBLIC/anon), a ser dividida por domínio **após** o B2 aplicado e validado.
> - **Helpers de policy** (`is_admin_agroinblue`, `is_cliente_member`, `is_fazenda_member`, `get_user_cliente_ids`, `get_user_perfil`, `shares_fazenda`, e qualquer outro chamado por policy/definer) estão **fora de escopo** — acessível a anon **não** autoriza revogação isolada. Ficam no pacote G/frota.
> - **Nenhuma revogação em massa** está autorizada. Cada função exige contrato individual (quem chama, em qual role, se a policy depende do EXECUTE, ACL mínima sem deny-all).

---

### 1. Incidente e causa-raiz
`SEC-RPC-P0-01B` revogou EXECUTE de `anon` nas 11 RPCs SECURITY DEFINER prioritárias. O apply teve sucesso, mas foi **no-op de segurança**: `anon` continua executando.
Causa: nas 11, o EXECUTE de `anon` **não** vinha de grant direto, e sim de `EXECUTE` concedido a **PUBLIC**. Em Postgres, `has_function_privilege('anon',…)` é true também quando o privilégio é herdado de PUBLIC. `REVOKE … FROM anon` não removeu nada (não havia entrada `anon` no proacl) e não tocou PUBLIC.
proacl das 11: `{=X/postgres, postgres=X, authenticated=X, service_role=X}` — `=X` é `PUBLIC=EXECUTE`.

### 2. Status da migration anterior (fix-forward, não reverter)
- `SEC-RPC-P0-01B` — aplicada no proto, registrada como `20260714114527 sec_rpc_p0_01b_revoke_anon`.
- Resultado: no-op de segurança. Impacto colateral: **nenhum** (proacl/OID/hash inalterados; policies e triggers idênticos pré/pós; authenticated/service_role/postgres preservados).
- NÃO editar a migration anterior, NÃO remover o registro remoto, NÃO alterar a tabela de migrations, NÃO aplicar rollback. A correção é uma migration **nova e sequencial**.

### 3. As 11 assinaturas exatas (inalteradas em relação ao B)
1. public.reabrir_pilar_fechamento(uuid,text,text,text,uuid)
2. public.gerar_snapshot_area(uuid,date,uuid)
3. public.fn_reverter_desconsideracao_extrato(uuid)
4. public.refresh_zoot_cache(uuid,integer)
5. public.refresh_zoot_cache(uuid,integer,text)
6. public.refresh_zoot_cache(uuid,integer,integer)
7. public.fn_classificacao_apply(uuid)
8. public.fn_endividamento_mensal(uuid,integer)
9. public.get_status_pilares_fechamento(uuid,text)
10. public.buscar_duplicados_retroativo(uuid,text)
11. public.auditar_integridade_classificacao(uuid)

### 4. Baseline proacl / aclexplode (proto, capturado read-only na B2-1)
Todas as 11, idênticas: owner=postgres, prosecdef=true.
proacl `{=X/postgres, postgres=X, authenticated=X, service_role=X}` →
- PUBLIC: EXECUTE (explícito) — **origem do acesso anônimo**
- anon: **sem** grant direto (efetivo=true só via PUBLIC)
- authenticated: grant explícito independente de PUBLIC
- service_role: grant explícito independente de PUBLIC
- postgres: grant explícito + ownership
proconfig: 7 com `search_path=public`; 4 com `null` (gerar_snapshot_area + os 3 overloads de refresh_zoot_cache). OIDs e definition_hash: ver baseline capturado (scratchpad `sec_rpc_p0_01b_baseline_pre.md`), inalterados desde a B.

### 5. Gate PRÉ corrigido (soberano por aclexplode; has_function_privilege só confirma)
Para cada uma das 11, o gate pré deve provar SEPARADAMENTE, via `pg_proc.proacl` + `aclexplode` (grantor, grantee, privilege_type, is_grantable):
- PUBLIC possui EXECUTE (explícito) **ou** anon possui grant direto;
- authenticated possui EXECUTE **explícito** e independente de PUBLIC;
- service_role possui EXECUTE **explícito** e independente de PUBLIC;
- postgres possui EXECUTE explícito ou ownership;
- privilégio efetivo por role via `has_function_privilege` (apenas confirmação).
**Bloquear o apply se**: linhas ≠ 11; assinatura inexistente; owner≠postgres; prosecdef≠true; proconfig/assinatura/OID/hash divergentes do baseline; **authenticated OU service_role dependerem SOMENTE de PUBLIC** (isto é, sem grant explícito próprio) — nesse caso REVOKE de PUBLIC causaria deny-all: parar e abrir pacote separado de normalização de ACL. Não adicionar GRANT compensatório automático.
Query de referência: `aclexplode(proacl)` com `bool_or` por grantee (ver inventário B2-1).

### 6. Migration nova
Arquivo: `supabase/migrations/20260714120000_sec_rpc_p0_01b2_revoke_public_anon.sql`
Efeito autorizado exclusivo: `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon;` nas 11 (PUBLIC neutraliza a herança; anon cobre eventual grant direto — robustez semântica).
Método de apply: **MCP `apply_migration`, `project_id=binbcdfbisgscrifztia`** (o runner aplica em transação própria; o `BEGIN/COMMIT` do arquivo é para execução standalone via psql).

### 7. Anti-escopo
Proibido: tocar produção; alterar config.toml/project link; Supabase CLI/db push/migration up; editar a migration anterior; alterar histórico remoto; aplicar o runbook; CREATE/ALTER/DROP; mudar corpo/owner/proconfig; tocar policies/triggers/tabelas/dados; tocar authenticated/service_role/postgres; GRANT compensatório; incluir funções fora das 11; executar qualquer RPC (mutadora ou leitura); revogar helpers/is_admin_agroinblue.

### 8. Gate PÓS (mesmo proto, imediatamente após apply)
Para cada uma das 11, provar por `aclexplode` (prova principal) + `has_function_privilege` (confirmação):
- PUBLIC **sem** EXECUTE explícito;
- anon **sem** EXECUTE explícito;
- `has_function_privilege('anon',…)=false`;
- authenticated com grant explícito **preservado**; `authenticated_execute=true`;
- service_role com grant explícito **preservado**; `service_role_execute=true`;
- `postgres_execute=true`;
- OID local, owner, prosecdef, proconfig e definition_hash **inalterados** vs baseline;
- nenhuma função recriada; nenhuma tabela/dado alterado; nenhuma outra ACL modificada.
Também: definições das policies das 3 tabelas blindadas (`conciliacao_bancaria_itens`, `extrato_bancario_v2`, `transferencia_ofx_pares`) inalteradas e contagem de triggers inalterada (baseline: 4 / 2 / 0). Bloquear/registrar incidente se qualquer item divergir.

### 9. Rollback manual específico (fora de migrations, nunca automático)
Arquivo: `docs/runbooks/rollback/sec_rpc_p0_01b2_rollback.sql`
Restaura o baseline real: `GRANT EXECUTE ON FUNCTION … TO PUBLIC;` (NÃO grant direto a anon). Cabeçalho de emergência declara que reabre acesso a todos os roles que herdam de PUBLIC (inclusive anon). Exige autorização explícita. Não usar o runbook antigo do B (que concede a anon).

### 10. Riscos
| Risco | Nível | Mitigação |
|---|---|---|
| Quebra de authenticated/service_role | muito baixo | têm grant explícito independente; gate pré bloqueia se dependerem só de PUBLIC |
| Deny-all via helper/policy | n/a neste pacote | helpers NÃO são tocados; ficam no pacote G |
| Front quebra por perda de anon | muito baixo | call-sites reais autenticados (01A); anon é exposição acidental |
| Efeito em RLS | nulo | não toca is_admin_agroinblue/policies; comparação de definição no pós |
| Overload divergente | baixo | resolução por `to_regprocedure`; aborta se ≠11 |

### 11. Critérios de aceite
- As 11: `has_function_privilege('anon',…)=false`, PUBLIC sem EXECUTE, sem anon explícito.
- authenticated/service_role/postgres com EXECUTE preservado (grant explícito intacto).
- OID/owner/prosecdef/proconfig/definition_hash idênticos pré×pós (nenhuma função recriada).
- Policies das 3 tabelas e contagem de triggers idênticas pré×pós.
- Zero DML/estrutural além dos 11 REVOKE (DCL). Migration idempotente (2ª aplicação = no-op).

### 12. Reconferência sistêmica D/E/F/G (read-only, corrige "authenticated-only")
Inventário completo de SECDEF em `public` no proto (B2-1). O acesso efetivo de anon vinha de PUBLIC em quase tudo. Classificação por forma de ACL:
- **Forma C — JÁ CONTIDA** (`{postgres, authenticated, service_role}`, sem PUBLIC, anon_effective=false): fn_criar_lancamento_de_extrato, fn_vincular_extrato_lancamento, fn_desfazer_vinculo_extrato, fn_transferir_vinculo_extrato, fn_reativar_vinculo_extrato, fn_invalidar_origem_extrato, fn_marcar_extrato_transferencia, fn_extratos_espelhados, fn_promover_staging, fn_cancelar_lancamento_auditoria, fn_classificacao_split_substituir. → **É o padrão-modelo de contenção** (D em boa parte já resolvido).
- **Forma B — as 11 (este pacote).**
- **Forma A — PUBLIC + anon explícito (~62)**: exige `REVOKE FROM PUBLIC, anon`. Subgrupos:
  - **Helpers (pacote G, cuidado deny-all)**: is_admin_agroinblue, is_cliente_member, is_fazenda_member, get_user_cliente_id, get_user_cliente_ids, get_user_perfil, shares_fazenda.
  - **Triggers SECDEF (revogar EXECUTE é seguro; trigger dispara independe do ACL de EXECUTE)**: audit_trigger_*, guard_*, handle_new_user, set_lancamento_audit_fields, sync_transferencia_update, trg_fn_invalidate_zoot_cache, fn_cbi_desfazer_on_cancelamento, fn_promover_lancamento_realizado_ao_conciliar, fn_completar_categorias_saldo_inicial, financeiro_saldos_v2_apply_previous_extrato, auto_add_owner_as_membro, auto_create_transferencia_entrada, propagar_saldo_inicial_pos_dezembro, save_boitel_planejamento_historico, invalidate_snapshot_on_pasto_change.
  - **RPCs de negócio anon-executáveis HOJE (E/F + classificação)**: fn_classificacao_* (apply_row, candidatos_*, composicao_sugerida, desfazer_*, editar_proposto, populate_staging, reresolver_*, resetar_proposto, resolver_*, reverter_row, sistema_nao_explicado), fn_zoot_cache_rebuild, fn_zoot_categoria_mensal, fn_auditoria_consistencia_zoot, fn_saldo_inicial_pasto, get_anos_financeiro_v2, get_anos_lancamentos, can_close_valor_rebanho, can_manage_financeiro_importacao_v2, can_manage_financeiro_lancamento_v2, cancel_financeiro_importacao_v2, resolve_transfer_destination_fazenda.
- **Forma D — trancada** (`{postgres, service_role}`): exec_query, exec_sql (bom — nem anon nem authenticated).
Inventário bruto por assinatura: scratchpad `sec_rpc_acl_inventory_proto.md`. Para cada função priorizada em D/E/F/G o gate pré deve emitir: assinatura, owner, prosecdef, proconfig, proacl, ACL explodida, grant explícito por role, privilégio efetivo, origem do privilégio, recomendação (revogar PUBLIC / anon / ambos / nenhum), risco de deny-all, dependência de policy/função interna.

### 13. Impacto no método futuro
- `has_function_privilege` **nunca** sozinho determina origem de acesso: distinguir **privilégio efetivo** de **origem do privilégio**.
- Todo pacote SEC-RPC usa `proacl`/`aclexplode` como prova soberana; `has_function_privilege` só confirma o efeito.
- Antes de revogar PUBLIC, exigir grant explícito independente para os roles que devem manter acesso; senão, normalizar ACL em pacote próprio (nunca GRANT compensatório silencioso).
- Padrão-alvo de contenção = Forma C.

### 14. Fases
- **B2-1 (esta) — PERÍCIA + ARTEFATOS**: catálogo read-only, reconferência D/E/F/G, migration B2, runbook B2, diff, checks estáticos, comandos de commit/push preparados. Parar. Sem apply/REVOKE/GRANT/RPC/commit/push/produção.
- **B2-2 — COMMIT/PUSH**: `git add` dos artefatos B2; commit; `git push origin proto`. Só com nova autorização.
- **B2-3 — APPLY**: confirmar `project_id=binbcdfbisgscrifztia` → gate pré (aclexplode) → apply via MCP `apply_migration` → gate pós → comparar ACL/OID/hash/policies/triggers → parar. Só com nova autorização.

### 15. Regra de parada
Ao fim de cada fase, parar e apresentar. Em erro parcial/ambíguo/perda de acesso de authenticated no apply: não aplicar rollback, não emitir GRANT, não corrigir manualmente; capturar estado por catálogo; parar e apresentar incidente. Rollback exige nova autorização explícita. Produção nunca é tocada. Não iniciar pacote C nem retomar auditoria de identidade fora do escopo autorizado.
