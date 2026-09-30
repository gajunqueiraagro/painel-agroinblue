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
- TSC baseline: 142 erros, medidos em ARVORE LIMPA — worktree em detached HEAD sobre o commit,
  NUNCA no checkout principal (o trabalho parked acrescenta erros: as duas linhas do
  PR-CONCIL-DERIVADO-02A somam 3 TS2352). A historia de cada subida e queda — 73 -> 155 pela
  regeneracao do types.ts em 02/09 (a unica subida legitima), e as reducoes por CONSERTO, por
  APAGAR CODIGO MORTO e por PECA QUE DEIXOU DE EXISTIR — esta' em docs/historico/gates-baselines.md.
  ⚠ BASELINE E' DIVIDA CONHECIDA, NAO RUIDO. Os `.catch` do PostgrestBuilder (treze refresh de cache
  nunca despachados) e o `SEM_CENTRO` sem import (drawer em branco) eram defeitos de runtime
  nomeados pelo diagnostico, em todo relatorio, e ninguem os leu porque "estavam na baseline".
  Ler os erros de baseline dos arquivos tocados e' a unica leitura que eles recebem.
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
  zero divergencia em v_ini_p0/v_fim_p0/v_fim_p1" e o merge MUDOU o DRE do NJ civil 2020 (a chave
  `lucro_liquido` da RPC — Resultado economico menos Investimento, sem linha na grade; ver RPC-NOMES-LUCRO-01 —
  8.873.420,14 -> 8.873.657,32). A replica que eu comparei lia o P0 de
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
  Baseline em 30/09/2026 (OC-CC-VOLTA-01b): 2387 passando, 22 skipped, e
  3 FALHAS PRE-EXISTENTES que NAO sao regressao de PR nenhum:
    2x src/lib/zootecnico/validacaoZootecnica  ·  1x transferencia
  Elas falham no HEAD limpo, em arvore limpa. Antes de chamar qualquer falha de
  regressao, conferir se ela e' uma destas tres.
  ⚠ WORKTREE SEM `node_modules` PROPRIO COLHE MENOS ARQUIVOS: o symlink nao resolve o alias `@/`
    (1563 ali nao era baseline, era erro de coleta). Quem mede em worktree instala as dependencias nela.
  ⚠ CASO EXISTENTE QUE FALHA POR MUDANCA DE CONTRATO e' atualizado ao contrato novo, nunca afrouxado
    para passar; teste que sai junto com o codigo que testava nao e' perda de cobertura.
  ⚠ ASSERCAO DE "NENHUM" LEVA A PROVA DE QUE A BUSCA SABE ACHAR (a lei do auto-teste do `check:tdz`),
    e mutacao que derruba o caso pela razao certa e' a prova de que o teste mede o que diz.
  A historia caso a caso (1504 -> 2254) esta' em docs/historico/gates-baselines.md.
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

## ESTADO ATUAL (handoff de 29/09/2026 — atualizar a cada troca de sessao)
- HEAD proto: 6ed7e148 (FIN-V2-HOMOLOG-FIX-01), publicado em origin/proto.
- Fechadas por ultimo: OC-CONTA-CORRENTE-TODOS-01a (75cdd7ba), OC-CC-CLASSIFICACAO-01 (28a72522), FIN-V2-HOMOLOG-FIX-01 (6ed7e148).
- Banco proto: aplicado ate' `20261027174000_fin_v2_homolog_fix_01.sql` (ledger 20260929105928), incluindo os dados da 173100; as migrations parked (2026080312*, 2026081312*/13*) nao sao desta fila.
- Proxima frente: FIN-NFE-PARCELAS-01.
- Fila: PR 2 conta corrente do ABATE; migracao das OCs existentes para conta corrente; criar-do-legado para abate/compra; 105 abates do modal antigo.

