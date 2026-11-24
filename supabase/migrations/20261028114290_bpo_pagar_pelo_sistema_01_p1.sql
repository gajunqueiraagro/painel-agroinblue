-- BPO-PAGAR-PELO-SISTEMA-01 · P1 (banco) — o "Agendar no banco" (mock v2 aprovado 23/11; D1–D6 = a).
--   Só o BANCO: nenhuma chamada à Pluggy, nenhuma edge (P2 espera as respostas da Pluggy). Sem dado de cliente.
--   D1 quem lança não manda ao banco: a lista devolve mesma_pessoa (decidido_por = pedido_por); a edge (P2) recusa.
--   D2 o DESTINO entra na foto da aprovação (md5 de forma + dados do lançamento + chave PIX/banco/agência/conta/doc do
--      fornecedor + boletos ligados). Mudou no lançamento OU no cadastro do fornecedor = rodada nova "aguardando".
--      Rodada de antes deste lote não tem o destino na foto: não reabre por ele; a edge recusa mandá-la ("aprove de novo").
--   D5 openfinance_pagamentos guarda o estado no banco; "pago" NÃO vira realizado: quem fecha é a Conciliação (nada muda lá).
--   D6 um pedido ao banco por pagamento: um VIVO por lançamento (índice único).
--   Trava: com o pedido aguardando o banco ou agendado, valor/vencimento/favorecido/conta/forma/dados/cancelar/apagar recusam.
-- Troca 3 funções (guardadas pelo md5 de hoje): fn_aprovacao_lista (+6 colunas no fim), fn_aprovacao_enviar (a foto com o
-- destino), _fn_trg_aprovacao_foto_mudou (passa a chamar a conferência única). _fn_aprovacao_foto NÃO muda.

begin;
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.openfinance_pagamentos') is not null or to_regclass('public.openfinance_pagamentos_trilha') is not null then
    raise exception 'BPO-PAGAR-P1: as tabelas já existem: refazer.';
  end if;
  if md5(pg_get_functiondef('public.fn_aprovacao_lista'::regproc)) <> '6ac9ec5d9eb51ae72c693400d6cd897a'
     or md5(pg_get_functiondef('public.fn_aprovacao_enviar'::regproc)) <> '327c17e4a72736ff3dc8f550614f58c7'
     or md5(pg_get_functiondef('public._fn_trg_aprovacao_foto_mudou'::regproc)) <> 'b8dbbd64f4a0d03d490d75e95426583b'
     or md5(pg_get_functiondef('public._fn_aprovacao_foto'::regproc)) <> '0e08681f27f7c47585bbe1ac5dae2982' then
    raise exception 'BPO-PAGAR-P1: uma função da aprovação mudou desde o ensaio: refazer.';
  end if;
end $$;

-- 1. o pedido ao banco (uma linha por envio; escrita só pelas edges, com service_role)
create table public.openfinance_pagamentos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.clientes(id),
  aprovacao_id         uuid not null references public.financeiro_aprovacoes(id),
  lancamento_id        uuid not null references public.financeiro_lancamentos_v2(id),
  conta_bancaria_id    uuid not null references public.financeiro_contas_bancarias(id),
  valor                numeric(14,2) not null check (valor > 0),
  data_agendada        date not null,
  destino_md5          text not null check (destino_md5 ~ '^[0-9a-f]{32}$'),
  corpo_md5            text check (corpo_md5 ~ '^[0-9a-f]{32}$'),
  situacao             text not null default 'criado'
                       check (situacao in ('criado', 'aguardando_banco', 'agendado', 'pago', 'cancelado', 'erro')),
  pluggy_recebedor_id  text,
  pluggy_pedido_id     text,
  pluggy_intent_id     text,
  pluggy_agendamento_id text,
  erro                 text check (length(erro) <= 300),
  motivo_cancelamento  text check (length(motivo_cancelamento) <= 300),
  criado_por           uuid not null,
  criado_em            timestamptz not null default now(),
  confirmado_em        timestamptz,
  pago_em              timestamptz,
  cancelado_em         timestamptz,
  cancelado_por        uuid,
  atualizado_em        timestamptz not null default now(),
  check (situacao <> 'cancelado' or (cancelado_em is not null and length(btrim(coalesce(motivo_cancelamento, ''))) >= 3)),
  check (situacao <> 'pago' or pago_em is not null)
);
-- D6: um pedido VIVO por lançamento (o cancelado/erro é histórico; pode agendar de novo)
create unique index ux_openfinance_pagamentos_vivo on public.openfinance_pagamentos (lancamento_id)
  where situacao in ('criado', 'aguardando_banco', 'agendado', 'pago');
