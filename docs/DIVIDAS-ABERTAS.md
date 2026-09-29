# Dividas abertas — texto integral

Movidas VERBATIM do CLAUDE.md em 29/09/2026. O CLAUDE.md tem o indice (secao FILA E DIVIDAS ABERTAS); aqui mora a
medicao e a decisao pendente de cada uma. Divida resolvida SAI daqui para docs/historico/, e o indice acompanha.
As pendencias que nasceram dentro de uma frente fechada continuam no bloco da frente, em
docs/historico/frentes-ate-2026-09-29.md.

## DIVIDAS DE DADO E DE MOTOR (abertas, nao tratadas)

- SALDO-INICIAL-MES-01 — `saldos_iniciais` tem coluna `mes`, e NINGUEM a le'.
  `fn_zoot_categoria_mensal` (md5 a3e6eb6b) busca o saldo em
  `WHERE si.fazenda_id = ? AND si.ano = ?` (prosrc :7-8, sem `si.mes`) e a recursao da
  serie ancora em `WHERE e.mes = 1` (:263). Medido: as 458 linhas das 11 fazendas tem
  todas `mes = 1` — o campo nunca foi usado com outro valor.
  ⚠ POR ISSO O SELETOR DE MES DO `SaldoInicialForm` ESTA DESABILITADO (FAZ-ATIVIDADE-01a)
  e o save grava `mesFinal = 1` fixo: um campo que aceita 6 e grava uma linha que o motor
  nunca le' e' pior que um campo travado — ele existiria na tabela, apareceria na lista da
  tela e nao entraria em conta nenhuma. Destravar exige mexer nas DUAS linhas da RPC, e a
  segunda e' a ancora da serie anual inteira: nao e' troca de constante.

- ZOOT-CACHE-CATEGORIA-01 — a categoria que existe SO' no LATERAL de
  `fechamento_pasto_itens` nao chega ao `zoot_mensal_cache`. Medido no Bom Retiro,
  jan/2022: os 8 `bois` estavam em `fechamento_pasto_itens` e a linha NAO existia no
  cache; as outras 6 categorias apareciam, com o saldo batendo. A categoria nao entra em
  `all_cat_bases` e o LATERAL so' e' avaliado para quem ja' esta' la'. Pre-existente.

- USO-TERRA-ARRENDADO-01 — nao ha' tipo de uso "arrendado a terceiro" no fechamento de
  area. O Bom Retiro teve a terra arrendada em jan-mai/2022 (receita no financeiro) e os
  cinco meses estavam com `tipo_uso_mes = 'recria'`, que e' falso. A saida foi APAGAR o
  mes (FAZ-ATIVIDADE-01a); o certo seria poder declarar o arrendamento.

- CACHE-X-FECHAMENTO-01 — `zoot_mensal_cache.saldo_final` e `valor_rebanho_fechamento_itens` NAO
  CONCORDAM em 20 dos 655 meses com fechamento (medido 23/09/2026). Sao as duas fontes do rebanho,
  e desde o VPB-REGRA-UNICA-01 o DRE le' as duas — o fechamento com precedencia, o cache como
  fallback. Enquanto divergirem, trocar a precedencia MUDA numero homologado.
  ⚠ FOI ELA QUE DECIDIU A SAIDA DO VPB-REGRA-UNICA-01: a versao que lia so' o cache mudou NJ 2020
    (−54.729,05), NJ civil 2023 (+5.200,00), NJ 25/26 (+20,38) e SR 22/23 (−1.182.940,26).
    cliente             fazenda              mes       fechamento   cache    dif
    Agnaldo Cedenho     Faz. Sta. Maria      2026-04         980      853   -127
    Agnaldo Cedenho     Faz. Sta. Maria      2026-05         851      829    -22
    Agnaldo Cedenho     Faz. Sta. Maria      2026-06         653      631    -22
    Agnaldo Cedenho     Faz. Sta. Tereza     2020-04         746      743     -3
    Agnaldo Cedenho     Faz. Sta. Tereza     2020-05         635      669    +34
    Agnaldo Cedenho     Faz. Sta. Tereza     2026-04         857      821    -36
    NJ Pecuaria         Faz. Pureza          2026-05       4.650    4.648     -2
    NJ Pecuaria         Faz. Sto. Expedito   2025-03       1.659    1.245   -414
    NJ Pecuaria         Faz. Sto. Expedito   2025-07       1.222    1.445   +223
    NJ Pecuaria         Faz. Sto. Expedito   2025-08       1.445    1.658   +213
    NJ Pecuaria         Faz. Sto. Expedito   2025-09       1.658    1.819   +161
    NJ Pecuaria         Faz. Sto. Expedito   2025-10       1.819    1.869    +50
    NJ Pecuaria         Faz. Sto. Expedito   2025-11       1.869    1.873     +4
    NJ Pecuaria         Faz. Sto. Expedito   2025-12       1.873    1.869     -4
    Santa Rita Agro     Faz. Bom Retiro      2023-01         438        0   -438
    Santa Rita Agro     Faz. Bom Retiro      2023-02         439        0   -439
    Santa Rita Agro     Faz. Bom Retiro      2023-03         441        0   -441
    Santa Rita Agro     Faz. Bom Retiro      2023-04         442        0   -442
    Santa Rita Agro     Faz. Bom Retiro      2023-05         412        0   -412
    Santa Rita Agro     Faz. Bom Retiro      2023-06         374        0   -374
  ⚠ AS SEIS DO BOM RETIRO NAO SAO DIVERGENCIA DE DADO: o cache de 2023 estava DESMATERIALIZADO —
    zero linhas —, e a medicao acima foi feita antes do refresh. Depois dele sao 51 linhas e as
    seis somem da lista. Ficam registradas porque mostram o OUTRO risco do cache como fonte: ele
    pode estar vazio sem que nada avise, e ai' "sem linha = zero" afirma um rebanho que existe.
  ⚠ ACRESCENTADA EM 24/09/2026, e esta e' de VALOR, nao de cabeca: SR, ago/2021.
    cache        R$ 12.031.963,06
    fechamento   R$ 12.255.963,06
    diferenca    R$    224.000,00
  O Gabriel FECHOU jun e ago/2021 do SR na homologacao do modal da variacao, e o P1 do periodo
  jan-ago/21 trocou de fonte — de `p1c` (cache) para `p1f` (fechamento). Os DOIS numeros estavam
  certos, cada um para a sua fonte; o de referencia a partir daqui e' o do FECHAMENTO, que e' a
  oficial. Numeros de referencia do modal: P1 = 12.255.963,06 · efeito de mercado 2.575.858 ·
  producao 1.036.279.
  ⚠ A ORIGEM DA DIFERENCA NAO FOI MEDIDA e fica como FASE 0 de quem retomar. O que JA' se sabe, por
  decomposicao: a PRODUCAO nao se mexeu (1.036.278,72 antes e depois) porque `v1_p0` e' o rebanho
  do fim a preco de dez/20, e fechar agosto nao toca no preco de dezembro. Andou so' o EFEITO DE
  MERCADO (2.351.857,60 -> 2.575.857,60), que e' exatamente o que ele mede: a mesma @ a outro
  preco. Entao a diferenca esta' no PRECO de ago/21, nao no rebanho — e o rebanho conferiu
  (39.233,20 @ nas duas leituras).
  ⚠ E O MODO COMO ISSO APARECEU vale mais que o numero: a aba Movimentos mostrou "Total final
  12.255.963" e o Resumo, "12.031.963", na MESMA tela. Nao era defeito de nenhum dos dois — era uma
  leitura feita antes e outra depois do fechamento. Duas telas com fontes diferentes para a mesma
  ponta nao avisam quando uma delas muda; foi a aritmetica que denunciou.
  ⚠ AS CATORZE RESTANTES SAO DIVERGENCIA DE VERDADE e nao foram investigadas. A do Sto. Expedito em
    2025-03 (414 cabecas) e a maior. Quem for consertar decide QUAL das duas fontes estava errada —
    e ate' la' o DRE mostra a do fechamento, que e' a oficial.
  ⚠ E ELA E' O QUE SOBRA DO RESIDUO DA PONTE, desde o RECLASS-PESO-BACKFILL-01 (24/09/2026): o
    residuo do NJ jan-ago/25 caiu de -25.735,7 para -556,2 @, e esses -556,2 sao EXATAMENTE a
    divergencia do Sto. Expedito em ago/25 — fechamento 17.527,1 @ contra cache 18.083,3 @.
    Enquanto ela existir, a ponte NAO fecha em zero, e o que sobra nao e' erro novo: e' esta divida.
    Quem a resolver fecha a ponte junto.