## FILA E DIVIDAS ABERTAS
Indice. O texto integral, com as medicoes, esta' em docs/DIVIDAS-ABERTAS.md; as que nasceram dentro de uma frente
ja' fechada, no bloco dela em docs/historico/frentes-ate-2026-09-29.md.
Quem retomar uma delas LE O BLOCO INTEIRO antes: a medicao e a decisao pendente moram la', nao aqui.
- Rebanho e motor:
  SALDO-INICIAL-MES-01 (coluna `mes` que ninguem le') · SALDO-INICIAL-VIRADA-01 (virada de ano pendurada no trigger
  de dezembro) · ZOOT-CACHE-CATEGORIA-01 · ZOOT-CACHE-AVISO-01 (aviso de buraco no DRE; em ZOOT-CACHE-BURACO-01) ·
  CACHE-X-FECHAMENTO-01 (14 meses divergentes; residuo da ponte do NJ) · PASTO-DIVERGENCIA-01 (decisao de produto:
  440 cab contam?) · PASTOS-APLICAVEIS-ESPELHO-01 (tres espelhos) · USO-TERRA-ARRENDADO-01 · PK-INI-PONDERADO-01
  (dormente) · REPOSICAO-SEM-CUSTO-01 (SR) · RECLASS-INVERSA-01 · GMD-FORA-DE-FAIXA-01 · META-VALIDACAO-01 (peso da
  reclassificacao no cenario meta; em RECLASS-PESO-01) · EVOLUIR-PESO-FAZENDA-01 · ZOO-DOBRO-OC-LEGADO (decisao).
