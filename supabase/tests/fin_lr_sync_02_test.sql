-- FIN-LR-SYNC-01 passo a2 — aplicar e desfazer a atualizacao do Lucro Rural. Cliente Teste, sintetico (abril/2032); transacao revertida;
-- termina em RAISE 'OK'. Compara com `is distinct from`.
--   S1 simular nao grava: lancamentos, vinculos e aplicacoes iguais (md5) antes e depois
--   A1 cada acao: atualizar (vencimento), atualizar (valor do mes da recorrencia: marca 'planilha'), vincular (sem_mudanca),
--      aguardar_extrato (pago no LR), ignorar (fatura), criar_programada (com a classificacao do operador)
--   A2 nunca sobrescreve classificacao, fornecedor nem fazenda; pago no LR nao muda o lancamento (md5) e grava pago_no_lr_em
--   A3 recusas com motivo: centavos e fatura sem decisao ('decisao_do_operador'), sem classificacao ('falta_classificar'),
--      ja' realizado ('ja_realizado'), situacao diferente da tela ('mudou_desde_a_comparacao')
--   A4 "fica como esta'": comparar de novo depois de aplicar: as atualizadas viram sem_mudanca; o sistema mexido depois, com o LR
--      igual a' foto, segue sem_mudanca
--   D1 desfazer simulado nao grava; desfazer volta tudo: os lancamentos que existiam iguais aos de antes do aplicar (fora os
--      carimbos), o criado cancelado pelo dono, nenhum vinculo sobra
--   D2 so' a ULTIMA aplicacao se desfaz; editado depois do aplicar nao volta e diz o motivo
--   T1 tenant alheio: 42501 no aplicar e no desfazer
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d'; c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  ps record; ps2 record; v_faz text; fa uuid; fb uuid; fc uuid; rec uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid;
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid();
  v_linhas jsonb; v jsonb; r jsonb; dec jsonb; ap1 uuid; ap2 uuid; n1 uuid; v_st text;
  v_ids uuid[]; h0 text; h1 text; hv0 text; hv1 text; ha0 bigint; ha1 bigint; m4 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  select id, subcentro into ps from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  select id, subcentro into ps2 from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and macro_custo <> 'Dividendos' and id <> ps.id order by ordem_exibicao limit 1;
  select nome into v_faz from fazendas where id = f;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT LR2 ALFA MAQUINAS', '11.222.333/0001-81', true) returning id into fa;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT LR2 BETA FOLHA', '123.456.789-09', true) returning id into fb;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT LR2 GAMA EQUIP', '22.333.444/0001-05', true) returning id into fc;
  insert into financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  values (k, f, 'SINT LR2 folha', c, ps2.subcentro, 3000, 5, '2032-04-01', '2032-04-05', '2032-12-31') returning id into rec;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2032-04-01', '2032-04-10', 1000, '-1', '2-Saídas', 'programado', 'SINT LR2 L1', ps.id, 'realizado', 'manual', fa) returning id into l1;
  -- L2: classificacao DIFERENTE da do LR (ps2 x ps) — o aplicar nunca a troca
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, cenario, origem_lancamento, favorecido_id, recorrencia_id)
  values (k, f, c, '2032-04-01', '2032-04-05', 3000, '-1', '2-Saídas', 'previsto', 'SINT LR2 L2 folha', ps2.id, 'realizado', 'manual', fb, rec) returning id into l2;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2032-04-01', '2032-04-20', 500, '-1', '2-Saídas', 'programado', 'SINT LR2 L3', ps.id, 'realizado', 'manual', fa) returning id into l3;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2032-04-01', '2032-04-12', 777, '-1', '2-Saídas', 'programado', 'SINT LR2 L4', ps.id, 'realizado', 'manual', fa) returning id into l4;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2032-04-01', '2032-04-08', 4618.36, '-1', '2-Saídas', 'programado', 'SINT LR2 L5', ps.id, 'realizado', 'manual', fc) returning id into l5;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2032-04-01', '2032-04-21', '2032-04-21', 600, '-1', '2-Saídas', 'realizado', 'SINT LR2 L6 pago', ps.id, 'realizado', 'manual', fa) returning id into l6;

  select jsonb_agg(jsonb_build_object('_arquivo', 'sint-pagar.xlsx', '_tipo_arquivo', 'pagar', 'Tipo', 'Conta a Pagar',
           'Número', t.num, 'CPF/CNPJ', t.doc, 'Fornecedor', t.nome, 'Inscrição Estadual', v_faz, 'Tipo de Contas', ps.subcentro,
           'Valor', t.valor, 'Data Vencimento', t.venc, 'Data Pagamento', t.pag, 'Data Cadastro', '02/01/2032', 'Está Pago?', t.pago) order by t.o)
    into v_linhas
    from (values (1, 'A1', '11.222.333/0001-81', 'SINT LR2 ALFA MAQUINAS', 1000, '15/04/2032', '-', 'Não'),
                 (2, 'B1', '123.456.789-09', 'SINT LR2 BETA', 3100, '05/04/2032', '-', 'Não'),
                 (3, 'A2', '11.222.333/0001-81', 'SINT LR2 ALFA MAQUINAS', 500, '20/04/2032', '-', 'Não'),
                 (4, 'A3', '11.222.333/0001-81', 'SINT LR2 ALFA MAQUINAS', 777, '12/04/2032', '12/04/2032', 'Sim'),
                 (5, 'G1', '22.333.444/0001-05', 'SINT LR2 GAMA EQUIP', 4618.35, '08/04/2032', '-', 'Não'),
                 (6, 'C1', '99999999000000', 'Cartao de Credito Visa', 2408.16, '16/04/2032', '-', 'Não'),
                 (7, 'N1', '11.222.333/0001-81', 'SINT LR2 ALFA MAQUINAS', 1234, '22/04/2032', '-', 'Não'),
                 (8, 'N2', '77.888.999/0001-00', 'SINT LR2 SEM CADASTRO', 88, '23/04/2032', '-', 'Não'),
                 (9, 'A4', '11.222.333/0001-81', 'SINT LR2 ALFA MAQUINAS', 600, '22/04/2032', '-', 'Não'),
                 (10, 'M1', '11.222.333/0001-81', 'SINT LR2 ALFA MAQUINAS', 99, '24/04/2032', '-', 'Não')
         ) t(o, num, doc, nome, valor, venc, pag, pago);

  v := public.fn_lr_sync_comparar(k, s1, v_linhas);
  if (select linhas from lr_sync_sessoes where id = s1) is distinct from v_linhas then raise exception 'preparo: a sessao nao guardou as linhas'; end if;
  -- a tela: parte da acao padrao; o operador decide os casos dele
  select jsonb_agg(jsonb_build_object('chave', x ->> 'chave', 'situacao', x ->> 'situacao', 'lancamento_visto', x ->> 'lancamento_id',
           'acao', case x -> 'lr' ->> 'numero' when 'C1' then 'ignorar' when 'A4' then 'atualizar' when 'A2' then 'vincular' else x ->> 'acao_padrao' end)
         || case when x -> 'lr' ->> 'numero' = 'N1' then jsonb_build_object('classificacao', jsonb_build_object('plano_conta_id', ps.id,
                 'fazenda_id', f, 'favorecido_id', fa, 'conta_id', c)) else '{}'::jsonb end
         || case when x -> 'lr' ->> 'numero' = 'M1' then jsonb_build_object('situacao', 'sem_mudanca') else '{}'::jsonb end)
    into dec from jsonb_array_elements(v -> 'linhas') x;
  -- preparo: as situacoes que o teste mede
  if (select string_agg((x -> 'lr' ->> 'numero') || '=' || (x ->> 'situacao') || '/' || (x ->> 'acao_padrao'), ' ' order by x -> 'lr' ->> 'numero')
        from jsonb_array_elements(v -> 'linhas') x)
     is distinct from 'A1=mudou/atualizar A2=sem_mudanca/nada A3=pago_no_lr/aguardar_extrato A4=mudou/manter B1=mudou/atualizar C1=decidir/nao_importar_fatura G1=decidir/decidir_centavos M1=nova/criar_programada N1=nova/criar_programada N2=nova/criar_programada' then
    raise exception 'preparo situacoes: %', (select string_agg((x -> 'lr' ->> 'numero') || '=' || (x ->> 'situacao') || '/' || (x ->> 'acao_padrao'), ' ' order by x -> 'lr' ->> 'numero') from jsonb_array_elements(v -> 'linhas') x); end if;

  select array_agg(id) into v_ids from financeiro_lancamentos_v2 where cliente_id = k;
  select md5(string_agg((to_jsonb(l) - 'updated_at' - 'updated_by')::text, '' order by l.id)) into h0 from financeiro_lancamentos_v2 l where l.id = any (v_ids);
  select md5(coalesce(string_agg(to_jsonb(v2)::text, '' order by v2.chave), '')) into hv0 from lr_vinculos v2 where v2.cliente_id = k;
  select count(*) into ha0 from lr_sync_aplicacoes where cliente_id = k;
  select md5(to_jsonb(l)::text) into m4 from financeiro_lancamentos_v2 l where l.id = l4;

  -- ── S1 simular ──
  r := public.fn_lr_sync_aplicar(k, s1, dec, true);
  if (r ->> 'simulado') is distinct from 'true' or (r -> 'resumo' ->> 'aplicadas')::int is distinct from 6 then raise exception 'S1 simulacao: %', r -> 'resumo'; end if;
  select md5(string_agg((to_jsonb(l) - 'updated_at' - 'updated_by')::text, '' order by l.id)) into h1 from financeiro_lancamentos_v2 l where l.cliente_id = k;
  select md5(coalesce(string_agg(to_jsonb(v2)::text, '' order by v2.chave), '')) into hv1 from lr_vinculos v2 where v2.cliente_id = k;
  select count(*) into ha1 from lr_sync_aplicacoes where cliente_id = k;
  if h1 is distinct from h0 or hv1 is distinct from hv0 or ha1 is distinct from ha0 then raise exception 'S1 simular gravou'; end if;

  -- ── A1–A3 aplicar ──
  r := public.fn_lr_sync_aplicar(k, s1, dec, false); ap1 := (r ->> 'aplicacao_id')::uuid;
  if (r -> 'resumo' ->> 'aplicadas')::int is distinct from 6 or (r -> 'resumo' ->> 'recusadas')::int is distinct from 4 then raise exception 'A1 resumo: %', r -> 'resumo'; end if;
  if (r -> 'resumo' -> 'por_motivo') is distinct from '{"ja_realizado": 1, "falta_classificar": 1, "decisao_do_operador": 1, "mudou_desde_a_comparacao": 1}'::jsonb then
    raise exception 'A3 recusas: %', r -> 'resumo' -> 'por_motivo'; end if;
  if (select data_vencimento from financeiro_lancamentos_v2 where id = l1) is distinct from date '2032-04-15' then raise exception 'A1 atualizar vencimento'; end if;
  if (select (valor, valor_do_mes_origem, plano_conta_id, favorecido_id, fazenda_id) from financeiro_lancamentos_v2 where id = l2)
     is distinct from (3100::numeric, 'planilha'::text, ps2.id, fb, f) then raise exception 'A1/A2 valor do mes ou classificacao: %', (select row(valor, valor_do_mes_origem, plano_conta_id) from financeiro_lancamentos_v2 where id = l2); end if;
  if (select md5(to_jsonb(l)::text) from financeiro_lancamentos_v2 l where l.id = l4) is distinct from m4 then raise exception 'A2 pago no LR mexeu no lancamento'; end if;
  if (select pago_no_lr_em from lr_vinculos where cliente_id = k and lancamento_id = l4) is distinct from date '2032-04-12' then raise exception 'A2 pago_no_lr_em'; end if;
  if not exists (select 1 from lr_vinculos where cliente_id = k and lancamento_id = l3 and not ignorar) then raise exception 'A1 vincular'; end if;
  if not exists (select 1 from lr_vinculos where cliente_id = k and ignorar and chave like 'p|C1|%') then raise exception 'A1 ignorar fatura'; end if;
  select lancamento_id into n1 from lr_sync_aplicacao_itens where aplicacao_id = ap1 and acao = 'criar_programada' and status = 'aplicado';
  if (select (status_transacao, data_pagamento, valor, data_vencimento, plano_conta_id, favorecido_id, conta_bancaria_id, tipo_operacao)
        from financeiro_lancamentos_v2 where id = n1)
     is distinct from ('programado'::text, null::date, 1234::numeric, date '2032-04-22', ps.id, fa, c, '2-Saídas'::text) then raise exception 'A1 criar_programada'; end if;
  if (select (valor, data_vencimento) from financeiro_lancamentos_v2 where id = l5) is distinct from (4618.36::numeric, date '2032-04-08')
     or (select status_transacao from financeiro_lancamentos_v2 where id = l6) is distinct from 'realizado' then raise exception 'A3 recusada mexeu'; end if;

  -- ── A4 fica como esta' ──
  v := public.fn_lr_sync_comparar(k, s2, v_linhas);
  if (select string_agg((x -> 'lr' ->> 'numero') || '=' || (x ->> 'situacao'), ' ' order by x -> 'lr' ->> 'numero') from jsonb_array_elements(v -> 'linhas') x
       where x -> 'lr' ->> 'numero' in ('A1', 'A2', 'B1', 'C1', 'N1')) is distinct from 'A1=sem_mudanca A2=sem_mudanca B1=sem_mudanca C1=ignorada N1=sem_mudanca' then
    raise exception 'A4 depois de aplicar: %', (select string_agg((x -> 'lr' ->> 'numero') || '=' || (x ->> 'situacao'), ' ') from jsonb_array_elements(v -> 'linhas') x); end if;

  -- ── D1 desfazer ──
  r := public.fn_lr_sync_desfazer(k, null, true);
  if (r ->> 'simulado') is distinct from 'true' or (r -> 'resumo' ->> 'desfeitas')::int is distinct from 6 then raise exception 'D1 simulacao: %', r -> 'resumo'; end if;
  if not exists (select 1 from lr_vinculos where cliente_id = k) then raise exception 'D1 simular gravou'; end if;
  r := public.fn_lr_sync_desfazer(k, ap1, false);
  if (r -> 'resumo' ->> 'desfeitas')::int is distinct from 6 or (r -> 'resumo' ->> 'nao_desfeitas')::int is distinct from 0 then raise exception 'D1 desfazer: %', r -> 'resumo'; end if;
  select md5(string_agg((to_jsonb(l) - 'updated_at' - 'updated_by')::text, '' order by l.id)) into h1 from financeiro_lancamentos_v2 l where l.id = any (v_ids);
  if h1 is distinct from h0 then raise exception 'D1 os lancamentos nao voltaram ao de antes'; end if;
  if (select cancelado from financeiro_lancamentos_v2 where id = n1) is not true then raise exception 'D1 o criado nao foi cancelado'; end if;
  select md5(coalesce(string_agg(to_jsonb(v2)::text, '' order by v2.chave), '')) into hv1 from lr_vinculos v2 where v2.cliente_id = k;
  if hv1 is distinct from hv0 then raise exception 'D1 vinculos nao voltaram'; end if;

  -- ── D2 so' a ultima; editado depois ──
  v := public.fn_lr_sync_comparar(k, s3, v_linhas);
  select jsonb_agg(jsonb_build_object('chave', x ->> 'chave', 'situacao', x ->> 'situacao', 'acao', 'atualizar'))
    into dec from jsonb_array_elements(v -> 'linhas') x where x -> 'lr' ->> 'numero' in ('A1', 'B1');
  r := public.fn_lr_sync_aplicar(k, s3, dec, false); ap2 := (r ->> 'aplicacao_id')::uuid;
  if (r -> 'resumo' ->> 'aplicadas')::int is distinct from 2 then raise exception 'D2 segunda aplicacao: %', r; end if;
  v_st := null;
  begin perform public.fn_lr_sync_desfazer(k, ap1, false); exception when others then v_st := sqlerrm; end;
  if v_st not like 'So'' a ultima%' then raise exception 'D2 desfez a anterior: %', v_st; end if;
  update financeiro_lancamentos_v2 set valor = 1111 where id = l1;
  -- o sistema mexido depois, o LR igual a' foto: fica como esta'
  v := public.fn_lr_sync_comparar(k, gen_random_uuid(), v_linhas);
  if (select x ->> 'situacao' from jsonb_array_elements(v -> 'linhas') x where x -> 'lr' ->> 'numero' = 'A1') is distinct from 'sem_mudanca' then
    raise exception 'A4 sistema mexido: %', (select x from jsonb_array_elements(v -> 'linhas') x where x -> 'lr' ->> 'numero' = 'A1'); end if;
  r := public.fn_lr_sync_desfazer(k, null, false);
  if (select x ->> 'motivo' from jsonb_array_elements(r -> 'itens') x where (x ->> 'lancamento_id')::uuid = l1) is distinct from 'editado_depois'
     or (select x ->> 'status' from jsonb_array_elements(r -> 'itens') x where (x ->> 'lancamento_id')::uuid = l2) is distinct from 'desfeito' then
    raise exception 'D2 editado depois: %', r -> 'itens'; end if;
  if (select valor from financeiro_lancamentos_v2 where id = l1) is distinct from 1111::numeric
     or (select (valor, valor_do_mes_origem) from financeiro_lancamentos_v2 where id = l2) is distinct from (3000::numeric, null::text) then
    raise exception 'D2 valores depois do desfazer'; end if;

  -- ── T1 tenant alheio ──
  perform set_config('request.jwt.claims', json_build_object('sub', '9200e0d0-095f-4ab8-a31a-3052a0faaf56', 'role', 'authenticated')::text, true);
  v_st := null; begin perform public.fn_lr_sync_aplicar(k, s1, '[]'::jsonb, true); exception when others then v_st := sqlstate; end;
  if v_st is distinct from '42501' then raise exception 'T1 aplicar alheio: %', v_st; end if;
  v_st := null; begin perform public.fn_lr_sync_desfazer(k, null, true); exception when others then v_st := sqlstate; end;
  if v_st is distinct from '42501' then raise exception 'T1 desfazer alheio: %', v_st; end if;

  raise exception 'OK FIN-LR-SYNC-02: S1 A1-A4 D1 D2 T1';
end $teste$;
ROLLBACK;
