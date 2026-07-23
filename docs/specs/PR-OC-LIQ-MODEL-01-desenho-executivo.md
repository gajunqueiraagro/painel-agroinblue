# PR-OC-LIQ-MODEL-01 — Desenho executivo (liquidação financeira da OC)

> Escopo: modelo de **obrigação financeira** da Operação Comercial + tratamento de
> liquidação. Sem React, sem NPR/antecipação, sem tocar conciliação/extrato/hooks.
> Reusa contratos vigentes; único ponto de expansão é o escopo por `origem` nas
> engines de negociação (justificado por E3 + OC2-SALDO).

## Princípio soberano do desenho
A obrigação **NÃO** é entidade nova: é `zoo_operacao_partes` (já é parcela/vencimento,
já tem o vínculo único a FINV2 exigido por **E3**). O que faltava é (a) distinguir a
origem da parte (negociação vs documento/manual), (b) um contrato **explícito e
idempotente** de geração de obrigações a partir do documento, (c) cancelamento lógico
da obrigação, (d) leitura de saldo separando liquidação monetária de não-monetária.

## 1. Schema exato das entidades

### 1.1 `zoo_operacao_partes` (a OBRIGAÇÃO — estendida, não recriada)
Colunas **novas** (ADD COLUMN, todas nullable/DEFAULT seguro; tabela vazia):
- `origem text NOT NULL DEFAULT 'negociacao'` — CHECK IN (`negociacao`,`documento`,`manual`).
- `documento_id uuid NULL` — FK composto tenant-safe → `zoo_operacao_documentos(id,operacao_id,cliente_id)` (origem documental opcional).
- `documento_componente_id uuid NULL` — referência fina ao componente documental (validada em RPC; sem FK rígida).
- `favorecido_id uuid NULL` — override do favorecido/contraparte por obrigação (validado em RPC; fallback = `contraparte_id` da operação).
- `sem_movimentacao_caixa boolean NOT NULL DEFAULT false` — retenção sem caixa = `true` ⇒ **nunca** materializa título bancário.
- `chave_idempotencia text NULL` — chave natural da geração (idempotência); UNIQUE parcial `(operacao_id, chave_idempotencia) WHERE chave_idempotencia IS NOT NULL`.
- `cancelada boolean NOT NULL DEFAULT false`, `cancelada_em timestamptz`, `cancelada_por uuid`, `cancelada_motivo text` — cancelamento lógico (append-only).

Índices redefinidos (tabela vazia → sem risco):
- DROP `zoo_operacao_partes_identidade_uniq`.
- CREATE UNIQUE `...identidade_negociacao` ON `(operacao_id,natureza,componente,sequencia_parcela) WHERE origem='negociacao'`.
- CREATE UNIQUE `...idempotencia_obrigacao` ON `(operacao_id,chave_idempotencia) WHERE chave_idempotencia IS NOT NULL`.

`natureza` permanece `{principal,deducao,acrescimo}` (inalterado). `componente` continua
validado contra `zoo_componentes_financeiros`.

### 1.2 `zoo_operacao_liquidacoes` (inalterada, exceto domínio de forma)
- `forma` CHECK += `compensacao` (liquidação não monetária por compensação/abatimento,
  simétrica à permuta — reduz saldo sem caixa).

### 1.3 `financeiro_lancamentos_v2` — **schema intocado**
Apenas INSERT de títulos (espelho verbatim de `oc_sincronizar`). Nenhum ALTER.

## 2. Motivo de cada entidade
- **`partes` = obrigação/parcela**: E3 exige vínculo único operação↔FINV2 em
  `partes.financeiro_lancamento_id`; criar `zoo_operacao_obrigacoes` violaria E3 e
  duplicaria parcela. Preferência do arquiteto (uma obrigação = uma parcela; sem tabela
  de parcelas separada) coincide.
- **`origem`**: separa o que a negociação possui/reescreve (REPLACE) do que a geração
  documental/manual cria (aditivo, idempotente), sem colisão de ciclo de vida.
- **`sem_movimentacao_caixa`**: distingue retenção (nunca título) de despesa com
  desembolso (título próprio quando explícito).
- **`chave_idempotencia`**: garante idempotência exigida pela decisão A.
- **`compensacao`**: fecha o tratamento de liquidação não monetária além de permuta.

