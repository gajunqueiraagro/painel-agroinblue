-- FOLHA-01 · PR C (banco) — a Folha do mês, o recibo do contador em folha_documentos (13º E mensal) e as férias
-- (Gabriel 22/11/2026: D-C1 a D-C5 = 'a'; FASE 0 em folha-20261121-1248-FOLHA-01-PR-C-FASE0.md).
-- O QUE FAZ:
--   1. O TIPO do pagamento vira UMA função (`_fn_folha_tipo`, o CASE da fn_folha_historico movido verbatim); o Histórico, a Folha do
--      mês, as pendências e o recibo leem dela.
--   2. FOLHA DO MÊS (D-C1 a): `fn_folha_mes(cliente, competência, tipo mensal|13_1|13_2)` — leitura DERIVADA dos lançamentos ligados
--      (e, sem ligação, pelo favorecido do funcionário: "ligar" no que falta) + os recibos vivos em folha_documentos. Previsto = o valor
--      do lançamento ANTES do recibo (a trilha do registro do recibo), Recibo = o líquido do recibo, Diferença, situação, o que falta,
--      férias; faixa de 4 documentos; calendário de 5 obrigações (D-C3 a: salário no 5º dia útil — sábado conta, CLT art. 459; FGTS e
--      INSS no dia 20, antecipam para o dia útil bancário anterior; 13º 30/11 e 20/12; férias = o último prazo da escala; com a guia em
--      folha_guias, data e valor vêm dela). SEM TABELA DE FERIADOS: feriado não é pulado (declarado). folha_folhas segue vazia (PR D).
--   3. RECIBO (D-C2 a, D-C5 a): `fn_folha_recibos_aplicar` aceita também o MENSAL (holerite); casa pelo FUNCIONÁRIO (nome do recibo →
--      um funcionário → o lançamento ligado da competência); só sem lançamento ligado vai pelo nome do favorecido. O arquivo vira UM
--      registro em folha_documentos (espécie recibo_13 | holerite, com funcionário + lançamento; caminho `<cliente>/<md5>-p<página>.pdf`
--      no bucket folha-documentos; a regra devolve os caminhos e a Caixa sobe DEPOIS, como a política do bucket exige). A trilha do
--      registro guarda o valor de antes e o do recibo. Nunca mais em financeiro_lancamento_documentos. `fn_folha_recibos_desfazer`
--      cancela também esses registros (nunca apaga).
--   4. FÉRIAS (D-C4 a): a ficha ganha `ferias` (os períodos da escala; vazio = "—"); pendência nova `ferias_vence` (saldo > 0 e último
--      prazo em até 60 dias), descartável (a chave 'ferias:' entra no check e na fn_folha_pendencia_descartar).
--   5. A pendência "sem recibo" vale também para o holerite do mês (a competência já tem holerite e este lançamento ligado não tem).
-- NÃO FAZ: não muda nenhum lançamento, funcionário, documento ou descarte existente (0 documentos, 0 férias, 0 guias hoje); não escreve
--   folha_folhas/folha_pessoas (PR D); não toca financeiro_lancamento_documentos (0 recibos lá).
-- DESFAZER: drop function fn_folha_mes(uuid,text,text), _fn_folha_dia_util_ate(date,boolean), _fn_folha_quinto_dia_util(date);
--   recriar da 118420 fn_folha_historico, fn_folha_funcionario_ficha, fn_folha_pendencias, fn_folha_pendencia_descartar e o check
--   folha_pendencias_descartes_chave_check (sem 'ferias'; antes, desfazer os descartes 'ferias:'); recriar da 118380
--   fn_folha_recibos_aplicar e fn_folha_recibos_desfazer; por último drop function _fn_folha_tipo(text,text).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $pre$ begin
  if to_regprocedure('public.fn_folha_pendencias(uuid)') is null or to_regprocedure('public.fn_folha_recibos_aplicar(uuid,uuid,jsonb,jsonb,boolean)') is null then
    raise exception 'PR C: aplique a 118380 e a 118420 antes.';
  end if;
  if to_regprocedure('public.fn_folha_mes(uuid,text,text)') is not null or to_regprocedure('public._fn_folha_tipo(text,text)') is not null then
    raise exception 'PR C: já aplicado (fn_folha_mes existe).';
  end if;
end $pre$;

-- ═══ 1. o tipo do pagamento: uma regra só (o CASE da fn_folha_historico, 118420, movido; l.descricao → p_descricao, l.sub → p_subcentro)
create function public._fn_folha_tipo(p_descricao text, p_subcentro text)
returns text language sql immutable set search_path = public as $$
  select case
        when p_descricao ilike '13%sal%' or p_descricao ilike '%13º%' or p_descricao ilike '%décimo terceiro%' then '13º'
        when p_subcentro ilike 'Rescisões e Acertos%' and p_descricao ilike '%multa%' then 'Multa rescisória'
        when p_subcentro ilike 'Rescisões e Acertos%' then 'Rescisão'
        when p_descricao ilike '%férias%' or p_descricao ilike '%ferias%' then 'Férias'
        when p_descricao ilike '%adiant%' then 'Adiantamento'
        when p_subcentro ilike 'Benefícios e Premiações%' then 'Benefício'
        when p_subcentro ilike 'Salários e Encargos%' or p_subcentro is null then 'Salário'
        else 'Outro' end
$$;
revoke all on function public._fn_folha_tipo(text, text) from public, anon, authenticated;

-- os dias úteis do calendário (sem tabela de feriados: feriado não é pulado)
-- o 5º dia útil do mês de p_mes: sábado conta (CLT art. 459 § 1º e a orientação do MTE), domingo não
create function public._fn_folha_quinto_dia_util(p_mes date)
returns date language sql immutable set search_path = public as $$
  select d::date from generate_series(date_trunc('month', p_mes::timestamp), date_trunc('month', p_mes::timestamp) + interval '1 month - 1 day', interval '1 day') d
   where extract(isodow from d) <> 7 order by d offset 4 limit 1
$$;
-- o dia, ou o dia útil anterior: p_sabado_conta = salário/13º; sem ele = guia (banco: sábado e domingo antecipam para a sexta)
create function public._fn_folha_dia_util_ate(p_dia date, p_sabado_conta boolean)
returns date language sql immutable set search_path = public as $$
  select case when extract(isodow from p_dia) = 7 then p_dia - case when p_sabado_conta then 1 else 2 end
              when extract(isodow from p_dia) = 6 and not p_sabado_conta then p_dia - 1
              else p_dia end
$$;
revoke all on function public._fn_folha_quinto_dia_util(date) from public, anon, authenticated;
revoke all on function public._fn_folha_dia_util_ate(date, boolean) from public, anon, authenticated;

