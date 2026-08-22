# Padrões de interface — AGROinBLUE

Padrões **permanentes** do sistema. Valem daqui em diante **sem precisar constar de
cada briefing**: um PR que os contraria está errado mesmo que o briefing não os cite.

Origem: PR-UI-PADROES-01 (2026-08-19).

Hierarquia: a Constituição rege a arquitetura, o `CLAUDE.md` rege a execução, este
documento rege a apresentação. Onde houver conflito, os dois primeiros prevalecem.

---

## A1 — Modais são largos por padrão

**Mínimo `max-w-3xl`.** Use `max-w-4xl` ou mais quando o conteúdo pedir.

Modal estreito com campos espremidos é **defeito, não escolha**. Se o conteúdo não
cabe, a resposta é alargar o modal — não reduzir fonte, não empilhar tudo em uma
coluna, não introduzir rolagem interna.

Esta proibição vale contra **espremer conteúdo em modal estreito**. Densidade de
formulário tem escala própria — `h-9` em campo e `text-[10px]` em texto de ajuda são
densidade correta, não conteúdo espremido, do mesmo modo que o A4 vale para tabela.

Referência viva: `MesaPareamentoModal.tsx` (`w-[96vw] max-w-[1800px] h-[92vh]`) para
mesas de trabalho; `max-w-3xl`/`max-w-4xl` para formulários.

## A2 — Campo curto não ocupa a linha inteira

Seletores, datas, valores e códigos ficam em **grade de duas ou três colunas**.
Só **texto livre longo** (observações, descrição) usa a linha inteira.

```tsx
<div className="grid gap-4 sm:grid-cols-2">
  <div>{/* nome */}</div>
  <div>{/* área */}</div>
</div>
```

Um `<Select>` de cinco opções esticado por 1000px é ruído: o olho percorre a largura
toda para ler três palavras.

## A3 — Cabeçalho de tela é fixo ao rolar

Título, subtítulo, ações e abas ficam **sempre visíveis** (`sticky top-0` com `z-`
acima do conteúdo). Vale para **todas as telas**, não só as longas.

Quando a lista rola, o operador precisa continuar sabendo em que fazenda, mês ou
arquivo está. Contexto perdido no scroll é a origem de erro de digitação na linha
errada.

## A4 — Densidade de tabela operacional

Padrão de referência: **Plano de Contas** (`FinV2PlanoContasTab.tsx:72`).

```
célula:    text-[11px] font-medium leading-tight py-1 px-2
cabeçalho: text-[11px] font-semibold py-1 px-2   (sticky)
badge:     text-[9px] px-1.5 py-0
```

Fonte pequena, altura de linha mínima, cabeçalho fixo. Tela operacional prioriza
**quantas linhas cabem sem rolar** — nunca aumentar fonte ou espaçamento por estética.

## A5 — Seletor de data é o do sistema

Usar `DatePicker` de `@/components/ui/date-picker` — Popover + Calendar pt-BR, input
editável, contrato `'yyyy-MM-dd'` entrando e saindo, TZ-safe (sem `toISOString`).

**Proibido** o seletor nativo do navegador (`<input type="date">`) com rolagem de anos.

⚠️ **Limitação conhecida** (2026-08-19): o `Calendar` do sistema navega **só por mês**
(`IconLeft`/`IconRight`). Não há setas nem dropdown de **ano** — trocar de ano custa 12
cliques. Ampliar isso é frente própria; ver "Pendências" no fim.

⚠️ **Campo de MÊS não é campo de data.** Onde a granularidade é mensal
(`pastos.data_inicio`, `pastos.data_fim`, competência), o `DatePicker` de dia é o
componente **errado**: ele permitiria escolher o dia 17 num campo cuja semântica é
"a partir de julho". Enquanto não existir seletor de mês/ano do sistema,
`<input type="month">` permanece a escolha correta nesses campos — e isso **não** é
violação do A5, é o A5 não se aplicando.

## A6 — Números sempre `0.000,00`

Formato brasileiro, com separador de milhar e duas casas decimais.

```ts
v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
```

Entrada: campo `text` com `inputMode="decimal"`, formatação no `blur`. **Não** usar
`<input type="number">` — ele não exibe separador de milhar nem vírgula decimal.

Referência: `PastosTab.tsx` (`formatarAreaBR` / `parseAreaBR`).

Sentinela: **ausência de dado nunca é `0,00`** — exibir `—` e dizer que não foi
informado. Zero é valor real; confundi-los produz "divergência" onde só há dado
faltando. Ver CLAUDE.md, seção de sentinelas.

## A7 — Modal com abas tem altura constante

O modal **nunca muda de tamanho ao trocar de aba**. Altura fixa no `DialogContent`
(`h-[...]` além do `max-h`), dimensionada pela aba mais alta.

