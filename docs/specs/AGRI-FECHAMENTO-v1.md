# SPEC — FECHAMENTO AGRICOLA v1 + PATRIMONIO-01

Status: CONGELADA em 06/09/2026 (Gabriel + Claude Chat arquiteto)
Escopo: desenho de modelo, ordem de execucao e decisoes de produto.
Nao contem migration nem briefing. Cada PR abaixo recebe briefing proprio
na sua vez. Nada aqui entra na fila antes de ENVELOPE 114/115 fecharem.

Regra soberana: um dado, um dono. Nenhuma tela recalcula o que ja tem dono.
Ausencia e traco, zero e valor. Divergencia e informacao, nunca ajuste.

---

## 0. DECISOES TOMADAS (06/09/2026)

| # | decisao |
|---|---|
| D1 | Fechamento agricola e SEMPRE por safra. Ano civil so consolida (fiscal). |
| D2 | Cultura e coluna em `financeiro_safras`. `codigo` continua como rotulo. |
| D3 | Plano de contas por natureza do gasto. Etapa, operacao, talhao, OS, maquina, operador: fora da v1. |
| D4 | Investimento na Fazenda sai do resultado operacional e entra no patrimonio. Vale pecuaria e agricultura. Depende de PATR-02. |
| D5 | Correcao de solo: area ja em producao = custeio; area nova (primeira safra) = investimento. |
| D6 | v1 entrega COE. COT/CT (depreciacao no resultado, pro-labore, custo de oportunidade) e frente posterior, para os dois escopos. |
| D7 | Depreciacao linear, calculada, nunca gravada. Vida util por categoria (item 5). |
| D8 | Rateio de maquina compartilhada: proporcao do combustivel lancado por escopo no periodo; fallback = percentual fixo do cadastro do bem. Unico rateio do sistema. |
| D9 | Mandioca raiz: unidade t, indicadores t/ha e R$/t. Nunca saca equivalente. |
| D10 | Terra fica fora do patrimonio nesta versao. Decisao separada. |

---

## 1. ESTADO MEDIDO EM 06/09/2026 (banco proto, cliente NJ)

- `financeiro_plano_contas`: 197 linhas. Escopos: pecuaria 70, agricultura 53,
  silvicultura 35, administrativo 31 global + 8 por cliente. O .md do
  Knowledge (137 linhas) esta DEFASADO: nao conhece silvicultura, nao tem
  10020 Participacao de Parceiro na Safra, ordens 130x0 divergem.
  Acao: regerar o .md a partir do banco. Nunca editar a mao.
- `compoe_dre`: Entrada/Saida Financeira false (correto). Investimento na
  Fazenda TRUE nos 19 subcentros (10 pec + 9 agri): investimento cai
  integral no resultado. E o que D4 corrige.
- `financeiro_safras`: id, cliente_id, nome, codigo, descricao, observacoes,
  ativa, ordem_exibicao, escopo_negocio. SEM cultura, SEM datas.
- `financeiro_lancamentos_v2`: tem fazenda_id, escopo_negocio, safra_id.
  SEM quantidade, unidade, area. Dado fisico nao tem onde morar.
- Nenhuma tabela agri_*, talhao, colheita, cultura, lavoura.
- Safra 25/26-AMD (NJ): 687 lancamentos. 444 SEM plano de contas
  (R$ 8,25 mi realizados). Composicao dos 444:
    armazem (construcao, maquinario, infra, MO)   50   R$ 3.679.674
    venda de amendoim                             14   R$ 2.482.338
    diesel lavoura                                10   R$   200.296
    outros                                       370   R$ 1.888.014
  Receita real da safra ~R$ 2,8 mi; o DRE hoje le R$ 319 mil (11%).
  Descricoes "Venda Amendoim xxx sc": quantidade de sacas e placeholder.
- 41 lancamentos em "Juros de Financiamento Agricultura" na 25/26-AMD:
    15 x R$ 612.000 "Juros Armazem / Maquinas Amendoim Atualizar",
       vencimentos 01/10/2026 a 2040, competencia toda em 21/11/2025,
       criados em 21/04/2026. Cronograma inteiro, principal+juros juntos.
    20 x "Juros Recuperacao de Solo Atualizar", R$ 559.532, mesmo padrao.
     6 x "Construcao Armazem - Dif Aliquota NF", R$ 7.144: ICMS da obra,
       e custo do armazem, nao juros.
  Efeito: 15 anos de divida dentro da safra 25/26 e do DRE de nov/2025.
