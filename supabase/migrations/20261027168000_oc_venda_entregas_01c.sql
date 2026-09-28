-- 20261027168000_oc_venda_entregas_01c.sql
-- OC-VENDA-ENTREGAS-01c — EXPLICAR A DIFERENCA, CANCELAR COM ENTREGAS, RESUMO E PROGRAMAR RECEBIMENTO (decisoes do Gabriel,
-- 28/09/2026; mock `docs/mocks/oc_conta_corrente_mock_v7.html`, md5 dd5e9cbd). Generico por tipo de OC; a tela liga so' a venda.
--
-- SINAL DA CONTA CORRENTE (mock v7): o extrato e' lido pelo CAIXA DA FAZENDA — recebimento soma, entrega abate, explicacao soma
-- quando reduz o que falta receber. saldo = recebido - entregue + explicacoes; NEGATIVO = falta receber, POSITIVO = adiantado,
-- ZERO = quitado. (Inverte o sinal do 01b, que dizia 'ele_deve' com saldo positivo. So' a conta corrente; no DRE a entrega segue
-- receita positiva.)
--
-- PECAS:
--   1. Plano: 5006 "Devolucao de Adiantamento de Clientes" (2-Saidas, Movimentacoes Financeiras, sem bloco, fora do DRE).
--   2. Catalogo: deducao|acrescimo/ajuste_preco, deducao/desconto_comercial, obrigacao/permuta_despesa, acrescimo/outra_receita,
--      obrigacao/devolucao_comprador. Partes ganham a origem 'explicacao'.
--   3. `oc_revalorar_lote` (patch guardado): valor_acordado pela MESMA soma do `oc_salvar_lotes` (`_oc_valor_do_lote`), e a
--      idempotencia compara com o TOTAL do lote — a soma crua de `valor_informado` misturava R$/kg com R$ (206.480,34 medido na FASE 0).
--   4. `oc_sincronizar_liquidacao_de_financeiro` (patch guardado): explicacao SEM CAIXA nao liquida; a devolucao (caixa) liquida.
--   5. `oc_explicar_saldo` (nova, com simular): ajuste de preco (lote em criterio 'total', valor exato; o R$/kg so' derivado),
--      desconto comercial (5020), permuta/outra despesa (conta de saida escolhida), outra receita (conta de entrada escolhida,
--      escopo pecuaria) e devolucao ao comprador (5006, pagamento de caixa PROGRAMADO). Competencia = data da ultima entrega.
--      `oc_desfazer_explicacao` (nova, com simular).
--   6. `oc_conta_corrente` (corpo integral novo): linhas de explicacao, sinal do caixa da fazenda, `explicado`, `saldo_a_explicar`,
--      `devolvido`, `ultima_entrega`, `explicacoes` para o dialogo; banco e numero da conta na linha.
--   7. `_oc_conta_corrente_base` + ramo na `vw_oc_operacao_liquidacao`: no modelo conta corrente a base e' o que o comprador deve
--      (entregue + outras receitas - descontos - despesas) e o liquidado e' recebido - devolvido. Sem isso, um recebimento
--      programado pela OC viraria a base "do lado" e a OC apareceria "excedente".
--   8. `oc_cancelar` (patch guardado): no modelo conta corrente cancela entregas e explicacoes, solta os recebimentos (parte
--      cancelada, liquidacao estornada, conta ORIGINAL do evento `vincular_recebimento`; o nascido na OC fica em Adiantamento de
--      Clientes como lancamento manual), cancela compromissos/programacoes e desvincula as saidas adotadas. Titulo nunca apagado.
--      A trava de "titulo financeiro ativo" passa a olhar so' a parte VIVA — parte cancelada com titulo vivo e' lancamento solto.
--      `oc_cancelar_rol` (nova, leitura) devolve tudo isso ANTES, para o dialogo.
--   9. `oc_programar_recebimento` (nova, com simular): compromisso SEM LOTE em Adiantamento de Clientes pelo fluxo que existe
--      (`oc_criar_compromisso` -> `oc_programar_compromisso` -> `oc_materializar_programacao`) numa transacao.
--
-- PATCH GUARDADO POR md5 (origem -> destino, conferido no fim):
--   oc_revalorar_lote                        7b48df6a -> 0b59e2ee
--   oc_sincronizar_liquidacao_de_financeiro  8175fee1 -> 208b60e1
--   oc_cancelar                              21da1015 -> fec8f7bc
--   oc_conta_corrente                        e57f3eee -> corpo integral novo
--   vw_oc_operacao_liquidacao                viewdef 7029c081 -> ramo conta corrente (security_invoker conferido)

-- ═══ guardas de origem ═══
do $g$
declare r record;
begin
  for r in select * from (values
    ('oc_revalorar_lote', '7b48df6ae3927801bc88567b8a49a01b'),
    ('oc_sincronizar_liquidacao_de_financeiro', '8175fee15468199c39dbad03feba271a'),
    ('oc_cancelar', '21da101500761358ac62417d9f59cfcf'),
    ('oc_conta_corrente', 'e57f3eee7bcfdb6d4443b2afb3fdacac')) v(fn, h)
  loop
    if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = r.fn and md5(prosrc) = r.h) then
      raise exception 'OC-VENDA-ENTREGAS-01c: % fora do corpo esperado', r.fn;
    end if;
  end loop;
  if md5(pg_get_viewdef('public.vw_oc_operacao_liquidacao'::regclass)) <> '7029c0819320f332c11f49fdc023c9c0' then
    raise exception 'OC-VENDA-ENTREGAS-01c: vw_oc_operacao_liquidacao fora da definicao esperada'; end if;
  if exists (select 1 from public.financeiro_plano_contas where ordem_exibicao = 5006
                or subcentro = 'Devolução de Adiantamento de Clientes') then
    raise exception 'OC-VENDA-ENTREGAS-01c: 5006 ja existe no plano'; end if;
end $g$;

-- ═══ 1. plano ═══
insert into public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo, escopo_negocio, ativo,
   ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
values (null, '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Movimentações Financeiras', 'Devolução de Adiantamento de Clientes',
        null, 'pecuaria', true, 5006, false, null, null);

-- ═══ 2. catalogo e origem ═══
insert into public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ativo, ordem_exibicao, sistemico) values
  ('deducao',   'ajuste_preco',        'Ajuste de preço (reduz a entrega)',   'ajuste',   true, 90, true),
  ('acrescimo', 'ajuste_preco',        'Ajuste de preço (aumenta a entrega)', 'ajuste',   true, 90, true),
  ('deducao',   'desconto_comercial',  'Desconto comercial',                  'desconto', true, 91, true),
  ('obrigacao', 'permuta_despesa',     'Permuta / outra despesa',             'ajuste',   true, 92, true),
  ('acrescimo', 'outra_receita',       'Outra receita',                       'ajuste',   true, 93, true),
  ('obrigacao', 'devolucao_comprador', 'Devolução ao comprador',              'ajuste',   true, 94, true);