- DRE:
  DRE-DELTA-SOMA-01 · DRE-JUROS-ADM-01 · LAVOURA-2627-INVISIVEL-01 · DIVIDENDOS-PLANO-01 · DRE-LEITOR-CHAVE-01 ·
  DESFRUTE-DEFINICAO-UNICA-01 (decisao) · RPC-NOMES-LUCRO-01 · RATEIO-PERIODOS-TELA-01 · SILVICULTURA-DRE-01 ·
  DRE-HOME-FONTE-UNICA (a Home le' a receita do zootecnico; em OC-VENDA-ENTREGAS-01b) · modal de valor: reconsulta
  da lavoura nao provada, e o editor aberto por ele sem `onAbrirOperacaoOC` (em DRE-MODAL-REFRESH-01).
- OC e Financeiro:
  OC-BOITEL-DELTA-ANTIGO-01 (decisao) · OC-SALDO-MODAL-01 · OC-CLASSIF-ALINHAR-01 (decisao, caso a caso) ·
  OC-RETORNO-GERAL-01 (link direto perde `oc_aba`; em OC-RECLASSIFICAR-ITEM-01) · OC-ADOTAR-TODOS-01 (adotar saida no
  abate e na compra; em OC-VENDA-ENTREGAS-01a) · CANCEL-MOTIVO-BANCO-01 · CONCIL-DESFAZER-STATUS-01 (decisao) ·
  HASH-IMPORT-DEFASADO-01 · ABATE-BRUTO-DUAS-FONTES-01 · ABATE-CALCULATION-NULL-01 · OC-IMPORT-MORTO-01 ·
  BOITEL-DATA-ENVIO-01 · os dois titulos de OC cancelados com parte viva (e8032b0d, f489abd9) e a c80ebe9e real,
  a desfazer pela tela pelo Gabriel (OC-DESVINCULAR-01) · boitel: dados aguardando OK na 77d963be e na cd4c54b0, o
  card do DRE da modalidade B (B-02) e o escritor concorrente `boitel:receita` em 1150 (BOITEL-ABATE-PRODUTOR-01 e o
  bloco da regra do boitel) · guarda de alteracao nao salva da venda, alem do realizado do boitel
  (OC-BOITEL-REALIZADO-UX-01) · `oc_desvincular_lancamento` nao desvincula recebimento de conta corrente, e o tipo
  gerado nao conhece `modelo_financeiro` (OC-CC-CLASSIFICACAO-01) · `valor_acordado` com fracao de centavo em
  6cf548a1 e 229ac98d (OC-VENDA-ENTREGAS-01c) · `prepararCancelamentoEmLote`/`lotesDeCancelamento` sem chamador
  (FIN-V2-CANCEL-MOTIVO-01).
- Telas e UI:
  TELAS-ORFAS-01 (decisao) · FIN-RECORRENCIA-FAZENDA-01 · FIN-FAZENDA-INATIVA-LISTA-01 · FIN-IMPORTAR-ANTIGO-01 ·
  FAZENDA-INATIVA-EDICAO-01 · LEGADOS-ABATE-VENDA-FAZENDA-01 · FORNECEDOR-UUID-CRU-01 · PROPRIEDADE-DESTINO-ORIGEM-01 ·
  CENARIO-EDICAO-01 e a reclassificacao suspeita 2b134b8a (MODAIS-PADRAO-01f) · altura dos asides e o
  `CompraResumoPanel` legado, a Compra ausente em "Lancar meta" no primeiro carregamento e os titulos de 9px dos
  resumos das cargas (MODAIS-PADRAO-01a/01d) · subcentro do titulo de OC sem cadeado no modal do Financeiro
  (OC-RECLASSIFICAR-ITEM-01) · os `truncate` e os toasts de erro restantes (regra da reticencia; UX-TOAST-01) ·
  PERF-VALOR-REBANHO-02 · PERF-RLS-FECHAMENTO-PASTO-ITENS-01 (policy por linha; frente de banco).

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
- ⚠ PISO DE 9,5px, COM UMA EXCECAO E SO' UMA: a Grade do DRE, cuja regua inteira mora em `REGUA_LINHA`
  (`src/components/agri/dreGrade.tsx`) — subtotal 11/500/20/recuo 0, grupo 9/500/16/recuo 8, simples
  9/400/16/recuo 8, filha 9/400/14/recuo 16, sub-coluna (R$/ha, /sc, /t) 9,5. Excecao declarada, nao
  precedente: 9px fora da Grade do DRE reprova o PR.
  ⚠ LARGURA DE COLUNA = pior texto RENDERIZADO + 8 de folga + 14 de padding, contando o slot do marcador
    ▲/▼ (`L_MARCADOR`, 10px). Mede-se com um `Range` sobre o conteudo de cada `td` contra o `clientWidth`
    menos o padding, varrendo todos os estados — nunca pela contagem de digitos (as tres calibragens erradas
    sairam de conta no olho). Quem mexer nas alturas mede a grade inteira, nao so' a linha. A x Anos com 5
    anos rola na horizontal a 1440, custo aceito pelo Gabriel. A historia das calibragens esta' no bloco
    integral em docs/historico/frentes-ate-2026-09-29.md.
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
- ⚠ PADRAO DE TABELA (regra permanente, Gabriel, 28/09/2026, no OC-VENDA-ENTREGAS-01c): 10px nas linhas, 9,5px no
  cabecalho, linha de 18px, datas dd/mm/aa; cabecalho navy em todos os niveis; cabecalho, totais e cards CONGELADOS (so' as
  linhas rolam); uma informacao por coluna e uma linha por registro; divisor vertical entre grupos de colunas; tipos de linha
  diferentes com fundos diferentes; cor pelo sinal; cabecalho centralizado, numero a direita; nada truncado com "...".
  Detalhe: A31 do docs/PADROES-UI.md; exemplo vivo `AbaContaCorrenteOC`.
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
  volta ao nativo.
  ⚠ O GATE TEM BASELINE, como o TSC: 9 arquivos herdados (0 `type=date`, 17 `<select>`). `type=date` esta'
  em ZERO — qualquer um novo REPROVA o PR, em qualquer arquivo. Ele acusa ocorrencia NOVA: arquivo fora da
  lista, ou arquivo da lista com MAIS do que a baseline. Reduzir e' sempre aceito; atualize a baseline no
  mesmo PR com `node scripts/check-ui-nativo.mjs --baseline`. Historia: docs/historico/gates-baselines.md.
- ⚠ SVG COM `preserveAspectRatio="none"`: O viewBox VAI EM PIXELS REAIS, NUNCA EM UNIDADES NORMALIZADAS.
  Com `none` a escala se aplica a TUDO, inclusive `fontSize` e espessura do traco (`fontSize={8}` num
  `viewBox` de 100 numa caixa de 220px renderiza a 17,6px). Referencia de como se faz: `PecCascataView`.
  Quem precisar de unidade normalizada faz como `V2AreasMeta`: nenhum texto dentro do SVG (valores em HTML
  por cima) e `vectorEffect="non-scaling-stroke"` em todo traco. Nenhum gate ve' isso — jsdom nao faz layout.
- ⚠ TEXTO CORTADO COM RETICENCIA E' PROIBIDO — SE NAO CABE, QUEBRA EM DUAS LINHAS (regra permanente do Gabriel,
  27/09/2026, no MODAIS-PADRAO-01e). `LinhaResumo` ganhou `quebra` (opt-in): o VALOR ocupa ate' duas linhas, alinhado
  a' direita, sem "…", e o rotulo fica na primeira. Para TEXTO livre (produto, favorecido, conta, centro, subcentro);
  numero e data seguem numa linha so'.
  ⚠ NASCE DE MEDICAO: no resumo de 240px, "Impostos e Despesas de Abates e Vendas" pedia 200px e tinha 163, e o
    subcentro mais longo do plano ("Investimento Equipamentos e Informatica Administrativo", 269px) cortava ate' nos
    300px de antes. Com `quebra`, os dois aparecem inteiros em duas linhas (27px).
  ⚠ SEM A PROP NADA MUDA — provado: o HTML do `LinhaResumo` sem `quebra` e' identico ao do HEAD nas 96 combinacoes de
    props (valor, cor, forte, empilhado, seloAbaixo, selo). Abate, Venda, Compra e envelope nao a usam.
  ⚠ E OS OUTROS `truncate` DO SISTEMA NAO FORAM VARRIDOS: a regra vale a partir daqui; a varredura e' frente propria.
