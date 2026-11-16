-- LANC-PATRIMONIO-VINCULO-01 · 116270 — fn_patrimonio_bem_criar_e_ligar. Fixture SINTÉTICA no cliente Teste (43f32d07); roda como
-- `authenticated` com as claims de um usuário real (o admin 7bd0b6ad; o de fora a91962cd). TERMINA EM RAISE: nada fica no banco.
--   T1  prévia limpa: ok, o código que o bem teria (INS-…), a soma de aquisição = o lançamento, a ficha (categoria/vida da salvar) —
--       e NADA ficou (nenhum bem, nenhum vínculo, o contador do código intacto)
--   T2  gravar: nasce o bem JÁ LIGADO (1 vínculo vivo, versão 2 = salvar 1 + ligar), o código da prévia, o lançamento NÃO mudou
--   T3  a recusa do ligar na gravação (conta de RH) desfaz TUDO: o erro é a frase do ligar e nenhum bem nasceu
--   T4  a prévia com RH: ok=false, n_recusas=1, a frase no item — e nada ficou
--   T5  com `id` no p_bem: recusa (só cria)
--   T6  a recusa da salvar (sem descrição) sai com a frase dela, na prévia e na gravação
--   T7  guarda: o usuário de FORA do Teste leva 42501 (nunca outro erro); sem cliente, 42501; o controle (admin) passa da guarda
--   T8  ACL: anon não executa; authenticated executa
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- fixture como postgres: dois lançamentos realizados (Instalações e RH), sintéticos -----------------------------------------------
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  p_inst uuid := (select id from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Investimento em Instalações Pecuária');
  p_rh uuid := (select id from public.financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Investimento em Treinamentos Pecuária');
  a uuid; r uuid;
begin
  if p_inst is null or p_rh is null then raise exception 'fixture: contas do plano não encontradas'; end if;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, data_pagamento, data_vencimento, valor, tipo_operacao,
    sinal, status_transacao, cancelado, plano_conta_id, descricao, origem_lancamento, cenario)
  values (c_cli, c_faz, '2026-11-08', '2026-11-08', '2026-11-08', 3480, '2-Saídas', '-1', 'realizado', false, p_inst,
          'Inversor sintetico criar-e-ligar', 'manual', 'realizado') returning id into a;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, data_pagamento, data_vencimento, valor, tipo_operacao,
    sinal, status_transacao, cancelado, plano_conta_id, descricao, origem_lancamento, cenario)
  values (c_cli, c_faz, '2026-11-08', '2026-11-08', '2026-11-08', 500, '2-Saídas', '-1', 'realizado', false, p_rh,
          'Treinamento sintetico criar-e-ligar', 'manual', 'realizado') returning id into r;
  perform set_config('teste.a', a::text, true);
  perform set_config('teste.rh', r::text, true);
  perform set_config('teste.bem', jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz,
    'categoria_id', (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'instalacoes'),
    'descricao', 'Inversor sintetico criar-e-ligar', 'situacao', 'em_formacao', 'atividade', 'pecuaria')::text, true);
  perform set_config('teste.lanc_antes', (select row_to_json(l)::text from public.financeiro_lancamentos_v2 l where l.id = a), true);
end $fx$;

-- T8 ACL ------------------------------------------------------------------------------------------------------------------------
do $t8$
begin
  if has_function_privilege('anon', 'public.fn_patrimonio_bem_criar_e_ligar(jsonb,jsonb,boolean,boolean)', 'execute') then raise exception 'T8: anon executa'; end if;
  if not has_function_privilege('authenticated', 'public.fn_patrimonio_bem_criar_e_ligar(jsonb,jsonb,boolean,boolean)', 'execute') then raise exception 'T8: authenticated não executa'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.fn_patrimonio_bem_criar_e_ligar(jsonb,jsonb,boolean,boolean)'::regprocedure) then raise exception 'T8: não é SECURITY DEFINER'; end if;
end $t8$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  b jsonb := current_setting('teste.bem')::jsonb;
  ia jsonb := jsonb_build_array(jsonb_build_object('lancamento_id', current_setting('teste.a')));
  irh jsonb := jsonb_build_array(jsonb_build_object('lancamento_id', current_setting('teste.rh')));
  r jsonb; v_msg text; v_state text; v_bens int; v_id uuid; v_cod_previa text;