-- o Histórico passa a ler o tipo da função (o resto da 118420 igual)
create or replace function public.fn_folha_historico(p_funcionario uuid, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.folha_funcionarios; v jsonb;
begin
  select * into f from folha_funcionarios where id = p_funcionario;
  if not found or not folha_ok(f.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  with l as (
    select l.*, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) dt, pc.subcentro sub
      from financeiro_lancamentos_v2 l left join financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where l.funcionario_id = f.id and l.cliente_id = f.cliente_id and not coalesce(l.cancelado, false)
       and (p_de is null or coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) >= p_de)
       and (p_ate is null or coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) <= p_ate)),
  t as (
    select l.*, _fn_folha_tipo(l.descricao, l.sub) tipo
      from l),
  docs as (
    select x.lancamento_id, jsonb_agg(jsonb_build_object('origem', x.origem, 'id', x.id, 'nome', x.nome, 'especie', x.especie,
             'bucket', x.bucket, 'storage_path', x.caminho) order by x.nome) itens
      from (select distinct on (u.lancamento_id, coalesce(u.md5, u.caminho)) u.* from (
              select d.lancamento_id, 'folha' origem, d.id, d.nome, d.especie, 'folha-documentos' bucket, d.storage_path caminho, d.md5, 1 ordem
                from folha_documentos d where d.cliente_id = f.cliente_id and d.cancelado_em is null and d.lancamento_id in (select id from l)
              union all
              select d.lancamento_id, 'lancamento', d.id, d.nome, d.especie, 'fin-documentos', d.url, null::text, 2
                from financeiro_lancamento_documentos d where d.cliente_id = f.cliente_id and not d.cancelado and d.lancamento_id in (select id from l)) u
            order by u.lancamento_id, coalesce(u.md5, u.caminho), u.ordem) x
     group by x.lancamento_id)
  select jsonb_build_object(
    'funcionario', jsonb_build_object('id', f.id, 'nome', f.nome, 'situacao', f.situacao, 'admissao', f.admissao, 'desligamento', f.desligamento,
                                      'favorecido_id', f.favorecido_id),
    'itens', coalesce(jsonb_agg(jsonb_build_object('lancamento_id', t.id, 'competencia', t.data_competencia, 'data', t.dt, 'data_pagamento', t.data_pagamento,
                 'tipo', t.tipo, 'descricao', t.descricao, 'favorecido_id', t.favorecido_id, 'favorecido', ff.nome,
                 'pago_a_outro', t.favorecido_id is distinct from f.favorecido_id, 'valor', abs(t.valor), 'status', t.status_transacao,
                 'conciliado', t.conciliado_em is not null, 'documentos', coalesce(d.itens, '[]'::jsonb)) order by t.dt desc, t.id), '[]'::jsonb),
    'n', count(t.id), 'total', coalesce(round(sum(abs(t.valor)), 2), 0),
    'pagos_a_outro', count(t.id) filter (where t.favorecido_id is distinct from f.favorecido_id),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from t group by 1) z), '{}'::jsonb))
    into v
    from t left join financeiro_fornecedores ff on ff.id = t.favorecido_id left join docs d on d.lancamento_id = t.id;
  return v;
end $$;

