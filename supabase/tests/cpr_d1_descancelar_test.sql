-- CPR-D1 (118490) — teste da fn_lancamento_descancelar. Roda como postgres DEPOIS da migration; termina em RAISE 'OK…'; nada fica.
-- Fixture SINTÉTICA no cliente Teste (43f32d07): lançamentos previstos 'SINT CPR-D1 …', 1 extrato + 1 vínculo, 1 fechamento.
-- Os usuários são lidos na hora (o admin; um usuário de OUTRO cliente), nunca escritos aqui.
-- T1 nasce fechada (SECDEF, sem anon, com authenticated) · T2 usuário de outro cliente = 42501 (o lançamento segue cancelado) ·
-- T3 o "Não vai acontecer" (motivo fixo) se desfaz: a prévia não grava; o desfazer volta cancelado = false com os campos limpos e a
-- trilha (audit_log 'editou', antes com o motivo, autor = quem chamou) · T4 cancelado por outro caminho = P0001 · T5 mês fechado =
-- P0001 · T6 cancelamento que desfez o vínculo com o extrato = P0001.
-- Mutações (voltam conferidas por md5): M1 sem o tenant_ok → T2 · M2 sem o motivo → T4 · M3 sem o mês fechado → T5 · M4 sem o vínculo → T6.

create or replace function pg_temp.checa() returns text[] language plpgsql as $c$
declare
  f text[] := '{}'; c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; c_motivo constant text := 'CPR: vencido não vai acontecer';
  v_faz uuid; v_conta uuid; v_admin uuid; v_fora uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; v_ext uuid; v_estado text; j jsonb; r record;
