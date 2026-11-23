-- FOLHA-01 · PR A — o banco da folha de pagamento. Esquema aprovado pelo Gabriel 18/11/2026 13:25 (F1–F8; F5 Higino 50%; F6
-- pró-labore/domésticas fora — só o REGISTRADO entra). Relatório: folha-20261118-1257-FOLHA-01-FASE0-ESQUEMA.md §6.
--
-- O QUE CRIA (12 tabelas, todas por cliente, só LEITURA pela API e só para quem tem o ACESSO DA FOLHA; escrita só pelas funções):
--   folha_acessos (a marca por pessoa e cliente: 'folha' e 'folha_por_fora', como o aprovador do BPO) · folha_funcionarios ·
--   folha_funcionario_salarios (histórico "desde"; parte_pct = a parte que ESTE cliente paga, F5) · folha_funcionario_atuacao
--   (fazenda × atividade × %, "desde") · folha_folhas (mês/13º/férias/rescisão; prevista → conferida → confirmada) ·
--   folha_documentos · folha_pessoas (bruto/descontos/líquido/bases por pessoa) · folha_rubricas · folha_por_fora (RLS à parte) ·
--   folha_guias · folha_ferias_periodos · folha_trilha (imutável).
-- REGRAS: o sistema REGISTRA o que o contador manda (não calcula INSS/IRRF); a conferência barra (líquido = bruto − descontos,
--   rubricas = totais); nada se apaga de folha/pessoa/guia/documento (cancelar com motivo); todo gesto tem prévia (p_simular).
-- O QUE NÃO FAZ: não toca em lançamento nem recorrência (PR D) e não lê PDF (PR C, lerFolha no navegador).
-- ACESSO: folha_ok(cliente) = admin AGROinBLUE ou (membro do cliente E marca 'folha' ativa); folha_por_fora_ok exige também a
--   marca 'folha_por_fora'. Só o admin marca. As funções da RLS ficam abertas a authenticated (a policy roda com quem lê).
-- DESFAZER: as tabelas nascem vazias; drop das 12 tabelas e das funções fn_folha_* / _fn_folha_* / folha_ok / folha_por_fora_ok.

set local lock_timeout = '2s';
select set_config('app.via', 'FOLHA-01', true);

do $pre$ begin
  if to_regclass('public.folha_funcionarios') is not null then raise exception 'FOLHA-01 PR A: já aplicado (folha_funcionarios existe).'; end if;
end $pre$;

-- ═══ 1. o acesso ══════════════════════════════════════════════════════════════════════════════════════════════════════════
create table public.folha_acessos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id),
  user_id       uuid not null,
  nivel         text not null check (nivel in ('folha', 'folha_por_fora')),
  ativo         boolean not null default true,
  criado_por    uuid not null,
  criado_em     timestamptz not null default now(),
  desligado_por uuid,
  desligado_em  timestamptz,
  check (ativo = (desligado_em is null))
);
create unique index ux_folha_acessos_vivo on public.folha_acessos (cliente_id, user_id, nivel) where ativo;

create function public.folha_ok(_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin_agroinblue((select auth.uid()))
      or (_cliente is not null and public.tenant_ok(_cliente)
          and exists (select 1 from public.folha_acessos a where a.cliente_id = _cliente and a.user_id = (select auth.uid())
                         and a.nivel = 'folha' and a.ativo))
$$;
create function public.folha_por_fora_ok(_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin_agroinblue((select auth.uid()))
      or (public.folha_ok(_cliente)
          and exists (select 1 from public.folha_acessos a where a.cliente_id = _cliente and a.user_id = (select auth.uid())
                         and a.nivel = 'folha_por_fora' and a.ativo))
$$;
revoke all on function public.folha_ok(uuid) from public, anon;
revoke all on function public.folha_por_fora_ok(uuid) from public, anon;
grant execute on function public.folha_ok(uuid) to authenticated, service_role;
grant execute on function public.folha_por_fora_ok(uuid) to authenticated, service_role;

-- ═══ 2. o funcionário ═════════════════════════════════════════════════════════════════════════════════════════════════════
create table public.folha_funcionarios (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references public.clientes(id),
  nome                  text not null check (btrim(nome) <> '' and length(nome) <= 200),
  cpf                   text check (cpf ~ '^[0-9]{11}$'),
  favorecido_id         uuid references public.financeiro_fornecedores(id),
  codigo_contador       text check (length(codigo_contador) <= 30),
  cargo                 text check (length(cargo) <= 120),
  cbo                   text check (length(cbo) <= 20),
  vinculo               text not null default 'clt' check (vinculo in ('clt', 'diarista', 'pro_labore', 'domestico', 'autonomo', 'outro')),
  empregador_registro   text check (length(empregador_registro) <= 200),
  admissao              date,
  situacao              text not null default 'ativo' check (situacao in ('ativo', 'afastado', 'desligado')),
  desligamento          date,
  desligamento_motivo   text check (length(desligamento_motivo) <= 300),
  a_atualizar           text[] not null default '{}',
  recorrencia_origem_id uuid references public.financeiro_recorrencias(id),
  observacao            text check (length(observacao) <= 500),
  criado_por            uuid,
  criado_em             timestamptz not null default now(),
  atualizado_por        uuid,
  atualizado_em         timestamptz not null default now(),
  check ((situacao = 'desligado') = (desligamento is not null)),
  check (desligamento is null or admissao is null or desligamento >= admissao)
);
create unique index ux_folha_funcionarios_cpf on public.folha_funcionarios (cliente_id, cpf) where cpf is not null;
create unique index ux_folha_funcionarios_codigo on public.folha_funcionarios (cliente_id, coalesce(empregador_registro, ''), codigo_contador)
  where codigo_contador is not null;
create index ix_folha_funcionarios_cliente on public.folha_funcionarios (cliente_id, situacao);

create table public.folha_funcionario_salarios (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  funcionario_id uuid not null references public.folha_funcionarios(id),
  desde          date not null,
  salario        numeric(14,2) not null check (salario >= 0),
  parte_pct      numeric(5,2) not null default 100 check (parte_pct > 0 and parte_pct <= 100),
  motivo         text check (length(motivo) <= 300),
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  unique (funcionario_id, desde)
);

create table public.folha_funcionario_atuacao (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  funcionario_id uuid not null references public.folha_funcionarios(id),
  desde          date not null,
  fazenda_id     uuid not null references public.fazendas(id),
  atividade      text not null check (atividade in ('pecuaria', 'agricultura', 'silvicultura', 'administrativo')),
  pct            numeric(5,2) not null check (pct > 0 and pct <= 100),
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  unique (funcionario_id, desde, fazenda_id, atividade)
);

-- ═══ 3. a folha ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
create table public.folha_folhas (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes(id),
  competencia      text not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tipo             text not null check (tipo in ('mensal', '13_1', '13_2', 'ferias', 'rescisao', 'adiantamento')),
  funcionario_id   uuid references public.folha_funcionarios(id),
  data_pagamento   date,
  situacao         text not null default 'prevista' check (situacao in ('prevista', 'conferida', 'confirmada')),
  confirmada_por   uuid,
  confirmada_em    timestamptz,
  observacao       text check (length(observacao) <= 500),
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  atualizado_por   uuid,
  atualizado_em    timestamptz not null default now(),
  cancelado_em     timestamptz,
  cancelado_por    uuid,
  cancelado_motivo text,
  check ((situacao = 'confirmada') = (confirmada_em is not null)),
  check ((cancelado_em is null) = (cancelado_motivo is null)),
  check (tipo not in ('ferias', 'rescisao') or funcionario_id is not null)
);
create unique index ux_folha_folhas_mes on public.folha_folhas (cliente_id, competencia, tipo)
  where tipo in ('mensal', '13_1', '13_2') and cancelado_em is null;
create index ix_folha_folhas_cliente on public.folha_folhas (cliente_id, competencia);

create table public.folha_documentos (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes(id),
  folha_id           uuid references public.folha_folhas(id),
  funcionario_id     uuid references public.folha_funcionarios(id),
  especie            text not null check (especie in ('holerite', 'recibo_13', 'guia_inss', 'guia_fgts', 'escala_ferias', 'recibo_ferias',
                                                     'rescisao', 'contrato', 'ctps', 'aso', 'outro')),
  nome               text not null check (btrim(nome) <> ''),
  storage_path       text not null,
  tipo               text,
  tamanho_bytes      bigint,
  md5                text check (md5 ~ '^[0-9a-f]{32}$'),
  entrada_arquivo_id uuid references public.entrada_arquivos(id),
  enviado_por        uuid,
  criado_em          timestamptz not null default now(),
  cancelado_em       timestamptz,
  cancelado_por      uuid,
  cancelado_motivo   text,
  check (folha_id is not null or funcionario_id is not null),
  check ((cancelado_em is null) = (cancelado_motivo is null))
);
create unique index ux_folha_documentos_md5 on public.folha_documentos (cliente_id, md5) where md5 is not null and cancelado_em is null;

create table public.folha_pessoas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  folha_id       uuid not null references public.folha_folhas(id),
  funcionario_id uuid not null references public.folha_funcionarios(id),
  bruto          numeric(14,2) not null check (bruto >= 0),
  descontos      numeric(14,2) not null default 0 check (descontos >= 0),
  liquido        numeric(14,2) not null,
  base_inss      numeric(14,2) check (base_inss >= 0),
  base_fgts      numeric(14,2) check (base_fgts >= 0),
  valor_fgts     numeric(14,2) check (valor_fgts >= 0),
  base_irrf      numeric(14,2) check (base_irrf >= 0),
  origem         text not null check (origem in ('prevista', 'documento', 'manual')),
  documento_id   uuid references public.folha_documentos(id),
  lancamento_id  uuid references public.financeiro_lancamentos_v2(id),
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  unique (folha_id, funcionario_id),
  check (liquido = bruto - descontos)
);

create table public.folha_rubricas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id),
  folha_pessoa_id uuid not null references public.folha_pessoas(id) on delete cascade,
  ordem           integer not null default 0,
  codigo          text check (length(codigo) <= 20),
  descricao       text not null check (btrim(descricao) <> '' and length(descricao) <= 120),
  natureza        text not null check (natureza in ('provento', 'desconto', 'informativo')),
  referencia      numeric(12,4),
  valor           numeric(14,2) not null check (valor >= 0)
);
create index ix_folha_rubricas_pessoa on public.folha_rubricas (folha_pessoa_id);

