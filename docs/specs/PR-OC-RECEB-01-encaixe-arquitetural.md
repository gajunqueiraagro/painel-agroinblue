# PR-OC-RECEB-01 — Recebimento físico por lote (modal `?oc_compra=1`)

## ENCAIXE ARQUITETURAL (Constituição nº 1, Título IV)

1. **Que fonte/contrato/componente cria ou altera?**
   - Schema: `zoo_operacao_movimentacoes.operacao_lote_id NOT NULL` + FK composto `(operacao_lote_id, operacao_id, cliente_id) → zoo_operacao_lotes ON DELETE RESTRICT`; `UNIQUE(id, operacao_id, cliente_id)` em `zoo_operacao_lotes`.
   - RPCs: `oc_salvar_lotes` (rollup `qtd_negociada` + guarda anti re-negociação), `oc_confirmar` (aceita multilote), `oc_registrar_movimentacao` (nova assinatura +`p_lote_id`), `oc_receber_lotes` (batch, novo), `oc_estornar_movimentacao` (novo), view `vw_oc_lotes_recebimento` (novo).
   - Frontend: aba Recebimento (`AbaRecebimentoLotes`), hook `useOperacaoRecebimento`, wiring em `CompraModalShell`/`LancamentosTab`.

2. **Reusa o contrato vigente ou inventa paralelo?** Reusa. Movimentação = `lancamentos` (razão zootécnica única, `cenario='realizado'`, `status_operacional='realizado'`, sem pasto). Vínculo por `zoo_operacao_movimentacoes` (já existente). Nenhuma tabela/razão paralela.

3. **Qual a fonte soberana do dado?** Negociação = `zoo_operacao_lotes` (via `oc_salvar_lotes`). Recebido = `lancamentos` (via `oc_registrar_movimentacao`/`oc_receber_lotes`). Estados (recebida/diferença) = **derivados em leitura** (`vw_oc_lotes_recebimento`), nunca coluna editável.

4. **Como preserva tenant/RLS/segurança?** RPCs SECDEF com guarda de tenant (`is_admin_agroinblue`/`get_user_cliente_ids`) + pertencimento; view `security_invoker=true`; grants só `authenticated`; FK composto carrega `cliente_id` (tenant-safe).

5. **Como separa os três eixos?** Comercial (`oc_confirmar` → `status_comercial`), Físico (`oc_registrar_movimentacao`/`oc_encerrar_entrega` → `entrega_encerrada`), Financeiro (`status_financeiro`, **não tocado**). "Concluir negociação" é só comercial; recebimento é só físico; rebanho é consequência do `lancamentos` realizado.

6. **Reversibilidade / auditoria?** Estorno append-only (`lancamentos.cancelado=true`, mantém lançamento + vínculo); todos os passos gravam `zoo_operacao_eventos`. Estorno vedado após `entrega_encerrada`.

## Art. 19 (Constituição nº 2 — Inteligência Gerencial)

Superfície: painel de recebimento por lote (negociado × recebido × diferença) — análise operacional.
- **Art. 22 — artigos atendidos:** dado derivado e reconstruível (nunca cache soberano); sentinela de dado (`—` só quando ausente; `0` recebido é valor real, não ausência); divergência explícita por lote (negociado − recebido) sem mascarar; nenhuma projeção/estimativa apresentada como fato; toda leitura tenant-safe.
- **Evidência cruzada (Título IV §3/§6):** a fonte da diferença é `vw_oc_lotes_recebimento` (Σ `lancamentos` válidos por lote), a mesma razão do eixo Animais de `oc_derivar_status` — coerência garantida por construção.

## Riscos residuais registrados
- Re-negociar lotes após qualquer recebimento fica **bloqueado** (guarda + FK RESTRICT); estorno é append-only e mantém o vínculo, logo não "libera" a re-negociação. Correção de lote recebido exige nova frente (fora do escopo).
- `oc_estornar_movimentacao` não recompõe rebanho além de `cancelado=true` (o motor zootécnico já ignora `cancelado`).
