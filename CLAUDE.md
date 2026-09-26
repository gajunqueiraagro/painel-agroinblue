# CLAUDE.md — AGROinBLUE proto

## Identidade e limites
- Repo: gajunqueiraagro/painel-agroinblue. Branch de trabalho: proto.
  git push origin proto — SEMPRE. main e prod são proibidos.
- Supabase proto: binbcdfbisgscrifztia. Producao (duttifnbxqtyyybjmouv):
  NUNCA tocar. Nao existe SUPABASE_DB_URL_PROTO no terminal — este
  ambiente NAO tem acesso de escrita ao banco proto.
- Papel: FASE 2 (executor). Investigacao (FASE 0) e briefing (FASE 1)
  acontecem no Claude Chat. Implementar SOMENTE o que o briefing pede.

## REGRA DE ANCORA (absoluta)
Se qualquer ancora do briefing (linha, string, estrutura, nome de
funcao/prop, localizacao de bloco) NAO corresponder ao estado real do
arquivo no disco: PARAR e reportar a divergencia. NUNCA adaptar,
interpretar ou "encontrar o lugar equivalente". A divergencia e
informacao valiosa — reportar exatamente o que esperava vs o que achou.

## CODIGO MOVIDO = COPIADO VERBATIM
Ao mover codigo entre arquivos, copiar byte a byte do estado atual do
disco. Proibido redigitar de memoria. Qualquer constante, tolerancia,
literal ou comentario alterado durante um "move sem mudanca de
comportamento" e falha grave. Verificacao: o diff do trecho movido
(origem vs destino) deve ser vazio.

## LER DO DISCO ANTES DE EDITAR
Antes de editar qualquer arquivo, ler o estado ATUAL no disco (cat /
Read tool). Nunca assumir conteudo com base em memoria da sessao ou do
briefing. Apos qualquer edicao propria, releitura antes de nova edicao
no mesmo arquivo.

## REVERT vs EDICAO CIRURGICA
- git revert: somente quando o briefing pede explicitamente "revert".
- Remocao de mudancas anteriores dentro de um PR novo: edicao cirurgica
  lendo o estado atual — nunca git revert no meio de trabalho novo.
- Nunca rebase, amend ou force push.

## GATES DE QUALIDADE
- TSC — comando OFICIAL do gate:
      npx tsc -p tsconfig.app.json --noEmit
  NAO usar `npx tsc --noEmit`: o tsconfig.json da raiz e solution-style
  (`"files": []` + `references`), entao esse comando compila ZERO arquivos,
  sai com codigo 0 e passa sempre. Era um gate vazio. O comando oficial
  varre os 671 arquivos .ts/.tsx em src/ e sai com codigo 2 enquanto
  houver erro.
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
  Como comparar antes (A) x depois (B), nesta ordem:
    1. CONTAGEM. B <= A, sempre. B > A reprova o PR.
    2. DIAGNOSTICOS. Comparar os conjuntos por
       `arquivo + codigo TS + mensagem`, IGNORANDO linha e coluna.
       Mero deslocamento de linha/coluna NAO e' regressao — e' o efeito
       normal de editar o arquivo.
    3. ARQUIVO TOCADO. Se o PR editou o arquivo, conferir semanticamente:
       o mesmo codigo TS com a mesma mensagem, ainda que em outra linha,
       e' o MESMO erro. Registrar o remapeamento no relatorio
       (ex.: "V2Index 606 -> 607, TS2322 inalterado").
       ⚠ E LER O ERRO, nao so' conferir que ele continua la'. Erro de baseline
       em arquivo TOCADO se le sempre: os dois TS2551 de `.catch` no
       PostgrestBuilder passaram meses na lista dizendo que treze chamadas de
       refresh de cache nunca eram despachadas, e ninguem leu porque "estava na
       baseline". Baseline e' divida conhecida, nao ruido a ignorar.
    4. ERRO NOVO. Qualquer par (arquivo, codigo, mensagem) que nao existia
       em A reprova o PR, mesmo que o total tenha caido.
    5. REDUZIR e' permitido e desejavel. Ao reduzir, atualizar este numero
       no mesmo PR e listar quais erros sairam.
  Rodar e REPORTAR o numero em TODO ciclo, sem excecao.
