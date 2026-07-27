# ADR-2026-19 — Liquidação Operacional e Satisfação das Obrigações

Status: ACEITO (27/07/2026) · Decide sobre: a missão da Liquidação da Operação Comercial como camada de satisfação das obrigações — distinta de dinheiro, pagamento soberano, lançamento financeiro, extrato e conciliação · Responsáveis: Gabriel Junqueira (decisor), Claude Chat (arquiteto), Claude Code (executor)

> **Consolidação arquitetural.** Sintetiza as conclusões aprovadas das auditorias
> FIN-ARCH-01/02/03 (material-fonte, não versionadas neste repositório).
> Referencia e complementa a Constituição Técnica, o ADR-2026-16, o ADR-2026-17 e
> o ADR-2026-18 como baseline, sem alterá-los. Mudança conceitual futura ocorre
> por novo ADR que referencie este — nunca por edição silenciosa.

## Contexto

A Liquidação da Operação Comercial (`zoo_operacao_liquidacoes`) registra como uma
obrigação comercial deixou de estar pendente. As auditorias evidenciaram o risco
de confundir a Liquidação com o fato monetário soberano do Financeiro. Este ADR
fixa a missão e os limites da Liquidação.

## Decisão arquitetural vigente

1. **`zoo_operacao_liquidacoes` representa um evento operacional de satisfação de
   obrigação.**

2. Liquidação **não é**: dinheiro; pagamento soberano; lançamento financeiro;
   extrato bancário; conciliação; baixa bancária.

3. Sua missão é registrar **como uma obrigação comercial deixou de estar
   pendente**.

4. A Liquidação é a **camada de orquestração, atribuição e narrativa** da
   satisfação das obrigações.

5. **Satisfação por dinheiro:** o fato monetário pertence ao Financeiro; a
   Liquidação referencia o lançamento financeiro correspondente; a Liquidação
   informa qual obrigação comercial foi satisfeita por aquele fato financeiro;
   **não cria uma segunda verdade de valor pago**.

6. **Satisfação não monetária:** a Liquidação pode representar permuta;
   compensação; abatimento; encontro de contas; mecanismos equivalentes.

7. **`financeiro_lancamento_id` é a ponte estrutural legítima** entre: o fato
   monetário soberano; a obrigação comercial; a narrativa operacional da
   quitação.

8. Formas como PIX, TED, dinheiro, boleto, cheque e equivalentes pertencem ao
   **lançamento financeiro** quando descrevem movimento de dinheiro.

9. **Identidade e descrição do bem** entregue em permuta pertencem ao **evento
   operacional de Liquidação**.

10. `permuta_valor_atribuido` representa o **valor convencionado** do bem ou
    mecanismo não monetário — não um movimento bancário independente.

11. **Documentos** pertencem à entidade documental da operação
    (`zoo_operacao_documentos` é a entidade documental existente na OC).

**Regras normativas:**

> "A Liquidação é a camada de orquestração da satisfação das obrigações da
> Operação Comercial. Ela registra como uma obrigação deixou de estar pendente;
> não cria, não movimenta e não concilia dinheiro."

> "Dinheiro que se move é do Financeiro; quitação que não move dinheiro, e o fio
> que liga cada pagamento à sua operação, são da Liquidação."

Em consequência: o pagamento monetário continua **soberano no Financeiro**; a
Liquidação apenas **atribui** esse lançamento a uma obrigação comercial; os
mecanismos não monetários são representados **diretamente** pela Liquidação.

## Implementação atual

- `zoo_operacao_liquidacoes` registra o evento de satisfação, com vínculo
  opcional ao título financeiro por `financeiro_lancamento_id`.
- A permuta é suportada como baixa sem caixa (reduz o saldo comercial sem
  aumentar disponibilidade — coerente com ADR-2026-16 §2.4 e ADR-2026-17 §17),
  com bem, valor atribuído e documento.
- Estornos preservam o fato e saem do saldo (append-only).

## Gaps pendentes de execução

12. `permuta_documento_url` está **arquiteturalmente mal-posicionada** (documento
    pertence à entidade documental, não ao evento de liquidação) e é registrada
    como **GAP pendente de execução** — sem alterar banco neste PR.

13. **Estorno operacional × estorno financeiro** são eventos distintos: estornar
    a declaração operacional não desfaz automaticamente lançamento, pagamento ou
    conciliação; estornar o fato financeiro não deve apagar silenciosamente a
    narrativa operacional. A integração futura deve **impedir estados
    contraditórios** — GAP pendente de execução.

14. As **views atuais da OC ainda derivam o valor pago a partir de
    `zoo_operacao_liquidacoes`, ignorando o estado soberano do Financeiro** —
    registrado como **GAP**, não como comportamento desejado (dupla verdade de
    pagamento, cf. ADR-2026-18 §10).

## Fora do escopo deste ADR

Não são incluídos aqui: classificação automática; classificação manual; sexo
misto; quantidade de obrigações por categoria; frete; comissão; writer legado;
obrigação integral. São estranhos ao objeto deste ADR.

## Relacionados

- Constituição Técnica (Título III — soberania de dados).
- ADR-2026-16 — Arquitetura Oficial da Operação Comercial (§2.4 semântica de
  liquidação).
- ADR-2026-17 — Operações Comerciais V2 (§17 permuta; §19 imutabilidade/estorno).
- ADR-2026-18 — Soberania Financeira e Fronteira entre OC e Financeiro.
