# ADR-2026-17 — ARQUITETURA OPERACIONAL DAS OPERAÇÕES COMERCIAIS V2

## 1. Cabeçalho

Código: ADR-2026-17 · Título: Arquitetura Operacional das Operações Comerciais V2 · Status: ACEITO (22/07/2026) · Data: 22/07/2026 · Responsáveis: Gabriel Junqueira (decisor), Claude Chat (Arquiteto — consolidação), Claude Code (Executor — implementações futuras) · Escopo: consolidação da arquitetura vigente das Operações Comerciais no Proto e especificação dos deltas controlados (documentos, componentes, títulos, liquidação avançada, resultado, UI). Este ADR referencia e complementa o ADR-2026-16, utilizado como baseline arquitetural da v1, sem alterá-lo — cujo próprio artefato registra "Status: ACEITO (20/07/2026)" e origem "aprovada por Gabriel Junqueira em 20/07/2026 (documento PR-OC-UX-MODAL-02 — Relatório Final)" [evidência documental verificada no repositório, HEAD fc2d1cf7].

Consolida as correções pós-OC2-GATE0, decorrentes da inspeção de 22/07/2026, e as quatro correções da revisão final aprovada por Gabriel Junqueira.

## 2. Contexto

O AGROinBLUE precisa transformar negociações de gado (compra, venda, abate, permuta) em visão zootécnica, comercial, financeira, patrimonial, fiscal e gerencial, com rastreabilidade total. O problema central de modelagem é a confusão histórica entre seis coisas distintas: negociação, fato físico, documento, obrigação financeira, liquidação e movimento bancário. O modelo simplista 1 operação = 1 lote = 1 NF = 1 título = 1 recebimento não representa a realidade — o caso de referência oficial (operação Minerva, NF 6713, 101 animais, múltiplos lotes/ordens de compra) o demonstra — e produz: valores fiscais tratados como caixa, retenções viradas em saídas fictícias, duplicidade entre programado/OC/realizado e resultado gerencial não rastreável. Riscos do modelo simplificado: perda de auditabilidade, conciliação impossível de fechar, dupla contagem patrimonial e decisões sobre números não explicáveis.

## 3. Evidência do estado atual (OC2-GATE0, 22/07/2026)

Inspeção 100% só-leitura no Proto binbcdfbisgscrifztia (produção não acessada) comprovou: 8/8 tabelas (zoo_operacoes_comerciais, zoo_operacao_lotes, zoo_operacao_movimentacoes, zoo_operacao_partes, zoo_operacao_documentos, zoo_operacao_eventos, zoo_operacao_liquidacoes, zoo_componentes_financeiros) · 2/2 views de saldo com security_invoker=true · 30/30 colunas críticas (todas as camadas: base → responsável → negociação/estado → numero_documento → abate estruturado → lotes) · 62 constraints (FKs compostas de tenant, UNIQUE do catálogo) · 24 índices · 17/17 funções, zero overloads, versões vigentes das redefinições · RLS habilitado nas 8 tabelas com policies presentes e coerentes; anon/PUBLIC sem acesso; escrita direta restrita (lotes/catálogo/views só SELECT; escrita de domínio nas RPCs SECDEF) · nenhum trigger de domínio inesperado · uso real mínimo: 6 operações (todas programada/rascunho), 8 lotes, 13 eventos; movimentações/partes/liquidações/documentos = 0 · integridade: zero ocorrências em todos os cruzamentos (títulos órfãos, movimentações órfãs, lotes órfãos, divergência de tenant) · catálogo com 15 componentes (12 ativos) · classificação consolidada: 13/13 APPLIED (OC-01, OC-01B, OC-02, OC-04A, MODEL-01 partes 1/2/2B/3/4, MODEL-02A, CATALOGO-01, CATALOGO-01A, MODEL-02B, LIQ-02, LIQ-02A, COM-1, COM-2) · UNKNOWN restrito ao registro nominal do histórico de migrations (timestamps de aplicação em vez de nomes de arquivo) — sem efeito sobre a comprovação estrutural · hashes md5 das 17 funções registrados como baseline de drift.

## 4. Decisão arquitetural principal

