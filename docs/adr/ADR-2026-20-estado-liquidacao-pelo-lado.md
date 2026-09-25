# ADR-2026-20 — Estado de liquidação pelo lado da operação; obrigações do outro lado como despesas

Status: ACEITO (25/09/2026) · Decide sobre: de que lado da Operação Comercial o estado de liquidação fala, e como as obrigações do outro lado aparecem · Responsáveis: Gabriel Junqueira (decisor), Claude Chat (arquiteto), Claude Code (executor)

> **Mudança conceitual por novo ADR.** Referencia o ADR-2026-16 (eixo 4 —
> Liquidação) e o ADR-2026-19 (Liquidação Operacional e Satisfação das
> Obrigações), **sem alterá-los**, como o próprio ADR-2026-19 manda: "mudança
> conceitual futura ocorre por novo ADR que referencie este — nunca por edição
> silenciosa".

## Contexto

O ADR-2026-16 define o eixo 4 da Operação Comercial como **"Liquidação — o
dinheiro/bens andaram?"**, com os estados não liquidada · parcial · quitada ·
excedente. O ADR-2026-19 fixa que a Liquidação registra a **satisfação de
obrigações** e não é dinheiro. Nenhum dos dois diz **de que lado** a pergunta do
eixo 4 é feita.

A implementação respondeu "dos dois lados ao mesmo tempo": o estado comparava o
principal **mais todas as obrigações** (entradas e saídas) com **todas as
liquidações**. Medido em 25/09/2026, isso produzia:

- cinco operações em "parcial" com **zero** recebido — só o adiantamento do
  boitel, o frete ou uma taxa tinham sido pagos (ex.: Vera b58bf556, venda de
  boitel de R$ 686.857,46, apresentada como "paga 14%");
- uma venda com o principal inteiro recebido apresentada como "parcial" por um
  frete em aberto (RRCC 744c520e);
- uma venda "excedente" porque a base vinha do lote, que nunca chegou ao saldo
  do acerto, enquanto o compromisso pago estava certo (RRCC da0b8577).

O modal da própria Operação Comercial já lia pelo lado (A receber, Recebido,
Falta receber, Despesas), pela conta do plano de cada compromisso. O estado e a
Central eram as leituras que discordavam.

## Decisão

1. **O estado de liquidação fala do lado da operação.** Venda, abate e boitel:
   o que **entra** (recebimento). Compra: o que **sai** (pagamento).

2. **A base do lado é o compromisso.** A obrigação do lado sai de
   `vw_oc_operacao_compromissos_resumo` — a mesma fonte do modal da OC e do
   Resumo da Central. O lote deixa de ser a base quando há compromisso do lado;
   a divergência lote × acerto segue tratada em OC-BOITEL-DELTA-ANTIGO-01.

3. **O liquidado do lado são as liquidações de natureza do lado.** A natureza
   segue a direção do título desde o OC-LIQ-SINAL-01 (entrada = recebimento,
   saída = pagamento), o que a torna a chave confiável para a divisão.

4. **As obrigações do outro lado são despesas, com indicador próprio.** Frete,
   Fundersul, comissão, adiantamento do boitel, devolução ao comprador (numa
   venda) deixam de mover o estado e passam a aparecer como
   `despesas_pendentes` = obrigação do outro lado − liquidado do outro lado.

5. **Sem compromisso do lado, nada muda.** Operação sem compromisso no seu lado
   (legado, ou só com obrigações do outro lado) mantém a conta anterior — a
   guarda impede que uma base zero produza um "quitada" falso.

6. **A régua não muda.** `_oc_estado_liquidacao` (tolerância de R$ 0,01) segue
   sendo a única régua; muda o que entra nela.

Continua valendo do ADR-2026-19: a Liquidação é satisfação de obrigação, não
dinheiro; o fato monetário é do Financeiro.

## Implementação

- `vw_oc_operacao_liquidacao` (migration `20261027150000_oc_status_lado_01.sql`):
  mesmas colunas, pelo lado; `base_origem = 'compromisso_lado'`; três colunas
  novas — `despesas_obrigacao`, `despesas_liquidado`, `despesas_pendentes`.
- Central: a pílula de pagamento lê o estado novo, com marca âmbar quando há
  despesa pendente; o filtro "Pagamento" ganha "Despesas pendentes".
- Resumo da Central e aba de Liquidação da OC: lado da operação e despesas em
  blocos separados.
- `oc_derivar_status` não tem chamador e fica **morta** (não alinhada), para não
  virar uma segunda cópia desta regra.

## Efeito medido na aplicação (25/09/2026)

Sete operações mudaram de estado, nenhuma outra: 8a6295f0, b58bf556, 7f7de76f,
581d075c, 2d39d7e9 (parcial → não liquidada), 744c520e (parcial → quitada, com
R$ 20.615,00 de despesa pendente) e da0b8577 (excedente → quitada, com
R$ 6.000,00 de despesa pendente). As 23 operações sem compromisso ficaram
idênticas.

## Relacionados

- ADR-2026-16 — Arquitetura Oficial da Operação Comercial (eixo 4, §2.4).
- ADR-2026-19 — Liquidação Operacional e Satisfação das Obrigações.
- ADR-2026-18 — Soberania Financeira e Fronteira entre OC e Financeiro.
