-- BPO-APROVACAO-01 · lote 1 — a FILA DE APROVAÇÃO de pagamentos (mock aprovado 17/11; D1–D10 como recomendado).
--   D1 o aprovador é uma MARCA por pessoa e cliente (financeiro_aprovadores), não um perfil novo: o perfil gestor da lançadora não muda.
--   D2 a aprovação é um EIXO PRÓPRIO (financeiro_aprovacoes, uma rodada por linha, a FOTO do que foi aprovado); o status do lançamento
--      (previsto/programado/agendado/realizado) NÃO muda de significado — "Pago" segue sendo o realizado que o banco põe.
--   D3 com o BPO ligado no cliente, o banco RECUSA marcar uma saída como AGENDADA sem aprovação viva (o gatilho deste lote).
--      ⚠ O "realizado à mão" fica para o lote 2: antes, a FASE 0 de todo gravador que põe realizado fora da conciliação.
--   D4 entra na fila a saída não realizada que vence a partir do "desde" da configuração (o que já está aberto vira a 1ª fila).
--   D5 fora: transferência entre contas próprias (3-Transferências) e entradas — só "2-Saídas".
--   D6 editar valor, vencimento, favorecido, conta, plano ou fazenda de um APROVADO abre uma rodada nova "aguardando" (gatilho).
--   D7 os alertas (pago sem aprovação · aprovado e não pago · pago diferente do aprovado) são LEITURA calculada (fn_aprovacao_alertas):
--      nada bloqueia a conciliação, nenhum gatilho novo nela.
--   D9 aprovar vale por lançamento; a tela manda as N parcelas de uma compra numa chamada (a RPC já é em lote).
--   D10 quem é aprovador e ENVIA o próprio lançamento: nasce aprovado, com "lançado e aprovado pela mesma pessoa".
-- Avisos (e-mail / WhatsApp, D8) e o saldo previsto por dia na tela são o lote/PR seguinte. Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.financeiro_aprovacoes') is not null or to_regclass('public.financeiro_bpo_config') is not null
     or to_regclass('public.financeiro_aprovadores') is not null then
    raise exception 'BPO-APROVACAO-01: as tabelas já existem: refazer.';
  end if;
end $$;

create table public.financeiro_bpo_config (
  cliente_id       uuid primary key references public.clientes(id),
  ativo            boolean not null default false,
  desde            date not null,
  dias_semana      smallint[] check (dias_semana is null or dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]),  -- nulo = livre (D: os dias ainda não definidos)
  horario_limite   time,
  avisar_email     boolean not null default true,
  avisar_whatsapp  boolean not null default true,
  atualizado_por   uuid not null,
  atualizado_em    timestamptz not null default now()
);
alter table public.financeiro_bpo_config enable row level security;
create policy financeiro_bpo_config_select on public.financeiro_bpo_config for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financeiro_bpo_config from public, anon, authenticated;
grant select on public.financeiro_bpo_config to authenticated;
grant all on public.financeiro_bpo_config to service_role;

create table public.financeiro_aprovadores (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  user_id        uuid not null,
  ativo          boolean not null default true,
  criado_por     uuid not null,
  criado_em      timestamptz not null default now(),
  desligado_por  uuid,
  desligado_em   timestamptz,
  check (ativo = (desligado_em is null))
);
create unique index ux_financeiro_aprovadores_vivo on public.financeiro_aprovadores (cliente_id, user_id) where ativo;
alter table public.financeiro_aprovadores enable row level security;
create policy financeiro_aprovadores_select on public.financeiro_aprovadores for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financeiro_aprovadores from public, anon, authenticated;
grant select on public.financeiro_aprovadores to authenticated;
grant all on public.financeiro_aprovadores to service_role;

