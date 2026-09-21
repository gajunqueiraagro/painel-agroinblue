# Migrations penduradas — retrato de 21/09/2026

> **O que é isto.** O retrato do que está **aplicado no banco proto** (`binbcdfbisgscrifztia`) mas
> **não versionado** em `supabase/migrations/`. Não é uma lista de defeitos: é o mapa de uma dívida
> de registro, para que as frentes que vierem depois não precisem remedir.
>
> **Como foi medido.** Extraí o corpo de toda `CREATE [OR REPLACE] FUNCTION` das **706 migrations**
> do repo — o texto entre `$tag$ … $tag$`, que é exatamente o que o Postgres guarda em
> `pg_proc.prosrc` — e comparei o **md5 desse texto** com o `prosrc` vivo das **247 funções plpgsql**
> do schema `public`. Uma função conta como versionada quando **algum** arquivo produz o md5 vivo.
> Todas as consultas ao banco foram `SELECT`, pelo canal read-only. **Nada foi aplicado nem
> reaplicado.**
>
> **Data:** 21/09/2026. Os números envelhecem a cada mudança no banco.

## Por que isso acontece

`supabase/migrations/` **não é o ledger de aplicação** — é um registro escrito à mão, depois do
fato. O banco tem o seu próprio: `supabase_migrations.schema_migrations`, com **282 registros**
contra os **706 arquivos** do repo, e as numerações **não se falam**. O mesmo trabalho aparece como
`20260918225549 fn_parcelamento_cadastrar_v2` no ledger e como
`20261027123600_fn_parcelamento_cadastrar_v2.sql` no repo.

Isso é deliberado e está no CLAUDE.md: *"a migration é REGISTRO HISTÓRICO, não se reaplica"*. E
funciona — a frente "conta por direção" inteira (trigger, coluna gerada, CHECK, os três backfills de
dado) está registrada com cabeçalho, guardas e o porquê de cada uma.

**O problema não é o método; é que ele só cobre o que alguém lembrou de escrever.** E 76 vezes
ninguém escreveu.

## O tamanho da dívida

| categoria | quantas | risco |
|---|---|---|
| **Lote 2** — nunca versionadas | **26** | alto: num banco limpo não nascem |
| **Lote 3** — migration desatualizada | **50** | médio: existe *alguma* definição |
| Lote 1 — versionado em 21/09 | 1 | ✅ fechado (commit `ed843603`) |

---

## LOTE 2 — as 26 NUNCA versionadas

⚠ **Estas são o risco maior, e a razão é simples: num banco limpo elas não existem.** Nenhum arquivo
do repo as cria. O ledger do proto registra a aplicação de várias delas **pelo nome**, o que confirma
que rodaram — e que o arquivo é que nunca foi escrito.

### Recorrência (2)

```
fn_recorrencia_gerar
fn_recorrencia_cancelar
```
Os dois gravadores da recorrência de lançamentos. O ledger do banco registra a aplicação como `recorrencia_rpcs_gerar_cancelar`; `ls supabase/migrations/ | grep -i recorrencia` devolve **nenhum arquivo**.

### Documentos do financeiro (3)

```
fin_documento_registrar
fin_documento_editar
fin_documento_cancelar
```
O trio de anexos/documentos do financeiro. No ledger como `t1_docs_financeiro`.

### Contrato (2)

```
fn_contrato_criar_e_gerar
fn_contrato_editar_e_regenerar
```
Os dois maiores desta lista (8.213 e 12.544 caracteres). Geram e regeneram as parcelas de um contrato.

### Operação Comercial (5)

```
oc_salvar_abate
oc_excluir_lote
oc_alterar_parcela_programacao
oc_reprogramar_compromisso_do_lote
_oc_sync_abate_lancamento
```
Todas com nome no ledger (`oc_salvar_abate`, `oc_excluir_lote`, `oc_alterar_parcela_programacao`, `oc_reprogramar_compromisso_do_lote`) e nenhum arquivo no repo.

### Cache zootécnico (3)

```
fn_zoot_cache_ensure
refresh_zoot_cache_reclassificacao
trg_fn_invalidate_zoot_cache
```
O `ensure`, o refresh de reclassificação e o gatilho que invalida. ⚠ `refresh_zoot_cache` (sem sufixo) NÃO está aqui: ele tem três sobrecargas e está versionado — ver a ressalva de método.

### Guards e gatilhos (2)

