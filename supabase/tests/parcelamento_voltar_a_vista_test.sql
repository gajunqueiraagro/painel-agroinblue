-- P74b — VOLTAR PARA À VISTA (migration 20261028112360). Fixture SINTETICA no cliente Teste, os números do caso do P74: um lançamento à vista
-- de saída (R$ 3.284,88, venc. 10/08/2031, "Compra sintetica") parcelado em 4 × 821,22 e voltado; outro igual DIVIDIDO 60/40.
-- Roda como `authenticated` (admin) e TERMINA EM RAISE: nada fica.
-- V5 simular não grava (as 4 seguem vivas) · V1 a volta: o MESMO id com 3.284,88, venc. e descrição originais, sem parcelamento; as 3
-- outras canceladas com "voltou para à vista"; o cadastro cancelado · V2 dividido: 60/40 mantido, as partes somam o valor de volta
-- · V3 parcela paga: a simulação recusa com "A parcela 2/4 já foi paga em 15/10/2031: desfaça o pagamento antes."; gravar levanta
-- · V4 antigo (sem o original guardado): venc. da 1/N e descrição sem a fração
-- Mutação: tirar o `avista_original` do patch derruba V1 (vencimento); cancelar também a 1/N derruba V1; tirar a trava da paga derruba V3.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pa uuid; pb uuid; um uuid; dividido uuid; pago uuid; antigo uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pa from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli)
    and escopo_negocio is distinct from 'administrativo' order by id limit 1;
  select id into pb from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli)
    and escopo_negocio is distinct from 'administrativo' and id <> pa order by id limit 1;
  if faz is null or pa is null or pb is null then raise exception 'fixture: o Teste precisa de fazenda e de duas contas de saída'; end if;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id)
  select c_cli, faz, '-1', '2-Saídas', 3284.88, d, '2031-08-10', '2031-08-10', 'programado', 'realizado', false, pa
    from unnest(array['Compra sintetica', 'Compra sintetica dividida', 'Compra sintetica paga', 'Compra sintetica antiga']) d;
  select id into um from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'Compra sintetica' and data_vencimento = '2031-08-10' order by created_at desc limit 1;
  select id into dividido from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'Compra sintetica dividida' and data_vencimento = '2031-08-10' order by created_at desc limit 1;
  select id into pago from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'Compra sintetica paga' and data_vencimento = '2031-08-10' order by created_at desc limit 1;
  select id into antigo from public.financeiro_lancamentos_v2 where cliente_id = c_cli and descricao = 'Compra sintetica antiga' and data_vencimento = '2031-08-10' order by created_at desc limit 1;
  perform set_config('teste.ids', concat_ws(',', um, dividido, pago, antigo, pa, pb, faz), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids text[] := string_to_array(current_setting('teste.ids'), ',');
  um uuid := ids[1]; dividido uuid := ids[2]; pago uuid := ids[3]; antigo uuid := ids[4]; pa uuid := ids[5]; pb uuid := ids[6]; faz uuid := ids[7];
  payload jsonb; r jsonb; fin uuid; l record; t text; n int;
  quatro constant jsonb := '[{"numero":1,"data_vencimento":"2031-09-10","valor":821.22},{"numero":2,"data_vencimento":"2031-10-10","valor":821.22},
                             {"numero":3,"data_vencimento":"2031-11-10","valor":821.22},{"numero":4,"data_vencimento":"2031-12-10","valor":821.22}]';