- PASTO-DIVERGENCIA-01 — o pasto `⚠️ Divergencia do Campeiro` (`tipo_uso = 'divergencia'`) existe
  em 5 fazendas de 4 clientes e carrega 440 cabecas: Sta. Maria 380, Pureza 23, Ursa Maior 20,
  Baia Grande 13, Sto. Expedito 4 (medido 23/09/2026). Ele e' `ativo = true` e esta' DENTRO da
  vigencia — entao a regra de vigencia nao o toca, e ele CONTINUA contando como rebanho.
  ⚠ E' DECISAO DE PRODUTO EM ABERTO, nao defeito: o pasto e' balde de ajuste de conciliacao, e a
    pergunta "a divergencia conta como rebanho?" nunca foi respondida. `fn_cards_componentes_mes`
    e `fn_composicao_componentes_categoria_mes` ja' o marcam (`eh_ajuste`,
    `tipo_entidade = 'ajuste_conciliacao'`), o que sugere que a tela quer mostra-lo.
  ⚠ QUEM DECIDIR MEDE ANTES: excluir esses 440 muda numero de 4 clientes, inclusive a Pureza
    dentro de 25/26.

- PASTOS-APLICAVEIS-ESPELHO-01 — `usePastos.ts` (`isPastoAtivoNoMes` + `pastosAtivosNoMes`) e
  `fn_pastos_aplicaveis_mes` (md5 d2f64f93ec3daa4fbb2f63348a3a17ee) SE DECLARAM ESPELHO e NAO
  SAO: o comentario do front diz "As duas implementam a MESMA regra e precisam mudar juntas", e a
  de SQL tem `tipo_uso IS DISTINCT FROM 'divergencia'` a mais.
  ⚠ A DIVERGENCIA NAO E' TEORICA: e' exatamente ela que separa "o PR nao muda nada" de "o PR move
    440 cabecas em 4 clientes" (ver PASTO-DIVERGENCIA-01). O PASTO-VIGENCIA-MOTOR-01 adotou a
    regra DO FRONT, sem `tipo_uso`, por decisao do Gabriel em 23/09.
  ⚠ HOJE SAO TRES ESPELHOS, nao dois: entrou `fn_pasto_vigente_no_mes`, que e' fiel ao front.
    Reconciliar os tres e' frente propria; enquanto nao for, quem mexer em um confere os outros.

