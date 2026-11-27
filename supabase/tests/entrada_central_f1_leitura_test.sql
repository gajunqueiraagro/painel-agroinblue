-- ENTRADA-CENTRAL-01 F1 — teste da 118880 (a leitura guardada). Roda como postgres; papel por `set local role authenticated` + claims de
-- usuário real; fixture SINTÉTICO no cliente Teste (43f32d07, o endereço de entrada dele). Termina em RAISE: nada fica.
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora  constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44';
  chave constant text := '50261111222333000181550050000123451123456786';
  cb constant text := '34198161100003006501090004881820041964610000';
  l_nota jsonb := jsonb_build_object('v', 'caixa-1', 'k', 'nota', 'nota', jsonb_build_object('chave', chave, 'numero', '12345', 'emitente', 'AGRO SINTETICO', 'valor', 148, 'vencimento', '2026-12-10'));
  l_bol jsonb := jsonb_build_object('v', 'caixa-1', 'k', 'boletos',
    'boletos', jsonb_build_array(jsonb_build_object('ok', true, 'codigo_barras', cb, 'linha', '34191090080488182004919646100008816110000300650', 'tipo', 'bancario', 'banco', '341', 'valor', 3006.5, 'vencimento', '2026-10-26')),
    'beneficiario', jsonb_build_object('documento', '11222333000181', 'nome', 'AGRO SINTETICO', 'confira', false),
    'pagador', jsonb_build_object('documento', '11144477735', 'nome', 'FAZENDA TESTE', 'confira', false), 'paginaDeCada', jsonb_build_array(1), 'totalDePaginas', 1);
  v_local text; r jsonb; n int; a uuid; x record;