alter table public.zoo_operacao_partes drop constraint zoo_operacao_partes_origem_check;
alter table public.zoo_operacao_partes add constraint zoo_operacao_partes_origem_check
  check (origem = any (array['negociacao'::text, 'documento'::text, 'manual'::text, 'programacao'::text, 'entrega'::text,
                             'explicacao'::text]));

-- ═══ 3. oc_revalorar_lote: a soma certa ═══
do $r$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public.oc_revalorar_lote'::regproc);
  v_a := $a$  IF round(p_novo_valor, 2) = round(COALESCE(v_lote.valor_informado, 0), 2) THEN$a$;
  v_b := $b$  -- OC-VENDA-ENTREGAS-01c: compara com o TOTAL do lote. `valor_informado` cru e' R$/kg num lote por kg.
  IF round(p_novo_valor, 2) = round(COALESCE((public._oc_valor_do_lote(p_lote_id)->>'total')::numeric, 0), 2) THEN$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora da idempotencia do revalorar nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  v_a := $a$SET valor_acordado = (SELECT round(COALESCE(sum(valor_informado),0),2) FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id), versao$a$;
  v_b := $b$SET valor_acordado = (SELECT round(COALESCE(sum((public._oc_valor_do_lote(l.id)->>'total')::numeric),0),2) FROM public.zoo_operacao_lotes l WHERE l.operacao_id = p_operacao_id), versao$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do valor_acordado do revalorar nao casa 1x'; end if;
  execute replace(v_def, v_a, v_b);
end $r$;

-- ═══ 4. liquidacao automatica: explicacao sem caixa nao liquida ═══
do $l$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public.oc_sincronizar_liquidacao_de_financeiro'::regproc);
  v_a := $a$  IF v_parte.origem = 'entrega' THEN RETURN; END IF;$a$;
  v_b := $b$  IF v_parte.origem = 'entrega' THEN RETURN; END IF;
  -- OC-VENDA-ENTREGAS-01c: explicacao sem caixa (desconto, permuta, outra receita, ajuste) tambem nao e' pagamento. A devolucao
  -- ao comprador e' caixa e segue liquidando.
  IF v_parte.origem = 'explicacao' AND v_parte.sem_movimentacao_caixa IS TRUE THEN RETURN; END IF;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora da liquidacao nao casa 1x'; end if;
  execute replace(v_def, v_a, v_b);
end $l$;

-- ═══ 5a. a data da ultima entrega (competencia das explicacoes) ═══
create or replace function public._oc_ultima_entrega(p_operacao_id uuid)
returns date
language sql stable
set search_path = public
as $fn$
  SELECT max(f.data_competencia)
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
   WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'entrega' AND pt.cancelada = false;
$fn$;
revoke all on function public._oc_ultima_entrega(uuid) from public, anon;
grant execute on function public._oc_ultima_entrega(uuid) to authenticated, service_role;