Aba mais curta sobrando espaço vazio é o comportamento **correto — sempre**. Não é
defeito a corrigir, não é caso para encolher o modal, não é caso para preencher o
vazio. Modal que encolhe e reposiciona a cada clique de aba é o defeito; espaço em
branco é o preço aceito da estabilidade, e é sempre o preço certo.

Referência viva: `LancamentoV2Dialog.tsx:1017` (PR-FIN-MODAL-02C).

## A8 — Cabeçalho e rodapé de modal não rolam

Todo modal com rodapé de ação (Salvar, Atualizar, Confirmar) é `p-0 flex flex-col`:
header `shrink-0 border-b`, corpo `flex-1 overflow-y-auto min-h-0`, rodapé
`shrink-0 border-t`.

**Proibido `overflow-y-auto` no `DialogContent` inteiro** — leva o botão de salvar
embora no scroll e some com o título que diz o que está sendo editado.

O ideal é não rolar. Se rolar, rola só o miolo.

⚠️ `min-h-0` é obrigatório em **todos** os níveis flex entre o `DialogContent` e o
corpo rolável. Sem ele o filho não encolhe e a rolagem vaza para o modal inteiro,
desfazendo o padrão sem erro visível no código.

Referência viva: `MesaPareamentoModal.tsx:1365`.

## A9 — Painel flutuante nunca ultrapassa a tela

Dropdown, popover e combobox se limitam ao **espaço disponível medido pelo Radix**,
nunca a um teto fixo em `rem`. Teto fixo funciona na tela do desenvolvedor e vaza na
janela pequena do operador — e o item que vazou é **invisível, não dá erro**.

```
max-h-[min(24rem,var(--radix-select-content-available-height,24rem))]
```

O **fallback dentro do `var()` é obrigatório**: sem ele a declaração inteira cai
quando a variável não existe, e o teto some sem aviso.

`avoidCollisions` sozinho **não resolve** — ele inverte o lado, não encolhe o painel.

Referência viva: `select.tsx` (PR-UI-DROPDOWN-VIEWPORT-01).

## A10 — Tabelas de dados

Estabelecido em `5d691b8d` (22/08/2026), aplicado às tabelas da Visão Geral.
Vale para toda tabela nova.

| elemento | classe |
|---|---|
| `<tr>` do `<thead>` | `bg-primary text-primary-foreground` |
| linhas de dado | `odd:bg-muted/30 even:bg-card` |
| linha de Total | `bg-primary text-primary-foreground font-medium` |
| bordas | nenhuma — o fundo azul já separa |

**Sobre fundo azul, nenhum texto pode ficar em `text-foreground` ou
`text-muted-foreground`.** Use `text-primary-foreground` no dado e
`text-primary-foreground/70` em sufixos de unidade ("ha", "cab"). Conferir
célula a célula: uma célula esquecida fica ilegível sem erro nenhum.

**NÃO usar `.financeiro-table-head` / `.financeiro-table-foot`** de
`src/index.css`. Elas produzem o mesmo visual mas carregam `position: sticky`
e `z-index`, que existem para a listagem financeira e atrapalham em tabela
comum. Use os tokens direto pelo Tailwind.

**Zebra:** `even:bg-card` sobre um card que já é `bg-card` deixa as linhas
pares transparentes — a alternância é cinza / fundo-do-card, não cinza /
branco. É o comportamento certo em tema escuro. Se ficar sutil demais no
tema claro, subir a ímpar para `/40`; nunca pintar a par de branco.

**Linha de nota** (ex.: "% da área") fica FORA do padrão: sem fundo,
`text-muted-foreground`, um passo menor. Ela é rodapé da tabela, não dado.

---

## Pendências deste documento

- **Seletor de mês/ano com setas** — não existe. Enquanto não houver, `type="month"`
  segue válido para campos de granularidade mensal (ver A5).
- **Navegação por ano no `Calendar`** — hoje só por mês. Candidato: `captionLayout="dropdown"`
  com `fromYear`/`toYear` do `react-day-picker` já instalado (`^8.10.1`), sem dependência nova.
- **Retrofit A8** — **15** modais legados ainda com `overflow-y-auto` no `DialogContent`
  inteiro: `MapaRebanhoImportDialog`, `AbateDetalhesDialog`, `CompraDetalhesDialog`,
  `AbaRecebimentoLotes`, `AbaLiquidacaoOC`, `SaldoInicialForm`, `LancamentoDetalhe`,
  `FinanceiroEditDialog`, `DialogVerLancamentosOficiais`, `VendaDetalhesDialog`,
  `TransferenciaDetalhesDialog`, `ProjetosInvestimento`, `MesaClassificacaoTab`,
  `LinhaExecutivaExecutivoModal`, `FinanciamentoDetalhe`. Frente própria:
  **PR-UI-MODAL-RETROFIT-01**.
- **A9 em `popover.tsx` e `dropdown-menu.tsx`** — hoje sem `max-h` nenhum: crescem com o
  conteúdo e vazam do mesmo jeito, por caminho diferente. Auditar quando houver caso real.