- 1 lancamento "Outras Desp. Administrativas Pecuaria" dentro da 25/26-AMD
  (escopo do plano contradiz escopo da safra).
- Area validada (snapshot): Pureza 279 ha agricultura, Retiro 50 ha.
- Safra mandioca 25/26-MAND: 33 lancamentos, R$ 405.525, 3 com plano.

---

## 2. MODELO DE DADOS

### 2.1 financeiro_safras — colunas novas

    cultura      text  NULL  check (cultura in ('amendoim','mandioca',
                             'milho','soja','cana','outras'))
                             -- NULL quando escopo_negocio = pecuaria
    data_inicio  date  NULL
    data_fim     date  NULL  -- jul-jun hoje e convencao; vira dado

Backfill: cultura pelo sufixo do codigo (AMD -> amendoim, MAND -> mandioca).
Medir antes: todas as safras de todos os clientes, nao so NJ.
Dono de: cultura. Ninguem mais deduz cultura de string.

### 2.2 agri_safra_area — area por safra x fazenda

    id, cliente_id, fazenda_id, safra_id
    area_plantada_ha   numeric(10,2) NOT NULL
    area_colhida_ha    numeric(10,2) NULL      -- preenche na colheita
    data_plantio       date          NULL
    primeira_safra     boolean NOT NULL default false
                       -- true = area nova (regra D5)
    observacao text, created_at, updated_at
    UNIQUE (safra_id, fazenda_id)
    RLS por cliente_id. SECDEF nas RPCs, grants so authenticated.

Dono de: hectares. Todo indicador /ha le daqui.
Snapshot de area validado = area DISPONIVEL da fazenda.
agri_safra_area = area PLANTADA na safra. Diferenca = area ociosa,
informacao na tela, nunca ajuste. Modulo Oficial de Areas segue em BACKLOG.

### 2.3 agri_colheita — producao fisica por entrega

    id, cliente_id, fazenda_id, safra_id
    data            date NOT NULL
    unidade         text NOT NULL check (unidade in ('t','kg','sc'))
    peso_bruto      numeric(12,3) NOT NULL
    desconto        numeric(12,3) NOT NULL default 0
                    -- umidade + impureza + qualidade, somados
    peso_liquido    numeric(12,3) GENERATED ALWAYS AS (peso_bruto - desconto)
    destino         text NULL check (destino in ('venda','estoque',
                    'consumo','perda'))
    documento_id    uuid NULL   -- NF/romaneio quando existir
    lancamento_id   uuid NULL   -- receita correspondente, quando venda
    observacao text, created_at, updated_at

Dono de: toneladas/sacas. Todo indicador /t e /sc le daqui.
Conversao sc<->kg parametrizada por cultura, nunca chumbada.
Estoque de produto = soma(destino = estoque) - saidas posteriores.
Mandioca raiz nao tem estoque (perecivel): destino venda ou perda.

### 2.4 patrimonio_bens — PATRIMONIO-01 (so maquinas, implementos, veiculos)

    id, cliente_id, fazenda_id
    descricao            text NOT NULL
    categoria            text NOT NULL check (categoria in ('trator',
                         'colhedora','implemento','veiculo','irrigacao',
                         'outros'))
    escopo_negocio       text NOT NULL check (escopo_negocio in
                         ('pecuaria','agricultura','compartilhado'))
    pct_agricultura      numeric(5,2) NULL  -- fallback do rateio (D8),
                                            -- obrigatorio se compartilhado
    data_aquisicao       date NOT NULL
    valor_aquisicao      numeric(14,2) NOT NULL
    vida_util_anos       integer NOT NULL
    valor_residual       numeric(14,2) NOT NULL default 0
    lancamento_id        uuid NULL   -- compra, quando lancada
    data_baixa           date NULL
    valor_baixa          numeric(14,2) NULL
    lancamento_baixa_id  uuid NULL   -- venda do bem
    ativo boolean NOT NULL default true

Depreciacao mensal = (valor_aquisicao - valor_residual)
                     / vida_util_anos / 12
