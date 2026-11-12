-- FISCAL-01 · F1 · teste do destinatário na nota e do titular sugerido (20261028117280). Roda DEPOIS da migration (e da 117270). Fixture
-- sintético no cliente Teste (43f32d07 · Fazenda Teste Cana c2498ace); chaves "9…" de 44 dígitos; admin = 7bd0b6ad; "de fora" = a91962cd.
-- TERMINA EM RAISE: nada fica no banco.
--   T0  objetos: as 3 funções novas fechadas, as auxiliares sem EXECUTE para authenticated, as colunas; o gravador da nota com o patch;
--       notas ANTIGAS (gravadas antes do patch, sem destinatário) entram direto como postgres
--   T1b D-P1: destinatário com CNPJ alfanumérico pelo PDF e pelo XML; fora do formato = nulo
--   T1  o gravador: PDF com destinatário grava só dígitos; regravar sem destinatário NÃO apaga; XML sem o campo tira do <dest>;
--       documento/IE fora do formato ficam nulos; a prévia não grava; o resto do gravador segue igual
--   T2  as pendentes: só as notas sem destinatário; a XML já vem lida
--   T3  preencher: a prévia conta preenche / já tinha / sem nota / inválida / repetida e não grava; gravar preenche só o vazio (o XML pela
--       chave), 1 linha de trilha; de novo, nada
--   T4  a sugestão: sem IE na fazenda, sem sugestão (zero notas); com a IE, os destinatários dela com o nº de notas (o maior primeiro),
--       PF/PJ, o dígito conferido e o titular já cadastrado
--   T5  acesso: o de fora leva 42501 nas três
set local lock_timeout = '2s';
set local statement_timeout = '25s';

do $t0$
declare n int;
begin
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_nota_fiscal_destinatario_pendentes', 'fn_nota_fiscal_destinatario_preencher', 'fn_fiscal_titulares_sugeridos')
     and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 3 then raise exception 'T0: as funções novas não estão fechadas como deviam (% de 3)', n; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_fn_nota_dest_normalizar', '_fn_nota_dest_do_xml', '_fn_nota_dest_da_nota')
     and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 3 then raise exception 'T0: as auxiliares do destinatário estão abertas'; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'nota_fiscal'
     and column_name in ('dest_documento', 'dest_nome', 'dest_ie');
  if n <> 3 then raise exception 'T0: faltam as colunas do destinatário'; end if;
  if position('v_dest' in pg_get_functiondef('public.fn_nota_fiscal_gravar(uuid,jsonb,jsonb,boolean,uuid)'::regprocedure)) = 0 then
    raise exception 'T0: o gravador da nota não tem o patch';
  end if;
  -- notas antigas, sem destinatário: uma XML (o <dest> no XML guardado) e duas PDF
  insert into public.nota_fiscal (cliente_id, chave_acesso, origem, numero, emissao, emitente_documento, emitente_nome, totais, xml_original, soma_cent, nota_cent)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', '9' || lpad('1', 43, '0'), 'xml', '1', '2026-02-10', '11222333000181', 'EMITENTE TESTE', '{}',
          '<nfeProc><NFe><infNFe><emit><CNPJ>11222333000181</CNPJ></emit><dest><CPF>12345678909</CPF><xNome>CICLANO ANTIGO</xNome><IE>281234567</IE></dest></infNFe></NFe></nfeProc>', 100, 100),
         ('43f32d07-dba8-4670-900c-bf645440c04a', '9' || lpad('2', 43, '0'), 'pdf', '2', '2026-03-10', '11222333000181', 'EMITENTE TESTE', '{}', null, 100, 100),
         ('43f32d07-dba8-4670-900c-bf645440c04a', '9' || lpad('7', 43, '0'), 'pdf', '7', '2026-03-11', '11222333000181', 'EMITENTE TESTE', '{}', null, 100, 100);
end $t0$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

do $t1$
declare r jsonb; x record; c text := '43f32d07-dba8-4670-900c-bf645440c04a';
        it jsonb := '[{"n_item": 1, "descricao": "ITEM TESTE", "produto_cent": 1000, "liquido_cent": 1000}]';
        xml text := '<nfeProc><NFe><infNFe><emit><CNPJ>52998224725</CNPJ></emit><dest><CNPJ>11222333000181</CNPJ><xNome>DEST XML &amp; CIA</xNome><IE>281234567</IE></dest></infNFe></NFe></nfeProc>';
