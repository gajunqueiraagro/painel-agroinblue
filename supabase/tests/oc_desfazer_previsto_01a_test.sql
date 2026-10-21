-- OC-DESFAZER-PREVISTO-01a — o "Desfazer compromisso" nao trava em lancamento desvinculado; o "Atualizar" grava a trilha.
-- Termina em RAISE 'OK'. Transacao revertida. Autor = o admin da casa (as RPCs da OC exigem acesso ao cliente).
--   T1 OC 1645ba75 / compromisso 6347b5a1 (o caso de 20/10): o desfazer SIMULADO passa (estorna o titulo programado, cancela a
--      programacao e o compromisso); o 2448e772 (desvinculado em 14/10) segue vivo, realizado e conciliado, intocado.
--   T2 compromisso com parte viva e titulo REALIZADO (6a7393ae): o desfazer continua recusando (P0001), com a frase do estorno
--      (desde o 01b, pronta do banco: "O lançamento de R$ … já foi pago ou conciliado…").
--   T3 compromisso com titulo so' programado (ff50d197): o desfazer DE VERDADE cancela o titulo junto, com data, autor e motivo.
--   T4 "Atualizar compromisso" (65cab185, lote 0fcf05cb, titulo previsto 1e34a184): o lancamento cancelado leva cancelado_em,
--      cancelado_por, cancelado_motivo e updated_by.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
DO $teste$
declare
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_op1 constant uuid := '1645ba75-2cea-45ee-8316-e0695b7cffe7'; c_comp1 constant uuid := '6347b5a1-1e04-4f2d-ac31-874b29071b96';
  v_desvinc uuid; v_op uuid; v_cli uuid; v_ver int; v_lanc uuid; v_lote uuid; j jsonb; e text; m text; r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- T1
  select id into v_desvinc from public.financeiro_lancamentos_v2 where id::text like '2448e772%';
  select versao into v_ver from public.zoo_operacoes_comerciais where id = c_op1;
  j := public.oc_desfazer_compromisso(c_op1, v_ver, c_comp1, 'teste OC-DESFAZER-PREVISTO-01a', true);
  if (j->>'ok')::boolean is distinct from true or (j->>'simulado')::boolean is distinct from true
     or (j->>'programacoes_canceladas')::int <> 1 or jsonb_array_length(j->'titulos_estornados') <> 1 then
    raise exception 'T1 simulacao: %', j; end if;
  select cancelado, status_transacao, exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null) conc
    into r from public.financeiro_lancamentos_v2 l where l.id = v_desvinc;
  if r.cancelado is not false or r.status_transacao <> 'realizado' or not r.conc then
    raise exception 'T1 o desvinculado foi tocado: % % %', r.cancelado, r.status_transacao, r.conc; end if;

  -- T2
  select c.operacao_id, o.versao into v_op, v_ver from public.zoo_operacao_compromissos c join public.zoo_operacoes_comerciais o on o.id = c.operacao_id
   where c.id = '6a7393ae-8c8c-4eac-bd04-31cb1847dc70';
  e := null;
  begin
    perform public.oc_desfazer_compromisso(v_op, v_ver, '6a7393ae-8c8c-4eac-bd04-31cb1847dc70', 'teste', true);
  exception when others then e := sqlstate; m := sqlerrm;
  end;
  -- desde o 01b a frase vem pronta do banco ("O lançamento de R$ … já foi pago ou conciliado…")
  if e is distinct from 'P0001' or m not like 'O lançamento de R$ %' then
    raise exception 'T2 titulo realizado: % %', coalesce(e, 'aceitou'), m; end if;

  -- T3
  select c.operacao_id, o.versao into v_op, v_ver from public.zoo_operacao_compromissos c join public.zoo_operacoes_comerciais o on o.id = c.operacao_id
   where c.id = 'ff50d197-9686-4187-a2fe-2c3f465aa424';
  select pt.financeiro_lancamento_id into v_lanc from public.zoo_operacao_partes pt
    join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
    join public.zoo_operacao_programacoes pr on pr.id = pp.programacao_id and pr.status = 'ativa'
   where pr.compromisso_id = 'ff50d197-9686-4187-a2fe-2c3f465aa424' and pt.cancelada is not true limit 1;
  j := public.oc_desfazer_compromisso(v_op, v_ver, 'ff50d197-9686-4187-a2fe-2c3f465aa424', 'teste 01a T3', false);
  select cancelado, cancelado_em, cancelado_por, cancelado_motivo into r from public.financeiro_lancamentos_v2 where id = v_lanc;
  if r.cancelado is not true or r.cancelado_em is null or r.cancelado_por is distinct from c_admin or r.cancelado_motivo is distinct from 'teste 01a T3' then
    raise exception 'T3 titulo: % % % %', r.cancelado, r.cancelado_em, r.cancelado_por, r.cancelado_motivo; end if;
  if (select status from public.zoo_operacao_compromissos where id = 'ff50d197-9686-4187-a2fe-2c3f465aa424') <> 'cancelado' then
    raise exception 'T3 compromisso nao cancelado'; end if;

  -- T4 (o valor do compromisso difere do lote so' nesta transacao, para o "Atualizar" ter o que fazer)
  select c.operacao_id, c.cliente_id, c.lote_id, o.versao into v_op, v_cli, v_lote, v_ver
    from public.zoo_operacao_compromissos c join public.zoo_operacoes_comerciais o on o.id = c.operacao_id
   where c.id = '65cab185-d4a0-4855-a1f7-5c2cdf24b46c';
  select pt.financeiro_lancamento_id into v_lanc from public.zoo_operacao_partes pt
    join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
    join public.zoo_operacao_programacoes pr on pr.id = pp.programacao_id and pr.status = 'ativa'
   where pr.compromisso_id = '65cab185-d4a0-4855-a1f7-5c2cdf24b46c' and pt.cancelada is not true limit 1;
  update public.zoo_operacao_compromissos set valor_total = valor_total + 1 where id = '65cab185-d4a0-4855-a1f7-5c2cdf24b46c';
  j := public.oc_reprogramar_compromisso_do_lote(v_op, v_cli, v_ver, v_lote, 'teste 01a T4', false);
  select cancelado, cancelado_em, cancelado_por, cancelado_motivo, updated_by into r from public.financeiro_lancamentos_v2 where id = v_lanc;
  if r.cancelado is not true or r.cancelado_em is null or r.cancelado_por is distinct from c_admin
     or r.cancelado_motivo is distinct from 'teste 01a T4' or r.updated_by is distinct from c_admin then
    raise exception 'T4 trilha do Atualizar: % % % % % (%)', r.cancelado, r.cancelado_em, r.cancelado_por, r.cancelado_motivo, r.updated_by, j; end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
