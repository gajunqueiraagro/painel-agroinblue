-- OPENFINANCE-CLIENTE-01 · TERMO + LINK DE CONEXÃO (mock aprovado 17/11; D1–D6 como recomendado: termo v1 curto a revisar pelo
-- advogado; gestor E admin marcam as contas; o perfil financeiro não conecta; Buscar do banco segue só admin; link de 24 h, uso
-- único, até 10 aberturas do banco; sem CPF).
--   1. openfinance_termo_versoes — o TEXTO do termo, versionado; o md5 é do banco (coluna gerada). Catálogo, sem dado de cliente.
--   2. openfinance_termos_aceites — cada aceite (antes de todo Widget): cliente, versão, md5 do texto aceito, quem (usuário) ou por
--      qual link, quando. Nada se apaga.
--   3. openfinance_convites — o link para o titular que não usa o sistema: guarda SÓ o sha256 do código (o código nunca entra no banco),
--      validade de 24 h, até 10 aberturas do banco, uso único (o 1º banco conectado pelo link), revogável; gerar um novo revoga o vivo.
--   4. Internas INVOKER, só service_role (as Edge Functions):
--      _fn_openfinance_termo_aceitar · _fn_openfinance_convite_gerar · _fn_openfinance_convite_abrir ·
--      _fn_openfinance_convite_concluir · _fn_openfinance_convite_revogar
--   5. openfinance_eventos: o membro do cliente passa a LER os avisos do PRÓPRIO cliente (o gestor vê "Bancos conectados");
--      o admin segue lendo tudo. Lista fechada de campos (118120): nada de transação, nome ou documento.
-- Sem dado de cliente (a versão 1 do termo é catálogo).
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.openfinance_termo_versoes') is not null or to_regclass('public.openfinance_convites') is not null
     or to_regclass('public.openfinance_termos_aceites') is not null then
    raise exception 'OPENFINANCE-CLIENTE-01: as tabelas já existem: refazer.';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'openfinance_eventos' and policyname = 'openfinance_eventos_select')
     is distinct from 'is_admin_agroinblue(( SELECT auth.uid() AS uid))' then
    raise exception 'OPENFINANCE-CLIENTE-01: a política de leitura dos eventos não é a da 118120: conferir.';
  end if;
end $$;

create table public.openfinance_termo_versoes (
  versao         integer primary key check (versao >= 1),
  texto          text not null check (length(texto) between 50 and 4000),
  texto_md5      text generated always as (md5(texto)) stored,
  vigente_desde  timestamptz not null default now()
);
alter table public.openfinance_termo_versoes enable row level security;
create policy openfinance_termo_versoes_select on public.openfinance_termo_versoes for select to authenticated using (true);
revoke all on public.openfinance_termo_versoes from public, anon, authenticated;
grant select on public.openfinance_termo_versoes to authenticated;
grant all on public.openfinance_termo_versoes to service_role;

insert into public.openfinance_termo_versoes (versao, texto) values (1,
'Você autoriza o AGROinBLUE a LER, pelo Open Finance regulado, o saldo e o extrato das contas que forem escolhidas. '
|| 'O AGROinBLUE não paga, não transfere e não movimenta nada. Não pedimos nem vemos sua senha: você confirma no app do seu banco. '
|| 'Os dados servem só para a conciliação e o financeiro deste cliente, e ficam visíveis a quem tem acesso a ele no AGROinBLUE. '
|| 'Você pode revogar quando quiser, no app do banco ou em "Desconectar"; o extrato já importado continua no sistema. '
|| 'Tratamos os dados conforme a LGPD, como operadores do cliente.');

create table public.openfinance_convites (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  criado_por    uuid not null,
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  aberturas     integer not null default 0 check (aberturas between 0 and 10),
  usado_em      timestamptz,
  item_id       text check (length(item_id) <= 128),
  revogado_por  uuid,
  revogado_em   timestamptz,
  check (expira_em > criado_em and expira_em <= criado_em + interval '24 hours'),
  check ((usado_em is null) = (item_id is null)),
  check ((revogado_em is null) = (revogado_por is null))
);
create index ix_openfinance_convites_cliente on public.openfinance_convites (cliente_id, criado_em desc);
alter table public.openfinance_convites enable row level security;
-- só o admin AgroinBlue vê os links (quem gera é ele)
create policy openfinance_convites_select on public.openfinance_convites for select to authenticated
  using (public.is_admin_agroinblue((select auth.uid())));
revoke all on public.openfinance_convites from public, anon, authenticated;
grant select on public.openfinance_convites to authenticated;
grant all on public.openfinance_convites to service_role;