A arquitetura-base das Operações Comerciais está implementada e integralmente vigente no Proto. As lacunas restantes concentram-se em enriquecimentos funcionais e gerenciais, e não na fundação estrutural. Decide-se: consolidar e completar a arquitetura existente por deltas controlados; não refazer; não criar arquitetura paralela. Toda implementação futura reutiliza as 8 tabelas, as 17 funções (quando corretas), o catálogo, os eventos, as views, o FINV2 e a conciliação; tabelas novas apenas para lacunas que comprovadamente não cabem no modelo vigente.

## 5. Princípios invariantes

P1. Operação ≠ lote ≠ documento ≠ título ≠ liquidação ≠ movimento bancário — seis conceitos, seis camadas, jamais colapsados.

P2. Eixos de estado independentes; nenhum status único representa tudo.

P3. Meta/planejamento não gera fato oficial; operação programada é intenção comercial, nunca movimentação.

P4. Somente movimentação zootécnica validada altera o rebanho.

P5. O Financeiro V2 é soberano do caixa, do extrato e da conciliação; nunca haverá segundo contas a pagar/receber, segundo extrato ou movimento bancário fictício.

P6. Snapshot comercial histórico: alteração posterior de cadastro não reescreve o negociado.

P7. Correções são append-only quando existem fatos posteriores (eventos, documentos complementares, estornos que preservam o fato).

P8. Escrita de domínio é transacional (RPC), auditável (eventos com dados anteriores) e com tenant/integridade preservados (FKs compostas, comprovadas com zero violação).

P9. Documento fiscal é soberano dos seus próprios atributos fiscais; não é soberano de caixa nem de fato físico.

P10. O backend é a única autoridade de valores persistidos; preview de UI é descartável (herdado do ADR-2026-16 §2.3).

## 6. Modelo conceitual consolidado

Operação (cabeça soberana da negociação: tipo, contraparte, condições, precificação, versão otimista, eixos) → Lotes (subconjuntos negociados com identidade própria) → Movimentações (fatos físicos em lancamentos, vinculados, jamais contidos) → Partes econômicas (parcelas negociadas, ponte com títulos) → Catálogo de componentes (slugs nomeados com natureza) e componentes instanciados (delta: valor, base, incidência, efeitos) → Documentos (evidências estruturadas: NF-e, romaneio, promissória; sugerido→confirmado; itens no modelo-alvo) → Títulos (lançamentos FINV2 com papel comercial) → Liquidações (baixa de obrigação por dinheiro, permuta, componentes sem caixa) → Movimentos bancários (extrato soberano) ↔ Conciliação (N:N vigente) → Eventos (trilha append-only) → Resultado gerencial (derivação por operação e lote).

## 7. Cardinalidades oficiais

Contrato atual (vigente e comprovado): operação 1:N lotes · operação 1:N movimentações; movimentação vinculada a no máximo uma operação · operação 1:N partes; parte 0..1 título · operação 1:N liquidações; liquidação vinculada a um título quando aplicável (financeiro_lancamento_id opcional) · título 1:N liquidações · título N:N movimentos bancários via conciliação · operação 1:N documentos (anexos).

Modelo-alvo (delta ainda não implementado): documento 1:N itens estruturados; documento N:N operações (ponte com papel); componente com incidência opcional em operação, lote, documento ou rateio proporcional; operação N:N títulos por ponte com papel e valor atribuído — estrutura AUSENTE no Proto; no contrato atual, o vínculo operação↔título ocorre indiretamente por partes e liquidações. Esta cardinalidade-alvo não está aprovada como implementação nem disponível: depende do PR próprio e das decisões pendentes.

Decisões pendentes de cardinalidade: lote↔movimentação no futuro (rateio M:N) — §23.

## 8. Eixos de estado

Persistidos: estado comercial (programada | fechada | cancelada), flag técnica de rascunho, estado de sincronização financeira e marcadores factuais que não possam ser reconstruídos com segurança, como o encerramento explícito da entrega e o estorno de liquidação.

Derivados: estado físico, documental, de liquidação, de conciliação e demais leituras reconstruíveis a partir dos fatos soberanos (físico: sem movimentação · parcial · concluída · concluída com diferença; documental: novo eixo do delta; obrigação/financeiro consolidado da sincronização: não aplicável · pendente · sincronizado · divergente · erro; liquidação: não liquidada · parcial · quitada · excedente/divergente, estornos fora do saldo; conciliação: fato bancário). Verdades deriváveis não são duplicadas em colunas de estado; marcadores persistidos limitam-se ao que é fato declarado, não derivação.

