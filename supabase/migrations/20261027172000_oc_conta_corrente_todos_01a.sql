-- 20261027172000_oc_conta_corrente_todos_01a.sql
-- OC-CONTA-CORRENTE-TODOS-01a — A COMPRA NO MODELO CONTA CORRENTE (PR 1 de 5; decisoes do Gabriel, 29/09/2026; mock
-- `docs/mocks/oc_conta_corrente_compra_abate_mock_v1.html`, md5 334a4e0d, parte COMPRA). ADR-2026-21 estendida a compra.
--
-- REGRA DA COMPRA (espelho da venda):
--   ENTRADA do gado = titulo de custo SEM CAIXA em 15010/15020 (pelo sexo), 2-Saidas, competencia = pagamento = data da entrada,
--     valor do lote, descricao "Compra NNN SIGLA" (mesmo formato da venda).
--   PAGAMENTO = o titulo de caixa passa a "Adiantamento a Fornecedores" (5005, fora do DRE; na tela "Pagamento de compras").
--     Valor, datas, conta bancaria e hash preservados.
--   EXTRATO pelo caixa da fazenda, ESPELHO do da venda: entrada POSITIVA, pagamento NEGATIVO, saldo = entrada - pago;
--     positivo 'falta_pagar', negativo 'adiantado', zero 'quitado'. `oc_conta_corrente` calcula tudo no sinal da venda e
--     VIRA O SINAL NA SAIDA (x -1) so' na compra — a venda sai byte a byte igual (provado por md5 antes x depois).
--   EXPLICAR na compra: ajuste de preco (desconto do fornecedor, muda o lote e a entrada), devolucao do fornecedor (ENTRADA de
--     caixa em 5005, programada, com vencimento), permuta / outra despesa. Desconto comercial e outra receita sao da venda.
--   PROGRAMAR PAGAMENTO: compromisso sem lote em 5005. CANCELAR: igual a venda, mas na compra so' cancela os compromissos
--     da conta corrente (componente 'recebimento'); frete, comissao e ICMS ficam — sao despesas pagas a terceiros.
--   DESPESAS DA OPERACAO (frete, comissao, ICMS): titulos comuns, fora do saldo; `oc_conta_corrente` as devolve em `despesas`
--     SO' fora da venda (a venda nao ganha chave nova).
--
-- COMPONENTES REAPROVEITADOS, sem catalogo novo: a parte do pagamento e' `principal/recebimento` (o nome e' da venda, o
-- papel e' o mesmo: o dinheiro da contraparte) e a devolucao do fornecedor e' `obrigacao/devolucao_comprador`. A tela
-- rotula pelo tipo. O evento continua `vincular_recebimento` — e' ele que o cancelar le para devolver a conta original.
--
-- PECAS NOVAS (espelho e regra por tipo, EXECUTE so' authenticated e service_role):
--   `_oc_subcentro_compra(categoria)` — ESPELHO de `subcentroCompraPorCategoria` (src/hooks/useOperacaoLiquidacao.ts), com teste
--     que le este arquivo (src/hooks/subcentroCompraEspelho.test.ts): femeas -> Fêmeas, demais categorias validas -> Machos.
--   `_oc_cc_direcao(tipo)`, `_oc_cc_conta_dinheiro(tipo)`, `_oc_cc_conta_entrega(tipo, categoria)`, `_oc_cc_verbo(tipo)`.
-- PATCHES GUARDADOS POR md5 (origem, cada ancora casando o numero esperado de vezes, destino):
--   oc_sincronizar_entregas, _oc_vincular_recebimento, oc_vincular_lancamento, _oc_vinculo_mapa (linha 5005 da compra),
--   oc_recebimentos_vinculaveis, oc_conta_corrente, oc_explicar_saldo, oc_programar_recebimento, _oc_cancelar_conta_corrente.
-- SEM MUDANCA (ja' servem a compra): _oc_conta_corrente_base (soma em modulo), oc_desfazer_explicacao, oc_cancelar.
-- ⚠ ABATE CONTINUA RECUSADO em todas (e' o PR 2); boitel continua fora.

create or replace function public._oc_subcentro_compra(p_categoria text)
returns text
language sql
immutable
set search_path = public
as $fn$
  -- Espelho de subcentroCompraPorCategoria (src/hooks/useOperacaoLiquidacao.ts). Quem mudar um, muda o outro; o teste compara.
  select case
    when p_categoria in ('mamotes_f', 'desmama_f', 'novilhas', 'vacas') then 'Investimento Compra Bovinos Fêmeas'
    when p_categoria in ('mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros') then 'Investimento Compra Bovinos Machos'
  end
$fn$;

create or replace function public._oc_cc_direcao(p_tipo text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_tipo when 'venda' then '1-Entradas' when 'compra' then '2-Saídas' end
$fn$;

create or replace function public._oc_cc_conta_dinheiro(p_tipo text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_tipo when 'venda' then 'Adiantamento de Clientes' when 'compra' then 'Adiantamento a Fornecedores' end
$fn$;

create or replace function public._oc_cc_conta_entrega(p_tipo text, p_categoria text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_tipo when 'venda' then public._oc_subcentro_venda(p_categoria, false)
                     when 'compra' then public._oc_subcentro_compra(p_categoria) end
$fn$;

create or replace function public._oc_cc_verbo(p_tipo text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_tipo when 'venda' then 'Venda' when 'compra' then 'Compra' end
$fn$;

revoke all on function public._oc_subcentro_compra(text) from public, anon;
revoke all on function public._oc_cc_direcao(text) from public, anon;
revoke all on function public._oc_cc_conta_dinheiro(text) from public, anon;
revoke all on function public._oc_cc_conta_entrega(text, text) from public, anon;
revoke all on function public._oc_cc_verbo(text) from public, anon;
grant execute on function public._oc_subcentro_compra(text) to authenticated, service_role;
grant execute on function public._oc_cc_direcao(text) to authenticated, service_role;
grant execute on function public._oc_cc_conta_dinheiro(text) to authenticated, service_role;
grant execute on function public._oc_cc_conta_entrega(text, text) to authenticated, service_role;
grant execute on function public._oc_cc_verbo(text) to authenticated, service_role;

-- o aplicador dos patches: origem por md5, cada ancora com a contagem esperada, destino por md5. Some com a transacao.
create function pg_temp.oc_cc_patch(p_nome text, p_de text, p_para text, p_trincas text[])
returns void
language plpgsql
as $p$
declare v_def text; v_i int; v_n int; v_a text; v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = p_nome and md5(p.prosrc) = p_de;
  if v_def is null then raise exception 'OC-CONTA-CORRENTE-TODOS-01a: % fora da origem esperada (%)', p_nome, p_de; end if;
  for v_i in 1 .. array_length(p_trincas, 1) by 3 loop
    v_a := p_trincas[v_i];
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> p_trincas[v_i + 2]::int then
      raise exception 'OC-CONTA-CORRENTE-TODOS-01a: %, ancora % casa % vez(es), esperado %', p_nome, (v_i + 2) / 3, v_n, p_trincas[v_i + 2];
    end if;
    v_def := replace(v_def, v_a, p_trincas[v_i + 1]);
  end loop;
  execute v_def;
  select md5(p.prosrc) into v_novo from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_nome;
  if v_novo is distinct from p_para then
    raise exception 'OC-CONTA-CORRENTE-TODOS-01a: % com destino inesperado (%)', p_nome, v_novo; end if;
end $p$;

-- ── 1. oc_sincronizar_entregas: compra liberada; conta, direcao, sinal e verbo pelo tipo ──
select pg_temp.oc_cc_patch('oc_sincronizar_entregas', 'de36ab1e6cf6480d359da66bcf69b7de', 'c0fe12bbba165d7578fbbe1fa75c2327', array[
  $a$IF v_op.tipo_operacao <> 'venda' THEN$a$,
  $b$IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$b$, '1',
  $a$'Conta corrente, por enquanto, so em venda'$a$,
  $b$'Conta corrente, por enquanto, so em venda e compra'$b$, '1',
  $a$AND pc.tipo_operacao = '1-Entradas'$a$,
  $b$AND pc.tipo_operacao = public._oc_cc_direcao(v_op.tipo_operacao)$b$, '1',
  $a$AND pc.subcentro = public._oc_subcentro_venda(r.categoria, false);$a$,
  $b$AND pc.subcentro = public._oc_cc_conta_entrega(v_op.tipo_operacao, r.categoria);$b$, '1',
  $a$'Categoria % (lote ordem %) sem conta de venda no plano', r.categoria, r.ordem USING$a$,
  $b$'Categoria % (lote ordem %) sem conta de % no plano', r.categoria, r.ordem, v_op.tipo_operacao USING$b$, '1',
  $a$r.valor, '1', '1-Entradas', r.data$a$,
  $b$r.valor, CASE WHEN v_op.tipo_operacao = 'compra' THEN '-1' ELSE '1' END, public._oc_cc_direcao(v_op.tipo_operacao), r.data$b$, '1',
  $a$format('Venda %s %s', $a$,
  $b$format('%s %s %s', public._oc_cc_verbo(v_op.tipo_operacao), $b$, '2'
]);

-- ── 2. _oc_vincular_recebimento: o pagamento da compra vira "Adiantamento a Fornecedores" ──
select pg_temp.oc_cc_patch('_oc_vincular_recebimento', 'ffb87b7f8efc209a0132ec492fa89a84', 'bd6ae29397c5201e898152b83ab48f56', array[
  $a$OR v_op.tipo_operacao <> 'venda' THEN$a$,
  $b$OR v_op.tipo_operacao NOT IN ('venda', 'compra') THEN$b$, '1',
  $a$'Recebimento de conta corrente so em venda no modelo conta corrente'$a$,
  $b$'Recebimento ou pagamento de conta corrente so em venda ou compra no modelo conta corrente'$b$, '1',
  $a$IF v_l.tipo_operacao <> '1-Entradas' THEN$a$,
  $b$IF v_l.tipo_operacao <> public._oc_cc_direcao(v_op.tipo_operacao) THEN$b$, '1',
  $a$RAISE EXCEPTION 'Recebimento tem de ser uma entrada' USING$a$,
  $b$RAISE EXCEPTION '%', CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Pagamento tem de ser uma saida' ELSE 'Recebimento tem de ser uma entrada' END USING$b$, '1',
  $a$subcentro = 'Adiantamento de Clientes' AND tipo_operacao = '1-Entradas' AND ativo;$a$,
  $b$subcentro = public._oc_cc_conta_dinheiro(v_op.tipo_operacao) AND tipo_operacao = public._oc_cc_direcao(v_op.tipo_operacao) AND ativo;$b$, '1',
  $a$RAISE EXCEPTION 'Conta Adiantamento de Clientes ausente do plano' USING$a$,
  $b$RAISE EXCEPTION 'Conta % ausente do plano', public._oc_cc_conta_dinheiro(v_op.tipo_operacao) USING$b$, '1'
]);

-- ── 3. oc_vincular_lancamento: no modelo conta corrente, a saida principal da compra e' PAGAMENTO ──
select pg_temp.oc_cc_patch('oc_vincular_lancamento', '9ce51f1f0a2691ed8fd045b9870e9ab5', '773e6379f8414d5762a6ed86f0736846', array[
  $a$IF v_op.tipo_operacao = 'venda' AND v_regra.tipo_operacao = '1-Entradas' THEN$a$,
  $b$IF (v_op.tipo_operacao = 'venda' AND v_regra.tipo_operacao = '1-Entradas')
       OR (v_op.tipo_operacao = 'compra' AND v_regra.tipo_operacao = '2-Saídas' AND v_regra.natureza = 'principal') THEN$b$, '1'
]);

-- ── 4. _oc_vinculo_mapa: "Adiantamento a Fornecedores" vincula a compra, espelho do "Adiantamento de Clientes" ──
select pg_temp.oc_cc_patch('_oc_vinculo_mapa', '4d830519d72a7a48915f5ca6b9def910', 'fd9e1305efe5c36983e0add791d5d2b9', array[
  $a$('Adiantamento de Boitel',$a$,
  $b$('Adiantamento a Fornecedores',                  ARRAY['compra'],                 'principal',       ARRAY['recebimento'],                                            '2-Saídas'),
      ('Adiantamento de Boitel',$b$, '1'
]);

-- ── 5. oc_recebimentos_vinculaveis: os pagamentos que a compra pode buscar (saidas principais da compra e 5005) ──
select pg_temp.oc_cc_patch('oc_recebimentos_vinculaveis', '4d39d01dff73c6e270998a680df0cb5c', 'd12a6c0fc99cbe057e6920e85a0a4513', array[
  $a$AND o.tipo_operacao = 'venda'$a$,
  $b$AND o.tipo_operacao IN ('venda', 'compra')$b$, '1',
  $a$AND f.tipo_operacao = '1-Entradas' AND coalesce$a$,
  $b$AND f.tipo_operacao = public._oc_cc_direcao(o.tipo_operacao) AND coalesce$b$, '1',
  $a$WHERE 'venda' = ANY (m.tipos_oc) AND m.tipo_operacao = '1-Entradas' AND m.natureza = 'principal')$a$,
  $b$WHERE o.tipo_operacao = ANY (m.tipos_oc) AND m.tipo_operacao = public._oc_cc_direcao(o.tipo_operacao) AND m.natureza = 'principal')$b$, '1'
]);

-- ── 6. oc_conta_corrente: sinal da venda por dentro, x -1 na saida da compra; situacao e despesas da compra ──
select pg_temp.oc_cc_patch('oc_conta_corrente', '680b0d6473a14531a8d4fdc6c3d2078a', '6828bbf97c35010abef39b7978dfdaa2', array[
  $a$SELECT o.* FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id$a$,
  $b$SELECT o.*, CASE WHEN o.tipo_operacao = 'compra' THEN -1 ELSE 1 END AS s FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id$b$, '1',
  $a$'saldo', round(tot.saldo, 2),$a$,
  $b$'saldo', round(tot.saldo, 2) * op.s,$b$, '1',
  $a$'explicado', round(tot.explicado, 2),$a$,
  $b$'explicado', round(tot.explicado, 2) * op.s,$b$, '1',
  $a$'saldo_a_explicar', round(tot.saldo - tot.explicado_efetivo, 2),$a$,
  $b$'saldo_a_explicar', round(tot.saldo - tot.explicado_efetivo, 2) * op.s,$b$, '1',
  $a$'falta_explicar', round(tot.saldo - tot.explicado_efetivo + tot.explicado, 2),$a$,
  $b$'falta_explicar', round(tot.saldo - tot.explicado_efetivo + tot.explicado, 2) * op.s,$b$, '1',
  $a$'situacao', CASE WHEN round(tot.saldo, 2) < 0 THEN 'falta_receber'$a$,
  $b$'situacao', CASE WHEN op.tipo_operacao = 'compra' THEN CASE WHEN round(tot.saldo, 2) < 0 THEN 'falta_pagar'
                                                            WHEN round(tot.saldo, 2) > 0 THEN 'adiantado' ELSE 'quitado' END
                    WHEN round(tot.saldo, 2) < 0 THEN 'falta_receber'$b$, '1',
  $a$'mov_entrega', a.mov_entrega, 'mov_recebido', a.mov_recebido,$a$,
  $b$'mov_entrega', a.mov_entrega * op.s, 'mov_recebido', a.mov_recebido * op.s,$b$, '1',
  $a$'saldo', round(a.saldo, 2), 'motivo', a.motivo)$a$,
  $b$'saldo', round(a.saldo, 2) * op.s, 'motivo', a.motivo)$b$, '1',
  $a$'motivo', a.motivo, 'valor', a.intencao, 'status', a.status)$a$,
  $b$'motivo', a.motivo, 'valor', a.intencao * op.s, 'status', a.status)$b$, '1',
  $a$WHERE a.tipo = 'explicacao'), '[]'::jsonb))$a$,
  $b$WHERE a.tipo = 'explicacao'), '[]'::jsonb))
    -- DESPESAS DA OPERACAO (frete, comissao, ICMS): titulos comuns, fora do saldo. So' fora da venda: a venda nao ganha chave.
    || CASE WHEN op.tipo_operacao = 'venda' THEN '{}'::jsonb ELSE jsonb_build_object('despesas', coalesce((SELECT jsonb_agg(
         jsonb_build_object('parte_id', dp.id, 'lancamento_id', df.id, 'componente', dp.componente,
           'competencia', df.data_competencia, 'pagamento', df.data_pagamento, 'vencimento', df.data_vencimento,
           'descricao', df.descricao, 'favorecido', dfo.nome, 'conta_ordem', dpc.ordem_exibicao, 'conta', dpc.subcentro,
           'valor', CASE WHEN df.tipo_operacao = '1-Entradas' THEN round(df.valor, 2) ELSE -round(df.valor, 2) END,
           'status', df.status_transacao)
         ORDER BY df.data_competencia, dp.id)
       FROM public.zoo_operacao_partes dp
       JOIN public.financeiro_lancamentos_v2 df ON df.id = dp.financeiro_lancamento_id AND df.cancelado IS NOT TRUE
       LEFT JOIN public.financeiro_fornecedores dfo ON dfo.id = df.favorecido_id
       LEFT JOIN public.financeiro_plano_contas dpc ON dpc.id = df.plano_conta_id
       WHERE dp.operacao_id = op.id AND dp.cancelada = false AND dp.origem NOT IN ('entrega', 'explicacao')
         AND dp.componente <> 'recebimento'), '[]'::jsonb)) END$b$, '1'
]);

