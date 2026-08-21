# Runbook PR-1b — Backfill de `grupo_custo` em `financeiro_lancamentos_v2`

**Executado:** 21/08/2026 16:10 UTC — proto (`binbcdfbisgscrifztia`)
**Executado por:** sessão Claude Chat (Arquiteto), via Supabase Management API.
NÃO foi executado pelo Claude Code — o Code commitou apenas este runbook.
**Natureza:** operação de dado pontual. NÃO virou migration: replay em banco
limpo não teria o defeito, e a migration ficaria como um UPDATE que nunca casa.

## Problema

3.631 lançamentos não cancelados com `grupo_custo IS NULL`. Como os predicates
de agregação filtram por `grupo_custo` literal, esses registros ficavam fora
dos totais de entrada e saída sem qualquer aviso na tela.

## Causa

O front nunca grava `grupo_custo` — `buildInsertRow` (`useFinanceiroV2.ts`) não
inclui o campo. Quem preenche é o trigger `trg_resolve_classificacao_plano`
(BEFORE INSERT/UPDATE), que resolve via `financeiro_plano_contas` por
`subcentro` + `tipo_operacao` + `ativo`.

Os 465 registros corrigidos nasceram todos na janela **20–28/04/2026**
(importação incremental do RRCC + 3 manuais + 1 de movimentação de rebanho).
O trigger existia desde 10/04/2026, logo a explicação compatível com os dados
é que esteve desabilitado durante o bulk insert.

**Vazamento já tampado** pela migration `20260625_resolve_classificacao_bloqueio_subcentro_orfao`
(B1), que bloqueia subcentro fora do plano. Nenhum registro novo entrou depois.

## Escopo corrigido — 465 registros, 4 clientes, R$ 33.535.499,44

| cliente | grupo destino | tipo | n | valor |
|---|---|---|---:|---:|
| RRCC | Receita Pecuária | entrada | 46 | 21.677.172,35 |
| RRCC | Compra de Bovinos | saída | 157 | 10.727.882,60 |
| RRCC | Investimento Pecuária | saída | 204 | 855.567,04 |
| RRCC | Deduções Pecuária | saída | 40 | 151.283,58 |
| RRCC | Entradas de Capital | entrada | 11 | 109.142,43 |
| RRCC | Outras Receitas | entrada | 3 | 13.503,50 |
| NJ Pecuária | Deduções Pecuária | saída | 1 | 935,47 |
| Agnaldo Cedenho | Entre Contas | transf. | 2 | 11,97 |
| Vera Ligia Milani | Outras Receitas | entrada | 1 | 0,01 |

Distribuição temporal: 2020 (87), 2021 (90), 2022 (76), 2023 (30), 2024 (84),
2025 (97), 2026 (1).

Apenas `grupo_custo` foi tocado. `centro_custo` e `macro_custo` já batiam 100%
com o plano.

**Nenhum grupo de destino é `Custo Fixo Pecuária` nem `Custo Variável Pecuária`**
— custo por arroba e custo por hectare não se moveram em cliente nenhum.

## Excluídos deliberadamente — 3.166 remanescentes

- **3.050** sem `subcentro` (importação incremental RRCC): não derivam de nada,
  exigem classificação humana.
- **110** `origem_lancamento='ofx'`: extrato não traz plano de contas. Trabalho
  do enriquecimento, não defeito.
- **6** com `macro_custo='Dividendos'`: exceção explícita da B1 — dividendos são
  exclusivos por cliente e ficam fora do plano global **por design**.
- **15** casos de `escopo_negocio` divergente do plano (`Aporte Pessoal:
  financeiro→administrativo` ×11, `Outras Receitas: pecuaria→administrativo` ×3,
  1 NULL): fora do escopo deste backfill. Pendência própria.

## SQL executado

```sql
UPDATE financeiro_lancamentos_v2 l
SET grupo_custo = pc.grupo_custo
FROM financeiro_plano_contas pc
WHERE pc.subcentro = l.subcentro
  AND pc.tipo_operacao = l.tipo_operacao
  AND pc.ativo = true
  AND l.cancelado IS FALSE
  AND l.grupo_custo IS NULL
  AND l.subcentro IS NOT NULL
  AND coalesce(l.macro_custo,'') <> 'Dividendos';
```

## Validação

Dry-run prévio em transação com ROLLBACK: nenhum guard abortou, nenhum registro
marcado como `editado_manual`, zero conflito com o plano. Resultado pós-execução
idêntico ao dry-run, ao centavo.

| verificação | resultado |
|---|---|
| Órfãos | 3.631 → 3.166 (−465 exato) |
| Sobra elegível | 0 |
| Registros tocados na janela | 465 |
| Conflitos com o plano | 0 |
| Marcados `editado_manual` | 0 |

## Rollback

Valor anterior era `NULL` em todos os 465.

**A janela de `updated_at` sozinha NÃO é segura.** No dia da execução ela
isolava exatamente os 465 registros; a cada dia que passa, mais lançamentos
não relacionados caem dentro dela e teriam a classificação zerada. Por isso o
rollback filtra também por `created_at`, que é imutável: todos os 465
nasceram na janela de importação de 20–28/04/2026.

```sql
-- CONFIRA A CONTAGEM ANTES DE EXECUTAR: deve retornar exatamente 465.
SELECT count(*) FROM financeiro_lancamentos_v2
WHERE updated_at > timestamptz '2026-08-21 16:10:16.646515+00'
  AND created_at >= timestamptz '2026-04-20'
  AND created_at <  timestamptz '2026-04-29'
  AND grupo_custo IS NOT NULL
  AND subcentro IS NOT NULL
  AND coalesce(macro_custo,'') <> 'Dividendos';

UPDATE financeiro_lancamentos_v2
SET grupo_custo = NULL
WHERE updated_at > timestamptz '2026-08-21 16:10:16.646515+00'
  AND created_at >= timestamptz '2026-04-20'
  AND created_at <  timestamptz '2026-04-29'
  AND grupo_custo IS NOT NULL
  AND subcentro IS NOT NULL
  AND coalesce(macro_custo,'') <> 'Dividendos';
```

Se a contagem não der 465, PARE: outra operação tocou o conjunto e o rollback
não é mais reconstruível por regra — será preciso identificar os registros
individualmente antes de reverter.