## 9. Fontes de verdade

| Dado | Soberano |
|---|---|
| Negociação (qtd/categoria negociadas, preço, condições, unidade) | operação/lote |
| Fato físico (qtd movida, data física, origem/destino) | movimentação zootécnica |
| Atributos fiscais (qtd faturada, valor fiscal, tributos destacados, datas fiscais, chave) | NF/XML confirmado |
| Pesos/rendimento/classificação do lote | romaneio confirmado → snapshot do lote; na ausência, edição manual com fonte declarada |
| Parte econômica (parcela negociada) | operação |
| Nominal e vencimento | título (FINV2) |
| Baixa e seus componentes | liquidação |
| Caixa | extrato bancário |
| Vínculo banco↔obrigação | conciliação |
| Saldo e resultado | derivados (regra canônica única — §23) |

NF/XML é soberana para atributos fiscais; não é soberana para caixa nem para movimento físico.

## 10. Datas e competências

Semânticas distintas, sem reuso: data da negociação · data do embarque · data do recebimento físico · data do abate · data fiscal (emissão) · competência (resultado gerencial; regra por tipo de operação) · vencimento (título) · data da liquidação (baixa) · data do movimento bancário (caixa/livro-caixa) · data da conciliação. Cada relatório declara qual data consome.

## 11. Caso Minerva (referência oficial de arquitetura)

Fatos oficiais: NF Minerva 6713 · 101 animais · uma operação contendo múltiplos lotes/ordens de compra; cada lote podendo ter categoria, quantidade, pesos, preço, bônus, descontos, tributos/retenções, classificação, romaneio e resultado líquido próprios; a operação consolida os lotes em documentos, obrigações e liquidações.

Representação estrutural: 1 operação · N lotes · 1..N documentos (romaneios por lote; NF consolidando lotes via itens) · N partes econômicas · N títulos · 1..N liquidações (com 0..N componentes sem caixa) · 0..N movimentos bancários · conciliação N:N · resultado por lote e consolidado. O cenário de um único crédito bancário é caso particular possível, jamais regra estrutural.

Campos ilustrativos: qualquer decomposição numérica de lotes usada em exemplos (categorias, rendimentos, preços por lote) é ILUSTRATIVA até extração dos documentos reais do caso — a extração oficial antecede o PR de lote enriquecido.

## 12. Integração com o Zootécnico

Movimentação oficial vive em lancamentos sob o contrato vigente (Meta = plano; Realizado = fato; guard P1 v4 protege o fato oficial). A operação referencia movimentações; entradas/saídas/abates parciais = múltiplas movimentações vinculadas com encerramento de entrega (capacidade estrutural vigente); divergências negociado × carregado × recebido × faturado são exibidas por comparação de fontes, nunca sobrescritas; snapshot comercial imutável; anti-duplicação por vínculo único ativo por movimentação; lote comercial não é necessariamente igual a movimentação física (um lote pode se realizar em várias movimentações; o rateio formal lote↔movimentação é decisão pendente — §23). Quando a futura frente de aprovação zootécnica existir, fato nascido de OC entra pendente com vínculo à operação (planejado, não implementado).

## 13. Integração com o Financeiro V2

Reutilização soberana de financeiro_lancamentos_v2: títulos são lançamentos FINV2 com papel comercial (parcela, vencimento, vínculo à operação); liquidações comerciais referenciam o título; caixa e conciliação permanecem exclusivamente no FINV2/extrato. Proibições estruturais: movimento bancário fictício; segundo contas a pagar/receber; duplo writer (a sincronização operação→financeiro tem via única — a RPC de sincronização vigente com hash de proteção; qualquer writer legado comprovadamente substituído será revogado em PR próprio — §27 OC2-CONSOL); duplicação de título (dedup por vínculo e por hash). Capacidade de sincronização: estruturalmente presente; comportamento não homologado em runtime — homologação funcional é gate do PR correspondente.

## 14. Documentos

