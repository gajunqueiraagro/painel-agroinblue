-- FISCAL-01 · F1 · teste dos titulares e da composição da fazenda (20261028117270). Roda DEPOIS da migration (no ensaio, na mesma
-- transação). Fixture sintético no cliente Teste (43f32d07 · Fazenda Teste Cana c2498ace); admin = 7bd0b6ad; "de fora" = a91962cd.
-- Os CPF/CNPJ são sintéticos com dígito válido. Um titular de OUTRO cliente nasce como postgres só dentro desta transação.
-- As chamadas rodam como `authenticated` com as claims do usuário. TERMINA EM RAISE: nada fica no banco.
--   T0  objetos: funções fechadas (anon sem EXECUTE, SECURITY DEFINER), as auxiliares sem EXECUTE para authenticated, RLS ligada,
--       tabelas só leitura para authenticated, o gatilho do perfil leitura
--   T1  titular: a prévia não grava; gravar cria PF e PJ (só dígitos, tipo certo) com 1 linha de trilha (autor = quem está logado);
--       editar muda só o pedido; gravar sem mudança não grava
--   T2  titular: as recusas, com a frase
--   T3  composição: a prévia não grava; 60/40 a partir de 01/01/2026; nova versão 100% A em 01/07/2026 fecha a anterior em
--       30/06/2026; corrigir a de 01/07 (50/50) marca a antiga como substituída e mantém o histórico; lista vazia fecha
--   T4  composição: as recusas, com a frase (soma, repetido, outro cliente, inativo, faixa, data no meio da história)
--   T5  titular com participação: não inativa e não troca o CPF; sem participação, inativa
--   T6  acesso: o de fora leva 42501 nas duas funções e não lê nada; ninguém escreve nas tabelas direto
set local lock_timeout = '2s';
set local statement_timeout = '25s';

do $t0$
declare n int; v_o uuid;
begin
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_fiscal_titular_gravar', 'fn_fiscal_fazenda_titulares_gravar') and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 2 then raise exception 'T0: as funções de gravar não estão fechadas como deviam (% de 2)', n; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_fn_cpf_cnpj_valido', '_fn_cpf_cnpj_formatado')
     and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 2 then raise exception 'T0: as auxiliares do CPF/CNPJ estão abertas'; end if;
  select count(*) into n from pg_class c where c.oid in ('public.fiscal_titulares'::regclass, 'public.fiscal_fazenda_titulares'::regclass)
     and c.relrowsecurity and has_table_privilege('authenticated', c.oid, 'select')
     and not has_table_privilege('authenticated', c.oid, 'insert') and not has_table_privilege('authenticated', c.oid, 'update')
     and not has_table_privilege('authenticated', c.oid, 'delete') and not has_table_privilege('anon', c.oid, 'select');
  if n <> 2 then raise exception 'T0: as tabelas não estão só leitura com RLS (% de 2)', n; end if;
  select count(*) into n from pg_trigger t where t.tgname = 'trg_leitura_nao_grava'
     and t.tgrelid in ('public.fiscal_titulares'::regclass, 'public.fiscal_fazenda_titulares'::regclass);
  if n <> 2 then raise exception 'T0: falta o gatilho do perfil leitura'; end if;
  -- o titular de OUTRO cliente (NJ), só nesta transação
  insert into public.fiscal_titulares (cliente_id, nome, documento)
  values ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'Titular de outro cliente FISCAL-01', '98765432100') returning id into v_o;
  perform set_config('teste.outro', v_o::text, true);
end $t0$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

