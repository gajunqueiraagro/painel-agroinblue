-- OC-DOC-VENDA-01 — as especies da venda, o que soma e a nota repetida pela chave. Sintetico no cliente Teste (as OCs copiadas de
-- uma venda e de um abate reais so' na estrutura), admin simulado; termina em RAISE 'OK' (desfaz tudo).
--   V1 especies por tipo: a venda aceita NF do produtor, GTA, contrato, NF de entrada e comprovante; o abate recusa contrato; a
--      compra recusa NF do produtor
--   V2 o que soma: na venda a NF do produtor soma e contrato/NF de entrada/comprovante/outro nao; no abate a NF do produtor nao soma
--   V3 nota repetida (cliente inteiro): a mesma chave noutra OC e' barrada no registrar (23505, DETAIL com a OC e o rotulo, sem
--      uuid no texto); o editar barra a chave que MUDA para a de outra nota e deixa editar mantendo a propria; cancelada libera
--   V4 guarda (42501) e ACL da pergunta da tela
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.oc(p_tipo text) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.zoo_operacoes_comerciais select (jsonb_populate_record(null::public.zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v, 'cliente_id', '43f32d07-dba8-4670-900c-bf645440c04a', 'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f',
      'contraparte_id', null, 'versao', 1, 'is_teste', true, 'rascunho', false, 'status_comercial', 'fechada',
      'data_operacao', '2031-04-02'))).*
    from public.zoo_operacoes_comerciais o where o.tipo_operacao = p_tipo and o.status_comercial <> 'cancelada' limit 1;
  return v;
end $f$;
create function pg_temp.reg(p_op uuid, p_especie text, p_chave text default null, p_natureza text default 'acrescimo') returns jsonb language sql as $f$
  select public.oc_documento_registrar(p_op, '43f32d07-dba8-4670-900c-bf645440c04a', jsonb_build_object(
    'especie', p_especie, 'numero', '123', 'chave_acesso', p_chave,
    'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', p_natureza, 'valor', 100, 'ordem', 1)),
    'lotes', '[]'::jsonb))
$f$;

DO $t$
DECLARE
  c constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ch constant text := '5026 1012 3456 7800 0190 5500 1000 0001 2310 0000 0017';
  va uuid; vb uuid; ab uuid; co uuid; r jsonb; d1 uuid; d2 uuid; msg text; det text; st text; ok boolean;
BEGIN
  va := pg_temp.oc('venda'); vb := pg_temp.oc('venda'); ab := pg_temp.oc('abate'); co := pg_temp.oc('compra');

  -- V1
  perform pg_temp.reg(va, 'nf_produtor'); perform pg_temp.reg(va, 'gta');
  perform pg_temp.reg(va, 'contrato', null, 'informativo'); perform pg_temp.reg(va, 'nf_entrada', null, 'informativo');
  perform pg_temp.reg(va, 'comprovante', null, 'informativo');
  msg := null; begin perform pg_temp.reg(ab, 'contrato'); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Especie contrato so existe na venda' then raise exception 'V1 abate aceitou contrato: %', msg; end if;
  msg := null; begin perform pg_temp.reg(co, 'nf_produtor'); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Especie nf_produtor so existe no abate e na venda' then raise exception 'V1 compra aceitou nf_produtor: %', msg; end if;
  perform pg_temp.reg(ab, 'nf_produtor', null, 'informativo');

  -- V2
  if not public._oc_documento_soma_no_valor('venda', 'nf_produtor') or public._oc_documento_soma_no_valor('venda', 'contrato')
     or public._oc_documento_soma_no_valor('venda', 'nf_entrada') or public._oc_documento_soma_no_valor('venda', 'comprovante')
     or public._oc_documento_soma_no_valor('abate', 'nf_produtor') or not public._oc_documento_soma_no_valor('venda', 'recibo')
     -- 21/10: o "outro" da venda e' informativo, igual ao abate; o da compra segue somando
     or public._oc_documento_soma_no_valor('venda', 'outro') or not public._oc_documento_soma_no_valor('compra', 'outro')
    then raise exception 'V2 regra de soma'; end if;

  -- V3 nota repetida
  d1 := (pg_temp.reg(va, 'nf_produtor', ch)->>'documento_id')::uuid;
  msg := null; det := null;
  begin perform pg_temp.reg(vb, 'nf_entrada', replace(ch, ' ', ''), 'informativo');
  exception when others then get stacked diagnostics msg = message_text, det = pg_exception_detail, st = returned_sqlstate; end;
  if st is distinct from '23505' or msg not like 'Esta nota já está registrada (Venda de 02/04/2031). Nada foi gravado.'
     or (det::jsonb->>'operacao_id')::uuid is distinct from va or (det::jsonb->>'documento_id')::uuid is distinct from d1
     or det::jsonb->>'tipo_operacao' <> 'venda' or position(va::text in msg) > 0
    then raise exception 'V3 registrar repetida: % | % | %', st, msg, det; end if;
  r := public.oc_documento_nota_repetida(c, ch, null);
  if (r->>'documento_id')::uuid is distinct from d1 or public.oc_documento_nota_repetida(c, ch, d1) is not null
     or public.oc_documento_nota_repetida(c, '123', null) is not null then raise exception 'V3 pergunta da tela: %', r; end if;
  -- o editar: a chave que muda para a de outra nota e' barrada; a propria segue editavel
  d2 := (pg_temp.reg(vb, 'nf_produtor', '5026 1012 3456 7800 0190 5500 1000 0001 2310 0000 0099')->>'documento_id')::uuid;
  st := null; begin perform public.oc_documento_editar(d2, c, 1, jsonb_build_object('chave_acesso', ch));
  exception when others then st := sqlstate; end;
  if st is distinct from '23505' then raise exception 'V3 editar para chave repetida passou: %', st; end if;
  r := public.oc_documento_editar(d1, c, 1, jsonb_build_object('chave_acesso', ch, 'observacao', 'mesma chave'));
  if (r->>'ok')::boolean is not true then raise exception 'V3 editar mantendo a chave: %', r; end if;
  -- cancelada libera
  perform public.oc_documento_cancelar(d1, c, 'teste');
  perform pg_temp.reg(vb, 'nf_entrada', ch, 'informativo');

  -- V4
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.oc_documento_nota_repetida(c, ch, null); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'V4 sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE')
    then raise exception 'V4 ACL'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