-- ═══ 2. a Folha do mês (D-C1 a: derivada; nada grava)
create function public.fn_folha_mes(p_cliente uuid, p_competencia text, p_tipo text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ini date; v_fim date; v_especie text; v_mes int; v_13 date; v jsonb;
begin
  perform _fn_folha_exigir(p_cliente);
  if coalesce(p_competencia, '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or coalesce(p_tipo, '') not in ('mensal', '13_1', '13_2') then
    raise exception 'Folha do mês: pedido inválido.' using errcode = '22023';
  end if;
  v_ini := (p_competencia || '-01')::date; v_fim := (v_ini + interval '1 month')::date; v_mes := extract(month from v_ini);
  v_especie := case p_tipo when 'mensal' then 'holerite' else 'recibo_13' end;
  v_13 := case v_mes when 11 then make_date(extract(year from v_ini)::int, 11, 30) when 12 then make_date(extract(year from v_ini)::int, 12, 20) end;
  with
  f as materialized (select * from folha_funcionarios where cliente_id = p_cliente),
  -- o favorecido que é de UM funcionário só: o lançamento ainda sem ligação entra por ele ("ligar" no que falta)
  fav as materialized (
    select favorecido_id, min(id::text)::uuid fid from f where favorecido_id is not null group by favorecido_id having count(*) = 1),
  l as materialized (
    select l.id, coalesce(l.funcionario_id, fav.fid) fid, l.funcionario_id is not null ligado, abs(l.valor) valor, l.status_transacao status,
           l.data_vencimento, l.data_pagamento, l.conciliado_em is not null conciliado
      from financeiro_lancamentos_v2 l
      left join financeiro_plano_contas pc on pc.id = l.plano_conta_id
      left join fav on l.funcionario_id is null and fav.favorecido_id = l.favorecido_id
     where l.cliente_id = p_cliente and not coalesce(l.cancelado, false) and l.data_competencia >= v_ini and l.data_competencia < v_fim
       and (l.funcionario_id is not null
            or (fav.fid is not null and pc.subcentro ilike any (array['Salários e Encargos%', 'Rescisões e Acertos%', 'Benefícios e Premiações%'])))
       and case p_tipo when '13_1' then l.descricao like '13º Salário 1ª Parcela%'
                       when '13_2' then l.descricao like '13º Salário 2ª Parcela%'
                       else _fn_folha_tipo(l.descricao, pc.subcentro) = 'Salário' end),
  -- o recibo vivo de cada lançamento (o 1º), com o valor de antes e o do recibo gravados na trilha do registro
  rd as materialized (
    select distinct on (d.lancamento_id) d.id, d.lancamento_id, d.nome, d.storage_path,
           (t.antes->>'valor')::numeric antes, coalesce((t.antes->>'criado')::boolean, false) criado, (t.depois->>'valor')::numeric recibo,
           t.depois->>'documento_nome' doc_nome, t.depois->>'documento_md5' doc_md5
      from folha_documentos d
      left join lateral (select tr.antes, tr.depois from folha_trilha tr
                          where tr.tabela = 'folha_documentos' and tr.registro_id = d.id and tr.acao = 'registrar' order by tr.em limit 1) t on true
     where d.cliente_id = p_cliente and d.cancelado_em is null and d.especie = v_especie and d.lancamento_id in (select id from l)
     order by d.lancamento_id, d.criado_em, d.id),
  agg as (
    select l.fid, count(*) n_lanc, count(r.id) n_rec, count(r.id) filter (where r.recibo is null) n_rec_sem_valor,
           bool_or(r.criado) criado, bool_and(l.status = 'realizado') pago, bool_and(l.ligado) ligado,
           round(sum(case when r.criado then null else coalesce(r.antes, l.valor) end), 2) previsto, round(sum(r.recibo), 2) recibo,
           case when count(distinct l.status) = 1 then min(l.status) else 'varios' end status,
           jsonb_agg(jsonb_build_object('id', l.id, 'valor', l.valor, 'status', l.status, 'vencimento', l.data_vencimento, 'pagamento', l.data_pagamento,
                     'conciliado', l.conciliado, 'ligado', l.ligado) order by l.data_vencimento, l.id) lancamentos,
           coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'bucket', 'folha-documentos', 'storage_path', r.storage_path,
                     'lancamento_id', r.lancamento_id) order by r.nome) filter (where r.id is not null), '[]'::jsonb) recibos
      from l left join rd r on r.lancamento_id = l.id group by l.fid),
  -- férias (D-C4 a): só o período lido da escala; o mais antigo com saldo
  fer as (
    select distinct on (p.funcionario_id) p.funcionario_id fid, p.id, p.aquisitivo_inicio, p.aquisitivo_fim, p.saldo_dias, p.ultimo_prazo
      from folha_ferias_periodos p where p.cliente_id = p_cliente and p.saldo_dias > 0 order by p.funcionario_id, p.aquisitivo_inicio),
  quem as (
    select f.id from f where (f.admissao is null or f.admissao < v_fim) and (f.situacao <> 'desligado' or f.desligamento >= v_ini)
    union select fid from l),
  base as (
    select f.id, f.nome, f.situacao, f.vinculo, 'vinculo' = any (f.a_atualizar) vinculo_a_confirmar, a.*, fe.id fer_id, fe.aquisitivo_inicio, fe.aquisitivo_fim,
           fe.saldo_dias, fe.ultimo_prazo,
           case when a.fid is null then 'sem_previsto'
                when a.criado then 'criado_pelo_recibo'
                when a.n_rec = 0 then 'sem_recibo'
                when a.n_rec < a.n_lanc or a.n_rec_sem_valor > 0 then 'a_conferir'
                when abs(a.recibo - a.previsto) < 0.005 then 'confere'
                else 'diferenca' end sit
      from f join quem q on q.id = f.id left join agg a on a.fid = f.id left join fer fe on fe.fid = f.id),
  linha as (
    select b.*, case when b.sit in ('confere', 'diferenca') then round(b.recibo - b.previsto, 2) end dif,
           array_remove(array[case when b.fid is null then 'lancamento' end, case when b.fid is not null and not b.ligado then 'ligar' end,
                              case when coalesce(b.n_rec, 0) < coalesce(b.n_lanc, 1) then 'recibo' end,
                              case when b.fid is not null and not b.pago then 'pagamento' end,
                              case when b.vinculo_a_confirmar then 'vinculo' end], null) falta
      from base b)
  select jsonb_build_object(
    'competencia', p_competencia, 'tipo', p_tipo,
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'funcionario_id', x.id, 'nome', x.nome, 'situacao', x.situacao, 'vinculo', x.vinculo, 'vinculo_a_confirmar', x.vinculo_a_confirmar,
        'previsto', x.previsto, 'recibo', case when x.n_rec > 0 and x.n_rec_sem_valor = 0 then x.recibo end, 'diferenca', x.dif,
        'recibos', coalesce(x.recibos, '[]'::jsonb), 'lancamentos', coalesce(x.lancamentos, '[]'::jsonb), 'lancamento_status', x.status,
        'situacao_folha', x.sit, 'falta', to_jsonb(x.falta),
        'falta_frase', nullif(array_to_string(array(select case c when 'lancamento' then 'lançamento previsto' when 'ligar' then 'ligar o lançamento'
                                  when 'recibo' then 'recibo do contador' when 'pagamento' then 'pagamento' when 'vinculo' then 'confirmar o vínculo' end
                                  from unnest(x.falta) c), ' · '), ''),
        'ferias', case when x.fer_id is not null then jsonb_build_object('periodo_id', x.fer_id, 'aquisitivo_inicio', x.aquisitivo_inicio,
                    'aquisitivo_fim', x.aquisitivo_fim, 'saldo_dias', x.saldo_dias, 'ultimo_prazo', x.ultimo_prazo, 'dias', x.ultimo_prazo - current_date) end)
        order by x.nome, x.id) from linha x), '[]'::jsonb),
    'totais', (select jsonb_build_object('pessoas', count(*), 'previsto', round(sum(x.previsto), 2),
                 'recibo', round(sum(x.recibo) filter (where x.n_rec > 0 and x.n_rec_sem_valor = 0), 2), 'diferenca', round(sum(x.dif), 2),
                 'confere', count(*) filter (where x.sit = 'confere'), 'diferencas', count(*) filter (where x.sit = 'diferenca'),
                 'sem_recibo', count(*) filter (where x.sit = 'sem_recibo'), 'a_conferir', count(*) filter (where x.sit = 'a_conferir'),
                 'sem_previsto', count(*) filter (where x.sit = 'sem_previsto'), 'criados_pelo_recibo', count(*) filter (where x.sit = 'criado_pelo_recibo'),
                 'a_ligar', count(*) filter (where 'ligar' = any (x.falta))) from linha x),
    -- a faixa dos 4 documentos (UI-LARGURA-FIXA-01: os 4 lugares sempre presentes; chegou = false é "não chegou")
    'documentos', jsonb_build_object(
      'recibos', (select jsonb_build_object('chegou', count(*) > 0, 'n', count(*), 'de', (select count(*) from agg),
                   'origens', coalesce(jsonb_agg(distinct jsonb_build_object('nome', r.doc_nome, 'md5', r.doc_md5)) filter (where r.doc_md5 is not null), '[]'::jsonb))
                  from rd r),
      -- o espelho/resumo não tem espécie em folha_documentos (entra com a folha confirmada, PR D)
      'espelho', jsonb_build_object('chegou', false),
      'guia_inss', coalesce((select jsonb_build_object('chegou', true, 'guia_id', g.id, 'valor', g.valor, 'vencimento', g.vencimento, 'documento_id', g.documento_id)
                   from folha_guias g where g.cliente_id = p_cliente and g.competencia = p_competencia and g.tipo = 'inss_darf' and g.cancelado_em is null
                   order by g.criado_em desc limit 1), jsonb_build_object('chegou', false)),
      'guia_fgts', coalesce((select jsonb_build_object('chegou', true, 'guia_id', g.id, 'valor', g.valor, 'vencimento', g.vencimento, 'documento_id', g.documento_id)
                   from folha_guias g where g.cliente_id = p_cliente and g.competencia = p_competencia and g.tipo = 'fgts_gfd' and g.cancelado_em is null
                   order by g.criado_em desc limit 1), jsonb_build_object('chegou', false))),
    -- o calendário (D-C3 a): 5 lugares fixos; data nula = "—"
    'calendario', jsonb_build_array(
      jsonb_build_object('chave', 'salario', 'rotulo', 'Pagamento do salário', 'origem', 'regra', 'valor', null,
                         'data', _fn_folha_quinto_dia_util(v_fim), 'dias', _fn_folha_quinto_dia_util(v_fim) - current_date),
      coalesce((select jsonb_build_object('chave', 'fgts', 'rotulo', 'FGTS', 'origem', 'guia', 'valor', g.valor, 'data', g.vencimento, 'dias', g.vencimento - current_date)
                  from folha_guias g where g.cliente_id = p_cliente and g.competencia = p_competencia and g.tipo = 'fgts_gfd' and g.cancelado_em is null
                 order by g.criado_em desc limit 1),
               jsonb_build_object('chave', 'fgts', 'rotulo', 'FGTS', 'origem', 'regra', 'valor', null,
                                  'data', _fn_folha_dia_util_ate(v_fim + 19, false), 'dias', _fn_folha_dia_util_ate(v_fim + 19, false) - current_date)),
      coalesce((select jsonb_build_object('chave', 'inss', 'rotulo', 'INSS (DCTFWeb)', 'origem', 'guia', 'valor', g.valor, 'data', g.vencimento, 'dias', g.vencimento - current_date)
                  from folha_guias g where g.cliente_id = p_cliente and g.competencia = p_competencia and g.tipo = 'inss_darf' and g.cancelado_em is null
                 order by g.criado_em desc limit 1),
               jsonb_build_object('chave', 'inss', 'rotulo', 'INSS (DCTFWeb)', 'origem', 'regra', 'valor', null,
                                  'data', _fn_folha_dia_util_ate(v_fim + 19, false), 'dias', _fn_folha_dia_util_ate(v_fim + 19, false) - current_date)),
      jsonb_build_object('chave', 'decimo_terceiro', 'rotulo', case v_mes when 11 then '13º · 1ª parcela' when 12 then '13º · 2ª parcela' else '13º' end,
                         'origem', 'regra', 'valor', null, 'data', _fn_folha_dia_util_ate(v_13, true), 'dias', _fn_folha_dia_util_ate(v_13, true) - current_date),
      coalesce((select jsonb_build_object('chave', 'ferias', 'rotulo', 'Férias · último prazo', 'origem', 'escala', 'valor', null, 'data', p.ultimo_prazo,
                         'dias', p.ultimo_prazo - current_date, 'funcionario_id', p.funcionario_id, 'funcionario', ff.nome)
                  from folha_ferias_periodos p join f ff on ff.id = p.funcionario_id
                 where p.cliente_id = p_cliente and p.saldo_dias > 0 and p.ultimo_prazo is not null and ff.situacao <> 'desligado'
                 order by p.ultimo_prazo limit 1),
               jsonb_build_object('chave', 'ferias', 'rotulo', 'Férias', 'origem', 'escala', 'valor', null, 'data', null, 'dias', null))))
    into v;
  return v;
