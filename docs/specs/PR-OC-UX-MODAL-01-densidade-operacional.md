# PR-OC-UX-MODAL-01 — SPEC: Densidade e leitura operacional do Modal de Operação Comercial

> **Registro de perícia de UX. NÃO implementado.** Ajustes exclusivamente
> de **apresentação**. O contrato do OC-04A (motor/RPCs/catálogo) e do
> OC-04B (payloads, hooks, fluxo) permanece **totalmente intacto**.
> Fonte da demanda: revisão de usabilidade de Gabriel (2026-07-19).
> Status de implementação: pendente (PR próprio).

## 0. Princípio

Apresentação, não arquitetura. Nenhuma mudança de: modelo de dados,
RPC, payload, hook, ordem de campos que afete envio, regra de negócio,
sentinela de dado. Se algum ajuste "de UX" exigir tocar contrato →
**PARAR e reportar** (não é este PR).

Meta transversal: **~2× de informação visível sem scroll**, alinhada à
regra permanente de densidade operacional (telas operacionais: ~12–15
linhas sem scroll; reduzir paddings/alturas; nunca aumentar fonte/espaço
por estética).

## 1. Escopo (4 frentes de apresentação)

### 1.1 Modal muito "alto" — compactar
Arquivo-âncora: `src/components/operacao-comercial/modal/ModalOperacaoComercial.tsx`.

Alvos (todos de estilo, sem mudar estrutura/estado):
- **Fontes −~15%**: descer um degrau de escala onde couber
  (`text-lg`→`text-base`, `text-base`/padrão→`text-sm`, `text-sm`→`text-xs`),
  preservando hierarquia e contraste. Não reduzir abaixo de legível.
- **Cabeçalho**: hoje `bg-primary … px-6 py-4`; reduzir altura vertical
  (padding-y) e a linha de metadados (data/fazenda).
- **Wizard (abas)**: hoje `bg-card border-b px-6 py-3`; reduzir py e o
  tamanho dos números/labels dos passos.
- **Corpo**: `p-6` do container e paddings dos cards internos
  (`rounded-lg border bg-card p-5` nas abas) → reduzir.
- **Linhas de grade**: células hoje `py-1.5`/`py-2` (ver §1.3) → reduzir.
- **Rodapé**: `bg-primary px-6 py-3` → reduzir py.

Critério de aceite: com o mesmo conteúdo de uma Compra típica, o número
de linhas/campos visíveis sem scroll aproximadamente dobra; nenhum campo
some, nenhum controle muda de comportamento.

### 1.2 "Lote 1 (Ordem de Compra)" não comunica — renomear rótulo
Arquivo-âncora: `src/components/operacao-comercial/modal/abas/AbaLotes.tsx`
(hoje `<h3>Lote 1 (Ordem de Compra)</h3>` e subtítulo "Movimentações
vinculadas a este lote.").

Trocar o título exibido por rótulo orientado ao negócio:
**"Animais da operação"** (preferido) ou "Itens da operação".
O conceito interno de **Lote** permanece no modelo/código; apenas não é
exposto ao operador nesta etapa. Mudança é só de string/label — o passo
do wizard "Lotes Comerciais" também deve acompanhar (label do WIZARD em
`ModalOperacaoComercial.tsx`).

### 1.3 A grade não deixa "entender o que se compra" — evidenciar
Arquivo-âncora: `src/components/operacao-comercial/modal/abas/AbaLotes.tsx`.

O operador precisa responder de imediato, olhando a grade:
- qual **categoria**;
- quantas **cabeças** (quantidade);
- qual **peso** (total/médio);
- **quanto já selecionei** (totais acumulados do que está marcado).

Diretriz de apresentação (sem mudar a fonte de dados — os campos já
existem em `MovOption`: `categoria`, `quantidade`, `pesoTotalKg`,
`pesoMedioKg`, `fazendaNome`):
- Dar destaque visual à seleção (categoria/qtd/peso por linha legíveis
  de relance, não escondidos em texto corrido do checkbox).
- Manter/realçar o "Resumo do Lote" (qtd total, peso total, peso médio)
  como leitura primária do que já foi selecionado.
- Estado vazio honesto preservado ("Nenhuma movimentação selecionada.").
Sem novo dado, sem cálculo de conversão (arroba fica no domínio, D7).

### 1.4 "Resumo da Operação" ocupa espaço demais — enxugar
Arquivo-âncora: painel lateral `<aside>` em `ModalOperacaoComercial.tsx`
(grid `lg:grid-cols-[1fr_320px]`, aside `rounded-lg border bg-card p-4`).

- Reduzir altura (paddings, espaçamento `space-y`, tamanho do valor
  total `text-2xl`).
- Priorizar só o útil durante a edição (ex.: Tipo, Contraparte, Status,
  Valor total). Itens redundantes com o cabeçalho podem sair.
- Opcional (a avaliar na implementação): estreitar a coluna lateral
  (`320px`) se liberar densidade sem prejudicar leitura.

## 2. Não-escopo (explícito)
- Qualquer alteração de payload/RPC/hook/contrato OC-04A/04B.
- Remoção do badge hard-coded "Mês fechado" e do rótulo "Receita" para
  principal em compra — são **frentes próprias já registradas**, não
  entram neste PR de UX.
- Persistência de `negociacao_obs` em coluna separada (frente de modelo).
- Documentos/anexos (infra documental é frente própria).

## 3. Encaixe arquitetural (Constituição nº 1, Título IV)
Presentation-only: **não** cria fonte de dado, contrato, componente novo,
cálculo, integração ou regra. Reestiliza superfície operacional existente
(modal OC-04B). Não é superfície analítica (Constituição nº 2 / Art. 19
não se aplica). Hierarquia documental preservada (contrato > UI).

## 4. Gates do PR (quando executado)
- TSC ≤ baseline (91) — sem novos erros.
- Build verde.
- Diff **restrito** a arquivos de apresentação do modal:
  `ModalOperacaoComercial.tsx`, `abas/*.tsx`, `tipos.ts` (só se necessário
  para estilo/label). **Zero** mudança em `useOperacaoComercial.ts`,
  `useComponentesFinanceiros.ts`, `usePlanoContasOC.ts` e migrations.
- Grep de não-regressão de contrato: nenhuma chave de payload
  adicionada/removida; `oc_salvar_rascunho`/`oc_reabrir` inalterados.
- Homologação visual na V2/Proto: 6 abas, densidade ~2×, todos os
  controles funcionam idênticos ao commit `5a1def5d`.
