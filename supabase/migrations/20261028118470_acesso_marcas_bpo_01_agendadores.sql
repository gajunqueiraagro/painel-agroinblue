-- ACESSO-MARCAS-BPO-01 · D-A1 (a) (Gabriel 23/11 13:53): a marca "Agenda pagamentos no banco" (a OPERADORA do BPO) — uma MARCA por pessoa e
-- cliente, irmã de `financeiro_aprovadores` (118160): mesmas colunas, mesma trilha (marcar insere; desmarcar põe ativo=false +
-- desligado_por/em; nada se apaga), mesmas regras de quem marca (só o admin AGROinBLUE, com prévia) e de quem pode ser marcado (membro ativo
-- gestor_cliente ou financeiro do cliente).
--   ⚠ SEM TRAVA (D-A1 a): a marca só DIZ quem é a operadora (o guia, a aba Aprovados com o filtro Prontos aberto para ela, os avisos futuros).
--   Quem pode agendar NÃO muda: o gatilho `trg_00_aprovacao_agendar` (118160) segue como está — qualquer gestor/financeiro, só o aprovado.
-- Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.financeiro_agendadores') is not null then
    raise exception 'ACESSO-MARCAS-BPO-01: a tabela já existe: refazer.';
  end if;
end $$;

create table public.financeiro_agendadores (
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
create unique index ux_financeiro_agendadores_vivo on public.financeiro_agendadores (cliente_id, user_id) where ativo;
alter table public.financeiro_agendadores enable row level security;
create policy financeiro_agendadores_select on public.financeiro_agendadores for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financeiro_agendadores from public, anon, authenticated;
grant select on public.financeiro_agendadores to authenticated;
grant all on public.financeiro_agendadores to service_role;

create function public.fn_bpo_agendador_gravar(p_cliente uuid, p_user uuid, p_ativo boolean, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_vivo uuid;
begin
  if not public.is_admin_agroinblue(auth.uid()) then raise exception 'BPO: só a AGROinBLUE marca quem agenda.' using errcode = '42501'; end if;
  if p_cliente is null or p_user is null or p_ativo is null or p_simular is null then raise exception 'BPO: pedido inválido.' using errcode = '22023'; end if;
  if p_ativo and not exists (select 1 from cliente_membros m where m.cliente_id = p_cliente and m.user_id = p_user and m.ativo
                              and m.perfil in ('gestor_cliente', 'financeiro')) then
    raise exception 'BPO: quem agenda tem de ser membro ativo (gestor ou financeiro) deste cliente.' using errcode = '22023';
  end if;
  select id into v_vivo from financeiro_agendadores where cliente_id = p_cliente and user_id = p_user and ativo;
  if p_simular or (v_vivo is not null) = p_ativo then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'mudou', (v_vivo is not null) <> p_ativo);
  end if;
  if p_ativo then
    insert into financeiro_agendadores (cliente_id, user_id, criado_por) values (p_cliente, p_user, auth.uid());
  else
    update financeiro_agendadores set ativo = false, desligado_por = auth.uid(), desligado_em = now() where id = v_vivo;
  end if;
  return jsonb_build_object('ok', true, 'simulado', false, 'mudou', true);
end $$;
revoke all on function public.fn_bpo_agendador_gravar(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.fn_bpo_agendador_gravar(uuid, uuid, boolean, boolean) to authenticated;