## 3. Estados derivados (nunca persistidos)
- **Obrigação (título)**: `nao_liquidado | parcial | quitado | excedente_divergente`
  via `_oc_estado_liquidacao(valor_titulo, Σ liquidações válidas)` (tolerância R$0,01).
- **Operação**: `nao_liquidada | parcial | quitada | excedente | base_indefinida`
  via `_oc_base_saldo_operacao` + `_oc_estado_liquidacao` (regra canônica OC2-SALDO).
- **Obrigação sem título** (retenção sem caixa): estado informativo `sem_caixa`
  (derivado: `sem_movimentacao_caixa=true` e sem `financeiro_lancamento_id`).
- **Cancelada**: `cancelada=true` ⇒ fora do saldo ativo (derivado).

## 4. Fórmulas
Para uma obrigação com título FINV2 `f` e liquidações `L` (estornado=false):
- **Valor nominal** = `f.valor` (título) / no nível operação = `base` de `_oc_base_saldo_operacao`.
- **Liquidado monetariamente** = `Σ L.valor WHERE forma NOT IN ('permuta','compensacao')`.
- **Liquidado não monetariamente** = `Σ L.valor WHERE forma IN ('permuta','compensacao')`.
- **Saldo aberto** = `valor_nominal − (monetário + não_monetário)`; classificado por
  `_oc_estado_liquidacao(valor_nominal, monetário + não_monetário)`.
- Retenção sem caixa **não** entra como liquidação: reduz o **líquido** da obrigação por
  ser uma parte deducao `sem_movimentacao_caixa` (informativa no view), nunca um pagamento.

## 5. Contrato de geração manual das obrigações
`oc_gerar_obrigacoes(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada int, p_payload jsonb)`
- Guarda: tenant + pertencimento; operação `status_comercial='fechada'`, `rascunho=false`,
  não `cancelada`; lock otimista por `versao`.
- `p_payload.obrigacoes[]`, cada item:
  `{ natureza_fluxo: 'pagar'|'receber', componente: <catálogo>, natureza: 'principal'|'deducao'|'acrescimo',
     valor, data_vencimento, sequencia_parcela?, quantidade_parcelas?, descricao?,
     favorecido_id?, documento_id?, documento_componente_id?, incluso_no_total?(false),
     sem_movimentacao_caixa?(false), materializar?(true), chave_idempotencia? }`.
- Regras:
  - `natureza_fluxo` deve ser coerente com `tipo_operacao` (compra⇒pagar; venda/abate⇒receber).
  - `componente` validado contra `zoo_componentes_financeiros` (natureza,codigo,ativo).
  - `sem_movimentacao_caixa=true` (retenção) ⇒ força `materializar=false` (nunca título).
  - despesa com desembolso ⇒ `materializar=true` só se explícito no payload.
  - **Idempotência**: se já existe parte `(operacao_id, chave_idempotencia)` ⇒ retorna a
    existente sem criar duplicata (chave default = `'doc_comp:'||documento_componente_id`
    quando ausente e houver componente documental).
  - Cria parte `origem='documento'` (se houver `documento_id`) senão `'manual'`,
    `incluso_no_total=false` (não corrompe `valor_total` soberano).
  - Se `materializar` ⇒ INSERT título FINV2 (espelho verbatim de `oc_sincronizar`):
    `status_transacao='programado'`, `origem_lancamento='operacao_comercial'`,
    `origem_tipo='oc:obrigacao:'||natureza||':'||componente`, `sinal` derivado de
    `natureza_fluxo`, `favorecido_id`=override ou `contraparte_id`, `sem_movimentacao_caixa`
    espelhado; grava `partes.financeiro_lancamento_id`.
  - Evento em `zoo_operacao_eventos` (`gerar_obrigacao`). **Não** cria automação por cliente.

`oc_cancelar_obrigacao(p_parte_id uuid, p_cliente_id uuid, p_motivo text)`
- Append-only: exige motivo; cancela o título FINV2 (`cancelado=true`) **apenas** se não
  protegido (`status_transacao` ∉ `realizado|agendado`, `conciliado_em IS NULL`); marca a
  parte `cancelada=true` (+em/por/motivo). Preserva liquidações e histórico. Evento registrado.

## 6. Estratégia idempotente de integração com FINV2
- Vínculo **único** via `partes.financeiro_lancamento_id` (E3). Nenhuma referência reversa
  redundante no FINV2.