Modelo-alvo: NF-e/XML (chave, número/série, emitente, datas, itens, valores, tributos, referências), PDF, romaneio, promissória, contrato, comprovante, documento complementar. Fluxo: importar → extração campo a campo com origem e confiança → valor sugerido → confirmação humana oficializa → snapshot. Deduplicação: chave de acesso (NF-e) e hash de arquivo; reprocesso idempotente. Imutabilidade após validação; NF cancelada por status documental + eventos; carta de correção e NF complementar como documentos vinculados, preservando o original. A estrutura documental mínima vigente (zoo_operacao_documentos) será preservada e evoluída ou complementada, conforme auditoria do OC2-DOC. Substituição somente ocorrerá se a evolução compatível não atender ao contrato-alvo.

## 15. Componentes econômicos

Separação obrigatória de quatro perguntas por componente: (a) natureza/categoria (o que é); (b) efeito no total (reduz/aumenta qual valor: fiscal, comercial, nominal); (c) existência de obrigação financeira própria; (d) efeito em caixa. Incidência opcional: componente global da operação; atribuível a um lote específico; rateável proporcionalmente entre lotes; originado de documento; ou não rateável. Não se força frete, tributo, comissão ou retenção a existir por lote. Componente ≠ título ≠ liquidação: uma retenção pode reduzir o líquido sem gerar movimento bancário e sem constituir segunda saída; gera obrigação própria somente quando existir obrigação jurídica/financeira independente. Um marcador do tipo sem_movimentacao_caixa no FINV2 não resolve sozinho a semântica — a regra é guiada pelo tipo de componente e pela existência de obrigação própria (semântica canônica por slug: decisão pendente — §23).

## 16. Antecipação (promissória/borderô)

Equação preservada: valor nominal = valor líquido recebido + custo financeiro + encargos. Regras: o único movimento bancário de entrada é o líquido efetivamente recebido; custo e encargos não criam movimentos bancários; a baixa do nominal é explicada por componentes de liquidação (modelo recomendado: zoo_operacao_liquidacao_componentes); eventual lançamento contábil/gerencial do custo (despesa financeira) permanece separado do movimento bancário; proibido modelar o custo como segunda liquidação em dinheiro. Promissória = documento vinculado à operação, ao título e à liquidação.

## 17. Permuta

Baixa sem caixa (capacidade vigente: forma permuta com bem, valor atribuído e documento): reduz o saldo comercial sem aumentar disponibilidade; parte em dinheiro = liquidação adicional comum; obrigações recíprocas (quando a contraprestação gera operação espelho) com encontro de contas; reflexo patrimonial do bem recebido em fase de derivação patrimonial; nenhum movimento bancário fictício.

## 18. Adiantamento — decisão pendente

Alternativa A: título e liquidação antecipados vinculados à operação (reusa FINV2; adiantamento = lançamento real pago + consumo por componente de encontro de contas). Alternativa B: entidade específica de adiantamento (saldo próprio explícito; mais um conceito). Recomendação (não decisão): A, por menor duplicação — validação de produto pendente antes de qualquer implementação. Distrato/devolução pertencem ao mesmo PR (§27 OC2-ADIANT).

## 19. Imutabilidade, correção e auditoria

Snapshots comerciais imutáveis; eventos append-only com dados anteriores (vigente); estorno preserva o fato e sai do saldo (vigente); complemento por documento/título complementar; reabertura por RPC com evento (vigente); documento cancelado por status + reversão por eventos; NF complementar vinculada; idempotência por chaves de dedup declaradas por entidade.

## 20. Capacidades já vigentes (comprovadas estruturalmente pelo Gate0)

Operação com rascunho e versão otimista; vocabulário comercial programada|fechada|cancelada; parcelas negociadas; vínculo de movimentações com entregas múltiplas, encerramento e conciliação de peso; liquidações em 7 formas (incluindo permuta) com estorno preservado e parcialidade; vínculo opcional de liquidação a título FINV2; views de saldo por título e por operação; catálogo com 12 slugs ativos; campos estruturados de abate na operação; lotes com salvamento transacional (8 lotes em uso real); auditoria de eventos (13 eventos reais); ACL fechada. Distinção mantida: estrutura comprovada ≠ uso funcional comprovado — sincronização financeira, vínculo de título, estorno, entregas múltiplas e conciliação de peso estão presentes por assinatura e ainda não exercitados em homologação funcional.

