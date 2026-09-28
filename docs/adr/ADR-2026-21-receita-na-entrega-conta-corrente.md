# ADR-2026-21 — Receita na entrega, recebimento como adiantamento: o modelo conta corrente da Operação Comercial

Status: PROPOSTO (28/09/2026) · aguarda homologação do Gabriel · Decide sobre: quando a venda vira receita, onde o dinheiro recebido fica e como o saldo com o comprador é calculado · Responsáveis: Gabriel Junqueira (decisor), Claude Chat (arquiteto), Claude Code (executor)

> **Referencia o ADR-2026-17 (Arquitetura Operacional das Operações Comerciais V2), sem alterá-lo.** O P1 dele — "Operação ≠ lote
> ≠ documento ≠ título ≠ liquidação ≠ movimento bancário" — é a base deste: a conta corrente é exatamente a separação entre o
> FATO (a entrega) e o DINHEIRO (o recebimento), que o modelo de título colapsava num lançamento só. Referencia também o
> ADR-2026-19 (liquidação é satisfação de obrigação) e o ADR-2026-20 (estado pelo lado), que continuam valendo.

## Contexto

O caso que o motiva é o contrato do ano da Santa Rita com Helder Hofig (desmama 2025, OC 232c05aa): 7 embarques entre 19/03 e
25/06 e 4 recebimentos entre 17/04 e 25/07, sem nenhuma parcela casando com um embarque. No modelo de título, a receita só
existia quando o dinheiro entrava — os recebimentos estavam classificados como "Venda de Desmama Machos", na competência do
pagamento —, e o DRE de 2025 mostrava a venda de março em abril, a de junho em julho, e 1.357,89 a menos no ano: a diferença
entre o que saiu da fazenda e o que o comprador pagou.

## Decisão

1. **Dois modelos por operação** (`zoo_operacoes_comerciais.modelo_financeiro`): `titulo` (o de sempre: compromissos, programação,
   título por parcela) e `conta_corrente`. Toda OC existente é `titulo`; só entra em conta corrente por decisão explícita.
2. **Entrega é receita.** Cada saída ativa da OC gera um lançamento `realizado`, sem conta bancária, `sem_movimentacao_caixa`,
   competência = pagamento = data da saída, na conta de venda da categoria do lote (o mesmo mapa de `subcentroVenda.ts`), pelo
   valor do lote. Não mexe no caixa; vai para o DRE.
3. **Recebimento é caixa e é adiantamento.** O dinheiro do comprador vai para "Adiantamento de Clientes" (na compra, "Adiantamento
   a Fornecedores"), no grupo de Movimentações Financeiras, fora do DRE. Mantém a competência do pagamento, a conta bancária e a
   conciliação. Vincular um recebimento já lançado só troca a conta do plano.
4. **O saldo é calculado, nunca gravado**: entregue − recebido. Positivo, "ele deve"; negativo, "adiantado por ele". Não há
   rateio de recebimento por lote nem casamento de parcela com embarque — cada recebimento concilia 1 para 1 com o extrato.
5. **Saldo final com as entregas concluídas é diferença a explicar** (OC-VENDA-ENTREGAS-01c), e **não bloqueia** o fechamento.

## Consequências

- O DRE passa a mostrar a venda no mês em que o gado saiu. Na 232c05aa: março +992.138,24; ano +1.357,89 (medido em rollback).
- O caixa não muda: os recebimentos continuam onde estavam, com os mesmos valores, datas e conta.
- As telas de caixa já excluíam `sem_movimentacao_caixa`; Contas a Pagar e Receber passou a excluí-lo sempre, e os totais do
  Financeiro V2 separam "Entradas de caixa" de "Receita sem caixa" — nada contado duas vezes.
- A entrega não gera liquidação: liquidação é satisfação de obrigação (ADR-2026-19), e quem satisfaz é o recebimento.
- Compra e abate no modelo conta corrente, a programação de recebimento pela OC e a explicação do saldo final ficam para frentes
  próprias.
