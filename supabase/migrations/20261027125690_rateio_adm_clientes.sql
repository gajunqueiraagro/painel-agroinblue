-- RATEIO-ADM-CLIENTES-01 (22/09/2026) - rateio administrativo cadastrado para todos os clientes
--
-- Migration de DADO em agri_rateio_admin. Nenhuma RPC, nenhuma tela.
--
-- O DEFEITO: agri_rateio_admin so' tinha o NJ, e so' de 2021 a 2027. Sem linha para o
-- cliente/ano, o pool administrativo da DRE pecuaria e' ZERO: o custo administrativo existe, mas
-- nao chega a atividade nenhuma. Medido no Agnaldo, jan-ago/2026: bruto 68.982,41, pool 0. A
-- limpeza do legado (LEGADO-ADM-02, 20261027125700) move 302 mil de custo fixo da coluna
-- Administrativo para o plano administrativo; sem rateio, esse dinheiro sairia da DRE e o
-- resultado do Agnaldo subiria 298.926,81. Por isso esta migration vem ANTES.
--
-- FORMATO (copiado do NJ): uma linha por (cliente, ano, atividade), sempre as tres atividades -
-- pecuaria, agricultura, silvicultura -, soma 100 por cliente/ano. A tabela ja' garante
-- UNIQUE (cliente_id, ano, atividade) e percentual entre 0 e 100.
--
-- PERCENTUAIS (Gabriel, 22/09/2026):
--   Agnaldo Cedenho    100 / 0 / 0   2014-2027
--   Vera Ligia Milani  100 / 0 / 0   2014-2030
--   RRCC               100 / 0 / 0   2017-2027
--   Santa Rita Agro     95 / 0 / 5   2014-2029   (eucalipto: venda e arrendamento florestal)
--   Raul Juliato        95 / 0 / 5   2013-2026   (nao tem lavoura; ver abaixo)
--   NJ Pecuaria        100 / 0 / 0   2013-2020   e   70 / 25 / 5   2028-2040
--                      (2021-2027 ja' existem e NAO sao tocados)
-- As faixas vao do primeiro ao ultimo ano com lancamento nao cancelado do cliente. Ano do meio
-- sem movimento recebe a linha tambem - e' inofensivo e evita buraco.
--
-- ⚠ RAUL: os 28 lancamentos de "agricultura" (plantio, defensivo, fertilizante, implementos,
--   2021-2025) sao eucalipto lancado com plano de agricultura, legado de antes do escopo
--   silvicultura. Frente propria, [RAUL-EUCALIPTO-PLANO] (13xxx -> 204xx por subcentro), NAO
--   tocada aqui. O rateio ja' nasce certo: agricultura 0.
--
-- ⚠ TESTE CLIENTE fica fora da guarda. `clientes` nao tem flag de teste (config nulo ou vazio em
--   todos); a exclusao e' pelo slug 'teste-cliente', que e' estavel.
--
-- IDEMPOTENTE: ON CONFLICT DO NOTHING; a guarda confere que o que esta' gravado e' o planejado.

begin;

create temp table _rt on commit drop as
select * from (values
  ('a2d41cda-eb1e-4527-a6cf-a1b9663339e2'::uuid, 'Agnaldo%',          2014, 2027, 100::numeric, 0::numeric,  0::numeric),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890',       'Vera Ligia%',       2014, 2030, 100,          0,           0),
  ('537661af-a934-4c66-b138-f8dbc378a00f',       'RRCC',              2017, 2027, 100,          0,           0),
  ('77d37bbf-a440-4fca-bf1a-eac60cf91bc4',       'Santa Rita%',       2014, 2029,  95,          0,           5),
  ('a6793f65-7005-458f-95e5-d195f8cf7631',       'Raul Juliato%',     2013, 2026,  95,          0,           5),
  ('f2d67cd4-24d0-456f-a079-a3281dcce7fd',       'NJ Pecu%',          2013, 2020, 100,          0,           0),
  ('f2d67cd4-24d0-456f-a079-a3281dcce7fd',       'NJ Pecu%',          2028, 2040,  70,         25,           5)
) v(cliente, nome, ano_ini, ano_fim, pec, agr, sil);

-- ── entrada: os ids sao dos clientes que o nome diz ─────────────────────────────────────────
do $$
declare n int;
begin
  select count(distinct r.cliente) into n from _rt r join public.clientes c on c.id = r.cliente
   where c.nome ilike r.nome;
  if n <> 6 then raise exception 'clientes nao conferem: % de 6', n using errcode = 'P0001'; end if;
  if exists (select 1 from _rt where pec + agr + sil <> 100) then
    raise exception 'plano com soma diferente de 100' using errcode = 'P0001';
  end if;
end $$;

insert into public.agri_rateio_admin (cliente_id, ano, atividade, percentual)
select r.cliente, g.ano, a.atv,
       case a.atv when 'pecuaria' then r.pec when 'agricultura' then r.agr else r.sil end
  from _rt r
  cross join lateral generate_series(r.ano_ini, r.ano_fim) g(ano)
  cross join (values ('pecuaria'), ('agricultura'), ('silvicultura')) a(atv)
on conflict (cliente_id, ano, atividade) do nothing;

-- ── guarda de saida ─────────────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  -- (1) o gravado e' o planejado, linha a linha
  select count(*) into n
    from _rt r
    cross join lateral generate_series(r.ano_ini, r.ano_fim) g(ano)
    cross join (values ('pecuaria'), ('agricultura'), ('silvicultura')) a(atv)
    left join public.agri_rateio_admin x on x.cliente_id = r.cliente and x.ano = g.ano and x.atividade = a.atv
   where x.percentual is distinct from (case a.atv when 'pecuaria' then r.pec when 'agricultura' then r.agr else r.sil end);
  if n > 0 then raise exception '% linha(s) gravadas diferentes do planejado', n using errcode = 'P0001'; end if;

  -- (2) soma 100 e tres atividades em todo cliente/ano da tabela
  select count(*) into n from (
    select cliente_id, ano from public.agri_rateio_admin group by 1, 2
    having sum(percentual) <> 100 or count(*) <> 3) z;
  if n > 0 then raise exception '% cliente/ano com soma diferente de 100 ou sem as tres atividades', n using errcode = 'P0001'; end if;

  -- (3) todo cliente real com lancamento tem rateio em todo ano com data_competencia
  select count(*) into n from (
    select distinct l.cliente_id, extract(year from l.data_competencia)::int ano
      from public.financeiro_lancamentos_v2 l
      join public.clientes c on c.id = l.cliente_id
     where coalesce(l.cancelado, false) = false and l.data_competencia is not null
       and c.slug is distinct from 'teste-cliente') y
   where not exists (select 1 from public.agri_rateio_admin x where x.cliente_id = y.cliente_id and x.ano = y.ano);
  if n > 0 then raise exception '% cliente/ano com lancamento e sem rateio', n using errcode = 'P0001'; end if;

  raise notice 'RATEIO-ADM-CLIENTES-01 ok: planejado gravado, soma 100 em todo cliente/ano, nenhum ano com movimento sem rateio.';
end $$;

commit;
