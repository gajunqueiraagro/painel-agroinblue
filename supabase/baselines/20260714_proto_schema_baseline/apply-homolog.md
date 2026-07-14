# Runbook — aplicação do baseline no homolog

Procedimento reproduzível, validado pelo `ENV-HOMOLOG-01B-3C` com **13/13 fingerprints MATCH**.

> ## Escopo
>
> **Este runbook não é um procedimento de reaplicação sobre ambiente já populado.**
>
> Ele cobre **exclusivamente** o bootstrap de um projeto Supabase novo e vazio. Se o alvo já contiver tabelas ou funções de aplicação no schema `public`, **PARE** — este procedimento não se aplica e exige um pacote específico. Este runbook **não contém** e **não deve receber** `DROP`, reset, limpeza ou reaplicação.

> **Leia antes de executar.** O `schema.sql` versionado **não é aplicável diretamente** em um projeto Supabase gerenciado. Ele exige um filtro de execução — 12 exclusões — descrito no passo 7. O filtro acontece **somente numa cópia temporária**. O arquivo versionado nunca é editado.

---

## 1. Alvo obrigatório

| | |
|---|---|
| Ambiente | **homolog** |
| project_id | **`sbwfacryawstuvhlaezm`** |

**Produção é `duttifnbxqtyyybjmouv` — nunca aplicar.** Proto é `binbcdfbisgscrifztia`.

## 2. Conexão — Session Pooler

| | |
|---|---|
| host | `aws-1-sa-east-1.pooler.supabase.com` |
| porta | `5432` |
| banco | `postgres` |
| usuário | `postgres.sbwfacryawstuvhlaezm` |
| autenticação | `~/.pgpass` |

```bash
PGPASSFILE=~/.pgpass psql "host=aws-1-sa-east-1.pooler.supabase.com port=5432 \
  dbname=postgres user=postgres.sbwfacryawstuvhlaezm sslmode=require" -X -c "SELECT current_database(), current_user;"
```

> O pooler roteia pelo prefixo do usuário; dentro do banco `current_user` resolve para `postgres`. Não existe identificador de project_id consultável via SQL — a confirmação do alvo é indireta. Use o passo 4 (alvo vazio) como checagem convergente.

## 3. Proibições

- **Nenhum comando Supabase CLI.** `supabase/config.toml` contém `project_id = "duttifnbxqtyyybjmouv"` (**produção**): qualquer comando CLI na raiz do repositório mira produção por padrão. Risco operacional permanente — ver `operational_risks` no `manifest.json`.
- **Nunca ler ou depender do `config.toml`** neste procedimento.
- **Nunca versionar senha, `.pgpass`, connection string completa ou qualquer credencial.** Este runbook registra host, porta, banco e usuário — nada além disso. A senha vive só no `~/.pgpass`, fora do repositório.

## 4. Validação prévia

### 4.1 Artefato

```bash
cd supabase/baselines/20260714_proto_schema_baseline
shasum -a 256 schema.sql   # exigido: ae6c7ca3b89dee2fa56994e7e94442a1cf4958faff7df1cec3b336d03f23cca6
wc -l schema.sql           # exigido: 19272
```

Divergiu? **PARE.** O artefato não é o homologado.

### 4.2 Alvo vazio

```sql
SELECT
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r') AS tabelas,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f'
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')) AS func_aplicacao;
```

Esperado: **0 e 0**.

**Diferente disso, PARE.** O alvo já está populado e este runbook não se aplica — ele cobre apenas bootstrap de projeto novo e vazio. Reaplicação sobre ambiente populado exige **pacote específico**, com briefing próprio. **Não** improvise `DROP`, reset ou limpeza para forçar o alvo a ficar vazio: isso destrói dados e está fora do escopo deste procedimento.

> Nota: o homolog `sbwfacryawstuvhlaezm` **já foi bootstrapado** pelo `ENV-HOMOLOG-01B-3C` e hoje contém 116 tabelas. Este runbook, portanto, **não é re-executável contra ele** — ele documenta como o estado atual foi construído, e serve para bootstrapar um ambiente novo.

## 5. Delta de extensões

As 8 exigidas: `pg_cron`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `unaccent`, `uuid-ossp`.

