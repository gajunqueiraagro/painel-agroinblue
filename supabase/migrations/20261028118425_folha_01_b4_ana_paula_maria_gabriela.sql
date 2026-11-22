-- FOLHA-01 · B4 — complemento do cadastro (Gabriel 18/11/2026 17:04, reafirmado 20/11): Ana Paula Cavalli de Oliveira e Maria Gabriela
-- Cavalli (Santa Rita) SÃO FUNCIONÁRIAS ATIVAS, vínculo "a confirmar pelo holerite" (o 1º holerite do contador confirma CLT e preenche o salário).
-- O QUE FAZ, como a 118390 (mesmas funções, autor = Gabriel, via 'FOLHA-01-B4'):
--   funcionário ativo com o favorecido de cada uma; recorrência de origem = a de salário; vínculo 'clt' PROVISÓRIO (o banco não tem
--   "a confirmar"), com 'vinculo' no "a atualizar" (+ salário, admissão, cargo, cpf) e a observação "vínculo a confirmar pelo holerite";
--   atuação 100% na fazenda × atividade da recorrência, desde o início dela (01/07/2026);
--   liga os lançamentos de folha vivos delas pela regra da 118410 (contas Salários e Encargos / Rescisões e Acertos / Benefícios e Premiações /
--   centro Mão de Obra; pelo favorecido), via `fn_lancamento_funcionario_ligar` (trilha audit_log 'folha-vinculo'). Só `funcionario_id`.
-- RECUSA (nada grava) se: alguma já está no cadastro; o favorecido não é um só; a contagem de lançamentos não é a do ensaio; a chegada não confere.
-- DESFAZER (nesta ordem):
--   select fn_lancamento_funcionario_ligar(array_agg(id), null, 'desfaz 118425', false) from financeiro_lancamentos_v2
--    where funcionario_id in (select registro_id from folha_trilha where via = 'FOLHA-01-B4' and tabela = 'folha_funcionarios');  -- como Gabriel
--   delete from folha_funcionario_atuacao where funcionario_id in (select registro_id from folha_trilha where via = 'FOLHA-01-B4' and tabela = 'folha_funcionarios');
--   delete from folha_funcionarios where id in (select registro_id from folha_trilha where via = 'FOLHA-01-B4' and tabela = 'folha_funcionarios');

set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
select set_config('app.via', 'FOLHA-01-B4', true);

do $b4$
declare
  c_sr constant uuid := (select id from public.clientes where nome = 'Santa Rita Agro');
  r record; v_id uuid; v_ids uuid[]; v_total int := 0; v_antes int; v_esperado int;
begin
  select count(*) into v_antes from public.folha_funcionarios;
  if exists (select 1 from public.folha_funcionarios where cliente_id = c_sr and nome in ('Ana Paula Cavalli de Oliveira', 'Maria Gabriela Cavalli')) then
    raise exception 'B4: já está no cadastro. Nada foi gravado.';
  end if;

  create temp table _b4 on commit drop as
  select f.id favorecido_id, f.nome, rc.id rec_id, rc.fazenda_id, date_trunc('month', coalesce(rc.data_inicio, rc.created_at::date))::date desde,
         case when rc.subcentro ilike '%Agricultura%' then 'agricultura' when rc.subcentro ilike '%Administrativo%' then 'administrativo' else 'pecuaria' end atividade
    from public.financeiro_fornecedores f
    join public.financeiro_recorrencias rc on rc.favorecido_id = f.id and rc.cliente_id = c_sr and rc.folha and rc.subcentro ilike 'Salários e Encargos%'
   where f.cliente_id = c_sr and f.ativo and f.nome in ('Ana Paula Cavalli de Oliveira', 'Maria Gabriela Cavalli');
  if (select count(*) from _b4) <> 2 or (select count(distinct nome) from _b4) <> 2 then
    raise exception 'B4: o favorecido/recorrência não é um só por pessoa (%). Nada foi gravado.', (select count(*) from _b4);
  end if;

  for r in select * from _b4 order by nome loop
    perform set_config('app.via', 'FOLHA-01-B4', true);  -- a fn_lancamento_funcionario_ligar troca a via da transação para 'folha-vinculo'
    v_id := (public.fn_folha_funcionario_gravar(c_sr, jsonb_build_object(
      'nome', r.nome,
      'favorecido_id', r.favorecido_id,
      'recorrencia_origem_id', r.rec_id,
      'vinculo', 'clt',
      'a_atualizar', jsonb_build_array('vinculo', 'salario', 'admissao', 'cargo', 'cpf'),
      'observacao', 'vínculo a confirmar pelo holerite (Gabriel 18/11/2026): o 1º holerite do contador confirma CLT e preenche o salário'
    ), false)->>'id')::uuid;
    perform public.fn_folha_atuacao_gravar(v_id, r.desde, jsonb_build_array(jsonb_build_object('fazenda_id', r.fazenda_id, 'atividade', r.atividade, 'pct', 100)), false);

    select array_agg(l.id order by l.id) into v_ids
      from public.financeiro_lancamentos_v2 l
     where l.cliente_id = c_sr and l.favorecido_id = r.favorecido_id and not coalesce(l.cancelado, false) and l.funcionario_id is null
       and l.plano_conta_id in (select id from public.financeiro_plano_contas
                                 where subcentro ilike any (array['Salários e Encargos%', 'Rescisões e Acertos%', 'Benefícios e Premiações%']) or centro_custo ilike 'Mão de Obra%');
    v_esperado := case r.nome when 'Ana Paula Cavalli de Oliveira' then 93 else 99 end;
    if coalesce(cardinality(v_ids), 0) <> v_esperado then
      raise exception 'B4: % tem % lançamentos de folha (o ensaio deu %). Nada foi gravado.', r.nome, coalesce(cardinality(v_ids), 0), v_esperado;
    end if;
    if v_ids is not null then
      perform public.fn_lancamento_funcionario_ligar(v_ids, v_id, 'B4 (118425): ligado pelo favorecido', false);
      v_total := v_total + cardinality(v_ids);
    end if;
  end loop;

  -- a contagem do ensaio (20/11): Ana Paula 93 · Maria Gabriela 99 (de 01/2020 aos previstos até 06/2027)
  if v_total <> 192 then
    raise exception 'B4: % lançamentos ligados (o ensaio deu 192). Nada foi gravado.', v_total;
  end if;

  -- chegada
  if (select count(*) from public.folha_funcionarios) <> v_antes + 2
     or (select count(*) from public.folha_funcionarios where cliente_id = c_sr and situacao = 'ativo' and 'vinculo' = any(a_atualizar)
           and nome in ('Ana Paula Cavalli de Oliveira', 'Maria Gabriela Cavalli')) <> 2
     or (select count(*) from public.folha_trilha where via = 'FOLHA-01-B4') <> 4
     or exists (select 1 from public.folha_funcionarios f where not exists (select 1 from public.folha_funcionario_atuacao a where a.funcionario_id = f.id))
     or exists (select 1 from public.financeiro_lancamentos_v2 l join public.folha_funcionarios f on f.id = l.funcionario_id where f.cliente_id <> l.cliente_id) then
    raise exception 'B4: a chegada não confere. Nada foi gravado.';
  end if;
end $b4$;