- REPOSICAO-SEM-CUSTO-01 — o Santa Rita COMPRA gado e o DRE nao tem custo de reposicao NENHUM.
  Medido em 24/09/2026, cliente inteiro, realizado, seis periodos: `reposicao` = 0,00 em TODOS,
  enquanto `producao.cab_comprada` e `at_comprada` mostram compra de verdade —
    civil 2021   6 cab / 90,00 @    reposicao 0,00
    safra 21/22  32 cab / 362,33 @  reposicao 0,00
    safra 24/25  1 cab / 20,00 @    reposicao 0,00
  (civil 2025 e safra 25/26 nao tiveram compra: `at_comprada` vem NULL, que e' outra coisa.)
  ⚠ O ESTRAGO E' NO AGIO, e por isso a tela trata: "agio sobre R$/@ do desfrute" e'
  `R$/@ compra / R$/@ desfrute - 1`, e com `reposicao = 0` o R$/@ da compra da' ZERO e o agio sai
  em -100% em toda a tela do SR. A faixa da cascata mostra "—" nas duas celulas quando
  `reposicao` e' zero E houve compra — zero ali nao e' preco, e' lancamento que falta.
  ⚠ E NAO E' DEFEITO DE TELA: o dado do financeiro e' que nao tem a contrapartida da compra
  zootecnica. Quem for consertar decide se o lancamento faltou ou se a compra foi por outro
  caminho (permuta, transferencia entre clientes). Ate' la', "—".

- PK-INI-PONDERADO-01 — `pk_ini` le' `max(preco_kg)` do mes, e deveria ler o PONDERADO POR KG.
  Ela aparece em `fn_dre_pecuaria` e em `fn_dre_pecuaria_patrimonio`, no mesmo formato:
  `select fazenda_id, categoria, max(preco_kg) pk ... where ano_mes = left(p_de,7) group by 1,2`.
  E' o preco de partida de quem NAO tem fechamento no mes P0 e cai no cadastro (`p0c`).
  ⚠ `max` NAO E' MEDIA, e com duas linhas da mesma (fazenda, categoria) no mes ele escolhe a mais
  CARA — o P0 nasce mais alto que o rebanho real, o VPB sai menor e o efeito de mercado, maior.
  Enquanto houve `vacas_descarte` isso era visivel: Sta. Luzia, jan/2020, `vacas` a 5,58 e descarte
  a 5,39; o `max` pegava 5,58 e o ponderado e' 5,495295. O certo e'
  `sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg)`, que e' o idioma que as
  proprias `pf0`/`pf1` ja' usam duas linhas abaixo.
  ⚠ HOJE O DEFEITO ESTA' DORMENTE, e por isso e' divida e nao P0: depois do CATEGORIA-DESCARTE-01
  nao ha' mais categoria duplicada em (fazenda, categoria, mes) — medido, zero. O `max` volta a
  mentir no dia em que uma duplicata reaparecer, e nenhum gate ve' isso.

- SALDO-INICIAL-VIRADA-01 — `fn_zoot_categoria_mensal` deveria ler DEZEMBRO ANTERIOR (cache ou
  fechamento) quando nao ha linha do ano em `saldos_iniciais`, e a tabela guardar so' o CADASTRO
  inicial. Hoje a RPC ancora a serie em `WHERE e.mes = 1` e busca o saldo em
  `si.fazenda_id = ? AND si.ano = ?`, sem olhar dezembro: a virada de ano so' funciona porque o
  trigger `trg_propagar_saldo_dezembro` (`propagar_saldo_inicial_pos_dezembro`, md5
  f28dff1c9def8b65c930b9f95da6a8a0) MATERIALIZA a linha do ano seguinte.
  ⚠ E O TRIGGER TEM UM BURACO MEDIDO: ele e' `AFTER UPDATE` com `OLD.status <> 'fechado'`.
    Dezembro que NASCE fechado, num INSERT, nao dispara nada — foi o caso do Eucalipto de
    dez/2022, criado ja' 'fechado' em 23/09, e por isso as 9 linhas de 2023 do Bom Retiro
    estavam todas em `quantidade = 0` com o `peso_medio_kg` certo de dezembro. O ano abria em
    ZERO, calado. Escrito a mao na migration 20261027131700.
  ⚠ REGRA DE PRODUTO QUE GOVERNA A TELA (Gabriel, 23/09): saldo inicial se CADASTRA uma vez, no
    primeiro mes da fazenda no sistema. Janeiro dos anos seguintes e' materializacao do motor,
    nao cadastro — por isso a aba Rebanho inicial lista SO' o primeiro ano e o seletor de ano do
    `SaldoInicialForm` so' oferece a faixa completa enquanto nao existe saldo nenhum.

- CONCIL-DESFAZER-STATUS-01 — desfazer uma conciliacao NAO devolve o lancamento a "programado".
  DECISAO DO GABRIEL, nao tratada. Medido em 25/09/2026, na FASE 0 do FIN-V2-REFRESH-02:
  conciliar dispara `trg_promover_lancamento_realizado_ao_conciliar` (AFTER INSERT em
  `conciliacao_bancaria_itens`), que poe o lancamento em 'realizado' e preenche `data_pagamento` com
  a data do extrato quando estava vazia. Desfazer e' UPDATE nos itens (`fn_desfazer_vinculo_extrato`,
  md5 07af033c; `fn_desfazer_grupo_conciliacao`, md5 06558026) e mexe so' nos itens e no status do
  extrato — nenhum gatilho dispara sobre o lancamento, que continua realizado e com a data que a
  conciliacao escreveu.
  ⚠ NAO E' DEFEITO DE TELA: a lista do Financeiro V2 mostra o "conciliado" pelos vinculos, que
    recarregam. E' regra de dado — quem decidir mede antes quantos lancamentos foram promovidos por
    conciliacao e depois desfeitos, e se a data de pagamento veio do extrato ou do operador.