- ⚠ CASCA DE MODAL (MODAIS-PADRAO-01a..f): cabecalho 36px/13px, corpo `100vh-32` sem o teto do tema,
  resumo lateral de 240px com as pecas de `src/components/ui/linha-resumo.tsx` (`AsideResumo`,
  `FaixaTituloResumo`, `SecaoResumo`, `LinhaResumo` — `quebra` para texto livre), rodape de 32px com botoes
  de 22px. Os lancamentos simples usam o `LancamentoModalEnvelope`.
- ⚠ O `DialogContent` RENDERIZA A 95% E FICA ASSIM (DIALOG-ZOOM-95-01): medir com `offsetWidth`, nunca com
  `getBoundingClientRect()` (erra 5 % para menos), e `fontSize: 9` aparece como 8,55px. Nao corrigido de
  proposito: mexe na animacao de todos os dialogos.

## REGRAS VIGENTES — DADO, BANCO E METODO
(Cada regra cita a frente em que nasceu; o bloco integral, com a medicao que a justifica, esta' em
docs/historico/frentes-ate-2026-09-29.md.)
- PLANO-ORDEM-01 — REGRA FIRMADA em 23/09/2026: dentro de um grupo, `ordem_exibicao` numera de 10
  em 10 em `centro a-z > subcentro a-z`. O passo de 10 e' IDEAL; `ordem_exibicao` e' IDENTIFICADOR.
  ⚠ SUBCENTRO NOVO ENTRA NO VAO, NUNCA RENUMERA. Medido: `fn_meta_calculada_pecuaria` cita `5030`,
    `1110`, `1120`, `1130`, `1140`, `1150`, `1010`, `1020`, `15010`, `15020`, `8045` e `8140` como
    LITERAIS no corpo, e `fn_dre_pecuaria` junta por `p.ordem_exibicao = c.ordem`. Renumerar faz a
    meta apontar para OUTRO subcentro sem erro nenhum — o join acha outra linha do plano e o DRE de
    meta soma a linha errada. Nenhum gate ve' isso.
  ⚠ FOI O QUE DECIDIU O PLANO-HEDGE-01: a regra a-z poria os dois subcentros novos entre 5020/5030
    e 1050/1060, renumerando 11 — seis deles travados na meta. Entraram como 5025 e 1055.
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
- ⚠ PASTO NO MES = VIGENCIA + ATIVO, regra unica (`fn_pasto_vigente_no_mes`, espelho EXATO de
  `usePastos.ts:49-77`), com a excecao que e' parte dela: "vigente se houver; SENAO o que existe". Governa as
  somas por mes do motor (`fn_zoot_categoria_mensal`, `propagar_saldo_inicial_pos_dezembro`,
  `fn_saldo_inicial_pasto`). Quem mexer em um espelho confere os outros (PASTO-VIGENCIA-MOTOR-01).
