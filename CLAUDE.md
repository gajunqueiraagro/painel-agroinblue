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
- TSC baseline: 140 erros (141 -> 140 no PR-CONC-IMPORT-BANCO-01B, por PECA QUE DEIXOU DE EXISTIR: saiu o TS2352 do
  `(inserted ?? []) as { id; hash_movimento }[]` em useImportacaoExtrato.ts — o upsert direto em `extrato_bancario_v2` virou
  a RPC `fn_extrato_importar_arquivo`; antes, 142 -> 141 no PR-FIN-DUPLICAR-ABRE-MODAL-01, por APAGAR CODIGO MORTO: saiu o TS2322
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
  Baseline em 08/10/2026 (MENU-CLIQUE-FECHANDO-01, +14 em `src/components/ui/menuFechadoSemClique.test.tsx` — 4633 depois dele; antes o
  APP-SEM-TRADUCAO-01, +5 em `src/lib/app/semTraducao.test.ts` — 4619 depois dele; antes a
  FORN-SELETOR-PADRAO-01 fatia 2b, +20: `src/components/shared/favorecidoSelectDono.test.tsx` 16,
  `src/components/compra/documentoFormEmitente.test.tsx` 4 — 4614 depois dele; antes o
  FORN-SELETOR-PADRAO-01 conserto 2a-fix1, +7: `src/components/shared/favorecidoSelectDono.test.tsx` 3,
  `src/components/recorrencias/recorrenciaDialog.test.tsx` 2, `src/components/financiamentos/documentosNaCriacao.test.tsx` 1,
  `src/components/financiamentos/documentosDoContrato.test.tsx` 1 — 4594 depois dele; antes a
  FORN-SELETOR-PADRAO-01 fatia 2a, +13: `src/components/shared/favorecidoSelectDono.test.tsx` 11,
  `src/components/financeiro-v2/documentoFormPorTipo.test.tsx` 2 — 4587 depois dele; antes o
  FORN-SELETOR-PADRAO-01 passo 1b, +50: `src/lib/fornecedores/fornecedorTexto.test.ts` 22,
  `src/components/shared/favorecidoSelectDono.test.tsx` 27, `src/hooks/useFornecedoresDoCliente.test.tsx` 1 — 4574 depois dele; antes o
  FORN-SELETOR-PADRAO-01 passo 1a, +22: `src/lib/fornecedores/leitorDeFornecedores.test.ts` 14,
  `src/hooks/useFornecedoresDoCliente.test.tsx` 8 — 4524 depois dele; antes o
  APP-VERSAO-NOVA-01, +14 em `src/lib/app/falhaDeVersao.test.tsx` — 4502 depois dele; antes o
  PARC-CADEIA-01 passo 4, +13 em `src/components/financiamentos/gestosDoContrato.test.tsx` — 4488 depois dele; antes o
  PARC-CADEIA-01 passo 3, +11 em `src/lib/financiamentos/parcelaNoModal.test.ts` — 4475 depois dele; antes o
  PARC-CADEIA-01 passo 2, +34: `src/lib/financiamentos/cancelarParcela.test.ts` 18,
  `src/components/financiamentos/cancelarParcelaDialog.test.tsx` 10, `src/lib/financeiro/cprRetorno.test.ts` 5,
  `src/hooks/useFinanceiroV2.cancelMotivo.test.ts` 1 — 4464 depois dele; antes o
  PARC-CONTRATO-01 item 4, +4: `src/lib/financeiro/docDaLinha.test.ts` 2,
  `src/components/financeiro-v2/finV2ColunasOC01.test.ts` 2 — 4430 depois dele; antes o
  PARC-CONTRATO-01 item 3, +8 em `src/components/financiamentos/documentosNaCriacao.test.tsx` — 4426 depois dele; antes o
  PARC-CONTRATO-01 item 2, +14: `src/lib/financiamentos/propagarContrato.test.ts` 8,
  `src/components/financiamentos/obrigacaoEdicao.test.tsx` 6 — 4418 depois dele; antes o
  PARC-CONTRATO-01 item 1, +9: `src/lib/financiamentos/situacaoDoContrato.test.ts` 5,
  `src/components/financiamentos/obrigacaoEdicao.test.tsx` 4 — 4404 depois dele; antes o
  PARC-FECHA-02 item 6, +1 em `src/components/financeiro-v2/finV2ColunasOC01.test.ts` — 4395 depois dele; antes o
  PARC-FECHA-02 item 5, +1 em `src/components/financiamentos/obrigacaoEdicao.test.tsx` — 4394 depois dele; antes o
  PARC-FECHA-02 item 4, +7 em `src/lib/datas/hojeLocal.test.ts` — 4393 depois dele; antes o
  PARC-FECHA-02 item 2, +8 em `src/lib/financiamentos/situacaoEmLote.test.ts` — 4386 depois dele; antes o
  PARC-FECHA-02 item 1, +7: `src/hooks/useFinanceiroV2.tipoDocumento.test.ts` 2, `src/lib/financeiro/docDaLinha.test.ts` 2,
  `src/components/financeiro-v2/notaDaCompraNoModal.test.tsx` 3 — 4378 depois dele; antes o
  PARC-LIVRES-01 passo 6, +20: `src/components/financiamentos/documentosDoContrato.test.tsx` 12,
  `src/lib/financiamentos/notaContraContrato.test.ts` 8 — 4371 depois dele; antes o
  PARC-LIVRES-01 fechamento D, +1 em `src/components/financeiro-v2/anexarBoletos.test.tsx` — 4351 depois dele; antes o
  PARC-LIVRES-01 passo 5, +16: `src/lib/financiamentos/nomeDaParcela.test.ts` 9, `src/lib/pdf/cpr/parcelaNoPdf.test.ts` 6,
  `src/components/financeiro-v2/finV2ColunasOC01.test.ts` 1 — 4350 depois dele; antes o
  PARC-LIVRES-01 passo 3, +18: `src/lib/financeiro/docDaLinha.test.ts` 10,
  `src/components/financeiro-v2/notaDaCompraNoModal.test.tsx` 5, `src/components/financeiro-v2/finV2ColunasOC01.test.ts` 3 — 4334 depois dele; antes o
  PARC-LIVRES-01 passo 4, +8: `src/components/financiamentos/obrigacaoEdicao.test.tsx` +5 (6 novos do passo 4; saiu 1 do 2A, o do lápis apagado no
  detalhe, com a regra que ele prendia), `src/lib/financiamentos/situacaoDoContrato.test.ts` 3 — 4316 depois dele; antes o
  PARC-LIVRES-01 passo 2B, +7 em `src/components/financiamentos/obrigacaoEdicao.test.tsx` — 4308 depois dele; antes o
  PARC-LIVRES-01 passo 2A, +4 em `src/components/financiamentos/obrigacaoEdicao.test.tsx` — 4301 depois dele; antes o
  PARC-LIVRES-01 passo 1, +33: `src/lib/financiamentos/parcelasLivres.test.ts` 17,
  `src/components/financiamentos/gradeDeParcelas.test.tsx` 13, `src/components/financeiro-v2/novoDeXml.test.tsx` 3 — 4297 depois dele; antes o
  PARC-LIVRES-01 passo 0, +1 em `src/lib/pdf/cpr/exportCpr.test.tsx` — 4264 depois dele; antes o
  CONC-SEM-CLASSIFICACAO-01 tela, +32: `src/lib/conciliacao/semClassificacao.test.ts` 12,
  `src/components/conciliacao/semClassificacaoModal.test.tsx` 14, `src/pages/conciliacaoDono.test.tsx` 5,
  `src/v2/components/SeletorPeriodo.test.tsx` 1 — 4263 depois dele; antes o CONC-SEM-CLASSIFICACAO-01 leitor, +3 em
  `src/lib/conciliacao/resumoDoDono.test.ts` — 4231 depois dele; antes o
  ACESSOS-TELA-01, +39: `src/lib/acessos/regrasDeAcesso.test.ts` 15, `src/pages/acessosTab.test.tsx` 19,
  `src/v2/lib/acessoTelaDeAcessos.test.tsx` 5 — 4228 depois dele; antes o DRE-RATEIO-MODAL-01 + fix1, +42 −4: `src/components/agri/rateioEncontro.test.tsx` 42 (novo); sairam os 4 da
  etapa "Não alocado" de `src/components/agri/rateioDetalheModal.test.tsx`, com o codigo que testavam — 4189 depois dele; antes o
  REC-VALOR-CERTO-02, +17 em `src/lib/financeiro/cprEstimado.test.ts` (novo) — 4151 depois dele; antes o
  ACESSOS-FIN-03, +13 em `src/v2/lib/acessoMeta.test.tsx` (16 -> 29) — 4134 depois dele; antes o
  REC-VALOR-CERTO-01, +36: `src/lib/financeiro/recorrenciasDoMes.test.ts` 19,
  `src/components/recorrencias/recValorCerto01.test.tsx` 17 — 4121 depois dele; antes o ACESSOS-FIN-02, +17 −2: `src/v2/lib/acessoMeta.test.tsx` 16 (novo), `src/pages/pecDrePanel.test.tsx` 1; em
  `src/v2/lib/acessoOperacao.test.tsx` o M9 passou de 8 a 6 casos (o par "gestor e financeiro acesos" virou so' gestor, e o apagado
  passou de leitura a financeiro) — 4085 depois dele; antes o ACESSOS-FIN-01, +20: `src/v2/lib/acessoTelas.test.tsx` 9, `src/v2/lib/acessoSaidas.test.tsx` 6,
  `src/v2/lib/acessoOperacao.test.tsx` 4, `src/v2/lib/acessoCapacidadesOC.test.tsx` 1 — 4070 depois dele; antes o CPR-SALDO-DIA-02, +9: `src/components/financeiro-v2/cprFluxoPrevisto.test.ts` 5, `src/lib/financeiro/cprRecorte.test.ts` 4 — 4050 depois dele;
  antes o CPR-EXPORT-01, +18: `src/lib/pdf/cpr/exportCpr.test.tsx` 14, `src/lib/financeiro/cprRecorte.test.ts` 4 — 4041 depois dele;
  antes o CPR-SALDO-DIA-01, +22: `src/lib/financeiro/cprRecorte.test.ts` 18, `src/lib/financeiro/saldoEmCaixa.test.ts` 4 — 4023 depois dele;
  antes o FIN-V2-COLUNAS-OC-01, +8 em `src/components/financeiro-v2/finV2ColunasOC01.test.ts` — 4001 depois dele;
  antes o CPR-CONTA-01, +7 em `src/lib/financeiro/cprRecorte.test.ts` — 3993 depois dele;
  antes o OC-VINCULAR-CANDIDATAS-01b, +1 em `src/components/financeiro-v2/vincularCandidatas.test.tsx` — 3986 depois dele;
  antes o CPR-PERIODO-VENCIDOS-01, +16 em `src/lib/financeiro/cprRecorte.test.ts` — 3985 depois dele;
  antes o OC-VINCULAR-CANDIDATAS-01, +24 em `src/components/financeiro-v2/vincularCandidatas.test.tsx` — 3969 depois dele;
  antes o OC-VINCULAR-RECEBIMENTO-PARCIAL-01, +25 em `src/components/financeiro-v2/vincularRecebimentoParcial.test.tsx` — 3945 depois dele;
  antes o OC-VINCULAR-PARCELA-SEGUINTE-01, +10 em `src/components/financeiro-v2/vincularParcelaSeguinte.test.tsx` — 3920 depois dele;
  antes o UI-ARRASTAR-ARQUIVO-01b, +62: `src/lib/arquivo/aceitarArquivo.test.ts` 27, `src/lib/arquivo/umSoArrastar.test.ts` 3,
  `src/components/ui/area-de-arquivo.test.tsx` 3, `src/components/conciliacao/arquivoTelas01b.test.tsx` 18,
  `src/components/conciliacao/arquivoCaracterizacao01b.test.tsx` 3, `src/v2/components/mesa/enriquecimento/arquivoTelas01b.test.tsx` 6,
  `src/v2/components/mesa/enriquecimento/arquivoCaracterizacao01b.test.tsx` 2; antes o UI-ARRASTAR-ARQUIVO-01a, +70: `src/lib/arquivo/aceitarArquivo.test.ts` 32,
  `src/lib/arquivo/protegerSoltarFora.test.ts` 6, `src/components/ui/area-de-arquivo.test.tsx` 14,
  `src/components/ui/areaDeArquivoTelas.test.tsx` 13, `src/components/ui/areaDeArquivoCaracterizacao.test.tsx` 5; antes o
  REC-VALOR-DO-MES-MODAL-01, +45: `src/lib/financeiro/valorDoMes.test.ts` 28,
  `src/components/financeiro-v2/valorDoMesModal.test.tsx` 14, `src/hooks/useFinanceiroV2.valorDoMes.test.ts` 3; antes o
  REC-PROPAGAR-VALOR-DO-MES-01, +11 em `src/components/recorrencias/propagarValorDoMes.test.tsx`;
  antes o FIN-VALOR-CALC-01a, +101: `src/lib/calculos/contaNoCampo.test.ts` 75,
  `src/components/financeiro-v2/valorComConta.test.tsx` 26; antes o PARC-OBRIGACAO-EDICAO-01a, +26: `src/components/financiamentos/obrigacaoEdicao.test.tsx` 19,
  `src/lib/financiamentos/valorDasParcelas.test.ts` 7; antes o FIN-IMPORT-EXCEL-STATUS-01a, +28: `src/lib/financeiro/statusParaImportar.test.ts` 8,
  `src/v2/lib/importLanc/semDataDePagamento.test.ts` 12, `src/v2/pages/importExcelSemDataDePagamento.test.tsx` 8; antes o
  FIN-NFE-XML-01d, +52: `src/lib/financeiro/nfe/proporLancamento.test.ts` 27,
  `src/components/financeiro-v2/novoDeXml.test.tsx` 25; antes o FIN-NFE-XML-01a, +35: `src/lib/financeiro/nfe/lerNFe.test.ts` 30, `src/lib/financeiro/nfe/centavos.test.ts` 5;
  antes o ACESSOS-OC-03a, +37: `src/v2/lib/acessoCapacidadesOC.test.tsx` 33, `src/v2/lib/acessoOperacao.test.tsx` 2,
  `src/v2/lib/acessoTelas.test.tsx` 1, `src/v2/lib/acessoGestos.test.tsx` 1; antes o ACESSOS-OC-02, +22 em `src/v2/lib/acessoOperacao.test.tsx`; antes o ACESSOS-OC-01, +8: `src/v2/lib/acessoTelas.test.tsx` 6,
  `src/v2/lib/acessoSaidas.test.tsx` 1, `src/v2/lib/acessoGestos.test.tsx` 1 — 3421 depois dele; antes o CONC-TOTAL-SEM-SALDO-01b, +8: `src/pages/conciliacaoDono.test.tsx` 4, `src/lib/conciliacao/resumoDoDono.test.ts` 4; antes o FIN-PGTO-FANTASMA-01, +13 em `src/components/financeiro-v2/finPgtoFantasma01.test.tsx`; antes o CONC-SEM-F5-01, +19: `src/hooks/concSemF5.test.tsx` 18, `src/components/financeiro-v2/conferenciaModal.test.tsx` 1; antes o ACESSOS-02c, +17 em `src/v2/lib/acessoGestos.test.tsx`; antes o ACESSOS-02b, +29: `src/acessoRotas.test.tsx` 15, `src/v2/lib/acessoSaidas.test.tsx` 14; antes o ACESSOS-02a, +26 em `src/v2/lib/acessoTelas.test.tsx`; antes o OC-CC-ACOES-LINHA-02, +20: `src/components/venda/abaContaCorrente.test.tsx` 11,
  `src/lib/oc/abrirLancamentoDaOC.test.ts` 7, `src/components/compra/despesasContaCorrente.test.tsx` 2; antes o UI-LINHA-UNICA-01, +2: `src/components/venda/abaContaCorrente.test.tsx` 1,
  `src/components/financeiro-v2/documentosLayout.test.tsx` 1; antes o OC-BOITEL-REVALORAR-SALVAR-01, +16 em `src/lib/oc/revalorarAoSalvar.test.tsx`; antes o
  FIN-DOCUMENTO-FORM-01, +27 em `src/components/financeiro-v2/documentoFormPorTipo.test.tsx`, e
  FIN-RESUMO-PAGAMENTO-01, +7 em `src/components/financeiro-v2/resumoPagamentoModal.test.tsx`; antes o FIN-PIX-CADASTRO-MODAL-01, +35: `src/lib/financeiro/dadosPagamentoDoCadastro.test.ts` 14,
  `src/components/financeiro-v2/dadosPagamentoModal.test.tsx` 21; antes o
  FIN-DOCUMENTOS-LAYOUT-01, +10 em `src/components/financeiro-v2/documentosLayout.test.tsx`; antes o
  OC-BOITEL-ADIANTAMENTO-01a, +3 em `src/components/venda/previsaoBoitel.test.ts`; antes o
  PR-CONC-SALDOS-LAYOUT-01, +3 em `src/pages/conciliacaoDono.test.tsx`; antes o PR-CONC-STATUS-SALDO-01b, +9: `src/lib/conciliacao/resumoDoDono.test.ts` 2,
  `src/pages/conciliacaoDono.test.tsx` 6, `src/v2/components/SeletorPeriodo.test.tsx` 1; antes o PR-CONC-INTERNA-SEPARADA-01b, +31: `src/lib/conciliacao/resumoDoDono.test.ts` 10,
  `src/lib/conciliacao/resumoMes.test.ts` 5, `src/components/conciliacao/painelDono.test.tsx` 5, `src/pages/conciliacaoDono.test.tsx` 9,
  `src/components/financeiro-v2/espelhoDono.test.tsx` 2; antes o PR-CONC-SALDO-UMA-REGUA-02b, +10 −8: `src/components/conciliacao/painelDono.test.tsx` 10; sairam os 8
  de `somarAtePosicao` em `src/hooks/useExtratoDaConta.test.ts`, com a funcao; antes o PR-CONC-SALDO-UMA-REGUA-02, +22 −5: `src/lib/conciliacao/resumoDoDono.test.ts` 7,
  `src/components/financeiro-v2/espelhoDono.test.tsx` 4, `src/pages/conciliacaoDono.test.tsx` 11; saiu
  `src/pages/conciliacaoAgregadoTransferencia.test.ts` 5, com o `buildMonthCards` que testava; antes o
  PR-CONC-SALDO-UMA-REGUA-01c, +17 em `src/lib/conciliacao/resumoMes.test.ts`; antes o
  PR-CONC-IMPORT-BANCO-01B, +25: `src/lib/financeiro/extratoHashOcorrencia.test.ts` 5,
  `src/lib/financeiro/importacaoExtratoResultado.test.ts` 7, `src/components/conciliacao/desfazerArquivoResumo.test.tsx` 5,
  `src/components/conciliacao/importarGravacaoAtomica.test.tsx` 6, `src/components/conciliacao/importarCaixaPorLinha.test.tsx` 2): 4633
  passando, 22 skipped, e
  3 FALHAS PRE-EXISTENTES que NAO sao regressao de PR nenhum:
    2x src/lib/zootecnico/validacaoZootecnica  ·  1x transferencia
  Elas falham no HEAD limpo, em arvore limpa. Antes de chamar qualquer falha de
  regressao, conferir se ela e' uma destas tres.
  ⚠ WORKTREE SEM `node_modules` PROPRIO COLHE MENOS ARQUIVOS: o symlink nao resolve o alias `@/`
    (1563 ali nao era baseline, era erro de coleta). Quem mede em worktree instala as dependencias nela.
  ⚠ DIVIDA SUITE-TESTE-OSCILA-01: em 06/10/2026 UMA execucao da suite inteira deu 4 falhas em vez de 3 (logo depois de uma rodada
    de mutacoes); as cinco execucoes seguintes deram as 3 de sempre. O quarto teste NAO foi identificado (a saida daquela rodada
    nao foi guardada). Quem vir 4 falhas guarda a lista dos `FAIL` antes de repetir.
    [07/10/2026, PARC-LIVRES-01 passo 6: UMA execucao deu 8 falhas (as 3 + 5); as cinco de fora, GUARDADAS — passam sozinhas e na
    execucao seguinte da suite inteira: `conferenciaFechamentoDia.test.tsx` (D3/D4), `espelhoDono.test.tsx` (os dois do link
    "N dias com diferença"), `valorComConta.test.tsx` (prova 7, novo lancamento pela mascara) e `obrigacaoEdicao.test.tsx` (foto
    da criacao de financiamento). Todas montam modal grande: cheira a tempo esgotado sob carga, nao a regressao.]
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

## ACESSO A TELA POR PERFIL — UM DONO (ACESSOS-02a, Gabriel 04/10/2026, so' tela)
O acesso a tela tem um dono, `nivelDaTela(perfil, isAdmin, tela) -> 'nao' | 'ver' | 'editar'` (`src/v2/lib/acessoTelas.ts`): a marca
`liberadaClientes` no menu (`NavItem`, `src/v2/lib/navGrupos.ts`) + a matriz perfil × grupo (`MATRIZ_ACESSO`). MENU E ROTA SO'
CONSULTAM: a lateral (`V2Sidebar`, por `gruposVisiveis`), o drawer (`V2ContextDrawer`, por `secoesVisiveis`), a barra do celular
(`V2MobileNav`) e a rota (`V2Index`, UM ponto: a chamada unica de `renderContent()`). Nenhum componente decide por conta propria.
- ⚠ VISIBILIDADE NAO E' PERMISSAO: isto decide o que se OFERECE e o que a rota ABRE. Ler e gravar e' do banco (RLS; a trava de
  gravacao por perfil e' o 01F, que ainda nao existe — `tenant_ok` nao distingue leitura de escrita).
- DUAS CAMADAS: (1) sem a marca `liberadaClientes`, quem nao e' admin do AGROinBLUE nao ve^ nem abre a tela, qualquer que seja o
  perfil; tela fora do menu (rota interna, legado, drill) nao tem marca. (2) liberada, vale a matriz. Admin: 'editar' em tudo, como
  sempre. Perfil desconhecido ou nulo: 'nao' em tudo.
- PILOTO (comecar com o minimo e liberar aos poucos): TRES telas liberadas — `financeiro-lanc`, `conciliacao`,
  `contas-a-pagar-receber`. [ACESSOS-OC-01: mais `operacoes-comerciais` e a tela da operacao, SO' para o gestor — ver "EXCECAO POR TELA".] A Visão Geral ('home') NAO (`HOME_LIBERADA_CLIENTES`, em navGrupos).
- MATRIZ (aprovada em 16/09; "leitura" e' decisao do arquiteto: 'ver' onde o gestor tem acesso):
      grupo         gestor_cliente  financeiro  campo   leitura
      home          ver             ver         ver     ver
      rebanho       editar          ver         editar  ver
      financeiro    editar          editar      nao     ver
      planejamento  editar          editar      nao     ver
      executivo     ver             ver         nao     ver
      auditoria     ver             ver         nao     ver
      cadastros     editar          editar      nao     ver
      validar       nao             nao         nao     nao
- MENU: item 'nao' nao aparece; secao do drawer sem item some; grupo sem item visivel some da lateral; "Visão Geral" e
  "Configurações" somem para quem tem 'nao' nelas. Para o admin nada muda.
- ROTA: `section` com nivel 'nao' desenha `V2SemAcesso` ("Você não tem acesso a esta tela" + botao para a primeira tela permitida),
  nunca a tela — por endereco, parametro de URL, `sessionStorage` ou navegacao interna. Sem acesso, a barra tambem nao oferece o
  atalho de Producao nem a sub-navegacao do Financeiro.
- TELA INICIAL: quem nao tem a 'home' e esta' nela (ao entrar, ao trocar de cliente) cai em `primeiraTelaPermitida` (no piloto,
  Lançamentos Financeiros). ⚠ SO' A 'home' E' TROCADA: outra tela sem acesso mostra o aviso, nao um redirecionamento calado. Sem
  nenhuma tela: "Nenhuma tela liberada para o seu perfil. Fale com o administrador."
- ⚠ ROTAS FORA DO V2 SO' PARA O ADMIN (ACESSOS-02b): `/caderno-importacao`, `/v3` (e `/v3/*`), `/layout-lab` e `/resumo-operacional`
  nao passam pelo `V2Index`, entao a guarda dele nao as alcancava. `SoAdmin` (`src/AppRouter.tsx`) as embrulha: quem nao e' admin
  vai para "/" (e de la' para a primeira tela permitida), sem ver a tela. Nao pisca: o `AppRouter` so' desenha rotas depois de o
  `ClienteContext` carregar. Rota nova fora do V2 nasce dentro do `SoAdmin`, ou com guarda propria.
- ⚠ ATALHO PARA TELA SEM ACESSO NAO E' OFERECIDO (ACESSOS-02b): o controle que NAVEGA para uma tela com nivel 'nao' SOME para
  aquela pessoa; a INFORMACAO da linha fica (o icone da OC, o 🏦 da parcela, o codigo da OC, a frase do bloqueio). Um ajudante so',
  `usePodeAbrir(tela)` (`src/v2/hooks/usePodeAbrir.ts`, em cima de `nivelDaTela`) — nenhum `if` de perfil no ponto de uso. NAO e' a
  regra do menu "⋯" da OC (item que nao vale fica desabilitado com o motivo): aqui e' ACESSO. Onde vale hoje:
  `FinanceiroV2Tab` (icone do produto -> marca sem botao; "Abrir OC", "Ver contrato" e "Criar OC a partir deste lançamento" do menu
  da linha; o codigo da OC na secao sem caixa, `CelulaOC`) e `LancamentoV2Dialog` ("Abrir →" e "corrigir na operação", por
  `operacaoAbrivel`; "Abrir OC →" do `RodapeCancelamento`; criar OC do legado; a porta da OC no modal zootecnico). Conciliação e
  Contas a Pagar/Receber nao tem outra saida. Tela nova liberada para cliente: varrer as saidas dela e usar o ajudante.
  ⚠ DIVIDA ACESSOS-SAIDA-MODAL-ZOO-01: no modal zootecnico aberto pelo lancamento, "abrir no formulario principal" continua
    oferecido (tirar a prop faria o modal editar no lugar) — o clique cai no aviso de sem acesso; some quando o modal zootecnico
    consultar o ajudante. "Vincular à operação" e' dialogo, nao muda de tela.
  ⚠ DECIDIDO (Gabriel, 04/10): a PARCELA DE FINANCIAMENTO fica SEM item de abrir para quem nao tem a tela de Financiamentos — o
    "Ver contrato" era o unico, e nao entra item desabilitado no lugar; a linha segue visivel com o 🏦.
- ⚠ ATALHO SOME; GESTO FICA DESABILITADO COM O MOTIVO (ACESSOS-02c, Gabriel 04/10, so' tela): quem nao tem acesso a' tela da operacao
  nao executa, a partir das telas liberadas, gesto que ALTERA a operacao comercial. O gesto fica VISIVEL e APAGADO, com o motivo no
  `title` e escrito ao lado (10px), e o clique nao dispara — a pessoa nao ve^ o efeito nem teria como desfazer. Um ajudante so',
  `usePodeAlterarOperacao()` (`src/v2/hooks/usePodeAbrir.ts`: nivel 'editar' em `TELA_DA_OPERACAO`, a mesma tela dos atalhos do
  02b), e uma peca que desenha, `GestoDeOperacao` (`src/components/financeiro-v2/GestoDeOperacao.tsx`); nenhum `if` de perfil no
  ponto de uso. Para o admin e para quem edita a tela, nada muda. ⚠ E' O QUE A TELA OFERECE: a trava de gravacao e' o 01F.
  · ONDE VALE (`LancamentoV2Dialog`, o unico lugar das tres telas com esses gestos): "Desvincular da operação" ("só quem tem acesso
    à operação pode desvincular") e "Vincular à operação" ("só quem tem acesso à operação pode vincular").
  · TEXTOS PARA QUEM NAO TEM A TELA (donos em `src/lib/financeiro/cancelamentoLancamento.ts`): a faixa de origem diz "(ajustados
    pelo administrador na operação)" no lugar de "(ajuste na OC)" (`ondeAjustarTituloOC`), e o rodape "Título de operação comercial
    — alterações na operação são feitas pelo administrador" (`MOTIVO_BLOQUEIO_TITULO_OC_SEM_ACESSO`; o `RodapeCancelamento` troca a
    frase quando nao recebe `onAbrirOC`).
  · NAO E' GESTO DE OPERACAO, E FICA: salvar o que o titulo de OC deixa editar (data prevista, conta, descricao, observacao,
    fornecedor, safra), realizar/conciliar/desfazer conciliacao (a liquidacao da OC acompanha pelo gatilho — fluxo que as tres telas
    PRECISAM), o desfazer de importacao do extrato (a RPC ja' recusa lancamento de OC viva) e a aba Documentos do lancamento.
  ⚠ EXCECAO CONSCIENTE (Gabriel, 04/10): "Criar OC a partir deste lançamento" (menu da linha e rodape do modal) continua SUMINDO
    para quem nao tem a tela, como no 02b — criar operacao sem poder abri-la nao se oferece, nem apagado.
  ⚠ A ABA DOCUMENTOS DE UM TITULO DE OC FICA LIBERADA (anexar nota e comprovante e' trabalho do financeiro), e GRAVA NA OPERACAO
    (`oc_documento_registrar/editar/cancelar`, `useLancamentoDocumentos.ts`); o cancelamento de documento de OC segue a frente
    DOC-CANCELAR-OC-01.
  ⚠ DIVIDA ACESSOS-TEXTO-DESFAZER-01: textos que ainda mandam ao "Desfazer compromisso" fora do modal, lugar que o perfil do piloto
    nao alcanca — o cancelar em lote (`FinanceiroV2Tab.tsx` ~:2999 e o toast ~:1423) e o toast do hook (`useFinanceiroV2.ts` ~:1199,
    `MOTIVO_BLOQUEIO_TITULO_OC`).
  ⚠ O modal zootecnico aberto pelo lancamento segue a divida ACESSOS-SAIDA-MODAL-ZOO-01. O rodape de 32px com o motivo + o botao
    apagado + a frase do titulo NAO foi medido com perfil sem a tela (so' se ve^ com usuario de teste). No teste, deixar o `onClick`
    no botao apagado nao derruba nada (o `disabled` ja' impede o clique): mutacao sobrevivente aceita.
- ⚠ O ENDERECO E' "/" (ACESSOS-02b; o dominio proprio aponta para o mesmo projeto): o sistema abre e navega na raiz. `/v2` e
  `/v2/...` continuam ABRINDO a mesma tela e sao trocados por "/" na barra, com query string e hash intactos (`ehEnderecoV2` e o
  efeito no `AppRouter`). ⚠ E' TROCA DE ENDERECO, NAO DESMONTE: as rotas "/" e "/v2" montam o MESMO `<V2Index />`; um `<Navigate>`
  no lugar desmontaria o `V2Index` a cada `navigate('/v2?flancId=…')` interno e a secao de origem (estado, fora da URL) se perderia
  — provado por mutacao. `/v2/qualquer-coisa` vira "/" (o V2 nunca leu o subcaminho).
  ⚠ DIVIDA URL-SEM-V2-CENTRALIZAR-01 (funciona pela troca, mas ainda escreve o endereco antigo, e a barra pisca `/v2` por um
    instante — ~20 pontos em 6 arquivos, montagem de URL espalhada):
    `LancamentoV2Dialog.tsx` (~:2070, :2326, :2735, :2969, :2975, :2981), `LancamentoDetalhe.tsx` (~:262, :1148, :1154, :1161),
    `FinanceiroCaixaTab.tsx` (~:625, :636), `CusteioTxtImportTab.tsx` (~:795), `CadernoImportTab.tsx` (~:156) e os rotulos
    `tela_origem` de `indicadorCatalogo.ts` (~:336, :365, :393). Um dono de montagem de URL do sistema e' PR proprio.
- ⚠ DIVIDA — A BARRA DO CELULAR NAO TEM NENHUMA DAS TRES TELAS DO PILOTO (decisao do Gabriel pendente): as cinco abas de
  `V2MobileNav` sao Home, "Operação" (id `'financeiro'`, que nem e' secao — os dois TS2322 da baseline), Plan., PC-100 e Mais; para o
  perfil do piloto a barra some, e no celular a pessoa entra em Lançamentos Financeiros e nao tem como ir a's outras duas.
- ⚠ O PERFIL NAO ADMIN NAO SE PROVA NO NAVEGADOR COM O LOGIN DO ADMIN: provado por teste (`src/v2/lib/acessoTelas.test.tsx`; a rota
  e' lida da FONTE, o `V2Index` nao se monta em teste); o Gabriel homologa com usuario de teste. Nao criar usuario, nao trocar
  perfil, nao mexer em `cliente_membros`.
- ⚠ EXCECAO POR TELA, NO DONO (ACESSOS-OC-01, Gabriel 05/10/2026, so' tela): `NIVEL_POR_TELA` (`src/v2/lib/acessoTelas.ts`) e' um mapa
  tela × perfil consultado ANTES da matriz por grupo, DEPOIS da marca `liberadaClientes` e do admin — a matriz por grupo NAO mudou.
  Hoje tem duas telas [desde o ACESSOS-OC-03a, GESTOR E FINANCEIRO 'editar'; `campo` e `leitura` 'nao' — o que o financeiro nao faz
  dentro da OC e' do dono de capacidade, regra abaixo]:
  `operacoes-comerciais` (a lista, agora com `liberadaClientes`) e `operacao-comercial` (a tela da operacao, fora do menu, liberada
  por `OPERACAO_COMERCIAL_LIBERADA_CLIENTES`, ao lado de `HOME_LIBERADA_CLIENTES`). Excecao nova entra NESTE mapa, nunca em `if` de
  perfil na tela. `TELA_DA_OPERACAO` (`usePodeAbrir.ts`) passou de 'lancamentos-zoot' a `TELA_OPERACAO_COMERCIAL`: os atalhos do 02b
  e os gestos do 02c voltam para o gestor e seguem escondidos / apagados para o financeiro; `FinanceiroV2Tab` le' a constante.
  ⚠ O QUE O GESTOR RECEBE: a lista e a OC inteira (abrir, criar, alterar), e SO' isso da Producao — "Lançar movimentação"
    ('lancamentos-zoot') e as demais telas do rebanho seguem sem a marca. No menu dele aparecem os grupos Producao (um item) e
    Financeiro.
  ⚠ A TELA DE ENTRADA TEM PREFERIDA (decisao do Gabriel, 05/10): `primeiraTelaPermitida` devolve a 'home' para quem a tem;
    senao `TELA_DE_ENTRADA_PREFERIDA` (`financeiro-lanc`, `acessoTelas.ts`) quando o nivel dela nao e' 'nao'; so' na falta dela, a
    primeira permitida na ordem do menu. Liberar uma tela que vem antes no menu (a lista de OCs) NAO muda onde a pessoa entra: o
    gestor segue entrando em Lançamentos Financeiros. Sem `if` de perfil.
- ⚠ A OPERACAO COMERCIAL TEM TELA PROPRIA, E ELA E' O `LancamentosTab` EM MODO "SOMENTE OPERACAO" (ACESSOS-OC-02, so' tela). A secao
  `operacao-comercial` (`TELA_OPERACAO_COMERCIAL`, `navGrupos.ts`; barra "Produção / Operação Comercial") monta o MESMO
  `V2LancamentosWrapper` com `somenteOperacao`: sem o titulo "Lançar movimentação", sem os atalhos de foto, sem os cards, sem a
  lista, sem o banner da trava mestre — so' o modal da OC que a URL pede (`oc_compra|oc_venda|oc_abate` + `oc_id`; sem `oc_id` = OC
  nova, aberta por `abrirOCNova`, a MESMA funcao dos tres cards). O estado da OC NAO saiu do `LancamentosTab`: o modo so' monta e
  esconde. Fechar chama `onFecharOperacaoOC` (o `fecharOperacaoOC` do `V2Index`, que volta a' origem por `oc_return`); a secao
  aberta sem OC na URL volta a' lista. `lancamentos-zoot` NAO mudou para o admin: os cards abrem a OC la' mesmo
  (`telaDaOCNova('lancamentos-zoot')`) e fecham no hub.
  · PORTAS: `abrirOperacaoOC` (lista, Financeiro, modal do lancamento), `?oc_compra=1` e `?oc_id` caem na secao nova; as telas
    que hospedam a OC sao `TELAS_QUE_HOSPEDAM_A_OC` (`atalhosProducao.ts`), lidas por `saiDoLancarComOC`.
  · A LISTA CRIA: "Nova compra", "Nova venda" e "Novo abate" (`CentralOperacoesComerciais`, classes do "Nova recorrência") chamam os
    `abrirNova*` do `V2Index`. Medido a 1.135: os tres em 430px, sem rolagem horizontal.
  · A FAIXA DE ATALHOS da Producao so' mostra telas com acesso (`opcoesDoAtalho(podeAbrir)`) e some com menos de duas.
  · "EXCLUIR DEFINITIVAMENTE" so' para o admin; para os outros, apagado com "só o administrador exclui definitivamente"
    (`MOTIVO_EXCLUIR_SO_ADMIN`). "REABRIR MÊS…" dentro da OC e' uma peca so', `ReabrirMesNaOC`
    (`src/components/operacao-comercial/ReabrirMesNaOC.tsx`, `usePodeAbrir('fechamento')`): sem a tela de fechamento, apagado com
    "só quem fecha o mês pode reabrir" — o gestor NAO tem 'fechamento' (sem a marca), entao para ele fica apagado.
  ⚠ NO MODO "SOMENTE OPERACAO" A VISTA "FAZENDA SEM PECUARIA" NAO BLOQUEIA: bloqueada, o modal da OC nao teria onde desenhar.
  ⚠ PRE-EXISTENTE, igual pelo card: OC nova em Global nasce com a Fazenda vazia em vermelho e o fechar pede "Fechar e descartar".
  ⚠ O QUE FICA PARA O ACESSOS-OC-03: o `financeiro` entra na OC com DUAS restricoes (Gabriel, 05/10) — nao registra
    entrega/saida/entrada do gado (Entrega e Recebimento so' leitura) e, na Negociacao, edita preco e condicoes, nunca quantidade e
    peso; ele cria OC nova e ve^ a lista inteira. Pede "capacidades na operacao" no dono (alem de 'nao'|'ver'|'editar'). O perfil
    `leitura` fica fora. A trava de gravacao continua sendo o 01F.
- ⚠ DENTRO DA OPERACAO COMERCIAL QUEM DECIDE E' A CAPACIDADE, NUM DONO SO' (ACESSOS-OC-03a, Gabriel 05/10/2026, so' tela):
  `podeNaOperacao(perfil, isAdmin, capacidade)` e a tabela `CAPACIDADES_OC` (`src/v2/lib/acessoOperacao.ts`, irmao do dono de tela).
  `NIVEL_POR_TELA` passou a dar a lista e a tela da OC a GESTOR E FINANCEIRO ('editar'); campo e leitura seguem 'nao'. A capacidade
  'abrir' anda junto com `nivelDaTela` da tela da operacao (preso por teste). Mudar o que um perfil pode = trocar UMA celula.
      capacidade                gestor  financeiro   o que e'
      abrir / criar             S       S            ver a lista, abrir e criar OC
      negociar_preco            S       S            criterio e valor do lote
      negociar_combinado        S       S            categoria, quantidade, peso, incluir/excluir lote — ANTES de mover gado
      negociar_apos_movimento   S       N            o mesmo, DEPOIS do primeiro movimento
      negociar_abate_boitel     S       N            a Negociacao de abate e de venda em boitel (03a: inteira; o 03b abre campo a campo)
      movimentar_gado           S       N            Entrega / Recebimento e "Estornar recebimento"
      concluir_negociacao       S       S            Concluir, e Reabrir enquanto nao houve movimento
      reabrir_apos_movimento    S       N            Reabrir negociacao / operacao depois do movimento
      lancar_realizado_boitel   S       N            "Lançar realizado do abate" (boitel)
      atualizar_entregas        S       S            "Atualizar entregas" do conta corrente
      excluir_definitivo        N       N            so' o admin
  · O MODELO E' "O COMBINADO x O QUE ACONTECEU": a Negociacao e' o combinado (o financeiro o edita e por isso CRIA a OC inteira);
    a Entrega/Recebimento e' o que aconteceu e move rebanho (so' o gestor). "HOUVE MOVIMENTO?" E' FATO, nao capacidade:
    `ocTemGadoMovido(movimentacoes)` (movimentacao VIVA; a estornada nao conta). O ponto de uso combina os dois por
    `motivoFisicoTravado` / `motivoReabrirTravado`, que devolvem o MOTIVO ou nulo.
  · O HOSPEDEIRO LE UMA VEZ E DESCE POR PROP: `LancamentosTab` chama `useAcessoOperacao()` e entrega `acessoOC` aos tres shells;
    sem a prop vale `ACESSO_TOTAL` (o DOM do gestor e' identico ao de quem nao a recebe — preso por teste). A lista
    (`CentralOperacoesComerciais`) le' o mesmo hook. Nenhum `if` de perfil fora do dono (teste por grep).
  · `fisicoBloqueado` (`AbaNegociacaoLotes`) E' A TRAVA "DEPOIS DO MOVIMENTO", e foi REUTILIZADA: a compra ja' a ligava com
    recebimento ativo (quantidade e peso travados, incluir lote escondido, preco aberto); a venda passou a liga'-la SO' pelo acesso.
    Vinda do acesso (`acesso.motivoFisico`), ela alcanca tambem CATEGORIA, LIXEIRA e INCLUIR LOTE, que ficam APAGADOS com o motivo
    escrito em vez de sumir. Para o gestor a venda segue como era (o banco trava quantidade e peso por lote com saida ativa).
  · ITEM QUE NAO VALE FICA APAGADO COM O MOTIVO (lista unica no dono: `MOTIVO_GADO`, `MOTIVO_APOS_MOVIMENTO`,
    `MOTIVO_REABRIR_APOS_MOVIMENTO`, `MOTIVO_ABATE_BOITEL`, `MOTIVO_SEM_CAPACIDADE`). Botao de rodape apagado = `GestoDeOperacao`
    (o do 02c). ⚠ EXCECAO DECLARADA: a aba Entrega/Recebimento em leitura NAO desenha os gestos apagados — ela usa o modo so'
    leitura que ja' tinha (o da OC cancelada, que esconde os gestos) e ESCREVE o motivo no lugar da frase do titulo financeiro.
  · ABATE E BOITEL NO 03a: Negociacao inteira em leitura para o financeiro, com o motivo escrito; Salvar e Concluir da Negociacao
    apagados com ele; "Novo abate" apagado na lista; na venda, a opcao Boitel do "Tipo de venda" apagada (e o campo travado numa
    venda que ja' e' boitel). Financeiro, Conta corrente, Compromissos e Documentos dessas OCs seguem liberados.
  ⚠ E' O QUE A TELA OFERECE: `oc_salvar_lotes` manda o lote inteiro e o banco nao distingue perfil — a trava de gravacao e' o 01F.
  ⚠ MEDIDO NO BANCO (05/10): `oc_confirmar` e `oc_reabrir` so' mudam o status e gravam o evento (nenhuma tabela de rebanho, nenhum
    gatilho em `zoo_operacoes_comerciais`); `oc_salvar_lotes` SEM movimento so' escreve lotes; COM movimento (caminho B) trocar a
    CATEGORIA de um lote reescreve `lancamentos.categoria` da movimentacao registrada — e' rebanho, e por isso a categoria fecha
    para o financeiro depois do movimento. `oc_reabrir` NAO tem guarda de movimento: quem reabre depois do recebimento muda preco e
    categoria, inclui lote e remove lote sem saida ativa; quantidade e peso do lote com saida ativa o banco recusa.
    `oc_sincronizar_entregas` ("Atualizar entregas") grava titulos financeiros e partes, nunca movimentacao.
  ⚠ PARA O 03b: abate e boitel campo a campo — carcaca e seletor do `ModalNegociarLote`; os ~30 campos de `BoitelBlocosModais`
    LIDOS UM A UM (dias, mortes e data do abate = fisico); o R$/@ derivado do total usa as arrobas gravadas, e sem arrobas o campo
    fica apagado com o motivo; 'lancar_realizado_boitel'; e ai' 'negociar_abate_boitel' sai da tabela.
  ⚠ DIVIDAS: ACESSOS-OC-ENTREGA-GESTOS-APAGADOS-01 (a excecao acima: desenhar cada gesto da Entrega apagado com o motivo) ·
    ACESSOS-OC-COMPRA-SHELL-TESTE-01 (o `CompraModalShell` nao se monta em teste: Estornar e Reabrir da compra provados pela
    FONTE; venda e abate, montados) · o motivo de "Novo abate" ocupa uma linha a mais sob os botoes da lista, so' para o
    financeiro — NAO MEDIDO a 1.135 (nao ha' usuario financeiro para o navegador) · `usePodeAlterarOperacao` (vincular e
    desvincular no modal do Financeiro) passou a valer para o financeiro, por consequencia do nivel da tela.
  ⚠ DIVIDA OC-REABRIR-APOS-MOVIMENTO-SEM-GUARDA-01: `oc_reabrir` nao tem guarda de movimento; reaberta, a OC aceita mudar preco e
    categoria, incluir e remover lote sem saida ativa, e trocar a categoria de lote ja' movido reescreve `lancamentos.categoria`
    da movimentacao. Vale hoje para gestor e admin (o financeiro ficou fechado no 03a). Decisao de produto pendente: o que o
    gestor pode alterar depois do gado movido.
- ⚠ O FINANCEIRO TEM AS TELAS DO TRABALHO DELE; O BLOQUEIO MAIOR E' O DO CAMPO (ACESSOS-FIN-01, Gabriel 06/10/2026, so' tela, sem
  banco): "O financeiro tem um acesso mais completo do sistema. O bloqueio maior tem que ser com o campo: o campo não pode ver nem
  mexer no financeiro, mas o financeiro pode mexer em mais áreas. Poderia bloquear para ele metas." ⚠ ISTO SUBSTITUI o que os
  blocos de cima dizem sobre "piloto de tres telas", "o gestor so' recebe a lista e a OC da Producao" e a tabela de capacidades do 03a.
  · AS 16 TELAS (`TELAS_DO_FINANCEIRO`, `src/v2/lib/acessoTelas.ts`; cada uma com a marca `liberadaClientes` E linha em
    `NIVEL_POR_TELA`): Financeiro — `financiamentos` (Financ. e Parcelamentos), `contratos`, `recorrencias`, `painel-financiamentos`,
    `visao-consolidada`, `fluxo-caixa` (o item "Fluxo Caixa"; o briefing dizia "Fluxo de Caixa" e o Gabriel confirmou este id — a
    versao META segue fechada); Producao — `lancamentos-zoot` (Lançar › Pecuária), `conferencia-lancamentos` (Pecuária ›
    Lançamentos), `fechamento` (Fechamento Área), `estoque-graos`, `barter-contratos`; Executivo — `valor-rebanho` (Evolução
    Patrimonial), `dre`, `painel-consultor` (PC-100); Cadastros — `fornecedores`, `contas-bancarias`.
  · NIVEL, igual nas 16: gestor_cliente 'editar' · financeiro 'editar' · campo 'nao' · leitura 'nao'. A MATRIZ POR GRUPO NAO MUDOU:
    e' a excecao da TELA que da' 'editar' ao financeiro em grupos onde a matriz so' lhe daria 'ver' (rebanho, executivo).
    ⚠ O CAMPO FICA 'nao' TAMBEM NAS CINCO DE PRODUCAO (decisao do Gabriel na pergunta da FASE 0, 06/10), embora a matriz do
      `rebanho` lhe desse 'editar': Pecuária › Lançamentos, Estoque de Grãos e Barter mostram dinheiro, e Lançar › Pecuária leva a'
      OC. Hoje o campo NAO ABRE TELA NENHUMA (preso por teste); abrir Producao ao campo e' PR proprio.
    ⚠ O LEITURA FICA 'nao', PROVISORIO: o efeito de 'ver' ainda nao existe (com 'ver' ele editaria). Ele segue so' com as tres do
      piloto, em 'ver'. Quando o modo somente leitura existir, as 16 linhas voltam a' matriz.
  · CONTINUA FECHADO PARA O FINANCEIRO (sem a marca; provado tela a tela): todo o Planejamento (META, inclusive as telas fora do
    menu), toda a Auditoria, todo o Validar e os Cadastros fora de Fornecedores e Contas Bancárias.
  · MENU do gestor e do financeiro: Produção (6 itens), Financeiro (9), Executivo (3), Cadastros (2). A TELA DE ENTRADA NAO MUDOU:
    `TELA_DE_ENTRADA_PREFERIDA` = Lançamentos Financeiros, embora a primeira do menu deles agora seja "Lançar › Pecuária".
  · DENTRO DA OC — REVERTE A DECISAO DE 05/10 (ACESSOS-OC-03a): o financeiro passou a registrar entrega e recebimento de gado e a
    alterar quantidade, peso, categoria e lotes depois do movimento. `CAPACIDADES_OC` depois (tres celulas trocadas):
        capacidade                gestor  financeiro
        abrir / criar             S       S
        negociar_preco            S       S
        negociar_combinado        S       S
        negociar_apos_movimento   S       S   <- era N
        negociar_abate_boitel     S       N
        movimentar_gado           S       S   <- era N
        concluir_negociacao       S       S
        reabrir_apos_movimento    S       S   <- era N
        lancar_realizado_boitel   S       N
        atualizar_entregas        S       S
        excluir_definitivo        N       N   (so' o admin)
    campo e leitura: N em todas. Na venda e na compra comuns o shell do financeiro rende o MESMO DOM do gestor (a unica diferenca
    e' a frase do boitel no "Tipo de venda"). O MECANISMO do 03a (fisico apagado com o motivo, Entrega em leitura, Reabrir apagado)
    FICA no codigo e hoje nenhum perfil que abre a OC cai nele; os motivos passaram a dizer "pelo gestor ou pelo financeiro".
    ⚠ NO ABATE o financeiro agora MOVE GADO (aba Entrega) com a Negociacao ainda em leitura ('negociar_abate_boitel' N, ate' o 03b).
    ⚠ NENHUMA RPC MUDOU: a trava de gravacao por perfil continua sendo o 01F.
  · SAIDAS TRATADAS (atalho para tela sem acesso nao e' oferecido). A rota consulta o dono num lugar so', `podeAbrirTela`
    (`V2Index.tsx`, em cima de `nivelDaTela`), e entrega o callback so' a quem tem o destino — as telas ja' desenhavam o botao so'
    com o callback: cartao "Chuvas" de Lançar › Pecuária (`chuvas-lancamento`); "Conferência do GMD" (`conferencia-mensal`) e "Mapa
    de Pastos" (`mapa-pastos`) do Fechamento Área; a seta de voltar do PC-100 (`home`; `onBack` virou opcional no
    `PainelConsultorTab`); a faixa "Financeiro" do desktop (`SUBNAV_FINANCEIRO`: so' as telas que a pessoa abre, e some com menos
    de duas — para o financeiro some, porque das quatro ele so' tem o Fluxo Caixa); e o cartao "Movimentações por foto"
    (`/caderno-importacao`, rota do `SoAdmin`), por `usePodeAbrirRotaSoAdmin` (`usePodeAbrir.ts`, espelho declarado do `SoAdmin`).
  · CONSEQUENCIAS, sem mudar regra: "REABRIR MÊS…" na OC (`ReabrirMesNaOC`, `usePodeAbrir('fechamento')`) ACENDE para o gestor e
    para o financeiro, porque os dois ganharam o Fechamento Área; a faixa de atalhos de Producao mostra as tres para os dois;
    "Ver contrato" da parcela de financiamento e "abrir no formulario principal" do modal zootecnico (divida
    ACESSOS-SAIDA-MODAL-ZOO-01) deixam de cair no aviso para eles.
  · `needs-wrapper` (o `status` do item) SO' DESENHA UM PONTO DE 6px no drawer (`V2ContextDrawer.tsx`); nao muda rota nem
    comportamento. Liberadas com a marca: `financiamentos`, `contratos`, `painel-financiamentos`, `fluxo-caixa`, `fornecedores`,
    `contas-bancarias`, `valor-rebanho`.
  ⚠ DIVIDAS: ACESSOS-FIN-LAYOUT-WRAPPER-01 (o que falta de layout nas sete telas `needs-wrapper` NAO foi levantado tela a tela — so'
    se sabe que a marca e' o ponto do drawer) · ACESSOS-FIN-META-DENTRO-DA-TELA-01 (o PC-100 e o Fluxo Caixa tem alternancia de
    cenario Realizado/Meta DENTRO da tela: o financeiro ve^ a meta por ali; nao tratado) · a barra do CELULAR continua sem aba para
    nenhuma tela dele · `MOTIVO_GADO` ainda e' a reserva de `motivoLancarRealizado` na venda (`VendaModalShell`), inalcancavel hoje ·
    ACESSOS-FIN-SAIDAS-NAO-VARRIDAS-01 (varridos: os callbacks que o `V2Index` entrega e os `navigate`/`window.location` das 16
    telas; os modais e dialogos internos de cada tela NAO foram lidos um a um) · NADA DISTO FOI PROVADO NO NAVEGADOR com perfil
    nao admin (homologacao do Gabriel, usuario Financeiro no cliente Teste).
- ⚠ A META SE LE^; SO' O ADMIN A CRIA OU EDITA — E "REABRIR MÊS…" NA OC E' CAPACIDADE (ACESSOS-FIN-03, Gabriel 06/10/2026, so' tela;
  SUBSTITUI a parte de meta do ACESSOS-FIN-02, commit 341439e5, que apagava a Meta para o financeiro): "O financeiro tem acesso a
  tudo. Só a criação da meta — onde eu coloco valor de meta no fluxo de caixa, lançar rebanho, nascimento, morte, área, tudo da
  meta — por enquanto sou só eu. Nem o dono, nem o financeiro, nem o campo. O campo só vai ver campo. O financeiro pode ver a meta
  do período no PC-100; ali ele não consegue editar nem mudar nada. Não adianta bloquear tanto assim."
  · DUAS PERGUNTAS SEPARADAS, NO DONO (`src/v2/lib/acessoTelas.ts`: `podeVerMeta` / `VE_META`, `podeEditarMeta` / `EDITA_META`;
    ajudantes `usePodeVerMeta()` e `usePodeEditarMeta()` em `usePodeAbrir.ts`). Nenhum `if` de perfil na tela.
        perfil            ver meta   editar meta
        admin             S          S
        gestor_cliente    S          N
        financeiro        S          N
        campo             N          N
        leitura           N          N
  · VER (as quatro das 16 telas que tem meta): a opcao Meta fica ACESA para quem ve^ — PC-100 (`PainelConsultorTab.tsx`, o
    alternador Realizado | Meta), Fluxo Caixa (`FinanceiroCaixaTab.tsx`, Realizado | META), DRE (a referencia "Meta" do card
    `FaixaVisoesPec`; `f_visao=meta` na URL) e Pecuária › Lançamentos (`FinanceiroTab.tsx`, os dois filtros Meta e as linhas de
    meta). Para quem NAO ve^ (campo, leitura — que hoje nem abrem essas telas): a opcao continua no controle, APAGADA com
    `MOTIVO_SEM_META` no `title`; quem chega com "meta" gravado cai em Realizado; a linha de meta nao entra na lista.
  · EDITAR — OS PONTOS DE ESCRITA DE META NAS 16 TELAS (⚠ ENTRADA DO 01F: o banco nao distingue perfil; isto e' so' o que a tela
    oferece). Para quem nao edita (`usePodeEditarMeta()` falso), o motivo e' `MOTIVO_META_SO_ADMIN` = "meta: só o administrador edita":
      (1) A GRADE META DO FLUXO CAIXA = a grade do Planejamento (`PlanejamentoFinanceiroTab.tsx`, montada pelo `FinanceiroCaixaTab`
          no lado META). Abre em LEITURA pelo MESMO modo que o Global ja' tinha (`semEdicao = isGlobal || !editaMeta`): as duas
          celulas editaveis (`EditableCell`, ajuste e subcentro normal) viram texto; o icone de importar subcentro some com o
          modo leitura (como no Global); e ficam APAGADOS com o motivo no `title`: Salvar, Projetos (o editor de projetos de
          investimento), Aprovar (resumo executivo), Parâmetros de Nutrição, Criar Snapshot e Restaurar versão. O motivo fica
          ESCRITO na barra da grade. Escritores por tras: `usePlanejamentoFinanceiro` (`salvarGrid`, `salvarCelula`,
          `importarSubcentro`, `salvarVersao`, `restaurarVersao`).
      (2) A LINHA DE META EM PECUÁRIA › LANÇAMENTOS: o detalhe (`LancamentoDetalhe.tsx`) tinha uma trava `metaLocked` ADORMECIDA
          (a expressao era sempre falsa); ela voltou a valer lendo o dono. Editar e Apagar ficam APAGADOS com o motivo (nao
          somem) e o aviso "🔒 Registro META — meta: só o administrador edita." fica escrito. O detalhe abre em leitura.
      (3) LANÇAR › PECUÁRIA nao oferece o cenario Meta: a rota entrega `cenariosPermitidos={['realizado']}` e o seletor apaga o
          resto (ja' era assim; preso por teste de fonte).
      (4) PC-100 e DRE NAO ESCREVEM meta (nenhum insert/update/RPC de escrita nos arquivos).
      As telas de PLANEJAMENTO seguem FECHADAS a todo nao admin (nenhuma marca `liberadaClientes`).
    Para o ADMIN nada muda: `semEdicao` volta a ser o Global de sempre, os `title` sao os de antes e a trava do detalhe e' falsa.
  ⚠ AS TELAS BUSCAM A META MESMO SEM MOSTRAR (hooks de dado intocados): PC-100, DRE e a lista de Pecuária › Lançamentos. 01F.
  · "REABRIR MÊS…" DENTRO DA OC (`ReabrirMesNaOC`) e' a capacidade `reabrir_mes` de `CAPACIDADES_OC` (ACESSOS-FIN-02, decisao do
    arquiteto, mantida): gestor S, financeiro N, campo N, leitura N (admin sempre); motivo "só quem fecha o mês pode reabrir". So' o
    gesto dentro da OC: a tela Fechamento Área nao consulta a capacidade.
  ⚠ MEDIDO, SEM MUDAR — o que o FINANCEIRO consegue dentro do Fechamento Área (`FechamentoTab.tsx`): "Fechar mês" em lote e
    "Reabrir Mês" em lote NAO aparecem para ele (`canEdit('zootecnico') || canEdit('pastos')` do `usePermissions` legado: so' gestor,
    admin e campo — ~:385, ~:980, ~:1026); mas o modal do PASTO (~:1417–1439) entrega salvar itens, fechar o pasto, reabrir o pasto
    (`reabrir_pilar_fechamento`) e copiar o mes anterior SEM passar pelo `canEdit` neste arquivo — o que o modal faz com isso nao
    foi lido. Decisao do Gabriel pendente: o que o financeiro pode no Fechamento Área.
  ⚠ DIVIDAS: nos controles Realizado | Meta e nos gestos da grade o motivo so' esta' no `title` (escrito, so' na barra da grade e no
    aviso do detalhe) · "Projetos" e "Aprovar" ficaram apagados INTEIROS para quem nao edita (nem a leitura deles abre): abrir em
    leitura pede olhar os dois modais · PC-100, Fluxo Caixa, DRE, Pecuária › Lançamentos, a grade META e o detalhe do lancamento
    NAO se montam em teste — provados LENDO A FONTE (o card do DRE, montado) · nada medido no navegador com perfil nao admin · o
    modal zootecnico (`LancamentoZooModal`) aberto por outro caminho que nao o detalhe nao foi auditado para linha de meta ·
    `usePermissions` (legado, com `if` de perfil; `canEditMeta = isAdmin`) segue decidindo o cenario Meta do "Lançar › Pecuária" e
    os gestos do Fechamento Área, fora do dono.
- ⚠ A TELA DE ACESSOS TEM CAMINHO, E SO' O ADMIN GERENCIA ACESSOS (ACESSOS-TELA-01, Gabriel 06/10/2026; tela + tres edge functions; SEM
  banco). Configurações › cartao "Acessos" -> secao `config-acessos` (fora do menu, SEM a marca `liberadaClientes`: gestor,
  financeiro, campo e leitura nao a abrem nem por endereco — `src/v2/lib/acessoTelaDeAcessos.test.tsx`) -> `src/pages/AcessosTab.tsx`.
  ⚠ NASCE DE UM FURO: a tela so' era montada por `CadastrosTab` e `Index`, que nao sao rota do V2, e as tres edge functions
    (`criar-usuario`, `redefinir-senha`, `remover-membro`) NAO ESTAVAM IMPLANTADAS no proto — foram implantadas em 06/10 (v1,
    `verify_jwt = true`, `supabase functions deploy <nome> --project-ref binbcdfbisgscrifztia --use-api`).
  · A TELA NAO ESCREVE EM TABELA: criar, redefinir e remover sao das edge functions; ela so' LE a lista (`cliente_membros` ativo +
    `profiles` nome/e-mail + `fazenda_membros`) e escreve o que a funcao devolveu (`lerRespostaDaFuncao`,
    `src/lib/acessos/acessosDaTela.ts`: em resposta nao-2xx o corpo vem em `error.context`, e a tela antiga mostrava so' a frase
    generica). O cliente e' o do seletor do topo ("Acessos de {cliente}"); sem cliente, formulario parado com o motivo.
  · REGRAS DAS FUNCOES, num dono puro (`supabase/functions/_shared/regrasDeAcesso.ts`, testado pelo vitest em
    `src/lib/acessos/regrasDeAcesso.test.ts`): (1) SO' ADMIN NO PILOTO — 403 "Só o administrador do AGROinBLUE gerencia acessos
    por enquanto."; o ramo do gestor continua no corpo, atras de `GESTOR_GERENCIA_ACESSOS = false` (uma constante por funcao);
    (2) ALVO PROTEGIDO — admin do AGROinBLUE nunca e' alvo de redefinir/remover, QUEM QUER QUE CHAME, e ninguem e' alvo de si
    mesmo; RELIGAR O GESTOR EXIGE ESTA REGRA (antes um gestor redefinia a senha de um admin com linha no cliente dele); (3) O
    E-MAIL EXISTENTE SE ACHA PERCORRENDO TODAS AS PAGINAS de `auth.admin.listUsers({ page, perPage: 1000 })` (a API admin do
    supabase-js v2 nao busca por e-mail; sem argumento ela devolve so' a primeira pagina), comparado em minusculas e sem espacos;
    (4) LOGIN REAPROVEITADO: a resposta leva `login_existente: true` e a tela escreve "Este e-mail já tinha login: o acesso ao
    cliente foi criado e a senha dele NÃO mudou."; (5) o erro leva `etapa` (validacao · permissao · alvo · login ·
    vinculo_cliente · inesperado) e a tela a escreve.
  · PERFIS NO PILOTO (`PERFIS_DA_TELA`): so' "Gestor do Cliente" e "Financeiro" se criam; o seletor nasce em Financeiro; "Campo" e
    "Leitura" ficam na lista APAGADOS com "aguarda a trava de gravação no banco" (o 01F: um login de leitura hoje GRAVARIA).
    Admin do AGROinBLUE nao e' criavel por aqui (a funcao recusa o perfil).
  · A SENHA so' vive no campo (`type="password"` com "mostrar", na criacao e na redefinicao) e no corpo da chamada: nao e'
    exibida de novo, o campo e' limpo no sucesso, e nao vai a log (as funcoes logam so' `err.message`), console, toast nem URL.
    Depois de criar: a linha aparece sem F5 e a tela escreve "Usuário criado. Passe o e-mail e a senha provisória à pessoa por
    canais separados."
  · LAYOUT: casca do V2 (titulo 20px; a secao esta' em `SECOES_APP_SHELL`); lista `table-fixed` (E-mail · Nome 150 · Perfil 104 ·
    Situação 52 · ações 60), cabecalho navy preso, 10px, linha de 18,5px, uma linha por pessoa (fazendas no `title` do nome); a
    linha do admin do AGROinBLUE nao tem acoes e diz "administrador · gerenciado fora desta tela" (as tres ultimas colunas
    juntas: a frase pede ~200px); a propria linha tambem nao tem acoes. Formulario de 292px com um slot de 12px de mensagem por
    campo (sempre presente) e o recado ESCRITO ao lado do botao (nunca toast); redefinir senha num dialogo fixo de 380 x 176;
    remover por `AlertDialog` dizendo quem e de qual cliente. Medido a 1.126 x 523 no cliente Teste (so' leitura): titulo 20px,
    lista 582 x 410 sem rolagem, cabecalho 9,5px sticky, 0 celulas cortadas, formulario 292 x 426 sem rolagem, pagina sem rolagem.
  ⚠ DIVIDA ACESSOS-CRIAR-USUARIO-ATOMICO-01: `criar-usuario` nao e' atomica — login criado e `cliente_membros` falhando deixa
    LOGIN SEM VINCULO (a resposta diz "o login foi criado e ficou SEM acesso a este cliente" e `login_criado_sem_vinculo`); os
    erros de `fazenda_membros` e de `profiles` nao sao lidos (a funcao responde sucesso); a ordem das gravacoes nao foi mexida.
  ⚠ DIVIDA EDGE-FUNCTIONS-NAO-IMPLANTADAS-01: tem codigo no repositorio e NAO estao no proto — `gerar-texto-fechamento`,
    `reset-boitel-teste`, `export-painel-consultor-excel` (as chamadas do front a elas falham). Implantadas: `export-xlsx` e
    `extract-caderno` (`verify_jwt` false) e as tres de acesso (true).
  ⚠ NAO PROVADO (a criacao real e' do Gabriel): criar, redefinir e remover de verdade; o e-mail existente achado em pagina alem
    da primeira no Auth real; o menu de perfil ABERTO no navegador (os itens apagados so' por teste da lista e da fonte); os dois
    dialogos abertos no navegador; a tela com varias linhas. Depois do deploy so' se provou, sem criar ninguem: sem token -> 401
    nas tres; token do admin + corpo vazio -> 400 com a frase de validacao; preflight do navegador passa com `verify_jwt` true.
  ⚠ As edge functions nao tem teste rodando (o repositorio nao tem estrutura Deno): testa-se a regra pura e a FONTE das tres.
  ⚠ TSC: o TS2367 de `V2Index.tsx` ("…and '"evolucao"' have no overlap") trocou "40 more" por "41 more" na mensagem — a uniao
    `V2Section` ganhou `config-acessos`; e' o MESMO erro da baseline.
- ⚠ O QUE FALTA: (a) o EFEITO de 'ver' nas telas (modo somente leitura por perfil) — hoje a funcao devolve o nivel e nenhuma tela o
  usa; no piloto as tres sao 'editar' para gestor e financeiro, e 'ver' para `leitura`, que hoje EDITARIA; (b) a trava no banco, 01F;
  (c) a grade por pessoa, ACESSOS-03; (d) [feito no ACESSOS-02b: o endereco e' "/"].
- ⚠ ACHADOS (medidos, sem corrigir):
  R1 — a raiz "/" NAO e' o v1: `pages/Index.tsx` deixou de ser rota (so' fica no repo) e `usePermissions.canViewTab` so' e' usado por
     ele. [As quatro rotas fora do V2 foram fechadas ao nao admin no ACESSOS-02b, e "/" passou a ser o proprio sistema.]
  R2 — saidas das tres telas para telas nao liberadas (caem no aviso): Lançamentos -> "Abrir OC" e o icone do produto
     (`FinanceiroV2Tab.tsx` ~:2741, ~:2858, ~:2883 -> `abrirOperacaoOC` -> 'lancamentos-zoot'); Lançamentos -> financiamento da
     parcela (~:529, ~:546, ~:563 -> 'financiamentos'); o link "Abrir →" / "corrigir na operação" do modal do lancamento (mesma
     porta da OC). Ficam dentro do permitido: Conciliação <-> Lançamentos (`onNavigateToLancamentos` / `onBack`). Dialogos que nao
     mudam de `section` seguem funcionando: modal do lancamento, cadastro de fornecedor pelo modal, saldo da conta ("Cadastrar" e o
     lapis da Conciliação), modais do Casar/Importar/Enriquecer e o do Contas a Pagar/Receber.
  R3 — fora do menu: a barra de secao so' tem o Sair; o atalho de Producao so' aparece nas telas de Producao (nao liberadas) e a
     sub-navegacao do Financeiro so' em telas nao liberadas — as duas somem no aviso; nao ha' busca global nem atalho de teclado no
     shell. `?oc_id` / `?oc_compra` na URL abrem 'operacoes-comerciais' / 'lancamentos-zoot' -> aviso. ⚠ A BARRA DO CELULAR NAO TEM
     ABA PARA NENHUMA DAS TRES TELAS (as cinco abas sao home, "financeiro" — que nem e' secao —, meta-cenario, painel-anual e
     configuracoes): no celular o perfil do piloto entra em Lançamentos Financeiros e NAO TEM COMO IR as outras duas. Pre-existente.

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
  DRE-DELTA-SOMA-01 · DRE-JUROS-ADM-01 · LAVOURA-2627-INVISIVEL-01 (a NF 9320690 inteira estava na 26/27 pelo defeito do
  modal; voltou a' 25/26 no PR-FIN-SAFRA-MODAL-01 — conferir se resta algo) · SAFRA POR CULTURA (PR-FIN-SAFRA-MODAL-01,
  pendentes de decisao do Gabriel): (a) `_fn_safra_da_cultura` (mandioca pela area, amendoim pela data) e' o PR seguinte;
  (b) 4b3c9636 (6.480) e c93b6582 (5.426,51), mandioca de jun/25 na 24/25-Lav, vindos de 24/25-Pec/sem safra — ficaram;
  (c) `agri_safra_area` com mandioca ATIVA tambem na 24/25-Lav (34,8 + 15 ha, plantio 01/06/2025) duplicando a 25/26, e
  amendoim da 24/25-Lav com plantio 10/11/2026; (d) amendoim com safra fora da data: 52 lancamentos, nada corrigido (D5);
  (e) o `por_bloco` do `nao_apropriado` de `fn_dre_lavoura` nao listava a Mao de Obra Direta (6.045,20 no total da 26/27 e em
  bloco nenhum) — medir · DIVIDENDOS-PLANO-01 · DRE-LEITOR-CHAVE-01 ·
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
  IMPORT-BANCO-AGNALDO (PR-CONC-IMPORT-BANCO-AGNALDO-01A, 03/10, migration 20261027191900, ⚠ registrada como 20261003172223;
  ledger = arquivo, md5 9e949ed2…): o desfazer de 03/10 16:39:18 UTC da importacao 95c641a0 ("mes errado") foi revertido para os
  93 extratos de AGOSTO (108 vinculos, 80 lancamentos descancelados e o 7f51a6cc de volta, pelo `audit_log.dados_anteriores`;
  as 2 liquidacoes de OC voltaram pelo gatilho do dono); ago/26 do Bradesco = o fixture de antes (conciliado, 54.738,55, 18
  dias, 116 linhas). Antes/depois e gesto contrario por linha em `conc_import_agnaldo_01a_backfill` (287 linhas). O CHECK de
  `conciliacao_audit_log.acao` ganhou 'importacao_restaurada'. Dividas: (a) [FECHADA no PR-CONC-IMPORT-BANCO-01B: a ocorrencia
  no hash, a gravacao atomica, a mensagem certa, o resumo e as travas do desfazer — ver a regra "A GRAVACAO DO EXTRATO E' DO
  BANCO"]; (b) TRES CABECALHOS 'processada' SEM NADA
  LIGADO, nao tocados: NJ 557b67fa "NJ_Import_Final_v3.xlsx" (19/04, 27.295 linhas, 27.283 VALIDAS e ZERO lancamentos com esse
  `lote_importacao_id` — o dado estranho: ou o lote foi regravado sem o id, ou os lancamentos sairam), 8e37fed9 (13/07, 0
  validas) e 80de5ff8 (23/07, 0 validas); (c) o status anterior de um extrato NAO se registra em lugar nenhum — o desfazer o
  sobrescreve com 'nao_conciliado' (a restauracao usou o invariante 'conciliado' <=> vinculo vivo, 4.836 de 4.837) [desde o
  PR-CONC-IMPORT-BANCO-01B o desfazer grava o status anterior em `conciliacao_audit_log.payload_antes`]. ·
  IMPORT-BANCO-01B (03/10), dividas: (a) DESFAZER SO' UM PERIODO DA IMPORTACAO (o Gabriel queria tirar so' os 7 de 02/09 da
  95c641a0): hoje o desfazer e' do arquivo inteiro — PR proprio; (b) [o 5o CABECALHO VAZIO do Agnaldo, e56f5c3b (03/10 17:30:51
  UTC), saiu na 20261027192100 (⚠ registrada como 20261003180742; ledger = arquivo, md5 0369cb9f…), com a guarda e o registro dos
  outros 4]; (c) "CLASSIFICADO" NO DESFAZER = `plano_conta_id` (decisao do Gabriel): o ca94d19c da 95c641a0 ("Devolucao aporte
  financeiro", 20.000) e' Dividendos POR TEXTO, a excecao do plano, e por isso o resumo diz "80 lancamentos serao cancelados (79
  classificados, 17 editados a' mao)" — se Dividendos deve contar como classificado e' decisao; (d) [FECHADA no UI-ARRASTAR-ARQUIVO-01b: a recusa do
  detector e a falha do leitor do "Importar Banco" sairam do toast e ficam escritas na linha, ao lado da area]; (e) a
  pre-deteccao da previa (`candRows`, a consulta dos vivos no intervalo do arquivo) NAO pagina: com mais de 1.000 extratos vivos no
  periodo do arquivo, o "ja' existe pela chave natural" da previa ficaria incompleto — o banco continua pulando certo (a RPC
  confere os dois indices), mas a previa contaria errado. ·
  [CONC-MESA-NN-01 FECHADA no PR-CONC-CONFERENCIA-FECHAMENTO-DIA (03/10): a Conferencia ancora todo extrato no dia dele, sem
  consumir nenhum; ver a regra "A DATA DO BANCO MANDA NA CONFERENCIA"] ·
  CONFERENCIA-FECHAMENTO-DIA (03/10), dividas: (a) o EXTRATO DA PLANILHA do Enriquecer AINDA ANCORA O N:1 NO LANCAMENTO
  (`montarMesa(..., { ancoraN1: 'lancamento' })` em `extratoDaPlanilha.ts`: o "Desmembrar" depende do N:1 consumir as linhas)
  — levar a' ancora do extrato e' PR proprio; (b) o "PR B" do CONC-CAIXA-PONTA-01 (resumo da Conciliacao, aba Sistema, painel
  do mes) continua aberto — so' a Conferencia e a Evolucao passaram a fechar como o caixa [o DONO ja' existe desde o
  PR-CONC-SALDO-UMA-REGUA-01: `fn_conciliacao_resumo_mes`, completo no 01b/01c; a aba Conciliacao, o quadro do topo e a aba Sistema
  do Casar trocaram no PR 02, e o painel do mes, o lapis e o "Conciliar o mes" no 02b; FICA o refresh sem F5 nos gestos de outras
  telas (PR 03);
  LOGO DEPOIS DO PR 02, o hotfix de seguranca de `fn_extratos_espelhados` (SECURITY DEFINER sem guarda de tenant)]; (c) DIVIDAS DE DADO, sem corrigir:
  SOBRE-APLICADOS (aplicado nos extratos da conta > valor) Vera Itau Personalite mai/26 77711d94 (2 x 360 num de 360; o gemeo
  d88ea17e sem par), NJ Itau BBA mar/26 e3e36029 (2 x 150.000 num de 150.000), Santa Rita BB jun/26 eabe167e (375.000 num de
  215.000; a outra metade "Venda 032 Novilhas" 160.000 sem par); SUB-APLICADOS (realizado com menos aplicado que o valor) Santa
  Rita Bradesco jul/26 f33269e9 (0,02 x 0,01) e Vera Itau Personalite set/26 a627a6eb (2,09 em 19/09 x 0,13 em 21/09); MEIAS
  TRANSFERENCIAS (lancamento vinculado so' ao extrato da OUTRA conta; a ponta desta conta solta) — 14: Santa Rita BB abr/26
  f56d3d79, BB jun/26 6d96ab88/7c1b7a71/c84a4e8b/5f853a10/74c3eb77, Bradesco abr/26 4e43075a, Itau mai/26 e5cdeef4, Sicredi
  abr/26 a00a7e7a/14bf4197, Sicredi jun/26 f6633d13, Sicredi jul/26 ac8a6e9c; NJ Cartao Sicredi Lavoura ago/26 fada1f53, Itau BBA
  mar/26 221204df; (d) o gesto "PAGOU DIFERENTE DO PROGRAMADO" (registrar o pago e abrir o saldo) e' PR proprio — a
  Conferencia so' MOSTRA a diferenca ·
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
  · IMPORT-CUSTO (PR-CONC-ENRIQ-IMPORT-CUSTO-01, 03/10): (a) A TELA ainda manda lotes de 100 (`TAMANHO_LOTE`,
  `useClassificacaoStaging.ts`) e, depois de CADA lote, `gravarDatasDaFatia` faz dezenas de UPDATEs agrupados por data que
  casam ZERO linhas (staging sem policy de UPDATE; o populate ja' grava as duas datas) — idas inuteis a cada lote, frente de
  tela; (b) o resolvedor de FAZENDA (`_fn_classificacao_resolver_fazenda_det`) tem o mesmo desenho (normaliza o cadastro a cada
  chamada) — barato hoje (poucas fazendas), mesmo conserto se crescer; (c) `aliases` que nao e' array: o corpo antigo dava ERRO
  na chamada, o novo trata como vazio (0 linhas assim no proto); (d) a FASE 0 do IMPORTACAO-MES segue [a ATOMICIDADE fechou no PR-CONC-ENRIQ-IMPORT-ATOMICA-01; o resto, abaixo]: atomicidade da
  importacao (sessao como entidade, retomar pelo mesmo uuid, Excluir que nao conta o `ja_aplicado` herdado), de-para de conta
  (hifen x espaco no apelido; agencia+numero levando cartao a conta corrente) e a atualizacao da importacao do mes.
  · IMPORT-ATOMICA (PR-CONC-ENRIQ-IMPORT-ATOMICA-01, 03/10): (a) LIMPEZA DAS SESSOES DO NJ set/26, pela tela e com o
  Gabriel: 53ff65d5, 05f22626 e eae81dda (incompletas, 400 de 470, nada gravado) ja' se excluem; a 6d08260f nao — 3 blocos
  conferidos e a gravacao DUPLICADA do lancamento 62347435 foram feitos nela (desfazer os blocos e reverter a gravacao antes);
  (b) A MESA ANTIGA (`src/v2/components/mesa/MesaClassificacaoTab.tsx`, #7 do PARE) FICOU FORA: ela tem regra propria de
  abertura (mais exatos + ambiguos) e ordena o seletor por data, sem olhar o estado — PODE ELEGER E ABRIR UMA SESSAO
  INCOMPLETA. O formato que ela le' de `useSessoesClassificacao` nao mudou (campos so' acrescentados); (c) LEITURA DA VIEW
  NOVA COM `(supabase as any).from` (o idioma das linhas vizinhas do mesmo hook): a view nasceu depois do `types.ts`, e a
  unica excecao do zero-cast e' o `.rpc` — regenerar os tipos tira o cast; (d) sessao escrita por aba ANTERIOR a este PR (sem
  `abrir`) nao tem registro: a tela a trata como legado completo, a regra do backfill; (e) PRs seguintes: DEPARA-CONTA-01
  (hifen x espaco no apelido; agencia+numero levando cartao a conta corrente) e IMPORTACAO-MES-01 (a atualizacao da
  importacao do mes).
  · SPLIT-REVERTER (PR-CONC-ENRIQ-SPLIT-REVERTER, 02/10): (a) 5 DESMEMBRAMENTOS ANTIGOS SEM REGISTRO (filhos ja' cancelados):
  7cfad218 (4 de 5), 720ea2d4, add72c81, d0352371, ec7b5153 — a Mesa diz "desmembramento antigo · sem registro para desfazer";
  (b) nos 15 retroativos o par anterior das linhas e' INFERIDO do status (`par_inferido`), nao gravado na hora; (c) o
  "filho editado" (aviso D5) e' `updated_at > created_at + 1s` — qualquer UPDATE posterior conta, inclusive automatico; (d) o
  rotulo da importacao na recusa e' a DATA da sessao ("importacao de 02/10 15:27"), nao o "Imp NN" (que so' o front numera);
  (e) 42 linhas de OUTRAS importacoes gravadas em filhos de split ficam sem `split_id` (dfd0f02c 16, 9b6785b2 11, e9a3a955 11,
  8a82eb7c 2, b8e5641d 2) — revertem pelo 1:1 de sempre (`tem_estado_anterior`), e IMPEDEM o desfazer do split dono enquanto
  aplicadas (caso vivo: dfd8ab98, filhos 65dbd985/2de72941 gravados na Imp 04); a linha NAO aplicada de outra importacao num
  filho vira par morto quando o split e' desfeito, e o Recasar dela a resolve; (f) o Reverter 1:1 (`handleReverter`) segue com
  toast — so' o fluxo do desmembramento saiu dele (UX-TOAST-01).
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
  da simulacao corta com "…" (`truncate`; conferir se o `title` leva o texto inteiro, regra da linha unica) — no Sicredi Pessoal "Sicredi Pessoal → Invest-Sicredi Pe…";
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
  Sicredi", 2 ids, 3 lancamentos); o `truncate` do recado e' pre-existente e corta com "…" (o texto inteiro esta' no `title` do gesto);
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
  (OC-RECLASSIFICAR-ITEM-01) · as tabelas que ainda empilham texto e os toasts de erro restantes (regra "uma linha por registro"; UX-TOAST-01) ·
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
  o painel ao lado repete a linha inteira; (5) a LISTA DE LANCAMENTOS FINANCEIROS (FIN-V2-COLUNAS-OC-01, decisao do Gabriel de
  05/10): Status a 8px (`.celula-status`) e Macro e Centro a 8,5px (`.celula-classe`), por classe da tabela no index.css — as
  demais colunas dela ja' renderizavam a 9px (datas e Doc. a 8px) pelo `.table-financeiro td`. Excecoes declaradas, nao precedente:
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
  diferentes com fundos diferentes; cor pelo sinal; cabecalho centralizado, numero a direita; texto que nao cabe corta na celula com o inteiro no `title`, numero,
  valor e data nunca (regra "UMA LINHA POR REGISTRO", abaixo).
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
  (COMPACTO: Competencia, Data venc., Data pgto., Valor, Conta bancaria, Conta destino) · Identificacao (Descricao,
  Fornecedor — nesta ordem desde o PR-CONC-ENRIQ-ACABAMENTOS-01) · Classificacao (Atividade, Fazenda, Plano de contas, Safra) · Complemento (COMPACTO: Documento · tipo, Forma de
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
- ⚠ UMA LINHA POR REGISTRO, SEMPRE (UI-LINHA-UNICA-01, Gabriel 04/10/2026 — SUBSTITUI a regra "texto cortado com reticencia e'
  proibido" de 27/09). Em TABELA, nenhuma celula quebra linha nem aumenta a altura da linha. Texto que nao cabe e' cortado na
  propria celula (nowrap + ellipsis) e o texto INTEIRO vai no `title`. Numero, valor e data NUNCA sao cortados: a coluna deles tem
  a largura do pior caso. Pedido literal: "eu odeio quando vai empilhando e alongando… pode esconder se for texto muito grande,
  mas nao vai empilhando".
  · ONDE JA' VALE (medido a 1.133): `TabelaDespesasOC` (regua 52·52·150·144·110·84·76·74·22 = 764, linha de 19px; datas a 9,5px; Descricao,
    Favorecido, Conta e Banco cortam), o extrato da conta corrente (`AbaContaCorrenteOC`: Conta e Banco cortam; `REGUA_EXTRATO`
    ganhou a coluna do "⋯" no OC-CC-ACOES-LINHA-02 — 53·26·26·80·94·136·84·81·81·81·22 = 764, linha de 18px) e a coluna Emitente da aba Documentos do lancamento. A celula de texto livre e' a `TDQ` de cada arquivo (deixou de
    quebrar e passou a cortar — nao ha' terceira variante).
  · ⚠ O RESUMO LATERAL FICA FORA, POR DECISAO: `LinhaResumo` com `quebra` (texto livre em ate' duas linhas, 16 usos) nao e'
    tabela e nao mudou — o paragrafo abaixo continua valendo PARA ELE.
  · ⚠ DIVIDA — tabelas que ainda empilham texto: `AbaRecebimentoLotes.tsx`, `EntregasVendaTabela.tsx`,
    `BuscarDespesaOCDialog.tsx` e a lista de DATAS na previa do ajuste de preco (`TD_DATAS_DA_PREVIA` em `AbaContaCorrenteOC`:
    data nao se corta e a coluna nao foi medida). Os comentarios ⚠ de ~24 arquivos que citam a regra antiga ("reticencia
    proibida") NAO foram varridos — so' os dos arquivos tocados.
- ⚠ NO RESUMO LATERAL O TEXTO LIVRE QUEBRA EM DUAS LINHAS (regra do Gabriel de 27/09/2026, no MODAIS-PADRAO-01e — vale so' para
  o `LinhaResumo`, nao para tabela). `LinhaResumo` ganhou `quebra` (opt-in): o VALOR ocupa ate' duas linhas, alinhado
  a' direita, sem "…", e o rotulo fica na primeira. Para TEXTO livre (produto, favorecido, conta, centro, subcentro);
  numero e data seguem numa linha so'.
  ⚠ NASCE DE MEDICAO: no resumo de 240px, "Impostos e Despesas de Abates e Vendas" pedia 200px e tinha 163, e o
    subcentro mais longo do plano ("Investimento Equipamentos e Informatica Administrativo", 269px) cortava ate' nos
    300px de antes. Com `quebra`, os dois aparecem inteiros em duas linhas (27px).
  ⚠ SEM A PROP NADA MUDA — provado: o HTML do `LinhaResumo` sem `quebra` e' identico ao do HEAD nas 96 combinacoes de
    props (valor, cor, forte, empilhado, seloAbaixo, selo). Abate, Venda, Compra e envelope nao a usam.
  ⚠ NO "CRIAR LANCAMENTOS EM LOTE" (Gabriel, 30/09, PR-CONC-CRIAR-LOTE-LAYOUT-01) o DOCUMENTO e o HISTORICO do banco que nao
    cabem na regua (Bradesco 91 caracteres, pedagio 126) sao cortados NA BORDA, sem "…", com o texto inteiro no `title` — era
    excecao a' regra antiga; pela regra nova (uma linha por registro) e' o caso comum, so' sem a reticencia.
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
- ⚠ TODO CAMPO QUE RECEBE ARQUIVO ACEITA CLICAR E ARRASTAR, POR UM COMPONENTE E UMA REGRA (UI-ARRASTAR-ARQUIVO-01a, Gabriel
  05/10/2026, so' tela). Campo de arquivo novo usa `AreaDeArquivo` (`src/components/ui/area-de-arquivo.tsx`) e quem decide se o
  arquivo serve e' `aceitarArquivo` (`src/lib/arquivo/aceitarArquivo.ts`). PROIBIDO `onDrop`/`dataTransfer` proprio em tela e
  PROIBIDO tela decidir tipo, tamanho ou quantidade por conta propria.
  · A REGRA (`RegraDeAceite`: `tipos`, `tamanhoMaxBytes`, `varios`, `frases`): `aceitarArquivo(arquivos, regra)` devolve `{ ok,
    motivo, codigo, arquivos, porArquivo: [{ arquivo, original, motivo, codigo }] }`. O TIPO sai do MIME quando o navegador o
    informa; SEM MIME (vazio ou `application/octet-stream`), da EXTENSAO — o `.xml` que chega sem tipo vale ONDE XML e' permitido.
    MIME informado e fora da lista recusa, mesmo com a extensao boa. ⚠ O ARQUIVO ACEITO SAI COM O TIPO PREENCHIDO (o mesmo
    conteudo com o MIME canonico quando veio da extensao): quem sobe o arquivo usa o que o dono DEVOLVE, e o caminho e o
    `contentType` seguem calculados como sempre. Catalogo de hoje: pdf, jpg, png, xml (OFX, planilha, TXT e CSV entram no 01b).
  · AS REGRAS QUE EXISTEM, cada uma num lugar: `REGRA_ARQUIVO_DO_DOCUMENTO` (PDF, JPG, PNG, XML, 10 MB) e
    `REGRA_ARQUIVO_DO_BOLETO` (PDF, JPG, PNG — a tela mostra o que grava) em `useLancamentoDocumentos.ts`; `REGRA_ARQUIVO_DA_OC`
    (PDF, JPG, PNG, XML, 10 MB) em `src/lib/oc/caminhoDocumento.ts`. Os donos antigos DELEGAM: `motivoArquivoRecusado`, o `anexar`
    do documento do lancamento, `motivoArquivoInvalido`, `anexarArquivo` da OC e `anexarSaldoDocumento`.
  · AS FRASES VEM DA REGRA, nunca escritas a' mao na tela: `fraseDeFormatoNaoAceito(tipos)` ("Formato não aceito. Envie PDF,
    JPG, PNG ou XML." — cita XML onde XML entra, e so' ali), `resumoDaRegra` (o texto da area: "PDF, imagem ou XML · até 10 MB")
    e `ajudaDaRegra` (a ajuda sob o campo). Sem frase propria valem as do dono ("Só PDF, imagem ou XML.", "Arquivo acima de
    10 MB.", "Solte um arquivo só."); frase em branco nao vale — o motivo nunca sai vazio.
  · O COMPONENTE: clicar na area (ou Enter/Espaco) abre o seletor; arrastar ARQUIVO por cima realca em verde (tokens `success`;
    conta entradas e saidas para nao piscar sobre os filhos; texto ou linha arrastada nao acendem nada). DOIS MODOS: "um"
    (padrao) recusa NA AREA, em vermelho, e nao chama o destino; "lote" entrega TODOS com o veredito de cada um e a tela mostra
    por linha (boletos; no "Do XML" quem julga cada arquivo segue sendo o `lerNFe`, e o teto de 2 MB mora nele). UMA LINHA: o
    texto corta com o inteiro no `title`, a parte `fixo` (tamanho) nunca corta, e a ALTURA E' A DO HOSPEDEIRO (`className`), a
    mesma vazia, com arquivo, com recusa e com realce. Desabilitada fica APAGADA com o motivo escrito (`motivoDesabilitado`).
    A area e' `relative`: o seletor escondido fica preso nela (solto, vazava da rolagem do modal).
  · PROTECAO GLOBAL, UMA SO', NO SHELL (`protegerSoltarFora`, ligada em `App.tsx`): arquivo solto FORA de uma area nao navega nem
    abre o arquivo. So' age com `dataTransfer.types` contendo "Files" e so' se ninguem tratou o evento antes; os arrastares que
    nao sao de arquivo (`EspelhoConciliacaoTab`, `DividendosTab`, `PastosTab`) usam `@dnd-kit` com sensor de PONTEIRO e nem
    passam por ela (preso por teste de fonte).
  · TROCADAS NO 01a (quatro): aba Documentos do lancamento (40px; o tipo errado e' recusado AO ESCOLHER, na area — antes so' ao
    gravar; a conferencia ao gravar continua, pelo mesmo dono), "Anexar vários boletos" (40px, lote), "Do XML" (48px, lote;
    sem cliente fica apagada) e o documento da OC (40px; a recusa saiu do toast; "Já há um arquivo anexado · enviar outro
    substitui" virou o texto da faixa, nao mais uma linha a mais; dois arquivos soltos = "Solte um arquivo só.").
  Medido a 1.135 no cliente Teste, sem gravar: "Do XML" area 1046 x 48 e modal 1080 x 239, antes e depois; formulario do documento
  area 478 x 40 e modal 512 x 491, iguais vazia / com realce / com recusa / com nome de 90 caracteres; boletos e OC 40px (marcacao
  injetada na largura do hospedeiro). Sintetico com "Files" fora de area: `defaultPrevented` = true; com texto: false.
  MEDIDO PARA O XML NA OC (A1): o bucket `oc-documentos` aceita `text/xml` e `application/xml` (10 MB), o caminho sai com `.xml`
  e a URL assinada nao filtra tipo — mas NENHUM `.xml` foi gravado ate' hoje em nenhum dos dois buckets (0 de 174 e 0 de 408):
  subir e abrir um XML de verdade nunca foi exercitado.
  · O 01b (05/10, so' tela) — OS CINCO CAMPOS SO'-CLIQUE DE TELA LIBERADA, pelo mesmo dono:
    - O GESTO SAIU DO COMPONENTE PARA UM HOOK, `useSoltarArquivo` (`src/lib/arquivo/useSoltarArquivo.ts`: contador de entradas,
      "so' arquivo", aceite pela regra, modos "um"/"lote"). A `AreaDeArquivo` o usa, e quem tem alvo que NAO e' uma area (uma
      linha de tabela) espalha o `alvo` dele no elemento. ⚠ `onDrop`/`onDragOver`/`dataTransfer` SO' EXISTEM no hook e na protecao
      global — preso por `src/lib/arquivo/umSoArrastar.test.ts`, que varre a fonte e so' admite as duas areas de foto do 01c.
    - CATALOGO: entraram `ofx`, `xlsx`, `xls`, `csv`, `txt`. O tipo sai (1) da EXTENSAO quando nao ha' MIME (vazio ou
      `application/octet-stream`); (2) da extensao quando o MIME e' proprio OU GENERICO DAQUELE TIPO — `text/plain` para OFX e
      CSV, `application/vnd.ms-excel` para CSV (o Windows com Excel o manda); (3) senao, do MIME proprio. Um `.pdf` em
      `text/plain` continua NAO sendo PDF. MIME proprios presos em teste: OFX `application/x-ofx` / `application/ofx` /
      `application/vnd.intu.qfx`; CSV `text/csv` / `application/csv` / `text/comma-separated-values`.
    - SEM LIMITE NOS IMPORTADORES (Gabriel: nao inventar numero): as regras do Importar Banco, da planilha do mes e do Excel de
      classificacao NAO tem `tamanhoMaxBytes`, e o dono aceita regra sem ele (preso por teste). 10 MB so' no documento e no boleto.
    - `motivoExterno` (prop da area): a recusa que so' o HOSPEDEIRO sabe dar depois do aceite; `detalhe=""`: so' o convite.
    - BOLETO POR PARCELA (`ParcelasDaCompra`): a LINHA inteira e' alvo de soltar (`LinhaDaParcela` + o hook), 18px em todo
      estado; a regra e' a do BOLETO (PDF, JPG, PNG — XML passou a ser recusado, no soltar e no "+ Boleto"); recusa na celula
      Boleto; soltar sobre parcela que JA' tem boleto pergunta NA CELULA "Substituir o boleto? Sim / Não" (Sim tira o antigo e
      guarda o novo; Nao ou Esc desfaz — o Esc e' tomado na janela, em captura, para o modal nao fechar). Nada grava ate' o Salvar.
    - EXTRATO DO SALDO (`SaldoRealDialog`): a linha do "Anexar" virou a area, nos mesmos 24px. Cada extrato ACRESCENTA um anexo
      (nunca substitui — por isso nao ha' pergunta) e soltar GRAVA NA HORA, como o botao gravava. A recusa (do tipo e do banco)
      fica na area; durante o envio a area fica apagada com "Anexando o extrato…".
    - IMPORTAR BANCO (`ImportarBancoInline`): a area no lugar do botao, 232 x 28 na linha de 28px; sem conta, apagada com
      "Escolha a conta primeiro". DUAS CAMADAS: o dono deixa passar pela extensao e `detectarTipoArquivo` (INTOCADO) julga o
      conteudo depois. Recusa do detector ou do leitor: a area diz "Arquivo recusado" e a FRASE INTEIRA vai para a direita da
      linha (`recusa-do-arquivo`, vermelho, uma linha, inteira no `title`); as pilulas de formato deixam de esticar enquanto ela
      esta' la'.
    - ENRIQUECER passo 1 (`EnriquecerTresPassos`, .xlsx/.xls, 264 x 28) e o dialogo "Importar Excel de classificação" da Mesa
      (`EnriquecimentoImportarDialog`, so' .xlsx, 300 x 23): a area no lugar do campo do sistema, na mesma altura; o tipo errado
      e' recusado na area ANTES do leitor. ⚠ LARGURA FIXA: sem ela a area do passo 1 alargava de 220 para 258px com a recusa.
    Medido a 1.135 (Teste; NJ so' leitura no Enriquecer e na Mesa): linha da parcela 18px vazia / com realce / com boleto / com a
    pergunta / com recusa, tabela 750 x 102 e modal 1024 x 491 iguais; extrato do saldo 396 x 24, dialogo 448 x 353; Importar
    Banco linha de 28px; passo 1 caixa de 66px; Mesa barra 718 x 36 e dialogo 720 x 481.
    ⚠ DIVIDA UI-ARRASTAR-FRASE-DETECTOR-01 — A FRASE DO DETECTOR NAO CABE INTEIRA a 1.135: pede 561px e tem 189 (faltam 372) — corta com o inteiro no `title`.
  ⚠ UI-ARQUIVO-CAMPO-SEM-ENTRADA-01: os seletores de arquivo de `V2ImportLancamentosExcel.tsx` (~:239) e
    `CusteioTxtImportTab.tsx` (~:588) NUNCA SE DESENHAM — so' aparecem sem `arquivoInicial`, e o unico lugar que monta as duas
    telas (`ImportarBancoInline.tsx`, `<V2ImportLancamentosExcel arquivoInicial={arquivo} />` e `<CusteioTxtImportTab
    arquivoInicial={arquivo} … />`) sempre passa o arquivo. Nao foram trocados; apagar e' decisao.
  ⚠ FILA: 01c — so' admin: `MapaRebanhoImportDialog` e `CadernoImportTab` (ja' arrastam; area alta com previa pede conteudo proprio),
    `MesaClassificacaoTab`, `V2MesaOperacional`, `ExcelImportDialog`, `KmlUploadDialog`, `AbateDetalhesDialog` (4 campos) ·
    legados sem rota ficam (`ImportMapaPastos`, `ImportacaoFinanceira`, `ImportZootHistoricoTab`).
  ⚠ DIVIDAS: no passo 1 do Enriquecer e no dialogo da Mesa a FALHA DE LEITURA da planilha (xlsx corrompido) segue em toast — so' o
    tipo errado foi para a area · a lista de MIME por navegador nao foi medida em maquina real · o soltar no extrato do saldo
    (grava na hora), a planilha valida solta no Enriquecer / na Mesa e o Esc da pergunta da parcela dentro do modal real so' por
    teste · o toast de recusa do `anexarArquivo` da OC continua (so' a recusa do formulario saiu do toast) · NAO PROVADO NO
    NAVEGADOR: o arrasto real do Finder (so' evento sintetico), boletos e OC dentro dos modais reais, o clique abrindo o seletor
    do sistema, e os tres `@dnd-kit` com a protecao ligada (so' por teste de fonte) · OC-DOCUMENTO-XML-REAL-01: subir e abrir um
    `.xml` real na OC e na aba Documentos (homologacao do Gabriel).
- ⚠ LISTA OU MENU FECHANDO NAO ACEITA CLIQUE (MENU-CLIQUE-FECHANDO-01, Gabriel 08/10/2026, so' tela). Regra de produto: NENHUM GESTO
  ACONTECE POR CLIQUE EM COISA QUE O OPERADOR JA' NAO ESTA' VENDO. Ao fechar, o conteudo do Radix continua no DOM com
  `data-state="closed"` enquanto roda o `animate-out` (150 ms; numa aba OCULTA a animacao nao anda e ele fica la' indefinidamente),
  e aceitava clique: um segundo clique no mesmo lugar trocava o fornecedor escolhido ou disparava o segundo item do "⋯".
  · PRIMEIRA TRAVA, NO PRIMITIVO: a classe `data-[state=closed]:!pointer-events-none`, ESCRITA POR EXTENSO (nunca montada em tempo
    de execucao) no conteudo de `popover.tsx` (1), `dropdown-menu.tsx` (2: conteudo e submenu), `context-menu.tsx` (2),
    `menubar.tsx` (2) e `hover-card.tsx` (1). ⚠ O "!" NAO E' ENFEITE: dentro de um Dialog o Radix poe `pointer-events: auto`
    INLINE no conteudo da lista (medido no Novo lançamento), e inline vence classe comum; com o "!" o computado e' `none`.
    Alcanca de uma vez tudo o que usa o `PopoverContent` da casa: seletor de fornecedor, `SearchableSelect`, `DatePicker`,
    seletor do plano e os demais combobox.
  · SEGUNDA TRAVA, EM CODIGO (a que o jsdom prova — ele nao aplica CSS ao clique sintetico): no `FavorecidoSelect` os tres gestos
    da lista (`handleSelect`, que tambem serve o Enter da busca; `handleLimpar`; a acao do pe') comecam com `if (!open) return;`;
    no `DropdownMenu`, `Item`, `CheckboxItem` e `RadioItem` passam o `onClick` por `recusarSeFechado` (impede o clique, e o Radix
    so' chama o `onSelect` de clique nao impedido). Quem responde "este conteudo ja' fechou?" e' `conteudoFechado(el)`
    (`src/components/ui/menuPadrao.ts`). A animacao de saida nao mudou; nada muda de tamanho nem de posicao.
  · PARA ONDE VAI O SEGUNDO CLIQUE: para o que esta' EMBAIXO. Medido: sob a lista do fornecedor no Novo lançamento estava o campo
    Subcentro — o clique abriu a lista dele (nao grava); sob o "⋯" da lista de Lançamentos, depois de "Editar", estava o texto do
    resumo do modal ja' aberto — nada aconteceu. ⚠ NAO VARRIDO tela a tela: onde houver botao que GRAVA sob uma lista, o segundo
    clique o alcanca como alcancaria com a lista ja' fora do DOM (e' o clique duplo de sempre, nao um gesto escondido).
  · INVENTARIO DO PASSO 0 (sondagem: o primitivo montado com a animacao de saida simulada; "dispara" = o segundo clique chamou o
    handler com o conteudo em `closed`):
        componente (arquivo:linha)                saida     usado em   dispara fechando?
        Popover (`popover.tsx:20`)                150 ms    19         SIM -> consertado
        DropdownMenu (`dropdown-menu.tsx:52,71`)  150 ms    14         SIM (item e submenu) -> consertado
        ContextMenu (`context-menu.tsx:47,63`)    150 ms    0          SIM -> classe (sem uso no sistema)
        Menubar (`menubar.tsx:72,91`)             150 ms*   0          SIM -> classe (sem uso; *o conteudo principal nao tem `animate-out`)
        HoverCard (`hover-card.tsx:19`)           150 ms    0          SIM -> classe (sem uso)
        Tooltip (`tooltip.tsx:20`)                150 ms    28         nao se aplica (sem conteudo clicavel)
        Select (`select.tsx:89`)                  —         143        NAO (o Radix Select nao tem `Presence`: sai do DOM na hora)
        SearchableSelect                          —         12         NAO (a lista sai do DOM ao fechar)
        Command (dentro de Popover)               a do Popover 9       coberto pelo Popover
        NavigationMenu, Accordion, Sidebar, Drawer —        0          nao sondados (sem uso no sistema)
        Dialog (`dialog.tsx:22,50`)               200 ms    145        SIM — NAO CONSERTADO (ver divida)
        AlertDialog (`alert-dialog.tsx:19,37`)    200 ms    42         SIM — NAO CONSERTADO
        Sheet (`sheet.tsx:22,32`)                 300 ms    10         SIM — NAO CONSERTADO
  PROVA NO NAVEGADOR (cliente Teste, 08/10, aba em SEGUNDO PLANO — o caso em que a janela nao fechava nunca; 8 fornecedores
  sinteticos criados e APAGADOS; nada gravado): Novo lançamento, lista do fornecedor fechada e ainda no DOM (`closed`), inline
  `auto`, computado `none`; o ponto onde estava a 5ª opcao devolve o campo Subcentro (`elementFromPoint`) e o clique REAL do mouse
  ali abriu o Subcentro — o fornecedor ficou "SINT FORN Repetido · 123.456.789-09". Menu "⋯" da lista: "Editar" abriu o modal, o
  menu ficou `closed` no DOM, o ponto do "Duplicar" devolve o texto do modal e o clique real nao duplicou nada.
  Testes: `src/components/ui/menuFechadoSemClique.test.tsx` (14: gesto com a saida simulada, `conteudoFechado`, e a FONTE dos
  primitivos com auto-teste do detector — recusa a regra sem o "!" e montada em pedacos). 12 mutacoes mortas, uma por trava.
  ⚠ DIVIDA DIALOG-CLIQUE-FECHANDO-01 (medida, NAO consertada — conserto de outro tamanho, texto proprio): em `Dialog`,
    `AlertDialog` e `Sheet` o botao continua clicavel durante o fechamento (200–300 ms; indefinidamente em aba oculta). Na
    sondagem, o segundo clique num "Salvar" de `Dialog`/`Sheet` e num `AlertDialogAction` ("Excluir") chamou o handler DE NOVO
    com o conteudo ja' em `closed`. Se isso grava em dobro depende de cada tela ter a propria guarda (botao desabilitado
    enquanto salva) — NAO auditado tela a tela. Efeito colateral visto na prova: em aba oculta o modal fechado fica no DOM com
    a cortina por cima e a pagina nao recebe clique ate' recarregar.
  ⚠ NAO PROVADO NO NAVEGADOR: a aba em PRIMEIRO PLANO com o segundo clique dentro dos 150 ms (a janela que a extensao abre fica
    em segundo plano; a aba oculta e' o caso mais largo do mesmo defeito) · o menu "⋯" ANTES do conserto falhando no navegador
    (no caso provado o Radix ja' punha `pointer-events: none` inline, porque um modal abriu por cima; o defeito do menu esta'
    provado pela sondagem e pelo teste) · `DatePicker`, seletor do plano, `ContextMenu`, `Menubar` e `HoverCard` na tela.
  ⚠ DOIS CLIQUES POR SCRIPT NO MESMO INSTANTE (antes de o React redesenhar) ainda escolhem duas vezes: a lista esta' ABERTA nos
    dois. Nao e' gesto de pessoa (dois cliques fisicos nao cabem no mesmo quadro); registrado para nao confundir prova futura.
- ⚠ A PAGINA SE DECLARA EM PORTUGUES DO BRASIL E NAO SE TRADUZ (APP-SEM-TRADUCAO-01, Gabriel 08/10/2026, so' tela). `index.html`:
  `<html lang="pt-BR" translate="no">` + `<meta name="google" content="notranslate">`; `public/site.webmanifest`: `"lang": "pt-BR"`.
  PROIBIDO tirar qualquer uma das tres marcas ou trocar o idioma da pagina em tempo de execucao — preso por
  `src/lib/app/semTraducao.test.ts` (le' a fonte, com auto-teste do leitor). NADA de marcar tela por tela: a declaracao mora no
  `index.html` unico (o teste tambem prende que ele e' o unico HTML na raiz e em `public`).
  ⚠ NASCE DO PILOTO: com `lang="en"` o Chrome oferecia traduzir, e o Novo Lançamento saia com "Competência de Dados" (era "Data
    Competência"), "Pré-visualização" (era "Previsto"), "Contém origem" (era "Conta origem") e "SelecionarFaz. Sta. Tereza".
  · MEDIDO ANTES DE MUDAR: nenhum codigo altera `document.documentElement.lang`; nenhum `:lang(` nem `hyphens` em `src`, no
    `tailwind.config.ts` ou no `index.html` (o unico "hifen" do repo e' o `hyphenationCallback` do PDF, que nao le' a pagina);
    `e2e/harness.html` ja' era pt-BR e nao e' servido; nao ha' pagina de erro, 404 nem PWA proprios (`vercel.json` so' reescreve
    tudo para `/index.html`).
  · NUMERO E DATA NAO DEPENDEM DO IDIOMA DA PAGINA (o `Intl` do navegador nunca le' o `lang` do HTML): dos 338 `toLocale*` de
    `src`, 337 tem idioma explicito (334 'pt-BR', 3 'sv-SE') e 1 nao (`src/components/ui/chart.tsx:212`, `toLocaleString()` — segue
    o idioma do NAVEGADOR, como antes); os 27 `Intl.NumberFormat` sao 'pt-BR'; dos 131 `localeCompare`, 41 tem idioma e 90 nao
    (idioma do navegador, como antes). Corretor ortografico: `Input` e a busca dos menus ja' tem `spellCheck={false}`; nos demais
    campos de texto o navegador passa a sugerir em portugues.
  · Nenhuma foto e nenhum snapshot mudou.
  ⚠ NAO PROVADO: o balao do tradutor em si (depende do Chrome de cada pessoa — quem ja' tem "traduzir sempre" ligado para o site
    precisa desligar) e a pagina ja' aberta antes da publicacao (so' muda ao recarregar).
  [A divida MENU-CLIQUE-FECHANDO-01, medida neste passo, FECHOU no commit seguinte — ver a regra "LISTA OU MENU FECHANDO NAO
    ACEITA CLIQUE", acima.]
- ⚠ FORNECEDOR NA OC: OS OITO PONTOS USAM O DONO PELO LEITOR UNICO (FORN-SELETOR-PADRAO-01 fatia 2b, Gabriel 08/10/2026, so' tela).
  ⚠ REGRA DAS FATIAS (Gabriel, 08/10): NAO ALARGAR NEM ESTREITAR O CONJUNTO QUE CADA TELA OFERECIA SEM REPORTAR ANTES DE MUDAR; lista
    restrita (tipo, papel, credor, sugestoes) se mantem pela prop de opcoes restritas do dono (ainda nao existe: nenhum ponto ate'
    aqui era restrito).
  · O QUE CADA LISTA OFERECIA (medido antes de trocar): NENHUM dos oito era restrito por tipo ou papel — todos os fornecedores
    ATIVOS do cliente. Diferencas que o dono uniformiza, as duas ja' decididas (D7 e passo 1b) e confirmadas pelo Gabriel antes
    da troca: "[META]" FORA em todos (so' o abate e os tres que ja' usavam o dono o tiravam; compra, venda, liquidacao e
    documento o ofereciam); o EM USO INATIVO fica no campo com a marca "inativo" e SAI da lista (a lista de
    `useOperacaoLiquidacao` o punha entre as opcoes). O `CriarOCDoLegadoDialog` recebia a lista inteira do Financeiro e o dono ja'
    a filtrava (ativos, sem "[META]"): conjunto igual.
  · OS PONTOS (todos `<FavorecidoSelect clienteId=…>`, sem `fornecedores`; preso por teste de fonte):
      `CompraModalShell` (fornecedor): `api.clienteId`; `limpavel` com "Nenhum selecionado"; o "+" e' o do dono, APAGADO em somente
        leitura (`novoDesabilitado`); a linha que so' aparecia com documento SAIU (e' a linha fixa do dono).
      `VendaModalShell` (comprador) e `AbateModalShell` (comprador): prop nova `clienteId` (opcional), entregue pelo
        `LancamentosTab` (`clienteAtual?.id`). No abate o CNPJ deixou de ser segunda linha (vai a' direita, numa linha), o
        "+ Cadastrar comprador" de dentro da lista e' a `acaoFinal` do dono, e `compradoresDoAbate` saiu.
      `BoitelBlocosModais` (frigorifico da B): a prop `frigorificos` (lista) virou `clienteId`; `opcoesDeFavorecido` saiu; a opcao
        passou a mostrar o documento.
      `AbaLiquidacaoOC` (favorecido), `AbaCompromissosOC` (despesa), `DocumentoFormOC` (emitente; prop nova `clienteId`, que so' o
        `AbaDocumentosOC` passa — no documento por lote do Recebimento a lista segue VAZIA, como era sem `fornecedores`) e
        `CriarOCDoLegadoDialog` (comprador).
  · O DONO GANHOU (opcionais; sem elas o HTML dos hospedeiros de antes e' identico — as fotos do modal nao mudaram): `search` /
    `onSearchChange` OPCIONAIS (sem as duas a busca e' estado do seletor: os shells tem return antecipado e nao ganham estado so'
    para isto); `novoDesabilitado`; `novoRotulo` (title e aria-label do "+"); `rotuloDoVazio` (o texto do item que esvazia: no
    emitente da OC o vazio SIGNIFICA "Mesmo da operação — <contraparte>", e o item e o campo vazio dizem isso).
  · EMITENTE DO DOCUMENTO DA OC: escolher grava id, nome e o documento DO CADASTRO (pelo `onSelected`, do leitor); esvaziar manda
    os tres NULOS (a regra de sempre). `src/components/compra/documentoFormEmitente.test.tsx`.
  · LINHA FIXA, POR MEDICAO: LIGADA em compra, venda e abate (modal de altura fixa: 549px a 579 de janela e 493 a 523, iguais com
    e sem a linha; compra e abate sem rolagem; a venda a 523 JA' rolava 10px por dentro — 404/394 — e passa a 418/394, crescimento
    dentro de rolagem que ja' existia). DESLIGADA, documento no `title`: despesa da OC (o dialogo tem altura pelo conteudo e ia
    de 553 a 567px), liquidacao (mesma forma de dialogo; NAO medida), boitel (dialogo 393px, linhas proprias sob o campo),
    documento (o CNPJ do emitente e' o campo de baixo) e a celula de tabela do "Criar OC do legado".
  · LEITORES, depois da troca (nada apagado): a lista do `LancamentosTab` (`abateFornecedores`, so' ativos) segue alimentando os
    NOMES do cartao do topo e do resumo lateral dos tres shells (`fornecedorNome`, `compradorNome`, `frigorificoNome`/`Doc`), a
    hidratacao por `matchFornecedor`, o sentinela "[META]", os tres seletores do formulario legado inline (~:5438, :5490, :5547),
    os shells de META (fatia 2e) e os textos de confirmacao; a de `useOperacaoLiquidacao` segue alimentando os nomes de
    favorecido e contraparte em `AbaCompromissosOC`, e em `DocumentoFormOC` o rotulo "Mesmo da operação — nome" e o casamento do
    emitente lido do PDF (CNPJ exato / candidatos por nome).
  PROVA NO NAVEGADOR (cliente Teste, 08/10, aba em SEGUNDO PLANO, janela 1.115 x 579 e depois 523; 9 fornecedores e 3 OCs
  sinteticos, criados e APAGADOS): compra — lista sem "[META]" e sem o inativo, "3 iguais", busca por nome e por digitos
  ("99888"), Enter escolhe, linha "99.888.777/0001-66", modal 549 = 549; SALVA: `zoo_operacoes_comerciais.contraparte_id` = o
  fornecedor escolhido (conferido no banco); reaberta por `?oc_id`, o campo traz o nome e a linha; com o fornecedor INATIVADO,
  nome + marca "inativo" + documento (nunca vazio). Documento da OC — campo "Mesmo da operação — <nome>", busca por digitos,
  escolhido preenche o CNPJ do emitente. Despesa — 553px, contraparte ja' escolhida com o documento no `title`; "+" cria
  "…criado na OC" e ele volta ESCOLHIDO e aparece na lista, sem F5. Venda — nome ("repetido": 3 opcoes), digitos do CPF, linha
  "123.456.789-09". Boitel (B) — 393px, nome e digitos, documento no `title`. Abate — 493 = 493, "Cadastrar comprador" no pe' da
  lista, digitos do CNPJ, linha. 20 testes novos; 8 mutacoes mortas e 1 sobrevivente EQUIVALENTE (esvaziar o emitente sem limpar
  nome/documento do estado: o payload ja' os manda nulos sem id).
  ⚠ ARTEFATO DA ABA OCULTA, NAO DEFEITO: com a aba em segundo plano a animacao de fechar do Popover nao termina e a lista
    (invisivel) continua recebendo clique — um clique meu no "Tipo de venda" trocou o comprador. Nao reproduz com a lista ja' fora
    do DOM. Em prova por script, conferir `[data-testid=favorecido-lista]` antes de clicar perto do campo.
  ⚠ ACHADOS, sem corrigir (fora do seletor): com o fornecedor INATIVO, o cartao do topo e o resumo lateral dos shells mostram "—"
    (leem a lista de ativos do hospedeiro; ja' era assim) · o rotulo "Fornecedor/Comprador *" da coluna esquerda fica ~10px abaixo
    do rotulo da direita nos tres shells (o `Label` em linha x o `flex` do vizinho; anterior a esta fatia) · o campo Fazenda da
    compra e da venda no cliente Teste mostra o UUID da fazenda.
  ⚠ NAO PROVADO NO NAVEGADOR: `AbaLiquidacaoOC` (o ramo legado nao abriu no Teste) e `CriarOCDoLegadoDialog` (nao ha' lancamento
    legado elegivel no Teste) — os dois so' por teste de fonte; salvar documento, despesa, venda com o boitel preenchido e abate
    (so' a COMPRA foi salva e conferida no banco; as outras duas OCs foram criadas vazias para chegar aos dialogos); o "+" da
    compra, da venda e do documento; setas do teclado; a janela REAL de 1.126; a aba em primeiro plano; somente leitura (OC
    fechada / cancelada) com o "+" apagado.
  ⚠ DIVIDAS: FORN-OC-RESUMO-INATIVO-01 (cartao e resumo dos shells vazios para fornecedor inativo: trocar a fonte do nome para o
    leitor) · a linha fixa da LIQUIDACAO e do BOITEL nao foi medida ligada · `fornecedores` segue como prop de `AbaCompromissosOC`,
    `DocumentoFormOC`, `CriarOCDoLegadoDialog` e dos shells so' para NOMES (sai quando os nomes vierem do leitor, 2d/2f).
- ⚠ O "+" DO SELETOR DE FORNECEDOR SO' EXISTE COM UM CADASTRO DE VERDADE ATRAS, E O EMITENTE NO CONTRATO NASCE COM O CREDOR
  (FORN-SELETOR-PADRAO-01 conserto 2a-fix1, Gabriel 08/10/2026, so' tela).
  · O dono (`FavorecidoSelect`) so' desenha o "+" quando o hospedeiro passa `onCriarNovo`; PROIBIDO passar handler vazio — preso
    por teste de fonte com auto-teste do detector (`favorecidoSelectDono.test.tsx`, varre todo `onCriarNovo={…}` de `src`).
    Nasce da recorrencia, que passava `() => { /* … */ }`: o botao aparecia e nao fazia nada.
  · RECORRENCIA (`RecorrenciaDialog`): o "+" abre o MESMO `NovoFornecedorDialog` do modal do lancamento e grava por
    `criarFornecedor` (que ja' avisa o leitor unico); o novo volta ESCOLHIDO, sem F5; se o dono devolve nulo, o cadastro continua
    aberto. ⚠ DIFERENCA DECLARADA do modal do lancamento: la' o cadastro exige fazenda escolhida (toast); aqui vai a fazenda da
    recorrencia se ja' houver, senao nula (a coluna aceita).
  · ANTES o emitente do documento NAO nascia com o credor no contrato (`DocumentosNaCriacao`, `DocumentosDoContrato`: nenhum
    passava `sugestao`). AGORA os dois passam `sugestao` so' com `emitenteId` = o credor do contrato e `origem: 'o contrato'`
    (campo novo, opcional, de `SugestaoDocumento`): o emitente do documento NOVO nasce com ele em ambar, editavel, e a faixa diz
    "Preenchido com o que o contrato diz (emitente) — confira. Mudar aqui não muda o contrato." Sem `origem` a frase e' a de
    sempre ("o lançamento"). Sem credor, nasce vazio. Documento ja' gravado nao recebe sugestao (regra de sempre).
    `DocumentosNaCriacao` voltou a receber `credorId` (o `ObrigacaoDialog` passa `form.credor_id`).
  PROVA NO NAVEGADOR (cliente Teste, 08/10, aba em SEGUNDO PLANO, 1.168 x 579, sintetico criado e APAGADO): recorrencia nova, "+" ->
  "Novo Fornecedor" -> salvo: o campo Favorecido mostrou o novo e a linha "sem CNPJ/CPF", sem recarregar; Nova obrigacao ›
  Parcelamento com esse credor › Documentos › Adicionar documento: Emitente em ambar com o credor e a faixa "o contrato". 7 mutacoes mortas.
  ⚠ NAO PROVADO NO NAVEGADOR: a edicao do contrato (`DocumentosDoContrato`, so' por teste da prop), trocar o emitente sugerido e
    gravar, o cadastro que falha, e a largura 1.126.
  ⚠ PARA A FATIA 2b (medido antes de trocar, 08/10): NENHUM dos oito pontos de OC tem lista restrita por tipo ou papel — todos
    oferecem os fornecedores ATIVOS do cliente. Diferencas: `useOperacaoLiquidacao` poe na LISTA tambem o em uso inativo (no dono
    ele fica no campo com a marca, fora da lista); so' o abate tira o "[META]" (no dono sai de todos, D7); o boitel e a venda nao
    tem documento na lista.
- ⚠ FORNECEDOR NO FINANCEIRO: OS CINCO PONTOS USAM O DONO PELO LEITOR UNICO (FORN-SELETOR-PADRAO-01 fatia 2a, Gabriel 08/10/2026, so' tela).
  Nenhum deles recebe mais a lista do hospedeiro; todos passam `clienteId` ao `FavorecidoSelect` (preso por teste de fonte, com
  auto-teste do leitor de usos).
  · RECORRENCIA (`RecorrenciaDialog`): leitor unico + linha fixa. O dialogo deixou de chamar `loadFornecedores`.
  · CONTRATO (`ContratoDialog`): o Popover proprio (so' nome, sem documento, teclado e busca proprios) SAIU; entrou o dono, com a
    linha fixa. O que escolher um fornecedor SUGERE (forma e dados de pagamento) e' o corpo de sempre, agora em `aoEscolherFornecedor`.
    A prop `fornecedores` do dialogo saiu (o `ContratosTab` nao a passa mais).
  · EMITENTE DO DOCUMENTO (`FormDocumento`, `AbaDocumentosLancamento.tsx`): o `SearchableSelect` SAIU; entrou o dono, com `limpavel`
    ("— nenhum —") e a ACAO FIXA do pe' da lista "Outro (informar nome e CNPJ/CPF)" — prop nova do dono, `acaoFinal {label,
    onSelect}`: fora da rolagem, nao e' fornecedor (nao muda `value` nem dispara `onSelected`), fecha a lista e chama o hospedeiro;
    com "Outro" escolhido o campo diz "Outro (informar nome e CNPJ/CPF)". O NOME do emitente gravado sai do leitor (ativos, ou o
    gravado por id). Vale nos QUATRO lugares de documentos, que passaram a receber `clienteId` no lugar de `fornecedores`:
    a aba Documentos do lancamento, `DocumentosPendentes`, `DocumentosNaCriacao` (a prop `credor` saiu) e `DocumentosDoContrato`.
    ⚠ MUDA DE COMPORTAMENTO, de proposito: (1) o emitente INATIVO ja' gravado aparece no campo com a marca "inativo" e NAO entra
      mais na lista (antes entrava, so' ele); (2) em `DocumentosNaCriacao` e `DocumentosDoContrato` o formulario oferecia SO' o
      credor do contrato (+ "Outro") e passa a oferecer todos os ativos do cliente; (3) a sugestao de emitente do lancamento deixa
      de ser conferida contra a lista (ela e' o favorecido que o lancamento ja' tem; inativo, aparece com a marca).
  · SEM CLASSIFICACAO (`SemClassificacaoModal`): CELULA DE TABELA — dono com `linhaDoDocumento={false}` (D8); o documento vai no
    `title` do campo e na opcao. Linha de 19px e modal 1090 x 491, iguais.
  · CRIAR PELA LINHA (`CriarLancamentoDaLinha`): monta o `LancamentoV2Dialog`; herdou o 1b e nada mais (nenhuma mudanca no arquivo).
  · A LINHA FIXA TEM 14px, COM O TEXTO ENCOSTADO EMBAIXO (`h-[14px] items-end`): ⚠ VISTO NA TELA — com 12px o anel de foco do campo
    (4px) cobria o topo do texto do documento. Vale tambem no modal do lancamento (remedido: nada mudou).
  MEDIDO (janela de 1.166 x 523 — ⚠ nao 1.126: a extensao abriu outra janela e ela nao redimensionou; cliente Teste, sinteticos
  criados por SQL e APAGADOS — 0 restantes), altura do modal COM a linha x SEM a linha (a linha escondida por script):
      ponto                                   modal        corpo que rola (conteudo de visivel), sem -> com a linha
      Novo lancamento                         1024 x 491   408 de 393 -> 408 de 393 (igual)
      Editar lancamento                       1024 x 491   438 de 392 -> 452 de 392 (ja' rolava)
      Recorrencia (nova)                      672 x 475    612 de 366 -> 624 de 366 (ja' rolava)  [medido com a linha de 12px]
      Contrato (novo)                         512 x 471    1.108 de 325 -> 1.122 de 325 (ja' rolava)
      Documento, pela aba do lancamento       512 x 491    566 de 395 -> 580 de 395 (ja' rolava)
      Documento, pelos pendentes (Novo)       512 x 491    566 de 395 -> 580 de 395 (ja' rolava)
      Documento, na criacao do parcelamento   512 x 491    514 de 395 -> 528 de 395 (ja' rolava)
      Documento, no contrato (edicao)         512 x 491    514 de 395 -> 528 de 395 (ja' rolava)
  ⚠ EM NENHUM PONTO A ALTURA DO MODAL MUDOU NEM ALGO PASSOU A ROLAR; em sete dos oito o corpo JA' ROLAVA nessa altura de janela e
    o conteudo cresceu 14px dentro da rolagem que ja' existia. A linha ficou LIGADA nos quatro formularios — DECIDIDO pelo Gabriel
    (08/10): crescer dentro de uma rolagem que ja' existia NAO e' motivo para desligar a linha; desliga-se so' quando a altura do
    modal muda ou algo PASSA a rolar (e em celula de tabela).
  PROVADO NO NAVEGADOR, em cada ponto: abrir a lista, buscar por nome e por digitos, escolher, conferir a linha (ou o `title`).
  E as provas que ficaram do 1b: SETAS E ENTER (baixo, baixo, cima, baixo, Enter -> a terceira opcao); CRIAR PELO "+" e ver SEM F5
  (o novo veio escolhido e no topo da lista); FALHA DO LEITOR (a leitura da lista derrubada por script: frase em vermelho na linha
  de 14px, o valor escolhido continuou no campo, modal 491; "Tentar de novo" com a rede de volta trouxe a lista); TROCAR DE
  CLIENTE SEM RECARREGAR (Teste -> NJ pelo seletor do menu, sem recarga: 100 opcoes, "Mostrando 100 de 2.593", zero cadastros do
  Teste; e de volta ao Teste). No contrato: o foco vai para a busca ao abrir, Esc fecha a lista e o modal fica, 512 x 471 com a
  lista aberta.
  ⚠ "100 de 2.593" x 2.594 ativos no NJ: a diferenca e' UM cadastro ativo com "[META]" no nome, fora da lista pela regra D7.
  ⚠ LEITORES ANTIGOS DEPOIS DESTA FATIA: nenhum ficou sem consumidor. `useFinanceiroV2.fornecedores` segue alimentando, nesses
    pontos, OUTRAS coisas: a lista de contratos (`ContratosTab`, o nome do fornecedor de cada contrato), o Sem classificacao (o
    nome na linha, o "catalogos prontos" e a lista entregue ao modal do lancamento) e o modal do lancamento (`fornecedorPorId`, a
    trilha de auditoria, o cadastro de fornecedor). So' o `RecorrenciaDialog` deixou de carrega'-la. `DocumentosDoContrato` segue
    lendo o credor por id para a conferencia da nota (nao e' lista de seletor).
  ⚠ FOTOS REGRAVADAS, de proposito: as 4 de `valorComConta.fotos.json` (a linha passou de 12 a 14px).
  ⚠ DIVIDAS: `RecorrenciaDialog` tem um "+" que nao abre nada (`onCriarNovo={() => {}}`, anterior a esta fatia; contraria "botao sem
    destino e' pior que botao ausente") · no contrato o nome longo corta no campo (inteiro no `title`) · o rotulo do campo do
    contrato e do documento e' o do hospedeiro (12px / 10px), nao o do dono.
  ⚠ NAO PROVADO NO NAVEGADOR: A ABA EM PRIMEIRO PLANO (a janela que a extensao abre fica em segundo plano e eu nao tenho como
    traze^-la a' frente: tudo foi medido por script, com tres capturas de tela para conferir) · a largura de 1.126 (foi 1.166; os
    modais tem largura fixa) · SALVAR em qualquer um dos pontos (nada foi gravado, salvo o fornecedor criado pelo "+") · a
    recorrencia remedida com a linha de 14px · Editar recorrencia / contrato com fornecedor INATIVO gravado (so' por teste do
    dono; no navegador foi visto no lancamento e no emitente do documento) · "— nenhum —" no emitente (so' por teste).
- ⚠ O SELETOR DE FORNECEDOR TEM UM DONO: `FavorecidoSelect` (FORN-SELETOR-PADRAO-01 passo 1b, Gabriel 08/10/2026, so' tela). Todo
  campo de fornecedor / favorecido / credor / comprador vai usar ESTE componente (`src/components/shared/FavorecidoSelect.tsx`); as
  regras puras moram em `src/lib/fornecedores/fornecedorTexto.ts` (normalizacao, formatacao, recorte). Ligado ao LEITOR UNICO, por
  enquanto, SO' no Novo/Editar lancamento (`LancamentoV2Dialog`); os outros 32 pontos migram no PASSO 2, fatia a fatia.
  · O CAMPO e' claro como sempre; a LISTA ABERTA e' o menu escuro padrao (UI-DROPDOWN-PADRAO-01), item de 20px a 9,5px.
  · A OPCAO, EM UMA LINHA: nome a' esquerda (o UNICO que corta; inteiro no `title`), selo "N iguais" quando N ativos tem o mesmo
    nome normalizado (sem acento, sem caixa, espacos duplos = um), e o CNPJ/CPF a' direita, em tom apagado (`MENU_SECUNDARIO`,
    nao menor), que NUNCA corta. Sem documento a area fica VAZIA. O sistema avisa; nao bloqueia nem escolhe.
  · DOCUMENTO: `formatarDocumento` — 14 digitos 00.000.000/0000-00, 11 digitos 000.000.000-00; outro tamanho aparece COMO ESTA'. A
    mascara tem um dono (`mascaraDoDocumento`); o `documentoFormatado` da nota fiscal delega a ela.
  · BUSCA, em memoria, sobre TODOS: pelo nome (`normalizarNome`) e, quando o digitado e' so' numero (com ou sem ponto, barra,
    traco), tambem pelos digitos do documento. Numero que esta' no nome tambem acha.
  · NO MAXIMO 100 OPCOES DESENHADAS (`LIMITE_DE_OPCOES`): o corte nunca muda o resultado da busca; o JA' ESCOLHIDO vem sempre no
    topo, mesmo fora dos 100; rodape FIXO, fora da rolagem, "Mostrando 100 de N — digite para refinar".
  · LINHA FIXA DE 14px SOB O CAMPO [eram 12 no 1b; a fatia 2a a levou a 14 com o texto encostado embaixo — ver a regra da 2a] (`linhaDoDocumento`): o documento do escolhido, "sem CNPJ/CPF", ou vazia sem escolha — existe
    sempre, para o formulario nao mudar de altura. Padrao: LIGADA no modo do leitor; ⚠ no modo de TRANSICAO (lista do hospedeiro)
    fica DESLIGADA ate' a fatia dele — nenhum formulario muda de altura sem ter sido medido. Em celula de tabela: `false`, e o
    documento vai no `title` do campo (nome · documento · inativo).
  · VALOR GRAVADO INATIVO: o campo mostra o nome com a marca "inativo" (ambar) e o documento; ele NAO esta' na lista.
  · "[META]" NO NOME: fora da lista (e da contagem do selo), salvo `incluirMeta` (modal de meta). A regra mora no dono.
  · DOIS MODOS NA TRANSICAO: SEM a prop `fornecedores` e com `clienteId`, a lista e' a do leitor unico; COM `fornecedores`, a do
    hospedeiro. O hook do leitor roda sempre (regra dos hooks) e, sem cliente, nao le'. `onSelected` recebe o objeto da lista em
    uso (no leitor, o `FornecedorLido`, com as colunas do `FornecedorV2`).
  · FALHA DO LEITOR: a frase em vermelho na linha fixa, com "Tentar de novo" (e dentro da lista aberta); o valor gravado continua
    visivel — o hook le' o gravado por id tambem quando a LISTA falhou. Lendo, com valor: o campo diz "Carregando…".
  · NO MODAL DO LANCAMENTO: quem responde "quem e' este id?" e' `fornecedorPorId` (a lista do hospedeiro e, na falta, a do
    leitor): o resumo, os dados de pagamento e a validacao do Salvar leem dele — fornecedor criado em outra tela depois de o
    hospedeiro carregar nao vira "Favorecido inválido". O `showCpfCnpj` saiu dali (o documento esta' na linha fixa).
  · CUSTO NO NJ (Novo lancamento, medido de forma sincrona; antes -> depois): primeira tecla 168 -> 26 ms; limpar a busca 159 ->
    21 ms; opcoes na pagina 2.594 -> 100. A busca devolve os mesmos conjuntos ("ag" 201, "agr" 93, "agro" 62).
  PROVA NO NAVEGADOR (1.126 x 523; cliente Teste com 8 fornecedores e 1 lancamento SINTETICOS, criados por SQL e APAGADOS; NJ so'
  leitura): modal 1024 x 491 antes e depois; o corpo do modal ja' rolava 15px a 523 (408 de 393) e continua igual COM e SEM a
  linha (o campo vizinho, Produto, ja' tinha 68px) — nada passou a rolar; lista de 448px com "3 iguais" nos tres repetidos
  (um com acento e espaco duplo), documentos formatados, "1234567" como esta', o de meta e o inativo fora, o nome longo cortando
  e o documento inteiro; buscas "repetido" (3), "UNICO comercio" (1), "11222333", "11.222.333/0001" e "123.456.789-09" (1 cada);
  escolher o repetido -> campo com o nome, linha "123.456.789-09", e ele no topo ao reabrir; escolher o sem documento -> "sem
  CNPJ/CPF"; lancamento com fornecedor inativo -> "SINT FORN Inativo" + marca "inativo" + linha "55.444.333/0001-22", pelo leitor
  de verdade (gravado por id); no NJ, 100 opcoes e "Mostrando 100 de 2.593 — digite para refinar" (a paginacao real passou de 1.000).
  ⚠ O QUE MUDA NOS OUTROS 9 HOSPEDEIROS DO `FavorecidoSelect` JA' NESTE PASSO (a lista aberta e' do componente): a opcao em
    nome | selo | documento (o documento so' aparece onde a lista do hospedeiro o traz), o limite de 100 com o rodape, a busca
    por digitos, o "[META]" fora, a marca "inativo" e o `title` do campo. Fechado, o HTML deles e' o de antes (fotos identicas);
    a linha fixa NAO entrou neles.
  ⚠ FOTOS REGRAVADAS, de proposito: as 4 de `valorComConta.fotos.json` (o modal do lancamento ganhou a linha fixa e o `title`).
  ⚠ TESTE QUE MONTA TELA COM O SELETOR NO MODO DO LEITOR usa o leitor de mentira: `vi.mock('@/hooks/useFornecedoresDoCliente',
    async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake())` + `definirFornecedoresDoLeitor(lista)`.
  ⚠ DIVIDAS: os demais testes que montam o `LancamentoV2Dialog` sem o leitor de mentira seguem passando com a lista do leitor
    VAZIA (nao conferem o nome do fornecedor) · no modo de transicao a lista vem do hospedeiro sem documento em varios pontos (o
    documento aparece quando a fatia migrar) · o item do menu segue a 9,5px (a regra vigente; o briefing original dizia 10).
  ⚠ NAO PROVADO NO NAVEGADOR: TROCAR DE CLIENTE SEM RECARREGAR (a troca foi feita com recarga, que zera o cache: o "nao vaza"
    esta' provado por teste do leitor e do hook) · a falha do leitor com "Tentar de novo" · criar fornecedor pelo "+" e ve^-lo na
    lista sem F5 (o aviso esta' provado por teste) · o teclado (setas, Enter) na lista de 100 · a janela em primeiro plano (a aba
    estava oculta; as medidas sao de layout por script) · o tempo de ABRIR isolado (medidos: primeira tecla e limpar).
- ⚠ FORNECEDOR TEM UM LEITOR SO', POR CLIENTE (FORN-SELETOR-PADRAO-01 passo 1a, Gabriel 08/10/2026, so' tela, sem banco). Lista de
  seletor de fornecedor / favorecido / credor / comprador sai de `useFornecedoresDoCliente(cliente, gravadoId)`
  (`src/hooks/useFornecedoresDoCliente.ts`), em cima do leitor puro `src/lib/fornecedores/leitorDeFornecedores.ts`. PROIBIDO
  seletor novo consultar `financeiro_fornecedores` por conta propria.
  · O QUE ELE TRAZ: SO' ATIVOS, com `cpf_cnpj` (e as colunas de pagamento que o `FornecedorV2` ja' tinha), paginado ATE' O FIM
    (1.000 por pagina, a primeira com o total e as demais em paralelo; sem o total, em serie ate' a pagina curta — nunca corta em
    1.000), ordem estavel (nome, id). `ativo` nulo no banco conta como ativo.
  · O GRAVADO QUE NAO ESTA' ENTRE OS ATIVOS vem POR ID (`gravado`, com o `ativo` real e o cliente no filtro): o campo o mostra
    marcado "inativo" em vez de esvaziar registro antigo.
  · CACHE POR CLIENTE, SEM VAZAR: cada cliente tem a sua entrada; o hook so' devolve o que e' do cliente pedido NAQUELE render
    (na troca, a lista do anterior some no mesmo render; resposta atrasada de outro cliente e' descartada). Leituras simultaneas
    do mesmo cliente sao UMA ida. Falha nao fica em cache.
  · RELE SEM F5: quem grava no cadastro chama `notificarFornecedoresMudaram(cliente)` DEPOIS de gravar, so' no sucesso; o cache
    daquele cliente esquece (a lista e os lidos por id), quem ouve rele, e a lista antiga fica na tela ate' a nova chegar.
    Resposta de leitura que chega depois de um aviso (geracao velha) nao entra no cache. Avisam hoje (preso por teste de fonte,
    com a contagem por arquivo): `FornecedorFormDialog` (salvar, reativar, mesclar, inativar, excluir), `CredorAutocomplete`
    (criar, reativar), `AbaDocumentosOC` (criar emitente, gravar documento), `AbaCompromissosOC` (criar), `nfeConsultas`
    (`gravarDocumentoNoCadastro`), `FinV2FornecedoresTab` (criar da pendencia), `useFinanceiroV2.criarFornecedor` e os quatro
    "criar fornecedor" do `LancamentosTab`. Escritor novo de nome, documento ou `ativo` avisa no mesmo PR.
  · FALHA: o hook devolve `erro` ("Não foi possível carregar os fornecedores. (motivo)") e `tentarDeNovo`; o campo escreve ao lado.
  ⚠ SO' O NOVO/EDITAR LANCAMENTO USA O LEITOR (desde o passo 1b; os sete leitores antigos migram no PASSO 2, fatia a
    fatia): `useFinanceiroV2`, `useOperacaoLiquidacao`, `LancamentosTab`, `FornecedorSelect`, `CredorAutocomplete`,
    `useFinanciamentoCadastro` / `DestinacoesForm` e `MesaPareamentoModal`.
  ⚠ DIVIDAS: FORN-LEITOR-ESCRITORES-MUDOS-01 — gravam no cadastro e NAO avisam: `useFinanceiro.ts` ~:1127 (o importador legado
    cria fornecedor dentro do laco) e `CusteioTxtImportTab.tsx` ~:483 (so' apelido, que o leitor nao le') · as colunas de
    pagamento vem para TODOS os ativos (NJ: 2.594 linhas x 15 colunas), como o `useFinanceiroV2` ja' fazia · o leitor nao foi
    exercitado no navegador neste passo (nenhuma tela o chama): a consulta real, a paginacao no NJ e a releitura pelo aviso
    ficam para a prova do 1b.
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
- ⚠ O ENCONTRO DE CONTAS DO RATEIO ADMINISTRATIVO E' DO BANCO (DRE-RATEIO-MODAL-01, Gabriel 06/10/2026; migration
  20261027193700, ⚠ registrada como 20261006142707; ledger = arquivo, md5 5379cda3…; patch guardado por md5:
  `fn_painel_rateio_detalhe` 7472a393… -> 83bdfd55…, 3 ancoras). No ramo 'admin' o retorno ganha NO FIM, da MESMA leitura de
  `fn_rateio_admin_mes`: `resumo {bruto, partes [{destino pecuaria|agricultura|silvicultura|nao_alocado, valor, pct}], soma,
  diferenca, agricultura_por_safra}`, `por_mes [{ano_mes, bruto, pecuaria, agricultura, silvicultura, nao_alocado, pct_pecuaria,
  pct_agricultura, diferenca (+ agricultura_safra na lavoura com safra)}]` (um por mes do periodo, inclusive os vazios) e
  `por_mes_total`. Fora do 'admin' as tres vem nulas; nenhuma chave de antes mudou (156 saidas, 7 clientes, 117 com valor).
  · ARREDONDAMENTO — REGRA DO fix1 (migration 20261027193800, ⚠ registrada como 20261006150404; ledger = arquivo, md5 ed3f0f4d…;
    `fn_painel_rateio_detalhe` 83bdfd55… -> 983ac728…, patch guardado por md5, 1 ancora; SUBSTITUI a "parte protegida + residuo
    na maior das outras" da 193700): CADA PARCELA E' O ARREDONDAMENTO DELA — round(cru, 2) no resumo, na safra e em cada mes;
    NENHUM residuo e' redistribuido. `soma` = as parcelas JA' arredondadas; `arredondamento` (chave nova, no resumo, em cada mes
    e no total) = round(bruto, 2) − soma; `diferenca` = bruto − soma das parcelas do CRU, arredondada (a prova: e' ela que e' 0).
    `por_mes_total` = round do TOTAL CRU de cada coluna (NAO a soma das linhas) e `resumo` = `por_mes_total`. `pct` do cru, 1 casa,
    inclusive em `agricultura_por_safra`.
    ⚠ O DEFEITO DA 193700 (Gabriel: "nunca arredondar para fazer bater; o numero de uma atividade e' o MESMO em qualquer tela"):
      NJ safra 24/25 pela porta da lavoura dava pecuaria 860.293,07 e silvicultura 61.449,53 (certo: ,09 e ,51), e 2025 pela da
      pecuaria dava agricultura 316.633,58 (certo: ,59). Dois mecanismos somados: parcela arredondada MES A MES e depois somada,
      e o residuo de cada mes jogado na maior das outras parcelas.
    INVARIANTES PRESOS NO TESTE (T7, 58 periodos, 7 clientes): partes e bruto pela porta da pecuaria = pela da agricultura = pela
    da safra; pecuaria do resumo = round(`rateio_adm.pool` de `fn_dre_pecuaria`, 2); silvicultura = `rateio_adm.nao_alocado.
    silvicultura`; `diferenca` = 0; |arredondamento| <= 0,04. Chaves de antes da 193700 identicas em 156 saidas; tempo NJ 100 -> 99 ms.
    `arredondamento` ≠ 0 so' no NJ: 2025 e 2026 (−0,01) e safra 23/24 (+0,01) — 8 saidas contando as tres portas e as duas safras
    do mesmo periodo; maior 0,01. NJ 2025: 886.574,04 + 316.633,59 + 63.326,72 = 1.266.534,35 contra o bruto 1.266.534,34.
  ⚠ DIVIDA DRE-RATEIO-TOTAL-CENTAVO-01 — PROXIMO PR DE BANCO: `total.rateio_adm` de `fn_dre_pecuaria` (o numero da GRADE) e' a
    soma das celulas grupo × fazenda ja' arredondadas e fica 0,01 fora de round(pool) em NJ 2020 (818.377,18 × ,19), NJ 2023
    (844.162,50 × ,49), NJ jul/25–jun/26 (1.069.947,31 × ,32) e Vera 2024 (121.578,37 × ,38). Conserto: o total da grade passa a
    ser round(pool), com o residuo das celulas a' vista; muda o numero do DRE nesses periodos — prova antes × depois em todos os
    cliente-anos. Ate' la' a tela AVISA (regra da tela, abaixo).
  · ⚠ `agricultura_por_safra` TEM DUAS LINHAS (a safra pedida e "outras safras"): `fn_rateio_admin_mes` abre UMA safra por chamada.
  · ⚠ O "NAO ALOCADO" DA SANTA RITA 2021 (8.082,73) E' SILVICULTURA, parte propria; `peso_nao_alocado` > 0 nao existe em nenhum
    cliente/ano de 2016 a 2027 — "mes sem atividade" nao tem caso real, so' o teste.
  Provas: resumo x `fn_dre_pecuaria.rateio_adm` iguais em 49 de 49 cliente-anos; NJ 2025 pecuaria 1.266.534,34 = 886.574,04 +
  316.633,59 + 63.326,72 + 0,00 (arredondamento −0,01), diferenca 0. Teste: `supabase/tests/dre_rateio_modal_01_test.sql`
  (T1–T7, termina em RAISE OK; roda em ~25 s).
- ⚠ A ABA RATEIO DO ADMINISTRATIVO MOSTRA O TOTAL, PARA ONDE FOI E A PROVA — E NAO FAZ CONTA (DRE-RATEIO-MODAL-01, tela, Gabriel
  06/10/2026: "tem que ter um encontro de contas ali que prova que esta' sendo feito corretamente"). Leitor puro
  `src/lib/agri/encontroRateio.ts` (`lerEncontroRateio`: qualquer peca torta = `null` inteiro, nunca zeros); componente
  `src/components/agri/RateioEncontro.tsx`; o modal (`ModalValorDre`, `RateioDetalheModal.tsx`) recebe `valor.encontro`. Nenhuma
  soma, subtracao ou `reduce` no leitor nem no componente (teste de fonte com auto-teste do detector).
  · "Resumo | Mês a mês" (`Segmentado` 22) mora NA BARRA, por cima do segundo segmentado que fica `invisible` na aba Rateio
    (posicao absoluta: nada se move). So' no administrativo.
  · RESUMO: (1) "Administrativo do período" — `Donut` de 130 com o `resumo.bruto` no centro e a legenda com o % do banco; pecuaria
    navy, agricultura verde, silvicultura e nao alocado cinza; a atividade aberta em negrito. (2) "Para onde foi o administrativo"
    — Destino · Regra · % do total · Valor: bruto, uma linha por parte (a aberta com `bg-primary/10`, filete de 3px e o selo "este
    DRE"), "Não alocado" SO' com valor, "Soma das partes" (`resumo.soma`), "Arredondamento" (`resumo.arredondamento`, linha
    SEMPRE presente: "0,00" apagado, ou o valor com sinal em ambar; `title` "soma das parcelas arredondadas a centavos × total")
    e "Diferença para o total" (`resumo.diferenca`: "0,00 ✓" verde, senao o valor com sinal em vermelho). Sob a tabela, um SLOT
    FIXO de 14px (`rateio-aviso-grade`): quando o numero da GRADE (`dre.total.rateio_adm`, que o modal ja' recebe; na lavoura o
    `pool`) difere da parcela destacada, escreve em ambar "grade do DRE: R$ X · resumo: R$ Y" — os dois numeros prontos, lado a
    lado; a tela so' COMPARA, nao subtrai (a RPC nao tem o numero da grade sem chamar `fn_dre_pecuaria`, entao nao ha'
    `grade_total` no banco). Vazio quando iguais, com grupo de custo ou sem o DRE do periodo. (3) "Dentro da pecuária · por fazenda" (o `rateio_adm` e a `cab_media` do DRE que
    a tela ja' tem; sem ele, "sem a divisão por fazenda neste recorte") ou "Dentro da lavoura · por cultura" (as `fatias`).
    Valor de custo com ▼ vermelho; estorno ▲ verde com "−"; zero "0,00" apagado (`ValorRateio`, cores de `COR_SINAL`).
  · MES A MES: Mês · Administrativo · Pec. % · Pecuária · Lav. % · Lavoura · [Esta safra] · Silvicultura · Não alocado · Diferença;
    Total = `por_mes_total` (o arredondamento dele, quando ≠ 0, vai no `title` da linha); cabecalho e total fixos; as colunas da atividade aberta realcadas; slot fixo de 14px com "a parte muda
    quando uma atividade começa ou termina no período" so' quando o % do banco muda entre meses.
  · ⚠ DESVIOS DO BRIEFING, DECLARADOS: (a) NA LAVOURA O SELO "este DRE" VAI NA SAFRA (o numero do DRE e' o dela), e a agricultura
    fica so' realcada; (b) SILVICULTURA E NAO ALOCADO SAO DUAS COLUNAS no mes a mes (uma so' exigiria somar na tela); (c) [fix1: o % de cada safra,
    "outras safras" inclusive, vem do banco]; (d) COM GRUPO DE CUSTO (Mão de Obra, Máquinas…) os blocos (1) e (2) sao o
    administrativo INTEIRO (a RPC nao abre o resumo por grupo) e dizem isso no cabecalho, em ambar: "administrativo inteiro ·
    todos os grupos" (`title` com o porque); o (3) mostra o rateio DAQUELE grupo por fazenda (`rateio_adm_grupos`), com o nome
    do grupo no titulo; (e) O RATEIO COMPARTILHADO DA LAVOURA (pool por area, fora do
    admin) SEGUE COM A TABELA DE ETAPAS — a RPC so' devolve o encontro no ramo admin.
  · SAIU: `etapaNaoAlocado`, `DICA_PARTE`, `EtapaValorDre.dica` e as etapas do administrativo (pecuaria inteira; lavoura admin).
  · ⚠ A CELULA DE TABELA TEM 1px DE PADDING VERTICAL DO NAVEGADOR: sem `py-0` a linha "de 18px" media 22 (medido).
  · A TABELA DE BAIXO TEM PISO DE DUAS LINHAS (`min-h-[92px]`) e rola POR DENTRO com cabecalho e total fixos; so' em janela
    baixa o piso estoura e o corpo do modal rola.
  Medido em 06/10 a 1.126 x 523 (a janela do dia, com a barra do navegador de automacao; NAO a 579): modal 980 x 459 igual em
  Lançamentos, Resumo e Mês a mês; barra 38; topo do rodape 426; bloco de cima 178px (196 na lavoura, com a linha da safra),
  o slot do aviso 642 x 14 sem corte; 0 celulas cortadas; a 523 o corpo rola 22px (40 na lavoura) e os 12 meses rolam 19px por
  dentro — a 579 sobram 56px e nada disso rola com ate' 3 fazendas (por conta, nao medido); com 6 fazendas a tabela rola por
  dentro. Com grupo: a marca cabe inteira na caixa da direita (474px) e CORTA na da esquerda (pede 183, tem 149; inteira no
  `title`), numa linha de 18px.
  Numeros na tela = banco (NJ, so' leitura): pecuaria 2025 1.266.534,34 -> 886.574,04 · 316.633,59 · 63.326,72, soma
  1.266.534,35, arredondamento −0,01, diferenca 0,00 ✓, fazendas 672.469,89 + 214.104,15; lavoura 24/25 1.228.990,13 ->
  860.293,09 · 307.247,53 · 61.449,51, arredondamento 0,00, culturas 242.495,41 + 64.752,12; pecuaria 2023 com o aviso "grade
  do DRE: R$ 844.162,50 · resumo: R$ 844.162,49"; Mão de Obra 2023 (grupo) 164.696,77 · 10.238,09 · 62.281,72 = 237.216,58.
  Fixture real: `src/components/agri/rateioEncontro.fixture.json` (recapturado depois do fix1, com NJ 2023). 21 mutacoes mortas.
  ⚠ NAO PROVADO NO NAVEGADOR: 579px de altura, 6 fazendas, Santa Rita 2021, "Não alocado" com valor, "outras safras", diferenca
    aberta, arredondamento ≠ 0 na lavoura e a frase da parte que muda (so' por teste; nenhum cliente tem `peso_nao_alocado` > 0).
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
- ⚠ REPLACE DE VIEW LEVA `WITH (security_invoker = true)` e se confere em `pg_class.reloptions`.
- ⚠ CHECKLIST DE MIGRATION QUE CRIA FUNCAO (SEG-TENANT-VARREDURA-01C, 04/10): FUNCAO NOVA NASCE FECHADA — so' `postgres` e
  `service_role`. TODA MIGRATION QUE CRIA FUNCAO CHAMADA PELA TELA LEVA `GRANT EXECUTE ON FUNCTION … TO authenticated` (e
  `service_role` quando couber) NA PROPRIA MIGRATION; SEM ISSO A TELA RECEBE "permission denied for function". Nunca conceder a
  `anon` nem a PUBLIC. `DROP + CREATE` (mudanca de retorno) PERDE a ACL: re-conceder. Conferir `proacl` depois e rodar
  `supabase/tests/seg_tenant_varredura_01c_test.sql`. Interna (`_fn_…`) fica como nasce.
- ⚠ FUNCAO PL/pgSQL CHAMADA A CADA CARREGAMENTO DE TELA COM PARAMETRO DE CONTA LEVA `SET plan_cache_mode =
  force_custom_plan` (PR-CONC-CAIXA-PONTAS-PLANO-HOTFIX, 03/10). Depois de 5 execucoes na mesma sessao o PL/pgSQL troca para o
  plano GENERICO, que nao ve' o parametro: `fn_caixa_sistema_pontas` estimava 2 linhas onde havia 19.645 (NJ Banco do Brasil) e
  ia de 81 ms a 9.531 ms da 6a chamada em diante — e o PostgREST REUSA conexoes (teto 8 s do `authenticated`). Medir sempre 20
  chamadas na MESMA sessao; `LANGUAGE sql` nao tem esse cache. O canal HTTP de consulta corta em ~100 s: medicao longa vai em lotes.
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
- ⚠ SAFRA GRAVADA ABRE E SALVA COMO ESTA'; A SUGESTAO PELA DATA SO' PREENCHE CAMPO VAZIO (PR-FIN-SAFRA-MODAL-01, Gabriel
  03/10; migration 20261027191300, ⚠ registrada como 20261003135207; ledger = arquivo, md5 86c00210…). O efeito de sugestao de
  `ClassificacaoLancamento` (`safraSugerida`) GUARDA DENTRO DO UPDATER, lendo o `safra_id` VIVO: o bloco montado pelo RESET do
  `LancamentoV2Dialog` rodava com a foto do reset e o updater dele chegava depois da hidratacao, apagando a safra gravada (o
  bloco novo montava vazio e sugeria pela data). Guarda de closure em efeito cujo updater vale sobre o estado do PAI nao
  protege nada — a lei do PAR-01a-ii-fix1 vale para a guarda tambem. Trocar a CULTURA nao mexe na safra; trocar a ATIVIDADE
  continua limpando a safra de outro escopo (PR-FIN-SAFRA-ESCOPO-01). Prova: `safraGravadaModal.test.tsx` (T1–T4), mutacao
  (guarda fora do updater) derruba 4 de 6. Dado: 27 lancamentos de mandioca do NJ voltaram a 25/26-Lav (22 pela carga, 5 pelo
  audit_log), estado anterior em `fin_safra_modal_01_backfill` com o gesto contrario por linha; T5/T6 em
  `supabase/tests/fin_safra_modal_01_test.sql`.
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
- ⚠ A IMPORTACAO TEM DONO NO BANCO (PR-CONC-ENRIQ-IMPORT-ATOMICA-01, 03/10, migration 20261027191400, ⚠ registrada como
  20261003141854; ledger = arquivo, md5 a465e396…): `classificacao_sessoes` (id = o uuid que a tela gera, cliente, criado_em/por,
  arquivo, linhas_esperadas, status importando|completa|incompleta, concluida_em; RLS `tenant_ok` so' leitura, escrita so' pelas
  funcoes). A tela ABRE antes do primeiro lote (`fn_classificacao_sessao_abrir`, idempotente; outro numero de linhas recusa: "escolha
  o mesmo arquivo") e CONCLUI depois do ultimo (`fn_classificacao_sessao_concluir`: 'completa' so' com linhas do staging = esperadas;
  senao "N de M"). Linhas recebidas sao CONTADAS, nunca guardadas. A LEITURA e' `vw_classificacao_sessoes` (security_invoker), que
  aplica a regra dos 10 minutos ('importando' parada vira 'incompleta'). Lote que falha NAO gera sessao nova: a falha guarda o id e
  as linhas, e o "Tentar de novo" (escrito ao lado do controle, "linha 401 de 470 · …") reenvia a partir do lote que falhou
  (`ErroLotePopulate.inicio`); retomar uma incompleta reenvia so' as linhas que faltam. O populate (93e3eb6c) NAO mudou: reenviar um
  lote ja' entrado deixa o staging identico, editada/bloco/gravada inclusive (prova S3 em `conc_enriq_import_atomica_01_test.sql`).
  ⚠ O RANKING TEM UM DONO SO' (`enriquecimentoView.ts`): `sessaoCompleta`, `toSessoesVM` (Imp NN conta SO' completa — a incompleta e'
    "incompleta · 400 de 470"; excluir uma nao renumera), `maisRecenteDoMes` (o "(mais recente)"), `sessaoMaisRecenteCompleta`
    (abre por padrao: `escolherMelhorSessaoId` e a regua do `EnriquecerTresPassos`). A incompleta nunca e' a mais recente nem abre;
    aberta pelo seletor, a Mesa nao trabalha nela (painel sem contas, Recasar e Mesa apagados) e o slot oferece retomar/excluir.
  ⚠ EXCLUIR (`fn_classificacao_excluir_sessao`, md5 5df4b007…): o 'ja_aplicado' HERDADO (aplicado = false) nao impede; impedem a
    GRAVACAO feita na sessao (aplicado = true) e o BLOCO conferido dela, com o motivo escrito no slot ("3 blocos e 1 gravação feitos
    nesta importação — …"), nunca em toast; os casamentos manuais nao impedem, mas a confirmacao os conta ("N casamentos manuais
    feitos nesta importação serão perdidos"). A sessao sai da tabela junto.
- ⚠ ACABAMENTOS DO ENRIQUECER (PR-CONC-ENRIQ-ACABAMENTOS-01, so' tela): (D1) IMPORTACAO ANTIGA = a aberta nao e' a mais
  recente do mes (`sessaoMaisNovaQueAberta`, a peneira do seletor); o painel diz "importacao antiga · a mais recente e' Imp NN ·
  DD/MM HH:MM · ir para a mais recente" (`textoImportacaoAntiga`) ANTES do "sem conta", e o Extrato da planilha e a Mesa levam so'
  o selo `SeloImportacaoAntiga` (`EnriquecimentoMesaModal.tsx`), a frase no `title`; aviso, nunca trava. (D2) "So' nao
  enriquecidos" (`soNaoEnriquecidos`) tira tambem o bloco conferido VIVO (`blocoId`, as duas pontas); so' as linhas — fecho do
  dia, totais e contador sao do extrato inteiro. (D3) linha com par fora do lado Sistema: `parForaDaVista`
  (`extratoDaPlanilha.ts`) escreve em cinza "par cancelado" / "par em DD/MM/AAAA · fora do mes" / "· outra conta: X" (conta
  pela direcao), so' com o que a view traz do par; par no mes e na conta que o Espelho nao traz (nao realizado) fica em branco.
  (D4) Identificacao: Descricao antes do Fornecedor (so' a ORDEM).
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
- ⚠ DESMEMBRAMENTO TEM REGISTRO E CAMINHO DE VOLTA, NO MOLDE DO BLOCO (PR-CONC-ENRIQ-SPLIT-REVERTER, 02/10, migration
  20261027191100, ⚠ registrada como 20261002205050; ledger = arquivo, md5 0e2a728d…): `classificacao_splits` /
  `classificacao_split_itens` (RLS `tenant_ok` so' leitura, escrita so' pelas funcoes) guardam consolidado, extrato, grupo, o
  VINCULO ORIGINAL do consolidado (id, `tipo_aprovacao`, valor) e, por linha, o filho, o vinculo dele e o status/par de ANTES.
  `fn_classificacao_split_substituir` grava o registro na mesma transacao (retorno ganha `split_id`; md5 f964b0dd -> 33f4da7b).
  `fn_classificacao_desfazer_split(p_staging_id, p_motivo, p_simular)` (QUALQUER linha desfaz o split inteiro): cancela os filhos
  pelo dono (`fn_cancelar_lancamento_auditoria`), DESCANCELA o consolidado (⚠ DESCANCELAR NAO TEM DONO GERAL — a funcao do gesto
  faz o UPDATE), religa pelo dono (`fn_vincular_extrato_lancamento`) e CARIMBA o `tipo_aprovacao` original no id devolvido (o
  padrao do `fn_extrato_conciliar_mes`: `ofx_cru` decide o `fn_extrato_desfazer_arquivo` e a marca "cru"), devolve as linhas ao
  status/par de antes (nao aplicadas, proposta intacta) e marca o registro desfeito (nao apaga). Recusas com frase: sem registro,
  ja' desfeito, motivo vazio, consolidado vivo, extrato cancelado/ignorado, linha fora do split, filho re-desmembrado / cancelado /
  em outro extrato / em OUTRO grupo (o do proprio split nao conta) / em bloco conferido / GRAVADO NUMA LINHA APLICADA DE OUTRA
  IMPORTACAO ("reverta la' antes"), mes fechado. Os gatilhos de lancamento na ida e na volta foram conferidos: nenhum assimetrico
  (o duplicado de importacao so' age com `lote_importacao_id`, nulo nos consolidados). A view expoe no fim `split_id` (registro
  vivo) e `split_desfeito` (md5 b041b03e -> 82f6fe33; custo {928,894,899} -> {942,935,928} ms em 551 linhas, as 116 colunas
  antigas identicas por md5). Backfill de METADADO dos 15 splits antigos inteiros (40 itens) pelo "consol=" da observacao (12 dos
  15 sem `grupo_id`); md5 de lancamentos, vinculos e staging igual antes x depois. NA MESA (D8): split com registro -> Reverter
  habilitado; o clique SIMULA e a barra ocupa o slot da mensagem do rodape ("desfaz: N linhas voltam · R$ X vira um so'" +
  "· K editados" ambar + Confirmar/cancelar; frases completas no `title`), depois "motivo:" + campo obrigatorio; recusa em
  vermelho; sem toast. Medido a 1135: slot 454px, pior caso (5 linhas, R$ 2.667.572,77, 5 editados) pede 449; o passo do motivo
  378; rodape 32 com topo 513,8 em todos os passos. md5: desfazer_split a4ff7cf6…
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
  registrada se acrescenta por `agri_carga_mandioca_completar`, que herda conta e fazenda da VENDA da carga; a SAFRA e' a
  da CARGA (a da area, `agri_safra_area`), nunca a da venda (PR-FIN-SAFRA-MODAL-01: copiar a da venda propagou a 26/27-Lav
  errada da NF 9320690 a 3 papeis novos). O estado anterior do backfill das 14 NFs mora em `mandioca_icms_repasse_01_backfill` (gesto contrario linha a linha).
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
- ⚠ A DATA DO BANCO MANDA NA CONFERENCIA (PR-CONC-CONFERENCIA-FECHAMENTO-DIA, Gabriel 03/10; so' tela). Dono:
  `montarMesa` em `src/lib/conciliacao/mesaDoDia.ts` (lib pura, movida verbatim do `EspelhoConciliacaoTab`, que reexporta).
  R1 todo extrato fica no dia em que caiu, e NENHUM e' consumido: os vinculos dele sao as filhas, inclusive os do bloco N×N.
  R2 o lancamento casado aparece sob o extrato com a SUA data; pago por varios extratos, "parte de X · resto em DD/MM". R3 o
  fechamento soma o que esta' desenhado no dia (os APLICADOS, com o sinal do lancamento). R4 data do lancamento ≠ a do banco e'
  aviso ambar "lancado em DD/MM", nunca diferenca. R5 diferenca so' de verdade: extrato sem par, lancamento sem par, extrato com
  aplicado ≠ valor, SOBRE-aplicado (motivo "aplicado acima do lancamento") e SUB-aplicado (o resto do realizado vira linha
  "!" no dia do LANCAMENTO, motivo "aplicado abaixo do lancamento"). O N:1 do PR-ESPELHO-05 (mae = lancamento, filhas =
  extratos, "a mae troca de lado") SO' VALE para bloco de um dia so' e puro (nenhum extrato dele explica outro lancamento).
  ⚠ O VINCULO CONTA PARA A CONTA DO EXTRATO: "tem vinculo" e' ter vinculo com extrato DESTA conta; o lancamento vinculado so'
  ao extrato de outra (meia transferencia) e' "lancamento sem par" aqui. A transferencia com as duas pontas casadas segue
  casada nas duas.
  ⚠ O SISTEMA DO DIA = `sistema_caixa` (CONC-CAIXA-PONTA-01) − internas − sobre/sub-aplicados (o caixa trata esses "como
  hoje"; os conjuntos sao `lancamentosSobreAplicados`/`lancamentosSubAplicados`, os mesmos da lib). Provado nos 70
  conta-meses do proto que tem extrato: 0 divergencias; 29 dias mudaram (N×N/N:1 que cruza dias, meia transferencia,
  sobre/sub-aplicacao), nenhum para "diferenca" sem motivo. A Evolucao (`montarEvolucao`) usa a mesma mesa.
  ⚠ OS AVISOS VAO ANTES DA DESCRICAO e seguem a ESCADA DE ABREVIACAO `textosDosAvisos` (`LIMITE_AVISOS` 58 caracteres =
  ~283px dos 286 uteis; medido: o pior caso real, 57, pede 278px), frase inteira no `title`. O Extrato da planilha usa a
  ancora antiga (`ancoraN1: 'lancamento'`), saida identica a' de antes (o oraculo `mesaDoDiaAntes.fixture.ts`).
- ⚠ O RESUMO DA CONTA NO MES TEM DONO NO BANCO (PR-CONC-SALDO-UMA-REGUA-01, 03/10, migration 20261027191600, ⚠ registrada como
  20261003155248; ledger = arquivo, md5 74ba0e0b…): `fn_conciliacao_resumo_mes(p_cliente_id, p_ano_mes 'YYYY-MM', p_conta_ids
  uuid[] DEFAULT NULL = todas as contas do cliente)`, uma linha por conta: `conta_id, conta_nome, consolida_em_conta_id,
  tem_extrato, saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, saldo_extrato_data, diferenca, banco {entradas,
  saidas, extrato_nao_fecha}, extratos_sem_par {qtde, valor}, lancamentos_sem_par {qtde, valor}, retido_em_depositos {qtde,
  valor}, dias_com_diferenca [{data, banco, sistema, diferenca, motivos[]}], status ('conciliado'|'nao_conciliado'|'pendente'),
  motivos [{motivo, ...}], legado {saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca, status}`.
  REGUA DO CAIXA: o dia e' o da Conferencia — espelho DECLARADO de `montarMesa` em `_fn_conciliacao_dias_conta` (so'
  service_role), provado igual em 69 conta-meses / 910 dias (0 divergencias) e preso pelo vitest `src/lib/conciliacao/
  resumoMes.test.ts` (fixture do mesmo snapshot). Saldos INFORMADOS, CONSOLIDADOS com as internas (`consolida_em_conta_id`,
  faltou um = NULO). Lado da ponta: a ligada a extrato entra do LADO DO EXTRATO (retencao em deposito liquido = entrada
  negativa, contada em `retido_em_depositos`); o liquido nao muda (entradas e saidas arredondadas cada uma podem somar 0,01 a
  menos/mais que o liquido com valores de 3 casas — o cru fecha). [REVOGADO no PR-CONC-STATUS-SALDO-01a: o status e' so' o SALDO; (i) e (iii) viraram AVISOS — ver a regra "VERDE =
  SALDO BATE".] STATUS = 'conciliado' so' com (i) zero dias com diferenca,
  (ii) saldo do sistema = informado e (iii) informado − inicial − Σ extrato = 0; senao 'nao_conciliado' com cada motivo e valor
  (`dias_com_diferenca`, `saldo_diverge`, `extrato_nao_fecha`); sem saldo informado 'pendente' (`saldo_nao_informado`); mes sem
  extrato = o status de hoje (a regua antiga) com `sem_extrato`. ⚠ (ii) e (iii) SOZINHOS NAO EXISTEM: (ii) = (iii) + Σ diferencas
  dos dias. O dono das pontas evoluiu ADITIVO: `fn_caixa_sistema_pontas(..., p_detalhe boolean DEFAULT false)` — sem o parametro,
  linhas e colunas identicas (69/69, 5.268 linhas; `fn_extratos_espelhados` 69/69 por md5); com ele, o detalhe da mesa
  (extrato · vinculo com o mes e o sinal · lancamento do lv2 com interna, aplicado e vinculo fora). md5: pontas 56a28f30…,
  resumo fe3c16e4…, `_fn_conciliacao_dias_conta` 66faca98…. Tempo, 20 chamadas na mesma sessao, todas as
  contas: NJ 18 contas ≤ 619 ms, Santa Rita 27 ≤ 540 ms. AS TELAS QUE LEEM: ver a regra "A CONCILIACAO DESENHA O DONO" (PR 02).
  ⚠ DIVIDA: portar a MONTAGEM da mesa para o banco (hoje o banco e' dono do STATUS e da contagem de dias; `montarMesa` desenha).
  ⚠ UMA REGUA EXTRA, fora deste dono e pendente de decisao (D8): `FinV2SaldosTab` (`calcConciliacaoMensal` por `ano_mes`, a
    competencia). [`PainelExtratoMes`/`useSaldoSistemaNaPosicao` sairam no PR-CONC-SALDO-UMA-REGUA-02b.] Tambem fora: fluxo de caixa realizado, card "Caixa no mes", Contas a
    Pagar/Receber e Extrato Gerencial.
  ⚠ DIVIDA DE DADO — os conta-meses que o dono passa a chamar de 'nao_conciliado' (eram 'conciliado' na regua antiga), por motivo:
    (iii) o extrato importado nao fecha com o informado — Santa Rita Bradesco jun/26 (245.476,60) e jul/26 (−245.477,63), Santa
    Rita Itau jul/26 e Itau BBA jul/26 (−10.000,60 cada), Agnaldo Bradesco mai/26 (20.414,85), NJ Sicredi Pessoal mar/26 (0,02),
    NJ Sicredi PJ Pecuaria jul/26 (−881,49); (i)+(ii) sobre-aplicacao — Santa Rita BB jun/26 (−160.000), Vera Itau Personalite
    mai/26 (360), NJ Itau BBA mar/26 (150.000); (i) so' (timing dentro do mes, o saldo fecha) — Santa Rita Sicredi abr/26 (05 x 06,
    ±530.194,90) e Santa Rita BB jul/26 (14 x 15, ±124.305,93). E passa a 'conciliado': NJ Sicredi Lavoura set/26 (o Emerson).
  ⚠ `fn_extratos_espelhados` e' SECURITY DEFINER SEM guarda de tenant (le' como dono); a pontas e o resumo tem `tenant_ok` —
    NA FILA: hotfix de seguranca logo depois do PR 02 (decisao do Gabriel, 03/10).
- ⚠ O RESUMO FICOU COMPLETO — A TELA SO' RENDERIZA (PR-CONC-SALDO-UMA-REGUA-01b, 03/10, migration 20261027191700, ⚠ registrada
  como 20261003163918; ledger = arquivo, md5 202fe32c…). `fn_conciliacao_resumo_mes` devolve, nesta ordem, as linhas de CONTA
  (`nivel` 'conta', na ordem de `ordem_exibicao`), um SUBTOTAL por tipo ('tipo', `tipo_conta` = a chave de `grupoDaConta`:
  cc|inv|cartao|permuta|caixa|outro, rotulo em `conta_nome`) e o TOTAL ('total', `conta_nome` 'Total'). As 19 colunas de antes
  das linhas de conta sao IDENTICAS (md5: 69/69 conta-meses com uma conta, 27 cliente-meses / 407 contas com todas), e as novas
  vem NO FIM: `nivel, tipo_conta, entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias,
  saldo_inicial_origem, posicao, dias, linhas_sistema, sem_conta`.
  · ABERTURA: as MESMAS pecas de entradas/saidas, transferencia = tipo 3- nas DUAS grafias (`isTransferenciaTipo`); as partes
    somam o total no cru (69/69) e arredondadas (69/69).
  · AGREGADOS: valores = soma das linhas de conta FORA as internas (o saldo delas ja' esta' na conta-mae); saldo que falta numa
    conta e' ignorado e o agregado so' e' NULO quando nenhuma o tem. STATUS (decisao do Gabriel, 03/10, migration 20261027191800,
    ⚠ registrada como 20261003170013, ledger = arquivo, md5 d320712e…): sobre TODAS as contas, COM OU SEM EXTRATO — qualquer conta
    'nao_conciliado' (a sem extrato pela regua de hoje inclusive) faz o agregado 'nao_conciliado' com `[{motivo:'contas_nao_conciliadas',
    qtde, contas:[{conta_id, conta_nome, status, motivos}]}]`; 'pendente' NAO derruba, e o agregado diz quantas sao
    (`{motivo:'contas_pendentes', qtde}`, informativo); nenhuma conciliada e nenhuma divergente = 'pendente'; senao 'conciliado'.
    Medido em 28 cliente-meses: 0 total conciliado com conta divergente (com ou sem extrato), 0 nao_conciliado sem conta
    divergente, pendentes contados certo; os 4 do 01b (Vera jan–mar/26 Conta Fazenda −0,03; NJ set/26 Visa Infinite −6.470,73)
    passaram a 'nao_conciliado'. ⚠ 'parcial' NAO EXISTE MAIS (o selo de hoje o mostra em 2 cliente-meses: Santa Rita mai/25 e
    Agnaldo jun/21; no dono os dois ficam 'nao_conciliado', pela conta sem extrato que diverge). `sem_conta {qtde, entradas,
    saidas}` so' no total e so' com `p_conta_ids` NULO; com qtde > 0 vira o motivo `lancamentos_sem_conta`, que INFORMA e nao
    muda o status.
  · `saldo_inicial_origem` 'informado' (ha' a linha do mes) | 'herdado' (saldo final do mes anterior) | 'ausente' — a regra de
    `perContaSaldos`, da conta sozinha; NULO nos agregados.
  · `posicao` so' com `saldo_extrato_data` ANTES do fim do mes: `{data, saldo_sistema_na_data, diferenca_na_data, realizados_apos
    {qtde, valor}}`; a diferenca e o status do MES continuam no fim do mes. Os 5 do proto (Vera 3 e Agnaldo 2, set/26, todos sem
    extrato) batem com o aviso de hoje (11/1/0/0/0 realizados apos).
  · Com UMA conta (`p_conta_ids` de um elemento, ou o cliente com uma so'): `dias` [{data, banco, sistema, diferenca, motivos,
    banco_acum, sistema_acum, saldo_banco, saldo_sistema}] (os dias com movimento, os dias da mesa; acumulados do cru) e
    `linhas_sistema` [{tipo 'vinculo'|'sem_par'|'resto_sub_aplicado', data (a do caixa: o extrato no vinculo), valor CRU com o
    sinal, lancamento_id, extrato_id, extrato_valor, transferencia, parcial + falta (do dono das pontas), sobre_aplicado,
    descricao, fornecedor, subcentro, tipo_operacao, status_transacao, data_pagamento, valor_lancamento, numero_documento}] —
    a interna sem extrato fica FORA; saldo inicial + Σ valor = saldo_sistema no centavo (69/69, os cinco do caixa inclusive).
    Pior conta-mes: 134 KB (NJ BB mai/26, 263 linhas), 163 ms.
  · `fn_conciliacao_status_ano(p_cliente_id, p_ano)` → (ano_mes, nivel 'conta'|'total', conta_id, conta_nome, tipo_conta,
    status, motivos): so' as contas com extrato ou lancamento no mes, pela MESMA interna (`_fn_conciliacao_resumo`, so'
    service_role, que e' o corpo do resumo). Para o total ser o do resumo, a interna recebe tambem a conta com SALDO INFORMADO no
    mes; as demais sao 'pendente' por construcao e entram so' na contagem `contas_pendentes`. Igual a 12 resumos nos 4 clientes
    (status e motivos). A interna pula o helper da conta SEM extrato e SEM lancamento no mes (o dia dela e' o do helper sobre um
    periodo vazio, uma vez por chamada; saida identica em 876 linhas de conta e 336 agregados). Tempo, 20 chamadas na mesma
    sessao, autenticado: NJ 1,80–1,93 s (2 de 40 acima de 2 s: 2.138 e 2.016 ms), Santa Rita ≤ 1.752, Agnaldo ≤ 798, Vera ≤ 507 —
    98 de 100 abaixo de 2 s. ⚠ O NJ ESTA' NO LIMITE: proxima conta ou proximo ano mais cheio pede medir de novo.
  · D1: indice `idx_fin_lanc_v2_cliente_destino` (cliente_id, conta_destino_id), SEM predicado (o parcial `cancelado IS NOT TRUE`
    nao serve a `cancelado = false`), e o filtro de conta da pontas em DUAS buscas — saida identica (69/69, com e sem detalhe);
    conta vazia 26 -> 2,3 ms, resumo de todas as contas do NJ ~590 -> ~230 ms; escrita: insert sem diferenca medivel, update de
    todas as linhas +8%, 1,2 MB.
  ⚠ DIVIDA (D8): duplicatas e pendencias gerenciais (`detectarDuplicatasCrossOrigin`, `derivarPendenciasGerenciais`) ficam no
    FRONT, fora do dono.
  ⚠ DIVIDA: o D6 (saldo inicial + linhas = saldo_sistema) NAO foi provado em Agnaldo Bradesco (186a093b) jul/26 — o conta-mes
    nao estava no conjunto dos 69. E `'3-Transferência'` NO SINGULAR (6 lancamentos vivos, todos com destino) e' INVISIVEL para a
    ponta de DESTINO na pontas (o predicado so' le' o plural e o sinal −1 nao entra pelo destino) — regra anterior a este PR.
  md5: pontas ce53914e…, `_fn_conciliacao_dias_conta` b194103a…, `_fn_conciliacao_resumo` d8463a56… (d364e139… no 01b), resumo
  25aa2ac4…, status_ano b31bf6ac… (d27b8623… no 01b).
- ⚠ O CONJUNTO DE CONTAS, A DIFERENCA POR LADO E O SALDO CORRIDO SAO DO DONO (PR-CONC-SALDO-UMA-REGUA-01c, 03/10, migration
  20261027192200, ⚠ registrada como 20261003183158; ledger = arquivo, md5 1b25da41…). (D1) SEM `p_conta_ids` o universo e' o da
  TELA: conta ATIVA e ja' existente no mes (`mes_inicio IS NULL OR mes_inicio <= mes`, a regua de `perContaSaldos`) — linhas,
  subtotais, total e `contas_pendentes`; `fn_conciliacao_status_ano` conta o MESMO universo por mes; com `p_conta_ids`, as contas
  pedidas, como antes (69/69 conta-meses identicos por md5, 207 linhas). Medido em 2026: sairam 6 linhas de conta (537661af "Nelson
  Virtual" e 77d37bbf "Sicredi-PJ Aplicacao", jan–mar, `mes_inicio` 2026-04), 12 de 264 agregados mudaram, todos por elas; no
  537661af jan–mar o universo vira UMA conta, e a regra do "uma conta = detalhe" passa a mandar `dias`/`linhas_sistema` nela.
  (D2) toda linha ganha NO FIM `diferenca_entradas` e `diferenca_saidas` (banco − sistema, do cru; agregados = soma fora as
  internas) — o quadro do topo do Casar. Diferenca por lado NAO e' status: Santa Rita BB abr/26 da' +470.000 / −470.000 com o
  liquido zero (extratos sem par e lancamentos sem par que se compensam no dia). (D3) `linhas_sistema` ganha `saldo_apos` (saldo
  inicial + as linhas ate' ela, na ordem da lista; fecha em `saldo_sistema` em 69/69), `centro` (`centro_custo` do lancamento) e
  `status_exibicao` ('parcial' o programado que nao quitou, 'conciliado' o vinculo, 'realizado' o resto; 5.034/1/330 nos 69).
  A tela NAO SOMA LINHA. md5: `_fn_conciliacao_dias_conta` b00a0840…, `_fn_conciliacao_resumo` 3f91479a…, publica 25aa2ac4…
  (corpo igual; DROP + CREATE pelo retorno), status do ano fd79e1bd…; ACL, tenant_ok e plan_cache_mode conferidos na migration.
  Tempo (10 chamadas, autenticado, antes x depois): status do ano NJ ~1,9 s x ~1,9 s, Santa Rita ~1,6 s x ~1,6 s; resumo de todas
  as contas NJ ~212 ms x ~212 ms. Prova sintetica: `supabase/tests/conc_saldo_uma_regua_01c_test.sql`; vitest: o fixture
  `resumoMes.fixture.json` recapturado com os campos novos.
- ⚠ A CONCILIACAO DESENHA O DONO (PR-CONC-SALDO-UMA-REGUA-02, 03/10, so' tela). A aba Conciliacao (`ConciliacaoBancariaTab`) e o
  quadro do topo e a aba Sistema do Casar (`EspelhoConciliacaoTab`) leem `fn_conciliacao_resumo_mes` por `useResumoMes` e a regua dos
  doze meses por `useStatusAno` (`src/hooks/useResumoConciliacao.ts`, chaves `CHAVE_RESUMO_MES`/`CHAVE_STATUS_ANO`); o retorno se le'
  e se escreve em `src/lib/conciliacao/resumoDoDono.ts` (parser sem cast, `frasesDoStatus`, `fraseDoRetido`, `fraseSemConta`,
  `contasParaFecharSemMovimento`). A TELA NAO SOMA, NAO SUBTRAI E NAO ESCOLHE CONTA: `buildMonthCards` (e o teste
  `conciliacaoAgregadoTransferencia.test.ts`), `perContaSaldos` por `calcConciliacaoMensal`, `totalSaldos`, a soma dos subtotais, o
  'parcial' e a leitura em levas do extrato do ano (`contasComExtrato`) SAIRAM. O que ficou e quem e':
  · RESUMO (D1): a linha do dono da conta aberta, ou o total no Todas, com a abertura terceiros x transferencias nas duas visoes,
    "↳ retido no deposito R$ X (N)" (title) e, no Todas, "lancamentos sem conta +E / −S (N)" (o dono manda os dois em MODULO).
  · STATUS (D2): o do dono, o mesmo da Conferencia; o card escreve os motivos ("N dias com diferenca" e' LINK para a Conferencia da
    conta no PRIMEIRO dia — `diaFoco` no `EspelhoConciliacaoTab`, que rola a mesa ate' `data-dia`; "saldo diverge", "o extrato nao
    fecha com o saldo informado", "saldo nao informado", "sem extrato"; no Todas "N contas nao conciliadas" com o nome de cada uma,
    cada nome com o link do dia dela, e "N pendentes"). "confere em todos os dias" so' com extrato e SEM o motivo de dias. Pareamento,
    "sem classificacao" e duplicados seguem INFORMATIVOS. Valor negativo nas frases com "−" tipografico colado ao "R$" (U+2060).
  · REGUA (D3): os meses nascem NEUTROS e se pintam com `fn_conciliacao_status_ano`; o mes aberto nasce pintado pelo total do resumo.
    `STATUS_COR` tem as chaves do dono (conciliado | nao_conciliado | pendente).
  · SALDOS POR CONTA (D4): linhas 'conta' (sistema, extrato, diferenca, o ponto = status, o `title` = motivos), subtotal = linha 'tipo'
    do dono, Total = linha 'total'. [REVOGADO no PR-CONC-INTERNA-SEPARADA-01b: a conta interna TEM LINHA, no tipo
    dela, e toda linha de conta desenha o `proprio` do dono; o "⊕" e o "consolida X" sairam — ver a regra "CADA CONTA COM O
    SALDO PROPRIO".] As ocultas (saldo 0, extrato 0, sem movimento, sem extrato) leem o `proprio` da linha do dono.
  · POSICAO (D5): `saldo_extrato_data` e `posicao` do dono (rodape e "N realizados apos").
  · CASAR (D6/D7): Banco x Sistema x Diferenca por lado, a linha "Retido" (sempre presente) e "Sem par" com o valor dos extratos; a aba
    Sistema desenha `linhas_sistema` com `saldo_apos`, centro e `status_exibicao` ("parcial · falta R$ X", coluna de 154px medida no
    pior de sete digitos); "Saldo final (sistema)" = `saldo_sistema`. A linha do resumo do modal da Conferencia le' os mesmos.
  · FECHAR CONTAS SEM MOVIMENTO (D8): grava o `saldo_sistema` e o `saldo_inicial` DO DONO, e NAO fecha conta com movimento no mes
    (entrada, saida ou extrato) — antes gravava o `saldoCalculado` a valor cheio e fechava tambem a conta com movimento.
  · A aba nao espera os lancamentos do ano: abre com o resumo (as contagens "Todos (N)" dizem "…" ate' a lista chegar), e a regua
    e as abas nao viram esqueleto. Medido no NJ (navegacao, recarga sem cache): 4.003 / 2.944 ms -> 1.002 / 889 ms ate' o Total.
  ⚠ FORA (o que ainda resta depois do 02b): o G6 (ver a regra do 02b, logo abaixo); e, fora da Conciliacao, fluxo de caixa
    realizado, card "Caixa no mes", Contas a Pagar/Receber, Extrato Gerencial e `FinV2SaldosTab` — continuam na regua antiga. O modal "Todos (N)" e as pendencias de classificacao/duplicados seguem
    sobre a lista dos realizados do mes (lista, nao saldo).
  [INVALIDACAO: o "PR 03" e' o CONC-SEM-F5-01 — ver a regra "F5 NUNCA E' NECESSARIO NA CONCILIACAO".]
  [A "divida 01d" (conta sem extrato divergente so' com `sem_extrato`) FECHOU no PR-CONC-STATUS-SALDO-01a: o motivo e' sempre
    `saldo_diverge` com o valor, e `sem_extrato` virou aviso. O NJ Cartao BB Visa Infinite set/26 esta' conciliado, 0,00.]
- ⚠ O PAINEL DO MES, O LAPIS E O "CONCILIAR O MES" LEEM O DONO (PR-CONC-SALDO-UMA-REGUA-02b, 03/10, so' tela).
  `useSaldoSistemaNaPosicao` e `somarAtePosicao` SAIRAM (com o teste deles): eram a regua antiga (saldo inicial do mes + os
  `cenario='realizado'` a VALOR CHEIO ate' a posicao, sem filtrar `status_transacao`, somados no front). `movimentoNaConta` e
  `LinhaDaPosicao` FICAM (saldo em caixa e Contas a Pagar/Receber, fora da Conciliacao).
  · PAINEL (`PainelExtratoMes`, D1): saldo no sistema, diferenca e "N realizados apos" sao a linha do dono pela posicao
    (`sistemaNaPosicao`, `src/lib/conciliacao/resumoDoDono.ts`: `posicao.saldo_sistema_na_data` / `diferenca_na_data` /
    `realizados_apos.qtde` com posicao no meio do mes; senao `saldo_sistema` / `diferenca`). Nenhuma subtracao na tela. "…"
    enquanto o dono nao responde (D7). Leitura `useResumoMes(cliente, mes, [conta], { servirDoCache: true })` — a MESMA chave do
    Casar; `servirDoCache` (staleTime 60 s so' nesse observador) e' o que evita a segunda ida ao dono ao montar (medido: 0
    chamadas abrindo o Importar depois do Casar; sem ele, 1). Fresco pelo GATILHO: `useReleDonoAoMudarLancamentos` (o mesmo
    `inscreverEmLancamentos` que o hook antigo ouvia, D6) e salvar o saldo no lapis invalidam `CHAVE_RESUMO_MES`.
  · CONTA-MAE COM INTERNA (D2a) — [REVOGADO no PR-CONC-INTERNA-SEPARADA-01b: no painel os TRES sao os da CONTA — o extrato e'
    o saldo declarado dela, o sistema e a diferenca sao o `proprio` do dono —, sem "⊕"; `useContasConsolidadasEm` saiu, os nomes
    do par vem do dono (`internas` e o motivo 'conferida_com').]
  · "CONCILIAR O MES" (`AcoesDoMes`, D3): o "Sistema hoje" e' o mesmo `sistemaNaPosicao`; o `ConciliarMesDialog` nao mudou.
  · LAPIS (`SaldoRealDialog`, D4): "sistema em DD/MM" com a data DIGITADA e' o `saldo_apos` da ultima linha de
    `linhas_sistema` ate' a data (`saldoSistemaNaData`); sem linha ate' la', o saldo inicial do dono — LIDO, nao somado; a
    diferenca contra o digitado segue `saldoConfere`. Em CONTA-MAE (D4a) — [REVOGADO no PR-CONC-INTERNA-SEPARADA-01b: o
    lapis le' o `saldo_apos_proprio` a partir do saldo inicial proprio e calcula a diferenca em TODA conta, mae e interna
    inclusive; "consolidado com X" e "a diferenca esta' no Resumo" sairam.]
  ⚠ MUDAM DE NUMERO NESTE PR, COM CAUSA (aceitas pelo Gabriel, 03/10; medido em 547 conta-meses de 2026, 543 sem parcial e sem
    interna, 4 divergem): NJ Itau BBA mar/26 243.550,79 -> 93.550,79 (sobre-aplicado e3e36029, 150.000); Vera Itau Personalite
    mai/26 264.503,93 -> 264.143,93 (sobre-aplicado 77711d94, 360); Santa Rita BB jun/26 0,00 -> 160.000,00 (sobre-aplicado
    eabe167e "Venda 118 vacas - 1/2", 375.000 num de 215.000); NJ Caixa Carlos ago/26 −859,84 -> 0,00 (434823f9 "Revisao Hilux -
    6/6", PROGRAMADO com `cenario='realizado'`, que a regua antiga somava). Alem delas, o parcial (o Emerson, NJ Sicredi Lavoura
    set/26: 158.533,89 -> 155.972,29) e a conta-mae consolidada. `posicao` nula com `saldo_data` declarada: 0 de 547; "realizados
    apos" antigo x dono: 0 divergencias.
  ⚠ G6 (fora, registrado): os REALIZADOS APOS UMA DATA DIGITADA no lapis nao estao no dono — ele so' conta os apos a posicao
    DECLARADA (`posicao.realizados_apos`). Hoje o lapis nao mostra "N realizados apos", entao nao faz falta; se um dia mostrar, e'
    banco (o dono devolver a contagem por data), nunca contagem de `linhas_sistema` na tela.
- ⚠ A CONTA INTERNA TEM SALDO PROPRIO; O QUE FICA JUNTO E' SO' O VEREDITO DO PAR (PR-CONC-INTERNA-SEPARADA-01a, Gabriel 03/10,
  so' banco; migration 20261027192300, ⚠ registrada como 20261003204845; ledger = arquivo, md5 ac949d1f…). Conta interna =
  `consolida_em_conta_id` nao nulo; hoje so' o Agnaldo (mae Bradesco 186a093b, cc; interna Bradesco-Invest. Facil c2ce6a0e, inv). O
  arquivo do banco da mae so' traz os rendimentos; aplicacoes e resgates existem so' como transferencias do sistema; a interna nao
  tem extrato — por isso o veredito e' do PAR, consolidado.
  · CAMPOS NOVOS, NO FIM do retorno de `fn_conciliacao_resumo_mes`: `proprio` jsonb {saldo_inicial, entradas, saidas, saldo_sistema,
    saldo_extrato, diferenca, entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias} em toda linha
    'conta' (sem interna, e na propria interna, = os campos de cima; na mae = o inicial e o extrato DELA e o sistema = inicial
    proprio + movimento dela + as transferencias com a interna); `par_conta_id` e `par_status` (so' na interna); `internas`
    [{conta_id, conta_nome}] (so' na mae). Linhas 'tipo' e 'total': os quatro NULOS.
  · REGRA DO PAR [REVOGADA no PR-CONC-STATUS-SALDO-01a: cada conta e' julgada pelo SEU saldo, `par_status` so' informa, o
    'conferida_com' e' AVISO e a interna conta no total]: a interna tem status = `par_status` = o status da MAE e motivos [{motivo:'conferida_com', conta_id, conta_nome}]
    (com a mae na chamada ou sozinha em `p_conta_ids`). No TOTAL o par vale UMA vez: a interna nao entra em
    `contas_nao_conciliadas` nem em `contas_pendentes`. No SUBTOTAL do tipo a interna CONTA, com o status do par e o
    'conferida_com' (os motivos da mae ficam na linha dela; nenhum campo novo): Investimentos reflete o veredito do par, e o tipo
    cuja unica conta e' a interna herda esse veredito, nunca 'pendente []'. `fn_conciliacao_status_ano`: a interna aparece em todo
    mes em que a mae aparece, com o status do par, e nao conta no universo das pendentes.
  · SALDOS DOS AGREGADOS: subtotal e total somam o `proprio` de TODAS as contas, cada uma no seu tipo (a mae em Conta corrente, a
    interna em Investimentos); entradas/saidas (e as aberturas, o banco e os sem par) seguem CONSOLIDADAS, sem as internas.
  · CORRECAO DE DEFEITO (Opcao A): o CONSOLIDADO da mae = Σ PROPRIOS — passou a somar o movimento da interna com TERCEIROS, que
    ficava de fora. Mudancas de Total medidas (antes x depois por md5, todos os clientes 2024-01..2026-09 e o Agnaldo
    2020-01..2026-12: 2.682 linhas de conta sem o par e 64 conta-meses detalhados identicos; status do ano 1.015 linhas identicas),
    TODAS do Agnaldo e aceitas pelo Gabriel:
      mes       diferenca do par (antes -> depois)   o que muda no Total
      2021-10   −5,91  -> 0,00                        saidas / saldo_sistema
      2021-12   +1,26  -> 0,00                        entradas / saldo_sistema
      2023-01   −3,96  -> 0,00                        saidas / saldo_sistema
      2026-01   +82,51 -> 0,00                        entradas / saldo_sistema
      2026-02   −65,41 -> 0,00                        saidas / saldo_sistema
      2026-03   −17,10 -> 0,00                        saidas / saldo_sistema
      2026-04   +3,52  -> 0,00                        entradas / saldo_sistema
    (status 'conciliado' antes e depois nos sete); 2026-08: entradas e saidas do Total ±1,74 (liquido zero; saldo, diferenca e
    status iguais); 2021-06: `contas_nao_conciliadas` 2 -> 1 (a interna sai da lista; saldos, diferenca e status identicos);
    out, nov e dez/2026: `contas_pendentes` 13 -> 12 (resumo e status do ano).
  · O SUBTOTAL INVESTIMENTOS DO AGNALDO passa de 'conciliado' a 'nao_conciliado' em 11 meses (o par nao conciliado): 2022-01,
    2022-02, 2022-05, 2024-01, 2024-04, 2024-05, 2024-08, 2024-09, 2025-01, 2026-05, 2026-09; em 2021-06 ja' era 'nao_conciliado'
    e so' o motivo da interna troca ('sem_extrato' -> 'conferida_com').
  · `linhas_sistema` (uma conta): toda linha ganha `saldo_apos_proprio`; na MAE entram as linhas tipo 'transferencia_interna'
    (`transferencia` true, `status_exibicao` 'realizado'), que contam SO' no `saldo_apos_proprio` — `dias`, `sistema_total` e o
    `saldo_apos` consolidado ficam identicos. `posicao` ganha `saldo_sistema_proprio_na_data`. O helper
    `_fn_conciliacao_dias_conta` manteve os 7 argumentos (devolve a mais `interna_total`, `interna_entradas`, `interna_saidas`,
    `posicao_interna`).
  ⚠ PARA A TELA (01b): na conta-mae o ULTIMO `saldo_apos` consolidado NAO FECHA em `saldo_sistema` quando a interna movimenta com
    terceiros (a diferenca e' exatamente esse movimento); a tela da mae le' `saldo_apos_proprio` e `proprio.*`, que fecham sempre
    (80 de 80 meses do par). Isto revoga, so' para a conta-mae, o "fecha em `saldo_sistema`" do 01c.
  Provas no vivo: Σ proprios = consolidado em 80 de 81 meses do par (1 sem saldo); interna = mae em 33 de 33 meses do status do
  ano; 18 transferencias internas em ago/26; abr/24 mae propria −55.719,49 x extrato −55.734,67, interna −4,02; ago/26 54.738,55
  conciliado; set/26 26.205,97 x 110.611,77, diferenca 84.405,80. Tempo por chamada (10 chamadas, autenticado, antes -> depois):
  status do ano NJ 1.884 -> 1.901 ms, Santa Rita 1.488 -> 1.554 ms; resumo de todas as contas do NJ 228 -> 214 ms.
  md5: `_fn_conciliacao_resumo` 3f91479a… -> 68c2e274…, `_fn_conciliacao_dias_conta` b00a0840… -> bb71a135…, status do ano
  fd79e1bd… -> 0c30b647…, publica 25aa2ac4… (corpo igual; DROP + CREATE pelo retorno); ACL, SECURITY DEFINER, search_path,
  plan_cache_mode e tenant_ok conferidos na migration. Testes: `supabase/tests/conc_interna_separada_01a_test.sql` (D1–D6; contra o
  corpo sem a regra do subtotal ele cai em "D3 inv veredito"); `conc_saldo_uma_regua_01b_test.sql` atualizado ao contrato novo
  (posicao com `saldo_sistema_proprio_na_data`, a linha 'transferencia_interna', o fecho do proprio, a interna no status do ano
  pela mae); 01, 01c e hotfix seguem OK. A TELA trocou no 01b (regra seguinte).
- ⚠ CADA CONTA COM O SALDO PROPRIO; A INTERNA VOLTA PARA O TIPO DELA (PR-CONC-INTERNA-SEPARADA-01b, Gabriel 03/10, so' tela).
  NASCE DE UMA REJEICAO: o Gabriel digitou −55.734,67 no Bradesco abr/24 e a tela mostrou −55.738,69 (somou os −4,02 da interna),
  e a conta de investimento tinha sumido da lista. A tela so' LE o `proprio.*`, `par_*`, `internas`, `saldo_apos_proprio` e
  `posicao.saldo_sistema_proprio_na_data` do dono; nenhuma soma, nenhuma subtracao, nenhuma leitura de cadastro para o par.
  · LEITOR (`src/lib/conciliacao/resumoDoDono.ts`): `saldosDaLinha(l)` = na linha de CONTA o `proprio`, nos agregados o topo;
    conta SEM `proprio` (dono antigo) fica NEUTRA ("—"), nunca cai no campo consolidado por reserva. `contaEmPar`, `marcaDoPar`
    (mae: nomes de `internas`; interna: o `conta_nome` do motivo 'conferida_com'), `diferencaNaPosicao`, e os de antes
    (`sistemaNaPosicao`, `saldoSistemaNaData`) passaram a ler o proprio. Os campos de TOPO da mae seguem consolidados: sao o
    veredito do par (status, motivos, dias, quadro banco x sistema da Conferencia), nao o saldo da conta.
  · SALDOS POR CONTA (`ConciliacaoBancariaTab`): a interna tem linha, a MESMA `SaldoContaRow`, no grupo do `tipo_conta` dela, com o
    lapis dela; Sistema / Extrato / Diferenca = `proprio.*`; o "⊕" saiu. O ponto e' o status do dono (na interna, o do par).
    OCULTAS: a regra le' o `proprio`, e a interna NUNCA se oculta com movimento proprio no mes nem com o par nao conciliado
    ('pendente' inclusive). Subtotais e Total = as linhas 'tipo' e 'total' do dono.
    ⚠ A MARCA DO PAR NA LINHA E' "· par", NAO "· conferida com <nome>" — MEDIDO a 1.135px: a coluna Conta tem 200–210px uteis;
      "· conferida com Bradesco-Invest. Facil" pede ~175px e quebrava a linha em duas (36px contra 22); "· em par" (36,5px) ainda
      quebrava a do Invest. Facil em set/26 por 1,7px (209,7 de 208). Com "· par" (20,1px) a pior linha pede 193,3 de 200. A frase
      inteira ("conferida com <nome> — o mes desta conta so' fecha junto com <nome>: o arquivo do banco traz o saldo das duas
      somado") vai no `title` da marca; o card Status escreve "conferida com <nome>" por extenso.
  · RESUMO com UMA conta: saldo inicial, entradas, saidas (com terceiros x transferencias), sistema, extrato e diferenca =
    `proprio.*`; no Todas, a linha 'total'. O card Status segue o topo (o veredito do par) e acrescenta "conferida com <nome>".
  · PAINEL (`PainelExtratoMes`): extrato = o saldo declarado da conta; sistema e diferenca = `sistemaNaPosicao` (proprio; com
    posicao, `posicao.saldo_sistema_proprio_na_data`). LAPIS (`SaldoRealDialog`): `saldoSistemaNaData` (o `saldo_apos_proprio` da
    ultima linha ate' a data; sem linha, o `proprio.saldo_inicial`) e a diferenca contra o digitado em toda conta. "CONCILIAR O
    MES" (`AcoesDoMes`): `saldoSistemaHoje` = o mesmo `sistemaNaPosicao`. "FECHAR CONTAS SEM MOVIMENTO"
    (`contasParaFecharSemMovimento`) grava e julga pelo `proprio` — na mae o topo e' o consolidado, e grava'-lo como saldo dela
    somaria a interna.
  · ABA SISTEMA (`AbaSistemaReal`): saldo inicial e final = `proprio`, a coluna de saldo = `saldo_apos_proprio`, e na mae as
    linhas 'transferencia_interna' aparecem com "⇄ interna · fora do extrato" (123px dos 154 da coluna; a legenda inteira no
    `title`). ⚠ NA MAE O `saldo_apos` CONSOLIDADO NAO FECHA em `saldo_sistema` quando a interna movimenta com terceiros; a tela
    da mae le' `saldo_apos_proprio`. A CONFERENCIA dia a dia (`montarMesa`), o QUADRO DO TOPO do Casar (banco x sistema por lado)
    e a aba "Extrato (banco)" NAO mudaram: seguem consolidados — na mae o "Saldo inicial (extrato)" continua o do par (ago/26:
    238.791,26) e o quadro mostra a diferenca por lado do dono (ago/26: +1,74 / −1,74, o movimento da interna com terceiros).
  ⚠ PENDENCIA DE TELA (proximo PR): na conta-MAE, o quadro do topo do Casar e a aba "Extrato (banco)" SEGUEM CONSOLIDADOS, ao
    lado de uma aba Sistema que ja' e' propria. Medido no Bradesco do Agnaldo, ago/26: "Saldo inicial (extrato)" 238.791,26 x
    "Saldo inicial (sistema)" 1,00; diferenca por lado +1,74 / −1,74 num mes conciliado.
  ⚠ DIVIDA DE BANCO (01c) [o CAMPO foi entregue no PR-CONC-STATUS-SALDO-01a; a TELA ainda nao o le' — pendencia "posicao na
    tela"]: o dono NAO devolve a diferenca PROPRIA na posicao declarada (`posicao.diferenca_propria_na_data`).
    Em conta de par (mae ou interna) com a posicao antes do fim do mes, a Diferenca do painel e a do rodape do Resumo mostram
    "—" com o `title` "diferença na posição ainda não disponível para conta conferida em par — veja a diferença do fim do mês"
    (`TITULO_DIFERENCA_NA_POSICAO_INDISPONIVEL`); conta sem par segue lendo `posicao.diferenca_na_data`. Quando o campo entrar,
    a tela troca o "—" pela leitura dele. ZERO casos de 2020-01 a 2026-12 na medicao de 03/10.
  Provas: conta SEM par tem `proprio` = topo em 2.163 linhas de conta (todos os clientes, 2024-01..2026-09), 0 divergencias, e
  a posicao propria = a da conta nas 5 com posicao. No navegador a 1.135px: Agnaldo abr/24 Bradesco −55.719,49 x −55.734,67
  (−15,18) em Conta corrente e Invest. Facil −4,02 x −4,02 em Investimentos; ago/26 54.738,55 x 54.738,55 e 0,00 x 0,00; set/26
  26.205,97 x 110.611,77 (84.405,80); aba Sistema do Bradesco ago/26 com 134 linhas, 18 internas, de 1,00 a 54.738,55; NJ set/26
  igual ao publicado (Sicredi Lavoura 155.972,29, Banco do Brasil 604.088,31). Tempo no vivo, 10 chamadas: status do ano NJ
  1.891–1.998 ms, Santa Rita 1.569–1.932 ms; resumo de todas as contas do NJ 216–229 ms. Testes: T1–T9 nos cinco arquivos da
  linha de baseline, com dez mutacoes que caem pelo numero consolidado; os fixtures de conta sem par passam por `comProprio`
  (`src/lib/conciliacao/resumoDoDono.fixture.ts`), e o `resumoMes.fixture.json` ganhou os campos do 01a lidos do dono.
- ⚠ VERDE = SALDO BATE COM O SISTEMA; O EXTRATO IMPORTADO E' A 2a PROVA, SO' AVISO (PR-CONC-STATUS-SALDO-01a, Gabriel 03/10, so'
  banco; migration 20261027192700, ⚠ registrada como 20261004024939; ledger = arquivo, md5 d7d4ce62…). "Conciliado" diz UMA coisa:
  o saldo informado da conta bate com o saldo do sistema. Substitui o que os blocos de cima diziam sobre motivos que reprovam
  (dias com diferenca, extrato que nao fecha, sem extrato) e sobre o `par_status` decidir o status da interna.
  · LINHA DE CONTA, sobre o saldo PROPRIO: 'conciliado' = saldo informado e diferenca 0 (ZERO EXATO sobre valores arredondados a
    2 casas — a tolerancia de sempre); 'nao_conciliado' = informado e diferente, motivo `saldo_diverge {valor}`; 'pendente' = falta
    saldo, motivo `saldo_nao_informado {falta}`. `motivos` SO' LEVA O QUE DECIDE.
  · `avisos` jsonb, a ULTIMA coluna de `fn_conciliacao_resumo_mes`, `fn_conciliacao_status_ano` e da interna, com a mesma forma
    dos motivos ([] sem aviso): `sem_extrato` · `dias_com_diferenca {qtde, dias}` · `extrato_nao_fecha {valor}` ·
    `extratos_sem_par {qtde, valor}` e `lancamentos_sem_par {qtde, valor}` (so' com extrato) · `realizados_apos_posicao {qtde,
    valor, data}` · `conferida_com {conta_id, conta_nome}` (na interna, o ponteiro da mae). NENHUM AVISO MUDA O STATUS. Os avisos de
    extrato da mae seguem no consolidado.
  · PAR: cada conta julgada pelo SEU proprio; `par_status` segue = o status da MAE, so' informa; `par_conta_id` e `internas` ficam.
  · POSICAO: com saldo declarado ANTES do fim do mes o status julga a diferenca PROPRIA NA POSICAO
    (`posicao.diferenca_propria_na_data`, campo novo; `saldo_diverge` leva `posicao` = a data); sem posicao, a do fim do mes. A
    `diferenca` e a `proprio.diferenca` continuam sendo as do FIM do mes.
  · DIFERENCA = round(extrato, 2) − round(sistema, 2), os dois numeros que a tela mostra (`diferenca`, `proprio.diferenca` e as duas
    da posicao). Lancamento com 3 casas dava 0,01 com os dois saldos iguais na tela. Mudaram 4 linhas, todas em 0,01: Vera Itau
    Personalite nov/24 e Raul Bradesco Virtual jul/23 (0,01 -> 0,00), Vera Conta Fazenda set/24 e nov/24 (−0,07 -> −0,06).
  · SALDO INICIAL: o saldo final do mes anterior; SEM ele, o `saldo_inicial` INFORMADO na linha do mes (o primeiro mes da conta),
    no topo, no `proprio` e no saldo corrido proprio da mae (`_fn_conciliacao_dias_conta`). 66 linhas ganharam inicial, sistema e
    diferenca (`proprio` = topo nas 66; 65 conciliadas, 1 nao conciliada: Santa Rita Itau BBA ago/23).
  · AGREGADOS (subtotal do tipo e total): qualquer 'nao_conciliado' derruba; 'pendente' so' conta; nenhuma conciliada = 'pendente'.
    TODA conta entra UMA vez com o SEU status, a INTERNA inclusive (antes ela ficava fora do total); as SOMAS nao mudam. `avisos`
    = [{motivo:'contas_com_aviso', qtde, qtde_alem_sem_extrato, por_aviso:{<aviso>: n contas}}] ('conferida_com' nao conta; no
    TOTAL a interna so' entra nessa contagem com aviso ALEM de 'sem_extrato'). As contas citadas em `contas_nao_conciliadas` levam
    `avisos`. `lancamentos_sem_conta` segue motivo INFORMATIVO do total. No status do ano as omitidas somam em `contas_pendentes`
    (todas) e em `contas_com_aviso` (as que nao sao internas).
  · MEDIDO (7 clientes, 2020-01..2026-12, 6.803 linhas, 5.137 de conta, antes x depois na mesma transacao): nenhuma conta passa de
    conciliado a nao conciliado nem a pendente; 17 passam de nao conciliado a conciliado (Santa Rita Sicredi abr/26, Bradesco jun e
    jul/26, Itau, Itau BBA e BB jul/26; Agnaldo Invest. Facil jan/fev/mai/22, dez/24, jan/25, mai e set/26 e Bradesco mai/26; NJ
    Sicredi Pessoal mar/26 e Sicredi PJ Pecuaria jul/26; Vera Itau CDI set/26, pela posicao); 5 totais passam a conciliado. A
    interna no total muda 4 totais do Agnaldo, so' de contador: jun/21 `contas_nao_conciliadas` 1 -> 2 (mae +0,96, interna −0,96)
    e out/nov/dez/26 `contas_pendentes` 12 -> 13. Status do ano = resumo em status, motivos e avisos (2.549 linhas). Tempo
    (mediana de 6, mesma transacao): status do ano NJ 1.910 -> 1.935 ms, Santa Rita 1.552 -> 1.614 ms; resumo NJ 208 -> 206 ms.
  md5: `_fn_conciliacao_resumo` 68c2e274… -> 26f4a6df…, `fn_conciliacao_status_ano` 0c30b647… -> 35db738d…,
  `_fn_conciliacao_dias_conta` bb71a135… -> cbd60a5e…, `fn_conciliacao_resumo_mes` 25aa2ac4… (corpo igual; DROP + CREATE pelo
  retorno, como o status do ano). ACL, SECURITY DEFINER, search_path, plan_cache_mode e tenant_ok conferidos na migration.
  Testes: `supabase/tests/conc_status_saldo_01a_test.sql` (T1–T9; no corpo antigo cai em "no field avisos");
  `conc_saldo_uma_regua_01`, `_01b` e `conc_interna_separada_01a` atualizados SO' em status/motivos/avisos (e a chave nova da
  posicao); `_01c` e o hotfix passam sem mudanca. Os seis OK no banco vivo depois de aplicar.
  ⚠ PENDENCIAS: (a) POSICAO NA TELA (produto, Gabriel decide na homologacao): Vera Itau CDI set/26 fica verde pela posicao e a
    coluna Diferenca / "Diferenca de saldo" mostram −1.080.000,00 do fim do mes; e a conta de par com posicao ainda mostra "—" na
    diferenca na data — a tela passa a ler `posicao.diferenca_propria_na_data` em PR proprio; (b) `financeiro_saldos_bancarios_v2`
    tem 2 pares de linhas DUPLICADAS (Agnaldo 21c7682e fev/21 e 38b316c0 mar/21, zeros, inofensivas hoje; nao ha' unicidade em
    conta + mes); (c) VALOR-3-CASAS: os lancamentos de 3 casas seguem no dado (a diferenca so' deixou de mostra'-los).
- ⚠ O AGREGADO DA CONCILIACAO NUNCA CONCILIA COM CONTA QUE PESA SEM SALDO INFORMADO; EXTRATO E DIFERENCA DO AGREGADO FICAM NULOS; CONTA
  PARADA NAO PESA (CONC-TOTAL-SEM-SALDO-01a, Gabriel 04/10, so' banco; migration 20261027192800, ⚠ registrada como 20261004202343;
  ledger = arquivo, md5 c9742434…). REVOGA EM PARTE a D3 de 03/10 ("pendente nao derruba o agregado"). Frase do Gabriel, na Vera
  out/26 em "Todas as contas": "sistema tem 12 mil, extrato tem 101 mil. Como que a diferenca confere? Erro primario."
  · O DEFEITO: no subtotal e no total, `saldo_sistema` somava TODAS as contas, `saldo_extrato` so' as com saldo informado e
    `diferenca` so' as diferencas que existiam (`sum` ignora NULL); a conta 'pendente' so' entrava em 'contas_pendentes'. Duas
    somas de conjuntos diferentes lado a lado, diferenca 0, veredito 'conciliado'. Nasceu no 01b (20261027191700/191800) e chegou
    a' tela no PR 02; o STATUS-SALDO-01a nao o criou.
  · CONTA QUE PESA SEM SALDO = linha de conta 'pendente' (falta o saldo informado) E saldo proprio no sistema <> 0 OU entradas <> 0
    OU saidas <> 0 no mes. ⚠ A CHAVE E' O STATUS, NUNCA O AVISO 'sem_extrato' (5.068 conta-meses o tem; a coluna "Extrato" da
    tela e' o saldo INFORMADO, nao o arquivo do banco). A interna e' julgada pelo saldo proprio, como qualquer conta.
  · NO AGREGADO ('tipo' e 'total'): status 'nao_conciliado' se alguma diverge; senao 'pendente' se ha' conta que pesa sem saldo
    OU nenhuma conciliada; senao 'conciliado'. Motivo novo depois de 'contas_pendentes': {motivo:'contas_sem_saldo', qtde,
    contas:[{conta_id, conta_nome}]}. `saldo_extrato` e `diferenca` = NULL quando ha' conta que pesa sem saldo, em QUALQUER
    status (a diferenca de cada conta segue na linha da conta). A pendente sem saldo e sem movimento NAO pesa. As linhas de
    conta e as demais colunas do agregado nao mudam.
  · ⚠ REGUA E RESUMO JULGAM O MESMO CONJUNTO DE CONTAS: `fn_conciliacao_status_ano` so' mandava ao dono as contas com movimento,
    extrato ou linha de saldo no mes; a conta PARADA COM SALDO HERDADO (saldo final <> 0 no mes anterior, nada no mes) ficava de
    fora — no resumo ela pesa. Agora a regua a manda tambem (`v_ant`). Quem mudar o criterio de um lado confere o outro.
  · MEDIDO (7 clientes, 2020-01 a 2026-12): 5.137 linhas de conta identicas por md5; 15 agregados de 'conciliado' a 'pendente'
    (8 totais: NJ 2025-06 e 2026-03; Santa Rita 2024-07, 2024-08, 2025-01, 2025-10, 2025-11, 2025-12; 7 subtotais da Santa Rita:
    cc 2024-07 e 2024-08, inv 2025-05, 09, 10, 11, 12); 28 so' ganham o motivo e os nulos (Agnaldo 3, NJ 5, Raul 2, RRCC 2, Santa
    Rita 13 — inclusive os totais 'nao_conciliado' de 2025-03, 05 e 09, que perdem a diferenca somada —, Vera 3); regua = resumo
    em 588 cliente-meses (status e motivos, 0 divergencias). A Vera out/26 NAO esta' na lista: o saldo do Itau Personalite foi
    informado as 14:37 de 04/10 e a conta passou a 'nao_conciliado' pela regra de sempre.
  md5: `_fn_conciliacao_resumo` 26f4a6df… -> 04aa7a4d773b7d58dcdf94d7e9415daf; `fn_conciliacao_status_ano` 35db738d… ->
  ab397ac3b920cc3ffec95ed91914ef6d; `fn_conciliacao_resumo_mes` 25aa2ac4… (nao tocada). ACL, SECURITY DEFINER, search_path e
  plan_cache_mode conferidos na migration. Teste: `supabase/tests/conc_saldo_uma_regua_01b_test.sql` (bloco SEM-SALDO: o defeito,
  a parada com saldo herdado, a parada que nao pesa, com divergente junto, e a volta quando o saldo e' informado; o D7 passou a
  cobrir a regua com conta parada). Mutacoes: so' o patch do dono -> cai no D7; corpo antigo -> cai em "SEM-SALDO defeito".
  [A "fila do 01b" FECHOU no CONC-TOTAL-SEM-SALDO-01b — a regra seguinte.]
  ⚠ DIVIDA CONC-REGUA-DESEMPENHO-01: a regua passa de 2 s nos anos cheios, e ja' passava antes deste PR. Mediana de 5 chamadas
    como a tela chama, antes -> depois (ms): NJ 2026 1.933 -> 1.973 · NJ 2025 2.258 -> 2.307 · NJ 2024 2.147 -> 2.186 · Santa Rita
    2026 1.642 -> 1.649 · Santa Rita 2025 2.339 -> 2.314 · Santa Rita 2023 2.382 -> 2.370 · Agnaldo 2026 953 -> 1.001 · Agnaldo 2023
    1.859 -> 1.840 (com picos isolados de 3 a 4,7 s dos dois lados) · Vera 2026 482 -> 514 · Vera 2025 600 -> 613. O patch custa
    +1% a +5%; o teto aceito para ele foi +10% na mediana (decisao do Gabriel).
  ⚠ DIVIDA "FECHAR CONTAS SEM MOVIMENTO" EM MES EM CURSO (decisao do Gabriel pendente): em 04/10 o botao fechou o Itau CDI da Vera
    em outubro (dia 4) com o saldo do sistema, e dois minutos depois o saldo de setembro foi corrigido — o final gravado ficou
    velho e a conta virou 'nao_conciliado' por um saldo que ninguem conferiu.
- ⚠ F5 NUNCA E' NECESSARIO NA CONCILIACAO (CONC-SEM-F5-01, Gabriel 04/10, so' tela): GESTO QUE GRAVA LANCAMENTO, VINCULO, SALDO OU
  EXTRATO COM A CONCILIACAO MONTADA AVISA O CANAL DE LANCAMENTOS (`notificarLancamentosMudaram`, `src/hooks/useFinanceiroV2.ts`), E A
  CONCILIACAO RELE O DONO AO VOLTAR A' VISTA. Nasce do caso do Gabriel (Vera set/26, Itau Personalite): conciliou no Casar, voltou a'
  aba Conciliacao e o mes seguia "Nao conciliado, diferenca 305.371,67" ate' o F5.
  · A CAUSA MEDIDA: as cinco abas internas (Importar, Casar, Enriquecer, Gerencial, Conciliacao) sao estado da MESMA tela — trocar
    de aba NAO desmonta —, e todo gesto do Casar/Conferencia terminava num `onMudou` que so' relia o espelho. Trocar de SECAO
    desmonta a tela, e o canal so' fala com quem esta' montado: aviso dado na OC nao alcanca a Conciliacao.
  · O DONO SE INVALIDA POR UMA FUNCAO SO', `invalidarDono(qc, cliente)` (`src/hooks/useResumoConciliacao.ts`): as DUAS chaves pelo
    prefixo (o resumo de todas as contas, cada chave por conta e a regua do ano). Invalidar VENCE o `staleTime` de 60 s do
    `servirDoCache`, mantem o numero anterior na tela enquanto o novo nao chega, e leva `cancelRefetch: false` — releitura em curso
    nao e' cancelada nem duplicada. `useReleDonoAoMudarLancamentos` (canal -> `invalidarDono`) passou a reler tambem a REGUA; o
    Espelho (quadro do topo e aba Sistema) o usa.
  · VOLTAR A' VISTA (`useReleDonoAoVoltarAVista(cliente, aVista)`, na `ConciliacaoBancariaTab` com a aba interna "Conciliacao"):
    ao entrar na secao, ao trocar para a aba interna e quando a janela volta a ter foco/visibilidade — UMA chamada do resumo e UMA
    da regua por retorno (eventos colados dentro de `JANELA_DO_RETORNO_MS` contam um). Fora de vista nao dispara. E' a rede de
    seguranca para o que foi gravado em OUTRA secao; a chave por conta fica marcada e o painel com `servirDoCache` rele ao montar.
  · ⚠ A RECARGA PELO CANAL E' SILENCIOSA (`loadData(true)`): nao liga o `loading` nem esvazia a lista. Tres abas internas se
    desenham atras de `!loading`; com o Casar e o Importar avisando a cada gesto, a recarga normal as DESMONTARIA no meio do trabalho
    (a Conferencia aberta, a previa da importacao).
  · ⚠ `notificarLancamentosMudaram(cliente, menosEste)`: o `useFinanceiroV2` avisa os OUTROS e fica de fora — toda instancia dele
    ouve o canal recarregando a lista inteira, e avisar a si mesmo no editar desfaria o PR-FIN-SAVE-LENTO-01. O editar em laco
    (`silent`, o importador de Excel) nao avisa por linha.
  · QUEM AVISA (no ponto de sucesso do dono do gesto, nunca em cada botao): o `onMudou` do Espelho (casar 1:1 e N:1, bloco, desfazer
    bloco, desconciliar, ignorar, reverter — `EspelhoConciliacaoTab.tsx`); criar pela linha (`CriarLancamentoDaLinha`); importar
    extrato (`useImportacaoExtrato`); desfazer importacao (`PainelExtratoMes`, que tem o cliente); cancelar e reverter movimento
    (`useCancelarMovimento`); a Mesa do Enriquecer no HOOK (`useClassificacaoStaging`: gravar a linha, reverter, desmembrar, desfazer
    o desmembramento — so' com `ok` do banco e fora do ensaio; os 5 avisos soltos da `MesaEnriquecimentoTab` SAIRAM); parcela de
    financiamento e transferencia pela Mesa (`AcaoEhParcelaFinanciamento`, `useTransferenciaAplicar`); editar, excluir, excluir em
    lote e realizar em lote (`useFinanceiroV2`). Ja' avisavam: criar e criar em lote, parcelamento, vincular/desvincular/
    reclassificar, criar OC do legado, modal zoo, "Conciliar o mes", transferencias entre contas e o lote do Enriquecer.
  · Testes: `src/hooks/concSemF5.test.tsx` (18) e o caso do Gabriel de ponta a ponta em `conferenciaModal.test.tsx` (gesto da
    Conferencia -> aviso -> resumo E regua relidos). 16 mutacoes, uma por bloco, cada uma derrubando o seu caso.
  ⚠ MOCK DE `@/hooks/useFinanceiroV2` EM TESTE QUE MONTA O ESPELHO OU O CRIAR PELA LINHA leva `inscreverEmLancamentos` e
    `notificarLancamentosMudaram` (e o `ClienteContext`, no criar pela linha).
  ⚠ DIVIDA CANAL-LANCAMENTOS-AVISO-GERAL-01 — os demais pontos que gravam e NAO avisam (medidos em 04/10; ~60 pontos, uns 20 sem
    hook dono). Nao afetam a Conciliacao (ela rele ao voltar a' vista); importam para os outros ouvintes do canal (a lista de
    Lancamentos, `useLancamentosComOC`, o DRE da lavoura) quando montados junto:
    OC — `useOcCompromissos.ts` (criar, programar, parcelas, materializar, ajustar valor), `useOperacaoLiquidacao.ts` (gerar e
    cancelar obrigacao, liquidar, estornar), `useOcContaCorrente.ts`, `useOperacaoRecebimento.ts`, `useCompraLotes.ts`,
    `useOperacaoAbate.ts`, `useReprogramarCompromissoLote.ts`, `useExcluirLoteOC.ts`, `useOperacaoComercial.ts`;
    recorrencia e contratos — `useRecorrencias.ts` (gerar, propagar, cancelar), `useContratos.ts`;
    financiamentos — `useFinanciamentoCadastro.ts`, `ModalBaixaParcela.tsx`, `FinanciamentoDetalhe.tsx`, `parcelaMirror.ts`;
    paineis legados que gravam direto — `AbateFinanceiroPanel.tsx`, `CompraFinanceiroPanel.tsx`, `VendaFinanceiroPanel.tsx`,
    `gerarFinanceiroCompra.ts`, `gerarFinanceiroConsumo.ts`, `useBoitelOperacoes.ts`, `ContaBoitelTab.tsx`, `useFinanceiro.ts`,
    `useLancamentos.ts`;
    agricultura — `useCargaMandioca.ts`, `useBarterMaterializacao.ts`, `AgriEstoqueGraosTab.tsx`;
    correcoes e auditoria — `AuditoriaDuplicidadeTab.tsx`, `CorrecaoTransferenciasBanner.tsx`, `CorrecaoTransferenciasDialog.tsx`,
    `FornecedorFormDialog.tsx`, `FinV2FornecedoresTab.tsx`;
    saldo informado fora da Conciliacao — `useExtratoDaConta.ts`, `FinV2SaldosTab.tsx`, `FinV2ContasTab.tsx`;
    cancelar por RPC — `ContasPagarReceberTab.tsx` (cache proprio `cpr-lancs`/`cpr-caixa`, nao ouve o canal),
    `LancamentoLeituraDialog.tsx`; e telas fora das abas da Conciliacao — `EstacaoConciliar.tsx`, `VincularMatchDireto.tsx`,
    `DecisaoDerivadosDialog.tsx` fora do Espelho, `CasarComBancoModal.tsx` (dentro do Espelho ja' passa pelo `onMudou`),
    `useConciliacaoDoMes.ts`, `useConciliarMes.ts` (o dialogo avisa).
- ⚠ "SEM CLASSIFICACAO" TEM UMA REGRA, NO BANCO: LANCAMENTO ATIVO COM `plano_conta_id` NULO (CONC-SEM-CLASSIFICACAO-01, Gabriel
  06/10/2026; migration 20261027193900, ⚠ registrada como 20261006180307; ledger = arquivo, md5 daccbbd7…). 100% dos lancamentos tem
  de ter plano de contas, DIVIDENDOS INCLUSIVE: para esta regra a excecao "texto fora do plano, exceto Dividendos" NAO vale (o
  gatilho `resolve_classificacao_from_plano` continua aceitando o texto — a migracao dos Dividendos e' o CONC-DIVIDENDOS-PLANO-01).
  · O PREDICADO MORA EM `_fn_lancamento_sem_plano(cancelado, plano_conta_id, tipo_operacao)` (transferencia, tipo '3-', fica fora) e
    `_fn_lancamento_sem_fornecedor(cancelado, plano, favorecido, tipo)` = COM plano e SEM fornecedor (aviso SEPARADO, ambar; o sem
    plano nao conta nele). Internas, fechadas. Quem precisar da pergunta chama estas funcoes; nenhuma regra nova por texto.
  · A CONCILIACAO: `fn_conciliacao_resumo_mes` e `fn_conciliacao_status_ano` devolvem, NO FIM da coluna `avisos` e so' com qtde > 0,
    `{motivo:'sem_classificacao', qtde, valor_entradas, valor_saidas}` e `{motivo:'sem_fornecedor', qtde}`, na linha de conta, no
    subtotal do tipo e no total. So' os REALIZADOS do mes e da conta (vivo, com caixa, status e cenario 'realizado', pago no mes; a
    conta e' a da direcao, `_fn_conta_do_lancamento`); contagem numa leitura por chamada (`_fn_conciliacao_sem_classificacao_mes`),
    somas do CRU e arredondamento so' na saida. ⚠ NUNCA MUDAM STATUS, MOTIVOS NEM `contas_com_aviso` (provado antes x depois nos 7
    clientes, 2020–2027: 2.584 linhas da regua e os resumos de 2026 identicos; aviso do total = contagem direta em todos os meses).
    Patch guardado por md5: `_fn_conciliacao_resumo` 04aa7a4d… -> eb5f162e…, `fn_conciliacao_status_ano` ab397ac3… -> a7c3ee43…
    (`fn_conciliacao_resumo_mes` 25aa2ac4…, nao tocada). Regua do NJ 2026: 2.073 -> 2.042 ms (mediana de 5).
  · ⚠ NA TELA OS DOIS AVISOS NAO SAO "2a PROVA DO EXTRATO": `frasesDosAvisos` (e por isso `marcaDeAviso`) os PULA, e eles tem
    leitores proprios, `semClassificacaoDaLinha` e `semFornecedorDaLinha` (`src/lib/conciliacao/resumoDoDono.ts`). Sem isso a marca
    ambar da regua acenderia em todo mes com lancamento sem fornecedor. O contador nunca muda cor de mes nem a regua.
  · O DRE: `fn_dre_sem_classificacao(cliente, de, ate, safra, fazenda, cenario)` -> `{qtde, valor_entradas, valor_saidas}` — quanto o
    recorte NAO ve^ por falta de plano (o join com o plano descarta em silencio). Pecuaria: competencia `de`/`ate`; lavoura: a safra
    gravada no lancamento. ⚠ LANCAMENTO SEM PLANO NAO TEM ATIVIDADE (ela vem do plano): o recorte e' o do periodo, nao o da atividade.
  · A LISTA: `fn_conciliacao_sem_classificacao_lista(cliente, mes, conta)` -> `{resumo {qtde, valor_entradas, valor_saidas,
    com_sugestao, sem_sugestao, aguarda_conta}, linhas [...]}`, o MESMO recorte do aviso. SUGESTAO = `fn_classificacao_resolver_contexto`
    (regra, apelido, plano), so' com conta ATIVA e do MESMO tipo do lancamento; nenhum segundo motor. ⚠ O RESOLVEDOR NAO COBRE TEXTO
    DE EXTRATO: os apelidos sao do texto do SUBCENTRO da planilha e nao ha' regra por descricao (3 regras, nenhuma por texto) — no NJ
    set/26, 0 de 59 com sugestao. As duas leituras recusam com 42501 (sem usuario inclusive).
  · A TELA (so' tela, aceita pelo Chat em 06/10): na Conciliacao, o mes leva um CONTADOR VERMELHO
    com a quantidade do total do dono (`TomDoMes.contador`, posicao absoluta: nao muda cor nem geometria — 64,5 x 28 com e sem); o
    card Status ganha o bloco "N / sem classificação / fora do DRE ▲ ▼ / Classificar agora" e o ambar "N sem fornecedor"; a linha
    da conta leva o contador vermelho NO RECUO de 18px (na celula do lapis ele alargava a coluna e quebrava 4 nomes em duas
    linhas, medido a 1.126). O "🔴 N sem classificação" antigo e `derivarDetalhePendencias` sairam da Conciliacao; o dialogo
    antigo ficou so' com os duplicados entre origens. MODAL `SemClassificacaoModal` (`src/components/conciliacao/`): tamanho
    fixo (1090 x 100vh−32), um scrollport (a lista, cabecalho preso nela), cartoes e rodape do `resumo` do banco, filtros,
    ordem por coluna (padrao valor desc), linha de 18px (Data · Historico · Valor ▲▼ · Falta S F C · Fornecedor · Subcentro ·
    acao), seletores da casa (`FavorecidoSelect`, `PlanoSubcentroSelect`), Subcentro so' com conta do PLANO (`contasDoPlano`:
    fora os `dividendo-<uuid>` e os legados sem id). ⚠ GRAVAR E' `fin.editarLancamento` (o escritor do modal do lancamento,
    `silent`), com o form que nasce da linha INTEIRA do banco (`formParaClassificar`, `src/lib/conciliacao/semClassificacao.ts`);
    "desfazer" regrava `formDoLancamento(antes)`; depois de cada gesto `notificarLancamentosMudaram` — a Conciliacao rele sem F5.
    Clique na linha abre o `LancamentoV2Dialog`. DRE: `AvisoDreSemClassificacao` (`src/components/agri/`), slot FIXO de 18px sob
    os controles, numeros em tabela, "classificar na Conciliação →" so' para quem tem a tela (`onIrParaConciliacao`, do `V2Index`).
    ⚠ PARA OS SELETORES BASTA O PLANO CARREGADO (`planoPronto`): cliente sem fornecedor ou safra (o Teste) tem catalogo vazio de
      verdade, e esperar os quatro deixava os seletores apagados para sempre (achado no navegador).
    ⚠ O DESFAZER NAO DEVOLVE `editado_manual` nem `updated_at/by` (o escritor os carimba) — classificacao, fornecedor, fazenda e
      safra voltam. ACEITO pelo Gabriel (06/10). "Classificados nesta sessão" e' a unica contagem local (estado do modal).
    ⚠ O AVISO DO DRE E' UM NUMERO SO' E CONTA OS DIVIDENDOS POR TEXTO (decisao do Gabriel, 06/10): eles saem da conta quando
      ganharem conta no plano (CONC-DIVIDENDOS-PLANO-01, aguardando a aprovacao dos 11 nomes); o banco nao muda por isso.
    PROVA DO GESTO (cliente Teste, 06/10, desfeita): lancamento sintetico de 12,34 sem plano — aceitar gravou o plano 6020 e as
      copias, e SEM F5 o contador saiu da regua, do card e da linha (0 toasts); desfazer devolveu plano e copias a nulo e o
      contador voltou a 1; o lancamento foi apagado e ficaram 2 linhas de `audit_log` no Teste (auditoria nao se apaga).
  Teste: `supabase/tests/conc_sem_classificacao_01_test.sql` (T0–T9, sintetico no cliente Teste; 10 mutacoes do banco mortas). Os
  sinteticos de `conc_saldo_uma_regua_01`, `_01b`, `conc_status_saldo_01a` e `conc_interna_separada_01a` passaram a nascer COM plano
  e fornecedor (sao testes de saldo; sem isso acendiam os avisos novos).
  ⚠ MEDIDO (06/10): os 567 "Dividendos por texto" (5 clientes, 11 textos) vem de `financeiro_dividendos` — o seletor oferece
    "Dividendos <nome>" com id sintetico `dividendo-<uuid>`, que nao e' conta do plano; nome que coincide com conta global resolve
    pelo gatilho, os 11 que nao coincidem ficam sem chave. Santa Rita ja' tem conta POR CLIENTE para cada nome (17160–17230).
  ⚠ DIVIDAS: SEM-CLASSIFICACAO-REGRA-UNICA-02 (as cinco regras do front que ainda decidem por texto — `isSemClassificacao`,
    `lancamentoCru`, `ehCru`, `distribuicaoEconomica`, `derivarPendenciasGerenciais` — mais `derivarDetalhePendencias`, que saiu
    da Conciliacao e segue na `V2MesaOperacional`) · CONC-DIVIDENDOS-PLANO-01 (criar as contas e migrar os Dividendos por texto) ·
    CONC-SUGESTAO-EXTRATO-01 (sugestao de classificacao a partir do TEXTO DO EXTRATO do banco: hoje 0 sugestoes nos crus, o
    resolvedor so' casa texto de planilha) · CONC-SEM-CLASSIFICACAO-NAO-PROVADO-01 (o modal a 1.126 x 523 — foi medido a 579;
    "Aceitar as N sugestões", o clique na linha abrindo o modal do lancamento e a recusa escrita ao lado do botao, no navegador;
    o aviso do DRE da LAVOURA preenchido; perfil nao admin; o ramo da regua sem `contas_com_aviso`, `|| r.avisos`, sem teste
    sintetico) · CONC-IMPORT-AGNALDO-TESTE-DERIVA-01 (`conc_import_banco_agnaldo_01a_test.sql` falha em P2, "0 de 81 lancamentos
    iguais a dados_anteriores"; MEDIDO em 06/10 com os corpos de ANTES da 20261027193900 repostos num ensaio revertido — md5
    04aa7a4d… e ab397ac3… —: falha IGUAL; e' deriva do dado do Agnaldo, anterior a este PR).
  ⚠ COMPARAR ANTES x DEPOIS E' EM WORKTREE SEPARADO, NUNCA `git stash` (usei uma vez neste PR para o TSC; voltou limpo, nao repetir).
- ⚠ "FALTA SALDO · N CONTA(S)" NO LUGAR DO "—", E NENHUMA DATA QUE NINGUEM INFORMOU (CONC-TOTAL-SEM-SALDO-01b, Gabriel 04/10, so'
  tela). Ausencia de saldo nunca aparenta "confere"; a tela diz o que falta. ⚠ "falta SALDO", nao "falta extrato": a coluna Extrato
  e' o saldo INFORMADO da conta, nao o arquivo do banco.
  · A FRASE TEM UM DONO: `fraseDoMotivo` (`src/lib/conciliacao/resumoDoDono.ts`), caso `contas_sem_saldo` — "falta saldo · 1 conta" /
    "falta saldo · N contas", com N = a `qtde` do motivo (nunca contado na tela) e os nomes das contas no `title`, um por linha.
    `fraseFaltaSaldo(linha)` a devolve SO' com a diferenca NULA e o motivo presente; fora disso, nulo.
  · ONDE APARECE, a mesma frase: card Status (pelo `frasesDoStatus`, no lugar do motivo cru); coluna Diferenca do Total e do
    subtotal por tipo; e a linha "Diferença de saldo (o mês fecha?)" do Resumo. Um componente so', `FaltaSaldo`
    (`ConciliacaoBancariaTab.tsx`), na cor do status PENDENTE da paleta (`STATUS_COR.pendente`) — nunca verde nem vermelho.
    Diferenca nula SEM o motivo continua "—" (caso real: o subtotal Permuta do NJ set/26); a coluna Extrato continua "—".
    Medido a 1.135 (Santa Rita out/25 e NJ out/26): a frase cabe em UMA linha — Total 98,8–104,5px de 104–119 uteis, subtotal
    94,1–99,5; linhas de 21,75 e 20px como antes; 0 estouros, sem rolagem horizontal. No Resumo, com a frase a dica "(o mês
    fecha?)" SAI do rotulo (rotulo + dica + frase pediam ~286px dos 251 do card e o rotulo quebrava em duas linhas): linha de
    24,5px com e sem a frase. No card Status (113px) a frase quebra em duas linhas, como as outras frases dele.
  · DECISOES ACEITAS (Gabriel, 05/10): (1) em "Todas as contas" a data do saldo e o rodape somem SEMPRE, mes conciliado
    inclusive — o agregado nao tem data unica, e cada conta mostra a sua na propria linha; (2) a dica "(o mês fecha?)" sai do
    rotulo quando a frase aparece.
  · SEM DATA FANTASMA: o "(dd/mm)" do "Saldo extrato" e a frase "A diferença compara o saldo do extrato de dd/mm." so' existem
    quando o DONO devolve `saldo_extrato_data` para a linha aberta. Antes a tela caia no fim do mes (`fimDoMes`). ⚠ O AGREGADO
    NUNCA TEM DATA DE SALDO: em "Todas as contas" o rotulo e' so' "Saldo extrato" e o rodape some, tambem no mes conciliado.
  · Fixture real: `src/lib/conciliacao/semSaldo.fixture.json` (agregados lidos do dono vivo em 05/10: Santa Rita out/25, NJ out/26 e
    NJ set/26); o `TOTAL_NJ` de `conciliacaoDono.test.tsx` passou ao contrato do 01a (extrato e diferenca nulos + o motivo).
    `statusSaldo.fixture.json` e `resumoMes.fixture.json` nao mudaram: sao linhas de CONTA, que o 01a nao alterou.
- ⚠ A TELA ESCREVE O SALDO NO STATUS E O EXTRATO NA "2a PROVA" (PR-CONC-STATUS-SALDO-01b, so' tela). `resumoDoDono.ts` le'
  `avisos` (conta, tipo, total, status do ano e as contas citadas em `contas_nao_conciliadas`), sem cast. AVISO TRATADO COMO MOTIVO
  E' DEFEITO (mutacao derruba 11 testes).
  · `frasesDoStatus` = os `motivos` + "confere em todos os dias" (conta COM extrato e SEM o AVISO `dias_com_diferenca`) +
    "conferida com <nome>" (o par). `frasesDosAvisos` = a 2a prova, sem o ponteiro do par; `marca` = pede olho (ambar), e
    `sem_extrato` e' neutro. `marcaDoPar` e o dia do link de cada conta leem `avisos`.
  · CARD STATUS: veredito e frases do saldo; abaixo, so' quando ha' aviso, o bloco "2ª prova · extrato" (`segunda-prova`) em
    ambar/neutro, NUNCA vermelho; "N dias com diferenca" segue o link da Conferencia no primeiro dia. Conta sem aviso = a tela de
    antes. No Todas, "N contas com aviso do extrato" = `contas_com_aviso.qtde_alem_sem_extrato` (some com zero), o `title` com a
    contagem por aviso em ORDEM FIXA (`ROTULO_AVISO`) — ⚠ a ordem das chaves de um objeto JSON muda com o transporte (o PostgREST
    manda na ordem do jsonb, o canal SQL em alfabetica): frase montada de chaves de objeto ordena por lista propria.
  · MARCADOR AMBAR (`marcaDeAviso`: linha CONCILIADA com aviso ALEM de `sem_extrato` — 5.068 das 5.137 conta-meses tem
    `sem_extrato`, marcar por ele pintaria tudo): na regua, `TomDoMes.marca` do `SeletorPeriodo` (ponto de 5px, posicao absoluta;
    chip 65x28 com e sem ele, medido a 1.135); em "Saldos por conta", ponto de 4px SOBRE o ponto de status (zero pixel a mais na
    coluna Conta). A cor do mes e do ponto continua sendo o status.
  · OCULTAS: a interna fica visivel quando o status DELA nao e' conciliado OU o `par_status` (o da mae) nao e'.
  Fixture real: `src/lib/conciliacao/statusSaldo.fixture.json` (linhas do dono lidas do proto depois da 20261027192700).
- ⚠ LAYOUT DE "SALDOS POR CONTA" (PR-CONC-SALDOS-LAYOUT-01, Gabriel 03-04/10, so' apresentacao, `ConciliacaoBancariaTab.tsx`):
  SEM a faixa amarela de orientacao ("Informe o saldo final REAL…"). Cabecalho das colunas NAVY opaco em duas camadas
  (`bg-primary` + 10% de `primary-foreground`), 9,5px, "Conta" a' esquerda e os valores a' direita. Total em `bg-card`, rotulo e
  valores a 10,5px bold. Faixa de grupo com rotulo a 10px `text-primary` (o cinza em duas camadas ficou). Contas a 10px com
  recuo de 18px; a SELECIONADA e' `bg-primary/10` (classe, nao estilo inline) + filete de 3px por sombra interna na primeira
  celula + nome em `font-semibold text-primary`; as demais a 0,3. NEGATIVO E' VERMELHO em Sistema E em Extrato nos tres niveis,
  uma funcao so' (`corDoValor`); a Diferenca nao mudou. A celula do lapis nao tem padding vertical nem entrelinha (o botao de
  16px levava a linha a 21,5px). Medido a 1.135 / 1.280 / 1.366: cabecalho 18,25 · Total 21,75 · grupo 20 · conta 20,3–20,8;
  0 valores estourando ou colando; sticky intacto (thead em 33,5, faixa de grupo em 73,5).
  ⚠ EMENDA DE SUBPIXEL ENTRE CELULAS COM FUNDO: com `table-layout:auto` as celulas caem em posicao fracionaria e entre duas
    vizinhas aparece um fio do que esta' atras. Fundo no `tr`/`thead` NAO resolve (o navegador pinta o fundo da linha celula a
    celula). Conserto: 1px de sombra EXTERNA para cada lado na COR COMPOSTA do fundo (`color-mix` dos dois tokens da camada:
    90% primary + 10% primary-foreground no cabecalho; 85% card + 15% muted-foreground na faixa de grupo, `SOMBRA_FAIXA_GRUPO`).
    Sombra na cor de UMA camada so' risca a vizinha; sombra nao ocupa espaco (colunas e alturas identicas antes x depois).
  ⚠ A TELA DESTA MAQUINA TEM 1.168px: 1.280 e 1.366 se medem num IFRAME da propria aplicacao com esse viewport (mesmo login).
- ⚠ FUNCAO SECURITY DEFINER EXPOSTA A `authenticated` QUE RECEBE ID DE LINHA RESOLVE O CLIENTE E CHAMA `tenant_ok` ANTES DE
  ESCREVER (PR-SEG-TENANT-VARREDURA-01A, 03/10, so' banco; migration 20261027192400, ⚠ registrada como 20261003215217; ledger =
  arquivo, md5 b856a932…). SECURITY DEFINER atravessa a RLS: sem a guarda no corpo, quem souber o uuid de uma linha de outro
  cliente escreve nela. MEDIDO antes do conserto, em ensaio com rollback: o gestor da NJ (membro so' da NJ) desfez vinculo,
  vinculou, casou, desfez e refez grupo, reverteu desconsideracao e CRIOU UM LANCAMENTO DE R$ 553.134,18 no Agnaldo; sem usuario
  nenhum (`auth.uid()` nulo) as funcoes tambem gravavam. Nelas `auth.uid()` so' registrava o autor.
  · A FORMA DA GUARDA (a mesma nas 8, no inicio do corpo, antes de qualquer leitura de negocio, lock ou escrita): um bloco
    `DECLARE g_cli uuid[]` que junta o `cliente_id` de TODA linha recebida por parametro (subconsulta escalar: linha inexistente
    ou id nulo vira NULL), e recusa com `RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501'` se (a) alguma nao
    existe, (b) nao sao todas do MESMO cliente, (c) `NOT COALESCE(public.tenant_ok(cliente), false)`. A recusa e' UMA SO' e nao diz
    se a linha existe; sem usuario, 42501 (nunca o "pula se `auth.uid()` e' nulo"). Array e JSON de ids: TODOS os elementos.
    Vale tambem para o `p_simular`, que le'. Assinatura, retorno, SECURITY DEFINER, search_path e ACL nao mudaram.
  · AS 8 (md5 antes -> depois): `fn_vincular_extrato_lancamento` c03d4cb4 -> 6dbfb0dc (extrato + lancamento) ·
    `fn_vincular_grupo_conciliacao` 5cf79977 -> e7fa603e (extrato + todos os lancamentos) · `fn_desfazer_vinculo_extrato`
    07af033c -> 79a1cf25 · `fn_desfazer_grupo_conciliacao` 06558026 -> 37d02aed (os vinculos do grupo e os extratos deles; grupo sem
    vinculo nenhum = sem acesso) · `fn_espelho_casar` da53db48 -> cd21bf8d (extrato + o lancamento de todos os itens) ·
    `fn_espelho_casar_n1` 6bb6c7d3 -> d86e57ce (lancamento + todos os extratos) · `fn_criar_lancamento_de_extrato` 2ea6be7a ->
    79521304 (extrato + fazenda, fornecedor, safra e outra conta QUANDO INFORMADOS — cadastros POR CLIENTE, nenhum e' global; o
    plano de contas nao e' parametro, sai do texto do subcentro ou do 18010 global) · `fn_reverter_desconsideracao_extrato`
    099101c8 -> 7501026a.
  · O QUE MUDA PARA QUEM CHAMA: com dado do proprio cliente (e para o admin), nada — retornos e linhas gravadas identicos
    (9 passos x 4 cenarios, antes x depois). Id inexistente e pedido com clientes misturados, que antes devolviam "extrato nao
    encontrado" / `cliente_divergente` / `lancamento_nao_encontrado`, agora dao 42501. As telas so' EXIBEM essas mensagens
    (`MOTIVO_CASAR_LABEL` em `EspelhoConciliacaoTab.tsx`, usado tambem pelo `CasarComBancoModal`); a unica que decide algo e'
    `soma_nao_bate`, que nao mudou.
  · CHAMADORES: nenhum trigger nem cron chama as 8; quem chama sao RPCs de usuario (`fn_extrato_conciliar_mes`,
    `fn_vincular_exatos_mes`, `fn_transferencia_de_extratos`, `fn_transferencia_segunda_ponta`, `fn_classificacao_split_substituir`,
    `fn_classificacao_desfazer_split` e a propria `fn_espelho_casar`). ⚠ TESTE SQL QUE CHAMA UMA DAS 8 SIMULA UM USUARIO
    (`request.jwt.claims`): sem ele, 42501. O `pr_conc_grupo_01_test.sql` passou a simular o admin 7bd0b6ad.
  · CUSTO: +0,5 a 0,7 ms por chamada (mediana de 20 na mesma sessao, como `authenticated`: n1 em simulacao 0,05–0,09 -> 0,68–0,80
    ms; desfazer vinculo 0,9–1,3 -> 1,4–1,8 ms; vincular 2,2–2,9 -> 2,8–3,5 ms). O teto do PR e' ABSOLUTO, +2 ms por chamada
    (decisao do Gabriel; +20 % nao cabe em funcao de 1 ms). Lote, no pior conta-mes (NJ Banco do Brasil mai/26, 262 movimentos):
    `fn_vincular_exatos_mes` com 239 pares 421 -> 536 ms; `fn_extrato_conciliar_mes` criando os 23 restantes 644 -> 641 ms; um
    lote de 30 sem nenhum par (o `LOTE_CONCILIAR` da tela) 958 -> 957 ms.
  ⚠ PENDENCIA (PR proprio): OTIMIZAR `tenant_ok`. Medido (1.000 chamadas): `tenant_ok` 0,135 ms para membro e 0,076 ms para admin,
    contra 0,023 ms de uma consulta direta a `cliente_membros`; resolver o cliente das linhas custa 0,022 ms. Quase todo o custo
    da guarda e' dele (duas funcoes SQL SECURITY DEFINER encadeadas), e ele e' chamado por linha em toda policy.
  ⚠ PRE-EXISTENTE, sem relacao com a guarda: `fn_extrato_conciliar_mes` SEM `p_limite` criando 262 lancamentos numa chamada leva
    ~8,8 s (antes e depois) — acima do teto de 8 s do `authenticated`. A tela chama em lotes de 30; quem chamar sem limite estoura.
  ⚠ `cliente_membros` TEM LINHAS ORFAS: 2290944b (admin, 4 clientes), a91962cd (gestor) e 0e422659 (campo), os dois ultimos da Vera,
    nao existem em `auth.users` — a Vera nao tem nenhum membro com usuario real. Achado ao simular usuario no teste; nao alterado.
  ⚠ O QUE RESTA DA VARREDURA (FASE 0 de 03/10: 270 SECURITY DEFINER, 202 expostas a `authenticated`, 142 com guarda no corpo POR
    TEXTO — nao auditadas uma a uma —, 58 sem guarda: 32 de escrita e 26 de leitura; eram 8 a mais antes deste PR): 01B leitura das
    tres telas (`fn_extratos_espelhados`, `get_anos_financeiro_v2`, `fn_zoot_categoria_mensal`, `get_status_pilares_fechamento`) e
    `refresh_zoot_cache` (3 assinaturas, escrita) · 01C revogar EXECUTE: `anon` em 3 DEFINER (`fn_recorrencia_cancelar`,
    `oc_ajustar_valor_compromisso`, `oc_salvar_abate`) e em 15 INVOKER, e `authenticated` nas sem chamador no front · 01D escrita
    agricola (barter, mandioca, graos, estoque, locais) e `fn_promover_staging`, ~18 corpos · 01E leitura restante (DRE pecuaria,
    painel de safra, estoque de graos, auditorias), ~20 corpos · 01F PERFIL (decisao do Gabriel): `tenant_ok` e as policies nao
    distinguem leitura de escrita — perfil `leitura` ou `campo` do proprio cliente grava. Tabelas: 155 com `cliente_id`, 0 com RLS
    desligada, 0 com policy `true`.
  Provas: travessia NJ -> Agnaldo e Agnaldo -> NJ, 42501 nas 8 (9 passos cada), estado do cliente alvo identico; 9 pedidos mistos ou
  inexistentes, 42501 e nada escrito; sem usuario, 42501; repetidas no banco VIVO depois de aplicar. Teste:
  `supabase/tests/seg_tenant_varredura_01a_test.sql` (D1–D3 com contas, extratos e lancamentos sinteticos em dois clientes reais;
  no corpo sem a guarda ele cai em "D1 travessia"). Dos 26 testes SQL de conciliacao, 25 dao o MESMO resultado antes x depois
  (13 passam; 12 ja' falhavam no dado de hoje, por deriva do dado, sem relacao com este PR) e o 26o (`pr_conc_grupo_01`, script
  de psql) passa com o usuario simulado.
- ⚠ LEITURA SECURITY DEFINER TAMBEM RECUSA COM 42501, NUNCA DEVOLVE VAZIO (PR-SEG-TENANT-VARREDURA-01B, 03/10, so' banco;
  migration 20261027192500, ⚠ registrada como 20261003221228; ledger = arquivo, md5 851fc6c7…). Duas funcoes, as unicas das 7 da
  leva sem chamador sem usuario:
  · `get_anos_financeiro_v2(cliente)` 76507034 -> be48858d: `tenant_ok(cliente)` antes de ler. MEDIDO antes: o gestor da NJ lia os 11
    anos do Agnaldo, o do Agnaldo os 25 da NJ, e sem usuario lia tudo.
  · `fn_extratos_espelhados(cliente, conta, mes)` afbded55 -> a3da2905: `tenant_ok(cliente)` E a conta tem de ser DESTE cliente
    (`financeiro_contas_bancarias.cliente_id`), nem o admin cruza os dois. MEDIDO antes: usuario de outro cliente ja' era recusado,
    mas POR TABELA (a `fn_caixa_sistema_pontas` que ela chama) e com codigo CBLOC; sem usuario lia tudo (262 movimentos e 263
    lancamentos da NJ); e cliente X + conta de Y devolvia o NOME da conta de Y com as listas vazias. A FASE 0 a listou como "sem
    guarda" por ler so' o corpo dela — ⚠ GUARDA SE MEDE CHAMANDO, nao lendo o corpo: funcao sem guarda propria pode recusar por
    quem ela chama, e funcao com guarda pode pular (`auth.uid() IS NOT NULL AND NOT …`).
  · A LINGUAGEM PASSOU DE sql A plpgsql (LANGUAGE sql nao tem RAISE); a consulta de cada uma e' a de antes, byte a byte (o gerador
    confere que o corpo antigo esta' CONTIDO no novo). `get_anos` leva `#variable_conflict use_column` (o `ano` do ORDER BY e' a
    coluna). `fn_extratos_espelhados` leva `SET plan_cache_mode = force_custom_plan` (a regra do PR-CONC-CAIXA-PONTAS-PLANO-HOTFIX).
    Assinatura, retorno, STABLE, SECURITY DEFINER, search_path e ACL nao mudaram.
  · TEMPO, ⚠ MEDIDO NO MODO EM QUE A TELA CHAMA (cada chamada um comando de topo, como o PostgREST): `fn_extratos_espelhados` no
    pior conta-mes (NJ Banco do Brasil mai/26) 134–137 ms antes x 133–137 ms depois; `get_anos` NJ 21,9–22,3 x 21,8–22,5 ms. Chamada
    num laco de plpgsql a funcao SQL antiga reaproveitava o plano e dava 110 ms — nesse modo o corpo novo "sobe" 35 ms, e e'
    artefato da medicao (a variante `force_generic_plan` tambem da' 110 ms: fica como opcao se um dia for preciso).
  · TELAS: nenhuma chama com cliente ou conta nulos (`enabled: !!clienteId && !!contaId`; `if (!clienteId)`). `useFinanceiroV2.ts`
    IGNORA o erro de `get_anos_financeiro_v2` e cai na leitura direta de `financeiro_lancamentos_v2`, que segue sob RLS — nao vaza,
    e a tela nao mudou. `EspelhoConciliacaoTab`/`TabelaExtratoDoMes` lancam o erro para o `useQuery`.
  Provas: travessia nos dois sentidos, 42501 nas duas; 5 cruzamentos (conta de outro cliente, inexistente, nula; cliente nulo) 42501;
  sem usuario 42501; para o membro e para o admin o retorno e' IDENTICO por md5 (NJ: anos + 34 conta-meses de espelhados; Agnaldo:
  anos + 5), no ensaio e de novo no banco vivo. Teste: `supabase/tests/seg_tenant_varredura_01b_test.sql` (no corpo sem a guarda
  ele cai em "T1 ux: anos de Y").
  ⚠ 01B2 [FEITO no PR-SEG-TENANT-VARREDURA-01B2 — ver a regra "INTERNO x PUBLICO"; o texto abaixo e' o desenho de antes]: `refresh_zoot_cache` (3 assinaturas), `fn_zoot_categoria_mensal` e
    `get_status_pilares_fechamento` tem chamador SEM USUARIO e nao aceitam a guarda direta. Para cada uma: corpo interno `_fn_…`
    (o corpo de hoje, SEM EXECUTE para `authenticated`) + RPC publica de MESMO nome e assinatura, so' com a guarda e o repasse;
    cron, triggers e funcoes internas chamam a interna. 5 FUNCOES NOVAS (`_fn_refresh_zoot_cache` x3, `_fn_zoot_categoria_mensal`,
    `_fn_get_status_pilares_fechamento` — nomes a confirmar no briefing). 6 CHAMADORES A ALTERAR: `fn_zoot_cache_reconstruir_sujos`
    (o cron `zoot_cache_sujo_reconstruir`), `trg_fn_zoot_cache_reconstruir` (trigger deferido em `zoot_cache_sujo`),
    `fn_zoot_cache_rebuild`, `guard_lancamento_mes_fechado_p1` (trigger em `lancamentos`), `can_close_valor_rebanho` e
    `get_status_pilares_ano`; e as tres `refresh_zoot_cache` chamam a interna da categoria mensal. DECISAO DO GABRIEL:
    `guard_lancamento_mes_fechado_p1` vira SECURITY DEFINER com search_path fixo e chama a interna (ela so' le' o status do mes da
    propria linha). `trg_fn_guard_lancamento_mes_fechado_p1` cita a funcao mas nao esta' em trigger nenhum — conferir.
    RISCO ABERTO ATE' LA' (P0 de 03/10, em ensaio): o gestor de um cliente le' o rebanho por categoria (83 linhas) e o status dos
    pilares de uma fazenda de outro cliente, `can_close_valor_rebanho` responde, e as tres `refresh_zoot_cache` executam e regravam
    o cache dele; sem usuario, idem.
  ⚠ `fn_caixa_sistema_pontas` SEGUE COM A GUARDA "PULA SE `auth.uid()` E' NULO" (`IF auth.uid() IS NOT NULL AND NOT tenant_ok`,
    recusa com codigo CBLOC) e tem EXECUTE para `authenticated`: chamada direta sem usuario le'. Quem a chama: `fn_extratos_espelhados`
    (agora guardada) e `_fn_conciliacao_dias_conta` (interna, so' service_role, atras de `fn_conciliacao_resumo_mes` e
    `fn_conciliacao_status_ano`, que tem a MESMA forma de guarda). Nenhum trigger nem cron a chama; o unico uso legitimo sem usuario e'
    o canal SQL (testes e ensaios). Sao 4 funcoes com essa forma no banco — fica para o 01B2/01C.
  ⚠ O QUE RESTA DA VARREDURA depois deste PR: 01B2 (acima, 5 corpos) · 01C revogar EXECUTE (`anon` em 3 DEFINER e 15 INVOKER;
    `authenticated` nas sem chamador no front) e a guarda que pula sem usuario · 01D escrita agricola e `fn_promover_staging` (~18)
    · 01E leitura restante (~20) · 01F perfil.
- ⚠ INTERNO x PUBLICO: FUNCAO COM CHAMADOR SEM USUARIO NAO LEVA A GUARDA NO CORPO (PR-SEG-TENANT-VARREDURA-01B2, 03/10, so' banco;
  migration 20261027192600, ⚠ registrada como 20261003223419; ledger = arquivo, md5 c6ae0e09…). Quando uma RPC exposta a
  `authenticated` tambem e' chamada por cron, trigger ou funcao interna (sem `auth.uid()`), a guarda de tenant no corpo derrubaria
  o cron e a gravacao sem usuario. O desenho: uma INTERNA `_fn_…` com o corpo de antes, SECURITY DEFINER, sem EXECUTE para PUBLIC,
  anon e authenticated (so' service_role e o dono); e a PUBLICA, de MESMO nome, assinatura, retorno, volatilidade e ACL, vira so'
  `DECLARE v_cli uuid := (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = <fazenda>)` + `IF v_cli IS NULL OR NOT
  COALESCE(public.tenant_ok(v_cli), false) THEN RAISE … '42501'` + o repasse. Cron, triggers e funcoes internas chamam a INTERNA.
  · INTERNAS (6): `_fn_zoot_categoria_mensal(uuid, integer, text)` 5358f873 e `_fn_status_pilares_fechamento(uuid, text)` 84f5f2e3
    (o MESMO md5 do corpo de origem: byte a byte) · `_fn_refresh_zoot_cache(uuid, integer)` 0fe8fda6, `(uuid, integer, text)`
    0c8d3c89, `(uuid, integer, integer)` 83074104 (o corpo de antes chamando `_fn_zoot_categoria_mensal`) ·
    `_fn_can_close_valor_rebanho(uuid, text)` a37017ef (chama `_fn_status_pilares_fechamento`).
  · PUBLICAS (6), md5 antes -> depois: `refresh_zoot_cache(uuid, integer)` c6a682c7 -> d3427246 · `(uuid, integer, text)` 40de5b72 ->
    cfe5d4f9 · `(uuid, integer, integer)` d127294c -> 0653e105 · `fn_zoot_categoria_mensal` 5358f873 -> 63b66fdc (era LANGUAGE sql;
    a publica e' plpgsql com `RETURN QUERY SELECT * FROM` a interna, que segue sql) · `get_status_pilares_fechamento` 84f5f2e3 ->
    c94a2c54 · `can_close_valor_rebanho` b5d3ec00 -> f78602f3. Fazenda inexistente ou NULA tambem da' 42501 (antes respondiam: a
    dos pilares devolvia o objeto com `fazenda_id` nulo); nenhuma tela chama assim — todas barram `!fazendaId` e `'__global__'`, e o
    modo Global percorre as fazendas REAIS do cliente (`useStatusPilaresLote`, `ResOpAuditoria`).
  · CHAMADORES TROCADOS PARA A INTERNA (5): `fn_zoot_cache_reconstruir_sujos` 602664a8 -> 336f7f4f (o cron
    `zoot_cache_sujo_reconstruir`) · `trg_fn_zoot_cache_reconstruir` be6899e0 -> 8e5ea09a (trigger deferido em `zoot_cache_sujo`) ·
    `get_status_pilares_ano` 46ad7cc4 -> 746e8600 (JA' tinha guarda propria — `nao_autenticado` / `sem_permissao`, 42501 — e ela NAO
    mudou; so' as duas chamadas) · `guard_valor_rebanho_requer_p1_fechado` 96ee64ae -> 8fbec5c8 (trigger em
    `valor_rebanho_fechamento`, ja' era SECURITY DEFINER; achado so' neste PR) · `guard_lancamento_mes_fechado_p1` c01f38bc ->
    1b71cb89 (trigger em `lancamentos`): VIROU SECURITY DEFINER com `search_path = public` (decisao do Gabriel) — conferido no
    corpo: ela so' le' o status do mes da propria linha (NEW/OLD) pela interna e recusa; nao le' nem escreve mais nada.
  · NAO MUDARAM: `fn_zoot_cache_rebuild` (guarda propria e usuario presente; segue chamando a `refresh_zoot_cache` PUBLICA, que o
    deixa passar — provado com o gestor do Agnaldo) e `fn_zoot_cache_ensure` (INVOKER, chama a rebuild).
    `trg_fn_guard_lancamento_mes_fechado_p1` cita a publica dos pilares mas NAO esta' em trigger nenhum: codigo morto, nao tocado
    — se um dia for ligada, quebra sem usuario.
  · MEDIDO ANTES (P0, ensaio): o gestor da NJ lia a categoria mensal (159 linhas), os pilares e o `can_close` de uma fazenda do
    Agnaldo e executava as tres `refresh_zoot_cache` nela; o do Agnaldo, o mesmo na NJ; sem usuario, tudo respondia.
  · PROVAS (ensaio e de novo no banco VIVO): travessia nos dois sentidos, 42501 nas seis publicas (e `sem_permissao` no status do
    ano), cache do alvo identico; para o membro e para o admin o retorno e' IDENTICO por md5 em TODAS as fazendas de cada cliente
    (NJ 5 fazendas x 7 chamadas, Agnaldo 3 x 7) e o cache depois de cada refresh e' igual ao de antes; internas: "permission
    denied" para `authenticated` e `anon`; cadeia sem usuario viva (um buraco aberto no cache: o trigger deferido, disparado com
    `SET CONSTRAINTS ALL IMMEDIATE`, e a varredura do cron o reconstroem e apagam a marca); trava de mes fechado em `lancamentos`
    com as MESMAS mensagens, com e sem usuario (update estrutural, delete e insert recusados em ago/26; update nao estrutural e
    insert em mes aberto passam).
  · TEMPO: repasse de +0,31 a +0,38 ms nas `refresh` e na categoria mensal (publica x interna alternadas na mesma sessao, entrada
    leve) e +0,12 a +0,16 ms em pilares e `can_close`; nas chamadas de 670 ms a diferenca some no ruido (−2,5 a +6 ms, os dois
    sinais). ESCRITA EM `lancamentos`: ⚠ antes x depois em ensaios SEPARADOS nao mede (ruido de ±40 % entre rodadas); medido A/B
    NA MESMA transacao, trocando a funcao do trigger a cada serie (8 series de 200 updates e 50 inserts de cada lado): updates
    −2,2 % na mediana (+2,1 % na soma), inserts +0,1 % (−1,1 % na soma) — sem aumento mensuravel.
  Teste: `supabase/tests/seg_tenant_varredura_01b2_test.sql` (T1–T9; tres mutacoes em ensaio caem pela razao certa: publica sem a
  guarda -> T1; a varredura do cron chamando a publica -> T7 "reconstruidos 0"; interna aberta a `authenticated` -> T6). Os tres
  testes SQL antigos que citam os pilares (`pr_oc_estornar_recebimento_01`, `pr_p1_data_fim_01`, `pr_p0b2_area`) ja' falhavam no
  dado de hoje e falham IGUAL depois.
  ⚠ O QUE RESTA DA VARREDURA: 01C revogar EXECUTE (`anon` em 3 DEFINER — `fn_recorrencia_cancelar`, `oc_ajustar_valor_compromisso`,
    `oc_salvar_abate` — e em 15 INVOKER; `authenticated` nas sem chamador no front) e a guarda que PULA sem usuario
    (`fn_caixa_sistema_pontas`, `fn_conciliacao_resumo_mes`, `fn_conciliacao_status_ano` e mais uma) · 01D escrita agricola (barter,
    mandioca, graos, estoque, locais) e `fn_promover_staging`, ~18 corpos · 01E leitura restante (DRE pecuaria, painel de safra,
    estoque de graos, auditorias), ~20 corpos · 01F PERFIL (`tenant_ok` e as policies nao distinguem leitura de escrita).
- ⚠ NENHUMA FUNCAO DO SISTEMA E' EXECUTAVEL SEM LOGIN, E FUNCAO NOVA NASCE FECHADA (SEG-TENANT-VARREDURA-01C, Gabriel 04/10, so'
  banco, so' permissoes — NENHUM corpo mudou; migration 20261027192900, ⚠ registrada como 20261004212142; ledger = arquivo, md5
  7bc00df2…). MEDIDO antes: o papel `anon` (quem nem logou) executava 118 das 441 funcoes do `public`, sempre por heranca de
  PUBLIC: 3 SECURITY DEFINER (`fn_recorrencia_cancelar`, `oc_ajustar_valor_compromisso`, `oc_salvar_abate`), 23 INVOKER, 57 de
  trigger e 35 de extensao. Nenhuma gravava ou lia dado sem usuario (as DEFINER recusam no corpo; as INVOKER batem em "permission
  denied for table", `anon` nao tem privilegio em tabela nenhuma do `public`), mas a porta estava aberta e a lista crescia sozinha.
  · REGRA 1 — FUNCAO DO SISTEMA NO `public` NAO E' EXECUTAVEL POR `anon` NEM POR PUBLIC. 118 -> 35: as 83 do sistema (3 + 23 + 57)
    levaram `REVOKE EXECUTE … FROM PUBLIC, anon` e `GRANT … TO authenticated, service_role`, nomeadas uma a uma (guarda de
    origem: 83 e o md5 da lista, ou 0). `authenticated` (359) e `service_role` (399) ficaram com o MESMO conjunto, por md5; o md5
    do `prosrc` das 441 e' identico.
  · EXCECAO NOMEADA, E SO' ELA: as 35 funcoes de EXTENSAO (`pg_trgm` 31, `unaccent` 4) seguem com PUBLIC — sao biblioteca pura e
    pertencem ao `supabase_admin`, de quem o `postgres` nao e' membro (o REVOKE nelas nao da' erro e nao tem efeito; `ALTER DEFAULT
    PRIVILEGES FOR ROLE supabase_admin` e' recusado, 42501). Extensao nova no `public` aparece no teste (T2).
  · REGRA 2 — FUNCAO NOVA NASCE FECHADA: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (⚠ o
    padrao de PUBLIC e' GLOBAL do papel — o padrao por schema so' ACRESCENTA —, entao vale para funcao que o `postgres` criar em
    qualquer schema) e `… IN SCHEMA public REVOKE … FROM anon`. No `public` a funcao nova nasce so' com `postgres` e
    `service_role`: ⚠ QUEM A EXPOE A' TELA DA' `GRANT EXECUTE … TO authenticated` NA PROPRIA MIGRATION, SENAO A TELA RECEBE
    "permission denied for function" (o checklist de migration, na secao DADO, BANCO E METODO). Isto substitui o "funcao SECURITY
    DEFINER nova nasce com EXECUTE para PUBLIC — fechar a ACL".
  · GUARDA DA LISTA: `supabase/tests/seg_tenant_varredura_01c_test.sql` (roda como `postgres`, termina em RAISE "OK"): T0 o
    detector acha uma funcao aberta de proposito; T1 zero funcoes do sistema executaveis por `anon`, e a falha NOMEIA as que
    achar; T2 so' `pg_trgm` e `unaccent` abertas; T3 funcao nova nasce sem `anon` e sem `authenticated`, com `service_role`; T4
    chamada de verdade como `anon` -> 42501 "permission denied for function", `unaccent` responde. Mutacao (GRANT a `anon` em
    `fn_get_mesa_v2_mode`) cai em T1 com o nome. Rodar depois de toda migration que cria funcao.
  · PROVAS NO VIVO (iguais ao ensaio): `anon` -> "permission denied for function" nas 3 DEFINER e em 16 INVOKER chamadas; com o JWT
    do gestor da NJ as tres seguem chamaveis e a guarda responde como antes (recorrencia inexistente P0001; compromisso da Vera
    42501 "Sem permissao nesta operacao"; abate NJ P0001 "Cenario invalido"; abate do Agnaldo 42501 "Acesso negado"); os cinco
    testes SQL (`seg_tenant_varredura_01a`, `_01b`, `_01b2`, `conc_saldo_uma_regua_01b`, `conc_status_saldo_01a`) OK.
  ⚠ P9 DE NAVEGADOR PENDENTE POR QUEDA DE SESSAO; CONFERIDO DEPOIS DO COMMIT (a sessao caiu por troca de usuario do Gabriel, 2 min
    antes da migration; nao e' efeito dela).
  ⚠ ACHADO, sem corrigir: `fn_recorrencia_cancelar` diz "recorrencia inexistente" (P0001) antes de "acesso negado" — distingue
    id que existe de id que nao existe para quem nao e' do cliente (a regra do 01A e' UMA recusa so').
  ⚠ DIVIDA SEG-AUTHENTICATED-SEM-CHAMADOR-01: 21 funcoes com EXECUTE para `authenticated` SEM CHAMADOR NO FRONT (medido por nome;
    revogar e' decisao caso a caso — algumas sao chamadas por outras funcoes ou pelo arquiteto): `agri_carga_mandioca_completar`,
    `auditar_integridade_classificacao`, `cancel_financeiro_importacao_v2`, `fn_ajustes_sugeridos_mes`, `fn_area_vigente_mes`,
    `fn_auditoria_consistencia_zoot`, `fn_conciliacao_cartoes`, `fn_conciliacao_soberana`, `fn_reativar_vinculo_extrato`,
    `fn_reconciliar_todos_financiamentos`, `fn_saldo_inicial_pasto`, `fn_transferir_vinculo_extrato`, `fn_ws_conciliacao`,
    `fn_zoot_cache_buracos`, `oc_adotar_titulo_financeiro`, `oc_alterar_parcelas`, `oc_criar_rascunho`, `oc_derivar_status`,
    `oc_editar_negociacao`, `oc_limpar_operacao_teste`, `oc_reabrir_para_reconciliacao`.
  ⚠ O QUE RESTA DA VARREDURA: a guarda que PULA sem usuario (`fn_caixa_sistema_pontas`, `fn_conciliacao_resumo_mes`,
    `fn_conciliacao_status_ano` e mais uma — hoje `anon` ja' nao as executa; sobra o canal SQL) · 01D escrita agricola (barter,
    mandioca, graos, estoque, locais) e `fn_promover_staging`, ~18 corpos · 01E leitura restante (DRE pecuaria, painel de safra,
    estoque de graos, auditorias), ~20 corpos · 01F PERFIL (`tenant_ok` e as policies nao distinguem leitura de escrita).
- ⚠ A GRAVACAO DO EXTRATO E' DO BANCO, E O DESFAZER DIZ O QUE FAZ E RECUSA O QUE NAO PODE (PR-CONC-IMPORT-BANCO-01B, 03/10,
  migration 20261027192000, ⚠ registrada como 20261003174631; ledger = arquivo, md5 4966be59…).
  · IDENTIDADE DO MOVIMENTO: `hashMovimento` + a OCORRENCIA entre movimentos de CONTEUDO IDENTICO no arquivo, na ordem dele
    (`hashesDoArquivo`, `src/lib/financeiro/extratoHash.ts`, o unico que numera): a 1a ocorrencia e' o hash de sempre (provado com
    hashes reais do proto; nenhum extrato gravado recalcula diferente), da 2a em diante o conteudo + `|N`. Dois "RENTAB 0,13"
    iguais no mesmo dia sao dois movimentos — e cada um tem a SUA caixa na previa (a caixa, o contador e o selo sao acionados
    pelo hash da linha; com o hash antigo as duas linhas mudavam juntas, o print do Gabriel de 03/10 14:31). O `seq_ocorrencia` da chave natural (conta+data+valor+documento) nao mudou.
  · GRAVACAO: `fn_extrato_importar_arquivo` (cabecalho + movimentos numa transacao, SECURITY DEFINER, `tenant_ok`, conta do
    cliente) e' o UNICO escritor de `extrato_bancario_v2` (medido: nenhum outro INSERT no front, no banco ou em edge function). O
    que ja' existe vivo e' PULADO com o motivo ('hash', 'chave_natural', 'repetido_no_arquivo', 'conflito'), nunca erro; sem
    nenhum movimento novo, nao cria cabecalho. 110 movimentos em 31 ms, 2.000 em 269 ms.
    ⚠ O PostgREST manda `ON CONFLICT("id") DO NOTHING` (alvo = chave primaria, medido em `pg_stat_statements`): o
      `ignoreDuplicates` do supabase-js NAO cobre indice unico que nao seja a PK. Quem precisa de dedupe por outro indice grava
      por RPC.
  · TELA: o resultado vai AO LADO DO BOTAO (`textoDoResultadoDaImportacao`): "Extrato ja' importado anteriormente…" so' quando
    nada entrou, "N importados · M ja' existiam" no parcial; a falha diz o que falhou e "Nada foi gravado" (a gravacao e' uma
    transacao). Erro no rodape da previa (a previa fica); sucesso na linha do "Escolher arquivo".
  · DESFAZER: `fn_extrato_desfazer_arquivo` JA' SIMULAVA (o `DesfazerArquivoModal`, aberto pelo "Ver importacoes", sempre
    mostrou o relatorio da RPC). O que mudou: a simulacao informa o periodo real, os movimentos por mes, as conciliacoes, os
    lancamentos CLASSIFICADOS (`plano_conta_id`) e os editados a' mao, os que voltam a programado e as liquidacoes de OC que o
    gatilho do dono vai estornar (`partesDoResumoDoDesfazer`, `src/lib/conciliacao/desfazerArquivoTexto.ts`; cada parte inteira,
    a quebra entre partes — medido: 4 linhas em 472px no caso do Agnaldo); RECUSA, com a frase e sem escrever, quando um
    lancamento a cancelar tem parte de OC viva ("O lancamento X … esta' ligado a' OC Y: desfaca o vinculo na OC antes") — de 47
    importacoes vivas, so' a 95c641a0 seria recusada; o mes fechado segue recusado como antes; a execucao grava o status anterior
    de cada extrato em `conciliacao_audit_log.payload_antes`. A funcao (SECURITY DEFINER) ganhou guarda de tenant e perdeu o
    EXECUTE de PUBLIC. Os campos de antes do retorno sao identicos em 54 de 55 importacoes (a 55a e' a recusa).
  md5: `fn_extrato_importar_arquivo` bcc09c8a…, `fn_extrato_desfazer_arquivo` d4b48183… -> 0e3c3b5a….
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
- ⚠ O RESOLVEDOR DE FORNECEDOR PROCURA PELO VALOR NORMALIZADO GUARDADO (PR-CONC-ENRIQ-IMPORT-CUSTO-01, 03/10, migration
  20261027191200, ⚠ registrada como 20261003113953; ledger = arquivo, md5 d22dfa4f…): `financeiro_fornecedores.nome_norm` e
  `aliases_norm` (text[], nunca NULL) guardam `_fn_normalizar_texto` do nome e de cada apelido, mantidos pelo gatilho
  `trg_fornecedor_norm_resolvedor` (BEFORE INSERT OR UPDATE OF nome, aliases; SECURITY DEFINER porque o front grava como
  `authenticated`, que NAO executa `_fn_normalizar_texto`); o array sai de UM dono, `_fn_fornecedor_aliases_norm`. Indices btree
  (cliente_id, nome_norm) WHERE ativo e GIN (aliases_norm). O `_det` procura por IGUALDADE nesses campos — mesma ordem de
  camadas, mesmo "exatamente 1" do apelido, mesmo desempate (created_at, id). ⚠ COLUNA GERADA NAO DA': `_fn_normalizar_texto`
  e' STABLE (dicionario do `unaccent`); por isso a conferencia `_fn_fornecedor_norm_divergentes()` (tem de dar 0) e a reconstrucao
  `_fn_fornecedor_norm_reconstruir()`, so' `service_role` — quem atualizar a extensao `unaccent` roda as duas. ⚠ `nome_normalizado`
  (maiusculas, pontuacao vira espaco, `trg_normalizar_fornecedor`) E' OUTRA REGRA e nao serve ao resolvedor: trocar uma pela
  outra muda o resultado (o hifen x espaco do cartao). A precedencia tem a de 2 argumentos (`_fn_classificacao_precedencia_cru(
  uuid, uuid[])`, o recorte); a de 1 delega com NULL (Recasar, casar manual), e o populate passa so' as linhas do lote. Uma
  resolucao por texto distinto: mapa no populate, CTE materializado na precedencia. Prova: 1.174 pares (cliente, texto) do
  staging, antigo x novo, 0 diferencas (3 de apelido ambiguo, 84 que casam inativo); 470 linhas da e6849efd em copia, staging
  final identico; Recasar e de-para identicos. Tempo: lote do populate 3,2–5,2 s -> 0,45–0,72 s; Recasar 2,4 -> 0,63 s;
  de-para (215 fornecedores) 9,4 -> 0,86 s. Escrita de fornecedor: +0,27 ms por linha (gatilho + indices).
  md5: _det bdaacbe9…, precedencia(uuid) ad89e90c…, precedencia(uuid, uuid[]) e532918e…, populate 93e3eb6c…,
  aliases_norm 4f0c33ff…, gatilho 31c60ecd…, divergentes 0f15d340…, reconstruir 271acc73…
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
- ⚠ ITEM CRIADO NUM GRUPO QUE JA' TEM PARTE ATIVA NASCE NA SEQUENCIA SEGUINTE (OC-VINCULAR-PARCELA-SEGUINTE-01, Gabriel 05/10/2026;
  migration 20261027193200, ⚠ registrada como 20261005165415; ledger = arquivo, md5 f9d7c530…; `oc_vincular_lancamento` md5
  7b866232… -> 0fd703b6…, patch guardado por md5 com 6 ancoras). No "criar item" do vincular, quando a OC ja' tem parte ativa no
  mesmo grupo (operacao, lote, natureza, componente), a parte nova nasce como `max(sequencia_parcela ativa) + 1` e a
  `quantidade_parcelas` das ativas do grupo sobe junto ("parcela 2 de 2"); antes nascia 1/1 e batia cru em
  `zoo_operacao_partes_identidade_lote`. Nasce do caso do Agnaldo (f74f95e5: recebimento de 200.000 ja' ligado, o de 94.595 nao entrava).
  · SIMULACAO = GRAVACAO: o retorno (o mesmo com `p_simular`) ganha `parte {sequencia, quantidade, parcela_seguinte, descricao}` e,
    no principal, `principal {acordado, vinculado, recebido}`; a tela so' escreve (`fraseDaParcela`, `src/lib/oc/vincularLancamento.ts`:
    "Entra como parcela 2 de 2 da Venda 055 B. A OC passa a ter R$ X recebidos de R$ Y acordados."), no painel "O que vai
    acontecer" do `VincularOperacaoDialog`. Principal ligado acima do acordado AVISA (`principal_excede_acordado`), nao recusa.
  · ERRO DE UNICIDADE NUNCA CRU: a funcao traduz `unique_violation` pela constraint (frase em portugues, P0001, "Nada foi
    gravado."), e o front tem a rede (`mensagemDeErro` troca "duplicate key value violates unique constraint" por
    `FRASE_COLISAO_DE_UNICIDADE`). Erro da simulacao aparece no painel ("Não foi possível calcular: …"), nunca painel vazio.
  · Medido a 1.135 no Agnaldo (so' leitura, funcao de verdade): modal 1090 x 491, a frase em 3 linhas de 249px, sem corte.
  Teste SQL: `supabase/tests/oc_vincular_parcela_seguinte_01_test.sql` (T1–T8, OC sintetica no cliente Teste, termina em RAISE OK).
  ⚠ O VINCULO LEVA A COMPETENCIA DO LANCAMENTO PARA A DATA DA OC (regra anterior, nao mudada): o 84b11037 vai de 31/08 a 25/08.
  ⚠ [as dividas deste bloco — OC-DESVINCULAR-RENUMERA-01, OC-VINCULAR-RECEBIMENTO-PARCIAL-01, as 3 OCs do Agnaldo e o "Saldo" do
    resumo lateral — FECHARAM no OC-VINCULAR-RECEBIMENTO-PARCIAL-01, a regra seguinte.]
- ⚠ RECEBIMENTO MENOR MANTEM O COMPROMISSO E DEIXA O SALDO EXATO; DESVINCULAR E' A VOLTA DO VINCULO (OC-VINCULAR-RECEBIMENTO-PARCIAL-01,
  Gabriel 05/10/2026; migration 20261027193300, ⚠ registrada como 20261005180058; ledger = arquivo, md5 94e98b43…; patch guardado
  por md5: `oc_vincular_lancamento` 0fd703b6… -> 4bc44efe…, `oc_desvincular_lancamento` 6cbc7e2a… -> f568e7cb…). REGRAS DO GABRIEL:
  NUNCA ARREDONDAR nem engolir diferenca de qualquer tamanho (R$ 35,00 conta); o financeiro e' soberano (recebimento pago nao muda
  de valor, pagamento nem conciliacao); MES FECHADO AVISA E NAO BLOQUEIA ajuste de OC (aviso `mes_fechado`, gravado na trilha); o
  sistema explica, o operador decide; todo gesto nasce com o gesto contrario; SIMULACAO = GRAVACAO.
  · O DEFEITO (5 vezes, todas no Agnaldo em 05/10): vincular um lancamento de valor diferente do titulo programado cancelava o
    titulo e levava o compromisso para a soma das parcelas (294.595 -> 200.000; 17.435 -> 17.400), e a `vw_oc_operacao_liquidacao`
    dizia "quitada" com dinheiro faltando; o desvincular cancelava a parcela e o compromisso (ate' no valor exato).
  · VINCULAR, recebimento V numa parcela de valor P: V = P como antes; V < P: o compromisso MANTEM o valor, o recebimento ocupa a
    parcela e o saldo P − V (exato) vai para a parcela SEGUINTE com o MESMO titulo programado REDUZIDO (mesmo id, vencimento e
    classificacao), sem evento `ajustar_valor_compromisso`; parcela sem titulo ou compromisso EM ABERTO (sem programacao): o saldo
    nasce numa parcela 'prevista'. V > P NAO MUDOU (o compromisso sobe), mas avisa `recebido_acima_do_saldo`. Com varias parcelas
    vivas e UMA so' em aberto, o vinculo a escolhe sem perguntar. O retorno ganha `parcial {lado, recebido, de, saldo,
    parcela_saldo}`; a trilha guarda `parcial`, `parcela_valor_antes` e `parcela_status_antes`.
  · DESVINCULAR le' a trilha do proprio vinculo e devolve a OC ao estado de ANTES: titulo substituido -> REATIVADO, o mesmo
    registro (se nao pode — ja' vivo, com outra parte —, a parcela volta a 'prevista'; recriar seria um segundo escritor de titulo,
    cujo dono e' `oc_materializar_parcela`); parcela preenchida -> volta a 'prevista'; parcela criada em compromisso aberto -> sai,
    com a programacao que o vinculo criou, e o compromisso FICA; parcial -> o valor volta ao saldo; o compromisso so' muda de valor
    quando o proprio vinculo o tinha ajustado e ninguem mexeu depois. Sempre recalcula `quantidade_parcelas` do grupo. Retorno:
    `devolucao_ao_saldo {modo, valor, saldo_de, saldo_para, titulo_id}` e `compromisso.acao` 'mantido' | 'restaurado'.
    Internas (fechadas): `_oc_titulo_em_aberto`, `_oc_renumerar_parcelas_do_grupo`.
  · MAPA DOS TIPOS DE OC (ensaio revertido no Teste, molde real de cada tipo, hoje x depois): POR PROGRAMACAO — venda, compra, abate
    e boitel se comportam IGUAL, celula a celula (93 OCs vivas: venda 9, compra 33, abate 33, boitel 18) e sao as que a regra
    alcanca; despesa com compromisso programado segue a mesma regra (paga a menos deixa saldo a pagar); despesa por "criar item"
    nao mudou. CONTA CORRENTE — venda 122 (121 criadas do legado) e compra 1: NAO passa pelo ramo (`oc_vincular_lancamento` delega
    a `_oc_vincular_recebimento`), nao ha' compromisso para encolher, o saldo e' calculado ("parcial" / "excedente" pela view) e
    DESVINCULAR E' RECUSADO. Realizado do boitel nao e' vinculo (`oc_revalorar_lote`, regra de negocio).
  · TELA: o painel do Vincular escreve a frase do banco (`fraseDoParcial`: "Recebido R$ X de R$ Y. Fica saldo a receber de R$ Z
    nesta OC.") e os avisos; o Desvincular escreve "Compromisso … — mantido" e o que volta (`linhaDaDevolucao`). Aba Financeiro da
    OC por programacao (`AbaCompromissosOC`, com `liquidacao={api.resumo}`): cartoes Negociado · Recebido · A receber · Recebimentos
    "1 de 2" · Situacao LIDOS DA VIEW ("confere" so' com 'quitada'); parcelas com a POSICAO entre as vivas ("1/2, 2/2"; a sequencia
    gravada no `title`) e, na linha do saldo, "Vincular recebimento/pagamento" (a busca do "+ Buscar despesa" na direcao e no
    subcentro do compromisso + o vincular de sempre). Resumo lateral: na venda "Saldo" virou "Líquido <nivel>" (o liquido do nivel
    mais avancado, as palavras da lista de OCs); na compra, "A pagar"; o abate nao tem a linha. Medido a 1.135: cartoes em uma
    linha de 51px; tabela de parcelas 992px, linhas de 26px, so' a Descricao corta (110px, inteira no `title`); modal do vincular
    1090 x 491.
  Testes: `supabase/tests/oc_vincular_recebimento_parcial_01_test.sql` (V1–V8, C1, D1–D5, R1, F1–F2);
  `oc_vincular_parcela_seguinte_01_test.sql` atualizado ao contrato novo; 21 mutacoes de banco + controle, 17 de tela.
  CONSERTO DO AGNALDO: `docs/investigacao/oc-vincular-recebimento-parcial-01-conserto-agnaldo.sql` (as 3 OCs de volta ao combinado
  com o saldo a' vista no titulo original; o cabecalho do script diz quando foi executado).
  ⚠ DIVIDAS: OC-CC-DESVINCULAR-RECEBIMENTO-01 (desvincular em conta corrente segue recusado — PR 3 do OC-CC-ACOES-LINHA-02) ·
    OC-AJUSTE-DIFERENCA-01 (gestos de ajuste: recebido a mais, encerrar o saldo de despesa estimada, separar a diferenca) · a
    SEQUENCIA COM BURACO so' se resolve na tela (a gravada nao e' renumerada) · COMPETENCIA NA VOLTA: o desvincular so' a devolve
    quando o vinculo a trocou "pela saida"; senao fica na data da OC · `oc_criar_do_legado` nao foi executada em teste (prova por
    leitura do corpo) · compromisso com varias parcelas TODAS pagas ainda conta como "livre" na escolha do compromisso · a OC
    7016f2b5 do Agnaldo (recebido 368.210 num combinado de 361.130) espera os gestos de ajuste · nao provado no navegador: compra
    e abate com saldo parcial, o aviso de recebido a mais e o de mes fechado (so' por teste).
- ⚠ NADA SOME DA LISTA DE CANDIDATAS SEM MOTIVO (OC-VINCULAR-CANDIDATAS-01, Gabriel 05/10/2026; migration 20261027193400, ⚠ registrada
  como 20261005220703; ledger = arquivo, md5 7cab9484…; patch guardado por md5: `oc_candidatas_vinculo` 70231c30… -> 05cbc9b2…,
  `oc_vincular_lancamento` 4bc44efe… -> d72b7db7…, `_oc_vincular_recebimento` 3dc56197… -> 76003144…,
  `_oc_vinculo_compromisso_liquidado` 565d6aef… -> e13097f2…).
  O dono do que aparece, em que ordem e com que marca e' `oc_candidatas_vinculo`; a tela so' REPARTE o retorno pela marca
  (`blocosDeCandidatas`) e escreve as frases com os NUMEROS DO RETORNO (`janela_dias`, `limite_dias`) — nenhum filtro no front,
  nenhum 60 ou 180 escrito na tela (preso por teste de fonte).
  · OUTRA FAZENDA aparece (`outra_fazenda`), com o selo "outra fazenda: <nome>", e PODE ser escolhida; o vincular grava o aviso
    `fazenda_diferente` na trilha e NAO muda a fazenda do lancamento. FORA DA JANELA (janela < distancia <= limite) vem marcada
    `fora_da_janela` e fica sob "Mostrar N fora da janela de J dias" (fechado por padrao; estado local); acima do limite, so' a
    contagem (`fora_do_limite`). RASCUNHO vem marcada e fica APAGADA, nao selecionavel, com "em rascunho — conclua a negociação".
    CANCELADA e de teste seguem fora. OUTRO TIPO segue fora, com uma linha de rodape (`outro_tipo {qtd, tipos}`, so' para
    natureza principal — na despesa seria toda compra do periodo).
  · A ORDEM (P8), no banco: dentro da janela antes de fora -> selecionavel antes de rascunho -> mesma fazenda antes de outra ->
    valor exato -> pista da descricao -> distancia. Quem ja' aparecia segue na mesma ordem relativa e no topo (medido em 416
    lancamentos avulsos reais: 0 mudancas de ordem, de topo e de payload).
  · PRE-SELECAO (`candidataInicial`): nunca outra fazenda, fora da janela ou rascunho, mesmo com valor exato.
  · COMPROMISSO LIQUIDADO TEM UM DONO, `_oc_vinculo_compromisso_liquidado` (lido pelo vincular e pelas candidatas): tem parcela
    viva e TODAS pagas. Com varias parcelas todas pagas ele deixou de contar como livre (`acao_prevista` 'recusar').
  · TODAS PAGAS NAO E' "LIQUIDADO" QUANDO O COMPROMISSO ≠ A SOMA DAS PARCELAS, AO CENTAVO (Gabriel: nunca arredondar, nunca mentir;
    R$ 0,01 conta). A lista devolve, por compromisso e por OC, `diferenca_parcelas` (compromisso − soma das parcelas vivas; nulo
    sem parcela; positivo = pago a menos) e a marca `pagas_com_diferenca`; `todos_liquidados` so' com diferenca ZERO. Na tela a
    linha leva o selo "parcelas pagas · falta R$ 0,50" / "· sobra R$ X" (`seloDaDiferenca`; curto de proposito — o selo longo
    espremia a coluna Operacao de todas as linhas).
    [01b, Gabriel 05/10; migration 20261027193500, ⚠ registrada como 20261005231255; ledger = arquivo, md5 59b17450…;
    `oc_candidatas_vinculo` 05cbc9b2… -> ec17660f…, `oc_vincular_lancamento` d72b7db7… -> 5f9f5d22…] A LINHA E' SELECIONAVEL, do
    mesmo jeito que a OC toda paga de diferenca zero ("criar item", a regra de 26/09): o sistema explica, o operador decide. Ao
    escolher, o vincular devolve — e grava na trilha — o aviso `parcelas_pagas_com_diferenca {diferenca}`, e o painel o escreve em
    ambar (`fraseDaDiferenca`): "Todas as parcelas deste compromisso estão pagas e falta R$ 0,50 para o combinado. Este
    lançamento entra como item novo; a diferença continua na OC." A diferenca tem UM dono no banco,
    `_oc_vinculo_diferenca_parcelas(compromisso)`, lido pela lista e pelo vincular. O clique em linha NAO selecionavel
    (rascunho) escreve o motivo dela no painel.
    ⚠ E' ENTRADA DO OC-AJUSTE-DIFERENCA-01 (sem gesto neste PR): caso real, compra 2fd157be do Agnaldo — combinado 27.062,50,
      quatro parcelas pagas somando 27.062,00, view "parcial" com saldo 0,50.
    ⚠ A COMPARACAO E' AO CENTAVO (`round(…, 2)`): ha' compromisso gravado com fracao de centavo (6cf548a1, −0,000009), que sem
      isso ganharia a marca com "R$ 0,00".
  · RECUSA EM FRASE, NUM LUGAR SO' (`src/lib/oc/vincularLancamento.ts`): `FRASE_DO_INELEGIVEL` (o motivo de `elegivel: false`) e
    `FRASES_DO_BANCO` (o texto do RAISE -> frase, lido por `mensagemDeErro`, que os tres dialogos usam). Texto que o mapa nao
    conhece passa como veio — RAISE novo nas RPCs de vinculo entra no mapa no mesmo PR.
  · O BOTAO "Vincular à operação" NAO MUDOU (decisao do Gabriel, 05/10): subcentro fora do mapa segue SEM botao
    (`podeOferecerVinculo`); a frase "Este subcentro não se liga a operação comercial." fica no mapa para quando a RPC recusar.
  · O LANCAMENTO NO TOPO DO DIALOGO SAO DUAS LINHAS DE 10px (`vinc-lancamento`, 40px; eram 109): descricao · favorecido · valor /
    pagamento · competencia · fazenda · subcentro · origem; so' texto livre corta (inteiro no `title`). O espaco foi para a lista.
  · O MODAL NAO CRESCE: o corpo nao rola; a LISTA e' o unico scrollport (`vinc-lista`), com o cabecalho sticky nela; a coluna
    Operacao e' a unica que corta (`w-full max-w-0 truncate`, inteiro no `title`).
  Provas: 416 lancamentos avulsos reais, antigo x novo — 0 mudancas de conjunto, ordem, topo e payload entre as que ja' apareciam;
  82 ganham OC de outra fazenda, 369 tem OC fora da janela, listas vazias 42 -> 7; tempo p50 4,5 -> 15,4 ms, p95 8,7 -> 28,5, pior
  99,8 ms. Teste SQL `supabase/tests/oc_vincular_candidatas_01_test.sql` (K1–K8); 20 mutacoes de banco e 17 de tela + controles.
  ⚠ DIVIDAS: RAISE NOVO NAS RPCs DE VINCULO EXIGE A FRASE NO MAPA NO MESMO PR (nada forca alem desta regra) · "mostrar fora da
    janela" e' ESTADO LOCAL (fecha a cada abertura) · LAYOUT FIXO: a tabela de candidatas e' `table-layout:auto` — abrir o "mostrar"
    ("a 144 dias") ou uma linha com o selo da diferenca estreita a coluna Operacao (352 -> 286px medidos), e o `thead` sticky deixa
    ~2px de linha a' vista acima dele · a 491px de modal cabem ~4 linhas com rodape (por conta, nao medido) · o selo "outra
    fazenda: <nome>" repete a fazenda que a linha ja' diz · 2 linhas de `audit_log` do ensaio no cliente Teste (lancamentos
    417a4374 e afc277bf, apagados) · nao provado no navegador: rascunho com a funcao real (so' por teste e por resposta simulada).
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
- ⚠ TODA LINHA DO CONTA CORRENTE E DAS DESPESAS DA OC E' CLICAVEL E TEM "⋯"; ITEM QUE NAO VALE FICA DESABILITADO COM O MOTIVO,
  NUNCA SOME (OC-CC-ACOES-LINHA-02, Gabriel 04/10, so' tela; nasce de "eu nao conseguia clicar no recebimento e abrir o modal
  financeiro… so' tabela de visualizacao"). O clique na linha (e o Enter com o foco nela) e' o PRIMEIRO item do menu dela; o
  motivo do item apagado vai NO item (segunda linha, ambar) e no `title` — o menu e' a excecao da linha unica. O item e' um so',
  `ItemDeMenuOC` (`AbaContaCorrenteOC.tsx`), usado pelos dois menus.
  · EXTRATO (`acoesDaLinha`, funcao pura no mesmo arquivo; textos por lado em `TEXTOS`): RECEBIMENTO/PAGAMENTO = Abrir lançamento ·
    Parcelar este recebimento · Desvincular da operação · Cancelar recebimento programado; ENTREGA/ENTRADA = Ir para a entrega (a
    aba Entrega da venda, Recebimento da compra — `onIrParaEntrega`, do shell) · Abrir lançamento (só leitura) · Desvincular da
    operação; EXPLICACAO = Abrir explicações (o `DialogoExplicarDiferenca` inteiro) · Abrir lançamento · Desfazer explicação (o
    MESMO dialogo, ja' no passo de remocao daquela linha, `removerAoAbrir`; o motivo e o "Remover explicação" continuam
    obrigatorios). Em somente leitura os itens de GRAVAR dizem, pelo lado (`motivoSomenteLeitura`, um dono para os dois menus):
    venda "operação cancelada · somente leitura"; compra "operação em rascunho ou cancelada · somente leitura".
    ⚠ ESSE "SOMENTE LEITURA" E' `financeiroNovoReadOnly`, QUE NA VENDA SO' LIGA COM A OC CANCELADA (na compra, rascunho ou
      cancelada): a OC FECHADA segue gravando no Financeiro, de proposito — por isso a frase NAO e' "operação fechada · reabra
      para alterar" (a primeira versao; trocada por decisao do Gabriel em 04/10). Nao ha' no proto OC em conta corrente
      cancelada: provado so' por teste.
  · REGUA: a 11a coluna (22px) saiu das duas de TEXTO pela medicao — Descricao 100 -> 94 (texto gerado, nao corta: o pior,
    "Devol. fornecedor", pede 84,6 + 8) e Conta 152 -> 136 (corta com `title`); data, numero e valor nao cederam.
  · DESPESAS (`menuDespesa`, `AbaCompromissosOC`): os nove itens SEMPRE, na mesma ordem — Abrir lançamento · Programar · Programar
    saldo · Lançar · Reclassificar · Cancelar programação · Estornar · Desvincular · Desfazer. NENHUMA condicao de habilitacao
    mudou: o que sumia ficou apagado com a frase da propria condicao.
  · ABRIR O LANCAMENTO TEM UM DONO: `paramsAbrirLancamentoDaOC` (`src/lib/oc/abrirLancamentoDaOC.ts`), o corpo do antigo
    `editarTitulo` movido linha a linha; as despesas e o extrato (por `AbaFinanceiroOC`) chamam a mesma funcao, e a volta abre na
    sub-aba de onde saiu (sem `oc_sub` = extrato). PROIBIDO segundo caminho de abrir.
  · O BOTAO "+ Programar recebimento/pagamento futuro" SAIU DO TOPO (uso medido: zero). `DialogoProgramarRecebimento`, o hook
    (`programarRecebimento`) e a RPC `oc_programar_recebimento` FICAM, sem ponto de entrada: voltam pelo "Parcelar".
  ⚠ FILA DO PR 3 (banco), que ACENDE os itens hoje em "disponível em breve": desvincular recebimento de conta corrente
    (`oc_desvincular_lancamento` recusa parte de conta corrente) · parcelar recebimento programado · cancelar recebimento
    programado (nao existe gesto nem RPC).
  ⚠ DIVIDAS: FIN-MODAL-SOMENTE-LEITURA-01 — modo so' leitura no `LancamentoV2Dialog` (prop + repasse no `FinanceiroV2Tab` +
    parametro no `V2Index`), que acende o "Abrir lançamento (só leitura)" da entrega (hoje o modal trava 5 campos do titulo de OC
    e deixa gravar fornecedor, safra e observacao) · EDITAR EXPLICACAO GRAVADA NO LUGAR (hoje so' remover e acrescentar) · a
    linha de recebimento sem `lancamentoId` nao e' clicavel (o "⋯" diz por que).
- ⚠ FINANCEIRO V2 MOSTRA SO DINHEIRO por padrao; sem caixa (entregas, barter, consumo) em secao
  separada atras de chave. OC se abre pelo icone do produto ou "Abrir OC" no menu (FIN-V2-SEM-CAIXA-01,
  FIN-V2-HOMOLOG-FIX-01).
  ⚠ A MARCA DA OC TEM COLUNA PROPRIA, ANTES DO PRODUTO (FIN-V2-COLUNAS-OC-01, Gabriel 05/10, so' tela, `src/pages/FinanceiroV2Tab.tsx`):
    "o icone vem depois do texto e some quando o texto e' longo". Coluna "OC" de 16px entre Pgto. e Produto, NAO congelada (a
    cadeia sticky 0/28/42/82/122 nao mudou). O conteudo e' o que estava no fim da celula do Produto, MOVIDO VERBATIM: com acesso,
    o botao `icone-oc` (abre a operacao e para a propagacao); sem acesso, a marca `marca-oc` (ACESSOS-02b); sem OC, vazia. O 🏦 da
    parcela e o icone do zootecnico ficam no Produto. A coluna de 58px com o codigo da OC (`CelulaOC`) segue fora da lista.
    LARGURAS (normal, MEDIDAS a 1.126): 28·14·40·40·40·OC 16·Produto 136·Fornecedor 100·Macro 56·Centro 56·Faz. 30·Safra 66·
    Valor 90·Doc. 70·Status 64·acoes 28 = 874 (Ampliado: Produto 150 e as duas contas de 92 = 1.072). Status 77 -> 64 a 8px: o
    maior e' "Conciliado" com o selo, 55,1px em 60 uteis (`px-0.5`); Faz. 38 -> 30: o pior codigo, "ADM", 21,1px em 26 uteis;
    Macro e Centro 66 -> 56 a 8,5px (cortam com `title`, como ja' cortavam). Linha de 25px, antes e depois. O legado "Conciliado
    (legado)" pede 75,7px e CORTA numa linha com o rotulo no `title` (antes quebrava em duas); "Meta (legado)" cabe.
    ⚠ DIVIDAS: FIN-V2-DOC-CORTA-01 — numero de documento longo CORTA na coluna Doc. de 70px [90px desde o PARC-LIVRES-01 passo 3] (951 de 5.212 linhas no NJ, 140 de
      1.551 no Agnaldo; ex.: "20260930010176200"), contra a regra "numero nunca corta"; ja' cortava antes deste PR ·
      A LISTA INTEIRA RENDERIZA A 9px pelo `.table-financeiro td` do index.css (datas e Doc. a 8px), abaixo do piso de 9,5px,
      desde antes deste PR · FOLGA DO STATUS DE 4,9px (padding lateral de 2px): status novo mais longo que "Conciliado" pede
      remedir a coluna · NAO PROVADO: a rolagem do Ampliado (a 1.126 a tabela de 1.072 cabe sem rolar — a cadeia sticky foi
      conferida pelos offsets e pela ausencia de fresta), o corte do "Conciliado (legado)" numa linha real (nenhuma linha de 2026
      tem status legado: so' por medicao do rotulo e por teste) e a marca `marca-oc` sem botao para perfil sem acesso (so' por
      teste de fonte).
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
- ⚠ CONTAS A PAGAR E RECEBER: UM PERIODO, VENCIDOS A' PARTE, E O RECORTE TEM UM DONO (CPR-PERIODO-VENCIDOS-01, Gabriel 05/10/2026, so'
  tela). Dono puro: `src/lib/financeiro/cprRecorte.ts` — `periodoDoAtalho`, `baldeDaConta`, `recortarCpr`, `ramoDaConsultaCpr`. A
  TELA SO' RENDERIZA: cartoes e total saem de `recortarCpr`, dos MESMOS dados em Lista e em Fluxo (a consulta e a chave de cache
  nao tem a visao). Nasce de defeito medido: os cartoes somavam "o que a visao carregou" e trocar Lista <-> Fluxo mudava os dois
  numeros com o mesmo rotulo (NJ, 30 dias, a pagar: 790.184,12 na Lista x 1.695.091,64 no Fluxo).
  · PERIODO = [de, ate] por `data_vencimento`, em DATAS LOCAIS de texto (nada de `toISOString`): "Este mes" (1o ao ultimo dia), "30
    dias" e "60 dias" (hoje a hoje+N), "Escolher datas"; os campos de/ate estao sempre a' vista e editar um vira "Escolher datas".
  · CADA CONTA CAI EM EXATAMENTE UM BALDE: 'paga' (realizada ou com data de pagamento: aparece apagada na lista com a pilula
    Realizado e NUNCA soma) · 'sem_vencimento' (grupo proprio no fim, fora dos cartoes) · 'vencido' = EM ABERTO com vencimento <
    hoje, DE QUALQUER IDADE, inclusive o que esta' entre "de" e ontem · 'periodo' (hoje e' do periodo, nao vencido) · 'fora'.
  · SOMA EM CENTAVOS INTEIROS, nunca arredondada; zero e' R$ 0,00, nunca "—". Cartoes: Vencidos (a pagar; o "a receber" ao lado,
    em verde, so' quando > 0) · A pagar no periodo · A receber no periodo · Saldo do periodo (a receber − a pagar, sem vencidos) ·
    Saldo em caixa (calculo intocado; corrente e investido em duas linhas a' direita). Nenhum depende do segmento nem da visao.
  · "INCLUIR VENCIDOS" (ligada por padrao) decide a LISTA e o TOTAL; os vencidos vem SEMPRE na busca e o cartao os mostra sempre.
    Lista: grupo "Vencidos · N contas · a mais antiga há X dias" no topo, depois os dias, e o TOTAL fixo no rodape (fora da
    rolagem) = `recorte.total[segmento]`; a soma dos grupos da' o total ao centavo (o grupo soma so' as contas em aberto).
  · UMA BUSCA: periodo ∪ vencidos EM ABERTO ∪ sem vencimento (o ramo dos vencidos pede "em aberto" na propria consulta — com a
    pilula Realizado um `lt.hoje` cru traria o historico de pagos). O grafico filtra em memoria e comeca na data "de".
  · ⚠ VALOR DE CARTAO NUNCA CORTA NEM FICA SO' EM `title`: todo valor e' `whitespace-nowrap`, sem `truncate`; so' o rotulo (texto)
    corta. 12px, `px-1`, `gap-1` e a grade 1.72fr·1fr·1fr·1fr·1.9fr foram MEDIDOS a 1.126px com "−R$ 99.999.999,99" nos OITO
    valores (texto 113,9 de 118px; lado 90,2), cartoes de 40px. Quem mexer mede de novo — a folga e' de 3 a 4px.
  Medido (NJ e Agnaldo, so' leitura): os cinco numeros identicos em Lista e Fluxo nos 4 atalhos e num intervalo livre; soma dos
  grupos = total; barra 1 em uma linha (759 de 886px). 13 mutacoes mortas.
  ⚠ DIVIDAS: a tela nao se monta em teste (contrato lido da fonte; numeros do navegador) · programado com data de pagamento antiga
    (6 casos) cai como 'paga' · no grupo em "Ambos" o liquido negativo aparece em vermelho sem o sinal (ja' era assim nos dias) · o
    Fluxo segue forcando "Ambos" ao entrar · a legenda do grafico ficou com os quatro tracos que ja' tinha · a contagem dos cartoes
    do periodo e' "· 237" (por extenso no `title`) · abaixo de 1.126px os cartoes nao foram medidos · nao provado no navegador:
    pilula Realizado ligada, "de" depois de "ate", o grupo "Sem vencimento" (0 casos reais), digitacao real nas datas.
- ⚠ CONTAS A PAGAR E RECEBER POR CONTA BANCARIA: O FILTRO E O RESUMO SAO DO MESMO DONO (CPR-CONTA-01, Gabriel 05–06/10/2026, so' tela,
  sem consulta nova). Em `src/lib/financeiro/cprRecorte.ts`: `contaDaConta`, o parametro `conta` de `recortarCpr` (`null` = todas ·
  um id · `SEM_CONTA`), `resumoPorContaCpr` e `contasDaFaixaCpr`.
  · A CONTA DA LINHA E' A DA DIRECAO: entrada -> `conta_destino_id`; saida -> `conta_bancaria_id` (a regra do sistema). Medido nos
    em aberto de todos os clientes: nunca os dois preenchidos, e a regra = `conta_efetiva_id` em 100%; 0 em aberto sem conta. A
    coluna "Conta" da lista lia sempre a bancaria e mostrava "—" em toda entrada: passou a ler o dono.
  · O FILTRO ENTRA NO RECORTE, ANTES DE TUDO: cartoes Vencidos / A pagar / A receber / Saldo, grupos, total e grafico leem o mesmo
    `recorte`. O nome da conta fica escrito no cabecalho ("Conta: X") enquanto o filtro esta' ligado.
  · O RESUMO POR CONTA (opcoes do seletor e a faixa "A pagar por conta" abaixo dos cartoes) e' o total A PAGAR de cada conta no
    recorte atual (vencidos, se a caixa esta' ligada, + periodo) com a contagem, maior valor primeiro; "Sem conta definida" e' uma
    conta como as outras, nunca escondida. A SOMA DAS CONTAS E' O TOTAL DE "TODAS", AO CENTAVO (cada linha em exatamente uma conta).
    A FAIXA (18px, existe mesmo vazia; 4 contas e "+N"; clicar filtra, clicar de novo volta) NAO desenha conta com a pagar ZERO nem
    a conta no "+N"; o SELETOR continua com ela (filtra a pagar e a receber), com R$ 0,00 e a contagem real.
  · O SELETOR e' o `Select` de `@/components/ui/select` (o mesmo do Financeiro V2 e da Mesa do Enriquecer).
  · SALDO EM CAIXA DE UMA CONTA = O MESMO CALCULO com a lista de contas reduzida a'quela (`estimarSaldoEmCaixa` e
    `serieDoSaldoPassado` ja' recebem as contas; a entrada viaja no retorno da `cpr-caixa`). O rotulo diz de quem e' o numero:
    "Caixa · <conta>", ou "Caixa · todas as contas" em "Sem conta definida". CARTAO DE CREDITO NAO ENTRA NO CAIXA: mostra "—" com o
    motivo no `title`. Conferido contra a Conciliacao: NJ Banco do Brasil 604.088,31; Agnaldo Bradesco 1,00 e Invest. Facil 26.205,10.
  · ROTULOS DOS CARTOES CURTOS, que nao cortam: "Vencidos · N contas", "A pagar · N", "A receber · N", "Saldo", "Caixa" — o
    periodo fica so' na barra 1 e o nome completo no `title`; a contagem e' numero (nao corta). Grade 1.75fr·1fr·1fr·1fr·1.94fr.
  · ⚠ LARGURA MINIMA DA TELA: JANELA DE 1.126px (area util 886px; decisao do Gabriel, 06/10). Medido com "−R$ 99.999.999,99" nos
    oito valores: a 1.126 todo valor tem folga (2,9px nos tres do meio, 5,4 no Vencidos, 6,3 no Caixa) e a barra 1 fecha em 886 de
    886; a 1.280 sobra (18,8 a 37,1px); a 1.024 (area util 784) os valores CORTAM (−12,3 a −23,2px) e a barra 1 pede 880.
  Provas: Lista x Fluxo com conta escolhida iguais (NJ Banco do Brasil e Agnaldo Bradesco); clique real no seletor (abrir,
  escolher, voltar a Todas); 12 mutacoes da conta e 13 do periodo mortas.
  ⚠ DIVIDAS: CPR-LARGURA-MENOR-01 (abaixo de ~1.110px: cartoes em duas linhas, 3 + 2, e barra 1 em duas linhas — PR proprio, so' se
    houver uso real) · a barra 1 esta' SEM FOLGA a 1.126 (886 de 886): item novo quebra a linha · CONTA INATIVA aparece como "Conta
    inativa", sem o nome (o catalogo da tela so' carrega ativas) · "Sem conta definida" e conta inativa nao tem caso real (so' por
    teste) · as medidas a 1.024 e 1.280 foram feitas num iframe da propria aplicacao, nao numa janela real.
- ⚠ CONTAS A PAGAR E RECEBER: SALDO POR DIA, E O VENCIDO SO' CONTA DEPOIS DA CONCILIACAO DA CONTA (CPR-SALDO-DIA-01, Gabriel
  06/10/2026, so' tela, sem consulta nova). Dono: `src/lib/financeiro/cprRecorte.ts` — a regra depende da CONTA da linha e do
  balde, que ja' eram dele; o grafico (`fluxoPrevisto.ts` / `CprFluxoPrevisto`) so' desenha as linhas que o dono entrega.
  · D1 — O VENCIDO EM ABERTO CONTA NO SALDO (sai/entra HOJE) SO' COM VENCIMENTO POSTERIOR A' ULTIMA CONCILIACAO DA CONTA
    (`vencidoContaNoSaldo`). Vencimento <= a ancora = mes ja' conciliado: NAO conta ("pode ser lancamento errado, legado"), fica a'
    vista, e o operador abre o lancamento e atualiza a data para ele entrar na soma.
  · D2 — A DATA DE CORTE E' POR CONTA: a ancora que o cartao Caixa usa, LIDA dele — `estimarSaldoEmCaixa` devolve
    `ancoraPorConta [{contaId, data}]` (a data que o calculo de cada conta usou; o calculo nao mudou) e a tela a entrega ao dono por
    `ancorasDoCaixaCpr`. NENHUM ESPELHO: `cprRecorte.ts` nao importa nada de `saldoEmCaixa.ts` (preso por teste). Em "Todas as
    contas" cada vencido e' julgado pela ancora da conta DA LINHA (`contaDaConta`). Linha sem conta ou de conta sem ancora (cartao
    de credito inclusive): fora do saldo, no subgrupo dos anteriores.
  · D3 — A CAIXA "INCLUIR VENCIDOS" NAO MUDA O SALDO: decide so' a lista e o total do rodape (a pagar / a receber).
  · D4 — LISTA E GRAFICO, A MESMA REGRA DO MESMO DONO: `serieDoSaldoCpr(recorte, saldo de hoje)` = partida (Caixa − vencidos a
    pagar que contam + a receber que contam) -> "entre hoje e de" (se "de" e' futuro) -> cada dia (anterior − a pagar + a receber,
    so' contas EM ABERTO, dos DOIS lados) -> fim; `menor` = o minimo da serie com o dia dele. Centavos inteiros. O grafico recebe
    `linhasDoSaldoCpr(recorte)` e parte do MESMO saldo (`serie.hoje`); `ajusteVencidoPorDia(linhas, null, hoje, null)` desconta
    todo vencido que recebe — o piso por "de" e o "conciliado ate'" do cliente inteiro SAIRAM (eram a regra antiga, que fazia o
    grafico discordar da lista).
  · ⚠ A LINHA DE SALDO DO GRAFICO E' SEMPRE A DA CONTA (Gabriel, 06/10: "o grafico tem que mostrar o saldo exato"): o Fluxo recebe
    os DOIS lados em qualquer segmento (`doFluxo = linhasDoSaldoCpr(recorte)`, sem filtro) — conciliado, realizado, vencido,
    previsto, as areas e as tags. O SEGMENTO decide SO' as barras de movimento (prop `barras` do `CprFluxoPrevisto`; o tooltip
    as segue porque le' o que foi desenhado). O Fluxo NAO forca mais "Ambos" ao entrar (a unica razao era proteger o saldo).
    Provado em "A pagar", "A receber" e "Ambos": partida, tres dias e fim identicos entre si e a' coluna Saldo (NJ · Banco do
    Brasil 394.164,24 -> −195.584,67; Agnaldo · Bradesco −19.492,32 -> −59.165,15).
  · BALDE NOVO `antes_do_periodo` (em aberto, entre hoje e um "de" FUTURO): passa pelo saldo, nao e' listado; e a busca
    (`ramoDaConsultaCpr`) passou a comecar em `min(de, hoje)` para traze^-lo. A MESMA consulta, com o intervalo mais largo.
  · A LISTA: linha fixa "Saldo hoje · {conta | todas as contas}" (= cartao Caixa); com a caixa DESLIGADA ela vira "… · apos vencidos"
    e mostra o saldo de partida. Vencidos em DOIS subgrupos: "Vencidos · N contas · contam no saldo" (tom vermelho, com o saldo depois)
    e "Vencidos anteriores a' conciliacao de DD/MM · N contas · fora do saldo" (muted, sem seta, Saldo vazio; em Todas "de cada conta";
    conta sem ancora "de conta sem saldo conferido"). TODO DIA DA SERIE TEM FAIXA DE FECHAMENTO, mesmo sem conta listada no segmento
    (o segmento governa a LISTAGEM; totais e saldo sao dos dois lados, e o N do titulo tambem). Rodape navy "Fim do periodo ·
    DD/MM/AAAA · N contas" com o total a pagar, a receber e o SALDO NO FIM. "Sem vencimento" fora do saldo. Sem saldo em caixa
    (cartao de credito): Saldo "—" com o motivo no `title`.
  · SETAS E CORES NUM LUGAR SO' (`CelValor`): ▼ a pagar (vermelho), ▲ a receber (verde), saldo ▲ verde se >= 0 / ▼ vermelho se < 0
    com "−" tipografico colado; cores de `COR_SINAL`; no rodape navy os dois tons claros `TOM_NO_NAVY` (#fca5a5 / #86efac). Zero e'
    "R$ 0,00" apagado, sem seta. Faixa do dia: fundo OPACO de 12 % de primary sobre o cartao (`FUNDO_DIA`, `color-mix`), 22px,
    filete de 1,5px; saldo negativo com fundo vermelho claro.
  · UM SCROLLPORT, E TUDO O QUE E' FIXO MORA DENTRO DELE (cabecalho `top-0`, "Saldo hoje" `top-[22px]`, faixas `top-[42px]`, rodape
    `sticky bottom-0`): fora, o fixo teria a largura cheia e as colunas de valor desalinhariam das linhas pelo gutter da barra.
    ⚠ `.rolagem-sem-tampar` tem `padding-bottom: 10px`, e o `sticky bottom-0` ancora na caixa de CONTEUDO: o scrollport leva `!pb-0`.
  · DUAS REGUAS, EM px, MEDIDAS a 1.126 com "▼ −R$ 99.999.999,99" em toda celula de valor, "Programado" em todo status e datas cheias
    (0 cortes; folga minima 2px nos valores, 3,8 no status, 1,9 nas datas):
      NORMAL (lista 884, conteudo 857): Venc. 46 · Descricao 185 · Fornecedor 100 · Subcentro 82 · Status 60 · clipe 12 · A pagar 111 ·
        A receber 111 · Saldo 118. Sairam Conta, Origem e Doc: moram no `title` da Descricao ("origem: … · doc: … · conta: …").
      AMPLIADO (lista 1.092): Comp. 30 · Venc. 46 · Pgto. 46 · Descricao 221 · Fornecedor 96 · Subcentro 84 · Safra 56 · Faz. 26 ·
        Status 60 · clipe 12 · A pagar 111 · A receber 111 · Saldo 118. A CONTA NAO COUBE (a Descricao cairia abaixo de 220): `title`.
    Alturas: cabecalho 22 · saldo hoje 20 · faixa do dia e dos vencidos que contam 22 · anteriores 20 · linha 18 · rodape 26.
    Datas, Subcentro, Safra e Faz. a 9,5px; status a 9px (a excecao de sempre); nada abaixo.
  · CARTOES: "Saldo" virou "Mínimo" (o `menor` da serie): rotulo "Mínimo ▼ · DD/MM" (ou "· hoje"), a seta na cor do sinal; sem
    saldo em caixa, "Mínimo" e "—"; `title` "menor saldo previsto da conta no período". O `title` do Vencidos diz quantos contam e
    quantos sao anteriores. Mesma grade. Medido a 1.126: rotulo 82,8 de 117px (a palavra e a data inteiras), valor no pior caso
    113,9 de 117, cinco cartoes de 40px.
  · O AMPLIADO E' O MODO PRINCIPAL: TEM OS MESMOS FILTROS DA TELA NORMAL, PELO MESMO ESTADO, E VALE PARA LISTA E FLUXO (Gabriel,
    06/10). Mecanismo: o da lista de Lancamentos (`onIntensiveToggle`, repassado pelo `V2Index` em UMA linha; estado local; sair
    da tela desliga). Cada controle e' UM no' (`ctlVisao`, `ctlAtalho`, `ctlDatas`, `ctlConta`, `ctlSegmento`, `ctlIncluir`) que a
    tela normal e o Ampliado so' POSICIONAM — nenhum controle nem estado duplicado (preso por teste). Cabecalho do Ampliado em DUAS
    linhas fixas: (1) barra de filtros de 26px — Lista|Fluxo · atalhos · de/ate' · Conta · A pagar|A receber|Ambos · Incluir
    vencidos · Recolher; (2) faixa dos cartoes de 24px (Vencidos · A pagar · A receber · Minimo · Caixa) com o "Exportar ▾" a' direita;
    (3) [CPR-SALDO-DIA-02, Gabriel 06/10: "no ampliado eu preciso sim clicar"] AS PILULAS DE STATUS, CLICAVEIS, numa TERCEIRA LINHA
    fixa de 20px (sempre presente; a frase do exportar a' direita): o MESMO no' (`ctlStatus`) e o MESMO estado da tela normal, com
    a classe do botao encolhendo no Ampliado (16px / 9,5px). ⚠ NA FAIXA DOS CARTOES NAO CABEM, MEDIDO: as quatro pedem 251,4px
    (50,8 · 69,7 · 60,7 · 58,2 + vaos) e sobram 245,1 ao lado do Exportar. Linhas em 36/26 · 66/24 · 94/20; cabecalho 119, "Saldo
    hoje" 141, rodape 544; ligar/desligar pilula (todas desligadas inclusive, com a mensagem de sempre) nao muda altura nem liga
    rolagem — iguais no NJ e no Agnaldo. O rotulo
    "Conta" sai no Ampliado (o seletor diz o nome). Medido a 1.126: barra 1.094 de 1.094, uma linha, 10,9px de folga; nenhuma data
    cortada. Trocar atalho, segmento ou a caixa no Ampliado nao move cabecalho (95), "Saldo hoje" (117) nem rodape (544) e nao
    liga rolagem na pagina. O botao Ampliar fica na barra 2 da tela normal. Excel/PDF: a tela nao tem.
  · FLUXO AMPLIADO: o grafico ocupa toda a area abaixo do cabecalho — 876 x 250 na tela normal, 1.084 x 375 no Ampliado (o
    `ResponsiveContainer` mede em pixels reais; nenhuma fonte escala: 9,5 / 10 / 11 / 12 / 13px nos dois). Trocar Lista <-> Fluxo
    mantem periodo, conta, segmento e o Ampliado. Nenhuma tag fora do grafico.
    · A ETIQUETA DE HOJE NAO ENCOSTA NO EIXO Y [CPR-SALDO-DIA-02; fecha a CPR-FLUXO-TAG-HOJE-EIXO-01]: quando hoje e' o PRIMEIRO
      ponto (o periodo comeca hoje) a etiqueta ancora pelo comeco e cresce para a DIREITA, a 4px do ponto (`ancoraDaTagDeHoje`,
      `RECUO_DA_TAG_DE_HOJE`); o traco continua no ponto e a anti-colisao sabe da largura de um lado so'. Fora disso, centrada como
      sempre. Medido na tela normal (876 x 250), menor distancia da etiqueta a qualquer rotulo do eixo: NJ · Banco do Brasil 30
      dias 23,5px, 60 dias 17,9px, Este mes 102,6px; Agnaldo · Bradesco 30 dias 23,5px; 0 sobreposicoes e 0 etiquetas fora nos quatro.
    · O PONTO "EM CONTA HOJE" [CPR-SALDO-DIA-02]: o saldo do cartao Caixa, antes dos vencidos que contam (`pontoEmContaHoje`). So'
      existe em separado quando difere da partida da linha (ao centavo); tem `title` "em conta hoje: R$ X · a linha parte de R$ Y
      apos os vencidos", entra na legenda como "Em conta hoje" e o tooltip de "Hoje" diz os dois numeros (antes dizia so' o do
      caixa, pela coalescencia das series). `ifOverflow="visible"`: ele pode ficar acima do ultimo tick (a escala e' a da linha).
    ⚠ NAO MEDIDO: o grafico no TAMANHO do Ampliado depois deste PR — em 06/10 a janela do Chrome estava em segundo plano e, com a
      aba oculta, o grafico nao se redimensiona (o `ResizeObserver` nao dispara): as medidas acima sao da tela normal. As pilulas e
      as alturas do Ampliado foram medidas por script (layout de aba oculta), sem ver a tela.
  ANTES x DEPOIS DO GRAFICO (06/10, "Ambos", ponto de hoje -> ponto final):
      NJ · Banco do Brasil (Caixa 604.088,31; contam 209.924,07 em 46; anteriores 3.636,50 a pagar e 7.173,39 a receber; ancora 30/09)
        Este mes   394.164,24 -> −116.182,20   |  igual (o piso antigo "de" = 01/10 coincidia com a ancora)
        30 dias    604.088,31 -> 14.339,40     |  394.164,24 -> −195.584,67
        60 dias    604.088,31 -> −123.419,20   |  394.164,24 -> −333.343,27
        16/10–15/11 604.088,31 -> 313.269,20   |  394.164,24 -> −226.887,58
      Agnaldo · Bradesco (Caixa 1,00; contam 19.493,32 em 6; anteriores 366.056,95 a pagar e 156.181,29 a receber; ancora 30/09)
        Este mes   −19.492,32 -> −39.671,83    |  igual
        30 dias    1,00 -> −39.671,83          |  −19.492,32 -> −59.165,15
        60 dias    1,00 -> −69.455,58          |  −19.492,32 -> −88.948,90
        16/10–15/11 1,00 -> −39.636,83         |  −19.492,32 -> −68.170,08
    Lista x grafico: partida, saldo no fim e tres dias intermediarios iguais ao centavo nos 4 atalhos, nas duas contas e em Todas (NJ).
  ⚠ O PONTO "HOJE" DO GRAFICO E' A PARTIDA; o que vence HOJE entra no dia seguinte do grafico e na faixa de hoje da lista.
  ⚠ PILULA "REALIZADO" DERRUBAVA A TELA (achado e consertado no CPR-SALDO-DIA-02): conta PAGA SEM VENCIMENTO chega pela busca (ramo
    "sem vencimento") e abria um grupo de dia com chave vazia — "Invalid time value", tela branca. O defeito vinha do
    CPR-PERIODO-VENCIDOS-01 (estava em "nao provado: pilula Realizado ligada"). Agora a chave vazia e' pulada: a paga sem
    vencimento nao e' listada por dia (e nunca somou).
  ⚠ DIVIDA CPR-PAGA-SEM-VENCIMENTO-SOME-01: depois da correcao da chave vazia, a conta PAGA SEM DATA DE VENCIMENTO nao e' listada em
    grupo nenhum; deve voltar APAGADA no grupo "Sem vencimento" (regra: nada some sem motivo). PR proprio.
  ⚠ NAO PROVADO NO CPR-SALDO-DIA-02 (homologacao do Gabriel): o grafico no TAMANHO do Ampliado (distancias da etiqueta), o tooltip de
    "Hoje" aberto, o clique real nas pilulas (foram cliques por script) e nenhum screenshot do passo.
  ⚠ DECISAO PENDENTE CPR-CARTAO-NO-SALDO-TODAS-01: em "Todas as contas", conta a pagar em cartao de credito ou sem conta desconta
    do saldo no VENCIMENTO DELA (herdado do grafico); o dinheiro so' sai na fatura. So' os VENCIDOS delas ficam fora.
  PROVA DO GESTO (cliente Teste, 06/10, desfeita): o 5a9f8ea4 ("Pensão Crianças", 6.484,00, vencimento 10/08) estava em "Vencidos
    anteriores… · fora do saldo"; aberto pela linha, vencimento -> 20/10, Salvar: SEM F5 saiu do subgrupo, apareceu na faixa de
    20/10 e os cartoes mudaram (Vencidos 6.484,00 -> 0,00; A pagar 0,00 -> 6.484,00); devolvido a 10/08, a tela voltou identica.
    ⚠ PARCIAL: o cliente Teste NAO TEM CONTA COM ANCORA (Caixa "—"), entao Saldo no fim, Minimo e grafico mudando pelo valor NAO
    foram vistos na tela — so' por teste do dono.
  ⚠ DIVIDAS: CPR-CONTA-NO-AMPLIADO-01 (a coluna Conta nao coube no Ampliado; o nome fica no `title` da Descricao) · o N do titulo dos
    subgrupos conta os dois lados e a listagem so' o segmento · a conta PAGA SEM VENCIMENTO nao aparece em grupo nenhum · NAO PROVADO NO NAVEGADOR: o saldo mudando pelo valor depois de
    salvar (o Teste nao tem ancora), a faixa "Entre hoje e DD/MM" (so' por teste e pelo calculo do dono sobre os dados reais), o
    contraste dos dois tons do rodape navy medido na tela (calculado: ~6,4:1 e ~8,8:1), sair da tela com o Ampliado ligado (so'
    por teste de fonte), e, no Ampliado, DIGITAR nas datas e ABRIR o seletor de conta (sao os mesmos nos da tela normal; no
    navegador foram trocados atalho, segmento e a caixa).
- ⚠ CONTAS A PAGAR E RECEBER DIZ O QUE AINDA E' ESTIMATIVA, PELA REGRA UNICA DA RECORRENCIA (REC-VALOR-CERTO-02, Gabriel 06/10/2026,
  so' tela): "quando a gente tem uma previsão de contas a pagar, é legal ter uma ideia desse valor: muitos são previsão, outros já
  são confirmados."
  · A REGRA E' UMA: `ocorrenciaEstimada({ valorAConfirmar, valorDoMesEm, status })` (`src/lib/financeiro/recorrenciasDoMes.ts`) —
    recorrencia A CONFIRMAR cuja ocorrencia nao tem a marca do valor do mes nem esta' realizada/conciliada. A tela de Recorrencias
    (`linhasDoMes`) e a CPR julgam por ELA; `cprRecorte.ts` NAO julga (preso por teste: nao cita marca nem tipo do valor).
  · DADO: a consulta da lista (`cpr-lancs`) le' a view `vw_financeiro_lancamentos_v2_doc`, que NAO expoe `recorrencia_id` nem
    `valor_do_mes_em` (medido) — "acrescentar a' mesma consulta" exigiria mudar a view (banco). Entrou UMA leitura por cliente,
    `cpr-estimadas` (`lerEstimadasDoCliente`, `useRecorrencias.ts`): (1) os ids das recorrencias com `tipo_valor = 'estimado'`;
    (2) SO' se houver alguma, as ocorrencias vivas delas, e `idsEstimados` monta o conjunto pela regra unica. NUNCA por linha. Hoje
    (06/10) nenhuma recorrencia esta' "A confirmar": a segunda leitura nao acontece. Invalida junto com as outras chaves da tela.
  · DONO: `recortarCpr(…, { estimadas })` devolve `aPagarConfirmado` / `aPagarEstimado` (e `aReceberConfirmado` / `aReceberEstimado`),
    em CENTAVOS inteiros, sobre as MESMAS linhas do total do rodape (vencidos, se a caixa esta' ligada, + periodo): confirmado +
    estimado = total, ao centavo. Conta que nao e' de recorrencia — e tudo, sem o conjunto — e' confirmada. NADA MUDA NO SALDO
    (baldes, totais e a serie identicos com e sem o conjunto, preso por teste).
  · LISTA (normal e Ampliado): a conta estimada leva o selo "estimado" (ambar, 9px, 14px) DEPOIS da descricao, dentro da celula — a
    descricao corta antes, o selo nunca — e o valor dela em ambar; `title` do selo "valor estimado pela recorrência · informe o
    valor do mês no lançamento". Conta paga nao leva selo. Linha de 18px, igual.
  · TOTAIS: SO' NO AMPLIADO, na terceira linha (a das pilulas, 20px), a' direita: "confirmado ▼ X" e "estimado ▼ Y" (o segundo em
    ambar), num lugar RESERVADO de 316px que existe sempre e so' se preenche com estimado > 0. NA TELA NORMAL NAO COUBE: a faixa
    "A pagar por conta" tem 154px livres dos 316 (medido no NJ) — os dois numeros vao no `title` do cartao "A pagar". A RECEBER
    nao e' desenhado (nao ha' recorrencia de entrada estimada).
  Medido a 1.126 no NJ (so' leitura): linha 18px com e sem o selo (selo 47 x 14, 9px; a descricao de 185px corta antes dele); os
  dois pares com "▼ R$ 99.999.999,99" pedem 154 + 144 + 12; pilulas 50,8 · 69,7 · 60,7 · 58,2 e cabecalho 119 / rodape 544 como antes.
  Numeros reais, 30 dias, Ambos: NJ total a pagar 1.781.011,29 = confirmado, estimado 0,00; Vera 61.783,03 = confirmado, estimado
  0,00 (nenhuma recorrencia marcada "A confirmar" no banco). Saldo do NJ igual ao publicado (Caixa 1.283.617,05; fim −379.341,22).
  ⚠ MEDIR SEM TROCAR NO' DO REACT: ao medir o selo eu SUBSTITUI um no' da lista por um clone e a tela ficou BRANCA no gesto
    seguinte (o React foi remover um no' que ja' nao estava la'). Medida de pior caso vai num CLONE SOLTO no `body`, nunca dentro
    da arvore que o React controla.
  · LEITURA INCOMPLETA: a leitura das ocorrencias estimadas tem teto de 5.000 linhas (`TETO_OCORRENCIAS_ESTIMADAS`); batendo nele, a
    tela escreve o aviso no `title` do selo, dos dois totais e do cartao "A pagar" (`AVISO_ESTIMADAS_INCOMPLETO`). SO' no `title`: ao
    lado dos totais nao cabe (o lugar de 316px fica cheio no pior numero).
  ⚠ DIVIDAS: REC-VALOR-CERTO-EXPORT-01 (PDF e Excel da CPR sem o selo "estimado" e sem os dois totais — a regua do PDF e' medida e
    nao foi tocada) · REC-VALOR-CERTO-TELA-NORMAL-01 (os dois totais confirmado / estimado so' existem no Ampliado; na tela normal
    vao no `title` do cartao "A pagar") · `(supabase as any).from` nas duas leituras (colunas fora do `types.ts`).
  ⚠ NAO PROVADO: o selo e os dois totais com conta estimada REAL (nenhuma recorrencia esta' marcada "A confirmar": so' teste e
    medicao de clone) · o lugar de 316px REMEDIDO na tela (foi alargado de 290 depois da medicao) · o gesto no cliente Teste (nao
    ha' recorrencia la') · o aviso de leitura incompleta (nenhum cliente chega perto do teto).
- ⚠ CONTAS A PAGAR E RECEBER EXPORTA O QUE A TELA MOSTRA, E O ARQUIVO NAO FAZ CONTA (CPR-EXPORT-01, Gabriel 05–06/10/2026, so' tela,
  sem consulta nova). Botao "Exportar ▾" (PDF · Excel), UM no' (`ctlExportar`): na barra 2 da tela normal, antes do Ampliar, e no
  Ampliado a' direita da faixa dos cartoes. Exporta o recorte DO MOMENTO DO CLIQUE (periodo, conta, segmento, caixa de vencidos,
  status). Gerando: "Gerando…" e desabilitado; sem contas no recorte: desabilitado com o motivo no `title`. Erro e aviso ficam
  ESCRITOS ao lado do botao (`cpr-exportar-recado`), nunca em toast.
  · QUEM FAZ O QUE: os numeros sao do dono (`cprRecorte.ts`); `src/lib/pdf/cpr/modeloCpr.ts` so' os ESCREVE (texto, seta e tom
    de cada celula — a mesma regra do `CelValor` da tela); `DocumentoCpr.tsx` so' DESENHA; `gerarPdfCpr.tsx` monta e baixa;
    `src/lib/financeiro/cprExcel.ts` monta a planilha. Nenhum dos quatro soma, filtra ou reclassifica (preso por teste de fonte). NAO usar jspdf.
  · AGREGADOS NOVOS, NO DONO E EM CENTAVOS: `SerieDoSaldoCpr.totalPagar/totalReceber` (tudo o que a serie consome: hoje − a pagar
    + a receber = fim); `resumoPorSemanaCpr(serie, periodo)` (segunda a domingo, cortada em "de" e "ate'"; semana sem conta repete
    o saldo; a ultima fecha no saldo no fim); `saldoPorContaCpr(linhas, opcoes, caixaDe, contasComCaixa)` (o mesmo recorte e a
    mesma serie, conta a conta; cada linha fecha sozinha e as contas somam o total de "Todas" em caixa, a pagar e a receber;
    conta sem caixa — cartao de credito, sem conta — tem saldo nulo e o que vence nela entra no total; SO' ENTRA conta com caixa
    diferente de zero OU com a pagar / a receber no recorte — a zerada e sem movimento sai, e a soma nao muda).
  · PDF: chassi do executivo (`PdfHeader` com `titulo` e `linha2` por prop — sem elas o executivo sai identico, preso por teste —,
    `PdfRodape`, `estilos`, `COR`, `carregarLogoBase64`). A LOGO e' `src/assets/logo.png`, a do AGROinBLUE, a mesma de todo PDF do
    sistema. A4 PAISAGEM (a tabela tem ate' doze colunas: em retrato os 551pt uteis nao levam as onze a 7pt). Cabecalho e rodape
    fixos (pagina N de M). Bloco de numeros: Caixa hoje · Vencidos que contam · A pagar no periodo · A receber no periodo · Minimo
    (e o dia) · Saldo no fim (e a data); com a caixa desligada o primeiro vira "Saldo de partida · apos vencidos". Tabela como a
    lista do Ampliado (Comp. · Venc. · [Conta, so' em "Todas"] · Descricao · Fornecedor · Subcentro · Safra · Faz. · Status · A
    pagar · A receber · Saldo): "Saldo hoje", vencidos que contam, cada dia com a faixa de fechamento, "Fim do periodo". Texto
    longo corta com reticencia; numero, data e status nao; a faixa nao fica orfa (ela e a primeira conta nao se partem). Depois,
    em pagina propria: vencidos anteriores a' conciliacao (com a frase), sem vencimento, resumo por semana e, em "Todas", resumo
    por conta. NENHUM BLOCO CONTINUA NOUTRA PAGINA SEM O CABECALHO: os dois resumos e os blocos de ate' 30 contas vao INTEIROS
    (`wrap={false}`); bloco de contas maior ganha pagina propria com o cabecalho da tabela fixo. Segmento "A pagar" / "A receber":
    a tabela lista so' o lado e a nota diz que totais e saldo sao dos dois lados.
    REGUA (pt, 7pt nas linhas, 7,5 no titulo da faixa, 8 no fim, 11 nos numeros): Comp. 26 · Venc. 38 · [Conta 64] · Descricao = o
    resto (170 sem Conta, 126 com) · Fornecedor 112 (100 com Conta) · Subcentro 104 (94) · Safra 46 · Faz. 24 · Status 50 · A pagar 70 ·
    A receber 70 · Saldo 80. Texto que corta para 5pt antes da coluna vizinha e NAO hifeniza (`hyphenationCallback`). ⚠ AS SETAS SAO DESENHADAS (`Svg`), e o negativo usa "-": a fonte padrao do motor nao tem ▲ ▼ nem "−".
  · EXCEL: pelo caminho de sempre (`triggerXlsxDownload` -> funcao `export-xlsx`, o do Financeiro). "Contas": uma linha por conta
    listada (17 colunas, com Grupo: vencido que conta / vencido anterior / periodo / sem vencimento). "Saldo por dia": Saldo hoje,
    vencidos que contam e cada dia. VALORES COMO NUMERO.
    ⚠ DIVIDA CPR-EXPORT-DATA-COMO-DATA-01: AS DATAS VAO COMO TEXTO DD/MM/AAAA — a `export-xlsx` so' aceita texto, numero, booleano
      e nulo (nao ha' celula de data no contrato dela); e' a convencao do exportador do Financeiro. Data como DATA pede mudar a
      funcao (ou gerar a planilha no navegador): decisao do Gabriel; ligada a' XLSX-DATA-COMO-DATA. Aceito por ora (06/10).
  · NOME: `contas-a-pagar-receber_{cliente}_{conta|todas}_{AAAA-MM-DD}_a_{AAAA-MM-DD}` (.pdf / .xlsx), sem acento nem espaco.
  Provas (06/10, 30 dias, Ambos): NJ · Banco do Brasil 8 paginas, Agnaldo · Bradesco 3, NJ · Todas 11 — numeros, tres faixas de
  dia e o fim iguais a' tela; Excel com 226 / 48 / 313 linhas = contas listadas, somas = rodape, ultima linha de "Saldo por dia" =
  saldo no fim; "Resumo por conta" do NJ soma caixa 1.283.617,05, a pagar 1.777.374,79 e a receber 114.416,52. Medido a 1.126:
  barra 2 em 886 de 886 (Exportar 74,9px, 80px de folga), Ampliado barra 1.094 e faixa 1.092, 0 valores cortados.
  ⚠ DIVIDA CPR-EXPORT-CLIQUE-REAL-01 (homologacao do Gabriel): NAO PROVADO — o CLIQUE REAL em "Exportar ▾ -> PDF" e "-> Excel" (o nome
    do arquivo salvo pelo navegador, o "Gerando…" voltando); os PDFs do Agnaldo regenerados depois das correcoes visuais (os
    numeros deles foram conferidos antes delas); o BLOCO DE MAIS DE 30 CONTAS em pagina propria com o cabecalho fixo (caso Agnaldo ·
    Todas, 31 anteriores); e o detalhe do "Saldo de partida" numa linha (preso por teste da arvore do documento, sem PDF gerado).
    A janela do Chrome ficou em segundo plano em 06/10 e a geracao em aba oculta nao termina (o navegador segura os temporizadores).
  ⚠ O PDF QUE "DEU ERRO" EM REUNIAO (Gabriel, 06/10 a' tarde; PARC-LIVRES-01 passo 0): NAO REPRODUZIDO no NJ em localhost — 9
    variacoes geraram o arquivo (30 e 60 dias, este mes; todas e Itau BBA; a pagar, a receber, ambos; com a pilula Realizado), 0
    erro no console. CAUSA PROVAVEL, nao provada: a pagina estava aberta desde a manha e houve publicacoes no meio do dia — o
    pedaco do PDF se carrega por `import()` e o arquivo antigo deixa de existir no servidor. Essa falha caia no `catch` da TELA
    (fora do `gerarPdfCpr`) e saia a mensagem crua do navegador, em ingles, com o endereco do arquivo. CONSERTO: a frase mora em
    `src/lib/pdf/cpr/falhaDoPdf.ts` (`motivoDaFalhaDoPdf`, movida verbatim; importada ESTATICAMENTE) e o `catch` da tela a usa:
    "O aplicativo foi atualizado depois que esta página abriu. Recarregue a página (Ctrl+R) e gere o PDF de novo." — escrita ao
    lado do botao. ⚠ FRASE DE FALHA DE `import()` NUNCA MORA NO MODULO IMPORTADO. O Excel nao tem pedaco dinamico.
    ⚠ NAO MEDIDO: a mensagem real que o Gabriel viu (nao ha' registro), "Escolher datas" 01/10–30/11 e a caixa de vencidos
      desligada no navegador; com a aba em segundo plano a geracao leva ate' ~1 min (temporizadores do navegador), sem erro.
  ⚠ DIVIDA CPR-EXPORT-LOGO-DO-CLIENTE-01: NAO EXISTE LOGO POR CLIENTE — todo PDF sai com a do AGROinBLUE (decisao do Gabriel pendente).
  ⚠ DIVIDAS: o PDF pesa 0,5 a 2,9 MB (a logo vai como PNG de 291 KB e o motor a repete por pagina — igual ao executivo) · o
    regra de seta/tom existe na tela (`CelValor`) e no modelo (`celulaDeValor`): quem mexer numa confere a outra · NAO PROVADO NO
    NAVEGADOR: o download real pelo clique (a prova capturou o arquivo em memoria e a planilha foi pedida a' `export-xlsx` com o
    mesmo payload), caixa de vencidos desligada, fazenda filtrada, "de" futuro e "sem vencimento" no PDF (so' por teste).
- ⚠ PARCELAS LIVRES AO CRIAR: O SISTEMA NAO FIXA DIA NEM VALOR DE PARCELA, E A TELA NAO SOMA (PARC-LIVRES-01 passo 1, Gabriel
  06/10/2026; migration 20261027194000, ⚠ registrada como 20261006224522; ledger = arquivo, md5 7cc0ca7b…; patch guardado por md5,
  7 ancoras: `fn_parcelamento_cadastrar` 6bf9d80b… -> 7d9874b0…). Nasce da NF 000.000.518 do NJ: 110.000,00 em sete duplicatas
  (entrada de 33.000,00 e seis a cada 28 dias), que o parcelamento mensal nao aceitava.
  · BANCO: a chave OPCIONAL `parcelas` [{numero, data_vencimento, valor}] no payload. SEM ela o corpo e' o de antes (N iguais,
    mensais, a ultima com a sobra; 6 de 6 payloads identicos). COM ela grava EXATAMENTE a lista e RECUSA (22023, frase, nada
    gravado): lista vazia; `total_parcelas` ≠ tamanho; numeracao que nao vai de 1 a N; data vazia; valor <= 0 ou com mais de duas
    casas; SOMA EM CENTAVOS ≠ `valor_total`. A "1ª parcela" do contrato = o vencimento da parcela 1 da lista.
    ⚠ DEFEITO ANTIGO CONSERTADO JUNTO: as quatro recusas da funcao usavam `raise exception 'x' using …, message='y'`, que o
      PL/pgSQL recusa em execucao ("RAISE option already specified: MESSAGE") — a frase nunca chegava a' tela. A forma certa e'
      `raise exception using errcode=…, message=…`. E `to_char` com G/D usa o locale en: numero em frase vai por
      `translate(to_char(v, 'FM999,999,999,990.00'), ',.', '.,')`.
  · DONO PURO, EM CENTAVOS INTEIROS: `src/lib/financiamentos/parcelasLivres.ts` — `resumoDasParcelas` (N, soma, compra,
    diferenca = soma − compra), `motivoNaoSalva` (sem parcela · sem vencimento · sem valor · "A soma das parcelas não fecha com a
    compra."), os gestos (`editarVencimento`, `editarValor`, `acrescentarParcela` — nasce SEM data e SEM valor —, `retirarParcela`,
    `porDiferencaNaUltima`), `deOndeVeio` ("duplicata da nota" / "editado · era {data · valor}"), `parcelasParaPayload`. PARCELA
    PAGA NAO MUDA em nenhuma funcao (preparado para o passo 2). UM centavo de diferenca trava.
  · A GRADE E' UMA: `GradeDeParcelas` (`src/components/financiamentos/`). Barra de 26px ("Igual todo mês" | "Parcelas livres",
    "+ Parcela", o voltar), lista com cabecalho navy preso (# 30 · Vencimento 104 · Valor 112 · De onde veio · ✕ 22; linha de
    19px), rodape de totais congelado EM TABELA (N parcelas · Soma · Valor da compra · Diferença "0,00 ✓" verde ou ▲/▼ vermelho) e
    faixa de aviso de 18px SEMPRE presente. Diferenca ≠ 0: a frase vermelha e os DOIS gestos — "Pôr ±X na parcela N" (a ultima nao
    paga; apagado com o motivo se ela zeraria) e "A compra vale {soma}" (apagado sem `onCompraVale`). O SISTEMA NAO ESCOLHE.
    Voltar ao "Igual todo mês" com edicao PERGUNTA na linha. O valor da parcela aceita a conta no campo (`contaNoCampo.ts`). A
    grade nao tem `reduce` nem `+=` (teste de fonte com auto-teste). No mensal e' so' leitura: mostra o que a RPC grava.
  · ONDE: (1) `LancamentoV2Dialog`, aba Pagamento, no lugar da previa antiga; o Salvar fica apagado com `motivoDasParcelas` ESCRITO
    ao lado (`motivo-das-parcelas`); nas livres o "Nº de Parcelas" e o Vencimento do lancamento sao OS DA LISTA; o payload leva
    `parcelas` so' nas livres (`montarPayloadParcelamento`: sem a lista, as 19 chaves de sempre, sem chave nula). A altura da
    grade no modal segue a JANELA (`clamp(140px, calc(100vh - 355px), 236px)`), nunca o conteudo. (2) `ObrigacaoDialog`, criacao
    de parcelamento, aba Parcelas (altura 276; "o contrato" nas frases; "O contrato vale {soma}"); nas livres "Nº de parcelas" e
    "1ª parcela" ficam em leitura. ⚠ A previa antiga dessa tela deixava EDITAR a data de cada parcela e a RPC a ignorava: agora
    o mensal e' leitura. Financiamento, emprestimo e a EDICAO nao mudaram (fotos identicas; so' a foto da criacao de parcelamento
    foi regravada, de proposito).
  · XML: `ParcelamentoProposto` 'fora_do_padrao' virou `{ tipo: 'livres', parcelas: N }` — as duplicatas com valor ou data
    proprios entram DIRETO em "Parcelas livres", como estao na nota, com o recado `fraseParcelasComoNaNota(N)`;
    `FRASE_DUPLICATAS_FORA_DO_PADRAO` e `DuplicatasDoXml` SAIRAM. Duplicatas no padrao mensal seguem "Igual todo mês" (linhas
    "duplicata da nota"), com a opcao de passar para livres. "= valor da nota" / "nota X · diferença Y" passou a ser o recado da
    grade. A lista de notas diz "N · parcelas livres".
  ⚠ DESVIO DO MOCK, DECLARADO: as colunas Nota fiscal e Boleto NAO estao nesta grade — seguem na aba Documentos
    (`ParcelasDaCompra`), que le' as MESMAS linhas (`parcelaRows` = a lista do modo aberto) e continua casando os boletos por
    ordem de vencimento. A grade tem a prop `extras` para recebe^-las; juntar as duas e' o passo 3.
  Medido a 1.126 x 579 no cliente Teste, sem gravar: modal 1024 x 547, corpo SEM rolagem (448 de 448), grade 724 x 224, lista
  rolando por dentro com cabecalho (316) e rodape (473) parados ao rolar, linhas de 19px, 0 cortes; Parcelamentos: dialogo
  1024 x 558, grade 698 x 276, "99.999.999,99" no campo sem corte, a frase + os dois gestos numa linha. A 523 de altura a grade
  do modal fica com 168px (pela formula, nao medido). Provas: 16 mutacoes de tela mortas e 7 de banco; teste SQL
  `supabase/tests/parc_livres_01_test.sql` (T1–T3, cliente Teste, termina em RAISE OK).
  ⚠ NAO PROVADO NO NAVEGADOR: o SALVAR pela tela (nenhum parcelamento foi gravado: provado pelo payload em teste e pela RPC no
    teste SQL), a nota real do NJ, o DatePicker da linha digitado, e a janela de 523 de altura.
  ⚠ DIVIDAS: PARC-LIVRES-FREQUENCIA-ROTULO-01 (na tela de Parcelamentos o seletor diz "Igual todo mês" tambem com frequencia
    bimestral/anual) · o rodape de totais mede 21px (declarado 20) · o resumo lateral do `ObrigacaoDialog` segue rolando por
    dentro (368 de 447, anterior a este PR) · a costura clara de 1px entre "#" e "Vencimento" no cabecalho navy (subpixel).
- ⚠ PARCELAMENTO TEM UM ESCRITOR SO' DOS SEUS LANCAMENTOS; O MOTOR DO FINANCIAMENTO NAO ENTRA NELE (PARC-LIVRES-01 passo 2A, Gabriel
  06/10/2026; migration 20261027194100, ⚠ registrada como 20261006234925; ledger = arquivo, md5 8845ff67…; patch guardado por md5:
  `fn_reconciliar_parcela_financiamento` 7af8dbfb… -> d8063b41…, `fn_financiamento_pagar_pelo_extrato` 3a642f9f… -> 34d5a1e8…).
  · O DEFEITO (NJ, "Protocolo IATF", 06/10 23:29 UTC): o lapis da parcela (`ModalBaixaParcela`) chama o motor do financiamento. O
    lancamento que `fn_parcelamento_cadastrar` cria nasce com `origem_lancamento` NULO; o motor so' reconhece
    'parcela_financiamento', tratava-o como "origem invalida", CANCELAVA-o e CRIAVA outro — "Parcela i/N Descricao", status derivado
    da parcela (vencida = previsto), sem safra, sem forma e sem documento (que ficou no cancelado), com o 🏦 na lista (o icone le'
    `origem_lancamento = 'parcela_financiamento'`, `FinanceiroV2Tab.tsx`). ⚠ NAO ERA "REESCRITA": era cancelar + criar.
    E o gravador do contrato (`saveEdit`, `FinanciamentoDetalhe.tsx`), ao mudar a "1ª parcela", deslocava SO' `financiamento_parcelas`:
    parcela e lancamento ficavam com datas diferentes.
  · O CONSERTO: (1) o motor devolve `{skip: 'parcelamento_tem_escritor_proprio'}` para contrato de natureza 'parcelamento', antes
    de qualquer leitura ou escrita de lancamento; financiamento e emprestimo: saida do `p_dry_run` IDENTICA em 547 parcelas, antes x
    depois na mesma transacao; (2) `fn_financiamento_pagar_pelo_extrato` RECUSA parcela de parcelamento, tambem na simulacao
    ("Parcela de parcelamento se paga pelo lançamento dela: …"; 0 usos ate' hoje — ele trocava o valor da parcela pelo do
    extrato); (3) tela: no parcelamento o lapis da parcela fica APAGADO com o motivo (`MOTIVO_PARCELA_DE_PARCELAMENTO`,
    `valorDasParcelas.ts`) no detalhe e no dialogo, a "1ª parcela" fica em leitura na edicao, e o `saveEdit` nao desloca parcelas
    nem leva `data_primeira_parcela`. Financiamento e emprestimo: fotos do dialogo identicas.
  · MEDIDO (06/10): so' UM contrato real foi desfigurado (NJ, 5 lancamentos; os 5 originais cancelados tinham safra, Boleto e
    documento); o Teste tem 6 de ensaios antigos. 16 parcelamentos no total (NJ 12, Vera 4) + 2 no Teste.
  · REPARO DO "PROTOCOLO IATF": `docs/investigacao/parc-livres-01-2a-reparo-protocolo-iatf.sql` — EXECUTADO em 06/10/2026 com o
    SIM do Gabriel (commit 779ad562): os 5 originais voltaram a valer (safra 26/27-Pec, Boleto, a nota ligada a's cinco), os 5 do
    motor foram cancelados pelo dono, e parcela = lancamento em 12/09, 12/10, 12/11, 12/12/2026 e 12/01/2027; contrato 72.769,70,
    5 vivas, 0 divergentes. O DESLOCAMENTO DE 30 DIAS NAO PODE MAIS ACONTECER em parcelamento: o `saveEdit` nao desloca parcelas
    nem leva `data_primeira_parcela` (preso pelo teste "2A — parcelamento não passa pelo editor de parcela nem pelo deslocamento
    do contrato"), e a data de cada parcela so' muda pela RPC do 2B, que grava parcela e lancamento juntos.
  Teste: `supabase/tests/parc_livres_01_2a_test.sql` (T1–T4; no corpo antigo cai em T1 com 'cancelar_lanc_atual'); 5 mutacoes de tela mortas.
  ⚠ ENTRE O 2A E O 2B/4 a parcela de parcelamento NAO se edita nem se paga pela tela do contrato (lapis apagado): paga-se pelo
    lancamento no Financeiro; a grade de edicao e' o passo 2B e a leitura da situacao pelo lancamento, o passo 4.
  ⚠ PARCELAS EM DOBRO NO NJ (proposta, nada alterado): o contrato tem 5 parcelas e a mesma obrigacao (doc 249220, 5 x 14.553,94) ja'
    tinha a 1ª paga pelo banco (c6a665f9, conciliada em 14/09) e a 2ª vinda da planilha (322f7467, "Parcela 2 - None", 12/10).
  ⚠ NAO PROVADO NO NAVEGADOR: o lapis apagado e a "1ª parcela" em leitura (so' por teste).
- ⚠ EDITAR AS PARCELAS DE UM PARCELAMENTO JA' CRIADO E' UMA RPC SO', ATOMICA (PARC-LIVRES-01 passo 2B, Gabriel 06/10/2026; migration
  20261027194200, ⚠ registrada como 20261007000435; ledger = arquivo, md5 391d90f1…). `fn_parcelamento_editar_parcelas(
  p_financiamento_id, p_parcelas, p_valor_total)` (md5 04ec64c3…; GRANT a `authenticated`) recebe a lista FINAL das parcelas do
  contrato, na ordem da tela — [{id?, data_vencimento, valor}] — e grava `financiamento_parcelas`, o lancamento de cada parcela e o
  contrato (`valor_total`, `total_parcelas`, `data_primeira_parcela`) na mesma transacao. NAO HA' segundo caminho.
  · PARCELA PAGA NUNCA MUDA: paga = parcela 'pago' OU lancamento realizado/conciliado OU lancamento com vinculo vivo ao extrato
    (`_fn_parcela_de_parcelamento_paga`, interna; espelho na tela: `pagaEm`, `parcelasLivres.ts`). A paga tem de vir na lista com a
    MESMA data e o MESMO valor; mudar ou tirar e' RECUSADO (22023, "A parcela N já está paga: …"), sem gravar nada.
  · NAO PAGA: muda data e valor — na parcela e no lancamento, e SO' esses dois campos do lancamento (nome, status, competencia,
    safra, forma, plano, fornecedor, conta e fazenda ficam); a que sai da lista e' RETIRADA (lancamento cancelado pelo dono
    `fn_cancelar_lancamento_auditoria`, parcela 'cancelado'); a sem `id` e' ACRESCENTADA (o lancamento copia classificacao, safra,
    cultura, fase, fornecedor, forma, conta, fazenda e competencia da parcela de maior numero do contrato e HERDA a nota fiscal da
    compra: o documento NF vivo ja' ligado a outra parcela por `financeiro_documento_vinculos`). A retirada segue ligada a' NF,
    como toda parcela cancelada.
  · A SOMA EM CENTAVOS DA LISTA = `p_valor_total`, senao recusa com os dois numeros. O numero da parcela e' a posicao na lista, e o
    "i/N" do nome acompanha SO' quando o nome ainda e' o gerado (`_fn_parcela_descricao`, o dono do texto; nome posto a' mao fica).
    Nas pagas so' esse trecho muda.
  · TELA: Editar obrigação › aba Parcelas mostra a MESMA `GradeDeParcelas` (sem o seletor de modo) sobre as parcelas gravadas
    (`parcelasGravadasParaGrade`): a paga APAGADA, sem campo e sem ✕, com "paga em dd/mm/aa: data e valor não mudam" no `title`, e
    na soma; "+ Parcela", ✕, "Desfazer alterações" (volta a's gravadas, ANTES de salvar — depois de salvo a volta e' editar de
    novo); a soma contra o valor do contrato com os dois gestos ("Pôr ±X na parcela N" nao paga / "O contrato vale {soma}").
    Salvar apagado com o motivo na pendencia; ao salvar, a RPC vai ANTES do gravador do contrato e so' quando a grade mudou; a
    recusa fica ESCRITA ao lado do botao (`erro-da-grade`) e o contrato nao e' gravado. Depois: `notificarLancamentosMudaram` e as
    chaves da tela e da CPR invalidadas. Os campos da aba ficam numa linha so' (como na criacao).
  Provas: teste SQL `supabase/tests/parc_livres_01_2b_test.sql` (E1–E4; 12 mutacoes de banco — 11 mortas e 1 equivalente: tirar o
  `v_el is null` nao muda nada, a comparacao com nulo ja' recusa); 9 mutacoes de tela mortas. NO NAVEGADOR, cliente Teste, 1.126 x
  579: criado pelo modal do lancamento um parcelado LIVRE de 3 parcelas (100,00 em 10/11 · 121,00 em 05/12 · 79,00 em 20/01) —
  o SALVAR DO PASSO 1, provado pela tela —; com a 1ª paga, a grade do contrato abriu com ela apagada; mudei a 2ª para 100,00,
  tirei a 3ª e acrescentei 120,00 em 10/02: diferenca ▲ 20,00, Salvar apagado com a frase, "O contrato vale 320,00", salvo —
  banco: contrato 320,00 / 3 parcelas, parcela = lancamento nas tres, a paga intocada, a retirada cancelada (parcela e
  lancamento), a nova com a classificacao. Dialogo 1024 x 558, grade 698 x 276, linhas de 19px, 0 cortes.
  ⚠ O DEFEITO DE 05/10 ("descricao, forma e classificacao nao persistem") NAO E' A MESMA CAUSA: o contrato grava e reabre certo desde
    o PARC-OBRIGACAO-EDICAO-01a; o que falta e' LEVAR descricao, classificacao e forma do contrato aos lancamentos das parcelas
    (PARC-PROPAGACAO-PARCELAS-01, aberta).
  ⚠ DIVIDAS: o DETALHE do contrato lista a parcela CANCELADA e a soma no Total e no "N parcelas" (medido no Teste: 4 parcelas,
    Total 399,00 num contrato de 320,00) — sai no passo 4, que troca os cartoes e a situacao por uma leitura do banco · o resumo
    lateral do dialogo diz "3 × R$ 100,00" (a 1ª parcela) tambem com parcelas diferentes · mes fechado: a recusa vem crua do
    dono do cancelamento ("competencia … em mes fechado") · a RPC nao tem simulacao · o resumo lateral segue rolando por dentro
    (368 de 417) · NAO PROVADO NO NAVEGADOR: a recusa da RPC escrita ao lado do botao, "Desfazer alterações", "Pôr na parcela N",
    a NF herdada (so' por teste) e a janela de 523 de altura.
- ⚠ PAGOU NO FINANCEIRO, O CONTRATO MOSTRA: O DONO DA SITUACAO "PAGA" E' O LANCAMENTO (PARC-LIVRES-01 passo 4, Gabriel 06/10/2026;
  migration 20261027194300, ⚠ registrada como 20261007013925; ledger = arquivo, md5 305af222…). Nasce do "Lascas Eucalipto Tratado"
  do NJ: tres parcelas pagas e conciliadas pelo Financeiro e o contrato dizia "Pago R$ 0,00 · 0/6 · Vencido R$ 23.800,00".
  · NAO EXISTE (e nao se cria) gatilho lancamento -> parcela: `financiamento_parcelas.status` so' muda pelo editor antigo de
    parcela. PROIBIDO sincronizar copiando estado para a parcela.
  · A LEITURA E' UMA, NO BANCO: `fn_financiamento_situacao(p_financiamento_id, p_hoje)` (md5 a3f310c2…; so' leitura, `tenant_ok`,
    42501) devolve `parcelas` VIVAS — a 'cancelado' NAO entra, nem na lista nem nas somas — com `situacao`, `pago_em`,
    `valor_pago`, `lancamento_id`, `lancamento_juros_id`, `fonte` e `diverge`, e os `cartoes` prontos (valor_contrato, pago,
    a_vencer, vencido, pagas, parcelas, juros_previstos, soma_principal, soma_total, divergentes). `p_hoje` e' a data LOCAL da tela.
      com lancamento vivo: PAGA = TODOS os lancamentos vivos da parcela realizados ou conciliados (principal e, no financiamento,
        juros); so' ALGUM = 'parcial' (valor_pago = o realizado; o resto conta em vencido / a vencer); senao VENCIDA (vencimento <
        hoje) ou PENDENTE;
      sem lancamento vivo (legado sem espelho, ou lancamento cancelado): nao ha' dono — vale a parcela, `fonte = 'parcela'`;
      `diverge` = a coluna da parcela diz outra coisa (informacao; vale o lancamento; nada e' acertado por UPDATE).
  · TELA (`FinanciamentoDetalhe.tsx`, todo contrato — parcelamento, financiamento e emprestimo): cartoes, lista, total e
    progresso sao os do banco (`useSituacaoDoContrato`, leitor sem cast `src/lib/financiamentos/situacaoDoContrato.ts`); a tela
    NAO soma nem le' `status` (preso por teste de fonte); sem resposta, "…", nunca R$ 0,00. O LAPIS E O "Ver" ABREM O LANCAMENTO DA
    PARCELA NO MODAL DO FINANCEIRO (`LancamentoDaParcelaDialog` -> `LancamentoV2Dialog`); com juros, o lapis e o "Ver" abrem o
    principal e a linha oferece "juros"; parcela sem lancamento: lapis APAGADO com "Parcela sem lançamento no Financeiro.". Ao
    salvar ali o canal do Financeiro avisa e o contrato rele sozinho. `ModalBaixaParcela` e `DialogVerLancamentosOficiais` NAO
    sao mais abertos por esta tela (o primeiro segue aberto pelo `ObrigacaoDialog` na edicao de FINANCIAMENTO com juros; o
    segundo ficou sem chamador — apagar e' decisao).
  · MEDIDO (06/10) — parcela x lancamento, por cliente (vale o lancamento; nada alterado):
      lancamento pago, parcela nao: parcelamento — NJ 17 (156.494,03), Vera 2 (5.881,50); financiamento — NJ 1 (26.127,18);
      parcela 'pago' sem lancamento vivo (vale a parcela): NJ 20 (16.424,08; 17 sem lancamento, 3 com ele cancelado), Santa Rita
      11 (242.789,60), Raul 3 (386,00), Agnaldo 1 (0,00). Com juros: 327 parcelas com dois lancamentos, 0 com so' um realizado.
  Provas: teste SQL `supabase/tests/parc_livres_01_4_test.sql` (S1–S6); 8 mutacoes de banco e 6 de tela mortas. NO NAVEGADOR
  (1.126 x 579): "Lascas" do NJ, so' leitura — Pago 17.850,00 · A vencer 11.900,00 · Vencido 5.950,00 · 3/6 · total 35.700,00,
  iguais ao banco; no Teste, o contrato de 320,00 (que mostrava Total 399,00 com a cancelada) mostra 320,00 e 3 parcelas; paguei a
  parcela 2 pelo modal do Financeiro e, SEM F5, Pago foi de 100,00 a 200,00 e o progresso de 1/3 a 2/3; desfeito, voltou; o
  contrato de teste foi apagado.
  ⚠ QUEM AINDA LE^ `financiamento_parcelas.status` (proposta de retirada: PARC-STATUS-DA-PARCELA-01; a coluna NAO foi mexida) —
    tela: `FinanciamentosListaPage.tsx` (a LISTA de contratos: saldo devedor, proxima parcela — no NJ o "Lascas" segue com saldo
    35.700,00 la'), `useFinanciamentosPainel.ts`, `useEndividamentoAtual.ts`, `useEndividamentoMensal.ts`,
    `useParcelasFinanciamento.ts`, `buildPlanejamentoVisaoGeralData.ts`, `usePlanejamentoFinanceiro.ts`, `useResumoExecMeta.ts`,
    `indicadorCatalogo.ts`, `documentosPendentes.ts`, `FinanceiroV2Tab.tsx`, `ObrigacaoDialog.tsx` (a tabela do financiamento),
    `ModalBaixaParcela.tsx`; banco: `fn_endividamento_mensal`, `fn_financiamento_sincronizar_status`,
    `fn_contrato_editar_e_regenerar`, `fn_financiamento_pagar_pelo_extrato`, os dois reconciliadores.
  ⚠ DIVIDAS: PARC-MODAL-PARCELA-VALOR-01 (no modal do Financeiro o Valor e o Vencimento de um lancamento de PARCELA nao paga sao
    editaveis e gravam SO' o lancamento — a parcela fica com o numero antigo; o caminho certo e' a grade do contrato / a RPC do
    2B; travar ou rotear pela RPC e' PR proprio) · PARC-OBRIGACAO-PROPAGA-01 (descricao, forma de pagamento e classificacao
    editadas no contrato nao chegam aos lancamentos das parcelas; falta o dialogo "só os futuros / futuros e passados / não
    propagar", com a regra das recorrencias: realizado nunca muda data nem valor, so' classificacao) · PARC-LIVRES-NAO-PROVADO-01
    (no navegador: a recusa da RPC ao lado do botao, "Desfazer alterações", "Pôr na parcela N", a NF herdada e a janela de 523 de
    altura) · as linhas do detalhe medem 24–25px (a tabela `dense` de antes; nao 18–19) · as 6 fotos de edicao de financiamento e
    emprestimo de `obrigacaoDialog.fotos.json` foram REGRAVADAS: a foto e' do `body` inteiro e a pagina do contrato atras do
    dialogo mudou (o dialogo nao foi tocado neste passo) · financiamento COM JUROS e 'parcial' nao foram vistos no navegador (so'
    por teste).
- ⚠ O NOME DA PARCELA E' "Descrição i/N", E QUEM O FORMA E' O BANCO (PARC-LIVRES-01 passo 5, Gabriel 06/10/2026; migration
  20261027194400, ⚠ registrada como 20261007020914; ledger = arquivo, md5 bc79a75e…; patch guardado por md5:
  `fn_parcelamento_cadastrar` 7d9874b0… -> a86837e1…, `fn_parcelamento_editar_parcelas` 04ec64c3… -> 1fbb077a…).
  · UM DONO DO TEXTO: `_fn_parcela_descricao(descricao, i, N)` = `descricao || ' ' || i || '/' || N` ("Manutenção Cercas 2/3"; era
    "… - Parcela i/N"; md5 4b2982c6…). Usam-no o nascimento (os dois modos; antes o cadastro montava o texto no proprio corpo) e a
    parcela acrescentada na edicao. O FRONT NAO MONTA DESCRICAO DE PARCELA DE PARCELAMENTO em lugar nenhum.
  · QUANDO N MUDA NA EDICAO: `_fn_parcela_renumerar(nome, i_antes, N_antes, i, N)` (md5 a6add78e…) troca SO' o trecho
    "i_antes/N_antes" do FIM do nome (precedido de espaco, ou sozinho) — forma nova e forma ANTIGA ("… - Parcela 2/3" vira
    "… - Parcela 2/4": o existente nao e' renomeado, so' fica coerente); nome que nao termina nesse trecho (posto a' mao) fica;
    "12/3" nao e' "2/3". Na paga so' o nome muda. ⚠ Contrato antigo que ganha parcela fica com DUAS formas (a acrescentada nasce
    na nova).
  · NA TELA O "i/N" VEM DO CONTRATO, NUMA PARTE QUE NUNCA CORTA: `fn_parcelas_dos_lancamentos(cliente)` (LEITURA; jsonb
    `{lancamento_id: [numero, total]}`; so' contrato de natureza 'parcelamento' e parcela viva; SECURITY DEFINER com `tenant_ok` e
    42501; md5 3fcc9033…) -> `useParcelasDosLancamentos` (uma leitura por cliente, relida pelo canal) -> o dono puro
    `nomeEParcela(descricao, parcela)` (`src/lib/financiamentos/nomeDaParcela.ts`) -> `{ nome, parcela, inteiro }`. O texto so' e'
    LIDO para nao escrever o "i/N" duas vezes: sai do nome o MESMO "i/N" do contrato no fim ("X 2/3", "X - Parcela 2/3", "X Parc.
    2/3") ou no comeco ("Parcela 2/3 X", a forma do motor); "i/N" DIFERENTE do contrato fica no nome como esta'.
    Onde vale: Produto da lista de Lançamentos (`nome-com-parcela` / `parcela-i-n`), Descricao da CPR (`cpr-parcela-i-n`), o PDF da
    CPR (`ContaDaFolha.parcela`, um `Text` que nao encolhe; o resolvedor `de.parcela` e' opcional — sem ele o modelo e' o de antes)
    e o Excel (nome + "i/N" na mesma celula). O nome inteiro vai no `title`. Financiamento com juros e OC: fora (a descricao como
    esta').
  Medido a 1.126 x 579 no cliente Teste (parcelamento sintetico de nome longo, 3 x 33.333.333,33, criado pela RPC e APAGADO):
  nasceu "… 1/3 | … 2/3 | … 3/3"; lista: "1/3" 15px inteiro, nome cortado em 104 de 131px, linha de 25px; CPR: "1/3" 16,6px
  inteiro, nome cortado em 164 de 185px, linha de 18px.
  Testes: `supabase/tests/parc_livres_01_5_test.sql` (N1–N5); `parc_livres_01_test.sql` e `_2b_test.sql` atualizados ao nome novo;
  6 mutacoes de banco e 5 do dono da tela mortas.
  · RENOMEADAS EM 06/10/2026, com o SIM do Gabriel (`docs/investigacao/parc-livres-01-5-renomear-parcelas.sql`, registro
    historico): 83 lancamentos ativos de parcela viva de parcelamento com o nome EXATO "Descrição - Parcela i/N" — NJ 72 (21
    pagas) e Vera 11 (2 pagas) — passaram a "Descrição i/N" pela `_fn_parcela_descricao`; so' a descricao mudou (md5 dos demais
    campos igual) e nenhuma linha fora do escopo foi escrita (conferido pelo `xmin`). Depois: NJ 103 na forma nova e 10 de outro
    nome; Vera 11 e 3. A forma do motor ficou com 0 (eram as 5 do IATF). A medicao abaixo e' a de ANTES.
  · PDF E EXCEL GERADOS DE VERDADE (fechamento C, 06/10, cliente Teste, clique real em Exportar com a aba em primeiro plano,
    parcelamento sintetico de nome longo criado e apagado): o Excel traz "… eucalipto tratado 1/3" inteiro na celula; O PDF MOSTROU
    UM DEFEITO que o teste de fonte nao via — com `flexShrink` no nome o motor nao encolhia o texto e o "1/3" saia POR CIMA do
    nome cortado. Conserto: o "i/N" tem lugar proprio de LARGURA FIXA (`W_PARCELA` 26pt, a' direita da coluna Descricao) e o
    nome ocupa o resto; regerado: "SINT FECHA-C Manutenção…   1/3", sem sobreposicao. ⚠ LAYOUT DE PDF SO' SE PROVA NO PDF GERADO.
  · EXISTENTES, COMO ESTAVAM ANTES DE RENOMEAR (06/10):
    lancamentos de contrato de PARCELAMENTO — NJ 82 (67 na forma antiga gerada, 5 na do motor "Parcela i/N Protocolo IATF", 10 com
    outro nome, ex. "Adensado/Nucleo - 1/3"); Vera 14 (11 + 0 + 3, ex. "Balança Pesagem - 2/2"); Teste 6 (cancelados).
    Em TODOS os lancamentos vivos (regex, contagem aproximada): "… - Parcela i/N" NJ 155 · Vera 31 · Santa Rita 29 · RRCC 2 ·
    Agnaldo 1 (quase todos dos paineis legados de abate/compra/venda, ex. "Abate 18 Garrotes - Parcela 1/1"); "Parcela i/N …" NJ
    5; "Parc N" NJ 79 · Agnaldo 29 · RRCC 19 · Santa Rita 9 (ex. "4 pneus PA carregadeira W130 - parc 4/8"); "Parcela N - None"
    NJ 59 (Lucro Rural, ex. "Manutenção e conserto · Parcela 3 - None" — listado, nao tocado).
  · OUTROS ESCRITORES DE "Parcela" (relatados, NAO tocados): front legado — `CompraFinanceiroPanel.tsx` ~:403,
    `AbateFinanceiroPanel.tsx` ~:361, `VendaFinanceiroPanel.tsx` ~:687, `compra/gerarFinanceiroCompra.ts` ~:108,
    `useBoitelOperacoes.ts` ~:336 (todos "X - Parcela i/N"); banco — o motor do financiamento com juros
    (`fn_reconciliar_parcela_financiamento`, "Parcela i/N Descricao") e a OC (sufixo "i/N" das parcelas de compromisso).
  ⚠ DIVIDAS: a tela de Recorrencias, o
    Fluxo e os demais lugares que mostram descricao NAO separam o "i/N" (so' lista, CPR, PDF e Excel) · a BUSCA da lista por
    texto segue sobre `l.descricao` · NAO PROVADO: o PDF gerado de verdade com parcela (a aba do Chrome estava em segundo plano
    e a geracao nao termina; provado pelo modelo e pela fonte), o Excel baixado, o Ampliado, a janela de 523 de altura (estava
    em 579), e a forma antiga / a do motor NO NAVEGADOR com dado real do NJ (so' por teste).
- ⚠ O DOCUMENTO DA LINHA TEM UM DONO: `docDaLinha` (PARC-LIVRES-01 passo 3, Gabriel 06/10/2026, so' tela, sem banco). Puro, em
  `src/lib/financeiro/documentoHelper.ts`: `docDaLinha(lancamento {tipo_documento, numero_documento}, documentos) -> { rotulo,
  origem 'lancamento'|'nota'|'documento'|null, clipe, resumo }`. A coluna Doc. e o clipe da lista de Lançamentos, o bloco
  "Documento" do resumo lateral e o topo da aba Documentos do modal leem DELE; nenhum dos tres monta texto de documento.
  ⚠ NASCE DE DEFEITO MEDIDO: a parcela de compra parcelada nao tem `numero_documento` (o cadastro do parcelamento nao o grava); a
    nota mora no DOCUMENTO ligado a' parcela (`financeiro_documento_vinculos`), e os tres lugares liam so' a coluna do lancamento.
    Lancamentos de parcelamento com NF ligada e Doc. vazio: NJ 28 de 32, Vera 4 de 6.
  · PRIORIDADE: (1) o numero PROPRIO do lancamento, com o prefixo do tipo — "NF 000.000.518" (Nota Fiscal, ate' 9 digitos; mais
    que isso sai cru), "Rec. X", "Bol. X" (Boleto e Fatura), "Comp. X", senao "Doc. X"; (2) a NF ligada (`nf`, `nf_principal`,
    `nf_complementar`) — origem 'nota'; (3) outro documento ligado com numero — origem 'documento'. Documento CANCELADO nao conta.
    Numero "-" (o vazio das planilhas importadas; 62 linhas no NJ) nao e' numero. `clipe` = ha' documento vivo ligado; `resumo` =
    o que tem ("NF 000.000.518 · 1 boleto"), o `title` do clipe.
  · A LEITURA: `useDocumentosDoCliente` (`src/hooks/`), UMA leitura paginada por cliente de `vw_lancamento_documentos` (a view ja'
    devolve o documento para cada lancamento ligado: 32 de 32 vinculos), relida pelo canal de lancamentos. Nunca por linha. O
    modal le' o `documentosApi.documentos` que ja' tinha.
  · LISTA (`FinanceiroV2Tab`): a coluna de 14px que tinha o marcador de ORIGEM (B ↺ ✓ M !) e' a do CLIPE (cadeia sticky
    0/28/42/82/122 intacta); a LEGENDA dos icones saiu do rodape. ⚠ A ORIGEM NAO SUMIU: vai no `title` do STATUS ("… · origem:
    …"), e o clique no Status abre o `MinimodalOrigemLancamento` (ver / desfazer o vinculo com o banco), que era aberto pelo
    icone. LARGURAS (soma 874, igual): Produto 136 -> 130 (Ampliado 150 -> 144), Macro e Centro 56 -> 49, Doc. 70 -> 90.
    ⚠ NAO SOBROU LARGURA PARA O FORNECEDOR (o briefing previa): o prefixo do tipo consome mais do que a coluna de origem devolvia.
    [FECHAMENTO C, Gabriel 06/10: FORNECEDOR 100 -> 124, tirando 16 de Macro (49 -> 33) e 8 de Centro (49 -> 41); soma 874.
    Medido no NJ a 1.126 x 523 (5.251 linhas, 829 fornecedores distintos): linhas com o fornecedor cortado 3.516 -> 2.328; nomes
    distintos cortados 530 -> 340; Macro cortava em 5.250 e corta em 5.251; Centro 3.646 -> 4.992 (o custo); datas e valor 0;
    Doc. 944 (as mesmas); linha de 25px; sem rolagem horizontal.]
    Medido a 1.126 no NJ (5.226 linhas, so' leitura): "NF 000.000.NNN" 67,4px e "Doc." + 11 digitos 77,1 em 82 uteis; 513 linhas
    de NF, 0 cortadas; 58 clipes; linha de 25px (a de sempre); cabecalho em 202px antes e depois de rolar 3.000px. CORTAM 944
    linhas: numero de 13+ digitos e texto livre no campo ("Formulário Casul…") — as mesmas que ja' cortavam sem o prefixo (divida
    FIN-V2-DOC-CORTA-01, agora contra 90px).
  · MODAL (`LancamentoV2Dialog`): resumo "Tipo: Nota Fiscal · da compra" / "Número: NF 000.005.510" (15px por linha, o aside nao
    rola); no topo da aba Documentos, na MESMA linha do titulo, "nota da compra: NF 000.005.510" (`doc-da-compra`; bloco de 91px,
    modal 1024 x 547). ⚠ SO' LEITURA: "Tipo Documento" e "Nº Documento" continuam sendo as colunas do lancamento e ficam vazios —
    nada e' escrito neles. Sem documento ligado o HTML do modal e' o de antes (as fotos nao mudaram).
  Seis mutacoes do dono mortas. Testes: `docDaLinha.test.ts`, `notaDaCompraNoModal.test.tsx`, `finV2ColunasOC01.test.ts` (fonte).
  ⚠ DIVIDAS: FIN-V2-ORIGEM-NO-STATUS-01 (a origem so' esta' no `title` e no clique do Status: nao ha' mais marca visivel de "veio
    do banco / manual", nem legenda — decisao do Gabriel se volta em outro lugar) · CPR e PDF seguem com o clipe/Doc. proprios
    (`comAnexo`), fora do dono · a busca e a ordenacao por documento da lista ainda usam `formatNF` (o numero proprio): a nota da
    compra nao e' achada pela busca · `useDocumentosDoCliente` rele^
    TODOS os documentos do cliente a cada aviso do canal (NJ: centenas de linhas; medir se crescer) · NAO PROVADO NO NAVEGADOR: o
    Ampliado, o minimodal aberto pelo Status, o clipe por ARQUIVO anexado sem numero, e o documento que nao e' nota no modal
    (so' por teste); a janela estava em 579 de altura, nao 523.
- ⚠ PEDACO QUE NAO CHEGA (PAGINA ABERTA ANTES DE UMA PUBLICACAO) NUNCA APARECE CRU, E TODO `import()` DINAMICO PASSA POR UM DONO
  (APP-VERSAO-NOVA-01, Gabriel 07/10/2026, so' tela). Dono: `src/lib/app/falhaDeVersao.ts` — importado ESTATICAMENTE e sem import
  nenhum (frase que mora em pedaco dinamico falha junto com ele). Frase: "O sistema foi atualizado depois que esta página abriu.
  Recarregue a página (Ctrl+R) e repita." (`FRASE_VERSAO_NOVA`).
  · TODO PEDACO SOB DEMANDA SE CARREGA ASSIM: `await importarDoApp(() => import('…'))` (e `lazy(() => importarDoApp(() => import('…')))`).
    Pedaco que nao chega (as tres grafias do navegador + "Unable to preload CSS" do Vite, `ehFalhaDeVersao`): acende o aviso do
    shell e RELANCA `FalhaDeVersao`, cuja mensagem ja' e' a frase — quem tem `catch` proprio escreve a frase, nunca o endereco do
    arquivo. Qualquer outra falha passa como veio. PROIBIDO `import()` dinamico cru em `src`: preso por teste de fonte
    (`src/lib/app/falhaDeVersao.test.tsx`, com auto-teste do detector; `import()` de TIPO e comentario nao contam).
  · O AVISO E' DO SHELL (`AvisoVersaoNova`, `src/components/app/`, montado em `App.tsx`): ouve `vite:preloadError` e o evento do
    dono (`app:versao-nova`); fixo no topo, acima dos modais, com X e o botao "Recarregar". ⚠ NUNCA RECARREGA SOZINHO (perderia o
    que esta' digitado) e NAO chama `preventDefault` no evento do Vite (a falha segue para quem chamou). O X fecha; a falha
    seguinte reacende. Medido a 1.126 x 523: 578 x 28, a frase inteira, sem corte.
  · O PDF DA CPR DELEGA: `motivoDaFalhaDoPdf` pergunta ao dono (`ehFalhaDeVersao`) e escreve a frase DELE, identica a' de antes
    ("O aplicativo foi atualizado… e gere o PDF de novo."); o unico import de `falhaDoPdf.ts` e' o dono.
  · ⚠ DIVERGENCIA DO BRIEFING, MEDIDA: sao 11 `import()` dinamicos em 9 arquivos, nao 8 — `ContasPagarReceberTab`,
    `BoitelBlocosModais`, `ImportacaoFinanceira`, `useFinanceiroV2`, `kmlParser`, `extractPdfText`, `FinanciamentoDetalhe` (sobrou:
    o excluir de financiamento com juros), e DOIS em cada gerador de PDF (`gerarPdfCpr`, `gerarPdfAnaliseExecutivaV3`: o motor e o
    documento). Os 3 `lazy(` estao em `src/pages/Index.tsx`, que NAO e' rota (legado); tratados mesmo assim. 14 no total.
  ⚠ NA CPR A FALHA DO PDF APARECE DUAS VEZES, de proposito: a frase ao lado do botao e o aviso do shell (o evento do Vite dispara
    de qualquer jeito).
  ⚠ NAO PROVADO: a falha REAL (publicar com a pagina aberta) — no navegador so' o evento `vite:preloadError` sintetico acendeu o
    aviso e o X o fechou sem recarregar; o clique em "Recarregar" e o aviso por cima de um modal aberto so' por teste; quem nao
    tem `catch` (print do boitel, classificacoes do Financeiro, KMZ, PDF do extrato) mostra SO' o aviso do shell — a tela dele
    nao escreve nada ao lado do gesto; o PDF executivo (`ExtratoGerencialTab`) nao foi aberto.
- ⚠ CONTRATOS DE PARCELAMENTO QUE JA' QUEBRARAM: A PROPOSTA ESTA' ESCRITA E NAO FOI EXECUTADA (PARC-CADEIA-01 passo 5, 07/10/2026).
  `docs/investigacao/parc-cadeia-01-conserto.sql` — um bloco por caso, com guarda do estado medido, a simulacao da propria funcao
  em NOTICE (antes x depois) e o gesto contrario escrito; so' ids e contagens de parcelas (nenhum nome, credor ou valor). O
  Gabriel aprova CASO A CASO.
      caso 1 — NJ 57a954ed, parcela 1 de 3 com o lancamento cancelado em 07/10: RETIRAR a parcela (3 -> 2 vivas)
      caso 2 — Teste 27ec1644 (resto de ensaio), as 2 parcelas sem lancamento: CANCELAR A COMPRA
      caso 3 — Teste b0149862 (resto de ensaio), as 4 parcelas sem lancamento: CANCELAR A COMPRA
  FORA DO SCRIPT, por decisao do Gabriel: o NJ 580db8cd ("Parcela 3 - None", as 4 parcelas sem lancamento) — ele refaz pela tela.
  Ensaiado em transacao REVERTIDA (os tres casos passam pela guarda e gravam o esperado; o banco ficou como estava).
- ⚠ NA TELA DO CONTRATO: EXCLUIR A COMPRA PARCELADA E' UMA GRAVACAO, E A PARCELA SEM LANCAMENTO DEIXA DE SER MUDA (PARC-CADEIA-01 passo 4,
  Gabriel 07/10/2026; migration 20261027194900, ⚠ registrada como 20261007185054; ledger = arquivo, md5 e3880ce1…; patch guardado
  por md5: `fn_financiamento_situacao` 7d59c915… -> 70a7d04b…, 1 ancora).
  · EXCLUIR (4a): em contrato de PARCELAMENTO o botao abre o `ExcluirCompraDialog`
    (`src/components/financiamentos/GestosDoContratoDialogs.tsx`, 500 x 210 fixo): a SIMULACAO de `fn_parcelamento_excluir` no
    dialogo ("Serão cancelados N lançamentos e N parcelas. O contrato fica como cancelado; nada é apagado."), motivo obrigatorio,
    a recusa (parcela paga: dizendo quais) no lugar da previa com o botao apagado, e a recusa da gravacao ao lado do botao. O
    `import()` dinamico de `parcelaMirror` e as tres idas soltas ficaram SO' para financiamento com juros e emprestimo
    (`open={confirmDelete && !ehParcelamento}`), intocados. ⚠ O contrato excluido NAO some: fica 'cancelado' (a lista ja' tem o
    filtro "Cancelado").
  · PARCELA VIVA SEM LANCAMENTO VIVO (4b): com `p_detalhe` cada parcela ganha NO FIM `lancamento_cancelado {em, motivo}` (o
    lancamento que ela aponta e esta' cancelado; nulo fora disso). SEM `p_detalhe` o retorno e' o de antes (206 contratos
    identicos por md5, e as chaves de antes identicas com detalhe; 14 parcelas com a chave nova = contagem direta). Na tela
    (`FinanciamentoDetalhe.tsx`, so' parcelamento): Situação "sem lançamento" (ambar; `semLancamento`, `porQueSemLancamento` em
    `situacaoDoContrato.ts`: `title` "lançamento cancelado em dd/mm/aa · motivo") e, no lugar das colunas Nota fiscal e Boleto,
    os dois gestos: "Recriar lançamento" (`RecriarLancamentoDialog`, 500 x 190: diz o lancamento que vai nascer — nome, vencimento,
    valor, programado — e de onde vem a classificacao, e grava por `fn_parcelamento_recriar_lancamento`) e "Retirar" (o MESMO
    `CancelarParcelaDialog` do passo 2, pelo id da parcela). A coluna Situação passou de 62 a 88px ("sem lançamento" pede 78).
    Depois de cada gesto a tela avisa o canal do Financeiro e rele (`aposMexerNaCadeia`).
  PROVA NO NAVEGADOR (cliente Teste, 1.126 x 523, contrato sintetico de 4 x 100,00 com o lancamento da 3ª cancelado de proposito,
  criado por RPC e APAGADO): a linha 3/4 com "sem lançamento", `title` "lançamento cancelado em 07/10/26 · legado (…)" e os dois
  gestos; 4 linhas de 19px, 0 celulas cortadas, pagina sem rolagem; "Recriar" — "… 3/4 · venc. 20/12/2026 · R$ 100,00 ·
  programado · copiados da parcela vizinha", gravado: lancamento NOVO programado na parcela, o cancelado continuou cancelado, a
  linha voltou a "A vencer" sem F5; "Retirar" — aviso 560 x 330, 4 -> 3 parcelas e 400,00 -> 300,00, gravado, tela relida sem
  F5; "Excluir" — 500 x 210, "Serão cancelados 3 lançamentos e 3 parcelas…", gravado: contrato 'cancelado' com o motivo na
  observacao, e a tela voltou para a lista. 8 mutacoes mortas.
  ⚠ As 6 fotos de EDICAO de financiamento e emprestimo de `obrigacaoDialog.fotos.json` foram REGRAVADAS (a pagina do contrato
    atras do dialogo mudou; o dialogo nao foi tocado, e as 9 de criacao e de parcelamento ficaram identicas).
  ⚠ DIVIDAS: o gesto da linha diz "Retirar" (nao "Retirar parcela": os dois rotulos inteiros nao cabem nas duas colunas; o nome
    completo esta' no `title`) · o aviso de sucesso do Excluir e' toast (o erro nao) · a lista de contratos NAO foi conferida
    com o contrato recem-cancelado na tela (so' o retorno a ela) · NAO PROVADO NO NAVEGADOR: a recusa do Excluir com parcela
    paga, o molde "lançamento cancelado" (compra sem nenhuma vizinha viva — o caso do "Parcela 3 - None") e o Excluir de
    financiamento com juros pelo caminho antigo depois da trava (a trava nao o alcanca: provado no teste SQL do passo 1).
- ⚠ NO MODAL DO LANCAMENTO, VALOR E VENCIMENTO DE PARCELA DE COMPRA PARCELADA MUDAM JUNTO COM A PARCELA (PARC-CADEIA-01 passo 3, Gabriel
  07/10/2026, so' tela; FECHA a divida PARC-MODAL-PARCELA-VALOR-01). Antes o modal gravava so' o lancamento e a parcela ficava com
  o numero antigo (o caso da Vera, "Balança Pesagem": parcela 21/10 x lancamento 15/10).
  · QUEM E' PARCELA: na EDICAO de lancamento com `origem_tipo = 'parcela_principal'` (prefiltro barato,
    `podeSerParcelaDeContrato`) o modal le' o contrato pelo dono da situacao (`lerContratoDaParcela`,
    `src/lib/financiamentos/parcelaNoModalBanco.ts`: a parcela viva pelo `lancamento_id`, contrato de PARCELAMENTO vivo,
    `fn_financiamento_situacao`). Sem resposta, ou financiamento com juros: o modal e' o de sempre. Lancamento comum nao consulta
    nada e nao ganha no' no HTML (as fotos do modal nao mudaram).
  · DONO PURO: `edicaoDaParcela(situacao, lancamentoId, valor, vencimento)` (`src/lib/financiamentos/parcelaNoModal.ts`), em
    CENTAVOS: `mudou` (o valor ou o vencimento do modal difere do da PARCELA), a `lista` final do contrato com so' esta parcela
    alterada, o total novo = a SOMA da lista, e a frase "A compra passa de X para Y." so' quando o total muda. UM centavo conta.
  · SALVAR: com `mudou`, a lista vai PRIMEIRO por `fn_parcelamento_editar_parcelas` (parcela + lancamento + contrato, uma
    transacao; `p_valor_total` = a soma nova); recusa do banco ESCRITA ao lado do botao (`erro-antes-de-salvar`) e nada mais e'
    gravado; passou, o gravador de sempre leva o resto (com os mesmos dois valores). A frase do total novo aparece no RODAPE do
    modal (`parcela-do-contrato`, altura fixa, uma linha, ambar) ANTES de salvar.
  · PARCELA PAGA (a situacao do banco diz 'paga'): Valor e Vencimento em LEITURA, e o rodape escreve "Parcela paga: valor e
    vencimento não mudam." (`MOTIVO_PARCELA_PAGA`).
  PROVA NO NAVEGADOR (cliente Teste, 1.126 x 523, contrato sintetico de 3 x 100,00 criado por RPC e APAGADO): valor da 1ª de
  100,00 para 150,00 — rodape "A compra passa de 300,00 para 350,00." (193px, sem corte, modal 491px igual), Salvar -> banco:
  parcela 150,00 = lancamento 150,00, contrato 350,00 / 3 parcelas; com a 2ª paga, Valor e Vencimento desabilitados e o motivo
  escrito no rodape. 8 mutacoes mortas.
  ⚠ SE O GRAVADOR DE SEMPRE FALHAR DEPOIS DA PARCELA GRAVADA, valor e vencimento ja' ficaram (parcela = lancamento = contrato,
    coerentes) e o resto do modal nao; o Salvar seguinte so' leva o resto. Nao ha' transacao unica entre as duas idas.
  ⚠ DIVIDAS: as 10 parcelas vivas cujo lancamento tem `origem_lancamento = 'parcela_financiamento'` ENTRAM (o prefiltro olha so'
    `origem_tipo`) · parcela paga cujo STATUS o operador quer desfazer e mudar valor no mesmo Salvar: sao dois gestos (o campo
    so' abre depois de salvar o status) · NAO PROVADO NO NAVEGADOR: mudar so' o VENCIMENTO, a recusa do banco ao lado do botao
    (vencimento apagado) e o modal aberto pela CPR / pelo lapis do contrato (e' o mesmo modal).
- ⚠ CANCELAR UM LANCAMENTO QUE E' PARCELA DE COMPRA PARCELADA ABRE O AVISO, EM TODA PORTA, POR UM DONO (PARC-CADEIA-01 passo 2, Gabriel
  07/10/2026, so' tela: "se eu for apagar uma parcela, ele tem que dar um aviso de que faz parte de uma compra parcelada, se é
  para cancelar só essa ou todas, direcionar para a tela pai").
  · "E' PARCELA?" QUEM RESPONDE E' O BANCO: a porta chama `consultarParcelaDoLancamento(id)`
    (`src/lib/financiamentos/cancelarParcelaBanco.ts` = a SIMULACAO de `fn_parcelamento_cancelar_parcela` em 'so_esta'); nulo
    (nao e' parcela viva de parcelamento, ou o banco nao respondeu) = o cancelamento de sempre, e a trava do banco continua
    valendo. NENHUM `if` de origem na tela. Dono puro dos textos e do que se oferece: `src/lib/financiamentos/cancelarParcela.ts`
    (`lerPreviaCancelarParcela` — peca torta = nulo —, `tituloDoCancelamento`, `dadosDaParcela`, `antesDepois`,
    `caminhosDoCancelamento`, `caminhoInicial`, `separarParcelas`, `fraseDoLote`); sem conta (preso por teste de fonte).
  · O DIALOGO E' UM: `CancelarParcelaDialog` (`src/components/financiamentos/`), AlertDialog de 560 x 330 FIXO, sem rolagem:
    titulo numa linha ("Parcela 3/4 de «Nome»", corta com `title`); linha de dados credor · nota (pelo `rotuloDoDocumento`, ou
    "sem nota fiscal ligada") · vencimento · valor; tabela "O que muda no contrato" Hoje x Depois (Parcelas, Total da compra — do
    banco); dois caminhos que GRAVAM ("Cancelar só esta parcela" / "Cancelar a compra inteira" — a segunda simulacao diz quantos
    lancamentos saem), o que o banco recusa fica APAGADO com a frase da recusa; motivo obrigatorio (`motivoInformado`);
    "Abrir o contrato" num lugar fixo; "Voltar" fecha sem gravar; a recusa da gravacao ESCRITA ao lado do botao, sem toast.
    Depois de gravar: `notificarLancamentosMudaram` + as chaves do contrato e da CPR invalidadas.
  · AS PORTAS: (a) e (c) — o "Cancelar lançamento" do `LancamentoV2Dialog` (`abrirCancelamento`; vale para a lista, a CPR, o
    Espelho e o Fluxo Caixa, que montam o mesmo modal); (d) `LancamentoLeituraDialog`; (b) o LOTE
    (`excluirLancamentosEmLote`): as parcelas vivas (lidas de `fn_parcelas_dos_lancamentos`) sao PULADAS antes de qualquer escrita
    e voltam em `puladosParcela`; a lista avisa "N parcelas de compra parcelada: cancele uma a uma." (como o `puladosOC`).
  · "ABRIR O CONTRATO" E A VOLTA: o modal ganhou `onAbrirContrato` (ausente = o atalho nao e' oferecido). Lista de Lançamentos:
    `onAbrirFinanciamento` de sempre, so' para quem acessa Financiamentos (os filtros ativos ja' ficam na memoria da sessao). CPR:
    prop nova `onAbrirFinanciamento` (o shell so' a entrega a quem abre `financiamentos`) + o instantaneo da ida
    (`src/lib/financeiro/cprRetorno.ts`: visao, atalho, datas, vencidos, conta, segmento, status, Ampliado — validado campo a
    campo, lido UMA vez na montagem e apagado). O shell guarda de onde se abriu o contrato (`origemDoFinanciamento`, `V2Index`) e
    o voltar retorna para la'.
    ⚠ Na CPR o "trocar de cliente volta a Todas as contas" deixou de rodar na MONTAGEM (apagaria a conta restaurada).
  PROVA NO NAVEGADOR (cliente Teste, 1.126 x 523, contrato sintetico de 5 parcelas criado por RPC e APAGADO; as RPCs chamadas
  pela tela, sob o PostgREST): aviso 560 x 330, titulo e frases sem corte, linha de dados a 10px; PELA LISTA "só esta" — contrato
  5 -> 4 parcelas e 500,00 -> 400,00, i/N renumerado, motivo do operador no lancamento, a linha saiu da lista SEM F5; PELA CPR
  (60 dias, Ambos) o aviso abre, "Abrir o contrato" leva a' tela do contrato e o voltar retorna a' CPR em 60 dias / Ambos; com a
  1a PAGA os dois caminhos apagados com as duas frases e o botao apagado ("Nenhum caminho disponível."); "a compra inteira" —
  Depois 0 / R$ 0,00, 4 lancamentos e 4 parcelas cancelados, contrato 'cancelado' com o motivo na observacao.
  10 mutacoes mortas; 1 sobrevivente EQUIVALENTE (a recusa do caminho no botao: o caminho recusado nunca chega a ser o escolhido).
  ⚠ DIVIDAS: a Mesa do Enriquecer cancela pelo hook direto (`excluirLancamento`, sem o aviso): parcela ali recebe a frase da
    trava em toast · `LancamentoLeituraDialog` chama `fn_cancelar_lancamento_auditoria` SEM motivo (anterior a este PR) · a
    volta da lista de Lançamentos restaura os filtros pela memoria geral, nao por instantaneo proprio · NAO PROVADO NO NAVEGADOR:
    a porta (d), o lote com parcela (so' por teste), a recusa do banco na gravacao escrita ao lado do botao, e a volta do
    contrato para a LISTA (foi vista para a CPR).
- ⚠ A PARCELA DE PARCELAMENTO E O LANCAMENTO DELA MUDAM JUNTOS: UM ESCRITOR POR GESTO, NO BANCO, E A TRAVA MORA NO DONO (PARC-CADEIA-01
  passo 1, Gabriel 07/10/2026, so' banco; migration 20261027194800, ⚠ registrada como 20261007180741; ledger = arquivo, md5
  8792961a…). Nasce do "Parcela 3 - None" do NJ: parcelas canceladas pela lista do Financeiro, e o contrato seguiu com 4 parcelas,
  o total cheio e as parcelas sem lancamento. Financiamento com juros, emprestimo, OC e lancamento comum: FORA (provado).
  · TRAVA (1c): gatilho `trg_guard_parcelamento_cancelar` (BEFORE UPDATE OF cancelado em `financeiro_lancamentos_v2`, WHEN passa a
    cancelado E tem `financiamento_id`) -> `guard_parcelamento_lancamento_cancelar()`: o lancamento de parcela VIVA de contrato de
    PARCELAMENTO vivo so' se cancela com `app.parcelamento_escritor = 'on'` (transacao), ligado SO' pelas RPCs do parcelamento e
    desligado logo depois. Fora delas: P0001 "Este lançamento é a parcela N/M da compra parcelada «X». Cancele pela tela, que
    ajusta o contrato junto." — por UPDATE direto e por `fn_cancelar_lancamento_auditoria`, tambem como `authenticated`.
    ⚠ TESTE SQL QUE MONTA A QUEBRA DE PROPOSITO liga a chave (`parc_livres_01_4_test.sql` passou a ligar).
    ⚠ CUSTO, MEDIDO A/B NA MESMA TRANSACAO (20 series de 300 cancelamentos, duas rodadas): lancamento comum −0,4% / +2,0% na
      mediana (ruido: nem chama a funcao); lancamento COM contrato +3,7% / +6,8% (0,03–0,06 ms por cancelamento) — acima do teto
      de +2% do briefing, ACEITO pelo Gabriel (07/10). Nao da' para estreitar pela origem: 10 parcelas vivas de parcelamento tem
      lancamento com `origem_lancamento = 'parcela_financiamento'` (as recriadas pelo motor antes do 2A).
  · `fn_parcelamento_cancelar_parcela(p_lancamento_id, p_escopo, p_motivo, p_simular, p_parcela_id)` (1a; md5 68643d6d…): resolve
    contrato e parcela pelo lancamento (ou pelo id da parcela). 'so_esta' NAO repete regra: chama `fn_parcelamento_editar_parcelas`
    com a lista das vivas sem esta (parcela 'cancelado', lancamento cancelado pelo dono COM O MOTIVO DO OPERADOR, contrato
    recalculado, i/N renumerado); recusa a PAGA ("A parcela N já está paga: desfaça o pagamento antes.") e a ULTIMA viva (manda
    cancelar a compra inteira). 'todas' = o 1b. Retorno (igual na simulacao): `contrato {id, descricao, credor}`, `parcela
    {id, numero, total, valor, vencimento, paga, lancamento_id}`, `nota` (o numero da NF viva ligada; nulo = sem nota), `antes` /
    `depois` `{parcelas, valor_total}`, `todas {lancamentos, parcelas}`, `recusa {motivo, frase} | null`.
  · `fn_parcelamento_excluir(p_financiamento_id, p_motivo, p_simular)` (1b; md5 986dd2fd…): cancela pelo dono os lancamentos vivos
    das parcelas e marca parcelas e CONTRATO 'cancelado' — NADA E' APAGADO; o motivo vai tambem na observacao do contrato
    ("[cancelada em AAAA-MM-DD: motivo]", porque `financiamentos` nao tem colunas de cancelamento). Recusa dizendo QUAIS parcelas
    estao pagas. "Editado manualmente" nao e' motivo de recusa.
  · `fn_parcelamento_recriar_lancamento(p_parcela_id, p_simular)` (1d; md5 ad8b2c91…): parcela viva sem lancamento vivo ganha
    lancamento NOVO pela rotina unica `_fn_parcelamento_lancamento_novo` (o INSERT e a NF herdada, MOVIDOS VERBATIM do 2B — a
    parcela acrescentada na grade passou a nascer por ela); o cancelado nao e' reativado. MOLDE: a vizinha viva de maior numero;
    ⚠ DESVIO DECLARADO: sem nenhuma vizinha viva (o caso do "Parcela 3 - None"), o molde e' o proprio lancamento cancelado.
  · SIMULACAO = GRAVACAO: a simulacao EXECUTA o mesmo caminho e desfaz (SQLSTATE 'PCSIM' num bloco com EXCEPTION); recusa do
    banco na simulacao volta em `recusa {motivo:'banco', frase}`; na GRAVACAO toda recusa levanta erro com a frase + "Nada foi
    gravado." Motivo obrigatorio so' na gravacao. Mes fechado vira frase (`_fn_parcelamento_frase_do_erro`).
  · `fn_parcelamento_editar_parcelas` 1fbb077a… -> bf9a8713… (patch guardado por md5, 3 ancoras): liga/desliga a chave na
    retirada, aceita o motivo do operador (`app.parcelamento_motivo`) e cria a acrescentada pela rotina interna.
  · Indice novo `idx_fin_parcelas_lancamento_id`. As tres publicas com GRANT a `authenticated`; internas e a do gatilho fechadas.
  MEDIDO NO PASSO 0 (07/10, so' leitura; a lista foi ao Gabriel, nao ao repositorio): parcela viva sem lancamento vivo — NJ 5 (as
  4 do "Parcela 3 - None" e 1 do "Sal Adensado"), Teste 6 (ensaios antigos); todas com o lancamento CANCELADO (nenhuma sem id).
  ⚠ DIVIDAS DE DADO, so' relatadas (decisao do Gabriel): PARC-CADEIA-PAGA-VALOR-DIFERENTE-01 — 4 parcelas do NJ pagas e
    conciliadas por valor diferente do da parcela (22.000,00 x 22.005,00; 1.904,33 x 1.905,00; 1.159,18 x 1.159,16; 666,20 x
    682,85) e 1 da Vera com o vencimento mudado so' no lancamento (21/10 x 15/10; o passo 3 fecha a porta); NJ "Seguro Rural":
    as 10 parcelas somam 10.545,45 e o contrato diz 10.545,50.
  Teste: `supabase/tests/parc_cadeia_01_test.sql` (C1–C10, sintetico no cliente Teste, termina em RAISE OK); 11 mutacoes de banco
  mortas. Os oito testes SQL de parcelamento e o `seg_tenant_varredura_01c` OK no banco vivo depois de aplicar.
  ⚠ ATE' OS PASSOS 2 E 4 ENTRAREM, cancelar parcela pela lista, pela CPR ou excluir o contrato de parcelamento pela tela devolve
    a frase da trava (em toast, nas portas antigas) em vez de quebrar o contrato.
  ⚠ NAO PROVADO: as tres RPCs chamadas PELA TELA (sob pg_safeupdate, pelo PostgREST) — fica para o navegador dos passos 2 e 4.
- ⚠ NA COLUNA DOC. O TIPO GENERICO NAO LEVA PREFIXO: SO' O NUMERO (PARC-CONTRATO-01 item 4, Gabriel 07/10/2026, so' tela). No dono
  `docDaLinha` (`src/lib/financeiro/documentoHelper.ts`): documento SEM tipo, ou com tipo sem prefixo proprio ("Outros", especie
  "outro"), escreve so' o numero — a reserva "Doc." SAIU; "NF", "Rec.", "Bol." e "Comp." seguem com prefixo. O dono devolve tambem
  `titulo`, o `title` da celula: no generico "Documento 109122795412"; com prefixo, o proprio rotulo; nota ligada, "NF … · nota da
  compra". A tela nao monta `title` de documento.
  · VALE NA LISTA, NA CPR, NO PDF E NO EXCEL PELA MESMA FUNCAO: a CPR (o "doc:" do `title` da Descricao e o `de.doc` que alimenta
    o PDF e a coluna "Doc" do Excel) deixou de ler `documento_formatado` da view e chama `docDaLinha` com tipo e numero do
    lancamento. ⚠ Na CPR os documentos LIGADOS nao entram (a nota da compra de uma parcela segue sem aparecer la').
  · MEDIDO NO NJ a 1.126 x 523 (5.271 linhas, 2.927 com texto, 2.258 sem prefixo): CORTAM 46 linhas (38 textos distintos), contra
    944 antes; a meta era 0. Por prefixo: generico 25, Bol. 8, NF 7, Rec. 6. Uteis 83px. Os maiores sao texto livre posto no campo
    ("Formulário Casul … — pago …", 130 a 217px) e numeros de 15 a 17 digitos com prefixo ("Bol." + 17 digitos, 106px). A LARGURA
    NAO FOI MEXIDA. Linha de 25px.
  4 mutacoes mortas. ⚠ DIVIDA FIN-V2-DOC-CORTA-01 segue aberta, agora com 46 linhas no NJ (texto livre no campo de numero e
    numero de 15+ digitos com prefixo) · a busca e a ordenacao por documento seguem sobre o numero cru · NAO PROVADO: CPR, PDF e
    Excel no navegador (so' por teste de fonte; nenhum arquivo gerado), e o Ampliado.
- ⚠ DOCUMENTOS JA' NA CRIACAO DO PARCELAMENTO: PENDENTES EM MEMORIA, GRAVADOS DEPOIS DO CONTRATO, PELOS DONOS DE SEMPRE (PARC-CONTRATO-01
  item 3, Gabriel 07/10/2026, so' tela, sem banco). "Nova obrigação" de PARCELAMENTO tem a aba Documentos (`DocumentosNaCriacao`,
  `src/components/financiamentos/`): os documentos da compra (`DocumentosPendentes`) e o boleto por parcela (`ParcelasDaCompra`,
  `AnexarBoletosDialog`) ficam PENDENTES e NADA e' gravado ate' o Salvar. NENHUM SEGUNDO CADASTRO: ao salvar, o hook
  (`useFinanciamentoCadastro.salvar(…, aoCriarParcelamento)`) chama o retorno com o id do contrato novo e o dialogo grava por
  `lancamentosDoParcelamento` + `gravarDocumentosDoParcelamento` — o mesmo caminho do Novo lancamento parcelado.
  · AS LINHAS DA GRADE DE BOLETOS SAO AS DA ABA PARCELAS (mensal ou livres); sem valor ou sem parcelas a grade escreve o motivo.
  · "IMPORTAR XML DA NOTA" (o `lerNFe` de sempre) PREENCHE o contrato novo, SEM GRAVAR: credor pelo CNPJ/CPF (so' digitos; nao
    achou = "escolha no contrato"), valor total, data do contrato = emissao, duplicatas -> Parcelas livres, e a NF entra como
    documento pendente com o XML de arquivo. O que veio da nota fica ESCRITO numa linha ambar (`recado-do-xml`: "Da NF N: valor,
    data do contrato, 3 parcelas · … · nada foi gravado"); recusa do leitor na mesma linha, em vermelho.
  · VER ANTES DE SALVAR: "ver <arquivo>" para cada arquivo da compra e o nome do boleto na linha da parcela abrem o arquivo em
    memoria (URL de blob).
  · CONTRATO GRAVOU E DOCUMENTO FALHOU: o contrato FICA; a frase vai ao lado do botao (`erro-dos-documentos`) dizendo QUAL
    documento nao gravou, e o Salvar seguinte tenta SO' os documentos (`posCriacao`), nunca cria o contrato de novo.
  · Financiamento e emprestimo: sem a aba (fotos identicas); as 3 fotos da criacao de parcelamento foram regravadas (aba nova).
  PROVA NO NAVEGADOR (cliente Teste, 07/10, 1.126 x 523, XML e boleto SINTETICOS, contrato criado pela tela e APAGADO): XML importado
  -> valor 300,00, data 30/09/2026, 3 parcelas livres (100,00 · 120,00 · 80,00), NF 777 pendente "3 de 3 parcelas"; boleto na 2ª;
  Salvar -> banco: 1 NF ligada a's 3 parcelas (dona + 2 vinculos), 1 boleto na parcela 2, parcelas = as duplicatas. Aba de 261px,
  igual vazia e preenchida. 6 mutacoes mortas.
  ⚠ DIVIDAS: PARC-DOCS-CRIACAO-AMBAR-POR-CAMPO-01 (o ambar e' UMA linha de recado, nao campo a campo como no modal do lancamento) ·
    PARC-DOCS-ARQUIVO-ORFAO-TESTE-01 cresceu (mais um .xml e um .pdf sinteticos no bucket `fin-documentos` sob o Teste) · o resumo
    lateral segue dizendo "3 × R$ 100,00" nas livres · NAO PROVADO NO NAVEGADOR: a NF vista ABRINDO cada parcela pelo Financeiro
    (conferida pela `vw_lancamento_documentos`, a view que o modal le'), o credor ACHADO pelo CNPJ (o Teste nao tem fornecedor com
    documento), "Anexar vários boletos", a falha de um documento com o contrato gravado e o "ver" abrindo o arquivo (so' por teste).
- ⚠ A EDICAO DO CONTRATO DE PARCELAMENTO CHEGA A'S PARCELAS PELO DIALOGO DE ESCOPO, NUMA GRAVACAO SO' (PARC-CONTRATO-01 item 2,
  Gabriel 05 e 07/10/2026; migration 20261027194700, ⚠ registrada como 20261007113841; ledger = arquivo, md5 31a477b5…). Queixa:
  mudou o nome do contrato para "Lascas Eucalipto Tratado" e as parcelas seguiram "LASCAS DE EUCALIP… 4/6"; descricao, forma e
  classificacao mudadas no Editar obrigacao nao chegavam a's parcelas. FECHA as dividas PARC-PROPAGACAO-PARCELAS-01 e
  PARC-OBRIGACAO-PROPAGA-01 (para parcelamento).
  · BANCO: `fn_parcelamento_propagar(p_financiamento_id, p_campos, p_escopo, p_simular)` (md5 523dd2b9…; SECURITY DEFINER,
    `tenant_ok`, GRANT a `authenticated`) — UMA funcao, atomica: grava no CONTRATO as colunas dele (descricao, credor, conta,
    fazenda, plano) e nos LANCAMENTOS DAS PARCELAS os mesmos campos, na mesma transacao. SIMULACAO = GRAVACAO (`p_simular`
    percorre as mesmas linhas e so' nao escreve). `p_campos` so' aceita descricao, credor_id, forma_pagamento,
    conta_bancaria_id, fazenda_id, plano_conta_id, safra_id, cultura, fase; DATA E VALOR SAO RECUSADOS com frase (editam-se na
    grade, a RPC do 2B). 'futuros' = as NAO pagas; 'todos' = todas, e NAS PAGAS MUDAM SO' DESCRICAO E CLASSIFICACAO (plano,
    safra, cultura, fase) — forma, conta, credor, fazenda, data e valor da paga nao mudam nunca; 'nenhum' = nada e' escrito.
    PAGA = a regra do 2B (`_fn_parcela_de_parcelamento_paga`). O nome sempre por `_fn_parcela_descricao` (o "i/N" fica).
    ⚠ NOME PROPRIO = O QUE NAO TERMINA NO "i/N" DA PROPRIA PARCELA (decisao do Gabriel na pergunta de 07/10; DESVIO do briefing,
      que pedia "bater com a descricao atual do contrato"): pela regra literal o contrato JA' renomeado sem propagar — o caso do
      Lascas — nunca seria alcancado. O que termina no i/N (forma nova, ou a antiga "… - Parcela i/N") e' nome gerado e
      acompanha; o que nao termina fica, e a previa diz quantos sao.
    Retorno: `parcelas {nao_pagas, pagas}`, `nome_proprio {nao_pagas, pagas}`, `campos [{campo, de, para, nao_pagas, pagas,
    nas_pagas}]`, `alteradas {futuros, todos}`, `gravadas`.
  · TELA: ao Salvar a edicao de um PARCELAMENTO o `ObrigacaoDialog` pede a previa ao banco; se NENHUM lancamento mudaria, grava
    como sempre; se algum mudaria, abre o `PropagarContratoDialog` e NADA e' gravado ainda — tabela Campo · De → para · Não
    pagas · Pagas (numeros do banco), "Com nome próprio, ficam como estão: …" num lugar fixo, as tres opcoes, e "Voltar" (fecha
    sem gravar) / "Salvar". Salvar = a RPC com o escopo e, DEPOIS, o gravador do contrato de sempre (os campos que nao se
    propagam); "Não propagar" grava so' o contrato. A recusa do banco fica ESCRITA ao lado do botao. Depois de salvo a volta e'
    editar de novo. Lista de Lançamentos, CPR e Conciliação releem pelo canal.
    ⚠ A DESCRICAO VAI SEMPRE NA PREVIA (mesmo sem ter sido mexida): e' o que faz o diálogo abrir num contrato renomeado antes.
      Os outros campos so' entram quando a edicao os mudou (`camposAPropagar`, `src/lib/financiamentos/propagarContrato.ts`).
    ⚠ AS TRES OPCOES SAO UMA PECA SO': `OpcoesDeEscopo` (`src/components/financeiro-v2/`), movida do
      `PropagarRecorrenciaDialog`, que passou a usa'-la (HTML identico: as fotos da recorrencia nao mudaram). O dialogo do
      contrato e' OUTRO componente, de proposito: na recorrencia a regra ja' esta' salva quando ele abre; no contrato nada foi
      gravado e a gravacao e' uma so'.
    · SAFRA, CULTURA/FASE E FORMA DE PAGAMENTO (moram so' nas parcelas) deixaram de ser leitura na edicao de parcelamento:
      `CampoDasParcelas` mostra o que todas tem (ou "varia entre as parcelas") e deixa escolher; a escolha vai na previa.
    · O gravador do contrato passou a gravar a FAZENDA do parcelamento (era editavel e jogada fora) e, quando houve propagacao,
      o aviso diz "N lançamentos de parcela atualizados" (o numero do banco).
    · FINANCIAMENTO COM JUROS: fora — nenhuma previa e' pedida (as parcelas sao do motor).
  · MEDIDO (07/10, so' leitura): contratos de parcelamento com nome de parcela ≠ nome do contrato — NJ 5 de 41 (10 parcelas),
    Vera 2 de 4 (3 parcelas); nenhum nome sem "i/N". Nada foi corrigido em massa.
  PROVA NO NAVEGADOR (cliente Teste, contrato sintetico de 4 parcelas com a 1ª paga, criado por RPC e APAGADO): mudei o nome e
  salvei — diálogo 620 x 323, linhas de 18px, "Descrição | SINT FECHA-PROPAGAR → SINT FECHA-NOME NOVO | 3 | 1", banco intacto
  com o diálogo aberto; "Só os futuros": as 3 nao pagas renomeadas, a PAGA identica por md5 da linha, contrato renomeado, aviso
  "3 lançamentos de parcela atualizados"; de novo, "Futuros e passados": a paga mudou so' o nome (data, valor, forma e
  classificacao iguais). Teste SQL `supabase/tests/parc_contrato_01_propagar_test.sql` (P1–P7); 9 mutacoes de tela mortas.
  ⚠ DIVIDAS: PARC-PROPAGAR-DE-DA-DESCRICAO-01 (o "de" da descricao e' a base MAIS COMUM dos nomes; quando so' a paga ficou com
    o nome antigo a linha diz "X → X" com 0 | 1 — deveria dizer "varia entre as parcelas"; e' banco) · a previa roda a cada
    Salvar de parcelamento (uma ida a mais ao banco) · classificacao por plano ADMINISTRATIVO propagada nao zera a safra das
    parcelas (o modal do Financeiro normaliza; a RPC nao) · a RPC nao tem guarda propria de mes fechado (vale a dos gatilhos do
    lancamento) · NAO PROVADO NO NAVEGADOR: "Voltar", "Não propagar", a recusa escrita, trocar forma / safra / fase pelos
    seletores novos e ver "de → para" deles, o nome proprio contado (so' por teste); nenhuma mutacao de banco deste item.
- ⚠ A TELA DO CONTRATO E' O MOCK APROVADO, E TUDO O QUE ELA MOSTRA AO LADO DA SITUACAO VEM DO MESMO DONO (PARC-CONTRATO-01 item 1,
  Gabriel 07/10/2026; migration 20261027194600, ⚠ registrada como 20261007111021; ledger = arquivo, md5 d6089d62…; patch guardado
  por md5: `fn_financiamento_situacao` a3f310c2… -> 7d59c915…, 1 ancora). Queixa: titulo e textos grandes e cortando, numeros em
  fonte diferente, "Ver" e lapis fazendo a mesma coisa, e faltava saber se pagou no prazo e por qual conta.
  · BANCO: `fn_financiamento_situacao(p_financiamento_id, p_hoje, p_detalhe boolean DEFAULT false)`. SEM `p_detalhe` o retorno e'
    o de antes, byte a byte (198 contratos e os 7 lotes identicos por md5, antes x depois na mesma transacao; o lote do NJ segue
    em 54 ms). COM ele cada parcela leva `competencia`, `conta_id`/`conta_nome` (a conta do LANCAMENTO, pela regua
    `_fn_conta_do_lancamento`), `tipo_documento`/`numero_documento`, `prazo {tipo: antes|no_dia|atraso|vencida|a_vencer, dias}`
    (paga: pago em x vencimento; nao paga: o HOJE recebido x vencimento; paga sem data = nulo), `documentos` (os VIVOS do
    lancamento: id, especie, numero, valor) e `boletos`; os cartoes levam `a_vencer_qtde`, `vencido_qtde`, `notas_qtde`,
    `notas_valor`, `notas_diferenca` (nota − soma das parcelas; NULO = sem nota ou nota sem valor, nunca zero) e `boletos`.
    ⚠ A ASSINATURA GANHOU PARAMETRO: DROP + CREATE (o REPLACE criaria uma segunda funcao e a chamada de dois argumentos ficaria
      ambigua); a ACL foi reconcedida na migration (authenticated e service_role; anon nao). O detalhe de todos os contratos do
      NJ custa 160 ms; o do maior (36 parcelas), 8,5 ms.
  · LEITOR E TEXTOS (`src/lib/financiamentos/situacaoDoContrato.ts`): `detalhe` na parcela e nos cartoes (nulo sem `p_detalhe`;
    peca torta invalida a leitura inteira), `textoDoPrazo` ("3 dias antes" · "no dia" · "2 dias de atraso" · "vencida há 2 dias" ·
    "vence em 29 dias" · "vence hoje"), `TOM_DO_PRAZO`, `textoDasNotas` ("1 nota · confere" / "1 nota · −77.000,00" / "· sem
    valor" / "—"). `ROTULO_SITUACAO.pendente` passou a "A vencer". O hook `useSituacaoDoContrato(…, { detalhe: true })` tem chave
    propria; so' a tela do contrato o pede. A TELA NAO SOMA NEM FAZ CONTA DE DATA (preso por teste de fonte sobre o desenho).
  · A TELA (`FinanciamentoDetalhe.tsx`), de cima para baixo: (a) LINHA DO TITULO de 26px — ← · nome a 15px (CONTIDO: `min-w-0
    truncate` + `title`) · selo PARC/FIN · situacao · "Parcelamento · Pecuária" · e, com lugar reservado (`shrink-0`), Editar ·
    Documentos · Excluir. "Documentos" abre o Editar obrigação na aba Documentos (`abaInicial`, prop nova do `ObrigacaoDialog`);
    no financiamento com juros fica APAGADO com o motivo no `title`. (b) DADOS em duas linhas de 18px (rotulo cinza + valor em
    negrito, 10,5px): Descrição · Credor · Contrato em · Parcelas / Classificação · Conta · 1ª parcela · Safra; a terceira so'
    com Nº contrato, Entrada ou Observação (no credito leva Amortização e Juros, e a Taxa vai na segunda). A SAFRA e' a das
    parcelas, pelo dono `valorComumDasParcelas`. (c) CINCO CARTOES de 40px com a contagem do banco ("Pago · 3 parcelas");
    "Juros previstos" so' no credito (seis). (d) TABELA: Nº ("1/6") · Comp. · Venc. · Pgto. · Prazo · Conta · Valor (R$) ·
    Situação · Nota fiscal (o dono `docDaLinha`) · Boleto (clipe ou "—") · lapis. A coluna "Lançamento · Ver" SAIU: o CLIQUE NA
    LINHA abre o lancamento no modal do Financeiro (o lapis faz o mesmo), com a frase ao lado de "Parcelas" e o botao "Editar
    parcelas" (abre o Editar obrigação na aba Parcelas). Rodape preso: "Total · N parcelas" · pago · total · "3 de 6" · notas ·
    boletos. Numeros na FONTE DO PROJETO com `tabular-nums` (a mono saiu); datas dd/mm/aa; valor sem "R$" (esta' no cabecalho).
    ⚠ CADA LINHA DE DADOS E' INDEPENDENTE (flex), NAO UMA GRADE DE COLUNAS: medido no NJ, com colunas alinhadas o credor longo de
      uma linha e a classificacao longa da outra pediam 912px dos 810 e os dois cortavam.
    ⚠ FINANCIAMENTO COM JUROS, o que muda: Principal · Juros · Total (R$) no lugar de Valor, e NAO ha' Nota fiscal nem Boleto
      (o contrato de credito nao tem "compra"); a linha oferece o botao "juros" (o segundo lancamento da parcela).
  Medido no NJ, so' leitura, a 1.126 x 523 e a 1.126 x 579 (esta num iframe da aplicacao: a janela nao cresceu), Lascas (6),
  Reboque Agrícola (7) e Dodge Ram (20): titulo 26px; nome de 60 caracteres pede 479px, corta em 412 e os botoes seguem com 240px
  encostados a' direita; 0 textos cortados no bloco de dados; 0 celulas cortadas; linhas e rodape de 19px; cartoes de 40px sem
  corte; Dodge Ram rolando 144px (523) e 88px (579) com o cabecalho parado (243,5) e o rodape parado (499 / 555); pagina sem
  rolagem. Lascas = o briefing: 3, 2 e 3 dias antes, parcela 4 "vencida há 2 dias", NF 000.005.510, "1 nota · confere".
  Provas: `supabase/tests/parc_contrato_01_detalhe_test.sql` (D1–D6; 5 mutacoes de banco mortas); 12 mutacoes de tela mortas.
  ⚠ ACHADO DE DADO (so' relato): no Reboque Agrícola do NJ o rodape diz "1 nota · −77.000,00" — a NF ligada tem valor 33.000,00
    (a entrada) e as parcelas somam 110.000,00.
  ⚠ As 6 fotos de EDICAO de financiamento e emprestimo de `obrigacaoDialog.fotos.json` foram REGRAVADAS (a pagina atras do dialogo
    mudou; o dialogo so' ganhou a prop `abaInicial`, e as 9 fotos de criacao e de parcelamento ficaram identicas).
  ⚠ DIVIDAS: a consulta `financiamento-parcelas` da tela ficou so' para o estado de carregamento (ninguem le' as linhas) · a
    Safra do bloco le' os lancamentos do contrato numa consulta da tela (a mesma do Editar obrigação), nao do dono · o teste D1
    confere o lote contra o dono so' nos 40 primeiros contratos (o identico-por-md5 dos 198 foi no ensaio) · "Documentos" apagado
    tem o motivo so' no `title` · NAO PROVADO NO NAVEGADOR: o clique na linha abrindo o modal, "Documentos" e "Editar parcelas"
    abrindo na aba certa (so' por teste), a terceira linha de dados, parcela com boleto (0 casos nos tres contratos), 'parcial',
    e a janela REAL de 579.
- ⚠ NA LISTA DE LANCAMENTOS O CLIPE FICA ENTRE VALOR E DOC., E A CADEIA CONGELADA E' 0/28/68/108 (PARC-FECHA-02 item 6, Gabriel
  07/10/2026, so' tela, `src/pages/FinanceiroV2Tab.tsx`; SUBSTITUI o "0/28/42/82/122" dos blocos FIN-V2-COLUNAS-OC-01 e
  FIN-V2-HOMOLOG-FIX-01). A coluna de 14px do clipe saiu do comeco da linha (depois do checkbox) e foi para entre Valor e Doc.,
  no colgroup, no cabecalho e na linha, tambem no Ampliado; NAO e' congelada. Nada ficou no lugar: Comp., Venc. e Pgto. andaram
  14px para a esquerda e os `sticky left` passaram a 28 / 68 / 108 (th + td, seis lugares; o teste recusa sobra da cadeia velha).
  LARGURAS (normal): 28·40·40·40·OC 16·Produto 130·Fornecedor 124·Macro 33·Centro 41·Faz. 30·Safra 66·Valor 90·clipe 14·Doc. 90·
  Status 64·acoes 28 = 874 (Ampliado: Produto 144 e as duas contas de 92 antes do Valor = 1.072).
  Medido no NJ a 1.126 (5.263 linhas, so' leitura): tabela 880 em 900 sem rolagem; Valor cortado 0; datas cortadas 0; ordem
  Valor (12a) · clipe (13a) · Doc. (14a); 114 linhas com o clipe aceso; congeladas em 0 / 28 / 68 / 109. Ampliado: tabela 1.088
  em 1.108, sem rolagem, mesma ordem, Valor e datas 0 cortes. 3 mutacoes mortas.
  ⚠ O DOC. CONTINUA CORTANDO (divida FIN-V2-DOC-CORTA-01, NAO resolvida aqui): 944 de 5.263 linhas no NJ, 929 delas numero —
    quase todas "Doc. 2026040114846980" (o numero de 16 digitos do extrato, que pede 114px numa coluna de 91). A largura da coluna
    nao mudou neste item (90), entao o corte e' o de antes; o item moveu uma coluna de 14px, nao liberou espaco. Zerar pede ~24px
    a mais no Doc. (de Produto ou Fornecedor) ou tirar o prefixo "Doc." do tipo generico — decisao do Gabriel.
  ⚠ NO AMPLIADO a 1.126 as colunas ESTICAM (a tabela de 1.072 ocupa 1.088) e as datas renderizam a 41px: a terceira congelada
    fica 1–2px fora da cadeia (68 -> 69, 108 -> 110). Sem rolagem horizontal nao ha' fresta a' vista; em janela onde o Ampliado
    rolar, conferir. Ja' era assim com a cadeia antiga.
  ⚠ NAO PROVADO: o Ampliado ROLANDO na horizontal (a 1.126 ele cabe) e o "Recolher" pelo botao (o script nao o achou).
- ⚠ NA TELA DO CONTRATO O TOTAL E' O RODAPE PADRAO DA CASA E A LINHA TEM 19px (PARC-FECHA-02 item 5, Gabriel 07/10/2026, so'
  apresentacao, `src/pages/FinanciamentoDetalhe.tsx`). O Total da tabela de parcelas usa o padrao do `TF` de `ParcelasDaCompra`:
  fundo #E8E6DF, negrito, 10px, 2px em cima (`TOTAL`), em TODAS as celulas (as vazias inclusive), no `tfoot` preso no fim da
  lista; cabecalho preso; so' as parcelas rolam (a rolagem ja' morava no wrapper da tabela). Os valores do Total seguem vindo da
  leitura do contrato (`cartoes`). Sem coluna nova.
  ⚠ O FILETE DE 2px E' SOMBRA INTERNA DA CELULA, NAO BORDA: o `tfoot` e' `sticky`, e borda de celula em tabela colapsada fica para
    tras quando a lista rola; a sombra nao ocupa espaco.
  ⚠ A LINHA MEDIA 24–25px POR DOIS MOTIVOS, MEDIDOS: o botao do lapis de 20px (agora 16) e a ENTRELINHA de 20px que a celula
    herdava — so' com `[&>td]:leading-[18px]` a linha fecha em 19 (18 + 1 de borda); com `h-[19px]` sozinho ela ficava em 20,5–21.
    Os valores passaram de 9 a 10px (o piso e' 9,5).
  Medido a 1.126 x 523 no NJ (so' leitura): Reboque Agricola (7 parcelas) e Dodge Ram (20 parcelas) — linhas de 19px, rodape de
  19px com o topo em 499 antes e depois de rolar a lista ate' o fim, cabecalho parado (362 / 382), 0 celulas cortadas, pagina
  sem rolagem (523 de 523); a lista rola por dentro (15,5px com 7 parcelas; 282,5px com 20). Total = o do banco (110.000,00;
  62.761,34). 4 mutacoes mortas.
  ⚠ A 523 DE ALTURA A LISTA MOSTRA ~6 LINHAS (136–156px): o bloco "Dados do contrato" e os cartoes ocupam o resto; a 579 cabem ~9.
  ⚠ As 6 fotos de EDICAO de financiamento e emprestimo de `obrigacaoDialog.fotos.json` foram REGRAVADAS de novo: a foto e' do
    `body` inteiro e a pagina do contrato atras do dialogo mudou (o dialogo nao foi tocado).
  ⚠ SUITE-TESTE-OSCILA-01, UM NOME: em 07/10 uma execucao da suite inteira deu 4 falhas — a quarta foi `obrigacaoEdicao.test.tsx >
    foto do diálogo > criação de parcelamento`; sozinho o arquivo passou 3 de 3 e a suite seguinte deu as 3 de sempre.
- ⚠ "HOJE" E' A DATA LOCAL DO NAVEGADOR, E TEM UM DONO (PARC-FECHA-02 item 4, Gabriel 07/10/2026, so' tela): `hojeLocal()`,
  `dataLocalISO(d)` e `mesLocal()` em `src/lib/datas/hojeLocal.ts`. PROIBIDO `new Date().toISOString().slice(0, 10)` para data de
  calendario (competencia, vencimento, pagamento, emissao, filtro "hoje", nome de arquivo): `toISOString` e' UTC, e em Campo
  Grande (UTC−4) das 20h a' meia-noite ja' e' o dia seguinte — a competencia padrao do lancamento novo saia com a data de amanha.
  Carimbo de instante (`created_at`, `updated_at`, `valor_do_mes_em`) continua `toISOString()` inteiro.
  · TROCADOS (35 pontos em 26 arquivos): o modal do lancamento (novo e prefill), contrato, recorrencias, lista de Lancamentos,
    painel e endividamento de financiamentos (o "vencida / vence em 30 dias"), recebimento da OC, vencimento padrao do "Gerar
    compromissos" sem data de operacao, resumo de OCs, barter, graos (cotacao, venda, quebra), carga de mandioca, chuvas, mapa
    (movimentar lote; os 7 dias de transferencias), o corte de 4 anos do seletor de periodo da pecuaria, `p_a_partir_de` do
    contrato, a marca de auditoria do `parcelaMirror` e quatro nomes de arquivo CSV.
  · NAO TROCADOS, DE PROPOSITO (data DERIVADA, nao "agora"): os que montam a data em UTC e leem em UTC (`T12:00:00Z`, `Date.UTC`,
    `T00:00:00Z` — `fluxoPrevisto`, `saldoEmCaixa`, `useOperacaoLiquidacao`, `useConciliacaoDoMes`, `VincularMatchDireto`,
    `BuscarDespesaOCDialog`, `matchOfxOnDemand`, `linhaDigitavel`, `importZootHistorico`) estao certos em qualquer fuso; os que
    montam MEIA-NOITE LOCAL e leem em UTC (`LancamentoV2Dialog` ~:513/:524, `useImportacaoExtrato` ~:428, `recortePainel` ~:77,
    `useExcelLinhasAux` ~:313, `EspelhoConciliacaoTab` ~:887, `ConciliarExtratoDialog` ~:80) dao a data certa em fuso A OESTE de
    UTC (o Brasil inteiro) e a do dia ANTERIOR a leste — divida DATA-MEIA-NOITE-LOCAL-UTC-01.
  · Teste: `src/lib/datas/hojeLocal.test.ts` — relogio em 2026-10-06T23:30−04:00, fuso do processo America/Campo_Grande: o teste
    prova primeiro que o instante ja' e' dia 07 em UTC, depois que `hojeLocal()` = 2026-10-06; e varre a fonte (com auto-teste do
    detector) atras de "hoje" por `toISOString`. 2 mutacoes mortas.
  ⚠ NO BANCO (so' medido; NADA mudou): o servidor esta' em UTC e `CURRENT_DATE` vira o dia as 20h de Campo Grande. Quem o usa:
    `fn_candidatos_conciliacao` (titulo "vencido" e `dias_atraso`: das 20h a's 0h o que vence HOJE ja' aparece vencido, com 1 dia
    a mais de atraso) · `fn_contrato_criar_e_gerar` e `fn_contrato_editar_e_regenerar` (`v_hoje`) · `_fn_recorrencia_vagas` (o mes
    corrente: so' erra na ultima noite do mes) · `fn_reconciliar_parcela_financiamento` (`v_today`, status derivado da parcela) ·
    `oc_receber_lotes` e `oc_sincronizar_liquidacao_de_financeiro` (data na falta da informada) · `fn_locais_estoque` (vigencia) ·
    `agri_carga_mandioca_corrigir` (texto do motivo). `fn_financiamento_situacao` e `fn_financiamentos_situacao_lote` RECEBEM
    `p_hoje` da tela (o `CURRENT_DATE` delas e' so' a reserva, que nenhuma tela usa). Divida BANCO-HOJE-UTC-01: receber a data da
    tela, como a situacao do contrato.
  ⚠ PARCELA 'pago' SEM LANCAMENTO VIVO (PARC-FECHA-02 item 3, so' leitura, 07/10): 30 parcelas, todas de FINANCIAMENTO — NJ 19,
    Santa Rita 8, Raul 2, Agnaldo 1. 27 tem valor 0,00 e nunca tiveram lancamento (linhas de carencia / legado); 3 do NJ tem valor
    (5.178.526,13) e estao em contratos CANCELADOS, com o lancamento cancelado como duplicado em 03/09 e 22/09. Nenhum lancamento
    realizado de mesmo valor em ±7 dias foi achado para nenhuma. Nada foi vinculado nem alterado; a lista foi entregue ao Gabriel
    (nao vai para o repositorio). ⚠ A contagem do passo 4 (NJ 20, Santa Rita 11, Raul 3) era maior: nao sei dizer quais sairam.
- ⚠ A LISTA DE CONTRATOS E OS PAINEIS LEEM A SITUACAO DO MESMO DONO DO CONTRATO, EM LOTE (PARC-FECHA-02 item 2, Gabriel 06/10/2026;
  migration 20261027194500, ⚠ registrada como 20261007100908; ledger = arquivo, md5 53d1cb4f…). `fn_financiamentos_situacao_lote(
  cliente, hoje)` (md5 d85ccfa3…; so' leitura, `tenant_ok`, 42501, GRANT a `authenticated`) devolve `{ <financiamento_id>: <o
  retorno de fn_financiamento_situacao> }` — NAO REPETE A REGRA: chama o dono contrato a contrato. Uma chamada por tela.
  · NASCE DE DEFEITO VISTO NO NJ: a lista dizia saldo devedor 110.000,00 no "Reboque Agrícola" e 35.700,00 no "Lascas Eucalipto
    Tratado" (lia `financiamento_parcelas.status`, que ninguem atualiza quando se paga pelo Financeiro); os cartoes do topo
    herdavam o erro.
  · FRONT: leitor `src/lib/financiamentos/situacaoEmLote.ts` (`lerSituacaoEmLote`: uma peca torta invalida o lote inteiro;
    `resumoDoContratoNaLista`: em aberto = a vencer + vencido DOS CARTOES do dono, juros das nao pagas, proxima parcela;
    `parcelasDoLote`: a forma que os paineis liam, com `status` 'pago' SO' na parcela paga e a data de pagamento do LANCAMENTO;
    `totaisDaLista`: os cartoes do topo, em CENTAVOS — a tela nao soma). Leitura `lerSituacaoEmLoteDoBanco` /
    `useSituacaoEmLote` (`useSituacaoDoContrato.ts`). A lista segue na chave `financiamentos-lista` e passou a reler pelo canal
    do Financeiro (pagar pelo lancamento muda a lista sem F5).
  · TROCADOS (nao consultam mais `financiamento_parcelas`): `FinanciamentosListaPage.tsx` (linhas, "N/M", proxima, cartoes
    Principal em aberto · Juros a vencer · A pagar), `useFinanciamentosPainel.ts` (o painel de financiamentos) e
    `useEndividamentoAtual.ts` (endividamento atual: a data de pagamento passou a ser a do lancamento).
  · FICARAM, E POR QUE (nenhuma coluna apagada): `useEndividamentoMensal.ts` -> `fn_endividamento_mensal` (BANCO; serie historica
    "saldo no fim de cada mes": o dono responde a situacao de HOJE, a serie pede desenho proprio) · `useParcelasFinanciamento.ts`
    :92 (a Mesa: parcelas 'pendente' candidatas a casar com o extrato — e' pergunta de conciliacao) ·
    `usePlanejamentoFinanceiro.ts` ~:432, `buildPlanejamentoVisaoGeralData.ts`, `useResumoExecMeta.ts`, `indicadorCatalogo.ts`
    (Planejamento/META, so' admin) · `ObrigacaoDialog.tsx` :326–333 e ~:1236 (a tabela e as travas da edicao de FINANCIAMENTO
    com juros) · `ModalBaixaParcela.tsx` (o ESCRITOR da coluna) · `FinanciamentoDetalhe.tsx` ~:173 (o deslocamento de parcelas do
    financiamento) · `documentosPendentes.ts` :175 (so' pergunta se e' 'cancelado') · `FinanceiroV2Tab.tsx` :553 (so'
    `financiamento_id`); banco: `fn_endividamento_mensal`, `fn_financiamento_sincronizar_status`,
    `fn_contrato_editar_e_regenerar`, `fn_financiamento_pagar_pelo_extrato` e os dois reconciliadores.
  · TAMANHO DA CORRECAO — "em aberto" dos contratos ATIVOS, antes (coluna da parcela) x depois (o dono), em 06/10:
        cliente       ativos   antes            depois           diferenca
        NJ            41       22.368.564,24    22.053.680,72    −314.883,52
        Vera          7        280.799,25       274.917,75       −5.881,50
        Santa Rita    14       12.008.672,32    12.008.672,32    0,00
        RRCC          2        2.597.740,00     2.597.740,00     0,00
        Agnaldo       8        22.680,00        22.680,00        0,00
        Teste         2        7,38             7,38             0,00
  Provas: teste SQL `supabase/tests/parc_fecha_02_situacao_lote_test.sql` (L1–L3: lote = dono em todos os contratos dos 7
  clientes); NO NAVEGADOR, NJ, so' leitura, 1.126 x 523: Reboque Agrícola 25.666,66 · 5/7, Lascas 17.850,00 · 3/6, iguais ao
  contrato; soma das 41 linhas 22.053.680,72 = cartao "A pagar"; do clique a' lista na tela 0,94 s; a RPC custa 53 ms no NJ, 33
  na Santa Rita, 7 na Vera. 4 mutacoes mortas.
  ⚠ DIVIDAS: o tempo de carga de ANTES nao foi medido na tela (so' o de depois) · 'parcial' entra nos paineis como 'pendente'
    pelo valor CHEIO da parcela (na lista entra so' pelo que falta, via cartoes) — 0 casos reais hoje · o painel de
    financiamentos nao rele pelo canal (a chave `painel-parcelas` so' e' invalidada por quem ja' a invalidava) · os paineis NAO
    foram abertos no navegador (provados pelo leitor e pela fonte).
- ⚠ NO PARCELADO O "TIPO / Nº DOCUMENTO" DO TOPO FICA EM LEITURA; A NOTA DA COMPRA TEM UM DONO (PARC-FECHA-02 item 1, Gabriel
  06/10/2026, so' tela: "ponho nota fiscal, digito o número, salvo e ele vira documento… não persiste"). DUAS CAUSAS, MEDIDAS:
  · EDICAO DA PARCELA GRAVADA: o banco GRAVAVA (auditoria do NJ: 58bfafe9 e 9e159df4, `tipo_documento` nulo -> "Nota Fiscal" com o
    numero 119238). Quem perdia era a LINHA EM MEMORIA: o remendo de `editarLancamento` (`useFinanceiroV2.ts`, o objeto `doBanco`)
    nao levava `tipo_documento` — o campo e' OPCIONAL em `LancamentoV2`, entao a anotacao "campo esquecido = erro de compilacao"
    nao o via. Reabrir o modal (que le' da LISTA) mostrava o numero sem tipo ("Doc. 119238" na coluna, pelo rotulo de reserva do
    `docDaLinha`), e um salvar seguinte mandaria o tipo NULO. Conserto: `tipo_documento: verify.tipo_documento` no remendo.
    ⚠ CAMPO OPCIONAL NO TIPO ESCAPA DA GUARDA DO REMENDO: quem acrescentar coluna ao lancamento a poe no `doBanco` a' mao.
  · CRIACAO DO PARCELADO: `montarPayloadParcelamento.ts` nao tem `tipo_documento` nem `numero_documento` — o que se digitava no
    topo nunca viajou para `fn_parcelamento_cadastrar` (confirmado: as parcelas novas do NJ nascem com os dois nulos).
  · A SAIDA ESCOLHIDA E' A (b): o documento da compra e' o REGISTRO ligado a's N parcelas (aba Documentos, logo abaixo do topo);
    um segundo lugar que grava por parcela faria a nota divergir entre as parcelas. Dono: `topoDoDocumentoTravado` /
    `ehParcelaDeParcelamento` / `MOTIVO_TOPO_NO_PARCELADO` (`documentoHelper.ts`). No Novo lancamento com modalidade PARCELADA e
    na parcela de parcelamento JA' GRAVADA (`origem_tipo = 'parcela_principal'` sem `origem_lancamento`) os dois campos ficam
    APAGADOS, com o motivo escrito na linha do titulo do bloco ("A nota desta compra fica em Documentos e vale para todas as
    parcelas."); com a NF ligada, esse lugar mostra a nota (passo 3) e o motivo vai no `title` do campo.
    NADA SE PERDE SEM AVISO: no Novo parcelado, o que ja' estava digitado no topo ganha o link "levar o que foi digitado para
    Documentos da compra" (vira documento pendente da compra, ligado a's N ao salvar) e, se ficar la', o Salvar PARA com a frase
    ao lado do botao e abre a aba Documentos. Lancamento que nao e' parcela: identico (as fotos do modal nao mudaram).
  Medido a 1.126 x 523 no Teste, sem gravar: bloco de 91px com o topo livre, travado com o link e depois do link; motivo + link
  598 de 598px, sem corte. 5 mutacoes mortas. Testes: `useFinanceiroV2.tipoDocumento.test.ts`, `docDaLinha.test.ts`,
  `notaDaCompraNoModal.test.tsx`.
  ⚠ DIVIDAS: PARC-TOPO-PROPRIO-LEGADO-01 (parcelas que JA' tem tipo/numero proprios — 7 no NJ em 06/10 — seguem mostrando-os, em
    leitura, com prioridade sobre a nota ligada; nao ha' gesto para limpa'-los) · financiamento com juros segue com o topo livre ·
    NAO PROVADO NO NAVEGADOR: o Salvar do Novo parcelado parando com a frase, e criar pela tela e reabrir cada parcela (a NF nas
    N parcelas foi provada no passo 6 pelo mesmo gravador; aqui so' o link e o topo travado foram vistos).
- ⚠ DOCUMENTOS NO CONTRATO DO PARCELAMENTO: O CONTRATO NAO GUARDA DOCUMENTO, MOSTRA E GRAVA OS DOS LANCAMENTOS DAS PARCELAS
  (PARC-LIVRES-01 passo 6, Gabriel 05–06/10/2026, so' tela, sem banco: "Não tem opção de incluir NF e importar no modal pai").
  Editar obrigação ganha a aba "Documentos" (so' na EDICAO de PARCELAMENTO): `DocumentosDoContrato`
  (`src/components/financiamentos/`). NENHUM SEGUNDO CADASTRO: os donos sao os do modal do lancamento.
  · DOCUMENTOS DA COMPRA (valem para todas as parcelas): a MESMA `AbaDocumentosLancamento`, sobre os documentos da 1ª parcela viva
    (onde a NF e' registrada) SEM o boleto dela e sem o confronto de uma parcela so'; prop nova `semBoleto` (o formulario nao
    oferece Boleto). Documento registrado por ali e' LIGADO a's N parcelas pela mesma `fin_documento_vincular` do nascimento. UMA
    NF, N vinculos: anexar pela parcela ou pelo contrato da' no mesmo registro. Sob a lista, a NF contra a COMPRA INTEIRA: "Nota R$ X
    · compra (soma das parcelas) R$ Y · confere ✓ / não confere" — os dois numeros lado a lado (a soma e' `cartoes.somaTotal`,
    do banco); a tela so' compara, em centavos.
  · O BOLETO DE CADA PARCELA: a MESMA `ParcelasDaCompra` (a grade do lancamento novo), com as parcelas VIVAS do banco
    (`fn_financiamento_situacao`: a retirada nao entra; a PAGA entra e recebe boleto). "+ Boleto", soltar na linha e "Anexar vários
    boletos" (`AnexarBoletosDialog`) GRAVAM NA HORA pelo dono `gravarDocumentosDoParcelamento`; o boleto gravado aparece com o
    nome clicavel (prop nova `onVerBoleto`, abre pela URL assinada do dono); ✕ pergunta no lugar FIXO de 22px ("Tirar o boleto da
    parcela N? Sim, tirar / Não") e cancela pelo dono com `MOTIVO_TIRAR_BOLETO`. Recado e recusa escritos nesse lugar, sem toast.
  · IMPORTAR XML CONFERE, NAO SOBRESCREVE: a area "Importar XML da nota" le' pelo `lerNFe` e abre um DIALOGO proprio (760 x 187)
    com a tabela Campo · Contrato · Nota · Situação — fornecedor pelo CNPJ/CPF (so' digitos; cadastro sem documento = "não
    comparável", nunca "confere"), valor total ao centavo, parcelas x duplicatas. Dono puro:
    `src/lib/financiamentos/notaContraContrato.ts` (`conferirNota`, `duplicatasEmAberto`, `usarDuplicatasDaNota`). Dois gestos:
    "Gravar esta nota no contrato" (registra UMA NF com o XML como arquivo e liga a's N) e "Usar as duplicatas da nota" (so' quando
    diferem; apagado com o motivo ESCRITO quando nao vale): leva a lista a' aba Parcelas — a nao paga e' EDITADA ("editado · era
    …"), a que sobra sai, a que falta entra — SEM GRAVAR; a duplicata igual (data e valor) a uma parcela paga E' a parcela paga.
    ⚠ O DIALOGO NASCEU DE MEDICAO: a tabela dentro da aba deixava 5px para a grade dos boletos a 523 de altura.
  · ALTURA FIXA: a aba tem `clamp(250px, calc(100vh - 262px), 420px)`; so' a grade dos boletos rola. Medido a 1.126 x 523 no
    Teste: dialogo 1024 x 519, aba 698 x 261 igual vazia, com a NF, com a pergunta do ✕ e com o XML aberto; linhas de 18px; o
    CNPJ nunca corta (parte fixa da celula; o nome corta com `title`).
  PROVA NO NAVEGADOR (cliente Teste, 06–07/10, contrato sintetico de 3 parcelas, criado por RPC e APAGADO): banco antes — 0 NF, 0
  vinculos, NF por parcela 0,0,0; XML sintetico importado e "Gravar esta nota" — 1 NF, 2 vinculos (dona + 2 = as 3), NF por
  parcela 1,1,1 pela `vw_lancamento_documentos` (a que o modal do Financeiro le'); "+ Boleto" na 2ª — "1 de 3 com boleto", nome
  clicavel; ✕ + Sim — 0 boletos vivos, 1 cancelado; "Usar as duplicatas" — aba Parcelas com "2 | 18/11/2026 | 120,00 | editado ·
  era 20/11/26 · 100,00" e "3 | 15/12/2026 | 80,00 | editado · era …", Diferença 0,00 ✓, e NADA gravado (0 parcelas mudadas).
  ⚠ FOI O PRIMEIRO `.xml` REAL NO BUCKET `fin-documentos` (fecha o "nunca exercitado" do UI-ARRASTAR-ARQUIVO-01a quanto a SUBIR).
  Testes: `documentosDoContrato.test.tsx` 12, `notaContraContrato.test.ts` 8; 8 mutacoes mortas.
  ⚠ FINANCIAMENTO COM JUROS: a aba nao aparece. Faltaria: (1) a parcela tem DOIS lancamentos (principal e juros) — decidir em
    qual o boleto mora e ligar a NF aos dois ou so' ao principal; (2) nao ha' "compra" nem duplicata: o documento e' o contrato de
    credito, e a conferencia por nota nao se aplica; (3) o escritor dos lancamentos e' o motor, que cancela e recria — o documento
    ficaria no cancelado (o defeito do "Protocolo IATF").
  ⚠ DIVIDAS: PARC-DOCS-ARQUIVO-ORFAO-TESTE-01 (2 arquivos sinteticos da prova — um .xml e um .pdf de 9 bytes — ficaram no bucket
    `fin-documentos` sob o cliente Teste: o banco recusa DELETE direto em `storage.objects`; tirar pela API de Storage) · o
    boleto gravado aparece pelo NOME DO DOCUMENTO ("boleto"), nao pelo nome do arquivo (a view nao o traz) · a faixa "Documentado —
    / Valor do lançamento —" da lista aparece vazia no contrato (o confronto de uma parcela so' foi desligado) · o emitente do
    formulario so' oferece o fornecedor do contrato (+ "Outro") · "Usar as duplicatas" casa a duplicata com a parcela paga so' por
    data E valor iguais · NAO PROVADO NO NAVEGADOR: "Anexar vários boletos", arrastar e soltar real, o "ver" do boleto abrindo a
    URL, trocar a NF pelo lapis, a recusa de um XML que nao e' nota, fornecedor COM CNPJ (confere / difere), contrato com muitas
    parcelas (a grade rolando) e parcela paga na grade (so' por teste); a NF vista ao ABRIR cada parcela pelo Financeiro foi
    conferida pela view que o modal le', nao pelo clique.
- ⚠ CONFERENCIA DO BOLETO (PARC-LIVRES-01 fechamento D, 06/10/2026, so' tela; relato do Gabriel: "sumiu a opção de incluir boleto").
  NAO SUMIU NO CODIGO: a aba Documentos do `LancamentoV2Dialog` e' a mesma do commit 20ff55d (as condicoes dos tres ramos nao
  mudaram). Conferido no navegador, cliente Teste, 1.126 x 523, sem gravar pela tela:
      cenario                                              antes de hoje (20ff55d)         agora
      Novo parcelado · Igual todo mês (valor + venc.)      Documentos da compra + grade     igual: 2 linhas, 2 "+ Boleto", "Anexar vários"
      Novo parcelado · Parcelas livres                     nao existia                      as MESMAS linhas da grade livre (nº, venc., valor)
      Novo parcelado SEM valor ou SEM vencimento           grade VAZIA, sem motivo          grade com o motivo escrito; "Anexar vários" apagado
      Parcela gravada, pela lista (nao paga, paga, e a     NF da compra + boleto +          igual, nas tres; "Anexar boletos das parcelas"
        acrescentada pelo 2B)                              "Adicionar documento" +          diz 3 parcelas (dizia 4: contava a retirada)
                                                           "Anexar boletos das parcelas"
      Parcela gravada, pelo lapis do contrato (passo 4)    nao existia                      o mesmo modal: NF, boleto e os dois botoes
  · ONDE O "+ Boleto" NAO APARECE: (1) no Novo parcelado enquanto o lancamento nao tem VALOR e VENCIMENTO (nao ha' parcela
    prevista para listar) — agora a grade escreve `MOTIVO_SEM_PARCELAS` e o "Anexar vários boletos" fica apagado com ele; (2) na
    parcela JA' GRAVADA nunca houve botao "+ Boleto": o boleto entra por "Adicionar documento" (tipo Boleto) ou "Anexar boletos
    das parcelas"; (3) no "Editar obrigação" do contrato nao ha' documento nenhum (e' o passo 6).
  · DEFEITO CONSERTADO (vinha do 2B): `lancamentosDoParcelamento` (`documentosPendentes.ts`) trazia tambem a parcela RETIRADA
    (status 'cancelado'), que guarda o numero que tinha — o MESMO da acrescentada no lugar. O "Anexar boletos das parcelas" dizia
    "4 parcelas" num contrato de 3 e a busca pelo numero podia cair na retirada. Agora a retirada nao e' irma.
  ⚠ ACHADOS, sem corrigir: o selo da NF na aba Documentos diz "4 parcelas" num contrato de 3 (o `ligado_a_qtd` da view conta o
    vinculo da parcela retirada, que segue ligada a' NF por desenho do 2B) · no Novo lancamento a "Data Competência" nasceu
    07/10/2026 a's 22h40 de 06/10 (hora local): a data padrao sai em UTC — FIN-DATA-PADRAO-UTC-01.
- ⚠ A CONTA DIRETO NO CAMPO DE VALOR TEM UM DONO, E GUARDA-SE SO' O RESULTADO (FIN-VALOR-CALC-01a, Gabriel 05/10/2026, so' tela).
  Ele lanca rateios (o cliente manda o valor cheio, o lancamento e' uma parte): digita "16.238,00/2" no campo e fica o
  resultado; a conta NAO vai para observacao nem para lugar nenhum.
  · DONO: `src/lib/calculos/contaNoCampo.ts` (puro; NAO avalia codigo; analisador proprio) — `ehConta(texto)`,
    `calcularConta(texto) -> { ok: true, valor } | { ok: false, motivo: vazia|invalida|divisao_por_zero|negativa|grande_demais,
    incompleta }`, `contaOk`, `FRASE_DA_CONTA`, `TETO_DA_CONTA` (999.999.999,99). Operandos SO' pelo `parseMoeda` (o unico parser
    BR); aritmetica em FRACAO exata de inteiros (bigint), arredondada a centavos so' no fim (0,1+0,2 = 0,30; 100/3 = 33,33).
  · GRAMATICA: `["="] soma`; `soma := termo {(+|-) termo}`; `termo := fator {(*|/) fator}`; `fator := (numero | "(" soma ")") ["%"]`;
    `*` tambem x X ×, `/` tambem ÷, `-` tambem "−"; espacos ignorados. SEM sinal unario: "-5" nao e' conta. `%` de calculadora:
    A*50% = A×0,5; A/50% = A÷0,5; A+10% = A×1,1; A−10% = A×0,9 (termo com mais de um fator nao e' "sozinho": 100+50%*200 = 200).
  · CAMPO: `CampoValorComConta` (`src/components/financeiro-v2/`), usado SO' pelo Valor do `LancamentoV2Dialog`. SEM OPERADOR e' o
    campo de sempre (mascara de centavos, select no foco, tabIndex 10 — HTML do modal identico, preso por foto em
    `valorComConta.fotos.json`). Entra em MODO CONTA ao digitar/colar operador ou "=" (operador digitado com o campo todo
    selecionado usa o valor que estava como primeiro operando; "-5" COLADO segue a mascara). Em conta o texto e' livre e o
    resultado aparece na LINHA DO ROTULO ("Valor · = 8.119,00"; incompleta "= …"; recusa em vermelho), `aria-live="polite"`.
    Enter ou sair do campo APLICA (escreve o resultado mascarado); conta que nao vale no blur NAO aplica, volta o valor de antes e
    a frase fica ate' a proxima tecla; Esc cancela a conta e o modal NAO fecha (`contaAbertaRef` + `onEscapeKeyDown` do dialogo).
  · ⚠ O MODAL CONTINUA COM UM VALOR (`valorDisplay`/`valorNum`): enquanto a conta esta' aberta o campo NAO escreve nada nele — a
    tela mostra o que vai gravar, nunca o texto parcial. O modal nao tem `<form>` nem tecla que salve (preso por teste de fonte).
  Medido a 1.135 no cliente Teste (sem gravar): coluna de 118px; "= 999.999.999,99" pede 88,5 e fica inteiro — quem corta e' a
  palavra "Valor ·", com o texto inteiro no `title`; modal 547px, topo do campo 242 e coluna 56 em todos os passos.
  ⚠ DIVIDAS: FIN-VALOR-CALC-01b (levar a conta ao `CampoMoeda`, 21 usos: a lib e' a mesma; la' o campo ja' e' texto livre e fecha
    no blur) · no CELULAR o teclado numerico do campo nao tem operadores (a conta entra por cola; em modo conta o `inputMode` vira
    texto) · a origem do XML some do rotulo enquanto a conta esta' aberta (volta ao aplicar/cancelar) · Enter com conta invalida
    deixa a conta aberta com a frase, sem outro sinal · no gate de navegador o Cancelar do modal nao fechou em 0,8 s (conferir se e'
    a confirmacao de descarte) · nao provado no navegador: Ctrl+V de verdade, o clique real em Salvar com a conta aberta, o
    campo em ambar e o campo travado (so' por teste).
- ⚠ "EDITAR OBRIGACAO" MOSTRA O QUE SALVOU E NAO DESCARTA EM SILENCIO (PARC-OBRIGACAO-EDICAO-01a, Gabriel 05/10/2026, so' tela).
  Nasce do caso da Vera (contrato 4f53db54): editou, salvou, reabriu e viu o valor antigo; salvar de novo regravava o velho.
  · CACHE: o `ObrigacaoDialog` le' o contrato por `['obrigacao-edicao', id]`, as parcelas por `['obrigacao-edicao-parcelas', id]` e
    os lancamentos delas por `['obrigacao-edicao-lancamentos', id]`; o `saveEdit` (`FinanciamentoDetalhe.tsx`) invalida as TRES. E
    o form so' e' semeado com a busca TERMINADA (`isFetching` falso): reaberto, o dialogo nao semeia com a copia do cache. Depois
    de semeado (`carregado`), busca nova nao reescreve nada — edicao em curso fica.
  · CLASSIFICACAO: na edicao de parcelamento o cluster e' HIDRATADO uma vez com a linha do plano do contrato
    (`plano_conta_parcela_id`: conta, macro, grupo, centro; atividade = escopo do plano, na falta `tipo_financiamento`). O efeito de
    espelho (cluster -> `form.plano_conta_parcela_id`) NAO age antes de o form ser semeado nem copia cluster vazio nao hidratado:
    abrir nao zera a conta nem acende "Escolha a classificação da parcela". Conta fora do plano carregado: preservada como esta'.
  · SAFRA, CULTURA/FASE E FORMA DE PAGAMENTO SAO DAS PARCELAS (nao ha' coluna no contrato): na edicao sao LEITURA, lidas dos
    lancamentos das parcelas (por `financiamento_id`, recortados pelo `lancamento_id` das parcelas) — iguais = o valor; divergentes
    = "varia entre as parcelas"; todas sem o dado = a palavra da casa (Sem safra / Todas (rateia) / Nenhuma); nenhuma parcela
    lancada = "—". Dono puro: `src/lib/financiamentos/valorDasParcelas.ts` (`valorComumDasParcelas`, `textoDasParcelas`,
    `MOTIVO_VALE_POR_PARCELA` = "Vale por parcela. A alteração em todas as parcelas chega na próxima etapa."). O cluster
    (`ClassificacaoLancamento`) ganhou `ocultarLinhaDaSafra` (padrao false: lancamento, recorrencia e a CRIACAO identicos): com
    ela nao desenha nem SUGERE safra; o dialogo desenha a linha em leitura. Na CRIACAO nada mudou.
  · TOAST: "Obrigação atualizada"; se descricao, conta do plano ou conta bancaria mudaram e ha' parcelas, com a descricao "As
    parcelas já lançadas não foram alteradas."
  · FINANCIAMENTO E EMPRESTIMO (mesmo dialogo) nao mudam: foto (md5 + tamanho do HTML) das tres abas, em criacao e edicao, presa
    em `obrigacaoDialog.fotos.json`; regravar com `OBRIG_FOTO=gravar` so' quando a mudanca for de proposito.
  Medido a 1.135 na Vera (so' leitura): dialogo 558px nas tres abas, sem rolagem do modal nem da coluna; motivo 698 de 698px.
  ⚠ DIVIDAS: PARC-CONTRATO-SEM-AUDITORIA-01 (`financiamentos` nao tem `updated_by` nem auditoria) · PARC-PROPAGACAO-PARCELAS-01
    (levar descricao, conta, safra, fase e forma do contrato as parcelas, com a pergunta "so' o contrato / nao pagas / todas";
    RPC e mock) · a FAZENDA segue editavel na edicao de parcelamento e NAO e' gravada pelo `saveEdit` (mesmo descarte) · conta do
    contrato fora do plano ativo: cluster vazio sem frase · a prova da CRIACAO de parcelamento e' por HTML/diff, sem teste de
    payload · o `saveEdit` grava em varias idas ao banco, sem transacao (contrato, parcelas deslocadas, captacao) · rotulo
    "Lavoura" x valor `agricultura`: a linha de Cultura depende da atividade do cluster, sem caso real no proto · o resumo lateral
    do dialogo sobra 3px (371 de 368) a 1.135 · `FinanciamentoDetalhe.tsx:228` TS2322 `number` -> `string` no `sinal: 1` do insert
    da captacao (baseline: o tipo gerado diz string) · nao provado no navegador: salvar -> reabrir, "varia entre as parcelas", a
    linha de Cultura e o toast com a frase (so' por teste).
- ⚠ O IMPORTADOR DE EXCEL NAO GRAVA LINHA SEM DATA DE PAGAMENTO (FIN-IMPORT-EXCEL-STATUS-01a, Gabriel 05/10/2026, so' tela;
  "sem data de pagamento nao pode entrar como realizado"). O status da linha importada tem UM dono, `statusParaImportar({
  dataPagamento, statusPlanilha })` (`src/lib/financeiro/statusFinanceiro.ts`): com data -> 'realizado'; sem data -> recusada
  ('sem_data_pagamento'), MESMO com "pago/realizado" na coluna Status; "a pagar/previsto" COM data -> recusada
  ('a_pagar_com_data'). A previa (`avaliarLinha`, `src/v2/lib/importLanc/importLancamentosView.ts`) consulta o dono, guarda o
  resultado em `LinhaPrevia.statusAGravar` e deixa a recusada de FORA com o motivo; o gravador
  (`useImportLancamentosExcel.ts`) le' esse campo e tem guarda propria (`statusAGravar === null` nao grava). NENHUM default de
  status no gravador (preso por teste que le' a fonte). Vale nos DOIS modos (criar e atualizar por ID); no modo veste a linha
  sem par segue "sem par no extrato". A recusa vem ANTES de fazenda nao resolvida e de mes fechado: a contagem e' a da planilha.
  ⚠ NASCE DE DEFEITO MEDIDO: o gravador tinha "na falta, realizado", o dedup so' enxerga data de pagamento, e a planilha de
    PREVISOES de out/26 do NJ entrou em 05/10 com 229 linhas, 226 "realizadas" sem data (858.240,65), 40 gemeas de recorrencia/
    contrato previstos. E' CONTENCAO: previsao ainda nao entra por esta tela (fila FIN-IMPORT-EXCEL-PREVISOES-01).
  · TELA: no bloco de totais, a frase do dono `fraseDoMotivoNaPrevia` ("N linhas sem data de pagamento nao serao importadas —
    previsao do mes ainda nao entra por esta tela.") com a soma; a linha fica na tabela com "⚠ Sem data de pagamento" (rotulo
    CURTO: a coluna Situacao tem 190px); o botao diz "Importar N de M: …" (N = o que o gravador faz) e, com zero, fica apagado
    com o motivo ao lado. Medido a 1.135 no cliente Teste (planilha sintetica, sem importar): tabela 867 sem rolagem horizontal,
    linhas de 20px, Situacao pede ate' 171 de 182, frase 491 de 721.
  · ⚠ A COLUNA "STATUS QUE VAI GRAVAR" NAO COUBE: a 1.135 levava a Descricao de 99 para 41px. Vai com o PR de previsoes.
  · CONSERTO DO NJ (05/10, script `docs/investigacao/fin-import-excel-status-01a-conserto-nj.sql`, decisoes do Gabriel): as 40
    gemeas da planilha canceladas pelo dono `fn_cancelar_lancamento_auditoria` (fica a recorrencia/contrato) e as outras 189 em
    'programado' sem data de pagamento.
  · LIMPEZA DAS DUPLICADAS DE RECORRENCIA DO NJ (FIN-IMPORT-PREVISOES-NJ-LIMPEZA-01, executada em 05/10/2026, script
    `docs/investigacao/fin-import-previsoes-nj-limpeza-01.sql`, md5 04c2d73c24d3439c71a507d88591f410; decisoes do Gabriel): 32
    linhas da planilha que repetiam contas PREVISTAS de recorrencia com o valor do mes foram CASADAS em 31 contas — a conta da
    recorrencia recebeu valor e vencimento da planilha e passou a 'programado' (fazenda, classificacao, descricao, competencia e
    `recorrencia_id` intactos, por hash); a linha da planilha foi cancelada pelo dono, com o motivo "Duplicada na importação Excel
    de 05/10/2026 — valor do mês levado para a conta da recorrência". Duas linhas para uma recorrencia = SOMA, vencimento o mais
    cedo (f4766a16, Leandro Deves: 9.784,80 em 04/10). Depois: a pagar/receber com vencimento em out/26 = 262 linhas,
    1.730.894,43; vivas da planilha = 154 (673.438,79); md5 do NJ fora das 63 identico; `audit_log` +63. FORA, sem tocar (o
    Gabriel confirma se sao contas distintas): 1ed5ffd8 (Mapfre 1.966,57), 31e2b2e1 (Ademicon 4.341,41), 53a82f31 (Porto Seguro
    218,81) — a recorrencia de cada uma ja' tinha casado com a gemea exata das 09:41.
  ⚠ [RESOLVIDA PARA AS MARCADAS no REC-PROPAGAR-VALOR-DO-MES-01 — ver a regra "O VALOR DO MES TEM MARCA NA LINHA": as 31 contas
    do NJ estao marcadas 'planilha' e o Propagar as pula. O texto abaixo e' o registro do defeito.]
  ⚠ DIVIDA REC-PROPAGAR-SOBRESCREVE-VALOR-DO-MES-01: `fn_recorrencia_propagar` em "futuros"/"todos" regrava valor
    (`abs(valor_base)`), descricao, fornecedor, fazenda, conta, subcentro, safra, forma e observacao em TODA linha viva da
    recorrencia em previsto/programado/agendado sem pagamento, sem olhar `editado_manual` nem o valor atual — apaga o valor do mes
    trazido pela planilha (nao toca o vencimento). NO NJ HA' 31 CONTAS NESSE ESTADO DESDE 05/10/2026: NAO usar o Propagar la' ate'
    serem pagas. Conserto no PR de previsoes (o propagar pula conta ajustada pela planilha).
  ⚠ DIVIDAS: FIN-STATUS-SEM-PGTO-CHECK-01 (falta CHECK no banco "realizado exige data de pagamento"; antes, medir o escritor das
    18 parcelas de financiamento da Santa Rita realizadas sem data desde 21/05/2026) · FIN-IMPORT-EXCEL-PREVISOES-01 (importar
    previsao com status proprio, lote + desfazer, comparacao nova/igual/mudou antes de gravar; a coluna do status na previa vai
    junto) · DATA DE PAGAMENTO FUTURA COM REALIZADO e' aceita em todo o sistema (modal manual e importador) · os rotulos ANTIGOS
    da coluna Situacao da previa empilham em duas linhas (so' os dois novos foram medidos) · o dialogo de confirmacao diz "Serao
    criados N" contando as elegiveis, nao as aprovadas · defaults de status realizado nao auditados em
    `FinanceiroCaixaTab.tsx:179` e `CusteioTxtImportTab.tsx:322/522` · no modal de progresso, "sem par no extrato" segue valendo
    para todos os OUTROS motivos de exclusao · as 9 linhas do criterio largo e as 7 de repeticao interna da planilha do NJ nao
    foram tocadas.
- ⚠ A TELA MOSTRA O QUE VAI GRAVAR (FIN-PGTO-FANTASMA-01, Gabriel 04/10, so' tela). A regra do pagamento nao mudou — so'
  realizado/conciliado tem data de pagamento, e o dono e' `pagamentoParaGravar` (`src/lib/financeiro/statusFinanceiro.ts`). O
  defeito era a tela: o `LancamentoV2Dialog` hidratava a data do banco de um previsto/programado/agendado, mostrava-a no campo
  desabilitado e no resumo, e o salvar a gravava NULA sem aviso (medido no gate do CONC-SEM-F5-01: o 5a9f8ea4 do cliente Teste
  perdeu o 10/09/2026 numa edicao so' de descricao). "Preservar o que o usuario nao tocou" foi RECUSADO: contradiz a regra de 30/09.
  · O campo "Data Pagamento" e a linha "Pagamento" do resumo leem `pagamentoParaMostrar(status, pagamento, travado)` — o irmao de
    leitura, que E' `pagamentoParaGravar` com vazio no lugar de nulo (nunca uma segunda condicao no modal). Fora do realizado, e
    sem trava do extrato: campo vazio e desabilitado, resumo "—". Pagamento travado pelo extrato segue a' vista. O estado hidratado
    nao mudou: levar o lancamento a realizado mostra e grava a data que ele trazia.
  · O CASO LEGADO E' AVISADO ANTES: `pagamentoQueSeraRemovido(pagamentoDoBanco, status, pagamento, travado)` devolve a data que o
    salvar vai remover, e so' entao a tela escreve, em ambar, sob a primeira linha de campos: "este lançamento tinha data de
    pagamento DD/MM/AAAA sem estar realizado; ao salvar ela é removida" (`avisoPagamentoLegado`). So' na edicao; some se o status
    for a realizado. E' a UNICA vez em que o salvar apaga algo que o usuario nao tocou.
  · Contas a Pagar/Receber usa o mesmo modal: sem mudanca propria.
  · LEGADO CONHECIDO (medido em 04/10: 6 lancamentos vivos nao realizados com data de pagamento, em 71.985), SEM UPDATE por decisao
    do Gabriel: NJ 434823f9 "Revisão Hilux - 6/6" (programado, 10/08/26) e Vera 3684ea26 "Balança Pesagem - 2/2" (agendado,
    05/10/26) tem vencimento = pagamento e se normalizam no proximo salvar; os do cliente Teste (31399130, 4a92f0af, 16e69fbe,
    1285aa17; o 5a9f8ea4 ja' ficou sem data) ficam como estao.
  ⚠ O MODAL AINDA NORMALIZA OUTROS CAMPOS NO SALVAR SEM O USUARIO TOCAR (medido, nao mudado): `dados_pagamento` nulo quando segue o
    cadastro; safra nula e fazenda Administrativo em plano administrativo; conta de origem/destino pela direcao; o 18010 fixo na
    transferencia; macro/grupo/centro re-resolvidos do plano; cultura/fase zeradas fora da atividade; `ano_mes` (pagamento, senao
    competencia); `editado_manual` e `updated_by`.
  ⚠ DIVIDAS MEDIDAS NA FASE 0 PILOTO-ACHADOS-01 (so' registro):
    PGTO-LEITORES-NAO-AUDITADOS-01 — `fn_dre_pecuaria_lancamentos`, `fn_endividamento_mensal` e `fn_rateio_admin_mes` leem
      `data_pagamento` sem filtro de realizado aparente (busca por texto; nao auditadas);
    MASTERLOCK-GLOBAL-01 — `useMasterLock.ts:78-97` consulta `pastos`, `fechamento_pastos` e `valor_rebanho_mensal` com
      `fazenda_id = "__global__"` (400, 22P02, erro engolido) e NUNCA trava em modo Global; desde 17/04. Decisao do Gabriel
      pendente: conferir cada fazenda real ou nao travar;
    OC-ENRIQUECER-URL-01 — `enriquecerMovimentosOC.ts:150` manda `.in('movimentacao_id', ids)` com 1.254 ids no NJ (URL de 49 KB,
      "Bad Request", erro engolido): os movimentos de OC ficam sem valor, fornecedor e detalhe do abate na lista do rebanho;
    HOME-FIM-DE-MES-01 — `useProdutivoPorFazenda.ts:129` usa o dia 31 em mes de 30 (400, 22008);
    HOME-SALDOS-EMBED-01 — `useSaldosPorConta.ts:48` embute `financeiro_contas_bancarias` sem FK (400, PGRST200);
    HOME-VIEW-TIMEOUT-01 — `vw_zoot_fazenda_mensal` estoura o tempo no NJ (500, 57014).
- ⚠ O VALOR DO MES TEM MARCA NA LINHA, E O PROPAGAR PULA AS MARCADAS (REC-PROPAGAR-VALOR-DO-MES-01, Gabriel 05/10/2026; migration
  20261027193100, ⚠ registrada como 20261005140345; ledger = arquivo, md5 56bfc04d…). O valor da RECORRENCIA e' ESTIMATIVA ("estou
  lançando os próximos 12 meses, não sei se vai ser esse valor exato"); o valor e a data do MES vem da planilha ou de ajuste a'
  mao e valem mais.
  · A MARCA e' um FATO GRAVADO na linha do lancamento, nunca comparacao de valores na hora (o `valor_base` pode mudar depois):
    `financeiro_lancamentos_v2.valor_do_mes_em` (timestamptz) + `valor_do_mes_origem` ('planilha' | 'manual'), nulas em todo o
    resto; CHECK `fin_lanc_v2_valor_do_mes_chk` as mantem juntas. ⚠ CHECK COM `IN (...)` SOBRE COLUNA NULA DA' NULL, E NULL PASSA:
    a primeira versao aceitava marca sem origem (achado no ensaio) — o `IS NOT NULL` vai escrito.
  · `fn_recorrencia_propagar` (md5 fdde526a -> 6a932aa9, patch guardado por md5 com 7 ancoras) PULA a ocorrencia marcada em
    "futuros" e em "todos": NENHUM campo dela muda — valor, descricao, fornecedor, fazenda, conta, classificacao, safra, forma,
    observacao, nem a competencia (ela conta no estado final como linha que fica onde esta'). Marcada ja' PAGA em "todos": pulada
    inteira (decisao do Gabriel). O retorno ganha NO FIM `puladas_valor_do_mes` (as do escopo pedido; 0 em 'nenhum') e
    `valor_do_mes {futuros, todos}` (as que cada escopo pularia); os campos de antes nao mudaram de nome nem de sentido. ACL
    preservada (authenticated sim, anon nao). Sem marcada, retorno e linhas IDENTICOS aos da funcao anterior (provado no ensaio).
  · QUEM GRAVA A MARCA HOJE: so' o backfill desta migration — 31 contas do NJ 'planilha' (a limpeza de 05/10) e 10 da Vera
    'manual' (toda ocorrencia de recorrencia em aberto com valor <> `abs(valor_base)` na hora de aplicar; a marca leva o
    `updated_at` da linha). Fora das colunas novas nenhum valor mudou (md5 por cliente identico, 87.019 linhas).
  · TELA: o `PropagarRecorrenciaDialog` mostra, na MESMA LINHA da contagem ("15 futuros · 1 passado"), "N contas com o valor do mês
    ajustado ficam como estão." (`frasePuladasValorDoMes`, `src/hooks/useRecorrencias.ts`; 9,5px; N = `valor_do_mes[escopo]` do
    banco; "Não propagar" nao mostra nada; inteira no `title`), e o aviso de sucesso repete o numero da EXECUCAO. Com zero, o HTML
    e' o de antes (foto em `propagarValorDoMes.fotos.json`). Medido em DOM sintetico de 416px: caixa de 74px com e sem a frase.
  Teste SQL: `supabase/tests/rec_propagar_valor_do_mes_01_test.sql` (T1–T4, cenario sintetico no cliente Teste, termina em RAISE OK).
  ⚠ APLICAR MIGRATION COM `ADD COLUMN` NA TABELA DE LANCAMENTOS TRAVA A TABELA: os ensaios revertidos seguraram o lock ~3 s cada (o
    teto do `authenticated` e' 8 s) — ensaio curto, com `lock_timeout`, e a aplicacao avisada.
  ⚠ DIVIDAS: [REC-VALOR-DO-MES-MODAL-01 e REC-VALOR-DO-MES-DESFAZER-01 FECHADAS — ver a regra seguinte] · o dialogo do Propagar
    com a frase nunca foi aberto no navegador (so' aparece depois de salvar uma recorrencia) · a frase corta 4px no caso extremo
    ("60 futuros · 60 passados" com 31 contas) · `fn_previsoes_casar` (o PR de previsoes) e' quem vai gravar 'planilha' daqui em
    diante · os tipos do supabase nao foram regenerados (o front nao le' as colunas novas).
- ⚠ EDITAR UMA OCORRENCIA DE RECORRENCIA NO MODAL MARCA O VALOR DO MES, E "VOLTAR AO PREVISTO" DESFAZ (REC-VALOR-DO-MES-MODAL-01 +
  REC-VALOR-DO-MES-DESFAZER-01, Gabriel 05/10/2026, so' tela, sem migration e SEM GATILHO). Dono puro:
  `src/lib/financeiro/valorDoMes.ts`.
  · `marcaAoSalvar({ ehRecorrencia, aberta, antes, depois })`: lancamento comum -> 'nada' (as duas colunas NAO entram no UPDATE;
    payload e HTML identicos aos de antes); ocorrencia ABERTA com valor OU vencimento diferente do gravado -> 'marcar_manual'
    (inclusive a ja' marcada 'planilha': o operador assumiu); o resto -> 'manter'. ABERTA = o predicado "futuro" do Propagar
    (`ocorrenciaAberta`: previsto/programado/agendado/meta, sem pagamento, sem conciliacao), sobre o que VAI SER GRAVADO — a conta
    paga nao e' marcada (o Propagar nunca reescreve o valor dela, e a marca so' faria o "todos" pular a classificacao).
  · A MARCA VAI NO MESMO UPDATE DA EDICAO: o modal poe `valor_do_mes: 'marcar_manual' | 'limpar'` no form e o `editarLancamento`
    espalha `colunasDoValorDoMes` no `updatePayload` e na linha em memoria (como cultura/fase: o `verify` nao as tem no tipo). Sem
    pedido, nada entra. O ramo restrito do titulo de OC nao leva a marca (0 ocorrencias com parte de OC).
  · O MODAL SABE QUE E' OCORRENCIA pelo `recorrencia_id` da linha (todo hospedeiro entrega linha de `select('*')`) e le' da regra
    SO' o previsto: UMA consulta por id a `financeiro_recorrencias` (valor_base, dia_vencimento, data_inicio, primeiro_vencimento),
    so' na edicao de ocorrencia. `vencimentoPrevisto` e' ESPELHO DECLARADO de `_fn_recorrencia_vencimento`, conferido contra o
    banco nas 435 combinacoes distintas do proto (`valorDoMes.vencimentos.fixture.json`, so' datas).
  · ONDE APARECE: no RODAPE de 32px do modal (o modal nao falava de recorrencia em lugar nenhum; o resumo lateral nao tem
    rolagem). Marcada: "Valor do mês ajustado · previsto R$ X" (+ "· pela planilha") e o botao "Voltar ao previsto". Nao marcada
    com diferenca: "Ao salvar, fica como valor do mês · previsto R$ X" (a frase com "o Propagar não altera esta conta" vai no
    `title`). Sem diferenca, e em lancamento comum: nada. O numero nunca corta (parte `shrink-0`); o texto corta com o `title`.
  · "VOLTAR AO PREVISTO" (`GestoDeOperacao`): so' na marcada; apagado com o motivo escrito — "Conta já paga." (o GRAVADO nao esta'
    aberto), "Há pendência no lançamento." (o Salvar nao pode gravar), "Lendo a recorrência…". Confirmacao (`AlertDialog`) com os
    dois valores e as duas datas; confirmar roda o SALVAR DE SEMPRE (`handleSubmit(previsto)`) com valor = |valor_base|,
    vencimento = o da regra para a competencia e `valor_do_mes: 'limpar'`.
  Medido a 1.135 na Vera, so' leitura: modal 1024 x 547 e rodape 32 (topo 513) iguais na ocorrencia marcada (4ff3f3fe), na nao
  marcada com a intencao (13ec156e) e num lancamento comum (bd5346fa); a intencao pede 260px e cabe inteira (scrollWidth =
  clientWidth), a marcada 205. Prova do Propagar: `supabase/tests/rec_valor_do_mes_modal_01_test.sql` (o UPDATE como
  `authenticated`; a simulacao pula a conta; depois do voltar, nao). Dado: a c60e7b19 da Vera (editada no build anterior, sem
  marca) foi marcada 'manual' pelo script `docs/investigacao/rec-valor-do-mes-modal-01-marcar-c60e7b19.sql`.
  ⚠ O `fazendaFinanceiro.test.tsx` le' a fonte e ancora no comeco de `const handleSubmit = async (` (a funcao ganhou parametro).
  ⚠ DIVIDAS: o "agora" da marca e' o RELOGIO DO NAVEGADOR, nao o do banco · "Voltar ao previsto" SALVA O MODAL INTEIRO (o que mais
    estiver alterado na tela vai junto; a confirmacao diz) — nao ha' gesto que volte so' valor e vencimento · MARCADA E DEPOIS
    PAGA: a marca fica e o "todos" do Propagar pula a classificacao dela · 27 ocorrencias abertas com vencimento diferente do da
    regra e SEM marca (editadas antes deste PR) · o importador por ID e os escritores fora do modal NAO marcam · nao provado no
    navegador: salvar -> reabrir -> voltar, o gesto apagado em conta paga, o "· pela planilha" e a intencao com "Vincular à
    operação" / "Criar OC" no rodape (so' por teste; pela conta, sobram ~330px para os 260 da frase) · o Cancelar do modal
    acionado por script nao fecha em 1,5 s (ja' registrado no FIN-VALOR-CALC-01a).
- ⚠ A RECORRENCIA DIZ SE O VALOR E' CERTO OU A CONFIRMAR E MARCA FOLHA; A TELA MOSTRA O MES, E O MES TEM UM DONO (REC-VALOR-CERTO-01,
  Gabriel 06/10/2026; migration 20261027193600, ⚠ registrada como 20261006132308; ledger = arquivo, md5 3d7e1961…). "Mesmo numa
  recorrência de valor certo ele pode mudar — não pode engessar."
  ⚠ VOCABULARIO APROVADO, E SO' ELE: "Valor certo" e "A confirmar". As duas palavras do DRE (as dos dois blocos de custo) sao
    PROIBIDAS em rotulo, coluna, nome de campo e comentario nos arquivos da recorrencia — preso por teste de fonte com auto-teste.
  · BANCO: o tipo do valor REUSA `financeiro_recorrencias.tipo_valor` ('exato' = Valor certo · 'estimado' = A confirmar), que ja'
    existia desde 02/09 sem leitor; a migration criou so' `folha boolean NOT NULL DEFAULT false`, SEM BACKFILL (o sistema nao
    adivinha; o operador marca). ⚠ O BRIEFING PEDIA `valor_a_confirmar boolean` — NAO FOI CRIADA (decisao do Gabriel na pergunta
    de 06/10: seria a segunda coluna para a mesma verdade). Nenhuma funcao, policy ou ACL mudou; a tela grava a regra por
    insert/update direto (RLS). Teste: `supabase/tests/rec_valor_certo_01_test.sql` (T1–T6).
  · TRES FONTES, UMA POR PERGUNTA: o TIPO e a FOLHA sao da REGRA; o VALOR DO MES e' do lancamento da ocorrencia; "CONFIRMADO" e' a
    marca gravada do valor do mes (`valor_do_mes_em`) ou a conta ja' realizada/conciliada — nunca comparacao de valores.
  · DONO DO MES, puro, em centavos inteiros: `src/lib/financeiro/recorrenciasDoMes.ts` — `linhasDoMes(regras, ocorrencias, mes)`,
    `resumoDoMes`, `filtrarLinhas`, `totalDaLista`, `proporcoesDoMes`. A TELA NAO SOMA (preso por teste: sem `reduce` nem `+=`).
    O MES E' O DO VENCIMENTO (`competenciaQueVenceNoMes`, em cima de `vencimentoPrevisto`). Por recorrencia:
      com ocorrencia viva vencendo no mes -> o valor DELA (duas: soma; a situacao e' a pior), mesmo com a regra pausada;
      sem ocorrencia -> |valor base|, SO' se a regra esta' ativa, tem competencia que vence no mes e essa competencia ainda NAO foi
        gerada (acima da marca d'agua); competencia ja' gerada sem ocorrencia viva = conta CANCELADA, nao entra;
      situacao: valor certo -> 'certo'; a confirmar -> 'confirmado' (marca ou paga) ou 'estimado'.
    RESUMO: total · certo · confirmado · estimado (certo + confirmado + estimado = total, ao centavo) · `folha` (SUBCONJUNTO do
    total, nao quarta fatia) · `entradas` A' PARTE (recorrencia de receita nunca entra no total).
  · CADASTRO (`RecorrenciaDialog`): na linha 1, "O valor é *" (`Segmentado` Certo | A confirmar; novo nasce Certo); abaixo, um SLOT
    de 28px SEMPRE presente com a explicacao (vazia em Certo) e a caixa "Folha de pagamento". ⚠ TROCAR SO' O TIPO OU A FOLHA NAO
    ABRE O PROPAGAR (`mudouOQueSePropaga`, `useRecorrencias.ts`: so' os 13 campos que o Propagar leva aos lancamentos contam) e nao
    altera lancamento nenhum. Medido a 1.126: modal 672 x 514 nos tres estados; linha 1 = 268 · 92 · 112 · 142; "99.999.999,99"
    pede 87 dos 90 uteis do Valor base.
  · TELA (`V2Recorrencias.tsx`): regua do mes (`SeletorPeriodo` `modo="ano-mes"` `modoUnico`, meses neutros, nasce no mes corrente) ·
    CINCO CARTOES que nao mudam com o filtro (Recorrente em {mes} · Valor certo · A confirmar · ja' informado · A confirmar · ainda
    estimado, em ambar · Folha de pagamento · dentro do total), cada um liga/desliga o filtro dele · barra de proporcao de 8px ·
    linha de filtros de 22px (Todas | Valor certo | A confirmar | Folha · Todas | Confirmado | Estimado · No mês | Todas as regras ·
    busca) · tabela `table-fixed` com cabecalho navy preso · rodape "Total do mês" FORA da rolagem, com a MESMA regua (`Colunas`).
    Valores com ▼ / ▲ e `COR_SINAL`; o estimado em ambar; "0,00" apagado sem seta.
    "TODAS AS REGRAS" (criado neste PR: a tela nao tinha como ver a regra fora da vigencia no mes) lista toda regra; a coluna do
    mes fica "—" e os filtros do mes ficam apagados com o motivo.
    SAIRAM DA LISTA PARA O `title` DA DESCRICAO: periodicidade, proxima competencia, situacao da REGRA (ativa / gerada ate' /
    pausada), quantas geradas. Sairam os cartoes "Ativas" (a contagem esta' no `title` do primeiro) e "Geradas até o fim".
    Ordenacao em todas as colunas, primeiro clique do maior para o menor; abre por Dia crescente.
    MEDIDO a 1.126 no NJ (so' leitura): cartoes 168 x 42, "▼ 99.999.999,99" pede 108 dos 152 uteis nos cinco; colunas 232 · 118 ·
    100 · 70 · 36 · 56 · 84 · 100 · 66 · 22 = 884, linhas de 19px; pior numero: Previsto 73 de 76, Valor 83 de 92, rodape igual;
    nenhum cabecalho corta; cabecalho em 210 e rodape em 551 iguais ao trocar cartao, filtro, "Todas as regras" e mes (out, nov,
    jan); sem rolagem horizontal nem da pagina.
  · NUMEROS REAIS, out/26, pelo dono (so' leitura): NJ total 222.189,08 em 94 contas, tudo em valor certo, folha 0, entradas
    114.416,52 em 6 a' parte — = soma direta das 99 ocorrencias vivas (336.169,85) + 435,75 da regra "Internet - Leonardo", ativa
    e ainda nunca gerada. Vera 43.241,00 em 30, tudo certo = a soma direta. Nenhuma recorrencia esta' marcada "A confirmar" nem
    "Folha": o operador marca.
  ⚠ DIVIDAS E FILA: REC-VALOR-CERTO-02 (o selo "estimado" e as linhas confirmado / ainda estimado em Contas a Pagar e Receber) ·
    REC-FOLHA-01 (modal proprio de folha: admissao, historico, documentos; mock antes) · grafico por dia/mes e debito automatico x
    boleto na tela de Recorrencias · O GESTO DE MARCAR E SALVAR NAO FOI FEITO NO NAVEGADOR (o cliente Teste nao tem recorrencia;
    provado pelo payload em teste e pelo UPDATE como `authenticated` no teste SQL) · leitura das ocorrencias do mes com
    `(supabase as any).from` (`valor_do_mes_em` fora do `types.ts`; os tipos NAO foram regenerados — regenerar mexe na baseline do
    TSC) e com teto de 1.000 linhas (o rodape avisa "mês incompleto"; o maior mes do proto tem 99) · a contagem "geradas" do
    `useRecorrencias` le' TODAS as ocorrencias vivas do cliente sem paginar (NJ: 1.044 — ja' corta) · o rotulo do primeiro e do
    ultimo cartao corta a 152px (inteiro no `title`) · o cabecalho da tabela tem 22px (o primitivo), nao 18 · os cartoes e o
    rodape mostram SAIDAS; as entradas so' aparecem no rodape e na lista · a tela nao se monta em teste (lida da fonte).
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
- ⚠ BOITEL: SALVAR E CONCLUIR REAPLICAM O REALIZADO QUANDO O LOTE DIVERGE DO ACERTO (OC-BOITEL-REVALORAR-SALVAR-01, Gabriel 04/10,
  so' tela). Com realizado COMPLETO o lote TEM que valer o saldo do acerto. O Salvar da negociacao so' gravava o realizado com o
  RASCUNHO SUJO (payload diferente do gravado): numa OC com o realizado ja' gravado e o lote defasado, abrir o Realizado e Aplicar
  sem mudar numero nao sujava nada, e o revalorar nunca rodava (b58bf556, Vera: tres salvamentos em 04/10, lote em 565.217,00 x
  acerto 593.139,96). Dono da decisao: `decisaoDoRealizado` (`src/lib/oc/gravarRealizadoBoitel.ts`) — 'gravar' com rascunho sujo e
  completo OU lote divergente com realizado completo; 'recusar' com sujo e incompleto (a frase do campo, como sempre); 'nada' no
  resto, inclusive divergente com realizado ANTIGO incompleto (nao trava a negociacao de quem nem abriu o realizado). A divergencia
  e' a do motor (`valorDaVendaBoitel(...).divergente`, sobre o realizado SALVO e o slot `slotDaVendaBoitel(lotesApi.totais)`, dono
  unico usado pelo resumo e pelo Salvar); a escrita e' a de sempre (`oc_salvar_boitel('realizado')` -> `oc_revalorar_lote`,
  idempotentes), na ordem lotes -> projetado -> realizado -> revalorar. O botao Salvar ACENDE com a divergencia, sem nada editado.
  ⚠ O CONCLUIR NAO E' OUTRO CAMINHO: `VendaModalShell` chama `onSalvarNegociacao()` e so' conclui se ele nao devolver `false` —
    ele herda a condicao. Com a OC FECHADA nada disso roda: o Salvar recusa antes de ir ao servidor ("reabra para editar") e o
    dialogo do Realizado e' so' leitura; reabrir e' o primeiro passo.
  ⚠ A FRASE TEM UM DONO (`BoitelNegociacaoDerivado.tsx`): `COMO_RESOLVER_DIVERGENCIA` ("salve a negociação para atualizar", no
    `title`, no LoteDialog, na recusa da previsao e na modalidade B) e `COMO_RESOLVER_DIVERGENCIA_CURTO` ("salve para atualizar",
    so' na linha de 15px do resumo de 240px: a frase inteira pedia 255px e cortava com "…"). "reaplique o Realizado" saiu — era um
    gesto que a tela nao tinha.
  ⚠ O `LancamentosTab` NAO SE MONTA EM TESTE: a ligacao (condicao do Salvar, botao aceso) e' provada LENDO A FONTE, e o
    comportamento no `VendaModalShell` real com um anfitriao que usa as mesmas funcoes (`revalorarAoSalvar.test.tsx`).
  ⚠ DIVIDA ABERTA — OC-BOITEL-RASCUNHO-REALIZADO-01: 04/10 15:35 UTC, b58bf556: Salvar apos reabrir nao gravou o realizado
    (eventos reabrir 15:35:02 -> salvar_lotes + salvar_boitel('projetado') + fechar 15:35:13, nenhum 'realizado'). Hipotese 1 = a
    edicao nao entrou no rascunho (com a OC fechada o dialogo e' so' leitura; sobram 11 s entre reabrir e salvar); hipotese 2 =
    rascunho perdido entre o Aplicar e o Salvar, NAO descartada (nao reproduzida: editar exige reabrir, que e' escrita, e nao ha'
    no proto venda de boitel com realizado em aberto). No shell real o rascunho sobrevive do Aplicar ao Salvar (teste (5)).
  ⚠ PENDENCIAS: a TRAVA DE P1 x o acerto de boitel que chega 3-4 meses depois (o Salvar exige o mes da data da OC aberto; decisao
    do Gabriel) · a DEVOLUCAO DO ADIANTAMENTO e o principal PROGRAMADO nao acompanham o realizado (7f7de76f: 261.853,50 e
    42.416,00 contra 258.913,17 e 46.458,50; `oc_revalorar_lote` so' ajusta principal 'aberto' sem parcela, e a guarda "excede a
    base" mora so' em `oc_criar_compromisso`) · compactar o modal de venda em boitel (mock antes).
- ⚠ BOITEL (MODALIDADE A) COM ADIANTAMENTO: O SLOT E' O LIQUIDO DO ACERTO, E O ADIANTAMENTO SAO DUAS PONTAS FORA DO DRE
  (OC-BOITEL-ADIANTAMENTO-01a, Gabriel 04/10: "se tem devolucao do adiantamento, tem que estar na OC e no financeiro, igual, sem
  duplicar"). No financeiro a OC tem TRES lancamentos: a SAIDA do adiantamento, na data em que saiu ("Adiantamento de Boitel",
  5010, `SUBCENTRO_ADIANTAMENTO_BOITEL`); o RECEBIMENTO REF. OPERACAO (principal, "Venda em Boitel", 1150); e o RECEBIMENTO REF.
  ADIANTAMENTO DEVOLVIDO ("Devolução de Adiantamento de Boitel", 3020, `SUBCENTRO_DEVOLUCAO_ADIANTAMENTO_BOITEL`,
  `src/hooks/useOperacaoLiquidacao.ts`) — os dois ultimos na data do acerto, somando o "a receber do boitel"
  (`saldoReceberBase`). O adiantamento muda QUANDO o dinheiro passa, nao QUANTO a venda vale: nenhuma das duas pontas e'
  receita (`compoe_dre = false` nas duas contas). Dono das linhas: `linhasPrevisaoBoitel` (`previsaoBoitel.ts`); dono do mapa
  componente -> subcentro no banco: `_oc_vinculo_mapa` — o front se alinha a ele.
  ⚠ NASCE DE DEFEITO MEDIDO: a linha `adiantamento_devolvido` nascia em `subEntrada` (1150, receita) e inflaria o DRE pelo valor
    do adiantamento; as tres devolucoes que existiam (b58bf556, 7f7de76f, 581d075c) foram reclassificadas a' mao depois de
    nascer — os LANCAMENTOS estao em 3020, mas os COMPROMISSOS da b58bf556 e da 7f7de76f ainda dizem "Venda em Boitel" /
    "Venda de Machos Adultos" (nao corrigido).
  ⚠ A SAIDA JA' PAGA NO LEGADO E' ADOTADA, NUNCA RECRIADA (`oc_vincular_lancamento`, que muda so' competencia e safra do
    lancamento — aceito pelo Gabriel); o "Gerar compromissos" nao a propoe. A conferencia OC = financeiro e' o "Financeiro X
    faltam/sobram Y" do painel: AVISA, nao trava.
  ⚠ FILA: 01b ("Gerar compromissos" propoe principal + devolucao na A com adiantamento) · adocao pelo lado da OC · dado: Vera
    2ca81c1b (falta devolucao 133.455,00 em 03/10/25) e 8dcafa8e (51.951,00 em 09/12/25), 7f7de76f (devolucao 42.416,00 ->
    46.458,50), RRCC f2a065e8 (tres recebimentos nas datas do banco), NJ 3260d1c8 (principal a 2.505.586,19, slot fica);
    b58bf556 parada; RRCC 412330f3 aguardando o Gabriel (391.212,02 sem explicacao).
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
- ⚠ ABA DOCUMENTOS DO LANCAMENTO = TABELA COMPACTA, CANCELADO FORA DA VISTA, UMA LINHA POR REGISTRO (FIN-DOCUMENTOS-LAYOUT-01, Gabriel 04/10,
  so' apresentacao, `AbaDocumentosLancamento.tsx`; unico consumidor `LancamentoV2Dialog`). Padrao de tabela A31: cabecalho navy
  9,5px de 18px, linha de 10px com 22px FIXOS, colunas Documento · Emitente · Emissao · Valor · Situacao · acoes. O confronto e'
  uma faixa de linha unica (rotulo 10px, valor 12px; 27px medidos). CANCELADO NAO APARECE por padrao: rodape de 20px "N documento(s)
  cancelado(s) oculto(s) · mostrar" / "… · ocultar", ESTADO LOCAL (`mostrarCancelados`, nao persiste); mostrado, vem depois dos
  ativos, riscado, com "motivo: …" na coluna Emitente e sem acoes. Ativo sem arquivo: "sem arquivo" ambar ANTES do emitente.
  ⚠ A COLUNA DOCUMENTO NUNCA CORTA; O EMITENTE CORTA (UI-LINHA-UNICA-01, que reverteu a quebra em duas linhas): Documento e'
    `max-content` e nao quebra — identidade e selos ("N parcelas", "da operacao") sempre inteiros; o Emitente (e o "motivo: …" do
    cancelado) fica com o resto (`minmax(0,1fr)`) e CORTA com "…", com o texto inteiro no `title`; data e valor nunca cortam.
    A grade e' UMA, na tabela (`GRADE_DOCUMENTOS`), e cabecalho e linhas sao SUBGRADES (`LINHA_DOCUMENTOS`,
    `grid-template-columns: subgrid`) — sem isso a coluna `max-content` desalinharia entre linhas. O respiro de 10px das bordas
    mora na primeira e na ultima celula (padding na subgrade encolhe as trilhas das pontas; a ultima trilha e' 72 = 62 + 10).
    Medido a 1.135 (dialogo no teto de 1.024, logo igual a 1.280): tabela 750; Agnaldo "Compra 110 bezerros - 1/2" Documento 206 /
    Emitente 192, "NF 000.000.084 · série 1" + "da operação" inteiros; x de cada coluna identico no cabecalho e nas linhas; 0
    estouros, 0 rolagem horizontal. O maior emitente do proto tem 42 caracteres (201px).
  ⚠ PENDENCIAS: DOC-REATIVAR-01 (reativar documento cancelado — hoje nao ha' caminho) · a REGRA DO CONFRONTO quando a NF inteira
    e o boleto da parcela estao no mesmo lancamento e SOMAM (Vera "Ferramentas - 2/2": documentado 2.557,95 x lancamento 852,65,
    "R$ 1.705,30 a mais") · o caso "NF em N parcelas" (`ligado_a_qtd > 1`) nao existe no proto, o selo so' esta' provado por teste
    · o `data-testid="doc-emitente"` e' do SELECT do `FormDocumento`; a celula da tabela e' `cel-emitente`.
- ⚠ OS CAMPOS DO DOCUMENTO SAO POR TIPO, E O DONO E' UM SO' (FIN-DOCUMENTO-FORM-01, Gabriel 04/10, so' tela): `CAMPOS_POR_ESPECIE`
  (`AbaDocumentosLancamento.tsx`, lida pelo `FormDocumento` e pelo payload — nenhum `if (especie === …)` espalhado). O tipo e' o
  PRIMEIRO campo, em controle segmentado de uma linha (Nota fiscal | Boleto | Recibo | Comprovante | Outro; sem Boleto com
  `semBoleto`; medido a 1.133: 478px, cinco segmentos de 95px a 10px). Rotulos -> colunas (as de sempre; nada no banco):
  NF = Numero, Serie, Data de emissao, Valor da nota, Emitente, Chave de acesso · Boleto = Data do documento, Valor do boleto, Nº do
  documento, Beneficiario · Recibo = Data do recibo, Valor recebido, Nº do recibo, Quem recebeu (emitente) · Comprovante = Data do
  pagamento, Valor pago, Autenticacao / ID da transacao (SEM emitente) · Outro = Data, Valor, Identificacao, Emitente. Fora da NF o
  numero vem depois de data e valor, em largura inteira. Obrigatorio continua sendo so' o tipo.
  · TROCAR O TIPO troca os campos e PRESERVA o digitado; o payload manda NULO o que o tipo nao tem (serie e chave fora da NF;
    emitente no Comprovante), inclusive ao editar um documento existente.
  · ⚠ DOCUMENTO DA OPERACAO (especie so' leitura, pode ser traducao do vocabulario da OC): o que a tela NAO mostra e' PRESERVADO
    (serie, chave, emitente vao com o valor que o documento ja' tem), nunca zerado; segmentos desligados, valor "vem dos componentes".
  · EMITENTE = `SearchableSelect` da casa (digita e procura), com `semTodos` (prop opcional nova: tira o item "Todos" da lista —
    num campo de formulario o vazio e' "Selecione", nao uma escolha) e "Outro (informar nome e CNPJ/CPF)" como acao do rodape.
    SO' FORNECEDOR ATIVO (`ativo !== false`, a regra do `FavorecidoSelect`), MAIS o ja' gravado no documento em edicao, mesmo
    inativo. Quem monta o formulario passa `ativo` junto de id e nome (`FornecedorDoDocumento`).
  · SUGESTAO DO LANCAMENTO (faixa ambar) vale no lancamento NOVO e no JA' SALVO — a aba recebe a MESMA `sugestaoDoDocumento` do
    `LancamentoV2Dialog`, um dono so' —, so' para documento NOVO e so' nos campos que o tipo mostra. No Comprovante a data
    sugerida e' a de PAGAMENTO do lancamento; sem pagamento fica VAZIA (competencia nao e' data de comprovante).
  · ARQUIVO: area de largura inteira, tracejada, nos tokens de `success`; o `<input type="file">` e' o de sempre (mesmos `accept`),
    escondido; mostra o nome + "remover", ou "arquivo anexado · substituir"; soltar um arquivo entra pelo mesmo input.
  ⚠ PENDENCIAS: FIN-DOCUMENTO-FORM-02 (banco: linha digitavel e vencimento do boleto, "referente a" do recibo, autenticacao do
    comprovante como campo proprio, obrigatoriedade por tipo) · DOC-REATIVAR-01 · no Comprovante o "numero" sugerido e' o Nº
    Documento do lancamento (o da NF) e cai em "Autenticacao / ID da transacao" — decidir se a sugestao de numero deve valer nesse
    tipo · arrastar e soltar sem prova na tela.
- ⚠ O XML DA NF-e TEM UM LEITOR SO', PURO (FIN-NFE-XML-01a, 05/10/2026; sem tela, sem banco): `lerNFe(bytes: ArrayBuffer)`
  (`src/lib/financeiro/nfe/`: `lerNFe.ts`, `centavos.ts`, `tipos.ts`). Toda tela que precisar do XML de uma nota chama ESTA
  funcao; nenhuma le' XML por conta propria. Devolve `{ ok: true, nota, avisos }` ou `{ ok: false, motivo, frase }`.
  · BYTES, NUNCA `File.text()`: o charset e' o do `<?xml encoding?>`, por `decodificarPeloCharsetDeclarado` — ALIAS de
    `decodificarExtrato` (uma regra so'). Parse por `DOMParser`, lendo por `localName` (o namespace vem com ou sem prefixo) e
    checando `parsererror` (o `DOMParser` nao lanca). Tag desconhecida e' ignorada (os grupos IBS/CBS de 2026 nao entram).
  · DINHEIRO EM CENTAVOS INTEIROS, calculados SOBRE O TEXTO (`centavosDoTexto`), sem float; datas COMO ESCRITAS (a parte de data
    de `dhEmi`, sem converter fuso). Teto de 2 MB checado antes de decodificar. Assinatura nao e' validada; sem rede; sem log.
  · SO' MODELO 55. Recusas com frase unica (`FRASES_DE_RECUSA` / `fraseDaRecusa`): nao e' XML, grande demais, CT-e, evento, lote
    (raiz `enviNFe` OU mais de um `infNFe`), NFC-e, NFS-e/desconhecido, cancelada ou denegada (`cStat` 101, 135, 110, 301, 302),
    incompleta (diz o campo). AVISOS, que nao recusam: `sem_protocolo`, `sem_duplicatas`, `duplicatas_diferem_da_nota`
    (tolerancia ZERO, em centavos), `complementar`, `devolucao`.
  · O LEITOR NAO SABE QUEM E' O CLIENTE: `tipoNota` e' do ponto de vista do emitente. Recusar "nota em que o cliente e' o
    emitente" (decisao do Gabriel: nota de venda entra pela Operacao Comercial) e o mapa `tPag` -> forma de pagamento sao da
    tela que chama (PRs b e d).
  · "ESTA NOTA JA' ESTA' REGISTRADA?" TEM UM DONO NO BANCO (FIN-NFE-XML-01b1, 05/10/2026, so' banco; migration 20261027193000,
    ⚠ registrada como 20261005111752; ledger = arquivo, md5 38380897…): `fn_documento_chave_ja_registrada(p_cliente, p_chave,
    p_ignorar_documento default null)` -> (origem 'lancamento'|'oc', documento_id, lancamento_id, operacao_id, operacao_tipo,
    numero, serie, descricao, data, valor). So' leitura; SECURITY DEFINER com `tenant_ok(p_cliente)` e 42501 (a regra de leitura
    do 01B); EXECUTE so' para `authenticated` e `service_role`. Compara SO' DIGITOS nas DUAS tabelas de documento (34 dos 78
    documentos com chave estao gravados com espaco, pontuacao ou prefixo); chave que nao da' 44 digitos devolve VAZIO, sem erro.
    NAO CONTA: documento cancelado, documento de lancamento cancelado, documento de OC cancelada e o proprio
    `p_ignorar_documento`. ⚠ Documento ligado a varias parcelas (`financeiro_documento_vinculos`) conta enquanto o dono OU
    alguma parcela ligada estiver viva. Decisao do Gabriel: nota repetida AVISA e mostra onde esta'; NAO bloqueia — das 7 chaves
    repetidas hoje, 4 sao a mesma nota no lancamento e na OC, 1 e' uma nota em duas OCs, 2 tem a ponta do lancamento cancelada.
    Nenhuma tela faz essa consulta por conta propria. Medido: 0,5–0,9 ms por chamada no NJ.
  · OS BUCKETS `fin-documentos` E `oc-documentos` ACEITAM XML (`text/xml`, `application/xml`), alem de PDF, JPEG e PNG; o limite
    de 10 MB nao mudou. O XML da nota fica anexado ao documento NF (decisao do Gabriel).
  · "NOVO A PARTIR DE XML" (FIN-NFE-XML-01d, Gabriel 05/10/2026, so' tela): em Lançamentos Financeiros, o botao "Do XML" (ao lado
    de "Ampliar"; `title` "Novo a partir de XML") abre a LISTA DE NOTAS (`NovoDeXmlDialog`): solta-se um ou varios XML, cada um
    vira uma linha (Nota · Emissao · Emitente · CNPJ | Fazenda pela IE · Valor · Duplicatas | Situacao | Acao), e "Abrir
    lançamento" entrega a nota ao MESMO `LancamentoV2Dialog`, pelo `prefill` (chave `doXml`). NADA E' GRAVADO na lista; quem
    grava e' o Salvar do lancamento, pelo caminho de sempre (a' vista por `onSave`, parcelado por `fn_parcelamento_cadastrar`).
    DONOS, todos em `src/lib/financeiro/nfe/` (puros): `proporLancamento` (o que o lancamento propoe, as origens e os avisos),
    `resolverEmitente` (documento por digitos -> nome pelo resolvedor do banco; dois ativos = o operador escolhe; so' inativo =
    propoe e avisa; nenhum = oferece criar), `duplicatasCabemNoParcelamentoDeHoje` (espelho de `fn_parcelamento_cadastrar`: 2 a
    24, round(total/N, 2) com a sobra na ultima, vencimentos primeiro + (i-1) meses), `FORMA_POR_TPAG` (mapa fechado: 01
    Dinheiro, 03/04 Cartao, 15 Boleto, 17 PIX, 18 Transferencia; o resto vazio) e `formatos.ts`. As consultas ao banco moram em
    `src/lib/financeiro/nfeConsultas.ts` e o pacote do modal em `nfePrefill.ts`.
    REGRAS: competencia = emissao; valor = SOMA DAS DUPLICATAS quando ha' (a diferenca para a nota fica escrita); sem duplicata
    = lancamento unico com vencimento VAZIO; uma duplicata = unico com o vencimento dela; duplicatas fora do padrao mensal NAO
    parcelam sozinhas (a' vista, com a tabela de conferencia e a frase); o lado do cliente so' se decide pela INSCRICAO ESTADUAL
    da fazenda (`fazenda_cadastros.ie`, so' digitos) — IE do emitente = fazenda do cliente recusa com "Nota de venda entra pela
    Operação Comercial.", IE do destinatario propoe a fazenda, nenhuma casa = fazenda VAZIA com aviso (nunca a do filtro da
    lista); classificacao = a do ultimo lancamento vivo classificado do fornecedor; o lancamento nasce PROGRAMADO, sem data de
    pagamento, e a CONTA de pagamento fica vazia (o operador escolhe; sem ela o Salvar nao acende). Nota ja' registrada AVISA,
    diz onde e deixa seguir.
    AMBAR = VEIO DO XML OU E' SUGESTAO, e e' DERIVADO: o campo fica em ambar (`CAMPO_AMBAR`, o estilo da faixa da aba
    Documentos) com a origem escrita ao lado enquanto o valor dele e' o que a nota propos; editar tira, voltar ao valor devolve
    — nenhum estado para esquecer de limpar. O XML e' o arquivo do documento NF pendente (`pendenteDaNota`), com nome `.xml` e
    tipo `application/xml` EXPLICITOS (`arquivoXmlDaNota`), e no parcelado e' ligado as N parcelas pelo caminho do PR 2b.
    "Gravar o CNPJ neste cadastro ao salvar" so' roda DEPOIS de o lancamento nascer (`aposCriarDoXml`), no formato com mascara,
    e so' em cadastro sem documento (o filtro vai no proprio UPDATE).
    ⚠ SEM XML O MODAL E' O DE SEMPRE: o HTML das abas Geral, Pagamento e Documentos, novo e com prefill, e' identico ao do commit
      anterior (6 comparacoes em worktree).
    ⚠ MEDIDO A 1.135: a lista de notas tem 1.044px e nenhum numero, data, CNPJ ou valor corta (o Emitente corta com `title`); um
      terceiro botao na PRIMEIRA linha do bloco de acoes encostava no filtro de Fazenda — por isso "Do XML" esta' na segunda. Em
      ambar o rotulo "Data Competência *" encurta para "Competência *" (com a origem ao lado ele quebrava a linha).
  ⚠ QUEM CONSOME ESTREITA COM `r.ok === false` / `=== true`: com `strict: false` o `if (!r.ok)` NAO estreita a uniao (TS2339).
  ⚠ FIXTURES SINTETICAS (`__fixtures__/notas.ts`, montadas de um molde): nenhum dado real de cliente entra no repo.
  ⚠ O jsdom NAO E' O NAVEGADOR: o `parsererror` so' foi exercitado na forma do jsdom (o Chrome o poe DENTRO do documento, o
    Firefox como raiz — o leitor checa as duas, mas so' uma tem teste), e nenhum XML real de SEFAZ foi lido.
  ⚠ DIVIDAS DO 01d: NFE-CLIENTE-SEM-DOCUMENTO-01 (o cliente nao tem CPF/CNPJ no banco: o lado da nota so' se decide pela IE, e
    so' 2 fazendas tem IE cadastrada — nas outras a fazenda nasce vazia) · NFE-XML-01d-NAO-PROVADO (no navegador so' o caminho
    "fornecedor nao encontrado / fazenda nao identificada", no cliente Teste e com XML SINTETICO, sem gravar: nenhum XML real,
    nenhum Salvar, nenhum upload ao bucket e nenhum "ver" do XML foram exercitados na tela) · a origem do SUBCENTRO vai numa
    faixa no topo, nao ao lado do campo (o seletor de classificacao nao aceita rotulo) · o documento NF pendente guarda o
    emitente proposto na ABERTURA: trocar o fornecedor no lancamento nao troca o emitente do documento · [o `.xml` anexado a' mao com tipo vazio PASSOU A VALER no
    UI-ARRASTAR-ARQUIVO-01a: o dono do aceite o reconhece pela extensao e devolve o arquivo com o tipo preenchido] · [as mensagens passaram a citar XML onde XML entra — UI-ARRASTAR-ARQUIVO-01a] · a tabela de documentos pendentes (`DocumentosPendentes`) quebra
    Numero e Emitente em duas linhas (pre-existente, UI-LINHA-UNICA) · `FinanceiroV2ControlesLista` (so' com a flag da lista
    paginada, desligada) ganhou o botao como prop opcional, sem teste proprio · "abrir" de nota ja' registrada abre em OUTRA
    aba do navegador · proximos: tela C ("Importar XML" no formulario do documento) e parcelas livres (PR c).
  ⚠ DIVIDAS DO 01d, NOMEADAS (Gabriel, 05/10): NFE-PARCELA-SEM-NUMERO-01 (no lancamento parcelado o numero da nota nao vai para
    as parcelas — `fn_parcelamento_cadastrar` nao leva `numero_documento`; fica so' no documento) ·
    DOC-PENDENTES-LINHA-UNICA-01 (a tabela de documentos pendentes quebra Numero e Emitente em duas linhas, fere
    UI-LINHA-UNICA; sera' consertada no PR do modal de documento) · NFE-HOMOLOGACAO-REAL-01 (Salvar, upload do .xml, "ver" do
    XML, fornecedor achado pelo nome, fazenda pela IE e nota ja' registrada so' foram provados por TESTE; a homologacao com nota
    real e' do Gabriel, na Vera) · FAZENDA-IE-CADASTRO-01 (so' as 2 fazendas da Vera — Faz. 3 Muchachas e Faz Baia Grande — tem
    IE; sem IE o lado da nota e a fazenda nao se decidem sozinhos nos outros clientes: e' cadastro, nao codigo).
  ⚠ DIVIDAS DO 01b1: NFE-CHAVE-NORMALIZADA-01 (gravar a chave ja' so' com digitos, e indice, em vez de normalizar na leitura —
    hoje sao dezenas de linhas por cliente) · DOC-LANCAMENTO-CANCELADO-01 (cancelar o lancamento nao cancela o documento dele:
    2 casos hoje, lancamentos 0826a4ee do NJ e a97bed09 do Agnaldo) · OC-NOTA-DUAS-OCS-01 (uma nota em duas OCs nao tem vinculo
    proprio; e a nota do Agnaldo — Caio Felipe, 28/08 — soma 62.100 de acordado contra 63.050 de nota: diferenca de 950 nao
    investigada) · o ensaio do 01b1 (regras, tenant, as 7 chaves) rodou em transacao revertida e NAO virou arquivo em
    `supabase/tests/` · os tipos do supabase NAO foram regenerados (a tela chama por `(supabase as any).rpc`).
  ⚠ DIVIDAS: NFE-CHAVE-DV-01 (o digito verificador da chave nao e' conferido, so' os 44 digitos) · NFE-LEIAUTE-310-01 (`dEmi`
    do leiaute 3.10 nao e' lido: nota antiga cai em "Nota sem data de emissão.") · `cStat` 135 e' status de EVENTO, nao de
    protocolo de nota (esta' na lista por decisao do briefing; inofensivo) · duplicata sem `dVenc` sai com vencimento vazio, sem
    aviso proprio.
- ⚠ O RESUMO DO LANCAMENTO DIZ O STATUS E O VENCIMENTO NO BLOCO PAGAMENTO (FIN-RESUMO-PAGAMENTO-01, 04/10): Status · Vencimento ·
  Pagamento · Forma · Modalidade · Nº de Parcelas; o status saiu de "Financeiro" (uma informacao, um lugar) e a cor vem de
  `STATUS_PALETA` / `STATUS_PILULA_BASE` pela prop `cor` do `LinhaResumo` — nenhuma cor escrita no modal.
- ⚠ DADOS PARA PAGAMENTO: O CADASTRO DO FORNECEDOR MANDA ENQUANTO NAO PAGO (FIN-PIX-CADASTRO-MODAL-01, Gabriel 04/10, so' tela).
  O modal do lancamento (`LancamentoV2Dialog`, aba Pagamento) LE o Pix / os dados bancarios do cadastro a cada abertura, sem
  copia; `financeiro_lancamentos_v2.dados_pagamento` (jsonb com STRING) e' o campo da EXCECAO — so' guarda texto quando o operador
  escolhe "usar outros dados so' neste lancamento". Seguindo o cadastro, o Salvar grava NULO (as copias antigas iguais ao cadastro
  vao sendo limpas conforme os lancamentos sao editados; nenhum backfill).
  · DONO DA MONTAGEM: `src/lib/financeiro/dadosPagamentoDoCadastro.ts` — `textoDoCadastro` (o formato gravado, BYTE A BYTE o do
    antigo `buildDadosPagamento`: "PIX | Tipo: …\nChave: …\nFavorecido: …"; e' ele que decide igual x diferente),
    `linhasDoCadastro` (o que o bloco desenha e o que cada botao copia), `formaEfetiva`, `modoDosDados`, `valorParaCopiar`
    ("3192,00", sem R$ nem milhar). O componente e' `DadosParaPagamento`, no arquivo do modal.
  · FORMA EFETIVA = a do lancamento; vazia, a preferida do cadastro (`tipo_recebimento`) SO' PARA MOSTRAR — o select fica em
    "Nenhuma" e a forma NAO e' gravada. "Transferência Bancária" (cadastro) = "Transferência" (lancamento). Com forma PIX a chave
    aparece sempre que existir, qualquer que seja o tipo do cadastro.
  · MODO: nao realizado com texto vazio OU igual ao que o cadastro monta hoje = CADASTRO (bloco "PIX · do cadastro do fornecedor":
    Tipo da chave, Chave com "Copiar chave", Favorecido, Valor; rodape com a observacao do cadastro, "editar cadastro" e "usar
    outros dados so' neste lancamento"); texto diferente = PROPRIO ("Dados proprios deste lancamento", campo com TODAS as linhas
    visiveis, "voltar a usar o cadastro"). REALIZADO com texto = o gravado ("Dados gravados neste lancamento"); sem texto, o
    cadastro com o cabecalho "cadastro atual". O modo e' calculado ate' o operador agir e CONGELA na troca de forma ou de
    fornecedor: TROCAR FORMA OU FORNECEDOR NUNCA ESCREVE NEM APAGA TEXTO (antes sobrescrevia o digitado e zerava em silencio).
  · SEM DADO NO CADASTRO para a forma (PIX sem chave, Transferencia sem banco): aviso ambar "<Fornecedor> nao tem Pix cadastrado."
    + "+ Cadastrar Pix do fornecedor", que abre o `FornecedorFormDialog`; ao salvar, o modal RELE aquele fornecedor por id e usa
    a leitura por cima da prop enquanto esta' aberto (releitura do dono apos a escrita; vale nas 13 telas que montam o modal, sem
    prop nova). Forma sem dado de cadastro (Boleto, Cartao…) ou sem fornecedor: so' o link "informar dados so' neste lancamento".
  · ⚠ O BLOCO E O AVISO SAO SO' PARA SAIDAS (`2-Saídas`). Em Entrada e Transferencia: havendo texto, o campo proprio; nao havendo,
    so' o link — o Pix do fornecedor serve para PAGAR (a tela chegou a dizer "Boitel Sta. Clara nao tem Pix cadastrado." num
    recebimento).
  ⚠ O `ContratoDialog` TEM OUTRA MONTAGEM e NAO usa a lib (sem Favorecido, banco em qualquer forma que nao seja PIX com chave,
    grava "Transferência Bancária" como forma): lancamento gerado por contrato cai em "dados proprios", de proposito.
  ⚠ PENDENCIAS: FIN-PIX-CADASTRO-MODAL-02 (gravar a copia AO REALIZAR — banco, porque realizar acontece por conciliacao, bloco e
    OC; hoje o realizado sem texto mostra o "cadastro atual") · FIN-CONTRATO-DADOS-PGTO-01 (qual texto o contrato gera e a forma
    sem normalizar) · "copiar Pix" em Contas a Pagar e Receber · Pix copia-e-cola como campo proprio · importar as chaves dos
    outros clientes (so' a Vera tem cadastro de pagamento: 22 fornecedores com chave) · os geradores (recorrencia, parcelamento,
    OC, importacoes) continuam sem copiar nada, e nao precisam · o campo nao tem trava de somente leitura (nem em titulo de OC).
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
