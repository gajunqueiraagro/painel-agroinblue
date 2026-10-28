# Plano de Contas — AGROinBLUE

> **GERADO do banco em 22/10/2026 (após FIN-VISAO-GERAL-01: a coluna `grupo_fluxo`, migration `20261028111850`).
> Não editar à mão: migration primeiro, regeração depois.**
> ⚠ Exceção registrada: a linha **1155** (BOITEL-ABATE-PRODUTOR-01, 26/09/2026) foi acrescentada à mão a pedido
> do Gabriel, DEPOIS da migration `20261027154000` e conferida contra o banco (229 linhas, 221 globais). A próxima
> regeração a absorve sem diferença.
> ⚠ Idem para **3015 Adiantamento de Clientes** e **5005 Adiantamento a Fornecedores** (OC-VENDA-ENTREGAS-01b,
> 28/09/2026, migration `20261027167000`), no vão de Movimentações Financeiras, sem renumerar — conferido: 231 linhas,
> 223 globais.
> ⚠ Idem para **5006 Devolução de Adiantamento de Clientes** (OC-VENDA-ENTREGAS-01c, 28/09/2026, migration
> `20261027168000`), saída, sem bloco nem DRE, no mesmo vão — conferido: 232 linhas, 224 globais.
> ⚠ A **3016 Devolução de Adiantamento a Fornecedores** (OC-CONTA-CORRENTE-TODOS-01a, migration `20261027172200`) foi REMOVIDA
> pelo OC-CC-CLASSIFICACAO-01 (29/09/2026, migration `20261027173000`) sem nunca ter tido lançamento — conferido: 232 linhas,
> 224 globais.
> ⚠ **3015, 5005 e 5006 saem de uso** pelo OC-CC-CLASSIFICACAO-01: o recebimento/pagamento da OC conta corrente fica no subcentro
> da operação, fora do DRE pela parte da OC (ADR-2026-21, adendo). A migration de dado `20261027173100` devolve os 7 lançamentos
> delas à conta da operação e as DESATIVA (não apaga, não renumera) — aplicada em 29/09/2026 (registrada `20260929105100`).
> ⚠ Idem para as 4 **Alimentação e Cantina <atividade>** (P149, 28/10/2026, migration `20261028114000`): 6175 / 11165 / 20235 /
> 21105, no centro Mão de Obra, antes de Benefícios, no vão, sem renumerar; bloco "fixo" nas 4 (inclusive Silvicultura) — conferido:
> 254 linhas, 231 globais.

Fonte: `public.financeiro_plano_contas` no Supabase **proto** (`binbcdfbisgscrifztia`).
Hierarquia: **tipo de operação › macro custo › grupo de custo › centro de custo › subcentro**.
Dentro de cada grupo, as linhas saem em `centro a-z > subcentro a-z` — a mesma ordem que
`ordem_exibicao` materializa (PLANO-ORDEM-01).

> ⚠ **O PASSO DE 10 É IDEAL; `ordem_exibicao` É IDENTIFICADOR.** Subcentro novo entra no VÃO
> (5025, 1055), nunca renumerando os vizinhos. Medido em 23/09/2026: `fn_meta_calculada_pecuaria`
> cita `5030`, `1110`, `1120`, `1130`, `1140`, `1150`, `1010`, `1020`, `15010`, `15020`, `8045` e
> `8140` como LITERAIS, e `fn_dre_pecuaria` junta por `p.ordem_exibicao = c.ordem`. Renumerar faria
> a meta apontar para outro subcentro **sem erro nenhum** — o join acharia outra linha do plano.

> ⚠ **CLASSIFICAÇÃO = `plano_conta_id`** (DRE-CLASSIF-COPIA-01, 27/09/2026). Num lançamento, a chave é a
> única fonte; `macro_custo`, `grupo_custo`, `centro_custo`, `subcentro` e `escopo_negocio` são **cópias
> derivadas desta tabela por gatilho** (`resolve_classificacao_from_plano`, em todo INSERT e UPDATE) e
> **nunca se editam**: o que vier da tela é sobrescrito pela linha do plano. Mudar uma linha aqui propaga
> as cópias para os lançamentos da chave (`trg_propagar_plano_para_lancamentos`), sem marcar
> `editado_manual`. Texto sem linha no plano é recusado.
> **Exceção:** dividendo (`macro_custo = 'Dividendos'`) com texto fora do plano entra sem chave — são 376
> hoje. Ela sai quando as linhas por cliente forem criadas e os 376 ligados (pendência DIVIDENDOS-PLANO-01).