- OC-BOITEL-DELTA-ANTIGO-01 — duas OCs de boitel com realizado cujo lote NAO esta' no saldo do
  acerto, as duas com compromisso ja' gerado (medido 25/09/2026). DECISAO DO GABRIEL, nao tratada:
    OC                lote/acordado   saldo do acerto   delta        compromisso vivo
    RRCC da0b8577     410.836,79      473.884,10        +63.047,31   466.030,10
    Vera b58bf556     565.217,00      593.139,96        +27.922,96   (17 partes)
  ⚠ A DA VERA E' O MESMO DEFEITO DA 8b211cae, um mes antes: revalorada para 593.145 as 11:49 de
    31/08, desfeita por um `salvar_lotes` as 12:31 — antes de a trava do CAMINHO B existir (ela
    entrou as 14:02 daquele dia). A RRCC nunca teve `revalorar_lote`.
  ⚠ DESDE O OC-STATUS-LADO-01 (25/09/2026) O ESTADO DA da0b8577 E' "quitada", NAO "excedente": a base do lado
    passou a ser o COMPROMISSO (466.030,10, pago), nao o lote (410.836,79). A divergencia lote x acerto CONTINUA
    aqui, intacta — so' deixou de aparecer como estado da OC.
  ⚠ A 8b211cae NAO ESTA' AQUI porque nao tem compromisso: reaplicar o realizado a corrige (com a
    saida ja' registrada, o Confirmar cai no CAMINHO B, que ja' preservava).
  ⚠ A TELA JA' MOSTRA O SALDO nas duas (o "Valor acordado" do resumo le' o realizado), enquanto o
    lote, o financeiro e o rebanho tem outro numero. Duas verdades na mesma OC ate' a decisao.
  ⚠ E AS OBRIGACOES TAMBEM DIVERGEM DO REALIZADO (medido 25/09/2026, na FASE 0 do A4). Nas quatro OCs
    antigas, os compromissos que nao sao a principal, contra o que a linha realizada daria — o A4 nao
    as toca (so' codigo, daqui para frente):
      OC         compromisso  componente              valor      status/titulo           pelo realizado
      744c520e   dac75bf9     frete (fora do boitel)  20.615,00  aberto, sem programacao  6.400,00
      da0b8577   1e33fb64     frete (fora do boitel)   6.000,00  aberto, sem programacao  0 (sem linha)
      7f7de76f   8bf253f2     adiantamento            46.458,50  programado / realizado   46.458,50
      7f7de76f   6c39d4c4     adiantamento devolvido  42.416,00  programado / agendado    46.458,50
      7f7de76f   6a7393ae     frete (fora do boitel)   3.991,80  programado / realizado   5.944,13
      b58bf556   2c959474     adiantamento            95.243,50  programado / realizado   95.243,50
      b58bf556   22e23486     adiantamento devolvido  95.243,50  programado / agendado    95.243,50
      b58bf556   8cd035f6     frete (fora do boitel)   7.983,60  programado / realizado   11.907,44
  ⚠ AS PRINCIPAIS DAS QUATRO SAO SOLTAS (`lote_id` nulo) — 8cf1d1f9 (744c520e), f9b39fa0 (da0b8577),
    4d274747 (7f7de76f), 22390d7c (b58bf556) — e por isso a divergencia "compromisso x lote" da aba
    Financeiro (`divergenciaDoLote`) NAO aparece nelas, nem o botao "Atualizar compromisso": os dois so'
    existem para compromisso ligado ao lote.
  ⚠ PERGUNTA ABERTA: as "despesas fora do boitel" da Vera (6a7393ae, 8cd035f6) batem com o FRETE
    sozinho do realizado, sem as notas do envio (1.952,33 e 3.923,84). Nao se sabe se as notas foram
    lancadas por outro caminho ou se faltam. Medir antes de mexer.

- ⚠ DOIS TITULOS DE OC CANCELADOS PELO FINANCEIRO COM A PARTE VIVA — DECISAO DO GABRIEL, nao tocados
  (medido 25/09/2026, na FASE 0 do FIN-V2-CANCEL-MOTIVO-01). Dos 33 titulos de OC cancelados, 31 sairam pelas
  RPCs da OC; estes dois sairam por fora, estavam `realizado` e nao tem motivo:
    lancamento  OC        componente              valor      cancelado em
    e8032b0d    7f7de76f  Iagro                       32,54  02/09/2026
    f489abd9    c80ebe9e  adiantamento devolvido   5.056,00  18/09/2026
  ⚠ A PARTE DA OC CONTINUA VIVA apontando para um titulo morto: a OC acha que tem um titulo que o financeiro
    nao mostra. Foi exatamente o que a trava (2) passou a impedir; estes dois sao anteriores a ela.
  ⚠ QUEM DECIDIR escolhe entre reativar o titulo ou desfazer a parte pela OC — e o titulo era realizado, entao
    qualquer das duas mexe em numero de caixa.
  ⚠ DECIDIDO (OC-DESVINCULAR-01, D2): desfazer pela OC. O "Desfazer compromisso" passou a limpar os dois — a
    guarda do estornar ignora titulo JA' cancelado —, e o Gabriel o faz pela tela. Provado em rollback nos dois.

- CANCEL-MOTIVO-BANCO-01 — pendencia, nao tratada: NAO HA CONSTRAINT de motivo no banco, e ela NAO deve
  entrar agora. Travar `cancelado = true => cancelado_motivo IS NOT NULL` hoje QUEBRARIA os escritores que
  cancelam sem motivo (medido 25/09/2026, na FASE 0 do FIN-V2-CANCEL-MOTIVO-01):
    funcoes (11): agri_carga_mandioca_cancelar, cancel_financeiro_importacao_v2, fn_classificacao_apply_row,
      fn_classificacao_composicao_sugerida, fn_classificacao_resolver_ambiguo,
      fn_classificacao_resolver_proximos, fn_classificacao_split_substituir,
      fn_reconciliar_parcela_financiamento, oc_excluir_lote, oc_reprogramar_compromisso_do_lote, oc_sincronizar
    front (10): CompraFinanceiroPanel, AbateFinanceiroPanel, VendaFinanceiroPanel, ModalBaixaParcela,
      useBoitelOperacoes, useLancamentos, useFinanceiro, parcelaMirror, AuditoriaDuplicidadeTab,
      FinanciamentoDetalhe
  ⚠ A FASE 0 CONTOU 22 (12 + 10): a 12a funcao do grep, `audit_trigger_financeiro_v2`, e' o trigger de
    AUDITORIA — ela le' `cancelado`, nao o escreve. Escritores reais sao 21.
  ⚠ REGRA: TRAVA SO' DEPOIS QUE CADA ESCRITOR GRAVAR MOTIVO. Um por um, cada qual com o seu motivo (fixo ou
    pedido), e so' entao a constraint — com a contagem de linhas novas sem motivo em ZERO antes de ligar.
    O passado (~14,1 mil sem motivo) fica como esta': a constraint vale para o que entra, `NOT VALID`.

