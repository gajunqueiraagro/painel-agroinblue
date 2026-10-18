-- FIN-CONTRATO-JUNTAR-01 (Gabriel 18/10/2026) — juntar dois cadastros do MESMO contrato num so': o 2º vira liberacao do 1º.
-- Caso piloto: NJ PR-78.192 BRDE (2c2cdeb7 mantido · f992f503 absorvido) — um contrato de 955.395,00 com duas liberacoes.
--
-- fn_financiamento_juntar(p_manter, p_absorver, p_simular default true):
--   · recusa: o mesmo contrato, clientes / credores / natureza diferentes, compra parcelada, contrato baixado (so' ativo ou
--     prorrogado; `_fn_contrato_credito_vigente`), e parcela paga, com pagamento registrado, vinculada ou casada com o extrato
--     (`_fn_parcela_credito_trava`) — recusa com a LISTA;
--   · contratado do mantido = soma dos dois;
--   · liberacoes do absorvido passam ao mantido; a CAPTACAO de cada lado (lancamento_captacao_id vivo, sem liberacao viva nele) vira
--     liberacao em conta, com a data e o valor REAL do lancamento. Nada e' ajustado para bater: a divergencia contra o contratado fica a'
--     vista (o "A resolver" do contrato mostra "liberado maior que o contratado");
--   · cronograma: parcela de MESMO vencimento soma principal e juros (ajustada se qualquer lado era); a que nao casa passa inteira.
--     Os lancamentos gerados dos dois lados sao cancelados pelo dono e o MOTOR regera um por parcela, com a descricao padrao;
--   · encargos e documentos passam ao mantido; destinacao de mesmo nome soma valor e orcado (as liberacoes apontam para a que fica);
--   · o absorvido e' ENCERRADO ('cancelado', baixa_em/por, baixa_motivo "juntado ao <nº> (<id>)", contrato_sucessor_id = o mantido) —
--     nunca DELETE;
--   · simulacao = gravacao desfeita ('FJSIM'); devolve antes × depois (contratado, liberado, saldo, parcelas, principal/juros por
--     vencimento, lancamentos cancelados/criados).
-- fn_financiamento_juntar_desfazer(p_juncao_id, p_simular default true): so' a juncao viva; volta tudo pela tabela de antes
--   (contratos, parcelas, liberacoes, destinacoes, documentos, encargos); a liberacao que nasceu da captacao e' cancelada; o motor refaz
--   os lancamentos dos dois. Recusa se uma parcela do mantido travou depois.
-- fn_contrato_tela: o historico ganha o evento da juncao ("Juntado com <nº>" / "Juntado ao <nº>") com o id e se ainda se desfaz
--   (patch guardado por md5).
set local lock_timeout = '2s';

create table if not exists public.financiamento_juncoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  mantido_id uuid not null references public.financiamentos(id) on delete restrict,
  absorvido_id uuid not null references public.financiamentos(id) on delete restrict,
  antes jsonb not null,
  depois jsonb not null,
  feita_em timestamptz not null default clock_timestamp(),
  feita_por uuid,
  desfeita_em timestamptz,
  desfeita_por uuid,
  constraint fin_juncoes_distintos check (mantido_id <> absorvido_id)
);
create index if not exists idx_fin_juncoes_mantido on public.financiamento_juncoes (mantido_id);
create index if not exists idx_fin_juncoes_absorvido on public.financiamento_juncoes (absorvido_id);
alter table public.financiamento_juncoes enable row level security;
drop policy if exists fin_juncoes_select on public.financiamento_juncoes;
create policy fin_juncoes_select on public.financiamento_juncoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_juncoes from public, anon, authenticated;
grant select on public.financiamento_juncoes to authenticated;
grant all on public.financiamento_juncoes to service_role;