```
trg_fn_guard_lancamento_mes_fechado_p1
trg_fn_fechamento_pasto_vigencia
```
Dois gatilhos que BLOQUEIAM escrita. Num banco sem eles, o mês fechado deixa de ser fechado e a vigência de pasto deixa de ser conferida — e nada avisa.

### Reconciliadores de financiamento (2)

```
fn_reconciliar_financiamento
fn_reconciliar_todos_financiamentos
```
⚠ `fn_reconciliar_parcela_financiamento` (30.640 caracteres, a maior função do schema) **está versionada** — são só estes dois que a chamam que não estão.

### Utilitários de SQL cru (2)

```
exec_query
exec_sql
```
Executam SQL arbitrário. Merecem leitura de segurança junto com o versionamento, não só um `CREATE OR REPLACE` carimbado.

### Fechamento, saldo e classificação (5)

```
fn_ano_mes_from_competencia
fn_completar_categorias_saldo_inicial
fn_lancamento_auto_derivar
fn_propagar_saldo_dezembro
resolve_escopo_planejamento_financeiro
```
Avulsas, sem frente comum. `fn_propagar_saldo_dezembro` e `fn_completar_categorias_saldo_inicial` tocam saldo inicial; `resolve_escopo_planejamento_financeiro` decide escopo de planejamento.

---

## LOTE 3 — as 50 DESATUALIZADAS

Existe migration, mas ela **não produz o que está vivo**. As diferenças **não são cosméticas**: o
delta vai de **7** a **4164** caracteres.

A migration mais antiga desta lista é de **08/04/2026**; a mais recente, de **11/09/2026**.
Concentração: **`oc_*` / `_oc_*`: 25** · **`fn_classificacao_*`: 6**.

Ordenado por tamanho do delta (`banco − arquivo`; negativo = o banco tem MENOS que o arquivo).

