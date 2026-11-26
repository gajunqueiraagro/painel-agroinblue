-- FOLHA-TELAS-03 (Gabriel 25/11/2026: D1 a, D2 a, D3 a; mock MDj3uBiVv1ez5SFtBP7hEn) — a Folha do mês confirma e a aba Férias lê.
--   (1) fn_folha_mes_confirmar(cliente, competência, tipo, simular): relê fn_folha_mes e só confirma quando TUDO bate (toda linha
--       "confere" ou "criado pelo recibo"; nada falta de lançamento, ligar, recibo ou vínculo — o PAGAMENTO não trava: a folha se confirma
--       antes de pagar). Grava folha_folhas 'confirmada' (cria a linha do mês se não existe) com trilha. O reabrir é o fn_folha_reabrir.
--   (2) fn_folha_mes ganha a chave 'folha' (id, situação, confirmada_em) — a tela mostra "confirmada" e o Reabrir. Nada mais muda nela.
--   (3) fn_folha_ferias_lista(cliente, hoje = nulo): um funcionário ativo/afastado por linha — o período de férias da ESCALA do contador
--       (folha_ferias_periodos, o mais antigo com saldo); sem escala, PELA ADMISSÃO (o último período fechado, "tirou" desconhecido = nulo;
--       origem 'admissao'). E as PROVISÕES (sem encargos): férias = salário vigente × 4/3 × (avos do período em curso ÷ 12 + o que está
--       fechado e não tirado: saldo da escala ÷ 30, ou o último período inteiro pela admissão); 13º = salário × avos do ano ÷ 12 − o 13º
--       já pago no ano (lançamentos realizados ligados ao funcionário). Avo = mês, ou fração de 15 dias ou mais (CLT).
--   (4) _fn_folha_avos(de, até): os avos entre duas datas (interna).
-- Nenhum dado de cliente é alterado. Corpo grande: patch guardado por md5 (a âncora casa 1 vez). DESFAZER: recriar fn_folha_mes com o
-- texto de antes (md5 guardado aqui) e drop das 3 funções novas.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public._fn_folha_avos(p_de date, p_ate date) returns int
language plpgsql immutable set search_path = public as $f$
declare d interval;
begin
  if p_de is null or p_ate is null or p_ate < p_de then return 0; end if;
  d := age(p_ate + 1, p_de);
  return (extract(year from d) * 12 + extract(month from d))::int + case when extract(day from d) >= 15 then 1 else 0 end;
end $f$;
revoke all on function public._fn_folha_avos(date, date) from public, anon, authenticated;

do $p$
declare
  g text := pg_get_functiondef('public.fn_folha_mes(uuid,text,text)'::regprocedure);
  a text := $a$'competencia', p_competencia, 'tipo', p_tipo,$a$;
  an text := $a$'competencia', p_competencia, 'tipo', p_tipo,
    'folha', (select jsonb_build_object('id', ff.id, 'situacao', ff.situacao, 'confirmada_em', ff.confirmada_em)
                from folha_folhas ff where ff.cliente_id = p_cliente and ff.competencia = p_competencia and ff.tipo = p_tipo and ff.cancelado_em is null),$a$;
begin
  if md5(g) <> 'ae931545388687e9e720a8943fe74641' then
    raise exception 'FOLHA-TELAS-03: o fn_folha_mes de hoje não é o medido (md5): nada gravado.';
  end if;
  if (length(g) - length(replace(g, a, ''))) / length(a) <> 1 then
    raise exception 'FOLHA-TELAS-03: a âncora do fn_folha_mes não casa 1 vez: nada gravado.';
  end if;
  execute replace(g, a, an);
end $p$;

