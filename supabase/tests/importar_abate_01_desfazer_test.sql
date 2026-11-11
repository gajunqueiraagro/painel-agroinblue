-- IMPORTAR-ABATE-01 · F1 — oc_desfazer_importacao (migration 20261028117520; depende da 117500 e da 117510).
-- Sintetico no cliente Teste (o lote 6 com chaves sinteticas); a 5d255b74 real so' e' usada para uma RECUSA (antes de qualquer escrita).
-- Numa transacao revertida; termina em RAISE 'OK …'.
--   D1 previa: diz o que cancelaria (status cancelada, 5 documentos) e a OC fica como estava
--   D2 de verdade: OC cancelada; partes, lancamentos, saidas do rebanho e documentos cancelados (nada apagado); trilha
--   D3 a chave da NF ficou livre: importar o mesmo pacote cria outra OC
--   D4 recusas: OC que nao nasceu da importacao; OC ja' cancelada; recebimento ja' pago
--   D5 sem acesso ao cliente (42501)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
create function pg_temp.pacote(cli_faz uuid, cli_forn uuid, d date, chave text, chave_nfp text) returns jsonb language sql as $$
    select jsonb_build_object('fazenda_id', cli_faz, 'contraparte_id', cli_forn, 'data_abate', d, 'categoria', 'vacas', 'peso_vivo_medio_kg', 518.59,
      'observacoes', 'lote 6 · OP 47597 · importado do frigorifico', 'chave_nf', chave,
      'lotes', jsonb_build_array(
        jsonb_build_object('ordem', 1, 'cab', 26, 'peso_carcaca_kg', 7051.50, 'preco_arroba', 351.4464, 'valor_liquido', 164884.52, 'senar', 330.43, 'observacao', '10537'),
        jsonb_build_object('ordem', 2, 'cab', 1, 'peso_carcaca_kg', 234.50, 'preco_arroba', 376.09, 'valor_liquido', 5867.78, 'senar', 11.76, 'observacao', '10537 · 4 dentes')),
      'recebimento', jsonb_build_object('valor', 170752.30, 'vencimento', '2026-10-27', 'documento', '9019', 'observacao', 'NPR 9019/A · venc. 27/10/2026'),
      'documentos', jsonb_build_array(
        jsonb_build_object('especie', 'nf_principal', 'numero', '9019', 'serie', '2', 'chave_acesso', chave, 'data_emissao', d,
          'emitente_id', cli_forn, 'emitente_nome', 'Fortunceres S.A. - Minerva', 'emitente_documento', '52.168.923/0002-31',
          'cab', 27, 'peso_kg', 7286, 'data_abate', d,
          'dados', jsonb_build_object('nfs_produtor', jsonb_build_array(jsonb_build_object('numero', '9475371', 'data', d - 2, 'valor', 108783.54)), 'nfs_produtor_valor', 108783.54),
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 171094.49, 'ordem', 1),
                                           jsonb_build_object('tipo', 'senar', 'natureza', 'retencao_sem_caixa', 'valor', 342.19, 'ordem', 2))),
        jsonb_build_object('especie', 'nf_produtor', 'numero', '9475371', 'serie', '890', 'chave_acesso', chave_nfp, 'data_emissao', d - 2,
          'emitente_nome', 'PRODUTOR TESTE', 'emitente_documento', '000.000.001-91', 'cab', 27,
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'informativo', 'valor', 108783.54, 'ordem', 1))),
        jsonb_build_object('especie', 'npr', 'numero', '9019 / A', 'vencimento', '2026-10-27',
          'dados', jsonb_build_object('nf_referida', jsonb_build_object('numero', '9019')),
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 170752.30, 'ordem', 1))),
        jsonb_build_object('especie', 'acerto', 'data_abate', d, 'cab', 27, 'peso_kg', 7286, 'vencimento', '2026-10-27',
          'dados', jsonb_build_object('ordem_compra', '10537', 'lote_frigorifico', '6'),
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 171094.49, 'ordem', 1),
                                           jsonb_build_object('tipo', 'retencao_acerto', 'natureza', 'retencao_sem_caixa', 'valor', 342.19, 'ordem', 2))),
        jsonb_build_object('especie', 'romaneio', 'data_abate', d, 'cab', 27, 'peso_kg', 7286,
          'dados', jsonb_build_object('op', '47597', 'ordem_compra', '10537', 'lote_frigorifico', '6'))))
  $$;
  -- a retencao somada (SENAR + Funrural) por lote, sem a data: para comparar com o gabarito antes da reclassificacao
