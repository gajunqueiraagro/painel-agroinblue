-- REBANHO-ORGAO-01 · F1 (banco) — a declaração do rebanho ao órgão estadual (MS: IAGRO / e-Saniagro). Briefing patr-20261123-1342; DX como
-- recomendado (DX3: a CONTA mora em TS puro — `propostaDaDeclaracao` — e o banco só entrega os FATOS e guarda; DX4: o PDF do órgão fica no
-- bucket privado `pec-documentos`, pasta <cliente>/orgao/…, o mesmo da pecuária, com o tenant pela pasta; DX5: declarar CONGELA a proposta
-- e o desfazer pede motivo).
--   orgao_etapas            o calendário por UF (referência GLOBAL: leitura livre, escrita só pelo admin na F4). Seed: MS 2026.
--   rebanho_declaracoes     uma por fazenda × etapa: rascunho → declarada (o saldo e o extrato lidos, o editado por célula, a proposta).
--   rebanho_egtas           o nº da eGTA casado com a movimentação do rebanho (R6). Só o vazio: o nº vivo nunca muda de movimentação.
--   rebanho_orgao_trilha    imutável, autor = quem está logado.
--   fn_rebanho_orgao_fatos  só leitura: os fatos do cliente na janela (desde, até], SÓ o realizado (meta nunca), categoria pelo TEXTO (R3).
--   fn_rebanho_declaracao_gravar / _declarar / _desfazer e fn_egta_gravar_numero: com p_simular (a prévia), trilha, 42501 fora do tenant.
-- Sem dado de cliente (o seed é o calendário público de MS).
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.orgao_etapas') is not null or to_regclass('public.rebanho_declaracoes') is not null
     or to_regclass('public.rebanho_egtas') is not null or to_regclass('public.rebanho_orgao_trilha') is not null then
    raise exception 'REBANHO-ORGAO-01 F1: uma das tabelas já existe: refazer.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'pec-documentos' and not public) then
    raise exception 'REBANHO-ORGAO-01 F1: o bucket privado pec-documentos não existe: refazer.';
  end if;
end $$;

-- ═══ o calendário por UF ═══
create table public.orgao_etapas (
  id              uuid primary key default gen_random_uuid(),
  uf              text not null check (uf ~ '^[A-Z]{2}$'),
  orgao           text not null check (btrim(orgao) <> ''),
  tipo            text not null check (tipo in ('declaracao', 'brucelose')),
  especie         text not null default 'bovinos' check (especie in ('bovinos', 'bubalinos')),
  inicio          date not null,
  fim             date not null,
  prorrogado_ate  date,
  norma           text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  alterado_em     timestamptz not null default now(),
  alterado_por    uuid,
  check (fim >= inicio),
  check (prorrogado_ate is null or prorrogado_ate >= fim),
  unique (uf, tipo, especie, inicio)
);
alter table public.orgao_etapas enable row level security;
create policy orgao_etapas_select on public.orgao_etapas for select to authenticated using (true);
revoke all on public.orgao_etapas from public, anon, authenticated;
grant select on public.orgao_etapas to authenticated;
grant all on public.orgao_etapas to service_role;
-- MS 2026 (FASE 0 de 23/11): maio prorrogada até 02/06; novembro; a vacinação de brucelose do 2º semestre. A norma fica para o admin (F4).
insert into public.orgao_etapas (uf, orgao, tipo, inicio, fim, prorrogado_ate) values
  ('MS', 'IAGRO', 'declaracao', '2026-05-01', '2026-05-31', '2026-06-02'),
  ('MS', 'IAGRO', 'declaracao', '2026-11-01', '2026-11-30', null),
  ('MS', 'IAGRO', 'brucelose',  '2026-07-01', '2026-12-31', null);