do $t1$
declare r jsonb; v_a uuid; v_b uuid; x record; n int;
begin
  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', null,
         '{"nome": "  Titular   Teste A FISCAL-01 ", "documento": "529.982.247-25", "ie": "28.123.456-7"}');
  if (r->>'simulado')::boolean is distinct from true or (r->>'gravado')::boolean or r->>'tipo' <> 'CPF'
     or r->>'documento_formatado' <> '529.982.247-25' or jsonb_array_length(r->'diferencas') <> 4 then
    raise exception 'T1: a prévia do titular devolveu %', r;
  end if;
  if exists (select 1 from public.fiscal_titulares where documento = '52998224725') then raise exception 'T1: a prévia gravou'; end if;

  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', null,
         '{"nome": "  Titular   Teste A FISCAL-01 ", "documento": "529.982.247-25", "ie": "28.123.456-7"}', false);
  if not (r->>'gravado')::boolean then raise exception 'T1: gravar A devolveu %', r; end if;
  v_a := (r->>'titular_id')::uuid;
  select * into x from public.fiscal_titulares where id = v_a;
  if x.nome <> 'Titular Teste A FISCAL-01' or x.documento <> '52998224725' or x.tipo <> 'PF' or x.ie <> '281234567' or not x.ativo
     or x.cliente_id <> '43f32d07-dba8-4670-900c-bf645440c04a' then
    raise exception 'T1: o titular A ficou %', to_jsonb(x);
  end if;
  select count(*) into n from public.audit_log l where l.tabela_origem = 'fiscal_titulares' and l.registro_id = v_a
     and l.modulo = 'fiscal' and l.acao = 'criou' and l.usuario_id is not distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'
     and l.dados_novos->>'documento' = '52998224725' and l.dados_anteriores is null;
  if n <> 1 then raise exception 'T1: a trilha do titular A tem % linhas certas (esperado 1)', n; end if;

  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', null,
         '{"nome": "Titular Teste B FISCAL-01 Ltda", "documento": "11.222.333/0001-81"}', false);
  v_b := (r->>'titular_id')::uuid;
  if (select tipo from public.fiscal_titulares where id = v_b) is distinct from 'PJ' or r->>'tipo' <> 'CNPJ' then
    raise exception 'T1: o titular B não é PJ: %', r;
  end if;
  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', null,
         '{"nome": "Titular Teste C FISCAL-01", "documento": "12345678909"}', false);
  perform set_config('teste.a', v_a::text, true);
  perform set_config('teste.b', v_b::text, true);
  perform set_config('teste.c', r->>'titular_id', true);

  -- editar só o pedido (a IE sai); o resto fica
  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', v_a, '{"ie": ""}', false);
  select * into x from public.fiscal_titulares where id = v_a;
  if not (r->>'gravado')::boolean or x.ie is not null or x.nome <> 'Titular Teste A FISCAL-01' or x.documento <> '52998224725'
     or jsonb_array_length(r->'diferencas') <> 1 then
    raise exception 'T1: editar a IE devolveu % e a linha ficou %', r, to_jsonb(x);
  end if;
  -- sem mudança: não grava, não deixa trilha
  select count(*) into n from public.audit_log where tabela_origem = 'fiscal_titulares' and registro_id = v_a;
  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', v_a, '{"nome": "Titular Teste A FISCAL-01"}', false);
  if (r->>'gravado')::boolean or (select count(*) from public.audit_log where tabela_origem = 'fiscal_titulares' and registro_id = v_a) <> n then
    raise exception 'T1: gravar sem mudança gravou: %', r;
  end if;
end $t1$;

do $t2$
declare c record;
begin
  for c in select * from (values
      ('{"documento": "52998224725"}', 'Informe o nome do titular.'),
      ('{"nome": "X"}', 'Informe o CPF ou o CNPJ do titular.'),
      ('{"nome": "X", "documento": "1234567890"}', 'CPF/CNPJ: informe 11 dígitos (CPF) ou 14 (CNPJ).'),
      ('{"nome": "X", "documento": "529.982.247-24"}', 'O CPF 529.982.247-24 não é válido: confira os dígitos.'),
      ('{"nome": "X", "documento": "11222333000182"}', 'O CNPJ 11.222.333/0001-82 não é válido: confira os dígitos.'),
      ('{"nome": "X", "documento": "111.111.111-11"}', 'O CPF 111.111.111-11 não é válido: confira os dígitos.'),
      ('{"nome": "X", "documento": "52998224725"}', 'O CPF 529.982.247-25 já é do titular Titular Teste A FISCAL-01.'),
      ('{"nome": "X", "documento": "11144477735", "ie": "123"}', '"123" não parece uma inscrição estadual.'),
      ('{"nome": "X", "documento": "11144477735", "ativo": "sim"}', 'Ativo: use verdadeiro ou falso.')) v(j, msg) loop
    begin
      perform public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', null, c.j::jsonb, false);
      raise exception 'T2: aceitou %', c.j;
    exception when others then
      if sqlerrm <> c.msg then raise exception 'T2: % recusou com "%" (esperado "%")', c.j, sqlerrm, c.msg; end if;
    end;
  end loop;
  begin
    perform public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('teste.outro')::uuid, '{"nome": "Y"}', false);
    raise exception 'T2: editou o titular de outro cliente';
  exception when others then
    if sqlerrm <> 'Titular não encontrado neste cliente.' then raise exception 'T2: titular de outro cliente recusou com "%"', sqlerrm; end if;
  end;
end $t2$;

do $t3$
declare r jsonb; f uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; a uuid := current_setting('teste.a')::uuid;
        b uuid := current_setting('teste.b')::uuid; n int; x record;