create table public.financeiro_aprovacoes (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id),
  lancamento_id   uuid not null references public.financeiro_lancamentos_v2(id),
  rodada          integer not null check (rodada >= 1),
  situacao        text not null check (situacao in ('aguardando', 'aprovado', 'recusado', 'substituido')),
  motivo          text check (length(motivo) <= 500),
  observacao      text check (length(observacao) <= 300),
  foto            jsonb not null,
  pedido_por      uuid not null,
  pedido_em       timestamptz not null default now(),
  decidido_por    uuid,
  decidido_em     timestamptz,
  check ((situacao in ('aprovado', 'recusado')) = (decidido_em is not null) or situacao = 'substituido'),
  check (situacao <> 'recusado' or length(btrim(coalesce(motivo, ''))) >= 3),
  unique (lancamento_id, rodada)
);
-- uma rodada VIVA por lançamento (a substituída é histórico)
create unique index ux_financeiro_aprovacoes_viva on public.financeiro_aprovacoes (lancamento_id) where situacao <> 'substituido';
create index ix_financeiro_aprovacoes_cliente on public.financeiro_aprovacoes (cliente_id, situacao);
alter table public.financeiro_aprovacoes enable row level security;
create policy financeiro_aprovacoes_select on public.financeiro_aprovacoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financeiro_aprovacoes from public, anon, authenticated;
grant select on public.financeiro_aprovacoes to authenticated;
grant all on public.financeiro_aprovacoes to service_role;

-- a FOTO do que se aprova (D6): só os campos que, mudando, pedem aprovação de novo
create function public._fn_aprovacao_foto(p_valor numeric, p_venc date, p_fav uuid, p_conta uuid, p_plano uuid, p_fazenda uuid)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object('valor', round(p_valor, 2), 'vencimento', p_venc, 'favorecido_id', p_fav, 'conta_bancaria_id', p_conta,
                            'plano_conta_id', p_plano, 'fazenda_id', p_fazenda)
$$;
revoke all on function public._fn_aprovacao_foto(numeric, date, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public._fn_aprovacao_foto(numeric, date, uuid, uuid, uuid, uuid) to authenticated, service_role;

create function public._fn_bpo_ativo(p_cliente uuid) returns boolean language sql stable security invoker set search_path = public as $$
  select coalesce((select ativo from financeiro_bpo_config where cliente_id = p_cliente), false)
$$;
revoke all on function public._fn_bpo_ativo(uuid) from public, anon;
grant execute on function public._fn_bpo_ativo(uuid) to authenticated, service_role;

create function public._fn_eh_aprovador(p_cliente uuid, p_user uuid) returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from financeiro_aprovadores a where a.cliente_id = p_cliente and a.user_id = p_user and a.ativo)
     and exists (select 1 from cliente_membros m where m.cliente_id = p_cliente and m.user_id = p_user and m.ativo)
$$;
revoke all on function public._fn_eh_aprovador(uuid, uuid) from public, anon;
grant execute on function public._fn_eh_aprovador(uuid, uuid) to authenticated, service_role;

-- CONFIGURAÇÃO e APROVADORES: só o admin AGROinBLUE grava (o BPO é contratado); prévia por p_simular
create function public.fn_bpo_config_gravar(p_cliente uuid, p_ativo boolean, p_desde date, p_dias smallint[], p_horario time,
  p_email boolean, p_whatsapp boolean, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb;
begin
  if not public.is_admin_agroinblue(auth.uid()) then raise exception 'BPO: só a AGROinBLUE configura a aprovação.' using errcode = '42501'; end if;
  if p_cliente is null or p_ativo is null or p_desde is null or p_simular is null then raise exception 'BPO: pedido inválido.' using errcode = '22023'; end if;
  if not exists (select 1 from clientes where id = p_cliente) then raise exception 'BPO: cliente inválido.' using errcode = '42501'; end if;
  select to_jsonb(c) - 'atualizado_por' - 'atualizado_em' into v_antes from financeiro_bpo_config c where c.cliente_id = p_cliente;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'antes', v_antes,
      'aguardando_ao_ligar', (select count(*) from financeiro_lancamentos_v2 l where l.cliente_id = p_cliente and l.cancelado is not true
        and l.tipo_operacao = '2-Saídas' and l.status_transacao <> 'realizado' and l.data_vencimento >= p_desde));
  end if;
  insert into financeiro_bpo_config (cliente_id, ativo, desde, dias_semana, horario_limite, avisar_email, avisar_whatsapp, atualizado_por)
  values (p_cliente, p_ativo, p_desde, p_dias, p_horario, coalesce(p_email, true), coalesce(p_whatsapp, true), auth.uid())
  on conflict (cliente_id) do update set ativo = excluded.ativo, desde = excluded.desde, dias_semana = excluded.dias_semana,
    horario_limite = excluded.horario_limite, avisar_email = excluded.avisar_email, avisar_whatsapp = excluded.avisar_whatsapp,
    atualizado_por = excluded.atualizado_por, atualizado_em = now();
  return jsonb_build_object('ok', true, 'simulado', false, 'antes', v_antes);