create function pg_temp.t_des() returns void language plpgsql as $tf$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; p jsonb; x jsonb; v_op uuid; v_op2 uuid; t text; v_gab uuid;
begin
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  p := pg_temp.pacote(f, v_forn, '2031-05-10', '50261052168923000231550020000090191123456789', '50261002935843000105558900094753711123456783');
  x := public.oc_importar_abate(k, p, false); v_op := (x->>'operacao_id')::uuid;
  -- D1 previa: nada muda
  x := public.oc_desfazer_importacao(v_op, 'IMPORTAR-ABATE-01 teste do desfazer', true);
  if not (x->>'simulado')::boolean or x->>'status_comercial' <> 'cancelada' or (x->>'documentos_cancelados')::int <> 5 then raise exception 'D1 previa: %', x; end if;
  if (select status_comercial from zoo_operacoes_comerciais where id = v_op) <> 'fechada'
     or (select count(*) from zoo_operacao_documentos where operacao_id = v_op and not cancelado) <> 5 then raise exception 'D1 a previa mudou a OC'; end if;
  -- D2 de verdade: tudo cancelado, nada apagado
  x := public.oc_desfazer_importacao(v_op, 'IMPORTAR-ABATE-01 teste do desfazer', false);
  if (select status_comercial from zoo_operacoes_comerciais where id = v_op) <> 'cancelada'
     or exists (select 1 from zoo_operacao_partes where operacao_id = v_op and not cancelada)
     or exists (select 1 from zoo_operacao_partes pt join financeiro_lancamentos_v2 l on l.id = pt.financeiro_lancamento_id where pt.operacao_id = v_op and not l.cancelado)
     or exists (select 1 from zoo_operacao_movimentacoes m join lancamentos l on l.id = m.movimentacao_id where m.operacao_id = v_op and not coalesce(l.cancelado, false))
     or exists (select 1 from zoo_operacao_documentos where operacao_id = v_op and not cancelado)
     or (select count(*) from zoo_operacao_documentos where operacao_id = v_op) <> 5
     or not exists (select 1 from zoo_operacao_eventos where operacao_id = v_op and acao = 'desfazer_importacao') then
    raise exception 'D2 desfazer: %', x; end if;
  -- D3 a chave ficou livre: importar de novo cria outra OC
  x := public.oc_importar_abate(k, p, false); v_op2 := (x->>'operacao_id')::uuid;
  if (x->>'ja_existe')::boolean or v_op2 is null or v_op2 = v_op then raise exception 'D3 reimportar: %', left(x::text, 200); end if;
  -- D4 recusas
  select id into v_gab from zoo_operacoes_comerciais where id::text like '5d255b74%';
  t := null; begin x := public.oc_desfazer_importacao(v_gab, 'IMPORTAR-ABATE-01 teste do desfazer', true); exception when others then t := sqlerrm; end;
  if t is null or t not like '%nao nasceu da importacao%' then raise exception 'D4a: %', t; end if;
  t := null; begin x := public.oc_desfazer_importacao(v_op, 'IMPORTAR-ABATE-01 teste do desfazer', true); exception when others then t := sqlerrm; end;
  if t is null or t not like '%ja'' esta'' cancelada%' then raise exception 'D4b: %', t; end if;
  update financeiro_lancamentos_v2 l set status_transacao = 'realizado', data_pagamento = '2026-10-27'
    from zoo_operacao_partes pt where pt.financeiro_lancamento_id = l.id and pt.operacao_id = v_op2 and pt.componente = 'recebimento' and not pt.cancelada;
  t := null; begin x := public.oc_desfazer_importacao(v_op2, 'IMPORTAR-ABATE-01 teste do desfazer', true); exception when others then t := sqlerrm; end;
  if t is null or t not like '%ja'' foi pago%' then raise exception 'D4c: %', t; end if;
  -- D5 sem acesso
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  t := null; begin x := public.oc_desfazer_importacao(v_op2, 'IMPORTAR-ABATE-01 teste do desfazer', true); exception when others then t := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if t is null or t not like '42501 Desfazer a importacao: sem acesso%' then raise exception 'D5: %', t; end if;
end $tf$;
DO $t$ begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  perform pg_temp.t_des();
  raise exception 'OK IMPORTAR-ABATE-01 F1 · desfazer D1–D5';
end $t$;
ROLLBACK;