**250 linhas** (244 ativas): 227 globais (`cliente_id` nulo, valem para todos) e 23 de um cliente só, todas
no grupo Dividendos. A coluna **origem** diz qual é qual. (As exceções à mão registradas acima foram absorvidas por esta regeração.)

Legenda das colunas: **DRE** = `compoe_dre` · **LCDPR** = `gera_lcdpr` · **bloco** = `bloco_dre`
(a linha do DRE em que o valor cai) · **grupo VG** = `grupo_fluxo`, o grupo de análise da Visão Geral (FIN-VISAO-GERAL-01:
uma regra só, `fn_plano_grupo_fluxo`, que preenche linha nova; nulo só em 3-Transferências) · **ativo** = `ativo` · **—** = coluna
nula no banco, que aqui significa ausência de decisão, não `false`.

## 1-Entradas

### Entrada Financeira

#### Entradas de Capital

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 4010 | Capital | Aporte Pessoal | administrativo | não | — | — | Entradas de capital e financiamento | sim | global |
| 4020 | Capital | Retorno de Empréstimos | administrativo | não | — | — | Entradas de capital e financiamento | sim | global |
| 4030 | Financiamento | Entrada de Financiamento Agricultura | agricultura | não | — | — | Entradas de capital e financiamento | sim | global |
| 4040 | Financiamento | Entrada de Financiamento Pecuária | pecuaria | não | — | — | Entradas de capital e financiamento | sim | global |
| 4050 | Financiamento | Entrada de Financiamento Silvicultura | silvicultura | não | — | — | Entradas de capital e financiamento | sim | global |

#### Outras Entradas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 4005 | Ajustes | Estorno Recebido | administrativo | não | — | — | Outras entradas | sim | global |
| 3015 | Movimentações Financeiras | Adiantamento de Clientes | pecuaria | não | — | — | Outras entradas | não | global |
| 3025 | Movimentações Financeiras | Devolução de Adiantamento - Parceiro Lavoura | agricultura | não | — | — | Outras entradas | sim | global |
| 3020 | Movimentações Financeiras | Devolução de Adiantamento de Boitel | pecuaria | não | — | — | Outras entradas | sim | global |
| 3026 | Movimentações Financeiras | ICMS a Repassar - Devolvido | agricultura | não | — | — | Outras entradas | sim | global |

### Receita Operacional

#### Outras Receitas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 3010 | Financeiro | Rendimentos Financeiros | administrativo | sim | — | — | Receitas operacionais | sim | global |
| 3020 | Outros | Outras Receitas | administrativo | sim | — | — | Receitas operacionais | sim | global |

#### Receita Agrícola

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 2010 | Venda Ativos | Venda de Máquinas Agrícolas | agricultura | sim | — | receita | Receitas operacionais | sim | global |
| 2020 | Venda Produção | Venda de Amendoim | agricultura | sim | — | receita | Receitas operacionais | sim | global |
| 2030 | Venda Produção | Venda de Cana | agricultura | sim | — | receita | Receitas operacionais | sim | global |
| 2040 | Venda Produção | Venda de Mandioca | agricultura | sim | — | receita | Receitas operacionais | sim | global |
| 2050 | Venda Produção | Venda de Milho | agricultura | sim | — | receita | Receitas operacionais | sim | global |
| 2060 | Venda Produção | Venda de Outras Culturas | agricultura | sim | — | receita | Receitas operacionais | sim | global |
| 2070 | Venda Produção | Venda de Soja | agricultura | sim | — | receita | Receitas operacionais | sim | global |