Calculada em view/RPC. Nunca gravada.

Benfeitorias (cerca, curral, instalacao, rede, formacao de pasto/area):
SEM cadastro item a item. View sobre financeiro_lancamentos_v2 agrupada
por fazenda_id x subcentro x ano de competencia, com vida util do
subcentro (2.5). Custo historico menos depreciacao acumulada.

### 2.5 financeiro_plano_contas — coluna nova

    vida_util_anos  integer NULL  -- so nos subcentros de
                                  -- Investimento na Fazenda (9xxx, 14xxx)

Vidas uteis APROVADAS (Gabriel, 06/09):

| categoria | anos | residual |
|---|---|---|
| cercas | 10 | 0 |
| curral, instalacoes, barracao, armazem | 20 | 0 |
| rede eletrica | 15 | 0 |
| rede hidraulica | 10 | 0 |
| formacao de pasto | 8 | 0 |
| formacao de area agricola | 10 | 0 |
| correcao de solo (formacao) | 4 | 0 |
| trator | 10 | 20% |
| colhedora | 10 | 15% |
| implemento | 8 | 0 |
| caminhonete / veiculo | 5 | 40% |
| treinamento, eventos, uniformes, EPI | 1 | 0 (despesa do ano) |

Residual de maquina vai no cadastro do bem (2.4), nao no plano.

### 2.6 Subcentros novos — APROVAR antes de qualquer migration

| ordem | centro | subcentro | escopo | dre | lcdpr |
|---|---|---|---|---|---|
| 2070 | Venda Producao | Venda de Mandioca | agricultura | sim | conforme padrao 20x0 |
| 13130 | Insumos | Corretivos de Solo Agricultura | agricultura | sim | conforme padrao 130x0 |

Nao propostos: Manivas (usa Sementes Agricultura). Farinha, fecula,
mandioca de mesa: so quando houver lancamento real. Bonificacao de
qualidade: so quando houver lancamento real.

### 2.7 Regra de consistencia escopo x safra (trigger, fase 2)

Se safra_id nao nulo: escopo_negocio da safra = escopo_negocio do
plano_conta. Excecao: plano administrativo aceita qualquer safra.
Medir os casos existentes em todos os clientes ANTES de ligar.
Coluna etapa_id: NAO na v1. So depois de AGRI-00.

---

## 3. LEITURA — DRE, INDICADORES, TRES ANCORAS

### 3.1 DRE por safra (agricultura), por cultura x fazenda

    Receita  (Venda Producao 20x0)
    - Deducoes (10010, 10020)
    = Receita liquida
    - Custo Variavel Agricultura (13xxx)
    - Custo Fixo Agricultura (11xxx)
    - Juros de Financiamento Agricultura (12010)  -- so juros de verdade
    = RESULTADO OPERACIONAL (COE)
    - Investimento na Fazenda (14xxx)             -- linha SEPARADA (D4)
    = Resultado apos investimentos

Indicadores: /ha vem de agri_safra_area; /t ou /sc vem de agri_colheita.
Sem area ou sem colheita: traco. Nunca zero, nunca fallback.

Formulas (unica fonte, em lib/calculos, mesmo padrao de abate.ts):
    produtividade      = peso_liquido_total / area_colhida_ha
    custo_ha           = custeio_safra / area_plantada_ha
    custo_unidade      = custeio_safra / peso_liquido_total
    receita_ha         = receita_liquida / area_colhida_ha
    resultado_ha       = resultado_operacional / area_colhida_ha
    preco_equilibrio   = custeio_safra / peso_liquido_total
    produtiv_equilibrio = custo_ha / preco_medio_liquido_unidade

### 3.2 Posicao Patrimonial (cliente, data)

    Rebanho                    P1 (ja existe, dono: fechamento pecuario)
    + Maquinas                 patrimonio_bens: aquisicao - depr. acumulada
    + Benfeitorias             view 2.4: lancamentos 9xxx/14xxx - depr.
    + Estoque produto agricola agri_colheita destino=estoque, a P0
    + Lavoura em formacao      custeio da safra aberta ate a data
    Terra: fora (D10).

### 3.3 DRE ano civil do cliente (fiscal, consolida pecuaria + agricultura)

