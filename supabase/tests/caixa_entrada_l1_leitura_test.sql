-- CAIXA DE ENTRADA L1 — teste da 118190 (entrada_leitura + fn_entrada_leitura_gravar). Roda como postgres; papéis por
-- `set local role authenticated` + claims de usuário real; fixture SINTÉTICO no cliente Teste (43f32d07). Termina em RAISE 'OK…'.
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora  constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44'; -- não admin, nunca membro do Teste
  u_x     constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; -- sem vínculo; vira membro "leitura" do Teste só aqui
  v_email uuid; a uuid; x uuid; r jsonb; n int;
begin
  select id into v_email from cliente_entrada_email where cliente_id = c_teste and ativo;
  if v_email is null then raise exception 'fixture: o Teste não tem endereço ativo'; end if;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5, storage_path, estado)
  values (c_teste, v_email, '<l1-1@t>', now(), 'holerite.pdf', 'pdf', 10, md5('l1-a'), c_teste || '/entrada/' || md5('l1-a') || '.pdf', 'a_ler')
  returning id into a;
  insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, arquivo_nome, tipo, tamanho_bytes, md5, storage_path, estado)
  values (c_teste, v_email, '<l1-1@t>', now(), 'nota.xml', 'xml', 10, md5('l1-x'), c_teste || '/entrada/' || md5('l1-x') || '.xml', 'a_ler')
  returning id into x;

  -- T1 permissões: anon nada; authenticated só a RPC e o SELECT (nunca escreve direto)
  if has_function_privilege('anon', 'public.fn_entrada_leitura_gravar(uuid,text,text,text[],boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_leitura_gravar(uuid,text,text,text[],boolean)', 'execute')
     or has_table_privilege('authenticated', 'public.entrada_leitura', 'insert')
     or has_table_privilege('authenticated', 'public.entrada_leitura', 'update')
     or has_table_privilege('anon', 'public.entrada_leitura', 'select')
     or not has_table_privilege('authenticated', 'public.entrada_leitura', 'select') then
    raise exception 'T1 FALHOU: permissões';
  end if;

  -- T2 de fora do cliente: 42501
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_leitura_gravar(a, 'caixa-1', 'nada', array['x'], false); raise exception 'T2 FALHOU: gravou de fora';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- T3 prévia não grava; gravar grava (md5 do arquivo, autor, caracteres); a RLS deixa ver
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := fn_entrada_leitura_gravar(a, 'caixa-1', 'nada', array['DANFE ESCANEADO', 'pág 2'], true);
  if (r ->> 'simulado')::boolean is not true or exists (select 1 from entrada_leitura where entrada_id = a) then raise exception 'T3 FALHOU (prévia): %', r; end if;
  r := fn_entrada_leitura_gravar(a, 'caixa-1', 'nada', array['DANFE ESCANEADO', 'pág 2'], false);
  select count(*) into n from entrada_leitura where entrada_id = a and md5 = md5('l1-a') and lido_por = u_admin and caracteres = 20
     and cliente_id = c_teste and cardinality(paginas) = 2 and resultado = 'nada';
  if n <> 1 then raise exception 'T3 FALHOU: gravado %', n; end if;

  -- T4 o mesmo leitor no mesmo arquivo não regrava; um leitor novo substitui
  r := fn_entrada_leitura_gravar(a, 'caixa-1', 'imagem', array['outro'], false);
  if (r ->> 'ja_estava')::boolean is not true or (select resultado from entrada_leitura where entrada_id = a) <> 'nada' then raise exception 'T4 FALHOU: regravou'; end if;
  r := fn_entrada_leitura_gravar(a, 'caixa-2', 'imagem', array['PÁGINA SEM TEXTO'], false);
  if (r ->> 'substitui')::boolean is not true or (select leitor || resultado from entrada_leitura where entrada_id = a) <> 'caixa-2imagem' then
    raise exception 'T4 FALHOU: não substituiu %', r;
  end if;

  -- T5 recusas: XML, resultado inválido, sem página, 61 páginas, texto grande demais
  begin perform fn_entrada_leitura_gravar(x, 'caixa-1', 'nada', array['x'], false); raise exception 'T5 FALHOU: XML aceito';
  exception when raise_exception then if sqlerrm not like 'Só o texto de um PDF%' then raise; end if; end;
  begin perform fn_entrada_leitura_gravar(a, 'caixa-3', 'boleto', array['x'], false); raise exception 'T5 FALHOU: resultado aceito';
  exception when raise_exception then if sqlerrm <> 'Resultado inválido.' then raise; end if; end;
  begin perform fn_entrada_leitura_gravar(a, 'caixa-3', 'nada', array[]::text[], false); raise exception 'T5 FALHOU: sem página';
  exception when raise_exception then if sqlerrm <> 'De 1 a 60 páginas.' then raise; end if; end;
  begin perform fn_entrada_leitura_gravar(a, 'caixa-3', 'nada', array_fill('p'::text, array[61]), false); raise exception 'T5 FALHOU: 61 páginas';
  exception when raise_exception then if sqlerrm <> 'De 1 a 60 páginas.' then raise; end if; end;
  begin perform fn_entrada_leitura_gravar(a, 'caixa-3', 'nada', array[repeat('x', 400001)], false); raise exception 'T5 FALHOU: grande';
  exception when raise_exception then if sqlerrm <> 'Texto grande demais para guardar.' then raise; end if; end;
  begin perform fn_entrada_leitura_gravar(a, ' ', 'nada', array['x'], false); raise exception 'T5 FALHOU: leitor vazio';
  exception when raise_exception then if sqlerrm <> 'Leitor inválido.' then raise; end if; end;
  -- T5b F3: texto de documento da folha NUNCA (recibo, holerite, 13º, férias, FGTS, eSocial; maiúscula/minúscula)
  declare t text;
  begin
    foreach t in array array['RECIBO DE PAGAMENTO DE SALÁRIO', 'Holerite', 'Adiantamento 13o.Salário Novembro/2026', '13º SALÁRIO 1ª PARCELA',
                             'Aviso de Férias', 'Guia do FGTS Digital', 'DAE eSocial', 'Folha de Pagamento'] loop
      begin perform fn_entrada_leitura_gravar(a, 'caixa-4', 'nada', array['cabeçalho', t], false); raise exception 'T5b FALHOU: folha aceita (%)', t;
      exception when raise_exception then if sqlerrm <> 'Documento da folha: vai para a Folha, não se guarda aqui.' then raise; end if; end;
    end loop;
  end;
  if (select leitor from entrada_leitura where entrada_id = a) <> 'caixa-2' then raise exception 'T5b FALHOU: a recusa mexeu na linha'; end if;

  -- T6 escrita direta recusada (sem privilégio) e de fora não vê
  begin insert into entrada_leitura (entrada_id, cliente_id, md5, leitor, resultado, paginas, caracteres) values (x, c_teste, 'm', 'l', 'nada', array['x'], 1);
    raise exception 'T6 FALHOU: insert direto';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from entrada_leitura where entrada_id = a;
  if n <> 0 then raise exception 'T6 FALHOU: de fora vê o texto'; end if;
  execute 'reset role';

  -- T7 só leitura não grava (a guarda da casa)
  insert into cliente_membros (user_id, cliente_id, perfil, ativo) values (u_x, c_teste, 'leitura', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_leitura_gravar(a, 'caixa-9', 'nada', array['x'], false); raise exception 'T7 FALHOU: leitura gravou';
  exception when insufficient_privilege then if sqlerrm not like 'Seu acesso é só de leitura%' then raise; end if; end;
  execute 'reset role';

  raise exception 'OK CAIXA-L1 118190: T1–T7 + T5b (permissões; de fora 42501 e não vê; prévia não grava; gravar com md5/autor; mesmo leitor não regrava, novo substitui; recusas; F3 texto da folha recusado; escrita direta recusada; só leitura recusado)';
end $$;
