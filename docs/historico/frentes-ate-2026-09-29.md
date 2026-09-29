# Historico de frentes — ate' 29/09/2026

Blocos das frentes fechadas que moravam no CLAUDE.md, movidos VERBATIM em 29/09/2026 (higiene do CLAUDE.md), na
ordem em que estavam. A regra vigente de cada um ficou no CLAUDE.md, resumida, citando o nome da frente; a pendencia
ficou na FILA. Nada aqui foi editado — datas, md5, numeros e "⚠" sao os do registro original.

- PASTO-VIGENCIA-MOTOR-01 — FECHADA em 23/09/2026 pela migration 20261027131800.
  O motor somava `fechamento_pasto_itens` de TODOS os pastos do mes; a regra do
  PR-PASTO-VIGENCIA-02 ("vigencia + ativo e' a regra unica") vivia so' no front.
  ⚠ REFECHAR UM MES NUM PASTO NOVO DOBRAVA O REBANHO, e em silencio. Bom Retiro, 23/09/2026: o
    pasto "Geral" da importacao ficou INVISIVEL na tela quando vigencia e tipos de uso entraram
    (`ativo = false`, sem `data_inicio`), o operador refez 2022-06..2023-01 no "Eucalipto", e os
    oito meses ficaram com DOIS cabecalhos e o rebanho inteiro em cada — 473 + 473 = 946.
  ⚠ E O ESTRAGO NAO APARECIA ONDE SE OLHA. `valor_rebanho_fechamento(_itens)` e
    `valor_rebanho_realizado_validado` sao por FAZENDA, nao por pasto: ficaram com 1 cabecalho e
    os numeros certos o tempo todo. A tela de valor do rebanho mostrava 473 enquanto a Evolucao
    no Ano mostrava 946 — duas telas, dois numeros, nenhum erro visivel.
  A regra virou `fn_pasto_vigente_no_mes(ativo, data_inicio, data_fim, ano_mes)` — predicado
  IMMUTABLE, espelho EXATO de `usePastos.ts:49-77` — e entrou em tres somas por mes:
  `fn_zoot_categoria_mensal` (a3e6eb6b -> 5358f873), `propagar_saldo_inicial_pos_dezembro` e
  `fn_saldo_inicial_pasto`. `get_status_pilares_fechamento` NAO tinha o furo: le' so' o
  cabecalho, ja' faz join com `pastos` e ja' le' vigencia.
  ⚠ A EXCECAO E' PARTE DA REGRA: "vigente se houver; SENAO o que existe". Sem ela, o Bom Retiro
    de 2023-02 a 2023-12 (11 meses, 2.108 cab, so' o pasto morto) viraria ZERO — e zero num
    rebanho e' numero que o operador soma, nao ausencia que ele investiga.
  ⚠ EFEITO LIQUIDO NO DIA DA APLICACAO: NENHUM, e foi MEDIDO antes de escrever — 19 fazendas x
    2020-2026, 710 meses comparados em saldo inicial, saldo final e `fonte_oficial_mes`, ZERO
    divergencias. Ela e' GUARDA, nao conserto: o conserto do dado foi a 20261027131700. A prova
    funcional e' que refechar fev/23 do Bom Retiro no Eucalipto dava 878 com a funcao velha e da'
    439 com a nova.

- PATRIMONIO-TOTAL-01 — FECHADA em 23/09/2026 pela migration 20261027132000.
  `fn_dre_pecuaria_patrimonio` com `p_fazenda = null` agregava SO' por categoria, somando as
  fazendas ANTES do preco medio ponderado; `fn_dre_pecuaria` agrega por FAZENDA x categoria e so'
  entao soma. Divergiam no `v1_p0` — o valor do MEIO, que e' o que separa a variacao por producao
  do efeito de mercado.
  ⚠ O ESTRAGO ERA SIMETRICO E POR ISSO INVISIVEL: a SOMA das duas variacoes batia e o que divergia
    era a REPARTICAO. NJ jul/22-jun/23: grade 275.077,50 / -7.042.962,86; modal 284.977,50 /
    -7.052.862,86 — 9.900,00 a mais numa e a menos na outra. Nenhum gate ve' isso.
  ⚠ E SO' APARECEU quando o modal v7 pos os tres numeros lado a lado com a grade. A divida existia
    desde que o modal nasceu; o PR que a revelou nao foi o que a criou.
  ⚠ UM SEGUNDO DEFEITO VEIO JUNTO, e este era do POR-FAZENDA: categoria com QUANTIDADE ZERO na
    ponta inicial e PRECO declarado perdia o preco, porque `sum(q*pm*pk)/sum(q*pm)` tem denominador
    zero. O `coalesce(p0.pk, p1.pk)` usava entao o preco do FIM — justamente o que o efeito de
    mercado existe para isolar. Medido: `mamotes_m` no Sto. Expedito, 7 cab x 30 kg, 14,00 no
    inicio e 16,00 no fim; 420,00 iam parar no VPB. Corrigido com `else avg(preco_kg)`.
  ⚠ FICA UMA DIVERGENCIA DE FONTE, nao de numero: em SR civil 2022 a grade diz `p0_fonte = 'zero'`
    e o modal diz `'fechamento'`. A regra de resumo e' a mesma; o que difere e' QUAIS fazendas
    entram — a grade percorre a lista do periodo e da' 'zero' a quem nao tem linha, o modal so' ve'
    quem tem. A fonte e' informativa e nao decide numero.

- VALOR-REBANHO-SELETOR-ANO-01 — MUDANCA DE COMPORTAMENTO registrada em 24/09/2026: o seletor de
  ano da Evolucao Patrimonial (`ValorRebanhoTab`) passou a aparecer SEMPRE.
  ⚠ ELE ERA ESCONDIDO por `{!filtroAnoInicial && (<Select .../>)}`: quem chegava pela tela com o ano
  vindo de fora — hoje o link "Corrigir precos" do modal do DRE — ficava PRESO naquele ano, sem
  controle nenhum para sair. Justamente quem mais precisa navegar, porque veio conferir um preco e
  quer ver o ano vizinho.
  ⚠ NAO HAVIA SEGUNDA FONTE A REMOVER, e isso foi conferido: `anoFiltro` sempre foi o unico estado;
  a prop `filtroAnoInicial` apenas o SEMEIA na montagem (`useState(prop || ano corrente)` mais um
  `useEffect` que reage a prop). O que o `{!filtroAnoInicial && ...}` fazia era esconder o
  CONTROLE, nao evitar conflito de fonte.
  ⚠ E A SETA DE VOLTAR SEGUIU O CAMINHO INVERSO no mesmo PR: ela aparecia SEMPRE (o V2Index passava
  `onBack` incondicionalmente), entao quem chegava pelo menu via um "voltar" que caia na Home — um
  caminho que ele nao percorreu. Agora o `onBack` so' existe quando `origemPendenciaRef` tem origem,
  que e' o idioma que a faixa de pendencias ja' usava.

- VERA-FUNDERSUL-DUP-01 — a OC `b58bf556-4dfd-4ab9-b6fe-60a4f1598d21` (Vera Ligia Milani, venda
  boitel de 13/05/2026) tem DOIS lancamentos Fundersul IDENTICOS: R$ 1.929,38 cada, mesma
  descricao ("Boitel 110 Garrotes - Fundersul"), mesmo componente `taxas_impostos`, os dois
  `realizado` e nenhum cancelado. Medido em 24/09/2026, na FASE 0 do OC-BOITEL-VALOR-01.
  ⚠ CORRIGIDO EM 26/09/2026 — NAO E' DUPLICATA, E NAO E' PARA TRATAR. Pela regra da pecuaria (Gabriel,
    26/09: mesmo nome, mesmo valor e mesmo dia e' NORMAL — ver o bloco "PECUARIA: LANCAMENTOS IGUAIS"), duas
    guias de Fundersul de 1.929,38 sao dois pagamentos. O texto antigo dizia que "cheiravam a dois cliques";
    estava errado de premissa. NAO cancelar nenhuma.
  ⚠ E ELA APARECEU DE CARONA, o que vale mais que o caso: a varredura procurava o SUBCENTRO da
    principal e trouxe os componentes junto. Nenhum gate ve' duplicata de lancamento — nao ha'
    unique sobre (operacao, componente, valor), e nem deveria haver: duas parcelas iguais sao
    legitimas. So' o olho na lista acha.

- ⚠ BOITEL E' VENDA DE PESO VIVO COM RECEBIMENTO FUTURO (regra de produto, Gabriel, 24/09/2026
  15:44 — governa a PARTE A do OC-BOITEL-VALOR-01, ainda NAO implementada).
  Ao financeiro e ao DRE (subcentro 1150, `Venda em Boitel`) vai **SO' O LIQUIDO DO ACERTO**.
  Faturamento do abate, diarias e sanidade NAO sao linhas do financeiro: ficam no MODAL, como
  discriminacao do acerto. `R$/@ de venda = liquido / arrobas VIVAS que sairam da fazenda`.
  ⚠ ELA CORRIGE A REGRA DE 15:26, e a diferenca nao e' de detalhe: a versao anterior mandava o
    BRUTO (`valor_total_abate`) para 1150 e as diarias como custo variavel proprio. Bruto no DRE
    faria o boitel parecer receita de R$ 3,4 mi onde o produtor recebeu R$ 2,5 mi, e a @ de venda
    sairia pelo peso de CARCACA de um animal que saiu vivo da fazenda. Quem ler o historico desta
    frente encontra as duas versoes; vale esta.
  ⚠ A2 — FEITA em 25/09/2026, e NAO como estava descrita aqui. O texto antigo dizia que nada
    levava o saldo do acerto ao lote; MEDIDO, levava: `aplicarRealizadoBoitel` (LancamentosTab)
    chama `oc_revalorar_lote` com `liquidoDaVendaBoitel(realizado)` — que e' EXATAMENTE o
    "(=) Saldo do acerto" do resumo lateral (`fba - descontoDoAcerto`, a mesma conta) — e ela
    grava lote, `valor_acordado` E `lancamentos.valor_total` do rebanho.
    O defeito era o caminho de VOLTA. Trilha da OC 8b211cae (NJ, venda boitel, 25/09):
      09:14:08.7  revalorar_lote    848.713,32 -> 882.608,62   (o realizado chegou)
      09:14:23.3  salvar_lotes      payload 848.713,32          (o CONFIRMAR grava antes de fechar)
      09:14:23.7  fechar
      09:14:53    registrar_movimentacao — o lancamento 6e52056c nasce com 848.713,32
    Dois furos somados: `salvarNegociacaoVendaOC` sobrescrevia o lote com a PROJECAO sempre, e a
    trava de `oc_salvar_lotes` so' existia no CAMINHO B (com saida registrada) — a saida veio 30 s
    depois do Confirmar, entao o `salvar_lotes` caiu no CAMINHO A, sem trava.
    Conserto: migration 20261027145000 (md5 33f47101 -> cc94c75d) poe o MESMO predicado no
    CAMINHO A; o front nao sobrescreve com realizado aplicado (`realizadoAplicadoNoLote`, espelho
    do predicado do banco) e o LoteDialog mostra o valor "derivado do acerto". Provado em rollback
    na 8b211cae: funcao velha no CAMINHO A desfaz (848.713,32); nova preserva 882.608,62 nos dois
    caminhos, no lote, no `valor_acordado` e no lancamento.
    ⚠ A FORMULA NAO FOI PARA O SQL, de proposito: `oc_salvar_boitel` calculando o saldo seria a
    segunda copia de `derivadosBoitel` (flags, fato x derivado, mortes, abatidas), e o UPDATE
    proposto nao corrigiria o lancamento do rebanho — o `oc_revalorar_lote` corrige.
    ⚠ `acerto_papel` NAO E' O SALDO: e' o "A RECEBER DO BOITEL", com o adiantamento dentro.
    Vera b58bf556: 593.139,96 + 95.243,50 = 688.383,46.
  ⚠ A3: aviso quando o DIGITADO diverge do saldo do acerto, com os dois numeros.
  ⚠ GABARITO SAO AS DUAS OCs DA VERA (`b58bf556`, 13/05/2026; `7f7de76f`, 14/05/2026) — as unicas
    com `acerto_papel` preenchido (688.383,46 e 305.371,67) e adiantamento. Medido em 24/09: a
    parcela que o operador digitou ja' e' aproximadamente o liquido (abate menos diarias), com
    delta de -7.566,57 e -157,60 — ou seja, a regra nova FORMALIZA o que ele ja' fazia a mao. O
    residuo desses deltas NAO foi medido e e' FASE 0 da PARTE A.
  ⚠ E HA' UM ESCRITOR CONCORRENTE EM 1150, achado no B2: `origem_tipo = 'boitel:receita'`, duas
    linhas da Vera em `previsto` (642.056,67 e 594.573,33), fora da OC. Quem implementar a PARTE A
    confere se ele e o novo caminho contam a MESMA receita duas vezes.

- ⚠ OC-BOITEL-VALOR-01 A3 — O VALOR DA OPERACAO E' O SLOT; A TELA NUNCA O CALCULA (regra
  permanente, 25/09/2026). Fonte unica = `zoo_operacao_lotes.valor_informado` (soma =
  `zoo_operacoes_comerciais.valor_acordado`). Sem realizado o slot guarda a projecao gravada; com
  realizado aplicado, o liquido do acerto (`oc_revalorar_lote`), e a trava da A2 impede a projecao de
  voltar por cima. Resumo lateral, LoteDialog, Documentos, Gerar compromissos e a previsao leem o
  slot; o helper e' `valorDaVendaBoitel` (`BoitelNegociacaoDerivado.tsx`).
  ⚠ NASCE DE UMA HOMOLOGACAO QUE "FALHOU" SEM TER FALHADO. Na 8b211cae o resumo e o LoteDialog diziam
    882.608,62 — DERIVADOS da linha realizada — enquanto lote, `valor_acordado`, rebanho, Documentos e
    Gerar compromissos diziam 848.713,32, que era o GRAVADO: o Realizado nunca tinha sido reaplicado
    depois da trava. As telas certas pareciam o erro, e a errada escondia o estado do banco. O B-11
    tinha feito o resumo derivar "para ficar imune ao rebaixamento"; a imunidade agora mora no banco.
  ⚠ O ACERTO E' CONFERENCIA, NAO VALOR: com o realizado aplicado e o slot a mais de um centavo de
    `liquidoDaVendaBoitel(realizado)`, a tela mostra os dois — linha ambar "Acerto do boitel R$ X ·
    reaplique o Realizado" no resumo e no LoteDialog — e o "Gerar previsao" RECUSA, com a mesma frase.
  ⚠ A PREVISAO NAO SAI — decisao do Gabriel: o boitel paga 3-4 meses depois, e o "a receber" alimenta
    financeiro e fechamento. O defeito era ela nascer SOLTA (`lote_id` nulo), da PROJECAO, e nunca ser
    atualizada. Agora nasce do slot e LIGADA AO LOTE, e `oc_revalorar_lote` (migration 20261027146000,
    md5 96556ae0 -> cd372556) atualiza o MESMO compromisso — nunca um segundo, nunca orfao:
      aberto e sem programacao -> valor novo + `lote_id`, trilha 'ajustar_valor_compromisso' com
        origem 'realizado aplicado' (de X para Y), sem pedir motivo;
      sem lote (previsao antiga) -> adotado quando a operacao tem UM lote e UMA principal ativa solta;
      com programacao, titulo ou baixa -> NAO mexe; a resposta devolve `compromisso.acao = 'pendente'`
        e o caminho e' `oc_reprogramar_compromisso_do_lote` (com motivo). DECISAO EM ABERTO.
  ⚠ MORA NO BANCO PORQUE UMA RPC E' UMA TRANSACAO: no front, uma falha entre o revalorar e o ajuste
    deixaria o lote no realizado e o "a receber" na projecao — o estado exato que esta frente conserta.
  ⚠ E A ACL FECHOU JUNTO: `oc_revalorar_lote` estava com EXECUTE para PUBLIC (SECDEF que escreve).
  ⚠ FICAM DA PROJECAO, e e' decisao pendente: as linhas de ADIANTAMENTO e de DESPESAS FORA DO BOITEL
    da previsao saem de `derivadosBoitel(boitelData)` (a linha `projetado`) mesmo com realizado.
  ⚠ PROVADO EM ROLLBACK na 8b211cae, com uma previsao solta de 848.713,32 criada pelo writer real:
    funcao velha revalora o lote e deixa o compromisso em 848.713,32 e solto; nova, SEM programacao,
    atualiza para 882.608,62 e liga ao lote (uma principal ativa, trilha gravada); COM programacao,
    `pendente` e nada muda; repetida, idempotente.

- ⚠ OC-BOITEL-VALOR-01 A4 — O REALIZADO VENCE A PROJECAO EM TUDO (decisao do Gabriel, 25/09/2026).
  Com o realizado aplicado, as linhas de adiantamento, adiantamento devolvido e despesas fora do boitel
  da previsao saem da linha `realizado` (`custosDaVendaBoitel`, irmao do `valorDaVendaBoitel`, com o
  MESMO predicado `realizadoAplicadoNoLote`). Liam sempre a projetada: na Vera 7f7de76f o
  "adiantamento devolvido" ficou em 42.416 com o realizado dizendo 46.458,50.
  ⚠ AS CONTAS SAO AS DO MOTOR (`valorTotalAntecipadoCalc`, `custosDoProdutor`); so' muda qual linha
    entra. O seletor de lado (produtor x boitel) continua valendo.
  ⚠ O REVALORAR `pendente` AGORA E' DITO: `OcRevalorarLoteEnvelope` ganhou `compromisso`, e o
    `aplicarRealizadoBoitel` avisa "O compromisso programado ficou em R$ X. Use Atualizar compromisso
    na aba Financeiro." Sem regra automatica; o `DialogoAtualizarCompromisso` segue sendo o caminho.
  ⚠ O "+ NOVO COMPROMISSO" MANUAL RECUSA A PRINCIPAL na divergencia do A3, com a mesma frase
    (`recusaDaPrincipalManual`). Obrigacoes manuais nao mudam.
  ⚠ A4b — O ITEM QUE O REALIZADO ZERA CANCELA O COMPROMISSO DELE, DEPOIS DE CONFIRMAR (decisao do
    Gabriel). Com o realizado aplicado, adiantamento, adiantamento devolvido e despesas fora do boitel
    que vieram zero viram linha marcada (`LinhaPrevisao.zerada`). O "Gerar previsao" PLANEJA antes de
    gravar (`planejarPrevisao`, pura): zerado com compromisso aberto e sem programacao -> cancelar;
    zerado com programado -> bloqueadas, com "(zerada pelo realizado)"; zerado sem compromisso ->
    nada. So' quando o plano cancela abre a `ConfirmacaoPrevisao` — o `AlertDialog` da casa, o mesmo das
    confirmacoes de lote do Financeiro V2 — listando o que sera cancelado e o que sera gerado, com
    "Confirmar" e "Voltar". Sem campo de motivo: o gravado e' fixo, "item zerado pelo realizado", pelo
    mesmo `cancelarCompromisso` do substituir (trilha no banco). O caso normal segue SEM PERGUNTA.
    ⚠ ERA A DIVERGENCIA DE ANCORA DO A4: o briefing pedia "o dialogo de previsao", que nao existia
      (ZERO PERGUNTA, PR-OC-VENDA-FIN-PREVISAO-01). A saida foi a do Gabriel — confirmacao so' nesse
      caso — e o comentario ZERO PERGUNTA registra a excecao.
    ⚠ `previsaoDe` IGNORA A LINHA ZERADA: ela nao e' previsao de nada, e nao pode pintar a pilula nem
      semear o vencimento do "Lancar realizado".
    ⚠ SO' DAQUI PARA FRENTE: a RRCC da0b8577 (1e33fb64, 6.000 aberto) e' exatamente o caso, mas as OCs
      antigas estao fora do A4 — o cancelamento acontece quando alguem gerar a previsao dela.