begin
  r := public.fn_fiscal_fazenda_titulares_gravar(f, '2026-01-01',
         jsonb_build_array(jsonb_build_object('titular_id', a, 'participacao', 60), jsonb_build_object('titular_id', b, 'participacao', '40')));
  if (r->>'simulado')::boolean is distinct from true or (r->>'gravado')::boolean or jsonb_array_length(r->'depois') <> 2
     or jsonb_array_length(r->'antes') <> 0 then
    raise exception 'T3: a prévia da composição devolveu %', r;
  end if;
  if exists (select 1 from public.fiscal_fazenda_titulares where fazenda_id = f) then raise exception 'T3: a prévia gravou'; end if;

  r := public.fn_fiscal_fazenda_titulares_gravar(f, '2026-01-01',
         jsonb_build_array(jsonb_build_object('titular_id', a, 'participacao', 60), jsonb_build_object('titular_id', b, 'participacao', '40')), false);
  select count(*) into n from public.fiscal_fazenda_titulares where fazenda_id = f and substituida_em is null
     and vigencia_inicio = '2026-01-01' and vigencia_fim is null and cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a'
     and ((titular_id = a and participacao = 60) or (titular_id = b and participacao = 40));
  if not (r->>'gravado')::boolean or n <> 2 then raise exception 'T3: 60/40 ficou com % linhas certas: %', n, r; end if;

  -- a mesma composição de novo: nada muda
  r := public.fn_fiscal_fazenda_titulares_gravar(f, '2026-03-01',
         jsonb_build_array(jsonb_build_object('titular_id', b, 'participacao', 40), jsonb_build_object('titular_id', a, 'participacao', 60)), false);
  if (r->>'gravado')::boolean then raise exception 'T3: a mesma composição gravou: %', r; end if;

  -- nova versão: 100% A a partir de 01/07/2026 fecha a anterior em 30/06/2026
  r := public.fn_fiscal_fazenda_titulares_gravar(f, '2026-07-01', jsonb_build_array(jsonb_build_object('titular_id', a, 'participacao', 100)), false);
  select count(*) into n from public.fiscal_fazenda_titulares where fazenda_id = f and substituida_em is null
     and vigencia_inicio = '2026-01-01' and vigencia_fim = '2026-06-30';
  if n <> 2 then raise exception 'T3: a versão de 01/01 não fechou em 30/06 (% linhas)', n; end if;

  -- corrigir a versão de 01/07 (50/50): a de 100% fica marcada como substituída; a de 01/01 não muda
  begin
    r := public.fn_fiscal_fazenda_titulares_gravar(f, '2026-07-01',
           jsonb_build_array(jsonb_build_object('titular_id', a, 'participacao', 50), jsonb_build_object('titular_id', b, 'participacao', 50)), false);
  exception when others then raise exception 'T3: a correção de 01/07 falhou: %', sqlerrm;
  end;
  if not (r->>'corrige_a_versao')::boolean then raise exception 'T3: a correção não se reconheceu: %', r; end if;
  select count(*) filter (where substituida_em is not null and vigencia_inicio = '2026-07-01' and participacao = 100) s,
         count(*) filter (where substituida_em is null and vigencia_inicio = '2026-07-01' and participacao = 50 and vigencia_fim is null) v,
         count(*) filter (where substituida_em is null and vigencia_inicio = '2026-01-01' and vigencia_fim = '2026-06-30') o,
         count(*) t
    into x from public.fiscal_fazenda_titulares where fazenda_id = f;
  if x.s <> 1 or x.v <> 2 or x.o <> 2 or x.t <> 5 then raise exception 'T3: depois da correção ficou %', to_jsonb(x); end if;

  -- lista vazia: a fazenda fica sem titular a partir de 01/01/2027
  r := public.fn_fiscal_fazenda_titulares_gravar(f, '2027-01-01', '[]'::jsonb, false);
  select count(*) into n from public.fiscal_fazenda_titulares where fazenda_id = f and substituida_em is null
     and vigencia_inicio = '2026-07-01' and vigencia_fim = '2026-12-31';
  if not (r->>'gravado')::boolean or n <> 2 then raise exception 'T3: a lista vazia não fechou em 31/12/2026: %', r; end if;

  select count(*) into n from public.audit_log l where l.tabela_origem = 'fiscal_fazenda_titulares' and l.registro_id = f
     and l.modulo = 'fiscal' and l.usuario_id is not distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  if n <> 4 then raise exception 'T3: a trilha da composição tem % linhas (esperado 4)', n; end if;
end $t3$;

do $t4$
declare c record; f uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; a text := current_setting('teste.a'); b text := current_setting('teste.b');
        o text := current_setting('teste.outro'); v_c text := current_setting('teste.c');