- ⚠ SALDO INICIAL SE CADASTRA UMA VEZ, no primeiro mes da fazenda no sistema; janeiro dos anos seguintes e'
  materializacao do motor, nao cadastro (Gabriel, 23/09; em SALDO-INICIAL-VIRADA-01).
- ⚠ O CACHE DO REBANHO SE RECONSTROI NA GRAVACAO: os gatilhos marcam `zoot_cache_sujo`, o gatilho deferido
  reconstroi cada (fazenda, ano) no fim da transacao, o cron `zoot_cache_sujo_reconstruir` repete a cada 5 min e
  `fn_zoot_cache_buracos(cliente)` e' a sentinela. Cache vazio NAO e' rebanho zero (ZOOT-CACHE-BURACO-01).
- ⚠ A CLASSIFICACAO DE UM LANCAMENTO E' A CHAVE (`plano_conta_id`); `macro_custo`, `grupo_custo`, `centro_custo`,
  `subcentro` e `escopo_negocio` sao COPIAS reescritas pelo gatilho `resolve_classificacao_from_plano` em todo
  INSERT e UPDATE, e mudar o plano propaga as copias sem marcar `editado_manual`. Texto fora do plano e' ERRO,
  exceto Dividendos (DRE-CLASSIF-COPIA-01).
- ⚠ A DIRECAO DO LANCAMENTO E' A DO TIPO DA CONTA DO PLANO, nao o sentido da macro (`erroDeDirecao`,
  `tipoDaContaNoPlano`; o 1155 e' 2-Saidas sob Receita Operacional). O banco nao guarda direcao x conta
  (BOITEL-ABATE-PRODUTOR-01d).
- ⚠ O RATEIO ADMINISTRATIVO E' POR MES, numa funcao so': `fn_rateio_admin_mes` (a chave do ano vale so' nos meses em
  que a atividade existe; silvicultura e mes sem atividade vao para "nao alocado"). A LISTA DE EXCLUSAO DE MACROS
  mora so' nela (RATEIO-VIGENCIA-01).
- ⚠ MODAL DE LINHA DO DRE SOMA AS MESMAS CHAVES DA DEF DA GRADE: `somaComposta` (`drePecRegua.ts`) e' a fonte dos
  dois, e a composicao viaja no clique (`def.compor`) — o modal nao adivinha o modo da grade
  (DRE-MODAL-CUSTO-FIXO-RATEIO-01).
- ⚠ A CHAVE `lucro_liquido` DE `fn_dre_pecuaria` NAO E' A LINHA "Lucro liquido" DA GRADE: esta le' `resultado_periodo`,
  e o "= Resultado economico" le' `resultado_com_mercado`. Prova que compara pela chave errada confere o numero errado
  (RPC-NOMES-LUCRO-01).
