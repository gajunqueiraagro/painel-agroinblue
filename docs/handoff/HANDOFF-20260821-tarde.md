# HANDOFF AGROINBLUE — 21/08/2026 · TARDE

Sessão Claude Chat (Arquiteto). Proto `d3a2e72c` → `11fc5e84`.
Continuação de `HANDOFF-AGROINBLUE-20260821.md` (PRs 1–13) e
`-parte2.md` (PRs 14–25), que cobrem a manhã.

**TSC baseline mudou: 89 → 79.** Ver PARTE 5.

---

## PARTE 1 — O QUE FOI ENTREGUE

**29 commits**, 3 operações de dado, 3 runbooks.

### Fundação financeira (a espinha da sessão)
| commit | o que faz |
|---|---|
| `d4135e3d` | entradas classificam por `grupo_custo` literal + linha residual |
| `0293270e` | linha do Caixa vira caixa, não competência zootécnica |
| `2e24e5d0` | silvicultura como atividade própria no PC-100 |
| `9086ea6e` | área do Global para de filtrar `tem_pecuaria` |
| `04d8d457`→`…` | captação separada por escopo; linhas zeradas ocultas |

### Visão Geral — coluna esquerda e refinamento
`9b8c8c5c` composição da área · `299b0438` área por fazenda ·
`a527fd04` grade 60/40 · `e948a653` duas colunas independentes ·
`1b4ce79d` densidade · `ccf75196` eficiência com 5 tiles ·
`aae9456a` donut maior · `07111537` excedente e rodapé ·
`66d2c6a2` disponível em conta · `55b096ba` média no período ·
`840ccdc1` tabela por fazenda também vira média ·
`8db0b7e9` linha Produtiva · `9979933d` remove faixa, devolve "ha" ·
`cea2082a` card único de Área · `86580a49` "(ha)" no cabeçalho ·
`11fc5e84` tabela produtiva por fazenda

### Operações de dado (runbooks em `docs/runbooks/`)
- **PR-1b** — backfill de `grupo_custo`, 465 registros, R$ 33,5 mi
- **Silvicultura** — 34 subcentros no plano + 15 lançamentos de eucalipto
  migrados + 6 `escopo_negocio` limpos
- **Transferências** — 3.050 registros, R$ 200,1 mi

Todas executadas pela sessão de chat via Management API, NÃO pelo Code.

---

## PARTE 2 — O BANCO FICOU SEM ÓRFÃO INEXPLICADO

Órfãos (`grupo_custo IS NULL`, não cancelados): **3.631 → 116**.

Os 116 restantes são TODOS explicados:
- **110** OFX aguardando enriquecimento — extrato não traz plano de contas
- **6** `macro_custo='Dividendos'` — exceção deliberada da migration
  `20260625` (B1): dividendos são exclusivos por cliente, fora do plano global

### O mecanismo, para quem investigar de novo
O front NUNCA grava `grupo_custo` — `buildInsertRow` (`useFinanceiroV2.ts`)
não inclui o campo. Quem preenche é o trigger
`trg_resolve_classificacao_plano`, via `financeiro_plano_contas` por
`subcentro` + `tipo_operacao` + `ativo`. Por isso `plano_conta_id` nulo e
`grupo_custo` nulo andam 100% juntos.

O vazamento foi tampado em 25/06 pela B1. Os 465 do PR-1b nasceram na
janela 20–28/04/2026, com o trigger provavelmente desabilitado num bulk insert.

---

## PARTE 3 — SILVICULTURA

34 subcentros no plano (faixa `ordem_exibicao` 20000+,
`escopo_negocio='silvicultura'`), 7 grupos novos.

**Decisões de produto:**
- **Formação de floresta CAPITALIZA**: `Investimento Silvicultura` com
  `compoe_dre = false`, divergindo do padrão do plano. Plantio não é despesa
  do exercício — sem isso, o ano do plantio afunda e o do corte infla.
  Base: eucalipto é ativo biológico sob CPC 29; sem valor justo confiável,
  a norma permite custo como base.
- **`Venda de Madeira` NÃO migrou** — pecuária também vende madeira.
- **`Receita de Arrendamento Florestal`** — caso Sta. Luzia: a terra é do
  cliente, a floresta é de terceiro. Custo zero ali é o MODELO, não lacuna.
- **O tipo `Escopo` do código NÃO foi tocado.** Entra só por `grupo_custo`.

**Limitação declarada:** resultado silvícola exige EXAUSTÃO, que depende de
inventário florestal por talhão e idade — inexistente. A DRE silvícola é
declaradamente incompleta, não errada.

---

## PARTE 4 — A VISÃO GERAL FECHOU EM CONTEÚDO