create table public.folha_por_fora (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes(id),
  folha_id         uuid not null references public.folha_folhas(id),
  funcionario_id   uuid not null references public.folha_funcionarios(id),
  descricao        text not null check (btrim(descricao) <> '' and length(descricao) <= 200),
  valor            numeric(14,2) not null check (valor > 0),
  lancamento_id    uuid references public.financeiro_lancamentos_v2(id),
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  cancelado_em     timestamptz,
  cancelado_por    uuid,
  cancelado_motivo text,
  check ((cancelado_em is null) = (cancelado_motivo is null))
);

create table public.folha_guias (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes(id),
  folha_id         uuid not null references public.folha_folhas(id),
  tipo             text not null check (tipo in ('inss_darf', 'fgts_gfd', 'irrf', 'sindical', 'outro')),
  competencia      text not null check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  vencimento       date not null,
  valor            numeric(14,2) not null check (valor > 0),
  numero_documento text check (length(numero_documento) <= 60),
  composicao       jsonb not null default '[]'::jsonb check (jsonb_typeof(composicao) = 'array'),
  documento_id     uuid references public.folha_documentos(id),
  lancamento_id    uuid references public.financeiro_lancamentos_v2(id),
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  cancelado_em     timestamptz,
  cancelado_por    uuid,
  cancelado_motivo text,
  check ((cancelado_em is null) = (cancelado_motivo is null))
);

create table public.folha_ferias_periodos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id),
  funcionario_id    uuid not null references public.folha_funcionarios(id),
  aquisitivo_inicio date not null,
  aquisitivo_fim    date not null,
  vencimento        date,
  ultimo_prazo      date,
  dias_pagos        numeric(5,1) not null default 0 check (dias_pagos >= 0),
  saldo_dias        numeric(5,1) not null default 0 check (saldo_dias >= 0),
  faltas            integer not null default 0 check (faltas >= 0),
  documento_id      uuid references public.folha_documentos(id),
  lido_em           timestamptz,
  atualizado_por    uuid,
  atualizado_em     timestamptz not null default now(),
  unique (funcionario_id, aquisitivo_inicio),
  check (aquisitivo_fim > aquisitivo_inicio)
);

create table public.folha_trilha (
  id          bigint generated always as identity primary key,
  cliente_id  uuid not null references public.clientes(id),
  tabela      text not null,
  registro_id uuid not null,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  motivo      text,
  usuario_id  uuid,
  via         text,
  em          timestamptz not null default now()
);
create index ix_folha_trilha_registro on public.folha_trilha (registro_id, em);

create function public._fn_folha_trilha_imutavel() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'A trilha da folha não se altera nem se apaga.' using errcode = '42501';
end $$;
revoke all on function public._fn_folha_trilha_imutavel() from public, anon, authenticated;
create trigger trg_folha_trilha_imutavel before update or delete on public.folha_trilha
  for each row execute function public._fn_folha_trilha_imutavel();

-- ═══ 4. RLS, grants e a guarda do só leitura nas 12 ═══════════════════════════════════════════════════════════════════════
do $rls$
declare t text;
begin
  foreach t in array array['folha_acessos', 'folha_funcionarios', 'folha_funcionario_salarios', 'folha_funcionario_atuacao', 'folha_folhas',
                           'folha_documentos', 'folha_pessoas', 'folha_rubricas', 'folha_por_fora', 'folha_guias', 'folha_ferias_periodos',
                           'folha_trilha'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t,
      case t when 'folha_acessos' then 'public.tenant_ok(cliente_id)'
             when 'folha_por_fora' then 'public.folha_por_fora_ok(cliente_id)'
             when 'folha_trilha' then 'public.folha_ok(cliente_id) and (tabela <> ''folha_por_fora'' or public.folha_por_fora_ok(cliente_id))'
             else 'public.folha_ok(cliente_id)' end);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger trg_leitura_nao_grava before insert or update or delete on public.%I for each statement '
                   'execute function public._fn_leitura_nao_grava()', t);
  end loop;
