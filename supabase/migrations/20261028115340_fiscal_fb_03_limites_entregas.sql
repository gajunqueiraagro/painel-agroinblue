-- FISCAL F-B · 20261028115340 — LIMITES por ano (catálogo global com a NORMA; D3) e o HISTÓRICO DAS ENTREGAS do LCDPR
-- (Chat 12/11 22:15: "nada se apaga, retificadora = nova linha"). Sem número embutido: os limites entram pela RPC (prévia), com a
-- fonte escrita; nenhum valor desses no front.
set local lock_timeout = '2s';

-- ── (1) limites ────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_limites (
  id uuid primary key default gen_random_uuid(),
  ano smallint not null check (ano between 2018 and 2100),
  chave text not null check (chave ~ '^[a-z0-9_]{3,60}$'),
  valor numeric(16,2) not null check (valor > 0),
  descricao text not null check (btrim(descricao) <> ''),
  fonte text not null check (length(btrim(fonte)) >= 5),
  criado_em timestamptz not null default now(), criado_por uuid,
  substituida_em timestamptz
);
create unique index fiscal_limites_vivo_uq on public.fiscal_limites (ano, chave) where substituida_em is null;
comment on table public.fiscal_limites is 'FISCAL F-B: limites fiscais por ano (ex.: lcdpr_obrigatorio, ibs_cbs_contribuinte), com a norma em fonte. Catálogo GLOBAL: leitura de quem está logado; escrita só admin AgroinBlue por fn_fiscal_limite_gravar.';
alter table public.fiscal_limites enable row level security;
create policy fiscal_limites_ler on public.fiscal_limites for select to authenticated using (true);
revoke all on public.fiscal_limites from public, anon, authenticated;
grant select on public.fiscal_limites to authenticated;
grant all on public.fiscal_limites to service_role;

-- ── (2) entregas do LCDPR ──────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_lcdpr_entregas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  titular_id uuid not null references public.fiscal_titulares (id),
  ano smallint not null check (ano between 2018 and 2100),
  gerado_em timestamptz not null default now(), gerado_por uuid,
  qtd_linhas integer not null check (qtd_linhas > 0),
  md5 text not null check (md5 ~ '^[0-9a-f]{32}$'),
  storage_path text not null check (btrim(storage_path) <> ''),
  situacao text not null default 'gerado' check (situacao in ('gerado', 'entregue', 'substituido')),
  retifica_id uuid references public.fiscal_lcdpr_entregas (id),
  entregue_em date, recibo text check (recibo is null or btrim(recibo) <> ''),
  motivo text check (motivo is null or length(btrim(motivo)) >= 3),
  check (situacao <> 'entregue' or entregue_em is not null)
);
create index fiscal_lcdpr_entregas_titular_ano on public.fiscal_lcdpr_entregas (titular_id, ano);
comment on table public.fiscal_lcdpr_entregas is 'FISCAL F-B: cada arquivo LCDPR gerado (md5, linhas, onde está) e o que aconteceu com ele (entregue / substituído). Retificadora = linha nova com retifica_id. Nada se apaga. Escrita só pelas RPCs.';
alter table public.fiscal_lcdpr_entregas enable row level security;
create policy fiscal_lcdpr_entregas_ler on public.fiscal_lcdpr_entregas for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_lcdpr_entregas from public, anon, authenticated;
grant select on public.fiscal_lcdpr_entregas to authenticated;
grant all on public.fiscal_lcdpr_entregas to service_role;
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_lcdpr_entregas
  for each statement execute function public._fn_leitura_nao_grava();

-- ── RPCs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (1) limite do ano (só admin AgroinBlue; mesma chave/ano = a anterior fica substituída)
create or replace function public.fn_fiscal_limite_gravar(p_ano smallint, p_chave text, p_valor numeric, p_descricao text, p_fonte text,
  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.fiscal_limites;
begin
  if not coalesce(public.is_admin_agroinblue(auth.uid()), false) then
    raise exception using errcode = '42501', message = 'Só o administrador AgroinBlue muda os limites fiscais.';
  end if;
  if p_ano is null or p_ano < 2018 or p_ano > 2100 then raise exception 'Ano inválido.'; end if;
  if coalesce(p_chave, '') !~ '^[a-z0-9_]{3,60}$' then raise exception 'Chave: letras minúsculas, números e _.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Valor maior que zero.'; end if;
  if btrim(coalesce(p_descricao, '')) = '' then raise exception 'Descreva o limite.'; end if;
  if length(btrim(coalesce(p_fonte, ''))) < 5 then raise exception 'Informe a norma (fonte) do limite.'; end if;
  select * into a from public.fiscal_limites where ano = p_ano and chave = p_chave and substituida_em is null;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false,
      'antes', case when a.id is null then null else jsonb_build_object('valor', a.valor, 'fonte', a.fonte) end,
      'depois', jsonb_build_object('ano', p_ano, 'chave', p_chave, 'valor', p_valor, 'descricao', btrim(p_descricao), 'fonte', btrim(p_fonte)));
  end if;
  if a.id is not null then update public.fiscal_limites set substituida_em = now() where id = a.id; end if;
  insert into public.fiscal_limites (ano, chave, valor, descricao, fonte, criado_por)
  values (p_ano, p_chave, p_valor, btrim(p_descricao), btrim(p_fonte), auth.uid());
  -- a trilha é a própria tabela (global, sem cliente: o audit_log exige cliente): cada versão tem criado_por; a anterior fica substituída
  return jsonb_build_object('simulado', false, 'gravado', true);
end $$;

