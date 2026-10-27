-- P96a — JUNTAR LANÇAMENTOS SOLTOS (migration 20261028112370). Fixture SINTETICA no cliente Teste com os números do caso da NF 46.994: seis
-- "Tinta sintetica - k/6" no mesmo fornecedor (620,85 · 620,80 · 4 × 620,83 = 3.724,97), cinco pagas e a 6/6 agendada, inseridas FORA da
-- ordem; competências como no caso (três já no mês da nota, as outras no vencimento); safras 31/32 (uma errada, 30/31). Outro conjunto
-- para as recusas. Roda como `authenticated` (admin) e TERMINA EM RAISE: nada fica.
-- J1 simular não grava; o efeito por mês com a opção da competência (+1.862,48 / 3 no mês novo, −1 em cada um dos três)
-- J2 gravar com a competência: os mesmos ids, valor, vencimento, status e descrição; a ordem pelo vencimento; competência e safra novas;
--    o cadastro com a SOMA REAL (3.724,97), 6 parcelas, 5 pagas · J3 juntar de novo recusa ("já é parcela")
-- J4 a volta para à vista e o cancelar a compra recusam a junção (a do cancelar diz o caminho: "junta 6 (5 pagos)… Desfazer a junção") · J5 desfazer: os seis soltos, competência/safra de volta (a mexida
--    depois fica), nenhum cancelado, o cadastro cancelado · J6 juntar sem a opção: a competência não muda
-- J7 recusas: fornecedores diferentes, um só, cancelado, mês fechado (de onde sai)
-- Mutação: tirar a competência do UPDATE derruba J2; tirar a trava da junção na volta derruba J4; ordenar por id derruba J2 (ordem).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; f1 uuid; f2 uuid; s30 uuid; s31 uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria'
    and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into f1 from public.financeiro_fornecedores where cliente_id = c_cli and ativo order by id limit 1;
  select id into f2 from public.financeiro_fornecedores where cliente_id = c_cli and ativo and id <> f1 order by id limit 1;
  if faz is null or pl is null or f1 is null or f2 is null then raise exception 'fixture: o Teste precisa de fazenda, conta pecuária de saída e dois fornecedores'; end if;
  insert into public.financeiro_safras (cliente_id, nome, codigo, escopo_negocio, data_inicio, data_fim, ativa)
  values (c_cli, 'Sintetica 30/31', '30/31-Pec', 'pecuaria', '2030-07-01', '2031-06-30', true),
         (c_cli, 'Sintetica 31/32', '31/32-Pec', 'pecuaria', '2031-07-01', '2032-06-30', true);
  select id into s30 from public.financeiro_safras where cliente_id = c_cli and codigo = '30/31-Pec';
  select id into s31 from public.financeiro_safras where cliente_id = c_cli and codigo = '31/32-Pec';
  /* A: as seis, fora da ordem (k, valor, vencimento, competência, safra, status) */
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      data_pagamento, status_transacao, cenario, cancelado, plano_conta_id, favorecido_id, safra_id)
  select c_cli, faz, '-1', '2-Saídas', v, format('Tinta sintetica - %s/6', k), comp, venc, case when k < 6 then venc end,
         case when k < 6 then 'realizado' else 'agendado' end, 'realizado', false, pl, f1, case when k = 3 then s30 else s31 end
    from (values (4, 620.83, '2031-07-06'::date, '2031-11-10'::date), (1, 620.85, '2031-08-10', '2031-08-10'), (6, 620.83, '2032-01-10', '2032-01-10'),
                 (2, 620.80, '2031-09-10', '2031-09-10'), (5, 620.83, '2031-07-06', '2031-12-10'), (3, 620.83, '2031-07-06', '2031-10-10')) x(k, v, comp, venc);
  /* B: as recusas — B1/B2 em março de 2033 (mês FECHADO), B3 de outro fornecedor, B4 cancelado */
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id, favorecido_id)
  select c_cli, faz, '-1', '2-Saídas', 100, format('Recusa sintetica B%s', k), '2033-03-05', '2033-03-05', 'programado', 'realizado', k = 4, pl,
         case when k = 3 then f2 else f1 end
    from generate_series(1, 4) k;
  insert into public.financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento) values (c_cli, faz, '2033-03', 'fechado');
  perform set_config('teste.ids', concat_ws(',', s30, s31,
    (select string_agg(id::text, ';' order by descricao) from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao like 'Tinta sintetica - _/6' and data_vencimento > '2031-01-01'),
    (select string_agg(id::text, ';' order by descricao) from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao like 'Recusa sintetica B_' and data_vencimento = '2033-03-05')), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids text[] := string_to_array(current_setting('teste.ids'), ',');
  s30 uuid := ids[1]; s31 uuid := ids[2];
  a uuid[] := string_to_array(ids[3], ';')::uuid[];   -- a[k] = a parcela k/6 (pela descrição)
  b uuid[] := string_to_array(ids[4], ';')::uuid[];
  r jsonb; fin uuid; t text; n int;
  antes text; depois text;
  c_retrato constant text := $q$select string_agg(format('%s|%s|%s|%s|%s', l.valor, l.data_vencimento, l.status_transacao, l.descricao, l.cancelado), ' ' order by l.descricao)
                               from public.financeiro_lancamentos_v2 l where l.id = any ($1)$q$;
begin
  execute c_retrato using a into antes;

  -- J1 simular não grava; o efeito por mês
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, a, '2031-07-06', true);
  if not (r->>'ok')::boolean or (r->>'parcelas')::int <> 6 or (r->>'soma')::numeric <> 3724.97 or r->>'descricao' <> 'Tinta sintetica' then raise exception 'J1: %', r; end if;
  select string_agg(format('%s:%s:%s', e->>'mes', e->>'valor', e->>'parcelas'), ' ' order by e->>'mes') into t from jsonb_array_elements(r->'efeito_por_mes') e;
  if t is distinct from '2031-07:1862.48:3 2031-08:-620.85:-1 2031-09:-620.80:-1 2032-01:-620.83:-1' then raise exception 'J1 efeito: %', t; end if;
  if r->>'safra_nova_codigo' is distinct from '31/32-Pec' then raise exception 'J1 safra: %', r->>'safra_nova_codigo'; end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 where id = any (a) and financiamento_id is not null) then raise exception 'J1: a simulação gravou'; end if;

  -- J2 gravar com a competência
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, a, '2031-07-06', false);
  fin := (r->>'financiamento_id')::uuid;
  if fin is null then raise exception 'J2: %', r; end if;
  execute c_retrato using a into depois;
  if depois is distinct from antes then raise exception 'J2 mudou o dinheiro: % -> %', antes, depois; end if;
  select string_agg(format('%s=%s', q.numero_parcela, right(l.descricao, 3)), ' ' order by q.numero_parcela) into t
    from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = fin;
  if t is distinct from '1=1/6 2=2/6 3=3/6 4=4/6 5=5/6 6=6/6' then raise exception 'J2 a ordem: %', t; end if;
  if (select count(*) from public.financeiro_lancamentos_v2 where id = any (a) and financiamento_id = fin and origem_tipo = 'parcela_principal'
        and data_competencia = '2031-07-06' and safra_id = s31) <> 6 then raise exception 'J2: competência/safra/elo não estão nas seis'; end if;
  select format('%s %s %s %s', f.valor_total, f.total_parcelas, f.status, jsonb_array_length(f.juncao_original->'lancamentos')) into t from public.financiamentos f where f.id = fin;
  if t is distinct from '3724.97 6 ativo 6' then raise exception 'J2 o cadastro: %', t; end if;
  select string_agg(q.status, ',' order by q.numero_parcela) into t from public.financiamento_parcelas q where q.financiamento_id = fin;
  if t is distinct from 'pago,pago,pago,pago,pago,pendente' then raise exception 'J2 as parcelas: %', t; end if;

  -- J3 de novo: já é parcela
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, a, null, true);
  if (r->>'ok')::boolean or r->'recusa'->>'motivo' <> 'ja_parcela' then raise exception 'J3: %', r; end if;

  -- J4 a volta para à vista e o cancelar a compra recusam
  r := public.fn_parcelamento_voltar_a_vista(fin, true);
  if (r->>'ok')::boolean or r->'recusa'->>'motivo' is distinct from 'juncao' then raise exception 'J4 volta: %', r; end if;
  begin perform public.fn_parcelamento_voltar_a_vista(fin, false); raise exception 'J4: a volta gravou';
  exception when sqlstate '22023' then null; end;
  r := public.fn_parcelamento_excluir(fin, null, true);
  if (r->>'ok')::boolean or r->'recusa'->>'motivo' is distinct from 'juncao'
     or r->'recusa'->>'frase' is distinct from 'Esta compra junta 6 lançamentos (5 pagos). Para excluir, primeiro use "Desfazer a junção".' then raise exception 'J4 excluir: %', r; end if;
  begin perform public.fn_parcelamento_excluir(fin, 'teste', false); raise exception 'J4: o excluir gravou';
  exception when sqlstate '22023' then
    if sqlerrm is distinct from 'Esta compra junta 6 lançamentos (5 pagos). Para excluir, primeiro use "Desfazer a junção". Nada foi gravado.' then raise exception 'J4 excluir gravar: %', sqlerrm; end if;
  end;

  -- J5 desfazer (a 6/6 tem a competência mexida depois da junção: fica)
  update public.financeiro_lancamentos_v2 set data_competencia = '2031-12-01' where id = a[6];
  r := public.fn_parcelamento_desfazer_juncao(fin, true);
  if not (r->>'ok')::boolean or exists (select 1 from public.financeiro_lancamentos_v2 where id = any (a) and financiamento_id is null) then raise exception 'J5 simular: %', r; end if;
  r := public.fn_parcelamento_desfazer_juncao(fin, false);
  if (r->>'competencia_volta')::int <> 5 or (r->>'competencia_mantida')::int <> 1 then raise exception 'J5 contagem: %', r; end if;
  select string_agg(format('%s:%s:%s', right(descricao, 3), data_competencia, case safra_id when s30 then '30' when s31 then '31' end), ' ' order by descricao) into t
    from public.financeiro_lancamentos_v2 where id = any (a) and financiamento_id is null and origem_tipo is null and not cancelado;
  if t is distinct from '1/6:2031-08-10:31 2/6:2031-09-10:31 3/6:2031-07-06:30 4/6:2031-07-06:31 5/6:2031-07-06:31 6/6:2031-12-01:31' then raise exception 'J5: %', t; end if;
  if (select status from public.financiamentos where id = fin) <> 'cancelado' then raise exception 'J5: o cadastro não ficou cancelado'; end if;

  -- J6 sem a opção: a competência não muda
  update public.financeiro_lancamentos_v2 set data_competencia = '2032-01-10' where id = a[6];
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, a, null, false);
  select string_agg(data_competencia::text, ',' order by descricao) into t from public.financeiro_lancamentos_v2 where id = any (a) and financiamento_id = (r->>'financiamento_id')::uuid;
  if t is distinct from '2031-08-10,2031-09-10,2031-07-06,2031-07-06,2031-07-06,2032-01-10' or jsonb_array_length(r->'efeito_por_mes') <> 0 then raise exception 'J6: % %', t, r->'efeito_por_mes'; end if;

  -- J7 recusas
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, array[b[1], b[3]], null, true);
  if r->'recusa'->>'motivo' is distinct from 'fornecedores' then raise exception 'J7 fornecedores: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, array[b[1]], null, true);
  if r->'recusa'->>'motivo' is distinct from 'quantidade' then raise exception 'J7 um só: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, array[b[1], b[4]], null, true);
  if r->'recusa'->>'frase' is distinct from 'O lançamento «Recusa sintetica B4» está cancelado.' then raise exception 'J7 cancelado: %', r; end if;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, array[b[1], b[2]], '2033-04-01', true);
  if r->'recusa'->>'frase' is distinct from 'O mês 03/2033 está fechado: reabra antes de mudar a competência.' then raise exception 'J7 mês fechado: %', r; end if;
  begin perform public.fn_parcelamento_juntar_lancamentos(c_cli, array[b[1], b[2]], '2033-04-01', false); raise exception 'J7: gravou no mês fechado';
  exception when sqlstate '22023' then null; end;
  r := public.fn_parcelamento_juntar_lancamentos(c_cli, array[b[1], b[2]], null, true);
  if not (r->>'ok')::boolean then raise exception 'J7 sem a opção (o mês fechado não muda): %', r; end if;
  raise exception 'OK parcelamento_juntar_lancamentos (J1–J7)';
end $teste$;
rollback;