end $rls$;

-- ═══ 5. auxiliares (fechadas) ═════════════════════════════════════════════════════════════════════════════════════════════
create function public._fn_folha_exigir(p_cliente uuid) returns void language plpgsql stable set search_path = public as $$
begin
  if p_cliente is null or not public.folha_ok(p_cliente) then
    raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501';
  end if;
end $$;

create function public._fn_folha_trilha(p_cliente uuid, p_tabela text, p_id uuid, p_acao text, p_antes jsonb, p_depois jsonb, p_motivo text)
returns void language sql set search_path = public as $$
  insert into public.folha_trilha (cliente_id, tabela, registro_id, acao, antes, depois, motivo, usuario_id, via)
  values (p_cliente, p_tabela, p_id, p_acao, p_antes, p_depois, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid(),
          coalesce(nullif(current_setting('app.via', true), ''), 'tela'))
$$;

create function public._fn_folha_funcionario(p_id uuid) returns public.folha_funcionarios
language plpgsql stable set search_path = public as $$
declare f public.folha_funcionarios;
begin
  select * into f from public.folha_funcionarios where id = p_id;
  if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  perform public._fn_folha_exigir(f.cliente_id);
  return f;
end $$;

create function public._fn_folha_da_folha(p_id uuid, p_para_mudar boolean) returns public.folha_folhas
language plpgsql set search_path = public as $$
declare f public.folha_folhas;
begin
  select * into f from public.folha_folhas where id = p_id for update;
  if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  perform public._fn_folha_exigir(f.cliente_id);
  if p_para_mudar and f.cancelado_em is not null then raise exception 'Esta folha foi cancelada.' using errcode = 'P0001'; end if;
  if p_para_mudar and f.situacao = 'confirmada' then
    raise exception 'A folha de % está confirmada: reabra antes de mudar.', f.competencia using errcode = 'P0001';
  end if;
  return f;
end $$;

revoke all on function public._fn_folha_exigir(uuid) from public, anon, authenticated;
revoke all on function public._fn_folha_trilha(uuid, text, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public._fn_folha_funcionario(uuid) from public, anon, authenticated;
revoke all on function public._fn_folha_da_folha(uuid, boolean) from public, anon, authenticated;

-- ═══ 6. o acesso: só o admin marca ════════════════════════════════════════════════════════════════════════════════════════
create function public.fn_folha_acesso_gravar(p_cliente uuid, p_user uuid, p_nivel text, p_ativo boolean, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_vivo uuid;
begin
  if not public.is_admin_agroinblue(auth.uid()) then raise exception 'Só a AGROinBLUE marca quem vê a folha.' using errcode = '42501'; end if;
  if p_cliente is null or p_user is null or p_ativo is null or p_simular is null or p_nivel not in ('folha', 'folha_por_fora') then
    raise exception 'Folha: pedido inválido.' using errcode = '22023';
  end if;
  if p_ativo and not exists (select 1 from cliente_membros m where m.cliente_id = p_cliente and m.user_id = p_user and m.ativo) then
    raise exception 'Quem vê a folha tem de ser membro ativo deste cliente.' using errcode = '22023';
  end if;
  if p_ativo and p_nivel = 'folha_por_fora'
     and not exists (select 1 from folha_acessos a where a.cliente_id = p_cliente and a.user_id = p_user and a.nivel = 'folha' and a.ativo) then
    raise exception 'O "por fora" só para quem já vê a folha.' using errcode = '22023';
  end if;
  select id into v_vivo from folha_acessos where cliente_id = p_cliente and user_id = p_user and nivel = p_nivel and ativo;
  if p_simular or (v_vivo is not null) = p_ativo then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'mudou', (v_vivo is not null) <> p_ativo);
  end if;
  if p_ativo then
    insert into folha_acessos (cliente_id, user_id, nivel, criado_por) values (p_cliente, p_user, p_nivel, auth.uid()) returning id into v_vivo;
  else
    update folha_acessos set ativo = false, desligado_por = auth.uid(), desligado_em = now() where id = v_vivo;
    if p_nivel = 'folha' then  -- sem a folha, o "por fora" cai junto
      update folha_acessos set ativo = false, desligado_por = auth.uid(), desligado_em = now()
       where cliente_id = p_cliente and user_id = p_user and nivel = 'folha_por_fora' and ativo;
    end if;
  end if;
  perform _fn_folha_trilha(p_cliente, 'folha_acessos', v_vivo, case when p_ativo then 'marcar' else 'desmarcar' end, null,
    jsonb_build_object('user_id', p_user, 'nivel', p_nivel), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'mudou', true);
end $$;

-- ═══ 7. o funcionário ═════════════════════════════════════════════════════════════════════════════════════════════════════
-- p_dados: {id?, nome, cpf, favorecido_id, codigo_contador, cargo, cbo, vinculo, empregador_registro, admissao, a_atualizar[],
--           recorrencia_origem_id, observacao}. Sem id = novo (nasce ativo). A situação muda só por desligar/reativar.
create function public.fn_folha_funcionario_gravar(p_cliente uuid, p_dados jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_dados->>'id', '')::uuid;
  v_antes public.folha_funcionarios; v_novo public.folha_funcionarios;
  v_cpf text := nullif(regexp_replace(coalesce(p_dados->>'cpf', ''), '[^0-9]', '', 'g'), '');
  v_fav uuid := nullif(p_dados->>'favorecido_id', '')::uuid;
  v_rec uuid := nullif(p_dados->>'recorrencia_origem_id', '')::uuid;
  v_outro text;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_dados->>'nome', '')), '') is null then raise exception 'Informe o nome do funcionário.' using errcode = 'P0001'; end if;
  if v_cpf is not null and (length(v_cpf) <> 11 or not _fn_cpf_cnpj_valido(v_cpf)) then
    raise exception 'CPF inválido.' using errcode = 'P0001';
  end if;
  if v_cpf is not null then
    select nome into v_outro from folha_funcionarios where cliente_id = p_cliente and cpf = v_cpf and id is distinct from v_id;
    if found then raise exception 'Este CPF já é de %, neste cliente.', v_outro using errcode = 'P0001'; end if;
  end if;
  if v_fav is not null and not exists (select 1 from financeiro_fornecedores where id = v_fav and cliente_id = p_cliente) then
    raise exception 'O favorecido não é deste cliente.' using errcode = '42501';
  end if;
  if v_rec is not null and not exists (select 1 from financeiro_recorrencias where id = v_rec and cliente_id = p_cliente) then
    raise exception 'A recorrência não é deste cliente.' using errcode = '42501';
  end if;
  if v_id is not null then
    select * into v_antes from folha_funcionarios where id = v_id and cliente_id = p_cliente for update;
    if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  end if;
  v_novo := v_antes;
  v_novo.id := coalesce(v_id, gen_random_uuid());
  v_novo.cliente_id := p_cliente;
  v_novo.nome := btrim(p_dados->>'nome');
  v_novo.cpf := v_cpf;
  v_novo.favorecido_id := v_fav;
  v_novo.codigo_contador := nullif(btrim(coalesce(p_dados->>'codigo_contador', '')), '');
  v_novo.cargo := nullif(btrim(coalesce(p_dados->>'cargo', '')), '');
  v_novo.cbo := nullif(btrim(coalesce(p_dados->>'cbo', '')), '');
  v_novo.vinculo := coalesce(nullif(p_dados->>'vinculo', ''), 'clt');
  v_novo.empregador_registro := nullif(btrim(coalesce(p_dados->>'empregador_registro', '')), '');
  v_novo.admissao := nullif(p_dados->>'admissao', '')::date;
  v_novo.a_atualizar := coalesce(array(select jsonb_array_elements_text(p_dados->'a_atualizar')), '{}');
  v_novo.recorrencia_origem_id := v_rec;
  v_novo.observacao := nullif(btrim(coalesce(p_dados->>'observacao', '')), '');
  if v_id is null then v_novo.situacao := 'ativo'; v_novo.criado_por := auth.uid(); v_novo.criado_em := now(); end if;
  v_novo.atualizado_por := auth.uid(); v_novo.atualizado_em := now();
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'novo', v_id is null, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(v_novo));
  end if;
  if v_id is null then
    insert into folha_funcionarios select v_novo.*;
  else
    update folha_funcionarios set nome = v_novo.nome, cpf = v_novo.cpf, favorecido_id = v_novo.favorecido_id,
      codigo_contador = v_novo.codigo_contador, cargo = v_novo.cargo, cbo = v_novo.cbo, vinculo = v_novo.vinculo,
      empregador_registro = v_novo.empregador_registro, admissao = v_novo.admissao, a_atualizar = v_novo.a_atualizar,
      recorrencia_origem_id = v_novo.recorrencia_origem_id, observacao = v_novo.observacao,
      atualizado_por = v_novo.atualizado_por, atualizado_em = v_novo.atualizado_em
     where id = v_id;
  end if;
  perform _fn_folha_trilha(p_cliente, 'folha_funcionarios', v_novo.id, case when v_id is null then 'criar' else 'editar' end,
    to_jsonb(v_antes), to_jsonb(v_novo), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'novo', v_id is null, 'id', v_novo.id);