-- ═══ 5b. oc_explicar_saldo ═══
create or replace function public.oc_explicar_saldo(p_operacao_id uuid, p_versao_esperada integer, p_tipo text, p_valor numeric,
  p_lote_id uuid, p_plano_conta_id uuid, p_motivo text, p_vencimento date default null, p_simular boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(), '') = 'service_role');
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_ult date;
  v_valor numeric := round(p_valor, 2);
  v_pc public.financeiro_plano_contas;
  v_lote public.zoo_operacao_lotes;
  v_total numeric; v_novo numeric;
  v_nat text; v_tipo_op text; v_sinal text; v_status text; v_smc boolean; v_venc date; v_pag date;
  v_tit uuid; v_parte uuid; v_x jsonb; v_ver int; v_nova int; v_ret jsonb; v_rotulo text;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  IF NOT (v_is_service OR (v_actor IS NOT NULL AND (public.is_admin_agroinblue(v_actor)
          OR v_cli IN (SELECT public.get_user_cliente_ids(v_actor))))) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Informe o motivo da explicacao' USING ERRCODE = 'P0001'; END IF;
  IF p_simular IS NOT TRUE AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.modelo_financeiro <> 'conta_corrente' THEN
    RAISE EXCEPTION 'Explicar a diferenca so existe no modelo conta corrente' USING ERRCODE = 'P0001'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao em rascunho ou cancelada nao recebe explicacao' USING ERRCODE = 'P0001'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador') THEN
    RAISE EXCEPTION 'Tipo de explicacao invalido (%)', p_tipo USING ERRCODE = 'P0001'; END IF;
  IF v_valor IS NULL OR v_valor = 0 OR (p_tipo <> 'ajuste_preco' AND v_valor < 0) THEN
    RAISE EXCEPTION 'Informe o valor da explicacao' USING ERRCODE = 'P0001'; END IF;
  v_ult := public._oc_ultima_entrega(p_operacao_id);
  IF v_ult IS NULL THEN
    RAISE EXCEPTION 'Sem entrega no financeiro: nao ha diferenca a explicar' USING ERRCODE = 'P0001'; END IF;

  IF p_tipo = 'ajuste_preco' THEN
    -- AJUSTE DE PRECO (decisao 1): o lote passa a 'total' com o valor exato, e a entrega do lote acompanha pela sincronizacao.
    -- Valor POSITIVO reduz a entrega (o comprador passa a dever menos); negativo aumenta.
    SELECT * INTO v_lote FROM public.zoo_operacao_lotes WHERE id = p_lote_id AND operacao_id = p_operacao_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Escolha o lote do ajuste de preco' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.lote_id = p_lote_id AND pt.origem = 'entrega'
                     AND pt.cancelada = false) THEN
      RAISE EXCEPTION 'Lote % sem entrega no financeiro', v_lote.ordem USING ERRCODE = 'P0001'; END IF;
    v_total := (public._oc_valor_do_lote(p_lote_id)->>'total')::numeric;
    v_novo := round(v_total - v_valor, 2);
    IF v_novo <= 0 THEN
      RAISE EXCEPTION 'O ajuste deixaria o lote % sem valor (atual %, ajuste %)', v_lote.ordem, v_total, v_valor USING ERRCODE = 'P0001'; END IF;
    v_x := public.oc_revalorar_lote(p_operacao_id, v_cli, v_op.versao, p_lote_id, v_novo, 'Ajuste de preço: ' || btrim(p_motivo));
    v_ver := (v_x->>'operacao_versao')::int;
    v_x := public.oc_sincronizar_entregas(p_operacao_id, v_ver, false);
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.tipo_operacao = '1-Entradas'
       AND pc.subcentro = public._oc_subcentro_venda(v_lote.categoria_negociada, false);
    v_nat := CASE WHEN v_valor > 0 THEN 'deducao' ELSE 'acrescimo' END;
    v_rotulo := format('Ajuste de preço · lote %s: %s → %s', v_lote.ordem, to_char(v_total, 'FM999G999G990D00'),
                       to_char(v_novo, 'FM999G999G990D00'));
    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
      descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, lote_id,
      sem_movimentacao_caixa)
    VALUES (v_cli, p_operacao_id, 'explicacao', v_nat, 'ajuste_preco', 1, 1, abs(v_valor), v_ult, btrim(p_motivo), false,
      v_op.contraparte_id, v_pc.id, v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, p_lote_id, true)
    RETURNING id INTO v_parte;
  ELSE
    IF p_tipo = 'desconto_comercial' THEN
      SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
       WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.ordem_exibicao = 5020 AND pc.tipo_operacao = '2-Saídas';
      v_nat := 'deducao'; v_rotulo := 'Desconto comercial';
    ELSIF p_tipo = 'devolucao_comprador' THEN
      SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
       WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.subcentro = 'Devolução de Adiantamento de Clientes';
      v_nat := 'obrigacao'; v_rotulo := 'Devolução ao comprador';
      IF p_vencimento IS NULL THEN RAISE EXCEPTION 'Informe o vencimento da devolucao' USING ERRCODE = 'P0001'; END IF;
    ELSE
      SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
       WHERE pc.id = p_plano_conta_id AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = v_cli);
      IF v_pc.id IS NULL THEN RAISE EXCEPTION 'Escolha a conta da explicacao' USING ERRCODE = 'P0001'; END IF;
      -- decisao 4: so' escopo pecuaria (nada vai para a fazenda Administrativo) e so' conta que compoe o DRE.
      IF v_pc.escopo_negocio IS DISTINCT FROM 'pecuaria' OR v_pc.compoe_dre IS NOT TRUE THEN
        RAISE EXCEPTION 'A conta % nao serve: a explicacao usa conta de pecuaria que compoe o DRE', v_pc.subcentro USING ERRCODE = 'P0001'; END IF;
      IF p_tipo = 'permuta_despesa' AND v_pc.tipo_operacao <> '2-Saídas' THEN
        RAISE EXCEPTION 'Permuta / outra despesa usa conta de saida' USING ERRCODE = 'P0001'; END IF;
      IF p_tipo = 'outra_receita' AND v_pc.tipo_operacao <> '1-Entradas' THEN
        RAISE EXCEPTION 'Outra receita usa conta de entrada' USING ERRCODE = 'P0001'; END IF;
      v_nat := CASE WHEN p_tipo = 'permuta_despesa' THEN 'obrigacao' ELSE 'acrescimo' END;
      v_rotulo := CASE WHEN p_tipo = 'permuta_despesa' THEN 'Permuta / outra despesa' ELSE 'Outra receita' END;
    END IF;
    IF v_pc.id IS NULL THEN RAISE EXCEPTION 'Conta da explicacao ausente do plano' USING ERRCODE = 'P0001'; END IF;
    v_tipo_op := v_pc.tipo_operacao;
    v_sinal := CASE WHEN v_tipo_op = '1-Entradas' THEN '1' ELSE '-1' END;
    v_smc := p_tipo <> 'devolucao_comprador';
    v_status := CASE WHEN v_smc THEN 'realizado' ELSE 'programado' END;
    v_venc := CASE WHEN v_smc THEN v_ult ELSE p_vencimento END;
    v_pag := CASE WHEN v_smc THEN v_ult ELSE NULL END;
    INSERT INTO public.financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
      favorecido_id, conta_bancaria_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
      macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, descricao, created_by, updated_by, safra_id)
    VALUES (
      v_cli, v_op.fazenda_id, v_valor, v_sinal, v_tipo_op, v_ult, v_pag, v_venc, to_char(v_ult, 'YYYY-MM'),
      v_op.contraparte_id, NULL, 'operacao_comercial', 'oc:explicacao:' || p_tipo, v_status, v_op.cenario, v_smc,
      v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, v_pc.id, v_rotulo || ' · ' || btrim(p_motivo),
      v_actor, v_actor, public.fn_safra_sugerida(v_cli, v_ult, v_pc.escopo_negocio))
    RETURNING id INTO v_tit;
    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
      descricao, incluso_no_total, favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
      financeiro_lancamento_id, sem_movimentacao_caixa)
    VALUES (v_cli, p_operacao_id, 'explicacao', v_nat, p_tipo, 1, 1, v_valor, v_venc, btrim(p_motivo), false,
      v_op.contraparte_id, v_pc.id, v_pc.macro_custo, v_pc.grupo_custo, v_pc.centro_custo, v_pc.subcentro, v_tit, v_smc)
    RETURNING id INTO v_parte;
  END IF;

  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'explicar_saldo',
    jsonb_build_object('tipo', p_tipo, 'valor', v_valor, 'lote_id', p_lote_id, 'plano_conta_id', v_pc.id, 'conta', v_pc.subcentro,
      'motivo', btrim(p_motivo), 'parte_id', v_parte, 'titulo_id', v_tit, 'competencia', v_ult, 'vencimento', p_vencimento,
      'lote_total_anterior', v_total, 'lote_total_novo', v_novo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1),
    v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'tipo', p_tipo, 'parte_id', v_parte,
    'titulo_id', v_tit, 'competencia', v_ult,
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
    'conta_corrente', public.oc_conta_corrente(p_operacao_id) - 'linhas' - 'explicacoes');
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de explicacao (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$fn$;
revoke all on function public.oc_explicar_saldo(uuid, integer, text, numeric, uuid, uuid, text, date, boolean) from public, anon;
grant execute on function public.oc_explicar_saldo(uuid, integer, text, numeric, uuid, uuid, text, date, boolean) to authenticated, service_role;

-- ═══ 5c. oc_desfazer_explicacao ═══
create or replace function public.oc_desfazer_explicacao(p_operacao_id uuid, p_versao_esperada integer, p_parte_id uuid,
  p_motivo text, p_simular boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(), '') = 'service_role');
  v_op public.zoo_operacoes_comerciais;
  v_pt public.zoo_operacao_partes;
  v_f public.financeiro_lancamentos_v2;
  v_total numeric; v_novo numeric; v_x jsonb; v_ver int; v_nova int; v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF NOT (v_is_service OR (v_actor IS NOT NULL AND (public.is_admin_agroinblue(v_actor)
          OR v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))))) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Informe o motivo para remover a explicacao' USING ERRCODE = 'P0001'; END IF;
  IF p_simular IS NOT TRUE AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_pt FROM public.zoo_operacao_partes
   WHERE id = p_parte_id AND operacao_id = p_operacao_id AND origem = 'explicacao' AND cancelada = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Explicacao nao encontrada nesta operacao' USING ERRCODE = 'P0001'; END IF;

  IF v_pt.componente = 'ajuste_preco' THEN
    -- desfaz o delta: deducao devolve o valor ao lote, acrescimo o retira
    v_total := (public._oc_valor_do_lote(v_pt.lote_id)->>'total')::numeric;
    v_novo := round(v_total + CASE WHEN v_pt.natureza = 'deducao' THEN v_pt.valor ELSE -v_pt.valor END, 2);
    IF v_novo <= 0 THEN RAISE EXCEPTION 'Desfazer deixaria o lote sem valor' USING ERRCODE = 'P0001'; END IF;
    v_x := public.oc_revalorar_lote(p_operacao_id, v_op.cliente_id, v_op.versao, v_pt.lote_id, v_novo,
                                    'Desfazer ajuste de preço: ' || btrim(p_motivo));
    v_ver := (v_x->>'operacao_versao')::int;
    v_x := public.oc_sincronizar_entregas(p_operacao_id, v_ver, false);
  ELSIF v_pt.financeiro_lancamento_id IS NOT NULL THEN
    SELECT * INTO v_f FROM public.financeiro_lancamentos_v2 WHERE id = v_pt.financeiro_lancamento_id FOR UPDATE;
    IF v_f.id IS NOT NULL AND v_f.cancelado IS NOT TRUE AND v_f.sem_movimentacao_caixa IS NOT TRUE AND (
         v_f.status_transacao IN ('realizado', 'conciliado') OR v_f.conciliado_em IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq WHERE lq.financeiro_lancamento_id = v_f.id AND lq.estornado IS NOT TRUE)) THEN
      RAISE EXCEPTION 'A devolucao ja foi paga: estorne o pagamento no Financeiro antes de remover' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = btrim(p_motivo),
           updated_at = now(), updated_by = v_actor
     WHERE id = v_pt.financeiro_lancamento_id AND cancelado IS NOT TRUE;
  END IF;
  UPDATE public.zoo_operacao_partes
     SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = btrim(p_motivo), updated_at = now()
   WHERE id = p_parte_id;

  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'desfazer_explicacao', to_jsonb(v_pt),
    jsonb_build_object('parte_id', p_parte_id, 'componente', v_pt.componente, 'valor', v_pt.valor, 'motivo', btrim(p_motivo),
      'titulo_id', v_pt.financeiro_lancamento_id, 'lote_total_anterior', v_total, 'lote_total_novo', v_novo,
      'versao_anterior', v_ver, 'versao_nova', v_ver + 1),
    v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'parte_id', p_parte_id,
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
    'conta_corrente', public.oc_conta_corrente(p_operacao_id) - 'linhas' - 'explicacoes');
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de desfazer explicacao (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$fn$;
revoke all on function public.oc_desfazer_explicacao(uuid, integer, uuid, text, boolean) from public, anon;
grant execute on function public.oc_desfazer_explicacao(uuid, integer, uuid, text, boolean) to authenticated, service_role;

-- ═══ 6. oc_conta_corrente (corpo integral novo) ═══
create or replace function public.oc_conta_corrente(p_operacao_id uuid)
returns jsonb
language sql stable security invoker
set search_path = public
as $fn$
  WITH op AS (
    SELECT o.* FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id
  ), vivas AS (
    SELECT pt.*, f.valor AS f_valor, f.data_competencia AS f_comp, f.data_pagamento AS f_pag, f.data_vencimento AS f_venc,
           f.status_transacao AS f_status, f.conciliado_em AS f_conc_em, f.conta_bancaria_id AS f_conta, f.descricao AS f_desc,
           f.subcentro AS f_sub, f.plano_conta_id AS f_plano,
           (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL) AS f_real,
           EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL) AS f_cbi
      FROM public.zoo_operacao_partes pt
      LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
     WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false
       AND (pt.origem IN ('entrega', 'explicacao') OR pt.componente = 'recebimento')
       AND (pt.financeiro_lancamento_id IS NULL OR f.id IS NOT NULL)
  ), lin AS (
    -- ENTREGA: o gado que saiu. No caixa da fazenda ela ABATE (falta receber).
    SELECT 'entrega'::text AS tipo, NULL::text AS subtipo, v.f_comp AS data, 0 AS ordem_dia, v.id AS parte_id,
           v.financeiro_lancamento_id AS lancamento_id, lo.ordem AS lote_ordem, lo.categoria_negociada AS categoria,
           z.quantidade AS cab, v.f_desc AS descricao, v.f_plano AS plano_conta_id, NULL::uuid AS conta_bancaria_id,
           -round(v.f_valor, 2) AS mov_entrega, NULL::numeric AS mov_recebido, 'sem_caixa'::text AS status, true AS no_saldo,
           -round(v.f_valor, 2) AS efeito, 0::numeric AS explicado, 0::numeric AS intencao, NULL::text AS motivo
      FROM vivas v
      LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = v.lote_id
      LEFT JOIN public.lancamentos z ON z.id = v.entrega_movimentacao_id
     WHERE v.origem = 'entrega'
    UNION ALL
    -- RECEBIMENTO: dinheiro do comprador. SOMA quando realizado; programado fica fora do saldo. D6: status e' o do dado.
    SELECT 'recebimento', NULL, coalesce(v.f_pag, v.f_venc, v.f_comp), 1, v.id, v.financeiro_lancamento_id, NULL, NULL, NULL,
           v.f_desc, v.f_plano, v.f_conta, NULL, round(v.f_valor, 2),
           CASE WHEN v.f_cbi THEN 'conciliado'
                WHEN v.f_status IN ('programado', 'agendado') THEN 'programado'
                WHEN v.f_conta IS NULL THEN 'sem_conta_bancaria'
                ELSE 'realizado' END,
           v.f_real, CASE WHEN v.f_real THEN round(v.f_valor, 2) ELSE 0 END, 0, 0, NULL
      FROM vivas v
     WHERE v.componente = 'recebimento' AND v.origem <> 'explicacao'
    UNION ALL
    -- EXPLICACAO: soma quando reduz o que falta receber (desconto, permuta, ajuste que reduz), abate quando aumenta (outra
    -- receita, devolucao paga, ajuste que aumenta). O AJUSTE nao move o saldo corrido — a entrega do lote ja' esta' no valor
    -- novo —, mas conta como explicado.
    SELECT 'explicacao', v.componente, coalesce(CASE WHEN v.componente = 'devolucao_comprador' THEN coalesce(v.f_pag, v.f_venc) END,
             v.f_comp, v.data_vencimento), 2, v.id, v.financeiro_lancamento_id, lo.ordem, lo.categoria_negociada, NULL,
           coalesce(v.f_desc, v.descricao), coalesce(v.f_plano, v.plano_conta_id), v.f_conta,
           CASE v.componente WHEN 'desconto_comercial' THEN round(v.valor, 2) WHEN 'permuta_despesa' THEN round(v.valor, 2)
                             WHEN 'outra_receita' THEN -round(v.valor, 2) END,
           CASE WHEN v.componente = 'devolucao_comprador' THEN -round(v.valor, 2) END,
           CASE WHEN v.componente = 'devolucao_comprador' THEN
                  CASE WHEN v.f_cbi THEN 'conciliado' WHEN v.f_real THEN 'realizado' ELSE 'programado' END
                WHEN v.componente = 'ajuste_preco' THEN 'ajuste' ELSE 'sem_caixa' END,
           NOT (v.componente = 'devolucao_comprador' AND NOT coalesce(v.f_real, false)),
           CASE v.componente WHEN 'desconto_comercial' THEN round(v.valor, 2) WHEN 'permuta_despesa' THEN round(v.valor, 2)
                             WHEN 'outra_receita' THEN -round(v.valor, 2)
                             WHEN 'devolucao_comprador' THEN CASE WHEN v.f_real THEN -round(v.valor, 2) ELSE 0 END
                             ELSE 0 END,
           CASE v.componente WHEN 'desconto_comercial' THEN round(v.valor, 2) WHEN 'permuta_despesa' THEN round(v.valor, 2)
                             WHEN 'outra_receita' THEN -round(v.valor, 2)
                             WHEN 'devolucao_comprador' THEN CASE WHEN v.f_real THEN -round(v.valor, 2) ELSE 0 END
                             WHEN 'ajuste_preco' THEN CASE WHEN v.natureza = 'deducao' THEN round(v.valor, 2) ELSE -round(v.valor, 2) END
                             ELSE 0 END,
           -- intencao: o que a linha explica, mesmo a devolucao ainda programada (o saldo so' a ve' paga)
           CASE v.componente WHEN 'desconto_comercial' THEN round(v.valor, 2) WHEN 'permuta_despesa' THEN round(v.valor, 2)
                             WHEN 'outra_receita' THEN -round(v.valor, 2) WHEN 'devolucao_comprador' THEN -round(v.valor, 2)
                             WHEN 'ajuste_preco' THEN CASE WHEN v.natureza = 'deducao' THEN round(v.valor, 2) ELSE -round(v.valor, 2) END
                             ELSE 0 END,
           v.descricao
      FROM vivas v
      LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = v.lote_id
     WHERE v.origem = 'explicacao'
  ), acum AS (
    SELECT lin.*, sum(efeito) OVER (ORDER BY data, ordem_dia, parte_id) AS saldo FROM lin
  ), tot AS (
    SELECT coalesce(-sum(mov_entrega) FILTER (WHERE tipo = 'entrega'), 0) AS entregue,
           coalesce(sum(cab) FILTER (WHERE tipo = 'entrega'), 0) AS cab_entregue,
           coalesce(sum(mov_recebido) FILTER (WHERE tipo = 'recebimento' AND no_saldo), 0) AS recebido,
           coalesce(sum(mov_recebido) FILTER (WHERE tipo = 'recebimento' AND NOT no_saldo), 0) AS programado,
           coalesce(-sum(mov_recebido) FILTER (WHERE subtipo = 'devolucao_comprador' AND no_saldo), 0) AS devolvido,
           coalesce(sum(efeito), 0) AS saldo,
           coalesce(sum(explicado), 0) AS explicado_efetivo,
           coalesce(sum(intencao), 0) AS explicado,
           count(*) FILTER (WHERE tipo = 'recebimento' AND status = 'sem_conta_bancaria') AS sem_conta
      FROM lin
  ), pend AS (
    SELECT count(*) AS saidas_sem_entrega
      FROM public.zoo_operacao_movimentacoes m
      JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
     WHERE m.operacao_id = p_operacao_id AND m.operacao_lote_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                        WHERE pt.entrega_movimentacao_id = m.movimentacao_id AND pt.cancelada = false)
  )
  SELECT jsonb_build_object(
    'operacao_id', op.id, 'modelo', op.modelo_financeiro, 'versao', op.versao, 'status_comercial', op.status_comercial,
    'valor_acordado', op.valor_acordado,
    'entregue', round(tot.entregue, 2), 'cab_entregue', tot.cab_entregue,
    'recebido', round(tot.recebido, 2), 'programado', round(tot.programado, 2), 'devolvido', round(tot.devolvido, 2),
    'saldo', round(tot.saldo, 2),
    -- saldo_a_explicar = a diferenca antes de qualquer explicacao; falta_explicar = o que ainda nao tem explicacao
    'explicado', round(tot.explicado, 2),
    'saldo_a_explicar', round(tot.saldo - tot.explicado_efetivo, 2),
    'falta_explicar', round(tot.saldo - tot.explicado_efetivo + tot.explicado, 2),
    'situacao', CASE WHEN round(tot.saldo, 2) < 0 THEN 'falta_receber' WHEN round(tot.saldo, 2) > 0 THEN 'adiantado' ELSE 'quitado' END,
    'a_entregar', round(coalesce(op.valor_acordado, 0) - tot.entregue, 2),
    'ultima_entrega', public._oc_ultima_entrega(p_operacao_id),
    'recebimentos_sem_conta_bancaria', tot.sem_conta,
    'saidas_sem_entrega', pend.saidas_sem_entrega,
    'linhas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'tipo', a.tipo, 'subtipo', a.subtipo, 'data', a.data, 'parte_id', a.parte_id, 'lancamento_id', a.lancamento_id,
        'lote_ordem', a.lote_ordem, 'categoria', a.categoria, 'cab', a.cab, 'descricao', a.descricao,
        'conta_ordem', pc.ordem_exibicao, 'conta', pc.subcentro,
        'banco', CASE WHEN a.conta_bancaria_id IS NULL THEN NULL
                      ELSE coalesce(cb.nome_exibicao, cb.nome_conta) END,
        'mov_entrega', a.mov_entrega, 'mov_recebido', a.mov_recebido, 'status', a.status, 'no_saldo', a.no_saldo,
        'saldo', round(a.saldo, 2), 'motivo', a.motivo)
        ORDER BY a.data, a.ordem_dia, a.parte_id)
      FROM acum a
      LEFT JOIN public.financeiro_plano_contas pc ON pc.id = a.plano_conta_id
      LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = a.conta_bancaria_id), '[]'::jsonb),
    'explicacoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'parte_id', a.parte_id, 'tipo', a.subtipo, 'lote_ordem', a.lote_ordem, 'conta_ordem', pc.ordem_exibicao,
        'conta', pc.subcentro, 'motivo', a.motivo, 'valor', a.intencao, 'status', a.status)
        ORDER BY a.data, a.parte_id)
      FROM acum a LEFT JOIN public.financeiro_plano_contas pc ON pc.id = a.plano_conta_id
      WHERE a.tipo = 'explicacao'), '[]'::jsonb))
  FROM op, tot, pend;