#### Receita Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 1010 | Abates | Abates de Fêmeas | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1020 | Abates | Abates de Machos | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1030 | Arrendamento | Receita de Arrendamento de Pasto | pecuaria | sim | — | receita | Receitas operacionais | sim | global |
| 1040 | Venda Ativos | Venda de Máquinas Pecuária | pecuaria | sim | — | receita | Receitas operacionais | sim | global |
| 1050 | Venda Geral | Consumo Interno e Doações | pecuaria | sim | não | venda | Receitas operacionais | sim | global |
| 1055 | Venda Geral | Ganho com Mercado Futuro | pecuaria | sim | não | venda | Receitas operacionais | sim | global |
| 1060 | Venda Geral | Venda de Tropa | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1070 | Venda Insumos | Venda de Madeira | pecuaria | sim | — | receita | Receitas operacionais | sim | global |
| 1080 | Venda Insumos | Venda de Nutrição | pecuaria | sim | — | receita | Receitas operacionais | sim | global |
| 1090 | Venda Insumos | Venda de Outros Insumos | pecuaria | sim | — | receita | Receitas operacionais | sim | global |
| 1100 | Venda Insumos | Venda de Sêmen | pecuaria | sim | — | receita | Receitas operacionais | sim | global |
| 1110 | Venda Peso Vivo | Venda de Desmama Fêmeas | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1120 | Venda Peso Vivo | Venda de Desmama Machos | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1130 | Venda Peso Vivo | Venda de Fêmeas Adultas | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1140 | Venda Peso Vivo | Venda de Machos Adultos | pecuaria | sim | — | venda | Receitas operacionais | sim | global |
| 1150 | Venda Peso Vivo | Venda em Boitel | pecuaria | sim | — | venda | Receitas operacionais | sim | global |

#### Receita Silvícola

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 20010 | Arrendamento | Receita de Arrendamento Florestal | silvicultura | sim | — | — | Receitas operacionais | sim | global |
| 20020 | Venda Ativos | Venda de Máquinas Silvicultura | silvicultura | sim | — | — | Receitas operacionais | sim | global |
| 20030 | Venda Produção | Venda de Eucalipto | silvicultura | sim | — | — | Receitas operacionais | sim | global |
| 20040 | Venda Produção | Venda de Lenha e Carvão | silvicultura | sim | — | — | Receitas operacionais | sim | global |
| 20050 | Venda Produção | Venda de Madeira Silvicultura | silvicultura | sim | — | — | Receitas operacionais | sim | global |
| 20060 | Venda Produção | Venda de Outros Produtos Florestais | silvicultura | sim | — | — | Receitas operacionais | sim | global |

## 2-Saídas

### Custeio Produção

#### Custo Fixo Administrativo

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 21010 | Administração | Aluguel de Escritório | administrativo | sim | — | fixo | Custeio | sim | global |
| 21020 | Administração | Comunicação e Energia Escritório | administrativo | sim | — | fixo | Custeio | sim | global |
| 21030 | Administração | Contab. Jurídico e Consultoria | administrativo | sim | — | fixo | Custeio | sim | global |
| 21040 | Administração | Despesas de Escritório | administrativo | sim | — | fixo | Custeio | sim | global |
| 21050 | Administração | Materiais de Escritório | administrativo | sim | — | fixo | Custeio | sim | global |
| 21060 | Administração | Outras Despesas Administrativas | administrativo | sim | — | fixo | Custeio | sim | global |
| 21070 | Administração | Softwares Administrativos | administrativo | sim | — | fixo | Custeio | sim | global |
| 21080 | Administração | Viagens e Deslocamentos Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21090 | Financeiro | Despesas Financeiras Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21100 | Impostos | Taxas e Impostos Administrativos | administrativo | sim | — | fixo | Custeio | sim | global |
| 21105 | Mão de Obra | Alimentação e Cantina Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21110 | Mão de Obra | Benefícios e Premiações Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21120 | Mão de Obra | Rescisões e Acertos Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21130 | Mão de Obra | Salários e Encargos Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21140 | Máquinas | Combustível Veículos Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21150 | Máquinas | Manutenção Veículos Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |
| 21160 | Máquinas | Seguro e Impostos Veículos Administrativo | administrativo | sim | — | fixo | Custeio | sim | global |