/* a foto de um contrato para a juncao: a linha, as parcelas, liberacoes, destinacoes, documentos e encargos (ids e o que muda) */
create or replace function public._fn_juncao_foto(p_fin uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'contrato', (select jsonb_build_object('id', f.id, 'numero_contrato', f.numero_contrato, 'valor_total', f.valor_total, 'status', f.status,
       'baixa_em', f.baixa_em, 'baixa_por', f.baixa_por, 'baixa_motivo', f.baixa_motivo, 'contrato_sucessor_id', f.contrato_sucessor_id,
       'total_parcelas', f.total_parcelas, 'vencimento_final', f.vencimento_final) from public.financiamentos f where f.id = p_fin),
    'parcelas', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'financiamento_id', q.financiamento_id, 'numero_parcela', q.numero_parcela,
       'data_vencimento', q.data_vencimento, 'valor_principal', q.valor_principal, 'valor_juros', q.valor_juros, 'valor_total', q.valor_total,
       'status', q.status, 'ajustada', q.ajustada) order by q.data_vencimento, q.numero_parcela), '[]'::jsonb)
       from public.financiamento_parcelas q where q.financiamento_id = p_fin),
    'liberacoes', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'financiamento_id', l.financiamento_id, 'destinacao_id', l.destinacao_id,
       'cancelado_em', l.cancelado_em)), '[]'::jsonb) from public.financiamento_liberacoes l where l.financiamento_id = p_fin),
    'destinacoes', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from public.financiamento_destinacoes d where d.financiamento_id = p_fin),
    'documentos', (select coalesce(jsonb_agg(d.id), '[]'::jsonb) from public.financiamento_documentos d where d.financiamento_id = p_fin),
    'encargos', (select coalesce(jsonb_agg(e.id), '[]'::jsonb) from public.financiamento_encargos e where e.financiamento_id = p_fin))
$$;

