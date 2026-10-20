-- AUDIT-SEG-01 parte 1 — trilha imutavel, autor verdadeiro, conciliacao legivel por cliente. Termina em RAISE 'OK'.
-- Transacao revertida; compara com `is distinct from`. Usuario comum = nj@agroinblue.app (gestor so' do NJ).
--   A1 membro: UPDATE e DELETE em audit_log, audit_log_movimentacoes, fechamento_reaberturas_log, financeiro_saldos_audit,
--      zoo_operacao_eventos -> 42501
--   A2 membro: INSERT em audit_log_movimentacoes com usuario_id do ADMIN e data de 2000 -> gravado com o proprio auth.uid() e now()
--   A3 editar um lancamento como o membro, com `updated_by` forjado = admin -> trilha "editou" com autor = membro
--   A4 o admin edita, o membro CANCELA pelo dono -> trilha "cancelou" com autor = membro (nao o editor anterior)
--   A5 o membro le conciliacao_audit_log do NJ (> 0 linhas) e 0 linhas da Vera
--   A6 o bloqueio vale tambem para quem passar pelo privilegio (UPDATE concedido so' nesta transacao) -> 42501 do gatilho
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
-- A6 prepara: concede UPDATE so' nesta transacao, para provar que o GATILHO segura sozinho.
GRANT UPDATE ON public.audit_log_movimentacoes TO authenticated;
CREATE POLICY ensaio_audit_seg_upd ON public.audit_log_movimentacoes FOR UPDATE TO authenticated USING (true);
SET LOCAL role authenticated;
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  c_user constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  t text; e text; v_id uuid; v_lanc uuid; r record; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);

  -- A1
  foreach t in array array['audit_log','audit_log_movimentacoes','fechamento_reaberturas_log','financeiro_saldos_audit','zoo_operacao_eventos'] loop
    e := null;
    begin execute format('update public.%I set cliente_id = cliente_id where cliente_id = $1', t) using c_nj;
    exception when others then e := sqlstate; end;
    if e is distinct from '42501' then raise exception 'A1 UPDATE %: %', t, coalesce(e, 'aceitou'); end if;
    e := null;
    begin execute format('delete from public.%I where cliente_id = $1', t) using c_nj;
    exception when others then e := sqlstate; end;
    if e is distinct from '42501' then raise exception 'A1 DELETE %: %', t, coalesce(e, 'aceitou'); end if;
  end loop;

  -- A2
  insert into public.audit_log_movimentacoes (cliente_id, usuario_id, acao, created_at, detalhes)
  values (c_nj, c_admin, 'ensaio_audit_seg', '2000-01-01', '{}'::jsonb) returning id into v_id;
  select usuario_id, created_at into r from public.audit_log_movimentacoes where id = v_id;
  if r.usuario_id is distinct from c_user or r.created_at < now() - interval '1 minute' then
    raise exception 'A2 autor/data: % %', r.usuario_id, r.created_at; end if;

  -- A6 (o membro tem UPDATE e policy so' nesta transacao: quem segura e' o gatilho)
  e := null;
  begin update public.audit_log_movimentacoes set acao = 'forjado' where id = v_id; exception when others then e := sqlstate; end;
  if e is distinct from '42501' then raise exception 'A6 gatilho: %', coalesce(e, 'aceitou'); end if;

  -- A3
  select l.id into v_lanc from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true
     and l.recorrencia_id is null and l.financiamento_id is null and coalesce(l.origem_lancamento, '') not in ('mesa_split', 'parcela_financiamento')
     and coalesce(l.tipo_operacao, '') not like '3-%'
     and not exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null)
     and not exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and p.cancelada = false)
     and not exists (select 1 from public.financiamento_parcelas fp where fp.lancamento_id = l.id or fp.lancamento_juros_id = l.id)
   order by l.created_at desc limit 1;
  if v_lanc is null then raise exception 'A3 sem lancamento de molde no NJ'; end if;
  update public.financeiro_lancamentos_v2 set observacao = coalesce(observacao, '') || ' [ensaio A3]', updated_by = c_admin where id = v_lanc;
  select usuario_id, acao into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_lanc
   order by created_at desc, id desc limit 1;
  if r.acao is distinct from 'editou' or r.usuario_id is distinct from c_user then raise exception 'A3 trilha: % %', r.acao, r.usuario_id; end if;

  -- A4 o admin edita (OLD.updated_by = admin) e o membro cancela
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  update public.financeiro_lancamentos_v2 set observacao = observacao || ' [admin]', updated_by = c_admin where id = v_lanc;
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  perform public.fn_cancelar_lancamento_auditoria(v_lanc, 'ensaio AUDIT-SEG-01');
  select usuario_id, acao into r from public.audit_log where tabela_origem = 'financeiro_lancamentos_v2' and registro_id = v_lanc
   and acao = 'cancelou' order by created_at desc, id desc limit 1;
  if r.usuario_id is distinct from c_user then raise exception 'A4 cancelou com autor %', r.usuario_id; end if;

  -- A5
  select count(*) into n from public.conciliacao_audit_log where cliente_id = c_nj;
  if n = 0 then raise exception 'A5 membro nao le a conciliacao do proprio cliente'; end if;
  select count(*) into n from public.conciliacao_audit_log where cliente_id = c_vera;
  if n is distinct from 0 then raise exception 'A5 membro le % linhas da Vera', n; end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
