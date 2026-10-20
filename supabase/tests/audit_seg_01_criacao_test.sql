-- AUDIT-SEG-01 parte 2 (depois da 20261028100100) — criacao na trilha e `via`. Termina em RAISE 'OK'. Transacao revertida.
--   B1 o membro cria um lancamento (copiado de um do NJ) -> evento "criou" com autor = membro e via nulo
--   B2 sem usuario, com app.via = 'ensaio_b2' -> o evento da edicao tem autor NULO e via 'sistema:ensaio_b2'
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SET LOCAL role authenticated;
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_user constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  v_molde jsonb; v_novo uuid := gen_random_uuid(); r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  select to_jsonb(l) into v_molde from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true and l.recorrencia_id is null and l.financiamento_id is null
     and coalesce(l.origem_lancamento, '') not in ('mesa_split', 'parcela_financiamento') and coalesce(l.tipo_operacao, '') not like '3-%'
   order by l.created_at desc limit 1;
  if v_molde is null then raise exception 'B1 sem molde'; end if;
  insert into public.financeiro_lancamentos_v2
  select (jsonb_populate_record(null::public.financeiro_lancamentos_v2,
          v_molde || jsonb_build_object('id', v_novo, 'hash_importacao', null, 'created_by', null, 'updated_by', null))).*;
  select usuario_id, acao, via into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_novo;
  if r.acao is distinct from 'criou' or r.usuario_id is distinct from c_user or r.via is not null then
    raise exception 'B1 criou: % % %', r.acao, r.usuario_id, r.via; end if;

  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('app.via', 'ensaio_b2', true);
  execute 'reset role';
  update public.financeiro_lancamentos_v2 set observacao = coalesce(observacao, '') || ' [b2]' where id = v_novo;
  select usuario_id, acao, via into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_novo
   and acao = 'editou' order by created_at desc, id desc limit 1;
  if r.usuario_id is not null or r.via is distinct from 'sistema:ensaio_b2' then raise exception 'B2: % %', r.usuario_id, r.via; end if;
  raise exception 'OK';
end $teste$;
ROLLBACK;