end $$;
revoke all on function public.fn_folha_mes(uuid, text, text) from public, anon;
grant execute on function public.fn_folha_mes(uuid, text, text) to authenticated, service_role;

-- ═══ 3. o recibo do contador: 13º e mensal; casa pelo funcionário; o arquivo em folha_documentos
create or replace function public.fn_folha_recibos_aplicar(p_cliente uuid, p_entrada uuid, p_documento jsonb, p_itens jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_md5 text := lower(p_documento->>'md5'); v_tipo text := p_documento->>'tipo'; v_comp text := p_documento->>'competencia';
  v_total numeric := round((p_documento->>'total')::numeric, 2); v_especie text; v_ini date; v_fim date; v_soma numeric;
  i jsonb; v_k int := 0; v_nf int; v_nfe int; v_nl int; v_fid uuid; v_fmodo text; v_cand uuid; v_modo text; v_por text;
  l public.financeiro_lancamentos_v2; m public.financeiro_lancamentos_v2;
  v_forn uuid; v_novo uuid; v_lanc uuid; v_via text; v_doc uuid; v_dfid uuid; v_path text; v_pag text; v_antes numeric; v_criado boolean;
  v_auto jsonb := '[]'; v_pend jsonb := '[]'; v_casados uuid[] := '{}'; v_sem_recibo jsonb; v_sem_doc jsonb; v_docs jsonb := '[]';
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  if p_simular is null or coalesce(v_md5, '') !~ '^[0-9a-f]{32}$' or coalesce(v_tipo, '') not in ('mensal', '13_1', '13_2')
     or coalesce(v_comp, '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or v_total is null or jsonb_typeof(p_itens) is distinct from 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Recibos: pedido inválido.' using errcode = '22023';
  end if;
  if p_entrada is not null and not exists (select 1 from entrada_arquivos where id = p_entrada and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  v_via := 'folha-recibo:' || v_md5;
  if exists (select 1 from financeiro_lancamento_documentos d where d.cliente_id = p_cliente and not d.cancelado and d.observacao like v_via || '%')
     or exists (select 1 from folha_trilha t join folha_documentos d on d.id = t.registro_id
                 where t.cliente_id = p_cliente and t.via = v_via and t.tabela = 'folha_documentos' and t.acao = 'registrar' and d.cancelado_em is null)
     -- sem arquivo, a trilha do lançamento diz: aplicado depois do último desfazer
     or (select max(a.created_at) from audit_log a where a.cliente_id = p_cliente and a.via = v_via)
        > coalesce((select max(a.created_at) from audit_log a where a.cliente_id = p_cliente and a.via = v_via || ':desfazer'), '-infinity') then
    raise exception 'Este documento do contador já foi aplicado (desfaça antes de aplicar de novo).' using errcode = 'P0001';
  end if;
  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma from jsonb_array_elements(p_itens) x;
  if v_soma <> v_total then
    raise exception 'Os recibos somam % e o documento diz %: nada foi gravado.', v_soma, v_total using errcode = 'P0001';
  end if;
  v_ini := (v_comp || '-01')::date; v_fim := (v_ini + interval '1 month')::date;
  v_especie := case v_tipo when 'mensal' then 'holerite' else 'recibo_13' end;

  -- 0. os lançamentos do tipo nesta competência (13º: pela descrição da parcela; mensal: o tipo 'Salário' da regra única — os ligados, e
  --    os sem ligação da conta Salários e Encargos)
  create temp table if not exists _rec_l (id uuid, funcionario_id uuid, favorecido_id uuid) on commit drop;
  delete from _rec_l where true;
  insert into _rec_l
  select l2.id, l2.funcionario_id, l2.favorecido_id
    from financeiro_lancamentos_v2 l2 left join financeiro_plano_contas pc on pc.id = l2.plano_conta_id
   where l2.cliente_id = p_cliente and not coalesce(l2.cancelado, false) and l2.data_competencia >= v_ini and l2.data_competencia < v_fim
     and case v_tipo when '13_1' then l2.descricao like '13º Salário 1ª Parcela%'
                     when '13_2' then l2.descricao like '13º Salário 2ª Parcela%'
                     else _fn_folha_tipo(l2.descricao, pc.subcentro) = 'Salário'
                          and (l2.funcionario_id is not null or pc.subcentro ilike 'Salários e Encargos%') end;

  -- 1. casar cada recibo (tudo lido antes de gravar). D-C2 a: o nome do recibo acha UM funcionário (exato manda sobre parcial) e o
  --    funcionário acha o lançamento ligado; sem lançamento ligado (ou sem funcionário), pelo nome do favorecido entre os sem ligação
  create temp table if not exists _rec (k int, item jsonb, lanc uuid, modo text, acao text, fid uuid, casou_por text) on commit drop;
  delete from _rec where true;
  for i in select * from jsonb_array_elements(p_itens) loop
    v_k := v_k + 1; v_fid := null; v_fmodo := null; v_cand := null; v_modo := null; v_por := null; v_nl := 0;
    select count(*) filter (where c.modo = 'exato'), count(*) into v_nfe, v_nf
      from (select _fn_folha_nome_casa(i->>'nome', f.nome) modo from folha_funcionarios f where f.cliente_id = p_cliente) c where c.modo is not null;
    if v_nfe > 1 or (v_nfe = 0 and v_nf > 1) then
      insert into _rec values (v_k, i, null, null, 'ambiguo', null, 'funcionario');
      continue;
    end if;
    if v_nf > 0 then
      select f.id, _fn_folha_nome_casa(i->>'nome', f.nome) into v_fid, v_fmodo from folha_funcionarios f
       where f.cliente_id = p_cliente and _fn_folha_nome_casa(i->>'nome', f.nome) = case when v_nfe = 1 then 'exato' else 'parcial' end;
    end if;
    if v_fid is not null and exists (select 1 from _rec_l where funcionario_id = v_fid) then
      select count(*), (array_agg(id))[1] into v_nl, v_cand from _rec_l where funcionario_id = v_fid;
      v_modo := v_fmodo; v_por := 'funcionario';
    else
      select count(*), (array_agg(c.id))[1], min(c.modo) into v_nl, v_cand, v_modo from (
        select r2.id, _fn_folha_nome_casa(i->>'nome', fo.nome) modo
          from _rec_l r2 join financeiro_fornecedores fo on fo.id = r2.favorecido_id where r2.funcionario_id is null) c
       where c.modo is not null;
      v_por := 'favorecido';
    end if;
    if v_nl = 1 then
      insert into _rec values (v_k, i, v_cand, v_modo, 'casar', v_fid, v_por);
    elsif v_nl > 1 then
      insert into _rec values (v_k, i, null, null, 'ambiguo', v_fid, v_por);
    elsif coalesce((i->>'criar')::boolean, false) then
      insert into _rec values (v_k, i, null, null, 'criar', v_fid, null);
    else
      insert into _rec values (v_k, i, null, null, 'sem_lancamento', v_fid, null);
    end if;
  end loop;
  if exists (select lanc from _rec where lanc is not null group by lanc having count(*) > 1) then
    raise exception 'Dois recibos casaram com o mesmo lançamento: confira os nomes.' using errcode = 'P0001';
  end if;
  v_casados := array(select lanc from _rec where lanc is not null);
  -- o funcionário do documento: o casado; sem ele, o do lançamento; sem ele, o único funcionário com aquele favorecido
  update _rec r set fid = coalesce(r.fid, x.funcionario_id,
           (select min(f.id::text)::uuid from folha_funcionarios f where f.cliente_id = p_cliente and f.favorecido_id = x.favorecido_id having count(*) = 1))
    from financeiro_lancamentos_v2 x where x.id = r.lanc and r.fid is null;

  -- 2. conferir os casados (estado do lançamento)
  for i in select to_jsonb(r) from _rec r where r.acao = 'casar' loop
    select * into l from financeiro_lancamentos_v2 where id = (i->>'lanc')::uuid for update;
    if l.status_transacao not in ('previsto', 'programado', 'agendado') and l.valor <> round((i->'item'->>'valor')::numeric, 2) then
      raise exception '%: o lançamento já está % com outro valor (% × recibo %): nada foi gravado.', i->'item'->>'nome', l.status_transacao, l.valor, i->'item'->>'valor' using errcode = 'P0001';
    end if;
    if _fin_lancamento_casado_com_extrato(l.id) and l.valor <> round((i->'item'->>'valor')::numeric, 2) then
      raise exception '%: o lançamento está conciliado com outro valor: nada foi gravado.', i->'item'->>'nome' using errcode = 'P0001';
    end if;
    if exists (select 1 from financeiro_fechamentos ff where ff.cliente_id = p_cliente and ff.status_fechamento = 'fechado' and ff.ano_mes = to_char(l.data_competencia, 'YYYY-MM')) then
      raise exception 'O mês % está fechado: nada foi gravado.', to_char(l.data_competencia, 'MM/YYYY') using errcode = 'P0001';
    end if;
    v_auto := v_auto || jsonb_build_object('pagina', i->'item'->'paginas', 'nome', i->'item'->>'nome', 'lancamento_id', l.id, 'antes', l.valor,
      'depois', round((i->'item'->>'valor')::numeric, 2), 'nome_confere', i->>'modo', 'casou_por', i->>'casou_por', 'funcionario_id', i->>'fid');
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('pagina', r.item->'paginas', 'nome', r.item->>'nome', 'valor', r.item->>'valor', 'pendencia', r.acao,
           'funcionario_id', r.fid) order by r.k), '[]')
    into v_pend from _rec r where r.acao in ('ambiguo', 'sem_lancamento');
  select coalesce(jsonb_agg(jsonb_build_object('lancamento_id', l2.id, 'nome', coalesce(fu.nome, f.nome), 'funcionario_id', l2.funcionario_id,
           'valor', l2.valor, 'pendencia', 'sem_recibo') order by coalesce(fu.nome, f.nome)), '[]')
    into v_sem_recibo
    from _rec_l x join financeiro_lancamentos_v2 l2 on l2.id = x.id left join financeiro_fornecedores f on f.id = l2.favorecido_id
    left join folha_funcionarios fu on fu.id = l2.funcionario_id
   where not l2.id = any (v_casados) and (v_tipo <> 'mensal' or l2.funcionario_id is not null);
  -- o arquivo que não acha funcionário não se guarda (folha_documentos exige um): aparece na prévia
  select coalesce(jsonb_agg(jsonb_build_object('pagina', r.item->'paginas', 'nome', r.item->>'nome', 'motivo', 'sem funcionário no cadastro') order by r.k), '[]')
    into v_sem_doc from _rec r where r.acao in ('casar', 'criar') and r.fid is null and jsonb_typeof(r.item->'arquivo') = 'object';

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'automaticos', v_auto,
      'criar', (select coalesce(jsonb_agg(jsonb_build_object('nome', r.item->>'nome', 'valor', r.item->>'valor', 'funcionario_id', r.fid) order by r.k), '[]') from _rec r where r.acao = 'criar'),
      'pendencias', v_pend, 'sem_recibo', v_sem_recibo, 'documentos_sem_funcionario', v_sem_doc, 'soma', v_soma);
  end if;

  -- 3. gravar
  perform set_config('app.via', v_via, true);
  perform set_config('app.motivo', 'atualizado pelo recibo do contador · ' || coalesce(p_documento->>'nome', '') || ' · ' || to_char(now(), 'DD/MM/YYYY'), true);
  for i in select to_jsonb(r) from _rec r where r.acao in ('casar', 'criar') order by r.k loop
    v_criado := i->>'acao' = 'criar';
    if v_criado then
      -- o molde: o casado mais comum do MESMO empregador (cei) neste documento; sem ele, o mais comum do documento
      m := null; v_forn := null; v_antes := null;
      select l2.* into m from _rec r join financeiro_lancamentos_v2 l2 on l2.id = r.lanc
       where r.acao = 'casar'
       order by (r.item->>'cei' is not distinct from i->'item'->>'cei') desc,
                count(*) over (partition by l2.plano_conta_id, l2.fazenda_id, l2.conta_bancaria_id) desc, r.k
       limit 1;
      if m.id is null then raise exception 'Sem lançamento-molde para criar %.', i->'item'->>'nome' using errcode = 'P0001'; end if;
      select f.id into v_forn from financeiro_fornecedores f
       where f.cliente_id = p_cliente and f.ativo and _fn_folha_nome_casa(i->'item'->>'nome', f.nome) = 'exato' order by f.created_at limit 1;
      if v_forn is null then
        insert into financeiro_fornecedores (cliente_id, nome, ativo, tipo_pessoa) values (p_cliente, btrim(i->'item'->>'nome'), true, 'PF') returning id into v_forn;
      end if;
      insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
             status_transacao, data_competencia, data_vencimento, forma_pagamento, cenario, origem_lancamento, observacao, created_by, updated_by, funcionario_id)
      values (p_cliente, m.fazenda_id, m.conta_bancaria_id, m.plano_conta_id, v_forn, m.descricao, round((i->'item'->>'valor')::numeric, 2), m.sinal, m.tipo_operacao,
             'previsto', m.data_competencia, m.data_vencimento, m.forma_pagamento, m.cenario, 'manual',
             'criado pelo recibo do contador (' || coalesce(p_documento->>'nome', '') || ')', auth.uid(), auth.uid(), (i->>'fid')::uuid)
      returning id into v_novo;
      update _rec set lanc = v_novo where k = (i->>'k')::int;
      v_lanc := v_novo;
    else
      v_lanc := (i->>'lanc')::uuid;
      select abs(valor) into v_antes from financeiro_lancamentos_v2 where id = v_lanc;
      update financeiro_lancamentos_v2 set valor = round((i->'item'->>'valor')::numeric, 2), updated_by = auth.uid()
       where id = v_lanc and valor <> round((i->'item'->>'valor')::numeric, 2);
    end if;
    -- D-C5 a: UM registro em folha_documentos (funcionário + lançamento); a Caixa sobe o PDF no caminho devolvido
    v_dfid := (i->>'fid')::uuid;
    if jsonb_typeof(i->'item'->'arquivo') = 'object' and v_dfid is not null then
      v_pag := regexp_replace(coalesce(case jsonb_typeof(i->'item'->'paginas') when 'array' then i->'item'->'paginas'->>0 else i->'item'->>'paginas' end, ''), '[^0-9]', '', 'g');
      if v_pag = '' then v_pag := 'i' || (i->>'k'); end if;
      v_path := p_cliente::text || '/' || v_md5 || '-p' || v_pag || '.pdf';
      insert into folha_documentos (cliente_id, funcionario_id, lancamento_id, especie, nome, storage_path, tipo, tamanho_bytes, md5, entrada_arquivo_id, enviado_por)
      values (p_cliente, v_dfid, v_lanc, v_especie, coalesce(nullif(btrim(i->'item'->'arquivo'->>'nome'), ''), 'recibo-p' || v_pag || '.pdf'), v_path,
              'application/pdf', nullif(i->'item'->'arquivo'->>'tamanho', '')::bigint,
              case when lower(i->'item'->'arquivo'->>'md5') ~ '^[0-9a-f]{32}$' then lower(i->'item'->'arquivo'->>'md5') end, p_entrada, auth.uid())
      returning id into v_doc;
      perform _fn_folha_trilha(p_cliente, 'folha_documentos', v_doc, 'registrar', jsonb_build_object('valor', v_antes, 'criado', v_criado),
        jsonb_build_object('especie', v_especie, 'funcionario_id', v_dfid, 'lancamento_id', v_lanc, 'valor', round((i->'item'->>'valor')::numeric, 2),
                           'tipo', v_tipo, 'competencia', v_comp, 'paginas', i->'item'->'paginas', 'documento_md5', v_md5,
                           'documento_nome', p_documento->>'nome', 'casou_por', i->>'casou_por', 'entrada', p_entrada), null);
      v_docs := v_docs || jsonb_build_object('documento_id', v_doc, 'bucket', 'folha-documentos', 'storage_path', v_path, 'nome', i->'item'->>'nome',
                                             'paginas', i->'item'->'paginas', 'funcionario_id', v_dfid, 'lancamento_id', v_lanc);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'automaticos', v_auto,
    'criados', (select coalesce(jsonb_agg(jsonb_build_object('nome', r.item->>'nome', 'lancamento_id', r.lanc)), '[]') from _rec r where r.acao = 'criar'),
    'pendencias', v_pend, 'sem_recibo', v_sem_recibo, 'documentos', v_docs, 'documentos_sem_funcionario', v_sem_doc, 'soma', v_soma);
