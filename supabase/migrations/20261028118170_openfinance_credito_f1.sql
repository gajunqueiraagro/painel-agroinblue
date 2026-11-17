-- OPENFINANCE-FINANCIAMENTOS-01 · F1 — o CRÉDITO do Open Finance como TESTEMUNHA do contrato (D1–D7 e M1–M5 aprovados 17/11).
--   D1: o crédito do banco SÓ CONFERE e PROPÕE. O contrato do sistema segue a fonte do saldo (fn_financiamento_saldo), do cronograma
--       (fn_financiamento_cronograma / _parcelas_*) e do pagamento (o extrato). Nada aqui escreve em financiamentos/parcelas/lançamentos.
--   1. openfinance_conexoes — o que foi CONSENTIDO em cada conexão (produtos, permissões, validade). Hoje isso não era guardado.
--      O cliente da conexão vem SÓ do item/created com o nosso clientUserId (SEG-01): a função confere em openfinance_eventos.
--   2. openfinance_credito_retratos — APPEND-ONLY: cada leitura do /loans da Pluggy (um contrato do banco por linha). A mesma foto
--      (mesmo contrato, mesmo conteúdo) não repete linha. UPDATE/DELETE recusados por gatilho.
--   3. openfinance_credito_contratos — a ESCOLHA contrato a contrato (D5: só entra o marcado) e o CASAMENTO com o contrato do sistema
--      (M4: pelo nº; sem nº, valor + data é só sugestão "conferir", nunca casa sozinho). Um contrato do sistema ← um do banco vivo.
--   4. Internas INVOKER, só service_role (a Edge Function openfinance-credito): _fn_openfinance_conexao_registrar,
--      _fn_openfinance_credito_registrar.
--   5. Da tela (SECURITY DEFINER, admin AgroinBlue — M5): fn_openfinance_credito_marcar, fn_openfinance_credito_casar (p_simular).
--   6. fn_openfinance_credito_conferencia(p_financiamento_id) — SÓ LEITURA, membro do cliente (tenant_ok, 42501): a régua
--      confere / diferente / diferente_juros (M2: só juros corridos, não vira pendência) / vazio_no_sistema ("Usar", M3) /
--      sem_dado_do_banco, campo a campo, e as parcelas do sistema × balões do banco × pagamentos do banco (±3 dias). A tela só desenha.
-- Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.openfinance_conexoes') is not null or to_regclass('public.openfinance_credito_retratos') is not null
     or to_regclass('public.openfinance_credito_contratos') is not null then
    raise exception 'OPENFINANCE-FIN F1: as tabelas já existem: refazer.';
  end if;
end $$;

-- ── 1. conexões ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.openfinance_conexoes (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  item_id        text not null,
  connector_id   integer,
  banco          text,
  titular_tipo   text check (titular_tipo in ('PF', 'PJ')),          -- sem CPF/CNPJ (OPENFINANCE-CLIENTE-01: "sem CPF")
  produtos       text[] not null default '{}',                       -- o que a Pluggy coleta (ACCOUNTS, TRANSACTIONS, LOANS…)
  permissoes     text[] not null default '{}',                       -- openFinancePermissionsGranted
  consentido_em  timestamptz,
  expira_em      timestamptz,                                         -- nulo = sem validade
  revogado_em    timestamptz,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid not null
);
create unique index ux_openfinance_conexoes_item on public.openfinance_conexoes (item_id);
create index ix_openfinance_conexoes_cliente on public.openfinance_conexoes (cliente_id);
alter table public.openfinance_conexoes enable row level security;
create policy openfinance_conexoes_select on public.openfinance_conexoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_conexoes from public, anon, authenticated;
grant select on public.openfinance_conexoes to authenticated;
grant all on public.openfinance_conexoes to service_role;