create index ix_openfinance_pagamentos_cliente on public.openfinance_pagamentos (cliente_id, situacao);
alter table public.openfinance_pagamentos enable row level security;
create policy openfinance_pagamentos_select on public.openfinance_pagamentos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_pagamentos from public, anon, authenticated;
grant select on public.openfinance_pagamentos to authenticated;
grant all on public.openfinance_pagamentos to service_role;

-- a trilha: cada mudança de situação, só acrescenta
create table public.openfinance_pagamentos_trilha (
  id              bigint generated always as identity primary key,
  pagamento_id    uuid not null references public.openfinance_pagamentos(id),
  cliente_id      uuid not null references public.clientes(id),
  situacao_antes  text,
  situacao_depois text not null,
  detalhe         text check (length(detalhe) <= 300),
  por             uuid,
  em              timestamptz not null default now()
);
create index ix_openfinance_pagamentos_trilha on public.openfinance_pagamentos_trilha (pagamento_id, em);
alter table public.openfinance_pagamentos_trilha enable row level security;
create policy openfinance_pagamentos_trilha_select on public.openfinance_pagamentos_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_pagamentos_trilha from public, anon, authenticated;
grant select on public.openfinance_pagamentos_trilha to authenticated;
grant select, insert on public.openfinance_pagamentos_trilha to service_role;

create function public._fn_trg_openfinance_pagamento_trilha() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Pedido ao banco não se apaga: cancele.' using errcode = '22023'; end if;
  if tg_op = 'UPDATE' then
    if new.situacao is not distinct from old.situacao then new.atualizado_em := now(); return new; end if;
    if old.situacao in ('cancelado', 'erro') then raise exception 'Pedido ao banco já encerrado.' using errcode = '22023'; end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create function public._fn_trg_openfinance_pagamento_trilha_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.situacao is distinct from old.situacao then
    insert into public.openfinance_pagamentos_trilha (pagamento_id, cliente_id, situacao_antes, situacao_depois, detalhe, por)
    values (new.id, new.cliente_id, case when tg_op = 'UPDATE' then old.situacao end, new.situacao,
            left(coalesce(new.erro, new.motivo_cancelamento), 300), coalesce(auth.uid(), new.cancelado_por, new.criado_por));
  end if;
  return null;
end $$;
create function public._fn_trg_openfinance_trilha_so_acrescenta() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'A trilha do pedido ao banco só acrescenta.' using errcode = '22023';
end $$;
revoke all on function public._fn_trg_openfinance_pagamento_trilha() from public, anon, authenticated;
revoke all on function public._fn_trg_openfinance_pagamento_trilha_depois() from public, anon, authenticated;
revoke all on function public._fn_trg_openfinance_trilha_so_acrescenta() from public, anon, authenticated;
create trigger trg_00_openfinance_pagamento before insert or update or delete on public.openfinance_pagamentos
  for each row execute function public._fn_trg_openfinance_pagamento_trilha();
create trigger trg_zz_openfinance_pagamento_trilha after insert or update on public.openfinance_pagamentos
  for each row execute function public._fn_trg_openfinance_pagamento_trilha_depois();
create trigger trg_00_openfinance_trilha_so_acrescenta before update or delete on public.openfinance_pagamentos_trilha
  for each row execute function public._fn_trg_openfinance_trilha_so_acrescenta();

-- 2. D2: o destino (md5) e a foto com ele
create function public._fn_aprovacao_destino(p_forma text, p_dados jsonb, p_fav uuid, p_lancamento uuid) returns text
language sql stable set search_path = public as $$
  select md5(jsonb_build_object(
      'forma',     public._fn_forma_efetiva_pagamento(p_forma, f.tipo_recebimento),
      'dados',     case when p_dados is null or jsonb_typeof(p_dados) = 'null' or p_dados in ('{}'::jsonb, '[]'::jsonb) then null else p_dados end,
      'pix',       nullif(btrim(f.pix_chave), ''),
      'banco',     nullif(btrim(f.banco), ''),
      'agencia',   nullif(btrim(f.agencia), ''),
      'conta',     nullif(btrim(f.conta), ''),
      'tipo_conta', nullif(btrim(f.tipo_conta), ''),
      'doc',       nullif(regexp_replace(coalesce(nullif(btrim(f.cpf_cnpj_pagamento), ''), f.cpf_cnpj, ''), '\D', '', 'g'), ''),
      'boletos',   (select jsonb_agg(bl.boleto_id order by bl.boleto_id) from public.boleto_lancamentos bl
                     where bl.lancamento_id = p_lancamento and bl.desligado_em is null))::text)
    from (select 1) um left join public.financeiro_fornecedores f on f.id = p_fav
