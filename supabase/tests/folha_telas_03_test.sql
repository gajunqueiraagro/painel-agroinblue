-- FOLHA-TELAS-03 (118740) — o Confirmar da Folha do mês e a lista de Férias com as provisões. Roda como postgres DEPOIS da migration;
-- termina em RAISE 'OK…' (nada fica no banco). Fixture SINTÉTICA no cliente Teste (43f32d07): nomes e valores INVENTADOS. Usuário = um admin
-- real (claims da transação); L = membro de outro cliente. "Hoje" fixo em 25/11/2026 (p_hoje) para as contas não dependerem do dia.
-- T0 folha vazia recusa · T1 sem acesso 42501, tipo inválido 22023, antes do recibo "ainda não bate" e nada gravado · T2 com os recibos que
-- conferem: a prévia não grava; confirmar grava folha_folhas 'confirmada' + trilha; o fn_folha_mes diz 'confirmada' · T3 confirmar 2 vezes
-- recusa; reabrir e confirmar de novo (o caminho do UPDATE), uma linha só · T4 férias: escala vencida, pela admissão a tirar e vencendo em 90
-- dias, ganhando, sem admissão; provisões de férias e de 13º (menos o 13º pago) por pessoa e no total · T5 férias sem acesso 42501.
-- Mutações (voltam conferidas por md5): MF1 o confirmar sem a conferência das linhas → T1 · MF2 o avo sem a fração de 15 dias → T4.
do $t$
declare
  T constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; H constant date := '2026-11-25'; ADM uuid; L uuid; mold public.financeiro_lancamentos_v2; pc_sal uuid;
  fa uuid; fb uuid; fun_a uuid; fun_b uuid; fun_c uuid; fun_d uuid; fun_e uuid; fun_f uuid; fo uuid;
  r jsonb; m jsonb; v jsonb; x jsonb; ok boolean; doc jsonb; itens jsonb; K_DOC constant text := repeat('e', 32);
  linha_de constant text := 'select e from jsonb_array_elements($1->''linhas'') e where e->>''funcionario_id'' = $2::text';
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m2.user_id into L from cliente_membros m2 where m2.ativo and m2.perfil is distinct from 'admin_agroinblue' and m2.cliente_id is distinct from T
     and not exists (select 1 from cliente_membros a where a.user_id = m2.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m2.user_id limit 1;
  select * into mold from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) and tipo_operacao = '2-Saídas'
     and conta_bancaria_id is not null and plano_conta_id is not null order by data_competencia desc limit 1;
  select id into pc_sal from financeiro_plano_contas where cliente_id is null and subcentro ilike 'Salários e Encargos%' order by id limit 1;
  if ADM is null or L is null or mold.id is null or pc_sal is null then raise exception 'sem fixture'; end if;
  if exists (select 1 from folha_funcionarios where cliente_id = T) then raise exception 'sem fixture: o cliente Teste já tem funcionários'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- T0 ninguém na folha
  ok := false; begin perform fn_folha_mes_confirmar(T, '2026-10', 'mensal', true); exception when sqlstate 'P0001' then ok := position('vazia' in sqlerrm) > 0; end;
  if not ok then raise exception 'T0 (vazia não recusou)'; end if;

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Anacleto Ferias Teste', true) returning id into fa;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Bonifacio Ferias Teste', true) returning id into fb;
  fun_a := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Anacleto Ferias Teste', 'favorecido_id', fa, 'admissao', '2024-03-10'), false)->>'id')::uuid;
  fun_b := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Bonifacio Ferias Teste', 'favorecido_id', fb, 'admissao', '2025-09-01'), false)->>'id')::uuid;
  perform fn_folha_salario_gravar(fun_a, '2024-03-10', 3000, 100, null, false);
  perform fn_folha_salario_gravar(fun_b, '2025-09-01', 2000, 100, null, false);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, cenario, origem_lancamento, funcionario_id)
  select T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, x2.f, 'Salário Teste 10/2026', x2.v, mold.sinal, mold.tipo_operacao, 'previsto', '2026-10-01', '2026-11-05', 'realizado', 'manual', x2.fu
    from (values (fa, 3000.00, fun_a), (fb, 2000.00, fun_b)) x2(f, v, fu);

  -- T1 sem acesso; tipo inválido; antes do recibo não bate (e nada se grava)
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_mes_confirmar(T, '2026-10', 'mensal', true); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T1a (sem acesso confirmou)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_mes_confirmar(T, '2026-10', 'ferias', true); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T1b (tipo inválido)'; end if;
  ok := false; begin perform fn_folha_mes_confirmar(T, '2026-10', 'mensal', false); exception when sqlstate 'P0001' then ok := position('ainda não bate (2 de 2' in sqlerrm) > 0 and position('2 sem recibo' in sqlerrm) > 0; end;
  if not ok or exists (select 1 from folha_folhas where cliente_id = T) then raise exception 'T1c (confirmou sem recibo)'; end if;

  -- os recibos do contador conferem (A 3.000, B 2.000)
  doc := jsonb_build_object('md5', K_DOC, 'nome', 'Holerites Ferias Teste.pdf', 'tipo', 'mensal', 'competencia', '2026-10', 'total', 5000.00, 'empregador', 'Empregador Teste');
  itens := jsonb_build_array(
    jsonb_build_object('nome', 'Anacleto Ferias Teste', 'paginas', '[1]'::jsonb, 'valor', 3000.00, 'arquivo', jsonb_build_object('nome', 'p1.pdf', 'tamanho', 10)),
    jsonb_build_object('nome', 'Bonifacio Ferias Teste', 'paginas', '[2]'::jsonb, 'valor', 2000.00, 'arquivo', jsonb_build_object('nome', 'p2.pdf', 'tamanho', 10)));
  perform fn_folha_recibos_aplicar(T, null, doc, itens, false);

  -- T2 a prévia não grava; confirmar grava + trilha; o fn_folha_mes diz 'confirmada'
  m := fn_folha_mes(T, '2026-10', 'mensal');
  if (select count(*) from jsonb_array_elements(m->'linhas') e where e->>'situacao_folha' = 'confere') <> 2 or jsonb_typeof(m->'folha') <> 'null' then raise exception 'T2a %', m; end if;
  r := fn_folha_mes_confirmar(T, '2026-10', 'mensal', true);
  if r->>'pessoas' is distinct from '2' or (r->>'simulado')::boolean is not true or exists (select 1 from folha_folhas where cliente_id = T) then raise exception 'T2b %', r; end if;
  r := fn_folha_mes_confirmar(T, '2026-10', 'mensal', false);
  fo := (r->>'folha_id')::uuid;
  if not exists (select 1 from folha_folhas where id = fo and cliente_id = T and competencia = '2026-10' and tipo = 'mensal' and situacao = 'confirmada' and confirmada_em is not null and confirmada_por = ADM)
     or (select count(*) from folha_trilha where registro_id = fo and acao = 'confirmar') <> 1 then raise exception 'T2c %', r; end if;
  m := fn_folha_mes(T, '2026-10', 'mensal');
  if m->'folha'->>'situacao' is distinct from 'confirmada' or m->'folha'->>'id' is distinct from fo::text then raise exception 'T2d %', m->'folha'; end if;

  -- T3 confirmar de novo recusa; reabrir e confirmar outra vez (UPDATE), uma linha só
  ok := false; begin perform fn_folha_mes_confirmar(T, '2026-10', 'mensal', true); exception when sqlstate 'P0001' then ok := position('já está confirmada' in sqlerrm) > 0; end;
  if not ok then raise exception 'T3a (confirmou 2 vezes)'; end if;
  perform fn_folha_reabrir(fo, 'teste: reabrir', false);
  r := fn_folha_mes_confirmar(T, '2026-10', 'mensal', false);
  if r->>'folha_id' is distinct from fo::text or (select count(*) from folha_folhas where cliente_id = T and competencia = '2026-10' and tipo = 'mensal' and cancelado_em is null) <> 1
     or (select situacao from folha_folhas where id = fo) is distinct from 'confirmada' then raise exception 'T3b %', r; end if;

  -- T4 férias e provisões (hoje = 25/11/2026)
  fun_c := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Clotilde Ferias Teste', 'admissao', '2026-11-20'), false)->>'id')::uuid;
  fun_d := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Doroteu Ferias Teste', 'admissao', '2022-01-01'), false)->>'id')::uuid;
  fun_e := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Eulalia Ferias Teste'), false)->>'id')::uuid;
  fun_f := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Fortunato Ferias Teste', 'admissao', '2024-12-20'), false)->>'id')::uuid;
  perform fn_folha_salario_gravar(fun_d, '2022-01-01', 1000, 100, null, false);
  perform fn_folha_salario_gravar(fun_f, '2024-12-20', 1200, 100, null, false);
  perform fn_folha_ferias_gravar(fun_d, jsonb_build_array(jsonb_build_object('aquisitivo_inicio', '2023-01-01', 'aquisitivo_fim', '2023-12-31',
          'ultimo_prazo', '2024-11-30', 'dias_pagos', 0, 'saldo_dias', 30)), null, false);
  -- o 13º já pago de A (1ª parcela, realizada, ligada) sai da provisão
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, data_pagamento, cenario, origem_lancamento, funcionario_id)
  values (T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, fa, '13º Salário 1ª Parcela 2026', 1500.00, mold.sinal, mold.tipo_operacao, 'realizado',
          '2026-11-01', '2026-11-20', '2026-11-20', 'realizado', 'manual', fun_a);
  v := fn_folha_ferias_lista(T, H);
  execute linha_de into x using v, fun_a;
  if x->>'origem' is distinct from 'admissao' or x->>'aquisitivo_inicio' is distinct from '2025-03-10' or x->>'aquisitivo_fim' is distinct from '2026-03-09'
     or x->>'tirar_ate' is distinct from '2027-03-09' or x->>'situacao_ferias' is distinct from 'a_tirar' or x->>'tirou' is not null or x->>'avos_em_curso' is distinct from '9'
     or (x->>'provisao_ferias')::numeric is distinct from 7000.00 or (x->>'provisao_13')::numeric is distinct from 1250.00 then raise exception 'T4a %', x; end if;
  execute linha_de into x using v, fun_b;
  if x->>'tirar_ate' is distinct from '2027-08-31' or x->>'avos_em_curso' is distinct from '3' or (x->>'provisao_ferias')::numeric is distinct from 3333.33
     or (x->>'provisao_13')::numeric is distinct from 1833.33 then raise exception 'T4b %', x; end if;
  execute linha_de into x using v, fun_c;
  if x->>'situacao_ferias' is distinct from 'ganhando' or x->>'tirar_ate' is not null or x->>'provisao_ferias' is not null then raise exception 'T4c %', x; end if;
  execute linha_de into x using v, fun_d;
  if x->>'origem' is distinct from 'escala' or x->>'situacao_ferias' is distinct from 'vencida' or x->>'tirar_ate' is distinct from '2024-11-30' or (x->>'saldo')::numeric is distinct from 30
     or (x->>'provisao_ferias')::numeric is distinct from 2555.56 or (x->>'provisao_13')::numeric is distinct from 916.67 then raise exception 'T4d %', x; end if;
  execute linha_de into x using v, fun_e;
  if x->>'situacao_ferias' is distinct from 'sem_admissao' or x->>'origem' is not null or x->>'provisao_13' is not null then raise exception 'T4e %', x; end if;
  execute linha_de into x using v, fun_f;
  if x->>'situacao_ferias' is distinct from 'vence' or (x->>'dias')::int is distinct from 24 or (x->>'provisao_ferias')::numeric is distinct from 3066.67 then raise exception 'T4f %', x; end if;
  if v->'linhas'->0->>'funcionario_id' is distinct from fun_d::text or v->'linhas'->1->>'funcionario_id' is distinct from fun_f::text then raise exception 'T4g (ordem) %', v->'linhas'; end if;
  if v->'totais' is distinct from jsonb_build_object('pessoas', 6, 'vencidas', 1, 'vence_90', 1, 'pela_admissao', 4, 'pela_escala', 1, 'sem_admissao', 1, 'sem_salario', 2,
       'provisao_ferias', 15955.56, 'provisao_13', 5100.00) then raise exception 'T4h %', v->'totais'; end if;

  -- T5 férias sem acesso
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_ferias_lista(T, H); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T5 (sem acesso leu as férias)'; end if;

  raise exception 'OK FOLHA-TELAS-03';
end $t$;