begin
  payload := jsonb_build_object('cliente_id', c_cli, 'fazenda_id', faz, 'descricao', 'Compra sintetica', 'valor_total', 3284.88,
    'data_competencia', '2031-08-10', 'tipo_operacao', '2-Saídas', 'plano_conta_id', pa, 'tipo_financiamento', null, 'parcelas', quatro);

  -- V5 + V1: o caso do P74
  fin := (public.fn_parcelamento_a_partir_do_lancamento(um, payload, false)->>'financiamento_id')::uuid;
  r := public.fn_parcelamento_voltar_a_vista(fin, true);
  if not (r->>'ok')::boolean or (r->>'valor')::numeric <> 3284.88 or (r->>'canceladas')::int <> 3 then raise exception 'V5 simulação: %', r; end if;
  select count(*) into n from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
   where q.financiamento_id = fin and q.status <> 'cancelado' and not x.cancelado;
  if n <> 4 then raise exception 'V5: a simulação gravou (% vivas)', n; end if;
  r := public.fn_parcelamento_voltar_a_vista(fin, false);
  select * into l from public.financeiro_lancamentos_v2 where id = um;
  if l.valor <> 3284.88 or l.data_vencimento <> '2031-08-10' or l.descricao <> 'Compra sintetica' or l.financiamento_id is not null or l.cancelado
    then raise exception 'V1 o lançamento: % % % % %', l.valor, l.data_vencimento, l.descricao, l.financiamento_id, l.cancelado; end if;
  select string_agg(format('%s:%s', q.numero_parcela, coalesce(x.cancelado_motivo, '-')), ' ' order by q.numero_parcela) into t
    from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id where q.financiamento_id = fin and x.id <> um;
  if t is distinct from '2:voltou para à vista 3:voltou para à vista 4:voltou para à vista' then raise exception 'V1 as canceladas: %', t; end if;
  if (select count(*) from public.financeiro_lancamentos_v2 x join public.financiamento_parcelas q on q.lancamento_id = x.id
       where q.financiamento_id = fin and x.id <> um and x.cancelado) <> 3 then raise exception 'V1: as 3 não estão canceladas'; end if;
  if (select status from public.financiamentos where id = fin) <> 'cancelado' then raise exception 'V1: o cadastro não ficou cancelado'; end if;

  -- V2: dividido 60/40
  perform public.fn_lancamento_dividir(dividido, jsonb_build_array(jsonb_build_object('plano_conta_id', pa, 'percentual', 60),
    jsonb_build_object('plano_conta_id', pb, 'percentual', 40)), 'fixture P74b', false);
  fin := (public.fn_parcelamento_a_partir_do_lancamento(dividido, payload, false)->>'financiamento_id')::uuid;
  r := public.fn_parcelamento_voltar_a_vista(fin, false);
  select string_agg(format('%s=%s:%s', case p.plano_conta_id when pa then 'A' when pb then 'B' end, round(p.percentual), p.valor), ',' order by p.ordem) into t
    from public.financeiro_lancamento_partes p where p.lancamento_id = dividido;
  if t is distinct from 'A=60:1970.93,B=40:1313.95' then raise exception 'V2 as partes: %', t; end if;
  if not (select classificacao_dividida from public.financeiro_lancamentos_v2 where id = dividido) then raise exception 'V2: deixou de ser dividido'; end if;

  -- V3: a parcela 2 paga
  fin := (public.fn_parcelamento_a_partir_do_lancamento(pago, payload, false)->>'financiamento_id')::uuid;
  update public.financeiro_lancamentos_v2 x set status_transacao = 'realizado', data_pagamento = '2031-10-15'
    from public.financiamento_parcelas q where q.financiamento_id = fin and q.numero_parcela = 2 and x.id = q.lancamento_id;
  r := public.fn_parcelamento_voltar_a_vista(fin, true);
  if (r->>'ok')::boolean or r->'recusa'->>'frase' is distinct from 'A parcela 2/4 já foi paga em 15/10/2031: desfaça o pagamento antes.' then raise exception 'V3: %', r; end if;
  begin
    perform public.fn_parcelamento_voltar_a_vista(fin, false);
    raise exception 'V3: gravou com a parcela paga';
  exception when sqlstate '22023' then null;
  end;

  -- V4: o antigo, sem o original guardado (o cadastro de antes do P74b)
  fin := (public.fn_parcelamento_a_partir_do_lancamento(antigo, payload, false)->>'financiamento_id')::uuid;
  update public.financiamentos set avista_original = null where id = fin;
  r := public.fn_parcelamento_voltar_a_vista(fin, false);
  select * into l from public.financeiro_lancamentos_v2 where id = antigo;
  if l.valor <> 3284.88 or l.data_vencimento <> '2031-09-10' or l.descricao <> 'Compra sintetica' or (r->>'original_guardado')::boolean
    then raise exception 'V4: % % % %', l.valor, l.data_vencimento, l.descricao, r->>'original_guardado'; end if;
  raise exception 'OK parcelamento_voltar_a_vista (V1–V5)';
end $teste$;
rollback;