begin
  -- T1 a forma: aceita as 6; recusa chave estranha (texto), folha com dado, nota sem chave, boleto sem código, grande demais
  if not (_fn_entrada_leitura_valida(l_nota) and _fn_entrada_leitura_valida(l_bol)
      and _fn_entrada_leitura_valida('{"v":"caixa-1","k":"nada","frase":"Não é boleto nem nota."}')
      and _fn_entrada_leitura_valida('{"v":"caixa-1","k":"folha"}') and _fn_entrada_leitura_valida('{"v":"caixa-1","k":"resumo"}')
      and _fn_entrada_leitura_valida('{"v":"caixa-1","k":"senha"}')) then raise exception 'T1 FALHOU: recusou uma forma boa'; end if;
  if _fn_entrada_leitura_valida(l_nota || '{"texto":"linha 1 do PDF"}')
     or _fn_entrada_leitura_valida('{"v":"caixa-1","k":"folha","pessoas":[{"nome":"X","liquido":1000}]}')
     or _fn_entrada_leitura_valida(jsonb_set(l_nota, '{nota,chave}', '"123"'))
     or _fn_entrada_leitura_valida(jsonb_set(l_bol, '{boletos,0,codigo_barras}', '"1"'))
     or _fn_entrada_leitura_valida(jsonb_set(l_bol, '{pagador,texto}', '"x"'))
     or _fn_entrada_leitura_valida(jsonb_build_object('v', 'caixa-1', 'k', 'nada', 'frase', repeat('x', 301)))
     or _fn_entrada_leitura_valida('{"v":"caixa-1","k":"outro"}') or _fn_entrada_leitura_valida('{"k":"senha"}')
     or _fn_entrada_leitura_valida('[]') or _fn_entrada_leitura_valida(null) then
    raise exception 'T1 FALHOU: aceitou uma forma ruim';
  end if;
  -- T2 permissões: anon nada; authenticated chama a de guardar
  if has_function_privilege('anon', 'public.fn_entrada_leitura_guardar(uuid,jsonb,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_entrada_leitura_guardar(uuid,jsonb,boolean)', 'execute') then
    raise exception 'T2 FALHOU: permissões';
  end if;
  -- T3 a chegada guarda a leitura da Lambda; a inválida é ignorada e o arquivo entra igual
  select local into v_local from cliente_entrada_email where cliente_id = c_teste and ativo;
  r := _fn_entrada_registrar(jsonb_build_object('destinatario', v_local || '@' || _fn_entrada_dominio(), 'mensagem_id', '<f1-a@t>',
        'arquivos', jsonb_build_array(
          jsonb_build_object('nome', 'nota.xml', 'tipo', 'xml', 'tamanho', 10, 'md5', md5('f1-a'), 'storage_path', c_teste || '/entrada/' || md5('f1-a') || '.xml', 'leitura', l_nota),
          jsonb_build_object('nome', 'x.pdf', 'tipo', 'pdf', 'tamanho', 10, 'md5', md5('f1-b'), 'storage_path', c_teste || '/entrada/' || md5('f1-b') || '.pdf', 'leitura', l_nota || '{"texto":"x"}'),
          jsonb_build_object('nome', 'y.pdf', 'tipo', 'pdf', 'tamanho', 10, 'md5', md5('f1-c'), 'storage_path', c_teste || '/entrada/' || md5('f1-c') || '.pdf'))));
  select * into x from entrada_arquivos where cliente_id = c_teste and md5 = md5('f1-a');
  if x.leitura is distinct from l_nota or x.leitura_em is null or x.estado <> 'a_ler' then raise exception 'T3 FALHOU: a leitura boa (%)', x.leitura; end if;
  select count(*) into n from entrada_arquivos where cliente_id = c_teste and md5 in (md5('f1-b'), md5('f1-c')) and leitura is null and leitura_em is null;
  if n <> 2 then raise exception 'T3 FALHOU: inválida/ausente (% de 2 sem leitura)', n; end if;
  -- T4 o mesmo arquivo de novo (outra leitura) não troca a primeira
  r := _fn_entrada_registrar(jsonb_build_object('destinatario', v_local || '@' || _fn_entrada_dominio(), 'mensagem_id', '<f1-d@t>',
        'arquivos', jsonb_build_array(jsonb_build_object('nome', 'nota.xml', 'tipo', 'xml', 'tamanho', 10, 'md5', md5('f1-a'),
          'storage_path', c_teste || '/entrada/' || md5('f1-a') || '.xml', 'leitura', '{"v":"caixa-1","k":"nada","frase":"x"}'::jsonb))));
  select * into x from entrada_arquivos where cliente_id = c_teste and md5 = md5('f1-a');
  if x.leitura is distinct from l_nota or x.chegou_de_novo <> 1 then raise exception 'T4 FALHOU: trocou a leitura (%)', x.leitura; end if;
  -- T5 o banco: leitura em linha sem arquivo, ou sem a data, ou fora da forma = recusado
  begin update entrada_arquivos set leitura = '{"v":"caixa-1","k":"senha"}', leitura_em = now() where cliente_id = c_teste and md5 is null and mensagem_id like '<f1%';
        insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, recebido_em, estado, motivo, leitura, leitura_em)
        select c_teste, id, '<f1-e@t>', now(), 'sem_anexo', 'x', '{"v":"caixa-1","k":"senha"}', now() from cliente_entrada_email where cliente_id = c_teste and ativo;
        raise exception 'T5 FALHOU: leitura sem arquivo';
  exception when check_violation then null; end;
  begin update entrada_arquivos set leitura = l_nota where cliente_id = c_teste and md5 = md5('f1-c'); raise exception 'T5 FALHOU: sem leitura_em';
  exception when check_violation then null; end;
  begin update entrada_arquivos set leitura = l_nota || '{"texto":"x"}', leitura_em = now() where cliente_id = c_teste and md5 = md5('f1-c'); raise exception 'T5 FALHOU: forma ruim';
  exception when check_violation then null; end;
  -- T6 guardar de fora: 42501
  select id into a from entrada_arquivos where cliente_id = c_teste and md5 = md5('f1-c');
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform fn_entrada_leitura_guardar(a, l_bol, true); raise exception 'T6 FALHOU: guardou de fora';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- T7 inválida = 22023; a prévia não grava; o gesto grava; a mesma versão de novo = ja_estava (não troca)
  begin perform fn_entrada_leitura_guardar(a, l_bol || '{"texto":"x"}', false); raise exception 'T7 FALHOU: guardou forma ruim';
  exception when invalid_parameter_value then null; end;
  r := fn_entrada_leitura_guardar(a, l_bol, true);
  if (select leitura from entrada_arquivos where id = a) is not null then raise exception 'T7 FALHOU: a prévia gravou'; end if;
  r := fn_entrada_leitura_guardar(a, l_bol, false);
  if (select leitura from entrada_arquivos where id = a) is distinct from l_bol or (r->>'ja_estava')::boolean then raise exception 'T7 FALHOU: não gravou (%)', r; end if;
  r := fn_entrada_leitura_guardar(a, '{"v":"caixa-1","k":"senha"}', false);
  if (r->>'ja_estava')::boolean is not true or (select leitura from entrada_arquivos where id = a) is distinct from l_bol then raise exception 'T7 FALHOU: trocou a mesma versão'; end if;
  -- T8 versão nova do leitor troca a velha
  r := fn_entrada_leitura_guardar(a, '{"v":"caixa-2","k":"senha"}', false);
  if (select leitura->>'v' from entrada_arquivos where id = a) <> 'caixa-2' then raise exception 'T8 FALHOU: não trocou a versão velha'; end if;
  -- T9 linha sem arquivo: 22023
  select id into a from entrada_arquivos where cliente_id = c_teste and md5 is null limit 1;
  if a is not null then
    begin perform fn_entrada_leitura_guardar(a, l_nota, false); raise exception 'T9 FALHOU: guardou em linha sem arquivo';
    exception when invalid_parameter_value then null; end;
  end if;
  execute 'reset role';
  raise exception 'OK ENTRADA-CENTRAL-F1: T1–T9 verdes (nada fica)';
end $$;