$fn$;
revoke all on function public.oc_conta_corrente(uuid) from public, anon;
grant execute on function public.oc_conta_corrente(uuid) to authenticated, service_role;

-- ═══ 7. estado da OC no modelo conta corrente ═══
create or replace function public._oc_conta_corrente_base(p_operacao_id uuid)
returns table (base numeric, liquidado numeric)
language sql stable
set search_path = public
as $fn$
  -- base = o que o comprador deve no total; liquidado = o que ele pagou liquido de devolucao. Base - liquidado = -saldo.
  SELECT coalesce(sum(f.valor) FILTER (WHERE pt.origem = 'entrega'), 0)
         + coalesce(sum(f.valor) FILTER (WHERE pt.componente = 'outra_receita'), 0)
         - coalesce(sum(f.valor) FILTER (WHERE pt.componente IN ('desconto_comercial', 'permuta_despesa')), 0),
         coalesce(sum(f.valor) FILTER (WHERE pt.componente = 'recebimento'
                    AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL)), 0)
         - coalesce(sum(f.valor) FILTER (WHERE pt.componente = 'devolucao_comprador'
                    AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL)), 0)
    FROM public.zoo_operacoes_comerciais o
    LEFT JOIN public.zoo_operacao_partes pt ON pt.operacao_id = o.id AND pt.cancelada = false
    LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
   WHERE o.id = p_operacao_id AND o.modelo_financeiro = 'conta_corrente'
   GROUP BY o.id;