end $$;

create or replace function public.fn_folha_recibos_desfazer(p_cliente uuid, p_md5 text, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_via text := 'folha-recibo:' || lower(coalesce(p_md5, '')); r record; v_valores int := 0; v_criados int := 0; v_docs int := 0;
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  if p_simular is null or nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  create temp table if not exists _rec_docs (id uuid) on commit drop;
  delete from _rec_docs where true;
  insert into _rec_docs select d.id from folha_trilha t join folha_documentos d on d.id = t.registro_id
   where t.cliente_id = p_cliente and t.via = v_via and t.tabela = 'folha_documentos' and t.acao = 'registrar' and d.cancelado_em is null;
  if not exists (select 1 from audit_log a where a.cliente_id = p_cliente and a.via = v_via)
     and not exists (select 1 from financeiro_lancamento_documentos d where d.cliente_id = p_cliente and not d.cancelado and d.observacao like v_via || '%')
     and not exists (select 1 from _rec_docs) then
    raise exception 'Nada aplicado por este documento.' using errcode = 'P0001';
  end if;
  -- os tocados: não podem ter sido pagos/conciliados depois
  for r in select distinct l.id, l.status_transacao from audit_log a join financeiro_lancamentos_v2 l on l.id = a.registro_id
            where a.cliente_id = p_cliente and a.via = v_via and a.tabela_origem = 'financeiro_lancamentos_v2' loop
    if r.status_transacao not in ('previsto', 'programado', 'agendado') or _fin_lancamento_casado_com_extrato(r.id) then
      raise exception 'Um lançamento deste documento já foi pago ou conciliado: desfaça isso antes.' using errcode = 'P0001';
    end if;
  end loop;
  select count(*) filter (where a.acao <> 'criou'), count(*) filter (where a.acao = 'criou') into v_valores, v_criados
    from (select distinct on (a.registro_id) a.registro_id, a.acao from audit_log a
           where a.cliente_id = p_cliente and a.via = v_via and a.tabela_origem = 'financeiro_lancamentos_v2' order by a.registro_id, a.created_at) a;
  select count(*) + (select count(*) from _rec_docs) into v_docs
    from financeiro_lancamento_documentos d where d.cliente_id = p_cliente and not d.cancelado and d.observacao like v_via || '%';
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'valores', v_valores, 'criados', v_criados, 'documentos', v_docs); end if;

  perform set_config('app.via', v_via || ':desfazer', true);
  perform set_config('app.motivo', btrim(p_motivo), true);
  update financeiro_lancamento_documentos set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where cliente_id = p_cliente and not cancelado and observacao like v_via || '%';
  -- os recibos em folha_documentos: cancelados com o motivo (nunca apagados), com trilha
  update folha_documentos set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id in (select id from _rec_docs) and cancelado_em is null;
  for r in select id from _rec_docs loop
    perform _fn_folha_trilha(p_cliente, 'folha_documentos', r.id, 'cancelar', null, jsonb_build_object('documento_md5', lower(p_md5)), p_motivo);
  end loop;
  -- o valor de ANTES = o dados_anteriores da 1ª edição desta via
  for r in select distinct on (a.registro_id) a.registro_id, a.acao, (a.dados_anteriores->>'valor')::numeric valor_antes from audit_log a
            where a.cliente_id = p_cliente and a.via = v_via and a.tabela_origem = 'financeiro_lancamentos_v2' order by a.registro_id, a.created_at loop
    if r.acao = 'criou' then
      update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
       where id = r.registro_id and not coalesce(cancelado, false);
    elsif r.valor_antes is not null then
      update financeiro_lancamentos_v2 set valor = r.valor_antes, updated_by = auth.uid() where id = r.registro_id;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'valores', v_valores, 'criados', v_criados, 'documentos', v_docs);
