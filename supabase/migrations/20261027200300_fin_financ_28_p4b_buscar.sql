-- FIN-FINANC-28 · PASSO 4b — BUSCAR ENTRADAS (liberacoes) E PAGAMENTOS (parcelas) NO CONTRATO DE CREDITO, como na OC (Gabriel, 17/10/2026).
--
-- FASE 0 (medido em 17/10/2026):
--   · O padrao da OC: o banco SUGERE (`oc_candidatas_vinculo`, `oc_recebimentos_vinculaveis`) com pontos e marca, e o banco DECIDE no
--     vincular, que tem `p_simular` (a previa e' a propria gravacao desfeita). Aqui e' o mesmo desenho, sem motor paralelo:
--     uma leitura de candidatas por contrato (alvo 'liberacao' ou 'parcela') e um vincular / desvincular com simulacao.
--   · LIBERACAO: o gravador ja' existe (`fn_financiamento_liberacao_salvar`, passo 4: "em conta" APONTA para a entrada). Esta migration
--     so' acrescenta a leitura das candidatas; a tela grava por ele.
--   · ENCARGOS: o par ja' existe (`fn_contrato_encargos_vinculaveis` / `fn_contrato_encargo_vincular`, FIN-CONTRATO-VINCULAR-ENCARGO-01).
--     Nada novo no banco; a tela sugere os encargos do credor perto da liberacao por eles.
--   · PARCELA: o motor `fn_reconciliar_parcela_financiamento` (md5 368310fa…) EMPURRA a parcela para o lancamento — valor, credor no
--     favorecido, status, vencimento, plano fixo de amortizacao/juros, conta — e CANCELA o lancamento cuja origem nao e' a dele. Um
--     pagamento do operador apontado como lancamento da parcela seria reescrito (ou cancelado) na proxima chamada do motor. Por isso:
--       (1) a TRILHA `financiamento_parcela_vinculos` registra o vinculo do operador (antes, para o desfazer);
--       (2) o motor PULA a parcela com vinculo vivo (patch guardado por md5, 1 ancora) — nessa parcela quem manda e' o lancamento;
--       (3) `_fn_parcela_acompanha_lancamento` (fda1bfda…) nao reparte o lancamento que paga o TOTAL da parcela (patch, 1 ancora).
--     O vinculo NAO escreve no lancamento do operador nada alem de `financiamento_id` (o selo F da lista e a regra do encargo leem
--     dele): valor, datas, status, conta, classificacao e favorecido ficam. A parcela acompanha o lancamento (o dono de sempre).
--     O lancamento programado que a parcela tinha e' CANCELADO pelo dono (`fn_cancelar_lancamento_auditoria`), nunca apagado.
--     DESVINCULAR devolve a parcela ao estado de antes (a foto da trilha), tira o `financiamento_id` posto pelo vinculo e chama o
--     MOTOR para recriar o lancamento programado (o mesmo caminho do cadastro). O gatilho de quitacao do P3-FIX4 segue sozinho.
--
-- FUNCOES NOVAS (SECURITY DEFINER, search_path = pg_catalog, public; guarda pelo cliente do CONTRATO, 42501; REVOKE de PUBLIC e anon):
--   fn_financiamento_candidatas(contrato, alvo, parcela)                 LEITURA — authenticated
--   fn_financiamento_parcela_vincular(parcela, lancamento, papel, mover, simular)   authenticated
--   fn_financiamento_parcela_desvincular(vinculo, motivo, simular)                  authenticated (o GESTO CONTRARIO)
--   _fn_financiamento_parcela_vincular_exec / _desvincular_exec          internas, so' service_role
-- Nenhum dado de cliente e' alterado por esta migration (a tabela nasce vazia).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. A trilha do vinculo do operador --------------------------------------------------------------------------------------------
create table if not exists public.financiamento_parcela_vinculos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  financiamento_id uuid not null references public.financiamentos(id) on delete restrict,
  parcela_id uuid not null references public.financiamento_parcelas(id) on delete restrict,
  lancamento_id uuid not null references public.financeiro_lancamentos_v2(id) on delete restrict,
  papel text not null check (papel in ('principal', 'juros', 'total')),
  antes jsonb not null,
  vinculado_em timestamptz not null default now(),
  vinculado_por uuid,
  desfeito_em timestamptz,
  desfeito_por uuid,
  desfeito_motivo text,
  constraint fin_parcela_vinculo_desfeito_chk check ((desfeito_em is null and desfeito_motivo is null) or (desfeito_em is not null and desfeito_motivo is not null))
);
create unique index if not exists uq_fin_parcela_vinculo_vivo_lanc on public.financiamento_parcela_vinculos (lancamento_id) where desfeito_em is null;
create unique index if not exists uq_fin_parcela_vinculo_vivo_papel on public.financiamento_parcela_vinculos (parcela_id, papel) where desfeito_em is null;
create index if not exists idx_fin_parcela_vinculo_contrato on public.financiamento_parcela_vinculos (financiamento_id);
alter table public.financiamento_parcela_vinculos enable row level security;
drop policy if exists fin_parcela_vinculos_select on public.financiamento_parcela_vinculos;
create policy fin_parcela_vinculos_select on public.financiamento_parcela_vinculos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_parcela_vinculos from public, anon;
grant select on public.financiamento_parcela_vinculos to authenticated;
grant all on public.financiamento_parcela_vinculos to service_role;

