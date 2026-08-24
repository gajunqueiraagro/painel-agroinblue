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

**Altura constante não é o mesmo que caber.** Em viewport curto o modal **rola**,
e isso está correto. O critério "cabe sem rolar" vale para telas maiores; entre
rolar e espremer um bloco a nada, rola. Medido no `IndicadorHistoricoModal` em
viewport de 578px (PR-FIX-ABA-GLOBAL-27): shell 532, e o corpo rolando.

Referências vivas: `LancamentoV2Dialog.tsx:1017` (PR-FIN-MODAL-02C);
`IndicadorHistoricoModal.tsx:540` (`h-[92vh] max-h-[92vh]`, PR-27).

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

## A11 — Cor de valor de meta

**Valor de meta/planejamento usa `text-meta`** — laranja escuro
(`--meta: 25 85% 45%`), criado para TEXTO. Não usar `text-cta` nem
`text-warning`: os dois são o mesmo amarelo (`43 87% 63%`), feitos para
fundo de botão e faixa de aviso, e ficam ilegíveis como texto sobre branco.

A regra vale para qualquer superfície que mostre meta — tabela, tile ou
linha —, por isso é padrão próprio e não parágrafo do A10.

`bg-cta` e `bg-warning` continuam sendo o certo para o que foram feitos:
botão de ação e faixa de aviso. O que muda é só o uso como cor de texto.

## A12 — Séries e marcadores em gráficos

**Dot custom precisa de guard de nulo.** O recharts chama o renderizador
de dot para todo índice da série, inclusive os de valor nulo. Um
`<circle>` com `cy` inválido é desenhado em y=0 e o clip corta a metade
de cima — vira uma marca cortada no topo do gráfico. Em jul/2026 eram
cinco, uma para cada mês futuro (Ago–Dez). Primeira instrução do dot:

```
if (props.value == null || !Number.isFinite(props.cy)) {
  return <g key={props.index} />;
}
```

Retornar `<g/>` vazio, não `null` — a assinatura de `dot` espera
`ReactElement`.

**Prepender categoria desloca todos os índices.** Ao acrescentar uma
categoria antes da primeira (ex.: "Ini" antes de Jan), qualquer
comparação por índice — `props.index === mesAtual - 1` — passa a apontar
um item antes, e o marcador do mês selecionado cai no mês errado.
Derivar o deslocamento do próprio array (`dados.length > 12 ? 1 : 0`),
nunca fixá-lo.

**Hierarquia de contraste, do mais forte ao mais fraco:** série de dados
> eixo > grade. Valores em uso: série do ano anterior
`hsl(var(--muted-foreground))` cheia; eixos a `0.22`; grade a `0.15`.

**Ligar as verticais da grade dobra o traço na mesma área.** A opacidade
calibrada com `vertical={false}` fica forte demais quando as verticais
entram — a tinta total dobra sem que a opacidade por linha mude.
Recalibrar sempre que mudar o número de linhas, não só a cor.

**`viewBox` derivado da altura, nunca literal.** Um `viewBox="0 0 100 120"`
com `H = 96` faz as barras lerem o zero em 91/120 e a régua de rótulos em
91/96 — 18,2px de desalinhamento, que num gráfico de área viraram 1,23 ha
de erro de leitura. Usar `` viewBox={`0 0 100 ${H}`} ``.

**Fundo dos marcadores vazados acompanha o contêiner.** O `fill` de um
dot aberto é a cor de fundo de quem o contém: `--background` fora de
card, `--card` dentro. Errar deixa miolo cinza em card branco.

**Ausência não é zero, e negativo não é ausência.** Em gráfico de barras,
ano sem dado mantém o slot no eixo e não desenha barra — nunca barra de
altura zero, que afirmaria "foi zero". E a guarda de "tem dado" testa
`!== 0`, não `> 0`: produção biológica pode ser negativa (a NJ tem
−2.877,2 @ em jul/2021), e `> 0` apagaria o ano.

**Barras agrupadas: uma paleta só.** Ano anterior em `#B4B2A9`, realizado
na cor da série, meta em laranja sólido claro (`#FCB27F`). A meta vazada é
o idioma das **linhas**; misturar os dois deixa duas paletas para a mesma
semântica na mesma tela.

**Eixo Y não precisa de casa decimal acima de mil.** `"50.000,0"` tem oito
caracteres e não cabe em canaleta de 46px. Formatador do eixo separado do
formatador de rótulo de barra — no rótulo há espaço e a decimal importa.

## A13 — Armadilhas de JSX e CSS