-- ═══ a declaração (uma por fazenda × etapa) ═══
create table public.rebanho_declaracoes (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.clientes(id),
  fazenda_id           uuid not null references public.fazendas(id),
  etapa_id             uuid not null references public.orgao_etapas(id),
  status               text not null default 'rascunho' check (status in ('rascunho', 'declarada')),
  saldo                jsonb,
  saldo_arquivo        text,
  extrato              jsonb,
  extrato_arquivo      text,
  editados             jsonb not null default '{}'::jsonb check (jsonb_typeof(editados) = 'object'),
  proposta             jsonb,
  comprovante_arquivo  text,
  declarada_em         timestamptz,
  declarada_por        uuid,
  versao               integer not null default 1,
  criado_em            timestamptz not null default now(),
  criado_por           uuid,
  alterado_em          timestamptz not null default now(),
  alterado_por         uuid,
  unique (fazenda_id, etapa_id),
  check ((status = 'declarada') = (declarada_em is not null)),
  check (status <> 'declarada' or jsonb_typeof(proposta) = 'object')
);
alter table public.rebanho_declaracoes enable row level security;
create policy rebanho_declaracoes_select on public.rebanho_declaracoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.rebanho_declaracoes from public, anon, authenticated;
grant select on public.rebanho_declaracoes to authenticated;
grant all on public.rebanho_declaracoes to service_role;
create trigger trg_leitura_nao_grava before insert or update or delete on public.rebanho_declaracoes
  for each statement execute function public._fn_leitura_nao_grava();

-- ═══ o nº da eGTA na movimentação ═══
create table public.rebanho_egtas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  fazenda_id     uuid not null references public.fazendas(id),
  lancamento_id  uuid not null references public.lancamentos(id),
  numero         text not null check (numero ~ '^[0-9A-Za-z./-]{3,30}$'),
  data           date not null,
  sentido        text not null check (sentido in ('saida', 'entrada')),
  cab            integer not null check (cab > 0),
  cancelado      boolean not null default false,
  criado_em      timestamptz not null default now(),
  criado_por     uuid
);
create unique index ux_rebanho_egtas_vivo on public.rebanho_egtas (cliente_id, numero) where not cancelado;
create index ix_rebanho_egtas_lancamento on public.rebanho_egtas (lancamento_id) where not cancelado;
alter table public.rebanho_egtas enable row level security;
create policy rebanho_egtas_select on public.rebanho_egtas for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.rebanho_egtas from public, anon, authenticated;
grant select on public.rebanho_egtas to authenticated;
grant all on public.rebanho_egtas to service_role;
create trigger trg_leitura_nao_grava before insert or update or delete on public.rebanho_egtas
  for each statement execute function public._fn_leitura_nao_grava();

-- ═══ a trilha (imutável) ═══
create table public.rebanho_orgao_trilha (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id),
  alvo        text not null check (alvo in ('declaracao', 'egta')),
  alvo_id     uuid not null,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  motivo      text,
  por         uuid,
  em          timestamptz not null default now()
);
create index ix_rebanho_orgao_trilha_alvo on public.rebanho_orgao_trilha (alvo_id, em);
alter table public.rebanho_orgao_trilha enable row level security;
create policy rebanho_orgao_trilha_select on public.rebanho_orgao_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.rebanho_orgao_trilha from public, anon, authenticated;
grant select on public.rebanho_orgao_trilha to authenticated;
grant all on public.rebanho_orgao_trilha to service_role;
create trigger trg_trilha_imutavel before update or delete on public.rebanho_orgao_trilha
  for each row execute function public._fn_trilha_imutavel();
create trigger trg_leitura_nao_grava before insert or update or delete on public.rebanho_orgao_trilha
  for each statement execute function public._fn_leitura_nao_grava();