- ⚠ OC-MOTIVO-UNICO-01 — UM GESTO DE DESFAZER = UM MOTIVO + UM `estorno_id` EM TODOS OS EVENTOS
  (regra permanente, 25/09/2026; a pendencia do A4 esta' BAIXADA). O "Cancelar compromisso" do menu
  da linha virou "Desfazer compromisso" (`AbaCompromissosOC`): o mesmo dialogo de duas etapas lista o
  rol inteiro (titulos a estornar com valor e vencimento, a programacao, o compromisso) e pede o motivo
  UMA vez. A cadeia (`src/lib/oc/desfazerCompromisso.ts`) chama as tres RPCs que ja' existiam, na ordem
  FOLHA -> RAIZ que as guardas impoem — `oc_estornar_materializacao` (cada parcela materializada),
  `oc_cancelar_programacao`, `oc_cancelar_compromisso` — com o MESMO motivo e o MESMO `p_estorno_id`
  gerado no front (as tres ja' o aceitavam; ninguem mandava). Versao pelo retorno de cada escrita.
  ⚠ NASCE DE TRES "erro" DIGITADOS EM 13 SEGUNDOS: o 0fdec0eb da 8b211cae (25/09, 12:47:20, :25 e :33)
    teve tres dialogos, seis confirmacoes e tres `estorno_id` diferentes — a trilha nem dizia que eram um
    gesto so'. A causa era `abrirEstorno` zerar o motivo a cada abertura.
  ⚠ NAO E' TRANSACAO, e por isso RELE O BANCO ANTES DE CADA NIVEL (`lerEstadoDoDesfazer`, direto das
    tabelas): o que ja' esta' desfeito e' pulado e o mesmo botao retoma uma cadeia interrompida, com o
    MESMO `estorno_id` (ele nasce na abertura do dialogo). "Ja' desfeito" do banco e' idempotencia, nao
    erro.
  ⚠ RECUSA DO BANCO PARA A CADEIA (E3: titulo realizado, conciliado, liquidacao ativa): o dialogo mostra
    a mensagem da RPC, o que ja' foi e o que falta. Nada e' contornado; nenhuma guarda mudou.
  ⚠ QUEM INICIA O GESTO CONTINUA OBRIGADO A DAR O MOTIVO (front e RPC). So' a repeticao sumiu. Motivo
    vazio nao executa nada, nem a leitura.
  ⚠ OS GESTOS AVULSOS FICAM COMO ESTAVAM — "Estornar lancamento" e "Cancelar programacao", cada um com
    o seu motivo e sem `p_estorno_id` (decisao do briefing: so' o gesto em cadeia manda o id).
  ⚠ EVOLUCAO REGISTRADA, NAO FEITA: `oc_desfazer_compromisso` em transacao unica, se um dia a
    atomicidade for necessaria. Com o `estorno_id` compartilhado a auditoria fica igual nos dois
    desenhos — a troca pode vir sem mudar a trilha.

- ⚠ FIN-V2-CANCEL-MOTIVO-01 — CANCELAR PELO FINANCEIRO V2 EXIGE MOTIVO NO HOOK, E TITULO DE OC NAO SE
  CANCELA POR ESTA PORTA (25/09/2026; a pendencia de mesmo nome, aberta na FASE 0 do OC-MOTIVO-UNICO-01,
  esta' BAIXADA).
  (1) `excluirLancamento(id, motivo)` e `excluirLancamentosEmLote(ids, motivo)` recusam motivo vazio
  (`motivoInformado`, `MOTIVO_OBRIGATORIO` em `src/lib/financeiro/cancelamentoLancamento.ts`) e gravam
  `cancelado_motivo` + `cancelado_por` SEMPRE. Antes o motivo era obrigatorio so' no botao do dialogo, e o
  lote nem o pedia: medido na FASE 0, ~14,1 mil dos ~14,4 mil cancelados do banco estao sem motivo. O
  dialogo de exclusao em lote da `FinanceiroV2Tab` ganhou o campo, com o botao travado e dizendo por que.
  ⚠ SAIRAM `cancelarRealizadosImportados` e `cancelarMigracao` do hook — zero chamadores, conferido por
    import antes de apagar. Os helpers que so' elas usavam, `prepararCancelamentoEmLote` e
    `lotesDeCancelamento` (`src/lib/financeiro/listaPaginadaV2.ts`), FICARAM: tem teste proprio
    (`exportacaoLista.test.ts`, bloco E7) e agora nao tem chamador em `src/`. Divida de limpeza, fora do escopo.
  (2) TITULO COM PARTE VIVA DE OC (`zoo_operacao_partes.cancelada = false`) nao se cancela pelo Financeiro —
  nem no dialogo, nem no lote, nem no hook. O caminho e' o "Desfazer compromisso" da OC, que desfaz titulo,
  programacao e compromisso juntos e recusa titulo realizado ou conciliado. No lugar do botao, o
  `RodapeCancelamento` poe "Titulo de operacao comercial — desfaca pelo Desfazer compromisso" e "Abrir OC".
  O lote PULA esses ids (`separarTitulosOC`) e diz quantos e por que; o resto do lote segue.
  ⚠ "PARTE VIVA", NAO `origem_lancamento`: um lancamento manual vinculado a OC (VINCULAR-LANC-OC-01) tem
    parte viva e origem 'manual'. O criterio e' o que a OC enxerga.
  ⚠ A TELA E' CORTESIA, O HOOK E' A TRAVA: o dialogo consulta a parte para esconder o botao, e o hook
    consulta de novo antes de gravar. Nao ha' guarda no banco para isso (ver CANCEL-MOTIVO-BANCO-01).
  (3) REABRIR -> ATUALIZAR COMPROMISSO NAO FUNDE AS DUAS PERGUNTAS. Se o operador reabriu na MESMA sessao da
  OC (venda e abate), o `DialogoAtualizarCompromisso` nasce com o motivo da reabertura no campo, EDITAVEL e
  marcado em ambar ("motivo da reabertura — confirme ou troque") enquanto for a sugestao intocada. Nada grava
  sem o clique. A sessao zera quando troca a OC (`ocOperacaoId`). COMPRA SEM MUDANCA: o shell dela nao passa
  o motivo, e o campo nasce vazio como antes.
  ⚠ O UNICO CASO REAL DA SEQUENCIA no banco (FASE 0): OC 2b44889d, reabriu e reprogramou em 2 minutos, com
    dois motivos diferentes. Sao duas decisoes — entre elas o operador edita o lote —, e a regra "valor
    sugerido e' valor aceito" pede a marca, nao a fusao.

- ⚠ OC-DESVINCULAR-01 — UM LANCAMENTO SAI DA OC SEM MORRER (25/09/2026). O inverso do vincular:
  `oc_desvincular_lancamento` (migration `20261027148000_oc_desvincular_01.sql`, ⚠ registrada como
  `20260925204312`; md5 do corpo 1b667a26, banco = arquivo). SECURITY DEFINER, EXECUTE so' authenticated e
  service_role, versao, motivo unico, `p_simular` pelo mesmo caminho desfeito (SQLSTATE 'OCSIM'), evento
  'desvincular_lancamento' com antes/depois e o id da parte. Gesto "Desvincular" no menu da linha da aba
  Financeiro da OC (um item por titulo VIVO) e no rodape do `LancamentoV2Dialog` (so' com parte viva); dialogo
  `DesvincularOperacaoDialog`, nascido do do vincular (as pecas comuns foram MOVIDAS verbatim para
  `modalVinculoOC.tsx`).
  O que a RPC faz: cancela a parte; ESTORNA a liquidacao automatica do titulo; cancela a parcela e, sem parcela
  viva, programacao e compromisso (senao o compromisso vale a soma das vivas); `origem_lancamento
  'operacao_comercial'` -> 'manual' e `origem_tipo 'oc:'` -> NULL. Valor, pagamento, conta, competencia e
  conciliacao NAO se tocam.
  ⚠ O GATILHO NAO ESTORNA A LIQUIDACAO SOZINHO, e foi MEDIDO: cancelar a parte dispara
    `oc_sincronizar_liquidacao_de_financeiro`, que sem parte ativa e com titulo liquidado nao faz nada. Sem o
    estorno explicito, o "recebido" da c80ebe9e continuaria 107.367,46.
  DECISOES DO GABRIEL:
  D1 `zoo_operacao_partes_titulo_uniq` virou INDICE PARCIAL (`WHERE cancelada = false`). ⚠ ERA CONSTRAINT UNIQUE,
     nao indice solto — a primeira prova falhou no `DROP INDEX` (2BP01); saiu o constraint e entrou o indice
     com o mesmo nome. Nenhuma FK o referenciava e nenhum ON CONFLICT o usava. A parte cancelada continua
     apontando o titulo. ⚠ QUEM LE PARTE POR LANCAMENTO FILTRA `cancelada = false` — acompanharam o
     `useFinanceiroV2` (trava da classificacao), o `lancamentoTemParteOC` (botao Vincular), `oc_candidatas_vinculo`
     E `oc_vincular_lancamento` (este fora da letra do briefing: sem ele a candidata diria "elegivel" e a RPC
     recusaria "ja esta ligado"). Ficam conservadores, e ja' contam parte cancelada como vinculo:
     `useImportLancamentosExcel:812` (a reimportacao trata o desvinculado como titulo de OC) e tres EXISTS no
     banco (`fn_contrato_editar_e_regenerar`, `oc_limpar_operacao_teste`, `oc_adotar_titulo_financeiro`).
  D2 `oc_estornar_materializacao`: status realizado/conciliado e `conciliado_em` NAO contam em titulo JA
     CANCELADO. Liquidacao ativa e vinculo bancario vivo continuam recusando em qualquer titulo (dinheiro vivo;
     num titulo cancelado seriam estado inconsistente). E' o que deixa o Desfazer limpar a Graxaria 73a183eb e os
     orfaos e8032b0d/f489abd9. Provado: a guarda segue recusando o principal 3e05fd75 (realizado) e o 09b8c62d
     (conciliado).
  D3 "valor da OC recalculado" = RECEBIDO (liquidacoes vivas) e TOTAL DOS COMPROMISSOS. `valor_acordado` nao muda.
  D4 Desvincular NUNCA cancela o lancamento. "Reclassificar para" e' opcional (`p_plano_conta_id`): conta ativa,
     global ou do cliente, e com a MESMA direcao do lancamento; grava a chave e as copias da linha do plano no
     mesmo gesto, com o mesmo motivo, de/para no evento.
     ⚠ A "REGRA 9 DO PLANO DE CONTAS" DO BRIEFING NAO EXISTE EM ARQUIVO NENHUM (docs/, Constituicao, ADRs,
       memoria). O alinhamento seguido e' o do gatilho `resolve_classificacao_from_plano` (PR-FIN-PLANO-CHAVE-02).
     ⚠ CONTA ADMINISTRATIVA LEVA A FAZENDA JUNTO: o gatilho aplica FIN-FAZENDA-ADM-01 — fazenda "Administrativo" e
       safra nula. Medido: e' o que aconteceu com a entrada de 5.056 (a721d5ca) quando o Gabriel a reclassificou
       para "Estorno Recebido". O resumo da simulacao diz fazenda, safra e DRE de/para antes do clique.
  PROVAS EM ROLLBACK (no cabecalho da migration): c80ebe9e / a5c1c61a com e sem conta (recebido 107.367,46 ->
  102.311,46, lancamento igual salvo origem; com "Pagamento Estornado", fazenda Administrativo e fora do DRE);
  varias parcelas (4c5e8c86: 380.000 -> 80.000); controle conciliado 09b8c62d (1 vinculo antes e depois);
  Desfazer da Graxaria antes (recusa) e depois do D2 (tudo cancelado); guarda ainda recusando titulo vivo.
  ⚠ NAO FOI EXECUTADO NA c80ebe9e REAL — o Gabriel faz pela tela. O estado final pedido sai de DOIS gestos:
    Desvincular a saida a5c1c61a (com "Pagamento Estornado") e Desfazer a Graxaria 73a183eb.

- ⚠ OC-LIQ-SINAL-01 — A NATUREZA DA LIQUIDACAO SEGUE A DIRECAO DO TITULO, E O RESUMO DA CENTRAL LE
  PELO LADO DA OC (25/09/2026). Migration `20261027149000_oc_liq_sinal_01.sql` (⚠ registrada como
  `20260925210751`).
  ⚠ A PREMISSA DO BRIEFING ESTAVA ERRADA, E O ERRO FOI MEU. Eu reportei "recebido 107.367,46" e depois
    "108.084,29" da c80ebe9e — era a soma CRUA das liquidacoes, feita por mim no SQL. O modal da OC ja'
    separava os lados pela conta do plano do compromisso (`vw_oc_operacao_compromissos_resumo`): "Recebido"
    102.311,46 o tempo todo. O "recebido" que eu cunhei nao existia em tela nenhuma.
  ⚠ E A NATUREZA NAO ENTRAVA EM CONTA NENHUMA: nenhuma funcao, view ou tela soma ou exibe por ela
    (`vw_oc_operacao_liquidacao` e `oc_derivar_status` somam TODAS as liquidacoes vivas, pelo modelo da
    ADR-19 — "liquidacao nao e' dinheiro, e' satisfacao de obrigacao"). Provado em rollback: com a natureza
    corrigida, liquidado, saldo e estado das 14 OCs ficaram IDENTICOS.
  (A) `oc_sincronizar_liquidacao_de_financeiro` (538b8706 -> d139826a): entrada = 'recebimento', saida =
     'pagamento', pelo `tipo_operacao` do titulo. Backfill das 35 automaticas (32 vivas, 3 estornadas; 14
     OCs; R$ 228.258,77 vivos). 28 das 32 eram obrigacoes MATERIALIZADAS PELA PROPRIA OC (adiantamento do
     boitel 183.937,00, taxas 21.892,36, frete 12.009,50, devolucao 5.056,00); 3 do Vincular; 1 frete manual.
     Lancamentos e vinculos bancarios identicos por md5 (137 e 41 linhas).
     ⚠ AS DUAS FONTES DE DIRECAO CONCORDAM — a conta do plano do compromisso e o titulo — em 130 de 130.
     ⚠ O ESCRITOR MANUAL ALINHOU (e4e7f0ab -> 430a34dd): `oc_registrar_liquidacao` exigia a natureza do TIPO
       DA OC, e a `AbaLiquidacaoOC` liquida qualquer obrigacao com titulo — o defeito voltaria por ali. Com
       titulo, a natureza e' a direcao dele; sem titulo (permuta), o lado da OC; NULL e' derivado; natureza
       informada e errada continua recusada. O front (`useOperacaoLiquidacao`) manda NULL quando ha' titulo.
       Zero liquidacoes manuais existiam.
  (B) O RESUMO DA CENTRAL (`src/v2/lib/ocResumo.ts` -> modal, PDF, Excel) lia "Valor" = `obrigacao_total` e
     "Pago" = todas as liquidacoes: os dois lados somados. c80ebe9e saia Valor 113.140,29 / Pago 108.084,29
     numa venda de 102.311,46; b58bf556 saia "paga 14%" sem um real recebido do boitel. Agora
     `valoresPeloLado`: venda/abate = ENTRADAS, compra = SAIDAS, o outro lado na coluna "Despesas"; a coluna do
     dinheiro diz "Recebido"/"Falta receber" (venda, abate) ou "Pago"/"Falta pagar" (compra). Sem compromisso,
     o caminho de antes (despesas "—"). Nenhuma migration.
     ⚠ O ESTADO DA OC NAO MUDOU — e' o OC-STATUS-LADO-01. A situacao continua lendo `estado_liquidacao` da
       view; so' a porcentagem ja' le' o lado, entao b58bf556 mostra "paga 0%" ate' la'.
     ⚠ FICOU COMO ESTAVA a lista de parcelas em aberto do resumo ("Falta receber" por parcela), que junta
       parcelas dos dois lados. (FEITO no OC-STATUS-LADO-01: a lista separa o lado das despesas.)

- ⚠ OC-STATUS-LADO-01 — O ESTADO DE LIQUIDACAO DA OC OLHA O LADO DA OPERACAO; O OUTRO LADO VIRA DESPESA
  (25/09/2026, decisao do Gabriel; ADR-2026-20, que referencia a 16 e a 19 sem edita-las — a 19 manda
  "mudanca conceitual = novo ADR"). Migration `20261027150000_oc_status_lado_01.sql` (⚠ registrada como
  `20260925212116`).
  `vw_oc_operacao_liquidacao`: mesmas colunas, na mesma ordem, pelo LADO (venda/abate: entradas; compra:
  saidas). base = obrigacao do lado pelo COMPROMISSO (`vw_oc_operacao_compromissos_resumo`, a fonte do
  modal e do Resumo); liquidado = liquidacoes de natureza do lado (confiavel desde o OC-LIQ-SINAL-01; bate
  com o liquidado por compromisso nas 78 OCs com compromisso); `base_origem = 'compromisso_lado'`. Tres
  colunas novas no fim: `despesas_obrigacao`, `despesas_liquidado`, `despesas_pendentes`. A regua
  `_oc_estado_liquidacao` INTACTA.
  ⚠ SEM COMPROMISSO NO SEU LADO, A CONTA DE ANTES (lote + obrigacoes x tudo), despesas NULL. E' a guarda
    contra um "quitada" falso: venda com so' o frete cadastrado teria base do lado zero e liquidado zero.
    Medido: zero OCs vivas nessa condicao; as 23 sem compromisso ficaram IDENTICAS.
  ⚠ O REPLACE LEVOU `WITH (security_invoker = true)` e ele foi conferido depois (`pg_class.reloptions`).
  PROVA EM ROLLBACK (a view inteira antes x depois): mudaram de estado EXATAMENTE sete, nenhuma outra —
    8a6295f0, b58bf556, 7f7de76f, 581d075c, 2d39d7e9  parcial -> nao_liquidada (so' despesa paga)
    744c520e  parcial -> quitada   (principal recebido; frete de 20.615 vira despesa pendente)
    da0b8577  excedente -> quitada (base do lote 416.836,79 -> do compromisso 466.030,10; frete 6.000 pendente)
  02be1a41 nao muda de estado e ganha o indicador (Fundersul 2.165,49). Outras 11 OCs mudam base/liquidado
  sem mudar de estado — as obrigacoes do outro lado sairam dos dois termos. A compra CANCELADA cfdc86ae cai de
  145.500 para 71.900 porque os compromissos dela nao cobrem o acordado: e' o efeito de "base pelo
  compromisso", numa OC que a Central nem mostra.
  FRONT: Central — a pilula de Pagamento le o estado novo; ponto ambar NO CANTO da celula (absoluto) quando
  `despesas_pendentes` > 0,01, valor no `title`. ⚠ A PRIMEIRA VERSAO PUNHA O PONTO EM LINHA e o preview mostrou
  que ele sumia: celula de 49px, "aguardando" + ponto = 58px, `overflow-hidden` — presente no DOM, cortado na
  tela. jsdom nao faz layout, entao o teste passava; so' a tela via; "Paga X%" divide o liquidado do lado pela base do lado (antes, tudo por tudo:
  b58bf556 "Paga 14%"); o filtro "Pagamento" ganhou "Despesas pendentes" (`src/lib/oc/estadoPeloLado.ts`).
  Resumo — a situacao le o estado novo pela view; a lista de parcelas em aberto separa o lado das
  "Despesas em aberto" (lista, secao de PDF e aba de Excel proprias), pela conta do plano do compromisso.
  ⚠ DIVERGENCIA DO BRIEFING, NAO ADAPTADA: a `AbaLiquidacaoOC` so' monta em modo LEGADO (sem compromissos —
    ver `AbaFinanceiroOC`), e hoje ha ZERO OCs ativas nesse modo (77 novo_modelo, 3 nova_vazia). Para OC sem
    compromisso nao ha lado, e a view mantem a conta antiga; o badge e o confronto ja' leem a view. O bloco
    de despesas pedido nao teria o que mostrar e nao foi feito.
  ⚠ `oc_derivar_status` E' CODIGO MORTO — zero chamadores no front e no banco (medido). NAO foi alinhada: seria
    uma segunda copia desta regra. Quem a achar nao a religa; le' a view.

- OC-COMPRA-REVALOR-01 — ⚠ O DEFEITO BRIEFADO NAO EXISTIA, e o registro e' sobre o metodo.
  Sintoma (NJ, compra f56c50d3, 24/09/2026): o Gabriel corrigiu o valor do lote para
  896.644,48, o financeiro e o documento seguiram com 892.645, e a Negociacao recusava com
  "Negociacao fechada; reabra para editar" enquanto a tela aparentava aberta e sem botao de
  reabrir. O briefing concluiu, da trilha, que `salvar_rascunho` disparava `fechar` 135 ms
  depois e mandou tirar o auto-fechar.
  ⚠ MEDIDO: NAO HA AUTO-FECHAR. O par de eventos sai de `confirmarOperacaoOC`
  (`LancamentosTab:3378`), que e' o botao CONFIRMAR — ato explicito. A ordem e' a inversa da
  suposta: ele GRAVA antes de fechar, e a razao esta' escrita em :3371 desde o
  PR-OC-AUTOSAVE-01 — "quem editasse e clicasse em Confirmar PERDIA a edicao sem aviso
  nenhum". Tirar aquele `salvarOperacaoOC()` reabriria o defeito antigo.
  ⚠ E O `oc_salvar_lotes` COM 896.644,48 NUNCA RODOU: a trilha tem UM `salvar_lotes`, o das
  21:52, com 892.645. `valor_acordado`, soma dos lotes, compromisso (cancelado) e o
  lancamento zootecnico `da74e900` estao TODOS com 892.645 — nao e' "o documento ficou
  para tras", e' que o valor novo nunca foi gravado.
  ⚠ O STATUS TAMBEM JA' ERA FRESCO: `confirmarOperacaoOC`, `reabrirOperacaoOC` e
  `concluirNegociacao` chamam `recarregarOperacaoOC()` / `onStatusChange`, e este faz
  `setOcStatusComercial`. O segundo defeito briefado tambem nao existia.
  ⚠ A LICAO E' DE METODO, e ela vale para os dois lados: a trilha de eventos mostra O QUE
  aconteceu e nao POR QUE — dois eventos a 135 ms sugerem causa e podem ser um clique so'
  com duas RPCs. Briefar conserto a partir de trilha, sem reproduzir na tela nem ler o
  chamador, produz um PR que apagaria uma protecao existente. O que restou de real era de
  UX, e entrou: a recusa ganhou o botao "Reabrir" inline (o texto dizia o que fazer e nao
  ONDE — o botao mora no rodape da aba de identificacao, sob `status === 'fechada'`, e quem
  esta' na Negociacao nao o ve'), e o rotulo "Confirmar negociacao e seguir" virou
  "Confirmar, fechar e seguir", porque ele informava a navegacao e calava o efeito.

- OC-DOC-ESPECIE-01 — a `especie` de `zoo_operacao_documentos` e' preenchida A MAO e erra.
  ⚠ CORRIGIDO EM 25/09/2026: O "OUTRO" EM MASSA ERA DEFEITO DE CODIGO, NAO PREENCHIMENTO — e morava no
    FINANCEIRO, nao na OC. A aba Documentos do lancamento sobrescrevia a especie no anexo (ver o bloco
    OC-DOC-ESPECIE-01 — CONSERTO, logo abaixo), e 13 documentos ficaram em 'outro' com o nome dizendo nf,
    recibo ou comprovante. O registro abaixo culpava o operador por um padrao que o sistema produzia.
  ⚠ OS DOIS EXEMPLOS DA OC, POREM, CONTINUAM SENDO ESCOLHA MANUAL — medido: o nome automatico e'
    `especie || ' ' || numero`, e a NF da Vera se chama "outro NF_Abate - Boitel" (d9984ade, 30/08). O
    prefixo e' a especie escolhida NA CRIACAO, na aba da OC, que nunca teve o defeito. A regra abaixo
    (filtrar por `especie`, tolerar, o operador corrige) segue valendo para a OC.
  Medido em 24/09/2026, no OC-PDF-ORIGEM-NF-01:
    · a NF do boitel da Vera (OC b58bf556) esta' cadastrada como `outro` ("NF_Abate - Boitel"),
      entao aquela OC conta ZERO `nf_principal` mesmo tendo nota;
    · a venda 581d075c tem DUAS `nf_principal` com `numero` NULO, entre 12 anexos que incluem
      recibos, contratos e comprovantes de pagamento.
  ⚠ NAO HA GATE, E NAO DA' PARA ADIVINHAR. Inferir NF pelo nome do arquivo poria contrato e
    romaneio na coluna da nota — pior que o traco. Quem le NF FILTRA por `especie` e tolera o
    que vier: sem numero, a nota e' ignorada; sem nenhuma, "—". Quem corrige e' o operador, na
    aba Documentos.
  ⚠ E "2+ DOCUMENTOS" NAO E' "2+ NFs", erro que eu mesmo cometi na primeira contagem: dos 109
    lancamentos de OC, 31 tem 2+ documentos mas so' 9 tem 2+ `nf_principal`. Contar anexo conta
    contrato.

- ⚠ OC-DOC-ESPECIE-01 — CONSERTO: O ANEXO SO' FALA DO ARQUIVO, NUNCA DA ESPECIE (25/09/2026).
  `useLancamentoDocumentos.anexar` manda `url`, `tipo` e `tamanho_bytes` (na OC, so' `url` — o mesmo
  payload do `anexarArquivo` da aba da OC) e recebe o ENDERECO do documento de quem chama
  (`DestinoDocumento`): do `registrar`, que devolve onde o criou, ou do documento em edicao. Nunca da
  lista em memoria.
  ⚠ O DEFEITO: o `salvar` do formulario chama `registrar` e `anexar` no MESMO clique, com a API do render
    anterior. O `anexar` procurava o documento naquela lista — que nao o tinha — e mandava
    `especie: doc?.especie ?? 'outro'`. Presente desde 4ccaadd2 (05/09/2026). Tres sintomas: (1) criar com
    arquivo gravava 'outro' qualquer que fosse a escolha; (2) editar trocando a especie E anexando voltava
    a especie velha; (3) com destino OC, o arquivo subia no bucket do LANCAMENTO e o `fin_documento_editar`
    recebia um id da OC.
  ⚠ E A LEITURA TAMBEM MENTIA: `especieValida` transformava o `nf_principal` da OC em 'outro' — a NF da
    OC aparecia como "Outro" na aba do lancamento. Agora `especieDaOCNoLancamento` traduz, `especieOC`
    guarda a crua e `rotuloEspecieDoc` mostra "NF" / "NF complementar". A especie de documento da OC e'
    SO' LEITURA nesta aba (troca-se na aba da OC), e a edicao NAO a manda — `LancDocPayload.especie`
    virou opcional, e ausente e' preservada.
  ⚠ MAIS DOIS FECHAMENTOS VELHOS, da mesma familia: o `registrar` nao tinha `operacaoId` nas dependencias
    (guardava o da primeira carga), e `editar`/`cancelar` nao tinham `origemDoDocumento` — guardavam a
    lista VAZIA da primeira carga, entao editar ou cancelar a NF da OC por esta aba batia em
    `fin_documento_*`, que nao a conhece. Este ultimo nao estava no briefing: ACHADO PELO TESTE, na
    primeira rodada, e ja' existia em HEAD.
  ⚠ BACKFILL DOS 13 (migration `20261027151000_oc_doc_especie_01_backfill.sql`, ⚠ registrada como
    `20260925220111`): por ID, com guarda (em 'outro', vivo, nome medido; senao aborta) e trilha em
    `audit_log` (de 'outro' para X, "OC-DOC-ESPECIE-01: especie sobrescrita no anexo"). 11 nf, 1 recibo,
    1 comprovante — Agnaldo 1, NJ 8, Vera 4. Documentos com especie diferente do nome mas fora de 'outro'
    (escolha posterior do operador) e documentos da OC NAO foram tocados.
  ⚠ UM 14o NASCEU DEPOIS DA FASE 0: 3be1da9a ("nf 119306", Vera, 25/09 18:52) — o mesmo defeito, enquanto
    o conserto nao subia. Entrou pelo MESMO criterio, decisao do Gabriel, na migration
    `20261027151100_oc_doc_especie_01_backfill_b.sql` (⚠ registrada como `20260925222129`): mesma guarda,
    mesma trilha, 'outro' -> 'nf'. Antes dela, a varredura ('outro', vivo, nome de outra especie) devolvia
    SO' ele. TOTAL: 14 documentos, 12 nf, 1 recibo, 1 comprovante.
  ⚠ O DOCUMENTO DE TESTE da homologacao (abbc0dfa, "boleto TESTE-ESPECIE-01", no "Lancamento teste"
    8a8cf9c8 do Agnaldo) ficou `boleto` depois do anexo e foi CANCELADO pela tela
    (`fin_documento_cancelar`), motivo "teste do OC-DOC-ESPECIE-01".
  ⚠ O DOCUMENTO DA OC SEM ARQUIVO desde 06/09 (58334bd9, Agnaldo, OC c5bb32e5, "outro NPR", 21/09) NAO e'
    este caso: o unico evento dele e' o `documento_registrar`, e nenhum objeto do storage tem o id dele. O
    defeito deixaria o arquivo ORFAO no bucket do lancamento; aqui nunca houve arquivo.

- ⚠ PISO DE 9,5px (era 10px ate' 2026-09-17; desceu por decisao do Gabriel, na tabela de
  saldos da Conciliacao), COM UMA EXCECAO E SO' UMA: as FILHAS DE GRUPO da Grade do DRE
  (centros de custo dentro de Custeio, Pos-colheita, Custo fixo e Investimento)
  vao a 9px com altura 16 — decisao do Gabriel em 16/09, mock B do
  PR-DRE-LAVOURA-10. A regua inteira mora em `REGUA_LINHA`
  (`src/components/agri/dreGrade.tsx`): subtotal 11/500/20/recuo 0, grupo
  9/500/16/recuo 8, simples 9/400/16/recuo 8, filha 9/400/14/recuo 16, e a
  sub-coluna (R$/ha, /sc, /t) em 9,5 — DESCEU UM PONTO em 22/09/2026, decisao do
  Gabriel no DRE-PADRAO-01a; ate' entao era 12/10/10/9. O DRE INTEIRO passou a ser
  excecao ao piso de 9,5px, e so' ele: era excecao so' a filha. As ALTURAS nao
  mudaram (20/16/16/14) — a fonte menor sobra dentro delas, entao a grade nao
  cresce nem encolhe.
  ⚠ A CONTA DE LARGURA QUE MORAVA AQUI ESTA REVOGADA. Ela dizia que a x Anos cabia em
  1440 sem rolagem — "240 de rotulo + 6 x (96 + 64) = 1200, o container exato" — e ja'
  estava errada em dois termos quando foi escrita: o rotulo e' 200 desde o proprio
  01a, e a coluna de comparacao usa `W_REFERENCIA`, nao `W_RS`. A soma real era 1080.
  ⚠ E AS LARGURAS FORAM RECALIBRADAS no DRE-CASCATA-03b-fix6 (23/09/2026), porque as do
  01a foram medidas com "9.998.280,79" — numero SEM sinal e SEM marcador. No mesmo dia
  entraram a faixa t4 (67a79233) e o marcador ▲/▼ (204b2cc4) sem que ninguem refizesse
  a conta, e o "= Lucro liquido" da Lavoura 25/26 passou a invadir a coluna vizinha:
  90,2px de texto numa caixa de 82. O R$/ha ja' estourava ANTES do marcador (Receita
  liquida, "15.628,42": 50,7 numa caixa de 50) — a calibragem do 01a olhou a coluna R$
  e nao a de R$/ha.
  A regra nova, medida celula a celula no preview: LARGURA = pior texto + 8 de folga +
  14 de padding, e o pior texto inclui o SLOT DO MARCADOR, hoje reservado em toda
  celula de valor (`L_MARCADOR`, 10px). Valores em `dreGrade.tsx` (W_RS 96->114,
  W_HA 64->90, W_UN 60->74, W_RS_TOTAL 96->114) e em `PecDrePanel.tsx`
  (W_REFERENCIA 80->98, W_DELTA_RS 78->94, W_DELTA_PCT 64->70). Menor folga medida em
  14 estados: 8,3px.
  ⚠ A x ANOS COM 5 ANOS PASSA A ROLAR NA HORIZONTAL a 1440: ela vai de 1080 para 1344,
  contra um container de 1200. Decisao do Gabriel em 23/09 — custo aceito, porque a
  alternativa era esconder digito do resultado final da cascata. Quatro anos dao 1131 e
  todas as outras visoes cabem: Lavoura com 3 chips e 2 culturas da' 960, a Comparacao
  com Δ da' 756.
  ⚠ QUEM MEXER EM LARGURA MEDE O TEXTO RENDERIZADO, nao estima pela contagem de digitos:
  as tres calibragens erradas desta lista sairam de conta feita no olho. O metodo que
  achou o defeito foi um `Range` sobre o conteudo de cada `td` comparado com o
  `clientWidth` menos o padding, varrendo todos os estados dos chips e das visoes.
  ⚠ AS ALTURAS NAO SAO AS DO MOCK, E ISSO FOI MEDIDO: com 22/18/18/16 nenhum tipo
  de linha encolhia (subtotal +4, filha +1, resto igual) e a grade CRESCIA de 287
  para 307px na raiz — o oposto do alvo. Fontes e recuos ficaram como o mock
  aprovou; so as alturas desceram, e ai a mesma hierarquia cabe em MENOS espaco
  que a grade uniforme de 18px de antes. Quem mexer nelas mede a grade inteira,
  nao so' a linha.
  ⚠ ELA E' EXCECAO DECLARADA, NAO PRECEDENTE. Nenhum outro texto do sistema desce
  de 9,5px, e 9px fora da Grade do DRE reprova o PR. A razao aqui e' hierarquia:
  com tudo em 11px a cascata virava dezoito linhas iguais e o olho tinha de LER
  para achar onde a conta fecha.

- ⚠ SVG COM `preserveAspectRatio="none"`: O viewBox VAI EM PIXELS REAIS, NUNCA EM UNIDADES
  NORMALIZADAS. Com `none` o desenho e' ESTICADO ate' a caixa, e o fator de escala se aplica a
  TUDO que esta' dentro — inclusive a `fontSize` e a espessura do traco. Um `viewBox="0 0 100 140"`
  numa caixa de 220px faz `fontSize={8}` renderizar a 17,6px: os rotulos se sobrepoem, os numeros
  do eixo saem cortados na borda, e o codigo que os escreveu esta' certo. Com o viewBox em pixels,
  uma unidade vale um pixel e o que se escreve e' o que se ve'.
  ⚠ NENHUM DOS SETE GATES VE' ISSO. TSC e build ficam mudos porque e' aritmetica dentro de um
  atributo; a suite tambem, porque `jsdom` nao faz layout — `getBoundingClientRect` devolve zero,
  entao um teste de sobreposicao passa verde sempre. So' a tela mostra.
  ⚠ DUAS OCORRENCIAS MEDIDAS, as duas na homologacao de 24/09/2026:
    `PecPonteAbas` (fix4) — viewBox de `n * 84` com os rotulos do eixo em `x = 2`; uma unidade
       valia menos de um pixel e os numeros saiam CORTADOS a esquerda. Corrigido com largura fixa.
    `GraficoComposicao` em `ValorRebanhoTab` (COMPACTO-03b) — o caso dos 17,6px acima; os rotulos
       de % viraram `"67935592522559450"` na tela. Corrigido com `W = 240`.
  ⚠ E A "TERCEIRA OCORRENCIA" QUE EU RELATEI NAO EXISTE — a correcao vale mais que o numero.
  Escrevi no relatorio do 03b que era a terceira vez, "ponte, cascata e agora a composicao";
  conferido no historico (`git log -L`), a `PecCascataView` NASCEU com `W = 1180` em c06c89e1 e
  nunca teve o defeito. Ela e' a REFERENCIA de como se faz, nao um caso dele. Contar ocorrencia de
  memoria conta a impressao; a conta se faz no historico.
  ⚠ HA' UMA TERCEIRA SAIDA, e ela esta' viva no repo: `V2AreasMeta` usa `viewBox="0 0 100 H"` de
  proposito e NAO poe texto nenhum dentro do SVG — os valores do eixo sao HTML posicionado por
  cima, e todo traco leva `vectorEffect="non-scaling-stroke"`. Quem precisar de unidade normalizada
  faz assim: o que nao pode e' texto ou espessura DENTRO de um SVG esticado, sem defesa.
  ⚠ FICA REGISTRADO, e nao e' defeito: o sparkline de `ResOpDashboard` estica um `polyline` de
  `strokeWidth 1.5` sem `vectorEffect`. Nao ha' texto ali e a caixa tem 26px de altura — a
  distorcao do traco e' real e invisivel. Quem tocar o arquivo acrescenta o `vectorEffect`.

- ⚠ EVOLUCAO PATRIMONIAL — CONTRATO DA TRACEJADA "sem efeito de mercado" (03c, 24/09/2026).
  A tracejada dos graficos "Valor do rebanho" e "R$/@ medio" e' o MESMO rebanho de cada mes ao
  preco da categoria no INICIO. A distancia ate' a linha cheia e' o efeito de mercado acumulado;
  a tracejada sozinha e' a producao. E' a decomposicao que o DRE faz em duas linhas, desenhada.
  ⚠ ELA EXISTE EM TODO MES COM DADO NA VIEW, NAO SO' EM MES COM SNAPSHOT FECHADO. Ate' o 03b a
  fonte era `historicoDetalhadoPorMes` — consulta POR FAZENDA, zerada de proposito no Global —,
  entao a tracejada simplesmente NAO EXISTIA no Global e morria no primeiro mes sem fechamento.
  Passou a sair de `viewDataAnoAtual` (quantidade e peso por categoria e por mes, todas as
  fazendas) x o preco por categoria de `useValorRebanhoInicio`. Uma fonte para o mes, uma para o
  preco, e as duas ja' resolvem Global por dentro.
  ⚠ CATEGORIA SEM PRECO NO INICIO FICA DE FORA DA SOMA, e a tracejada SUBESTIMA nessa medida.
  Dar a ela o preco do FIM seria por mercado dentro da linha que existe para nao ter mercado — o
  mesmo defeito que a PATRIMONIO-TOTAL-01 registra no `coalesce(p0.pk, p1.pk)`. Medido em
  SR 2021: `garrotes` nao tem preco em dez/2020 e responde por 0,18 % do peso em janeiro e
  0,03 % de abril em diante. Pequeno aqui, nunca zero por construcao.

- ⚠ O 1o DE JANEIRO DA EVOLUCAO PATRIMONIAL TEM UMA FONTE SO' (03c): `useValorRebanhoInicio`.
  Ela serve ao MESMO tempo o card "Inicio", a base de "vs ini. ano", o "vs mes" de JANEIRO e o
  ponto "I" dos graficos. Eram QUATRO leituras da mesma data.
  ⚠ A QUARTA MENTIA CALADA: a base das comparacoes era `buildFrozenMetrics(dez/{ano-1})`, que sem
  fechamento de dezembro cai na view e multiplica por um preco `0` default. Com `valor = 0`,
  `calcVariacaoNullable` devolve `null` em `anterior === 0` — entao Valor, R$/@ e R$/cab saiam em
  "—" e Cabecas e @, que nao dependem de preco, apareciam. MEIA LINHA VAZIA NAO SE LE' COMO
  DEFEITO; le-se como "nao tem dado". Era o caso do Global antes do -03, onde o Inicio nem existia.
  ⚠ `origem === 'vazio'` VIRA `null`, nunca zero: o "—" diz que nao ha' retrato, e nao que o
  rebanho valia zero.

- RECLASS-PESO-BACKFILL-01 — FECHADA em 24/09/2026 pela migration `reclass_peso_backfill_01`
  (arquivo `supabase/migrations/20261027140000_reclass_peso_backfill_01.sql`; ⚠ o
  `apply_migration` REGISTROU com o timestamp de hoje, `20260924145414`, e nao com o do nome do
  arquivo — os dois nao batem, e quem for auditar o historico procura pelo NOME).
  516 lancamentos de `reclassificacao` de 4 clientes estavam gravados sem `peso_medio_kg`
  (NJ 368 · Agnaldo 146 · RRCC 1 · Vera 1; 46.586 cabecas). Santa Rita e Raul tinham ZERO.
  ⚠ A FORMULA DO MOTOR SEMPRE ESTEVE CERTA, e por isso ninguem a procurou:
    `producao_biologica = peso_fin - peso_ini - p_ent + p_sai - p_evol_ent + p_evol_sai`
  ja subtrai a reclassificacao. O furo era o INSUMO — a CTE que alimenta `p_evol_*` usa
  `COALESCE(l.peso_medio_kg, 0)`: o lancamento entrava com a QUANTIDADE e com peso ZERO. Sem
  nada para subtrair, o peso que CHEGAVA na categoria de destino virava producao e o que SAIA
  ficava encalhado numa linha com `saldo_final = 0`.
  ⚠ E O `fp_peso_total_final` FECHAVA A ARMADILHA: `peso_fin_calc = COALESCE(fp_peso_total_final,
  ...)`, entao no mes com fechamento o destino recebia o peso REAL contado e a diferenca inteira
  era declarada producao. Os dois lados do mesmo buraco.
  REGRA APLICADA: peso da categoria de ORIGEM no fechamento do mes anterior (503); senao o
  fechamento mais recente ate 3 meses antes ou o `peso_medio_inicial` que o cache ja guardava
  (13); a regra do DESTINO nunca foi exercida (0). Os 13 sao 10 de jan/2020 — primeiro mes da
  serie, nao existe mes anterior.
  MEDIDO, antes -> depois:
    NJ residuo da ponte jan-ago/25   -25.735,7 @  ->  -556,2 @   (32,6% -> 0,7% do inicial)
    NJ at_produzida jan-ago/25        48.907,0 @  ->  23.727,5 @
    NJ producao de nov/25            -18.955,2 @  ->  +6.979,7 @
    Pureza GMD de ago/25                  21,34   ->      1,71
    peso encalhado (6 clientes)      117.747 @    ->   ~4.400 @  (113 linhas -> 72)
    meses-fazenda com GMD fora de 0-2     460     ->     434
    linhas do cache                     4.703     ->    4.703    (conjunto identico)
  ⚠ TODO INDICADOR POR @ PRODUZIDA DO NJ E DO AGNALDO MUDOU — para o certo. Custo por arroba,
  @/ha, kg vivo/ha, GMD e a aba Movimentos da ponte liam a producao inflada; a do NJ caiu pela
  METADE. O DRE DOS DOIS PRECISA DE RE-HOMOLOGACAO: numero homologado antes de 24/09 saiu com o
  denominador errado. VPB, efeito de mercado e lucro NAO mudaram — saem das pontas
  (`valor_rebanho_fechamento_itens`), que esta migration nao toca.
  ⚠ SANTA RITA E RAUL SAO O GRUPO DE CONTROLE e nao se moveram em nada (788/188/1.010 e
  524/73/520, iguais antes e depois). E' o que prova que a correcao foi cirurgica.
  ⚠ `set_lancamento_audit` FOI DESLIGADA DENTRO DA MIGRATION e religada no fim: ela e' BEFORE
  UPDATE e grava `updated_by = auth.uid()`, que numa migration e' NULO — sem isso o backfill
  APAGARIA o autor de 370 das 516 linhas. O `trg_audit_lancamentos` ficou LIGADO de proposito:
  as 516 linhas estao em `audit_log` com o JSON de antes e depois.

- ⚠ VALOR SUGERIDO E' VALOR ACEITO (regra permanente, RECLASS-PESO-01, 24/09/2026).
  Campo que a tela preenche sozinha nao e' ajuda: e' AFIRMACAO. O operador confere o que digitou e
  aceita o que ja estava la'. Entao a sugestao responde pelo numero como se fosse digitada, e a
  barra de qualidade dela e' a mesma do dado.
  ⚠ NASCE DE UMA SUGESTAO QUE ERRAVA ATE' 381 %, e ela viveu anos sem incomodar ninguem: o
  `ReclassificacaoForm` sugeria o peso medio dos LANCAMENTOS da categoria (vendas, compras,
  nascimentos, mortes), ignorando o mes, em vez do peso do REBANHO. Medido em ago/25:
    Pureza      mamotes_m   sugeria 147,2 kg   rebanho  30,6 kg   +381 %
    Pureza      mamotes_f   sugeria 135,6 kg   rebanho  30,3 kg   +348 %
    Sta. Rita   mamotes_m   sugeria 117,8 kg   rebanho  31,8 kg   +270 %
    Sta. Maria  bois        sugeria 510,5 kg   rebanho 365,6 kg    +40 %
    3 Muchachas novilhas    sugeria 361,5 kg   rebanho 454,6 kg    -21 %
  Nos bezerros ela sugeria CINCO VEZES o animal. Passava porque o campo era OPCIONAL — sugestao
  ruim em campo opcional e' ruido, o operador apaga. No dia em que o campo virou obrigatorio ela
  viraria a resposta, e o RECLASS-PESO-BACKFILL-01 ja' tinha provado que esse peso entra inteiro
  em `producao_biologica`. Por isso a sugestao velha MORREU, sem ficar de fallback.
  ⚠ E A REGRA TEM UM SEGUNDO LADO, medido na mesma tela no mesmo dia: SUGESTAO NAO ENTRA EM
  REGISTRO JA' GRAVADO. A versao nova reabriu um lancamento de 450,00 kg mostrando 144,65 — o
  efeito de sugestao rodava depois da hidratacao e trocava o dado salvo. E' a mesma armadilha da
  carga de mandioca ("formulario que reabre sem ler APAGA"). Conserto: `autoSugerir: false` na
  edicao, e o valor hidratado marcado como DIGITADO, nunca como sugerido.
  ⚠ COMO SE MARCA: sugerido tem fundo ambar e uma linha de 10px dizendo que e' sugestao; o valor
  digitado (ou gravado) e' branco. Sem a marca, o numero que a tela escreveu e o que o operador
  escreveu ficam identicos — e e' exatamente essa diferenca que ele precisa ver.

- RECLASS-PESO-01 — FECHADA em 24/09/2026. Reclassificacao sem peso nao entra mais por caminho
  nenhum: tela (`ReclassificacaoForm`, trava unica no hook), importacao (`peso_medio_kg`
  obrigatorio + template corrigido) e BANCO — migration `reclass_peso_guard_01`
  (arquivo `supabase/migrations/20261027141000_reclass_peso_guard_01.sql`; ⚠ registrada como
  `20260924152829`, de novo com o timestamp de hoje e nao com o do nome — ver a nota igual no
  BACKFILL-01).
  `validate_lancamento_campos_por_tipo`: md5 be162b71 -> 1d5018ca (3.345 -> 3.571 chars).
  Provado em rollback E depois no proto: insert SEM peso BLOQUEIA, insert COM peso passa, update
  de existente passa. As 1.184 reclassificacoes atuais tem todas peso.
  ⚠ A GUARDA NAO ALCANCA O CENARIO META — frente META-VALIDACAO-01. A funcao inteira desiste
  antes do `CASE`:
      IF NEW.cenario = 'meta' THEN RETURN NEW; END IF;
  e as CTEs `rcl_*_meta` de `fn_zoot_categoria_mensal` tem o MESMO `COALESCE(peso_medio_kg, 0)`
  das `rcl_*_real`. O furo existe igual no planejamento; so' nao contamina numero realizado.
  ⚠ E ELE NAO FOI PROVADO NA TELA, so' na leitura do codigo: a tentativa de inserir uma
  reclassificacao 'meta' sem peso foi barrada por OUTRA guarda (`guard_meta_admin_only`, que exige
  consultor), entao o ramo do peso nem chegou a ser avaliado. Quem for fechar a frente mede com
  credencial de consultor antes de afirmar o tamanho do buraco.
  ⚠ CONSERTAR O META NAO E' ACRESCENTAR UM `IF`: mexer naquele `RETURN NEW` muda a validacao de
  TODOS os tipos de lancamento de uma vez. E' frente propria, com medicao propria.

- ⚠ PAGINACAO DE LISTA GRANDE: PARALELA COM `count`, NUNCA `while` COM `await` DENTRO
  (regra permanente, PERF-VALOR-REBANHO-01, 24/09/2026).
  `fetchLancamentosPaginated` (`src/hooks/useLancamentos.ts`) pedia pagina, esperava, pedia a
  proxima. Medido no NJ (2.177 linhas): as tres paginas em 0 / +2.727 / +4.343 ms, terminando em
  5.603 ms. Com a primeira pagina trazendo `count: 'exact'` e as demais em `Promise.all`:
  +2.270 / +2.303 / +2.305 ms, janela de 1.355 ms. Mesmas linhas, mesmas colunas, 4x mais rapido.
  ⚠ E ELA E' DO SHELL DO /v2 (`V2Index.tsx:182`, `useLancamentos()` sem argumento), nao de uma
  tela: o encadeamento estava no caminho critico de TODAS as telas do /v2.
  ⚠ FILTRAR POR ANO SERIA MAIOR GANHO E ESTA' PROIBIDO AQUI, pela mesma razao: o hook alimenta
  todas as telas, e estreitar o periodo mudaria o que as outras veem. Frente propria.
  ⚠ SEM `count`, VOLTA AO SERIAL DE PROPOSITO. `count ?? rows.length` daria `total = 1000` e a
  funcao devolveria a PRIMEIRA PAGINA como se fosse tudo — truncagem silenciosa. O ramo de
  fallback existe para isso e nao deve ser "simplificado".

- ⚠ DIALOG-ZOOM-95-01 — O `DialogContent` RENDERIZA A 95%, E A ESCALA E' PERMANENTE
  (regra permanente, descoberta no VARIACAO-REBANHO-MODAL-01-fix8, 24/09/2026).
  A animacao de entrada do Radix (`data-[state=open]:zoom-in-95`) termina SEM voltar a escala 1:
  `getComputedStyle(dialog).transform` fica em `matrix3d(0.95, ...)` depois de aberto.
  ⚠ MEDIR COM `offsetWidth`, NUNCA COM `getBoundingClientRect()`: o rect vem ESCALADO e erra 5 %
  para menos. Medido no modal da variacao: rect dizia 713 / 690 / 292 quando o layout era
  750 / 726 / 359 — e a leitura errada me fez quase reportar "a tabela esta sendo comprimida",
  quando ela cabia com folga.
  ⚠ E TODO TEXTO SAI MENOR DO QUE FOI PEDIDO: `fontSize: 9` aparece como 8,55px na tela. Quem
  calibrar tipografia dentro de um dialogo desconta isso — ou a fonte "de 9" nao e' de 9.
  ⚠ NAO FOI CORRIGIDO: tirar o zoom mexe na animacao de TODOS os dialogos do sistema. Fica como
  fato conhecido; quem quiser a escala 1 abre frente propria e mede o que muda de tamanho na tela
  inteira.

- ⚠ ESTADO DE DADO SO' DEPOIS QUE A GRAVACAO PASSA (regra permanente, OC-BOITEL-REALIZADO-01,
  24/09/2026). `setAlgo(novo)` ANTES do `try`, com um `catch` que so' mostra toast, deixa a tela
  afirmando um dado que o banco recusou. Quem escreve estado de DADO escreve tambem o caminho de
  volta: `src/lib/oc/aplicarComRollback.ts` (aplica, grava, RESTAURA o anterior e relanca).
  ⚠ NASCE DE UM CARD QUE DIZIA DUAS VERDADES AO MESMO TEMPO. OC 6a808c4c (NJ · venda boitel JBS
  Guaicara · 03/04/2020 · 200 garrotes): o operador aplicou o realizado com a negociacao fechada,
  `oc_salvar_boitel` recusou, e o card ficou mostrando os deltas (+0,025 kg · +14 dias · +1,00 pp)
  enquanto GMD, Dias e RC saiam "—". Os deltas a tela CALCULA do que ele digitou; os tres tracos
  ela LE' da linha `cenario = 'realizado'`, que nunca existiu. Meia tela do state local, meia tela
  do banco — e o operador nao tem como saber qual metade e' a verdadeira.
  ⚠ A RECUSA ESTAVA CERTA: `oc_salvar_boitel` recusa `status_comercial = 'fechada'` de proposito
  (P0001, "Negociacao fechada; reabra para editar"), e a operacao ficou fechada por 48 segundos
  entre o `fechar` (22:38:27) e o `reabrir` (22:39:15). O defeito nunca foi a recusa — foi o
  estado nao voltar atras.
  ⚠ RESTAURA O ANTERIOR, NUNCA LIMPA. Zerar trocaria um defeito por outro: apagaria da tela um
  realizado que JA' estava gravado, porque a recusa e' da edicao nova e nao do que existia. O
  teste tem caso proprio para isso (`aplicarComRollback.test.ts`), e um teste que so' afirmasse
  "voltou a null" passaria verde numa funcao que limpasse.
  ⚠ FLAG DE UI E' OUTRA COISA e continua indo antes do `await`: `setSubmitting(true)` descreve o
  GESTO, nao o dado, e se desfaz no `finally`.
  ⚠ MEDIDO NO REPO INTEIRO antes de abrir divida, e por isso [STATE-ANTES-DO-TRY-01] NAO NASCEU:
  a varredura de `set*()` seguido de `try { … await }` deu 151 flags de UI (`Loading`, `Saving`,
  `Submitting`, `Hidratando`, `Ocupado`, `Gerando`, `Importando`…), mais guardas de saida
  antecipada (`if (!clienteId) { setRows([]); return; }` — nao ha' await depois), limpezas para
  `null`/`[]` e ids de linha ocupada. Estado de DADO antes do `try` havia UM: este. A unica
  familia proxima sao os tres importadores que fazem `setArquivo(file)` antes de parsear
  (`MesaClassificacaoTab:461`, `useImportarClassificacao:145`, `ExcelImportDialog:252`), e ali
  manter o arquivo escolhido depois do erro e' CERTO — a mensagem fala dele.
  ⚠ E A CHECAGEM DE "fechada" NO `catch` E' PELA MENSAGEM DO SERVIDOR, nao pelo `ocStatusComercial`
  do render: foi justamente uma janela de 48 segundos que produziu o defeito. O status do render
  pode estar velho; a resposta do servidor, nunca. O `toastNegociacaoFechada` (helper unico dos
  tres caminhos — abate, venda e boitel) poe o botao "Reabrir" inline, porque mandar "reabra para
  editar" sem dizer onde e' meia instrucao.

- ⚠ ATALHOS-PRODUCAO-01 — O ATALHO ENTRE AS TRES TELAS DE PRODUCAO (25/09/2026, mock opcao A aprovado
  pelo Gabriel). NOME NOVO DE PROPOSITO: o PR-NAV-PRODUCAO-01 que ja' existia e' o do menu "Producao"
  (`navGrupos.ts`); este e' o da barra de topo.
  Na `BarraSecao`, a' direita e colado no nome do usuario, o `Segmentado` da casa (altura 22, `bg-card`
  para ler sobre a barra azul) com "Operações Comerciais | Lançar movimentação | Lançamentos", a ativa
  sendo a secao atual. SO' em `operacoes-comerciais`, `lancamentos-zoot` e `conferencia-lancamentos`;
  nas demais a barra fica como era. A barra nao conhece as telas: ela ganhou um encaixe (`atalho`), e
  quem monta o controle e troca a secao e' o `V2Index` (`src/v2/lib/atalhosProducao.ts`).
  ⚠ DECISOES DO GABRIEL:
    a) SAIR DE "LANCAR MOVIMENTACAO" COM OC ABERTA LIMPA OS `oc_*` DA URL — pelo atalho E pelo menu
       lateral. O limpador e' UM so': `semParamsOC` (`src/lib/oc/paramsAberturaOC.ts`), que saiu do
       `fecharOperacaoOC` com os mesmos seis parametros; o fechar da OC passou a usa-lo. Sem isto, os
       `oc_*` sobreviviam e voltar a "Lancar movimentacao" reabria o modal sozinho.
    b) O PERIODO NAO ATRAVESSA entre as telas. Nada mudou nos filtros.
    c) A FAZENDA FICA FORA — frente propria, OC-FAZENDA-GLOBAL-01 (a Central ignora a fazenda global).
       ⚠ FEITA em 25/09/2026 — ver o bloco OC-FAZENDA-GLOBAL-01: a Central passou a seguir o seletor.
  ⚠ "MENU LATERAL" SAO TRES PORTAS, e as tres limpam: os itens do painel de cada grupo (`handleSelect`),
    os atalhos diretos da sidebar ("Visao Geral", "Configuracoes") e a barra do celular — estas duas iam
    direto a `setSection` e escapariam. Passam por `navegarPeloMenu`, que so' acrescenta a limpeza.
  ⚠ A LISTA PERDEU O AVISO "N OPERACOES COMERCIAIS EM ANDAMENTO" + "Ver Operacoes Comerciais": o atalho e'
    a porta. A contagem (`useOperacoesComerciaisEmAndamento`) nao tinha outro leitor e o arquivo saiu.
  ⚠ ABAIXO DE md O ATALHO SOME (`hidden md:inline-flex`): tres rotulos nao cabem numa barra de 32px no
    celular, e a barra nao quebra em duas linhas. Nao foi medido em que largura exata ele deixaria de caber.
  ⚠ COM A OC ABERTA O ATALHO NAO RECEBE CLIQUE: o fundo do modal cobre a barra. A limpeza vale para
    quando a URL fica com `oc_*` sem o modal a' frente, e para o menu.