**Zebra por índice, não por `nth-child`.** `odd:`/`even:` só funcionam
entre irmãos diretos. Linhas agrupadas em contêineres reiniciam a
contagem em cada bloco. Alternar pelo índice em JS.

**`{/* */}` como primeiro filho de `return (…)` não é comentário** — é
bloco vazio, e quebra o JSX. Já custou 14 erros de sintaxe.

**Mover bloco entre contêineres flex exige medir na tela.** TSC, build e
contagem de linhas **não veem CSS**: no PR-26 o bloco movido tinha 383
linhas idênticas, zero diferenças de conteúdo, todos os gates verdes — e o
layout quebrou. Antes de reportar verde, medir
`getBoundingClientRect().height` de cada elo da cadeia, com a tela aberta.

**Numa coluna flex, `flex-1 min-h-0` cede até zero; sem `min-h-0` o irmão
não cede.** Blocos irmãos com regras diferentes fazem um só absorver todo o
aperto. Piso inline num filho (`style={{ minHeight }}`) **não** protege o
wrapper — governa só o elemento que o carrega, e o conteúdo transborda em
vez de segurar a altura. Dar piso ao wrapper e `shrink-0` a quem não deve
ceder. E `max-h-[…]` sozinho nunca aperta: altura indefinida faz
`flex: 1 1 0%` não distribuir nada.

**O painel inativo do Radix Tabs continua no DOM e divide o espaço.** O
`Presence` recebe `children` como função, então `forceMount` é sempre
verdadeiro e o painel inativo nunca é desmontado. E o `hidden` não o tira do
layout: `[hidden] { display: none }` é regra de **user-agent** e
`.flex { display: flex }` é de **autor** — autor vence na cascata. Com
`flex-1` nos dois, `flex-basis: 0%` faz a divisão ser puro `flex-grow`, e o
painel ativo recebe **metade** do espaço, independentemente do conteúdo.

Medido: um modal de 501px com `TabsList` de 40 deu 230px a cada painel — e o
número não variou quando o conteúdo foi de 20 para 260px, nem quando uma
tabela entrou. O conteúdo não tem voto.

A correção é `data-[state=inactive]:hidden` no `TabsContent`: classe mais
atributo tem especificidade maior que `.flex`. **Vale para todo `Tabs` do app
cujo `TabsContent` tenha classe de display** — não só o modal de indicador.
Referência viva: `IndicadorHistoricoModal.tsx` (PR-FIX-TABPANEL-30).

**Trocar aba do Radix exige clique de ponteiro real.** `element.click()` e
`KeyboardEvent` sintético **não** mudam o estado. Medir um painel sem antes
confirmar `data-state="active"` lê o painel que ainda está montado — foi assim
que uma medição concluiu "regressão na aba Por Fazenda" quando não havia
regressão nenhuma, com número na mão.

**Número que diverge pouco não é arredondamento até que se meça.** O PR-23
registrou "16.914,0 contra 16.912,7 — arredondamento" e seguiu. Não era: era o
overlay de fechamento, medido no cliente onde ele quase não aparece. Num
cliente menor a mesma causa deu 11,6% e apareceu como dois números diferentes
na mesma tela. **Diferença pequena em base grande é diferença grande em base
pequena** — conferir a causa, ou medir em mais de um cliente antes de atribuir
a ruído.

**Medição em um cliente não é medição.** Escala esconde defeito: base sete
vezes maior dilui o mesmo desencontro para perto de zero.

## A14 — Direção do indicador

**A cor do delta segue a direção BOA do indicador, não o sinal.** Custo
que subiu 40% em verde afirma melhora sobre a pior notícia da tela.
Indicadores onde subir é ruim: custeio, custo por @, custo por cabeça,
endividamento e alavancagem. O critério é "subir é ruim para o produtor"
— inclui dívida, não só custo e despesa.

**A seta nunca inverte.** Ela indica direção, não qualidade: número que
subiu aponta para cima mesmo quando subir é ruim. Inverter esconderia o
fato.

**Direção não é cor da série.** São props distintas: `margemArr` pinta a
série de vermelho quando o valor é negativo, e ainda assim subir é bom.

**Tile e modal têm de concordar.** `MetricTile` usa `inverseDelta`; o
modal usa `polaridade`. Dar direção a um e não ao outro cria tile verde e
modal vermelho sobre o mesmo número, na mesma tela.

**Duas exceções registradas, ambas mantidas no default:** lotação
(`uaHa`) — subir é bom até a capacidade de suporte e ruim depois, e não há
teto no dado; e `precoArr`, que no PC-100 é receita ÷ arrobas
desfrutadas, ou seja preço de venda, onde subir é bom.

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
