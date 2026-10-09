-- DIVIDENDO-ESCRITOR-UNICO-01 passo 2 — o escritor unico do cadastro de dividendos (20261027195300 + 20261027195400).
-- Roda no canal de ESCRITA, numa chamada so'; termina SEMPRE em RAISE (nada persiste). Sinteticos no cliente Teste, num segundo
-- cliente criado na transacao e — so' em SIMULACAO, como usuario comum — no cliente do proprio gestor (este ultimo, no arquivo da trava).
--   E1 criar (simulacao = gravacao; conta no molde)      E2 D1 (usa a geral)            E3 D2 (nome de conta fora de Dividendos)
--   E4 D3 (repetido entre ativos; inativo nao conta)      E5 renomear (com e sem lancamento; so' o nome muda)
--   E6 D5 e nome de conta geral                           E7 inativar (sem lancamento, com lancamento, geral)
--   E8 reativar
-- (E9 a E12 — ordem, trava de escrita direta, tenant e segundo cliente — em `dividendo_escritor_unico_01_trava_test.sql`: o canal
--  de escrita recusa carga acima de ~13 KB.)
-- A prova mora em `pg_temp.teste()` para o ensaio de mutacoes chamar o MESMO corpo. ⚠ Toda comparacao e' `is distinct from`:
-- com `<>` um NULO (recusa que nao veio, conta que nao existe) nao dispara e a mutacao sobrevive — aconteceu com duas.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- executa e devolve 'PASSOU <valor>' ou '<sqlstate> <mensagem>'; com p_comum, roda no papel `authenticated`
create function pg_temp.rec(p_sql text, p_comum boolean default false) returns text language plpgsql as $f$
declare v text;
begin
  if p_comum then execute 'set local role authenticated'; end if;
  execute p_sql into v;
  if p_comum then execute 'reset role'; end if;
  return 'PASSOU ' || coalesce(v, '');
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

create function pg_temp.lanc(p_cli uuid, p_conta uuid) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento,
                                         cenario, descricao, plano_conta_id, cancelado)
  values (p_cli, '2-Saídas', '-1', 12.34, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT dvd', p_conta, false)
  returning id $f$;

create function pg_temp.teste() returns void language plpgsql as $f$
declare
  c_t constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  s jsonb; g jsonb; r jsonb; t text;
  d_a uuid; d_b uuid; d_g uuid; d_a2 uuid; k_a uuid; k_b uuid; l_b uuid; v_geral text; k_geral uuid; v_plano int; v_md5 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  select count(*) into v_plano from financeiro_plano_contas;

  -- ── E1: criar ──
  s := fn_dividendo_criar(c_t, '  SINT DVD A  ', true);
  if exists (select 1 from financeiro_dividendos where nome like 'SINT DVD%') or (select count(*) from financeiro_plano_contas) is distinct from v_plano then
    raise exception 'E1: a simulacao gravou'; end if;
  g := fn_dividendo_criar(c_t, '  SINT DVD A  ');
  d_a := (g->'depois'->'dividendo'->>'id')::uuid; k_a := (g->'depois'->'conta'->>'id')::uuid;
  if (s->'depois'->'dividendo') - 'id' is distinct from (g->'depois'->'dividendo') - 'id' or (s->'depois'->'conta') - 'id' is distinct from (g->'depois'->'conta') - 'id'
     or s->'recusa' is distinct from 'null' then raise exception 'E1: simulacao is distinct from gravacao: % x %', s, g; end if;
  if not exists (select 1 from financeiro_dividendos where id = d_a and nome = 'SINT DVD A' and ativo and cliente_id = c_t) then
    raise exception 'E1: cadastro'; end if;
  if not exists (select 1 from financeiro_plano_contas p where p.id = k_a and p.cliente_id = c_t and p.ativo and p.tipo_operacao = '2-Saídas'
       and p.macro_custo = 'Dividendos' and p.grupo_custo = 'Dividendos' and p.centro_custo = 'Dividendos' and p.subcentro = 'Dividendos SINT DVD A'
       and p.escopo_negocio = 'administrativo' and p.compoe_dre = false
       and p.ordem_exibicao = (select max(x.ordem_exibicao) from financeiro_plano_contas x where x.cliente_id = c_t and x.macro_custo = 'Dividendos'))
     or (select count(*) from financeiro_plano_contas) is distinct from v_plano + 1 then raise exception 'E1: conta fora do molde'; end if;
  t := pg_temp.rec($q$select fn_dividendo_criar('43f32d07-dba8-4670-900c-bf645440c04a', '   ')::text$q$);
  if t not like 'P0001 Informe o nome do dividendo. Nada foi gravado.' then raise exception 'E1: nome vazio: %', t; end if;

  -- ── E2: D1, o nome de uma conta geral usa a geral ──
  select p.id, substr(p.subcentro, 12) into k_geral, v_geral from financeiro_plano_contas p
   where p.ativo and p.cliente_id is null and p.macro_custo = 'Dividendos' and p.subcentro like 'Dividendos %'
     and not exists (select 1 from financeiro_dividendos d where d.cliente_id = c_t and lower(btrim(d.nome)) = lower(substr(p.subcentro, 12)))
   order by p.subcentro limit 1;
  g := fn_dividendo_criar(c_t, v_geral);
  d_g := (g->'depois'->'dividendo'->>'id')::uuid;
  if (g->'depois'->'conta'->>'id')::uuid is distinct from k_geral or (g->'depois'->'conta'->>'geral')::boolean is not true
     or (select count(*) from financeiro_plano_contas) is distinct from v_plano + 1 then raise exception 'E2: D1 nao usou a geral: %', g; end if;

  -- ── E3: D2, nome de conta ativa fora do macro Dividendos ──
  insert into financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao, compoe_dre)
  values (c_t, '2-Saídas', 'Custeio Produtivo', 'SINT', 'SINT', 'Dividendos SINT Fora', 'administrativo', true, 99990, true);
  r := fn_dividendo_criar(c_t, 'sint fora', true);
  if r->'recusa'->>'motivo' is distinct from 'nome_de_outra_conta' or r->'recusa'->>'frase' not like '%«Dividendos SINT Fora»%' then raise exception 'E3: D2: %', r; end if;

  -- ── E4: D3 ──
  r := fn_dividendo_criar(c_t, ' sint dvd a ', true);
  if r->'recusa'->>'motivo' is distinct from 'nome_repetido' then raise exception 'E4: repetido: %', r; end if;
  t := pg_temp.rec($q$select fn_dividendo_criar('43f32d07-dba8-4670-900c-bf645440c04a', 'SINT dvd A')::text$q$);
  if t is distinct from 'P0001 Já existe um dividendo ativo com este nome. Nada foi gravado.' then raise exception 'E4: gravacao: %', t; end if;
  g := fn_dividendo_criar(c_t, 'SINT DVD B');
  d_b := (g->'depois'->'dividendo'->>'id')::uuid; k_b := (g->'depois'->'conta'->>'id')::uuid;
  r := fn_dividendo_renomear(d_b, 'sint dvd a', true);
  if r->'recusa'->>'motivo' is distinct from 'nome_repetido' or r->'antes'->'dividendo'->>'nome' is distinct from 'SINT DVD B' then raise exception 'E4: renomear repetido: %', r; end if;

  -- ── E5: renomear ──
  r := fn_dividendo_renomear(d_a, 'SINT DVD A1');
  if (r->'depois'->'conta'->>'id')::uuid is distinct from k_a or r->'depois'->'conta'->>'subcentro' is distinct from 'Dividendos SINT DVD A1' or (r->>'lancamentos_tocados')::int is distinct from 0
     or (select count(*) from financeiro_plano_contas) is distinct from v_plano + 3 then raise exception 'E5: sem lancamento: %', r; end if;
  l_b := pg_temp.lanc(c_t, k_b);
  if (select subcentro from financeiro_lancamentos_v2 where id = l_b) is distinct from 'Dividendos SINT DVD B' then raise exception 'E5: o lancamento nao nasceu na conta'; end if;
  select md5((to_jsonb(l) - 'subcentro' - 'updated_at')::text) into v_md5 from financeiro_lancamentos_v2 l where l.id = l_b;
  s := fn_dividendo_renomear(d_b, 'SINT DVD B1', true);
  if (select subcentro from financeiro_lancamentos_v2 where id = l_b) is distinct from 'Dividendos SINT DVD B' then raise exception 'E5: a simulacao renomeou'; end if;
  r := fn_dividendo_renomear(d_b, 'SINT DVD B1');
  if s is distinct from r or (r->>'lancamentos_tocados')::int is distinct from 1 or (r->'depois'->'conta'->>'id')::uuid is distinct from k_b then raise exception 'E5: com lancamento: % x %', s, r; end if;
  if not exists (select 1 from financeiro_lancamentos_v2 l where l.id = l_b and l.subcentro = 'Dividendos SINT DVD B1' and l.plano_conta_id = k_b
                   and md5((to_jsonb(l) - 'subcentro' - 'updated_at')::text) = v_md5) then
    raise exception 'E5: o lancamento mudou alem do nome'; end if;
  r := fn_dividendo_renomear(d_b, 'SINT DVD B1', true);
  if r->'recusa'->>'motivo' is distinct from 'mesmo_nome' then raise exception 'E5: mesmo nome: %', r; end if;

  -- ── E6: D5 e nome de conta geral ──
  r := fn_dividendo_renomear(d_g, 'SINT DVD G', true);
  if r->'recusa'->>'motivo' is distinct from 'usa_conta_geral' or r->'recusa'->>'frase' is distinct from 'Este dividendo usa uma conta geral do plano e ainda não pode ser renomeado.' then
    raise exception 'E6: D5: %', r; end if;
  perform fn_dividendo_inativar(d_g);
  r := fn_dividendo_renomear(d_a, v_geral, true);
  if r->'recusa'->>'motivo' is distinct from 'nome_de_conta_geral' then raise exception 'E6: para nome de geral: %', r; end if;
  perform fn_dividendo_reativar(d_g);

  -- ── E7: inativar ──
  s := fn_dividendo_inativar(d_b, true);
  r := fn_dividendo_inativar(d_b);
  if s is distinct from r or r->>'conta_acao' is distinct from 'mantida' or (r->>'lancamentos_que_seguram')::int is distinct from 1
     or not (select ativo from financeiro_plano_contas where id = k_b) or (select ativo from financeiro_dividendos where id = d_b) then
    raise exception 'E7: com lancamento: %', r; end if;
  r := fn_dividendo_inativar(d_a);
  if r->>'conta_acao' is distinct from 'inativada' or (select ativo from financeiro_plano_contas where id = k_a) then raise exception 'E7: sem lancamento: %', r; end if;
  r := fn_dividendo_inativar(d_g);
  if r->>'conta_acao' is distinct from 'geral' or not (select ativo from financeiro_plano_contas where id = k_geral) then raise exception 'E7: geral: %', r; end if;
  r := fn_dividendo_inativar(d_a, true);
  if r->'recusa'->>'motivo' is distinct from 'ja_inativo' then raise exception 'E7: ja inativo: %', r; end if;

  -- ── E8: reativar (e D3 no reativar) ──
  g := fn_dividendo_criar(c_t, 'SINT DVD A1');
  d_a2 := (g->'depois'->'dividendo'->>'id')::uuid;
  if (g->'depois'->'conta'->>'id')::uuid is distinct from k_a or not (select ativo from financeiro_plano_contas where id = k_a) then
    raise exception 'E8: o nome de um inativo nao reusou a conta dele: %', g; end if;
  r := fn_dividendo_reativar(d_a, true);
  if r->'recusa'->>'motivo' is distinct from 'nome_repetido' or r->'recusa'->>'frase' not like '%não pode ser reativado.' then raise exception 'E8: D3 no reativar: %', r; end if;
  perform fn_dividendo_inativar(d_a2);
  r := fn_dividendo_reativar(d_a);
  if (r->'depois'->'conta'->>'id')::uuid is distinct from k_a or not (select ativo from financeiro_plano_contas where id = k_a)
     or not (select ativo from financeiro_dividendos where id = d_a) then raise exception 'E8: reativar: %', r; end if;
  r := fn_dividendo_reativar(d_a, true);
  if r->'recusa'->>'motivo' is distinct from 'ja_ativo' then raise exception 'E8: ja ativo: %', r; end if;

end $f$;

do $t$
begin
  perform pg_temp.teste();
  raise exception 'OK DIVIDENDO-ESCRITOR-UNICO-01 passo 2: E1 a E8';
end $t$;
