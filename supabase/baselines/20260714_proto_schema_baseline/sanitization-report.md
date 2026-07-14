# Relatório de sanitização — ENV-HOMOLOG-01B-2A

Baseline: `supabase/baselines/20260714_proto_schema_baseline/`
Fonte: proto `binbcdfbisgscrifztia`, schema `public`
Corte Git: commit `c45279be553bb4b44f9e92c9e2094b26897bf318` (branch `proto`, HEAD na geração)
Corte banco: arquivo `20260714120000_sec_rpc_p0_01b2_revoke_public_anon.sql` / versão aplicada `20260714122429` / nome `sec_rpc_p0_01b2_revoke_public_anon`

## 1. Origem e método do dump

`pg_dump` schema-only do schema `public`, sem owners.
Cabeçalho do arquivo: `Dumped from database version 17.6`, `Dumped by pg_dump version 18.4`.
O dump traz `\restrict <token>` na linha 5 — token aleatório gerado pelo pg_dump 18 contra injeção de meta-comando no psql. Não é segredo e foi preservado.

## 2. Hashes e contagens

| Arquivo | Linhas | Tamanho | SHA-256 |
|---|---|---|---|
| Bruto (`scratchpad/env-homolog-01b/proto_public_schemaonly.raw.sql`) | 19.272 | 720.443 B | `21dac3d43e0ec01fa1a01a9a1b13fc1b5e849b1b45e7d304decd5ef9ecce2e94` |
| Versionado (`schema.sql`) | 19.272 | 720.457 B | `ae6c7ca3b89dee2fa56994e7e94442a1cf4958faff7df1cec3b336d03f23cca6` |

`diff` entre bruto e versionado: **uma única linha** — a linha 26. Os arquivos **não** são byte a byte idênticos. A diferença é integralmente a correção de bootstrap registrada na seção 3.1, aplicada pelo `ENV-HOMOLOG-01B-3A`. O dump bruto **não** foi modificado e mantém o SHA-256 original.

## 3. Remoções realizadas

**Nenhuma. A sanitização é um no-op.**

Cada regra de sanitização autorizada foi auditada contra o bruto e não encontrou alvo:

| Regra | Alvo | Ocorrências | Remoções | Justificativa |
|---|---|---|---|---|
| 1 — Cron | `cron.schedule`, `cron.unschedule`, `cron.job`, schema `cron` | 0 executáveis | 0 | Nenhum comando autônomo de agendamento no dump. |
| 2 — Owners | `ALTER ... OWNER TO` | 0 | 0 | Dump gerado sem owners; cabeçalhos registram `Owner: -`. |
| 3 — Refs ambientais | `binbcdfbisgscrifztia` | 0 | 0 | Ausente do dump. |
| 3 — Refs ambientais | `duttifnbxqtyyybjmouv` | 0 | 0 | Ausente do dump. |
| 4 — Extensões | `CREATE EXTENSION` | 0 | 0 | Nada a remover; extensões não pertencem ao schema `public` dumpado. |

Consequência registrada: **nenhuma remoção de sanitização alterou o arquivo.** Isso não indica falha de sanitização — indica que as flags de origem já eliminaram os alvos (dump sem owners, sem `CREATE EXTENSION`, sem referência ambiental). O `schema.sql` só divergiu do bruto **depois**, por uma correção de bootstrap alheia à sanitização — ver seção 3.1.

Ressalva registrada pela perícia do `ENV-HOMOLOG-01B-3A`: a afirmação "as flags de origem estavam corretas" vale para as regras de sanitização, **não** para o escopo. A flag `-n public` usada na geração é exatamente a causa do defeito de bootstrap tratado em 3.1. Ela não afeta nenhuma regra de sanitização, e por isso as conclusões desta seção 3 permanecem válidas.

## 3.1 Correção manual de bootstrap — ENV-HOMOLOG-01B-3A

