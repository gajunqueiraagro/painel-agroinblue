# SPEC — Análise de Entradas e Saídas

**Status:** mock aprovado pelo Gabriel em 22/10/2026 (v8).
**Mock de referência:** `docs/mocks/mock-entradas-saidas-v8.html` (abrir no Chrome; é interativo).
**Vale para:** Finanças (primeiro) e AGROinBLUE (adaptado, seção 9).

Os dados do mock são ilustrativos. Só a saída de out/2026 por categoria é real (Dashboard do Gabriel). O mock define **forma, comportamento e regras**; os números vêm do banco.

---

## 1. Para que serve

Responder, sem rolar a tela:
- quanto entrou, quanto saiu e qual foi o resultado no mês;
- quanto do gasto é **custo de vida** e quanto é compromisso (financiamento), patrimônio ou outras saídas;
- se cada grupo, categoria e subcentro está subindo ou caindo, contra a média e contra a meta;
- quais lançamentos formam cada número.

## 2. Hierarquia (o eixo de tudo)

```
Raiz (Entradas | Saídas)
 └─ Grupo de análise   ex.: Custo de vida · Financiamentos · Investimentos em patrimônio · Outras saídas
     └─ Categoria       ex.: Moradia · Alimentação · Dependentes
         └─ Subcentro   ex.: Supermercado · Restaurantes · Delivery
             └─ Lançamentos
```

- Entradas do mock: Receitas · Rendimentos financeiros · Outras entradas.
- **Grupos são genéricos** (servem a qualquer cliente). Nada específico de uma pessoa (ex.: "Dependentes") vira grupo; fica como categoria.
- Os grupos são **configuráveis por espaço** (SaaS): o plano de contas aponta para o grupo; não é texto fixo no código.

## 3. Tela principal

Ordem de cima para baixo (altura de cada bloco é FIXA — regra soberana, seção 7):

1. **Barra azul:** caminho + seletor de **Contas** (todas / várias / "só esta").
2. **Filtros:** `Saídas | Entradas | Entradas × saídas` · ano `‹ 2026 ›` · 12 meses (previstos tracejados) · `Ano | Últ. 12 | 6 + 6` · período `De → Até` (quadro com ‹ano› e grade de meses, nunca lista longa).
   - Abre SEMPRE em **Entradas × saídas**, **Ano** (jan–dez), **mês vigente**.
   - "Ano" é sempre jan–dez, incluindo meses previstos.
3. **Card esquerdo** (muda com o modo):
   - *Entradas × saídas:* Saldo 1º/mês · **Conciliado até dd/mm** (mês vigente) · Entradas (total + grupos) · Saídas (total + grupos) · Resultado · Saldo final (previsto, se mês vigente/futuro).
   - *Saídas* ou *Entradas:* donut pequeno + total (fonte maior) + grupos com valor, %, vs média · rodapé com o outro lado, resultado, saldo inicial e final.
   - Totais e itens **alinhados na mesma coluna de valor**.
4. **Gráfico direito:** colunas por mês (realizado cheio, previsto claro hachurado, fundo cinza na faixa prevista).
   - *Entradas × saídas:* duas colunas por mês + **linha de saldo final** (mesmo eixo).
   - *Saídas/Entradas:* coluna + **média acumulada** (curva, mês a mês) + **meta** (pontilhado laranja); valor da média e da meta na ponta direita.
   - **Clicar numa coluna seleciona o mês.**
5. **Grade (sempre igual em qualquer modo):** Saldo inicial · Entradas › · grupos de entrada · Saídas totais › · grupos de saída · Resultado · Saldo final. Colunas = meses do período + **Total · Média · %** (separados por linha grossa e fundo cinza claro). Mês selecionado = coluna com fundo leve + cabeçalho escuro com traço dourado (nunca borda em cada célula). Mais de 14 meses → R$ mil com 1 decimal. Ano em segunda linha do cabeçalho na virada.
6. Clicar em qualquer total/grupo (card ou grade) abre o **modal**.

## 4. Modal de análise (cobre a barra lateral)

- **Cabeçalho:** abas `Saídas` (raiz, destacada) | grupos · período · contas · fechar. Abas com largura do próprio texto e **posição fixa** ao trocar.
- **Esquerda:**
  - Resumo: donut do nível + valor grande + meta + vs meta + período, **seguindo o seletor**.
  - Tabela: seletor `mês | Média do período | Acumulado` → colunas **Realizado · Meta · Dif. R$ · %**. 1ª linha = **total do nível** (fonte maior); itens em fonte menor.