- OC-SALDO-MODAL-01 — pendencia, nao tratada (registrada a pedido do Gabriel no commit seguinte ao
  OC-STATUS-LADO-01): o resumo lateral do modal da OC mostra "Saldo" pela conta ANTIGA, somando os dois
  lados — b58bf556 (Vera, venda boitel): -107.150,94. A Central, o Resumo e a aba Liquidacao ja' leem pelo
  lado (ADR-2026-20); o resumo lateral ficou para tras.

- ABATE-BRUTO-DUAS-FONTES-01 — o "Valor bruto" do abate tem DUAS origens que nao fecham.
  O resumo lateral do modal OC deriva do liquido gravado (`valor_total + funrural`) e a cascata
  de `src/lib/calculos/abate.ts` soma (`base + bonus - descontos`). Medido na OC 8a6295f0
  (NJ · Faz. Pureza · 14/08/2026 · 18 vacas), 24/09/2026:
    resumo lateral   107.384,74   = 107.174,97 + 209,77
    cascata          107.382,90   = 104.883,89 + 2.499,01
    diferenca             1,84
  ⚠ A DIFERENCA E' ARREDONDAMENTO DO PRECO DA ARROBA, nao erro de conta: `preco_arroba` gravado
    e' 344,8676 e o implicito no liquido e' 344,8736 — 0,006/@ x 304,128 @ = 1,84.
  ⚠ MEDIDA NOS CINCO CLIENTES, e ela nao e' sempre pequena: -1,10 (Agnaldo, 155 cab), -1,84 (NJ),
    +55,25 (RRCC, 58 cab), -0,01 (SR), +1,72 (Vera). Cresce com a cabecada.
  ⚠ QUAL E' SOBERANO NAO FOI DECIDIDO. O ABATE-RESUMO-TABELA-01 manteve o LIQUIDO lendo o
    `valor_total` gravado de proposito — trocar a fonte do liquido mexe em numero homologado.

- ABATE-CALCULATION-NULL-01 — 625 dos 863 lancamentos de abate NAO tem
  `detalhes_snapshot.calculation` (medido 24/09/2026), entao o resumo deles cai nos fallbacks do
  `LancamentoDetalhe` em vez de ler o snapshot.
  ⚠ FOI ISSO QUE DEIXOU UM FALLBACK ERRADO VIVER ANOS: `valorBruto = valorBase - funruralTotal`
    ignorava o bonus E subtraia o funrural, e o Liquido saia MAIOR que o Bruto. Corrigido no
    ABATE-RESUMO-TABELA-01 com `cascataAbate`, a mesma funcao que o `buildAbateCalculation` usa.
  ⚠ 31 DOS 625 TINHAM BONUS OU FUNRURAL e exibiam o numero errado — Agnaldo 10, NJ 10, SR 5,
    Vera 5, RRCC 1. Nos outros 594 o defeito estava DORMENTE porque os dois termos eram zero, e
    `base - 0` coincide com o bruto. E' o mesmo padrao do PK-INI-PONDERADO-01: errado por
    construcao, invisivel porque o termo e' zero.
  ⚠ O BACKFILL DO `calculation` NAO FOI FEITO e continua aberto. Enquanto nao for, o fallback e'
    o caminho REAL de 72% dos abates — tratar como caminho principal, nao como excecao.

