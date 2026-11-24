-- FOLHA-NA-CAIXA-01 — teste da 118580 (estado 'folha' na entrada). Roda como postgres; o papel por `set local role authenticated` + claims
-- de usuário real; fixture SINTÉTICO no cliente Teste (43f32d07). Termina em RAISE 'OK…' (nada fica).
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora  constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44';
  v_email uuid; a uuid; b uuid; r jsonb; n int; v_lanc uuid;
begin
  select id into v_email from cliente_entrada_email where cliente_id = c_teste and ativo;
  if v_email is null then raise exception 'fixture: o Teste não tem endereço ativo'; end if;
  select id into v_lanc from financeiro_lancamentos_v2 where cliente_id = c_teste and not cancelado limit 1;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5, storage_path, estado)
  values (c_teste, v_email, '<folha-1@t>', now(), 'recibos.pdf', 'pdf', 10, md5('folha-a'), c_teste || '/entrada/' || md5('folha-a') || '.pdf', 'a_ler')
  returning id into a;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, estado, motivo)
  values (c_teste, v_email, '<folha-2@t>', now(), 'sem_anexo', 'chegou sem PDF nem XML') returning id into b;

  -- T1 o banco: 'folha' só com arquivo; 'folha' sem lançamento
  begin update entrada_arquivos set estado = 'folha' where id = b; raise exception 'T1 FALHOU: folha sem arquivo';
  exception when check_violation then null; end;
  begin update entrada_arquivos set estado = 'folha', lancamento_id = v_lanc where id = a; raise exception 'T1 FALHOU: folha com lançamento';
  exception when check_violation then null; end;

  -- T2 de fora do cliente: 42501
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_resolver(a, 'folha', null, null, true); raise exception 'T2 FALHOU: resolveu de fora';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- T3 folha com lançamento e com boleto: recusados (22023)
  begin perform fn_entrada_resolver(a, 'folha', null, v_lanc, false); raise exception 'T3 FALHOU: folha com lançamento';
  exception when invalid_parameter_value then null; end;
  begin perform fn_entrada_resolver(a, 'folha', gen_random_uuid(), null, false); raise exception 'T3 FALHOU: folha com boleto';
  exception when invalid_parameter_value then null; end;
  -- T4 prévia não grava; resolver grava 'folha' + trilha
  r := fn_entrada_resolver(a, 'folha', null, null, true);
  if (select estado from entrada_arquivos where id = a) <> 'a_ler' then raise exception 'T4 FALHOU: a prévia gravou'; end if;
  r := fn_entrada_resolver(a, 'folha', null, null, false);
  if (select estado from entrada_arquivos where id = a) <> 'folha' then raise exception 'T4 FALHOU: não resolveu'; end if;
  select count(*) into n from entrada_trilha where entrada_id = a and acao = 'resolvido' and depois->>'estado' = 'folha';
  if n <> 1 then raise exception 'T4 FALHOU: trilha (% linhas)', n; end if;
  -- T5 o resolvido como folha não se resolve de novo nem se ignora
  begin perform fn_entrada_resolver(a, 'folha', null, null, false); raise exception 'T5 FALHOU: resolveu 2 vezes';
  exception when raise_exception then if sqlerrm <> 'Este arquivo já foi resolvido ou ignorado.' then raise; end if; end;
  begin perform fn_entrada_ignorar(array[a], 'antigo', null, false); raise exception 'T5 FALHOU: ignorou o resolvido';
  exception when raise_exception then if sqlerrm not like 'Este arquivo já foi resolvido%' then raise; end if; end;
  -- T6 Desfazer (voltar) tira a marca: volta a 'a_ler', com trilha 'voltou'
  r := fn_entrada_voltar(a, false);
  if r->>'era' <> 'folha' or (select estado from entrada_arquivos where id = a) <> 'a_ler' then raise exception 'T6 FALHOU: não voltou (%)', r; end if;
  -- T7 os estados de antes seguem (boleto/nota de hoje): 'xyz' recusado
  begin perform fn_entrada_resolver(a, 'xyz', null, null, true); raise exception 'T7 FALHOU: estado inválido aceito';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  -- T8 ACL de hoje mantida
  if has_function_privilege('anon', 'public.fn_entrada_resolver(uuid,text,uuid,uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_resolver(uuid,text,uuid,uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_voltar(uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_entrada_ignorar(uuid[],text,text,boolean)', 'execute') then
    raise exception 'T8 FALHOU: permissões';
  end if;
  raise exception 'OK FOLHA-NA-CAIXA-01 T1–T8 (nada fica)';
end $$;
