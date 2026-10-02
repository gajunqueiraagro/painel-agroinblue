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
- TSC baseline: 141 erros (142 -> 141 no PR-FIN-DUPLICAR-ABRE-MODAL-01, por APAGAR CODIGO MORTO: saiu o TS2322
  `number` -> `string` do `sinal` no `duplicarLancamento` de useFinanceiroV2.ts), medidos em ARVORE LIMPA — worktree em detached HEAD sobre o commit,
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
  Baseline em 02/10/2026 (PR-CONC-ENRIQ-MESA-CULTURA-FASE-B, +20 em `src/v2/lib/mesa/culturaFaseMesa.test.tsx`; antes o
  PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU, +9): 2960
  passando, 22 skipped, e
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
1. TSC: N erros (baseline 141) — numero explicito, obtido com
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
  MANDIOCA-OBS-CARGA-01: a observacao da carga (`agri_colheita.observacoes`, o campo do modal) NAO chega ao lancamento
  do frete — `_agri_carga_inserir_papel` nao grava `observacao`; o motorista no lancamento se poe hoje pelo Financeiro
  (medido no MANDIOCA-FRETE-SILVIO-01) · `ConciliarExtratoDialog.tsx` (`src/components/financeiro-v2/`) SEM IMPORTADOR — o
  criar-e-vincular em duas chamadas que o B-32b vetou mora la'; apagar ou religar e' decisao (medido no
  CONC-CRIAR-TRANSFERENCIA-01) · o caminho `semVinculo` do Criar (grupo que soma o cheio) continua so' Saida/Entrada, pelo
  writer comum — Transferencia ali e' frente propria (CONC-CRIAR-TRANSFERENCIA-01) ·
  no Criar em Transferencia, a "outra conta obrigatoria" hoje avisa por TOAST (o do `LancamentoV2Dialog`, contraria
  UX-TOAST-01) — trocar por erro no campo (CONC-CRIAR-TRANSFERENCIA-01) ·
  CONC-MESA-NN-01 (frente propria, medida no CONC-MESA-SINAL-01): a `montarMesa` trata como N:1 TODO lancamento com 2+
  extratos e CONSOME esses extratos — num bloco N:N (Emerson, NJ Sicredi Lavoura ago/26: 3 Pix x 7 arranquios) os outros
  lancamentos ligados aos mesmos extratos SOMEM da mesa (o "Arranquio 20,24 t · NF 9294773" consome o Pix 28/08 -16.276,80
  e os outros 6 arranquios, 16.443,20, saem; mais 352,40 no 40,34 t) e o mes inteiro difere (mesa -170.601,20 x
  `sistema_caixa` -184.396,80); e o N:1 e' desenhado na data do LANCAMENTO, nao na de cada extrato (ICMS NF 9287581
  2.470,26 = 454,26 em 26/08 + 2.016,00 em 27/08, todo em 27/08; os 3.000 do Pix 24/08 do 40,34 t em 28/08), enquanto o
  caixa reparte por extrato. Conserto: o bloco N:N na mesa e o N:1 datado por extrato (a regra do caixa) ·
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
  (FIN-V2-CANCEL-MOTIVO-01) · o AVANCO do `fn_recorrencia_gerar` recria competencia cuja unica linha esta' cancelada
  (cancelar parcela acima da marca e Gerar de novo a recria) e nao olha mes fechado — PR proprio (decisao do Gabriel,
  30/09, em FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01, que so' deu essas travas as VAGAS) · Enriquecer · Excel
  (PR-CONC-EXCEL-CONTA-STAGING-01), tres dividas de PR proprio: (a) DOIS RESOLVEDORES DE CONTA QUE DISCORDAM — o do
  front (`resolverContaPorTexto`: apelido, nome, agencia+numero) e o do banco (`fn_classificacao_resolver_conta`, so'
  "cc-NNN |"); unificar; (b) o PASSO 3a de `fn_classificacao_casar_sessao` (soma de 2) nao exclui
  transferencia/estorno/meta como o passo 1 — PR de banco; (c) DOIS LEITORES DO MESMO ARQUIVO (`useImportLancamentosExcel`
  faz o de-para, `useImportarClassificacao` popula o staging) — o de-para de conta tem de ser entregue de um ao outro, e
  foi nessa entrega que a planilha do NJ set/26 foi inteira sem conta. · PR-CONC-TRANSFERENCIAS-01 aposentou o detector
  orfao (`ExtratoListaTab`, `useExtratoParesOfx`, `useTransferenciaDecidir`) e deixou ORFAOS, sem importador, o
  `ConciliacaoPendenciasPanel` (e a lib `conciliacaoDiagnostico`, que so' ele usa) e o `RematchOnDemandPanel` — apagar
  ou religar e' decisao; `transferencia_ofx_pares` segue como historico (13 decisoes), so' lida pela Mesa. ·
  EXTRATO-UFFFD-01 (corrigido em 30/09, migration 20261027184700): as 309 linhas VIVAS com U+FFFD foram consertadas
  pelo dicionario das 26 palavras, com `hash_movimento` recalculado (zero sobra, zero colisao, vinculos intactos) e os 5
  lancamentos CRUS ligados a elas junto. RESTAM, so' reportados: 17 linhas NAO vivas; 49 lancamentos CLASSIFICADOS vivos
  com U+FFFD na descricao (28 ligados as linhas corrigidas) e 25 cancelados; o `snapshot_historico_banco` dos vinculos
  (fotografia, nao se reescreve); 2 linhas vivas SEM U+FFFD cujo hash nao bate com a regra (2206313a, 64f3e26f — valor
  editado depois da importacao). · MESA-CRU (PR-CONC-MESA-CRU-EXCEL-PREVALECE-01): (a) a sessao
  32c52f5c (e toda sessao anterior ao PR) so' ganha a precedencia e as colunas `planilha_*` quando for RECASADA — nao
  recasei (prova sem gravar); (b) "NAO E' NADA" do de-para de fornecedor NAO persiste: o descartado mora so' no estado do
  navegador e nao ha coluna/tabela para ele — pergunta aberta ao Gabriel (precisa de estrutura nova); (c) APELIDO DE
  SUBCENTRO COM CONTEXTO DE ATIVIDADE (proximo PR): na 32c52f5c, apelidos que dao plano de agricultura em fazenda de
  pecuaria e vice-versa — agricultura/Faz. Sto. Expedito 9, pecuaria/Retiro Agricultura 8, agricultura/Faz. Pureza 30
  (a Pureza tem 279 ha agricolas; conferir), ex.: UNIPETRO -8.700 "Combustivel" + Faz Pureza -> Combustivel Maquinas
  Agricultura; (d) a precedencia e' provada por teste SQL em ROLLBACK, sem mutacao do lado do banco. · MESA-PAINEL
  (PR-CONC-MESA-PAINEL-V1): (a) PADRONIZAR `forma_pagamento` LEGADO (auditoria) — "PIX/Transferência Bancária", "Cartão
  de Credito/Crédito", "Credito", "Débito em Conta", "Cartão de Débito" fora de `FORMAS_PAGAMENTO_V2`; a Mesa os mostra
  como estao (opcao "valor atual"), NAO normalizou (decisao do Gabriel); (b) `fn_classificacao_reverter_row` NAO
  restaura `tipo_documento`, `forma_pagamento`, `observacao` nem as datas (o `estado_anterior` guarda os dois primeiros
  desde a 20261027184600; as datas e a obs desde o 129c) — divida antiga, PR de banco; (c) o apply_row ainda grava
  `data_pagamento`/`conta_bancaria_id` do proposto em lancamento NAO conciliado, e a Mesa agora os mostra so' leitura
  ("do extrato") — proposta antiga nesses dois campos grava sem aparecer; medir e decidir; (d) a Mesa nao muda mais o
  Tipo nem a conta bancaria (o Tipo vai pelo passo "Transferencias entre contas"); `ResultadoTipoEditor` e
  `ResultadoContaEditor` (`ResultadoCamposGravaveis.tsx`) ficaram SEM CHAMADOR — apagar ou religar e' decisao.
  · MENU-CONTRASTE (UI-DROPDOWN-PADRAO-01-fix1): no seletor de importacao do Enriquecer, o "(mais recente)" e' pintado pela
  tela com `text-muted-foreground` e da' 1,60:1 sobre o painel zinc-600 — PR proprio (a regra e' todo texto de menu >= 4,5:1).
  · BLOCO-ESTADOS (PR-CONC-ENRIQ-BLOCO-ESTADOS): (a) VIVO CASA 322/323 (9fd050ed, 547a04fa) APLICADAS no MESMO 8ebd63d4 (soma
  -1.013,02 x -506,51) — conserto de dado a decidir com o Gabriel; o soltar recusa linha aplicada, e reverter uma devolveria o
  estado que a outra sobrescreveu; (b) CASADOR CARTAO x BB: 6 duplas nao aplicadas (265/266, 278/279, 289/290, 307/308,
  355/356, 431/432) — a mesma compra na planilha no BB e no Cartao BB - Ourocard Visa (16/09), as DUAS casadas no lancamento do
  cartao pago em 17/08; e' frente do casador (ENRIQ-CASADOR-IGUAIS-01); (c) PAR MORTO EM 'ja_aplicado' NAO SE SOLTA SOZINHO: o
  Recasar preserva 'ja_aplicado', entao uma linha cujo lancamento foi cancelado fica presa nele ate' alguem a soltar (provado no
  P5 com a 278); (d) a linha cujo lancamento e' de OUTRA conta aparece no Extrato da conta do LANCAMENTO (`conta_filtro_id` da
  view prefere a do lancamento) — a 265 do BB aparece no Cartao BB; (e) o selo "Par repetido" so' aparece quando o lancamento do
  par esta' no Sistema do mes (as 6 duplas do cartao, pagas em agosto, nao o mostram).
  · CASADOR-MES (PR-CONC-ENRIQ-CASADOR-MES): (a) A REGUA DE DIRECAO AINDA TEM 5 COPIAS FORA DO DONO (`_fn_conta_do_lancamento`):
  `fn_extrato_conciliar_mes` 3, `fn_transferencia_aplicar` 1, `fn_transferencias_espelhadas` 1; e o populate tem REGUA PROPRIA no
  casamento por atributos (entrada: destino = destino da linha, ou destino/bancaria = origem; e exige `ano_mes` = competencia e
  `data_pagamento = data`, a COMPETENCIA — no ensaio, 348/349/350 casaram por atributos com lancamentos de outra data, que o
  Recasar refaz); (b) O RECASAR ATUAL JA' MEXIA EM 3 LINHAS DA 8d6efeb7 sem relacao com este PR: a 62 (par com a transferencia
  7a1b1f93, que o casar exclui) volta a 'sem_match', e 371/372 viram 'sugestao_split' (dfd8ab98) — o Recasar desfaz par feito
  com transferencia; (c) [revogada no PR-CONC-ENRIQ-CARTAO-MESMA-DATA: o cartao e' datado na fatura e o par herdado exige a
  mesma data, como toda conta]; (d) Santa Rita 8a82eb7c linhas 58/98 e NJ a63fa4c6 linha 246: APLICADAS em lancamento de outro mes /
  conta (gravaram classificacao) — decisao caso a caso; (e) a reaberta nao guarda de onde veio (o "limpa" do Recasar zera o
  `casamento_meta`).
  · CARTAO-MESMA-DATA (PR-CONC-ENRIQ-CARTAO-MESMA-DATA, 02/10): (a) CARTAO HISTORICAMENTE DATADO PELA COMPRA (Santa Rita Itau
  Black 2021–2024, parte do Nubank) nao casa por data exata quando a planilha traz a data da fatura; se virar caso real, pede
  regra propria com decisao do Gabriel; (b) o teste do CASADOR-MES (`conc_enriq_casador_mes_test.sql`) ja' nao monta contra a
  8d6efeb7 de hoje (a 62 esta' 'sem_match' sem par e a 16 foi para o cru faf8537b) — independente deste PR; P5/P6/P7 foram
  ajustados a' regra nova e o P7 escreve na 8d6efeb7 (so' com a sessao parada); (c) os comentarios do populate e do
  casar_sessao ainda dizem "cartao dispensa a data" (so' comentario; o corpo nao foi tocado, por escopo).
  · CULTURA-FASE-A (PR-CONC-ENRIQ-MESA-CULTURA-FASE-A, 02/10): (a) SESSOES JA' IMPORTADAS: o Recasar completa
  `_planilha.cultura` so' nas linhas com par, NAO aplicadas e NAO editadas a mao (na 8d6efeb7: 49 das 125 — 26 amendoim, 23
  mandioca); as outras 76 (aplicadas, sem par ou editadas) so' reimportando. Backfill PROPOSTO, NAO executado: acrescentar SO' a
  chave `_planilha.cultura` = `_fn_classificacao_cultura_da_planilha(excel_safra, _planilha.safra_id)` nas linhas sem ela (nenhum
  outro campo), guardado pela contagem antes x depois; (b) a Mesa nao consegue LIMPAR uma cultura ja' gravada (vazio = tirar a
  proposta, e o apply nunca apaga por ausencia) — se o operador quiser "rateia" num lancamento que ja' tem cultura, e' o modal
  do Financeiro; (c) eucalipto em silvicultura: o gatilho o zera (a regra e' cultura so' em agricultura), coerente com o front;
  (d) [resolvido no PR-CONC-ENRIQ-MESA-CULTURA-FASE-B: a Mesa le e edita cultura/fase]; (e) CULTURA-FASE-B: o comentario
  de `ClassificacaoLancamento.tsx` ("`useCulturasDaSafra` nao tem cache", motivo de receber a lista por prop) ficou velho —
  o cache existe desde o FASE-B; a prop continua valendo (fora do escopo); (f) a sugestao de cultura recusada ("Todas
  (rateia)") e' ESTADO DE TELA (`culturaRecusadaIds`, como a atividade): some no F5, e a sugestao volta a aparecer.
  · LINHA-GRAVADA (PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL, 02/10): (a) `safra` (texto) e `categoria` sao chaves INERTES de
  `c_editaveis` do `editar_proposto` (o apply_row nao as le'; 0 linhas de staging as tem; o lancamento nao tem coluna para elas,
  e o alinhamento nao as toca) — candidatas a sair da lista num PR de limpeza; (b) o Reverter devolve so' parte dos campos
  (divida MESA-PAINEL (b)), e isso vale tambem depois de uma regravacao; (c) o "Gravar alteracao" NAO AVANCA de linha
  (escolha de tela deste PR: corrigir gravada e' gesto pontual) — revisar com o Gabriel na homologacao; (d) `EnriquecimentoActions`
  (sem renderizador) ainda tem o `soAvanca`, que saiu da Mesa; (e) os outros toasts de erro da Mesa (Reverter, agrupar, escolher,
  desfazer, lote, recasar, excluir sessao) ficam para o PR de acabamentos; (f) dados do Gabriel a corrigir PELA TELA depois do
  deploy: 371/372 (filhos 65dbd985/2de72941), o documento 116396 da linha 16, e as 11 linhas gravadas com safra fora do periodo.
  · SAFRA-COMPETENCIA (PR-CONC-ENRIQ-SAFRA-COMPETENCIA, 02/10): (a) a sugestao de safra da Mesa passou a ler a view: em SESSOES
  ANTIGAS (anteriores ao `_planilha`, 30/09) 236 linhas sem safra perdem a sugestao (a proposta tem o subcentro em TEXTO, sem
  `plano_conta_id`, e o lancamento e' cru) e 129 ganham (o plano pelo id existe e o texto nao casa: Nutricao Cria/Engorda; ou o
  texto casa num plano administrativo e o id e' de pecuaria) — zero na 8d6efeb7 e em sessao com `_planilha`, zero troca de
  uma safra por outra; (b) FORA DA MESA a regra antiga continua no front: `safraSugerida` (codigo + temporada) no
  `LancamentoV2Dialog` e no import de custeio — hoje da' o mesmo (41 safras ativas com codigo = periodo), mas e' a segunda
  regra; (c) o `fn_classificacao_casar_sessao` NAO E' IDEMPOTENTE (achado no ensaio): dois Recasar seguidos na b8e5641d
  (Agnaldo) passam 21 linhas de `exato` a `ja_classificado`, sem mudar par nem proposta — frente do casador; (d) o papel do
  canal MCP de leitura (`supabase_read_only_user`) nao executa `_fn_safra_da_competencia` (nem `_fn_classificacao_linha_livre`):
  consulta pela view que peca essas colunas vai pelo canal write em DO + RAISE; (e) [resolvido no fix1: textos curtos e uma
  dica so' no slot da Safra]; (f) a 214 da 8d6efeb7 (Vivo, "Comunicacao e Energia Pecuaria", safra "Nao se aplica" na planilha) passa a ter
  26/27-Pec no topo no proximo Recasar — e' o que a sugestao do front ja' gravava no Salvar; (g) [resolvido no fix1: na
  lavoura o aviso e' so' texto]; (h) as safras INATIVAS AMD/MAND medem 107/113px em "competencia: X" e cortariam no slot —
  nao aparecem porque `_fn_safra_da_competencia` so' devolve safra ATIVA; codigo ativo novo com mais de 9 caracteres pede
  remedir o slot.
  · PROPOSTA-PAR-MUDOU (PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU, 02/10): (a) LIMITE D5 ACEITO: linha editada ANTES do PR (manual, sem
  `chaves_do_operador`) conta TODA chave presente no topo como do operador — inclusive o alinhamento de uma linha que foi gravada
  e revertida (a 79 da 8d6efeb7 tem 17 chaves no topo, com `data_pagamento`/`conta_bancaria_id`) e campo esvaziado de proposito
  volta preenchido; o aviso "par mudou" cobre; (b) SESSAO SEM `_planilha` (anterior a 30/09): na linha manual reavaliada a
  precedencia CRIA o `_planilha` a partir do topo, que e' o do operador (244 linhas manuais nao aplicadas sem `_planilha` em
  02/10; bdbdafc8 101) — a "planilha: X" dessas linhas mostraria a edicao, nao a planilha; decidir se a linha manual sem
  `_planilha` deve ficar sem ele; (c) o casar continua NAO IDEMPOTENTE no STATUS (ja registrado em SAFRA-COMPETENCIA (c)):
  medido de novo na bdbdafc8, 31 linhas mudam de status num segundo Recasar, no corpo antigo e no novo, sem mudar par nem
  proposta; (d) `fn_classificacao_reresolver_sessao` tambem escreve `update_proposto`, mas so' em linha nunca editada
  (`proposto_editado_em IS NULL`) e so' pelo `postgres` — fora deste PR; (e) a marca `par_mudou_em` fica no `casamento_meta` ate'
  o proximo Recasar que troque o par de novo: o aviso some pela EDICAO ou GRAVACAO (`parMudouNoRecasar`), nao por limpeza.
  · BOITEL-PAINEL (PR-OC-BOITEL-PAINEL-01 e a FASE 0 PR-OC-BOITEL-ACERTO-CLAREZA, 02/10): (a) TRAVA DE P1 PELA DATA DO
  ENVIO: o "reaplique o Realizado" mexe no valor, nao no rebanho do mes do envio, mas o Salvar da Negociacao trava pelo mes da
  data da OC (`mesFechadoMotivo`, `VendaModalShell`); `oc_revalorar_lote` passa no banco com o mes fechado (simulado em
  ROLLBACK na b58bf556); (b) O FINANCEIRO NAO ACOMPANHA O REALIZADO: principal programado/materializado fica 'pendente' no
  `oc_revalorar_lote`, e o slot e' rebaixado por `salvar_lotes` do projetado (b58bf556: 593.145,00 → 565.217 em 31/08); (c)
  ADIANTAMENTO DEVOLVIDO SEM DONO: nenhum caminho o atualiza ao realizado (7f7de76f: 42.416,00 projetado x 46.458,50 pago); (d)
  CONFERENCIA DO FINANCEIRO NA MODALIDADE B: comparar o liquido de entradas e saidas da view com o "(=) Liquido" — escondida no
  painel; (e) OCs a conferir: 2ca81c1b e 8dcafa8e (Vera; adiantamento no boitel sem devolvido na OC: −133.455,00 e −51.951,00
  contra o papel), da0b8577 (RRCC; −7.854,00 contra o motor, e o slot 410.836,79 tambem diverge), 3260d1c8 (NJ; sem papel e
  `valor_total_diarias` nulo); b58bf556 (principal desfeito pelo Gabriel em 02/10 15:53, "valor sem sanidade") e 7f7de76f
  (−1.102,17) sao o conserto de dado da FASE 0.
  · TRANSFERENCIA-VOLTA (PR-CONC-MESA-TRANSFERENCIA-VOLTA): (a) `EnriquecimentoActions.tsx` NAO TEM QUEM O RENDERIZE desde
  fe26d14c (06/09, Mesa compacta) — o `slotTransferencia` nasceu dois dias depois (9fb376ab) ja' sem tela; o componente
  fica so' como dono do TIPO `EnriquecimentoActionsProps` (apagar o corpo ou religar e' decisao); (b) `AcaoEhTransferencia`
  nao tem prop para nascer ABERTO: no Dialog e' 1 clique a mais em "E' transferencia para ▾" (nao reescrito); (c) o resumo
  da simulacao corta com "…" (`truncate`, regra da reticencia) — no Sicredi Pessoal "Sicredi Pessoal → Invest-Sicredi Pe…";
  (d) o `ContaBancariaSelect` nasce com o gatilho em branco (valor '__none__' sem placeholder visivel); (e) o mesmo gesto da
  lista "Sem par no sistema" segue com a recusa em toast (`EnriquecimentoSemParSistema`).
  · SESSAO-E-DEPARA (PR-CONC-EXCEL-SESSAO-E-DEPARA-01): (a) `preResolverFazenda` ficou so' como reserva da Mesa para sessao
  sem `_planilha` (anterior a 30/09) — sai quando essas sessoes forem excluidas; (b) a conta segue com resolvedor proprio no
  front (divida ja' registrada); (c) ANTES deste PR, responder o de-para de fornecedor fora dos 1.000 primeiros pode ter
  APAGADO apelidos (`aliases` regravado so' com o texto novo) — nao ha trilha para medir quantos; a reimportacao mostrara'
  como "a resolver" o que perdeu; (d) Starlink: o apelido esta' num fornecedor INATIVO, e o resolvedor so' olha ativos —
  continua "a resolver" (decisao: reativar o fornecedor ou ensinar de novo).
  · PLANILHA-COMPLETA (PR-CONC-EXCEL-PLANILHA-COMPLETA-01): (a) STATUS DA PLANILHA: guardado em `excel_status`, NAO aplicado —
  "Sim" nao esta' no vocabulario (realizado/pago/liquidado · previsto/a pagar/aberto); falta a regra (o que "Sim" significa);
  (b) sessoes anteriores ao PR (32c52f5c inclusive) NAO tem safra/tipo doc/forma/status: so' reimportando; (c) o
  aprendizado da Mesa (escolher a conta -> apelido composto) nao tem teste de componente da aba (o helper e o caminho do
  banco tem); (d) no proxy, 117 linhas com texto de safra que nao resolve ("Despesas Pessoais" 85, "Nao se aplica" 31 e o
  apelido ambiguo da 25/26-AMD inativa) — conferir na planilha reimportada, onde a coluna Safra e' a de verdade.
  · ENRIQUECER-V2 (PR-CONC-ENRIQUECER-V2-01): (a) SAIRAM do rodape da Mesa o "Salvar" (o Aprovar e' o Salvar + avanco),
  "Revisado"/"Exatos" (o lote e' o "Gravar N prontas" do painel) e o "Ao fornecedor" — RELIGADO no "⋯" do cabecalho da
  Mesa no PR-CONC-ENRIQ-AGRUP-2a, so' proposta; (b) o casador da sessao 8d6efeb7 (BB, 01/09) casou as DUAS linhas "Telefone 506,51" no MESMO
  lancamento (8ebd63d4) e deixou o outro "Vivo Casa 506,51" (e7970f00) so' no sistema — o Extrato mostra como ↳ + "So' no
  sistema"; lancamentos iguais sao normais, o que se mede e' o PAR (ENRIQ-CASADOR-IGUAIS-01, frente de banco); (c) o selo
  da pronta classificada (exato/divergente) e' "Diverge" — o briefing nao nomeou selo para "pronta, classificada"; (d) a
  1.135x579 do Gabriel, o bloco Identificacao da Mesa fica abaixo da dobra (a grade rola por dentro; layout fixo intacto).
  · AGRUPAMENTOS (PR-CONC-ENRIQ-AGRUP-2a; o 2b e' a tabela de blocos, decisao (ii) do Gabriel): (a) o N:1 (`resolvido_grupo`,
  N lancamentos = 1 linha) NAO TEM GRAVACAO — fica no balde `aguarda`, fora do "Gravar N", ate' o 2b; e o 2b PRECISA das mesmas
  guardas de origem do desmembrar: o caso real do Rabobank 26.127,18 (sessao 8d6efeb7, `sugestao_grupo`) sao DUAS parcelas de
  financiamento (juros 3.407,89 + amortizacao 22.719,29) — aplicar a classificacao da linha nas duas quebraria o financiamento;
  (b) o desmembrar continua SEM REVERSAO (estado_anterior NULO; os 12 lancamentos `mesa_split` ja' cancelados foram repassados
  a mao a OC/financiamento) — vem com a tabela de blocos; (c) o casador nao acha os blocos que existem: o "N:N" de 18/09 no BB
  (4 linhas Receita Federal x 2 crus) sao DOIS desmembramentos 1:N (22.187,46 = 15.531,22 + 6.656,24; 709,76 = 354,88 +
  354,88, classificacoes diferentes) — provados pela RPC em ROLLBACK, nao gravados; (d) Sicredi Lavoura ago/26: o T Cortez
  20.998,80 (28/08) e' RECEBIMENTO no extrato sem lancamento e sem linha de planilha no proto; os crus do Emerson (579f22d5
  3.000, 6438bdcb 16.276,80) estao SEM vinculo vivo com o extrato — o desmembrar recusa (`sem_vinculo_ofx`); (e) o caminho
  de recusa ainda vai a toast (`handleAgruparNesteLancamento`) — UX-TOAST-01.
  · AGRUPAR NO EXTRATO (PR-CONC-ENRIQ-AGRUP-2b-TELA): (a) e (b) — o 1x1 e o NxM sem gravacao — FECHADOS no
  PR-CONC-ENRIQ-BLOCO-NM-B; (c) o lado Sistema do Enriquecer so' tem o REALIZADO do mes: previsto/programado/agendado nao se
  marcam aqui — e por isso o 1x1 cru cujo lancamento caiu no mes seguinte (TOKIO MARINE 1.690,71: planilha ago/26,
  pagamento 10/09) nunca aparece com os dois lados na mesma tela.
  · BLOCO-NM (PR-CONC-ENRIQ-BLOCO-NM-A banco, NM-B tela): (a) LIGADAS no NM-B (Extrato da planilha); o desfazer do casar
  1x1 manual NAO tem tela (fora do NM-B); (e) "MARCAR TODOS DO FAVORECIDO" FECHADO no PR-CONC-ENRIQ-MARCAR-FAVORECIDO
  (4 cliques no Emerson e no T Cortez); fica: enquanto as DUAS acoes "+ N de" estao na barra (1 marcado de cada lado), o
  recado/motivo encolhe a 16px a 1135 (fica no `title` do gesto) e volta inteiro depois das acoes; o sistema chaveia pelo NOME
  do cadastro porque `EspSis` nao declara `favorecido_id` (o Espelho o emite) — homonimos se juntam (NJ set/26: "Banco
  Sicredi", 2 ids, 3 lancamentos); o `truncate` do recado e' pre-existente e corta com "…" (regra da reticencia);
  (f) o `cru` da tela e' `origem extrato/ofx` + `subcentro` vazio (o Espelho nao traz `plano_conta_id`), e o bloco recusa por
  `plano_conta_id` vazio: medidos 315 lancamentos realizados com plano vazio e subcentro escrito (Vera 314 — 266 importacao +
  48 manual —, Agnaldo 1 do extrato), que a tela trata como classificados e o banco recusa (`lancamento_cru`, frase na barra);
  (g) N×1 com lancamento MANUAL classificado agora e' BLOCO (o desmembrar so' se oferece com cru), embora a RPC do
  desmembrar aceite 'manual' — regra do briefing do NM-B; (b) `desfazer_proximos`
  devolve SEMPRE a linha a `candidatos_proximos`, sem olhar a origem — a linha que veio de `sem_match` pelo casar manual
  voltaria a "candidatos" sem ter candidato; a origem esta' gravada em `casamento_meta.status_anterior` (NAO no
  `estado_anterior`, que o apply_row le' como o do LANCAMENTO) — PR de banco, nao alterado; (c) o T Cortez set/26 (23 x 49)
  nao fecha (+10.764,11, o Pix de 25/09 sem lancamento, extrato 0001ae41): o bloco recusa `soma_divergente`, como deve;
  (d) a recusa do Recasar provada no NM-A e' a do STATUS (o corpo antigo devolvia as 6 linhas do bloco a `sem_match`); o furo
  do `v_usados` (lancamento de grupo casado 1:1 por outra linha) nao reapareceu no caso real — o conserto vale para os dois.
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
- ⚠ PISO DE 9,5px, COM DUAS EXCECOES E SO' ELAS: (1) a Grade do DRE, cuja regua inteira mora em `REGUA_LINHA`
  (`src/components/agri/dreGrade.tsx`) — subtotal 11/500/20/recuo 0, grupo 9/500/16/recuo 8, simples
  9/400/16/recuo 8, filha 9/400/14/recuo 16, sub-coluna (R$/ha, /sc, /t) 9,5; (2) excecao: selo de status/motivo da
  Conferencia e do modal de sugestoes a 8px (`CelStatus` em `EspelhoConciliacaoTab.tsx`, decisao do Gabriel 30/09: "e so
  uma referencia", PR-CONC-CONFERENCIA-MODAL-01-fix2; o selo de motivo e o status de `SugestoesCasarModal.tsx`,
  PR-CONC-SUGESTOES-CASAR-01) — so os selos, as tabelas seguem a 9,5; (3) na Mesa (PR-CONC-MESA-PAINEL-V1), o rotulo
  auxiliar a 8,5px — "do extrato", "pelo historico do banco", "transferencia" e o selo "cru/classificado" do rodape —,
  com o corpo da tabela a 10,5; (4) a LISTA da Mesa compacta (PR-CONC-ENRIQUECER-V2-01, decisao do Gabriel no briefing):
  168px, itens de 16px a 8,5px (`LARGURA_LISTA_MESA`/`ALTURA_ITEM_LISTA` em `EnriquecimentoMesaModal.tsx`) — e' navegacao,
  o painel ao lado repete a linha inteira. Excecoes declaradas, nao precedente:
  abaixo de 9,5px fora delas reprova o PR.
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
- ⚠ LAYOUT FIXO — TUDO NO SISTEMA E' FIXO (regra soberana do Gabriel, 30/09/2026, PR-CONC-MESA-LAYOUT-FIXO-01):
  selecionar, digitar ou trocar de linha NUNCA muda altura de linha, largura de coluna, posicao do rodape nem liga/desliga
  rolagem. Como se faz: `table-layout: fixed` + `colgroup` medido no pior texto (nunca largura pelo conteudo); linhas de
  altura FIXA sempre presentes (nenhuma aparece/some por condicao — campo que nao se aplica fica em leitura "—" com o
  motivo); dica/rotulo auxiliar num SLOT DE LARGURA FIXA dentro da celula, sempre presente mesmo vazio (nunca ao lado
  estreitando o controle, nunca em linha extra); aviso num slot de altura fixa reservado (vazio quando nao ha) ou no
  `title`. Exemplo vivo: a Mesa de revisao (`MesaCamposTabela`: colgroup 140px | auto | auto | 44%, linha 22, slot da
  dica 104, selo de 148; ORDEM DO NOVO LANCAMENTO DO FINANCEIRO (PR-CONC-MESA-ORDEM-03): blocos Datas e pagamento
  (COMPACTO: Competencia, Data venc., Data pgto., Valor, Conta bancaria, Conta destino) · Identificacao (Fornecedor,
  Descricao) · Classificacao (Atividade, Fazenda, Plano de contas, Safra) · Complemento (COMPACTO: Documento · tipo, Forma de
  pagamento, Observacao); linha de 22 nos blocos normais e de 18 nos compactos (texto 9,5, controle 16 —
  `CELULA_EDITAVEL_COMPACTA`), a ALTURA E' DO BLOCO; o "do extrato" e' marca explicita na ORDEM (`doExtrato`), nao o bloco.
  SEM LINHA VAZIA: os avisos moram a' direita da linha do checklist (18px); a decisao e' um SLOT DE 96px NO RODAPE de 32
  (◀ ▶ Reverter | decisao | mensagem | Pular | Aprovar) — com decisao "● Abrir decisao" em ambar, que abre as MESMAS faixas
  (o no' `faixas` da aba, `null` quando a linha nao pede) num Dialog; sem decisao o slot fica vazio com a mesma largura;
  trocar de linha fecha o Dialog; a mensagem do rodape e' UMA, pela prioridade banco recusou > falta > diverge do extrato
  (`mensagemDoRodape`). Medido a 1135x579 no NJ set/26 (Itau BBA e Sicredi Lavoura): tabela visivel 391 = a grade inteira
  (scrollHeight 391, nao rola), topo do rodape 490, rodape 32, iguais sem decisao, com decisao, com "falta" e com aviso).
  ⚠ NASCE DE DOIS PRINTS: o "pelo historico do banco" ao lado do select da forma estreitava o campo e empurrava a coluna
    (19:50), e o "planilha dizia" nascia abaixo da tabela empurrando o rodape (18:59).
  ⚠ O jsdom NAO MEDE: o teste prova o CONTRATO (colgroup, alturas declaradas, slots sempre presentes, mesma assinatura em
    todos os estados); a medida renderizada (offsetWidth/offsetTop em varios estados) vai no relatorio.
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
  ⚠ EXCECAO DECIDIDA (Gabriel, 30/09, PR-CONC-CRIAR-LOTE-LAYOUT-01): no "Criar lancamentos em lote", o DOCUMENTO e o
    HISTORICO do banco que nao cabem na regua (Bradesco 91 caracteres, pedagio 126) sao cortados NA BORDA, sem "…", com o
    texto inteiro no `title`. Excecao declarada, nao precedente.
- ⚠ CASCA DE MODAL (MODAIS-PADRAO-01a..f): cabecalho 36px/13px, corpo `100vh-32` sem o teto do tema,
  resumo lateral de 240px com as pecas de `src/components/ui/linha-resumo.tsx` (`AsideResumo`,
  `FaixaTituloResumo`, `SecaoResumo`, `LinhaResumo` — `quebra` para texto livre), rodape de 32px com botoes
  de 22px. Os lancamentos simples usam o `LancamentoModalEnvelope`.
- ⚠ O TEXTO DO `SelectTrigger` FICA A' ESQUERDA E CORTA NA BORDA, EM TODO O SISTEMA (UI-SELECT-ALINHAMENTO-01): o span do
  valor leva `min-w-0 text-left break-all` no proprio componente (`src/components/ui/select.tsx`). O gatilho e' um <button>
  (centralizado por padrao) e o texto que nao cabia herdava o centro ("Folha de..." com um vazio a' esquerda). Conserto e' no
  componente, NUNCA classe solta por tela; o span NAO leva `flex-1` (o gatilho com `justify-center`, o ano do Fechamento,
  continua centralizado). Os combobox que nao sao `SelectTrigger` (fornecedor, conta do plano) nao foram tocados.
- ⚠ TODO MENU ABERTO TEM UM PADRAO SO', NUM DONO SO' (UI-DROPDOWN-PADRAO-01, A23): `src/components/ui/menuPadrao.ts` —
  `MENU_PALETA` (`bg-zinc-600` desde o fix1, rgb(82,82,91), texto BRANCO: OPACO, sem alpha nem blur, a mesma cor sobre o
  branco e sobre o navy), `MENU_ITEM` (20px / 9,5px, o piso), `MENU_ROTULO`, e o REALCE (`MENU_REALCE*` zinc-700,
  `MENU_ESCOLHIDO*` zinc-700/60), o secundario (`MENU_SECUNDARIO`/`MENU_VAZIO` zinc-200) e a busca (`MENU_BUSCA` zinc-700).
  ⚠ TODO TEXTO DE MENU >= 4,5:1 (decisao do Gabriel, 02/10): o item NAO escreve cor, herda o branco da paleta (7,73). Select, DropdownMenu, Command, SearchableSelect e os combobox de `shared/` importam dali; realce em
  `zinc-700`. TELA NAO SOBRESCREVE tamanho nem altura do item de menu (saiu de 41 `SelectItem`, 11 `DropdownMenuItem`, do
  `itemCls` do Financeiro e do `ITEM_DROPDOWN` da Mesa). O texto do gatilho com busca fica `min-w-0 flex-1 truncate
  text-left`. Restam `text-xs` em 7 `DropdownMenuItem` (FinV2ContasTab, FinV2SafrasTab) e `py-*` em 7 `SelectItem`: fila.
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
- ⚠ RPC CHAMADA PELA TELA RODA SOB pg_safeupdate: todo UPDATE/DELETE, INCLUSIVE EM TABELA TEMPORARIA, precisa de
  WHERE. O role `authenticator` do PostgREST carrega `session_preload_libraries=safeupdate`; o canal SQL (MCP, editor)
  NAO, e nao consegue ligar (`LOAD 'safeupdate'` -> "access to library is not allowed"). Teste de RPC nova tem de rodar
  pelo `rpc` do app (com `p_simular` quando houver) — o teste em ROLLBACK pelo canal SQL passa com o defeito dentro
  (FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01-fix1: "UPDATE requires a WHERE clause" na tela, verde no ROLLBACK).
- ⚠ DESLOCAR CHAVE DE INDICE UNICO EM LOTE (competencia, ordem, numero) EXIGE ORDEM SEGURA LINHA A LINHA OU PASSO
  INTERMEDIARIO: o indice unico confere a CADA LINHA, nao no fim do comando (so' constraint DEFERRABLE espera o fim).
  `UPDATE ... SET competencia = competencia - 1 mes` passa ou falha pela ORDEM FISICA das linhas, e a previa nao ve
  (o estado FINAL nao repete). Recuos em ordem crescente, avancos em decrescente; colisao REAL (estado final repetido)
  se detecta ANTES e vira frase legivel — nunca o erro cru do indice na tela (FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01-fix2,
  `uniq_lanc_recorrencia_competencia`).
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
- ⚠ ARQUIVO DE EXTRATO SE LE PELO CHARSET DECLARADO, NUNCA COM `File.text()` (que e' sempre UTF-8):
  `decodificarExtrato` (`src/lib/financeiro/parser/`) — CHARSET/ENCODING do OFX 1.x ou `encoding` do `<?xml ?>`; declarado
  UTF-8 com bytes invalidos ou nada declarado cai em windows-1252. O OFX do BB e do Bradesco vem em cp1252 e gravava
  "Cart\uFFFDo" (PR-CONC-CRIAR-LOTE-LAYOUT-01). O hash do movimento usa a descricao: consertar texto ja' gravado exige
  recalcular o hash junto. Texto ja' gravado com U+FFFD se corrige por DICIONARIO de palavra inteira, nunca por palpite
  de byte, com a replica SQL do hash provada contra o gravado ANTES de trocar (EXTRATO-UFFFD-01, 20261027184700).
- ⚠ ENRIQUECER V2 = PAINEL POR CONTA (PR-CONC-ENRIQUECER-V2-01, 01/10): cada linha da planilha cai em UM balde
  (`baldeDaLinha`, `src/v2/lib/mesa/painelContas.ts`: gravada > pronta > decide > sem banco), "pronta" e' a MESMA
  `elegivelParaLote` do "Gravar N", o Total e' a soma das contas, e o "Revisar N" e' o filtro "Revisar" da Mesa. O Extrato da
  planilha monta pela `montarMesa` da Conferencia (`extratoDaPlanilha.ts`; aplicado do par 1:1 = valor do LANCAMENTO, senao o
  dia "confere" por construcao). O checklist da Mesa (`checklistDaLinha`/`pendenciasDaLinha` em `MesaCamposTabela.tsx`) e' a
  UNICA lista de obrigatorios — desenha o ●, escreve o "falta:" e apaga o Aprovar — e julga Fazenda/Conta do plano/Descricao
  pelo VALOR EFETIVO (o Resultado diz "mantem" ate' com os dois lados vazios).
- ⚠ AGRUPAR PELO EXTRATO DA PLANILHA = O GESTO DA CONFERENCIA (PR-CONC-ENRIQ-AGRUP-2b-TELA, so' tela): marca-se a linha "sem
  par" da planilha (`selPlanilha`) e o lancamento "So' no sistema" (`selSistema`); `gestoDaSelecao`
  (`src/v2/lib/mesa/agruparNoExtrato.ts`) da' a forma — 1x1 casar (`resolver_proximos`), Nx1 desmembrar (`split_substituir`,
  so' com soma ao centavo pela `motivoDoDesmembrar` e confirmacao NA BARRA), 1xN juntar (`resolver_grupo`), NxM desabilitado.
  A barra mora no rodape de 26px no lugar do fechamento do mes (nada muda de altura); a recusa da RPC fica ESCRITA nela e a
  selecao fica; quem grava e' a aba (`agruparDoExtrato`, os mesmos mutations, sem toast), que tambem rele o espelho
  (`espelho-conciliacao` nao era invalidado pelos mutations). O lado Sistema mostra o STATUS (Conciliado/Realizado) pela
  `STATUS_PALETA`; a origem B/✓/M saiu.
- ⚠ DESMEMBRAR (1 lancamento = N linhas, `fn_classificacao_split_substituir`, PR-CONC-ENRIQ-AGRUP-2a, migration
  20261027185000, ledger 20261001101020): so' desmembra lancamento CRU/MANUAL (origem 'extrato'/'ofx'/'manual') SEM vinculo de
  origem — recusa, com motivo escrito, recorrencia, contrato/barter, financiamento/parcela, boitel, parte VIVA de OC, Zoo e
  transferencia; recusa MES FECHADO no consolidado e em cada lancamento novo; copia TODOS os campos do apply_row
  (COALESCE(proposta, consolidado)); os vinculos novos levam UM `grupo_id` e 'agrupamento_manual'; soma ao CENTAVO. Bloco cuja
  soma nao fecha NAO tem proposta e NAO se desmembra a mao (decisao (iv) do Gabriel; `motivoDoDesmembrar`, a mesma frase da
  RPC). "AO FORNECEDOR" (no "⋯" da Mesa) grava SO' A PROPOSTA (`levarAoFornecedor` so' recebe `editarProposto`), alvo pelo ID
  do fornecedor resolvido, so' linha nao aprovada, e a linha JA' CLASSIFICADA fica com o sistema (prevista na previa).
  `resolvido_grupo` fica FORA do lote (balde `aguarda`) ate' o N:1 ter gravacao (2b).
- ⚠ "E' TRANSFERENCIA PARA/DE OUTRA CONTA…" MORA NO "⋯" DO CABECALHO DA MESA (PR-CONC-MESA-TRANSFERENCIA-VOLTA, so' tela):
  o item aparece SO' com `actions.slotTransferencia` (o "⋯" aparece com ele OU com "Ao fornecedor") e abre um Dialog de 520px
  (cabecalho navy 36px "Transferencia · {fornecedor} · {valor}") que renderiza o MESMO no' que a aba monta — nunca uma copia.
  Fecha ao trocar de linha e quando o slot some (o sucesso faz a linha deixar de oferecer o gesto). A recusa do gesto fica
  escrita no Dialog (`erro-transferencia`, slot de 14px), nao em toast. Medido a 1135: tabela 379 / topo 99, rodape 32 / topo
  513,8, iguais com o Dialog aberto.
- ⚠ "+ N DE {FORNECEDOR}" MARCA UM LADO SO' (PR-CONC-ENRIQ-MARCAR-FAVORECIDO, so' tela): a partir da ULTIMA caixa marcada
  de cada lado, `doMesmoFornecedor` (`agruparNoExtrato.ts`) da' os MARCAVEIS daquele lado com a mesma `chaveFornecedor`
  (`extratoDaPlanilha.ts`: planilha = `planilha_favorecido_id`, senao o texto normalizado de `excel_fornecedor`; sistema = o
  nome do cadastro normalizado). As duas chaves NUNCA se comparam — o operador escolhe os dois lados. Fornecedor vazio ("—")
  nao gera acao; linha em bloco, pareada ou transferencia nao tem caixa e nao entra. Na barra de 26px, como botoes inline
  (medido a 1135: as duas acoes + o gesto cabem, grupo da direita 596 de 1088, sem rolagem).
- ⚠ O GESTO DO EXTRATO DA PLANILHA DEPENDE DE CRU x CLASSIFICADO (PR-CONC-ENRIQ-BLOCO-NM-B, so' tela; `gestoDaSelecao`,
  `src/v2/lib/mesa/agruparNoExtrato.ts`), nesta ordem: so' um lado -> nada; TODOS classificados -> "Conferir bloco NxM"
  (`conferirBloco`, qualquer forma, 1x1 inclusive, so' com soma ao centavo, SEM confirmacao em dois passos: nao altera
  lancamento e tem desfazer); ha cru: 1x1 -> "Casar" (`casarManual`, valores iguais ao centavo), Nx1 -> desmembrar, 1xN todos
  crus -> juntar, o resto -> "ha lancamento sem classificacao no bloco: desmembre ou case 1×1". O `cru` e' `lancamentoCru`
  (`extratoDaPlanilha.ts`, origem extrato/ofx + `subcentro` vazio do Espelho). O BLOCO E' DESENHADO SEM PAREAMENTO: linha
  'conferido_bloco' = ✓ enriquecida, nao marcavel; os `match_lancamento_ids` dela = selo "Em bloco" (nao "So' no sistema");
  nenhum vinculo de bloco vai a' `montarMesa` (CONC-MESA-NN-01). O ✓ ou o selo abrem o MODO BLOCO no rodape de 26px (resumo,
  motivo obrigatorio, "Desfazer bloco", "voltar", Esc sai, linhas do bloco realcadas). 'conferido_bloco' = "Ja' gravadas" em
  `GRUPO_DE_STATUS`, balde 'gravada', fora do lote; na Mesa e' LEITURA (sem `onEditar`, Salvar diz por que).
- ⚠ LINHA LIVRE TEM UMA DEFINICAO, NO BANCO (PR-CONC-ENRIQ-BLOCO-ESTADOS, migration 20261027190300, ledger 20261002142918):
  `_fn_classificacao_linha_livre(staging)` = nao aplicada E (sem_match / candidatos_proximos / sugestao_grupo / sugestao_split /
  ambiguo OU par morto: `match_lancamento_id` aponta para lancamento inexistente ou cancelado). O bloco e o casar manual a usam,
  e a view `vw_classificacao_staging_preview` a expoe NO FIM (`linha_livre`, mais `lanc_cancelado` so' para escrever o motivo
  do par morto). A TELA SO' LE': caixa = `linha_livre`; sem a coluna (view antiga) = a regra de antes, nunca livre. Recusa diz o
  que fazer ("A linha N ja' tem par (X). Solte o par antes de conferir."). `fn_classificacao_soltar_par` (`p_simular`) devolve a
  linha nao aplicada a 'sem_match' com `casamento_meta.solto_de`; recusa aplicada, em bloco, sem par; NAO toca o lancamento e
  NAO LIMPA A PROPOSTA (decisao do Gabriel, 02/10: inclusive o que o operador editou; o proximo par ou o Recasar a refaz). No
  Extrato, o simbolo de uma linha com par abre o MODO PAR (26px, Esc sai): "Soltar o par" so' com `parSoltavel`; par repetido
  gravado so' manda reverter na Mesa. A mae de 2+ linhas no mesmo lancamento so' e' "Desmembrar" quando a soma fecha; senao
  "Par repetido". A funcao tem EXECUTE para `authenticated` porque a view (security_invoker) a chama como quem consulta.
- ⚠ A MEMORIA DE APLICACAO ANTERIOR SO' HERDA O PAR QUE VALE PARA A LINHA (PR-CONC-ENRIQ-CASADOR-MES, migration
  20261027190400, ledger 20261002160209): o PASSO 0 do `fn_classificacao_populate_staging` herdava o lancamento de qualquer linha
  aplicada do cliente pela chave valor + competencia + tipo + fornecedor — a parcela de setembro herdava a de agosto. Agora:
  (D0) a REGUA DE DIRECAO TEM DONO, `_fn_conta_do_lancamento(tipo, conta_bancaria, conta_destino)` ('1-Entradas' -> destino,
  senao bancaria; SQL IMMUTABLE sem SET, o planner a embute) — as 4 copias do `casar_sessao` (PASSO 1, 3a `a`/`b`, 3b) usam ela;
  (D1/D2) o par herdado vale so' com `_fn_classificacao_par_herdado_valido(lanc, conta da linha, data, mes_de, mes_ate)`, o UNICO
  dono de: (a) mesma conta da linha (`COALESCE(conta_origem_id, conta_destino_id)`) pela regua; (b) `data_pagamento` IGUAL a' data
  de pagamento da planilha — mes inteiro NAO e' reserva — em QUALQUER conta, o cartao inclusive (a excecao do cartao foi
  REVOGADA no PR-CONC-ENRIQ-CARTAO-MESMA-DATA, regra logo abaixo);
  (D1b) sem data de pagamento na planilha: no POPULATE compara a `data` (a mesma do casamento por atributos), no CASAR o mes da
  sessao; (D3) o (c) — lancamento ja' com outra linha da sessao — mora em cada consumidor com o MESMO desempate: quem falha (a)/(b)
  sai da disputa; lancamento preso em grupo/bloco de linha preservada e' usado; entre as que passam fica a APLICADA, senao a de
  MENOR LINHA. No populate o loop vai em ordem de linha (posicao original desempata) e linha que ja' estava na sessao e' dona; no
  casar e' a CTE `preservadas`/`disputa` no inicio. (D4) O Recasar REABRE (vira 'sem_match' e recasa pela regra normal) a linha
  'ja_aplicado' NAO aplicada que falha; aplicada NUNCA e' reaberta (322/323 seguem), e as outras preservadas disputam mas nao sao
  julgadas; o retorno ganha 'reabertas'. As duas internas: so' `service_role` (as RPCs sao SECURITY DEFINER).
  md5: casar a6a6832f -> c5d725afa76d91242d2c2410984cf38c; populate 5fdbd817 -> 694ddc8baadae71b1d59de92a65c35b3;
  `_fn_conta_do_lancamento` 7bd27d014d20b2566fc35db2613a57e3; `_fn_classificacao_par_herdado_valido` cd12b3e28ca72a93f013d503211b37ed
  (-> 0224916d34eb19f8ad3cb9fcff6b69a7 no PR-CONC-ENRIQ-CARTAO-MESMA-DATA).
  Nenhum dado foi alterado: o conserto das sessoes e' pelo Recasar (e pelo Reverter, nas aplicadas), na tela.
- ⚠ O CARTAO E' UMA CONTA COMO AS OUTRAS NO PAR HERDADO (PR-CONC-ENRIQ-CARTAO-MESMA-DATA, decisao do Gabriel 02/10, migration
  20261027191000, ⚠ registrada como 20261002193356; ledger = arquivo, md5 07d044ba…): a excecao D2 do CASADOR-MES ("cartao
  dispensa a data, a do lancamento e' a da compra") foi REVOGADA — a premissa era falsa e foi decidida sem medir. Medido em
  02/10, % dos lancamentos de cartao no dia mais frequente do mes (a data da FATURA): Agnaldo Elo 99,8 (2.031) e Mastercard
  100 (76); NJ Ourocard 99,7 (286), Visa Infinite 100 (80), Cartao Sicredi Lavoura 100 (158); Santa Rita Cartao Sicredi 100
  (11), Bradesco 93,2 (44), Itau Black 78,1 (2.443; 43,6 em 2021, 56,3 em 2022, ~90 em 2023–24, fatura desde 2025) e Nubank
  70,0 (100). O validador `_fn_classificacao_par_herdado_valido` (dono unico; populate e casar_sessao nao mudaram, so' os
  comentarios deles ainda citam a excecao) exige a MESMA data de pagamento em toda conta; sem data, a janela do mes. Nada
  muda fora do cartao: 17.836 linhas de staging com par em conta que nao e' cartao, saida identica (md5) antigo x novo; no
  cartao mudam 76 de 1.225. O Recasar passa a reabrir 6 linhas na dfd0f02c (274/275/278/286/294/305, cada uma com o
  lancamento de 16/09 livre), 6 na 8d6efeb7 e 6 na 32c52f5c (266/279/290/308/356/432), 7 em cada sessao do Agnaldo (25206941,
  c304cce9, fc4d6089; candidato unico em 10/08, usado pela 9b6785b2 nao aplicada) e 0 na Santa Rita. md5 0224916d…
- ⚠ CULTURA E FASE NA MESA = O SEGUNDO CONTROLE DA LINHA SAFRA (PR-CONC-ENRIQ-MESA-CULTURA-FASE-B, so' tela, 02/10): nenhuma
  linha nova — a linha "Safra" vira "Safra · Cultura" (lavoura), "Safra · Fase" (pecuaria) ou fica "Safra" (o resto) pela
  ATIVIDADE da linha (`eixoDaAtividade`/`rotuloLinhaSafra`; `data-testid` segue `linha-Safra`), e a coluna "Vai gravar" se
  divide 55/45 como Documento · tipo: medido a 1135, 148px para a safra (pior codigo ativo 67) e 121 para o eixo (pior texto
  "Todas (rateia)" 69); linha 22, rodape 32 com topo 513,8 nas tres atividades. O segundo controle
  (`ResultadoCulturaFaseEditor`, `ResultadoCamposGravaveis.tsx`) EXISTE SEMPRE: fora de lavoura/pecuaria e' leitura "—" com
  "nao se aplica a esta atividade". Listas e frases SO' DO DONO (`rateioLancamento.ts`: `CULTURAS_LANCAMENTO`, `FASES`,
  `SEM_CULTURA`, `avisoCultura`/`avisoFase` no `title`; o teste mocka o dono com uma cultura e uma fase a mais). Valor =
  proposta, senao o lancamento, senao a SUGESTAO da planilha em ambar (`culturaSugeridaDaPlanilha`: lavoura, sem cultura em
  lugar nenhum, planilha com cultura) — primeiro item do menu "X · da planilha", que grava no clique SEM `_sugestao`; na linha
  NAO gravada o Salvar tambem a grava COM `_sugestao: true` (a quarta proposta automatica, `culturaSugeridaNoSalvar`); na
  gravada so' o clique. Escolher outra coisa ("Todas (rateia)" inclusive) recusa a sugestao (estado de tela). Trocar a
  atividade limpa o eixo que nao se aplica (`patchesAoTrocarAtividade`). Nunca e' pendencia. "Todas (rateia)" num lancamento
  com cultura: "a Mesa nao apaga · mantem" no `title` e `data-nao-apaga` (na gravada, por `camposEsvaziados`). cultura e
  fase entram em `diferencasDoResultado` ("alterada · falta gravar") e a linha Safra do comparativo leva o eixo nas colunas
  planilha/sistema. O lado da safra no ADMINISTRATIVO mostra so' "—" (ou a safra riscada), a frase no `title` (cortava a 148).
  ⚠ `useCulturasDaSafra` (`src/hooks/useAreaPlantada.ts`) TEM CACHE POR SAFRA, NO DONO: uma consulta por safra por sessao para
    todo consumidor (Financeiro, obrigacao, Mesa); o `salvar` do cadastro de area (unico escritor de `agri_safra_area`, nenhuma
    funcao do banco escreve nela) chama `invalidarCulturasDaSafra`, e quem a mostra reconsulta. A Mesa so' pede na lavoura.
- ⚠ CULTURA E FASE: O BANCO E' O DONO DA COERENCIA (PR-CONC-ENRIQ-MESA-CULTURA-FASE-A, migration 20261027190500, ledger
  20261002171822): o gatilho `trg_zz_cultura_fase_coerente` (BEFORE INSERT OR UPDATE em `financeiro_lancamentos_v2`, depois de
  `trg_resolve_classificacao_plano` pela ordem alfabetica) zera a CULTURA fora de agricultura e a FASE fora de pecuaria, para
  todo escritor; `culturaParaGravar`/`faseParaGravar` (`src/lib/agri/rateioLancamento.ts`) sao ESPELHO declarado, e
  `CULTURAS_LANCAMENTO` tem o espelho `_fn_culturas_lancamento()` (seis, sem eucalipto). Na Mesa: `editar_proposto` aceita
  `cultura`/`fase` (vazio tira a proposta; fora da lista recusa); `apply_row` grava COALESCE(proposta, lancamento) — nunca
  apaga por ausencia; `estado_anterior` guarda as duas e o `reverter_row` so' as devolve com a chave presente (aplicada antes
  do PR fica como esta'); o split copia COALESCE(proposta, consolidado). A planilha nao tem coluna de cultura: ela sai do TEXTO
  DA SAFRA por `_fn_classificacao_cultura_da_planilha` (palavra inteira, uma so', so' com a safra resolvida de agricultura;
  fase nunca se deriva) e mora em `update_proposto._planilha.cultura`; `cultura` esta' em `k_class` da precedencia (no cru sobe,
  no classificado fica de referencia). A view expoe no fim `lanc_cultura`, `lanc_fase`, `planilha_cultura`, `proposto_cultura`,
  `proposto_fase`. md5: editar_proposto 8a586737…, apply_row 85cc0df6…, reverter_row 763c5cf5…, precedencia_cru 65bcb707…,
  split f964b0dd…, populate b62d8e0e…, view efc468cb…
- ⚠ NA PECUARIA A COMPETENCIA DECIDE A SAFRA; NA LAVOURA A PLANILHA VALE E A TELA AVISA (PR-CONC-ENRIQ-SAFRA-COMPETENCIA,
  Gabriel 02/10 14:39; migrations 20261027190700 ledger 20261002182140 e 20261027190800 ledger 20261002182544). Dono UNICO:
  `_fn_safra_da_competencia(cliente, escopo, data)` = a safra ATIVA do escopo cujo periodo (data_inicio..data_fim) contem a
  data; zero ou duas -> NULO (sem palpite). SECURITY DEFINER com a guarda `tenant_ok(cliente)` por chamada (sem usuario, sem
  guarda) — a RLS de `financeiro_safras` por linha dobrava o custo da view. (D2) `_fn_classificacao_precedencia_cru`, ramo do
  CRU: atividade do topo = escopo do plano que sobe (sem plano, o da safra da planilha); se PECUARIA, a safra do topo = a da
  competencia que vai ser gravada (a do topo; senao a do lancamento); NULO -> a planilha. `_planilha` guarda a da planilha. Linha
  MANUAL nao entra (a escolha do operador vence), classificado/gravada/lavoura nao mudam. (D5) a view expoe no fim
  `safra_da_competencia_id` (atividade = plano que vai ser gravado, senao a safra) e `safra_fora_do_periodo` (a safra que vai ser
  gravada nao contem a competencia que vai ser gravada); a Mesa so' le': dica ambar "competencia: X" que APLICA pelo
  `editar_proposto` na pecuaria e e' SO' TEXTO na lavoura (a safra atravessa o ano de proposito; fix1, Gabriel), sem candidata
  "fora do periodo", e "pela competencia" (neutra) quando o banco trocou — a frase inteira, com a safra da planilha, no `title`;
  na linha Safra o slot de 104px mostra UMA dica so' (aviso > pela competencia > sugestao > marca da planilha; as outras no
  `title`) — medido: o pior codigo ATIVO ("competencia: 20/21-Pec") pede 102px. NUNCA e' pendencia do checklist. (D7) a safra sugerida da linha sem safra le' `safra_da_competencia_id` — sem segunda regra na Mesa.
  md5: precedencia_cru f9db83d4…, `_fn_safra_da_competencia` 81e2f6bb…, view b041b03e…. Custo da view na 8d6efeb7
  (authenticated): {920,912,906} ms (antes {883,791,798}).
- ⚠ QUANDO O RECASAR TROCA O PAR, A PROPOSTA E' REFEITA PARA O PAR NOVO E SO' FICA O QUE O OPERADOR MEXEU
  (PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU, Gabriel 02/10, migration 20261027190900, ⚠ registrada como 20261002190947; ledger = arquivo,
  md5 80bdf66b…). (D1) `editar_proposto` anota em `_meta.chaves_do_operador` as chaves de TODO patch do operador, removidas
  inclusive (subcentro leva macro/grupo/centro/plano_conta_id); o alinhamento da linha gravada NAO entra. (D2) `"_sugestao":
  true` no patch e' lido e NAO gravado, e as chaves dele nao entram na lista — a tela o manda SO' nas tres propostas automaticas
  do `salvar()` (alinhar subcentro, safra sugerida, forma pelo historico); edicao do operador nunca. (D3) o casar tira a foto do
  par antes do "limpa" e, na linha NAO aplicada fora de grupo/bloco (o `ambiguo` com candidatos NAO e' grupo) cujo par mudou
  (nenhum<->par inclusive), grava `casamento_meta.par_anterior` e `par_mudou_em = now()`; par igual devolve a marca que ja'
  havia. (D4) a precedencia reavalia — MESMO na manual — a linha com `par_mudou_em = now()`: chave da lista fica (com o valor,
  ou ausente); o resto e' a regra para o par novo (cru: planilha + excel + safra da competencia; classificado: sai do topo).
  Isto REVOGA, so' para a linha cujo par mudou, o "linha MANUAL nao entra" da precedencia. (D5) manual SEM lista: presente =
  operador, ausente = regra. (D6) depois, `update_proposto_original` = a regra para o par novo (com o `_meta` nao manual) e a
  linha so' continua manual se restar chave do operador. (D7) linha aplicada, conferido_bloco e grupo: fora. (D8) a Mesa avisa
  "par mudou no Recasar · confira" (ambar, no slot da mensagem do rodape, sem bloquear) enquanto `par_mudou_em` > ultima edicao e
  ultima gravacao (`parMudouNoRecasar`, `src/v2/lib/mesa/enriquecimentoView.ts`); prioridade: erro ao gravar > erro ao editar >
  par mudou > falta > gravada > diverge (`mensagemDoRodape`). Prova: Recasar antigo x novo na bdbdafc8 (551 linhas) e na
  b8e5641d (172): 0 par e 0 status diferentes; muda 1 proposta (a 517 da bdbdafc8, manual sem lista que ganhou par: so' o
  `_meta` ganha a lista e o `_planilha` nasce); o segundo Recasar nao muda proposta nenhuma. md5: editar_proposto 4155bca8…,
  casar_sessao 01de1fd5…, precedencia_cru c30287e0…; ACL inalterada.
- ⚠ LINHA GRAVADA E' EDITAVEL NA MESA, E A BASE DELA E' O LANCAMENTO (PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL, migration
  20261027190600, ledger 20261002175601): no classificado o sistema prevalece, entao a proposta de uma linha gravada so' carrega o
  que o operador mudar DEPOIS de gravar. (D1) `_fn_classificacao_alinhar_ao_lancamento(proposta, lancamento)` e' o dono UNICO de
  "proposta = lancamento": iguala o topo nas 17 chaves editaveis que o lancamento tem (subcentro leva macro/grupo/centro/
  plano_conta_id; produto <- descricao; NULO = chave ausente), sem tocar `_planilha`, `_meta`, `safra` e `categoria`; o
  `editar_proposto` o chama ANTES da edicao so' em linha APLICADA ainda nao editada depois da ultima gravacao
  (`proposto_editado_em` NULO ou <= `aplicado_em`) — linha nao aplicada: identico (30/30 md5). (D2) gravar = o mesmo `apply_row`
  com overwrite, que move `aplicado_em`. Sem o alinhamento, o overwrite levava a proposta velha inteira: no filho de split
  apagava o "[split: … consol=…]" da observacao (o unico elo com o consolidado; provado por mutacao) e em 1.281 das 2.665
  aplicadas desfaria correcao feita depois. (D3) "alterada · falta gravar" = aplicada E `proposto_editado_em > aplicado_em` E
  `diferencasDoResultado` nao vazio (`estadoDaLinhaGravada`, `src/v2/lib/mesa/enriquecimentoView.ts`; a data sozinha nao basta,
  o comparativo sozinho tambem nao): botao "Gravar alteracao" (nao avanca); sem alteracao, apagado e "ja gravada"; bolinha ambar
  na lista, a linha segue em "Feitas". (D4) a view expoe no fim `tem_estado_anterior` e `proposto_editado_em`; o Reverter habilita
  por `tem_estado_anterior` e, apagado, escreve o motivo no rodape ("desmembramento · desfazer ainda nao existe",
  `motivoReverterBloqueado`). (D6) no filho de desmembramento (`lanc_origem_lancamento = 'mesa_split'`) a Observacao e' SO'
  LEITURA ("elo do desmembramento"). (D7) `bloqueiaPorAgrupamento`: a parte de agrupamento so' passa quando e' o filho GRAVADO.
  (D8) campo esvaziado numa gravada: "a Mesa nao apaga · mantem". (D9) erro de editar/salvar no rodape (`erroEdicao`/`erroBanco`),
  nunca em toast, e a grade REMONTA (`versaoRestauro`) para o campo recusado voltar ao valor do banco. (D11) as tres propostas
  automaticas do Salvar (alinhar subcentro, safra sugerida, forma pelo historico) so' em linha NAO gravada (`rodaSugestoesDoSalvar`).
  md5: editar_proposto 83a28c3c…, `_fn_classificacao_alinhar_ao_lancamento` ba92442c… (so' service_role), view 94bc36f3… (depois
  b041b03e…, PR-CONC-ENRIQ-SAFRA-COMPETENCIA).
- ⚠ BLOCO CONFERIDO N×M NO ENRIQUECER (PR-CONC-ENRIQ-BLOCO-NM-A, migration 20261027190200, ledger 20261002115607): N linhas da
  planilha x M lancamentos CLASSIFICADOS e REALIZADOS da mesma conta, soma COM SINAL ao centavo (tolerancia 0,005; sinais
  opostos permitidos) -> as linhas viram 'conferido_bloco' com os M ids em `match_lancamento_ids`. NAO ESCREVE no lancamento
  nem em `conciliacao_bancaria_itens`. `fn_classificacao_conferir_bloco` (`p_simular`, SQLSTATE 'CBSIM'), recusas com motivo e
  frase (lancamento cru -> "desmembre ou case 1×1", ja' escolhido, outra conta, mes fechado, soma divergente);
  `fn_classificacao_desfazer_bloco` (motivo obrigatorio) restaura pelo `estado_anterior` de `classificacao_blocos` e recusa
  linha que saiu do bloco por outro caminho; itens em `classificacao_bloco_itens` (trilha, sem FK). Escrita SO' pelas funcoes
  (authenticated so' le', RLS `tenant_ok`). `fn_classificacao_casar_manual`: classificado -> bloco 1x1; cru do extrato ->
  'resolvido_manual' + `_fn_classificacao_precedencia_cru`; valor/sinal/conta diferentes recusam.
  ⚠ 'conferido_bloco' E' STATUS PRESERVADO: entrou nas CINCO listas do `fn_classificacao_casar_sessao` e na do
    `fn_classificacao_excluir_sessao`, e o `v_usados` do Recasar passou a somar `unnest(match_lancamento_ids)` — antes so' o
    singular, e um lancamento de grupo/bloco ficava livre para o Recasar casar 1:1. Status preservado novo entra nas SEIS.
- ⚠ ICMS DA NOTA DA MANDIOCA E' REPASSE, NAO DEDUCAO (MANDIOCA-ICMS-REPASSE-01, migration 20261027185200, ledger
  20261001123042): o comprador devolve o ICMS da NF. O `icms` vai para "ICMS a Repassar - Pago" (10006) e nasce junto o
  `icms_recebivel` (entrada, "ICMS a Repassar - Devolvido", 3026, favorecido = comprador), os dois FORA do DRE pela regra 1b
  (plano com `compoe_dre = false` vence a matriz; por isso o insert passa `compoe_dre` NULO). O ICMS de transporte (311,14) e'
  CUSTO do frete (13090) e, como o da venda, UMA VEZ POR NF. Todo papel da carga entra por UMA funcao interna
  (`_agri_carga_inserir_papel`) e a pergunta "uma vez por NF" e' UMA (`_agri_carga_papel_na_nf`); papel que falta numa NF ja'
  registrada se acrescenta por `agri_carga_mandioca_completar`, que herda conta, SAFRA e fazenda da VENDA da carga (nao do
  talhao). O estado anterior do backfill das 14 NFs mora em `mandioca_icms_repasse_01_backfill` (gesto contrario linha a linha).
  ⚠ A RETENCAO DA NF-e DO COMPRADOR (Funrural 1,63% ago, SENAR 0,2% set) E' O PAPEL 'funrural', UMA VEZ POR NF
    (MANDIOCA-RETENCAO-NF-01, migration 20261027185600, ledger 20261001144347): o comprador retem e deposita o LIQUIDO, entao o
    "falta" da venda num deposito NAO e' recebivel — e' a retencao. Saida, programado, deducao (b451681a), favorecido = comprador,
    conta da venda, competencia = carga da NF; o registrar e o modal (`funruralTravado`) travam por NF como o ICMS, e
    `agri_carga_mandioca_completar(…, p_rotulo, p_nfe)` a acrescenta ("Funrural retido 1,63% · NF x · NF-e y"). Backfill das 16 NFs
    (1.564,96; 43,30 da 9320690 na 26/27, invisivel no DRE — LAVOURA-2627-INVISIVEL-01) em `mandioca_retencao_nf_01_backfill`.
  ⚠ NO 'exato' O BLOCO ACEITA LANCAMENTO DE SINAL OPOSTO (venda + e retencao - contra o deposito liquido; soma com sinal); o
    oposto vincula INTEIRO ao extrato MAIS ANTIGO do bloco. O 'mais_antigo_primeiro' segue uma direcao so' (recusa
    `direcao_incoerente`).
- ⚠ BLOCO DE CONCILIACAO = N EXTRATOS x M LANCAMENTOS NUMA GRAVACAO (CONC-BLOCOS-01, migration 20261027185300, ledger
  20261001125516): `fn_conciliar_bloco` (regra 'exato' ou 'mais_antigo_primeiro', `p_simular`) e `fn_desfazer_bloco` (restaura
  status e data pelo `estado_anterior` de `conciliacao_blocos`). Os vinculos sao `conciliacao_bancaria_itens` com `grupo_id` =
  bloco e 'agrupamento_manual'. NUNCA muda o valor do lancamento; so' o QUITADO vira realizado (data = extrato que quitou), o
  parcial fica como estava. O gatilho de promocao pula quando `app.conciliar_bloco = 'on'` — so' o motor liga; 1:1 e 1:N
  continuam promovendo no 1o vinculo. Recusa com SQLSTATE 'CBLOC' e a frase. ⚠ `grupo_id` SEM FK: 53 grupos antigos (154
  vinculos) nao tem bloco — a FK pede antes um bloco 'legado' para cada um (pendente).
  ⚠ DESEMPATE DO "MAIS ANTIGO PRIMEIRO" (CONC-BLOCOS-TELA-01, decisao do Gabriel, migration 20261027185400): competencia ->
    vencimento -> created_at do lancamento -> MAIOR valor -> id. Nenhum campo guarda a ordem da planilha (as 10 NFs do backfill
    de 16/09 tem o mesmo created_at); o maior valor as resolve. Sem coluna nova.
  ⚠ A TELA DO BLOCO (`CasarBlocoModal`, variante do `CasarComBancoModal`, mock docs/mocks/mock-casar-bloco-v1.html) abre na
    Conferencia com 2+ extratos E 2+ lancamentos, com lancamento PARCIAL marcado, ou pelo "Mais antigo primeiro…" da barra;
    matriz e resumo SO' da RPC (simular a cada troca de regra), recusa CBLOC inline, sem "Corrigir o valor do lancamento"
    (o antigo "Usar valor do banco", so' no 1:N). Linha de bloco tem "Desfazer bloco" no "⋯" (passo inline, motivo
    obrigatorio). O vinculado PARCIAL continua candidato, com o chip "Parcial — falta R$ X" (aplicado vivo lido de
    `conciliacao_bancaria_itens`; o saldo livre quem valida e' a RPC).
- ⚠ CAIXA DO SISTEMA = UMA REGRA NO BANCO (CONC-CAIXA-PONTA-01, migration 20261027185500, ledger 20261001141213):
  `fn_caixa_sistema_pontas(cliente, conta, de, ate)` devolve uma linha por PONTA (lancamento x conta, sinal da direcao) e
  data. Parcial (programado/agendado com 0 < aplicado < valor): o aplicado na data de cada extrato; realizado cujo aplicado
  soma o valor: o aplicado nas datas dos extratos; o resto: como hoje (valor cheio na data de pagamento = o lv2). A
  `fn_extratos_espelhados` emite `sistema_caixa` (versao espelhados-05-caixa) ao lado do `sistema_completo`; as 4 telas de
  saldo (resumo da Conciliacao, aba Sistema, Evolucao, painel do mes) trocam no PR B. Medido: 1.973 conta-meses, so' o
  Sicredi Lavoura ago/26 muda (+10.224,04, passa a bater em todos os dias). PENDENTE de decisao de dado: o par do BB do NJ
  mai/26 (estorno 426aeeb0 conciliado mas programado sem data; devolucao 3314dfa1 cancelada, extrato +699,79 sem par) e as
  7 pontas sobre-aplicadas legadas (aplicado > valor do lancamento) — ficam no "como hoje".
- ⚠ MESA: NO CRU A PLANILHA PREVALECE, NO CLASSIFICADO O SISTEMA (PR-CONC-MESA-CRU-EXCEL-PREVALECE-01, Gabriel 30/09).
  CRU = lancamento de origem 'extrato'/'ofx' SEM conta do plano, fora transferencia. Quem decide e' o BANCO, numa funcao
  so' (`_fn_classificacao_precedencia_cru`, no fim do casar e do populate): a leitura da planilha fica em
  `update_proposto._planilha`; no cru ela sobe para a proposta (+ competencia, vencimento, documento, observacao, produto;
  plano administrativo forca fazenda Administrativo); no classificado a classificacao SAI do topo (o apply_row grava
  COALESCE(proposta, lancamento)). Linha editada a mao nao e' tocada. Excel vazio (e "-") nunca apaga. Fazenda e
  fornecedor se resolvem por `_fn_classificacao_resolver_fazenda/_fornecedor` (apelidos do de-para + nome, normalizacao
  unica `_fn_normalizar_texto`). A tela so' renderiza: marca "planilha: X" (azul) onde o Resultado difere, "(nao
  resolvido)" quando a planilha nao resolve (o Resultado fica com o sistema — NAO RESOLVIDO NUNCA ESVAZIA, e o editor de
  fornecedor mostra o do sistema sem proposta); contador "N divergem da planilha" so' com Fazenda, Conta do plano,
  Fornecedor e Competencia RESOLVIDOS. Conta de pecuaria/agricultura na fazenda Administrativo avisa (nao trava).
- ⚠ APELIDO DE SUBCENTRO COM CONTEXTO = CHAVE COMPOSTA "conta ⟂ texto da safra", MECANISMO UNICO (decisao do Gabriel,
  30/09, PR-CONC-EXCEL-PLANILHA-COMPLETA-01). E' a chave do B-22d (`chaveSubcentro`, `SEP_CHAVE_COMPOSTA`), no mesmo
  `alias_text`: o importador de lancamentos a grava, `fn_classificacao_resolver_contexto` a tenta ANTES do apelido simples
  (tier 'alias_composto'), e a Mesa a ENSINA quando o operador escolhe a conta numa linha com safra (`aprenderApelidoDaMesa`,
  que reusa `persistirApelidos`; sem safra, o simples). PROIBIDO criar segundo mecanismo (coluna de atividade, tabela nova,
  regra por escopo): dois resolvedores de contexto divergiriam no primeiro caso. Medido no proxy da 32c52f5c: os 44 planos de
  outra atividade que o apelido simples dava resolvem todos pelo composto.
  ⚠ A SAFRA DA PLANILHA DEFINE A ATIVIDADE no cru (planilha prevalece); no classificado o sistema prevalece e a safra vira
    marca. Conta do plano de OUTRA atividade que a safra NAO sobe ao topo (a precedencia a tira; a Mesa mostra "apelido e' de
    X; safra diz Y" e a conta fica pendente); plano administrativo NAO leva safra (marca "(plano administrativo nao leva
    safra)"). Safra, tipo de documento e forma se resolvem no banco (`_fn_classificacao_resolver_safra` so' ATIVAS,
    `_tipo_documento`, `_forma_pagamento` com o mapa dos legados); texto que nao resolve e' "(nao resolvido)" e nunca esvazia.
    A forma pelo historico do banco (PAINEL-V1) virou reserva: so' quando a planilha nao traz forma.
- ⚠ O DE-PARA DO PASSO 1 (e o importador de lancamentos, que usa o mesmo hook) CLASSIFICA PELO RESOLVEDOR DO BANCO
  (PR-CONC-EXCEL-SESSAO-E-DEPARA-01): fornecedor, fazenda, safra e subcentro por `fn_classificacao_depara_resolver` (so'
  leitura) — os mesmos `_fn_classificacao_resolver_*` do populate, que agora tem UMA implementacao (`_det`, com a origem
  apelido/cadastro; a de sempre devolve o id dela, provado igual em 1.222 textos). A memoria do front saiu: ela lia os
  apelidos de fornecedor num select cortado em 1.000 (NJ: 3.433) e marcava "a resolver" o que o banco resolve. FICAM no
  front: a CONTA (`resolverContaPorTexto`, mais forte que o do banco — divida "dois resolvedores de conta") e
  `preResolverFazenda` so' como reserva da Mesa para sessao sem `_planilha`.
  ⚠ LISTA GRANDE DO POSTGREST SE LE INTEIRA (`lerTodasAsPaginas`): o select cortado em 1.000 alimentava `persistirApelidos`,
    que grava `aliases = [...os que conhece, texto]` — num fornecedor fora das 1.000 primeiras, responder o de-para APAGAVA os
    apelidos que ele ja' tinha.
  ⚠ A IMPORTACAO E' DO MES PREDOMINANTE DAS LINHAS (`mesPredominante`), nao o da primeira linha por uuid: a planilha do NJ
    set/26 traz oito meses de competencia, e a Imp 03 caia em julho e sumia do seletor de setembro. O Enriquecer abre na mais
    recente do mes, o seletor marca "(mais recente)" e, com uma antiga aberta, o slot fixo abaixo da barra avisa "ha uma
    importacao mais nova (Imp N) — abrir". Linha da planilha sem nenhum obrigatorio e' ignorada, nao "rejeitada".
- ⚠ PAINEL DA MESA (PR-CONC-MESA-PAINEL-V1, Gabriel 30/09): colunas Campo | Planilha | Sistema hoje | Vai gravar, esta
  em texto NEUTRO — o unico verde e' o valor de uma entrada (Valor segue o sinal nas tres colunas); ambar = vai mudar.
  Grupos: DO EXTRATO no topo (Tipo, Data pgto., Valor, Conta bancaria — caixa tracejada, SO' LEITURA em toda linha),
  datas, classificacao, identificacao. ATIVIDADE e' obrigatoria e NAO e' gravada: e' o filtro da conta do plano (o
  `escopoNegocio`+`escopoObrigatorio` do `PlanoSubcentroSelect`), proposta pelo escopo da conta resolvida; conta de outra
  atividade vira PENDENTE e o Salvar nao grava (`planoIncoerente`, `src/v2/lib/mesa/atividadeDaLinha.ts`, a mesma na
  tabela e na aba). Tipo de documento e forma de pagamento GRAVAM (migration 20261027184600: COALESCE(proposta,
  lancamento), ausente = sistema); a forma e' sugerida SO' NO CRU pelo historico do banco (`formaPagamentoPeloHistorico`,
  mapa fechado Pix/Boleto/Compra com Cartao/TED-Transferencia; o resto fica vazio) e vira proposta no Salvar, como a
  safra sugerida. O cru do front (`ehCru` do `toRowVM`) e' ESPELHO do predicado de `_fn_classificacao_precedencia_cru` —
  quem mexer num confere o outro. O selo do rodape (`SeloRegraDaLinha`) diz a regra da linha.

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
  separada atras de chave. OC se abre pelo icone do produto ou "Abrir OC" no menu (FIN-V2-SEM-CAIXA-01,
  FIN-V2-HOMOLOG-FIX-01).
  ⚠ O "..." NUNCA E' FIXO/STICKY (decisao soberana do Gabriel, 30/09, PR-FIN-V2-STATUS-PGTO-01-fix1; revoga o "fixo e
    sempre visivel" do FIN-V2-HOMOLOG-FIX-01): e' a ultima coluna normal, no fim da linha; se a tabela rolar, ele rola junto,
    NUNCA por cima de outra coluna. A lista CABE sem rolar no modo normal na janela do Gabriel e a 1280 — a largura se MEDE NA
    TELA (a dele tem innerWidth 1.135: 889px uteis; colgroup normal 874 para caber tambem com barra classica de 15), nunca pela
    conta do codigo, que supos 1280 e errou por 79px. Valor, status e data nunca truncam; Produto, Fornecedor, Macro, Centro e
    Safra truncam com o texto inteiro no `title`, e toda linha tem UMA linha de altura.
- ⚠ STATUS NO FINANCEIRO (PR-FIN-V2-STATUS-PGTO-01, Gabriel 29-30/09): SO' REALIZADO (e conciliado) TEM DATA DE
  PAGAMENTO; previsto/programado/agendado sao ESCOLHIDOS e a data de quando sai do banco mora no vencimento (o dialog zera o
  pagamento ao sair do realizado e grava NULO fora dele, salvo pagamento travado pelo extrato). Ordem em todo lugar:
  Previsto > Programado > Agendado > Realizado > Conciliado. Cor e pilula tem UM dono, `STATUS_PALETA` em
  `src/lib/financeiro/statusFinanceiro.ts`: Previsto laranja, Programado azul e Agendado verde escuro SO' TEXTO; CAIXA so' no
  Realizado (verde claro, fundo e borda) e SELO OVAL so' no Conciliado (verde escuro) — fix1, 30/09, revogando para esses dois
  o FIN-LISTA-VISUAL-01. A conta corrente da OC herda a mesma paleta.
  Duplicata registrada: `BADGE_STATUS_TRANSACAO` (statusOperacional.ts, Mesa/Espelho); o `ModoRapidoGrid` ainda deriva
  status da data de pagamento (frente propria).
- ⚠ O GERAR GARANTE A SERIE COMPLETA DA RECORRENCIA (FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01, Gabriel 30/09): alem de
  avancar a marca, `fn_recorrencia_gerar` preenche a competencia VAGA abaixo dela; CANCELADO CONTA COMO OCUPADO; nunca
  antes do mes corrente (competencia), nem em mes fechado. As travas moram so' em `_fn_recorrencia_vagas`, e o
  vencimento so' em `_fn_recorrencia_vencimento` — o gerar grava e a propagacao preve pela MESMA funcao. As duas
  internas nao sao SECURITY DEFINER e nao se executam pela API.
- ⚠ O "CRIAR" DA LINHA DO EXTRATO OFERECE O TIPO DO SINAL OU TRANSFERENCIAS, NUNCA O CONTRARIO (CONC-CRIAR-TRANSFERENCIA-01,
  migration 20261027190100, ledger 20261002090125): `fn_criar_lancamento_de_extrato(..., p_tipo_operacao, p_outra_conta)`
  monta a transferencia (18010, sinal -1, origem/destino pelo sinal, fazenda Administrativo do cliente) e o vinculo na MESMA
  transacao; a conta do extrato fica travada, a outra e' obrigatoria. Movimento que ja' e' meia ponta ou tem transferencia
  lancada recusa (`ja_existe_transferencia`) — fecha-se pelo "Transferencias entre contas". Sem os parametros novos, igual a antes.
- ⚠ TRANSFERENCIA DE OFX = 1 LANCAMENTO + 2 VINCULOS (PR-CONC-TRANSFERENCIAS-01, Gabriel 30/09): a saida num banco e a
  entrada no outro viram UM `3-Transferências` (18010, origem = conta da saida, destino = conta da entrada) com um vinculo
  vivo POR PONTA. O passo e' o botao "Transferencias entre contas (N)" do Casar lancamentos, ANTES do "Criar lancamentos
  em lote": `fn_transferencias_sugeridas` sugere (contas diferentes, valor oposto exato, |dias| <= 1; o no' ambiguo que o
  mesmo dia fecha 1:1 se resolve, o resto o operador escolhe) e `fn_transferencia_de_extratos` fecha as duas pontas numa
  transacao — casa na transferencia ja' lancada quando existe (`_fn_transferencia_existente`), senao cria. A segunda ponta
  grava pela MESMA rotina do vincular com `p_dupla_ponta := true`; sem ele (o default, e todo chamador antigo), lancamento
  com vinculo vivo continua recusado. Nao existe excecao geral no casar nem no vincular.
  ⚠ CONSULTA A `conciliacao_bancaria_itens` E' SEMPRE COM `desfeito_em IS NULL`. Desfazer (e cancelar o lancamento, pelo
    gatilho `trg_cbi_desfazer_on_cancelamento`) NAO apaga a linha: marca `desfeito_em`. Contar sem o filtro fabrica
    "vinculo pendurado" — erro meu na FASE 0 do PR-CONC-OFX-SALDO-LIMPEZA-01 (os 5 do NJ ja' estavam desfeitos; os 966
    vinculos de lancamento cancelado do proto, todos desfeitos).
  ⚠ A trava `guard_transferencia_conta_destino` so' via o singular '3-Transferência'; agora ve os dois (INSERT sem destino
    recusa; UPDATE so' recusa quem remove um destino que existia).
  ⚠ MEIA TRANSFERENCIA (uma ponta conciliada, a outra solta) FECHA PELA SEGUNDA PONTA (CONC-TRANSF-SEGUNDA-PONTA-01, migration
    20261027185700, ledger 20261001173005): `fn_transferencias_meia_ponta` lista o extrato livre x a transferencia com UM vinculo
    vivo em OUTRA conta (mesmo valor, na direcao, |dias| <= 1, so' o 1:1; a linha e' do mes quando uma das pontas cai nele) e
    `fn_transferencia_segunda_ponta` (`p_simular`) grava pelo vincular com `p_dupla_ponta`, sem mexer no lancamento. Entra
    na MESMA tabela e no MESMO (N) do "Transferencias entre contas". Medido: 58 no NJ de mar a jul (o backfill de jun/26).
    ⚠ A MEIA PONTA TEM PRIORIDADE SOBRE O PAR NOVO (CONC-TRANSF-SEGUNDA-PONTA-02, migration 20261027185800, ledger
      20261001180139): a compatibilidade mora numa funcao so', `_fn_meia_ponta_compativel(extrato)` (a transferencia que ele
      completa, ou NULL), usada pela lista, pela segunda ponta (recusa 'ambigua' quando a regra nao aponta o par), pela
      `fn_transferencias_sugeridas` (o livre com meia ponta sai dos pares) e pela `fn_transferencia_de_extratos` (recusa
      'tem_meia_ponta' antes de criar). A tela repete a regra por defesa (`paresSemMeiaPonta`) e grava as meias ANTES dos
      pares. Nasceu da de4e99d5: o par de abr/26 gravado antes das meias criou uma 3a transferencia de 400.000.
    ⚠ GEMEOS (CONC-TRANSF-SEGUNDA-PONTA-03, migration 20261027185900, ledger 20261001185439): extratos livres INDISTINGUIVEIS
      (mesma conta, data e valor) em numero IGUAL ao de transferencias abertas compativeis fecham por ordem estavel (extrato
      por id; transferencia por data, created_at, id) — qualquer atribuicao e' equivalente; fora disso, o 1:1 de sempre
      (Itau 06/03 2 x -100.000 -> 1b46c5de e bd99294f).
