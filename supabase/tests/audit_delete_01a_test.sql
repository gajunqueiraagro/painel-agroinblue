-- AUDIT-DELETE-01a — nada se apaga de verdade; os gestos cancelam com motivo e trilha. Termina em RAISE 'OK'. Transacao revertida.
-- Membro comum = nj@agroinblue.app (gestor so' do NJ).
--   D1 membro: DELETE nas 6 tabelas -> 42501 (privilegio), e o gatilho recusa tambem com DELETE concedido so' nesta transacao
--   D2 membro cria um fornecedor e o EXCLUI pelo gesto: ativo = false, a linha continua, trilha "editou" com o membro e o motivo
--   D3 fornecedor com lancamento: a simulacao recusa (com_uso) e a gravacao levanta P0001 com a frase do "mescle"
--   D4 o membro desfaz um vinculo vivo do extrato pelo gesto: desfeito_em/por/motivo gravados, linha viva, trilha com o motivo
--   D5 sem motivo, a gravacao recusa (P0001) e a simulacao nao grava
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
GRANT DELETE ON public.financeiro_plano_contas TO authenticated;
CREATE POLICY ensaio_audit_delete ON public.financeiro_plano_contas FOR DELETE TO authenticated USING (true);
SET LOCAL role authenticated;
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_user constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  t text; e text; v_forn uuid; v_com_uso uuid; v_item uuid; r record; j jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);

  -- D1
  foreach t in array array['conciliacao_bancaria_itens','extrato_bancario_v2','financeiro_lancamento_documentos',
                           'financeiro_documento_vinculos','financeiro_fornecedores','financeiro_plano_contas'] loop
    e := null;
    begin execute format('delete from public.%I where cliente_id = $1', t) using c_nj; exception when others then e := sqlstate; end;
    if e is distinct from '42501' then raise exception 'D1 DELETE %: %', t, coalesce(e, 'aceitou'); end if;
  end loop;

  -- D2
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_nj, 'SINT AUDIT-DELETE-01a fornecedor', true)
  returning id into v_forn;
  j := public.fn_fornecedor_excluir(v_forn, 'cadastrado por engano', true);
  if (j->>'ok')::boolean is distinct from true or (select ativo from public.financeiro_fornecedores where id = v_forn) is not true then
    raise exception 'D2 simulacao: % ', j; end if;
  j := public.fn_fornecedor_excluir(v_forn, 'cadastrado por engano', false);
  select ativo into r from public.financeiro_fornecedores where id = v_forn;
  if r.ativo is distinct from false then raise exception 'D2 nao saiu de uso: %', j; end if;
  select usuario_id, acao, resumo into r from public.audit_log
   where tabela_origem = 'financeiro_fornecedores' and registro_id = v_forn and acao = 'editou' order by created_at desc, id desc limit 1;
  if r.usuario_id is distinct from c_user or r.resumo is distinct from 'motivo: cadastrado por engano' then
    raise exception 'D2 trilha: % % %', r.acao, r.usuario_id, r.resumo; end if;

  -- D3
  select l.favorecido_id into v_com_uso from public.financeiro_lancamentos_v2 l join public.financeiro_fornecedores f on f.id = l.favorecido_id
   where l.cliente_id = c_nj and l.cancelado is not true and f.ativo limit 1;
  j := public.fn_fornecedor_excluir(v_com_uso, 'teste', true);
  if (j->>'ok')::boolean is distinct from false or j->'recusa'->>'motivo' is distinct from 'com_uso' then raise exception 'D3 simulacao: %', j; end if;
  e := null;
  begin perform public.fn_fornecedor_excluir(v_com_uso, 'teste', false); exception when others then e := sqlstate; end;
  if e is distinct from 'P0001' then raise exception 'D3 gravacao: %', coalesce(e, 'aceitou'); end if;

  -- D4
  select c.id into v_item from public.conciliacao_bancaria_itens c where c.cliente_id = c_nj and c.desfeito_em is null
   order by c.created_at desc limit 1;
  j := public.fn_conciliacao_item_desfazer(v_item, 'vínculo errado', false);
  select desfeito_em, desfeito_por, desfeito_motivo into r from public.conciliacao_bancaria_itens where id = v_item;
  if r.desfeito_em is null or r.desfeito_por is distinct from c_user or r.desfeito_motivo is distinct from 'vínculo errado' then
    raise exception 'D4 item: % % %', r.desfeito_em, r.desfeito_por, r.desfeito_motivo; end if;
  if not exists (select 1 from public.audit_log where tabela_origem = 'conciliacao_bancaria_itens' and registro_id = v_item
                  and usuario_id = c_user and resumo = 'motivo: vínculo errado') then
    raise exception 'D4 sem trilha com o motivo'; end if;

  -- D5
  select c.id into v_item from public.conciliacao_bancaria_itens c where c.cliente_id = c_nj and c.desfeito_em is null
   order by c.created_at desc limit 1;
  e := null;
  begin perform public.fn_conciliacao_item_desfazer(v_item, '  ', false); exception when others then e := sqlstate; end;
  if e is distinct from 'P0001' then raise exception 'D5 sem motivo: %', coalesce(e, 'aceitou'); end if;
  perform public.fn_conciliacao_item_desfazer(v_item, null, true);
  if (select desfeito_em from public.conciliacao_bancaria_itens where id = v_item) is not null then raise exception 'D5 simulacao gravou'; end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