- **Direita:**
  - Gráfico do item escolhido (caminho clicável `Saídas › Custo de vida › Alimentação › Supermercado`, setas ‹ › entre irmãos, KPIs: mês · média/mês · vs meta · tendência).
  - Tabela do nível de baixo (mesmo seletor, 1ª linha = total) com régua "vs meta" (economia · ideal · risco · muito alto) e botão **"N lanç. ›"**. Clicar numa linha troca o gráfico para ela.
- **Critérios do seletor:**
  - Mês = valor do mês × meta do mês.
  - Média = média de (início do período → mês escolhido) × meta mensal.
  - Acumulado = soma do mesmo intervalo × meta × nº de meses.

## 5. Gaveta de lançamentos (lateral direita do modal)

Estrutura FIXA: caminho clicável + contexto (mês · contas) + atalhos dos irmãos (2 linhas) → indicadores (lançamentos · total · valor médio/itens) → resumo (4 linhas: por favorecido ou maiores itens) → tabela (rola por dentro) → total.
- Num nível com filhos: lista os filhos (clique desce).
- Num subcentro: lista os lançamentos (data · favorecido · conta · valor).

## 6. Cores e números

- Saídas em vermelho, entradas em azul-marinho, meta em laranja, saldo em verde.
- **Negativo = vermelho; positivo = verde** (resultado, saldo).
- **Variação:** entradas acima = verde, abaixo = vermelho; **saídas acima = vermelho, abaixo = verde (economia)**.
- Valor da coluna: **vertical, pequeno, dentro da coluna junto à base** (nunca disputa com a média).
- Um eixo só por gráfico. Se houver negativo, o eixo desce abaixo de zero com os mesmos intervalos.
- Densidade: 9 / 10 / 11 px; linhas 18–21 px.

## 7. Regras soberanas (testar, não só olhar)

1. **Nada muda de altura ou posição** ao trocar modo, aba, item, mês, contas ou nível — tela, modal e gaveta. Lista longa rola **dentro** do próprio quadro.
2. Nenhum número ou nome corta; texto longo termina em "…" com title.
3. Tudo visível sem rolar a página em **1130×580** e **1440×860**.
4. **A tela nunca soma:** todos os totais, médias, saldos e % vêm do banco.

O mock foi medido assim (Playwright): posição/altura de cada bloco idêntica entre seleções; zero elementos com `scrollWidth > clientWidth`; página sem rolagem.

## 8. Contrato de dados (o que o banco precisa entregar)

| Dado | Regra |
|---|---|
| Grupo de análise | Por espaço; cada categoria do plano aponta para um grupo |
| Realizado por (nó, mês, contas) | Lançamentos realizados/conciliados, agregados no banco |
| Previsto por (nó, mês, contas) | Lançamentos previstos/confirmados/agendados + recorrências |
| Meta por (nó, mês) | Tabela de metas (orçamento). Sem meta cadastrada → "—", nunca zero inventado |
| Saldo inicial/final por (mês, contas) | Da âncora conciliada de cada conta (nunca do "maior mês") |
| Conciliado até | Último dia conciliado por conta; o card usa o **mais antigo** entre as contas selecionadas (decisão pendente) |
| Lançamentos do nó | Data · favorecido · conta · valor, paginado |

**Invariante a provar em teste:** `saldo final = saldo inicial + entradas − saídas`, mês a mês, para qualquer conjunto de contas.
- Transferência **entre contas selecionadas** não entra nem sai.
- Transferência para/de conta **não selecionada** conta como entrada/saída.
- O regime de data (pagamento × competência) precisa ser o mesmo para resultado e saldo, senão o invariante quebra (decisão na Fase 0).

## 9. Adaptação para o AGROinBLUE

Mesma tela, mesmas regras e mesmo comportamento. O que muda:
- **Hierarquia:** o plano de contas do AGRO (macro → centro → subcentro), com os grupos de análise do agro (ex.: custeio pecuário · custeio agrícola · investimentos · financiamentos · administrativo · dividendos).
- **Seletor de critério ampliado:** além de `mês | média | acumulado`, unidades zootécnicas e de área: **R$/cabeça/mês**, **R$/hectare**, e outras que o AGRO já mede (ex.: R$/@ produzida). O denominador vem da fonte única do AGRO (rebanho médio do mês, área do recorte), nunca calculado na tela.
- **Recorte:** fazenda/propriedade e safra entram como filtros, ao lado de contas.
- O resto (regra soberana, cores, gaveta, modal, invariante de saldo) vale igual.