- ⚠ O CANAL MCP NAO PASSA PELA RLS: numero do banco e do navegador que discordam em ordens de grandeza -> suspeitar da
  RLS antes da rede (PERF-RLS-FECHAMENTO-PASTO-ITENS-01). Em frente de dado de tenant, a prova de comportamento roda
  COMO O USUARIO.
- ⚠ PROVA NO CANAL MCP LEVA `SET LOCAL statement_timeout` abaixo do tempo do canal. A rodada que estoura CONTINUA no
  servidor segurando os locks; antes de repetir, `pg_stat_activity` (e `pg_cancel_backend` na presa)
  (DRE-MODAL-VALOR-01a, OC-CC-CLASSIFICACAO-01).
- ⚠ `apply_migration` REGISTRA COM O TIMESTAMP DO DIA, nao com o do nome do arquivo: todo registro diz os dois
  ("⚠ registrada como ...") e confere ledger = arquivo por md5.
- ⚠ REPLACE DE VIEW LEVA `WITH (security_invoker = true)` e se confere em `pg_class.reloptions`; funcao SECURITY
  DEFINER nova nasce com EXECUTE para PUBLIC — fechar a ACL e conferir `proacl` depois.
- ⚠ TRILHA DE EVENTOS MOSTRA O QUE, NAO POR QUE. Conserto se brifa depois de reproduzir na tela e ler o chamador
  (OC-COMPRA-REVALOR-01); correlacao fabricada pela ordem dos cliques nao e' causa, e "em silencio" se mede
  (OC-URL-RAJADA-01).
- ⚠ MUDANCA DE FILTRO SE PROVA COM VARREDURA ANTES x DEPOIS NUM CONJUNTO REAL, contando o que SUMIU; casos escolhidos
  nao mostram regressao de filtro (VINCULAR-FIX-01c).
- ⚠ VALOR SUGERIDO E' VALOR ACEITO: a sugestao responde pelo numero como se fosse digitada, com a barra de qualidade do
  dado, marcada em ambar com uma linha de 10px; e SUGESTAO NAO ENTRA EM REGISTRO JA' GRAVADO (na edicao,
  `autoSugerir: false` e o valor hidratado conta como digitado) (RECLASS-PESO-01).
- ⚠ ESTADO DE DADO SO' DEPOIS QUE A GRAVACAO PASSA: `src/lib/oc/aplicarComRollback.ts` aplica, grava e RESTAURA o
  anterior na recusa — nunca limpa. Flag de UI (`setSubmitting`) segue antes do `await`. Recusa por status se le' pela
  mensagem do servidor, nao pelo status do render (OC-BOITEL-REALIZADO-01).
- ⚠ EVOLUCAO PATRIMONIAL: a tracejada "sem efeito de mercado" e' o rebanho de cada mes ao preco da categoria no INICIO
  (categoria sem preco no inicio fica FORA da soma — nunca o preco do fim), e o 1o de janeiro tem uma fonte so',
  `useValorRebanhoInicio`, com `origem === 'vazio'` virando null, nunca zero (bloco "03c", 24/09/2026).
- ⚠ PAGINACAO DE LISTA GRANDE: primeira pagina com `count: 'exact'`, as demais em `Promise.all`; sem `count`, volta ao
  serial de proposito — `count ?? rows.length` truncaria calado (PERF-VALOR-REBANHO-01).