begin
  begin
    r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('3', 43, '0'), 'origem', 'pdf', 'numero', '3', 'emissao', '2026-04-10',
           'emitente_documento', '11222333000181', 'emitente_nome', 'EMITENTE TESTE', 'totais', '{"nota_cent": 1000}'::jsonb,
           'destinatario', '{"documento": "529.982.247-25", "nome": "  Fulano   de Tal ", "ie": "28.123.456-7"}'::jsonb), it, false);
  exception when others then raise exception 'T1: o gravador recusou a nota com destinatário pontuado: %', sqlerrm;
  end;
  if r->>'acao' <> 'criada' or (r->>'confere')::boolean is distinct from true then raise exception 'T1: o gravador devolveu %', r; end if;
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('3', 43, '0');
  if x.dest_documento is distinct from '52998224725' or x.dest_nome is distinct from 'Fulano de Tal' or x.dest_ie is distinct from '281234567' then
    raise exception 'T1: o PDF gravou o destinatário %/%/%', x.dest_documento, x.dest_nome, x.dest_ie;
  end if;
  -- regravar sem o destinatário (o chamador antigo): o gravado fica
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('3', 43, '0'), 'origem', 'pdf', 'numero', '3', 'emissao', '2026-04-10',
         'totais', '{"nota_cent": 1000}'::jsonb), it, false);
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('3', 43, '0');
  if r->>'acao' <> 'substituida' or x.dest_documento is distinct from '52998224725' or x.dest_ie is distinct from '281234567' then
    raise exception 'T1: regravar sem destinatário apagou: %/% (%)', x.dest_documento, x.dest_ie, r;
  end if;
  -- XML sem o campo: o destinatário sai do <dest> (duas notas do mesmo CNPJ, para a contagem do T4)
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('4', 43, '0'), 'origem', 'xml', 'numero', '4', 'emissao', '2026-05-10',
         'totais', '{"nota_cent": 1000}'::jsonb, 'xml_original', xml), it, false);
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('8', 43, '0'), 'origem', 'xml', 'numero', '8', 'emissao', '2026-06-10',
         'totais', '{"nota_cent": 1000}'::jsonb, 'xml_original', xml), it, false);
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('4', 43, '0');
  if x.dest_documento is distinct from '11222333000181' or x.dest_nome is distinct from 'DEST XML & CIA' or x.dest_ie is distinct from '281234567' then
    raise exception 'T1: o XML gravou o destinatário %/%/%', x.dest_documento, x.dest_nome, x.dest_ie;
  end if;
  -- documento e IE fora do formato: nulos; o nome fica
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('5', 43, '0'), 'origem', 'pdf', 'numero', '5',
         'totais', '{"nota_cent": 1000}'::jsonb, 'destinatario', '{"documento": "123", "nome": "So Nome", "ie": "ISENTO"}'::jsonb), it, false);
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('5', 43, '0');
  if x.dest_documento is not null or x.dest_ie is not null or x.dest_nome is distinct from 'So Nome' then
    raise exception 'T1: o formato ruim gravou %/%/%', x.dest_documento, x.dest_nome, x.dest_ie;
  end if;
  -- a prévia não grava
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('6', 43, '0'), 'origem', 'pdf', 'numero', '6',
         'totais', '{"nota_cent": 1000}'::jsonb, 'destinatario', '{"documento": "52998224725"}'::jsonb), it, true);
  if exists (select 1 from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('6', 43, '0')) then
    raise exception 'T1: a prévia do gravador gravou';
  end if;
end $t1$;

-- T1b · D-P1: o destinatário com CNPJ alfanumérico (Receita, jul/2026) — pelo PDF (pontuado, minúsculo) e pelo XML (<CNPJ>)
do $t1b$
declare r jsonb; x record; c text := '43f32d07-dba8-4670-900c-bf645440c04a';
        it jsonb := '[{"n_item": 1, "descricao": "ITEM TESTE", "produto_cent": 1000, "liquido_cent": 1000}]';
        xml text := '<nfeProc><NFe><infNFe><emit><CNPJ>52998224725</CNPJ></emit><dest><CNPJ>12ABC34501DE35</CNPJ><xNome>DEST ALFA</xNome></dest></infNFe></NFe></nfeProc>';
