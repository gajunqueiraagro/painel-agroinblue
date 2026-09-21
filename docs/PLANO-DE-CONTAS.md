# Plano de Contas — AGROinBLUE

> **GERADO do banco em 21/09/2026 (após PLANO-ADM-06).
> Não editar à mão: migration primeiro, regeração depois.**

Fonte: `public.financeiro_plano_contas` no Supabase **proto** (`binbcdfbisgscrifztia`).
Hierarquia: **tipo de operação › macro custo › grupo de custo › centro de custo › subcentro**.
Dentro de cada grupo, as linhas saem em `centro a-z > subcentro a-z` — a mesma ordem que
`ordem_exibicao` materializa (PLANO-ORDEM-01).

**223 linhas**: 215 globais (`cliente_id` nulo, valem para todos) e 8 de um cliente só, todas
no grupo Dividendos. A coluna **origem** diz qual é qual.

Legenda das colunas: **DRE** = `compoe_dre` · **LCDPR** = `gera_lcdpr` · **bloco** = `bloco_dre`
(a linha do DRE em que o valor cai) · **—** = coluna nula no banco, que aqui significa ausência
de decisão, não `false`.

## 1-Entradas

### Entrada Financeira

#### Entradas de Capital

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 4010 | Capital | Aporte Pessoal | administrativo | não | — | — | global |
| 4020 | Capital | Retorno de Empréstimos | administrativo | não | — | — | global |
| 4030 | Financiamento | Entrada de Financiamento Agricultura | agricultura | não | — | — | global |
| 4040 | Financiamento | Entrada de Financiamento Pecuária | pecuaria | não | — | — | global |
| 4050 | Financiamento | Entrada de Financiamento Silvicultura | silvicultura | não | — | — | global |

#### Outras Entradas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 4005 | Ajustes | Estorno Recebido | administrativo | não | — | — | global |
| 3025 | Movimentações Financeiras | Devolução de Adiantamento - Parceiro Lavoura | agricultura | não | — | — | global |
| 3020 | Movimentações Financeiras | Devolução de Adiantamento de Boitel | pecuaria | não | — | — | global |

### Receita Operacional

#### Outras Receitas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 3010 | Financeiro | Rendimentos Financeiros | administrativo | sim | — | — | global |
| 3020 | Outros | Outras Receitas | administrativo | sim | — | — | global |

#### Receita Agrícola

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 2010 | Venda Ativos | Venda de Máquinas Agrícolas | agricultura | sim | — | receita | global |
| 2020 | Venda Produção | Venda de Amendoim | agricultura | sim | — | receita | global |
| 2030 | Venda Produção | Venda de Cana | agricultura | sim | — | receita | global |
| 2040 | Venda Produção | Venda de Mandioca | agricultura | sim | — | receita | global |
| 2050 | Venda Produção | Venda de Milho | agricultura | sim | — | receita | global |
| 2060 | Venda Produção | Venda de Outras Culturas | agricultura | sim | — | receita | global |
| 2070 | Venda Produção | Venda de Soja | agricultura | sim | — | receita | global |

#### Receita Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 1010 | Abates | Abates de Fêmeas | pecuaria | sim | — | venda | global |
| 1020 | Abates | Abates de Machos | pecuaria | sim | — | venda | global |
| 1030 | Arrendamento | Receita de Arrendamento de Pasto | pecuaria | sim | — | receita | global |
| 1040 | Venda Ativos | Venda de Máquinas Pecuária | pecuaria | sim | — | receita | global |
| 1050 | Venda Geral | Consumo Interno e Doações | pecuaria | sim | não | venda | global |
| 1060 | Venda Geral | Venda de Tropa | pecuaria | sim | — | venda | global |
| 1070 | Venda Insumos | Venda de Madeira | pecuaria | sim | — | receita | global |
| 1080 | Venda Insumos | Venda de Nutrição | pecuaria | sim | — | receita | global |
| 1090 | Venda Insumos | Venda de Outros Insumos | pecuaria | sim | — | receita | global |
| 1100 | Venda Insumos | Venda de Sêmen | pecuaria | sim | — | receita | global |
| 1110 | Venda Peso Vivo | Venda de Desmama Fêmeas | pecuaria | sim | — | venda | global |
| 1120 | Venda Peso Vivo | Venda de Desmama Machos | pecuaria | sim | — | venda | global |
| 1130 | Venda Peso Vivo | Venda de Fêmeas Adultas | pecuaria | sim | — | venda | global |
| 1140 | Venda Peso Vivo | Venda de Machos Adultos | pecuaria | sim | — | venda | global |
| 1150 | Venda Peso Vivo | Venda em Boitel | pecuaria | sim | — | venda | global |

