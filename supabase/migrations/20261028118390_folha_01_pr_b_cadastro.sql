-- FOLHA-01 · PR B — o CADASTRO de funcionários a partir das recorrências de folha (Gabriel 18/11/2026: B1 a · B2 sim · B3 a · B5 a · B6 como
-- proposto; B4 SEM RESPOSTA → Ana Paula Cavalli de Oliveira e Maria Gabriela Cavalli (Santa Rita) ficam FORA deste lote).
-- Relatório: folha-20261118-1621-FOLHA-01-PR-B-CADASTRO-PREVIA.md (a prévia dizia 71; o certo é 70 — o NJ tem 31, não 32; sem o B4, 68).
-- O QUE FAZ: uma linha por PESSOA (não por recorrência), pelas funções da 118370 (fn_folha_funcionario_gravar / fn_folha_atuacao_gravar /
--   fn_folha_funcionario_desligar), autor = Gabriel, via 'FOLHA-01-PR-B':
--   nome do favorecido (sem "Pec.3M-"); favorecido; recorrência de origem = a de salário mais antiga; CPF do fornecedor só se válido;
--   atuação 100% na fazenda × atividade da recorrência (do subcentro), desde o início da recorrência; salário VAZIO (B1 a);
--   "a atualizar": salário, admissão, cargo (+ cpf se vazio, + situação no B6, + desligamento no B2, + nome completo / recorrências extras no B5).
--   NJ: código do contador e empregador (CEI) do Recibo de Pagamento13; Eunice e Veronica = domésticas, registro no Júnior (pessoal).
--   Vera: os 6 "Pec.3M-" com empregador_registro = Higino (Pec.3M) (F5; a parte 50% entra com o salário).
--   NJ, B2: Rosalino 03/07, Leandro Soares Meira 13/07, Manoel 28/09, Matheus 30/10/2026 = desligados (data provisória = pagamento da rescisão).
--   NJ: José Sergio (criado hoje pelo recibo, sem recorrência) entra pelo lançamento do 13º.
-- FORA: as guias (Receita Federal, Pec.3M-Receita Federal, Caixa Econômica Federal, Sindicato Rural), FMCD (B3, PJ), as 2 do B4.
-- RECUSA (nada grava) se: já existe funcionário nestes clientes; a contagem por cliente não é a da prévia; algum CPF não passa.
-- DESFAZER (as tabelas eram vazias e nada as referencia ainda):
--   delete from folha_funcionario_atuacao where funcionario_id in (select registro_id from folha_trilha where via = 'FOLHA-01-PR-B' and tabela = 'folha_funcionarios');
--   delete from folha_funcionarios where id in (select registro_id from folha_trilha where via = 'FOLHA-01-PR-B' and tabela = 'folha_funcionarios');
--   (a trilha fica, imutável, como registro do que foi feito e desfeito)

set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
select set_config('app.via', 'FOLHA-01-PR-B', true);

do $b$
declare
  c_nj constant uuid := (select id from public.clientes where nome = 'NJ Pecuária');
  r record; v_id uuid; v_n int;