- ⚠ VINCULAR-LANC-OC-01 — UM LANCAMENTO QUE JA EXISTE PASSA A SER O TITULO DE UM ITEM DA OC (25/09/2026).
  Migration `supabase/migrations/20261027147000_vincular_lanc_oc_01.sql` (⚠ registrada como
  `20260925190101`, timestamp do dia, como as outras de apply_migration). Quatro funcoes NOVAS, nenhuma
  existente alterada: `oc_vincular_lancamento` (SECDEF), `oc_candidatas_vinculo` (INVOKER, com a RLS de
  quem chama), `_oc_vinculo_mapa` e `_oc_vinculo_sugerir_componente`; EXECUTE so' authenticated e
  service_role. Tela: "Vincular à operação" no rodape do `LancamentoV2Dialog` → `VincularOperacaoDialog`
  (`src/lib/oc/vincularLancamento.ts`).
  Regras do Gabriel: o financeiro conciliado manda no VALOR; a data da OC manda na COMPETENCIA; nunca somar;
  um motivo por gesto.
  ⚠ MODELO VIVO, NAO O ADOTAR ANTIGO: o titulo adotado fica como todo titulo de OC pago fica — parcela
    `materializada` (o estado `paga` nao e' escrito por funcao nenhuma), parte `origem='programacao'` com
    `programacao_parcela_id`, valor da parte = parcela = titulo. `oc_adotar_titulo_financeiro` gravava parte
    sem parcela (a OC virava `misto_inconsistente`), recusava saida em venda/abate e nao tinha chamador.
    O precedente manual e' o 91e6a216 ("curativo maio", 31/08).
  D1 titulo vivo da OC no item: o lancamento SUBSTITUI — o da OC e' cancelado com o motivo do gesto, SO' se
     nao liquidado. `agendado` conta como aberto e e' substituido. Realizado, conciliado ou com liquidacao
     ativa -> recusa `titulo_oc_liquidado`, devolvendo os dois, sem escrever nada.
  D2 o componente vem confirmado pelo operador; a sugestao (pelo subcentro, ou pela descricao: Fundersul,
     Iagro/GTA, Funrural/Senar -> `taxas_impostos`; ICMS -> `taxa_aquisicao`; frete; comissao) e' so' sugestao.
     ⚠ COMPONENTE NAO E' UNICO POR OC (12 `taxas_impostos` repetidos, 14 parcelados) e nem e' usado
     uniforme (o Fundersul da 02be1a41 esta' como `taxa_aquisicao`): varios -> `escolher_compromisso`;
     nenhum do componente mas outro que cabe -> `escolher_compromisso` tambem, e criar novo so' com
     `p_criar_novo` (acao explicita "Criar compromisso novo"). Sem isso, a sugestao criaria o dobro.
  D3 importados: a competencia muda e o hash fica — POR CONSTRUCAO: `compute_financeiro_lancamento_v2_hash`
     RECEBE `_data_competencia` e NAO A USA. A RPC confere o invariante e aborta se o hash mudar.
     ⚠ ERRADO NA PRATICA, corrigido no VINCULAR-FIX-01: a formula nao usa a competencia, mas o GATILHO dispara
       nela (`UPDATE OF ... data_competencia`) e recalcula; num hash de formula antiga o valor muda. Ver
       HASH-IMPORT-DEFASADO-01.
  D4 `movimentacao_rebanho_id` e' solto (como no AGNALDO-DEDUP-01b), com o id antigo na trilha; o
     zootecnico nao se mexe. OC com movimento proprio -> aviso `movimento_duplicado` (ver ZOO-DOBRO-OC-LEGADO).
  Decisoes da FASE 1a: ordem das candidatas = VALOR EXATO AO CENTAVO primeiro (compromisso que cabe com o
  valor do lancamento), depois mesma fazenda, menor distancia, OC sem titulo vivo, valor mais proximo; a
  parte copia a classificacao do lancamento, e compromisso existente mantem a sua com o aviso
  `classificacao_diverge_do_compromisso`.
  ⚠ O "O QUE VAI ACONTECER" E' A PROPRIA RPC COM `p_simular`: ela percorre o caminho da gravacao e o desfaz
    no fim (`EXCEPTION WHEN SQLSTATE 'OCSIM'` no bloco da funcao — subtransacao; as variaveis sobrevivem e o
    envelope volta). Provado: envelope da simulacao = envelope da gravacao, e nada gravado. O resumo nao
    tem regra copiada no front. Sem motivo nem versao na simulacao, como `oc_reprogramar_compromisso_do_lote`.
  ⚠ DUAS CORRECOES DA FASE 0, e as duas foram leitura de menos:
    1. "mudar competencia troca o hash" — FALSO. A FASE 0 leu a lista de argumentos da funcao de hash e nao
       o corpo. Medido na prova: UPDATE cru da competencia de um importado deixa o hash identico. E a
       reimportacao do Excel nem usa o hash (reconhece pela regua `classificar_nivel_duplicidade`).
    2. as plausiveis contavam RASCUNHO (5 OCs vazias do NJ em 16/04/2026 eram "candidatas"). Sem rascunho:
       364 lancamentos com candidata, 273 de 2026, 169 conciliados.
  ⚠ ACHADOS DE CARONA, nao tratados: duas partes vivas apontam titulo cancelado (7f7de76f Iagro e
    c80ebe9e) — o vinculo trata esse titulo como aberto e o substitui.

- ⚠ VINCULAR-FIX-01 — CINCO CORRECOES DO VINCULAR relatadas pelo Gabriel (25/09/2026). Migration
  `supabase/migrations/20261027152000_vincular_fix_01.sql` (⚠ registrada como `20260925223916`), PATCH GUARDADO POR md5:
  `oc_vincular_lancamento` 72be497d -> 47eced26, `oc_candidatas_vinculo` c6885a66 -> 63b698ee; tres funcoes novas
  pequenas (`_oc_vinculo_direcao_compromisso`, `_oc_vinculo_dist_janela`, `_oc_vinculo_pista`), EXECUTE so'
  authenticated e service_role.
  (1) HASH PRESERVADO (D3). O Iagro 2a8562dd abortava "Vincular mudaria o hash (cc9c2320 -> e6b24dbc)": a formula
     nao usa a competencia, mas `trg_financeiro_lancamento_v2_hash` e' `BEFORE UPDATE OF ... data_competencia`
     e RECALCULA — e `cc9c2320` era exatamente a formula de 6 campos anterior a 10/04/2026. Depois do UPDATE, a RPC
     regrava o original com um UPDATE SO' de `hash_importacao` (fora das listas dos dois gatilhos de hash). Nada
     desligado; a guarda fica. PROVADO EM ROLLBACK: com o hash antigo, o vinculo grava, a competencia vai de
     02/08 a 04/08/2024 e a linha segue `cc9c2320`; o controle (UPDATE cru da competencia) da' `e6b24dbc`.
     ⚠ A FASE 1a "provou" o contrario porque mediu numa linha de hash JA' atual — prova num conjunto que nao
       exercita o caso e' a mesma licao do "PROVA DE IDENTIDADE REPORTA O TAMANHO DO CONJUNTO".
  (2) LINHA DA CANDIDATA: "{data} · {Tipo} · {Fazenda} · {N} cab · {contraparte}" (`linhaDaCandidata`), a data de
     referencia e as cabecas da OC (cabecalho; sem ele, soma dos lotes). SO' na linha — o Desvincular, o botao e o
     toast mantem `rotuloOC`. A tabela perdeu as colunas Tipo, Data, Fazenda e Contraparte, que viraram a linha.
  (3) COMPROMISSO A COMPROMISSO + DIRECAO. Entram tambem os compromissos do MESMO subcentro do lancamento, qualquer
     componente (Graxaria c80ebe9e: 5.056 a receber gravado como `adiantamento_devolvido` no plano "Abates de
     Femeas" — o mapa so' dava `principal` a esse subcentro, e o exato nem era avaliado). Direcao do PLANO do
     compromisso = a do lancamento. Valor exato vence (vai escolhido, `p_compromisso_id`, mesmo de outro componente).
     "Estorno Recebido" NAO entrou no mapa (decisao: o par de estorno fica fora).
     ⚠ O BLOQUEIO POR `todos_liquidados` DESTA VERSAO FOI REVOGADO NO 01b (abaixo): pago nunca bloqueia.
     Medido antes: todo compromisso vivo tem plano, e a direcao do plano concorda com o mapa em todos.
     PROVADO EM ROLLBACK: com a721d5ca de volta em "Abates de Femeas" e na Faz. 3 Muchachas, c80ebe9e vem em 1o,
     `valor_exato`, com 73a183eb no topo da lista; a simulacao passa; o compromisso de SAIDA 6b349b87 posto no mesmo
     subcentro some da lista e, forcado, e' recusado ("Direcao do compromisso (2-Saídas) nao confere...").
     ⚠ HOJE A721D5CA NAO TEM O GESTO: o Gabriel a reclassificou para "Estorno Recebido" (fora do mapa) e a regra
       FIN-FAZENDA-ADM-01 levou a fazenda para "Administrativo". Voltar os dois e' do operador.
  (4) ICONE DE OC NA LISTA (`useLancamentosComOC`): criterio = parte VIVA, nao `origem_lancamento`; uma consulta por
     cliente num mapa (molde do `useLancamentosConciliados`), rele no `inscreverEmLancamentos` — some ao desvincular
     sem F5. Tooltip pelo tipo (Compra/Venda/Abate/Boitel — antes, "Compra de Animais" em todos); o clique abre a OC
     (`abrirOCFinanceiro`) sem abrir a linha. Ganharam o icone 5 lancamentos vinculados da Vera.
  (5) BOITEL: a janela da venda em boitel vai de `zoo_operacao_boitel.data_envio` ate' `data_abate` (+60 dias; antes
     do envio, fora); pista da descricao no ranking, depois do valor exato ("boitel" numa OC de boitel; o numero de
     cabecas da OC escrito na descricao). PROVADO EM ROLLBACK com datas sinteticas.
     ⚠ E HOJE NAO MUDA NADA: `data_envio` esta' VAZIO nas 15 linhas de boitel (8 projetado, 7 realizado), e sem envio
       a OC cai na regra de antes. E O CASO DE 2025 NAO TEM OC: "Boitel 150 garrotes - Frete" (37a2f86a, 15/05/2025)
       — as vendas em boitel da Vera sao de 2026 (b58bf556, 110 cab; 7f7de76f, 55 cab), e ela nao tem venda
       nenhuma de fev a ago/2025. Fica so' o criterio.
     ⚠ CORRECAO (26/09/2026): o relatorio e este registro diziam que o frete de 2.000 estava DUPLICADO (37a2f86a e
       9b9e2164). NAO esta': sao duas viagens de frete — regra da pecuaria, bloco "PECUARIA: LANCAMENTOS IGUAIS".
     ⚠ O "HOJE NAO MUDA NADA" FOI REVOGADO NO 01b: a janela ganhou fallback e passou a valer para todo boitel.

- ⚠ VINCULAR-FIX-01b — AJUSTE DO GABRIEL ANTES DO COMMIT (26/09/2026). Migration
  `supabase/migrations/20261027152100_vincular_fix_01b.sql` (⚠ registrada como `20260926082709`), patch guardado
  por md5 sobre a 01: `oc_vincular_lancamento` 47eced26 -> 9e06563f, `oc_candidatas_vinculo` 63b698ee -> 70231c30;
  funcao nova `_oc_vinculo_compromisso_liquidado` (o MESMO predicado da coluna `acao_prevista = 'recusar'` das
  candidatas: parcela unica com titulo realizado, conciliado ou com liquidacao viva).
  (1) PAGO NUNCA BLOQUEIA — regra por candidata:
     a) compromisso livre de valor exato -> usa esse (a tela o manda escolhido);
     b) compromisso livre sem valor exato -> `escolher_compromisso` + "criar compromisso novo". ⚠ ANTES, com dois
        ou mais livres do item, a resposta nao oferecia criar e `p_criar_novo` era IGNORADO nesse ramo;
     c) nenhum livre do componente -> CRIA um novo, e a resposta leva o aviso `componente_ja_liquidado` ("Já existe
        {componente} de R$ X liquidado nesta OC; este é outro pagamento"), ambar no resumo da simulacao; o operador
        confirma no Vincular. Na lista, ambar "criar novo", selecionavel;
        ⚠ REVOGADO NO 01c (26/09/2026): o aviso e o ambar sairam — o vincular NAO julga repeticao. "Criar item" e'
          neutro. Ver o bloco VINCULAR-FIX-01c.
     d) vermelho SO' por direcao incompativel ou OC cancelada/rascunho — e as duas o banco ja' tira da lista, entao
        a tela nao tem mais linha vermelha nenhuma.
     `todos_liquidados` continua no envelope, so' informativo.
     PROVADO EM ROLLBACK: Iagro 2a8562dd x f93f1a2b, so' com o componente -> `ok`, compromisso `criado`, aviso com o
     Fundersul 541,84. TRES IGUAIS (tres copias do Iagro, mesmo nome, valor e dia, na mesma OC, com um compromisso
     livre de 277,68 posto antes): L1 preenche o livre, L2 cria (aviso 541,84 + 277,68), L3 cria (aviso com os
     tres) — tres partes vivas, quatro compromissos de `taxas_impostos`, nenhum recusado.
  (2) JANELA DO BOITEL COM FALLBACK: inicio = coalesce(`data_envio`, data da OC); fim = coalesce(`data_abate`,
     inicio + 150 dias) + a janela de 60. PROVADO EM ROLLBACK com o frete 37a2f86a em tres datas: 20/08/2026 (99
     dias depois da data da OC — fora pela regra velha) traz b58bf556 e 7f7de76f com distancia 0 e deixa 581d075c
     fora (comeca depois); 10/10/2026 traz 581d075c (0, sem abate: +150) e as outras duas a 45-46 dias do abate;
     01/05/2026, antes de qualquer envio, nenhum boitel.