#### Receita Silvícola

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 20010 | Arrendamento | Receita de Arrendamento Florestal | silvicultura | sim | — | — | global |
| 20020 | Venda Ativos | Venda de Máquinas Silvicultura | silvicultura | sim | — | — | global |
| 20030 | Venda Produção | Venda de Eucalipto | silvicultura | sim | — | — | global |
| 20040 | Venda Produção | Venda de Lenha e Carvão | silvicultura | sim | — | — | global |
| 20050 | Venda Produção | Venda de Madeira Silvicultura | silvicultura | sim | — | — | global |
| 20060 | Venda Produção | Venda de Outros Produtos Florestais | silvicultura | sim | — | — | global |

## 2-Saídas

### Custeio Produção

#### Custo Fixo Administrativo

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 21010 | Administração | Aluguel de Escritório | administrativo | sim | — | fixo | global |
| 21020 | Administração | Comunicação e Energia Escritório | administrativo | sim | — | fixo | global |
| 21030 | Administração | Contab. Jurídico e Consultoria | administrativo | sim | — | fixo | global |
| 21040 | Administração | Despesas de Escritório | administrativo | sim | — | fixo | global |
| 21050 | Administração | Materiais de Escritório | administrativo | sim | — | fixo | global |
| 21060 | Administração | Outras Despesas Administrativas | administrativo | sim | — | fixo | global |
| 21070 | Administração | Softwares Administrativos | administrativo | sim | — | fixo | global |
| 21080 | Administração | Viagens e Deslocamentos Administrativo | administrativo | sim | — | fixo | global |
| 21090 | Financeiro | Despesas Financeiras Administrativo | administrativo | sim | — | fixo | global |
| 21100 | Impostos | Taxas e Impostos Administrativos | administrativo | sim | — | fixo | global |
| 21110 | Mão de Obra | Benefícios e Premiações Administrativo | administrativo | sim | — | fixo | global |
| 21120 | Mão de Obra | Rescisões e Acertos Administrativo | administrativo | sim | — | fixo | global |
| 21130 | Mão de Obra | Salários e Encargos Administrativo | administrativo | sim | — | fixo | global |
| 21140 | Máquinas | Combustível Veículos Administrativo | administrativo | sim | — | fixo | global |
| 21150 | Máquinas | Manutenção Veículos Administrativo | administrativo | sim | — | fixo | global |
| 21160 | Máquinas | Seguro e Impostos Veículos Administrativo | administrativo | sim | — | fixo | global |

#### Custo Fixo Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 11010 | Administração | Aluguel de Escritório Agricultura | agricultura | sim | — | fixo | global |
| 11020 | Administração | Comunicação e Energia Agricultura | agricultura | sim | — | fixo | global |
| 11030 | Administração | Contab. Jurídico e Consultoria Agricultura | agricultura | sim | — | fixo | global |
| 11040 | Administração | Despesas Financeiras Agricultura | agricultura | sim | — | fixo | global |
| 11050 | Administração | Materiais de Escritório Agricultura | agricultura | sim | — | fixo | global |
| 11060 | Administração | Outras Desp. Administrativas Agricultura | agricultura | sim | — | fixo | global |
| 11070 | Administração | Softwares Administrativos Agricultura | agricultura | sim | — | fixo | global |
| 11080 | Administração | Viagens e Deslocamentos Agricultura | agricultura | sim | — | fixo | global |
| 11090 | Impostos | Taxas e Impostos Fixos Agricultura | agricultura | sim | — | fixo | global |
| 11100 | Manutenção Fazenda | Ferramentas e Equipamentos Agricultura | agricultura | sim | — | fixo | global |
| 11110 | Manutenção Fazenda | Manutenção de Cercas Agricultura | agricultura | sim | — | fixo | global |
| 11120 | Manutenção Fazenda | Manutenção de Instalações Agricultura | agricultura | sim | — | fixo | global |
| 11130 | Manutenção Fazenda | Manutenção de Rede Elétrica Agricultura | agricultura | sim | — | fixo | global |
| 11140 | Manutenção Fazenda | Manutenção Estradas Agricultura | agricultura | sim | — | fixo | global |
| 11150 | Manutenção Fazenda | Manutenção Rede Hidráulica Agricultura | agricultura | sim | — | fixo | global |
| 11160 | Manutenção Fazenda | Segurança Patrimonial Agricultura | agricultura | sim | — | fixo | global |
| 11170 | Mão de Obra | Benefícios e Premiações Agricultura | agricultura | sim | — | fixo | global |
| 11180 | Mão de Obra | Rescisões e Acertos Agricultura | agricultura | sim | — | fixo | global |
| 11190 | Mão de Obra | Salários e Encargos Agricultura | agricultura | sim | — | fixo | global |
| 11200 | Máquinas | Seguro Impostos Máquinas Agricultura | agricultura | sim | — | fixo | global |

