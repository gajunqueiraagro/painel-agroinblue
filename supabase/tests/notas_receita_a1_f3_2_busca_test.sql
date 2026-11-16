-- NOTAS-RECEITA-A1-01 · F3.2 — ENSAIO da 20261028113357 (roda como postgres; termina em RAISE 'OK…': NADA fica no banco, nem o segredo do
-- Vault). Antes deste bloco, na MESMA transação, roda o corpo da migration. Fixture SINTÉTICO no cliente Teste (43f32d07…); nada de certificado
-- real: o "certificado" é só a linha de metadados + um objeto e uma senha inventados.
do $$
declare
  a uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';
  ta uuid; tb uuid; cv uuid; cb uuid; cx uuid; seg uuid; r jsonb; n int; s text;
  dig text := repeat('ab', 32);
  ka text := '35261112345678000190550010000012341000012345';
  doc_a jsonb;
begin
  insert into public.fiscal_titulares (cliente_id, nome, documento, uf) values (a, 'TITULAR SINTETICO 113357', '52998224725', 'SP') returning id into ta;
  insert into public.fiscal_titulares (cliente_id, nome, documento, uf) values (a, 'OUTRO SINTETICO 113357', '11144477735', 'MS') returning id into tb;
  doc_a := jsonb_build_object('tipo', 'nfe', 'chave', ka, 'nsu', '1', 'esquema', 'resNFe_v1.01.xsd', 'situacao', 'resumo',
    'emitente_documento', '12345678000190', 'emitente_nome', 'CASA AGRO SINTETICA', 'emissao', '2026-11-10', 'valor_cent', 10050,
    'resumo', jsonb_build_object('cSitNFe', '1'), 'xml', null);

  -- R1 · authenticated não chama nenhuma das três; a assinatura antiga (7 argumentos) não existe mais
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.fn_fiscal_dfe_credencial(ta); raise exception using errcode = 'P0009', message = 'R1 FALHOU: authenticated leu a credencial';
  exception when insufficient_privilege then null; end;
  begin perform public.fn_fiscal_dfe_pedido_fechar(ta, 'cadeia'); raise exception using errcode = 'P0009', message = 'R1 FALHOU: authenticated fechou';
  exception when insufficient_privilege then null; end;
  begin perform public.fn_fiscal_dfe_registrar(ta, '137', 0, 0, null, '[]', '[]', null, null); raise exception using errcode = 'P0009', message = 'R1 FALHOU: authenticated registrou';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if to_regprocedure('public.fn_fiscal_dfe_registrar(uuid,text,bigint,bigint,timestamptz,jsonb,jsonb)') is not null then
    raise exception using errcode = 'P0009', message = 'R1 FALHOU: a fn_fiscal_dfe_registrar de 7 argumentos ainda existe';
  end if;
  select count(*) into n from aclexplode((select proacl from pg_proc where oid = 'public.fn_fiscal_dfe_credencial(uuid)'::regprocedure)) x
   where x.grantee = 0 or x.grantee = 'anon'::regrole::oid or x.grantee = 'authenticated'::regrole::oid;
  if n <> 0 then raise exception using errcode = 'P0009', message = format('R1 FALHOU: credencial aberta a %s papéis', n); end if;

  -- (o certificado vencido, o sem cofre e o bom — como postgres, que é quem a subida usa pela borda)
  insert into public.fiscal_certificados (cliente_id, titular_id, documento, emissor, impressao_digital, valido_de, valido_ate, situacao, enviado_em)
  values (a, ta, '52998224725', 'AC SINTETICA', dig, '2020-01-01', '2021-01-01', 'ativo', now() - interval '2 days') returning id into cx;

  execute 'set local role service_role';
  -- R2 · sem certificado ativo
  begin perform public.fn_fiscal_dfe_credencial(tb); raise exception using errcode = 'P0009', message = 'R2 FALHOU: credencial sem certificado';
  exception when sqlstate 'P0001' then null; end;
  -- R3 · o ativo venceu
  begin perform public.fn_fiscal_dfe_credencial(ta); raise exception using errcode = 'P0009', message = 'R3 FALHOU: credencial de certificado vencido';
  exception when sqlstate 'P0001' then get stacked diagnostics s = message_text;
    if s not like '%venceu%' then raise exception using errcode = 'P0009', message = format('R3 FALHOU: frase %s', s); end if; end;
  execute 'reset role';
  update public.fiscal_certificados set situacao = 'vencido' where id = cx;
  insert into public.fiscal_certificados (cliente_id, titular_id, documento, emissor, impressao_digital, valido_de, valido_ate, situacao)
  values (a, ta, '52998224725', 'AC SINTETICA', dig, now() - interval '1 day', now() + interval '1 year', 'ativo') returning id into cv;
  insert into public.fiscal_certificados_cofre (certificado_id, objeto, segredo_id) values (cv, null, null);

  execute 'set local role service_role';
  -- R4 · cofre vazio
  begin perform public.fn_fiscal_dfe_credencial(ta); raise exception using errcode = 'P0009', message = 'R4 FALHOU: credencial com cofre vazio';
  exception when sqlstate 'P0001' then null; end;
  execute 'reset role';
  seg := vault.create_secret('senha-sintetica-113357', 'fiscal_cert_ensaio_113357', 'ensaio 113357');
  update public.fiscal_certificados_cofre set objeto = 'teste/ensaio.pfx.enc', segredo_id = seg where certificado_id = cv;

  execute 'set local role service_role';
  -- R5 · a credencial: o certificado bom, a senha do Vault, o objeto, a impressão e a UF
  r := public.fn_fiscal_dfe_credencial(ta);
  if (r->>'certificado_id')::uuid <> cv or r->>'senha' <> 'senha-sintetica-113357' or r->>'objeto' <> 'teste/ensaio.pfx.enc'
     or r->>'impressao_digital' <> dig or r->>'uf' <> 'SP' or r->>'documento' <> '52998224725' then
    raise exception using errcode = 'P0009', message = format('R5 FALHOU: %s', r - 'senha');
  end if;

  -- R6 · fechar sem pedido aberto: recusa; aberto → fecha "cadeia": "nao_chamou", o NSU e o relógio não andam, a cadeia fica na trilha
  begin perform public.fn_fiscal_dfe_pedido_fechar(ta, 'cadeia'); raise exception using errcode = 'P0009', message = 'R6 FALHOU: fechou sem pedido';
  exception when sqlstate 'P0001' then null; end;
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  begin perform public.fn_fiscal_dfe_pedido_fechar(ta, 'outro'); raise exception using errcode = 'P0009', message = 'R6 FALHOU: motivo torto';
  exception when sqlstate 'P0001' then null; end;
  r := public.fn_fiscal_dfe_pedido_fechar(ta, 'cadeia', cv, jsonb_build_object('cadeia', jsonb_build_object('ok', false, 'motivo', 'sem_intermediaria')));
  select count(*) into n from public.fiscal_dfe_buscas where id = (r->>'busca_id')::bigint and cstat = 'nao_chamou' and certificado_id = cv
     and ult_nsu_antes = 0 and ult_nsu_depois = 0 and detalhe->>'motivo' = 'cadeia' and detalhe#>>'{cadeia,motivo}' = 'sem_intermediaria';
  if n <> 1 then raise exception using errcode = 'P0009', message = format('R6 FALHOU: trilha %s', r); end if;
  select count(*) into n from public.fiscal_dfe_controle where titular_id = ta and em_andamento_desde is null and ult_nsu = 0 and nao_antes_de is null;
  if n <> 1 then raise exception using errcode = 'P0009', message = 'R6 FALHOU: o relógio mudou'; end if;

  -- R7 · conexão: "sem_resposta"
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  r := public.fn_fiscal_dfe_pedido_fechar(ta, 'conexao', cv, jsonb_build_object('erro', 'connection reset'));
  select cstat into s from public.fiscal_dfe_buscas where id = (r->>'busca_id')::bigint;
  if s <> 'sem_resposta' then raise exception using errcode = 'P0009', message = format('R7 FALHOU: %s', s); end if;

  -- R8 · registrar com o certificado e o detalhe; certificado de outro titular e detalhe torto = recusa, nada gravado
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  begin perform public.fn_fiscal_dfe_registrar(ta, '138', 1, 5, null, jsonb_build_array(doc_a), '[]', cx, '[]'::jsonb);
    raise exception using errcode = 'P0009', message = 'R8 FALHOU: detalhe torto';
  exception when sqlstate 'P0001' then null; end;
  execute 'reset role';
  insert into public.fiscal_certificados (cliente_id, titular_id, documento, emissor, impressao_digital, valido_de, valido_ate, situacao)
  values (a, tb, '11144477735', 'AC SINTETICA', dig, now() - interval '1 day', now() + interval '1 year', 'ativo') returning id into cb;
  execute 'set local role service_role';
  begin perform public.fn_fiscal_dfe_registrar(ta, '138', 1, 5, null, jsonb_build_array(doc_a), '[]', cb, null);
    raise exception using errcode = 'P0009', message = 'R8 FALHOU: certificado de outro titular';
  exception when sqlstate 'P0001' then null; end;
  select count(*) into n from public.fiscal_dfe_recebidos where titular_id = ta;
  if n <> 0 then raise exception using errcode = 'P0009', message = 'R8 FALHOU: a recusa deixou documento'; end if;
  r := public.fn_fiscal_dfe_registrar(ta, '138', 1, 5, null, jsonb_build_array(doc_a), '[]', cv,
    jsonb_build_object('ambiente', 'producao', 'cadeia', jsonb_build_object('ok', true, 'raiz', 'AC Raiz Brasileira v5')));
  if (r->>'novos')::int <> 1 or r->>'busca_id' is null then raise exception using errcode = 'P0009', message = format('R8 FALHOU: %s', r); end if;
  select count(*) into n from public.fiscal_dfe_buscas where id = (r->>'busca_id')::bigint and cstat = '138' and certificado_id = cv
     and ult_nsu_depois = 1 and max_nsu = 5 and detalhe#>>'{cadeia,raiz}' = 'AC Raiz Brasileira v5';
  if n <> 1 then raise exception using errcode = 'P0009', message = 'R8 FALHOU: a trilha sem o certificado/detalhe'; end if;
  -- e sem os dois novos (como a borda antiga chamaria): segue gravando
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  r := public.fn_fiscal_dfe_registrar(ta, '137', 1, 1, now() + interval '1 hour');
  if (r->>'ult_nsu')::bigint <> 1 then raise exception using errcode = 'P0009', message = format('R8 FALHOU (sem os novos): %s', r); end if;

  -- R9 · a trilha segue imutável com as colunas novas
  begin update public.fiscal_dfe_buscas set detalhe = '{}' where titular_id = ta; raise exception using errcode = 'P0009', message = 'R9 FALHOU: trilha alterada';
  exception when sqlstate 'P0001' then null; end;
  select count(*) into n from public.fiscal_dfe_buscas where titular_id = ta;
  if n <> 4 then raise exception using errcode = 'P0009', message = format('R9 FALHOU: %s buscas (esperava 4)', n); end if;
  execute 'reset role';

  raise exception 'OK 113357: R1–R9';
end $$;