begin
  -- T1
  if not (select prosecdef from pg_proc where oid = 'public.fn_lancamento_descancelar(uuid,boolean)'::regprocedure)
     or has_function_privilege('anon', 'public.fn_lancamento_descancelar(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_lancamento_descancelar(uuid,boolean)', 'execute') then
    f := f || 'T1 não nasceu fechada'::text;
  end if;

  select id into v_faz from public.fazendas where cliente_id = c_cli limit 1;
  select id into v_conta from public.financeiro_contas_bancarias where cliente_id = c_cli limit 1;
  /* admin é pelo PERFIL (is_admin_agroinblue lê cliente_membros), não pela tabela admin_agroinblue */
  select m.user_id into v_admin from public.cliente_membros m where m.ativo and m.perfil = 'admin_agroinblue' limit 1;
  select m.user_id into v_fora from public.cliente_membros m
   where m.ativo and m.perfil <> 'admin_agroinblue'
     and m.user_id not in (select user_id from public.cliente_membros where cliente_id = c_cli or (perfil = 'admin_agroinblue' and ativo))
     and m.user_id not in (select user_id from public.admin_agroinblue) limit 1;
  if v_faz is null or v_conta is null or v_admin is null or v_fora is null then return f || 'FIXTURE sem fazenda/conta/admin/usuário de fora'::text; end if;

  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao)
  values (c_cli, v_faz, '2-Saídas', 12.34, 'SINT CPR-D1 T3', '2026-10-05', '2026-10-10', 'previsto') returning id into l3;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao)
  values (c_cli, v_faz, '2-Saídas', 12.35, 'SINT CPR-D1 T4', '2026-10-05', '2026-10-10', 'previsto') returning id into l4;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao)
  values (c_cli, v_faz, '2-Saídas', 12.36, 'SINT CPR-D1 T5', '2026-09-05', '2026-09-10', 'previsto') returning id into l5;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao)
  values (c_cli, v_faz, '2-Saídas', 12.37, 'SINT CPR-D1 T6', '2026-10-05', '2026-10-10', 'previsto') returning id into l6;
  insert into public.extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, documento)
  values (c_cli, v_conta, '2026-10-10', -12.37, 'debito', 'SINT-CPR-D1-' || gen_random_uuid(), 'SINT-CPR-D1-' || gen_random_uuid()) returning id into v_ext;
  insert into public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado) values (c_cli, v_ext, l6, 12.37);

  -- o gesto: cancelar pela RPC de hoje, como o admin (l3, l5, l6 com o motivo fixo; l4 por outro caminho)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.fn_cancelar_lancamento_auditoria(l3, c_motivo);
  perform public.fn_cancelar_lancamento_auditoria(l4, 'duplicado_auditoria');
  perform public.fn_cancelar_lancamento_auditoria(l5, c_motivo);
  perform public.fn_cancelar_lancamento_auditoria(l6, c_motivo);
  execute 'reset role';
  insert into public.financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento) values (c_cli, v_faz, '2026-09', 'fechado');

  -- T2: o usuário de fora
  perform set_config('request.jwt.claims', json_build_object('sub', v_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.fn_lancamento_descancelar(l3); v_estado := 'desfez';
  exception when others then v_estado := sqlstate; end;
  execute 'reset role';
  if v_estado <> '42501' or not (select cancelado from public.financeiro_lancamentos_v2 where id = l3) then
    f := f || ('T2 o usuário de fora desfez: ' || v_estado);
  end if;

  -- T3..T6: o admin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin j := public.fn_lancamento_descancelar(l3, true); v_estado := 'ok';
  exception when others then v_estado := sqlstate || ' ' || sqlerrm; end;
  if v_estado <> 'ok' or (j->>'simulado')::boolean is not true then f := f || ('T3 prévia: ' || v_estado); end if;
  execute 'reset role';
  if not (select cancelado from public.financeiro_lancamentos_v2 where id = l3) then f := f || 'T3 a prévia gravou'::text; end if;
  execute 'set local role authenticated';
  begin j := public.fn_lancamento_descancelar(l3); v_estado := 'ok';
  exception when others then v_estado := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  select cancelado, cancelado_em, cancelado_por, cancelado_motivo into r from public.financeiro_lancamentos_v2 where id = l3;
  if v_estado <> 'ok' or r.cancelado or r.cancelado_em is not null or r.cancelado_por is not null or r.cancelado_motivo is not null then
    f := f || ('T3 não desfez: ' || v_estado);
  end if;
  if not exists (select 1 from public.audit_log a where a.registro_id = l3 and a.acao = 'editou' and a.usuario_id = v_admin
                  and a.dados_anteriores->>'cancelado_motivo' = c_motivo and (a.dados_novos->>'cancelado')::boolean = false) then
    f := f || 'T3 sem trilha do desfazer'::text;
  end if;

  execute 'set local role authenticated';
  begin perform public.fn_lancamento_descancelar(l4); v_estado := 'desfez';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> 'P0001' then f := f || ('T4 desfez o cancelado por outro caminho: ' || v_estado); end if;
  begin perform public.fn_lancamento_descancelar(l5); v_estado := 'desfez';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> 'P0001' then f := f || ('T5 desfez no mês fechado: ' || v_estado); end if;
  begin perform public.fn_lancamento_descancelar(l6); v_estado := 'desfez';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> 'P0001' then f := f || ('T6 desfez o que tinha vínculo com o extrato: ' || v_estado); end if;
  execute 'reset role';

  delete from public.financeiro_fechamentos where cliente_id = c_cli and fazenda_id = v_faz and ano_mes = '2026-09' and status_fechamento = 'fechado';
  return f;
end $c$;

do $t$
declare f text[]; v_def text; v_md5 text; v_ok text := ''; v_fn text := 'public.fn_lancamento_descancelar(uuid,boolean)';
  m record;
begin
  f := pg_temp.checa();
  if cardinality(f) > 0 then raise exception 'FALHAS: %', f; end if;
  v_ok := 'T1–T6 ok; ';
  v_def := pg_get_functiondef(v_fn::regprocedure); v_md5 := md5(v_def);
  for m in select * from (values
      ('M1', 'if not public.tenant_ok(v.cliente_id) then', 'if false then', 'T2'),
      ('M2', 'if v.cancelado_motivo is distinct from c_motivo then', 'if false then', 'T4'),
      ('M3', 'and f.ano_mes = v.ano_mes and f.status_fechamento = ''fechado'') then', 'and false) then', 'T5'),
      ('M4', 'where c.lancamento_id = v.id and c.desfeito_em is not null', 'where false', 'T6')) x(nome, de, para, cai)
  loop
    if position(m.de in v_def) = 0 then raise exception '% âncora não achada', m.nome; end if;
    execute replace(v_def, m.de, m.para);
    f := pg_temp.checa();
    if not exists (select 1 from unnest(f) e where e like m.cai || ' %') then raise exception '% não derrubou o %: %', m.nome, m.cai, f; end if;
    execute v_def;
    if md5(pg_get_functiondef(v_fn::regprocedure)) <> v_md5 then raise exception '% a função não voltou (md5)', m.nome; end if;
    v_ok := v_ok || m.nome || '→' || m.cai || ' ';
  end loop;
  raise exception 'OK CPR-D1: % (função de volta, md5 %)', v_ok, v_md5;
end $t$;
