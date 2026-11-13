-- FIN-GUARDA-CHUVA G1 (Chat 12/11 14:10/14:35, caminho (a) aprovado pelo Gabriel): a LINHA DE CRÉDITO de verdade no banco.
-- A cédula vira a linha (guarda-chuva: credor, nº, programa, limite, vigência); cada plano do banco será um contrato-filho (G3/G4).
-- Hoje (FASE 0): a tabela existe desde a FIN-FINANC-28 P1, mas NÃO há gravador (nem RPC, nem insert na tela) → 0 linhas, 0 de 325 contratos.
-- Sem dado de cliente. O que esta migration faz:
--   1. linha: + numero (nº da cédula), + cancelada (nada se apaga: cancelar com motivo); único vivo por (cliente, credor, nº).
--   2. trilha da linha (criada/editada/cancelada, antes × depois, motivo, autor).
--   3. escrita SÓ pelas RPCs: sai o INSERT/UPDATE/DELETE direto de `authenticated` (0 escritores no front, medido).
--   4. guarda no contrato: linha_credito_id só de linha VIVA do MESMO cliente (o criar e o cabeçalho aceitavam qualquer id: furo de tenant).
--   5. fn_linha_credito_salvar / fn_linha_credito_cancelar (prévia = p_simular, padrão true) e fn_linha_credito_tela (limite × soma dos filhos).
-- Regra da soma (G3): liberação 'liquidacao' cujo contrato liquidado é da MESMA linha não soma no liberado da linha (o dinheiro já
-- foi contado no contrato liquidado); ela aparece à parte em `liberado_por_liquidacao`.
set lock_timeout = '2s';

do $$
begin
  if exists (select 1 from public.financiamento_linhas_credito) then
    raise exception 'FIN-LINHA-G1: a tabela de linhas tem dado (medido vazio em 12/11): refazer a medição.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financiamento_linhas_credito'
               and column_name in ('numero', 'cancelado_em')) then
    raise exception 'FIN-LINHA-G1: as colunas já existem: refazer.';
  end if;
end $$;

-- ═══ 1. a linha ═══
alter table public.financiamento_linhas_credito
  add column numero           text,
  add column cancelado_em     timestamptz,
  add column cancelado_por    uuid,
  add column cancelado_motivo text;
create unique index uq_fin_linha_credito_viva on public.financiamento_linhas_credito
  (cliente_id, credor_id, lower(btrim(numero))) where cancelado_em is null and numero is not null;

-- ═══ 2. a trilha ═══
create table public.financiamento_linha_trilha (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  linha_id   uuid not null references public.financiamento_linhas_credito(id),
  acao       text not null check (acao in ('criada', 'editada', 'cancelada')),
  antes      jsonb,
  depois     jsonb,
  motivo     text,
  por        uuid,
  em         timestamptz not null default now()
);
create index idx_fin_linha_trilha_linha on public.financiamento_linha_trilha (linha_id, em);
alter table public.financiamento_linha_trilha enable row level security;
create policy fin_linha_trilha_select on public.financiamento_linha_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_linha_trilha from public, anon, authenticated;
grant select on public.financiamento_linha_trilha to authenticated;
grant all on public.financiamento_linha_trilha to service_role;

-- ═══ 3. escrita só pelas RPCs ═══
revoke insert, update, delete on public.financiamento_linhas_credito from authenticated;

-- ═══ 4. guarda do contrato ═══
create or replace function public._fn_financiamento_linha_guarda() returns trigger
language plpgsql security definer set search_path = public as $f$
declare v record;
begin
  if new.linha_credito_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.linha_credito_id is not distinct from old.linha_credito_id then return new; end if;
  select l.cliente_id, l.cancelado_em into v from public.financiamento_linhas_credito l where l.id = new.linha_credito_id;
  if not found or v.cliente_id <> new.cliente_id then
    raise exception using errcode = 'P0001', message = 'A linha de crédito escolhida não é deste cliente. Nada foi gravado.';
  end if;
  if v.cancelado_em is not null then
    raise exception using errcode = 'P0001', message = 'A linha de crédito escolhida está cancelada. Nada foi gravado.';
  end if;
  return new;
end $f$;
revoke all on function public._fn_financiamento_linha_guarda() from public, anon, authenticated;
create trigger trg_financiamento_linha_guarda before insert or update of linha_credito_id on public.financiamentos
  for each row execute function public._fn_financiamento_linha_guarda();