end $$;

create function public.fn_folha_funcionario_desligar(p_funcionario uuid, p_data date, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.folha_funcionarios := _fn_folha_funcionario(p_funcionario);
begin
  if p_data is null or p_simular is null then raise exception 'Informe a data do desligamento.' using errcode = 'P0001'; end if;
  if f.situacao = 'desligado' then raise exception '% já está desligado (desde %).', f.nome, to_char(f.desligamento, 'DD/MM/YYYY') using errcode = 'P0001'; end if;
  if f.admissao is not null and p_data < f.admissao then raise exception 'O desligamento é antes da admissão.' using errcode = 'P0001'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'nome', f.nome, 'desligamento', p_data); end if;
  update folha_funcionarios set situacao = 'desligado', desligamento = p_data, desligamento_motivo = nullif(btrim(coalesce(p_motivo, '')), ''),
         atualizado_por = auth.uid(), atualizado_em = now() where id = f.id;
  perform _fn_folha_trilha(f.cliente_id, 'folha_funcionarios', f.id, 'desligar', jsonb_build_object('situacao', f.situacao),
    jsonb_build_object('situacao', 'desligado', 'desligamento', p_data), p_motivo);
  return jsonb_build_object('ok', true, 'simulado', false);
end $$;

-- o desfazer do desligar
create function public.fn_folha_funcionario_reativar(p_funcionario uuid, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.folha_funcionarios := _fn_folha_funcionario(p_funcionario);
begin
  if p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if f.situacao <> 'desligado' then raise exception '% não está desligado.', f.nome using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'nome', f.nome); end if;
  update folha_funcionarios set situacao = 'ativo', desligamento = null, desligamento_motivo = null,
         atualizado_por = auth.uid(), atualizado_em = now() where id = f.id;
  perform _fn_folha_trilha(f.cliente_id, 'folha_funcionarios', f.id, 'reativar',
    jsonb_build_object('situacao', 'desligado', 'desligamento', f.desligamento, 'motivo', f.desligamento_motivo),
    jsonb_build_object('situacao', 'ativo'), p_motivo);
  return jsonb_build_object('ok', true, 'simulado', false);
end $$;

-- salário "desde": grava ou troca o da mesma data; p_salario nulo = remove aquele "desde" (o antes fica na trilha)
create function public.fn_folha_salario_gravar(p_funcionario uuid, p_desde date, p_salario numeric, p_parte_pct numeric, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.folha_funcionarios := _fn_folha_funcionario(p_funcionario); v_antes public.folha_funcionario_salarios; v_id uuid;
begin
  if p_desde is null or p_simular is null then raise exception 'Informe desde quando vale o salário.' using errcode = 'P0001'; end if;
  if p_salario is not null and p_salario < 0 then raise exception 'Salário não pode ser negativo.' using errcode = 'P0001'; end if;
  if coalesce(p_parte_pct, 100) <= 0 or coalesce(p_parte_pct, 100) > 100 then raise exception 'A parte deste cliente vai de 0 a 100%%.' using errcode = 'P0001'; end if;
  select * into v_antes from folha_funcionario_salarios where funcionario_id = f.id and desde = p_desde for update;
  if p_salario is null and v_antes.id is null then raise exception 'Não há salário desde % para remover.', to_char(p_desde, 'DD/MM/YYYY') using errcode = 'P0001'; end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'antes', to_jsonb(v_antes),
      'depois', case when p_salario is null then null else jsonb_build_object('desde', p_desde, 'salario', round(p_salario, 2), 'parte_pct', coalesce(p_parte_pct, 100)) end);
  end if;
  if p_salario is null then
    delete from folha_funcionario_salarios where id = v_antes.id;
    v_id := v_antes.id;
  else
    insert into folha_funcionario_salarios (cliente_id, funcionario_id, desde, salario, parte_pct, motivo, criado_por)
    values (f.cliente_id, f.id, p_desde, round(p_salario, 2), coalesce(p_parte_pct, 100), nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid())
    on conflict (funcionario_id, desde) do update set salario = excluded.salario, parte_pct = excluded.parte_pct, motivo = excluded.motivo,
      criado_por = excluded.criado_por, criado_em = now()
    returning id into v_id;
  end if;
  perform _fn_folha_trilha(f.cliente_id, 'folha_funcionario_salarios', v_id, case when p_salario is null then 'remover' else 'gravar' end,
    to_jsonb(v_antes), case when p_salario is null then null else jsonb_build_object('desde', p_desde, 'salario', round(p_salario, 2), 'parte_pct', coalesce(p_parte_pct, 100)) end,
    p_motivo);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id);
end $$;

