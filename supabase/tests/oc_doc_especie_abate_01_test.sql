-- OC-DOC-ESPECIE-ABATE-01 passo 1 — as especies do abate, so' a NF soma, e o valor do documento e' o LIQUIDO. Termina em RAISE 'OK'.
-- Compara com `is distinct from`.
--   E1 esquema: CHECK com as 7 especies, as 5 colunas, a regra com ACL (authenticated sim, anon nao), as views security_invoker,
--      o registrar no md5 de destino (ff4b1f93, desde o passo 2 — o passo 1 deixou fe274801)
--   E2 (Teste, sintetico — 7f, Gabriel 15/10: nao depende do LT10 real, que muda a cada homologacao): uma OC de abate com a NF
--      do caso 8812 (bruto 98.135,31; Funrural 1.295,39 + SENAR 196,27 + Seguro 107,95) ligada a 3 lancamentos por parte viva:
--      a NF = 96.535,70 no Financeiro nos 3 (a soma de TODOS os componentes daria 99.734,92); NPR e Romaneio com valor 0
--   E3 02be1a41 (real, so' leitura): o total documentado do abate = so' as NFs; as guias (Iagro, Fundersul) valem 0 no total e
--      guardam o liquido proprio
--   E4 compra e venda: `valor_liquido` = `liquido_proprio` em TODO documento (nada deixa de somar fora do abate)
--   E5 backfill (Teste, sintetico — 7f): a regra do backfill da migration (POR ID, so' 'outro' vivo de abate com o numero na
--      regra, guarda do estado medido), ESPELHO DECLARADO do bloco 6 da migration, sobre 4 'outro' criados aqui: os 3 com numero
--      Acerto/Romaneio/NPR viram a especie, o 4o fica; nenhum 'outro' na regra sobra na OC; refazer nao muda nada
--   E6 registrar (Teste, sintetico): NPR/acerto/romaneio no abate passam, na venda recusam; especie desconhecida recusa
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; x jsonb; n int; t text; oa uuid; ov uuid; oe uuid; l uuid; d_ac uuid; d_ro uuid; d_np uuid; d_ou uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- E1
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'zoo_operacao_documentos_especie_check')) not like '%romaneio%'
     or (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zoo_operacao_documentos'
          and column_name in ('cab', 'peso_kg', 'data_abate', 'vencimento', 'dados')) is distinct from 5::bigint
     or has_function_privilege('anon', 'public._oc_documento_soma_no_valor(text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public._oc_documento_soma_no_valor(text, text)', 'EXECUTE')
     or (select reloptions from pg_class where oid = 'public.vw_oc_documentos'::regclass) is distinct from array['security_invoker=true']
     or (select reloptions from pg_class where oid = 'public.vw_lancamento_documentos'::regclass) is distinct from array['security_invoker=true']
     or (select md5(prosrc) from pg_proc where proname = 'oc_documento_registrar' and pronamespace = 'public'::regnamespace)
          is distinct from 'f3e2d13d8a0ced0cac40cedcaf76c40d' then   -- OC-DOC-SAIDA-FAZENDA-01 (7f): o passo 2 deixou ff4b1f93
    raise exception 'E1 esquema'; end if;
  if public._oc_documento_soma_no_valor('abate', 'acerto') or not public._oc_documento_soma_no_valor('abate', 'nf_principal')
     or not public._oc_documento_soma_no_valor('venda', 'recibo') or not public._oc_documento_soma_no_valor('compra', 'outro') then
    raise exception 'E1 regra'; end if;

  -- E2 (sintetico)
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  x := public.oc_salvar_rascunho(null, k, null, jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'abate'));
  oe := (x->>'operacao_id')::uuid;
  x := public.oc_documento_registrar(oe, k, jsonb_build_object('especie', 'nf_principal', 'numero', '000.008.812', 'componentes', jsonb_build_array(
         jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 98135.31, 'ordem', 1),
         jsonb_build_object('tipo', 'funrural', 'natureza', 'retencao_sem_caixa', 'valor', 1295.39, 'ordem', 2),
         jsonb_build_object('tipo', 'senar', 'natureza', 'retencao_sem_caixa', 'valor', 196.27, 'ordem', 3),
         jsonb_build_object('tipo', 'seguro', 'natureza', 'retencao_sem_caixa', 'valor', 107.95, 'ordem', 4))));
  x := public.oc_documento_registrar(oe, k, jsonb_build_object('especie', 'npr', 'numero', 'SINT-NPR', 'componentes', jsonb_build_array(
         jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 96535.70, 'ordem', 1))));
  x := public.oc_documento_registrar(oe, k, '{"especie": "romaneio", "numero": "SINT-ROM"}');
  for n in 1 .. 3 loop
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, valor, sinal,
        tipo_operacao, status_transacao, descricao, cenario)
    values (k, f, '131b8501-caf7-4964-b1b1-3f552ad2b75d', '2031-04-10', '2031-04-20', 32178.57, '1', '1-Entradas', 'programado',
        'SINT E2 ' || n, 'realizado') returning id into l;
    insert into zoo_operacao_partes (cliente_id, operacao_id, natureza, componente, origem, valor, sequencia_parcela, quantidade_parcelas, financeiro_lancamento_id)
    values (k, oe, 'principal', 'principal', 'manual', 32178.57, n, 3, l);
  end loop;
  if (select count(*) from vw_lancamento_documentos where operacao_id = oe and numero = '000.008.812') is distinct from 3::bigint
     or (select min(valor_documento) from vw_lancamento_documentos where operacao_id = oe and numero = '000.008.812') is distinct from 96535.70
     or (select max(valor_documento) from vw_lancamento_documentos where operacao_id = oe and numero = '000.008.812') is distinct from 96535.70
     or (select string_agg(especie || ':' || valor_documento, ',' order by especie) from (select distinct especie, valor_documento
          from vw_lancamento_documentos where operacao_id = oe and especie <> 'nf_principal') s)
        is distinct from 'npr:0,romaneio:0' then
    raise exception 'E2 sintetico: %', (select jsonb_agg(jsonb_build_object('e', especie, 'n', numero, 'v', valor_documento))
      from vw_lancamento_documentos where operacao_id = oe); end if;

  -- E3
  if (select sum(valor_liquido) from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado)
       is distinct from (select sum(liquido_proprio) from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado
                          and especie in ('nf_principal', 'nf_complementar'))
     or exists (select 1 from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado
                 and especie not in ('nf_principal', 'nf_complementar') and (valor_liquido <> 0 or soma_no_valor))
     /* 7f: a Taxa Iagro virou guia, com o valor como componente INFORMATIVO (liquido proprio 0) */
     or not exists (select 1 from vw_oc_documentos v join zoo_operacao_documento_componentes c on c.documento_id = v.documento_id
                     where v.operacao_id::text like '02be1a41%' and not v.cancelado and v.especie = 'guia'
                       and c.natureza = 'informativo' and c.valor = 377.85 and not c.cancelado) then
    raise exception 'E3 02be1a41'; end if;

  -- E4
  select count(*) into n from vw_oc_documentos v join zoo_operacoes_comerciais o on o.id = v.operacao_id
   where o.tipo_operacao in ('compra', 'venda') and v.especie not in ('gta', 'guia', 'declaracao')   -- 7f: os tres nunca somam
     and (v.valor_liquido is distinct from v.liquido_proprio or v.soma_no_valor is not true);
  if n is distinct from 0 then raise exception 'E4 compra/venda: % documento(s) mudaram', n; end if;

  -- E5 (sintetico; espelho do bloco 6 da migration 20261027198200)
  d_ac := (public.oc_documento_registrar(oe, k, jsonb_build_object('especie', 'outro', 'numero', 'Acerto OC 1'))->>'documento_id')::uuid;
  d_ro := (public.oc_documento_registrar(oe, k, jsonb_build_object('especie', 'outro', 'numero', 'Romaneio OP 2'))->>'documento_id')::uuid;
  d_np := (public.oc_documento_registrar(oe, k, jsonb_build_object('especie', 'outro', 'numero', 'NPR 3'))->>'documento_id')::uuid;
  d_ou := (public.oc_documento_registrar(oe, k, jsonb_build_object('especie', 'outro', 'numero', 'Taxa Iagro'))->>'documento_id')::uuid;
  for t in select unnest(array['primeira', 'refazer']) loop
    select count(*) into n from zoo_operacao_documentos d join zoo_operacoes_comerciais o on o.id = d.operacao_id
     where o.tipo_operacao = 'abate' and d.cancelado is not true
       and (   (d.id = d_ac and d.numero ilike 'acerto%'   and d.especie in ('outro', 'acerto'))
            or (d.id = d_ro and d.numero ilike 'romaneio%' and d.especie in ('outro', 'romaneio'))
            or (d.id = d_np and d.numero ilike 'npr%'      and d.especie in ('outro', 'npr')));
    if n is distinct from 3 then raise exception 'E5 guarda (%): % de 3', t, n; end if;
    update zoo_operacao_documentos set especie = 'acerto'   where id = d_ac and especie = 'outro'; get diagnostics n = row_count;
    if n is distinct from (case when t = 'primeira' then 1 else 0 end) then raise exception 'E5 acerto (%) mudou %', t, n; end if;
    update zoo_operacao_documentos set especie = 'romaneio' where id = d_ro and especie = 'outro'; get diagnostics n = row_count;
    if n is distinct from (case when t = 'primeira' then 1 else 0 end) then raise exception 'E5 romaneio (%) mudou %', t, n; end if;
    update zoo_operacao_documentos set especie = 'npr'      where id = d_np and especie = 'outro'; get diagnostics n = row_count;
    if n is distinct from (case when t = 'primeira' then 1 else 0 end) then raise exception 'E5 npr (%) mudou %', t, n; end if;
  end loop;
  select count(*) into n from zoo_operacao_documentos d where d.operacao_id = oe and d.cancelado is not true and d.especie = 'outro'
     and (d.numero ilike 'acerto%' or d.numero ilike 'romaneio%' or d.numero ilike 'npr%');
  if n is distinct from 0
     or (select string_agg(especie, ',' order by numero) from zoo_operacao_documentos where id in (d_ac, d_ro, d_np, d_ou))
        is distinct from 'acerto,npr,romaneio,outro' then
    raise exception 'E5 backfill: % outro na regra', n; end if;

  -- E6
  x := public.oc_salvar_rascunho(null, k, null, jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'abate'));
  oa := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_rascunho(null, k, null, jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'venda'));
  ov := (x->>'operacao_id')::uuid;
  x := public.oc_documento_registrar(oa, k, '{"especie": "acerto", "numero": "OC 10352"}');
  x := public.oc_documento_registrar(oa, k, '{"especie": "npr", "numero": "8812/A"}');
  x := public.oc_documento_registrar(oa, k, '{"especie": "romaneio", "numero": "OP 46323"}');
  if (select count(*) from zoo_operacao_documentos where operacao_id = oa and especie in ('acerto', 'npr', 'romaneio')) is distinct from 3::bigint then
    raise exception 'E6 abate'; end if;
  t := null;
  begin perform public.oc_documento_registrar(ov, k, '{"especie": "npr"}'); exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Especie npr so existe no abate' then raise exception 'E6 venda: %', t; end if;
  t := null;
  begin perform public.oc_documento_registrar(oa, k, '{"especie": "boleto"}'); exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Especie invalida: boleto' then raise exception 'E6 desconhecida: %', t; end if;

  raise exception 'OK OC-DOC-ESPECIE-ABATE-01: E1-E6';
end $teste$;
ROLLBACK;