$fn$;
revoke all on function public._oc_conta_corrente_base(uuid) from public, anon;
grant execute on function public._oc_conta_corrente_base(uuid) to authenticated, service_role;

do $v$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_viewdef('public.vw_oc_operacao_liquidacao'::regclass);
  v_a := $a$            b.base_origem AS base_origem_antiga
           FROM ((op p
             LEFT JOIN liq ON ((liq.operacao_id = p.operacao_id)))
             LEFT JOIN LATERAL _oc_base_divida_operacao(p.operacao_id) b(base, base_origem) ON (true))$a$;
  v_b := $b$            b.base_origem AS base_origem_antiga,
            cc.base AS base_cc,
            cc.liquidado AS liq_cc
           FROM (((op p
             LEFT JOIN liq ON ((liq.operacao_id = p.operacao_id)))
             LEFT JOIN LATERAL _oc_base_divida_operacao(p.operacao_id) b(base, base_origem) ON (true))
             LEFT JOIN LATERAL _oc_conta_corrente_base(p.operacao_id) cc(base, liquidado) ON (true))$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do FROM da view nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  v_a := $a$            t.base_origem_antiga,
                CASE
                    WHEN t.pelo_lado THEN t.obrig_lado
                    ELSE t.base_antiga
                END AS base_ef,
                CASE
                    WHEN t.pelo_lado THEN t.liq_lado
                    ELSE t.liq_total
                END AS liq_ef$a$;
  v_b := $b$            t.base_origem_antiga,
            t.base_cc,
                CASE
                    WHEN (t.base_cc IS NOT NULL) THEN t.base_cc
                    WHEN t.pelo_lado THEN t.obrig_lado
                    ELSE t.base_antiga
                END AS base_ef,
                CASE
                    WHEN (t.base_cc IS NOT NULL) THEN t.liq_cc
                    WHEN t.pelo_lado THEN t.liq_lado
                    ELSE t.liq_total
                END AS liq_ef$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do f da view nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  v_a := $a$            WHEN pelo_lado THEN 'compromisso_lado'::text$a$;
  v_b := $b$            WHEN (base_cc IS NOT NULL) THEN 'conta_corrente'::text
            WHEN pelo_lado THEN 'compromisso_lado'::text$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do base_origem da view nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  v_a := $a$            WHEN pelo_lado THEN liq_lado_mon$a$;
  v_b := $b$            WHEN (base_cc IS NOT NULL) THEN liq_ef
            WHEN pelo_lado THEN liq_lado_mon$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do monetario da view nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  v_a := $a$            WHEN pelo_lado THEN liq_lado_nmon$a$;
  v_b := $b$            WHEN (base_cc IS NOT NULL) THEN (0)::numeric
            WHEN pelo_lado THEN liq_lado_nmon$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do nao monetario da view nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);
  execute 'create or replace view public.vw_oc_operacao_liquidacao with (security_invoker = true) as ' || v_def;