end $$;
revoke all on function public.fn_bpo_config_gravar(uuid, boolean, date, smallint[], time, boolean, boolean, boolean) from public, anon;
grant execute on function public.fn_bpo_config_gravar(uuid, boolean, date, smallint[], time, boolean, boolean, boolean) to authenticated;

create function public.fn_bpo_aprovador_gravar(p_cliente uuid, p_user uuid, p_ativo boolean, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_vivo uuid;
begin
  if not public.is_admin_agroinblue(auth.uid()) then raise exception 'BPO: só a AGROinBLUE marca quem aprova.' using errcode = '42501'; end if;
  if p_cliente is null or p_user is null or p_ativo is null or p_simular is null then raise exception 'BPO: pedido inválido.' using errcode = '22023'; end if;
  if p_ativo and not exists (select 1 from cliente_membros m where m.cliente_id = p_cliente and m.user_id = p_user and m.ativo
                              and m.perfil in ('gestor_cliente', 'financeiro')) then
    raise exception 'BPO: o aprovador tem de ser membro ativo (gestor ou financeiro) deste cliente.' using errcode = '22023';
  end if;
  select id into v_vivo from financeiro_aprovadores where cliente_id = p_cliente and user_id = p_user and ativo;
  if p_simular or (v_vivo is not null) = p_ativo then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'mudou', (v_vivo is not null) <> p_ativo);
  end if;
  if p_ativo then
    insert into financeiro_aprovadores (cliente_id, user_id, criado_por) values (p_cliente, p_user, auth.uid());
  else
    update financeiro_aprovadores set ativo = false, desligado_por = auth.uid(), desligado_em = now() where id = v_vivo;
  end if;
  return jsonb_build_object('ok', true, 'simulado', false, 'mudou', true);
