-- OC-DOC-ESPECIE-ABATE-01 passo 1 — as especies do abate, so' a NF soma, e o valor do documento e' o LIQUIDO. Termina em RAISE 'OK'.
-- Compara com `is distinct from`.
--   E1 esquema: CHECK com as 7 especies, as 5 colunas, a regra com ACL (authenticated sim, anon nao), as views security_invoker,
--      o registrar no md5 de destino (ff4b1f93, desde o passo 2 — o passo 1 deixou fe274801)
--   E2 LT10 (OC 8c8a864d, real, so' leitura): a NF 8812 = 96.535,70 no Financeiro (era 99.734,92); NPR e Romaneio com a especie nova
--      e valor 0
--   E3 02be1a41 (real, so' leitura): o total documentado do abate = so' as NFs; as guias (Iagro, Fundersul) valem 0 no total e
--      guardam o liquido proprio
--   E4 compra e venda: `valor_liquido` = `liquido_proprio` em TODO documento (nada deixa de somar fora do abate)
--   E5 backfill: 20 acerto, 10 romaneio, 8 npr; nenhum abate vivo 'outro' com numero Acerto/Romaneio/NPR; refazer nao muda nada
--   E6 registrar (Teste, sintetico): NPR/acerto/romaneio no abate passam, na venda recusam; especie desconhecida recusa
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; x jsonb; n int; t text; oa uuid; ov uuid;
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
          is distinct from 'ff4b1f93d7f6c6c73e1c013c961426a4' then
    raise exception 'E1 esquema'; end if;
  if public._oc_documento_soma_no_valor('abate', 'acerto') or not public._oc_documento_soma_no_valor('abate', 'nf_principal')
     or not public._oc_documento_soma_no_valor('venda', 'recibo') or not public._oc_documento_soma_no_valor('compra', 'outro') then
    raise exception 'E1 regra'; end if;

  -- E2
  if (select min(valor_documento) from vw_lancamento_documentos where operacao_id = '8c8a864d-1d53-4be9-883a-5c9d3acb019c'
        and numero = '000.008.812') is distinct from 96535.70
     or (select max(valor_documento) from vw_lancamento_documentos where operacao_id = '8c8a864d-1d53-4be9-883a-5c9d3acb019c'
        and numero = '000.008.812') is distinct from 96535.70
     or (select string_agg(especie || ':' || valor_documento, ',' order by especie) from (select distinct especie, valor_documento
          from vw_lancamento_documentos where operacao_id = '8c8a864d-1d53-4be9-883a-5c9d3acb019c' and especie <> 'nf_principal') s)
        is distinct from 'npr:0,romaneio:0' then
    raise exception 'E2 LT10: %', (select jsonb_agg(jsonb_build_object('e', especie, 'n', numero, 'v', valor_documento))
      from vw_lancamento_documentos where operacao_id = '8c8a864d-1d53-4be9-883a-5c9d3acb019c'); end if;

  -- E3
  if (select sum(valor_liquido) from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado)
       is distinct from (select sum(liquido_proprio) from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado
                          and especie in ('nf_principal', 'nf_complementar'))
     or exists (select 1 from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado
                 and especie not in ('nf_principal', 'nf_complementar') and (valor_liquido <> 0 or soma_no_valor))
     or not exists (select 1 from vw_oc_documentos where operacao_id::text like '02be1a41%' and not cancelado
                     and especie = 'outro' and liquido_proprio = 377.85) then
    raise exception 'E3 02be1a41'; end if;

  -- E4
  select count(*) into n from vw_oc_documentos v join zoo_operacoes_comerciais o on o.id = v.operacao_id
   where o.tipo_operacao in ('compra', 'venda') and (v.valor_liquido is distinct from v.liquido_proprio or v.soma_no_valor is not true);
  if n is distinct from 0 then raise exception 'E4 compra/venda: % documento(s) mudaram', n; end if;

  -- E5
  select count(*) into n from zoo_operacao_documentos d join zoo_operacoes_comerciais o on o.id = d.operacao_id
   where o.tipo_operacao = 'abate' and d.cancelado is not true and d.especie = 'outro'
     and (d.numero ilike 'acerto%' or d.numero ilike 'romaneio%' or d.numero ilike 'npr%');
  if n is distinct from 0
     or (select count(*) from zoo_operacao_documentos where especie = 'acerto') is distinct from 20::bigint
     or (select count(*) from zoo_operacao_documentos where especie = 'romaneio') is distinct from 10::bigint
     or (select count(*) from zoo_operacao_documentos where especie = 'npr') is distinct from 8::bigint then
    raise exception 'E5 backfill: % outro na regra', n; end if;
  update zoo_operacao_documentos set especie = 'acerto' where especie = 'outro' and numero ilike 'acerto%'
     and cancelado is not true and operacao_id in (select id from zoo_operacoes_comerciais where tipo_operacao = 'abate');
  get diagnostics n = row_count;
  if n is distinct from 0 then raise exception 'E5 refazer mudou % linha(s)', n; end if;

  -- E6
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
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