- **Idempotência dupla**: `chave_idempotencia` (parte) impede duplicar a obrigação; a geração
  de título é feita uma vez por obrigação, e re-chamada com a mesma chave é no-op.
- **Materialização por negociação permanece em `oc_sincronizar`** (escopo `origem='negociacao'`);
  **materialização de obrigação documental/manual é feita por `oc_gerar_obrigacoes`** — os dois
  caminhos são disjuntos por `origem`, evitando dupla geração.
- Nunca gera `status_transacao='conciliado'` (usa `programado`); conciliação é representada
  por vínculos bancários, fora desta frente.
- Caso E (um movimento cobrindo vários títulos): mantém o padrão vigente — N obrigações →
  N títulos → N vínculos bancários (a RPC soberana de conciliação impõe 1 lançamento ↔ 1
  extrato vivo). Não alterado aqui.

## 7. Tratamento de retenção, despesa, permuta e compensação
- **Retenção sem caixa**: parte deducao `sem_movimentacao_caixa=true`, `materializar=false`
  ⇒ nunca título bancário; reduz o líquido informativo da obrigação.
- **Despesa com desembolso**: parte (principal ou deducao) `sem_movimentacao_caixa=false`,
  `materializar=true` só quando explícito ⇒ título próprio.
- **Permuta**: já suportada — liquidação `forma='permuta'` (valor atribuído, sem caixa),
  contabilizada como não-monetária.
- **Compensação**: liquidação `forma='compensacao'` (novo), simétrica à permuta,
  não-monetária, reduz saldo sem caixa.

## 8. RPCs e views
- **Novas RPCs**: `oc_gerar_obrigacoes`, `oc_cancelar_obrigacao` (SECDEF, EXECUTE só authenticated).
- **RPCs alteradas (cirúrgico, escopo `origem='negociacao'`)**: `_oc_aplicar_partes`
  (DELETE + rollup `valor_total`), `oc_sincronizar` (hash, proteção, cancelamento,
  reset de vínculo, loop de materialização).
- **Views**:
  - `vw_oc_titulos_liquidacao` (redefinida): + `total_liquidado_monetario`,
    `total_liquidado_nao_monetario`.
  - `vw_oc_operacao_liquidacao` (redefinida): + mesma separação.
  - `vw_oc_obrigacoes` (nova): camada de obrigação (origem, documento, valor nominal,
    liquidado mon/não-mon, saldo, estado, `sem_movimentacao_caixa`, `cancelada`).

## 9. Testes (BEGIN/ROLLBACK; casos A–N aplicáveis)
1. Geração idempotente (mesma `chave_idempotencia` ⇒ 1 obrigação, 1 título).
2. Retenção sem caixa ⇒ parte criada, **sem** título FINV2 (I).
3. Despesa com desembolso explícita ⇒ título próprio (J).
4. Permuta e compensação ⇒ liquidação não-monetária, saldo reduzido, sem caixa (L, K).
5. Título liquidado por várias liquidações ⇒ estado parcial→quitado (D, F).
6. Escopo: edição de negociação (`_oc_aplicar_partes`) **não apaga** obrigações
   documentais/manuais; `valor_total` reflete só negociação.
7. `oc_sincronizar` materializa só `origem='negociacao'`; não duplica obrigações.
8. Cancelamento de obrigação: título não-protegido cancelado, protegido preservado;
   liquidações e histórico intactos (N).
9. Fórmulas mon/não-mon e saldo aberto conferem no nível título e operação (§4, item 11).
10. Tenant isolation nas novas RPCs/views.

## 10. Arquivos (histórico versionado = histórico aplicado no Proto)
- `supabase/migrations/20260722233029_pr_oc_liq_model_01_obrigacoes.sql` — base (schema + RPCs +
  views + grants). Versão/nome idênticos ao registrado no Proto. Contém a FK documental **na forma
  originalmente aplicada** (`ON DELETE SET NULL` sobre a FK composta), preservada sem squash.
- `supabase/migrations/20260723084837_pr_oc_liq_model_01_fk_documento_setnull_documento_id.sql` —
  **corretiva da FK documental** (só a correção). Versão/nome idênticos ao registrado no Proto.
- `docs/specs/PR-OC-LIQ-MODEL-01-desenho-executivo.md` (este documento).
- Testes BEGIN/ROLLBACK: `docs/runbooks/pr_oc_liq_model_01_testes.sql`.
- **Nenhum arquivo React/TS** nesta frente.