**O baseline contém exatamente UMA alteração manual.** Esta é a única divergência entre o dump bruto e o `schema.sql` versionado.

| Item | Valor |
|---|---|
| Arquivo | `schema.sql` |
| Linha | 26 (única ocorrência de `CREATE SCHEMA` no arquivo) |
| De | `CREATE SCHEMA public;` |
| Para | `CREATE SCHEMA IF NOT EXISTS public;` |
| Linhas antes → depois | 19.272 → **19.272 (inalterado)** |
| Bytes antes → depois | 720.443 → 720.457 (+14) |
| SHA-256 antes | `21dac3d43e0ec01fa1a01a9a1b13fc1b5e849b1b45e7d304decd5ef9ecce2e94` |
| **SHA-256 depois** | **`ae6c7ca3b89dee2fa56994e7e94442a1cf4958faff7df1cec3b336d03f23cca6`** |

### Motivo

O schema `public` já existe em qualquer banco Postgres/Supabase novo. A instrução `CREATE SCHEMA public;` aborta a aplicação com `ERROR: schema "public" already exists`, impedindo o bootstrap do baseline no homolog. A primeira tentativa de aplicação do `ENV-HOMOLOG-01B-3` parou exatamente nessa linha, com rollback integral da transação.

### Causa-raiz — comprovada pela perícia

`pg_dump` emite `CREATE SCHEMA public;` quando o dump é gerado com `-n` / `--schema=public`. Em `selectDumpableNamespace()` (`src/bin/pg_dump/pg_dump.c`), o ramo `schema_include_oids` **precede** o tratamento especial do schema `public` numa cadeia `else if`. Com `-n`, o `public` entra pelo ramo genérico e recebe `DUMP_COMPONENT_ALL` com `create = true`; o ramo que faria `create = false` e removeria `DUMP_COMPONENT_DEFINITION` **nunca é alcançado**.

**Não é defeito do Supabase, do PostgreSQL, do banco proto nem do homolog.** É consequência determinística da flag de escopo usada na geração.

Evidência empírica — mesmo banco, mesmo `pg_dump` 18.4, variando apenas o escopo:

| Teste | Invocação | `CREATE SCHEMA public;` |
|---|---|---|
| A | `--schema=public` (receita usada no baseline) | **1 — emitido, linha 26** |
| B | sem `-n` (banco inteiro) | 0 |
| C | `-N` excluindo os demais schemas | 0 |

O teste A reproduziu o defeito contra um schema `public` intocado e default, na mesma linha 26 — o que exclui qualquer participação do conteúdo do proto.

### Alternativa oficial — considerada e rejeitada

A correção tecnicamente correta age na **geração**: obter o escopo por exclusão (`-N` dos demais schemas) em vez de inclusão (`-n public`), o que não emite `CREATE SCHEMA public` (teste C). **Rejeitada** por exigir reemissão do baseline, reabrindo o pacote `ENV-HOMOLOG-01B-2A` já auditado. Não existe flag dedicada no `pg_dump` para suprimir a instrução.

### Por que `IF NOT EXISTS` e não remover a linha

Preserva a numeração de linhas. Este relatório e o `manifest.json` ancoram em números de linha — a ocorrência de cron na **linha 3614** (seção 4) e os índices trgm nas linhas 12420, 13036 e 13043. Remover a linha 26 deslocaria todas as âncoras em −1 e as invalidaria. A forma escolhida também mantém o dump aplicável num banco onde o `public` não exista.

### Impacto esperado

Idempotente. No-op onde o `public` já existe; cria o schema onde não existir. Nenhum outro objeto, ACL, policy, função, trigger ou comentário é afetado.

**Nenhum fingerprint muda.** O schema `public` não é objeto medido por nenhuma das 12 categorias nem por `application_functions` — as categorias medem o *conteúdo* de `public`, não sua existência. Os hashes esperados em `fingerprints-proto.json` permanecem válidos sem alteração.

