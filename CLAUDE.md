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
  ⚠ AS CATORZE RESTANTES SAO DIVERGENCIA DE VERDADE e nao foram investigadas. A do Sto. Expedito em
    2025-03 (414 cabecas) e a maior. Quem for consertar decide QUAL das duas fontes estava errada —
    e ate' la' o DRE mostra a do fechamento, que e' a oficial.
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
