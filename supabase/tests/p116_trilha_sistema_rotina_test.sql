-- P116 (depois da 20261028112390) — nenhum evento da trilha sem quem. Termina em RAISE 'OK'. Transacao revertida.
--   T1 sem usuario e sem rotina declarada -> autor NULO e via 'sistema:manutenção' (era so' 'sistema')
--   T2 sem usuario, com app.via = 'ensaio_t2' -> via 'sistema:ensaio_t2'
--   T3 com usuario -> autor = usuario, via nulo
--   T4 conciliacao_audit_log sem actor, com usuario logado -> actor = usuario, via nulo
--   T5 conciliacao_audit_log sem actor e sem usuario -> via 'sistema:manutenção'; com app.via -> 'sistema:<rotina>'
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_user constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  v_molde jsonb; v_novo uuid := gen_random_uuid(); r record; v_cols text; v_c uuid;
begin
  select to_jsonb(l) into v_molde from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true and l.recorrencia_id is null and l.financiamento_id is null
     and coalesce(l.origem_lancamento, '') not in ('mesa_split', 'parcela_financiamento') and coalesce(l.tipo_operacao, '') not like '3-%'
   order by l.created_at desc limit 1;
  if v_molde is null then raise exception 'sem molde'; end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols from pg_attribute
   where attrelid = 'public.financeiro_lancamentos_v2'::regclass and attnum > 0 and not attisdropped and attgenerated = '';

  -- T3 (cria como o membro)
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)',
                 v_cols, v_cols)
    using v_molde || jsonb_build_object('id', v_novo, 'hash_importacao', null, 'created_by', null, 'updated_by', null);
  execute 'reset role';
  select usuario_id, via into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_novo and acao = 'criou';
  if r.usuario_id is distinct from c_user or r.via is not null then raise exception 'T3: % %', r.usuario_id, r.via; end if;

  -- T1
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('app.via', '', true);
  update public.financeiro_lancamentos_v2 set observacao = coalesce(observacao, '') || ' [t1]' where id = v_novo;
  select usuario_id, via into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_novo
   and acao = 'editou' order by created_at desc, id desc limit 1;
  if r.usuario_id is not null or r.via is distinct from 'sistema:manutenção' then raise exception 'T1: % %', r.usuario_id, r.via; end if;

  -- T2
  perform set_config('app.via', 'ensaio_t2', true);
  update public.financeiro_lancamentos_v2 set observacao = observacao || ' [t2]' where id = v_novo;
  select via into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_novo
   and acao = 'editou' and dados_novos->>'observacao' like '%[t2]' limit 1;
  if r.via is distinct from 'sistema:ensaio_t2' then raise exception 'T2: %', r.via; end if;

  -- T4
  perform set_config('app.via', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  insert into public.conciliacao_audit_log (acao, cliente_id, lancamento_id, motivo) values ('warning_mes_fechado', c_nj, v_novo, 'ensaio t4')
  returning id into v_c;
  select actor_user_id, via into r from public.conciliacao_audit_log where id = v_c;
  if r.actor_user_id is distinct from c_user or r.via is not null then raise exception 'T4: % %', r.actor_user_id, r.via; end if;

  -- T5
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.conciliacao_audit_log (acao, cliente_id, lancamento_id, motivo) values ('warning_mes_fechado', c_nj, v_novo, 'ensaio t5')
  returning id into v_c;
  select actor_user_id, via into r from public.conciliacao_audit_log where id = v_c;
  if r.actor_user_id is not null or r.via is distinct from 'sistema:manutenção' then raise exception 'T5a: % %', r.actor_user_id, r.via; end if;
  perform set_config('app.via', 'ensaio_t5', true);
  insert into public.conciliacao_audit_log (acao, cliente_id, lancamento_id, motivo) values ('warning_mes_fechado', c_nj, v_novo, 'ensaio t5b')
  returning id into v_c;
  select via into r from public.conciliacao_audit_log where id = v_c;
  if r.via is distinct from 'sistema:ensaio_t5' then raise exception 'T5b: %', r.via; end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
