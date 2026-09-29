-- FIN-COMPETENCIA-VENDA-01a — prova de `_oc_competencia_pela_saida`, `_oc_restaurar_competencia` e das tres RPCs patcheadas
-- (migration 20261027179000). Roda em ROLLBACK: o bloco termina em RAISE 'OK ...' e nada fica gravado. Qualquer outra mensagem
-- e' falha.
-- Cobre, com dado real do proto:
--   A. conta corrente (fb64d4d6, Santa Rita, Paulo Soriano): os tres recebimentos religados pelo vincular do Financeiro V2 ficam
--      com a competencia da saida (17/06/2020) e safra nula (a Santa Rita comeca em 20/21); valor, pagamento, banco e hash
--      intocados; o evento guarda os anteriores (22/06, 06/07, 28/08 e as safras).
--   C. varias saidas (232c05aa, 19/03 a 25/06/2025): recebimento de 25/07/2025 vai para a PRIMEIRA, e a safra muda de temporada.
--   B. titulo (9b2b5e6b, abate NJ): o desvincular de um vinculo antigo diz "sem snapshot" e nao mexe; a simulacao do religar
--      anuncia a saida sem gravar; religar grava 15/04; desvincular devolve 16/04 e a safra de antes.
--   B'. editado depois do vinculo: a edicao vence e o motivo volta.
--   D. divergente (02be1a41, data_operacao 02/09, saida 01/09): manda a saida.
--   E. nao-venda: despesa (18b04569) e devolucao de adiantamento de boitel (972e40f0) seguem a data da OC, sem marca.
--   F. "Venda em Boitel" fica FORA da regra (Gabriel, 29/09/2026): 7b520375 (2ca81c1b) com a safra zerada antes de religar
--      volta com a data da OC e a safra NULA — pela regra ela viria 5e8b70ac (a sugerida da temporada, que existe) e com a marca.
-- Os lancamentos de conta corrente sao soltos a' mao (a parte cancelada), porque o desvincular desse ramo e' o VOLTA-01a.
do $do$
declare
  c_fb uuid := 'fb64d4d6-8878-48ca-b6c3-0abde96f4493'; c_23 uuid := '232c05aa-e531-4f91-a4ba-a61e791d4d56';
  c_9b uuid := '9b2b5e6b-d800-4f48-8acd-732e125c9fb4'; c_02 uuid := '02be1a41-6d1d-4f6d-9d73-387cd758658c';
  c_58 uuid := '581d075c-0eed-4996-ad1e-f2c05c26ba92'; c_2c uuid := '2ca81c1b-9f54-4468-b664-9a5fe30e4a86';
  l_b uuid := '7b520375-499e-4865-ab39-71291ec064ed';
  l_a uuid[] := array['535836b8-1423-4d9c-ab38-2ed9c8425d9d','ef02c978-250b-401e-8611-f8ef6fc9b438','0786a996-5334-4d3e-8ff5-87a72512853f']::uuid[];
  l_v uuid := '568e80e6-16e0-4f3d-a11f-d05cba1beafe'; l_t1 uuid := '1d31fd0b-2c21-4813-85df-3331c1ea571c';
  l_t2 uuid := '6a8f812e-6ab5-4b51-9ec0-e5ce6ddf50eb'; l_d uuid := '51e0e9bb-1dbd-4298-ba8d-3848d14d3be7';
  l_x uuid := '18b04569-758e-4bb5-afba-d83849414a03'; l_y uuid := '972e40f0-b054-4b65-b239-23e0a888b06a';
  r jsonb; ev jsonb; antes record; depois record; x uuid; i int; comp text;
  f_ver int; op uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e','role','authenticated')::text, true);

  -- 0) a funcao que calcula: primeira saida e safra da temporada dela
  if (select data_competencia from _oc_competencia_pela_saida(c_fb)) <> date '2020-06-17' then raise exception '0 fb64d4d6 nao e 17/06/2020'; end if;
  if (select safra_id from _oc_competencia_pela_saida(c_fb)) is not null then raise exception '0 fb64d4d6 safra deveria ser nula'; end if;
  if (select data_competencia from _oc_competencia_pela_saida(c_23)) <> date '2025-03-19' then raise exception '0 232c05aa nao e a primeira'; end if;
  if (select count(*) from _oc_competencia_pela_saida('00000000-0000-0000-0000-000000000000')) <> 0 then raise exception '0 OC inexistente devolveu linha'; end if;

  -- A) conta corrente: solta a' mao e religa pelo vincular do Financeiro V2
  update zoo_operacao_partes set cancelada = true, cancelada_em = now(), cancelada_motivo = 'teste 01a'
   where not cancelada and financeiro_lancamento_id = any (l_a || l_v);
  foreach x in array l_a loop
    select * into antes from financeiro_lancamentos_v2 where id = x;
    select versao into f_ver from zoo_operacoes_comerciais where id = c_fb;
    r := oc_vincular_lancamento(c_fb, f_ver, x, null, 'teste 01a', null, null, true, false);
    select * into depois from financeiro_lancamentos_v2 where id = x;
    if (r->>'ok')::boolean is not true then raise exception 'A % recusado: %', left(x::text, 8), r; end if;
    if depois.data_competencia <> date '2020-06-17' then raise exception 'A % competencia %', left(x::text, 8), depois.data_competencia; end if;
    if depois.safra_id is not null then raise exception 'A % safra deveria ser nula', left(x::text, 8); end if;
    if depois.valor <> antes.valor or depois.data_pagamento is distinct from antes.data_pagamento
       or depois.conta_destino_id is distinct from antes.conta_destino_id or depois.conta_bancaria_id is distinct from antes.conta_bancaria_id
       or depois.hash_importacao is distinct from antes.hash_importacao or depois.plano_conta_id is distinct from antes.plano_conta_id
    then raise exception 'A % mexeu em valor/pagamento/banco/hash/conta', left(x::text, 8); end if;
    select e.detalhes into ev from zoo_operacao_eventos e
     where e.acao = 'vincular_recebimento' and e.detalhes->>'lancamento_id' = x::text and e.detalhes->>'motivo' = 'teste 01a';
    if (ev->>'competencia_pela_saida') is distinct from 'true' or (ev->>'competencia_anterior')::date <> antes.data_competencia
       or (ev->>'safra_anterior') is distinct from antes.safra_id::text
    then raise exception 'A % evento sem os anteriores: %', left(x::text, 8), ev; end if;
  end loop;

  -- C) varias saidas: a primeira, e a safra da temporada dela
  select versao into f_ver from zoo_operacoes_comerciais where id = c_23;
  r := oc_vincular_lancamento(c_23, f_ver, l_v, null, 'teste 01a', null, null, true, false);
  select * into depois from financeiro_lancamentos_v2 where id = l_v;
  if depois.data_competencia <> date '2025-03-19' then raise exception 'C competencia %', depois.data_competencia; end if;
  if (select codigo from financeiro_safras where id = depois.safra_id) is distinct from '24/25-Pec' then raise exception 'C safra nao e 24/25'; end if;

  -- B) titulo: ida e volta
  select * into antes from financeiro_lancamentos_v2 where id = l_t1;
  select versao into f_ver from zoo_operacoes_comerciais where id = c_9b;
  r := oc_desvincular_lancamento(c_9b, f_ver, l_t1, 'teste 01a');
  if r->'competencia_restauro'->>'motivo' is distinct from 'sem snapshot' then raise exception 'B1 vinculo antigo: %', r->'competencia_restauro'; end if;
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_t1) <> antes.data_competencia then raise exception 'B1 mexeu na competencia'; end if;
  select versao into f_ver from zoo_operacoes_comerciais where id = c_9b;
  r := oc_vincular_lancamento(c_9b, f_ver, l_t1, 'principal', 'teste 01a', null, null, true, true);
  if (r->'lancamento'->>'competencia_nova')::date <> date '2026-04-15' then raise exception 'B2 simulacao anuncia %', r->'lancamento'; end if;
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_t1) <> antes.data_competencia then raise exception 'B2 simulacao gravou'; end if;
  r := oc_vincular_lancamento(c_9b, f_ver, l_t1, 'principal', 'teste 01a', null, null, true, false);
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_t1) <> date '2026-04-15' then raise exception 'B3 religar nao gravou a saida'; end if;
  select versao into f_ver from zoo_operacoes_comerciais where id = c_9b;
  r := oc_desvincular_lancamento(c_9b, f_ver, l_t1, 'teste 01a');
  select * into depois from financeiro_lancamentos_v2 where id = l_t1;
  if (r->'competencia_restauro'->>'restaurado')::boolean is not true then raise exception 'B4 nao restaurou: %', r->'competencia_restauro'; end if;
  if depois.data_competencia <> antes.data_competencia or depois.safra_id is distinct from antes.safra_id
     or depois.hash_importacao is distinct from antes.hash_importacao or depois.valor <> antes.valor
  then raise exception 'B4 volta errada: % %', depois.data_competencia, depois.safra_id; end if;

  -- B') editado depois do vinculo: a edicao vence
  select versao into f_ver from zoo_operacoes_comerciais where id = c_9b;
  r := oc_desvincular_lancamento(c_9b, f_ver, l_t2, 'teste 01a');
  select versao into f_ver from zoo_operacoes_comerciais where id = c_9b;
  r := oc_vincular_lancamento(c_9b, f_ver, l_t2, 'principal', 'teste 01a', null, null, true, false);
  update financeiro_lancamentos_v2 set data_competencia = '2026-04-20' where id = l_t2;
  select versao into f_ver from zoo_operacoes_comerciais where id = c_9b;
  r := oc_desvincular_lancamento(c_9b, f_ver, l_t2, 'teste 01a');
  if r->'competencia_restauro'->>'motivo' is distinct from 'editado depois do vinculo' then raise exception 'Bx: %', r->'competencia_restauro'; end if;
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_t2) <> date '2026-04-20' then raise exception 'Bx sobrescreveu a edicao'; end if;

  -- D) divergente: manda a saida, nao a data da OC
  select versao into f_ver from zoo_operacoes_comerciais where id = c_02;
  r := oc_desvincular_lancamento(c_02, f_ver, l_d, 'teste 01a');
  select versao into f_ver from zoo_operacoes_comerciais where id = c_02;
  r := oc_vincular_lancamento(c_02, f_ver, l_d, 'principal', 'teste 01a', null, null, true, false);
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_d) <> date '2026-09-01' then raise exception 'D nao foi para a saida'; end if;

  -- E) nao-venda: a data da OC, como antes, sem marca
  for i in 1..2 loop
    op := case i when 1 then c_02 else c_58 end; x := case i when 1 then l_x else l_y end;
    select * into antes from financeiro_lancamentos_v2 where id = x;
    select versao into f_ver from zoo_operacoes_comerciais where id = op;
    r := oc_desvincular_lancamento(op, f_ver, x, 'teste 01a');
    select p.componente into comp from zoo_operacao_partes p where p.financeiro_lancamento_id = x order by p.created_at desc limit 1;
    select versao into f_ver from zoo_operacoes_comerciais where id = op;
    r := oc_vincular_lancamento(op, f_ver, x, comp, 'teste 01a', null, null, true, false);
    select * into depois from financeiro_lancamentos_v2 where id = x;
    if (r->'lancamento'->>'competencia_pela_saida')::boolean is not false then raise exception 'E % marcou pela saida', left(x::text, 8); end if;
    if depois.data_competencia <> (select data_operacao from zoo_operacoes_comerciais where id = op)
       or depois.safra_id is distinct from antes.safra_id
    then raise exception 'E % competencia % safra mudou', left(x::text, 8), depois.data_competencia; end if;
  end loop;

  -- F) boitel: fora da regra — data da OC, safra intocada (nula aqui, para distinguir da sugerida), sem a marca
  if public.fn_safra_sugerida((select cliente_id from zoo_operacoes_comerciais where id = c_2c),
       (select data_operacao from zoo_operacoes_comerciais where id = c_2c), 'pecuaria') is null
  then raise exception 'F sem safra sugerida: o caso nao distingue'; end if;
  update financeiro_lancamentos_v2 set safra_id = null where id = l_b;
  select versao into f_ver from zoo_operacoes_comerciais where id = c_2c;
  r := oc_desvincular_lancamento(c_2c, f_ver, l_b, 'teste 01a');
  select versao into f_ver from zoo_operacoes_comerciais where id = c_2c;
  r := oc_vincular_lancamento(c_2c, f_ver, l_b, 'principal', 'teste 01a', null, null, true, false);
  select * into depois from financeiro_lancamentos_v2 where id = l_b;
  if (r->>'ok')::boolean is not true then raise exception 'F recusado: %', r; end if;
  if (r->'lancamento'->>'competencia_pela_saida')::boolean is not false then raise exception 'F boitel marcou pela saida'; end if;
  if depois.safra_id is not null then raise exception 'F boitel ganhou safra %', depois.safra_id; end if;
  if depois.data_competencia <> (select data_operacao from zoo_operacoes_comerciais where id = c_2c) then raise exception 'F boitel competencia %', depois.data_competencia; end if;

  raise exception 'OK fb64d4d6=17/06/2020 x3 safra nula; varias=19/03/2025 24/25; titulo 15/04 ida e 16/04 volta; editado vence; divergente 01/09; nao-venda intocada; boitel fora';
end $do$;
