-- OC-DESFAZER-PREVISTO-01b — o banco devolve a frase pronta; agendado com confirmação; o "Atualizar" usa o vencimento escolhido.
-- Termina em RAISE 'OK'. Transacao revertida. Autor = o admin da casa.
--   E1 realizado (compromisso 6a7393ae): o desfazer simulado recusa com a frase em portugues ("O lançamento de R$ … de dd/mm/aaaa já
--      foi pago ou conciliado…"), o id do lancamento no DETAIL e o JSON da linha no HINT (status, n/N).
--   E2 agendado (ff50d197, o titulo marcado agendado so' nesta transacao): a simulacao lista o agendado; a gravacao SEM a confirmacao
--      recusa com a frase e o DETAIL; COM a confirmacao cancela o titulo junto (data, autor, motivo).
--   E3 "Atualizar" (65cab185): a simulacao propoe o vencimento da parcela viva e escreve o rol com R$; agendado sem confirmacao
--      recusa; com a confirmacao e o vencimento ESCOLHIDO (30/11/2026) a parcela nova nasce nele e o titulo cancelado leva a trilha.
--   E4 nenhuma recusa das funcoes da OC ficou sem acento; nenhuma executavel por anon.
--   E5 a guarda de cliente do desfazer (20261028100810): usuario sem acesso recusado (42501).
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
DO $teste$
declare
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_op uuid; v_cli uuid; v_ver int; v_lanc uuid; v_lote uuid; j jsonb; e text; m text; d text; h text; r record; v_n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- E1
  select c.operacao_id, o.versao into v_op, v_ver from public.zoo_operacao_compromissos c join public.zoo_operacoes_comerciais o on o.id = c.operacao_id
   where c.id = '6a7393ae-8c8c-4eac-bd04-31cb1847dc70';
  e := null;
  begin
    perform public.oc_desfazer_compromisso(v_op, v_ver, '6a7393ae-8c8c-4eac-bd04-31cb1847dc70', '', true);
  exception when others then get stacked diagnostics e = returned_sqlstate, m = message_text, d = pg_exception_detail, h = pg_exception_hint;
  end;
  if e is distinct from 'P0001' or m not like 'O lançamento de R$ %' or m !~ 'R\$ [0-9.]+,[0-9]{2} de [0-9]{2}/[0-9]{2}/[0-9]{4} já foi pago ou conciliado\.'
     or length(d) <> 36 or d !~ '[0-9a-f-]{36}' or (h::jsonb->>'lancamento_id') is distinct from d or (h::jsonb->>'status') is null or (h::jsonb->>'total') is null then
    raise exception 'E1 realizado: % | % | % | %', coalesce(e, 'aceitou'), m, d, h; end if;

  -- E2
  select c.operacao_id, o.versao into v_op, v_ver from public.zoo_operacao_compromissos c join public.zoo_operacoes_comerciais o on o.id = c.operacao_id
   where c.id = 'ff50d197-9686-4187-a2fe-2c3f465aa424';
  select pt.financeiro_lancamento_id into v_lanc from public.zoo_operacao_partes pt
    join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
    join public.zoo_operacao_programacoes pr on pr.id = pp.programacao_id and pr.status = 'ativa'
   where pr.compromisso_id = 'ff50d197-9686-4187-a2fe-2c3f465aa424' and pt.cancelada is not true limit 1;
  update public.financeiro_lancamentos_v2 set status_transacao = 'agendado' where id = v_lanc;
  j := public.oc_desfazer_compromisso(v_op, v_ver, 'ff50d197-9686-4187-a2fe-2c3f465aa424', '', true);
  if jsonb_array_length(j->'agendados') <> 1 or (j->'agendados'->0->>'lancamento_id')::uuid <> v_lanc then raise exception 'E2 simulacao: %', j; end if;
  e := null;
  begin
    perform public.oc_desfazer_compromisso(v_op, v_ver, 'ff50d197-9686-4187-a2fe-2c3f465aa424', 'teste 01b E2', false);
  exception when others then get stacked diagnostics e = returned_sqlstate, m = message_text, d = pg_exception_detail;
  end;
  if e is distinct from 'P0001' or m !~ 'está agendado no banco' or d is distinct from v_lanc::text then
    raise exception 'E2 sem confirmacao: % | % | %', coalesce(e, 'aceitou'), m, d; end if;
  j := public.oc_desfazer_compromisso(v_op, v_ver, 'ff50d197-9686-4187-a2fe-2c3f465aa424', 'teste 01b E2', false, true);
  select cancelado, cancelado_em, cancelado_por, cancelado_motivo into r from public.financeiro_lancamentos_v2 where id = v_lanc;
  if r.cancelado is not true or r.cancelado_em is null or r.cancelado_por is distinct from c_admin or r.cancelado_motivo is distinct from 'teste 01b E2' then
    raise exception 'E2 com confirmacao: % % % %', r.cancelado, r.cancelado_em, r.cancelado_por, r.cancelado_motivo; end if;

  -- E3
  select c.operacao_id, c.cliente_id, c.lote_id, o.versao into v_op, v_cli, v_lote, v_ver
    from public.zoo_operacao_compromissos c join public.zoo_operacoes_comerciais o on o.id = c.operacao_id
   where c.id = '65cab185-d4a0-4855-a1f7-5c2cdf24b46c';
  select pt.financeiro_lancamento_id into v_lanc from public.zoo_operacao_partes pt
    join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
    join public.zoo_operacao_programacoes pr on pr.id = pp.programacao_id and pr.status = 'ativa'
   where pr.compromisso_id = '65cab185-d4a0-4855-a1f7-5c2cdf24b46c' and pt.cancelada is not true limit 1;
  update public.zoo_operacao_compromissos set valor_total = valor_total + 1 where id = '65cab185-d4a0-4855-a1f7-5c2cdf24b46c';
  update public.financeiro_lancamentos_v2 set status_transacao = 'agendado' where id = v_lanc;
  j := public.oc_reprogramar_compromisso_do_lote(v_op, v_cli, 0, v_lote, '', true);
  if (j->>'ok')::boolean is not true or j->>'vencimento_proposto' is null or jsonb_array_length(j->'agendados') <> 1
     or (select bool_or(x->>'descricao' ~ '[0-9]{4,}\.[0-9]{2}') from jsonb_array_elements(j->'rol') x)
     or not (select bool_and(x->>'descricao' ~ 'R\$') from jsonb_array_elements(j->'rol') x where x->>'tipo' in ('parcela','compromisso','parcela_nova')) then
    raise exception 'E3 simulacao: %', j; end if;
  e := null;
  begin
    perform public.oc_reprogramar_compromisso_do_lote(v_op, v_cli, v_ver, v_lote, 'teste 01b E3', false, '2026-11-30');
  exception when others then get stacked diagnostics e = returned_sqlstate, m = message_text, d = pg_exception_detail;
  end;
  if e is distinct from 'P0001' or m !~ 'está agendado no banco' or d is distinct from v_lanc::text then
    raise exception 'E3 agendado sem confirmacao: % | % | %', coalesce(e, 'aceitou'), m, d; end if;
  j := public.oc_reprogramar_compromisso_do_lote(v_op, v_cli, v_ver, v_lote, 'teste 01b E3', false, '2026-11-30', true);
  if (select vencimento from public.zoo_operacao_parcelas_programacao where id = (j->>'parcela_id')::uuid) is distinct from '2026-11-30'::date then
    raise exception 'E3 a parcela nova nao nasceu no vencimento escolhido: %', j; end if;
  select cancelado, cancelado_em, cancelado_por, cancelado_motivo into r from public.financeiro_lancamentos_v2 where id = v_lanc;
  if r.cancelado is not true or r.cancelado_em is null or r.cancelado_por is distinct from c_admin or r.cancelado_motivo is distinct from 'teste 01b E3' then
    raise exception 'E3 trilha: % % % %', r.cancelado, r.cancelado_em, r.cancelado_por, r.cancelado_motivo; end if;

  -- E4
  select count(*) into v_n
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace,
         regexp_split_to_table(p.prosrc, 'RAISE EXCEPTION\s+''') with ordinality as t(x, k)
   where s.nspname = 'public' and k > 1
     and p.proname in ('oc_cancelar_programacao','oc_cancelar_compromisso','oc_estornar_materializacao','oc_alterar_parcela_programacao',
       'oc_salvar_lotes','oc_desvincular_lancamento','oc_ajustar_valor_compromisso','oc_estornar_recebimento','oc_revalorar_lote',
       'oc_desfazer_compromisso','oc_reprogramar_compromisso_do_lote')
     and split_part(x, '''', 1) ~ '(nao |Operacao|Programacao|titulo|Lancamento|liquidacao|materializacao|exige motivo|Conflito de versao|Sem permissao|recupere-a)';
  if v_n <> 0 then raise exception 'E4 % recusa(s) crua(s) nas funcoes da OC', v_n; end if;
  select count(*) into v_n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('oc_desfazer_compromisso','oc_reprogramar_compromisso_do_lote','oc_estornar_materializacao')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 0 then raise exception 'E4 % funcao(oes) executavel(is) por anon', v_n; end if;

  -- E5 a guarda de cliente do desfazer (20261028100810): usuario sem acesso e' recusado (42501)
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  e := null;
  begin perform public.oc_desfazer_compromisso('1645ba75-2cea-45ee-8316-e0695b7cffe7', 0, '6347b5a1-1e04-4f2d-ac31-874b29071b96', '', true);
  exception when others then e := sqlstate; end;
  if e is distinct from '42501' then raise exception 'E5 guarda: %', coalesce(e, 'aceitou'); end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
