-- BPO-APROVACAO-01 lote 1 · teste (roda como postgres; termina em RAISE 'OK…'; nada fica no banco). Fixture no cliente Teste (43f32d07):
-- os 10 programados e o 1 realizado dele; a lançadora e o aprovador são dois usuários reais SEM acesso a ele, que ganham uma filiação
-- SINTÉTICA ao Teste dentro da transação (o RAISE desfaz). As RPCs leem `auth.uid()` das claims.
do $$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ADM uuid; L uuid; J uuid;
  p1 uuid; p2 uuid; p3 uuid; pv uuid; rz uuid;
  r jsonb; ok boolean; n int; obs text;
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m.user_id into L from cliente_membros m where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> T
     and not exists (select 1 from cliente_membros a where a.user_id = m.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m.user_id limit 1;
  select m.user_id into J from cliente_membros m where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> T and m.user_id <> L
     and not exists (select 1 from cliente_membros a where a.user_id = m.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m.user_id limit 1;
  if ADM is null or L is null or J is null then raise exception 'sem usuários para o teste'; end if;
  insert into cliente_membros (user_id, cliente_id, perfil, ativo) values (L, T, 'financeiro', true), (J, T, 'gestor_cliente', true);
  select id into p1 from financeiro_lancamentos_v2 where cliente_id = T and status_transacao = 'programado' and cancelado is not true and tipo_operacao = '2-Saídas' order by data_vencimento, id limit 1;
  select id into p2 from financeiro_lancamentos_v2 where cliente_id = T and status_transacao = 'programado' and cancelado is not true and tipo_operacao = '2-Saídas' and id <> p1 order by data_vencimento, id limit 1;
  select id into p3 from financeiro_lancamentos_v2 where cliente_id = T and status_transacao = 'programado' and cancelado is not true and tipo_operacao = '2-Saídas' and id not in (p1, p2) order by data_vencimento, id limit 1;
  select id into pv from financeiro_lancamentos_v2 where cliente_id = T and status_transacao = 'programado' and cancelado is not true and tipo_operacao = '2-Saídas' and id not in (p1, p2, p3) order by data_vencimento, id limit 1;
  select id into rz from financeiro_lancamentos_v2 where cliente_id = T and status_transacao = 'realizado' and cancelado is not true limit 1;
  if p1 is null or p2 is null or p3 is null or pv is null or rz is null then raise exception 'sem lançamentos no Teste'; end if;

  -- T0 sem BPO ligado: agendar passa (o gatilho só age com o BPO ligado) e enviar recusa
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_aprovacao_enviar(T, array[p1], false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T0'; end if;

  -- T1 configurar: só o admin; a prévia não grava
  ok := false; begin perform fn_bpo_config_gravar(T, true, date '2000-01-01', null, null, true, true, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T1a (lançadora configurou)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  r := fn_bpo_config_gravar(T, true, date '2000-01-01', null, null, true, true, true);
  if exists (select 1 from financeiro_bpo_config where cliente_id = T) or (r->>'aguardando_ao_ligar')::int < 4 then raise exception 'T1b %', r; end if;
  perform fn_bpo_config_gravar(T, true, date '2000-01-01', null, null, true, true, false);

  -- T2 aprovador: só membro gestor/financeiro do cliente; o admin marca
  ok := false; begin perform fn_bpo_aprovador_gravar(T, ADM, true, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T2a (admin sem filiação virou aprovador)'; end if;
  perform fn_bpo_aprovador_gravar(T, J, true, false);
  if not _fn_eh_aprovador(T, J) or _fn_eh_aprovador(T, L) then raise exception 'T2b'; end if;

  -- T3 enviar (a lançadora): 3 programados entram aguardando; o realizado volta recusado; reenviar = "já na fila"
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  r := fn_aprovacao_enviar(T, array[p1, p2, p3, rz], true);
  if (r->>'enviados')::int <> 3 or exists (select 1 from financeiro_aprovacoes where cliente_id = T) then raise exception 'T3a %', r; end if;
  r := fn_aprovacao_enviar(T, array[p1, p2, p3, rz], false);
  if (r->>'enviados')::int <> 3 or jsonb_array_length(r->'recusados') <> 1
     or (select count(*) from financeiro_aprovacoes where cliente_id = T and situacao = 'aguardando') <> 3 then raise exception 'T3b %', r; end if;
  r := fn_aprovacao_enviar(T, array[p1], false);
  if (r->'recusados'->0->>'motivo') <> 'já na fila' then raise exception 'T3c %', r; end if;

  -- T4 decidir: a lançadora e o admin NÃO; recusar sem motivo NÃO; o aprovador aprova p1+p2 e recusa p3
  ok := false; begin perform fn_aprovacao_decidir(T, array[p1], true, null, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T4a (a lançadora aprovou)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_aprovacao_decidir(T, array[p1], true, null, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T4b (o admin aprovou pelo cliente)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', J, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_aprovacao_decidir(T, array[p3], false, ' ', false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T4c (recusa sem motivo)'; end if;
  r := fn_aprovacao_decidir(T, array[p1, p2], true, null, true);
  if (r->>'n')::int <> 2 or exists (select 1 from financeiro_aprovacoes where lancamento_id = p1 and situacao = 'aprovado') then raise exception 'T4d %', r; end if;
  perform fn_aprovacao_decidir(T, array[p1, p2], true, null, false);
  perform fn_aprovacao_decidir(T, array[p3], false, 'Falta o boleto', false);
  if (select situacao from financeiro_aprovacoes where lancamento_id = p3 and situacao <> 'substituido') <> 'recusado' then raise exception 'T4e'; end if;
  -- decidir de novo o que já foi decidido = 40001 (a fila mudou)
  ok := false; begin perform fn_aprovacao_decidir(T, array[p1], true, null, false); exception when sqlstate '40001' then ok := true; end;
  if not ok then raise exception 'T4f'; end if;

  -- T5 agendar (D3): o aguardando/recusado NÃO; o aprovado SIM
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin update financeiro_lancamentos_v2 set status_transacao = 'agendado', data_agendada = data_vencimento where id = p3;
    exception when sqlstate 'P0001' then ok := (sqlerrm like 'BPO:%'); end;
  if not ok then raise exception 'T5a (agendou sem aprovação)'; end if;
  update financeiro_lancamentos_v2 set status_transacao = 'agendado', data_agendada = data_vencimento where id = p2;
  if (select status_transacao from financeiro_lancamentos_v2 where id = p2) <> 'agendado' then raise exception 'T5b'; end if;

  -- T6 editar o aprovado (D6): o valor muda → rodada 2 "aguardando", a 1 substituída, a trilha diz o campo; mudar a descrição não volta
  update financeiro_lancamentos_v2 set descricao = descricao || ' ' where id = p1;
  if (select situacao from financeiro_aprovacoes where lancamento_id = p1 and situacao <> 'substituido') <> 'aprovado' then raise exception 'T6a (descrição voltou à fila)'; end if;
  update financeiro_lancamentos_v2 set valor = valor + 1 where id = p1;
  select observacao into obs from financeiro_aprovacoes where lancamento_id = p1 and situacao = 'aguardando' and rodada = 2;
  if obs is distinct from 'mudou: valor' or (select situacao from financeiro_aprovacoes where lancamento_id = p1 and rodada = 1) <> 'substituido' then
    raise exception 'T6b %', obs; end if;

  -- T7 recusado reenviado = rodada nova; o aprovador que envia o PRÓPRIO nasce aprovado (D10)
  r := fn_aprovacao_enviar(T, array[p3], false);
  if (select rodada from financeiro_aprovacoes where lancamento_id = p3 and situacao = 'aguardando') <> 2 then raise exception 'T7a %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', J, 'role', 'authenticated')::text, true);
  r := fn_aprovacao_enviar(T, array[pv], false);
  select observacao into obs from financeiro_aprovacoes where lancamento_id = pv and situacao = 'aprovado';
  if (r->>'aprovados_pelo_mesmo')::int <> 1 or obs is distinct from 'lançado e aprovado pela mesma pessoa' then raise exception 'T7b %', r; end if;

  -- T8 lista e alertas: a fila tem p1 e p3; o realizado sem aprovação é "pago sem aprovação"
  select count(*) into n from fn_aprovacao_lista(T, array['aguardando'], null);
  if n <> 2 then raise exception 'T8a %', n; end if;
  if not exists (select 1 from fn_aprovacao_alertas(T, date '2000-01-01', date '2100-12-31') x where x.alerta = 'pago_sem_aprovacao' and x.lancamento_id = rz) then
    raise exception 'T8b'; end if;

  -- T9 outro cliente: quem não é do Teste não lê a fila nem envia
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_aprovacao_lista(T, null, null); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T9a'; end if;
  ok := false; begin perform fn_aprovacao_enviar(T, array[p1], false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T9b'; end if;

  -- T10 portas
  if has_function_privilege('anon', 'fn_aprovacao_enviar(uuid,uuid[],boolean)', 'execute')
     or has_function_privilege('anon', 'fn_aprovacao_decidir(uuid,uuid[],boolean,text,boolean)', 'execute')
     or has_function_privilege('authenticated', '_fn_trg_aprovacao_agendar()', 'execute')
     or has_function_privilege('authenticated', '_fn_trg_aprovacao_foto_mudou()', 'execute')
     or has_table_privilege('authenticated', 'financeiro_aprovacoes', 'insert')
     or has_table_privilege('authenticated', 'financeiro_aprovadores', 'update')
     or has_table_privilege('authenticated', 'financeiro_bpo_config', 'insert')
     or exists (select 1 from pg_class where oid in ('public.financeiro_aprovacoes'::regclass, 'public.financeiro_aprovadores'::regclass,
                'public.financeiro_bpo_config'::regclass) and not relrowsecurity)
     then raise exception 'T10'; end if;
  raise exception 'OK BPO-APROVACAO-01 T0–T10';
end $$;
