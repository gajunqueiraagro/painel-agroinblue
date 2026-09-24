-- OC-BOITEL-VALOR-01 · B2 — backfill: a receita das vendas de boitel vai para 1150
--
-- POR QUE
-- Ate' o B1 (commit 7223af46) o mapa de subcentro da OC olhava SO' a categoria do lote, e um
-- garrote vendido por boitel virava "Venda de Machos Adultos" (1140). Medido em 24/09/2026: das
-- CINCO OCs de boitel do banco, QUATRO gravaram a principal em 1140 e NENHUMA em 1150. A quinta
-- (NJ, 3260d1c8) o Gabriel ja' tinha corrigido a mao, cancelando a parte e recriando; estas
-- quatro ficaram.
--
-- ⚠ E "NINGUEM USAVA O 1150" E' FALSO — o comentario que o B1 apagou dizia isso, e eu o repeti
-- no relatorio da FASE 0. Medido ao escrever este backfill: 1150 tem 123 lancamentos (107 ativos,
-- 16 cancelados). 119 vem de `importacao_incremental` (Agnaldo 97, RRCC 10, Vera 8, NJ 4;
-- 2019-2025; R$ 35,2 mi), 2 de um escritor PROPRIO (`origem_tipo = 'boitel:receita'`, Vera,
-- `previsto`) e 2 de `operacao_comercial` — a do NJ corrigida a mao e uma parte CANCELADA da Vera.
-- O que nunca usou o 1150 foi o ESCRITOR DA OC — bem mais estreito do que a frase dizia.
-- Quem contou "quem usa" pelo comentario contou a impressao; a conta se faz no banco.
--
-- ⚠ O B1 CONSERTA O MOTOR E NAO O PASSADO. Lancamento ja' gravado nao se reclassifica sozinho:
-- daqui para a frente nasce em 1150, e estes quatro continuariam em 1140 para sempre.
--
-- O QUE MUDA, e so' isto:
--   financeiro_lancamentos_v2 : plano_conta_id 1140 -> 1150 (4 linhas)
--   zoo_operacao_partes       : plano_conta_id + subcentro          (4 linhas)
--
-- ⚠ O LANCAMENTO RECEBE SO' A CHAVE, NAO O TEXTO. `trg_resolve_classificacao_plano`
-- (`resolve_classificacao_from_plano`) e' BEFORE UPDATE e tem a doutrina escrita no corpo —
-- "PR-FIN-PLANO-CHAVE-02: a CHAVE e a fonte; o texto e cache". Com `plano_conta_id` mudando,
-- `v_chave_manda` e' verdadeiro e ELE preenche subcentro / macro / grupo / centro / escopo a
-- partir do plano. Escrever o texto aqui tambem seria a migration afirmando por conta propria
-- uma copia que o banco ja' sabe derivar — e que poderia divergir do plano num dia em que o
-- plano mudasse. A `zoo_operacao_partes` NAO tem esse trigger, e por isso la' os dois campos vao
-- escritos.
--
-- ⚠ CENTRO / GRUPO / MACRO NAO MUDAM, e isso foi MEDIDO, nao suposto: 1140 e 1150 sao irmas sob
-- `Venda Peso Vivo` / `Receita Pecuaria` / `Receita Operacional`, as duas globais
-- (`cliente_id IS NULL`), ativas e `1-Entradas`. O backfill mexe em DUAS colunas, nao nas quatro
-- copias — a assercao de destino confere que as outras tres seguem iguais.
--
-- OS QUATRO TRIGGERS QUE PODERIAM ATRAPALHAR, todos conferidos INERTES aqui:
--   mark_..._editado_manual     — so' dispara com `OLD.lote_importacao_id IS NOT NULL`; estes
--                                 nasceram da OC e tem `lote_importacao_id` NULO, entao o
--                                 backfill NAO os marca como editados a mao. (⚠ dois dos quatro
--                                 ja' tem `editado_manual = true` de edicoes anteriores do
--                                 operador; o campo nao se mexe nos dois sentidos.)
--   set_..._hash / unique_hash  — idem, ambos guardados por `lote_importacao_id`.
--   guard_financeiro_lanc_v2    — so' barra `origem_lancamento = 'importacao_historica'`; o
--                                 destes e' 'operacao_comercial'.
--   guard_zoo_..._cancelamento  — so' dispara em `NEW.cancelado IS TRUE`; nao cancelamos nada.
-- E DOIS QUE DISPARAM DE PROPOSITO:
--   materializar_dre_lcdpr_from_plano — rederiva `compoe_dre`/`gera_lcdpr` a partir do plano
--                                 novo. E' o comportamento certo: a linha passa a ser de boitel.
--   oc_trg_sync_liquidacao_*    — chama `oc_sincronizar_liquidacao_de_financeiro` SEM condicao.
--                                 Classificacao nao move status, entao deve ser inerte — e a
--                                 prova em rollback CONTOU as liquidacoes antes e depois.
--
-- PROVAS (BEGIN ... ROLLBACK, 24/09/2026) — ver o relatorio do PR. As contagens dos DOIS lados
-- sao 4 e 4; conjunto vazio nao e' prova.
--
-- REEXECUCAO: a guarda de origem exige as 4 linhas em 1140. Rodar de novo sobre o banco ja'
-- corrigido FALHA — que e' o comportamento certo para um backfill.