end $$;

-- ═══ 4. as férias na ficha (D-C4 a: só o período lido da escala; vazio = "—") — a 118420 igual, mais a chave `ferias`
create or replace function public.fn_folha_funcionario_ficha(p_funcionario uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.folha_funcionarios; v jsonb;
begin
  select * into f from folha_funcionarios where id = p_funcionario;
  if not found or not folha_ok(f.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  select jsonb_build_object(
    'funcionario', to_jsonb(f) - 'criado_por' - 'atualizado_por',
    'pagamento', (select jsonb_build_object('favorecido_id', ff.id, 'favorecido', ff.nome, 'tipo_recebimento', ff.tipo_recebimento,
                    'pix_tipo_chave', ff.pix_tipo_chave, 'pix_chave', ff.pix_chave, 'banco', ff.banco, 'agencia', ff.agencia, 'conta', ff.conta,
                    'tipo_conta', ff.tipo_conta, 'telefone', ff.telefone, 'celular', ff.celular, 'email', ff.email)
                    from financeiro_fornecedores ff where ff.id = f.favorecido_id),
    'salarios', coalesce((select jsonb_agg(jsonb_build_object('desde', s.desde, 'salario', s.salario, 'parte_pct', s.parte_pct, 'motivo', s.motivo) order by s.desde desc)
                    from folha_funcionario_salarios s where s.funcionario_id = f.id), '[]'::jsonb),
    'atuacoes', coalesce((select jsonb_agg(jsonb_build_object('desde', a.desde, 'fazenda_id', a.fazenda_id, 'fazenda', z.nome, 'atividade', a.atividade, 'pct', a.pct)
                    order by a.desde desc, a.pct desc) from folha_funcionario_atuacao a join fazendas z on z.id = a.fazenda_id where a.funcionario_id = f.id), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'especie', d.especie, 'nome', d.nome, 'bucket', 'folha-documentos',
                    'storage_path', d.storage_path, 'tipo', d.tipo, 'tamanho_bytes', d.tamanho_bytes, 'data_documento', d.data_documento,
                    'vencimento', d.vencimento, 'dias', d.vencimento - current_date, 'lancamento_id', d.lancamento_id, 'criado_em', d.criado_em)
                    order by coalesce(d.data_documento, d.criado_em::date) desc)
                    from folha_documentos d where d.funcionario_id = f.id and d.cancelado_em is null), '[]'::jsonb),
    'ultimos_pagamentos', coalesce((select jsonb_agg(x order by x->>'data' desc) from (
                    select jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'valor', abs(l.valor), 'status', l.status_transacao,
                      'data', coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), 'competencia', l.data_competencia) x
                      from financeiro_lancamentos_v2 l where l.funcionario_id = f.id and not coalesce(l.cancelado, false)
                     order by coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) desc limit 5) y), '[]'::jsonb),
    'ferias', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'aquisitivo_inicio', p.aquisitivo_inicio, 'aquisitivo_fim', p.aquisitivo_fim,
                    'vencimento', p.vencimento, 'ultimo_prazo', p.ultimo_prazo, 'dias', p.ultimo_prazo - current_date, 'dias_pagos', p.dias_pagos,
                    'saldo_dias', p.saldo_dias, 'faltas', p.faltas, 'documento_id', p.documento_id, 'lido_em', p.lido_em) order by p.aquisitivo_inicio desc)
                    from folha_ferias_periodos p where p.funcionario_id = f.id), '[]'::jsonb))
    into v;
  return v;