#### Custo Fixo Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 6010 | Administração | Aluguel de Escritório Pecuária | pecuaria | sim | — | fixo | global |
| 6020 | Administração | Comunicação e Energia Pecuária | pecuaria | sim | — | fixo | global |
| 6030 | Administração | Contab. Jurídico e Consult. Pecuária | pecuaria | sim | — | fixo | global |
| 6040 | Administração | Despesas Financeiras Pecuária | pecuaria | sim | — | fixo | global |
| 6050 | Administração | Materiais de Escritório Pecuária | pecuaria | sim | — | fixo | global |
| 6060 | Administração | Outras Desp. Administrativas Pecuária | pecuaria | sim | — | fixo | global |
| 6070 | Administração | Softwares Administrativos Pecuária | pecuaria | sim | — | fixo | global |
| 6080 | Administração | Viagens e Deslocamentos Pecuária | pecuaria | sim | — | fixo | global |
| 6090 | Impostos | Taxas e Impostos Fixos Pecuária | pecuaria | sim | — | fixo | global |
| 6100 | Manutenção Fazenda | Despesas Casa Sede Pecuária | pecuaria | sim | — | fixo | global |
| 6110 | Manutenção Fazenda | Ferramentas e Equipamentos Pecuária | pecuaria | sim | — | fixo | global |
| 6120 | Manutenção Fazenda | Manutenção de Cercas Pecuária | pecuaria | sim | — | fixo | global |
| 6130 | Manutenção Fazenda | Manutenção de Estradas Pecuária | pecuaria | sim | — | fixo | global |
| 6140 | Manutenção Fazenda | Manutenção de Instalações Pecuária | pecuaria | sim | — | fixo | global |
| 6150 | Manutenção Fazenda | Manutenção de Rede Elétrica Pecuária | pecuaria | sim | — | fixo | global |
| 6160 | Manutenção Fazenda | Manutenção Rede Hidráulica Pecuária | pecuaria | sim | — | fixo | global |
| 6170 | Manutenção Fazenda | Segurança Patrimonial Pecuária | pecuaria | sim | — | fixo | global |
| 6180 | Mão de Obra | Benefícios e Premiações Pecuária | pecuaria | sim | — | fixo | global |
| 6190 | Mão de Obra | Rescisões e Acertos Pecuária | pecuaria | sim | — | fixo | global |
| 6200 | Mão de Obra | Salários e Encargos Pecuária | pecuaria | sim | — | fixo | global |
| 6210 | Máquinas | Combustível Máquinas Pecuária | pecuaria | sim | — | fixo | global |
| 6220 | Máquinas | Manutenção Máquinas Pecuária | pecuaria | sim | — | fixo | global |
| 6230 | Máquinas | Seguro, Impostos de Máquinas Pecuária | pecuaria | sim | — | fixo | global |
| 6240 | Outros | Custo com Tropa de Reprodução | pecuaria | sim | — | fixo | global |
| 6250 | Outros | Custo com Tropa de Serviço | pecuaria | sim | — | fixo | global |
| 6260 | Outros | Outros Animais Pecuária | pecuaria | sim | — | fixo | global |

#### Custo Fixo Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 20210 | Administração | Outras Desp. Administrativas Silvicultura | silvicultura | sim | — | — | global |
| 20220 | Impostos | Taxas e Impostos Fixos Silvicultura | silvicultura | sim | — | — | global |
| 20230 | Manutenção Fazenda | Manutenção de Estradas e Aceiros Silvicultura | silvicultura | sim | — | — | global |
| 20240 | Mão de Obra | Benefícios e Premiações Silvicultura | silvicultura | sim | — | — | global |
| 20250 | Mão de Obra | Rescisões e Acertos Silvicultura | silvicultura | sim | — | — | global |
| 20260 | Mão de Obra | Salários e Encargos Silvicultura | silvicultura | sim | — | — | global |
| 20270 | Máquinas | Combustível Máquinas Silvicultura | silvicultura | sim | — | — | global |
| 20280 | Máquinas | Manutenção Máquinas Silvicultura | silvicultura | sim | — | — | global |