**A AUD-FUNCTIONS-RECONCILE-01 permanece inalterada.** A conciliação 169 / 35 / 134 e o gate por `application_functions` (`0bad2d3a…`) não são tocados por esta correção — ver seção 7.3, preservada integralmente.

Todas as demais conclusões deste relatório permanecem válidas.

## 4. Ocorrências de cron e classificação

Ocorrência única no arquivo inteiro.

| Linha | Contexto | Classificação | Ação |
|---|---|---|---|
| 3614 | String de `COMMENT ON FUNCTION public.fn_expirar_stagings_antigos()`: *"Mesa Operacional v2. […] Agendamento via pg_cron em PR0.A. […]"* | Prosa em comentário. Não é comando autônomo. Não está no corpo da função. Não contém referência ambiental. | **Preservada** |

Nenhuma referência a cron dentro de corpo de função foi encontrada — a cláusula de parada da regra 1 não foi disparada.

## 5. Preservação verificada

### 5.1 Tabelas backup (12/12)

Todas presentes no `schema.sql`. O dump é schema-only, portanto contêm estrutura sem linhas.

- `_backup_rebanho_auto_escopo_null_20260515`
- `_backup_venda_amendoim_escopo_20260515`
- `_bkp_p0h_cbi_20260630`
- `_bkp_p0h_extrato_20260630`
- `_bkp_p0h_lancto_20260630`
- `backup_lanc_transferencia_entrada_2020_nj_20260514`
- `chuvas_backup_20260516`
- `mesa_par_backup_pr6_1b_20260524`
- `mesa_par_backup_pr6_1c_20260525`
- `meta_versoes_backup_20260516`
- `planejamento_financeiro_backup_20260516`
- `valor_rebanho_meta_validada_backup_20260516`

### 5.2 ACLs, grants e `service_role`

- `GRANT`: 749 instruções preservadas.
- `REVOKE`: 27 instruções preservadas.
- `service_role`: 267 ocorrências preservadas, todas como nome legítimo de role em ACL. Nenhuma foi tratada como segredo.

### 5.3 Demais objetos

RLS, policies, constraints, índices, enums, views, funções, `proconfig`, triggers e comments sem referência ambiental foram integralmente preservados. Nenhuma reformatação foi aplicada.

## 6. Gates

### 6.1 Dados — PASSOU

| Verificação | Resultado |
|---|---|
| `INSERT INTO` em início de linha (carga) | 0 |
| `COPY ... FROM stdin` | 0 |
| Marcador de fim de dados tabulares (`\.`) | 0 |

Observação: há 47 ocorrências de `INSERT INTO` no arquivo, **todas indentadas dentro de corpos de função** (majoritariamente triggers gravando em `public.audit_log`). São definição de código, não carga de dados.

### 6.2 Segredos — PASSOU

| Verificação | Resultado |
|---|---|
| JWT completo (`eyJ….…`) | 0 |
| `sb_secret_*` / `sb_publishable_*` | 0 |
| `service_role_key` / `anon_key` | 0 |
| URL Supabase (`https://*supabase*`) | 0 |
| Connection string PostgreSQL (`postgres://`, `postgresql://`) | 0 |

Nomes legítimos de role (`service_role`, `anon`, `authenticated`) não foram tratados como segredo.

### 6.3 Ambiente — PASSOU

| Project ID | Ocorrências |
|---|---|
| `binbcdfbisgscrifztia` (proto) | 0 |
| `duttifnbxqtyyybjmouv` (prod) | 0 |
| `sbwfacryawstuvhlaezm` (homolog) | 0 |

Nenhuma referência ambiental encontrada — nem em comentário, nem em código executável.

### 6.4 Cron — PASSOU

Zero comandos autônomos `cron.schedule` / `cron.unschedule`. A ocorrência única está classificada na seção 4.

### 6.5 Estrutura — comparação com o inventário do proto

Contagens do `schema.sql` confrontadas com `fingerprints-proto.json`:

| Categoria | Fingerprint (proto) | `schema.sql` | Situação |
|---|---|---|---|
| Tabelas | 116 | 116 | Bate |
| Views | 8 | 8 | Bate |
| Triggers | 88 | 88 | Bate |
| Policies | 177 | 177 | Bate |
| Enums (tipos) | 2 | 2 | Bate |
| Sequences | 0 | 0 | Bate |
| Constraints | 226 (PK 61 / FK 95 / UNIQUE 25 / CHECK 45) | 226 | Bate — ver 6.6 |
| Índices | 283 | 283 | Bate — ver 6.6 |
| Colunas | 1.930 | não contável por grep | Não verificável no dump |
| ACL/grants | 3.472 | 749 instruções `GRANT` | Diferença esperada — ver 6.6 |
| Funções | 169 (bruto) / 134 (aplicação) | 134 `CREATE FUNCTION` | Conciliado — ver 6.6 |
| Extensões | 8 | 0 | Diferença esperada — ver 6.6 |

RLS: 103 `ENABLE ROW LEVEL SECURITY`, 0 `FORCE`. `proconfig`: 94 `SET search_path`. Comments: 68.

### 6.6 Explicação das diferenças

**Índices (283 vs 197 `CREATE INDEX`) — conciliado.** O pg_dump emite os índices de PK e UNIQUE via `ADD CONSTRAINT`, não via `CREATE INDEX`. 197 + 61 (PK) + 25 (UNIQUE) = **283**. Bate exatamente.

**Constraints (226 vs 181 `ADD CONSTRAINT`) — conciliado.** O pg_dump embute constraints `CHECK` na própria `CREATE TABLE`. Verificado: 0 `ADD CONSTRAINT … CHECK` e 45 `CONSTRAINT … CHECK` inline. 181 + 45 = **226**. Bate exatamente. A quebra do dump por tipo (PK 61 / FK 95 / UNIQUE 25 / CHECK 45) reproduz a do fingerprint.

**ACL/grants (3.472 vs 749).** Diferença esperada de unidade de medida: o fingerprint conta tuplas de privilégio (grantee × privilégio × objeto) via `aclexplode`, enquanto o dump agrega vários privilégios e roles por instrução `GRANT`. Não conciliável por contagem de linhas; a validação real é o hash `7b37d0cd…` no 01B-3.

**Extensões (8 vs 0).** Esperado e conforme a regra 4: extensões não pertencem ao schema `public` e não devem entrar no `schema.sql`. O 01B-3 instalará o delta.

**Funções (169 vs 134) — conciliado pela AUD-FUNCTIONS-RECONCILE-01.** Ver seção 7.3.

## 7. Limitações

1. **Fingerprints não foram extraídos por mim.** O `fingerprints-proto.json` foi fornecido pronto e gravado literalmente. Não houve conexão read-only ao proto nesta fase: não há credencial de banco do `binbcdfbisgscrifztia` disponível no ambiente, e CLI/`config.toml` estão fora do escopo autorizado. Dez das doze categorias não foram reproduzidas de forma independente — ver 7.1.
2. **`fingerprints_extracted_at` = `null`** — ver 7.2.
3. **Query da auditoria de funções não registrada** — ver 7.3.
4. **Contagem de colunas (1.930) não verificável** por inspeção textual do dump.
5. **Vazio das 12 tabelas backup no proto não foi verificado** — o dump é schema-only, logo a ausência de linhas nele é estrutural e não constitui evidência sobre o estado do banco.

### 7.1 Verificação independente parcial dos fingerprints

Duas das doze categorias são calculáveis sem acesso ao banco, a partir da própria query, e foram reproduzidas localmente:

| Categoria | Hash no JSON | Cálculo local | Resultado |
|---|---|---|---|
| `sequences` | `b50339a10e1de285ac99d4c3990b8693` | `md5('NONE')` — a query aplica `coalesce(…, 'NONE')` e o proto tem 0 sequences | **MATCH** |
| `extensions` | `cced67e1d766c5edc4ac1c76acc6f81d` | `md5('pg_cron,pg_stat_statements,pg_trgm,pgcrypto,plpgsql,supabase_vault,unaccent,uuid-ossp')` | **MATCH** |

Isso confirma a consistência interna entre a query, a lista de extensões exigidas e o JSON fornecido. **Não** confirma as outras dez categorias, que dependem do conteúdo do banco.

### 7.2 `fingerprints_extracted_at` = null

- **Valor gravado:** `null`.
- **Motivo:** o timestamp não foi fornecido pela coleta read-only.
- **Decisão:** o relógio local **não** foi usado como se fosse o horário da extração. A hora de gravação destes artefatos não é evidência de quando os fingerprints foram colhidos do proto, e registrá-la nesse campo seria fabricar procedência.

### 7.3 Funções — AUD-FUNCTIONS-RECONCILE-01 concluída

**Auditoria `AUD-FUNCTIONS-RECONCILE-01` concluída. A divergência está conciliada.**

| Item | Valor |
|---|---|
| Total de funções no proto | **169** |
| Funções dependentes de extensão | **35** |
| — `pg_trgm` | 31 |
| — `unaccent` | 4 |
| Funções de aplicação | **134** |

Confirmado que o dump contém exatamente as **134 funções de aplicação**.

**Conclusão: nenhuma função de aplicação foi perdida no `pg_dump`. A diferença é integralmente explicada por funções pertencentes às extensões.**

Fingerprints correspondentes:

- `functions` = `845d8d4863428b3f81dc4a94eaed1b7f` (169) — fingerprint **bruto** do proto.
- `application_functions` = `0bad2d3a13e3cab2a0e185f9722fc6c2` (134) — fingerprint de **equivalência**, usado no gate do 01B-3.

O gate do 01B-3 compara `application_functions`, **não** `functions`.

**Verificação local.** A aritmética foi conferida e fecha exatamente: 31 + 4 = 35; 169 − 35 = 134; e 134 é o número de `CREATE FUNCTION` do dump. Os hashes não foram reproduzidos — dependem de `pg_get_functiondef` no banco.

**Correção de registro.** A hipótese anterior deste relatório citava `pg_trgm`, `unaccent`, `uuid-ossp` e `pgcrypto`. A auditoria comprovou apenas `pg_trgm` e `unaccent`: `uuid-ossp` e `pgcrypto` não residem em `public`. A hipótese estava parcialmente errada e foi substituída pelo resultado da auditoria.

**Bloqueio encerrado.** A query `application_functions_query` foi registrada no `manifest.json`. O gate de `application_functions` está completamente reproduzível e o bloqueio foi encerrado.

A query registrada (exclusão via `not exists` sobre `pg_depend.deptype='e'`) usa expressão de hashing **idêntica** à da categoria `functions` da query de 12 categorias — mesmo `proname(identity_args):md5(functiondef):proconfig`, mesmo separador e mesma ordenação. As duas medem a mesma coisa sobre populações diferentes, o que torna 169 e 134 diretamente comparáveis.

## 8. Pendências para o 01B-3