#### Custo Fixo Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 11010 | Administração | Aluguel de Escritório Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11020 | Administração | Comunicação e Energia Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11030 | Administração | Contab. Jurídico e Consultoria Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11040 | Administração | Despesas Financeiras Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11050 | Administração | Materiais de Escritório Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11060 | Administração | Outras Desp. Administrativas Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11070 | Administração | Softwares Administrativos Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11080 | Administração | Viagens e Deslocamentos Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11090 | Impostos | Taxas e Impostos Fixos Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11100 | Manutenção Fazenda | Ferramentas e Equipamentos Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11110 | Manutenção Fazenda | Manutenção de Cercas Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11120 | Manutenção Fazenda | Manutenção de Instalações Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11130 | Manutenção Fazenda | Manutenção de Rede Elétrica Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11140 | Manutenção Fazenda | Manutenção Estradas Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11150 | Manutenção Fazenda | Manutenção Rede Hidráulica Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11160 | Manutenção Fazenda | Segurança Patrimonial Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11165 | Mão de Obra | Alimentação e Cantina Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11170 | Mão de Obra | Benefícios e Premiações Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11180 | Mão de Obra | Rescisões e Acertos Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11190 | Mão de Obra | Salários e Encargos Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |
| 11200 | Máquinas | Seguro Impostos Máquinas Agricultura | agricultura | sim | — | fixo | Custeio | sim | global |

#### Custo Fixo Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 6010 | Administração | Aluguel de Escritório Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6020 | Administração | Comunicação e Energia Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6030 | Administração | Contab. Jurídico e Consult. Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6040 | Administração | Despesas Financeiras Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6050 | Administração | Materiais de Escritório Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6060 | Administração | Outras Desp. Administrativas Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6070 | Administração | Softwares Administrativos Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6080 | Administração | Viagens e Deslocamentos Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6090 | Impostos | Taxas e Impostos Fixos Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6100 | Manutenção Fazenda | Despesas Casa Sede Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6110 | Manutenção Fazenda | Ferramentas e Equipamentos Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6120 | Manutenção Fazenda | Manutenção de Cercas Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6130 | Manutenção Fazenda | Manutenção de Estradas Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6140 | Manutenção Fazenda | Manutenção de Instalações Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6150 | Manutenção Fazenda | Manutenção de Rede Elétrica Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6160 | Manutenção Fazenda | Manutenção Rede Hidráulica Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6170 | Manutenção Fazenda | Segurança Patrimonial Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6175 | Mão de Obra | Alimentação e Cantina Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6180 | Mão de Obra | Benefícios e Premiações Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6190 | Mão de Obra | Rescisões e Acertos Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6200 | Mão de Obra | Salários e Encargos Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6210 | Máquinas | Combustível Máquinas Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6220 | Máquinas | Manutenção Máquinas Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6230 | Máquinas | Seguro, Impostos de Máquinas Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6240 | Outros | Custo com Tropa de Reprodução | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6250 | Outros | Custo com Tropa de Serviço | pecuaria | sim | — | fixo | Custeio | sim | global |
| 6260 | Outros | Outros Animais Pecuária | pecuaria | sim | — | fixo | Custeio | sim | global |

#### Custo Fixo Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 20210 | Administração | Outras Desp. Administrativas Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20220 | Impostos | Taxas e Impostos Fixos Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20230 | Manutenção Fazenda | Manutenção de Estradas e Aceiros Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20235 | Mão de Obra | Alimentação e Cantina Silvicultura | silvicultura | sim | — | fixo | Custeio | sim | global |
| 20240 | Mão de Obra | Benefícios e Premiações Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20250 | Mão de Obra | Rescisões e Acertos Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20260 | Mão de Obra | Salários e Encargos Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20270 | Máquinas | Combustível Máquinas Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20280 | Máquinas | Manutenção Máquinas Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |

#### Custo Variável Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 13010 | Financeiro | Seguro Agrícola Agricultura | agricultura | sim | — | pos_colheita | Custeio | sim | global |
| 13020 | Insumos | Corretivos de Solo | agricultura | sim | — | custeio | Custeio | sim | global |
| 13030 | Insumos | Defensivos Agrícolas Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13040 | Insumos | Fertilizantes Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13050 | Insumos | Manivas e Material de Propagação | agricultura | sim | — | custeio | Custeio | sim | global |
| 13060 | Insumos | Outros Insumos Agrícolas Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13070 | Insumos | Sementes Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13080 | Logística | Comercialização Agrícola Agricultura | agricultura | sim | — | pos_colheita | Custeio | sim | global |
| 13090 | Logística | Transporte Agrícola Agricultura | agricultura | sim | — | pos_colheita | Custeio | sim | global |
| 13100 | Mão de Obra Direta | Diaristas e Empreita Lavoura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13110 | Operações | Operações de Colheita Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13120 | Operações | Operações de Plantio Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13130 | Operações | Tratos Culturais Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13140 | Operações Mecanizadas | Combustível Máquinas Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13150 | Operações Mecanizadas | Manutenção Máquinas Agricultura | agricultura | sim | — | custeio | Custeio | sim | global |
| 13160 | Operações Mecanizadas | Serviços Mecanizados Terceirizados | agricultura | sim | — | custeio | Custeio | sim | global |
| 13170 | Pós-Colheita | Armazenagem Agrícola Agricultura | agricultura | sim | — | pos_colheita | Custeio | sim | global |
| 13180 | Pós-Colheita | Secagem e Beneficiamento | agricultura | sim | — | pos_colheita | Custeio | sim | global |
| 13190 | Serviços | Assistência Técnica Agrícola | agricultura | sim | — | custeio | Custeio | sim | global |
| 13200 | Terra | Arrendamento de Área Agrícola | agricultura | sim | — | custeio | Custeio | sim | global |

#### Custo Variável Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 8010 | Comercial | Despesas Comerciais Pecuária | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8020 | Identificação | Brincos de Identificação | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8030 | Identificação | Outros Itens de Identificação | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8045 | Nutrição | Nutrição | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8040 | Nutrição | Nutrição Cria | pecuaria | sim | — | variavel | Custeio | não | global |
| 8050 | Nutrição | Nutrição Engorda | pecuaria | sim | — | variavel | Custeio | não | global |
| 8060 | Nutrição | Nutrição Recria | pecuaria | sim | — | variavel | Custeio | não | global |
| 8070 | Pastagem | Custo com Arrendamento de Pasto | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8080 | Pastagem | Manutenção de Pasto | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8090 | Reprodução | Outros Serviços de Reprodução | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8100 | Reprodução | Sêmen e IATF | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8110 | Reprodução | Veterinário Reprodução | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8120 | Sanidade | Outros Serviços de Sanidade | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8130 | Sanidade | Vacinas e Vermífugos | pecuaria | sim | — | variavel | Custeio | sim | global |
| 8140 | Transferências | Transferência de Gado entre Fazendas | pecuaria | sim | — | variavel | Custeio | sim | global |

#### Custo Variável Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 20410 | Arrendamento | Custo com Arrendamento Florestal | silvicultura | sim | — | — | Custeio | sim | global |
| 20420 | Colheita | Corte e Baldeio | silvicultura | sim | — | — | Custeio | sim | global |
| 20430 | Colheita | Serviços de Terceiros Colheita | silvicultura | sim | — | — | Custeio | sim | global |
| 20440 | Insumos | Defensivos e Formicidas Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20450 | Insumos | Fertilizantes Silvicultura | silvicultura | sim | — | — | Custeio | sim | global |
| 20460 | Insumos | Outros Insumos Florestais | silvicultura | sim | — | — | Custeio | sim | global |
| 20470 | Logística | Comercialização Florestal | silvicultura | sim | — | — | Custeio | sim | global |
| 20480 | Logística | Transporte Florestal | silvicultura | sim | — | — | Custeio | sim | global |
| 20490 | Proteção | Aceiros e Vigilância | silvicultura | sim | — | — | Custeio | sim | global |
| 20500 | Proteção | Prevenção e Combate a Incêndio | silvicultura | sim | — | — | Custeio | sim | global |
| 20510 | Tratos | Controle de Formiga | silvicultura | sim | — | — | Custeio | sim | global |
| 20520 | Tratos | Tratos Silviculturais | silvicultura | sim | — | — | Custeio | sim | global |

