# P0-Z0 — SPEC TRAVADA: Semântica de Contraparte (status_contraparte)

> **Documento de fonte de verdade.** Qualquer trabalho de
> contraparte/fornecedor em `lancamentos` daqui em diante segue esta
> spec. Mudanças exigem revisão explícita.
> Migrado do Project Knowledge em Jul/2026, conteúdo íntegro.
> Status de implementação: PR1–PR6 ainda não executados.

## 0. Resumo executivo
Modelo formal de maturidade da contraparte. Substitui a noção
implícita de "lançamento órfão = erro" por estado explícito do
domínio.

**Princípio central:**
> `fornecedor_id IS NULL` NÃO é erro.
> `fornecedor_id IS NULL` + `status_contraparte` ausente É erro de
> modelagem.

**Princípio simétrico:**
> `fornecedor_id IS NOT NULL` + `status_contraparte != 'consolidado'`
> É erro de modelagem.

## 1. Campo
status_contraparte status_contraparte_enum NULL
(NOT NULL apenas após backfill validado)
Coluna nova em `lancamentos` (zoo). Spec análoga para
`financeiro_lancamentos_v2` fica para P0-Z0-Fin separado, fora de
escopo aqui.

## 2. Valores (5 enum)
| Valor | Significado |
|---|---|
| consolidado | Existe fornecedor_id UUID vinculado. Contraparte definitivamente identificada. |
| pendente_conciliacao | Movimento real, contraparte virá em fluxo posterior (foto do caderno sem NF). |
| legado_sem_match | Tem texto histórico em comprador_fornecedor, falta vincular UUID. |
| nao_aplicavel | Não existe contraparte externa por natureza. Cobre transferência interna, morte, nascimento, consumo, reclassificação, ajuste. |
| desconhecido | Sem informação alguma — exige revisão humana. |

## 3. Derivação multi-input (NÃO hardcoded por origem)
status_contraparte deriva da combinação de 5 inputs, não apenas
origem: (1) tipo do lançamento; (2) fornecedor_id (NULL ou não);
(3) comprador_fornecedor (NULL ou não); (4) writer/contexto da
criação; (5) regra explícita do fluxo.

Tabela de derivação:
| tipo | fornecedor_id | comprador_fornecedor | Writer típico | Resultado |
|---|---|---|---|---|
| compra/venda/abate | NOT NULL | qualquer | LancamentosTab | consolidado |
| compra/venda/abate | NULL | qualquer | CadernoImportTab | pendente_conciliacao |
| compra/venda/abate | NULL | NOT NULL | ImportZootHistoricoTab | legado_sem_match |
| compra/venda/abate | NULL | NULL | qualquer | desconhecido |
| transferencia_*/morte/nascimento/consumo/reclassificacao | qualquer | qualquer | qualquer | nao_aplicavel |

Importante: importação pode vir consolidada/parcial/desconhecida —
NÃO assumir legado_sem_match só pelo origem='importacao'.

## 4. Bloqueios — defesa em 3 camadas
Trigger é soberano. UI e hook são conforto/UX.
| Camada | Quando bloqueia | Mecanismo |
|---|---|---|
| UI (toast) | Operador tenta submit compra/venda/abate sem fornecedor | Já existe: "Selecione o fornecedor para continuar" |
| Hook (useLancamentos.adicionarLancamento) | Payload sem fornecedor_id para tipo compra/venda/abate | Guard novo (PR3) |
| Trigger BD (BEFORE INSERT/UPDATE) | Qualquer writer viola coerência | Soberano — não bypassa |

## 5. Regras de coerência do trigger
REJECT SE: status_contraparte='consolidado' AND fornecedor_id IS NULL
REJECT SE: fornecedor_id IS NOT NULL AND status_contraparte!='consolidado'
REJECT SE: tipo IN ('compra','venda','abate') AND status_contraparte='nao_aplicavel'
REJECT SE: tipo IN ('transferencia_saida','transferencia_entrada',
  'morte','consumo','nascimento','reclassificacao')
  AND status_contraparte='consolidado' AND fornecedor_id IS NULL