- PROVA DE IDENTIDADE REPORTA O TAMANHO DO CONJUNTO COMPARADO. "Zero divergencias" sem dizer
  QUANTAS linhas foram comparadas nao e' prova — e conjunto VAZIO e' prova INVALIDA, nao prova
  forte.
  ⚠ NASCE DE UM ERRO MEU, 24/09/2026, no CATEGORIA-DESCARTE-01. Reportei "6 periodos x 3 fazendas,
  zero divergencia em v_ini_p0/v_fim_p0/v_fim_p1" e o merge MUDOU o DRE do NJ civil 2020 (Lucro
  liquido 8.873.420,14 -> 8.873.657,32). A replica que eu comparei lia o P0 de
  `valor_rebanho_fechamento_itens` em dez/19 — mes em que NENHUMA fazenda do NJ tem fechamento.
  Comparei dois conjuntos VAZIOS e o `where` da divergencia nao devolveu linha nenhuma. Quem achou
  o defeito foi a homologacao na tela, nao a prova.
  ⚠ E' A MESMA LEI DO AUTO-TESTE DO `check:tdz` e do `check:hooks`, aplicada a prova de migration:
  antes de afirmar "nenhum", a busca tem de provar que sabe achar. Na pratica: contar as linhas dos
  DOIS lados, reprovar quando a contagem for zero, e preferir comparar a saida da RPC REAL a uma
  replica do SQL dela — a replica pode divergir justamente no ramo que importa.
- Zero-cast: proibido `as` / `as any` em codigo novo. Unica excecao:
  o idioma existente `(supabase as any).rpc`.
- Build verde obrigatorio antes de qualquer commit, e o comando e
      npm run build:proto
  NAO `npx vite build`: o guard de alvo do vite.config so' roda em
  `command === "serve"`, entao o build cru compila com env de PRODUCAO
  (duttifnbxqtyyybjmouv) sem avisar. O mesmo vale para servir a tela:
  `npm run preview` e' barrado pelo guard; use `npm run preview:proto`.