```sql
SELECT extname FROM pg_extension ORDER BY extname;
```

Instale **apenas o delta**. Projeto Supabase novo já traz 5; faltam tipicamente 3:

```sql
CREATE EXTENSION pg_trgm  WITH SCHEMA public;
CREATE EXTENSION unaccent WITH SCHEMA public;
CREATE EXTENSION pg_cron;
```

> **`pg_trgm` e `unaccent` precisam ficar em `public`** — não é escolha de estilo. O `schema.sql` referencia `public.gin_trgm_ops` (linhas 12420, 13036, 13043) e as 94 funções declaram `SET search_path TO 'public'` chamando `unaccent()` sem qualificação. Instalar em `extensions` faz a aplicação falhar. Isso espelha o proto: 31 funções de `pg_trgm` + 4 de `unaccent` = as 35 funções de extensão em `public`.

Confira o fingerprint de extensões já aqui:

```sql
SELECT md5(string_agg(extname, ',' ORDER BY extname)) FROM pg_extension;
-- esperado: cced67e1d766c5edc4ac1c76acc6f81d
```

## 6. Cópia temporária

Fora do controle de versão. **Nunca edite o `schema.sql` versionado.**

```bash
mkdir -p scratchpad/env-homolog-01b
SRC=supabase/baselines/20260714_proto_schema_baseline/schema.sql
TMP=scratchpad/env-homolog-01b/schema_apply.sql
```

## 7. Remoção exata das 12 instruções `FOR ROLE supabase_admin`

```bash
grep -v '^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ' "$SRC" > "$TMP"
```

**As 12 instruções** (4 SEQUENCES + 4 FUNCTIONS + 4 TABLES, cada bloco para `postgres`, `anon`, `authenticated`, `service_role`):

| Bloco | Linhas no versionado |
|---|---|
| SEQUENCES | 19221-19224 |
| FUNCTIONS | 19241-19244 |
| TABLES | 19261-19264 |

**Por que excluir.** `ALTER DEFAULT PRIVILEGES FOR ROLE X` exige que o usuário corrente seja membro de `X`. O role `postgres`, via pooler, **não é membro de `supabase_admin`** — é membro de `anon`, `authenticated`, `authenticator`, `service_role`, `supabase_privileged_role`, `supabase_realtime_admin` e roles `pg_*`. Sem a exclusão a aplicação aborta com `ERROR: permission denied to change default privileges`.

**Por que é seguro.** O estado equivalente **já existe** no `pg_default_acl` do projeto, provisionado pela plataforma. Confirme:

```sql
WITH x AS (
  SELECT CASE d.defaclobjtype WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'r' THEN 'TABLES' END AS objtype,
         pg_get_userbyid(a.grantee) AS grantee, a.privilege_type
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE n.nspname = 'public' AND pg_get_userbyid(d.defaclrole) = 'supabase_admin'
)
SELECT objtype, grantee, count(*) AS qtd, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM x WHERE grantee IN ('postgres','anon','authenticated','service_role')
GROUP BY objtype, grantee ORDER BY objtype, grantee;
```

Esperado — 12 linhas, todas equivalentes a `GRANT ALL`:

| objtype | qtd | privs |
|---|---|---|
| FUNCTIONS | 1 | `EXECUTE` |
| SEQUENCES | 3 | `SELECT,UPDATE,USAGE` |
| TABLES | 8 | `DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` |

Correspondência 1:1 com o excluído. **Nada é perdido.**

> As 12 instruções `FOR ROLE postgres` são **preservadas e aplicadas** — o usuário corrente é `postgres` e tem permissão para alterá-las.

## 8. Prova de que nenhuma outra linha mudou

```bash
diff "$SRC" "$TMP"
```

Aceite **somente** este resultado: **12 deleções, 0 adições**, todas com o prefixo `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`.

```bash
# gates
[ $(( $(wc -l < "$SRC") - $(wc -l < "$TMP") )) -eq 12 ] && echo "PASS 12 removidas" || echo "FALHOU"
[ $(grep -c '^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ' "$TMP") -eq 0 ]  && echo "PASS 0 remanescentes" || echo "FALHOU"
[ $(grep -c '^ALTER DEFAULT PRIVILEGES FOR ROLE postgres ' "$TMP") -eq 12 ] && echo "PASS 12 preservadas" || echo "FALHOU"
shasum -a 256 "$SRC"  # deve seguir ae6c7ca3... — versionado intacto
```

