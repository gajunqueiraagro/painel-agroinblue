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
- TSC baseline: 148 erros (era 73 ate 2026-09-02, 155 ate 09-03, 153 ate 09-08 e 150 ate 09-09 — ver a regeneracao do
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
  limpo". Com ele: 1 warning (pdf.worker) e 21 ciclos conhecidos em
  2026-09-06. Dois deles sao frente aberta [ABATE-CICLOS-MODAIS]:
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

## RELATORIO DE EXECUCAO (formato obrigatorio, todo ciclo)
1. TSC: N erros (baseline 150) — numero explicito, obtido com
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
  ⚠ O GATE TEM BASELINE, como o TSC: 10 arquivos herdados (0 `type=date`,
  20 `<select>`).
  ⚠ `type="date"` CHEGOU A ZERO no 136d — a frente [DATA-PADRAO-GLOBAL] esta'
  FECHADA para datas. O que resta na baseline sao 20 `<select>` nativos, em 10
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