-- atuação "desde": troca o conjunto inteiro daquela data; soma = 100. p_itens [] = remove aquele "desde".
create function public.fn_folha_atuacao_gravar(p_funcionario uuid, p_desde date, p_itens jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.folha_funcionarios := _fn_folha_funcionario(p_funcionario); v_antes jsonb; v_soma numeric; v_n int;
begin
  if p_desde is null or p_simular is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  select count(*), coalesce(sum((i->>'pct')::numeric), 0) into v_n, v_soma from jsonb_array_elements(p_itens) i;
  if v_n > 0 and v_soma <> 100 then raise exception 'A atuação soma % (tem de dar 100%%).', v_soma using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) i where coalesce((i->>'pct')::numeric, 0) <= 0
                or i->>'atividade' not in ('pecuaria', 'agricultura', 'silvicultura', 'administrativo')
                or not exists (select 1 from fazendas z where z.id = nullif(i->>'fazenda_id', '')::uuid and z.cliente_id = f.cliente_id)) then
    raise exception 'Cada linha da atuação precisa de fazenda deste cliente, atividade e %%.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fazenda_id', fazenda_id, 'atividade', atividade, 'pct', pct) order by fazenda_id, atividade), '[]')
    into v_antes from folha_funcionario_atuacao where funcionario_id = f.id and desde = p_desde;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'antes', v_antes, 'depois', p_itens); end if;
  delete from folha_funcionario_atuacao where funcionario_id = f.id and desde = p_desde;
  insert into folha_funcionario_atuacao (cliente_id, funcionario_id, desde, fazenda_id, atividade, pct, criado_por)
  select f.cliente_id, f.id, p_desde, (i->>'fazenda_id')::uuid, i->>'atividade', round((i->>'pct')::numeric, 2), auth.uid()
    from jsonb_array_elements(p_itens) i;
  perform _fn_folha_trilha(f.cliente_id, 'folha_funcionario_atuacao', f.id, 'gravar', jsonb_build_object('desde', p_desde, 'itens', v_antes),
    jsonb_build_object('desde', p_desde, 'itens', p_itens), null);
  return jsonb_build_object('ok', true, 'simulado', false);
end $$;

-- ═══ 8. a folha do mês ════════════════════════════════════════════════════════════════════════════════════════════════════
-- a folha PREVISTA nasce do cadastro: cada ativo no mês com salário vigente → bruto = salário × parte deste cliente.
-- Já existe prevista: refaz só as linhas 'prevista' (as do documento/à mão ficam). Conferida/confirmada: recusa.
create function public.fn_folha_prever(p_cliente uuid, p_competencia text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ini date; v_fim date; v_folha public.folha_folhas; v_previstas jsonb; v_sem_salario jsonb; v_n int;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_simular is null or p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Folha: competência inválida.' using errcode = '22023'; end if;
  v_ini := (p_competencia || '-01')::date; v_fim := (v_ini + interval '1 month - 1 day')::date;
  select * into v_folha from folha_folhas where cliente_id = p_cliente and competencia = p_competencia and tipo = 'mensal' and cancelado_em is null for update;
  if found and v_folha.situacao <> 'prevista' then
    raise exception 'A folha de % já está %: a prevista não se refaz.', p_competencia, v_folha.situacao using errcode = 'P0001';
  end if;
  with ativos as (
    select f.id, f.nome,
           (select s.salario * s.parte_pct / 100 from folha_funcionario_salarios s where s.funcionario_id = f.id and s.desde <= v_fim order by s.desde desc limit 1) bruto
      from folha_funcionarios f
     where f.cliente_id = p_cliente and (f.situacao <> 'desligado' or f.desligamento >= v_ini)
  ), aptos as (
    select a.* from ativos a join folha_funcionarios f on f.id = a.id where f.admissao is null or f.admissao <= v_fim
  )
  select coalesce(jsonb_agg(jsonb_build_object('funcionario_id', id, 'nome', nome, 'bruto', round(bruto, 2)) order by nome) filter (where bruto is not null), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('funcionario_id', id, 'nome', nome) order by nome) filter (where bruto is null), '[]')
    into v_previstas, v_sem_salario from aptos;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'folha_existe', v_folha.id is not null, 'previstas', v_previstas, 'sem_salario', v_sem_salario);
  end if;
  if v_folha.id is null then
    insert into folha_folhas (cliente_id, competencia, tipo, criado_por, atualizado_por) values (p_cliente, p_competencia, 'mensal', auth.uid(), auth.uid())
    returning * into v_folha;
    perform _fn_folha_trilha(p_cliente, 'folha_folhas', v_folha.id, 'criar', null, jsonb_build_object('competencia', p_competencia, 'tipo', 'mensal'), null);
  end if;
  delete from folha_pessoas where folha_id = v_folha.id and origem = 'prevista';
  insert into folha_pessoas (cliente_id, folha_id, funcionario_id, bruto, descontos, liquido, origem, atualizado_por)
  select p_cliente, v_folha.id, (x->>'funcionario_id')::uuid, (x->>'bruto')::numeric, 0, (x->>'bruto')::numeric, 'prevista', auth.uid()
    from jsonb_array_elements(v_previstas) x
   where not exists (select 1 from folha_pessoas p where p.folha_id = v_folha.id and p.funcionario_id = (x->>'funcionario_id')::uuid);
  get diagnostics v_n = row_count;
  perform _fn_folha_trilha(p_cliente, 'folha_folhas', v_folha.id, 'prever', null, jsonb_build_object('pessoas_previstas', v_n), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'folha_id', v_folha.id, 'pessoas_previstas', v_n, 'sem_salario', v_sem_salario);
end $$;

