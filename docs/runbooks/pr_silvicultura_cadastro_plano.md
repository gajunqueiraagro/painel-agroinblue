# Runbook — Cadastro de Silvicultura no Plano de Contas

**Executado:** 21/08/2026 17:12 UTC — proto (`binbcdfbisgscrifztia`)
**Natureza:** operação de dado. Complementa o PR de código `2e24e5d0`
(`PR-PC100-SILVICULTURA-01`), que criou predicates, agregadores,
indicadores e linhas do bloco Caixa.

## Por que

Silvicultura não existia como atividade. Os R$ 5.313.416,24 de
'Venda de Eucalipto' de 3 clientes estavam classificados em
`Receita Agrícola`, e a linha "Produção silvicultura" do bloco Caixa era
travessão permanente.

Silvicultura não é subconjunto de agricultura: ciclo plurianual (6-7 anos
entre plantio e corte), formação capitalizada, receita concentrada na
colheita. Somar com agricultura produz um R$/ha que não descreve nenhuma
das duas.

## Ordem de execução — código ANTES do banco

O PR de código foi commitado e homologado ANTES desta operação. Se o
banco viesse primeiro, os R$ 5,31 mi passariam por um estado transitório
na linha "Não classificado" em três clientes, porque `isReceitaSilvicola`
ainda não existiria.

O ajuste que tornou isso seguro: `isEntradaNaoClassificada` passou a negar
também `isReceitaSilvicola`. Sem ele, o eucalipto casaria com dois
predicates ao mesmo tempo e contaria DUAS VEZES no total de entradas,
porque `totalEntradas` é a soma das linhas exibidas.

## O que foi feito

1. **34 INSERTs** em `financeiro_plano_contas`, `escopo_negocio='silvicultura'`,
   faixa `ordem_exibicao` 20000+ (máximo anterior: 19050):
   - `Receita Silvícola` (grupo novo, entradas)
   - `Deduções Silvicultura`, `Custo Fixo Silvicultura`,
     `Custo Variável Silvicultura`, `Juros de Financiamento Silvicultura`,
     `Investimento Silvicultura` (grupos novos, saídas)
   - 2 subcentros em grupos existentes: `Entrada de Financiamento
     Silvicultura` (ordem 4050) e `Amortização Financiamento Silvicultura`
     (ordem 16030)

2. **Migração** de `Venda de Eucalipto`: `Receita Agrícola` →
   `Receita Silvícola`, escopo → `silvicultura`, ordem → 20010.
   MOVIDO, não recriado — preserva a série histórica num único lugar.

3. **Backfill de 15 lançamentos** de eucalipto (R$ 5.313.416,24):
   Santa Rita 6 · NJ 7 · Raul Juliato 2.

4. **Limpeza de 6 `escopo_negocio`** em `Receita Agrícola`:
   `administrativo` → `agricultura` (Cana, Milho, Soja, Outras Culturas,
   Eucalipto, Máquinas Agrícolas). Só `Venda de Amendoim` estava correto.

## Decisões de produto registradas

- **Formação de floresta capitaliza**: `Investimento Silvicultura` nasce com
  `compoe_dre = false`, divergindo do padrão do plano (Investimento
  Pecuária e Agricultura estão com `true`). Motivo: plantio não é despesa
  do exercício. Sem isso, o ano do plantio afunda e o ano do corte infla.
  Risco zero na adoção: são subcentros novos, sem lançamento histórico.
- **`Venda de Madeira` NÃO migrou** — pecuária também vende madeira. Foi
  criado `Venda de Madeira Silvicultura` separado.
- **`Receita de Arrendamento Florestal`**: caso Sta. Luzia, onde a terra é
  do cliente e a floresta é de terceiro. Custo zero ali é o modelo, não
  lacuna. Indicador de resultado florestal por hectare NÃO deve misturar
  quem planta com quem aluga.
- **O tipo `Escopo` do código NÃO foi tocado**. Silvicultura entra só por
  `grupo_custo` literal.

## Limitação declarada

Apuração correta de resultado silvícola exige **exaustão** — a baixa do
custo da floresta no momento do corte — e isso depende de inventário
florestal por talhão e idade, que o sistema NÃO tem. O plano de contas
resolve o vocabulário financeiro; não resolve o resultado. Até lá, a DRE
silvícola é declaradamente incompleta ("sem exaustão"), não errada.

Base normativa: eucalipto é ativo biológico sob CPC 29, mensurado a valor
justo menos despesa de venda; quando o valor justo não pode ser medido de
forma confiável, a norma permite custo como base — que é o caso aqui.

## Validação

Dry-run em transação com ROLLBACK antes da execução; resultado
pós-execução idêntico.

| verificação | resultado |
|---|---|
| Plano de contas | 156 → 190 (+34) |
| Linhas com escopo `silvicultura` | 35 (34 novas + Eucalipto) |
| Receita Agrícola com escopo sujo | 6 → 0 |
| Lançamentos em `Receita Silvícola` | 15 · R$ 5.313.416,24 |
| Eucalipto restante em `Receita Agrícola` | 0 |
| Órfãos novos criados | 0 |

Homologado em runtime: NJ jul/2026 silvicultura R$ 99.390 com total de
entradas INALTERADO em R$ 1.839.793 (prova de não haver contagem dupla);
Santa Rita 2025 R$ 1.518.437; Raul Juliato 2023 R$ 399.640.

## Rollback

Janela: `updated_at > timestamptz '2026-08-21 17:12:57.627795+00'`.

```sql
UPDATE financeiro_lancamentos_v2
  SET grupo_custo='Receita Agrícola', escopo_negocio='administrativo'
  WHERE subcentro='Venda de Eucalipto' AND cancelado IS FALSE;
UPDATE financeiro_plano_contas
  SET grupo_custo='Receita Agrícola', escopo_negocio='administrativo',
      ordem_exibicao=2030
  WHERE subcentro='Venda de Eucalipto' AND tipo_operacao='1-Entradas';
DELETE FROM financeiro_plano_contas
  WHERE escopo_negocio='silvicultura' AND subcentro <> 'Venda de Eucalipto';
```
A limpeza dos 6 `escopo_negocio` não deve ser revertida — era correção.