-- 2. O nome do credor dentro da descricao (palavras de 4+ letras, fora as genericas). So' MARCA e ordena; nunca decide sozinho.
create or replace function public._fn_credor_na_descricao(p_credor uuid, p_descricao text)
returns boolean
language sql stable set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.financeiro_fornecedores fo,
           regexp_split_to_table(upper(public.unaccent(coalesce(fo.nome, ''))), '[^A-Z0-9]+') w
     where fo.id = p_credor and length(w) >= 4
       and w not in ('BANCO', 'BANK', 'LTDA', 'CREDITO', 'COOPERATIVA', 'COOP', 'SOCIEDADE', 'ANONIMA', 'AGENCIA', 'INVESTIMENTO',
                     'INVESTIMENTOS', 'DESENVOLVIMENTO', 'NACIONAL', 'CENTRAL', 'FINANCEIRA', 'SERVICOS', 'COMERCIO', 'PARTICIPACOES')
       and position(w in upper(public.unaccent(coalesce(p_descricao, '')))) > 0)
$$;
revoke all on function public._fn_credor_na_descricao(uuid, text) from public, anon, authenticated;
grant execute on function public._fn_credor_na_descricao(uuid, text) to service_role;

-- 3. Leitura: as candidatas ------------------------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_candidatas(p_financiamento_id uuid, p_alvo text, p_parcela_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan
as $$
declare
  f public.financiamentos%rowtype;
  q public.financiamento_parcelas%rowtype;
  v_saldo_lib numeric;
  v_planos uuid[];
  v_lin jsonb;
begin
  f := public._fn_contrato_do_usuario(p_financiamento_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Compra parcelada não busca entradas nem pagamentos por aqui.'; end if;

  if p_alvo = 'liberacao' then
    v_saldo_lib := round(coalesce(f.valor_total, 0) - coalesce((select sum(o.valor) from public.financiamento_liberacoes o
                                                   where o.financiamento_id = f.id and o.cancelado_em is null), 0), 2);
    select array_agg(id) into v_planos from public.financeiro_plano_contas where cliente_id is null and ordem_exibicao in (4030, 4040, 4050);
    with base as (
      select l.id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) as dt, round(abs(l.valor), 2) as valor,
             l.descricao, l.status_transacao, l.favorecido_id, coalesce(l.conta_destino_id, l.conta_bancaria_id) as conta_id,
             (l.plano_conta_id = any(v_planos)) as m_plano,
             (l.favorecido_id is not distinct from f.credor_id and f.credor_id is not null) as m_credor,
             public._fn_numero_na_descricao(f.numero_contrato, regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g')) as m_numero,
             public._fn_credor_na_descricao(f.credor_id, l.descricao) as m_nome,
             (l.status_transacao = 'conciliado' or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null)) as extrato
        from public.financeiro_lancamentos_v2 l
       where l.cliente_id = f.cliente_id and l.cancelado is not true and coalesce(l.tipo_operacao, '') like '1-%'
         and (l.financiamento_id is null or l.financiamento_id = f.id)
         and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia)
             between coalesce(f.data_contrato, f.data_inicio, current_date) - 30 and coalesce(f.data_contrato, f.data_inicio, current_date) + 365
         and not exists (select 1 from public.financiamento_liberacoes o where o.lancamento_id = l.id and o.cancelado_em is null)
         and not exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada)
    ), pontuada as (
      select b.*,
             abs(b.dt - coalesce(f.data_contrato, f.data_inicio, b.dt)) as dias,
             (b.valor = v_saldo_lib and v_saldo_lib > 0) as v_saldo,
             (b.valor = round(coalesce(f.valor_total, 0), 2)) as v_contrato,
             (b.valor < v_saldo_lib) as v_cabe,
             (b.conta_id is not distinct from f.conta_bancaria_id and f.conta_bancaria_id is not null) as m_conta
        from base b
       where b.m_plano or b.m_credor or b.m_numero or b.m_nome
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'lancamento_id', p.id, 'data', p.dt, 'valor', p.valor, 'descricao', p.descricao, 'status_transacao', p.status_transacao,
             'conta', (select coalesce(c.nome_exibicao, c.nome_conta) from public.financeiro_contas_bancarias c where c.id = p.conta_id),
             'favorecido', (select fo.nome from public.financeiro_fornecedores fo where fo.id = p.favorecido_id),
             'extrato', p.extrato, 'dias', p.dias,
             'pontos', (case when p.v_saldo then 50 when p.v_contrato then 45 when p.v_cabe then 10 else 0 end)
                       + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                       + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                       + (case when p.m_conta then 10 else 0 end) + (case when p.extrato then 5 else 0 end) - least(p.dias / 15, 30),
             'motivos', to_jsonb(array_remove(array[
                 case when p.v_saldo then 'valor = o que falta liberar' when p.v_contrato then 'valor = o do contrato'
                      when p.v_cabe then 'cabe no que falta liberar' end,
                 case when p.m_numero then 'nº do contrato na descrição' end,
                 case when p.m_credor then 'favorecido = credor' end,
                 case when p.m_plano then 'entrada de financiamento' end,
                 case when p.m_nome then 'nome do credor na descrição' end,
                 case when p.m_conta then 'conta do contrato' end,
                 case when p.extrato then 'casado com o extrato' end], null)))
           order by (case when p.v_saldo then 50 when p.v_contrato then 45 when p.v_cabe then 10 else 0 end)
                    + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                    + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                    + (case when p.m_conta then 10 else 0 end) + (case when p.extrato then 5 else 0 end) - least(p.dias / 15, 30) desc,
                    p.dias, p.id), '[]'::jsonb)
      into v_lin
      from (select * from pontuada order by dias limit 200) p;
    return jsonb_build_object('alvo', 'liberacao', 'saldo_a_liberar', v_saldo_lib,
      'de', coalesce(f.data_contrato, f.data_inicio, current_date) - 30, 'ate', coalesce(f.data_contrato, f.data_inicio, current_date) + 365,
      'linhas', v_lin);

  elsif p_alvo = 'parcela' then
    select * into q from public.financiamento_parcelas where id = p_parcela_id and financiamento_id = f.id;
    if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
    select array_agg(id) into v_planos from public.financeiro_plano_contas
     where cliente_id is null and ordem_exibicao in (16010, 16020, 16030, 7010, 12010, 20310, 6040, 21090);
    with alvos as (
      select 'principal'::text as papel, round(coalesce(q.valor_principal, 0), 2) as alvo
      union all select 'juros', round(coalesce(q.valor_juros, 0), 2)
      union all select 'total', round(coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0), 2)
    ), base as (
      select l.id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) as dt, round(abs(l.valor), 2) as valor,
             l.descricao, l.status_transacao, l.favorecido_id, l.conta_bancaria_id as conta_id,
             (l.plano_conta_id = any(v_planos)) as m_plano,
             (l.favorecido_id is not distinct from f.credor_id and f.credor_id is not null) as m_credor,
             public._fn_numero_na_descricao(f.numero_contrato, regexp_replace(coalesce(l.descricao, ''), '\D', '', 'g')) as m_numero,
             public._fn_credor_na_descricao(f.credor_id, l.descricao) as m_nome,
             (l.status_transacao = 'conciliado' or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null)) as extrato,
             l.financiamento_id
        from public.financeiro_lancamentos_v2 l
       where l.cliente_id = f.cliente_id and l.cancelado is not true and coalesce(l.tipo_operacao, '') like '2-%'
         and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) between q.data_vencimento - 45 and q.data_vencimento + 45
         and not exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada)
         -- os lancamentos das parcelas DESTE contrato sao dele: nao sao candidatos (o da propria parcela, menos ainda)
         and not exists (select 1 from public.financiamento_parcelas x where x.financiamento_id = f.id and x.status is distinct from 'cancelado'
                           and (x.lancamento_id = l.id or x.lancamento_juros_id = l.id)
                           and not exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null))
         and not exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.parcela_id = q.id and v.desfeito_em is null)
    ), perto as (
      select b.*, a.papel, a.alvo, round(b.valor - a.alvo, 2) as diferenca,
             row_number() over (partition by b.id order by abs(b.valor - a.alvo), case a.papel when 'total' then 0 when 'principal' then 1 else 2 end) as rn
        from base b join alvos a on a.alvo > 0 and abs(b.valor - a.alvo) <= a.alvo * 0.10
       where b.m_plano or b.m_credor or b.m_numero or b.m_nome
    ), pontuada as (
      select p.*, abs(p.dt - q.data_vencimento) as dias,
             -- onde o lancamento ja' esta' (outro contrato, outra parcela, encargo)
             (select jsonb_build_object('tipo', 'parcela_vinculada', 'vinculo_id', v.id, 'financiamento_id', v.financiamento_id,
                       'numero_contrato', f2.numero_contrato, 'descricao', f2.descricao, 'parcela', x.numero_parcela, 'movivel', true)
                from public.financiamento_parcela_vinculos v join public.financiamentos f2 on f2.id = v.financiamento_id
                join public.financiamento_parcelas x on x.id = v.parcela_id
               where v.lancamento_id = p.id and v.desfeito_em is null) as em_vinculo,
             (select jsonb_build_object('tipo', 'encargo', 'encargo_id', e.id, 'financiamento_id', e.financiamento_id,
                       'numero_contrato', f2.numero_contrato, 'descricao', f2.descricao, 'parcela', null, 'movivel', true)
                from public.financiamento_encargos e join public.financiamentos f2 on f2.id = e.financiamento_id
               where e.lancamento_id = p.id and e.desfeito_em is null) as em_encargo,
             (select jsonb_build_object('tipo', 'parcela_do_contrato', 'financiamento_id', x.financiamento_id,
                       'numero_contrato', f2.numero_contrato, 'descricao', f2.descricao, 'parcela', x.numero_parcela, 'movivel', false)
                from public.financiamento_parcelas x join public.financiamentos f2 on f2.id = x.financiamento_id
               where x.financiamento_id <> f.id and x.status is distinct from 'cancelado' and (x.lancamento_id = p.id or x.lancamento_juros_id = p.id)
               limit 1) as em_parcela
        from perto p where p.rn = 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'lancamento_id', p.id, 'data', p.dt, 'valor', p.valor, 'descricao', p.descricao, 'status_transacao', p.status_transacao,
             'conta', (select coalesce(c.nome_exibicao, c.nome_conta) from public.financeiro_contas_bancarias c where c.id = p.conta_id),
             'favorecido', (select fo.nome from public.financeiro_fornecedores fo where fo.id = p.favorecido_id),
             'extrato', p.extrato, 'dias', p.dias, 'papel_sugerido', p.papel, 'previsto', p.alvo, 'diferenca', p.diferenca,
             'outro', coalesce(p.em_vinculo, p.em_encargo, p.em_parcela,
                        case when p.financiamento_id is not null and p.financiamento_id <> f.id then
                          (select jsonb_build_object('tipo', 'outro_contrato', 'financiamento_id', f2.id, 'numero_contrato', f2.numero_contrato,
                                    'descricao', f2.descricao, 'parcela', null, 'movivel', false)
                             from public.financiamentos f2 where f2.id = p.financiamento_id) end),
             'pontos', (case when p.diferenca = 0 then 50 when abs(p.diferenca) <= p.alvo * 0.01 then 30 else 10 end)
                       + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                       + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                       + (case when p.extrato then 5 else 0 end) - p.dias / 3,
             'motivos', to_jsonb(array_remove(array[
                 case when p.diferenca = 0 then 'valor = ' || case p.papel when 'total' then 'total' when 'principal' then 'principal' else 'juros' end
                      else 'valor próximo do ' || case p.papel when 'total' then 'total' when 'principal' then 'principal' else 'juros' end end,
                 case when p.m_numero then 'nº do contrato na descrição' end,
                 case when p.m_credor then 'favorecido = credor' end,
                 case when p.m_plano then 'conta de amortização / juros' end,
                 case when p.m_nome then 'nome do credor na descrição' end,
                 case when p.extrato then 'casado com o extrato' end], null)))
           order by (case when p.diferenca = 0 then 50 when abs(p.diferenca) <= p.alvo * 0.01 then 30 else 10 end)
                    + (case when p.m_numero then 40 else 0 end) + (case when p.m_credor then 30 else 0 end)
                    + (case when p.m_plano then 20 else 0 end) + (case when p.m_nome then 15 else 0 end)
                    + (case when p.extrato then 5 else 0 end) - p.dias / 3 desc, p.dias, p.id), '[]'::jsonb)
      into v_lin
      from (select * from pontuada order by dias limit 200) p;
    return jsonb_build_object('alvo', 'parcela', 'parcela', jsonb_build_object('id', q.id, 'numero', q.numero_parcela,
        'vencimento', q.data_vencimento, 'principal', q.valor_principal, 'juros', q.valor_juros,
        'total', round(coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0), 2)),
      'de', q.data_vencimento - 45, 'ate', q.data_vencimento + 45, 'linhas', v_lin);
  end if;
  raise exception using errcode = 'P0001', message = 'Alvo da busca inválido (liberacao ou parcela).';
