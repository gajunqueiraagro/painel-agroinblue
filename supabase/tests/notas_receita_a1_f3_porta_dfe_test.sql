-- NOTAS-RECEITA-A1-01 · F3.1 — ENSAIO da 20261028113350 (roda como postgres; termina em RAISE 'OK…': NADA fica no banco). Antes deste
-- bloco, na MESMA transação, roda o corpo da migration. Fixture SINTÉTICO no cliente Teste (43f32d07…); chaves e documentos inventados.
do $$
declare
  a uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';
  ta uuid; r jsonb; n int; s text;
  ka text := '50261112345678000190550010000012341000012345';
  kb text := '50261112345678000190550010000012351000012356';
  kc text := '50261112345678000190550010000012361000012367';
  doc_a jsonb; doc_b jsonb; doc_c jsonb;
begin
  insert into public.fiscal_titulares (cliente_id, nome, documento) values (a, 'TITULAR SINTETICO 113350', '52998224725') returning id into ta;
  doc_a := jsonb_build_object('tipo', 'nfe', 'chave', ka, 'nsu', '1', 'esquema', 'resNFe_v1.01.xsd', 'situacao', 'resumo',
    'emitente_documento', '12345678000190', 'emitente_nome', 'CASA AGRO SINTETICA', 'emissao', '2026-11-10', 'valor_cent', 1234560,
    'resumo', jsonb_build_object('cSitNFe', '1'), 'xml', null);
  doc_b := doc_a || jsonb_build_object('chave', kb, 'nsu', '2', 'esquema', 'procNFe_v4.00.xsd', 'situacao', 'xml', 'xml', '<nfeProc>B</nfeProc>');
  doc_c := doc_a || jsonb_build_object('chave', kc, 'nsu', '4');

  -- P1 · authenticated não chama nenhuma das duas
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.fn_fiscal_dfe_pedido_abrir(ta); raise exception using errcode = 'P0009', message = format('P1 FALHOU: authenticated abriu pedido');
  exception when insufficient_privilege then null; end;
  begin perform public.fn_fiscal_dfe_registrar(ta, '137', 0, 0, null); raise exception using errcode = 'P0009', message = format('P1 FALHOU: authenticated registrou');
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- o resto como service_role (quem a borda usa)
  execute 'set local role service_role';
  -- P2 · registrar sem pedido aberto: recusa
  begin perform public.fn_fiscal_dfe_registrar(ta, '137', 0, 0, null); raise exception using errcode = 'P0009', message = format('P2 FALHOU: registrou sem pedido');
  exception when sqlstate 'P0001' then null; end;
  -- P3 · abrir: cria o relógio, pode; o 2º pedido ao mesmo tempo: em_andamento
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  if not (r->>'pode')::boolean or (r->>'ult_nsu')::bigint <> 0 or r->>'documento' <> '52998224725' then raise exception using errcode = 'P0009', message = format('P3 FALHOU: %s', r); end if;
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  if (r->>'pode')::boolean or r->>'motivo' <> 'em_andamento' then raise exception using errcode = 'P0009', message = format('P3 FALHOU (um por vez): %s', r); end if;

  -- P4 · 138 com A (resumo) e B (xml): 2 novos, NSU 2, pedido fechado, 1 linha na trilha
  r := public.fn_fiscal_dfe_registrar(ta, '138', 2, 10, null, jsonb_build_array(doc_a, doc_b), '[]');
  if (r->>'novos')::int <> 2 or (r->>'ult_nsu')::bigint <> 2 then raise exception using errcode = 'P0009', message = format('P4 FALHOU: %s', r); end if;
  select count(*) into n from public.fiscal_dfe_recebidos where titular_id = ta;
  if n <> 2 then raise exception using errcode = 'P0009', message = format('P4 FALHOU: %s na caixa', n); end if;
  select count(*) into n from public.fiscal_dfe_controle where titular_id = ta and ult_nsu = 2 and max_nsu = 10 and em_andamento_desde is null and ultimo_cstat = '138';
  if n <> 1 then raise exception using errcode = 'P0009', message = format('P4 FALHOU: relógio'); end if;
  select count(*) into n from public.fiscal_dfe_buscas where titular_id = ta and cstat = '138' and ult_nsu_antes = 0 and ult_nsu_depois = 2 and novos = 2 and via = 'borda:fiscal-dfe-buscar';
  if n <> 1 then raise exception using errcode = 'P0009', message = format('P4 FALHOU: trilha'); end if;

  -- P5 · A volta como XML: sobe para 'xml' com o XML; depois A como resumo de novo: NÃO rebaixa; nunca duplica
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  r := public.fn_fiscal_dfe_registrar(ta, '138', 3, 10, null,
    jsonb_build_array(doc_a || jsonb_build_object('nsu', '3', 'esquema', 'procNFe_v4.00.xsd', 'situacao', 'xml', 'xml', '<nfeProc>A</nfeProc>')), '[]');
  if (r->>'novos')::int <> 0 or (r->>'atualizados')::int <> 1 then raise exception using errcode = 'P0009', message = format('P5 FALHOU: %s', r); end if;
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  perform public.fn_fiscal_dfe_registrar(ta, '138', 3, 10, null, jsonb_build_array(doc_a), '[]');
  select situacao || '|' || coalesce(xml, '-') || '|' || nsu into s from public.fiscal_dfe_recebidos where titular_id = ta and chave = ka;
  if s <> 'xml|<nfeProc>A</nfeProc>|1' then raise exception using errcode = 'P0009', message = format('P5 FALHOU: %s', s); end if;
  select count(*) into n from public.fiscal_dfe_recebidos where titular_id = ta;
  if n <> 2 then raise exception using errcode = 'P0009', message = format('P5 FALHOU: duplicou (%s linhas)', n); end if;

  -- P6 · cancelamento (110111) de B: cancelado_na_sefaz e o evento no resumo; evento de chave que não temos: conta como sem nota
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  r := public.fn_fiscal_dfe_registrar(ta, '138', 5, 10, null, '[]', jsonb_build_array(
    jsonb_build_object('chave', kb, 'nsu', '5', 'esquema', 'resEvento_v1.01.xsd', 'tpEvento', '110111', 'descricao', 'Cancelamento', 'em', '2026-11-11T08:00:00-04:00'),
    jsonb_build_object('chave', kc, 'nsu', '5', 'esquema', 'resEvento_v1.01.xsd', 'tpEvento', '110111', 'descricao', 'Cancelamento', 'em', null)));
  if (r->>'eventos')::int <> 1 or (r->>'eventos_sem_nota')::int <> 1 then raise exception using errcode = 'P0009', message = format('P6 FALHOU: %s', r); end if;
  select situacao || '|' || jsonb_array_length(resumo->'eventos') into s from public.fiscal_dfe_recebidos where titular_id = ta and chave = kb;
  if s <> 'cancelado_na_sefaz|1' then raise exception using errcode = 'P0009', message = format('P6 FALHOU: %s', s); end if;
  -- e cancelado não volta para xml
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  perform public.fn_fiscal_dfe_registrar(ta, '138', 5, 10, null, jsonb_build_array(doc_b), '[]');
  select situacao into s from public.fiscal_dfe_recebidos where titular_id = ta and chave = kb;
  if s <> 'cancelado_na_sefaz' then raise exception using errcode = 'P0009', message = format('P6 FALHOU: cancelado voltou para %s', s); end if;

  -- P7 · importado fica importado (cancelamento só anota o evento)
  execute 'reset role';
  update public.fiscal_dfe_recebidos set situacao = 'importado' where titular_id = ta and chave = ka;
  execute 'set local role service_role';
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  perform public.fn_fiscal_dfe_registrar(ta, '138', 6, 10, null, '[]', jsonb_build_array(
    jsonb_build_object('chave', ka, 'nsu', '6', 'esquema', 'resEvento_v1.01.xsd', 'tpEvento', '110111', 'descricao', 'Cancelamento', 'em', null)));
  select situacao || '|' || jsonb_array_length(resumo->'eventos') into s from public.fiscal_dfe_recebidos where titular_id = ta and chave = ka;
  if s <> 'importado|1' then raise exception using errcode = 'P0009', message = format('P7 FALHOU: %s', s); end if;

  -- P8 · 137: o NSU NUNCA volta (veio 1, fica 6), marca o "não antes de"; o próximo pedido espera
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  r := public.fn_fiscal_dfe_registrar(ta, '137', 1, 1, now() + interval '1 hour');
  if (r->>'ult_nsu')::bigint <> 6 then raise exception using errcode = 'P0009', message = format('P8 FALHOU: NSU voltou para %s', r->>'ult_nsu'); end if;
  r := public.fn_fiscal_dfe_pedido_abrir(ta);
  if (r->>'pode')::boolean or r->>'motivo' <> 'espera' then raise exception using errcode = 'P0009', message = format('P8 FALHOU (espera): %s', r); end if;

  -- P9 · tudo ou nada: 137 com documentos, documento torto, cStat torto → recusa e NADA muda
  execute 'reset role';
  update public.fiscal_dfe_controle set nao_antes_de = null, em_andamento_desde = null where titular_id = ta;
  execute 'set local role service_role';
  perform public.fn_fiscal_dfe_pedido_abrir(ta);
  begin perform public.fn_fiscal_dfe_registrar(ta, '137', 9, 9, null, jsonb_build_array(doc_c), '[]'); raise exception using errcode = 'P0009', message = format('P9 FALHOU: 137 com documento');
  exception when sqlstate 'P0001' then null; end;
  begin perform public.fn_fiscal_dfe_registrar(ta, '138', 9, 9, null, jsonb_build_array(doc_c, doc_a || jsonb_build_object('situacao', 'importado')), '[]');
    raise exception using errcode = 'P0009', message = format('P9 FALHOU: documento torto');
  exception when sqlstate 'P0001' then null; end;
  begin perform public.fn_fiscal_dfe_registrar(ta, 'x', 9, 9, null); raise exception using errcode = 'P0009', message = format('P9 FALHOU: cStat torto');
  exception when sqlstate 'P0001' then null; end;
  select count(*) into n from public.fiscal_dfe_recebidos where titular_id = ta and chave = kc;
  if n <> 0 then raise exception using errcode = 'P0009', message = format('P9 FALHOU: o lote recusado deixou o doc C'); end if;
  select count(*) into n from public.fiscal_dfe_controle where titular_id = ta and ult_nsu = 6;
  if n <> 1 then raise exception using errcode = 'P0009', message = format('P9 FALHOU: o relógio andou'); end if;

  -- P10 · a trilha das buscas não se altera nem se apaga
  execute 'reset role';
  begin update public.fiscal_dfe_buscas set cstat = '000' where titular_id = ta; raise exception using errcode = 'P0009', message = format('P10 FALHOU: trilha alterada');
  exception when sqlstate 'P0001' then null; end;
  begin delete from public.fiscal_dfe_buscas where titular_id = ta; raise exception using errcode = 'P0009', message = format('P10 FALHOU: trilha apagada');
  exception when sqlstate 'P0001' then null; end;
  select count(*) into n from public.fiscal_dfe_buscas where titular_id = ta;
  if n <> 7 then raise exception using errcode = 'P0009', message = format('P10 FALHOU: %s buscas na trilha (esperava 7)', n); end if;

  -- P11 · o authenticated do cliente LÊ a trilha e a caixa pela RLS (gestor do Teste nesta transação)
  insert into public.cliente_membros (user_id, cliente_id, perfil, ativo) values (u, a, 'gestor_cliente', true);
  execute 'set local role authenticated';
  select count(*) into n from public.fiscal_dfe_buscas where titular_id = ta;
  if n <> 7 then raise exception using errcode = 'P0009', message = format('P11 FALHOU: o gestor vê %s buscas', n); end if;
  execute 'reset role';

  raise exception 'OK 113350: P1–P11';
end $$;