create table public.openfinance_termos_aceites (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id),
  versao      integer not null references public.openfinance_termo_versoes(versao),
  texto_md5   text not null check (texto_md5 ~ '^[0-9a-f]{32}$'),
  via         text not null check (via in ('sistema', 'link')),
  aceito_por  uuid,
  convite_id  uuid references public.openfinance_convites(id),
  aceito_em   timestamptz not null default now(),
  check ((via = 'sistema' and aceito_por is not null and convite_id is null) or (via = 'link' and aceito_por is null and convite_id is not null))
);
create index ix_openfinance_termos_aceites_cliente on public.openfinance_termos_aceites (cliente_id, aceito_em desc);
alter table public.openfinance_termos_aceites enable row level security;
create policy openfinance_termos_aceites_select on public.openfinance_termos_aceites for select to authenticated
  using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_termos_aceites from public, anon, authenticated;
grant select on public.openfinance_termos_aceites to authenticated;
grant all on public.openfinance_termos_aceites to service_role;

-- o aceite: a versão tem de ser a VIGENTE (a maior) e o md5 tem de ser o do texto que a tela mostrou
create function public._fn_openfinance_termo_aceitar(p_cliente uuid, p_versao integer, p_md5 text, p_autor uuid, p_convite uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t openfinance_termo_versoes;
  v_id uuid;
begin
  if p_cliente is null or p_versao is null or p_md5 is null or (p_autor is null) = (p_convite is null) then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  select * into t from openfinance_termo_versoes order by versao desc limit 1;
  if t.versao is distinct from p_versao or t.texto_md5 is distinct from p_md5 then
    raise exception 'OPENFINANCE: o termo mudou; leia a versão nova.' using errcode = '22023';
  end if;
  if not exists (select 1 from clientes where id = p_cliente) then
    raise exception 'OPENFINANCE: cliente inválido.' using errcode = '42501';
  end if;
  if p_convite is not null and not exists (select 1 from openfinance_convites where id = p_convite and cliente_id = p_cliente) then
    raise exception 'OPENFINANCE: link inválido.' using errcode = '42501';
  end if;
  insert into openfinance_termos_aceites (cliente_id, versao, texto_md5, via, aceito_por, convite_id)
  values (p_cliente, t.versao, t.texto_md5, case when p_convite is null then 'sistema' else 'link' end, p_autor, p_convite)
  returning id into v_id;
  insert into openfinance_eventos (origem, evento, cliente_id, client_user_id, autor, resultado)
  values ('agroinblue', 'agroinblue/termo_aceito', p_cliente, p_cliente::text, p_autor,
          format('versão %s · %s', t.versao, case when p_convite is null then 'pelo sistema' else 'pelo link' end));
  return jsonb_build_object('ok', true, 'id', v_id, 'versao', t.versao);
end $$;
revoke all on function public._fn_openfinance_termo_aceitar(uuid, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public._fn_openfinance_termo_aceitar(uuid, integer, text, uuid, uuid) to service_role;

-- gerar: o código nasce na Edge Function e só o sha256 chega aqui; gerar um novo revoga o link vivo do mesmo cliente
create function public._fn_openfinance_convite_gerar(p_cliente uuid, p_token_hash text, p_autor uuid, p_simular boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_vivos integer;
  c openfinance_convites;
begin
  if p_cliente is null or p_autor is null or p_simular is null or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  if not exists (select 1 from clientes where id = p_cliente) then
    raise exception 'OPENFINANCE: cliente inválido.' using errcode = '42501';
  end if;
  select count(*) into v_vivos from openfinance_convites
   where cliente_id = p_cliente and usado_em is null and revogado_em is null and expira_em > now();
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'revoga', v_vivos, 'expira_em', now() + interval '24 hours');
  end if;
  update openfinance_convites set revogado_por = p_autor, revogado_em = now()
   where cliente_id = p_cliente and usado_em is null and revogado_em is null and expira_em > now();
  insert into openfinance_convites (cliente_id, token_hash, criado_por, expira_em)
  values (p_cliente, p_token_hash, p_autor, now() + interval '24 hours') returning * into c;
  insert into openfinance_eventos (origem, evento, cliente_id, client_user_id, autor, resultado)
  values ('agroinblue', 'agroinblue/convite_gerado', p_cliente, p_cliente::text, p_autor,
          format('vale até %s · revogou %s', to_char(c.expira_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), v_vivos));
  return jsonb_build_object('ok', true, 'simulado', false, 'id', c.id, 'expira_em', c.expira_em, 'revoga', v_vivos);
end $$;
revoke all on function public._fn_openfinance_convite_gerar(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public._fn_openfinance_convite_gerar(uuid, text, uuid, boolean) to service_role;

-- abrir: a página sem login confere o link; p_contar = o titular apertou "Conectar meu banco" (conta 1 das 10 aberturas).
-- Link vencido, usado, revogado ou desconhecido = a MESMA recusa (42501), para não dizer qual.
create function public._fn_openfinance_convite_abrir(p_token_hash text, p_contar boolean)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  c openfinance_convites;
  v_nome text;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' or p_contar is null then
    raise exception 'OPENFINANCE: link inválido.' using errcode = '42501';
  end if;
  select * into c from openfinance_convites where token_hash = p_token_hash for update;
  if c.id is null or c.usado_em is not null or c.revogado_em is not null or c.expira_em <= now() or (p_contar and c.aberturas >= 10) then
    raise exception 'OPENFINANCE: este link já foi usado ou venceu.' using errcode = '42501';
  end if;
  if p_contar then
    update openfinance_convites set aberturas = aberturas + 1 where id = c.id returning * into c;
  end if;
  select btrim(split_part(btrim(nome), ' ', 1) || coalesce(' ' || nullif(left(split_part(btrim(nome), ' ', 2), 1), '') || '.', ''))
    into v_nome from clientes where id = c.cliente_id;
  return jsonb_build_object('ok', true, 'convite_id', c.id, 'cliente_id', c.cliente_id, 'nome', v_nome, 'expira_em', c.expira_em,
                            'aberturas_restantes', 10 - c.aberturas);
end $$;
revoke all on function public._fn_openfinance_convite_abrir(text, boolean) from public, anon, authenticated;
grant execute on function public._fn_openfinance_convite_abrir(text, boolean) to service_role;

-- concluir: o link vira USADO quando o banco conectado por ele chegou pelo webhook (item/created deste cliente, depois do link)
create function public._fn_openfinance_convite_concluir(p_token_hash text, p_item text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  c openfinance_convites;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_item, '') = '' then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  select * into c from openfinance_convites where token_hash = p_token_hash for update;
  if c.id is null or c.revogado_em is not null then
    raise exception 'OPENFINANCE: este link já foi usado ou venceu.' using errcode = '42501';
  end if;
  if c.usado_em is not null then
    return jsonb_build_object('ok', true, 'novo', false, 'item_id', c.item_id);
  end if;
  if not exists (select 1 from openfinance_eventos e where e.evento = 'item/created' and e.item_id = p_item
                  and e.cliente_id = c.cliente_id and e.recebido_em >= c.criado_em) then
    raise exception 'OPENFINANCE: o banco ainda não avisou esta conexão; tente de novo em instantes.' using errcode = '55000';
  end if;
  update openfinance_convites set usado_em = now(), item_id = left(p_item, 128) where id = c.id;
  insert into openfinance_eventos (origem, evento, item_id, cliente_id, client_user_id, resultado)
  values ('agroinblue', 'agroinblue/convite_usado', left(p_item, 128), c.cliente_id, c.cliente_id::text, 'conectado pelo link');
  return jsonb_build_object('ok', true, 'novo', true, 'item_id', p_item);
end $$;
revoke all on function public._fn_openfinance_convite_concluir(text, text) from public, anon, authenticated;
grant execute on function public._fn_openfinance_convite_concluir(text, text) to service_role;

create function public._fn_openfinance_convite_revogar(p_cliente uuid, p_convite uuid, p_autor uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  c openfinance_convites;
begin
  if p_cliente is null or p_convite is null or p_autor is null then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  select * into c from openfinance_convites where id = p_convite for update;
  if c.id is null or c.cliente_id is distinct from p_cliente then
    raise exception 'OPENFINANCE: link de outro cliente.' using errcode = '42501';
  end if;
  if c.usado_em is not null or c.revogado_em is not null or c.expira_em <= now() then
    return jsonb_build_object('ok', true, 'mudou', false);
  end if;
  update openfinance_convites set revogado_por = p_autor, revogado_em = now() where id = c.id;
  insert into openfinance_eventos (origem, evento, cliente_id, client_user_id, autor, resultado)
  values ('agroinblue', 'agroinblue/convite_revogado', p_cliente, p_cliente::text, p_autor, 'revogado');
  return jsonb_build_object('ok', true, 'mudou', true);
end $$;
revoke all on function public._fn_openfinance_convite_revogar(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public._fn_openfinance_convite_revogar(uuid, uuid, uuid) to service_role;

-- o gestor vê os bancos conectados do PRÓPRIO cliente; o admin segue vendo tudo (inclusive o aviso que ainda não tem cliente)
alter policy openfinance_eventos_select on public.openfinance_eventos
  using (public.is_admin_agroinblue((select auth.uid())) or (cliente_id is not null and public.tenant_ok(cliente_id)));
