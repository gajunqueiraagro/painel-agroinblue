-- BOLETO-DDA-API-01 · D3a — O E-MAIL DE BOLETOS, o banco (decisões do Gabriel 16/11 11:11: Amazon SES São Paulo · endereço
-- <slug>-<token>@boletos.agroinblue.com.br · aceita qualquer e-mail no endereço, sempre "a conferir" · sem anexo útil = linha dispensável
-- visível · o CORPO do e-mail NÃO é lido nem guardado: só os anexos, o remetente, o assunto e a data). DDA (Kobana/TecnoSpeed) é só CNPJ:
-- para PF este é o caminho principal.
--   1. cliente_entrada_email — o endereço do cliente (um ATIVO por cliente; o antigo nunca é reaproveitado)
--   2. entrada_arquivos — a ÁREA DE ESPERA: cada anexo PDF/XML que chegou (ou a linha "sem anexo"/"recusado"); NADA vira boleto, nota ou
--      lançamento aqui — a leitura é no navegador, pelas regras de hoje (`lerBoleto`/`lerNota`), e grava pelas portas de hoje
--      (`fn_boleto_entrar` origem 'email', a prévia da nota)
--   3. internas: o domínio, o token, o local do endereço
--   4. _fn_entrada_registrar — INTERNA, sem usuário (a Edge Function `entrada-email` com a service_role): acha o cliente pelo endereço
--      ATIVO e registra; endereço desconhecido/revogado = nada gravado. Antivírus do SES acusou = o arquivo vira "recusado".
--   5. RPCs da tela: fn_entrada_email_gerar / _revogar (só o admin AgroinBlue ou o gestor do cliente; prévia = p_simular) ·
--      fn_entrada_dispensar · fn_entrada_marcar_lido
-- Sem dado de cliente. Nada aqui escreve em boletos nem em financeiro_lancamentos_v2.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.cliente_entrada_email') is not null or to_regclass('public.entrada_arquivos') is not null then
    raise exception 'BOLETO-D3a: as tabelas já existem: refazer.';
  end if;
end $$;

-- ═══ 1. o endereço do cliente ═══
create table public.cliente_entrada_email (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes(id),
  local            text not null check (local ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(local) <= 64),
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  criado_por       uuid,
  revogado_em      timestamptz,
  revogado_por     uuid,
  revogado_motivo  text,
  check (ativo = (revogado_em is null)),
  check (revogado_em is null or nullif(btrim(revogado_motivo), '') is not null)
);
-- o local nunca se repete (nem o de um endereço revogado: e-mail velho de um cliente nunca cai em outro)
create unique index ux_cliente_entrada_email_local on public.cliente_entrada_email (local);
create unique index ux_cliente_entrada_email_ativo on public.cliente_entrada_email (cliente_id) where ativo;

-- ═══ 2. a área de espera ═══
create table public.entrada_arquivos (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes(id),
  origem             text not null default 'email' check (origem in ('email')),
  entrada_email_id   uuid not null references public.cliente_entrada_email(id),
  mensagem_id        text not null check (length(mensagem_id) between 1 and 512),
  remetente          text check (length(remetente) <= 320),
  assunto            text check (length(assunto) <= 300),
  recebido_em        timestamptz not null,
  arquivo_nome       text check (length(arquivo_nome) <= 255),
  tipo               text check (tipo in ('pdf', 'xml')),
  tamanho_bytes      integer check (tamanho_bytes between 1 and 10485760),
  md5                text check (md5 ~ '^[0-9a-f]{32}$'),
  storage_path       text,
  estado             text not null check (estado in ('a_ler', 'boleto', 'nota', 'nao_reconhecido', 'sem_anexo', 'recusado',
                                                     'confirmacao_gmail', 'dispensado')),
  motivo             text,
  verificacao        jsonb not null default '{}'::jsonb,
  boleto_id          uuid references public.boletos(id),
  chegou_de_novo     integer not null default 0,
  ultima_chegada_em  timestamptz,
  lido_em            timestamptz,
  lido_por           uuid,
  dispensado_em      timestamptz,
  dispensado_por     uuid,
  criado_em          timestamptz not null default now(),
  -- arquivo = PDF/XML com md5 e o caminho DO CLIENTE; sem arquivo = nenhum dos três
  check ((md5 is null) = (storage_path is null) and (md5 is null) = (tipo is null)),
  check (storage_path is null or storage_path like cliente_id::text || '/entrada/%'),
  check (estado not in ('a_ler', 'boleto', 'nota', 'nao_reconhecido') or md5 is not null),
  check (estado not in ('sem_anexo', 'recusado', 'confirmacao_gmail') or md5 is null),
  check ((estado = 'boleto') = (boleto_id is not null))
);
-- o mesmo arquivo de novo (md5 no mesmo cliente) não duplica: a linha ganha "chegou de novo"
create unique index ux_entrada_arquivos_md5 on public.entrada_arquivos (cliente_id, md5) where md5 is not null;
-- a mesma mensagem reentregue (o SES tenta de novo) não duplica as linhas sem arquivo
create unique index ux_entrada_arquivos_sem_arquivo on public.entrada_arquivos (cliente_id, mensagem_id, coalesce(arquivo_nome, ''))
  where md5 is null;