Agricultura entra em duas linhas:
  (a) resultado das safras encerradas no ano
  (b) variacao de lavoura em formacao (31/12 vs 31/12 anterior)
(b) e o VPB agricola. Mesma matematica do rebanho.

### 3.4 Rateio de maquina compartilhada (D8)

Depreciacao do mes do bem compartilhado divide-se na proporcao de
Combustivel Maquinas Pecuaria x Combustivel Maquinas Agricultura
lancados no mes, por fazenda. Se um dos dois for zero ou ausente,
usa pct_agricultura do cadastro. A tela mostra o percentual e a origem
("70% agricultura porque 70% do diesel foi agricultura") antes de aceitar.

---

## 4. ORDEM DE EXECUCAO (fila do Code, apos ENVELOPE 114/115)

| PR | conteudo | migration | depende |
|---|---|---|---|
| AGRI-00 | Saneamento NJ 25/26-AMD: 74 grandes (armazem, venda, diesel) + 41 juros + 1 escopo cruzado. TELA, nao migration. 370 pequenos esperam FIN-SAFRA-01. | nao | contrato do armazem conferido |
| AGRI-01 | cultura + data_inicio + data_fim em financeiro_safras + backfill | sim | — |
| AGRI-02 | agri_safra_area + tela (safra x fazenda) | sim | AGRI-01 |
| AGRI-03 | agri_colheita + tela | sim | AGRI-01 |
| AGRI-04 | DRE por safra + indicadores /ha /t /sc | nao | AGRI-02, 03 |
| PATR-01 | patrimonio_bens + vida_util_anos no plano + view benfeitorias | sim | — |
| PATR-02 | Posicao Patrimonial com as 5 linhas | nao | PATR-01, AGRI-03 |
| AGRI-05 | Investimento fora do resultado operacional (D4) | nao | PATR-02 |
| PLANO-01 | 2070 Venda de Mandioca + 13130 Corretivos de Solo + regerar .md | sim | GO Gabriel |

Depois da v1: etapa_id no lancamento, COT/CT, talhao, Modulo Oficial de
Areas, trigger 2.7.

Saneamento dos 41 juros (AGRI-00), regra:
  cada parcela do cronograma vira DUAS linhas:
    amortizacao (16010, compoe_dre false) + juros (12010, compoe_dre true)
  competencia = ano do vencimento; safra = so a safra do ano do vencimento
  os 6 "Dif Aliquota" -> 14020 Investimento Instalacoes Agricultura

---

## 5. FORA DA v1, DE PROPOSITO

- Ordem de servico, horimetro, operador, talhao, OS por operacao.
- Subcentro por etapa (preparo, plantio, tratos, colheita detalhados).
- Valor justo de lavoura (CPC 29 pleno). Custo historico basta.
- Rateio automatico pecuaria x agricultura fora de maquina. Escopo e
  escolha de quem lanca.
- Saca equivalente para mandioca.
- Depreciacao dentro do resultado (COT). Entra com a frente COT/CT.
- Terra no patrimonio.

---

## 6. ADENDO 10/09/2026 — decisoes que alteram o item 0

### D11 — Talhao volta (revoga a parte de D3 que o excluia)

Em 30/07 o Gabriel ja tinha decidido talhao como unidade minima de custo e
producao (planilha v2 do NJ; acerto com o parceiro Wilson, 40% sobre os
talhoes da parceria; conciliacao carga a carga com a Casul). A spec de
06/09 o excluiu por engano. Vale o desenho abaixo.

- Talhao e OBRIGATORIO em area plantada e em colheita.
- Talhao e OPCIONAL no lancamento financeiro. Quem sabe, marca; quem nao
  sabe, deixa vazio. Nunca trava o lancamento.
- Custo sem talhao se distribui, NA LEITURA, pelos talhoes da safra
  proporcional ao hectare plantado. A tela mostra direto e rateado em
  colunas separadas. Rateio nunca e gravado no lancamento (PR-RATEIO-01).