end $$;

-- 4. Vincular o pagamento a' parcela (interna: grava; a publica simula ou grava) --------------------------------------------------
create or replace function public._fn_financiamento_parcela_vincular_exec(p_parcela_id uuid, p_lancamento_id uuid, p_papel text, p_mover boolean)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  q public.financiamento_parcelas%rowtype;
  f public.financiamentos%rowtype;
  l public.financeiro_lancamentos_v2%rowtype;
  v_atual uuid; v_juros_atual uuid; v_cancelar uuid[] := '{}'; v_id uuid; v_x uuid;
  v_ant jsonb; v_avisos jsonb := '[]'::jsonb; v_movido jsonb; v_prev numeric; v_pagos boolean;
  r record;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela_id;
  if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(q.financiamento_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Parcela de compra parcelada se paga pelo lançamento dela.'; end if;
  if f.status = 'cancelado' then raise exception using errcode = 'P0001', message = 'Contrato cancelado: não recebe pagamento.'; end if;
  if q.status = 'cancelado' then raise exception using errcode = 'P0001', message = 'Esta parcela foi retirada do contrato.'; end if;
  if p_papel is null or p_papel not in ('principal', 'juros', 'total') then
    raise exception using errcode = 'P0001', message = 'Escolha se o pagamento é do principal, dos juros ou da parcela inteira.';
  end if;
  if p_papel = 'juros' and coalesce(q.valor_juros, 0) <= 0 then raise exception using errcode = 'P0001', message = 'Esta parcela não tem juros.'; end if;

  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento_id;
  if not found or l.cliente_id <> f.cliente_id then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if coalesce(l.cancelado, false) then raise exception using errcode = 'P0001', message = 'O lançamento escolhido está cancelado.'; end if;
  if coalesce(l.tipo_operacao, '') not like '2-%' then raise exception using errcode = 'P0001', message = 'O pagamento da parcela tem de ser uma saída.'; end if;
  if exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada) then
    raise exception using errcode = 'P0001', message = 'Este lançamento é de operação comercial: desvincule-o na OC antes.';
  end if;
  if q.lancamento_id = l.id or q.lancamento_juros_id = l.id then
    raise exception using errcode = 'P0001', message = 'Este lançamento já é o desta parcela.';
  end if;

  -- onde o lancamento ja' esta'
  if exists (select 1 from public.financiamento_parcelas x where x.status is distinct from 'cancelado' and (x.lancamento_id = l.id or x.lancamento_juros_id = l.id)
               and not exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null)) then
    select x.numero_parcela, f2.numero_contrato, f2.descricao into r from public.financiamento_parcelas x join public.financiamentos f2 on f2.id = x.financiamento_id
     where x.status is distinct from 'cancelado' and (x.lancamento_id = l.id or x.lancamento_juros_id = l.id) limit 1;
    raise exception using errcode = 'P0001', message = format('Este lançamento é a parcela %s do contrato %s: ajuste por aquele contrato.',
      r.numero_parcela, coalesce(nullif(r.numero_contrato, ''), r.descricao));
  end if;
  select v.id, v.financiamento_id, x.numero_parcela, f2.numero_contrato, f2.descricao into r
    from public.financiamento_parcela_vinculos v join public.financiamento_parcelas x on x.id = v.parcela_id
    join public.financiamentos f2 on f2.id = v.financiamento_id
   where v.lancamento_id = l.id and v.desfeito_em is null;
  if found then
    if not coalesce(p_mover, false) then
      raise exception using errcode = 'P0001', message = format('Este lançamento já paga a parcela %s do contrato %s. Confirme para mover.',
        r.numero_parcela, coalesce(nullif(r.numero_contrato, ''), r.descricao));
    end if;
    v_x := r.id;
    v_movido := jsonb_build_object('tipo', 'parcela_vinculada', 'financiamento_id', r.financiamento_id, 'parcela', r.numero_parcela,
      'desvinculo', public._fn_financiamento_parcela_desvincular_exec(v_x, format('movido para a parcela %s do contrato %s', q.numero_parcela,
        coalesce(nullif(f.numero_contrato, ''), f.descricao))));
  end if;
  select e.id, e.financiamento_id, f2.numero_contrato, f2.descricao into r from public.financiamento_encargos e
    join public.financiamentos f2 on f2.id = e.financiamento_id where e.lancamento_id = l.id and e.desfeito_em is null;
  if found then
    if not coalesce(p_mover, false) then
      raise exception using errcode = 'P0001', message = format('Este lançamento é encargo do contrato %s. Confirme para mover.',
        coalesce(nullif(r.numero_contrato, ''), r.descricao));
    end if;
    perform public.fn_contrato_encargo_desvincular(r.id, format('movido para a parcela %s do contrato %s', q.numero_parcela,
      coalesce(nullif(f.numero_contrato, ''), f.descricao)), false);
    v_movido := jsonb_build_object('tipo', 'encargo', 'financiamento_id', r.financiamento_id, 'encargo_id', r.id);
  end if;
  if l.financiamento_id is not null and l.financiamento_id <> f.id and v_movido is null then
    raise exception using errcode = 'P0001', message = 'Este lançamento pertence a outro contrato.';
  end if;

  -- o lugar na parcela: o lancamento que esta' la' tem de estar em aberto (pago ou casado com o extrato nao se troca)
  v_atual := case when p_papel in ('principal', 'total') then q.lancamento_id end;
  v_juros_atual := case when p_papel in ('juros', 'total') then q.lancamento_juros_id end;
  for r in select x.id, x.status_transacao, x.cancelado from public.financeiro_lancamentos_v2 x where x.id in (v_atual, v_juros_atual) loop
    if not coalesce(r.cancelado, false) then
      if r.status_transacao in ('realizado', 'conciliado') or public._fin_lancamento_casado_com_extrato(r.id) then
        raise exception using errcode = 'P0001', message = format('A parcela %s já tem um lançamento pago neste lugar: desvincule ou estorne antes.', q.numero_parcela);
      end if;
      v_cancelar := v_cancelar || r.id;
    end if;
  end loop;
  if exists (select 1 from public.financiamento_parcela_vinculos v where v.parcela_id = q.id and v.desfeito_em is null
               and (v.papel = p_papel or v.papel = 'total' or p_papel = 'total')) then
    raise exception using errcode = 'P0001', message = format('A parcela %s já tem pagamento vinculado neste lugar: desvincule antes.', q.numero_parcela);
  end if;

  v_ant := jsonb_build_object('parcela', jsonb_build_object('valor_principal', q.valor_principal, 'valor_juros', q.valor_juros,
             'valor_total', q.valor_total, 'status', q.status, 'data_pagamento', q.data_pagamento,
             'lancamento_id', q.lancamento_id, 'lancamento_juros_id', q.lancamento_juros_id),
           'lancamento', jsonb_build_object('financiamento_id', l.financiamento_id),
           'cancelados', to_jsonb(v_cancelar), 'movido', v_movido);

  -- avisos (nao recusam)
  v_prev := round(case p_papel when 'principal' then coalesce(q.valor_principal, 0) when 'juros' then coalesce(q.valor_juros, 0)
                  else coalesce(q.valor_principal, 0) + coalesce(q.valor_juros, 0) end, 2);
  if round(abs(l.valor), 2) <> v_prev then
    v_avisos := v_avisos || jsonb_build_object('aviso', 'valor_diferente', 'previsto', v_prev, 'lancamento', round(abs(l.valor), 2),
      'diferenca', round(abs(l.valor), 2) - v_prev);
  end if;
  if l.favorecido_id is distinct from f.credor_id then v_avisos := v_avisos || jsonb_build_object('aviso', 'favorecido_diferente'); end if;
  if l.status_transacao not in ('realizado', 'conciliado') then v_avisos := v_avisos || jsonb_build_object('aviso', 'nao_realizado'); end if;
  if abs(coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) - q.data_vencimento) > 45 then
    v_avisos := v_avisos || jsonb_build_object('aviso', 'data_longe_do_vencimento');
  end if;

  insert into public.financiamento_parcela_vinculos (cliente_id, financiamento_id, parcela_id, lancamento_id, papel, antes, vinculado_por)
  values (f.cliente_id, f.id, q.id, l.id, p_papel, v_ant, auth.uid()) returning id into v_id;

  -- a parcela aponta para o pagamento; o lancamento ganha so' o contrato
  update public.financiamento_parcelas set
    lancamento_id = case when p_papel in ('principal', 'total') then l.id else lancamento_id end,
    lancamento_juros_id = case when p_papel = 'juros' then l.id when p_papel = 'total' then null else lancamento_juros_id end
   where id = q.id;
  update public.financeiro_lancamentos_v2 set financiamento_id = f.id where id = l.id and financiamento_id is distinct from f.id;
  -- o programado que estava no lugar sai pelo dono do cancelamento (com motivo; nunca apagado)
  foreach v_x in array v_cancelar loop
    perform public.fn_cancelar_lancamento_auditoria(v_x, format('substituído pelo pagamento vinculado à parcela %s', q.numero_parcela));
  end loop;
  -- o valor da parcela acompanha o lancamento (principal ou juros; o total nao se reparte)
  perform public._fn_parcela_acompanha_lancamento(l.id);
  -- paga = todos os lancamentos vivos da parcela realizados (a regra da situacao)
  select * into q from public.financiamento_parcelas where id = q.id;
  select bool_and(x.status_transacao in ('realizado', 'conciliado')) into v_pagos from public.financeiro_lancamentos_v2 x
   where x.id in (q.lancamento_id, q.lancamento_juros_id) and not coalesce(x.cancelado, false);
  update public.financiamento_parcelas set
    status = case when coalesce(v_pagos, false) then 'pago' else 'pendente' end,
    data_pagamento = case when coalesce(v_pagos, false) then coalesce(l.data_pagamento, data_pagamento) else null end
   where id = q.id;

  return jsonb_build_object('vinculo_id', v_id, 'parcela_id', q.id, 'numero', q.numero_parcela, 'lancamento_id', l.id, 'papel', p_papel,
    'cancelados', to_jsonb(v_cancelar), 'movido', v_movido, 'avisos', v_avisos, 'paga', coalesce(v_pagos, false));