-- ── 7. oc_explicar_saldo: os tres tipos da compra, conta do lote pelo tipo, devolucao do fornecedor em 5005 ──
select pg_temp.oc_cc_patch('oc_explicar_saldo', 'e325f49cfc5d2d9168a685c4bdc84757', 'f4a12b7e12a017766f647bf1ef04833e', array[
  $a$  IF p_tipo IS NULL OR p_tipo NOT IN ('ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador') THEN$a$,
  $b$  IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN
    RAISE EXCEPTION 'Explicar a diferenca so existe em venda e compra' USING ERRCODE = 'P0001'; END IF;
  IF v_op.tipo_operacao = 'compra' AND p_tipo IN ('desconto_comercial', 'outra_receita') THEN
    RAISE EXCEPTION 'Na compra a explicacao e ajuste de preco, devolucao do fornecedor ou permuta / outra despesa' USING ERRCODE = 'P0001'; END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador') THEN$b$, '1',
  $a$AND pc.tipo_operacao = '1-Entradas'$a$,
  $b$AND pc.tipo_operacao = public._oc_cc_direcao(v_op.tipo_operacao)$b$, '1',
  $a$AND pc.subcentro = public._oc_subcentro_venda(v_lote.categoria_negociada, false);$a$,
  $b$AND pc.subcentro = public._oc_cc_conta_entrega(v_op.tipo_operacao, v_lote.categoria_negociada);$b$, '1',
  $a$AND pc.subcentro = 'Devolução de Adiantamento de Clientes';$a$,
  $b$AND pc.subcentro = CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Adiantamento a Fornecedores' ELSE 'Devolução de Adiantamento de Clientes' END;$b$, '1',
  $a$v_rotulo := 'Devolução ao comprador';$a$,
  $b$v_rotulo := CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Devolução do fornecedor' ELSE 'Devolução ao comprador' END;$b$, '1',
  $a$    v_tipo_op := v_pc.tipo_operacao;$a$,
  $b$    -- a devolucao do fornecedor e' ENTRADA de caixa, mesmo na conta 5005 (decisao do Gabriel)
    v_tipo_op := CASE WHEN v_op.tipo_operacao = 'compra' AND p_tipo = 'devolucao_comprador' THEN '1-Entradas' ELSE v_pc.tipo_operacao END;$b$, '1'
]);

