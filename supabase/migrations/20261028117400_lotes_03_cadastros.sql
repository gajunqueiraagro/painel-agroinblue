-- LOTES-03 F1 (Gabriel 06/11/2026, mock lotes-03-assistente.html aprovado 15:45) — os CADASTROS do lote, por cliente (nada de lista fixa).
-- Seis listas numa tabela só: categoria de lote (sigla + as categorias do rebanho que entram), raça, atividade (as três com sigla: são as
-- partes do código CAT-RAÇA-ATIV-NN) e as opções de sistema, programa e destino (só nome).
-- Escrita SÓ pela `fn_lote_cadastro_salvar` (trava `app.lote_escritor`); trilha em `audit_log` (o mesmo `_fn_trilha_cadastro` dos cadastros).
-- Caminho de volta: editar (o nome sempre; a sigla só enquanto nenhum lote a usa) e desativar (o "Desfazer" logo depois de cadastrar).
set local lock_timeout = '2s';

create table public.rebanho_lote_cadastros (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes(id),
  tipo               text not null check (tipo in ('categoria', 'raca', 'atividade', 'sistema', 'programa', 'destino')),
  sigla              text,
  nome               text not null check (btrim(nome) <> '' and length(nome) <= 32),
  categorias_rebanho uuid[] not null default '{}',
  ordem              integer not null default 0,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  criado_por         uuid default auth.uid(),
  atualizado_em      timestamptz not null default now(),
  constraint rebanho_lote_cadastros_sigla_ok check (
       (tipo in ('categoria', 'raca', 'atividade') and sigla ~ '^[A-Z0-9]{2,3}$')
    or (tipo in ('sistema', 'programa', 'destino') and sigla is null)),
  constraint rebanho_lote_cadastros_categorias_ok check (tipo = 'categoria' or cardinality(categorias_rebanho) = 0)
);
create unique index rebanho_lote_cadastros_sigla_unica on public.rebanho_lote_cadastros (cliente_id, tipo, sigla) where ativo and sigla is not null;
create unique index rebanho_lote_cadastros_nome_unico on public.rebanho_lote_cadastros (cliente_id, tipo, lower(nome)) where ativo;

alter table public.rebanho_lote_cadastros enable row level security;
create policy rebanho_lote_cadastros_select_tenant on public.rebanho_lote_cadastros for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.rebanho_lote_cadastros from public, anon;
grant select on public.rebanho_lote_cadastros to authenticated;

/* a trava: insert/update só com o escritor ligado (o mesmo molde da ficha do pasto) */
create or replace function public._fn_lote_so_pelo_escritor()
returns trigger language plpgsql set search_path to 'pg_catalog', 'public' as $$
begin
  if coalesce(current_setting('app.lote_escritor', true), '') = '1' then return coalesce(new, old); end if;
  raise exception using errcode = 'P0001', message = 'Os lotes e os cadastros deles gravam só pela tela de Lotes. Nada foi gravado.';
end $$;
create trigger trg_rebanho_lote_cadastros_so_pelo_escritor before insert or update or delete on public.rebanho_lote_cadastros
  for each row execute function public._fn_lote_so_pelo_escritor();
create trigger trg_trilha_cadastro after insert or update or delete on public.rebanho_lote_cadastros
  for each row execute function public._fn_trilha_cadastro('lotes');

