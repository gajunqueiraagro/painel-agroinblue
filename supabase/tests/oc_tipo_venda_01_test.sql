-- OC-CORRECOES-01 A · OC-TIPO-VENDA-01 — o tipo de venda persiste. Sintetico no cliente Teste (a OC copiada de uma venda real so' na
-- estrutura), admin simulado; termina em RAISE 'OK' (desfaz tudo).
--   T1 salvar (rascunho) com 'gado_adulto' grava; salvar de novo com 'desmama' troca; "fechar e reabrir" = ler a linha de novo
--   T2 OC FECHADA: `oc_editar_dados_operacao` troca desmama <-> gado adulto (versao sobe, evento na trilha); boitel recusa; invalido recusa
--   T3 a saida do rebanho criada pela OC herda o tipo da OC
--   T4 compra nao tem tipo de venda (o CHECK recusa)
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; op uuid; lote uuid; v int; msg text; tv text; ok boolean;
BEGIN
  -- T1
  r := public.oc_salvar_rascunho(null, c, null, jsonb_build_object('tipo_operacao', 'venda', 'data_operacao', '2031-06-10', 'cenario', 'realizado',
         'fazenda_id', faz, 'contraparte_id', null, 'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb, 'tipo_venda', 'gado_adulto'));
  op := (r->>'operacao_id')::uuid; v := (r->>'versao')::int;
  if (select tipo_venda from public.zoo_operacoes_comerciais where id = op) is distinct from 'gado_adulto' then raise exception 'T1 criar nao gravou'; end if;
  r := public.oc_salvar_rascunho(op, c, v, jsonb_build_object('tipo_operacao', 'venda', 'data_operacao', '2031-06-10', 'fazenda_id', faz,
         'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb, 'tipo_venda', 'desmama'));
  v := (r->>'versao')::int;
  if (select tipo_venda from public.zoo_operacoes_comerciais where id = op) is distinct from 'desmama' then raise exception 'T1 salvar de novo nao trocou'; end if;
  -- salvar SEM a chave nao apaga (o payload antigo continua valendo)
  r := public.oc_salvar_rascunho(op, c, v, jsonb_build_object('tipo_operacao', 'venda', 'data_operacao', '2031-06-10', 'fazenda_id', faz,
         'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb));
  v := (r->>'versao')::int;
  if (select tipo_venda from public.zoo_operacoes_comerciais where id = op) is distinct from 'desmama' then raise exception 'T1 sem a chave apagou'; end if;

  -- T3 a saida herda (a OC sai do rascunho tecnico — programada, como o Salvar completo deixa —; o lote sintetico da propria OC)
  update public.zoo_operacoes_comerciais set rascunho = false, status_comercial = 'programada' where id = op;
  insert into public.zoo_operacao_lotes (cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada)
    values (c, op, 1, 'bois', 3) returning id into lote;
  perform public.oc_registrar_movimentacao(op, c, lote, date '2031-06-10', 'bois', 3, 450, 1350, 'SINT OC-TIPO-VENDA-01');
  select l.tipo_venda into tv from public.zoo_operacao_movimentacoes om join public.lancamentos l on l.id = om.movimentacao_id
   where om.operacao_id = op order by om.created_at desc limit 1;
  if tv is distinct from 'desmama' then raise exception 'T3 a saida nao herdou: %', tv; end if;
  v := (select versao from public.zoo_operacoes_comerciais where id = op);

  -- T2 fechada (sintetico: o status direto; o caminho da tela e' o `editar_dados`)
  update public.zoo_operacoes_comerciais set status_comercial = 'fechada', rascunho = false where id = op;
  r := public.oc_editar_dados_operacao(op, c, jsonb_build_object('tipo_venda', 'gado_adulto'), v);
  if (select tipo_venda from public.zoo_operacoes_comerciais where id = op) is distinct from 'gado_adulto'
     or (select versao from public.zoo_operacoes_comerciais where id = op) <> v + 1
     or not exists (select 1 from public.zoo_operacao_eventos e where e.operacao_id = op and e.created_at >= now() - interval '1 minute'
                     and e.dados_novos::text like '%tipo_venda%')
    then raise exception 'T2 fechada nao trocou (ou sem trilha)'; end if;
  v := v + 1;
  msg := null; begin perform public.oc_editar_dados_operacao(op, c, jsonb_build_object('tipo_venda', 'boitel'), v); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Boitel tem planejamento próprio: para trocar de ou para boitel, reabra a operação. Nada foi gravado.' then raise exception 'T2 boitel: %', msg; end if;
  msg := null; begin perform public.oc_editar_dados_operacao(op, c, jsonb_build_object('tipo_venda', 'escala'), v); exception when others then msg := sqlerrm; end;
  if msg not like 'Tipo de venda invalido%' then raise exception 'T2 invalido: %', msg; end if;

  -- T4
  ok := false;
  begin update public.zoo_operacoes_comerciais set tipo_venda = 'desmama'
         where id = (select id from public.zoo_operacoes_comerciais where tipo_operacao = 'compra' limit 1);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'T4 compra aceitou tipo de venda'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
