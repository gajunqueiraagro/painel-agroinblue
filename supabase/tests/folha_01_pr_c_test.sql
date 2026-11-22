-- FOLHA-01 · teste do PR C (118430): Folha do mês, recibo mensal/13º em folha_documentos, férias. Roda como postgres; termina em
-- RAISE 'OK…'; nada fica no banco. Fixture no cliente Teste (43f32d07) com nomes e valores INVENTADOS. Usuário = um admin real (claims
-- da transação); L = membro de outro cliente.
do $t$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; L uuid; mold public.financeiro_lancamentos_v2; pc_sal uuid;
  fa uuid; fb uuid; fc uuid; fd uuid; fun_a uuid; fun_b uuid; fun_c uuid; fun_d uuid; la uuid; lb uuid; lc uuid; ld uuid; l13 uuid; per uuid;
  r jsonb; m jsonb; x jsonb; ok boolean; doc jsonb; itens jsonb; K_DOC constant text := repeat('c', 32);
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m2.user_id into L from cliente_membros m2 where m2.ativo and m2.perfil is distinct from 'admin_agroinblue' and m2.cliente_id is distinct from T
     and not exists (select 1 from cliente_membros a where a.user_id = m2.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m2.user_id limit 1;
  select * into mold from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) and tipo_operacao = '2-Saídas'
     and conta_bancaria_id is not null and plano_conta_id is not null order by data_competencia desc limit 1;
  select id into pc_sal from financeiro_plano_contas where cliente_id is null and subcentro ilike 'Salários e Encargos%' order by id limit 1;
  if ADM is null or L is null or mold.id is null or pc_sal is null then raise exception 'sem fixture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Anacleto Teste Bento', true) returning id into fa;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Bonifacio Teste Lima', true) returning id into fb;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Clotilde Teste Ramos', true) returning id into fc;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Doroteu Teste Prado', true) returning id into fd;
  fun_a := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Anacleto Teste Bento', 'favorecido_id', fa), false)->>'id')::uuid;
  fun_b := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Bonifacio Teste Lima', 'favorecido_id', fb), false)->>'id')::uuid;
  fun_c := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Clotilde Teste Ramos', 'favorecido_id', fc), false)->>'id')::uuid;
  fun_d := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Doroteu Teste Prado', 'favorecido_id', fd), false)->>'id')::uuid;
  -- salários de 10/2026 (A, B e D ligados; C sem ligação) e um 13º de A na mesma competência (não entra no mensal)
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, cenario, origem_lancamento, funcionario_id)
  select T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, x2.f, x2.d, x2.v, mold.sinal, mold.tipo_operacao, 'previsto', '2026-10-01', '2026-11-05', 'realizado', 'manual', x2.fu
    from (values (fa, 'Salário Teste 10/2026', 3000.00, fun_a), (fb, 'Salário Teste 10/2026', 2000.00, fun_b), (fc, 'Salário Teste 10/2026', 1500.00, null::uuid),
                 (fd, 'Salário Teste 10/2026', 1000.00, fun_d), (fa, '13º Salário 1ª Parcela 2026', 1500.00, fun_a)) x2(f, d, v, fu);
  select id into la from financeiro_lancamentos_v2 where favorecido_id = fa and descricao like 'Salário%';
  select id into lb from financeiro_lancamentos_v2 where favorecido_id = fb;
  select id into lc from financeiro_lancamentos_v2 where favorecido_id = fc;
  select id into ld from financeiro_lancamentos_v2 where favorecido_id = fd;
  select id into l13 from financeiro_lancamentos_v2 where favorecido_id = fa and descricao like '13º%';

  -- C1 regras puras: o tipo (a mesma regra do Histórico) e os dias úteis
  if _fn_folha_tipo('13º Salário 1ª Parcela', 'Salários e Encargos') is distinct from '13º' or _fn_folha_tipo('Acerto', 'Rescisões e Acertos') is distinct from 'Rescisão'
     or _fn_folha_tipo('Multa 40%', 'Rescisões e Acertos') is distinct from 'Multa rescisória' or _fn_folha_tipo('Salário', null) is distinct from 'Salário'
     or _fn_folha_tipo('Férias', 'Salários e Encargos') is distinct from 'Férias' or _fn_folha_tipo('Vale', 'Benefícios e Premiações') is distinct from 'Benefício'
     or _fn_folha_tipo('Diária', 'Outra conta') is distinct from 'Outro' then raise exception 'C1a (tipo)'; end if;
  if _fn_folha_quinto_dia_util('2026-11-15') is distinct from '2026-11-06' or _fn_folha_dia_util_ate('2026-11-21', false) is distinct from '2026-11-20'
     or _fn_folha_dia_util_ate('2026-11-22', true) is distinct from '2026-11-21' then raise exception 'C1b (dia útil)'; end if;

  -- C2 sem acesso recusa; pedido inválido recusa
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_mes(T, '2026-10', 'mensal'); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'C2a (sem acesso leu)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_mes(T, '2026-10', 'ferias'); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'C2b (tipo inválido)'; end if;

  -- C3 Folha do mês antes do recibo: previsto = o lançamento; sem recibo; C entra pelo favorecido ("ligar"); calendário e faixa fixos
  m := fn_folha_mes(T, '2026-10', 'mensal');
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or (x->>'previsto')::numeric is distinct from 3000 or x->>'recibo' is not null or x->>'situacao_folha' is distinct from 'sem_recibo' or jsonb_array_length(x->'lancamentos') is distinct from 1
     or not coalesce((x->'falta') ? 'recibo', false) or not coalesce((x->'falta') ? 'pagamento', false) or x->>'lancamento_status' is distinct from 'previsto' then raise exception 'C3a %', x; end if;
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_c::text;
  if x is null or (x->>'previsto')::numeric is distinct from 1500 or not coalesce((x->'falta') ? 'ligar', false) or coalesce(position('ligar o lançamento' in x->>'falta_frase'), 0) = 0 then raise exception 'C3b %', x; end if;
  if jsonb_array_length(m->'calendario') is distinct from 5 or m->'calendario'->0->>'data' is distinct from '2026-11-06' or m->'calendario'->1->>'data' is distinct from '2026-11-20'
     or m->'calendario'->2->>'origem' is distinct from 'regra' or m->'calendario'->3->>'data' is not null or m->'calendario'->4->>'data' is not null
     or (m->'documentos'->'recibos'->>'chegou')::boolean is not false or (m->'documentos'->'guia_fgts'->>'chegou')::boolean is not false
     or not (m->'documentos' ? 'espelho') then raise exception 'C3c %', m->'calendario'; end if;

  -- C4 prévia do holerite: A e B pelo funcionário, C pelo favorecido (o funcionário dela não tem lançamento ligado), o novato pendente,
  --    D sem recibo; nada gravado
  doc := jsonb_build_object('md5', K_DOC, 'nome', 'Holerites Teste.pdf', 'tipo', 'mensal', 'competencia', '2026-10', 'total', 6700.00, 'empregador', 'Empregador Teste');
  itens := jsonb_build_array(
    jsonb_build_object('nome', 'BENTO ANACLETO TESTE', 'paginas', '[1]'::jsonb, 'valor', 3100.50, 'arquivo', jsonb_build_object('nome', 'p1.pdf', 'tamanho', 10)),
    jsonb_build_object('nome', 'Bonifacio Teste Lima', 'paginas', '[2]'::jsonb, 'valor', 2000.00, 'arquivo', jsonb_build_object('nome', 'p2.pdf', 'tamanho', 10)),
    jsonb_build_object('nome', 'Clotilde Teste Ramos', 'paginas', '[3]'::jsonb, 'valor', 1500.00, 'arquivo', jsonb_build_object('nome', 'p3.pdf', 'tamanho', 10)),
    jsonb_build_object('nome', 'Novato Inventado Teste', 'paginas', '[4]'::jsonb, 'valor', 99.50, 'arquivo', jsonb_build_object('nome', 'p4.pdf', 'tamanho', 10)));
  r := fn_folha_recibos_aplicar(T, null, doc, itens, true);
  if jsonb_array_length(r->'automaticos') is distinct from 3 or jsonb_array_length(r->'pendencias') is distinct from 1 or jsonb_array_length(r->'sem_recibo') is distinct from 1
     or r->'sem_recibo'->0->>'lancamento_id' is distinct from ld::text then raise exception 'C4a %', r; end if;
  if (select string_agg(e->>'casou_por' || ':' || (e->>'funcionario_id'), ',' order by e->>'nome') from jsonb_array_elements(r->'automaticos') e)
     is distinct from 'funcionario:' || fun_a || ',funcionario:' || fun_b || ',favorecido:' || fun_c then raise exception 'C4b %', r->'automaticos'; end if;
  if exists (select 1 from folha_documentos where cliente_id = T) or (select valor from financeiro_lancamentos_v2 where id = la) is distinct from 3000 then raise exception 'C4c (a prévia gravou)'; end if;

  -- C5 aplicar: o valor do recibo; UM registro por pessoa em folha_documentos (holerite, funcionário + lançamento, caminho <cliente>/<md5>-p<pág>);
  --    nada em financeiro_lancamento_documentos; a trilha guarda o antes e o recibo
  r := fn_folha_recibos_aplicar(T, null, doc, itens, false);
  if (select valor from financeiro_lancamentos_v2 where id = la) is distinct from 3100.50 or (select status_transacao from financeiro_lancamentos_v2 where id = la) is distinct from 'previsto' then raise exception 'C5a %', r; end if;
  if (select count(*) from folha_documentos where cliente_id = T and cancelado_em is null and especie = 'holerite') is distinct from 3 or jsonb_array_length(r->'documentos') is distinct from 3
     or not exists (select 1 from folha_documentos where funcionario_id = fun_a and lancamento_id = la and storage_path = T || '/' || K_DOC || '-p1.pdf')
     or not exists (select 1 from folha_documentos where funcionario_id = fun_c and lancamento_id = lc) then raise exception 'C5b %', r->'documentos'; end if;
  if exists (select 1 from financeiro_lancamento_documentos where cliente_id = T and observacao like 'folha-recibo:' || K_DOC || '%') then raise exception 'C5c (2ª fonte)'; end if;
  if (select (t.antes->>'valor')::numeric from folha_trilha t join folha_documentos d on d.id = t.registro_id
       where d.lancamento_id = la and t.acao = 'registrar' and t.via = 'folha-recibo:' || K_DOC) is distinct from 3000 then raise exception 'C5d (trilha sem o antes)'; end if;

  -- C6 Folha do mês depois: A diferença +100,50; B e C conferem; D sem recibo; a faixa diz 3 recibos de 1 documento
  m := fn_folha_mes(T, '2026-10', 'mensal');
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or (x->>'previsto')::numeric is distinct from 3000 or (x->>'recibo')::numeric is distinct from 3100.50 or (x->>'diferenca')::numeric is distinct from 100.50 or x->>'situacao_folha' is distinct from 'diferenca'
     or jsonb_array_length(x->'recibos') is distinct from 1 or coalesce((x->'falta') ? 'recibo', true) then raise exception 'C6a %', x; end if;
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_b::text;
  if x is null or x->>'situacao_folha' is distinct from 'confere' or (x->>'diferenca')::numeric is distinct from 0 then raise exception 'C6b %', x; end if;
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_d::text;
  if x is null or x->>'situacao_folha' is distinct from 'sem_recibo' then raise exception 'C6c %', x; end if;
  if (m->'documentos'->'recibos'->>'chegou')::boolean is not true or (m->'documentos'->'recibos'->>'n')::int is distinct from 3
     or jsonb_array_length(m->'documentos'->'recibos'->'origens') is distinct from 1 then raise exception 'C6d %', m->'documentos'; end if;

  -- C7 pendência: o holerite que falta (D), na lista de pendências
  r := fn_folha_pendencias(T);
  if not exists (select 1 from jsonb_array_elements(r->'itens') e where e->>'tipo' = 'sem_recibo' and e->>'lancamento_id' = ld::text)
     or exists (select 1 from jsonb_array_elements(r->'itens') e where e->>'tipo' = 'sem_recibo' and e->>'lancamento_id' = la::text) then raise exception 'C7 %', r; end if;

  -- C8 o mesmo documento de novo recusa
  ok := false; begin perform fn_folha_recibos_aplicar(T, null, doc, itens, false); exception when sqlstate 'P0001' then ok := position('já foi aplicado' in sqlerrm) > 0; end;
  if not ok then raise exception 'C8 (aplicou 2×)'; end if;

  -- C9 o 13º também casa pelo funcionário; SEM arquivo, aplicado uma vez só (a trilha do lançamento barra a 2ª)
  doc := jsonb_build_object('md5', repeat('d', 32), 'nome', '13 Teste.pdf', 'tipo', '13_1', 'competencia', '2026-10', 'total', 1600.00);
  itens := jsonb_build_array(jsonb_build_object('nome', 'Anacleto Teste Bento', 'paginas', '[1]'::jsonb, 'valor', 1600.00));
  r := fn_folha_recibos_aplicar(T, null, doc, itens, true);
  if jsonb_array_length(r->'automaticos') is distinct from 1 or r->'automaticos'->0->>'lancamento_id' is distinct from l13::text or r->'automaticos'->0->>'casou_por' is distinct from 'funcionario' then raise exception 'C9a %', r; end if;
  perform fn_folha_recibos_aplicar(T, null, doc, itens, false);
  if (select valor from financeiro_lancamentos_v2 where id = l13) is distinct from 1600 then raise exception 'C9b'; end if;
  ok := false; begin perform fn_folha_recibos_aplicar(T, null, doc, itens, false); exception when sqlstate 'P0001' then ok := position('já foi aplicado' in sqlerrm) > 0; end;
  if not ok then raise exception 'C9c (sem arquivo aplicou 2×)'; end if;

  -- C10 desfazer: a prévia não muda; volta o valor, cancela os 3 registros (nunca apaga) com trilha; a Folha do mês volta a "sem recibo"
  r := fn_folha_recibos_desfazer(T, K_DOC, 'teste', true);
  if (r->>'valores')::int is distinct from 1 or (r->>'documentos')::int is distinct from 3 or (select valor from financeiro_lancamentos_v2 where id = la) is distinct from 3100.50 then raise exception 'C10a %', r; end if;
  perform fn_folha_recibos_desfazer(T, K_DOC, 'teste', false);
  if (select valor from financeiro_lancamentos_v2 where id = la) is distinct from 3000 or exists (select 1 from folha_documentos where cliente_id = T and cancelado_em is null)
     or (select count(*) from folha_documentos where cliente_id = T) is distinct from 3
     or (select count(*) from folha_trilha where via = 'folha-recibo:' || K_DOC || ':desfazer' and acao = 'cancelar') is distinct from 3 then raise exception 'C10b'; end if;
  select e into x from jsonb_array_elements(fn_folha_mes(T, '2026-10', 'mensal')->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or x->>'situacao_folha' is distinct from 'sem_recibo' or (x->>'previsto')::numeric is distinct from 3000 then raise exception 'C10c %', x; end if;

  -- C11 férias: sem escala = vazio ("—"); com o período lido, na ficha, na Folha do mês, no calendário e na pendência (descartável)
  if jsonb_array_length(fn_folha_funcionario_ficha(fun_a)->'ferias') is distinct from 0 then raise exception 'C11a'; end if;
  insert into folha_ferias_periodos (cliente_id, funcionario_id, aquisitivo_inicio, aquisitivo_fim, vencimento, ultimo_prazo, saldo_dias)
  values (T, fun_a, '2025-01-01', '2025-12-31', '2025-12-31', current_date + 30, 30) returning id into per;
  if jsonb_array_length(fn_folha_funcionario_ficha(fun_a)->'ferias') is distinct from 1 or jsonb_array_length(fn_folha_funcionario_ficha(fun_b)->'ferias') is distinct from 0 then raise exception 'C11b'; end if;
  m := fn_folha_mes(T, '2026-10', 'mensal');
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or (x->'ferias'->>'saldo_dias')::numeric is distinct from 30 or m->'calendario'->4->>'data' is distinct from (current_date + 30)::text then raise exception 'C11c %', m->'calendario'->4; end if;
  if not exists (select 1 from jsonb_array_elements(fn_folha_pendencias(T)->'itens') e where e->>'tipo' = 'ferias_vence' and e->>'chave' = 'ferias:' || per) then raise exception 'C11d'; end if;
  perform fn_folha_pendencia_descartar(T, 'ferias:' || per, 'já marcadas', false);
  if exists (select 1 from jsonb_array_elements(fn_folha_pendencias(T)->'itens') e where e->>'chave' = 'ferias:' || per) then raise exception 'C11e (descarte não tirou)'; end if;

  -- C12 o Histórico lê o tipo da regra única
  r := fn_folha_historico(fun_a, null, null);
  if (r->'por_tipo'->>'Salário')::int is distinct from 1 or (r->'por_tipo'->>'13º')::int is distinct from 1 then raise exception 'C12 %', r->'por_tipo'; end if;

  -- C13 fechadas: anon não lê a Folha do mês; as auxiliares não abrem para authenticated
  if has_function_privilege('anon', 'public.fn_folha_mes(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_tipo(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_quinto_dia_util(date)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_dia_util_ate(date,boolean)', 'execute') then raise exception 'C13'; end if;
  raise exception 'OK FOLHA-01 PR C: C1–C13 (nada gravado)';
end $t$;