begin
  v_bens := (select count(*) from public.patrimonio_bens where cliente_id = c_cli);

  -- T1 prévia limpa
  r := public.fn_patrimonio_bem_criar_e_ligar(b, ia, false, true);
  if not (r->>'ok')::boolean or (r->>'simulado')::boolean is not true then raise exception 'T1: prévia não ok: %', r; end if;
  if r->>'codigo' !~ '^INS-' then raise exception 'T1: código da prévia %', r->>'codigo'; end if;
  if (r->'ligar'->>'soma_aquisicao')::numeric <> 3480 or (r->'ligar'->>'n_ligar')::int <> 1 then raise exception 'T1: ligar da prévia %', r->'ligar'; end if;
  if r->'bem'->'categoria'->>'codigo' <> 'instalacoes' or (r->'bem'->>'vida_util_meses')::int <> 240 then raise exception 'T1: ficha da prévia %', r->'bem'; end if;
  if (select count(*) from public.patrimonio_bens where cliente_id = c_cli) <> v_bens then raise exception 'T1: a prévia deixou bem'; end if;
  if exists (select 1 from public.patrimonio_bem_lancamentos where lancamento_id = current_setting('teste.a')::uuid) then raise exception 'T1: a prévia deixou vínculo'; end if;
  v_cod_previa := r->>'codigo';

  -- T6 recusa da salvar (sem descrição), na prévia e na gravação
  begin
    perform public.fn_patrimonio_bem_criar_e_ligar(b - 'descricao', ia, false, true);
    raise exception 'T6: a prévia sem descrição passou';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate; v_msg := sqlerrm;
    if v_state <> 'P0001' or v_msg <> 'Informe a descrição do bem.' then raise exception 'T6 prévia: % %', v_state, v_msg; end if;
  end;
  begin
    perform public.fn_patrimonio_bem_criar_e_ligar(b - 'descricao', ia, false, false);
    raise exception 'T6: a gravação sem descrição passou';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'Informe a descrição do bem.' then raise exception 'T6 gravação: %', v_msg; end if;
  end;

  -- T4 prévia com RH
  r := public.fn_patrimonio_bem_criar_e_ligar(b, irh, false, true);
  if (r->>'ok')::boolean or (r->'ligar'->>'n_recusas')::int <> 1
     or r->'ligar'->'itens'->0->>'motivo' <> 'Só lançamento de Investimento (fora RH) se liga a bem.' then raise exception 'T4: %', r; end if;
  if (select count(*) from public.patrimonio_bens where cliente_id = c_cli) <> v_bens then raise exception 'T4: a prévia deixou bem'; end if;

  -- T3 a recusa do ligar na gravação desfaz tudo (o bloco faz o papel da chamada da tela: o erro desfaz a transação dela)
  begin
    perform public.fn_patrimonio_bem_criar_e_ligar(b, irh, false, false);
    raise exception 'T3: gravou com RH';
  exception when others then
    v_msg := sqlerrm;
    if v_msg <> 'Só lançamento de Investimento (fora RH) se liga a bem.' then raise exception 'T3: frase %', v_msg; end if;
  end;
  if (select count(*) from public.patrimonio_bens where cliente_id = c_cli) <> v_bens then raise exception 'T3: sobrou bem sem lançamento'; end if;

  -- T5 com id
  begin
    perform public.fn_patrimonio_bem_criar_e_ligar(b || jsonb_build_object('id', gen_random_uuid()), ia, false, true);
    raise exception 'T5: aceitou id';
  exception when others then
    if sqlerrm <> 'Aqui só se cria um bem novo: para um bem que já existe, use "Ligar a um bem".' then raise exception 'T5: %', sqlerrm; end if;
  end;

  -- T2 gravar
  r := public.fn_patrimonio_bem_criar_e_ligar(b, ia, false, false);
  v_id := (r->>'id')::uuid;
  if not (r->>'ok')::boolean or v_id is null or (r->>'n_ligados')::int is distinct from 1
     or (r->>'soma_aquisicao')::numeric is distinct from 3480 then raise exception 'T2: %', r; end if;
  if r->>'codigo' <> v_cod_previa then raise exception 'T2: código % ≠ o da prévia %', r->>'codigo', v_cod_previa; end if;
  if (r->>'versao')::int <> 2 or (select versao from public.patrimonio_bens where id = v_id) <> 2 then raise exception 'T2: versão %', r->>'versao'; end if;
  if (select count(*) from public.patrimonio_bem_lancamentos where bem_id = v_id and desligado_em is null and lancamento_id = current_setting('teste.a')::uuid) <> 1 then
    raise exception 'T2: o vínculo não nasceu';
  end if;
  if (select row_to_json(l)::text from public.financeiro_lancamentos_v2 l where l.id = current_setting('teste.a')::uuid) <> current_setting('teste.lanc_antes') then
    raise exception 'T2: o lançamento mudou';
  end if;

  -- T7 controle: sem cliente = 42501
  begin
    perform public.fn_patrimonio_bem_criar_e_ligar(b - 'cliente_id', ia, false, true);
    raise exception 'T7: sem cliente passou';
  exception when insufficient_privilege then null;
  end;
end $t$;
reset role;

-- T7 o usuário de FORA ------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $t7$
declare v_state text;
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'T7: o usuário a91962cd tem acesso ao Teste — o teste não prova nada';
  end if;
  begin
    perform public.fn_patrimonio_bem_criar_e_ligar(current_setting('teste.bem')::jsonb,
      jsonb_build_array(jsonb_build_object('lancamento_id', current_setting('teste.a'))), false, true);
    raise exception 'T7: ATENDEU o usuário de fora';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then raise exception 'T7: recusou com % (%), não 42501', v_state, sqlerrm; end if;
  end;
end $t7$;
reset role;

do $fim$ begin raise exception 'OK patr_bem_criar_e_ligar (T1–T8: prévia sem rastro, nasce ligado, recusa desfaz tudo, só cria, guarda 42501, ACL)'; end $fim$;
rollback;