-- ── 8. oc_programar_recebimento: na compra, pagamento programado em 5005 ──
select pg_temp.oc_cc_patch('oc_programar_recebimento', '42eba32a47d5736afd0dbdf4d83303a5', '84ba61e69680ffb68dd622669a4e354a', array[
  $a$  IF p_valor IS NULL OR round(p_valor, 2) <= 0 THEN$a$,
  $b$  IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN
    RAISE EXCEPTION 'Conta corrente so existe em venda e compra' USING ERRCODE = 'P0001'; END IF;
  IF p_valor IS NULL OR round(p_valor, 2) <= 0 THEN$b$, '1',
  $a$'subcentro', 'Adiantamento de Clientes',$a$,
  $b$'subcentro', public._oc_cc_conta_dinheiro(v_op.tipo_operacao),$b$, '1',
  $a$'descricao', 'Recebimento programado'));$a$,
  $b$'descricao', CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Pagamento programado' ELSE 'Recebimento programado' END));$b$, '1',
  $a$'condicoes', 'recebimento futuro da conta corrente'$a$,
  $b$'condicoes', CASE WHEN v_op.tipo_operacao = 'compra' THEN 'pagamento futuro da conta corrente' ELSE 'recebimento futuro da conta corrente' END$b$, '1'
]);

