-- FIN-FINANC-28 · PASSO 4 — A TELA DO CONTRATO DE CREDITO: liberacoes, destinacoes e DOCUMENTOS DO CONTRATO (Gabriel, 17/10/2026).
--
-- ESTADO ANTERIOR (medido em 17/10/2026, FASE 0):
--   · `financiamento_liberacoes` (P1) e `financiamento_destinacoes` existem, VAZIAS (0 linhas cada), e nenhuma funcao escreve nelas.
--     A RLS das duas deixa o `authenticated` gravar direto (insert/update) — a tela NAO usa isso: grava pelas funcoes abaixo.
--   · NAO EXISTE lugar para documento do CONTRATO: `financeiro_lancamento_documentos` exige `lancamento_id` (NOT NULL). A cedula
--     do financiamento nao tem lancamento. Por isso a tabela nova `financiamento_documentos`, no MESMO bucket `fin-documentos`, na
--     pasta `<cliente>/financiamentos/<contrato>/` (a 1a pasta tem de ser o cliente: e' o que as policies do bucket conferem).
--   · `_fn_financiamento_saldo` (md5 799d2053…) monta as pendencias da lista; ganha 'sem_documento' (sem cedula viva).
--
-- FUNCOES NOVAS (todas SECURITY DEFINER, search_path = pg_catalog, public; guarda `tenant_ok` do cliente do CONTRATO, 42501 "sem
-- acesso a este registro"; REVOKE de PUBLIC e anon; GRANT a authenticated e service_role):
--   fn_financiamento_liberacao_salvar   (cria ou edita; "em conta" APONTA para o lancamento existente — nunca cria lancamento)
--   fn_financiamento_liberacao_remover  (GESTO CONTRARIO: cancela a liberacao com motivo; o vinculo com o lancamento acaba junto)
--   fn_financiamento_destinacao_salvar  (cria ou edita)
--   fn_financiamento_destinacao_remover (GESTO CONTRARIO: apaga; recusa se ha' liberacao VIVA nela)
--   fn_financiamento_documento_registrar(registra e devolve o caminho; o arquivo sobe depois, no caminho devolvido)
--   fn_financiamento_documento_remover  (GESTO CONTRARIO: cancela com motivo; o arquivo fica no bucket)
--   fn_financiamento_captacoes_livres   (LEITURA: os lancamentos de ENTRADA do cliente sem contrato e sem liberacao viva — o seletor)
-- A interna `_fn_contrato_do_usuario` (a guarda comum) fica fechada: so' service_role.
-- Recusas com P0001 e frase; nada gravado. Nenhum dado de cliente e' alterado por esta migration.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. Documentos do contrato ----------------------------------------------------------------------------------------------------
create table if not exists public.financiamento_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  financiamento_id uuid not null references public.financiamentos(id) on delete restrict,
  especie text not null check (especie in ('cedula', 'aditivo', 'demonstrativo_saldo', 'comprovante_liberacao', 'comprovante_pagamento', 'outro')),
  nome text not null check (btrim(nome) <> ''),
  storage_path text,
  tipo text,
  tamanho_bytes bigint,
  enviado_por uuid,
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text,
  constraint fin_documento_cancelado_chk check ((cancelado_em is null and cancelado_motivo is null) or (cancelado_em is not null and cancelado_motivo is not null))
);
create index if not exists idx_fin_documentos_contrato on public.financiamento_documentos (financiamento_id);
alter table public.financiamento_documentos enable row level security;
drop policy if exists fin_documentos_select on public.financiamento_documentos;
create policy fin_documentos_select on public.financiamento_documentos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_documentos from public, anon;
grant select on public.financiamento_documentos to authenticated;
grant all on public.financiamento_documentos to service_role;

-- 2. Guarda comum: o contrato e o cliente dele -----------------------------------------------------------------------------------
create or replace function public._fn_contrato_do_usuario(p_financiamento_id uuid)
returns public.financiamentos
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype;
begin
  select * into f from public.financiamentos where id = p_financiamento_id;
  if not found or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return f;
end $$;
revoke all on function public._fn_contrato_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public._fn_contrato_do_usuario(uuid) to service_role;

-- 3. Liberacao: salvar --------------------------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_liberacao_salvar(
  p_financiamento_id uuid, p_id uuid, p_data date, p_valor numeric, p_forma text,
  p_lancamento_id uuid default null, p_fornecedor_id uuid default null, p_contrato_liquidado_id uuid default null,
  p_destinacao_id uuid default null, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  f public.financiamentos%rowtype;
  l record;
  v_id uuid;
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Compra parcelada não tem liberação.'; end if;
  if f.status = 'cancelado' then raise exception using errcode = 'P0001', message = 'Contrato cancelado: não recebe liberação.'; end if;
  if p_data is null then raise exception using errcode = 'P0001', message = 'Informe a data da liberação.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception using errcode = 'P0001', message = 'Informe o valor da liberação (maior que zero).'; end if;
  if p_forma is null or p_forma not in ('conta', 'fornecedor', 'liquidacao') then
    raise exception using errcode = 'P0001', message = 'Escolha a forma: em conta, direto ao fornecedor ou liquidação do anterior.';
  end if;

  if p_forma = 'conta' then
    if p_fornecedor_id is not null or p_contrato_liquidado_id is not null then
      raise exception using errcode = 'P0001', message = 'Liberação em conta não leva fornecedor nem contrato anterior.';
    end if;
    if p_lancamento_id is not null then
      select x.id, x.cliente_id, x.cancelado, x.tipo_operacao, x.financiamento_id into l from public.financeiro_lancamentos_v2 x where x.id = p_lancamento_id;
      if not found or l.cliente_id <> f.cliente_id then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
      if coalesce(l.cancelado, false) then raise exception using errcode = 'P0001', message = 'O lançamento escolhido está cancelado.'; end if;
      if coalesce(l.tipo_operacao, '') not like '1-%' then raise exception using errcode = 'P0001', message = 'O lançamento da liberação tem de ser uma entrada.'; end if;
      if l.financiamento_id is not null and l.financiamento_id <> f.id then
        raise exception using errcode = 'P0001', message = 'Este lançamento já pertence a outro contrato.';
      end if;
      if exists (select 1 from public.financiamento_liberacoes o where o.lancamento_id = p_lancamento_id and o.cancelado_em is null
                   and o.id is distinct from p_id) then
        raise exception using errcode = 'P0001', message = 'Este lançamento já está ligado a outra liberação.';
      end if;
    end if;
  elsif p_forma = 'fornecedor' then
    if p_fornecedor_id is null then raise exception using errcode = 'P0001', message = 'Escolha o fornecedor que recebeu direto.'; end if;
    if not exists (select 1 from public.financeiro_fornecedores x where x.id = p_fornecedor_id and x.cliente_id = f.cliente_id) then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    if p_lancamento_id is not null or p_contrato_liquidado_id is not null then
      raise exception using errcode = 'P0001', message = 'Liberação direto ao fornecedor não tem caixa: sem lançamento e sem contrato anterior.';
    end if;
  else
    if p_contrato_liquidado_id is null then raise exception using errcode = 'P0001', message = 'Escolha o contrato anterior que esta liberação liquida.'; end if;
    if p_contrato_liquidado_id = f.id then raise exception using errcode = 'P0001', message = 'O contrato não liquida a si mesmo.'; end if;
    if not exists (select 1 from public.financiamentos x where x.id = p_contrato_liquidado_id and x.cliente_id = f.cliente_id) then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    if p_lancamento_id is not null or p_fornecedor_id is not null then
      raise exception using errcode = 'P0001', message = 'Liquidação do anterior não tem caixa: sem lançamento e sem fornecedor.';
    end if;
  end if;

  if p_destinacao_id is not null and not exists (select 1 from public.financiamento_destinacoes d where d.id = p_destinacao_id and d.financiamento_id = f.id) then
    raise exception using errcode = 'P0001', message = 'A destinação escolhida não é deste contrato.';
  end if;

  if p_id is null then
    insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, lancamento_id, destinacao_id,
      fornecedor_id, contrato_liquidado_id, observacao, created_by)
    values (f.cliente_id, f.id, p_data, round(p_valor, 2), p_forma, p_lancamento_id, p_destinacao_id, p_fornecedor_id,
      p_contrato_liquidado_id, nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
    returning id into v_id;
  else
    update public.financiamento_liberacoes set data = p_data, valor = round(p_valor, 2), forma = p_forma, lancamento_id = p_lancamento_id,
      destinacao_id = p_destinacao_id, fornecedor_id = p_fornecedor_id, contrato_liquidado_id = p_contrato_liquidado_id,
      observacao = nullif(btrim(coalesce(p_observacao, '')), '')
     where id = p_id and financiamento_id = f.id and cancelado_em is null
    returning id into v_id;
    if v_id is null then raise exception using errcode = 'P0001', message = 'Liberação não encontrada (ou já removida) neste contrato.'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

-- 4. Liberacao: remover (o gesto contrario) --------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_liberacao_remover(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype; v_fin uuid;
begin
  select financiamento_id into v_fin from public.financiamento_liberacoes where id = p_id;
  if v_fin is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(v_fin);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da remoção.'; end if;
  update public.financiamento_liberacoes set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and cancelado_em is null;
  if not found then raise exception using errcode = 'P0001', message = 'Esta liberação já foi removida.'; end if;
  return jsonb_build_object('id', p_id, 'removida', true);
end $$;

-- 5. Destinacao: salvar e remover ------------------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_destinacao_salvar(
  p_financiamento_id uuid, p_id uuid, p_descricao text, p_valor_orcado numeric, p_fornecedor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype; v_id uuid;
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Compra parcelada não tem destinação.'; end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe a destinação.'; end if;
  if p_valor_orcado is null or p_valor_orcado < 0 then raise exception using errcode = 'P0001', message = 'Informe o valor orçado (zero ou mais).'; end if;
  if p_fornecedor_id is not null and not exists (select 1 from public.financeiro_fornecedores x where x.id = p_fornecedor_id and x.cliente_id = f.cliente_id) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_id is null then
    insert into public.financiamento_destinacoes (financiamento_id, cliente_id, descricao, valor, valor_orcado, fornecedor_id)
    values (f.id, f.cliente_id, btrim(p_descricao), round(p_valor_orcado, 2), round(p_valor_orcado, 2), p_fornecedor_id)
    returning id into v_id;
  else
    update public.financiamento_destinacoes set descricao = btrim(p_descricao), valor = round(p_valor_orcado, 2),
      valor_orcado = round(p_valor_orcado, 2), fornecedor_id = p_fornecedor_id
     where id = p_id and financiamento_id = f.id
    returning id into v_id;
    if v_id is null then raise exception using errcode = 'P0001', message = 'Destinação não encontrada neste contrato.'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.fn_financiamento_destinacao_remover(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype; v_fin uuid; v_n int;
begin
  select financiamento_id into v_fin from public.financiamento_destinacoes where id = p_id;
  if v_fin is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(v_fin);
  select count(*) into v_n from public.financiamento_liberacoes where destinacao_id = p_id and cancelado_em is null;
  if v_n > 0 then
    raise exception using errcode = 'P0001', message = format('Esta destinação tem %s liberação(ões): tire a destinação delas antes.', v_n);
  end if;
  -- as liberacoes JA REMOVIDAS que apontavam para ela perdem o ponteiro (a FK e' RESTRICT); a trilha delas fica
  update public.financiamento_liberacoes set destinacao_id = null where destinacao_id = p_id and cancelado_em is not null;
  delete from public.financiamento_destinacoes where id = p_id;
  return jsonb_build_object('id', p_id, 'removida', true);
end $$;

-- 6. Documentos: registrar e remover ----------------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_documento_registrar(
  p_financiamento_id uuid, p_especie text, p_nome text, p_extensao text, p_tipo text default null, p_tamanho bigint default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype; v_id uuid := gen_random_uuid(); v_ext text; v_path text;
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  if p_especie is null or p_especie not in ('cedula', 'aditivo', 'demonstrativo_saldo', 'comprovante_liberacao', 'comprovante_pagamento', 'outro') then
    raise exception using errcode = 'P0001', message = 'Escolha a espécie do documento.';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then raise exception using errcode = 'P0001', message = 'Documento sem nome.'; end if;
  v_ext := lower(regexp_replace(coalesce(p_extensao, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_ext = '' then v_ext := 'bin'; end if;
  v_path := f.cliente_id::text || '/financiamentos/' || f.id::text || '/' || v_id::text || '.' || v_ext;
  insert into public.financiamento_documentos (id, cliente_id, financiamento_id, especie, nome, storage_path, tipo, tamanho_bytes, enviado_por)
  values (v_id, f.cliente_id, f.id, p_especie, btrim(p_nome), v_path, p_tipo, p_tamanho, auth.uid());
  return jsonb_build_object('id', v_id, 'storage_path', v_path);
end $$;

create or replace function public.fn_financiamento_documento_remover(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype; v_fin uuid;
begin
  select financiamento_id into v_fin from public.financiamento_documentos where id = p_id;
  if v_fin is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(v_fin);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da remoção.'; end if;
  update public.financiamento_documentos set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and cancelado_em is null;
  if not found then raise exception using errcode = 'P0001', message = 'Este documento já foi removido.'; end if;
  return jsonb_build_object('id', p_id, 'removido', true);
end $$;

-- 7. Leitura: as captacoes livres (o seletor do "+ liberacao") -------------------------------------------------------------------
create or replace function public.fn_financiamento_captacoes_livres(p_financiamento_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype;
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'data', coalesce(x.data_pagamento, x.data_vencimento, x.data_competencia),
             'valor', abs(x.valor), 'descricao', x.descricao, 'conta', coalesce(c.nome_exibicao, c.nome_conta), 'status', x.status_transacao)
             order by coalesce(x.data_pagamento, x.data_vencimento, x.data_competencia) desc, x.id)
      from (select l.* from public.financeiro_lancamentos_v2 l
             where l.cliente_id = f.cliente_id and not coalesce(l.cancelado, false) and coalesce(l.tipo_operacao, '') like '1-%'
               and (l.financiamento_id is null or l.financiamento_id = f.id)
               and not exists (select 1 from public.financiamento_liberacoes o where o.lancamento_id = l.id and o.cancelado_em is null)
             order by coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) desc nulls last, l.id
             limit 500) x
      left join public.financeiro_contas_bancarias c on c.id = coalesce(x.conta_destino_id, x.conta_bancaria_id)
  ), '[]'::jsonb);
end $$;

-- 8. ACL das publicas ------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_financiamento_liberacao_salvar(uuid,uuid,date,numeric,text,uuid,uuid,uuid,uuid,text)',
    'public.fn_financiamento_liberacao_remover(uuid,text)',
    'public.fn_financiamento_destinacao_salvar(uuid,uuid,text,numeric,uuid)',
    'public.fn_financiamento_destinacao_remover(uuid)',
    'public.fn_financiamento_documento_registrar(uuid,text,text,text,text,bigint)',
    'public.fn_financiamento_documento_remover(uuid,text)',
    'public.fn_financiamento_captacoes_livres(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if has_function_privilege('anon', f::regprocedure, 'EXECUTE') then raise exception 'anon executa %', f; end if;
  end loop;
  if has_function_privilege('authenticated', 'public._fn_contrato_do_usuario(uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'a guarda interna ficou aberta a authenticated';
  end if;
end $$;

-- 9. "sem doc" nas pendencias da lista: patch guardado por md5 de `_fn_financiamento_saldo` ---------------------------------------
do $$
declare
  v_def text; v_src text;
  c_antes constant text := '799d20537863343c14d1848d4939704d';
  c_ancora constant text := E'      v_pend := array_append(v_pend, ''sem_numero_contrato'');\n    end if;\n';
  c_novo constant text := E'      v_pend := array_append(v_pend, ''sem_numero_contrato'');\n    end if;\n'
    || E'    -- FIN-FINANC-28 passo 4: todo contrato de credito precisa da cedula (documento do contrato, especie ''cedula'', vivo)\n'
    || E'    if not exists (select 1 from public.financiamento_documentos d where d.financiamento_id = f.id and d.especie = ''cedula'' and d.cancelado_em is null) then\n'
    || E'      v_pend := array_append(v_pend, ''sem_documento'');\n    end if;\n';
begin
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_saldo(uuid,date)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'corpo de _fn_financiamento_saldo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_ancora, ''))) / length(c_ancora) <> 1 then raise exception 'ancora nao casa 1x'; end if;
  v_def := pg_get_functiondef('public._fn_financiamento_saldo(uuid,date)'::regprocedure);
  execute replace(v_def, c_ancora, c_novo);
end $$;