/* Criar (p_id nulo) ou editar um cadastro. Sigla travada quando algum lote (vivo ou encerrado) a usa; desativar idem. */
create or replace function public.fn_lote_cadastro_salvar(p_cliente uuid, p_tipo text, p_id uuid, p_sigla text, p_nome text,
  p_categorias uuid[] default '{}', p_ativo boolean default true, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  v_old public.rebanho_lote_cadastros%rowtype;
  v_sigla text := nullif(upper(btrim(coalesce(p_sigla, ''))), '');
  v_nome text := btrim(coalesce(p_nome, ''));
  v_cats uuid[] := coalesce(p_categorias, '{}');
  v_usos integer := 0; v_dup text; v_id uuid;
begin
  perform public._fn_exigir_tenant_das_linhas(array[p_cliente]);
  if p_tipo is null or p_tipo not in ('categoria', 'raca', 'atividade', 'sistema', 'programa', 'destino') then
    raise exception using errcode = 'P0001', message = 'Cadastro desconhecido. Nada foi gravado.';
  end if;
  if p_tipo in ('sistema', 'programa', 'destino') then v_sigla := null; v_cats := '{}'; end if;
  if p_tipo in ('raca', 'atividade') then v_cats := '{}'; end if;
  if p_tipo in ('categoria', 'raca', 'atividade') and (v_sigla is null or v_sigla !~ '^[A-Z0-9]{2,3}$') then
    raise exception using errcode = 'P0001', message = 'A sigla precisa de 2 ou 3 letras ou números.';
  end if;
  if v_nome = '' then raise exception using errcode = 'P0001', message = 'Falta o nome.'; end if;
  if length(v_nome) > 32 then raise exception using errcode = 'P0001', message = 'O nome passa de 32 letras.'; end if;
  if p_tipo = 'categoria' and cardinality(v_cats) = 0 then
    raise exception using errcode = 'P0001', message = 'Marque pelo menos uma categoria do rebanho.';
  end if;
  if exists (select 1 from unnest(v_cats) c where not exists (select 1 from public.categorias_rebanho r where r.id = c)) then
    raise exception using errcode = 'P0001', message = 'Uma das categorias do rebanho não existe. Escolha de novo.';
  end if;

  if p_id is not null then
    select * into v_old from public.rebanho_lote_cadastros where id = p_id for update;
    if v_old.id is null or v_old.cliente_id <> p_cliente or v_old.tipo <> p_tipo then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    select count(*) into v_usos from public.rebanho_lotes l
     where p_id in (l.categoria_id, l.raca_id, l.atividade_id, l.sistema_id, l.programa_id, l.destino_id);
    if v_usos > 0 and v_old.sigla is distinct from v_sigla then
      raise exception using errcode = 'P0001',
        message = format('A sigla está travada: %s lote%s %s %s no código. O nome pode mudar.', v_usos,
                         case when v_usos > 1 then 's' else '' end, case when v_usos > 1 then 'usam' else 'usa' end, v_old.sigla);
    end if;
    if v_usos > 0 and not coalesce(p_ativo, true) then
      raise exception using errcode = 'P0001', message = format('%s lote%s usa%s este cadastro: ele não pode sair da lista.', v_usos,
                         case when v_usos > 1 then 's' else '' end, case when v_usos > 1 then 'm' else '' end);
    end if;
  end if;

  if coalesce(p_ativo, true) then
    select format('A sigla %s já é “%s”. Escolha outra ou use a existente.', c.sigla, c.nome) into v_dup
      from public.rebanho_lote_cadastros c
     where c.cliente_id = p_cliente and c.tipo = p_tipo and c.ativo and c.id is distinct from p_id and v_sigla is not null and c.sigla = v_sigla;
    if v_dup is null then
      select format('“%s” já está no cadastro.', c.nome) into v_dup
        from public.rebanho_lote_cadastros c
       where c.cliente_id = p_cliente and c.tipo = p_tipo and c.ativo and c.id is distinct from p_id and lower(c.nome) = lower(v_nome);
    end if;
    if v_dup is not null then raise exception using errcode = 'P0001', message = v_dup; end if;
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', p_id, 'sigla', v_sigla, 'nome', v_nome, 'usos', v_usos);
  end if;
  perform set_config('app.lote_escritor', '1', true);
  if p_id is null then
    insert into public.rebanho_lote_cadastros (cliente_id, tipo, sigla, nome, categorias_rebanho, ordem)
    values (p_cliente, p_tipo, v_sigla, v_nome, v_cats,
            coalesce((select max(ordem) + 10 from public.rebanho_lote_cadastros where cliente_id = p_cliente and tipo = p_tipo), 10))
    returning id into v_id;
  else
    update public.rebanho_lote_cadastros set sigla = v_sigla, nome = v_nome, categorias_rebanho = v_cats, ativo = coalesce(p_ativo, true),
           atualizado_em = now()
     where id = p_id;
    v_id := p_id;
  end if;
  perform set_config('app.lote_escritor', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id, 'sigla', v_sigla, 'nome', v_nome, 'usos', v_usos);
end $$;
revoke all on function public.fn_lote_cadastro_salvar(uuid, text, uuid, text, text, uuid[], boolean, boolean) from public, anon;
grant execute on function public.fn_lote_cadastro_salvar(uuid, text, uuid, text, text, uuid[], boolean, boolean) to authenticated;