create index ix_entrada_arquivos_abertos on public.entrada_arquivos (cliente_id, recebido_em desc)
  where estado in ('a_ler', 'nao_reconhecido', 'sem_anexo', 'recusado', 'confirmacao_gmail');

alter table public.cliente_entrada_email enable row level security;
alter table public.entrada_arquivos enable row level security;
create policy cliente_entrada_email_select on public.cliente_entrada_email for select to authenticated using (public.tenant_ok(cliente_id));
create policy entrada_arquivos_select on public.entrada_arquivos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.cliente_entrada_email, public.entrada_arquivos from public, anon, authenticated;
grant select on public.cliente_entrada_email, public.entrada_arquivos to authenticated;
grant all on public.cliente_entrada_email, public.entrada_arquivos to service_role;

-- ═══ 3. internas ═══
-- o domínio, num lugar só (a Edge Function e a tela leem daqui)
create function public._fn_entrada_dominio() returns text language sql immutable as $$ select 'boletos.agroinblue.com.br'::text $$;

-- token de 10 letras/algarismos sem os que se confundem (l, o, 0, 1): 32^10 ≈ 10^15
create function public._fn_entrada_token() returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alfabeto constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  b bytea := extensions.gen_random_bytes(10);
  t text := '';
begin
  for i in 0..9 loop t := t || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1); end loop;
  return t;
end $$;

-- o local: o slug do cliente (só a-z0-9 e hífen, até 40) + '-' + o token
create function public._fn_entrada_local(p_cliente_id uuid) returns text language plpgsql volatile set search_path = public as $$
declare s text;
begin
  select trim(both '-' from regexp_replace(lower(coalesce(c.slug, 'cliente')), '[^a-z0-9]+', '-', 'g')) into s from clientes c where c.id = p_cliente_id;
  if s is null then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if s = '' then s := 'cliente'; end if;
  return left(s, 40) || '-' || public._fn_entrada_token();
end $$;