-- ═══ 5a. a linha como jsonb (uma regra só para prévia, trilha e tela) ═══
create or replace function public._fn_linha_credito_json(p_l public.financiamento_linhas_credito) returns jsonb
language sql stable set search_path = public as $f$
  select jsonb_build_object('credor_id', p_l.credor_id, 'numero', p_l.numero, 'programa', p_l.programa, 'descricao', p_l.descricao,
    'limite', p_l.limite, 'vigencia_inicio', p_l.vigencia_inicio, 'vigencia_fim', p_l.vigencia_fim)
$f$;
revoke all on function public._fn_linha_credito_json(public.financiamento_linhas_credito) from public, anon, authenticated;

-- ═══ 5b. salvar (criar ou editar) ═══
create or replace function public.fn_linha_credito_salvar(p_cliente_id uuid, p_id uuid, p_dados jsonb, p_motivo text default null,
  p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  c_campos constant text[] := array['credor_id', 'numero', 'programa', 'descricao', 'limite', 'vigencia_inicio', 'vigencia_fim'];
  a public.financiamento_linhas_credito; n public.financiamento_linhas_credito;
  k text; v_antes jsonb; v_depois jsonb; v_recusa jsonb; v_avisos jsonb := '[]'::jsonb; v_contratado numeric; v_id uuid;
  v_sim boolean := coalesce(p_simular, true);
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  for k in select jsonb_object_keys(d) loop
    if not k = any(c_campos) then raise exception using errcode = 'P0001', message = format('Campo %s não se edita aqui.', k); end if;
  end loop;
  if p_id is not null then
    select * into a from public.financiamento_linhas_credito where id = p_id;
    if not found or a.cliente_id <> p_cliente_id then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
    if a.cancelado_em is not null then
      return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', 'cancelada', 'frase', 'Esta linha de crédito está cancelada.'));
    end if;
    n := a;
  else
    n.cliente_id := p_cliente_id;
  end if;
  if d ? 'credor_id' then n.credor_id := nullif(d->>'credor_id', '')::uuid; end if;
  if d ? 'numero' then n.numero := nullif(btrim(coalesce(d->>'numero', '')), ''); end if;
  if d ? 'programa' then n.programa := nullif(btrim(coalesce(d->>'programa', '')), ''); end if;
  if d ? 'descricao' then n.descricao := nullif(btrim(coalesce(d->>'descricao', '')), ''); end if;
  if d ? 'limite' then n.limite := round(nullif(d->>'limite', '')::numeric, 2); end if;
  if d ? 'vigencia_inicio' then n.vigencia_inicio := nullif(d->>'vigencia_inicio', '')::date; end if;
  if d ? 'vigencia_fim' then n.vigencia_fim := nullif(d->>'vigencia_fim', '')::date; end if;

  if n.credor_id is not null and not exists (select 1 from public.financeiro_fornecedores x where x.id = n.credor_id and x.cliente_id = p_cliente_id) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if n.credor_id is null then
    v_recusa := jsonb_build_object('motivo', 'sem_credor', 'frase', 'Escolha o banco (credor) da linha de crédito.');
  elsif n.numero is null and n.programa is null and n.descricao is null then
    v_recusa := jsonb_build_object('motivo', 'sem_nome', 'frase', 'Informe o nº da cédula, o programa ou uma descrição.');
  elsif n.limite is not null and n.limite < 0 then
    v_recusa := jsonb_build_object('motivo', 'limite_negativo', 'frase', 'O limite não pode ser negativo.');
  elsif n.vigencia_inicio is not null and n.vigencia_fim is not null and n.vigencia_fim < n.vigencia_inicio then
    v_recusa := jsonb_build_object('motivo', 'vigencia_invertida', 'frase', 'O fim da vigência é antes do início.');
  elsif n.numero is not null and exists (select 1 from public.financiamento_linhas_credito o
          where o.cliente_id = p_cliente_id and o.credor_id = n.credor_id and lower(btrim(o.numero)) = lower(n.numero)
            and o.cancelado_em is null and o.id is distinct from p_id) then
    v_recusa := jsonb_build_object('motivo', 'repetida', 'frase', format('Já existe uma linha deste banco com o nº %s.', n.numero));
  end if;

  v_antes := case when p_id is null then null else public._fn_linha_credito_json(a) end;
  v_depois := public._fn_linha_credito_json(n);
  if v_recusa is not null then
    if not v_sim then raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa, 'antes', v_antes, 'depois', v_depois);
  end if;
  if p_id is not null and v_antes = v_depois then
    return jsonb_build_object('ok', true, 'simulado', v_sim, 'sem_mudanca', true, 'id', p_id, 'antes', v_antes, 'depois', v_depois, 'avisos', '[]'::jsonb);
  end if;

  -- avisos: explicam, não recusam
  if p_id is not null then
    select coalesce(sum(f.valor_total), 0) into v_contratado from public.financiamentos f
     where f.linha_credito_id = p_id and f.status is distinct from 'cancelado';
    if n.limite is not null and v_contratado > n.limite then
      v_avisos := v_avisos || jsonb_build_object('codigo', 'contratado_maior_que_limite', 'contratado', v_contratado, 'limite', n.limite);
    end if;
    if n.credor_id is distinct from a.credor_id and exists (select 1 from public.financiamentos f
         where f.linha_credito_id = p_id and f.status is distinct from 'cancelado' and f.credor_id is distinct from n.credor_id) then
      v_avisos := v_avisos || jsonb_build_object('codigo', 'contratos_de_outro_credor');
    end if;
  end if;

  if v_sim then
    return jsonb_build_object('ok', true, 'simulado', true, 'sem_mudanca', false, 'id', p_id, 'antes', v_antes, 'depois', v_depois, 'avisos', v_avisos);
  end if;
  if p_id is null then
    insert into public.financiamento_linhas_credito (cliente_id, credor_id, numero, programa, descricao, limite, vigencia_inicio, vigencia_fim, created_by)
    values (p_cliente_id, n.credor_id, n.numero, n.programa, n.descricao, n.limite, n.vigencia_inicio, n.vigencia_fim, auth.uid())
    returning id into v_id;
  else
    update public.financiamento_linhas_credito set credor_id = n.credor_id, numero = n.numero, programa = n.programa, descricao = n.descricao,
      limite = n.limite, vigencia_inicio = n.vigencia_inicio, vigencia_fim = n.vigencia_fim
     where id = p_id and cancelado_em is null
    returning id into v_id;
    if v_id is null then raise exception using errcode = 'P0001', message = 'Esta linha de crédito acabou de ser cancelada. Nada foi gravado.'; end if;
  end if;
  insert into public.financiamento_linha_trilha (cliente_id, linha_id, acao, antes, depois, motivo, por)
  values (p_cliente_id, v_id, case when p_id is null then 'criada' else 'editada' end, v_antes, v_depois,
          nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'sem_mudanca', false, 'id', v_id, 'antes', v_antes, 'depois', v_depois, 'avisos', v_avisos);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'Já existe uma linha deste banco com este nº (acabou de ser criada). Nada foi gravado.';