## 21. Lacunas comprovadas

Estrutura ausente: documentos estruturados com itens; instâncias de componentes com incidência/efeitos; componentes de liquidação; ponte operação↔título com valor atribuído (§7, modelo-alvo); participantes com papéis; adiantamento (pendente de modelo).

Implementação ausente: enriquecimento do lote para abate (romaneio, carcaça, rendimento, classificação); resultado por operação/lote; fiscal mínimo.

UI ausente: hidratação/edição de operação existente na Central; eixos no cockpit; fluxo único de modal.

Integração não exercitada: sincronização financeira ponta a ponta; conciliação de liquidações com extrato.

Decisão de produto pendente: §23.

## 22. Decisões já consolidadas (com suporte no modelo e no Gate0)

Consolidar sem refazer (§4) · título soberano no FINV2, sem segunda tabela de contas (princípio vigente no vínculo de liquidação + anti-duplicação) · eixos independentes, persistindo apenas estados e marcadores não deriváveis com segurança · Meta ≠ fato · escrita por RPC auditável · casca do modal preservada (ADR-16) · catálogo nomeado por slugs (vigente e seedado) · caso Minerva como referência oficial e teste de regressão do modelo.

## 23. Decisões pendentes (explícitas)

1. Cardinalidade lote↔movimentação futura (rateio M:N formal).
2. Incidência/rateio de componentes (regras por slug; o que é rateável).
3. Decomposição fina da antecipação (slugs e classificação contábil do custo).
4. Modelo de adiantamento (A × B — §18).
5. Semântica canônica de retenções (quais geram obrigação própria; papel de marcador de caixa no FINV2).
6. Oportunidade comercial × reutilizar Meta (planejamento comercial).
7. Fluxo único de UI (convergência definitiva modal/cockpit).
8. Aposentadoria de writer legado (quais RPCs/fluxos revogar e quando).
9. Regra canônica de saldo: apontada em auditoria de implementação inconsistência entre views de saldo, lógica de oc_derivar_status, tolerância monetária e prioridade de base (final/acordada/estimada) — confirmação linha a linha pendente; decisão conceitual deste ADR: uma única regra canônica de saldo, consumida por views, RPCs e UI, com tolerância monetária explícita e centralizada; implementação em PR próprio (OC2-CONSOL).
10. Vocabulário de origem (proveniência padronizada dos registros).
11. Priorização dos deltas remanescentes de segurança/tenant (após comparação com o Gate0).
12. Modelo de resultado gerencial (estrutura final de rateios/competência).

## 24. Consequências positivas

Rastreabilidade completa (número → operação); aderência a operações reais (multi-lote, multi-documento, parcial, permuta, antecipação); conciliação bancária correta (caixa só no extrato); evolução incremental sem big-bang; reutilização máxima do vigente; auditabilidade por eventos e snapshots.

## 25. Consequências negativas e custos

Mais entidades para aprender e manter; UI precisa orientar o usuário pelas camadas (cockpit); derivação de status exige disciplina (nada de cache não-reconstruível); migração controlada do legado comercial (~30 colunas de lancamentos e fluxo de replace) — em PR próprio; dependência de testes transacionais; complexidade real de rateios no resultado por lote.

## 26. Riscos e mitigação

Writers paralelos (via única + revogação comprovada em OC2-CONSOL) · duplicação de títulos (dedup estrutural + hash) · semântica incorreta de retenções (decisão 23.5 antes do PR; testes com casos reais) · mistura liquidação×banco (proibições do §16; conciliação como única ponte) · ingestão documental sem confirmação (sugerido→confirmado obrigatório) · divergência entre regras de saldo (regra canônica — 23.9) · dois fluxos de UI (decisão 23.7 antes do OC2-UI) · resultado por lote mal rateado (rateios declarados por slug; aceite com caso Minerva real) · alteração de histórico (append-only + snapshots) · catálogo duplicado semanticamente (conferir ajuste × arredondamento e natureza+código antes de qualquer seed novo).

## 27. Sequência revisada de implementação

