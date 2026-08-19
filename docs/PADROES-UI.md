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

---

## Pendências deste documento

- **Seletor de mês/ano com setas** — não existe. Enquanto não houver, `type="month"`
  segue válido para campos de granularidade mensal (ver A5).
- **Navegação por ano no `Calendar`** — hoje só por mês. Candidato: `captionLayout="dropdown"`
  com `fromYear`/`toYear` do `react-day-picker` já instalado (`^8.10.1`), sem dependência nova.