**Esquerda:** Área (donut + Total + Produtiva + tabela por fazenda) ·
Produção · Eficiência (5 tiles + tabela produtiva por fazenda).
**Direita:** Caixa · Financeiro Produtivo · Estrutura Financeira ·
Disponível em conta.
**Acima:** faixa de status · régua de 12 meses.

Falta apenas **Atenções** — depende de decidir quais alertas existem.

### Regras de layout
- **Bloco novo vai DENTRO de uma das duas colunas, nunca como irmão do
  grid.** Pendurar `<SectionBlock>` direto no `grid-cols-5` reintroduz o
  alinhamento por linha e o vão volta, sem erro aparecendo.
- **O miolo do `SectionBlock` é `grid grid-cols-2`.** Conteúdo que não é
  tile precisa de `col-span-2` no wrapper.
- **Duas bases de percentual, declaradas:** as quatro famílias dividem por
  `soma` (composição interna); Total e Produtiva por `areaTotal` (uso da
  matrícula). Produtiva PODE passar de 100% — não truncar.
- **Área é ESTOQUE: nunca soma.** Em `viewMode='periodo'` mostra MÉDIA dos
  meses com snapshot. Mês sem snapshot é ausência, não zero.
- **Linha zerada não renderiza.** Decisão de 21/08: esconder zero em vez de
  agrupar linhas com conteúdo, que apagaria a leitura por atividade.
- **Duas tabelas se conferem contra o próprio agregado** — área e produtiva.
  É o padrão a manter em tabela nova.

### O caso Vera Ligia — caso de teste obrigatório
3 Muchachas tem `Arrendamento - Baldasso`, 50 ha de terceiro, vigência
jul–ago/2026. A produtiva (1.808) excede a matrícula (1.758).

O card diz o mesmo fato de três formas: `Produtiva 102,8%`, legenda somando
1.808 contra Total 1.758, e "Área além da matrícula: 50,00 ha".

**REGRA:** validar mudanças de área SEMPRE com um cliente que tenha
excedente, além do NJ. `soma` e `areaTotal` coincidem em todo cliente sem
arrendamento de terceiro — caso de teste que concorda com duas hipóteses não
distingue nenhuma.

---

## PARTE 5 — BASELINE TSC: 89 → 79

Caiu ao adicionar colunas em `useFechamentoArea.ts`.
`fechamento_area_snapshot` NÃO está em `types.ts`; sem o tipo, `.from()`
resolve para `SelectQueryError` e cada coluna lida vira TS2339.

**O idioma do repo são DOIS casts, não um:**
```ts
const q = (supabase
  .from('tabela' as any)
  .select('...') as any)   // ← o segundo elimina o branch de erro
  .eq(...)
```
Só no nome da tabela apenas TROCA a mensagem — medido: 89 → 92, não 82.
Com os dois, o arquivo foi a zero e saíram 10 erros (7 TS2339 + 2 TS2345 +
1 TS2769, mesma raiz).

**Conferir `types.ts` ANTES de escrever query de tabela nova.**
Fora do types: `fechamento_area_snapshot`, `zoot_mensal_cache`.
Dentro: `financeiro_saldos_bancarios_v2`, `financeiro_contas_bancarias`,
`vw_zoot_fazenda_mensal`.

---

## PARTE 6 — QUATRO FONTES DE ÁREA

`vw_zoot_fazenda_mensal` carrega `area_produtiva_ha` PRÓPRIA, divergente do
snapshot oficial:

  Pureza jul/2026 — view **4.726 ha** | snapshot produtiva **3.595 ha**

E a `lotacao_ua_ha` dela sai daí: **0,73** contra **0,96** calculada com a
área oficial. A lotação da view NÃO reconcilia com o UA/ha 0,86 do Global.

**REGRA:** ao ler essa view, usar APENAS o que é zootécnico
(`cabecas_final`, `gmd_kg_cab_dia`, `ua_media`). Área vem de
`fechamento_area_snapshot`; lotação é RECALCULADA. Documentado em
`useProdutivoPorFazenda.ts`.

### GMD do Total: travessão por decisão, não por falta
A ponderação por cabeça daria número próximo mas DIFERENTE do tile acima —
numa tabela feita para reconciliar, isso é pior que não mostrar. Se um dia
for calculado, a fórmula é `gmd_numerador_kg ÷ (cabeças × dias)`, a mesma da
view — nunca média das fazendas.

---

## PARTE 7 — `p.ativo` É O ESTADO DE HOJE, NÃO O DA ÉPOCA

Quatro pastos desativados têm histórico fechado:

| fazenda | pasto | área | cards | período |
|---|---|---:|---:|---|
| Faz. Sta. Rita | 25A / 25 / 24 | **NULL** | 70 cada | 2020-01 → 2026-03 |
| Faz. Bom Retiro | Geral | 800 ha | 25 | 2022-01 → 2024-01 |

