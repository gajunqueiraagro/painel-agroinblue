-- BOLETO-DDA-API-01 · D3a — teste da 118110 (o e-mail de boletos: endereço, área de espera, registro interno, RPCs da tela).
-- Roda como postgres; os papéis por `set local role` + claims de usuário real; fixture SINTÉTICO no cliente Teste (43f32d07) e num cliente
-- criado aqui. Termina em RAISE 'OK…' (nada fica no banco).
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_outro uuid;
  u_x  constant uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';   -- não admin; vira membro do Teste só aqui
  u_fora constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44'; -- não admin, nunca membro do Teste
  r jsonb; v_local1 text; v_local2 text; n int; e text; v_id uuid; v_xml uuid; v_bol_teste uuid; v_bol_outro uuid;
  md5a constant text := md5('d3-pdf-sintetico'); md5b constant text := md5('d3-xml-sintetico'); md5c constant text := md5('d3-virus');
  como text;
begin
  insert into clientes (nome, slug) values ('D3 outro (sintético)', 'd3-outro-sintetico') returning id into c_outro;

  -- T1 permissões: anon nada; authenticated não chama a interna nem escreve nas tabelas; service_role chama a interna
  if has_function_privilege('anon', 'public.fn_entrada_email_gerar(uuid,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_entrada_registrar(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public._fn_entrada_registrar(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_entrada_token()', 'execute')
     or has_table_privilege('authenticated', 'public.entrada_arquivos', 'insert')
     or has_table_privilege('authenticated', 'public.cliente_entrada_email', 'update')
     or has_table_privilege('anon', 'public.entrada_arquivos', 'select') then
    raise exception 'T1 permissões erradas';
  end if;

  -- T2 quem não é do cliente: 42501
  perform set_config('request.jwt.claims', json_build_object('sub', u_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.fn_entrada_email_gerar(c_teste, null, false); raise exception 'T2 gerou sem ser do cliente';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- T3 membro "campo" do cliente: 42501 (só gestor ou admin)
  insert into cliente_membros (user_id, cliente_id, perfil, ativo) values (u_x, c_teste, 'campo', true);
  execute 'set local role authenticated';
  begin perform public.fn_entrada_email_gerar(c_teste, null, false); raise exception 'T3 campo gerou';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- T4 gestor: a prévia não grava; o real cria <slug>-<token de 10>
  update cliente_membros set perfil = 'gestor_cliente' where user_id = u_x and cliente_id = c_teste;
  execute 'set local role authenticated';
  r := public.fn_entrada_email_gerar(c_teste, null, true);
  if not (r->>'simulado')::boolean or r->>'endereco' <> 'teste-cliente-…@boletos.agroinblue.com.br' then raise exception 'T4 prévia: %', r; end if;
  execute 'reset role';
  select count(*) into n from cliente_entrada_email where cliente_id = c_teste;
  if n <> 0 then raise exception 'T4 a prévia gravou'; end if;
  execute 'set local role authenticated';
  r := public.fn_entrada_email_gerar(c_teste, null, false);
  execute 'reset role';
  v_local1 := split_part(r->>'endereco', '@', 1);
  if v_local1 !~ '^teste-cliente-[a-km-np-z2-9]{10}$' or split_part(r->>'endereco', '@', 2) <> 'boletos.agroinblue.com.br' then raise exception 'T4 endereço: %', r; end if;

  -- T5 trocar: sem motivo recusa; com motivo revoga o antigo (motivo, quem) e cria outro; um ativo só
  execute 'set local role authenticated';
  begin perform public.fn_entrada_email_gerar(c_teste, '  ', false); raise exception 'T5 trocou sem motivo';
  exception when raise_exception then null; end;
  r := public.fn_entrada_email_gerar(c_teste, 'vazou num print', false);
  execute 'reset role';
  v_local2 := split_part(r->>'endereco', '@', 1);
  if v_local2 = v_local1 or r->>'antigo' <> v_local1 || '@boletos.agroinblue.com.br' then raise exception 'T5 troca: %', r; end if;
  select count(*) into n from cliente_entrada_email where cliente_id = c_teste and ativo;
  if n <> 1 then raise exception 'T5 ativos = %', n; end if;
  perform 1 from cliente_entrada_email where local = v_local1 and not ativo and revogado_motivo = 'vazou num print' and revogado_por = u_x;
  if not found then raise exception 'T5 o antigo não ficou revogado com motivo e autor'; end if;

  -- T6 a interna (service_role): domínio errado, endereço desconhecido e o REVOGADO = nada gravado
  execute 'set local role service_role';
  r := public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@outro.com.br', 'mensagem_id', 'm0'));
  if r->>'motivo' <> 'dominio' then raise exception 'T6 domínio: %', r; end if;
  r := public._fn_entrada_registrar(jsonb_build_object('destinatario', 'teste-cliente-zzzzzzzzzz@boletos.agroinblue.com.br', 'mensagem_id', 'm0'));
  if r->>'motivo' <> 'endereco_desconhecido' then raise exception 'T6 desconhecido: %', r; end if;
  r := public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local1 || '@boletos.agroinblue.com.br', 'mensagem_id', 'm0'));
  if r->>'motivo' <> 'endereco_desconhecido' then raise exception 'T6 revogado recebeu: %', r; end if;
  execute 'reset role';
  select count(*) into n from entrada_arquivos where cliente_id in (c_teste, c_outro);
  if n <> 0 then raise exception 'T6 gravou % linha(s)', n; end if;

  -- T7 dois anexos (PDF e XML) = 2 linhas "a_ler"; o SES reentrega = nenhuma nova, "chegou de novo"; maiúscula no endereço casa
  execute 'set local role service_role';
  r := public._fn_entrada_registrar(jsonb_build_object('destinatario', upper(v_local2) || '@Boletos.AgroinBlue.com.br', 'mensagem_id', '<m1@sintetico>',
    'remetente', 'cobranca@fornecedor.sintetico', 'assunto', 'Boleto NF 123', 'recebido_em', '2026-11-16T10:00:00-03:00',
    'verificacao', jsonb_build_object('spf', 'PASS', 'dkim', 'PASS', 'virus', 'PASS'),
    'arquivos', jsonb_build_array(
      jsonb_build_object('nome', 'boleto.pdf', 'tipo', 'pdf', 'tamanho', 52000, 'md5', md5a, 'storage_path', c_teste || '/entrada/' || md5a || '.pdf'),
      jsonb_build_object('nome', 'nota.xml', 'tipo', 'xml', 'tamanho', 9000, 'md5', md5b, 'storage_path', c_teste || '/entrada/' || md5b || '.xml'))));
  if r->>'cliente_id' <> c_teste::text or jsonb_array_length(r->'arquivos') <> 2 or not (r->'arquivos'->0->>'novo')::boolean then raise exception 'T7: %', r; end if;
  r := public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@boletos.agroinblue.com.br', 'mensagem_id', '<m1@sintetico>',
    'arquivos', jsonb_build_array(jsonb_build_object('nome', 'boleto.pdf', 'tipo', 'pdf', 'tamanho', 52000, 'md5', md5a, 'storage_path', c_teste || '/entrada/' || md5a || '.pdf'))));
  if (r->'arquivos'->0->>'novo')::boolean then raise exception 'T7 a reentrega duplicou: %', r; end if;
  execute 'reset role';
  select count(*) into n from entrada_arquivos where cliente_id = c_teste and estado = 'a_ler';
  if n <> 2 then raise exception 'T7 linhas a_ler = %', n; end if;
  perform 1 from entrada_arquivos where md5 = md5a and chegou_de_novo = 1 and verificacao->>'dkim' = 'PASS' and assunto = 'Boleto NF 123';
  if not found then raise exception 'T7 chegou_de_novo/verificação/assunto'; end if;

  -- T8 arquivo com caminho de OUTRO cliente, tipo fora da regra ou acima de 10 MB: recusa (22023), nada gravado
  execute 'set local role service_role';
  foreach como in array array['caminho', 'tipo', 'tamanho'] loop
    begin
      perform public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@boletos.agroinblue.com.br', 'mensagem_id', '<m2>',
        'arquivos', jsonb_build_array(jsonb_build_object('nome', 'x', 'tipo', case when como = 'tipo' then 'exe' else 'pdf' end,
          'tamanho', case when como = 'tamanho' then 10485761 else 10 end, 'md5', md5('t8' || como),
          'storage_path', case when como = 'caminho' then c_outro::text else c_teste::text end || '/entrada/t8.pdf'))));
      raise exception 'T8 aceitou (%)', como;
    exception when invalid_parameter_value then null; end;
  end loop;
  execute 'reset role';

  -- T9 sem anexo = UMA linha (a reentrega não duplica); a confirmação do Gmail tem estado próprio; recusa nomeada entra com o motivo
  execute 'set local role service_role';
  for n in 1..2 loop
    perform public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@boletos.agroinblue.com.br', 'mensagem_id', '<m3>',
      'remetente', 'alguem@sintetico', 'assunto', 'Sua fatura chegou'));
  end loop;
  perform public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@boletos.agroinblue.com.br', 'mensagem_id', '<m4>',
    'remetente', 'forwarding-noreply@google.com', 'assunto', '(#123456789) Confirmação de encaminhamento do Gmail', 'confirmacao_gmail', true));
  perform public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@boletos.agroinblue.com.br', 'mensagem_id', '<m5>',
    'recusas', jsonb_build_array(jsonb_build_object('nome', 'fotos.zip', 'motivo', 'tipo de arquivo fora da regra (só PDF e XML)'))));
  execute 'reset role';
  select count(*) into n from entrada_arquivos where cliente_id = c_teste and mensagem_id = '<m3>' and estado = 'sem_anexo';
  if n <> 1 then raise exception 'T9 sem anexo = %', n; end if;
  perform 1 from entrada_arquivos where mensagem_id = '<m4>' and estado = 'confirmacao_gmail' and assunto like '(#123456789)%';
  if not found then raise exception 'T9 confirmação do Gmail'; end if;
  perform 1 from entrada_arquivos where mensagem_id = '<m5>' and estado = 'recusado' and arquivo_nome = 'fotos.zip' and motivo like 'tipo de arquivo%';
  if not found then raise exception 'T9 recusa nomeada'; end if;

  -- T10 o antivírus acusou: o arquivo vira "recusado", sem md5/caminho (não entra na leitura)
  execute 'set local role service_role';
  perform public._fn_entrada_registrar(jsonb_build_object('destinatario', v_local2 || '@boletos.agroinblue.com.br', 'mensagem_id', '<m6>',
    'verificacao', jsonb_build_object('virus', 'FAIL'),
    'arquivos', jsonb_build_array(jsonb_build_object('nome', 'boleto-virus.pdf', 'tipo', 'pdf', 'tamanho', 10, 'md5', md5c, 'storage_path', c_teste || '/entrada/' || md5c || '.pdf'))));
  execute 'reset role';
  perform 1 from entrada_arquivos where mensagem_id = '<m6>' and estado = 'recusado' and md5 is null and motivo like 'o antivírus%';
  if not found then raise exception 'T10 o arquivo do vírus não foi recusado'; end if;
  perform 1 from entrada_arquivos where md5 = md5c;
  if found then raise exception 'T10 o arquivo do vírus ficou para ler'; end if;

  -- T11 RLS: o membro vê; quem não é do cliente não vê nada (nem o endereço)
  execute 'set local role authenticated';
  select count(*) into n from entrada_arquivos where cliente_id = c_teste;
  if n < 6 then raise exception 'T11 o membro vê %', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  select count(*) into n from entrada_arquivos where cliente_id = c_teste;
  if n <> 0 then raise exception 'T11 quem é de fora vê % linha(s)', n; end if;
  select count(*) into n from cliente_entrada_email where cliente_id = c_teste;
  if n <> 0 then raise exception 'T11 quem é de fora vê o endereço'; end if;
  -- T12 quem é de fora não dispensa nem marca (42501)
  execute 'reset role';
  select id into v_id from entrada_arquivos where mensagem_id = '<m3>';
  select id into v_xml from entrada_arquivos where md5 = md5b;
  execute 'set local role authenticated';
  begin perform public.fn_entrada_dispensar(v_id, false); raise exception 'T12 de fora dispensou';
  exception when insufficient_privilege then null; end;
  begin perform public.fn_entrada_marcar_lido(v_xml, 'nota', null, false); raise exception 'T12 de fora marcou';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- T13 o membro: dispensar (prévia não muda; real muda; 2ª vez "já estava"); marcar o XML como nota; lido não se marca de novo;
  --     boleto de OUTRO cliente recusa (42501); boleto do cliente marca; arquivo lido como boleto/nota não se dispensa
  insert into boletos (cliente_id, codigo_barras, linha_digitavel, tipo, origem) values
    (c_outro, repeat('1', 44), repeat('1', 47), 'bancario', 'pdf') returning id into v_bol_outro;
  insert into boletos (cliente_id, codigo_barras, linha_digitavel, tipo, origem, origem_ref) values
    (c_teste, repeat('2', 44), repeat('2', 47), 'bancario', 'email', '<m1@sintetico>') returning id into v_bol_teste;
  perform set_config('request.jwt.claims', json_build_object('sub', u_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.fn_entrada_dispensar(v_id, true);
  execute 'reset role';
  perform 1 from entrada_arquivos where id = v_id and estado = 'sem_anexo';
  if not found then raise exception 'T13 a prévia do dispensar mudou'; end if;
  execute 'set local role authenticated';
  r := public.fn_entrada_dispensar(v_id, false);
  r := public.fn_entrada_dispensar(v_id, false);
  if not (r->>'ja_estava')::boolean then raise exception 'T13 2º dispensar: %', r; end if;
  r := public.fn_entrada_marcar_lido(v_xml, 'nota', null, false);
  begin perform public.fn_entrada_marcar_lido(v_xml, 'nota', null, false); raise exception 'T13 marcou de novo';
  exception when raise_exception then null; end;
  begin perform public.fn_entrada_dispensar(v_xml, false); raise exception 'T13 dispensou a nota lida';
  exception when raise_exception then null; end;
  select id into v_id from entrada_arquivos where md5 = md5a;
  begin perform public.fn_entrada_marcar_lido(v_id, 'boleto', v_bol_outro, false); raise exception 'T13 ligou boleto de outro cliente';
  exception when insufficient_privilege then null; end;
  begin perform public.fn_entrada_marcar_lido(v_id, 'boleto', null, false); raise exception 'T13 boleto sem id';
  exception when insufficient_privilege then null; end;
  r := public.fn_entrada_marcar_lido(v_id, 'boleto', v_bol_teste, false);
  execute 'reset role';
  perform 1 from entrada_arquivos where id = v_id and estado = 'boleto' and boleto_id = v_bol_teste and lido_por = u_x;
  if not found then raise exception 'T13 o boleto não ficou marcado'; end if;
  perform 1 from entrada_arquivos where id = v_xml and estado = 'nota' and lido_por = u_x;
  if not found then raise exception 'T13 a nota não ficou marcada'; end if;

  raise exception 'OK D3a T1–T13: permissões, endereço (gerar/trocar/revogado), registro (domínio, desconhecido, reentrega, caminho, tipo, tamanho, sem anexo, Gmail, recusa, vírus), RLS, dispensar e marcar';
end $$;
