# Historico das baselines dos gates

Movido VERBATIM do CLAUDE.md em 29/09/2026. O CLAUDE.md guarda so' o comando, o numero vigente e a regra de
comparacao; aqui fica a razao de cada subida e queda.

## TSC — historia da baseline (bloco integral de CLAUDE.md, ate' 29/09/2026)

- TSC baseline: 142 erros (era 73 ate 2026-09-02, 155 ate 09-03, 153 ate 09-08, 150 ate 09-09, 148 ate 09-10 e 143 ate 09-11 — ver a regeneracao do
  types.ts abaixo), medidos em ARVORE LIMPA — worktree em detached
  HEAD sobre o commit, NUNCA no checkout principal. Mesmo numero e mesmo
  conjunto de diagnosticos em c0fdb21b, 487fe1cf e c28de22a.
  O 98 que constava aqui nao decorreu de reducao posterior: foi medido com
  trabalho parked na arvore. As duas linhas parked do PR-CONCIL-DERIVADO-02A
  (comentario + campo `conciliado_origem`) acrescentam exatamente 3 erros
  TS2352, porque o campo ainda nao existe em
  src/integrations/supabase/types.ts. 95 + 3 = 98.
  (Corrigido em PR-DEV-TSC-BASELINE-95, 2026-08-08, sobre c28de22a.)
  De 95 para 89 em PR-AREA-CADASTROSTAB-01, 2026-08-19, sobre c688d8ae.
  Sairam 6, todos de src/pages/CadastrosTab.tsx, porque as colunas de area
  sairam do state e do payload daquela tela:
    4x TS2339 — 'area_pecuaria_ha' / 'area_agricultura_ha' nao existem no tipo
       gerado (row.area_* no setData);
    2x TS2345 — propriedade excedente no update e no insert do payload.
  De 89 para 79 em PR-HOME-AREA-COMPOSICAO-01, 2026-08-21, sobre 9086ea6e.
  Sairam 10, TODOS de src/hooks/useFechamentoArea.ts e todos da MESMA raiz:
  a tabela `fechamento_area_snapshot` nao existe em
  src/integrations/supabase/types.ts, entao `.from()` resolvia para
  SelectQueryError e tudo que se lia do row errava.
    7x TS2339 — ano_mes (x2), fazenda_id, area_pecuaria_ha (x2),
       area_agricultura_ha, area_produtiva_ha;
    2x TS2345 — 'cliente_id' e 'fazenda_id' nao atribuiveis a 'id'
       (o .eq() encadeado sobre um builder ja quebrado);
    1x TS2769 — no overload matches this call (mesma causa).
  A queda foi por ELIMINACAO da divida de tipos, nao por supressao: adotou-se
  o idioma completo de dois casts, ja estabelecido no repo (105 ocorrencias) —
  `as any` no nome da tabela E no resultado do .select(). So o segundo elimina
  o branch SelectQueryError; o primeiro sozinho apenas troca a mensagem do
  erro (medido: 89 -> 92). Referencia viva com a MESMA tabela e zero erros:
  src/v2/hooks/useFechamentoPeriodoData.ts:227-228. O arquivo passou a ter
  zero erros. Correcao de raiz continua sendo regenerar types.ts.
  Registrado porque a origem importa: a regeneracao futura de
  src/integrations/supabase/types.ts pode reintroduzir numeros diferentes, e
  quem ler esta baseline precisa saber de onde ela veio.
  De 79 para 74 em PR-ZOO-LIMPAR-GAVETAS-MORTAS-01, 2026-08-29, sobre aba457d0.
  Sairam 5, TODOS de src/components/LancamentoDetalhe.tsx e todos IDENTICOS:
    5x TS2322 — '(id, dados) => void' nao atribuivel a '(id, dados) => Promise<void>'
  Eram os cinco `onSalvar={onEditar}` das gavetas de Nascimento, Morte,
  Transferencia, Consumo e Reclassificacao. A prop `onEditar` do card e' sincrona
  e as gavetas pedem Promise; a incompatibilidade era real e nunca deu defeito
  porque o codigo era INALCANCAVEL — nenhum dos cinco `set*EditOpen` era chamado
  com `true`. A queda veio de APAGAR o codigo morto, nao de corrigir tipo nem de
  suprimir erro: o conjunto restante e' identico ao de antes, sem erro novo.
  ⚠ A divergencia de assinatura CONTINUA existindo na prop `onEditar`; ela so'
  deixou de ser exercida. Se algum dia uma gaveta voltar a ser montada aqui, os
  cinco erros voltam com ela.
  De 74 para 73 na RODADA-2, 2026-09-01, sobre 318224f2. Saiu 1, de
  src/v2/V2Index.tsx:
    1x TS2322 — 'number' nao atribuivel a 'string', no `initialMes` que a
       montagem de `ConciliacaoBancariaTab` passava como `Number(mes)`.
  A prop e' `string` e o `selectedMes` da tela e' comparado com `c.mes`, que
  nasce `String(m).padStart(2,'0')` (ConciliacaoBancariaTab:183) — entao `8`
  nunca casava com `'08'` e a tela abria no mes corrente em vez do mes da regua,
  CALADA. O TS acusava desde sempre e o erro estava na baseline: era defeito de
  runtime documentado por um diagnostico que ninguem lia. A queda veio de
  CORRIGIR o defeito, nao de suprimir nem de apagar codigo.
  ⚠ O MESMO PADRAO CONTINUA em V2Index (`mesInicial={Number(mes)}` para
  IndicadoresTab, cuja prop tambem e' `string`): 1x TS2322 remanescente, fora do
  escopo daquele PR. Quem for reduzir de novo comeca por ali.
  De 73 para 155 em 2026-09-02, sobre 3148d80f, por REGENERACAO de
  src/integrations/supabase/types.ts (gen types rodado na maquina do Gabriel,
  06:13). O arquivo foi de 5.676 para 13.098 linhas e de 105 para 287 relacoes.
  ⚠ A SUBIDA NAO E' REGRESSAO, E ESTA E' A UNICA VEZ EM QUE SUBIR E' LEGITIMO.
  Nenhum erro foi introduzido por codigo: o tipo velho ignorava 183 relacoes, e
  tudo que as tocava resolvia para SelectQueryError — um ramo em que o TS
  desiste de checar. Com o tipo fiel ao banco, os `select`/`eq`/`insert` daquelas
  tabelas passaram a ser conferidos de verdade, e 82 erros que ja existiam no
  codigo apareceram. O tipo velho nao os evitava; escondia.
  Conferido no diff: 183 relacoes ENTRARAM e 1 saiu — `validar_conciliacao_rebanho`,
  que nao existe mais no banco (verificado em pg_proc e pg_class) e nao e' citada
  em arquivo nenhum de src/. A remocao e' fiel, nao perda.
  Os 82 revelados NAO foram corrigidos e nao devem ser suprimidos: sao divida
  pre-existente, agora visivel, registrada como frente [DEBT-TYPES-REVELADA] para
  reducao POR CONSERTO, um a um, como o `initialMes` acima. Concentracao:
    39x src/hooks/useBoitelOperacoes.ts        14x src/hooks/useMetaPrecoMercado.ts
    13x src/hooks/useFinanciamentoCadastro.ts  10x src/pages/CadastrosTab.tsx
     6x src/hooks/usePastoGeometrias.ts         6x src/hooks/useFechamentoExecutivo.ts
     5x src/v2/pages/V2PainelConsultor.tsx      5x src/hooks/useSaldosPorConta.ts
  e mais 35 arquivos com 1 a 4 cada.
  ⚠ E O CAMINHO INVERSO TAMBEM SE ABRIU: os `as any` que existiam SO porque a
  tabela faltava no tipo agora podem cair, e cada queda e' reducao real. Ver o
  commit seguinte a este.
  De 155 para 153 em 2026-09-03, sobre 0f7b88cf, no PERF-ZOOT-SAVE-01. Sairam 2,
  ambos de src/pages/LancamentosTab.tsx e IDENTICOS:
    2x TS2551 — Property 'catch' does not exist on type
       'PostgrestFilterBuilder<...>'. Did you mean 'match'?
  Eram as duas chamadas de `supabase.rpc('refresh_zoot_cache'...).catch(() => {})`
  dentro de `triggerZootCacheRefresh`. O `PostgrestBuilder` NAO implementa
  `.catch`: a chamada lancava TypeError SINCRONO, engolido pelo try de fora, e o
  builder e' lazy — sem `.then`, a requisicao NUNCA saia. As treze chamadas da
  funcao, espalhadas pelo arquivo, nao despachavam nada. A queda veio de APAGAR
  codigo morto que o compilador denunciava — nao de suprimir nem de corrigir tipo.
  ⚠ PRIMEIRA REDUCAO DA ERA TYPES-NOVO, e a licao importa mais que o numero: o
  diagnostico gritava TS2551 em TODO relatorio desde que existe, dentro da
  baseline, e ninguem o leu — exatamente como os "~91 ms" de comentario. O que
  achou o defeito foi a FASE 0 de uma frente de performance, nao o gate.
  De 153 para 150 em 2026-09-08, sobre 1db67f14, no 133g item 8. Sairam 3, todos o
  MESMO erro em tres chamadores de `resolverContaPorTexto`/`classificarConta`:
    2x TS2345 em src/v2/components/mesa/MesaPareamentoModal.tsx
    1x TS2345 em src/v2/lib/staging/mutations.ts
       — "Argument of type 'readonly { ... aliases: Json ... }[]' is not assignable
          to parameter of type 'readonly ContaResolvivel[]'."
  Os tres passavam a LINHA CRUA de `financeiro_contas_bancarias`, cuja coluna
  `aliases` e' `Json`, para um tipo que exigia `string[] | null`. A queda veio de
  CORRIGIR o tipo na origem: `ContaResolvivel.aliases` passou a ser `unknown`, que
  e' o que um `jsonb` de fato promete. Nenhuma logica mudou — a camada 0 do
  resolvedor JA validava em runtime (`Array.isArray` + `String(a)`); o tipo e' que
  prometia mais que o banco. Nao houve supressao: zero `as`, zero `@ts-ignore`.
  ⚠ E A DIVIDA DE TIPO ESCONDIA UMA SAIDA FACIL. Enquanto o tipo exigia `string[]`,
  quem tinha a coluna crua so' tinha duas opcoes — cast ou nao passar os apelidos —
  e `useFinanceiroV2.loadContas` tinha escolhido a segunda: `aliases` nem estava no
  `select`. Sem ela, "Cartao Banco do Brasil - Pecuaria Ag. 8974 C/C 25367 7" pulava
  a camada do apelido e casava pela agencia+numero com a CONTA CORRENTE de mesma
  agencia. O `select` ganhou a coluna no mesmo PR.
  De 150 para 148 em 2026-09-10, sobre 8a8a76be, no PR-BARRA-UNICA-01a. Sairam 2:
    1x TS2322 em src/v2/V2Index.tsx — 'number' nao atribuivel a 'string', no
       `mesInicial={Number(mes)}` que a montagem de `IndicadoresTab` passava;
    1x TS2353 em src/v2/lib/periodoConfig.ts — ''evolucao'' nao existe em
       `Partial<Record<V2Section, PeriodoTipo>>`. Este saiu com o ARQUIVO: `periodoConfig`
       ficou sem importador quando a `V2FilterBar` deixou o layout, e os dois foram
       apagados. A secao 'evolucao' continua tendo ramo de render em V2Index sem existir
       na uniao `V2Section` — o TS2367 que denuncia isso SEGUE na baseline, e agora e' o
       unico rastro dela.
  E' EXATAMENTE o erro que a RODADA-2 deixou anotado aqui como "o MESMO PADRAO CONTINUA em
  V2Index ... quem for reduzir de novo comeca por ali". Ele saiu por REMOCAO da prop, nao
  por conserto de tipo: a `V2FilterBar` global foi desmontada e as 32 props de valor
  INICIAL (`initialAno`, `filtroAnoInicial`, `anoInicial`, `mesInicial`) que ela semeava
  desapareceram com ela — a de `IndicadoresTab` entre elas.
  ⚠ A LICAO E' A MESMA DAS OUTRAS: o diagnostico dizia, desde sempre, que a tela abria no
  mes errado; o que o apagou foi uma frente de LAYOUT, nao uma de tipos. Baseline e' divida
  conhecida, e ela sai quando a causa some — nao quando alguem a persegue.
  De 148 para 143 em 2026-09-10, sobre dbf1ad68, no PR-REMOVE-AUDITORIA-BANCARIA-01. Sairam
  5, TODOS com o ARQUIVO em que moravam, em DUAS camadas de orfandade:
    3x em src/components/financeiro-v2/ExtratoImportPreview.tsx —
       1x TS2322 (uniao 'CandidatoPossivel | { id; data; fornecedor; ... }' nao atribuivel a
          'CandidatoPossivel') e 2x TS2352 (conversao de SelectQueryError<"Invalid
          Relationships/RelationName cannot infer result type"> para
          '{ lancamento_id; valor_aplicado }[]' e para '{ id }');
    1x TS2352 em src/components/financeiro-v2/DivergenciaDialog.tsx — mesma familia, para
       '{ extrato_id; valor_aplicado }[]';
    1x TS2345 em src/hooks/useBaixaViaExtrato.ts — 'Record<string, unknown>' nao atribuivel
       ao RejectExcessProperties de financeiro_lancamentos_v2.
  A CAMADA IMPORTA: o `ExtratoImportPreview` ficou sem nenhum importador quando a Auditoria
  Bancaria foi apagada — era ela, e so' ela, que o montava. Os outros dois cairam na camada
  SEGUINTE, quando o proprio Preview saiu e levou os tres dialogos e o hook da baixa via
  extrato, que so' ele chamava. Nao houve conserto de tipo nem supressao: os cinco erros
  descreviam codigo que deixou de existir.
  ⚠ E A SEGUNDA CAMADA SO' APARECEU PORQUE O GREP MUDOU. A primeira varredura procurou
  `from '@/...'` e disse que o Preview tinha dois consumidores — os dois eram COMENTARIO, um
  deles justamente o que afirmava "o componente continua vivo". E os tres dialogos usavam
  import RELATIVO (`./RevisarMatchDialog`), invisivel para um grep ancorado em `@/`. Contar
  chamador por substring conta prosa; a busca tem de ser por import.
  ⚠ TERCEIRA MANEIRA DE A BASELINE CAIR, e vale distingui-la das outras duas. Ate' aqui ela
  caiu por CONSERTO (o `initialMes`, o `aliases: unknown`) e por APAGAR CODIGO MORTO que o
  compilador denunciava (os `.catch` do PostgrestBuilder, as gavetas do zoot). Aqui a peca
  inteira saiu porque OUTRA TELA passou a responder a mesma pergunta — o Espelho —, e a
  divida foi junto de carona. Ninguem perseguiu estes tres erros; eles nao tinham mais onde
  morar.
  ⚠ E OS TS2352 ERAM O IDIOMA DOS DOIS CASTS. Sairam de graca, mas a divida que eles
  representam — `select` que o PostgREST nao consegue tipar — CONTINUA no repo em outros
  arquivos. A queda aqui nao mede progresso nessa frente.
  De 143 para 142 em 2026-09-11, sobre 6f7ed4fe, no FIN-PAINEL-SAFRA-01. Saiu 1:
    1x TS2304 em src/components/financeiro-v2/ExtratoMaioresCompromissos.tsx —
       "Cannot find name 'SEM_CENTRO'".
  A constante existe e e' EXPORTADA por src/lib/analise/analiseAgregacoes.ts; o import do
  componente trazia `maioresCompromissos, TOP_N` e nunca a trouxe. Saiu com UMA PALAVRA no
  import — a menor correcao que ja tirou um erro desta lista.
  ⚠ E ERA DEFEITO ALCANCAVEL, NAO ERRO COSMETICO. A constante e' avaliada no mini-ranking do
  drawer, em `it.centroPlano || SEM_CENTRO`: um item SEM centro dentro do bucket "Demais"
  avalia o lado direito do `||` e estoura ReferenceError — drawer em branco. O que segurou
  ate' hoje foi o curto-circuito do `||`, ou seja, a sorte de todo item da cauda ter centro.
  ⚠ A LICAO E' A MESMA DOS `.catch` DO POSTGRESTBUILDER, e por isso ela se repete aqui: o
  diagnostico nomeava um crash em linguagem clara, em TODO relatorio, e ninguem o leu porque
  "estava na baseline". Quem o achou foi um PR de FEATURE que por acaso tocou o arquivo — nao
  o gate, nao uma frente de tipos. Ler os erros de baseline dos arquivos tocados NAO e'
  burocracia do relatorio: e' a unica leitura que estes erros recebem.

## SUITE DE TESTES — historia da baseline (bloco integral)

- SUITE DE TESTES — comando OFICIAL:
      npx vitest run
  Baseline em 2026-09-16: 1504 passando, 22 skipped, 103 arquivos, e
  3 FALHAS PRE-EXISTENTES que NAO sao regressao de PR nenhum:
    2x src/lib/zootecnico/validacaoZootecnica  ·  1x transferencia
  Elas falham no HEAD limpo, em arvore limpa. Antes de chamar qualquer falha de
  regressao, conferir se ela e' uma destas tres.
  Era 1514 ate' 2026-09-16 e caiu para 1476 no PR-DRE-LAVOURA-02. Sairam 38, TODOS
  de src/lib/agri/dreCultura.test.ts, que morreu COM A LIB que testava: o
  `AgriDreCulturaTab` foi apagado (a grade unica de Executivo > DRE responde a mesma
  pergunta), e com ele cairam `useDreAgricola`, `usePoolAdministrativo` e
  `lib/agri/dreCultura` — nesta ordem, cada camada so' ficando orfa depois que a
  anterior saiu.
  ⚠ NAO E' REGRESSAO E NAO E' PERDA DE COBERTURA: os 38 testes cobriam `montarMatriz`,
  `valorDe` e `resultadoPorHa` de uma tela que nao existe mais. Cobertura se perde
  quando o codigo fica sem teste, nao quando os dois saem juntos.
  ⚠ E E' A MESMA TERCEIRA MANEIRA DE UMA BASELINE CAIR ja' registrada no TSC e no
  check:ui-nativo: a peca deixa de existir porque OUTRA passou a responder. Nao houve
  conserto de teste nem supressao.
  De 1476 para 1477 no PR-DRE-LAVOURA-03, no mesmo dia: o modal de centro passou de duas
  abas para tres (Custos diretos | Divisao do rateio | Rateados), e
  src/components/agri/rateioDetalheModal.test.tsx acompanhou — 1 caso saiu (a contagem da
  aba unica, que nao existe mais) e 2 entraram (as tres abas do centro; as duas do admin).
  ⚠ E FOI ELE QUE PEGOU A MUDANCA DE CONTRATO. O subtitulo do modal mudou de forma no mesmo
  PR, e as quatro falhas que apareceram no primeiro `vitest run` eram os casos velhos
  cobrando a frase velha — nao regressao, mas tambem nao ruido: era o gate fazendo o
  trabalho dele. Os casos foram atualizados para o contrato novo, nunca removidos para
  passar.
  De 1477 para 1484 no PR-DRE-LAVOURA-04, em dois arquivos. Entrou
  `src/pages/agriDreLavouraGrade.test.tsx` (+4): ele exercita o CLIQUE de cada celula da
  grade — as tres da mesma linha (R$, /ha, /sc), a linha de centro e a coluna Total, que
  nao abre. Nasceu porque essa fiacao ja quebrou duas vezes de formas que TSC e build nao
  veem: no PR-02 so' a celula de R$ abria, e no PR-03 um guard de `pool > 0` fazia o clique
  na linha de centro nao fazer NADA.
  ⚠ E ELE ACHOU UM TERCEIRO NA PRIMEIRA RODADA: o `onClick` estava no `<span>` do texto e
  nao no `<td>`, entao os 7px de padding de cada lado nao respondiam — enquanto a celula
  vizinha (`CelulaUnit`) ja' o tinha no `td`. Duas areas de clique diferentes na mesma linha.
  E `rateioDetalheModal.test.tsx` foi de 12 para 15
  casos — entraram os dois estados do toggle no cabecalho e o modo SEM abas de §10c. Um
  caso existente foi reescrito (o cabecalho virou DUAS linhas: eco da celula clicada mais a
  conta que a explica): ele
  falhava com "Found multiple elements" porque a frase que ele procurava passou a
  aparecer nas duas linhas do cabecalho — falha certa, pela razao certa.
  De 1484 para 1485 no PR-DRE-LAVOURA-06: `agriDreLavouraGrade.test.tsx` ganhou o caso que
  trava o `p_tipo` do clique num centro de INVESTIMENTO ('investimento', nao 'natureza') —
  os dois ramos de `fn_painel_rateio_detalhe` filtram tabelas diferentes.
  De 1485 para 1487 no PR-DRE-LAVOURA-07: entraram o clique da linha "(-) Rateio compartilhado"
  (`abrir('natureza', null, ...)` — chave NULA e' a assinatura do pool) e o render do modal em
  modo pool (duas abas, coluna Centro, sem "Custos diretos").
  De 1487 para 1490 no PR-DRE-LAVOURA-08: tres casos do INVARIANTE do modo — custo fixo,
  investimento e os dois resultados sao os MESMOS nos dois modos do toggle; tres linhas de
  "Rateio compartilhado" em "Custos diretos" e nenhuma no outro.
  De 1490 para 1491 no PR-DRE-LAVOURA-09: o caso que trava o `p_tipo` das DUAS filhas de rateio
  ('pool_fixo' e 'pool_investimento') e confirma que a da cascata segue em 'natureza'.
  De 1491 para 1495 no PR-DRE-PECUARIA-01: entrou `src/pages/pecDrePanel.test.tsx` (+4) — a
  ordem das 18 linhas da cascata, os numeros do NJ na coluna Total, o "—" da fazenda sem
  fechamento e a coluna Administrativo que aparece de proposito.
  De 1495 para 1499 no PR-DRE-LAVOURA-10: quatro casos que travam a REGUA TIPOGRAFICA da grade
  como NUMERO — os quatro papeis, o invariante de que so' o subtotal passa dos 18px de antes,
  a altura cabendo a propria fonte, e o total da grade ficando MENOR que o da grade uniforme.
  ⚠ O ULTIMO E' O QUE IMPORTA: a primeira versao da regua (22/18/18/16) passava em fonte e peso
  e fazia a grade CRESCER. Teste de aparencia nao pega isso; teste de total pega.
  De 1499 para 1504 no PR-AGRI-MANDIOCA-01a: entrou `src/lib/agri/modeloComercial.test.ts` (+5) —
  o mapa que decide se a cultura estoca em saca ou entrega direto. O caso que importa e' o da
  cultura DESCONHECIDA: ela cai em `saca_estocavel`, que e' o comportamento que todas as telas
  ja' tinham. Um mapa devolvendo `undefined` faria cada tela decidir sozinha.
  De 1504 para 1509 no PR-AGRI-MANDIOCA-01c: entrou
  `src/components/agri/cargasEntregaDireta.test.ts` (+5) — a regra de que UMA LINHA E' UMA CARGA.
  O backfill gravou cada carga como DUAS colheitas (uma por metade de talhao), e a lista do 01b
  mostrava 42 linhas para 21 cargas; o agrupamento e' pelo `lancamento_id` do papel 'venda'.
  ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' O DO VALOR: as duas metades apontam para o MESMO lancamento,
  entao soma-las contaria o mesmo dinheiro duas vezes e o total da tela ficaria exatamente o dobro
  do extrato. Os outros quatro travam a chave (nao e' a NF — ha' nota com varias cargas), o
  rendimento lido e nao mediado, a carga sem elo (que fica sozinha e sem status) e o comprador.
  De 1509 para 1513 no PR-DRE-PECUARIA-02: `src/pages/pecDrePanel.test.tsx` foi de 4 para 8 casos.
  Entraram: o TOTAL COMO PRIMEIRA COLUNA (§2a), a linha de % com o VBP como base (§3, com o NUMERO
  travado), o traco quando o VBP nao e positivo, e os grupos de centro nascendo FECHADOS.
  ⚠ E DOIS CASOS EXISTENTES FALHARAM ANTES DE SEREM ATUALIZADOS — o gate fazendo o trabalho dele.
  Eles liam a coluna Total por posicao (`cells[length-2]`, quando ela era a ultima) e passaram a
  devolver o numero da ultima fazenda. Falha certa, pela razao certa: o contrato da grade mudou.
  Foram atualizados para o contrato novo (indices nomeados), nunca afrouxados para passar.
  ⚠ E UM CASO NOVO NASCEU VAZIO, o que vale registrar: "os grupos nascem fechados" passava verde
  num fixture SEM centro nenhum — nao media nada. Ele ganhou centros de verdade e um clique que
  PROVA que a busca sabe achar (a mesma licao do auto-teste do `check:tdz`). O clique teve de ser
  `fireEvent`, nao `element.click()`: o clique cru dispara fora do `act()` do React e a assercao
  roda antes do re-render.
  De 1513 para 1517 no PR-AGRI-MANDIOCA-01d: entrou
  `src/lib/agri/exportEntregaDireta.test.ts` (+4) — o relatorio da mandioca NAO fala de saca.
  ⚠ NASCE DE UM PRINT, nao de zelo: em 16/09 o "Relatorio de Colheita" da mandioca saiu com Peso
  verde, Sacas boas, Grao de roca, Ticket, Verde/Seco/Umid./Afla/Sacas/Roca — e com 42 linhas para
  as 21 cargas do backfill. Tudo de amendoim, num papel que vai para a industria.
  O caso principal varre TODO o texto do documento (nome do arquivo, abas, cabecalhos e conteudo)
  atras de 'saca', 'afla', 'secagem' e 'roca', e so depois afirma que nao ha nenhuma — com duas
  assercoes que PROVAM que a busca sabe achar ('rendimento' e 'comprador' estao la), porque um
  payload vazio passaria verde sem elas. Os outros tres travam a linha por CARGA (21, nunca 42), o
  comprador na aba "Por nota" e o numero indo como numero.
  De 1517 para 1521 no PR-MESA-SUGESTOES-01: entrou `src/v2/lib/mesa/sugestoesDaMesa.test.ts`
  (+4) — a UNICA heuristica nova do PR, o texto que denuncia uma transferencia.
  ⚠ UM DOS QUATRO CASOS AFIRMA UM FALSO POSITIVO de proposito: "Aplicacao de recursos em
  fertilizante" CASA na heuristica e nao e transferencia nenhuma. Nao e defeito a consertar — e a
  razao de a sugestao ser ambar e exigir o clique do operador. Se alguem fizer a heuristica gravar
  sozinha, e este caso que mostra o estrago.
  ⚠ E O QUE ELE NAO COBRE FICA DITO NO PROPRIO ARQUIVO: a composicao dentro do `toRowVM` (safra
  sugerida + as tres portas juntas). A linha crua da view tem 87 campos obrigatorios e nenhum teste
  da casa monta uma; as pecas compostas — `safraSugerida`, `escopoDoSubcentro` e
  `subcentroDeTransferencia` — tem testes proprios. A ligacao e homologacao.
  De 1521 para 1530 no PR-MESA-CONTA-ENTRADA-01: entrou `src/v2/lib/mesa/contaDaLinha.test.ts`
  (+9) — as duas regras que, somadas, apagaram vinte contas conciliadas em 16/09/2026.
  Sao QUAL coluna do Excel e a conta (origem ou destino: a que RESOLVE; as duas resolvendo e
  transferencia) e EM QUAL coluna do lancamento ela se grava (entrada no `conta_destino_id`,
  saida no `conta_bancaria_id`).
  ⚠ O CASO QUE JUSTIFICA O ARQUIVO e "Resultado vazio nao escreve nenhuma das duas chaves": o
  editor mandava `conta_bancaria_id: id || null`, entao proposta VAZIA propunha APAGAR. Vazio e
  "nao tenho proposta", nunca "apague o que esta la".
  ⚠ E A CAUSA MAIOR ERA DA RPC, nao do front: `fn_classificacao_apply_row` zerava
  `conta_destino_id` sempre que o tipo efetivo nao era transferencia (`ELSE NULL` incondicional).
  Corrigida na migration 20261027121700, com a simetria que ja existia em `conta_bancaria_id`.
  De 1530 para 1745 em 2026-09-23, medido no DRE-HISTORICO-LINHA-01c (era 1709 em 22/09, no DRE-UNIDADES-01c). ⚠ NAO E' O GANHO DE UM PR: esta
  linha ficou parada enquanto a frente do DRE acrescentava casos (1702 medidos em c504d451, 1708
  no 01b com os 6 da largura de grupo, 1709 no 01c com o Total em traco da Lavoura). De 1709 para
  1738 vieram do DRE-HISTORICO-LINHA-01a e dos tres fix dele: o primeiro teste do
  `BarrasCompactas` (a lei da razao), o modal do historico (base do donut, delta por natureza,
  formatador abreviado, navegacao entre filhas e as duas portas de volta) e o periodo do botao
  Ano. De 1738 para 1745 no DRE-HISTORICO-LINHA-01c: o eixo zero das barras (razao nos dois
  sentidos, rotulo do negativo embaixo, zero na base sem negativos), o delta em pontos
  percentuais, o piso do "k" da tabela e a troca de referencia do delta pelo cabecalho. Os 22
  skipped e as 3 falhas pre-existentes seguem iguais.
  De 1745 para 1753 em 2026-09-23, e de novo SEM PR PROPRIO: a linha ficou parada durante o
  DRE-CASCATA-02, o 03a e o 03b, que acrescentaram 8 casos ao longo da frente. O 1753 foi medido no
  HEAD 67a79233, em arvore limpa, e e' a partir dele que a conta abaixo comeca.
  De 1753 para 1759 no DRE-CASCATA-03b-fix1 (commit 204b2cc4), +6 e TODOS em
  `src/pages/pecDrePanel.test.tsx`, que foi de 35 para 41 casos. Cinco sao a COR e a FAIXA de um
  total — o numero branco com marcador ▼/▲ no azul cheio, o marcador que some no zero, o azul
  escuro em vez de verde no positivo, a faixa cobrindo TODAS as celulas da linha (inclusive a
  coluna Total, cujo fundo e' inline e ganhava da classe) e as duas linhas de apoio herdando cada
  uma a faixa do SEU total. O sexto e' a coluna do icone de historico.
  ⚠ ELES NASCEM DE TRES VOLTAS NA MESMA REGRA, e e' o que justifica o arquivo: no 03b o total ficou
  PRETO ("a faixa ja destaca"), no fix1 ganhou verde e vermelho (e o verde brigou com a cor da
  natureza "receita"), e so' no adendo virou azul escuro e vermelho com marcador no t4. As tres
  voltas passaram pelos sete gates sem que nenhum dissesse nada — COR NAO TEM GATE, e agora tem.
  ⚠ E DOIS CASOS EXISTENTES FALHARAM ANTES DE SEREM ATUALIZADOS, pela razao certa: o cabecalho
  perdeu a linha do "N cab med." (adendo item 9) e os dois liam o subtitulo — um cobrava a string
  "10.000 cab", o outro o `\u00a0` da linha vazia. Foram atualizados para o contrato novo e o
  primeiro passou a AFIRMAR a ausencia (`not.toContain('cab med.')`), nunca afrouxados para passar.
  De 1759 para 1762 no DRE-CASCATA-03b-fix3, +3 e de novo em `src/pages/pecDrePanel.test.tsx`
  (41 -> 44): de quem sao os chips de Δ. O Global le' os dele, o x Anos le' os dele, e a x Meta
  legada segue o Global.
  ⚠ O TERCEIRO CASO E' O QUE JUSTIFICA OS OUTROS DOIS: ele prova o ESTRAGO, nao a regra — com o Δ
  ligado so' no Global, o x Anos nao pode ganhar coluna de Δ nenhuma; sem a separacao eram tres,
  uma por ano anterior, que o operador via nascer sem ter pedido e sem ter como fechar (o slot de
  controles e' exclusivo por visao desde o fix2, entao o chip nem estava a' mao). E o caso fecha com
  a mesma licao do auto-teste do `check:tdz`: liga os chips DA VISAO e confirma que as duas colunas
  aparecem, porque uma assercao de "nenhuma" passa verde tambem quando a busca esta quebrada.
  De 1762 para 1765 no mesmo fix3, adendo item 3: `src/pages/agriDreLavouraGrade.test.tsx` foi de 19
  para 22 casos, com o guard `painelDoDrill` — de que ATIVIDADE e' o drill de uma cultura.
  ⚠ NASCE DE UM DEFEITO VISIVEL: Lavoura > Amendoim > Historico > Pecuaria deixava o historico da
  CULTURA na tela, acima da tabela do rebanho. Os dois paineis do drill checavam so' `cultura` e
  `aba`, e nenhum dos dois sabe de que atividade a tela fala.
  De 1765 para 1764 no DRE-CASCATA-03b-fix4, e a queda de 1 e' toda de `pecDrePanel.test.tsx`
  (44 -> 43): SAIRAM os 3 casos de `deltasDaVisao`, que morreu com a funcao — o par de estados
  Global/x Anos acabou junto com os dois cards que os separavam, e uma referencia so' tem um Δ. Nao
  e' perda de cobertura: cobertura se perde quando o codigo fica sem teste, nao quando os dois saem
  juntos (a mesma regra ja' registrada no PR-DRE-LAVOURA-02).
  ENTRARAM 2: as quatro colunas cronologicas SEM Δ na referencia de 3 anos, e o `title` da opcao
  Meta quando nao ha' meta no periodo (ela continua clicavel — esconder faria a pergunta sumir junto
  com a resposta).
  ⚠ E SEIS CASOS EXISTENTES FORAM ATUALIZADOS AO CONTRATO NOVO, nunca afrouxados: a referencia passou
  a ficar a' ESQUERDA do atual ("Meta | Atual | Δ", nao "Realizado | Meta | Δ"), os tres nomes de
  visao viraram dois, e os indices das celulas andaram com a ordem. Falha certa, pela razao certa.
  ⚠ UM DOS CASOS NOVOS E' GATE DE DEFEITO MEDIDO NA TELA: o clique numa referencia SUBIA para o
  `onClick` do card, entao `onVisao` e `onReferencia` disparavam juntos, duas escritas de URL caiam
  no mesmo tique do React e a segunda se perdia — clicar em "Meta" nao fazia absolutamente nada.
  O caso trava que escolher a referencia NAO chama `onVisao`.
  De 1764 para 1774 no VPB-INICIO-01: entrou `src/hooks/dreP0Estreia.test.ts` (+10) — a ausencia do
  VPB chega a tela como "—" e NUNCA como zero, e a fonte do P0 (`p0_origem`).
  ⚠ NASCE DE UM DEFEITO QUE OS SETE GATES NAO VIAM. A RPC mandava `vpb_operacional: null` para a
  fazenda sem P0 e o hook passava `vbp`, `margem` e `lucro_liquido` por `num()`, que devolve 0 para
  qualquer coisa nao finita: o Lucro liquido de 2020 do NJ era calculado com VPB zero e a tela o
  mostrava como apurado. TSC e build ficam MUDOS porque `num()` compila; a suite passava porque
  nenhum fixture tinha um cliente cujo historico comeca dentro do periodo aberto.
  ⚠ E DOIS CASOS AFIRMAM O CONTRARIO DE PROPOSITO: "VPB zero e valor, nao ausencia" e a string "0"
  da RPC virando o numero 0. A regra e "ausencia e traco"; ela nao pode engolir o zero, que e
  resposta legitima. Sem esses dois, um parse com `if (!v)` passaria verde e apagaria zeros reais.
  ⚠ E TRES DOS DEZ NASCERAM DE UM DEFEITO VISTO NA TELA, depois do resto pronto: o selo "inicio"
  nao aparecia no DRE de 2020 porque na visao Comparacao a coluna e' o TOTAL do cliente, e ali a
  RPC responde com `p0_origem_estreia` (booleano), nao com `p0_origem`. Os numeros estavam certos e
  a procedencia, invisivel — o tipo de defeito que so' a tela mostra.
  De 1774 para 1778 no VPB-ENCERRAMENTO-01: mesmo arquivo, +4 — a ponta FINAL (`p1_origem`).
  ⚠ NASCE DO EFEITO COLATERAL DO PR ANTERIOR, visto na homologacao: com a ausencia propagando, uma
  fazenda que PAROU de ser fechada zerava o ano inteiro do cliente (o total e' nulo se qualquer
  parcela for nula). Quatro periodos ficaram sem numero — NJ civil 2023, NJ 23/24, SR civil 2023 e
  SR 23/24. Um dos quatro casos trava que divergencia ZERO nao vira null: Sta. Luzia zerou de
  verdade (0) e Bom Retiro nao (4 cabecas no cache), e tratar 0 como "sem divergencia" apagaria a
  diferenca entre as duas.
  De 1778 para 1780 no DRE-CASCATA-03b-fix7: `src/pages/pecDrePanel.test.tsx` foi de 43 para 45 —
  o Δ do PATRIMONIO existe contra o ANO e nao existe contra a META.
  ⚠ OS DOIS CASOS ANDAM JUNTOS DE PROPOSITO, e e' o que justifica serem dois: afirmar so' o numero
  novo passaria verde tambem se alguem apagasse a regra inteira, e ai' a coluna Meta voltaria a
  mentir que ha' meta de rebanho. O fixture da meta leva `efeito_mercado: 999999` justamente para
  provar que o traco NAO vem de zero.
  ⚠ E TRES CASOS EXISTENTES FALHARAM ANTES DE SEREM ATUALIZADOS, pela razao certa: eles cobravam
  'Δ' e 'real − meta' no cabecalho do grupo, que o item B apagou. Foram atualizados para o contrato
  novo — afirmam o grupo VAZIO **e** o rotulo 'Δ R$' presente na segunda linha —, nunca afrouxados.
  Afirmar so' a ausencia passaria verde tambem se a coluna inteira tivesse sumido (a mesma licao do
  auto-teste do `check:tdz`).
  De 1780 para 1774 no VPB-REGRA-UNICA-01: `src/hooks/dreP0Estreia.test.ts` foi de 14 para 8 casos.
  SAIRAM 10 e ENTRARAM 4. Os dez cobriam `p0_origem`, `p1_origem`, `sem_p0`, `sem_p1`,
  `p1_divergencia_cab` e a traducao de `p0_origem_estreia`/`p1_origem_encerrada` — o vocabulario
  das DUAS EXCECOES que este PR substituiu por uma regra so'. Cobertura nao se perde quando o
  codigo e o teste saem juntos (a mesma regra do PR-DRE-LAVOURA-02).
  Os quatro que entraram travam `p0_fonte`/`p1_fonte`: os tres valores validos de cada, o valor
  fora do contrato caindo para null, e o total lendo a MESMA chave da fazenda.
  ⚠ UM DELES AFIRMA QUE O VOCABULARIO VELHO NAO PASSA ('estoque_inicial', 'encerrada'): sem ele,
  uma RPC antiga conviveria em silencio com a tela nova, e o selo mentiria em vez de sumir.
  ⚠ OS QUATRO CASOS DO `lerLinhas` FICARAM — o parse ainda propaga null quando a RPC manda null,
  e isso continua valendo para o cenario `meta`, que nao mudou.
  De 1774 para 1780 no VARIACAO-REBANHO-MODAL-01-fix3: entrou
  `src/components/agri/pecEstoquePonteModal.test.tsx` (+6) — o modal da PONTE DE ARROBAS do DRE
  Resumido. Quatro deles travam a CONCILIACAO com a grade (as tres parcelas e o total, com os
  numeros medidos no NJ 25/26), o traco quando a coluna nao tem reposicao, o "—" do R$/@ dos
  Ajustes e as transferencias que somem no Global.
  ⚠ O SEXTO E' A LEI DO GRAFICO, e nenhum outro gate a ve': numa PONTE a altura de uma barra tem de
  ser proporcional ao valor E o topo de cada movimento tem de ser o acumulado depois dele. Ele
  afirma a RAZAO (altura/altura = @/@), o ENCAIXE (a base de uma e' o topo da anterior) e que a
  barra do FIM sai do zero como a do inicio. Um waterfall cujas barras nao encaixam vira grafico de
  barras comum, e o olho deixa de ver a conta andando — TSC e build ficam MUDOS, porque altura e'
  aritmetica dentro de um `rect`.
  ⚠ E O CASO DAS TRANSFERENCIAS AFIRMA OS DOIS LADOS de proposito: elas somem com liquido ZERO e
  FICAM com liquido diferente de zero. Afirmar so' a ausencia passaria verde tambem se alguem
  apagasse as duas linhas de vez (a mesma licao do auto-teste do `check:tdz`).
  De 1780 para 1785 no DRE-CASCATA-GRAFICO-01: entrou
  `src/components/agri/pecCascataView.test.ts` (+5) — a LEI DO GRAFICO da cascata do DRE, testada
  na funcao `montarBarras` e nao no SVG.
  ⚠ SAO DUAS LEIS, e uma sem a outra nao prova ponte nenhuma: a RAZAO (a altura de uma barra,
  `ate - de`, e' o MODULO do valor dela — numa escala linear isso e' a proporcionalidade inteira) e
  o ENCAIXE (subtotal sai do ZERO, passo FLUTUA do acumulado, e cada subtotal cai exatamente onde
  os passos anteriores o deixaram). So' a primeira passaria verde num grafico de barras comum.
  ⚠ UM CASO E' DO SINAL, e ele existe porque o sinal NAO vem do numero: "(−) Deducoes" chega
  POSITIVA da RPC e tem de subtrair. Ler o sinal do valor faria um estorno somar duas vezes.
  ⚠ E O ANO DE PREJUIZO E' CASO PROPRIO (SR civil 2025, lucro -3.496.515,22): e' ele que exercita
  `chao < 0`, o eixo negativo e a barra final abaixo do zero. Ele fecha afirmando que no ano BOM o
  chao e' ZERO — sem isso, uma escala quebrada que sempre descesse passaria verde.
  De 1785 para 1790 no mesmo PR, com o fix5: entrou
  `src/components/agri/pecPatrimonioModal.test.ts` (+5) — a coluna "Arrobas x R$/@" do modal FECHA
  NA CALCULADORA. Ela promete uma multiplicacao e o operador vai faze-la; ate' o fix5 a linha da
  Producao usava o R$/@ do INICIO da metade esquerda (245,55, ponderado pelo rebanho do inicio)
  sobre as arrobas do FIM, e 39.233 x 245,55 dava 9.634.161 contra os 9.680.106 impressos na celula
  ao lado. Quarenta e cinco mil numa coluna que existe para ser conferida.
  ⚠ A TOLERANCIA E' `0,005 x arrobas`, E O NUMERO NAO E' ESCOLHIDO: e' exatamente o que arredondar
  o preco a DUAS CASAS pode custar — meio centavo por arroba. O briefing pedia `0,0005 x @`, dez
  vezes menos, e NENHUMA implementacao correta passaria; medido, os tres deltas do SR jan-ago/21
  sao +24,36 / -147,37 / +13,38 contra limites teoricos de 176 / 196 / 196.
  ⚠ E UM CASO AFIRMA QUE OS DOIS PRECOS DO MESMO MES SAO DIFERENTES DE PROPOSITO (245,55 e 246,73):
  o primeiro e' P0 ponderado pelo rebanho do inicio, o segundo e' P0 ponderado pelo rebanho do FIM,
  e a mistura de categorias mudou no meio do periodo. Sem ele, "consertar" a divergencia igualando
  os dois passaria verde — e o caso mede o estrago (R$ 45.944) para dizer por que nao.
  De 1790 para 1792 no VARIACAO-REBANHO-MODAL-01-fix7: `pecPonteAbas.test.tsx` foi de 6 para 8
  casos, com a regra nova do R$/@ REAL da aba Movimentos. Ate' o fix3 tudo era valorado ao preco do
  REBANHO no mes do movimento — coerente entre si e falso em cada linha: a arroba produzida custa o
  CUSTEIO, nao o preco de mercado. Um caso trava os quatro precos (produzidas e nascimentos pelo
  custeio do PC-100, compradas pela reposicao, vendas pelo desfrute em @ viva) e o traco das
  mortes; o outro trava que "Produzidas" NAO tem cabeca — e' ganho de PESO, e o traco ali e'
  resposta, nao dado faltando.
  ⚠ QUATRO CASOS EXISTENTES FALHARAM ANTES DE SEREM ATUALIZADOS, pela razao certa: o contrato da
  aba mudou (rotulos, colunas e a assinatura, que passou a receber os numeros do DRE). Foram
  atualizados ao contrato novo, nunca afrouxados — e o de Ajustes passou a AFIRMAR que ele nao tem
  cabeca, nem preco, nem valor, onde antes cobrava os +1.487.257 que eram residuo de CRITERIO
  travestido de dinheiro.
  De 1792 para 1793 no mesmo fix7: `pecPatrimonioModal.test.ts` ganhou o caso que trava
  Producao + Mercado = a variacao do Resumo, ao real — a razao de as duas abas existirem separadas.
  ⚠ ELE FECHA PROVANDO O QUE AS SEPARA: com `v1_p0 = v1_p1` o Mercado zera e a Producao engole a
  variacao inteira. Sem esse trecho, um payload que perdesse o valor do MEIO passaria verde.
  ⚠ E UM CASO DE `pecPatrimonioModal.test.ts` MUDOU DE NUMERO SEM MUDAR DE REGRA: o R$/@ do fim do
  SR jan-ago/21 foi de 306,68 para 312,39 quando ago/21 passou a vir do fechamento
  (CACHE-X-FECHAMENTO-01). Os outros dois precos do caso NAO se mexeram, e e' isso que prova que a
  mudanca foi de FONTE e nao de conta: eles sao preco de dez/20.
  De 1793 para 1825 no OC-BOITEL-REALIZADO-01, e 26 dos 32 NAO sao deste PR — a linha ficou
  PARADA durante os PRs de 24/09 e a divida de registro e' minha. Medido agora, por arquivo:
    +9  src/lib/financeiro/nfDaOperacao.test.ts    (6e67e9ca, OC-PDF-ORIGEM-NF-01)
    +6  src/lib/financeiro/subcentroVenda.test.ts  (7223af46, OC-BOITEL-VALOR-01 B1)
    +5  src/lib/calculos/cascataAbate.test.ts      (0c1594f7, ABATE-RESUMO-TABELA-01)
    +5  src/lib/zootecnico/areasDaBase.test.ts     (fc830225, VALOR-REBANHO-GRAFICOS-BASE-01)
    +1  liquido entre `pecDrePanel.test.tsx` (beb51d9b) e `agriDreLavouraGrade.test.tsx` (70e9dbe9)
    +6  src/lib/oc/aplicarComRollback.test.ts      (ESTE PR)
  ⚠ E O NUMERO DE HEAD NAO FOI MEDIDO EM WORKTREE, ao contrario do que a regra pede: a arvore
  destacada colhe 25 arquivos a menos porque o `node_modules` simbolico nao resolve o alias `@/`,
  e 1563 ali nao e' baseline, e' erro de coleta. O 1819 de HEAD e' ARITMETICA — 1825 medidos no
  checkout principal menos os 6 casos que este PR acrescenta, num diff que nao toca teste nenhum
  que ja existia. Quem for medir de verdade instala as dependencias na worktree.
  De 1825 para 1835 no OC-ABRIR-PERDE-ID-01: entrou `src/lib/oc/paramsAberturaOC.test.ts`
  (+10) — a URL que abre uma OC. Quatro casos sao do `oc_return` (o do chamador ganha do que
  estava na URL; sem retorno o velho e' APAGADO; os filtros da tela atravessam; o drill do
  Financeiro preserva porque PASSA o valor), quatro dos tres tipos mutuamente exclusivos e
  dois do `oc_aba`.
  ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' O DO APAGAMENTO: "sem retorno, o velho e' apagado".
  Um teste que so' afirmasse "o chamador ganha" passaria verde numa funcao que continuasse
  herdando quando o chamador nao diz nada — e era exatamente esse o defeito.
  ⚠ E O DOS TRES TIPOS AFIRMA A IMPOSSIBILIDADE, nao o caso feliz: varre os tres sentidos e
  conta quantos ficaram ligados, porque dois ligados montariam dois shells no mesmo render.
  De 1835 para 1841 no OC-URL-RAJADA-01: entrou `src/v2/hooks/useFiltroUrl.test.tsx` (+6) —
  o filtro da URL nao pode alimentar o proprio render. Tres casos travam a IDENTIDADE do valor
  (codec que devolve objeto mantem a referencia; ela MUDA quando o parametro muda; o padrao e'
  estavel) e tres a GUARDA de igualdade (gravar o que ja' esta' la' nao navega; gravar
  diferente navega; voltar ao padrao apaga o parametro).
  ⚠ OS PARES ANDAM JUNTOS DE PROPOSITO. "Mantem a referencia" sozinho passaria verde num memo
  que CONGELASSE o filtro, e "nao navega" sozinho passaria verde numa guarda que bloqueasse
  toda escrita — em ambos os casos a tela pararia de responder. Cada regra tem o caso que
  mede o estrago da correcao exagerada.
  ⚠ E O ESPIAO DE `replaceState` ENTRA DEPOIS DA MONTAGEM: o react-router chama `replaceState`
  uma vez ao montar, para carimbar o indice do historico. Espiar antes mede o router, nao o
  hook — foi o que reprovou a primeira versao do caso.
  De 1841 para 1845 no OC-BOITEL-VALOR-01 A2: entrou
  `src/components/venda/realizadoAplicadoNoLote.test.ts` (+4) — QUANDO o valor do lote deixa de
  ser da projecao. O predicado e' o de `oc_salvar_lotes` (os dois fatos do papel), e o caso que
  justifica o arquivo e' o do RASCUNHO: `iniciarRealizadoBoitel` semeia uma copia da projecao, e
  conta-la como realizado travaria o lote sem o operador ter lancado nada. Um caso afirma que ZERO
  conta como preenchido, porque o banco testa `IS NOT NULL`.
  De 1845 para 1849 no DRE-MODAL-CUSTO-FIXO-RATEIO-01: `src/components/agri/pecHistoricoLinhaModal.test.tsx`
  foi de 23 para 27 casos. O que justifica o bloco PERCORRE TODAS AS LINHAS DO RESUMIDO e compara o
  total do modal com o `valorDaLinha` da GRADE, com os numeros reais do Agnaldo jan-ago/26 — e fecha
  afirmando 902.853,55 E que ele NAO e' 532.527,95, porque um fixture com rateio zero passaria verde
  com o modal lendo so' a chave. Os outros tres travam o segmentado, o rotulo "do VBP" do anel e o
  Detalhado sem segmentado. PROVADO: com a soma composta desligada no modal, 3 dos 4 falham.
  De 1849 para 1861 no OC-BOITEL-VALOR-01 A3: entrou `src/components/venda/valorDaVendaBoitel.test.tsx`
  (+12), com os numeros da 8b211cae (slot 848.713,32, acerto 882.608,62): o helper, a previsao
  principal lendo o slot com `lote_id` e recusando na divergencia, o LoteDialog com slot e aviso, e
  Documentos e Gerar compromissos montados lendo o slot.
  ⚠ DUAS FALHAS DA PRIMEIRA RODADA ERAM DO CODIGO, NAO DO TESTE: a tolerancia de um centavo
  comparava reais em ponto flutuante (`882608.63 - 882608.62` = 0,0100000009 > 0,01) e passou a
  comparar centavos inteiros; e o caso de DOIS centavos existe para uma tolerancia frouxa nao
  passar verde. A atualizacao do compromisso pelo revalorar e' regra de BANCO e nao cabe no vitest:
  a prova dela e' o rollback de quatro cenarios registrado no bloco A3.
  De 1861 para 1864 no FIN-V2-REFRESH-01: entrou `src/hooks/useFinanceiroV2.remendo.test.ts` (+3) —
  todo ramo de `editarLancamento` remenda a linha com o que o banco devolveu. Titulo de OC e titulo
  comum saem de "programado" para "realizado" com data SEM recarregar a lista, e a falha do select de
  verificacao se comporta igual nos dois (o save vale, a linha fica como estava). PROVADO: contra o
  hook de antes, o caso de OC falha e os outros dois passam. O supabase e' um construtor falso que
  conta as consultas de lista, e a carga inicial prova que a contagem sabe achar uma.
  De 1864 para 1867 no FIN-V2-REFRESH-02: entrou `src/hooks/useFinanceiroV2.notificacao.test.ts` (+3) —
  o parcelamento e a troca de favorecido no modal zootecnico, gravando por fora do hook, recarregam a
  instancia inscrita com os ULTIMOS filtros (a instancia carrega 2025 e depois 2026, e a recarga tem de
  repetir 2026), e a falha de cada gravacao nao notifica. PROVADO: sem as duas notificacoes, os dois
  casos de gravacao falham e o de falha passa.
  De 1867 para 1876 no OC-BOITEL-VALOR-01 A4: entrou `src/components/venda/custosDaVendaBoitel.test.ts`
  (+9), com os numeros do proto da Vera 7f7de76f e da RRCC da0b8577: qual linha alimenta adiantamento
  e despesas fora do boitel (realizado aplicado x rascunho — o numero muda, o que prova a troca de
  fonte), o realizado que ZERA as despesas da RRCC, o seletor de lado ainda valendo, o aviso do
  compromisso `pendente` e a recusa da principal no "+ Novo compromisso". O item 2 do A4 (cancelar o
  item zerado) nao tem teste porque nao foi implementado — ver o bloco A4.
  De 1876 para 1883 no A4b: entrou `src/components/compra/previsaoItemZerado.test.tsx` (+7), com a RRCC
  da0b8577 (frete 6.000 -> 0, compromisso 1e33fb64): o caso normal sem pergunta, o zerado aberto que
  pede confirmacao e cancela com o motivo fixo e a versao encadeada, o zerado programado que vai para
  as bloqueadas sem pergunta, o zerado sem compromisso, e a confirmacao listando componente e valor
  do cancelado e do gerado — sem campo de motivo — com "Voltar" que nao confirma.
  De 1883 para 1890 no OC-MOTIVO-UNICO-01: entrou `src/lib/oc/desfazerCompromisso.test.ts` (+7), com a
  trilha real do 0fdec0eb como molde (parcela ba90d4c8, programacao d7182dd1, 848.713,32, versao 14):
  a cadeia completa com UM motivo e UM `estorno_id` nas tres chamadas e a versao pelo retorno; so'
  programado pula o estorno; so' aberto vai direto ao cancelamento; a retomada depois de falha no meio
  pula o nivel ja' desfeito com o mesmo id; a recusa E3 para e diz feito e falta; "ja' desfeito" do
  banco e' idempotencia; motivo vazio nao executa nada. O banco falso tem as mesmas guardas de ordem, e
  o teste falha se a cadeia pular um nivel.
  De 1890 para 1899 no ATALHOS-PRODUCAO-01: entrou `src/v2/lib/atalhosProducao.test.tsx` (+9) — o atalho
  so' nas tres secoes de Producao e ausente nas outras, a ativa marcada com o navy, o clique devolvendo a
  secao certa, a barra sem atalho igual a' de antes, a regra de limpar os `oc_*` na SAIDA de "Lancar
  movimentacao" (e so' nela), o limpador tirando os seis e deixando o periodo, e a Lista sem o aviso de
  OCs — este lido da FONTE, porque montar a Lista inteira exige a pilha do rebanho.
  De 1899 para 1908 no VINCULAR-LANC-OC-01: entrou `src/components/financeiro-v2/vincularOperacao.test.tsx`
  (+9), com os casos provados em rollback no proto: a acao so' aparece onde o banco aceitaria (subcentro no
  mapa, sem parte, nao cancelado), a OC de valor identico em 1o e ja' selecionada (Vera 57f5ce96 x 02be1a41),
  nenhuma pre-selecao sem valor exato, a linha de titulo conciliado nao selecionavel com os dois titulos no
  `title` (SR c76720c3 x bb51bb9a), a lista de "escolher compromisso" indo para a simulacao e ficando na tela
  depois da escolha, o resumo com o dobro de rebanho em vermelho e a diferenca do principal em ambar (Vera
  010db5b2 x 2d39d7e9), motivo vazio bloqueando, e o sucesso avisando a lista — a falha, nao.
  ⚠ A RPC E' MOCKADA: a regra mora no banco e foi provada la'. O arquivo trava o que a TELA faz com a resposta.
  De 1908 para 1914 no OC-FAZENDA-GLOBAL-01: entrou
  `src/components/operacao-comercial/central/centralFazendaGlobal.test.tsx` (+6) — a Central segue o seletor
  lateral: Global mostra todas (inclusive a OC sem fazenda), fazenda escolhida so' as dela, coluna Faz so' em
  Global, o resumo com o nome da fazenda do seletor, `f_fazenda` de link antigo ignorado e removido sem tocar
  o seletor, e a troca de fazenda voltando para a pagina 1 (a montagem nao zera).
  ⚠ PROVADO: com o filtro de fazenda desligado, 3 dos 6 caem pela razao certa.
  ⚠ BrowserRouter + `history`, nao MemoryRouter: `useFiltroUrl` le' `window.location.search` na escrita, e o
  MemoryRouter nao o move — toda escrita pareceria "nada mudou" e o teste de pagina passaria a falhar calado.
  De 1914 para 1924 no FIN-V2-CANCEL-MOTIVO-01, em dois arquivos novos. `src/hooks/useFinanceiroV2.cancelMotivo.test.ts`
  (+6): o individual recusa motivo vazio e so' espacos, recusa titulo com parte viva de OC, e grava motivo
  aparado + autor; o lote sem motivo nao grava, com motivo grava motivo + autor e PULA os titulos de OC
  devolvendo quais (os ids do fixture sao e8032b0d e f489abd9), e as duas funcoes sem chamador sumiram do hook.
  `src/components/financeiro-v2/cancelTituloOC.test.tsx` (+4): o rodape com o aviso e o "Abrir OC" no lugar do
  botao, a precedencia OC > rebanho > botao, e o "Atualizar compromisso" com o motivo da reabertura
  pre-preenchido em ambar, editavel (editar tira a marca e grava o editado) — e a compra com o campo vazio.
  ⚠ PROVADO: com as travas do hook, a separacao do lote, o rodape e a semente do motivo desligados, 6 dos 10
  caem; os 4 que ficam verdes sao os de controle (gravacao com motivo, compra vazia, funcoes removidas) e o
  do lote sem motivo, cuja trava nao entrou na mutacao.
  De 1924 para 1940 no OC-DESVINCULAR-01, em quatro arquivos novos. `src/lib/oc/desvincularLancamento.test.ts` (+7):
  o resumo lido da simulacao (parcela unica cancela, varias reduzem, reclassificacao com fazenda/safra/DRE que
  a conta arrasta, conciliacao "mantida") e quando o gesto aparece (so' titulo VIVO no menu da linha — o orfao
  fica fora —, compromisso cancelado nada, Financeiro V2 so' com parte viva). `desvincularOperacao.test.tsx`
  (+5): simula ao abrir sem gravar, o seletor filtra pela direcao, escolher a conta re-simula com a CHAVE do
  plano e "manter a atual" volta, grava com a versao da simulacao e avisa a lista, a falha nao avisa.
  `useFinanceiroV2.desvinculo.test.ts` (+2): parte cancelada libera o subcentro, parte viva continua travando.
  `desfazerTituloCancelado.test.ts` (+2): a cadeia do Desfazer passa pela Graxaria (titulo ja' cancelado) e
  para no titulo vivo realizado — com banco falso aplicando a regra do D2, provada de verdade em rollback.
  ⚠ PROVADO: com o filtro `cancelada` do hook, a chave do plano no dialogo, o criterio de titulo vivo e o ramo
  "reduzido" desligados, 5 casos caem, um por mutacao, pela razao certa.
  De 1940 para 1951 no OC-LIQ-SINAL-01, em dois arquivos novos. `src/v2/lib/ocResumo.lado.test.ts` (+7): o Resumo
  pelo lado com os numeros do proto (c80ebe9e: 107.367,46 / 102.311,46 / despesas 5.772,83, e NAO os 113.140,29 /
  108.084,29 de antes; b58bf556: nada recebido, adiantamento nas despesas), compra sem mudanca de sentido, OC
  sem compromisso no caminho antigo, e os totais. `resumoDespesas.test.tsx` (+4): previa, PDF (venda e compra) e
  Excel com a coluna Despesas e os rotulos por lado — jsPDF/autotable/xlsx trocados por espioes.
  ⚠ PROVADO: com o Resumo voltando a somar os dois lados e sem "Despesas" no PDF, 4 casos caem.
  De 1951 para 1965 no OC-STATUS-LADO-01. `src/lib/oc/estadoPeloLado.test.ts` (+7): as 8 OCs com os numeros da
  view aplicada (sete mudaram de estado; quatro com despesa pendente; "Paga X%" pelo lado; filtro), e a
  parcela de que lado — compra no espelho. `src/v2/lib/ocResumo.parcelas.test.ts` (+2): o frete de 744c520e
  sai de "Falta receber" para as despesas; a compra no espelho. `centralDespesasPendentes.test.tsx` (+3): a
  marca ambar so' onde ha' despesa, o estado do lado na pilula, e o filtro pela URL (`f_liq`).
  `resumoDespesas.test.tsx` foi de 4 para 6 — a lista/PDF/Excel das despesas em aberto e a lista ausente sem
  elas; as quatro fixtures antigas ganharam `despesasEmAberto: []` (o contrato do bloco mudou).
  ⚠ PROVADO: sem a marca, sem a separacao de lado e com o filtro aceitando tudo, 8 casos caem.
  De 1965 para 1976 no OC-DOC-ESPECIE-01: entrou `src/hooks/useLancamentoDocumentos.especie.test.ts` (+11) —
  as cinco especies criadas com arquivo num gesto so' (com a API capturada ANTES do clique, como o
  formulario), editar trocando a especie e anexando, o destino OC (bucket `oc-documentos`, so' `url`), a
  edicao do documento da OC preservando `nf_complementar`, o cancelar indo ao writer da OC, a leitura de
  `nf_principal` como "NF", e a guarda do banco falso — que RECUSA especie no anexo e na edicao de
  documento da OC.
  ⚠ PROVADO: com o anexo lendo a especie da lista 6 casos caem; sem a traducao da leitura, 1; sem
    `origemDoDocumento` nas dependencias, 2; com o arquivo da OC no bucket do lancamento, 1.
  De 1976 para 1983 no VINCULAR-FIX-01. `src/components/financeiro-v2/vincularOperacao.test.tsx` foi de 9 para 13 — a
  linha da candidata (o Iagro f93f1a2b, com fazenda e cab, sem "OC de"; boitel e ausencias) e o compromisso a
  compromisso (a Graxaria: o exato de outro componente vence e vai para a simulacao; um pago so' bloqueia se forem
  todos). Dois casos existentes foram atualizados ao contrato novo, nunca afrouxados: o da OC conciliada ganhou
  `todos_liquidados: true` (e' o banco que diz agora), e o de "escolher compromisso" deixou de ter compromisso exato
  (com um exato, ele ja' vai escolhido e a RPC nao pergunta). Entrou `src/hooks/useLancamentosComOC.test.ts` (+3): o
  vinculado tem icone e o desvinculado nao, o icone some quando a parte cancela e a notificacao chega, o tooltip pelo
  tipo. A direcao, a janela do boitel e o hash sao regra de banco, provados em rollback (bloco VINCULAR-FIX-01).
  ⚠ PROVADO: sem o filtro de parte viva, sem o "exato vence", com um pago bloqueando, com a linha no `rotuloOC` e com
    o tooltip fixo, cada mutacao derruba 1 ou 2 casos.
  De 1983 para 1985 no VINCULAR-FIX-01b: `vincularOperacao.test.tsx` foi de 13 para 15 — a regra (c) com o Iagro
  (ambar, simula criando, o resumo avisa "Já existe Taxas e Impostos de R$ 541,84 liquidado nesta OC; este é outro
  pagamento" e o Vincular grava) e os tres iguais (dois pagos do mesmo valor nao bloqueiam; com um livre, ele vai
  primeiro). ⚠ DOIS CASOS QUE ESPERAVAM BLOQUEIO mudaram de contrato, nunca afrouxados: "(c) linha vermelha, nao
  selecionavel" (OC bb51bb9a, titulo conciliado) virou ambar "criar novo" que seleciona e simula, e "so' TODOS pagos
  bloqueiam" virou "pago nunca bloqueia". PROVADO: com o item pago voltando a bloquear, 4 casos caem; sem o texto do
  aviso, 1. A regra do banco (criar com aviso, tres iguais, janela do boitel) esta' provada em rollback.
  De 1985 para 1986 no VINCULAR-FIX-01c: `vincularOperacao.test.tsx` foi de 15 para 16 — entrou o item 0 (a OC SEM
  compromisso do item continua candidata, "criar item" neutro, e simula). ⚠ QUATRO CASOS DO 01b MUDARAM DE CONTRATO,
  nunca afrouxados: o "(c) item todo pago", o "pago nunca bloqueia", o do Iagro e o dos tres iguais cobravam o ambar
  "criar novo" e o aviso "Já existe ... outro pagamento"; agora cobram o neutro "criar item" e a AUSENCIA do aviso
  (`[data-aviso]` nulo e o texto fora do resumo). PROVADO: com "criar item" ambar ou vermelho, 5 casos caem.
  De 1986 para 1994 no OC-BOITEL-REALIZADO-UX-01: entrou `src/components/venda/realizadoPorBloco.test.tsx` (+8) —
  `faltamDoRealizado` (a semente copiada da projecao nao tem fato; zero continua faltando; a frase com bloco e campo)
  e o Aplicar do bloco do realizado (com pendencia nao fecha nem devolve, marca SO' os campos do bloco e foca o
  primeiro; a marca e' viva; bloco completo devolve e fecha mesmo com o outro bloco pendente; fato vazio aparece vazio,
  nunca "R$ 0,00"; a projecao nao valida nada). As quatro derivacoes e a recusa por fato sao regra de BANCO e estao em
  `supabase/tests/oc_boitel_realizado_ux_01_test.sql`, rodado em rollback contra a funcao aplicada (termina em `OK`).
  ⚠ PROVADO: com a validacao do Aplicar desligada, 3 casos caem; com o valor do abate voltando a mostrar a projecao, 1.
  De 1994 para 1998 no OC-BOITEL-REALIZADO-UX-01b: `realizadoPorBloco.test.tsx` foi de 8 para 12 — `realizadoNaoSalvo`
  (abrir e fechar sem tocar nao avisa: mesmo objeto da carga, sem realizado, copia identica; sujo avisa; depois do Salvar
  nao avisa) e a ligacao no fechamento, lida da FONTE: `fecharModalOCComAutosave` pergunta ANTES do `fecharModalOC()`.
  ⚠ PROVADO: sem a linha do gatilho, 1 caso cai; com a comparacao quebrada, 1.
  De 1998 para 2004 no OC-BOITEL-REALIZADO-UX-01c: entrou `src/lib/oc/gravarRealizadoBoitel.test.ts` (+6) — o id do
  lote vem do BANCO depois do Salvar dos lotes (OC nova: o lote nasce no mesmo Salvar e o revalorar recebe o id dele),
  OC com lote existente igual, sem lote NAO diz "lancado", falhas de leitura/revalorar/boitel voltam erro, e sem liquido
  positivo o comportamento de antes. ⚠ PROVADO: com "sem lote" voltando a dizer lancado, 1 caso cai.
  De 2004 para 2011 no BOITEL-ABATE-PRODUTOR-01 (B-01): entrou `src/components/venda/previsaoBoitel.test.ts` (+6) — a
  previsao da A de sempre (e o frigorifico gravado nao muda nada nela), a B com acerto_boitel (1155, boitel) ANTES do
  principal (1150, frigorifico) nos numeros da 77d963be, sem "a receber do boitel" nem adiantamento, um centavo de
  divergencia segurando o principal com a frase no botao, e o resumo da B; `realizadoPorBloco.test.tsx` foi de 12 para 13
  (na B o bloco Comercializacao cobra o Frigorifico). ⚠ PROVADO: com o ramo B da previsao desligado, 3 casos caem.
  De 2011 para 2014 no BOITEL-ABATE-PRODUTOR-01b: `realizadoPorBloco.test.tsx` foi de 13 para 16 — o dialogo
  Comercializacao na A x B: a B esconde o Adiantamento e a A o mostra; o rodape da B ("(+) Recebido do frigorifico",
  "(−) Pago ao boitel", "(=) Liquido", "Boleto do boitel (papel)") contra o da A ("= A repassar pelo boitel"); e a opcao
  do Frigorifico com a paleta do combobox da casa (texto claro, sem `bg-card`). ⚠ PROVADO: com o Adiantamento forcado
  visivel na B, 1 caso cai.
  De 2014 para 2020 no BOITEL-ABATE-PRODUTOR-01c: entrou `src/components/venda/gerarCompromissosProdutor.test.tsx` (+6) —
  o "Gerar compromissos" na B le as MESMAS linhas da previsao (acerto 1155 do boitel antes do recebimento 1150 do
  frigorifico, cada proposta conferida contra a linha de `linhasPrevisaoBoitel`), a A devolve `undefined`, o dialogo da B
  com sentido e favorecido por linha e "Gerar 2 compromissos", o centavo que APARECE, o bloqueio que trava e a ordem da
  gravacao, e o dialogo da A como sempre. ⚠ PROVADO: com o modo por linha desligado, 3 casos caem; e o HTML do dialogo
  na A, na compra, no abate com obrigacao e vazio e' IDENTICO ao do HEAD (6 de 6 casos, teste descartavel).
  De 2020 para 2029 no OC-EDITAR-CADASTRAL-01: entrou `src/lib/oc/edicaoCadastralOC.test.tsx` (+9) — o caminho do Salvar
  pelo status (fechada -> editar_dados, cancelada -> nada), o filtro que so' deixa passar contraparte, observacoes e NF,
  a venda e o abate FECHADOS renderizados (data, fazenda e tipo travados; comprador e observacao livres; o Salvar grava e
  o P1 nao o trava; o erro ao lado) e ABERTOS como sempre, e o "Lancar realizado" do boitel que continua com a OC fechada.
  ⚠ PROVADO: com o `fechada` da venda desligado, 2 casos caem; sem a excecao do "Lancar realizado", 1.
  De 2029 para 2041 no DRE-MODAL-VALOR-01b, em dois arquivos. `src/pages/pecDrePanel.test.tsx` (45 -> 49): o botao
  "Rateio nos grupos" nao muda o custo fixo total nem o Lucro operacional nos dois modos (numeros do NJ 25/26 medidos no
  banco), ligado cada grupo soma o seu rateio e o Financeiro vira filha "so rateio adm." com a soma das filhas fechando na
  mae, desligado exatamente como antes, e a celula levando os numeros dela no clique. `rateioDetalheModal.test.tsx`
  (16 -> 24): os 8 casos das funcoes puras FICARAM; os 8 de render do modal antigo (tres abas, donuts) SAIRAM com ele e
  entraram 16 — `ratearNoAlvo`, a soma das linhas = a celula na lavoura e na pecuaria (grupo, so rateio, bloco sem rateio),
  as etapas da aba Rateio, o rodape, e a ordenacao estavel. ⚠ PROVADO: com o rateio fora de `valorDaFilha` 1 caso cai; com
  as linhas de rateio sem `ratearNoAlvo`, 3.
  De 2041 para 2047 no BOITEL-ABATE-PRODUTOR-01d: entrou `src/lib/financeiro/validacaoLancamento.test.tsx` (+6) — a
  saida no 1155 passa (e, sem o tipo do plano, a macro recusa como antes: a busca sabe achar), a entrada no 1155 recusa no
  campo Subcentro com a frase da tela, receita 1150 e custo seguem nos dois sentidos, o PLANO MEDIDO (226 linhas x 3
  tipos) contra a regra antiga copiada — so' os dois pares do 1155 mudam —, a chave ganhando do texto, e a frase como
  alerta embaixo do Subcentro. ⚠ PROVADO: com o tipo do plano ignorado, 4 casos caem.
  De 2047 para 2059 no OC-RECLASSIFICAR-ITEM-01, em dois arquivos novos. `src/components/financeiro-v2/reclassificarItem.test.tsx`
  (+10): o seletor recebe a direcao do item e o 5030 pede o componente ANTES de simular; a simulacao com o resumo do DRE
  ("Hoje fora do DRE → passa a entrar em Deduções: o resultado do período cai R$ 6.000,00"); sem motivo nao grava, com
  motivo grava e avisa a lista; recusa da gravacao ao lado do botao e da simulacao no aside; o texto do DRE (fora/dentro,
  troca de linha, investimento fora do resultado) e as opcoes de componente; a volta do drill (`origemDaVolta`) e, lido da
  FONTE, o `retornarDoDrill` com a origem e o `setDrillReturn(null)` antes de sair pelo link.
  `src/components/venda/abaInicialOC.test.tsx` (+2): venda e abate abrem na aba de `?oc_aba`, e sem ela na identificacao.
  ⚠ PROVADO: sem a guarda do componente, com o investimento dentro do resultado e sem a limpeza do `drillReturn`, 4 casos
  caem; com a venda ignorando a aba, 1.
  De 2059 para 2064 no MODAIS-PADRAO-01f: entrou `src/components/reclassificacaoCenario.test.tsx` (+5) — o cenario do Evoluir
  categoria nasce do caminho: meta grava `statusOperacional` null sem clique, realizado grava 'realizado', sem caminho segue
  realizado, o mesmo preenchimento nos dois cenarios difere SO' em `statusOperacional` (os outros campos comparados um a um),
  e o formulario nao oferece mais Realizado/Meta (com o titulo presente, provando que a busca sabe achar).
  De 2064 para 2069 no DRE-RESUMIDO-CUSTEIO-01: `src/pages/pecDrePanel.test.tsx` foi de 49 para 54 casos — VBP − Custeio =
  Lucro operacional ao centavo com o rateio ligado e desligado (numeros do RRCC 2021 do mock), o Custeio nascendo fechado e
  abrindo as duas filhas (que abrem os centros), a sublinha "por hectare" do VBP e do Custeio no fundo da linha de cima e sem %
  do VBP, as cores pelo sinal (e o Detalhado ainda azul), e o Custeio sem modal nem historico. ⚠ SEIS CASOS EXISTENTES
  mudaram de contrato, nunca afrouxados: os do custo fixo do Resumido passaram a abrir o Custeio antes (ele mora dentro), e
  "sao quinze linhas" passou a contar as defs fora do grupo em `LINHAS_PEC_RESUMIDO_GRADE`.
  De 2069 para 2073 no DRE-MODAL-REFRESH-01: entrou `src/components/agri/modalValorRefresh.test.tsx` (+4) — editar a descricao
  atualiza a linha sem perder aba nem ordenacao; reclassificar para outro grupo tira as linhas (direta e de rateio) e os cards vem do
  DRE relido (600/150/750, nao a foto 1.000/200/1.200); so' salvar uma edicao rele (falha e criacao nao); e a celula relida e'
  IDENTICA a' que a grade manda no clique, em 10+ celulas por estado, com o rateio nos grupos ligado e desligado.
  ⚠ PROVADO: com os cards voltando a ler a foto do clique, o caso da reclassificacao cai pela razao certa.
  De 2073 para 2092 no TRANSF-FAZENDA-ORIGEM-01: entrou `src/components/fazendaDoFormulario.test.tsx` (+19) — as regras puras
  (Global nasce vazio e a sentinela nunca vira valor; filtro numa fazenda nasce com ela; Destino = todas menos a Origem; Origem
  igual ao Destino limpa o Destino; a guarda deixa de recusar em Global com a fazenda escolhida e o vazio e' "falta", nunca
  "global"), a ligacao da Transferencia e do Consumo no `LancamentosTab` lida da FONTE (ele nao se monta em teste) e a Evoluir
  categoria montada de verdade (campo vazio, vermelho e com TODAS as fazendas; preenchido e trocavel; travado na edicao; sem
  fazenda nao grava, com ela o payload leva a escolhida; sem `exigeFazenda` o Fechamento segue igual).
  ⚠ PROVADO: com o Destino sem filtrar a Origem 1 caso cai; sem a fazenda no `motivoBloqueio`, 1.
  De 2092 para 2103 no FIN-FAZENDA-PADRAO-01: entrou `src/components/financeiro-v2/fazendaFinanceiro.test.tsx` (+11) — o
  `FazendaSelect` com `obrigatorio` montado de verdade (vazio vermelho com a frase; preenchido troca e lista todas menos a
  sentinela; sem a prop nada muda; Administrativo forcado preenche e nao acusa falta), o Modo rapido montado (lote vazio em
  Global, com a do filtro fora dele; a guarda antes de validar e de gravar, lida da fonte) e, na FONTE, o novo lancamento, a
  Mesa e o dialogo (vazio em "todas"/Global, prefill do Excel vencendo, edicao com a gravada, guarda antes do simples e do
  parcelado, toast do parcelado fora). ⚠ PROVADO: com o `fazOperacionais[0]` de volta no novo lancamento, 1 caso cai.
  De 2103 para 2116 no DRE-MODAL-SUBCENTRO-01, em dois arquivos novos. `src/components/agri/quadroSubcentro.test.tsx` (+12): a
  LEI do quadro (soma = cartoes ao centavo, com rateio e so' direto, Pecuaria e Lavoura), a ordem pelo Total, a regra do sinal, e o
  modal montado (linha de Total com os numeros dos cartoes, "—" onde o subcentro nao tem linha do tipo, filtro com selo e rodape, x
  e segundo clique voltando a todos, coluna de rateio sumindo em "Direto", rotulo "Rateio adm."/"Rateio", Subcentro da lista
  ordenando com a ausencia no fim, e o refresh apos salvar desfazendo o filtro que ficou vazio). `src/hooks/useRateioAdmPec.subcentro.test.tsx`
  (+1): o hook repassa o subcentro da RPC. ⚠ ESTE NASCEU DE UM DEFEITO VISTO NA TELA com a suite verde (ver o bloco).
  Dois casos existentes mudaram de contrato, nunca afrouxados: as colunas ordenaveis passaram de 7 para 8 (entrou Subcentro) e o
  helper `descricoes()` do `modalValorRefresh.test.tsx` deixou de achar a descricao por `span.truncate` (a reticencia saiu) e passou a
  ignorar o tbody do quadro. ⚠ PROVADO: com o subcentro nulo fora da soma, 3 casos caem; sem o campo no mapa do hook, 1.
  De 2116 para 2137 no DRE-CASCATA-MODAL-01: entrou `src/components/agri/pecLeituraAnos.test.tsx` (+21). O caso que justifica
  o arquivo e' o da EXTRACAO: o corpo antigo da `PecCascataView` (HEAD a607b1d2) copiado no teste da' os MESMOS @ desfrutada,
  R$/@ do desfrute, R$/@ da reposicao e agio que `indicadoresDoAno` em NJ 2025, SR 2021 e RRCC 2021 (numeros do banco). Os
  outros travam o custeio COM rateio (e que sem ele o custo por @ seria outro), o RRCC 2021 sem cache em traco com o preco
  presente, a compra sem reposicao em traco, a ponte fechando em @ e em cab com a diferenca aparecendo so' quando nao e' zero,
  a producao so' em @ (e em traco sem `at_produzida`), o GMD pela funcao oficial sobre os meses do periodo, o "8m" so' nos
  valores do periodo, o aviso do GMD no ano parcial e as cores do agio e da variacao do custo.
  ⚠ PROVADO: com o custeio sem o rateio 2 casos caem; com a diferenca escondida, 3; com a marca "8m" ignorada, 1; com o agio
    pelo sinal comum, 1.
  De 2137 para 2141 no RATEIO-VIGENCIA-01: `src/components/agri/rateioDetalheModal.test.tsx` foi de 24 para 28 casos — a etapa
  "Nao alocado" da aba Rateio: na pecuaria sem grupo ela fecha a aba depois das fazendas, nivel 0, com motivo e valor; num grupo
  ela NAO aparece (a RPC nao abre o nao alocado por grupo, e o caso prova que a busca sabe achar a etapa vizinha); zero, meio
  centavo, nulo ou payload antigo nao desenham a linha; e na lavoura admin ela vem depois das culturas e o modal a mostra.
  ⚠ PROVADO: com a linha da pecuaria desligada, 1 caso cai pela razao certa.
  De 2141 para 2161 no OC-VENDA-ENTREGAS-01a, em quatro arquivos novos. `src/components/venda/entregasVenda.test.tsx` (+10): as
  regras puras da entrega por saida (uma linha por saida ATIVA, a pendente, a estornada fora; o preco do contrato; o "Enviar
  todos" so' com saldo e a data vazia cobrada por linha) e a tabela (selo "adotada · id", valor da SAIDA em verde, nada
  truncado, cabecalhos centralizados; registrada com "estornar" e adotada com "desvincular"; a recusa do banco ao lado; o
  seletor que so' oferece o que `oc_saidas_adotaveis` devolveu, cobra a selecao vazia e adota a marcada; e o "Enviar todos"
  com uma data por lote, vazia em vermelho). `src/hooks/useOperacaoRecebimento.adocao.test.ts` (+5): origem, valor e contrato
  lidos; varias adocoes encadeando a versao DEVOLVIDA (o banco falso recusa versao velha); selecao vazia sem banco; desvincular
  e a lista; o `receberTodos` com e sem datas. `src/hooks/compraLotesTotais.test.ts` (+2): o total da Negociacao da 232c05aa e'
  2.366.601,26 (o do banco) e NAO 2.366.601,25; meio centavo como o ROUND do Postgres. `src/components/compra/excluirLoteDialogo.test.tsx`
  (+3): o dialogo da lixeira continua aberto quando o pai re-renderiza, a frase da saida adotada sem botao nem dica de
  conciliacao, e a dica quando o bloqueio e' conciliado.
  ⚠ PROVADO: com a versao do render no lugar da devolvida 1 caso cai; sem a trava da selecao vazia, 1; com o `NegociacaoOC`
    aninhado de volta (o arquivo de antes), o caso do re-render cai.
  De 2161 para 2181 no OC-VENDA-ENTREGAS-01b, em quatro arquivos novos. `src/lib/oc/contaCorrente.test.ts` (+6): a 232c05aa real
  (saldo 1.357,89 'ele deve', "Recebimento 2 de 4"), D6 (recebimento sem conta bancaria nunca vira conciliado) e os tres saldos
  do briefing — ADIANTAMENTO (dinheiro antes do gado), PARCIAL (sem saldo final a explicar) e A MAIS — mais o quitado em 0,00.
  `src/lib/financeiro/totaisDaListaV2.test.ts` (+5): a entrega fora das Entradas de caixa, o recebimento no caixa, a soma dos
  cinco baldes = a soma das linhas (nada contado duas vezes), a referencia da RPC com o mesmo corte, Tipo/"Vai para", e o filtro
  do sem caixa no Contas a Pagar e Receber lido da fonte. `src/lib/financeiro/subcentroVendaEspelho.test.ts` (+3): o
  `_oc_subcentro_venda` da migration contra `POR_CATEGORIA`, par a par (13). `src/components/venda/abaContaCorrente.test.tsx`
  (+6): colunas do DRE x caixa, status do dado, saldo final so' com entregas concluidas, "Atualizar entregas" com a recusa ao
  lado, motivo obrigatorio do vincular e somente leitura. Um caso existente de `listaPaginadaV2.test.ts` mudou de contrato
  (compara os quatro totais, nao dois) e a projecao da view foi de 44 para 46 colunas — nunca afrouxados.
  De 2181 para 2191 no OC-VENDA-ENTREGAS-01c, nos dois arquivos da conta corrente, que mudaram de CONTRATO (o sinal virou o
  do caixa da fazenda). `src/lib/oc/contaCorrente.test.ts` (6 -> 9): sairam os casos de `colunasDoSaldo`,
  `cartoesDaContaCorrente` e `saldoFinalAExplicar` (morreram com as funcoes — a coluna dupla "Ele deve | Adiantado" virou o
  Saldo unico) e entraram o sinal do saldo, a combinacao ate zerar (ajuste 1.000 + permuta 357,89 da 232c05aa, em centavos),
  o explicado pelo banco e o padrao de data/conta. `src/components/venda/abaContaCorrente.test.tsx` (6 -> 13): o extrato
  (entrega negativa vermelha, recebimento positivo verde, saldo corrido), o sinal no card e no Total nos tres estados, o
  dialogo "Explicar diferenca" (dois descontos zerando, motivo vermelho, recusa ao lado, desfazer com motivo), o programar
  recebimento, o cancelar listando o rol (e travado pelo bloqueio) e o resumo lateral lido da FONTE.
  ⚠ PROVADO: com o sinal de `corDoSaldo` invertido 5 casos caem; sem a trava do motivo na explicacao, 1.
  De 2191 para 2197 no OC-VENDA-ENTREGAS-01d, em dois arquivos novos. `src/lib/oc/rotuloCategoriaEspelho.test.ts` (+2): o
  `_oc_rotulo_categoria` da migration contra `CATEGORIAS`, par a par (9), o codigo fora da lista voltando como veio e a descricao
  da entrega passando pelo rotulo nas duas escritas. `src/hooks/useOcContaCorrente.lotes.test.ts` (+4): explicar e desfazer releem
  os lotes, a recusa no meio da cadeia tambem rele (o item anterior ja' gravou) e o shell passa a releitura (lido da fonte).
  ⚠ PROVADO: sem a releitura no hook, 3 dos 4 caem.
  De 2197 para 2205 no FIN-V2-SEM-CAIXA-01, em dois arquivos novos. `src/lib/financeiro/siglaCategoriaEspelho.test.ts` (+3): o
  `_oc_sigla_categoria` da migration contra `siglaCategoria`, par a par (9), o mesmo fallback fora do mapa e a descricao
  "Venda <cab:3> <sigla>" sem truncar acima de 999. `src/components/financeiro-v2/secaoSemCaixa.test.tsx` (+5): o filtro de caixa
  no plano da lista ('com' traz so' caixa com o nulo como caixa, 'sem' so' os sem caixa, ausente os dois), a secao (uma informacao
  por coluna, Cab das entregas, conta pelo nome de exibicao, OC clicavel, sem checkbox), o total em centavos com o sinal, a celula
  OC e o rotulo das contas de adiantamento. ⚠ DOIS CASOS EXISTENTES MUDARAM DE CONTRATO, nunca afrouxados: o de
  `totaisDaListaV2.test.ts` que cobrava a coluna Tipo e os cinco totais passou a cobrar a coluna OC, o topo so' com dinheiro e o
  total sem caixa so' dentro da chave (sai `tipoDaLinha`, que morreu com a coluna); e o do cancelar em `abaContaCorrente.test.tsx`
  passou a ler "Recebimento de vendas" no lugar de "Adiantamento de Clientes". ⚠ PROVADO: com o filtro 'com' desligado no plano, 1
  caso cai.
  De 2205 para 2221 no OC-CRIAR-DO-LEGADO-01, em dois arquivos novos. `src/lib/oc/criarDoLegado.test.ts` (+9): quando a acao aparece (e
  cada recusa a tira, boitel inclusive), as cabecas lidas da descricao (nao a parcela nem o ano), o pre-marcado unico (200 + 115 = 315),
  ambiguo e nenhum sem marca, a irma "2/2" primeiro, e o envelope com o rateio fechando em centavos no total. `src/components/financeiro-v2/
  criarOCDoLegado.test.tsx` (+7), com a RPC mockada: comprador e saidas preenchidos e os argumentos da simulacao, a previa ("Recebimento de
  vendas", entrega negativa vermelha, recebimento verde, saldo 0,00, R$/kg), as pendencias juntas com o Criar travado, desmarcar e trocar o
  criterio refazendo a simulacao, "Somar" a irma, criar com os MESMOS argumentos da previa e `p_simular = false`, e a recusa ao lado.
  ⚠ PROVADO: sem o pre-marcado 2 casos caem; sem o rotulo, 1; so' a primeira pendencia, 1.
  De 2221 para 2233 no OC-CONTA-CORRENTE-TODOS-01a, em dois arquivos novos. `src/hooks/subcentroCompraEspelho.test.ts` (+3): o
  `_oc_subcentro_compra` da migration contra `subcentroCompraPorCategoria`, categoria a categoria (9), nenhum palpite fora do enum e as
  regras por tipo da compra (verbo, direcao, conta do dinheiro, conta da entrada). `src/components/venda/contaCorrenteCompra.test.tsx`
  (+9), com os numeros da 1337bb2d: o extrato da compra (entrada positiva verde, pagamento negativo vermelho, "Pagamento 1 de 1",
  "Pagamento de compras", totais e cards pelo lado), o quadro de despesas fora do saldo, a situacao (falta pagar / adiantado ao
  fornecedor / quitado), o explicar com os tres tipos da compra e o efeito espelho, o cancelar com as palavras da compra e a entrega que
  adota ENTRADA; e tres SNAPSHOTS DA VENDA (aba, entrega e cancelar da 232c05aa) gerados contra o codigo de ANTES do PR (HEAD 741cd800) e
  conferidos byte a byte com o de depois — o id automatico do Radix e' normalizado. Os testes de venda existentes NAO mudaram.
  ⚠ PROVADO: com os tipos da venda no dialogo da compra 1 caso cai; com o sinal da venda nos totais da compra, 1.
  De 2233 para 2236 no mesmo PR, com as decisoes do Gabriel: `contaCorrenteCompra.test.tsx` (9 -> 12) — a 3016 na migration e o rotulo
  "Devolução do fornecedor", o cancelar so' com compromisso 'recebimento' em todo tipo e a trava do `oc_cancelar`, e o `lerRol` das
  despesas (rol antigo sem a chave vira lista vazia). O caso do cancelar da compra passou a cobrar a secao "Ficam (pagas a terceiros)"
  (pago / em aberto) no lugar da frase do rodape; os fixtures de rol dos dois arquivos ganharam `despesas`. Os snapshots da venda nao mudaram.
  De 2236 para 2248 no OC-CC-CLASSIFICACAO-01: entrou `src/lib/oc/ccClassificacao.test.ts` (+10) — o TEXTO das duas migrations: a
  regra no gatilho e o recalculo pela parte, o gate nos quatro leitores (e a leitura de `lancamentos` intocada), o vincular sem trocar
  conta, o mapa de volta ao md5 de antes do 01b, programado e devolucao na conta da operacao, a conta bancaria pela direcao, e o dado
  (7 ids, hash e `editado_manual` do retrato, 3015/5005/5006 desativadas e nunca apagadas, guardas de chegada) — cada presenca com a
  ausencia do velho. `useLancamentosComOC.test.ts` (3 -> 5): a marca "fora do DRE · OC <codigo>" no tooltip e o espelho
  `parteForaDoDre` x `_oc_cc_fora_do_dre` em 9 pares componente/origem. ⚠ CASOS EXISTENTES MUDARAM DE CONTRATO, nunca afrouxados:
  os rotulos "Recebimento de vendas"/"Pagamento de compras"/"Devolução do fornecedor" (secaoSemCaixa, contaCorrenteCompra, criarOCDoLegado),
  o texto do cancelar (abaContaCorrente, contaCorrenteCompra), os fixtures em 3015/5005 (agora 1120/15020) e os DOIS SNAPSHOTS DA VENDA,
  REGERADOS — o diff deles e' so' conta 1120 no lugar de 3015, "Banco do Brasil" no lugar de "sem conta", status realizado e os
  textos novos do cancelar. ⚠ PROVADO: com o espelho ignorando a origem, 1 caso cai; com a seta do cancelar sempre ligada, 3.
  ⚠ A REGRA E' DE BANCO e foi provada la' (bloco OC-CC-CLASSIFICACAO-01); o vitest trava o texto, nao o comportamento.
  De 2248 para 2254 no FIN-V2-HOMOLOG-FIX-01: entrou `src/components/financeiro-v2/finV2HomologFix01.test.ts` (+6), lido da FONTE (a
  `FinanceiroV2Tab` e o `LancamentoV2Dialog` nao se montam em teste): a lista sem a coluna OC e com 15 colunas na linha vazia, o "..."
  fixo a' direita com fundo opaco, o "Abrir OC" so' na linha com OC, o botao do rodape do Editar pela MESMA regra e so' depois de ler a
  parte, e o patch do favorecido guardado por md5. Um caso de `totaisDaListaV2.test.ts` mudou de contrato, nunca afrouxado: cobrava a
  coluna OC e passou a afirmar a AUSENCIA dela. ⚠ "Sem rolagem a 1440" nao cabe no jsdom (nao faz layout): foi medido no navegador.
  Ao reduzir ou acrescentar, atualizar este numero no mesmo PR e dizer quais testes
  sairam ou entraram.

## CONTROLE NATIVO — bloco integral com a historia da baseline

- ⚠ CONTROLE NATIVO NUNCA — comando OFICIAL:
      npm run check:ui-nativo
  `<input type="date">` e `<select>` crus abrem o calendario e o menu do
  SISTEMA OPERACIONAL: outro idioma visual, outro formato de data por
  locale, outra fonte em cada maquina. Use `DatePicker` (com
  `size="compact"` quando a linha for densa) e `Select` de
  `@/components/ui`.
  ⚠ "NAO CABE EM 10px" NAO E' EXCECAO: ajusta-se o componente, nunca se
  volta ao nativo. Ja foi corrigido uma vez (PR-OC-DATA-PADRAO-01) e
  voltou na linha da parcela em 06/09 — por isso virou gate.
  ⚠ O GATE TEM BASELINE, como o TSC: 9 arquivos herdados (0 `type=date`,
  17 `<select>`). Eram 20 ate' 2026-09-10; o PR-BARRA-UNICA-01b tirou 2 —
  os seletores nativos de mes e ano da `AuditoriaBancariaSoberana`, que
  viraram o `SeletorPeriodo` compartilhado. Ela caiu de 3 para 1, e o
  ultimo saiu com o ARQUIVO no PR-REMOVE-AUDITORIA-BANCARIA-01 (2026-09-10):
  a tela inteira foi apagada porque o Espelho responde a mesma pergunta.
  ⚠ E ESSA E' A TERCEIRA MANEIRA DE UM NUMERO DE BASELINE CAIR, ao lado de
  consertar e de apagar codigo morto: a peca deixa de existir porque outra
  ja fazia o mesmo. Nao houve conserto de `<select>` nenhum aqui.
  ⚠ `type="date"` CHEGOU A ZERO no 136d — a frente [DATA-PADRAO-GLOBAL] esta'
  FECHADA para datas. O que resta na baseline sao 17 `<select>` nativos, em 9
  arquivos, e essa e' outra frente. Baseline de data em ZERO significa que
  qualquer `type="date"` novo REPROVA o PR, em qualquer arquivo — nao ha' mais
  heranca a proteger. Era 42 (46/25) e caiu para 39 sem que este numero fosse
  atualizado; o PR-PARC-05 tirou 3 `type=date` (1 do FinanciamentoDetalhe,
  que zerou e saiu da lista, e 2 do ModalBaixaParcela) e o 136a tirou o
  ultimo do ModalBaixaParcela, que saiu da lista tambem.
  Os tres numeros acima foram MEDIDOS com
  `node scripts/check-ui-nativo.mjs --baseline` sobre a arvore, nao herdados
  do texto anterior.
  ⚠ A VARREDURA E' FRENTE PROPRIA — [DATA-PADRAO-GLOBAL]. O 136a entregou o
  componente (mascara de digitacao, colagem dos quatro formatos, Esc,
  ArrowDown, faixa de ano) e o piloto; o 136b fez o lote financeiro (7
  arquivos) e apagou a pagina orfa `FinanciamentoCadastro.tsx` (3 de uma vez).
  O 136c ampliou a API do componente (`onKeyDown` do consumidor ANTES do
  interno, `data-*` repassados, `abrirComSeta`) e fechou o ModoRapidoGrid mais
  o lote compra/OC/zoot (10 arquivos, 15 ocorrencias). O 136d fechou os 14
  ultimos (10 arquivos) e acrescentou o repasse de `onFocus`. Falhar por eles pararia todo PR e o gate seria desligado
  na primeira semana — que e' como um gate morre. Ele acusa ocorrencia
  NOVA: arquivo fora da lista, ou arquivo da lista com MAIS do que a
  baseline. Reduzir e' sempre aceito; atualize a baseline no mesmo PR com
  `node scripts/check-ui-nativo.mjs --baseline`.