#### Juros de Financiamento Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 12010 | Juros de Financiamento Agricultura | Juros de Financiamento Agricultura | agricultura | sim | — | juros | Juros | sim | global |

#### Juros de Financiamento Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 7010 | Juros de Financiamento Pecuária | Juros de Financiamento Pecuária | pecuaria | sim | — | juros | Juros | sim | global |

#### Juros de Financiamento Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 20310 | Juros de Financiamento Silvicultura | Juros de Financiamento Silvicultura | silvicultura | sim | — | — | Juros | sim | global |

### Deduções de Receitas

#### Deduções Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 10010 | Ajustes | Deduções Outras Operações Agricultura | agricultura | sim | — | deducao | Impostos e deduções | sim | global |
| 10020 | Ajustes | Participação de Parceiro na Safra | agricultura | sim | — | deducao | Impostos e deduções | sim | global |
| 10030 | Impostos | Impostos e Despesas de Vendas Agricultura | agricultura | sim | — | deducao | Impostos e deduções | sim | global |

#### Deduções Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 5020 | Ajustes | Deduções Outras Operações Pecuária | pecuaria | sim | — | deducao | Impostos e deduções | sim | global |
| 5025 | Ajustes | Resultado com Mercado Futuro | pecuaria | sim | não | deducao | Impostos e deduções | sim | global |
| 5030 | Impostos | Impostos e Despesas de Abates e Vendas | pecuaria | sim | — | deducao | Impostos e deduções | sim | global |

#### Deduções Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 20110 | Ajustes | Deduções Outras Operações Silvicultura | silvicultura | sim | — | — | Impostos e deduções | sim | global |
| 20120 | Impostos | Impostos e Despesas de Vendas Silvicultura | silvicultura | sim | — | — | Impostos e deduções | sim | global |

### Dividendos

