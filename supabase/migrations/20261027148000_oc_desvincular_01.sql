-- OC-DESVINCULAR-01 — tirar um lancamento de uma Operacao Comercial sem cancela-lo
--
-- POR QUE
-- O inverso de `oc_vincular_lancamento` nao existia. O unico gesto de saida era cancelar o titulo
-- (Financeiro) ou desfazer o compromisso (OC) — e os dois MATAM o lancamento, e com ele a
-- conciliacao. Caso real (Gabriel, 25/09/2026): abate c80ebe9e, Vera, Faz. 3 Muchachas. O comprador
-- pagou 107.367,46 adiantado; a nota foi 102.311,46; uma vaca condenada, e o Gabriel devolveu 5.056
-- por PIX. A saida de 5.056 (a5c1c61a) ficou presa a OC como "Adiantamento devolvido", com o
-- subcentro travado, e a OC dizia "recebido 107.367,46". O dinheiro e' real; o que esta' errado e'
-- ele pertencer a OC.
--
-- DECISOES (Gabriel, FASE 0 de 25/09/2026)
-- D1  `zoo_operacao_partes_titulo_uniq` vira PARCIAL (`WHERE cancelada = false`), como o indice da
--     parcela ja' era. A parte cancelada continua apontando o titulo — cancelado e' historia. Sem
--     isto, um lancamento desvinculado nunca mais poderia ser vinculado a outra OC.
-- D2  `oc_estornar_materializacao`: a guarda "titulo realizado/conciliado" passa a IGNORAR titulo JA
--     CANCELADO — nao ha' dinheiro vivo nele. E' o que deixa o "Desfazer compromisso" limpar a Graxaria
--     73a183eb e os dois orfaos (e8032b0d, f489abd9): partes vivas apontando titulos cancelados pelo
--     Financeiro, que a guarda recusava por `status_transacao = 'realizado'`.
--     ⚠ SO' O STATUS E O `conciliado_em` DEIXAM DE CONTAR NO CANCELADO. Liquidacao ativa e vinculo
--       bancario vivo continuam recusando em QUALQUER titulo: esses sao dinheiro vivo por definicao, e
--       num titulo cancelado seriam estado inconsistente — que a guarda deve denunciar, nao atravessar.
-- D3  "valor da OC" que o gesto recalcula = RECEBIDO (liquidacoes vivas) e TOTAL DOS COMPROMISSOS.
--     `valor_acordado` (soma dos lotes) nao muda.
-- D4  Desvincular NUNCA cancela o lancamento — a conciliacao fica intocada. Parametro opcional
--     `p_plano_conta_id`: se vier, a nova classificacao e' gravada no MESMO gesto, com o MESMO motivo.
--
-- O QUE A RPC FAZ (na ordem)
--   1. trava a OC, confere versao e acesso; acha a parte VIVA do lancamento NESTA OC
--   2. cancela a parte; estorna a liquidacao automatica do titulo nesta OC
--      ⚠ O GATILHO NAO FAZ ISSO SOZINHO, e foi MEDIDO: cancelar a parte dispara
--        `oc_sincronizar_liquidacao_de_financeiro`, que sem parte ativa e com titulo liquidado nao faz
--        NADA — a liquidacao de 5.056 continuava viva e o recebido continuava 107.367,46.
--   3. parcela cancelada; sem parcela viva, programacao e compromisso cancelados; senao o compromisso
--      passa a valer a soma das parcelas vivas (o mesmo idioma do vincular)
--   4. `origem_lancamento = 'operacao_comercial'` -> 'manual', `origem_tipo 'oc:'` -> NULL. Valor,
--      pagamento, conta e competencia NAO se tocam. Com `p_plano_conta_id`, a classificacao sai da
--      linha do plano.
--   5. evento 'desvincular_lancamento' com antes e depois; versao +1
--
-- ⚠ A CLASSIFICACAO: a "regra 9 do plano de contas" citada no briefing NAO existe em arquivo nenhum
--   do repo (procurada em docs/, na Constituicao, nas ADRs e na memoria). O alinhamento das copias e'
--   o do gatilho `resolve_classificacao_from_plano` (PR-FIN-PLANO-CHAVE-02: "a CHAVE e' a fonte; o
--   texto e' cache"). A RPC grava a chave E as copias da mesma linha do plano; o gatilho as reescreve
--   iguais. ⚠ E ELE APLICA A REGRA FIN-FAZENDA-ADM-01: conta de escopo 'administrativo' leva o
--   lancamento para a fazenda "Administrativo" e tira a safra — foi o que aconteceu com a entrada de
--   5.056 (a721d5ca) quando o Gabriel a reclassificou para "Estorno Recebido". A simulacao devolve a
--   fazenda e a safra de/para, para a tela dizer isso antes do clique.
-- ⚠ VALIDACAO DA CONTA: ativa, do plano global ou do proprio cliente, e com a MESMA direcao
--   (`tipo_operacao`) do lancamento — reclassificar nao inverte o sinal do dinheiro.
--
-- ⚠ E O VINCULAR ACOMPANHA O D1 (a checagem "ja' vinculado" do proprio `oc_vincular_lancamento`
--   filtrava parte de qualquer estado, com o comentario "o indice e' INTEGRAL"). Sem este ajuste a
--   candidata diria "elegivel" e a RPC recusaria "Lancamento ja esta ligado a uma operacao".
--
-- METODO dos tres corpos existentes: patch guardado por md5 (regra do CLAUDE.md, aprovada em
-- 24/09/2026). Cada ancora casa exatamente 1x, e o CONCEITO tambem foi contado ('status_transacao IN'
-- 1x no estornar; 'FROM public.zoo_operacao_partes' 1x nas candidatas; no vincular sao 4, e so' a
-- checagem do lancamento le' parte sem filtro — as outras tres ja' filtram ou buscam por id).
--   oc_estornar_materializacao  6ed7bc851c6c076650c4867d7057f73b (7.356)  -> 4c278e56ca80a0aa2ab9ff26e7f18c83 (7.423)
--   oc_candidatas_vinculo       7f324c2044e7b706cd5297c10322d1c5 (9.332)  -> c6885a6656efe6ff48b3a4bc6809f946 (9.356)
--   oc_vincular_lancamento      ef758e329a5568ed2218fff6c50602cd (25.290) -> 72be497d998f1f5232d10cc383464e04 (25.314)
-- O `CREATE OR REPLACE` sai do proprio `pg_get_functiondef`, entao cabecalho, SECURITY DEFINER,
-- search_path e volatilidade ficam os do banco.
--
-- PROVAS (BEGIN ... ROLLBACK, 25/09/2026, a migration inteira + casos em sub-blocos desfeitos):
--   (a1) simulacao em c80ebe9e / a5c1c61a: recebido 107.367,46 -> 102.311,46; compromisso 6b349b87
--        (5.056) cancelado; liquidacao e3545aaa estornada; lancamento intacto; e NADA gravado depois
--        (parte viva, liquidacao viva, versao 16, 19 eventos).
--   (a2) gravacao sem conta: mesmo envelope, versao 17, evento 'desvincular_lancamento' com parte_id e
--        motivo; o lancamento mudou SO' origem_lancamento/origem_tipo (+ updated_at/updated_by);
--        valor_acordado 102.311,46 intacto (D3). E o D1 funciona: `oc_candidatas_vinculo` volta a dizer
--        elegivel e a simulacao do vincular passa (criaria parte nova).
--   (a3) gravacao com "Pagamento Estornado": subcentro/centro/grupo/macro/plano da linha do plano,
--        compoe_dre true -> false, e a regra FIN-FAZENDA-ADM-01 levou para a fazenda Administrativo e tirou
--        a safra. Valor, pagamento, conta e competencia intactos.
--   (a4) conta de direcao errada ("Estorno Recebido", 1-Entradas): recusa. (a5) motivo vazio e versao
--        velha: recusa.
--   (a6) varias parcelas (4c5e8c86, compromisso 0cb2c49d de 380.000 = 300.000 + 80.000): reduzido a
--        80.000, programacao segue ativa.
--   (b)  controle conciliado 09b8c62d: 1 vinculo bancario antes e depois, extrato 'parcial', nao cancelado.
--   (c)  ANTES do D2 o estornar da Graxaria recusava ("Estorne a liquidacao ou conciliacao..."); DEPOIS,
--        estornar + cancelar programacao + cancelar compromisso: parte cancelada, parcela cancelada,
--        programacao cancelada, compromisso cancelado. (c2) o orfao e8032b0d tambem passa.
--   (d)  a guarda continua recusando titulo VIVO: realizado (principal 3e05fd75) e conciliado (09b8c62d).

-- ─── 1. D1: o indice de parte por titulo vira parcial ──────────────────────────────────────────
-- ⚠ ERA CONSTRAINT UNIQUE, NAO INDICE SOLTO (a primeira prova falhou no DROP INDEX com 2BP01). Um
--   constraint nao aceita WHERE, entao sai o constraint e entra um indice unico parcial com o MESMO
--   nome. Nenhuma FK o referencia (conferido em pg_constraint.confrelid) e nenhuma funcao faz
--   ON CONFLICT sobre ele (o unico ON CONFLICT com `financeiro_lancamento_id` e' o das liquidacoes).
ALTER TABLE public.zoo_operacao_partes DROP CONSTRAINT zoo_operacao_partes_titulo_uniq;
CREATE UNIQUE INDEX zoo_operacao_partes_titulo_uniq
  ON public.zoo_operacao_partes USING btree (financeiro_lancamento_id)
  WHERE (cancelada = false);

-- ─── 2. D2 + as duas checagens de "ja' vinculado" ──────────────────────────────────────────────
do $mig$
declare
  r record;
  v_def text; v_src text; v_depois text;
begin
  for r in
    select * from (values
      ('oc_estornar_materializacao',
       '6ed7bc851c6c076650c4867d7057f73b',
       E'  IF v_fl.status_transacao IN (''realizado'',''conciliado'')\n     OR v_fl.conciliado_em IS NOT NULL\n     OR v_parcela.status = ''paga''',
       E'  IF (v_fl.cancelado IS NOT TRUE AND (v_fl.status_transacao IN (''realizado'',''conciliado'')\n                                     OR v_fl.conciliado_em IS NOT NULL))\n     OR v_parcela.status = ''paga''',
       '4c278e56ca80a0aa2ab9ff26e7f18c83'),
      ('oc_candidatas_vinculo',
       '7f324c2044e7b706cd5297c10322d1c5',
       'SELECT p.id INTO v_parte FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id LIMIT 1;',
       'SELECT p.id INTO v_parte FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id AND p.cancelada = false LIMIT 1;',
       'c6885a6656efe6ff48b3a4bc6809f946'),
      ('oc_vincular_lancamento',
       'ef758e329a5568ed2218fff6c50602cd',
       'SELECT p.id INTO v_parte_id FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id LIMIT 1;',
       'SELECT p.id INTO v_parte_id FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id AND p.cancelada = false LIMIT 1;',
       '72be497d998f1f5232d10cc383464e04')
    ) as t(nome, md5_antes, ancora, novo, md5_depois)
  loop
    select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = r.nome and n.nspname = 'public';
    if md5(v_src) <> r.md5_antes then
      raise exception '% nao esta no corpo esperado (md5 %). Migration abortada.', r.nome, md5(v_src);
    end if;
    if (length(v_src) - length(replace(v_src, r.ancora, ''))) / length(r.ancora) <> 1 then
      raise exception 'a ancora de % nao casa exatamente 1x', r.nome;
    end if;
    execute replace(v_def, r.ancora, r.novo);
    select p.prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = r.nome and n.nspname = 'public';
    if md5(v_depois) <> r.md5_depois then
      raise exception '% ficou com corpo inesperado (md5 %). Esperado %.', r.nome, md5(v_depois), r.md5_depois;
    end if;
  end loop;
end $mig$;

-- ─── 3. oc_desvincular_lancamento ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_desvincular_lancamento(
  p_operacao_id uuid,
  p_versao_esperada integer,
  p_lancamento_id uuid,
  p_motivo text,
  p_plano_conta_id uuid DEFAULT NULL,
  p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(), '') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_l public.financeiro_lancamentos_v2;
  v_l_depois public.financeiro_lancamentos_v2;
  v_parte public.zoo_operacao_partes;
  v_parc public.zoo_operacao_parcelas_programacao;
  v_prog public.zoo_operacao_programacoes;
  v_comp public.zoo_operacao_compromissos;
  v_plano public.financeiro_plano_contas;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_recebido_antes numeric; v_recebido_depois numeric;
  v_comps_antes numeric; v_comps_depois numeric;
  v_cbi_antes int; v_cbi_depois int;
  v_liq_estornadas uuid[];
  v_vivas int; v_soma numeric;
  v_comp_acao text; v_comp_valor_depois numeric;
  v_era_oc boolean;
  v_classif_de jsonb; v_classif_para jsonb;
  v_nova int;
  v_ret jsonb;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  IF p_simular IS NOT TRUE AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Desvincular lancamento exige motivo' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501'; END IF;
  IF p_simular IS NOT TRUE AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada; recupere-a antes (oc_reabrir_para_estorno)' USING ERRCODE = 'P0001'; END IF;

  -- ── o lancamento ──
  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND OR v_l.cliente_id <> v_cli THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado neste cliente', p_lancamento_id USING ERRCODE = 'P0001'; END IF;
  -- D4: desvincular nunca cancela; titulo ja' cancelado com parte viva e' caso do Desfazer (D2).
  IF v_l.cancelado IS TRUE THEN
    RAISE EXCEPTION 'Lancamento cancelado: use o Desfazer compromisso da OC' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_parte FROM public.zoo_operacao_partes
   WHERE financeiro_lancamento_id = v_l.id AND operacao_id = p_operacao_id AND cancelada = false
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'nao_vinculado',
      'operacao_versao', v_op.versao);
  END IF;
  -- As 157 partes vivas com titulo sao do modelo vivo (medido 25/09/2026); parte sem parcela seria
  -- o modelo antigo, que este gesto nao sabe desmontar.
  IF v_parte.programacao_parcela_id IS NULL THEN
    RAISE EXCEPTION 'Parte % sem parcela de programacao: fora do modelo vivo, nao se desvincula por aqui', v_parte.id
      USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq
              WHERE lq.financeiro_lancamento_id = v_l.id AND lq.estornado IS NOT TRUE AND lq.origem <> 'financeiro') THEN
    RAISE EXCEPTION 'O titulo tem liquidacao MANUAL ativa na OC; estorne-a antes de desvincular' USING ERRCODE = 'P0001'; END IF;

  -- ── a conta nova (D4), validada ANTES de escrever ──
  IF p_plano_conta_id IS NOT NULL THEN
    SELECT * INTO v_plano FROM public.financeiro_plano_contas WHERE id = p_plano_conta_id;
    IF NOT FOUND OR v_plano.ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'Conta do plano % inexistente ou inativa', p_plano_conta_id USING ERRCODE = 'P0001'; END IF;
    IF v_plano.cliente_id IS NOT NULL AND v_plano.cliente_id <> v_cli THEN
      RAISE EXCEPTION 'Conta do plano de outro cliente' USING ERRCODE = 'P0001'; END IF;
    IF v_plano.tipo_operacao IS DISTINCT FROM v_l.tipo_operacao THEN
      RAISE EXCEPTION 'Direcao da conta (%) nao confere com o lancamento (%)', v_plano.tipo_operacao, v_l.tipo_operacao
        USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT * INTO v_parc FROM public.zoo_operacao_parcelas_programacao WHERE id = v_parte.programacao_parcela_id FOR UPDATE;
  SELECT * INTO v_prog FROM public.zoo_operacao_programacoes WHERE id = v_parc.programacao_id FOR UPDATE;
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos WHERE id = v_prog.compromisso_id FOR UPDATE;

  SELECT coalesce(sum(valor), 0) INTO v_recebido_antes FROM public.zoo_operacao_liquidacoes
   WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE;
  SELECT coalesce(sum(valor_total), 0) INTO v_comps_antes FROM public.zoo_operacao_compromissos
   WHERE operacao_id = p_operacao_id AND status <> 'cancelado';
  SELECT count(*) INTO v_cbi_antes FROM public.conciliacao_bancaria_itens
   WHERE lancamento_id = v_l.id AND desfeito_em IS NULL;
  v_classif_de := jsonb_build_object('plano_conta_id', v_l.plano_conta_id, 'subcentro', v_l.subcentro,
    'centro_custo', v_l.centro_custo, 'grupo_custo', v_l.grupo_custo, 'macro_custo', v_l.macro_custo,
    'escopo_negocio', v_l.escopo_negocio, 'fazenda_id', v_l.fazenda_id,
    'fazenda_nome', (SELECT f.nome FROM public.fazendas f WHERE f.id = v_l.fazenda_id),
    'safra_id', v_l.safra_id, 'compoe_dre', v_l.compoe_dre);

  -- ═══ daqui para baixo, escreve ═══

  -- 2. a parte sai; a liquidacao automatica do titulo nesta OC e' estornada (o gatilho nao o faz)
  UPDATE public.zoo_operacao_partes
     SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor,
         cancelada_motivo = coalesce(v_motivo, 'desvincular (simulacao)'), updated_at = now()
   WHERE id = v_parte.id;

  WITH est AS (
    UPDATE public.zoo_operacao_liquidacoes
       SET estornado = true, estornado_em = now(), estornado_por = v_actor,
           estorno_motivo = coalesce(v_motivo, 'desvincular (simulacao)'), updated_at = now(), updated_by = v_actor
     WHERE financeiro_lancamento_id = v_l.id AND operacao_id = p_operacao_id
       AND origem = 'financeiro' AND estornado IS NOT TRUE
    RETURNING id)
  SELECT coalesce(array_agg(id), '{}') INTO v_liq_estornadas FROM est;

  -- 3. parcela, programacao, compromisso
  UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_parc.id;
  SELECT count(*), coalesce(sum(valor), 0) INTO v_vivas, v_soma
    FROM public.zoo_operacao_parcelas_programacao
   WHERE programacao_id = v_prog.id AND status IN ('prevista', 'materializada', 'paga');
  IF v_vivas = 0 THEN
    UPDATE public.zoo_operacao_programacoes SET status = 'cancelada', updated_at = now() WHERE id = v_prog.id;
    UPDATE public.zoo_operacao_compromissos SET status = 'cancelado', updated_at = now() WHERE id = v_comp.id;
    v_comp_acao := 'cancelado'; v_comp_valor_depois := 0;
  ELSE
    UPDATE public.zoo_operacao_compromissos SET valor_total = round(v_soma, 2), updated_at = now() WHERE id = v_comp.id;
    v_comp_acao := 'reduzido'; v_comp_valor_depois := round(v_soma, 2);
  END IF;

  -- 4. o lancamento vira avulso — so' origem (e a classificacao, se pedida)
  v_era_oc := (v_l.origem_lancamento = 'operacao_comercial' OR coalesce(v_l.origem_tipo, '') LIKE 'oc:%');
  UPDATE public.financeiro_lancamentos_v2
     SET origem_lancamento = CASE WHEN origem_lancamento = 'operacao_comercial' THEN 'manual' ELSE origem_lancamento END,
         origem_tipo       = CASE WHEN coalesce(origem_tipo, '') LIKE 'oc:%' THEN NULL ELSE origem_tipo END,
         plano_conta_id    = CASE WHEN p_plano_conta_id IS NOT NULL THEN v_plano.id           ELSE plano_conta_id END,
         subcentro         = CASE WHEN p_plano_conta_id IS NOT NULL THEN v_plano.subcentro    ELSE subcentro END,
         centro_custo      = CASE WHEN p_plano_conta_id IS NOT NULL THEN v_plano.centro_custo ELSE centro_custo END,
         grupo_custo       = CASE WHEN p_plano_conta_id IS NOT NULL THEN v_plano.grupo_custo  ELSE grupo_custo END,
         macro_custo       = CASE WHEN p_plano_conta_id IS NOT NULL THEN v_plano.macro_custo  ELSE macro_custo END,
         updated_at = now(), updated_by = v_actor
   WHERE id = v_l.id
   RETURNING * INTO v_l_depois;

  v_classif_para := jsonb_build_object('plano_conta_id', v_l_depois.plano_conta_id, 'subcentro', v_l_depois.subcentro,
    'centro_custo', v_l_depois.centro_custo, 'grupo_custo', v_l_depois.grupo_custo, 'macro_custo', v_l_depois.macro_custo,
    'escopo_negocio', v_l_depois.escopo_negocio, 'fazenda_id', v_l_depois.fazenda_id,
    'fazenda_nome', (SELECT f.nome FROM public.fazendas f WHERE f.id = v_l_depois.fazenda_id),
    'safra_id', v_l_depois.safra_id, 'compoe_dre', v_l_depois.compoe_dre);

  SELECT coalesce(sum(valor), 0) INTO v_recebido_depois FROM public.zoo_operacao_liquidacoes
   WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE;
  SELECT coalesce(sum(valor_total), 0) INTO v_comps_depois FROM public.zoo_operacao_compromissos
   WHERE operacao_id = p_operacao_id AND status <> 'cancelado';
  SELECT count(*) INTO v_cbi_depois FROM public.conciliacao_bancaria_itens
   WHERE lancamento_id = v_l.id AND desfeito_em IS NULL;

  -- 5. trilha e versao
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'desvincular_lancamento',
    jsonb_build_object('lancamento', to_jsonb(v_l), 'parte', to_jsonb(v_parte), 'parcela', to_jsonb(v_parc),
                       'programacao', to_jsonb(v_prog), 'compromisso', to_jsonb(v_comp)),
    jsonb_build_object('lancamento', to_jsonb(v_l_depois)),
    jsonb_build_object('motivo', v_motivo, 'lancamento_id', v_l.id, 'parte_id', v_parte.id, 'parcela_id', v_parc.id,
      'programacao_id', v_prog.id, 'compromisso_id', v_comp.id, 'compromisso_acao', v_comp_acao,
      'compromisso_valor_anterior', v_comp.valor_total, 'compromisso_valor_novo', v_comp_valor_depois,
      'liquidacoes_estornadas', to_jsonb(v_liq_estornadas),
      'origem_de', v_l.origem_lancamento, 'origem_para', v_l_depois.origem_lancamento,
      'origem_tipo_de', v_l.origem_tipo,
      'classificacao_de', v_classif_de,
      'classificacao_para', CASE WHEN p_plano_conta_id IS NOT NULL THEN v_classif_para END,
      'recebido_de', v_recebido_antes, 'recebido_para', v_recebido_depois,
      'compromissos_de', v_comps_antes, 'compromissos_para', v_comps_depois,
      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  v_ret := jsonb_build_object(
    'ok', true, 'acao', CASE WHEN p_simular THEN 'simulado' ELSE 'desvinculado' END,
    'simulado', coalesce(p_simular, false),
    'operacao_id', p_operacao_id,
    'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
    'parte_id', v_parte.id,
    'compromisso', jsonb_build_object('id', v_comp.id, 'acao', v_comp_acao, 'componente', v_comp.componente,
                     'descricao', v_comp.descricao, 'valor_anterior', v_comp.valor_total, 'valor_total', v_comp_valor_depois),
    'recebido', jsonb_build_object('de', v_recebido_antes, 'para', v_recebido_depois),
    'compromissos_total', jsonb_build_object('de', v_comps_antes, 'para', v_comps_depois),
    'liquidacoes_estornadas', to_jsonb(v_liq_estornadas),
    'lancamento', jsonb_build_object('id', v_l.id, 'valor', v_l.valor, 'data_pagamento', v_l.data_pagamento,
                     'status_transacao', v_l.status_transacao, 'conta_bancaria_id', v_l.conta_bancaria_id,
                     'origem_de', v_l.origem_lancamento, 'origem_para', v_l_depois.origem_lancamento,
                     'era_da_oc', v_era_oc,
                     'intacto', (v_l_depois.valor = v_l.valor
                                 AND v_l_depois.data_pagamento IS NOT DISTINCT FROM v_l.data_pagamento
                                 AND v_l_depois.data_competencia IS NOT DISTINCT FROM v_l.data_competencia
                                 AND v_l_depois.conta_bancaria_id IS NOT DISTINCT FROM v_l.conta_bancaria_id
                                 AND v_l_depois.status_transacao IS NOT DISTINCT FROM v_l.status_transacao
                                 AND v_l_depois.cancelado IS NOT DISTINCT FROM v_l.cancelado)),
    'conciliacao', jsonb_build_object('vinculos_antes', v_cbi_antes, 'vinculos_depois', v_cbi_depois),
    'classificacao', jsonb_build_object('mudou', p_plano_conta_id IS NOT NULL, 'de', v_classif_de,
                       'para', CASE WHEN p_plano_conta_id IS NOT NULL THEN v_classif_para ELSE v_classif_de END));

  -- ⚠ SIMULACAO = O MESMO CAMINHO, DESFEITO (o idioma do `oc_vincular_lancamento`): tudo acima roda e
  -- esta excecao desfaz o bloco inteiro; as variaveis sobrevivem e o envelope volta ao chamador.
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de desvinculo (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$function$;

-- ─── 4. ACL: nada para PUBLIC/anon ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean) TO authenticated, service_role;