-- folhas avulsas (13º 1ª/2ª, férias, rescisão, adiantamento) — nascem vazias; as pessoas entram pelo documento
create function public.fn_folha_criar(p_cliente uuid, p_competencia text, p_tipo text, p_funcionario uuid, p_data_pagamento date, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_simular is null or p_competencia !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_tipo not in ('mensal', '13_1', '13_2', 'ferias', 'rescisao', 'adiantamento') then
    raise exception 'Folha: pedido inválido.' using errcode = '22023';
  end if;
  if p_tipo in ('ferias', 'rescisao') and p_funcionario is null then raise exception 'Férias e rescisão são de um funcionário: escolha quem.' using errcode = 'P0001'; end if;
  if p_funcionario is not null and not exists (select 1 from folha_funcionarios where id = p_funcionario and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if p_tipo in ('mensal', '13_1', '13_2') and exists (select 1 from folha_folhas where cliente_id = p_cliente and competencia = p_competencia and tipo = p_tipo and cancelado_em is null) then
    raise exception 'Já existe a folha % de %.', p_tipo, p_competencia using errcode = 'P0001';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true); end if;
  insert into folha_folhas (cliente_id, competencia, tipo, funcionario_id, data_pagamento, criado_por, atualizado_por)
  values (p_cliente, p_competencia, p_tipo, p_funcionario, p_data_pagamento, auth.uid(), auth.uid()) returning id into v_id;
  perform _fn_folha_trilha(p_cliente, 'folha_folhas', v_id, 'criar', null,
    jsonb_build_object('competencia', p_competencia, 'tipo', p_tipo, 'funcionario_id', p_funcionario), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'folha_id', v_id);
end $$;

-- grava as pessoas lidas do documento (ou à mão). CONFERÊNCIA (barra, com a frase da pessoa): líquido = bruto − descontos; com
-- rubricas, proventos = bruto e descontos = descontos. Devolve a diferença com o que havia e quem está ATIVO no cadastro e não veio
-- (o "quem saiu?" do PR C). Com documento e sem linha 'prevista' sobrando, a folha passa a 'conferida'.
create function public.fn_folha_pessoas_gravar(p_folha uuid, p_itens jsonb, p_origem text, p_documento uuid, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fo public.folha_folhas := _fn_folha_da_folha(p_folha, true);
  i jsonb; v_nome text; v_bruto numeric; v_desc numeric; v_liq numeric; v_pp numeric; v_pd numeric; v_antes numeric; v_pid uuid;
  v_dif jsonb := '[]'; v_ausentes jsonb; v_situacao text;
begin
  if p_simular is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or p_origem not in ('documento', 'manual') then
    raise exception 'Folha: pedido inválido.' using errcode = '22023';
  end if;
  if p_origem = 'documento' and (p_documento is null or not exists (select 1 from folha_documentos d where d.id = p_documento and d.cliente_id = fo.cliente_id and d.cancelado_em is null)) then
    raise exception 'Grave o documento antes das pessoas lidas dele.' using errcode = 'P0001';
  end if;
  for i in select * from jsonb_array_elements(p_itens) loop
    select nome into v_nome from folha_funcionarios where id = nullif(i->>'funcionario_id', '')::uuid and cliente_id = fo.cliente_id;
    if not found then raise exception 'Funcionário sem cadastro neste cliente: crie o cadastro antes.' using errcode = 'P0001'; end if;
    v_bruto := round((i->>'bruto')::numeric, 2); v_desc := round(coalesce((i->>'descontos')::numeric, 0), 2); v_liq := round((i->>'liquido')::numeric, 2);
    if v_bruto is null or v_liq is null or v_liq <> v_bruto - v_desc then
      raise exception '%: o líquido (%) não fecha com bruto − descontos (% − % = %).', v_nome, v_liq, v_bruto, v_desc, v_bruto - v_desc using errcode = 'P0001';
    end if;
    if jsonb_array_length(coalesce(i->'rubricas', '[]')) > 0 then
      select coalesce(sum(round((rr.value->>'valor')::numeric, 2)) filter (where rr.value->>'natureza' = 'provento'), 0),
             coalesce(sum(round((rr.value->>'valor')::numeric, 2)) filter (where rr.value->>'natureza' = 'desconto'), 0)
        into v_pp, v_pd from jsonb_array_elements(i->'rubricas') rr;
      if v_pp <> v_bruto or v_pd <> v_desc then
        raise exception '%: as rubricas somam % de proventos e % de descontos; o recibo diz % e %.', v_nome, v_pp, v_pd, v_bruto, v_desc using errcode = 'P0001';
      end if;
    end if;
    select liquido into v_antes from folha_pessoas where folha_id = fo.id and funcionario_id = (i->>'funcionario_id')::uuid;
    if v_antes is distinct from v_liq then
      v_dif := v_dif || jsonb_build_object('funcionario_id', i->>'funcionario_id', 'nome', v_nome, 'antes', v_antes, 'depois', v_liq);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('funcionario_id', f.id, 'nome', f.nome) order by f.nome), '[]') into v_ausentes
    from folha_funcionarios f
   where f.cliente_id = fo.cliente_id and f.situacao <> 'desligado' and f.vinculo = 'clt'
     and not exists (select 1 from jsonb_array_elements(p_itens) x where (x->>'funcionario_id')::uuid = f.id);
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'diferencas', v_dif, 'ativos_fora_do_documento', v_ausentes);
  end if;
  for i in select * from jsonb_array_elements(p_itens) loop
    insert into folha_pessoas (cliente_id, folha_id, funcionario_id, bruto, descontos, liquido, base_inss, base_fgts, valor_fgts, base_irrf, origem, documento_id, atualizado_por)
    values (fo.cliente_id, fo.id, (i->>'funcionario_id')::uuid, round((i->>'bruto')::numeric, 2), round(coalesce((i->>'descontos')::numeric, 0), 2),
            round((i->>'liquido')::numeric, 2), (i->>'base_inss')::numeric, (i->>'base_fgts')::numeric, (i->>'valor_fgts')::numeric, (i->>'base_irrf')::numeric,
            p_origem, p_documento, auth.uid())
    on conflict (folha_id, funcionario_id) do update set bruto = excluded.bruto, descontos = excluded.descontos, liquido = excluded.liquido,
      base_inss = excluded.base_inss, base_fgts = excluded.base_fgts, valor_fgts = excluded.valor_fgts, base_irrf = excluded.base_irrf,
      origem = excluded.origem, documento_id = excluded.documento_id, atualizado_por = excluded.atualizado_por, atualizado_em = now()
    returning id into v_pid;
    delete from folha_rubricas where folha_pessoa_id = v_pid;
    insert into folha_rubricas (cliente_id, folha_pessoa_id, ordem, codigo, descricao, natureza, referencia, valor)
    select fo.cliente_id, v_pid, rb.ord::int, nullif(rb.v->>'codigo', ''), btrim(rb.v->>'descricao'), rb.v->>'natureza', (rb.v->>'referencia')::numeric, round((rb.v->>'valor')::numeric, 2)
      from jsonb_array_elements(coalesce(i->'rubricas', '[]')) with ordinality rb(v, ord);
  end loop;
  v_situacao := case when p_origem = 'documento' and not exists (select 1 from folha_pessoas where folha_id = fo.id and origem = 'prevista')
                     then 'conferida' else fo.situacao end;
  update folha_folhas set situacao = v_situacao, atualizado_por = auth.uid(), atualizado_em = now() where id = fo.id;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_folhas', fo.id, 'pessoas', jsonb_build_object('situacao', fo.situacao),
    jsonb_build_object('situacao', v_situacao, 'origem', p_origem, 'documento_id', p_documento, 'pessoas', jsonb_array_length(p_itens), 'diferencas', v_dif), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'situacao', v_situacao, 'diferencas', v_dif, 'ativos_fora_do_documento', v_ausentes);
end $$;

create function public.fn_folha_pessoa_remover(p_folha uuid, p_funcionario uuid, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fo public.folha_folhas := _fn_folha_da_folha(p_folha, true); p public.folha_pessoas; v_rub jsonb;
begin
  if p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  select * into p from folha_pessoas where folha_id = fo.id and funcionario_id = p_funcionario;
  if not found then raise exception 'Esta pessoa não está nesta folha.' using errcode = 'P0001'; end if;
  if p.lancamento_id is not null then raise exception 'Esta linha já gerou lançamento: desfaça o lançamento antes.' using errcode = 'P0001'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'linha', to_jsonb(p)); end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.ordem), '[]') into v_rub from folha_rubricas r where r.folha_pessoa_id = p.id;
  delete from folha_pessoas where id = p.id;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_pessoas', p.id, 'remover', to_jsonb(p) || jsonb_build_object('rubricas', v_rub), null, p_motivo);
  return jsonb_build_object('ok', true, 'simulado', false);
end $$;