1. Instalar no homolog **apenas o delta** entre as 8 extensões exigidas e as presentes no alvo. Lista exigida, ordenada: `pg_cron`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `unaccent`, `uuid-ossp`.
2. Reexecutar a query dos 12 fingerprints no homolog após a aplicação e confrontar hash a hash com `fingerprints-proto.json`.
3. **Funções — conciliado (ver 7.3).** Comparar o alvo por `application_functions` (`0bad2d3a…`, 134), **não** por `functions` (`845d8d48…`, 169). A query `application_functions_query` foi registrada no `manifest.json`: o gate está completamente reproduzível e o bloqueio foi encerrado.
4. **Risco operacional — `config.toml` aponta para produção.** `supabase/config.toml` contém `project_id = "duttifnbxqtyyybjmouv"` (produção). Qualquer comando Supabase CLI executado na raiz do repositório mira produção por padrão.
   - Classificação: **risco operacional permanente**. Registrado, não tratado — o arquivo não foi alterado em nenhum pacote.
   - Ação neste pacote: **nenhuma**.
   - Controle: **atendido no `ENV-HOMOLOG-01B-3`.** O bloqueio anterior — *"proibido até existir briefing específico que use `project_id` explícito e não dependa de CLI nem de `config.toml`"* — foi satisfeito: o briefing forneceu o `project_id` explícito (`sbwfacryawstuvhlaezm`) e a execução usou exclusivamente `psql` com host e usuário explícitos, sem nenhum comando Supabase CLI. O `config.toml` não foi lido. Bloqueio encerrado.
   - **O risco permanece.** O controle é atendido **por execução**, não de forma permanente: qualquer execução futura que dependa do CLI na raiz do repositório volta a mirar produção. Ver seção 9.

## 8.1 Query de fingerprints

A query literal das 12 categorias está gravada no campo `fingerprint_query` do `manifest.json`, sem reescrita, e foi verificada como byte a byte idêntica ao texto fornecido. Ela deve ser reexecutada **sem alteração** no alvo para que a comparação hash a hash seja válida.

## 9. Estado final

**O baseline foi aplicado com sucesso no homolog (`sbwfacryawstuvhlaezm`). 13/13 fingerprints MATCH.**

> **O `schema.sql` versionado não foi aplicado como está.** A aplicação usou uma cópia temporária, fora do controle de versão, com 12 exclusões obrigatórias — ver 9.2. O procedimento reproduzível está no runbook [`apply-homolog.md`](apply-homolog.md) e no campo `apply_procedure` do `manifest.json`.

Nada foi aplicado em proto (`binbcdfbisgscrifztia`) nem em produção (`duttifnbxqtyyybjmouv`). O dump bruto permanece íntegro em `/tmp/proto_public_schemaonly.raw.sql` e em `scratchpad/env-homolog-01b/`, ambos com SHA-256 `21dac3d4…cce2e94` — inalterado pela correção da seção 3.1, que atingiu apenas o `schema.sql` versionado.

### 9.1 Cronologia — duas paradas antes do sucesso

| # | Pacote | Ponto de parada | Causa | Desfecho |
|---|---|---|---|---|
| 1ª tentativa | `01B-3` | Linha 26 — `CREATE SCHEMA public;` | `ERROR: schema "public" already exists`. O `public` existe em qualquer projeto Supabase novo. | Rollback integral. Perícia provou que a emissão vem da flag `-n public` no `pg_dump`. |
| Correção | `01B-3A` | — | Baseline corrigido para `CREATE SCHEMA IF NOT EXISTS public;` — 1 linha, numeração preservada. Ver seção 3.1. | Novo SHA `ae6c7ca3…3cca6`. |
| 2ª tentativa | `01B-3B` | Linha 19221 — `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` | `ERROR: permission denied to change default privileges`. O role `postgres`, via pooler, não é membro de `supabase_admin`. | Rollback integral. Bootstrap passou; falhou 1.879 linhas depois. |
| 3ª tentativa | `01B-3C` | — | Cópia temporária com **exatamente 12 exclusões** e nenhuma outra alteração. | **`EXIT_CODE=0`. Sucesso.** |

Ambas as paradas têm a **mesma família de causa**: a flag `-n public` na geração trouxe para o artefato objetos de *provisionamento da plataforma* (o schema `public` em si, e as ACLs default de `supabase_admin`) que não pertencem ao schema da aplicação.

### 9.2 A cópia temporária — 12 exclusões, nada mais

Criada apenas em `scratchpad/`, fora do controle de versão. O `schema.sql` versionado **não foi alterado** — permanece com SHA `ae6c7ca3…3cca6` e 19.272 linhas.