begin
  -- C inativo, para o caso do titular inativo
  perform public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', v_c::uuid, '{"ativo": false}', false);
  for c in select * from (values
      ('2027-02-01', format('[{"titular_id":"%s","participacao":60},{"titular_id":"%s","participacao":30}]', a, b), 'As participações somam 90%: têm de somar 100%.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":33.3333},{"titular_id":"%s","participacao":66.6666}]', a, b), 'As participações somam 99,9999%: têm de somar 100%.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":50},{"titular_id":"%s","participacao":50}]', a, a), 'O titular Titular Teste A FISCAL-01 aparece duas vezes.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":100}]', o), 'Titular não encontrado neste cliente.'),
      ('2027-02-01', '[{"titular_id":"x","participacao":100}]', 'Titular não encontrado neste cliente.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":100}]', v_c), 'O titular Titular Teste C FISCAL-01 está inativo.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":0},{"titular_id":"%s","participacao":100}]', a, b), 'Participação de Titular Teste A FISCAL-01: de 0 a 100%.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":120}]', a), 'Participação de Titular Teste A FISCAL-01: de 0 a 100%.'),
      ('2027-02-01', format('[{"titular_id":"%s","participacao":"metade"}]', a), 'Participação de Titular Teste A FISCAL-01: use um número de 0 a 100.'),
      ('2026-03-01', format('[{"titular_id":"%s","participacao":100}]', a), 'A composição de Fazenda Teste Cana já tem uma versão a partir de 01/07/2026: a nova começa nessa data (para corrigi-la) ou depois.'),
      ('2026-10-01', format('[{"titular_id":"%s","participacao":100}]', a), 'A composição de Fazenda Teste Cana vai até 31/12/2026: a nova começa depois.'),
      (null, format('[{"titular_id":"%s","participacao":100}]', a), 'Informe o início da vigência.'),
      ('2027-02-01', '{"titular_id": 1}', 'Informe a lista de titulares.')) v(d, j, msg) loop
    begin
      perform public.fn_fiscal_fazenda_titulares_gravar(f, c.d::date, c.j::jsonb, false);
      raise exception 'T4: aceitou % em %', c.j, c.d;
    exception when others then
      if sqlerrm <> c.msg then raise exception 'T4: % em % recusou com "%" (esperado "%")', c.j, c.d, sqlerrm, c.msg; end if;
    end;
  end loop;
end $t4$;

do $t5$
declare r jsonb; c record; a uuid := current_setting('teste.a')::uuid;
begin
  -- A tem participação até 31/12/2026 (vigente hoje): não inativa e não troca o CPF
  for c in select * from (values
      ('{"ativo": false}', 'Titular Teste A FISCAL-01 tem participação vigente em Fazenda Teste Cana: encerre a participação antes de inativar.'),
      ('{"documento": "11144477735"}', 'O CPF/CNPJ de um titular com participação em fazenda não muda: cadastre outro titular.')) v(j, msg) loop
    begin
      perform public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', a, c.j::jsonb, false);
      raise exception 'T5: aceitou %', c.j;
    exception when others then
      if sqlerrm <> c.msg then raise exception 'T5: % recusou com "%" (esperado "%")', c.j, sqlerrm, c.msg; end if;
    end;
  end loop;
  -- C, sem participação, voltou a ativo e inativa de novo sem problema
  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('teste.c')::uuid, '{"ativo": true}', false);
  r := public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('teste.c')::uuid, '{"ativo": false}', false);
  if not (r->>'gravado')::boolean then raise exception 'T5: não inativou o titular sem participação: %', r; end if;
end $t5$;

select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);

do $t6$
declare n int;
begin
  begin perform public.fn_fiscal_titular_gravar('43f32d07-dba8-4670-900c-bf645440c04a', null, '{"nome": "Z", "documento": "11144477735"}', true);
        raise exception 'T6: o de fora simulou um titular';
  exception when sqlstate '42501' then null; end;
  begin perform public.fn_fiscal_fazenda_titulares_gravar('c2498ace-8478-410c-a697-d3f2e2934d1f', '2027-06-01', '[]'::jsonb, true);
        raise exception 'T6: o de fora simulou a composição';
  exception when sqlstate '42501' then null; end;
  select (select count(*) from public.fiscal_titulares where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a')
       + (select count(*) from public.fiscal_fazenda_titulares where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') into n;
  if n <> 0 then raise exception 'T6: o de fora leu % linhas do cliente Teste', n; end if;
  begin insert into public.fiscal_titulares (cliente_id, nome, documento) values ('43f32d07-dba8-4670-900c-bf645440c04a', 'Z', '11144477735');
        raise exception 'T6: escreveu no titular direto';
  exception when insufficient_privilege then null; end;
  begin insert into public.fiscal_fazenda_titulares (cliente_id, fazenda_id, titular_id, participacao, vigencia_inicio)
        values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.a')::uuid, 100, '2027-06-01');
        raise exception 'T6: escreveu na composição direto';
  exception when insufficient_privilege then null; end;
end $t6$;

do $fim$ begin raise exception 'OK FISCAL-01 (117270): T0–T6 passaram (nada fica no banco)'; end $fim$;
