# Runbook — Backfill de subcentro em transferências entre contas

**Executado:** 21/08/2026 17:21 UTC — proto (`binbcdfbisgscrifztia`)
**Executado por:** sessão Claude Chat (Arquiteto), via Supabase Management API.
Nenhum PR de código acompanha esta operação.
**Natureza:** operação de dado pontual. Higiene de classificação.
**Impacto em tela: ZERO** — transferências não entram no bloco Caixa nem
em nenhum agregado de entrada ou saída.

## Problema

3.050 lançamentos `tipo_operacao='3-Transferências'` com `subcentro`,
`grupo_custo`, `macro_custo` e `centro_custo` todos nulos.

| cliente | n | valor |
|---|---:|---:|
| Santa Rita Agro | 2.432 | R$ 139.016.045,53 |
| NJ Pecuária | 618 | R$ 61.078.918,30 |

Todos com conta de origem E destino preenchidas e com
`transferencia_grupo_id` — são transferências legítimas e completas.
Só a classificação ficou vazia, no mesmo lote de importação incremental
de abril/2026 que originou o backfill do `pr_1b_backfill_grupo_custo.md`.

## Método

O plano de contas tem exatamente UM subcentro de transferência:
`3-Transferências / Transferências / Entre Contas / Bancário /
Transferência entre Contas Bancárias`.

Preencher apenas `subcentro` faz o trigger
`trg_resolve_classificacao_plano` derivar macro, grupo, centro e escopo
sozinho — não foi preciso escrever nenhum desses valores à mão.

## ARMADILHA — por que o UPDATE tem duas etapas

O trigger `mark_financeiro_lancamento_v2_editado_manual` marca
`editado_manual = true` quando o registro veio de importação
(`lote_importacao_id IS NOT NULL`) e alguma coluna monitorada muda.
`subcentro`, `macro_custo` e `centro_custo` estão na lista monitorada;
`grupo_custo` NÃO está — foi por isso que o backfill do PR-1b passou sem
marcar nada e este não passaria.

Marcar 3.050 transferências como "editadas manualmente" seria registrar
uma inverdade, e `editado_manual` protege o registro de ser corrigido por
reimportação futura.

Solução: dois UPDATEs na mesma transação. O segundo desmarca. Ele não
re-dispara a marcação porque a condição do trigger exige
`COALESCE(OLD.editado_manual,false) = false`, e no segundo UPDATE
`OLD.editado_manual` já é `true`.

A temp table `_alvo` exclui quem já tinha `editado_manual = true`
legitimamente antes — esses não são tocados nem desmarcados.

## SQL executado

```sql
BEGIN;
CREATE TEMP TABLE _alvo ON COMMIT DROP AS
  SELECT id FROM financeiro_lancamentos_v2
  WHERE cancelado IS FALSE AND grupo_custo IS NULL AND subcentro IS NULL
    AND tipo_operacao = '3-Transferências'
    AND conta_bancaria_id IS NOT NULL AND conta_destino_id IS NOT NULL
    AND transferencia_grupo_id IS NOT NULL
    AND COALESCE(editado_manual,false) = false;
UPDATE financeiro_lancamentos_v2
  SET subcentro = 'Transferência entre Contas Bancárias'
  WHERE id IN (SELECT id FROM _alvo);
UPDATE financeiro_lancamentos_v2
  SET editado_manual = false
  WHERE id IN (SELECT id FROM _alvo);
COMMIT;
```

## Validação

| verificação | resultado |
|---|---|
| Órfãos totais no banco | 3.166 → 116 |
| Transferências sem classificação | 0 |
| `grupo_custo='Entre Contas'` | 1.549 → 4.599 |
| Registros tocados na janela | 3.050 |
| Marcados indevidamente `editado_manual` | 0 |
| Inconsistências macro/centro vs plano | 0 |

## Estado final dos órfãos

Após esta operação, os 116 restantes são TODOS explicados:
- **110** `origem_lancamento='ofx'` — extrato não traz plano de contas.
  Aguardam enriquecimento. Não é defeito.
- **6** `macro_custo='Dividendos'` — exceção deliberada da migration
  `20260625_resolve_classificacao_bloqueio_subcentro_orfao` (B1):
  dividendos são exclusivos por cliente e ficam fora do plano global.

Não resta nenhum órfão sem causa documentada.

## Rollback

**A janela de `updated_at` sozinha NÃO é segura.** No dia da execução ela
isolava exatamente os 3.050 registros; a cada dia que passa, mais lançamentos
não relacionados caem dentro dela — e o UPDATE zeraria a classificação deles
também. Os filtros abaixo caracterizam o conjunto por atributos que não mudam.

```sql
-- CONFIRA A CONTAGEM ANTES DE EXECUTAR: deve retornar exatamente 3.050.
SELECT count(*) FROM financeiro_lancamentos_v2
WHERE updated_at > timestamptz '2026-08-21 17:21:01.971939+00'
  AND tipo_operacao = '3-Transferências'
  AND transferencia_grupo_id IS NOT NULL
  AND subcentro = 'Transferência entre Contas Bancárias';

UPDATE financeiro_lancamentos_v2
  SET subcentro = NULL, grupo_custo = NULL, macro_custo = NULL,
      centro_custo = NULL, escopo_negocio = NULL
  WHERE updated_at > timestamptz '2026-08-21 17:21:01.971939+00'
    AND tipo_operacao = '3-Transferências'
    AND transferencia_grupo_id IS NOT NULL
    AND subcentro = 'Transferência entre Contas Bancárias';
```

Se a contagem não der 3.050, PARE: outra operação tocou o conjunto e o
rollback não é mais reconstruível por regra.

ATENÇÃO: este rollback reverte APENAS a classificação. Ele não restaura
`editado_manual`, que foi deliberadamente mantido em `false` — ver a seção
"ARMADILHA" acima.