| função | última migration | arquivo | banco | delta |
|---|---|---:|---:|---:|
| `reabrir_pilar_fechamento` | `20260408145238_d6ae3557-b6bc-4888-9e99-436050f4495d.sql` | 5787 | 1623 | **-4164** |
| `oc_salvar_lotes` | `20260831143000_pr_oc_peso_mensagem_convergencia_01.sql` | 9338 | 11414 | **+2076** |
| `get_status_pilares_fechamento` | `20260829140000_pr_p1_data_fim_01.sql` | 4315 | 2565 | **-1750** |
| `oc_programar_compromisso` | `20260803160000_pr_oc_programacao_01_programar.sql` | 7881 | 6404 | **-1477** |
| `fn_classificacao_reresolver_match_sessao` | `20260702_pr_match_entradas_1.sql` | 4772 | 3353 | **-1419** |
| `oc_acrescentar_parcelas` | `20260829120000_pr_oc_fin_parcelas_01_acrescentar.sql` | 7472 | 6114 | **-1358** |
| `resolve_classificacao_from_plano` | `20260911130500_fin_recorr_propagar_01.sql` | 3870 | 4939 | **+1069** |
| `oc_criar_compromisso` | `20260803150000_pr_oc_compromisso_01_criar.sql` | 6757 | 5799 | **-958** |
| `oc_limpar_operacao_teste` | `20260811120000_pr_oc_limpar_operacao_teste_01.sql` | 8873 | 7947 | **-926** |
| `fn_transferir_vinculo_extrato` | `20260630_pr_transferir_vinculo.sql` | 6632 | 5709 | **-923** |
| `fn_vincular_extrato_lancamento` | `20260629_pr_e_d1_transferencia_por_lado.sql` | 3876 | 4672 | **+796** |
| `oc_cancelar` | `20260805120000_pr_oc_cancel_guard_01.sql` | 3809 | 3046 | **-763** |
| `oc_reabrir_para_estorno` | `20260806120000_pr_oc_reabrir_para_estorno_01.sql` | 4777 | 4047 | **-730** |
| `oc_estornar_materializacao` | `20260808120000_pr_oc_estornar_financeiro_01.sql` | 8043 | 7356 | **-687** |
| `oc_reabrir_para_reconciliacao` | `20260809120000_pr_oc_reabrir_para_reconciliacao_01.sql` | 7802 | 7171 | **-631** |
| `can_close_valor_rebanho` | `20260413184955_91062c19-fdde-4325-b2ab-524b2d49cc23.sql` | 1095 | 466 | **-629** |
| `oc_reabrir_entrega` | `20260804120000_pr_oc_reabrir_entrega_01.sql` | 2824 | 2265 | **-559** |
| `materializar_dre_lcdpr_from_plano` | `20260729130000_fin_flags_01a_materializar_compoe_dre.sql` | 3701 | 4127 | **+426** |
| `fn_criar_lancamento_de_extrato` | `20260628_fn_criar_lancamento_de_extrato_d2.sql` | 4310 | 3909 | **-401** |
| `oc_sincronizar` | `20260722233029_pr_oc_liq_model_01_obrigacoes.sql` | 6571 | 6209 | **-362** |
| `_oc_aplicar_partes` | `20260722233029_pr_oc_liq_model_01_obrigacoes.sql` | 2676 | 2356 | **-320** |
| `oc_materializar_programacao` | `20260830130000_pr_oc_sentido_por_plano_01.sql` | 7275 | 7558 | **+283** |
| `oc_encerrar_entrega` | `20260720100200_pr_oc_model_01_3_rpcs.sql` | 2492 | 2237 | **-255** |
| `fn_classificacao_reresolver_sessao` | `20260701_pr_u2a_contrato_enriquecimento.sql` | 3629 | 3388 | **-241** |
| `oc_estornar_liquidacao` | `20260720100200_pr_oc_model_01_3_rpcs.sql` | 1636 | 1402 | **-234** |
| `fn_validate_fechamento_pasto_item` | `20260504040000_add_peso_validation_trigger_fechamento_pasto_itens.sql` | 988 | 778 | **-210** |
| `oc_gerar_obrigacoes` | `20260801120000_pr_fin_oc_composicao_02.sql` | 13963 | 13762 | **-201** |
| `fn_desfazer_grupo_conciliacao` | `20260804092849_pr_conc_grupo_07_fn_desfazer_grupo_fix.sql` | 1627 | 1441 | **-186** |
| `guard_valor_rebanho_requer_p1_fechado` | `20260413184955_91062c19-fdde-4325-b2ab-524b2d49cc23.sql` | 631 | 456 | **-175** |
| `_oc_documento_aplicar` | `20260722230000_pr_oc_doc_model_01_documentos.sql` | 2766 | 2592 | **-174** |
| `oc_cancelar_obrigacao` | `20260722233029_pr_oc_liq_model_01_obrigacoes.sql` | 2401 | 2231 | **-170** |
| `trg_fn_invalidate_zoot_cache_saldos_iniciais` | `20260824120000_zoot_cache_invalidar_fechamento.sql` | 526 | 377 | **-149** |
| `fn_classificacao_resolver_ambiguo` | `20260701_pr_e3_resolver_ambiguo.sql` | 1964 | 1826 | **-138** |
| `fn_vincular_grupo_conciliacao` | `20260804092829_pr_conc_grupo_06_fn_vincular_grupo_fix.sql` | 5002 | 5119 | **+117** |
| `oc_cancelar_compromisso` | `20260808120000_pr_oc_estornar_financeiro_01.sql` | 4384 | 4274 | **-110** |
| `fn_classificacao_candidatos_ambiguo` | `20260702_pr_match_entradas_1.sql` | 1917 | 1815 | **-102** |
| `fn_snapshot_conciliacao` | `20260522_pr0a_11_fix_historico_descricao.sql` | 1317 | 1223 | **-94** |
| `fn_classificacao_desfazer_ambiguo` | `20260701_pr_e3_resolver_ambiguo.sql` | 1264 | 1179 | **-85** |
| `guard_staging_promovido_terminal` | `20260525_pr6_2_m0_staging_promocao_base.sql` | 2330 | 2245 | **-85** |
| `trg_fn_invalidate_zoot_cache_fechamento_itens` | `20260824120000_zoot_cache_invalidar_fechamento.sql` | 1403 | 1329 | **-74** |
| `cancel_zoot_importacao` | `20260413130753_27720a83-91b4-4b4d-82de-e9ffc1eabf18.sql` | 1960 | 1892 | **-68** |
| `oc_cancelar_programacao` | `20260808120000_pr_oc_estornar_financeiro_01.sql` | 5275 | 5209 | **-66** |
| `guard_saldos_iniciais_mes_fechado` | `20260414132128_d9eef9cb-5acd-4442-a550-c43157f7bc17.sql` | 1532 | 1471 | **-61** |
| `_oc_estorno_reabrir_entrega` | `20260807120000_pr_oc_estornar_recebimento_01.sql` | 1048 | 997 | **-51** |
| `guard_zoo_financeiro_cancelamento_realizado` | `20260530_guard_zoo_financeiro_cancelamento_realizado.sql` | 458 | 503 | **+45** |
| `_oc_estorno_mov` | `20260807120000_pr_oc_estornar_recebimento_01.sql` | 1271 | 1231 | **-40** |
| `fn_classificacao_resolver_contexto` | `20260701_pr_u2a_contrato_enriquecimento.sql` | 5491 | 5456 | **-35** |
| `oc_estornar_recebimento` | `20260807120000_pr_oc_estornar_recebimento_01.sql` | 3518 | 3484 | **-34** |
| `_oc_conciliar_peso` | `20260720100200_pr_oc_model_01_3_rpcs.sql` | 1122 | 1094 | **-28** |
| `oc_registrar_movimentacao` | `20260901120000_pr_oc_mov_fornecedor_01.sql` | 5309 | 5316 | **+7** |