#### Custo Variável Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 13010 | Financeiro | Seguro Agrícola Agricultura | agricultura | sim | — | pos_colheita | global |
| 13020 | Insumos | Corretivos de Solo | agricultura | sim | — | custeio | global |
| 13030 | Insumos | Defensivos Agrícolas Agricultura | agricultura | sim | — | custeio | global |
| 13040 | Insumos | Fertilizantes Agricultura | agricultura | sim | — | custeio | global |
| 13050 | Insumos | Manivas e Material de Propagação | agricultura | sim | — | custeio | global |
| 13060 | Insumos | Outros Insumos Agrícolas Agricultura | agricultura | sim | — | custeio | global |
| 13070 | Insumos | Sementes Agricultura | agricultura | sim | — | custeio | global |
| 13080 | Logística | Comercialização Agrícola Agricultura | agricultura | sim | — | pos_colheita | global |
| 13090 | Logística | Transporte Agrícola Agricultura | agricultura | sim | — | pos_colheita | global |
| 13100 | Mão de Obra Direta | Diaristas e Empreita Lavoura | agricultura | sim | — | custeio | global |
| 13110 | Operações | Operações de Colheita Agricultura | agricultura | sim | — | custeio | global |
| 13120 | Operações | Operações de Plantio Agricultura | agricultura | sim | — | custeio | global |
| 13130 | Operações | Tratos Culturais Agricultura | agricultura | sim | — | custeio | global |
| 13140 | Operações Mecanizadas | Combustível Máquinas Agricultura | agricultura | sim | — | custeio | global |
| 13150 | Operações Mecanizadas | Manutenção Máquinas Agricultura | agricultura | sim | — | custeio | global |
| 13160 | Operações Mecanizadas | Serviços Mecanizados Terceirizados | agricultura | sim | — | custeio | global |
| 13170 | Pós-Colheita | Armazenagem Agrícola Agricultura | agricultura | sim | — | pos_colheita | global |
| 13180 | Pós-Colheita | Secagem e Beneficiamento | agricultura | sim | — | pos_colheita | global |
| 13190 | Serviços | Assistência Técnica Agrícola | agricultura | sim | — | custeio | global |
| 13200 | Terra | Arrendamento de Área Agrícola | agricultura | sim | — | custeio | global |

#### Custo Variável Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 8010 | Comercial | Despesas Comerciais Pecuária | pecuaria | sim | — | variavel | global |
| 8020 | Identificação | Brincos de Identificação | pecuaria | sim | — | variavel | global |
| 8030 | Identificação | Outros Itens de Identificação | pecuaria | sim | — | variavel | global |
| 8045 | Nutrição | Nutrição | pecuaria | sim | — | variavel | global |
| 8040 | Nutrição | Nutrição Cria **(INATIVO)** | pecuaria | sim | — | variavel | global |
| 8050 | Nutrição | Nutrição Engorda **(INATIVO)** | pecuaria | sim | — | variavel | global |
| 8060 | Nutrição | Nutrição Recria **(INATIVO)** | pecuaria | sim | — | variavel | global |
| 8070 | Pastagem | Custo com Arrendamento de Pasto | pecuaria | sim | — | variavel | global |
| 8080 | Pastagem | Manutenção de Pasto | pecuaria | sim | — | variavel | global |
| 8090 | Reprodução | Outros Serviços de Reprodução | pecuaria | sim | — | variavel | global |
| 8100 | Reprodução | Sêmen e IATF | pecuaria | sim | — | variavel | global |
| 8110 | Reprodução | Veterinário Reprodução | pecuaria | sim | — | variavel | global |
| 8120 | Sanidade | Outros Serviços de Sanidade | pecuaria | sim | — | variavel | global |
| 8130 | Sanidade | Vacinas e Vermífugos | pecuaria | sim | — | variavel | global |
| 8140 | Transferências | Transferência de Gado entre Fazendas | pecuaria | sim | — | variavel | global |