- OC-IMPORT-MORTO-01 — `src/components/abate/AbateModalShell.tsx:57` importa
  `subcentroVendaPorCategoria` de `@/hooks/useOperacaoLiquidacao` e NUNCA a chama (o
  `SUBCENTRO_ADIANTAMENTO_BOITEL` do mesmo import e' usado). Anterior ao OC-BOITEL-VALOR-01,
  medido em 24/09/2026.
  ⚠ TSC E BUILD FICAM MUDOS — import nao usado nao e' erro de tipo, e o `npm run lint` inteiro
    nao e' gate (1.316 erros, ver check:hooks). Fica como divida de UMA LINHA, para quem tocar o
    arquivo. Nao apaguei por conta propria: nao estava no escopo do PR que o achou.

- RECLASS-INVERSA-01 — 20 lancamentos / 69 cabecas de reclassificacao PARA TRAS, achados pela
  sanidade do BACKFILL-01: `vacas -> mamotes_f` (6 lanc., 38 cab), `novilhas -> mamotes_f` (5/7),
  `garrotes -> mamotes_f` (3/4), `vacas -> mamotes_m` (3/14), `desmama_m -> mamotes_f` (3/6).
  Uma vaca virando bezerra.
  ⚠ A MASSA CONTINUA SE CONSERVANDO — o peso que sai de vacas entra em mamotes —, entao a ponte
  e o residuo NAO se importam e nenhum gate ve. O que fica errado e' a CATEGORIA, e com ela o
  peso medio das duas pontas. Nao investigada.
  ⚠ E O CRITERIO QUE A ACHOU NAO MEDE O QUE PARECE: a faixa "peso da origem entre 0,5x e 2x o
  peso medio do destino" reprovou 108 de 484, e a maioria e' legitima — um `desmama -> garrotes`
  entra abaixo da media do destino porque a media e' dominada por quem ja estava la'. O sinal
  util foram so' as inversoes.

- GMD-FORA-DE-FAIXA-01 — sobram 434 meses-fazenda com GMD fora de 0-2 kg/dia depois do
  BACKFILL-01 (eram 460): 341 linhas no NJ e 141 no Agnaldo, mais Santa Rita 188, RRCC 91,
  Vera 78, Raul 73. GMD e' indicador de capa do PC-100 e do Fechamento, e fora dessa faixa ele
  nao descreve boi nenhum. Divida de DADO, nao de motor — a formula ja' esta' certa.

- PERF-VALOR-REBANHO-02 — DUPLICATAS DE REQUEST no /v2, medidas em 24/09/2026 e NAO tratadas.
  Ao abrir a Evolucao Patrimonial (NJ, Global): `saldos_iniciais` 4x (dois pares IDENTICOS),
  `zoo_operacao_movimentacoes` 4x (o segundo par dispara 5s depois, quando `lancamentos` termina
  de paginar), `profiles` 2x, `valor_rebanho_mensal` 2x. Na troca de ano, `fechamento_pasto_itens`
  2x identicas.
  ⚠ VALEM ~4 REQUESTS, NAO SEGUNDOS: nenhuma esta no caminho critico. Prioridade baixa — o que
  custava tempo era a view (PERF-VALOR-REBANHO-01) e a paginacao serial.

- PERF-RLS-FECHAMENTO-PASTO-ITENS-01 — a politica de tenant de `fechamento_pasto_itens` e' uma
  SUBCONSULTA CORRELACIONADA POR LINHA, e e' o que sobra entre 7 s e 1,5 s na troca de ano da
  Evolucao Patrimonial (medido 24/09/2026):
      tenant_ok((SELECT p.cliente_id FROM fechamento_pastos p
                 WHERE p.id = fechamento_pasto_itens.fechamento_id))
  A tabela tem 7.041 linhas e 2,5 MB — pequena. Mas cada linha paga uma subconsulta MAIS uma
  chamada de `tenant_ok()`. Medido no navegador: 6.559 / 7.863 / 8.160 ms em tres trocas de ano
  seguidas, sempre a request mais lenta da tela.
  ⚠ E O JEITO DE MEDIR E' PARTE DO ACHADO. No FASE 0 eu declarei esta tabela "vitima" de outra
  consulta lenta, porque `explain analyze` pelo MCP deu 0,374 ms. O canal MCP NAO PASSA PELA RLS;
  o navegador passa. Medicao de performance feita por fora da politica nao descreve a tela — se o
  numero do banco e o do navegador discordam em ordens de grandeza, suspeite da RLS antes de
  suspeitar da rede.
  ⚠ NAO E' DESTA FRENTE: e' do banco, e mexer em policy muda quem ve' o que. Frente propria, com
  medicao de acesso antes e depois.

- ZOO-DOBRO-OC-LEGADO — rebanho possivelmente em DOBRO nos lancamentos do modal antigo. DECISAO DO GABRIEL,
  nao tratada. Medido em 25/09/2026 com `oc_candidatas_vinculo`: dos 141 lancamentos financeiros ativos com
  `movimentacao_rebanho_id` nos subcentros do mapa, 64 tem OC candidata e 62 desses dao `movimento_duplicado`
  — o movimento zootecnico antigo E o movimento da OC (`zoo_operacao_movimentacoes`) descrevem o mesmo gado.
  Por cliente: NJ 36, Vera 12, Santa Rita 11, RRCC 3 (Agnaldo 40 e Raul 10 nao tem candidata nenhuma).
  ⚠ O VINCULO NAO MEXE NO REBANHO: ele solta o elo financeiro (D4) e avisa em vermelho. Quem decidir mede
    antes qual dos dois movimentos fica — cancelar movimento zootecnico muda saldo de rebanho homologado.

- DRE-DELTA-SOMA-01 — pendencia, nao tratada (registrada a pedido do Gabriel no DRE-RESUMIDO-CUSTEIO-01): nas linhas SOMADAS do
  Resumido — "Variação do estoque" (`vpb_operacional − reposicao`) e "(−) Custo fixo" (`custo_fixo + rateio_adm`) — o Δ% divide
  so' pela CHAVE PRINCIPAL da referencia, nao pela soma (`pctDelta(v, valorDe(col.ref, def.chave))` em `LinhaPec`). O Δ R$ ja'
  sai da soma. O Custeio, que nasceu no mesmo PR, ja' divide pela soma (`refDoPct`); estender as duas e' trocar o `agrupa &&`
  daquela funcao por `compor` — muda numero na tela, por isso ficou fora.

- DRE-JUROS-ADM-01 — pendencia, nao tratada (achada no rollback do DRE-CLASSIF-COPIA-01, 27/09/2026): `fn_dre_pecuaria` separa
  juros PROPRIOS de fazenda da lista (`jurf`) e juros de fazenda FORA da lista rateados por cabecas (`jurx`), e a fronteira e'
  "a fazenda aparece como coluna". Pelo texto, as 3 despesas bancarias da Vera 2024 (R$ 3,35 no total) virariam custo fixo na
  fazenda Administrativo; a fazenda entraria como coluna e R$ 49.996,51 de juros deixariam de ser rateados para virar proprios.
  R$ 3,35 movendo R$ 50 mil: e' descontinuidade da regra, nao do dado. As 3 ficaram pela chave (em Juros) por decisao do Gabriel.

- LAVOURA-2627-INVISIVEL-01 — pendencia, nao tratada (27/09/2026): o backfill acrescenta R$ 346,50 ao NJ lavoura 26/27, e o DRE
  da Lavoura nao os mostra — a safra nao tem cultura plantada, entao nao ha coluna onde o valor caia. Nao e' perda: aparece quando
  houver cultura.

- DIVIDENDOS-PLANO-01 — pendencia, nao tratada (decisao do Gabriel, 27/09/2026): 376 lancamentos ativos de Dividendos tem texto
  FORA do plano e nenhuma chave, e o gatilho os aceita pela excecao B1. Caminho: criar as linhas do plano por cliente para os
  nomes usados, ligar os 376 e SO' ENTAO remover a excecao do gatilho (passo 5 de `resolve_classificacao_from_plano`).

- DRE-LEITOR-CHAVE-01 — pendencia, fora do escopo do DRE-CLASSIF-COPIA-01: os leitores que ainda leem a COPIA passam a ler a
  CHAVE — `fn_painel_rateio_detalhe`, `fn_painel_safra`, fluxo de caixa (`useFluxoCaixa`, `FinanceiroCaixaTab`), `AnaliseDRE`,
  ResOp (`ResOpCentros`), `ExtratoDistribuicaoEconomica`, Conciliacao (`ConciliacaoBancariaTab`) e a linha "Macro · Grupo · Centro"
  do editor (hidratada do lancamento). Leem a chave: `fn_dre_pecuaria`, `fn_dre_pecuaria_lancamentos`, `fn_dre_lavoura` e o
  `ExtratoGerencialTab`. As copias so' podem sumir depois que o ultimo leitor migrar.
  ⚠ UM PASSO DADO no DRE-MODAL-SUBCENTRO-01 (28/09/2026): `fn_painel_rateio_detalhe` passou a DEVOLVER o subcentro pela chave. Os
    FILTROS dela (`l.centro_custo`, `l.macro_custo`, `l.escopo_negocio`) continuam nas copias — medido na FASE 0, e e' o que falta.

- DESFRUTE-DEFINICAO-UNICA-01 — pendencia, DECISAO DO GABRIEL (registrada no DRE-CASCATA-MODAL-01, 28/09/2026): o R$/@ do
  desfrute tem DUAS definicoes no repo. A cascata e a "Leitura dos anos" dividem as vendas pela @ do DRE (`at_desfrutada`
  convertida para @ viva, em `indicadoresDoAno`); a aba Movimentos do modal da variacao (`PecPonteTabela`) divide pela @ da ponte
  (`movimentos.vendas_abates`, que prefere o peso medio tambem no abate), e o custeio dela e' o do PC-100, SEM o rateio adm.
  Unificar em `indicadoresDoAno` muda numero de modal homologado — so' com decisao do Gabriel, medindo antes quanto cada ano muda.

- RPC-NOMES-LUCRO-01 — pendencia, nao tratada (registrada no CACHE-RRCC-2021-01, 28/09/2026): as chaves de `fn_dre_pecuaria` nao
  falam o vocabulario da grade aprovado no DRE-DESTAQUE-02. A chave `lucro_liquido` e' o conceito ANTIGO — Resultado economico
  menos Investimento — e NAO tem linha na grade; a linha "Lucro liquido" da grade le' `resultado_periodo`; o "= Resultado
  economico" le' `resultado_com_mercado`. NJ 2020: `lucro_liquido` 8.873.657,32 x "Lucro liquido" da grade 5.156.119,84.
  ⚠ E' ARMADILHA DE PROVA, nao de tela: quem compara a RPC pela chave `lucro_liquido` achando que e' a linha da grade confere o
    numero errado — foi o que aconteceu no briefing do CACHE-RRCC-2021-01.
  Conserto: renomear as chaves para o vocabulario aprovado, SEM MUDAR NUMERO, com todos os leitores (hooks, modais, testes e as
  provas registradas aqui) acompanhando no mesmo PR.

- RATEIO-PERIODOS-TELA-01 — pendencia, nao tratada (RATEIO-VIGENCIA-01, decisao 6): a tela Cadastros segue editando a chave POR ANO.
  Uma tabela de periodos (vigencia de/ate por atividade) e o editor dela sao frente propria — mock antes. A regra do mes ja' mora em
  `fn_rateio_admin_mes`; a tabela nova so' trocaria a FONTE da chave.

- SILVICULTURA-DRE-01 — pendencia, nao tratada (RATEIO-VIGENCIA-01, decisao 2): a parte da silvicultura do administrativo vai para
  "nao alocado" (NJ 2023 47.573,04; SR ~5% todo ano) ate' existir um DRE da silvicultura. Quando ele existir, o peso
  `peso_silvicultura` de `fn_rateio_admin_mes` ja' e' o dele — so' falta o leitor.

- TELAS-ORFAS-01 — pendencia, DECISAO DO GABRIEL: religar ou remover (registrada no FIN-FAZENDA-PADRAO-01, 28/09/2026). A Mesa de
  classificacao (`MesaClassificacaoTab`, montada so' por `V2MesaClassificacao` / `V2MesaOperacional`) nao tem rota nem menu desde
  PR-CLEANUP-MESA-CLASSIFICACAO-01 / -REFERENCIAS-OPERACIONAIS-01, e o Modo rapido (`ModoRapidoGrid`) nao tem botao —
  `setMode('rapido')` nao tem chamador na `FinanceiroV2Tab`. O conserto da fazenda (FIN-FAZENDA-PADRAO-01) ja' esta' nos dois: quem
  religar nao herda o palpite da primeira fazenda.

- FIN-RECORRENCIA-FAZENDA-01 — pendencia, nao tratada (FIN-FAZENDA-PADRAO-01): o `RecorrenciaDialog` nasce com a fazenda VAZIA
  mesmo com o filtro numa fazenda — nao semeia do filtro (`useState(ed?.fazendaId ?? '')`). Outra causa: nao ha palpite, falta a
  semente. Em Global ja' esta' certo (vazio).

- FIN-FAZENDA-INATIVA-LISTA-01 — pendencia, nao tratada (FIN-FAZENDA-PADRAO-01): `fazOperacionais` (`FinanceiroV2Tab.tsx:582`) e o
  `FazendaSelect` compartilhado listam TODAS as fazendas do cliente menos a sentinela, INCLUSIVE as inativas
  (`status_operacional`). O zootecnico ja' filtra ativas (`fazendasOC`); o Financeiro, nao.

- FIN-IMPORTAR-ANTIGO-01 — so' listado (FIN-FAZENDA-PADRAO-01): `importarLancamentos` (`useFinanceiro.ts`, a importacao antiga)
  nao tem chamador. Se alguem a religar, a linha sem fazenda cai em `primaryFazendaId` — a fazenda da primeira linha, ou a primeira
  do cadastro.

- EVOLUIR-PESO-FAZENDA-01 — pendencia, nao tratada (registrada no TRANSF-FAZENDA-ORIGEM-01, 27/09/2026): o peso sugerido da
  Evoluir categoria (`origemInfo` em `useReclassificacaoState`) sai do rebanho do CLIENTE INTEIRO (`useRebanhoOficial` sem
  fazenda, ponderado pelo saldo), e nao da fazenda escolhida no campo novo. Visto na tela: 388 kg para garrotes do NJ com a Pureza
  escolhida. Valor sugerido e' valor aceito (RECLASS-PESO-01), entao o peso de uma fazenda pode sair com a media das outras.

- FAZENDA-INATIVA-EDICAO-01 — pendencia, nao tratada (TRANSF-FAZENDA-ORIGEM-01): na edicao de um registro cuja fazenda gravada
  esta' INATIVA, o cabecalho do envelope e o Destino da transferencia nao a mostram — as listas (`fazendasOC`) so' tem as ativas.
  O campo travado da Origem le' a lista completa e mostra o nome. O nome gravado NAO se perde: salvar reenvia o que estava no estado.

- LEGADOS-ABATE-VENDA-FAZENDA-01 — so' listado (TRANSF-FAZENDA-ORIGEM-01): o formulario GENERICO do abate e da venda legados
  (`getCamposFazenda`, `campos.origem.auto`) tem a MESMA causa — Fazenda Origem = nome do filtro, travada. Nao ha registro novo por
  ali (abate e venda nascem pela OC) e a edicao passa pelo `LancamentoZooModal`, que le a fazenda do registro. Tambem ficaram com o
  nome do filtro dois pontos da VENDA nesse formulario (`fazendaOrigem: nomeFazenda || fazendaOrigem`, no calculo e no payload do
  compromisso).

- OC-CLASSIF-ALINHAR-01 — pendencia, NAO corrigir agora (decisao do Gabriel, 27/09/2026, na FASE 0 do
  OC-PROGRAMACAO-MODAL-01): 6 titulos VIVOS de OC tem conta do plano DIFERENTE da do compromisso — todos anteriores
  ao OC-RECLASSIFICAR-ITEM-01, que hoje grava os dois juntos.
    744c520e, 7f7de76f, b58bf556, da0b8577  compromisso em "Venda de Machos Adultos" x titulo em "Venda em Boitel"
    7f7de76f, b58bf556                      titulo em "Devolucao de Adiantamento de Boitel"
  ⚠ QUEM ALINHA E' O GABRIEL, caso a caso: alinhar o compromisso pode mudar o DRE (a conta do titulo e' a que o
    financeiro soma). A coluna "Plano de contas" da programacao do compromisso ja' mostra a do TITULO vivo, nao a do
    compromisso — a divergencia fica visivel la', e nao escondida.
  ⚠ E A DESCRICAO DIVERGE EM 28 DOS 167 titulos vivos, mas isso NAO e' inconsistencia: e' o sufixo da parcela
    ("Compra 200 Novilhas 4/5" contra "Compra 200 Novilhas"). Nao entra nesta pendencia.

- FORNECEDOR-UUID-CRU-01 — achado, nao tratado (26/09/2026, nos prints do OC-EDITAR-CADASTRAL-01): a compra 69115ef9 (NJ)
  mostra o UUID cru `276efb08…` no seletor de fornecedor e "Contraparte —" no resumo. O fornecedor (Carlos Pacheco) EXISTE,
  esta' ATIVO e e' do NJ; a lista carregada pela tela e' que nao o traz. Causa nao medida (lista carregada antes da troca de
  cliente, filtro ou limite da consulta) — FASE 0 de quem retomar.