-- ═══ os FATOS (só leitura) ═══
-- SÓ o que aconteceu: cenário realizado E status realizado (o programado/agendado do realizado não entra). A janela é (p_desde, p_ate]:
-- o que aconteceu DEPOIS da última declaração até o fim da etapa. Nascimentos e reclassificações vêm TODOS (até p_ate): a coorte da R2 e
-- a troca de sexo da R3 olham para trás. As movimentações com GTA vêm com ±10 dias (R6). "Rebanho hoje" =
-- o saldo final do cache no último mês até p_ate (o fechamento + o lançado depois, por categoria).
create function public.fn_rebanho_orgao_fatos(p_cliente_id uuid, p_desde date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public set plan_cache_mode = force_custom_plan as $$
declare
  v_mes text := to_char(p_ate, 'YYYY-MM');
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception 'Sem acesso a este cliente.' using errcode = '42501';
  end if;
  if p_desde is null or p_ate is null or p_desde >= p_ate then
    raise exception 'REBANHO-ORGAO: a janela precisa de desde < até.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'cliente_id', p_cliente_id, 'desde', p_desde, 'ate', p_ate,
    'fazendas', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'uf', upper(nullif(btrim(fc.estado), ''))) order by f.nome)
        from fazendas f left join fazenda_cadastros fc on fc.fazenda_id = f.id
       where f.cliente_id = p_cliente_id and coalesce(f.tem_pecuaria, false) and not coalesce(f.eh_administrativa, false)), '[]'::jsonb),
    'nascimentos', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'data', l.data, 'categoria', l.categoria, 'cab', l.quantidade)
                       order by l.data, l.id)
        from lancamentos l
       where l.cliente_id = p_cliente_id and l.tipo = 'nascimento' and l.cenario = 'realizado' and l.status_operacional = 'realizado' and not coalesce(l.cancelado, false)
         and l.data <= p_ate), '[]'::jsonb),
    'reclassificacoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'data', l.data, 'de', l.categoria, 'para', l.categoria_destino,
                       'cab', l.quantidade) order by l.data, l.id)
        from lancamentos l
       where l.cliente_id = p_cliente_id and l.tipo = 'reclassificacao' and l.cenario = 'realizado' and l.status_operacional = 'realizado' and not coalesce(l.cancelado, false)
         and l.data <= p_ate), '[]'::jsonb),
    'mortes_consumo', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'data', l.data, 'tipo', l.tipo, 'categoria', l.categoria,
                       'cab', l.quantidade) order by l.data, l.id)
        from lancamentos l
       where l.cliente_id = p_cliente_id and l.tipo in ('morte', 'consumo') and l.cenario = 'realizado' and l.status_operacional = 'realizado' and not coalesce(l.cancelado, false)
         and l.data > p_desde and l.data <= p_ate), '[]'::jsonb),
    'ajustes', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'data', l.data,
                       'sentido', case l.tipo when 'ajuste_entrada' then 'entrada' else 'saida' end, 'categoria', l.categoria, 'cab', l.quantidade)
                       order by l.data, l.id)
        from lancamentos l
       where l.cliente_id = p_cliente_id and l.tipo in ('ajuste_entrada', 'ajuste_saida') and l.cenario = 'realizado' and l.status_operacional = 'realizado'
         and not coalesce(l.cancelado, false) and l.data > p_desde and l.data <= p_ate), '[]'::jsonb),
    'movimentos', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'fazenda_id', l.fazenda_id, 'tipo', l.tipo, 'data', l.data,
                       'sentido', case when l.tipo in ('compra', 'transferencia_entrada') then 'entrada' else 'saida' end,
                       'categoria', l.categoria, 'cab', l.quantidade,
                       'egtas', coalesce((select jsonb_agg(g.numero order by g.numero) from rebanho_egtas g
                                           where g.lancamento_id = l.id and not g.cancelado), '[]'::jsonb))
                       order by l.data, l.id)
        from lancamentos l
       where l.cliente_id = p_cliente_id and l.tipo in ('venda', 'abate', 'transferencia_saida', 'compra', 'transferencia_entrada')
         and l.cenario = 'realizado' and l.status_operacional = 'realizado' and not coalesce(l.cancelado, false)
         and l.data > p_desde - 10 and l.data <= p_ate + 10), '[]'::jsonb),
    'rebanho_hoje', coalesce((
      select jsonb_agg(jsonb_build_object('fazenda_id', z.fazenda_id, 'ano_mes', z.ano_mes, 'categoria', z.categoria_codigo, 'cab', z.saldo_final)
                       order by z.fazenda_id, z.ordem_exibicao)
        from zoot_mensal_cache z
       where z.cliente_id = p_cliente_id and z.cenario = 'realizado' and coalesce(z.saldo_final, 0) <> 0
         and z.ano_mes = (select max(y.ano_mes) from zoot_mensal_cache y
                           where y.fazenda_id = z.fazenda_id and y.cenario = 'realizado' and y.ano_mes <= v_mes)), '[]'::jsonb)
  );