#### Dividendos

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 17160 | Dividendos | Dividendos Ambiental | administrativo | não | — | — | Dividendos | sim | cliente |
| 17160 | Dividendos | Dividendos Ana Maria | administrativo | não | — | — | Dividendos | sim | cliente |
| 17170 | Dividendos | Dividendos Ana Verena | administrativo | não | — | — | Dividendos | sim | cliente |
| 17170 | Dividendos | Dividendos Apto. Guarujá | administrativo | não | — | — | Dividendos | sim | cliente |
| 17160 | Dividendos | Dividendos Apto. Pres. Prudente | administrativo | não | — | — | Dividendos | sim | cliente |
| 17200 | Dividendos | Dividendos Casa fazenda | administrativo | não | — | — | Dividendos | sim | cliente |
| 17210 | Dividendos | Dividendos Casa Pirapozinho | administrativo | não | — | — | Dividendos | sim | cliente |
| 17010 | Dividendos | Dividendos Construção | administrativo | não | — | — | Dividendos | sim | global |
| 17190 | Dividendos | Dividendos Cursos/Educação | administrativo | não | — | — | Dividendos | sim | cliente |
| 17160 | Dividendos | Dividendos Dependentes | administrativo | não | — | — | Dividendos | sim | cliente |
| 17020 | Dividendos | Dividendos Despesas Familiares | administrativo | não | — | — | Dividendos | sim | global |
| 17030 | Dividendos | Dividendos Despesas Pessoais | administrativo | não | — | — | Dividendos | sim | global |
| 17230 | Dividendos | Dividendos Devolução Recursos | administrativo | não | — | — | Dividendos | sim | cliente |
| 17180 | Dividendos | Dividendos Doações | administrativo | não | — | — | Dividendos | sim | cliente |
| 17040 | Dividendos | Dividendos Doroteia | administrativo | não | — | — | Dividendos | sim | global |
| 17160 | Dividendos | Dividendos Empréstimos | administrativo | não | — | — | Dividendos | sim | cliente |
| 17170 | Dividendos | Dividendos Energia Solar | administrativo | não | — | — | Dividendos | sim | cliente |
| 17220 | Dividendos | Dividendos Eucalipto | administrativo | não | — | — | Dividendos | sim | cliente |
| 17050 | Dividendos | Dividendos Fabio Delazari | administrativo | não | — | — | Dividendos | sim | global |
| 17060 | Dividendos | Dividendos Faz. Campeiro | administrativo | não | — | — | Dividendos | sim | global |
| 17070 | Dividendos | Dividendos Fazenda Paraguay | administrativo | não | — | — | Dividendos | sim | global |
| 17080 | Dividendos | Dividendos Financ. Pessoal | administrativo | não | — | — | Dividendos | sim | global |
| 17180 | Dividendos | Dividendos Higino | administrativo | não | — | — | Dividendos | sim | cliente |
| 17170 | Dividendos | Dividendos Insumos Fabrica | administrativo | não | — | — | Dividendos | sim | cliente |
| 17160 | Dividendos | Dividendos Insumos Nelson | administrativo | não | — | — | Dividendos | sim | cliente |
| 17090 | Dividendos | Dividendos Interno Funcionários | administrativo | não | — | — | Dividendos | sim | global |
| 17100 | Dividendos | Dividendos Irancho | administrativo | não | — | — | Dividendos | sim | global |
| 17190 | Dividendos | Dividendos Manuela | administrativo | não | — | — | Dividendos | sim | cliente |
| 17170 | Dividendos | Dividendos Moradia | administrativo | não | — | — | Dividendos | sim | cliente |
| 17110 | Dividendos | Dividendos Outras Fazendas | administrativo | não | — | — | Dividendos | sim | global |
| 17120 | Dividendos | Dividendos Outros Negocios | administrativo | não | — | — | Dividendos | sim | global |
| 17160 | Dividendos | Dividendos Pensão Crianças | administrativo | não | — | — | Dividendos | sim | cliente |
| 17130 | Dividendos | Dividendos Pessoal Fazenda | administrativo | não | — | — | Dividendos | sim | global |
| 17200 | Dividendos | Dividendos Rateio Geral | administrativo | não | — | — | Dividendos | sim | cliente |
| 17140 | Dividendos | Dividendos Retorno Empréstimos | administrativo | não | — | — | Dividendos | sim | global |
| 17180 | Dividendos | Dividendos Transporte | administrativo | não | — | — | Dividendos | sim | cliente |
| 17150 | Dividendos | Dividendos Tributos Pessoais | administrativo | não | — | — | Dividendos | sim | global |
| 17210 | Dividendos | Dividendos Vera | administrativo | não | — | — | Dividendos | sim | cliente |

### Investimento em Bovinos

#### Compra de Bovinos

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 15010 | Compra de Bovinos | Investimento Compra Bovinos Fêmeas | pecuaria | sim | — | reposicao | Reposição de bovinos | sim | global |
| 15020 | Compra de Bovinos | Investimento Compra Bovinos Machos | pecuaria | sim | — | reposicao | Reposição de bovinos | sim | global |
| 15030 | Compra de Bovinos | Investimento Frete/Comissão Compra Bovinos | pecuaria | sim | — | reposicao | Reposição de bovinos | sim | global |

### Investimento na Fazenda

#### Investimento Administrativo

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 22010 | Infraestrutura | Investimento Instalações Administrativo | administrativo | sim | — | investimento | Investimentos | sim | global |
| 22020 | Máquinas | Investimento Equipamentos e Informática Administrativo | administrativo | sim | — | investimento | Investimentos | sim | global |
| 22030 | Máquinas | Investimento Veículos Administrativo | administrativo | sim | — | investimento | Investimentos | sim | global |

