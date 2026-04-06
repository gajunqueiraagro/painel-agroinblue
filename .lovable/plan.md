

## Ajuste de layout dos cards de resumo na tela Saldos Bancários Mensais

### O que será feito

1. **Remover `ml-auto`** dos cards de resumo (Conta Corrente, Conta Investimento, Total Geral) para que fiquem ao lado dos filtros (centralizados na linha), em vez de empurrados para a direita.

2. **Aumentar fonte dos valores** de `text-base` para `text-lg` ou `text-xl` nos cards de resumo.

3. **Separar o sticky em duas linhas**:
   - Linha 1: Título "Saldos Bancários Mensais" + botão Novo
   - Linha 2 (sticky): Filtros (Ano, Mês) + Cards de resumo lado a lado — congela abaixo do cabeçalho da tabela

   Na verdade, o pedido é congelar os cards **abaixo do header da tabela (Mês | Conta | ...)**, então o sticky deve englobar filtros + cards + cabeçalho da tabela juntos.

### Mudanças no arquivo

**`src/pages/FinV2SaldosTab.tsx`** (linhas ~449-498):

- Remover `ml-auto` da div dos cards (linha 465) → ficam logo após os selects
- Aumentar `text-base` → `text-xl` nos valores dos cards (linhas 469, 476)
- Envolver a div de filtros+cards **e** o `<TableHeader>` em um container `sticky top-0 z-10 bg-background` para que ambos congelem juntos ao rolar

### Estrutura resultante

```text
┌─────────────────────────────────────────────────┐
│ Saldos Bancários Mensais              [+ Novo]  │
├─────────────────────────────────────────────────┤  ← sticky
│ [2025] [Todos]  [CC: R$xx] [CI: R$xx] [Total]  │
│ Mês | Conta | Saldo Ini | Saldo Fin | ...       │
├─────────────────────────────────────────────────┤
│ (dados scrolláveis)                              │
└─────────────────────────────────────────────────┘
```