end $$;

-- ═══ 5. as pendências: 'ferias_vence' (descartável) e o "sem recibo" também do holerite do mês
alter table public.folha_pendencias_descartes drop constraint folha_pendencias_descartes_chave_check;
alter table public.folha_pendencias_descartes add constraint folha_pendencias_descartes_chave_check check (chave ~ '^(fav|desc|recibo|doc|ferias):[0-9a-f-]{36}');

create or replace function public.fn_folha_pendencia_descartar(p_cliente uuid, p_chave text, p_motivo text, p_desfazer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_chave is null or p_chave !~ '^(fav|desc|recibo|doc|ferias):[0-9a-f-]{36}' or p_desfazer is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if p_desfazer then
    update folha_pendencias_descartes set desfeito_por = auth.uid(), desfeito_em = now()
     where cliente_id = p_cliente and chave = p_chave and desfeito_em is null returning id into v_id;
    if v_id is null then raise exception 'Esta pendência não estava descartada.' using errcode = 'P0001'; end if;
    perform _fn_folha_trilha(p_cliente, 'folha_pendencias_descartes', v_id, 'desfazer', jsonb_build_object('chave', p_chave), null, p_motivo);
  else
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Diga por que não é pendência.' using errcode = 'P0001'; end if;
    if exists (select 1 from folha_pendencias_descartes where cliente_id = p_cliente and chave = p_chave and desfeito_em is null) then
      raise exception 'Esta pendência já foi descartada.' using errcode = 'P0001';
    end if;
    insert into folha_pendencias_descartes (cliente_id, chave, motivo, descartado_por) values (p_cliente, p_chave, btrim(p_motivo), auth.uid()) returning id into v_id;
    perform _fn_folha_trilha(p_cliente, 'folha_pendencias_descartes', v_id, 'descartar', null, jsonb_build_object('chave', p_chave), p_motivo);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.fn_folha_pendencias(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  with pc as materialized (
    select id, subcentro from financeiro_plano_contas
     where subcentro ilike any (array['Salários e Encargos%', 'Rescisões e Acertos%', 'Benefícios e Premiações%']) or centro_custo ilike 'Mão de Obra%'),
  desc_vivo as materialized (select chave from folha_pendencias_descartes where cliente_id = p_cliente and desfeito_em is null),
  f as materialized (select id, nome, favorecido_id, situacao, split_part(_fn_normalizar_texto(nome), ' ', 1) pn from folha_funcionarios where cliente_id = p_cliente),
  l as materialized (
    select l.id, l.favorecido_id, l.descricao, l.valor, l.data_competencia, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) dt,
           pc.subcentro ilike 'Rescisões e Acertos%' resc
      from financeiro_lancamentos_v2 l join pc on pc.id = l.plano_conta_id
     where l.cliente_id = p_cliente and not coalesce(l.cancelado, false) and l.funcionario_id is null),
  forn as materialized (
    select ff.id, ff.nome,
           (length(regexp_replace(coalesce(ff.cpf_cnpj, ''), '[^0-9]', '', 'g')) = 14
            or ff.nome ~* 'receita|caixa|cont[aá]b|sindicato|inss|fgts|gps|banco|sicredi|sicoob|bradesco|ita[uú]|santander|seguro|unimed|cl[ií]n|servi[cç]|serv\.|ltda|s\.a|s/a|s/s|eireli|prefeitura|sefaz|gru |supermercado|muffato|advogad|mercado|neoenergia|elektro|transporte|oficina|faz\.|fazenda|ajuste|sem dados|cef |assessoria|cooperativa|posto|farm[aá]cia|hospital|laborat') empresa
      from financeiro_fornecedores ff where ff.id in (select distinct favorecido_id from l where favorecido_id is not null)),
  -- (1) favorecido-pessoa com lançamento de folha sem funcionário
  p_fav as (
    select jsonb_build_object('tipo', case when bool_or(l.resc) then 'rescisao_a_conferir' else 'favorecido_sem_funcionario' end,
             'chave', 'fav:' || fo.id, 'favorecido_id', fo.id, 'favorecido', fo.nome, 'n', count(*), 'total', round(sum(abs(l.valor)), 2),
             'desde', min(l.data_competencia), 'ate', max(l.dt), 'tem_rescisao', bool_or(l.resc),
             'sugestao', (select jsonb_build_object('funcionario_id', min(f.id::text), 'funcionario', min(f.nome)) from f
                           where _fn_folha_nome_casa(btrim(regexp_replace(regexp_replace(fo.nome, '^Pec\.3M-', ''), '\(.*\)', '')), f.nome) is not null
                          having count(*) = 1),
             'ids', jsonb_agg(l.id order by l.dt desc)) item, count(*) n
      from l join forn fo on fo.id = l.favorecido_id
     where not fo.empresa and not exists (select 1 from f where f.favorecido_id = fo.id)
       and ('fav:' || fo.id) not in (select chave from desc_vivo)
     group by fo.id, fo.nome),
  -- (2) sugestão pela descrição: lançamento pago a empresa/contador (ou sem favorecido) cuja descrição tem o 1º nome de UM funcionário
  tok as materialized (
    select l.id, t from l left join forn fo on fo.id = l.favorecido_id,
           unnest(string_to_array(regexp_replace(coalesce(_fn_normalizar_texto(l.descricao), ''), '[^a-z0-9 ]', ' ', 'g'), ' ')) t
     where (fo.id is null or fo.empresa) and length(t) >= 4),
  sug as materialized (
    select tok.id, min(f.id::text)::uuid fid, min(f.nome) fnome from tok join f on f.pn = tok.t group by tok.id having count(distinct f.id) = 1),
  p_desc as (
    select jsonb_build_object('tipo', 'sugestao_descricao', 'chave', 'desc:' || l.id, 'lancamento_id', l.id, 'descricao', l.descricao,
             'favorecido', fo.nome, 'valor', abs(l.valor), 'data', l.dt, 'sugestao', jsonb_build_object('funcionario_id', s.fid, 'funcionario', s.fnome)) item, l.dt
      from sug s join l on l.id = s.id left join forn fo on fo.id = l.favorecido_id
     where ('desc:' || l.id) not in (select chave from desc_vivo)
     order by l.dt desc limit 300),
  -- (3) recibo que falta: a competência já tem recibo (13º: da mesma parcela; mensal: holerite do mês) e este lançamento ligado não tem.
  --     Só os meses que têm algum recibo (o mesmo resultado, sem varrer todo o histórico ligado)
  rec_mes as materialized (
    select distinct date_trunc('month', x.data_competencia) mes
      from (select d.lancamento_id from folha_documentos d
             where d.cliente_id = p_cliente and d.cancelado_em is null and d.especie in ('recibo_13', 'holerite') and d.lancamento_id is not null
            union
            select d.lancamento_id from financeiro_lancamento_documentos d
             where d.cliente_id = p_cliente and not d.cancelado and d.observacao like 'folha-recibo:%') r
      join financeiro_lancamentos_v2 x on x.id = r.lancamento_id),
  l13 as materialized (
    select l.id, l.funcionario_id, l.descricao, l.data_competencia, l.valor,
           case when l.descricao like '13º Salário _ª Parcela%' then l.descricao else 'salario' end grupo, date_trunc('month', l.data_competencia) mes,
           exists (select 1 from financeiro_lancamento_documentos d where d.lancamento_id = l.id and not d.cancelado and d.observacao like 'folha-recibo:%')
           or exists (select 1 from folha_documentos d where d.lancamento_id = l.id and d.cancelado_em is null and d.especie in ('recibo_13', 'holerite')) tem
      from financeiro_lancamentos_v2 l left join financeiro_plano_contas pc2 on pc2.id = l.plano_conta_id
     where l.cliente_id = p_cliente and not coalesce(l.cancelado, false) and l.funcionario_id is not null
       and date_trunc('month', l.data_competencia) in (select mes from rec_mes)
       and (l.descricao like '13º Salário _ª Parcela%' or _fn_folha_tipo(l.descricao, pc2.subcentro) = 'Salário')),
  p_rec as (
    select jsonb_build_object('tipo', 'sem_recibo', 'chave', 'recibo:' || a.id, 'lancamento_id', a.id, 'funcionario_id', a.funcionario_id,
             'funcionario', f.nome, 'descricao', a.descricao, 'valor', abs(a.valor), 'data', a.data_competencia) item
      from l13 a join f on f.id = a.funcionario_id
     where not a.tem and exists (select 1 from l13 b where b.tem and b.grupo = a.grupo and b.mes = a.mes)
       and ('recibo:' || a.id) not in (select chave from desc_vivo)),
  -- (4) documento vencendo em 30 dias (ou vencido), de funcionário não desligado
  p_doc as (
    select jsonb_build_object('tipo', 'documento_vence', 'chave', 'doc:' || d.id, 'documento_id', d.id, 'funcionario_id', d.funcionario_id,
             'funcionario', f.nome, 'especie', d.especie, 'nome', d.nome, 'vencimento', d.vencimento, 'dias', d.vencimento - current_date) item
      from folha_documentos d left join f on f.id = d.funcionario_id
     where d.cliente_id = p_cliente and d.cancelado_em is null and d.vencimento is not null and d.vencimento <= current_date + 30
       and coalesce(f.situacao, 'ativo') <> 'desligado' and ('doc:' || d.id) not in (select chave from desc_vivo)),
  -- (5) férias que vencem em dobro: período lido da escala com saldo e o último prazo em até 60 dias (ou passado), de funcionário não desligado
  p_fer as (
    select jsonb_build_object('tipo', 'ferias_vence', 'chave', 'ferias:' || p.id, 'periodo_id', p.id, 'funcionario_id', p.funcionario_id,
             'funcionario', f.nome, 'aquisitivo_inicio', p.aquisitivo_inicio, 'aquisitivo_fim', p.aquisitivo_fim, 'saldo_dias', p.saldo_dias,
             'ultimo_prazo', p.ultimo_prazo, 'dias', p.ultimo_prazo - current_date) item, p.ultimo_prazo
      from folha_ferias_periodos p join f on f.id = p.funcionario_id
     where p.cliente_id = p_cliente and p.saldo_dias > 0 and p.ultimo_prazo is not null and p.ultimo_prazo <= current_date + 60
       and f.situacao <> 'desligado' and ('ferias:' || p.id) not in (select chave from desc_vivo))
  select jsonb_build_object(
    'itens', coalesce((select jsonb_agg(item order by n desc) from p_fav), '[]'::jsonb)
             || coalesce((select jsonb_agg(item order by dt desc) from p_desc), '[]'::jsonb)
             || coalesce((select jsonb_agg(item) from p_rec), '[]'::jsonb)
             || coalesce((select jsonb_agg(item) from p_doc), '[]'::jsonb)
             || coalesce((select jsonb_agg(item order by ultimo_prazo) from p_fer), '[]'::jsonb),
    'descartadas', (select count(*) from desc_vivo))
    into v;
  return v;
end $$;

-- chegada: as funções novas fechadas; nenhum dado mudou
do $chegada$ begin
  if has_function_privilege('anon', 'public.fn_folha_mes(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_folha_mes(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_tipo(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_quinto_dia_util(date)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_dia_util_ate(date,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_folha_recibos_aplicar(uuid,uuid,jsonb,jsonb,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_folha_pendencia_descartar(uuid,text,text,boolean)', 'execute') then
    raise exception 'PR C: as permissões não conferem. Nada foi gravado.';
  end if;
  if _fn_folha_quinto_dia_util('2026-12-01') <> '2026-12-05' or _fn_folha_dia_util_ate('2026-12-20', false) <> '2026-12-18'
     or _fn_folha_dia_util_ate('2026-12-20', true) <> '2026-12-19' or _fn_folha_dia_util_ate('2026-11-30', true) <> '2026-11-30' then
    raise exception 'PR C: o calendário não confere. Nada foi gravado.';
  end if;
end $chegada$;
