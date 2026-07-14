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
| Bruto (`scratchpad/env-homolog-01b/proto_public_schemaonly.raw.sql`) | 19.272 | 704 KB | `21dac3d43e0ec01fa1a01a9a1b13fc1b5e849b1b45e7d304decd5ef9ecce2e94` |
| Sanitizado (`schema.sql`) | 19.272 | 704 KB | `21dac3d43e0ec01fa1a01a9a1b13fc1b5e849b1b45e7d304decd5ef9ecce2e94` |

`diff` entre bruto e sanitizado: **vazio**. Os arquivos são byte a byte idênticos.

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

Consequência registrada: o `schema.sql` preserva o SHA-256 do bruto. Isso é esperado e não indica falha de sanitização — indica que o dump já foi gerado com as flags corretas na origem.

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
   - Classificação: **risco operacional**. Registrado, não tratado.
   - Ação neste pacote: **nenhuma**. O arquivo não foi alterado.
   - Bloqueio: o `ENV-HOMOLOG-01B-3` permanece **proibido** até existir briefing específico que use `project_id` explícito e não dependa de CLI nem de `config.toml`.

## 8.1 Query de fingerprints

A query literal das 12 categorias está gravada no campo `fingerprint_query` do `manifest.json`, sem reescrita, e foi verificada como byte a byte idêntica ao texto fornecido. Ela deve ser reexecutada **sem alteração** no alvo para que a comparação hash a hash seja válida.

## 9. Estado

**O baseline ainda NÃO foi aplicado em nenhum ambiente.** Nada foi executado contra proto, homolog ou produção nesta fase. O dump bruto permanece íntegro em `/tmp/proto_public_schemaonly.raw.sql` e em `scratchpad/env-homolog-01b/`, ambos com SHA-256 `21dac3d4…cce2e94`.