## REGRAS VIGENTES — OPERACAO COMERCIAL E FINANCEIRO
- ⚠ FINANCEIRO V2 — TODO RAMO DE `editarLancamento` REMENDA A LINHA COM O QUE O BANCO DEVOLVEU
  (FIN-V2-REFRESH-01, 25/09/2026). A lista não recarrega na edição (PR-FIN-SAVE-LENTO-01); quem
  mostra o gravado é o `remendarComOBanco`, chamado pelo ramo comum e pelo do título de OC. Ramo novo
  que grave e não o chame deixa a tela na versão velha até o F5. E escrita feita POR FORA do hook
  (RPC, UPDATE direto em outro modal) chama `notificarLancamentosMudaram(clienteId)` depois de gravar,
  só no sucesso — FIN-V2-REFRESH-02: o parcelamento do `LancamentoV2Dialog` e a troca de favorecido
  no `LancamentoZooModal` gravavam e a lista só as via no F5.
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
- ⚠ CONTA CORRENTE DA OC (ADR-2026-21 + adendos; venda e compra no modelo, abate e a migracao
  das OCs existentes na fila):
  - A OC e' UMA venda/compra. Entrega/entrada do gado = titulo sem caixa, receita/custo no DRE
    na data do fato (CPC 47), descricao "Venda NNN SIGLA"/"Compra NNN SIGLA", valor do lote.
  - Recebimento/pagamento FICA no subcentro da operacao (ex.: Venda de Desmama Machos) e sai do
    DRE pela parte viva (`compoe_dre = false` por `_oc_cc_fora_do_dre`). NUNCA mover para conta
    de adiantamento: 3015, 5005 e 5006 estao DESATIVADAS e nao se usam (OC-CC-CLASSIFICACAO-01).
    Filtrar o Financeiro por subcentro de venda/compra tem de mostrar o dinheiro das OCs.
  - Saldo = calculado, nunca gravado. Extrato pelo caixa da fazenda: venda recebimento +,
    entrega -; compra espelhado (Falta pagar / Adiantado ao fornecedor / Quitado).
  - Diferenca final = saldo; explica-se na OC (ajuste de preco no lote com criterio total,
    desconto 5020, permuta/outra despesa, outra receita so pecuaria, devolucao no subcentro da
    operacao fora do DRE). A OC fecha sem explicar; pendencia visivel. Nunca "fazer bater".
  - Programado/devolucao nasce na categoria de MAIOR VALOR da OC.
  - Adocao: a OC adota a saida/entrada ja lancada (nunca cria gado de novo); saida adotada
    nunca e' reescrita nem cancelada pela OC; incluir lote nunca trava; lote com saida ativa
    nao se remove nem se exclui (mensagem diz qual e o caminho). Programados do modal antigo
    nunca sao adotados nem vinculados. Boitel fora do conta corrente.
  - Legado: financeiro conciliado manda no VALOR; zootecnico na QUANTIDADE e na DATA.
  - Cancelar: so o que e' da conta corrente; despesa paga a terceiro fica; recebimento ja pago
    sai da OC e volta a ser venda/compra comum (compoe DRE).
  - Conta bancaria se le' pela direcao: entrada -> conta_destino_id; saida -> conta_bancaria_id.
- ⚠ FINANCEIRO V2 MOSTRA SO DINHEIRO por padrao; sem caixa (entregas, barter, consumo) em secao
  separada atras de chave. Nenhuma coluna nova que gere rolagem horizontal a 1440px; o menu
  "..." fica fixo e sempre visivel. OC se abre pelo icone do produto ou "Abrir OC" no menu
  (FIN-V2-SEM-CAIXA-01, FIN-V2-HOMOLOG-FIX-01).
- ⚠ BOITEL: ao financeiro e ao DRE vai SO' O LIQUIDO DO ACERTO; R$/@ de venda = liquido / @ vivas que sairam. O VALOR DA
  OPERACAO E' O SLOT (`zoo_operacao_lotes.valor_informado`, helper `valorDaVendaBoitel`) e a tela nunca o calcula; o
  acerto e' conferencia. Com o realizado aplicado, o realizado vence a projecao em tudo (`custosDaVendaBoitel`, mesmo
  predicado `realizadoAplicadoNoLote`). `ocBoitelReal` e' o rascunho, `ocBoitelRealSalvo` o que o banco tem — quem le'
  numero le' o salvo. Duas modalidades: A (o boitel abate) e B (abate em nome do produtor; acerto em 1155)
  (OC-BOITEL-VALOR-01, OC-BOITEL-REALIZADO-UX-01, BOITEL-ABATE-PRODUTOR-01).