- ⚠ VINCULAR-FIX-01c (26/09/2026). Migration `supabase/migrations/20261027152200_vincular_fix_01c.sql` (⚠ registrada
  como `20260926085107`): `oc_vincular_lancamento` 9e06563f -> e40fe082 (patch guardado por md5: sai o bloco do aviso,
  que volta a ser exatamente o de antes do 01b) e `_oc_vinculo_dist_janela` redefinida (md5 83951424).
  `oc_candidatas_vinculo` NAO mudou (70231c30). Tela: `situacaoDaCandidata` sem ambar de "criar novo" — "criar item" e
  "escolher compromisso" ganharam o tom `neutro` (`TOM_SELO`, cinza); o texto do aviso saiu de `textoDoAviso`.
  O resto do 01b fica: contar so' compromisso livre, `p_criar_novo` respeitado com varios livres, lista com "criar item".
  ⚠ A REGRESSAO RELATADA ("nao aparece NENHUMA candidata, nem abate") NAO SE REPRODUZIU, e o registro diz isso em vez
    de inventar causa. Medido em 26/09: `oc_candidatas_vinculo('37a2f86a')` devolve os MESMOS 4 abates da BMG (27/04,
    15/06, 23/06, 18/03/2025) como `postgres` E como `authenticated` com o usuario do Gabriel (RLS e grants valendo), e
    o preview local mostra os 4 na tela. Os 4 tem so' o principal de ENTRADA — a direcao tira o compromisso e a OC
    fica com "criar item", que e' exatamente a regra pedida. Seis Fundersul do NJ devolvem 7 candidatas cada.
    Pergunta aberta: em QUE ambiente e em QUE lancamento o Gabriel viu a lista vazia.
  ⚠ A REGRESSAO QUE EXISTIA era outra, e a varredura a achou: 45 lancamentos reais de 6 clientes, candidatas das
    funcoes de ANTES do FIX-01 (reconstruidas em rollback pelo patch reverso dos dois, md5 c6885a66 conferido) x
    depois. Sumiam 4 pares, TODOS da janela do boitel: `3b2cd648` e `ed4488e1` (Vera, vendas de desmama em
    04/05/2026) perdiam b58bf556 e 7f7de76f, porque o 01b tirava "antes do inicio" (a data da OC, 9 dias depois) em
    vez de medir a distancia. Corrigido: antes do inicio a distancia e' ate' o inicio. DEPOIS: 84 pares antes, 87
    depois, ZERO sumidos (os 3 a mais sao da janela do boitel: 132aef9d ganhou 744c520e e da0b8577; 792c02d0,
    581d075c).
    ⚠ A LICAO E' A DO "PROVA DE IDENTIDADE REPORTA O TAMANHO DO CONJUNTO": o FIX-01 e o 01b foram provados em casos
      escolhidos (a Graxaria, o Iagro, o boitel sintetico) e nenhum media o que SUMIA. So' a varredura antes x depois
      num conjunto real mostra regressao de filtro.
  PROVADO EM ROLLBACK contra as funcoes novas: tres iguais (tres copias do Iagro na f93f1a2b, com um livre de 277,68
  posto antes) -> L1 preenche o livre, L2 e L3 criam, `avisos = []` nos tres, tres partes vivas. DIRECAO: com a721d5ca
  de volta em "Abates de Femeas", c80ebe9e segue candidata (lista 73a183eb, 0119442b) e o compromisso de saida
  6b349b87 posto no mesmo subcentro fica fora da lista e, forcado, e' recusado ("Direcao do compromisso (2-Saídas)
  nao confere com a do lancamento (1-Entradas)").