create function public.fn_folha_confirmar(p_folha uuid, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fo public.folha_folhas := _fn_folha_da_folha(p_folha, true); v_n int; v_prev int; v_liq numeric;
begin
  if p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  select count(*), count(*) filter (where origem = 'prevista'), coalesce(sum(liquido), 0) into v_n, v_prev, v_liq from folha_pessoas where folha_id = fo.id;
  if v_n = 0 then raise exception 'A folha de % está vazia.', fo.competencia using errcode = 'P0001'; end if;
  if v_prev > 0 then
    raise exception 'Ainda há % pessoa(s) só com o previsto: confira com o documento do contador (ou lance à mão) antes de confirmar.', v_prev using errcode = 'P0001';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'pessoas', v_n, 'liquido', v_liq); end if;
  update folha_folhas set situacao = 'confirmada', confirmada_por = auth.uid(), confirmada_em = now(), atualizado_por = auth.uid(), atualizado_em = now() where id = fo.id;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_folhas', fo.id, 'confirmar', jsonb_build_object('situacao', fo.situacao),
    jsonb_build_object('situacao', 'confirmada', 'pessoas', v_n, 'liquido', v_liq), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'pessoas', v_n, 'liquido', v_liq);
end $$;

-- o desfazer do confirmar
create function public.fn_folha_reabrir(p_folha uuid, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fo public.folha_folhas := _fn_folha_da_folha(p_folha, false); v_volta text;
begin
  if p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if fo.situacao <> 'confirmada' or fo.cancelado_em is not null then raise exception 'Só se reabre folha confirmada.' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  if exists (select 1 from folha_pessoas where folha_id = fo.id and lancamento_id is not null)
     or exists (select 1 from folha_guias where folha_id = fo.id and lancamento_id is not null and cancelado_em is null)
     or exists (select 1 from folha_por_fora where folha_id = fo.id and lancamento_id is not null and cancelado_em is null) then
    raise exception 'A folha já gerou lançamentos: desfaça os lançamentos antes de reabrir.' using errcode = 'P0001';
  end if;
  v_volta := case when exists (select 1 from folha_pessoas where folha_id = fo.id and origem = 'documento') then 'conferida' else 'prevista' end;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'volta_para', v_volta); end if;
  update folha_folhas set situacao = v_volta, confirmada_por = null, confirmada_em = null, atualizado_por = auth.uid(), atualizado_em = now() where id = fo.id;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_folhas', fo.id, 'reabrir', jsonb_build_object('situacao', 'confirmada', 'confirmada_por', fo.confirmada_por),
    jsonb_build_object('situacao', v_volta), p_motivo);
  return jsonb_build_object('ok', true, 'simulado', false, 'situacao', v_volta);
end $$;

create function public.fn_folha_cancelar(p_folha uuid, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fo public.folha_folhas := _fn_folha_da_folha(p_folha, true);
begin
  if p_simular is null then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'pessoas', (select count(*) from folha_pessoas where folha_id = fo.id)); end if;
  update folha_folhas set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo) where id = fo.id;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_folhas', fo.id, 'cancelar', jsonb_build_object('situacao', fo.situacao), null, p_motivo);
  return jsonb_build_object('ok', true, 'simulado', false);
end $$;

-- ═══ 9. guias, por fora, férias ═══════════════════════════════════════════════════════════════════════════════════════════
-- p_dados: {id?, tipo, competencia, vencimento, valor, numero_documento, composicao[{codigo, descricao, valor}], documento_id}
-- com composição, a soma das partes = valor da guia
create function public.fn_folha_guia_gravar(p_folha uuid, p_dados jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fo public.folha_folhas := _fn_folha_da_folha(p_folha, true);
  v_id uuid := nullif(p_dados->>'id', '')::uuid; v_antes public.folha_guias; v_valor numeric := round((p_dados->>'valor')::numeric, 2);
  v_comp jsonb := coalesce(p_dados->'composicao', '[]'); v_soma numeric; v_doc uuid := nullif(p_dados->>'documento_id', '')::uuid;
begin
  if p_simular is null or p_dados->>'tipo' not in ('inss_darf', 'fgts_gfd', 'irrf', 'sindical', 'outro') or v_valor is null or v_valor <= 0
     or nullif(p_dados->>'vencimento', '') is null or coalesce(p_dados->>'competencia', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(v_comp) <> 'array' then
    raise exception 'Guia: informe tipo, competência, vencimento e valor.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_comp) > 0 then
    select coalesce(sum(round((c->>'valor')::numeric, 2)), 0) into v_soma from jsonb_array_elements(v_comp) c;
    if v_soma <> v_valor then raise exception 'A composição da guia soma % e o total é %.', v_soma, v_valor using errcode = 'P0001'; end if;
  end if;
  if v_doc is not null and not exists (select 1 from folha_documentos where id = v_doc and cliente_id = fo.cliente_id) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if v_id is not null then
    select * into v_antes from folha_guias where id = v_id and folha_id = fo.id and cancelado_em is null for update;
    if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
    if v_antes.lancamento_id is not null then raise exception 'Esta guia já gerou lançamento: desfaça o lançamento antes.' using errcode = 'P0001'; end if;
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'antes', to_jsonb(v_antes)); end if;
  if v_id is null then
    insert into folha_guias (cliente_id, folha_id, tipo, competencia, vencimento, valor, numero_documento, composicao, documento_id, criado_por)
    values (fo.cliente_id, fo.id, p_dados->>'tipo', p_dados->>'competencia', (p_dados->>'vencimento')::date, v_valor, nullif(btrim(coalesce(p_dados->>'numero_documento', '')), ''),
            v_comp, v_doc, auth.uid()) returning id into v_id;
  else
    update folha_guias set tipo = p_dados->>'tipo', competencia = p_dados->>'competencia', vencimento = (p_dados->>'vencimento')::date, valor = v_valor,
           numero_documento = nullif(btrim(coalesce(p_dados->>'numero_documento', '')), ''), composicao = v_comp, documento_id = v_doc where id = v_id;
  end if;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_guias', v_id, case when v_antes.id is null then 'criar' else 'editar' end, to_jsonb(v_antes), p_dados, null);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id);
end $$;

create function public.fn_folha_guia_cancelar(p_guia uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.folha_guias; fo public.folha_folhas;
begin
  select * into g from folha_guias where id = p_guia;
  if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  fo := _fn_folha_da_folha(g.folha_id, true);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  if g.lancamento_id is not null then raise exception 'Esta guia já gerou lançamento: desfaça o lançamento antes.' using errcode = 'P0001'; end if;
  update folha_guias set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo) where id = g.id and cancelado_em is null;
  if not found then raise exception 'Esta guia já foi cancelada.' using errcode = 'P0001'; end if;
  perform _fn_folha_trilha(g.cliente_id, 'folha_guias', g.id, 'cancelar', to_jsonb(g), null, p_motivo);
  return jsonb_build_object('ok', true);
end $$;

create function public.fn_folha_por_fora_gravar(p_folha uuid, p_funcionario uuid, p_descricao text, p_valor numeric, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare fo public.folha_folhas := _fn_folha_da_folha(p_folha, true); v_id uuid;
begin
  if not folha_por_fora_ok(fo.cliente_id) then raise exception 'Sem acesso ao "por fora" deste cliente.' using errcode = '42501'; end if;
  if p_simular is null or nullif(btrim(coalesce(p_descricao, '')), '') is null or coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe a descrição e o valor.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from folha_funcionarios where id = p_funcionario and cliente_id = fo.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true); end if;
  insert into folha_por_fora (cliente_id, folha_id, funcionario_id, descricao, valor, criado_por)
  values (fo.cliente_id, fo.id, p_funcionario, btrim(p_descricao), round(p_valor, 2), auth.uid()) returning id into v_id;
  perform _fn_folha_trilha(fo.cliente_id, 'folha_por_fora', v_id, 'criar', null,
    jsonb_build_object('funcionario_id', p_funcionario, 'descricao', btrim(p_descricao), 'valor', round(p_valor, 2)), null);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id);