-- ── 9. _oc_cancelar_conta_corrente: frases da compra; na compra so' os compromissos da conta corrente ──
select pg_temp.oc_cc_patch('_oc_cancelar_conta_corrente', 'd6b5862361817c776e387d77951ce39b', '9dca4b6f69361ef97d005617ada0419e', array[
  $a$'descricao', 'Ha devolucao ao comprador ja paga: estorne o pagamento no Financeiro antes de cancelar.');$a$,
  $b$'descricao', CASE WHEN v_op.tipo_operacao = 'compra'
        THEN 'Ha devolucao do fornecedor ja recebida: estorne o recebimento no Financeiro antes de cancelar.'
        ELSE 'Ha devolucao ao comprador ja paga: estorne o pagamento no Financeiro antes de cancelar.' END);$b$, '1',
  $a$'descricao', 'Ha saida registrada pela OC: estorne-a na aba Entrega antes de cancelar.');$a$,
  $b$'descricao', CASE WHEN v_op.tipo_operacao = 'compra'
        THEN 'Ha entrada registrada pela OC: estorne-a na aba Entrega antes de cancelar.'
        ELSE 'Ha saida registrada pela OC: estorne-a na aba Entrega antes de cancelar.' END);$b$, '1',
  $a$FROM public.zoo_operacao_compromissos c WHERE c.operacao_id = p_operacao_id AND c.status <> 'cancelado';$a$,
  $b$FROM public.zoo_operacao_compromissos c WHERE c.operacao_id = p_operacao_id AND c.status <> 'cancelado'
       AND (v_op.tipo_operacao = 'venda' OR c.componente = 'recebimento');$b$, '1',
  $a$AND c.operacao_id = p_operacao_id AND pp.status <> 'cancelada';$a$,
  $b$AND c.operacao_id = p_operacao_id AND pp.status <> 'cancelada'
       AND (v_op.tipo_operacao = 'venda' OR c.componente = 'recebimento');$b$, '1',
  $a$AND c.operacao_id = p_operacao_id AND pr.status <> 'cancelada';$a$,
  $b$AND c.operacao_id = p_operacao_id AND pr.status <> 'cancelada'
       AND (v_op.tipo_operacao = 'venda' OR c.componente = 'recebimento');$b$, '1',
  $a$WHERE operacao_id = p_operacao_id AND status <> 'cancelado';$a$,
  $b$WHERE operacao_id = p_operacao_id AND status <> 'cancelado'
       AND (v_op.tipo_operacao = 'venda' OR componente = 'recebimento');$b$, '1'
]);

-- ── ACL: nada abriu para anon; as funcoes patcheadas mantem a ACL (CREATE OR REPLACE a preserva) ──
do $acl$
begin
  if has_function_privilege('anon', 'public._oc_subcentro_compra(text)', 'execute')
     or has_function_privilege('anon', 'public._oc_cc_direcao(text)', 'execute')
     or has_function_privilege('anon', 'public._oc_cc_conta_dinheiro(text)', 'execute')
     or has_function_privilege('anon', 'public._oc_cc_conta_entrega(text, text)', 'execute')
     or has_function_privilege('anon', 'public._oc_cc_verbo(text)', 'execute')
     or has_function_privilege('anon', 'public.oc_sincronizar_entregas(uuid, integer, boolean)', 'execute')
     or has_function_privilege('anon', 'public._oc_vincular_recebimento(uuid, integer, uuid, text, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._oc_vincular_recebimento(uuid, integer, uuid, text, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._oc_cancelar_conta_corrente(uuid, text, boolean)', 'execute') then
    raise exception 'OC-CONTA-CORRENTE-TODOS-01a: ACL fora do esperado'; end if;
end $acl$;