- CICLOS DE IMPORT — comando OFICIAL:
      npx madge --circular --extensions ts,tsx --ts-config tsconfig.app.json src/
  O `--ts-config` NAO e' opcional: sem ele o madge nao resolve o alias
  `@/`, pula 521 imports e devolve uma lista quase vazia — falso "esta
  limpo". Com ele: 1 warning (pdf.worker) e 23 ciclos conhecidos em
  2026-09-22 (eram 21 em 2026-09-06; o numero ficou parado, nao subiu num PR so'). Dois deles sao frente aberta [ABATE-CICLOS-MODAIS]:
  AbaLotesAbate <-> ModalNegociarLote (fecha em `BlocoResumoLote`) e
  AbaLotesAbate <-> ModalResumoLotes (fecha em `temNegociacao`). Ambos
  fecham em `export function` (hoisted), entao NAO produzem TDZ hoje —
  sao divida, nao P0.
  ⚠ E ESTE GATE NAO PEGA O DEFEITO QUE O MOTIVOU. A tela branca da aba
  Financeiro (ABATE-FIN-TELA-BRANCA, 2026-09-06) nao era ciclo nenhum:
  era `compromissos.some(c => ... entradaDoCompromisso(c))` no CORPO do
  componente chamando uma `const` declarada 91 linhas ABAIXO. `.some()`
  executa durante o render e a `const` ainda esta em TDZ; a aba inteira
  caia com "Cannot access 'xt' before initialization". TSC e build ficam
  MUDOS porque a chamada mora dentro de uma arrow, que o compilador trata
  como uso diferido. Regra que fica: funcao usada por `.some/.map/.filter/
  .find` executados no corpo do componente declara-se ACIMA do uso.
- TDZ NO RENDER — comando OFICIAL:
      npm run check:tdz
  E' o gate que nasceu do defeito acima (script em scripts/check-tdz-render.mjs).
  Acusa funcao chamada ANTES de declarada NO MESMO ESCOPO — o unico caso que
  derruba a tela; uso dentro de handler/effect e declaracao de modulo passam.
  Sai 1 e nomeia arquivo:linha quando acha. Conserto e' mover a declaracao para
  cima do primeiro uso: so' ordem, nunca logica.
  ⚠ O SCRIPT SE AUTO-TESTA ANTES DE VARRER, com um fixture do proprio
  `entradaDoCompromisso`; se o detector parar de achar o caso conhecido ele sai
  com codigo 2 em vez de dizer "nenhum". "Zero achados" so' vale quando a busca
  provou que sabe achar.
  ⚠ HEURISTICA DE INDENTACAO, por medicao: a pilha de chaves errou 3 dos 20 casos
  reais do repo (arrow que devolve objeto, homonimo de `for-of`, assinatura
  multilinha) e a indentacao acertou os 20. Falso negativo e' o lado certo para
  errar — o gate existe para o que quebra, nao para o que e' feio.

- HOOK CONDICIONAL — comando OFICIAL:
      npm run check:hooks
  Baseline: 2 (src/components/compra/AbaAuditoriaOC.tsx, linhas 41 e 52), ambas
  PRE-EXISTENTES. Falha por ocorrencia NOVA: arquivo fora da baseline, ou arquivo
  da baseline com MAIS do que ela registra. Reduzir e' sempre aceito — atualize a
  baseline no mesmo PR com `node scripts/check-hooks.mjs --baseline`.
  ⚠ NASCE DE DUAS TELAS BRANCAS NO MESMO DIA, 21/09/2026, as duas com React #310
  ("Rendered more hooks than during the previous render"): a Colheita da mandioca
  (hook abaixo do `if (!form) return null` em CargaMandiocaModal) e o grafico do
  Fluxo da CPR (useMemo abaixo de dois returns antecipados em CprFluxoPrevisto).
  ⚠ E AS DUAS PASSARAM PELOS OUTROS SEIS GATES — TSC, build:proto, check:tdz,
  check:ui-nativo, madge e a suite inteira. NENHUM deles ve ordem de hook. Elas so'
  quebraram no navegador.
  ⚠ O DETECTOR JA' ESTAVA NO REPO e ninguem o rodava: `react-hooks/rules-of-hooks`
  e' `error` no eslint.config.js e apontou a LINHA EXATA dos dois casos. O furo nao
  era falta de ferramenta — era ela nao estar nesta lista.
  ⚠ SO' ESSA REGRA, e a medicao explica: `npm run lint` acusa 1.316 erros, dos quais
  1.246 sao `@typescript-eslint/no-explicit-any`, o idioma documentado do
  `(supabase as any).rpc`. Ligar o lint inteiro pararia todo PR e o gate seria
  desligado na primeira semana. Isolada, a regra tem DUAS ocorrencias no repo.
  ⚠ O SCRIPT SE AUTO-TESTA ANTES DE VARRER, como o check:tdz: roda a regra sobre um
  fixture com hook depois de early return e sai com codigo 2 se nao o achar. "Zero
  achados" so' vale quando a busca provou que sabe achar.
  ⚠ CONSERTO: todo hook vai ANTES de qualquer `return`. Se ele precisa de algo que
  so' existe depois, condicione o ARGUMENTO (`useAlgo(x?.ids ?? [])`), nunca a
  CHAMADA. E se o hook nao protege nada caro, tire-o — foi o que resolveu o caso da
  CPR, onde subi-lo arrastaria as margens do grafico.

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
  Ao reduzir ou acrescentar, atualizar este numero no mesmo PR e dizer quais testes
  sairam ou entraram.

## RELATORIO DE EXECUCAO (formato obrigatorio, todo ciclo)
1. TSC: N erros (baseline 142) — numero explicito, obtido com
   `npx tsc -p tsconfig.app.json --noEmit`
2. Build: OK/FALHOU + tempo
3. git diff --stat completo
4. git status -s (contagem de arquivos — deve bater com o escopo
   declarado no briefing; arquivo fora do escopo = PARAR e reportar)
5. Checks do briefing (se houver secao CHECKS): resultado de cada um
6. ESCOPO — os CAMINHOS COMPLETOS de todo arquivo tocado ou criado, UM
   POR LINHA, prontos para o `git add`. Nao "o teste do classificador",
   nao "o hook do abate": `src/hooks/classificarLotesAbate.test.ts`.
   ⚠ NASCE DE ERRO REPETIDO, nao de burocracia: em 06/09/2026 dois blocos
   git seguidos vieram com o caminho errado de um arquivo NOVO (`src/lib/oc/`
   e `src/components/abate/` no lugar de `src/hooks/`). `git add` com
   pathspec que nao casa FALHA, e o commit sai sem o teste — justamente a
   parte que impede a regressao de voltar. O arquiteto copia esta lista;
   se ela nao existe, ele adivinha.
Commit NUNCA e feito neste passo.

## COMMIT
- Somente apos OK explicito do Gabriel no relatorio.
- git add por arquivo especifico (nunca git add . / -A).
- Commits pequenos e focados — nunca misturar PRs distintos.
- TSC verde + build verde + diff conferido NAO fecham um PR. Todo PR
  fica em estado "aguardando homologacao runtime" ate validacao no
  Claude Chat. Proibido declarar "validado" por conta propria.

## SECAO CHECKS
Quando o briefing incluir uma secao CHECKS (greps verificaveis), rodar
todos e reportar. Qualquer check falho = PARAR e reportar, mesmo que o
fail pareca cosmetico. Nao corrigir por iniciativa propria.

## RLS POR TENANT — NO AR (ACESSOS-01, 2026-09-16)
Toda tabela com `cliente_id` passou a filtrar por `tenant_ok(cliente)` = admin AgroinBlue OU
membro ativo daquele cliente. Versionado em
`supabase/migrations/20261027120600_acessos_01_rls_tenant.sql` (aplicado pelo arquiteto; a
migration e' REGISTRO HISTORICO, nao se reaplica).
- Restam 4 policies `true`, e as quatro sao de REFERENCIA GLOBAL, nao brecha: leitura livre,
  escrita so' admin.
- `financeiro_plano_contas` e `meta_parametros_nutricao` com `cliente_id` NULO continuam
  legiveis por todos — sao o catalogo global. Linha com cliente preenchido ja' filtra.
- `chuvas` tem 24 linhas SEM cliente: elas passam a ser visiveis so' para admin. Nao e' perda de
  dado; e' dado que nunca teve dono.
- ⚠ O QUE ISSO MUDA PARA QUEM ESCREVE TELA: consulta que lia a tabela sem `.eq('cliente_id', ...)`
  passa a devolver MENOS linhas, e sem erro — a lista so' encolhe. Nenhum gate pega isso.
  Antes de culpar a RPC por um numero que baixou, conferir se a tela le direto e sem tenant.

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
- PLANO-ORDEM-01 — REGRA FIRMADA em 23/09/2026: dentro de um grupo, `ordem_exibicao` numera de 10
  em 10 em `centro a-z > subcentro a-z`. O passo de 10 e' IDEAL; `ordem_exibicao` e' IDENTIFICADOR.
  ⚠ SUBCENTRO NOVO ENTRA NO VAO, NUNCA RENUMERA. Medido: `fn_meta_calculada_pecuaria` cita `5030`,
    `1110`, `1120`, `1130`, `1140`, `1150`, `1010`, `1020`, `15010`, `15020`, `8045` e `8140` como
    LITERAIS no corpo, e `fn_dre_pecuaria` junta por `p.ordem_exibicao = c.ordem`. Renumerar faz a
    meta apontar para OUTRO subcentro sem erro nenhum — o join acha outra linha do plano e o DRE de
    meta soma a linha errada. Nenhum gate ve' isso.
  ⚠ FOI O QUE DECIDIU O PLANO-HEDGE-01: a regra a-z poria os dois subcentros novos entre 5020/5030
    e 1050/1060, renumerando 11 — seis deles travados na meta. Entraram como 5025 e 1055.
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

## TRABALHO PARKED (nao tocar)
Working tree pode conter trabalho estacionado de outros PRs (ex: P3.4
desconsiderar OFX). Arquivos modificados/untracked que nao pertencem ao
briefing atual: nao editar, nao stagear, nao limpar, nao stash.

## GOVERNANCA ARQUITETURAL
- Antes de criar componente, tela, hook ou nova fonte de dado:
  consultar docs/constituicao/CONSTITUICAO.md e declarar o encaixe.
- Briefings de implementacao devem conter a secao ENCAIXE
  ARQUITETURAL (seis perguntas do Titulo IV). Briefing sem ela:
  PARAR e solicitar.
- Hierarquia documental: Constituicao > ADRs > specs/modules/
  runbooks > codigo. CLAUDE.md rege a execucao; a Constituicao rege
  a arquitetura.
- Convivencia dos checklists constitucionais:
  (a) ENCAIXE ARQUITETURAL (Constituicao n. 1, Titulo IV) aplica-se
  a QUALQUER alteracao de fonte, contrato, componente, calculo,
  integracao, regra ou arquitetura;
  (b) o checklist do Art. 19 da Constituicao n. 2
  (docs/constituicao/CONSTITUICAO-2-INTELIGENCIA-GERENCIAL.md)
  aplica-se as superficies apresentadas como analise: dashboard,
  painel, card analitico, resumo executivo, relatorio
  interpretativo, projecao, cenario, alerta ou recomendacao
  condicional;
  (c) quando ambos se aplicarem, responder de forma complementar,
  podendo compartilhar a mesma evidencia por referencia cruzada,
  sem repeticao literal desnecessaria. Briefing analitico sem o
  checklist do Art. 19 e sem os artigos atendidos (Art. 22):
  PARAR e solicitar.
- Sentinelas de dado (exibicao e relatorios):
  "—" significa dado ausente, desconhecido ou indisponivel;
  "confere", "mantem" ou equivalente significa que existem dados
  validos e coincidentes; zero e valor real e nunca substitui dado
  ausente; dado conciliado nunca deve aparentar ausencia.

## UI — CABECALHO FIXO E TAMANHOS (regra permanente, ao lado do A21)
Toda lista com rolagem nasce com cabecalho e totais FIXOS e so' o corpo
rolando; toda tela nova usa os tamanhos do A18 — identidade 12px/500,
contexto 10px/400 muted, numero de topo 20px/500 — sem excecao.
NAO E' ITEM DE BRIEFING, E' GATE VISUAL: antes de reportar, conferir no
preview que o cabecalho nao sai da tela ao rolar.
- Detalhes do A18/A21/A22 em docs/PADROES-UI.md; aqui fica o que nao se
  negocia por PR.
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
- ⚠ SELECAO SE MARCA COM NAVY, NUNCA COM SUBLINHADO OU PILULA CLARA (regra
  permanente, PR-DRE-LAVOURA-04). Aba, segmento ou escolha de 2 a 4 opcoes:
  selecionado = `bg-primary` (o navy do item ativo do menu lateral) + texto
  branco; nao selecionado = fundo transparente + `text-muted-foreground`.
  O componente e' `src/components/ui/segmentado.tsx` (`<Segmentado>`), e ele
  e' o unico — altura 26 por padrao, 22 nas reguas de cabecalho.
  ⚠ NASCEU DE TRES MARCACOES DIFERENTES NA MESMA TELA: o seletor de atividade
  do DRE (navy), as abas Resultado|Producao|Historico (sublinhado) e as abas do
  `RateioDetalheModal` (a pilula do Radix). Tres respostas visuais para a mesma
  pergunta — "qual esta aberta?" — a dez pixels uma da outra. Sobreviveu o do
  cabecalho do DRE.
  ⚠ ELE NAO SUBSTITUI O `Tabs` DO RADIX onde ha conteudo a governar: entra no
  lugar da `TabsList`, e o `TabsContent` continua lendo o valor do contexto.
  Aba nova em qualquer tela usa este componente.
- ⚠ UX-OBRIGATORIOS-01 (regra permanente, Gabriel, 26/09/2026): Salvar/Seguir/Aplicar com pendencia NAO
  fecha e NAO grava; cada campo pendente fica vermelho com a mensagem embaixo, o primeiro recebe o foco, e o
  obrigatorio vem marcado (`*`) antes. Cada bloco se cobra dos PROPRIOS campos; o bloco nunca aberto se
  cobra no botao que grava, com bloco e campo escritos ao lado. Detalhe: A29 do docs/PADROES-UI.md.
- ⚠ UX-TOAST-01 (regra permanente, Gabriel, 26/09/2026): validacao e erro de preenchimento NUNCA em toast no
  canto — vao junto do campo ou do botao; toast que sobrar tem X e nao cobre area de digitacao. A recusa nao
  desfaz o digitado. Detalhe: A30 do docs/PADROES-UI.md.
  ⚠ SO' A RECUSA DO REALIZADO DO BOITEL FOI MIGRADA ate' aqui (OC-BOITEL-REALIZADO-UX-01). Os outros toasts de
    erro do sistema, e o X nos que sobram, NAO foram tocados — frente propria.
- ⚠ FIXAR O CABECALHO E' PO'R A ROLAGEM NO NIVEL CERTO, nao acrescentar
  `sticky`. Ja aconteceu duas vezes de o `sticky` existir e nao grudar:
  a lista de movimentacoes (ZOOT-LISTA-01/02) e a previa do custeio. O
  `sticky` ancora no scrollport MAIS PROXIMO; se esse scrollport nao tem
  altura, ele sobe junto com a pagina. Antes de escrever `sticky`, achar
  quem rola.
- ⚠ UM SCROLLPORT SO' POR TELA. Um `max-h` interno dentro de uma area que
  ja rola cria duas barras, e rolar a de dentro nao move o cabecalho
  fixo — o operador ve' a lista andar sem entender por que o topo fica.
- ⚠ FUNDO OPACO E `z` ACIMA das linhas no bloco fixo. Transparente e'
  pior que nao fixar: o conteudo passa por baixo do numero que se esta'
  conferindo.
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
- PERF-VALOR-REBANHO-02 — DUPLICATAS DE REQUEST no /v2, medidas em 24/09/2026 e NAO tratadas.
  Ao abrir a Evolucao Patrimonial (NJ, Global): `saldos_iniciais` 4x (dois pares IDENTICOS),
  `zoo_operacao_movimentacoes` 4x (o segundo par dispara 5s depois, quando `lancamentos` termina
  de paginar), `profiles` 2x, `valor_rebanho_mensal` 2x. Na troca de ano, `fechamento_pasto_itens`
  2x identicas.
  ⚠ VALEM ~4 REQUESTS, NAO SEGUNDOS: nenhuma esta no caminho critico. Prioridade baixa — o que
  custava tempo era a view (PERF-VALOR-REBANHO-01) e a paginacao serial.
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
- ⚠ MIGRATION DE CORPO GRANDE: PATCH GUARDADO POR md5, ALTERNATIVA AO prosrc INTEGRAL
  (aprovado pelo Gabriel em 24/09/2026, no DRE-DESTAQUE-LAVOURA-01).
  A regra segue sendo o corpo INTEGRAL no arquivo — ela existe porque um `replace` cego depende do
  estado vivo e faz coisa diferente em outro banco. Mas transcrever 14.107 caracteres a mao tem o
  risco que o proprio CLAUDE.md nomeia em "CODIGO MOVIDO = COPIADO VERBATIM": uma constante
  alterada em silencio.
  A alternativa aceita para corpos GRANDES e' o patch que se PROVA sozinho:
    1. le' o `prosrc` e ABORTA se o md5 de origem nao for o esperado;
    2. exige que CADA ancora case exatamente 1x, e aborta se nao casar;
    3. aplica com `replace` e CONFERE o md5 do resultado, abortando se divergir.
  Reexecutar sobre um corpo ja' corrigido FALHA na guarda de origem — que e' o comportamento certo
  para migration de corpo. Exemplo vivo: `20261027142000_dre_lavoura_res_oper_por_ha.sql`.
  ⚠ E ELA SO' VALE COM AS TRES GUARDAS. Sem a de origem, roda sobre qualquer corpo; sem a contagem
  de ancoras, patcheia um bloco e esquece outro; sem a de destino, nao prova o que fez.
- ⚠ ANCORA QUE CASA 1x PODE SER A ANCORA ERRADA (DRE-DESTAQUE-LAVOURA-01, 24/09/2026).
  Em `fn_dre_lavoura`, o `jsonb_build_object` de `resultado_operacional` aparece DUAS vezes — uma
  no bloco da CULTURA e outra no do TOTAL — e elas diferem por UM ESPACO depois da virgula:
      'resultado_operacional',jsonb_build_object(...)    <- cultura
      'resultado_operacional', jsonb_build_object(...)   <- total
  A ancora tirada do grep casava EXATAMENTE 1x e teria passado em qualquer verificacao de
  "casa uma vez so'", deixando a coluna Total sem a chave nova enquanto as culturas a tinham.
  ⚠ "CASA 1x" PROVA UNICIDADE DAQUELE TEXTO, NAO COBERTURA DO CASO. Antes de patchear por texto,
  conte as ocorrencias do CONCEITO (aqui: `grep 'resultado_operacional.*jsonb'`), nao as da string
  que voce escreveu.
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
- ⚠ FINANCEIRO V2 — TODO RAMO DE `editarLancamento` REMENDA A LINHA COM O QUE O BANCO DEVOLVEU
  (FIN-V2-REFRESH-01, 25/09/2026). A lista não recarrega na edição (PR-FIN-SAVE-LENTO-01); quem
  mostra o gravado é o `remendarComOBanco`, chamado pelo ramo comum e pelo do título de OC. Ramo novo
  que grave e não o chame deixa a tela na versão velha até o F5. E escrita feita POR FORA do hook
  (RPC, UPDATE direto em outro modal) chama `notificarLancamentosMudaram(clienteId)` depois de gravar,
  só no sucesso — FIN-V2-REFRESH-02: o parcelamento do `LancamentoV2Dialog` e a troca de favorecido
  no `LancamentoZooModal` gravavam e a lista só as via no F5.
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
- ZOO-DOBRO-OC-LEGADO — rebanho possivelmente em DOBRO nos lancamentos do modal antigo. DECISAO DO GABRIEL,
  nao tratada. Medido em 25/09/2026 com `oc_candidatas_vinculo`: dos 141 lancamentos financeiros ativos com
  `movimentacao_rebanho_id` nos subcentros do mapa, 64 tem OC candidata e 62 desses dao `movimento_duplicado`
  — o movimento zootecnico antigo E o movimento da OC (`zoo_operacao_movimentacoes`) descrevem o mesmo gado.
  Por cliente: NJ 36, Vera 12, Santa Rita 11, RRCC 3 (Agnaldo 40 e Raul 10 nao tem candidata nenhuma).
  ⚠ O VINCULO NAO MEXE NO REBANHO: ele solta o elo financeiro (D4) e avisa em vermelho. Quem decidir mede
    antes qual dos dois movimentos fica — cancelar movimento zootecnico muda saldo de rebanho homologado.
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
- ⚠ PECUARIA: LANCAMENTOS IGUAIS SAO NORMAIS (regra permanente, Gabriel, 26/09/2026). Na pecuaria, lancamentos com
  MESMO NOME, MESMO VALOR e MESMO DIA sao o caso comum: cada GTA, cada guia de Fundersul, cada viagem de frete e' um
  lancamento. NUNCA tratar como duplicata, nunca sinalizar como suspeita — nem em relatorio, nem em registro, nem em
  regra de tela. Consequencia de modelo: uma OC pode ter N compromissos do mesmo componente, e "o componente ja'
  esta' pago" nao bloqueia nada (VINCULAR-FIX-01b).
  ⚠ NASCE DE DOIS ERROS MEUS: chamei de duplicata os dois fretes de 2.000 da Vera (37a2f86a, 9b9e2164) e, antes,
    as duas guias de Fundersul de 1.929,38 da b58bf556 (VERA-FUNDERSUL-DUP-01). Os dois registros foram corrigidos.
  ⚠ NAO CONFUNDIR COM A REGUA DE DUPLICIDADE DA IMPORTACAO (`classificar_nivel_duplicidade`, D1/D2/D3): ela compara
    a MESMA linha do Excel reimportada contra o banco — outra pergunta, e continua valendo.
- ⚠ VINCULAR NAO JULGA REPETICAO (regra permanente, Gabriel, 26/09/2026 05:38). O vincular nao mexe em valor,
  pagamento nem conciliacao — so' da' uma OC a um lancamento orfao. O operador vincula quantos quiser (5, 10, 20
  Fundersul/Iagro/frete iguais na mesma OC), sem aviso e sem confirmacao extra. Sem compromisso livre do item,
  "criar item" e' acao NEUTRA. A UNICA RECUSA e' a DIRECAO do plano de um COMPROMISSO (que sai da lista e, forcado,
  e' recusado) — nunca da OC, que continua candidata com "criar item". OC cancelada/rascunho nem entra na lista.
  E' o par da regra "PECUARIA: LANCAMENTOS IGUAIS SAO NORMAIS", logo acima.
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
  ⚠ (HISTORICO) O item (c) do OK do Gabriel — GUARDA DE ALTERACAO NAO SALVA NA VENDA — parou no 01 pela regra do proprio
    pedido e virou o 01b acima, restrito ao realizado. `ocVendaAssinaturaSalva` nasce NULA ao abrir uma venda (por desenho, PR-OC-VENDA-REABRIR-01E), entao
    "assinatura atual diferente da salva" e' verdade em TODO fechamento de venda nao tocada. Fazer certo exige uma
    assinatura de BASE capturada quando a hidratacao termina (lotes e boitel chegam em momentos diferentes) — mais
    que "disparo no fechar + AlertDialog". Hoje, fechar com rascunho do realizado nao salvo PERDE o rascunho sem
    aviso.
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