create function public._fn_openfinance_conexao_registrar(p_cliente uuid, p_item text, p_connector integer, p_banco text,
  p_titular_tipo text, p_produtos text[], p_permissoes text[], p_consentido_em timestamptz, p_expira_em timestamptz,
  p_revogado_em timestamptz, p_autor uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v openfinance_conexoes;
begin
  if p_cliente is null or coalesce(p_item, '') = '' or p_autor is null then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  -- SEG-01: o cliente da conexão é o do item/created com o nosso clientUserId — nunca o que a chamada diz
  if not exists (select 1 from openfinance_eventos e where e.item_id = p_item and e.evento = 'item/created' and e.cliente_id = p_cliente) then
    raise exception 'OPENFINANCE: esta conexão não é deste cliente.' using errcode = '42501';
  end if;
  select * into v from openfinance_conexoes where item_id = p_item;
  if v.id is not null and v.cliente_id is distinct from p_cliente then
    raise exception 'OPENFINANCE: esta conexão não é deste cliente.' using errcode = '42501';
  end if;
  if v.id is null then
    insert into openfinance_conexoes (cliente_id, item_id, connector_id, banco, titular_tipo, produtos, permissoes, consentido_em,
                                      expira_em, revogado_em, atualizado_por)
    values (p_cliente, p_item, p_connector, p_banco, p_titular_tipo, coalesce(p_produtos, '{}'), coalesce(p_permissoes, '{}'),
            p_consentido_em, p_expira_em, p_revogado_em, p_autor)
    returning * into v;
    return jsonb_build_object('ok', true, 'novo', true, 'id', v.id);
  end if;
  update openfinance_conexoes
     set connector_id = coalesce(p_connector, connector_id), banco = coalesce(p_banco, banco),
         titular_tipo = coalesce(p_titular_tipo, titular_tipo), produtos = coalesce(p_produtos, produtos),
         permissoes = coalesce(p_permissoes, permissoes), consentido_em = coalesce(p_consentido_em, consentido_em),
         expira_em = p_expira_em, revogado_em = p_revogado_em, atualizado_em = now(), atualizado_por = p_autor
   where id = v.id;
  return jsonb_build_object('ok', true, 'novo', false, 'id', v.id);
end $$;
revoke all on function public._fn_openfinance_conexao_registrar(uuid, text, integer, text, text, text[], text[], timestamptz, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public._fn_openfinance_conexao_registrar(uuid, text, integer, text, text, text[], text[], timestamptz, timestamptz, timestamptz, uuid)
  to service_role;

-- ── 2. retratos do crédito (append-only) ─────────────────────────────────────────────────────────────────────────────────────────
create table public.openfinance_credito_retratos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references public.clientes(id),
  conexao_id           uuid not null references public.openfinance_conexoes(id),
  loan_id              text not null,                 -- o id da Pluggy (estável por contrato)
  contrato_numero      text,
  ipoc                 text,
  kind                 text not null,                 -- LOAN | FINANCING | INVOICE_FINANCING | UNARRANGED_ACCOUNT_OVERDRAFT
  modalidade           text,                          -- o `type` (submodalidade do OFB: CUSTEIO, INVESTIMENTO…)
  produto_nome         text,
  data_contrato        date,
  primeiro_vencimento  date,
  vencimento_final     date,
  contratado           numeric(16, 2),
  para_quitar          numeric(16, 2),                -- payments.contractOutstandingBalance (inclui juros até a data do banco)
  cet                  numeric(12, 8),                -- 1 = 100%
  sistema              text,                          -- amortizationScheduled
  periodicidade        text,                          -- installmentPeriodicity
  parcelas_total       integer,
  parcelas_pagas       integer,
  parcelas_a_vencer    integer,
  parcelas_vencidas    integer,
  taxas                jsonb not null default '[]',   -- interestRates[]
  baloes               jsonb not null default '[]',   -- balloonPayments[] {dueDate, amount}
  pagamentos           jsonb not null default '[]',   -- releases[] {paidDate, paidAmount, installmentId, isOverParcelPayment}
  bruto_md5            text not null,                 -- md5 do objeto lido: a mesma foto não repete
  lido_em              timestamptz not null default now(),
  lido_por             uuid not null
);
create index ix_openfinance_credito_retratos_loan on public.openfinance_credito_retratos (cliente_id, loan_id, lido_em desc);
alter table public.openfinance_credito_retratos enable row level security;
create policy openfinance_credito_retratos_select on public.openfinance_credito_retratos for select to authenticated
  using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_credito_retratos from public, anon, authenticated;
grant select on public.openfinance_credito_retratos to authenticated;
grant select, insert on public.openfinance_credito_retratos to service_role;

create function public._fn_openfinance_credito_retrato_imutavel() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'OPENFINANCE: o retrato do banco não se altera nem se apaga (só se acrescenta uma leitura nova).' using errcode = '42501';
end $$;
revoke all on function public._fn_openfinance_credito_retrato_imutavel() from public, anon, authenticated;
create trigger trg_openfinance_credito_retrato_imutavel before update or delete on public.openfinance_credito_retratos
  for each row execute function public._fn_openfinance_credito_retrato_imutavel();

-- p_loan = o objeto Loan da Pluggy inteiro (jsonb); só os campos conhecidos viram coluna, o resto não se guarda
create function public._fn_openfinance_credito_registrar(p_item text, p_loan jsonb, p_autor uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  c openfinance_conexoes;
  u openfinance_credito_retratos;
  v_md5 text;
  v_inst jsonb;
  v_pay jsonb;
begin
  if coalesce(p_item, '') = '' or p_loan is null or jsonb_typeof(p_loan) <> 'object' or p_autor is null
     or coalesce(p_loan ->> 'id', '') = '' or coalesce(p_loan ->> 'kind', '') = '' then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  select * into c from openfinance_conexoes where item_id = p_item and revogado_em is null;
  if c.id is null then
    raise exception 'OPENFINANCE: conexão desconhecida ou revogada.' using errcode = '42501';
  end if;
  if not ('LOANS' = any (c.produtos)) then
    raise exception 'OPENFINANCE: esta conexão não tem o consentimento de crédito (LOANS).' using errcode = '42501';
  end if;
  v_md5 := md5(p_loan::text);
  select * into u from openfinance_credito_retratos r
   where r.cliente_id = c.cliente_id and r.loan_id = p_loan ->> 'id' order by r.lido_em desc limit 1;
  if u.id is not null and u.bruto_md5 = v_md5 then
    return jsonb_build_object('ok', true, 'novo', false, 'id', u.id);
  end if;
  v_inst := coalesce(p_loan -> 'installments', '{}');
  v_pay := coalesce(p_loan -> 'payments', '{}');
  insert into openfinance_credito_retratos (cliente_id, conexao_id, loan_id, contrato_numero, ipoc, kind, modalidade, produto_nome,
    data_contrato, primeiro_vencimento, vencimento_final, contratado, para_quitar, cet, sistema, periodicidade, parcelas_total,
    parcelas_pagas, parcelas_a_vencer, parcelas_vencidas, taxas, baloes, pagamentos, bruto_md5, lido_por)
  values (c.cliente_id, c.id, p_loan ->> 'id', nullif(btrim(p_loan ->> 'contractNumber'), ''), p_loan ->> 'ipocCode',
    p_loan ->> 'kind', p_loan ->> 'type', p_loan ->> 'productName',
    left(p_loan ->> 'contractDate', 10)::date, left(p_loan ->> 'firstInstallmentDueDate', 10)::date, left(p_loan ->> 'dueDate', 10)::date,
    (p_loan ->> 'contractAmount')::numeric, (v_pay ->> 'contractOutstandingBalance')::numeric, (p_loan ->> 'CET')::numeric,
    p_loan ->> 'amortizationScheduled', p_loan ->> 'installmentPeriodicity',
    (v_inst ->> 'totalNumberOfInstallments')::integer, (v_inst ->> 'paidInstallments')::integer,
    (v_inst ->> 'dueInstallments')::integer, (v_inst ->> 'pastDueInstallments')::integer,
    coalesce(p_loan -> 'interestRates', '[]'), coalesce(v_inst -> 'balloonPayments', '[]'), coalesce(v_pay -> 'releases', '[]'),
    v_md5, p_autor)
  returning * into u;
  -- o contrato do banco passa a existir na lista "Contratos no banco" (desmarcado: D5)
  insert into openfinance_credito_contratos (cliente_id, conexao_id, loan_id)
  values (c.cliente_id, c.id, p_loan ->> 'id') on conflict (cliente_id, loan_id) do nothing;
  return jsonb_build_object('ok', true, 'novo', true, 'id', u.id);
end $$;

-- ── 3. a escolha e o casamento ───────────────────────────────────────────────────────────────────────────────────────────────────
create table public.openfinance_credito_contratos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id),
  conexao_id        uuid not null references public.openfinance_conexoes(id),
  loan_id           text not null,
  conferir          boolean not null default false,    -- D5: só entra o marcado
  financiamento_id  uuid references public.financiamentos(id),
  casado_por        text check (casado_por in ('numero', 'admin')),
  marcado_por       uuid,
  marcado_em        timestamptz,
  constraint ux_openfinance_credito_contratos unique (cliente_id, loan_id)
);
create unique index ux_openfinance_credito_contratos_fin on public.openfinance_credito_contratos (financiamento_id)
  where financiamento_id is not null;
