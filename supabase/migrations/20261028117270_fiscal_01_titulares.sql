-- FISCAL-01 · F1 · os titulares (o contribuinte, CPF/CNPJ) e a composição de cada fazenda (Gabriel 04/11).
-- D1: uma fazenda pode ter vários titulares, cada um com a sua participação %, numa vigência. O ADM não tem titular próprio: as
--     despesas dele são rateadas pela participação, na LEITURA (F3); esta fatia não grava nada para ele.
-- Nada muda nos lançamentos nem no caixa. A conta bancária → titular fica para a F1b (a tabela de contas tem gatilhos próprios e
-- o ContaBancariaModal tem trabalho parado de outro Code).
-- Escrita SÓ pelas duas funções (prévia por p_simular, trilha na audit_log com o autor logado e a via). As tabelas: authenticated só lê,
-- pela RLS do cliente (tenant_ok); o perfil "leitura" é barrado pelo gatilho de sempre.
set local lock_timeout = '2s';

-- ── o CPF/CNPJ: só dígitos e o dígito verificador ─────────────────────────────────────────────────────────────────────────────────
create or replace function public._fn_cpf_cnpj_valido(p text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare d int[]; n int; s int; r int; i int; w int[];
begin
  if p is null or p !~ '^([0-9]{11}|[0-9]{14})$' then return false; end if;
  n := length(p);
  if p = repeat(substr(p, 1, 1), n) then return false; end if;
  d := array(select substr(p, g, 1)::int from generate_series(1, n) g);
  if n = 11 then
    s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> d[10] then return false; end if;
    s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = d[11];
  end if;
  w := array[5,4,3,2,9,8,7,6,5,4,3,2];
  s := 0; for i in 1..12 loop s := s + d[i] * w[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> d[13] then return false; end if;
  w := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s := 0; for i in 1..13 loop s := s + d[i] * w[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = d[14];
end $$;

create or replace function public._fn_cpf_cnpj_formatado(p text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case length(p)
    when 11 then substr(p,1,3) || '.' || substr(p,4,3) || '.' || substr(p,7,3) || '-' || substr(p,10,2)
    when 14 then substr(p,1,2) || '.' || substr(p,3,3) || '.' || substr(p,6,3) || '/' || substr(p,9,4) || '-' || substr(p,13,2)
    else p end
$$;

revoke all on function public._fn_cpf_cnpj_valido(text) from public, anon, authenticated;
revoke all on function public._fn_cpf_cnpj_formatado(text) from public, anon, authenticated;
grant execute on function public._fn_cpf_cnpj_valido(text) to service_role;
grant execute on function public._fn_cpf_cnpj_formatado(text) to service_role;

-- ── as tabelas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.fiscal_titulares (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  nome text not null check (btrim(nome) <> ''),
  documento text not null check (public._fn_cpf_cnpj_valido(documento)),
  tipo text generated always as (case when length(documento) = 11 then 'PF' else 'PJ' end) stored,
  ie text check (ie is null or ie ~ '^[0-9]{8,14}$'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_titulares_documento_uq unique (cliente_id, documento)
);
comment on table public.fiscal_titulares is
  'FISCAL-01 F1: o contribuinte (produtor PF ou PJ) do cliente. Escrita só por fn_fiscal_titular_gravar (prévia + trilha na audit_log).';
comment on column public.fiscal_titulares.documento is 'CPF (11) ou CNPJ (14), só dígitos, com o dígito verificador conferido.';

create table public.fiscal_fazenda_titulares (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fazenda_id uuid not null references public.fazendas(id),
  titular_id uuid not null references public.fiscal_titulares(id),
  participacao numeric(7,4) not null check (participacao > 0 and participacao <= 100),
  vigencia_inicio date not null,
  vigencia_fim date check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  substituida_em timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.fiscal_fazenda_titulares is
  'FISCAL-01 F1: a composição da fazenda (quem é titular e com quantos %), por vigência. Uma versão = as linhas com o mesmo '
  'vigencia_inicio e substituida_em nulo; somam 100%. Corrigir a versão marca substituida_em (nada se apaga). Escrita só por '
  'fn_fiscal_fazenda_titulares_gravar.';
create index fiscal_fazenda_titulares_faz_idx on public.fiscal_fazenda_titulares (fazenda_id, vigencia_inicio) where substituida_em is null;
create unique index fiscal_fazenda_titulares_uq on public.fiscal_fazenda_titulares (fazenda_id, titular_id, vigencia_inicio)
  where substituida_em is null;
create index fiscal_fazenda_titulares_tit_idx on public.fiscal_fazenda_titulares (titular_id);

alter table public.fiscal_titulares enable row level security;
alter table public.fiscal_fazenda_titulares enable row level security;
create policy fiscal_titulares_ler on public.fiscal_titulares for select to authenticated using (public.tenant_ok(cliente_id));
create policy fiscal_fazenda_titulares_ler on public.fiscal_fazenda_titulares for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_titulares, public.fiscal_fazenda_titulares from public, anon, authenticated;
grant select on public.fiscal_titulares, public.fiscal_fazenda_titulares to authenticated;
grant all on public.fiscal_titulares, public.fiscal_fazenda_titulares to service_role;
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_titulares
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_fazenda_titulares
  for each statement execute function public._fn_leitura_nao_grava();

-- ── o titular: criar ou editar (nome, documento, IE, ativo) ─────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_titular_gravar(p_cliente_id uuid, p_titular_id uuid, p_dados jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  t public.fiscal_titulares; v_nome text; v_doc text; v_ie text; v_ativo boolean; v_tipo text; v_fmt text;
  v_outro text; v_faz text; v_antes jsonb; v_depois jsonb; v_dif jsonb := '[]'::jsonb; k text; v_id uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Informe os dados do titular.'; end if;
  if p_titular_id is not null then
    select * into t from public.fiscal_titulares where id = p_titular_id;
    if t.id is null or t.cliente_id <> p_cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
  end if;

  v_nome := btrim(regexp_replace(coalesce(case when p_dados ? 'nome' then p_dados->>'nome' else t.nome end, ''), '\s+', ' ', 'g'));
  if v_nome = '' then raise exception 'Informe o nome do titular.'; end if;
  v_doc := regexp_replace(coalesce(case when p_dados ? 'documento' then p_dados->>'documento' else t.documento end, ''), '\D', '', 'g');
  if v_doc = '' then raise exception 'Informe o CPF ou o CNPJ do titular.'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF/CNPJ: informe 11 dígitos (CPF) ou 14 (CNPJ).'; end if;
  v_tipo := case when length(v_doc) = 11 then 'CPF' else 'CNPJ' end;
  v_fmt := public._fn_cpf_cnpj_formatado(v_doc);
  if not public._fn_cpf_cnpj_valido(v_doc) then
    raise exception '%', format('O %s %s não é válido: confira os dígitos.', v_tipo, v_fmt);
  end if;
  if p_dados ? 'ie' then
    v_ie := nullif(regexp_replace(coalesce(p_dados->>'ie', ''), '\D', '', 'g'), '');
    if v_ie is not null and (length(v_ie) < 8 or length(v_ie) > 14) then
      raise exception '%', format('"%s" não parece uma inscrição estadual.', p_dados->>'ie');
    end if;
  else
    v_ie := t.ie;
  end if;
  if p_dados ? 'ativo' then
    if jsonb_typeof(p_dados->'ativo') <> 'boolean' then raise exception 'Ativo: use verdadeiro ou falso.'; end if;
    v_ativo := (p_dados->>'ativo')::boolean;
  else
    v_ativo := coalesce(t.ativo, true);
  end if;

  select x.nome into v_outro from public.fiscal_titulares x
   where x.cliente_id = p_cliente_id and x.documento = v_doc and x.id is distinct from t.id limit 1;
  if v_outro is not null then raise exception '%', format('O %s %s já é do titular %s.', v_tipo, v_fmt, v_outro); end if;

  if t.id is not null and v_doc <> t.documento
     and exists (select 1 from public.fiscal_fazenda_titulares ft where ft.titular_id = t.id and ft.substituida_em is null) then
    raise exception 'O CPF/CNPJ de um titular com participação em fazenda não muda: cadastre outro titular.';
  end if;
  if t.id is not null and t.ativo and not v_ativo then
    select string_agg(distinct f.nome, ', ') into v_faz
      from public.fiscal_fazenda_titulares ft join public.fazendas f on f.id = ft.fazenda_id
     where ft.titular_id = t.id and ft.substituida_em is null and (ft.vigencia_fim is null or ft.vigencia_fim >= v_hoje);
    if v_faz is not null then
      raise exception '%', format('%s tem participação vigente em %s: encerre a participação antes de inativar.', v_nome, v_faz);
    end if;
  end if;

  v_antes := case when t.id is null then null
                  else jsonb_build_object('nome', t.nome, 'documento', t.documento, 'ie', t.ie, 'ativo', t.ativo) end;
  v_depois := jsonb_build_object('nome', v_nome, 'documento', v_doc, 'ie', v_ie, 'ativo', v_ativo);
  foreach k in array array['nome', 'documento', 'ie', 'ativo'] loop
    if (v_antes->k) is distinct from (v_depois->k) then
      v_dif := v_dif || jsonb_build_array(jsonb_build_object('campo', k, 'antes', v_antes->k, 'depois', v_depois->k));
    end if;
  end loop;

  if p_simular or jsonb_array_length(v_dif) = 0 then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'titular_id', t.id, 'tipo', v_tipo,
      'documento_formatado', v_fmt, 'diferencas', v_dif,
      'frase', case when jsonb_array_length(v_dif) = 0 then format('%s: nada muda.', v_nome)
                    when t.id is null then format('Cria o titular %s (%s %s).', v_nome, v_tipo, v_fmt)
                    else format('Atualiza o titular %s (%s %s).', v_nome, v_tipo, v_fmt) end);
  end if;

  if t.id is null then
    insert into public.fiscal_titulares (cliente_id, nome, documento, ie, ativo)
    values (p_cliente_id, v_nome, v_doc, v_ie, v_ativo) returning id into v_id;
  else
    update public.fiscal_titulares set nome = v_nome, documento = v_doc, ie = v_ie, ativo = v_ativo, updated_at = now()
     where id = t.id;
    v_id := t.id;
  end if;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (p_cliente_id, auth.uid(), 'fiscal', case when t.id is null then 'criou' else 'editou' end, 'fiscal_titulares', v_id,
    format('Titular %s (%s %s)%s', v_nome, v_tipo, v_fmt, case when t.id is null then ' criado' else ' editado' end),
    v_antes, v_depois, public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'titular_id', v_id, 'tipo', v_tipo,
    'documento_formatado', v_fmt, 'diferencas', v_dif);
end $$;

-- ── a composição da fazenda a partir de uma data (lista vazia = a fazenda fica sem titular a partir dela) ───────────────────────
create or replace function public.fn_fiscal_fazenda_titulares_gravar(p_fazenda_id uuid, p_inicio date, p_titulares jsonb,
                                                                      p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.fazendas; e jsonb; v_tid uuid; v_pct numeric; t public.fiscal_titulares; v_soma numeric := 0;
  v_novos jsonb := '[]'::jsonb; v_antes jsonb; v_ini_vig date; v_fim_mesma date; v_mesma boolean; v_depois_ord jsonb;
  v_conflito date; v_fecha date;
begin
  select * into f from public.fazendas where id = p_fazenda_id;
  if f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta fazenda.';
  end if;
  if p_inicio is null then raise exception 'Informe o início da vigência.'; end if;
  if p_titulares is null or jsonb_typeof(p_titulares) <> 'array' then raise exception 'Informe a lista de titulares.'; end if;

  for e in select * from jsonb_array_elements(p_titulares) loop
    if coalesce(e->>'titular_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Titular não encontrado neste cliente.';
    end if;
    v_tid := (e->>'titular_id')::uuid;
    select * into t from public.fiscal_titulares where id = v_tid;
    if t.id is null or t.cliente_id <> f.cliente_id then raise exception 'Titular não encontrado neste cliente.'; end if;
    if not t.ativo then raise exception '%', format('O titular %s está inativo.', t.nome); end if;
    if v_novos @> jsonb_build_array(jsonb_build_object('titular_id', v_tid)) then
      raise exception '%', format('O titular %s aparece duas vezes.', t.nome);
    end if;
    if coalesce(e->>'participacao', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception '%', format('Participação de %s: use um número de 0 a 100.', t.nome);
    end if;
    v_pct := round((e->>'participacao')::numeric, 4);
    if v_pct <= 0 or v_pct > 100 then raise exception '%', format('Participação de %s: de 0 a 100%%.', t.nome); end if;
    v_soma := v_soma + v_pct;
    v_novos := v_novos || jsonb_build_array(jsonb_build_object('titular_id', v_tid, 'nome', t.nome, 'participacao', v_pct));
  end loop;
  if jsonb_array_length(v_novos) > 0 and v_soma <> 100 then
    raise exception '%', format('As participações somam %s%%: têm de somar 100%%.', replace(trim_scale(v_soma)::text, '.', ','));
  end if;

  -- só a última versão se corrige, e a nova começa depois dela: nada no meio de uma vigência já gravada
  select max(vigencia_inicio) into v_conflito from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio > p_inicio;
  if v_conflito is not null then
    raise exception '%', format('A composição de %s já tem uma versão a partir de %s: a nova começa nessa data (para corrigi-la) ou depois.',
      f.nome, to_char(v_conflito, 'DD/MM/YYYY'));
  end if;
  select max(vigencia_fim) into v_conflito from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio < p_inicio and vigencia_fim >= p_inicio;
  if v_conflito is not null then
    raise exception '%', format('A composição de %s vai até %s: a nova começa depois.', f.nome, to_char(v_conflito, 'DD/MM/YYYY'));
  end if;

  -- o que vale em p_inicio hoje
  select max(vigencia_inicio) into v_ini_vig from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio <= p_inicio
     and (vigencia_fim is null or vigencia_fim >= p_inicio);
  select coalesce(jsonb_agg(jsonb_build_object('titular_id', ft.titular_id, 'nome', x.nome, 'participacao', ft.participacao)
                            order by ft.titular_id), '[]'::jsonb)
    into v_antes
    from public.fiscal_fazenda_titulares ft join public.fiscal_titulares x on x.id = ft.titular_id
   where ft.fazenda_id = f.id and ft.substituida_em is null and ft.vigencia_inicio = v_ini_vig;
  v_mesma := v_ini_vig = p_inicio;
  select max(vigencia_fim) into v_fim_mesma from public.fiscal_fazenda_titulares
   where fazenda_id = f.id and substituida_em is null and vigencia_inicio = p_inicio;
  select coalesce(jsonb_agg(n order by (n->>'titular_id')::uuid), '[]'::jsonb) into v_depois_ord from jsonb_array_elements(v_novos) n;

  if p_simular or v_antes = v_depois_ord then
    return jsonb_build_object('simulado', p_simular, 'gravado', false, 'fazenda', f.nome, 'inicio', p_inicio,
      'antes', v_antes, 'depois', v_depois_ord, 'corrige_a_versao', coalesce(v_mesma, false),
      'anterior_termina', case when v_ini_vig is not null and not coalesce(v_mesma, false) then p_inicio - 1 end,
      'frase', case when v_antes = v_depois_ord then format('%s: nada muda a partir de %s.', f.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    when jsonb_array_length(v_novos) = 0 then format('%s fica sem titular a partir de %s.', f.nome, to_char(p_inicio, 'DD/MM/YYYY'))
                    else format('%s: nova composição a partir de %s.', f.nome, to_char(p_inicio, 'DD/MM/YYYY')) end);
  end if;

  if coalesce(v_mesma, false) then
    update public.fiscal_fazenda_titulares set substituida_em = now()
     where fazenda_id = f.id and substituida_em is null and vigencia_inicio = p_inicio;
    v_fecha := v_fim_mesma;
  else
    update public.fiscal_fazenda_titulares set vigencia_fim = p_inicio - 1
     where fazenda_id = f.id and substituida_em is null and vigencia_inicio = v_ini_vig;
    v_fecha := null;
  end if;
  insert into public.fiscal_fazenda_titulares (cliente_id, fazenda_id, titular_id, participacao, vigencia_inicio, vigencia_fim)
  select f.cliente_id, f.id, (n->>'titular_id')::uuid, (n->>'participacao')::numeric, p_inicio, v_fecha
    from jsonb_array_elements(v_novos) n;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                dados_anteriores, dados_novos, via)
  values (f.cliente_id, f.id, auth.uid(), 'fiscal', 'editou', 'fiscal_fazenda_titulares', f.id,
    format('%s · titulares a partir de %s%s', f.nome, to_char(p_inicio, 'DD/MM/YYYY'),
           case when coalesce(v_mesma, false) then ' (corrige a composição desta data)' else '' end),
    jsonb_build_object('inicio', v_ini_vig, 'titulares', v_antes),
    jsonb_build_object('inicio', p_inicio, 'titulares', v_depois_ord), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'fazenda', f.nome, 'inicio', p_inicio,
    'antes', v_antes, 'depois', v_depois_ord, 'corrige_a_versao', coalesce(v_mesma, false));
end $$;

revoke all on function public.fn_fiscal_titular_gravar(uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_fiscal_fazenda_titulares_gravar(uuid, date, jsonb, boolean) from public, anon;
grant execute on function public.fn_fiscal_titular_gravar(uuid, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_fazenda_titulares_gravar(uuid, date, jsonb, boolean) to authenticated, service_role;