- ⚠ OC-BOITEL-REALIZADO-UX-01 — O REALIZADO DO BOITEL SE COBRA POR FATO E SE GRAVA NUM PONTO SO' (26/09/2026,
  decisao do Gabriel). Migration `supabase/migrations/20261027153000_oc_boitel_realizado_ux_01.sql` (⚠ registrada
  como `20260926093822`), corpo INTEGRAL: `oc_salvar_boitel` md5(prosrc) 6fbb63f1 -> c428ef90 (banco = arquivo).
  (1) BANCO: no cenario 'realizado' a trava cobra os SEIS FATOS — dias, `qtd_abatida`, `peso_vivo_total_abate`,
     `arrobas_totais_abate`, `valor_total_diarias`, `valor_total_abate` — com os rotulos da tela ("Dias confinamento",
     "Cabeças abatidas", "Peso vivo", "Arrobas", "Diárias", "Valor total do abate"), e depois DERIVA os quatro
     drivers: preco = round(valor/arrobas, 2); diaria = round(diarias/(qtd_abatida x dias), 2); rendimento =
     arrobas x 15 / peso vivo x 100; gmd = (peso vivo/qtd_abatida - peso_saida_fazenda_kg)/dias, so' com peso de
     saida > 0. Derivar (e nao so' deixar de cobrar) porque o FRONT le' os quatro no realizado: `exigencias()`
     sustenta `liquidoDaVendaBoitel` -> o valor do `oc_revalorar_lote`. Nenhuma funcao SQL nem view os le'.
     `qtd_abatida` entrou como 6o fato por decisao do Gabriel: sem ela nao ha a diaria por cabeca, e a trava da A2
     (`qtd_abatida IS NOT NULL AND valor_total_abate IS NOT NULL`) deixaria de proteger o lote.
     ⚠ O PROJETADO NAO MUDOU: o diff do prosrc e' SO' INSERCAO (as cinco linhas de sempre viraram o ELSE, byte a
       byte). Provado em rollback: linha do projetado identica depois de salvar, e "Falta GMD" como sempre.
     ⚠ 3260d1c8 E 8b211cae PASSAM A SER RECUSADAS no proximo salvar do realizado ate' completarem peso vivo,
       arrobas e diarias (efeito aceito pelo Gabriel). Os outros cinco realizados tem os seis fatos.
     ⚠ A ACL FECHOU JUNTO: estava EXECUTE para PUBLIC (anon = true) e sem grant a authenticated. Agora
       `{postgres, service_role, authenticated}`; anon = false, authenticated = true, conferidos depois.
  (2) TELA: o Aplicar de cada bloco valida SO' os fatos daquele bloco (UX-OBRIGATORIOS-01) e troca o RASCUNHO na
     memoria — nao grava. O realizado se grava no Salvar da negociacao: lotes -> projetado -> realizado -> revalorar,
     so' com rascunho SUJO (payload diferente do salvo). Recusa: frase ao lado do Salvar (UX-TOAST-01), rascunho na
     tela, sem "Negociação salva.", `false` (o Concluir nao segue). Pendencia no rascunho trava Salvar e Concluir
     com bloco e campo escritos.
     ⚠ RASCUNHO x SALVO: `ocBoitelReal` e' o rascunho (cartao e dialogos); `ocBoitelRealSalvo` e' o que o banco tem,
       e e' ele que o resumo, a previsao, `valorDaVendaBoitel`, `custosDaVendaBoitel`, o bolso, o topo, a analise e
       a trava do lote em `salvarNegociacaoVendaOC` leem. Sem a separacao, `realizadoAplicadoNoLote` diria
       "aplicado" para um rascunho, e o "Gerar previsao" leria numero que nao foi gravado.
     ⚠ O RASCUNHO NAO NASCE NO "Lancar realizado" (o `iniciarRealizadoBoitel` deixou de semear): o dialogo ja' nasce
       da projecao, e semear fazia o Cancelar deixar um realizado pela metade que o Salvar passaria a cobrar.
     ⚠ FATO VAZIO APARECE VAZIO: os seis campos mostravam, vazios, o numero que a PROJECAO daria — o campo parecia
       preenchido e o banco o recusava. Agora vazio e' vazio (o "previsto: X" ambar continua embaixo), e o moeda
       aceita `null` para nao escrever "R$ 0,00" em dado ausente.
  (3) 01b — AVISO AO FECHAR A VENDA SO' COM O REALIZADO DO BOITEL SUJO (26/09/2026, decisao do Gabriel). X, Fechar e
     ESC passam por `fecharModalOCComAutosave` (o clique fora ja' era bloqueado); com `realizadoNaoSalvo(rascunho,
     salvo)` verdadeiro, abre o AlertDialog da casa ("Realizado do boitel não salvo"), "Continuar editando" como padrao
     e "Descartar e fechar". Realizado limpo, venda comum e pos-Salvar fecham sem aviso. O Salvar e o aviso leem a
     MESMA funcao. Sem autosave. Conferido na tela na 8b211cae, sem gravar nada.
     ⚠ DIVIDA: lotes, projetado e demais campos da venda NAO sao cobertos — a assinatura geral
       (`ocVendaAssinaturaSalva`) nasce nula ao abrir, e cobri-los exige uma assinatura de BASE capturada quando a
       hidratacao termina. Frente propria.
  (4) 01c — O REVALORAR LE O ID DO LOTE DO BANCO (26/09/2026). Achado na FASE 0 do BOITEL-ABATE-PRODUTOR-01: o id vinha
     de `lotesApi.lotes[0]?.id`, o estado do clique; numa OC NOVA o lote nasce no `oc_salvar_lotes` do mesmo Salvar e
     ainda nao tinha id ali, entao o revalorar era PULADO em silencio com "Realizado do abate lancado". Agora
     `src/lib/oc/gravarRealizadoBoitel.ts` le o lote de `zoo_operacao_lotes` depois do Salvar dos lotes; sem lote,
     erro ao lado do Salvar e `false`, nunca "lancado".
     ⚠ 77d963be (RRCC, 05/07/2023, 193 garrotes) FICA COM O LOTE EM 628.569,35 ATE' A BOITEL-ABATE-PRODUTOR-01 (decisao
       do Gabriel): o acerto pelos fatos e' 656.957,17, mas a OC ja' tem os tres lancamentos reais vinculados (principal
       965.835,15 no lote, boleto 308.877,97, frete 6.000) e a saida registrada (rebanho 3161998e a 628.569,35) — o
       revalorar mexeria no rebanho, e o caso e' da modalidade B.
     ⚠ VARREDURA (motor real sobre as 10 OCs de boitel com realizado): 3 divergencias lote x acerto — 77d963be
       (+28.387,82, este defeito), da0b8577 (+63.047,31) e b58bf556 (+27.922,96); as duas ultimas ja' estao em
       OC-BOITEL-DELTA-ANTIGO-01. As outras 7 batem ao centavo.
  ⚠ (HISTORICO) O item (c) do OK do Gabriel — GUARDA DE ALTERACAO NAO SALVA NA VENDA — parou no 01 pela regra do proprio
    pedido e virou o 01b acima, restrito ao realizado. `ocVendaAssinaturaSalva` nasce NULA ao abrir uma venda (por desenho, PR-OC-VENDA-REABRIR-01E), entao
    "assinatura atual diferente da salva" e' verdade em TODO fechamento de venda nao tocada. Fazer certo exige uma
    assinatura de BASE capturada quando a hidratacao termina (lotes e boitel chegam em momentos diferentes) — mais
    que "disparo no fechar + AlertDialog". Hoje, fechar com rascunho do realizado nao salvo PERDE o rascunho sem
    aviso.

- ⚠ BOITEL-ABATE-PRODUTOR-01 (B-01) — DUAS MODALIDADES DE VENDA EM BOITEL (26/09/2026, decisoes do Gabriel).
  A ('boitel', a de sempre): o boitel abate no nome dele e repassa o liquido. B ('produtor'): o gado abate EM NOME DO
  PRODUTOR — o frigorifico paga o produtor (principal, 1150, favorecido = frigorifico) e o boitel cobra as despesas em
  boleto (obrigacao `acerto_boitel`, subcentro NOVO 1155 "Acerto de Boitel (despesas)", favorecido = boitel). A conta e' a
  MESMA do motor (`fba - descontoDoAcerto`); o slot (valor da operacao) e' o LIQUIDO nas duas.
  Migration `supabase/migrations/20261027154000_boitel_abate_produtor_01.sql` (⚠ registrada como `20260926113750`), patch
  guardado por md5 em 7 funcoes: `zoo_operacao_boitel.quem_abate`/`frigorifico_id`; 1155 no plano (o PRIMEIRO centro com
  entrada e saida, opcao C); `fn_dre_pecuaria` e `fn_dre_pecuaria_lancamentos` passam a ABATER saida no bloco venda;
  guarda do principal na B = slot + acertos (sem tolerancia, 1 centavo recusa); revalorar na B nao toca o principal;
  frigorifico obrigatorio no realizado da B; 1155 -> acerto_boitel no vincular.
  ⚠ PROVAS: DRE dos 7 clientes x 27 periodos x 2 cenarios (378 saidas) identico; diferenca semantica dos predicados
    sobre 37.873 lancamentos e 1.888 linhas de planejamento = 0; A das 14 OCs identica (revalorar e guarda); B provada em
    rollback (ver o cabecalho da migration).
  ⚠ FRONT: seletor "Quem abate" (Segmentado) no bloco Comercializacao; Frigorifico com o `SearchableSelect` do Comprador
    (mesma lista de favorecidos ATIVOS — o `FavorecidoSelect` do financeiro pede `FornecedorV2` com dados de pagamento que a
    OC nao carrega). A previsao saiu do `VendaModalShell` para `src/components/venda/previsaoBoitel.ts` (movida, diff -w so'
    com os tres ajustes de parametro) e ganhou o ramo B; o resumo lateral da B e' "(+) Recebido do frigorifico · (−) Pago ao
    boitel · (=) Liquido".
  ⚠ DIVIDAS DO B-01 (registradas a pedido do Gabriel):
    (1) BAIXADA no 01b (abaixo): o rodape do dialogo dizia "= A repassar pelo boitel" tambem na B;
    (2) o card do DRE (composicao recebido - pago, cabecas, R$/cab das diarias) e' o B-02, com mock;
    (3) o conteudo APLICADO da migration (`schema_migrations`, 20260926113750) leva um CABECALHO RESUMIDO, e o arquivo
        leva o cabecalho completo com as provas — os comandos sao os mesmos e os sete md5 de destino conferem; quem
        comparar texto a texto encontra so' a diferenca de comentario.
  ⚠ docs/PLANO-DE-CONTAS.md ganhou o 1155 A MAO, com a excecao dita no cabecalho da propria doc (conferido: 229 linhas,
    221 globais).
  ⚠ 01b — O DIALOGO "Comercializacao e Adiantamento" (homologacao de 26/09, 09:04, na 77d963be):
    (a) O FRIGORIFICO SAIA ILEGIVEL, e o erro foi meu no B-01: `[&_button]:bg-card` no `SearchableSelect` vaza para as
        OPCOES (o painel nao e' portal e cada opcao e' um `<button>` de texto `zinc-100`) — branco sobre branco. Virou o
        `FavorecidoSelect` do financeiro, com `opcoesDeFavorecido` levando {id, nome} a `FornecedorV2` (demais campos
        nulos): mesmo painel, busca e densidade. ⚠ O briefing dizia painel "bg-popover claro"; o do financeiro e' o
        vidro ESCURO (`COMBOBOX_PALETA`). Valeu "identico ao do financeiro".
        ⚠ O Comprador usa as MESMAS classes `[&_button]` e esta' legivel (sem `bg-card`), mas elas inflam as opcoes para
        32px/12px. Nao mexido — fora do escopo.
    (b) "Quem abate" saiu do topo da Comercializacao e virou painel proprio na coluna da direita; na B o Adiantamento
        some (nao ha adiantamento na B) e o Frigorifico mora ali. Medido (altura necessaria x teto de 85vh = 680px a
        800 de altura): realizado B 515, A 517, A com adiantamento "Sim" 568; projetado 392 nas duas — nada rola.
    (c) Rodape da B: "(+) Recebido do frigorifico · (−) Pago ao boitel" (diarias e notas no boitel na sublinha) ·
        "(=) Liquido"; o campo de papel e' "Boleto do boitel (papel)", conferido contra o PAGO (`descontoDoAcerto`),
        nao contra o liquido. A A nao mudou.
  ⚠ 01c — O "GERAR COMPROMISSOS" RESPEITA A B (homologacao de 26/09, 09:08, na cd4c54b0). O dialogo montava as linhas
    pelo LOTE (`AbaCompromissosOC`, memo `propostas` via `classificarLotesPorLado`) e nunca passava por `previsaoBoitel.ts`:
    na B saia UMA linha de 516.459,04 com a contraparte como pagador. Agora `propostasBoitelProdutor` traduz as linhas de
    `linhasPrevisaoBoitel` (acerto + recebimento do frigorifico) e a aba as usa NO LUGAR da proposta por lote
    (`propostasDoMotor`), com a mesma idempotencia; o favorecido vai por linha na gravacao. Na A a prop e' `undefined`.
    Caminhos de venda boitel: "Gerar previsao" (ja' lia a previsao), "Gerar compromissos" (este conserto) e o "+ Novo
    compromisso" manual (digitado; a principal ja' obedece o `bloqueioPrevisao`, que inclui o aviso da B).
    ⚠ O DIALOGO NA B CONFERE O LIQUIDO EM CENTAVOS, SEM TOLERANCIA — a guarda do banco nao aceita um centavo. A A ficou com
      a regra de sempre (`|dif| <= 0,01` em reais), que por ponto flutuante NAO da' "confere" num centavo exato
      (656.957,17 − 656.957,16 = 0,0100000001): pre-existente, nao tocado.
    ⚠ O BOITEL DA cd4c54b0 E' "JBS (boitel)", nao Ricardo Goulart como dizia o briefing: o favorecido do acerto e' a
      CONTRAPARTE da OC (`compradorId`), e e' ela que esta' gravada. Dado, nao codigo.
  ⚠ DADOS AGUARDANDO OK (nada gravado): 77d963be -> B com JBS, boleto 41eda416 de 5010 para 1155 (DRE do RRCC: civil 2023
    vendas 1.791.708,52 -> 1.482.830,55; lucro -419.319,66 -> -728.197,63); cd4c54b0 so' tem o LIQUIDO no financeiro
    (b51bc0fa, 516.459,04) — nao ha recebido do frigorifico nem boleto lancados.

- ⚠ OC-EDITAR-CADASTRAL-01 — COM A OC FECHADA SO' O CADASTRAL SE EDITA, E SEM REABRIR (26/09/2026, decisoes do Gabriel).
  CADASTRAIS: contraparte (comprador/fornecedor), observacoes, NF (`numero_documento`) e documentos. TODO O RESTO e'
  operacional e ja' nasce TRAVADO com a OC fechada (`CAMPO_TRAVADO` + cadeado no rotulo + selo "Operacao fechada · reabra
  para editar" no titulo, o selo de `LancamentoZooModal`): data (decisao a, inclusive na compra), fazenda, tipo de venda,
  lotes e boitel (Quem abate, Frigorifico e blocos).
  ⚠ O DEFEITO: o caminho existia desde 30/08 (`oc_editar_dados_operacao`, PR-OC-EDICAO-POS-FECHAMENTO-01) e SO' A COMPRA o
    usava — venda e abate mandavam o cabecalho sempre para `oc_salvar_rascunho`, que recusa "Negociacao fechada; reabra
    para editar (oc_reabrir)". Caso real: da0b8577 (RRCC, 29/07/2025), o Gabriel teve de reabrir para trocar o comprador.
  BANCO: migration `supabase/migrations/20261027155000_oc_editar_cadastral_01.sql` (⚠ registrada como `20260926132939`),
  corpo INTEGRAL: `oc_editar_dados_operacao` md5(prosrc) ba017ed7 -> 3caddc14 (arquivo = banco). (a) `data_operacao` SAIU da
  lista; (b) na troca de contraparte, o compromisso NAO CANCELADO, SEM TITULO VIVO, cujo favorecido era a contraparte
  ANTERIOR passa para a nova, e o evento `editar_dados` leva `compromissos` de/para. "Aberto" da decisao e' "sem titulo",
  nao o status literal (144 `programado`, 1 `aberto`). Titulo, parte, vinculo e hash nunca sao tocados. proacl
  `{postgres, service_role, authenticated}`, anon = false.
  ⚠ PROVA EM ROLLBACK na da0b8577 (funcao aplicada): data recusada; S1 aberto e S3 programado-sem-titulo foram para a nova;
    S2 com favorecido proprio e o principal com titulo (tambem com o favorecido forcado para a contraparte atual) ficaram;
    titulos da OC (1), hash, financeiro do RRCC (3.114), vinculos do banco inteiro (4.855, 41 de titulos de OC), partes
    (197), rebanho do RRCC (418), 178 compromissos e `fn_dre_pecuaria` civil 2025 e 25/26 — IDENTICOS.
    ⚠ A PRIMEIRA RODADA MEDIU VINCULOS SO' DO RRCC, e o RRCC tem ZERO: md5 de conjunto vazio e' nulo e deu "MUDARAM". E' a
      lei do "PROVA DE IDENTIDADE REPORTA O TAMANHO DO CONJUNTO" — refeita no banco inteiro.
  TELA: `src/lib/oc/edicaoCadastralOC.ts` decide o caminho pelo status e filtra so' os cadastrais; `salvarDadosOperacaoOC`
  (LancamentosTab) serve os tres modais, com o snapshot preenchido na carga dos tres e a contraparte do modal aberto. Venda
  e abate FECHADOS gravam os cadastrais no Salvar e ao fechar o modal; abertos, como antes.
  ⚠ "LANCAR REALIZADO" DO BOITEL CONTINUA com a OC fechada (`podeLancarRealizado`): o iniciar reabre antes do dialogo.
  ⚠ P1: o Salvar da OC fechada grava so' cadastral e o motivo do mes fechado nao aparece nele; aberta, segue como antes. E
    na venda e no abate o P1 NUNCA desabilitou o Salvar — so' escrevia o motivo ao lado; quem trava e' o Concluir.
  ⚠ OS TOASTS DE "FECHADA" SAIRAM (venda e abate): a recusa que sobrar vai AO LADO do Salvar (`erroSalvarOC`), inclusive a
    da compra. O helper `toastNegociacaoFechada` ficou sem chamador e foi apagado.
  ⚠ DADOS (item 8, so' listado): 14 compromissos em 13 OCs tem favorecido = uma contraparte anterior e diferente da atual —
    TODOS com titulo (a da0b8577 inclusive: o principal f9b39fa0 e' `programado` com titulo realizado de 466.030,10). Pela
    decisao (b) nenhum e' elegivel; nada a gravar.

- ⚠ DRE-MODAL-VALOR-01a — BANCO DO MODAL DE VALOR DO DRE (26/09/2026, mock dre_modal_valor_mock_v1 do Gabriel). A tela e' o
  01b. Migration `supabase/migrations/20261027156000_dre_modal_valor_01a.sql` (⚠ registrada como `20260926144505`).
  NENHUM NUMERO DO DRE MUDOU: tudo e' chave NOVA no jsonb (nenhuma assinatura de retorno muda) mais uma CTE `not materialized`.
  (1) `fn_dre_pecuaria` (patch guardado por md5, 18742cc2 -> e9b5b5dc): RATEIO ADM ABERTO POR GRUPO — `admg` e' a MESMA
     formula do `adm` agrupada pelo `centro_custo` do lancamento administrativo (linear: a soma dos grupos e' o pool por
     construcao); `admfz` reparte cada grupo por fazenda pelas cabecas medias, arredondado a centavo, com o RESIDUO do
     arredondamento no maior grupo — a soma dos grupos da fazenda e' EXATAMENTE o `rateio_adm` dela. Chaves novas:
     `rateio_adm.grupos` (pool por grupo), `rateio_adm_grupos` por fazenda e no total. Casamento: Administracao, Impostos,
     Mao de Obra, Maquinas -> os de mesmo nome do Custo Fixo Pecuaria; Financeiro -> linha propria (sem par). Os cinco
     centros sao os unicos com saida no pool (medido). Variaveis nao tem rateio.
  (2) `fn_dre_pecuaria_lancamentos` (3f0e203d -> aa6d090f): a CTE de datas `per` virou `not materialized` — materializada,
     o filtro de data deixava de ser condicao de indice. NJ 07/2025-06/2026, Total, custo fixo (1.533 linhas):
     4.074 / 1.647 / 2.915 ms -> 260 / 318 / 409 ms em rollback; aplicada, 217 / 264 / 264 ms como `authenticated`. As
     linhas ganharam `pagamento`.
  (3) `fn_painel_rateio_detalhe` (964888bb -> 6f69f1cc), DROP + CREATE: quatro parametros opcionais — `p_atividade`
     ('agricultura'), `p_de`/`p_ate` (NULL = datas da safra), `p_cenario` ('realizado'). Sem eles, a lavoura e' a de sempre.
     O ramo admin GENERALIZADO e' a lista do rateio adm da PECUARIA: cada linha com `grupo`, `pct` (do ano), `parte`
     (valor x pct / 100, sem arredondar) e `origem` (planejamento so' na meta, espelho do `plm`); saem `grupos` e
     `pct_atividade`. As listas ganharam `pagamento`, `status` e `fazenda`.
     ⚠ GENERALIZAR E NAO CRIAR: uma funcao nova seria a QUARTA copia da lista de exclusoes do macro_custo
       (fn_dre_pecuaria tem duas agora — `adm` e `admg` —, fn_painel_rateio_detalhe as outras). Quem mudar a lista muda
       nas duas funcoes; o casamento de grupos depende disso.
  ⚠ PROVAS (rollback, com as funcoes antigas em pg_temp na mesma transacao): fn_dre_pecuaria 224/224 saidas identicas
    sem as chaves novas (7 clientes x 16 periodos x 2 cenarios), grupos = rateio_adm no total, no pool e em 283/283
    fazendas-periodo; listas da pecuaria 48/48 identicas (20.587 linhas) sem `pagamento`; lavoura 35/35 identicas (5.664
    linhas); rateio adm da pecuaria pela funcao generalizada: soma das partes = pool, soma dos valores = bruto e soma dos
    grupos = pool, 28/28 ao centavo.
  ⚠ LICAO DE METODO, paga nesta frente: rodada que estoura o tempo do canal MCP CONTINUA RODANDO no servidor e segura os
    locks da funcao que ela redefiniu — as rodadas seguintes ficam ESPERANDO e tambem estouram, e parece lentidao da
    funcao. `pg_stat_activity` mostrou duas presas; canceladas, a mesma chamada levou 260 ms. Rodada de prova leva
    `SET LOCAL statement_timeout` abaixo do tempo do canal, e depois de um estouro confere-se o `pg_stat_activity` antes
    de repetir.

- ⚠ DRE-MODAL-VALOR-01b — UM MODAL DE VALOR PARA A LAVOURA E A PECUARIA, E O RATEIO ADM NOS GRUPOS (27/09/2026, mock
  `docs/mocks/dre_modal_valor_mock_v1.html`). Sem banco.
  (1) GRADE DA PECUARIA: botao "Diretos | Rateio nos grupos" (`rateioNosGrupos`, `defsDaGrade`, `valorDaFilha` em
     `drePecRegua`). Ligado, o custo fixo e' a soma composta (`custo_fixo + rateio_adm`) nos dois modos, cada grupo soma o
     seu `rateio_adm_grupos`, o grupo sem centro (Financeiro) vira filha "so rateio adm." e a linha/filha do rateio total
     SAI. Desligado e' `LINHAS_DO_MODO` intacto. Medido na tela, NJ 07/2025-06/2026: custo fixo 3.661.367,52 e Lucro
     operacional 5.321.717,25 nas duas posicoes; as sete filhas ligadas somam 3.661.367,52.
     ⚠ NO DETALHADO, LIGADO, A LINHA "(−) Custo fixo" MUDA DE NUMERO (absorve a do rateio, que some). O que e' identico e'
       custo fixo + rateio e o resultado — e' o mesmo contrato do Resumido.
     ⚠ OS ROTULOS SAO CURTOS POR MEDICAO: "Custos diretos | Com rateio adm. nos grupos" pedia ~320px e estourava 84px por
       cima do card "Por fazenda". O botao mora DENTRO do slot fixo de 247px do Δ (botao 154 + 6 + Δ 81 = 241), o texto
       inteiro no `title`.
  (2) MODAL UNICO: `ModalValorDre` (`src/components/agri/RateioDetalheModal.tsx`) com dois adaptadores puros,
     `valorDaLavoura` e `valorDaPecuaria`. SAIRAM `PecLancamentosModal`, `PecRateioAdmModal` (zero import, conferido), o
     modal de tres abas e os donuts da lavoura, e `ecoDaCelula` (sem chamador). `subtituloDoRateio` e `notaDoRateio` ficam.
     A linha de rateio vem na parte da CELULA: a `parte` da RPC repartida ate' o rateio da coluna por `ratearNoAlvo`
     (centavos, residuo na maior) — o rodape fecha na celula. O R$/cab/mes e' o `porCabeca` da grade, com a `cab_media` e
     os `meses` que viajam no clique (`RecortePec.celula`). A linha do rateio administrativo abre a aba Rateio em QUALQUER
     coluna de valor (antes, so' o periodo da tela). Lista do rateio da pecuaria: `useRateioAdmPec`, so' com o modal aberto
     numa celula com rateio.
  ⚠ LAVOURA-MODAL-X-GRADE-01 — achado, NAO tratado (e' banco): o modal da lavoura fecha no numero da
    `fn_painel_rateio_detalhe`, que diverge da `fn_dre_lavoura` da grade. NJ 25/26, Amendoim, Operacoes Mecanizadas: grade
    855.283,36; RPC do modal 426.301,60 direto + 421.784,27 de rateio = 848.085,87 (diferenca 7.197,49). O modal antigo
    mostrava o MESMO 848.085,87 no cabecalho (`ecoDaCelula`): e' anterior a este PR. Quem retomar mede qual das duas RPCs
    esta' certa — o modal nao reparte ate' a celula da lavoura de proposito, para nao esconder a diferenca.
    ⚠ FECHADA em 27/09/2026 pelo DRE-CLASSIF-COPIA-01: as duas RPCs estavam certas, cada uma pela SUA fonte — a grade pela
      CHAVE, o modal pela COPIA do centro. 7.197,49 = 9.134,98 de lancamentos com texto e chave divergentes x 78,79 %. Depois
      do backfill, modal = grade: Amendoim 856.117,01 e Mandioca 139.816,26, medido na tela.

- ⚠ BOITEL-ABATE-PRODUTOR-01d — A DIRECAO DO LANCAMENTO E' A DA CONTA DO PLANO, NAO A DA MACRO (27/09/2026). Sem banco.
  A despesa do 1155 da cd4c54b0 (12e147df, "Boitel 169 G - Acerto boitel", 228.481,96) nao salvava: "Inconsistencia
  entre tipo de operacao e macro". A frase morava SO' no front (`src/lib/financeiro/validacaoLancamento.ts`, regra 3),
  com UM chamador (`FinanceiroV2Tab.handleSave`), e comparava o tipo com o "sentido" da MACRO — e o 1155 e' 2-Saidas sob
  Receita Operacional (opcao C do B-01).
  ⚠ MEDIDO: das 226 linhas ativas do plano, 220 tem macro checada, 219 com o tipo igual ao sentido da macro e UMA
    diferente — o 1155, global. As 6 restantes (Tributos 5, Transferencias 1) nunca foram checadas e CONTINUAM sem
    checagem: o tipo do plano entra NO LUGAR do sentido da macro, so' onde a regra ja' valia (`erroDeDirecao`,
    `tipoDaContaNoPlano` — a chave ganha do texto; combinacao legada sem `id` cai na macro).
  ⚠ A RECUSA SAIU DO TOAST: o `LancamentoV2Dialog` confere antes de gravar e a frase vai embaixo do Subcentro
    (`ClassificacaoLancamento.erroSubcentro`), valendo so' enquanto subcentro e tipo forem os da recusa. A
    `FinanceiroV2Tab` manda o tipo do plano para nao recusar por toast o que o modal aceitou.
  ⚠ O BANCO NAO TEM GUARDA DE DIRECAO x CONTA, em conta nenhuma — provado em rollback: uma entrada no 1155 com o sinal
    coerente e' ACEITA (a unica recusa e' o `chk_sinal_coerente_tipo`, que e' sinal, nao plano). O `resolve_classificacao_
    from_plano` (md5 2bf6f93b) so' resolve texto/chave. Os OUTROS caminhos de escrita (OC, vincular, conciliacao,
    importacao, a grade do DRE que abre o mesmo modal) nunca passaram por esta regra. Guarda no banco seria regra NOVA
    para todo escritor: frente propria, se decidida.
  ⚠ NADA GRAVADO: a saida realizada em 17/06/2024 passa no banco em rollback; o Gabriel salva pela tela.

- ⚠ OC-RECLASSIFICAR-ITEM-01 — A CLASSIFICACAO DE UM ITEM DA OC SE CORRIGE PELA OC (27/09/2026, decisoes do Gabriel). No
  Financeiro ela continua travada. `oc_reclassificar_item(p_compromisso_id, p_plano_conta_id, p_componente, p_motivo,
  p_simular)` (migration `20261027157000_oc_reclassificar_item_01.sql`, ⚠ registrada como `20260927100323`; md5 ded4a192,
  banco = arquivo): compromisso + partes vivas (conta, 4 copias, componente) e titulos vivos (SO' `plano_conta_id`; o
  gatilho resolve as copias e o hash fica) numa transacao; versao + 1; evento `reclassificar_item` com de/para e um motivo.
  Nao toca valor, datas, pagamento, conciliacao, liquidacao, rebanho nem favorecido.
  DECISOES: (1) vale com a OC FECHADA; (2) o seletor abre o plano INTEIRO da direcao do item; (3) conta com varios
  componentes no mapa -> o operador escolhe no mesmo dialogo; conta fora do mapa -> componente fica; (4) retorno a' OC neste PR.
  ⚠ CONTA DE OUTRA NATUREZA NO MAPA (principal x obrigacao) TAMBEM MANTEM O COMPONENTE: a natureza nao muda por aqui, e um
    `principal` com componente `frete` seria item que nenhuma tela le'. Nao estava na letra da decisao 3.
  ⚠ O DRE PODE MUDAR DE VERDADE, e a tela diz antes: 5010 fica FORA do DRE e 5030 entra em Deducoes, entao o frete da
    77d963be derruba o resultado do RRCC civil 2023 em 6.000,00. Investimento compoe o DRE e NAO o resultado.
  TELA: "Reclassificar" no menu "..." da linha do compromisso (`AbaCompromissosOC`), dialogo irmao do Desvincular
  (`ReclassificarItemDialog`), com o seletor da casa, o componente quando a conta pede, o motivo e o aside da simulacao.
  RETORNO: `retornarDoDrill` passa a origem da URL (`origemDaVolta`) — antes gravava `financeiro-lanc` e fechar a OC caia no
  Financeiro; sair pelo "Abrir →"/"corrigir na operação" limpa o `drillReturn` (ficava preso); e VENDA e ABATE passaram a
  honrar `?oc_aba`, como a compra — a volta caia na identificacao. Conferido no preview: Editar o titulo pela OC, Cancelar,
  volta na OC na aba Financeiro, Fechar, Central.
  ⚠ EFEITO COLATERAL DO `oc_aba`: os links que JA' mandavam `oc_aba=negociacao` (LancamentoDetalhe, o "i" do zoot,
    LancamentoV2Dialog) e `documentos` (AbaDocumentosLancamento) para uma VENDA ou ABATE passam a abrir nessa aba — era a
    intencao escrita neles, que o shell ignorava.
  ⚠ OC-RETORNO-GERAL-01 — pendencia, nao tratada: o LINK DIRETO `?oc_venda=1&oc_id=...&oc_aba=financeiro` AINDA PERDE O
    `oc_aba` na carga (a URL volta sem ele e a OC abre na primeira aba) — anterior a este PR, causa nao medida. A volta do
    drill nao passa por ali.
  ⚠ VARREDURA UX (pendencia, nao tratada): o modal do Financeiro aberto pela OC ("Editar" do titulo) mostra o campo
    Subcentro sem sinal de travado, embora a classificacao do titulo de OC seja da operacao. Visto no preview na 77d963be em
    27/09/2026; nao investigado se o campo esta' de fato editavel ou so' sem o cadeado.

- ⚠ MODAIS-PADRAO-01a — UM RESUMO LATERAL SO' PARA VENDA (comum, boitel A/B), ABATE E COMPRA (27/09/2026, mock
  `docs/mocks/abate_modal_6_abas_compacto_v3.html`). So' layout: nenhum campo, calculo, rotulo ou fluxo mudou.
  PECAS em `src/components/ui/linha-resumo.tsx`, MOVIDAS do `AbateModalShell` (as classes sao as dele):
  `AsideResumo` (240px, `flex h-full flex-col`, so' a lista rola dentro do card), `FaixaTituloResumo` (status em
  `children`) e `SecaoResumo` (10px; `extra` para a `PilulaCenario` do boitel). O `BlocoHead` da Compra saiu.
  ⚠ `forte` DO `LinhaResumo` PASSOU A 11px NO COMPONENTE COMPARTILHADO (A18 modal: linha 10, forte 11) — vale nos tres
    asides, os unicos importadores; no Abate cresceram "Acordado (NF)" e "Liquido do produtor".
  Identificacao em LINHAS nos tres (Abate: Frigorifico, CNPJ onde existe, Data, Fazenda). Nota do boitel 9px -> 10px
  com o padding da linha. Venda e Compra (so' modo OC) 280 -> 240px.
  ⚠ SUBLINHAS POR MEDICAO (218 uteis, Inter, pior caso R$ 9.999.999,99): so' "(+) Adiantamento a reembolsar" (-10,4px ja'
    com R$ 95.243,50) e "(=) A RECEBER DO BOITEL" (-5,8px em milhoes) empilham; as da B cabem (Recebido do frigorifico
    +5,5, Liquido +69).
  ⚠ PROVA: texto do aside antes x depois (preview) nas cinco OCs — ceabd850, f56c50d3, da0b8577, 77d963be, dbbac65e —
    identico; a unica diferenca e' a Identificacao do Abate virando linhas, com os mesmos quatro valores.
  PENDENCIAS, nao tratadas:
    (a) ALTURA IGUAL DOS ASIDES DEPENDE DOS SHELLS: o aside estica ate' o corpo, e o corpo e' 69vh na venda e na compra
        (368px a 579 de altura) contra `100vh-32` no Abate (479px). E' a fatia 2 (venda e compra 69vh -> 100vh-32).
        Ate' la', os asides dos boiteis rolam dentro do card.
    (b) o `CompraResumoPanel` LEGADO (modo nao-OC) segue na coluna de 280px — a grade da compra so' vai a 240 no modo OC.
    (c) "Saldo" negativo do resumo da venda (Vera b58bf556, -107.150,94) sai SEM VERMELHO -> OC-SALDO-MODAL-01.
    (d) o seletor de comprador da venda mostra o UUID cru por ~1s antes de a lista de contrapartes carregar (ceabd850)
        -> FORNECEDOR-UUID-CRU-01.

- ⚠ MODAIS-PADRAO-01d — O ENVELOPE DOS LANCAMENTOS SIMPLES NA REGUA DO ABATE (27/09/2026). `LancamentoModalEnvelope`:
  cabecalho 36/13px, altura `100vh-32` na raiz (era `69vh + 38px` no corpo), resumo 240px esticado com `AsideResumo` /
  `FaixaTituloResumo` (ganhou `titulo` opcional: "Resumo do lancamento" / "Resumo da meta") / `SecaoResumo`, rodape 32px com
  botoes 22px. Morte, Nascimento, Venda meta e Compra meta perderam a copia local do par rotulo-valor (usam `LinhaResumo`);
  as variantes de FAZENDA ficaram locais — pintam o "—" de vermelho quando falta, e o par compartilhado so' colore valor.
  ⚠ SAO 6 USUARIOS, NAO 7: Morte, Nascimento, Venda meta, Compra meta, `CargaModal` e `CargaMandiocaModal`. O
    `BarterListaModal` so' CITA o envelope num comentario (tem casca propria). Todo `DialogContent` que monta o envelope leva
    `max-h-none` — com o teto do tema o rodape ficaria abaixo da borda.
  ⚠ PROVA: texto do modal antes x depois identico nos 6 (e nas abas das duas cargas); os 4 shells zoot renderizados com
    dados em 12 estados, 7.017 bytes iguais byte a byte, vermelho da fazenda nos mesmos casos.
  ACHADOS, nao tratados:
    (a) a Compra NAO aparece em "Lancar meta" no primeiro carregamento — so' depois que a lista termina de carregar. Quem
        abre a tela e clica rapido nao ve a opcao. Causa nao medida.
    (b) os titulos de secao dos resumos de `CargaModal` e `CargaMandiocaModal` estao em 9px, abaixo do piso de 9,5px — e'
        conteudo daqueles modais, fora do 01d. Varredura UX.

- ⚠ MODAIS-PADRAO-01e — O DIALOGO DE LANCAMENTO DO FINANCEIRO (`LancamentoV2Dialog`) NA REGUA DO ABATE (27/09/2026).
  Cabecalho 36/13px, abas 20/10px com a ativa em navy claro (era sublinhada), rodape 32px com botoes 22px, altura
  `100vh-32` sem o teto do tema, X no meio da faixa. Resumo 240px (era 300) com `AsideResumo`/`FaixaTituloResumo`/
  `SecaoResumo`/`LinhaResumo`; `ResumoBlocoHead` e `ResumoRow` locais sairam.
  ⚠ O RODAPE VOLTOU A' LARGURA INTEIRA, como no Abate. Desde o 02H o resumo descia ao lado do rodape para ganhar
    altura; com a altura pela janela ele ja' tem a do corpo, e as cinco cascas ficam com a mesma forma.
  ⚠ O ESPACO DO TEMA FOI ZERADO (`gap-0`): o `gap-4` do `DialogContent` abria 16px entre cabecalho, corpo e rodape da
    grade — 32px que o resumo perdia. O resumo mede 477px, e nao os 479 do Abate: aqui a altura esta' no proprio
    `DialogContent` (a borda de 1px conta dentro), no Abate esta' no filho.
  ⚠ `RodapeCancelamento` (unico chamador) acompanhou: botao 22px e frases de 10px — a do titulo de OC quebrava em
    tres linhas e passou a caber numa so' dentro dos 32px.
  ⚠ MODO EXCEL (Mesa) — a casca nova (cabecalho, abas, rodape) vale nele tambem, porque sao os mesmos elementos; a
    altura continua 92vh e o painel "Contexto Excel" nao mudou. NAO FOI MEDIDO no navegador.
  ⚠ PROVA: texto do modal inteiro antes x depois identico nas 4 abas de Novo (saida e entrada), Editar comum e Editar
    titulo de OC (frete da 77d963be) — 16 telas. A parcela de financiamento nao usa este dialogo.

- ⚠ MODAIS-PADRAO-01f — TRANSFERENCIA, CONSUMO E EVOLUIR CATEGORIA NO ENVELOPE DA REGUA (27/09/2026). Os tres sairam do
  ramo generico do `LancamentosTab` para o `LancamentoModalEnvelope` (cabecalho 36/13 com titulo, cenario, data e fazenda;
  corpo `100vh-32`; resumo 240 com as pecas de `ui/linha-resumo`; rodape 32 com botoes 22/10). Os botoes de acao sairam
  dos paineis para o RODAPE — mesmos textos, mesma ordem. O Consumo nao tem resumo: a coluna da direita e' o painel "Valor
  do consumo" (o envelope ganhou `tituloResumo`), com o miolo copiado verbatim.
  ⚠ CENARIO FIXO PELO CAMINHO, SEM ESCOLHA: "Lancar movimentacao" = Realizado, "Lancar meta" = Meta; o cenario e' o selo do
    cabecalho, e a edicao mantem o do registro. Os cards Realizado/Meta sairam dos tres.
  ⚠ DEFEITO CORRIGIDO NO EVOLUIR CATEGORIA, visto na tela: o estado nascia FIXO em 'realizado' (`ReclassificacaoForm`) e os
    cards so' checavam a permissao de consultor, ignorando `cenariosPermitidos`. Em "Lancar meta" a evolucao abria como
    Realizado e seria gravada assim sem clique nenhum; em "Lancar movimentacao" um consultor gravava meta. Agora
    `useReclassificacaoState({ cenarioInicial })` nasce do `defaultCenario` do caminho (e de novo ao abrir o card), e
    nenhum caminho deixa trocar — nem para consultor. Os cards sairam do componente, entao sairam TAMBEM do
    `EditReclassificacaoSheet` (coerente: a edicao mantem o cenario do registro). A prop `hideStatus` morreu; o
    `FechamentoTab`, unico usuario, perdeu uma linha.
  ⚠ PROVA: gravacao por teste (`src/components/reclassificacaoCenario.test.tsx`: mesmo preenchimento, os dois cenarios, so'
    `statusOperacional` muda — null na meta, 'realizado' no realizado — e o formulario sem Realizado/Meta). Transferencia e
    Consumo por diff: `handleRequestRegister`/`handleSubmit` intocados, ja' guiados pelo caminho (o cliente do Supabase guarda
    a referencia do `fetch` na criacao, entao o insert nao se intercepta no navegador). Texto antes x depois nos 6 estados
    (3 modais x realizado/meta): so' sairam os cards, a frase do cenario, o titulo grande (subiu ao cabecalho), "Resumo da
    Operacao" e "Close"; casca 36/479/32, zero corte, zero rolagem horizontal.
  ⚠ `TransferenciaResumoPanel.tsx` FOI APAGADO (sem importador). O `ReclassificacaoResumoPanel` FICA: o
    `EditReclassificacaoSheet` e o `FechamentoTab` ainda o usam.
  ACHADOS, nao tratados:
    (a) CENARIO-EDICAO-01 — `EditTransferenciaSheet` e `EditConsumoSheet` ainda deixam TROCAR o cenario na edicao.
    (b) reclassificacao 2b134b8a (NJ, 2 vacas -> novilhas, data 15/03/2026, criada 17/04/2026 numa sessao de 19 metas e 4
        realizados) e' o UNICO suspeito de meta gravada como realizado. Sem criterio confiavel: "data depois da criacao" da'
        0 entre as 1.184 realizado e 25 entre as 58 meta (a busca sabe achar). O Gabriel confere.

- ⚠ DRE-RESUMIDO-CUSTEIO-01 — O RESUMIDO DA PECUARIA MOSTRA "(−) Custeio de produção" NO LUGAR DA MARGEM (27/09/2026, mock
  `docs/mocks/dre_resumido_custeio_mock_v4.html`, decisoes do Gabriel). So' o Resumido muda; o Detalhado ficou IDENTICO.
  Custeio = custo variavel + custo fixo + rateio administrativo (o custo fixo que o Resumido ja' mostrava), selo "c/ rateio",
  FECHADO por padrao; aberto, Custo variavel e Custo fixo viram filhas (zebra #F5F4F0/branco, um degrau de recuo) e cada uma
  abre os seus grupos como antes. Sairam a Margem de contribuicao e o % do VBP dela. VBP e Custeio ganharam a sublinha "por
  hectare" (mesma `LinhaPorHectare`, mesma area `ha_medio` da coluna), no fundo da linha de cima (faixa t2 / #D6D4CC); o
  Custeio NAO tem % do VBP. O Custeio nao tem modal nem historico — so' abre e fecha.
  ⚠ CORES PELO SINAL NO RESUMIDO (`sinalNaFaixa`): Receita bruta, Receita liquida, VBP e Lucro liquido saem VERDES no positivo
    (eram o azul do total); negativo vermelho. A faixa t4 (navy, ▲/▼) nao mudou; o Detalhado segue no azul (`corDoTotal`).
  ⚠ O GRAFICO DA CASCATA NAO MUDOU, e foi de proposito: `montarBarras` (PecCascataView) percorre `LINHAS_PEC_RESUMIDO` e desenha
    a Margem como subtotal. A grade passou a ler uma lista PROPRIA, `LINHAS_PEC_RESUMIDO_GRADE`, derivada daquela; o grafico e o
    modal de historico seguem na lista original.
  ⚠ O CUSTEIO NAO TEM CHAVE NA RPC (`agrupa`): o valor e' o `compor`, e a `chave` ('custo_variavel') e' so' o lugar que o tipo
    exige — a grade pergunta `agrupa` antes de abrir lista, historico e de dividir o Δ% (que usa a SOMA do grupo na referencia).
  ⚠ O CABECALHO DO GRUPO NAO TEM RECUO, por medicao (desvio aprovado pelo Gabriel): com os 8px da regua, rotulo + seta + selo
    mediam 172,43px nos 172 uteis da coluna de 200 e o selo saia "c/ ratei…" (reticencia e' proibida). Sem o recuo sobram 7,6px;
    a seta do Custeio fica 8px a esquerda da do Investimento.
  ⚠ "abrir tudo" (`AgriDreLavouraTab`, `gruposDaAba`) passou a incluir o grupo pelo `id`; sem ele abriria os centros com o
    Custeio fechado por cima.
  ⚠ PROVAS: no banco, VBP − (custo variavel + custo fixo + rateio) = Lucro operacional em 205 de 205 linhas com valor (228
    comparadas: 7 clientes x 2020-2026 x realizado/meta, total e fazendas), zero divergencias — e SEM o rateio 94 divergem (a
    busca sabe achar). Rodado pelo canal proto-write em transacao READ ONLY + rollback: o canal de leitura nao tem EXECUTE em
    `fn_dre_pecuaria`. Na tela (RRCC 2021-2026): Detalhado identico em texto, cor e ordem em 6 estados (208 linhas); Resumido
    com todo valor igual fora as linhas trocadas; tabela de 834px igual fechada e aberta.

- ⚠ DRE-MODAL-REFRESH-01 — O MODAL DE VALOR DO DRE ACOMPANHA A ESCRITA FEITA A PARTIR DELE (27/09/2026). Relato do
  Gabriel (Administracao R$ 333.322,65, 455 lancamentos, 293 de rateio adm.): salvar um lancamento aberto pelo modal nao mudava a
  lista, os cards nem o total — so' fechar e reabrir. A grade atras JA' atualizava (DRE-REFRESH-01); o modal, nao. Sem RPC, schema,
  layout ou componente novo.
  TRES CAUSAS, TRES CONSERTOS:
  (1) CARDS DA PECUARIA liam `recorte.celula`, a FOTOGRAFIA que a grade tira no clique (`celulaDaColuna`). Agora
     `celulaAtualizada(recorte, dre)` (`RateioDetalheModal.tsx`): a FORMA vem do clique (fazenda, bloco, centro, grupo, se ha
     direto/rateio) e os NUMEROS do DRE relido, pelas mesmas leituras da grade. Nenhuma soma local; sem DRE da coluna, vale a foto.
     Um teste trava que, para cada celula clicada na grade, a releitura sobre o mesmo DRE devolve EXATAMENTE a celula do clique.
  (2) A LISTA DO RATEIO ADM. (`useRateioAdmPec`, linhas "rateio adm." e aba Rateio) nunca era relida — o caso do relato. Ganhou
     `recarregar` (prefixo `'dre-pec-rateio-adm'`).
  (3) O MODAL DA LAVOURA guarda no estado da pagina a resposta de `fn_painel_rateio_detalhe` do clique. O estado passou a guardar a
     `chave`, e `reconsultarRateio` refaz a MESMA chamada trocando so' os `dados`.
     ⚠ A RECONSULTA DA LAVOURA ESTA' NO CODIGO E NAO FOI PROVADA — nem na tela, nem por teste. Fica para a homologacao do Gabriel.
  UMA RECARGA SO' (`recarregarFontesDoDre`, AgriDreLavouraTab), chamada pelo `onSave` via `salvarERecarregar`
  (`src/lib/financeiro/salvarERecarregar.ts`: so' rele se SALVOU uma EDICAO; falha e criacao nao; cancelar e' o `onClose`) E pela
  inscricao em `inscreverEmLancamentos` — o canal de FIN-V2-REFRESH-02. ⚠ E' ELA QUE COBRE a escrita que NAO passa pelo `onSave`:
  o editor aberto pelo modal pode DESVINCULAR com "Reclassificar para", VINCULAR ou PARCELAR, e os tres gravam por RPC e avisam por
  `notificarLancamentosMudaram`. Aba, segmentado e ordenacao ficam: o modal nao remonta.
  ⚠ NAO HA CAMINHO DE RECLASSIFICACAO VIA OC A PARTIR DO MODAL: o editor e' montado nesta tela sem `onAbrirOperacaoOC`, entao o
    "corrigir na operação" nao navega. Registrado, nao tratado.
  ⚠ PROVA NA TELA (RRCC, Custo fixo jan-dez/2026, lancamento 24c4d7a0, uma linha de RATEIO ADM.): descricao "Contabilidade" ->
    "Contabilidade [teste refresh]" atualizou a linha sem fechar o modal, mesma aba, mesmo segmentado, mesma ordenacao, 161
    lancamentos; voltou a "Contabilidade", conferido no banco (valor, conta, subcentro, datas e status inalterados). Tempo ate' a
    lista aparecer, sem cache, 12 celulas: Custo fixo 200-334 ms antes x 209-322 depois; Custo variavel 271-405 x 143-259.
  ⚠ AO MEDIR TEMPO NUMA ABA EM SEGUNDO PLANO, `setTimeout` e' estrangulado a 1 por segundo: a primeira medicao deu "1000 ms" em
    tudo. `MutationObserver` registra o instante real.

- ⚠ DRE-CLASSIF-COPIA-01 — A CLASSIFICACAO DE UM LANCAMENTO E' A CHAVE; AS COPIAS SAO DERIVADAS (regra permanente, 27/09/2026,
  decisoes do Gabriel). `financeiro_lancamentos_v2.plano_conta_id` e' a UNICA fonte; `macro_custo`, `grupo_custo`, `centro_custo`,
  `subcentro` e `escopo_negocio` sao COPIAS da linha do plano, reescritas pelo gatilho em TODO INSERT e UPDATE — o que vier da tela
  nao prevalece. Migration `supabase/migrations/20261027158000_dre_classif_copia_01.sql` (⚠ registrada como `20260927221721`; md5
  do conteudo no ledger = md5 do arquivo, 57b2b892).
  POR QUE: 647 lancamentos ativos incoerentes (642 com o texto diferente da chave, 5 com a chave certa e grupo/centro velhos), por
  quatro caminhos — o gatilho antigo resolvia pelo texto sem gravar a chave, a FIN-PLANO-CHAVE-01 realinhou pela chave velha, a
  importacao do Agnaldo de 24/04 e o editor regravando a copia depois que o plano mudou (o gatilho so' agia em 6 colunas). Leitores
  pela chave e pela copia divergiam: foi a LAVOURA-MODAL-X-GRADE-01.
  O GATILHO (`resolve_classificacao_from_plano`, 2bf6f93b -> b1be54de, agora `BEFORE INSERT OR UPDATE` sem lista de colunas):
  (1) com chave, e ela mudou ou o texto nao mudou: as cinco copias vem do plano; (2) sem texto: nada; (3) UPDATE sem chave que nao
  mexe em chave nem texto: nada; (4) senao o TEXTO resolve a chave (`fn_plano_conta_do_texto`: mesmo subcentro e tipo, ativa, a
  linha do cliente antes da global, ambiguo = nulo); (5) texto fora do plano: ERRO, exceto `macro_custo = 'Dividendos'` (fica sem
  chave, regra B1). As regras de escopo (FIN-SAFRA-ADM-03, FIN-FAZENDA-ADM-01, FIN-ESCOPO-SAFRA-01) seguem so' quando uma coluna
  soberana muda — mudar descricao nao move fazenda.
  MUDOU O PLANO, MUDAM AS COPIAS: `trg_propagar_plano_para_lancamentos` (`fn_propagar_plano_para_lancamentos`, 6ab44f9d) atualiza
  os lancamentos da chave. A propagacao NAO marca `editado_manual`: ela liga `app.propagando_plano` so' durante o proprio UPDATE, e
  `mark_financeiro_lancamento_v2_editado_manual` (74a76d1a -> d71a1583; sem a guarda, o corpo de antes) desiste com a marca ligada.
  Provado: 0 de 12 importados elegiveis marcados; uma edicao humana logo depois continua marcando.
  BACKFILL POR LISTA FIXA (md5 canonico 12d5949514cd879e2399050f3380ab4a, conferido DENTRO da migration): 638 pelo TEXTO, 9 pela
  CHAVE — os 5 da Leva 1 (NJ lavoura), NJ 67ce4107 e as 3 despesas bancarias da Vera 2024. Auditoria LIGADA: 647 linhas em
  `audit_log`, resumo "DRE-CLASSIF-COPIA-01 | ...", usuario nulo, valores antigos em `dados_anteriores`. So' o `editado_manual`
  ficou desligado durante o backfill.
  ⚠ A LISTA ENTROU EM DUAS PARTES (32 combinacoes + 647 pares id/combinacao) para caber no canal do MCP. O conteudo e' o aprovado:
    a guarda (b) recalcula o md5 da lista montada e aborta se nao for 12d59...; outra guarda confere os md5 dos quatro corpos
    antes do ACL. As duas passaram na aplicacao.
  PROVAS COM O DADO REAL (27/09/2026): 647 alteradas; divergencia ativa chave x copia = 0; as 69.590 outras ativas (md5 3e60019b),
  os 376 sem chave (ff5947b3) e `compoe_dre`/`editado_manual`/fazenda/safra das 84.687 linhas (8ce632d0) IDENTICOS ao antes. ACL
  das tres funcoes SECDEF `{postgres, service_role}`. DRE Pecuaria realizado, 49 pares cliente x ano: mudaram SO' NJ 2026 (1.318,93
  de fixo para variavel), Vera 2026 (6.150,00 de fixo para variavel), Santa Rita 2026 (497,22 de fixo para juros: resultado
  operacional +497,22, resultado do periodo igual) e trocas de centro com total igual (Agnaldo 2022 769.102,14, Agnaldo 2026
  2.300,00, NJ 2026, Santa Rita 2026 350,00, Vera 2025 2.294,45); Vera 2024 = 0. DRE Pecuaria meta: 0. DRE Lavoura, 9 safras: 0
  (so' o `gerado_em`). Gatilho: 13 de 13 casos em begin...rollback, sem residuo.
  NA TELA: o editor do ee728464 mostra "Custeio Produção · Custo Variável Pecuária · Reprodução" (antes: Custo Fixo · Maquinas);
  Maquinas NJ jan-ago/26 foi de 474.096,82 / 259 lancamentos para 479.055,73 / 258, sem os 2 Semen — que aparecem em Reproducao
  (179.352,23 -> 181.186,16). O Maquinas SOBE porque recebe as "Manutenção Máquinas Pecuária" que estavam em outro centro.
  ⚠ A REGRA NAO TROCA OS LEITORES: quem le a copia continua lendo a copia — agora coerente por gatilho. Ver DRE-LEITOR-CHAVE-01.

- ⚠ DRE-MODAL-SUBCENTRO-01 — QUADRO "POR SUBCENTRO" NO MODAL DE VALOR DO DRE (28/09/2026, mock
  `docs/mocks/dre_modal_subcentro_mock_v2.html`, md5 8abe1d0e; decisoes do Gabriel). Entre os cartoes e a lista, uma linha por
  subcentro com Direto, Rateio (o selo do modal: "Rateio adm." / "Rateio"), Total, R$/cab/mes ou R$/ha (a MESMA conta dos cartoes:
  `porUnidade` foi reescrito sobre `porUnidadeNum`), % do Total do modo ativo e barrinha, mais a linha "Total do grupo"; ordenado pelo
  Total. Segue o segmentado: em "Direto" a coluna de rateio some e o subcentro so' de rateio sai. Clique filtra a lista (selo "x" no
  cabecalho da Descricao, rodape "N lancamentos em ... · de M no grupo"); x ou segundo clique voltam a todos. Coluna Subcentro na lista.
  Cabecalhos centralizados. Saida em vermelho pela regra do sinal (`corDoSinal`: saida > 0 vermelho, estorno inverte) nos cartoes, no
  quadro, na lista e no rodape — `ValorDre.saida` (Lavoura sempre; Pecuaria fora de venda/outras receitas).
  A LEI: o quadro agrupa AS MESMAS linhas da lista (`quadroPorSubcentro`, soma em centavos inteiros), entao quadro = lista = cartoes.
  Medido na FASE 0 e na tela: NJ jul/25-jun/26 Mao de Obra 1.106.988,24 + 467.256,90 = 1.574.245,14 e Administracao 169.391,70 +
  427.993,39; Lavoura NJ 25/26 Operacoes Mecanizadas do Amendoim 426.301,60 + 429.815,41 = 856.117,01 — ao centavo.
  BANCO: `fn_painel_rateio_detalhe` devolve `subcentro` em cada linha, pela chave (migration
  `supabase/migrations/20261027159000_dre_modal_subcentro_01.sql`, ⚠ registrada como `20260928004210`; patch guardado por md5
  6f69f1cc -> 634705c3, ledger = arquivo 873ad7f9). Aditiva: PROVADA em rollback em 246 chamadas (admin da pecuaria de 7 clientes x
  2020-2026 x realizado/meta, e toda safra agricola x cultura x centro nos ramos natureza, investimento, pool e admin), 16.323 linhas,
  0 divergencias tirada a chave nova; ACL, SECURITY DEFINER e search_path iguais.
  ⚠ NA PECUARIA NENHUM SUBCENTRO APARECE NOS DOIS LADOS: o direto e' "... Pecuaria" e o rateio e' "... Administrativo" — linhas
    diferentes do plano. Decisao do Gabriel: uma linha por subcentro, sem juntar por nome-base. Na Lavoura o MESMO subcentro tem
    direto e rateio e fica numa linha so'.
  ⚠ "—" E' AUSENCIA, NAO 0,00: o subcentro sem linha de um tipo mostra "—" naquela coluna (desvio do mock, que so' tinha linhas com
    os dois lados, pela sentinela da casa).
  ⚠ O DEFEITO QUE A SUITE NAO VIU: `useRateioAdmPec` remonta cada linha campo a campo, e sem o `subcentro` no mapa a tela mostrava todo
    o rateio como "(sem subcentro)" — a soma fechava (nao depende do nome) e o recorte sumia. So' a tela mostrou; o teste do hook nasceu
    dele.
  ⚠ O QUADRO MORA NO MESMO SCROLLPORT DA LISTA (um so' por tela): rola junto, e o cabecalho da lista gruda quando chega ao topo.
  ⚠ TEXTO SEM RETICENCIA na lista inteira: Descricao, Subcentro, Favorecido e Fazenda quebram linha (a regra de 27/09 alcancou este
    modal); `ThOrdenavel` ganhou `extra` (o selo), opcional.

- ⚠ DRE-CASCATA-MODAL-01 — O BOTAO "Grafico" DO DRE DA PECUARIA ABRE UM MODAL COM DUAS ABAS (28/09/2026, mock
  `docs/mocks/dre_cascata_modal_leitura_mock_v5.html`, md5 b724e0f5; decisoes do Gabriel e do Chat). O modal tem a largura do
  conteudo (988 = 960 + 2 x 14) e fica POR CIMA da grade — a grade segue montada atras e o estado continua em `f_vista=grafico`.
  (1) "Cascata do ano" = a `PecCascataView` de antes, agora em PIXELS REAIS (viewBox = tamanho desenhado, `LARGURA_CASCATA` 960;
     antes ela esticava 1180 unidades com `preserveAspectRatio="none"`), fontes maiores (tabela 11, eixo 10, valores 10,5), nomes
     quebrados pela largura da faixa em ate' tres linhas (`quebrarRotulo`), legenda sem os quadradinhos. A tabela de movimentos
     virou VISAO DE CAIXA: desfrute +verde, reposicao −vermelha; agio positivo vermelho, desagio verde. O rotulo que desceria sobre
     os nomes sobe para cima da barra (o "−484 k" do investimento cobria "Investimento no periodo", NJ jan–ago/23).
  (2) "Leitura dos anos" = uma coluna por ano do seletor (as colunas de valor do REALIZADO do cliente inteiro, na ordem da grade):
     preco de venda x custo por @ com a margem em curva na mesma escala; rebanho inicial x desfrute com o % dentro da barra; o
     movimento do rebanho (Global em ponte + abas Nascimentos, Compras, Desfrute, Mortes; @ | cab), alinhado as colunas da tabela
     (a mesma regua de 222px); e a tabela de indicadores com cabecalho fixo. Clique num ano (cabecalho ou rotulo do grafico) abre a
     cascata dele.
  AS RAZOES MORAM EM `indicadoresDoAno` (`src/components/agri/pecLeituraAnos.ts`), EXTRAIDAS da cascata sem mudar conta, e a
  cascata passou a le-las: preco medio de venda = vendas / @ desfrutadas em @ VIVA (decisao 2: a definicao que a cascata ja' usava);
  custeio = custo variavel + custo fixo + rateio adm., o `compor` do "(−) Custeio de producao" do Resumido, lido da def (decisao 1);
  custo por @ produzida = custeio / `at_produzida` (so' com producao positiva); margem por @ = preco − custo (nasce aqui).
  A PONTE e' `movimentos` da `fn_dre_pecuaria_patrimonio`, e a "Diferenca" (`ajustes`) aparece cinza, com o numero, sempre que nao e'
  zero (decisao 5). GMD = `computePeriodGmd` sobre o `zoot_mensal_cache` (decisao 4, `useGmdPeriodos`, paginacao paralela com
  `count`). Taxa de natalidade NAO existe (decisao 3). Ano parcial: valores do periodo com "8m", comparaveis sem marca, e o aviso
  "periodo parcial: nao compara com ano cheio" no proprio GMD — "parcial" e' pelos meses da COLUNA: com "Ano 2026" o seletor corta
  em jan–ago e os anos anteriores sao os MESMOS oito meses, entao todos levam a marca.
  BANCO: `fn_dre_pecuaria_patrimonio` devolve `movimentos.desfrute_por_tipo` (abate / venda + venda_pe / consumo, cab e @ viva) —
  migration `supabase/migrations/20261027160000_dre_cascata_modal_01.sql` (⚠ registrada como `20260928091641`; patch guardado por md5
  641d0037 -> ab60f388; ledger = arquivo 160f1f36). PROVADA em rollback: 49 chamadas no Global (7 clientes x 2020-2026) e 22 por
  fazenda, 71 de 71 saidas identicas tirada a chave nova; cabecas por tipo = `vendas_abates` em 71 de 71, arrobas ate' 0,01 @.
  A aba Desfrute le o R$ dos grupos de centros do DRE — Abates (1010, 1020) e Venda Peso Vivo (1110-1155), com R$/@ pela @ do tipo —
  e Venda de tropa, Consumo interno e hedge SO' em R$, da lista `fn_dre_pecuaria_lancamentos` do centro "Venda Geral" (a soma fecha
  com o centro: Vera 2025, 19.000,00). Consumo 1050 e hedge 1055 nao tem nenhum lancamento no banco: as linhas saem 0,00.
  ⚠ DUAS DEFINICOES DE R$/@ DO DESFRUTE SEGUEM NO REPO, e nao foram unificadas: a cascata e a leitura dividem pela @ do DRE
    (`at_desfrutada` convertida para @ viva); a aba Movimentos do modal da variacao (`PecPonteTabela`) divide pela @ da ponte
    (`movimentos.vendas_abates`, que prefere o peso medio tambem no abate). E o custeio da `PecPonteTabela` e' o do PC-100, SEM o
    rateio. Mudar a ponte mexeria no modal homologado da variacao — fora do escopo.
  ⚠ E O EFEITO DE MERCADO DO NJ jan–ago/24 E' 0,00 DE VERDADE: `v_fim_p1 = v_fim_p0` (17.918.598,98 nos dois) — os precos de ago/24
    sao os de dez/23. A tela esta' fiel a RPC.

- ⚠ CACHE-RRCC-2021-01 — FECHADA em 28/09/2026: TRES (fazenda, ano) sem linha nenhuma no `zoot_mensal_cache`, com 12 meses de
  fechamento cada, rematerializados pela rotina oficial `refresh_zoot_cache(fazenda, ano)` — RRCC Ursa Maior 2021, NJ Sta. Luzia
  2020 e NJ Sta. Luzia 2022. Migration de DADO `supabase/migrations/20261027162000_cache_rrcc_2021_01.sql` (⚠ registrada como
  `20260928105343`; ledger = arquivo, md5 cd257cea), com guarda: aborta se qualquer dos tres ja' tiver linha e confere 12 meses
  realizados em cada um depois.
  A CAUSA (estrutural, fica para a ZOOT-CACHE-BURACO-01): os gatilhos `trg_invalidate_zoot_cache*` (lancamentos,
  fechamento_pastos, fechamento_pasto_itens, saldos_iniciais) APAGAM o (fazenda, ano) inteiro e NAO reconstroem; so' o hook
  `useZootCategoriaMensal` reconstroi, e so' quando alguem abre aquele ano numa tela que o usa; o DRE (`fn_dre_pecuaria`,
  `fn_dre_pecuaria_patrimonio`) le' o cache SEM garantir. Qualquer edicao de lancamento antigo abre um buraco, calado.
    RRCC 2021: as duas vendas de 05/06/2021 (174 e 133 garrotes) recriadas pela tela em 26/09, 10:01-11:19.
    Sta. Luzia 2020: o cancelamento de 25/09 16:35 da venda antiga da OC 6a808c4c (200 garrotes, 03/04/2020).
    Sta. Luzia 2022: CAUSA EXATA NAO DETERMINADA — nenhuma gravacao auditada de 2022 depois da reconstrucao de 24/09
      (RECLASS-PESO-BACKFILL-01, que refez o NJ inteiro); o caminho provavel e' um que o audit nao registra (itens de
      fechamento de pasto, sem `updated_at`, ou o saldo inicial propagado de dezembro).
  ⚠ MUDOU NUMERO, E PARA O HOMOLOGADO: sem o cache de 2020, o P0 da Sta. Luzia caia em 'zero' e o rebanho inteiro (1.124 cab)
    virava producao. NJ 2020: VBP 12.800.620,52 -> 10.316.601,75; Lucro operacional 7.853.972,91 -> 5.369.954,15; Lucro liquido
    (linha da grade, chave `resultado_periodo`) 7.640.138,60 -> 5.156.119,84; Resultado economico (`resultado_com_mercado`)
    11.603.959,49 -> 9.341.017,11; e a chave `lucro_liquido` (Resultado economico - Investimento, sem linha na grade)
    11.136.599,70 -> 8.873.657,32, o numero do CATEGORIA-DESCARTE-01; ponte +16.805,21 @ / 1.124 cab -> -3,23 @ / 0 cab.
    RRCC 2021 (Lucro operacional 842.955,62 igual): producao 3.194,03 @, custo por @ 215,26, GMD 0,419, ponte +3.189,29 -> -4,74 @.
    NJ 2022 (4.965.105,14 igual): producao 37.872,00 -> 43.885,85 @, ponte +6.039,69 -> +25,84 @. Vizinhos (NJ 2021/2023, RRCC
    2022): so' `cab_media` e centavos de rateio por fazenda (NJ 2023 Lucro operacional 3.604.289,07 -> 3.604.289,06). Meta igual.
  ⚠ NOMES: ver RPC-NOMES-LUCRO-01 — a chave `lucro_liquido` NAO e' o "Lucro liquido" da grade.
  VARREDURA (fazenda x ano com fechamento, lancamento ou saldo inicial e cache < 12 meses), provada pela propria rotina em
  rollback: so' os tres eram buraco; nos outros 11 a rotina devolveu as MESMAS linhas (ela e' idempotente) — anos de rebanho
  parcial (Sta. Luzia 2023, Bom Retiro 2022/2023) e pastos sem gado (2024-2026).
  ⚠ CACHE-BOM-RETIRO-2023 FECHADO: NAO ERA BURACO. O ano tem 7 meses de cache porque o rebanho existe em 6 (jan-jun/23); o
    refresh devolve as mesmas 51 linhas.

- ⚠ ZOOT-CACHE-BURACO-01 — O CACHE DO REBANHO NAO FICA MAIS VAZIO DEPOIS DE UMA GRAVACAO (28/09/2026, opcao (d) do Gabriel; o
  aviso visual no DRE e' a frente ZOOT-CACHE-AVISO-01). Migration `supabase/migrations/20261027165000_zoot_cache_buraco_01.sql`
  (⚠ registrada como `20260928123601`; ledger = arquivo sem a quebra final, md5 a94160fe).
  O DEFEITO (a causa do CACHE-RRCC-2021-01 e do cache apagado da Sta. Rita 2025): os gatilhos `trg_invalidate_zoot_cache*`
  APAGAVAM o (fazenda, ano) e so' o hook `useZootCategoriaMensal` reconstruia, quando alguem abria o ano. O DRE e ~17 leitores liam
  o cache sem garantir: editar um lancamento antigo abria um buraco calado, e o P0 caia em 'zero'.
  AGORA: os quatro gatilhos (lancamentos, fechamento_pastos, fechamento_pasto_itens, saldos_iniciais) MARCAM os mesmos pares em
  `zoot_cache_sujo` (RLS sem policy, sem grant ao front); o gatilho de constraint `trg_zoot_cache_reconstruir` (DEFERRABLE
  INITIALLY DEFERRED) reconstroi cada par UMA vez no fim da transacao e desmarca; o cache antigo fica ate' o novo entrar.
  `refresh_zoot_cache(fazenda, ano)` ganhou `pg_advisory_xact_lock` por par (so' a de dois argumentos). pg_cron
  `zoot_cache_sujo_reconstruir` (job 4, a cada 5 min, `fn_zoot_cache_reconstruir_sujos`). Sentinela `fn_zoot_cache_buracos(cliente)`
  (INVOKER, so' leitura): ano sem cache e mes com rebanho no fechamento sem cache. Saiu o gatilho `trg_refresh_cache_reclassificacao`
  (a funcao fica, sem chamador).
  md5: trg_fn_invalidate_zoot_cache a99396a9 -> 6cedc89f; _fechamento 12fc80e4 -> bfd007fc; _fechamento_itens 0c9a2252 -> 51f8468f;
  _saldos_iniciais 30447c9b -> a49a4e0d; refresh_zoot_cache 9d2ef633 -> c6a682c7.
  ⚠ FALHA NA RECONSTRUCAO NAO DERRUBA A GRAVACAO: o erro vira WARNING, a marca fica e o cron tenta de novo. Apagar nunca falhava;
    reconstruir pode — por isso o bloco proprio.
  ⚠ O `useZootCategoriaMensal` CONTINUA garantindo o cache como antes: e' redundante agora, e ficou de proposito.
  PROVAS (rollback, antes de aplicar; o detalhe esta' no cabecalho da migration): cache intacto enquanto marcado e igual ao limpo
  depois (lancamento, item de pasto, dezembro -> janeiro); 500 lancamentos = 1 reconstrucao por fazenda-ano (2,0 s); sentinela acha o
  buraco simulado da Sta. Rita 2025 (ano + 12 meses); DRE NJ 2020 e SR 2025 identicos. Depois de aplicar: sentinela 0 nos 7 clientes,
  `zoot_cache_sujo` vazio.
  ⚠ A PROVA DE DUAS SESSOES NAO FOI FEITA: o canal MCP serializa as chamadas e `dblink` nao esta' instalado. Vale a trava no corpo e
    o erro de chave reproduzido sem ela na FASE 0.

- ⚠ OC-VENDA-ENTREGAS-01 — UM CONTRATO DE VENDA, N ENTREGAS (frente aberta em 28/09/2026; FASE 0 feita, PASSO A aplicado, FASE 2
  espera o mock do Chat).
  O CASO (Santa Rita, Helder Hofig, desmama 2025): contrato do ano a R$ 12,80/kg (13,00 em jun), 5 embarques de desmama
  (19/03 178, 20/03 139, 23/04 193, 21/05 183, 25/06 69 = 762 cab) + 2 de garrotes que foram junto (21/05 6 cab 18.031,09;
  25/06 11 cab 25.056,24), todos no historico importado (13/04/2026). Financeiro: 4 recebimentos do Helder (17/04 992.140,99;
  22/05 574.042,04; 21/06 567.956,34; 25/07 231.104,00 = 2.365.243,37), competencia = data do pagamento, sem vinculo bancario
  no sistema. A diferenca "183x189" e "69x80" SAO OS GARROTES; o resto por recebimento: +2,75 / -4,81 / 0,00 / -1.356,58.
  ⚠ O QUE DEU ERRADO, 28/09: o Gabriel criou a OC 73a28eb6 (rascunho: R$/kg vazio -> valor acordado nulo -> `oc_confirmar`
    recusa "Cadastro comercial incompleto (rascunho tecnico)") e depois a 232c05aa, com preco, que pela aba Entrega registrou 5
    saidas NOVAS para embarques que ja existiam — 762 cab em DOBRO. Efeito: desfrute 2025 em 2.661 cab (certo 1.899); em julho o
    fechamento recalibrou o saldo (sistema 3.256 x fechamento 4.018) e declarou os 762 como 15.143 @ de producao; e o gatilho de
    invalidacao APAGOU o cache de 2025 da Faz. Sta. Rita (mesmo defeito da ZOOT-CACHE-BURACO-01). VBP e Lucro operacional nao
    mexeram (receita do financeiro, pontas do fechamento).
  PASSO A — APLICADO (migration de DADO `supabase/migrations/20261027163000_oc_venda_entregas_01_limpeza.sql`, ⚠ registrada como
  `20260928112907`, ledger = arquivo 47c0097c), pelas RPCs oficiais, como o usuario do Gabriel: `oc_estornar_movimentacao` nas 5
  saidas novas (4812f1e9, af48ead8, 3780a107, eea57264, 86da927f), `oc_cancelar` da 73a28eb6 ("duplicada da 232c05aa (teste)") e
  `refresh_zoot_cache(Faz. Sta. Rita, 2025)`. Os 7 historicos intactos. A entrega da 232c05aa ja tinha sido reaberta pelo Gabriel
  (11:21, "garrotes") — a primeira rodada PAROU na guarda por isso, e so' seguiu com o OK.
  PROVAS (dado real): 7 historicos ativos / 779 cab (762 + 17 garrotes), 0 saidas ativas da OC; julho sistema = fechamento 4.018 e
  producao 15.143,28 -> 9.100,77 @ (-6.042,51 = o peso dos 762); desfrute 1.899 cab / 25.279,69 @ / 336,43 R$/@; producao do ano
  22.868,57 @; VBP 7.699.400,16 e Lucro operacional 1.752.337,39 iguais. 232c05aa: programada v6, entrega aberta 0/762, sem
  compromisso. 73a28eb6: cancelada, com o evento `cancelar`.
  DECISOES DO GABRIEL (governam a FASE 2):
    a) competencia do titulo = a data de CADA ENTREGA (hoje e' sempre a `data_operacao` da OC, em `oc_materializar_programacao` e
       no VINCULAR — muda o mes da receita no DRE);
    b) compromisso pelo VALOR TOTAL da operacao, rateado entre os lotes, com parcelas livres (antecipado, parcial, por entrega);
    c) VINCULAR recebimentos ja conciliados a esse compromisso;
    d) diferenca final (entregue x recebido) NAO bloqueia o fechamento e, autorizada, AJUSTA o valor da venda;
    e) ADICIONAR LOTE NUNCA EXIGE ESTORNO.
  PECAS QUE FALTAM: (1) ADOTAR SAIDA EXISTENTE — ligar um lancamento zootecnico ja gravado a um lote, sem criar gado (so'
  `zoo_operacao_movimentacoes`; guardas de fazenda, categoria, contraparte e saldo do lote) — resolve este caso e o
  ZOO-DOBRO-OC-LEGADO; (2) COMPROMISSO DE N LOTES (hoje 1 compromisso tem no maximo 1 `lote_id`, 1 titulo = 1 parte e 1 liquidacao
  ativa por titulo — N:N nao existe); (3) R$/kg DE CONTRATO na OC, herdado pelos lotes e sobrescrevivel; (4) TRAVAS CERTAS e
  mensagem que diga O QUE prende — o Concluir da venda nao trava nem diz nada em rascunho (so' a compra trava), R$/kg vazio nao e'
  avisado no campo, e o "Enviar todos" data a saida com HOJE (`current_date`) e sem peso.
  ⚠ DEFEITO DA TRAVA DE LOTES (achado no PASSO A): `oc_salvar_lotes` decide "recebimento registrado" por
    `EXISTS (SELECT 1 FROM zoo_operacao_movimentacoes WHERE operacao_id = ...)` — conta o VINCULO mesmo com o lancamento
    CANCELADO. O estorno (`oc_estornar_movimentacao`) e' append-only e mantem o vinculo, entao a mensagem "Operacao com recebimento
    registrado: nao e possivel adicionar ou remover lotes. Estorne o recebimento primeiro." MANDA ESTORNAR E O ESTORNO NAO
    DESTRAVA. Hoje a 232c05aa tem 5 vinculos cancelados e continua travada para incluir os 2 lotes de garrotes (ficam para a FASE 2).
    Regra certa: ADICIONAR lote nunca exige estorno; REMOVER so' trava o lote que tem saida ATIVA.
    ⚠ CORRIGIDO no OC-VENDA-ENTREGAS-01a (bloco abaixo).

- ⚠ OC-VENDA-ENTREGAS-01a — UM LOTE ADOTA A SAIDA QUE JA ESTA NO ZOOTECNICO (28/09/2026, mock
  `docs/mocks/oc_venda_entregas_mock_v2.html`, md5 0ce4e642; decisoes do Gabriel). Tres migrations:
  `supabase/migrations/20261027166000_oc_venda_entregas_01a.sql` (⚠ registrada como `20260928131303`; ledger = arquivo 2338d944),
  `supabase/migrations/20261027166100_oc_venda_entregas_01a_dados.sql` (`20260928131426`, 749f1bc1) e
  `supabase/migrations/20261027166200_oc_venda_entregas_01a_fix.sql` (`20260928133059`, 7d5be910).
  O QUE E': `zoo_operacao_movimentacoes.origem` ('registrada' | 'adotada'). Adotar so' cria o vinculo lote -> movimentacao: nao cria,
  nao altera e nao apaga animal, e o VALOR DA SAIDA ADOTADA NUNCA E' REESCRITO (D4d: d6ce7648 fica 574.041,83 contra 574.046,85 do
  lote; a diferenca e' do 01c). Regra unica `_oc_motivo_nao_adotavel` (mesma fazenda, tipo da OC — venda/abate adotam SAIDA, compra
  adota ENTRADA —, mesma categoria, realizada e ativa, comprador vazio ou igual a' contraparte, sem OC, e sem financeiro PROGRAMADO do
  modal antigo, D4b). RPCs: `oc_saidas_adotaveis` (INVOKER, ordenada pela distancia a' data da OC — sem comprador no historico a lista
  traz a categoria inteira), `oc_adotar_movimentacao` e `oc_desvincular_movimentacao` (SECDEF, versao + 1, evento com usuario e data;
  desvincular sem motivo). Genericas por tipo; a tela liga SO' NA VENDA (`adocao`, passada so' pelo `VendaModalShell` — o abate tambem
  usa `isCompra={false}`). Abate e compra: OC-ADOTAR-TODOS-01.
  GUARDAS POR ORIGEM: `oc_estornar_movimentacao` recusa a adotada ("use Desvincular"); `_oc_estorno_mov` a pula (o estorno total nao a
  cancela); `oc_revalorar_lote`, `_oc_sync_abate_lancamento` e a propagacao de categoria do `oc_salvar_lotes` nao a reescrevem;
  `oc_cancelar` a lista como "saida adotada (desvincule na aba Entrega)".
  TRAVA DE LOTES (D1): `oc_salvar_lotes` conta so' saida ATIVA; incluir lote nunca trava; remover e mudar quantidade/peso travam so' o
  lote com saida ativa, e a mensagem diz o lote e a saida (data, cab). Lote removido sem saida ativa leva os vinculos estornados dele, e
  o evento `salvar_lotes` os registra em `vinculos_estornados_removidos` (cada estorno ja' tem o seu `estornar_movimentacao`).
  ⚠ DEFEITO ANTIGO CORRIGIDO JUNTO: no caminho B o `v_grav` da propagacao de categoria era o da ULTIMA volta do laco de checagem — a
    categoria corrigida ia para o lancamento de outro lote.
  LIXEIRA (fix, decisao 3): `oc_excluir_lote` RECUSA lote com saida ativa, como bloqueio (a simulacao devolve a frase): adotada ->
  "Lote <cat> (ordem N) tem saida adotada: <data> · <cab> cab. Desvincule na aba Entrega."; registrada -> "... tem saida ativa: ...
  Estorne a saida primeiro.". Lote sem saida exclui como antes. ⚠ MUDA O DESENHO DO [OC-EXCLUIR-LOTE] (06/09), que desfazia a saida
  registrada: agora ela se desfaz antes, pela aba Entrega. O dialogo mostra a frase do banco (a dica da conciliacao so' quando o
  bloqueio e' dela) e a falha inline, sem toast (`useExcluirLoteOC.erro`).
  ⚠ E O DIALOGO NUNCA ABRIA, e a causa nao era a RPC: `NegociacaoOC` era declarada DENTRO de `AbaNegociacaoLotes`, um tipo de
    componente novo a cada render do pai. A simulacao mudava `simulando` no `LancamentosTab`, o pai re-renderizava, a lista remontava e
    o `excluindoLote` voltava a null — o dialogo entrava e saia em 14 ms (medido com MutationObserver). Saiu para o nivel do modulo
    (move verbatim; os cinco valores do closure viraram props). O modal de lote corria o mesmo risco.
  ⚠ E `_oc_sync_abate_lancamento` ESTAVA COM EXECUTE PARA PUBLIC (SECDEF que reescreve lancamento): nenhum codigo do front a chama e os
    dois chamadores sao SECDEF — REVOKE de PUBLIC, anon e authenticated no fix.
  TELA (venda): aba Entrega por SAIDA — uma linha por saida ativa de cada lote (Lote, Contratado, Data da saida, Cab, Peso, Valor da
  entrega em verde, Origem com selo adotada/registrada/pendente), "Adotar saida ja lancada" com seletor inline e marcacao multipla,
  "Registrar nova saida" (o modal de sempre), e o "Enviar todos" com uma DATA POR LINHA, editavel, sem gravar no lote (D3; antes o
  banco gravava `current_date`). Recusas ao lado do botao. Sem `truncate` nas linhas da aba.
  O CENTAVO: o banco arredonda CADA lote e soma (`_oc_valor_do_lote`); a Negociacao somava os lotes crus e arredondava o total — 232c05aa
  2.366.601,26 no banco x 2.366.601,25 na tela. `totaisDosLotes` (`useCompraLotes`) passou a somar centavos por lote.
  DADOS DA 232c05aa (aplicados pelas RPCs, como o usuario do Gabriel): 2 lotes de garrotes (6 cab a 12,80/kg; 11 cab a 12,00/kg) e as 7
  saidas historicas adotadas -> entrega 779/779, acordado 2.366.601,26, versao 17; lancamentos da fazenda, cache e DRE da Sta. Rita 2025
  identicos (md5).
  ⚠ A ABA ENTREGA DA 232c05aa SEGUE "indisponivel" ate' a negociacao ser concluida (gate anterior) — o Tipo de venda esta' vazio. O
    Gabriel preenche e conclui pela tela, e homologa ali o seletor e o "Enviar todos" (desvincula a 81e41593 e adota de novo).
  ⚠ COMPETENCIA NAO ENTROU (D2): vai para o 01b, com o vinculo dos 4 titulos; regra ja' decidida — a receita segue cada entrega,
    proporcional ao valor de cada saida, cada parte no mes da saida; parcelas definem so' o caixa. `oc_vincular_lancamento` e' a funcao a
    reaproveitar.

- ⚠ OC-VENDA-ENTREGAS-01b — MODELO CONTA CORRENTE DA VENDA: A ENTREGA E' A RECEITA, O RECEBIMENTO E' ADIANTAMENTO (28/09/2026,
  decisoes D1-D7 do Gabriel; ADR-2026-21, que cita o ADR-2026-17; mock `docs/mocks/oc_conta_corrente_mock_v4.html`).
  Migration `supabase/migrations/20261027167000_oc_venda_entregas_01b.sql` (⚠ registrada como `20260928144001`; ledger = arquivo
  byte a byte, md5 2a74092b), patch guardado por md5: `oc_vincular_lancamento` 9634b63b -> 9ce51f1f, `oc_sincronizar_liquidacao_
  de_financeiro` d139826a -> 8175fee1, `_oc_vinculo_mapa` 928535c7 -> 4d830519, `fn_lista_v2_totais` 023c7790 -> e5746a9f
  (DROP + CREATE, ACL igual), `vw_financeiro_lancamentos_v2_doc` + `sem_movimentacao_caixa` (security_invoker conferido).
  Novas: `oc_sincronizar_entregas` (idempotente), `_oc_vincular_recebimento` (interna, sem EXECUTE para authenticated),
  `oc_conta_corrente` e `oc_recebimentos_vinculaveis` (INVOKER, leitura), `_oc_subcentro_venda` (espelho de `subcentroVenda.ts`,
  com teste). Plano: 3015 Adiantamento de Clientes e 5005 Adiantamento a Fornecedores, sem bloco nem DRE. Catalogo:
  principal/entrega e principal/recebimento. `modelo_financeiro` na OC ('titulo' padrao) e `entrega_movimentacao_id` + origem
  'entrega' nas partes.
  REGRAS: entrega = titulo realizado, sem conta, sem caixa, competencia = pagamento = data da saida, conta pela categoria do lote,
  valor do lote (D3, D7); recebimento = a conta vira Adiantamento de Clientes, competencia/valor/conta/hash FICAM; saldo =
  entregue − recebido, CALCULADO; a entrega NAO liquida (ADR-2026-19), o recebimento sim.
  ⚠ PROVA EM ROLLBACK (estrutura + dado, como o Gabriel): DRE SR 2025 mar +992.138,24 (entregas de 19 e 20/03), abr 574.046,85,
    mai 567.955,59, jun 232.460,58 dessa OC; ano +1.357,89 em vendas, VBP e resultado operacional; caixa do cliente md5 igual;
    `oc_conta_corrente` 1.357,89 'ele_deve', 4 'sem_conta_bancaria'; segunda sincronizacao: 7 mantidas.
  DADO APLICADO com o OK do Gabriel: `20261027167100_oc_venda_entregas_01b_dados.sql` (⚠ registrada como `20260928150203`; ledger =
    arquivo, md5 79d4f39b). Real = rollback: DRE SR 2025 mar 1.508.322,44 / abr 842.244,81 / mai 567.955,59 / jun 920.716,72 / jul
    417.955,94; vendas 8.506.161,31; caixa md5 1e61bae9 antes e depois; conta corrente 1.357,89 'ele_deve'; `zoot_cache_sujo` vazio.
    So' a 232c05aa esta' no modelo conta corrente.
  ⚠ A HOME NAO MUDA COM O DADO: receita de venda/abate na Home vem do ZOOTECNICO (`SUBCENTROS_RECEITA_PEC_DO_ZOOTECNICO`), nao do
    financeiro. Depois do dado ela e o `fn_dre_pecuaria` diferem em −4,27 nesta OC (zoot 574.041,83 x lote 574.046,85; 18.031,09 x
    18.030,34), e agora nos MESMOS meses — antes diferiam em 1.353,62 e em meses diferentes. Fonte duplicada: frente
    DRE-HOME-FONTE-UNICA, nao tratada.
  D1 APLICADA com o OK do Gabriel: `useFinanceiro` na COMPETENCIA inclui sem caixa; o CAIXA segue sem ele (os tres fetches do
    regime: Global, por fazenda e o administrativo). Medido antes: so' o barter do NJ muda na Home (2023 saidas
    +390.252,59; 2024 +391.034,66/+1.042.295,41; 2025 +1.947.078,30/+812.810,00; 2026 +152.390,00/+27.393,52, entradas/saidas).
    ⚠ O FECHAMENTO USA O REGIME DE CAIXA (`useFechamentoPeriodoData`), entao a D1 nao o alcanca — incluir sem caixa em caixa seria
    errado. Divergencia do briefing, reportada.
  TELA: aba Financeiro da venda em conta corrente (`AbaContaCorrenteOC`, roteada pelo `modelo` do banco antes do `modo`); Financeiro
  V2 com colunas Tipo e "Vai para" e os totais "Entradas de caixa" | "Receita sem caixa" | "Saídas de caixa" | "Despesa sem caixa"
  (`totaisDaListaV2`); Contas a Pagar e Receber exclui sem caixa sempre (D3).
  ⚠ DIVERGENCIAS DO MOCK, pela decisao: recebimentos "sem conta bancária", nao "Banco do Brasil · conciliado" (D6); entrega com
    pagamento = data da saida, nao "—" (D3).
  PENDENCIAS: "Programar recebimento" sem gravador (botao desligado, com o porque); "Explicar diferenca" e' o 01c; sincronizar
  entregas e' botao explicito (saida adotada/estornada depois nao atualiza sozinha — a aba avisa); `oc_cancelar` nao cancela as
  entregas; o resumo lateral da venda continua lendo compromissos (vazio na conta corrente); `vw_oc_obrigacoes` lista as partes
  novas (so' o modo legado a le).
  ⚠ BAIXADAS NO 01c: "Programar recebimento", "Explicar diferenca", o `oc_cancelar` com entregas e o resumo lateral.

- ⚠ OC-VENDA-ENTREGAS-01c — EXPLICAR A DIFERENCA, CANCELAR COM ENTREGAS, RESUMO E PROGRAMAR RECEBIMENTO (28/09/2026, mock
  `docs/mocks/oc_conta_corrente_mock_v7.html`, md5 dd5e9cbd, que SUBSTITUI o v4 na aba; decisoes do Gabriel). Migration
  `supabase/migrations/20261027168000_oc_venda_entregas_01c.sql` (⚠ registrada como `20260928153826`; ledger = arquivo byte a
  byte, md5 e4b9ad34). Estrutura so' — NENHUM DADO GRAVADO; a 232c05aa segue sem explicacao.
  O EXTRATO E' LIDO PELO CAIXA DA FAZENDA: recebimento POSITIVO, entrega NEGATIVA, explicacao positiva quando reduz o que falta
  receber; saldo = recebido - entregue + explicacoes, corrido linha a linha — NEGATIVO falta receber (vermelho), POSITIVO
  adiantado (verde), ZERO quitado. `situacao` passou a 'falta_receber' | 'adiantado' | 'quitado' (sai o 'ele_deve' do 01b, e o
  sinal inverteu). So' na conta corrente: no DRE a entrega segue receita positiva.
  EXPLICACOES (partes com origem 'explicacao', uma linha ambar no extrato, motivo obrigatorio, competencia = ultima entrega):
    ajuste de preco -> muda o valor do LOTE pelo criterio 'total' (R$ exato; o R$/kg so' derivado, com 2 casas), e a entrega;
    desconto comercial -> 5020, sem caixa; permuta/outra despesa -> conta de SAIDA pecuaria escolhida, sem caixa;
    outra receita -> conta de ENTRADA pecuaria escolhida, sem caixa; devolver ao comprador -> 5006 (NOVA, sem DRE), pagamento
    programado que so' entra no saldo quando pago.
  `oc_explicar_saldo` (com `p_simular`) e `oc_desfazer_explicacao`; `explicado` e' INTENCAO (conta a devolucao programada),
  `saldo_a_explicar` e' o saldo antes das explicacoes efetivas, `falta_explicar` o que sobra. A liquidacao automatica PULA a
  explicacao sem caixa.
  CANCELAR (decisao 2): `oc_cancelar` ganhou o ramo conta corrente — cancela entregas e explicacoes, devolve cada recebimento a'
  conta ORIGINAL (a do evento `vincular_recebimento`; valor, hash, conta bancaria e conciliacao intactos), desvincula as saidas
  adotadas (o gado fica no zootecnico). `oc_cancelar_rol` lista tudo antes; o dialogo (`CancelarContaCorrenteDialog`) mostra o
  rol, pede motivo e poe a recusa ao lado do botao. A venda NAO TINHA botao de cancelar: ele nasce SO' na conta corrente.
  PROGRAMAR RECEBIMENTO: `oc_programar_recebimento` (compromisso sem lote em 3015, programado e materializado); fica fora do saldo.
  RESUMO LATERAL: Entregue / Recebido / Saldo com o sinal do extrato, da MESMA instancia de `useOcContaCorrente` — ela subiu
  para o `VendaModalShell` e desce por `ccApiExterno`.
  VIEW: `vw_oc_operacao_liquidacao` ganhou o ramo conta corrente (`_oc_conta_corrente_base`, `base_origem = 'conta_corrente'`);
  as outras 110 OCs identicas por md5 antes e depois.
  ⚠ DEFEITO DORMENTE CORRIGIDO: `oc_revalorar_lote` gravava `valor_acordado` por uma soma diferente da de `oc_salvar_lotes`;
    agora os dois somam `_oc_valor_do_lote(...)->>'total'`. Zero OCs afetadas hoje.
  PROVAS EM ROLLBACK, como o usuario do Gabriel, na 232c05aa: ajuste de 1.000 no lote 5 + permuta de 357,89 zeram (quitado,
  explicado 1.357,89); DRE jun vendas -1.000 e custo variavel +357,89, resultado operacional do ano igual; caixa md5 igual;
  desfazer as duas volta tudo. Cancelar: 4 recebimentos de volta a 1120 com o hash, 0 entregas e 0 liquidacoes vivas, 7 saidas
  vivas no zootecnico, DRE EXATAMENTE o de antes do 01b. Programar: 1.357,89 programado fora do saldo.
  ⚠ DESVIOS DO MOCK, POR MEDICAO NA TELA: o modal da venda tem 1024px (decisao do MODAIS-PADRAO-01b) e o mock foi desenhado
    em 1100; a tabela tem 766px. Com os textos reais da 232c05aa a linha pedia 842px. Saiu (a) o "R$" dos valores da TABELA
    (como no proprio mock; os cards mantem) e (b) o NUMERO do plano na coluna Conta, que vai no `title` — com ele,
    "1120 Venda de Desmama Machos" pedia 171px. Larguras medidas celula a celula (Range sobre o conteudo): menor folga 0px,
    nenhuma negativa, toda linha com 18px, sem reticencia e sem quebra.
  ⚠ LISTADAS, nao tocadas: 6cf548a1 e 229ac98d tem `valor_acordado` com fracao de centavo.

- ⚠ OC-VENDA-ENTREGAS-01d — CORRECOES DA HOMOLOGACAO DO 01c (28/09/2026).
  (A1) A descricao da entrega usa o NOME da categoria ("Entrega 193 cab Desmama M"), nao o codigo: `_oc_rotulo_categoria` (espelho
  de `CATEGORIAS`, com teste) e `oc_sincronizar_entregas` 20f2e321 -> ddfff259 (migration `20261027169000_oc_venda_entregas_01d.sql`,
  ⚠ registrada como `20260928170051`; ledger = arquivo 646d7738). O ramo de atualizacao nao reescreve descricao: as 7 da 232c05aa
  sao a migration de dado `20261027169100_oc_venda_entregas_01d_dados.sql` (7 partes e 6 titulos; o titulo f3ef425a, editado a
  mao para "Entrega 193 DM", NAO e' tocado). Provado em rollback: 0 de 18.755 lancamentos da Santa Rita mudam valor, datas, hash,
  conta, plano ou status; versao igual; 6 linhas de auditoria; e uma entrega recriada pelo sincronizar nasce com o nome.
  (A2) "Valor acordado" do resumo lateral ficava 2.366.601,26 depois do ajuste de preco do lote 7. O BANCO ESTAVA CERTO
  (`valor_acordado` 2.365.243,37 = soma dos `_oc_valor_do_lote`): o resumo soma `lotesApi.totais`, estado da tela, e o hook da conta
  corrente nao mandava reler os lotes depois de revalorar. Agora `useOcContaCorrente` recebe `aoMudarLotes` (o shell passa
  `lotesApi.recarregar`) e o chama depois de explicar e de desfazer, inclusive na recusa no meio da cadeia. Nenhum dado a corrigir.
  (A3) Conferido, nada solto: nenhum recebimento do Helder de 2025 fora da OC, nenhum financeiro do modal antigo apontando para as 7
  saidas; os 5 zootecnicos cancelados ligados a OC sao os estornos do PASSO A; as vendas de jul/2025 (ed69c178, b5adc760, 8f0696c7,
  88a90a7d, 87b78082) sao outras vendas. Os 4 recebimentos e as 7 saidas SAO a OC — nada de legado a apagar.

- ⚠ FIN-V2-SEM-CAIXA-01 — O FINANCEIRO V2 MOSTRA SO' DINHEIRO POR PADRAO (28/09/2026, mock `docs/mocks/fin_v2_sem_caixa_mock_v1.html`,
  md5 216aa52f; decisoes do Gabriel; adendo no ADR-2026-21). Com a conta corrente, a venda da 232c05aa aparecia em 11 linhas (7
  entregas + 4 recebimentos) com "Entradas de caixa" e "Receita sem caixa" iguais, e ninguem entendia.
  LISTA (normal e ampliada): so' o que movimenta caixa (`sem_movimentacao_caixa` falso ou nulo). Saiu a coluna Tipo, entrou OC (codigo
  curto clicavel que abre a OC na aba Financeiro, `CelulaOC`). Macro, Centro, Safra e Doc. FICARAM (o mock vale para a chave, a secao
  e o topo, nao para remover colunas). TOPO: Entradas, Saidas, Transf. e contagem; "Receita/Despesa sem caixa" sairam; "Sem caixa (so'
  DRE)" so' com a chave. CHAVE "Mostrar lancamentos sem caixa (entregas, barter, consumo)", desligada: ligada, a SECAO SEPARADA
  `SecaoSemCaixa` (Comp. | Descricao | Cab | Conta | OC | Valor, total sem caixa, sem checkbox, sem paginacao, sem rolagem propria).
  ⚠ SEM BANCO NA LISTA: o plano ganhou o slot `caixa` ('com' | 'sem'); no paginado a contagem e' o total da RPC MENOS a contagem sem
    caixa do mesmo plano; no caminho em memoria (o que roda no proto — `VITE_LISTA_PAGINADA_V2` nao esta' em env nenhum) o filtro e' na
    tela. A exportacao segue a tela (so' caixa; com a chave, os dois). A selecao em lote so' ve' caixa.
  ⚠ A SECAO APERTA A LISTA quando ligada: no Ampliado a 1440 a lista cai para ~6 linhas visiveis. Custo aceito da chave; desligada, nada muda.
  NOME DE EXIBICAO (item 6, so' rotulo, `rotuloDaConta`): "Adiantamento de Clientes" -> "Recebimento de vendas", "Adiantamento a
  Fornecedores" -> "Pagamento de compras" — na secao, na aba Financeiro da OC e no dialogo de cancelar. O plano NAO muda: seis funcoes
  do banco acham a conta pelo nome.
  DESCRICAO DA ENTREGA (adendo, item 8): "Venda <cab:3> <sigla>" ("Venda 183 DM", "Venda 006 G"), o formato dos titulos das OCs.
  `_oc_sigla_categoria` (espelho de `siglaCategoria`, com teste) e `oc_sincronizar_entregas` ddfff259 -> de36ab1e (migration
  `supabase/migrations/20261027170000_fin_v2_sem_caixa_01.sql`, ⚠ registrada como `20260928172954`; ledger = arquivo 2855c8d7). Dado da
  232c05aa: `20261027170100_fin_v2_sem_caixa_01_dados.sql`, 7 titulos e 7 partes INCLUSIVE a f3ef425a (autorizado), provado em
  rollback — 0 de 18.755 lancamentos mudam valor, datas, hash, conta, plano ou status; versao igual. APLICADO com o OK do Gabriel
  (⚠ registrado como `20260928174323`; ledger = arquivo a571ee25).

- ⚠ OC-CRIAR-DO-LEGADO-01 — UMA VENDA LEGADA VIRA OC PRONTA, DA LINHA DO FINANCEIRO (28/09/2026, mock
  `docs/mocks/oc_criar_do_legado_mock_v1.html`, md5 70d4c89a; decisoes D1-D7 do Gabriel). So' venda; abate e compra depois, com a mesma tela.
  PRINCIPIO: preenche sozinho o derivavel, pergunta so' o que nao tem de onde tirar, bloqueia so' o erro primario. A OC nasce no modelo
  conta corrente, FECHADA e com a entrega encerrada; tudo continua editavel nela depois (explicar diferenca, 01c).
  BANCO: migration `supabase/migrations/20261027171000_oc_criar_do_legado_01.sql` (⚠ registrada como `20260928175010`; ledger = arquivo,
  md5 05cce6f2). NENHUMA FUNCAO EXISTENTE MUDA — a cadeia so' liga o que ja existe:
    `_oc_legado_motivo_recebimento` (NULL = pode entrar: entrada, com caixa, fora do modal antigo, conta 1110-1140, viva, sem parte viva
      de OC; boitel 1150 fora, D3); `oc_criar_do_legado_sugestoes` (INVOKER: recebimentos, parcelas irmas do mesmo cliente/fazenda/
      favorecido e saidas candidatas de 60 dias antes a 120 depois do primeiro pagamento, D4); `oc_criar_do_legado` (SECDEF, EXECUTE so'
      authenticated e service_role), UMA transacao na ordem que as guardas impoem: oc_salvar_rascunho -> oc_salvar_lotes (um lote por
      saida, criterio 'total', peso da saida, D1) -> oc_adotar_movimentacao -> modelo conta_corrente + evento definir_modelo_financeiro
      (D2) -> oc_sincronizar_entregas ("Venda NNN SIGLA") -> oc_vincular_lancamento (recebimento, hash preservado) -> oc_confirmar ->
      oc_encerrar_entrega (D5) -> evento criar_do_legado. Rateio em CENTAVOS pelo valor de cada saida, resto no ultimo lote.
  ⚠ ERROS PRIMARIOS TODOS DE UMA VEZ, e nenhum grava. A SIMULACAO (`p_simular`) percorre a cadeia inteira e a desfaz (SQLSTATE 'OCSIM'):
    a previa da tela E' a RPC — nenhuma conta no front. Recusa de uma funcao chamada vira pendencia.
  TELA: "Criar OC a partir deste lancamento" no menu "…" da linha do Financeiro V2 (`podeCriarOCDoLegado`, espelho da regra 1), dialogo
  `CriarOCDoLegadoDialog` em cinco blocos (A31): recebimentos + "Somar outro recebimento" (irmas "n/m" primeiro, D6); dados da OC
  (comprador pelo favorecido, trocavel; fazenda do recebimento; data = primeira saida marcada); valor (recebimentos padrao / saidas /
  outro); saidas com a combinacao UNICA que fecha as cabecas da descricao pre-marcada (ambigua ou nenhuma: nada marcado); previa em
  conta corrente com "Recebimento de vendas". Pendencias em vermelho ao lado do botao, sem toast. Criada: abre a OC e avisa a lista.
  ⚠ PROVA EM ROLLBACK como o Gabriel (Santa Rita, "Venda 315 Desmama M", 692f1957 + 4df4ea15, saidas 8bd25a97 de 200 cab + 9542dccc de
    115): OC fechada, conta corrente, entrega encerrada, acordado 1.182.600,75 (707.751,47 + 474.849,28, R$ 15,00/kg), saldo 0 quitado no
    padrao e -14,25 falta receber pelo criterio das saidas; entregas "Venda 200 DM"/"Venda 115 DM" em 26-27/03; recebimentos em
    "Adiantamento de Clientes" com competencia e valor iguais; md5 do caixa, do rebanho e do cache IDENTICOS; DRE SR 2026: marco vendas
    194.862,28 -> 1.377.463,03, abril 2.435.721,13 -> 1.253.120,38, ano igual (8.620.222,90); as cinco pendencias juntas; simulacoes nao
    deixaram OC. NA TELA a mesma previa, ao centavo — nada criado (0 OCs novas).
  ⚠ NENHUMA OC FOI CRIADA DE VERDADE: a 692f1957 fica para o Gabriel criar pela tela.
  (Criada pelo Gabriel depois do commit: e1ea7f4b, 26/03/26, 315 cab, R$ 1.182.601.)

- ⚠ OC-CONTA-CORRENTE-TODOS-01a — A COMPRA NO MODELO CONTA CORRENTE (PR 1 de 5, 29/09/2026; mock
  `docs/mocks/oc_conta_corrente_compra_abate_mock_v1.html`, md5 334a4e0d, parte COMPRA; decisoes do Gabriel). ADR-2026-21 estendida a compra.
  REGRA: ENTRADA do gado = titulo de custo SEM CAIXA em 15010/15020 (pelo sexo), 2-Saidas, competencia = pagamento = data da entrada,
  valor do lote, "Compra NNN SIGLA"; PAGAMENTO = o titulo de caixa passa a 5005 "Adiantamento a Fornecedores" (na tela "Pagamento de
  compras"), valor/datas/conta bancaria/hash preservados; extrato ESPELHO do da venda (entrada positiva, pagamento negativo, saldo positivo
  'falta_pagar', negativo 'adiantado'); frete, comissao e ICMS ficam titulos comuns, fora do saldo, em `despesas`.
  BANCO: migration `supabase/migrations/20261027172000_oc_conta_corrente_todos_01a.sql` (⚠ registrada como `20260929091118`; ledger =
  arquivo, md5 151d1428). Pecas novas: `_oc_subcentro_compra` (espelho de `subcentroCompraPorCategoria`, com teste) e as regras por tipo
  `_oc_cc_direcao`, `_oc_cc_conta_dinheiro`, `_oc_cc_conta_entrega`, `_oc_cc_verbo`. Patches guardados por md5 (origem -> destino):
  oc_sincronizar_entregas de36ab1e -> c0fe12bb; _oc_vincular_recebimento ffb87b7f -> bd6ae293; oc_vincular_lancamento 9ce51f1f -> 773e6379;
  _oc_vinculo_mapa 4d830519 -> fd9e1305 (linha 5005 da compra, espelho do 3015); oc_recebimentos_vinculaveis 4d39d01d -> d12a6c0f;
  oc_conta_corrente 680b0d64 -> 6828bbf9; oc_explicar_saldo e325f49c -> f4a12b7e; oc_programar_recebimento 42eba32a -> 84ba61e6;
  _oc_cancelar_conta_corrente d6b58623 -> 9dca4b6f. SEM MUDANCA (ja' serviam): _oc_conta_corrente_base, oc_desfazer_explicacao, oc_cancelar (este mudou depois, na 172200 — abaixo).
  ⚠ `oc_vincular_lancamento` E `_oc_vinculo_mapa` NAO ESTAVAM NA LISTA DO BRIEFING e entraram porque o vincular do pagamento passa por eles
    (o primeiro so' roteava a venda ao ramo conta corrente). Nenhuma funcao paralela.
  ⚠ `oc_conta_corrente` CALCULA NO SINAL DA VENDA E VIRA NA SAIDA (x -1) SO' NA COMPRA; a chave `despesas` so' existe fora da venda. E' o
    que deixa a venda byte a byte igual — PROVADO em rollback: `oc_conta_corrente`, vinculaveis e rol da 232c05aa e de uma OC criada do
    legado (Venda 315) na mesma transacao, DRE SR 2025/2026 e Agnaldo 2026, caixa SR e Agnaldo e rebanho do Agnaldo: 12 de 12 md5 iguais.
  ⚠ COMPONENTES REAPROVEITADOS, sem catalogo novo: o pagamento e' `principal/recebimento` e a devolucao do fornecedor e'
    `obrigacao/devolucao_comprador`; a tela rotula pelo lado. O evento segue `vincular_recebimento` (o cancelar o le para devolver a conta).
  ⚠ DEVOLUCAO DO FORNECEDOR EM CONTA PROPRIA (decisao do Gabriel sobre o relatorio): 3016 "Devolução de Adiantamento a Fornecedores",
    ENTRADA, sem bloco nem DRE, espelho da 5006, no vao ao lado da 3015; na tela "Devolução do fornecedor" (`rotuloDaConta`). A primeira
    versao gravava na 5005 forcando 1-Entradas numa conta de saida — a excecao saiu, e o tipo volta a ser SEMPRE o da conta.
  ⚠ CANCELAR: UMA REGRA PARA TODOS OS TIPOS (decisao do Gabriel). So' se cancela o que e' da conta corrente — entregas/entradas,
    recebimentos/pagamentos, explicacoes e compromissos 'recebimento'. DESPESA PAGA A TERCEIRO (frete, comissao, ICMS, Fundersul, Iagro)
    NUNCA se cancela: compromisso, titulo e liquidacao ficam, e o dialogo as lista em "Ficam (pagas a terceiros)" (rol ganha `despesas`).
    Vale para a venda (as duas vendas em conta corrente tem zero compromissos: nada muda nelas).
    ⚠ `oc_cancelar` (A EXTERNA) TAMBEM MUDOU, fora da letra da decisao: depois do ramo conta corrente ela recusava QUALQUER titulo ou
      liquidacao viva, e com as despesas ficando a compra nunca cancelaria. No modelo conta corrente as duas travas deixam de contar as
      despesas; modelo titulo identico. Migration `supabase/migrations/20261027172200_oc_conta_corrente_todos_01a_devolucao_cancelar.sql`
      (⚠ registrada como `20260929094538`; ledger = arquivo, md5 c3057fa2): oc_explicar_saldo f4a12b7e -> baae7c24,
      _oc_cancelar_conta_corrente 9dca4b6f -> 330f7e27, oc_cancelar fec8f7bc -> 530383d4.
    ⚠ PROVADO EM ROLLBACK: rol das duas vendas identico ao de antes mais `despesas: []`; devolucao de 100 na 1337bb2d nasce na 3016,
      1-Entradas, sinal 1, programada; cancelar a 1337bb2d passa (entrada cancelada, pagamento de volta a 15020 com o valor, 4
      despesas com compromisso/parte/titulo/liquidacao IDENTICOS, caixa e rebanho iguais); a 232c05aa cancela como antes.
    ⚠ A 1337bb2d DE VERDADE NAO CANCELA, e isso e' certo: a entrada do gado e' REGISTRADA pela OC (nao adotada) e esta' em mes fechado
      no P1 — estornar e' recusado pelo `guard_lancamento_mes_fechado_p1`. Na prova a entrada foi marcada como adotada (o caso das
      compras legadas do PR 3).
    ⚠ DOIS DEFEITOS DE TELA VISTOS NAS PRINTS, e corrigidos: (1) o bloco "Entradas/Saidas adotadas desvinculadas" listava TODA saida
      do rol, inclusive a REGISTRADA (que e' o bloqueio); agora so' as adotadas. (2) o quadro de despesas tinha a Conta em 170px e o
      `whitespace-nowrap` do TD vence o `whitespace-normal` (ordem do CSS do Tailwind) — "Investimento Frete/Comissão Compra Bovinos"
      invadia o Valor; a Conta passou a ficar com o espaco livre. O rol listava o favorecido do COMPROMISSO, e as
      comissoes da 1337bb2d tem favorecido so' no titulo (Paulo Sergio Baruta) — no dialogo saiam sem nome. (FEITO no
      FIN-V2-HOMOLOG-FIX-01: sem favorecido no compromisso, o do titulo vivo mais antigo.)
  TELA: `AbaContaCorrenteOC`, `CancelarContaCorrenteDialog` e `EntregasVendaTabela` ganharam `lado` (padrao venda, sem mudanca);
  `AbaFinanceiroOC` liga a conta corrente na compra; `CompraModalShell` monta UMA instancia de `useOcContaCorrente` (aba, resumo lateral
  "Entrada / Pago / Saldo" e "Cancelar operação" com o rol) e liga a adocao na aba Recebimento ("Adotar entrada já lançada").
  DADO DA 1337bb2d (migration `20261027172100_oc_conta_corrente_todos_01a_dados.sql`, APLICADA com o OK do Gabriel, ⚠ registrada como
  `20260929093603`; ledger = arquivo, md5 fa2c26f2; real = rollback: caixa 79f7352f, DRE Agnaldo 2026 7cc492ad, rebanho 92d0e4d9):
  desvincular o principal, modelo conta corrente, entrada "Compra 121 DM" 307.460 em 15020 (25/03), pagamento f110eb68 em 5005 com hash
  preservado; extrato entrada 307.460,00 / pago -307.460,00 / saldo 0 quitado; 4 despesas (-8.536,00); DRE Agnaldo 2026, caixa e rebanho
  com md5 identico. As outras compras seguem no modelo titulo (migracao e' o PR 3).

- ⚠ OC-CC-CLASSIFICACAO-01 — O RECEBIMENTO/PAGAMENTO DA OC CONTA CORRENTE FICA NO SUBCENTRO DA OPERACAO, FORA DO DRE PELA PARTE
  (29/09/2026, decisoes do Gabriel; ADR-2026-21, adendo — SUBSTITUI "recebimento vira Adiantamento de Clientes"). PRINCIPIO: a OC e'
  UMA venda/compra; no Financeiro todo recebimento ou pagamento dela fica no subcentro da operacao e referenciado a OC; o detalhe
  (lote, entrega, diferenca) fica na OC. O defeito: filtrar o Financeiro por "Venda de Desmama Machos" escondia o dinheiro das OCs.
  ESTRUTURA: migration `supabase/migrations/20261027173000_oc_cc_classificacao_01.sql` (⚠ registrada como `20260929103705`; ledger =
  arquivo, md5 beabab91). UMA REGRA, NUM LUGAR: `materializar_dre_lcdpr_from_plano` (1689de61 -> 85a3e101) poe `compoe_dre = false`
  quando `_oc_cc_fora_do_dre(lancamento)` — parte VIVA de OC `conta_corrente`, componente 'recebimento' fora de explicacao/entrega, ou
  'devolucao_comprador' de explicacao (decisao 4: "pela mesma regra"). Vence o valor enviado; sem a parte, a regra normal. Quem
  recalcula e' `trg_oc_parte_recalcula_dre` em `zoo_operacao_partes` (insert/cancelada/lancamento/componente/origem), com
  `app.oc_recalcular_dre`. Os QUATRO LEITORES que liam pela conta ganharam `and l.compoe_dre`: `fn_dre_pecuaria` (5 leituras;
  41f7f098 -> 6ec910d8), `fn_dre_pecuaria_lancamentos` (aa6d090f -> 1bf56818), `fn_dre_lavoura` (eece80eb -> c177e6eb),
  `fn_dre_agricola_por_safra` (604e6948 -> 02f7c4c4). Vincular nao troca a conta (`_oc_vincular_recebimento` bd6ae293 -> bddec0fd;
  `oc_vincular_lancamento` 773e6379 -> 970a219a; `_oc_vinculo_mapa` fd9e1305 -> 928535c7, o md5 de ANTES do 01b). Programado e
  devolucao na conta da categoria do lote de MAIOR valor (`_oc_cc_conta_principal`; `oc_programar_recebimento` 84ba61e6 -> b7ed17a5,
  descricao "Venda NNN cab · Pagamento X de Y", X = posicao e Y = total NESSE MOMENTO; `oc_explicar_saldo` baae7c24 -> bd440c85, a
  devolucao no sentido contrario ao dinheiro da operacao). Conta bancaria pela direcao em `oc_conta_corrente` (6828bbf9 -> 19993440 —
  o "sem conta" do extrato) e `oc_recebimentos_vinculaveis` (d12a6c0f -> 69cddd2c); invariancia nas duas colunas em
  `_oc_cancelar_conta_corrente` (330f7e27 -> a15e583a; a acao 'fica_em_adiantamento_manual' virou 'fica_manual'). 3016 REMOVIDA;
  `_oc_cc_conta_dinheiro` saiu.
  ⚠ A LEITURA DA CONTA ERA O DEFEITO, NAO O DADO: o gatilho `fn_normalizar_conta_por_direcao` ja' guarda a conta da entrada em
    `conta_destino_id` e ZERA `conta_bancaria_id`; o extrato lia so' a segunda. `oc_sincronizar_entregas`, `oc_explicar_saldo` e
    `oc_programar_recebimento` so' ESCREVEM a coluna (a normalizacao a poe no lugar); `oc_criar_do_legado_sugestoes` e
    `_oc_legado_motivo_recebimento` NAO leem conta bancaria — a FASE 0 os listou por engano (contou leitura de lancamento).
  ⚠ PROVAS EM ROLLBACK: gate nos quatro leitores, 294 saidas identicas antes x depois — pecuaria 7 clientes x 2020-2026 realizado (49)
    e meta (49), 42 safras na lavoura e 42 na agricola, e a lista do modal 112 chamadas com 39.589 linhas (a primeira contagem de
    linhas deu 0 por chave errada do JSON; conferida de novo antes de afirmar). Comportamento, como o Gabriel: os 7 na conta da
    operacao com dre=false; banco em 7/7 recebimentos e status realizado/conciliado; programado em "Venda de Desmama Machos",
    "Venda 779 cab · Pagamento 5 de 5", dre=false; devolucao da venda 2-Saidas na 1120 e da compra 1-Entradas na 15020, dre=false e
    DRE SR 2025 igual; vincular deixou a conta e pos dre=false; cancelar a 232c05aa devolveu os 4 ao DRE (dre=true) e cancelou o
    programado nascido na OC. ⚠ O DRE SR 2025 NAO MUDA COM O CANCELAR, e e' certo: depois do ajuste de preco do lote 7 (01d) as entregas
    somam 2.365.243,37 = recebimentos — sai uma receita e volta outra de mesmo valor.
  ⚠ A PRIMEIRA PROVA INTEIRA ESTOUROU O TEMPO DO CANAL e ficou rodando no servidor com os locks (a licao do DRE-MODAL-VALOR-01a):
    `pg_stat_activity` mostrou a presa, `pg_cancel_backend` a derrubou, nada ficou gravado; a prova foi refeita em quatro fatias.
  ⚠ `oc_desvincular_lancamento` NAO DESVINCULA RECEBIMENTO DE CONTA CORRENTE ("sem parcela de programacao") — anterior a este PR, fora
    do escopo; a "parte que morre" ficou provada pelo cancelar.
  ⚠ FRONT SEM O MODELO DA OC: o tipo gerado nao conhece `modelo_financeiro`, e zero-cast impede contornar. `parteForaDoDre` (espelho no
    `useLancamentosComOC`, para o tooltip "fora do DRE · OC <codigo>") olha so' componente e origem — equivalente por construcao,
    porque essas partes so' nascem em OC conta corrente.
  TELA: `rotuloDaConta` com o mapa VAZIO (os tres apelidos sairam); textos do buscar/programar/explicar e do cancelar ("Recebimentos que
  saem da OC (voltam a compor o DRE como venda)", seta so' quando a conta a repor e' outra, rodape explicando a volta ao DRE); comentario
  da previa do criar-do-legado. docs/PLANO-DE-CONTAS.md sem a 3016.
  DADO (`20261027173100_oc_cc_classificacao_01_dados.sql`, APLICADO com o OK do Gabriel, ⚠ registrado como `20260929105100`; ledger =
  arquivo, md5 3196752d; real = rollback: DRE ef205b72, caixa b794e484, rebanho d9cef5a6, conta corrente d5c49852, versoes 28/42/11): os 7 (232c05aa 4 e e1ea7f4b 2 ->
  1120; 1337bb2d 1 -> 15020) voltam a conta do evento `vincular_recebimento`, hash regravado, `editado_manual` do retrato de antes (o
  vincular o pos em true nos 4 importados da 232c05aa), copias da conta nas 7 partes, um evento por OC; 3015, 5005 e 5006 DESATIVADAS.
  Provado em rollback exatamente como o arquivo: DRE SR 2025/2026 e Agnaldo 2026, caixa SR+Agnaldo, rebanho SR+Agnaldo e saldo das 3
  conta correntes com md5 identico.

- ⚠ FIN-V2-HOMOLOG-FIX-01 — CORRECOES DA HOMOLOGACAO DO FINANCEIRO V2 (29/09/2026).
  (1) "CRIAR OC A PARTIR DESTE LANCAMENTO" NAO APARECIA, E NAO ERA DEPLOY NEM REGRA. Medido: o proto publica cada commit na Vercel
  (741cd800 com status success); `podeCriarOCDoLegado` sobre os recebimentos de venda dos clientes aprova 153 — e o que reprova e' de
  desenho (abate 589 e boitel 110, fora do "so' venda 1110-1140"; 79 ja' com OC; 28 do modal antigo). A regra continua valendo depois
  do OC-CC-CLASSIFICACAO-01: o recebimento em conta corrente tem parte viva, e parte viva ja' tira a acao. O DEFEITO ERA DE LAYOUT: com
  a coluna OC a tabela pedia 991px num container de 908 (viewport 1134), rolava na horizontal, e Status e "..." ficavam FORA DA VISTA
  — o menu existia e ninguem o via.
  (2) O botao tambem no RODAPE do `LancamentoV2Dialog`, logo depois do "Vincular à operação": mesma `podeCriarOCDoLegado`, mesmo
  `CriarOCDoLegadoDialog`, e SO' depois que a parte da OC foi lida (`parteOCLida`) — antes disso um titulo de OC pareceria legado.
  Criada a OC: avisa a lista, fecha o editor e abre a OC.
  (3) A COLUNA OC SAIU DA LISTA (normal e ampliada): quem abre a OC e' o icone ao lado do produto (aba Financeiro) e o novo item
  "Abrir OC" do menu "...", so' na linha com OC. O "..." ficou FIXO A' DIREITA (`sticky right-0`, fundo opaco) — mesmo numa janela
  estreita ele nao sai da vista. Medido a 1440 (iframe de 1440x900): tabela 1190 em 1210, ampliada 1398 em 1418, NENHUM elemento
  rolando na horizontal. A SECAO SEM CAIXA MANTEVE a coluna OC: ela e' `table-fixed` com a Descricao elastica e cabe sem rolagem.
  (4) O favorecido das despesas que ficam no cancelar da conta corrente: o do compromisso; sem ele, o do titulo vivo mais antigo.
  Migration `supabase/migrations/20261027174000_fin_v2_homolog_fix_01.sql` (⚠ registrada como `20260929105928`; ledger = arquivo,
  md5 4081a96b), patch guardado por md5: `_oc_cancelar_conta_corrente` a15e583a -> 5f585988. So' leitura para o rol, ACL igual
  (authenticated sem EXECUTE). 1337bb2d: comissoes -> Paulo Sergio Baruta (x2), ICMS -> Sefaz MS, frete segue Manoel Marcelo.
  ⚠ PROVA NA TELA (SR, nada criado): diálogo aberto pelo rodape do Editar de "Venda 011 novilhas" (12/08/25, 16.614,00) com a
    previa simulada e saldo 0,00; menu da "Venda 317 machos" com "Abrir OC" e sem "Criar OC".
  ⚠ OBSERVADO NA PREVIA, nao e' defeito: o recebimento fica na conta que o LEGADO lhe deu ("Venda de Desmama Machos") e a entrega
    na da categoria do lote ("Venda de Femeas Adultas" para novilhas) — o recebimento nunca troca de conta desde o OC-CC-CLASSIFICACAO-01,
    e como ele sai do DRE pela parte, a receita que conta e' a da entrega.

- ⚠ RATEIO-VIGENCIA-01 — O RATEIO ADMINISTRATIVO OLHA QUAIS ATIVIDADES EXISTEM EM CADA MES (28/09/2026, decisoes do Gabriel e do
  Chat). Retroativo, todo o historico, todos os clientes; nada gravado — os DREs recalculam. Migration
  `supabase/migrations/20261027161000_rateio_vigencia_01.sql` (⚠ registrada como `20260928102310`; ledger = arquivo sem a quebra de
  linha final, md5 81361912).
  O DEFEITO: `agri_rateio_admin` guarda uma chave por ANO CIVIL, e os quatro leitores a aplicavam a todo mes do ano, existisse ou nao
  a atividade. NJ 2023 (80/15/5): a lavoura so' comeca em jul/23 e a silvicultura nao tem DRE — R$ 115.592,95 do administrativo do
  ano nao caiam em DRE nenhum (48.508,91 da silvicultura + 67.084,04 da lavoura de jan-jun).
  A FUNCAO UNICA `fn_rateio_admin_mes(cliente, de, ate, cenario, safra)` (nova, md5 0f115ffb, SECURITY INVOKER, EXECUTE para
  authenticated, service_role e supabase_read_only_user): uma linha por lancamento administrativo com o PESO de cada atividade no mes.
  Os quatro leitores a usam — `fn_dre_pecuaria` (e9b5b5dc -> 41f7f098), `fn_dre_lavoura` (2108094b -> eece80eb),
  `fn_dre_agricola_por_safra` (7aad0a26 -> 604e6948) e `fn_painel_rateio_detalhe` (634705c3 -> 7472a393), patch guardado por md5,
  ACLs iguais — e a LISTA DE EXCLUSAO DE MACROS mora so' nela (a do Painel Safra nao tinha 'Tributos': fechou a divergencia).
  REGRA: existencia no mes — pecuaria = rebanho > 0 (cache realizado ou fechamento); agricultura = safra com area plantada cobrindo o
  mes; silvicultura = lancamento de silvicultura desde o primeiro. Uma so' existe -> 100% dela; mais de uma com chave -> a chave do
  ano renormalizada sobre as que existem; mais de uma sem chave, ou nenhuma -> tudo "nao alocado" com o motivo. A parte da
  SILVICULTURA vai para "nao alocado" ate' existir DRE dela. INVARIANTE (soma dos pesos = 1) conferido na propria funcao, que aborta.
  Com safra, a agricultura do mes e' multiplicada pela fatia de area da safra entre as plantadas no mes: um mes nunca cai em duas
  safras (o NJ tem -Lav, -AMD e -MAND por periodo; so' a -Lav tem cultura).
  ⚠ MES FUTURO (decisao do Gabriel): depois do ULTIMO mes com dado de rebanho do cliente, a pecuaria HERDA a existencia daquele mes.
    Sem isso, os previstos de 2027 (sem cache) iam 100% para a silvicultura (NJ, SR) ou para "mes sem atividade" (Vera). Provado:
    ate' 2026-12, 9.895 linhas identicas com e sem a regra; mudam so' as 60 de 2027.
  CHAVE NOVA: `rateio_adm.nao_alocado` (fn_dre_pecuaria) e `nao_alocado` (painel, ramo admin) = {valor, silvicultura, outros,
  motivos}. TELA: a aba Rateio do modal de valor ganhou a etapa "Nao alocado (motivo)" quando > 0 (`etapaNaoAlocado`), na pecuaria
  SO' SEM GRUPO — a RPC nao abre o nao alocado por grupo — e depois das fazendas/culturas (logo abaixo da parte, as fazendas
  recuadas pareciam filhas dele; visto na tela).
  EFEITO MEDIDO (realizado): mudam SO' NJ 2023 (Lucro operacional 3.672.308,97 -> 3.604.289,07; rateio 776.142,59 -> 844.162,49),
  NJ 2026 jan-ago (2.791.954,04 -> 2.753.788,51) e Raul 2021 (-3,90). Agnaldo/RRCC/Vera/Teste 28 de 28 e a meta 49 de 49 identicas
  (jsonb por valor, tirada a chave nova). Lavoura: as tres -Lav identicas; -AMD/-MAND/26/27 com parte 0; Painel Safra = DRE (23/24
  227.329,53 -> 222.044,34). Invariante em 385 cliente-meses, zero quebra. Tela: NJ 2023, Lavoura 23/24 e SR 2021 (nao alocado 8.082,73).
  ⚠ O ROTULO DA PARTE VIROU "Parte da pecuaria no periodo" / "Parte da agricultura no periodo" (era "(percentual declarado do
    ano)", que deixou de ser verdade): o % e' o EFETIVO do periodo. O tooltip diz a regra ("Chave declarada do ano aplicada so aos
    meses em que a atividade existe; a parte de atividade sem DRE fica em Nao alocado."), pelo campo `dica` da etapa.

- ⚠ TRANSF-FAZENDA-ORIGEM-01 — "GLOBAL NAO E' FAZENDA" NA TRANSFERENCIA, NO CONSUMO E NA EVOLUIR CATEGORIA (regra permanente,
  Gabriel, 27/09/2026). Todo campo de fazenda de modal e' seletor com todas as fazendas ativas do cliente, com QUALQUER filtro:
  filtro numa fazenda -> nasce com ela e troca; Global -> nasce VAZIO, obrigatorio, vermelho com "Selecione a fazenda do
  lançamento." embaixo (sem toast); edicao -> a fazenda GRAVADA, travada (`editarLancamento` nao envia `fazenda_id`). "Global"
  nunca aparece como valor de campo, de cabecalho nem de resumo. Sem banco nem RPC.
  O DEFEITO (print do Gabriel): a Transferencia (saida) mostrava "Fazenda Origem: Global" travado e "Origem: Global" no resumo —
  `getCamposFazenda` punha o NOME DO FILTRO num campo `auto` somente-leitura — e o Registrar era recusado pela guarda de Global
  depois da tela preenchida. O Consumo tinha seletor SO' em Global (preso na fazenda do filtro fora dele); a Evoluir categoria nem
  campo tinha (herdava o filtro e, em Global, caia no toast generico "Não foi possível registrar").
  O CONSERTO E' O CAMINHO QUE JA' EXISTIA: `transferencia_saida` entrou em `TIPOS_COM_SELETOR_DE_FAZENDA` e na cadeia
  `fazendaEscolhidaId` (payload, guarda, confirmacao, `fazenda_origem`, snapshot e resumo leem dela), com `transfFazendaId` semeado
  do filtro. O Consumo perdeu o `isGlobal &&`. A Evoluir categoria ganhou o campo no `ReclassificacaoFormFields` (prop
  `campoFazenda`) e o hook ganhou `fazendaId`/`exigeFazenda` (o Fechamento nao passa nenhum e segue igual). As regras puras moram
  em `src/lib/zoo/fazendaDoFormulario.ts` (`fazendaSemeada`, `destinosDaTransferencia`, `destinoAposTrocarOrigem`,
  `bloqueioDaFazenda`).
  ⚠ O DESTINO DA TRANSFERENCIA e' `fazendasOC` MENOS A ORIGEM ESCOLHIDA (antes: `fazendas` menos a do FILTRO, que em Global nao
    tirava nada, e incluia fazenda inativa). Trocar a Origem para a mesma do Destino limpa o Destino. Grava o NOME, como sempre.
  ⚠ A GUARDA VIROU `bloqueioDaFazenda`, com um segundo caso: quem escolhe e deixou vazio nao grava — o foco vai ao campo, sem
    toast. SO' NO REGISTRO NOVO: a edicao nao envia `fazenda_id`, e o Nascimento em Global edita com o seletor vazio desde sempre.
  ⚠ O SEMEAR NAO RODA NA EDICAO (`editingAbateId` / `editingReclassId`): o efeito dispara quando `setTipo` vira o tipo, no mesmo
    render em que a edicao ja' marcou o id, e apagaria a fazenda do registro — o defeito que a venda ja' teve (PR-OC-VENDA-REABRIR-01E).
  ⚠ O CONSUMO deixou de cair em `fazendaAtual?.id` no preco de estoque e no financeiro (`gerarFinanceiroConsumo`): vale o escolhido.
  Compra OC ganhou a borda vermelha no campo vazio, na mesma condicao da frase que ja' existia.
  ⚠ PROVA NA TELA (preview, NJ, filtro Global, nada registrado — 0 lancamentos do NJ nos 30 min da prova): Transferencia vazia e
    vermelha, as 3 fazendas pecuarias na lista, Origem Faz. Pureza -> cabecalho e resumo "Faz. Pureza", Destino sem a Pureza; Origem
    trocada para Sta. Luzia (o Destino) -> Destino limpo. Consumo e Evoluir categoria: vazios e vermelhos, cabecalho "—", e com a
    fazenda escolhida o cabecalho a mostra.

- ⚠ FIN-FAZENDA-PADRAO-01 — O FINANCEIRO NAO ESCOLHE A FAZENDA POR NINGUEM (28/09/2026; a pendencia de mesmo nome, aberta no
  TRANSF-FAZENDA-ORIGEM-01, esta' BAIXADA). Com o filtro em "todas"/Global, o novo lancamento (`FinanceiroV2Tab`), a Mesa de
  classificacao (Excel sem codigo resolvido) e o Modo rapido nascem com a fazenda VAZIA e obrigatoria — nunca a primeira da lista.
  Filtro numa fazenda: nasce com ela e troca. Edicao: a gravada, com a troca que o dialogo ja' tinha. Sem banco nem RPC.
  O DEFEITO: `defaultFazendaId = fazOperacionais[0]` (nao-administrativas, alfabetica, INCLUINDO inativas) no novo lancamento e no
  Modo rapido, e `fazendas.find(f => f.id !== '__global__')` (ordem do banco) na Mesa — gravado sem ninguem escolher. O Modo rapido
  nem tinha campo: o lote inteiro ia para aquela fazenda.
  O CONSERTO E' O COMPONENTE COMUM: o `FazendaSelect` ganhou `obrigatorio` (borda vermelha e "Selecione a fazenda do lançamento."
  quando vazio e NAO forcado ao Administrativo) e `id` (foco). Sem a prop nada muda para os outros usuarios dele. O dialogo o usa
  obrigatorio; o Modo rapido ganhou o seletor "Fazenda do lote *" no cabecalho (vazio em Global, a do filtro fora dele) e sem ele
  nenhuma linha grava. O salvar do dialogo recusa fazenda vazia no simples e no parcelado ANTES do banco, levando o foco ao campo; o
  toast "Escolha a fazenda" do parcelado saiu.
  ⚠ CORRECAO DA FASE 0: o salvar simples JA' NAO chegava ao banco vazio — `computeValidacaoModal` exige `fazendaId` e o `canSave`
    desliga o botao (`lancamentoDialogTabs.ts:102`). O que faltava era o campo DIZER. A guarda nova e' a trava do proprio gravar.
  ⚠ PREENCHIMENTOS AUTOMATICOS QUE FICAM, por decisao do Gabriel: cliente de uma fazenda so' (o contexto nem abre Global); fazenda
    da CONTA BANCARIA (criar a partir do extrato); codigo do Excel na Mesa e fazenda do arquivo no Custeio, quando resolvem;
    fazenda da OC e do contrato (obrigacao); Administrativo pelo escopo (FIN-FAZENDA-ADM-01).
  ⚠ A MESA DE CLASSIFICACAO E O MODO RAPIDO NAO SAO ALCANCAVEIS HOJE, e a FASE 0 nao viu: `MesaClassificacaoTab` so' e' montada
    por `V2MesaClassificacao`/`V2MesaOperacional`, que sairam do `V2Index` (PR-CLEANUP-MESA-CLASSIFICACAO-01 / -REFERENCIAS-
    OPERACIONAIS-01), e `setMode('rapido')` nao e' chamado em lugar nenhum da `FinanceiroV2Tab`. O conserto entrou nos dois (pedido
    do briefing, e sem ele quem religar herda o palpite), mas a prova de tela so' existe para o novo lancamento.
  ⚠ MEDIDO ANTES (so' leitura, 28/09): sem sinal de lancamento gravado na fazenda errada. A fatia dos manuais na "primeira fazenda"
    acompanha a dos importados em todo cliente (NJ 43,6 % x 40,3 %; Vera 26,5 x 25,4; Agnaldo 9,2 x 23,3), zero manual sem
    fazenda, e dos 76 manuais com fazenda trocada depois so' 9 sairam da "primeira" — 8 deles para Administrativo, que e' a regra.
  ⚠ PROVA NA TELA (preview, NJ, Global, nada salvo — 0 lancamentos do NJ na janela): novo lancamento com Fazenda vazia, vermelha e
    com a frase, resumo "—", a lista igual a de antes; escolhida Faz. Sto. Expedito, o resumo a mostra.

- ⚠ OC-FAZENDA-GLOBAL-01 — A CENTRAL DE OPERACOES COMERCIAIS SEGUE O SELETOR LATERAL, como o Lancar
  movimentacao e a Lista (25/09/2026, decisao do Gabriel). `CentralOperacoesComerciais` le' `useFazenda()`:
  fazenda escolhida -> so' as OCs dela; Global -> todas. O filtro proprio `f_fazenda` e a caixa de fazenda da
  barra SAIRAM — eram duas perguntas de fazenda na mesma tela.
  ⚠ O PADRAO COPIADO E' O DA LISTA (`useLancamentos`: Global = todas as fazendas do cliente; fazenda = `.eq`)
    e o da `FinanceiroTab` para a coluna: "Faz" SO' EM GLOBAL (:381/:411) — com uma fazenda escolhida ela
    repetiria a mesma sigla em toda linha.
  ⚠ NO NAVEGADOR, sobre a carga por cliente que ja' existia: trocar de fazenda e' instantaneo e nao faz
    consulta nova. `fazendaAtual` ainda nulo (contexto carregando) conta como Global — filtro e coluna juntos.
  ⚠ OC SEM FAZENDA (`fazenda_id` nulo, o schema permite): aparece em Global, some com uma fazenda escolhida.
    0 casos em 25/09/2026 (98 OCs). E nenhuma OC tem movimento em fazenda diferente da sua (70 com movimento):
    a fazenda da OC mora so' no cabecalho — lotes e movimentacoes nao tem coluna de fazenda.
  ⚠ RESUMO, PDF E EXCEL herdam: `filtrosDoResumo.fazenda` = nome da fazenda do seletor, ou "todas as fazendas".
  ⚠ LINK ANTIGO COM `f_fazenda`: ignorado e removido da URL na montagem. NAO muda o seletor lateral — a
    fazenda dele vale para as outras telas, e trocá-la calada por causa de um link tiraria o operador do
    contexto. Custo aceito: quem guardou link filtrado por fazenda abre na fazenda do seletor.
  ⚠ A TROCA DE FAZENDA VOLTA PARA A PAGINA 1 (entrou no lugar do `fFazenda` no efeito de `setPage(1)`); a
    montagem continua sem zerar, pela regra do PR-OC-LISTA-01.

- ⚠ PARAMETRO DE NAVEGACAO NA URL SE ESCREVE SEMPRE, NUNCA SE PRESERVA (regra permanente,
  OC-ABRIR-PERDE-ID-01, 24/09/2026). Quem abre uma tela GRAVA a origem do clique; herdar o
  valor que ja estava na query faz um parametro responder por um clique que nao aconteceu.
  A montagem mora em `src/lib/oc/paramsAberturaOC.ts`, com teste.
  ⚠ O DEFEITO: `abrirOperacaoOC` (V2Index) tinha `if (!p.get('oc_return'))` — so' gravava
  quando o parametro estava ausente. Um `oc_return=lancamentos-zoot`, que `abrirNovaVendaOC`
  grava quando a venda nasce em "Lancar movimentacao", SOBREVIVIA na URL. Depois, clicar
  numa OC na Central (medido na 8b211cae, NJ, venda boitel) levava o operador para "Lancar
  movimentacao" com os filtros intactos e SEM `oc_venda`/`oc_id`.
  ⚠ E O SINTOMA ERA MUDO, que e' o que o torna caro: sem modal, sem toast, sem erro de
  console. A tela do clique simplesmente nao abria. `fecharOperacaoOC` obedecia ao valor
  velho porque `'lancamentos-zoot'` E' secao conhecida enquanto `'operacoes-comerciais'`
  NAO esta' no `SECTION_TO_GROUP` (V2Index:348-351) e cai no fallback — que por acaso
  tambem e' a Central. A assimetria escondia metade dos casos.
  ⚠ A PRESERVACAO TINHA UM MOTIVO REAL, e ele nao morreu: na volta do drill do Financeiro
  `sectionRef.current` e' 'financeiro-lanc', e deixar a funcao adivinhar apagaria a Central
  de quem entrou por ela (era o PR-OC-FIX-RETORNO-02). A saida foi trocar IMPLICITO por
  EXPLICITO: a assinatura ganhou `retorno`, o drill PASSA o valor que quer preservar, e
  todo o resto declara a propria origem. Intencao escrita no chamador, que e' quem a conhece.
  ⚠ DIAGNOSTICO: o que separou este caminho do OUTRO que produz sintoma IDENTICO foi UMA
  pergunta — apareceu toast? `limparParamsOC` (LancamentosTab:418) apaga os mesmos seis
  parametros, tambem preserva os filtros e tambem deixa o usuario em "Lancar movimentacao",
  mas SEMPRE com `toast.error` antes (recusa de hidratacao). Silencio = `fecharOperacaoOC`
  com `oc_return` contaminado. Dois caminhos, uma pergunta binaria.
  ⚠ E NAO HA FECHAMENTO SILENCIOSO NA ABERTURA — conferido: `fecharModalOC`
  (LancamentosTab:2673) e' o unico invocador de `onFecharOperacaoOC`, e so' por Esc, X ou o
  botao Fechar; os seis `limparParamsOC` tem `toast.error` imediatamente antes.

- ⚠ VALOR LIDO DA URL SE MEMOIZA; ESCRITA QUE NAO MUDA NADA NAO SE FAZ (regra permanente,
  OC-URL-RAJADA-01, 25/09/2026). `src/v2/hooks/useFiltroUrl.ts`.
  ⚠ NASCE DE "CLIQUEI E NAO ABRIU", e a causa nao estava em quem abre. Medido na Central de
  Operacoes Comerciais com `?f_ord=data:asc` no endereco: FECHAR uma OC disparava de 30 a 200
  reescritas de URL em ~4 s, e a linha da lista so' reaparecia aos 3993 ms. Clicar numa linha
  dentro dessa janela escrevia `oc_venda`/`oc_id` e a reescrita seguinte os APAGAVA — a tela
  trocava de secao e o modal nunca montava, sem toast, sem erro de console, sem nada.
  Depois: 1 escrita, linha de volta em 991 ms, clique imediato abre.
  ⚠ A CAUSA ERA IDENTIDADE, NAO CLOSURE — e eu persegui o closure primeiro. `ORD.ler` devolve
  `{col, dir}`, objeto NOVO a cada chamada, e o hook recalculava o valor em todo render. O
  `useEffect` que zera a pagina (`CentralOperacoesComerciais.tsx:626`) lista `ord` nas
  dependencias: identidade nova a cada render = efeito a cada render = escrita na URL = render
  seguinte. Sem `f_ord` o valor e' o padrao `null`, primitivo e estavel, e a rajada nao existia.
  Era exatamente essa a diferenca entre o endereco que falhava e o que funcionava.
  ⚠ A GUARDA DE IGUALDADE E' SEGUNDA LINHA, nao o conserto: `definir` agora compara a query
  resultante com a atual e desiste se forem iguais. Ela existe para o proximo efeito mal
  calibrado custar UM render em vez de duzentos.
  ⚠ COMO SE ACHA UM DESTES, porque nenhum dos sete gates ve': instrumentar
  `history.replaceState` no navegador, capturar `new Error().stack` nas primeiras escritas e
  MAPEAR as posicoes com o sourcemap (`build.sourcemap` temporario + `@jridgewell/trace-mapping`).
  A pilha crua so' tem nomes minificados; mapeada, ela nomeia arquivo e linha em um passo. Foi
  o que separou `V2Index:602` (a escrita legitima do Fechar) de `useFiltroUrl:53` chamado por
  `CentralOperacoesComerciais:628`.
  ⚠ DUAS LICOES DE DIAGNOSTICO FICAM, e as duas sao erros meus deste dia:
    1. CORRELACAO NAO E' CAUSA, e a ordem dos cliques fabrica correlacao. Reportei que OC
       `fechada` nao abria e `programada` abria — 2x2 perfeito. Era artefato: as duas fechadas
       tinham sido clicadas logo apos um Fechar, dentro da rajada. `ceabd850` (fechada) abre
       quando a pagina esta quieta, e o abate fechado tambem.
    2. "EM SILENCIO" TEM DE SER MEDIDO, nao suposto. Declarei um clique "em silencio" depois de
       esperar 6 s; a rajada ainda corria, porque a propria montagem da Central a redisparava.
       Contar as escritas na janela ANTES do clique e' o que torna a palavra verificavel — e foi
       isso que revelou que `6a808c4c`, que eu ja' tinha separado como defeito proprio
       (OC-6A808C4C-NAO-ABRE-02), era o MESMO defeito. A frente nao precisa nascer.

- ⚠ MODAL DE LINHA DO DRE SOMA AS MESMAS CHAVES DA DEF DA GRADE (regra permanente,
  DRE-MODAL-CUSTO-FIXO-RATEIO-01, 25/09/2026). Uma fonte: `somaComposta` em
  `src/components/agri/drePecRegua.ts`, chamada pela grade (`valorDaLinha`, PecDrePanel) e pelo
  modal de historico. A composicao VIAJA NO CLIQUE (`RecorteHistoricoPec.compor = def.compor`),
  porque so' a grade sabe em que modo esta' — o modal procurava a def em `LINHAS_PEC` (Detalhado),
  que nao tem `compor`.
  ⚠ NASCE DE UMA APRESENTACAO AO CLIENTE: Resumido do Agnaldo, jan-ago/26, Global. A grade dizia
    "(−) Custo fixo" 902.853,55 (seis grupos 532.527,95 + rateio administrativo 370.325,60) e o
    modal da MESMA linha, 532.527,95 — em todos os seis anos (jan-ago/21: grade 616.243,76, modal
    336.252,01). A "Variacao do estoque" tinha o mesmo furo e ninguem tinha visto: modal
    −862.422,04 contra grade −2.882.281,45 (`vpb_operacional − reposicao`). A meta 816.160,00 e' a
    mesma nos dois modos: o `rateio_adm` da meta vem 0,00.
  ⚠ MEDIDO NA TELA depois do conserto: as 14 linhas com icone, grade = modal, ao centavo.
  ⚠ O MODAL DO CUSTO FIXO ABRE EM "Total c/ rateio" (o numero da grade) e tem "Direto da fazenda"
    no segmentado; o rateio e' a fatia fixa do anel (fora do corte das cinco maiores, cor propria
    `#312e81` — a setima cor da paleta voltava ao inicio e pintava o rateio igual a "Mao de Obra").
    O centro do anel diz a BASE ("do VBP") e o cabecalho do card tambem ("· % do VBP"): "31,6 %"
    sozinho foi lido pelo cliente sem saber de que. No Total ele e' 53,6 %; 31,6 % e' o Direto.
  ⚠ NENHUM DOS SETE GATES VIA ISSO: TSC e build compilam uma chave pura tanto quanto uma soma, e a
    suite so' montava o modal com fixtures sem rateio. O gate agora e' o caso que percorre TODAS
    as defs do Resumido — linha composta nova herda a cobranca sem ninguem lembrar dela.