create or replace function public.fn_folha_mes_confirmar(p_cliente uuid, p_competencia text, p_tipo text, p_simular boolean) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare v jsonb; fo public.folha_folhas; v_n int; v_ruins int; v_frase text; v_antes text;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_simular is null or coalesce(p_competencia, '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or coalesce(p_tipo, '') not in ('mensal', '13_1', '13_2') then
    raise exception 'Folha do mês: pedido inválido.' using errcode = '22023';
  end if;
  select * into fo from folha_folhas where cliente_id = p_cliente and competencia = p_competencia and tipo = p_tipo and cancelado_em is null for update;
  if found and fo.situacao = 'confirmada' then
    raise exception 'A folha de % já está confirmada.', p_competencia using errcode = 'P0001';
  end if;
  v := fn_folha_mes(p_cliente, p_competencia, p_tipo);
  v_n := jsonb_array_length(v->'linhas');
  if v_n = 0 then raise exception 'A folha de % está vazia.', p_competencia using errcode = 'P0001'; end if;
  select count(*) into v_ruins from jsonb_array_elements(v->'linhas') l
   where l->>'situacao_folha' not in ('confere', 'criado_pelo_recibo') or (l->'falta') ?| array['lancamento', 'ligar', 'recibo', 'vinculo'];
  if v_ruins > 0 then
    v_frase := concat_ws(' · ',
      nullif(format('%s sem recibo', v->'totais'->>'sem_recibo'), '0 sem recibo'), nullif(format('%s com diferença', v->'totais'->>'diferencas'), '0 com diferença'),
      nullif(format('%s a conferir', v->'totais'->>'a_conferir'), '0 a conferir'), nullif(format('%s sem previsto', v->'totais'->>'sem_previsto'), '0 sem previsto'),
      nullif(format('%s a ligar', v->'totais'->>'a_ligar'), '0 a ligar'));
    raise exception 'A folha ainda não bate (% de % pessoas): %.', v_ruins, v_n, coalesce(nullif(v_frase, ''), 'confira o que falta') using errcode = 'P0001';
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'pessoas', v_n, 'previsto', v->'totais'->'previsto', 'recibo', v->'totais'->'recibo', 'folha_existe', fo.id is not null);
  end if;
  v_antes := coalesce(fo.situacao, 'nova');
  if fo.id is null then
    insert into folha_folhas (cliente_id, competencia, tipo, situacao, confirmada_por, confirmada_em, criado_por, atualizado_por)
    values (p_cliente, p_competencia, p_tipo, 'confirmada', auth.uid(), now(), auth.uid(), auth.uid()) returning * into fo;
    perform _fn_folha_trilha(p_cliente, 'folha_folhas', fo.id, 'criar', null, jsonb_build_object('competencia', p_competencia, 'tipo', p_tipo, 'origem', 'folha_do_mes'), null);
  else
    update folha_folhas set situacao = 'confirmada', confirmada_por = auth.uid(), confirmada_em = now(), atualizado_por = auth.uid(), atualizado_em = now() where id = fo.id;
  end if;
  perform _fn_folha_trilha(p_cliente, 'folha_folhas', fo.id, 'confirmar', jsonb_build_object('situacao', v_antes),
    jsonb_build_object('situacao', 'confirmada', 'origem', 'folha_do_mes', 'pessoas', v_n, 'previsto', v->'totais'->'previsto', 'recibo', v->'totais'->'recibo'), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'folha_id', fo.id, 'pessoas', v_n, 'recibo', v->'totais'->'recibo');
end $f$;
revoke all on function public.fn_folha_mes_confirmar(uuid, text, text, boolean) from public, anon;
grant execute on function public.fn_folha_mes_confirmar(uuid, text, text, boolean) to authenticated;

