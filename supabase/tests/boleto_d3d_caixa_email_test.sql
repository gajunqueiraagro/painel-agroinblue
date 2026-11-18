-- BOLETO D3d — teste da 118180 (ignorar com motivo, voltar, resolver, trilha imutável, D5, tela antiga). Roda como postgres; os papéis por
-- `set local role authenticated` + claims de usuário real; fixture SINTÉTICO no cliente Teste (43f32d07). Termina em RAISE 'OK…'.
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora  constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44'; -- não admin, nunca membro do Teste
  u_x     constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; -- sem vínculo nenhum; vira membro "leitura" do Teste só aqui
  v_email uuid; a uuid; b uuid; c uuid; s uuid; v_lanc uuid; v_lanc_outro uuid; v_bol uuid; r jsonb; n int; e text;
begin
  select id into v_email from cliente_entrada_email where cliente_id = c_teste and ativo;
  if v_email is null then raise exception 'fixture: o Teste não tem endereço ativo'; end if;
  select id into v_lanc from financeiro_lancamentos_v2 where cliente_id = c_teste and not cancelado limit 1;
  select id into v_lanc_outro from financeiro_lancamentos_v2 where cliente_id <> c_teste limit 1;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5, storage_path, estado)
  values (c_teste, v_email, '<d3d-1@t>', now(), 'a.pdf', 'pdf', 10, md5('d3d-a'), c_teste || '/entrada/' || md5('d3d-a') || '.pdf', 'a_ler')
  returning id into a;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5, storage_path, estado)
  values (c_teste, v_email, '<d3d-1@t>', now(), 'b.xml', 'xml', 10, md5('d3d-b'), c_teste || '/entrada/' || md5('d3d-b') || '.xml', 'nao_reconhecido')
  returning id into b;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5, storage_path, estado)
  values (c_teste, v_email, '<d3d-2@t>', now(), 'c.pdf', 'pdf', 10, md5('d3d-c'), c_teste || '/entrada/' || md5('d3d-c') || '.pdf', 'a_ler')
  returning id into c;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, estado, motivo)
  values (c_teste, v_email, '<d3d-3@t>', now(), 'sem_anexo', 'chegou sem PDF nem XML') returning id into s;

  -- T1 permissões: anon nada; authenticated chama as 3 da tela e não as internas; não escreve nas tabelas
  if has_function_privilege('anon', 'public.fn_entrada_ignorar(uuid[],text,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_ignorar(uuid[],text,text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_voltar(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_resolver(uuid,text,uuid,uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_entrada_ignorar(uuid[],text,text,boolean)', 'execute')
     or has_table_privilege('authenticated', 'public.entrada_trilha', 'insert')
     or has_table_privilege('anon', 'public.entrada_trilha', 'select') then
    raise exception 'T1 FALHOU: permissões';
  end if;

  -- T2 de fora do cliente: 42501 nas três
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_ignorar(array[a], 'antigo', null, true); raise exception 'T2 FALHOU: ignorou de fora';
  exception when insufficient_privilege then null; end;
  begin perform fn_entrada_voltar(a, true); raise exception 'T2 FALHOU: voltou de fora';
  exception when insufficient_privilege then null; end;
  begin perform fn_entrada_resolver(a, 'nota', null, null, true); raise exception 'T2 FALHOU: resolveu de fora';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- T3 motivo: vazio/inválido/'anterior_a_regra' recusados; 'outro' sem detalhe recusado
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach e in array array['', 'xyz', 'anterior_a_regra'] loop
    begin perform fn_entrada_ignorar(array[a], e, null, false); raise exception 'T3 FALHOU: motivo % aceito', e;
    exception when raise_exception then if sqlerrm not like 'Escolha o motivo.%' then raise; end if; end;
  end loop;
  begin perform fn_entrada_ignorar(array[a], 'outro', '  ', false); raise exception 'T3 FALHOU: outro sem detalhe';
  exception when raise_exception then if sqlerrm <> 'Escreva o motivo.' then raise; end if; end;

  -- T4 prévia não grava; ignorar vários de uma vez grava motivo + trilha; o já ignorado conta como "já estava"
  r := fn_entrada_ignorar(array[a, b, s], 'antigo', null, true);
  if (r ->> 'ignorados')::int <> 3 or exists (select 1 from entrada_arquivos where id in (a, b, s) and estado = 'dispensado') then
    raise exception 'T4 FALHOU (prévia): %', r;
  end if;
  r := fn_entrada_ignorar(array[a, b, s], 'antigo', null, false);
  select count(*) into n from entrada_arquivos where id in (a, b, s) and estado = 'dispensado' and ignorado_motivo = 'antigo'
     and dispensado_por = u_admin;
  if n <> 3 then raise exception 'T4 FALHOU: % ignorados', n; end if;
  select count(*) into n from entrada_trilha where entrada_id in (a, b, s) and acao = 'ignorado' and por = u_admin and via = 'tela'
     and antes ->> 'estado' <> 'dispensado' and depois ->> 'ignorado_motivo' = 'antigo';
  if n <> 3 then raise exception 'T4 FALHOU: trilha %', n; end if;
  r := fn_entrada_ignorar(array[a], 'repetido', null, false);
  if (r ->> 'ja_estavam')::int <> 1 or (select ignorado_motivo from entrada_arquivos where id = a) <> 'antigo' then
    raise exception 'T4 FALHOU: re-ignorar trocou o motivo';
  end if;

  -- T5 voltar: prévia não grava; volta para "a ler" sem motivo; a linha sem arquivo (sem anexo) não volta
  r := fn_entrada_voltar(a, true);
  if (select estado from entrada_arquivos where id = a) <> 'dispensado' then raise exception 'T5 FALHOU: a prévia voltou'; end if;
  r := fn_entrada_voltar(a, false);
  if (select estado || coalesce(ignorado_motivo, '-') || coalesce(dispensado_em::text, '-') from entrada_arquivos where id = a) <> 'a_ler--' then
    raise exception 'T5 FALHOU: não voltou limpo';
  end if;
  begin perform fn_entrada_voltar(s, false); raise exception 'T5 FALHOU: voltou linha sem arquivo';
  exception when raise_exception then if sqlerrm not like 'Esta linha não tem arquivo%' then raise; end if; end;

  -- T6 resolver: nota com lançamento do cliente; lançamento de outro cliente = 42501; resolvido não se ignora; Desfazer volta
  begin perform fn_entrada_resolver(c, 'nota', null, v_lanc_outro, false); raise exception 'T6 FALHOU: lançamento de outro cliente';
  exception when insufficient_privilege then null; end;
  perform fn_entrada_resolver(c, 'nota', null, v_lanc, false);
  if (select estado || lancamento_id::text from entrada_arquivos where id = c) <> 'nota' || v_lanc::text then raise exception 'T6 FALHOU: não resolveu'; end if;
  begin perform fn_entrada_ignorar(array[c], 'antigo', null, false); raise exception 'T6 FALHOU: ignorou um resolvido';
  exception when raise_exception then if sqlerrm not like 'Este arquivo já foi resolvido%' then raise; end if; end;
  begin perform fn_entrada_resolver(c, 'nota', null, null, false); raise exception 'T6 FALHOU: resolveu duas vezes';
  exception when raise_exception then if sqlerrm not like 'Este arquivo já foi resolvido%' then raise; end if; end;
  perform fn_entrada_voltar(c, false);
  if (select estado from entrada_arquivos where id = c) <> 'a_ler' or (select lancamento_id from entrada_arquivos where id = c) is not null then
    raise exception 'T6 FALHOU: o Desfazer não limpou';
  end if;
  -- boleto: precisa do boleto, e do MESMO cliente
  begin perform fn_entrada_resolver(c, 'boleto', null, null, false); raise exception 'T6 FALHOU: boleto sem id';
  exception when invalid_parameter_value then null; end;
  r := fn_boleto_entrar(c_teste, jsonb_build_object('linha', '34191090080488182004919646100008816110000300650', 'origem', 'email',
                                                  'arquivo_nome', 'c.pdf', 'origem_ref', '<d3d-2@t>'), false);
  v_bol := (r ->> 'id')::uuid;
  if v_bol is null then raise exception 'fixture: o boleto não entrou: %', r; end if;
  perform fn_entrada_resolver(c, 'boleto', v_bol, null, false);
  if (select estado from entrada_arquivos where id = c) <> 'boleto' then raise exception 'T6 FALHOU: boleto não resolveu'; end if;
  select count(*) into n from entrada_trilha where entrada_id = c;
  if n <> 3 then raise exception 'T6 FALHOU: trilha do c = %', n; end if;
  execute 'reset role';

  -- T7 a trilha é imutável (nem o postgres altera)
  begin update entrada_trilha set motivo = 'x' where entrada_id = a; raise exception 'T7 FALHOU: update';
  exception when insufficient_privilege then null; end;
  begin delete from entrada_trilha where entrada_id = a; raise exception 'T7 FALHOU: delete';
  exception when insufficient_privilege then null; end;

  -- T8 só leitura não grava (a guarda nova); 42501 com a frase da casa
  insert into cliente_membros (user_id, cliente_id, perfil, ativo) values (u_x, c_teste, 'leitura', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_ignorar(array[a], 'antigo', null, false); raise exception 'T8 FALHOU: leitura ignorou';
  exception when insufficient_privilege then if sqlerrm not like 'Seu acesso é só de leitura%' then raise; end if; end;
  execute 'reset role';

  -- T9 a tela antiga: o "dispensar" grava 'anterior_a_regra' + trilha e devolve o formato de hoje
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := fn_entrada_dispensar(a, false);
  if r <> '{"ok": true, "simulado": false, "ja_estava": false}'::jsonb
     or (select ignorado_motivo from entrada_arquivos where id = a) <> 'anterior_a_regra' then
    raise exception 'T9 FALHOU: %', r;
  end if;
  r := fn_entrada_dispensar(a, false);
  if (r ->> 'ja_estava')::boolean is not true then raise exception 'T9 FALHOU (2ª): %', r; end if;
  execute 'reset role';

  -- T10 as regras da tabela: ignorado sem motivo e lançamento em linha não resolvida são recusados pelo banco
  begin update entrada_arquivos set ignorado_motivo = null where id = a; raise exception 'T10 FALHOU: ignorado sem motivo';
  exception when check_violation then null; end;
  begin update entrada_arquivos set lancamento_id = v_lanc where id = b; raise exception 'T10 FALHOU: lançamento sem resolver';
  exception when check_violation then null; end;

  -- T11 D5: os 2 XMLs da Pontero voltaram para "a ler", com a trilha 'sistema:manutenção' e o "antes" guardado
  select count(*) into n from entrada_arquivos
   where id in ('2df413c3-7390-4f89-8556-f5cf7e517e52', '4afe8530-a45e-47a5-9e27-c0e53c49f034') and estado = 'a_ler' and ignorado_motivo is null;
  if n <> 2 then raise exception 'T11 FALHOU: % voltaram', n; end if;
  select count(*) into n from entrada_trilha
   where entrada_id in ('2df413c3-7390-4f89-8556-f5cf7e517e52', '4afe8530-a45e-47a5-9e27-c0e53c49f034') and acao = 'voltou'
     and via = 'sistema:manutenção' and antes ->> 'estado' = 'dispensado' and antes ? 'dispensado_em' and por is null;
  if n <> 2 then raise exception 'T11 FALHOU: trilha D5 %', n; end if;
  if exists (select 1 from entrada_arquivos where estado = 'dispensado' and ignorado_motivo is null) then raise exception 'T11 FALHOU: dispensado sem motivo'; end if;

  raise exception 'OK BOLETO-D3d 118180: T1–T11 (permissões; de fora 42501; motivo obrigatório; prévia não grava; ignorar vários com trilha; voltar limpo; resolver nota/boleto só do cliente, resolvido não se ignora, Desfazer; trilha imutável; só leitura recusado; tela antiga com anterior_a_regra; checks; D5 2 de volta)';
end $$;