begin
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('21', 43, '0'), 'origem', 'pdf', 'numero', '21',
         'totais', '{"nota_cent": 1000}'::jsonb, 'destinatario', '{"documento": "12.abc.345/01de-35", "nome": "Dest Alfa"}'::jsonb), it, false);
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('21', 43, '0');
  if x.dest_documento is distinct from '12ABC34501DE35' then raise exception 'T1b: o PDF alfanumérico gravou "%"', x.dest_documento; end if;
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('22', 43, '0'), 'origem', 'xml', 'numero', '22',
         'totais', '{"nota_cent": 1000}'::jsonb, 'xml_original', xml), it, false);
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('22', 43, '0');
  if x.dest_documento is distinct from '12ABC34501DE35' or x.dest_nome is distinct from 'DEST ALFA' then
    raise exception 'T1b: o XML alfanumérico gravou %/%', x.dest_documento, x.dest_nome;
  end if;
  -- 13 posições alfanuméricas + 1 dígito (fora do formato): nulo
  r := public.fn_nota_fiscal_gravar(c::uuid, jsonb_build_object('chave_acesso', '9' || lpad('23', 43, '0'), 'origem', 'pdf', 'numero', '23',
         'totais', '{"nota_cent": 1000}'::jsonb, 'destinatario', '{"documento": "12ABC34501DEX5", "nome": "Dest Ruim"}'::jsonb), it, false);
  select * into x from public.nota_fiscal where cliente_id = c::uuid and chave_acesso = '9' || lpad('23', 43, '0');
  if x.dest_documento is not null then raise exception 'T1b: o fora do formato gravou "%"', x.dest_documento; end if;
end $t1b$;

do $t2$
declare n int; x record;
begin
  select count(*) into n from public.fn_nota_fiscal_destinatario_pendentes('43f32d07-dba8-4670-900c-bf645440c04a') p
   where p.chave like '9%' and p.chave in ('9' || lpad('3', 43, '0'), '9' || lpad('4', 43, '0'), '9' || lpad('5', 43, '0'), '9' || lpad('8', 43, '0'));
  if n <> 0 then raise exception 'T2: as pendentes trazem % nota(s) que já têm destinatário', n; end if;
  select count(*) into n from public.fn_nota_fiscal_destinatario_pendentes('43f32d07-dba8-4670-900c-bf645440c04a') p
   where p.chave in ('9' || lpad('1', 43, '0'), '9' || lpad('2', 43, '0'), '9' || lpad('7', 43, '0'));
  if n <> 3 then raise exception 'T2: as pendentes trazem % das 3 antigas', n; end if;
  select * into x from public.fn_nota_fiscal_destinatario_pendentes('43f32d07-dba8-4670-900c-bf645440c04a') p where p.chave = '9' || lpad('1', 43, '0');
  if x.origem <> 'xml' or x.xml_documento is distinct from '12345678909' or x.xml_nome is distinct from 'CICLANO ANTIGO' or x.xml_ie is distinct from '281234567' then
    raise exception 'T2: a XML antiga veio %', to_jsonb(x);
  end if;
end $t2$;

do $t3$
declare r jsonb; l jsonb; n int; c uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
begin
  l := jsonb_build_array(
    jsonb_build_object('chave', '9' || lpad('1', 43, '0')),
    jsonb_build_object('chave', '9' || lpad('2', 43, '0'), 'documento', '529.982.247-24', 'nome', 'Beltrano', 'ie', '281234567'),
    jsonb_build_object('chave', '9' || lpad('3', 43, '0'), 'documento', '98765432100'),
    jsonb_build_object('chave', repeat('9', 44), 'documento', '98765432100'),
    jsonb_build_object('chave', '9' || lpad('2', 43, '0'), 'documento', '98765432100'),
    jsonb_build_object('chave', '9' || lpad('7', 43, '0'), 'documento', 'x'));
  r := public.fn_nota_fiscal_destinatario_preencher(c, l);
  if (r->>'simulado')::boolean is distinct from true or (r->>'gravado')::boolean or (r->>'preenche')::int <> 2 or (r->>'ja_tinha')::int <> 1
     or (r->>'sem_nota')::int <> 1 or (r->>'repetida')::int <> 1 or (r->>'invalida')::int <> 1 then
    raise exception 'T3: a prévia contou %', r - 'linhas';
  end if;
  if exists (select 1 from public.nota_fiscal where cliente_id = c and chave_acesso in ('9' || lpad('1', 43, '0'), '9' || lpad('2', 43, '0'))
              and (dest_documento is not null or dest_ie is not null)) then
    raise exception 'T3: a prévia gravou';
  end if;

  r := public.fn_nota_fiscal_destinatario_preencher(c, l, false);
  if not (r->>'gravado')::boolean or (r->>'preenche')::int <> 2 then raise exception 'T3: gravar devolveu %', r - 'linhas'; end if;
  select count(*) into n from public.nota_fiscal where cliente_id = c and (
         (chave_acesso = '9' || lpad('1', 43, '0') and dest_documento = '12345678909' and dest_nome = 'CICLANO ANTIGO' and dest_ie = '281234567')
      or (chave_acesso = '9' || lpad('2', 43, '0') and dest_documento = '52998224724' and dest_nome = 'Beltrano' and dest_ie = '281234567')
      or (chave_acesso = '9' || lpad('3', 43, '0') and dest_documento = '52998224725')
      or (chave_acesso = '9' || lpad('7', 43, '0') and dest_documento is null and dest_ie is null));
  if n <> 4 then raise exception 'T3: depois de gravar, % de 4 notas como esperado', n; end if;
  select count(*) into n from public.audit_log where cliente_id = c and modulo = 'fiscal' and tabela_origem = 'nota_fiscal'
     and usuario_id is not distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  if n <> 1 then raise exception 'T3: a trilha do preencher tem % linhas (esperado 1)', n; end if;

  r := public.fn_nota_fiscal_destinatario_preencher(c, l, false);
  if (r->>'gravado')::boolean or (r->>'preenche')::int <> 0 or (r->>'ja_tinha')::int <> 3 then
    raise exception 'T3: preencher de novo devolveu %', r - 'linhas';
  end if;
  if (select count(*) from public.audit_log where cliente_id = c and modulo = 'fiscal' and tabela_origem = 'nota_fiscal') <> 1 then
    raise exception 'T3: preencher de novo deixou trilha';
  end if;