| PR | Conteúdo | Depende | Tamanho preliminar* |
|---|---|---|---|
| OC2-ADR | Publicação deste ADR aprovado; sem mudança funcional | aprovação | P |
| OC2-CONSOL | Regra canônica de saldo; vocabulário de origem; revogação de writers/RPCs legadas comprovadamente substituídas; prevenção de duplo título; semântica de componentes sem caixa | ADR | M |
| OC2-COMP | Extensão mínima do catálogo (avaliar: antecipacao, juros, multa, permuta, perda, seguro, despesa_operacional, ajuste/arredondamento, credito, debito — conferindo duplicações semânticas antes) + flags/metadados de efeito + incidência opcional e rateios | CONSOL | M |
| OC2-LOTE | Enriquecimento de lote para abate (romaneio, carcaça, rendimento, classificação) + vínculo opcional de componentes | COMP | M |
| OC2-LIQ | Liquidação decomposta (liquidacao_componentes), antecipação/promissória, encargos, caixa real | COMP | M |
| OC2-ADIANT | Adiantamento (após decisão 23.4), encontro de contas, distrato/devolução | LIQ | M |
| OC2-DOC | Documentos estruturados, itens, storage, deduplicação, sugerido/confirmado | ADR | G |
| OC2-RESULT | Resultado por operação e lote (rateios, competência, caixa, custos, margem) | COMP, LOTE, LIQ | G |
| OC2-UI | Hidratação/edição, eixos, divergências, cockpit, fluxo único; validação de layout por Gabriel antes da implementação visual definitiva | CONSOL, COMP, DOC (contrato) | G |
| OC2-SEC | Somente deltas de tenant/RPC efetivamente necessários após comparação com o Gate0 | transversal | P/M |
| OC2-ABATE | Integração posterior com a frente PR-ABATE-NOVO | LOTE, RESULT | G |

\* P/M/G preliminares; cada PR recalcula em auditoria própria. Quantidades de migrations/testes não são fixadas nesta etapa. Cada PR: pequeno, reversível, testável, Proto-only, com auditoria prévia do estado atual e autorização própria.

## 28. Critérios de aceite deste ADR

Nenhuma inconsistência interna; nenhum dado do Gate0 contradito; nenhuma decisão pendente apresentada como aprovada; nenhuma arquitetura paralela; caso Minerva representável; compra, venda, abate, parcelas, recebimento parcial, permuta, antecipação e adiantamento representáveis; zero movimento bancário fictício; zero duplicação estrutural de títulos; separação documento/obrigação/liquidação/banco; separação planejamento/fato; fontes de verdade explícitas; cardinalidades claras (atual × alvo × pendente); sequência de PRs pequena e reversível.

## 29. Recomendação final

A fundação está comprovada e deve ser preservada. A fase conceitual pode ser encerrada após a aprovação deste ADR. Os próximos trabalhos são deltas em PRs próprios, cada um com auditoria prévia do estado atual, escopo cirúrgico, testes e autorização expressa. Nenhuma implementação começa antes da aprovação deste ADR e das decisões de produto que bloqueiam o respectivo PR (§23).

## 30. Apêndice de evidências

Contagens do Gate0 (22/07/2026): 8 tabelas · 2 views (security_invoker=true) · 30 colunas críticas · 62 constraints · 24 índices · 17 funções (0 overloads) · RLS 8/8 com policies · 6 operações · 8 lotes · 13 eventos · catálogo 15/12 ativos · integridade 0 em todos os cruzamentos. Classificação: 13/13 APPLIED. UNKNOWN: somente o registro nominal do histórico de migrations (timestamps de execução em vez de nomes de arquivo); sem impacto estrutural; nota de processo: padronizar a via de aplicação futura. Catálogo vigente (ativos): principal, bonus_precoce, bonus_qualidade, bonus_lista_trace, desconto_qualidade, funrural, senar_proape, condenacao, quebra, comissao, frete, imposto. Baseline md5: hashes das 17 funções registrados na inspeção como referência de drift. Itens parked (nota operacional, fora do estado vigente): 10 arquivos untracked no working tree do Executor, não auditáveis pelo Arquiteto e ausentes do repositório remoto; jamais interpretados como capacidade vigente nem como prova de ausência; tratamento (aplicar, versionar ou descartar) em ato próprio.