end $v$;

-- ═══ 8a. o rol do cancelamento no modelo conta corrente (le e, fora da simulacao, executa) ═══
create or replace function public._oc_cancelar_conta_corrente(p_operacao_id uuid, p_motivo text, p_simular boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_entregas jsonb; v_explic jsonb; v_receb jsonb; v_saidas jsonb; v_comps jsonb; v_bloq jsonb := '[]'::jsonb;
  r record; v_plano_orig uuid; v_mov_orig uuid; v_l public.financeiro_lancamentos_v2; v_l2 public.financeiro_lancamentos_v2;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('parte_id', pt.id, 'titulo_id', f.id, 'data', f.data_competencia,
           'lote_ordem', lo.ordem, 'valor', f.valor, 'conta', f.subcentro) ORDER BY f.data_competencia, lo.ordem), '[]')
    INTO v_entregas
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
    LEFT JOIN public.zoo_operacao_lotes lo ON lo.id = pt.lote_id
   WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'entrega' AND pt.cancelada = false;

  SELECT coalesce(jsonb_agg(jsonb_build_object('parte_id', pt.id, 'tipo', pt.componente, 'titulo_id', f.id, 'valor', pt.valor,
           'conta', pt.subcentro, 'motivo', pt.descricao,
           'pago', coalesce(f.sem_movimentacao_caixa IS NOT TRUE AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL), false))
           ORDER BY pt.created_at), '[]')
    INTO v_explic
    FROM public.zoo_operacao_partes pt
    LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
   WHERE pt.operacao_id = p_operacao_id AND pt.origem = 'explicacao' AND pt.cancelada = false;

  -- recebimentos: o vinculado volta a' conta registrada no `vincular_recebimento`; o nascido na OC (programado pelo
  -- "Programar recebimento futuro") some se ainda programado, e fica em Adiantamento de Clientes, manual, se ja' pago.
  SELECT coalesce(jsonb_agg(jsonb_build_object('parte_id', x.parte_id, 'titulo_id', x.titulo_id, 'data', x.data, 'valor', x.valor,
           'conta_atual', x.conta_atual, 'plano_original', x.plano_orig, 'conta_original', po.subcentro,
           'acao', CASE WHEN x.plano_orig IS NOT NULL THEN 'volta_para_conta_original'
                        WHEN x.realizado THEN 'fica_em_adiantamento_manual'
                        ELSE 'cancela_programado' END) ORDER BY x.data), '[]')
    INTO v_receb
    FROM (SELECT pt.id AS parte_id, f.id AS titulo_id, coalesce(f.data_pagamento, f.data_vencimento) AS data, f.valor,
                 f.subcentro AS conta_atual,
                 (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL) AS realizado,
                 (SELECT (e.dados_anteriores->'lancamento'->>'plano_conta_id')::uuid FROM public.zoo_operacao_eventos e
                   WHERE e.operacao_id = p_operacao_id AND e.acao = 'vincular_recebimento' AND e.detalhes->>'lancamento_id' = f.id::text
                   ORDER BY e.created_at DESC LIMIT 1) AS plano_orig
            FROM public.zoo_operacao_partes pt
            JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
           WHERE pt.operacao_id = p_operacao_id AND pt.componente = 'recebimento' AND pt.origem <> 'explicacao'
             AND pt.cancelada = false) x
    LEFT JOIN public.financeiro_plano_contas po ON po.id = x.plano_orig;

  SELECT coalesce(jsonb_agg(jsonb_build_object('vinculo_id', m.id, 'lancamento_id', l.id, 'data', l.data, 'cab', l.quantidade,
           'categoria', l.categoria, 'origem', m.origem) ORDER BY l.data), '[]')
    INTO v_saidas
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
   WHERE m.operacao_id = p_operacao_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('compromisso_id', c.id, 'componente', c.componente, 'valor', c.valor_total,
           'status', c.status) ORDER BY c.created_at), '[]')
    INTO v_comps
    FROM public.zoo_operacao_compromissos c WHERE c.operacao_id = p_operacao_id AND c.status <> 'cancelado';

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_explic) e WHERE (e->>'pago')::boolean) THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'devolucao_paga',
      'descricao', 'Ha devolucao ao comprador ja paga: estorne o pagamento no Financeiro antes de cancelar.');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_saidas) s WHERE s->>'origem' = 'registrada') THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'saida_registrada',
      'descricao', 'Ha saida registrada pela OC: estorne-a na aba Entrega antes de cancelar.');
  END IF;

  IF p_simular IS NOT TRUE THEN
    IF jsonb_array_length(v_bloq) > 0 THEN
      RAISE EXCEPTION 'Cancelamento bloqueado: %', (SELECT string_agg(b->>'descricao', ' ') FROM jsonb_array_elements(v_bloq) b)
        USING ERRCODE = 'P0001'; END IF;

    -- entregas e explicacoes: titulo cancelado (nunca apagado) e parte cancelada
    UPDATE public.financeiro_lancamentos_v2 f
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = 'Cancelamento da OC: ' || p_motivo,
           updated_at = now(), updated_by = v_actor
      FROM public.zoo_operacao_partes pt
     WHERE pt.financeiro_lancamento_id = f.id AND pt.operacao_id = p_operacao_id AND pt.cancelada = false
       AND pt.origem IN ('entrega', 'explicacao') AND f.cancelado IS NOT TRUE;
    UPDATE public.zoo_operacao_partes
       SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = 'Cancelamento da OC: ' || p_motivo,
           updated_at = now()
     WHERE operacao_id = p_operacao_id AND cancelada = false AND origem IN ('entrega', 'explicacao');

    -- recebimentos
    FOR r IN SELECT * FROM jsonb_to_recordset(v_receb) AS x(parte_id uuid, titulo_id uuid, plano_original uuid, acao text) LOOP
      UPDATE public.zoo_operacao_partes
         SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = 'Cancelamento da OC: ' || p_motivo,
             updated_at = now()
       WHERE id = r.parte_id;
      UPDATE public.zoo_operacao_liquidacoes
         SET estornado = true, estornado_em = now(), estornado_por = v_actor,
             estorno_motivo = 'Cancelamento da OC: ' || p_motivo, updated_at = now(), updated_by = v_actor
       WHERE origem = 'financeiro' AND financeiro_lancamento_id = r.titulo_id AND estornado IS NOT TRUE;
      SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = r.titulo_id FOR UPDATE;
      IF r.acao = 'volta_para_conta_original' THEN
        SELECT (e.dados_anteriores->'lancamento'->>'movimentacao_rebanho_id')::uuid INTO v_mov_orig FROM public.zoo_operacao_eventos e
         WHERE e.operacao_id = p_operacao_id AND e.acao = 'vincular_recebimento' AND e.detalhes->>'lancamento_id' = r.titulo_id::text
         ORDER BY e.created_at DESC LIMIT 1;
        UPDATE public.financeiro_lancamentos_v2
           SET plano_conta_id = r.plano_original, movimentacao_rebanho_id = v_mov_orig, updated_at = now(), updated_by = v_actor
         WHERE id = r.titulo_id;
      ELSIF r.acao = 'fica_em_adiantamento_manual' THEN
        UPDATE public.financeiro_lancamentos_v2
           SET origem_lancamento = 'manual', origem_tipo = NULL, updated_at = now(), updated_by = v_actor
         WHERE id = r.titulo_id;
      ELSE
        UPDATE public.financeiro_lancamentos_v2
           SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = 'Cancelamento da OC: ' || p_motivo,
               updated_at = now(), updated_by = v_actor
         WHERE id = r.titulo_id;
      END IF;
      -- o hash de importacao nao muda (mesmo cuidado do vincular)
      UPDATE public.financeiro_lancamentos_v2 SET hash_importacao = v_l.hash_importacao
       WHERE id = r.titulo_id AND hash_importacao IS DISTINCT FROM v_l.hash_importacao;
      SELECT * INTO v_l2 FROM public.financeiro_lancamentos_v2 WHERE id = r.titulo_id;
      IF v_l2.hash_importacao IS DISTINCT FROM v_l.hash_importacao OR v_l2.valor IS DISTINCT FROM v_l.valor
         OR v_l2.data_pagamento IS DISTINCT FROM v_l.data_pagamento OR v_l2.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id THEN
        RAISE EXCEPTION 'Soltar o recebimento % mudaria valor, pagamento, conta bancaria ou hash; abortado', r.titulo_id USING ERRCODE = 'P0001'; END IF;
    END LOOP;

    -- compromissos, programacoes e parcelas da OC (o "Programar recebimento futuro")
    UPDATE public.zoo_operacao_parcelas_programacao pp SET status = 'cancelada', updated_at = now()
      FROM public.zoo_operacao_programacoes pr, public.zoo_operacao_compromissos c
     WHERE pp.programacao_id = pr.id AND pr.compromisso_id = c.id AND c.operacao_id = p_operacao_id AND pp.status <> 'cancelada';
    UPDATE public.zoo_operacao_programacoes pr SET status = 'cancelada'
      FROM public.zoo_operacao_compromissos c
     WHERE pr.compromisso_id = c.id AND c.operacao_id = p_operacao_id AND pr.status <> 'cancelada';
    UPDATE public.zoo_operacao_compromissos SET status = 'cancelado', updated_at = now()
     WHERE operacao_id = p_operacao_id AND status <> 'cancelado';

    -- saidas adotadas: so' o vinculo sai; a saida continua no zootecnico como estava antes de ser adotada
    FOR r IN SELECT m.* FROM public.zoo_operacao_movimentacoes m WHERE m.operacao_id = p_operacao_id AND m.origem = 'adotada' LOOP
      DELETE FROM public.zoo_operacao_movimentacoes WHERE id = r.id;
      INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
      VALUES (v_op.cliente_id, p_operacao_id, 'desvincular_movimentacao',
        (SELECT to_jsonb(r)), jsonb_build_object('lancamento_id', r.movimentacao_id, 'lote_id', r.operacao_lote_id,
          'motivo', 'Cancelamento da OC: ' || p_motivo, 'desvinculado_por', v_actor, 'desvinculado_em', now()), v_actor, 'rpc');
    END LOOP;
  END IF;

  RETURN jsonb_build_object('modelo', 'conta_corrente', 'entregas', v_entregas, 'explicacoes', v_explic,
    'recebimentos', v_receb, 'saidas', v_saidas, 'compromissos', v_comps, 'bloqueios', v_bloq);