do $mig$
declare
  k_1140 constant uuid := 'bfac4339-67a5-45f9-bd1f-dcaa60c56a2c';  -- Venda de Machos Adultos
  k_1150 constant uuid := '13bb42b9-b3de-466e-864a-bd8c2c61f45a';  -- Venda em Boitel
  ids_lanc constant uuid[] := array[
    '1ddf2fe4-7d32-4a09-a04b-99698d60cf50',  -- RRCC  · OC 744c520e · 1.252.460,61
    '3f707ce6-43ae-40ff-b7c7-ee3e69041fe8',  -- RRCC  · OC da0b8577 ·   466.030,10
    '75f3fc2d-d305-4eac-9969-cf0358df63df',  -- Vera  · OC b58bf556 ·   591.613,96
    'a3c10d7e-822d-4c56-b2a0-b4340dfd911a'   -- Vera  · OC 7f7de76f ·   261.853,50
  ]::uuid[];
  ids_parte constant uuid[] := array[
    'bb2b03d8-b230-4850-86e1-4b8efb822b94',
    '627798a6-3e6a-42c9-bfe6-3e75934345ab',
    '3830d115-8c85-45f1-ac71-7e581247825e',
    '25dc07f7-98de-472c-9f05-5bfcb794180c'
  ]::uuid[];
  n int;
  v_plano_ok boolean;
  n_1140_antes int; n_1150_antes int; n_total_antes int;