#### Custo Variável Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 20410 | Arrendamento | Custo com Arrendamento Florestal | silvicultura | sim | — | — | global |
| 20420 | Colheita | Corte e Baldeio | silvicultura | sim | — | — | global |
| 20430 | Colheita | Serviços de Terceiros Colheita | silvicultura | sim | — | — | global |
| 20440 | Insumos | Defensivos e Formicidas Silvicultura | silvicultura | sim | — | — | global |
| 20450 | Insumos | Fertilizantes Silvicultura | silvicultura | sim | — | — | global |
| 20460 | Insumos | Outros Insumos Florestais | silvicultura | sim | — | — | global |
| 20470 | Logística | Comercialização Florestal | silvicultura | sim | — | — | global |
| 20480 | Logística | Transporte Florestal | silvicultura | sim | — | — | global |
| 20490 | Proteção | Aceiros e Vigilância | silvicultura | sim | — | — | global |
| 20500 | Proteção | Prevenção e Combate a Incêndio | silvicultura | sim | — | — | global |
| 20510 | Tratos | Controle de Formiga | silvicultura | sim | — | — | global |
| 20520 | Tratos | Tratos Silviculturais | silvicultura | sim | — | — | global |

#### Juros de Financiamento Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 12010 | Juros de Financiamento Agricultura | Juros de Financiamento Agricultura | agricultura | sim | — | juros | global |

#### Juros de Financiamento Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 7010 | Juros de Financiamento Pecuária | Juros de Financiamento Pecuária | pecuaria | sim | — | juros | global |

#### Juros de Financiamento Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 20310 | Juros de Financiamento Silvicultura | Juros de Financiamento Silvicultura | silvicultura | sim | — | — | global |

### Deduções de Receitas

#### Deduções Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 10010 | Ajustes | Deduções Outras Operações Agricultura | agricultura | sim | — | deducao | global |
| 10020 | Ajustes | Participação de Parceiro na Safra | agricultura | sim | — | deducao | global |
| 10030 | Impostos | Impostos e Despesas de Vendas Agricultura | agricultura | sim | — | deducao | global |

#### Deduções Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 5020 | Ajustes | Deduções Outras Operações Pecuária | pecuaria | sim | — | deducao | global |
| 5030 | Impostos | Impostos e Despesas de Abates e Vendas | pecuaria | sim | — | deducao | global |

#### Deduções Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 20110 | Ajustes | Deduções Outras Operações Silvicultura | silvicultura | sim | — | — | global |
| 20120 | Impostos | Impostos e Despesas de Vendas Silvicultura | silvicultura | sim | — | — | global |

### Dividendos

#### Dividendos

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 17170 | Dividendos | Dividendos Apto. Guarujá | administrativo | não | — | — | cliente |
| 17160 | Dividendos | Dividendos Apto. Pres. Prudente | administrativo | não | — | — | cliente |
| 17200 | Dividendos | Dividendos Casa fazenda | administrativo | não | — | — | cliente |
| 17210 | Dividendos | Dividendos Casa Pirapozinho | administrativo | não | — | — | cliente |
| 17010 | Dividendos | Dividendos Construção | administrativo | não | — | — | global |
| 17190 | Dividendos | Dividendos Cursos/Educação | administrativo | não | — | — | cliente |
| 17020 | Dividendos | Dividendos Despesas Familiares | administrativo | não | — | — | global |
| 17030 | Dividendos | Dividendos Despesas Pessoais | administrativo | não | — | — | global |
| 17230 | Dividendos | Dividendos Devolução Recursos | administrativo | não | — | — | cliente |
| 17180 | Dividendos | Dividendos Doações | administrativo | não | — | — | cliente |
| 17040 | Dividendos | Dividendos Doroteia | administrativo | não | — | — | global |
| 17220 | Dividendos | Dividendos Eucalipto | administrativo | não | — | — | cliente |
| 17050 | Dividendos | Dividendos Fabio Delazari | administrativo | não | — | — | global |
| 17060 | Dividendos | Dividendos Faz. Campeiro | administrativo | não | — | — | global |
| 17070 | Dividendos | Dividendos Fazenda Paraguay | administrativo | não | — | — | global |
| 17080 | Dividendos | Dividendos Financ. Pessoal | administrativo | não | — | — | global |
| 17090 | Dividendos | Dividendos Interno Funcionários | administrativo | não | — | — | global |
| 17100 | Dividendos | Dividendos Irancho | administrativo | não | — | — | global |
| 17110 | Dividendos | Dividendos Outras Fazendas | administrativo | não | — | — | global |
| 17120 | Dividendos | Dividendos Outros Negocios | administrativo | não | — | — | global |
| 17130 | Dividendos | Dividendos Pessoal Fazenda | administrativo | não | — | — | global |
| 17140 | Dividendos | Dividendos Retorno Empréstimos | administrativo | não | — | — | global |
| 17150 | Dividendos | Dividendos Tributos Pessoais | administrativo | não | — | — | global |