- ⚠ UM GESTO DE DESFAZER = UM MOTIVO + UM `estorno_id` EM TODOS OS EVENTOS; a cadeia vai da folha a raiz relendo o banco
  antes de cada nivel (`src/lib/oc/desfazerCompromisso.ts`) (OC-MOTIVO-UNICO-01).
- ⚠ VINCULO COM OC = PARTE VIVA (`zoo_operacao_partes.cancelada = false`), nunca `origem_lancamento`; quem le' parte por
  lancamento filtra `cancelada = false`. Titulo com parte viva nao se cancela pelo Financeiro (o caminho e' o "Desfazer
  compromisso" da OC), e cancelar pelo Financeiro exige motivo NO HOOK (`motivoInformado`)
  (FIN-V2-CANCEL-MOTIVO-01, OC-DESVINCULAR-01).
- ⚠ OC FECHADA: so' o cadastral se edita, sem reabrir (`oc_editar_dados_operacao`); a classificacao de um item se
  corrige pela OC (`oc_reclassificar_item`), nunca pelo Financeiro (OC-EDITAR-CADASTRAL-01, OC-RECLASSIFICAR-ITEM-01).
- ⚠ O ESTADO DE LIQUIDACAO OLHA O LADO DA OPERACAO (ADR-2026-20, `vw_oc_operacao_liquidacao`), e a natureza da
  liquidacao segue a direcao do titulo. `oc_derivar_status` e' codigo morto: nao religar (OC-STATUS-LADO-01,
  OC-LIQ-SINAL-01).
- ⚠ A PREVIA E' A PROPRIA RPC COM `p_simular` (desfeita por SQLSTATE 'OCSIM'): nenhuma regra copiada no front
  (VINCULAR-LANC-OC-01, OC-CRIAR-DO-LEGADO-01).
- ⚠ DOCUMENTO: quem le' NF filtra por `especie` e tolera (sem numero, ignora; sem nenhuma, "—"); "2+ documentos" nao e'
  "2+ NFs". O anexo so' fala do arquivo e recebe o endereco do documento de quem chama (OC-DOC-ESPECIE-01).
- ⚠ "GLOBAL NAO E' FAZENDA": campo de fazenda de modal e' seletor das fazendas ativas; filtro numa fazenda nasce com
  ela; Global nasce VAZIO, obrigatorio, vermelho com "Selecione a fazenda do lançamento."; edicao mostra a gravada. O
  Financeiro nunca escolhe a primeira fazenda por ninguem (`FazendaSelect` com `obrigatorio`)
  (TRANSF-FAZENDA-ORIGEM-01, FIN-FAZENDA-PADRAO-01). A Central de OCs segue o seletor lateral (OC-FAZENDA-GLOBAL-01).
- ⚠ O CENARIO VEM DO CAMINHO: "Lancar movimentacao" = Realizado, "Lancar meta" = Meta, sem escolha; a edicao mantem o do
  registro (MODAIS-PADRAO-01f).
- ⚠ PARAMETRO DE NAVEGACAO NA URL SE ESCREVE SEMPRE, NUNCA SE PRESERVA (`src/lib/oc/paramsAberturaOC.ts`; quem quer
  preservar PASSA o valor). Valor lido da URL se memoiza, e escrita que nao muda nada nao se faz (`useFiltroUrl`).
  Rajada de escritas se acha instrumentando `history.replaceState` e mapeando a pilha pelo sourcemap
  (OC-ABRIR-PERDE-ID-01, OC-URL-RAJADA-01).

## HISTORICO
Frentes fechadas, historias de baseline e medicoes antigas SAIRAM daqui em 29/09/2026, sem perda de conteudo:
docs/historico/README.md diz onde esta' cada coisa. Frente nova fechada deixa AQUI so' a regra vigente (uma entrada
curta nas secoes de regras) e a pendencia (na FILA); o bloco inteiro vai para docs/historico/.