end $f$;

-- ═══ 5c. cancelar (nada se apaga) ═══
create or replace function public.fn_linha_credito_cancelar(p_id uuid, p_motivo text, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare a public.financiamento_linhas_credito; v_n int; v_sim boolean := coalesce(p_simular, true);
begin
  select * into a from public.financiamento_linhas_credito where id = p_id;
  if not found or not coalesce(public.tenant_ok(a.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if a.cancelado_em is not null then
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', 'ja_cancelada', 'frase', 'Esta linha de crédito já foi cancelada.'));
  end if;
  select count(*) into v_n from public.financiamentos f where f.linha_credito_id = p_id and f.status is distinct from 'cancelado';
  if v_n > 0 then
    if not v_sim then
      raise exception using errcode = 'P0001', message = format('Esta linha tem %s contrato(s): tire-os da linha antes. Nada foi gravado.', v_n);
    end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', 'tem_contratos', 'contratos', v_n,
      'frase', format('Esta linha tem %s contrato(s): tire-os da linha antes.', v_n)));
  end if;
  if v_sim then return jsonb_build_object('ok', true, 'simulado', true, 'id', p_id); end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo para cancelar a linha. Nada foi gravado.';
  end if;
  update public.financiamento_linhas_credito set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and cancelado_em is null;
  insert into public.financiamento_linha_trilha (cliente_id, linha_id, acao, antes, depois, motivo, por)
  values (a.cliente_id, p_id, 'cancelada', public._fn_linha_credito_json(a), null, btrim(p_motivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', p_id);
end $f$;

-- ═══ 5d. a tela da linha: limite × soma dos contratos-filhos ═══
create or replace function public.fn_linha_credito_tela(p_id uuid, p_hoje date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare a public.financiamento_linhas_credito; v_hoje date := coalesce(p_hoje, current_date); v_contratos jsonb; v_tot jsonb; v_avisos jsonb := '[]'::jsonb;
begin
  select * into a from public.financiamento_linhas_credito where id = p_id;
  if not found or not coalesce(public.tenant_ok(a.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  with c as (
    select f.id, f.numero_contrato, f.descricao, f.status, f.credor_id, coalesce(f.valor_total, 0) as contratado,
      (select coalesce(sum(l.valor), 0) from public.financiamento_liberacoes l
        where l.financiamento_id = f.id and l.cancelado_em is null
          and not (l.forma = 'liquidacao' and exists (select 1 from public.financiamentos g
                     where g.id = l.contrato_liquidado_id and g.linha_credito_id = p_id))) as liberado,
      (select coalesce(sum(l.valor), 0) from public.financiamento_liberacoes l
        where l.financiamento_id = f.id and l.cancelado_em is null and l.forma = 'liquidacao'
          and exists (select 1 from public.financiamentos g where g.id = l.contrato_liquidado_id and g.linha_credito_id = p_id)) as liberado_por_liquidacao,
      public.fn_financiamento_saldo(f.id, v_hoje) as s
      from public.financiamentos f
     where f.linha_credito_id = p_id and f.status is distinct from 'cancelado'
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero_contrato, 'descricao', c.descricao, 'status', c.status,
           'contratado', c.contratado, 'liberado', c.liberado, 'liberado_por_liquidacao', c.liberado_por_liquidacao,
           'saldo', coalesce((c.s->>'saldo')::numeric, 0), 'juros_pagos', coalesce((c.s->>'juros_pagos')::numeric, 0),
           'credor_diferente', c.credor_id is distinct from a.credor_id)
           order by c.numero_contrato nulls last, c.id), '[]'::jsonb),
         jsonb_build_object('contratos', count(*), 'contratado', coalesce(sum(c.contratado), 0), 'liberado', coalesce(sum(c.liberado), 0),
           'liberado_por_liquidacao', coalesce(sum(c.liberado_por_liquidacao), 0),
           'falta_liberar', case when a.limite is null then null else a.limite - coalesce(sum(c.liberado), 0) end,
           'saldo', coalesce(sum(coalesce((c.s->>'saldo')::numeric, 0)), 0), 'juros_pagos', coalesce(sum(coalesce((c.s->>'juros_pagos')::numeric, 0)), 0)),
         case when bool_or(c.credor_id is distinct from a.credor_id) then jsonb_build_array(jsonb_build_object('codigo', 'contrato_de_outro_credor')) else '[]'::jsonb end
    into v_contratos, v_tot, v_avisos
    from c;
  if a.limite is not null and (v_tot->>'liberado')::numeric > a.limite then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'liberado_maior_que_limite');
  end if;
  if a.vigencia_fim is not null and v_hoje > a.vigencia_fim and (v_tot->>'falta_liberar')::numeric > 0 then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'vigencia_encerrada_com_saldo_a_liberar');
  end if;
  return jsonb_build_object('linha', public._fn_linha_credito_json(a) || jsonb_build_object('id', a.id,
           'credor', (select x.nome from public.financeiro_fornecedores x where x.id = a.credor_id)),
         'contratos', v_contratos, 'totais', v_tot, 'avisos', v_avisos);
end $f$;

-- ═══ ACL ═══
revoke all on function public.fn_linha_credito_salvar(uuid, uuid, jsonb, text, boolean) from public, anon;
revoke all on function public.fn_linha_credito_cancelar(uuid, text, boolean) from public, anon;
revoke all on function public.fn_linha_credito_tela(uuid, date) from public, anon;
grant execute on function public.fn_linha_credito_salvar(uuid, uuid, jsonb, text, boolean) to authenticated, service_role;
grant execute on function public.fn_linha_credito_cancelar(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_linha_credito_tela(uuid, date) to authenticated, service_role;