END;
$fn$;
revoke all on function public._oc_cancelar_conta_corrente(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.oc_cancelar_rol(p_operacao_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR (v_actor IS NOT NULL AND (public.is_admin_agroinblue(v_actor)
          OR v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))))) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao' USING ERRCODE = '42501'; END IF;
  IF v_op.modelo_financeiro <> 'conta_corrente' THEN
    RETURN jsonb_build_object('modelo', v_op.modelo_financeiro);
  END IF;
  RETURN public._oc_cancelar_conta_corrente(p_operacao_id, NULL, true);
END;
$fn$;
revoke all on function public.oc_cancelar_rol(uuid) from public, anon;
grant execute on function public.oc_cancelar_rol(uuid) to authenticated, service_role;

-- ═══ 8b. o ramo no oc_cancelar ═══
do $c$
declare v_def text; v_a text; v_b text;
begin
  v_def := pg_get_functiondef('public.oc_cancelar'::regproc);
  v_a := $a$  v_mov_ativa boolean; v_adotada boolean; v_titulo_ativo boolean; v_liq_ativa boolean; v_dominios text;$a$;
  v_b := $b$  v_mov_ativa boolean; v_adotada boolean; v_titulo_ativo boolean; v_liq_ativa boolean; v_dominios text; v_cc jsonb;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora da declaracao do cancelar nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                   JOIN public.lancamentos l ON l.id = m.movimentacao_id
                  WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE AND m.origem = 'registrada') INTO v_mov_ativa;$a$;
  v_b := $b$  -- OC-VENDA-ENTREGAS-01c (decisao 2): no modelo conta corrente o cancelamento desfaz o proprio financeiro antes das
  -- travas — cancela entregas e explicacoes, solta os recebimentos e desvincula as saidas adotadas. O rol e' `oc_cancelar_rol`.
  IF v_op.modelo_financeiro = 'conta_corrente' THEN
    v_cc := public._oc_cancelar_conta_corrente(p_operacao_id, btrim(p_motivo), false);
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                   JOIN public.lancamentos l ON l.id = m.movimentacao_id
                  WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE AND m.origem = 'registrada') INTO v_mov_ativa;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora das travas do cancelar nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  -- a parte CANCELADA com titulo vivo e' lancamento solto (desvinculado, recebimento liberado): nao trava o cancelamento
  v_a := $a$                  WHERE p.operacao_id = p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE) INTO v_titulo_ativo;$a$;
  v_b := $b$                  WHERE p.operacao_id = p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE
                    AND p.cancelada = false) INTO v_titulo_ativo;$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do titulo ativo do cancelar nao casa 1x'; end if;
  v_def := replace(v_def, v_a, v_b);

  v_a := $a$          jsonb_build_object('motivo', p_motivo, 'inconsistencia_operacional', false), v_actor, 'rpc');$a$;
  v_b := $b$          jsonb_build_object('motivo', p_motivo, 'inconsistencia_operacional', false, 'conta_corrente', v_cc), v_actor, 'rpc');$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'OC-VENDA-ENTREGAS-01c: ancora do evento do cancelar nao casa 1x'; end if;
  execute replace(v_def, v_a, v_b);