end $$;
revoke all on function public.fn_rebanho_orgao_fatos(uuid, date, date) from public, anon;
grant execute on function public.fn_rebanho_orgao_fatos(uuid, date, date) to authenticated;

-- ═══ o arquivo do órgão: só na pasta do cliente, no bucket privado da pecuária ═══
create function public._fn_rebanho_orgao_arquivo_ok(p_cliente_id uuid, p_caminho text)
returns boolean language sql immutable set search_path = public as $$
  select p_caminho is null or (p_caminho like p_cliente_id::text || '/orgao/%' and p_caminho !~ '(^|/)\.\.(/|$)')
$$;
revoke all on function public._fn_rebanho_orgao_arquivo_ok(uuid, text) from public, anon, authenticated;

-- ═══ gravar o rascunho (o saldo lido, o extrato lido, o editado) ═══
create function public.fn_rebanho_declaracao_gravar(p_fazenda_id uuid, p_etapa_id uuid, p_campos jsonb, p_versao integer, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid; d rebanho_declaracoes; v_novo rebanho_declaracoes; v_muda text[] := '{}'; k text;
  v_campos constant text[] := array['saldo', 'saldo_arquivo', 'extrato', 'extrato_arquivo', 'editados'];
begin
  select cliente_id into v_cliente from fazendas where id = p_fazenda_id;
  if v_cliente is null or not coalesce(public.tenant_ok(v_cliente), false) then raise exception 'Sem acesso a esta fazenda.' using errcode = '42501'; end if;
  if p_simular is null or p_campos is null or jsonb_typeof(p_campos) <> 'object' then raise exception 'REBANHO-ORGAO: pedido inválido.' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_campos) loop
    if not k = any (v_campos) then raise exception 'REBANHO-ORGAO: campo % não se grava aqui.', k using errcode = '22023'; end if;
  end loop;
  if not exists (select 1 from orgao_etapas where id = p_etapa_id and ativo and tipo = 'declaracao') then
    raise exception 'REBANHO-ORGAO: a etapa não existe ou não é de declaração.' using errcode = '22023';
  end if;
  if p_campos ? 'editados' and jsonb_typeof(p_campos->'editados') <> 'object' then raise exception 'REBANHO-ORGAO: editados é um objeto.' using errcode = '22023'; end if;
  if not public._fn_rebanho_orgao_arquivo_ok(v_cliente, p_campos->>'saldo_arquivo') or not public._fn_rebanho_orgao_arquivo_ok(v_cliente, p_campos->>'extrato_arquivo') then
    raise exception 'REBANHO-ORGAO: o arquivo tem de estar na pasta do cliente (<cliente>/orgao/…).' using errcode = '22023';
  end if;
  select * into d from rebanho_declaracoes where fazenda_id = p_fazenda_id and etapa_id = p_etapa_id for update;
  if found and d.status = 'declarada' then
    raise exception 'Esta declaração já foi marcada como declarada: desfaça com o motivo antes de mudar. Nada foi gravado.' using errcode = 'P0001';
  end if;
  if found and p_versao is distinct from d.versao then
    raise exception 'Outra pessoa mudou esta declaração: abra de novo. Nada foi gravado.' using errcode = '40001';
  end if;
  if not found then
    d := null; d.cliente_id := v_cliente; d.fazenda_id := p_fazenda_id; d.etapa_id := p_etapa_id; d.editados := '{}'::jsonb; d.versao := 0;
  end if;
  v_novo := d;
  if p_campos ? 'saldo' then v_novo.saldo := p_campos->'saldo'; end if;
  if p_campos ? 'saldo_arquivo' then v_novo.saldo_arquivo := p_campos->>'saldo_arquivo'; end if;
  if p_campos ? 'extrato' then v_novo.extrato := p_campos->'extrato'; end if;
  if p_campos ? 'extrato_arquivo' then v_novo.extrato_arquivo := p_campos->>'extrato_arquivo'; end if;
  if p_campos ? 'editados' then v_novo.editados := p_campos->'editados'; end if;
  foreach k in array v_campos loop
    if to_jsonb(v_novo)->k is distinct from to_jsonb(d)->k then v_muda := v_muda || k; end if;
  end loop;
  if p_simular or (d.id is not null and cardinality(v_muda) = 0) then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'cria', d.id is null, 'muda', to_jsonb(v_muda), 'id', d.id, 'versao', d.versao);
  end if;
  if d.id is null then
    insert into rebanho_declaracoes (cliente_id, fazenda_id, etapa_id, saldo, saldo_arquivo, extrato, extrato_arquivo, editados, criado_por, alterado_por)
    values (v_cliente, p_fazenda_id, p_etapa_id, v_novo.saldo, v_novo.saldo_arquivo, v_novo.extrato, v_novo.extrato_arquivo, v_novo.editados,
            auth.uid(), auth.uid())
    returning * into v_novo;
  else
    update rebanho_declaracoes set saldo = v_novo.saldo, saldo_arquivo = v_novo.saldo_arquivo, extrato = v_novo.extrato,
           extrato_arquivo = v_novo.extrato_arquivo, editados = v_novo.editados, versao = versao + 1, alterado_em = now(), alterado_por = auth.uid()
     where id = d.id returning * into v_novo;
  end if;
  insert into rebanho_orgao_trilha (cliente_id, alvo, alvo_id, acao, antes, depois, por)
  values (v_cliente, 'declaracao', v_novo.id, case when d.id is null then 'criada' else 'gravada' end,
          (select jsonb_object_agg(c, to_jsonb(d)->c) from unnest(v_muda) c),
          (select jsonb_object_agg(c, to_jsonb(v_novo)->c) from unnest(v_muda) c), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'cria', d.id is null, 'muda', to_jsonb(v_muda), 'id', v_novo.id, 'versao', v_novo.versao);