### 10.1 Homologação runtime — defeito da FK documental e correção
- **Defeito detectado** na homologação estrutural (item D): a base criou
  `zoo_operacao_partes_documento_fk` com `ON DELETE SET NULL` sobre a FK **composta**
  `(documento_id, operacao_id, cliente_id)`. Como `operacao_id`/`cliente_id` são NOT NULL, o
  `SET NULL` tentaria anulá-las ao deletar um documento referenciado ⇒ violação NOT NULL
  (falha estrutural).
- **Razão da corretiva**: alinhar o comportamento ao contrato pretendido sem falsificar o
  histórico já aplicado no Proto — por isso a base permanece com a FK original e a correção
  entra numa migration própria (`20260723084837`), **sem squash**.
- **Estado final da FK**: `ON DELETE SET NULL (documento_id)` (PG15+) — anula **somente**
  `documento_id` (nullable); `operacao_id`/`cliente_id` preservados; FK composta tenant-safe
  mantida. Verificado em runtime (`confdelsetcols={documento_id}`).

## 11. Riscos reais
- **Alteração das engines de negociação** (`_oc_aplicar_partes`, `oc_sincronizar`): escopo
  `origem='negociacao'`. Mitigado por tabela vazia + testes de não-regressão; exige
  homologação runtime.
- **Churn de re-sync** (risco pré-existente): `oc_sincronizar` cancela+recria títulos de
  negociação; obrigações documentais/manuais **não** são varridas (disjunção por origem),
  então este PR **reduz** a superfície do risco, mas o churn dos títulos de negociação com
  liquidação vinculada permanece — registrado como dívida (frente de resiliência do re-sync).
- **`status_transacao` sem CHECK**: geração usa `programado` por convenção.
- **Governança FINV2**: colunas out-of-band (ex.: `financiamento_id`) não são tocadas; a
  migration não faz ALTER em `financeiro_lancamentos_v2`.
- **`favorecido_id`/`documento_componente_id` sem FK rígida**: pertencimento validado em RPC
  (evita presumir uniques inexistentes) — risco de integridade coberto pela guarda.

## ENCAIXE ARQUITETURAL (Constituição nº 1, Título IV)
1. **Cria/altera fonte/contrato?** Estende `zoo_operacao_partes` (obrigação); domínio
   `forma` de `zoo_operacao_liquidacoes`; novas RPCs `oc_gerar_obrigacoes`/`oc_cancelar_obrigacao`;
   escopa `_oc_aplicar_partes`/`oc_sincronizar`; redefine 2 views de saldo + 1 nova. Sem React, sem FINV2 schema.
2. **Reusa ou inventa paralelo?** Reusa `partes` (E3), `oc_sincronizar`, `_oc_estado_liquidacao`/
   `_oc_base_saldo_operacao`, catálogo de componentes. Nada duplicado.
3. **Fonte soberana?** Obrigação = `partes`; título = FINV2 (vínculo único E3); saldo **derivado**
   (nunca persistido); `valor_total` soberano permanece só da negociação.
4. **Tenant/RLS/segurança?** RPCs SECDEF com guarda tenant+pertencimento; FK composto
   `documento_id`; RLS herdada em `partes`; views `security_invoker=true`; EXECUTE só authenticated.
5. **Separação de eixos?** Obrigação/liquidação é eixo financeiro; não toca negociação além do
   escopo por origem, nem recebimento, documento (só referência), conciliação/extrato.
6. **Reversibilidade/auditoria?** Cancelamento lógico da obrigação + estorno append-only da
   liquidação + eventos em `zoo_operacao_eventos`; nada destrutivo.

## Art. 19 (Constituição nº 2 — Inteligência Gerencial)
Superfície analítica futura (aba Liquidação) lê `vw_oc_obrigacoes`/`vw_oc_*_liquidacao`.
- **Art. 22**: saldo e estados **derivados e reconstruíveis**; liquidado monetário vs
  não-monetário explícitos (permuta/compensação nunca aparentam caixa); retenção sem caixa
  distinguível de despesa; `cancelada`/`estornado` visíveis; sentinelas: `—` = ausente,
  zero = valor real, saldo conciliado nunca aparenta ausência. Tenant-safe.
