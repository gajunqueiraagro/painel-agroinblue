# ADR-2026-16 — Arquitetura Oficial da Operação Comercial (v1)

Status: ACEITO (20/07/2026) · Decide sobre: arquitetura oficial da Operação Comercial — eixos, princípios patrimoniais, contrato de cálculo, semântica de liquidação, separação do Abate, catálogo de componentes e plano de implementação

> **Origem e soberania.** Este ADR publica a BASELINE v1 da Operação Comercial,
> aprovada por Gabriel Junqueira em 20/07/2026 (documento PR-OC-UX-MODAL-02 —
> Relatório Final). É a referência soberana para todos os PRs relacionados à
> Operação Comercial. Proibida alteração conceitual neste documento; qualquer
> mudança futura de arquitetura ocorre por NOVO ADR que referencie esta baseline
> — nunca por edição silenciosa. Trabalhos subsequentes são exclusivamente de
> implementação, seguindo esta especificação.

## Contexto e evidências

A Operação Comercial nasceu como entidade soberana das negociações de gado
(compra, venda em pé, abate) na linhagem PR-OC-01 → PR-OC-01B → PR-OC-02 →
PR-OC-03 → OC-04A → OC-04B → PR-OC-MODEL-01 (`53c74dc`, três eixos
independentes, aplicado e validado no Proto). A perícia funcional comparativa
(legado × modal atual × MODEL-01) e a especificação funcional do modal
(PR-OC-UX-MODAL-01, com ajustes cirúrgicos aprovados) produziram esta baseline.
O modelo substitui, gradualmente, o espalhamento comercial legado
(~30 colunas comerciais de `lancamentos` e o fluxo de replace financeiro).

## Decisão 1 — Situação da Operação: matriz canônica

**4 eixos + 1 leitura derivada.** O efeito patrimonial NÃO é eixo e NÃO
substitui o Financeiro:

| Eixo | Pergunta | Estados |
|---|---|---|
| **1. Comercial** | O acordo está de pé? | programada · fechada · cancelada (+ flag técnica `rascunho`, que nunca é situação comercial) |
| **2. Animais** | Os animais andaram? | sem movimentação · entrega/entrada parcial · concluída · concluída com diferença (encerrada com motivo) |
| **3. Financeiro** | Os títulos existem e refletem a operação? | não aplicável · pendente · sincronizado · divergente · erro |
| **4. Liquidação** | O dinheiro/bens andaram? | não liquidada · parcial · quitada · excedente/divergente (estornos fora do saldo) |
| *Leitura derivada:* **Efeito patrimonial** | O que este negócio já mudou no patrimônio? | frases derivadas dos 4 eixos — rebanho, caixa, a receber/a pagar. Nunca editável, nunca eixo próprio |

## Decisão 2 — Princípios arquiteturais soberanos

### 2.1 Operação Comercial como origem patrimonial

Toda Operação Comercial deve produzir, **de forma derivada**, os fatos que
alimentam: evolução do rebanho; disponibilidades; direitos a receber;
obrigações a pagar; evolução patrimonial.

O Fechamento Patrimonial **nunca** deve reconstruir essas informações
diretamente a partir de liquidações, lançamentos financeiros ou conciliações
bancárias. Ele deve derivar seus números das Operações Comerciais (e das demais
operações patrimoniais soberanas), preservando a rastreabilidade completa.

### 2.2 Rastreabilidade

**Uma Operação Comercial nunca é recontada. Ela gera fatos. Os fatos
permanecem permanentemente vinculados à operação de origem. Qualquer número
apresentado em relatórios patrimoniais, financeiros ou gerenciais deve poder
ser rastreado até a operação que lhe deu origem.**

Este é um princípio soberano da arquitetura.

### 2.3 Contrato de cálculo

- A UI pode realizar cálculos **apenas para interação imediata (preview)** —
  conversões vivas, totais provisórios, feedback instantâneo durante a digitação.
- O **backend é a única autoridade** sobre valores persistidos.
- Antes de persistir, o backend **recalcula, valida e devolve os valores
  soberanos**.
- A UI **atualiza sua visão usando a resposta do backend** — o preview nunca
  sobrevive à persistência.

Não existem dois motores soberanos. O preview da UI é descartável por
definição; divergência entre preview e valor persistido resolve-se sempre a
favor do backend. Vedados: fórmula duplicada e espalhada por componente; estado
soberano derivado exclusivamente no frontend; valores líquidos e situações de
eixo calculados apenas na tela; o override de valor bruto.

Cálculos vivos obrigatórios no preview: peso médio ↔ peso total · kg ↔ @ ·
kg de carcaça ↔ @ de carcaça · preço por unidade ↔ valor total ·
R$/@ ↔ valor do componente · percentual ↔ valor do Funrural.

### 2.4 Semântica de liquidação e títulos

- Saldo por título = **valor do título − Σ liquidações válidas aplicadas**.
- Estados: **não liquidado · parcial · quitado · divergente/excedente**;
  estornos preservam o fato e saem do saldo.
- **Proibida alteração cega de situação de título** para "realizado" ou
  "conciliado".
- **"Conciliado" é fato bancário** — nunca sinônimo de "quitado".
- **Permuta reduz o saldo comercial, mas não aumenta disponibilidade.**
- São conceitos independentes, jamais presumidos uns dos outros: liquidação
  comercial declarada · título financeiro · realização financeira · conciliação
  bancária · disponibilidade bancária · permuta.

## Decisão 3 — Separação soberana no Abate e catálogo de componentes

**A. Composição financeira** (componentes de valor, no catálogo nomeado):
bônus precoce · bônus qualidade · bônus lista/trace · desconto qualidade ·
Funrural · condenação · quebra · comissão · frete · demais componentes.