- ⚠ BOITEL: ao financeiro e ao DRE vai SO' O LIQUIDO DO ACERTO; R$/@ de venda = liquido / @ vivas que sairam. O VALOR DA
  OPERACAO E' O SLOT (`zoo_operacao_lotes.valor_informado`, helper `valorDaVendaBoitel`) e a tela nunca o calcula; o
  acerto e' conferencia. Com o realizado aplicado, o realizado vence a projecao em tudo (`custosDaVendaBoitel`, mesmo
  predicado `realizadoAplicadoNoLote`). `ocBoitelReal` e' o rascunho, `ocBoitelRealSalvo` o que o banco tem — quem le'
  numero le' o salvo. Duas modalidades: A (o boitel abate) e B (abate em nome do produtor; acerto em 1155)
  (OC-BOITEL-VALOR-01, OC-BOITEL-REALIZADO-UX-01, BOITEL-ABATE-PRODUTOR-01).
- ⚠ O PAINEL LATERAL DA VENDA EM BOITEL E' UMA CONTA SO', DE CIMA PARA BAIXO (PR-OC-BOITEL-PAINEL-01, Gabriel 02/10): acerto
  itemizado → Saldo do acerto → + Adiantamento devolvido → A RECEBER DO BOITEL (o Pix, `saldoReceberBase`) → − Adiantamento
  (ja' era seu) → − Gastos diretos (`custosDoProdutor`) → − Parte do parceiro (`pParte`) → LIQUIDO NO BOLSO
  (`bolsoDaVendaBoitel`) → "Financeiro X faltam/sobram Y" (`entrada_obrigacao` da view, a diferenca em vermelho, so' no
  realizado da A; a frase inteira no `title`). As linhas saem de UMA funcao pura, `linhasPainelBoitel` (`src/components/venda/painelBoitel.ts`); cada
  linha e' um termo do motor — PROIBIDO linha de residuo; `residuoDaConta` e' so' a prova (0 centavo nas 35 linhas de boitel do
  proto, 02/10). B: as tres linhas de `linhasResumoProdutor` + a cauda, sem "Financeiro". Projecao: ambar, sem diferenca.
  Sairam do painel de boitel o trio A receber / Recebido / Saldo (o Saldo de nivel liquidado dizia −107.150,94 numa venda que
  deixa 581.232,52) e a nota de 3 linhas (virou `title`); a venda comum segue com o trio.
- ⚠ COR PELO SINAL, UM DONO SO' (PR-OC-BOITEL-PAINEL-01, D7): negativo SEMPRE vermelho, positivo SEMPRE verde —
  `COR_SINAL` (`src/lib/oc/contaCorrente.ts`, ao lado de `corDoSaldo`; `text-[#b91c1c]` / `text-[#15803d]`). O resumo da conta
  corrente e o painel de boitel leem dali. Sinal negativo com o "−" tipografico colado ao numero, nunca "-R$". Valor sem sinal
  (o "Financeiro") fica neutro; a projecao fica no ambar dela. Os outros literais desses hex no sistema (16 arquivos) nao
  foram migrados — fila.
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
