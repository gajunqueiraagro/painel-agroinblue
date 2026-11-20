-- FOLHA-01 · V3 — liga os lançamentos de folha EXISTENTES ao funcionário (Gabriel 19/11/2026, FILA 06:14: "V3a SIM · V3c TODO o histórico").
-- Depois da 118405 (os desligados pela rescisão também ligam pelo favorecido). Relatório: folha-20261119-0623-FOLHA-01-V3B-V3-LOTES-118405-118410.md.
-- O QUE LIGA (lançamento vivo, contas Salários e Encargos / Rescisões e Acertos / Benefícios e Premiações / centro Mão de Obra, sem funcionário):
--   (a) pelo favorecido: o favorecido do lançamento é o favorecido de UM funcionário do cliente;
--   (b) pelo nome do favorecido: o favorecido não é de funcionário nenhum e o nome dele (sem "Pec.3M-" e sem o parêntese) casa com UM
--       funcionário pela `_fn_folha_nome_casa` (ex.: "Wesley Leal (Izabel Leal)" → Wesley Leal de Souza).
-- NÃO LIGA: pela descrição (vira sugestão na tela, V4); empresa/guia/contador; "Miltinho" e "Marcelo Cassim Correa" (RRCC: pendência na
--   tela, sem juntar); os ~405 do Raul sem favorecido. Não muda valor, status, conta nem conciliação (só `funcionario_id`).
-- COMO: `fn_lancamento_funcionario_ligar` (118400), um chamado por funcionário e regra, autor = Gabriel, trilha audit_log via 'folha-vinculo'.
-- ENSAIO 19/11 (depois da 118405): 4.460 = NJ 2.315 · Santa Rita 665 (77 pelo nome) · Agnaldo 724 · RRCC 357 · Vera 363 (47 pelo nome) · Raul 36.
-- RECUSA (nada grava) se: já há lançamento ligado; a contagem por cliente não é a do ensaio; a chegada não confere.
-- DESFAZER: update pela mesma função com null nos ids ligados por este lote:
--   select fn_lancamento_funcionario_ligar(array_agg(registro_id), null, 'desfaz 118410', false) from audit_log
--    where tabela_origem = 'financeiro_lancamentos_v2' and via = 'folha-vinculo' and dados_novos->>'funcionario_id' is not null group by cliente_id;
--   (um cliente por chamada; como Gabriel)

set local lock_timeout = '2s';
set local statement_timeout = '120s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

do $v3$
declare
  rc record; v_n int;
begin
  if exists (select 1 from public.financeiro_lancamentos_v2 where funcionario_id is not null) then
    raise exception 'V3: já há lançamento ligado a funcionário. Nada foi gravado.';
  end if;

  create temp table _l on commit drop as
  select l.id, l.cliente_id, l.favorecido_id
    from public.financeiro_lancamentos_v2 l
   where not coalesce(l.cancelado, false) and l.funcionario_id is null and l.favorecido_id is not null
     and l.cliente_id in (select distinct cliente_id from public.folha_funcionarios)
     and l.plano_conta_id in (select id from public.financeiro_plano_contas
                               where subcentro ilike any (array['Salários e Encargos%', 'Rescisões e Acertos%', 'Benefícios e Premiações%']) or centro_custo ilike 'Mão de Obra%');

  -- um par (favorecido → funcionário) por favorecido
  create temp table _m on commit drop as
  with fv as (select distinct l.cliente_id, l.favorecido_id, ff.nome fnome from _l l join public.financeiro_fornecedores ff on ff.id = l.favorecido_id),
  a as (select fv.cliente_id, fv.favorecido_id, min(f.id::text)::uuid fid, count(*) n
          from fv join public.folha_funcionarios f on f.cliente_id = fv.cliente_id and f.favorecido_id = fv.favorecido_id group by 1, 2),
  b as (select fv.cliente_id, fv.favorecido_id, min(f.id::text)::uuid fid, count(*) n
          from fv join public.folha_funcionarios f on f.cliente_id = fv.cliente_id
         where not exists (select 1 from public.folha_funcionarios g where g.cliente_id = fv.cliente_id and g.favorecido_id = fv.favorecido_id)
           and public._fn_folha_nome_casa(btrim(regexp_replace(regexp_replace(fv.fnome, '^Pec\.3M-', ''), '\(.*\)', '')), f.nome) is not null
         group by 1, 2)
  select cliente_id, favorecido_id, fid, 'favorecido' modo from a where n = 1
  union all
  select cliente_id, favorecido_id, fid, 'nome do favorecido' from b where n = 1;

  create temp table _q on commit drop as
  select m.fid, m.modo, c.nome cliente, array_agg(l.id order by l.id) ids
    from _l l join _m m on m.cliente_id = l.cliente_id and m.favorecido_id = l.favorecido_id join public.clientes c on c.id = l.cliente_id
   group by m.fid, m.modo, c.nome;

  -- a contagem do ensaio
  if (select coalesce(sum(cardinality(ids)), 0) from _q) <> 4460
     or exists (select 1 from (values ('NJ Pecuária', 2315), ('Santa Rita Agro', 665), ('Agnaldo Cedenho', 724), ('RRCC', 357),
                                      ('Vera Ligia Milani', 363), ('Raul Juliato', 36)) e(cliente, n)
                 where e.n <> (select coalesce(sum(cardinality(ids)), 0) from _q where _q.cliente = e.cliente)) then
    raise exception 'V3: a contagem não é a do ensaio (%). Nada foi gravado.',
      (select string_agg(cliente || ' ' || modo || '=' || n, ', ') from (select cliente, modo, sum(cardinality(ids)) n from _q group by 1, 2) x);
  end if;

  for rc in select * from _q order by cliente, modo, fid loop
    perform public.fn_lancamento_funcionario_ligar(rc.ids, rc.fid, 'V3 (118410): ligado pelo ' || rc.modo, false);
  end loop;

  -- chegada
  select count(*) into v_n from public.financeiro_lancamentos_v2 where funcionario_id is not null;
  if v_n <> (select sum(cardinality(ids)) from _q)
     or exists (select 1 from public.financeiro_lancamentos_v2 l join public.folha_funcionarios f on f.id = l.funcionario_id where f.cliente_id <> l.cliente_id) then
    raise exception 'V3: a chegada não confere (% ligados). Nada foi gravado.', v_n;
  end if;
end $v3$;
