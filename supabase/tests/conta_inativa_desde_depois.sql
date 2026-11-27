-- ═══ DEPOIS ═══
do $t$
declare
  x uuid; v_faz uuid; a uuid; tpl record; v_ok text := ''; v_err text; a0 int; a1 int; v jsonb; nj03 uuid; r record; f record;
  nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_admin constant text := '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}';
begin
  set local statement_timeout = '120s';
  perform set_config('request.jwt.claims', c_admin, true);
  select id into x from clientes where id::text like '43f32d07%';
  select id into v_faz from fazendas where cliente_id = x limit 1;
  select fazenda_id, plano_conta_id, tipo_operacao, sinal, cenario, origem_lancamento into tpl
    from financeiro_lancamentos_v2 where cliente_id = x and cancelado is not true and plano_conta_id is not null limit 1;
  if x is null or tpl is null then raise exception 'fixture: cliente Teste ou lançamento modelo não achado'; end if;
  insert into financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta, codigo_conta, ativa, banco, mes_inicio)
    values (x, v_faz, 'Ensaio Inativa', 'cc', '98', true, 'Outros', '2025-01') returning id into a;
  insert into financeiro_saldos_bancarios_v2 (cliente_id, fazenda_id, conta_bancaria_id, ano_mes, saldo_inicial, saldo_final, origem_saldo_inicial, origem_saldo, status_mes, fechado)
    values (x, v_faz, a, '2025-11', 0, 100, 'manual', 'manual', 'aberto', false), (x, v_faz, a, '2026-01', 0, 0, 'manual', 'manual', 'aberto', false);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, tipo_operacao, sinal, status_transacao, cenario, origem_lancamento,
      descricao, valor, data_competencia, data_vencimento, data_pagamento)
    values (x, tpl.fazenda_id, a, tpl.plano_conta_id, tpl.tipo_operacao, tpl.sinal, 'realizado', tpl.cenario, tpl.origem_lancamento,
      'Ensaio dez/25', 10, '2025-12-10', '2025-12-10', '2025-12-10');
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (x, a, '2025-10-05', 5, 'credito', 'ensaio-inativa-1', 'Ensaio out/25');

  -- T1 a regra na conta ATIVA: como hoje (aparece mesmo sem movimento)
  if not public._fn_conta_no_mes(a, '2026-05') then raise exception 'T1 ativa sem movimento sumiu'; end if;
  if public._fn_conta_no_mes(a, '2024-12') then raise exception 'T1 antes do mes_inicio apareceu'; end if;
  if public._fn_conta_no_mes(a, '2026-13') then raise exception 'T1 mês ilegível'; end if;
  v_ok := v_ok || 'T1 · ';

  -- T2 as recusas do inativar (pelo escritor da tela)
  begin perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": false}'); raise exception 'T2a sem data passou';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; if v_err !~ 'Inativa desde' then raise exception 'T2a %', v_err; end if; end;
  begin perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": false, "inativa_desde": "2026-02-15"}'); raise exception 'T2b dia 15 passou';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; if v_err !~ 'dia 1º' then raise exception 'T2b %', v_err; end if; end;
  update financeiro_saldos_bancarios_v2 set saldo_final = 50 where conta_bancaria_id = a and ano_mes = '2026-01';
  begin perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": false, "inativa_desde": "2026-02-01"}'); raise exception 'T2c saldo passou';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; if v_err !~ 'saldo de R\$ 50,00 no fim de 01/2026' then raise exception 'T2c %', v_err; end if; end;
  update financeiro_saldos_bancarios_v2 set saldo_final = 0 where conta_bancaria_id = a and ano_mes = '2026-01';
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, tipo_operacao, sinal, status_transacao, cenario, origem_lancamento,
      descricao, valor, data_competencia, data_vencimento)
    values (x, tpl.fazenda_id, a, tpl.plano_conta_id, tpl.tipo_operacao, tpl.sinal, 'previsto', tpl.cenario, tpl.origem_lancamento, 'Ensaio aberto', 7, '2026-03-01', '2026-03-01');
  begin perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": false, "inativa_desde": "2026-02-01"}'); raise exception 'T2d aberto passou';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; if v_err !~ '1 lançamento\(s\) a partir de 01/02/2026 \(1 em aberto, 0 realizado' then raise exception 'T2d %', v_err; end if; end;
  update financeiro_lancamentos_v2 set cancelado = true where conta_bancaria_id = a and descricao = 'Ensaio aberto';
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (x, a, '2026-04-02', 3, 'credito', 'ensaio-inativa-2', 'Ensaio abr/26');
  begin perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": false, "inativa_desde": "2026-02-01"}'); raise exception 'T2e extrato passou';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text; if v_err !~ '1 linha\(s\) de extrato' then raise exception 'T2e %', v_err; end if; end;
  update extrato_bancario_v2 set cancelado_em = now() where conta_bancaria_id = a and hash_movimento = 'ensaio-inativa-2';
  v_ok := v_ok || 'T2 sem data/dia/saldo/aberto/extrato · ';

  -- T7 a prévia (antes de inativar): os números e a lista; outro cliente = 42501
  v := public.fn_conta_inativar_previa(x, a, '2026-02-01');
  if not (v->>'pode')::boolean or (v->>'abertos')::int <> 0 or jsonb_array_length(v->'lancamentos') <> 0 then raise exception 'T7 %', v; end if;
  v := public.fn_conta_inativar_previa(x, a, '2025-12-01');
  if (v->>'pode')::boolean or (v->>'realizados')::int <> 1 or jsonb_array_length(v->'lancamentos') <> 1 then raise exception 'T7b %', v; end if;
  begin perform public.fn_conta_inativar_previa(nj, a, '2026-02-01'); raise exception 'T7c outro cliente passou';
  exception when sqlstate '42501' then null; end;
  v_ok := v_ok || 'T7 prévia · ';

  -- T3 inativa OK, com a trilha
  select count(*) into a0 from audit_log where tabela_origem = 'financeiro_contas_bancarias' and registro_id = a;
  perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": false, "inativa_desde": "2026-02-01"}');
  select count(*) into a1 from audit_log where tabela_origem = 'financeiro_contas_bancarias' and registro_id = a;
  if (select ativa from financeiro_contas_bancarias where id = a) or (select inativa_desde from financeiro_contas_bancarias where id = a) <> '2026-02-01' or a1 - a0 <> 1 then
    raise exception 'T3 não inativou (trilha +%)', a1 - a0; end if;
  v_ok := v_ok || 'T3 inativa + trilha · ';

  -- T4 a regra na INATIVA: saldo (nov/25), lançamento (dez/25), extrato (out/25), antes da data (jan/26) aparecem; depois some
  if not (public._fn_conta_no_mes(a, '2025-11') and public._fn_conta_no_mes(a, '2025-12') and public._fn_conta_no_mes(a, '2025-10') and public._fn_conta_no_mes(a, '2026-01')) then
    raise exception 'T4 sumiu de mês com movimento'; end if;
  -- antes da data, tudo igual (aparece como aberta, mesmo sem movimento); a partir dela, some
  if not public._fn_conta_no_mes(a, '2025-09') then raise exception 'T4 antes da data sumiu'; end if;
  if public._fn_conta_no_mes(a, '2026-05') then raise exception 'T4 apareceu depois da data sem nada'; end if;
  if not public._fn_conta_no_periodo(a, '2025-12-01', '2026-06-30') then raise exception 'T4 período'; end if;
  -- o flag antigo (inativa SEM data): só os meses com saldo ≠ 0, lançamento ou extrato
  update financeiro_contas_bancarias set inativa_desde = null where id = a;
  if not (public._fn_conta_no_mes(a, '2025-11') and public._fn_conta_no_mes(a, '2025-12') and public._fn_conta_no_mes(a, '2025-10')) then raise exception 'T4b sumiu com movimento'; end if;
  if public._fn_conta_no_mes(a, '2025-09') or public._fn_conta_no_mes(a, '2026-01') then raise exception 'T4b apareceu sem nada'; end if;
  update financeiro_contas_bancarias set inativa_desde = '2026-02-01' where id = a;
  v_ok := v_ok || 'T4 regra na inativa (antes da data · flag antigo só com movimento) · ';

  -- T5 o gatilho, como authenticated (o lançamento novo ≥ data recusa; antes passa; trocar para a conta recusa)
  perform set_config('role', 'authenticated', true);
  begin
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, tipo_operacao, sinal, status_transacao, cenario, origem_lancamento,
        descricao, valor, data_competencia, data_vencimento)
      values (x, tpl.fazenda_id, a, tpl.plano_conta_id, tpl.tipo_operacao, tpl.sinal, 'previsto', tpl.cenario, tpl.origem_lancamento, 'Ensaio depois', 1, '2026-02-01', '2026-02-01');
    raise exception 'T5a lançamento novo na data passou';
  exception when sqlstate '23514' then get stacked diagnostics v_err = message_text; if v_err !~ 'inativa desde 01/02/2026' then raise exception 'T5a %', v_err; end if; end;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, tipo_operacao, sinal, status_transacao, cenario, origem_lancamento,
      descricao, valor, data_competencia, data_vencimento, data_pagamento)
    values (x, tpl.fazenda_id, a, tpl.plano_conta_id, tpl.tipo_operacao, tpl.sinal, 'realizado', tpl.cenario, tpl.origem_lancamento, 'Ensaio antes', 1, '2026-01-20', '2026-01-20', '2026-01-20');
  begin
    update financeiro_lancamentos_v2 set conta_bancaria_id = a
     where id = (select id from financeiro_lancamentos_v2 where cliente_id = x and cancelado is not true and conta_bancaria_id is distinct from a
                   and coalesce(data_pagamento, data_vencimento, data_competencia) >= '2026-02-01' limit 1);
    if found then raise exception 'T5c trocar para a conta passou'; end if;
  exception when sqlstate '23514' then null; end;
  perform set_config('role', 'none', true);
  v_ok := v_ok || 'T5 gatilho (authenticated) · ';

  -- T6 reativar limpa a data, com a trilha
  perform public.fn_conta_bancaria_salvar(x, a, '{"ativa": true}');
  if not (select ativa from financeiro_contas_bancarias where id = a) or (select inativa_desde from financeiro_contas_bancarias where id = a) is not null then raise exception 'T6'; end if;
  begin perform public.fn_conta_bancaria_salvar(x, null, jsonb_build_object('nome_conta', 'Ensaio Nova', 'tipo_conta', 'cc', 'fazenda_id', v_faz, 'mes_inicio', '2026-01',
      'saldo_inicial_oficial', '0', 'inativa_desde', '2026-02-01')); raise exception 'T6b conta nova com data passou';
  exception when sqlstate '22023' then null; end;
  v_ok := v_ok || 'T6 reativar limpa · ';

  -- T8 NJ igual→igual: a cc 03 (saldo 0 em jan/26, nada depois) inativa desde 01/02/2026 → nov/2022 IGUAL ao de antes (com as 4 ativas)
  select id into nj03 from financeiro_contas_bancarias where cliente_id = nj and tipo_conta = 'cc' and codigo_conta = '03';
  perform public.fn_conta_bancaria_salvar(nj, nj03, '{"ativa": false, "inativa_desde": "2026-02-01"}');
  for r in
    select 'resumo' k, count(*)::text n, round(sum(q.saldo_sistema), 2)::text s, string_agg(q.conta_id::text, ',' order by q.conta_id) ids
      from public._fn_conciliacao_resumo(nj, '2022-11', null, false, false) q
    union all
    select 'status', count(*)::text, null, string_agg(q.conta_id::text || ':' || q.status, ',' order by q.conta_id)
      from public.fn_conciliacao_status_ano(nj, 2022) q where q.ano_mes = '2022-11'
    union all
    select 'vg', count(*)::text, round(sum(w.saldo_final), 2)::text, null from public.fn_vg_saldos(nj, '2022-11-01', '2022-11-30') w
  loop
    select * into f from _ens_antes where k = r.k;
    if f.n is distinct from r.n or f.s is distinct from r.s or f.ids is distinct from r.ids then
      raise exception 'T8 % diferente: antes % / % · depois % / %', r.k, f.n, f.s, r.n, r.s; end if;
  end loop;
  if not public._fn_conta_no_mes(nj03, '2022-11') or public._fn_conta_no_mes(nj03, '2026-05') then raise exception 'T8 regra na 03'; end if;
  v_ok := v_ok || 'T8 NJ nov/2022 igual (resumo ' || (select n || ' contas ' || s from _ens_antes where k = 'resumo') || ' · vg ' || (select s from _ens_antes where k = 'vg') || ') · ';

  -- T9 os 7 leitores leem a regra; o `ativa` sumiu do trecho
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('_fn_conciliacao_resumo','fn_conciliacao_status_ano',
      'fn_conta_bancaria_efeito_conciliacao','fn_vg_saldos','fn_vg_partes','fn_vg_gaveta_ordenada','fn_faturas_cartao') and prosrc ~ '_fn_conta_no_(mes|periodo)') <> 7 then
    raise exception 'T9 leitor sem a regra'; end if;
  v_ok := v_ok || 'T9 7 leitores · ';

  raise exception 'ENSAIO OK conta inativa desde · % · salvar md5 %', v_ok,
    (select md5(prosrc) from pg_proc where oid = 'public.fn_conta_bancaria_salvar(uuid, uuid, jsonb)'::regprocedure);
end $t$;
