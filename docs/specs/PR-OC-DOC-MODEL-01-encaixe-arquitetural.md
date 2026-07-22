# PR-OC-DOC-MODEL-01 — Modelo documental da Operação Comercial

## ENCAIXE ARQUITETURAL (Constituição nº 1, Título IV)

1. **Fonte/contrato/componente que cria ou altera?**
   - Schema: estende `zoo_operacao_documentos` (o documento); cria `zoo_operacao_documento_componentes` (fatos econômicos) e `zoo_operacao_documento_lotes` (N:N doc↔lote).
   - RPCs: `oc_documento_registrar`, `oc_documento_editar`, `oc_documento_cancelar` (+ helper interno `_oc_documento_aplicar`). View `vw_oc_documentos`.
   - **Sem React, sem FINV2, sem liquidação, sem contas a pagar/receber, sem upload/bucket.**

2. **Reusa contrato vigente ou inventa paralelo?** Reusa `zoo_operacao_documentos` (vazia) como entidade documental; reusa o `UNIQUE(id,operacao_id,cliente_id)` de `zoo_operacao_lotes` (RECEB-01) para o FK de lote. Nenhuma entidade principal duplicada.

3. **Fonte soberana do dado?** Documento = `zoo_operacao_documentos`; fatos econômicos = componentes (tipo×natureza×valor). **`valor_liquido` é DERIVADO em `vw_oc_documentos`, nunca persistido.** Nenhum resultado financeiro consolidado na tabela principal.

4. **Tenant/RLS/segurança?** RPCs SECDEF com guarda de tenant + pertencimento; FKs compostos `(…, operacao_id, cliente_id)` impedem vínculo cross-tenant/operação; tabelas filhas com RLS + SELECT a `authenticated` (escrita só via RPC); view `security_invoker=true`.

5. **Separação de eixos?** Puramente documental. **Não** toca negociação (`partes`/`lotes`), recebimento (`movimentacoes`), financeiro (FINV2/liquidação) nem status comercial. Cancelamento é **lógico** (sem DELETE), preserva componentes e vínculos.

6. **Reversibilidade/auditoria?** `versao` + `updated_at/by`; cancelamento com `cancelado_em/por/motivo`; eventos em `zoo_operacao_eventos` (registrar/editar/cancelar). Edição faz substituição atômica de componentes/lotes com lock por versão.

## Art. 19 (Constituição nº 2 — Inteligência Gerencial)
Superfície analítica futura (aba Documentos): a leitura consolidada é `vw_oc_documentos`.
- **Art. 22:** `valor_liquido` derivado e reconstruível (nunca cache soberano); subtotais por natureza explícitos (acréscimo/desconto_comercial/retenção_sem_caixa/despesa_desembolso), sem mascarar; `informativo` não altera o total; `situacao (ativo|cancelado)` distinguível; tenant-safe.
- **Complementar** é fato aditivo (novo documento apontando a origem), nunca sobrescreve — preserva a verdade histórica.

## Riscos residuais registrados
- Semântica de retenção/desconto/despesa é convenção de `natureza` + catálogo textual `tipo` (extensível; sem coluna por tributo).
- Upload de arquivo (`url`) fora do escopo (bucket privado/signed URL = frente própria); `url` opcional.
- Múltiplos anexos por documento fora do escopo (1 `url` opcional por documento).