alter table public.openfinance_credito_contratos enable row level security;
create policy openfinance_credito_contratos_select on public.openfinance_credito_contratos for select to authenticated
  using (public.tenant_ok(cliente_id));
revoke all on public.openfinance_credito_contratos from public, anon, authenticated;
grant select on public.openfinance_credito_contratos to authenticated;
grant all on public.openfinance_credito_contratos to service_role;

revoke all on function public._fn_openfinance_credito_registrar(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public._fn_openfinance_credito_registrar(text, jsonb, uuid) to service_role;

-- só dígitos: "40/01234-5" = "40012345"
create function public._fn_openfinance_so_digitos(p text) returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;
revoke all on function public._fn_openfinance_so_digitos(text) from public, anon;
grant execute on function public._fn_openfinance_so_digitos(text) to authenticated, service_role;

-- MARCAR (D5) — admin AgroinBlue (M5); lote, tudo ou nada; marcar casa sozinho SÓ pelo nº do contrato (M4)
create function public.fn_openfinance_credito_marcar(p_cliente uuid, p_loans text[], p_conferir boolean, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_casados jsonb := '[]';
  r record;
  v_fin uuid;
begin
  if p_cliente is null or p_loans is null or cardinality(p_loans) = 0 or p_conferir is null or p_simular is null then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  if not public.tenant_ok(p_cliente) or not public.is_admin_agroinblue((select auth.uid())) then
    raise exception 'Só a AgroinBlue marca os contratos do banco.' using errcode = '42501';
  end if;
  select count(*) into v_n from openfinance_credito_contratos where cliente_id = p_cliente and loan_id = any (p_loans);
  if v_n <> cardinality(p_loans) then
    raise exception 'OPENFINANCE: algum contrato do banco não é deste cliente.' using errcode = '42501';
  end if;
  for r in
    select k.id, k.loan_id, k.financiamento_id,
           (select t.contrato_numero from openfinance_credito_retratos t where t.cliente_id = k.cliente_id and t.loan_id = k.loan_id
             order by t.lido_em desc limit 1) as numero
      from openfinance_credito_contratos k where k.cliente_id = p_cliente and k.loan_id = any (p_loans)
  loop
    v_fin := null;
    if p_conferir and r.financiamento_id is null and public._fn_openfinance_so_digitos(r.numero) is not null then
      -- casa só se o nº bater com UM contrato do sistema, vivo e ainda sem par
      select (array_agg(f.id))[1] into v_fin from financiamentos f
       where f.cliente_id = p_cliente and f.status not in ('cancelado')
         and public._fn_openfinance_so_digitos(f.numero_contrato) = public._fn_openfinance_so_digitos(r.numero)
         and not exists (select 1 from openfinance_credito_contratos o where o.financiamento_id = f.id)
      having count(*) = 1;
      if v_fin is not null then v_casados := v_casados || jsonb_build_object('loan_id', r.loan_id, 'financiamento_id', v_fin); end if;
    end if;
    if not p_simular then
      update openfinance_credito_contratos
         set conferir = p_conferir, marcado_por = (select auth.uid()), marcado_em = now(),
             financiamento_id = coalesce(financiamento_id, v_fin),
             casado_por = case when financiamento_id is null and v_fin is not null then 'numero' else casado_por end
       where id = r.id;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'marcados', cardinality(p_loans), 'conferir', p_conferir,
                            'casados_pelo_numero', v_casados);
end $$;
revoke all on function public.fn_openfinance_credito_marcar(uuid, text[], boolean, boolean) from public, anon;
grant execute on function public.fn_openfinance_credito_marcar(uuid, text[], boolean, boolean) to authenticated;

-- CASAR à mão (M4: a sugestão por valor + data vira casamento só por este gesto); p_financiamento nulo = descasar
create function public.fn_openfinance_credito_casar(p_cliente uuid, p_loan text, p_financiamento uuid, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k openfinance_credito_contratos;
  f financiamentos;
begin
  if p_cliente is null or coalesce(p_loan, '') = '' or p_simular is null then
    raise exception 'OPENFINANCE: pedido inválido.' using errcode = '22023';
  end if;
  if not public.tenant_ok(p_cliente) or not public.is_admin_agroinblue((select auth.uid())) then
    raise exception 'Só a AgroinBlue casa os contratos do banco.' using errcode = '42501';
  end if;
  select * into k from openfinance_credito_contratos where cliente_id = p_cliente and loan_id = p_loan;
  if k.id is null then
    raise exception 'OPENFINANCE: este contrato do banco não é deste cliente.' using errcode = '42501';
  end if;
  if p_financiamento is not null then
    select * into f from financiamentos where id = p_financiamento;
    if f.id is null or f.cliente_id is distinct from p_cliente then
      raise exception 'OPENFINANCE: o contrato do sistema não é deste cliente.' using errcode = '42501';
    end if;
    if exists (select 1 from openfinance_credito_contratos o where o.financiamento_id = p_financiamento and o.id <> k.id) then
      raise exception 'Este contrato do sistema já está casado com outro contrato do banco.' using errcode = '23505';
    end if;
  end if;
  if p_simular or k.financiamento_id is not distinct from p_financiamento then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'antes', k.financiamento_id, 'depois', p_financiamento,
                              'mudou', k.financiamento_id is distinct from p_financiamento);
  end if;
  update openfinance_credito_contratos
     set financiamento_id = p_financiamento, casado_por = case when p_financiamento is null then null else 'admin' end,
         marcado_por = (select auth.uid()), marcado_em = now()
   where id = k.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'antes', k.financiamento_id, 'depois', p_financiamento, 'mudou', true);