### Investimento em Bovinos

#### Compra de Bovinos

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 15010 | Compra de Bovinos | Investimento Compra Bovinos Fêmeas | pecuaria | sim | — | reposicao | global |
| 15020 | Compra de Bovinos | Investimento Compra Bovinos Machos | pecuaria | sim | — | reposicao | global |
| 15030 | Compra de Bovinos | Investimento Frete/Comissão Compra Bovinos | pecuaria | sim | — | reposicao | global |

### Investimento na Fazenda

#### Investimento Agricultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 14010 | Infraestrutura | Investimento em Cercas Agricultura | agricultura | sim | — | investimento | global |
| 14020 | Infraestrutura | Investimento Instalações Agricultura | agricultura | sim | — | investimento | global |
| 14030 | Máquinas | Investimento em Implementos Agrícolas | agricultura | sim | — | investimento | global |
| 14040 | Máquinas | Investimento em Máquinas Agrícolas | agricultura | sim | — | investimento | global |
| 14050 | RH | Investimento em Treinamentos Agricultura | agricultura | sim | — | investimento | global |
| 14060 | RH | Investimento Eventos, Capacitação Agricultura | agricultura | sim | — | investimento | global |
| 14070 | RH | Investimento Uniformes e EPI Agricultura | agricultura | sim | — | investimento | global |
| 14080 | Solo | Investimento em Correção de Solo | agricultura | sim | — | investimento | global |
| 14090 | Solo | Investimento Formação de Área Agrícola | agricultura | sim | — | investimento | global |

#### Investimento Pecuária

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 9010 | Infraestrutura | Investimento em Cercas Pecuária | pecuaria | sim | — | investimento | global |
| 9020 | Infraestrutura | Investimento em Instalações Pecuária | pecuaria | sim | — | investimento | global |
| 9030 | Máquinas | Investimento Máquinas e Equip. Pecuária | pecuaria | sim | — | investimento | global |
| 9040 | Pastagem | Investimento Formação Pasto Pecuária | pecuaria | sim | — | investimento | global |
| 9050 | RH | Investimento Eventos e Capacitação Pecuária | pecuaria | sim | — | investimento | global |
| 9060 | RH | Investimento Treinamentos Pecuária | pecuaria | sim | — | investimento | global |
| 9070 | RH | Investimento Uniformes e EPI Pecuária | pecuaria | sim | — | investimento | global |

#### Investimento Silvicultura

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 20610 | Floresta | Investimento Formação de Floresta | silvicultura | não | — | — | global |
| 20620 | Infraestrutura | Investimento em Estradas e Aceiros Silvicultura | silvicultura | não | — | — | global |
| 20630 | Máquinas | Investimento Máquinas e Equip. Silvicultura | silvicultura | não | — | — | global |
| 20640 | RH | Investimento Treinamentos e EPI Silvicultura | silvicultura | não | — | — | global |

### Saída Financeira

#### Amortizações

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 16010 | Agricultura | Amortização Financiamento Agricultura | agricultura | não | — | — | global |
| 16020 | Pecuária | Amortização Financiamento Pecuária | pecuaria | não | — | — | global |
| 16030 | Silvicultura | Amortização Financiamento Silvicultura | silvicultura | não | — | — | global |

#### Outras Saídas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 16005 | Ajustes | Pagamento Estornado | administrativo | não | — | — | global |
| 10005 | Movimentações Financeiras | Adiantamento a Parceiro - Lavoura | agricultura | não | — | — | global |
| 5010 | Movimentações Financeiras | Adiantamento de Boitel | pecuaria | não | — | — | global |

### Tributos

#### Tributos e Impostos

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 19010 | Impostos sobre Lucro | CSLL | administrativo | sim | — | — | global |
| 19020 | Impostos sobre Lucro | IRPF | administrativo | sim | — | — | global |
| 19030 | Impostos sobre Lucro | IRPJ | administrativo | sim | — | — | global |
| 19040 | Tributos Patrimoniais | ITR | administrativo | sim | — | — | global |
| 19050 | Tributos Patrimoniais | Taxas Patrimoniais | administrativo | sim | — | — | global |

## 3-Transferências

### Transferências

#### Entre Contas

| ordem | centro | subcentro | escopo | DRE | LCDPR | bloco | origem |
|---:|---|---|---|:-:|:-:|---|---|
| 18010 | Bancário | Transferência entre Contas Bancárias | administrativo | não | — | — | global |
