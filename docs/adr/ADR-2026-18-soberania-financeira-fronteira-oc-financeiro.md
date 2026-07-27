# ADR-2026-18 — Soberania Financeira e Fronteira entre Operação Comercial e Financeiro

Status: ACEITO (27/07/2026) · Decide sobre: a soberania do domínio Financeiro sobre os fatos monetários e a fronteira entre a Operação Comercial e o Financeiro · Responsáveis: Gabriel Junqueira (decisor), Claude Chat (arquiteto), Claude Code (executor)

> **Consolidação arquitetural.** Sintetiza as conclusões aprovadas das auditorias
> FIN-ARCH-01/02/03 (material-fonte, não versionadas neste repositório).
> Referencia e complementa a Constituição Técnica, o ADR-2026-16 e o ADR-2026-17
> como baseline, sem alterá-los. Mudança conceitual futura ocorre por novo ADR
> que referencie este — nunca por edição silenciosa.

## Contexto

A Operação Comercial (OC) organiza o negócio e pode originar fatos que alimentam
o Financeiro. As auditorias evidenciaram o risco de a OC manter uma **segunda
verdade** sobre pagamento monetário, paralela ao Financeiro. Este ADR fixa a
soberania financeira e a fronteira entre os dois domínios, no escopo auditado.

## Decisão arquitetural vigente

1. **`financeiro_lancamentos_v2` é a entidade soberana dos fatos monetários**
   abrangidos por esta auditoria.

2. O lançamento financeiro é a fonte oficial de: valor monetário; obrigação
   financeira materializada; pagamento ou recebimento monetário; estado
   financeiro; ciclo programado, realizado e conciliado.

3. **`extrato_bancario_v2` representa o fato informado pelo banco.**

4. A **conciliação** representa a prova e a imputação entre extrato bancário e
   lançamento financeiro, no nível do lançamento.

5. A **Operação Comercial é soberana sobre o negócio e seus fatos
   operacionais**: negociação; contraparte; lotes; animais; documentos
   operacionais; obrigações comerciais; mecanismos operacionais de satisfação.

6. A OC **pode originar ou materializar** lançamentos financeiros, mas **não
   pode manter uma segunda fonte independente de verdade** sobre pagamento
   monetário.

7. **Obrigação comercial e lançamento financeiro são entidades conceitualmente
   distintas**, ainda que relacionadas.

8. A OC **não pode declarar uma operação monetariamente paga** apenas por
   registros próprios quando o fato financeiro soberano está no Financeiro.

9. O **vínculo entre OC e Financeiro deve ocorrer por identificadores
   estruturais**, nunca por descrições textuais ou coincidência de valores.

**Regra normativa:**

> "O dinheiro existe exclusivamente no domínio Financeiro. A Operação Comercial
> organiza o negócio e pode originar lançamentos, mas não mantém estado
> monetário independente."

## Implementação atual

- O Financeiro V2 (`financeiro_lancamentos_v2`) é soberano do caixa, do extrato
  e da conciliação (coerente com ADR-2026-17 P5).
- A OC materializa obrigações vinculadas ao Financeiro por identificadores
  estruturais (ponte por `financeiro_lancamento_id`), não por texto/valor.
- O ciclo programado/realizado/conciliado do fato monetário vive no lançamento
  financeiro.

## Gaps pendentes de execução

10. A **coexistência atual de estados derivados** de `financeiro_lancamentos_v2`
    e de `zoo_operacao_liquidacoes` configura **dupla verdade de pagamento** e é
    registrada como **GAP pendente de execução** — a reconciliação para uma
    única verdade de pagamento ocorre em PR próprio, fora deste documento.

## Evidência materializada — caso Carlinhos

Caso real citado como evidência (sem reproduzir a auditoria nem expor dados
desnecessários): o **Financeiro indicava pagamento**, enquanto a **OC indicava
saldo aberto** — a materialização da dupla verdade de pagamento descrita no GAP
acima.

## Fora do escopo deste ADR

Não são decididos aqui: aposentadoria do writer legado; obrigação integral;
classificação automática; sexo misto; seleção manual; frete; comissão; catálogo
de componentes. Permanecem para seus contextos próprios.

**Honestidade documental.** Patrimônio e movimentações de rebanho estão **fora
do escopo**; sua soberania e fronteiras serão confirmadas em auditoria própria.
Não se atribui soberania definitiva a domínios não auditados.

## Relacionados

- Constituição Técnica (Título III — soberania de dados: caixa realizado;
  classificação financeira).
- ADR-2026-16 — Arquitetura Oficial da Operação Comercial.
- ADR-2026-17 — Operações Comerciais V2 (P5; §13 integração com o Financeiro V2).
- ADR-2026-19 — Liquidação Operacional e Satisfação das Obrigações.