Modelo:

    agri_talhoes
      id, cliente_id, fazenda_id
      nome        text NOT NULL          -- "Talhao 05"
      area_ha     numeric(10,2) NOT NULL -- area fisica, nao muda por safra
      ativo       boolean default true
      UNIQUE (fazenda_id, nome)

    agri_safra_area   -> ganha talhao_id NOT NULL; UNIQUE (safra_id, talhao_id)
    agri_colheita     -> ganha talhao_id NOT NULL
    financeiro_lancamentos_v2 -> ganha talhao_id NULL (FIN-SAFRA-01)

Fila (substitui a tabela do item 4 no que conflita):
    AGRI-01  cultura + datas em financeiro_safras
    AGRI-01b agri_talhoes + tela de cadastro
    AGRI-02  agri_safra_area por talhao + tela
    AGRI-03  agri_colheita por talhao + tela
    o resto inalterado.

Saca de amendoim = 25 kg (conferido nos relatorios da Casul, OC_013).

### D12 — Plano de contas de lavoura (aprovado 10/09; substitui 2.6)

Mantem natureza do gasto. Nada de etapa/talhao/operacao como conta.

MOVER (3) — de Custo Fixo Agricultura para Custo Variavel Agricultura:
    11030 Combustivel Maquinas Agricultura   -> centro Operacoes Mecanizadas
    11120 Manutencao Maquinas Agricultura    -> centro Operacoes Mecanizadas
    13010 Armazenagem Agricola               -> centro Pos-Colheita (ja variavel)

CRIAR (9):
    2070  Receita Agricola › Venda Producao     Venda de Mandioca
    10030 Deducoes Agricultura › Impostos       Impostos e Despesas de Vendas Agricultura
    13130 Variavel › Insumos                    Corretivos de Solo
    13140 Variavel › Operacoes Mecanizadas      Servicos Mecanizados Terceirizados
    13150 Variavel › Mao de Obra Direta         Diaristas e Empreita Lavoura
    13160 Variavel › Pos-Colheita               Secagem e Beneficiamento
    13170 Variavel › Terra                      Arrendamento de Area Agricola
    13180 Variavel › Servicos                   Assistencia Tecnica Agricola
    13190 Variavel › Insumos                    Manivas e Material de Propagacao
Todos escopo agricultura, compoe_dre sim, gera_lcdpr conforme o padrao do
grupo. Ordens conferidas no banco em 10/09: sem colisao. O .md do Knowledge esta
com numeracao defasada; a migration referencia por nome de subcentro.

Fixo x variavel: se dobrar a area plantada e o gasto dobra, e variavel.
Diesel de preparo/plantio/tratos/colheita = variavel. Diesel de abertura
de area nova = investimento (formacao). Diesel de caminhonete/sede = fixo.
Na pecuaria combustivel e manutencao continuam em fixo (nao crescem com
cabecas). Fixo x variavel nao muda o resultado; muda custo/ha e ponto de
equilibrio.

DRE agricola resultante (item 3.1 passa a ter Margem Bruta):
    Receita liquida
    - Insumos / Operacoes mecanizadas / Mao de obra direta /
      Pos-colheita / Comercializacao / Terra, seguro, assistencia
    = MARGEM BRUTA (por ha e por talhao)
    - Custo fixo / Juros
    = RESULTADO OPERACIONAL (COE)
    - Investimentos (linha separada)
    = Resultado apos investimentos

Entrega: PLANO-01 (migration + regerar o .md do Knowledge a partir do
banco) sobe na fila: e pre-requisito do saneamento AGRI-00, nao a ultima.

### D13 — Card de Atividade no modal de lancamento

escopo_negocio ja existe no lancamento como copia do plano. Passa a ser
escolhido ANTES do subcentro: card "Atividade" com pilulas Pecuaria ·
Lavoura · Silvicultura · Administrativo, pre-selecionado pela ultima usada.
O combo de subcentro filtra pelo escopo escolhido. Administrativo nao
recebe safra (OC_013). Nenhuma coluna nova. Entra no FIN-SAFRA-01, que ja
mexe no mesmo modal.

### Regra de codigo registrada em 10/09 (EXPORT-FINANCEIRO-02)

Prop que alimenta tela e OBRIGATORIA. Opcional so quando a tela tem
comportamento definido sem ela. Duas falhas na mesma sessao (SELETOR-
PERIODO-02, EXPORT-FINANCEIRO-01) foram prop opcional que ninguem passou.
Registrar em docs/PADROES-UI.md no proximo PR que o tocar.
