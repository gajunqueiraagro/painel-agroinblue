-- OC-PROPRIEDADE-DESTINO-01 — a "Propriedade de destino" da venda persiste. Sintetico no cliente Teste, admin simulado; termina em
-- RAISE 'OK' (desfaz tudo).
--   T1 salvar grava; salvar de novo troca; sem a chave nao apaga; vazio limpa
--   T2 OC FECHADA: `oc_editar_dados_operacao` troca, versao sobe, o evento `editar_dados` tem antes/depois
--   T3 compra nao tem propriedade de destino (CHECK e a frase da RPC)
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; op uuid; v int; msg text; ok boolean; comp record;
BEGIN
  -- T1
  r := public.oc_salvar_rascunho(null, c, null, jsonb_build_object('tipo_operacao', 'venda', 'data_operacao', '2031-06-10', 'cenario', 'realizado',
         'fazenda_id', faz, 'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb, 'propriedade_destino', ' Fazenda Exemplo '));
  op := (r->>'operacao_id')::uuid; v := (r->>'versao')::int;
  IF (SELECT propriedade_destino FROM public.zoo_operacoes_comerciais WHERE id = op) IS DISTINCT FROM 'Fazenda Exemplo' THEN RAISE EXCEPTION 'T1 criar'; END IF;
  r := public.oc_salvar_rascunho(op, c, v, jsonb_build_object('tipo_operacao', 'venda', 'data_operacao', '2031-06-10', 'fazenda_id', faz,
         'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb)); v := (r->>'versao')::int;
  IF (SELECT propriedade_destino FROM public.zoo_operacoes_comerciais WHERE id = op) IS DISTINCT FROM 'Fazenda Exemplo' THEN RAISE EXCEPTION 'T1 sem a chave apagou'; END IF;
  r := public.oc_salvar_rascunho(op, c, v, jsonb_build_object('tipo_operacao', 'venda', 'data_operacao', '2031-06-10', 'fazenda_id', faz,
         'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb, 'propriedade_destino', 'Sitio Novo')); v := (r->>'versao')::int;
  IF (SELECT propriedade_destino FROM public.zoo_operacoes_comerciais WHERE id = op) IS DISTINCT FROM 'Sitio Novo' THEN RAISE EXCEPTION 'T1 trocar'; END IF;

  -- T2
  UPDATE public.zoo_operacoes_comerciais SET status_comercial = 'fechada', rascunho = false WHERE id = op;
  PERFORM public.oc_editar_dados_operacao(op, c, jsonb_build_object('propriedade_destino', 'Retiro Alto'), v);
  IF (SELECT propriedade_destino FROM public.zoo_operacoes_comerciais WHERE id = op) IS DISTINCT FROM 'Retiro Alto'
     OR (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id = op) <> v + 1
     OR NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos e WHERE e.operacao_id = op AND e.acao = 'editar_dados'
                     AND e.dados_anteriores->>'propriedade_destino' = 'Sitio Novo' AND e.dados_novos->>'propriedade_destino' = 'Retiro Alto')
    THEN RAISE EXCEPTION 'T2 fechada nao trocou com trilha'; END IF;
  PERFORM public.oc_editar_dados_operacao(op, c, jsonb_build_object('propriedade_destino', ''), v + 1);
  IF (SELECT propriedade_destino FROM public.zoo_operacoes_comerciais WHERE id = op) IS NOT NULL THEN RAISE EXCEPTION 'T1 vazio nao limpou'; END IF;

  -- T3
  ok := false;
  BEGIN UPDATE public.zoo_operacoes_comerciais SET propriedade_destino = 'x'
          WHERE id = (SELECT id FROM public.zoo_operacoes_comerciais WHERE tipo_operacao = 'compra' LIMIT 1);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T3 compra aceitou (CHECK)'; END IF;
  SELECT id, cliente_id, versao INTO comp FROM public.zoo_operacoes_comerciais WHERE tipo_operacao = 'compra' AND status_comercial <> 'cancelada' LIMIT 1;
  msg := null; BEGIN PERFORM public.oc_editar_dados_operacao(comp.id, comp.cliente_id, jsonb_build_object('propriedade_destino', 'x'), comp.versao);
  EXCEPTION WHEN OTHERS THEN msg := sqlerrm; END;
  IF msg IS DISTINCT FROM 'Propriedade de destino so existe na venda. Nada foi gravado.' THEN RAISE EXCEPTION 'T3 frase: %', msg; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