- PROPRIEDADE-DESTINO-ORIGEM-01 — divida registrada a pedido do Gabriel (26/09/2026): "Propriedade de destino" (venda) e
  "Propriedade de origem" (compra) APARECEM na tela e NAO sao gravados em lugar nenhum — nao ha coluna na OC. Na venda ela
  so' entra na assinatura de "alterado"; na compra, o modo leitura a mostra vazia ("—", OPEN-01).

- BOITEL-DATA-ENVIO-01 — pendencia, so' medir depois (decisao do Gabriel, 26/09/2026): `zoo_operacao_boitel.data_envio`
  esta' VAZIO nos 15 registros (8 projetado, 7 realizado; medido em 25/09). A janela do vincular cai no fallback (a
  data da OC). Quem retomar mede ONDE a tela deveria gravar o envio e POR QUE nao grava — o `data_abate` do realizado
  esta' preenchido em 7 de 7, entao o caminho de gravacao existe para uma data e nao para a outra.

- HASH-IMPORT-DEFASADO-01 — pendencia, sem acao (decisao do Gabriel, 25/09/2026). 63.758 importados guardam
  `hash_importacao` diferente do que `compute_financeiro_lancamento_v2_hash` daria hoje (~54 mil vivos). 5.828
  sao a formula de 6 campos anterior a 10/04/2026; os outros 57.930 tem causa so' em parte medida:
  ⚠ A LISTA DO GATILHO ESTA' INCOMPLETA. `trg_financeiro_lancamento_v2_hash` dispara em `UPDATE OF cliente_id,
    fazenda_id, data_competencia, data_pagamento, valor, tipo_operacao, conta_bancaria_id, lote_importacao_id`, e a
    formula usa tambem `descricao`, `favorecido_id` e `numero_documento`. Editar um dos tres deixa o hash velho;
    a proxima edicao de uma coluna da lista o "cura" calada. 6.109 dos 57.930 tem essa edicao no `audit_log`.
  ⚠ E A COMPETENCIA ESTA' NA LISTA SEM ESTAR NA FORMULA — foi ela que quebrou o vinculo (VINCULAR-FIX-01).
  ⚠ QUEM LE O HASH: so' `buscar_duplicados_retroativo` (aba Auditoria de duplicidade). A REIMPORTACAO NAO O USA —
    conferido: `useImportLancamentosExcel` junta candidatos por cliente + pagamento + valor e decide com
    `classificar_nivel_duplicidade`, e o gatilho `enforce_financeiro_lancamento_v2_unique_hash` tambem (apesar do
    nome, compara os campos, nao o hash). Por isso o defasado nao duplica importacao hoje.
  ⚠ QUEM FOR TRATAR decide entre recalcular tudo (troca a identidade de ~54 mil de uma vez) e completar a lista do
    gatilho; e mede antes o que a Auditoria de duplicidade passa a mostrar.