end $$;

-- 5. Desvincular (o gesto contrario) -------------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_parcela_desvincular_exec(p_vinculo_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v public.financiamento_parcela_vinculos%rowtype;
  f public.financiamentos%rowtype;
  a jsonb; m jsonb;
begin
  select * into v from public.financiamento_parcela_vinculos where id = p_vinculo_id;
  if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(v.financiamento_id);
  if v.desfeito_em is not null then raise exception using errcode = 'P0001', message = 'Este pagamento já foi desvinculado.'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo para desvincular.'; end if;
  a := v.antes->'parcela';

  update public.financiamento_parcela_vinculos set desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = btrim(p_motivo)
   where id = v.id;
  -- a parcela volta como estava (o lugar do pagamento fica vazio: o motor recria o programado logo abaixo)
  update public.financiamento_parcelas set
    valor_principal = (a->>'valor_principal')::numeric,
    valor_juros = (a->>'valor_juros')::numeric,
    valor_total = (a->>'valor_total')::numeric,
    status = a->>'status',
    data_pagamento = (a->>'data_pagamento')::date,
    lancamento_id = case when v.papel in ('principal', 'total') and lancamento_id = v.lancamento_id then null else lancamento_id end,
    lancamento_juros_id = case when v.papel = 'juros' and lancamento_juros_id = v.lancamento_id then null else lancamento_juros_id end
   where id = v.parcela_id;
  update public.financeiro_lancamentos_v2 set financiamento_id = nullif(v.antes->'lancamento'->>'financiamento_id', '')::uuid
   where id = v.lancamento_id and financiamento_id = v.financiamento_id
     and nullif(v.antes->'lancamento'->>'financiamento_id', '')::uuid is distinct from v.financiamento_id;
  -- o motor (o mesmo do cadastro) recria o lancamento programado da parcela; pula se a parcela ainda tem outro pagamento vinculado.
  -- A parcela que NAO tinha lancamento no lugar ("paga sem lancamento") volta assim: o motor nao e' chamado (criaria um realizado).
  if (v.papel in ('principal', 'total') and nullif(a->>'lancamento_id', '') is not null)
     or (v.papel in ('juros', 'total') and nullif(a->>'lancamento_juros_id', '') is not null) then
    m := public.fn_reconciliar_parcela_financiamento(v.parcela_id, false, false, null);
  else
    m := jsonb_build_object('skip', 'sem_lancamento_antes');
  end if;
  return jsonb_build_object('vinculo_id', v.id, 'parcela_id', v.parcela_id, 'lancamento_id', v.lancamento_id, 'papel', v.papel, 'motor', m);
end $$;

-- 6. As publicas (simulacao = a gravacao desfeita) -------------------------------------------------------------------------------
create or replace function public.fn_financiamento_parcela_vincular(p_parcela_id uuid, p_lancamento_id uuid, p_papel text,
  p_mover boolean default false, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcela_vincular_exec(p_parcela_id, p_lancamento_id, p_papel, p_mover);
      raise exception using errcode = 'FPSIM', message = r::text;
    exception
      when sqlstate 'FPSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_parcela_vincular_exec(p_parcela_id, p_lancamento_id, p_papel, p_mover) || jsonb_build_object('simulado', false);
end $$;

create or replace function public.fn_financiamento_parcela_desvincular(p_vinculo_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcela_desvincular_exec(p_vinculo_id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'simulação'));
      raise exception using errcode = 'FPSIM', message = r::text;
    exception
      when sqlstate 'FPSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  return public._fn_financiamento_parcela_desvincular_exec(p_vinculo_id, p_motivo) || jsonb_build_object('simulado', false);
end $$;

-- 7. O motor pula a parcela com pagamento vinculado pelo operador: patch guardado por md5 (1 ancora) ------------------------------
do $$
declare
  v_src text; v_def text;
  c_antes constant text := '368310fa0a169b38e3a0f464801bc38e';
  c_depois constant text := '0ffca819a051703365987d9db8c9a3c6';
  c_ancora constant text := E'      ''parcela_id'',p_parcela_id,''financiamento_id'',v_contrato.id);\n  END IF;\n\n  -- PR-FIN-CPR-01 (1a)';
  c_novo constant text := E'      ''parcela_id'',p_parcela_id,''financiamento_id'',v_contrato.id);\n  END IF;\n\n'
    || E'  -- FIN-FINANC-28 passo 4b (Gabriel, 17/10/2026): parcela cujo pagamento foi VINCULADO pelo operador (Buscar pagamento) nao e''\n'
    || E'  -- deste motor — quem manda nela e'' o lancamento do operador (valor, datas, conta, classificacao). Desvincular a devolve ao motor.\n'
    || E'  IF EXISTS (SELECT 1 FROM public.financiamento_parcela_vinculos v WHERE v.parcela_id = p_parcela_id AND v.desfeito_em IS NULL) THEN\n'
    || E'    RETURN jsonb_build_object(''skip'',''pagamento_vinculado_pelo_operador'',\n'
    || E'      ''parcela_id'',p_parcela_id,''financiamento_id'',v_contrato.id);\n  END IF;\n\n  -- PR-FIN-CPR-01 (1a)';
begin
  select prosrc into v_src from pg_proc where oid = 'public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'motor: corpo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_ancora, ''))) / length(c_ancora) <> 1 then raise exception 'motor: ancora nao casa 1x'; end if;
  v_def := pg_get_functiondef('public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure);
  execute replace(v_def, c_ancora, c_novo);
  select prosrc into v_src from pg_proc where oid = 'public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure;
  if md5(v_src) <> c_depois then raise exception 'motor: destino divergente (%)', md5(v_src); end if;
end $$;

-- 8. O pagamento do TOTAL nao se reparte em principal/juros: patch guardado por md5 (1 ancora) -------------------------------------
do $$
declare
  v_src text; v_def text;
  c_antes constant text := 'fda1bfda3818b74f17307e2001d03d47';
  c_depois constant text := 'b44939abfa60ab98d9ac9eff8feee705';
  c_ancora constant text := E'     AND (q.lancamento_id = l.id OR q.lancamento_juros_id = l.id)\n';
  c_novo constant text := E'     AND (q.lancamento_id = l.id OR q.lancamento_juros_id = l.id)\n'
    || E'     -- FIN-FINANC-28 passo 4b: o lancamento que paga a parcela INTEIRA (papel total) nao reparte principal e juros\n'
    || E'     AND NOT EXISTS (SELECT 1 FROM public.financiamento_parcela_vinculos v WHERE v.parcela_id = q.id AND v.lancamento_id = l.id\n'
    || E'                       AND v.papel = ''total'' AND v.desfeito_em IS NULL)\n';
begin
  select prosrc into v_src from pg_proc where oid = 'public._fn_parcela_acompanha_lancamento(uuid)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'acompanha: corpo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_ancora, ''))) / length(c_ancora) <> 1 then raise exception 'acompanha: ancora nao casa 1x'; end if;
  v_def := pg_get_functiondef('public._fn_parcela_acompanha_lancamento(uuid)'::regprocedure);
  execute replace(v_def, c_ancora, c_novo);
  select prosrc into v_src from pg_proc where oid = 'public._fn_parcela_acompanha_lancamento(uuid)'::regprocedure;
  if md5(v_src) <> c_depois then raise exception 'acompanha: destino divergente (%)', md5(v_src); end if;
end $$;

-- 9. ACL ----------------------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.fn_financiamento_candidatas(uuid,text,uuid)',
    'public.fn_financiamento_parcela_vincular(uuid,uuid,text,boolean,boolean)',
    'public.fn_financiamento_parcela_desvincular(uuid,text,boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if has_function_privilege('anon', f::regprocedure, 'EXECUTE') then raise exception 'anon executa %', f; end if;
  end loop;
  foreach f in array array[
    'public._fn_financiamento_parcela_vincular_exec(uuid,uuid,text,boolean)',
    'public._fn_financiamento_parcela_desvincular_exec(uuid,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  if has_function_privilege('authenticated', 'public._fn_financiamento_parcela_vincular_exec(uuid,uuid,text,boolean)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_credor_na_descricao(uuid,text)'::regprocedure, 'EXECUTE') then
    raise exception 'interna aberta a authenticated';
  end if;
end $$;