**B. Dados físicos/comerciais estruturados** (campos próprios da operação,
NÃO componentes): rendimento · carcaça (com fonte soberana da edição) · tipo de
peso vivo/morto · datas de embarque e abate · modalidade da venda · romaneio
(documento).

O modelo de Abate **não pode ser descrito apenas como catálogo de
componentes** — as duas naturezas coexistem e não se convertem uma na outra.

**Catálogo — decisão de produto:** componentes gerencialmente diferentes
possuem **slugs próprios** (bonus_precoce, bonus_qualidade, bonus_lista_trace,
desconto_qualidade, funrural, comissao, frete, condenacao, quebra,
senar_proape, …). Proibido colapsar em bonificacao/desconto/ajuste genéricos
com descrição livre. O catálogo permanece extensível, preservando identidade
analítica.

## Decisão 4 — Gaps formais reconhecidos

A afirmação "não há nenhuma outra lacuna de escrita" está **revogada**.

**Backend:**

| Lacuna | Escopo | Classificação |
|---|---|---|
| `numero_documento` (NF) | comum | AGORA |
| `data_embarque` | abate | AGORA |
| `data_abate` | abate | AGORA |
| modalidade da venda `escala\|a_termo\|spot\|outro` | abate (extensível a venda) | AGORA |
| tipo de peso `vivo\|morto` | abate | AGORA |
| rendimento de carcaça | abate | AGORA |
| peso de carcaça + fonte soberana da edição | abate | AGORA |
| outros papéis: transportador · comissionado · faturador | comum | FASE POSTERIOR — exige decisão de modelagem (papel por operação × papel por componente) |
| nº pedido · instrução · documento de acerto | abate | FASE POSTERIOR — junto da frente documental |
| nº de contrato | comum | FASE POSTERIOR |
| derivação do efeito patrimonial (a receber / a pagar / disponibilidade) | leitura | FASE PRÓPRIA — gap de derivação, não de escrita |

Já suportado sem lacuna: liquidação parcial, permuta, estorno, múltiplas
entregas, encerramento de entrega, campos negociados, valor estimado/acordado.

**Frontend:** vocabulário de status defasado no modal (`confirmada` × vigente
`programada|fechada`); Situação da Operação (4 eixos + leitura patrimonial) no
painel lateral e na Central; UI do eixo Animais (registrar movimentação,
entregas múltiplas, encerramento, conciliação com quantidade como manchete e
peso como detalhe de investigação); UI do eixo Liquidação (formas, permuta,
estorno, saldo por título conforme §2.4); precificação com as 5 unidades (por
cabeça · por kg · por arroba · por arroba de carcaça · valor total do lote) e
bloco estruturado do abate; componentes nomeados com entrada dual R$/@ e
Funrural com % assistido (sempre preview, §2.3); `numero_documento` hoje
exibido sem persistir; resumo executivo em cabeças e dinheiro (sem peso como
KPI); Central sem abrir/editar operação existente. **O modal não precisa de
reescrita**: o contrato e os conteúdos internos são reestruturados preservando
a casca visual aprovada (header, wizard, painel lateral, rodapé) e
reaproveitando os componentes úteis existentes.

## Decisão 5 — Plano de implementação e ordem

| # | PR | Conteúdo | Gate |
|---|---|---|---|
| 1 | PR-OC-CONTRATO-EIXOS | Publicação deste ADR + índice (documentação apenas) | congela antes de qualquer UI |
| 2 | PR-OC-MODEL-02A | Campos estruturados comuns: `numero_documento` | após contrato |
| 3 | PR-OC-CATALOGO-01 | Catálogo oficial de componentes com slugs nomeados (Decisão 3) | após 02A |
| 4 | PR-OC-MODEL-02B | Abate estruturado (Decisão 3.B) — depende do catálogo oficial | após CATALOGO-01 |
| 5 | PR-OC-LIQ-02 | Saldo por título + estados + estorno + excedente (§2.4) | após contrato |
| 6 | PR-OC-UX-03 | Reestruturação do conteúdo do modal (casca preservada), 4 eixos, preview §2.3 | não inicia enquanto 1–5 não estabilizarem |
| 7 | PR-OC-UX-04 | Situação da Operação na Central e painel lateral | após UX-03 |
| 8 | PR-OC-PATRIM-01 | Derivação do efeito patrimonial (§2.1; virada de exercício sem dupla contagem) | após LIQ-02 e UX-04 |

**Ordem: CONTRATO-EIXOS → MODEL-02A → CATALOGO-01 → MODEL-02B → LIQ-02 →
UX-03 → UX-04 → PATRIM-01.** Contrato antes de dado; catálogo antes do modelo
que o referencia; dado antes de tela; tela antes de leitura derivada. A UI
nunca nasce sobre contrato instável.

PR-OC-LOTES e o backfill mantêm a regra congelada (lote antes do backfill); o
encaixe relativo a esta fila é decisão de produto separada.

## Consequências

- Toda implementação da Operação Comercial cita este ADR como referência e
  declara aderência às Decisões 1–5.
- Divergência entre código e este ADR é defeito de implementação, nunca motivo
  de edição do ADR.
- A especificação funcional do modal (PR-OC-UX-MODAL-01, com ajustes
  aprovados) permanece como documento de experiência subordinado a este ADR.

## Relacionados

- Constituição Técnica e Constituição nº 2 (Produto e Inteligência Gerencial).
- ADR-2026-06 — Proveniência e Ciclo de Vida de Registros Derivados.
- PR-OC-MODEL-01 (`53c74dc`) — contrato de três eixos aplicado no Proto.
- PR-OC-UX-MODAL-01 — especificação funcional do modal (experiência).