#### Investimento Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 14010 | Infraestrutura | Investimento em Cercas Agricultura | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14020 | Infraestrutura | Investimento Instalações Agricultura | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14030 | Máquinas | Investimento em Implementos Agrícolas | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14040 | Máquinas | Investimento em Máquinas Agrícolas | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14050 | RH | Investimento em Treinamentos Agricultura | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14060 | RH | Investimento Eventos, Capacitação Agricultura | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14070 | RH | Investimento Uniformes e EPI Agricultura | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14080 | Solo | Investimento em Correção de Solo | agricultura | sim | — | investimento | Investimentos | sim | global |
| 14090 | Solo | Investimento Formação de Área Agrícola | agricultura | sim | — | investimento | Investimentos | sim | global |

#### Investimento Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 9010 | Infraestrutura | Investimento em Cercas Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |
| 9020 | Infraestrutura | Investimento em Instalações Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |
| 9030 | Máquinas | Investimento Máquinas e Equip. Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |
| 9040 | Pastagem | Investimento Formação Pasto Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |
| 9050 | RH | Investimento Eventos e Capacitação Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |
| 9060 | RH | Investimento Treinamentos Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |
| 9070 | RH | Investimento Uniformes e EPI Pecuária | pecuaria | sim | — | investimento | Investimentos | sim | global |

#### Investimento Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 20610 | Floresta | Investimento Formação de Floresta | silvicultura | não | — | — | Investimentos | sim | global |
| 20620 | Infraestrutura | Investimento em Estradas e Aceiros Silvicultura | silvicultura | não | — | — | Investimentos | sim | global |
| 20630 | Máquinas | Investimento Máquinas e Equip. Silvicultura | silvicultura | não | — | — | Investimentos | sim | global |
| 20640 | RH | Investimento Treinamentos e EPI Silvicultura | silvicultura | não | — | — | Investimentos | sim | global |

### Receita Operacional

#### Receita Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 1155 | Venda Peso Vivo | Acerto de Boitel (despesas) | pecuaria | sim | — | venda | Outras saídas | sim | global |

### Saída Financeira

#### Amortizações

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 16010 | Agricultura | Amortização Financiamento Agricultura | agricultura | não | — | — | Amortizações | sim | global |
| 16040 | Consórcio | Consórcio a contemplar | administrativo | não | — | — | Amortizações | sim | global |
| 16020 | Pecuária | Amortização Financiamento Pecuária | pecuaria | não | — | — | Amortizações | sim | global |
| 16030 | Silvicultura | Amortização Financiamento Silvicultura | silvicultura | não | — | — | Amortizações | sim | global |

#### Outras Saídas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 16005 | Ajustes | Pagamento Estornado | administrativo | não | — | — | Outras saídas | sim | global |
| 5005 | Movimentações Financeiras | Adiantamento a Fornecedores | pecuaria | não | — | — | Outras saídas | não | global |
| 10005 | Movimentações Financeiras | Adiantamento a Parceiro - Lavoura | agricultura | não | — | — | Outras saídas | sim | global |
| 5010 | Movimentações Financeiras | Adiantamento de Boitel | pecuaria | não | — | — | Outras saídas | sim | global |
| 5006 | Movimentações Financeiras | Devolução de Adiantamento de Clientes | pecuaria | não | — | — | Outras saídas | não | global |
| 10006 | Movimentações Financeiras | ICMS a Repassar - Pago | agricultura | não | — | — | Outras saídas | sim | global |

### Tributos

#### Tributos e Impostos

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 19010 | Impostos sobre Lucro | CSLL | administrativo | sim | — | — | Impostos e deduções | sim | global |
| 19020 | Impostos sobre Lucro | IRPF | administrativo | sim | — | — | Impostos e deduções | sim | global |
| 19030 | Impostos sobre Lucro | IRPJ | administrativo | sim | — | — | Impostos e deduções | sim | global |
| 19040 | Tributos Patrimoniais | ITR | administrativo | sim | — | — | Impostos e deduções | sim | global |
| 19050 | Tributos Patrimoniais | Taxas Patrimoniais | administrativo | sim | — | — | Impostos e deduções | sim | global |

## 3-Transferências

### Transferências

#### Entre Contas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | grupo VG | ativo | origem |
|---:|---|---|---|:-:|:-:|---|---|:-:|---|
| 18010 | Bancário | Transferência entre Contas Bancárias | administrativo | não | — | — | — | sim | global |
