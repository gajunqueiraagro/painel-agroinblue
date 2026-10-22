# FIN-VISAO-GERAL-01 — "Visão Geral" do Financeiro no AGRO

Base: `docs/specs/SPEC-analise-entradas-saidas.md` (aprovada no Finanças, 22/10/2026) e o mock `docs/mocks/mock-entradas-saidas-v8.html`.
A SPEC é o gabarito de **forma e comportamento**; este arquivo registra o que muda no AGRO. Decisões do Gabriel em **22/10/2026**.

**Regra soberana (SPEC §7.4):** a tela NUNCA soma. Todo total, média, saldo e % vem do banco.

## Decisões

1. **Nome e lugar.** A tela se chama **"Visão Geral"** e fica no **topo do menu Financeiro**, acima de Lançamentos Financeiros. O
   "Dashboard Financeiro" (Gestão; `DashboardFinanceiro.tsx`, que soma na tela) sai **depois da homologação** da Visão Geral — até lá
   não se mexe nele.
2. **Regime: CAIXA.** Resultado e saldo pela **data de pagamento** (o mesmo regime nos dois, senão o invariante de saldo quebra — SPEC
   §8). O DRE continua em competência.
3. **Grupos de análise** (genéricos e poucos; silvicultura, cana etc. não viram grupo):
   - **Saídas:** Custeio · Reposição de bovinos · Investimentos · Amortizações · Juros · Impostos e deduções · Dividendos · Outras saídas.
   - **Entradas:** Receitas operacionais · Entradas de capital e financiamento · Outras entradas.
4. **Hierarquia do AGRO:** Raiz › Grupo › **Atividade** (`financeiro_plano_contas.escopo_negocio`: pecuária, agricultura,
   silvicultura, administrativo; cana quando existir) › Centro › Subcentro › Lançamentos. Filtro **"Atividade"** no topo, ao lado de
   Contas, Fazenda e Safra.
5. **Seletor de critério:** além de mês / média do período / acumulado, as unidades **R$/cabeça/mês, R$/UA, R$/ha** (produtiva,
   pecuária, agricultura, plantado) e **R$/@ produzida**, com o denominador da **fonte única do AGRO** (PR 2). Unidade só onde faz
   sentido; sem denominador, "—".
6. **Meta** ligada pelo `plano_conta_id` (hoje `planejamento_financeiro` casa por texto) — PR 2. A tela de lançar meta será refeita no
   padrão novo (frente própria, mock antes).
7. **Sem classificação:** lançamento sem `plano_conta_id` aparece no grupo **"Sem classificação"** (entrada ou saída pelo tipo), nunca
   escondido. Caso real: Rita, 80 lançamentos realizados sem `plano_conta_id`.
8. **"Conciliado até"** = a conta **mais atrasada** entre as selecionadas (mesma regra da CPR).

## Plano de PRs

| PR | Conteúdo |
|---|---|
| 0 | Docs: a SPEC, o mock e este arquivo |
| 1 | Banco: `grupo_fluxo` no plano (backfill + guarda), `fn_vg_serie` (realizado/previsto por nó × mês), `fn_vg_saldos` (âncora conciliada) e o teste SQL |
| 2 | Meta por `plano_conta_id`, denominadores (cabeças, UA, ha, @ produzida extraída do `fn_dre_pecuaria`) |
| 3+ | As telas (mock antes) |