end $c$;

-- ═══ 9. oc_programar_recebimento ═══
create or replace function public.oc_programar_recebimento(p_operacao_id uuid, p_versao_esperada integer, p_valor numeric,
  p_vencimento date, p_conta_bancaria_id uuid default null, p_simular boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $fn$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_x jsonb; v_comp uuid; v_prog uuid; v_parc uuid; v_ver int; v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.modelo_financeiro <> 'conta_corrente' THEN
    RAISE EXCEPTION 'Programar recebimento futuro so existe no modelo conta corrente' USING ERRCODE = 'P0001'; END IF;
  IF p_valor IS NULL OR round(p_valor, 2) <= 0 THEN RAISE EXCEPTION 'Informe o valor do recebimento' USING ERRCODE = 'P0001'; END IF;
  IF p_vencimento IS NULL THEN RAISE EXCEPTION 'Informe o vencimento do recebimento' USING ERRCODE = 'P0001'; END IF;
  -- o fluxo que existe, sem lote: compromisso em Adiantamento de Clientes -> programacao de 1 parcela -> titulo programado
  v_x := public.oc_criar_compromisso(p_operacao_id, CASE WHEN p_simular THEN v_op.versao ELSE p_versao_esperada END,
           jsonb_build_object('natureza', 'principal', 'componente', 'recebimento', 'valor_total', round(p_valor, 2),
             'favorecido_id', v_op.contraparte_id, 'subcentro', 'Adiantamento de Clientes',
             'descricao', 'Recebimento programado'));
  v_comp := (v_x->'compromisso'->>'id')::uuid; v_ver := (v_x->>'operacao_versao')::int;
  v_x := public.oc_programar_compromisso(p_operacao_id, v_ver, v_comp,
           jsonb_build_object('condicoes', 'recebimento futuro da conta corrente', 'parcelas', jsonb_build_array(
             jsonb_build_object('sequencia', 1, 'valor', round(p_valor, 2), 'vencimento', p_vencimento,
                                'conta_bancaria_id', p_conta_bancaria_id))));
  v_prog := (v_x->'programacao'->>'id')::uuid; v_ver := (v_x->>'operacao_versao')::int;
  v_parc := (v_x->'parcelas'->0->>'id')::uuid;
  v_x := public.oc_materializar_programacao(p_operacao_id, v_ver, v_prog, v_parc);
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'compromisso_id', v_comp,
    'programacao_id', v_prog, 'parcela_id', v_parc, 'titulo', v_x->'titulo',
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END);
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de recebimento programado (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$fn$;
revoke all on function public.oc_programar_recebimento(uuid, integer, numeric, date, uuid, boolean) from public, anon;
grant execute on function public.oc_programar_recebimento(uuid, integer, numeric, date, uuid, boolean) to authenticated, service_role;

-- ═══ guardas de destino ═══
do $g$
declare r record;
begin
  for r in select * from (values
    ('oc_revalorar_lote', '0b59e2ee318fa08452a526eef3fbe4fa'),
    ('oc_sincronizar_liquidacao_de_financeiro', '208b60e1bbc3b0d7acbd898ac309659d'),
    ('oc_cancelar', 'fec8f7bc3540617265e23740e5d249b3')) v(fn, h)
  loop
    if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = r.fn and md5(prosrc) = r.h) then
      raise exception 'OC-VENDA-ENTREGAS-01c: % com destino inesperado', r.fn;
    end if;
  end loop;
  if not exists (select 1 from pg_class where oid = 'public.vw_oc_operacao_liquidacao'::regclass
                   and 'security_invoker=true' = any (reloptions)) then
    raise exception 'OC-VENDA-ENTREGAS-01c: a view de estado perdeu security_invoker'; end if;
  if has_function_privilege('authenticated', 'public._oc_cancelar_conta_corrente(uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.oc_explicar_saldo(uuid, integer, text, numeric, uuid, uuid, text, date, boolean)', 'execute') then
    raise exception 'OC-VENDA-ENTREGAS-01c: ACL das funcoes novas aberta'; end if;
end $g$;