end $$;
revoke all on function public.fn_bpo_aprovador_gravar(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.fn_bpo_aprovador_gravar(uuid, uuid, boolean, boolean) to authenticated;

-- ENVIAR para aprovação (a lançadora; gestor/financeiro do cliente ou o admin). Recusado volta como rodada nova. D10: o aprovador
-- que envia o PRÓPRIO nasce aprovado.
create function public.fn_aprovacao_enviar(p_cliente uuid, p_ids uuid[], p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  l record;
  v_viva financeiro_aprovacoes;
  v_aprovador boolean;
  n_env int := 0; n_auto int := 0; recusas jsonb := '[]'::jsonb;
begin
  if p_cliente is null or p_ids is null or p_simular is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'BPO: pedido inválido.' using errcode = '22023';
  end if;
  if not public.tenant_ok(p_cliente) or not (public.is_admin_agroinblue(u)
       or coalesce(public.get_user_perfil(u, p_cliente)::text, '') in ('gestor_cliente', 'financeiro')) then
    raise exception 'BPO: sem acesso para enviar pagamentos deste cliente.' using errcode = '42501';
  end if;
  if not public._fn_bpo_ativo(p_cliente) then raise exception 'BPO: a aprovação não está ligada neste cliente.' using errcode = '22023'; end if;
  v_aprovador := public._fn_eh_aprovador(p_cliente, u);
  for l in select x.* from financeiro_lancamentos_v2 x where x.id = any(p_ids) order by x.data_vencimento, x.id loop
    if l.cliente_id is distinct from p_cliente then raise exception 'BPO: lançamento de outro cliente.' using errcode = '42501'; end if;
    if l.cancelado is true or l.tipo_operacao <> '2-Saídas' or l.status_transacao = 'realizado' then
      recusas := recusas || jsonb_build_object('id', l.id, 'motivo', case when l.cancelado then 'cancelado' when l.status_transacao = 'realizado' then 'já pago'
        else 'não é saída' end);
      continue;
    end if;
    select * into v_viva from financeiro_aprovacoes a where a.lancamento_id = l.id and a.situacao <> 'substituido';
    if v_viva.id is not null and v_viva.situacao in ('aguardando', 'aprovado') then
      recusas := recusas || jsonb_build_object('id', l.id, 'motivo', case when v_viva.situacao = 'aprovado' then 'já aprovado' else 'já na fila' end);
      continue;
    end if;
    if v_aprovador then n_auto := n_auto + 1; else n_env := n_env + 1; end if;
    if p_simular then continue; end if;
    if v_viva.id is not null then update financeiro_aprovacoes set situacao = 'substituido' where id = v_viva.id; end if;
    insert into financeiro_aprovacoes (cliente_id, lancamento_id, rodada, situacao, observacao, foto, pedido_por, decidido_por, decidido_em)
    values (p_cliente, l.id, coalesce((select max(rodada) from financeiro_aprovacoes where lancamento_id = l.id), 0) + 1,
            case when v_aprovador then 'aprovado' else 'aguardando' end,
            case when v_aprovador then 'lançado e aprovado pela mesma pessoa' end,
            public._fn_aprovacao_foto(l.valor, l.data_vencimento, l.favorecido_id, l.conta_bancaria_id, l.plano_conta_id, l.fazenda_id),
            u, case when v_aprovador then u end, case when v_aprovador then now() end);
  end loop;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'enviados', n_env, 'aprovados_pelo_mesmo', n_auto, 'recusados', recusas);
end $$;
revoke all on function public.fn_aprovacao_enviar(uuid, uuid[], boolean) from public, anon;
grant execute on function public.fn_aprovacao_enviar(uuid, uuid[], boolean) to authenticated;

-- DECIDIR (só o aprovador marcado; o admin AGROinBLUE NÃO aprova pelo cliente). Lote; tudo ou nada; recusar pede motivo.
create function public.fn_aprovacao_decidir(p_cliente uuid, p_ids uuid[], p_aprovar boolean, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  n int;
  v_soma numeric;
begin
  if p_cliente is null or p_ids is null or p_aprovar is null or p_simular is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'BPO: pedido inválido.' using errcode = '22023';
  end if;
  if not public.tenant_ok(p_cliente) or not public._fn_eh_aprovador(p_cliente, u) then
    raise exception 'BPO: só quem aprova este cliente decide.' using errcode = '42501';
  end if;
  if not p_aprovar and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'BPO: escreva o motivo da recusa.' using errcode = '22023';
  end if;
  select count(*), sum(l.valor) into n, v_soma from financeiro_aprovacoes a join financeiro_lancamentos_v2 l on l.id = a.lancamento_id
   where a.lancamento_id = any(p_ids) and a.situacao = 'aguardando' and a.cliente_id = p_cliente;
  if n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'BPO: algum pagamento não está mais aguardando (foi mudado ou já decidido). Atualize a fila.' using errcode = '40001';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'n', n, 'total', round(v_soma, 2)); end if;
  update financeiro_aprovacoes set situacao = case when p_aprovar then 'aprovado' else 'recusado' end,
         motivo = case when p_aprovar then null else btrim(p_motivo) end, decidido_por = u, decidido_em = now()
   where lancamento_id = any(p_ids) and situacao = 'aguardando' and cliente_id = p_cliente;
  return jsonb_build_object('ok', true, 'simulado', false, 'n', n, 'total', round(v_soma, 2));
end $$;
revoke all on function public.fn_aprovacao_decidir(uuid, uuid[], boolean, text, boolean) from public, anon;
grant execute on function public.fn_aprovacao_decidir(uuid, uuid[], boolean, text, boolean) to authenticated;

-- A LISTA (fila, aprovados, recusados) com o que o aprovador precisa ver; nota e boleto ligados = selo
create function public.fn_aprovacao_lista(p_cliente uuid, p_situacoes text[], p_venc_ate date)
returns table (lancamento_id uuid, rodada integer, situacao text, motivo text, observacao text, pedido_por uuid, pedido_em timestamptz,
  decidido_por uuid, decidido_em timestamptz, vencimento date, valor numeric, descricao text, fornecedor text, fazenda text, conta text,
  conta_bancaria_id uuid, status_transacao text, tem_nota boolean, tem_boleto boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then raise exception 'BPO: sem acesso a este cliente.' using errcode = '42501'; end if;
  return query
  select a.lancamento_id, a.rodada, a.situacao, a.motivo, a.observacao, a.pedido_por, a.pedido_em, a.decidido_por, a.decidido_em,
         l.data_vencimento, l.valor, l.descricao, f.nome, fz.nome, coalesce(cb.nome_exibicao, cb.nome_conta), l.conta_bancaria_id, l.status_transacao,
         exists (select 1 from financeiro_documento_vinculos dv where dv.lancamento_id = l.id),
         exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null)
    from financeiro_aprovacoes a
    join financeiro_lancamentos_v2 l on l.id = a.lancamento_id
    left join financeiro_fornecedores f on f.id = l.favorecido_id
    left join fazendas fz on fz.id = l.fazenda_id
    left join financeiro_contas_bancarias cb on cb.id = l.conta_bancaria_id
   where a.cliente_id = p_cliente and a.situacao <> 'substituido'
     and (p_situacoes is null or a.situacao = any(p_situacoes))
     and (p_venc_ate is null or l.data_vencimento <= p_venc_ate)
   order by l.data_vencimento, l.valor;
end $$;
revoke all on function public.fn_aprovacao_lista(uuid, text[], date) from public, anon;
grant execute on function public.fn_aprovacao_lista(uuid, text[], date) to authenticated;

-- D7 — os ALERTAS do mês, calculados (só leitura): pago sem aprovação · aprovado e não pago · pago diferente do aprovado
create function public.fn_aprovacao_alertas(p_cliente uuid, p_de date, p_ate date)
returns table (alerta text, lancamento_id uuid, data date, valor numeric, valor_aprovado numeric, fornecedor text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde date;
begin
  if p_cliente is null or p_de is null or p_ate is null or p_de > p_ate or not public.tenant_ok(p_cliente) then
    raise exception 'BPO: sem acesso a este cliente.' using errcode = '42501';
  end if;
  select desde into v_desde from financeiro_bpo_config where cliente_id = p_cliente and ativo;
  if v_desde is null then return; end if;
  return query
  -- pago (realizado) no período, depois do "desde", sem aprovação viva aprovada
  select 'pago_sem_aprovacao'::text, l.id, coalesce(l.data_pagamento, l.data_vencimento), l.valor, null::numeric, f.nome
    from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id = l.favorecido_id
   where l.cliente_id = p_cliente and l.cancelado is not true and l.tipo_operacao = '2-Saídas' and l.status_transacao = 'realizado'
     and coalesce(l.data_pagamento, l.data_vencimento) between greatest(p_de, v_desde) and p_ate
     and not exists (select 1 from financeiro_aprovacoes a where a.lancamento_id = l.id and a.situacao = 'aprovado')
  union all
  -- aprovado, vencido (antes de hoje em Brasília) e ainda não pago
  select 'aprovado_nao_pago', l.id, l.data_vencimento, l.valor, (a.foto->>'valor')::numeric, f.nome
    from financeiro_aprovacoes a join financeiro_lancamentos_v2 l on l.id = a.lancamento_id left join financeiro_fornecedores f on f.id = l.favorecido_id
   where a.cliente_id = p_cliente and a.situacao = 'aprovado' and l.cancelado is not true and l.status_transacao <> 'realizado'
     and l.data_vencimento between p_de and least(p_ate, (now() at time zone 'America/Sao_Paulo')::date - 1)
  union all
  -- pago com valor diferente do aprovado (meio centavo de tolerância, a da casa)
  select 'pago_diferente', l.id, coalesce(l.data_pagamento, l.data_vencimento), l.valor, (a.foto->>'valor')::numeric, f.nome
    from financeiro_aprovacoes a join financeiro_lancamentos_v2 l on l.id = a.lancamento_id left join financeiro_fornecedores f on f.id = l.favorecido_id
   where a.cliente_id = p_cliente and a.situacao = 'aprovado' and l.cancelado is not true and l.status_transacao = 'realizado'
     and coalesce(l.data_pagamento, l.data_vencimento) between p_de and p_ate
     and abs(round(l.valor, 2) - (a.foto->>'valor')::numeric) >= 0.005;
end $$;
revoke all on function public.fn_aprovacao_alertas(uuid, date, date) from public, anon;
grant execute on function public.fn_aprovacao_alertas(uuid, date, date) to authenticated;

-- D6 — editar um APROVADO (ou um que AGUARDA) num campo da foto: a rodada viva é substituída por uma nova "aguardando"
create function public._fn_trg_aprovacao_foto_mudou() returns trigger language plpgsql security definer set search_path = public as $$
declare
  a financeiro_aprovacoes;
  v_foto jsonb;
  v_mudou text;
begin
  select * into a from financeiro_aprovacoes where lancamento_id = new.id and situacao in ('aguardando', 'aprovado');
  if a.id is null then return null; end if;
  v_foto := public._fn_aprovacao_foto(new.valor, new.data_vencimento, new.favorecido_id, new.conta_bancaria_id, new.plano_conta_id, new.fazenda_id);
  if v_foto = a.foto or new.status_transacao = 'realizado' or new.cancelado is true then return null; end if;
  select string_agg(k, ', ' order by k) into v_mudou from jsonb_object_keys(v_foto) k where v_foto->k is distinct from a.foto->k;
  update financeiro_aprovacoes set situacao = 'substituido' where id = a.id;
  insert into financeiro_aprovacoes (cliente_id, lancamento_id, rodada, situacao, observacao, foto, pedido_por)
  values (a.cliente_id, new.id, a.rodada + 1, 'aguardando', left('mudou: ' || v_mudou, 300), v_foto, coalesce(auth.uid(), a.pedido_por));
  return null;
end $$;
revoke all on function public._fn_trg_aprovacao_foto_mudou() from public, anon, authenticated;
create trigger trg_zz_aprovacao_foto_mudou after update of valor, data_vencimento, favorecido_id, conta_bancaria_id, plano_conta_id, fazenda_id
  on public.financeiro_lancamentos_v2 for each row
  when (old.valor is distinct from new.valor or old.data_vencimento is distinct from new.data_vencimento
        or old.favorecido_id is distinct from new.favorecido_id or old.conta_bancaria_id is distinct from new.conta_bancaria_id
        or old.plano_conta_id is distinct from new.plano_conta_id or old.fazenda_id is distinct from new.fazenda_id)
  execute function public._fn_trg_aprovacao_foto_mudou();

-- D3 — com o BPO ligado, uma SAÍDA só vira AGENDADA com aprovação viva aprovada
create function public._fn_trg_aprovacao_agendar() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status_transacao = 'agendado' and new.tipo_operacao = '2-Saídas' and new.cancelado is not true
     and (tg_op = 'INSERT' or old.status_transacao is distinct from 'agendado')
     and public._fn_bpo_ativo(new.cliente_id)
     and not exists (select 1 from financeiro_aprovacoes a where a.lancamento_id = new.id and a.situacao = 'aprovado') then
    raise exception 'BPO: este pagamento ainda não foi aprovado; envie para aprovação antes de agendar.' using errcode = 'P0001',
      hint = 'bpo:sem_aprovacao';
  end if;
  return new;
end $$;
revoke all on function public._fn_trg_aprovacao_agendar() from public, anon, authenticated;
create trigger trg_00_aprovacao_agendar before insert or update of status_transacao on public.financeiro_lancamentos_v2
  for each row when (new.status_transacao = 'agendado') execute function public._fn_trg_aprovacao_agendar();
