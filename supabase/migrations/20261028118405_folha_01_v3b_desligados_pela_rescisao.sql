-- FOLHA-01 · V3b — ex-funcionários com RESCISÃO lançada entram no cadastro como DESLIGADOS (Gabriel 19/11/2026, FILA 06:14: "V3b (a) SIM,
-- prévia 118405 só de quem tem RESCISÃO lançada"). Relatório: folha-20261119-0623-FOLHA-01-V3B-V3-LOTES-118405-118410.md.
-- QUEM ENTRA (83): favorecido de lançamento vivo em "Rescisões e Acertos*" que não é funcionário (nem pelo favorecido nem pelo nome), não é
--   empresa/guia (CNPJ, banco, Receita, clínica, advogado, mercado…), tem nome de 2+ palavras; data do desligamento = o pagamento da
--   rescisão mais recente (PROVISÓRIA, como no B2; confirmar pelo TRCT).
-- FICAM FORA (pendência na tela, nada se junta): o dono e a família (Agnaldo Pereira Cedenho, Maria Cristina Malheiro Negrão Cedenho);
--   "Jose R. dos Santos" × "Jose Roberto dos Santos" (podem ser a mesma pessoa); os 14 que voltaram a receber folha depois da rescisão
--   (Fabio Marcelo Delazari, Rosana Rita R. Machado, Ademir Aparecido Peixoto, Ana C. da S. Oliveira, Felipe Pereira dos Santos, Jorge Bertolino,
--   Milton S. de Oliveira, Mirian Gracielle Santos, Rosimeire Rodrigues dos Santos Peixoto, Viviane de S. Ferreira, Eliana Farias, Gilmara Santos,
--   Heitor Oliveira Muller, Jose Carlos Guimaraes); nomes de uma palavra; "Miltinho" e "Marcelo Cassim Correa" (RRCC: Gabriel não respondeu).
--   Entram apesar de pagamento posterior (não é emprego novo): Luciana Abigail (parcela 6/6 de adiantamento), Marcos Antônio (frete de outro),
--   Caio B. da Silveira (diária).
-- O QUE GRAVA: pelas funções da 118370, autor = Gabriel, via 'FOLHA-01-V3B': nome (sem "Pec.3M-"), favorecido, CPF só se válido, vínculo clt,
--   Vera "Pec.3M-" = empregador Higino (Pec.3M); atuação 100% na fazenda × atividade da última rescisão, desde o mês do 1º lançamento de folha;
--   desligado na data da rescisão; "a atualizar": admissão, cargo, desligamento (+ cpf se vazio, + nome completo se abreviado).
-- O favorecido = o fornecedor com aquele nome que TEM a rescisão (4 nomes têm um gêmeo inativo sem lançamento: Aparicio, Danilo Pereira
--   Carreia, Dione, Marcos Antônio).
-- RECUSA (nada grava) se: o cadastro não tem os 68 de hoje; algum nome não acha UM fornecedor do cliente; a pessoa já está no cadastro;
--   a data da rescisão mudou; a chegada não confere.
-- DESFAZER (antes, desfazer a 118410, que liga lançamentos a estes funcionários):
--   delete from folha_funcionario_atuacao where funcionario_id in (select registro_id from folha_trilha where via = 'FOLHA-01-V3B' and tabela = 'folha_funcionarios');
--   delete from folha_funcionarios where id in (select registro_id from folha_trilha where via = 'FOLHA-01-V3B' and tabela = 'folha_funcionarios');

set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
select set_config('app.via', 'FOLHA-01-V3B', true);

do $v3b$
declare
  rc record; v_id uuid; v_n int;
begin
  if (select count(*) from public.folha_funcionarios) <> 68 then
    raise exception 'V3b: o cadastro não tem os 68 de hoje. Nada foi gravado.';
  end if;

  create temp table _x (cliente text, fav text, data date) on commit drop;
  insert into _x values
    ('Agnaldo Cedenho', 'Alex Sandro de Araujo Santos', '2026-05-08'),
    ('Agnaldo Cedenho', 'Cristiani Vieira Souza', '2021-01-29'),
    ('Agnaldo Cedenho', 'Fernando da Silva', '2021-09-01'),
    ('Agnaldo Cedenho', 'Luciana Cristina Liduenha do Rosário', '2020-02-28'),
    ('Agnaldo Cedenho', 'Marly Souza Coimbra dos Reis', '2022-07-29'),
    ('Agnaldo Cedenho', 'Nivaldo da Costa Moeira', '2022-01-05'),
    ('Agnaldo Cedenho', 'Paulo Eduardo de Oliveira Castro', '2021-02-18'),
    ('Agnaldo Cedenho', 'Roberto Pasini', '2021-01-29'),
    ('Agnaldo Cedenho', 'Valdenia Cristina Sanches', '2022-12-10'),
    ('NJ Pecuária', 'Adelmo G. Felipe', '2024-04-08'),
    ('NJ Pecuária', 'Adriano Cardoso Santuni', '2020-07-20'),
    ('NJ Pecuária', 'Alcides da Silva', '2023-08-17'),
    ('NJ Pecuária', 'Alexssandro Torres Vilhalva', '2020-04-17'),
    ('NJ Pecuária', 'Amarildo Oliveira Bertolino', '2020-04-17'),
    ('NJ Pecuária', 'Aparicio F. Conceição Junior', '2025-02-28'),
    ('NJ Pecuária', 'Caio B. da Silveira', '2024-03-22'),
    ('NJ Pecuária', 'Carlos Pacheco', '2026-07-06'),
    ('NJ Pecuária', 'Cesar Bezerra Alves Filho', '2026-07-13'),
    ('NJ Pecuária', 'Claudionor Luiz de Souza', '2022-02-18'),
    ('NJ Pecuária', 'Cleber H. de Araujo Silva', '2023-07-08'),
    ('NJ Pecuária', 'Daniel L. de Souza', '2025-10-03'),
    ('NJ Pecuária', 'Danilo Cardoso dos Santos', '2021-05-10'),
    ('NJ Pecuária', 'Danilo Pereira Carreia', '2023-07-07'),
    ('NJ Pecuária', 'Dario Ferreira Velezo', '2024-04-05'),
    ('NJ Pecuária', 'Denise Karoline Vieira Silva', '2026-08-07'),
    ('NJ Pecuária', 'Derli da S. Peralta', '2024-08-14'),
    ('NJ Pecuária', 'Diego de Souza Passos', '2020-11-12'),
    ('NJ Pecuária', 'Dione Aparecido Barbosa', '2025-01-22'),
    ('NJ Pecuária', 'Edson L.B. Silva', '2025-05-03'),
    ('NJ Pecuária', 'Eliana de França Marques', '2026-02-05'),
    ('NJ Pecuária', 'Everton Dias Muniz', '2021-11-06'),
    ('NJ Pecuária', 'Expedito A. da Rocha', '2024-02-09'),
    ('NJ Pecuária', 'Fabiano Martins Cayres', '2026-07-30'),
    ('NJ Pecuária', 'Fernando da Silva Santos', '2020-07-20'),
    ('NJ Pecuária', 'Fernando Jose da Silva', '2021-10-08'),
    ('NJ Pecuária', 'Fernando Santana do Vale', '2021-07-23'),
    ('NJ Pecuária', 'Flavio R. P. da Silva', '2022-10-04'),
    ('NJ Pecuária', 'Francisco Castro das Merces', '2025-12-15'),
    ('NJ Pecuária', 'Francisco Paulo da Silva', '2021-02-26'),
    ('NJ Pecuária', 'Geniel Bertolino da Silva', '2020-04-17'),
    ('NJ Pecuária', 'João Vitor R. Ledesma', '2025-01-03'),
    ('NJ Pecuária', 'José Danilo Ferreira da Silva', '2026-07-06'),
    ('NJ Pecuária', 'Jose H. P. dos Prazeres', '2025-02-03'),
    ('NJ Pecuária', 'Junior de Oliveira Silva', '2026-03-05'),
    ('NJ Pecuária', 'Luan de Maria Freitas', '2021-07-23'),
    ('NJ Pecuária', 'Luan J. Scaraboto', '2024-06-10'),
    ('NJ Pecuária', 'Lucas Kawan B. Silva', '2025-04-29'),
    ('NJ Pecuária', 'Luciana Abigail Z.A. Martins', '2026-08-24'),
    ('NJ Pecuária', 'Luiz Felipe Machado Alves', '2026-05-04'),
    ('NJ Pecuária', 'Magno Faustino Leal', '2025-09-19'),
    ('NJ Pecuária', 'Maria Gonçalves da Silva', '2025-12-12'),
    ('NJ Pecuária', 'Mario Nunes Mendes', '2022-01-10'),
    ('NJ Pecuária', 'Neudes Jose Longo', '2024-10-18'),
    ('NJ Pecuária', 'Nilton C.R. Pereira', '2025-08-29'),
    ('NJ Pecuária', 'Paulo Gigliolli', '2021-07-05'),
    ('NJ Pecuária', 'Quellen Tatiane Gonçalves', '2026-05-29'),
    ('NJ Pecuária', 'Rafael Perucci', '2025-08-20'),
    ('NJ Pecuária', 'Rafael Sidinei da Silva', '2021-09-02'),
    ('NJ Pecuária', 'Tulio R. Feitosa', '2024-03-25'),
    ('NJ Pecuária', 'Vagner Oliveira', '2026-06-15'),
    ('NJ Pecuária', 'Valdeir José Silva', '2026-02-03'),
    ('NJ Pecuária', 'Valdemir Batista', '2024-08-28'),
    ('NJ Pecuária', 'Valdineia da Silva Santos', '2021-02-25'),
    ('NJ Pecuária', 'Vanda Galiano da Silva', '2026-07-03'),
    ('NJ Pecuária', 'Wagner Cardoso de Oliveira', '2025-03-14'),
    ('NJ Pecuária', 'Wanderson J.S. Silva', '2025-11-26'),
    ('NJ Pecuária', 'Yzabelli D. Wobeto', '2025-01-23'),
    ('Santa Rita Agro', 'Alisson Costa', '2024-10-26'),
    ('Santa Rita Agro', 'Andre Luiz Marques', '2021-01-25'),
    ('Santa Rita Agro', 'Cristiano Matias', '2025-10-29'),
    ('Santa Rita Agro', 'Fernando José Silva', '2022-02-10'),
    ('Santa Rita Agro', 'Fransico Reis', '2024-06-27'),
    ('Santa Rita Agro', 'José Henrique Pereira', '2026-04-14'),
    ('Santa Rita Agro', 'Leda Maria', '2023-04-03'),
    ('Santa Rita Agro', 'Lilian Maria Staffuz', '2025-09-15'),
    ('Santa Rita Agro', 'Marcos Antônio Ferreira Marques', '2024-06-27'),
    ('Santa Rita Agro', 'Rafael dos Santos Martins', '2023-01-07'),
    ('Santa Rita Agro', 'Raphael Vinicius', '2021-01-13'),
    ('Santa Rita Agro', 'Robson Nascimento', '2025-10-29'),
    ('Santa Rita Agro', 'Suzana Rodrigues', '2024-10-22'),
    ('Vera Ligia Milani', 'Pec.3M-Dirceu da Silva', '2025-02-05'),
    ('Vera Ligia Milani', 'Pec.3M-Jeferson Ricardo Lemes', '2025-04-05'),
    ('Vera Ligia Milani', 'Pec.3M-Weber Jesus Garcia Domingues', '2025-11-05');

  -- cada nome acha UM fornecedor do cliente; a última rescisão (data, fazenda, atividade) e o 1º lançamento de folha
  create temp table _p on commit drop as
  select x.cliente, c.id cliente_id, x.fav, x.data,
         (select array_agg(ff.id) from public.financeiro_fornecedores ff where ff.cliente_id = c.id and ff.nome = x.fav
             and exists (select 1 from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
                          where l.favorecido_id = ff.id and pc.subcentro ilike 'Rescisões e Acertos%' and not coalesce(l.cancelado, false))) favs,
         null::uuid favorecido_id, null::text doc, null::date resc, null::uuid fazenda_id, null::text atividade, null::date desde
    from _x x join public.clientes c on c.nome = x.cliente;
  if (select count(*) from _p) <> 83 or exists (select 1 from _p where cardinality(favs) is distinct from 1) then
    raise exception 'V3b: algum nome não acha um fornecedor só (%). Nada foi gravado.',
      (select string_agg(cliente || ' · ' || fav, '; ') from _p where cardinality(favs) is distinct from 1);
  end if;
  update _p set favorecido_id = favs[1] where true;
  update _p p set doc = regexp_replace(coalesce(ff.cpf_cnpj, ''), '[^0-9]', '', 'g') from public.financeiro_fornecedores ff where ff.id = p.favorecido_id;
  update _p p set resc = u.dt, fazenda_id = u.fazenda_id,
         atividade = case when u.subcentro ilike '%Agricultura%' then 'agricultura' when u.subcentro ilike '%Administrativo%' then 'administrativo' else 'pecuaria' end
    from (select distinct on (l.favorecido_id) l.favorecido_id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) dt, l.fazenda_id, pc.subcentro
            from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
           where pc.subcentro ilike 'Rescisões e Acertos%' and not coalesce(l.cancelado, false) and l.favorecido_id in (select favorecido_id from _p)
           order by l.favorecido_id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) desc) u
   where u.favorecido_id = p.favorecido_id;
  update _p p set desde = (select date_trunc('month', min(l.data_competencia))::date from public.financeiro_lancamentos_v2 l
                             join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
                            where l.cliente_id = p.cliente_id and l.favorecido_id = p.favorecido_id and not coalesce(l.cancelado, false)
                              and (pc.subcentro ilike any (array['Salários e Encargos%', 'Rescisões e Acertos%', 'Benefícios e Premiações%']) or pc.centro_custo ilike 'Mão de Obra%'))
   where true;
  if exists (select 1 from _p where resc is distinct from data or fazenda_id is null or desde is null) then
    raise exception 'V3b: a rescisão mudou desde a prévia (%). Nada foi gravado.',
      (select string_agg(fav || ' ' || coalesce(resc::text, '—'), '; ') from _p where resc is distinct from data or fazenda_id is null or desde is null);
  end if;
  if exists (select 1 from _p p join public.folha_funcionarios f on f.cliente_id = p.cliente_id
              and (f.favorecido_id = p.favorecido_id or public._fn_folha_nome_casa(regexp_replace(p.fav, '^Pec\.3M-', ''), f.nome) is not null)) then
    raise exception 'V3b: alguém da lista já está no cadastro. Nada foi gravado.';
  end if;

  for rc in select * from _p order by cliente, fav loop
    v_id := (public.fn_folha_funcionario_gravar(rc.cliente_id, jsonb_build_object(
      'nome', regexp_replace(rc.fav, '^Pec\.3M-', ''),
      'cpf', case when length(rc.doc) = 11 and public._fn_cpf_cnpj_valido(rc.doc) then rc.doc end,
      'favorecido_id', rc.favorecido_id,
      'vinculo', 'clt',
      'empregador_registro', case when rc.fav like 'Pec.3M-%' then 'Higino (Pec.3M)' end,
      'a_atualizar', to_jsonb(array_remove(array['admissao', 'cargo', 'desligamento',
          case when not (length(rc.doc) = 11 and public._fn_cpf_cnpj_valido(rc.doc)) then 'cpf' end,
          case when rc.fav like '%.%' then 'nome_completo' end], null)),
      'observacao', 'ex-funcionário: entrou pela rescisão lançada (V3b); desligamento = pagamento da rescisão (provisório)'
    ), false)->>'id')::uuid;
    perform public.fn_folha_atuacao_gravar(v_id, least(rc.desde, date_trunc('month', rc.resc)::date),
      jsonb_build_array(jsonb_build_object('fazenda_id', rc.fazenda_id, 'atividade', rc.atividade, 'pct', 100)), false);
    perform public.fn_folha_funcionario_desligar(v_id, rc.resc, 'rescisão paga em ' || to_char(rc.resc, 'DD/MM/YYYY') || ' (data provisória; confirmar pelo TRCT)', false);
  end loop;

  -- chegada
  select count(*) into v_n from public.folha_funcionarios;
  if v_n <> 151 then raise exception 'V3b: % funcionários no cadastro (esperava 151). Nada foi gravado.', v_n; end if;
  if (select count(*) from public.folha_funcionarios where situacao = 'desligado') <> 87
     or (select count(*) from public.folha_funcionarios f join public.clientes c on c.id = f.cliente_id where c.nome = 'NJ Pecuária') <> 89
     or (select count(*) from public.folha_funcionarios f join public.clientes c on c.id = f.cliente_id where c.nome = 'Agnaldo Cedenho') <> 16
     or (select count(*) from public.folha_funcionarios f join public.clientes c on c.id = f.cliente_id where c.nome = 'Santa Rita Agro') <> 25
     or (select count(*) from public.folha_funcionarios f join public.clientes c on c.id = f.cliente_id where c.nome = 'Vera Ligia Milani') <> 12
     or exists (select 1 from public.folha_funcionarios f where not exists (select 1 from public.folha_funcionario_atuacao a where a.funcionario_id = f.id)) then
    raise exception 'V3b: a chegada não confere. Nada foi gravado.';
  end if;
end $v3b$;
