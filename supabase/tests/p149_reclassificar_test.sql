-- P149 (depois da 20261028114000 e da 20261028114010) — reclassificar de "Beneficios e Premiacoes <atividade>" para "Alimentacao e
-- Cantina <atividade>" pela LISTA, com backup e DESFAZER. Termina em RAISE 'OK'. Transacao revertida. Fixture SINTETICO no cliente Teste
-- (43f32d07): tres lancamentos em Beneficios (Pecuaria, Administrativo e um de controle, fora da lista).
--   R1 simular: devolve 2 e NADA muda (contas iguais; nenhum backup do cliente Teste)
--   R2 tudo ou nada: a lista do Teste pedida para OUTRO cliente (NJ) e a lista com um id inexistente sao recusadas; nada muda
--   R3 aplicar: os 2 da lista vao para o Alimentacao e Cantina da MESMA atividade (conta e subcentro); o de controle fica; backup 2;
--      a Auditoria diz "sistema:p149"
--   R4 desfazer: as contas e os subcentros voltam aos de antes; o backup fica marcado como desfeito
-- Mutacoes (funcao trocada por EXECUTE de replace(pg_get_functiondef) na mesma transacao): simular grava -> R1; lista de outro cliente
-- aceita (sem o filtro do cliente) -> R2; desfazer nao volta (devolve a conta nova) -> R4.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '25s';

create function pg_temp.lanc(p_plano uuid, p_valor numeric) returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
    status_transacao, conta_bancaria_id, descricao, cenario, origem_lancamento, plano_conta_id)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '2-Saídas', p_valor, '-1', date '2026-09-01',
          date '2026-09-10', 'realizado', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT P149', 'realizado', 'manual', p_plano)
  returning id into v;
  return v;
end $f$;

DO $teste$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  b_pec uuid; b_adm uuid; a_pec uuid; a_adm uuid; l1 uuid; l2 uuid; l3 uuid; v_r jsonb; v_ok boolean; v_foto text;
begin
  select id into b_pec from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Benefícios e Premiações Pecuária';
  select id into b_adm from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Benefícios e Premiações Administrativo';
  select id into a_pec from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Alimentação e Cantina Pecuária';
  select id into a_adm from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Alimentação e Cantina Administrativo';
  if b_pec is null or b_adm is null or a_pec is null or a_adm is null then raise exception 'fixture: contas do P149 nao achadas'; end if;
  l1 := pg_temp.lanc(b_pec, 101.10); l2 := pg_temp.lanc(b_adm, 202.20); l3 := pg_temp.lanc(b_pec, 303.30);
  select string_agg(id::text || plano_conta_id::text || subcentro, '|' order by id) into v_foto
    from public.financeiro_lancamentos_v2 where id in (l1, l2, l3);
  if v_foto not like '%Benefícios e Premiações Pecuária%' then raise exception 'fixture: o subcentro nao veio da conta'; end if;

  -- R1
  v_r := public.fn_p149_reclassificar(c_teste, array[l1, l2], true);
  if (v_r->>'total')::int <> 2 or (v_r->>'simulado')::boolean is not true then raise exception 'R1 simulacao devolveu %', v_r; end if;
  if (select string_agg(id::text || plano_conta_id::text || subcentro, '|' order by id) from public.financeiro_lancamentos_v2 where id in (l1, l2, l3)) <> v_foto
    then raise exception 'R1 a simulacao mudou lancamentos'; end if;
  if exists (select 1 from public.plano_reclassificacao_backup where cliente_id = c_teste) then raise exception 'R1 a simulacao deixou backup'; end if;

  -- R2
  v_ok := false;
  begin
    perform public.fn_p149_reclassificar(c_nj, array[l1, l2], false);
  exception when others then v_ok := sqlerrm like 'P149:%Nada foi gravado.';
  end;
  if not v_ok then raise exception 'R2 a lista do Teste foi aceita para outro cliente'; end if;
  v_ok := false;
  begin
    perform public.fn_p149_reclassificar(c_teste, array[l1, l2, '00000000-0000-0000-0000-000000000149'::uuid], false);
  exception when others then v_ok := sqlerrm like 'P149:%Nada foi gravado.';
  end;
  if not v_ok then raise exception 'R2 a lista com id inexistente foi aceita'; end if;
  if (select string_agg(id::text || plano_conta_id::text || subcentro, '|' order by id) from public.financeiro_lancamentos_v2 where id in (l1, l2, l3)) <> v_foto
    then raise exception 'R2 uma recusa mudou lancamentos'; end if;

  -- R3
  v_r := public.fn_p149_reclassificar(c_teste, array[l1, l2], false);
  if (v_r->>'total')::int <> 2 then raise exception 'R3 aplicar devolveu %', v_r; end if;
  if (select plano_conta_id from public.financeiro_lancamentos_v2 where id = l1) is distinct from a_pec
     or (select subcentro from public.financeiro_lancamentos_v2 where id = l1) is distinct from 'Alimentação e Cantina Pecuária'
    then raise exception 'R3 o de Pecuaria nao foi para Alimentacao e Cantina Pecuaria'; end if;
  if (select plano_conta_id from public.financeiro_lancamentos_v2 where id = l2) is distinct from a_adm
     or (select subcentro from public.financeiro_lancamentos_v2 where id = l2) is distinct from 'Alimentação e Cantina Administrativo'
    then raise exception 'R3 o Administrativo nao foi para Alimentacao e Cantina Administrativo'; end if;
  if (select plano_conta_id from public.financeiro_lancamentos_v2 where id = l3) is distinct from b_pec then raise exception 'R3 o de controle mudou'; end if;
  if (select count(*) from public.plano_reclassificacao_backup where cliente_id = c_teste and desfeito_em is null) <> 2 then raise exception 'R3 backup <> 2'; end if;
  if (select count(*) from public.audit_log where registro_id in (l1, l2) and via = 'sistema:p149' and created_at >= now()) < 2
    then raise exception 'R3 a Auditoria nao diz a rotina'; end if;

  -- R4
  v_r := public.fn_p149_desfazer(c_teste);
  if (select string_agg(id::text || plano_conta_id::text || subcentro, '|' order by id) from public.financeiro_lancamentos_v2 where id in (l1, l2, l3)) <> v_foto
    then raise exception 'R4 o desfazer nao voltou as contas (%)', v_r; end if;
  if exists (select 1 from public.plano_reclassificacao_backup where cliente_id = c_teste and desfeito_em is null) then raise exception 'R4 backup sem desfeito_em'; end if;

  raise exception 'OK R1-R4 (simulado 2, recusas 2, aplicado 2, desfeito %)', v_r->>'desfeitos';
end $teste$;
ROLLBACK;
