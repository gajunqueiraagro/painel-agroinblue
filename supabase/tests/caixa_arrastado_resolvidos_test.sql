-- FOLHA-NA-CAIXA-01b item 4 — teste da 118610 (o arquivo arrastado vira registro; Resolvidos com quem/quando/o que gerou). Roda como
-- postgres; papel por `set local role authenticated` + claims de usuário real; fixture SINTÉTICO no cliente Teste (43f32d07). Termina em RAISE.
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora  constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44';
  r jsonb; r2 jsonb; a uuid; n int; v_lanc uuid; v_email uuid; x record;
begin
  -- T1 permissões: anon nada; authenticated chama as duas
  if has_function_privilege('anon', 'public.fn_entrada_registrar_arrastado(uuid,text,text,integer,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_entrada_resolvidos(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_registrar_arrastado(uuid,text,text,integer,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_resolvidos(uuid)', 'execute') then
    raise exception 'T1 FALHOU: permissões';
  end if;
  -- T2 o banco: e-mail sem endereço / arrastado com endereço ou sem quem = recusado
  select id into v_email from cliente_entrada_email where cliente_id = c_teste and ativo;
  begin insert into entrada_arquivos (cliente_id, origem, entrada_email_id, mensagem_id, recebido_em, estado, motivo)
        values (c_teste, 'email', null, '<arr-x@t>', now(), 'sem_anexo', 'x'); raise exception 'T2 FALHOU: e-mail sem endereço';
  exception when check_violation then null; end;
  begin insert into entrada_arquivos (cliente_id, origem, entrada_email_id, mensagem_id, recebido_em, estado, motivo)
        values (c_teste, 'arrastado', v_email, '<arr-y@t>', now(), 'sem_anexo', 'x'); raise exception 'T2 FALHOU: arrastado com endereço';
  exception when check_violation then null; end;
  -- T3 de fora: 42501 nas duas
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_registrar_arrastado(c_teste, 'a.pdf', 'pdf', 10, md5('arr-a'), true); raise exception 'T3 FALHOU: registrou de fora';
  exception when insufficient_privilege then null; end;
  begin perform fn_entrada_resolvidos(c_teste); raise exception 'T3 FALHOU: leu de fora';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- T4 pedido inválido: 22023
  begin perform fn_entrada_registrar_arrastado(c_teste, 'a.pdf', 'pdf', 10, 'xyz', true); raise exception 'T4 FALHOU: md5 inválido';
  exception when invalid_parameter_value then null; end;
  begin perform fn_entrada_registrar_arrastado(c_teste, 'a.doc', 'doc', 10, md5('arr-a'), true); raise exception 'T4 FALHOU: tipo inválido';
  exception when invalid_parameter_value then null; end;
  -- T5 prévia não grava; registrar grava a linha (origem arrastado, quem arrastou, caminho da regra) + trilha 'arrastado'
  r := fn_entrada_registrar_arrastado(c_teste, 'recibos.pdf', 'pdf', 10, md5('arr-a'), true);
  if r->>'id' is not null or exists (select 1 from entrada_arquivos where cliente_id = c_teste and md5 = md5('arr-a')) then raise exception 'T5 FALHOU: a prévia gravou'; end if;
  r := fn_entrada_registrar_arrastado(c_teste, 'recibos.pdf', 'pdf', 10, md5('arr-a'), false);
  a := (r->>'id')::uuid;
  select * into x from entrada_arquivos where id = a;
  if x.origem <> 'arrastado' or x.enviado_por <> u_admin or x.entrada_email_id is not null or x.estado <> 'a_ler'
     or x.storage_path <> c_teste || '/entrada/' || md5('arr-a') || '.pdf' or r->>'storage_path' <> x.storage_path then
    raise exception 'T5 FALHOU: a linha (%)', r;
  end if;
  select count(*) into n from entrada_trilha where entrada_id = a and acao = 'arrastado';
  if n <> 1 then raise exception 'T5 FALHOU: trilha (%)', n; end if;
  -- T6 o mesmo arquivo de novo = a mesma linha (ja_existia), nada novo
  r2 := fn_entrada_registrar_arrastado(c_teste, 'outro-nome.pdf', 'pdf', 10, md5('arr-a'), false);
  if (r2->>'id')::uuid <> a or (r2->>'ja_existia')::boolean is not true then raise exception 'T6 FALHOU: (%)', r2; end if;
  select count(*) into n from entrada_arquivos where cliente_id = c_teste and md5 = md5('arr-a');
  if n <> 1 then raise exception 'T6 FALHOU: % linhas', n; end if;
  -- T7 resolve como folha (o fluxo de hoje) e aparece em Resolvidos com quem, quando e o que gerou (sem trilha de recibo: 0 lançamentos)
  r := fn_entrada_resolver(a, 'folha', null, null, false);
  select * into x from fn_entrada_resolvidos(c_teste) z where z.entrada_id = a;
  if x.origem <> 'arrastado' or x.quem is null or x.quando is null or (x.o_que->>'lancamentos')::int <> 0 then
    raise exception 'T7 FALHOU: resolvidos (%, %, %, %)', x.origem, x.quem, x.quando, x.o_que;
  end if;
  -- T8 a nota resolvida traz o lançamento; o arrastado volta e se ignora como o do e-mail
  select id into v_lanc from financeiro_lancamentos_v2 where cliente_id = c_teste and not cancelado limit 1;
  r := fn_entrada_registrar_arrastado(c_teste, 'nota.xml', 'xml', 10, md5('arr-b'), false);
  r2 := fn_entrada_resolver((r->>'id')::uuid, 'nota', null, v_lanc, false);
  select * into x from fn_entrada_resolvidos(c_teste) z where z.entrada_id = (r->>'id')::uuid;
  if (x.o_que->>'lancamento_id')::uuid is distinct from v_lanc then raise exception 'T8 FALHOU: nota (%)', x.o_que; end if;
  r2 := fn_entrada_voltar(a, false);
  r2 := fn_entrada_ignorar(array[a], 'antigo', null, false);
  if (select estado from entrada_arquivos where id = a) <> 'dispensado' then raise exception 'T8 FALHOU: ignorar o arrastado'; end if;
  execute 'reset role';
  raise exception 'OK CAIXA-ARRASTADO T1–T8 (nada fica)';
end $$;