end $t3$;

do $t4$
declare r jsonb; x record; n int; c uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
begin
  -- a fazenda sem IE: aparece, sem sugestão
  select count(*) into n from public.fn_fiscal_titulares_sugeridos(c) s where s.fazenda_id = f and s.documento is null and s.notas = 0;
  if n <> 1 or (select count(*) from public.fn_fiscal_titulares_sugeridos(c) s where s.fazenda_id = f) <> 1 then
    raise exception 'T4: a fazenda sem IE não veio vazia';
  end if;
  r := public.fn_fazenda_gravar_ie(f, '28.123.456-7', 'teste FISCAL-01', false);
  -- com a IE: os 4 destinatários das notas com esta IE (o CNPJ com 2 notas primeiro)
  select count(*) into n from public.fn_fiscal_titulares_sugeridos(c) s where s.fazenda_id = f;
  if n <> 4 then raise exception 'T4: a fazenda com IE trouxe % sugestões (esperado 4)', n; end if;
  select * into x from public.fn_fiscal_titulares_sugeridos(c) s where s.fazenda_id = f limit 1;
  if x.documento <> '11222333000181' or x.notas <> 2 or x.tipo <> 'PJ' or not x.documento_valido or x.nome <> 'DEST XML & CIA'
     or x.ie <> '281234567' or x.primeira <> '2026-05-10' or x.ultima <> '2026-06-10' or x.titular_id is not null then
    raise exception 'T4: a primeira sugestão veio %', to_jsonb(x);
  end if;
  select * into x from public.fn_fiscal_titulares_sugeridos(c) s where s.fazenda_id = f and s.documento = '52998224724';
  if x.documento_valido or x.tipo <> 'PF' or x.notas <> 1 then raise exception 'T4: o CPF de dígito errado veio %', to_jsonb(x); end if;
  -- o titular já cadastrado aparece ligado
  r := public.fn_fiscal_titular_gravar(c, null, '{"nome": "Fulano de Tal", "documento": "52998224725"}', false);
  select * into x from public.fn_fiscal_titulares_sugeridos(c) s where s.fazenda_id = f and s.documento = '52998224725';
  if x.titular_id is distinct from (r->>'titular_id')::uuid or x.titular_nome <> 'Fulano de Tal' then
    raise exception 'T4: o titular cadastrado não ligou: %', to_jsonb(x);
  end if;
end $t4$;

select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);

do $t5$
begin
  begin perform * from public.fn_nota_fiscal_destinatario_pendentes('43f32d07-dba8-4670-900c-bf645440c04a');
        raise exception 'T5: o de fora leu as pendentes';
  exception when sqlstate '42501' then null; end;
  begin perform public.fn_nota_fiscal_destinatario_preencher('43f32d07-dba8-4670-900c-bf645440c04a', '[]'::jsonb, true);
        raise exception 'T5: o de fora simulou o preencher';
  exception when sqlstate '42501' then null; end;
  begin perform * from public.fn_fiscal_titulares_sugeridos('43f32d07-dba8-4670-900c-bf645440c04a');
        raise exception 'T5: o de fora leu as sugestões';
  exception when sqlstate '42501' then null; end;
end $t5$;

do $fim$ begin raise exception 'OK FISCAL-01 (117280): T0–T5 + T1b alfanumérico passaram (nada fica no banco) · md5 até aqui %', md5(left(current_query(), strpos(current_query(), 'end $fim' || '$;') + 9)); end $fim$;