-- quem gera/revoga: o admin AgroinBlue ou o gestor ATIVO do cliente
create function public._fn_entrada_pode_gerir(p_cliente_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_agroinblue((select auth.uid()))
      or exists (select 1 from cliente_membros m where m.cliente_id = p_cliente_id and m.user_id = (select auth.uid())
                 and m.ativo and m.perfil = 'gestor_cliente')
$$;

revoke all on function public._fn_entrada_token() from public, anon, authenticated;
revoke all on function public._fn_entrada_local(uuid) from public, anon, authenticated;
revoke all on function public._fn_entrada_pode_gerir(uuid) from public, anon, authenticated;
revoke all on function public._fn_entrada_dominio() from public, anon;
grant execute on function public._fn_entrada_dominio() to authenticated, service_role;

-- ═══ 4. o registro do que chegou (INTERNA: só a service_role) ═══
-- p = { destinatario, mensagem_id, remetente, assunto, recebido_em, verificacao {spf,dkim,dmarc,spam,virus},
--       arquivos [{nome, tipo, tamanho, md5, storage_path}], recusas [{nome, motivo}], confirmacao_gmail boolean }
create function public._fn_entrada_registrar(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dest text := lower(btrim(coalesce(p->>'destinatario', '')));
  v_local text := split_part(v_dest, '@', 1);
  v_dom text := split_part(v_dest, '@', 2);
  v_end cliente_entrada_email;
  v_msg text := left(btrim(coalesce(p->>'mensagem_id', '')), 512);
  v_rem text := left(p->>'remetente', 320);
  v_ass text := left(p->>'assunto', 300);
  v_quando timestamptz := coalesce((p->>'recebido_em')::timestamptz, now());
  v_ver jsonb := coalesce(p->'verificacao', '{}'::jsonb);
  v_virus boolean := upper(coalesce(p->'verificacao'->>'virus', '')) = 'FAIL';
  a jsonb; r jsonb; v_id uuid; v_novo boolean;
  v_saida jsonb := '[]'::jsonb;
begin
  if v_dom <> public._fn_entrada_dominio() then return jsonb_build_object('ok', false, 'motivo', 'dominio'); end if;
  select * into v_end from cliente_entrada_email e where e.local = v_local and e.ativo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'endereco_desconhecido'); end if;
  if v_msg = '' then raise exception 'D3: mensagem sem identificador.' using errcode = '22023'; end if;
  perform set_config('app.via', 'email', true);

  for a in select * from jsonb_array_elements(coalesce(p->'arquivos', '[]'::jsonb)) loop
    if v_virus then   -- o antivírus do SES acusou: o arquivo NÃO entra na área de leitura
      insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, estado, motivo, verificacao)
      values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando, left(a->>'nome', 255), 'recusado', 'o antivírus do e-mail acusou este arquivo', v_ver)
      on conflict (cliente_id, mensagem_id, coalesce(arquivo_nome, '')) where md5 is null do nothing;
      continue;
    end if;
    if coalesce(a->>'tipo', '') not in ('pdf', 'xml') or coalesce(a->>'md5', '') !~ '^[0-9a-f]{32}$'
       or coalesce(a->>'storage_path', '') not like v_end.cliente_id::text || '/entrada/%'
       or coalesce((a->>'tamanho')::bigint, 0) not between 1 and 10485760 then
      raise exception 'D3: arquivo inválido (tipo, md5, caminho do cliente ou tamanho).' using errcode = '22023';
    end if;
    insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, tipo,
                                  tamanho_bytes, md5, storage_path, estado, verificacao)
    values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando, left(a->>'nome', 255), a->>'tipo', (a->>'tamanho')::integer,
            a->>'md5', a->>'storage_path', 'a_ler', v_ver)
    on conflict (cliente_id, md5) where md5 is not null do update
      set chegou_de_novo = entrada_arquivos.chegou_de_novo + 1, ultima_chegada_em = now()
    returning id, (xmax = 0) into v_id, v_novo;
    v_saida := v_saida || jsonb_build_object('md5', a->>'md5', 'id', v_id, 'novo', v_novo);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'recusas', '[]'::jsonb)) loop
    insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, arquivo_nome, estado, motivo, verificacao)
    values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando, left(r->>'nome', 255), 'recusado', left(r->>'motivo', 300), v_ver)
    on conflict (cliente_id, mensagem_id, coalesce(arquivo_nome, '')) where md5 is null do nothing;
  end loop;

  -- nada útil: UMA linha (sem anexo, ou a confirmação do Gmail — o código vem no ASSUNTO; o corpo não é lido)
  if jsonb_array_length(coalesce(p->'arquivos', '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(p->'recusas', '[]'::jsonb)) = 0 then
    insert into entrada_arquivos (cliente_id, entrada_email_id, mensagem_id, remetente, assunto, recebido_em, estado, motivo, verificacao)
    values (v_end.cliente_id, v_end.id, v_msg, v_rem, v_ass, v_quando,
            case when coalesce((p->>'confirmacao_gmail')::boolean, false) then 'confirmacao_gmail' else 'sem_anexo' end,
            case when coalesce((p->>'confirmacao_gmail')::boolean, false) then null else 'chegou sem PDF nem XML' end, v_ver)
    on conflict (cliente_id, mensagem_id, coalesce(arquivo_nome, '')) where md5 is null do nothing;
  end if;

  return jsonb_build_object('ok', true, 'cliente_id', v_end.cliente_id, 'arquivos', v_saida);
end $$;
revoke all on function public._fn_entrada_registrar(jsonb) from public, anon, authenticated;
grant execute on function public._fn_entrada_registrar(jsonb) to service_role;

-- ═══ 5. as RPCs da tela ═══
-- gerar (ou TROCAR: o antigo é revogado com o motivo, e o e-mail que chegar nele passa a ser descartado)
create function public.fn_entrada_email_gerar(p_cliente_id uuid, p_motivo text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_atual cliente_entrada_email; v_local text; v_id uuid;
begin
  if not public.tenant_ok(p_cliente_id) or not public._fn_entrada_pode_gerir(p_cliente_id) then
    raise exception 'Só o gestor do cliente ou a AgroinBlue gera o endereço de boletos.' using errcode = '42501';
  end if;
  select * into v_atual from cliente_entrada_email e where e.cliente_id = p_cliente_id and e.ativo for update;
  if found and nullif(btrim(p_motivo), '') is null then
    raise exception 'Trocar o endereço pede o motivo (o antigo para de receber).' using errcode = 'P0001';
  end if;
  v_local := public._fn_entrada_local(p_cliente_id);
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true,
      'endereco', regexp_replace(v_local, '-[a-z0-9]{10}$', '-…') || '@' || public._fn_entrada_dominio(),
      'antigo', case when v_atual.id is null then null else v_atual.local || '@' || public._fn_entrada_dominio() end);
  end if;
  if v_atual.id is not null then
    update cliente_entrada_email set ativo = false, revogado_em = now(), revogado_por = auth.uid(), revogado_motivo = btrim(p_motivo)
     where id = v_atual.id;
  end if;
  insert into cliente_entrada_email (cliente_id, local, criado_por) values (p_cliente_id, v_local, auth.uid()) returning id into v_id;
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id, 'endereco', v_local || '@' || public._fn_entrada_dominio(),
    'antigo', case when v_atual.id is null then null else v_atual.local || '@' || public._fn_entrada_dominio() end);
end $$;

create function public.fn_entrada_email_revogar(p_cliente_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_atual cliente_entrada_email;
begin
  if not public.tenant_ok(p_cliente_id) or not public._fn_entrada_pode_gerir(p_cliente_id) then
    raise exception 'Só o gestor do cliente ou a AgroinBlue revoga o endereço de boletos.' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Revogar pede o motivo.' using errcode = 'P0001'; end if;
  select * into v_atual from cliente_entrada_email e where e.cliente_id = p_cliente_id and e.ativo for update;
  if not found then raise exception 'Este cliente não tem endereço de boletos ativo.' using errcode = 'P0001'; end if;
  if not p_simular then
    update cliente_entrada_email set ativo = false, revogado_em = now(), revogado_por = auth.uid(), revogado_motivo = btrim(p_motivo)
     where id = v_atual.id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'endereco', v_atual.local || '@' || public._fn_entrada_dominio());
end $$;

-- dispensar uma linha que não vai virar nada (sem anexo, recusado, a confirmação, o não reconhecido, ou um arquivo que não interessa)
create function public.fn_entrada_dispensar(p_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos;
begin
  select * into v from entrada_arquivos where id = p_id for update;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.estado in ('boleto', 'nota') then raise exception 'Este arquivo já entrou; não se dispensa.' using errcode = 'P0001'; end if;
  if v.estado = 'dispensado' then return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', true); end if;
  if not p_simular then
    update entrada_arquivos set estado = 'dispensado', dispensado_em = now(), dispensado_por = auth.uid() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', false);
end $$;

-- o navegador leu o arquivo (as regras de hoje) e diz o que ele é; boleto = o id que a `fn_boleto_entrar` devolveu, do MESMO cliente
create function public.fn_entrada_marcar_lido(p_id uuid, p_estado text, p_boleto_id uuid default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; v_cli uuid;
begin
  if p_estado not in ('boleto', 'nota', 'nao_reconhecido') then raise exception 'Estado de leitura inválido.' using errcode = '22023'; end if;
  select * into v from entrada_arquivos where id = p_id for update;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.estado not in ('a_ler', 'nao_reconhecido') then raise exception 'Este arquivo já foi lido ou dispensado.' using errcode = 'P0001'; end if;
  if p_estado = 'boleto' then
    select cliente_id into v_cli from boletos where id = p_boleto_id;
    if v_cli is distinct from v.cliente_id then raise exception 'O boleto não é deste cliente.' using errcode = '42501'; end if;
  elsif p_boleto_id is not null then raise exception 'Só o estado boleto leva o boleto.' using errcode = '22023';
  end if;
  if not p_simular then
    update entrada_arquivos set estado = p_estado, boleto_id = p_boleto_id, lido_em = now(), lido_por = auth.uid() where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular);
end $$;

revoke all on function public.fn_entrada_email_gerar(uuid, text, boolean) from public, anon;
revoke all on function public.fn_entrada_email_revogar(uuid, text, boolean) from public, anon;
revoke all on function public.fn_entrada_dispensar(uuid, boolean) from public, anon;
revoke all on function public.fn_entrada_marcar_lido(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.fn_entrada_email_gerar(uuid, text, boolean) to authenticated;
grant execute on function public.fn_entrada_email_revogar(uuid, text, boolean) to authenticated;
grant execute on function public.fn_entrada_dispensar(uuid, boolean) to authenticated;
grant execute on function public.fn_entrada_marcar_lido(uuid, text, uuid, boolean) to authenticated;
