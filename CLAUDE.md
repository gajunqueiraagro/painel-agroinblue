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
- TSC baseline: 79 erros, medidos em ARVORE LIMPA — worktree em detached
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
    4. ERRO NOVO. Qualquer par (arquivo, codigo, mensagem) que nao existia
       em A reprova o PR, mesmo que o total tenha caido.
    5. REDUZIR e' permitido e desejavel. Ao reduzir, atualizar este numero
       no mesmo PR e listar quais erros sairam.
  Rodar e REPORTAR o numero em TODO ciclo, sem excecao.
- Zero-cast: proibido `as` / `as any` em codigo novo. Unica excecao:
  o idioma existente `(supabase as any).rpc`.
- Build verde obrigatorio antes de qualquer commit.

## RELATORIO DE EXECUCAO (formato obrigatorio, todo ciclo)
1. TSC: N erros (baseline 79) — numero explicito, obtido com
   `npx tsc -p tsconfig.app.json --noEmit`
2. Build: OK/FALHOU + tempo
3. git diff --stat completo
4. git status -s (contagem de arquivos — deve bater com o escopo
   declarado no briefing; arquivo fora do escopo = PARAR e reportar)
5. Checks do briefing (se houver secao CHECKS): resultado de cada um
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