| Bloco | Linhas no versionado | Instruções |
|---|---|---|
| SEQUENCES | 19221-19224 | `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin … TO postgres, anon, authenticated, service_role` |
| FUNCTIONS | 19241-19244 | idem |
| TABLES | 19261-19264 | idem |

Prova de que nada mais mudou: o `diff` entre versionado e cópia tem **12 deleções e 0 adições**. As 12 instruções `FOR ROLE postgres` foram **preservadas e aplicadas**.

**Por que é seguro:** o `pg_default_acl` do homolog já possui as 12 combinações (3 tipos × 4 grantees) com privilégio equivalente a `GRANT ALL` — `FUNCTIONS=EXECUTE`; `SEQUENCES=SELECT,UPDATE,USAGE`; `TABLES=DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`. Correspondência 1:1 com o excluído. Nada foi perdido.

### 9.3 Fingerprints — 13 MATCH / 0 DIVERGENTE

Queries extraídas literalmente do `manifest.json` e executadas sem reescrita.

| Categoria | | Categoria | |
|---|---|---|---|
| `tabs_rls` | MATCH | `triggers` | MATCH |
| `cols` | MATCH | `policies` | MATCH |
| `constraints` | MATCH | `acl_grants` | MATCH |
| `indexes` | MATCH | `sequences` | MATCH |
| `enums` | MATCH | `extensions` | MATCH |
| `views` | MATCH | `functions` | MATCH |
| **`application_functions`** | **MATCH** — gate oficial (`gate_rule_01b3`) | | |

**Nenhuma allowlist precisou mascarar divergência real.** A `expected_diff_allowlist` documentava diferenças de *contagem textual do dump vs catálogo* — unidades de medida, não divergências estruturais. A validação real é hash a hash no banco, e todas as categorias fecharam por hash, incluindo as duas que a allowlist marcava como "esperadas" ou "não verificáveis":

- `acl_grants` — **MATCH exato** (`7b37d0cd…`, 3.472 tuplas). O manifest previa que só seria validável aqui. Fechou.
- `cols` — **MATCH** (`ab83a8b7…`, 1.930 colunas). Estava marcada como "não verificável" por inspeção textual; o hash resolveu.
- `functions` (bruto, 169) — **MATCH**, além do exigido. Consequência de `pg_trgm` e `unaccent` residirem em `public` no homolog, espelhando o proto.

### 9.4 Estado final do homolog

| Objeto | Obtido | Baseline |
|---|---|---|
| Tabelas | **116** | 116 |
| Funções de aplicação | **134** | 134 |
| Funções totais | **169** | 169 (134 + 35 de extensão) |
| Views | **8** | 8 |
| Triggers | **88** | 88 |
| Policies | **177** | 177 |
| Tabelas com RLS | **103** | 103 |
| Extensões | **8** | 8 |

As **extensões permaneceram instaladas** — `pg_cron`, `pg_trgm`, `unaccent` (instaladas no `01B-3`) mais as 5 pré-existentes. `pg_trgm` e `unaccent` residem em `public`, espelhando o proto; foi o que permitiu `functions` (bruto) dar MATCH.

**O homolog ficou estruturalmente equivalente ao proto.** Produção (`duttifnbxqtyyybjmouv`) permanece intocada; nenhum comando Supabase CLI foi executado em nenhuma etapa.

### 9.5 Mitigação do risco do `config.toml` nesta execução

O `ENV-HOMOLOG-01B-3` **não usou o Supabase CLI em nenhum momento**. Todo o acesso ao homolog foi feito por `psql` com host e usuário explícitos (`aws-1-sa-east-1.pooler.supabase.com` / `postgres.sbwfacryawstuvhlaezm`), autenticado por `.pgpass`. O `config.toml` — que aponta para produção — não foi lido.

O risco **não foi eliminado**: foi contornado por escolha de ferramenta, nesta execução. A mitigação não se estende a execuções futuras. Ver seção 8, item 4.