**O dano é de visualização, não de área** — os snapshots históricos estão
corretos (Bom Retiro com 800 ha de pecuária em 2022–2023). O que quebra é
que as telas filtram `ativo` e escondem o pasto ao consultar o passado.

**NÃO CORRIGIR reativando o pasto.** Medido: das **29 funções do banco que
tocam `pastos`, ZERO usa `data_fim`** (3 usam `data_inicio`). O campo de
vigência é decorativo do lado do banco. Reativar o `Geral` com
`data_fim='2024-01-31'` faria o sistema enxergar 800 ha de recria ATIVOS
hoje — pior que o problema.

A correção é na regra, junto com a frente de `tem_pecuaria`.

**Agravante:** os 3 pastos da Sta. Rita têm `area_produtiva_ha` NULL e
fecham cards há seis anos. Em março/2026 a fazenda conta 71 cards para 68
pastos ativos.

**Bom Retiro tem snapshot de área em 2026 sem fechar cards desde jan/2024** —
7 meses de snapshot em 2026, último card em jan/2024. Não investigado.

---

## PARTE 8 — PENDÊNCIAS

### Precisa de decisão
- **Atenções** — último bloco da Visão Geral
- **Agrupamento do Caixa em 7 linhas** (mockup) — recomendação: NÃO fazer.
  As separações que sumiriam custaram decisões desta sessão

### Registrado, não aberto
- Modal `areaProdutivaPec` órfão: JSX, 4 useMemo e série de 7 anos sem
  `setModalIndicador` que os alcance. `noUnusedLocals` desligado
- 15 casos de `escopo_negocio` divergente do plano
- Regeneração de `types.ts` — resolveria a dívida de casts na raiz
- `fn_natureza_patrimonial_fazenda` não conhece `eucalipto`
- Saídas não têm linha residual. **Falta FASE 0**: não medi se existe custo
  fora dos grupos oficiais
- **Bug do preço de venda divergindo entre filtros de ano** — FASE 0 parcial:
  achei duas divergências reais (fallback de `peso_medio_arrobas` ausente no
  caminho do ano anterior; filtro de cenário diferente), mas as duas são
  INERTES hoje. **O bug de ~5,4% NÃO foi reproduzido — falta caso concreto**

---

## PARTE 9 — MEUS ERROS

1. **Cinco afirmações sobre o banco sem conferir um filtro**: `data_pagamento`
   no lugar de `created_at`; `conta_bancaria_id` sem `conta_destino_id`; join
   do plano por cliente quando o plano é global; "os 3.050 vão aparecer na
   linha Não classificado" (são transferências); competência sem filtrar
   `cancelado` (dois lançamentos de TESTE criaram um "resíduo de R$ 11.696"
   inexistente)
2. **Dois gates previstos errado** — tratei o TSC como consequência do
   código, não como contrato que exige FASE 0 própria
3. **Briefing contra PR não executado** — encadeei o CARD-UNICO em cima do
   PERIODO-01 que eu tinha enviado mas não fora rodado
4. **Contradição de base num briefing** — justifiquei com `soma` e validei
   com `areaTotal`; passou porque o NJ não distingue os dois
5. **Rollbacks por janela de tempo** — precisos no dia, destrutivos em duas
   semanas
6. **Gate pedindo 3 arquivos quando o corpo declarava 4**

**Padrão:** o Code mediu e corrigiu em todos os casos. Com o banco na mão,
medir antes custa uma query.

---

## PARTE 10 — REGRAS REFORÇADAS

- **Um briefing por vez.** Se antecipar, marcar EXPLICITAMENTE qual PR ele
  pressupõe
- **Briefing contra o HEAD do envio**, sempre. E não citar indentação —
  o alvo é o conteúdo
- **Rollback com filtros de conteúdo + contagem esperada como trava.**
  Janela de tempo apodrece
- **Toda operação de dado vira runbook no repo, com autoria da execução**
- **Conferir `types.ts` antes de query de tabela nova**
- **Validar área com cliente que tenha excedente, além do NJ**
- **Campo que existe não é campo que funciona** — `data_fim` está na tabela
  e não é lido por nenhuma das 29 funções
- **Número quase certo é pior que travessão** numa tabela de reconciliação

---

## PARTE 11 — FERRAMENTAL

**Token do Management API expira ~30 min.** Renovar abrindo segunda aba para
`/sql/new`, esperar ~5s, reler `localStorage` na aba original. Nunca
recarregar a original.

**API do GitHub tem rate limit** sem autenticação. Para ler arquivos,
`raw.githubusercontent.com` com SHA fixo; para varrer o repo, tarball via
`codeload.github.com`.