$$;
create function public._fn_aprovacao_foto_atual(p_lancamento uuid) returns jsonb
language sql stable set search_path = public as $$
  select public._fn_aprovacao_foto(l.valor, l.data_vencimento, l.favorecido_id, l.conta_bancaria_id, l.plano_conta_id, l.fazenda_id)
         || jsonb_build_object('destino', public._fn_aprovacao_destino(l.forma_pagamento, l.dados_pagamento, l.favorecido_id, l.id))
    from public.financeiro_lancamentos_v2 l where l.id = p_lancamento
$$;
revoke all on function public._fn_aprovacao_destino(text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public._fn_aprovacao_foto_atual(uuid) from public, anon, authenticated;
grant execute on function public._fn_aprovacao_destino(text, jsonb, uuid, uuid) to service_role;
grant execute on function public._fn_aprovacao_foto_atual(uuid) to service_role;

-- a conferência ÚNICA da foto (o gatilho do lançamento e o do fornecedor chamam esta)
create function public._fn_aprovacao_conferir_foto(p_lancamento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a financeiro_aprovacoes;
  l financeiro_lancamentos_v2;
  v_foto jsonb;
  v_comparar jsonb;
  v_mudou text;
begin
  select * into a from financeiro_aprovacoes where lancamento_id = p_lancamento and situacao in ('aguardando', 'aprovado');
  if a.id is null then return; end if;
  select * into l from financeiro_lancamentos_v2 where id = p_lancamento;
  if l.id is null or l.status_transacao = 'realizado' or l.cancelado is true then return; end if;
  -- já no banco: o agendamento não muda por aqui (a trava recusa no lançamento; o fornecedor aparece como destino_mudou)
  if exists (select 1 from openfinance_pagamentos p where p.lancamento_id = p_lancamento
              and p.situacao in ('aguardando_banco', 'agendado', 'pago')) then return; end if;
  v_foto := public._fn_aprovacao_foto_atual(p_lancamento);
  v_comparar := case when a.foto ? 'destino' then v_foto else v_foto - 'destino' end;  -- rodada de antes do P1
  if v_comparar = a.foto then return; end if;
  select string_agg(k, ', ' order by k) into v_mudou from jsonb_object_keys(v_comparar) k where v_comparar->k is distinct from a.foto->k;
  update financeiro_aprovacoes set situacao = 'substituido' where id = a.id;
  insert into financeiro_aprovacoes (cliente_id, lancamento_id, rodada, situacao, observacao, foto, pedido_por)
  values (a.cliente_id, p_lancamento, a.rodada + 1, 'aguardando', left('mudou: ' || coalesce(v_mudou, '?'), 300), v_foto,
          coalesce(auth.uid(), a.pedido_por));
end $$;
revoke all on function public._fn_aprovacao_conferir_foto(uuid) from public, anon, authenticated;
grant execute on function public._fn_aprovacao_conferir_foto(uuid) to service_role;

create or replace function public._fn_trg_aprovacao_foto_mudou()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public._fn_aprovacao_conferir_foto(new.id);
  return null;
end $function$;

-- o gatilho do lançamento passa a olhar também a forma e os dados de pagamento (o destino)
drop trigger trg_zz_aprovacao_foto_mudou on public.financeiro_lancamentos_v2;
create trigger trg_zz_aprovacao_foto_mudou after update of valor, data_vencimento, favorecido_id, conta_bancaria_id, plano_conta_id,
  fazenda_id, forma_pagamento, dados_pagamento on public.financeiro_lancamentos_v2
  for each row when (old.valor is distinct from new.valor or old.data_vencimento is distinct from new.data_vencimento
    or old.favorecido_id is distinct from new.favorecido_id or old.conta_bancaria_id is distinct from new.conta_bancaria_id
    or old.plano_conta_id is distinct from new.plano_conta_id or old.fazenda_id is distinct from new.fazenda_id
    or old.forma_pagamento is distinct from new.forma_pagamento or old.dados_pagamento is distinct from new.dados_pagamento)
  execute function public._fn_trg_aprovacao_foto_mudou();

-- e o do fornecedor: trocar chave/conta/doc reabre as rodadas vivas dos lançamentos dele
create function public._fn_trg_aprovacao_destino_fornecedor() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select a.lancamento_id from financeiro_aprovacoes a join financeiro_lancamentos_v2 l on l.id = a.lancamento_id
            where l.favorecido_id = new.id and a.situacao in ('aguardando', 'aprovado') order by a.lancamento_id loop
    perform public._fn_aprovacao_conferir_foto(r.lancamento_id);
  end loop;
  return null;
end $$;
revoke all on function public._fn_trg_aprovacao_destino_fornecedor() from public, anon, authenticated;
create trigger trg_zz_aprovacao_destino_fornecedor after update of pix_chave, banco, agencia, conta, tipo_conta, cpf_cnpj,
  cpf_cnpj_pagamento, tipo_recebimento on public.financeiro_fornecedores
  for each row when (old.pix_chave is distinct from new.pix_chave or old.banco is distinct from new.banco
    or old.agencia is distinct from new.agencia or old.conta is distinct from new.conta or old.tipo_conta is distinct from new.tipo_conta
    or old.cpf_cnpj is distinct from new.cpf_cnpj or old.cpf_cnpj_pagamento is distinct from new.cpf_cnpj_pagamento
    or old.tipo_recebimento is distinct from new.tipo_recebimento)
  execute function public._fn_trg_aprovacao_destino_fornecedor();

-- 3. a trava: no banco, o lançamento não muda o que foi mandado
create function public._fn_trg_pagamento_no_banco_trava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from openfinance_pagamentos p where p.lancamento_id = old.id
                  and p.situacao in ('aguardando_banco', 'agendado')) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE'
     or new.valor is distinct from old.valor or new.data_vencimento is distinct from old.data_vencimento
     or new.favorecido_id is distinct from old.favorecido_id or new.conta_bancaria_id is distinct from old.conta_bancaria_id
     or new.forma_pagamento is distinct from old.forma_pagamento or new.dados_pagamento is distinct from old.dados_pagamento
     or (new.cancelado is true and old.cancelado is not true) then
    raise exception 'Este pagamento está agendado no banco: cancele no banco antes de mudar.' using errcode = '22023';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public._fn_trg_pagamento_no_banco_trava() from public, anon, authenticated;
create trigger trg_01_pagamento_no_banco_trava before update of valor, data_vencimento, favorecido_id, conta_bancaria_id,
  forma_pagamento, dados_pagamento, cancelado or delete on public.financeiro_lancamentos_v2
  for each row execute function public._fn_trg_pagamento_no_banco_trava();

-- 4. fn_aprovacao_enviar: a foto nasce com o destino (o resto igual, letra por letra)
create or replace function public.fn_aprovacao_enviar(p_cliente uuid, p_ids uuid[], p_simular boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  l record;
  v_viva financeiro_aprovacoes;
  v_aprovador boolean;
  n_env int := 0; n_auto int := 0; recusas jsonb := '[]'::jsonb;
begin
  if p_cliente is null or p_ids is null or p_simular is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'BPO: pedido inválido.' using errcode = '22023';
  end if;
  if not public.tenant_ok(p_cliente) or not (public.is_admin_agroinblue(u)
       or coalesce(public.get_user_perfil(u, p_cliente)::text, '') in ('gestor_cliente', 'financeiro')) then
    raise exception 'BPO: sem acesso para enviar pagamentos deste cliente.' using errcode = '42501';
  end if;
  if not public._fn_bpo_ativo(p_cliente) then raise exception 'BPO: a aprovação não está ligada neste cliente.' using errcode = '22023'; end if;
  v_aprovador := public._fn_eh_aprovador(p_cliente, u);
  for l in select x.* from financeiro_lancamentos_v2 x where x.id = any(p_ids) order by x.data_vencimento, x.id loop
    if l.cliente_id is distinct from p_cliente then raise exception 'BPO: lançamento de outro cliente.' using errcode = '42501'; end if;
    if l.cancelado is true or l.tipo_operacao <> '2-Saídas' or l.status_transacao = 'realizado' then
      recusas := recusas || jsonb_build_object('id', l.id, 'motivo', case when l.cancelado then 'cancelado' when l.status_transacao = 'realizado' then 'já pago'
        else 'não é saída' end);
      continue;
    end if;
    select * into v_viva from financeiro_aprovacoes a where a.lancamento_id = l.id and a.situacao <> 'substituido';
    if v_viva.id is not null and v_viva.situacao in ('aguardando', 'aprovado') then
      recusas := recusas || jsonb_build_object('id', l.id, 'motivo', case when v_viva.situacao = 'aprovado' then 'já aprovado' else 'já na fila' end);
      continue;
    end if;
    if v_aprovador then n_auto := n_auto + 1; else n_env := n_env + 1; end if;
    if p_simular then continue; end if;
    if v_viva.id is not null then update financeiro_aprovacoes set situacao = 'substituido' where id = v_viva.id; end if;
    insert into financeiro_aprovacoes (cliente_id, lancamento_id, rodada, situacao, observacao, foto, pedido_por, decidido_por, decidido_em)
    values (p_cliente, l.id, coalesce((select max(rodada) from financeiro_aprovacoes where lancamento_id = l.id), 0) + 1,
            case when v_aprovador then 'aprovado' else 'aguardando' end,
            case when v_aprovador then 'lançado e aprovado pela mesma pessoa' end,
            public._fn_aprovacao_foto_atual(l.id),
            u, case when v_aprovador then u end, case when v_aprovador then now() end);
  end loop;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'enviados', n_env, 'aprovados_pelo_mesmo', n_auto, 'recusados', recusas);
end $function$;

-- 5. fn_aprovacao_lista: as colunas de hoje iguais + 6 no fim (a coluna "No banco" e o "Falta 2º aprovador")
drop function public.fn_aprovacao_lista(uuid, text[], date);
create function public.fn_aprovacao_lista(p_cliente uuid, p_situacoes text[], p_venc_ate date)
 returns table(lancamento_id uuid, rodada integer, situacao text, motivo text, observacao text, pedido_por uuid, pedido_em timestamp with time zone,
   decidido_por uuid, decidido_em timestamp with time zone, vencimento date, valor numeric, descricao text, fornecedor text, fazenda text,
   conta text, conta_bancaria_id uuid, status_transacao text, tem_nota boolean, tem_boleto boolean, forma text, pronto_pagar text,
   mesma_pessoa boolean, no_banco text, no_banco_data date, no_banco_confirmado_em timestamp with time zone,
   no_banco_pago_em timestamp with time zone, destino_mudou boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then raise exception 'BPO: sem acesso a este cliente.' using errcode = '42501'; end if;
  return query
  select a.lancamento_id, a.rodada, a.situacao, a.motivo, a.observacao, a.pedido_por, a.pedido_em, a.decidido_por, a.decidido_em,
         l.data_vencimento, l.valor, l.descricao, f.nome, fz.nome, coalesce(cb.nome_exibicao, cb.nome_conta), l.conta_bancaria_id, l.status_transacao,
         exists (select 1 from financeiro_documento_vinculos dv where dv.lancamento_id = l.id),
         exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null),
         -- FIN-PRONTO-PAGAR-01: a forma que vale e o código do "pronto para pagar" (a mesma regra da lista de Lançamentos)
         public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento),
         public._fn_pronto_para_pagar(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true),
           public._fn_forma_efetiva_pagamento(l.forma_pagamento, f.tipo_recebimento), l.dados_pagamento,
           exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = l.id and bl.desligado_em is null),
           f.pix_chave, f.banco, f.agencia, f.conta),
         -- BPO-PAGAR-PELO-SISTEMA-01 P1: D1 e o pedido ao banco mais recente
         (a.situacao = 'aprovado' and a.decidido_por is not distinct from a.pedido_por),
         p.situacao, p.data_agendada, p.confirmado_em, p.pago_em,
         (a.situacao = 'aprovado' and coalesce(case when p.situacao in ('criado', 'aguardando_banco', 'agendado', 'pago') then p.destino_md5 end,
            a.foto->>'destino') is distinct from public._fn_aprovacao_destino(l.forma_pagamento, l.dados_pagamento, l.favorecido_id, l.id))
    from financeiro_aprovacoes a
    join financeiro_lancamentos_v2 l on l.id = a.lancamento_id
    left join financeiro_fornecedores f on f.id = l.favorecido_id
    left join fazendas fz on fz.id = l.fazenda_id
    left join financeiro_contas_bancarias cb on cb.id = l.conta_bancaria_id
    left join lateral (select x.situacao, x.data_agendada, x.confirmado_em, x.pago_em, x.destino_md5 from openfinance_pagamentos x
                        where x.lancamento_id = l.id order by x.criado_em desc, x.id desc limit 1) p on true
   where a.cliente_id = p_cliente and a.situacao <> 'substituido'
     and (p_situacoes is null or a.situacao = any(p_situacoes))
     and (p_venc_ate is null or l.data_vencimento <= p_venc_ate)
   order by l.data_vencimento, l.valor;
end $function$;
revoke all on function public.fn_aprovacao_lista(uuid, text[], date) from public, anon;
grant execute on function public.fn_aprovacao_lista(uuid, text[], date) to authenticated, service_role;

commit;