end $$;
revoke all on function public.fn_openfinance_credito_casar(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.fn_openfinance_credito_casar(uuid, text, uuid, boolean) to authenticated;

-- ── 6. a conferência (só leitura; a régua mora aqui, a tela só desenha) ──────────────────────────────────────────────────────────
create function public.fn_openfinance_credito_conferencia(p_financiamento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f financiamentos;
  k openfinance_credito_contratos;
  t openfinance_credito_retratos;
  s jsonb;
  v_campos jsonb := '[]';
  v_parcelas jsonb := '[]';
  v_sem_parcela jsonb := '[]';
  v_taxa_banco numeric;
  v_sis text; v_per text; v_fin text;
  v_saldo numeric; v_jprev numeric; v_sit text;
  p record; b jsonb; pg jsonb;
begin
  select * into f from financiamentos where id = p_financiamento_id;
  if f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select * into k from openfinance_credito_contratos where financiamento_id = f.id and conferir;
  if k.id is null then
    return jsonb_build_object('ok', true, 'tem_banco', false);
  end if;
  select * into t from openfinance_credito_retratos where cliente_id = k.cliente_id and loan_id = k.loan_id order by lido_em desc limit 1;

  -- tradução do banco para a língua do sistema (o que não se traduz fica nulo = "sem dado do banco")
  v_sis := case t.sistema when 'SAC' then 'sac' when 'PRICE' then 'price'
                          when 'WITHOUT_AMORTIZATION_SYSTEM' then case when coalesce(t.parcelas_total, 0) <= 1 then 'bullet' else 'livre' end end;
  v_per := case t.periodicidade when 'MONTHLY' then 'mensal' when 'QUARTERLY' then 'trimestral' when 'SEMESTERLY' then 'semestral'
                                when 'YEARLY' then 'anual' end;
  v_fin := case upper(coalesce(t.modalidade, '')) when 'CUSTEIO' then 'custeio' when 'INVESTIMENTO' then 'investimento'
                                                  when 'COMERCIALIZACAO' then 'comercializacao' end;
  select round(100 * (x ->> 'preFixedRate')::numeric, 4) into v_taxa_banco
    from jsonb_array_elements(t.taxas) x
   where x ->> 'preFixedRate' is not null and coalesce(x ->> 'taxPeriodicity', 'YEARLY') in ('YEARLY', 'AA') limit 1;

  -- campo a campo: sistema × banco × situação (usar = só quando o sistema está VAZIO, M3)
  v_campos := jsonb_build_array(
    jsonb_build_object('campo', 'numero_contrato', 'sistema', f.numero_contrato, 'banco', t.contrato_numero,
      'situacao', case when t.contrato_numero is null then 'sem_dado_do_banco' when nullif(btrim(coalesce(f.numero_contrato, '')), '') is null then 'vazio_no_sistema'
                       when _fn_openfinance_so_digitos(f.numero_contrato) = _fn_openfinance_so_digitos(t.contrato_numero) then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'finalidade', 'sistema', f.finalidade, 'banco', v_fin,
      'situacao', case when v_fin is null then 'sem_dado_do_banco' when f.finalidade is null then 'vazio_no_sistema'
                       when f.finalidade = v_fin then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'data_contrato', 'sistema', f.data_contrato, 'banco', t.data_contrato,
      'situacao', case when t.data_contrato is null then 'sem_dado_do_banco' when f.data_contrato is null then 'vazio_no_sistema'
                       when f.data_contrato = t.data_contrato then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'vencimento_final', 'sistema', f.vencimento_final, 'banco', t.vencimento_final,
      'situacao', case when t.vencimento_final is null then 'sem_dado_do_banco' when f.vencimento_final is null then 'vazio_no_sistema'
                       when f.vencimento_final = t.vencimento_final then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'valor_contratado', 'sistema', f.valor_total, 'banco', t.contratado,
      'situacao', case when t.contratado is null then 'sem_dado_do_banco' when f.valor_total is null then 'vazio_no_sistema'
                       when abs(f.valor_total - t.contratado) < 0.005 then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'taxa_aa', 'sistema', nullif(f.taxa_juros, 0), 'banco', v_taxa_banco, 'cet', t.cet,
      'situacao', case when v_taxa_banco is null then 'sem_dado_do_banco' when coalesce(f.taxa_juros, 0) = 0 then 'vazio_no_sistema'
                       when abs(f.taxa_juros - v_taxa_banco) < 0.00005 then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'sistema_amortizacao', 'sistema', f.sistema_amortizacao, 'banco', v_sis,
      'situacao', case when v_sis is null then 'sem_dado_do_banco' when f.sistema_amortizacao is null then 'vazio_no_sistema'
                       when f.sistema_amortizacao = v_sis then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'periodicidade', 'sistema', f.periodicidade, 'banco', v_per,
      'situacao', case when v_per is null then 'sem_dado_do_banco' when f.periodicidade is null then 'vazio_no_sistema'
                       when f.periodicidade = v_per then 'confere' else 'diferente' end));

  -- saldo: o nosso é liberado − amortizado; o do banco é "para quitar" (inclui juros até a data do banco). M2: diferença só de
  -- juros corridos (banco ≥ nosso, até os juros ainda não pagos) = 'diferente_juros', vermelho sem pendência.
  s := public._fn_financiamento_saldo(f.id, current_date);
  v_saldo := (s ->> 'saldo')::numeric;
  v_jprev := coalesce((s ->> 'juros_previstos')::numeric, 0);
  v_sit := case when t.para_quitar is null then 'sem_dado_do_banco' when v_saldo is null then 'vazio_no_sistema'
                when abs(v_saldo - t.para_quitar) < 0.005 then 'confere'
                when t.para_quitar > v_saldo and t.para_quitar - v_saldo <= v_jprev + 0.005 then 'diferente_juros'
                else 'diferente' end;
  v_campos := v_campos || jsonb_build_array(
    jsonb_build_object('campo', 'saldo_devedor', 'sistema', v_saldo, 'banco', t.para_quitar, 'situacao', v_sit),
    jsonb_build_object('campo', 'parcelas_pagas', 'sistema',
      (select count(*) from financiamento_parcelas q where q.financiamento_id = f.id and q.status = 'pago'), 'banco', t.parcelas_pagas,
      'situacao', case when t.parcelas_pagas is null then 'sem_dado_do_banco'
                       when (select count(*) from financiamento_parcelas q where q.financiamento_id = f.id and q.status = 'pago') = t.parcelas_pagas
                       then 'confere' else 'diferente' end),
    jsonb_build_object('campo', 'parcelas_vencidas', 'sistema',
      (select count(*) from financiamento_parcelas q where q.financiamento_id = f.id and q.status = 'pendente' and q.data_vencimento < current_date
          and not coalesce(q.adiada, false)), 'banco', t.parcelas_vencidas,
      'situacao', case when t.parcelas_vencidas is null then 'sem_dado_do_banco'
                       when (select count(*) from financiamento_parcelas q where q.financiamento_id = f.id and q.status = 'pendente'
                               and q.data_vencimento < current_date and not coalesce(q.adiada, false)) = t.parcelas_vencidas
                       then 'confere' else 'diferente' end));

  -- parcelas do sistema × balão do banco (mesma data ±3 dias) × pagamento do banco (±3 dias do pagamento ou do vencimento)
  for p in select q.numero_parcela, q.data_vencimento, q.valor_total, q.status, q.data_pagamento
             from financiamento_parcelas q where q.financiamento_id = f.id and q.status <> 'cancelado' order by q.numero_parcela loop
    b := null; pg := null;
    select x into b from jsonb_array_elements(t.baloes) x
     where abs(left(x ->> 'dueDate', 10)::date - p.data_vencimento) <= 3 limit 1;
    select x into pg from jsonb_array_elements(t.pagamentos) x
     where abs(left(x ->> 'paidDate', 10)::date - coalesce(p.data_pagamento, p.data_vencimento)) <= 3 limit 1;
    v_parcelas := v_parcelas || jsonb_build_object('parcela', p.numero_parcela, 'vencimento', p.data_vencimento,
      'valor', p.valor_total, 'status', p.status,
      'banco_vencimento', left(b ->> 'dueDate', 10), 'banco_valor', (b #>> '{amount,value}')::numeric,
      'pago_no_banco', left(pg ->> 'paidDate', 10), 'pago_valor', (pg ->> 'paidAmount')::numeric,
      'situacao', case when b is not null and abs(p.valor_total - (b #>> '{amount,value}')::numeric) >= 0.005 then 'valor_diferente'
                       when p.status = 'pago' and pg is null and jsonb_array_length(t.pagamentos) > 0 then 'pago_so_no_sistema'
                       when p.status <> 'pago' and pg is not null then 'pago_no_banco'
                       when p.status = 'pago' and pg is not null then 'pago_confere'
                       else 'sem_dado_do_banco' end);
  end loop;
  -- pagamento do banco sem parcela do sistema (D4: nunca vira lançamento; vai para "A resolver")
  select coalesce(jsonb_agg(x), '[]') into v_sem_parcela from jsonb_array_elements(t.pagamentos) x
   where not exists (select 1 from financiamento_parcelas q where q.financiamento_id = f.id and q.status <> 'cancelado'
                       and abs(left(x ->> 'paidDate', 10)::date - coalesce(q.data_pagamento, q.data_vencimento)) <= 3);

  return jsonb_build_object('ok', true, 'tem_banco', true, 'loan_id', t.loan_id, 'lido_em', t.lido_em, 'kind', t.kind,
    'modalidade', t.modalidade, 'campos', v_campos, 'parcelas', v_parcelas, 'pagamentos_sem_parcela', v_sem_parcela,
    'pendencias', (select count(*) from jsonb_array_elements(v_campos) c where c ->> 'situacao' = 'diferente')
                + (select count(*) from jsonb_array_elements(v_parcelas) c where c ->> 'situacao' in ('valor_diferente', 'pago_no_banco', 'pago_so_no_sistema'))
                + jsonb_array_length(v_sem_parcela));
end $$;
revoke all on function public.fn_openfinance_credito_conferencia(uuid) from public, anon;
grant execute on function public.fn_openfinance_credito_conferencia(uuid) to authenticated;
