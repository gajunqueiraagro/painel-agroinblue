# CLAUDE.md — AGROinBLUE proto

⚠ RELATORIO DE ITEM NUNCA VAI NO CLAUDE.md (CLAUDE-MD-ENXUTO-01, Gabriel 21/10/2026: o CLAUDE.md passou de 1,3 MB e estourou o
contexto de um Code). O relatorio de cada item vai em `docs/historico/AAAA-MM.md` (o mes do item) e em ~/Downloads. Aqui ficam SO'
regras, gates, landmines e o indice; uma regra nova entra como UMA linha na secao certa (LANDMINES), citando o nome da frente, e o texto
longo dela vai para o historico do mes. Meta: CLAUDE.md < 40 KB.

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

## GUARDAS DO CLAUDE CODE (hooks de `.claude/settings.json`)
Duas guardas rodam antes de todo comando de shell do Code: `guard-push.sh` (envio so' na `proto`, nunca citando as branches
proibidas) e `guard-commit-tsc.sh` (commit so' com o TSC dentro da baseline lida deste arquivo).
- ⚠ A CHAMADA COMECA COM `cd "$CLAUDE_PROJECT_DIR" &&` (FORN-SELETOR-PADRAO-01 fatia 2c, commit 0, Gabriel 09/10/2026). De 04/07/2026
  (f990761c) ate' 09/10 o caminho era RELATIVO (`bash .claude/hooks/…`): com o shell do Code parado numa subpasta o arquivo nao era
  achado ("No such file or directory"), a falha NAO BLOQUEIA e a guarda simplesmente nao rodava. Reproduzido em 09/10 de dentro de
  `src/lib`: um comando cujo texto citava o envio para a branch principal passou; com a chamada nova, o mesmo texto, da mesma
  subpasta, foi barrado.
- ⚠ O `cd` NAO E' SO' PARA ACHAR O ARQUIVO: a guarda do TSC roda `npx tsc -p tsconfig.app.json`, que de uma subpasta nao acha o
  tsconfig, conta 1 "erro" e APROVA qualquer commit. Trocar por caminho absoluto do script sem o `cd` deixaria esse furo.
- ⚠ A GUARDA LE^ O TEXTO DO COMANDO: comando que so' CITA o envio proibido (num `echo`, num texto a gravar) tambem e' barrado.
  Texto de documentacao nao escreve a frase literal.
- Hook que falha por nao achar o arquivo NAO bloqueia: guarda nova se prova rodando de uma subpasta.

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

## GATES (comandos oficiais; a historia das baselines em docs/historico/gates-baselines.md e nos meses)
- TSC: `npx tsc --noEmit -p tsconfig.app.json` — TSC baseline: 139 erros (so' pode cair; numero novo = PR quebrou). ⚠ A guarda de commit
  (`.claude/hooks/guard-commit-tsc.sh`) le^ exatamente "TSC baseline: N" deste arquivo: a frase nao pode sumir.
- Build: `npm run build:proto` verde antes de todo commit.
- `npm run check:tdz` (funcao chamada antes de declarada no render) · `npm run check:hooks` (hook condicional; baseline 0) ·
  `npm run check:ui-nativo` (controle nativo e seletor sem busca: zero novo; regua dos modais so' pode cair).
- Ciclos: `npx madge --circular --extensions ts,tsx --ts-config tsconfig.app.json src/` — baseline 23.
- Suite: `npx vitest run` — so' as 3 falhas conhecidas (transferencia.test.ts "preserva campos textuais"; validacaoZootecnica Casos A e E).
- Tela: `npm run check:ui-cortes` (regra de corte, data dd/mm/aaaa, cabecalho preso, altura, campo de valor, sobreposicao; baseline ZERO
  excecoes; o detector se prova num fixture) e `npm run check:ui-desloca` (nada se desloca ao trocar estado). Bancada em
  `scripts/ui-cortes/` com dado SINTETICO; tela nova entra em `CENARIOS`.
- QUANDO RODAR (Gabriel 20/10): durante o trabalho, gate de tela (`--so <prefixo>`) e vitest so' do que foi tocado; COMPLETO e a suite
  inteira uma vez, antes do push. Gate de tela completo SO' quando nenhum outro Code esta' rodando o dele (o Gabriel coordena); em
  primeiro plano, por grupos de prefixo, cada chamada < 9 min. NUNCA "until/while ... sleep" em segundo plano para esperar gate.
- Zero-cast: proibido `as` / `as any` em codigo novo (unica excecao: `(supabase as any)`).
- PROVA DE IDENTIDADE REPORTA O TAMANHO DO CONJUNTO COMPARADO; conjunto vazio e' prova INVALIDA. Antes de afirmar "nenhum", a busca
  prova que sabe achar (auto-teste). Mudanca de filtro se prova com varredura antes x depois num conjunto real.
- Teste SQL roda como `postgres`, termina em RAISE 'OK…' (nada fica no banco), fixture sintetico no cliente Teste (43f32d07).
- MUTACAO: todo teste novo se prova derrubado por uma mutacao do codigo que ele guarda (e o codigo volta conferido por md5).

## LANDMINES (uma linha cada; o texto integral de cada regra: `grep -n "NOME-DA-FRENTE" docs/historico/*.md`)
### Banco, migration e metodo
- Proto `binbcdfbisgscrifztia`; producao `duttifnbxqtyyybjmouv` NUNCA. Conferir `supabase/.temp/project-ref` antes de todo comando de
  banco. O `.env` do checkout principal aponta para PRODUCAO: em copia/worktree nova nunca copiar o `.env`.
- Canal de escrita `supabase-proto-write` (Gabriel 20/10): so' no proto, com conferencia do ref e ENSAIO antes; sem restricao de horario
  para migration, DDL ou backfill (regra corrigida 17/10, reafirmada 20/10). Dado de cliente: nada de UPDATE/DELETE/backfill sem OK.
- LEDGER = ARQUIVO, VERSAO INCLUSIVE: o `apply_migration` grava a versao com o timestamp do dia; NO MESMO PASSO, UPDATE de
  `supabase_migrations.schema_migrations.version` para o numero do arquivo (guardado por nome + md5 dos statements + "a versao nova nao
  existe") e conferencia md5(arquivo sem o `\n` final) = md5(statements), antes do commit.
- Migrations do proto tem historico divergente: `supabase db push` aborta; nunca push sem repair.
- Ensaio e medicao no proto: o banco e' o dos clientes. DDL / `CREATE TRIGGER` em tabela de uso corrente e' curto e leva
  `lock_timeout` de 2 s; nunca ligar/desligar gatilho com `ALTER TABLE` na tabela real; nunca renomear/alterar em massa
  `financeiro_plano_contas`. Prova no canal MCP leva `SET LOCAL statement_timeout` abaixo do tempo do canal.
- O canal MCP NAO passa pela RLS: numero do banco x navegador que discorda em ordem de grandeza → suspeitar disso.
- FUNCAO NOVA NASCE FECHADA (SEG-TENANT-VARREDURA-01C): REVOKE de PUBLIC/anon; SECURITY DEFINER exposta a `authenticated` que recebe
  id de linha resolve o cliente e chama `tenant_ok` (42501, nunca vazio). Interna sem usuario nao leva a guarda no corpo.
- RLS por tenant no ar (ACESSOS-01): consulta sem `.eq('cliente_id', …)` passa a ver so' o do cliente; 4 policies `true` sao
  referencia global.
- GATILHO que chama funcao interna e' SECURITY DEFINER; INDICE DE EXPRESSAO avalia a funcao com os privilegios de QUEM GRAVA — a funcao
  do indice precisa de EXECUTE para `authenticated` (FORN-FILIAL-01-FIX: a trava de 21/10 quebrou toda gravacao de fornecedor). Teste
  de gatilho/indice novo roda como `authenticated` (`set local role authenticated` + claims de um usuario real), nunca so' como postgres.
- RPC chamada pela tela roda sob pg_safeupdate (todo UPDATE/DELETE com WHERE, inclusive em tabela temporaria). Funcao chamada a cada
  carga com parametro de conta leva `SET plan_cache_mode = force_custom_plan`. REPLACE de VIEW leva `security_invoker = true`.
- Migration de corpo grande: patch guardado por md5. Ancora que casa 1x pode ser a errada. Deslocar chave de indice unico em lote exige
  ordem segura.
- REGRA DO NASCIMENTO (OC-CC-PADRAO-NOVAS-01a): frente que converte dado existente para um padrao novo mede o que nasce errado HOJE e
  conserta o gerador antes.
- NADA SE APAGA DE VERDADE na conciliacao, extrato, documentos, fornecedores e plano (AUDIT-DELETE-01a). A trilha de auditoria e'
  imutavel e o autor e' quem esta' logado (AUDIT-SEG-01).
- Trilha de eventos mostra o que, nao por que: conserto se brifa depois de reproduzir na tela e ler o chamador.
- Estado de dado so' depois que a gravacao passa (`aplicarComRollback`). Valor sugerido e' valor aceito. "Hoje" e' `hojeLocal()`.

### Dado e regra de negocio
- META x REALIZADO: separacao rigida; Meta nao gera lancamento realizado; tela de aprovacao de Meta sem fallback ("Sem base validada").
- A classificacao do lancamento E' a chave `plano_conta_id` (macro/grupo/centro sao derivados); a direcao e' a do tipo da conta do
  plano. "Sem classificacao" = `plano_conta_id` nulo. O plano se le^ por cliente, por um carregador; arquivo novo nao consulta
  `financeiro_plano_contas` direto (trava). Unicidade do plano e' por cliente.
- TODO LANCAMENTO NASCE COM VENCIMENTO (CRIAR-DO-EXTRATO-01; ha' trava). Competencia de parcela acompanha o vencimento; amortizacao de
  financiamento e' evento de caixa (competencia = vencimento).
- Status: so' realizado (e conciliado) tem data de pagamento. Lancamento casado com extrato nao sai do estado que o banco pos.
- Pasto no mes = vigencia + ativo (`fn_pasto_vigente_no_mes`). Saldo inicial se cadastra uma vez. O cache do rebanho se reconstroi na
  gravacao. Fechamento P1: a autoridade e' `get_status_pilares_fechamento`.
- Rateio administrativo e' por mes (`fn_rateio_admin_mes`); modal de linha do DRE soma as mesmas chaves da grade (`somaComposta`);
  `lucro_liquido` da RPC NAO e' a linha "Lucro liquido" da grade.
- "Pec.3M-" no nome do fornecedor = pagamento por rateio (nota em nome do Higino): nunca juntar os dois lados.
- Pecuaria: lancamentos iguais sao normais; vincular nao julga repeticao. "Global nao e' fazenda". O cenario vem do caminho.
- Financeiro V2 mostra so' dinheiro por padrao (sem caixa em secao propria). Boitel: ao financeiro e ao DRE vai so' o liquido do acerto.
- Vinculo com OC = parte viva (`zoo_operacao_partes.cancelada = false`), nunca `origem_lancamento`. OC fechada: so' o cadastral se edita.
  A previa e' a propria RPC com `p_simular`. Um gesto de desfazer = um motivo + um `estorno_id`. As recusas da OC vem prontas do banco.
- Conciliacao: tolerancia de MEIO centavo (R$ 0,01 e' diferenca); a data do banco manda na conferencia; o resumo da conta tem dono no
  banco; todo vinculo com extrato da' baixa e o parcial vira divisao explicita; F5 nunca e' necessario; transferencia de OFX = 1
  lancamento + 2 vinculos; arquivo de extrato se le^ pelo charset declarado.
- Financiamento: o saldo devedor tem uma fonte (`fn_financiamento_saldo`); captacao segue o creditado em conta; o valor do lancamento
  vinculado a' parcela manda na parcela; consorcio e' natureza propria (gerador no banco); parcela adiada e' divida mas nao vencida.
- Recorrencia gera a vigencia inteira e nunca omite em silencio; o valor do mes tem marca e o propagar pula as marcadas.
- Fornecedor: um leitor so' (`useFornecedoresDoCliente`), um seletor so' (`FavorecidoSelect`), uma busca so' (tela + `fn_fornecedor_buscar`,
  presas pelo `buscaDeFornecedor.casos.json`), uma regra de criacao (`decidirCadastro`); mesclar e' RPC com desfazer e o absorvido e'
  inativo sempre; nome gravado em caixa padronizada por funcao do banco; FILIAIS tem a mesma razao social (CNPJ e cidade distinguem) e
  o CNPJ de outro ATIVO nao grava (trava adiada no banco); "Sem cadastro" so' com o real (SEM-CADASTRO-02: fornecedor escrito = coluna
  de fornecedor da planilha ou descricao de EXTRATO `extrato`/`ofx`; nunca descricao de TXT/Excel/manual); "Ultimo uso"/"Lanc." so' realizado ate' hoje.
- Documentos da OC (OC-DOC-VENDA-01): abate E venda usam o MESMO componente (`AbaDocumentosOC`/`DocumentoFormAbate`, pelo tipo); na
  venda a NF do produtor SOMA e contrato/NF entrada/comprovante nao; a mesma chave viva no cliente e' barrada no banco (23505, com link).

### Tela (detalhes em docs/PADROES-UI.md)
- REGRA DE CORTE (21/10 07h25): nome/texto em tabela = uma linha com "…" e o texto inteiro no `title`; numero, valor, data, CPF/CNPJ e
  contador nunca cortam; corte SECO reprova; fora de tabela, nada de "…" (o texto rola no lugar dele ou quebra). Data sempre dd/mm/aaaa.
- NADA SE DESLOCA (UI-SEM-DESLOCAR-01): texto que muda com a selecao tem largura reservada (`TextoReservado`, algarismos tabulares);
  botao/card pontual tem lugar reservado; LAYOUT FIXO em todo o sistema.
- REGUA DE TABELA UNICA (`src/components/ui/regua-tabela.tsx`, a de Recorrencias): cabecalho navy 22px 9,5/500, linha 19px 10px, padding
  0 4px, barra do rodape navy 23px dentro do quadro. Cabecalho e totais presos, so' o corpo rola, UM scrollport por tela, fundo opaco.
  O `th` alinha como o `td`; tabela de regua fixa (`table-layout: fixed`, `colgroup` em px medido) nao estica com a janela.
- Piso de 9,5px (excecoes declaradas: grade do DRE, selos da Conferencia, Mesa compacta, Lancamentos Financeiros). Tamanhos do A18.
- Selecao se marca com navy (`Segmentado`, o unico); controle nativo nunca; seletor de entidade tem busca; todo menu aberto pelo
  `menuPadrao`; todo campo de valor e' o `CampoMoeda` ("R$" e "0,00"); todo campo de arquivo aceita arrastar.
- UX-OBRIGATORIOS-01: Salvar com pendencia nao fecha nem grava; o campo pendente fica vermelho com a mensagem; UX-TOAST-01: validacao
  e erro de preenchimento nunca em toast. Dialogo/menu fechando nao aceita clique. Modal em blocos pela primitiva da casa; o
  `DialogContent` renderiza a 95%.
- A pagina e' pt-BR e nao se traduz. Barra lateral 152px num token. Graficos de saida: laranja/violeta/vermelho/cinza; azul so' entrada.
- FIN-V2-LISTA-VIRTUAL-01: a lista de Lancamentos so desenha as linhas a vista; a linha tem 19px fixos e conteudo mais alto que 16px
  quebra a conta da janela.
- OC-CC-BOTAO-BUSCAR-DESLOCA-01: faixa com abas + texto + botoes = tres lugares — abas `flex-none`, texto no meio `min-w-0 flex-1
  truncate` com `title` (sempre presente), botoes `flex-none` a' direita; o `check:ui-cortes` tem `botoesDentro` (botao inteiro na faixa).
- Acesso a tela por perfil tem um dono (`NIVEL_POR_TELA`); visibilidade nao e' permissao (quem permite e' o banco).
- Guardas do Claude Code: o comando comeca com `cd "$CLAUDE_PROJECT_DIR" &&`; a guarda le^ o texto do comando.

## INDICE
- Historico e relatorios por mes: `docs/historico/AAAA-MM.md` (o CLAUDE.md integral ate' 21/10/2026 esta' la', por mes, verbatim).
  Frentes fechadas ate' 29/09: `docs/historico/frentes-ate-2026-09-29.md`. Baselines: `docs/historico/gates-baselines.md`.
- Dividas abertas: `docs/DIVIDAS-ABERTAS.md`. Padroes de tela: `docs/PADROES-UI.md`. ADRs e specs: `docs/` e `specs/`.
- Achar a regra inteira de uma frente: `grep -n "NOME-DA-FRENTE" docs/historico/*.md docs/DIVIDAS-ABERTAS.md`.