end $$;
revoke all on function public.fn_rebanho_declaracao_gravar(uuid, uuid, jsonb, integer, boolean) from public, anon;
grant execute on function public.fn_rebanho_declaracao_gravar(uuid, uuid, jsonb, integer, boolean) to authenticated;

-- ═══ marcar como declarado (congela a proposta) ═══
create function public.fn_rebanho_declaracao_declarar(p_id uuid, p_proposta jsonb, p_comprovante_arquivo text, p_versao integer, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d rebanho_declaracoes;
begin
  select * into d from rebanho_declaracoes where id = p_id for update;
  if not found or not coalesce(public.tenant_ok(d.cliente_id), false) then raise exception 'Sem acesso a esta declaração.' using errcode = '42501'; end if;
  if p_simular is null or p_proposta is null or jsonb_typeof(p_proposta) <> 'object' then raise exception 'REBANHO-ORGAO: a proposta é um objeto.' using errcode = '22023'; end if;
  if not public._fn_rebanho_orgao_arquivo_ok(d.cliente_id, p_comprovante_arquivo) then
    raise exception 'REBANHO-ORGAO: o arquivo tem de estar na pasta do cliente (<cliente>/orgao/…).' using errcode = '22023';
  end if;
  if d.status = 'declarada' then raise exception 'Esta declaração já está marcada como declarada. Nada foi gravado.' using errcode = 'P0001'; end if;
  if p_versao is distinct from d.versao then raise exception 'Outra pessoa mudou esta declaração: abra de novo. Nada foi gravado.' using errcode = '40001'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'id', d.id, 'de', d.status, 'para', 'declarada'); end if;
  update rebanho_declaracoes set status = 'declarada', proposta = p_proposta, comprovante_arquivo = p_comprovante_arquivo, declarada_em = now(),
         declarada_por = auth.uid(), versao = versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = d.id;
  insert into rebanho_orgao_trilha (cliente_id, alvo, alvo_id, acao, antes, depois, por)
  values (d.cliente_id, 'declaracao', d.id, 'declarada', jsonb_build_object('status', d.status),
          jsonb_build_object('status', 'declarada', 'proposta', p_proposta, 'comprovante_arquivo', p_comprovante_arquivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', d.id, 'versao', d.versao + 1);
end $$;
revoke all on function public.fn_rebanho_declaracao_declarar(uuid, jsonb, text, integer, boolean) from public, anon;
grant execute on function public.fn_rebanho_declaracao_declarar(uuid, jsonb, text, integer, boolean) to authenticated;

-- ═══ desfazer o declarado (só com motivo; a proposta congelada fica na trilha) ═══
create function public.fn_rebanho_declaracao_desfazer(p_id uuid, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d rebanho_declaracoes;
begin
  select * into d from rebanho_declaracoes where id = p_id for update;
  if not found or not coalesce(public.tenant_ok(d.cliente_id), false) then raise exception 'Sem acesso a esta declaração.' using errcode = '42501'; end if;
  if p_simular is null then raise exception 'REBANHO-ORGAO: pedido inválido.' using errcode = '22023'; end if;
  if d.status <> 'declarada' then raise exception 'Esta declaração não está marcada como declarada. Nada foi gravado.' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Escreva o motivo para desfazer. Nada foi gravado.' using errcode = 'P0001'; end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'id', d.id, 'de', 'declarada', 'para', 'rascunho'); end if;
  update rebanho_declaracoes set status = 'rascunho', declarada_em = null, declarada_por = null, versao = versao + 1, alterado_em = now(),
         alterado_por = auth.uid()
   where id = d.id;
  insert into rebanho_orgao_trilha (cliente_id, alvo, alvo_id, acao, antes, depois, motivo, por)
  values (d.cliente_id, 'declaracao', d.id, 'desfeita',
          jsonb_build_object('status', 'declarada', 'declarada_em', d.declarada_em, 'declarada_por', d.declarada_por, 'proposta', d.proposta,
                             'comprovante_arquivo', d.comprovante_arquivo),
          jsonb_build_object('status', 'rascunho'), btrim(p_motivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', d.id, 'versao', d.versao + 1);
end $$;
revoke all on function public.fn_rebanho_declaracao_desfazer(uuid, text, boolean) from public, anon;
grant execute on function public.fn_rebanho_declaracao_desfazer(uuid, text, boolean) to authenticated;

-- ═══ o nº da eGTA (R6): só o vazio; tudo ou nada ═══
-- p_itens: [{numero, data, sentido, cab, lancamento_id}]. Cada um: o lançamento do cliente, realizado, vivo, do sentido certo.
-- O nº vivo no MESMO lançamento = "já estava"; em OUTRO = conflito. Qualquer recusa: nada grava (a prévia lista o porquê de cada um).
create function public.fn_egta_gravar_numero(p_cliente_id uuid, p_itens jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it jsonb; l lancamentos; v_sentido text; v_ja uuid; v_num text; v_data date; v_cab int;
  v_grava jsonb := '[]'::jsonb; v_ja_estava jsonb := '[]'::jsonb; v_recusa jsonb := '[]'::jsonb; v_id uuid; v_vistos text[] := '{}';
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if p_simular is null or p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 500 then
    raise exception 'REBANHO-ORGAO: a lista de eGTAs tem de 1 a 500 itens.' using errcode = '22023';
  end if;
  for it in select value from jsonb_array_elements(p_itens) loop
    v_num := btrim(coalesce(it->>'numero', ''));
    begin v_data := (it->>'data')::date; v_cab := (it->>'cab')::int; exception when others then v_data := null; v_cab := null; end;
    select * into l from lancamentos where id = case when (it->>'lancamento_id') ~ '^[0-9a-f-]{36}$' then (it->>'lancamento_id')::uuid end;
    v_sentido := case when l.tipo in ('compra', 'transferencia_entrada') then 'entrada'
                      when l.tipo in ('venda', 'abate', 'transferencia_saida') then 'saida' end;
    if l.id is null or l.cliente_id <> p_cliente_id then
      v_recusa := v_recusa || jsonb_build_object('numero', v_num, 'frase', 'a movimentação não é deste cliente');
    elsif v_num !~ '^[0-9A-Za-z./-]{3,30}$' or v_data is null or v_cab is null or v_cab <= 0 then
      v_recusa := v_recusa || jsonb_build_object('numero', v_num, 'frase', 'nº, data ou cabeças inválidos');
    elsif v_num = any (v_vistos) then
      v_recusa := v_recusa || jsonb_build_object('numero', v_num, 'frase', 'o mesmo nº duas vezes no pedido');
    elsif coalesce(l.cancelado, false) or l.cenario <> 'realizado' or l.status_operacional is distinct from 'realizado' then
      v_recusa := v_recusa || jsonb_build_object('numero', v_num, 'frase', 'a movimentação está cancelada ou ainda não aconteceu (não é realizado)');
    elsif v_sentido is null or v_sentido <> coalesce(it->>'sentido', '') then
      v_recusa := v_recusa || jsonb_build_object('numero', v_num, 'frase', 'o sentido da eGTA não é o da movimentação');
    else
      v_vistos := v_vistos || v_num;
      select lancamento_id into v_ja from rebanho_egtas where cliente_id = p_cliente_id and numero = v_num and not cancelado;
      if v_ja = l.id then v_ja_estava := v_ja_estava || jsonb_build_object('numero', v_num, 'lancamento_id', l.id);
      elsif v_ja is not null then v_recusa := v_recusa || jsonb_build_object('numero', v_num, 'frase', 'este nº já está em outra movimentação');
      else v_grava := v_grava || jsonb_build_object('numero', v_num, 'data', v_data, 'sentido', v_sentido, 'cab', v_cab, 'lancamento_id', l.id,
                                                      'fazenda_id', l.fazenda_id);
      end if;
    end if;
  end loop;
  if p_simular or jsonb_array_length(v_recusa) > 0 then
    if not p_simular then
      raise exception 'Nada foi gravado: % eGTA(s) recusada(s) — %.', jsonb_array_length(v_recusa), v_recusa->0->>'frase' using errcode = 'P0001';
    end if;
    return jsonb_build_object('ok', jsonb_array_length(v_recusa) = 0, 'simulado', true, 'grava', v_grava, 'ja_estava', v_ja_estava, 'recusa', v_recusa);
  end if;
  for it in select value from jsonb_array_elements(v_grava) loop
    insert into rebanho_egtas (cliente_id, fazenda_id, lancamento_id, numero, data, sentido, cab, criado_por)
    values (p_cliente_id, (it->>'fazenda_id')::uuid, (it->>'lancamento_id')::uuid, it->>'numero', (it->>'data')::date, it->>'sentido',
            (it->>'cab')::int, auth.uid())
    returning id into v_id;
    insert into rebanho_orgao_trilha (cliente_id, alvo, alvo_id, acao, antes, depois, por)
    values (p_cliente_id, 'egta', v_id, 'gravada', null, it, auth.uid());
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'grava', v_grava, 'ja_estava', v_ja_estava, 'recusa', v_recusa);
end $$;
revoke all on function public.fn_egta_gravar_numero(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fn_egta_gravar_numero(uuid, jsonb, boolean) to authenticated;