begin
  select count(*) into n_1140_antes from public.financeiro_lancamentos_v2 where plano_conta_id = k_1140;
  select count(*) into n_1150_antes from public.financeiro_lancamentos_v2 where plano_conta_id = k_1150;
  select count(*) into n_total_antes from public.financeiro_lancamentos_v2;
  ---------------------------------------------------------------- GUARDA: o plano de destino
  select count(*) = 1 into v_plano_ok
    from public.financeiro_plano_contas
   where id = k_1150 and ativo = true and subcentro = 'Venda em Boitel'
     and centro_custo = 'Venda Peso Vivo' and grupo_custo = 'Receita Pecuária'
     and macro_custo = 'Receita Operacional' and tipo_operacao = '1-Entradas';
  if not v_plano_ok then
    raise exception 'Plano 1150 (Venda em Boitel) nao esta no estado esperado. Backfill abortado.';
  end if;

  ---------------------------------------------------------------- GUARDA DE ORIGEM: 4 e 4
  select count(*) into n from public.financeiro_lancamentos_v2
   where id = any(ids_lanc) and plano_conta_id = k_1140
     and subcentro = 'Venda de Machos Adultos'
     and coalesce(cancelado, false) = false and conciliado_em is null;
  if n <> 4 then
    raise exception 'Esperava 4 lancamentos em 1140, nao cancelados e nao conciliados; achei %.', n;
  end if;

  select count(*) into n from public.zoo_operacao_partes
   where id = any(ids_parte) and plano_conta_id = k_1140
     and subcentro = 'Venda de Machos Adultos'
     and natureza = 'principal' and coalesce(cancelada, false) = false;
  if n <> 4 then
    raise exception 'Esperava 4 partes principais em 1140 nao canceladas; achei %.', n;
  end if;

  ---------------------------------------------------------------- ESCRITA
  /* So' a chave: o trigger deriva o texto do plano. Ver a nota do cabecalho. */
  update public.financeiro_lancamentos_v2
     set plano_conta_id = k_1150
   where id = any(ids_lanc);
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'UPDATE tocou % lancamentos, esperava 4.', n; end if;

  /* A parte nao tem trigger de resolucao: os dois campos vao escritos. */
  update public.zoo_operacao_partes
     set plano_conta_id = k_1150,
         subcentro      = 'Venda em Boitel',
         updated_at     = now()
   where id = any(ids_parte);
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'UPDATE tocou % partes, esperava 4.', n; end if;

  ---------------------------------------------------------------- GUARDA DE DESTINO: 4 e 4
  select count(*) into n from public.financeiro_lancamentos_v2
   where id = any(ids_lanc) and plano_conta_id = k_1150
     and subcentro   = 'Venda em Boitel'
     and centro_custo = 'Venda Peso Vivo'
     and grupo_custo  = 'Receita Pecuária'
     and macro_custo  = 'Receita Operacional';
  if n <> 4 then
    raise exception 'Depois do backfill esperava 4 lancamentos em 1150 com as 4 colunas do plano; achei %.', n;
  end if;

  select count(*) into n from public.zoo_operacao_partes
   where id = any(ids_parte) and plano_conta_id = k_1150 and subcentro = 'Venda em Boitel';
  if n <> 4 then
    raise exception 'Depois do backfill esperava 4 partes em 1150; achei %.', n;
  end if;

  ---------------------------------------------------------------- GUARDA DE BORDA
  /* ⚠ NINGUEM MAIS PODE TER ANDADO. Sem esta, um `where` errado passaria em TODAS as
     assercoes acima — elas so' olham as oito linhas que a migration nomeia.
     ⚠ A PRIMEIRA VERSAO DESTA GUARDA ESTAVA ERRADA, e a prova em rollback a reprovou: ela
     exigia que NINGUEM mais estivesse em 1150, e ha' 123 — 119 de `importacao_incremental`
     (Agnaldo 97, RRCC 10, Vera 8, NJ 4; 2019-2025; R$ 35,2 mi), 2 de um escritor proprio
     (`origem_tipo = 'boitel:receita'`, Vera, `previsto`) e 2 de `operacao_comercial`: a do
     NJ que o Gabriel corrigiu a mao e uma parte CANCELADA da Vera (adiantamento devolvido,
     96.769,50). Dos 123, 107 ativos e 16 cancelados. O subcentro 1150 nunca esteve vazio; o
     que nunca o usou foi o ESCRITOR DA OC.
     ⚠ E O "122" QUE EU RELATEI ERA DA PROPRIA GUARDA ERRADA: ela excluia `c842b031` na
     clausula, entao contava 123 - 1. Numero de relatorio se confere com a query que o gerou.
     A guarda certa nao conta quem esta' la' — conta o MOVIMENTO: 1140 perde 4, 1150 ganha 4,
     e o total nao se mexe. */
  if (select count(*) from public.financeiro_lancamentos_v2 where plano_conta_id = k_1150)
     <> n_1150_antes + 4 then
    raise exception '1150 deveria ter ganho exatamente 4 lancamentos (antes %).', n_1150_antes;
  end if;
  if (select count(*) from public.financeiro_lancamentos_v2 where plano_conta_id = k_1140)
     <> n_1140_antes - 4 then
    raise exception '1140 deveria ter perdido exatamente 4 lancamentos (antes %).', n_1140_antes;
  end if;
  if (select count(*) from public.financeiro_lancamentos_v2) <> n_total_antes then
    raise exception 'O numero de lancamentos mudou: % -> %.',
      n_total_antes, (select count(*) from public.financeiro_lancamentos_v2);
  end if;
end $mig$;