begin
  if exists (select 1 from public.folha_funcionarios f join public.financeiro_recorrencias x on x.cliente_id = f.cliente_id and x.folha) then
    raise exception 'PR B: já há funcionário cadastrado nestes clientes. Nada foi gravado.';
  end if;

  -- o recibo do 13º do NJ: código do contador e CEI
  create temp table _nj (nome text, codigo text, emp text) on commit drop;
  insert into _nj values
    ('AMANDA MONTES CAMARGO', '83', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('ANTONIO PERES NETO', '59', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('FERNANDO HENRIQUE ZANDONADI DI RAIMO', '104', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('GILBERTO RICHARDES DA SILVA', '113', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('GUSTAVO FERNANDO DA SILVA MERCES', '52', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('GUSTAVO MAIA PINHEIRO', '107', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('JADSON TEODORIO GABRIEL', '114', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('JONATAS BARBOSA BATISTA', '93', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('JOSE ALVES DOS SANTOS FILHO', '111', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('JOSE SERGIO LORIVAL TAVARES DIAS OLIVEIRA', '116', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('LENINHO TAVARES DA SILVA', '1', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('LUCAS SANTOS SILVA', '115', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('RENAN FERNANDES DA SILVA', '109', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('ROZEMIR DE OLIVEIRA', '87', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('WESLEY CAUAM DE OLIVEIRA SOUZA', '108', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'), ('YASMIN GABRIELA DE OLIVEIRA LIMA', '106', 'NATALINO CAVALLI JUNIOR · CEI 323700186085'),
    ('LUIS PAULO CARVALHO DA SILVA', '3', 'NATALINO CAVALLI JUNIOR · CEI 800266111488'),
    ('AMILTON APARECIDO CORREIA', '40', 'NATALINO CAVALLI JUNIOR FAZ STO EXPEDITO · CEI 700053617787'), ('LEANDRO LUIZ DEVES', '41', 'NATALINO CAVALLI JUNIOR FAZ STO EXPEDITO · CEI 700053617787');

  -- B2: desligados na data provisória (pagamento da rescisão)
  create temp table _desl (nome text, data date) on commit drop;
  insert into _desl values ('Rosalino da Silva Pereira', '2026-07-03'), ('Leandro Soares Meira', '2026-07-13'),
                           ('Manoel Angelo Nascimento', '2026-09-28'), ('Matheus Henrique Nascimento', '2026-10-30');

  -- uma linha por pessoa: a recorrência de salário mais antiga do favorecido
  create temp table _p on commit drop as
  select distinct on (rc.cliente_id, rc.favorecido_id)
         rc.cliente_id, c.nome cliente, rc.favorecido_id, f.nome fav_nome, rc.id rec_id, rc.fazenda_id, date_trunc('month', coalesce(rc.data_inicio, rc.created_at::date))::date desde,
         case when rc.subcentro ilike '%Agricultura%' then 'agricultura' when rc.subcentro ilike '%Administrativo%' then 'administrativo' else 'pecuaria' end atividade,
         regexp_replace(coalesce(f.cpf_cnpj, ''), '[^0-9]', '', 'g') doc,
         (select count(*) from public.financeiro_recorrencias r2 where r2.cliente_id = rc.cliente_id and r2.favorecido_id = rc.favorecido_id and r2.folha
             and r2.subcentro ilike 'Salários e Encargos%') n_sal
    from public.financeiro_recorrencias rc join public.clientes c on c.id = rc.cliente_id join public.financeiro_fornecedores f on f.id = rc.favorecido_id
   where rc.folha and rc.subcentro ilike 'Salários e Encargos%'
     and f.nome not in ('Receita Federal', 'Pec.3M-Receita Federal', 'Caixa Econômica Federal', 'Sindicato Rural de Pres. Prudente',
                        'FMCD Consultoria e Assessoria Agropecuária Ltda', 'Ana Paula Cavalli de Oliveira', 'Maria Gabriela Cavalli')
   order by rc.cliente_id, rc.favorecido_id, rc.data_inicio nulls last, rc.created_at;

  -- José Sergio (NJ): sem recorrência; a atuação vem do lançamento do 13º criado pelo recibo
  insert into _p (cliente_id, cliente, favorecido_id, fav_nome, rec_id, fazenda_id, desde, atividade, doc, n_sal)
  select l.cliente_id, 'NJ Pecuária', f.id, f.nome, null, l.fazenda_id, '2026-11-01', 'pecuaria', '', 0
    from public.financeiro_lancamentos_v2 l join public.financeiro_fornecedores f on f.id = l.favorecido_id
   where l.cliente_id = c_nj and f.nome = 'Jose Sergio Lorival Tavares Dias Oliveira' and l.descricao = '13º Salário 1ª Parcela 2026' and not coalesce(l.cancelado, false);

  -- a contagem da prévia (sem o B4)
  if (select count(*) from _p where cliente = 'NJ Pecuária') <> 31 or (select count(*) from _p where cliente = 'Vera Ligia Milani') <> 9
     or (select count(*) from _p where cliente = 'Santa Rita Agro') <> 12 or (select count(*) from _p where cliente = 'Agnaldo Cedenho') <> 7
     or (select count(*) from _p where cliente = 'RRCC') <> 6 or (select count(*) from _p where cliente = 'Raul Juliato') <> 3 then
    raise exception 'PR B: a contagem não é a da prévia (%). Nada foi gravado.', (select string_agg(cliente || '=' || n, ', ') from (select cliente, count(*) n from _p group by 1) x);
  end if;

  for r in select p.*, nj.codigo, nj.emp, d.data desl from _p p
             left join _nj nj on p.cliente_id = c_nj and public._fn_folha_nome_casa(nj.nome, p.fav_nome) is not null
             left join _desl d on p.cliente_id = c_nj and d.nome = p.fav_nome
            order by p.cliente, p.fav_nome loop
    v_id := (public.fn_folha_funcionario_gravar(r.cliente_id, jsonb_build_object(
      'nome', regexp_replace(r.fav_nome, '^Pec\.3M-', ''),
      'cpf', case when length(r.doc) = 11 and public._fn_cpf_cnpj_valido(r.doc) then r.doc end,
      'favorecido_id', r.favorecido_id,
      'recorrencia_origem_id', r.rec_id,
      'codigo_contador', r.codigo,
      'vinculo', case when r.cliente_id = c_nj and r.fav_nome in ('Eunice do Carmo Dias', 'Veronica Maia Pinheiro') then 'domestico' else 'clt' end,
      'empregador_registro', case when r.cliente_id = c_nj and r.fav_nome in ('Eunice do Carmo Dias', 'Veronica Maia Pinheiro') then 'Natalino Cavalli Junior (pessoal · e-Social doméstico)'
                                  when r.fav_nome like 'Pec.3M-%' then 'Higino (Pec.3M)'
                                  else r.emp end,
      'a_atualizar', to_jsonb(array_remove(array[
          'salario', 'admissao', 'cargo',
          case when not (length(r.doc) = 11 and public._fn_cpf_cnpj_valido(r.doc)) then 'cpf' end,
          case when r.cliente_id = c_nj and r.fav_nome in ('Carlos Eduardo Lopes da Silva', 'Paulo Henrique Pereira', 'Jonatas Barbosa Batista', 'Leninho Tavares da Silva') then 'situacao' end,
          case when r.desl is not null then 'desligamento' end,
          case when r.fav_nome in ('Marcelo 01', 'Marcelo 02', 'Marcos') then 'nome_completo' end,
          case when r.n_sal > 1 then 'recorrencias_extras' end], null)),
      'observacao', case when r.n_sal > 1 then 'mais de uma recorrência de folha para este favorecido (' || r.n_sal || '): confira se é a mesma pessoa'
                         when r.rec_id is null then 'entrou pelo Recibo de Pagamento13 (13º 1ª parcela 2026)' end
    ), false)->>'id')::uuid;
    perform public.fn_folha_atuacao_gravar(v_id, r.desde, jsonb_build_array(jsonb_build_object('fazenda_id', r.fazenda_id, 'atividade', r.atividade, 'pct', 100)), false);
    if r.desl is not null then
      perform public.fn_folha_funcionario_desligar(v_id, r.desl, 'rescisão paga em ' || to_char(r.desl, 'DD/MM/YYYY') || ' (data provisória; confirmar pelo TRCT)', false);
    end if;
  end loop;

  -- chegada
  select count(*) into v_n from public.folha_funcionarios;
  if v_n <> 68 then raise exception 'PR B: % funcionários gravados (esperava 68). Nada foi gravado.', v_n; end if;
  if (select count(*) from public.folha_funcionarios where situacao = 'desligado') <> 4
     or (select count(*) from public.folha_funcionarios where codigo_contador is not null) <> 19
     or (select count(*) from public.folha_funcionarios where vinculo = 'domestico') <> 2
     or (select count(*) from public.folha_funcionarios where empregador_registro = 'Higino (Pec.3M)') <> 6
     or exists (select 1 from public.folha_funcionarios f where not exists (select 1 from public.folha_funcionario_atuacao a where a.funcionario_id = f.id)) then
    raise exception 'PR B: a chegada não confere. Nada foi gravado.';
  end if;
end $b$;
