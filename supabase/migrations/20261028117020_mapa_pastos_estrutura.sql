-- MAPA-GLOBAL-01 fix1 item 3 · 117020 — a ESTRUTURA do pasto no cadastro: 'pasto' (o padrão) | 'confinamento' | 'curral'.
-- Decisão do Gabriel (01/11): pasto marcado como confinamento/curral NO CADASTRO fica fora da lotação, das faixas e da lista de atenção
-- do mapa (a conta vem no front, numa fatia seguinte) — NUNCA pelo nome ("CONF"). `tipo_uso` segue sendo a ATIVIDADE (cria/recria/engorda);
-- a estrutura é outra pergunta: o mesmo curral de engorda é 'engorda' + 'confinamento'.
-- ESTA MIGRATION NÃO MARCA NADA: todo pasto nasce e fica 'pasto'. A tela do cadastro (fatia seguinte, combinada com o Code 1, que mexe na
-- tela de pastos) mostra os nomes parecidos como SUGESTÃO para confirmar um a um.
-- Escrita SÓ por `fn_pasto_estrutura_salvar` (prévia por padrão, trilha em `pasto_estrutura_trilha`), no molde do grupo de pastejo
-- (FECH-ROTACAO-01): um gatilho recusa a troca por qualquer outro caminho. FUNÇÃO NOVA NASCE FECHADA: SECURITY DEFINER, search_path fixo,
-- cliente resolvido pelo PASTO e `tenant_ok` (42501, nunca vazio); REVOKE PUBLIC/anon; GRANT authenticated e service_role.
-- Nenhum dado de cliente é alterado por esta migration (a coluna nova nasce com o padrão 'pasto' em todas as linhas).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

alter table public.pastos add column if not exists estrutura text not null default 'pasto';
alter table public.pastos drop constraint if exists pastos_estrutura_chk;
alter table public.pastos add constraint pastos_estrutura_chk check (estrutura in ('pasto', 'confinamento', 'curral'));
comment on column public.pastos.estrutura is
  'MAPA-GLOBAL-01 fix1: pasto | confinamento | curral. Confinamento/curral fica fora da lotação, das faixas e da atenção do mapa. Muda só por fn_pasto_estrutura_salvar.';

-- a trilha (imutável: só a função escreve)
create table if not exists public.pasto_estrutura_trilha (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  pasto_id uuid not null references public.pastos(id),
  de text not null,
  para text not null,
  motivo text,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists pasto_estrutura_trilha_pasto_idx on public.pasto_estrutura_trilha (pasto_id, em);
alter table public.pasto_estrutura_trilha enable row level security;
drop policy if exists pasto_estrutura_trilha_select on public.pasto_estrutura_trilha;
create policy pasto_estrutura_trilha_select on public.pasto_estrutura_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.pasto_estrutura_trilha from public, anon;
revoke insert, update, delete on public.pasto_estrutura_trilha from authenticated;
grant select on public.pasto_estrutura_trilha to authenticated;
grant all on public.pasto_estrutura_trilha to service_role;

-- o gatilho: a estrutura só muda pelo escritor (na criação, só o padrão)
create or replace function public._fn_pastos_estrutura_so_pelo_escritor()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$
begin
  if new.estrutura is distinct from (case when tg_op = 'UPDATE' then old.estrutura else 'pasto' end)
     and coalesce(current_setting('app.pasto_estrutura_escritor', true), '') <> '1' then
    raise exception 'A estrutura do pasto (pasto, confinamento ou curral) muda só no cadastro do pasto. Nada foi gravado.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_pastos_estrutura_so_pelo_escritor on public.pastos;
create trigger trg_pastos_estrutura_so_pelo_escritor before insert or update of estrutura on public.pastos
  for each row execute function public._fn_pastos_estrutura_so_pelo_escritor();
revoke all on function public._fn_pastos_estrutura_so_pelo_escritor() from public, anon, authenticated;
grant execute on function public._fn_pastos_estrutura_so_pelo_escritor() to service_role;

-- o escritor: prévia por padrão; grava a troca e a trilha
create or replace function public.fn_pasto_estrutura_salvar(p_pasto uuid, p_estrutura text, p_motivo text default null, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.pastos%rowtype; v_para text := nullif(btrim(coalesce(p_estrutura, '')), '');
begin
  select * into p from public.pastos where id = p_pasto;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if v_para is null or v_para not in ('pasto', 'confinamento', 'curral') then
    raise exception using errcode = 'P0001', message = 'Escolha a estrutura: pasto, confinamento ou curral.';
  end if;
  if v_para = p.estrutura then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'id', p.id, 'sem_mudanca', true, 'estrutura', p.estrutura);
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', p.id, 'nome', p.nome, 'de', p.estrutura, 'para', v_para,
      'fora_da_lotacao', v_para <> 'pasto');
  end if;
  perform set_config('app.pasto_estrutura_escritor', '1', true);
  update public.pastos set estrutura = v_para where id = p.id and estrutura = p.estrutura;
  if not found then  -- antes do set_config abaixo, que também mexe no FOUND
    raise exception using errcode = '40001', message = 'Este pasto foi alterado por outra pessoa. Feche e abra de novo.';
  end if;
  perform set_config('app.pasto_estrutura_escritor', '', true);
  insert into public.pasto_estrutura_trilha (cliente_id, pasto_id, de, para, motivo, por)
  values (p.cliente_id, p.id, p.estrutura, v_para, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', p.id, 'de', p.estrutura, 'para', v_para);
end $$;
revoke all on function public.fn_pasto_estrutura_salvar(uuid, text, text, boolean) from public, anon;
grant execute on function public.fn_pasto_estrutura_salvar(uuid, text, text, boolean) to authenticated, service_role;