/* o numero do contrato que a tela mostra (o resumo da simulacao) */
create or replace function public._fn_juncao_resumo(p_fin uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select jsonb_build_object('id', f.id, 'numero_contrato', f.numero_contrato, 'status', f.status, 'contratado', f.valor_total,
    'liberado', (select coalesce(sum(l.valor), 0) from public.financiamento_liberacoes l where l.financiamento_id = f.id and l.cancelado_em is null),
    'saldo', (public._fn_financiamento_saldo(f.id, current_date) ->> 'saldo')::numeric,
    'parcelas', (select count(*) from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'),
    'cronograma', (select coalesce(jsonb_agg(jsonb_build_object('vencimento', q.data_vencimento, 'principal', q.valor_principal, 'juros', q.valor_juros,
       'ajustada', q.ajustada) order by q.data_vencimento), '[]'::jsonb)
       from public.financiamento_parcelas q where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'))
  from public.financiamentos f where f.id = p_fin
$$;

/* cancela pelo dono os lancamentos vivos da parcela (gerados pelo motor) e solta as FKs: o motor regera */
create or replace function public._fn_juncao_soltar_lancamentos(p_parcela uuid, p_motivo text)
returns int language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.financiamento_parcelas%rowtype; v_l uuid; v_n int := 0;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela for update;
  foreach v_l in array array_remove(array[q.lancamento_id, q.lancamento_juros_id], null) loop
    if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = v_l and not coalesce(l.cancelado, false)) then
      perform public.fn_cancelar_lancamento_auditoria(v_l, p_motivo);
      v_n := v_n + 1;
    end if;
  end loop;
  update public.financiamento_parcelas set lancamento_id = null, lancamento_juros_id = null where id = p_parcela;
  return v_n;
end $$;

create or replace function public._fn_financiamento_juntar_exec(p_manter uuid, p_absorver uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  m public.financiamentos%rowtype; a public.financiamentos%rowtype; v_antes jsonb; v_res_antes jsonb; v_travas text[] := '{}'; v_t text;
  q record; v_par uuid; v_canc int := 0; v_lanc_antes uuid[]; v_lanc_depois uuid[]; d record; v_dm uuid; f record; v_l record; v_id uuid;
  v_motivo text;
begin
  if p_manter = p_absorver then raise exception using errcode = 'P0001', message = 'Escolha dois contratos diferentes.'; end if;
  m := public._fn_contrato_credito_vigente(p_manter);
  a := public._fn_contrato_credito_vigente(p_absorver);
  if m.cliente_id is distinct from a.cliente_id then raise exception using errcode = 'P0001', message = 'Os contratos são de clientes diferentes.'; end if;
  if m.credor_id is distinct from a.credor_id then raise exception using errcode = 'P0001', message = 'Os contratos têm credores diferentes.'; end if;
  if m.natureza is distinct from a.natureza then raise exception using errcode = 'P0001', message = format('Naturezas diferentes (%s × %s).', m.natureza, a.natureza); end if;
  perform 1 from public.financiamentos where id in (p_manter, p_absorver) order by id for update;

  for q in select x.id, x.numero_parcela, x.financiamento_id from public.financiamento_parcelas x
            where x.financiamento_id in (p_manter, p_absorver) and coalesce(x.status, '') <> 'cancelado' order by x.data_vencimento loop
    v_t := public._fn_parcela_credito_trava(q.id);
    if v_t is not null then
      v_travas := array_append(v_travas, (case when q.financiamento_id = p_manter then coalesce(m.numero_contrato, 'mantido') else coalesce(a.numero_contrato, 'absorvido') end)
        || (case when q.financiamento_id = p_manter then ' (mantido)' else ' (absorvido)' end) || ': ' || v_t);
    end if;
  end loop;
  if cardinality(v_travas) > 0 then
    raise exception using errcode = 'P0001', message = 'Não dá para juntar: ' || array_to_string(v_travas, '; ');
  end if;

  v_antes := jsonb_build_object('mantido', public._fn_juncao_foto(p_manter), 'absorvido', public._fn_juncao_foto(p_absorver));
  v_res_antes := jsonb_build_object('mantido', public._fn_juncao_resumo(p_manter), 'absorvido', public._fn_juncao_resumo(p_absorver));
  v_motivo := format('juntado ao %s (%s)', coalesce(m.numero_contrato, 'sem nº'), p_manter);
  select array_agg(x) into v_lanc_antes from (
    select lancamento_id x from public.financiamento_parcelas where financiamento_id in (p_manter, p_absorver) and lancamento_id is not null
    union select lancamento_juros_id from public.financiamento_parcelas where financiamento_id in (p_manter, p_absorver) and lancamento_juros_id is not null) s;

  /* a captacao de cada lado vira liberacao em conta, com a data e o valor REAL do lancamento */
  for f in select x.* from public.financiamentos x where x.id in (p_manter, p_absorver) and x.lancamento_captacao_id is not null loop
    select l.id, l.valor, coalesce(l.data_pagamento, l.data_competencia) as data into v_l from public.financeiro_lancamentos_v2 l
     where l.id = f.lancamento_captacao_id and not coalesce(l.cancelado, false);
    if found and not exists (select 1 from public.financiamento_liberacoes x where x.lancamento_id = v_l.id and x.cancelado_em is null) then
      insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, lancamento_id, observacao)
      values (m.cliente_id, p_manter, v_l.data, abs(v_l.valor), 'conta', v_l.id, 'captação do ' || coalesce(f.numero_contrato, 'contrato') || ' · ' || v_motivo);
    end if;
  end loop;

  /* liberacoes, documentos e encargos do absorvido passam ao mantido */
  update public.financiamento_liberacoes set financiamento_id = p_manter where financiamento_id = p_absorver;
  update public.financiamento_documentos set financiamento_id = p_manter where financiamento_id = p_absorver;
  update public.financiamento_encargos set financiamento_id = p_manter where financiamento_id = p_absorver;

  /* destinacoes: a de mesmo nome soma valor e orcado (as liberacoes apontam para a que fica); a outra passa inteira */
  for d in select * from public.financiamento_destinacoes where financiamento_id = p_absorver loop
    select x.id into v_dm from public.financiamento_destinacoes x where x.financiamento_id = p_manter
       and lower(btrim(x.descricao)) = lower(btrim(d.descricao)) limit 1;
    if v_dm is not null then
      update public.financiamento_destinacoes set valor = coalesce(valor, 0) + coalesce(d.valor, 0),
             valor_orcado = case when valor_orcado is null and d.valor_orcado is null then null else coalesce(valor_orcado, 0) + coalesce(d.valor_orcado, 0) end
       where id = v_dm;
      update public.financiamento_liberacoes set destinacao_id = v_dm where destinacao_id = d.id;
      delete from public.financiamento_destinacoes where id = d.id;
    else
      update public.financiamento_destinacoes set financiamento_id = p_manter where id = d.id;
    end if;
    v_dm := null;
  end loop;

  /* cronograma: soma por vencimento; os lancamentos gerados dos dois lados saem e o motor regera */
  for q in select x.* from public.financiamento_parcelas x where x.financiamento_id = p_manter and coalesce(x.status, '') <> 'cancelado' loop
    v_canc := v_canc + public._fn_juncao_soltar_lancamentos(q.id, v_motivo);
  end loop;
  for q in select x.* from public.financiamento_parcelas x where x.financiamento_id = p_absorver and coalesce(x.status, '') <> 'cancelado' order by x.data_vencimento loop
    v_canc := v_canc + public._fn_juncao_soltar_lancamentos(q.id, v_motivo);
    select x.id into v_par from public.financiamento_parcelas x where x.financiamento_id = p_manter and coalesce(x.status, '') <> 'cancelado'
       and x.data_vencimento = q.data_vencimento limit 1;
    if v_par is not null then
      update public.financiamento_parcelas set valor_principal = coalesce(valor_principal, 0) + coalesce(q.valor_principal, 0),
             valor_juros = coalesce(valor_juros, 0) + coalesce(q.valor_juros, 0),
             valor_total = coalesce(valor_principal, 0) + coalesce(q.valor_principal, 0) + coalesce(valor_juros, 0) + coalesce(q.valor_juros, 0),
             ajustada = ajustada or q.ajustada, updated_at = now()
       where id = v_par;
      update public.financiamento_parcelas set status = 'cancelado', updated_at = now() where id = q.id;
    else
      update public.financiamento_parcelas set financiamento_id = p_manter, updated_at = now() where id = q.id;
    end if;
    v_par := null;
  end loop;

  /* o mantido: contratado = soma; o absorvido: encerrado, com o link — nunca DELETE */
  update public.financiamentos set valor_total = coalesce(m.valor_total, 0) + coalesce(a.valor_total, 0), updated_at = now() where id = p_manter;
  update public.financiamentos set status = 'cancelado', baixa_em = now(), baixa_por = auth.uid(), baixa_motivo = v_motivo,
         contrato_sucessor_id = p_manter, total_parcelas = 0, updated_at = now() where id = p_absorver;
  perform public._fn_parcelas_credito_fechar(p_manter);

  select array_agg(x) into v_lanc_depois from (
    select lancamento_id x from public.financiamento_parcelas where financiamento_id = p_manter and coalesce(status, '') <> 'cancelado' and lancamento_id is not null
    union select lancamento_juros_id from public.financiamento_parcelas where financiamento_id = p_manter and coalesce(status, '') <> 'cancelado' and lancamento_juros_id is not null) s;

  insert into public.financiamento_juncoes (cliente_id, mantido_id, absorvido_id, antes, depois, feita_por)
  values (m.cliente_id, p_manter, p_absorver, v_antes, jsonb_build_object('mantido', public._fn_juncao_foto(p_manter), 'absorvido', public._fn_juncao_foto(p_absorver)), auth.uid())
  returning id into v_id;

  return jsonb_build_object('juncao_id', v_id, 'antes', v_res_antes, 'depois', public._fn_juncao_resumo(p_manter),
    'lancamentos', jsonb_build_object('cancelados', v_canc,
      'criados', (select count(*) from unnest(coalesce(v_lanc_depois, '{}'::uuid[])) x where not x = any(coalesce(v_lanc_antes, '{}'::uuid[])))));
end $$;

create or replace function public._fn_financiamento_juntar_desfazer_exec(p_juncao uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare j public.financiamento_juncoes%rowtype; lado text; c jsonb; x jsonb; v_t text; v_motivo text;
begin
  select * into j from public.financiamento_juncoes where id = p_juncao for update;
  if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  perform public._fn_contrato_do_usuario(j.mantido_id);
  if j.desfeita_em is not null then raise exception using errcode = 'P0001', message = 'Esta junção já foi desfeita.'; end if;
  for x in select e from public.financiamento_parcelas q, lateral (select to_jsonb(q) e) s where q.financiamento_id = j.mantido_id and coalesce(q.status, '') <> 'cancelado' loop
    v_t := public._fn_parcela_credito_trava((x->>'id')::uuid);
    if v_t is not null then raise exception using errcode = 'P0001', message = v_t || ' Ela mudou depois da junção: o desfazer não a toca.'; end if;
  end loop;
  v_motivo := 'desfazer a junção ' || left(j.id::text, 8);

  /* os lancamentos que o motor criou no mantido saem; os dois lados regeram no fim */
  for x in select to_jsonb(q) from public.financiamento_parcelas q where q.financiamento_id = j.mantido_id and coalesce(q.status, '') <> 'cancelado' loop
    perform public._fn_juncao_soltar_lancamentos((x->>'id')::uuid, v_motivo);
  end loop;

  foreach lado in array array['mantido', 'absorvido'] loop
    c := j.antes -> lado;
    update public.financiamentos f set valor_total = (c #>> '{contrato,valor_total}')::numeric, status = c #>> '{contrato,status}',
           baixa_em = (c #>> '{contrato,baixa_em}')::timestamptz, baixa_por = (c #>> '{contrato,baixa_por}')::uuid,
           baixa_motivo = c #>> '{contrato,baixa_motivo}', contrato_sucessor_id = (c #>> '{contrato,contrato_sucessor_id}')::uuid, updated_at = now()
     where f.id = (c #>> '{contrato,id}')::uuid;
    for x in select * from jsonb_array_elements(c -> 'parcelas') loop
      update public.financiamento_parcelas set financiamento_id = (x->>'financiamento_id')::uuid, numero_parcela = (x->>'numero_parcela')::int,
             data_vencimento = (x->>'data_vencimento')::date, valor_principal = (x->>'valor_principal')::numeric, valor_juros = (x->>'valor_juros')::numeric,
             valor_total = (x->>'valor_total')::numeric, status = x->>'status', ajustada = (x->>'ajustada')::boolean, updated_at = now()
       where id = (x->>'id')::uuid;
    end loop;
    for x in select * from jsonb_array_elements(c -> 'destinacoes') loop
      if exists (select 1 from public.financiamento_destinacoes where id = (x->>'id')::uuid) then
        update public.financiamento_destinacoes d set financiamento_id = (x->>'financiamento_id')::uuid, valor = (x->>'valor')::numeric,
               valor_orcado = (x->>'valor_orcado')::numeric where d.id = (x->>'id')::uuid;
      else
        insert into public.financiamento_destinacoes select * from jsonb_populate_record(null::public.financiamento_destinacoes, x);
      end if;
    end loop;
    for x in select * from jsonb_array_elements(c -> 'liberacoes') loop
      update public.financiamento_liberacoes set financiamento_id = (x->>'financiamento_id')::uuid, destinacao_id = (x->>'destinacao_id')::uuid
       where id = (x->>'id')::uuid;
    end loop;
    update public.financiamento_documentos set financiamento_id = (c #>> '{contrato,id}')::uuid
     where id in (select (e #>> '{}')::uuid from jsonb_array_elements(c -> 'documentos') e);
    update public.financiamento_encargos set financiamento_id = (c #>> '{contrato,id}')::uuid
     where id in (select (e #>> '{}')::uuid from jsonb_array_elements(c -> 'encargos') e);
  end loop;
  /* a liberacao que nasceu da captacao (nao estava em nenhuma foto de antes) e' cancelada */
  update public.financiamento_liberacoes set cancelado_em = now(), cancelado_motivo = v_motivo
   where financiamento_id = j.mantido_id and cancelado_em is null
     and id not in (select (e->>'id')::uuid from jsonb_array_elements((j.antes #> '{mantido,liberacoes}') || (j.antes #> '{absorvido,liberacoes}')) e);

  perform public._fn_parcelas_credito_fechar(j.mantido_id);
  perform public._fn_parcelas_credito_fechar(j.absorvido_id);
  /* o fechamento recalcula total e vencimento final; o desfazer devolve os de antes, como estavam */
  foreach lado in array array['mantido', 'absorvido'] loop
    c := j.antes -> lado;
    update public.financiamentos f set total_parcelas = (c #>> '{contrato,total_parcelas}')::int, vencimento_final = (c #>> '{contrato,vencimento_final}')::date
     where f.id = (c #>> '{contrato,id}')::uuid;
  end loop;
  update public.financiamento_juncoes set desfeita_em = now(), desfeita_por = auth.uid() where id = j.id;
  return jsonb_build_object('juncao_id', j.id, 'mantido', public._fn_juncao_resumo(j.mantido_id), 'absorvido', public._fn_juncao_resumo(j.absorvido_id));
end $$;

create or replace function public.fn_financiamento_juntar(p_manter uuid, p_absorver uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  perform public._fn_contrato_do_usuario(p_manter);
  perform public._fn_contrato_do_usuario(p_absorver);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_juntar_exec(p_manter, p_absorver);
      raise exception using errcode = 'FJSIM', message = r::text;
    exception
      when sqlstate 'FJSIM' then return (sqlerrm::jsonb - 'juncao_id') || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  begin
    return public._fn_financiamento_juntar_exec(p_manter, p_absorver) || jsonb_build_object('simulado', false);
  exception when sqlstate 'P0001' then raise exception using errcode = 'P0001', message = sqlerrm || ' Nada foi gravado.';
  end;
end $$;

create or replace function public.fn_financiamento_juntar_desfazer(p_juncao_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb; v_m uuid;
begin
  select mantido_id into v_m from public.financiamento_juncoes where id = p_juncao_id;
  if v_m is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  perform public._fn_contrato_do_usuario(v_m);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_juntar_desfazer_exec(p_juncao_id);
      raise exception using errcode = 'FJSIM', message = r::text;
    exception
      when sqlstate 'FJSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  begin
    return public._fn_financiamento_juntar_desfazer_exec(p_juncao_id) || jsonb_build_object('simulado', false);
  exception when sqlstate 'P0001' then raise exception using errcode = 'P0001', message = sqlerrm || ' Nada foi gravado.';
  end;
end $$;

/* fn_contrato_tela: o historico ganha a juncao (patch guardado por md5) */
do $patch$
declare
  c_origem  constant text := '0c31b8f251f5539b8797bb9f31d0c70f';
  c_destino constant text := '121e4f0911ceb5241a1b4572c9132ac0';
  c_ancora  constant text := E'\n    into v_hist from h;';
  c_novo    constant text := E'\n    into v_hist from h;\n  /* FIN-CONTRATO-JUNTAR-01: a juncao no historico, com o id e se ainda se desfaz (so\x27 a viva) */\n'
    || E'  v_hist := coalesce((select jsonb_agg(jsonb_build_object(\x27data\x27, j.feita_em::date, \x27evento\x27,\n'
    || E'      case when j.mantido_id = f.id then \x27Juntado com \x27 || coalesce(o.numero_contrato, \x27sem nº\x27) else \x27Juntado ao \x27 || coalesce(o.numero_contrato, \x27sem nº\x27) end\n'
    || E'      || case when j.desfeita_em is not null then \x27 · desfeito em \x27 || to_char(j.desfeita_em, \x27DD/MM/YYYY\x27) else \x27\x27 end,\n'
    || E'      \x27valor\x27, null, \x27juncao_id\x27, j.id, \x27desfazivel\x27, j.desfeita_em is null) order by j.feita_em desc)\n'
    || E'    from public.financiamento_juncoes j join public.financiamentos o on o.id = case when j.mantido_id = f.id then j.absorvido_id else j.mantido_id end\n'
    || E'    where f.id in (j.mantido_id, j.absorvido_id)), \x27[]\x27::jsonb) || v_hist;';
  v_oid oid; v_src text; v_n int;
begin
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p where p.proname = 'fn_contrato_tela' and p.pronamespace = 'public'::regnamespace;
  if md5(v_src) is distinct from c_origem then raise exception 'fn_contrato_tela: md5 de origem %', md5(v_src); end if;
  v_n := (length(v_src) - length(replace(v_src, c_ancora, ''))) / length(c_ancora);
  if v_n <> 1 then raise exception 'fn_contrato_tela: ancora casou % vezes', v_n; end if;
  execute replace(pg_get_functiondef(v_oid), c_ancora, c_novo);
  select md5(p.prosrc) into v_src from pg_proc p where p.oid = v_oid;
  if v_src is distinct from c_destino then raise exception 'fn_contrato_tela: md5 de destino %', v_src; end if;
end
$patch$;

do $acl$
declare s text;
begin
  foreach s in array array['public._fn_juncao_foto(uuid)', 'public._fn_juncao_resumo(uuid)', 'public._fn_juncao_soltar_lancamentos(uuid, text)',
    'public._fn_financiamento_juntar_exec(uuid, uuid)', 'public._fn_financiamento_juntar_desfazer_exec(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', s);
    execute format('grant execute on function %s to service_role', s);
  end loop;
  foreach s in array array['public.fn_financiamento_juntar(uuid, uuid, boolean)', 'public.fn_financiamento_juntar_desfazer(uuid, boolean)',
    'public.fn_contrato_tela(uuid, date)'] loop
    execute format('revoke all on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated, service_role', s);
  end loop;
end $acl$;