Qualquer gate falho: **PARE.**

## 9. Aplicação

```bash
PGPASSFILE=~/.pgpass psql "host=aws-1-sa-east-1.pooler.supabase.com port=5432 \
  dbname=postgres user=postgres.sbwfacryawstuvhlaezm sslmode=require" \
  -X -v ON_ERROR_STOP=1 --single-transaction -f "$TMP"
```

Esperado: **`EXIT_CODE=0`**, sem erros. Contagens do log: 1 `CREATE SCHEMA`, 2 `CREATE TYPE`, 116 `CREATE TABLE`, 134 `CREATE FUNCTION`, 197 `CREATE INDEX`, 177 `CREATE POLICY`, 88 `CREATE TRIGGER`, 8 `CREATE VIEW`, 290 `ALTER TABLE`, 749 `GRANT`, 27 `REVOKE`, 68 `COMMENT`, 12 `ALTER DEFAULT PRIVILEGES`.

## 10. Fingerprints

Extraia as queries **literalmente** do `manifest.json` — sem reescrever:

```bash
python3 -c "
import json; m = json.load(open('manifest.json'))
open('/tmp/fpq.sql','w').write(m['fingerprint_query'])
open('/tmp/afq.sql','w').write(m['application_functions_query'])
"
psql "<conexao>" -X -A -t -F '|' -f /tmp/fpq.sql   # 12 categorias
psql "<conexao>" -X -A -t -f /tmp/afq.sql          # application_functions
```

Compare hash a hash com `fingerprints-proto.json`. Ordem das 12 colunas: `tabs_rls`, `cols`, `constraints`, `indexes`, `enums`, `views`, `functions`, `triggers`, `policies`, `acl_grants`, `sequences`, `extensions`.

## 11. Gate de funções

**Compare `application_functions`** (`0bad2d3a13e3cab2a0e185f9722fc6c2`, 134) — **não** `functions` (`845d8d4863428b3f81dc4a94eaed1b7f`, 169). Ver `gate_rule_01b3` no `manifest.json`.

`functions` é o fingerprint bruto do proto e inclui 35 funções dependentes de extensão; só é comparável se o alvo tiver exatamente as mesmas extensões residentes em `public`. Seguindo o passo 5, ele também dá MATCH — mas **o gate é `application_functions`**.

## 12. Critério final

**13/13 MATCH** — as 12 categorias mais `application_functions`.

Estado final esperado no homolog:

| Objeto | Esperado |
|---|---|
| Tabelas | 116 |
| Funções de aplicação | 134 |
| Funções totais | 169 |
| Views | 8 |
| Triggers | 88 |
| Policies | 177 |
| Tabelas com RLS | 103 |
| Extensões | 8 |

## 13. Rollback

`--single-transaction` + `ON_ERROR_STOP=1` fazem a transação **abortar integralmente na primeira falha**. Não existe estado parcial: ou tudo entra, ou nada entra.

**Exceção — as extensões não são revertidas.** Os `CREATE EXTENSION` do passo 5 são DDL próprio, executado e commitado **antes** da transação de aplicação. Um rollback do passo 9 não as desfaz. É intencional e coerente com a regra de instalar apenas o delta.

**Divergência estrutural = PARE.** Reporte linha e objeto. **Nunca corrija automaticamente.**

## 14. Segurança

- Nunca inclua senha, `.pgpass` ou connection string completa neste repositório.
- Este runbook documenta **host, porta, banco e usuário** — nada mais. A credencial vive exclusivamente no `~/.pgpass`.
- Nunca aplique em produção (`duttifnbxqtyyybjmouv`).

---

## Referências

- `manifest.json` → `apply_procedure`, `gate_rule_01b3`, `fingerprint_query`, `application_functions_query`, `operational_risks`
- `sanitization-report.md` → seção 3.1 (correção de bootstrap), seção 10 (desfecho da aplicação)
- `fingerprints-proto.json` → hashes de referência do proto