Simetria: tem UUID → status PRECISA ser consolidado; não tem UUID →
status PRECISA explicar por quê.

## 6. UI por status
| Status | Badge | Ação clicável |
|---|---|---|
| consolidado | (sem badge) | — |
| pendente_conciliacao | âmbar "Vincular contraparte" | FornecedorSelect Z3 |
| legado_sem_match | azul "Vincular: [texto histórico]" | FornecedorSelect com pré-busca |
| nao_aplicavel | (sem badge) | — |
| desconhecido | vermelho "Revisar" | modal de classificação manual |

## 7. Transições válidas
pendente_conciliacao → consolidado (vínculo via badge)
legado_sem_match → consolidado (vínculo via lookup)
desconhecido → consolidado | nao_aplicavel | legado_sem_match
consolidado → terminal (guard bloqueia regressão)
nao_aplicavel → terminal

## 8. Migration em 2 fases (sem DEFAULT)
Princípio: nunca mascarar inconsistência com DEFAULT. NULL temporário
força visibilidade de gaps.
- Fase A (PR1): CREATE TYPE status_contraparte_enum (5 valores) +
  ADD COLUMN NULL sem default + trigger validação (aceita NULL temp).
- Fase B (PR2): backfill CASE — fornecedor_id NOT NULL→consolidado;
  tipos sem contraparte→nao_aplicavel; origem='caderno_ia'→
  pendente_conciliacao; comprador_fornecedor NOT NULL→
  legado_sem_match; ELSE desconhecido.
- Fase C: medição — GROUP BY status; COUNT de NULL deve ser 0.
- Fase D (PR3): writers passam a setar explicitamente
  (useLancamentos, CadernoImportTab, ImportZootHistoricoTab,
  useOfflineSync.syncQueue, triggers de transferência).
- Fase E (PR6): SET NOT NULL só após 0 NULLs por dias consecutivos.

## 9. Comportamento por writer pós-spec
| Writer | Status default no INSERT | Bloqueia? |
|---|---|---|
| useLancamentos (compra/venda/abate) | consolidado | SIM (toast+hook+trigger) |
| useLancamentos (morte/consumo/nasc/reclass) | nao_aplicavel | NÃO |
| CadernoImportTab | pendente_conciliacao | NÃO |
| ImportZootHistoricoTab | legado_sem_match (se texto) / desconhecido | NÃO |
| useOfflineSync.syncQueue | herda do payload; senão desconhecido | NÃO |
| auto_create_transferencia_entrada (trigger) | nao_aplicavel | NÃO |
| sync_transferencia_update (trigger) | (não muda status) | — |
| useBoitelOperacoes (UPDATE) | (não toca status) | — |

## 10. Edge cases registrados
- Boitel = venda, tem contraparte → consolidado (coberto pelo Z5a).
- Transportador em transferência não é fornecedor da carga →
  transferência permanece nao_aplicavel.
- Reclassificação de tipo (ex: transferencia_saida→compra): trigger
  recalcula; provavelmente cai em desconhecido exigindo revisão.
- Ajuste administrativo: confirmar se existe tipo='ajuste' no enum;
  se sim, default nao_aplicavel.
- financeiro_lancamentos_v2: FORA de escopo (P0-Z0-Fin futuro).
- Z-Backfill (5.402 órfãos pré-Z5a): contemplado na Fase B.

## 11. Sequência de implementação
PR1 migration Fase A → PR2 backfill+medição → PR3 writers →
PR4 badges UI → PR5 UX reconciliação → PR6 selar NOT NULL.
PRs sequenciais, cada um valida antes do próximo. Sem big-bang.

## 12. Princípio de design vigente
Ausência de fornecedor deixa de ser ambiguidade e passa a ser estado
explícito do domínio. Qualquer regra futura deve preservar isto.
