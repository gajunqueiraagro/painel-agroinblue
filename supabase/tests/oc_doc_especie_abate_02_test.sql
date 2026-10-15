-- OC-DOC-ESPECIE-ABATE-01 passo 2 — as RPCs gravam os campos do abate e a view os le^. Termina em RAISE 'OK'.
-- Compara com `is distinct from`. Os documentos de teste nascem no LT10 (OC 8c8a864d, real) DENTRO desta transacao revertida.
--   F1 esquema: md5 de destino das duas RPCs, as 5 colunas no fim da view, security_invoker e ACL da view, o seguro com tipo proprio
--      (achado pela NF 8812 + tipo 'seguro', nao pelo id)
--   F2 registrar: Acerto com as 5 chaves e NPR com `dados.nf_referida`; na view as colunas novas, valor 0 na soma, liquido proprio
--   F3 editar: chave ausente mantem; `cab: null` zera; `dados` substitui o objeto; `dados: {}` vira nulo
--   F4 a NF 8812 intacta: 96.535,70 na vw_oc_documentos e nos 3 lancamentos (vw_lancamento_documentos)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; op constant uuid := '8c8a864d-1d53-4be9-883a-5c9d3acb019c';
  x jsonb; a uuid; n uuid; r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- F1
  if (select md5(prosrc) from pg_proc where proname = 'oc_documento_registrar' and pronamespace = 'public'::regnamespace)
       is distinct from 'f3e2d13d8a0ced0cac40cedcaf76c40d'   -- OC-DOC-SAIDA-FAZENDA-01 (7f) sobre o ff4b1f93 do passo 2
     or (select md5(prosrc) from pg_proc where proname = 'oc_documento_editar' and pronamespace = 'public'::regnamespace)
       is distinct from 'a744b4c763131d628f78065349e2046b'
     or (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'vw_oc_documentos' and ordinal_position > 25)
       is distinct from 'cab,peso_kg,data_abate,vencimento,dados'
     or (select reloptions from pg_class where oid = 'public.vw_oc_documentos'::regclass) is distinct from array['security_invoker=true']
     or (select relacl::text from pg_class where oid = 'public.vw_oc_documentos'::regclass)
       is distinct from '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres}'
     /* 7f (Gabriel 15/10): o Seguro se acha por ATRIBUTO — o documento NF 8812 vivo da OC e o tipo 'seguro' —, nunca pelo id
        (a NF editada pela tela regrava os componentes com id novo). Um documento so', um seguro so', com o valor e a natureza. */
     or (select count(*) from zoo_operacao_documentos where operacao_id = op and numero = '000.008.812'
          and especie = 'nf_principal' and cancelado is not true) is distinct from 1::bigint
     or (select string_agg(c.tipo || ' ' || c.natureza || ' ' || c.valor, ',') from zoo_operacao_documento_componentes c
          join zoo_operacao_documentos d on d.id = c.documento_id
         where d.operacao_id = op and d.numero = '000.008.812' and d.especie = 'nf_principal' and d.cancelado is not true
           and c.tipo = 'seguro' and c.cancelado is not true)
       is distinct from 'seguro retencao_sem_caixa 107.95' then
    raise exception 'F1 esquema'; end if;

  -- F2
  x := public.oc_documento_registrar(op, k, jsonb_build_object('especie', 'acerto', 'numero', 'SINT-AC', 'cab', 54, 'peso_kg', 12906.5,
        'data_abate', '2026-09-30', 'vencimento', '2026-10-15',
        'dados', jsonb_build_object('ordem_compra', 'OC 10352', 'lote_frigorifico', 'L7', 'preco_arroba', 315.5),
        'componentes', jsonb_build_array(
           jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 98135.31, 'ordem', 1),
           jsonb_build_object('tipo', 'outros', 'natureza', 'retencao_sem_caixa', 'valor', 1599.61, 'ordem', 2, 'descricao', 'Retenções do acerto'))));
  a := (x->>'documento_id')::uuid;
  x := public.oc_documento_registrar(op, k, jsonb_build_object('especie', 'npr', 'numero', 'SINT-NPR', 'vencimento', '2026-10-20',
        'dados', jsonb_build_object('nf_referida', jsonb_build_object('numero', '8812')),
        'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 96535.70, 'ordem', 1))));
  n := (x->>'documento_id')::uuid;
  select * into r from vw_oc_documentos where documento_id = a;
  if r.cab is distinct from 54 or r.peso_kg is distinct from 12906.5 or r.data_abate is distinct from '2026-09-30'::date
     or r.vencimento is distinct from '2026-10-15'::date or r.dados->>'ordem_compra' is distinct from 'OC 10352'
     or r.valor_liquido is distinct from 0::numeric or r.liquido_proprio is distinct from 96535.70 then
    raise exception 'F2 acerto: %', row_to_json(r); end if;
  select * into r from vw_oc_documentos where documento_id = n;
  if r.valor_liquido is distinct from 0::numeric or r.liquido_proprio is distinct from 96535.70
     or r.vencimento is distinct from '2026-10-20'::date or r.dados #>> '{nf_referida,numero}' is distinct from '8812' or r.cab is not null then
    raise exception 'F2 npr: %', row_to_json(r); end if;

  -- F3
  perform public.oc_documento_editar(a, k, 1, '{"observacao": "x"}'::jsonb);
  if (select cab from zoo_operacao_documentos where id = a) is distinct from 54
     or (select dados->>'lote_frigorifico' from zoo_operacao_documentos where id = a) is distinct from 'L7' then
    raise exception 'F3 chave ausente'; end if;
  perform public.oc_documento_editar(a, k, 2, '{"dados": {"ordem_compra": "OC 9"}, "cab": null}'::jsonb);
  if (select cab from zoo_operacao_documentos where id = a) is not null
     or (select dados from zoo_operacao_documentos where id = a) is distinct from '{"ordem_compra": "OC 9"}'::jsonb
     or (select peso_kg from zoo_operacao_documentos where id = a) is distinct from 12906.5 then
    raise exception 'F3 cab null / dados'; end if;
  perform public.oc_documento_editar(a, k, 3, '{"dados": {}}'::jsonb);
  if (select dados from zoo_operacao_documentos where id = a) is not null then raise exception 'F3 dados vazio'; end if;

  -- F4
  if (select valor_liquido from vw_oc_documentos where operacao_id = op and especie = 'nf_principal' and not cancelado) is distinct from 96535.70
     or (select count(*) from vw_lancamento_documentos where operacao_id = op and numero = '000.008.812' and valor_documento = 96535.70)
       is distinct from 3::bigint then
    raise exception 'F4 NF 8812'; end if;

  raise exception 'OK OC-DOC-ESPECIE-ABATE-01 passo 2: F1-F4';
end $teste$;
ROLLBACK;