-- (2a) registrar um arquivo gerado (a tela gera, guarda no bucket privado e registra aqui; retificadora aponta a anterior)
create or replace function public.fn_lcdpr_entrega_registrar(p_titular_id uuid, p_ano smallint, p_qtd_linhas integer, p_md5 text,
  p_storage_path text, p_retifica_id uuid default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.fiscal_titulares; r public.fiscal_lcdpr_entregas; v_id uuid;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este produtor.';
  end if;
  if t.papel <> 'produtor' then raise exception 'O LCDPR é do produtor.'; end if;
  if p_ano is null or p_ano < 2018 or p_ano > 2100 then raise exception 'Ano inválido.'; end if;
  if coalesce(p_qtd_linhas, 0) <= 0 then raise exception 'Arquivo sem linhas.'; end if;
  if coalesce(p_md5, '') !~ '^[0-9a-f]{32}$' then raise exception 'md5 do arquivo inválido.'; end if;
  if btrim(coalesce(p_storage_path, '')) = '' or p_storage_path !~ ('^' || t.cliente_id::text || '/') then
    raise exception 'O arquivo tem de estar na pasta do cliente.';
  end if;
  if p_retifica_id is not null then
    select * into r from public.fiscal_lcdpr_entregas where id = p_retifica_id;
    if r.id is null or r.titular_id <> t.id or r.ano <> p_ano then raise exception 'A entrega retificada não é deste produtor e ano.'; end if;
    if r.situacao <> 'entregue' then raise exception 'Só se retifica um arquivo já entregue.'; end if;
  end if;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'produtor', t.nome, 'ano', p_ano, 'linhas', p_qtd_linhas,
      'retifica', case when r.id is null then null else jsonb_build_object('id', r.id, 'entregue_em', r.entregue_em) end);
  end if;
  insert into public.fiscal_lcdpr_entregas (cliente_id, titular_id, ano, gerado_por, qtd_linhas, md5, storage_path, retifica_id)
  values (t.cliente_id, t.id, p_ano, auth.uid(), p_qtd_linhas, p_md5, p_storage_path, p_retifica_id) returning id into v_id;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, auth.uid(), 'fiscal', 'criou', 'fiscal_lcdpr_entregas', v_id,
    format('LCDPR %s de %s gerado (%s linhas)%s', p_ano, t.nome, p_qtd_linhas, case when r.id is null then '' else ' · retificadora' end),
    null, jsonb_build_object('md5', p_md5, 'linhas', p_qtd_linhas, 'retifica_id', p_retifica_id), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'id', v_id);
end $$;

-- (2b) marcar entregue (com a data e o recibo) ou substituído (com o motivo); entregar uma retificadora substitui a anterior
create or replace function public.fn_lcdpr_entrega_situacao(p_entrega_id uuid, p_situacao text, p_entregue_em date, p_recibo text,
  p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare e public.fiscal_lcdpr_entregas; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into e from public.fiscal_lcdpr_entregas where id = p_entrega_id;
  if e.id is null or not coalesce(public.tenant_ok(e.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta entrega.';
  end if;
  if coalesce(p_situacao, '') not in ('entregue', 'substituido') then raise exception 'Situação: entregue ou substituído.'; end if;
  if e.situacao = 'substituido' then raise exception 'Este arquivo já foi substituído.'; end if;
  if p_situacao = 'entregue' then
    if e.situacao = 'entregue' then raise exception 'Este arquivo já está entregue.'; end if;
    if p_entregue_em is null then raise exception 'Informe a data da entrega.'; end if;
  elsif v_motivo is null or length(v_motivo) < 3 then raise exception 'Diga por que foi substituído.';
  end if;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'antes', e.situacao, 'depois', p_situacao,
      'substitui_a_anterior', p_situacao = 'entregue' and e.retifica_id is not null);
  end if;
  update public.fiscal_lcdpr_entregas set situacao = p_situacao,
    entregue_em = case when p_situacao = 'entregue' then p_entregue_em else entregue_em end,
    recibo = case when p_situacao = 'entregue' then nullif(btrim(coalesce(p_recibo, '')), '') else recibo end,
    motivo = coalesce(v_motivo, motivo)
   where id = e.id;
  if p_situacao = 'entregue' and e.retifica_id is not null then
    update public.fiscal_lcdpr_entregas set situacao = 'substituido', motivo = 'retificada pela entrega de ' || to_char(p_entregue_em, 'DD/MM/YYYY')
     where id = e.retifica_id and situacao = 'entregue';
  end if;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (e.cliente_id, auth.uid(), 'fiscal', 'editou', 'fiscal_lcdpr_entregas', e.id, format('LCDPR %s · %s', e.ano, p_situacao),
    jsonb_build_object('situacao', e.situacao), jsonb_build_object('situacao', p_situacao, 'entregue_em', p_entregue_em, 'recibo', p_recibo, 'motivo', v_motivo),
    public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true);
end $$;

revoke all on function public.fn_fiscal_limite_gravar(smallint, text, numeric, text, text, boolean) from public, anon;
revoke all on function public.fn_lcdpr_entrega_registrar(uuid, smallint, integer, text, text, uuid, boolean) from public, anon;
revoke all on function public.fn_lcdpr_entrega_situacao(uuid, text, date, text, text, boolean) from public, anon;
grant execute on function public.fn_fiscal_limite_gravar(smallint, text, numeric, text, text, boolean) to authenticated, service_role;
grant execute on function public.fn_lcdpr_entrega_registrar(uuid, smallint, integer, text, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.fn_lcdpr_entrega_situacao(uuid, text, date, text, text, boolean) to authenticated, service_role;