⚠ **O delta negativo merece leitura própria.** `reabrir_pilar_fechamento` tem o arquivo de abril com
5.787 caracteres e o banco com 1.623: o ledger registra um `reabrir_pilar_fechamento_audit` posterior
que o repo não tem. Ou seja, parte do Lote 3 é, na prática, Lote 2 disfarçado — a versão viva nunca
foi escrita, e o que sobrou no repo é uma versão anterior que ninguém removeu.

---

## Ressalvas de método

**1. A comparação é por NOME de função.** Uma função com sobrecargas pode aparecer como divergente
sem estar, se a migration define uma assinatura e o banco tem outra. No proto, **só `refresh_zoot_cache`
tem sobrecarga** (três: 1.885, 1.883 e 1.848 caracteres) — e ele **não está em nenhuma das duas listas**,
então nenhum item deste documento é afetado.

**2. `fn_pendencias_fechamento_mes` foi falso positivo** na primeira varredura, que usava um regex mais
estreito (exigia `RETURNS` logo após os parênteses). Ela **está versionada e idêntica**. O regex foi
alargado para `CREATE [OR REPLACE] FUNCTION … AS $tag$`, e as listas acima já usam o alargado.

**3. O universo é `prokind='f'` + `lanlang='plpgsql'`.** Funções SQL puras, views, políticas RLS,
triggers (o `CREATE TRIGGER`, distinto da função que ele chama), índices e constraints **não entraram
nesta varredura**. A dívida real pode ser maior.

---

## O que já saiu

`fn_extrato_conciliar_mes` estava nesta lista e **saiu no Lote 1** (commit `ed843603`,
`supabase/migrations/20261027123700_fn_extrato_conciliar_mes_candidato_data_diferente.sql`). Eram os
quatro campos do candidato da data diferente, aplicados no proto em 21/09 sem arquivo no repo.

É por isso que este documento fala em **76** e não em 77: a varredura foi refeita depois do Lote 1, e
ela já não o encontra.

**E a verificação que vale registrar:** o arquivo foi conferido rodando *a mesma varredura deste
documento* sobre ele — o instrumento que o acusou é o que atestou a saída. Versionar não é copiar o
`pg_get_functiondef`; é copiar e **provar o md5**.

---

## O gate que impede a lista crescer — A FAZER, não feito

`scripts/check-migrations-pendentes.mjs`, no molde do `check-ui-nativo.mjs`:

- varre `supabase/migrations/*.sql`, extrai o corpo de cada função e guarda os md5;
- compara com o `prosrc` vivo (exige credencial de leitura do proto);
- **tem baseline**, como o TSC e o `check:ui-nativo` — falhar pelas 76 herdadas pararia todo PR e o
  gate seria desligado na primeira semana, que é como um gate morre. Ele acusa **ocorrência NOVA**:
  função fora da lista, ou função da lista cujo md5 mudou de novo;
- **se auto-testa antes de varrer**, como o `check:tdz` faz: um fixture com um md5 conhecido que ele
  precisa achar. "Zero achados" só vale quando a busca provou que sabe achar.

⚠ **Sem ele, este documento vira folclore em duas semanas.** A lista foi de 77 para 76 hoje; ela sobe
sozinha toda vez que alguém aplica algo no banco e não escreve o arquivo — que é exatamente o que
aconteceu 76 vezes até aqui.

⚠ **E há uma decisão de produto embutida nos Lotes 2 e 3**, que este documento não toma: um
`CREATE OR REPLACE` carimbado do estado atual registra o **QUÊ** sem registrar o **PORQUÊ**. O padrão
da casa (ver o cabeçalho de `20261027123000`) exige o porquê. Para as 76, reconstruir o porquê exige
arqueologia — decidir quanto vale a pena é do Gabriel, não do gate.