---

## ADENDO — ÚLTIMA HORA (18h–19h)

Proto `11fc5e84` → `64c8c412`.

### PRs
- `04d8d457` hierarquia tipográfica no Caixa + rótulos "Receitas …"
- captação por escopo em 4 linhas + linhas zeradas ocultas + título por modo
- `86580a49` "(ha)" no cabeçalho da tabela por fazenda
- `11fc5e84` tabela produtiva por fazenda
- `64c8c412` tabela "Pecuária" no card de Área, com desfrute, GMD no Total,
  média/período, e Área+Caixa alinhados

### Captação: 4 subcentros, não 3
`Aporte Pessoal` (R$ 26,9 mi) e `Retorno de Empréstimos` (R$ 2,4 mi) NÃO têm
escopo — somam R$ 29,3 mi e precisam de linha própria ("Aportes e outras").
Os quatro predicates PARTICIONAM `isEntradaFinanceira`; há verificação de
fechamento na tela que acusa se um subcentro novo escapar do mapa.

### Linha zerada não renderiza
Decisão: esconder zero em vez de agrupar linha com conteúdo. Agrupar
"Receitas (Pec. Agri. Silv.)" apagaria da tela a atividade que ganhou 34
subcentros no plano. Custo aceito: o operador não vê a categoria quando ela
está zerada.

### GMD: consumir, nunca calcular
MEDIDO: `56.887,99 ÷ (5.165 × 31)` = 0,355, mas a view diz 0,378 — o
denominador do GMD NÃO é cabeças finais. O Total da tabela consome
`gmdIndicador` do PC-100, o MESMO objeto do tile. Bate por construção.

**Regra geral que isso estabeleceu:** o Total de tabela por fazenda consome
os indicadores do PC-100; as LINHAS vêm do hook. Nunca recalcular o
agregado.

### Desfrute (@) — definição nova
`@ vendidas ÷ @ iniciais`, onde @ iniciais = `peso_inicio_kg / 30` e
@ vendidas = desfrutes pela regra oficial da arroba (carcaça/15 no abate,
peso vivo/30 nos demais). Medido: Pureza 4,3%, Sto. Expedito 0,0%.
NÃO confundir com `desfruteIndicador` do PC-100, que é em CABEÇAS.

### Item 8 — cards alinhados, decisão consciente
Área e Caixa voltaram a ser filhos diretos do grid (`col-span-3`/`col-span-2`),
revertendo parcialmente `e948a653`. Custo aceito: o card mais baixo ganha
branco embaixo. Em escopo de fazenda específica as duas tabelas não
renderizam e o branco troca de lado.

---

## DOIS ACHADOS DE DADO (não corrigidos)

### 1. Bom Retiro — correção de um erro meu neste handoff
A PARTE 7 afirma que a Bom Retiro parou de fechar em jan/2024. **ERRADO.**
Ela tem cards em TODOS os meses de 2026 e 31 snapshots desde 2024.

O que acabou em jan/2024 foram os cards do pasto `Geral` (recria). De
fev/2024 em diante os cards são do pasto `Eucalipto`. A fazenda migrou de
recria para silvicultura e continua fechando normalmente.

Minha query anterior agrupava por pasto e eu li o fim de um pasto como o fim
da fazenda. **Sexto erro do mesmo tipo na sessão.**

O que permanece verdadeiro da PARTE 7: o pasto `Geral` está inativo e seu
histórico some das telas de pasto ao consultar 2022–2023.

### 2. Santa Rita — 212 ha de reserva viraram cria em maio
Pasto **`P_24 Reserva`**, 212,00 ha, cadastrado como `reserva`.
Fechou como `reserva` em abril; **como `cria` de maio a julho**.

| | abril | maio → julho |
|---|---:|---:|
| Pecuária (snapshot) | 2.778,25 | 2.990,25 |
| Reserva (snapshot) | 740,12 | 528,12 |

`2.778,25 + 212 = 2.990,25` e `740,12 − 212 = 528,12`. Fecha exato.

**Nada quebrado no software.** `tipo_uso_mes` existe para isso, e o tipo
efetivo é `COALESCE(tipo_uso_mes, p.tipo_uso)` — fechamento vence cadastro,
que é a regra correta.

**Decisão de negócio pendente:** ou o cadastro está desatualizado (a área
deixou de ser reserva), ou o fechamento está errado nos últimos três meses
(reserva legal virou pecuária no papel). O nome do pasto sugere a segunda,
mas nome não é evidência.

O sistema está mostrando a divergência — cadastro diz uma coisa, fechamento
diz outra, as duas visíveis. É o comportamento desejado.