end $$;

create function public.fn_folha_por_fora_cancelar(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x public.folha_por_fora; fo public.folha_folhas;
begin
  select * into x from folha_por_fora where id = p_id;
  if not found or not folha_por_fora_ok(x.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  fo := _fn_folha_da_folha(x.folha_id, true);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  if x.lancamento_id is not null then raise exception 'Já gerou lançamento: desfaça o lançamento antes.' using errcode = 'P0001'; end if;
  update folha_por_fora set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo) where id = x.id and cancelado_em is null;
  if not found then raise exception 'Já foi cancelado.' using errcode = 'P0001'; end if;
  perform _fn_folha_trilha(x.cliente_id, 'folha_por_fora', x.id, 'cancelar', to_jsonb(x), null, p_motivo);
  return jsonb_build_object('ok', true);
end $$;

-- a escala do contador: um período aquisitivo por linha; o mesmo início atualiza
create function public.fn_folha_ferias_gravar(p_funcionario uuid, p_itens jsonb, p_documento uuid, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.folha_funcionarios := _fn_folha_funcionario(p_funcionario); v_antes jsonb; v_n int;
begin
  if p_simular is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) i where nullif(i->>'aquisitivo_inicio', '') is null or nullif(i->>'aquisitivo_fim', '') is null
               or (i->>'aquisitivo_fim')::date <= (i->>'aquisitivo_inicio')::date) then
    raise exception 'Cada período de férias precisa de início e fim do período aquisitivo.' using errcode = 'P0001';
  end if;
  if p_documento is not null and not exists (select 1 from folha_documentos where id = p_documento and cliente_id = f.cliente_id) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.aquisitivo_inicio), '[]') into v_antes from folha_ferias_periodos x where x.funcionario_id = f.id;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'antes', v_antes, 'depois', p_itens); end if;
  insert into folha_ferias_periodos (cliente_id, funcionario_id, aquisitivo_inicio, aquisitivo_fim, vencimento, ultimo_prazo, dias_pagos, saldo_dias, faltas,
                                     documento_id, lido_em, atualizado_por)
  select f.cliente_id, f.id, (i->>'aquisitivo_inicio')::date, (i->>'aquisitivo_fim')::date, nullif(i->>'vencimento', '')::date, nullif(i->>'ultimo_prazo', '')::date,
         coalesce((i->>'dias_pagos')::numeric, 0), coalesce((i->>'saldo_dias')::numeric, 0), coalesce((i->>'faltas')::int, 0),
         p_documento, case when p_documento is not null then now() end, auth.uid()
    from jsonb_array_elements(p_itens) i
  on conflict (funcionario_id, aquisitivo_inicio) do update set aquisitivo_fim = excluded.aquisitivo_fim, vencimento = excluded.vencimento,
    ultimo_prazo = excluded.ultimo_prazo, dias_pagos = excluded.dias_pagos, saldo_dias = excluded.saldo_dias, faltas = excluded.faltas,
    documento_id = excluded.documento_id, lido_em = excluded.lido_em, atualizado_por = excluded.atualizado_por, atualizado_em = now();
  get diagnostics v_n = row_count;
  perform _fn_folha_trilha(f.cliente_id, 'folha_ferias_periodos', f.id, 'gravar', v_antes, p_itens, null);
  return jsonb_build_object('ok', true, 'simulado', false, 'periodos', v_n);
end $$;

-- ═══ 10. documentos (o molde do Patrimônio: registra → devolve o caminho → a tela sobe o arquivo) ═══════════════════════
create function public.fn_folha_documento_registrar(p_cliente uuid, p_folha uuid, p_funcionario uuid, p_especie text, p_nome text, p_extensao text,
                                                    p_tipo text, p_tamanho bigint, p_md5 text, p_entrada uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_ext text; v_path text; v_comp text; v_ja text;
begin
  perform _fn_folha_exigir(p_cliente);
  if p_especie is null or p_especie not in ('holerite', 'recibo_13', 'guia_inss', 'guia_fgts', 'escala_ferias', 'recibo_ferias', 'rescisao', 'contrato', 'ctps', 'aso', 'outro') then
    raise exception 'Escolha a espécie do documento.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then raise exception 'Documento sem nome.' using errcode = 'P0001'; end if;
  if p_folha is null and p_funcionario is null then raise exception 'O documento é da folha ou de um funcionário.' using errcode = 'P0001'; end if;
  if p_folha is not null then
    select competencia into v_comp from folha_folhas where id = p_folha and cliente_id = p_cliente;
    if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  end if;
  if p_funcionario is not null and not exists (select 1 from folha_funcionarios where id = p_funcionario and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if p_entrada is not null and not exists (select 1 from entrada_arquivos where id = p_entrada and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if p_md5 is not null then
    select nome into v_ja from folha_documentos where cliente_id = p_cliente and md5 = lower(p_md5) and cancelado_em is null;
    if found then raise exception 'Este arquivo já está na folha (%).', v_ja using errcode = 'P0001'; end if;
  end if;
  v_ext := lower(regexp_replace(coalesce(p_extensao, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_ext = '' then v_ext := 'bin'; end if;
  v_path := p_cliente::text || '/folha/' || case when p_folha is not null then v_comp || '/' else 'funcionarios/' || p_funcionario::text || '/' end
            || v_id::text || '.' || v_ext;
  insert into folha_documentos (id, cliente_id, folha_id, funcionario_id, especie, nome, storage_path, tipo, tamanho_bytes, md5, entrada_arquivo_id, enviado_por)
  values (v_id, p_cliente, p_folha, p_funcionario, p_especie, btrim(p_nome), v_path, p_tipo, p_tamanho, lower(p_md5), p_entrada, auth.uid());
  perform _fn_folha_trilha(p_cliente, 'folha_documentos', v_id, 'registrar', null,
    jsonb_build_object('especie', p_especie, 'nome', btrim(p_nome), 'folha_id', p_folha, 'funcionario_id', p_funcionario, 'entrada', p_entrada), null);
  return jsonb_build_object('id', v_id, 'storage_path', v_path);
end $$;

create function public.fn_folha_documento_remover(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.folha_documentos;
begin
  select * into d from folha_documentos where id = p_id;
  if not found then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  perform _fn_folha_exigir(d.cliente_id);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo da remoção.' using errcode = 'P0001'; end if;
  update folha_documentos set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo) where id = p_id and cancelado_em is null;
  if not found then raise exception 'Este documento já foi removido.' using errcode = 'P0001'; end if;
  perform _fn_folha_trilha(d.cliente_id, 'folha_documentos', d.id, 'remover', to_jsonb(d), null, p_motivo);
  return jsonb_build_object('id', p_id, 'removido', true);
end $$;

-- ═══ 11. fechadas: só authenticated (a guarda é a folha_ok de cada uma) e service_role ═══════════════════════════════════
do $g$
declare r record;
begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'fn\_folha\_%' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $g$;