-- p_hoje: a data de referência (nula = hoje); o teste a fixa para as contas não dependerem do dia em que roda
create or replace function public.fn_folha_ferias_lista(p_cliente uuid, p_hoje date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare v jsonb; hoje date := coalesce(p_hoje, current_date); jan1 date := make_date(extract(year from coalesce(p_hoje, current_date))::int, 1, 1);
begin
  perform _fn_folha_exigir(p_cliente);
  with
  f as materialized (select * from folha_funcionarios where cliente_id = p_cliente and situacao <> 'desligado'),
  sal as (select f.id fid, (select round(s.salario * s.parte_pct / 100, 2) from folha_funcionario_salarios s
                              where s.funcionario_id = f.id and s.desde <= hoje order by s.desde desc limit 1) s from f),
  esc as (select p.* from folha_ferias_periodos p join f on f.id = p.funcionario_id),
  -- a escala: o período mais antigo com saldo; sem saldo, o mais recente
  esc_lin as (select distinct on (e.funcionario_id) e.funcionario_id fid, e.aquisitivo_inicio ini, e.aquisitivo_fim fim,
                     coalesce(e.ultimo_prazo, (e.aquisitivo_fim + interval '12 months')::date) ate, e.dias_pagos tirou, e.saldo_dias saldo
                from esc e order by e.funcionario_id, (e.saldo_dias > 0) desc, case when e.saldo_dias > 0 then e.aquisitivo_inicio end, e.aquisitivo_inicio desc),
  esc_aberto as (select e.funcionario_id fid, sum(e.saldo_dias) filter (where e.aquisitivo_fim < hoje) saldo_fechado, max(e.aquisitivo_fim) ultimo_fim
                   from esc e group by e.funcionario_id),
  -- pela admissão: anos completos; o último período fechado e o período em curso
  adm as (select f.id fid, f.admissao, case when f.admissao is null then null when f.admissao > hoje then 0 else extract(year from age(hoje, f.admissao))::int end n from f),
  pag13 as (select l.funcionario_id fid, round(sum(abs(l.valor)), 2) pago
              from financeiro_lancamentos_v2 l left join financeiro_plano_contas pc on pc.id = l.plano_conta_id
             where l.cliente_id = p_cliente and l.funcionario_id in (select id from f) and not coalesce(l.cancelado, false) and l.status_transacao = 'realizado'
               and l.data_competencia >= jan1 and l.data_competencia < (jan1 + interval '1 year')::date and _fn_folha_tipo(l.descricao, pc.subcentro) = '13º'
             group by l.funcionario_id),
  linha as (
    select f.id, f.nome, f.admissao, f.situacao, sa.s salario, coalesce(p13.pago, 0) pago13,
           case when el.fid is not null then 'escala' when a.n is not null then 'admissao' end origem,
           coalesce(el.ini, case when a.n >= 1 then (a.admissao + make_interval(years => a.n - 1))::date when a.n = 0 then a.admissao end) ini,
           coalesce(el.fim, case when a.n is not null then (a.admissao + make_interval(years => greatest(a.n, 1)) - interval '1 day')::date end) fim,
           coalesce(el.ate, case when a.n >= 1 then (a.admissao + make_interval(years => a.n + 1) - interval '1 day')::date end) ate,
           el.tirou, el.saldo,
           -- o início do período EM CURSO (o que ainda está sendo ganho)
           coalesce(case when a.n is not null then (a.admissao + make_interval(years => a.n))::date end, ea.ultimo_fim + 1) ini_atual,
           -- o que já fechou e não foi tirado, em períodos de 30 dias
           case when el.fid is not null then coalesce(ea.saldo_fechado, 0) / 30.0 when a.n >= 1 then 1 else 0 end fechado_aberto,
           a.n
      from f left join sal sa on sa.fid = f.id left join esc_lin el on el.fid = f.id left join esc_aberto ea on ea.fid = f.id
      left join adm a on a.fid = f.id left join pag13 p13 on p13.fid = f.id),
  calc as (
    select x.*,
           case when x.origem is null then 'sem_admissao'
                when x.origem = 'admissao' and x.n = 0 then 'ganhando'
                when x.origem = 'escala' and x.saldo = 0 then 'tirou'
                when x.ate < hoje then 'vencida'
                when x.ate <= hoje + 90 then 'vence'
                else 'a_tirar' end sit,
           least(12, _fn_folha_avos(x.ini_atual, hoje)) avos_ferias,
           case when x.admissao is null then null else least(12, _fn_folha_avos(greatest(x.admissao, jan1), hoje)) end avos_13
      from linha x),
  prov as (
    select c.*,
           case when c.salario is null or c.origem is null then null
                else round(c.salario * 4 / 3.0 * (c.avos_ferias / 12.0 + c.fechado_aberto), 2) end prov_ferias,
           case when c.salario is null or c.avos_13 is null then null
                else greatest(0, round(c.salario * c.avos_13 / 12.0 - c.pago13, 2)) end prov_13
      from calc c)
  select jsonb_build_object(
    'hoje', hoje,
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'funcionario_id', p.id, 'nome', p.nome, 'admissao', p.admissao, 'situacao', p.situacao, 'origem', p.origem,
        'aquisitivo_inicio', p.ini, 'aquisitivo_fim', p.fim, 'tirar_ate', p.ate, 'dias', p.ate - hoje, 'direito', case when p.origem is not null then 30 end,
        'tirou', p.tirou, 'saldo', p.saldo, 'situacao_ferias', p.sit, 'avos_em_curso', p.avos_ferias,
        'salario', p.salario, 'provisao_ferias', p.prov_ferias, 'provisao_13', p.prov_13, 'pago_13', p.pago13)
        order by case p.sit when 'vencida' then 0 when 'vence' then 1 else 2 end, p.ate nulls last, p.nome, p.id) from prov p), '[]'::jsonb),
    'totais', (select jsonb_build_object('pessoas', count(*), 'vencidas', count(*) filter (where p.sit = 'vencida'), 'vence_90', count(*) filter (where p.sit = 'vence'),
                 'pela_admissao', count(*) filter (where p.origem = 'admissao'), 'pela_escala', count(*) filter (where p.origem = 'escala'),
                 'sem_admissao', count(*) filter (where p.origem is null), 'sem_salario', count(*) filter (where p.salario is null),
                 'provisao_ferias', round(sum(p.prov_ferias), 2), 'provisao_13', round(sum(p.prov_13), 2)) from prov p))
    into v;
  return v;
end $f$;
revoke all on function public.fn_folha_ferias_lista(uuid, date) from public, anon;
grant execute on function public.fn_folha_ferias_lista(uuid, date) to authenticated;
