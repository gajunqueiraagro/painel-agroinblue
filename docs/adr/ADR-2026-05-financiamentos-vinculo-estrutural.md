# ADR — Financiamentos: vínculo estrutural, nunca inferência textual

**Data:** 22/05/2026 · **Status:** Aceito e implementado

## Decisão
1. Origem soberana de órfão do módulo:
   origem_lancamento='financiamento' AND financiamento_id IS NULL
   AND cancelado=false. Sem heurística, sem regex, sem inferência
   textual — a origem define que nasceu do módulo; basta isso.
2. Arquitetura: financiamento → parcelas → lançamentos financeiros,
   com vínculo bilateral via FK/coluna estrutural
   (financiamento_parcelas.lancamento_id, .lancamento_juros_id,
   financeiro_lancamentos_v2.financiamento_id). Texto em observacao
   é histórico, não autoridade.
3. PROIBIDO para vincular ou identificar: UUID em texto, lookup por
   observacao, regex em descrição, inferência por nome do credor.
4. Exclusão correta (implementada em
   cancelarLancamentosDoFinanciamento): (a) localizar lançamentos
   via vínculo estrutural; (b) cancelar em cascata com soft delete +
   audit tag; (c) só depois excluir parcelas/financiamento. Se
   houver N candidatos ativos, N devem ser cancelados; qualquer
   falha aborta tudo.
5. Conciliação: lançamento com conta_bancaria_id IS NULL não aparece
   na conciliação por conta nem entra no saldo — pendente até
   classificação manual. É o desenho, não bug.

## Histórico
7 lançamentos órfãos (R$ 4.230.518,17) cancelados em 22/05/2026 com
audit tag [orfao_fin_excluido_2026-05-22] — rollback preservado.
Órfãos ativos do módulo = zero desde então.

## Pendente (backlog, não implementar sem aprovação)
Fase 3 — defesa em banco: trigger BEFORE DELETE em financiamentos OU
FK financiamento_id RESTRICT + RPC fn_excluir_financiamento_seguro.
